create or replace function public.get_personnel_dashboard(p_business_id bigint,p_period_start date,p_period_end date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
 if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
 if p_period_start is null or p_period_end is null or p_period_start>p_period_end or p_period_end-p_period_start>366 then raise exception 'Período inválido'; end if;
 select jsonb_build_object(
  'employees',(select coalesce(jsonb_agg(to_jsonb(x) order by x.is_active desc,x.name),'[]') from (select e.*,a.name area_name,(select coalesce(jsonb_agg(to_jsonb(h) order by h.effective_from desc),'[]') from public.employee_compensation_history h where h.employee_id=e.id) compensation_history from public.employees e left join public.areas a on a.id=e.main_area_id where e.business_id=p_business_id) x),
  'shifts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.shift_date desc,x.id desc),'[]') from (select s.*,e.name employee_name,e.role_title,a.name area_name from public.work_shifts s join public.employees e on e.id=s.employee_id left join public.areas a on a.id=s.area_id where s.business_id=p_business_id and s.shift_date between p_period_start and p_period_end and s.payment_status<>'cancelled') x),
  'costs',(select coalesce(jsonb_agg(to_jsonb(x) order by x.cost_date desc,x.id desc),'[]') from (select c.*,e.name employee_name,a.name area_name from public.personnel_cost_entries c left join public.employees e on e.id=c.employee_id left join public.areas a on a.id=c.area_id where c.business_id=p_business_id and c.cost_date between p_period_start and p_period_end and c.payment_status<>'cancelled') x),
  'structures',(select coalesce(jsonb_agg(to_jsonb(x) order by x.is_active desc,x.name),'[]') from (select s.*,a.name area_name from public.structural_costs s left join public.areas a on a.id=s.area_id where s.business_id=p_business_id) x),
  'closings',(select coalesce(jsonb_agg(to_jsonb(x) order by x.period_end desc,x.id desc),'[]') from (select c.*,(select coalesce(jsonb_agg(jsonb_build_object('employee_id',i.employee_id,'employee_name',e.name,'amount',i.amount,'hours_worked',i.hours_worked)),'[]') from public.payroll_closing_items i join public.employees e on e.id=i.employee_id where i.closing_id=c.id) items from public.payroll_closings c where c.business_id=p_business_id and c.status<>'cancelled') x),
  'revenue_cents',(select coalesce(sum(i.net_amount_cents),0) from public.zig_transaction_items i join public.zig_sales_transactions t on t.id=i.transaction_id where i.business_id=p_business_id and t.operational_date between p_period_start and p_period_end and not i.is_refunded and not t.is_refunded)
 ) into v_result;
 return v_result;
end $$;

revoke all on function public.get_personnel_dashboard(bigint,date,date) from public,anon;
grant execute on function public.get_personnel_dashboard(bigint,date,date) to authenticated;
