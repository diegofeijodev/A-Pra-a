'use client';

import { useState } from 'react';
import { AlertTriangle, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { fmtBR, todaySp } from '@/lib/dates';
import { brl } from '@/lib/format';
import { labelOf } from '@/lib/midia';
import { useUiStore } from '@/lib/ui-store';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { useLeads } from '@/modules/leads/application/use-leads';
import {
  useCampanhas,
  useCreatives,
  useDeleteTraffic,
  useFillBrake,
  usePullTrafficApi,
  useSaveTraffic,
  useSaveTrafficDay,
  useTraffic,
  type CampanhaView,
  type TrafficBody,
  type TrafficEntryView,
} from '@/modules/midia/application/use-midia';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";
const safeUrl = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : "");

/** Entrada de plataforma em edição: o corpo do `POST`/`PUT` mais o id (vazio = nova). */
type TrafficDraft = TrafficBody & { id: string };

/** `days` fica de fora de propósito: mandar campo a mais no `PUT` é 400 (whitelist). */
const toDraft = (t: TrafficEntryView): TrafficDraft => ({
  id: t.id,
  campanha_id: t.campanha_id,
  plataforma: t.plataforma,
  nome_la: t.nome_la,
  publico: t.publico,
  geo: t.geo,
  verba_diaria: t.verba_diaria,
  criativos: t.criativos,
  manager_url: t.manager_url,
  api_connected: t.api_connected,
});

/**
 * Tráfego — porte de `.prototype/src/components/praca/CampTrafego.tsx`.
 *
 * Desvio §15: os números por campanha (`campMetrics`) e o freio de
 * preenchimento (`fillHours`) vêm do servidor — `metrics` do `CampanhaView` e
 * `GET /v1/campanhas/fill-hours`. "Puxar pela API" é o
 * `POST /v1/traffic/:id/pull-api` (mesma simulação do protótipo, feita no
 * servidor) e lançar dia é upsert por data.
 */
export function CampTrafego() {
  const { praca } = useActivePraca();
  const { data: campanhas } = useCampanhas();
  const { data: brake } = useFillBrake(praca?.id);
  const [editing, setEditing] = useState<TrafficDraft | null>(null);
  const lista = campanhas ?? [];
  const freio = !!brake?.above;
  const ativas = lista.filter((c) => c.status === "ativa" || c.status === "pausada");
  const { data: catalog } = useCatalog();

  const novo = (c: CampanhaView): TrafficDraft => ({
    id: "",
    campanha_id: c.id,
    plataforma: "meta",
    nome_la: c.name,
    publico: "",
    geo: `${praca?.city ?? ""} + raio de 50 km`,
    verba_diaria: 100,
    criativos: [],
    manager_url: "",
    api_connected: false,
  });

  return (
    <>
      {freio && (
        <div className="mt-4 rounded-lg border-2 border-danger bg-danger/10 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-danger"><AlertTriangle size={16} /> {catalog?.fill_alert}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tempo médio de preenchimento em {praca?.name}: {(brake?.fill_hours ?? 0).toFixed(1)}h · Diego e Mkt externo avisados (também no sino de notificações).
          </p>
        </div>
      )}

      {/* comparação lado a lado */}
      <div className="mt-5">
        <p className="tag text-muted-foreground">Campanhas ativas lado a lado</p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[680px] text-xs">
            <thead className="bg-card text-muted-foreground">
              <tr>
                {["Campanha", "Verba", "Investido", "Cadastros", "Custo/cadastro", "Clientes ativos", "Custo/cliente ativo", "Teto"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ativas.map((c) => {
                const m = c.metrics;
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{c.name}</td>
                    <td className="px-3 py-2 tabular-nums">{brl(c.verba)}</td>
                    <td className="px-3 py-2 tabular-nums">{brl(m.investido)}</td>
                    <td className="px-3 py-2 tabular-nums">{m.cadastros}</td>
                    <td className="px-3 py-2 tabular-nums">{m.cp_cadastro ? brl(m.cp_cadastro) : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{m.ativos}</td>
                    <td className={`px-3 py-2 tabular-nums ${m.acima_teto ? "font-bold text-danger" : ""}`}>{m.cp_ativo ? brl(m.cp_ativo) : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {brl(c.cac_teto)} {m.acima_teto && <span className="ml-1 text-danger">acima do teto</span>}
                    </td>
                  </tr>
                );
              })}
              {!ativas.length && (
                <tr><td colSpan={8} className="px-3 py-3 text-muted-foreground">Nenhuma campanha fora do rascunho ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* entradas por plataforma */}
      <div className="mt-6 space-y-3">
        {lista.map((c) => (
          <CampanhaBloco key={c.id} c={c} onNew={() => setEditing(novo(c))} onEdit={setEditing} />
        ))}
      </div>

      {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Uma campanha: as entradas de plataforma dela e a ligação com o funil. */
function CampanhaBloco({ c, onNew, onEdit }: { c: CampanhaView; onNew: () => void; onEdit: (t: TrafficDraft) => void }) {
  const { data: entries } = useTraffic(c.id);
  const { data: leadsData } = useLeads({ campanha_id: c.id });
  const openLead = useUiStore((s) => s.openLead);
  const m = c.metrics;
  const lista = entries ?? [];
  const leads = leadsData ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <p className="font-mono text-xs text-primary">{c.name}</p>
          <p className="text-xs text-muted-foreground">
            {lista.length} entradas de plataforma · investido {brl(m.investido)} · {m.conversoes} conversões ·
            custo por conversão {m.cpc ? brl(m.cpc) : "—"}
          </p>
        </div>
        <button onClick={onNew} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-bold">
          <Plus size={12} /> Entrada de plataforma
        </button>
      </div>

      {lista.map((t) => (
        <EntryBlock key={t.id} entry={t} onEdit={() => onEdit(toDraft(t))} />
      ))}

      {/* ligação com o funil */}
      <div className="mt-3 rounded-lg border border-dashed border-border p-3">
        <p className="tag text-muted-foreground">Ligação com o funil — quem entrou pelo formulário desta campanha</p>
        {leads.length ? (
          <>
            <p className="mt-1 text-xs">
              {leads.length} leads · {m.cadastros} cadastraram · <span className="font-bold text-success">{m.ativos} viraram cliente ativo</span>
            </p>
            <ul className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
              {leads.slice(0, 8).map((l) => (
                <li key={l.id}>
                  <button onClick={() => openLead(l.id)} className="underline-offset-2 hover:underline">
                    {l.name}
                  </button>
                  <span className="text-muted-foreground"> · etapa {l.stage}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhum lead ainda. O formulário da praça com <code>?camp={c.id}</code> marca os leads nesta campanha.
          </p>
        )}
      </div>
    </section>
  );
}

function EntryBlock({ entry: t, onEdit }: { entry: TrafficEntryView; onEdit: () => void }) {
  const saveDay = useSaveTrafficDay();
  const pull = usePullTrafficApi();
  const [open, setOpen] = useState(false);
  const days = t.days.slice().sort((a, b) => b.date.localeCompare(a.date));
  const [form, setForm] = useState({ date: todaySp(), investido: 0, alcance: 0, cliques: 0, conversoes: 0 });
  const url = safeUrl(t.manager_url);

  const lancar = async () => {
    try {
      // `alcance`, `cliques` e `conversoes` são `@IsInt()` no DTO: arredonda
      // aqui para um decimal digitado não virar 400. `investido` é decimal.
      await saveDay.mutateAsync({
        id: t.id,
        body: {
          date: form.date,
          investido: Math.max(0, form.investido),
          alcance: Math.max(0, Math.round(form.alcance)),
          cliques: Math.max(0, Math.round(form.cliques)),
          conversoes: Math.max(0, Math.round(form.conversoes)),
        },
      });
      // Só limpa quando o servidor aceitou — num erro os números digitados ficam.
      setForm((f) => ({ ...f, investido: 0, alcance: 0, cliques: 0, conversoes: 0 }));
    } catch {
      // O `onError` da mutação já mostrou a mensagem da API.
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`tag rounded px-2 py-0.5 ${t.plataforma === "meta" ? "bg-[#5A9BC4]/20 text-[#5A9BC4]" : "bg-warning/20 text-warning"}`}>
          {t.plataforma === "meta" ? "Meta" : "Google"}
        </span>
        <span className="font-mono text-xs">{t.nome_la}</span>
        <span className="text-[11px] text-muted-foreground">{t.geo} · {brl(t.verba_diaria)}/dia · {t.criativos.length} criativos</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] underline">
            <ExternalLink size={11} /> gerenciador
          </a>
        )}
        <span className="flex-1" />
        <span className={`tag ${t.api_connected ? "text-success" : "text-muted-foreground"}`}>
          {t.api_connected ? "API ligada — puxa sozinho todo dia" : "lançamento manual"}
        </span>
        <button onClick={onEdit} className="rounded border border-border px-2 py-1 text-[11px] font-bold">Editar</button>
        <button onClick={() => setOpen(!open)} className="rounded border border-border px-2 py-1 text-[11px] font-bold">
          {open ? "Fechar" : "Lançar resultado"}
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">Público: {t.publico || "—"}</p>

      {open && (
        <div className="mt-2">
          {t.api_connected ? (
            <button
              onClick={() => pull.mutate(t.id)}
              disabled={pull.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              <RefreshCw size={12} /> Puxar os números de hoje pela API
            </button>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[11px]">data<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${inputCls} w-36`} /></label>
              <label className="grid gap-1 text-[11px]">investido<input type="number" min={0} value={form.investido} onChange={(e) => setForm({ ...form, investido: Number(e.target.value) })} className={`${inputCls} w-24`} /></label>
              <label className="grid gap-1 text-[11px]">alcance<input type="number" min={0} step={1} value={form.alcance} onChange={(e) => setForm({ ...form, alcance: Number(e.target.value) })} className={`${inputCls} w-24`} /></label>
              <label className="grid gap-1 text-[11px]">cliques<input type="number" min={0} step={1} value={form.cliques} onChange={(e) => setForm({ ...form, cliques: Number(e.target.value) })} className={`${inputCls} w-24`} /></label>
              <label className="grid gap-1 text-[11px]">conversões<input type="number" min={0} step={1} value={form.conversoes} onChange={(e) => setForm({ ...form, conversoes: Number(e.target.value) })} className={`${inputCls} w-24`} /></label>
              <button onClick={lancar} disabled={saveDay.isPending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40">Lançar dia</button>
            </div>
          )}

          {!!days.length && (
            <table className="mt-3 w-full text-[11px]">
              <thead className="text-muted-foreground">
                <tr>{["dia", "investido", "alcance", "cliques", "conversões", "custo/conversão"].map((h) => <th key={h} className="text-left font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.id} className="border-t border-border/60">
                    <td>{fmtBR(d.date)}{d.auto ? " · API" : ""}</td>
                    <td className="tabular-nums">{brl(d.investido)}</td>
                    <td className="tabular-nums">{d.alcance.toLocaleString("pt-BR")}</td>
                    <td className="tabular-nums">{d.cliques}</td>
                    <td className="tabular-nums">{d.conversoes}</td>
                    <td className="tabular-nums">{d.conversoes ? brl(d.investido / d.conversoes) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function EntryEditor({ entry, onClose }: { entry: TrafficDraft; onClose: () => void }) {
  const { data: catalog } = useCatalog();
  const save = useSaveTraffic();
  const deleteTraffic = useDeleteTraffic();
  const [t, setT] = useState<TrafficDraft>(entry);
  const { data: creatives } = useCreatives(t.campanha_id);
  // Quem oferece só os aprovados é a TELA: o servidor aceita qualquer criativo
  // da mesma campanha (§19.20), senão pedir ajuste numa peça no ar derrubaria
  // o próximo `PUT` da entrada.
  const aprovados = (creatives ?? []).filter((c) => c.status === "aprovado" || c.status === "publicado");
  const set = (patch: Partial<TrafficDraft>) => setT({ ...t, ...patch });

  const salvar = async () => {
    const { id, ...body } = t;
    try {
      await save.mutateAsync({ id: id || undefined, body });
      onClose();
    } catch {
      // O `onError` da mutação já mostrou a mensagem da API.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-black">Entrada de plataforma</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">Plataforma
            <select value={t.plataforma} onChange={(e) => set({ plataforma: e.target.value })} className={inputCls}>
              <option value="meta">Meta</option>
              <option value="google">Google</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">Verba diária (R$)
            <input type="number" min={0} value={t.verba_diaria} onChange={(e) => set({ verba_diaria: Math.max(0, Number(e.target.value)) })} className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">Nome usado lá
            <input value={t.nome_la} maxLength={120} onChange={(e) => set({ nome_la: e.target.value })} className={`${inputCls} font-mono`} />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">Público
            <input value={t.publico} maxLength={300} onChange={(e) => set({ publico: e.target.value })} className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">Recorte geográfico
            <input value={t.geo} maxLength={200} onChange={(e) => set({ geo: e.target.value })} className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">Endereço da campanha no gerenciador
            <input value={t.manager_url} maxLength={500} onChange={(e) => set({ manager_url: e.target.value })} placeholder="https://…" className={inputCls} />
          </label>
        </div>

        <p className="mt-3 tag text-muted-foreground">Criativos usados — só peças aprovadas</p>
        <div className="mt-1.5 grid gap-1">
          {aprovados.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={t.criativos.includes(c.id)}
                onChange={(e) => set({ criativos: e.target.checked ? [...t.criativos, c.id] : t.criativos.filter((x) => x !== c.id) })}
              />
              {c.titulo} <span className="tag text-muted-foreground">{labelOf(catalog?.creative_status, c.status)}</span>
            </label>
          ))}
          {!aprovados.length && <p className="text-xs text-muted-foreground">Nenhuma peça aprovada nesta campanha ainda.</p>}
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={t.api_connected} onChange={(e) => set({ api_connected: e.target.checked })} />
          Integração por API configurada (puxa os números sozinho todo dia)
        </label>

        <div className="mt-5 flex justify-between gap-2">
          <button onClick={() => { if (t.id) deleteTraffic.mutate(t.id); onClose(); }} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            <Trash2 size={13} /> Apagar
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-bold">Cancelar</button>
            <button onClick={() => void salvar()} disabled={save.isPending} className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
