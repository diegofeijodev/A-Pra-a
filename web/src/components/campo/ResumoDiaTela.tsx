'use client';

import { useEffect } from 'react';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { ResumoDiaConteudo } from '@/components/praca/ResumoDiaConteudo';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import { useOnline } from '@/modules/campo/application/use-online';
import { irPara } from '@/modules/campo/application/use-tela';
import { useResumoDiaCampo } from '@/modules/painel/application/use-painel';
import { rotuloDia } from '@/modules/remuneracao/domain/remuneracao';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';


/**
 * "Resultado do seu dia" (contrato §33.5, UX §3.6). Abre ao encerrar o dia e em Ganhos. A conta é do servidor; sem sinal,
 * avisa e não inventa número. Com `ui_resumo_dia = desligado`, volta para a tela Hoje.
 */
export function ResumoDiaTela({ dia }: { dia?: string }) {
  const me = useCampoMe();
  const ligado = me.data?.features?.day_summary === true;
  const online = useOnline();
  const q = useResumoDiaCampo(dia, ligado);
  const desligado = q.data?.display === 'desligado';
  useEffect(() => {
    if (desligado) irPara({ v: 'hoje' }, 'replace');
  }, [desligado]);
  const fechar = () => irPara({ v: 'hoje' });
  const diaTela = dia ?? todaySp();

  return (
    <main className="space-y-4 pb-28">
      <CampoTopo titulo={`Resultado do seu dia · ${rotuloDia(diaTela)}`} />
      {/* O encerrar pode estar na fila (sem sinal): a faixa diz o que ainda não saiu deste celular. */}
      <FaixaFila />
      {!ligado && me.data ? (
        <p className="card-surface p-4 text-sm">Este recurso ainda não está ligado neste servidor.</p>
      ) : q.isError ? (
        <div className="card-surface space-y-2 p-4">
          <p role="alert" className="text-sm">
            {online ? apiErrorMessage(q.error, 'Não foi possível calcular o resultado do dia.') : 'Sem sinal agora. O resultado do dia aparece quando o celular tiver sinal.'}
          </p>
          <Button variant="outline" className="h-14 w-full" onClick={() => void q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !q.data || desligado ? (
        <div aria-busy="true" className="space-y-3">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : (
        <section className="card-surface p-4">
          <ResumoDiaConteudo r={q.data} />
        </section>
      )}
      {/* Acima das 5 abas da casca (o resultado do dia acende "Hoje", redesenho E4). */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-card/95 py-3 backdrop-blur">
        <div className="mx-auto max-w-md px-4">
          <Button onClick={fechar} className="h-14 w-full text-base">
            Fechar
          </Button>
        </div>
      </div>
    </main>
  );
}

/** Cartão de Ganhos: abre o resultado de hoje e dos 6 dias anteriores (UX §3.6, "Dias anteriores"). */
export function ResumoDiaAtalhos() {
  const me = useCampoMe();
  if (me.data?.features?.day_summary !== true) return null;
  const hoje = todaySp();
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
  return (
    <section className="card-surface space-y-2 p-4" aria-label="Resultado do dia">
      <p className="text-base font-bold">Resultado do dia</p>
      <div className="grid grid-cols-2 gap-2">
        {dias.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => irPara(i === 0 ? { v: 'resumo' } : { v: 'resumo', dia: d })}
            className="flex h-14 items-center justify-center rounded-md border border-border text-sm font-bold"
          >
            {i === 0 ? 'Hoje' : rotuloDia(d)}
          </button>
        ))}
      </div>
    </section>
  );
}
