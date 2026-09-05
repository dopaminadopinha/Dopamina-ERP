-- Atomic commands used by the ERP UI and trusted assistant integrations.
-- No purchase or stock state is written before all required data validates.

create table if not exists public.erp_command_requests (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  source text not null,
  payload jsonb not null,
  result jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint erp_command_requests_key_not_blank check (length(trim(idempotency_key)) >= 8),
  unique (business_id, idempotency_key)
);

create index if not exists erp_command_requests_business_created_idx
  on public.erp_command_requests (business_id, created_at desc);

alter table public.erp_command_requests enable row level security;
revoke all on public.erp_command_requests from public, anon, authenticated;
grant select, insert, update on public.erp_command_requests to service_role;
grant usage, select on sequence public.erp_command_requests_id_seq to service_role;

create or replace function private.assert_erp_command_access(p_business_id bigint, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.businesses where id = p_business_id and is_active) then
    raise exception 'Negócio não encontrado';
  end if;
  if (select auth.role()) = 'service_role' then return; end if;
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then
    raise exception 'Acesso negado ao negócio';
  end if;
  if p_actor_id is not null and p_actor_id <> (select auth.uid()) then
    raise exception 'Identidade do responsável inválida';
  end if;
end;
$$;

revoke all on function private.assert_erp_command_access(bigint,uuid) from public,anon,authenticated;
grant execute on function private.assert_erp_command_access(bigint,uuid) to service_role;

create or replace function public.ingest_complete_purchase(
  p_business_id bigint,
  p_idempotency_key text,
  p_supplier jsonb,
  p_purchase jsonb,
  p_items jsonb,
  p_misc_items jsonb default '[]'::jsonb,
  p_actor_id uuid default null,
  p_source text default 'assistant_api'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id bigint;
  v_previous jsonb;
  v_supplier_id bigint;
  v_supplier_name text;
  v_purchase_id bigint;
  v_expense_id bigint;
  v_receipt_id bigint;
  v_receipt_item_id bigint;
  v_entry jsonb;
  v_item_id bigint;
  v_item_name text;
  v_item_type public.item_type;
  v_category_id bigint;
  v_area_id bigint;
  v_quantity numeric;
  v_unit_cost numeric;
  v_line_total numeric;
  v_total numeric(14,2) := 0;
  v_declared_total numeric;
  v_purchase_date date;
  v_received_at timestamptz;
  v_received boolean;
  v_payment_status text;
  v_payment_method text;
  v_due_date date;
  v_before numeric;
  v_after numeric;
  v_result jsonb;
  v_created_items integer := 0;
begin
  perform private.assert_erp_command_access(p_business_id, p_actor_id);
  if nullif(trim(p_idempotency_key),'') is null or length(trim(p_idempotency_key)) < 8 then raise exception 'Chave de idempotência inválida'; end if;
  if jsonb_typeof(p_supplier) <> 'object' or jsonb_typeof(p_purchase) <> 'object' then raise exception 'Fornecedor e compra são obrigatórios'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_typeof(coalesce(p_misc_items,'[]'::jsonb)) <> 'array' then raise exception 'Itens inválidos'; end if;

  insert into public.erp_command_requests (business_id,idempotency_key,operation,source,payload,actor_id)
  values (p_business_id,trim(p_idempotency_key),'purchase_intake',coalesce(nullif(trim(p_source),''),'assistant_api'),
    jsonb_build_object('supplier',p_supplier,'purchase',p_purchase,'items',p_items,'misc_items',coalesce(p_misc_items,'[]'::jsonb)),p_actor_id)
  on conflict (business_id,idempotency_key) do nothing returning id into v_request_id;
  if v_request_id is null then
    select result into v_previous from public.erp_command_requests where business_id=p_business_id and idempotency_key=trim(p_idempotency_key);
    if v_previous is null then raise exception 'Esta operação já está sendo processada'; end if;
    return v_previous || jsonb_build_object('idempotent_replay',true);
  end if;

  v_purchase_date := nullif(p_purchase->>'purchase_date','')::date;
  v_payment_status := p_purchase->>'payment_status';
  v_payment_method := nullif(trim(p_purchase->>'payment_method'),'');
  v_due_date := nullif(p_purchase->>'due_date','')::date;
  v_received := coalesce((p_purchase->>'received')::boolean,false);
  v_received_at := nullif(p_purchase->>'received_at','')::timestamptz;
  v_declared_total := nullif(p_purchase->>'declared_total','')::numeric;
  if v_purchase_date is null then raise exception 'Informe a data da compra'; end if;
  if v_payment_status not in ('paid','pending') then raise exception 'Informe se a compra está paga ou pendente'; end if;
  if v_payment_method is null then raise exception 'Informe a forma de pagamento'; end if;
  if v_payment_status='pending' and v_due_date is null then raise exception 'Informe o vencimento da compra pendente'; end if;
  if v_due_date is not null and v_due_date<v_purchase_date then raise exception 'O vencimento não pode ser anterior à compra'; end if;
  if v_received and v_received_at is null then raise exception 'Informe a data de recebimento'; end if;
  if v_received_at is not null and v_received_at::date<v_purchase_date then raise exception 'O recebimento não pode ser anterior à compra'; end if;
  if v_received_at > now()+interval '5 minutes' then raise exception 'A data de recebimento não pode estar no futuro'; end if;
  if jsonb_array_length(p_items)=0 and jsonb_array_length(coalesce(p_misc_items,'[]'::jsonb))=0 then raise exception 'Adicione ao menos um item'; end if;

  v_supplier_id := nullif(p_supplier->>'supplier_id','')::bigint;
  v_supplier_name := nullif(trim(p_supplier->>'name'),'');
  if v_supplier_id is not null then
    if not exists(select 1 from public.suppliers where id=v_supplier_id and business_id=p_business_id and is_active) then raise exception 'Fornecedor inválido'; end if;
  else
    if v_supplier_name is null then raise exception 'Informe o fornecedor'; end if;
    select id into v_supplier_id from public.suppliers where business_id=p_business_id and lower(trim(name))=lower(v_supplier_name) and is_active order by id limit 1 for update;
    if v_supplier_id is null then
      insert into public.suppliers(business_id,name,document,contact_name,phone,email,notes,is_active)
      values(p_business_id,v_supplier_name,nullif(trim(p_supplier->>'document'),''),nullif(trim(p_supplier->>'contact_name'),''),nullif(trim(p_supplier->>'phone'),''),nullif(trim(p_supplier->>'email'),''),nullif(trim(p_supplier->>'notes'),''),true)
      returning id into v_supplier_id;
    else
      update public.suppliers set
        document=coalesce(nullif(trim(p_supplier->>'document'),''),document),
        contact_name=coalesce(nullif(trim(p_supplier->>'contact_name'),''),contact_name),
        phone=coalesce(nullif(trim(p_supplier->>'phone'),''),phone),
        email=coalesce(nullif(trim(p_supplier->>'email'),''),email),
        notes=coalesce(nullif(trim(p_supplier->>'notes'),''),notes),updated_at=now()
      where id=v_supplier_id;
    end if;
  end if;

  insert into public.purchases(business_id,supplier_id,purchase_date,invoice_number,status,fulfillment_status,payment_status,payment_method,due_date,paid_at,total_amount,notes,created_by)
  values(p_business_id,v_supplier_id,v_purchase_date,nullif(trim(p_purchase->>'invoice_number'),''),
    case when v_received then 'completed'::public.record_status else 'pending'::public.record_status end,
    case when v_received then 'received' else 'ordered' end,v_payment_status,v_payment_method,v_due_date,
    case when v_payment_status='paid' then coalesce(v_received_at,(v_purchase_date::text||' 12:00:00-03')::timestamptz) else null end,
    0,nullif(trim(p_purchase->>'notes'),''),p_actor_id)
  returning id into v_purchase_id;
  update public.purchases set code='CMP-'||to_char(v_purchase_date,'YYYY')||'-'||lpad(v_purchase_id::text,6,'0') where id=v_purchase_id;

  if v_received then
    insert into public.purchase_receipts(business_id,purchase_id,received_at,notes,received_by)
    values(p_business_id,v_purchase_id,v_received_at,'Recebimento confirmado pela entrada assistida',p_actor_id) returning id into v_receipt_id;
  end if;

  for v_entry in select value from jsonb_array_elements(p_items) loop
    v_item_id := nullif(v_entry->>'item_id','')::bigint;
    v_item_name := nullif(trim(v_entry->>'name'),'');
    v_quantity := nullif(v_entry->>'quantity','')::numeric;
    v_unit_cost := nullif(v_entry->>'unit_cost','')::numeric;
    if v_quantity is null or v_quantity<=0 or v_unit_cost is null or v_unit_cost<0 or nullif(trim(v_entry->>'unit'),'') is null then raise exception 'Revise quantidades, unidades e preços dos itens'; end if;
    if v_item_id is not null then
      if not exists(select 1 from public.items where id=v_item_id and business_id=p_business_id and is_active) then raise exception 'Um item não pertence a este negócio'; end if;
    else
      if v_item_name is null or (v_entry->>'item_type') not in ('product','ingredient','consumable') then raise exception 'Nome e tipo são obrigatórios para novos itens'; end if;
      v_item_type := (v_entry->>'item_type')::public.item_type;
      v_area_id := nullif(v_entry->>'area_id','')::bigint;
      if v_item_type='product'::public.item_type and (v_area_id is null or not exists(select 1 from public.areas where id=v_area_id and business_id=p_business_id and is_active)) then raise exception 'Novos produtos vendidos precisam de um setor válido'; end if;
      v_category_id := nullif(v_entry->>'category_id','')::bigint;
      if v_category_id is null then
        if nullif(trim(v_entry->>'category_name'),'') is null then raise exception 'Novos itens precisam de categoria'; end if;
        insert into public.categories(business_id,name,kind,is_active)
        values(p_business_id,trim(v_entry->>'category_name'),v_item_type,true)
        on conflict(business_id,name,kind) do update set is_active=true,updated_at=now() returning id into v_category_id;
      elsif not exists(select 1 from public.categories where id=v_category_id and business_id=p_business_id and kind=v_item_type) then raise exception 'Categoria inválida para o novo item'; end if;
      select id into v_item_id from public.items where business_id=p_business_id and lower(trim(name))=lower(v_item_name) and item_type=v_item_type order by id limit 1 for update;
      if v_item_id is null then
        insert into public.items(business_id,area_id,category_id,name,sku,item_type,purchase_unit,purchase_pack_quantity,consumption_unit,latest_unit_cost,average_unit_cost,is_active)
        values(p_business_id,v_area_id,v_category_id,v_item_name,nullif(trim(v_entry->>'sku'),''),v_item_type,
          coalesce(nullif(trim(v_entry->>'purchase_unit'),''),trim(v_entry->>'unit')),
          coalesce(nullif(v_entry->>'purchase_pack_quantity','')::numeric,1),trim(v_entry->>'unit'),v_unit_cost,v_unit_cost,true)
        returning id into v_item_id;
        v_created_items := v_created_items+1;
      end if;
    end if;

    insert into public.purchase_items(purchase_id,item_id,quantity,pack_quantity,unit_cost,unit,received_quantity)
    values(v_purchase_id,v_item_id,v_quantity,1,v_unit_cost,trim(v_entry->>'unit'),case when v_received then v_quantity else 0 end)
    returning id into v_receipt_item_id;
    v_line_total := round(v_quantity*v_unit_cost,2);
    v_total := v_total+v_line_total;
    insert into public.supplier_items(business_id,supplier_id,item_id,created_by)
    values(p_business_id,v_supplier_id,v_item_id,p_actor_id) on conflict(supplier_id,item_id) do nothing;

    if v_received then
      insert into public.purchase_receipt_items(receipt_id,purchase_item_id,item_id,quantity,unit_cost)
      values(v_receipt_id,v_receipt_item_id,v_item_id,v_quantity,v_unit_cost) returning id into v_receipt_item_id;
      v_before := private.stock_theoretical_quantity(p_business_id,v_item_id,v_received_at);
      v_after := v_before+v_quantity;
      insert into public.stock_movements(business_id,item_id,movement_type,movement_reason,quantity,unit_cost,balance_before,balance_after,occurred_at,source_table,source_id,notes,created_by)
      values(p_business_id,v_item_id,'purchase','purchase',v_quantity,v_unit_cost,v_before,v_after,v_received_at,'purchase_receipt_items',v_receipt_item_id,'Entrada confirmada da compra '||v_purchase_id,p_actor_id);
      insert into public.item_cost_history(business_id,item_id,unit_cost,effective_from,source,notes,created_by)
      values(p_business_id,v_item_id,v_unit_cost,v_received_at::date,'purchase','Custo confirmado no recebimento da compra '||v_purchase_id,p_actor_id)
      on conflict(item_id,effective_from) do update set unit_cost=excluded.unit_cost,source='purchase',notes=excluded.notes,created_by=excluded.created_by,updated_at=now();
      update public.items i set latest_unit_cost=(select h.unit_cost from public.item_cost_history h where h.item_id=i.id and h.effective_from<=current_date order by h.effective_from desc,h.id desc limit 1),
        average_unit_cost=(select round(sum(pri.quantity*pri.unit_cost)/nullif(sum(pri.quantity),0),4) from public.purchase_receipt_items pri join public.purchase_receipts pr on pr.id=pri.receipt_id where pri.item_id=i.id and pr.business_id=p_business_id),updated_at=now()
      where i.id=v_item_id and i.business_id=p_business_id;
    end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(coalesce(p_misc_items,'[]'::jsonb)) loop
    v_quantity := coalesce(nullif(v_entry->>'quantity','')::numeric,1);
    v_unit_cost := nullif(v_entry->>'unit_cost','')::numeric;
    if nullif(trim(v_entry->>'description'),'') is null or v_quantity<=0 or v_unit_cost is null or v_unit_cost<0 then raise exception 'Revise os gastos adicionais'; end if;
    insert into public.purchase_misc_items(purchase_id,description,quantity,unit,unit_cost)
    values(v_purchase_id,trim(v_entry->>'description'),v_quantity,nullif(trim(v_entry->>'unit'),''),v_unit_cost);
    v_total := v_total+round(v_quantity*v_unit_cost,2);
  end loop;

  if v_declared_total is null or abs(v_total-v_declared_total)>0.02 then raise exception 'A soma dos itens não confere com o total declarado'; end if;
  update public.purchases set total_amount=v_total where id=v_purchase_id;
  insert into public.expenses(business_id,supplier_id,purchase_id,category,description,expense_date,due_date,paid_at,amount,payment_method,status,is_recurring,cost_behavior,created_by)
  values(p_business_id,v_supplier_id,v_purchase_id,'Mercadorias e fornecedores','Compra '||(select code from public.purchases where id=v_purchase_id),v_purchase_date,v_due_date,
    case when v_payment_status='paid' then coalesce(v_received_at,(v_purchase_date::text||' 12:00:00-03')::timestamptz) else null end,v_total,v_payment_method,
    case when v_payment_status='paid' then 'completed'::public.record_status else 'pending'::public.record_status end,false,'variable',p_actor_id)
  returning id into v_expense_id;
  update public.purchases set expense_id=v_expense_id where id=v_purchase_id;

  insert into public.audit_logs(business_id,user_id,action,entity_table,entity_id,details)
  values(p_business_id,p_actor_id,'purchase_intake_committed','purchases',v_purchase_id::text,jsonb_build_object('source',p_source,'supplier_id',v_supplier_id,'expense_id',v_expense_id,'receipt_id',v_receipt_id,'total',v_total,'created_items',v_created_items,'idempotency_key',p_idempotency_key));
  v_result := jsonb_build_object('purchase_id',v_purchase_id,'purchase_code',(select code from public.purchases where id=v_purchase_id),'supplier_id',v_supplier_id,'expense_id',v_expense_id,'receipt_id',v_receipt_id,'stock_updated',v_received,'total',v_total,'created_items',v_created_items,'idempotent_replay',false);
  update public.erp_command_requests set result=v_result,completed_at=now() where id=v_request_id;
  return v_result;
end;
$$;

revoke all on function public.ingest_complete_purchase(bigint,text,jsonb,jsonb,jsonb,jsonb,uuid,text) from public,anon;
grant execute on function public.ingest_complete_purchase(bigint,text,jsonb,jsonb,jsonb,jsonb,uuid,text) to authenticated,service_role;

create or replace function public.execute_stock_command(
  p_business_id bigint,
  p_idempotency_key text,
  p_operation text,
  p_payload jsonb,
  p_actor_id uuid default null,
  p_source text default 'assistant_api'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id bigint; v_previous jsonb; v_result jsonb; v_item_id bigint; v_reason text; v_quantity numeric; v_cost numeric;
  v_at timestamptz; v_before numeric; v_after numeric; v_signed numeric; v_type public.movement_type; v_id bigint; v_entry jsonb;
  v_count_id bigint; v_counted numeric; v_variance numeric; v_lines integer:=0;
begin
  perform private.assert_erp_command_access(p_business_id,p_actor_id);
  if nullif(trim(p_idempotency_key),'') is null or length(trim(p_idempotency_key))<8 then raise exception 'Chave de idempotência inválida'; end if;
  if p_operation not in ('movement','inventory') or jsonb_typeof(p_payload)<>'object' then raise exception 'Operação de estoque inválida'; end if;
  insert into public.erp_command_requests(business_id,idempotency_key,operation,source,payload,actor_id)
  values(p_business_id,trim(p_idempotency_key),'stock_'||p_operation,coalesce(nullif(trim(p_source),''),'assistant_api'),p_payload,p_actor_id)
  on conflict(business_id,idempotency_key) do nothing returning id into v_request_id;
  if v_request_id is null then select result into v_previous from public.erp_command_requests where business_id=p_business_id and idempotency_key=trim(p_idempotency_key); if v_previous is null then raise exception 'Esta operação já está sendo processada'; end if; return v_previous||jsonb_build_object('idempotent_replay',true); end if;

  if p_operation='movement' then
    v_item_id:=nullif(p_payload->>'item_id','')::bigint; v_reason:=p_payload->>'reason'; v_quantity:=nullif(p_payload->>'quantity','')::numeric;
    v_cost:=nullif(p_payload->>'unit_cost','')::numeric; v_at:=nullif(p_payload->>'occurred_at','')::timestamptz;
    if v_reason not in ('other_in','breakage','waste','expiration','courtesy','internal_consumption','operational_error','loss','other_out') then raise exception 'Compras devem ser registradas pela API de compras; informe outro motivo válido'; end if;
    if v_quantity is null or v_quantity<=0 or v_at is null or v_at>now()+interval '5 minutes' or (v_cost is not null and v_cost<0) then raise exception 'Revise quantidade, custo e data'; end if;
    if not exists(select 1 from public.items where id=v_item_id and business_id=p_business_id and is_active) then raise exception 'Item inválido'; end if;
    v_before:=private.stock_theoretical_quantity(p_business_id,v_item_id,v_at); v_signed:=case when v_reason='other_in' then v_quantity else -v_quantity end; v_after:=v_before+v_signed;
    v_type:=case when v_reason='other_in' then 'adjustment_in'::public.movement_type when v_reason in ('breakage','waste','expiration','loss') then 'loss'::public.movement_type else 'adjustment_out'::public.movement_type end;
    select coalesce(v_cost,(select h.unit_cost from public.item_cost_history h where h.item_id=v_item_id and h.effective_from<=v_at::date order by h.effective_from desc,h.id desc limit 1),i.average_unit_cost,i.latest_unit_cost) into v_cost from public.items i where i.id=v_item_id;
    insert into public.stock_movements(business_id,item_id,movement_type,movement_reason,quantity,unit_cost,balance_before,balance_after,occurred_at,source_table,notes,created_by)
    values(p_business_id,v_item_id,v_type,v_reason,v_signed,v_cost,v_before,v_after,v_at,'assistant_api',nullif(trim(p_payload->>'notes'),''),p_actor_id) returning id into v_id;
    v_result:=jsonb_build_object('movement_id',v_id,'item_id',v_item_id,'before',v_before,'after',v_after,'difference',v_signed,'idempotent_replay',false);
  else
    v_at:=nullif(p_payload->>'counted_at','')::timestamptz;
    if v_at is null or v_at>now()+interval '5 minutes' or jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'Revise a data e os itens do inventário'; end if;
    insert into public.inventory_counts(business_id,counted_at,status,notes,created_by) values(p_business_id,v_at,'completed',nullif(trim(p_payload->>'notes'),''),p_actor_id) returning id into v_count_id;
    for v_entry in select value from jsonb_array_elements(p_payload->'items') loop
      v_item_id:=nullif(v_entry->>'item_id','')::bigint; v_counted:=nullif(v_entry->>'counted_quantity','')::numeric;
      if v_counted is null or v_counted<0 or not exists(select 1 from public.items where id=v_item_id and business_id=p_business_id and is_active) then raise exception 'Revise os itens e quantidades do inventário'; end if;
      v_before:=private.stock_theoretical_quantity(p_business_id,v_item_id,v_at);
      select coalesce((select h.unit_cost from public.item_cost_history h where h.item_id=v_item_id and h.effective_from<=v_at::date order by h.effective_from desc,h.id desc limit 1),i.average_unit_cost,i.latest_unit_cost) into v_cost from public.items i where i.id=v_item_id;
      insert into public.inventory_count_items(inventory_count_id,item_id,system_quantity,counted_quantity,unit_cost) values(v_count_id,v_item_id,v_before,v_counted,v_cost);
      v_variance:=v_counted-v_before;
      if v_variance<>0 then insert into public.stock_movements(business_id,item_id,movement_type,movement_reason,quantity,unit_cost,balance_before,balance_after,occurred_at,source_table,source_id,notes,created_by)
        values(p_business_id,v_item_id,'inventory','inventory_correction',v_variance,v_cost,v_before,v_counted,v_at,'inventory_counts',v_count_id,'Ajuste gerado pela contagem física via API',p_actor_id); end if;
      v_lines:=v_lines+1;
    end loop;
    v_result:=jsonb_build_object('inventory_count_id',v_count_id,'items',v_lines,'idempotent_replay',false);
  end if;
  insert into public.audit_logs(business_id,user_id,action,entity_table,entity_id,details) values(p_business_id,p_actor_id,'stock_command_committed',case when p_operation='inventory' then 'inventory_counts' else 'stock_movements' end,coalesce(v_count_id,v_id)::text,jsonb_build_object('source',p_source,'operation',p_operation,'idempotency_key',p_idempotency_key));
  update public.erp_command_requests set result=v_result,completed_at=now() where id=v_request_id;
  return v_result;
end;
$$;

revoke all on function public.execute_stock_command(bigint,text,text,jsonb,uuid,text) from public,anon;
grant execute on function public.execute_stock_command(bigint,text,text,jsonb,uuid,text) to authenticated,service_role;

create or replace function public.get_stock_api_context(p_business_id bigint,p_period_start date,p_period_end date)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case when (select auth.role())='service_role' or ((select auth.uid()) is not null and (select private.is_business_member(p_business_id))) then
    jsonb_build_object(
      'business_id',p_business_id,'period_start',p_period_start,'period_end',p_period_end,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'type',i.item_type,'unit',i.consumption_unit,'sector',coalesce(a.name,'Geral'),'current_stock',private.stock_theoretical_quantity(p_business_id,i.id,now()),'unit_cost',coalesce(i.average_unit_cost,i.latest_unit_cost)) order by i.name)
        from public.items i left join public.areas a on a.id=i.area_id where i.business_id=p_business_id and i.is_active),'[]'::jsonb),
      'movements',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (select sm.id,sm.occurred_at,sm.item_id,i.name,sm.movement_reason,sm.quantity,i.consumption_unit unit,sm.unit_cost,sm.notes from public.stock_movements sm join public.items i on i.id=sm.item_id where sm.business_id=p_business_id and sm.occurred_at::date between p_period_start and p_period_end order by sm.occurred_at desc limit 500) x),'[]'::jsonb)
    ) else null end;
$$;

revoke all on function public.get_stock_api_context(bigint,date,date) from public,anon;
grant execute on function public.get_stock_api_context(bigint,date,date) to authenticated,service_role;

comment on function public.ingest_complete_purchase(bigint,text,jsonb,jsonb,jsonb,jsonb,uuid,text) is 'Cria ou encontra fornecedor e itens, registra compra, despesa, recebimento, custos e estoque atomicamente.';
comment on function public.execute_stock_command(bigint,text,text,jsonb,uuid,text) is 'Executa movimentações manuais e inventários de forma atômica e idempotente.';
