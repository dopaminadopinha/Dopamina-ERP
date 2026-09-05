import { NextRequest } from "next/server";
import { authorizeErpApi, erpApiErrorResponse, ErpApiError } from "@/lib/erp-api/auth";
import { commitPurchaseIntake, validatePurchaseIntake, type PurchaseIntakeBody } from "@/lib/erp-api/purchase-intake";

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

    if (!validation.readyToCommit) return Response.json({ ...validation, businessId: auth.businessId, error: "A compra não foi gravada porque ainda existem informações pendentes." }, { status: 422 });
    const result = await commitPurchaseIntake({ ...auth, source: auth.source }, body);
    return Response.json(result, { status: result.committed ? 201 : 422 });
  } catch (error) {
    return erpApiErrorResponse(error, "Não foi possível processar a compra.");
  }
}
