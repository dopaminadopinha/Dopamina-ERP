import { NextRequest } from "next/server";
import { authorizeErpApi, erpApiErrorResponse, ErpApiError } from "@/lib/erp-api/auth";
import { commitStockCommand, getStockContext, type StockBody, validStockDate, validateStockCommand } from "@/lib/erp-api/stock";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const requested = Number(request.nextUrl.searchParams.get("businessId"));
    const auth = await authorizeErpApi(request, Number.isInteger(requested) ? requested : undefined);
    const start = request.nextUrl.searchParams.get("start") || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const end = request.nextUrl.searchParams.get("end") || new Date().toISOString().slice(0, 10);
    if (!validStockDate(start) || !validStockDate(end) || start > end) throw new ErpApiError("Período inválido.", 400);
    return Response.json(await getStockContext({ ...auth, source: auth.source }, start, end));
  } catch (error) { return erpApiErrorResponse(error, "Não foi possível consultar o estoque."); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as StockBody | null;
    if (!body) throw new ErpApiError("Envie a operação de estoque em JSON.", 400);
    const requested = Number(body.businessId);
    const auth = await authorizeErpApi(request, Number.isInteger(requested) ? requested : undefined);
    const context = { ...auth, source: auth.source };
    if (body.mode !== "commit") return Response.json(await validateStockCommand(context, body));
    const result = await commitStockCommand(context, body);
    return Response.json(result, { status: result.committed ? 201 : 422 });
  } catch (error) { return erpApiErrorResponse(error, "Não foi possível processar a operação de estoque."); }
}
