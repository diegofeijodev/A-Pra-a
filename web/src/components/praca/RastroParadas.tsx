'use client';

import { hora } from '@/modules/campo/domain/formatos';
import type { StopTiming } from '@/modules/campo/domain/campo.types';

const FINAL: Record<string, string> = { cadastrou: 'cadastrou', cadastra_depois: 'vai cadastrar', nao_quis: 'não quis', ligar_depois: 'ligar depois' };
const min = (m: number | null) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);

/** Rastro do dia (§21.8): quanto tempo ficou em cada ponto e quanto levou de um ao outro. */
export function RastroParadas({ paradas, rota }: { paradas: StopTiming[]; rota: { goal: number; total: number; visitados: number } | null }) {
  if (!paradas.length) return null;
  const noLocal = paradas.reduce((s, p) => s + (p.minutes_on_site ?? 0), 0);
  const deslocando = paradas.reduce((s, p) => s + (p.minutes_travel ?? 0), 0);
  return (
    <section className="space-y-2">
      <h2 className="tag text-muted-foreground">Rastro do dia</h2>
      <p className="text-xs text-muted-foreground">
        {paradas.length} parada(s) · {min(noLocal)} nos estabelecimentos · {min(deslocando)} em deslocamento
        {rota ? ` · rota: ${rota.visitados} de ${rota.total} (meta ${rota.goal})` : ''}
      </p>
      <ol className="space-y-1">
        {paradas.map((p, i) => (
          <li key={p.visit_id} className="rounded-md border border-border px-3 py-2 text-xs">
            {p.minutes_travel != null && <p className="mb-1 text-muted-foreground">↓ {min(p.minutes_travel)} de deslocamento</p>}
            <p className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold">
                {i + 1}. {p.lead_name}
              </span>
              <span className="tabular-nums">
                {hora(p.checkin_at)}–{p.checkout_at ? hora(p.checkout_at) : '?'} · <b>{min(p.minutes_on_site)}</b> no local
              </span>
            </p>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-muted-foreground">
              {p.final_status && <span>{FINAL[p.final_status] ?? p.final_status}</span>}
              {p.far_from_place && <span className="text-danger">longe do endereço</span>}
              {p.off_route && <span className="text-warning">fora da rota</span>}
              {p.off_hours && <span className="text-warning">fora do horário</span>}
              {p.auto_closed && <span className="text-danger">sem checkout</span>}
              {p.clock_adjusted && <span>hora ajustada</span>}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
