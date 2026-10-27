'use client';

import { AvisoGps } from '@/components/campo/AvisoGps';
import { CardRotaHoje } from '@/components/campo/CardRotaHoje';
import { CabecalhoHoje } from '@/components/campo/CabecalhoHoje';
import { IntervaloFaixa } from '@/components/campo/IntervaloCampo';
import { MetaCard } from '@/components/campo/MetaCard';
import { PracaDoDia, PracaDoRoteiro } from '@/components/campo/PracaDoDia';
import { Button } from '@/components/ui/button';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { useIntervalo } from '@/modules/campo/application/use-intervalo';
import { useJornada } from '@/modules/campo/application/use-jornada';
import { irPara } from '@/modules/campo/application/use-tela';
import { duracaoMin, hora } from '@/modules/campo/domain/formatos';
import { nomeDaPracaAtiva } from '@/modules/campo/domain/praca-do-dia';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { proximaParada } from '@/modules/rotas/domain/rota-local';

/**
 * Visão `hoje` do fluxo COMPLETO (spec §8.1), no formato da Lovable (redesenho E5c, UX §4.12): saudação, o cartão da rota de hoje,
 * os quadros do dia e as visitas. Iniciar/encerrar a jornada e o QR seguem na barra fixa acima das abas (nossa, UX §2.5).
 */
export function HojeTela() {
  const { dia, carregando } = useDia();
  const me = useCampoMe();
  const intervalo = useIntervalo();
  const j = useJornada({ simples: false });
  const rot = useRoteiro();

  const aberta = dia.visitaAberta;
  const emIntervalo = intervalo.ligado ? dia.intervaloAberto : null;
  const proxima = rot.habilitado && rot.route ? proximaParada(rot.route.stops) : null;

  return (
    <main className="space-y-5 pb-32">
      <CabecalhoHoje praca={j.nomeDaPraca} />
      {j.gps && <AvisoGps motivo={j.gps} onFechar={j.fecharGps} />}

      {!carregando && !rot.carregando && !(rot.habilitado && rot.route) && <MetaCard />}
      {/* Ganhos, Pix, cadastros confirmados e o resultado do dia moram na aba Carteira; retornos e vouchers, em Clientes (E4). */}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !dia.jornada ? (
        <section className="card-surface space-y-2 p-5">
          <p className="text-base font-bold">Pronto para sair?</p>
          <p className="text-sm text-muted-foreground">
            A localização só é registrada com a jornada aberta: no início, a cada 5 minutos com esta tela
            aberta, em cada check-in e checkout e no fim. Antes de iniciar e depois de encerrar, nada é
            registrado.
          </p>
          {j.escolhePraca && me.data?.pracas ? (
            <PracaDoDia pracas={me.data.pracas} marcada={j.marcada} onEscolher={j.escolherPraca} />
          ) : me.data?.features?.multi_praca && (me.data.pracas?.length ?? 0) > 1 && rot.route ? (
            <PracaDoRoteiro nome={nomeDaPracaAtiva(me.data, rot.route.praca_id)} />
          ) : null}
        </section>
      ) : (
        <>
          {emIntervalo && <IntervaloFaixa aberto={emIntervalo} lembreteMin={intervalo.lembreteMin} />}
          <CardRotaHoje />

          {/* Os dois números do dia nos quadros da Lovable (`rounded-xl bg-muted p-3`). */}
          <section aria-label="Números de hoje" className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted p-3">
              <p className="text-3xl font-semibold">{dia.contadores.feitas}</p>
              <p className="text-xs text-muted-foreground">{dia.contadores.feitas === 1 ? 'visita hoje' : 'visitas hoje'}</p>
              {dia.contadores.fechadas > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  + {dia.contadores.fechadas} {dia.contadores.fechadas === 1 ? 'fechado' : 'fechados'} (fora da meta)
                </p>
              )}
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-3xl font-semibold">{dia.contadores.cadastrou_qr}</p>
              <p className="text-xs text-muted-foreground">cadastrou agora</p>
            </div>
          </section>

          {emIntervalo ? (
            <Button onClick={() => void intervalo.voltar(emIntervalo)} className="h-14 text-base">
              Encerrar intervalo
            </Button>
          ) : aberta ? (
            <button
              type="button"
              onClick={() => irPara({ v: 'visita', ref: aberta.ref })}
              className="flex h-14 items-center justify-center rounded-md bg-primary px-4 text-center text-base font-bold text-primary-foreground"
            >
              Continuar visita: {aberta.nome}
            </button>
          ) : proxima ? (
            <>
              <button
                type="button"
                onClick={() => irPara({ v: 'nova', parada: proxima.id })}
                className="flex h-14 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
              >
                Cheguei no cliente
              </button>
              <button
                type="button"
                onClick={() => irPara({ v: 'nova' })}
                className="flex h-12 items-center justify-center rounded-md border border-border text-sm font-bold"
              >
                Visita fora do roteiro
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => irPara({ v: 'nova' })}
              className="flex h-14 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
            >
              Nova visita
            </button>
          )}

          {!aberta && intervalo.ligado && !emIntervalo && (
            // Lote B §37 (UX §3.6): 1 toque para começar, com "Desfazer"; só sem visita aberta (Lovable).
            <Button variant="outline" onClick={() => void intervalo.iniciar()} className="h-12 text-sm">
              <span aria-hidden>☕ </span>Iniciar intervalo
            </Button>
          )}

          <section>
            <h2 className="tag text-muted-foreground">Visitas de hoje</h2>
            {dia.visitas.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma visita ainda.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {[...dia.visitas].reverse().map((v) => {
                  const min = duracaoMin(v.checkin_at, v.checkout_at);
                  return (
                    <li key={v.ref} className="flex items-center justify-between gap-3 card-surface p-3">
                      <div>
                        <p className="font-medium">{v.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {hora(v.checkin_at)}
                          {min !== null ? ` · ${min} min` : ''}
                          {v.cadastrou_qr ? ' · cadastrou agora' : ''}
                          {v.fechado ? ' · estabelecimento fechado' : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[11px]">
                        {v.auto_closed && <span className="rounded-sm bg-danger/15 px-1.5 py-0.5 text-danger">sem checkout</span>}
                        {!v.checkout_at && !v.auto_closed && (
                          <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-primary">aberta</span>
                        )}
                        {v.pendente && <span className="text-muted-foreground">aguardando envio</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Barra de ação (nossa, UX §2.5): fixa logo acima das 5 abas da casca. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3">
          <button type="button" onClick={() => irPara({ v: 'qr' })} className="flex h-14 w-28 items-center justify-center rounded-md border border-border text-sm font-bold">
            QR code
          </button>
          {!dia.jornada ? (
            <Button onClick={() => void j.iniciar()} disabled={j.ocupado || carregando} className="h-14 flex-1 text-base">
              {j.rotuloIniciar}
            </Button>
          ) : (
            <Button variant="outline" onClick={j.encerrar} disabled={j.ocupado || !!dia.visitaAberta} className="h-14 flex-1 text-base">
              {j.rotuloEncerrar}
            </Button>
          )}
        </div>
        {dia.jornada && dia.visitaAberta && (
          <p className="mx-auto mt-2 max-w-md text-center text-[11px] text-muted-foreground">
            Finalize a visita aberta para encerrar.
          </p>
        )}
      </div>
    </main>
  );
}
