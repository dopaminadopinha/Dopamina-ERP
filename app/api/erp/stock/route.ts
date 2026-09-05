import { NextRequest } from "next/server";
import { authorizeErpApi, erpApiErrorResponse, ErpApiError } from "@/lib/erp-api/auth";

export const runtime = "nodejs";

type StockBody = {
  businessId?: number;
  mode?: "validate" | "commit";
  idempotencyKey?: string;
  operation?: "movement" | "inventory";
  date?: string;
  itemId?: number;
  itemName?: string;
  reason?: string;
  quantity?: number | string;
  unitCost?: number | string | null;
  notes?: string;
  items?: Array<{ itemId?: number; itemName?: string; countedQuantity?: number | string }>;
};

const REASONS = new Set(["other_in", "breakage", "waste", "expiration", "courtesy", "internal_consumption", "operational_error", "loss", "other_out"]);
function normalizedName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim(); }
function decimal(value: unknown) { if (typeof value === "number") return Number.isFinite(value) ? value : null; if (typeof value !== "string" || !value.trim()) return null; const raw = value.replace(/R\$/gi, "").replace(/\s/g, ""); const parsed = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw); return Number.isFinite(parsed) ? parsed : null; }
function validDate(value: unknown) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const parsed = new Date(`${value}T12:00:00Z`); return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value; }

async function catalogFor(auth: Awaited<ReturnType<typeof authorizeErpApi>>) {
  const { data, error } = await auth.admin.from("items").select("id,name,item_type,consumption_unit,area_id,areas(name)").eq("business_id", auth.businessId).eq("is_active", true).order("name");
  if (error) throw error;
  return data ?? [];
}

function resolveItem(catalog: Awaited<ReturnType<typeof catalogFor>>, id: unknown, name: unknown) {
  const itemId = Number(id);
  if (Number.isInteger(itemId) && itemId > 0) return catalog.find((item) => Number(item.id) === itemId) ?? null;
  const itemName = typeof name === "string" ? normalizedName(name) : "";
  if (!itemName) return null;
  const matches = catalog.filter((item) => normalizedName(item.name) === itemName);
  return matches.length === 1 ? matches[0] : null;
}

export async function GET(request: NextRequest) {
  try {
    const requested = Number(request.nextUrl.searchParams.get("businessId"));
    const auth = await authorizeErpApi(request, Number.isInteger(requested) ? requested : undefined);
    const start = request.nextUrl.searchParams.get("start") || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const end = request.nextUrl.searchParams.get("end") || new Date().toISOString().slice(0, 10);
    if (!validDate(start) || !validDate(end) || start > end) throw new ErpApiError("Período inválido.", 400);
    const { data, error } = await auth.admin.rpc("get_stock_api_context", { p_business_id: auth.businessId, p_period_start: start, p_period_end: end });
    if (error) throw error;
    return Response.json(data);
  } catch (error) { return erpApiErrorResponse(error, "Não foi possível consultar o estoque."); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as StockBody | null;
    if (!body) throw new ErpApiError("Envie a operação de estoque em JSON.", 400);
    const requested = Number(body.businessId);
    const auth = await authorizeErpApi(request, Number.isInteger(requested) ? requested : undefined);
    const catalog = await catalogFor(auth);
    const questions: string[] = [];
    let payload: Record<string, unknown> = {};

    if (body.operation === "movement") {
      const item = resolveItem(catalog, body.itemId, body.itemName);
      const quantity = decimal(body.quantity);
      const unitCost = body.unitCost === null || body.unitCost === undefined || body.unitCost === "" ? null : decimal(body.unitCost);
      if (!item) questions.push("Qual item cadastrado deve ser movimentado?");
      if (!body.reason || !REASONS.has(body.reason)) questions.push("Qual é o motivo da entrada ou saída?");
      if (quantity === null || quantity <= 0) questions.push("Qual é a quantidade movimentada?");
      if (!validDate(body.date)) questions.push("Qual é a data da movimentação?");
      if (unitCost !== null && unitCost < 0) questions.push("Informe um custo unitário válido.");
      payload = { item_id: item ? Number(item.id) : null, reason: body.reason ?? null, quantity, unit_cost: unitCost, occurred_at: validDate(body.date) ? `${body.date}T00:00:00-03:00` : null, notes: body.notes?.trim() || null };
    } else if (body.operation === "inventory") {
      if (!validDate(body.date)) questions.push("Qual é a data da contagem física?");
      const lines = (body.items ?? []).map((line, index) => {
        const item = resolveItem(catalog, line.itemId, line.itemName);
        const counted = decimal(line.countedQuantity);
        if (!item) questions.push(`Qual item cadastrado corresponde à linha ${index + 1}?`);
        if (counted === null || counted < 0) questions.push(`Qual foi a quantidade física encontrada para ${line.itemName || `a linha ${index + 1}`}?`);
        return { item_id: item ? Number(item.id) : null, counted_quantity: counted };
      });
      if (!lines.length) questions.push("Quais itens foram contados no inventário?");
      payload = { counted_at: validDate(body.date) ? `${body.date}T00:00:00-03:00` : null, items: lines, notes: body.notes?.trim() || null };
    } else {
      questions.push("A operação é uma movimentação ou um inventário?");
    }

    if (body.mode !== "commit" || questions.length) {
      return Response.json({ status: questions.length ? "needs_information" : "ready", readyToCommit: questions.length === 0, questions, normalized: { operation: body.operation ?? null, payload }, instruction: questions.length ? "Pergunte ao usuário antes de tentar novamente. Nada foi gravado." : "Peça confirmação explícita antes de enviar mode=commit." }, { status: body.mode === "commit" && questions.length ? 422 : 200 });
    }
    const idempotencyKey = body.idempotencyKey?.trim() ?? "";
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new ErpApiError("Informe uma chave idempotencyKey estável para esta operação.", 400);
    const { data, error } = await auth.admin.rpc("execute_stock_command", { p_business_id: auth.businessId, p_idempotency_key: idempotencyKey, p_operation: body.operation, p_payload: payload, p_actor_id: auth.actorId, p_source: auth.source });
    if (error) throw new ErpApiError(error.message, 409);
    return Response.json({ status: "committed", result: data }, { status: 201 });
  } catch (error) { return erpApiErrorResponse(error, "Não foi possível processar a operação de estoque."); }
}
