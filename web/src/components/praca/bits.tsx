'use client';

import { useState } from 'react';
import { todaySp, WD_SHORT, wdOf, fmtShort } from '@/lib/dates';
import { dueDateOf, isDoneOn, recLabel } from '@/lib/recurrence';
import { useUiStore } from '@/lib/ui-store';
import {
  useCompleteAction,
  useCreateAction,
  useUncompleteAction,
  type ActionView,
} from '@/modules/actions/application/use-actions';
import { useActivePraca, type PracaView } from '@/modules/pracas/application/use-pracas';
import { useUsers, type UserView } from '@/modules/users/application/use-users';

export function Avatar({ person, size = 22 }: { person: UserView | undefined; size?: number }) {
  if (!person) return <span className="inline-block rounded-full bg-muted" style={{ width: size, height: size }} />;
  return (
    <span
      title={person.name}
      className="inline-flex items-center justify-center rounded-full font-bold text-[10px]"
      style={{ width: size, height: size, backgroundColor: person.color, color: "#1D1D1B" }}
    >
      {person.name.slice(0, 1)}
    </span>
  );
}

export function StepTag({ n }: { n: number }) {
  const label = n === 0 ? "Fixa" : `Etapa ${n}`;
  return (
    <span className="tag rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground whitespace-nowrap">
      {label}
    </span>
  );
}

export function Check({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={checked ? "Desfazer conclusão" : "Concluir"}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-all duration-150 ${
        checked ? "border-success bg-success scale-105" : "border-muted-foreground/50 hover:border-primary"
      }`}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5L4.5 9L10 3" stroke="#1D1D1B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function ActionRow({
  action,
  praca,
  date,
  showDate,
}: {
  action: ActionView;
  praca: PracaView;
  date?: string; // dia da ocorrência (recorrente); padrão hoje
  showDate?: string; // rótulo alternativo da coluna de prazo
}) {
  const openAction = useUiStore((s) => s.openAction);
  const { data: users } = useUsers();
  const complete = useCompleteAction();
  const uncomplete = useUncompleteAction();
  const d = date ?? todaySp();
  const done = isDoneOn(action, d);
  const owners = action.owners
    .map((id) => users?.find((u) => u.id === id))
    .filter(Boolean) as UserView[];
  const [justDone, setJustDone] = useState(false);

  const prazoLabel =
    showDate ?? (action.rec.kind === "once" ? fmtShort(dueDateOf(action, praca)) : recLabel(action, praca));

  // O autor da conclusão é quem está logado (desvio §9.3): o servidor carimba
  // `completed_by` com o dono do token, sem o seletor de pessoa do protótipo.
  const toggle = () => {
    if (done) {
      uncomplete.mutate({ id: action.id, date: action.rec.kind === "once" ? undefined : d });
      return;
    }
    if (action.expects_result) {
      openAction(action.id);
      return; // o número é lançado no painel
    }
    complete.mutate({ id: action.id, date: action.rec.kind === "once" ? undefined : d });
    setJustDone(true);
    setTimeout(() => setJustDone(false), 400);
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-md border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-card ${
        justDone ? "opacity-50" : ""
      } ${done ? "opacity-55" : ""}`}
    >
      <Check checked={done} onToggle={toggle} />
      <button
        onClick={() => openAction(action.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className={`truncate text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{action.title}</span>
        <StepTag n={action.step} />
      </button>
      <span className="hidden items-center -space-x-1 sm:flex">
        {owners.map((p) => <Avatar key={p.id} person={p} />)}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {wdOf(d) < 7 && action.rec.kind !== "once" && date ? `${WD_SHORT[wdOf(d)]} ` : ""}
        {prazoLabel}
      </span>
      <button
        onClick={() => openAction(action.id)}
        className="tag shrink-0 rounded-sm border border-border px-2 py-1 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        Abrir
      </button>
    </div>
  );
}

export function SectionHead({ title, count, tone }: { title: string; count: number; tone: "danger" | "warn" | "neutral" }) {
  const bg = tone === "danger" ? "bg-danger/12" : tone === "warn" ? "bg-warning/12" : "bg-secondary/60";
  const dot = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warning" : "bg-muted-foreground";
  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${bg}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <h2 className="tag">{title}</h2>
      <span className="tag text-muted-foreground">{count}</span>
    </div>
  );
}

export function NewActionButton() {
  const praca = useActivePraca();
  const { data: users } = useUsers();
  const createAction = useCreateAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [date, setDate] = useState(todaySp());
  const people = (users ?? []).filter((u) => u.active);
  // O protótipo tinha "diego" fixo como dono padrão; aqui a lista vem do banco,
  // então a primeira pessoa ativa faz o papel até alguém escolher.
  const ownerId = owner || people[0]?.id || "";

  const save = () => {
    if (!title.trim() || !praca || !ownerId) return;
    createAction.mutate(
      { praca_id: praca.id, title: title.trim(), owners: [ownerId], due_date: date },
      { onSuccess: () => { setTitle(""); setOpen(false); } },
    );
  };

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-primary py-3 font-display text-sm font-extrabold tracking-wide text-primary-foreground uppercase transition-transform hover:scale-[1.01]"
      >
        + Nova ação
      </button>
    );

  return (
    <div className="card-surface space-y-3 p-4">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título da ação"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <select value={ownerId} onChange={(e) => setOwner(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-2 py-2 text-sm">
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-input bg-background px-2 py-2 text-sm" />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={createAction.isPending} className="flex-1 rounded-md bg-primary py-2 text-sm font-bold text-primary-foreground">Adicionar</button>
        <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">Cancelar</button>
      </div>
    </div>
  );
}
