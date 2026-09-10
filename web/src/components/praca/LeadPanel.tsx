'use client';

import { useEffect, useState } from 'react';
import { Phone, MapPin, MessageSquare, CalendarPlus, X, Archive } from 'lucide-react';
import { fmtBR, fmtDateTime, todaySp } from '@/lib/dates';
import { useUiStore } from '@/lib/ui-store';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useAddLeadEvent,
  useArchiveLead,
  useLead,
  useSetNextStep,
  useUpdateLead,
} from '@/modules/leads/application/use-leads';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { Avatar } from './bits';
import { MoveLeadDialog } from './MoveLeadDialog';

/**
 * Ficha do lead — porte de `.prototype/src/components/praca/LeadPanel.tsx`.
 *
 * Montado no layout (como o `<ActionPanel/>`), abre por `openLeadId` do
 * `lib/ui-store.ts` de qualquer tela. Desvio §9.3: sem seletor de autor — quem
 * escreve o evento é quem está logado, carimbado pelo servidor.
 */
const EV_COLOR: Record<string, string> = {
  msg_out: "#5A9BC4",
  msg_in: "#3E7EA8",
  call: "#ECA826",
  visit: "#6B5B8A",
  stage: "#3E8E5A",
  note: "#6E6B60",
};

export function LeadPanel() {
  const openLeadId = useUiStore((s) => s.openLeadId);
  const openLead = useUiStore((s) => s.openLead);
  const { data: lead } = useLead(openLeadId);
  const { data: pracas } = usePracas();
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const addEvent = useAddLeadEvent();
  const setNextStep = useSetNextStep();
  const updateLead = useUpdateLead();
  const archiveLead = useArchiveLead();
  const [note, setNote] = useState("");
  const [moveTo, setMoveTo] = useState<number | null>(null);
  const [nsWhat, setNsWhat] = useState("");
  const [nsDate, setNsDate] = useState(todaySp());

  const leadId = lead?.id;
  const nextWhat = lead?.next_step?.what;
  const nextDate = lead?.next_step?.date;
  useEffect(() => {
    setNote("");
    setNsWhat(nextWhat ?? "");
    setNsDate(nextDate ?? todaySp());
  }, [leadId, nextWhat, nextDate]);

  if (!openLeadId || !lead) return null;
  const close = () => { openLead(null); setMoveTo(null); };
  const def = catalog?.funnel_stages.find((s) => s.n === lead.stage);
  const stages = catalog?.funnel_stages ?? [];
  const stalled = lead.stalled_days;
  const person = (id: string | null) => users?.find((u) => u.id === id);
  const owner = person(lead.owner_id);
  const people = (users ?? []).filter((u) => u.active);
  const classLabel = catalog?.classes.find((c) => c.id === lead.classe)?.label ?? lead.classe;
  // `events` já vem do servidor do mais novo para o mais velho; a ordenação
  // aqui é a mesma do protótipo e não custa nada numa ficha.
  const timeline = [...lead.events].sort((a, b) => b.at.localeCompare(a.at));

  const quick = (kind: string, text: string) => addEvent.mutate({ id: lead.id, kind, text });

  return (
    <>
      <div className="no-print fixed inset-0 z-40 bg-black/50" onClick={close} />
      <aside className="no-print fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-border bg-popover p-4 shadow-2xl sm:max-w-lg">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {/* Sem o catálogo ainda, `${def?.color}33` viraria "undefined33" — CSS
                inválido que o navegador descarta. */}
            <span
              className="tag rounded-sm px-1.5 py-0.5"
              style={def ? { backgroundColor: `${def.color}33`, color: def.color } : undefined}
            >
              {lead.stage}. {def?.name}
            </span>
            <h2 className="mt-2 font-display text-lg font-extrabold leading-tight">{lead.name}</h2>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={12} /> {lead.city} · {pracas?.find((p) => p.id === lead.praca_id)?.name ?? "sem praça"}
            </p>
          </div>
          <button onClick={close} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground" aria-label="Fechar">
            <X size={14} />
          </button>
        </div>

        {/* próximo passo */}
        <div className={`mt-4 rounded-lg p-3 ${lead.next_step ? "bg-primary/12" : "bg-danger/12"}`}>
          <p className="tag text-muted-foreground">Próximo passo</p>
          {lead.next_step ? (
            <p className="mt-1 text-sm font-semibold">
              {lead.next_step.what} <span className="text-muted-foreground">· {fmtBR(lead.next_step.date)}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-danger">Sem próximo passo definido</p>
          )}
          <div className="mt-2 flex gap-2">
            <input
              value={nsWhat}
              onChange={(e) => setNsWhat(e.target.value)}
              placeholder="O que fazer"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
            <input type="date" value={nsDate} onChange={(e) => setNsDate(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
            <button
              onClick={() => nsWhat.trim() && setNextStep.mutate({ id: lead.id, what: nsWhat.trim(), date: nsDate })}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground"
            >
              Salvar
            </button>
          </div>
        </div>

        {/* dados */}
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Field label="Telefone" v={lead.phone} />
          <Field label="Endereço" v={lead.address} />
          <Field label="Instagram" v={lead.instagram || "—"} />
          <Field label="Site" v={lead.site || "—"} />
          <Field label="Decisor" v={lead.decisor} />
          <Field label="Cargo" v={lead.decisor_role} />
          <Field label="Classificação" v={classLabel} />
          <Field label="Origem" v={lead.origem} />
          <div>
            <p className="tag text-muted-foreground">Dono</p>
            <span className="mt-0.5 flex items-center gap-1.5">
              <Avatar person={owner} size={18} />
              <select
                value={lead.owner_id ?? ""}
                onChange={(e) => updateLead.mutate({ id: lead.id, input: { owner_id: e.target.value } })}
                className="rounded-md border border-input bg-background px-1.5 py-1 text-xs"
              >
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </span>
          </div>
          <div>
            <p className="tag text-muted-foreground">Parado</p>
            <p className={`mt-1 text-sm font-semibold ${stalled > 15 ? "text-danger" : stalled > 7 ? "text-warning" : ""}`}>{stalled} dias</p>
          </div>
        </div>

        {lead.lost_reason && (
          <p className="mt-3 rounded-md bg-danger/12 px-3 py-2 text-xs text-danger">
            Perdido — motivo: {lead.lost_reason}
            {lead.reheat_at ? ` · reaquecer em ${fmtBR(lead.reheat_at)}` : ""}
          </p>
        )}

        {/* mudar etapa */}
        <div className="mt-4">
          <p className="tag text-muted-foreground">Mover para etapa</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {stages.filter((st) => st.n !== lead.stage).map((st) => (
              <button
                key={st.n}
                onClick={() => setMoveTo(st.n)}
                className="tag rounded-sm border px-2 py-1"
                style={{ borderColor: `${st.color}88`, color: st.color }}
              >
                {st.n}. {st.name}
              </button>
            ))}
          </div>
        </div>

        {/* botões rápidos */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <QuickBtn icon={<Phone size={13} />} label="Registrar ligação" onClick={() => quick("call", `Ligação para ${lead.decisor}.`)} />
          <QuickBtn icon={<MapPin size={13} />} label="Registrar visita" onClick={() => quick("visit", `Visita em ${lead.name}.`)} />
          <QuickBtn icon={<MessageSquare size={13} />} label="Enviar mensagem" onClick={() => quick("msg_out", `Mensagem enviada para ${lead.name} (${lead.phone}).`)} />
          <QuickBtn icon={<CalendarPlus size={13} />} label="Agendar próximo passo" onClick={() => { setNsWhat(nsWhat || "Ligar para o decisor"); }} />
        </div>

        {/* vagas */}
        {lead.vagas.length > 0 && (
          <div className="mt-5">
            <p className="tag text-muted-foreground">Vagas do cliente</p>
            <table className="mt-1.5 w-full text-xs">
              <tbody>
                {lead.vagas.map((v) => (
                  <tr key={v.id} className="border-b border-border/60">
                    <td className="py-1.5">{fmtBR(v.date)}</td>
                    <td className="py-1.5">{v.funcao}</td>
                    <td className={`py-1.5 ${v.filled ? "text-success" : "text-danger"}`}>{v.filled ? "preenchida" : "não preenchida"}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{v.hours != null ? `${v.hours}h` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* linha do tempo */}
        <div className="mt-5">
          <p className="tag text-muted-foreground">Linha do tempo</p>
          <div className="mt-2 flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { quick("note", note.trim()); setNote(""); } }}
              placeholder="Escrever uma nota…"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => { if (note.trim()) { quick("note", note.trim()); setNote(""); } }}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Anotar
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {timeline.map((e) => (
              <li key={e.id} className="flex gap-2 text-xs">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: EV_COLOR[e.kind] }} />
                <div className="min-w-0">
                  {/* `author_label` é quem escreveu quando o evento não veio de
                      uma pessoa do time (importação, formulário) — §9. */}
                  <p className="text-muted-foreground">
                    {catalog?.event_labels[e.kind] ?? e.kind} · {fmtDateTime(e.at)} · {e.author_label ?? person(e.author_id)?.name ?? "—"}
                  </p>
                  <p className="mt-0.5">{e.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {!lead.archived && (
          <button
            onClick={() => { archiveLead.mutate(lead.id); close(); }}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2 text-xs text-muted-foreground hover:text-danger"
          >
            <Archive size={13} /> Arquivar lead (mantém histórico)
          </button>
        )}
      </aside>

      {moveTo != null && (
        <MoveLeadDialog leadId={lead.id} leadName={lead.name} to={moveTo} onClose={() => setMoveTo(null)} />
      )}
    </>
  );
}

function Field({ label, v }: { label: string; v: string }) {
  return (
    <div className="min-w-0">
      <p className="tag text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate">{v}</p>
    </div>
  );
}

function QuickBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {icon} {label}
    </button>
  );
}
