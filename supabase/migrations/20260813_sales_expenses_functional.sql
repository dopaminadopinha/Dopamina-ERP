alter table public.sales_imports
  add column if not exists period_start date,
  add column if not exists period_end date;

alter table public.sales
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists product_gross_amount numeric(14,2) not null default 0,
  add column if not exists service_amount numeric(14,2) not null default 0,
  add column if not exists recharge_balance_amount numeric(14,2) not null default 0,
  add column if not exists closing_net_amount numeric(14,2),
  add column if not exists old_open_accounts_paid_amount numeric(14,2) not null default 0,
  add column if not exists open_accounts_amount numeric(14,2) not null default 0,
  add column if not exists revenue_amount numeric(14,2);

alter table public.sale_items
  add column if not exists unit_price numeric(14,2),
  add column if not exists transaction_type text,
  add column if not exists operation_type text,
  add column if not exists source_status text,
  add column if not exists source_product_type text,
  add column if not exists source_row_number integer;

create table if not exists public.sales_payment_methods (
  id bigint generated always as identity primary key,
  import_id bigint not null references public.sales_imports(id) on delete cascade,
  payment_method text not null,
  amount numeric(14,2) not null,
  percentage numeric(8,6),
  created_at timestamptz not null default now(),
  unique (import_id, payment_method),
  constraint sales_payment_methods_name_not_blank check (length(trim(payment_method)) > 0),
  constraint sales_payment_methods_amount_nonnegative check (amount >= 0),
  constraint sales_payment_methods_percentage_valid check (
    percentage is null or (percentage >= 0 and percentage <= 1)
  )
);

create index if not exists sales_imports_business_period_idx
  on public.sales_imports (business_id, period_end desc, period_start desc);
create index if not exists sales_business_period_idx
  on public.sales (business_id, period_end desc, period_start desc);
create index if not exists sale_items_sale_area_idx
  on public.sale_items (sale_id, area_id);
create index if not exists sales_payment_methods_import_id_idx
  on public.sales_payment_methods (import_id);

alter table public.sales_payment_methods enable row level security;

create policy sales_payment_methods_member_all
on public.sales_payment_methods
for all
to authenticated
using (
  exists (
    select 1
    from public.sales_imports si
    where si.id = import_id
      and (select private.is_business_member(si.business_id))
  )
)
with check (
  exists (
    select 1
    from public.sales_imports si
    where si.id = import_id
      and (select private.is_business_member(si.business_id))
  )
);

grant select, insert, update, delete on public.sales_payment_methods to authenticated;
grant usage, select on sequence public.sales_payment_methods_id_seq to authenticated;

create or replace function public.import_zig_sales(
  p_business_id bigint,
  p_file_name text,
  p_file_checksum text,
  p_period_start date,
  p_period_end date,
  p_summary jsonb,
  p_products jsonb,
  p_payment_methods jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import_id bigint;
  v_sale_id bigint;
  v_category_id bigint;
  v_area_id bigint;
  v_item_id bigint;
  v_product jsonb;
  v_payment jsonb;
  v_product_gross numeric(14,2);
  v_product_discount numeric(14,2);
  v_product_net numeric(14,2);
  v_rows integer;
  v_area_name text;
  v_category_name text;
  v_item_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_period_start is null or p_period_end is null or p_period_start > p_period_end then
    raise exception 'Período inválido';
  end if;

  if p_file_checksum is null or length(trim(p_file_checksum)) < 16 then
    raise exception 'Identificador dos arquivos inválido';
  end if;

  if jsonb_typeof(p_products) <> 'array' or jsonb_typeof(p_payment_methods) <> 'array' then
    raise exception 'Conteúdo dos relatórios inválido';
  end if;

  select id into v_import_id
  from public.sales_imports
  where business_id = p_business_id
    and source = 'zig'
    and file_checksum = p_file_checksum
  limit 1;

  if v_import_id is not null then
    return v_import_id;
  end if;

  if exists (
    select 1
    from public.sales_imports
    where business_id = p_business_id
      and source = 'zig'
      and period_start = p_period_start
      and period_end = p_period_end
      and status = 'completed'::public.record_status
  ) then
    raise exception 'Este período já possui uma importação concluída';
  end if;

  select
    coalesce(round(sum((entry ->> 'gross_amount')::numeric), 2), 0),
    coalesce(round(sum((entry ->> 'discount_amount')::numeric), 2), 0),
    coalesce(round(sum((entry ->> 'net_amount')::numeric), 2), 0),
    count(*)
  into v_product_gross, v_product_discount, v_product_net, v_rows
  from jsonb_array_elements(p_products) entry;

  if abs(v_product_gross - coalesce((p_summary ->> 'product_gross_amount')::numeric, 0)) > 0.02
    or abs(v_product_discount - coalesce((p_summary ->> 'discount_amount')::numeric, 0)) > 0.02
    or abs(v_product_net - (
      coalesce((p_summary ->> 'product_gross_amount')::numeric, 0)
      - coalesce((p_summary ->> 'discount_amount')::numeric, 0)
    )) > 0.02 then
    raise exception 'Os totais do relatório de produtos não conciliam com o fechamento';
  end if;

  insert into public.sales_imports (
    business_id, source, file_name, file_checksum, business_date,
    period_start, period_end, row_count, status, error_message,
    imported_by, completed_at
  )
  values (
    p_business_id, 'zig', trim(p_file_name), p_file_checksum, p_period_end,
    p_period_start, p_period_end, v_rows, 'completed'::public.record_status, null,
    (select auth.uid()), now()
  )
  returning id into v_import_id;

  insert into public.sales (
    business_id, import_id, business_date, external_reference,
    gross_amount, discount_amount, period_start, period_end,
    product_gross_amount, service_amount, recharge_balance_amount,
    closing_net_amount, old_open_accounts_paid_amount,
    open_accounts_amount, revenue_amount
  )
  values (
    p_business_id, v_import_id, p_period_end,
    'zig:' || p_period_start::text || ':' || p_period_end::text,
    coalesce((p_summary ->> 'gross_amount')::numeric, 0),
    coalesce((p_summary ->> 'discount_amount')::numeric, 0),
    p_period_start, p_period_end,
    coalesce((p_summary ->> 'product_gross_amount')::numeric, 0),
    coalesce((p_summary ->> 'service_amount')::numeric, 0),
    coalesce((p_summary ->> 'recharge_balance_amount')::numeric, 0),
    coalesce((p_summary ->> 'closing_net_amount')::numeric, 0),
    coalesce((p_summary ->> 'old_open_accounts_paid_amount')::numeric, 0),
    coalesce((p_summary ->> 'open_accounts_amount')::numeric, 0),
    coalesce((p_summary ->> 'revenue_amount')::numeric, 0)
  )
  returning id into v_sale_id;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    v_item_name := trim(v_product ->> 'name');
    v_category_name := coalesce(nullif(trim(v_product ->> 'category'), ''), 'Sem categoria');
    v_area_name := coalesce(nullif(trim(v_product ->> 'area'), ''), 'Geral');

    if v_item_name is null or v_item_name = '' then
      raise exception 'Produto sem nome na linha %', v_product ->> 'source_row_number';
    end if;

    insert into public.categories (business_id, name, kind)
    values (p_business_id, v_category_name, 'product'::public.item_type)
    on conflict (business_id, name, kind)
    do update set is_active = true, updated_at = now()
    returning id into v_category_id;

    insert into public.areas (business_id, name, slug, sort_order)
    values (
      p_business_id,
      v_area_name,
      'zig-' || substr(md5(lower(v_area_name)), 1, 12),
      100
    )
    on conflict (business_id, slug)
    do update set name = excluded.name, is_active = true, updated_at = now()
    returning id into v_area_id;

    insert into public.items (
      business_id, area_id, category_id, name, sku, item_type,
      consumption_unit, sale_price, is_active
    )
    values (
      p_business_id, v_area_id, v_category_id, v_item_name,
      nullif(trim(v_product ->> 'sku'), ''), 'product'::public.item_type,
      'un', nullif(v_product ->> 'unit_price', '')::numeric,
      coalesce(v_product ->> 'status', '') <> 'Indisponível'
    )
    on conflict (business_id, name, item_type)
    do update set
      category_id = excluded.category_id,
      sku = coalesce(public.items.sku, excluded.sku),
      sale_price = coalesce(public.items.sale_price, excluded.sale_price),
      is_active = excluded.is_active,
      updated_at = now()
    returning id into v_item_id;

    insert into public.sale_items (
      sale_id, item_id, area_id, quantity, gross_amount,
      discount_amount, unit_price, transaction_type, operation_type,
      source_status, source_product_type, source_row_number
    )
    values (
      v_sale_id, v_item_id, v_area_id,
      (v_product ->> 'quantity')::numeric,
      (v_product ->> 'gross_amount')::numeric,
      coalesce((v_product ->> 'discount_amount')::numeric, 0),
      nullif(v_product ->> 'unit_price', '')::numeric,
      nullif(trim(v_product ->> 'transaction_type'), ''),
      nullif(trim(v_product ->> 'operation_type'), ''),
      nullif(trim(v_product ->> 'status'), ''),
      nullif(trim(v_product ->> 'product_type'), ''),
      nullif(v_product ->> 'source_row_number', '')::integer
    );
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payment_methods)
  loop
    insert into public.sales_payment_methods (
      import_id, payment_method, amount, percentage
    )
    values (
      v_import_id,
      trim(v_payment ->> 'payment_method'),
      (v_payment ->> 'amount')::numeric,
      nullif(v_payment ->> 'percentage', '')::numeric
    );
  end loop;

  insert into public.audit_logs (business_id, user_id, action, entity_table, entity_id, details)
  values (
    p_business_id,
    (select auth.uid()),
    'import',
    'sales_import',
    v_import_id::text,
    jsonb_build_object(
      'period_start', p_period_start,
      'period_end', p_period_end,
      'rows', v_rows,
      'revenue_amount', p_summary ->> 'revenue_amount'
    )
  );

  return v_import_id;
end;
$$;

revoke all on function public.import_zig_sales(bigint, text, text, date, date, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_zig_sales(bigint, text, text, date, date, jsonb, jsonb, jsonb) to authenticated;
