create table public.purchase_misc_items (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases(id) on delete cascade,
  description text not null,
  quantity numeric(14,4),
  unit text,
  unit_cost numeric(14,4) not null,
  total_cost numeric(14,2) generated always as (round(coalesce(quantity, 1) * unit_cost, 2)) stored,
  created_at timestamptz not null default now(),
  constraint purchase_misc_items_description_not_blank check (length(trim(description)) > 0),
  constraint purchase_misc_items_quantity_positive check (quantity is null or quantity > 0),
  constraint purchase_misc_items_cost_nonnegative check (unit_cost >= 0)
);
create index purchase_misc_items_purchase_idx on public.purchase_misc_items (purchase_id);

alter table public.purchase_misc_items enable row level security;

create policy purchase_misc_items_member_all on public.purchase_misc_items for all to authenticated
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_id and (select private.is_business_member(p.business_id))
  ))
  with check (exists (
    select 1 from public.purchases p
    where p.id = purchase_id and (select private.is_business_member(p.business_id))
  ));

grant select, insert, update, delete on public.purchase_misc_items to authenticated;
grant usage, select on sequence public.purchase_misc_items_id_seq to authenticated;

drop function if exists public.create_purchase_order(bigint,bigint,date,text,date,text,jsonb);

create or replace function public.create_purchase_order(
  p_business_id bigint,
  p_supplier_id bigint,
  p_purchase_date date,
  p_payment_method text,
  p_due_date date,
  p_notes text,
  p_items jsonb,
  p_misc_items jsonb default '[]'::jsonb
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
  v_description text;
  v_misc_quantity numeric;
begin
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negócio'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and business_id = p_business_id and is_active) then raise exception 'Selecione um fornecedor ativo'; end if;
  if p_purchase_date is null then raise exception 'Informe a data da compra'; end if;
  if p_misc_items is null then p_misc_items := '[]'::jsonb; end if;
  if jsonb_typeof(p_items) <> 'array' or (jsonb_array_length(p_items) = 0 and jsonb_array_length(p_misc_items) = 0) then raise exception 'Adicione ao menos um item'; end if;

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

  for v_entry in select value from jsonb_array_elements(p_misc_items) loop
    v_description := nullif(trim(v_entry ->> 'description'), '');
    v_misc_quantity := nullif(v_entry ->> 'quantity', '')::numeric;
    v_unit_cost := (v_entry ->> 'unit_cost')::numeric;
    v_unit := nullif(trim(v_entry ->> 'unit'), '');
    if v_description is null or v_unit_cost is null or v_unit_cost < 0 or (v_misc_quantity is not null and v_misc_quantity <= 0) then
      raise exception 'Revise os gastos avulsos';
    end if;
    insert into public.purchase_misc_items (purchase_id, description, quantity, unit, unit_cost)
    values (v_purchase_id, v_description, v_misc_quantity, v_unit, v_unit_cost);
    v_total := v_total + round(coalesce(v_misc_quantity, 1) * v_unit_cost, 2);
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
    jsonb_build_object('supplier_id', p_supplier_id, 'total', v_total, 'items', jsonb_array_length(p_items), 'misc_items', jsonb_array_length(p_misc_items)));
  return jsonb_build_object('purchase_id', v_purchase_id, 'expense_id', v_expense_id, 'total', v_total);
end;
$$;

revoke all on function public.create_purchase_order(bigint,bigint,date,text,date,text,jsonb,jsonb) from public,anon;
grant execute on function public.create_purchase_order(bigint,bigint,date,text,date,text,jsonb,jsonb) to authenticated;

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
        coalesce((select jsonb_agg(jsonb_build_object('id',pm.id,'description',pm.description,'quantity',pm.quantity,'unit',pm.unit,'unit_cost',pm.unit_cost,'total_cost',pm.total_cost) order by pm.id)
          from public.purchase_misc_items pm where pm.purchase_id=p.id),'[]'::jsonb) misc_items,
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

revoke all on function public.get_purchases_dashboard(bigint,date,date) from public,anon;
grant execute on function public.get_purchases_dashboard(bigint,date,date) to authenticated;
