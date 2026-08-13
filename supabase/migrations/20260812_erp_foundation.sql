-- Dopamina ERP: foundational, centralized schema.

create schema if not exists private;
revoke all on schema private from public, anon;

create type public.member_role as enum ('owner', 'manager');
create type public.member_status as enum ('pending', 'active', 'suspended');
create type public.item_type as enum ('ingredient', 'product', 'consumable');
create type public.movement_type as enum ('purchase', 'sale', 'loss', 'adjustment_in', 'adjustment_out', 'inventory');
create type public.record_status as enum ('draft', 'pending', 'completed', 'cancelled');
create type public.forecast_type as enum ('revenue', 'expense');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_not_blank check (length(trim(full_name)) > 0),
  constraint profiles_email_not_blank check (length(trim(email)) > 3)
);
create unique index profiles_email_lower_uidx on public.profiles (lower(email));

create table public.businesses (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/Sao_Paulo',
  currency text not null default 'BRL',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_name_not_blank check (length(trim(name)) > 0),
  constraint businesses_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.business_members (
  business_id bigint not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'manager',
  status public.member_status not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_id_idx on public.business_members (user_id);
create unique index business_members_single_active_owner_idx
  on public.business_members (business_id)
  where role = 'owner' and status = 'active';

create table public.areas (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  name text not null,
  slug text not null,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug),
  constraint areas_name_not_blank check (length(trim(name)) > 0)
);
create index areas_business_id_idx on public.areas (business_id);

create table public.categories (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  parent_id bigint references public.categories(id) on delete set null,
  name text not null,
  kind public.item_type not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name, kind),
  constraint categories_name_not_blank check (length(trim(name)) > 0)
);
create index categories_business_id_idx on public.categories (business_id);
create index categories_parent_id_idx on public.categories (parent_id);

create table public.suppliers (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  document text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  constraint suppliers_name_not_blank check (length(trim(name)) > 0)
);
create index suppliers_business_id_idx on public.suppliers (business_id);

create table public.items (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  area_id bigint references public.areas(id) on delete set null,
  category_id bigint references public.categories(id) on delete set null,
  name text not null,
  sku text,
  item_type public.item_type not null,
  purchase_unit text,
  purchase_pack_quantity numeric(14,4),
  consumption_unit text not null,
  minimum_stock numeric(14,4) not null default 0,
  sale_price numeric(14,2),
  latest_unit_cost numeric(14,4),
  average_unit_cost numeric(14,4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name, item_type),
  constraint items_name_not_blank check (length(trim(name)) > 0),
  constraint items_pack_quantity_positive check (purchase_pack_quantity is null or purchase_pack_quantity > 0),
  constraint items_minimum_stock_nonnegative check (minimum_stock >= 0),
  constraint items_sale_price_nonnegative check (sale_price is null or sale_price >= 0),
  constraint items_latest_cost_nonnegative check (latest_unit_cost is null or latest_unit_cost >= 0),
  constraint items_average_cost_nonnegative check (average_unit_cost is null or average_unit_cost >= 0)
);
create index items_business_id_idx on public.items (business_id);
create index items_area_id_idx on public.items (area_id);
create index items_category_id_idx on public.items (category_id);
create index items_business_type_active_idx on public.items (business_id, item_type, is_active);

create table public.recipes (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  product_id bigint not null references public.items(id) on delete cascade,
  yield_quantity numeric(14,4) not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, product_id),
  constraint recipes_yield_positive check (yield_quantity > 0)
);
create index recipes_business_id_idx on public.recipes (business_id);
create index recipes_product_id_idx on public.recipes (product_id);

create table public.recipe_items (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  ingredient_id bigint not null references public.items(id) on delete restrict,
  quantity numeric(14,4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, ingredient_id),
  constraint recipe_items_quantity_positive check (quantity > 0)
);
create index recipe_items_recipe_id_idx on public.recipe_items (recipe_id);
create index recipe_items_ingredient_id_idx on public.recipe_items (ingredient_id);

create table public.purchases (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  supplier_id bigint references public.suppliers(id) on delete set null,
  purchase_date date not null,
  invoice_number text,
  status public.record_status not null default 'completed',
  total_amount numeric(14,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_total_nonnegative check (total_amount >= 0)
);
create index purchases_business_id_idx on public.purchases (business_id);
create index purchases_supplier_id_idx on public.purchases (supplier_id);
create index purchases_created_by_idx on public.purchases (created_by);
create index purchases_business_date_idx on public.purchases (business_id, purchase_date desc);

create table public.purchase_items (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete restrict,
  quantity numeric(14,4) not null,
  pack_quantity numeric(14,4) not null default 1,
  unit_cost numeric(14,4) not null,
  total_cost numeric(14,2) generated always as (round(quantity * pack_quantity * unit_cost, 2)) stored,
  created_at timestamptz not null default now(),
  constraint purchase_items_quantity_positive check (quantity > 0),
  constraint purchase_items_pack_positive check (pack_quantity > 0),
  constraint purchase_items_cost_nonnegative check (unit_cost >= 0)
);
create index purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index purchase_items_item_id_idx on public.purchase_items (item_id);

create table public.expenses (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  supplier_id bigint references public.suppliers(id) on delete set null,
  category text not null,
  description text not null,
  expense_date date not null,
  due_date date,
  paid_at timestamptz,
  amount numeric(14,2) not null,
  payment_method text,
  status public.record_status not null default 'pending',
  is_recurring boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_nonnegative check (amount >= 0),
  constraint expenses_description_not_blank check (length(trim(description)) > 0)
);
create index expenses_business_id_idx on public.expenses (business_id);
create index expenses_supplier_id_idx on public.expenses (supplier_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index expenses_business_date_idx on public.expenses (business_id, expense_date desc);

create table public.sales_imports (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  source text not null default 'zig',
  file_name text not null,
  file_checksum text,
  business_date date not null,
  row_count integer not null default 0,
  status public.record_status not null default 'pending',
  error_message text,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (business_id, source, file_checksum),
  constraint sales_imports_row_count_nonnegative check (row_count >= 0)
);
create index sales_imports_business_id_idx on public.sales_imports (business_id);
create index sales_imports_imported_by_idx on public.sales_imports (imported_by);

create table public.sales (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  import_id bigint references public.sales_imports(id) on delete set null,
  business_date date not null,
  external_reference text,
  gross_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) generated always as (gross_amount - discount_amount) stored,
  created_at timestamptz not null default now(),
  unique (business_id, external_reference),
  constraint sales_gross_nonnegative check (gross_amount >= 0),
  constraint sales_discount_nonnegative check (discount_amount >= 0),
  constraint sales_discount_valid check (discount_amount <= gross_amount)
);
create index sales_business_id_idx on public.sales (business_id);
create index sales_import_id_idx on public.sales (import_id);
create index sales_business_date_idx on public.sales (business_id, business_date desc);

create table public.sale_items (
  id bigint generated always as identity primary key,
  sale_id bigint not null references public.sales(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete restrict,
  area_id bigint references public.areas(id) on delete set null,
  quantity numeric(14,4) not null,
  gross_amount numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint sale_items_quantity_positive check (quantity > 0),
  constraint sale_items_gross_nonnegative check (gross_amount >= 0),
  constraint sale_items_discount_nonnegative check (discount_amount >= 0),
  constraint sale_items_discount_valid check (discount_amount <= gross_amount)
);
create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_item_id_idx on public.sale_items (item_id);
create index sale_items_area_id_idx on public.sale_items (area_id);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete restrict,
  movement_type public.movement_type not null,
  quantity numeric(14,4) not null,
  unit_cost numeric(14,4),
  occurred_at timestamptz not null default now(),
  source_table text,
  source_id bigint,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_quantity_nonzero check (quantity <> 0),
  constraint stock_movements_cost_nonnegative check (unit_cost is null or unit_cost >= 0)
);
create index stock_movements_business_id_idx on public.stock_movements (business_id);
create index stock_movements_item_id_idx on public.stock_movements (item_id);
create index stock_movements_created_by_idx on public.stock_movements (created_by);
create index stock_movements_item_date_idx on public.stock_movements (item_id, occurred_at desc);

create table public.inventory_counts (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  counted_at timestamptz not null default now(),
  status public.record_status not null default 'draft',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_counts_business_id_idx on public.inventory_counts (business_id);
create index inventory_counts_created_by_idx on public.inventory_counts (created_by);

create table public.inventory_count_items (
  id bigint generated always as identity primary key,
  inventory_count_id bigint not null references public.inventory_counts(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete restrict,
  system_quantity numeric(14,4) not null default 0,
  counted_quantity numeric(14,4) not null,
  variance_quantity numeric(14,4) generated always as (counted_quantity - system_quantity) stored,
  unique (inventory_count_id, item_id),
  constraint inventory_counted_nonnegative check (counted_quantity >= 0)
);
create index inventory_count_items_count_id_idx on public.inventory_count_items (inventory_count_id);
create index inventory_count_items_item_id_idx on public.inventory_count_items (item_id);

create table public.forecasts (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  area_id bigint references public.areas(id) on delete set null,
  forecast_type public.forecast_type not null,
  period_start date not null,
  period_end date not null,
  amount numeric(14,2) not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forecasts_period_valid check (period_end >= period_start),
  constraint forecasts_amount_nonnegative check (amount >= 0)
);
create index forecasts_business_id_idx on public.forecasts (business_id);
create index forecasts_area_id_idx on public.forecasts (area_id);
create index forecasts_created_by_idx on public.forecasts (created_by);
create index forecasts_business_period_idx on public.forecasts (business_id, period_start, period_end);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_business_id_idx on public.audit_logs (business_id);
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_business_created_idx on public.audit_logs (business_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','businesses','business_members','areas','categories','suppliers',
    'items','recipes','recipe_items','purchases','expenses','inventory_counts','forecasts'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end;
$$;

create or replace function private.is_business_member(target_business_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
  );
$$;

create or replace function private.is_business_owner(target_business_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = (select auth.uid())
      and bm.role = 'owner'
      and bm.status = 'active'
  );
$$;

create or replace function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid()) or exists (
    select 1
    from public.business_members viewer
    join public.business_members target on target.business_id = viewer.business_id
    where viewer.user_id = (select auth.uid())
      and viewer.role = 'owner'
      and viewer.status = 'active'
      and target.user_id = target_user_id
  );
$$;

revoke all on function private.is_business_member(bigint) from public, anon;
revoke all on function private.is_business_owner(bigint) from public, anon;
revoke all on function private.can_view_profile(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_business_member(bigint) to authenticated;
grant execute on function private.is_business_owner(bigint) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

insert into public.businesses (name, slug)
values ('Bar Dopamina', 'dopamina')
on conflict (slug) do update set name = excluded.name;

insert into public.areas (business_id, name, slug, color, sort_order)
select b.id, seed.name, seed.slug, seed.color, seed.sort_order
from public.businesses b
cross join (values
  ('Cerveja', 'cerveja', '#8b5cf6', 1),
  ('Drinks', 'drinks', '#d946ef', 2),
  ('Cozinha', 'cozinha', '#f59e0b', 3),
  ('Churrasqueira', 'churrasqueira', '#ef4444', 4),
  ('Geral', 'geral', '#64748b', 5)
) as seed(name, slug, color, sort_order)
where b.slug = 'dopamina'
on conflict (business_id, slug) do nothing;

insert into public.categories (business_id, name, kind)
select b.id, seed.name, seed.kind::public.item_type
from public.businesses b
cross join (values
  ('Cervejas', 'product'), ('Drinks', 'product'), ('Copões', 'product'),
  ('Petiscos e porções', 'product'), ('Espetos', 'product'), ('Jantinhas', 'product'),
  ('Não alcoólicas', 'product'), ('Ingredientes de cozinha', 'ingredient'),
  ('Ingredientes de bar', 'ingredient'), ('Ingredientes de churrasqueira', 'ingredient'),
  ('Limpeza e descartáveis', 'consumable')
) as seed(name, kind)
where b.slug = 'dopamina'
on conflict (business_id, name, kind) do nothing;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_business_id bigint;
begin
  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  );

  select id into target_business_id
  from public.businesses
  where slug = 'dopamina'
  limit 1;

  insert into public.business_members (business_id, user_id, role, status)
  values (
    target_business_id,
    new.id,
    'manager'::public.member_role,
    'pending'::public.member_status
  );

  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.areas enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.expenses enable row level security;
alter table public.sales_imports enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_items enable row level security;
alter table public.forecasts enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using ((select private.can_view_profile(user_id)));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy businesses_select on public.businesses for select to authenticated
  using ((select private.is_business_member(id)));
create policy businesses_update_owner on public.businesses for update to authenticated
  using ((select private.is_business_owner(id)))
  with check ((select private.is_business_owner(id)));

create policy business_members_select on public.business_members for select to authenticated
  using ((select private.is_business_member(business_id)) or user_id = (select auth.uid()));
create policy business_members_insert_owner on public.business_members for insert to authenticated
  with check ((select private.is_business_owner(business_id)));
create policy business_members_update_owner on public.business_members for update to authenticated
  using ((select private.is_business_owner(business_id)))
  with check ((select private.is_business_owner(business_id)));
create policy business_members_delete_owner on public.business_members for delete to authenticated
  using ((select private.is_business_owner(business_id)) and role <> 'owner');

create policy areas_member_all on public.areas for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy categories_member_all on public.categories for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy suppliers_member_all on public.suppliers for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy items_member_all on public.items for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy recipes_member_all on public.recipes for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy purchases_member_all on public.purchases for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy expenses_member_all on public.expenses for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy sales_imports_member_all on public.sales_imports for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy sales_member_all on public.sales for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy stock_movements_member_all on public.stock_movements for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy inventory_counts_member_all on public.inventory_counts for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy forecasts_member_all on public.forecasts for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.is_business_member(business_id)));
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check ((select private.is_business_member(business_id)) and user_id = (select auth.uid()));

create policy recipe_items_member_all on public.recipe_items for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and (select private.is_business_member(r.business_id))
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and (select private.is_business_member(r.business_id))
  ));
create policy purchase_items_member_all on public.purchase_items for all to authenticated
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_id and (select private.is_business_member(p.business_id))
  ))
  with check (exists (
    select 1 from public.purchases p
    where p.id = purchase_id and (select private.is_business_member(p.business_id))
  ));
create policy sale_items_member_all on public.sale_items for all to authenticated
  using (exists (
    select 1 from public.sales s
    where s.id = sale_id and (select private.is_business_member(s.business_id))
  ))
  with check (exists (
    select 1 from public.sales s
    where s.id = sale_id and (select private.is_business_member(s.business_id))
  ));
create policy inventory_count_items_member_all on public.inventory_count_items for all to authenticated
  using (exists (
    select 1 from public.inventory_counts ic
    where ic.id = inventory_count_id and (select private.is_business_member(ic.business_id))
  ))
  with check (exists (
    select 1 from public.inventory_counts ic
    where ic.id = inventory_count_id and (select private.is_business_member(ic.business_id))
  ));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.audit_logs from anon;
revoke update, delete on public.audit_logs from authenticated;
revoke insert, delete on public.profiles from authenticated;
