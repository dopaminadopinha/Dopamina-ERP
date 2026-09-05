import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ErpApiError } from "@/lib/erp-api/auth";

export type StockBody = {
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

export type ErpCommandContext = {
  admin: SupabaseClient;
  businessId: number;
  actorId: string | null;
  source: "assistant_api" | "user_session" | "mcp";
};

const REASONS = new Set(["other_in", "breakage", "waste", "expiration", "courtesy", "internal_consumption", "operational_error", "loss", "other_out"]);

function normalizedName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function decimal(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.replace(/R\$/gi, "").replace(/\s/g, "");
  const parsed = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validStockDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

async function catalogFor(context: ErpCommandContext) {
  const { data, error } = await context.admin
    .from("items")
    .select("id,name,item_type,consumption_unit,area_id,areas(name)")
    .eq("business_id", context.businessId)
    .eq("is_active", true)
    .order("name");
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

export async function getStockContext(context: ErpCommandContext, start: string, end: string) {
  if (!validStockDate(start) || !validStockDate(end) || start > end) throw new Error("Período inválido.");
  const { data, error } = await context.admin.rpc("get_stock_api_context", {
    p_business_id: context.businessId,
    p_period_start: start,
    p_period_end: end,
  });
  if (error) throw error;
  return data;
}

export async function validateStockCommand(context: ErpCommandContext, body: StockBody) {
  const catalog = await catalogFor(context);
  const questions: string[] = [];
  let payload: Record<string, unknown> = {};

  if (body.operation === "movement") {
    const item = resolveItem(catalog, body.itemId, body.itemName);
    const quantity = decimal(body.quantity);
    const unitCost = body.unitCost === null || body.unitCost === undefined || body.unitCost === "" ? null : decimal(body.unitCost);
    if (!item) questions.push("Qual item cadastrado deve ser movimentado?");
    if (!body.reason || !REASONS.has(body.reason)) questions.push("Qual é o motivo da entrada ou saída?");
    if (quantity === null || quantity <= 0) questions.push("Qual é a quantidade movimentada?");
    if (!validStockDate(body.date)) questions.push("Qual é a data da movimentação?");
    if (unitCost !== null && unitCost < 0) questions.push("Informe um custo unitário válido.");
    payload = {
      item_id: item ? Number(item.id) : null,
      reason: body.reason ?? null,
      quantity,
      unit_cost: unitCost,
      occurred_at: validStockDate(body.date) ? `${body.date}T00:00:00-03:00` : null,
      notes: body.notes?.trim() || null,
    };
  } else if (body.operation === "inventory") {
    if (!validStockDate(body.date)) questions.push("Qual é a data da contagem física?");
    const lines = (body.items ?? []).map((line, index) => {
      const item = resolveItem(catalog, line.itemId, line.itemName);
      const counted = decimal(line.countedQuantity);
      if (!item) questions.push(`Qual item cadastrado corresponde à linha ${index + 1}?`);
      if (counted === null || counted < 0) questions.push(`Qual foi a quantidade física encontrada para ${line.itemName || `a linha ${index + 1}`}?`);
      return { item_id: item ? Number(item.id) : null, counted_quantity: counted };
    });
    if (!lines.length) questions.push("Quais itens foram contados no inventário?");
    payload = {
      counted_at: validStockDate(body.date) ? `${body.date}T00:00:00-03:00` : null,
      items: lines,
      notes: body.notes?.trim() || null,
    };
  } else {
    questions.push("A operação é uma movimentação ou um inventário?");
  }

  return {
    status: questions.length ? "needs_information" as const : "ready" as const,
    readyToCommit: questions.length === 0,
    questions,
    normalized: { operation: body.operation ?? null, payload },
    instruction: questions.length
      ? "Pergunte ao usuário antes de tentar novamente. Nada foi gravado."
      : "Peça confirmação explícita antes de executar a operação.",
  };
}

export async function commitStockCommand(context: ErpCommandContext, body: StockBody) {
  const validation = await validateStockCommand(context, body);
  if (!validation.readyToCommit) return { ...validation, committed: false as const };

  const idempotencyKey = body.idempotencyKey?.trim() ?? "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new ErpApiError("Informe uma chave idempotencyKey estável para esta operação.", 400);
  const { data, error } = await context.admin.rpc("execute_stock_command", {
    p_business_id: context.businessId,
    p_idempotency_key: idempotencyKey,
    p_operation: body.operation,
    p_payload: validation.normalized.payload,
    p_actor_id: context.actorId,
    p_source: context.source,
  });
  if (error) throw new ErpApiError(error.message, 409);
  return { status: "committed" as const, committed: true as const, result: data };
}
