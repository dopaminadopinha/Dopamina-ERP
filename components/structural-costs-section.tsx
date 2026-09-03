"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useEscapeToClose } from "@/lib/use-escape-close";

type Area = { id: string; name: string };
type StructureType = "terrain" | "container" | "bathroom" | "other";
type StructureRow = { id: string; area_id: string | null; name: string; structure_type: StructureType; monthly_amount: number; effective_from: string; effective_to: string | null; is_active: boolean; notes: string | null; areas: { name: string } | { name: string }[] | null };
type Structure = { id: string; area_id: string | null; area_name: string | null; name: string; structure_type: StructureType; monthly_amount: number; effective_from: string; effective_to: string | null; is_active: boolean; notes: string | null };

const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const STRUCTURE: Record<StructureType, string> = { terrain: "Terreno", container: "Container", bathroom: "Banheiro", other: "Outro" };

function isoToday() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
function dateLabel(value: string | null) { return value ? DATE.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : "—"; }
function decimal(value: string) { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function nested<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

export function StructuralCostsSection({ businessId, areas, onChanged }: { businessId: string; areas: Area[]; onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Structure | null>(null);

  async function reload() {
    setLoading(true);
    const { data } = await supabase.from("structural_costs").select("id,area_id,name,structure_type,monthly_amount,effective_from,effective_to,is_active,notes,areas(name)").eq("business_id", businessId).order("is_active", { ascending: false }).order("name");
    setRows(((data ?? []) as unknown as StructureRow[]).map((row) => ({ ...row, area_name: nested(row.areas)?.name ?? null })));
    setLoading(false);
  }
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("structural_costs").select("id,area_id,name,structure_type,monthly_amount,effective_from,effective_to,is_active,notes,areas(name)").eq("business_id", businessId).order("is_active", { ascending: false }).order("name");
      if (cancelled) return;
      setRows(((data ?? []) as unknown as StructureRow[]).map((row) => ({ ...row, area_name: nested(row.areas)?.name ?? null })));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [businessId]);

  const monthlyTotal = rows.filter((row) => row.is_active).reduce((sum, row) => sum + Number(row.monthly_amount), 0);

  async function refreshed() { await Promise.all([reload(), onChanged()]); setModalOpen(false); setEditing(null); }
  async function remove(row: Structure) {
    if (!confirm(`Excluir o custo estrutural "${row.name}"? A despesa recorrente vinculada também será removida.`)) return;
    const { error } = await supabase.rpc("delete_structural_cost", { p_business_id: Number(businessId), p_id: Number(row.id) });
    if (error) return alert("Não foi possível excluir este custo.");
    await refreshed();
  }

  return <section className="structural-section">
    <div className="structural-section-head">
      <div><p>Aluguéis e estrutura</p><h3>Custos estruturais</h3><span>Terreno, containers, banheiros e outros custos fixos ligados à operação do bar. Cada um vira uma despesa recorrente controlada por aqui.</span></div>
      <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={15} /> Custo estrutural</button>
    </div>
    <p className="structural-monthly-note">Compromisso mensal ativo: <strong>{MONEY.format(monthlyTotal)}</strong> · {rows.filter((row) => row.is_active).length} custo(s)</p>
    {loading ? <div className="personnel-loading">Carregando…</div> : rows.length ? <div className="structure-list-wrap"><div className="structure-list">
      <div className="structure-list-head"><span>Custo</span><span>Tipo</span><span>Setor</span><span>Vigência</span><span>Valor mensal</span><span>Ações</span></div>
      {rows.map((row) => <article className={`structure-list-row ${row.is_active ? "" : "inactive"}`} key={row.id}>
        <strong className="structure-list-name">{row.name}{!row.is_active && <small>Inativo</small>}</strong>
        <span className="structure-list-type">{STRUCTURE[row.structure_type]}</span>
        <span>{row.area_name || "Geral / não atribuído"}</span>
        <span>Desde {dateLabel(row.effective_from)}{row.effective_to ? ` até ${dateLabel(row.effective_to)}` : " · sem fim"}</span>
        <strong className="structure-list-amount">{MONEY.format(row.monthly_amount)}<small>/mês</small></strong>
        <span className="structure-card-actions"><button type="button" onClick={() => { setEditing(row); setModalOpen(true); }} aria-label={`Editar ${row.name}`} title="Editar"><Pencil size={13} /></button><button type="button" onClick={() => remove(row)} aria-label={`Excluir ${row.name}`} title="Excluir"><Trash2 size={13} /></button></span>
      </article>)}
    </div></div> : <div className="personnel-empty">Cadastre terreno, containers, banheiros ou outro custo fixo real.</div>}
    {modalOpen && <StructureModal businessId={businessId} areas={areas} structure={editing} onClose={() => { setModalOpen(false); setEditing(null); }} onSaved={refreshed} />}
  </section>;
}

function StructureModal({ businessId, areas, structure, onClose, onSaved }: { businessId: string; areas: Area[]; structure: Structure | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: structure?.name ?? "", structure_type: structure?.structure_type ?? "container" as StructureType, area_id: structure?.area_id ? String(structure.area_id) : "", monthly_amount: structure ? String(structure.monthly_amount) : "", effective_from: structure?.effective_from ?? isoToday().slice(0, 7) + "-01", effective_to: structure?.effective_to ?? "", notes: structure?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || decimal(form.monthly_amount) <= 0) return setMessage("Informe nome e valor mensal.");
    setBusy(true);
    const result = structure
      ? await supabase.rpc("update_structural_cost", { p_business_id: Number(businessId), p_id: Number(structure.id), p_area_id: form.area_id ? Number(form.area_id) : null, p_name: form.name, p_structure_type: form.structure_type, p_monthly_amount: decimal(form.monthly_amount), p_effective_from: form.effective_from, p_effective_to: form.effective_to || null, p_notes: form.notes })
      : await supabase.rpc("save_structural_cost", { p_business_id: Number(businessId), p_area_id: form.area_id ? Number(form.area_id) : null, p_name: form.name, p_structure_type: form.structure_type, p_monthly_amount: decimal(form.monthly_amount), p_effective_from: form.effective_from, p_effective_to: form.effective_to || null, p_notes: form.notes });
    if (result.error) { setMessage(result.error.message); setBusy(false); return; }
    await onSaved();
  }
  return <Modal title={structure ? "Editar custo estrutural" : "Novo custo estrutural"} subtitle="Uma recorrência mensal será vinculada às Despesas sem duplicar lançamentos." onClose={onClose}>
    <form onSubmit={save} className="personnel-form">
      <label><span>Nome</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: aluguel do container Bar" /></label>
      <label><span>Estrutura</span><select value={form.structure_type} onChange={(e) => setForm({ ...form, structure_type: e.target.value as StructureType })}>{Object.entries(STRUCTURE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label><span>Setor responsável</span><select value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}><option value="">Geral / não atribuído</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label><span>Valor mensal</span><input value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} inputMode="decimal" /></label>
      <label><span>Vigência inicial</span><input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></label>
      <label><span>Vigência final (opcional)</span><input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></label>
      <label className="wide"><span>Observações</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      {message && <p className="form-message">{message}</p>}
      <div className="personnel-form-actions"><button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button></div>
    </form>
  </Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  useEscapeToClose(onClose);
  return <div className="personnel-modal-backdrop"><div className="personnel-modal" role="dialog" aria-modal="true" aria-label={title}><button className="personnel-modal-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button><p>DESPESAS</p><h2>{title}</h2><span className="personnel-modal-subtitle">{subtitle}</span>{children}</div></div>;
}
