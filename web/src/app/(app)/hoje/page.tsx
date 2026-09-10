'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { addDays, fmtBR, fmtShort, todaySp, WD_SHORT, wdOf } from '@/lib/dates';
import { dueDateOf } from '@/lib/recurrence';
import { useUiStore } from '@/lib/ui-store';
import { useActions, useAgenda, type ActionView } from '@/modules/actions/application/use-actions';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { isStalled, useLeads, type LeadListView } from '@/modules/leads/application/use-leads';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { ActionRow, Avatar, NewActionButton, SectionHead } from '@/components/praca/bits';

/**
 * Hoje — porte de `.prototype/src/routes/index.tsx`.
 *
 * Desvio §9.2: a varredura de atrasadas/hoje/próximos 7 dias que o protótipo
 * fazia no navegador virou `GET /v1/pracas/:id/agenda` — inclusive a regra de
 * que uma ação recorrente entra em "Atrasado" no máximo uma vez (a ocorrência
 * perdida mais antiga da janela de 7 dias). A tela só resolve `action_id` →
 * ação e pinta.
 */
export default function HojePage() {
  const praca = useActivePraca();
  const hojePerson = useUiStore((s) => s.hojePerson);
  const setHojePerson = useUiStore((s) => s.setHojePerson);
  const today = todaySp();

  const { data: users } = useUsers();
  const { data: actions } = useActions(praca?.id);
  const { data: agenda } = useAgenda(praca?.id, {
    from: addDays(today, -7),
    to: addDays(today, 7),
    person: hojePerson,
  });

  const byId = useMemo(() => {
    const map = new Map<string, ActionView>();
    for (const a of actions ?? []) map.set(a.id, a);
    return map;
  }, [actions]);

  if (!praca) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma praça ainda — abra a primeira em <Link href="/praca" className="text-primary hover:underline">Praça</Link>.
      </p>
    );
  }

  const people = (users ?? []).filter((u) => u.active);
  const late = (agenda?.late ?? []).flatMap((x) => {
    const action = byId.get(x.action_id);
    return action ? [{ action, date: x.date, daysLate: x.days_late }] : [];
  });
  const todayItems = (agenda?.today ?? []).flatMap((x) => {
    const action = byId.get(x.action_id);
    return action ? [action] : [];
  });
  const next7 = (agenda?.next7 ?? []).map((b) => ({
    date: b.date,
    items: b.action_ids.flatMap((id) => {
      const action = byId.get(id);
      return action ? [action] : [];
    }),
  }));
  // `load` ignora o filtro de pessoa de propósito (§6): é a carga do dia de
  // todo mundo, não a da pessoa escolhida.
  const load = (agenda?.load ?? []).flatMap((l) => {
    const person = users?.find((u) => u.id === l.user_id);
    return person ? [{ person, count: l.count }] : [];
  });

  return (
    <>
      {/* seletor de pessoa */}
      <div className="flex flex-wrap items-center gap-1.5">
        {["all", ...people.map((p) => p.id)].map((id) => {
          const active = hojePerson === id;
          return (
            <button
              key={id}
              onClick={() => setHojePerson(id)}
              className={`tag rounded-md px-3 py-2 transition-colors ${active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
            >
              {id === "all" ? "Todos" : people.find((p) => p.id === id)?.name}
            </button>
          );
        })}
      </div>

      {/* barra de carga */}
      <div className="mt-4 card-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {load.map(({ person, count }) => (
            <span key={person.id} className="flex items-center gap-2 text-sm">
              <Avatar person={person} size={18} />
              <span className="font-semibold">{person.name}:</span>
              <span className="tabular-nums text-muted-foreground">{count} ações hoje</span>
            </span>
          ))}
        </div>
        {load.some((l) => l.count > 6) && (
          <p className="mt-2 rounded-md bg-warning/12 px-3 py-1.5 text-xs text-warning">
            dia sobrecarregado para {load.filter((l) => l.count > 6).map((l) => l.person.name).join(", ")} — considere remanejar
          </p>
        )}
      </div>

      {/* atrasadas */}
      <section className="mt-6">
        <SectionHead title="Atrasado" count={late.length} tone="danger" />
        <div className="mt-1 divide-y divide-border/50">
          {late.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Nada atrasado.</p>}
          {late.map(({ action, date, daysLate }) => (
            <div key={action.id + date} className="flex items-center gap-2">
              <div className="flex-1">
                <ActionRow action={action} praca={praca} date={date} showDate={fmtShort(date)} />
              </div>
              <span className="tag shrink-0 rounded-sm bg-danger/15 px-1.5 py-0.5 text-danger whitespace-nowrap">
                há {daysLate}d
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* hoje */}
      <section className="mt-6">
        <SectionHead title="Para hoje" count={todayItems.length} tone="warn" />
        <div className="mt-1 divide-y divide-border/50">
          {todayItems.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Nada para hoje.</p>}
          {todayItems.map((a) => <ActionRow key={a.id} action={a} praca={praca} date={today} />)}
        </div>
      </section>

      <FunilHoje />

      {/* próximos 7 dias */}
      <section className="mt-6">
        <SectionHead title="Próximos 7 dias" count={next7.reduce((n, b) => n + b.items.length, 0)} tone="neutral" />
        {next7.map((b) => (
          <div key={b.date} className="mt-3">
            <p className="tag px-3 py-1 text-muted-foreground">
              {WD_SHORT[wdOf(b.date)]} · {fmtBR(b.date)}
            </p>
            <div className="divide-y divide-border/50">
              {b.items.map((a) => <ActionRow key={a.id + b.date} action={a} praca={praca} date={b.date} showDate={fmtShort(a.rec.kind === "once" ? dueDateOf(a, praca) : b.date)} />)}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-8">
        <NewActionButton />
      </div>
    </>
  );
}

/**
 * "Funil — contratantes": o que precisa de toque hoje. `stalled_days` vem
 * calculado do servidor (§9) — no protótipo era recontado na tela a cada
 * render.
 */
function FunilHoje() {
  const praca = useActivePraca();
  const hojePerson = useUiStore((s) => s.hojePerson);
  const openLead = useUiStore((s) => s.openLead);
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const { data: leads } = useLeads({ praca_id: praca?.id, archived: false });
  const today = todaySp();

  const { due, stalled } = useMemo(() => {
    let list = (leads ?? []).filter((l) => !l.archived && l.stage !== 8);
    if (hojePerson !== "all") list = list.filter((l) => l.owner_id === hojePerson);
    return {
      due: list.filter((l) => l.next_step && l.next_step.date <= today).sort((a, b) => a.next_step!.date.localeCompare(b.next_step!.date)),
      stalled: list.filter((l) => isStalled(l) || !l.next_step).sort((a, b) => b.stalled_days - a.stalled_days),
    };
  }, [leads, hojePerson, today]);

  if (due.length === 0 && stalled.length === 0) return null;

  const stageDef = (n: number) => catalog?.funnel_stages.find((s) => s.n === n);

  const Row = ({ lead }: { lead: LeadListView }) => (
    <button
      onClick={() => openLead(lead.id)}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary/40"
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stageDef(lead.stage)?.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{lead.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {stageDef(lead.stage)?.name} · {lead.next_step ? `${lead.next_step.what} · ${fmtBR(lead.next_step.date)}` : "sem próximo passo"}
        </span>
      </span>
      <span className={`tag shrink-0 rounded-sm px-1.5 py-0.5 ${lead.stalled_days > 15 ? "bg-danger/15 text-danger" : "bg-warning/12 text-warning"}`}>
        {lead.stalled_days}d
      </span>
      <Avatar person={users?.find((u) => u.id === lead.owner_id)} size={18} />
    </button>
  );

  return (
    <section className="mt-6">
      <SectionHead title="Funil — contratantes" count={due.length + stalled.length} tone="warn" />
      <div className="mt-1 divide-y divide-border/50">
        {due.map((l) => <Row key={`d-${l.id}`} lead={l} />)}
        {stalled.filter((l) => !due.includes(l)).map((l) => <Row key={`s-${l.id}`} lead={l} />)}
      </div>
      <Link href="/funil" className="mt-2 inline-block px-3 text-xs text-primary hover:underline">abrir o quadro do funil →</Link>
      {/* O `<LeadPanel/>` (que o protótipo montava aqui) entra na Task 20, no
          layout — como o `<ActionPanel/>`. */}
    </section>
  );
}
