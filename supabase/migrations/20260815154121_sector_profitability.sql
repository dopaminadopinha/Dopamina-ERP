alter table public.expenses
  add column if not exists area_id bigint references public.areas(id) on delete set null;

create index if not exists expenses_business_area_date_idx
  on public.expenses (business_id, area_id, expense_date)
  where status <> 'cancelled';

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
      case upper(trim(coalesce(t.bar_name, '')))
        when 'CERVEJA' then 'Bar'
        when 'DRINKS' then 'Drinks'
        when 'COZINHA' then 'Cozinha'
        when 'CHURRASQUEIRA' then 'Churrasqueira'
        else null
      end as sector,
      coalesce(nullif(trim(t.bar_name), ''), 'Não atribuído') as source_area,
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

revoke all on function public.get_sector_profitability(bigint, date, date) from public, anon;
grant execute on function public.get_sector_profitability(bigint, date, date) to authenticated;

comment on function public.get_sector_profitability(bigint, date, date) is
  'Rentabilidade por container da Zig com custos historicos por produto e periodo.';
