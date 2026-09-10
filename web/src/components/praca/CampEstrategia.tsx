'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { addDays, fmtBR, todaySp } from '@/lib/dates';
import { brl } from '@/lib/format';
import { labelOf } from '@/lib/midia';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useCampanhas,
  useDeleteCampanha,
  useDuplicateCampanha,
  useProofs,
  useSaveCampanha,
  useSetCampanhaStatus,
  useSuggestName,
  type CampanhaBody,
  type CampanhaView,
  type GateView,
} from '@/modules/midia/application/use-midia';
import { useActivePraca, usePracas } from '@/modules/pracas/application/use-pracas';
import { FreelaCampaignDialog } from './FreelaCampaignDialog';

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";
const MAXTEXT = 400;

/** Portão desconhecido (praça sem campanha ainda) — o servidor é quem decide na hora de salvar. */
const GATE_ABERTO: GateView = { ok: true, falta: [] };

/** O briefing em edição: o corpo do `POST`/`PUT` com o status sempre presente. */
type CampanhaDraft = Omit<CampanhaBody, 'status' | 'justification'> & { status: string };

const novoDraft = (pracaId: string): CampanhaDraft => {
  const start = todaySp();
  return {
    praca_id: pracaId,
    publico: "contratante",
    objetivo: "cadastro_contratante",
    start,
    end: addDays(start, 30),
    verba: 3000,
    gasto: 0,
    dor: "",
    oferta: "",
    mensagem_chave: "",
    provas: [],
    destino: "formulario",
    kpi_name: "Cadastros de contratante",
    kpi_meta: 30,
    kpi_custo: 130,
    cac_teto: 130,
    status: "rascunho",
  };
};

const toDraft = (c: CampanhaView): CampanhaDraft => ({
  praca_id: c.praca_id,
  publico: c.publico,
  objetivo: c.objetivo,
  start: c.start,
  end: c.end,
  verba: c.verba,
  gasto: c.gasto,
  dor: c.dor,
  oferta: c.oferta,
  mensagem_chave: c.mensagem_chave,
  provas: c.provas,
  destino: c.destino,
  kpi_name: c.kpi_name,
  kpi_meta: c.kpi_meta,
  kpi_custo: c.kpi_custo,
  cac_teto: c.cac_teto,
  status: c.status,
});

/**
 * Estratégia — porte de `.prototype/src/components/praca/CampEstrategia.tsx`.
 *
 * Desvio §15: o nome padronizado (`campanhaName`), os números do cartão
 * (`campMetrics`) e o portão das etapas 2 e 6 (`gatesOk`) eram contas de tela
 * no protótipo e agora vêm prontos da API — `name`, `metrics` e `gate` do
 * `CampanhaView`. A justificativa de portão também é cobrada no servidor
 * (`GATE_JUSTIFICATION_REQUIRED`): a tela pede o texto igual ao protótipo, mas
 * quem manda é a API.
 */
export function CampEstrategia({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: campanhas } = useCampanhas();
  const [editing, setEditing] = useState<{ campanha: CampanhaView | null } | null>(null);
  const lista = campanhas ?? [];

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {lista.length} campanhas · o nome do briefing é o mesmo usado no Meta e no Google
        </p>
        <button onClick={() => setEditing({ campanha: null })} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={14} /> Nova campanha
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {lista.map((c) => (
          <CampanhaCard key={c.id} c={c} onEdit={() => setEditing({ campanha: c })} onOpen={() => onOpen(c.id)} />
        ))}
      </div>

      {editing && <Briefing campanha={editing.campanha} onClose={() => setEditing(null)} />}
    </>
  );
}

function CampanhaCard({ c, onEdit, onOpen }: { c: CampanhaView; onEdit: () => void; onOpen: () => void }) {
  const { data: catalog } = useCatalog();
  const { data: pracas } = usePracas();
  const deleteCampanha = useDeleteCampanha();
  const duplicate = useDuplicateCampanha();
  const praca = (pracas ?? []).find((p) => p.id === c.praca_id);
  const m = c.metrics;
  const gate = c.gate;
  const [dupOpen, setDupOpen] = useState(false);
  const [freelaOpen, setFreelaOpen] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="font-mono text-xs text-primary">{c.name}</p>
          <h3 className="font-display text-base font-bold">{labelOf(catalog?.objetivos, c.objetivo)}</h3>
          <p className="text-xs text-muted-foreground">
            {praca?.name ?? "—"} · {c.publico} · {fmtBR(c.start)} → {fmtBR(c.end)}
          </p>
        </div>
        <span className={`tag rounded-full px-2 py-0.5 ${c.status === "ativa" ? "bg-success/15 text-success" : c.status === "rascunho" ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning"}`}>
          {c.status}
        </span>
      </div>

      {!gate.ok && c.status !== "rascunho" && !c.gate_justification && (
        <p className="mt-2 flex gap-1.5 rounded-md bg-danger/10 p-2 text-xs text-danger"><AlertTriangle size={13} /> {catalog?.gate_warning}</p>
      )}
      {c.gate_justification && (
        <p className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-[11px] text-muted-foreground">
          Saiu do rascunho sem os portões — justificativa de {c.gate_justification.by}: “{c.gate_justification.text}”
        </p>
      )}

      <p className="mt-2 text-xs"><span className="text-muted-foreground">Mensagem-chave: </span>{c.mensagem_chave || "—"}</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Box label="verba" value={brl(c.verba)} />
        <Box label="gasto" value={brl(m.investido)} />
        <Box label={`meta · ${c.kpi_name}`} value={`${m.conversoes}/${c.kpi_meta}`} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Custo por conversão {m.cpc ? brl(m.cpc) : "—"} (máximo {brl(c.kpi_custo)}) · custo por cliente novo{" "}
        <span className={m.acima_teto ? "font-bold text-danger" : ""}>{m.cp_ativo ? brl(m.cp_ativo) : "—"}</span> (teto {brl(c.cac_teto)})
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onEdit} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold">Abrir briefing</button>
        <button onClick={onOpen} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold">Criativos</button>
        <button onClick={() => setDupOpen(!dupOpen)} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-bold">
          <Copy size={12} /> Duplicar campanha
        </button>
        {/* Acréscimo do port: leva o briefing para o sistema de campanhas do
            Freela (§18) sem redigitar público e mensagem. */}
        <button onClick={() => setFreelaOpen(true)} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-bold">
          <MessageCircle size={12} /> Campanha de WhatsApp no Freela
        </button>
        <button onClick={() => deleteCampanha.mutate(c.id)} className="ml-auto rounded-md border border-border p-1.5 text-muted-foreground hover:text-danger"><Trash2 size={12} /></button>
      </div>

      {dupOpen && (
        <div className="mt-2 rounded-md border border-dashed border-border p-2">
          <p className="text-[11px] text-muted-foreground">Reaproveita o briefing trocando só a praça e as provas locais:</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(pracas ?? []).map((p) => (
              <button key={p.id} onClick={() => { duplicate.mutate({ id: c.id, praca_id: p.id }); setDupOpen(false); }} className="rounded border border-border px-2 py-1 text-xs">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <FreelaCampaignDialog
        open={freelaOpen}
        onClose={() => setFreelaOpen(false)}
        initial={{
          name: c.name,
          praca_id: c.praca_id,
          audience: c.publico === "freelancer" ? "PROVIDERS_NEVER_APPLIED" : "CONTRACTORS_NEVER_PUBLISHED",
          whatsapp_template: `${c.mensagem_chave}\n${c.oferta}`.trim(),
        }}
      />
    </section>
  );
}

const Box = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-background/60 p-2">
    <span className="block font-display text-sm font-black">{value}</span>
    <span className="tag text-muted-foreground">{label}</span>
  </div>
);

// ══════════════ briefing ══════════════
function Briefing({ campanha, onClose }: { campanha: CampanhaView | null; onClose: () => void }) {
  const { data: catalog } = useCatalog();
  const { data: pracas } = usePracas();
  const { data: campanhas } = useCampanhas();
  const { praca: ativa } = useActivePraca();
  const save = useSaveCampanha();
  const setStatus = useSetCampanhaStatus();
  const suggest = useSuggestName();
  const [c, setC] = useState<CampanhaDraft>(() =>
    campanha ? toDraft(campanha) : novoDraft(ativa?.id ?? ""));
  const [name, setName] = useState(campanha?.name ?? "");
  const [just, setJust] = useState("");
  const { data: provas } = useProofs(c.praca_id);
  const set = (patch: Partial<CampanhaDraft>) => setC({ ...c, ...patch });

  // O portão é da PRAÇA: para a campanha em edição vem no próprio
  // `CampanhaView`; para uma campanha nova (ou quando o briefing troca de
  // praça) vem de qualquer campanha da praça escolhida. Praça sem campanha
  // nenhuma ainda: a tela deixa passar e o servidor cobra a justificativa.
  const gate =
    (campanha && campanha.praca_id === c.praca_id ? campanha.gate : undefined) ??
    (campanhas ?? []).find((x) => x.praca_id === c.praca_id)?.gate ??
    GATE_ABERTO;
  const needJust = !gate.ok && c.status !== "rascunho" && !campanha?.gate_justification;

  // O nome padronizado é do servidor (`POST /v1/campanhas/suggest-name`): pede
  // de novo a cada troca de praça, público, objetivo ou início — as mesmas
  // quatro entradas que o protótipo usava para remontar o nome na tela. O
  // `askedRef` evita repetir o pedido (o objeto da mutação muda de identidade a
  // cada render dela) e deixa o briefing existente abrir sem ir ao servidor.
  const nameKey = `${c.praca_id}|${c.publico}|${c.objetivo}|${c.start}`;
  const askedRef = useRef(campanha ? nameKey : "");
  useEffect(() => {
    if (!c.praca_id || askedRef.current === nameKey) return;
    askedRef.current = nameKey;
    suggest.mutate(
      { praca_id: c.praca_id, publico: c.publico, objetivo: c.objetivo, start: c.start },
      { onSuccess: (r) => setName(r.name) },
    );
  }, [nameKey, c.praca_id, c.publico, c.objetivo, c.start, suggest]);

  const salvar = async () => {
    if (!c.dor.trim() || !c.mensagem_chave.trim()) return;
    if (needJust && just.trim().length < 10) return;
    const { status, ...campos } = c;
    const justification = needJust ? just.trim().slice(0, MAXTEXT) : undefined;
    const body: CampanhaBody = { ...campos, ...(justification ? { justification } : {}) };
    try {
      if (!campanha) {
        await save.mutateAsync({ body: { ...body, status } });
      } else {
        // `PUT` sem `status` mantém o status atual (§15) — quem muda de status
        // é o `POST /:id/status`, que é onde o portão cobra a justificativa.
        await save.mutateAsync({ id: campanha.id, body });
        if (status !== campanha.status) {
          await setStatus.mutateAsync({ id: campanha.id, status, justification });
        }
      }
      onClose();
    } catch {
      // O `onError` da mutação já mostrou a mensagem da API (a justificativa do
      // portão volta como 400); o briefing fica aberto com o que foi digitado.
    }
  };

  const salvando = save.isPending || setStatus.isPending;

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-4 h-fit w-full max-w-2xl rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <p className="tag text-muted-foreground">Briefing da campanha</p>
        <h2 className="font-mono text-lg font-black text-primary">{name}</h2>
        <p className="text-[11px] text-muted-foreground">
          Padrão PRAÇA-PÚBLICO-OBJETIVO-MÊS — use esse mesmo nome no Meta e no Google para os números baterem.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Praça">
            <select value={c.praca_id} onChange={(e) => set({ praca_id: e.target.value, provas: [] })} className={inputCls}>
              {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Público">
            <select value={c.publico} onChange={(e) => set({ publico: e.target.value })} className={inputCls}>
              <option value="contratante">Contratante</option>
              <option value="freelancer">Freelancer</option>
            </select>
          </Field>
          <Field label="Objetivo">
            <select value={c.objetivo} onChange={(e) => set({ objetivo: e.target.value })} className={inputCls}>
              {(catalog?.objetivos ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Para onde manda">
            <select value={c.destino} onChange={(e) => set({ destino: e.target.value })} className={inputCls}>
              {(catalog?.destinos ?? []).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Início"><input type="date" value={c.start} onChange={(e) => set({ start: e.target.value })} className={inputCls} /></Field>
          <Field label="Fim"><input type="date" value={c.end} onChange={(e) => setC({ ...c, end: e.target.value })} className={inputCls} /></Field>
          <Field label="Verba prevista (R$)"><input type="number" min={0} value={c.verba} onChange={(e) => setC({ ...c, verba: Math.max(0, Number(e.target.value)) })} className={inputCls} /></Field>
          <Field label="Verba já gasta (R$)"><input type="number" min={0} value={c.gasto} onChange={(e) => setC({ ...c, gasto: Math.max(0, Number(e.target.value)) })} className={inputCls} /></Field>
        </div>

        <div className="mt-3 grid gap-3">
          <Field label="A dor que a campanha ataca (uma frase)">
            <input value={c.dor} maxLength={MAXTEXT} onChange={(e) => setC({ ...c, dor: e.target.value })} className={inputCls} placeholder="Dono perde o sábado quando falta gente." />
          </Field>
          <Field label="A oferta">
            <input value={c.oferta} maxLength={MAXTEXT} onChange={(e) => setC({ ...c, oferta: e.target.value })} className={inputCls} placeholder="Primeira contratação sem taxa" />
          </Field>
          <Field label="Mensagem-chave (precisa aparecer em todo criativo)">
            <input value={c.mensagem_chave} maxLength={MAXTEXT} onChange={(e) => setC({ ...c, mensagem_chave: e.target.value })} className={inputCls} />
          </Field>
        </div>

        <div className="mt-3">
          <p className="tag text-muted-foreground">Prova que vamos usar — coletada na etapa 5 da praça</p>
          <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
            {(provas ?? []).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={c.provas.includes(p.id)}
                  onChange={(e) => setC({ ...c, provas: e.target.checked ? [...c.provas, p.id] : c.provas.filter((x) => x !== p.id) })}
                />
                <span className="truncate">{p.title}</span>
                <span className="tag shrink-0 text-muted-foreground">{catalog?.proof_kind_labels?.[p.kind] ?? p.kind}</span>
              </label>
            ))}
            {!(provas ?? []).length && <p className="text-xs text-muted-foreground">Nenhuma prova registrada nessa praça ainda.</p>}
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Indicador de sucesso"><input value={c.kpi_name} onChange={(e) => setC({ ...c, kpi_name: e.target.value })} className={inputCls} /></Field>
          <Field label="Meta"><input type="number" min={0} value={c.kpi_meta} onChange={(e) => setC({ ...c, kpi_meta: Math.max(0, Number(e.target.value)) })} className={inputCls} /></Field>
          <Field label="Custo máximo por unidade (R$)"><input type="number" min={0} value={c.kpi_custo} onChange={(e) => setC({ ...c, kpi_custo: Math.max(0, Number(e.target.value)) })} className={inputCls} /></Field>
          <Field label="Teto de custo por cliente novo (R$)"><input type="number" min={0} value={c.cac_teto} onChange={(e) => setC({ ...c, cac_teto: Math.max(0, Number(e.target.value)) })} className={inputCls} /></Field>
          <Field label="Status">
            <select value={c.status} onChange={(e) => setC({ ...c, status: e.target.value })} className={inputCls}>
              {(catalog?.campanha_status ?? []).map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </Field>
        </div>

        {!gate.ok && c.status !== "rascunho" && (
          <div className="mt-4 rounded-lg border-2 border-danger/50 bg-danger/10 p-3">
            <p className="flex items-start gap-1.5 text-xs font-bold text-danger"><AlertTriangle size={14} /> {catalog?.gate_warning}</p>
            <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
              {gate.falta.map((f) => <li key={f}>{f}</li>)}
            </ul>
            {!campanha?.gate_justification && (
              <label className="mt-2 grid gap-1 text-xs">
                Justificativa escrita para seguir mesmo assim (obrigatória)
                <textarea value={just} maxLength={MAXTEXT} onChange={(e) => setJust(e.target.value)} rows={2} className={inputCls} />
              </label>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-bold">Cancelar</button>
          <button
            onClick={salvar}
            disabled={!c.dor.trim() || !c.mensagem_chave.trim() || (needJust && just.trim().length < 10) || salvando}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            Salvar briefing
          </button>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="grid gap-1 text-xs">{label}{children}</label>
);
