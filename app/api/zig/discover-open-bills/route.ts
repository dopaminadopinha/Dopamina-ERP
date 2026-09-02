import { NextRequest } from "next/server";
import { probeEndpoint, zigConfiguration } from "@/lib/zig-api/client";
import { createAdminClient } from "@/lib/zig-api/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const admin = createAdminClient();
  const token = authorization.slice(7);
  if (!token) return null;
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return null;
  const { data: membership, error: membershipError } = await admin
    .from("business_members")
    .select("business_id")
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError || !membership) return null;
  return Number(membership.business_id);
}

const CANDIDATE_PATHS = [
  "/erp/contas-abertas",
  "/erp/contas-em-aberto",
  "/erp/comandas",
  "/erp/comandas-abertas",
  "/erp/consumo-clientes",
  "/erp/consumo-funcionarios",
  "/erp/clientes",
  "/erp/contas",
  "/erp/comanda",
];

export async function POST(request: NextRequest) {
  try {
    const businessId = await authorize(request);
    if (!businessId) return Response.json({ error: "Autenticação obrigatória." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { date?: string };
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const { lojaId } = zigConfiguration();
    const admin = createAdminClient();

    const results = await Promise.all(
      CANDIDATE_PATHS.map((path) => probeEndpoint(path, { dtinicio: date, dtfim: date, loja: lojaId })),
    );

    await admin.from("zig_endpoint_probe_log").insert(results.map((row) => ({
      business_id: businessId,
      requested_date: date,
      endpoint_path: row.path,
      http_status: row.status,
      ok: row.ok,
      body_snippet: row.bodySnippet || null,
      error_message: row.error,
    })));

    return Response.json({ date, results: results.map((row) => ({ path: row.path, ok: row.ok, status: row.status, error: row.error })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar endpoints da Zig.";
    return Response.json({ error: message }, { status: 400 });
  }
}
