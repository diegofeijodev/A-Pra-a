'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { todaySp } from '@/lib/dates';
import type { CampoMeResponse, PainelCampo, RouteView, TodayView } from '../domain/campo.types';
import { montarDia, type DiaLocal } from '../domain/dia-local';
import { campoHoje, campoMe, campoPainel, campoRotaHoje, campoRotaSemana } from '../infrastructure/campo.api';
import { getSnapshot, setSnapshot } from '../infrastructure/campo-session.storage';
import { useCampoSession } from './campo-session.store';
import { useFilaStore } from './use-fila';
import { useOnline } from './use-online';

/**
 * `/me` com retrato local: o QR code precisa abrir mesmo sem sinal. O que volta
 * do servidor é escrito na sessão (inclusive `must_change_password`).
 */
export function useCampoMe() {
  const setConsultant = useCampoSession((s) => s.setConsultant);
  const query = useQuery({
    queryKey: ['campo', 'me'],
    queryFn: async () => {
      const r = await campoMe();
      setSnapshot('me', r);
      return r;
    },
    initialData: () => getSnapshot<CampoMeResponse>('me') ?? undefined,
    initialDataUpdatedAt: 0,
  });
  useEffect(() => {
    if (query.data) setConsultant(query.data.consultant);
  }, [query.data, setConsultant]);
  return query;
}

/** `/today` com retrato local — só vale o retrato de HOJE (Brasília). */
export function useHojeServidor() {
  return useQuery({
    queryKey: ['campo', 'today'],
    queryFn: async () => {
      const r = await campoHoje();
      setSnapshot('today', r);
      return r;
    },
    initialData: () => {
      const r = getSnapshot<TodayView>('today');
      return r && r.day === todaySp() ? r : undefined;
    },
    initialDataUpdatedAt: 0,
    refetchInterval: 60_000,
  });
}

/** Rota do dia com retrato local (só o de HOJE): a lista de paradas abre sem sinal. */
export function useRotaHoje() {
  return useQuery({
    queryKey: ['campo', 'rota'],
    queryFn: async () => {
      const r = await campoRotaHoje();
      setSnapshot('rota', { day: todaySp(), rota: r });
      return r;
    },
    initialData: () => {
      const s = getSnapshot<{ day: string; rota: RouteView | null }>('rota');
      return s && s.day === todaySp() ? s.rota : undefined;
    },
    initialDataUpdatedAt: 0,
    refetchInterval: 120_000,
  });
}

export function usePainelCampo(periodo: PainelCampo['periodo']) {
  return useQuery({ queryKey: ['campo', 'painel', periodo], queryFn: () => campoPainel(periodo) });
}

export function useRotaSemana() {
  return useQuery({ queryKey: ['campo', 'rota', 'semana'], queryFn: campoRotaSemana });
}

/**
 * O dia na tela: servidor + fila por cima. Sem sinal e sem retrato de hoje, não
 * fica "Carregando…" para sempre: a tela anda só com a fila.
 */
export function useDia(): { dia: DiaLocal; carregando: boolean; hoje: TodayView | undefined } {
  const hoje = useHojeServidor();
  const itens = useFilaStore((s) => s.itens);
  const online = useOnline();
  const dia = useMemo(() => montarDia(hoje.data ?? null, itens), [hoje.data, itens]);
  return { dia, carregando: online && hoje.isPending && !hoje.data, hoje: hoje.data };
}
