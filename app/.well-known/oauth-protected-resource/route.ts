import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

export const runtime = "nodejs";

function authServerUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada.");
  return `${supabaseUrl}/auth/v1`;
}

export function GET(request: Request) {
  return protectedResourceHandler({ authServerUrls: [authServerUrl()] })(request);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
