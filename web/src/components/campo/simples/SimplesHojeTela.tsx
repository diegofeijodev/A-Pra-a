'use client';

import { AvisoGps } from '@/components/campo/AvisoGps';
import { CabecalhoHoje } from '@/components/campo/CabecalhoHoje';
import { CardRotaHoje } from '@/components/campo/CardRotaHoje';
import { IntervaloFaixa } from '@/components/campo/IntervaloCampo';
import { MetaCard } from '@/components/campo/MetaCard';
import { ChegueiBotao } from '@/components/campo/simples/ChegueiBotao';
import { PracaDoDia, PracaDoRoteiro } from '@/components/campo/PracaDoDia';
import { Button } from '@/components/ui/button';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { useFluxo } from '@/modules/campo/application/use-fluxo';
import { useIntervalo } from '@/modules/campo/application/use-intervalo';
import { useJornada } from '@/modules/campo/application/use-jornada';
import { irPara } from '@/modules/campo/application/use-tela';
import { plural } from '@/modules/campo/domain/formatos';
import { nomeDaPracaAtiva } from '@/modules/campo/domain/praca-do-dia';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { proximaParada } from '@/modules/rotas/domain/rota-local';

/**
 * Visão `hoje` do fluxo SIMPLES (contrato §31, UX §2.2 S1), no formato da Lovable (redesenho E5c, UX §4.12): saudação, o cartão da
 * rota de hoje (ou a meta) e as ações do dia; "Cheguei" fixo logo acima das abas, sempre à vista, abrindo a câmera direto. O Sol
 * mora na faixa do topo; ganhos e Pix na Carteira; retornos e vouchers em Clientes (casca do representante — nada é apagado).
 */
export function SimplesHojeTela() {
  const { config } = useFluxo();
  const { dia, carregando } = useDia(config.fechado_conta_na_meta);
  const rot = useRoteiro();
  const me = useCampoMe();
  const intervalo = useIntervalo();
  const j = useJornada({ simples: true, fechadoContaNaMeta: config.fechado_conta_na_meta });

  const aberta = dia.visitaAberta;
  const emIntervalo = intervalo.ligado ? dia.intervaloAberto : null;
  const proxima = rot.habilitado && rot.route ? proximaParada(rot.route.stops) : null;

  return (
    <main className="space-y-4 pb-32">
      <CabecalhoHoje praca={j.nomeDaPraca} />
      {j.gps && <AvisoGps motivo={j.gps} onFechar={j.fecharGps} />}

      {carregando ? (
        <div aria-busy="true" className="space-y-3">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : !dia.jornada ? (
        <section className="card-surface space-y-2 p-5">
          <p className="text-base font-bold">Pronto para sair?</p>
          <p className="text-sm text-muted-foreground">
            A localização só é registrada com o dia aberto: no início, a cada 5 minutos com esta tela aberta, em cada chegada e conclusão e no
            fim. Antes de iniciar e depois de encerrar, nada é registrado.
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
          {!rot.carregando && !(rot.habilitado && rot.route) && <MetaCard fechadoContaNaMeta={config.fechado_conta_na_meta} />}
          <CardRotaHoje fechadoContaNaMeta={config.fechado_conta_na_meta} />
          <p className="text-sm text-muted-foreground">
            {dia.contadores.cadastrou_agora > 0
              ? `${plural(dia.contadores.cadastrou_agora, 'cadastro declarado', 'cadastros declarados')} hoje. `
              : ''}
            {dia.contadores.fechadas > 0 && !config.fechado_conta_na_meta
              ? `${plural(dia.contadores.fechadas, 'estabelecimento fechado', 'estabelecimentos fechados')} (fora da meta).`
              : ''}
          </p>
          {!aberta && intervalo.ligado && !emIntervalo && (
            // Lote B §37 (UX §3.6): 1 toque para começar, com "Desfazer"; só sem visita aberta (Lovable).
            <Button variant="outline" onClick={() => void intervalo.iniciar()} className="h-12 w-full text-sm">
              <span aria-hidden>☕ </span>Iniciar intervalo
            </Button>
          )}
          {!aberta && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => irPara({ v: 'nova' })}
                className="flex h-12 flex-1 items-center justify-center rounded-md border border-border text-sm font-bold"
              >
                Visita fora do roteiro
              </button>
              <Button variant="outline" onClick={j.encerrar} disabled={j.ocupado} className="h-12 flex-1 text-sm">
                {j.rotuloEncerrar}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Barra de ação (nossa, UX §2.5): fixa logo acima das 5 abas da casca. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-card/95 py-3 backdrop-blur">
        <div className="mx-auto max-w-md px-4">
          <div className="flex gap-3">
            <button type="button" onClick={() => irPara({ v: 'qr' })} className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md border border-border text-sm font-bold">
              QR code
            </button>
            {carregando ? null : !dia.jornada ? (
              <Button onClick={() => void j.iniciar()} disabled={j.ocupado} className="h-14 flex-1 text-base">
                {j.rotuloIniciar}
              </Button>
            ) : emIntervalo ? (
              <Button onClick={() => void intervalo.voltar(emIntervalo)} className="h-14 flex-1 text-base">
                Encerrar intervalo
              </Button>
            ) : aberta ? (
              <button
                type="button"
                onClick={() => irPara({ v: 'visita', ref: aberta.ref })}
                className="flex h-14 flex-1 items-center justify-center rounded-md bg-primary px-3 text-center text-base font-bold text-primary-foreground"
              >
                Continuar visita: {aberta.nome}
              </button>
            ) : proxima ? (
              <ChegueiBotao alvo={{ nome: proxima.name, lead_id: proxima.lead_id }} className="flex-1">
                Cheguei: tirar a foto
              </ChegueiBotao>
            ) : (
              <button
                type="button"
                onClick={() => irPara({ v: 'nova' })}
                className="flex h-14 flex-1 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
              >
                Visita no caminho
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
