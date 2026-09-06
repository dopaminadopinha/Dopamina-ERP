create or replace function public.get_monthly_revenue_history(
  p_business_id bigint,
  p_period_start date,
  p_period_end date
)
returns table (
  month_start date,
  period_start date,
  period_end date,
  net_cents bigint,
  transaction_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_period_start is null or p_period_end is null or p_period_start > p_period_end
     or p_period_end - p_period_start > 1826 then
    raise exception 'Período inválido; use no máximo cinco anos';
  end if;

  return query
  with months as (
    select generated_month::date as month_start
    from generate_series(
      date_trunc('month', p_period_start::timestamp),
      date_trunc('month', p_period_end::timestamp),
      interval '1 month'
    ) generated_month
  ),
  totals as (
    select date_trunc('month', p.operational_date::timestamp)::date as month_start,
      coalesce(sum(p.value_cents), 0)::bigint as net_cents
    from public.zig_payment_totals p
    where p.business_id = p_business_id
      and p.operational_date between p_period_start and p_period_end
    group by date_trunc('month', p.operational_date::timestamp)::date
  )
  select m.month_start,
    greatest(m.month_start, p_period_start) as period_start,
    least((m.month_start + interval '1 month - 1 day')::date, p_period_end) as period_end,
    coalesce(t.net_cents, 0)::bigint,
    null::bigint
  from months m
  left join totals t on t.month_start = m.month_start
  order by m.month_start;
end;
$$;

revoke all on function public.get_monthly_revenue_history(bigint, date, date) from public, anon;
grant execute on function public.get_monthly_revenue_history(bigint, date, date) to authenticated;
