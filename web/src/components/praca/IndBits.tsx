'use client';

import { fmtBR } from '@/lib/dates';
import { fmtVal } from '@/lib/format';
import type { IndDir, IndReadingView, Sem } from '@/modules/indicators/application/use-indicators';

/**
 * Peças da tela de indicadores — porte de
 * `.prototype/src/components/praca/IndBits.tsx`.
 *
 * Único desvio: o semáforo e a leitura chegam PRONTOS do servidor (§16), então
 * `HeroCard` recebe o `IndReadingView` achatado no lugar do `IndReading` do
 * protótipo (que carregava um `def` aninhado). As cores continuam sendo dos
 * tokens do tema (`success`/`warning`/`danger`) — o protótipo usava
 * `var(--verde|--amarelo|--vermelho)`, que não existem nesta paleta.
 */

export const SEM_DOT: Record<Sem, string> = {
  ok: "bg-success", warn: "bg-warning", bad: "bg-danger", none: "bg-muted-foreground/40",
};
export const SEM_TEXT: Record<Sem, string> = {
  ok: "text-success", warn: "text-warning", bad: "text-danger", none: "text-muted-foreground",
};

export function Delta({ value, unit, dir }: { value: number | null; unit: string; dir: IndDir }) {
  if (value == null || Math.abs(value) < 0.05) return <span className="text-[11px] text-muted-foreground">estável</span>;
  const up = value > 0;
  const good = dir === "gte" ? up : !up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${good ? "text-success" : "text-danger"}`}>
      {up ? "▲" : "▼"} {fmtVal(Math.abs(value), unit)}
      <span className="font-normal text-muted-foreground"> vs anterior</span>
    </span>
  );
}

export function Line({ entries, height = 48 }: { entries: { date: string; value: number }[]; height?: number }) {
  if (entries.length < 2) return <p className="text-[11px] text-muted-foreground">sem histórico ainda</p>;
  const vals = entries.map((e) => e.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = entries.map((e, i) => `${(i / (entries.length - 1)) * 100},${20 - ((e.value - min) / range) * 18}`).join(" ");
  return (
    <svg viewBox="0 0 100 22" preserveAspectRatio="none" style={{ height }} className="w-full">
      <polyline points={pts} fill="none" stroke="var(--color-primary)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** cartão grande da visão Empresa */
export function HeroCard({ r }: { r: IndReadingView }) {
  const gray = r.source === "manual" && r.stale;
  return (
    <div className={`card-surface p-3 ${gray ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="tag text-muted-foreground">{r.name}</p>
        <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${SEM_DOT[gray ? "none" : r.sem]}`} />
      </div>
      <p className={`font-display mt-1 text-2xl font-extrabold tabular-nums ${gray ? "text-muted-foreground" : SEM_TEXT[r.sem]}`}>
        {fmtVal(r.value, r.unit)}
      </p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <Delta value={r.delta} unit={r.unit} dir={r.dir} />
        <span className="text-[10px] text-muted-foreground">meta {r.meta_label}</span>
      </div>
      {gray && <p className="mt-1 text-[10px] font-bold text-warning">número velho{r.last_at ? ` — desde ${fmtBR(r.last_at)}` : ""}</p>}
    </div>
  );
}

export function Cell({ value, meta, dir, unit }: { value: number | null; meta: number; dir: IndDir; unit: string }) {
  const sem = value == null ? "none" : (dir === "gte" ? (value >= meta ? "ok" : value >= meta * 0.85 ? "warn" : "bad") : (value <= meta ? "ok" : value <= meta * 1.15 ? "warn" : "bad"));
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className={`h-2 w-2 rounded-full ${SEM_DOT[sem]}`} />
      {fmtVal(value, unit)}
    </span>
  );
}

export function Bars({ rows, unit }: { rows: { label: string; value: number | null }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{r.label}</span>
          <div className="h-4 flex-1 rounded-sm bg-secondary/50">
            <div className="h-4 rounded-sm bg-primary/70" style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right text-xs font-bold tabular-nums">{fmtVal(r.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}
