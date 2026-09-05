import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/zig-api/sync";

type TokenClaims = {
  client_id?: string;
  exp?: number;
  scope?: string | string[];
};

function tokenClaims(token: string): TokenClaims {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
  } catch {
    return {};
  }
}

export async function verifyMcpToken(_request: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  const token = bearerToken?.trim();
  if (!token) return undefined;

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return undefined;

  const slug = process.env.ERP_API_BUSINESS_SLUG?.trim() || "dopamina";
  const { data: business, error: businessError } = await admin
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (businessError || !business) return undefined;

  const { data: membership, error: membershipError } = await admin
    .from("business_members")
    .select("business_id,role")
    .eq("business_id", business.id)
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError || !membership) return undefined;

  const claims = tokenClaims(token);
  const scopes = Array.isArray(claims.scope)
    ? claims.scope
    : typeof claims.scope === "string"
      ? claims.scope.split(" ").filter(Boolean)
      : [];

  return {
    token,
    clientId: claims.client_id || "dopamina-erp-mcp",
    scopes,
    expiresAt: claims.exp,
    extra: {
      userId: userData.user.id,
      businessId: Number(membership.business_id),
      role: membership.role,
    },
  };
}
