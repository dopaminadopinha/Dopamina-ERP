import { NextRequest } from "next/server";
import { createAdminClient, syncZigRange } from "@/lib/zig-api/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function saoPauloDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function authorize(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!authorization.startsWith("Bearer ")) return null;
  const admin = createAdminClient();

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    const { data, error } = await admin.from("businesses").select("id").eq("slug", "dopamina").eq("is_active", true).single();
    if (error || !data) throw new Error("Negócio Dopamina não encontrado.");
    return Number(data.id);
  }

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

async function runSync(request: NextRequest, body: { startDate?: string; endDate?: string }) {
  try {
    const businessId = await authorize(request);
    if (!businessId) return Response.json({ error: "Autenticação obrigatória." }, { status: 401 });
    const startDate = body.startDate ?? saoPauloDate(-1);
    const endDate = body.endDate ?? saoPauloDate();
    const result = await syncZigRange(businessId, startDate, endDate);
    return Response.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar a Zig.";
    const missingConfiguration = message.includes("não foi configurada");
    return Response.json({ error: message }, { status: missingConfiguration ? 503 : 400 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { startDate?: string; endDate?: string };
  return runSync(request, body);
}

export async function GET(request: NextRequest) {
  return runSync(request, {});
}
