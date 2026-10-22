'use client';

import { useEffect, useState } from 'react';
import { duracaoMin, hora } from '@/modules/campo/domain/formatos';
import type { IntervaloLocal } from '@/modules/campo/domain/dia-local';

/**
 * Faixa "Em intervalo" (lote B §37, UX §3.6): desde quando, quantos minutos (com a conta), o aviso de privacidade e, passado o
 * lembrete configurado, "Intervalo há 1h. Voltar agora?" — nunca encerra sozinho.
 */
export function IntervaloFaixa({ aberto, lembreteMin }: { aberto: IntervaloLocal; lembreteMin: number }) {
  const [agora, setAgora] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date().toISOString()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const min = duracaoMin(aberto.started_at, agora) ?? 0;
  const lembrete = min >= lembreteMin;
  const h = Math.floor(min / 60);
  return (
    <section aria-label="Intervalo" className="card-surface space-y-1 border-2 border-foreground/40 p-4">
      <p className="text-base font-bold">
        <span aria-hidden>☕ </span>Em intervalo desde {hora(aberto.started_at)}
      </p>
      <p className="text-sm">
        {min} min (agora {hora(agora)} − início {hora(aberto.started_at)}){aberto.pendente ? ' · guardado neste celular' : ''}
      </p>
      <p className="text-sm text-muted-foreground">A localização fica pausada no intervalo. O ritmo não conta o tempo do intervalo.</p>
      {lembrete && (
        <p role="status" className="rounded-md bg-warning/15 p-2 text-sm font-bold">
          Intervalo há {h >= 1 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${min} min`}. Voltar agora?
        </p>
      )}
    </section>
  );
}
