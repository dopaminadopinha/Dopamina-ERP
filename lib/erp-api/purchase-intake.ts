import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ErpApiError } from "@/lib/erp-api/auth";

export type PurchaseIntakeBody = {
  businessId?: number;
  mode?: "validate" | "commit";
  idempotencyKey?: string;
  supplier?: { id?: number; name?: string; document?: string; contactName?: string; phone?: string; email?: string; notes?: string };
  purchase?: {
    date?: string;
    invoiceNumber?: string;
    paymentMethod?: string;
    paymentStatus?: "pending" | "paid";
    dueDate?: string | null;
    received?: boolean;
    receivedDate?: string;
    declaredTotal?: number | string;
    notes?: string;
  };
  items?: Array<{
    itemId?: number;
    name?: string;
    sku?: string;
    itemType?: "product" | "ingredient" | "consumable";
    category?: string;
    sector?: string;
    quantity?: number | string;
    unit?: string;
    stockUnit?: string;
    unitsPerPackage?: number | string;
    unitCost?: number | string;
    lineTotal?: number | string;
  }>;
  miscItems?: Array<{ description?: string; quantity?: number | string; unit?: string; unitCost?: number | string; lineTotal?: number | string }>;
};

export type PurchaseCommandContext = {
  admin: SupabaseClient;
  businessId: number;
  actorId: string | null;
  source: "assistant_api" | "user_session" | "mcp";
};

type MissingField = { path: string; message: string };
type CatalogRow = { id: number; name: string; item_type: "product" | "ingredient" | "consumable"; consumption_unit: string; purchase_unit: string | null; purchase_pack_quantity: number | null; area_id: number | null; category_id: number | null; is_active: boolean };
type NamedRow = { id: number; name: string };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalizedName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim(); }
function validDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const parsed = new Date(`${value}T12:00:00Z`); return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value; }
function decimal(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function money(value: number) { return Number(value.toFixed(2)); }
function addMissing(target: MissingField[], path: string, message: string) { if (!target.some((field) => field.path === path)) target.push({ path, message }); }

export async function validatePurchaseIntake(admin: SupabaseClient, businessId: number, body: PurchaseIntakeBody) {
  const [suppliersResult, itemsResult, areasResult, categoriesResult] = await Promise.all([
    admin.from("suppliers").select("id,name,document,is_active").eq("business_id", businessId).eq("is_active", true).order("name"),
    admin.from("items").select("id,name,item_type,consumption_unit,purchase_unit,purchase_pack_quantity,area_id,category_id,is_active").eq("business_id", businessId).eq("is_active", true).order("name"),
    admin.from("areas").select("id,name").eq("business_id", businessId).eq("is_active", true).order("name"),
    admin.from("categories").select("id,name,kind").eq("business_id", businessId).eq("is_active", true).order("name"),
  ]);
  const queryError = suppliersResult.error || itemsResult.error || areasResult.error || categoriesResult.error;
  if (queryError) throw queryError;

  const suppliers = (suppliersResult.data ?? []) as Array<NamedRow & { document: string | null; is_active: boolean }>;
  const catalog = (itemsResult.data ?? []) as CatalogRow[];
  const areas = (areasResult.data ?? []) as NamedRow[];
  const categories = (categoriesResult.data ?? []) as Array<NamedRow & { kind: string }>;
  const missing: MissingField[] = [];
  const supplierInput = body.supplier ?? {};
  let supplierId = Number.isInteger(Number(supplierInput.id)) ? Number(supplierInput.id) : null;
  const supplierName = text(supplierInput.name);
  if (supplierId && !suppliers.some((row) => Number(row.id) === supplierId)) addMissing(missing, "supplier.id", "Escolha um fornecedor ativo deste negócio.");
  if (!supplierId && !supplierName) addMissing(missing, "supplier.name", "Qual é o nome do fornecedor?");
  if (!supplierId && supplierName) {
    const exact = suppliers.filter((row) => normalizedName(row.name) === normalizedName(supplierName));
    if (exact.length === 1) supplierId = Number(exact[0].id);
    if (exact.length > 1) addMissing(missing, "supplier.id", "Há fornecedores parecidos. Qual deles deve ser usado?");
  }

  const purchase = body.purchase ?? {};
  const purchaseDate = text(purchase.date);
  const receivedDate = text(purchase.receivedDate);
  if (!validDate(purchaseDate)) addMissing(missing, "purchase.date", "Qual foi a data da compra? Use AAAA-MM-DD.");
  if (!text(purchase.paymentMethod)) addMissing(missing, "purchase.paymentMethod", "Qual foi a forma de pagamento?");
  if (purchase.paymentStatus !== "paid" && purchase.paymentStatus !== "pending") addMissing(missing, "purchase.paymentStatus", "A compra está paga ou pendente?");
  if (purchase.paymentStatus === "pending" && !validDate(text(purchase.dueDate))) addMissing(missing, "purchase.dueDate", "Qual é a data de vencimento da compra pendente?");
  if (validDate(purchaseDate) && validDate(text(purchase.dueDate)) && text(purchase.dueDate) < purchaseDate) addMissing(missing, "purchase.dueDate", "O vencimento não pode ser anterior à compra.");
  if (typeof purchase.received !== "boolean") addMissing(missing, "purchase.received", "Os produtos já foram recebidos fisicamente?");
  if (purchase.received === true && !validDate(receivedDate)) addMissing(missing, "purchase.receivedDate", "Em qual data os produtos foram recebidos?");
  if (validDate(purchaseDate) && validDate(receivedDate) && receivedDate < purchaseDate) addMissing(missing, "purchase.receivedDate", "O recebimento não pode ser anterior à compra.");
  const declaredTotal = decimal(purchase.declaredTotal);
  if (declaredTotal === null || declaredTotal < 0) addMissing(missing, "purchase.declaredTotal", "Qual é o valor total indicado na nota ou comprovante?");

  const sourceItems = Array.isArray(body.items) ? body.items : [];
  const sourceMiscItems = Array.isArray(body.miscItems) ? body.miscItems : [];
  if (!sourceItems.length && !sourceMiscItems.length) addMissing(missing, "items", "Quais produtos ou gastos aparecem na compra?");

  const normalizedItems = sourceItems.map((input, index) => {
    let itemId = Number.isInteger(Number(input.itemId)) ? Number(input.itemId) : null;
    const name = text(input.name);
    let existing = itemId ? catalog.find((row) => Number(row.id) === itemId) ?? null : null;
    if (itemId && !existing) addMissing(missing, `items.${index}.itemId`, `O item ${itemId} não pertence a este negócio.`);
    if (!itemId && !name) addMissing(missing, `items.${index}.name`, `Qual é o nome do produto da linha ${index + 1}?`);
    if (!itemId && name) {
      const exact = catalog.filter((row) => normalizedName(row.name) === normalizedName(name) && (!input.itemType || row.item_type === input.itemType));
      if (exact.length === 1) { existing = exact[0]; itemId = Number(existing.id); }
      if (exact.length > 1) addMissing(missing, `items.${index}.itemId`, `Há mais de um cadastro para “${name}”. Escolha o item correto.`);
    }
    const itemType = existing?.item_type ?? input.itemType ?? null;
    const purchaseUnit = text(input.unit) || existing?.purchase_unit || existing?.consumption_unit || "";
    const stockUnit = text(input.stockUnit) || existing?.consumption_unit || "";
    const purchaseQuantity = decimal(input.quantity);
    let unitsPerPackage = decimal(input.unitsPerPackage);
    if (unitsPerPackage === null && existing && normalizedName(purchaseUnit) === normalizedName(existing.purchase_unit || "") && Number(existing.purchase_pack_quantity) > 0) unitsPerPackage = Number(existing.purchase_pack_quantity);
    if (unitsPerPackage === null && existing && normalizedName(purchaseUnit) === normalizedName(existing.consumption_unit)) unitsPerPackage = 1;
    let purchaseUnitCost = decimal(input.unitCost);
    const lineTotal = decimal(input.lineTotal);
    if (purchaseUnitCost === null && lineTotal !== null && purchaseQuantity !== null && purchaseQuantity > 0) purchaseUnitCost = lineTotal / purchaseQuantity;
    if (purchaseQuantity === null || purchaseQuantity <= 0) addMissing(missing, `items.${index}.quantity`, `Qual é a quantidade comprada de “${name || `item ${index + 1}`}”?`);
    if (!purchaseUnit) addMissing(missing, `items.${index}.unit`, `Qual é a unidade de compra de “${name || `item ${index + 1}`}” (un, kg, L, pacote...)?`);
    if (!stockUnit) addMissing(missing, `items.${index}.stockUnit`, `Em qual unidade “${name || `item ${index + 1}`}” será controlado no estoque?`);
    if (unitsPerPackage === null || unitsPerPackage <= 0) addMissing(missing, `items.${index}.unitsPerPackage`, `Quantas unidades de estoque existem em cada ${purchaseUnit || "embalagem"} de “${name || `item ${index + 1}`}”?`);
    if (purchaseUnitCost === null || purchaseUnitCost < 0) addMissing(missing, `items.${index}.unitCost`, `Qual é o preço por ${purchaseUnit || "unidade de compra"} de “${name || `item ${index + 1}`}”?`);
    if (!existing && !itemType) addMissing(missing, `items.${index}.itemType`, `“${name}” é produto vendido, ingrediente ou consumível?`);

    let categoryId = existing?.category_id ?? null;
    const categoryName = text(input.category);
    if (!existing && !categoryName) addMissing(missing, `items.${index}.category`, `Qual é a categoria de “${name}”?`);
    if (!existing && categoryName && itemType) categoryId = categories.find((row) => row.kind === itemType && normalizedName(row.name) === normalizedName(categoryName))?.id ?? null;

    let areaId = existing?.area_id ?? null;
    const sectorName = text(input.sector);
    if (!existing && itemType === "product" && !sectorName) addMissing(missing, `items.${index}.sector`, `A qual setor pertence “${name}”?`);
    if (!existing && sectorName) {
      areaId = areas.find((row) => normalizedName(row.name) === normalizedName(sectorName))?.id ?? null;
      if (!areaId) addMissing(missing, `items.${index}.sector`, `O setor “${sectorName}” não existe no ERP. Escolha um setor cadastrado.`);
    }
    return {
      item_id: itemId,
      name: existing?.name ?? name,
      sku: text(input.sku) || null,
      item_type: itemType,
      category_id: categoryId,
      category_name: categoryName || null,
      area_id: areaId,
      purchase_unit: purchaseUnit,
      purchase_quantity: purchaseQuantity === null ? null : Number(purchaseQuantity.toFixed(4)),
      purchase_pack_quantity: unitsPerPackage === null ? null : Number(unitsPerPackage.toFixed(4)),
      quantity: purchaseQuantity === null || unitsPerPackage === null ? null : Number((purchaseQuantity * unitsPerPackage).toFixed(4)),
      unit: stockUnit,
      unit_cost: purchaseUnitCost === null || unitsPerPackage === null ? null : Number((purchaseUnitCost / unitsPerPackage).toFixed(4)),
      line_total: purchaseQuantity !== null && purchaseUnitCost !== null ? money(purchaseQuantity * purchaseUnitCost) : null,
      matched_existing: Boolean(existing),
    };
  });

  const normalizedMiscItems = sourceMiscItems.map((input, index) => {
    const description = text(input.description);
    const quantity = decimal(input.quantity) ?? 1;
    let unitCost = decimal(input.unitCost);
    const lineTotal = decimal(input.lineTotal);
    if (unitCost === null && lineTotal !== null && quantity > 0) unitCost = lineTotal / quantity;
    if (!description) addMissing(missing, `miscItems.${index}.description`, `Qual é a descrição do gasto adicional da linha ${index + 1}?`);
    if (quantity <= 0) addMissing(missing, `miscItems.${index}.quantity`, `Informe uma quantidade válida para “${description || `gasto ${index + 1}`}”.`);
    if (unitCost === null || unitCost < 0) addMissing(missing, `miscItems.${index}.unitCost`, `Qual é o valor de “${description || `gasto ${index + 1}`}”?`);
    return { description, quantity: Number(quantity.toFixed(4)), unit: text(input.unit) || null, unit_cost: unitCost === null ? null : Number(unitCost.toFixed(4)), line_total: unitCost === null ? null : money(quantity * unitCost) };
  });

  const computedTotal = money([...normalizedItems, ...normalizedMiscItems].reduce((sum, row) => sum + Number(row.line_total ?? 0), 0));
  if (declaredTotal !== null && Math.abs(computedTotal - declaredTotal) > 0.02) addMissing(missing, "purchase.totalMismatch", `A soma dos itens (${computedTotal.toFixed(2)}) não confere com o total informado (${declaredTotal.toFixed(2)}). Revise a nota.`);
  const duplicateItemIds = normalizedItems.filter((row) => row.item_id).map((row) => row.item_id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateItemIds.length) addMissing(missing, "items.duplicates", "O mesmo produto aparece mais de uma vez. Consolide as quantidades ou confirme linhas distintas.");

  const questions = missing.map((field) => field.message);
  return {
    status: missing.length ? "needs_information" as const : "ready" as const,
    readyToCommit: missing.length === 0,
    missingFields: missing,
    questions,
    normalized: {
      supplier: { supplier_id: supplierId, name: supplierName || suppliers.find((row) => Number(row.id) === supplierId)?.name || "", document: text(supplierInput.document) || null, contact_name: text(supplierInput.contactName) || null, phone: text(supplierInput.phone) || null, email: text(supplierInput.email) || null, notes: text(supplierInput.notes) || null },
      purchase: { purchase_date: purchaseDate, invoice_number: text(purchase.invoiceNumber) || null, payment_method: text(purchase.paymentMethod), payment_status: purchase.paymentStatus ?? null, due_date: text(purchase.dueDate) || null, received: purchase.received ?? null, received_at: purchase.received === true && receivedDate ? `${receivedDate}T00:00:00-03:00` : null, declared_total: declaredTotal === null ? null : money(declaredTotal), notes: text(purchase.notes) || null },
      items: normalizedItems,
      misc_items: normalizedMiscItems,
      computed_total: computedTotal,
    },
    context: {
      suppliers: suppliers.map((row) => ({ id: Number(row.id), name: row.name, document: row.document })),
      areas: areas.map((row) => ({ id: Number(row.id), name: row.name })),
      categories: categories.map((row) => ({ id: Number(row.id), name: row.name, itemType: row.kind })),
    },
  };
}

export async function commitPurchaseIntake(context: PurchaseCommandContext, body: PurchaseIntakeBody) {
  const validation = await validatePurchaseIntake(context.admin, context.businessId, body);
  if (!validation.readyToCommit) {
    return {
      ...validation,
      committed: false as const,
      error: "A compra não foi gravada porque ainda existem informações pendentes.",
    };
  }

  const idempotencyKey = body.idempotencyKey?.trim() ?? "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new ErpApiError("Informe uma chave idempotencyKey estável para esta nota.", 400);

  const { data, error } = await context.admin.rpc("ingest_complete_purchase", {
    p_business_id: context.businessId,
    p_idempotency_key: idempotencyKey,
    p_supplier: validation.normalized.supplier,
    p_purchase: validation.normalized.purchase,
    p_items: validation.normalized.items,
    p_misc_items: validation.normalized.misc_items,
    p_actor_id: context.actorId,
    p_source: context.source,
  });
  if (error) throw new ErpApiError(error.message, 409);
  return {
    status: "committed" as const,
    committed: true as const,
    businessId: context.businessId,
    result: data,
    message: "Compra, fornecedor, itens, despesa e estoque foram processados em uma única transação.",
  };
}
