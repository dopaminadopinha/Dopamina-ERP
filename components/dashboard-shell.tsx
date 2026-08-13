"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, BarChart3, Boxes, Building2, CalendarRange,
  CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList, FileSpreadsheet,
  FileUp, LayoutDashboard, LogOut, Menu, PackageSearch, PanelLeftClose, Pencil,
  ReceiptText, Search, Settings, ShoppingCart, Trash2, TrendingUp, TriangleAlert,
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
type ProfitabilityImport = { id: string; sale_id: string; period_start: string; period_end: string; source_revenue: number; known_cost_total: number; row_count: number; missing_cost_count: number; created_at: string };
type ProfitabilityItem = { id: string; import_id: string; source_product_name: string; source_sku: string | null; source_category: string | null; quantity: number; gross_amount: number; unit_cost: number | null; total_cost: number | null; profit_amount: number; margin_percentage: number; cmv_percentage: number; cost_status: "known" | "missing" };
type AbcImport = { id: string; file_name: string; total_value: number; row_count: number; missing_cost_count: number; created_at: string };
type AbcItem = { id: string; import_id: string; source_product_name: string; source_sku: string | null; quantity: number; average_unit_cost: number | null; total_value: number; individual_percentage: number; cumulative_percentage: number; classification: "A" | "B" | "C" };
type DataState = { sales: Sale[]; saleItems: SaleItem[]; payments: PaymentMethod[]; expenses: Expense[]; imports: ImportRow[]; profitabilityImports: ProfitabilityImport[]; profitabilityItems: ProfitabilityItem[]; abcImports: AbcImport[]; abcItems: AbcItem[]; products: number; suppliers: number; areas: Area[] };

const EMPTY_DATA: DataState = { sales: [], saleItems: [], payments: [], expenses: [], imports: [], profitabilityImports: [], profitabilityItems: [], abcImports: [], abcItems: [], products: 0, suppliers: 0, areas: [] };
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
  { id: "importacoes", label: "Importações", icon: <FileUp size={19} /> },
  { id: "configuracoes", label: "Configurações", icon: <Settings size={19} /> },
];

function nested<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function dateLabel(value: string | null) { return value ? DATE.format(new Date(`${value}T00:00:00Z`)) : "—"; }
function getBusinessName(membership: Membership | null) { return nested(membership?.businesses)?.name ?? "Dopamina"; }

async function fetchData(businessId: string): Promise<DataState> {
  const [sales, expenses, products, suppliers, areas, imports, profitabilityImports, abcImports] = await Promise.all([
    supabase.from("sales").select("id,import_id,period_start,period_end,business_date,gross_amount,discount_amount,product_gross_amount,service_amount,revenue_amount,closing_net_amount,open_accounts_amount,recharge_balance_amount,sales_imports(file_name,row_count,created_at)").eq("business_id", businessId).order("business_date", { ascending: false }),
    supabase.from("expenses").select("id,category,description,expense_date,due_date,paid_at,amount,payment_method,status,is_recurring").eq("business_id", businessId).neq("status", "cancelled").order("expense_date", { ascending: false }),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("item_type", "product"),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("areas").select("id,name").eq("business_id", businessId).eq("is_active", true).order("sort_order"),
    supabase.from("sales_imports").select("id,file_name,period_start,period_end,row_count,status,created_at").eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase.from("zig_profitability_imports").select("id,sale_id,period_start,period_end,source_revenue,known_cost_total,row_count,missing_cost_count,created_at").eq("business_id", businessId).order("period_end", { ascending: false }),
    supabase.from("zig_abc_imports").select("id,file_name,total_value,row_count,missing_cost_count,created_at").eq("business_id", businessId).order("created_at", { ascending: false }),
  ]);
  const firstError = [sales.error, expenses.error, products.error, suppliers.error, areas.error, imports.error, profitabilityImports.error, abcImports.error].find(Boolean);
  if (firstError) throw firstError;
  const saleIds = (sales.data ?? []).map((sale) => sale.id);
  const importIds = (sales.data ?? []).map((sale) => sale.import_id).filter(Boolean) as string[];
  const profitabilityIds = (profitabilityImports.data ?? []).map((row) => row.id);
  const latestAbcId = abcImports.data?.[0]?.id;
  const [items, payments, profitabilityItems, abcItems] = await Promise.all([
    saleIds.length ? supabase.from("sale_items").select("id,sale_id,quantity,gross_amount,discount_amount,transaction_type,items(name,sku,categories(name)),areas(name)").in("sale_id", saleIds) : Promise.resolve({ data: [], error: null }),
    importIds.length ? supabase.from("sales_payment_methods").select("id,import_id,payment_method,amount,percentage").in("import_id", importIds) : Promise.resolve({ data: [], error: null }),
    profitabilityIds.length ? supabase.from("zig_profitability_items").select("id,import_id,source_product_name,source_sku,source_category,quantity,gross_amount,unit_cost,total_cost,profit_amount,margin_percentage,cmv_percentage,cost_status").in("import_id", profitabilityIds) : Promise.resolve({ data: [], error: null }),
    latestAbcId ? supabase.from("zig_abc_items").select("id,import_id,source_product_name,source_sku,quantity,average_unit_cost,total_value,individual_percentage,cumulative_percentage,classification").eq("import_id", latestAbcId).order("cumulative_percentage") : Promise.resolve({ data: [], error: null }),
  ]);
  const detailError = [items.error, payments.error, profitabilityItems.error, abcItems.error].find(Boolean);
  if (detailError) throw detailError;
  return { sales: (sales.data ?? []) as unknown as Sale[], saleItems: (items.data ?? []) as unknown as SaleItem[], payments: (payments.data ?? []) as PaymentMethod[], expenses: (expenses.data ?? []) as Expense[], imports: (imports.data ?? []) as ImportRow[], profitabilityImports: (profitabilityImports.data ?? []) as ProfitabilityImport[], profitabilityItems: (profitabilityItems.data ?? []) as ProfitabilityItem[], abcImports: (abcImports.data ?? []) as AbcImport[], abcItems: (abcItems.data ?? []) as AbcItem[], products: products.count ?? 0, suppliers: suppliers.count ?? 0, areas: (areas.data ?? []) as Area[] };
}

export function DashboardShell() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("visao-geral");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<DataState>(EMPTY_DATA);
  const [fatalError, setFatalError] = useState("");
  const [period, setPeriod] = useState("all");

  async function refresh(businessId = membership?.business_id) {
    if (!businessId) return;
    setRefreshing(true);
    try { setData(await fetchData(businessId)); } catch { setFatalError("Não foi possível carregar os dados do painel."); }
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
        try { setData(await fetchData(current.business_id)); } catch { setFatalError("Não foi possível carregar os dados do painel."); }
      }
      setLoading(false);
    }
    load();
    const { data: auth } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") router.replace("/"); });
    return () => { active = false; auth.subscription.unsubscribe(); };
  }, [router]);

  const activeNav = NAV_ITEMS.find((item) => item.id === section) ?? NAV_ITEMS[0];
  const visibleSales = period === "all" ? data.sales : data.sales.filter((sale) => `${sale.period_start}|${sale.period_end}` === period);
  const selectedSaleIds = new Set(visibleSales.map((sale) => String(sale.id)));
  const visibleItems = data.saleItems.filter((item) => selectedSaleIds.has(String(item.sale_id)));
  const visibleExpenses = period === "all" ? data.expenses : data.expenses.filter((expense) => { const [start, end] = period.split("|"); return expense.expense_date >= start && expense.expense_date <= end; });
  const visibleProfitabilityImports = period === "all" ? data.profitabilityImports : data.profitabilityImports.filter((row) => `${row.period_start}|${row.period_end}` === period);
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
      <div className="sidebar-brand"><div className="sidebar-logo"><Image src="/dopamina-logo.png" alt="Dopamina" width={54} height={50} unoptimized /></div><div className="sidebar-brand-copy"><strong>Dopamina</strong><span>Gestão integrada</span></div><button className="close-sidebar-mobile" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={20} /></button></div>
      <div className="sidebar-context"><Building2 size={17} /><div><span>Unidade</span><strong>{getBusinessName(membership)}</strong></div><ChevronDown size={15} /></div>
      <nav className="sidebar-nav" aria-label="Navegação principal"><span className="nav-caption">Principal</span>{NAV_ITEMS.slice(0, 6).map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setSidebarOpen(false); }} title={item.label}>{item.icon}<span>{item.label}</span></button>)}<span className="nav-caption nav-caption-space">Sistema</span>{NAV_ITEMS.slice(6).map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setSidebarOpen(false); }} title={item.label}>{item.icon}<span>{item.label}</span></button>)}</nav>
      <div className="sidebar-footer"><button className="user-menu" title={profile?.full_name ?? "Usuário"}><span className="user-avatar">{(profile?.full_name ?? "D").charAt(0).toUpperCase()}</span><span className="user-copy"><strong>{profile?.full_name ?? "Usuário"}</strong><small>{membership.role === "owner" ? "Proprietário" : "Gerência"}</small></span></button><button className="logout-button" onClick={signOut} aria-label="Sair"><LogOut size={18} /></button></div>
      <button className="compact-toggle" onClick={() => setSidebarCompact((current) => !current)} aria-label={sidebarCompact ? "Expandir menu" : "Recolher menu"}><PanelLeftClose size={17} /><span>Recolher menu</span></button>
    </aside>
    <main className="workspace"><header className="workspace-header"><div><p className="breadcrumb">Dopamina / {activeNav.label}</p><h1>{activeNav.label}</h1></div><div className="workspace-actions"><label className="search-box"><Search size={17} /><input type="search" placeholder="Buscar no sistema" /><kbd>⌘ K</kbd></label><select className="period-select" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período"><option value="all">Todos os períodos</option>{data.sales.map((sale) => <option key={sale.id} value={`${sale.period_start}|${sale.period_end}`}>{dateLabel(sale.period_start)} a {dateLabel(sale.period_end)}</option>)}</select></div></header>
      <div className="workspace-content"><SectionContent section={section} setSection={setSection} businessId={membership.business_id} userId={userId} data={data} sales={visibleSales} saleItems={visibleItems} expenses={visibleExpenses} profitabilityImports={visibleProfitabilityImports} profitabilityItems={visibleProfitabilityItems} refreshing={refreshing} onRefresh={() => refresh()} /></div>
    </main>
  </div>;
}

function SectionContent(props: { section: Section; setSection: (section: Section) => void; businessId: string; userId: string; data: DataState; sales: Sale[]; saleItems: SaleItem[]; expenses: Expense[]; profitabilityImports: ProfitabilityImport[]; profitabilityItems: ProfitabilityItem[]; refreshing: boolean; onRefresh: () => Promise<void> }) {
  if (props.section === "visao-geral") return <Overview {...props} />;
  if (props.section === "vendas") return <SalesPage {...props} />;
  if (props.section === "cmv") return <CmvPage {...props} />;
  if (props.section === "despesas") return <ExpensesPage {...props} />;
  if (props.section === "importacoes") return <ImportsPage {...props} />;
  const content: Record<Exclude<Section, "visao-geral" | "vendas" | "cmv" | "despesas" | "importacoes">, { eyebrow: string; title: string; description: string; action: string; icon: React.ReactNode; columns: string[] }> = {
    estoque: { eyebrow: "Operação", title: "Estoque e movimentações", description: "Visualize saldos, entradas, perdas e contagens do bar.", action: "Nova contagem", icon: <PackageSearch size={22} />, columns: ["Item", "Área", "Unidade", "Saldo atual", "Custo médio", "Situação"] },
    planejamento: { eyebrow: "Gestão", title: "Planejamento e metas", description: "Defina previsões de faturamento, gastos e fluxo de caixa.", action: "Nova previsão", icon: <CalendarRange size={22} />, columns: ["Período", "Tipo", "Área", "Previsto", "Realizado", "Variação"] },
    cadastros: { eyebrow: "Base central", title: "Cadastros do sistema", description: "Produtos, insumos, fornecedores e áreas usados em todo o ERP.", action: "Novo cadastro", icon: <ClipboardList size={22} />, columns: ["Nome", "Tipo", "Categoria", "Unidade", "Última atualização"] },
    configuracoes: { eyebrow: "Administração", title: "Configurações e acessos", description: "Gerencie usuários, dados do negócio e histórico de alterações.", action: "Convidar usuário", icon: <UsersRound size={22} />, columns: ["Usuário", "E-mail", "Perfil", "Status", "Último acesso"] },
  };
  const current = content[props.section];
  return <section className="module-page"><ModuleHero {...current} /><div className="data-table-card"><div className="data-table-head">{current.columns.map((column) => <span key={column}>{column}</span>)}</div><div className="empty-table"><div>{current.icon}</div><h3>Este módulo será a próxima etapa</h3><p>Vendas e despesas já usam a base central. Agora podemos conectar este módulo aos mesmos dados.</p></div></div></section>;
}

function ModuleHero({ eyebrow, title, description, action, icon, onAction }: { eyebrow: string; title: string; description: string; action: string; icon: React.ReactNode; onAction?: () => void }) {
  return <div className="module-hero"><div className="module-icon">{icon}</div><div><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div><button onClick={onAction}>{action}</button></div>;
}

function Overview({ sales, expenses, data, setSection }: Parameters<typeof SectionContent>[0]) {
  const revenue = sales.reduce((sum, sale) => sum + Number(sale.revenue_amount ?? sale.gross_amount), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const visibleSaleIds = new Set(sales.map((sale) => String(sale.id)));
  const profitabilityImports = data.profitabilityImports.filter((row) => visibleSaleIds.has(String(row.sale_id)));
  const knownCost = profitabilityImports.reduce((sum, row) => sum + Number(row.known_cost_total), 0);
  const result = revenue - expenseTotal - knownCost;
  const current = sales[0];
  return <section className="overview-page"><div className="overview-intro"><div><p className="page-kicker">Resumo gerencial</p><h2>Panorama financeiro do Dopamina</h2><span>Indicadores calculados a partir da base única de vendas e despesas.</span></div><button className="accent-button" onClick={() => setSection("vendas")}><FileUp size={17} /> Importar relatórios Zig</button></div>
    <div className="metric-grid"><MetricCard label="Receita" value={MONEY.format(revenue)} icon={<TrendingUp size={20} />} tone="green" note={sales.length ? `${sales.length} período(s) importado(s)` : "Sem vendas importadas"} /><MetricCard label="Despesas" value={MONEY.format(expenseTotal)} icon={<ArrowDownRight size={20} />} tone="red" note={`${expenses.length} lançamento(s)`} /><MetricCard label="Resultado conhecido" value={MONEY.format(result)} icon={<ArrowUpRight size={20} />} tone="purple" note={knownCost ? "Receita − despesas − CMV conhecido" : "Importe o CMV para completar"} /><MetricCard label="CMV conhecido" value={MONEY.format(knownCost)} icon={<BarChart3 size={20} />} tone="yellow" note={profitabilityImports.length ? `${profitabilityImports.reduce((sum, row) => sum + row.missing_cost_count, 0)} produto(s) sem custo` : "Sem relatório de CMV"} /></div>
    <div className="dashboard-grid"><article className="chart-card wide-card"><div className="card-title-row"><div><p>Desempenho</p><h3>Receita x despesas</h3></div><span>{current ? `${dateLabel(current.period_start)} a ${dateLabel(current.period_end)}` : "Sem período"}</span></div><ComparisonBars revenue={revenue} expenses={expenseTotal} /></article><article className="chart-card"><div className="card-title-row"><div><p>Estrutura</p><h3>Base cadastrada</h3></div></div><div className="base-stats"><div><span><PackageSearch size={18} /> Produtos</span><strong>{data.products}</strong></div><div><span><UsersRound size={18} /> Fornecedores</span><strong>{data.suppliers}</strong></div><div><span><Building2 size={18} /> Áreas</span><strong>{data.areas.length}</strong></div></div></article>
      <article className="chart-card wide-card"><div className="card-title-row"><div><p>Faturamento</p><h3>Composição do último fechamento</h3></div></div>{current ? <div className="closing-breakdown"><div><span>Produtos vendidos</span><strong>{MONEY.format(current.product_gross_amount)}</strong></div><div><span>Serviço</span><strong>{MONEY.format(current.service_amount)}</strong></div><div><span>Descontos</span><strong>-{MONEY.format(current.discount_amount)}</strong></div><div><span>Contas em aberto</span><strong>-{MONEY.format(current.open_accounts_amount)}</strong></div></div> : <EmptyMini text="Importe os relatórios da Zig para ver a composição." />}</article>
      <article className="chart-card"><div className="card-title-row"><div><p>Status</p><h3>Saúde dos dados</h3></div></div><div className="data-health"><div className="health-ring"><strong>{profitabilityImports.length ? "83%" : sales.length ? "67%" : "0%"}</strong><span>configurado</span></div><p>{profitabilityImports.length ? "Vendas, despesas e CMV estão conectados. Complete custos ausentes para fechar a margem." : sales.length ? "Vendas e despesas estão prontas. Importe o CMV para calcular rentabilidade." : "Importe as vendas e cadastre as despesas para liberar os indicadores."}</p></div></article></div></section>;
}

function SalesPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const gross = props.sales.reduce((sum, sale) => sum + Number(sale.gross_amount), 0);
  const discounts = props.sales.reduce((sum, sale) => sum + Number(sale.discount_amount), 0);
  const revenue = props.sales.reduce((sum, sale) => sum + Number(sale.revenue_amount ?? sale.gross_amount), 0);
  const quantity = props.saleItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; category: string; area: string; quantity: number; gross: number; discount: number; net: number }>();
    for (const row of props.saleItems) {
      const item = nested(row.items); const category = nested(item?.categories)?.name ?? "Sem categoria"; const area = nested(row.areas)?.name ?? "Geral"; const name = item?.name ?? "Produto";
      const key = `${name}|${area}`; const current = map.get(key) ?? { name, category, area, quantity: 0, gross: 0, discount: 0, net: 0 };
      current.quantity += Number(row.quantity); current.gross += Number(row.gross_amount); current.discount += Number(row.discount_amount); current.net += Number(row.gross_amount) - Number(row.discount_amount); map.set(key, current);
    }
    return [...map.values()].filter((row) => `${row.name} ${row.category} ${row.area}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.net - a.net);
  }, [props.saleItems, query]);
  return <section><ModuleHero eyebrow="Resultados" title="Vendas e faturamento" description="Fechamento, produtos, descontos e formas de pagamento conciliados com a Zig." action="Importar relatórios" icon={<ShoppingCart size={22} />} onAction={() => setShowImport(true)} />
    <div className="section-kpis"><MiniKpi label="Faturamento bruto" value={MONEY.format(gross)} /><MiniKpi label="Receita do período" value={MONEY.format(revenue)} /><MiniKpi label="Descontos" value={MONEY.format(discounts)} /><MiniKpi label="Itens vendidos" value={NUMBER.format(quantity)} /></div>
    <div className="sales-layout"><article className="chart-card"><div className="card-title-row"><div><p>Recebimentos</p><h3>Formas de pagamento</h3></div></div><PaymentBars payments={props.data.payments} sales={props.sales} /></article><article className="chart-card"><div className="card-title-row"><div><p>Ranking</p><h3>Top produtos</h3></div></div><Ranking rows={grouped.slice(0, 6)} /></article></div>
    <div className="module-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, categoria ou área" /></label><span className="table-count">{grouped.length} combinações</span></div>
    <div className="data-table-card"><div className="responsive-table sales-table"><div className="table-row table-header"><span>Produto</span><span>Categoria</span><span>Área</span><span>Quantidade</span><span>Descontos</span><span>Valor líquido</span></div>{grouped.length ? grouped.map((row) => <div className="table-row" key={`${row.name}-${row.area}`}><strong>{row.name}</strong><span>{row.category}</span><span>{row.area}</span><span>{NUMBER.format(row.quantity)}</span><span>{MONEY.format(row.discount)}</span><strong>{MONEY.format(row.net)}</strong></div>) : <EmptyMini text="Nenhuma venda encontrada no período." />}</div></div>
    {showImport && <ImportModal businessId={props.businessId} onClose={() => setShowImport(false)} onImported={async () => { await props.onRefresh(); setShowImport(false); }} />}
  </section>;
}

function CmvPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const rows = props.profitabilityItems
    .filter((row) => `${row.source_product_name} ${row.source_sku ?? ""} ${row.source_category ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.gross_amount) - Number(a.gross_amount));
  const gross = props.profitabilityItems.reduce((sum, row) => sum + Number(row.gross_amount), 0);
  const knownCost = props.profitabilityItems.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0);
  const knownRevenue = props.profitabilityItems.filter((row) => row.cost_status === "known").reduce((sum, row) => sum + Number(row.gross_amount), 0);
  const missingRevenue = gross - knownRevenue;
  const coverage = gross > 0 ? knownRevenue / gross : 0;
  const knownMargin = knownRevenue > 0 ? (knownRevenue - knownCost) / knownRevenue : 0;
  const missingCount = props.profitabilityItems.filter((row) => row.cost_status === "missing").length;

  return <section><ModuleHero eyebrow="Rentabilidade" title="CMV e margem de lucro" description="Custos conhecidos, cobertura do cadastro e rentabilidade por produto a partir da Zig." action="Importar CMV / ABC" icon={<CircleDollarSign size={22} />} onAction={() => setShowImport(true)} />
    <div className="section-kpis"><MiniKpi label="Faturamento analisado" value={MONEY.format(gross)} /><MiniKpi label="CMV conhecido" value={MONEY.format(knownCost)} /><MiniKpi label="Margem conhecida" value={knownRevenue ? `${NUMBER.format(knownMargin * 100)}%` : "—"} /><MiniKpi label="Cobertura de custos" value={`${NUMBER.format(coverage * 100)}%`} /></div>
    {missingCount > 0 && <div className="data-warning"><TriangleAlert size={19} /><div><strong>{missingCount} produto(s) sem custo confiável</strong><span>{MONEY.format(missingRevenue)} do faturamento não entra no CMV conhecido. Corrija os custos na Zig e reimporte o relatório.</span></div></div>}
    <div className="cmv-layout"><article className="chart-card"><div className="card-title-row"><div><p>Cobertura</p><h3>Faturamento com custo</h3></div><strong>{NUMBER.format(coverage * 100)}%</strong></div><CoverageBar known={knownRevenue} missing={missingRevenue} /></article><article className="chart-card"><div className="card-title-row"><div><p>Curva ABC</p><h3>Último snapshot importado</h3></div><span>{props.data.abcImports[0] ? DATE.format(new Date(props.data.abcImports[0].created_at)) : "Sem dados"}</span></div><AbcSummary rows={props.data.abcItems} /></article></div>
    <div className="module-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU ou categoria" /></label><span className="table-count">{rows.length} linha(s)</span></div>
    <div className="data-table-card"><div className="responsive-table cmv-table"><div className="table-row table-header"><span>Produto</span><span>Categoria</span><span>Faturamento</span><span>Custo unit.</span><span>CMV</span><span>Margem</span><span>Status</span></div>{rows.length ? rows.map((row) => <div className="table-row" key={row.id}><strong>{row.source_product_name}<small className="sku-hint">{row.source_sku || "Sem SKU"}</small></strong><span>{row.source_category || "Sem categoria"}</span><strong>{MONEY.format(row.gross_amount)}</strong><span>{row.unit_cost === null ? "—" : MONEY.format(row.unit_cost)}</span><span>{row.cost_status === "known" ? `${NUMBER.format(Number(row.cmv_percentage) * 100)}%` : "—"}</span><span>{row.cost_status === "known" ? `${NUMBER.format(Number(row.margin_percentage) * 100)}%` : "—"}</span><span className={`cost-badge ${row.cost_status}`}>{row.cost_status === "known" ? "Calculado" : "Sem custo"}</span></div>) : <EmptyMini text="Importe o relatório de CMV do mesmo período das vendas para liberar a rentabilidade." />}</div></div>
    {showImport && <AnalyticsImportModal businessId={props.businessId} onClose={() => setShowImport(false)} onImported={async () => { await props.onRefresh(); setShowImport(false); }} />}
  </section>;
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
  return <section><ModuleHero eyebrow="Financeiro" title="Despesas" description="Cadastre, acompanhe e filtre todos os gastos do bar em uma única base." action="Nova despesa" icon={<ReceiptText size={22} />} onAction={() => setEditing("new")} />
    <div className="section-kpis"><MiniKpi label="Total lançado" value={MONEY.format(total)} /><MiniKpi label="Pago" value={MONEY.format(paid)} /><MiniKpi label="Pendente" value={MONEY.format(pending)} /><MiniKpi label="Lançamentos" value={String(rows.length)} /></div>
    <div className="module-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar despesa, categoria ou pagamento" /></label><span className="table-count">{props.refreshing ? "Atualizando..." : `${rows.length} lançamento(s)`}</span></div>
    <div className="data-table-card"><div className="responsive-table expenses-table"><div className="table-row table-header"><span>Data</span><span>Descrição</span><span>Categoria</span><span>Pagamento</span><span>Status</span><span>Valor</span><span></span></div>{rows.length ? rows.map((expense) => <div className="table-row" key={expense.id}><span>{dateLabel(expense.expense_date)}</span><strong>{expense.description}{expense.is_recurring && <small className="recurring-badge">Recorrente</small>}</strong><span>{expense.category}</span><span>{expense.payment_method || "—"}</span><StatusBadge status={expense.status} /><strong>{MONEY.format(expense.amount)}</strong><span className="row-actions"><button onClick={() => setEditing(expense)} aria-label={`Editar ${expense.description}`}><Pencil size={15} /></button><button onClick={() => remove(expense)} aria-label={`Excluir ${expense.description}`}><Trash2 size={15} /></button></span></div>) : <EmptyMini text="Nenhuma despesa cadastrada neste período." />}</div></div>
    {editing && <ExpenseModal businessId={props.businessId} userId={props.userId} expense={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await props.onRefresh(); setEditing(null); }} />}
  </section>;
}

function ImportsPage(props: Parameters<typeof SectionContent>[0]) {
  const [showImport, setShowImport] = useState(false);
  return <section><ModuleHero eyebrow="Integrações" title="Importações da Zig" description="Histórico dos arquivos usados para alimentar vendas e faturamento." action="Enviar relatórios" icon={<FileSpreadsheet size={22} />} onAction={() => setShowImport(true)} /><div className="data-table-card imports-card"><div className="responsive-table imports-table"><div className="table-row table-header"><span>Período</span><span>Arquivo</span><span>Linhas</span><span>Status</span><span>Importado em</span></div>{props.data.imports.length ? props.data.imports.map((row) => <div className="table-row" key={row.id}><span>{dateLabel(row.period_start)} a {dateLabel(row.period_end)}</span><strong>{row.file_name}</strong><span>{row.row_count}</span><StatusBadge status={row.status as Expense["status"]} /><span>{DATE.format(new Date(row.created_at))}</span></div>) : <EmptyMini text="Nenhuma importação realizada." />}</div></div>{showImport && <ImportModal businessId={props.businessId} onClose={() => setShowImport(false)} onImported={async () => { await props.onRefresh(); setShowImport(false); }} />}</section>;
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
function AbcSummary({ rows }: { rows: AbcItem[] }) { if (!rows.length) return <EmptyMini text="Importe uma Curva ABC para ver a concentração por classe." />; const groups = (["A", "B", "C"] as const).map((classification) => ({ classification, count: rows.filter((row) => row.classification === classification).length, value: rows.filter((row) => row.classification === classification).reduce((sum, row) => sum + Number(row.total_value), 0) })); return <div className="abc-summary">{groups.map((group) => <div key={group.classification}><b className={`abc-class class-${group.classification.toLowerCase()}`}>{group.classification}</b><span>{group.count} item(ns)</span><strong>{MONEY.format(group.value)}</strong></div>)}</div>; }
function Ranking({ rows }: { rows: { name: string; net: number; quantity: number }[] }) { return rows.length ? <div className="ranking-list">{rows.map((row, index) => <div key={row.name}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{row.name}</strong><small>{NUMBER.format(row.quantity)} unidades</small></div><b>{MONEY.format(row.net)}</b></div>)}</div> : <EmptyMini text="Sem produtos no período." />; }
function ComparisonBars({ revenue, expenses }: { revenue: number; expenses: number }) { const max = Math.max(revenue, expenses, 1); return <div className="comparison-chart"><div><span>Receita</span><i style={{ height: `${Math.max(revenue / max * 100, 3)}%` }} className="revenue-bar" /><strong>{MONEY.format(revenue)}</strong></div><div><span>Despesas</span><i style={{ height: `${Math.max(expenses / max * 100, 3)}%` }} className="expense-bar" /><strong>{MONEY.format(expenses)}</strong></div></div>; }
function MiniKpi({ label, value }: { label: string; value: string }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function MetricCard({ label, value, icon, tone, note }: { label: string; value: string; icon: React.ReactNode; tone: "green" | "red" | "purple" | "yellow"; note: string }) { return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong></div><small>{note}</small></article>; }
function EmptyMini({ text }: { text: string }) { return <div className="empty-mini"><FileSpreadsheet size={24} /><p>{text}</p></div>; }
function StatusBadge({ status }: { status: Expense["status"] }) { const labels = { completed: "Concluído", pending: "Pendente", draft: "Rascunho", cancelled: "Cancelado" }; return <span className={`status-badge ${status}`}>{labels[status]}</span>; }
