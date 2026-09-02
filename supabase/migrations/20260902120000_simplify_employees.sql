alter table public.employees add column if not exists cpf text;
alter table public.employees add column if not exists pix_key text;

alter table public.employees drop constraint if exists employees_role_title_check;
alter table public.employees alter column role_title drop not null;
alter table public.employees alter column role_title set default '';

alter table public.employees add constraint employees_cpf_check
  check (cpf is null or cpf ~ '^[0-9]{11}$');

drop function if exists public.save_work_shift(bigint,bigint,date,bigint,text,time,time,integer,numeric,numeric,text);
drop function if exists public.save_personnel_cost(bigint,bigint,bigint,date,text,text,numeric,boolean,text,text);

create function public.save_work_shift(
  p_business_id bigint, p_employee_id bigint, p_shift_date date,
  p_start_time time, p_end_time time, p_break_minutes integer,
  p_rate_override numeric, p_notes text default null
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  v_employee public.employees%rowtype; v_rate numeric; v_hours numeric; v_amount numeric; v_shift_id bigint;
  v_start timestamp; v_end timestamp;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  select * into v_employee from public.employees where id=p_employee_id and business_id=p_business_id;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if p_start_time is null or p_end_time is null then raise exception 'Informe entrada e saída'; end if;
  if p_rate_override is null or p_rate_override < 0 then raise exception 'Informe o valor da hora'; end if;
  v_rate := p_rate_override;
  v_start := p_shift_date + p_start_time; v_end := p_shift_date + p_end_time;
  if v_end <= v_start then v_end := v_end + interval '1 day'; end if;
  v_hours := greatest(0, extract(epoch from (v_end-v_start))/3600 - coalesce(p_break_minutes,0)/60.0);
  if v_hours > 24 then raise exception 'A jornada não pode ultrapassar 24 horas'; end if;
  v_amount := round(v_hours*v_rate,2);
  insert into public.work_shifts (business_id,employee_id,area_id,shift_date,input_mode,start_time,end_time,break_minutes,hours_worked,rate_snapshot,amount_due,notes,created_by)
  values (p_business_id,p_employee_id,null,p_shift_date,'times',p_start_time,p_end_time,coalesce(p_break_minutes,0),round(v_hours,2),v_rate,v_amount,nullif(trim(p_notes),''),(select auth.uid())) returning id into v_shift_id;
  if v_amount > 0 then
    insert into public.expenses (business_id,area_id,category,description,expense_date,due_date,amount,status,is_recurring,cost_behavior,source_type,source_id,created_by)
    values (p_business_id,null,'Funcionários/pessoal','Jornada · '||v_employee.name,p_shift_date,p_shift_date,v_amount,'pending',false,'variable','work_shift',v_shift_id,(select auth.uid()));
  end if;
  return v_shift_id;
end $$;

create function public.save_personnel_cost(
  p_business_id bigint, p_employee_id bigint, p_cost_date date,
  p_cost_type text, p_description text, p_amount numeric, p_paid boolean,
  p_payment_method text default null, p_notes text default null
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_id bigint;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  if p_amount<=0 then raise exception 'O valor deve ser maior que zero'; end if;
  insert into public.personnel_cost_entries (business_id,employee_id,area_id,cost_date,cost_type,description,amount,payment_status,paid_at,payment_method,notes,created_by)
  values (p_business_id,p_employee_id,null,p_cost_date,p_cost_type,trim(p_description),p_amount,case when p_paid then 'paid' else 'pending' end,case when p_paid then now() end,nullif(trim(p_payment_method),''),nullif(trim(p_notes),''),(select auth.uid())) returning id into v_id;
  insert into public.expenses (business_id,area_id,category,description,expense_date,due_date,paid_at,amount,payment_method,status,is_recurring,cost_behavior,source_type,source_id,created_by)
  values (p_business_id,null,'Funcionários/pessoal',trim(p_description),p_cost_date,p_cost_date,case when p_paid then now() end,p_amount,nullif(trim(p_payment_method),''),case when p_paid then 'completed'::public.record_status else 'pending'::public.record_status end,false,case when p_cost_type='monthly_salary' then 'fixed' else 'variable' end,'personnel_cost',v_id,(select auth.uid()));
  return v_id;
end $$;

revoke all on function public.save_work_shift(bigint,bigint,date,time,time,integer,numeric,text) from public,anon;
revoke all on function public.save_personnel_cost(bigint,bigint,date,text,text,numeric,boolean,text,text) from public,anon;
grant execute on function public.save_work_shift(bigint,bigint,date,time,time,integer,numeric,text) to authenticated;
grant execute on function public.save_personnel_cost(bigint,bigint,date,text,text,numeric,boolean,text,text) to authenticated;
