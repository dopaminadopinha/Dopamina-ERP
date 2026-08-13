import { createHash } from "node:crypto";

type SourceRow = Record<string, unknown>;

export type NormalizedProductRow = {
  transaction_id: string;
  transaction_at: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  product_category: string;
  unit_value_cents: number;
  quantity: number;
  fractional_amount: number | null;
  fraction_unit: string;
  gross_amount_cents: number;
  discount_amount_cents: number;
  net_amount_cents: number;
  event_id: string;
  event_name: string;
  event_date: string | null;
  invoice_id: string;
  employee_name: string;
  sale_type: string;
  additions: unknown[];
  is_refunded: boolean;
  source: string;
  bar_id: string;
  bar_name: string;
  observation: string;
  kind_id: string;
  system_product: boolean | null;
  product_type: string;
  line_key: string;
};

export type NormalizedPaymentRow = {
  payment_key: string;
  payment_id: string;
  payment_name: string;
  value_cents: number;
  event_id: string;
  event_date: string | null;
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : Number(text(value).replace(",", "."));
  if (!Number.isFinite(parsed)) throw new Error(`Campo numérico inválido recebido da Zig: ${field}.`);
  return parsed;
}

function cents(value: unknown, field: string) {
  const parsed = number(value ?? 0, field);
  if (!Number.isInteger(parsed) || !Number.isSafeInteger(parsed)) {
    throw new Error(`O campo ${field} da Zig não veio como centavos inteiros.`);
  }
  return parsed;
}

function boolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "sim", "yes"].includes(text(value).toLowerCase());
}

function nullableBoolean(value: unknown) {
  if (value === null || value === undefined || text(value) === "") return null;
  return boolean(value);
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function dateOnly(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const brazilian = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  throw new Error(`Data inválida recebida da Zig: ${raw}.`);
}

function timestamp(value: unknown) {
  const raw = text(value);
  const brazilian = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brazilian) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = brazilian;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`).toISOString();
  }
  const parsed = new Date(raw);
  if (raw && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  throw new Error(`Data/hora inválida recebida da Zig: ${raw || "vazia"}.`);
}

function object(row: unknown): SourceRow {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("A Zig retornou uma linha inválida.");
  }
  return row as SourceRow;
}

export function normalizeProductRows(rawRows: unknown[]): NormalizedProductRow[] {
  const occurrences = new Map<string, number>();
  return rawRows.map((raw) => {
    const row = object(raw);
    const transactionId = text(row.transactionId);
    const productName = text(row.productName);
    if (!transactionId || !productName) throw new Error("Venda Zig sem transactionId ou productName.");
    const count = number(row.count ?? 0, "count");
    const fractional = row.fractionalAmount === null || row.fractionalAmount === undefined
      ? null
      : number(row.fractionalAmount, "fractionalAmount");
    const quantity = count !== 0 ? count : (fractional ?? 0);
    const unitCents = cents(row.unitValue ?? 0, "unitValue");
    const discountCents = Math.max(0, cents(row.discountValue ?? 0, "discountValue"));
    const grossCents = Math.round(unitCents * quantity);
    const additions = Array.isArray(row.additions) ? row.additions : [];
    const signature = digest({
      transactionId,
      productId: text(row.productId),
      unitCents,
      count,
      fractional,
      discountCents,
      additions,
      type: text(row.type),
      barId: text(row.barId),
      obs: text(row.obs),
    });
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);

    return {
      transaction_id: transactionId,
      transaction_at: timestamp(row.transactionDate),
      product_id: text(row.productId),
      product_sku: text(row.productSku),
      product_name: productName,
      product_category: text(row.productCategory) || "Sem categoria",
      unit_value_cents: unitCents,
      quantity,
      fractional_amount: fractional,
      fraction_unit: text(row.fractionUnit),
      gross_amount_cents: grossCents,
      discount_amount_cents: discountCents,
      net_amount_cents: grossCents - discountCents,
      event_id: text(row.eventId),
      event_name: text(row.eventName),
      event_date: dateOnly(row.eventDate),
      invoice_id: text(row.invoiceId),
      employee_name: text(row.employeeName),
      sale_type: text(row.type),
      additions,
      is_refunded: boolean(row.isRefunded),
      source: text(row.source),
      bar_id: text(row.barId),
      bar_name: text(row.barName) || "Geral",
      observation: text(row.obs),
      kind_id: text(row.kindId),
      system_product: nullableBoolean(row.systemProduct),
      product_type: text(row.productType),
      line_key: digest(`${signature}:${occurrence}`),
    };
  });
}

export function normalizePaymentRows(rawRows: unknown[]): NormalizedPaymentRow[] {
  const grouped = new Map<string, NormalizedPaymentRow>();
  for (const raw of rawRows) {
    const row = object(raw);
    const paymentName = text(row.paymentName);
    if (!paymentName) throw new Error("Faturamento Zig sem paymentName.");
    const identity = {
      paymentId: text(row.paymentId),
      paymentName,
      eventId: text(row.eventId),
      eventDate: dateOnly(row.eventDate),
    };
    const key = digest(identity);
    const current = grouped.get(key) ?? {
      payment_key: key,
      payment_id: identity.paymentId,
      payment_name: paymentName,
      value_cents: 0,
      event_id: identity.eventId,
      event_date: identity.eventDate,
    };
    current.value_cents += cents(row.value ?? 0, "value");
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function formatZigDate(isoDate: string) {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Data de sincronização inválida.");
  return `${match[3]}/${match[2]}/${match[1]}`;
}
