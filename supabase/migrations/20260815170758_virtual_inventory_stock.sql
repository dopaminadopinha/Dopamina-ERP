-- Virtual stock, physical inventories and auditable manual movements.
-- Zig sales remain the idempotent source of truth and are projected as stock
-- consumption instead of being copied into a second mutable ledger.

alter table public.stock_movements
  add column if not exists movement_reason text,
  add column if not exists balance_before numeric(14,4),
  add column if not exists balance_after numeric(14,4);

alter table public.stock_movements
  drop constraint if exists stock_movements_reason_valid;
alter table public.stock_movements
  add constraint stock_movements_reason_valid check (
    movement_reason is null or movement_reason in (
      'purchase', 'other_in', 'inventory_correction', 'breakage', 'waste',
      'expiration', 'courtesy', 'internal_consumption', 'operational_error',
      'loss', 'other_out'
    )
  );

alter table public.inventory_count_items
  add column if not exists unit_cost numeric(14,4);

alter table public.inventory_count_items
  drop constraint if exists inventory_count_items_cost_nonnegative;
alter table public.inventory_count_items
  add constraint inventory_count_items_cost_nonnegative
  check (unit_cost is null or unit_cost >= 0);

create index if not exists stock_movements_business_date_idx
  on public.stock_movements (business_id, occurred_at desc);
create index if not exists inventory_counts_business_date_idx
  on public.inventory_counts (business_id, counted_at desc);

create or replace function private.stock_theoretical_quantity(
  p_business_id bigint,
  p_item_id bigint,
  p_until timestamptz default now()
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(
    coalesce((
      select sum(m.quantity)
      from public.stock_movements m
      where m.business_id = p_business_id
        and m.item_id = p_item_id
        and m.occurred_at <= p_until
    ), 0)
    - coalesce((
      select sum(zi.quantity)
      from public.zig_transaction_items zi
      join public.zig_sales_transactions zt on zt.id = zi.transaction_id
      join public.items sold on sold.id = zi.item_id
      where zi.business_id = p_business_id
        and zi.item_id = p_item_id
        and sold.item_type = 'product'::public.item_type
        and sold.costing_method = 'simple'
        and not zi.is_refunded and not zt.is_refunded
        and zt.transaction_at <= p_until
    ), 0)
    - coalesce((
      select sum(
        zi.quantity * ri.quantity * (1 + ri.waste_percentage / 100) / recipe.yield_quantity
      )
      from public.zig_transaction_items zi
      join public.zig_sales_transactions zt on zt.id = zi.transaction_id
      join lateral (
        select r.id, r.yield_quantity
        from public.recipes r
        where r.business_id = p_business_id
          and r.product_id = zi.item_id
          and r.effective_from <= zt.operational_date
        order by r.effective_from desc, r.id desc
        limit 1
      ) recipe on true
      join public.recipe_items ri on ri.recipe_id = recipe.id
      where zi.business_id = p_business_id
        and ri.ingredient_id = p_item_id
        and not zi.is_refunded and not zt.is_refunded
        and zt.transaction_at <= p_until
    ), 0),
  4);
$$;

create or replace function public.record_stock_movement(
  p_business_id bigint,
  p_item_id bigint,
  p_reason text,
  p_quantity numeric,
  p_unit_cost numeric,
  p_occurred_at timestamptz,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before numeric;
  v_after numeric;
  v_signed numeric;
  v_type public.movement_type;
  v_cost numeric;
  v_id bigint;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_reason not in (
    'purchase', 'other_in', 'breakage', 'waste', 'expiration', 'courtesy',
    'internal_consumption', 'operational_error', 'loss', 'other_out'
  ) then
    raise exception 'Motivo de movimentação inválido';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Informe uma quantidade maior que zero';
  end if;

  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'O custo não pode ser negativo';
  end if;

  if not exists (
    select 1 from public.items i
    where i.id = p_item_id and i.business_id = p_business_id and i.is_active
  ) then
    raise exception 'Item não encontrado neste negócio';
  end if;

  v_before := private.stock_theoretical_quantity(p_business_id, p_item_id, coalesce(p_occurred_at, now()));
  v_signed := case when p_reason in ('purchase', 'other_in') then p_quantity else -p_quantity end;
  v_after := v_before + v_signed;
  v_type := case
    when p_reason = 'purchase' then 'purchase'::public.movement_type
    when p_reason = 'other_in' then 'adjustment_in'::public.movement_type
    when p_reason in ('breakage', 'waste', 'expiration', 'loss') then 'loss'::public.movement_type
    else 'adjustment_out'::public.movement_type
  end;

  select coalesce(
    p_unit_cost,
    (select h.unit_cost from public.item_cost_history h
      where h.item_id = p_item_id and h.effective_from <= coalesce(p_occurred_at, now())::date
      order by h.effective_from desc, h.id desc limit 1),
    i.average_unit_cost,
    i.latest_unit_cost
  ) into v_cost
  from public.items i where i.id = p_item_id;

  insert into public.stock_movements (
    business_id, item_id, movement_type, movement_reason, quantity, unit_cost,
    balance_before, balance_after, occurred_at, source_table, notes, created_by
  ) values (
    p_business_id, p_item_id, v_type, p_reason, v_signed, v_cost,
    v_before, v_after, coalesce(p_occurred_at, now()), 'manual',
    nullif(trim(p_notes), ''), (select auth.uid())
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'before', v_before, 'after', v_after,
    'difference', v_signed, 'unit_cost', v_cost
  );
end;
$$;

create or replace function public.complete_inventory_count(
  p_business_id bigint,
  p_counted_at timestamptz,
  p_items jsonb,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count_id bigint;
  v_entry jsonb;
  v_item_id bigint;
  v_system numeric;
  v_counted numeric;
  v_variance numeric;
  v_cost numeric;
  v_lines integer := 0;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um item contado';
  end if;

  if p_counted_at is null or p_counted_at > now() + interval '5 minutes' then
    raise exception 'Data da contagem inválida';
  end if;

  insert into public.inventory_counts (
    business_id, counted_at, status, notes, created_by
  ) values (
    p_business_id, p_counted_at, 'completed'::public.record_status,
    nullif(trim(p_notes), ''), (select auth.uid())
  ) returning id into v_count_id;

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_entry ->> 'item_id')::bigint;
    v_counted := (v_entry ->> 'counted_quantity')::numeric;

    if v_counted is null or v_counted < 0 or not exists (
      select 1 from public.items i
      where i.id = v_item_id and i.business_id = p_business_id and i.is_active
    ) then
      raise exception 'Revise os itens e quantidades da contagem';
    end if;

    v_system := private.stock_theoretical_quantity(p_business_id, v_item_id, p_counted_at);

    select coalesce(
      (select h.unit_cost from public.item_cost_history h
       where h.item_id = v_item_id and h.effective_from <= p_counted_at::date
       order by h.effective_from desc, h.id desc limit 1),
      i.average_unit_cost,
      i.latest_unit_cost
    ) into v_cost from public.items i where i.id = v_item_id;

    insert into public.inventory_count_items (
      inventory_count_id, item_id, system_quantity, counted_quantity, unit_cost
    ) values (v_count_id, v_item_id, v_system, v_counted, v_cost);

    v_variance := v_counted - v_system;
    if v_variance <> 0 then
      insert into public.stock_movements (
        business_id, item_id, movement_type, movement_reason, quantity, unit_cost,
        balance_before, balance_after, occurred_at, source_table, source_id,
        notes, created_by
      ) values (
        p_business_id, v_item_id, 'inventory'::public.movement_type,
        'inventory_correction', v_variance, v_cost, v_system, v_counted,
        p_counted_at, 'inventory_counts', v_count_id,
        'Ajuste gerado pela contagem física', (select auth.uid())
      );
    end if;
    v_lines := v_lines + 1;
  end loop;

  return jsonb_build_object('inventory_count_id', v_count_id, 'items', v_lines);
end;
$$;

create or replace function public.update_item_minimum_stock(
  p_business_id bigint,
  p_item_id bigint,
  p_minimum_stock numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;
  if p_minimum_stock is null or p_minimum_stock < 0 then
    raise exception 'O estoque mínimo não pode ser negativo';
  end if;
  update public.items set minimum_stock = p_minimum_stock, updated_at = now()
  where id = p_item_id and business_id = p_business_id and is_active;
  if not found then raise exception 'Item não encontrado neste negócio'; end if;
  return jsonb_build_object('item_id', p_item_id, 'minimum_stock', p_minimum_stock);
end;
$$;

create or replace function public.get_virtual_inventory_dashboard(
  p_business_id bigint,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;
  if p_period_start is null or p_period_end is null or p_period_start > p_period_end
     or p_period_end - p_period_start > 366 then
    raise exception 'Período inválido; use no máximo 367 dias';
  end if;

  with recursive_consumption as (
    select zt.operational_date, zi.item_id,
      sum(zi.quantity) as quantity, 'sale'::text as source
    from public.zig_transaction_items zi
    join public.zig_sales_transactions zt on zt.id = zi.transaction_id
    join public.items sold on sold.id = zi.item_id
    where zi.business_id = p_business_id
      and not zi.is_refunded and not zt.is_refunded
      and sold.item_type = 'product'::public.item_type
      and sold.costing_method = 'simple'
    group by zt.operational_date, zi.item_id
    union all
    select zt.operational_date, ri.ingredient_id,
      sum(zi.quantity * ri.quantity * (1 + ri.waste_percentage / 100) / recipe.yield_quantity),
      'recipe_consumption'::text
    from public.zig_transaction_items zi
    join public.zig_sales_transactions zt on zt.id = zi.transaction_id
    join lateral (
      select r.id, r.yield_quantity
      from public.recipes r
      where r.business_id = p_business_id and r.product_id = zi.item_id
        and r.effective_from <= zt.operational_date
      order by r.effective_from desc, r.id desc limit 1
    ) recipe on true
    join public.recipe_items ri on ri.recipe_id = recipe.id
    where zi.business_id = p_business_id
      and not zi.is_refunded and not zt.is_refunded
    group by zt.operational_date, ri.ingredient_id
  ), consumption_daily as (
    select operational_date, item_id, sum(quantity) quantity
    from recursive_consumption group by operational_date, item_id
  ), all_consumption as (
    select item_id, sum(quantity) quantity
    from consumption_daily group by item_id
  ), manual_balance as (
    select item_id, sum(quantity) quantity
    from public.stock_movements
    where business_id = p_business_id and occurred_at <= now()
    group by item_id
  ), friday_reference as (
    select item_id, avg(quantity) expected_quantity, count(*) reference_days
    from consumption_daily
    where operational_date >= current_date - 56
      and operational_date < current_date
      and extract(dow from operational_date) = 5
    group by item_id having count(*) >= 3
  ), item_rows as (
    select i.id::text id, i.name, i.sku,
      coalesce(c.name, 'Sem categoria') category,
      coalesce(a.name, 'Sem setor') sector,
      i.item_type::text item_type, i.consumption_unit unit,
      i.minimum_stock::numeric minimum_stock,
      round(coalesce(manual_balance.quantity, 0) - coalesce(all_consumption.quantity, 0), 4) theoretical_quantity,
      last_count.counted_quantity physical_quantity,
      last_count.variance_quantity last_variance_quantity,
      last_count.counted_at last_counted_at,
      cost.unit_cost,
      coalesce(period_consumption.quantity, 0) consumed_period,
      coalesce(baseline.has_baseline, false) has_baseline,
      reference.expected_quantity,
      reference.reference_days,
      case when reference.reference_days >= 3 then
        greatest(0, reference.expected_quantity + i.minimum_stock
          - (coalesce(manual_balance.quantity, 0) - coalesce(all_consumption.quantity, 0)))
      else null end suggested_purchase
    from public.items i
    left join public.categories c on c.id = i.category_id
    left join public.areas a on a.id = i.area_id
    left join manual_balance on manual_balance.item_id = i.id
    left join all_consumption on all_consumption.item_id = i.id
    left join lateral (
      select h.unit_cost from public.item_cost_history h
      where h.item_id = i.id and h.effective_from <= current_date
      order by h.effective_from desc, h.id desc limit 1
    ) historical_cost on true
    left join lateral (
      select coalesce(historical_cost.unit_cost, i.average_unit_cost, i.latest_unit_cost) unit_cost
    ) cost on true
    left join lateral (
      select ici.counted_quantity, ici.variance_quantity, ic.counted_at
      from public.inventory_count_items ici
      join public.inventory_counts ic on ic.id = ici.inventory_count_id
      where ici.item_id = i.id and ic.business_id = p_business_id
        and ic.status = 'completed'::public.record_status
      order by ic.counted_at desc, ici.id desc limit 1
    ) last_count on true
    left join lateral (
      select true has_baseline
      where exists (
        select 1 from public.stock_movements sm
        where sm.business_id = p_business_id and sm.item_id = i.id and sm.quantity > 0
      ) or exists (
        select 1 from public.inventory_count_items ici2
        join public.inventory_counts ic2 on ic2.id = ici2.inventory_count_id
        where ici2.item_id = i.id and ic2.business_id = p_business_id
          and ic2.status = 'completed'::public.record_status
      )
    ) baseline on true
    left join lateral (
      select sum(cd.quantity) quantity from consumption_daily cd
      where cd.item_id = i.id
        and cd.operational_date between p_period_start and p_period_end
    ) period_consumption on true
    left join friday_reference reference on reference.item_id = i.id
    where i.business_id = p_business_id and i.is_active
      and i.item_type in ('product'::public.item_type, 'ingredient'::public.item_type, 'consumable'::public.item_type)
  ), enriched_items as (
    select ir.*,
      case
        when not ir.has_baseline then 'insufficient_data'
        when coalesce(ir.last_variance_quantity, 0) <> 0 then 'divergence'
        when ir.theoretical_quantity <= 0 then 'out'
        when ir.minimum_stock > 0 and ir.theoretical_quantity < ir.minimum_stock then 'below_minimum'
        when ir.minimum_stock > 0 and ir.theoretical_quantity <= ir.minimum_stock * 1.25 then 'low'
        else 'normal'
      end status,
      case when ir.has_baseline and ir.unit_cost is not null
        then greatest(ir.theoretical_quantity, 0) * ir.unit_cost else null end stock_value,
      case when ir.last_variance_quantity is not null and ir.unit_cost is not null
        then ir.last_variance_quantity * ir.unit_cost else null end variance_value
    from item_rows ir
  ), manual_movements as (
    select 'manual-' || sm.id::text movement_key, sm.occurred_at,
      sm.item_id::text item_id, i.name, coalesce(a.name, 'Sem setor') sector,
      coalesce(sm.movement_reason, sm.movement_type::text) movement_type,
      sm.quantity, i.consumption_unit unit, sm.unit_cost,
      coalesce(sm.notes, 'Movimentação manual') origin,
      sm.balance_before, sm.balance_after
    from public.stock_movements sm
    join public.items i on i.id = sm.item_id
    left join public.areas a on a.id = i.area_id
    where sm.business_id = p_business_id
      and sm.occurred_at::date between p_period_start and p_period_end
  ), automatic_movements as (
    select 'auto-' || rc.source || '-' || rc.operational_date::text || '-' || rc.item_id::text movement_key,
      (rc.operational_date::text || ' 23:59:00-03')::timestamptz occurred_at,
      rc.item_id::text item_id, i.name, coalesce(a.name, 'Sem setor') sector,
      rc.source movement_type, -sum(rc.quantity) quantity,
      i.consumption_unit unit, cost.unit_cost,
      case when rc.source = 'sale' then 'Venda sincronizada da Zig'
           else 'Consumo calculado pela ficha técnica' end origin,
      null::numeric balance_before, null::numeric balance_after
    from recursive_consumption rc
    join public.items i on i.id = rc.item_id
    left join public.areas a on a.id = i.area_id
    left join lateral (
      select coalesce(
        (select h.unit_cost from public.item_cost_history h
         where h.item_id = i.id and h.effective_from <= rc.operational_date
         order by h.effective_from desc, h.id desc limit 1),
        i.average_unit_cost, i.latest_unit_cost
      ) unit_cost
    ) cost on true
    where rc.operational_date between p_period_start and p_period_end
    group by rc.source, rc.operational_date, rc.item_id, i.name, a.name,
      i.consumption_unit, cost.unit_cost
  ), movement_rows as (
    select * from manual_movements union all select * from automatic_movements
  ), inventory_rows as (
    select ic.id::text id, ic.counted_at, ic.notes, count(ici.id) item_count,
      coalesce(sum(abs(ici.variance_quantity * ici.unit_cost)) filter (where ici.unit_cost is not null), 0) variance_value,
      count(*) filter (where ici.variance_quantity <> 0) divergent_items
    from public.inventory_counts ic
    join public.inventory_count_items ici on ici.inventory_count_id = ic.id
    where ic.business_id = p_business_id
      and ic.status = 'completed'::public.record_status
    group by ic.id, ic.counted_at, ic.notes
  ), missing_recipes as (
    select zi.item_id::text item_id, max(zi.product_name) name,
      sum(zi.quantity) quantity
    from public.zig_transaction_items zi
    join public.zig_sales_transactions zt on zt.id = zi.transaction_id
    join public.items i on i.id = zi.item_id and i.costing_method = 'recipe'
    where zi.business_id = p_business_id
      and zt.operational_date between p_period_start and p_period_end
      and not zi.is_refunded and not zt.is_refunded
      and not exists (
        select 1 from public.recipes r
        where r.business_id = p_business_id and r.product_id = zi.item_id
          and r.effective_from <= zt.operational_date
      )
    group by zi.item_id
  )
  select jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'summary', jsonb_build_object(
      'stock_value', coalesce(sum(stock_value), 0),
      'below_minimum', count(*) filter (where status in ('below_minimum', 'low')),
      'out_of_stock', count(*) filter (where status = 'out'),
      'divergent_items', count(*) filter (where status = 'divergence'),
      'variance_value', coalesce(sum(abs(variance_value)) filter (where last_counted_at::date between p_period_start and p_period_end), 0),
      'loss_value', coalesce((select sum(abs(m.quantity) * coalesce(m.unit_cost, 0))
        from public.stock_movements m where m.business_id = p_business_id
          and m.movement_reason in ('breakage','waste','expiration','loss')
          and m.occurred_at::date between p_period_start and p_period_end), 0),
      'replenishment_items', count(*) filter (where suggested_purchase > 0 and has_baseline),
      'last_inventory_at', (select max(counted_at) from inventory_rows),
      'insufficient_items', count(*) filter (where not has_baseline)
    ),
    'items', coalesce(jsonb_agg(to_jsonb(enriched_items) order by
      case status when 'divergence' then 0 when 'out' then 1 when 'below_minimum' then 2
        when 'low' then 3 when 'insufficient_data' then 4 else 5 end, name), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(to_jsonb(m) order by m.occurred_at desc)
      from (select * from movement_rows order by occurred_at desc limit 500) m), '[]'::jsonb),
    'inventories', coalesce((select jsonb_agg(to_jsonb(inv) order by inv.counted_at desc)
      from inventory_rows inv), '[]'::jsonb),
    'missing_recipes', coalesce((select jsonb_agg(to_jsonb(mr) order by mr.quantity desc)
      from missing_recipes mr), '[]'::jsonb)
  ) into v_result
  from enriched_items;

  return coalesce(v_result, jsonb_build_object(
    'period_start', p_period_start, 'period_end', p_period_end,
    'summary', '{}'::jsonb, 'items', '[]'::jsonb,
    'movements', '[]'::jsonb, 'inventories', '[]'::jsonb,
    'missing_recipes', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.record_stock_movement(bigint, bigint, text, numeric, numeric, timestamptz, text) from public, anon;
grant execute on function public.record_stock_movement(bigint, bigint, text, numeric, numeric, timestamptz, text) to authenticated;
revoke all on function public.complete_inventory_count(bigint, timestamptz, jsonb, text) from public, anon;
grant execute on function public.complete_inventory_count(bigint, timestamptz, jsonb, text) to authenticated;
revoke all on function public.update_item_minimum_stock(bigint, bigint, numeric) from public, anon;
grant execute on function public.update_item_minimum_stock(bigint, bigint, numeric) to authenticated;
revoke all on function public.get_virtual_inventory_dashboard(bigint, date, date) from public, anon;
grant execute on function public.get_virtual_inventory_dashboard(bigint, date, date) to authenticated;
