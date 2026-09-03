-- Keep personnel operational entries and their financial expenses consistent,
-- regardless of whether a write comes from the ERP, an integration or Supabase.

create or replace function public.validate_and_calculate_work_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee public.employees%rowtype;
  v_start timestamp;
  v_end timestamp;
  v_hours numeric;
  v_financial_change boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_financial_change :=
      new.business_id is distinct from old.business_id
      or new.employee_id is distinct from old.employee_id
      or new.area_id is distinct from old.area_id
      or new.shift_date is distinct from old.shift_date
      or new.input_mode is distinct from old.input_mode
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.break_minutes is distinct from old.break_minutes
      or new.hours_worked is distinct from old.hours_worked
      or new.rate_snapshot is distinct from old.rate_snapshot
      or new.amount_due is distinct from old.amount_due;
  end if;

  select *
    into v_employee
    from public.employees
   where id = new.employee_id
     and business_id = new.business_id;

  if not found then
    raise exception 'Funcionário não encontrado neste negócio';
  end if;

  if tg_op = 'INSERT' and not v_employee.is_active then
    raise exception 'Não é possível lançar jornada para funcionário inativo';
  end if;

  if new.shift_date is null then
    raise exception 'Informe a data da jornada';
  end if;

  if new.break_minutes is null or new.break_minutes < 0 or new.break_minutes > 1440 then
    raise exception 'O intervalo deve estar entre 0 e 1440 minutos';
  end if;

  if new.rate_snapshot is null or new.rate_snapshot <= 0 then
    raise exception 'Informe um valor de hora ou diária maior que zero';
  end if;

  if new.area_id is not null and not exists (
    select 1 from public.areas a
     where a.id = new.area_id and a.business_id = new.business_id
  ) then
    raise exception 'O setor informado não pertence a este negócio';
  end if;

  new.area_id := coalesce(new.area_id, v_employee.main_area_id);

  if new.input_mode = 'times' then
    if new.start_time is null or new.end_time is null then
      raise exception 'Informe os horários de entrada e saída';
    end if;

    v_start := new.shift_date + new.start_time;
    v_end := new.shift_date + new.end_time;
    if v_end <= v_start then
      v_end := v_end + interval '1 day';
    end if;

    v_hours := extract(epoch from (v_end - v_start)) / 3600
      - new.break_minutes / 60.0;

    if v_hours <= 0 then
      raise exception 'A jornada deve possuir duração maior que zero após o intervalo';
    end if;
    if v_hours > 24 then
      raise exception 'A jornada não pode ultrapassar 24 horas';
    end if;

    new.hours_worked := round(v_hours, 2);
    new.amount_due := round(new.hours_worked * new.rate_snapshot, 2);
  elsif new.input_mode = 'direct_hours' then
    if new.hours_worked is null or new.hours_worked <= 0 then
      raise exception 'Informe uma quantidade de horas maior que zero';
    end if;
    if new.hours_worked > 24 then
      raise exception 'A jornada não pode ultrapassar 24 horas';
    end if;

    new.hours_worked := round(new.hours_worked, 2);
    new.amount_due := round(new.hours_worked * new.rate_snapshot, 2);
  elsif new.input_mode = 'daily' then
    new.hours_worked := coalesce(new.hours_worked, 0);
    if new.hours_worked > 24 then
      raise exception 'A jornada não pode ultrapassar 24 horas';
    end if;
    new.amount_due := round(new.rate_snapshot, 2);
  else
    raise exception 'Modo de lançamento da jornada inválido';
  end if;

  if new.amount_due <= 0 then
    raise exception 'O valor calculado da jornada deve ser maior que zero';
  end if;

  if tg_op = 'UPDATE'
     and old.payroll_closing_id is not null
     and v_financial_change then
    raise exception 'Esta jornada pertence a um fechamento. Exclua o fechamento antes de alterar valores';
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  if new.created_by is null then
    raise exception 'Informe created_by com o usuário responsável pelo lançamento';
  end if;

  if new.payment_status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.payment_status = 'pending' then
    new.paid_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.sync_work_shift_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_name text;
begin
  if tg_op = 'DELETE' then
    delete from public.expenses
     where business_id = old.business_id
       and source_type = 'work_shift'
       and source_id = old.id;
    return old;
  end if;

  select name into v_employee_name
    from public.employees
   where id = new.employee_id and business_id = new.business_id;

  insert into public.expenses (
    business_id, area_id, category, description, expense_date, due_date,
    paid_at, amount, payment_method, status, is_recurring, cost_behavior,
    source_type, source_id, created_by
  ) values (
    new.business_id,
    new.area_id,
    'Funcionários/pessoal',
    'Jornada · ' || v_employee_name,
    new.shift_date,
    new.shift_date,
    new.paid_at,
    new.amount_due,
    new.payment_method,
    (case new.payment_status
      when 'paid' then 'completed'
      when 'cancelled' then 'cancelled'
      else 'pending'
    end)::public.record_status,
    false,
    'variable',
    'work_shift',
    new.id,
    new.created_by
  )
  on conflict (business_id, source_type, source_id)
    where source_type is not null
  do update set
    area_id = excluded.area_id,
    category = excluded.category,
    description = excluded.description,
    expense_date = excluded.expense_date,
    due_date = excluded.due_date,
    paid_at = excluded.paid_at,
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    status = excluded.status,
    is_recurring = excluded.is_recurring,
    cost_behavior = excluded.cost_behavior,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.validate_personnel_cost_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_area bigint;
  v_financial_change boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_financial_change :=
      new.business_id is distinct from old.business_id
      or new.employee_id is distinct from old.employee_id
      or new.area_id is distinct from old.area_id
      or new.cost_date is distinct from old.cost_date
      or new.cost_type is distinct from old.cost_type
      or new.description is distinct from old.description
      or new.amount is distinct from old.amount;
  end if;

  if new.cost_date is null then
    raise exception 'Informe a data do custo de pessoal';
  end if;
  if new.description is null or length(trim(new.description)) < 2 then
    raise exception 'Informe uma descrição com pelo menos 2 caracteres';
  end if;
  if new.amount is null or new.amount <= 0 then
    raise exception 'O valor do custo de pessoal deve ser maior que zero';
  end if;

  new.description := trim(new.description);

  if new.employee_id is not null then
    select main_area_id into v_employee_area
      from public.employees
     where id = new.employee_id and business_id = new.business_id;
    if not found then
      raise exception 'Funcionário não encontrado neste negócio';
    end if;
    new.area_id := coalesce(new.area_id, v_employee_area);
  end if;

  if new.area_id is not null and not exists (
    select 1 from public.areas a
     where a.id = new.area_id and a.business_id = new.business_id
  ) then
    raise exception 'O setor informado não pertence a este negócio';
  end if;

  if tg_op = 'UPDATE'
     and old.payroll_closing_id is not null
     and v_financial_change then
    raise exception 'Este custo pertence a um fechamento. Exclua o fechamento antes de alterar valores';
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  if new.created_by is null then
    raise exception 'Informe created_by com o usuário responsável pelo lançamento';
  end if;

  if new.payment_status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.payment_status = 'pending' then
    new.paid_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.sync_personnel_cost_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.expenses
     where business_id = old.business_id
       and source_type = 'personnel_cost'
       and source_id = old.id;
    return old;
  end if;

  insert into public.expenses (
    business_id, area_id, category, description, expense_date, due_date,
    paid_at, amount, payment_method, status, is_recurring, cost_behavior,
    source_type, source_id, created_by
  ) values (
    new.business_id,
    new.area_id,
    'Funcionários/pessoal',
    new.description,
    new.cost_date,
    new.cost_date,
    new.paid_at,
    new.amount,
    new.payment_method,
    (case new.payment_status
      when 'paid' then 'completed'
      when 'cancelled' then 'cancelled'
      else 'pending'
    end)::public.record_status,
    false,
    case when new.cost_type = 'monthly_salary' then 'fixed' else 'variable' end,
    'personnel_cost',
    new.id,
    new.created_by
  )
  on conflict (business_id, source_type, source_id)
    where source_type is not null
  do update set
    area_id = excluded.area_id,
    category = excluded.category,
    description = excluded.description,
    expense_date = excluded.expense_date,
    due_date = excluded.due_date,
    paid_at = excluded.paid_at,
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    status = excluded.status,
    is_recurring = excluded.is_recurring,
    cost_behavior = excluded.cost_behavior,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists work_shifts_validate_and_calculate on public.work_shifts;
create trigger work_shifts_validate_and_calculate
before insert or update on public.work_shifts
for each row execute function public.validate_and_calculate_work_shift();

drop trigger if exists work_shifts_sync_expense on public.work_shifts;
create trigger work_shifts_sync_expense
after insert or update or delete on public.work_shifts
for each row execute function public.sync_work_shift_expense();

drop trigger if exists personnel_cost_entries_validate on public.personnel_cost_entries;
create trigger personnel_cost_entries_validate
before insert or update on public.personnel_cost_entries
for each row execute function public.validate_personnel_cost_entry();

drop trigger if exists personnel_cost_entries_sync_expense on public.personnel_cost_entries;
create trigger personnel_cost_entries_sync_expense
after insert or update or delete on public.personnel_cost_entries
for each row execute function public.sync_personnel_cost_expense();

drop trigger if exists work_shifts_set_updated_at on public.work_shifts;
create trigger work_shifts_set_updated_at
before update on public.work_shifts
for each row execute function public.set_updated_at();

drop trigger if exists personnel_cost_entries_set_updated_at on public.personnel_cost_entries;
create trigger personnel_cost_entries_set_updated_at
before update on public.personnel_cost_entries
for each row execute function public.set_updated_at();

-- The application RPCs now write only the source record. The triggers above
-- own the corresponding expense and avoid duplicate financial entries.
create or replace function public.save_work_shift(
  p_business_id bigint, p_employee_id bigint, p_shift_date date,
  p_start_time time, p_end_time time, p_break_minutes integer,
  p_rate_override numeric, p_notes text default null
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shift_id bigint;
begin
  if auth.uid() is null or not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado ao negócio';
  end if;

  insert into public.work_shifts (
    business_id, employee_id, shift_date, input_mode, start_time, end_time,
    break_minutes, rate_snapshot, notes, created_by
  ) values (
    p_business_id, p_employee_id, p_shift_date, 'times', p_start_time, p_end_time,
    coalesce(p_break_minutes, 0), p_rate_override, nullif(trim(p_notes), ''), auth.uid()
  ) returning id into v_shift_id;

  return v_shift_id;
end;
$$;

create or replace function public.save_personnel_cost(
  p_business_id bigint, p_employee_id bigint, p_cost_date date,
  p_cost_type text, p_description text, p_amount numeric, p_paid boolean,
  p_payment_method text default null, p_notes text default null
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null or not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado ao negócio';
  end if;

  insert into public.personnel_cost_entries (
    business_id, employee_id, cost_date, cost_type, description, amount,
    payment_status, paid_at, payment_method, notes, created_by
  ) values (
    p_business_id, p_employee_id, p_cost_date, p_cost_type, p_description, p_amount,
    case when p_paid then 'paid' else 'pending' end,
    case when p_paid then now() end,
    nullif(trim(p_payment_method), ''), nullif(trim(p_notes), ''), auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.set_personnel_payment(
  p_business_id bigint,
  p_source_type text,
  p_source_id bigint,
  p_paid boolean,
  p_payment_method text default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_affected integer;
begin
  if auth.uid() is null or not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_source_type = 'work_shift' then
    update public.work_shifts
       set payment_status = case when p_paid then 'paid' else 'pending' end,
           paid_at = case when p_paid then now() end,
           payment_method = nullif(trim(p_payment_method), '')
     where id = p_source_id and business_id = p_business_id;
  elsif p_source_type = 'personnel_cost' then
    update public.personnel_cost_entries
       set payment_status = case when p_paid then 'paid' else 'pending' end,
           paid_at = case when p_paid then now() end,
           payment_method = nullif(trim(p_payment_method), '')
     where id = p_source_id and business_id = p_business_id;
  else
    raise exception 'Origem inválida';
  end if;

  get diagnostics v_affected = row_count;
  if v_affected = 0 then
    raise exception 'Lançamento de pessoal não encontrado';
  end if;
end;
$$;

revoke all on function public.validate_and_calculate_work_shift() from public, anon, authenticated;
revoke all on function public.sync_work_shift_expense() from public, anon, authenticated;
revoke all on function public.validate_personnel_cost_entry() from public, anon, authenticated;
revoke all on function public.sync_personnel_cost_expense() from public, anon, authenticated;

-- Repair records previously inserted directly into the source tables.
insert into public.expenses (
  business_id, area_id, category, description, expense_date, due_date,
  paid_at, amount, payment_method, status, is_recurring, cost_behavior,
  source_type, source_id, created_by
)
select
  s.business_id,
  s.area_id,
  'Funcionários/pessoal',
  'Jornada · ' || e.name,
  s.shift_date,
  s.shift_date,
  s.paid_at,
  s.amount_due,
  s.payment_method,
  (case s.payment_status
    when 'paid' then 'completed'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end)::public.record_status,
  false,
  'variable',
  'work_shift',
  s.id,
  s.created_by
from public.work_shifts s
join public.employees e on e.id = s.employee_id and e.business_id = s.business_id
where s.amount_due > 0
on conflict (business_id, source_type, source_id)
  where source_type is not null
do update set
  area_id = excluded.area_id,
  description = excluded.description,
  expense_date = excluded.expense_date,
  due_date = excluded.due_date,
  paid_at = excluded.paid_at,
  amount = excluded.amount,
  payment_method = excluded.payment_method,
  status = excluded.status,
  is_recurring = excluded.is_recurring,
  cost_behavior = excluded.cost_behavior,
  updated_at = now();

insert into public.expenses (
  business_id, area_id, category, description, expense_date, due_date,
  paid_at, amount, payment_method, status, is_recurring, cost_behavior,
  source_type, source_id, created_by
)
select
  c.business_id,
  c.area_id,
  'Funcionários/pessoal',
  c.description,
  c.cost_date,
  c.cost_date,
  c.paid_at,
  c.amount,
  c.payment_method,
  (case c.payment_status
    when 'paid' then 'completed'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end)::public.record_status,
  false,
  case when c.cost_type = 'monthly_salary' then 'fixed' else 'variable' end,
  'personnel_cost',
  c.id,
  c.created_by
from public.personnel_cost_entries c
on conflict (business_id, source_type, source_id)
  where source_type is not null
do update set
  area_id = excluded.area_id,
  description = excluded.description,
  expense_date = excluded.expense_date,
  due_date = excluded.due_date,
  paid_at = excluded.paid_at,
  amount = excluded.amount,
  payment_method = excluded.payment_method,
  status = excluded.status,
  is_recurring = excluded.is_recurring,
  cost_behavior = excluded.cost_behavior,
  updated_at = now();
