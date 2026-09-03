"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, BarChart3, Boxes, CalendarRange,
  CheckCircle2, ChefHat, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Clock3, FileBarChart2, FileSpreadsheet,
  LayoutDashboard, LogOut, Menu, MoreHorizontal, PackageSearch, Pencil,
  Plus, ReceiptText, RefreshCw, Search, Settings, ShoppingBasket, ShoppingCart, Sparkles, Trash2, TrendingUp, TriangleAlert,
  UsersRound, WalletCards, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useEscapeToClose } from "@/lib/use-escape-close";
import { PurchasesPage } from "@/components/purchases-page";
import { PersonnelPage } from "@/components/personnel-page";
import { StructuralCostsSection } from "@/components/structural-costs-section";
import { parseZigReports, type ZigImportPayload } from "@/lib/zig-import";
import {
  parseZigAbcReport,
  parseZigProfitabilityReport,
  type ZigAbcPayload,
  type ZigProfitabilityPayload,
} from "@/lib/zig-analytics-import";

type Section = "visao-geral" | "dre" | "insights" | "vendas" | "cmv" | "despesas" | "setores" | "produtos" | "estoque" | "compras" | "pessoal" |
  "planejamento" | "cadastros" | "importacoes" | "configuracoes";
type Membership = { business_id: string; role: "owner" | "manager"; status: "active" | "pending" | "suspended"; businesses: { name: string } | { name: string }[] | null };
type Profile = { full_name: string; email: string };
type Sale = { id: string; import_id: string | null; period_start: string | null; period_end: string | null; business_date: string; gross_amount: number; discount_amount: number; product_gross_amount: number; service_amount: number; revenue_amount: number | null; closing_net_amount: number | null; open_accounts_amount: number; recharge_balance_amount: number; sales_imports: { file_name: string; row_count: number; created_at: string } | { file_name: string; row_count: number; created_at: string }[] | null };
type SaleItem = { id: string; sale_id: string; quantity: number; gross_amount: number; discount_amount: number; transaction_type: string | null; items: { name: string; sku: string | null; categories: { name: string } | { name: string }[] | null } | { name: string; sku: string | null; categories: { name: string } | { name: string }[] | null }[]; areas: { name: string } | { name: string }[] | null };
type PaymentMethod = { id: string; import_id: string; payment_method: string; amount: number; percentage: number | null };
type Expense = { id: string; purchase_id: string | null; source_type: string | null; source_id: string | null; recurrence_end: string | null; area_id: string | null; category: string; description: string; expense_date: string; due_date: string | null; paid_at: string | null; amount: number; payment_method: string | null; status: "draft" | "pending" | "completed" | "cancelled"; is_recurring: boolean; cost_behavior: "fixed" | "variable"; areas: { name: string; is_operational: boolean } | { name: string; is_operational: boolean }[] | null };
type ImportRow = { id: string; file_name: string; period_start: string | null; period_end: string | null; row_count: number; status: string; created_at: string };
type Area = { id: string; name: string; is_operational: boolean };
type CatalogItem = { id: string; area_id: string | null; name: string; sku: string | null; item_type: "ingredient" | "product" | "consumable"; purchase_unit: string | null; purchase_pack_quantity: number | null; consumption_unit: string; costing_method: "simple" | "recipe"; sale_price: number | null; latest_unit_cost: number | null; average_unit_cost: number | null; minimum_stock: number; is_active: boolean; zig_product_id: string | null; categories: { name: string } | { name: string }[] | null; areas: { id: string; name: string; is_operational: boolean } | { id: string; name: string; is_operational: boolean }[] | null };
type CostHistory = { id: string; item_id: string; unit_cost: number; effective_from: string; source: "manual" | "recipe" | "import" | "purchase"; created_at: string };
type Recipe = { id: string; product_id: string; yield_quantity: number; notes: string | null; effective_from: string; created_at: string };
type RecipeItem = { id: string; recipe_id: string; ingredient_id: string; quantity: number; waste_percentage: number };
type Forecast = { id: string; area_id: string | null; forecast_type: "revenue" | "expense"; period_start: string; period_end: string; amount: number; notes: string | null; areas: { name: string } | { name: string }[] | null };
type ProfitabilityImport = { id: string; sale_id: string; period_start: string; period_end: string; source_revenue: number; known_cost_total: number; row_count: number; missing_cost_count: number; created_at: string };
type ProfitabilityItem = { id: string; import_id: string; source_product_name: string; source_sku: string | null; source_category: string | null; quantity: number; gross_amount: number; unit_cost: number | null; total_cost: number | null; profit_amount: number; margin_percentage: number; cmv_percentage: number; cost_status: "known" | "missing" };
type AbcImport = { id: string; file_name: string; total_value: number; row_count: number; missing_cost_count: number; created_at: string };
type AbcItem = { id: string; import_id: string; source_product_name: string; source_sku: string | null; quantity: number; average_unit_cost: number | null; total_value: number; individual_percentage: number; cumulative_percentage: number; classification: "A" | "B" | "C" };
type ZigDashboard = {
  period_start: string;
  period_end: string;
  summary: { gross_cents: number; discount_cents: number; net_cents: number; revenue_cents: number; quantity: number; transaction_count: number; refunded_item_count: number };
  products: { item_id: string; name: string; sku: string | null; category: string; area: string; quantity: number; gross_cents: number; discount_cents: number; net_cents: number; costed_quantity?: number; missing_cost_quantity?: number; known_net_cents?: number; total_cost?: number | null; unit_cost?: number | null }[];
  payments: { payment_name: string; value_cents: number }[];
  daily: { operational_date: string; net_cents: number; transaction_count: number }[];
  sync: { endpoint: string; status: string; last_success_at: string | null; last_successful_date: string | null; error_message: string | null }[];
};
type SectorProduct = { sector: string | null; source_area: string; item_id: string | null; name: string; sku: string | null; category: string | null; quantity: number; revenue_cents: number; costed_quantity: number; missing_cost_quantity: number; known_revenue_cents: number; known_cmv: number | null };
type SectorProfitability = { period_start: string; period_end: string; products: SectorProduct[] };
type ProductCostStatus = "known" | "partial" | "missing";
type ProductPerformance = "star" | "attention" | "opportunity" | "low" | "unknown";
type ProductSort = "profit_desc" | "quantity_desc" | "revenue_desc" | "margin_desc" | "margin_asc" | "cmv_desc" | "high_sales_low_profit" | "low_sales_high_margin";
type ProductProfitabilityRow = { key: string; itemId: string | null; name: string; sku: string | null; category: string; sector: string; quantity: number; revenue: number; share: number; costedQuantity: number; missingQuantity: number; costStatus: ProductCostStatus; unitCost: number | null; knownCmv: number; cmv: number | null; profit: number | null; unitProfit: number | null; margin: number | null; averagePrice: number | null; costChange: number | null; performance: ProductPerformance };
type StockStatus = "normal" | "low" | "below_minimum" | "out" | "divergence" | "insufficient_data";
type StockItem = { id: string; name: string; sku: string | null; category: string; sector: string; item_type: "product" | "ingredient" | "consumable"; unit: string; minimum_stock: number; theoretical_quantity: number; physical_quantity: number | null; last_variance_quantity: number | null; last_counted_at: string | null; unit_cost: number | null; consumed_period: number; has_baseline: boolean; expected_quantity: number | null; reference_days: number | null; suggested_purchase: number | null; status: StockStatus; stock_value: number | null; variance_value: number | null };
type StockMovement = { movement_key: string; occurred_at: string; item_id: string; name: string; sector: string; movement_type: string; quantity: number; unit: string; unit_cost: number | null; origin: string; balance_before: number | null; balance_after: number | null };
type StockInventory = { id: string; counted_at: string; notes: string | null; item_count: number; variance_value: number; divergent_items: number };
type StockDashboard = { period_start: string; period_end: string; summary: { stock_value: number; below_minimum: number; out_of_stock: number; divergent_items: number; variance_value: number; loss_value: number; replenishment_items: number; last_inventory_at: string | null; insufficient_items: number }; items: StockItem[]; movements: StockMovement[]; inventories: StockInventory[]; missing_recipes: { item_id: string; name: string; quantity: number }[] };
type DateRange = { start: string; end: string };
type DataState = { sales: Sale[]; saleItems: SaleItem[]; payments: PaymentMethod[]; expenses: Expense[]; forecasts: Forecast[]; catalogItems: CatalogItem[]; ingredients: CatalogItem[]; costHistory: CostHistory[]; recipes: Recipe[]; recipeItems: RecipeItem[]; imports: ImportRow[]; profitabilityImports: ProfitabilityImport[]; profitabilityItems: ProfitabilityItem[]; abcImports: AbcImport[]; abcItems: AbcItem[]; zig: ZigDashboard; previousZig: ZigDashboard; sectorProfitability: SectorProfitability; previousSectorProfitability: SectorProfitability; stock: StockDashboard; products: number; suppliers: number; areas: Area[] };

const EMPTY_ZIG: ZigDashboard = { period_start: "", period_end: "", summary: { gross_cents: 0, discount_cents: 0, net_cents: 0, revenue_cents: 0, quantity: 0, transaction_count: 0, refunded_item_count: 0 }, products: [], payments: [], daily: [], sync: [] };
const EMPTY_SECTOR_PROFITABILITY: SectorProfitability = { period_start: "", period_end: "", products: [] };
const EMPTY_STOCK: StockDashboard = { period_start: "", period_end: "", summary: { stock_value: 0, below_minimum: 0, out_of_stock: 0, divergent_items: 0, variance_value: 0, loss_value: 0, replenishment_items: 0, last_inventory_at: null, insufficient_items: 0 }, items: [], movements: [], inventories: [], missing_recipes: [] };
const EMPTY_DATA: DataState = { sales: [], saleItems: [], payments: [], expenses: [], forecasts: [], catalogItems: [], ingredients: [], costHistory: [], recipes: [], recipeItems: [], imports: [], profitabilityImports: [], profitabilityItems: [], abcImports: [], abcItems: [], zig: EMPTY_ZIG, previousZig: EMPTY_ZIG, sectorProfitability: EMPTY_SECTOR_PROFITABILITY, previousSectorProfitability: EMPTY_SECTOR_PROFITABILITY, stock: EMPTY_STOCK, products: 0, suppliers: 0, areas: [] };
const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "visao-geral", label: "Visão geral", icon: <LayoutDashboard size={19} /> },
  { id: "insights", label: "Insights", icon: <Sparkles size={19} /> },
  { id: "dre", label: "DRE", icon: <FileBarChart2 size={19} /> },
  { id: "vendas", label: "Vendas", icon: <TrendingUp size={19} /> },
  { id: "cmv", label: "CMV", icon: <BarChart3 size={19} /> },
  { id: "despesas", label: "Despesas", icon: <WalletCards size={19} /> },
  { id: "setores", label: "Setores", icon: <CircleDollarSign size={19} /> },
  { id: "produtos", label: "Produtos", icon: <PackageSearch size={19} /> },
  { id: "estoque", label: "Estoque", icon: <Boxes size={19} /> },
  { id: "compras", label: "Compras", icon: <ShoppingBasket size={19} /> },
  { id: "pessoal", label: "Pessoal", icon: <UsersRound size={19} /> },
  { id: "planejamento", label: "Planejamento", icon: <CalendarRange size={19} /> },
  { id: "cadastros", label: "Cadastros", icon: <ClipboardList size={19} /> },
  { id: "configuracoes", label: "Configurações", icon: <Settings size={19} /> },
];

function nested<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function dateLabel(value: string | null) { return value ? DATE.format(new Date(`${value}T00:00:00Z`)) : "—"; }
function isoInSaoPaulo(date = new Date()) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const value = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${value.year}-${value.month}-${value.day}`; }
function shiftDate(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function selectedRange(period: string, customStart: string, customEnd: string): DateRange { const today = isoInSaoPaulo(); const [year, month] = today.split("-").map(Number); if (period === "today") return { start: today, end: today }; if (period === "yesterday") { const yesterday = shiftDate(today, -1); return { start: yesterday, end: yesterday }; } if (period === "this_week") { const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); return { start: shiftDate(today, -(weekday === 0 ? 6 : weekday - 1)), end: today }; } if (period === "last_month") { const start = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10); const end = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10); return { start, end }; } if (period === "custom") return { start: customStart || today, end: customEnd || customStart || today }; return { start: `${year}-${String(month).padStart(2, "0")}-01`, end: today }; }
function rangeDays(range: DateRange) { return Math.max(1, Math.round((new Date(`${range.end}T12:00:00Z`).getTime() - new Date(`${range.start}T12:00:00Z`).getTime()) / 86_400_000) + 1); }
function previousEquivalentRange(range: DateRange): DateRange { const end = shiftDate(range.start, -1); return { start: shiftDate(end, -(rangeDays(range) - 1)), end }; }

type AutomaticCmvRow = { id: string; itemId: string; name: string; sku: string | null; category: string; quantity: number; revenue: number; knownRevenue: number; unitCost: number | null; totalCost: number | null; margin: number | null; cmv: number | null; costStatus: "known" | "partial" | "missing" };
function automaticCmvRows(zig: ZigDashboard, catalogItems: CatalogItem[]): AutomaticCmvRow[] {
  const costs = new Map(catalogItems.map((item) => [String(item.id), item]));
  return zig.products.map((product) => {
    const item = costs.get(String(product.item_id));
    const quantity = Number(product.quantity);
    const revenue = Number(product.net_cents) / 100;
    const hasHistoricalCost = product.costed_quantity !== undefined;
    const fallbackCost = Number(item?.average_unit_cost ?? item?.latest_unit_cost ?? 0);
    const costedQuantity = hasHistoricalCost ? Number(product.costed_quantity ?? 0) : (fallbackCost > 0 ? quantity : 0);
    const missingQuantity = hasHistoricalCost ? Number(product.missing_cost_quantity ?? 0) : (fallbackCost > 0 ? 0 : quantity);
    const unitCostValue = hasHistoricalCost ? Number(product.unit_cost ?? 0) : fallbackCost;
    const unitCost = unitCostValue >= 0 && costedQuantity > 0 ? unitCostValue : null;
    const knownRevenue = hasHistoricalCost ? Number(product.known_net_cents ?? 0) / 100 : (unitCost === null ? 0 : revenue);
    const totalCostValue = hasHistoricalCost ? Number(product.total_cost ?? 0) : (unitCost === null ? 0 : unitCost * quantity);
    const totalCost = costedQuantity > 0 ? totalCostValue : null;
    const costStatus = missingQuantity <= 0 && costedQuantity > 0 ? "known" : costedQuantity > 0 ? "partial" : "missing";
    return { id: `api-${product.item_id}`, itemId: String(product.item_id), name: product.name, sku: product.sku, category: product.category, quantity, revenue, knownRevenue, unitCost, totalCost, margin: totalCost === null || knownRevenue <= 0 ? null : (knownRevenue - totalCost) / knownRevenue, cmv: totalCost === null || knownRevenue <= 0 ? null : totalCost / knownRevenue, costStatus };
  });
}

async function fetchData(businessId: string, range: DateRange): Promise<DataState> {
  const previousRange = previousEquivalentRange(range);
  const [sales, expenses, products, suppliers, areas, forecasts, imports, profitabilityImports, abcImports, zig, previousZig, sectorProfitability, previousSectorProfitability, costHistory, recipes] = await Promise.all([
    supabase.from("sales").select("id,import_id,period_start,period_end,business_date,gross_amount,discount_amount,product_gross_amount,service_amount,revenue_amount,closing_net_amount,open_accounts_amount,recharge_balance_amount,sales_imports(file_name,row_count,created_at)").eq("business_id", businessId).order("business_date", { ascending: false }),
    supabase.from("expenses").select("id,purchase_id,source_type,source_id,recurrence_end,area_id,category,description,expense_date,due_date,paid_at,amount,payment_method,status,is_recurring,cost_behavior,areas(name,is_operational)").eq("business_id", businessId).neq("status", "cancelled").order("expense_date", { ascending: false }),
    supabase.from("items").select("id,area_id,name,sku,item_type,purchase_unit,purchase_pack_quantity,consumption_unit,costing_method,sale_price,latest_unit_cost,average_unit_cost,minimum_stock,is_active,zig_product_id,categories(name),areas(id,name,is_operational)").eq("business_id", businessId).order("name"),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("areas").select("id,name,is_operational").eq("business_id", businessId).eq("is_active", true).order("sort_order"),
    supabase.from("forecasts").select("id,area_id,forecast_type,period_start,period_end,amount,notes,areas(name)").eq("business_id", businessId).order("period_start", { ascending: false }),
    supabase.from("sales_imports").select("id,file_name,period_start,period_end,row_count,status,created_at").eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase.from("zig_profitability_imports").select("id,sale_id,period_start,period_end,source_revenue,known_cost_total,row_count,missing_cost_count,created_at").eq("business_id", businessId).order("period_end", { ascending: false }),
    supabase.from("zig_abc_imports").select("id,file_name,total_value,row_count,missing_cost_count,created_at").eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase.rpc("get_zig_sales_dashboard", { p_business_id: Number(businessId), p_period_start: range.start, p_period_end: range.end }),
    supabase.rpc("get_zig_sales_dashboard", { p_business_id: Number(businessId), p_period_start: previousRange.start, p_period_end: previousRange.end }),
    supabase.rpc("get_sector_profitability", { p_business_id: Number(businessId), p_period_start: range.start, p_period_end: range.end }),
    supabase.rpc("get_sector_profitability", { p_business_id: Number(businessId), p_period_start: previousRange.start, p_period_end: previousRange.end }),
    supabase.from("item_cost_history").select("id,item_id,unit_cost,effective_from,source,created_at").eq("business_id", businessId).order("effective_from", { ascending: false }),
    supabase.from("recipes").select("id,product_id,yield_quantity,notes,effective_from,created_at").eq("business_id", businessId).order("effective_from", { ascending: false }),
  ]);
  const firstError = [sales.error, expenses.error, products.error, suppliers.error, areas.error, forecasts.error, imports.error, profitabilityImports.error, abcImports.error, zig.error, previousZig.error, sectorProfitability.error, previousSectorProfitability.error, costHistory.error, recipes.error].find(Boolean);
  if (firstError) throw firstError;
  const saleIds = (sales.data ?? []).map((sale) => sale.id);
  const importIds = (sales.data ?? []).map((sale) => sale.import_id).filter(Boolean) as string[];
  const profitabilityIds = (profitabilityImports.data ?? []).map((row) => row.id);
  const latestAbcId = abcImports.data?.[0]?.id;
  const recipeIds = (recipes.data ?? []).map((row) => row.id);
  const [items, payments, profitabilityItems, abcItems, recipeItems] = await Promise.all([
    saleIds.length ? supabase.from("sale_items").select("id,sale_id,quantity,gross_amount,discount_amount,transaction_type,items(name,sku,categories(name)),areas(name)").in("sale_id", saleIds) : Promise.resolve({ data: [], error: null }),
    importIds.length ? supabase.from("sales_payment_methods").select("id,import_id,payment_method,amount,percentage").in("import_id", importIds) : Promise.resolve({ data: [], error: null }),
    profitabilityIds.length ? supabase.from("zig_profitability_items").select("id,import_id,source_product_name,source_sku,source_category,quantity,gross_amount,unit_cost,total_cost,profit_amount,margin_percentage,cmv_percentage,cost_status").in("import_id", profitabilityIds) : Promise.resolve({ data: [], error: null }),
    latestAbcId ? supabase.from("zig_abc_items").select("id,import_id,source_product_name,source_sku,quantity,average_unit_cost,total_value,individual_percentage,cumulative_percentage,classification").eq("import_id", latestAbcId).order("cumulative_percentage") : Promise.resolve({ data: [], error: null }),
    recipeIds.length ? supabase.from("recipe_items").select("id,recipe_id,ingredient_id,quantity,waste_percentage").in("recipe_id", recipeIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const detailError = [items.error, payments.error, profitabilityItems.error, abcItems.error, recipeItems.error].find(Boolean);
  if (detailError) throw detailError;
  const allItems = (products.data ?? []) as unknown as CatalogItem[];
  const catalogItems = allItems.filter((item) => item.item_type === "product");
  const ingredients = allItems.filter((item) => item.item_type !== "product");
  return { sales: (sales.data ?? []) as unknown as Sale[], saleItems: (items.data ?? []) as unknown as SaleItem[], payments: (payments.data ?? []) as PaymentMethod[], expenses: (expenses.data ?? []) as Expense[], forecasts: (forecasts.data ?? []) as unknown as Forecast[], catalogItems, ingredients, costHistory: (costHistory.data ?? []) as CostHistory[], recipes: (recipes.data ?? []) as Recipe[], recipeItems: (recipeItems.data ?? []) as RecipeItem[], imports: (imports.data ?? []) as ImportRow[], profitabilityImports: (profitabilityImports.data ?? []) as ProfitabilityImport[], profitabilityItems: (profitabilityItems.data ?? []) as ProfitabilityItem[], abcImports: (abcImports.data ?? []) as AbcImport[], abcItems: (abcItems.data ?? []) as AbcItem[], zig: (zig.data as ZigDashboard | null) ?? EMPTY_ZIG, previousZig: (previousZig.data as ZigDashboard | null) ?? EMPTY_ZIG, sectorProfitability: (sectorProfitability.data as SectorProfitability | null) ?? EMPTY_SECTOR_PROFITABILITY, previousSectorProfitability: (previousSectorProfitability.data as SectorProfitability | null) ?? EMPTY_SECTOR_PROFITABILITY, stock: EMPTY_STOCK, products: catalogItems.length, suppliers: suppliers.count ?? 0, areas: (areas.data ?? []) as Area[] };
}

export function DashboardShell() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("visao-geral");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(() => typeof window !== "undefined" && localStorage.getItem("dopamina-sidebar-compact") === "1");
  useEffect(() => { localStorage.setItem("dopamina-sidebar-compact", sidebarCompact ? "1" : "0"); }, [sidebarCompact]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [zigSyncing, setZigSyncing] = useState(false);
  const [zigSyncMessage, setZigSyncMessage] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<DataState>(EMPTY_DATA);
  const [fatalError, setFatalError] = useState("");
  const [period, setPeriod] = useState("this_month");
  const [customStart, setCustomStart] = useState(isoInSaoPaulo());
  const [customEnd, setCustomEnd] = useState(isoInSaoPaulo());
  const range = selectedRange(period, customStart, customEnd);

  async function refresh(businessId = membership?.business_id, requestedRange = range) {
    if (!businessId) return;
    setRefreshing(true);
    try { setData(await fetchData(businessId, requestedRange)); setFatalError(""); } catch { setFatalError("Não foi possível carregar os dados do painel."); }
    finally { setRefreshing(false); }
  }

  async function synchronizeZig() {
    setZigSyncing(true);
    setZigSyncMessage("");
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      setZigSyncMessage("Sua sessão expirou. Entre novamente.");
      setZigSyncing(false);
      return;
    }
    try {
      const response = await fetch("/api/zig/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ startDate: range.start, endDate: range.end }),
      });
      const result = await response.json() as { error?: string; status?: string; results?: { status: string; error?: string }[] };
      const detailedError = result.error ?? result.results?.find((row) => row.status === "failed")?.error;
      if (!response.ok) throw new Error(detailedError ?? "A sincronização falhou sem informar o motivo.");
      setZigSyncMessage(result.status === "partial"
        ? `Sincronização parcial${detailedError ? `: ${detailedError}` : ". Consulte o histórico de integrações."}`
        : "Sincronização concluída com dados reais da Zig.");
      await refresh(membership?.business_id, range);
    } catch (error) {
      setZigSyncMessage(error instanceof Error ? error.message : "Não foi possível sincronizar a Zig.");
    } finally {
      setZigSyncing(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return router.replace("/");
      const [profileResult, membershipResult] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("user_id", user.id).maybeSingle(),
        supabase.from("business_members").select("business_id,role,status,businesses(name)").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!active) return;
      if (profileResult.error || membershipResult.error) { setFatalError("Não foi possível carregar os dados do seu acesso."); setLoading(false); return; }
      const current = membershipResult.data as Membership | null;
      setProfile((profileResult.data as Profile | null) ?? { full_name: user.email?.split("@")[0] ?? "Usuário", email: user.email ?? "" });
      setMembership(current); setUserId(user.id);
      if (current?.status === "active") {
        try { setData(await fetchData(current.business_id, selectedRange("this_month", isoInSaoPaulo(), isoInSaoPaulo()))); } catch { setFatalError("Não foi possível carregar os dados do painel."); }
      }
      setLoading(false);
    }
    load();
    const { data: auth } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") router.replace("/"); });
    return () => { active = false; auth.subscription.unsubscribe(); };
  }, [router]);

  const activeNav = NAV_ITEMS.find((item) => item.id === section) ?? NAV_ITEMS[0];
  const visibleSales = data.sales.filter((sale) => (sale.period_end ?? sale.business_date) >= range.start && (sale.period_start ?? sale.business_date) <= range.end);
  const selectedSaleIds = new Set(visibleSales.map((sale) => String(sale.id)));
  const visibleItems = data.saleItems.filter((item) => selectedSaleIds.has(String(item.sale_id)));
  const visibleExpenses = data.expenses.filter((expense) => expense.is_recurring ? expense.expense_date <= range.end && (!expense.recurrence_end || expense.recurrence_end >= range.start) : expense.expense_date >= range.start && expense.expense_date <= range.end);
  const visibleProfitabilityImports = data.profitabilityImports.filter((row) => row.period_end >= range.start && row.period_start <= range.end);
  const selectedProfitabilityIds = new Set(visibleProfitabilityImports.map((row) => String(row.id)));
  const visibleProfitabilityItems = data.profitabilityItems.filter((row) => selectedProfitabilityIds.has(String(row.import_id)));

  async function signOut() { await supabase.auth.signOut(); router.replace("/"); }
  if (loading) return <main className="app-loading"><Image src="/dopamina-logo.png" alt="Dopamina" width={88} height={82} unoptimized /><span>Organizando seus dados...</span></main>;
  if (fatalError) return <main className="access-state"><Image src="/dopamina-logo.png" alt="Dopamina" width={108} height={100} unoptimized /><h1>Algo não saiu como esperado</h1><p>{fatalError}</p><button onClick={() => location.reload()}>Tentar novamente</button></main>;
  if (!membership || membership.status !== "active") return <main className="access-state"><Image src="/dopamina-logo.png" alt="Dopamina" width={108} height={100} unoptimized /><div className="pending-pill">Cadastro recebido</div><h1>Seu acesso está aguardando aprovação</h1><p>Assim que o proprietário aprovar seu cadastro, o painel completo será liberado para você.</p><button onClick={signOut}>Sair da conta</button></main>;

  return <div className={`erp-shell ${sidebarCompact ? "compact" : ""}`}>
    <button className="mobile-menu-button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={22} /></button>
    {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />}
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="sidebar-brand"><div className="sidebar-logo"><Image src="/ChatGPT Image 17 de ago. de 2026, 18_45_08.png" alt="Dopamina Gastrobar" width={2172} height={724} priority unoptimized /></div><button className="close-sidebar-mobile" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={20} /></button></div>
      <nav className="sidebar-nav" aria-label="Navegação principal"><span className="nav-caption">Principal</span>{NAV_ITEMS.slice(0, 11).map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setSidebarOpen(false); }} title={item.label}>{item.icon}<span>{item.label}</span></button>)}<span className="nav-caption nav-caption-space">Sistema</span>{NAV_ITEMS.slice(11).map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setSidebarOpen(false); }} title={item.label}>{item.icon}<span>{item.label}</span></button>)}</nav>
      <div className="sidebar-footer"><button className="user-menu" title={profile?.full_name ?? "Usuário"}><span className="user-avatar">{(profile?.full_name ?? "D").charAt(0).toUpperCase()}</span><span className="user-copy"><strong>{profile?.full_name ?? "Usuário"}</strong><small>{membership.role === "owner" ? "Proprietário" : "Gerência"}</small></span></button><button className="logout-button" onClick={signOut} aria-label="Sair"><LogOut size={18} /></button></div>
      <button className="compact-toggle" onClick={() => setSidebarCompact((current) => !current)} aria-label={sidebarCompact ? "Expandir menu" : "Recolher menu"}>{sidebarCompact ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
    </aside>
    <main className="workspace"><header className="workspace-header"><div><p className="breadcrumb">Dopamina / {activeNav.label}</p><h1>{activeNav.label}</h1></div><div className="workspace-actions"><button type="button" className="header-zig-sync" onClick={synchronizeZig} disabled={zigSyncing} title="Sincronizar o período selecionado com a Zig"><RefreshCw size={15} className={zigSyncing ? "spinning" : ""} /><span>{zigSyncing ? "Sincronizando..." : "Sincronizar Zig"}</span></button><label className="search-box"><Search size={17} /><input type="search" placeholder="Buscar no sistema" /><kbd>⌘ K</kbd></label><select className="period-select" value={period} onChange={(event) => { const next = event.target.value; setPeriod(next); refresh(membership.business_id, selectedRange(next, customStart, customEnd)); }} aria-label="Período"><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="this_week">Esta semana</option><option value="this_month">Este mês</option><option value="last_month">Mês anterior</option><option value="custom">Período personalizado</option></select>{period === "custom" && <div className="custom-period"><input aria-label="Início do período" type="date" value={customStart} max={customEnd} onChange={(event) => { const next = event.target.value; setCustomStart(next); refresh(membership.business_id, selectedRange("custom", next, customEnd)); }} /><span>até</span><input aria-label="Fim do período" type="date" value={customEnd} min={customStart} onChange={(event) => { const next = event.target.value; setCustomEnd(next); refresh(membership.business_id, selectedRange("custom", customStart, next)); }} /></div>}</div></header>
      <div className="workspace-content">{zigSyncMessage && <div className={zigSyncMessage.includes("concluída") ? "sync-message success global-sync-message" : "sync-message global-sync-message"}>{zigSyncMessage}</div>}<SectionContent section={section} setSection={setSection} businessId={membership.business_id} userId={userId} data={data} sales={visibleSales} saleItems={visibleItems} expenses={visibleExpenses} profitabilityImports={visibleProfitabilityImports} profitabilityItems={visibleProfitabilityItems} range={range} refreshing={refreshing} onRefresh={() => refresh()} /></div>
    </main>
  </div>;
}

function SectionContent(props: { section: Section; setSection: (section: Section) => void; businessId: string; userId: string; data: DataState; sales: Sale[]; saleItems: SaleItem[]; expenses: Expense[]; profitabilityImports: ProfitabilityImport[]; profitabilityItems: ProfitabilityItem[]; range: DateRange; refreshing: boolean; onRefresh: () => Promise<void> }) {
  if (props.section === "visao-geral") return <Overview {...props} />;
  if (props.section === "dre") return <DrePage {...props} />;
  if (props.section === "insights") return <InsightsPage {...props} />;
  if (props.section === "vendas") return <SalesPage {...props} />;
  if (props.section === "cmv") return <CmvPage {...props} />;
  if (props.section === "despesas") return <ExpensesPage {...props} />;
  if (props.section === "setores") return <SectorProfitabilityPage {...props} />;
  if (props.section === "produtos") return <ProductProfitabilityPage {...props} />;
  if (props.section === "estoque") return <StockPage {...props} />;
  if (props.section === "compras") return <PurchasesPage businessId={props.businessId} userId={props.userId} range={props.range} items={[...props.data.catalogItems, ...props.data.ingredients]} onItemsChanged={props.onRefresh} />;
  if (props.section === "pessoal") return <PersonnelPage businessId={props.businessId} userId={props.userId} range={props.range} onExpensesChanged={props.onRefresh} />;
  if (props.section === "planejamento") return <PlanningPage {...props} />;
  if (props.section === "cadastros") return <CatalogPage {...props} />;
  if (props.section === "importacoes") return <ImportsPage {...props} />;
  const content: Record<Exclude<Section, "visao-geral" | "dre" | "insights" | "vendas" | "cmv" | "despesas" | "setores" | "produtos" | "estoque" | "compras" | "pessoal" | "planejamento" | "cadastros" | "importacoes">, { eyebrow: string; title: string; description: string; action: string; icon: React.ReactNode; columns: string[] }> = {
    configuracoes: { eyebrow: "Administração", title: "Configurações e acessos", description: "Gerencie usuários, dados do negócio e histórico de alterações.", action: "Convidar usuário", icon: <UsersRound size={19} />, columns: ["Usuário", "E-mail", "Perfil", "Status", "Último acesso"] },
  };
  const current = content[props.section];
  return <section className="module-page"><ModuleHero {...current} /><div className="data-table-card"><div className="data-table-head">{current.columns.map((column) => <span key={column}>{column}</span>)}</div><div className="empty-table"><div>{current.icon}</div><h3>Este módulo será a próxima etapa</h3><p>Vendas e despesas já usam a base central. Agora podemos conectar este módulo aos mesmos dados.</p></div></div></section>;
}

function ModuleHero({ eyebrow, title, description, action, icon, onAction }: { eyebrow: string; title: string; description: string; action?: string; icon: React.ReactNode; onAction?: () => void }) {
  return <div className="module-hero"><div className="module-icon">{icon}</div><div><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div>{action && <button onClick={onAction}>{action}</button>}</div>;
}

type FinancialDay = { date: string; revenue: number; expenses: number; result: number };

function datesInRange(range: DateRange) { return Array.from({ length: rangeDays(range) }, (_, index) => shiftDate(range.start, index)); }
function salesInRange(rows: Sale[], range: DateRange) { return rows.filter((row) => row.business_date >= range.start && row.business_date <= range.end); }
function reportRevenue(rows: Sale[]) { return rows.reduce((sum, row) => sum + Number(row.revenue_amount ?? row.closing_net_amount ?? row.gross_amount), 0); }

function Overview({ sales, expenses, data, setSection, range }: Parameters<typeof SectionContent>[0]) {
  const [dayOverride, setDayOverride] = useState("");
  const previousRange = previousEquivalentRange(range);
  const selectedDay = dayOverride >= range.start && dayOverride <= range.end ? dayOverride : range.end;
  const zigConnected = data.zig.sync.some((row) => row.status === "completed" && !!row.last_success_at);
  const previousSales = salesInRange(data.sales, previousRange);
  const currentOperational = operationalCostBreakdown(data.expenses, range);
  const previousOperational = operationalCostBreakdown(data.expenses, previousRange);
  const revenue = zigConnected ? Number(data.zig.summary.net_cents) / 100 : reportRevenue(sales);
  const previousRevenue = zigConnected ? Number(data.previousZig.summary.net_cents) / 100 : reportRevenue(previousSales);
  const expenseTotal = currentOperational.days.reduce((sum, row) => sum + row.operational, 0);
  const previousExpenseTotal = previousOperational.days.reduce((sum, row) => sum + row.operational, 0);
  const result = revenue - expenseTotal;
  const previousResult = previousRevenue - previousExpenseTotal;
  const margin = revenue > 0 ? result / revenue : null;
  const previousMargin = previousRevenue > 0 ? previousResult / previousRevenue : null;
  const transactionCount = zigConnected ? Number(data.zig.summary.transaction_count) : 0;
  const previousTransactionCount = zigConnected ? Number(data.previousZig.summary.transaction_count) : 0;
  const averageTicket = transactionCount > 0 ? revenue / transactionCount : null;
  const previousAverageTicket = previousTransactionCount > 0 ? previousRevenue / previousTransactionCount : null;
  const averageDailyCost = expenseTotal / rangeDays(range);
  const previousAverageDailyCost = previousExpenseTotal / rangeDays(previousRange);

  const revenueByDay = new Map<string, number>();
  if (zigConnected) data.zig.daily.forEach((row) => revenueByDay.set(row.operational_date, Number(row.net_cents) / 100));
  else sales.forEach((row) => revenueByDay.set(row.business_date, (revenueByDay.get(row.business_date) ?? 0) + Number(row.revenue_amount ?? row.closing_net_amount ?? row.gross_amount)));
  const expenseByDay = new Map(currentOperational.days.map((row) => [row.date, row.operational]));
  const daily: FinancialDay[] = datesInRange(range).map((date) => {
    const dayRevenue = revenueByDay.get(date) ?? 0;
    const dayExpenses = expenseByDay.get(date) ?? 0;
    return { date, revenue: dayRevenue, expenses: dayExpenses, result: dayRevenue - dayExpenses };
  });
  const day = daily.find((row) => row.date === selectedDay) ?? { date: selectedDay, revenue: 0, expenses: 0, result: 0 };
  const breakEvenKnown = day.expenses > 0;
  const breakEvenReached = breakEvenKnown && day.revenue >= day.expenses;
  const periodLabel = `${dateLabel(range.start)} a ${dateLabel(range.end)}`;
  const previousLabel = `${dateLabel(previousRange.start)} a ${dateLabel(previousRange.end)}`;

  return <section className="overview-page finance-dashboard ov-dashboard">
    <div className="overview-intro finance-intro"><div><p className="page-kicker">Dashboard financeira</p><h2>Dashboard</h2><span>{periodLabel} · comparação com {previousLabel}</span></div></div>
    <div className="finance-source-note"><CheckCircle2 size={17} /><span>{zigConnected ? "Faturamento real da Zig" : sales.length ? "Faturamento do relatório importado" : "Nenhum faturamento encontrado"}</span><i /> <span>Despesas reais cadastradas no ERP</span></div>

    <div className="finance-metric-grid">
      <ExecutiveMetric label="Faturamento" value={MONEY.format(revenue)} previous={previousRevenue} current={revenue} icon={<TrendingUp size={20} />} tone="green" note={zigConnected ? "Vendas líquidas da Zig" : "Fonte disponível no sistema"} />
      <ExecutiveMetric label="Despesas" value={MONEY.format(expenseTotal)} previous={previousExpenseTotal} current={expenseTotal} icon={<ArrowDownRight size={20} />} tone="red" note={`${expenses.length} lançamento(s), exceto cancelados`} lowerIsBetter />
      <ExecutiveMetric label="Resultado estimado" value={MONEY.format(result)} previous={previousResult} current={result} icon={result >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />} tone="purple" note="Faturamento − despesas; sem CMV" />
      <ExecutiveMetric label="Margem estimada" value={margin === null ? "—" : `${NUMBER.format(margin * 100)}%`} previous={previousMargin} current={margin} icon={<CircleDollarSign size={20} />} tone="yellow" note="Resultado operacional / faturamento" isRatio />
      <ExecutiveMetric label="Ticket médio" value={averageTicket === null ? "—" : MONEY.format(averageTicket)} previous={previousAverageTicket} current={averageTicket} icon={<ReceiptText size={20} />} tone="green" note={transactionCount ? `${NUMBER.format(transactionCount)} transações válidas` : "A Zig não informou transações"} />
      <ExecutiveMetric label="Custo médio diário" value={MONEY.format(averageDailyCost)} previous={previousAverageDailyCost} current={averageDailyCost} icon={<CalendarRange size={20} />} tone="red" note={`${rangeDays(range)} dia(s) no período`} lowerIsBetter />
    </div>

    <div className="finance-main-grid">
      <article className="chart-card finance-chart-card"><div className="card-title-row"><div><p>Evolução diária</p><h3>Faturamento, despesas e resultado</h3></div><span>{periodLabel}</span></div><FinancialTrendChart rows={daily} /></article>
      <article className="day-pulse-card"><div className="day-pulse-heading"><div><p>Leitura do dia</p><h3>{dateLabel(selectedDay)}</h3></div><label><span>Escolher dia</span><input type="date" min={range.start} max={range.end} value={selectedDay} onChange={(event) => setDayOverride(event.target.value)} /></label></div>
        <div className="day-figures"><div><span>Faturou</span><strong>{MONEY.format(day.revenue)}</strong></div><div><span>Custou operar</span><strong>{MONEY.format(day.expenses)}</strong><small>despesas lançadas no dia</small></div><div><span>Sobrou</span><strong className={day.result < 0 ? "negative" : "positive"}>{MONEY.format(day.result)}</strong></div><div><span>Faturamento mínimo</span><strong>{MONEY.format(day.expenses)}</strong><small>para cobrir os custos registrados</small></div></div>
        <div className={`break-even-status ${!breakEvenKnown ? "unknown" : breakEvenReached ? "reached" : "pending"}`}>{!breakEvenKnown ? <TriangleAlert size={21} /> : breakEvenReached ? <CheckCircle2 size={21} /> : <Clock3 size={21} />}<div><strong>{!breakEvenKnown ? "Ponto de equilíbrio ainda não confiável" : breakEvenReached ? "Ponto de equilíbrio atingido" : "Ponto de equilíbrio ainda não atingido"}</strong><span>{!breakEvenKnown ? "Não há despesas lançadas para este dia. Cadastre os custos para avaliar." : breakEvenReached ? `O faturamento superou os custos registrados em ${MONEY.format(day.revenue - day.expenses)}.` : `Ainda faltam ${MONEY.format(day.expenses - day.revenue)} em faturamento para cobrir os custos.`}</span></div>{!breakEvenKnown && <button type="button" onClick={() => setSection("despesas")}>Cadastrar despesas</button>}</div>
      </article>
    </div>
    <AttentionPanel data={data} range={range} />
    <p className="finance-data-note"><TriangleAlert size={15} /> Resultado e margem são operacionais e estimados: consideram faturamento menos despesas cadastradas, sem incluir CMV nesta etapa. Custos não lançados no ERP não aparecem no cálculo.</p>
  </section>;
}

type DreSummary = {
  grossRevenue: number; discounts: number; netRevenue: number; cmvRevenue: number; cmvKnownRevenue: number;
  cmv: number; cmvMissingRevenue: number; cmvCoverage: number; grossProfit: number;
  pessoal: number; pessoalCategories: { category: string; amount: number }[];
  opex: number; opexCategories: { category: string; amount: number }[];
  operatingResult: number;
};
function computeDreSummary(zig: ZigDashboard, catalogItems: CatalogItem[], allExpenses: Expense[], range: DateRange, apiHasData: boolean, allSales: Sale[]): DreSummary {
  const salesInPeriod = salesInRange(allSales, range);
  const grossRevenue = apiHasData ? Number(zig.summary.gross_cents) / 100 : salesInPeriod.reduce((sum, row) => sum + Number(row.gross_amount), 0);
  const discounts = apiHasData ? Number(zig.summary.discount_cents) / 100 : salesInPeriod.reduce((sum, row) => sum + Number(row.discount_amount), 0);
  const netRevenue = apiHasData ? Number(zig.summary.revenue_cents) / 100 : reportRevenue(salesInPeriod);
  const cmvRows = automaticCmvRows(zig, catalogItems);
  const cmvRevenue = cmvRows.reduce((sum, row) => sum + row.revenue, 0);
  const cmvKnownRevenue = cmvRows.reduce((sum, row) => sum + row.knownRevenue, 0);
  const cmv = cmvRows.reduce((sum, row) => sum + Number(row.totalCost ?? 0), 0);
  const cmvMissingRevenue = Math.max(0, cmvRevenue - cmvKnownRevenue);
  const cmvCoverage = cmvRevenue > 0 ? cmvKnownRevenue / cmvRevenue : 0;
  const grossProfit = netRevenue - cmv;
  const pessoalExpenses = allExpenses.filter((expense) => expense.source_type === "work_shift" || expense.source_type === "personnel_cost");
  const opexExpenses = allExpenses.filter((expense) => !expense.purchase_id && expense.source_type !== "work_shift" && expense.source_type !== "personnel_cost");
  const pessoalBreakdown = operationalCostBreakdown(pessoalExpenses, range);
  const opexBreakdown = operationalCostBreakdown(opexExpenses, range);
  const pessoal = pessoalBreakdown.days.reduce((sum, row) => sum + row.operational, 0);
  const opex = opexBreakdown.days.reduce((sum, row) => sum + row.operational, 0);
  return { grossRevenue, discounts, netRevenue, cmvRevenue, cmvKnownRevenue, cmv, cmvMissingRevenue, cmvCoverage, grossProfit, pessoal, pessoalCategories: pessoalBreakdown.categories, opex, opexCategories: opexBreakdown.categories, operatingResult: grossProfit - pessoal - opex };
}
function pctChange(current: number | null, previous: number | null) { if (current === null || previous === null || previous === 0) return null; return (current - previous) / Math.abs(previous); }

type SectorResult = { name: string; revenue: number; share: number; knownRevenue: number; cmv: number; grossProfit: number; pessoal: number; opex: number; result: number; margin: number | null };
function operationalAreaName(area: { name: string; is_operational: boolean } | null | undefined): string | null {
  return area?.is_operational ? area.name : null;
}
function computeSectorResults(sourceProducts: SectorProduct[], expenses: Expense[], range: DateRange, operationalAreas: Area[]): SectorResult[] {
  const totalRevenue = sourceProducts.reduce((sum, product) => sum + Number(product.revenue_cents) / 100, 0);
  return operationalAreas.map((area) => {
    const name = area.name;
    const products = sourceProducts.filter((product) => product.sector === name);
    const revenue = products.reduce((sum, product) => sum + Number(product.revenue_cents) / 100, 0);
    const knownRevenue = products.reduce((sum, product) => sum + Number(product.known_revenue_cents) / 100, 0);
    const cmv = products.reduce((sum, product) => sum + Number(product.known_cmv ?? 0), 0);
    const grossProfit = knownRevenue - cmv;
    const sectorExpenses = expenses.filter((expense) => operationalAreaName(nested(expense.areas)) === name);
    const pessoal = sectorExpenses.filter((expense) => expense.source_type === "work_shift" || expense.source_type === "personnel_cost").reduce((sum, expense) => sum + operationalExpenseAmount(expense, range), 0);
    const opex = sectorExpenses.filter((expense) => expense.source_type !== "work_shift" && expense.source_type !== "personnel_cost").reduce((sum, expense) => sum + operationalExpenseAmount(expense, range), 0);
    const result = grossProfit - pessoal - opex;
    return { name, revenue, share: totalRevenue > 0 ? revenue / totalRevenue : 0, knownRevenue, cmv, grossProfit, pessoal, opex, result, margin: knownRevenue > 0 ? result / knownRevenue : null };
  });
}

function DrePage(props: Parameters<typeof SectionContent>[0]) {
  const range = props.range;
  const previousRange = previousEquivalentRange(range);
  const apiHasData = props.data.zig.sync.some((row) => row.status === "completed" && !!row.last_success_at);
  const current = useMemo(() => computeDreSummary(props.data.zig, props.data.catalogItems, props.data.expenses, range, apiHasData, props.data.sales), [props.data.zig, props.data.catalogItems, props.data.expenses, range, apiHasData, props.data.sales]);
  const previous = useMemo(() => computeDreSummary(props.data.previousZig, props.data.catalogItems, props.data.expenses, previousRange, apiHasData, props.data.sales), [props.data.previousZig, props.data.catalogItems, props.data.expenses, previousRange, apiHasData, props.data.sales]);

  const grossMargin = current.netRevenue > 0 ? current.grossProfit / current.netRevenue : null;
  const previousGrossMargin = previous.netRevenue > 0 ? previous.grossProfit / previous.netRevenue : null;
  const operatingMargin = current.netRevenue > 0 ? current.operatingResult / current.netRevenue : null;
  const previousOperatingMargin = previous.netRevenue > 0 ? previous.operatingResult / previous.netRevenue : null;
  const cmvPct = current.netRevenue > 0 ? current.cmv / current.netRevenue : null;
  const previousCmvPct = previous.netRevenue > 0 ? previous.cmv / previous.netRevenue : null;
  const pessoalPct = current.netRevenue > 0 ? current.pessoal / current.netRevenue : null;
  const opexPct = current.netRevenue > 0 ? current.opex / current.netRevenue : null;

  const revenueChange = pctChange(current.netRevenue, previous.netRevenue);
  const resultChange = pctChange(current.operatingResult, previous.operatingResult);
  const pessoalChange = pctChange(current.pessoal, previous.pessoal);

  const operationalAreas = useMemo(() => props.data.areas.filter((area) => area.is_operational), [props.data.areas]);
  const sectorResults = useMemo(() => computeSectorResults(props.data.sectorProfitability.products, props.data.expenses, range, operationalAreas), [props.data.sectorProfitability, props.data.expenses, range, operationalAreas]);
  const sectorTotal = sectorResults.reduce((sum, row) => sum + row.result, 0);
  const generalExpenses = props.data.expenses.filter((expense) => operationalAreaName(nested(expense.areas)) === null && !expense.purchase_id);
  const generalPessoal = generalExpenses.filter((expense) => expense.source_type === "work_shift" || expense.source_type === "personnel_cost").reduce((sum, expense) => sum + operationalExpenseAmount(expense, range), 0);
  const generalOpex = generalExpenses.filter((expense) => expense.source_type !== "work_shift" && expense.source_type !== "personnel_cost").reduce((sum, expense) => sum + operationalExpenseAmount(expense, range), 0);
  const generalTotal = generalPessoal + generalOpex;
  const finalResult = sectorTotal - generalTotal;

  const dailyRevenue = new Map<string, number>();
  if (apiHasData) props.data.zig.daily.forEach((row) => dailyRevenue.set(row.operational_date, Number(row.net_cents) / 100));
  else salesInRange(props.data.sales, range).forEach((row) => dailyRevenue.set(row.business_date, (dailyRevenue.get(row.business_date) ?? 0) + Number(row.revenue_amount ?? row.closing_net_amount ?? row.gross_amount)));
  const pessoalByDay = new Map(operationalCostBreakdown(props.data.expenses.filter((expense) => expense.source_type === "work_shift" || expense.source_type === "personnel_cost"), range).days.map((row) => [row.date, row.operational]));
  const opexByDay = new Map(operationalCostBreakdown(props.data.expenses.filter((expense) => !expense.purchase_id && expense.source_type !== "work_shift" && expense.source_type !== "personnel_cost"), range).days.map((row) => [row.date, row.operational]));
  const dailyTrend: FinancialDay[] = datesInRange(range).map((date) => {
    const revenue = dailyRevenue.get(date) ?? 0;
    const expenses = (pessoalByDay.get(date) ?? 0) + (opexByDay.get(date) ?? 0);
    return { date, revenue, expenses, result: revenue - expenses };
  });

  const alerts: { label: string; detail: string; tone: "red" | "yellow" }[] = [];
  if (current.operatingResult < 0) alerts.push({ label: "Resultado operacional negativo", detail: `O período fechou em ${MONEY.format(current.operatingResult)} depois de CMV, pessoal e despesas operacionais.`, tone: "red" });
  if (cmvPct !== null && previousCmvPct !== null && cmvPct - previousCmvPct > 0.02) alerts.push({ label: "CMV aumentou em relação ao período anterior", detail: `Foi de ${NUMBER.format(previousCmvPct * 100)}% para ${NUMBER.format(cmvPct * 100)}% da receita líquida.`, tone: "yellow" });
  if (pessoalChange !== null && revenueChange !== null && pessoalChange > revenueChange + 0.02) alerts.push({ label: "Custo de pessoal cresceu mais que o faturamento", detail: `Pessoal ${pessoalChange >= 0 ? "subiu" : "caiu"} ${NUMBER.format(Math.abs(pessoalChange) * 100)}% contra ${NUMBER.format(Math.abs(revenueChange) * 100)}% do faturamento.`, tone: "yellow" });
  if (operatingMargin !== null && previousOperatingMargin !== null && operatingMargin < previousOperatingMargin - 0.01) alerts.push({ label: "Margem operacional caiu", detail: `Foi de ${NUMBER.format(previousOperatingMargin * 100)}% para ${NUMBER.format(operatingMargin * 100)}% da receita líquida.`, tone: "yellow" });
  if (revenueChange !== null && revenueChange > 0.01 && resultChange !== null && resultChange < 0) alerts.push({ label: "Faturamento cresceu, mas o resultado caiu", detail: `Receita líquida subiu ${NUMBER.format(revenueChange * 100)}%, mas o resultado operacional caiu ${NUMBER.format(Math.abs(resultChange) * 100)}%.`, tone: "yellow" });
  current.opexCategories.forEach((row) => { const prior = previous.opexCategories.find((item) => item.category === row.category); const change = pctChange(row.amount, prior?.amount ?? null); if (change !== null && change > 0.25 && row.amount - Number(prior?.amount ?? 0) > 50) alerts.push({ label: `${row.category} aumentou significativamente`, detail: `De ${MONEY.format(Number(prior?.amount ?? 0))} para ${MONEY.format(row.amount)} no período.`, tone: "yellow" }); });
  sectorResults.filter((row) => row.revenue > 0 && row.result < 0).forEach((row) => alerts.push({ label: `${row.name} com resultado negativo`, detail: `${MONEY.format(row.revenue)} de faturamento, mas resultado conhecido de ${MONEY.format(row.result)}.`, tone: "red" }));

  const periodLabel = `${dateLabel(range.start)} a ${dateLabel(range.end)}`;
  const previousLabel = `${dateLabel(previousRange.start)} a ${dateLabel(previousRange.end)}`;

  return <section className="dre-page">
    <ModuleHero eyebrow="Resultado real" title="DRE gerencial" description="Receita, CMV, pessoal e despesas já sincronizados, reunidos para responder quanto o bar realmente ganhou ou perdeu." action="Revisar CMV" icon={<FileBarChart2 size={19} />} onAction={() => props.setSection("cmv")} />
    <p className="dre-source-note"><CheckCircle2 size={15} />{periodLabel} · comparação com {previousLabel} · {apiHasData ? "Faturamento real da Zig" : "Relatório importado"}</p>

    <div className="finance-metric-grid dre-kpi-grid">
      <ExecutiveMetric label="Receita líquida" value={MONEY.format(current.netRevenue)} current={current.netRevenue} previous={previous.netRevenue} icon={<TrendingUp size={20} />} tone="green" note="Faturamento após descontos" />
      <ExecutiveMetric label="Lucro bruto" value={MONEY.format(current.grossProfit)} current={current.grossProfit} previous={previous.grossProfit} icon={<ArrowUpRight size={20} />} tone="green" note="Receita líquida − CMV" />
      <ExecutiveMetric label="Margem bruta" value={grossMargin === null ? "—" : `${NUMBER.format(grossMargin * 100)}%`} current={grossMargin} previous={previousGrossMargin} isRatio icon={<CircleDollarSign size={20} />} tone="purple" note="Lucro bruto / receita líquida" />
      <ExecutiveMetric label="CMV" value={MONEY.format(current.cmv)} current={current.cmv} previous={previous.cmv} lowerIsBetter icon={<BarChart3 size={20} />} tone="yellow" note={`${NUMBER.format(current.cmvCoverage * 100)}% da receita com custo conhecido`} />
      <ExecutiveMetric label="Custo de pessoal" value={MONEY.format(current.pessoal)} current={current.pessoal} previous={previous.pessoal} lowerIsBetter icon={<UsersRound size={20} />} tone="red" note={pessoalPct === null ? "Sem receita no período" : `${NUMBER.format(pessoalPct * 100)}% da receita líquida`} />
      <ExecutiveMetric label="Despesas operacionais" value={MONEY.format(current.opex)} current={current.opex} previous={previous.opex} lowerIsBetter icon={<WalletCards size={20} />} tone="red" note={opexPct === null ? "Sem receita no período" : `${NUMBER.format(opexPct * 100)}% da receita líquida`} />
      <ExecutiveMetric label="Resultado operacional" value={MONEY.format(current.operatingResult)} current={current.operatingResult} previous={previous.operatingResult} icon={current.operatingResult >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />} tone="purple" note="Lucro bruto − pessoal − despesas" />
      <ExecutiveMetric label="Margem operacional" value={operatingMargin === null ? "—" : `${NUMBER.format(operatingMargin * 100)}%`} current={operatingMargin} previous={previousOperatingMargin} isRatio icon={<FileBarChart2 size={20} />} tone="purple" note="Resultado operacional / receita líquida" />
    </div>

    {current.cmvMissingRevenue > 0 && <div className="data-warning"><TriangleAlert size={14} /><span><strong>{MONEY.format(current.cmvMissingRevenue)}</strong> da receita ainda não tem CMV confiável ({NUMBER.format(current.cmvCoverage * 100)}% de cobertura) — o resultado acima é o resultado conhecido, não uma estimativa completa.</span></div>}

    <div className="dre-layout">
      <article className="chart-card dre-statement-card"><div className="card-title-row"><div><p>Demonstrativo</p><h3>Da receita ao resultado</h3></div></div>
        <div className="dre-statement">
          <DreLine label="Receita bruta" value={current.grossRevenue} />
          <DreLine label="(-) Descontos e deduções" value={-current.discounts} muted />
          <DreLine label="= Receita líquida" value={current.netRevenue} strong />
          <DreLine label="(-) CMV" value={-current.cmv} muted percent={cmvPct} />
          <DreLine label="= Lucro bruto" value={current.grossProfit} strong percent={grossMargin} />
          <DreLine label="(-) Custos de pessoal" value={-current.pessoal} muted percent={pessoalPct} />
          <DreLine label="(-) Despesas operacionais" value={-current.opex} muted percent={opexPct} />
          <DreLine label="= Resultado operacional" value={current.operatingResult} strong final percent={operatingMargin} />
        </div>
      </article>
      <article className="chart-card"><div className="card-title-row"><div><p>Cobertura</p><h3>Receita com CMV conhecido</h3></div><strong>{NUMBER.format(current.cmvCoverage * 100)}%</strong></div><CoverageBar known={current.cmvKnownRevenue} missing={current.cmvMissingRevenue} /></article>
    </div>

    <div className="dre-layout">
      <article className="chart-card finance-chart-card"><div className="card-title-row"><div><p>Evolução diária</p><h3>Faturamento, despesas e resultado</h3></div><span>{periodLabel}</span></div><FinancialTrendChart rows={dailyTrend} /><p className="dre-chart-note">Despesas somam pessoal e operacionais rateadas por dia; o CMV entra apenas no total do período, pois não há custo diário confiável por produto.</p></article>
      <article className="chart-card"><div className="card-title-row"><div><p>Comparação</p><h3>{periodLabel} vs. {previousLabel}</h3></div></div>
        <div className="dre-compare-grid">
          <DreCompareRow label="Receita líquida" current={current.netRevenue} previous={previous.netRevenue} money />
          <DreCompareRow label="Resultado operacional" current={current.operatingResult} previous={previous.operatingResult} money />
          <DreCompareRow label="Margem operacional" current={operatingMargin} previous={previousOperatingMargin} />
        </div>
      </article>
    </div>

    <div className="dre-layout">
      <article className="chart-card"><div className="card-title-row"><div><p>Composição</p><h3>O que mais consome a receita</h3></div></div>
        <div className="expense-classification dre-composition"><ExpenseCompositionRow label="CMV" value={current.cmv} total={current.netRevenue} /><ExpenseCompositionRow label="Pessoal" value={current.pessoal} total={current.netRevenue} /><ExpenseCompositionRow label="Despesas operacionais" value={current.opex} total={current.netRevenue} /><ExpenseCompositionRow label="Resultado operacional" value={Math.max(0, current.operatingResult)} total={current.netRevenue} /></div>
      </article>
      <article className="chart-card"><div className="card-title-row"><div><p>Detalhamento</p><h3>Despesas operacionais por categoria</h3></div></div><ExpenseCategoryBars rows={current.opexCategories} total={current.opex} /></article>
    </div>

    <article className="chart-card dre-sector-card">
      <div className="card-title-row"><div><p>Resultado por setor</p><h3>{operationalAreas.length ? operationalAreas.map((area) => area.name).join(", ") : "Nenhum setor operacional"}</h3></div><span>Custos gerais não são rateados entre setores</span></div>
      <div className="data-table-card dre-sector-table-card"><div className="responsive-table dre-sector-table"><div className="table-row table-header"><span>Setor</span><span>Receita</span><span>CMV</span><span>Lucro bruto</span><span>Pessoal</span><span>Despesas</span><span>Resultado</span><span>Margem</span></div>
        {sectorResults.map((row) => <div className="table-row" key={row.name}><strong>{row.name}</strong><span>{row.revenue > 0 ? MONEY.format(row.revenue) : "—"}</span><span>{row.knownRevenue > 0 ? MONEY.format(row.cmv) : "—"}</span><span>{row.knownRevenue > 0 ? MONEY.format(row.grossProfit) : "—"}</span><span>{row.pessoal > 0 ? MONEY.format(row.pessoal) : "—"}</span><span>{row.opex > 0 ? MONEY.format(row.opex) : "—"}</span><strong className={row.result < 0 ? "negative" : ""}>{row.knownRevenue > 0 ? MONEY.format(row.result) : "—"}</strong><span>{row.margin === null ? "—" : `${NUMBER.format(row.margin * 100)}%`}</span></div>)}
      </div></div>
      <div className="dre-sector-summary">
        <div><span>Resultado dos setores antes dos custos gerais</span><strong>{MONEY.format(sectorTotal)}</strong></div>
        <div><span>Custos gerais (terreno, banheiros, geral)</span><strong>{generalTotal > 0 ? `- ${MONEY.format(generalTotal)}` : "—"}</strong></div>
        <div className="final"><span>Resultado final do negócio</span><strong className={finalResult < 0 ? "negative" : ""}>{MONEY.format(finalResult)}</strong></div>
      </div>
    </article>

    <article className="chart-card dre-alerts-card"><div className="card-title-row"><div><p>Alertas gerenciais</p><h3>O que merece atenção</h3></div><TriangleAlert size={19} /></div>
      {alerts.length ? <div className="product-alert-list">{alerts.map((alert, index) => <div key={`${alert.label}-${index}`}><span className={`product-alert-dot priority-${alert.tone === "red" ? 0 : 1}`} /><div><strong>{alert.label}</strong><small>{alert.detail}</small></div></div>)}</div> : <EmptyMini text="Nenhum alerta relevante identificado com os dados atuais." />}
    </article>
  </section>;
}
function DreLine({ label, value, muted, strong, final, percent }: { label: string; value: number; muted?: boolean; strong?: boolean; final?: boolean; percent?: number | null }) {
  return <div className={`dre-line ${strong ? "strong" : ""} ${final ? "final" : ""} ${muted ? "muted" : ""} ${value < 0 ? "negative" : ""}`}><span>{label}</span><strong>{MONEY.format(value)}</strong><small>{percent === null || percent === undefined ? "" : `${NUMBER.format(percent * 100)}%`}</small></div>;
}
function DreCompareRow({ label, current, previous, money }: { label: string; current: number | null; previous: number | null; money?: boolean }) {
  const format = (value: number | null) => value === null ? "—" : money ? MONEY.format(value) : `${NUMBER.format(value * 100)}%`;
  const change = pctChange(current, previous);
  return <div className="dre-compare-row"><span>{label}</span><div><small>Atual</small><strong>{format(current)}</strong></div><div><small>Anterior</small><strong>{format(previous)}</strong></div><div className={change === null ? "" : change >= 0 ? "positive" : "negative"}><small>Variação</small><strong>{change === null ? "—" : `${change > 0 ? "+" : ""}${NUMBER.format(change * 100)}%`}</strong></div></div>;
}

type InsightPriority = "critical" | "attention" | "opportunity" | "info";
type Insight = { id: string; priority: InsightPriority; category: string; title: string; detail: string; impact?: string };
const PRIORITY_ORDER: Record<InsightPriority, number> = { critical: 0, attention: 1, opportunity: 2, info: 3 };
const PRIORITY_LABEL: Record<InsightPriority, string> = { critical: "Crítico", attention: "Atenção", opportunity: "Oportunidade", info: "Informação" };
function pct(value: number) { return `${NUMBER.format(value * 100)}%`; }
function sortInsights(rows: Insight[]) { return [...rows].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]); }

function buildFinancialInsights(current: DreSummary, previous: DreSummary, sectorResults: SectorResult[], previousSectorResults: SectorResult[]): Insight[] {
  const insights: Insight[] = [];
  const hasHistory = previous.netRevenue > 0;
  const revenueChange = pctChange(current.netRevenue, previous.netRevenue);
  const resultChange = pctChange(current.operatingResult, previous.operatingResult);
  const cmvPct = current.netRevenue > 0 ? current.cmv / current.netRevenue : null;
  const previousCmvPct = previous.netRevenue > 0 ? previous.cmv / previous.netRevenue : null;
  const operatingMargin = current.netRevenue > 0 ? current.operatingResult / current.netRevenue : null;
  const previousOperatingMargin = previous.netRevenue > 0 ? previous.operatingResult / previous.netRevenue : null;
  const pessoalChange = pctChange(current.pessoal, previous.pessoal);

  if (!hasHistory) {
    insights.push({ id: "no-history", priority: "info", category: "Histórico", title: "Ainda não há histórico suficiente para comparar períodos", detail: "Assim que existir um período anterior equivalente com dados, o ERP passa a comparar automaticamente faturamento, CMV, pessoal e resultado." });
  } else {
    if (revenueChange !== null && revenueChange > 0.03 && resultChange !== null && resultChange < -0.03) insights.push({ id: "revenue-up-result-down", priority: "attention", category: "DRE", title: "Faturamento subiu, mas o resultado caiu", detail: `Receita líquida cresceu ${pct(revenueChange)}, mas o resultado operacional caiu ${pct(Math.abs(resultChange))} no mesmo período.`, impact: MONEY.format(current.operatingResult - previous.operatingResult) });
    if (cmvPct !== null && previousCmvPct !== null && cmvPct - previousCmvPct > 0.02) insights.push({ id: "cmv-up", priority: cmvPct - previousCmvPct > 0.05 ? "critical" : "attention", category: "CMV", title: "CMV aumentou em relação ao período anterior", detail: `O CMV foi de ${pct(previousCmvPct)} para ${pct(cmvPct)} da receita líquida.`, impact: `+${MONEY.format(current.cmv - previous.cmv)}` });
    if (operatingMargin !== null && previousOperatingMargin !== null && operatingMargin < previousOperatingMargin - 0.02) insights.push({ id: "margin-down", priority: previousOperatingMargin - operatingMargin > 0.05 ? "critical" : "attention", category: "DRE", title: "Margem operacional caiu", detail: `A margem operacional caiu de ${pct(previousOperatingMargin)} para ${pct(operatingMargin)}.`, impact: MONEY.format(current.operatingResult - previous.operatingResult) });
    if (pessoalChange !== null && revenueChange !== null && pessoalChange > revenueChange + 0.05) insights.push({ id: "pessoal-up", priority: "attention", category: "Pessoal", title: "Custo de pessoal cresceu mais que o faturamento", detail: `Pessoal ${pessoalChange >= 0 ? "subiu" : "caiu"} ${pct(Math.abs(pessoalChange))} enquanto a receita ${revenueChange >= 0 ? "cresceu" : "caiu"} ${pct(Math.abs(revenueChange))}.`, impact: MONEY.format(current.pessoal - previous.pessoal) });
    current.opexCategories.forEach((row) => { const prior = previous.opexCategories.find((item) => item.category === row.category); const change = pctChange(row.amount, prior?.amount ?? null); const delta = row.amount - Number(prior?.amount ?? 0); if (change !== null && change > 0.3 && delta > 80) insights.push({ id: `opex-${row.category}`, priority: delta > 400 ? "attention" : "info", category: "Despesas", title: `${row.category} aumentou significativamente`, detail: `Foi de ${MONEY.format(Number(prior?.amount ?? 0))} para ${MONEY.format(row.amount)} no período (${pct(change)}).`, impact: MONEY.format(delta) }); });
    if (current.operatingResult < 0) insights.push({ id: "negative-result", priority: "critical", category: "DRE", title: "Resultado operacional negativo no período", detail: `O período fechou em ${MONEY.format(current.operatingResult)} depois de CMV, pessoal e despesas operacionais.`, impact: MONEY.format(current.operatingResult) });
  }
  if (current.cmvRevenue > 0 && current.cmvCoverage < 0.85) insights.push({ id: "cmv-coverage", priority: current.cmvCoverage < 0.6 ? "attention" : "info", category: "Qualidade de dados", title: "Cobertura de CMV incompleta", detail: `${pct(current.cmvCoverage)} da receita tem custo confiável no período. ${MONEY.format(current.cmvMissingRevenue)} ainda não entram no CMV conhecido, então o resultado acima é o resultado conhecido, não uma estimativa completa.` });

  const activeSectors = sectorResults.filter((row) => row.revenue > 0);
  activeSectors.filter((row) => row.result < 0).forEach((row) => insights.push({ id: `sector-negative-${row.name}`, priority: "critical", category: "Setor", title: `${row.name} com resultado negativo`, detail: `${row.name} faturou ${MONEY.format(row.revenue)}, mas o resultado conhecido é ${MONEY.format(row.result)} depois de CMV, pessoal e despesas atribuídas.`, impact: MONEY.format(row.result) }));
  activeSectors.forEach((row) => {
    const prior = previousSectorResults.find((item) => item.name === row.name);
    if (!prior || prior.revenue <= 0) return;
    const revChange = pctChange(row.revenue, prior.revenue);
    const resChange = pctChange(row.result, prior.result);
    if (revChange === null || resChange === null || !(revChange > 0.05 && resChange < -0.05)) return;
    const reasons: string[] = [];
    const cmvPctSector = row.knownRevenue > 0 ? row.cmv / row.knownRevenue : null;
    const priorCmvPctSector = prior.knownRevenue > 0 ? prior.cmv / prior.knownRevenue : null;
    if (cmvPctSector !== null && priorCmvPctSector !== null && cmvPctSector > priorCmvPctSector + 0.02) reasons.push("aumento do CMV");
    const pessoalChangeSector = pctChange(row.pessoal, prior.pessoal);
    if (pessoalChangeSector !== null && pessoalChangeSector > 0.1) reasons.push("aumento do custo de pessoal");
    insights.push({ id: `sector-rev-up-result-down-${row.name}`, priority: "attention", category: "Setor", title: `${row.name} faturou mais, mas o resultado caiu`, detail: `${row.name} faturou ${pct(revChange)} a mais${reasons.length ? `, por causa do ${reasons.join(" e do ")}` : ""}, mas o resultado caiu ${pct(Math.abs(resChange))}.`, impact: MONEY.format(row.result - prior.result) });
  });
  if (activeSectors.length) { const best = activeSectors.reduce((a, b) => (b.revenue > a.revenue ? b : a)); insights.push({ id: "sector-best-revenue", priority: "info", category: "Setor", title: `${best.name} é o setor que mais fatura`, detail: `${best.name} representa ${pct(best.share)} do faturamento do período.` }); }
  return insights;
}

function buildProductInsights(products: SectorProduct[], previousProducts: SectorProduct[]): Insight[] {
  const insights: Insight[] = [];
  const totalRevenue = products.reduce((sum, product) => sum + Number(product.revenue_cents) / 100, 0);
  if (totalRevenue <= 0) return insights;
  const previousByKey = new Map(previousProducts.map((product) => [productProfitabilityKey(product), product]));
  const rows = products.map((product) => {
    const revenue = Number(product.revenue_cents) / 100;
    const costedQuantity = Number(product.costed_quantity);
    const missingQuantity = Number(product.missing_cost_quantity);
    const knownCmv = Number(product.known_cmv ?? 0);
    const costStatus: "known" | "partial" | "missing" = costedQuantity <= 0 ? "missing" : missingQuantity > 0 ? "partial" : "known";
    const margin = costStatus === "known" && revenue > 0 ? (revenue - knownCmv) / revenue : null;
    const prior = previousByKey.get(productProfitabilityKey(product));
    const priorRevenue = prior ? Number(prior.revenue_cents) / 100 : 0;
    const priorCostedQuantity = prior ? Number(prior.costed_quantity) : 0;
    const priorMissingQuantity = prior ? Number(prior.missing_cost_quantity) : 0;
    const priorMargin = prior && priorCostedQuantity > 0 && priorMissingQuantity <= 0 && priorRevenue > 0 ? (priorRevenue - Number(prior.known_cmv ?? 0)) / priorRevenue : null;
    return { name: product.name, revenue, share: revenue / totalRevenue, margin, priorMargin, costStatus };
  });
  const known = rows.filter((row) => row.margin !== null);
  known.filter((row) => Number(row.margin) < 0 && row.revenue >= 50).sort((a, b) => b.revenue - a.revenue).slice(0, 3).forEach((row) => insights.push({ id: `product-negative-margin-${row.name}`, priority: "critical", category: "Produto", title: `${row.name} está com margem negativa`, detail: `Faturou ${MONEY.format(row.revenue)} no período, mas o custo conhecido supera a receita (margem de ${pct(Number(row.margin))}).` }));
  known.filter((row) => row.priorMargin !== null && row.priorMargin - Number(row.margin) > 0.12 && row.revenue >= 150).sort((a, b) => (b.priorMargin! - Number(b.margin)) - (a.priorMargin! - Number(a.margin))).slice(0, 3).forEach((row) => insights.push({ id: `product-margin-drop-${row.name}`, priority: "attention", category: "Produto", title: `${row.name} teve queda relevante de margem`, detail: `A margem caiu de ${pct(Number(row.priorMargin))} para ${pct(Number(row.margin))}, com faturamento de ${MONEY.format(row.revenue)} no período.` }));
  const revenueValues = rows.filter((row) => row.revenue > 0).map((row) => row.revenue);
  const revenueCut = median(revenueValues);
  known.filter((row) => row.revenue >= revenueCut && Number(row.margin) < 0.25 && row.revenue >= 100).sort((a, b) => b.revenue - a.revenue).slice(0, 3).forEach((row) => insights.push({ id: `product-high-sales-low-margin-${row.name}`, priority: "attention", category: "Produto", title: `${row.name} vende bem, mas com margem baixa`, detail: `Faturou ${MONEY.format(row.revenue)} (${pct(row.share)} das vendas) com margem de apenas ${pct(Number(row.margin))}.` }));
  known.filter((row) => Number(row.margin) >= 0.5 && row.share < 0.03 && row.revenue > 0).sort((a, b) => Number(b.margin) - Number(a.margin)).slice(0, 3).forEach((row) => insights.push({ id: `product-opportunity-${row.name}`, priority: "opportunity", category: "Produto", title: `${row.name} pode ter espaço para vender mais`, detail: `Margem de ${pct(Number(row.margin))}, mas representa só ${pct(row.share)} das vendas do período. Pode ser uma oportunidade para analisar destaque no cardápio ou no salão.` }));
  rows.filter((row) => row.costStatus === "missing" && row.revenue >= 200).sort((a, b) => b.revenue - a.revenue).slice(0, 3).forEach((row) => insights.push({ id: `product-missing-cost-${row.name}`, priority: "info", category: "Qualidade de dados", title: `${row.name} não tem custo confiável cadastrado`, detail: `Faturou ${MONEY.format(row.revenue)} no período, mas sem ficha técnica ou custo válido a margem não pode ser calculada.` }));
  return insights;
}

function buildStockInsights(stock: StockDashboard): Insight[] {
  const insights: Insight[] = [];
  const outOfStock = stock.items.filter((item) => item.status === "out" && item.has_baseline);
  if (outOfStock.length) insights.push({ id: "stock-out", priority: "critical", category: "Estoque", title: `${outOfStock.length} item(ns) sem estoque`, detail: `${outOfStock.slice(0, 4).map((item) => item.name).join(", ")}${outOfStock.length > 4 ? ` e mais ${outOfStock.length - 4}` : ""} com saldo teórico zerado ou negativo.` });
  const belowMinimum = stock.items.filter((item) => item.status === "low" || item.status === "below_minimum");
  if (belowMinimum.length) insights.push({ id: "stock-low", priority: "attention", category: "Estoque", title: `${belowMinimum.length} item(ns) abaixo do mínimo`, detail: `${belowMinimum.slice(0, 4).map((item) => item.name).join(", ")}${belowMinimum.length > 4 ? ` e mais ${belowMinimum.length - 4}` : ""} estão abaixo do estoque mínimo cadastrado.` });
  const divergent = stock.items.filter((item) => item.last_variance_quantity !== null && item.variance_value !== null && Math.abs(Number(item.variance_value)) >= 40);
  divergent.sort((a, b) => Math.abs(Number(b.variance_value)) - Math.abs(Number(a.variance_value))).slice(0, 3).forEach((item) => insights.push({ id: `stock-divergence-${item.id}`, priority: Math.abs(Number(item.variance_value)) > 150 ? "attention" : "info", category: "Divergência", title: `${item.name} apresentou divergência de estoque`, detail: `Diferença de ${NUMBER.format(Math.abs(Number(item.last_variance_quantity)))} ${item.unit} no último inventário, equivalente a ${MONEY.format(Math.abs(Number(item.variance_value)))}. Não indica automaticamente furto ou erro — vale investigar a origem.`, impact: MONEY.format(Number(item.variance_value)) }));
  const totalVariance = stock.items.reduce((sum, item) => sum + Math.abs(Number(item.variance_value ?? 0)), 0);
  if (totalVariance >= 60) insights.push({ id: "stock-variance-total", priority: totalVariance > 500 ? "attention" : "info", category: "Divergência", title: "Divergências de estoque no período", detail: `A soma das diferenças entre estoque teórico e físico no período é de aproximadamente ${MONEY.format(totalVariance)}.`, impact: MONEY.format(totalVariance) });
  const risk = stock.items.filter((item) => item.suggested_purchase !== null && Number(item.suggested_purchase) > 0 && item.reference_days !== null && Number(item.reference_days) >= 2 && item.has_baseline);
  risk.sort((a, b) => Number(b.suggested_purchase) - Number(a.suggested_purchase)).slice(0, 3).forEach((item) => insights.push({ id: `stock-risk-${item.id}`, priority: "attention", category: "Reposição", title: `Estoque de ${item.name} pode ser insuficiente`, detail: `Estoque atual de ${NUMBER.format(Number(item.theoretical_quantity))} ${item.unit}. A referência de ${item.reference_days} período(s) comparável(is) recente(s) sugere consumo de ${NUMBER.format(Number(item.expected_quantity))} ${item.unit} — estimativa aproximada baseada no histórico, não uma garantia.` }));
  const parados = stock.items.filter((item) => item.has_baseline && item.stock_value !== null && Number(item.stock_value) >= 150 && Number(item.theoretical_quantity) > 0 && item.consumed_period <= Number(item.theoretical_quantity) * 0.15);
  parados.sort((a, b) => Number(b.stock_value) - Number(a.stock_value)).slice(0, 3).forEach((item) => insights.push({ id: `stock-slow-${item.id}`, priority: "opportunity", category: "Estoque parado", title: `${item.name} com giro baixo`, detail: `${MONEY.format(Number(item.stock_value))} imobilizados neste item, com apenas ${NUMBER.format(item.consumed_period)} ${item.unit} consumidos no período analisado.`, impact: MONEY.format(Number(item.stock_value)) }));
  return insights;
}

type PriceHistoryPoint = { item_id: string; item_name: string; supplier_id: string; supplier_name: string | null; unit_cost: number; received_at: string };
function buildPurchaseInsights(priceHistory: PriceHistoryPoint[]): Insight[] {
  const insights: Insight[] = [];
  const byItem = new Map<string, PriceHistoryPoint[]>();
  priceHistory.forEach((point) => byItem.set(point.item_id, [...(byItem.get(point.item_id) ?? []), point]));
  byItem.forEach((points) => {
    if (points.length < 2) return;
    const sorted = [...points].sort((a, b) => a.received_at.localeCompare(b.received_at));
    const latest = sorted[sorted.length - 1]; const before = sorted[sorted.length - 2];
    const change = before.unit_cost > 0 ? (latest.unit_cost - before.unit_cost) / before.unit_cost : null;
    if (change !== null && change > 0.08) insights.push({ id: `purchase-price-${latest.item_id}`, priority: change > 0.15 ? "attention" : "info", category: "Compras", title: `${latest.item_name} ficou mais caro`, detail: `O último preço pago foi ${MONEY.format(latest.unit_cost)}, ${pct(change)} acima da compra anterior (${MONEY.format(before.unit_cost)}) registrada em ${dateLabel(before.received_at)}.` });
  });
  const byItemName = new Map<string, PriceHistoryPoint[]>();
  priceHistory.forEach((point) => byItemName.set(point.item_name, [...(byItemName.get(point.item_name) ?? []), point]));
  byItemName.forEach((points, name) => {
    const bySupplier = new Map<string, PriceHistoryPoint>();
    [...points].sort((a, b) => a.received_at.localeCompare(b.received_at)).forEach((point) => bySupplier.set(point.supplier_id, point));
    const list = [...bySupplier.values()];
    if (list.length < 2) return;
    const sortedByPrice = [...list].sort((a, b) => a.unit_cost - b.unit_cost);
    const cheapest = sortedByPrice[0]; const priciest = sortedByPrice[sortedByPrice.length - 1];
    const diff = cheapest.unit_cost > 0 ? (priciest.unit_cost - cheapest.unit_cost) / cheapest.unit_cost : null;
    if (diff !== null && diff > 0.1) insights.push({ id: `supplier-diff-${name}`, priority: "opportunity", category: "Fornecedores", title: `${name} tem preços diferentes entre fornecedores`, detail: `O último preço de ${priciest.supplier_name ?? "um fornecedor"} foi ${pct(diff)} maior que o de ${cheapest.supplier_name ?? "outro fornecedor"} (${MONEY.format(priciest.unit_cost)} vs. ${MONEY.format(cheapest.unit_cost)}).` });
  });
  return insights;
}

type PersonnelShiftRow = { hours_worked: number; amount_due: number };
type PersonnelCostRow = { amount: number };
function buildPersonnelInsights(currentShifts: PersonnelShiftRow[], currentCosts: PersonnelCostRow[], previousShifts: PersonnelShiftRow[], previousCosts: PersonnelCostRow[], netRevenue: number): Insight[] {
  const insights: Insight[] = [];
  const currentHours = currentShifts.reduce((sum, row) => sum + Number(row.hours_worked), 0);
  const previousHours = previousShifts.reduce((sum, row) => sum + Number(row.hours_worked), 0);
  const currentTotal = currentShifts.reduce((sum, row) => sum + Number(row.amount_due), 0) + currentCosts.reduce((sum, row) => sum + Number(row.amount), 0);
  const previousTotal = previousShifts.reduce((sum, row) => sum + Number(row.amount_due), 0) + previousCosts.reduce((sum, row) => sum + Number(row.amount), 0);
  const hoursChange = pctChange(currentHours, previousHours);
  if (hoursChange !== null && hoursChange > 0.2 && currentHours > 0) insights.push({ id: "personnel-hours-up", priority: "info", category: "Pessoal", title: "Horas trabalhadas aumentaram no período", detail: `As horas registradas somam ${NUMBER.format(currentHours)} h, ${pct(hoursChange)} a mais que o período anterior equivalente (${NUMBER.format(previousHours)} h).` });
  const costChange = pctChange(currentTotal, previousTotal);
  if (costChange !== null && costChange > 0.2 && currentTotal > 0) insights.push({ id: "personnel-cost-up", priority: "attention", category: "Pessoal", title: "Custo de pessoal cresceu bastante no período", detail: `O custo de pessoal foi de ${MONEY.format(previousTotal)} para ${MONEY.format(currentTotal)} (${pct(costChange)}) em relação ao período anterior equivalente.`, impact: MONEY.format(currentTotal - previousTotal) });
  const pessoalPct = netRevenue > 0 ? currentTotal / netRevenue : null;
  if (pessoalPct !== null && pessoalPct > 0.3) insights.push({ id: "personnel-pct-revenue", priority: "attention", category: "Pessoal", title: "Custo de pessoal está pesado em relação ao faturamento", detail: `Pessoal representa ${pct(pessoalPct)} da receita líquida do período.` });
  return insights;
}

function InsightsPage(props: Parameters<typeof SectionContent>[0]) {
  const range = props.range;
  const previousRange = previousEquivalentRange(range);
  const apiHasData = props.data.zig.sync.some((row) => row.status === "completed" && !!row.last_success_at);
  const current = useMemo(() => computeDreSummary(props.data.zig, props.data.catalogItems, props.data.expenses, range, apiHasData, props.data.sales), [props.data.zig, props.data.catalogItems, props.data.expenses, range, apiHasData, props.data.sales]);
  const previous = useMemo(() => computeDreSummary(props.data.previousZig, props.data.catalogItems, props.data.expenses, previousRange, apiHasData, props.data.sales), [props.data.previousZig, props.data.catalogItems, props.data.expenses, previousRange, apiHasData, props.data.sales]);
  const operationalAreas = useMemo(() => props.data.areas.filter((area) => area.is_operational), [props.data.areas]);
  const sectorResults = useMemo(() => computeSectorResults(props.data.sectorProfitability.products, props.data.expenses, range, operationalAreas), [props.data.sectorProfitability, props.data.expenses, range, operationalAreas]);
  const previousSectorResults = useMemo(() => computeSectorResults(props.data.previousSectorProfitability.products, props.data.expenses, previousRange, operationalAreas), [props.data.previousSectorProfitability, props.data.expenses, previousRange, operationalAreas]);

  const [stock, setStock] = useState<StockDashboard>(EMPTY_STOCK);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [personnel, setPersonnel] = useState<{ shifts: PersonnelShiftRow[]; costs: PersonnelCostRow[] }>({ shifts: [], costs: [] });
  const [previousPersonnel, setPreviousPersonnel] = useState<{ shifts: PersonnelShiftRow[]; costs: PersonnelCostRow[] }>({ shifts: [], costs: [] });
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingExtra(true);
      const [stockResult, purchasesResult, personnelResult, previousPersonnelResult] = await Promise.all([
        supabase.rpc("get_virtual_inventory_dashboard", { p_business_id: Number(props.businessId), p_period_start: range.start, p_period_end: range.end }),
        supabase.rpc("get_purchases_dashboard", { p_business_id: Number(props.businessId), p_period_start: range.start, p_period_end: range.end }),
        supabase.rpc("get_personnel_dashboard", { p_business_id: Number(props.businessId), p_period_start: range.start, p_period_end: range.end }),
        supabase.rpc("get_personnel_dashboard", { p_business_id: Number(props.businessId), p_period_start: previousRange.start, p_period_end: previousRange.end }),
      ]);
      if (cancelled) return;
      setStock((stockResult.data as StockDashboard | null) ?? EMPTY_STOCK);
      setPriceHistory(((purchasesResult.data as { price_history?: PriceHistoryPoint[] } | null)?.price_history) ?? []);
      const personnelData = personnelResult.data as { shifts?: PersonnelShiftRow[]; costs?: PersonnelCostRow[] } | null;
      setPersonnel({ shifts: personnelData?.shifts ?? [], costs: personnelData?.costs ?? [] });
      const previousPersonnelData = previousPersonnelResult.data as { shifts?: PersonnelShiftRow[]; costs?: PersonnelCostRow[] } | null;
      setPreviousPersonnel({ shifts: previousPersonnelData?.shifts ?? [], costs: previousPersonnelData?.costs ?? [] });
      setLoadingExtra(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [props.businessId, range.start, range.end, previousRange.start, previousRange.end]);

  const insights = useMemo(() => {
    const rows = [
      ...buildFinancialInsights(current, previous, sectorResults, previousSectorResults),
      ...buildProductInsights(props.data.sectorProfitability.products, props.data.previousSectorProfitability.products),
      ...buildStockInsights(stock),
      ...buildPurchaseInsights(priceHistory),
      ...buildPersonnelInsights(personnel.shifts, personnel.costs, previousPersonnel.shifts, previousPersonnel.costs, current.netRevenue),
    ];
    return sortInsights(rows);
  }, [current, previous, sectorResults, previousSectorResults, props.data.sectorProfitability, props.data.previousSectorProfitability, stock, priceHistory, personnel, previousPersonnel]);

  const grouped = (["critical", "attention", "opportunity", "info"] as const).map((priority) => ({ priority, rows: insights.filter((row) => row.priority === priority) })).filter((group) => group.rows.length > 0);
  const periodLabel = `${dateLabel(range.start)} a ${dateLabel(range.end)}`;

  return <section className="insights-page">
    <ModuleHero eyebrow="Inteligência gerencial" title="O que revisar hoje" description="O ERP cruza vendas, CMV, pessoal, estoque, compras e despesas já cadastrados para apontar automaticamente o que merece atenção." icon={<Sparkles size={19} />} action="Atualizar" onAction={() => props.onRefresh()} />
    <p className="dre-source-note"><CheckCircle2 size={15} />{periodLabel} · {insights.length} insight(s) encontrados{loadingExtra ? " · carregando estoque, compras e pessoal..." : ""}</p>
    {insights.length ? <div className="insights-groups">
      {grouped.map((group) => <div className={`insights-group priority-${group.priority}`} key={group.priority}>
        <div className="insights-group-head"><span className={`insight-priority-dot ${group.priority}`} /><strong>{PRIORITY_LABEL[group.priority]}</strong><small>{group.rows.length}</small></div>
        <div className="insights-list">{group.rows.map((row) => <article className="insight-card" key={row.id}><div className="insight-card-head"><span className="insight-category">{row.category}</span>{row.impact && <span className="insight-impact">{row.impact}</span>}</div><h3>{row.title}</h3><p>{row.detail}</p></article>)}</div>
      </div>)}
    </div> : <EmptyMini text="Nenhum ponto de atenção identificado com os dados atuais do período." />}
  </section>;
}

function AttentionPanel({ data, range }: { data: DataState; range: DateRange }) {
  const previousRange = previousEquivalentRange(range);
  const apiHasData = data.zig.sync.some((row) => row.status === "completed" && !!row.last_success_at);
  const current = useMemo(() => computeDreSummary(data.zig, data.catalogItems, data.expenses, range, apiHasData, data.sales), [data.zig, data.catalogItems, data.expenses, range, apiHasData, data.sales]);
  const previous = useMemo(() => computeDreSummary(data.previousZig, data.catalogItems, data.expenses, previousRange, apiHasData, data.sales), [data.previousZig, data.catalogItems, data.expenses, previousRange, apiHasData, data.sales]);
  const operationalAreas = useMemo(() => data.areas.filter((area) => area.is_operational), [data.areas]);
  const sectorResults = useMemo(() => computeSectorResults(data.sectorProfitability.products, data.expenses, range, operationalAreas), [data.sectorProfitability, data.expenses, range, operationalAreas]);
  const previousSectorResults = useMemo(() => computeSectorResults(data.previousSectorProfitability.products, data.expenses, previousRange, operationalAreas), [data.previousSectorProfitability, data.expenses, previousRange, operationalAreas]);
  const insights = useMemo(() => sortInsights([
    ...buildFinancialInsights(current, previous, sectorResults, previousSectorResults),
    ...buildProductInsights(data.sectorProfitability.products, data.previousSectorProfitability.products),
  ]).filter((row) => row.priority === "critical" || row.priority === "attention" || row.priority === "opportunity").slice(0, 4), [current, previous, sectorResults, previousSectorResults, data.sectorProfitability, data.previousSectorProfitability]);
  if (!insights.length) return null;
  return <article className="chart-card attention-panel"><div className="card-title-row"><div><p>Inteligência gerencial</p><h3>O que precisa da sua atenção</h3></div></div>
    <div className="attention-list">{insights.map((row) => <div className={`attention-row priority-${row.priority}`} key={row.id}><span className={`insight-priority-dot ${row.priority}`} /><div><strong>{row.title}</strong><small>{row.detail}</small></div></div>)}</div>
  </article>;
}

function SalesPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const [productSort, setProductSort] = useState<"revenue" | "quantity" | "lowest">("revenue");
  const apiHasData = props.data.zig.sync.some((row) => row.status === "completed" && !!row.last_success_at);
  const gross = apiHasData ? Number(props.data.zig.summary.gross_cents) / 100 : props.sales.reduce((sum, sale) => sum + Number(sale.gross_amount), 0);
  const discounts = apiHasData ? Number(props.data.zig.summary.discount_cents) / 100 : props.sales.reduce((sum, sale) => sum + Number(sale.discount_amount), 0);
  const revenue = apiHasData ? Number(props.data.zig.summary.net_cents) / 100 : props.sales.reduce((sum, sale) => sum + Number(sale.revenue_amount ?? sale.closing_net_amount ?? sale.gross_amount), 0);
  const quantity = apiHasData ? Number(props.data.zig.summary.quantity) : props.saleItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const transactionCount = apiHasData ? Number(props.data.zig.summary.transaction_count) : null;
  const averageTicket = transactionCount && transactionCount > 0 ? revenue / transactionCount : null;
  const averageDailyRevenue = revenue / rangeDays(props.range);
  const grouped = useMemo(() => {
    if (apiHasData) return props.data.zig.products.map((row) => ({ name: row.name, category: row.category || "Sem categoria", area: row.area || "Geral", quantity: Number(row.quantity), gross: Number(row.gross_cents) / 100, discount: Number(row.discount_cents) / 100, net: Number(row.net_cents) / 100 })).sort((a, b) => b.net - a.net);
    const map = new Map<string, { name: string; category: string; area: string; quantity: number; gross: number; discount: number; net: number }>();
    for (const row of props.saleItems) {
      const item = nested(row.items); const category = nested(item?.categories)?.name ?? "Sem categoria"; const area = nested(row.areas)?.name ?? "Geral"; const name = item?.name ?? "Produto";
      const key = `${name}|${area}`; const current = map.get(key) ?? { name, category, area, quantity: 0, gross: 0, discount: 0, net: 0 };
      current.quantity += Number(row.quantity); current.gross += Number(row.gross_amount); current.discount += Number(row.discount_amount); current.net += Number(row.gross_amount) - Number(row.discount_amount); map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.net - a.net);
  }, [apiHasData, props.data.zig.products, props.saleItems]);
  const dailyRevenue = useMemo(() => {
    const values = new Map<string, { revenue: number; transactions: number | null }>();
    if (apiHasData) props.data.zig.daily.forEach((row) => values.set(row.operational_date, { revenue: Number(row.net_cents) / 100, transactions: Number(row.transaction_count) }));
    else props.sales.forEach((sale) => { const current = values.get(sale.business_date) ?? { revenue: 0, transactions: null }; current.revenue += Number(sale.revenue_amount ?? sale.closing_net_amount ?? sale.gross_amount); values.set(sale.business_date, current); });
    return datesInRange(props.range).map((date) => ({ date, revenue: values.get(date)?.revenue ?? 0, transactions: values.get(date)?.transactions ?? null }));
  }, [apiHasData, props.data.zig.daily, props.range, props.sales]);
  const sellingDays = dailyRevenue.filter((row) => row.revenue > 0);
  const bestDay = sellingDays.reduce<(typeof sellingDays)[number] | null>((best, row) => !best || row.revenue > best.revenue ? row : best, null);
  const worstDay = sellingDays.reduce<(typeof sellingDays)[number] | null>((worst, row) => !worst || row.revenue < worst.revenue ? row : worst, null);
  const areas = useMemo(() => {
    const values = new Map<string, { area: string; revenue: number; quantity: number }>();
    grouped.forEach((row) => { const current = values.get(row.area) ?? { area: row.area, revenue: 0, quantity: 0 }; current.revenue += row.net; current.quantity += row.quantity; values.set(row.area, current); });
    return [...values.values()].sort((a, b) => b.revenue - a.revenue);
  }, [grouped]);
  const topByRevenue = [...grouped].sort((a, b) => b.net - a.net).slice(0, 5);
  const topByQuantity = [...grouped].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const leastSold = grouped.filter((row) => row.quantity > 0).sort((a, b) => a.quantity - b.quantity || a.net - b.net).slice(0, 5);
  const filteredProducts = grouped.filter((row) => `${row.name} ${row.category} ${row.area}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => productSort === "quantity" ? b.quantity - a.quantity : productSort === "lowest" ? a.quantity - b.quantity || a.net - b.net : b.net - a.net);
  const apiPayments = props.data.zig.payments.map((row, index) => ({ id: `zig-${index}`, import_id: "zig", payment_method: row.payment_name, amount: Number(row.value_cents) / 100, percentage: null }));
  return <section className="sales-page"><ModuleHero eyebrow="Resultados" title="Vendas e faturamento" description={apiHasData ? "Visão gerencial das vendas reais sincronizadas da Zig; estornos são excluídos." : "Sem dados da API neste período; exibindo o relatório disponível quando houver."} icon={<ShoppingCart size={19} />} />
    {!apiHasData && props.sales.length > 0 && <div className="sales-data-note"><TriangleAlert size={15} /><span>O relatório importado não informa a quantidade de transações. Ticket médio e vendas aparecem como indisponíveis até a sincronização da Zig.</span></div>}
    <div className="sales-kpi-grid"><SalesKpi label="Faturamento líquido" value={MONEY.format(revenue)} note="Vendas após descontos" tone="green" /><SalesKpi label="Faturamento bruto" value={MONEY.format(gross)} note="Antes dos descontos" /><SalesKpi label="Itens vendidos" value={NUMBER.format(quantity)} note={`${grouped.length} produto(s) no período`} /><SalesKpi label="Vendas / transações" value={transactionCount === null ? "—" : NUMBER.format(transactionCount)} note={apiHasData ? "Transações válidas da Zig" : "Dado indisponível"} /><SalesKpi label="Ticket médio" value={averageTicket === null ? "—" : MONEY.format(averageTicket)} note="Faturamento líquido por venda" tone="purple" /><SalesKpi label="Total de descontos" value={MONEY.format(discounts)} note={gross > 0 ? `${NUMBER.format(discounts / gross * 100)}% do faturamento bruto` : "Sem faturamento bruto"} tone="yellow" /><SalesKpi label="Média por dia" value={MONEY.format(averageDailyRevenue)} note={`${rangeDays(props.range)} dia(s) selecionado(s)`} /><SalesKpi label="Dias com venda" value={NUMBER.format(sellingDays.length)} note={`de ${rangeDays(props.range)} dia(s) no período`} /></div>

    <div className="sales-evolution-grid"><article className="chart-card sales-trend-card"><div className="card-title-row"><div><p>Evolução</p><h3>Faturamento ao longo dos dias</h3></div><span>{dateLabel(props.range.start)} a {dateLabel(props.range.end)}</span></div><SalesTrendChart rows={dailyRevenue} /></article><div className="sales-day-insights"><SalesDayInsight label="Melhor dia" row={bestDay} tone="best" /><SalesDayInsight label="Pior dia com venda" row={worstDay} tone="worst" /></div></div>

    <section className="sales-analysis-section"><div className="sales-section-heading"><div><p>Operação</p><h3>Faturamento por área do bar</h3><span>Participação e volume vendido por setor responsável.</span></div><strong>{areas.length} área(s)</strong></div>{areas.length ? <div className="area-sales-grid">{areas.map((area) => <AreaSalesCard key={area.area} row={area} totalRevenue={revenue} />)}</div> : <EmptyMini text="A integração não retornou áreas para este período." />}</section>

    <div className="sales-rankings-grid"><article className="chart-card"><div className="card-title-row"><div><p>Quantidade</p><h3>Produtos mais vendidos</h3></div></div><ProductRanking rows={topByQuantity} metric="quantity" /></article><article className="chart-card"><div className="card-title-row"><div><p>Faturamento</p><h3>Produtos que mais faturaram</h3></div></div><ProductRanking rows={topByRevenue} metric="revenue" /></article><article className="chart-card"><div className="card-title-row"><div><p>Baixo giro</p><h3>Produtos menos vendidos</h3></div></div><ProductRanking rows={leastSold} metric="quantity" /></article></div>

    <div className="sales-layout payment-analysis"><article className="chart-card"><div className="card-title-row"><div><p>Recebimentos</p><h3>Formas de pagamento</h3></div><span>{apiHasData ? "API Zig" : "Relatório"}</span></div><PaymentBars payments={apiHasData ? apiPayments : props.data.payments} sales={apiHasData ? [{ import_id: "zig" } as Sale] : props.sales} /></article><article className="chart-card payment-summary-card"><div className="card-title-row"><div><p>Conferência</p><h3>Resumo dos recebimentos</h3></div></div><PaymentSummary payments={apiHasData ? apiPayments : props.data.payments} sales={apiHasData ? [{ import_id: "zig" } as Sale] : props.sales} salesRevenue={revenue} /></article></div>

    <div className="sales-products-header"><div><p>Detalhamento</p><h3>Todos os produtos vendidos</h3></div><div className="sales-sort-tabs" role="tablist" aria-label="Ordenar produtos"><button type="button" role="tab" aria-selected={productSort === "revenue"} className={productSort === "revenue" ? "active" : ""} onClick={() => setProductSort("revenue")}>Maior faturamento</button><button type="button" role="tab" aria-selected={productSort === "quantity"} className={productSort === "quantity" ? "active" : ""} onClick={() => setProductSort("quantity")}>Mais vendidos</button><button type="button" role="tab" aria-selected={productSort === "lowest"} className={productSort === "lowest" ? "active" : ""} onClick={() => setProductSort("lowest")}>Menos vendidos</button></div></div>
    <div className="module-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, categoria ou área" /></label><span className="table-count">{filteredProducts.length} produto(s)</span></div>
    <div className="data-table-card"><div className="responsive-table sales-table"><div className="table-row table-header"><span>Produto</span><span>Categoria</span><span>Área</span><span>Quantidade</span><span>Descontos</span><span>Faturamento</span><span>Participação</span></div>{filteredProducts.length ? filteredProducts.map((row) => <div className="table-row" key={`${row.name}-${row.area}`}><strong>{row.name}</strong><span>{row.category}</span><span>{row.area}</span><span>{NUMBER.format(row.quantity)}</span><span>{MONEY.format(row.discount)}</span><strong>{MONEY.format(row.net)}</strong><span>{revenue > 0 ? `${NUMBER.format(row.net / revenue * 100)}%` : "—"}</span></div>) : <EmptyMini text="Nenhum produto encontrado no período." />}</div></div>
    <button className="spreadsheet-fallback" onClick={() => setShowImport(true)}><FileSpreadsheet size={15} /> Importar planilhas como contingência</button>
    {showImport && <ImportModal businessId={props.businessId} onClose={() => setShowImport(false)} onImported={async () => { await props.onRefresh(); setShowImport(false); }} />}
  </section>;
}

function CmvPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const automaticRows = automaticCmvRows(props.data.zig, props.data.catalogItems);
  const sourceRows: AutomaticCmvRow[] = automaticRows.length ? automaticRows : props.profitabilityItems.map((row) => ({ id: `report-${row.id}`, itemId: "", name: row.source_product_name, sku: row.source_sku, category: row.source_category ?? "Sem categoria", quantity: Number(row.quantity), revenue: Number(row.gross_amount), knownRevenue: row.cost_status === "known" ? Number(row.gross_amount) : 0, unitCost: row.unit_cost === null ? null : Number(row.unit_cost), totalCost: row.total_cost === null ? null : Number(row.total_cost), margin: row.cost_status === "known" ? Number(row.margin_percentage) : null, cmv: row.cost_status === "known" ? Number(row.cmv_percentage) : null, costStatus: row.cost_status }));
  const rows = sourceRows.filter((row) => `${row.name} ${row.sku ?? ""} ${row.category}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.revenue - a.revenue);
  const gross = sourceRows.reduce((sum, row) => sum + row.revenue, 0);
  const knownCost = sourceRows.reduce((sum, row) => sum + Number(row.totalCost ?? 0), 0);
  const knownRevenue = sourceRows.reduce((sum, row) => sum + row.knownRevenue, 0);
  const missingRevenue = Math.max(0, gross - knownRevenue);
  const coverage = gross > 0 ? knownRevenue / gross : 0;
  const knownMargin = knownRevenue > 0 ? (knownRevenue - knownCost) / knownRevenue : 0;
  const missingCount = sourceRows.filter((row) => row.costStatus !== "known").length;
  let abcCumulative = 0;
  const salesAbc = [...sourceRows].sort((a, b) => b.revenue - a.revenue).map((row) => { const previous = abcCumulative; abcCumulative += gross > 0 ? row.revenue / gross : 0; return { classification: (previous < .8 ? "A" : previous < .95 ? "B" : "C") as "A" | "B" | "C", total_value: row.revenue }; });

  return <section><ModuleHero eyebrow="Rentabilidade" title="CMV e margem de lucro" description={automaticRows.length ? "Calculado automaticamente sobre as vendas sincronizadas e os custos do cadastro central." : "Exibindo o relatório de CMV disponível; sincronize vendas para automatizar o cálculo."} action="Revisar custos" icon={<CircleDollarSign size={19} />} onAction={() => props.setSection("cadastros")} />
    <div className="section-kpis"><MiniKpi label="Receita analisada" value={MONEY.format(gross)} /><MiniKpi label="CMV conhecido" value={MONEY.format(knownCost)} /><MiniKpi label="Margem conhecida" value={knownRevenue ? `${NUMBER.format(knownMargin * 100)}%` : "—"} /><MiniKpi label="Cobertura de custos" value={`${NUMBER.format(coverage * 100)}%`} /></div>
    {missingCount > 0 && <div className="data-warning"><TriangleAlert size={14} /><span><strong>{missingCount} produto(s)</strong> sem custo confiável · {MONEY.format(missingRevenue)} da receita fora do CMV conhecido</span></div>}
    <div className="cmv-layout"><article className="chart-card"><div className="card-title-row"><div><p>Cobertura</p><h3>Faturamento com custo</h3></div><strong>{NUMBER.format(coverage * 100)}%</strong></div><CoverageBar known={knownRevenue} missing={missingRevenue} /></article><article className="chart-card"><div className="card-title-row"><div><p>Curva ABC de vendas</p><h3>Importância no faturamento</h3></div><span>{automaticRows.length ? "Período selecionado" : "Relatório importado"}</span></div><p className="abc-help">A concentra os produtos que formam cerca de 80% da receita; B vai até 95%; C reúne os demais.</p><AbcSummary rows={automaticRows.length ? salesAbc : props.data.abcItems} /></article></div>
    <div className="module-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU ou categoria" /></label><span className="table-count">{rows.length} linha(s)</span></div>
    <div className="data-table-card"><div className="responsive-table cmv-table"><div className="table-row table-header"><span>Produto</span><span>Categoria</span><span>Receita</span><span>Custo unit.</span><span>CMV</span><span>Margem</span><span>Status</span></div>{rows.length ? rows.map((row) => <div className="table-row" key={row.id}><strong>{row.name}<small className="sku-hint">{row.sku || "Sem SKU"}</small></strong><span>{row.category}</span><strong>{MONEY.format(row.revenue)}</strong><span>{row.unitCost === null ? "—" : MONEY.format(row.unitCost)}</span><span>{row.cmv === null ? "—" : `${NUMBER.format(row.cmv * 100)}%`}</span><span>{row.margin === null ? "—" : `${NUMBER.format(row.margin * 100)}%`}</span><span className={`cost-badge ${row.costStatus === "known" ? "known" : "missing"}`}>{row.costStatus === "known" ? "Histórico aplicado" : row.costStatus === "partial" ? "Custo parcial" : "Sem custo"}</span></div>) : <EmptyMini text="Sincronize as vendas ou importe um relatório de CMV para liberar a rentabilidade." />}</div></div>
    <button className="spreadsheet-fallback" onClick={() => setShowImport(true)}><FileSpreadsheet size={15} /> Importar CMV / ABC como complemento</button>
    {showImport && <AnalyticsImportModal businessId={props.businessId} onClose={() => setShowImport(false)} onImported={async () => { await props.onRefresh(); setShowImport(false); }} />}
  </section>;
}

type SectorSummary = { name: string; revenue: number; share: number; quantity: number; knownRevenue: number; missingRevenue: number; cmv: number; grossProfit: number; grossMargin: number | null; expenses: number; result: number; resultMargin: number | null; coverage: number; products: SectorProduct[] };

function operationalExpenseAmount(expense: Expense, range: DateRange) {
  const amount = Number(expense.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !!expense.purchase_id || (expense.status !== "pending" && expense.status !== "completed")) return 0;
  if (!expense.is_recurring) return expense.expense_date >= range.start && expense.expense_date <= range.end ? amount : 0;
  const effectiveEnd = expense.recurrence_end && expense.recurrence_end < range.end ? expense.recurrence_end : range.end;
  let cursor = new Date(`${expense.expense_date.slice(0, 7)}-01T12:00:00Z`);
  const rangeMonth = new Date(`${range.start.slice(0, 7)}-01T12:00:00Z`);
  if (cursor < rangeMonth) cursor = rangeMonth;
  let total = 0;
  while (cursor.toISOString().slice(0, 10) <= effectiveEnd) {
    const year = cursor.getUTCFullYear(); const month = cursor.getUTCMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const overlapStart = [range.start, expense.expense_date, monthStart].sort().at(-1)!;
    const overlapEnd = [effectiveEnd, monthEnd].sort()[0];
    if (overlapStart <= overlapEnd) total += amount / Number(monthEnd.slice(8, 10)) * rangeDays({ start: overlapStart, end: overlapEnd });
    cursor = new Date(Date.UTC(year, month, 1, 12));
  }
  return total;
}

function SectorProfitabilityPage(props: Parameters<typeof SectionContent>[0]) {
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [assigningExpense, setAssigningExpense] = useState("");
  const operationalAreas = props.data.areas.filter((area) => area.is_operational);
  const sourceProducts = props.data.sectorProfitability.products;
  const totalRevenue = sourceProducts.reduce((sum, product) => sum + Number(product.revenue_cents) / 100, 0);
  const summaries: SectorSummary[] = operationalAreas.map((area) => {
    const name = area.name;
    const products = sourceProducts.filter((product) => product.sector === name);
    const revenue = products.reduce((sum, product) => sum + Number(product.revenue_cents) / 100, 0);
    const quantity = products.reduce((sum, product) => sum + Number(product.quantity), 0);
    const knownRevenue = products.reduce((sum, product) => sum + Number(product.known_revenue_cents) / 100, 0);
    const cmv = products.reduce((sum, product) => sum + Number(product.known_cmv ?? 0), 0);
    const expenses = props.data.expenses.filter((expense) => operationalAreaName(nested(expense.areas)) === name).reduce((sum, expense) => sum + operationalExpenseAmount(expense, props.range), 0);
    const grossProfit = knownRevenue - cmv;
    const result = grossProfit - expenses;
    return { name, revenue, share: totalRevenue > 0 ? revenue / totalRevenue : 0, quantity, knownRevenue, missingRevenue: Math.max(0, revenue - knownRevenue), cmv, grossProfit, grossMargin: knownRevenue > 0 ? grossProfit / knownRevenue : null, expenses, result, resultMargin: knownRevenue > 0 ? result / knownRevenue : null, coverage: revenue > 0 ? knownRevenue / revenue : 0, products };
  });
  const activeSectors = summaries.filter((sector) => sector.revenue > 0);
  const highestRevenue = activeSectors.length ? activeSectors.reduce((best, row) => row.revenue > best.revenue ? row : best) : null;
  const highestProfit = activeSectors.length ? activeSectors.reduce((best, row) => row.grossProfit > best.grossProfit ? row : best) : null;
  const marginSectors = activeSectors.filter((sector) => sector.resultMargin !== null);
  const highestMargin = marginSectors.length ? marginSectors.reduce((best, row) => Number(row.resultMargin) > Number(best.resultMargin) ? row : best) : null;
  const highestCmv = activeSectors.length ? activeSectors.reduce((best, row) => row.cmv > best.cmv ? row : best) : null;
  const highestOperationalCost = summaries.some((sector) => sector.expenses > 0) ? summaries.reduce((best, row) => row.expenses > best.expenses ? row : best) : null;
  const worstResult = activeSectors.length ? activeSectors.reduce((worst, row) => row.result < worst.result ? row : worst) : null;
  const selected = summaries.find((sector) => sector.name === selectedSector) ?? summaries[0] ?? null;
  const selectedProducts = selected ? [...selected.products].filter((product) => `${product.name} ${product.sku ?? ""} ${product.category ?? ""}`.toLowerCase().includes(productQuery.toLowerCase())).sort((a, b) => Number(b.revenue_cents) - Number(a.revenue_cents)) : [];
  const unassignedProducts = sourceProducts.filter((product) => product.sector === null);
  const unassignedRevenue = unassignedProducts.reduce((sum, product) => sum + Number(product.revenue_cents) / 100, 0);
  const unassignedSources = [...new Set(unassignedProducts.map((product) => product.source_area))];
  const confirmedExpenses = props.expenses.filter((expense) => expense.status === "completed" || expense.status === "pending");
  const unassignedExpenseTotal = props.data.expenses.filter((expense) => operationalAreaName(nested(expense.areas)) === null).reduce((sum, expense) => sum + operationalExpenseAmount(expense, props.range), 0);
  const areaOptions = operationalAreas.map((area) => ({ sector: area.name, area }));
  async function assignExpense(expense: Expense, areaId: string) {
    setAssigningExpense(expense.id);
    const { error } = await supabase.from("expenses").update({ area_id: areaId ? Number(areaId) : null }).eq("id", expense.id).eq("business_id", Number(props.businessId));
    if (error) alert("Não foi possível classificar esta despesa."); else await props.onRefresh();
    setAssigningExpense("");
  }
  return <section className="sector-page"><ModuleHero eyebrow="Gestão por container" title="Rentabilidade por setor" description="Compare quanto cada container vende, quanto tem de custo conhecido e quanto resultado entrega." action="Revisar custos" icon={<CircleDollarSign size={19} />} onAction={() => props.setSection("cadastros")} />
    <p className="sector-source-note"><CheckCircle2 size={15} />Faturamento e itens vêm do container real de cada venda na Zig. CMV usa o custo histórico válido na data. Nenhum valor geral é dividido entre setores.</p>
    <div className="sector-insight-grid"><SectorInsight label="Maior faturamento" sector={highestRevenue} value={highestRevenue ? MONEY.format(highestRevenue.revenue) : "—"} tone="green" /><SectorInsight label="Maior lucro bruto" sector={highestProfit} value={highestProfit ? MONEY.format(highestProfit.grossProfit) : "—"} tone="green" /><SectorInsight label="Maior margem do setor" sector={highestMargin} value={highestMargin?.resultMargin === null || !highestMargin ? "—" : `${NUMBER.format(highestMargin.resultMargin * 100)}%`} tone="yellow" /><SectorInsight label="Maior CMV" sector={highestCmv} value={highestCmv ? MONEY.format(highestCmv.cmv) : "—"} tone="red" /><SectorInsight label="Maior custo operacional" sector={highestOperationalCost} value={highestOperationalCost ? MONEY.format(highestOperationalCost.expenses) : "—"} tone="red" /><SectorInsight label="Pior resultado conhecido" sector={worstResult} value={worstResult ? MONEY.format(worstResult.result) : "—"} tone="red" /></div>
    <div className="sector-card-grid">{summaries.map((sector) => <SectorPerformanceCard key={sector.name} sector={sector} active={selectedSector === sector.name} onSelect={() => setSelectedSector(sector.name)} />)}</div>
    <div className="sector-comparison-grid"><article className="sector-panel"><div className="sector-panel-heading"><div><p>Comparação executiva</p><h3>Faturamento, lucro e resultado</h3></div><div className="sector-legend"><span><i className="sector-revenue-dot" />Faturamento</span><span><i className="sector-profit-dot" />Lucro bruto</span><span><i className="sector-result-dot" />Após despesas</span></div></div><SectorComparisonChart rows={summaries} /></article><article className="sector-panel sector-attention"><div className="sector-panel-heading"><div><p>Leitura gerencial</p><h3>Onde olhar primeiro</h3></div></div><SectorAttentionRow label="Maior pressão de CMV" sector={highestCmv} value={highestCmv?.knownRevenue ? `${NUMBER.format(highestCmv.cmv / highestCmv.knownRevenue * 100)}% da receita conhecida` : "Sem CMV conhecido"} /><SectorAttentionRow label="Maior despesa direta" sector={highestOperationalCost} value={highestOperationalCost ? MONEY.format(highestOperationalCost.expenses) : "Sem despesas atribuídas"} /><SectorAttentionRow label="Menor resultado" sector={worstResult} value={worstResult ? MONEY.format(worstResult.result) : "Sem dados"} /><SectorAttentionRow label="Menor cobertura de custo" sector={activeSectors.length ? activeSectors.reduce((worst, row) => row.coverage < worst.coverage ? row : worst) : null} value={activeSectors.length ? `${NUMBER.format(activeSectors.reduce((worst, row) => row.coverage < worst.coverage ? row : worst).coverage * 100)}% do faturamento` : "Sem dados"} /></article></div>
    <div className="sector-unassigned"><div><span>Faturamento fora dos setores operacionais</span><strong>{unassignedProducts.length ? MONEY.format(unassignedRevenue) : "—"}</strong><small>{unassignedProducts.length ? `${unassignedProducts.length} produto(s) · ${unassignedSources.join(", ")}` : "Nenhuma venda não atribuída"}</small></div><div><span>Despesa ainda não atribuída</span><strong>{unassignedExpenseTotal > 0 ? MONEY.format(unassignedExpenseTotal) : "—"}</strong><small>{unassignedExpenseTotal > 0 ? "Permanece geral até classificação segura" : "Nenhuma despesa geral no período"}</small></div><TriangleAlert size={18} /></div>
    {!operationalAreas.length && <div className="data-warning"><TriangleAlert size={19} /><div><strong>Nenhum setor operacional cadastrado</strong><span>Marque ao menos um setor como operacional em Cadastros → Setores para ver a rentabilidade por setor.</span></div></div>}
    {selected && <section className="sector-detail"><div className="sector-detail-head"><div><p>Detalhamento do container</p><h3>{selected.name}</h3><span>{selected.products.length} produto(s) · cobertura de CMV em {NUMBER.format(selected.coverage * 100)}% do faturamento</span></div><div className="sector-tabs" role="tablist" aria-label="Selecionar setor">{operationalAreas.map((area) => <button type="button" role="tab" aria-selected={selectedSector === area.name} className={selectedSector === area.name ? "active" : ""} key={area.id} onClick={() => setSelectedSector(area.name)}>{area.name}</button>)}</div></div>
      <div className="sector-detail-summary"><div><span>Faturamento</span><strong>{MONEY.format(selected.revenue)}</strong></div><div><span>CMV conhecido</span><strong>{selected.knownRevenue > 0 ? MONEY.format(selected.cmv) : "—"}</strong></div><div><span>Lucro bruto conhecido</span><strong>{selected.knownRevenue > 0 ? MONEY.format(selected.grossProfit) : "—"}</strong></div><div><span>Despesas atribuídas</span><strong>{selected.expenses > 0 ? MONEY.format(selected.expenses) : "—"}</strong></div><div><span>Resultado conhecido</span><strong className={selected.result < 0 ? "negative" : ""}>{selected.knownRevenue > 0 ? MONEY.format(selected.result) : "—"}</strong></div><div><span>Margem do setor</span><strong className={Number(selected.resultMargin) < 0 ? "negative" : ""}>{selected.resultMargin === null ? "—" : `${NUMBER.format(selected.resultMargin * 100)}%`}</strong></div></div>
      {selected.missingRevenue > 0 && <div className="data-warning"><TriangleAlert size={14} /><span><strong>{MONEY.format(selected.missingRevenue)}</strong> do faturamento deste setor ainda não tem CMV confiável e não entra no lucro conhecido.</span></div>}
      <div className="module-toolbar"><label><Search size={16} /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder={`Buscar produto de ${selected.name}`} /></label><span className="table-count">{selectedProducts.length} produto(s)</span></div>
      <div className="data-table-card"><div className="responsive-table sector-products-table"><div className="table-row table-header"><span>Produto</span><span>Quantidade</span><span>Faturamento</span><span>CMV conhecido</span><span>Lucro bruto</span><span>Margem</span></div>{selectedProducts.length ? selectedProducts.map((product) => { const knownRevenue = Number(product.known_revenue_cents) / 100; const cmv = Number(product.known_cmv ?? 0); const profit = knownRevenue - cmv; const margin = knownRevenue > 0 ? profit / knownRevenue : null; return <div className="table-row" key={`${product.source_area}-${product.item_id}-${product.name}`}><strong>{product.name}<small className="sku-hint">{product.category || product.sku || "Sem categoria"}</small></strong><span>{NUMBER.format(Number(product.quantity))}</span><strong>{MONEY.format(Number(product.revenue_cents) / 100)}</strong><span>{knownRevenue > 0 ? MONEY.format(cmv) : "—"}</span><strong>{knownRevenue > 0 ? MONEY.format(profit) : "—"}</strong><span>{margin === null ? <small className="cost-badge missing">Sem custo</small> : `${NUMBER.format(margin * 100)}%`}</span></div>; }) : <EmptyMini text="Nenhum produto deste setor no período selecionado." />}</div></div>
    </section>}
    <section className="sector-expense-assignment"><div className="sector-detail-head"><div><p>Classificação segura</p><h3>Despesas diretamente relacionadas</h3><span>Atribua somente quando a despesa pertencer claramente a um container. Deixe como geral quando houver dúvida.</span></div></div>{confirmedExpenses.length ? <div className="expense-assignment-list">{confirmedExpenses.map((expense) => <div key={expense.id}><span><strong>{expense.description}</strong><small>{expense.category} · {MONEY.format(expense.amount)}</small></span><select aria-label={`Setor da despesa ${expense.description}`} value={expense.area_id ?? ""} disabled={assigningExpense === expense.id} onChange={(event) => assignExpense(expense, event.target.value)}><option value="">Geral / não atribuída</option>{areaOptions.map((option) => <option key={option.sector} value={option.area.id}>{option.sector}</option>)}</select></div>)}</div> : <EmptyMini text="Nenhuma despesa paga ou pendente neste período para classificar." />}</section>
  </section>;
}

function productProfitabilityKey(product: SectorProduct) {
  return product.item_id ? `item:${product.item_id}` : `source:${product.sku ?? ""}:${product.name.trim().toLocaleLowerCase("pt-BR")}`;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ProductProfitabilityPage(props: Parameters<typeof SectionContent>[0]) {
  const [sectorFilter, setSectorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProductSort>("profit_desc");
  const analysis = useMemo(() => {
    const previous = new Map(props.data.previousSectorProfitability.products.map((product) => [productProfitabilityKey(product), product]));
    const totalRevenue = props.data.sectorProfitability.products.reduce((sum, product) => sum + Number(product.revenue_cents) / 100, 0);
    const base = props.data.sectorProfitability.products.map((product) => {
      const quantity = Number(product.quantity);
      const revenue = Number(product.revenue_cents) / 100;
      const costedQuantity = Number(product.costed_quantity);
      const missingQuantity = Number(product.missing_cost_quantity);
      const knownCmv = Number(product.known_cmv ?? 0);
      const costStatus: ProductCostStatus = costedQuantity <= 0 ? "missing" : missingQuantity > 0 ? "partial" : "known";
      const unitCost = costedQuantity > 0 ? knownCmv / costedQuantity : null;
      const cmv = costStatus === "known" ? knownCmv : null;
      const profit = cmv === null ? null : revenue - cmv;
      const prior = previous.get(productProfitabilityKey(product));
      const priorCostedQuantity = Number(prior?.costed_quantity ?? 0);
      const priorUnitCost = priorCostedQuantity > 0 ? Number(prior?.known_cmv ?? 0) / priorCostedQuantity : null;
      return {
        key: productProfitabilityKey(product), itemId: product.item_id, name: product.name, sku: product.sku,
        category: product.category || "Sem categoria", sector: product.sector || "Sem setor", quantity, revenue,
        share: totalRevenue > 0 ? revenue / totalRevenue : 0, costedQuantity, missingQuantity, costStatus, unitCost, knownCmv, cmv,
        profit, unitProfit: profit !== null && quantity > 0 ? profit / quantity : null,
        margin: profit !== null && revenue > 0 ? profit / revenue : null, averagePrice: quantity > 0 ? revenue / quantity : null,
        costChange: unitCost !== null && priorUnitCost !== null && priorUnitCost > 0 ? (unitCost - priorUnitCost) / priorUnitCost : null,
        performance: "unknown" as ProductPerformance,
      } satisfies ProductProfitabilityRow;
    });
    const known = base.filter((row) => row.costStatus === "known" && row.margin !== null);
    const salesCut = median(base.filter((row) => row.quantity > 0).map((row) => row.quantity));
    const revenueCut = median(base.filter((row) => row.revenue > 0).map((row) => row.revenue));
    const knownRevenue = known.reduce((sum, row) => sum + row.revenue, 0);
    const marginCut = knownRevenue > 0 ? known.reduce((sum, row) => sum + Number(row.profit), 0) / knownRevenue : 0;
    const rows = base.map((row) => {
      if (row.margin === null) return row;
      const highSales = row.quantity >= salesCut;
      const highMargin = row.margin >= marginCut;
      const performance: ProductPerformance = highSales ? (highMargin ? "star" : "attention") : (highMargin ? "opportunity" : "low");
      return { ...row, performance };
    });
    return { rows, totalRevenue, salesCut, revenueCut, marginCut };
  }, [props.data.sectorProfitability, props.data.previousSectorProfitability]);

  const categories = useMemo(() => [...new Set(analysis.rows.map((row) => row.category))].sort((a, b) => a.localeCompare(b, "pt-BR")), [analysis.rows]);
  const filtered = analysis.rows.filter((row) => {
    const matchesQuery = `${row.name} ${row.sku ?? ""} ${row.category}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"));
    return matchesQuery && (sectorFilter === "all" || row.sector === sectorFilter) && (categoryFilter === "all" || row.category === categoryFilter);
  });
  const performanceRank: Record<ProductPerformance, number> = { attention: 0, opportunity: 1, star: 2, low: 3, unknown: 4 };
  const rows = [...filtered].sort((a, b) => {
    if (sort === "quantity_desc") return b.quantity - a.quantity;
    if (sort === "revenue_desc") return b.revenue - a.revenue;
    if (sort === "margin_desc") return (b.margin ?? -Infinity) - (a.margin ?? -Infinity);
    if (sort === "margin_asc") return (a.margin ?? Infinity) - (b.margin ?? Infinity);
    if (sort === "cmv_desc") return (b.cmv ?? -Infinity) - (a.cmv ?? -Infinity);
    if (sort === "high_sales_low_profit") return performanceRank[a.performance] - performanceRank[b.performance] || b.quantity - a.quantity;
    if (sort === "low_sales_high_margin") return (a.performance === "opportunity" ? 0 : 1) - (b.performance === "opportunity" ? 0 : 1) || (b.margin ?? -Infinity) - (a.margin ?? -Infinity);
    return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
  });
  const known = analysis.rows.filter((row) => row.profit !== null);
  const bestProfit = known.length ? known.reduce((best, row) => Number(row.profit) > Number(best.profit) ? row : best) : null;
  const attention = analysis.rows.filter((row) => row.performance === "attention").sort((a, b) => b.revenue - a.revenue)[0] ?? null;
  const opportunity = analysis.rows.filter((row) => row.performance === "opportunity").sort((a, b) => Number(b.margin) - Number(a.margin))[0] ?? null;
  const priceReview = known.filter((row) => Number(row.margin) < .2 || (row.performance === "attention" && row.revenue >= analysis.revenueCut)).sort((a, b) => b.revenue - a.revenue)[0] ?? null;
  const alerts = analysis.rows.flatMap((row) => {
    const found: { row: ProductProfitabilityRow; label: string; detail: string; priority: number }[] = [];
    if (row.costStatus === "missing") found.push({ row, label: "Sem custo cadastrado", detail: "Cadastre o custo ou a ficha técnica antes de analisar a margem.", priority: 0 });
    else if (row.costStatus === "partial") found.push({ row, label: "Custo incompleto", detail: `${NUMBER.format(row.missingQuantity)} unidade(s) sem custo no período.`, priority: 0 });
    if (row.costChange !== null && row.costChange >= .1) found.push({ row, label: "Custo aumentou", detail: `${NUMBER.format(row.costChange * 100)}% contra o período anterior.`, priority: 1 });
    if (row.margin !== null && row.margin < .2) found.push({ row, label: "Margem muito baixa", detail: `${NUMBER.format(row.margin * 100)}% de margem bruta.`, priority: 2 });
    if (row.margin !== null && row.revenue >= analysis.revenueCut && row.margin < analysis.marginCut) found.push({ row, label: "Fatura bem, lucra pouco", detail: `${MONEY.format(row.revenue)} faturados com margem abaixo da média.`, priority: 3 });
    return found;
  }).sort((a, b) => a.priority - b.priority || b.row.revenue - a.row.revenue).slice(0, 8);
  const quadrant = (performance: ProductPerformance) => analysis.rows.filter((row) => row.performance === performance).sort((a, b) => b.revenue - a.revenue);

  return <section className="product-profit-page"><ModuleHero eyebrow="Decisão de cardápio" title="Rentabilidade por produto" description="Descubra o que mais vende, o que realmente dá dinheiro e onde preço ou custo precisam de atenção." action="Revisar custos" icon={<PackageSearch size={19} />} onAction={() => props.setSection("cadastros")} />
    <p className="product-profit-source"><CheckCircle2 size={16} />Vendas reais da Zig e custo histórico válido na data de cada venda. Margens incompletas nunca são estimadas.</p>
    <div className="product-decision-grid"><ProductDecisionCard label="Qual mais dá dinheiro?" row={bestProfit} value={bestProfit?.profit === null || !bestProfit ? "Sem dados confiáveis" : MONEY.format(bestProfit.profit)} note={bestProfit ? `${MONEY.format(bestProfit.revenue)} faturados` : "Complete os custos dos produtos"} tone="green" /><ProductDecisionCard label="Vende muito, lucra pouco" row={attention} value={attention?.margin === null || !attention ? "Nenhum identificado" : `${NUMBER.format(attention.margin * 100)}% de margem`} note={attention ? `${NUMBER.format(attention.quantity)} unidades vendidas` : "No período selecionado"} tone="red" /><ProductDecisionCard label="Deveríamos vender mais" row={opportunity} value={opportunity?.margin === null || !opportunity ? "Nenhum identificado" : `${NUMBER.format(opportunity.margin * 100)}% de margem`} note={opportunity ? `Só ${NUMBER.format(opportunity.quantity)} unidades vendidas` : "No período selecionado"} tone="blue" /><ProductDecisionCard label="Pode precisar de preço" row={priceReview} value={priceReview?.margin === null || !priceReview ? "Nenhum identificado" : `${NUMBER.format(priceReview.margin * 100)}% de margem`} note={priceReview ? `${MONEY.format(priceReview.averagePrice ?? 0)} de preço médio` : "No período selecionado"} tone="yellow" /></div>
    <div className="product-analysis-grid"><article className="product-profit-panel"><div className="product-panel-heading"><div><p>Mapa de desempenho</p><h3>Venda × margem</h3></div><span>Corte: {NUMBER.format(analysis.salesCut)} un. · {NUMBER.format(analysis.marginCut * 100)}% margem</span></div><div className="product-quadrant-grid"><ProductQuadrantCard performance="star" title="Produtos estrela" description="Alta venda + alta margem" rows={quadrant("star")} /><ProductQuadrantCard performance="attention" title="Precisam de atenção" description="Alta venda + baixa margem" rows={quadrant("attention")} /><ProductQuadrantCard performance="opportunity" title="Oportunidade" description="Baixa venda + alta margem" rows={quadrant("opportunity")} /><ProductQuadrantCard performance="low" title="Baixo desempenho" description="Baixa venda + baixa margem" rows={quadrant("low")} /></div></article>
      <article className="product-profit-panel product-alert-panel"><div className="product-panel-heading"><div><p>Alertas automáticos</p><h3>O que revisar primeiro</h3></div><TriangleAlert size={19} /></div>{alerts.length ? <div className="product-alert-list">{alerts.map((alert, index) => <div key={`${alert.row.key}-${alert.label}-${index}`}><span className={`product-alert-dot priority-${alert.priority}`} /><div><strong>{alert.row.name}</strong><span>{alert.label}</span><small>{alert.detail}</small></div></div>)}</div> : <EmptyMini text="Nenhum alerta encontrado no período." />}</article></div>
    <div className="module-toolbar product-profit-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU ou categoria" /></label><select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)} aria-label="Filtrar por setor"><option value="all">Todos os setores</option>{props.data.areas.filter((area) => area.is_operational).map((area) => <option key={area.id} value={area.name}>{area.name}</option>)}<option value="Sem setor">Sem setor</option></select><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filtrar por categoria"><option value="all">Todas as categorias</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value as ProductSort)} aria-label="Ordenar produtos"><option value="profit_desc">Maior lucro</option><option value="quantity_desc">Mais vendidos</option><option value="revenue_desc">Maior faturamento</option><option value="margin_desc">Maior margem</option><option value="margin_asc">Menor margem</option><option value="cmv_desc">Maior CMV</option><option value="high_sales_low_profit">Alta venda, baixo lucro</option><option value="low_sales_high_margin">Baixa venda, boa margem</option></select><span className="table-count">{rows.length} produto(s)</span></div>
    <div className="data-table-card"><div className="responsive-table product-profit-table"><div className="table-row table-header"><span>Produto</span><span>Setor</span><span>Qtd.</span><span>Faturamento</span><span>Participação</span><span>Custo unit.</span><span>CMV total</span><span>Lucro bruto</span><span>Lucro/un.</span><span>Margem</span><span>Preço médio</span></div>{rows.length ? rows.map((row) => <ProductProfitabilityTableRow key={row.key} row={row} />) : <EmptyMini text="Nenhum produto encontrado com estes filtros." />}</div></div>
  </section>;
}

function ProductDecisionCard({ label, row, value, note, tone }: { label: string; row: ProductProfitabilityRow | null; value: string; note: string; tone: "green" | "red" | "blue" | "yellow" }) {
  return <article className={`product-decision-card ${tone}`}><span>{label}</span><strong>{row?.name ?? "Sem dados"}</strong><b>{value}</b><small>{note}</small></article>;
}

function ProductQuadrantCard({ performance, title, description, rows }: { performance: ProductPerformance; title: string; description: string; rows: ProductProfitabilityRow[] }) {
  return <article className={`product-quadrant-card ${performance}`}><header><div><strong>{title}</strong><span>{description}</span></div><b>{rows.length}</b></header>{rows.length ? <ul>{rows.slice(0, 3).map((row) => <li key={row.key}><span>{row.name}</span><strong>{row.margin === null ? "—" : `${NUMBER.format(row.margin * 100)}%`}</strong></li>)}</ul> : <small>Nenhum produto nesta faixa.</small>}</article>;
}

function ProductProfitabilityTableRow({ row }: { row: ProductProfitabilityRow }) {
  const performanceLabels: Record<ProductPerformance, string> = { star: "Estrela", attention: "Atenção", opportunity: "Oportunidade", low: "Baixo desempenho", unknown: "Custo incompleto" };
  return <div className="table-row"><strong>{row.name}<small className="sku-hint">{row.category}{row.sku ? ` · ${row.sku}` : ""}</small><small className={`product-performance-badge ${row.performance}`}>{performanceLabels[row.performance]}</small></strong><span>{row.sector}</span><span>{NUMBER.format(row.quantity)}</span><strong>{MONEY.format(row.revenue)}</strong><span>{NUMBER.format(row.share * 100)}%</span><span className="product-cost-cell">{row.unitCost === null ? "—" : MONEY.format(row.unitCost)}{row.costStatus === "partial" && <small>Parcial</small>}</span><span className="product-cost-cell">{row.cmv === null ? row.costStatus === "partial" ? MONEY.format(row.knownCmv) : "—" : MONEY.format(row.cmv)}{row.costStatus !== "known" && <small>{row.costStatus === "partial" ? "Parcial" : "Sem custo"}</small>}</span><strong>{row.profit === null ? "—" : MONEY.format(row.profit)}</strong><span>{row.unitProfit === null ? "—" : MONEY.format(row.unitProfit)}</span><span className={row.margin !== null && row.margin < .2 ? "negative" : ""}>{row.margin === null ? <small className="cost-badge missing">Custo incompleto</small> : `${NUMBER.format(row.margin * 100)}%`}</span><span>{row.averagePrice === null ? "—" : MONEY.format(row.averagePrice)}</span></div>;
}

const STOCK_STATUS_LABELS: Record<StockStatus, string> = { normal: "Normal", low: "Estoque baixo", below_minimum: "Abaixo do mínimo", out: "Sem estoque", divergence: "Divergência", insufficient_data: "Dados insuficientes" };
const STOCK_REASON_LABELS: Record<string, string> = { purchase: "Compra / entrada", other_in: "Outra entrada", sale: "Venda Zig", recipe_consumption: "Consumo por ficha", inventory_correction: "Correção de inventário", breakage: "Quebra", waste: "Desperdício", expiration: "Vencimento", courtesy: "Cortesia", internal_consumption: "Consumo interno", operational_error: "Erro operacional", loss: "Perda", other_out: "Outra saída" };

function StockPage(props: Parameters<typeof SectionContent>[0]) {
  const [tab, setTab] = useState<"stock" | "movements" | "inventories">("stock");
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [category, setCategory] = useState("all");
  const [itemType, setItemType] = useState("all");
  const [status, setStatus] = useState("all");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [minimumItem, setMinimumItem] = useState<StockItem | null>(null);
  const [stock, setStock] = useState<StockDashboard>(props.data.stock);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState("");
  async function reloadStock() {
    setStockLoading(true); setStockError("");
    const { data, error } = await supabase.rpc("get_virtual_inventory_dashboard", { p_business_id: Number(props.businessId), p_period_start: props.range.start, p_period_end: props.range.end });
    if (error) setStockError("Não foi possível carregar o estoque agora. Tente novamente.");
    else setStock((data as StockDashboard | null) ?? EMPTY_STOCK);
    setStockLoading(false);
  }
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStockLoading(true); setStockError("");
      const { data, error } = await supabase.rpc("get_virtual_inventory_dashboard", { p_business_id: Number(props.businessId), p_period_start: props.range.start, p_period_end: props.range.end });
      if (cancelled) return;
      if (error) setStockError("Não foi possível carregar o estoque agora. Tente novamente.");
      else setStock((data as StockDashboard | null) ?? EMPTY_STOCK);
      setStockLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [props.businessId, props.range.start, props.range.end]);
  const sectors = [...new Set(stock.items.map((item) => item.sector))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const categories = [...new Set(stock.items.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const rows = stock.items.filter((item) => {
    const matchQuery = `${item.name} ${item.sku ?? ""} ${item.category}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"));
    return matchQuery && (sector === "all" || item.sector === sector) && (category === "all" || item.category === category) && (itemType === "all" || item.item_type === itemType) && (status === "all" || item.status === status);
  });
  const valueBySector = sectors.map((name) => ({ name, value: stock.items.filter((item) => item.sector === name).reduce((sum, item) => sum + Number(item.stock_value ?? 0), 0) })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const highValue = stock.items.filter((item) => item.stock_value !== null).sort((a, b) => Number(b.stock_value) - Number(a.stock_value)).slice(0, 5);
  const replenishment = stock.items.filter((item) => item.has_baseline && Number(item.suggested_purchase) > 0).sort((a, b) => Number(b.suggested_purchase) - Number(a.suggested_purchase));
  return <section className="stock-page"><ModuleHero eyebrow="Operação e controle" title="Estoque virtual e inventário" description="Acompanhe o saldo teórico, conte o estoque físico e preserve cada diferença no histórico." action="Nova contagem" icon={<Boxes size={19} />} onAction={() => setInventoryOpen(true)} />
    <div className="stock-actions"><button type="button" onClick={() => setMovementOpen(true)}><Plus size={16} /> Registrar entrada ou saída</button><span><CheckCircle2 size={15} />Vendas da Zig e fichas técnicas são baixadas automaticamente, sem duplicar sincronizações.</span></div>
    {stockLoading && <p className="stock-loading"><Clock3 size={15} />Calculando estoque teórico e consumo do período...</p>}
    {stockError && <div className="data-warning"><TriangleAlert size={18} /><div><strong>{stockError}</strong><span>Nenhum saldo foi inventado ou alterado.</span></div><button type="button" onClick={reloadStock}>Tentar novamente</button></div>}
    <div className="stock-kpi-grid"><StockKpi label="Valor do estoque" value={MONEY.format(Number(stock.summary.stock_value))} note={`${stock.summary.insufficient_items} item(ns) aguardam saldo inicial`} tone="green" /><StockKpi label="Abaixo do mínimo" value={String(stock.summary.below_minimum)} note="Itens baixos ou abaixo do limite" tone="yellow" /><StockKpi label="Sem estoque" value={String(stock.summary.out_of_stock)} note="Somente itens com base confiável" tone="red" /><StockKpi label="Com divergência" value={String(stock.summary.divergent_items)} note={MONEY.format(Number(stock.summary.variance_value)) + " no período"} tone="red" /><StockKpi label="Perdas registradas" value={MONEY.format(Number(stock.summary.loss_value))} note="Quebras, desperdícios e perdas" tone="yellow" /><StockKpi label="Possível reposição" value={String(stock.summary.replenishment_items)} note="Estimativa com histórico suficiente" tone="blue" /><StockKpi label="Último inventário" value={stock.summary.last_inventory_at ? new Date(stock.summary.last_inventory_at).toLocaleDateString("pt-BR") : "Ainda não feito"} note="Última conferência física" tone="neutral" /></div>
    {stock.summary.insufficient_items > 0 && <div className="data-warning stock-warning"><TriangleAlert size={18} /><div><strong>{stock.summary.insufficient_items} item(ns) ainda não possuem saldo inicial confiável</strong><span>Registre uma compra/entrada ou faça a primeira contagem física. As vendas já aparecem no consumo, mas o ERP não inventa quanto havia no estoque.</span></div><button type="button" onClick={() => setInventoryOpen(true)}>Fazer inventário</button></div>}
    {stock.missing_recipes.length > 0 && <div className="data-warning"><TriangleAlert size={18} /><div><strong>{stock.missing_recipes.length} produto(s) vendido(s) sem ficha válida</strong><span>O consumo dos ingredientes não foi estimado. Complete as fichas técnicas no cadastro.</span></div></div>}
    <div className="stock-tabs" role="tablist" aria-label="Visões do estoque"><button type="button" role="tab" aria-selected={tab === "stock"} className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}><Boxes size={16} /> Estoque atual</button><button type="button" role="tab" aria-selected={tab === "movements"} className={tab === "movements" ? "active" : ""} onClick={() => setTab("movements")}><Clock3 size={16} /> Movimentações</button><button type="button" role="tab" aria-selected={tab === "inventories"} className={tab === "inventories" ? "active" : ""} onClick={() => setTab("inventories")}><ClipboardList size={16} /> Inventários</button></div>
    {tab === "stock" && <><div className="stock-management-grid"><article className="stock-panel"><div className="stock-panel-head"><div><p>Capital armazenado</p><h3>Valor por setor</h3></div><strong>{MONEY.format(Number(stock.summary.stock_value))}</strong></div>{valueBySector.length ? <div className="stock-sector-values">{valueBySector.map((row) => <div key={row.name}><span>{row.name}</span><i><em style={{ width: `${Math.min(100, row.value / Math.max(valueBySector[0].value, 1) * 100)}%` }} /></i><strong>{MONEY.format(row.value)}</strong></div>)}</div> : <EmptyMini text="O valor aparecerá após uma entrada ou inventário com custo conhecido." />}</article><article className="stock-panel"><div className="stock-panel-head"><div><p>Maior valor parado</p><h3>Itens mais valiosos</h3></div></div>{highValue.length ? <div className="stock-value-ranking">{highValue.map((item, index) => <div key={item.id}><b>{index + 1}</b><span><strong>{item.name}</strong><small>{item.sector}</small></span><em>{MONEY.format(Number(item.stock_value))}</em></div>)}</div> : <EmptyMini text="Nenhum item com saldo e custo confiáveis." />}</article><article className="stock-panel stock-replenishment"><div className="stock-panel-head"><div><p>Recomendação explicável</p><h3>Próxima sexta-feira</h3></div></div>{replenishment.length ? <div className="stock-replenishment-list">{replenishment.slice(0, 5).map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>Média de {item.reference_days} sextas: {NUMBER.format(Number(item.expected_quantity))} {item.unit}</small></span><b>Comprar ~{NUMBER.format(Number(item.suggested_purchase))} {item.unit}</b></div>)}</div> : <EmptyMini text="Ainda não há histórico e saldo suficientes para sugerir compras." />}</article></div>
      <div className="module-toolbar stock-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, ingrediente ou SKU" /></label><select value={sector} onChange={(event) => setSector(event.target.value)} aria-label="Filtrar estoque por setor"><option value="all">Todos os setores</option>{sectors.map((value) => <option key={value}>{value}</option>)}</select><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar estoque por categoria"><option value="all">Todas as categorias</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select value={itemType} onChange={(event) => setItemType(event.target.value)} aria-label="Filtrar por tipo de item"><option value="all">Todos os tipos</option><option value="product">Produtos</option><option value="ingredient">Ingredientes</option><option value="consumable">Consumíveis</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por situação"><option value="all">Todas as situações</option>{Object.entries(STOCK_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><span className="table-count">{rows.length} item(ns)</span></div>
      <div className="data-table-card"><div className="responsive-table stock-current-table"><div className="table-row table-header"><span>Item</span><span>Setor</span><span>Unidade</span><span>Teórico</span><span>Último físico</span><span>Divergência</span><span>Custo unit.</span><span>Valor atual</span><span>Mínimo</span><span>Situação</span></div>{rows.length ? rows.map((item) => <div className="table-row" key={item.id}><strong>{item.name}<small className="sku-hint">{item.category} · {item.item_type === "product" ? "Produto" : item.item_type === "ingredient" ? "Ingrediente" : "Consumível"}</small></strong><span>{item.sector}</span><span>{item.unit}</span><strong>{item.has_baseline ? NUMBER.format(Number(item.theoretical_quantity)) : "—"}</strong><span>{item.physical_quantity === null ? "—" : NUMBER.format(Number(item.physical_quantity))}<small className="stock-date-hint">{item.last_counted_at ? new Date(item.last_counted_at).toLocaleDateString("pt-BR") : "Nunca contado"}</small></span><span className={Number(item.last_variance_quantity) < 0 ? "negative" : ""}>{item.last_variance_quantity === null ? "—" : `${Number(item.last_variance_quantity) > 0 ? "+" : ""}${NUMBER.format(Number(item.last_variance_quantity))}`}{item.variance_value !== null && <small className="stock-date-hint">{MONEY.format(Math.abs(Number(item.variance_value)))}</small>}</span><span>{item.unit_cost === null ? "—" : MONEY.format(Number(item.unit_cost))}</span><strong>{item.stock_value === null ? "—" : MONEY.format(Number(item.stock_value))}</strong><button type="button" className="stock-minimum-button" onClick={() => setMinimumItem(item)}>{NUMBER.format(Number(item.minimum_stock))} <Pencil size={12} /></button><span><small className={`stock-status ${item.status}`}>{STOCK_STATUS_LABELS[item.status]}</small></span></div>) : <EmptyMini text="Nenhum item encontrado com estes filtros." />}</div></div></>}
    {tab === "movements" && <StockMovementHistory rows={stock.movements} />}
    {tab === "inventories" && <StockInventoryHistory rows={stock.inventories} onNew={() => setInventoryOpen(true)} />}
    {inventoryOpen && <InventoryCountModal businessId={props.businessId} items={stock.items} onClose={() => setInventoryOpen(false)} onSaved={async () => { await reloadStock(); setInventoryOpen(false); }} />}
    {movementOpen && <StockMovementModal businessId={props.businessId} items={stock.items} onClose={() => setMovementOpen(false)} onSaved={async () => { await reloadStock(); setMovementOpen(false); }} />}
    {minimumItem && <StockMinimumModal businessId={props.businessId} item={minimumItem} onClose={() => setMinimumItem(null)} onSaved={async () => { await reloadStock(); setMinimumItem(null); }} />}
  </section>;
}

function StockKpi({ label, value, note, tone }: { label: string; value: string; note: string; tone: "green" | "yellow" | "red" | "blue" | "neutral" }) { return <article className={`stock-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }

function StockMovementHistory({ rows }: { rows: StockMovement[] }) { return <section className="stock-history-section"><div className="stock-section-heading"><div><p>Livro permanente</p><h3>Histórico de movimentações</h3><span>Entradas manuais e consumos automáticos do período selecionado.</span></div><b>{rows.length} registro(s)</b></div><div className="data-table-card"><div className="responsive-table stock-movement-table"><div className="table-row table-header"><span>Data</span><span>Item</span><span>Tipo</span><span>Quantidade</span><span>Setor</span><span>Custo</span><span>Origem / motivo</span></div>{rows.length ? rows.map((row) => <div className="table-row" key={row.movement_key}><span>{new Date(row.occurred_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span><strong>{row.name}</strong><span><small className={`movement-type ${Number(row.quantity) > 0 ? "in" : "out"}`}>{STOCK_REASON_LABELS[row.movement_type] ?? row.movement_type}</small></span><strong className={Number(row.quantity) < 0 ? "negative" : ""}>{Number(row.quantity) > 0 ? "+" : ""}{NUMBER.format(Number(row.quantity))} {row.unit}</strong><span>{row.sector}</span><span>{row.unit_cost === null ? "—" : MONEY.format(Number(row.unit_cost))}</span><span>{row.origin}</span></div>) : <EmptyMini text="Nenhuma movimentação no período selecionado." />}</div></div></section>; }

function StockInventoryHistory({ rows, onNew }: { rows: StockInventory[]; onNew: () => void }) { return <section className="stock-history-section"><div className="stock-section-heading"><div><p>Conferência física</p><h3>Inventários concluídos</h3><span>Cada diferença permanece registrada mesmo depois de corrigir o saldo teórico.</span></div><button type="button" onClick={onNew}><Plus size={15} /> Nova contagem</button></div>{rows.length ? <div className="inventory-history-grid">{rows.map((row) => <article key={row.id}><span>{new Date(row.counted_at).toLocaleString("pt-BR")}</span><strong>{row.item_count} item(ns) contados</strong><div><small>Com diferença</small><b>{row.divergent_items}</b></div><div><small>Valor das diferenças</small><b>{MONEY.format(Number(row.variance_value))}</b></div><p>{row.notes || "Sem observações"}</p></article>)}</div> : <div className="stock-empty-action"><ClipboardList size={25} /><h3>Nenhum inventário realizado</h3><p>A primeira contagem cria a base física do estoque sem apagar as vendas já registradas.</p><button type="button" onClick={onNew}>Começar contagem</button></div>}</section>; }

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { useEscapeToClose(onClose); return <div className="modal-backdrop" role="presentation"><div className="modal-card stock-modal" role="dialog" aria-modal="true" aria-label={title}><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Estoque</p><h2>{title}</h2><p className="modal-description">{subtitle}</p>{children}</div></div>; }

function InventoryCountModal({ businessId, items, onClose, onSaved }: { businessId: string; items: StockItem[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [query, setQuery] = useState(""); const [counts, setCounts] = useState<Record<string, string>>({}); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const visible = items.filter((item) => `${item.name} ${item.sku ?? ""} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const filled = Object.entries(counts).filter(([, value]) => value !== "" && Number(value) >= 0);
  async function save() { if (!filled.length) return setError("Informe a quantidade física de pelo menos um item."); setSaving(true); setError(""); const { error: rpcError } = await supabase.rpc("complete_inventory_count", { p_business_id: Number(businessId), p_counted_at: new Date().toISOString(), p_items: filled.map(([item_id, counted_quantity]) => ({ item_id: Number(item_id), counted_quantity: Number(counted_quantity) })), p_notes: notes }); if (rpcError) { setError(rpcError.message || "Não foi possível concluir a contagem."); setSaving(false); return; } await onSaved(); }
  return <ModalShell title="Nova contagem física" subtitle="Informe apenas o que foi realmente encontrado. A diferença será preservada no histórico." onClose={onClose}><div className="inventory-modal-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar item para contar" /><span>{filled.length} preenchido(s)</span></div><div className="inventory-count-list"><div className="inventory-count-header"><span>Item</span><span>Teórico</span><span>Físico encontrado</span></div>{visible.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.unit} · {item.sector}</small></span><b>{item.has_baseline ? NUMBER.format(Number(item.theoretical_quantity)) : "Sem base"}</b><input type="number" min="0" step="0.0001" value={counts[item.id] ?? ""} onChange={(event) => setCounts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={`Quantidade em ${item.unit}`} aria-label={`Quantidade física de ${item.name}`} /></div>)}</div><label className="modal-field"><span>Observações da conferência</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: contagem realizada no fechamento" /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button type="button" className="modal-primary" disabled={saving || !filled.length} onClick={save}>{saving ? "Salvando..." : `Concluir ${filled.length} contagem(ns)`}</button></div></ModalShell>;
}

function StockMovementModal({ businessId, items, onClose, onSaved }: { businessId: string; items: StockItem[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [itemId, setItemId] = useState(items[0]?.id ?? ""); const [reason, setReason] = useState("purchase"); const [quantity, setQuantity] = useState(""); const [unitCost, setUnitCost] = useState(""); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const selected = items.find((item) => item.id === itemId);
  async function save() { if (!itemId || Number(quantity) <= 0) return setError("Escolha o item e informe uma quantidade maior que zero."); setSaving(true); setError(""); const { error: rpcError } = await supabase.rpc("record_stock_movement", { p_business_id: Number(businessId), p_item_id: Number(itemId), p_reason: reason, p_quantity: Number(quantity), p_unit_cost: unitCost === "" ? null : Number(unitCost), p_occurred_at: new Date().toISOString(), p_notes: notes }); if (rpcError) { setError(rpcError.message || "Não foi possível registrar a movimentação."); setSaving(false); return; } await onSaved(); }
  return <ModalShell title="Registrar movimentação" subtitle="Toda entrada, perda ou ajuste fica registrado com data, motivo e usuário responsável." onClose={onClose}><div className="form-grid"><label className="span-2"><span>Item</span><select value={itemId} onChange={(event) => setItemId(event.target.value)}>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label><label><span>Tipo / motivo</span><select value={reason} onChange={(event) => setReason(event.target.value)}><optgroup label="Entradas"><option value="purchase">Compra / entrada</option><option value="other_in">Outra entrada</option></optgroup><optgroup label="Saídas"><option value="breakage">Quebra</option><option value="waste">Desperdício</option><option value="expiration">Vencimento</option><option value="courtesy">Cortesia</option><option value="internal_consumption">Consumo interno</option><option value="operational_error">Erro operacional</option><option value="loss">Perda</option><option value="other_out">Outra saída</option></optgroup></select></label><label><span>Quantidade ({selected?.unit ?? "un"})</span><input type="number" min="0.0001" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>Custo unitário (opcional)</span><input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder={selected?.unit_cost === null ? "Sem custo cadastrado" : MONEY.format(Number(selected?.unit_cost))} /></label><label className="span-2"><span>Observação</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Explique a origem ou o motivo desta movimentação" /></label></div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button type="button" className="modal-primary" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Registrar movimentação"}</button></div></ModalShell>;
}

function StockMinimumModal({ businessId, item, onClose, onSaved }: { businessId: string; item: StockItem; onClose: () => void; onSaved: () => Promise<void> }) { const [value, setValue] = useState(String(item.minimum_stock)); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); async function save() { if (Number(value) < 0) return setError("O estoque mínimo não pode ser negativo."); setSaving(true); const { error: rpcError } = await supabase.rpc("update_item_minimum_stock", { p_business_id: Number(businessId), p_item_id: Number(item.id), p_minimum_stock: Number(value) }); if (rpcError) { setError(rpcError.message); setSaving(false); return; } await onSaved(); } return <ModalShell title="Definir estoque mínimo" subtitle={item.name} onClose={onClose}><label className="modal-field"><span>Quantidade mínima em {item.unit}</span><input type="number" min="0" step="0.0001" value={value} onChange={(event) => setValue(event.target.value)} autoFocus /></label><p className="modal-help">O ERP alertará quando o saldo estiver próximo ou abaixo deste limite.</p>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button type="button" className="modal-primary" disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar mínimo"}</button></div></ModalShell>; }

function CatalogPage(props: Parameters<typeof SectionContent>[0]) {
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [editingIngredient, setEditingIngredient] = useState<CatalogItem | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"products" | "ingredients" | "areas">("products");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "cost" | "recipe">("all");
  const [sectorFilter, setSectorFilter] = useState<"all" | "unassigned" | string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkSector, setBulkSector] = useState<"unassigned" | string>("unassigned");
  const [assigningSector, setAssigningSector] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const operationalAreas = props.data.areas.filter((area) => area.is_operational);
  const currentRecipes = new Map<string, Recipe>();
  props.data.recipes.filter((recipe) => recipe.effective_from <= isoInSaoPaulo()).forEach((recipe) => { if (!currentRecipes.has(String(recipe.product_id))) currentRecipes.set(String(recipe.product_id), recipe); });
  const recipeWithItems = new Set(props.data.recipeItems.map((component) => String(component.recipe_id)));
  function statusOf(item: CatalogItem) {
    const hasCost = Number(item.average_unit_cost ?? item.latest_unit_cost ?? 0) > 0;
    if (item.costing_method === "recipe") {
      const recipe = currentRecipes.get(String(item.id));
      return recipe && recipeWithItems.has(String(recipe.id)) && hasCost ? "ready" : "recipe";
    }
    return hasCost ? "ready" : "cost";
  }
  function productSector(item: CatalogItem) {
    const area = nested(item.areas);
    return area?.is_operational ? item.area_id : null;
  }
  const source = view === "products" ? props.data.catalogItems : props.data.ingredients;
  const rows = source.filter((item) => {
    const matchesQuery = `${item.name} ${item.sku ?? ""} ${nested(item.categories)?.name ?? ""} ${nested(item.areas)?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const sector = productSector(item);
    const matchesSector = view === "ingredients" || sectorFilter === "all" || (sectorFilter === "unassigned" ? sector === null : sector === sectorFilter);
    return matchesQuery && matchesSector && (view === "ingredients" || statusFilter === "all" || statusOf(item) === statusFilter);
  });
  const missingCost = props.data.catalogItems.filter((item) => statusOf(item) === "cost").length;
  const missingRecipe = props.data.catalogItems.filter((item) => statusOf(item) === "recipe").length;
  const linked = props.data.catalogItems.filter((item) => item.zig_product_id).length;
  const missingSector = props.data.catalogItems.filter((item) => productSector(item) === null).length;
  async function assignSector(itemIds: string[], sector: "unassigned" | string) {
    if (!itemIds.length || assigningSector) return;
    const areaId = sector === "unassigned" ? null : sector;
    setAssigningSector(true); setAssignmentMessage("");
    const { error } = await supabase.rpc("assign_products_to_sector", { p_business_id: Number(props.businessId), p_item_ids: itemIds.map(Number), p_area_id: areaId ? Number(areaId) : null });
    if (error) { setAssignmentMessage("Não foi possível salvar o setor. Tente novamente."); setAssigningSector(false); return; }
    await props.onRefresh();
    setSelectedIds(new Set()); setAssignmentMessage(`${itemIds.length} produto(s) classificados com sucesso.`); setAssigningSector(false);
  }
  function toggleSelected(itemId: string, checked: boolean) {
    setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(itemId); else next.delete(itemId); return next; });
  }
  function toggleVisible(checked: boolean) {
    setSelectedIds((current) => { const next = new Set(current); rows.forEach((item) => checked ? next.add(String(item.id)) : next.delete(String(item.id))); return next; });
  }
  return <section><ModuleHero eyebrow="Base central" title="Produtos e fichas técnicas" description="Classifique os produtos reais da Zig por setor e mantenha custos e fichas técnicas no mesmo cadastro." action="Novo ingrediente" icon={<ClipboardList size={22} />} onAction={() => setEditingIngredient("new")} />
    <div className="section-kpis catalog-kpis"><MiniKpi label="Produtos" value={String(props.data.catalogItems.length)} /><MiniKpi label="Ligados à Zig" value={String(linked)} /><MiniKpi label="Sem setor" value={String(missingSector)} /><MiniKpi label="Falta custo" value={String(missingCost)} /><MiniKpi label="Falta ficha" value={String(missingRecipe)} /></div>
    {missingSector > 0 && <div className="data-warning sector-classification-warning"><TriangleAlert size={19} /><div><strong>{missingSector} produto(s) ainda estão sem setor</strong><span>Classifique-os em um setor operacional (Cadastros → Setores) para tornar as análises de vendas, CMV e rentabilidade mais confiáveis.</span></div><button type="button" onClick={() => { setView("products"); setSectorFilter("unassigned"); }}>Ver pendentes</button></div>}
    {(missingCost + missingRecipe) > 0 && <div className="data-warning"><TriangleAlert size={19} /><div><strong>{missingCost + missingRecipe} cadastro(s) precisam de atenção</strong><span>O CMV só usa valores comprovados. Complete o custo ou a ficha técnica para aumentar a cobertura.</span></div></div>}
    <div className="catalog-tabs" role="tablist" aria-label="Tipo de cadastro"><button type="button" role="tab" aria-selected={view === "products"} className={view === "products" ? "active" : ""} onClick={() => setView("products")}><PackageSearch size={16} /> Produtos <span>{props.data.catalogItems.length}</span></button><button type="button" role="tab" aria-selected={view === "ingredients"} className={view === "ingredients" ? "active" : ""} onClick={() => { setView("ingredients"); setSelectedIds(new Set()); }}><Boxes size={16} /> Ingredientes <span>{props.data.ingredients.length}</span></button><button type="button" role="tab" aria-selected={view === "areas"} className={view === "areas" ? "active" : ""} onClick={() => { setView("areas"); setSelectedIds(new Set()); }}><CircleDollarSign size={16} /> Setores</button></div>
    {view === "areas" ? <AreasManager businessId={props.businessId} onAreasChanged={props.onRefresh} /> : <>
    <div className="module-toolbar catalog-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "products" ? "Buscar produto, SKU, categoria ou setor" : "Buscar ingrediente"} /></label>{view === "products" && <><select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value as typeof sectorFilter)} aria-label="Filtrar por setor"><option value="all">Todos os setores</option><option value="unassigned">Sem setor ({missingSector})</option>{operationalAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filtrar por status"><option value="all">Todos os status</option><option value="ready">Prontos</option><option value="cost">Falta custo</option><option value="recipe">Falta ficha técnica</option></select></>}<span className="table-count">{rows.length} cadastro(s)</span></div>
    {view === "products" && selectedIds.size > 0 && <div className="bulk-sector-bar"><div><strong>{selectedIds.size} produto(s) selecionados</strong><span>Escolha um setor para aplicar a todos de uma vez.</span></div><select value={bulkSector} onChange={(event) => setBulkSector(event.target.value as typeof bulkSector)} aria-label="Setor para classificação em massa"><option value="unassigned">Sem setor</option>{operationalAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><button type="button" disabled={assigningSector} onClick={() => assignSector([...selectedIds], bulkSector)}>{assigningSector ? "Salvando..." : "Aplicar setor"}</button><button type="button" className="bulk-clear" onClick={() => setSelectedIds(new Set())}>Limpar seleção</button></div>}
    {assignmentMessage && <p className="catalog-assignment-message" role="status">{assignmentMessage}</p>}
    <div className="data-table-card"><div className={`responsive-table catalog-table ${view === "products" ? "catalog-products-table" : "catalog-ingredients-table"}`}>
      {view === "products" ? <><div className="table-row table-header"><label className="catalog-check"><input type="checkbox" checked={rows.length > 0 && rows.every((item) => selectedIds.has(String(item.id)))} onChange={(event) => toggleVisible(event.target.checked)} aria-label="Selecionar todos os produtos visíveis" /></label><span>Produto</span><span>Categoria</span><span>Setor</span><span>Tipo</span><span>Preço</span><span>Custo</span><span>Status</span><span></span></div>{rows.length ? rows.map((item) => { const cost = Number(item.average_unit_cost ?? item.latest_unit_cost ?? 0); const status = statusOf(item); const sector = productSector(item); return <div className="table-row" key={item.id}><label className="catalog-check"><input type="checkbox" checked={selectedIds.has(String(item.id))} onChange={(event) => toggleSelected(String(item.id), event.target.checked)} aria-label={`Selecionar ${item.name}`} /></label><strong>{item.name}<small className="sku-hint">{item.sku || (item.zig_product_id ? "Zig conectada" : "Cadastro manual")}</small></strong><span>{nested(item.categories)?.name ?? "Sem categoria"}</span><select className={`product-sector-select ${sector ? "assigned" : "unassigned"}`} value={sector ?? "unassigned"} disabled={assigningSector} onChange={(event) => assignSector([String(item.id)], event.target.value as "unassigned" | string)} aria-label={`Setor de ${item.name}`}><option value="unassigned">Sem setor</option>{operationalAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><span>{item.costing_method === "recipe" ? "Preparado" : "Simples"}</span><span>{item.sale_price === null ? "—" : MONEY.format(Number(item.sale_price))}</span><strong>{cost > 0 ? MONEY.format(cost) : "—"}</strong><span className={`cost-badge ${status === "ready" ? "known" : "missing"}`}>{status === "ready" ? "Pronto" : status === "recipe" ? "Falta ficha" : "Falta custo"}</span><span className="row-actions"><button onClick={() => setEditing(item)} aria-label={`Editar ${item.name}`}><Pencil size={15} /></button></span></div>; }) : <EmptyMini text="Nenhum produto encontrado." />}</> : <><div className="table-row table-header"><span>Ingrediente</span><span>Categoria</span><span>Unidade</span><span>Uso</span><span>Custo vigente</span><span>Status</span><span></span></div>{rows.length ? rows.map((item) => { const cost = Number(item.average_unit_cost ?? item.latest_unit_cost ?? 0); return <div className="table-row" key={item.id}><strong>{item.name}<small className="sku-hint">{item.sku || "Cadastro manual"}</small></strong><span>{nested(item.categories)?.name ?? "Sem categoria"}</span><span>{item.consumption_unit}</span><span>Por ficha</span><strong>{cost > 0 ? MONEY.format(cost) : "—"}</strong><span className={`cost-badge ${cost > 0 ? "known" : "missing"}`}>{cost > 0 ? "Pronto" : "Falta custo"}</span><span className="row-actions"><button onClick={() => setEditingIngredient(item)} aria-label={`Editar ${item.name}`}><Pencil size={15} /></button></span></div>; }) : <EmptyMini text="Nenhum ingrediente cadastrado. Use “Novo ingrediente” para começar uma ficha técnica." />}</>}
    </div></div>
    </>}
    {editing && <ProductEditorModal businessId={props.businessId} item={editing} data={props.data} onClose={() => setEditing(null)} onRefresh={props.onRefresh} />}
    {editingIngredient && <IngredientModal businessId={props.businessId} item={editingIngredient === "new" ? null : editingIngredient} onClose={() => setEditingIngredient(null)} onSaved={async () => { await props.onRefresh(); setEditingIngredient(null); }} />}
  </section>;
}

type FullArea = { id: string; name: string; slug: string; is_active: boolean; is_operational: boolean; sort_order: number };

function slugify(value: string) {
  return value
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "setor";
}

function AreasManager({ businessId, onAreasChanged }: { businessId: string; onAreasChanged: () => Promise<void> }) {
  const [areas, setAreas] = useState<FullArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [newOperational, setNewOperational] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("areas").select("id,name,slug,is_active,is_operational,sort_order").eq("business_id", businessId).order("sort_order").order("name");
    setAreas((data ?? []) as FullArea[]);
    setLoading(false);
  }
  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      setLoading(true);
      const { data } = await supabase.from("areas").select("id,name,slug,is_active,is_operational,sort_order").eq("business_id", businessId).order("sort_order").order("name");
      if (cancelled) return;
      setAreas((data ?? []) as FullArea[]);
      setLoading(false);
    }
    void initialLoad();
    return () => { cancelled = true; };
  }, [businessId]);

  async function addArea(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const name = newName.trim();
    if (!name) return setError("Informe um nome para o setor.");
    if (saving) return;
    setSaving(true);
    try {
      const nextSortOrder = areas.reduce((max, area) => Math.max(max, area.sort_order), 0) + 1;
      const baseSlug = slugify(name);
      let slug = baseSlug;
      let attempt = 0;
      for (;;) {
        const { error: insertError } = await supabase.from("areas").insert({ business_id: Number(businessId), name, slug, sort_order: nextSortOrder, is_operational: newOperational });
        if (!insertError) break;
        attempt += 1;
        if (insertError.code === "23505" && attempt < 5) { slug = `${baseSlug}-${attempt}`; continue; }
        setError(`Não foi possível adicionar o setor: ${insertError.message}`);
        return;
      }
      setNewName("");
      setNewOperational(false);
      await load();
      await onAreasChanged();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Erro inesperado.";
      setError(`Não foi possível adicionar o setor: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(area: FullArea) {
    setError("");
    const { error: updateError } = await supabase.from("areas").update({ is_active: !area.is_active }).eq("id", area.id).eq("business_id", businessId);
    if (updateError) return setError(`Não foi possível atualizar o setor: ${updateError.message}`);
    await load(); await onAreasChanged();
  }

  async function toggleOperational(area: FullArea) {
    setError("");
    const { error: updateError } = await supabase.from("areas").update({ is_operational: !area.is_operational }).eq("id", area.id).eq("business_id", businessId);
    if (updateError) return setError(`Não foi possível atualizar o setor: ${updateError.message}`);
    await load(); await onAreasChanged();
  }

  function startEdit(area: FullArea) { setEditingId(area.id); setEditingName(area.name); }

  async function saveEdit(area: FullArea) {
    const name = editingName.trim();
    if (!name) return;
    setError("");
    const { error: updateError } = await supabase.from("areas").update({ name }).eq("id", area.id).eq("business_id", businessId);
    if (updateError) return setError(`Não foi possível renomear o setor: ${updateError.message}`);
    setEditingId(null); await load(); await onAreasChanged();
  }

  async function removeArea(area: FullArea) {
    if (area.slug === "geral") return setError(`"${area.name}" é o setor geral padrão do sistema e não pode ser excluído. Desative-o se não quiser usá-lo.`);
    setError("");
    const { data: usageCount, error: usageError } = await supabase.rpc("area_usage_count", { p_business_id: Number(businessId), p_area_id: Number(area.id) });
    if (usageError) return setError(`Não foi possível verificar o uso deste setor: ${usageError.message}`);
    if (Number(usageCount) > 0) return setError(`"${area.name}" já está em uso em ${usageCount} registro(s) (produtos, despesas, pessoal ou outros). Desative-o em vez de excluir para não perder esse vínculo.`);
    if (!confirm(`Excluir o setor "${area.name}"? Esta ação não pode ser desfeita.`)) return;
    const { error: deleteError } = await supabase.from("areas").delete().eq("id", area.id).eq("business_id", businessId);
    if (deleteError) return setError(`Não foi possível excluir o setor: ${deleteError.message}`);
    await load(); await onAreasChanged();
  }

  return <>
    <form className="module-toolbar catalog-toolbar area-toolbar" onSubmit={addArea}>
      <label><ClipboardList size={16} /><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome do novo setor" /></label>
      <label className="check-label area-operational-check"><input type="checkbox" checked={newOperational} onChange={(event) => setNewOperational(event.target.checked)} /><span>Participa da análise de setores?</span></label>
      <button type="submit" className="area-add-button" disabled={saving}>{saving ? "Adicionando..." : "Adicionar setor"}</button>
      <span className="table-count">{areas.length} setor(es)</span>
    </form>
    {error && <p className="catalog-assignment-message" role="status">{error}</p>}
    <div className="data-table-card areas-table-card"><div className="responsive-table areas-table">
      <div className="table-row table-header"><span>Setor</span><span>Tipo</span><span>Status</span><span></span></div>
      {loading ? <div className="empty-mini"><p>Carregando setores...</p></div> : areas.length ? areas.map((area) => (
        <div className="table-row" key={area.id}>
          {editingId === area.id
            ? <span className="area-edit-field"><input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus onKeyDown={(event) => { if (event.key === "Enter") saveEdit(area); if (event.key === "Escape") setEditingId(null); }} /></span>
            : <strong>{area.name}</strong>}
          <span className={`status-badge ${area.is_operational ? "completed" : "draft"}`}>{area.is_operational ? "Operacional" : "Geral"}</span>
          <span className={`status-badge ${area.is_active ? "completed" : "draft"}`}>{area.is_active ? "Ativo" : "Inativo"}</span>
          {editingId === area.id ? (
            <span className="row-actions">
              <button onClick={() => saveEdit(area)} aria-label="Salvar nome"><CheckCircle2 size={15} /></button>
              <button onClick={() => setEditingId(null)} aria-label="Cancelar edição"><X size={15} /></button>
            </span>
          ) : (
            <span className="row-actions area-actions">
              <button onClick={() => setOpenMenuId(openMenuId === area.id ? null : area.id)} aria-label={`Ações de ${area.name}`} aria-haspopup="true" aria-expanded={openMenuId === area.id}><MoreHorizontal size={16} /></button>
              {openMenuId === area.id && <>
                <button type="button" className="area-menu-backdrop" aria-label="Fechar menu" onClick={() => setOpenMenuId(null)} />
                <div className="area-menu" role="menu">
                  <button role="menuitem" onClick={() => { startEdit(area); setOpenMenuId(null); }}><Pencil size={14} /> Renomear</button>
                  <button role="menuitem" onClick={() => { toggleOperational(area); setOpenMenuId(null); }}>{area.is_operational ? <X size={14} /> : <CheckCircle2 size={14} />} {area.is_operational ? "Remover da análise de setores" : "Marcar como operacional"}</button>
                  <button role="menuitem" onClick={() => { toggleActive(area); setOpenMenuId(null); }}>{area.is_active ? <X size={14} /> : <CheckCircle2 size={14} />} {area.is_active ? "Desativar" : "Ativar"}</button>
                  {area.slug !== "geral" && <button role="menuitem" className="danger" onClick={() => { removeArea(area); setOpenMenuId(null); }}><Trash2 size={14} /> Excluir</button>}
                </div>
              </>}
            </span>
          )}
        </div>
      )) : <EmptyMini text="Nenhum setor cadastrado ainda." />}
    </div></div>
  </>;
}

type RecipeDraftItem = { ingredientId: string; quantity: string; waste: string };

function costAt(item: CatalogItem, date: string, history: CostHistory[]) {
  const version = history.find((row) => String(row.item_id) === String(item.id) && row.effective_from <= date);
  return Number(version?.unit_cost ?? item.average_unit_cost ?? item.latest_unit_cost ?? 0);
}

function ProductEditorModal({ businessId, item, data, onClose, onRefresh }: { businessId: string; item: CatalogItem; data: DataState; onClose: () => void; onRefresh: () => Promise<void> }) {
  useEscapeToClose(onClose);
  const today = isoInSaoPaulo();
  const currentRecipe = data.recipes.find((recipe) => String(recipe.product_id) === String(item.id) && recipe.effective_from <= today);
  const currentComponents = currentRecipe ? data.recipeItems.filter((component) => String(component.recipe_id) === String(currentRecipe.id)) : [];
  const [method, setMethod] = useState<"simple" | "recipe">(item.costing_method);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [unitCost, setUnitCost] = useState(item.average_unit_cost === null ? "" : String(item.average_unit_cost));
  const [salePrice, setSalePrice] = useState(item.sale_price === null ? "" : String(item.sale_price));
  const [yieldQuantity, setYieldQuantity] = useState(currentRecipe ? String(currentRecipe.yield_quantity) : "1");
  const [notes, setNotes] = useState(currentRecipe?.notes ?? "");
  const [components, setComponents] = useState<RecipeDraftItem[]>(currentComponents.map((component) => ({ ingredientId: String(component.ingredient_id), quantity: String(component.quantity), waste: String(component.waste_percentage) })));
  const [quickIngredient, setQuickIngredient] = useState({ name: "", unit: "ml", cost: "" });
  const [showQuickIngredient, setShowQuickIngredient] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  function decimal(value: string) { const parsed = Number(value.replace(",", ".")); return value.trim() === "" ? null : parsed; }
  const ingredientMap = new Map(data.ingredients.map((ingredient) => [String(ingredient.id), ingredient]));
  const calculatedRecipeCost = components.reduce((total, component) => { const ingredient = ingredientMap.get(component.ingredientId); const quantity = decimal(component.quantity) ?? 0; const waste = decimal(component.waste) ?? 0; return total + (ingredient ? costAt(ingredient, effectiveFrom, data.costHistory) * quantity * (1 + waste / 100) : 0); }, 0) / Math.max(decimal(yieldQuantity) ?? 1, 1);
  const history = data.costHistory.filter((row) => String(row.item_id) === String(item.id)).slice(0, 6);
  function updateComponent(index: number, patch: Partial<RecipeDraftItem>) { setComponents((current) => current.map((component, componentIndex) => componentIndex === index ? { ...component, ...patch } : component)); }
  function addComponent() { const used = new Set(components.map((component) => component.ingredientId)); const next = data.ingredients.find((ingredient) => !used.has(String(ingredient.id))); if (!next) return setMessage("Cadastre outro ingrediente para adicionar uma nova linha."); setComponents((current) => [...current, { ingredientId: String(next.id), quantity: "", waste: "0" }]); }
  async function createQuickIngredient() {
    const cost = decimal(quickIngredient.cost);
    if (!quickIngredient.name.trim() || !quickIngredient.unit.trim() || cost === null || cost <= 0) return setMessage("Informe o nome, a unidade e um custo maior que zero para o ingrediente.");
    setBusy(true); setMessage("");
    const created = await supabase.from("items").insert({ business_id: Number(businessId), name: quickIngredient.name.trim(), item_type: "ingredient", consumption_unit: quickIngredient.unit.trim(), average_unit_cost: cost, latest_unit_cost: cost }).select("id").single();
    if (created.error || !created.data) { setBusy(false); return setMessage("Não foi possível criar o ingrediente. Verifique se o nome já existe."); }
    const saved = await supabase.rpc("save_item_cost_version", { p_business_id: Number(businessId), p_item_id: Number(created.data.id), p_unit_cost: cost, p_effective_from: effectiveFrom, p_sale_price: null });
    if (saved.error) { setBusy(false); return setMessage("O ingrediente foi criado, mas o histórico de custo não pôde ser salvo. Tente editá-lo na lista de ingredientes."); }
    setComponents((current) => [...current, { ingredientId: String(created.data.id), quantity: "", waste: "0" }]);
    setQuickIngredient({ name: "", unit: "ml", cost: "" }); setShowQuickIngredient(false); await onRefresh(); setBusy(false);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setMessage("");
    const price = decimal(salePrice);
    if (price !== null && (!Number.isFinite(price) || price < 0)) return setMessage("Informe um preço de venda válido.");
    setBusy(true);
    if (method === "simple") {
      const cost = decimal(unitCost);
      if (cost === null || !Number.isFinite(cost) || cost <= 0) { setBusy(false); return setMessage("Informe um custo unitário maior que zero."); }
      const { error } = await supabase.rpc("save_item_cost_version", { p_business_id: Number(businessId), p_item_id: Number(item.id), p_unit_cost: cost, p_effective_from: effectiveFrom, p_sale_price: price });
      if (error) { setBusy(false); return setMessage("Não foi possível salvar o custo. Revise os dados e tente novamente."); }
    } else {
      const yieldValue = decimal(yieldQuantity);
      const payload = components.map((component) => ({ ingredient_id: Number(component.ingredientId), quantity: decimal(component.quantity), waste_percentage: decimal(component.waste) ?? 0 }));
      if (!yieldValue || yieldValue <= 0 || !payload.length || payload.some((component) => !component.ingredient_id || !component.quantity || component.quantity <= 0)) { setBusy(false); return setMessage("Informe o rendimento e a quantidade de todos os ingredientes."); }
      if (new Set(payload.map((component) => component.ingredient_id)).size !== payload.length) { setBusy(false); return setMessage("Remova ingredientes repetidos da ficha técnica."); }
      const { error } = await supabase.rpc("save_product_recipe", { p_business_id: Number(businessId), p_product_id: Number(item.id), p_effective_from: effectiveFrom, p_yield_quantity: yieldValue, p_ingredients: payload, p_notes: notes, p_sale_price: price });
      if (error) { setBusy(false); return setMessage(error.message.includes("custo") ? "Todos os ingredientes precisam ter custo válido na data escolhida." : "Não foi possível salvar a ficha técnica. Revise os ingredientes."); }
    }
    await onRefresh(); setBusy(false); onClose();
  }
  return <div className="modal-backdrop"><form className="modal-card product-editor" role="dialog" aria-modal="true" aria-labelledby={`product-editor-${item.id}`} onSubmit={save}><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Produto e ficha técnica</p><h2 id={`product-editor-${item.id}`}>{item.name}</h2><p className="modal-description">Escolha como o custo deste produto deve ser calculado. As vendas antigas continuarão usando o valor válido em cada data.</p>
    <div className="cost-method-grid"><button type="button" className={method === "simple" ? "active" : ""} onClick={() => setMethod("simple")}><PackageSearch size={20} /><strong>Produto simples</strong><span>Um único custo por unidade, como cerveja ou refrigerante.</span></button><button type="button" className={method === "recipe" ? "active" : ""} onClick={() => setMethod("recipe")}><ChefHat size={20} /><strong>Produto preparado</strong><span>Soma ingredientes, como copões, drinks e porções.</span></button></div>
    <div className="form-grid"><label><span>Aplicar o novo valor a partir de</span><input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label><label><span>Preço de venda</span><input value={salePrice} onChange={(event) => setSalePrice(event.target.value)} inputMode="decimal" placeholder="0,00" /></label></div>
    {method === "simple" ? <div className="simple-cost-panel"><label><span>Custo unitário vigente</span><input value={unitCost} onChange={(event) => setUnitCost(event.target.value)} inputMode="decimal" placeholder="0,00" autoFocus /></label><small>Use hoje para uma mudança normal. Escolha uma data anterior somente para corrigir o histórico.</small></div> : <div className="recipe-editor"><div className="recipe-summary"><div><span>Custo calculado por unidade</span><strong>{MONEY.format(calculatedRecipeCost)}</strong></div><label><span>Rendimento da ficha</span><input value={yieldQuantity} onChange={(event) => setYieldQuantity(event.target.value)} inputMode="decimal" /></label></div><div className="recipe-head"><div><strong>Ingredientes</strong><span>O custo usa a unidade de consumo de cada ingrediente.</span></div><button type="button" onClick={addComponent}><Plus size={15} /> Adicionar</button></div>{components.length ? <div className="recipe-lines">{components.map((component, index) => { const ingredient = ingredientMap.get(component.ingredientId); const subtotal = ingredient ? costAt(ingredient, effectiveFrom, data.costHistory) * (decimal(component.quantity) ?? 0) * (1 + (decimal(component.waste) ?? 0) / 100) : 0; return <div className="recipe-line" key={`${component.ingredientId}-${index}`}><label><span>Ingrediente</span><select value={component.ingredientId} onChange={(event) => updateComponent(index, { ingredientId: event.target.value })}>{data.ingredients.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.consumption_unit}</option>)}</select></label><label><span>Quantidade</span><input value={component.quantity} onChange={(event) => updateComponent(index, { quantity: event.target.value })} inputMode="decimal" placeholder="0" /></label><label><span>Perda %</span><input value={component.waste} onChange={(event) => updateComponent(index, { waste: event.target.value })} inputMode="decimal" /></label><div><span>Subtotal</span><strong>{MONEY.format(subtotal)}</strong></div><button type="button" onClick={() => setComponents((current) => current.filter((_, componentIndex) => componentIndex !== index))} aria-label="Remover ingrediente"><Trash2 size={15} /></button></div>; })}</div> : <div className="recipe-empty"><ChefHat size={25} /><strong>Comece adicionando os ingredientes</strong><span>Exemplo: vodka, energético, gelo, copo e canudo.</span></div>}<button type="button" className="quick-ingredient-toggle" onClick={() => setShowQuickIngredient((current) => !current)}><Plus size={14} /> O ingrediente ainda não existe</button>{showQuickIngredient && <div className="quick-ingredient"><input value={quickIngredient.name} onChange={(event) => setQuickIngredient({ ...quickIngredient, name: event.target.value })} placeholder="Nome do ingrediente" /><select value={quickIngredient.unit} onChange={(event) => setQuickIngredient({ ...quickIngredient, unit: event.target.value })}><option value="ml">ml</option><option value="g">g</option><option value="un">unidade</option><option value="l">litro</option><option value="kg">kg</option></select><input value={quickIngredient.cost} onChange={(event) => setQuickIngredient({ ...quickIngredient, cost: event.target.value })} inputMode="decimal" placeholder="Custo por unidade" /><button type="button" onClick={createQuickIngredient} disabled={busy}>Criar</button></div>}<label className="recipe-notes"><span>Observação da ficha</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: copão de 700 ml" /></label></div>}
    {history.length > 0 && <details className="cost-history"><summary><Clock3 size={15} /> Ver histórico de custos ({history.length})</summary><div>{history.map((version) => <p key={version.id}><span>A partir de {dateLabel(version.effective_from)}<small>{version.source === "recipe" ? "Ficha técnica" : version.source === "import" ? "Valor importado" : "Alteração manual"}</small></span><strong>{MONEY.format(Number(version.unit_cost))}</strong></p>)}</div></details>}
    {message && <p className="modal-message">{message}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button className="modal-primary" disabled={busy}>{busy ? "Salvando..." : method === "recipe" ? "Salvar ficha técnica" : "Salvar custo"}</button></div></form></div>;
}

function IngredientModal({ businessId, item, onClose, onSaved }: { businessId: string; item: CatalogItem | null; onClose: () => void; onSaved: () => Promise<void> }) {
  useEscapeToClose(onClose);
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.consumption_unit ?? "ml");
  const [cost, setCost] = useState(item?.average_unit_cost === null || item?.average_unit_cost === undefined ? "" : String(item.average_unit_cost));
  const [effectiveFrom, setEffectiveFrom] = useState(isoInSaoPaulo());
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); const parsedCost = Number(cost.replace(",", "."));
    if (!name.trim() || !unit.trim() || !Number.isFinite(parsedCost) || parsedCost <= 0) return setMessage("Informe nome, unidade e custo maior que zero.");
    setBusy(true); setMessage(""); let itemId = item?.id;
    if (item) {
      const updated = await supabase.from("items").update({ name: name.trim(), consumption_unit: unit.trim() }).eq("id", item.id).eq("business_id", businessId);
      if (updated.error) { setBusy(false); return setMessage("Não foi possível atualizar o ingrediente."); }
    } else {
      const created = await supabase.from("items").insert({ business_id: Number(businessId), name: name.trim(), item_type: "ingredient", consumption_unit: unit.trim(), average_unit_cost: parsedCost, latest_unit_cost: parsedCost }).select("id").single();
      if (created.error || !created.data) { setBusy(false); return setMessage("Não foi possível criar o ingrediente. Verifique se o nome já existe."); }
      itemId = String(created.data.id);
    }
    const saved = await supabase.rpc("save_item_cost_version", { p_business_id: Number(businessId), p_item_id: Number(itemId), p_unit_cost: parsedCost, p_effective_from: effectiveFrom, p_sale_price: null });
    if (saved.error) { setBusy(false); return setMessage("O cadastro foi salvo, mas o histórico de custo falhou. Tente novamente."); }
    await onSaved();
  }
  return <div className="modal-backdrop"><form className="modal-card ingredient-modal" role="dialog" aria-modal="true" aria-labelledby="ingredient-editor-title" onSubmit={save}><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Ingrediente</p><h2 id="ingredient-editor-title">{item ? `Editar ${item.name}` : "Novo ingrediente"}</h2><p className="modal-description">Cadastre o custo na unidade usada na receita. Exemplo: vodka em ml e limão por unidade.</p><div className="form-grid"><label className="span-2"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Vodka" autoFocus /></label><label><span>Unidade de consumo</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="ml">ml</option><option value="g">g</option><option value="un">unidade</option><option value="l">litro</option><option value="kg">kg</option></select></label><label><span>Custo por {unit}</span><input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" placeholder="0,00" /></label><label className="span-2"><span>Aplicar a partir de</span><input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label></div>{message && <p className="modal-message">{message}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button className="modal-primary" disabled={busy}>{busy ? "Salvando..." : "Salvar ingrediente"}</button></div></form></div>;
}

function PlanningPage(props: Parameters<typeof SectionContent>[0]) {
  const [editing, setEditing] = useState(false);
  const rows = props.data.forecasts.filter((row) => row.period_end >= props.range.start && row.period_start <= props.range.end);
  const plannedRevenue = rows.filter((row) => row.forecast_type === "revenue").reduce((sum, row) => sum + Number(row.amount), 0);
  const plannedExpense = rows.filter((row) => row.forecast_type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const actualRevenue = Number(props.data.zig.summary.revenue_cents) / 100 || props.sales.reduce((sum, row) => sum + Number(row.revenue_amount ?? row.gross_amount), 0);
  const actualExpense = props.expenses.reduce((sum, row) => sum + Number(row.amount), 0);
  async function remove(row: Forecast) { if (!confirm("Excluir esta meta?")) return; const { error } = await supabase.from("forecasts").delete().eq("id", row.id).eq("business_id", props.businessId); if (!error) await props.onRefresh(); }
  return <section><ModuleHero eyebrow="Gestão" title="Planejamento e metas" description="Compare metas financeiras com o realizado sincronizado da Zig e as despesas cadastradas." action="Nova previsão" icon={<CalendarRange size={22} />} onAction={() => setEditing(true)} />
    <div className="section-kpis"><MiniKpi label="Meta de receita" value={MONEY.format(plannedRevenue)} /><MiniKpi label="Receita realizada" value={MONEY.format(actualRevenue)} /><MiniKpi label="Meta de despesas" value={MONEY.format(plannedExpense)} /><MiniKpi label="Despesas realizadas" value={MONEY.format(actualExpense)} /></div>
    <div className="data-table-card planning-card"><div className="responsive-table planning-table"><div className="table-row table-header"><span>Período</span><span>Tipo</span><span>Área</span><span>Meta</span><span>Observação</span><span></span></div>{rows.length ? rows.map((row) => <div className="table-row" key={row.id}><span>{dateLabel(row.period_start)} a {dateLabel(row.period_end)}</span><span className={`cost-badge ${row.forecast_type === "revenue" ? "known" : "missing"}`}>{row.forecast_type === "revenue" ? "Receita" : "Despesa"}</span><span>{nested(row.areas)?.name ?? "Geral"}</span><strong>{MONEY.format(Number(row.amount))}</strong><span>{row.notes || "—"}</span><span className="row-actions"><button onClick={() => remove(row)} aria-label="Excluir meta"><Trash2 size={15} /></button></span></div>) : <EmptyMini text="Nenhuma meta cadastrada para o período selecionado." />}</div></div>
    {editing && <ForecastModal businessId={props.businessId} userId={props.userId} areas={props.data.areas} range={props.range} onClose={() => setEditing(false)} onSaved={async () => { await props.onRefresh(); setEditing(false); }} />}
  </section>;
}

function ForecastModal({ businessId, userId, areas, range, onClose, onSaved }: { businessId: string; userId: string; areas: Area[]; range: DateRange; onClose: () => void; onSaved: () => Promise<void> }) {
  useEscapeToClose(onClose);
  const [form, setForm] = useState({ forecast_type: "revenue" as "revenue" | "expense", period_start: range.start, period_end: range.end, amount: "", area_id: "", notes: "" });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) { event.preventDefault(); const amount = Number(form.amount.replace(",", ".")); if (!Number.isFinite(amount) || amount <= 0 || form.period_start > form.period_end) return setMessage("Informe um período válido e um valor maior que zero."); setBusy(true); const { error } = await supabase.from("forecasts").insert({ business_id: Number(businessId), area_id: form.area_id ? Number(form.area_id) : null, forecast_type: form.forecast_type, period_start: form.period_start, period_end: form.period_end, amount, notes: form.notes.trim() || null, created_by: userId }); if (error) { setMessage("Não foi possível salvar a previsão."); setBusy(false); return; } await onSaved(); }
  return <div className="modal-backdrop"><form className="modal-card expense-modal" onSubmit={save}><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Planejamento</p><h2>Nova previsão</h2><div className="form-grid"><label><span>Tipo</span><select value={form.forecast_type} onChange={(event) => setForm({ ...form, forecast_type: event.target.value as "revenue" | "expense" })}><option value="revenue">Receita</option><option value="expense">Despesa</option></select></label><label><span>Área</span><select value={form.area_id} onChange={(event) => setForm({ ...form, area_id: event.target.value })}><option value="">Geral</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label><span>Início</span><input type="date" value={form.period_start} onChange={(event) => setForm({ ...form, period_start: event.target.value })} /></label><label><span>Fim</span><input type="date" value={form.period_end} onChange={(event) => setForm({ ...form, period_end: event.target.value })} /></label><label className="span-2"><span>Valor previsto</span><input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} inputMode="decimal" placeholder="0,00" /></label><label className="span-2"><span>Observação</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Contexto da meta" /></label></div>{message && <p className="modal-message">{message}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button className="modal-primary" disabled={busy}>{busy ? "Salvando..." : "Salvar previsão"}</button></div></form></div>;
}

const EXPENSE_CATEGORIES = [
  "Mercadorias e fornecedores", "Funcionários/pessoal", "Aluguel", "Energia", "Água", "Internet", "Gás",
  "Marketing", "Manutenção", "Impostos", "Taxas", "Sistemas e assinaturas", "Limpeza", "Segurança", "Outros",
] as const;

type OperationalCostDay = { date: string; booked: number; operational: number };
function operationalCostBreakdown(expenses: Expense[], range: DateRange) {
  const days = datesInRange(range).map((date) => ({ date, booked: 0, operational: 0 }));
  const daily = new Map(days.map((row) => [row.date, row]));
  const categories = new Map<string, number>();
  expenses.filter((expense) => !expense.purchase_id && (expense.status === "pending" || expense.status === "completed")).forEach((expense) => {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (expense.expense_date >= range.start && expense.expense_date <= range.end) {
      const row = daily.get(expense.expense_date);
      if (row) row.booked += amount;
    }
    if (!expense.is_recurring) {
      const row = daily.get(expense.expense_date);
      if (!row) return;
      row.operational += amount;
      categories.set(expense.category, (categories.get(expense.category) ?? 0) + amount);
      return;
    }
    const effectiveEnd = expense.recurrence_end && expense.recurrence_end < range.end ? expense.recurrence_end : range.end;
    let cursor = new Date(`${expense.expense_date.slice(0, 7)}-01T12:00:00Z`);
    const rangeMonth = new Date(`${range.start.slice(0, 7)}-01T12:00:00Z`);
    if (cursor < rangeMonth) cursor = rangeMonth;
    while (cursor.toISOString().slice(0, 10) <= effectiveEnd) {
      const year = cursor.getUTCFullYear(); const month = cursor.getUTCMonth() + 1;
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      const overlapStart = [range.start, expense.expense_date, monthStart].sort().at(-1)!;
      const overlapEnd = [effectiveEnd, monthEnd].sort()[0];
      if (overlapStart <= overlapEnd) {
        const dailyAmount = amount / Number(monthEnd.slice(8, 10));
        datesInRange({ start: overlapStart, end: overlapEnd }).forEach((date) => { const row = daily.get(date); if (row) row.operational += dailyAmount; categories.set(expense.category, (categories.get(expense.category) ?? 0) + dailyAmount); });
      }
      cursor = new Date(Date.UTC(year, month, 1, 12));
    }
  });
  return { days, categories: [...categories].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount) };
}

function ExpensesPage(props: Parameters<typeof SectionContent>[0]) {
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [behaviorFilter, setBehaviorFilter] = useState("all");
  const [recurrenceFilter, setRecurrenceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState("");
  const activeSelectedDay = selectedDay >= props.range.start && selectedDay <= props.range.end ? selectedDay : props.range.end;
  const confirmed = props.expenses.filter((expense) => expense.status === "completed" || expense.status === "pending");
  const operational = operationalCostBreakdown(props.data.expenses, props.range);
  const rows = props.expenses.filter((expense) => {
    const matchesQuery = `${expense.description} ${expense.category} ${expense.payment_method ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (categoryFilter === "all" || expense.category === categoryFilter) && (behaviorFilter === "all" || expense.cost_behavior === behaviorFilter) && (recurrenceFilter === "all" || (recurrenceFilter === "recurring") === expense.is_recurring) && (statusFilter === "all" || expense.status === statusFilter);
  });
  const total = operational.days.reduce((sum, row) => sum + row.operational, 0);
  const paid = confirmed.filter((expense) => expense.status === "completed").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const pending = confirmed.filter((expense) => expense.status === "pending").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const previousRange = previousEquivalentRange(props.range);
  const previousOperational = operationalCostBreakdown(props.data.expenses, previousRange);
  const previousTotal = previousOperational.days.reduce((sum, row) => sum + row.operational, 0);
  const totalChange = previousTotal > 0 ? (total - previousTotal) / previousTotal : null;
  const operationalTotal = operational.days.reduce((sum, row) => sum + row.operational, 0);
  const previousOperationalTotal = previousOperational.days.reduce((sum, row) => sum + row.operational, 0);
  const operationalChange = previousOperationalTotal > 0 ? (operationalTotal - previousOperationalTotal) / previousOperationalTotal : null;
  const selectedCost = operational.days.find((row) => row.date === activeSelectedDay)?.operational ?? null;
  const activeDays = operational.days.filter((row) => row.operational > 0);
  const highestDay = activeDays.length ? [...activeDays].sort((a, b) => b.operational - a.operational)[0] : null;
  const lowestDay = activeDays.length ? [...activeDays].sort((a, b) => a.operational - b.operational)[0] : null;
  const fixed = confirmed.filter((expense) => expense.cost_behavior === "fixed").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const variable = confirmed.filter((expense) => expense.cost_behavior !== "fixed").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const recurring = confirmed.filter((expense) => expense.is_recurring).reduce((sum, expense) => sum + Number(expense.amount), 0);
  const largest = [...confirmed].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 6);
  const availableCategories = [...new Set(props.expenses.map((expense) => expense.category))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const [structuralEdit, setStructuralEdit] = useState<Expense | null>(null);
  async function remove(expense: Expense) {
    if (!confirm(`Excluir a despesa “${expense.description}”?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id).eq("business_id", props.businessId);
    if (error) return alert("Não foi possível excluir a despesa.");
    await props.onRefresh();
  }
  async function removeStructural(expense: Expense) {
    if (!confirm(`Excluir “${expense.description}”? A despesa recorrente vinculada também será removida.`)) return;
    const { error } = await supabase.rpc("delete_structural_cost", { p_business_id: Number(props.businessId), p_id: Number(expense.source_id) });
    if (error) return alert("Não foi possível excluir este custo estrutural.");
    await props.onRefresh();
  }
  async function removePersonnelLinked(expense: Expense) {
    const sourceType = expense.source_type as "work_shift" | "personnel_cost";
    const label = sourceType === "work_shift" ? "jornada" : "custo de pessoal";
    if (!confirm(`Excluir ${label} “${expense.description}”? O lançamento correspondente também será removido.`)) return;
    const table = sourceType === "work_shift" ? "work_shifts" : "personnel_cost_entries";
    const linked = await supabase.from(table).select("payroll_closing_id").eq("id", expense.source_id as string).eq("business_id", props.businessId).maybeSingle();
    if (linked.error) return alert("Não foi possível verificar este lançamento.");
    if (linked.data?.payroll_closing_id) return alert("Este lançamento faz parte de um fechamento de folha. Exclua primeiro o fechamento na aba Pessoal.");
    const removed = await supabase.from(table).delete().eq("id", expense.source_id as string).eq("business_id", props.businessId);
    if (removed.error) return alert("Não foi possível excluir este lançamento.");
    const expenseRemoved = await supabase.from("expenses").delete().eq("business_id", props.businessId).eq("source_type", sourceType).eq("source_id", expense.source_id as string);
    if (expenseRemoved.error) alert("O lançamento foi excluído, mas a despesa correspondente pode não ter sido removida corretamente.");
    await props.onRefresh();
  }
  async function togglePayment(expense: Expense) {
    const willBePaid = expense.status !== "completed";
    const method = willBePaid ? window.prompt("Forma de pagamento (ex.: PIX, dinheiro):", expense.payment_method || "PIX") ?? "" : "";
    if (willBePaid && !method.trim()) return;
    if (expense.purchase_id) {
      const { error } = await supabase.rpc("update_purchase_payment", { p_business_id: Number(props.businessId), p_purchase_id: Number(expense.purchase_id), p_payment_status: willBePaid ? "paid" : "pending", p_payment_method: method || expense.payment_method });
      if (error) return alert("Não foi possível atualizar o pagamento.");
    } else if (expense.source_type === "work_shift" || expense.source_type === "personnel_cost") {
      const { error } = await supabase.rpc("set_personnel_payment", { p_business_id: Number(props.businessId), p_source_type: expense.source_type, p_source_id: Number(expense.source_id), p_paid: willBePaid, p_payment_method: method });
      if (error) return alert("Não foi possível atualizar o pagamento.");
    } else {
      const { error } = await supabase.from("expenses").update({ status: willBePaid ? "completed" : "pending", paid_at: willBePaid ? new Date().toISOString() : null, payment_method: method || expense.payment_method }).eq("id", expense.id).eq("business_id", props.businessId);
      if (error) return alert("Não foi possível atualizar o pagamento.");
    }
    await props.onRefresh();
  }
  return <section><ModuleHero eyebrow="Financeiro" title="Despesas" description="Entenda onde o dinheiro é gasto e quanto custa manter o Dopamina funcionando." action="Nova despesa" icon={<ReceiptText size={19} />} onAction={() => setEditing("new")} />
    <StructuralCostsSection businessId={props.businessId} areas={props.data.areas} onChanged={props.onRefresh} />
    <div className="expense-kpi-grid">
      <ExpenseKpi label="Total de despesas" value={MONEY.format(total)} note={totalChange === null ? "Sem base no período anterior" : `${totalChange > 0 ? "+" : ""}${NUMBER.format(totalChange * 100)}% vs. período anterior`} tone="neutral" />
      <ExpenseKpi label="Despesas pagas" value={MONEY.format(paid)} note={`${confirmed.filter((expense) => expense.status === "completed").length} lançamento(s) pagos`} tone="green" />
      <ExpenseKpi label="Despesas pendentes" value={MONEY.format(pending)} note={`${confirmed.filter((expense) => expense.status === "pending").length} aguardando pagamento`} tone="yellow" />
      <ExpenseKpi label="Lançamentos" value={String(props.expenses.length)} note={`${props.expenses.filter((expense) => expense.status === "draft").length} em rascunho`} tone="neutral" />
      <ExpenseKpi label="Custo médio diário" value={operationalTotal > 0 ? MONEY.format(operationalTotal / rangeDays(props.range)) : "—"} note={operationalTotal > 0 ? `${rangeDays(props.range)} dia(s) no período` : "Sem despesas confirmadas"} tone="red" />
    </div>
    <div className="expense-operational-head"><div><p className="page-kicker">Custo Operacional</p><h3>Quanto custa manter o Dopamina funcionando</h3><span>Despesas recorrentes são distribuídas pelos dias do mês; despesas pontuais ficam no dia do lançamento.</span></div><div><span>Custo total no período</span><strong>{operationalTotal > 0 ? MONEY.format(operationalTotal) : "—"}</strong><small>{operationalChange === null ? "Sem base anterior" : `${operationalChange > 0 ? "+" : ""}${NUMBER.format(operationalChange * 100)}% vs. período anterior`}</small></div></div>
    <div className="expense-operational-grid">
      <article className="expense-analysis-card expense-trend-card"><div className="expense-card-heading"><div><span>Evolução diária</span><strong>Despesas lançadas x custo operacional</strong></div><div className="expense-chart-legend"><span><i className="booked-dot" />Lançado no dia</span><span><i className="operational-dot" />Custo rateado</span></div></div>{operationalTotal > 0 ? <OperationalCostChart rows={operational.days} /> : <EmptyMini text="Cadastre uma despesa paga ou pendente para visualizar a evolução." />}</article>
      <article className="expense-analysis-card expense-day-card"><div className="expense-card-heading"><div><span>Custo do dia</span><strong>{dateLabel(activeSelectedDay)}</strong></div><input aria-label="Selecionar dia do custo" type="date" min={props.range.start} max={props.range.end} value={activeSelectedDay} onChange={(event) => setSelectedDay(event.target.value)} /></div><div className="expense-day-value">{selectedCost !== null && operationalTotal > 0 ? MONEY.format(selectedCost) : "—"}<small>{selectedCost !== null && selectedCost > 0 ? "Custo operacional estimado para este dia" : "Sem custo registrado para este dia"}</small></div><div className="expense-day-extremes"><div><span>Maior gasto</span><strong>{highestDay ? MONEY.format(highestDay.operational) : "—"}</strong><small>{highestDay ? dateLabel(highestDay.date) : "Sem dados"}</small></div><div><span>Menor dia com custo</span><strong>{lowestDay ? MONEY.format(lowestDay.operational) : "—"}</strong><small>{lowestDay ? dateLabel(lowestDay.date) : "Sem dados"}</small></div></div></article>
    </div>
    <div className="expense-breakdown-grid">
      <article className="expense-analysis-card"><div className="expense-card-heading"><div><span>Peso por categoria</span><strong>Participação no custo operacional</strong></div></div><ExpenseCategoryBars rows={operational.categories} total={operationalTotal} /></article>
      <article className="expense-analysis-card"><div className="expense-card-heading"><div><span>Classificação</span><strong>Como o custo está composto</strong></div></div>{confirmed.length ? <div className="expense-classification"><ExpenseCompositionRow label="Fixas" value={fixed} total={total} /><ExpenseCompositionRow label="Variáveis" value={variable} total={total} /><ExpenseCompositionRow label="Recorrentes" value={recurring} total={total} /><ExpenseCompositionRow label="Não recorrentes" value={total - recurring} total={total} /></div> : <EmptyMini text="Sem despesas confirmadas para classificar." />}</article>
      <article className="expense-analysis-card"><div className="expense-card-heading"><div><span>Ranking</span><strong>Maiores despesas do período</strong></div></div>{largest.length ? <div className="expense-ranking">{largest.map((expense, index) => <div key={expense.id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{expense.description}</strong><small>{expense.category} · {expense.cost_behavior === "fixed" ? "Fixa" : "Variável"}{expense.is_recurring ? " · Recorrente" : ""}</small></span><em>{MONEY.format(expense.amount)}</em></div>)}</div> : <EmptyMini text="Sem despesas confirmadas no período." />}</article>
    </div>
    <p className="expense-method-note"><TriangleAlert size={14} />O custo operacional considera despesas pagas e pendentes. Recorrências com vigência são projetadas e rateadas pelos dias de cada mês, sem criar lançamentos duplicados.</p>
    <div className="module-toolbar expense-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar despesa, categoria ou pagamento" /></label><select aria-label="Filtrar por categoria" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas as categorias</option>{availableCategories.map((category) => <option key={category}>{category}</option>)}</select><select aria-label="Filtrar por comportamento" value={behaviorFilter} onChange={(event) => setBehaviorFilter(event.target.value)}><option value="all">Fixas e variáveis</option><option value="fixed">Fixas</option><option value="variable">Variáveis</option></select><select aria-label="Filtrar por recorrência" value={recurrenceFilter} onChange={(event) => setRecurrenceFilter(event.target.value)}><option value="all">Todas as recorrências</option><option value="recurring">Recorrentes</option><option value="single">Não recorrentes</option></select><select aria-label="Filtrar por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option><option value="completed">Pago</option><option value="pending">Pendente</option><option value="draft">Rascunho</option></select><span className="table-count">{props.refreshing ? "Atualizando..." : `${rows.length} lançamento(s)`}</span></div>
    <div className="data-table-card"><div className="responsive-table expenses-table"><div className="table-row table-header"><span>Data</span><span>Descrição</span><span>Categoria</span><span>Tipo</span><span>Recorrência</span><span>Status</span><span>Valor</span><span></span></div>{rows.length ? rows.map((expense) => {
      const canEdit = !expense.purchase_id && (!expense.source_type || expense.source_type === "structural_cost");
      const canDelete = !expense.purchase_id;
      const canTogglePayment = expense.status !== "cancelled";
      function edit() { if (expense.source_type === "structural_cost") setStructuralEdit(expense); else setEditing(expense); }
      function del() { if (expense.source_type === "structural_cost") return removeStructural(expense); if (expense.source_type === "work_shift" || expense.source_type === "personnel_cost") return removePersonnelLinked(expense); return remove(expense); }
      return <div className="table-row" key={expense.id}><span>{dateLabel(expense.expense_date)}</span><strong>{expense.description}<small className="expense-payment-hint">{expense.purchase_id ? "Gerado e controlado pela compra" : expense.source_type ? "Gerado e controlado pelo módulo de origem" : expense.payment_method || "Pagamento não informado"}</small></strong><span>{expense.category}</span><span className={`expense-type-badge ${expense.cost_behavior}`}>{expense.cost_behavior === "fixed" ? "Fixa" : "Variável"}</span><span>{expense.is_recurring ? <small className="recurring-badge">Recorrente</small> : "Não recorrente"}</span><StatusBadge status={expense.status} /><strong>{MONEY.format(expense.amount)}</strong><span className="row-actions">{canTogglePayment && <button className="expense-pay-toggle" onClick={() => togglePayment(expense)}>{expense.status === "completed" ? "Reabrir" : "Marcar pago"}</button>}<ExpenseRowMenu label={expense.description} onEdit={canEdit ? edit : undefined} onDelete={canDelete ? del : undefined} /></span></div>;
    }) : <EmptyMini text="Nenhuma despesa encontrada com os filtros atuais." />}</div></div>
    {editing && <ExpenseModal businessId={props.businessId} userId={props.userId} expense={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await props.onRefresh(); setEditing(null); }} />}
    {structuralEdit && <StructuralExpenseEditModal businessId={props.businessId} areas={props.data.areas} expense={structuralEdit} onClose={() => setStructuralEdit(null)} onSaved={async () => { await props.onRefresh(); setStructuralEdit(null); }} />}
  </section>;
}
function ExpenseRowMenu({ label, onEdit, onDelete }: { label: string; onEdit?: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!ref.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  if (!onEdit && !onDelete) return null;
  return <div className="row-action-menu" ref={ref}>
    <button className="row-action-trigger" type="button" aria-label={`Ações de ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={16} /></button>
    {open && <div className="row-action-popover" role="menu">
      {onEdit && <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}><Pencil size={14} /> Editar</button>}
      {onDelete && <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={14} /> Excluir</button>}
    </div>}
  </div>;
}
function StructuralExpenseEditModal({ businessId, areas, expense, onClose, onSaved }: { businessId: string; areas: Area[]; expense: Expense; onClose: () => void; onSaved: () => Promise<void> }) {
  useEscapeToClose(onClose);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ area_id: "", name: "", structure_type: "container", monthly_amount: "", effective_from: "", effective_to: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: fetchError } = await supabase.from("structural_costs").select("area_id,name,structure_type,monthly_amount,effective_from,effective_to,notes").eq("id", expense.source_id as string).eq("business_id", businessId).single();
      if (cancelled) return;
      if (fetchError || !data) { setError("Não foi possível carregar este custo estrutural."); setLoading(false); return; }
      setForm({ area_id: data.area_id ? String(data.area_id) : "", name: data.name, structure_type: data.structure_type, monthly_amount: String(data.monthly_amount), effective_from: data.effective_from, effective_to: data.effective_to ?? "", notes: data.notes ?? "" });
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [businessId, expense.source_id]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || Number(form.monthly_amount.replace(",", ".")) <= 0) return setError("Informe nome e valor mensal.");
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("update_structural_cost", { p_business_id: Number(businessId), p_id: Number(expense.source_id), p_area_id: form.area_id ? Number(form.area_id) : null, p_name: form.name, p_structure_type: form.structure_type, p_monthly_amount: Number(form.monthly_amount.replace(",", ".")), p_effective_from: form.effective_from, p_effective_to: form.effective_to || null, p_notes: form.notes });
    if (rpcError) { setError(rpcError.message); setSaving(false); return; }
    await onSaved();
  }
  return <div className="modal-backdrop"><div className="modal-card" role="dialog" aria-modal="true" aria-label="Editar custo estrutural"><button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Despesas</p><h2>Editar custo estrutural</h2>
    {loading ? <p className="modal-description">Carregando…</p> : <form onSubmit={save} className="personnel-form">
      <label><span>Nome</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label><span>Estrutura</span><select value={form.structure_type} onChange={(e) => setForm({ ...form, structure_type: e.target.value })}><option value="terrain">Terreno</option><option value="container">Container</option><option value="bathroom">Banheiro</option><option value="other">Outro</option></select></label>
      <label><span>Setor responsável</span><select value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}><option value="">Geral / não atribuído</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label><span>Valor mensal</span><input value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} inputMode="decimal" /></label>
      <label><span>Vigência inicial</span><input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></label>
      <label><span>Vigência final (opcional)</span><input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></label>
      <label className="wide"><span>Observações</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      {error && <p className="form-message">{error}</p>}
      <div className="personnel-form-actions"><button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button></div>
    </form>}
  </div></div>;
}

function ImportsPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  return <section><ModuleHero eyebrow="Integrações" title="Integração Zig" description="A API é a fonte principal; planilhas permanecem disponíveis como contingência e para dados ainda sem endpoint." action="Enviar planilhas" icon={<FileSpreadsheet size={19} />} onAction={() => setShowImport(true)} />
    <div className="sync-state-grid">{(["saida-produtos", "faturamento"] as const).map((endpoint) => { const state = props.data.zig.sync.find((row) => row.endpoint === endpoint); return <article key={endpoint}><span>{endpoint === "saida-produtos" ? "Produtos vendidos" : "Faturamento"}</span><strong className={state?.status === "completed" ? "success-text" : "warning-text"}>{state?.status === "completed" ? "Sincronizado" : state?.status === "failed" ? "Falhou" : "Aguardando configuração"}</strong><small>{state?.last_successful_date ? `Último dia: ${dateLabel(state.last_successful_date)}` : "Nenhuma execução concluída"}</small></article>; })}</div>
    <div className="data-table-card imports-card"><div className="responsive-table imports-table"><div className="table-row table-header"><span>Período</span><span>Arquivo</span><span>Linhas</span><span>Status</span><span>Importado em</span></div>{props.data.imports.length ? props.data.imports.map((row) => <div className="table-row" key={row.id}><span>{dateLabel(row.period_start)} a {dateLabel(row.period_end)}</span><strong>{row.file_name}</strong><span>{row.row_count}</span><StatusBadge status={row.status as Expense["status"]} /><span>{DATE.format(new Date(row.created_at))}</span></div>) : <EmptyMini text="Nenhuma planilha importada." />}</div></div>{showImport && <ImportModal businessId={props.businessId} onClose={() => setShowImport(false)} onImported={async () => { await props.onRefresh(); setShowImport(false); }} />}</section>;
}

function ImportModal({ businessId, onClose, onImported }: { businessId: string; onClose: () => void; onImported: () => Promise<void> }) {
  useEscapeToClose(onClose);
  const closingRef = useRef<HTMLInputElement>(null); const productsRef = useRef<HTMLInputElement>(null);
  const [closing, setClosing] = useState<File | null>(null); const [products, setProducts] = useState<File | null>(null);
  const [preview, setPreview] = useState<ZigImportPayload | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function analyze() { if (!closing || !products) return setMessage("Selecione os dois relatórios do mesmo período."); setBusy(true); setMessage(""); try { setPreview(await parseZigReports(closing, products)); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível analisar os arquivos."); } finally { setBusy(false); } }
  async function importData() { if (!preview) return; setBusy(true); setMessage(""); const { error } = await supabase.rpc("import_zig_sales", { p_business_id: Number(businessId), p_file_name: preview.fileName, p_file_checksum: preview.checksum, p_period_start: preview.periodStart, p_period_end: preview.periodEnd, p_summary: preview.summary, p_products: preview.products, p_payment_methods: preview.paymentMethods }); if (error) { setMessage(error.message.includes("período") ? "Esse período já foi importado. Os dados existentes foram preservados." : error.message); setBusy(false); return; } await onImported(); }
  return <div className="modal-backdrop" role="presentation"><div className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Importação segura</p><h2 id="import-title">Relatórios da Zig</h2><p className="modal-description">Envie o fechamento e os produtos vendidos do mesmo período. O sistema confere os totais antes de gravar.</p>
    {!preview ? <><div className="upload-grid"><button className={closing ? "file-drop selected" : "file-drop"} onClick={() => closingRef.current?.click()}><FileSpreadsheet size={25} /><strong>{closing?.name ?? "Relatório de fechamento"}</strong><span>{closing ? "Arquivo selecionado" : "Selecionar .xlsx"}</span></button><button className={products ? "file-drop selected" : "file-drop"} onClick={() => productsRef.current?.click()}><ShoppingCart size={25} /><strong>{products?.name ?? "Produtos vendidos"}</strong><span>{products ? "Arquivo selecionado" : "Selecionar .xlsx"}</span></button></div><input ref={closingRef} hidden type="file" accept=".xlsx" onChange={(event) => setClosing(event.target.files?.[0] ?? null)} /><input ref={productsRef} hidden type="file" accept=".xlsx" onChange={(event) => setProducts(event.target.files?.[0] ?? null)} /><button className="modal-primary" onClick={analyze} disabled={busy || !closing || !products}>{busy ? "Analisando..." : "Conferir relatórios"}</button></> : <><div className="import-preview"><div><span>Período</span><strong>{dateLabel(preview.periodStart)} a {dateLabel(preview.periodEnd)}</strong></div><div><span>Produtos vendidos</span><strong>{MONEY.format(preview.summary.product_gross_amount)}</strong></div><div><span>Descontos</span><strong>{MONEY.format(preview.summary.discount_amount)}</strong></div><div><span>Receita</span><strong>{MONEY.format(preview.summary.revenue_amount)}</strong></div><div><span>Linhas</span><strong>{preview.products.length}</strong></div><div><span>Conciliação</span><strong className="success-text"><CheckCircle2 size={16} /> Aprovada</strong></div></div><div className="modal-actions"><button className="modal-secondary" onClick={() => setPreview(null)}>Trocar arquivos</button><button className="modal-primary" onClick={importData} disabled={busy}>{busy ? "Importando..." : "Importar para o painel"}</button></div></>}{message && <p className="modal-message">{message}</p>}</div></div>;
}

function AnalyticsImportModal({ businessId, onClose, onImported }: { businessId: string; onClose: () => void; onImported: () => Promise<void> }) {
  useEscapeToClose(onClose);
  const cmvRef = useRef<HTMLInputElement>(null); const abcRef = useRef<HTMLInputElement>(null);
  const [cmvFile, setCmvFile] = useState<File | null>(null); const [abcFile, setAbcFile] = useState<File | null>(null);
  const [cmvPreview, setCmvPreview] = useState<ZigProfitabilityPayload | null>(null); const [abcPreview, setAbcPreview] = useState<ZigAbcPayload | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function analyze() {
    if (!cmvFile && !abcFile) return setMessage("Selecione pelo menos um relatório.");
    setBusy(true); setMessage("");
    try {
      const [cmv, abc] = await Promise.all([cmvFile ? parseZigProfitabilityReport(cmvFile) : null, abcFile ? parseZigAbcReport(abcFile) : null]);
      setCmvPreview(cmv); setAbcPreview(abc);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível analisar os relatórios."); }
    finally { setBusy(false); }
  }
  async function importData() {
    setBusy(true); setMessage("");
    if (cmvPreview) {
      const { error } = await supabase.rpc("import_zig_profitability", { p_business_id: Number(businessId), p_file_name: cmvPreview.fileName, p_file_checksum: cmvPreview.checksum, p_period_start: cmvPreview.periodStart, p_period_end: cmvPreview.periodEnd, p_rows: cmvPreview.rows });
      if (error) { setMessage(error.message); setBusy(false); return; }
    }
    if (abcPreview) {
      const { error } = await supabase.rpc("import_zig_abc", { p_business_id: Number(businessId), p_file_name: abcPreview.fileName, p_file_checksum: abcPreview.checksum, p_rows: abcPreview.rows });
      if (error) { setMessage(error.message); setBusy(false); return; }
    }
    await onImported();
  }
  const hasPreview = cmvPreview || abcPreview;
  return <div className="modal-backdrop" role="presentation"><div className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="analytics-import-title"><button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Rentabilidade</p><h2 id="analytics-import-title">CMV e Curva ABC</h2><p className="modal-description">O CMV é ligado ao período de vendas já importado. A Curva ABC é opcional e fica registrada como snapshot, sem alterar o saldo de estoque.</p>
    {!hasPreview ? <><div className="upload-grid"><button className={cmvFile ? "file-drop selected" : "file-drop"} onClick={() => cmvRef.current?.click()}><CircleDollarSign size={25} /><strong>{cmvFile?.name ?? "Relatório de CMV"}</strong><span>{cmvFile ? "Arquivo selecionado" : "Selecionar .xlsx"}</span></button><button className={abcFile ? "file-drop selected" : "file-drop"} onClick={() => abcRef.current?.click()}><BarChart3 size={25} /><strong>{abcFile?.name ?? "Curva ABC (opcional)"}</strong><span>{abcFile ? "Arquivo selecionado" : "Selecionar .xlsx"}</span></button></div><input ref={cmvRef} hidden type="file" accept=".xlsx" onChange={(event) => setCmvFile(event.target.files?.[0] ?? null)} /><input ref={abcRef} hidden type="file" accept=".xlsx" onChange={(event) => setAbcFile(event.target.files?.[0] ?? null)} /><button className="modal-primary" onClick={analyze} disabled={busy || (!cmvFile && !abcFile)}>{busy ? "Analisando..." : "Conferir relatórios"}</button></> : <><div className="import-preview">{cmvPreview && <><div><span>Período CMV</span><strong>{dateLabel(cmvPreview.periodStart)} a {dateLabel(cmvPreview.periodEnd)}</strong></div><div><span>CMV conhecido</span><strong>{MONEY.format(cmvPreview.knownCost)}</strong></div><div><span>Sem custo</span><strong className={cmvPreview.missingCostCount ? "warning-text" : "success-text"}>{cmvPreview.missingCostCount} produto(s)</strong></div></>}{abcPreview && <><div><span>Itens ABC</span><strong>{abcPreview.rows.length}</strong></div><div><span>Valor do snapshot</span><strong>{MONEY.format(abcPreview.totalValue)}</strong></div><div><span>Custos ausentes</span><strong>{abcPreview.missingCostCount}</strong></div></>}</div>{cmvPreview?.missingCostCount ? <div className="preview-warning"><TriangleAlert size={17} /><span>{MONEY.format(cmvPreview.missingCostRevenue)} do faturamento está sem custo confiável e ficará sinalizado.</span></div> : null}<div className="modal-actions"><button className="modal-secondary" onClick={() => { setCmvPreview(null); setAbcPreview(null); }}>Trocar arquivos</button><button className="modal-primary" onClick={importData} disabled={busy}>{busy ? "Importando..." : "Importar dados"}</button></div></>}{message && <p className="modal-message">{message}</p>}</div></div>;
}

function ExpenseModal({ businessId, userId, expense, onClose, onSaved }: { businessId: string; userId: string; expense: Expense | null; onClose: () => void; onSaved: () => Promise<void> }) {
  useEscapeToClose(onClose);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [form, setForm] = useState({ description: expense?.description ?? "", category: expense?.category ?? "Mercadorias e fornecedores", expense_date: expense?.expense_date ?? isoInSaoPaulo(), due_date: expense?.due_date ?? "", amount: expense?.amount ? String(expense.amount) : "", payment_method: expense?.payment_method ?? "", status: expense?.status ?? "pending", is_recurring: expense?.is_recurring ?? false, cost_behavior: expense?.cost_behavior ?? "variable" });
  function field(name: string, value: string | boolean) { setForm((current) => ({ ...current, [name]: value })); }
  async function save(event: React.FormEvent) { event.preventDefault(); const amount = Number(String(form.amount).replace(",", ".")); if (!form.description.trim() || !form.expense_date || !Number.isFinite(amount) || amount <= 0) return setMessage("Preencha a descrição, a data e um valor maior que zero."); setBusy(true); const payload = { business_id: Number(businessId), description: form.description.trim(), category: form.category, expense_date: form.expense_date, due_date: form.due_date || null, amount, payment_method: form.payment_method || null, status: form.status, is_recurring: form.is_recurring, cost_behavior: form.cost_behavior, paid_at: form.status === "completed" ? expense?.paid_at ?? new Date().toISOString() : null, created_by: userId }; const query = expense ? supabase.from("expenses").update(payload).eq("id", expense.id).eq("business_id", Number(businessId)) : supabase.from("expenses").insert(payload); const { error } = await query; if (error) { setMessage("Não foi possível salvar a despesa."); setBusy(false); return; } await onSaved(); }
  const categories = expense?.category && !EXPENSE_CATEGORIES.includes(expense.category as typeof EXPENSE_CATEGORIES[number]) ? [expense.category, ...EXPENSE_CATEGORIES] : EXPENSE_CATEGORIES;
  return <div className="modal-backdrop"><form className="modal-card expense-modal" onSubmit={save}><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Financeiro</p><h2>{expense ? "Editar despesa" : "Nova despesa"}</h2><p className="modal-description">Classifique o gasto para que ele apareça corretamente na análise de custo operacional.</p><div className="form-grid"><label className="span-2"><span>Descrição</span><input value={form.description} onChange={(e) => field("description", e.target.value)} placeholder="Ex.: Conta de energia de agosto" autoFocus /></label><label><span>Categoria</span><select value={form.category} onChange={(e) => field("category", e.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label><span>Valor total do lançamento</span><input value={form.amount} onChange={(e) => field("amount", e.target.value)} inputMode="decimal" placeholder="0,00" /></label><label><span>Comportamento do custo</span><select value={form.cost_behavior} onChange={(e) => field("cost_behavior", e.target.value)}><option value="fixed">Fixa</option><option value="variable">Variável</option></select></label><label><span>Recorrência</span><select value={form.is_recurring ? "recurring" : "single"} onChange={(e) => field("is_recurring", e.target.value === "recurring")}><option value="single">Não recorrente</option><option value="recurring">Recorrente mensal</option></select></label><label><span>Data da despesa</span><input type="date" value={form.expense_date} onChange={(e) => field("expense_date", e.target.value)} /></label><label><span>Vencimento</span><input type="date" value={form.due_date} onChange={(e) => field("due_date", e.target.value)} /></label><label><span>Forma de pagamento</span><input value={form.payment_method} onChange={(e) => field("payment_method", e.target.value)} placeholder="PIX, cartão, boleto..." /></label><label><span>Status</span><select value={form.status} onChange={(e) => field("status", e.target.value)}><option value="pending">Pendente</option><option value="completed">Pago</option><option value="draft">Rascunho</option></select></label></div><p className="expense-form-help">Exemplo: aluguel é normalmente uma despesa <strong>fixa e recorrente</strong>. Uma manutenção emergencial costuma ser <strong>variável e não recorrente</strong>.</p>{message && <p className="modal-message">{message}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button className="modal-primary" disabled={busy}>{busy ? "Salvando..." : "Salvar despesa"}</button></div></form></div>;
}

function paymentRows(payments: PaymentMethod[], sales: Sale[]) { const imports = new Set(sales.map((sale) => String(sale.import_id))); const grouped = new Map<string, PaymentMethod>(); payments.filter((payment) => imports.has(String(payment.import_id))).forEach((payment) => { const key = payment.payment_method.trim() || "Não informado"; const current = grouped.get(key) ?? { ...payment, id: `payment-${key}`, payment_method: key, amount: 0, percentage: null }; current.amount = Number(current.amount) + Number(payment.amount); grouped.set(key, current); }); return [...grouped.values()].filter((row) => Number(row.amount) > 0).sort((a, b) => Number(b.amount) - Number(a.amount)); }
function PaymentBars({ payments, sales }: { payments: PaymentMethod[]; sales: Sale[] }) { const rows = paymentRows(payments, sales); const total = rows.reduce((sum, row) => sum + Number(row.amount), 0); const max = Math.max(...rows.map((row) => Number(row.amount)), 1); return rows.length ? <div className="bar-list payment-bars">{rows.map((row) => <div key={row.id}><span>{row.payment_method}</span><div><i style={{ width: `${Number(row.amount) / max * 100}%` }} /></div><strong>{MONEY.format(row.amount)}<small>{total > 0 ? `${NUMBER.format(Number(row.amount) / total * 100)}%` : "—"}</small></strong></div>)}</div> : <EmptyMini text="Sem formas de pagamento no período." />; }
function PaymentSummary({ payments, sales, salesRevenue }: { payments: PaymentMethod[]; sales: Sale[]; salesRevenue: number }) { const rows = paymentRows(payments, sales); const total = rows.reduce((sum, row) => sum + Number(row.amount), 0); const difference = total - salesRevenue; const reconciled = Math.abs(difference) < .01; return <div className="payment-summary"><div><span>Total recebido</span><strong>{rows.length ? MONEY.format(total) : "—"}</strong></div><div><span>Formas utilizadas</span><strong>{rows.length ? NUMBER.format(rows.length) : "—"}</strong></div><div><span>Diferença para vendas</span><strong className={reconciled ? "reconciled" : "difference"}>{rows.length ? MONEY.format(difference) : "—"}</strong></div><p>{!rows.length ? "A fonte disponível não trouxe formas de pagamento." : reconciled ? "Recebimentos e faturamento líquido estão conciliados." : "A diferença pode refletir saldo, recarga, contas ou o fechamento da Zig."}</p></div>; }
function CoverageBar({ known, missing }: { known: number; missing: number }) { const total = known + missing; const percentage = total ? known / total * 100 : 0; return <div className="coverage-panel"><div className="coverage-track"><i style={{ width: `${percentage}%` }} /></div><div className="coverage-legend"><span><i className="known-dot" />Com custo <strong>{MONEY.format(known)}</strong></span><span><i className="missing-dot" />Sem custo <strong>{MONEY.format(missing)}</strong></span></div></div>; }
function AbcSummary({ rows }: { rows: { classification: "A" | "B" | "C"; total_value: number }[] }) { if (!rows.length) return <EmptyMini text="Sem vendas suficientes para calcular a Curva ABC." />; const groups = (["A", "B", "C"] as const).map((classification) => ({ classification, count: rows.filter((row) => row.classification === classification).length, value: rows.filter((row) => row.classification === classification).reduce((sum, row) => sum + Number(row.total_value), 0) })); return <div className="abc-summary">{groups.map((group) => <div key={group.classification}><b className={`abc-class class-${group.classification.toLowerCase()}`}>{group.classification}</b><span>{group.count} item(ns)</span><strong>{MONEY.format(group.value)}</strong></div>)}</div>; }
function SalesKpi({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "green" | "purple" | "yellow" }) { return <article className={`sales-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function SalesDayInsight({ label, row, tone }: { label: string; row: { date: string; revenue: number; transactions: number | null } | null; tone: "best" | "worst" }) { return <article className={`sales-day-insight ${tone}`}><span>{label}</span><strong>{row ? MONEY.format(row.revenue) : "—"}</strong><div><b>{row ? dateLabel(row.date) : "Sem venda no período"}</b>{row?.transactions !== null && row?.transactions !== undefined ? <small>{NUMBER.format(row.transactions)} transações</small> : null}</div></article>; }
function AreaSalesCard({ row, totalRevenue }: { row: { area: string; revenue: number; quantity: number }; totalRevenue: number }) { const share = totalRevenue > 0 ? row.revenue / totalRevenue * 100 : 0; return <article className="area-sales-card"><div><span>Área</span><h4>{row.area}</h4></div><strong>{MONEY.format(row.revenue)}</strong><div className="area-share-track"><i style={{ width: `${Math.min(100, Math.max(0, share))}%` }} /></div><footer><span>{NUMBER.format(share)}% do faturamento</span><b>{NUMBER.format(row.quantity)} itens</b></footer></article>; }
function ProductRanking({ rows, metric }: { rows: { name: string; category: string; area: string; quantity: number; net: number }[]; metric: "quantity" | "revenue" }) { return rows.length ? <div className="ranking-list product-ranking">{rows.map((row, index) => <div key={`${row.name}-${row.area}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{row.name}</strong><small>{row.category} · {row.area}</small></div><b>{metric === "quantity" ? `${NUMBER.format(row.quantity)} un.` : MONEY.format(row.net)}</b></div>)}</div> : <EmptyMini text="Sem produtos no período." />; }

function SalesTrendChart({ rows }: { rows: { date: string; revenue: number; transactions: number | null }[] }) {
  const width = 880; const height = 250; const left = 68; const right = 18; const top = 18; const bottom = 38;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom; const max = Math.max(...rows.map((row) => row.revenue), 1);
  const x = (index: number) => left + (rows.length <= 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth);
  const y = (value: number) => top + (max - value) / max * plotHeight;
  const linePoints = rows.map((row, index) => `${x(index)},${y(row.revenue)}`).join(" ");
  const areaPoints = `${left},${top + plotHeight} ${linePoints} ${width - right},${top + plotHeight}`;
  const grid = Array.from({ length: 4 }, (_, index) => max - max * index / 3);
  const labelIndexes = [...new Set(Array.from({ length: Math.min(5, rows.length) }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(1, Math.min(5, rows.length) - 1))))];
  const compact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  return <div className="sales-trend-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="sales-trend-title sales-trend-description"><title id="sales-trend-title">Evolução diária do faturamento</title><desc id="sales-trend-description">Faturamento líquido para cada dia do período selecionado.</desc><defs><linearGradient id="sales-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#35d39a" stopOpacity=".22" /><stop offset="100%" stopColor="#35d39a" stopOpacity="0" /></linearGradient></defs>
    {grid.map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid-line" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{compact.format(value)}</text></g>)}
    {rows.length ? <><polygon points={areaPoints} fill="url(#sales-area-gradient)" /><polyline points={linePoints} className="sales-trend-line" />{rows.length <= 31 ? rows.map((row, index) => <circle key={row.date} cx={x(index)} cy={y(row.revenue)} r="4" className="sales-trend-point"><title>{`${dateLabel(row.date)} · ${MONEY.format(row.revenue)}${row.transactions === null ? "" : ` · ${NUMBER.format(row.transactions)} transações`}`}</title></circle>) : null}</> : null}
    {labelIndexes.map((index) => <text key={rows[index]?.date ?? index} x={x(index)} y={height - 10} textAnchor="middle" className="chart-axis-label">{rows[index] ? dateLabel(rows[index].date).slice(0, 5) : ""}</text>)}
  </svg></div>;
}
function ExpenseKpi({ label, value, note, tone }: { label: string; value: string; note: string; tone: "neutral" | "green" | "yellow" | "red" }) { return <article className={`expense-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function ExpenseCompositionRow({ label, value, total }: { label: string; value: number; total: number }) { const share = total > 0 ? value / total * 100 : 0; return <div><span><b>{label}</b><small>{NUMBER.format(share)}%</small></span><strong>{MONEY.format(value)}</strong><i><em style={{ width: `${Math.min(100, Math.max(0, share))}%` }} /></i></div>; }
function ExpenseCategoryBars({ rows, total }: { rows: { category: string; amount: number }[]; total: number }) { const max = Math.max(...rows.map((row) => row.amount), 1); return rows.length ? <div className="expense-category-bars">{rows.map((row, index) => <div key={row.category}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{row.category}</strong><i><em style={{ width: `${row.amount / max * 100}%` }} /></i></span><span><strong>{MONEY.format(row.amount)}</strong><small>{total > 0 ? `${NUMBER.format(row.amount / total * 100)}% do custo` : "—"}</small></span></div>)}</div> : <EmptyMini text="Sem custo operacional por categoria no período." />; }
function OperationalCostChart({ rows }: { rows: OperationalCostDay[] }) {
  const width = 860; const height = 250; const left = 68; const right = 18; const top = 18; const bottom = 38;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const max = Math.max(...rows.flatMap((row) => [row.booked, row.operational]), 1);
  const x = (index: number) => left + (rows.length <= 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth);
  const y = (value: number) => top + (max - value) / max * plotHeight;
  const bookedPoints = rows.map((row, index) => `${x(index)},${y(row.booked)}`).join(" ");
  const operationalPoints = rows.map((row, index) => `${x(index)},${y(row.operational)}`).join(" ");
  const grid = Array.from({ length: 4 }, (_, index) => max - max * index / 3);
  const labelIndexes = [...new Set(Array.from({ length: Math.min(5, rows.length) }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(1, Math.min(5, rows.length) - 1))))];
  const compact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  return <div className="operational-cost-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="operational-chart-title operational-chart-description"><title id="operational-chart-title">Evolução diária das despesas</title><desc id="operational-chart-description">Compara o valor lançado em cada dia com o custo operacional após o rateio de recorrências.</desc>
    {grid.map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid-line" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{compact.format(value)}</text></g>)}
    <polyline points={bookedPoints} className="expense-booked-line" /><polyline points={operationalPoints} className="expense-operational-line" />
    {rows.length <= 31 ? rows.map((row, index) => <g key={row.date}><circle cx={x(index)} cy={y(row.booked)} r="3.5" className="expense-booked-point"><title>{`${dateLabel(row.date)} · lançado ${MONEY.format(row.booked)}`}</title></circle><circle cx={x(index)} cy={y(row.operational)} r="3.5" className="expense-operational-point"><title>{`${dateLabel(row.date)} · operacional ${MONEY.format(row.operational)}`}</title></circle></g>) : null}
    {labelIndexes.map((index) => <text key={rows[index]?.date ?? index} x={x(index)} y={height - 10} textAnchor="middle" className="chart-axis-label">{rows[index] ? dateLabel(rows[index].date).slice(0, 5) : ""}</text>)}
  </svg></div>;
}
function SectorInsight({ label, sector, value, tone }: { label: string; sector: SectorSummary | null; value: string; tone: "green" | "yellow" | "red" }) { return <article className={`sector-insight ${tone}`}><span>{label}</span><strong>{sector?.name ?? "Sem dados"}</strong><small>{value}</small></article>; }
function SectorPerformanceCard({ sector, active, onSelect }: { sector: SectorSummary; active: boolean; onSelect: () => void }) { return <button type="button" className={`sector-performance-card ${active ? "active" : ""}`} onClick={onSelect}><header><div><span>Container</span><h3>{sector.name}</h3></div><strong>{sector.revenue > 0 ? MONEY.format(sector.revenue) : "—"}</strong></header><div className="sector-card-share"><i><em style={{ width: `${Math.min(100, sector.share * 100)}%` }} /></i><span>{NUMBER.format(sector.share * 100)}% do faturamento</span></div><div className="sector-card-metrics"><div><span>Itens</span><strong>{sector.quantity > 0 ? NUMBER.format(sector.quantity) : "—"}</strong></div><div><span>CMV conhecido</span><strong>{sector.knownRevenue > 0 ? MONEY.format(sector.cmv) : "—"}</strong></div><div><span>Lucro bruto</span><strong>{sector.knownRevenue > 0 ? MONEY.format(sector.grossProfit) : "—"}</strong></div><div><span>Margem bruta</span><strong>{sector.grossMargin === null ? "—" : `${NUMBER.format(sector.grossMargin * 100)}%`}</strong></div><div><span>Despesa direta</span><strong>{sector.expenses > 0 ? MONEY.format(sector.expenses) : "—"}</strong></div><div><span>Resultado</span><strong className={sector.result < 0 ? "negative" : ""}>{sector.knownRevenue > 0 ? MONEY.format(sector.result) : "—"}</strong></div><div><span>Margem do setor</span><strong className={Number(sector.resultMargin) < 0 ? "negative" : ""}>{sector.resultMargin === null ? "—" : `${NUMBER.format(sector.resultMargin * 100)}%`}</strong></div><div><span>Cobertura de CMV</span><strong>{NUMBER.format(sector.coverage * 100)}%</strong></div></div><footer><span>Selecionar e ver produtos</span><strong>Detalhes</strong></footer></button>; }
function SectorComparisonChart({ rows }: { rows: SectorSummary[] }) { const max = Math.max(...rows.flatMap((row) => [row.revenue, Math.abs(row.grossProfit), Math.abs(row.result)]), 1); return <div className="sector-comparison-chart">{rows.map((row) => <div key={row.name}><strong>{row.name}</strong><div><span>Faturamento</span><i><em className="revenue" style={{ width: `${row.revenue / max * 100}%` }} /></i><b>{row.revenue > 0 ? MONEY.format(row.revenue) : "—"}</b></div><div><span>Lucro bruto</span><i><em className="profit" style={{ width: `${Math.abs(row.grossProfit) / max * 100}%` }} /></i><b>{row.knownRevenue > 0 ? MONEY.format(row.grossProfit) : "—"}</b></div><div><span>Após despesas</span><i><em className={row.result < 0 ? "result negative" : "result"} style={{ width: `${Math.abs(row.result) / max * 100}%` }} /></i><b className={row.result < 0 ? "negative" : ""}>{row.knownRevenue > 0 ? MONEY.format(row.result) : "—"}</b></div></div>)}</div>; }
function SectorAttentionRow({ label, sector, value }: { label: string; sector: SectorSummary | null; value: string }) { return <div className="sector-attention-row"><span>{label}</span><strong>{sector?.name ?? "Não disponível"}</strong><small>{value}</small></div>; }
function MiniKpi({ label, value }: { label: string; value: string }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function ExecutiveMetric({ label, value, icon, tone, note, current, previous, lowerIsBetter = false, isRatio = false }: { label: string; value: string; icon: React.ReactNode; tone: "green" | "red" | "purple" | "yellow"; note: string; current: number | null; previous: number | null; lowerIsBetter?: boolean; isRatio?: boolean }) {
  let comparison = "Sem comparação";
  let direction: "up" | "down" | "flat" = "flat";
  let favorable = true;
  if (current !== null && previous !== null) {
    const difference = current - previous;
    direction = difference > 0 ? "up" : difference < 0 ? "down" : "flat";
    favorable = lowerIsBetter ? difference <= 0 : difference >= 0;
    if (isRatio) comparison = difference === 0 ? "Sem mudança" : `${difference > 0 ? "+" : ""}${NUMBER.format(difference * 100)} p.p.`;
    else if (previous === 0) comparison = current === 0 ? "Sem mudança" : "Novo no período";
    else comparison = `${difference > 0 ? "+" : ""}${NUMBER.format(difference / Math.abs(previous) * 100)}%`;
  }
  return <article className="executive-metric"><div className={`metric-icon ${tone}`}>{icon}</div><div className="executive-metric-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div><div className={`metric-comparison ${direction} ${favorable ? "favorable" : "unfavorable"}`}>{direction === "up" ? <ArrowUpRight size={15} /> : direction === "down" ? <ArrowDownRight size={15} /> : null}<span>{comparison}</span><small>vs. período anterior</small></div></article>;
}

function FinancialTrendChart({ rows }: { rows: FinancialDay[] }) {
  const width = 880; const height = 280; const left = 68; const right = 18; const top = 20; const bottom = 40;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const values = rows.flatMap((row) => [row.revenue, row.expenses, row.result]);
  const min = Math.min(0, ...values); const rawMax = Math.max(0, ...values); const max = rawMax === min ? min + 1 : rawMax;
  const x = (index: number) => left + (rows.length <= 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth);
  const y = (value: number) => top + (max - value) / (max - min) * plotHeight;
  const points = (key: keyof Pick<FinancialDay, "revenue" | "expenses" | "result">) => rows.map((row, index) => `${x(index)},${y(row[key])}`).join(" ");
  const grid = Array.from({ length: 5 }, (_, index) => max - (max - min) * index / 4);
  const labelIndexes = [...new Set(Array.from({ length: Math.min(5, rows.length) }, (_, index) => Math.round(index * (rows.length - 1) / Math.max(1, Math.min(5, rows.length) - 1))))];
  const compact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  return <div className="financial-trend"><div className="finance-chart-legend"><span className="revenue"><i />Faturamento</span><span className="expenses"><i />Despesas</span><span className="result"><i />Resultado</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="financial-chart-title financial-chart-description"><title id="financial-chart-title">Evolução financeira diária</title><desc id="financial-chart-description">Linhas de faturamento, despesas e resultado para cada dia do período selecionado.</desc>
    {grid.map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid-line" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{compact.format(value)}</text></g>)}
    {min < 0 && <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="chart-zero-line" />}
    {rows.length > 0 && <><polyline points={points("revenue")} className="trend-line revenue" /><polyline points={points("expenses")} className="trend-line expenses" /><polyline points={points("result")} className="trend-line result" />
      {rows.length <= 31 && rows.map((row, index) => <g key={row.date}><circle cx={x(index)} cy={y(row.revenue)} r="3.5" className="trend-point revenue"><title>{`${dateLabel(row.date)} · faturamento ${MONEY.format(row.revenue)}`}</title></circle><circle cx={x(index)} cy={y(row.expenses)} r="3.5" className="trend-point expenses"><title>{`${dateLabel(row.date)} · despesas ${MONEY.format(row.expenses)}`}</title></circle><circle cx={x(index)} cy={y(row.result)} r="3.5" className="trend-point result"><title>{`${dateLabel(row.date)} · resultado ${MONEY.format(row.result)}`}</title></circle></g>)}
    </>}
    {labelIndexes.map((index) => <text key={rows[index]?.date ?? index} x={x(index)} y={height - 12} textAnchor="middle" className="chart-axis-label">{rows[index] ? dateLabel(rows[index].date).slice(0, 5) : ""}</text>)}
  </svg></div>;
}
function EmptyMini({ text }: { text: string }) { return <div className="empty-mini"><FileSpreadsheet size={24} /><p>{text}</p></div>; }
function StatusBadge({ status }: { status: Expense["status"] }) { const labels = { completed: "Concluído", pending: "Pendente", draft: "Rascunho", cancelled: "Cancelado" }; return <span className={`status-badge ${status}`}>{labels[status]}</span>; }
