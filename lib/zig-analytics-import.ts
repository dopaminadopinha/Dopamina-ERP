import readExcelFile from "read-excel-file/browser";

type Cell = string | number | boolean | Date | null;

export type ZigProfitabilityRow = {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  loss_quantity: number;
  average_sale_price: number;
  gross_amount: number;
  unit_cost: number;
  total_cost: number;
  profit_amount: number;
  margin_percentage: number;
  cmv_percentage: number;
  cost_missing: boolean;
  source_row_number: number;
};

export type ZigProfitabilityPayload = {
  fileName: string;
  checksum: string;
  periodStart: string;
  periodEnd: string;
  rows: ZigProfitabilityRow[];
  revenue: number;
  knownCost: number;
  missingCostCount: number;
  missingCostRevenue: number;
};

export type ZigAbcRow = {
  sku: string;
  name: string;
  quantity: number;
  average_unit_cost: number;
  total_value: number;
  cumulative_value: number;
  individual_percentage: number;
  cumulative_percentage: number;
  classification: "A" | "B" | "C";
  cost_missing: boolean;
  source_row_number: number;
};

export type ZigAbcPayload = {
  fileName: string;
  checksum: string;
  rows: ZigAbcRow[];
  totalValue: number;
  missingCostCount: number;
};

const CMV_HEADERS = [
  "Nome do Produto", "Código Produto", "Categoria", "Quantidade", "Perdas",
  "Valor Unitário", "Valor Total", "Custo Unitário", "Custo Total",
  "Margem Percentual", "Lucro", "CMV",
];

const ABC_HEADERS = [
  "Produto/Insumo", "Código Produto", "Quantidade", "Custo Médio Unitário",
  "Total", "Total Acumulado", "Porcentagem Individual",
  "Porcentagem Acumulada", "Classificação",
];

function text(value: Cell) {
  return String(value ?? "").trim();
}

function numberValue(value: Cell, percentage = false) {
  if (typeof value === "number") return percentage && value > 1 ? value / 100 : value;
  const original = text(value);
  const isPercentage = original.includes("%");
  const normalized = original
    .replace(/R\$/gi, "")
    .replace(/\u00a0/g, "")
    .replace(/\s*un\s*$/i, "")
    .replace(/%/g, "")
    .trim();
  const cleaned = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const parsed = Number(cleaned || 0);
  if (!Number.isFinite(parsed)) throw new Error(`Valor numérico inválido: ${original}`);
  return percentage && (isPercentage || parsed > 1) ? parsed / 100 : parsed;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

async function fileChecksum(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function periodFromFileName(fileName: string) {
  const match = fileName.match(/(\d{2})_(\d{2})_(\d{4})-(\d{2})_(\d{2})_(\d{4})/);
  if (!match) throw new Error("Não consegui identificar o período no nome do relatório de CMV.");
  return {
    start: `${match[3]}-${match[2]}-${match[1]}`,
    end: `${match[6]}-${match[5]}-${match[4]}`,
  };
}

function tableFromFirstSheet(sheets: Awaited<ReturnType<typeof readExcelFile>>) {
  const rows = sheets[0]?.data as Cell[][] | undefined;
  if (!rows?.length) throw new Error("O relatório está vazio.");
  return rows;
}

function headerIndex(rows: Cell[][], required: string[]) {
  const headers = rows[0].map(text);
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Colunas ausentes: ${missing.join(", ")}.`);
  return (header: string) => headers.indexOf(header);
}

export async function parseZigProfitabilityReport(file: File): Promise<ZigProfitabilityPayload> {
  const [sheets, checksum] = await Promise.all([readExcelFile(file), fileChecksum(file)]);
  const data = tableFromFirstSheet(sheets);
  const index = headerIndex(data, CMV_HEADERS);
  const period = periodFromFileName(file.name);

  const rows = data.slice(1).map((row, rowIndex): ZigProfitabilityRow | null => {
    const name = text(row[index("Nome do Produto")]);
    if (!name) return null;
    const quantity = numberValue(row[index("Quantidade")]);
    const grossAmount = numberValue(row[index("Valor Total")]);
    const unitCost = numberValue(row[index("Custo Unitário")]);
    const totalCost = numberValue(row[index("Custo Total")]);
    const margin = numberValue(row[index("Margem Percentual")], true);
    const profit = numberValue(row[index("Lucro")]);
    const cmv = numberValue(row[index("CMV")], true);
    const placeholderCost = Math.abs(unitCost - 25) < 0.0001
      && Math.abs(totalCost - 25) < 0.01
      && cmv < 0.000001
      && margin > 0.999999
      && Math.abs(profit - grossAmount) < 0.02;
    const costMissing = unitCost <= 0 || totalCost <= 0 || placeholderCost;

    return {
      sku: text(row[index("Código Produto")]),
      name,
      category: text(row[index("Categoria")]) || "Sem categoria",
      quantity,
      loss_quantity: numberValue(row[index("Perdas")]),
      average_sale_price: numberValue(row[index("Valor Unitário")]),
      gross_amount: grossAmount,
      unit_cost: unitCost,
      total_cost: totalCost,
      profit_amount: profit,
      margin_percentage: margin,
      cmv_percentage: cmv,
      cost_missing: costMissing,
      source_row_number: rowIndex + 2,
    };
  }).filter((row): row is ZigProfitabilityRow => row !== null);

  if (!rows.length) throw new Error("Nenhum produto foi encontrado no relatório de CMV.");
  const revenue = round(rows.reduce((sum, row) => sum + row.gross_amount, 0));
  const knownCost = round(rows.reduce((sum, row) => sum + (row.cost_missing ? 0 : row.total_cost), 0));
  const missingRows = rows.filter((row) => row.cost_missing);

  return {
    fileName: file.name,
    checksum,
    periodStart: period.start,
    periodEnd: period.end,
    rows,
    revenue,
    knownCost,
    missingCostCount: missingRows.length,
    missingCostRevenue: round(missingRows.reduce((sum, row) => sum + row.gross_amount, 0)),
  };
}

export async function parseZigAbcReport(file: File): Promise<ZigAbcPayload> {
  const [sheets, checksum] = await Promise.all([readExcelFile(file), fileChecksum(file)]);
  const data = tableFromFirstSheet(sheets);
  const index = headerIndex(data, ABC_HEADERS);

  const rows = data.slice(1).map((row, rowIndex): ZigAbcRow | null => {
    const name = text(row[index("Produto/Insumo")]);
    if (!name) return null;
    const classification = text(row[index("Classificação")]).toUpperCase();
    if (!(["A", "B", "C"] as string[]).includes(classification)) {
      throw new Error(`Classificação ABC inválida na linha ${rowIndex + 2}.`);
    }
    const averageCost = numberValue(row[index("Custo Médio Unitário")]);
    return {
      sku: text(row[index("Código Produto")]),
      name,
      quantity: numberValue(row[index("Quantidade")]),
      average_unit_cost: averageCost,
      total_value: numberValue(row[index("Total")]),
      cumulative_value: numberValue(row[index("Total Acumulado")]),
      individual_percentage: numberValue(row[index("Porcentagem Individual")], true),
      cumulative_percentage: numberValue(row[index("Porcentagem Acumulada")], true),
      classification: classification as "A" | "B" | "C",
      cost_missing: averageCost <= 0,
      source_row_number: rowIndex + 2,
    };
  }).filter((row): row is ZigAbcRow => row !== null);

  if (!rows.length) throw new Error("Nenhum item foi encontrado na Curva ABC.");
  return {
    fileName: file.name,
    checksum,
    rows,
    totalValue: Math.max(...rows.map((row) => row.cumulative_value), 0),
    missingCostCount: rows.filter((row) => row.cost_missing).length,
  };
}
