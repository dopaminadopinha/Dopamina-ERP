import { NextRequest } from "next/server";
import { authorizeErpApi, erpApiErrorResponse, ErpApiError } from "@/lib/erp-api/auth";
import { validatePurchaseIntake, type PurchaseIntakeBody } from "@/lib/erp-api/purchase-intake";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as PurchaseIntakeBody | null;
    if (!body) throw new ErpApiError("Envie os dados extraídos da nota em JSON.", 400);
    const requestedBusinessId = Number.isInteger(Number(body.businessId)) ? Number(body.businessId) : undefined;
    const auth = await authorizeErpApi(request, requestedBusinessId);
    const validation = await validatePurchaseIntake(auth.admin, auth.businessId, body);

    if (body.mode !== "commit") {
      return Response.json({ ...validation, businessId: auth.businessId, instruction: validation.readyToCommit ? "Os dados estão completos. Peça confirmação explícita ao usuário antes de enviar mode=commit." : "Pergunte ao usuário as questions retornadas e valide novamente. Nada foi gravado." });
    }

    if (!validation.readyToCommit) {
      return Response.json({ ...validation, businessId: auth.businessId, error: "A compra não foi gravada porque ainda existem informações pendentes." }, { status: 422 });
    }
    const idempotencyKey = body.idempotencyKey?.trim() ?? "";
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new ErpApiError("Informe uma chave idempotencyKey estável para esta nota.", 400);

    const { data, error } = await auth.admin.rpc("ingest_complete_purchase", {
      p_business_id: auth.businessId,
      p_idempotency_key: idempotencyKey,
      p_supplier: validation.normalized.supplier,
      p_purchase: validation.normalized.purchase,
      p_items: validation.normalized.items,
      p_misc_items: validation.normalized.misc_items,
      p_actor_id: auth.actorId,
      p_source: auth.source,
    });
    if (error) throw new ErpApiError(error.message, 409);
    return Response.json({ status: "committed", businessId: auth.businessId, result: data, message: "Compra, fornecedor, itens, despesa e estoque foram processados em uma única transação." }, { status: 201 });
  } catch (error) {
    return erpApiErrorResponse(error, "Não foi possível processar a compra.");
  }
}
