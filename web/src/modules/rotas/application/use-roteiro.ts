'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { todaySp } from '@/lib/dates';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { useOnline } from '@/modules/campo/application/use-online';
import type { Posicao } from '@/modules/campo/domain/campo.types';
import { campoRotaHoje } from '@/modules/campo/infrastructure/campo.api';
import { chaveDoRoteiro, guardarRoteiro, lerRoteiro } from '@/modules/campo/infrastructure/fila-idb';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { acoesDaFila, aplicarAcoesPendentes } from '../domain/rota-local';
import type { MotivoPulo, RouteView } from '../domain/rota.schema';

export interface RoteiroHoje {
  /** `false` quando a equipe não habilitou o roteiro: a Hoje fica como no bloco A. */
  habilitado: boolean;
  /** Sem roteiro hoje e a equipe liberou "Montar meu dia". */
  podeGerar: boolean;
  route: RouteView | null;
  carregando: boolean;
  /** O servidor não respondeu: o que está na tela é o último roteiro guardado no aparelho. */
  guardado: { hora: number } | null;
  erro: boolean;
  refazendoOffline: boolean;
  recarregar: () => void;
}

/**
 * Roteiro do dia: servidor → IndexedDB (sempre que chega) → o que está guardado quando não há
 * resposta; por cima, as ações do consultor ainda na fila (pular, adiar, desfazer, refazer).
 */
export function useRoteiro(): RoteiroHoje {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const itens = useFilaStore((s) => s.itens);
  const online = useOnline();
  const dia = todaySp();
  const chave = chaveDoRoteiro(consultantId, dia);
  const [guardado, setGuardado] = useState<{ route: RouteView; em: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    if (consultantId) {
      void lerRoteiro(chave)
        .then((g) => vivo && g && setGuardado({ route: g.route, em: g.guardado_em }))
        .catch(() => undefined);
    }
    return () => {
      vivo = false;
    };
  }, [chave, consultantId]);

  const q = useQuery({
    queryKey: ['campo', 'route'],
    enabled: !!consultantId,
    queryFn: async () => {
      const r = await campoRotaHoje();
      if (r.route) {
        const em = Date.now();
        setGuardado({ route: r.route, em });
        void guardarRoteiro({ chave, route: r.route, guardado_em: em }).catch(() => undefined);
      }
      return r;
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  const doServidor = q.data?.route ?? null;
  // Só vale o guardado DE HOJE e deste consultor (a chave já leva os dois).
  const base = doServidor ?? (q.isError || !online ? (guardado?.route ?? null) : null);
  const acoes = useMemo(() => acoesDaFila(itens), [itens]);
  const route = useMemo(() => (base ? aplicarAcoesPendentes(base, acoes) : null), [base, acoes]);

  return {
    habilitado: q.data ? q.data.enabled : true,
    podeGerar: q.data?.can_generate ?? false,
    route,
    carregando: q.isPending && !guardado,
    guardado: !doServidor && base && guardado ? { hora: guardado.em } : null,
    erro: q.isError && !base,
    refazendoOffline: acoes.some((a) => a.kind === 'route_reoptimize'),
    recarregar: () => void q.refetch(),
  };
}

const novoId = () => crypto.randomUUID();

/** Ações do consultor sobre uma parada: sempre pela fila offline, com `client_id` e a hora real. */
export function useAcoesRoteiro() {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');

  const pular = useCallback(
    async (stopId: string, reason: MotivoPulo): Promise<void> => {
      await enfileirar({ kind: 'stop_skip', stop_id: stopId, payload: { client_id: novoId(), reason, at: new Date().toISOString() } }, consultantId);
    },
    [consultantId],
  );
  const adiar = useCallback(
    async (stopId: string): Promise<void> => {
      await enfileirar({ kind: 'stop_defer', stop_id: stopId, payload: { client_id: novoId(), at: new Date().toISOString() } }, consultantId);
    },
    [consultantId],
  );
  const desfazer = useCallback(
    async (stopId: string): Promise<void> => {
      await enfileirar({ kind: 'stop_undo', stop_id: stopId, payload: { client_id: novoId(), at: new Date().toISOString() } }, consultantId);
    },
    [consultantId],
  );
  /**
   * Refazer rota: pega a posição e enfileira. Sem GPS, usa `ultimaConhecida` (a ordem local parte dali).
   * Devolve o motivo do GPS quando não houve posição nenhuma.
   */
  const refazer = useCallback(
    async (ultimaConhecida: { lat: number; lng: number }): Promise<{ semGps: boolean }> => {
      let pos: Posicao;
      let semGps = false;
      try {
        pos = await lerPosicao();
      } catch (e) {
        if (!(e instanceof ErroGps)) throw e;
        semGps = true;
        pos = { at: new Date().toISOString(), lat: ultimaConhecida.lat, lng: ultimaConhecida.lng, accuracy: 9999 };
      }
      await enfileirar({ kind: 'route_reoptimize', payload: { client_id: novoId(), ...pos } }, consultantId);
      return { semGps };
    },
    [consultantId],
  );
  return { pular, adiar, desfazer, refazer };
}
