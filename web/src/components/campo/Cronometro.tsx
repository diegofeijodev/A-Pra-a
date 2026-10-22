'use client';

import { useEffect, useState } from 'react';
import { cronometro } from '@/modules/campo/domain/checklist';

/**
 * Cronômetro da visita aberta (Lovable `roteiro…:223-227, 252`; contrato §35.6): só da tela, desde a chegada.
 * `role="timer"` com `aria-live="off"`: o leitor de tela não anuncia a cada segundo (UX §3.5, V5).
 */
export function Cronometro({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span role="timer" aria-live="off" aria-label="Tempo na visita" className="font-mono tabular-nums">
      <span aria-hidden>⏱ </span>
      {cronometro(Date.parse(desde), agora)}
    </span>
  );
}
