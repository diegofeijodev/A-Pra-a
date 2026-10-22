'use client';

import { useEffect, useState } from 'react';
import { useDia } from '@/modules/campo/application/use-campo';
import { porcentagem } from '@/modules/consultores/domain/atencao';
import { minutosSp, pausasEmMinutos, ritmoLocal, ritmoTexto } from '@/modules/rotas/domain/rota-local';

/**
 * Meta do dia e ritmo com a conta (UX §4.2), independentes do roteiro: quando há roteiro o card do
 * roteiro já mostra a mesma conta (mesmas visitas, mesma meta) e este não aparece.
 * O ritmo é recalculado com o relógio do aparelho — funciona sem sinal.
 */
export function MetaCard({ fechadoContaNaMeta = false }: { fechadoContaNaMeta?: boolean } = {}) {
  const { dia, hoje } = useDia(fechadoContaNaMeta);
  const goal = hoje?.goal ?? null;
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!goal) return null;

  const feitas = dia.contadores.feitas; // sem os "fechados" (§30.1)
  const meta = goal.params.meta_diaria;
  const emJornada = !!dia.jornada;
  // Lote B §37.6: com intervalo registrado (servidor + fila), o real no lugar do almoço — mesma conta do servidor.
  const ritmo = ritmoTexto(ritmoLocal(goal.params, feitas, minutosSp(agora), pausasEmMinutos(dia.intervalos, agora)), goal.params, minutosSp(agora));

  return (
    <section className="card-surface space-y-2 p-4" aria-label="Meta do dia">
      <p className="text-lg font-black">
        {feitas} de {meta} visitas
      </p>
      <div role="progressbar" aria-label="Visitas feitas na meta do dia" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={Math.min(feitas, meta)} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${porcentagem(feitas, meta)}%` }} />
      </div>
      {!goal.dia_de_trabalho ? (
        <p className="text-sm text-muted-foreground">Hoje não é dia de trabalho: o ritmo não é cobrado.</p>
      ) : emJornada ? (
        <>
          <p className={`text-sm font-bold ${ritmo.ok ? 'text-success' : 'text-warning'}`}>{ritmo.titulo}</p>
          <p className="text-sm text-muted-foreground">({ritmo.conta})</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{goal.conta}</p>
      )}
    </section>
  );
}
