'use client';

import { MapPin, Phone } from 'lucide-react';
import type { StopView } from '@/modules/campo/domain/campo.types';
import { irPara } from '@/modules/campo/application/use-tela';

const MOTIVO: Record<string, string> = { retorno: 'retorno combinado', pendente: 'ficou da semana passada', incluido: 'incluído pela equipe' };
const FINAL: Record<string, string> = {
  cadastrou: 'cadastrou',
  cadastra_depois: 'vai cadastrar depois',
  nao_quis: 'não quis',
  ligar_depois: 'ligar depois',
};

/** Link do mapa do aparelho: coordenada quando tem, senão o endereço. */
export function linkMapa(s: Pick<StopView, 'lat' | 'lng' | 'address' | 'lead_name'>): string {
  const destino = s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : `${s.lead_name}, ${s.address}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`;
}

/** Paradas da rota em ordem (§21.5): feito / falta, "Ir" abre o mapa, "Check-in" já leva o estabelecimento. */
export function RotaParadas({ paradas, podeVisitar }: { paradas: StopView[]; podeVisitar: boolean }) {
  return (
    <ol className="space-y-2">
      {paradas.map((s) => {
        const feito = !!s.visit;
        return (
          <li key={s.id} className={`card-surface flex items-start gap-3 p-3 ${feito ? 'opacity-70' : ''}`}>
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${feito ? 'bg-success text-primary-foreground' : 'border-2 border-border'}`}
            >
              {feito ? '✓' : s.position}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{s.lead_name}</p>
              <p className="truncate text-xs text-muted-foreground">{[s.address, s.bairro].filter(Boolean).join(' · ') || 'sem endereço'}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                {s.classe === 'grande' && <span className="text-primary">casa grande</span>}
                {MOTIVO[s.reason] && <span className="text-muted-foreground">{MOTIVO[s.reason]}</span>}
                {s.visit?.final_status && <span className="text-success">{FINAL[s.visit.final_status] ?? s.visit.final_status}</span>}
                {s.visit && !s.visit.checkout_at && <span className="text-primary">visita aberta</span>}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <a
                href={linkMapa(s)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ir até ${s.lead_name}`}
                className="flex h-9 items-center justify-center gap-1 rounded-md border border-border px-2 text-xs font-bold"
              >
                <MapPin size={13} /> Ir
              </a>
              {s.phone && (
                <a href={`tel:${s.phone}`} aria-label={`Ligar para ${s.lead_name}`} className="flex h-9 items-center justify-center gap-1 rounded-md border border-border px-2 text-xs">
                  <Phone size={13} />
                </a>
              )}
              {!feito && podeVisitar && (
                <button
                  type="button"
                  onClick={() => irPara({ v: 'nova', lead: s.lead_id, nome: s.lead_name })}
                  className="flex h-9 items-center justify-center rounded-md bg-primary px-2 text-xs font-bold text-primary-foreground"
                >
                  Check-in
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
