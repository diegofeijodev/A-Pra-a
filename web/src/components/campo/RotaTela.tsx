'use client';

import { CampoTopo } from '@/components/campo/CampoTopo';
import { RotaParadas } from '@/components/campo/RotaParadas';
import { todaySp } from '@/lib/dates';
import { useRotaSemana } from '@/modules/campo/application/use-campo';
import { irPara } from '@/modules/campo/application/use-tela';

const DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const rotuloDia = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return `${DIA[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};

/** Visão `rota` de `/campo`: as rotas da semana (segunda a sábado, §21.5). */
export function RotaTela() {
  const { data, isPending, isError } = useRotaSemana();
  const hoje = todaySp();
  return (
    <main className="space-y-5 pb-10">
      <CampoTopo titulo="Rota da semana" />
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">Sem sinal: a rota da semana precisa de internet. A de hoje está na tela inicial.</p>
      ) : !data.routes.length ? (
        <p className="card-surface p-5 text-sm">Nenhuma rota nesta semana ainda. As rotas abrem toda segunda de manhã.</p>
      ) : (
        data.routes.map((r) => (
          <section key={r.id} className="space-y-2">
            <h2 className="flex items-baseline justify-between">
              <span className={`tag ${r.day === hoje ? 'text-primary' : 'text-muted-foreground'}`}>
                {rotuloDia(r.day)}
                {r.day === hoje ? ' · hoje' : ''}
              </span>
              <span className="text-xs text-muted-foreground">
                {r.counts.visitados} de {r.counts.total} visitados
              </span>
            </h2>
            <RotaParadas paradas={r.stops} podeVisitar={false} />
          </section>
        ))
      )}
      <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
        Voltar
      </button>
    </main>
  );
}
