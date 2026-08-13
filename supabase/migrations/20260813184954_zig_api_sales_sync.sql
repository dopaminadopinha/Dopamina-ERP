alter table public.items
  add column if not exists zig_product_id text;

create unique index if not exists items_business_zig_product_uidx
  on public.items (business_id, zig_product_id)
  where zig_product_id is not null;

create table public.zig_sync_state (
  business_id bigint not null references public.businesses(id) on delete cascade,
  endpoint text not null,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_successful_date date,
  status text not null default 'idle',
  rows_received integer not null default 0,
  error_message text,
  updated_at timestamptz not null default now(),
  primary key (business_id, endpoint),
  constraint zig_sync_state_endpoint_valid check (endpoint in ('saida-produtos', 'faturamento')),
  constraint zig_sync_state_status_valid check (status in ('idle', 'running', 'completed', 'partial', 'failed')),
  constraint zig_sync_state_rows_nonnegative check (rows_received >= 0)
);

create table public.zig_sync_runs (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  endpoint text not null,
  requested_date date not null,
  status text not null default 'running',
  attempt_number integer not null default 1,
  http_status integer,
  row_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint zig_sync_runs_endpoint_valid check (endpoint in ('saida-produtos', 'faturamento')),
  constraint zig_sync_runs_status_valid check (status in ('running', 'completed', 'failed')),
  constraint zig_sync_runs_attempt_positive check (attempt_number > 0),
  constraint zig_sync_runs_rows_nonnegative check (row_count >= 0)
);

create table public.zig_sales_transactions (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  zig_transaction_id text not null,
  transaction_at timestamptz not null,
  operational_date date not null,
  event_id text,
  event_name text,
  event_date date,
  invoice_id text,
  employee_name text,
  sale_type text,
  source text,
  bar_id text,
  bar_name text,
  is_refunded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, zig_transaction_id),
  constraint zig_sales_transactions_id_not_blank check (length(trim(zig_transaction_id)) > 0)
);

create table public.zig_transaction_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  transaction_id bigint not null references public.zig_sales_transactions(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete restrict,
  line_key text not null,
  zig_product_id text,
  product_sku text,
  product_name text not null,
  product_category text,
  quantity numeric(14,4) not null,
  fractional_amount numeric(14,4),
  fraction_unit text,
  unit_value_cents bigint not null,
  gross_amount_cents bigint not null,
  discount_amount_cents bigint not null default 0,
  net_amount_cents bigint not null,
  additions jsonb not null default '[]'::jsonb,
  product_type text,
  kind_id text,
  system_product boolean,
  observation text,
  is_refunded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, line_key),
  constraint zig_transaction_items_line_key_not_blank check (length(trim(line_key)) >= 16),
  constraint zig_transaction_items_name_not_blank check (length(trim(product_name)) > 0),
  constraint zig_transaction_items_quantity_nonnegative check (quantity >= 0),
  constraint zig_transaction_items_unit_value_nonnegative check (unit_value_cents >= 0),
  constraint zig_transaction_items_gross_nonnegative check (gross_amount_cents >= 0),
  constraint zig_transaction_items_discount_nonnegative check (discount_amount_cents >= 0),
  constraint zig_transaction_items_net_valid check (net_amount_cents = gross_amount_cents - discount_amount_cents)
);

create table public.zig_payment_totals (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  operational_date date not null,
  payment_key text not null,
  payment_id text,
  payment_name text not null,
  event_id text,
  event_date date,
  value_cents bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, operational_date, payment_key),
  constraint zig_payment_totals_key_not_blank check (length(trim(payment_key)) >= 16),
  constraint zig_payment_totals_name_not_blank check (length(trim(payment_name)) > 0),
  constraint zig_payment_totals_value_nonnegative check (value_cents >= 0)
);

create index zig_sync_runs_business_date_idx
  on public.zig_sync_runs (business_id, requested_date desc, endpoint);
create index zig_sales_transactions_business_date_idx
  on public.zig_sales_transactions (business_id, operational_date desc);
create index zig_sales_transactions_event_idx
  on public.zig_sales_transactions (business_id, event_date, event_id);
create index zig_transaction_items_business_transaction_idx
  on public.zig_transaction_items (business_id, transaction_id);
create index zig_transaction_items_item_id_idx
  on public.zig_transaction_items (item_id);
create index zig_transaction_items_product_id_idx
  on public.zig_transaction_items (business_id, zig_product_id)
  where zig_product_id is not null;
create index zig_payment_totals_business_date_idx
  on public.zig_payment_totals (business_id, operational_date desc);

alter table public.zig_sync_state enable row level security;
alter table public.zig_sync_runs enable row level security;
alter table public.zig_sales_transactions enable row level security;
alter table public.zig_transaction_items enable row level security;
alter table public.zig_payment_totals enable row level security;

create policy zig_sync_state_member_select
on public.zig_sync_state for select to authenticated
using ((select private.is_business_member(business_id)));

create policy zig_sync_runs_member_select
on public.zig_sync_runs for select to authenticated
using ((select private.is_business_member(business_id)));

create policy zig_sales_transactions_member_select
on public.zig_sales_transactions for select to authenticated
using ((select private.is_business_member(business_id)));

create policy zig_transaction_items_member_select
on public.zig_transaction_items for select to authenticated
using ((select private.is_business_member(business_id)));

create policy zig_payment_totals_member_select
on public.zig_payment_totals for select to authenticated
using ((select private.is_business_member(business_id)));

grant select on table
  public.zig_sync_state,
  public.zig_sync_runs,
  public.zig_sales_transactions,
  public.zig_transaction_items,
  public.zig_payment_totals
to authenticated;

grant select, insert, update, delete on table
  public.zig_sync_state,
  public.zig_sync_runs,
  public.zig_sales_transactions,
  public.zig_transaction_items,
  public.zig_payment_totals
to service_role;

grant usage, select on sequence
  public.zig_sync_runs_id_seq,
  public.zig_sales_transactions_id_seq,
  public.zig_transaction_items_id_seq,
  public.zig_payment_totals_id_seq
to service_role;

create or replace function public.sync_zig_products_day(
  p_business_id bigint,
  p_operational_date date,
  p_rows jsonb,
  p_run_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_transaction_id bigint;
  v_item_id bigint;
  v_category_id bigint;
  v_area_id bigint;
  v_product_name text;
  v_category_name text;
  v_area_name text;
  v_product_id text;
  v_sku text;
  v_unit_cents bigint;
  v_count integer := 0;
begin
  if p_operational_date is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Payload de produtos Zig inválido';
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id and is_active) then
    raise exception 'Negócio inválido ou inativo';
  end if;

  delete from public.zig_sales_transactions t
  where t.business_id = p_business_id
    and (
      t.operational_date = p_operational_date
      or t.zig_transaction_id in (
        select distinct entry ->> 'transaction_id'
        from jsonb_array_elements(p_rows) entry
        where nullif(trim(entry ->> 'transaction_id'), '') is not null
      )
    );

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_product_name := trim(v_row ->> 'product_name');
    v_product_id := nullif(trim(v_row ->> 'product_id'), '');
    v_sku := nullif(trim(v_row ->> 'product_sku'), '');
    v_category_name := coalesce(nullif(trim(v_row ->> 'product_category'), ''), 'Sem categoria');
    v_area_name := coalesce(nullif(trim(v_row ->> 'bar_name'), ''), 'Geral');
    v_unit_cents := coalesce((v_row ->> 'unit_value_cents')::bigint, 0);

    if nullif(trim(v_row ->> 'transaction_id'), '') is null or v_product_name = '' then
      raise exception 'Linha Zig sem transação ou produto';
    end if;

    select c.id into v_category_id
    from public.categories c
    where c.business_id = p_business_id
      and c.kind = 'product'::public.item_type
      and lower(c.name) = lower(v_category_name)
    order by c.id
    limit 1;

    if v_category_id is null then
      insert into public.categories (business_id, name, kind)
      values (p_business_id, v_category_name, 'product'::public.item_type)
      on conflict (business_id, name, kind)
      do update set is_active = true, updated_at = now()
      returning id into v_category_id;
    end if;

    select a.id into v_area_id
    from public.areas a
    where a.business_id = p_business_id and lower(a.name) = lower(v_area_name)
    order by a.id
    limit 1;

    if v_area_id is null then
      insert into public.areas (business_id, name, slug, sort_order)
      values (p_business_id, v_area_name, 'zig-' || substr(md5(lower(v_area_name)), 1, 16), 100)
      on conflict (business_id, slug)
      do update set name = excluded.name, is_active = true, updated_at = now()
      returning id into v_area_id;
    end if;

    select i.id into v_item_id
    from public.items i
    where i.business_id = p_business_id
      and i.item_type = 'product'::public.item_type
      and (
        (v_product_id is not null and i.zig_product_id = v_product_id)
        or (v_sku is not null and i.sku = v_sku)
        or lower(i.name) = lower(v_product_name)
      )
    order by
      case when v_product_id is not null and i.zig_product_id = v_product_id then 0
           when v_sku is not null and i.sku = v_sku then 1 else 2 end,
      i.id
    limit 1;

    if v_item_id is null then
      insert into public.items (
        business_id, area_id, category_id, name, sku, zig_product_id,
        item_type, consumption_unit, sale_price, is_active
      ) values (
        p_business_id, v_area_id, v_category_id, v_product_name, v_sku, v_product_id,
        'product'::public.item_type, 'un', v_unit_cents::numeric / 100, true
      )
      returning id into v_item_id;
    else
      update public.items
      set area_id = v_area_id,
          category_id = v_category_id,
          name = v_product_name,
          sku = coalesce(v_sku, sku),
          zig_product_id = coalesce(v_product_id, zig_product_id),
          sale_price = v_unit_cents::numeric / 100,
          is_active = true,
          updated_at = now()
      where id = v_item_id and business_id = p_business_id;
    end if;

    insert into public.zig_sales_transactions (
      business_id, zig_transaction_id, transaction_at, operational_date,
      event_id, event_name, event_date, invoice_id, employee_name, sale_type,
      source, bar_id, bar_name, is_refunded
    ) values (
      p_business_id, v_row ->> 'transaction_id', (v_row ->> 'transaction_at')::timestamptz,
      p_operational_date, nullif(v_row ->> 'event_id', ''), nullif(v_row ->> 'event_name', ''),
      nullif(v_row ->> 'event_date', '')::date, nullif(v_row ->> 'invoice_id', ''),
      nullif(v_row ->> 'employee_name', ''), nullif(v_row ->> 'sale_type', ''),
      nullif(v_row ->> 'source', ''), nullif(v_row ->> 'bar_id', ''),
      nullif(v_row ->> 'bar_name', ''), coalesce((v_row ->> 'is_refunded')::boolean, false)
    )
    on conflict (business_id, zig_transaction_id)
    do update set
      transaction_at = excluded.transaction_at,
      operational_date = excluded.operational_date,
      event_id = coalesce(excluded.event_id, public.zig_sales_transactions.event_id),
      event_name = coalesce(excluded.event_name, public.zig_sales_transactions.event_name),
      event_date = coalesce(excluded.event_date, public.zig_sales_transactions.event_date),
      invoice_id = coalesce(excluded.invoice_id, public.zig_sales_transactions.invoice_id),
      employee_name = coalesce(excluded.employee_name, public.zig_sales_transactions.employee_name),
      sale_type = coalesce(excluded.sale_type, public.zig_sales_transactions.sale_type),
      source = coalesce(excluded.source, public.zig_sales_transactions.source),
      bar_id = coalesce(excluded.bar_id, public.zig_sales_transactions.bar_id),
      bar_name = coalesce(excluded.bar_name, public.zig_sales_transactions.bar_name),
      is_refunded = public.zig_sales_transactions.is_refunded and excluded.is_refunded,
      updated_at = now()
    returning id into v_transaction_id;

    insert into public.zig_transaction_items (
      business_id, transaction_id, item_id, line_key, zig_product_id, product_sku,
      product_name, product_category, quantity, unit_value_cents, gross_amount_cents,
      fractional_amount, fraction_unit, discount_amount_cents, net_amount_cents,
      additions, product_type, kind_id,
      system_product, observation, is_refunded
    ) values (
      p_business_id, v_transaction_id, v_item_id, v_row ->> 'line_key', v_product_id, v_sku,
      v_product_name, v_category_name, (v_row ->> 'quantity')::numeric, v_unit_cents,
      (v_row ->> 'gross_amount_cents')::bigint,
      nullif(v_row ->> 'fractional_amount', '')::numeric, nullif(v_row ->> 'fraction_unit', ''),
      (v_row ->> 'discount_amount_cents')::bigint,
      (v_row ->> 'net_amount_cents')::bigint, coalesce(v_row -> 'additions', '[]'::jsonb),
      nullif(v_row ->> 'product_type', ''), nullif(v_row ->> 'kind_id', ''),
      nullif(v_row ->> 'system_product', '')::boolean, nullif(v_row ->> 'observation', ''),
      coalesce((v_row ->> 'is_refunded')::boolean, false)
    );

    v_count := v_count + 1;
  end loop;

  insert into public.zig_sync_state (
    business_id, endpoint, last_attempt_at, last_success_at, last_successful_date,
    status, rows_received, error_message, updated_at
  ) values (
    p_business_id, 'saida-produtos', now(), now(), p_operational_date,
    'completed', v_count, null, now()
  )
  on conflict (business_id, endpoint)
  do update set last_attempt_at = now(), last_success_at = now(),
    last_successful_date = excluded.last_successful_date, status = 'completed',
    rows_received = excluded.rows_received, error_message = null, updated_at = now();

  if p_run_id is not null then
    update public.zig_sync_runs
    set status = 'completed', row_count = v_count, completed_at = now(), error_message = null
    where id = p_run_id and business_id = p_business_id;
  end if;

  return jsonb_build_object('date', p_operational_date, 'rows', v_count);
end;
$$;

create or replace function public.sync_zig_revenue_day(
  p_business_id bigint,
  p_operational_date date,
  p_rows jsonb,
  p_run_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_count integer := 0;
  v_total bigint := 0;
begin
  if p_operational_date is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Payload de faturamento Zig inválido';
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id and is_active) then
    raise exception 'Negócio inválido ou inativo';
  end if;

  delete from public.zig_payment_totals
  where business_id = p_business_id and operational_date = p_operational_date;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    insert into public.zig_payment_totals (
      business_id, operational_date, payment_key, payment_id, payment_name,
      event_id, event_date, value_cents
    ) values (
      p_business_id, p_operational_date, v_row ->> 'payment_key',
      nullif(v_row ->> 'payment_id', ''), trim(v_row ->> 'payment_name'),
      nullif(v_row ->> 'event_id', ''), nullif(v_row ->> 'event_date', '')::date,
      (v_row ->> 'value_cents')::bigint
    );
    v_count := v_count + 1;
    v_total := v_total + (v_row ->> 'value_cents')::bigint;
  end loop;

  insert into public.zig_sync_state (
    business_id, endpoint, last_attempt_at, last_success_at, last_successful_date,
    status, rows_received, error_message, updated_at
  ) values (
    p_business_id, 'faturamento', now(), now(), p_operational_date,
    'completed', v_count, null, now()
  )
  on conflict (business_id, endpoint)
  do update set last_attempt_at = now(), last_success_at = now(),
    last_successful_date = excluded.last_successful_date, status = 'completed',
    rows_received = excluded.rows_received, error_message = null, updated_at = now();

  if p_run_id is not null then
    update public.zig_sync_runs
    set status = 'completed', row_count = v_count, completed_at = now(), error_message = null
    where id = p_run_id and business_id = p_business_id;
  end if;

  return jsonb_build_object('date', p_operational_date, 'rows', v_count, 'total_cents', v_total);
end;
$$;

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
          sum(i2.discount_amount_cents) as discount_cents, sum(i2.net_amount_cents) as net_cents
        from public.zig_transaction_items i2
        join public.zig_sales_transactions t2 on t2.id = i2.transaction_id
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

revoke all on function public.sync_zig_products_day(bigint, date, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.sync_zig_products_day(bigint, date, jsonb, bigint) to service_role;

revoke all on function public.sync_zig_revenue_day(bigint, date, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.sync_zig_revenue_day(bigint, date, jsonb, bigint) to service_role;

revoke all on function public.get_zig_sales_dashboard(bigint, date, date) from public, anon;
grant execute on function public.get_zig_sales_dashboard(bigint, date, date) to authenticated;
