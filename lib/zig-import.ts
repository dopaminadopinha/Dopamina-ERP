import readExcelFile from "read-excel-file/browser";

type Cell = string | number | boolean | Date | null;

export type ZigSummary = {
  product_gross_amount: number;
  service_amount: number;
  gross_amount: number;
  discount_amount: number;
  recharge_balance_amount: number;
  closing_net_amount: number;
  old_open_accounts_paid_amount: number;
  open_accounts_amount: number;
  revenue_amount: number;
};

export type ZigProduct = {
  sku: string;
  name: string;
  status: string;
  product_type: string;
  category: string;
  area: string;
  operation_type: string;
  transaction_type: string;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  discount_amount: number;
  net_amount: number;
  source_row_number: number;
};

export type ZigPaymentMethod = {
  payment_method: string;
  amount: number;
  percentage: number | null;
};

export type ZigImportPayload = {
  periodStart: string;
  periodEnd: string;
  summary: ZigSummary;
  products: ZigProduct[];
  paymentMethods: ZigPaymentMethod[];
  checksum: string;
  fileName: string;
};

const PRODUCT_HEADERS = [
  "SKU", "Nome do produto", "Status do produto", "Tipo do produto",
  "Categoria do produto", "Bar", "Tipo da operação", "Tipo da transação",
  "Quantidade vendida", "Valor unitário", "Subtotal", "Descontos", "Valor total",
];

function normalize(value: Cell) {
  return String(value ?? "").trim();
}

function money(value: Cell) {
  if (typeof value === "number") return value;
  const cleaned = normalize(value)
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/^-(?=\d)/, "-");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) throw new Error(`Valor financeiro inválido: ${value}`);
  return parsed;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function readPeriod(rows: Cell[][]) {
  const title = rows.flat().map(normalize).find((value) => /entre \d{2}\/\d{2}\/\d{4} e \d{2}\/\d{2}\/\d{4}/i.test(value));
  const match = title?.match(/entre (\d{2})\/(\d{2})\/(\d{4}) e (\d{2})\/(\d{2})\/(\d{4})/i);
  if (!match) throw new Error("Não consegui identificar o período no relatório de fechamento.");
  return {
    start: `${match[3]}-${match[2]}-${match[1]}`,
    end: `${match[6]}-${match[5]}-${match[4]}`,
  };
}

function keyValueRows(rows: Cell[][]) {
  return new Map(rows.map((row) => [normalize(row[0]), row[1]]));
}

async function checksum(files: File[]) {
  const parts = await Promise.all(files.map((file) => file.arrayBuffer()));
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  const digest = await crypto.subtle.digest("SHA-256", joined);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function parseZigReports(closingFile: File, productsFile: File): Promise<ZigImportPayload> {
  const [closingSheets, productSheets, fileChecksum] = await Promise.all([
    readExcelFile(closingFile),
    readExcelFile(productsFile),
    checksum([closingFile, productsFile]),
  ]);

  const closing = closingSheets.find((sheet) => sheet.sheet === "Fechamento");
  const payments = closingSheets.find((sheet) => sheet.sheet === "Faturamento Total");
  if (!closing || !payments) {
    throw new Error("O arquivo de fechamento precisa conter as abas Fechamento e Faturamento Total.");
  }

  const period = readPeriod(closing.data as Cell[][]);
  const closingValues = keyValueRows(closing.data as Cell[][]);
  const requiredSummary = [
    "Total de Produtos Vendidos", "Total de Serviço", "Faturamento Bruto",
    "Descontos e Promoções em Produtos", "Faturamento Líquido", "Receita do período",
  ];
  const missingSummary = requiredSummary.filter((name) => !closingValues.has(name));
  if (missingSummary.length) throw new Error(`Campos ausentes no fechamento: ${missingSummary.join(", ")}.`);

  const summary: ZigSummary = {
    product_gross_amount: money(closingValues.get("Total de Produtos Vendidos") ?? 0),
    service_amount: money(closingValues.get("Total de Serviço") ?? 0),
    gross_amount: money(closingValues.get("Faturamento Bruto") ?? 0),
    discount_amount: Math.abs(money(closingValues.get("Descontos e Promoções em Produtos") ?? 0)),
    recharge_balance_amount: money(closingValues.get("Saldo da sobra de recarga") ?? 0),
    closing_net_amount: money(closingValues.get("Faturamento Líquido") ?? 0),
    old_open_accounts_paid_amount: money(closingValues.get("Pagamento de contas em aberto antigas") ?? 0),
    open_accounts_amount: Math.abs(money(closingValues.get("Contas em aberto") ?? 0)),
    revenue_amount: money(closingValues.get("Receita do período") ?? 0),
  };

  const paymentRows = (payments.data as Cell[][]).slice(4).filter((row) => normalize(row[0]) && normalize(row[0]) !== "Receita do período");
  const paymentMethods: ZigPaymentMethod[] = paymentRows.map((row) => ({
    payment_method: normalize(row[0]),
    amount: money(row[1]),
    percentage: row[2] === null || row[2] === undefined ? null : Number(row[2]),
  }));

  const productData = productSheets[0]?.data as Cell[][] | undefined;
  if (!productData?.length) throw new Error("O relatório de produtos está vazio.");
  const headers = productData[0].map(normalize);
  const missingHeaders = PRODUCT_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`Colunas ausentes no relatório de produtos: ${missingHeaders.join(", ")}.`);
  const index = (header: string) => headers.indexOf(header);

  const products: ZigProduct[] = productData.slice(1).map((row, rowIndex) => ({
    sku: normalize(row[index("SKU")]),
    name: normalize(row[index("Nome do produto")]),
    status: normalize(row[index("Status do produto")]),
    product_type: normalize(row[index("Tipo do produto")]),
    category: normalize(row[index("Categoria do produto")]),
    area: normalize(row[index("Bar")]),
    operation_type: normalize(row[index("Tipo da operação")]),
    transaction_type: normalize(row[index("Tipo da transação")]),
    quantity: Number(row[index("Quantidade vendida")]),
    unit_price: money(row[index("Valor unitário")]),
    gross_amount: money(row[index("Subtotal")]),
    discount_amount: Math.abs(money(row[index("Descontos")])),
    net_amount: money(row[index("Valor total")]),
    source_row_number: rowIndex + 2,
  })).filter((product) => product.name);

  if (!products.length) throw new Error("Nenhum produto vendido foi encontrado.");
  const productGross = round(products.reduce((sum, product) => sum + product.gross_amount, 0));
  const discounts = round(products.reduce((sum, product) => sum + product.discount_amount, 0));
  const productNet = round(products.reduce((sum, product) => sum + product.net_amount, 0));

  if (Math.abs(productGross - summary.product_gross_amount) > 0.02 ||
      Math.abs(discounts - summary.discount_amount) > 0.02 ||
      Math.abs(productNet - round(summary.product_gross_amount - summary.discount_amount)) > 0.02) {
    throw new Error("Os totais dos produtos não conferem com o fechamento. Confira se os dois arquivos são do mesmo período.");
  }

  return {
    periodStart: period.start,
    periodEnd: period.end,
    summary,
    products,
    paymentMethods,
    checksum: fileChecksum,
    fileName: `${closingFile.name} + ${productsFile.name}`,
  };
}
