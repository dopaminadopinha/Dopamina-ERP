create or replace function public.create_payroll_closing(p_business_id bigint,p_period_start date,p_period_end date,p_notes text default null)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_id bigint; v_total numeric;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  if p_period_start>p_period_end then raise exception 'Período inválido'; end if;
  insert into public.payroll_closings (business_id,period_start,period_end,notes,created_by)
  values (p_business_id,p_period_start,p_period_end,nullif(trim(p_notes),''),(select auth.uid())) returning id into v_id;
  insert into public.payroll_closing_items (closing_id,employee_id,amount,hours_worked,shift_ids,personnel_cost_ids)
  select v_id,e.id,coalesce(s.amount,0)+coalesce(c.amount,0),coalesce(s.hours,0),coalesce(s.ids,'{}'),coalesce(c.ids,'{}')
  from public.employees e
  left join lateral (select sum(amount_due) amount,sum(hours_worked) hours,array_agg(id) ids from public.work_shifts where employee_id=e.id and business_id=p_business_id and shift_date between p_period_start and p_period_end and payment_status='pending' and payroll_closing_id is null) s on true
  left join lateral (select sum(amount) amount,array_agg(id) ids from public.personnel_cost_entries where employee_id=e.id and business_id=p_business_id and cost_date between p_period_start and p_period_end and payment_status='pending' and payroll_closing_id is null) c on true
  where e.business_id=p_business_id and (coalesce(s.amount,0)+coalesce(c.amount,0))>0;
  if not exists(select 1 from public.payroll_closing_items where closing_id=v_id) then delete from public.payroll_closings where id=v_id; raise exception 'Não há valores pendentes para fechar neste período'; end if;
  update public.work_shifts s set payroll_closing_id=v_id
    where exists (select 1 from public.payroll_closing_items i where i.closing_id=v_id and s.id=any(i.shift_ids));
  update public.personnel_cost_entries c set payroll_closing_id=v_id
    where exists (select 1 from public.payroll_closing_items i where i.closing_id=v_id and c.id=any(i.personnel_cost_ids));
  select sum(amount) into v_total from public.payroll_closing_items where closing_id=v_id;
  update public.payroll_closings set total_amount=coalesce(v_total,0) where id=v_id;
  return v_id;
end $$;

revoke all on function public.create_payroll_closing(bigint,date,date,text) from public,anon;
grant execute on function public.create_payroll_closing(bigint,date,date,text) to authenticated;
