create table public.zig_profitability_imports (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  sale_id bigint not null references public.sales(id) on delete cascade,
  file_name text not null,
  file_checksum text not null,
  period_start date not null,
  period_end date not null,
  source_revenue numeric(14,2) not null default 0,
  known_cost_total numeric(14,2) not null default 0,
  row_count integer not null default 0,
  missing_cost_count integer not null default 0,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, file_checksum),
  unique (business_id, period_start, period_end),
  constraint zig_profitability_imports_file_name_not_blank check (length(trim(file_name)) > 0),
  constraint zig_profitability_imports_period_valid check (period_start <= period_end),
  constraint zig_profitability_imports_source_revenue_nonnegative check (source_revenue >= 0),
  constraint zig_profitability_imports_known_cost_nonnegative check (known_cost_total >= 0),
  constraint zig_profitability_imports_row_count_nonnegative check (row_count >= 0),
  constraint zig_profitability_imports_missing_count_valid check (
    missing_cost_count >= 0 and missing_cost_count <= row_count
  )
);

create table public.zig_profitability_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  import_id bigint not null references public.zig_profitability_imports(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete restrict,
  source_product_name text not null,
  source_sku text,
  source_category text,
  quantity numeric(14,4) not null,
  loss_quantity numeric(14,4) not null default 0,
  average_sale_price numeric(14,4) not null,
  gross_amount numeric(14,2) not null,
  unit_cost numeric(14,4),
  total_cost numeric(14,2),
  source_unit_cost numeric(14,4),
  source_total_cost numeric(14,2),
  profit_amount numeric(14,2) not null,
  margin_percentage numeric(8,6) not null,
  cmv_percentage numeric(8,6) not null,
  cost_status text not null,
  source_row_number integer not null,
  created_at timestamptz not null default now(),
  unique (import_id, source_row_number),
  constraint zig_profitability_items_name_not_blank check (length(trim(source_product_name)) > 0),
  constraint zig_profitability_items_quantity_positive check (quantity > 0),
  constraint zig_profitability_items_loss_nonnegative check (loss_quantity >= 0),
  constraint zig_profitability_items_price_nonnegative check (average_sale_price >= 0),
  constraint zig_profitability_items_gross_nonnegative check (gross_amount >= 0),
  constraint zig_profitability_items_unit_cost_nonnegative check (unit_cost is null or unit_cost >= 0),
  constraint zig_profitability_items_total_cost_nonnegative check (total_cost is null or total_cost >= 0),
  constraint zig_profitability_items_profit_valid check (profit_amount <= gross_amount),
  constraint zig_profitability_items_margin_valid check (margin_percentage between 0 and 1),
  constraint zig_profitability_items_cmv_valid check (cmv_percentage between 0 and 1),
  constraint zig_profitability_items_cost_status_valid check (cost_status in ('known', 'missing')),
  constraint zig_profitability_items_cost_consistent check (
    (cost_status = 'missing' and unit_cost is null and total_cost is null)
    or (cost_status = 'known' and unit_cost is not null and total_cost is not null)
  )
);

create table public.zig_abc_imports (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  file_name text not null,
  file_checksum text not null,
  total_value numeric(14,2) not null default 0,
  row_count integer not null default 0,
  missing_cost_count integer not null default 0,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, file_checksum),
  constraint zig_abc_imports_file_name_not_blank check (length(trim(file_name)) > 0),
  constraint zig_abc_imports_total_value_nonnegative check (total_value >= 0),
  constraint zig_abc_imports_row_count_nonnegative check (row_count >= 0),
  constraint zig_abc_imports_missing_count_valid check (
    missing_cost_count >= 0 and missing_cost_count <= row_count
  )
);

create table public.zig_abc_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  import_id bigint not null references public.zig_abc_imports(id) on delete cascade,
  item_id bigint references public.items(id) on delete set null,
  source_product_name text not null,
  source_sku text,
  quantity numeric(14,4) not null,
  average_unit_cost numeric(14,4),
  total_value numeric(14,2) not null,
  cumulative_value numeric(14,2) not null,
  individual_percentage numeric(8,6) not null,
  cumulative_percentage numeric(8,6) not null,
  classification text not null,
  source_row_number integer not null,
  created_at timestamptz not null default now(),
  unique (import_id, source_row_number),
  constraint zig_abc_items_name_not_blank check (length(trim(source_product_name)) > 0),
  constraint zig_abc_items_quantity_nonnegative check (quantity >= 0),
  constraint zig_abc_items_cost_nonnegative check (average_unit_cost is null or average_unit_cost >= 0),
  constraint zig_abc_items_total_nonnegative check (total_value >= 0),
  constraint zig_abc_items_cumulative_nonnegative check (cumulative_value >= 0),
  constraint zig_abc_items_individual_percentage_valid check (individual_percentage between 0 and 1),
  constraint zig_abc_items_cumulative_percentage_valid check (cumulative_percentage between 0 and 1),
  constraint zig_abc_items_classification_valid check (classification in ('A', 'B', 'C'))
);

create index zig_profitability_imports_business_period_idx
  on public.zig_profitability_imports (business_id, period_end desc, period_start desc);
create index zig_profitability_imports_sale_id_idx
  on public.zig_profitability_imports (sale_id);
create index zig_profitability_imports_imported_by_idx
  on public.zig_profitability_imports (imported_by);
create index zig_profitability_items_business_import_idx
  on public.zig_profitability_items (business_id, import_id);
create index zig_profitability_items_item_id_idx
  on public.zig_profitability_items (item_id);
create index zig_profitability_items_missing_cost_idx
  on public.zig_profitability_items (business_id, import_id)
  where cost_status = 'missing';
create index zig_abc_imports_business_created_idx
  on public.zig_abc_imports (business_id, created_at desc);
create index zig_abc_imports_imported_by_idx
  on public.zig_abc_imports (imported_by);
create index zig_abc_items_business_import_idx
  on public.zig_abc_items (business_id, import_id);
create index zig_abc_items_item_id_idx
  on public.zig_abc_items (item_id);

alter table public.zig_profitability_imports enable row level security;
alter table public.zig_profitability_items enable row level security;
alter table public.zig_abc_imports enable row level security;
alter table public.zig_abc_items enable row level security;

create policy zig_profitability_imports_member_all
on public.zig_profitability_imports for all to authenticated
using ((select private.is_business_member(business_id)))
with check ((select private.is_business_member(business_id)));

create policy zig_profitability_items_member_all
on public.zig_profitability_items for all to authenticated
using ((select private.is_business_member(business_id)))
with check ((select private.is_business_member(business_id)));

create policy zig_abc_imports_member_all
on public.zig_abc_imports for all to authenticated
using ((select private.is_business_member(business_id)))
with check ((select private.is_business_member(business_id)));

create policy zig_abc_items_member_all
on public.zig_abc_items for all to authenticated
using ((select private.is_business_member(business_id)))
with check ((select private.is_business_member(business_id)));

grant select, insert, update, delete on table
  public.zig_profitability_imports,
  public.zig_profitability_items,
  public.zig_abc_imports,
  public.zig_abc_items
to authenticated;

grant usage, select on sequence
  public.zig_profitability_imports_id_seq,
  public.zig_profitability_items_id_seq,
  public.zig_abc_imports_id_seq,
  public.zig_abc_items_id_seq
to authenticated;

create or replace function public.import_zig_profitability(
  p_business_id bigint,
  p_file_name text,
  p_file_checksum text,
  p_period_start date,
  p_period_end date,
  p_rows jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import_id bigint;
  v_sale_id bigint;
  v_sales_import_id bigint;
  v_sales_revenue numeric;
  v_sales_quantity numeric;
  v_source_revenue numeric;
  v_source_quantity numeric;
  v_known_cost numeric;
  v_missing_count integer;
  v_row_count integer;
  v_row jsonb;
  v_item_id bigint;
  v_category_id bigint;
  v_name text;
  v_sku text;
  v_category text;
  v_quantity numeric;
  v_gross numeric;
  v_source_unit_cost numeric;
  v_source_total_cost numeric;
  v_cost_missing boolean;
  v_unit_cost numeric;
  v_total_cost numeric;
  v_profit numeric;
  v_cmv numeric;
  v_margin numeric;
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
    raise exception 'Identificador do arquivo inválido';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Relatório de CMV vazio ou inválido';
  end if;

  select id into v_import_id
  from public.zig_profitability_imports
  where business_id = p_business_id and file_checksum = p_file_checksum
  limit 1;

  if v_import_id is not null then
    return v_import_id;
  end if;

  select s.id, s.import_id, s.product_gross_amount
  into v_sale_id, v_sales_import_id, v_sales_revenue
  from public.sales s
  where s.business_id = p_business_id
    and s.period_start = p_period_start
    and s.period_end = p_period_end
  order by s.created_at desc
  limit 1;

  if v_sale_id is null then
    raise exception 'Importe primeiro o fechamento e os produtos vendidos deste período';
  end if;

  select coalesce(sum(si.quantity), 0)
  into v_sales_quantity
  from public.sale_items si
  where si.sale_id = v_sale_id;

  select
    coalesce(round(sum((entry ->> 'gross_amount')::numeric), 2), 0),
    coalesce(sum((entry ->> 'quantity')::numeric), 0),
    coalesce(round(sum(case when coalesce((entry ->> 'cost_missing')::boolean, true) then 0 else (entry ->> 'total_cost')::numeric end), 2), 0),
    count(*) filter (where coalesce((entry ->> 'cost_missing')::boolean, true)),
    count(*)
  into v_source_revenue, v_source_quantity, v_known_cost, v_missing_count, v_row_count
  from jsonb_array_elements(p_rows) entry;

  if abs(v_source_quantity - v_sales_quantity) > 0.0001 then
    raise exception 'A quantidade do CMV não confere com os produtos vendidos';
  end if;

  if abs(v_source_revenue - v_sales_revenue) > greatest(10, v_sales_revenue * 0.001) then
    raise exception 'O faturamento do CMV não confere com os produtos vendidos';
  end if;

  delete from public.zig_profitability_imports
  where business_id = p_business_id
    and period_start = p_period_start
    and period_end = p_period_end;

  insert into public.zig_profitability_imports (
    business_id, sale_id, file_name, file_checksum, period_start, period_end,
    source_revenue, known_cost_total, row_count, missing_cost_count, imported_by
  ) values (
    p_business_id, v_sale_id, trim(p_file_name), p_file_checksum, p_period_start, p_period_end,
    v_source_revenue, v_known_cost, v_row_count, v_missing_count, (select auth.uid())
  ) returning id into v_import_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := trim(v_row ->> 'name');
    v_sku := nullif(trim(v_row ->> 'sku'), '');
    v_category := coalesce(nullif(trim(v_row ->> 'category'), ''), 'Sem categoria');
    v_quantity := (v_row ->> 'quantity')::numeric;
    v_gross := (v_row ->> 'gross_amount')::numeric;
    v_source_unit_cost := nullif(v_row ->> 'unit_cost', '')::numeric;
    v_source_total_cost := nullif(v_row ->> 'total_cost', '')::numeric;
    v_cost_missing := coalesce((v_row ->> 'cost_missing')::boolean, true)
      or coalesce(v_source_unit_cost, 0) <= 0;

    if v_name is null or v_name = '' then
      raise exception 'Produto sem nome na linha %', v_row ->> 'source_row_number';
    end if;

    select i.id into v_item_id
    from public.items i
    where i.business_id = p_business_id
      and i.item_type = 'product'::public.item_type
      and ((v_sku is not null and i.sku = v_sku) or i.name = v_name)
    order by case when v_sku is not null and i.sku = v_sku then 0 else 1 end, i.id
    limit 1;

    if v_item_id is null then
      insert into public.categories (business_id, name, kind)
      values (p_business_id, v_category, 'product'::public.item_type)
      on conflict (business_id, name, kind)
      do update set is_active = true, updated_at = now()
      returning id into v_category_id;

      insert into public.items (
        business_id, category_id, name, sku, item_type, consumption_unit, sale_price, is_active
      ) values (
        p_business_id, v_category_id, v_name, v_sku, 'product'::public.item_type,
        'un', nullif(v_row ->> 'average_sale_price', '')::numeric, true
      )
      on conflict (business_id, name, item_type)
      do update set sku = coalesce(public.items.sku, excluded.sku), updated_at = now()
      returning id into v_item_id;
    end if;

    if v_cost_missing then
      v_unit_cost := null;
      v_total_cost := null;
      v_profit := v_gross;
      v_cmv := 0;
      v_margin := case when v_gross > 0 then 1 else 0 end;
    else
      v_unit_cost := v_source_unit_cost;
      v_total_cost := v_source_total_cost;
      v_profit := round(v_gross - v_total_cost, 2);
      v_cmv := case when v_gross > 0 then least(1, greatest(0, v_total_cost / v_gross)) else 0 end;
      v_margin := 1 - v_cmv;

      update public.items
      set latest_unit_cost = v_unit_cost,
          average_unit_cost = v_unit_cost,
          updated_at = now()
      where id = v_item_id and business_id = p_business_id;
    end if;

    insert into public.zig_profitability_items (
      business_id, import_id, item_id, source_product_name, source_sku, source_category,
      quantity, loss_quantity, average_sale_price, gross_amount, unit_cost, total_cost,
      source_unit_cost, source_total_cost, profit_amount, margin_percentage, cmv_percentage,
      cost_status, source_row_number
    ) values (
      p_business_id, v_import_id, v_item_id, v_name, v_sku, v_category,
      v_quantity, coalesce(nullif(v_row ->> 'loss_quantity', '')::numeric, 0),
      (v_row ->> 'average_sale_price')::numeric, v_gross, v_unit_cost, v_total_cost,
      v_source_unit_cost, v_source_total_cost, v_profit, v_margin, v_cmv,
      case when v_cost_missing then 'missing' else 'known' end,
      (v_row ->> 'source_row_number')::integer
    );
  end loop;

  insert into public.audit_logs (business_id, user_id, action, entity_table, entity_id, details)
  values (
    p_business_id, (select auth.uid()), 'import', 'zig_profitability_import', v_import_id::text,
    jsonb_build_object(
      'sales_import_id', v_sales_import_id,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'rows', v_row_count,
      'known_cost_total', v_known_cost,
      'missing_cost_count', v_missing_count
    )
  );

  return v_import_id;
end;
$$;

create or replace function public.import_zig_abc(
  p_business_id bigint,
  p_file_name text,
  p_file_checksum text,
  p_rows jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import_id bigint;
  v_total_value numeric;
  v_missing_count integer;
  v_row_count integer;
  v_row jsonb;
  v_item_id bigint;
  v_name text;
  v_sku text;
  v_cost numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;

  if p_file_checksum is null or length(trim(p_file_checksum)) < 16 then
    raise exception 'Identificador do arquivo inválido';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Relatório de Curva ABC vazio ou inválido';
  end if;

  select id into v_import_id
  from public.zig_abc_imports
  where business_id = p_business_id and file_checksum = p_file_checksum
  limit 1;

  if v_import_id is not null then
    return v_import_id;
  end if;

  select
    coalesce(max((entry ->> 'cumulative_value')::numeric), 0),
    count(*) filter (where coalesce((entry ->> 'cost_missing')::boolean, true)),
    count(*)
  into v_total_value, v_missing_count, v_row_count
  from jsonb_array_elements(p_rows) entry;

  insert into public.zig_abc_imports (
    business_id, file_name, file_checksum, total_value, row_count, missing_cost_count, imported_by
  ) values (
    p_business_id, trim(p_file_name), p_file_checksum, v_total_value,
    v_row_count, v_missing_count, (select auth.uid())
  ) returning id into v_import_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := trim(v_row ->> 'name');
    v_sku := nullif(trim(v_row ->> 'sku'), '');
    v_cost := nullif(v_row ->> 'average_unit_cost', '')::numeric;

    select i.id into v_item_id
    from public.items i
    where i.business_id = p_business_id
      and ((v_sku is not null and i.sku = v_sku) or i.name = v_name)
    order by case when v_sku is not null and i.sku = v_sku then 0 else 1 end, i.id
    limit 1;

    insert into public.zig_abc_items (
      business_id, import_id, item_id, source_product_name, source_sku, quantity,
      average_unit_cost, total_value, cumulative_value, individual_percentage,
      cumulative_percentage, classification, source_row_number
    ) values (
      p_business_id, v_import_id, v_item_id, v_name, v_sku,
      (v_row ->> 'quantity')::numeric,
      case when coalesce((v_row ->> 'cost_missing')::boolean, true) then null else v_cost end,
      (v_row ->> 'total_value')::numeric,
      (v_row ->> 'cumulative_value')::numeric,
      (v_row ->> 'individual_percentage')::numeric,
      (v_row ->> 'cumulative_percentage')::numeric,
      v_row ->> 'classification',
      (v_row ->> 'source_row_number')::integer
    );
  end loop;

  insert into public.audit_logs (business_id, user_id, action, entity_table, entity_id, details)
  values (
    p_business_id, (select auth.uid()), 'import', 'zig_abc_import', v_import_id::text,
    jsonb_build_object('rows', v_row_count, 'total_value', v_total_value, 'missing_cost_count', v_missing_count)
  );

  return v_import_id;
end;
$$;

revoke all on function public.import_zig_profitability(bigint, text, text, date, date, jsonb) from public, anon;
grant execute on function public.import_zig_profitability(bigint, text, text, date, date, jsonb) to authenticated;

revoke all on function public.import_zig_abc(bigint, text, text, jsonb) from public, anon;
grant execute on function public.import_zig_abc(bigint, text, text, jsonb) to authenticated;
