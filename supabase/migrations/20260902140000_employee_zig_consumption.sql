alter table public.zig_sync_state drop constraint zig_sync_state_endpoint_valid;
alter table public.zig_sync_state add constraint zig_sync_state_endpoint_valid
  check (endpoint in ('saida-produtos', 'faturamento', 'compradores'));

alter table public.zig_sync_runs drop constraint zig_sync_runs_endpoint_valid;
alter table public.zig_sync_runs add constraint zig_sync_runs_endpoint_valid
  check (endpoint in ('saida-produtos', 'faturamento', 'compradores'));

create table public.employee_zig_consumption (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  zig_transaction_id text not null,
  zig_transaction_row_id bigint references public.zig_sales_transactions(id) on delete set null,
  purchased_at timestamptz not null,
  operational_date date not null,
  products_value_cents bigint not null default 0,
  tip_value_cents bigint not null default 0,
  is_paid boolean,
  payment_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, zig_transaction_id)
);

create index employee_zig_consumption_employee_date_idx
  on public.employee_zig_consumption (business_id, employee_id, operational_date desc);

alter table public.employee_zig_consumption enable row level security;

create policy employee_zig_consumption_member_select
on public.employee_zig_consumption for select to authenticated
using ((select private.is_business_member(business_id)));

grant select on table public.employee_zig_consumption to authenticated;
grant select, insert, update on table public.employee_zig_consumption to service_role;
grant usage, select on sequence public.employee_zig_consumption_id_seq to service_role;

create function public.sync_zig_employee_consumption_day(
  p_business_id bigint,
  p_operational_date date,
  p_rows jsonb,
  p_run_id bigint default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_row jsonb;
  v_document text;
  v_employee_id bigint;
  v_transaction_row_id bigint;
  v_count integer := 0;
  v_matched integer := 0;
begin
  if p_operational_date is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Payload de compradores Zig inválido';
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id and is_active) then
    raise exception 'Negócio inválido ou inativo';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_count := v_count + 1;
    v_document := nullif(regexp_replace(coalesce(v_row ->> 'user_document', ''), '\D', '', 'g'), '');
    if v_document is null or length(v_document) <> 11 then continue; end if;

    select id into v_employee_id from public.employees
    where business_id = p_business_id and cpf = v_document limit 1;
    if v_employee_id is null then continue; end if;

    select id into v_transaction_row_id from public.zig_sales_transactions
    where business_id = p_business_id and zig_transaction_id = v_row ->> 'transaction_id';

    insert into public.employee_zig_consumption (
      business_id, employee_id, zig_transaction_id, zig_transaction_row_id, purchased_at, operational_date,
      products_value_cents, tip_value_cents, is_paid, payment_type
    ) values (
      p_business_id, v_employee_id, v_row ->> 'transaction_id', v_transaction_row_id,
      (v_row ->> 'purchased_at')::timestamptz, p_operational_date,
      coalesce((v_row ->> 'products_value_cents')::bigint, 0), coalesce((v_row ->> 'tip_value_cents')::bigint, 0),
      nullif(v_row ->> 'is_paid', '')::boolean, nullif(v_row ->> 'payment_type', '')
    )
    on conflict (business_id, zig_transaction_id) do update set
      employee_id = excluded.employee_id,
      zig_transaction_row_id = excluded.zig_transaction_row_id,
      purchased_at = excluded.purchased_at,
      operational_date = excluded.operational_date,
      products_value_cents = excluded.products_value_cents,
      tip_value_cents = excluded.tip_value_cents,
      is_paid = excluded.is_paid,
      payment_type = excluded.payment_type,
      updated_at = now();
    v_matched := v_matched + 1;
  end loop;

  insert into public.zig_sync_state (
    business_id, endpoint, last_attempt_at, last_success_at, last_successful_date,
    status, rows_received, error_message, updated_at
  ) values (
    p_business_id, 'compradores', now(), now(), p_operational_date,
    'completed', v_matched, null, now()
  )
  on conflict (business_id, endpoint)
  do update set last_attempt_at = now(), last_success_at = now(),
    last_successful_date = excluded.last_successful_date, status = 'completed',
    rows_received = excluded.rows_received, error_message = null, updated_at = now();

  if p_run_id is not null then
    update public.zig_sync_runs
    set status = 'completed', row_count = v_matched, completed_at = now(), error_message = null
    where id = p_run_id and business_id = p_business_id;
  end if;

  return jsonb_build_object('date', p_operational_date, 'rows', v_count, 'matched', v_matched);
end;
$$;

create function public.get_employee_zig_consumption(
  p_business_id bigint,
  p_employee_id bigint,
  p_period_start date,
  p_period_end date
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and business_id = p_business_id) then
    raise exception 'Funcionário não encontrado';
  end if;

  select jsonb_build_object(
    'open_cents', coalesce(sum(c.products_value_cents + c.tip_value_cents) filter (where coalesce(c.is_paid, false) = false), 0),
    'paid_cents', coalesce(sum(c.products_value_cents + c.tip_value_cents) filter (where coalesce(c.is_paid, false) = true), 0),
    'transactions', coalesce(jsonb_agg(jsonb_build_object(
      'zig_transaction_id', c.zig_transaction_id,
      'purchased_at', c.purchased_at,
      'products_value_cents', c.products_value_cents,
      'tip_value_cents', c.tip_value_cents,
      'is_paid', c.is_paid,
      'payment_type', c.payment_type,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'product_name', i.product_name, 'quantity', i.quantity, 'net_amount_cents', i.net_amount_cents
        ) order by i.id), '[]'::jsonb)
        from public.zig_transaction_items i
        where i.transaction_id = c.zig_transaction_row_id and not i.is_refunded
      )
    ) order by c.purchased_at desc), '[]'::jsonb)
  ) into v_result
  from public.employee_zig_consumption c
  where c.business_id = p_business_id and c.employee_id = p_employee_id
    and c.operational_date between p_period_start and p_period_end;

  return coalesce(v_result, jsonb_build_object('open_cents', 0, 'paid_cents', 0, 'transactions', '[]'::jsonb));
end;
$$;

revoke all on function public.sync_zig_employee_consumption_day(bigint, date, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.sync_zig_employee_consumption_day(bigint, date, jsonb, bigint) to service_role;

revoke all on function public.get_employee_zig_consumption(bigint, bigint, date, date) from public, anon;
grant execute on function public.get_employee_zig_consumption(bigint, bigint, date, date) to authenticated;
