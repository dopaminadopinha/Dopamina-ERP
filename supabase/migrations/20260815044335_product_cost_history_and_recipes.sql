-- Versioned product costs and recipes. Historical sales keep the cost that was
-- effective on their operational date.

alter table public.items
  add column if not exists costing_method text not null default 'simple';

alter table public.items
  drop constraint if exists items_costing_method_valid;
alter table public.items
  add constraint items_costing_method_valid
  check (costing_method in ('simple', 'recipe'));

create table public.item_cost_history (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete cascade,
  unit_cost numeric(14,4) not null,
  effective_from date not null,
  source text not null default 'manual',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, effective_from),
  constraint item_cost_history_cost_nonnegative check (unit_cost >= 0),
  constraint item_cost_history_source_valid check (source in ('manual', 'recipe', 'import', 'purchase'))
);

create index item_cost_history_business_item_date_idx
  on public.item_cost_history (business_id, item_id, effective_from desc);

insert into public.item_cost_history (
  business_id, item_id, unit_cost, effective_from, source, notes
)
select business_id, id, coalesce(average_unit_cost, latest_unit_cost), date '1900-01-01', 'import',
  'Custo inicial preservado na criação do histórico'
from public.items
where coalesce(average_unit_cost, latest_unit_cost) is not null
  and coalesce(average_unit_cost, latest_unit_cost) >= 0
on conflict (item_id, effective_from) do nothing;

alter table public.recipes
  add column if not exists effective_from date not null default current_date,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.recipes
  drop constraint if exists recipes_business_id_product_id_key;
alter table public.recipes
  add constraint recipes_business_product_date_key
  unique (business_id, product_id, effective_from);

create index recipes_product_effective_idx
  on public.recipes (business_id, product_id, effective_from desc);

alter table public.recipe_items
  add column if not exists waste_percentage numeric(7,4) not null default 0;

alter table public.recipe_items
  drop constraint if exists recipe_items_waste_valid;
alter table public.recipe_items
  add constraint recipe_items_waste_valid
  check (waste_percentage >= 0 and waste_percentage < 100);

create trigger item_cost_history_set_updated_at
  before update on public.item_cost_history
  for each row execute function public.set_updated_at();

alter table public.item_cost_history enable row level security;

create policy item_cost_history_member_all
on public.item_cost_history for all to authenticated
using ((select private.is_business_member(business_id)))
with check ((select private.is_business_member(business_id)));

grant select, insert, update, delete on table public.item_cost_history to authenticated;
grant usage, select on sequence public.item_cost_history_id_seq to authenticated;

create or replace function public.save_item_cost_version(
  p_business_id bigint,
  p_item_id bigint,
  p_unit_cost numeric,
  p_effective_from date,
  p_sale_price numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_cost numeric;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'O custo deve ser maior ou igual a zero';
  end if;

  if p_effective_from is null then
    raise exception 'Informe a data inicial do custo';
  end if;

  if p_sale_price is not null and p_sale_price < 0 then
    raise exception 'O preço de venda não pode ser negativo';
  end if;

  if not exists (
    select 1 from public.items
    where id = p_item_id and business_id = p_business_id
  ) then
    raise exception 'Item não encontrado neste negócio';
  end if;

  insert into public.item_cost_history (
    business_id, item_id, unit_cost, effective_from, source, created_by
  ) values (
    p_business_id, p_item_id, p_unit_cost, p_effective_from, 'manual', (select auth.uid())
  )
  on conflict (item_id, effective_from) do update
    set unit_cost = excluded.unit_cost,
        source = 'manual',
        created_by = excluded.created_by,
        updated_at = now();

  select h.unit_cost into v_current_cost
  from public.item_cost_history h
  where h.item_id = p_item_id and h.effective_from <= current_date
  order by h.effective_from desc, h.id desc
  limit 1;

  update public.items
  set costing_method = case when item_type = 'product' then 'simple' else costing_method end,
      latest_unit_cost = v_current_cost,
      average_unit_cost = v_current_cost,
      sale_price = coalesce(p_sale_price, sale_price),
      updated_at = now()
  where id = p_item_id and business_id = p_business_id;

  return jsonb_build_object(
    'item_id', p_item_id,
    'unit_cost', p_unit_cost,
    'effective_from', p_effective_from
  );
end;
$$;

create or replace function public.save_product_recipe(
  p_business_id bigint,
  p_product_id bigint,
  p_effective_from date,
  p_yield_quantity numeric,
  p_ingredients jsonb,
  p_notes text,
  p_sale_price numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipe_id bigint;
  v_recipe_cost numeric;
  v_current_cost numeric;
  v_component_count integer;
  v_valid_component_count integer;
  v_missing_cost_count integer;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_effective_from is null or p_yield_quantity is null or p_yield_quantity <= 0 then
    raise exception 'Informe uma data e um rendimento maior que zero';
  end if;

  if p_sale_price is not null and p_sale_price < 0 then
    raise exception 'O preço de venda não pode ser negativo';
  end if;

  if jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'Adicione ao menos um ingrediente';
  end if;

  if not exists (
    select 1 from public.items
    where id = p_product_id and business_id = p_business_id and item_type = 'product'
  ) then
    raise exception 'Produto não encontrado neste negócio';
  end if;

  select count(*), count(distinct (entry->>'ingredient_id')::bigint)
  into v_component_count, v_valid_component_count
  from jsonb_array_elements(p_ingredients) entry;

  if v_component_count <> v_valid_component_count then
    raise exception 'O mesmo ingrediente foi adicionado mais de uma vez';
  end if;

  select count(*) into v_valid_component_count
  from jsonb_array_elements(p_ingredients) entry
  join public.items ingredient
    on ingredient.id = (entry->>'ingredient_id')::bigint
   and ingredient.business_id = p_business_id
   and ingredient.item_type in ('ingredient', 'consumable')
  where (entry->>'quantity')::numeric > 0
    and coalesce((entry->>'waste_percentage')::numeric, 0) >= 0
    and coalesce((entry->>'waste_percentage')::numeric, 0) < 100;

  if v_component_count <> v_valid_component_count then
    raise exception 'Revise os ingredientes, quantidades e perdas informadas';
  end if;

  select sum(
    (entry->>'quantity')::numeric
    * (1 + coalesce((entry->>'waste_percentage')::numeric, 0) / 100)
    * coalesce(cost.unit_cost, ingredient.average_unit_cost, ingredient.latest_unit_cost)
  ) / p_yield_quantity,
    count(*) filter (
      where coalesce(cost.unit_cost, ingredient.average_unit_cost, ingredient.latest_unit_cost) is null
    )
  into v_recipe_cost, v_missing_cost_count
  from jsonb_array_elements(p_ingredients) entry
  join public.items ingredient
    on ingredient.id = (entry->>'ingredient_id')::bigint
   and ingredient.business_id = p_business_id
  left join lateral (
    select h.unit_cost
    from public.item_cost_history h
    where h.item_id = ingredient.id and h.effective_from <= p_effective_from
    order by h.effective_from desc, h.id desc
    limit 1
  ) cost on true;

  if v_recipe_cost is null or v_missing_cost_count > 0 then
    raise exception 'Todos os ingredientes precisam ter custo antes de salvar a ficha';
  end if;

  insert into public.recipes (
    business_id, product_id, yield_quantity, notes, effective_from, created_by
  ) values (
    p_business_id, p_product_id, p_yield_quantity, nullif(trim(p_notes), ''),
    p_effective_from, (select auth.uid())
  )
  on conflict (business_id, product_id, effective_from) do update
    set yield_quantity = excluded.yield_quantity,
        notes = excluded.notes,
        created_by = excluded.created_by,
        updated_at = now()
  returning id into v_recipe_id;

  delete from public.recipe_items where recipe_id = v_recipe_id;

  insert into public.recipe_items (recipe_id, ingredient_id, quantity, waste_percentage)
  select v_recipe_id,
    (entry->>'ingredient_id')::bigint,
    (entry->>'quantity')::numeric,
    coalesce((entry->>'waste_percentage')::numeric, 0)
  from jsonb_array_elements(p_ingredients) entry;

  insert into public.item_cost_history (
    business_id, item_id, unit_cost, effective_from, source, notes, created_by
  ) values (
    p_business_id, p_product_id, round(v_recipe_cost, 4), p_effective_from,
    'recipe', 'Calculado pela ficha técnica', (select auth.uid())
  )
  on conflict (item_id, effective_from) do update
    set unit_cost = excluded.unit_cost,
        source = 'recipe',
        notes = excluded.notes,
        created_by = excluded.created_by,
        updated_at = now();

  select h.unit_cost into v_current_cost
  from public.item_cost_history h
  where h.item_id = p_product_id and h.effective_from <= current_date
  order by h.effective_from desc, h.id desc
  limit 1;

  update public.items
  set costing_method = 'recipe',
      latest_unit_cost = v_current_cost,
      average_unit_cost = v_current_cost,
      sale_price = coalesce(p_sale_price, sale_price),
      updated_at = now()
  where id = p_product_id and business_id = p_business_id;

  return jsonb_build_object(
    'recipe_id', v_recipe_id,
    'unit_cost', round(v_recipe_cost, 4),
    'effective_from', p_effective_from
  );
end;
$$;

revoke all on function public.save_item_cost_version(bigint, bigint, numeric, date, numeric)
  from public, anon;
grant execute on function public.save_item_cost_version(bigint, bigint, numeric, date, numeric)
  to authenticated;

revoke all on function public.save_product_recipe(bigint, bigint, date, numeric, jsonb, text, numeric)
  from public, anon;
grant execute on function public.save_product_recipe(bigint, bigint, date, numeric, jsonb, text, numeric)
  to authenticated;

create or replace function public.get_zig_sales_dashboard(
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

  select jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'summary', jsonb_build_object(
      'gross_cents', coalesce(sum(i.gross_amount_cents) filter (where not i.is_refunded and not t.is_refunded), 0),
      'discount_cents', coalesce(sum(i.discount_amount_cents) filter (where not i.is_refunded and not t.is_refunded), 0),
      'net_cents', coalesce(sum(i.net_amount_cents) filter (where not i.is_refunded and not t.is_refunded), 0),
      'quantity', coalesce(sum(i.quantity) filter (where not i.is_refunded and not t.is_refunded), 0),
      'transaction_count', count(distinct t.id) filter (where not t.is_refunded and not i.is_refunded),
      'refunded_item_count', count(i.id) filter (where i.is_refunded or t.is_refunded),
      'revenue_cents', (
        select coalesce(sum(p.value_cents), 0)
        from public.zig_payment_totals p
        where p.business_id = p_business_id
          and p.operational_date between p_period_start and p_period_end
      )
    ),
    'products', (
      select coalesce(jsonb_agg(to_jsonb(product_rows) order by product_rows.net_cents desc), '[]'::jsonb)
      from (
        select i2.item_id, max(i2.product_name) as name, max(i2.product_sku) as sku,
          max(i2.product_category) as category, coalesce(max(t2.bar_name), 'Geral') as area,
          sum(i2.quantity) as quantity, sum(i2.gross_amount_cents) as gross_cents,
          sum(i2.discount_amount_cents) as discount_cents, sum(i2.net_amount_cents) as net_cents,
          coalesce(sum(i2.quantity) filter (where cost.unit_cost is not null), 0) as costed_quantity,
          coalesce(sum(i2.quantity) filter (where cost.unit_cost is null), 0) as missing_cost_quantity,
          coalesce(sum(i2.net_amount_cents) filter (where cost.unit_cost is not null), 0) as known_net_cents,
          sum(i2.quantity * cost.unit_cost) filter (where cost.unit_cost is not null) as total_cost,
          case
            when coalesce(sum(i2.quantity) filter (where cost.unit_cost is not null), 0) > 0
            then sum(i2.quantity * cost.unit_cost) filter (where cost.unit_cost is not null)
              / sum(i2.quantity) filter (where cost.unit_cost is not null)
            else null
          end as unit_cost
        from public.zig_transaction_items i2
        join public.zig_sales_transactions t2 on t2.id = i2.transaction_id
        left join lateral (
          select h.unit_cost
          from public.item_cost_history h
          where h.item_id = i2.item_id and h.effective_from <= t2.operational_date
          order by h.effective_from desc, h.id desc
          limit 1
        ) cost on true
        where i2.business_id = p_business_id
          and t2.operational_date between p_period_start and p_period_end
          and not i2.is_refunded and not t2.is_refunded
        group by i2.item_id
      ) product_rows
    ),
    'payments', (
      select coalesce(jsonb_agg(to_jsonb(payment_rows) order by payment_rows.value_cents desc), '[]'::jsonb)
      from (
        select p.payment_name, sum(p.value_cents) as value_cents
        from public.zig_payment_totals p
        where p.business_id = p_business_id
          and p.operational_date between p_period_start and p_period_end
        group by p.payment_name
      ) payment_rows
    ),
    'daily', (
      select coalesce(jsonb_agg(to_jsonb(daily_rows) order by daily_rows.operational_date), '[]'::jsonb)
      from (
        select t3.operational_date,
          sum(i3.net_amount_cents) filter (where not i3.is_refunded and not t3.is_refunded) as net_cents,
          count(distinct t3.id) filter (where not t3.is_refunded and not i3.is_refunded) as transaction_count
        from public.zig_sales_transactions t3
        join public.zig_transaction_items i3 on i3.transaction_id = t3.id
        where t3.business_id = p_business_id
          and t3.operational_date between p_period_start and p_period_end
        group by t3.operational_date
      ) daily_rows
    ),
    'sync', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.endpoint), '[]'::jsonb)
      from public.zig_sync_state s
      where s.business_id = p_business_id
    )
  ) into v_result
  from public.zig_sales_transactions t
  left join public.zig_transaction_items i on i.transaction_id = t.id
  where t.business_id = p_business_id
    and t.operational_date between p_period_start and p_period_end;

  return coalesce(v_result, jsonb_build_object(
    'period_start', p_period_start, 'period_end', p_period_end,
    'summary', jsonb_build_object('gross_cents', 0, 'discount_cents', 0, 'net_cents', 0, 'quantity', 0, 'transaction_count', 0, 'refunded_item_count', 0, 'revenue_cents', 0),
    'products', '[]'::jsonb, 'payments', '[]'::jsonb, 'daily', '[]'::jsonb, 'sync', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_zig_sales_dashboard(bigint, date, date) from public, anon;
grant execute on function public.get_zig_sales_dashboard(bigint, date, date) to authenticated;
