'use client';

import { useState } from 'react';
import {
  AlertTriangle, ArrowDown, ChevronDown, ChevronUp, Clock, LogIn, LogOut, MessageSquare,
  Pause, Play, Phone, Plus, Trash2, Zap,
} from 'lucide-react';
import { fmtDateTime } from '@/lib/dates';
import { useUiStore } from '@/lib/ui-store';
import {
  stepNodes,
  useCadenceStats,
  useCadences,
  useDeleteCadence,
  useEnrollments,
  useExitEnrollment,
  useRestoreSeed,
  useRunTest,
  useSaveCadence,
  useTogglePause,
  type CadenceNodeBody,
  type CadenceView,
} from '@/modules/cadences/application/use-cadences';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { pct, useSettings, useTemplates } from '@/modules/messages/application/use-messages';

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";
const nid = () => Math.random().toString(36).slice(2, 10);

/**
 * Cadências — porte de `.prototype/src/components/praca/Cadencias.tsx`.
 *
 * Desvio §19.1: NÃO existe `setInterval` aqui. No protótipo a tela chamava
 * `s.tick()` a cada 15 s e a cadência só andava com esta aba aberta; agora o
 * motor é um `@Cron` do servidor (§14) e a tela só lê o que ele já fez — o
 * painel aberto repergunta as estatísticas a cada 15 s.
 */
export function Cadencias() {
  const { data: cadences } = useCadences();
  const { data: enrollments } = useEnrollments();
  const togglePause = useTogglePause();
  const restore = useRestoreSeed();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CadenceDraft | null>(null);

  const lista = cadences ?? [];
  const rodando = (enrollments ?? []).filter((e) => e.status === "ativo").length;
  const anyRunning = lista.some((c) => !c.paused);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {lista.length} cadências · {rodando} pessoas rodando agora ·
          resposta de qualquer tipo tira da cadência na hora
        </p>
        <div className="flex gap-2">
          <button
            // Desvio: o protótipo invertia a condição e o botão "Pausar todas"
            // retomava as pausadas. Aqui pausa o que está rodando (e vice-versa).
            onClick={() => lista.forEach((c) => { if (c.paused !== anyRunning) togglePause.mutate(c.id); })}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-bold"
          >
            {anyRunning ? <><Pause size={14} /> Pausar todas</> : <><Play size={14} /> Retomar todas</>}
          </button>
          <button onClick={() => setEditing(novaCadencia())} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <Plus size={14} /> Nova cadência
          </button>
        </div>
      </div>

      {!lista.length && (
        <button onClick={() => restore.mutate()} disabled={restore.isPending} className="mt-3 text-xs underline text-muted-foreground disabled:opacity-40">
          restaurar as 5 cadências prontas
        </button>
      )}

      <div className="mt-4 space-y-3">
        {lista.map((c) => (
          <CadenceCard
            key={c.id}
            cadence={c}
            open={openId === c.id}
            onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            onEdit={() => setEditing(toDraft(c))}
          />
        ))}
      </div>

      {editing && <CadenceEditor cadence={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ══════════════ cartão + painel ══════════════
function CadenceCard({ cadence: c, open, onToggle, onEdit }: { cadence: CadenceView; open: boolean; onToggle: () => void; onEdit: () => void }) {
  const { data: catalog } = useCatalog();
  const { data: st } = useCadenceStats(c.id, { polling: open });
  const togglePause = useTogglePause();
  const runTest = useRunTest();
  const exitEnrollment = useExitEnrollment();
  const openLead = useUiStore((s) => s.openLead);
  const [phone, setPhone] = useState("");
  const [testOpen, setTestOpen] = useState(false);

  const perStep = st?.per_step ?? [];
  const inside = st?.inside ?? [];
  const maxReached = Math.max(1, ...perStep.map((p) => p.reached));
  const exitLabel = (reason: string) =>
    catalog?.exit_reason_labels?.[reason] ??
    (catalog?.cond_actions ?? []).find((a) => a.id === reason)?.label ??
    reason;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <div>
            <h3 className="font-display text-base font-bold">{c.name}</h3>
            <p className="text-xs text-muted-foreground">
              {(catalog?.audiences ?? []).find((a) => a.id === c.audience)?.label ?? c.audience} · entrada:{" "}
              {(catalog?.entry_rules ?? []).find((r) => r.id === c.entry)?.label ?? c.entry} ·{" "}
              {stepNodes(c).length} passos
            </p>
          </div>
        </button>
        <span className={`tag rounded-full px-2 py-0.5 ${c.paused ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"}`}>
          {c.paused ? "pausada" : "rodando"}
        </span>
        <div className="flex items-center gap-4 text-xs">
          <Metric label="entraram" value={st?.entered ?? 0} />
          <Metric label="rodando" value={st?.active ?? 0} />
          <Metric label="avançaram" value={st?.advanced ?? 0} />
        </div>
        <button onClick={() => togglePause.mutate(c.id)} className="rounded-md border border-border p-2" title={c.paused ? "Retomar" : "Pausar sem perder o ponto de cada pessoa"}>
          {c.paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button onClick={onEdit} className="rounded-md border border-border px-3 py-2 text-xs font-bold">Editar</button>
      </div>

      {open && (
        <div className="border-t border-border p-4">
          {/* funil visual */}
          <p className="tag text-muted-foreground">Funil da cadência — onde a gente perde gente</p>
          <div className="mt-2 space-y-1.5">
            {perStep.map((p, i) => (
              <div key={p.node.id} className="flex items-center gap-3 text-xs">
                <span className="w-28 shrink-0 text-muted-foreground">
                  passo {i + 1} · dia {p.node.day} {p.node.kind === "task" ? "· tarefa" : ""}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary/70" style={{ width: `${(p.reached / maxReached) * 100}%` }} />
                </div>
                <span className="w-44 shrink-0 tabular-nums text-muted-foreground">
                  {p.reached} receberam · {p.replied} responderam ({pct(p.resp_rate)}) · {p.here} aqui agora
                </span>
              </div>
            ))}
            {!perStep.length && <p className="text-xs text-muted-foreground">Sem passos.</p>}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="tag text-muted-foreground">Saídas por motivo</p>
              {st?.exits.length ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {st.exits.map((e) => (
                    <li key={e.reason} className="flex justify-between border-b border-border/60 pb-1">
                      <span>{exitLabel(e.reason)}</span>
                      <span className="font-bold tabular-nums">{e.count}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-xs text-muted-foreground">Ninguém saiu ainda.</p>}
            </div>
            <div>
              <p className="tag text-muted-foreground">Quem está dentro</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                {inside.map((e) => (
                  <li key={e.enrollment_id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                    <button onClick={() => openLead(e.lead_id)} className="truncate text-left underline-offset-2 hover:underline">
                      {e.lead_name || "—"}
                    </button>
                    <span className="shrink-0 text-muted-foreground">
                      {e.status === "aguardando" ? "esperando outra cadência" : `passo ${e.step_index + 1} · ${fmtDateTime(e.next_at)}`}
                    </span>
                    <button onClick={() => exitEnrollment.mutate({ id: e.enrollment_id })} className="shrink-0 text-muted-foreground hover:text-danger" title="Tirar da cadência">
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
                {!inside.length && <li className="text-muted-foreground">Ninguém dentro agora.</li>}
              </ul>
            </div>
          </div>

          {/* testar comigo */}
          <div className="mt-4 rounded-lg border border-dashed border-border p-3">
            {testOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Número de teste (só seu)" className={`${inputCls} w-52`} />
                <button
                  onClick={() => {
                    if (!phone.trim()) return;
                    runTest.mutate({ id: c.id, phone: phone.trim() }, { onSuccess: () => setTestOpen(false) });
                  }}
                  disabled={runTest.isPending}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
                >
                  Rodar agora
                </button>
                <span className="text-xs text-muted-foreground">cada dia da cadência vira 5 segundos</span>
              </div>
            ) : (
              <button onClick={() => setTestOpen(true)} className="flex items-center gap-1.5 text-xs font-bold">
                <Zap size={14} /> Testar comigo — roda a cadência inteira no seu número, com os intervalos comprimidos
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const Metric = ({ label, value }: { label: string; value: number }) => (
  <span className="text-center">
    <span className="block font-display text-base font-black tabular-nums leading-none">{value}</span>
    <span className="tag text-muted-foreground">{label}</span>
  </span>
);

// ══════════════ editor ══════════════
/**
 * Nó em edição. `_key` é só a chave do React: um nó novo NÃO tem `id` (o corpo
 * só aceita UUID), e nó que volta com o id que já tinha é atualizado no lugar —
 * é o que mantém o log de quem está no passo 3 (§14, `PUT /v1/cadences/:id`).
 */
interface DraftNode extends CadenceNodeBody {
  _key: string;
}

export interface CadenceDraft {
  id?: string;
  name: string;
  audience: string;
  entry: string;
  exit: { action: string; note: string };
  paused: boolean;
  nodes: DraftNode[];
}

/**
 * Cadência nova nasce PAUSADA (desvio §19.24; o protótipo criava despausada).
 * O motor é o `@Cron` de 15 s do servidor: salvar uma cadência de entrada
 * automática (`stage_novo`, `reheat_due`, `first_vaga`) já rodando matricularia
 * a base inteira antes de a pessoa terminar de escrever os passos. Quem liga é
 * gente, pelo "Retomar" do cartão — a mesma razão que faz o seed nascer pausado
 * (§19.16).
 */
const novaCadencia = (): CadenceDraft => ({
  name: "",
  audience: "contratante",
  entry: "manual",
  nodes: [{ _key: nid(), kind: "msg", day: 0, channel: "whatsapp", text: "" }],
  exit: { action: "sai", note: "" },
  paused: true,
});

const toDraft = (c: CadenceView): CadenceDraft => ({
  id: c.id,
  name: c.name,
  audience: c.audience,
  entry: c.entry,
  exit: { action: c.exit.action, note: c.exit.note },
  paused: c.paused,
  nodes: c.nodes.map((n) => ({
    _key: n.id,
    id: n.id,
    kind: n.kind,
    day: n.day,
    channel: n.channel ?? undefined,
    template_id: n.template_id ?? undefined,
    text: n.text ?? undefined,
    task: n.task ?? undefined,
    rule: n.rule ?? undefined,
    action: n.action ?? undefined,
    // O `PUT` substitui a cadência inteira: sem carregar a nota do nó, uma nota
    // criada fora desta tela sumiria ao salvar aqui.
    note: n.note ?? undefined,
  })),
});

/** Só os campos que o `kind` do nó aceita — campo a mais é 400 (whitelist). */
function nodeBody(n: DraftNode): CadenceNodeBody {
  const base: CadenceNodeBody = { kind: n.kind };
  if (n.id) base.id = n.id;
  if (n.note) base.note = n.note;
  if (n.kind === "cond") {
    base.rule = n.rule;
    base.action = n.action;
    return base;
  }
  base.day = n.day ?? 0;
  if (n.kind === "task") {
    base.task = n.task ?? "";
    return base;
  }
  base.channel = n.channel ?? "whatsapp";
  if (n.template_id) base.template_id = n.template_id;
  else base.text = n.text ?? "";
  return base;
}

function CadenceEditor({ cadence, onClose }: { cadence: CadenceDraft; onClose: () => void }) {
  const { data: catalog } = useCatalog();
  const { data: templates } = useTemplates();
  const { data: settings } = useSettings();
  const save = useSaveCadence();
  const remove = useDeleteCadence();
  const [c, setC] = useState<CadenceDraft>(cadence);

  const set = (patch: Partial<CadenceDraft>) => setC({ ...c, ...patch });
  const setNode = (key: string, patch: Partial<DraftNode>) =>
    set({ nodes: c.nodes.map((n) => (n._key === key ? { ...n, ...patch } : n)) });
  const addNode = (kind: string, after: number) => {
    const nodes = [...c.nodes];
    const lastDay = Math.max(0, ...nodes.filter((n) => n.kind !== "cond").map((n) => n.day ?? 0));
    const node: DraftNode =
      kind === "cond"
        ? { _key: nid(), kind, day: 0, rule: "respondeu", action: "sai_conversa" }
        : kind === "task"
          ? { _key: nid(), kind, day: lastDay + 2, task: "Ligar para o lead" }
          : { _key: nid(), kind, day: lastDay + 2, channel: "whatsapp", text: "" };
    nodes.splice(after + 1, 0, node);
    set({ nodes });
  };
  const move = (i: number, dir: -1 | 1) => {
    const nodes = [...c.nodes];
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return;
    [nodes[i], nodes[j]] = [nodes[j]!, nodes[i]!];
    set({ nodes });
  };

  const salvar = () => {
    if (!c.name.trim()) return;
    save.mutate(
      {
        id: c.id,
        body: {
          name: c.name.trim(),
          audience: c.audience,
          entry: c.entry,
          exit: c.exit,
          paused: c.paused,
          nodes: c.nodes.map(nodeBody),
        },
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-4 h-fit w-full max-w-2xl rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-black">{cadence.name ? "Editar cadência" : "Nova cadência"}</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs sm:col-span-2">
            Nome
            <input value={c.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder="Ex.: Prospecção de contratante — 3 toques" />
          </label>
          <label className="grid gap-1 text-xs">
            Público
            <select value={c.audience} onChange={(e) => set({ audience: e.target.value })} className={inputCls}>
              {(catalog?.audiences ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        </div>

        {/* entrada */}
        <div className="mt-5 rounded-lg border-2 border-success/50 bg-success/5 p-3">
          <p className="flex items-center gap-1.5 tag text-success"><LogIn size={12} /> Entrada — o que coloca a pessoa na cadência</p>
          <select value={c.entry} onChange={(e) => set({ entry: e.target.value })} className={`${inputCls} mt-2 w-full`}>
            {(catalog?.entry_rules ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        <div className="my-2 flex justify-center text-muted-foreground"><ArrowDown size={14} /></div>

        {/* passos */}
        <div className="space-y-2">
          {c.nodes.map((n, i) => (
            <div key={n._key}>
              <div className={`rounded-lg border p-3 ${n.kind === "cond" ? "border-dashed border-warning/60 bg-warning/5" : "border-border bg-background/40"}`}>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 tag">
                    {n.kind === "cond" ? <AlertTriangle size={12} /> : n.kind === "task" ? <Phone size={12} /> : <MessageSquare size={12} />}
                    {n.kind === "cond" ? "condição" : n.kind === "task" ? "tarefa" : "mensagem"}
                  </span>
                  {n.kind !== "cond" && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      dia
                      <input type="number" min={0} value={n.day ?? 0} onChange={(e) => setNode(n._key, { day: Math.max(0, Number(e.target.value) || 0) })} className={`${inputCls} w-16`} />
                    </label>
                  )}
                  <span className="flex-1" />
                  <button onClick={() => move(i, -1)} className="rounded border border-border p-1" title="Subir"><ChevronUp size={12} /></button>
                  <button onClick={() => move(i, 1)} className="rounded border border-border p-1" title="Descer"><ChevronDown size={12} /></button>
                  <button onClick={() => set({ nodes: c.nodes.filter((x) => x._key !== n._key) })} className="rounded border border-border p-1 text-muted-foreground hover:text-danger"><Trash2 size={12} /></button>
                </div>

                {n.kind === "cond" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select value={n.rule ?? ""} onChange={(e) => setNode(n._key, { rule: e.target.value })} className={inputCls}>
                      {(catalog?.cond_rules ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <select value={n.action ?? ""} onChange={(e) => setNode(n._key, { action: e.target.value })} className={inputCls}>
                      {(catalog?.cond_actions ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </div>
                )}

                {n.kind === "task" && (
                  <input value={n.task ?? ""} onChange={(e) => setNode(n._key, { task: e.target.value })} placeholder="O que a pessoa precisa fazer" className={`${inputCls} mt-2 w-full`} />
                )}

                {n.kind === "msg" && (
                  <div className="mt-2 grid gap-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select value={n.channel ?? "whatsapp"} onChange={(e) => setNode(n._key, { channel: e.target.value })} className={inputCls}>
                        {(catalog?.channels ?? []).map((ch) => <option key={ch.id} value={ch.id}>{ch.label}</option>)}
                      </select>
                      <select value={n.template_id ?? ""} onChange={(e) => setNode(n._key, { template_id: e.target.value || undefined })} className={`${inputCls} sm:col-span-2`}>
                        <option value="">— mensagem escrita aqui —</option>
                        {(templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    {!n.template_id && (
                      <textarea value={n.text ?? ""} onChange={(e) => setNode(n._key, { text: e.target.value })} rows={3} className={`${inputCls} w-full font-mono text-xs`} placeholder="Texto com {{variáveis}}" />
                    )}
                    {settings && (
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock size={11} /> janela {settings.window_start}h–{settings.window_end}h, limite de {settings.daily_limit}/dia e intervalo de {settings.gap_min}–{settings.gap_max}s valem aqui também
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="my-1 flex justify-center gap-2 text-[11px]">
                <button onClick={() => addNode("msg", i)} className="rounded border border-border px-2 py-0.5">+ mensagem</button>
                <button onClick={() => addNode("task", i)} className="rounded border border-border px-2 py-0.5">+ tarefa</button>
                <button onClick={() => addNode("cond", i)} className="rounded border border-border px-2 py-0.5">+ condição</button>
              </div>
            </div>
          ))}
        </div>

        {/* saída */}
        <div className="mt-3 rounded-lg border-2 border-danger/40 bg-danger/5 p-3">
          <p className="flex items-center gap-1.5 tag text-danger"><LogOut size={12} /> Saída — quem chegou ao fim sem responder</p>
          <select value={c.exit.action} onChange={(e) => set({ exit: { ...c.exit, action: e.target.value } })} className={`${inputCls} mt-2 w-full`}>
            {(catalog?.cond_actions ?? []).filter((a) => a.id !== "continua").map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <input value={c.exit.note} onChange={(e) => set({ exit: { ...c.exit, note: e.target.value } })} placeholder="Observação da saída" className={`${inputCls} mt-2 w-full`} />
        </div>

        <div className="mt-5 flex justify-between gap-2">
          {c.id && (
            <button onClick={() => remove.mutate(c.id as string, { onSuccess: () => onClose() })} disabled={remove.isPending} className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-40">
              Apagar
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-bold">Cancelar</button>
            <button
              onClick={salvar}
              disabled={save.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {save.isPending ? "Salvando…" : "Salvar cadência"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Regras fixas: resposta de qualquer tipo tira a pessoa na hora · ninguém fica em duas cadências ao mesmo tempo (a segunda espera) ·
          lista de bloqueio respeitada · toda mensagem entra na linha do tempo do lead. Canal:{" "}
          {(catalog?.channels ?? []).find((ch) => ch.id === "whatsapp")?.label ?? "WhatsApp"} por padrão.
        </p>
      </div>
    </div>
  );
}
