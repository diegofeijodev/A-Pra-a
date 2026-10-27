'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useCampoSession } from './campo-session.store';
import { useCampoMe, useDia } from './use-campo';
import { enfileirar, useFilaStore } from './use-fila';
import { irPara } from './use-tela';
import type { Posicao } from '../domain/campo.types';
import { AVISO_ENVIOS_GUARDADOS } from '../domain/fila-politica';
import { plural } from '../domain/formatos';
import type { MotivoGps } from '../domain/gps-mensagens';
import { mostraEscolhaDePraca, nomeDaPracaAtiva, pracaDoCorpo, pracaMarcada } from '../domain/praca-do-dia';
import { ErroGps, lerPosicao } from '../infrastructure/gps';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';

/**
 * Iniciar e encerrar o dia (a jornada), o mesmo nas visões Hoje e Roteiro (redesenho E5c, UX §4.12–§4.13): os mesmos corpos de
 * `start`/`end` na fila de sempre, a escolha da praça (lote F2) e o diálogo com a conta. Ao encerrar com o resultado do dia
 * ligado, abre o "Resultado do seu dia".
 */
export function useJornada({ simples, fechadoContaNaMeta = false }: { simples: boolean; fechadoContaNaMeta?: boolean }) {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const pracaDaSessao = useCampoSession((s) => s.session?.consultant.praca_name ?? '');
  const { dia } = useDia(fechadoContaNaMeta);
  const temFila = useFilaStore((s) => s.itens.length > 0);
  const me = useCampoMe();
  const rot = useRoteiro();
  const resumoLigado = me.data?.features?.day_summary === true;
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Lote F2 (§44.5, UX §3.8): a praça do dia — escolha só com a flag, 2+ praças e sem roteiro hoje.
  const [pracaEscolhida, setPracaEscolhida] = useState<string | null>(null);
  const temRoteiroHoje = rot.habilitado && !!rot.route;
  const escolhePraca = mostraEscolhaDePraca(me.data, temRoteiroHoje);
  const marcada = pracaMarcada(me.data, pracaEscolhida);
  const nomeMarcada = me.data?.pracas?.find((x) => x.id === marcada)?.name ?? null;
  // Lote F2 (§44.6): com a flag, a praça ATIVA (a da jornada aberta, do servidor ou da fila); desligada, a principal de sempre.
  const nomeDaPraca = me.data?.features?.multi_praca ? nomeDaPracaAtiva(me.data, dia.jornada?.praca_id) : pracaDaSessao;

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

  function encerrar() {
    let texto: string;
    if (simples) {
      const feitas = dia.contadores.feitas;
      const meta = rot.route?.params.meta_diaria;
      texto = `Encerrar o dia?\n\nVocê fez ${meta ? `${feitas} de ${meta}` : feitas} ${meta ? 'visitas' : plural(feitas, 'visita', 'visitas')}. A localização para de ser registrada.`;
    } else {
      texto = 'Encerrar a jornada de hoje? A localização para de ser registrada.';
    }
    if (!window.confirm(temFila ? `${texto}\n\n${AVISO_ENVIOS_GUARDADOS}` : texto)) return;
    void comPosicao(async (p) => {
      await enfileirar({ kind: 'end', payload: p }, consultantId);
      // Resultado do dia (contrato §33.5): só com o módulo ligado; a conta é "até agora" se o encerrar ainda estiver na fila.
      if (resumoLigado) irPara({ v: 'resumo' });
    });
  }

  const rotuloIniciar = ocupado
    ? 'Pegando a localização…'
    : simples
      ? escolhePraca && nomeMarcada
        ? `Iniciar o dia em ${nomeMarcada}`
        : 'Iniciar o dia'
      : escolhePraca && nomeMarcada
        ? `Iniciar jornada em ${nomeMarcada}`
        : 'Iniciar jornada';

  return {
    gps,
    fecharGps: () => setGps(null),
    ocupado,
    iniciar,
    encerrar,
    rotuloIniciar,
    rotuloEncerrar: simples ? 'Encerrar o dia' : 'Encerrar jornada',
    escolhePraca,
    marcada,
    escolherPraca: setPracaEscolhida,
    nomeDaPraca,
  };
}
