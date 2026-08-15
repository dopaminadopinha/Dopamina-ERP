-- Purchases and suppliers built on the original ERP foundation tables.
-- Stock and costs are affected only by confirmed receipts.

alter table public.purchases
  add column if not exists code text,
  add column if not exists fulfillment_status text not null default 'ordered',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_method text,
  add column if not exists due_date date,
  add column if not exists paid_at timestamptz,
  add column if not exists expense_id bigint references public.expenses(id) on delete set null;

alter table public.purchases
  drop constraint if exists purchases_fulfillment_status_valid,
  add constraint purchases_fulfillment_status_valid
    check (fulfillment_status in ('ordered','awaiting','partially_received','received','cancelled')),
  drop constraint if exists purchases_payment_status_valid,
  add constraint purchases_payment_status_valid
    check (payment_status in ('pending','paid'));

create unique index if not exists purchases_business_code_uidx
  on public.purchases (business_id, code) where code is not null;
create index if not exists purchases_business_fulfillment_idx
  on public.purchases (business_id, fulfillment_status, purchase_date desc);
create index if not exists purchases_business_payment_idx
  on public.purchases (business_id, payment_status, due_date);
create index if not exists purchases_expense_id_idx on public.purchases (expense_id);

alter table public.purchase_items
  add column if not exists unit text,
  add column if not exists received_quantity numeric(14,4) not null default 0;

alter table public.purchase_items
  drop constraint if exists purchase_items_received_nonnegative,
  add constraint purchase_items_received_nonnegative check (received_quantity >= 0),
  drop constraint if exists purchase_items_received_within_order,
  add constraint purchase_items_received_within_order check (received_quantity <= quantity * pack_quantity);

alter table public.expenses
  add column if not exists purchase_id bigint references public.purchases(id) on delete set null;
create unique index if not exists expenses_purchase_uidx
  on public.expenses (purchase_id) where purchase_id is not null;

create table public.supplier_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  supplier_id bigint not null references public.suppliers(id) on delete cascade,
  item_id bigint not null references public.items(id) on delete cascade,
  is_preferred boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, item_id)
);
create index supplier_items_business_idx on public.supplier_items (business_id);
create index supplier_items_item_idx on public.supplier_items (business_id, item_id);
create index supplier_items_item_id_idx on public.supplier_items (item_id);
create index supplier_items_created_by_idx on public.supplier_items (created_by);
create unique index supplier_items_preferred_item_uidx
  on public.supplier_items (business_id, item_id) where is_preferred;

create table public.purchase_receipts (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  purchase_id bigint not null references public.purchases(id) on delete cascade,
  received_at timestamptz not null,
  notes text,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index purchase_receipts_purchase_idx on public.purchase_receipts (purchase_id, received_at desc);
create index purchase_receipts_business_date_idx on public.purchase_receipts (business_id, received_at desc);
create index purchase_receipts_received_by_idx on public.purchase_receipts (received_by);

create table public.purchase_receipt_items (
  id bigint generated always as identity primary key,
  receipt_id bigint not null references public.purchase_receipts(id) on delete cascade,
  purchase_item_id bigint not null references public.purchase_items(id) on delete restrict,
  item_id bigint not null references public.items(id) on delete restrict,
  quantity numeric(14,4) not null,
  unit_cost numeric(14,4) not null,
  created_at timestamptz not null default now(),
  constraint purchase_receipt_items_quantity_positive check (quantity > 0),
  constraint purchase_receipt_items_cost_nonnegative check (unit_cost >= 0)
);
create index purchase_receipt_items_receipt_idx on public.purchase_receipt_items (receipt_id);
create index purchase_receipt_items_purchase_item_idx on public.purchase_receipt_items (purchase_item_id);
create index purchase_receipt_items_item_idx on public.purchase_receipt_items (item_id);

create trigger supplier_items_set_updated_at
  before update on public.supplier_items
  for each row execute function public.set_updated_at();

alter table public.supplier_items enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

create policy supplier_items_member_all on public.supplier_items for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy purchase_receipts_member_all on public.purchase_receipts for all to authenticated
  using ((select private.is_business_member(business_id)))
  with check ((select private.is_business_member(business_id)));
create policy purchase_receipt_items_member_all on public.purchase_receipt_items for all to authenticated
  using (exists (
    select 1 from public.purchase_receipts r
    where r.id = receipt_id and (select private.is_business_member(r.business_id))
  ))
  with check (exists (
    select 1 from public.purchase_receipts r
    where r.id = receipt_id and (select private.is_business_member(r.business_id))
  ));

grant select, insert, update, delete on public.supplier_items, public.purchase_receipts, public.purchase_receipt_items to authenticated;
grant usage, select on sequence public.supplier_items_id_seq, public.purchase_receipts_id_seq, public.purchase_receipt_items_id_seq to authenticated;
grant select, insert, update on public.suppliers, public.purchases, public.purchase_items, public.expenses to authenticated;

create or replace function public.save_supplier(
  p_business_id bigint,
  p_supplier_id bigint,
  p_name text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_notes text,
  p_is_active boolean,
  p_item_ids jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_supplier_id bigint;
  v_item jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'Informe o nome do fornecedor'; end if;
  if p_item_ids is null or jsonb_typeof(p_item_ids) <> 'array' then p_item_ids := '[]'::jsonb; end if;

  if p_supplier_id is null then
    insert into public.suppliers (business_id, name, contact_name, phone, email, notes, is_active)
    values (p_business_id, trim(p_name), nullif(trim(p_contact_name), ''), nullif(trim(p_phone), ''),
      nullif(trim(p_email), ''), nullif(trim(p_notes), ''), coalesce(p_is_active, true))
    returning id into v_supplier_id;
  else
    update public.suppliers set name = trim(p_name), contact_name = nullif(trim(p_contact_name), ''),
      phone = nullif(trim(p_phone), ''), email = nullif(trim(p_email), ''), notes = nullif(trim(p_notes), ''),
      is_active = coalesce(p_is_active, true), updated_at = now()
    where id = p_supplier_id and business_id = p_business_id returning id into v_supplier_id;
    if v_supplier_id is null then raise exception 'Fornecedor não encontrado'; end if;
    delete from public.supplier_items where business_id = p_business_id and supplier_id = v_supplier_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_item_ids) loop
    if exists (select 1 from public.items i where i.id = (v_item #>> '{}')::bigint and i.business_id = p_business_id) then
      insert into public.supplier_items (business_id, supplier_id, item_id, created_by)
      values (p_business_id, v_supplier_id, (v_item #>> '{}')::bigint, (select auth.uid()))
      on conflict (supplier_id, item_id) do nothing;
    end if;
  end loop;

  insert into public.audit_logs (business_id, user_id, action, entity_table, entity_id, details)
  values (p_business_id, (select auth.uid()), case when p_supplier_id is null then 'supplier_created' else 'supplier_updated' end,
    'suppliers', v_supplier_id::text, jsonb_build_object('name', trim(p_name), 'items', jsonb_array_length(p_item_ids)));
  return jsonb_build_object('supplier_id', v_supplier_id);
end;
$$;

create or replace function public.set_preferred_supplier(
  p_business_id bigint,
  p_item_id bigint,
  p_supplier_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  if not exists (select 1 from public.items where id = p_item_id and business_id = p_business_id) then raise exception 'Item inválido'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and business_id = p_business_id and is_active) then raise exception 'Fornecedor inválido'; end if;
  update public.supplier_items set is_preferred = false, updated_at = now() where business_id = p_business_id and item_id = p_item_id and is_preferred;
  insert into public.supplier_items (business_id, supplier_id, item_id, is_preferred, created_by)
  values (p_business_id, p_supplier_id, p_item_id, true, (select auth.uid()))
  on conflict (supplier_id, item_id) do update set is_preferred = true, updated_at = now();
  return jsonb_build_object('item_id', p_item_id, 'supplier_id', p_supplier_id);
end;
$$;

create or replace function public.create_purchase_order(
  p_business_id bigint,
  p_supplier_id bigint,
  p_purchase_date date,
  p_payment_method text,
  p_due_date date,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase_id bigint;
  v_expense_id bigint;
  v_total numeric(14,2) := 0;
  v_entry jsonb;
  v_item_id bigint;
  v_quantity numeric;
  v_unit_cost numeric;
  v_unit text;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and business_id = p_business_id and is_active) then raise exception 'Selecione um fornecedor ativo'; end if;
  if p_purchase_date is null then raise exception 'Informe a data da compra'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Adicione ao menos um item'; end if;

  insert into public.purchases (business_id, supplier_id, purchase_date, status, fulfillment_status,
    payment_status, payment_method, due_date, total_amount, notes, created_by)
  values (p_business_id, p_supplier_id, p_purchase_date, 'pending', 'ordered', 'pending',
    nullif(trim(p_payment_method), ''), p_due_date, 0, nullif(trim(p_notes), ''), (select auth.uid()))
  returning id into v_purchase_id;
  update public.purchases set code = 'CMP-' || to_char(p_purchase_date, 'YYYY') || '-' || lpad(v_purchase_id::text, 6, '0') where id = v_purchase_id;

  for v_entry in select value from jsonb_array_elements(p_items) loop
    v_item_id := (v_entry ->> 'item_id')::bigint;
    v_quantity := (v_entry ->> 'quantity')::numeric;
    v_unit_cost := (v_entry ->> 'unit_cost')::numeric;
    v_unit := nullif(trim(v_entry ->> 'unit'), '');
    if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0 or not exists (
      select 1 from public.items where id = v_item_id and business_id = p_business_id and is_active
    ) then raise exception 'Revise os itens, quantidades e preços'; end if;
    insert into public.purchase_items (purchase_id, item_id, quantity, pack_quantity, unit_cost, unit)
    values (v_purchase_id, v_item_id, v_quantity, 1, v_unit_cost,
      coalesce(v_unit, (select coalesce(purchase_unit, consumption_unit) from public.items where id = v_item_id)));
    v_total := v_total + round(v_quantity * v_unit_cost, 2);
    insert into public.supplier_items (business_id, supplier_id, item_id, created_by)
    values (p_business_id, p_supplier_id, v_item_id, (select auth.uid())) on conflict (supplier_id, item_id) do nothing;
  end loop;
  update public.purchases set total_amount = v_total where id = v_purchase_id;

  insert into public.expenses (business_id, supplier_id, purchase_id, category, description, expense_date,
    due_date, amount, payment_method, status, is_recurring, cost_behavior, created_by)
  values (p_business_id, p_supplier_id, v_purchase_id, 'Mercadorias e fornecedores',
    'Compra ' || (select code from public.purchases where id = v_purchase_id), p_purchase_date,
    p_due_date, v_total, nullif(trim(p_payment_method), ''), 'pending', false, 'variable', (select auth.uid()))
  returning id into v_expense_id;
  update public.purchases set expense_id = v_expense_id where id = v_purchase_id;

  insert into public.audit_logs (business_id, user_id, action, entity_table, entity_id, details)
  values (p_business_id, (select auth.uid()), 'purchase_created', 'purchases', v_purchase_id::text,
    jsonb_build_object('supplier_id', p_supplier_id, 'total', v_total, 'items', jsonb_array_length(p_items)));
  return jsonb_build_object('purchase_id', v_purchase_id, 'expense_id', v_expense_id, 'total', v_total);
end;
$$;

create or replace function public.update_purchase_order_status(
  p_business_id bigint,
  p_purchase_id bigint,
  p_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_current text;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  select fulfillment_status into v_current from public.purchases where id = p_purchase_id and business_id = p_business_id for update;
  if v_current is null then raise exception 'Compra não encontrada'; end if;
  if p_status not in ('ordered','awaiting','cancelled') then raise exception 'Situação inválida'; end if;
  if v_current in ('partially_received','received') and p_status = 'cancelled' then raise exception 'Uma compra com recebimento não pode ser cancelada'; end if;
  if v_current in ('partially_received','received') then raise exception 'A situação é controlada pelos recebimentos'; end if;
  update public.purchases set fulfillment_status = p_status,
    status = case when p_status = 'cancelled' then 'cancelled'::public.record_status else 'pending'::public.record_status end,
    updated_at = now() where id = p_purchase_id;
  if p_status = 'cancelled' then update public.expenses set status = 'cancelled', updated_at = now() where purchase_id = p_purchase_id; end if;
  insert into public.audit_logs (business_id,user_id,action,entity_table,entity_id,details)
  values (p_business_id,(select auth.uid()),'purchase_status_updated','purchases',p_purchase_id::text,jsonb_build_object('from',v_current,'to',p_status));
  return jsonb_build_object('purchase_id', p_purchase_id, 'status', p_status);
end;
$$;

create or replace function public.update_purchase_payment(
  p_business_id bigint,
  p_purchase_id bigint,
  p_payment_status text,
  p_payment_method text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_paid_at timestamptz;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  if p_payment_status not in ('pending','paid') then raise exception 'Situação financeira inválida'; end if;
  if not exists (select 1 from public.purchases where id = p_purchase_id and business_id = p_business_id and fulfillment_status <> 'cancelled') then raise exception 'Compra não encontrada'; end if;
  v_paid_at := case when p_payment_status = 'paid' then now() else null end;
  update public.purchases set payment_status = p_payment_status, payment_method = coalesce(nullif(trim(p_payment_method),''), payment_method), paid_at = v_paid_at, updated_at = now() where id = p_purchase_id;
  update public.expenses set status = case when p_payment_status = 'paid' then 'completed'::public.record_status else 'pending'::public.record_status end,
    payment_method = coalesce(nullif(trim(p_payment_method),''), payment_method), paid_at = v_paid_at, updated_at = now() where purchase_id = p_purchase_id;
  insert into public.audit_logs (business_id,user_id,action,entity_table,entity_id,details)
  values (p_business_id,(select auth.uid()),'purchase_payment_updated','purchases',p_purchase_id::text,jsonb_build_object('payment_status',p_payment_status));
  return jsonb_build_object('purchase_id',p_purchase_id,'payment_status',p_payment_status);
end;
$$;

create or replace function public.receive_purchase_order(
  p_business_id bigint,
  p_purchase_id bigint,
  p_received_at timestamptz,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt_id bigint;
  v_receipt_item_id bigint;
  v_entry jsonb;
  v_line record;
  v_quantity numeric;
  v_before numeric;
  v_after numeric;
  v_status text;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  if p_received_at is null or p_received_at > now() + interval '5 minutes' then raise exception 'Data de recebimento inválida'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Informe os itens recebidos'; end if;
  if not exists (select 1 from public.purchases where id = p_purchase_id and business_id = p_business_id and fulfillment_status not in ('received','cancelled') for update) then raise exception 'A compra não aceita novos recebimentos'; end if;

  insert into public.purchase_receipts (business_id,purchase_id,received_at,notes,received_by)
  values (p_business_id,p_purchase_id,p_received_at,nullif(trim(p_notes),''),(select auth.uid())) returning id into v_receipt_id;

  for v_entry in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_entry ->> 'quantity')::numeric;
    select pi.id, pi.item_id, pi.unit_cost, pi.quantity * pi.pack_quantity as ordered_quantity, pi.received_quantity
      into v_line from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id
      where pi.id = (v_entry ->> 'purchase_item_id')::bigint and pi.purchase_id = p_purchase_id and p.business_id = p_business_id for update;
    if v_line.id is null or v_quantity is null or v_quantity <= 0 or v_line.received_quantity + v_quantity > v_line.ordered_quantity then
      raise exception 'A quantidade recebida ultrapassa o saldo pendente';
    end if;
    insert into public.purchase_receipt_items (receipt_id,purchase_item_id,item_id,quantity,unit_cost)
    values (v_receipt_id,v_line.id,v_line.item_id,v_quantity,v_line.unit_cost) returning id into v_receipt_item_id;
    update public.purchase_items set received_quantity = received_quantity + v_quantity where id = v_line.id;

    v_before := private.stock_theoretical_quantity(p_business_id,v_line.item_id,p_received_at);
    v_after := v_before + v_quantity;
    insert into public.stock_movements (business_id,item_id,movement_type,movement_reason,quantity,unit_cost,
      balance_before,balance_after,occurred_at,source_table,source_id,notes,created_by)
    values (p_business_id,v_line.item_id,'purchase','purchase',v_quantity,v_line.unit_cost,v_before,v_after,
      p_received_at,'purchase_receipt_items',v_receipt_item_id,'Entrada confirmada da compra ' || p_purchase_id,(select auth.uid()));

    insert into public.item_cost_history (business_id,item_id,unit_cost,effective_from,source,notes,created_by)
    values (p_business_id,v_line.item_id,v_line.unit_cost,p_received_at::date,'purchase','Custo confirmado no recebimento da compra ' || p_purchase_id,(select auth.uid()))
    on conflict (item_id,effective_from) do update set unit_cost = excluded.unit_cost, source = 'purchase', notes = excluded.notes, created_by = excluded.created_by, updated_at = now();

    update public.items i set latest_unit_cost = (
      select h.unit_cost from public.item_cost_history h where h.item_id = i.id and h.effective_from <= current_date order by h.effective_from desc,h.id desc limit 1
    ), average_unit_cost = (
      select round(sum(pri.quantity * pri.unit_cost) / nullif(sum(pri.quantity),0),4)
      from public.purchase_receipt_items pri join public.purchase_receipts pr on pr.id = pri.receipt_id
      where pri.item_id = i.id and pr.business_id = p_business_id
    ), updated_at = now() where i.id = v_line.item_id and i.business_id = p_business_id;
  end loop;

  select case
    when bool_and(received_quantity >= quantity * pack_quantity) then 'received'
    when bool_or(received_quantity > 0) then 'partially_received'
    else 'awaiting' end into v_status
  from public.purchase_items where purchase_id = p_purchase_id;
  update public.purchases set fulfillment_status = v_status,
    status = case when v_status = 'received' then 'completed'::public.record_status else 'pending'::public.record_status end,
    updated_at = now() where id = p_purchase_id;
  insert into public.audit_logs (business_id,user_id,action,entity_table,entity_id,details)
  values (p_business_id,(select auth.uid()),'purchase_received','purchase_receipts',v_receipt_id::text,
    jsonb_build_object('purchase_id',p_purchase_id,'status',v_status,'lines',jsonb_array_length(p_items)));
  return jsonb_build_object('receipt_id',v_receipt_id,'purchase_id',p_purchase_id,'status',v_status);
end;
$$;

create or replace function public.get_purchases_dashboard(
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
declare v_stock jsonb;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  if p_period_start is null or p_period_end is null or p_period_start > p_period_end then raise exception 'Período inválido'; end if;
  v_stock := public.get_virtual_inventory_dashboard(p_business_id,p_period_start,p_period_end);
  return jsonb_build_object(
    'period_start',p_period_start,'period_end',p_period_end,
    'summary',jsonb_build_object(
      'total',coalesce((select sum(total_amount) from public.purchases where business_id=p_business_id and purchase_date between p_period_start and p_period_end and fulfillment_status<>'cancelled'),0),
      'awaiting',coalesce((select count(*) from public.purchases where business_id=p_business_id and purchase_date between p_period_start and p_period_end and fulfillment_status in ('ordered','awaiting')),0),
      'partial',coalesce((select count(*) from public.purchases where business_id=p_business_id and purchase_date between p_period_start and p_period_end and fulfillment_status='partially_received'),0),
      'received',coalesce((select count(*) from public.purchases where business_id=p_business_id and purchase_date between p_period_start and p_period_end and fulfillment_status='received'),0),
      'payment_pending',coalesce((select sum(total_amount) from public.purchases where business_id=p_business_id and purchase_date between p_period_start and p_period_end and payment_status='pending' and fulfillment_status<>'cancelled'),0),
      'replenishment_items',coalesce((select count(*) from jsonb_array_elements(v_stock->'items') z(item)
        where coalesce((z.item->>'suggested_purchase')::numeric,0)>0 or z.item->>'status' in ('below_minimum','out','low')),0)
    ),
    'suppliers',coalesce((select jsonb_agg(to_jsonb(x) order by x.total desc,x.name) from (
      select s.id,s.name,s.contact_name,s.phone,s.email,s.notes,s.is_active,
        coalesce(sum(p.total_amount) filter(where p.purchase_date between p_period_start and p_period_end and p.fulfillment_status<>'cancelled'),0) total,
        count(p.id) filter(where p.purchase_date between p_period_start and p_period_end and p.fulfillment_status<>'cancelled') purchase_count,
        max(p.purchase_date) filter(where p.fulfillment_status<>'cancelled') last_purchase,
        coalesce(avg(p.total_amount) filter(where p.purchase_date between p_period_start and p_period_end and p.fulfillment_status<>'cancelled'),0) average_purchase
      from public.suppliers s left join public.purchases p on p.supplier_id=s.id
      where s.business_id=p_business_id group by s.id
    ) x),'[]'::jsonb),
    'supplier_items',coalesce((select jsonb_agg(jsonb_build_object('supplier_id',si.supplier_id,'item_id',si.item_id,'is_preferred',si.is_preferred,'item_name',i.name))
      from public.supplier_items si join public.items i on i.id=si.item_id where si.business_id=p_business_id),'[]'::jsonb),
    'purchases',coalesce((select jsonb_agg(to_jsonb(x) order by x.purchase_date desc,x.id desc) from (
      select p.id,p.code,p.supplier_id,s.name supplier_name,p.purchase_date,p.fulfillment_status,p.payment_status,p.payment_method,p.due_date,p.paid_at,p.total_amount,p.notes,
        coalesce((select jsonb_agg(jsonb_build_object('id',pi.id,'item_id',pi.item_id,'name',i.name,'unit',coalesce(pi.unit,i.consumption_unit),'quantity',pi.quantity*pi.pack_quantity,'received_quantity',pi.received_quantity,'unit_cost',pi.unit_cost,'total_cost',pi.total_cost,'sector',coalesce(a.name,'Geral')) order by i.name)
          from public.purchase_items pi join public.items i on i.id=pi.item_id left join public.areas a on a.id=i.area_id where pi.purchase_id=p.id),'[]'::jsonb) items,
        coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'received_at',pr.received_at,'notes',pr.notes,'items',
          coalesce((select jsonb_agg(jsonb_build_object('item_id',pri.item_id,'name',ii.name,'quantity',pri.quantity,'unit_cost',pri.unit_cost)) from public.purchase_receipt_items pri join public.items ii on ii.id=pri.item_id where pri.receipt_id=pr.id),'[]'::jsonb)) order by pr.received_at desc)
          from public.purchase_receipts pr where pr.purchase_id=p.id),'[]'::jsonb) receipts
      from public.purchases p left join public.suppliers s on s.id=p.supplier_id
      where p.business_id=p_business_id and p.purchase_date between p_period_start and p_period_end
    ) x),'[]'::jsonb),
    'price_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.received_at desc) from (
      select pri.id,pri.item_id,i.name item_name,p.supplier_id,s.name supplier_name,pri.unit_cost,pri.quantity,pr.received_at
      from public.purchase_receipt_items pri join public.purchase_receipts pr on pr.id=pri.receipt_id
      join public.purchases p on p.id=pr.purchase_id join public.items i on i.id=pri.item_id left join public.suppliers s on s.id=p.supplier_id
      where pr.business_id=p_business_id
    ) x),'[]'::jsonb),
    'replenishment',coalesce((select jsonb_agg(jsonb_build_object(
      'item_id',z.item->>'id','name',z.item->>'name','sector',z.item->>'sector','unit',z.item->>'unit',
      'current_stock',case when (z.item->>'has_baseline')::boolean then (z.item->>'theoretical_quantity')::numeric else null end,
      'minimum_stock',(z.item->>'minimum_stock')::numeric,'reference_quantity',(z.item->>'expected_quantity')::numeric,
      'reference_days',(z.item->>'reference_days')::numeric,'suggested_quantity',(z.item->>'suggested_purchase')::numeric,
      'status',z.item->>'status','supplier_id',pref.supplier_id,'supplier_name',pref.supplier_name,'last_price',lp.unit_cost
    ) order by coalesce((z.item->>'suggested_purchase')::numeric,0) desc)
    from jsonb_array_elements(v_stock->'items') z(item)
    left join lateral (select si.supplier_id,s.name supplier_name from public.supplier_items si join public.suppliers s on s.id=si.supplier_id where si.business_id=p_business_id and si.item_id=(z.item->>'id')::bigint order by si.is_preferred desc,si.id limit 1) pref on true
    left join lateral (select pri.unit_cost from public.purchase_receipt_items pri join public.purchase_receipts pr on pr.id=pri.receipt_id where pr.business_id=p_business_id and pri.item_id=(z.item->>'id')::bigint order by pr.received_at desc,pri.id desc limit 1) lp on true
    where coalesce((z.item->>'suggested_purchase')::numeric,0)>0 or z.item->>'status' in ('below_minimum','out','low')),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.save_supplier(bigint,bigint,text,text,text,text,text,boolean,jsonb) from public,anon;
revoke all on function public.set_preferred_supplier(bigint,bigint,bigint) from public,anon;
revoke all on function public.create_purchase_order(bigint,bigint,date,text,date,text,jsonb) from public,anon;
revoke all on function public.update_purchase_order_status(bigint,bigint,text) from public,anon;
revoke all on function public.update_purchase_payment(bigint,bigint,text,text) from public,anon;
revoke all on function public.receive_purchase_order(bigint,bigint,timestamptz,text,jsonb) from public,anon;
revoke all on function public.get_purchases_dashboard(bigint,date,date) from public,anon;
grant execute on function public.save_supplier(bigint,bigint,text,text,text,text,text,boolean,jsonb) to authenticated;
grant execute on function public.set_preferred_supplier(bigint,bigint,bigint) to authenticated;
grant execute on function public.create_purchase_order(bigint,bigint,date,text,date,text,jsonb) to authenticated;
grant execute on function public.update_purchase_order_status(bigint,bigint,text) to authenticated;
grant execute on function public.update_purchase_payment(bigint,bigint,text,text) to authenticated;
grant execute on function public.receive_purchase_order(bigint,bigint,timestamptz,text,jsonb) to authenticated;
grant execute on function public.get_purchases_dashboard(bigint,date,date) to authenticated;
