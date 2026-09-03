import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/zig-api/sync";

export const runtime = "nodejs";

type PurchaseLine = { item_id: number; quantity: number; unit: string; unit_cost: number };
type MiscLine = { description: string; quantity: number | null; unit: string | null; unit_cost: number };
type PurchaseBody = {
  businessId?: number;
  supplierId?: number;
  purchaseDate?: string;
  paymentMethod?: string;
  dueDate?: string | null;
  notes?: string;
  items?: PurchaseLine[];
  miscItems?: MiscLine[];
};

async function authorize(request:NextRequest,businessId:number){
  const authorization=request.headers.get("authorization")??"";
  if(!authorization.startsWith("Bearer "))return null;
  const admin=createAdminClient();
  const {data:userData,error:userError}=await admin.auth.getUser(authorization.slice(7));
  if(userError||!userData.user)return null;
  const {data:membership}=await admin.from("business_members").select("business_id").eq("business_id",businessId).eq("user_id",userData.user.id).eq("status","active").maybeSingle();
  return membership?{admin,userId:userData.user.id}:null;
}

function validNumber(value:unknown,allowNull=false){
  if(allowNull&&value===null)return true;
  return typeof value==="number"&&Number.isFinite(value)&&value>0;
}

async function hasReceipts(admin:ReturnType<typeof createAdminClient>,purchaseId:number){
  const {count,error}=await admin.from("purchase_receipts").select("id",{count:"exact",head:true}).eq("purchase_id",purchaseId);
  if(error)throw error;
  return Number(count)>0;
}

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const purchaseId=Number((await params).id);const body=await request.json() as PurchaseBody;const businessId=Number(body.businessId);
    if(!Number.isInteger(purchaseId)||!Number.isInteger(businessId))return Response.json({error:"Compra inválida."},{status:400});
    const auth=await authorize(request,businessId);if(!auth)return Response.json({error:"Autenticação obrigatória."},{status:401});
    const {admin,userId}=auth;
    const {data:purchase,error:purchaseError}=await admin.from("purchases").select("id,code,fulfillment_status,payment_status").eq("id",purchaseId).eq("business_id",businessId).maybeSingle();
    if(purchaseError||!purchase)return Response.json({error:"Compra não encontrada."},{status:404});
    if(await hasReceipts(admin,purchaseId))return Response.json({error:"Uma compra com recebimento confirmado não pode ser editada."},{status:409});
    if(purchase.fulfillment_status==="cancelled")return Response.json({error:"Uma compra cancelada não pode ser editada."},{status:409});
    const items=body.items??[];const miscItems=body.miscItems??[];
    if(!body.supplierId||!body.purchaseDate||(!items.length&&!miscItems.length))return Response.json({error:"Preencha fornecedor, data e ao menos um item."},{status:400});
    if(items.some(item=>!Number.isInteger(Number(item.item_id))||!validNumber(Number(item.quantity))||typeof item.unit!=="string"||!item.unit.trim()||typeof item.unit_cost!=="number"||!Number.isFinite(item.unit_cost)||item.unit_cost<0))return Response.json({error:"Revise os produtos da compra."},{status:400});
    if(miscItems.some(item=>!item.description?.trim()||!validNumber(item.quantity,true)||typeof item.unit_cost!=="number"||!Number.isFinite(item.unit_cost)||item.unit_cost<0))return Response.json({error:"Revise os gastos avulsos."},{status:400});
    const {data:supplier}=await admin.from("suppliers").select("id").eq("id",body.supplierId).eq("business_id",businessId).maybeSingle();
    if(!supplier)return Response.json({error:"Selecione um fornecedor válido."},{status:400});
    if(items.length){const ids=[...new Set(items.map(item=>Number(item.item_id)))];const {data:validItems}=await admin.from("items").select("id").eq("business_id",businessId).in("id",ids);if((validItems??[]).length!==ids.length)return Response.json({error:"Um produto não pertence a este negócio."},{status:400});}
    const total=items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_cost),0)+miscItems.reduce((sum,item)=>sum+Number(item.quantity??1)*Number(item.unit_cost),0);
    const purchaseUpdate=await admin.from("purchases").update({supplier_id:body.supplierId,purchase_date:body.purchaseDate,payment_method:body.paymentMethod?.trim()||null,due_date:body.dueDate||null,total_amount:Number(total.toFixed(2)),notes:body.notes?.trim()||null,updated_at:new Date().toISOString()}).eq("id",purchaseId).eq("business_id",businessId);
    if(purchaseUpdate.error)throw purchaseUpdate.error;
    const oldItemsRemoved=await admin.from("purchase_items").delete().eq("purchase_id",purchaseId);if(oldItemsRemoved.error)throw oldItemsRemoved.error;
    const oldMiscRemoved=await admin.from("purchase_misc_items").delete().eq("purchase_id",purchaseId);if(oldMiscRemoved.error)throw oldMiscRemoved.error;
    if(items.length){const inserted=await admin.from("purchase_items").insert(items.map(item=>({purchase_id:purchaseId,item_id:item.item_id,quantity:item.quantity,pack_quantity:1,unit_cost:item.unit_cost,unit:item.unit.trim()})));if(inserted.error)throw inserted.error;const linked=await admin.from("supplier_items").upsert(items.map(item=>({business_id:businessId,supplier_id:body.supplierId!,item_id:item.item_id,created_by:userId})),{onConflict:"supplier_id,item_id",ignoreDuplicates:true});if(linked.error)throw linked.error;}
    if(miscItems.length){const inserted=await admin.from("purchase_misc_items").insert(miscItems.map(item=>({purchase_id:purchaseId,description:item.description.trim(),quantity:item.quantity,unit:item.unit?.trim()||null,unit_cost:item.unit_cost})));if(inserted.error)throw inserted.error;}
    const expenseUpdate=await admin.from("expenses").update({supplier_id:body.supplierId,expense_date:body.purchaseDate,due_date:body.dueDate||null,amount:Number(total.toFixed(2)),payment_method:body.paymentMethod?.trim()||null,status:purchase.payment_status==="paid"?"completed":"pending",updated_at:new Date().toISOString()}).eq("business_id",businessId).eq("purchase_id",purchaseId);if(expenseUpdate.error)throw expenseUpdate.error;
    await admin.from("audit_logs").insert({business_id:businessId,user_id:userId,action:"purchase_updated",entity_table:"purchases",entity_id:String(purchaseId),details:{total:Number(total.toFixed(2))}});
    return Response.json({ok:true});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Não foi possível editar a compra."},{status:500});}
}

type ReceiptRow={id:number;received_at:string};
type ReceiptItemRow={id:number;receipt_id:number;item_id:number;quantity:number;unit_cost:number};
type JoinedReceipt={received_at:string;purchase_id:number;business_id:number};

function joinedReceipt(value:JoinedReceipt|JoinedReceipt[]|null){return Array.isArray(value)?value[0]??null:value;}

async function recalculatePurchaseCosts(admin:ReturnType<typeof createAdminClient>,businessId:number,purchaseId:number,userId:string,receiptItems:ReceiptItemRow[],receipts:ReceiptRow[]){
  const receiptDates=new Map(receipts.map(receipt=>[Number(receipt.id),receipt.received_at.slice(0,10)]));
  const datesByItem=new Map<number,Set<string>>();
  receiptItems.forEach(item=>{const date=receiptDates.get(Number(item.receipt_id));if(!date)return;const dates=datesByItem.get(Number(item.item_id))??new Set<string>();dates.add(date);datesByItem.set(Number(item.item_id),dates);});
  const today=new Date().toISOString().slice(0,10);

  for(const [itemId,dates] of datesByItem){
    const remainingResult=await admin.from("purchase_receipt_items").select("id,quantity,unit_cost,purchase_receipts!inner(received_at,purchase_id,business_id)").eq("item_id",itemId).eq("purchase_receipts.business_id",businessId);
    if(remainingResult.error)throw remainingResult.error;
    const remaining=(remainingResult.data??[]) as unknown as {id:number;quantity:number;unit_cost:number;purchase_receipts:JoinedReceipt|JoinedReceipt[]|null}[];
    for(const date of dates){
      const latest=[...remaining].filter(row=>joinedReceipt(row.purchase_receipts)?.received_at.slice(0,10)===date).sort((a,b)=>{const receiptOrder=(joinedReceipt(b.purchase_receipts)?.received_at??"").localeCompare(joinedReceipt(a.purchase_receipts)?.received_at??"");return receiptOrder||Number(b.id)-Number(a.id);})[0];
      if(latest){
        const source=joinedReceipt(latest.purchase_receipts)!;
        const restored=await admin.from("item_cost_history").upsert({business_id:businessId,item_id:itemId,unit_cost:Number(latest.unit_cost),effective_from:date,source:"purchase",notes:`Custo confirmado no recebimento da compra ${source.purchase_id}`,created_by:userId,updated_at:new Date().toISOString()},{onConflict:"item_id,effective_from"});
        if(restored.error)throw restored.error;
      }else{
        const removed=await admin.from("item_cost_history").delete().eq("business_id",businessId).eq("item_id",itemId).eq("effective_from",date).eq("source","purchase");
        if(removed.error)throw removed.error;
      }
    }
    const latestCostResult=await admin.from("item_cost_history").select("unit_cost").eq("business_id",businessId).eq("item_id",itemId).lte("effective_from",today).order("effective_from",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();
    if(latestCostResult.error)throw latestCostResult.error;
    const weightedQuantity=remaining.reduce((sum,row)=>sum+Number(row.quantity),0);
    const weightedCost=weightedQuantity>0?remaining.reduce((sum,row)=>sum+Number(row.quantity)*Number(row.unit_cost),0)/weightedQuantity:null;
    const latestCost=latestCostResult.data?Number(latestCostResult.data.unit_cost):null;
    const itemUpdated=await admin.from("items").update({latest_unit_cost:latestCost,average_unit_cost:weightedCost??latestCost,updated_at:new Date().toISOString()}).eq("id",itemId).eq("business_id",businessId);
    if(itemUpdated.error)throw itemUpdated.error;
  }
  return {itemCount:datesByItem.size,lineCount:receiptItems.length,purchaseId};
}

export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const purchaseId=Number((await params).id);const businessId=Number(request.nextUrl.searchParams.get("businessId"));const reverseStock=request.nextUrl.searchParams.get("reverseStock")==="true";
    if(!Number.isInteger(purchaseId)||!Number.isInteger(businessId))return Response.json({error:"Compra inválida."},{status:400});
    const auth=await authorize(request,businessId);if(!auth)return Response.json({error:"Autenticação obrigatória."},{status:401});
    const {admin,userId}=auth;
    const {data:purchase}=await admin.from("purchases").select("id,code").eq("id",purchaseId).eq("business_id",businessId).maybeSingle();if(!purchase)return Response.json({error:"Compra não encontrada."},{status:404});
    const receiptsResult=await admin.from("purchase_receipts").select("id,received_at").eq("purchase_id",purchaseId).eq("business_id",businessId);
    if(receiptsResult.error)throw receiptsResult.error;
    const receipts=(receiptsResult.data??[]) as ReceiptRow[];
    if(receipts.length&&!reverseStock)return Response.json({error:"Esta compra já movimentou o estoque. Confirme a reversão do estoque para excluí-la.",requiresStockReversal:true},{status:409});
    let reversal={itemCount:0,lineCount:0,purchaseId};let costRecalculationWarning:string|null=null;
    if(receipts.length){
      const receiptIds=receipts.map(receipt=>Number(receipt.id));
      const receiptItemsResult=await admin.from("purchase_receipt_items").select("id,receipt_id,item_id,quantity,unit_cost").in("receipt_id",receiptIds);
      if(receiptItemsResult.error)throw receiptItemsResult.error;
      const receiptItems=(receiptItemsResult.data??[]) as ReceiptItemRow[];
      const receiptItemIds=receiptItems.map(item=>Number(item.id));
      if(receiptItemIds.length){
        const movementsResult=await admin.from("stock_movements").select("id,source_id,item_id,quantity").eq("business_id",businessId).eq("source_table","purchase_receipt_items").in("source_id",receiptItemIds);
        if(movementsResult.error)throw movementsResult.error;
        const movements=movementsResult.data??[];
        const movementsBySource=new Map(movements.map(row=>[Number(row.source_id),row]));
        const safe=movements.length===receiptItems.length&&receiptItems.every(item=>{const movement=movementsBySource.get(Number(item.id));return movement&&Number(movement.item_id)===Number(item.item_id)&&Math.abs(Number(movement.quantity)-Number(item.quantity))<0.00001;});
        if(!safe)return Response.json({error:"Não foi possível conferir todas as entradas desta compra. O estoque e a compra foram preservados para evitar uma reversão incorreta."},{status:409});
        const movementsRemoved=await admin.from("stock_movements").delete().eq("business_id",businessId).eq("source_table","purchase_receipt_items").in("source_id",receiptItemIds);
        if(movementsRemoved.error)throw movementsRemoved.error;
        const receiptItemsRemoved=await admin.from("purchase_receipt_items").delete().in("id",receiptItemIds);
        if(receiptItemsRemoved.error)throw receiptItemsRemoved.error;
      }
      const receiptsRemoved=await admin.from("purchase_receipts").delete().eq("business_id",businessId).eq("purchase_id",purchaseId);
      if(receiptsRemoved.error)throw receiptsRemoved.error;
      try{reversal=await recalculatePurchaseCosts(admin,businessId,purchaseId,userId,receiptItems,receipts);}catch(costError){costRecalculationWarning=costError instanceof Error?costError.message:"Falha ao recalcular custos";reversal={itemCount:new Set(receiptItems.map(item=>Number(item.item_id))).size,lineCount:receiptItems.length,purchaseId};}
    }
    const expenseRemoved=await admin.from("expenses").delete().eq("business_id",businessId).eq("purchase_id",purchaseId);if(expenseRemoved.error)throw expenseRemoved.error;
    const purchaseRemoved=await admin.from("purchases").delete().eq("id",purchaseId).eq("business_id",businessId);if(purchaseRemoved.error)throw purchaseRemoved.error;
    await admin.from("audit_logs").insert({business_id:businessId,user_id:userId,action:receipts.length?"purchase_stock_reversed_and_deleted":"purchase_deleted",entity_table:"purchases",entity_id:String(purchaseId),details:{code:purchase.code,reversed_stock:receipts.length>0,reversed_items:reversal.itemCount,reversed_lines:reversal.lineCount,cost_recalculation_warning:costRecalculationWarning}});
    return Response.json({ok:true,reversedStock:receipts.length>0,reversal,costRecalculationWarning});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Não foi possível excluir a compra."},{status:500});}
}
