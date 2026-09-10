'use client';

import { useState } from 'react';
import { fmtBR, todaySp } from '@/lib/dates';
import { dueDateOf, recLabel } from '@/lib/recurrence';
import { useUiStore } from '@/lib/ui-store';
import {
  useAction,
  useAddComment,
  useAddSubitem,
  useCompleteAction,
  usePostponeAction,
  useReassignAction,
  useToggleSubitem,
  useUncompleteAction,
} from '@/modules/actions/application/use-actions';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { Avatar } from './bits';

/**
 * Painel da ação — porte de `.prototype/src/components/praca/ActionPanel.tsx`.
 *
 * Desvio §9.3: o protótipo tinha um `<select>` de autor em três lugares
 * (concluir, adiar, comentar) porque o "quem" era um campo do formulário. Aqui
 * autor é quem está logado — o servidor carimba pelo token, e os seletores
 * saíram.
 */
export function ActionPanel() {
  const openActionId = useUiStore((s) => s.openActionId);
  const openAction = useUiStore((s) => s.openAction);
  const { data: action } = useAction(openActionId);
  const { data: pracas } = usePracas();
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const complete = useCompleteAction();
  const uncomplete = useUncompleteAction();
  const postpone = usePostponeAction();
  const reassign = useReassignAction();
  const addComment = useAddComment();
  const addSubitem = useAddSubitem();
  const toggleSubitem = useToggleSubitem();

  const [result, setResult] = useState("");
  const [mode, setMode] = useState<"none" | "postpone" | "reassign" | "complete">("none");
  const [newDate, setNewDate] = useState(todaySp());
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [newSub, setNewSub] = useState("");
  const [copied, setCopied] = useState(false);

  if (!openActionId || !action) return null;
  const praca = pracas?.find((p) => p.id === action.praca_id);
  if (!praca) return null;
  const person = (id: string | null) => users?.find((u) => u.id === id);
  const people = (users ?? []).filter((u) => u.active);
  const close = () => { openAction(null); setMode("none"); setResult(""); setReason(""); };
  const stepDef = catalog?.steps.find((x) => x.n === action.step);
  const isOnce = action.rec.kind === "once";
  const done = isOnce ? !!action.completed_at : !!action.completions[todaySp()];

  const doComplete = () => {
    complete.mutate({
      id: action.id,
      date: isOnce ? undefined : todaySp(),
      result: result ? Number(result) : undefined,
    });
    close();
  };

  return (
    <div className="fixed inset-0 z-50 no-print" onClick={close}>
      <div className="absolute inset-0 bg-black/60" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="tag text-muted-foreground">{stepDef ? `Etapa ${stepDef.n} · ${stepDef.name}` : "Ação fixa"}</p>
            <h2 className="mt-1 font-display text-lg font-extrabold leading-snug">{action.title}</h2>
          </div>
          <button onClick={close} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {/* meta */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border border-border p-2.5">
            <p className="tag text-muted-foreground">Dono</p>
            <div className="mt-1 flex items-center gap-1.5">
              {action.owners.map((id) => (
                <span key={id} className="flex items-center gap-1"><Avatar person={person(id)} size={18} /><span className="text-xs">{person(id)?.name}</span></span>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border p-2.5">
            <p className="tag text-muted-foreground">Prazo</p>
            <p className="mt-1 text-xs font-semibold">{isOnce ? fmtBR(dueDateOf(action, praca)) : recLabel(action, praca)}</p>
            {action.postpone_count > 0 && <p className="text-[11px] text-warning">adiada {action.postpone_count}×</p>}
          </div>
          <div className="col-span-2 rounded-md border border-border p-2.5">
            <p className="tag text-muted-foreground">Status</p>
            <p className="mt-1 text-xs font-semibold">{done ? (isOnce ? `Concluída em ${fmtBR(action.completed_at?.slice(0, 10))}` : "Concluída hoje") : "Em aberto"}</p>
          </div>
        </div>

        {/* como fazer */}
        {action.subitems.length > 0 && (
          <div className="mt-5">
            <h3 className="tag text-muted-foreground">Como fazer</h3>
            <ul className="mt-2 space-y-1.5">
              {action.subitems.map((sub) => (
                <li key={sub.id} className="flex items-start gap-2 text-sm">
                  <button
                    onClick={() => toggleSubitem.mutate({ id: action.id, subitemId: sub.id })}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${sub.done ? "border-success bg-success" : "border-muted-foreground/50"}`}
                  >
                    {sub.done && <span className="text-[9px] font-black text-primary-foreground">✓</span>}
                  </button>
                  <span className={sub.done ? "text-muted-foreground line-through" : ""}>{sub.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Adicionar sub-item…" className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
          <button onClick={() => { if (newSub.trim()) { addSubitem.mutate({ id: action.id, text: newSub.trim() }); setNewSub(""); } }} className="rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-primary">+</button>
        </div>

        {action.expected && (
          <div className="mt-5">
            <h3 className="tag text-muted-foreground">Resultado esperado</h3>
            <p className="mt-1.5 rounded-md bg-secondary/60 p-3 text-sm">{action.expected}</p>
          </div>
        )}

        {action.tools && action.tools.length > 0 && (
          <div className="mt-5">
            <h3 className="tag text-muted-foreground">Ferramentas</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {action.tools.map((t) => <span key={t} className="tag rounded-sm border border-border px-2 py-1">{t}</span>)}
            </div>
          </div>
        )}

        {action.msg && (
          <div className="mt-5">
            <h3 className="tag text-muted-foreground">Modelo de mensagem</h3>
            <div className="mt-2 rounded-md border border-primary/40 bg-accent p-3">
              <p className="text-sm whitespace-pre-wrap">{action.msg}</p>
              <button
                onClick={() => { void navigator.clipboard.writeText(action.msg!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="tag mt-2 rounded-sm bg-primary px-2.5 py-1 text-primary-foreground"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        {action.attention && (
          <div className="mt-5 rounded-md border border-danger/40 bg-danger/12 p-3">
            <h3 className="tag text-danger">Atenção</h3>
            <p className="mt-1 text-sm">{action.attention}</p>
          </div>
        )}

        {/* ações */}
        <div className="mt-6 flex flex-wrap gap-2">
          {!done && (
            <button onClick={() => setMode(mode === "complete" ? "none" : "complete")} className="rounded-md bg-success px-4 py-2 text-sm font-bold text-primary-foreground">Concluir</button>
          )}
          {done && (
            <button onClick={() => { uncomplete.mutate({ id: action.id, date: isOnce ? undefined : todaySp() }); }} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">Desfazer conclusão</button>
          )}
          {isOnce && <button onClick={() => setMode(mode === "postpone" ? "none" : "postpone")} className="rounded-md border border-border px-4 py-2 text-sm">Adiar</button>}
          <button onClick={() => setMode(mode === "reassign" ? "none" : "reassign")} className="rounded-md border border-border px-4 py-2 text-sm">Passar para outra pessoa</button>
        </div>

        {mode === "complete" && (
          <div className="mt-3 space-y-2 rounded-md border border-success/40 bg-success/10 p-3">
            {action.expects_result && (
              <input value={result} onChange={(e) => setResult(e.target.value)} type="number" placeholder="Número alcançado" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" />
            )}
            <div className="flex items-center gap-2">
              <button onClick={doComplete} className="rounded-md bg-success px-4 py-1.5 text-xs font-bold text-primary-foreground">Confirmar</button>
            </div>
          </div>
        )}

        {mode === "postpone" && (
          <div className="mt-3 space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do adiamento" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" />
            <button
              onClick={() => { if (reason.trim()) { postpone.mutate({ id: action.id, new_date: newDate, reason: reason.trim() }); close(); } }}
              className="rounded-md bg-warning px-4 py-1.5 text-xs font-bold text-primary-foreground"
            >Adiar</button>
          </div>
        )}

        {mode === "reassign" && (
          <div className="mt-3 flex gap-2 rounded-md border border-border p-3">
            {people.map((p) => (
              <button key={p.id} onClick={() => { reassign.mutate({ id: action.id, user_id: p.id }); close(); }} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary">
                <Avatar person={p} size={16} /> {p.name}
              </button>
            ))}
          </div>
        )}

        {/* comentários */}
        <div className="mt-6">
          <h3 className="tag text-muted-foreground">Comentários</h3>
          <ul className="mt-2 space-y-2">
            {action.comments.map((c) => (
              <li key={c.id} className="rounded-md bg-secondary/60 p-2.5 text-sm">
                <p className="text-[11px] text-muted-foreground">
                  {person(c.author_id)?.name ?? c.author_id} · {fmtBR(c.at.slice(0, 10))} {c.at.slice(11, 16)}
                </p>
                <p className="mt-0.5">{c.text}</p>
              </li>
            ))}
            {action.comments.length === 0 && <li className="text-xs text-muted-foreground">Nenhum registro ainda.</li>}
          </ul>
          <div className="mt-2 flex gap-2">
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Registrar o que aconteceu…" className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
            <button onClick={() => { if (comment.trim()) { addComment.mutate({ id: action.id, text: comment.trim() }); setComment(""); } }} className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Enviar</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
