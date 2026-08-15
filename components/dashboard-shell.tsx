"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, BarChart3, Boxes, CalendarRange,
  CheckCircle2, ChefHat, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Clock3, FileSpreadsheet,
  FileUp, LayoutDashboard, LogOut, Menu, PackageSearch, Pencil,
  Plus, ReceiptText, Search, Settings, ShoppingCart, Trash2, TrendingUp, TriangleAlert,
  UsersRound, WalletCards, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { parseZigReports, type ZigImportPayload } from "@/lib/zig-import";
import {
  parseZigAbcReport,
  parseZigProfitabilityReport,
  type ZigAbcPayload,
  type ZigProfitabilityPayload,
} from "@/lib/zig-analytics-import";

type Section = "visao-geral" | "vendas" | "cmv" | "despesas" | "estoque" |
  "planejamento" | "cadastros" | "importacoes" | "configuracoes";
type Membership = { business_id: string; role: "owner" | "manager"; status: "active" | "pending" | "suspended"; businesses: { name: string } | { name: string }[] | null };
type Profile = { full_name: string; email: string };
type Sale = { id: string; import_id: string | null; period_start: string | null; period_end: string | null; business_date: string; gross_amount: number; discount_amount: number; product_gross_amount: number; service_amount: number; revenue_amount: number | null; closing_net_amount: number | null; open_accounts_amount: number; recharge_balance_amount: number; sales_imports: { file_name: string; row_count: number; created_at: string } | { file_name: string; row_count: number; created_at: string }[] | null };
type SaleItem = { id: string; sale_id: string; quantity: number; gross_amount: number; discount_amount: number; transaction_type: string | null; items: { name: string; sku: string | null; categories: { name: string } | { name: string }[] | null } | { name: string; sku: string | null; categories: { name: string } | { name: string }[] | null }[]; areas: { name: string } | { name: string }[] | null };
type PaymentMethod = { id: string; import_id: string; payment_method: string; amount: number; percentage: number | null };
type Expense = { id: string; category: string; description: string; expense_date: string; due_date: string | null; paid_at: string | null; amount: number; payment_method: string | null; status: "draft" | "pending" | "completed" | "cancelled"; is_recurring: boolean };
type ImportRow = { id: string; file_name: string; period_start: string | null; period_end: string | null; row_count: number; status: string; created_at: string };
type Area = { id: string; name: string };
type CatalogItem = { id: string; name: string; sku: string | null; item_type: "ingredient" | "product" | "consumable"; consumption_unit: string; costing_method: "simple" | "recipe"; sale_price: number | null; latest_unit_cost: number | null; average_unit_cost: number | null; minimum_stock: number; is_active: boolean; zig_product_id: string | null; categories: { name: string } | { name: string }[] | null; areas: { name: string } | { name: string }[] | null };
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
type DateRange = { start: string; end: string };
type DataState = { sales: Sale[]; saleItems: SaleItem[]; payments: PaymentMethod[]; expenses: Expense[]; forecasts: Forecast[]; catalogItems: CatalogItem[]; ingredients: CatalogItem[]; costHistory: CostHistory[]; recipes: Recipe[]; recipeItems: RecipeItem[]; imports: ImportRow[]; profitabilityImports: ProfitabilityImport[]; profitabilityItems: ProfitabilityItem[]; abcImports: AbcImport[]; abcItems: AbcItem[]; zig: ZigDashboard; previousZig: ZigDashboard; products: number; suppliers: number; areas: Area[] };

const EMPTY_ZIG: ZigDashboard = { period_start: "", period_end: "", summary: { gross_cents: 0, discount_cents: 0, net_cents: 0, revenue_cents: 0, quantity: 0, transaction_count: 0, refunded_item_count: 0 }, products: [], payments: [], daily: [], sync: [] };
const EMPTY_DATA: DataState = { sales: [], saleItems: [], payments: [], expenses: [], forecasts: [], catalogItems: [], ingredients: [], costHistory: [], recipes: [], recipeItems: [], imports: [], profitabilityImports: [], profitabilityItems: [], abcImports: [], abcItems: [], zig: EMPTY_ZIG, previousZig: EMPTY_ZIG, products: 0, suppliers: 0, areas: [] };
const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "visao-geral", label: "Visão geral", icon: <LayoutDashboard size={19} /> },
  { id: "vendas", label: "Vendas", icon: <TrendingUp size={19} /> },
  { id: "cmv", label: "CMV", icon: <BarChart3 size={19} /> },
  { id: "despesas", label: "Despesas", icon: <WalletCards size={19} /> },
  { id: "estoque", label: "Estoque", icon: <Boxes size={19} /> },
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
function automaticCmvRows(data: DataState): AutomaticCmvRow[] {
  const costs = new Map(data.catalogItems.map((item) => [String(item.id), item]));
  return data.zig.products.map((product) => {
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
  const [sales, expenses, products, suppliers, areas, forecasts, imports, profitabilityImports, abcImports, zig, previousZig, costHistory, recipes] = await Promise.all([
    supabase.from("sales").select("id,import_id,period_start,period_end,business_date,gross_amount,discount_amount,product_gross_amount,service_amount,revenue_amount,closing_net_amount,open_accounts_amount,recharge_balance_amount,sales_imports(file_name,row_count,created_at)").eq("business_id", businessId).order("business_date", { ascending: false }),
    supabase.from("expenses").select("id,category,description,expense_date,due_date,paid_at,amount,payment_method,status,is_recurring").eq("business_id", businessId).neq("status", "cancelled").order("expense_date", { ascending: false }),
    supabase.from("items").select("id,name,sku,item_type,consumption_unit,costing_method,sale_price,latest_unit_cost,average_unit_cost,minimum_stock,is_active,zig_product_id,categories(name),areas(name)").eq("business_id", businessId).order("name"),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("areas").select("id,name").eq("business_id", businessId).eq("is_active", true).order("sort_order"),
    supabase.from("forecasts").select("id,area_id,forecast_type,period_start,period_end,amount,notes,areas(name)").eq("business_id", businessId).order("period_start", { ascending: false }),
    supabase.from("sales_imports").select("id,file_name,period_start,period_end,row_count,status,created_at").eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase.from("zig_profitability_imports").select("id,sale_id,period_start,period_end,source_revenue,known_cost_total,row_count,missing_cost_count,created_at").eq("business_id", businessId).order("period_end", { ascending: false }),
    supabase.from("zig_abc_imports").select("id,file_name,total_value,row_count,missing_cost_count,created_at").eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase.rpc("get_zig_sales_dashboard", { p_business_id: Number(businessId), p_period_start: range.start, p_period_end: range.end }),
    supabase.rpc("get_zig_sales_dashboard", { p_business_id: Number(businessId), p_period_start: previousRange.start, p_period_end: previousRange.end }),
    supabase.from("item_cost_history").select("id,item_id,unit_cost,effective_from,source,created_at").eq("business_id", businessId).order("effective_from", { ascending: false }),
    supabase.from("recipes").select("id,product_id,yield_quantity,notes,effective_from,created_at").eq("business_id", businessId).order("effective_from", { ascending: false }),
  ]);
  const firstError = [sales.error, expenses.error, products.error, suppliers.error, areas.error, forecasts.error, imports.error, profitabilityImports.error, abcImports.error, zig.error, previousZig.error, costHistory.error, recipes.error].find(Boolean);
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
  return { sales: (sales.data ?? []) as unknown as Sale[], saleItems: (items.data ?? []) as unknown as SaleItem[], payments: (payments.data ?? []) as PaymentMethod[], expenses: (expenses.data ?? []) as Expense[], forecasts: (forecasts.data ?? []) as unknown as Forecast[], catalogItems, ingredients, costHistory: (costHistory.data ?? []) as CostHistory[], recipes: (recipes.data ?? []) as Recipe[], recipeItems: (recipeItems.data ?? []) as RecipeItem[], imports: (imports.data ?? []) as ImportRow[], profitabilityImports: (profitabilityImports.data ?? []) as ProfitabilityImport[], profitabilityItems: (profitabilityItems.data ?? []) as ProfitabilityItem[], abcImports: (abcImports.data ?? []) as AbcImport[], abcItems: (abcItems.data ?? []) as AbcItem[], zig: (zig.data as ZigDashboard | null) ?? EMPTY_ZIG, previousZig: (previousZig.data as ZigDashboard | null) ?? EMPTY_ZIG, products: catalogItems.length, suppliers: suppliers.count ?? 0, areas: (areas.data ?? []) as Area[] };
}

export function DashboardShell() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("visao-geral");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(() => typeof window !== "undefined" && localStorage.getItem("dopamina-sidebar-compact") === "1");
  useEffect(() => { localStorage.setItem("dopamina-sidebar-compact", sidebarCompact ? "1" : "0"); }, [sidebarCompact]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const visibleExpenses = data.expenses.filter((expense) => expense.expense_date >= range.start && expense.expense_date <= range.end);
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
      <div className="sidebar-brand"><div className="sidebar-logo"><Image src="/dopamina-logo.png" alt="Dopamina" width={54} height={50} unoptimized /></div><button className="close-sidebar-mobile" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={20} /></button></div>
      <nav className="sidebar-nav" aria-label="Navegação principal"><span className="nav-caption">Principal</span>{NAV_ITEMS.slice(0, 6).map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setSidebarOpen(false); }} title={item.label}>{item.icon}<span>{item.label}</span></button>)}<span className="nav-caption nav-caption-space">Sistema</span>{NAV_ITEMS.slice(6).map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setSidebarOpen(false); }} title={item.label}>{item.icon}<span>{item.label}</span></button>)}</nav>
      <div className="sidebar-footer"><button className="user-menu" title={profile?.full_name ?? "Usuário"}><span className="user-avatar">{(profile?.full_name ?? "D").charAt(0).toUpperCase()}</span><span className="user-copy"><strong>{profile?.full_name ?? "Usuário"}</strong><small>{membership.role === "owner" ? "Proprietário" : "Gerência"}</small></span></button><button className="logout-button" onClick={signOut} aria-label="Sair"><LogOut size={18} /></button></div>
      <button className="compact-toggle" onClick={() => setSidebarCompact((current) => !current)} aria-label={sidebarCompact ? "Expandir menu" : "Recolher menu"}>{sidebarCompact ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
    </aside>
    <main className="workspace"><header className="workspace-header"><div><p className="breadcrumb">Dopamina / {activeNav.label}</p><h1>{activeNav.label}</h1></div><div className="workspace-actions"><label className="search-box"><Search size={17} /><input type="search" placeholder="Buscar no sistema" /><kbd>⌘ K</kbd></label><select className="period-select" value={period} onChange={(event) => { const next = event.target.value; setPeriod(next); refresh(membership.business_id, selectedRange(next, customStart, customEnd)); }} aria-label="Período"><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="this_week">Esta semana</option><option value="this_month">Este mês</option><option value="last_month">Mês anterior</option><option value="custom">Período personalizado</option></select>{period === "custom" && <div className="custom-period"><input aria-label="Início do período" type="date" value={customStart} max={customEnd} onChange={(event) => { const next = event.target.value; setCustomStart(next); refresh(membership.business_id, selectedRange("custom", next, customEnd)); }} /><span>até</span><input aria-label="Fim do período" type="date" value={customEnd} min={customStart} onChange={(event) => { const next = event.target.value; setCustomEnd(next); refresh(membership.business_id, selectedRange("custom", customStart, next)); }} /></div>}</div></header>
      <div className="workspace-content"><SectionContent section={section} setSection={setSection} businessId={membership.business_id} userId={userId} data={data} sales={visibleSales} saleItems={visibleItems} expenses={visibleExpenses} profitabilityImports={visibleProfitabilityImports} profitabilityItems={visibleProfitabilityItems} range={range} refreshing={refreshing} onRefresh={() => refresh()} /></div>
    </main>
  </div>;
}

function SectionContent(props: { section: Section; setSection: (section: Section) => void; businessId: string; userId: string; data: DataState; sales: Sale[]; saleItems: SaleItem[]; expenses: Expense[]; profitabilityImports: ProfitabilityImport[]; profitabilityItems: ProfitabilityItem[]; range: DateRange; refreshing: boolean; onRefresh: () => Promise<void> }) {
  if (props.section === "visao-geral") return <Overview {...props} />;
  if (props.section === "vendas") return <SalesPage {...props} />;
  if (props.section === "cmv") return <CmvPage {...props} />;
  if (props.section === "despesas") return <ExpensesPage {...props} />;
  if (props.section === "planejamento") return <PlanningPage {...props} />;
  if (props.section === "cadastros") return <CatalogPage {...props} />;
  if (props.section === "importacoes") return <ImportsPage {...props} />;
  const content: Record<Exclude<Section, "visao-geral" | "vendas" | "cmv" | "despesas" | "planejamento" | "cadastros" | "importacoes">, { eyebrow: string; title: string; description: string; action: string; icon: React.ReactNode; columns: string[] }> = {
    estoque: { eyebrow: "Operação", title: "Estoque e movimentações", description: "Visualize saldos, entradas, perdas e contagens do bar.", action: "Nova contagem", icon: <PackageSearch size={19} />, columns: ["Item", "Área", "Unidade", "Saldo atual", "Custo médio", "Situação"] },
    configuracoes: { eyebrow: "Administração", title: "Configurações e acessos", description: "Gerencie usuários, dados do negócio e histórico de alterações.", action: "Convidar usuário", icon: <UsersRound size={19} />, columns: ["Usuário", "E-mail", "Perfil", "Status", "Último acesso"] },
  };
  const current = content[props.section];
  return <section className="module-page"><ModuleHero {...current} /><div className="data-table-card"><div className="data-table-head">{current.columns.map((column) => <span key={column}>{column}</span>)}</div><div className="empty-table"><div>{current.icon}</div><h3>Este módulo será a próxima etapa</h3><p>Vendas e despesas já usam a base central. Agora podemos conectar este módulo aos mesmos dados.</p></div></div></section>;
}

function ModuleHero({ eyebrow, title, description, action, icon, onAction }: { eyebrow: string; title: string; description: string; action: string; icon: React.ReactNode; onAction?: () => void }) {
  return <div className="module-hero"><div className="module-icon">{icon}</div><div><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div><button onClick={onAction}>{action}</button></div>;
}

type FinancialDay = { date: string; revenue: number; expenses: number; result: number };

function datesInRange(range: DateRange) { return Array.from({ length: rangeDays(range) }, (_, index) => shiftDate(range.start, index)); }
function expensesInRange(rows: Expense[], range: DateRange) { return rows.filter((row) => row.expense_date >= range.start && row.expense_date <= range.end); }
function salesInRange(rows: Sale[], range: DateRange) { return rows.filter((row) => row.business_date >= range.start && row.business_date <= range.end); }
function reportRevenue(rows: Sale[]) { return rows.reduce((sum, row) => sum + Number(row.revenue_amount ?? row.closing_net_amount ?? row.gross_amount), 0); }

function Overview({ sales, expenses, data, setSection, range }: Parameters<typeof SectionContent>[0]) {
  const [dayOverride, setDayOverride] = useState("");
  const previousRange = previousEquivalentRange(range);
  const selectedDay = dayOverride >= range.start && dayOverride <= range.end ? dayOverride : range.end;
  const zigConnected = data.zig.sync.some((row) => row.status === "completed" && !!row.last_success_at);
  const previousSales = salesInRange(data.sales, previousRange);
  const previousExpenses = expensesInRange(data.expenses, previousRange);
  const revenue = zigConnected ? Number(data.zig.summary.net_cents) / 100 : reportRevenue(sales);
  const previousRevenue = zigConnected ? Number(data.previousZig.summary.net_cents) / 100 : reportRevenue(previousSales);
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount), 0);
  const previousExpenseTotal = previousExpenses.reduce((sum, row) => sum + Number(row.amount), 0);
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
  const expenseByDay = new Map<string, number>();
  expenses.forEach((row) => expenseByDay.set(row.expense_date, (expenseByDay.get(row.expense_date) ?? 0) + Number(row.amount)));
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

  return <section className="overview-page finance-dashboard">
    <div className="overview-intro finance-intro"><div><p className="page-kicker">Dashboard financeira</p><h2>Como está o caixa do Dopamina?</h2><span>{periodLabel} · comparação com {previousLabel}</span></div><button className="accent-button" onClick={() => setSection("vendas")}><FileUp size={17} /> Sincronizar com a Zig</button></div>
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
    <p className="finance-data-note"><TriangleAlert size={15} /> Resultado e margem são operacionais e estimados: consideram faturamento menos despesas cadastradas, sem incluir CMV nesta etapa. Custos não lançados no ERP não aparecem no cálculo.</p>
  </section>;
}

function SalesPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const apiHasData = props.data.zig.sync.some((row) => row.status === "completed" && !!row.last_success_at);
  const gross = apiHasData ? Number(props.data.zig.summary.gross_cents) / 100 : props.sales.reduce((sum, sale) => sum + Number(sale.gross_amount), 0);
  const discounts = apiHasData ? Number(props.data.zig.summary.discount_cents) / 100 : props.sales.reduce((sum, sale) => sum + Number(sale.discount_amount), 0);
  const revenue = apiHasData ? Number(props.data.zig.summary.revenue_cents) / 100 : props.sales.reduce((sum, sale) => sum + Number(sale.revenue_amount ?? sale.gross_amount), 0);
  const quantity = apiHasData ? Number(props.data.zig.summary.quantity) : props.saleItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const grouped = useMemo(() => {
    if (apiHasData) return props.data.zig.products.filter((row) => `${row.name} ${row.category} ${row.area}`.toLowerCase().includes(query.toLowerCase())).map((row) => ({ name: row.name, category: row.category, area: row.area, quantity: Number(row.quantity), gross: Number(row.gross_cents) / 100, discount: Number(row.discount_cents) / 100, net: Number(row.net_cents) / 100 })).sort((a, b) => b.net - a.net);
    const map = new Map<string, { name: string; category: string; area: string; quantity: number; gross: number; discount: number; net: number }>();
    for (const row of props.saleItems) {
      const item = nested(row.items); const category = nested(item?.categories)?.name ?? "Sem categoria"; const area = nested(row.areas)?.name ?? "Geral"; const name = item?.name ?? "Produto";
      const key = `${name}|${area}`; const current = map.get(key) ?? { name, category, area, quantity: 0, gross: 0, discount: 0, net: 0 };
      current.quantity += Number(row.quantity); current.gross += Number(row.gross_amount); current.discount += Number(row.discount_amount); current.net += Number(row.gross_amount) - Number(row.discount_amount); map.set(key, current);
    }
    return [...map.values()].filter((row) => `${row.name} ${row.category} ${row.area}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.net - a.net);
  }, [apiHasData, props.data.zig.products, props.saleItems, query]);
  const apiPayments = props.data.zig.payments.map((row, index) => ({ id: `zig-${index}`, import_id: "zig", payment_method: row.payment_name, amount: Number(row.value_cents) / 100, percentage: revenue ? Number(row.value_cents) / 100 / revenue : 0 }));
  async function synchronize() { setSyncing(true); setSyncMessage(""); const { data: session } = await supabase.auth.getSession(); const token = session.session?.access_token; if (!token) { setSyncMessage("Sua sessão expirou. Entre novamente."); setSyncing(false); return; } try { const response = await fetch("/api/zig/sync", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ startDate: props.range.start, endDate: props.range.end }) }); const result = await response.json() as { error?: string; status?: string; results?: { endpoint: string; date: string; status: string; error?: string }[] }; const detailedError = result.error ?? result.results?.find((row) => row.status === "failed")?.error; if (!response.ok) throw new Error(detailedError ?? "A sincronização falhou sem informar o motivo."); setSyncMessage(result.status === "partial" ? `Sincronização parcial${detailedError ? `: ${detailedError}` : ". Consulte o histórico de integrações."}` : "Sincronização concluída com dados reais da Zig."); await props.onRefresh(); } catch (error) { setSyncMessage(error instanceof Error ? error.message : "Não foi possível sincronizar a Zig."); } finally { setSyncing(false); } }
  return <section><ModuleHero eyebrow="Resultados" title="Vendas e faturamento" description={apiHasData ? "Dados reais sincronizados da API Zig; estornos são excluídos dos totais." : "Sem dados da API neste período; exibindo o relatório disponível quando houver."} action={syncing ? "Sincronizando..." : "Sincronizar agora"} icon={<ShoppingCart size={19} />} onAction={syncing ? undefined : synchronize} />
    {syncMessage && <div className={syncMessage.includes("concluída") ? "sync-message success" : "sync-message"}>{syncMessage}</div>}
    <div className="section-kpis"><MiniKpi label="Faturamento bruto" value={MONEY.format(gross)} /><MiniKpi label="Receita do período" value={MONEY.format(revenue)} /><MiniKpi label="Descontos" value={MONEY.format(discounts)} /><MiniKpi label="Itens vendidos" value={NUMBER.format(quantity)} /></div>
    <div className="sales-layout"><article className="chart-card"><div className="card-title-row"><div><p>Recebimentos</p><h3>Formas de pagamento</h3></div><span>{apiHasData ? "API Zig" : "Relatório"}</span></div><PaymentBars payments={apiHasData ? apiPayments : props.data.payments} sales={apiHasData ? [{ import_id: "zig" } as Sale] : props.sales} /></article><article className="chart-card"><div className="card-title-row"><div><p>Ranking</p><h3>Top produtos</h3></div></div><Ranking rows={grouped.slice(0, 6)} /></article></div>
    <div className="module-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, categoria ou área" /></label><span className="table-count">{grouped.length} combinações</span></div>
    <div className="data-table-card"><div className="responsive-table sales-table"><div className="table-row table-header"><span>Produto</span><span>Categoria</span><span>Área</span><span>Quantidade</span><span>Descontos</span><span>Valor líquido</span></div>{grouped.length ? grouped.map((row) => <div className="table-row" key={`${row.name}-${row.area}`}><strong>{row.name}</strong><span>{row.category}</span><span>{row.area}</span><span>{NUMBER.format(row.quantity)}</span><span>{MONEY.format(row.discount)}</span><strong>{MONEY.format(row.net)}</strong></div>) : <EmptyMini text="Nenhuma venda encontrada no período." />}</div></div>
    <button className="spreadsheet-fallback" onClick={() => setShowImport(true)}><FileSpreadsheet size={15} /> Importar planilhas como contingência</button>
    {showImport && <ImportModal businessId={props.businessId} onClose={() => setShowImport(false)} onImported={async () => { await props.onRefresh(); setShowImport(false); }} />}
  </section>;
}

function CmvPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const automaticRows = automaticCmvRows(props.data);
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

function CatalogPage(props: Parameters<typeof SectionContent>[0]) {
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [editingIngredient, setEditingIngredient] = useState<CatalogItem | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"products" | "ingredients">("products");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "cost" | "recipe">("all");
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
  const source = view === "products" ? props.data.catalogItems : props.data.ingredients;
  const rows = source.filter((item) => {
    const matchesQuery = `${item.name} ${item.sku ?? ""} ${nested(item.categories)?.name ?? ""} ${nested(item.areas)?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (view === "ingredients" || statusFilter === "all" || statusOf(item) === statusFilter);
  });
  const ready = props.data.catalogItems.filter((item) => statusOf(item) === "ready").length;
  const missingCost = props.data.catalogItems.filter((item) => statusOf(item) === "cost").length;
  const missingRecipe = props.data.catalogItems.filter((item) => statusOf(item) === "recipe").length;
  const linked = props.data.catalogItems.filter((item) => item.zig_product_id).length;
  return <section><ModuleHero eyebrow="Base central" title="Produtos e fichas técnicas" description="Cadastre custos simples ou monte receitas para copões, drinks e porções." action="Novo ingrediente" icon={<ClipboardList size={22} />} onAction={() => setEditingIngredient("new")} />
    <div className="section-kpis"><MiniKpi label="Produtos" value={String(props.data.catalogItems.length)} /><MiniKpi label="Prontos" value={String(ready)} /><MiniKpi label="Falta custo" value={String(missingCost)} /><MiniKpi label="Falta ficha" value={String(missingRecipe)} /></div>
    {(missingCost + missingRecipe) > 0 && <div className="data-warning"><TriangleAlert size={19} /><div><strong>{missingCost + missingRecipe} cadastro(s) precisam de atenção</strong><span>O CMV só usa valores comprovados. Complete o custo ou a ficha técnica para aumentar a cobertura.</span></div></div>}
    <div className="catalog-tabs" role="tablist" aria-label="Tipo de cadastro"><button type="button" role="tab" aria-selected={view === "products"} className={view === "products" ? "active" : ""} onClick={() => setView("products")}><PackageSearch size={16} /> Produtos <span>{props.data.catalogItems.length}</span></button><button type="button" role="tab" aria-selected={view === "ingredients"} className={view === "ingredients" ? "active" : ""} onClick={() => setView("ingredients")}><Boxes size={16} /> Ingredientes <span>{props.data.ingredients.length}</span></button></div>
    <div className="module-toolbar catalog-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "products" ? "Buscar produto, SKU, categoria ou área" : "Buscar ingrediente"} /></label>{view === "products" && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filtrar por status"><option value="all">Todos os status</option><option value="ready">Prontos</option><option value="cost">Falta custo</option><option value="recipe">Falta ficha técnica</option></select>}<span className="table-count">{rows.length} cadastro(s) · {linked} ligados à Zig</span></div>
    <div className="data-table-card"><div className="responsive-table catalog-table"><div className="table-row table-header"><span>{view === "products" ? "Produto" : "Ingrediente"}</span><span>Categoria</span><span>{view === "products" ? "Tipo" : "Unidade"}</span><span>{view === "products" ? "Preço de venda" : "Uso"}</span><span>Custo vigente</span><span>Status</span><span></span></div>{rows.length ? rows.map((item) => { const cost = Number(item.average_unit_cost ?? item.latest_unit_cost ?? 0); const status = view === "products" ? statusOf(item) : (cost > 0 ? "ready" : "cost"); return <div className="table-row" key={item.id}><strong>{item.name}<small className="sku-hint">{item.sku || (item.zig_product_id ? "Zig conectada" : "Cadastro manual")}</small></strong><span>{nested(item.categories)?.name ?? "Sem categoria"}</span><span>{view === "products" ? (item.costing_method === "recipe" ? "Preparado" : "Simples") : item.consumption_unit}</span><span>{view === "products" ? (item.sale_price === null ? "—" : MONEY.format(Number(item.sale_price))) : "Por ficha"}</span><strong>{cost > 0 ? MONEY.format(cost) : "—"}</strong><span className={`cost-badge ${status === "ready" ? "known" : "missing"}`}>{status === "ready" ? "Pronto" : status === "recipe" ? "Falta ficha" : "Falta custo"}</span><span className="row-actions"><button onClick={() => view === "products" ? setEditing(item) : setEditingIngredient(item)} aria-label={`Editar ${item.name}`}><Pencil size={15} /></button></span></div>; }) : <EmptyMini text={view === "products" ? "Nenhum produto encontrado." : "Nenhum ingrediente cadastrado. Use “Novo ingrediente” para começar uma ficha técnica."} />}</div></div>
    {editing && <ProductEditorModal businessId={props.businessId} item={editing} data={props.data} onClose={() => setEditing(null)} onRefresh={props.onRefresh} />}
    {editingIngredient && <IngredientModal businessId={props.businessId} item={editingIngredient === "new" ? null : editingIngredient} onClose={() => setEditingIngredient(null)} onSaved={async () => { await props.onRefresh(); setEditingIngredient(null); }} />}
  </section>;
}

type RecipeDraftItem = { ingredientId: string; quantity: string; waste: string };

function costAt(item: CatalogItem, date: string, history: CostHistory[]) {
  const version = history.find((row) => String(row.item_id) === String(item.id) && row.effective_from <= date);
  return Number(version?.unit_cost ?? item.average_unit_cost ?? item.latest_unit_cost ?? 0);
}

function ProductEditorModal({ businessId, item, data, onClose, onRefresh }: { businessId: string; item: CatalogItem; data: DataState; onClose: () => void; onRefresh: () => Promise<void> }) {
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
  const [form, setForm] = useState({ forecast_type: "revenue" as "revenue" | "expense", period_start: range.start, period_end: range.end, amount: "", area_id: "", notes: "" });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) { event.preventDefault(); const amount = Number(form.amount.replace(",", ".")); if (!Number.isFinite(amount) || amount <= 0 || form.period_start > form.period_end) return setMessage("Informe um período válido e um valor maior que zero."); setBusy(true); const { error } = await supabase.from("forecasts").insert({ business_id: Number(businessId), area_id: form.area_id ? Number(form.area_id) : null, forecast_type: form.forecast_type, period_start: form.period_start, period_end: form.period_end, amount, notes: form.notes.trim() || null, created_by: userId }); if (error) { setMessage("Não foi possível salvar a previsão."); setBusy(false); return; } await onSaved(); }
  return <div className="modal-backdrop"><form className="modal-card expense-modal" onSubmit={save}><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Planejamento</p><h2>Nova previsão</h2><div className="form-grid"><label><span>Tipo</span><select value={form.forecast_type} onChange={(event) => setForm({ ...form, forecast_type: event.target.value as "revenue" | "expense" })}><option value="revenue">Receita</option><option value="expense">Despesa</option></select></label><label><span>Área</span><select value={form.area_id} onChange={(event) => setForm({ ...form, area_id: event.target.value })}><option value="">Geral</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label><span>Início</span><input type="date" value={form.period_start} onChange={(event) => setForm({ ...form, period_start: event.target.value })} /></label><label><span>Fim</span><input type="date" value={form.period_end} onChange={(event) => setForm({ ...form, period_end: event.target.value })} /></label><label className="span-2"><span>Valor previsto</span><input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} inputMode="decimal" placeholder="0,00" /></label><label className="span-2"><span>Observação</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Contexto da meta" /></label></div>{message && <p className="modal-message">{message}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button className="modal-primary" disabled={busy}>{busy ? "Salvando..." : "Salvar previsão"}</button></div></form></div>;
}

function ExpensesPage(props: Parameters<typeof SectionContent>[0]) {
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [query, setQuery] = useState("");
  const rows = props.expenses.filter((expense) => `${expense.description} ${expense.category} ${expense.payment_method ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const total = rows.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const paid = rows.filter((expense) => expense.status === "completed").reduce((sum, expense) => sum + Number(expense.amount), 0);
  const pending = rows.filter((expense) => expense.status === "pending").reduce((sum, expense) => sum + Number(expense.amount), 0);
  async function remove(expense: Expense) {
    if (!confirm(`Excluir a despesa “${expense.description}”?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id).eq("business_id", props.businessId);
    if (error) return alert("Não foi possível excluir a despesa.");
    await props.onRefresh();
  }
  return <section><ModuleHero eyebrow="Financeiro" title="Despesas" description="Cadastre, acompanhe e filtre todos os gastos do bar em uma única base." action="Nova despesa" icon={<ReceiptText size={19} />} onAction={() => setEditing("new")} />
    <div className="section-kpis"><MiniKpi label="Total lançado" value={MONEY.format(total)} /><MiniKpi label="Pago" value={MONEY.format(paid)} /><MiniKpi label="Pendente" value={MONEY.format(pending)} /><MiniKpi label="Lançamentos" value={String(rows.length)} /></div>
    <div className="module-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar despesa, categoria ou pagamento" /></label><span className="table-count">{props.refreshing ? "Atualizando..." : `${rows.length} lançamento(s)`}</span></div>
    <div className="data-table-card"><div className="responsive-table expenses-table"><div className="table-row table-header"><span>Data</span><span>Descrição</span><span>Categoria</span><span>Pagamento</span><span>Status</span><span>Valor</span><span></span></div>{rows.length ? rows.map((expense) => <div className="table-row" key={expense.id}><span>{dateLabel(expense.expense_date)}</span><strong>{expense.description}{expense.is_recurring && <small className="recurring-badge">Recorrente</small>}</strong><span>{expense.category}</span><span>{expense.payment_method || "—"}</span><StatusBadge status={expense.status} /><strong>{MONEY.format(expense.amount)}</strong><span className="row-actions"><button onClick={() => setEditing(expense)} aria-label={`Editar ${expense.description}`}><Pencil size={15} /></button><button onClick={() => remove(expense)} aria-label={`Excluir ${expense.description}`}><Trash2 size={15} /></button></span></div>) : <EmptyMini text="Nenhuma despesa cadastrada neste período." />}</div></div>
    {editing && <ExpenseModal businessId={props.businessId} userId={props.userId} expense={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await props.onRefresh(); setEditing(null); }} />}
  </section>;
}

function ImportsPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  return <section><ModuleHero eyebrow="Integrações" title="Integração Zig" description="A API é a fonte principal; planilhas permanecem disponíveis como contingência e para dados ainda sem endpoint." action="Enviar planilhas" icon={<FileSpreadsheet size={19} />} onAction={() => setShowImport(true)} />
    <div className="sync-state-grid">{(["saida-produtos", "faturamento"] as const).map((endpoint) => { const state = props.data.zig.sync.find((row) => row.endpoint === endpoint); return <article key={endpoint}><span>{endpoint === "saida-produtos" ? "Produtos vendidos" : "Faturamento"}</span><strong className={state?.status === "completed" ? "success-text" : "warning-text"}>{state?.status === "completed" ? "Sincronizado" : state?.status === "failed" ? "Falhou" : "Aguardando configuração"}</strong><small>{state?.last_successful_date ? `Último dia: ${dateLabel(state.last_successful_date)}` : "Nenhuma execução concluída"}</small></article>; })}</div>
    <div className="data-table-card imports-card"><div className="responsive-table imports-table"><div className="table-row table-header"><span>Período</span><span>Arquivo</span><span>Linhas</span><span>Status</span><span>Importado em</span></div>{props.data.imports.length ? props.data.imports.map((row) => <div className="table-row" key={row.id}><span>{dateLabel(row.period_start)} a {dateLabel(row.period_end)}</span><strong>{row.file_name}</strong><span>{row.row_count}</span><StatusBadge status={row.status as Expense["status"]} /><span>{DATE.format(new Date(row.created_at))}</span></div>) : <EmptyMini text="Nenhuma planilha importada." />}</div></div>{showImport && <ImportModal businessId={props.businessId} onClose={() => setShowImport(false)} onImported={async () => { await props.onRefresh(); setShowImport(false); }} />}</section>;
}

function ImportModal({ businessId, onClose, onImported }: { businessId: string; onClose: () => void; onImported: () => Promise<void> }) {
  const closingRef = useRef<HTMLInputElement>(null); const productsRef = useRef<HTMLInputElement>(null);
  const [closing, setClosing] = useState<File | null>(null); const [products, setProducts] = useState<File | null>(null);
  const [preview, setPreview] = useState<ZigImportPayload | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function analyze() { if (!closing || !products) return setMessage("Selecione os dois relatórios do mesmo período."); setBusy(true); setMessage(""); try { setPreview(await parseZigReports(closing, products)); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível analisar os arquivos."); } finally { setBusy(false); } }
  async function importData() { if (!preview) return; setBusy(true); setMessage(""); const { error } = await supabase.rpc("import_zig_sales", { p_business_id: Number(businessId), p_file_name: preview.fileName, p_file_checksum: preview.checksum, p_period_start: preview.periodStart, p_period_end: preview.periodEnd, p_summary: preview.summary, p_products: preview.products, p_payment_methods: preview.paymentMethods }); if (error) { setMessage(error.message.includes("período") ? "Esse período já foi importado. Os dados existentes foram preservados." : error.message); setBusy(false); return; } await onImported(); }
  return <div className="modal-backdrop" role="presentation"><div className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Importação segura</p><h2 id="import-title">Relatórios da Zig</h2><p className="modal-description">Envie o fechamento e os produtos vendidos do mesmo período. O sistema confere os totais antes de gravar.</p>
    {!preview ? <><div className="upload-grid"><button className={closing ? "file-drop selected" : "file-drop"} onClick={() => closingRef.current?.click()}><FileSpreadsheet size={25} /><strong>{closing?.name ?? "Relatório de fechamento"}</strong><span>{closing ? "Arquivo selecionado" : "Selecionar .xlsx"}</span></button><button className={products ? "file-drop selected" : "file-drop"} onClick={() => productsRef.current?.click()}><ShoppingCart size={25} /><strong>{products?.name ?? "Produtos vendidos"}</strong><span>{products ? "Arquivo selecionado" : "Selecionar .xlsx"}</span></button></div><input ref={closingRef} hidden type="file" accept=".xlsx" onChange={(event) => setClosing(event.target.files?.[0] ?? null)} /><input ref={productsRef} hidden type="file" accept=".xlsx" onChange={(event) => setProducts(event.target.files?.[0] ?? null)} /><button className="modal-primary" onClick={analyze} disabled={busy || !closing || !products}>{busy ? "Analisando..." : "Conferir relatórios"}</button></> : <><div className="import-preview"><div><span>Período</span><strong>{dateLabel(preview.periodStart)} a {dateLabel(preview.periodEnd)}</strong></div><div><span>Produtos vendidos</span><strong>{MONEY.format(preview.summary.product_gross_amount)}</strong></div><div><span>Descontos</span><strong>{MONEY.format(preview.summary.discount_amount)}</strong></div><div><span>Receita</span><strong>{MONEY.format(preview.summary.revenue_amount)}</strong></div><div><span>Linhas</span><strong>{preview.products.length}</strong></div><div><span>Conciliação</span><strong className="success-text"><CheckCircle2 size={16} /> Aprovada</strong></div></div><div className="modal-actions"><button className="modal-secondary" onClick={() => setPreview(null)}>Trocar arquivos</button><button className="modal-primary" onClick={importData} disabled={busy}>{busy ? "Importando..." : "Importar para o painel"}</button></div></>}{message && <p className="modal-message">{message}</p>}</div></div>;
}

function AnalyticsImportModal({ businessId, onClose, onImported }: { businessId: string; onClose: () => void; onImported: () => Promise<void> }) {
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
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [form, setForm] = useState({ description: expense?.description ?? "", category: expense?.category ?? "Operacional", expense_date: expense?.expense_date ?? new Date().toISOString().slice(0, 10), due_date: expense?.due_date ?? "", amount: expense?.amount ? String(expense.amount) : "", payment_method: expense?.payment_method ?? "", status: expense?.status ?? "pending", is_recurring: expense?.is_recurring ?? false });
  function field(name: string, value: string | boolean) { setForm((current) => ({ ...current, [name]: value })); }
  async function save(event: React.FormEvent) { event.preventDefault(); const amount = Number(String(form.amount).replace(",", ".")); if (!form.description.trim() || !Number.isFinite(amount) || amount <= 0) return setMessage("Preencha a descrição e um valor maior que zero."); setBusy(true); const payload = { business_id: Number(businessId), description: form.description.trim(), category: form.category, expense_date: form.expense_date, due_date: form.due_date || null, amount, payment_method: form.payment_method || null, status: form.status, is_recurring: form.is_recurring, paid_at: form.status === "completed" ? expense?.paid_at ?? new Date().toISOString() : null, created_by: userId }; const query = expense ? supabase.from("expenses").update(payload).eq("id", expense.id).eq("business_id", Number(businessId)) : supabase.from("expenses").insert(payload); const { error } = await query; if (error) { setMessage("Não foi possível salvar a despesa."); setBusy(false); return; } await onSaved(); }
  return <div className="modal-backdrop"><form className="modal-card expense-modal" onSubmit={save}><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar"><X size={19} /></button><p className="page-kicker">Financeiro</p><h2>{expense ? "Editar despesa" : "Nova despesa"}</h2><div className="form-grid"><label className="span-2"><span>Descrição</span><input value={form.description} onChange={(e) => field("description", e.target.value)} placeholder="Ex.: Energia elétrica" autoFocus /></label><label><span>Categoria</span><select value={form.category} onChange={(e) => field("category", e.target.value)}><option>Operacional</option><option>Fornecedor</option><option>Pessoal</option><option>Aluguel</option><option>Marketing</option><option>Impostos</option><option>Manutenção</option><option>Outros</option></select></label><label><span>Valor</span><input value={form.amount} onChange={(e) => field("amount", e.target.value)} inputMode="decimal" placeholder="0,00" /></label><label><span>Data da despesa</span><input type="date" value={form.expense_date} onChange={(e) => field("expense_date", e.target.value)} /></label><label><span>Vencimento</span><input type="date" value={form.due_date} onChange={(e) => field("due_date", e.target.value)} /></label><label><span>Pagamento</span><input value={form.payment_method} onChange={(e) => field("payment_method", e.target.value)} placeholder="PIX, cartão, boleto..." /></label><label><span>Status</span><select value={form.status} onChange={(e) => field("status", e.target.value)}><option value="pending">Pendente</option><option value="completed">Pago</option><option value="draft">Rascunho</option></select></label><label className="check-label span-2"><input type="checkbox" checked={form.is_recurring} onChange={(e) => field("is_recurring", e.target.checked)} /><span>Esta é uma despesa recorrente</span></label></div>{message && <p className="modal-message">{message}</p>}<div className="modal-actions"><button type="button" className="modal-secondary" onClick={onClose}>Cancelar</button><button className="modal-primary" disabled={busy}>{busy ? "Salvando..." : "Salvar despesa"}</button></div></form></div>;
}

function PaymentBars({ payments, sales }: { payments: PaymentMethod[]; sales: Sale[] }) { const imports = new Set(sales.map((sale) => String(sale.import_id))); const rows = payments.filter((payment) => imports.has(String(payment.import_id))).sort((a, b) => b.amount - a.amount); const max = Math.max(...rows.map((row) => Number(row.amount)), 1); return rows.length ? <div className="bar-list">{rows.map((row) => <div key={row.id}><span>{row.payment_method}</span><div><i style={{ width: `${Number(row.amount) / max * 100}%` }} /></div><strong>{MONEY.format(row.amount)}</strong></div>)}</div> : <EmptyMini text="Sem formas de pagamento no período." />; }
function CoverageBar({ known, missing }: { known: number; missing: number }) { const total = known + missing; const percentage = total ? known / total * 100 : 0; return <div className="coverage-panel"><div className="coverage-track"><i style={{ width: `${percentage}%` }} /></div><div className="coverage-legend"><span><i className="known-dot" />Com custo <strong>{MONEY.format(known)}</strong></span><span><i className="missing-dot" />Sem custo <strong>{MONEY.format(missing)}</strong></span></div></div>; }
function AbcSummary({ rows }: { rows: { classification: "A" | "B" | "C"; total_value: number }[] }) { if (!rows.length) return <EmptyMini text="Sem vendas suficientes para calcular a Curva ABC." />; const groups = (["A", "B", "C"] as const).map((classification) => ({ classification, count: rows.filter((row) => row.classification === classification).length, value: rows.filter((row) => row.classification === classification).reduce((sum, row) => sum + Number(row.total_value), 0) })); return <div className="abc-summary">{groups.map((group) => <div key={group.classification}><b className={`abc-class class-${group.classification.toLowerCase()}`}>{group.classification}</b><span>{group.count} item(ns)</span><strong>{MONEY.format(group.value)}</strong></div>)}</div>; }
function Ranking({ rows }: { rows: { name: string; net: number; quantity: number }[] }) { return rows.length ? <div className="ranking-list">{rows.map((row, index) => <div key={row.name}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{row.name}</strong><small>{NUMBER.format(row.quantity)} unidades</small></div><b>{MONEY.format(row.net)}</b></div>)}</div> : <EmptyMini text="Sem produtos no período." />; }
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
