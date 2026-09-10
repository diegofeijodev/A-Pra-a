'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { addDays, diffDays, fmtBR, iso, MONTHS, parse, todaySp, wdOf } from '@/lib/dates';
import { useUiStore } from '@/lib/ui-store';
import {
  useActions,
  useAgenda,
  usePostponeAction,
  useSteps,
  type ActionView,
} from '@/modules/actions/application/use-actions';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';

// Cor por bloco do roteiro — presentational, como em `routes/calendario.tsx`.
const BLOCK_COLORS: Record<string, string> = { Preparar: "#6B5B8A", "Começar": "#2E6F7E", Provar: "#ECA826", Crescer: "#3E8E5A" };

/**
 * Calendário — porte de `.prototype/src/routes/calendario.tsx`.
 *
 * Desvio §9.2: quais ações caem em cada dia vem de `by_date` da agenda
 * (`GET /v1/pracas/:id/agenda?from&to`), não de um `occursOn` rodando 42 vezes
 * no navegador. As faixas de etapa usam a `window` que a API já calcula.
 */
export default function CalendarioPage() {
  const praca = useActivePraca();
  const { data: users } = useUsers();
  const openAction = useUiStore((s) => s.openAction);
  const postpone = usePostponeAction();
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => todaySp().slice(0, 8) + "01");
  const [dragId, setDragId] = useState<string | null>(null);

  const days = useMemo(() => {
    if (view === "week") {
      const d = parse(cursor);
      const monday = addDays(iso(d), -((wdOf(iso(d)) + 6) % 7));
      return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    }
    const start = addDays(cursor, -((wdOf(cursor) + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor, view]);

  const { data: actions } = useActions(praca?.id);
  const { data: steps } = useSteps(praca?.id);
  const { data: agenda } = useAgenda(praca?.id, {
    from: days[0],
    to: days[days.length - 1],
    person: 'all',
  });

  const byId = useMemo(() => {
    const map = new Map<string, ActionView>();
    for (const a of actions ?? []) map.set(a.id, a);
    return map;
  }, [actions]);

  // Faixas de etapa na semana — mesma matemática do protótipo, com a `window`
  // de cada etapa no lugar do min/max dos dias do roteiro.
  const milestones = useMemo(() => {
    if (view !== "week" || days.length < 7) return [];
    const weekStart = days[0]!, weekEnd = days[6]!;
    return (steps ?? []).flatMap((st) => {
      if (!st.window) return [];
      const [start, end] = st.window;
      if (end < weekStart || start > weekEnd) return [];
      const from = start < weekStart ? 0 : diffDays(start, weekStart);
      const to = end > weekEnd ? 6 : diffDays(end, weekStart);
      return [{ n: st.n, name: st.name, block: st.block, from, to }];
    });
  }, [view, days, steps]);

  if (!praca) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma praça ainda — abra a primeira em <Link href="/praca" className="text-primary hover:underline">Praça</Link>.
      </p>
    );
  }

  const actsOn = (date: string): ActionView[] =>
    (agenda?.by_date[date] ?? []).flatMap((id) => {
      const a = byId.get(id);
      return a ? [a] : [];
    });

  const move = (dir: number) => {
    const d = parse(cursor);
    if (view === "month") setCursor(iso(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    else setCursor(addDays(cursor, dir * 7));
  };

  const onDrop = (date: string) => {
    if (!dragId) return;
    const a = byId.get(dragId);
    if (a && a.rec.kind === "once") {
      postpone.mutate({ id: a.id, new_date: date, reason: "Remanejada pelo calendário" });
    }
    setDragId(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl font-extrabold">
          {view === "month" ? `${MONTHS[parse(cursor).getMonth()]} ${parse(cursor).getFullYear()}` : `Semana de ${fmtBR(days[0]!)}`}
        </h1>
        <div className="ml-auto flex gap-1">
          <button onClick={() => move(-1)} className="rounded-md border border-border px-3 py-1.5 text-sm">←</button>
          <button onClick={() => setCursor(todaySp().slice(0, 8) + "01")} className="tag rounded-md border border-border px-3 py-1.5">Hoje</button>
          <button onClick={() => move(1)} className="rounded-md border border-border px-3 py-1.5 text-sm">→</button>
          <button onClick={() => setView("month")} className={`tag rounded-md px-3 py-1.5 ${view === "month" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>Mês</button>
          <button onClick={() => setView("week")} className={`tag rounded-md px-3 py-1.5 ${view === "week" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>Semana</button>
        </div>
      </div>

      {view === "week" && milestones.length > 0 && (
        <div className="relative mt-3 space-y-1">
          {milestones.map((m) => (
            <div key={m.n} className="relative h-4">
              <div
                className="absolute h-full rounded-sm opacity-30"
                style={{ left: `${(m.from / 7) * 100}%`, width: `${((m.to - m.from + 1) / 7) * 100}%`, backgroundColor: BLOCK_COLORS[m.block] }}
              />
              <span className="tag absolute" style={{ left: `${(m.from / 7) * 100 + 0.5}%` }}>Etapa {m.n} — {m.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {["seg","ter","qua","qui","sex","sáb","dom"].map((d) => (
          <div key={d} className="tag bg-secondary px-2 py-1.5 text-center text-muted-foreground">{d}</div>
        ))}
        {days.map((date) => {
          const inMonth = view === "week" || date.slice(0, 7) === cursor.slice(0, 7);
          const dayActs = actsOn(date);
          const isToday = date === todaySp();
          return (
            <div
              key={date}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(date)}
              className={`min-h-20 bg-card p-1 sm:min-h-28 sm:p-1.5 ${!inMonth ? "opacity-35" : ""} ${isToday ? "outline-2 outline-primary -outline-offset-2" : ""}`}
            >
              <p className={`text-right text-[11px] tabular-nums ${isToday ? "font-black text-primary" : "text-muted-foreground"}`}>{parse(date).getDate()}</p>
              <div className="mt-0.5 space-y-0.5">
                {dayActs.slice(0, view === "week" ? 20 : 4).map((a) => {
                  const owner = users?.find((u) => u.id === a.owners[0]);
                  const once = a.rec.kind === "once";
                  return (
                    <button
                      key={a.id + date}
                      draggable={once}
                      onDragStart={() => setDragId(a.id)}
                      onClick={() => openAction(a.id)}
                      title={a.title}
                      className="block w-full truncate rounded-sm px-1 py-0.5 text-left text-[10px] font-semibold"
                      style={{ backgroundColor: `${owner?.color}33`, color: owner?.color, borderLeft: `2px solid ${owner?.color}` }}
                    >
                      {once ? "" : "↻ "}{a.title}
                    </button>
                  );
                })}
                {view === "month" && dayActs.length > 4 && (
                  <p className="px-1 text-[10px] text-muted-foreground">+{dayActs.length - 4}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Arraste uma ação única para outro dia para adiar — o adiamento fica registrado na ação.</p>
    </>
  );
}
