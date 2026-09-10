'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, fmtBR, iso, parse, todaySp, wdOf, WD_SHORT } from '@/lib/dates';
import { labelOf } from '@/lib/midia';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useCampanhas,
  useCreativesOfCampanhas,
  useSetPublishDate,
  useTrafficOfCampanhas,
} from '@/modules/midia/application/use-midia';
import { usePracas } from '@/modules/pracas/application/use-pracas';

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

const BANDS = ["#5A9BC4", "#ECA826", "#3E8E5A", "#6B5B8A", "#C4881A", "#B4432E", "#3E7EA8"];
const colorFor = (i: number) => BANDS[i % BANDS.length]!;

/**
 * Calendário de publicação — porte de
 * `.prototype/src/components/praca/CampCalendario.tsx`.
 *
 * Desvio §15: arrastar uma peça é o `POST /v1/creatives/:id/publish-date`, que
 * muda `publish_at` e grava a nota "Data de publicação movida para …" no
 * histórico do criativo — no protótipo a tela montava o comentário. As peças
 * vêm de uma leitura por campanha (`GET /v1/creatives?campanha_id`), porque a
 * rota não aceita a praça inteira de uma vez.
 */
export function CampCalendario() {
  const { data: catalog } = useCatalog();
  const { data: pracas } = usePracas();
  const { data: campanhas } = useCampanhas();
  const setPublishDate = useSetPublishDate();
  const [cursor, setCursor] = useState(() => `${todaySp().slice(0, 7)}-01`);
  const [fPraca, setFPraca] = useState("all");
  const [fPlat, setFPlat] = useState("all");
  const [fPub, setFPub] = useState("all");
  const [drag, setDrag] = useState<string | null>(null);

  const todas = campanhas ?? [];
  // Depende de `campanhas` (e não do `todas`, que é um array novo a cada
  // render): a lista de ids é a chave das leituras por campanha lá embaixo.
  const ids = useMemo(() => (campanhas ?? []).map((c) => c.id), [campanhas]);
  const traffic = useTrafficOfCampanhas(ids);
  const creatives = useCreativesOfCampanhas(ids);

  const camps = todas.filter((c) =>
    (fPraca === "all" || c.praca_id === fPraca) &&
    (fPub === "all" || c.publico === fPub) &&
    (fPlat === "all" || traffic.some((t) => t.campanha_id === c.id && t.plataforma === fPlat)));

  const days = useMemo(() => {
    const start = addDays(cursor, -wdOf(cursor));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const monthLabel = parse(cursor).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const shift = (n: number) => setCursor((cur) => {
    const d = parse(cur);
    return iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
  });

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => shift(-1)} className="rounded-md border border-border p-1.5"><ChevronLeft size={15} /></button>
        <span className="min-w-[150px] font-display text-sm font-black capitalize">{monthLabel}</span>
        <button onClick={() => shift(1)} className="rounded-md border border-border p-1.5"><ChevronRight size={15} /></button>
        <select value={fPraca} onChange={(e) => setFPraca(e.target.value)} className={inputCls}>
          <option value="all">Todas as praças</option>
          {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={fPlat} onChange={(e) => setFPlat(e.target.value)} className={inputCls}>
          <option value="all">Meta e Google</option>
          <option value="meta">Meta</option>
          <option value="google">Google</option>
        </select>
        <select value={fPub} onChange={(e) => setFPub(e.target.value)} className={inputCls}>
          <option value="all">Os dois públicos</option>
          <option value="contratante">Contratante</option>
          <option value="freelancer">Freelancer</option>
        </select>
      </div>

      {/* faixas das campanhas */}
      <div className="mt-3 space-y-1">
        {camps.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px]" style={{ background: `${colorFor(i)}22`, borderLeft: `3px solid ${colorFor(i)}` }}>
            <span className="font-mono font-bold">{c.name}</span>
            <span className="text-muted-foreground">{fmtBR(c.start)} → {fmtBR(c.end)} · {c.status}</span>
          </div>
        ))}
        {!camps.length && <p className="text-xs text-muted-foreground">Nenhuma campanha com esses filtros.</p>}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center tag text-muted-foreground">
        {WD_SHORT.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
          const isToday = day === todaySp();
          const bands = camps.filter((c) => day >= c.start && day <= c.end);
          const pieces = creatives.filter((cr) => cr.publish_at === day && camps.some((c) => c.id === cr.campanha_id));
          return (
            <div
              key={day}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag) { setPublishDate.mutate({ id: drag, date: day }); setDrag(null); } }}
              className={`min-h-[92px] rounded-md border p-1 text-left ${isToday ? "border-primary" : "border-border"} ${inMonth ? "bg-card/60" : "bg-card/20 opacity-50"}`}
            >
              <p className="tag text-muted-foreground">{Number(day.slice(8))}</p>
              <div className="mt-0.5 flex gap-0.5">
                {bands.map((c) => <span key={c.id} className="h-1 flex-1 rounded-full" style={{ background: colorFor(camps.indexOf(c)) }} />)}
              </div>
              <div className="mt-1 space-y-1">
                {pieces.map((cr) => (
                  <div
                    key={cr.id}
                    draggable
                    onDragStart={() => setDrag(cr.id)}
                    title={`${labelOf(catalog?.formatos, cr.formato)} · ${labelOf(catalog?.creative_status, cr.status)}`}
                    className="cursor-grab truncate rounded bg-background px-1 py-0.5 text-[10px] leading-tight"
                  >
                    {cr.titulo || labelOf(catalog?.formatos, cr.formato)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Arraste uma peça para outro dia — a mudança de data fica registrada no histórico do criativo.
      </p>
    </div>
  );
}
