import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/zig-api/sync";

export class ErpApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function sameSecret(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function authorizeErpApi(request: NextRequest, requestedBusinessId?: number) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new ErpApiError("Autenticação obrigatória.", 401);

  const token = authorization.slice(7).trim();
  const admin = createAdminClient();
  const apiSecret = process.env.ERP_API_SECRET?.trim();

  if (apiSecret && sameSecret(token, apiSecret)) {
    const slug = process.env.ERP_API_BUSINESS_SLUG?.trim() || "dopamina";
    const { data: business, error } = await admin.from("businesses").select("id").eq("slug", slug).eq("is_active", true).single();
    if (error || !business) throw new ErpApiError("Negócio configurado para a API não foi encontrado.", 503);
    const businessId = Number(business.id);
    if (requestedBusinessId && requestedBusinessId !== businessId) throw new ErpApiError("A chave não pertence ao negócio informado.", 403);
    return { admin, businessId, actorId: null as string | null, source: "assistant_api" as const };
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new ErpApiError("Sessão inválida ou expirada.", 401);

  let membershipQuery = admin.from("business_members").select("business_id").eq("user_id", userData.user.id).eq("status", "active");
  if (requestedBusinessId) membershipQuery = membershipQuery.eq("business_id", requestedBusinessId);
  const { data: membership, error: membershipError } = await membershipQuery.limit(1).maybeSingle();
  if (membershipError || !membership) throw new ErpApiError("Você não possui acesso a este negócio.", 403);

  return { admin, businessId: Number(membership.business_id), actorId: userData.user.id, source: "user_session" as const };
}

export function erpApiErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ErpApiError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}
