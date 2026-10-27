'use client';

import { useState } from 'react';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { addDays, todaySp } from '@/lib/dates';
import { irPara } from '@/modules/campo/application/use-tela';
import { useMinhasRotas } from '@/modules/planos/application/use-planos';
import { diaCurto, semanasDoMes, type MinhaRota } from '@/modules/planos/domain/planos';
import { etaTexto } from '@/modules/rotas/domain/rota-local';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function CartaoRota({ r }: { r: MinhaRota }) {
  const paradas = r.stops.filter((s) => s.status !== 'descartada');
  const comHora = paradas.filter((s) => s.eta);
  return (
    <section className="card-surface space-y-2 p-4" aria-label={r.route_plan?.name ?? 'Roteiro'}>
      <p className="flex items-center gap-2 text-base font-bold">
        {r.route_plan && <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: r.route_plan.color }} />}
        {r.route_plan?.name ?? 'Roteiro'} · {paradas.length} {paradas.length === 1 ? 'parada' : 'paradas'} · {r.travel_mode === 'carro' ? 'de carro' : 'a pé'}
      </p>
      {comHora.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Chegada prevista na 1ª às {etaTexto(comHora[0]!.eta!)} e na última às {etaTexto(comHora[comHora.length - 1]!.eta!)} (relógio do roteiro; muda se a equipe refizer).
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-6 text-sm">
        {paradas.map((s) => (
          <li key={s.id}>
            <span className="font-semibold">{s.name}</span> <span className="text-muted-foreground">— {s.address || 'sem endereço'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * "Próximos dias" (contrato §39.7, UX §3.4; Lovable "Minhas rotas"): calendário do mês com um ponto nos dias com rota e, abaixo,
 * as rotas do dia escolhido — só leitura. Precisa de sinal (não fica no aparelho). O roteiro de hoje continua na tela Hoje.
 */
export function ProximosDiasTela() {
  const hoje = todaySp();
  const [diaSel, setDiaSel] = useState(hoje);
  const [ano, mes] = [Number(diaSel.slice(0, 4)), Number(diaSel.slice(5, 7))];
  const [mesVisto, setMesVisto] = useState({ ano, mes });
  // Do 1º dia do mês visto (ou hoje) até 31 dias depois: dentro do teto de 62 dias da API.
  const from = `${mesVisto.ano}-${String(mesVisto.mes).padStart(2, '0')}-01`;
  const to = addDays(from, 41);
  const q = useMinhasRotas(from, to);
  const porDia = new Map<string, MinhaRota[]>();
  for (const r of q.data?.routes ?? []) porDia.set(r.day, [...(porDia.get(r.day) ?? []), r]);
  const doDia = porDia.get(diaSel) ?? [];
  const mudarMes = (d: number) => {
    const m0 = mesVisto.mes - 1 + d;
    setMesVisto({ ano: mesVisto.ano + Math.floor(m0 / 12), mes: ((m0 % 12) + 12) % 12 + 1 });
  };

  return (
    <main className="space-y-4 pb-24">
      <CampoTopo titulo="Próximos dias" grande />
      {!q.ligado ? (
        <p className="card-surface p-5 text-sm">Este recurso ainda não está ligado neste servidor.</p>
      ) : (
        <>
          <section className="card-surface space-y-2 p-3" aria-label="Calendário das rotas">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => mudarMes(-1)} className="h-12 w-12 rounded-md border border-border text-lg font-bold" aria-label="Mês anterior">
                ‹
              </button>
              <p className="text-base font-bold" aria-live="polite">
                {MESES[mesVisto.mes - 1]} de {mesVisto.ano}
              </p>
              <button type="button" onClick={() => mudarMes(1)} className="h-12 w-12 rounded-md border border-border text-lg font-bold" aria-label="Próximo mês">
                ›
              </button>
            </div>
            <div role="grid" className="grid grid-cols-7 gap-1 text-center text-sm">
              {SEMANA.map((d, i) => (
                <span key={i} aria-hidden className="text-muted-foreground">
                  {d}
                </span>
              ))}
              {semanasDoMes(mesVisto.ano, mesVisto.mes)
                .flat()
                .map((d, i) =>
                  d ? (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDiaSel(d)}
                      aria-pressed={d === diaSel}
                      aria-label={`${diaCurto(d)}${porDia.has(d) ? `, ${porDia.get(d)!.length} rota(s)` : ', sem rota'}${d === hoje ? ', hoje' : ''}`}
                      className={`relative h-12 w-full rounded-md border text-sm font-bold ${d === diaSel ? 'border-primary bg-primary text-primary-foreground' : d === hoje ? 'border-foreground' : 'border-border'}`}
                    >
                      {Number(d.slice(8, 10))}
                      {porDia.has(d) && <span aria-hidden className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-current" />}
                    </button>
                  ) : (
                    <span key={`v${i}`} />
                  ),
                )}
            </div>
            <p className="text-sm text-muted-foreground">● = dia com rota publicada pela equipe para você.</p>
          </section>

          <h2 className="text-base font-bold">
            {diaCurto(diaSel)}
            {diaSel === hoje ? ' · hoje' : ''}
          </h2>
          {q.isPending ? (
            <div aria-busy="true" className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : q.isError ? (
            <section role="alert" className="card-surface space-y-2 p-4 text-sm">
              <p>{apiErrorMessage(q.error, 'Não carregamos as suas rotas.')} Os próximos dias precisam de internet.</p>
              <button type="button" onClick={() => void q.refetch()} className="h-12 w-full rounded-md border border-border font-bold">
                Tentar de novo
              </button>
            </section>
          ) : doDia.length === 0 ? (
            <p className="card-surface p-5 text-sm">Nenhuma rota neste dia. Quando a equipe publicar a sua rota, ela aparece aqui.</p>
          ) : (
            doDia.map((r) => <CartaoRota key={r.id} r={r} />)
          )}
          <button type="button" onClick={() => irPara({ v: 'hoje' })} className="h-12 w-full rounded-md border border-border text-sm font-bold">
            Ir para hoje
          </button>
        </>
      )}
    </main>
  );
}
