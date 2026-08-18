-- Setores deixam de ser uma lista fixa (Bar/Drinks/Cozinha/Churrasqueira) hardcoded
-- em funções e no frontend. Cada área ganha um flag explícito indicando se ela
-- participa da análise operacional de setores (vendas, CMV, rentabilidade,
-- classificação de produtos) ou se é apenas uma área geral/compartilhada
-- (despesas, pessoal, planejamento, custos estruturais).

alter table public.areas
  add column if not exists is_operational boolean not null default false;

-- Preserva o comportamento atual: as áreas que já funcionavam como setor de
-- produto continuam operacionais para todo negócio existente. Áreas novas
-- (inclusive as criadas automaticamente pela sincronização da Zig a partir de
-- nomes de área não reconhecidos) nascem não-operacionais até alguém marcar
-- explicitamente no cadastro.
update public.areas
set is_operational = true
where upper(trim(name)) in ('BAR', 'CERVEJA', 'DRINKS', 'COZINHA', 'CHURRASQUEIRA');

-- Usado pela UI de Setores para decidir se "Excluir" pode prosseguir ou se deve
-- virar "desative em vez de excluir" (evita perder o vínculo de dados históricos
-- por engano; os FKs já são on delete set null, então excluir não apaga nada,
-- mas a UI prefere avisar antes).
create or replace function public.area_usage_count(
  p_business_id bigint,
  p_area_id bigint
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.items where business_id = p_business_id and area_id = p_area_id)
    + (select count(*) from public.expenses where business_id = p_business_id and area_id = p_area_id)
    + (select count(*) from public.forecasts where business_id = p_business_id and area_id = p_area_id)
    + (select count(*) from public.employees where business_id = p_business_id and main_area_id = p_area_id)
    + (select count(*) from public.work_shifts where business_id = p_business_id and area_id = p_area_id)
    + (select count(*) from public.personnel_cost_entries where business_id = p_business_id and area_id = p_area_id)
    + (select count(*) from public.structural_costs where business_id = p_business_id and area_id = p_area_id)
  where (select private.is_business_member(p_business_id));
$$;

revoke all on function public.area_usage_count(bigint, bigint) from public, anon;
grant execute on function public.area_usage_count(bigint, bigint) to authenticated;

comment on function public.area_usage_count(bigint, bigint) is
  'Conta quantos registros (produtos, despesas, metas, pessoal, custos estruturais) referenciam esta área, para a UI decidir entre excluir e desativar.';

-- assign_products_to_sector: setor válido agora é "qualquer área operacional
-- ativa", não mais uma lista fixa de nomes.
create or replace function public.assign_products_to_sector(
  p_business_id bigint,
  p_item_ids bigint[],
  p_area_id bigint default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item_ids bigint[];
  v_requested integer;
  v_updated integer;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  select array_agg(distinct item_id)
  into v_item_ids
  from unnest(coalesce(p_item_ids, array[]::bigint[])) item_id
  where item_id is not null;

  v_requested := coalesce(cardinality(v_item_ids), 0);
  if v_requested = 0 or v_requested > 500 then
    raise exception 'Selecione entre 1 e 500 produtos';
  end if;

  if p_area_id is not null and not exists (
    select 1
    from public.areas a
    where a.id = p_area_id
      and a.business_id = p_business_id
      and a.is_operational
      and a.is_active
  ) then
    raise exception 'Setor inválido para este negócio';
  end if;

  if (
    select count(*)
    from public.items i
    where i.business_id = p_business_id
      and i.item_type = 'product'::public.item_type
      and i.id = any(v_item_ids)
  ) <> v_requested then
    raise exception 'Um ou mais produtos não pertencem a este negócio';
  end if;

  update public.items
  set area_id = p_area_id,
      updated_at = now()
  where business_id = p_business_id
    and item_type = 'product'::public.item_type
    and id = any(v_item_ids);
  get diagnostics v_updated = row_count;

  insert into public.audit_logs (business_id, user_id, action, entity_table, entity_id, details)
  values (
    p_business_id,
    (select auth.uid()),
    'update',
    'items',
    coalesce(p_area_id::text, 'sem-setor'),
    jsonb_build_object('item_ids', to_jsonb(v_item_ids), 'area_id', p_area_id, 'updated_count', v_updated)
  );

  return v_updated;
end;
$$;

-- get_zig_sales_dashboard: o rótulo de área por produto passa a refletir o
-- nome real da área vinculada, em vez de colapsar qualquer nome fora dos 4
-- setores fixos para "Sem setor".
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
          max(i2.product_category) as category,
          coalesce(max(a.name), 'Sem setor') as area,
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
        left join public.items catalog on catalog.id = i2.item_id and catalog.business_id = p_business_id
        left join public.areas a on a.id = catalog.area_id and a.business_id = p_business_id
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

-- get_sector_profitability: setor por produto passa a ser o nome real da área
-- quando ela é operacional, e null (fora dos setores) quando não é — em vez de
-- mapear só os 4 nomes fixos.
create or replace function public.get_sector_profitability(
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
  v_products jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_period_start is null or p_period_end is null or p_period_start > p_period_end
     or p_period_end - p_period_start > 366 then
    raise exception 'Período inválido; use no máximo 367 dias';
  end if;

  with item_rows as (
    select
      case when a.is_operational then a.name else null end as sector,
      coalesce(nullif(trim(a.name), ''), 'Sem setor') as source_area,
      i.item_id,
      max(i.product_name) as name,
      max(i.product_sku) as sku,
      max(i.product_category) as category,
      sum(i.quantity) as quantity,
      sum(i.net_amount_cents) as revenue_cents,
      coalesce(sum(i.quantity) filter (where cost.unit_cost is not null), 0) as costed_quantity,
      coalesce(sum(i.quantity) filter (where cost.unit_cost is null), 0) as missing_cost_quantity,
      coalesce(sum(i.net_amount_cents) filter (where cost.unit_cost is not null), 0) as known_revenue_cents,
      sum(i.quantity * cost.unit_cost) filter (where cost.unit_cost is not null) as known_cmv
    from public.zig_transaction_items i
    join public.zig_sales_transactions t on t.id = i.transaction_id
    left join public.items catalog on catalog.id = i.item_id and catalog.business_id = p_business_id
    left join public.areas a on a.id = catalog.area_id and a.business_id = p_business_id
    left join lateral (
      select h.unit_cost
      from public.item_cost_history h
      where h.item_id = i.item_id
        and h.effective_from <= t.operational_date
      order by h.effective_from desc, h.id desc
      limit 1
    ) cost on true
    where i.business_id = p_business_id
      and t.operational_date between p_period_start and p_period_end
      and not i.is_refunded
      and not t.is_refunded
    group by 1, 2, i.item_id
  )
  select coalesce(jsonb_agg(to_jsonb(item_rows) order by revenue_cents desc), '[]'::jsonb)
  into v_products
  from item_rows;

  return jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'products', v_products
  );
end;
$$;
