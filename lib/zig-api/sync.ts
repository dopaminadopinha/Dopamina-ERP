import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchRevenue, fetchSoldProducts, ZigApiError, zigConfiguration } from "./client";
import { formatZigDate, normalizePaymentRows, normalizeProductRows } from "./normalize";

type Endpoint = "saida-produtos" | "faturamento";
type SyncResult = { endpoint: Endpoint; date: string; status: "completed" | "failed"; rows: number; totalCents?: number; error?: string };

function requiredServerEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`A variável segura ${name} não foi configurada.`);
  return value;
}

export function createAdminClient() {
  return createClient(requiredServerEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredServerEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function safeError(error: unknown) {
  if (error instanceof ZigApiError) return { message: error.message, status: error.status };
  if (error instanceof Error) return { message: error.message, status: null };
  return { message: "Falha desconhecida na sincronização.", status: null };
}

async function startRun(admin: SupabaseClient, businessId: number, endpoint: Endpoint, date: string) {
  const { data, error } = await admin.from("zig_sync_runs").insert({
    business_id: businessId,
    endpoint,
    requested_date: date,
    status: "running",
  }).select("id").single();
  if (error) throw error;
  return Number(data.id);
}

async function markFailure(admin: SupabaseClient, businessId: number, endpoint: Endpoint, date: string, runId: number, error: unknown) {
  const failure = safeError(error);
  await Promise.all([
    admin.from("zig_sync_runs").update({
      status: "failed",
      http_status: failure.status,
      error_message: failure.message.slice(0, 1000),
      completed_at: new Date().toISOString(),
    }).eq("id", runId).eq("business_id", businessId),
    admin.from("zig_sync_state").upsert({
      business_id: businessId,
      endpoint,
      last_attempt_at: new Date().toISOString(),
      status: "failed",
      error_message: failure.message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id,endpoint" }),
  ]);
  return failure.message;
}

async function syncProducts(admin: SupabaseClient, businessId: number, date: string): Promise<SyncResult> {
  const endpoint: Endpoint = "saida-produtos";
  const runId = await startRun(admin, businessId, endpoint, date);
  try {
    const rows = normalizeProductRows(await fetchSoldProducts(formatZigDate(date)));
    const { error } = await admin.rpc("sync_zig_products_day", {
      p_business_id: businessId,
      p_operational_date: date,
      p_rows: rows,
      p_run_id: runId,
    });
    if (error) throw error;
    return { endpoint, date, status: "completed", rows: rows.length };
  } catch (error) {
    return { endpoint, date, status: "failed", rows: 0, error: await markFailure(admin, businessId, endpoint, date, runId, error) };
  }
}

async function syncRevenue(admin: SupabaseClient, businessId: number, date: string): Promise<SyncResult> {
  const endpoint: Endpoint = "faturamento";
  const runId = await startRun(admin, businessId, endpoint, date);
  try {
    const rows = normalizePaymentRows(await fetchRevenue(formatZigDate(date)));
    const totalCents = rows.reduce((sum, row) => sum + row.value_cents, 0);
    const { error } = await admin.rpc("sync_zig_revenue_day", {
      p_business_id: businessId,
      p_operational_date: date,
      p_rows: rows,
      p_run_id: runId,
    });
    if (error) throw error;
    return { endpoint, date, status: "completed", rows: rows.length, totalCents };
  } catch (error) {
    return { endpoint, date, status: "failed", rows: 0, error: await markFailure(admin, businessId, endpoint, date, runId, error) };
  }
}

function isoDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error("Período de sincronização inválido.");
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 31) throw new Error("Sincronize no máximo 31 dias por execução.");
  return Array.from({ length: days }, (_, index) => new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10));
}

export async function syncZigRange(businessId: number, startDate: string, endDate: string) {
  zigConfiguration();
  const admin = createAdminClient();
  const results: SyncResult[] = [];
  for (const date of isoDates(startDate, endDate)) {
    // A API apresentou falhas em intervalos grandes; os endpoints são consultados um por vez e por dia.
    results.push(await syncProducts(admin, businessId, date));
    results.push(await syncRevenue(admin, businessId, date));
  }
  return {
    startDate,
    endDate,
    status: results.every((row) => row.status === "completed") ? "completed" : results.some((row) => row.status === "completed") ? "partial" : "failed",
    results,
  };
}
