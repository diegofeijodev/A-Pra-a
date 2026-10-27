'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { IntervaloFaixa } from '@/components/campo/IntervaloCampo';
import { MetaCard } from '@/components/campo/MetaCard';
import { RoteiroCard } from '@/components/campo/RoteiroCard';
import { ChegueiBotao } from '@/components/campo/simples/ChegueiBotao';
import { PracaDoDia, PracaDoRoteiro } from '@/components/campo/PracaDoDia';
import { mostraEscolhaDePraca, nomeDaPracaAtiva, pracaDoCorpo, pracaMarcada } from '@/modules/campo/domain/praca-do-dia';
import { Button } from '@/components/ui/button';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { useFluxo } from '@/modules/campo/application/use-fluxo';
import { useIntervalo } from '@/modules/campo/application/use-intervalo';
import { enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { useSol } from '@/modules/campo/application/use-sol';
import { irPara } from '@/modules/campo/application/use-tela';
import type { Posicao } from '@/modules/campo/domain/campo.types';
import { AVISO_ENVIOS_GUARDADOS } from '@/modules/campo/domain/fila-politica';
import { plural } from '@/modules/campo/domain/formatos';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { proximaParada } from '@/modules/rotas/domain/rota-local';

/**
 * Visão `hoje` do fluxo SIMPLES (contrato §31, UX §2.2 S1). Roteiro + meta no alto; "Cheguei" fixo logo acima das abas, sempre
 * à vista, abrindo a câmera direto. Ganhos, Pix e cadastros confirmados moram na aba Carteira; retornos e vouchers, em Clientes
 * (casca do representante, redesenho E4 — nada é apagado).
 */
export function SimplesHojeTela() {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { config } = useFluxo();
  const { dia, carregando } = useDia(config.fechado_conta_na_meta);
  const temFila = useFilaStore((s) => s.itens.length > 0);
  const { sol, alternar } = useSol();
  const rot = useRoteiro();
  const me = useCampoMe();
  const resumoLigado = me.data?.features?.day_summary === true;
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const intervalo = useIntervalo();
  // Lote F2 (§44.5, UX §3.8): a praça do dia — escolha só com a flag, 2+ praças e sem roteiro hoje.
  const [pracaEscolhida, setPracaEscolhida] = useState<string | null>(null);
  const temRoteiroHoje = rot.habilitado && !!rot.route;
  const escolhePraca = mostraEscolhaDePraca(me.data, temRoteiroHoje);
  const marcada = pracaMarcada(me.data, pracaEscolhida);
  const nomeMarcada = me.data?.pracas?.find((x) => x.id === marcada)?.name ?? null;

  async function comPosicao(acao: (p: Posicao) => Promise<void>) {
    setGps(null);
    setOcupado(true);
    try {
      await acao(await lerPosicao());
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível guardar a ação neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }
  const iniciar = () =>
    comPosicao((p) =>
      enfileirar({ kind: 'start', payload: { client_id: crypto.randomUUID(), ...p, ...pracaDoCorpo(me.data, temRoteiroHoje, pracaEscolhida) } }, consultantId),
    );
  const encerrar = () => {
    const feitas = dia.contadores.feitas;
    const meta = rot.route?.params.meta_diaria;
    const texto = `Encerrar o dia?\n\nVocê fez ${meta ? `${feitas} de ${meta}` : feitas} ${meta ? 'visitas' : plural(feitas, 'visita', 'visitas')}. A localização para de ser registrada.`;
    if (!window.confirm(temFila ? `${texto}\n\n${AVISO_ENVIOS_GUARDADOS}` : texto)) return;
    void comPosicao(async (p) => {
      await enfileirar({ kind: 'end', payload: p }, consultantId);
      // Resultado do dia (contrato §33.5): só com o módulo ligado; a conta é "até agora" se o encerrar ainda estiver na fila.
      if (resumoLigado) irPara({ v: 'resumo' });
    });
  };

  const aberta = dia.visitaAberta;
  const emIntervalo = intervalo.ligado ? dia.intervaloAberto : null;
  const proxima = rot.habilitado && rot.route ? proximaParada(rot.route.stops) : null;
  const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

  return (
    <main data-sol={sol} className="space-y-4 pb-32">
      <CampoTopo titulo={`Hoje · ${dataHoje}`} />
      <div className="flex justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={sol}
          onClick={alternar}
          className="simples-chip flex h-12 min-h-12 items-center gap-2 px-3 text-sm"
        >
          <span aria-hidden>☀</span> Sol
        </button>
      </div>
      <FaixaFila />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}

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
          {escolhePraca && me.data?.pracas ? (
            <PracaDoDia pracas={me.data.pracas} marcada={marcada} onEscolher={setPracaEscolhida} />
          ) : me.data?.features?.multi_praca && (me.data.pracas?.length ?? 0) > 1 && rot.route ? (
            <PracaDoRoteiro nome={nomeDaPracaAtiva(me.data, rot.route.praca_id)} />
          ) : null}
        </section>
      ) : (
        <>
          {emIntervalo && <IntervaloFaixa aberto={emIntervalo} lembreteMin={intervalo.lembreteMin} />}
          {!rot.carregando && !(rot.habilitado && rot.route) && <MetaCard fechadoContaNaMeta={config.fechado_conta_na_meta} />}
          {rot.habilitado && <RoteiroCard fechadoContaNaMeta={config.fechado_conta_na_meta} />}
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
              <span aria-hidden>☕ </span>Intervalo
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
              <Button variant="outline" onClick={encerrar} disabled={ocupado} className="h-12 flex-1 text-sm">
                Encerrar o dia
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
              <Button onClick={() => void iniciar()} disabled={ocupado} className="h-14 flex-1 text-base">
                {ocupado ? 'Pegando a localização…' : escolhePraca && nomeMarcada ? `Iniciar o dia em ${nomeMarcada}` : 'Iniciar o dia'}
              </Button>
            ) : emIntervalo ? (
              <Button onClick={() => void intervalo.voltar(emIntervalo)} className="h-14 flex-1 text-base">
                Voltar do intervalo
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
