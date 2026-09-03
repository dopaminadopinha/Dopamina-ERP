"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, MoreHorizontal, Pencil, Plus, Receipt, Search, Trash2, TriangleAlert, UserCheck, UserRound, UsersRound, UserX, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useEscapeToClose } from "@/lib/use-escape-close";

type Range = { start: string; end: string };
type Employee = { id: string; name: string; cpf: string | null; pix_key: string | null; is_active: boolean; notes: string | null };
type Shift = { id: string; employee_id: string; employee_name: string; shift_date: string; start_time: string | null; end_time: string | null; break_minutes: number; hours_worked: number; rate_snapshot: number; amount_due: number; payment_status: PaymentStatus; payment_method: string | null };
type PersonnelCost = { id: string; employee_id: string | null; employee_name: string | null; cost_date: string; cost_type: string; description: string; amount: number; payment_status: PaymentStatus; payment_method: string | null };
type Closing = { id: string; period_start: string; period_end: string; status: PaymentStatus; total_amount: number; payment_method: string | null; items: { employee_id: string; employee_name: string; amount: number; hours_worked: number }[] };
type ConsumptionByDay = { employee_id: string; operational_date: string; sale_cents: number; cost_cents: number };
type Dashboard = { employees: Employee[]; shifts: Shift[]; costs: PersonnelCost[]; closings: Closing[]; revenue_cents: number; zig_consumption_by_day: ConsumptionByDay[] };
type PaymentStatus = "pending" | "paid" | "cancelled";
type ZigConsumptionItem = { product_name: string; quantity: number; net_amount_cents: number };
type ZigConsumptionTransaction = { zig_transaction_id: string; purchased_at: string; products_value_cents: number; tip_value_cents: number; is_paid: boolean | null; payment_type: string | null; items: ZigConsumptionItem[] };
type ZigConsumption = { open_cents: number; paid_cents: number; transactions: ZigConsumptionTransaction[] };
type DayConsumptionItem = { product_name: string; quantity: number; unit_cost_cents: number; line_cost_cents: number; line_sale_cents: number; has_cost: boolean };
type DayConsumption = { sale_cents: number; cost_cents: number; items: DayConsumptionItem[] };

const EMPTY: Dashboard = { employees: [], shifts: [], costs: [], closings: [], revenue_cents: 0, zig_consumption_by_day: [] };
const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const COST_TYPES: Record<string, string> = { monthly_salary: "Salário mensal", overtime: "Hora extra", charges: "Encargos", benefit: "Benefício", bonus: "Bonificação", additional: "Adicional", other: "Outro" };

function isoToday() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
function dateLabel(value: string | null) { return value ? DATE.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : "—"; }
function decimal(value: string) { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function formatCpf(value: string | null) { if (!value) return "—"; const digits = value.replace(/\D/g, ""); return digits.length === 11 ? `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}` : value; }

export function PersonnelPage({ businessId, userId, range, onExpensesChanged }: { businessId: string; userId: string; range: Range; onExpensesChanged: () => Promise<void> }) {
  const [data, setData] = useState<Dashboard>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "team" | "work">("overview");
  const [modal, setModal] = useState<"employee" | "shift" | "cost" | "closing" | null>(null);
  const [query, setQuery] = useState("");

  async function reload() {
    setLoading(true); setError("");
    const result = await supabase.rpc("get_personnel_dashboard", { p_business_id: Number(businessId), p_period_start: range.start, p_period_end: range.end });
    if (result.error) setError("Não foi possível carregar os dados de pessoal agora.");
    else setData((result.data as Dashboard | null) ?? EMPTY);
    setLoading(false);
  }
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await supabase.rpc("get_personnel_dashboard", { p_business_id: Number(businessId), p_period_start: range.start, p_period_end: range.end });
      if (cancelled) return;
      if (result.error) setError("Não foi possível carregar os dados de pessoal agora.");
      else setData((result.data as Dashboard | null) ?? EMPTY);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [businessId, range.start, range.end]);

  const obligations = [...data.shifts.map((row) => ({ amount: Number(row.amount_due), status: row.payment_status })), ...data.costs.map((row) => ({ amount: Number(row.amount), status: row.payment_status }))];
  const total = obligations.reduce((sum, row) => sum + row.amount, 0);
  const paid = obligations.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amount, 0);
  const pending = obligations.filter((row) => row.status === "pending").reduce((sum, row) => sum + row.amount, 0);
  const hours = data.shifts.reduce((sum, row) => sum + Number(row.hours_worked), 0);
  const revenue = Number(data.revenue_cents) / 100;
  const filteredEmployees = useMemo(() => data.employees.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())), [data.employees, query]);

  async function refreshed() { await Promise.all([reload(), onExpensesChanged()]); setModal(null); }
  async function togglePayment(sourceType: "work_shift" | "personnel_cost", id: string, paidNow: boolean) {
    const method = paidNow ? window.prompt("Forma de pagamento (ex.: PIX, dinheiro):", "PIX") ?? "" : "";
    if (paidNow && !method.trim()) return;
    const { error: rpcError } = await supabase.rpc("set_personnel_payment", { p_business_id: Number(businessId), p_source_type: sourceType, p_source_id: Number(id), p_paid: paidNow, p_payment_method: method });
    if (rpcError) return alert("Não foi possível atualizar o pagamento.");
    await refreshed();
  }
  async function payClosing(row: Closing) {
    const method = window.prompt("Forma de pagamento do fechamento:", "PIX"); if (!method?.trim()) return;
    const { error: rpcError } = await supabase.rpc("pay_payroll_closing", { p_business_id: Number(businessId), p_closing_id: Number(row.id), p_payment_method: method });
    if (rpcError) return alert("Não foi possível pagar este fechamento.");
    await refreshed();
  }
  async function deletePersonnelEntry(sourceType: "work_shift" | "personnel_cost", id: string, employeeName: string) {
    const label=sourceType==='work_shift'?'jornada':'custo adicional';
    if(!window.confirm(`Excluir ${label} de ${employeeName}?\n\nO lançamento e a despesa correspondente serão removidos permanentemente.`))return;
    const table=sourceType==='work_shift'?'work_shifts':'personnel_cost_entries';
    const linked=await supabase.from(table).select('payroll_closing_id').eq('id',id).eq('business_id',businessId).maybeSingle();
    if(linked.error)return alert('Não foi possível verificar este lançamento. Tente novamente.');
    if(linked.data?.payroll_closing_id)return alert('Este lançamento faz parte de um fechamento. Exclua primeiro o fechamento da folha e tente novamente.');
    const removed=await supabase.from(table).delete().eq('id',id).eq('business_id',businessId);
    if(removed.error)return alert('Não foi possível excluir este lançamento.');
    const expenseRemoved=await supabase.from('expenses').delete().eq('business_id',businessId).eq('source_type',sourceType).eq('source_id',id);
    if(expenseRemoved.error)alert('O lançamento foi excluído, mas não foi possível atualizar a despesa correspondente. Atualize a página e tente novamente.');
    await refreshed();
  }
  async function deleteClosing(row: Closing) {
    if(!window.confirm(`Excluir o fechamento de ${dateLabel(row.period_start)} a ${dateLabel(row.period_end)}?\n\nOs lançamentos incluídos voltarão para Pendente. Esta ação não exclui as jornadas nem os custos da folha.`))return;
    const items=await supabase.from('payroll_closing_items').select('shift_ids,personnel_cost_ids').eq('closing_id',row.id);
    if(items.error)return alert('Não foi possível carregar os itens deste fechamento.');
    const shiftIds=(items.data??[]).flatMap(item=>(item.shift_ids as string[]|null)??[]);
    const costIds=(items.data??[]).flatMap(item=>(item.personnel_cost_ids as string[]|null)??[]);
    const removed=await supabase.from('payroll_closings').delete().eq('id',row.id).eq('business_id',businessId);
    if(removed.error)return alert('Não foi possível excluir este fechamento.');
    const updates=[];
    if(shiftIds.length){
      updates.push(supabase.from('work_shifts').update({payment_status:'pending',paid_at:null,payment_method:null}).eq('business_id',businessId).in('id',shiftIds));
      updates.push(supabase.from('expenses').update({status:'pending',paid_at:null,payment_method:null}).eq('business_id',businessId).eq('source_type','work_shift').in('source_id',shiftIds));
    }
    if(costIds.length){
      updates.push(supabase.from('personnel_cost_entries').update({payment_status:'pending',paid_at:null,payment_method:null}).eq('business_id',businessId).in('id',costIds));
      updates.push(supabase.from('expenses').update({status:'pending',paid_at:null,payment_method:null}).eq('business_id',businessId).eq('source_type','personnel_cost').in('source_id',costIds));
    }
    const results=await Promise.all(updates);
    if(results.some(result=>result.error))alert('O fechamento foi excluído, mas alguns lançamentos podem precisar ser reabertos manualmente.');
    await refreshed();
  }

  return <section className="personnel-page">
    <div className="personnel-hero"><div><p>OPERAÇÃO E EQUIPE</p><h2>Funcionários e custo de pessoal</h2><span>Jornadas, pagamentos e custos reais conectados às despesas do ERP.</span></div><button onClick={() => setModal("employee")}><Plus size={16} /> Funcionário</button></div>
    <div className="personnel-tabs" role="tablist">{([['overview','Visão geral'],['team','Equipe'],['work','Jornadas e folha']] as const).map(([id,label]) => <button key={id} className={tab===id?'active':''} onClick={() => setTab(id)}>{label}</button>)}</div>
    {error && <div className="personnel-alert"><TriangleAlert size={16}/>{error}</div>}
    {loading ? <div className="personnel-loading">Carregando dados reais…</div> : <>
      {tab === "overview" && <>
        <div className="personnel-kpis"><Kpi label="Custo de pessoal" value={MONEY.format(total)} note={`${obligations.length} lançamento(s)`}/><Kpi label="Pago" value={MONEY.format(paid)} note="Baixado no financeiro" tone="green"/><Kpi label="Pendente" value={MONEY.format(pending)} note="Aguardando pagamento" tone="yellow"/><Kpi label="Horas registradas" value={`${NUMBER.format(hours)} h`} note={`${data.shifts.length} jornada(s)`}/><Kpi label="Média diária" value={MONEY.format(total / Math.max(1, daysBetween(range)))} note="No período selecionado"/><Kpi label="Peso no faturamento" value={revenue > 0 ? `${NUMBER.format(total/revenue*100)}%` : "—"} note={revenue > 0 ? "Sobre vendas reais da Zig" : "Sem faturamento no período"}/></div>
        <article className="personnel-card"><Header kicker="Leitura gerencial" title="Situação do período"/><div className="personnel-reading"><div><UsersRound size={18}/><span><b>{data.employees.filter(row=>row.is_active).length} pessoas ativas</b><small>{data.employees.length} cadastros no total</small></span></div><div><Clock3 size={18}/><span><b>{pending > 0 ? `${MONEY.format(pending)} pendentes` : "Tudo pago"}</b><small>Custo geral do bar, sem divisão por setor</small></span></div></div></article>
        <article className="personnel-card"><Header kicker="Histórico" title="Últimos lançamentos"/><Obligations shifts={data.shifts.slice(0,5)} costs={data.costs.slice(0,5)} employees={data.employees} consumptionByDay={data.zig_consumption_by_day} businessId={businessId} onPayment={togglePayment} onDelete={deletePersonnelEntry}/></article>
      </>}
      {tab === "team" && <><div className="personnel-toolbar"><label><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nome"/></label><span>{filteredEmployees.length} pessoa(s)</span></div><div className="employee-grid">{filteredEmployees.length ? filteredEmployees.map(row=><EmployeeCard key={row.id} row={row} businessId={businessId} range={range} onSaved={reload}/>) : <Empty text="Nenhum funcionário encontrado."/>}</div></>}
      {tab === "work" && <><div className="personnel-actions"><button onClick={()=>setModal("shift")}><CalendarClock size={16}/> Registrar jornada</button><button onClick={()=>setModal("cost")}><Plus size={16}/> Outro custo</button><button onClick={()=>setModal("closing")}><CheckCircle2 size={16}/> Fechar período</button></div><article className="personnel-card"><Header kicker="Folha do período" title="Jornadas, diárias e custos adicionais"/><Obligations shifts={data.shifts} costs={data.costs} employees={data.employees} consumptionByDay={data.zig_consumption_by_day} businessId={businessId} onPayment={togglePayment} onDelete={deletePersonnelEntry}/></article><article className="personnel-card"><Header kicker="Fechamentos" title="Histórico de folha"/><div className="closing-list">{data.closings.length ? data.closings.map(row=><div key={row.id}><span><b>{dateLabel(row.period_start)} a {dateLabel(row.period_end)}</b><small>{row.items.length} pessoa(s) · {row.items.reduce((sum,item)=>sum+Number(item.hours_worked),0)} h</small></span><strong>{MONEY.format(row.total_amount)}</strong><Status value={row.status}/>{row.status==='pending'?<button onClick={()=>payClosing(row)}>Marcar pago</button>:<span/>}<RowDeleteMenu label={`fechamento de ${dateLabel(row.period_start)} a ${dateLabel(row.period_end)}`} onDelete={()=>deleteClosing(row)}/></div>) : <Empty text="Nenhum fechamento criado ainda."/>}</div></article></>}
          </>}
    {modal === "employee" && <EmployeeModal businessId={businessId} userId={userId} onClose={()=>setModal(null)} onSaved={refreshed}/>}
    {modal === "shift" && <ShiftModal businessId={businessId} employees={data.employees.filter(e=>e.is_active)} onClose={()=>setModal(null)} onSaved={refreshed}/>}
    {modal === "cost" && <CostModal businessId={businessId} employees={data.employees.filter(e=>e.is_active)} onClose={()=>setModal(null)} onSaved={refreshed}/>}
    {modal === "closing" && <ClosingModal businessId={businessId} range={range} onClose={()=>setModal(null)} onSaved={refreshed}/>}
  </section>;
}

function daysBetween(range: Range) { return Math.max(1,Math.round((new Date(`${range.end}T12:00:00Z`).getTime()-new Date(`${range.start}T12:00:00Z`).getTime())/86400000)+1); }
function Header({kicker,title}:{kicker:string;title:string}) { return <div className="personnel-card-head"><span>{kicker}</span><h3>{title}</h3></div>; }
function Kpi({label,value,note,tone=""}:{label:string;value:string;note:string;tone?:string}) { return <article className={`personnel-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Empty({text}:{text:string}) { return <div className="personnel-empty">{text}</div>; }
function Status({value}:{value:PaymentStatus}) { return <span className={`personnel-status ${value}`}>{value==='paid'?'Pago':value==='pending'?'Pendente':'Cancelado'}</span>; }

function Obligations({shifts,costs,employees,consumptionByDay,businessId,onPayment,onDelete}:{shifts:Shift[];costs:PersonnelCost[];employees:Employee[];consumptionByDay:ConsumptionByDay[];businessId:string;onPayment:(type:"work_shift"|"personnel_cost",id:string,paid:boolean)=>Promise<void>;onDelete:(type:"work_shift"|"personnel_cost",id:string,name:string)=>Promise<void>}) {
  const pixByEmployee=new Map(employees.map(row=>[String(row.id),row.pix_key]));
  const costByEmployeeDay=new Map(consumptionByDay.map(row=>[`${row.employee_id}|${row.operational_date}`,row.cost_cents]));
  const rows=[
    ...shifts.map(row=>{
      const deductionCents=row.employee_id?costByEmployeeDay.get(`${row.employee_id}|${row.shift_date}`)||0:0;
      return {id:row.id,type:'work_shift' as const,date:row.shift_date,employeeId:row.employee_id,name:row.employee_name,pix:pixByEmployee.get(String(row.employee_id))||null,description:`${NUMBER.format(row.hours_worked)} h`,grossAmount:Number(row.amount_due),deductionCents,status:row.payment_status};
    }),
    ...costs.map(row=>({id:row.id,type:'personnel_cost' as const,date:row.cost_date,employeeId:row.employee_id,name:row.employee_name||'Custo geral',pix:row.employee_id?pixByEmployee.get(String(row.employee_id))||null:null,description:`${COST_TYPES[row.cost_type]||row.cost_type} · ${row.description}`,grossAmount:Number(row.amount),deductionCents:0,status:row.payment_status})),
  ].sort((a,b)=>b.date.localeCompare(a.date));
  return <div className="obligation-list">{rows.length?rows.map(row=>{
    const deduction=row.deductionCents/100;
    const netAmount=row.grossAmount-deduction;
    return <div key={`${row.type}-${row.id}`}>
      <span><b>{row.name}</b><small>{dateLabel(row.date)} · {row.description}</small></span>
      <span className="obligation-pix">{row.pix?<>Pix<b>{row.pix}</b></>:null}</span>
      <span className="obligation-amount"><strong className={netAmount<0?'negative':''}>{row.grossAmount>0?MONEY.format(netAmount):'Somente horas'}</strong>{deduction>0&&<small>Consumo −{MONEY.format(deduction)}</small>}</span>
      <Status value={row.status}/>
      {row.grossAmount>0?<button onClick={()=>onPayment(row.type,row.id,row.status!=='paid')}>{row.status==='paid'?'Reabrir':'Marcar pago'}</button>:<span/>}
      <RowDeleteMenu label={`${row.description} de ${row.name}`} onDelete={()=>onDelete(row.type,row.id,row.name)} extra={row.type==='work_shift'&&row.employeeId?[{label:'Ver consumo do dia',icon:<Receipt size={14}/>,render:(close:()=>void)=><DayConsumptionModal key="day-consumption" businessId={businessId} employeeId={row.employeeId as string} employeeName={row.name} date={row.date} onClose={close}/>}]:undefined}/>
    </div>;
  }):<Empty text="Nenhum lançamento no período selecionado."/>}</div>;
}

function RowDeleteMenu({label,onDelete,extra}:{label:string;onDelete:()=>Promise<void>;extra?:{label:string;icon:React.ReactNode;render:(close:()=>void)=>React.ReactNode}[]}) {
  const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [activeExtra,setActiveExtra]=useState<number|null>(null);const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{function outside(event:PointerEvent){if(!ref.current?.contains(event.target as Node))setOpen(false);}function escape(event:KeyboardEvent){if(event.key==='Escape')setOpen(false);}document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[]);
  async function remove(){setOpen(false);setBusy(true);await onDelete();setBusy(false);}
  return <div className="row-action-menu" ref={ref}><button className="row-action-trigger" type="button" aria-label={`Ações de ${label}`} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={()=>setOpen(value=>!value)}><MoreHorizontal size={16}/></button>{open&&<div className="row-action-popover" role="menu">{extra?.map((item,index)=><button key={item.label} type="button" role="menuitem" onClick={()=>{setOpen(false);setActiveExtra(index);}}>{item.icon} {item.label}</button>)}<button type="button" role="menuitem" onClick={remove}><Trash2 size={14}/> Excluir</button></div>}{activeExtra!==null&&extra?.[activeExtra]?.render(()=>setActiveExtra(null))}</div>;
}

function DayConsumptionModal({businessId,employeeId,employeeName,date,onClose}:{businessId:string;employeeId:string;employeeName:string;date:string;onClose:()=>void}) {
  const [data,setData]=useState<DayConsumption|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      setLoading(true); setError('');
      const result=await supabase.rpc('get_employee_day_consumption',{p_business_id:Number(businessId),p_employee_id:Number(employeeId),p_date:date});
      if(cancelled) return;
      if(result.error) setError('Não foi possível carregar o consumo do dia agora.');
      else setData(result.data as DayConsumption);
      setLoading(false);
    }
    void load();
    return ()=>{cancelled=true;};
  },[businessId,employeeId,date]);
  const missingCost=data?.items.some(item=>!item.has_cost)??false;
  return <Modal title={`Consumo do dia · ${employeeName}`} subtitle={`${dateLabel(date)} · valores pelo preço de custo, usados para o desconto da jornada.`} onClose={onClose}>
    {loading ? <div className="personnel-loading">Carregando…</div> : error ? <div className="personnel-alert"><TriangleAlert size={16}/>{error}</div> : !data || data.items.length===0 ? <Empty text="Nenhum consumo encontrado nesta data."/> : <>
      <div className="personnel-kpis"><Kpi label="Desconto (custo)" value={MONEY.format(data.cost_cents/100)} note="Valor descontado da jornada" tone="yellow"/><Kpi label="Valor de venda" value={MONEY.format(data.sale_cents/100)} note="Preço normal, não cobrado do funcionário" tone="green"/></div>
      {missingCost&&<div className="personnel-alert"><TriangleAlert size={16}/>Algum item não tem custo cadastrado e entrou como R$ 0,00 no desconto. Cadastre o custo do produto para refletir corretamente.</div>}
      <div className="closing-list">{data.items.map((item,index)=><div key={index}>
        <span><b>{item.product_name}</b><small>{NUMBER.format(item.quantity)}x · custo unitário {MONEY.format(item.unit_cost_cents/100)}{!item.has_cost?' (sem custo cadastrado)':''}</small></span>
        <strong>{MONEY.format(item.line_cost_cents/100)}</strong>
      </div>)}</div>
    </>}
  </Modal>;
}

function EmployeeCard({row,businessId,range,onSaved}:{row:Employee;businessId:string;range:Range;onSaved:()=>Promise<void>}) {
  const [menuOpen,setMenuOpen]=useState(false);
  const [editOpen,setEditOpen]=useState(false);
  const [consumptionOpen,setConsumptionOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const menuRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    function closeMenu(event:PointerEvent){if(!menuRef.current?.contains(event.target as Node))setMenuOpen(false);}
    function closeOnEscape(event:KeyboardEvent){if(event.key==='Escape')setMenuOpen(false);}
    document.addEventListener('pointerdown',closeMenu);
    document.addEventListener('keydown',closeOnEscape);
    return()=>{document.removeEventListener('pointerdown',closeMenu);document.removeEventListener('keydown',closeOnEscape);};
  },[]);

  async function toggle(){
    setBusy(true);
    const result=await supabase.from('employees').update({is_active:!row.is_active}).eq('id',row.id).eq('business_id',businessId);
    setBusy(false);
    setMenuOpen(false);
    if(result.error)return alert(`Não foi possível ${row.is_active?'desativar':'ativar'} este funcionário.`);
    await onSaved();
  }

  async function remove(){
    setMenuOpen(false);
    const confirmed=window.confirm(`Excluir ${row.name}?\n\nEsta ação é permanente. Se houver jornadas ou lançamentos vinculados, a exclusão será bloqueada para proteger o histórico.`);
    if(!confirmed)return;
    setBusy(true);
    const result=await supabase.from('employees').delete().eq('id',row.id).eq('business_id',businessId);
    setBusy(false);
    if(result.error)return alert('Este funcionário possui histórico vinculado e não pode ser excluído. Desative-o para preservar os lançamentos anteriores.');
    await onSaved();
  }

  return <>
    <article className={`employee-card ${!row.is_active?'inactive':''}`}>
      <header>
        <div className="employee-avatar"><UserRound size={18}/></div>
        <span className="employee-name"><h3>{row.name}</h3></span>
        <span className={`employee-state ${row.is_active?'active':'inactive'}`}>{row.is_active?'Ativo':'Inativo'}</span>
        <div className="employee-menu" ref={menuRef}>
          <button className="employee-menu-trigger" type="button" aria-label={`Ações de ${row.name}`} aria-haspopup="menu" aria-expanded={menuOpen} disabled={busy} onClick={()=>setMenuOpen(open=>!open)}><MoreHorizontal size={17}/></button>
          {menuOpen&&<div className="employee-menu-popover" role="menu">
            <button type="button" role="menuitem" onClick={()=>{setMenuOpen(false);setEditOpen(true);}}><Pencil size={14}/> Editar</button>
            {row.cpf&&<button type="button" role="menuitem" onClick={()=>{setMenuOpen(false);setConsumptionOpen(true);}}><Receipt size={14}/> Consumo no bar (Zig)</button>}
            <button type="button" role="menuitem" onClick={toggle}>{row.is_active?<UserX size={14}/>:<UserCheck size={14}/>} {row.is_active?'Desativar':'Ativar'}</button>
            <button type="button" role="menuitem" className="danger" onClick={remove}><Trash2 size={14}/> Excluir</button>
          </div>}
        </div>
      </header>
      <div className="employee-meta"><span>CPF<b>{formatCpf(row.cpf)}</b></span><span>Pix<b>{row.pix_key||'Não cadastrado'}</b></span></div>
    </article>
    {editOpen&&<EmployeeEditModal row={row} businessId={businessId} onClose={()=>setEditOpen(false)} onSaved={async()=>{await onSaved();setEditOpen(false);}}/>}
    {consumptionOpen&&<ConsumptionModal businessId={businessId} employeeId={row.id} employeeName={row.name} range={range} onClose={()=>setConsumptionOpen(false)}/>}
  </>;
}

function ConsumptionModal({businessId,employeeId,employeeName,range,onClose}:{businessId:string;employeeId:string;employeeName:string;range:Range;onClose:()=>void}) {
  const [data,setData]=useState<ZigConsumption|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      setLoading(true); setError('');
      const result=await supabase.rpc('get_employee_zig_consumption',{p_business_id:Number(businessId),p_employee_id:Number(employeeId),p_period_start:range.start,p_period_end:range.end});
      if(cancelled) return;
      if(result.error) setError('Não foi possível carregar o consumo na Zig agora.');
      else setData(result.data as ZigConsumption);
      setLoading(false);
    }
    void load();
    return ()=>{cancelled=true;};
  },[businessId,employeeId,range.start,range.end]);
  return <Modal title={`Consumo no bar · ${employeeName}`} subtitle="Itens comprados com o cartão Ziggy, casados pelo CPF cadastrado. Use para descontar do salário." onClose={onClose}>
    {loading ? <div className="personnel-loading">Carregando…</div> : error ? <div className="personnel-alert"><TriangleAlert size={16}/>{error}</div> : !data || data.transactions.length===0 ? <Empty text="Nenhum consumo encontrado no período selecionado."/> : <>
      <div className="personnel-kpis"><Kpi label="Em aberto" value={MONEY.format(data.open_cents/100)} note="Ainda não pago na Zig" tone="yellow"/><Kpi label="Já pago" value={MONEY.format(data.paid_cents/100)} note="Quitado direto na Zig" tone="green"/></div>
      <div className="closing-list">{data.transactions.map(tx=><div key={tx.zig_transaction_id}>
        <span><b>{DATE.format(new Date(tx.purchased_at))}</b><small>{tx.items.length ? tx.items.map(item=>`${NUMBER.format(item.quantity)}x ${item.product_name}`).join(', ') : 'Itens não detalhados'}</small></span>
        <strong>{MONEY.format((tx.products_value_cents+tx.tip_value_cents)/100)}</strong>
        <Status value={tx.is_paid?'paid':'pending'}/>
      </div>)}</div>
    </>}
  </Modal>;
}

function EmployeeModal({businessId,userId,onClose,onSaved}:{businessId:string;userId:string;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [form,setForm]=useState({name:'',cpf:'',pix_key:''});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function save(e:React.FormEvent){e.preventDefault();if(!form.name.trim())return setMessage('Informe o nome do funcionário.');const cpfDigits=form.cpf.replace(/\D/g,'');if(cpfDigits&&cpfDigits.length!==11)return setMessage('CPF inválido: informe 11 dígitos.');setBusy(true);const result=await supabase.from('employees').insert({business_id:Number(businessId),name:form.name.trim(),cpf:cpfDigits||null,pix_key:form.pix_key.trim()||null,created_by:userId});if(result.error){setMessage('Não foi possível cadastrar.');setBusy(false);return;}await onSaved();}
 return <Modal title="Novo funcionário" subtitle="Cadastre apenas os dados reais conhecidos." onClose={onClose}><form onSubmit={save} className="personnel-form"><label><span>Nome</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label><span>CPF</span><input value={form.cpf} onChange={e=>setForm({...form,cpf:e.target.value})} placeholder="000.000.000-00"/></label><label><span>Pix</span><input value={form.pix_key} onChange={e=>setForm({...form,pix_key:e.target.value})} placeholder="Chave Pix"/></label>{message&&<p className="form-message">{message}</p>}<Actions busy={busy}/></form></Modal>;
}

function EmployeeEditModal({row,businessId,onClose,onSaved}:{row:Employee;businessId:string;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [form,setForm]=useState({name:row.name,cpf:formatCpf(row.cpf)==='—'?'':formatCpf(row.cpf),pix_key:row.pix_key||''});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function save(e:React.FormEvent){e.preventDefault();if(!form.name.trim())return setMessage('Informe o nome do funcionário.');const cpfDigits=form.cpf.replace(/\D/g,'');if(cpfDigits&&cpfDigits.length!==11)return setMessage('CPF inválido: informe 11 dígitos.');setBusy(true);const result=await supabase.from('employees').update({name:form.name.trim(),cpf:cpfDigits||null,pix_key:form.pix_key.trim()||null}).eq('id',row.id).eq('business_id',businessId);if(result.error){setMessage('Não foi possível salvar as alterações.');setBusy(false);return;}await onSaved();}
 return <Modal title="Editar funcionário" subtitle="Atualize os dados do cadastro sem alterar o histórico financeiro." onClose={onClose}><form onSubmit={save} className="personnel-form"><label><span>Nome</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label><span>CPF</span><input value={form.cpf} onChange={e=>setForm({...form,cpf:e.target.value})} placeholder="000.000.000-00"/></label><label><span>Pix</span><input value={form.pix_key} onChange={e=>setForm({...form,pix_key:e.target.value})} placeholder="Chave Pix"/></label>{message&&<p className="form-message">{message}</p>}<Actions busy={busy} label="Salvar alterações"/></form></Modal>;
}

function ShiftModal({businessId,employees,onClose,onSaved}:{businessId:string;employees:Employee[];onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [form,setForm]=useState({employee_id:employees[0]?.id||'',shift_date:isoToday(),start_time:'18:00',end_time:'02:00',break_minutes:'0',rate:'',notes:''});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const calculatedHours=timeHours(form.start_time,form.end_time,decimal(form.break_minutes));const rate=decimal(form.rate);const amount=calculatedHours*rate;
 async function save(e:React.FormEvent){e.preventDefault();if(!form.employee_id)return setMessage('Selecione uma pessoa.');if(rate<=0)return setMessage('Informe o valor da hora.');setBusy(true);const result=await supabase.rpc('save_work_shift',{p_business_id:Number(businessId),p_employee_id:Number(form.employee_id),p_shift_date:form.shift_date,p_start_time:form.start_time,p_end_time:form.end_time,p_break_minutes:decimal(form.break_minutes),p_rate_override:rate,p_notes:form.notes});if(result.error){setMessage(result.error.message);setBusy(false);return;}await onSaved();}
 return <Modal title="Registrar jornada" subtitle="Turnos que atravessam a madrugada são calculados automaticamente." onClose={onClose}><form onSubmit={save} className="personnel-form"><label><span>Funcionário</span><select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}><option value="">Selecione</option>{employees.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Data</span><input type="date" value={form.shift_date} onChange={e=>setForm({...form,shift_date:e.target.value})}/></label><label><span>Entrada</span><input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></label><label><span>Saída</span><input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></label><label><span>Intervalo não pago (min)</span><input value={form.break_minutes} onChange={e=>setForm({...form,break_minutes:e.target.value})} inputMode="numeric"/></label><label><span>Valor da hora</span><input value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})} inputMode="decimal" placeholder="0,00"/></label><div className="calculation-box"><span>Cálculo desta jornada</span><b>{NUMBER.format(calculatedHours)} h · {amount>0?MONEY.format(amount):'Informe o valor da hora'}</b><small>Horas × valor da hora informado nesta jornada.</small></div><label className="wide"><span>Observações</span><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>{message&&<p className="form-message">{message}</p>}<Actions busy={busy}/></form></Modal>;
}
function timeHours(start:string,end:string,breakMinutes:number){if(!start||!end)return 0;const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);let minutes=eh*60+em-(sh*60+sm);if(minutes<=0)minutes+=1440;return Math.max(0,(minutes-breakMinutes)/60);}

function CostModal({businessId,employees,onClose,onSaved}:{businessId:string;employees:Employee[];onClose:()=>void;onSaved:()=>Promise<void>}) { const [form,setForm]=useState({employee_id:employees[0]?.id||'',cost_date:isoToday(),cost_type:'monthly_salary',description:'',amount:'',paid:false,payment_method:'',notes:''});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');async function save(e:React.FormEvent){e.preventDefault();if(!form.description.trim()||decimal(form.amount)<=0)return setMessage('Informe descrição e valor maior que zero.');setBusy(true);const result=await supabase.rpc('save_personnel_cost',{p_business_id:Number(businessId),p_employee_id:form.employee_id?Number(form.employee_id):null,p_cost_date:form.cost_date,p_cost_type:form.cost_type,p_description:form.description,p_amount:decimal(form.amount),p_paid:form.paid,p_payment_method:form.payment_method,p_notes:form.notes});if(result.error){setMessage(result.error.message);setBusy(false);return;}await onSaved();}return <Modal title="Lançar custo de pessoal" subtitle="Use para salário mensal, extra, benefício ou outro custo efetivamente conhecido." onClose={onClose}><form onSubmit={save} className="personnel-form"><label><span>Pessoa (opcional)</span><select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}><option value="">Custo geral da equipe</option>{employees.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Tipo</span><select value={form.cost_type} onChange={e=>setForm({...form,cost_type:e.target.value})}>{Object.entries(COST_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label><span>Data</span><input type="date" value={form.cost_date} onChange={e=>setForm({...form,cost_date:e.target.value})}/></label><label><span>Descrição</span><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ex.: salário de agosto"/></label><label><span>Valor</span><input value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} inputMode="decimal"/></label><label className="check-label"><input type="checkbox" checked={form.paid} onChange={e=>setForm({...form,paid:e.target.checked})}/><span>Já foi pago</span></label>{form.paid&&<label><span>Forma de pagamento</span><input value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}/></label>}<label className="wide"><span>Observações</span><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>{message&&<p className="form-message">{message}</p>}<Actions busy={busy}/></form></Modal>; }

function ClosingModal({businessId,range,onClose,onSaved}:{businessId:string;range:Range;onClose:()=>void;onSaved:()=>Promise<void>}) {const [form,setForm]=useState({start:range.start,end:range.end,notes:''});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');async function save(e:React.FormEvent){e.preventDefault();setBusy(true);const result=await supabase.rpc('create_payroll_closing',{p_business_id:Number(businessId),p_period_start:form.start,p_period_end:form.end,p_notes:form.notes});if(result.error){setMessage(result.error.message);setBusy(false);return;}await onSaved();}return <Modal title="Fechar período" subtitle="Agrupa somente valores pendentes ainda não incluídos em outro fechamento." onClose={onClose}><form onSubmit={save} className="personnel-form"><label><span>Início</span><input type="date" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label><label><span>Fim</span><input type="date" value={form.end} onChange={e=>setForm({...form,end:e.target.value})}/></label><label className="wide"><span>Observações</span><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>{message&&<p className="form-message">{message}</p>}<Actions busy={busy} label="Criar fechamento"/></form></Modal>;}

function Modal({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:React.ReactNode}) {useEscapeToClose(onClose);return <div className="personnel-modal-backdrop"><div className="personnel-modal" role="dialog" aria-modal="true" aria-label={title}><button className="personnel-modal-close" onClick={onClose} aria-label="Fechar"><X size={18}/></button><p>GESTÃO DE PESSOAL</p><h2>{title}</h2><span className="personnel-modal-subtitle">{subtitle}</span>{children}</div></div>;}
function Actions({busy,label='Salvar'}:{busy:boolean;label?:string}) {return <div className="personnel-form-actions"><button type="submit" disabled={busy}>{busy?'Salvando…':label}</button></div>;}
