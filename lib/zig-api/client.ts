const BASE_URL = "https://api.zigcore.com.br/integration";
const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [700, 1_800, 4_000];

export class ZigApiError extends Error {
  constructor(message: string, public readonly status: number | null = null) {
    super(message);
    this.name = "ZigApiError";
  }
}

function requiredEnv(name: "ZIG_API_TOKEN" | "ZIG_REDE_ID" | "ZIG_LOJA_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new ZigApiError(`A variável segura ${name} não foi configurada.`);
  return value;
}

function asRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    for (const key of ["data", "result", "items", "content"]) {
      if (Array.isArray(object[key])) return object[key] as unknown[];
    }
  }
  throw new ZigApiError("A Zig respondeu em um formato diferente do esperado.");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number | null) {
  return status === null || status === 408 || status === 429 || (status >= 500 && status <= 599);
}

async function request(endpoint: string, params: Record<string, string>) {
  const token = requiredEnv("ZIG_API_TOKEN");
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let lastError: ZigApiError | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: token },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const details = (await response.text()).slice(0, 300).replace(/\s+/g, " ");
        throw new ZigApiError(
          `A Zig retornou HTTP ${response.status}${details ? `: ${details}` : ""}`,
          response.status,
        );
      }
      return asRows(await response.json());
    } catch (error) {
      lastError = error instanceof ZigApiError
        ? error
        : new ZigApiError(error instanceof Error && error.name === "AbortError"
          ? "A consulta à Zig excedeu 20 segundos."
          : "Não foi possível conectar à API da Zig.");
      if (attempt >= RETRY_DELAYS_MS.length || !shouldRetry(lastError.status)) throw lastError;
      await sleep(RETRY_DELAYS_MS[attempt]);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new ZigApiError("Falha desconhecida ao consultar a Zig.");
}

export function zigConfiguration() {
  return {
    redeId: requiredEnv("ZIG_REDE_ID"),
    lojaId: requiredEnv("ZIG_LOJA_ID"),
  };
}

export async function fetchSoldProducts(date: string) {
  const { lojaId } = zigConfiguration();
  return request("/erp/saida-produtos", { dtinicio: date, dtfim: date, loja: lojaId });
}

export async function fetchRevenue(date: string) {
  const { lojaId } = zigConfiguration();
  return request("/erp/faturamento", { dtinicio: date, dtfim: date, loja: lojaId });
}

export type ProbeResult = { path: string; ok: boolean; status: number | null; bodySnippet: string; error: string | null };

export async function probeEndpoint(path: string, params: Record<string, string>): Promise<ProbeResult> {
  const token = requiredEnv("ZIG_API_TOKEN");
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: token },
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    return { path, ok: response.ok, status: response.status, bodySnippet: text.slice(0, 4000), error: null };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Tempo esgotado (20s)."
      : error instanceof Error ? error.message : "Falha desconhecida.";
    return { path, ok: false, status: null, bodySnippet: "", error: message };
  } finally {
    clearTimeout(timeout);
  }
}
