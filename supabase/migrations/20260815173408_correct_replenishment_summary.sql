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
  if (select auth.uid()) is null or not (select private.is_business_member(p_business_id)) then raise exception 'Acesso negado ao negÃ³cio'; end if;
  if p_period_start is null or p_period_end is null or p_period_start > p_period_end then raise exception 'PerÃ­odo invÃ¡lido'; end if;
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
