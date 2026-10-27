'use client';

import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cronometro } from '@/modules/campo/domain/checklist';
import { hora } from '@/modules/campo/domain/formatos';

/**
 * Cronômetro da visita aberta (Lovable `roteiro…:223-227, 252`; contrato §35.6): só da tela, desde a chegada, na pílula azul da
 * Lovable (redesenho E5c). `role="timer"` com `aria-live="off"`: o leitor de tela não anuncia a cada segundo (UX §3.5, V5).
 */
export function Cronometro({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span
      role="timer"
      aria-live="off"
      aria-label="Tempo na visita"
      className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1 font-mono text-lg tabular-nums text-primary-foreground"
    >
      <Timer className="h-4 w-4" aria-hidden />
      {cronometro(Date.parse(desde), agora)}
    </span>
  );
}

/**
 * Cabeçalho da visita (Lovable `VisitaAberta`, UX §4.13): "Visita em andamento", o nome (o `h1` da visão, quando é a tela da
 * visita) e o cronômetro — que só existe com o checklist ligado (lote B §35); sem ele, a hora da chegada. `children` = o que vem
 * logo abaixo dentro do cartão (no Roteiro, [Continuar visita]).
 */
export function VisitaEmAndamento({
  nome,
  desde,
  comCronometro,
  encerrada = false,
  titulo = false,
  children,
}: {
  nome: string;
  desde: string;
  comCronometro: boolean;
  encerrada?: boolean;
  titulo?: boolean;
  children?: React.ReactNode;
}) {
  const Nome = titulo ? 'h1' : 'p';
  return (
    <section aria-label={encerrada ? 'Visita finalizada' : 'Visita em andamento'} className="space-y-3 rounded-2xl border-2 border-primary bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{encerrada ? 'Visita finalizada' : 'Visita em andamento'}</p>
          <Nome className="truncate text-lg font-semibold">{nome}</Nome>
        </div>
        {comCronometro && !encerrada ? (
          <Cronometro desde={desde} />
        ) : (
          <span className="shrink-0 text-sm text-muted-foreground">chegada {hora(desde)}</span>
        )}
      </div>
      {children}
    </section>
  );
}
