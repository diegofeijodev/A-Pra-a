'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import type { ConfigModo } from '../domain/fluxo-config';
import type { ConfigRota } from '../domain/rota.schema';
import {
  buildRoute,
  getConfigModo,
  getRotaConfig,
  putConfigModo,
  listRouteCandidates,
  listRoutes,
  orderRoute,
  putRotaConfig,
  reoptimizeRoute,
  type BuildRouteInput,
} from '../infrastructure/rotas.api';

const chaveRotas = (day: string, pracaId?: string) => ['rotas', day, pracaId ?? ''] as const;

export function useRotasDoDia(day: string, pracaId?: string) {
  return useQuery({ queryKey: chaveRotas(day, pracaId), queryFn: () => listRoutes(day, pracaId), refetchInterval: 60_000 });
}

export function useCandidatosRoteiro(p: { pracaId?: string; day: string; areaId?: string }) {
  return useQuery({
    queryKey: ['rotas', 'candidatos', p.pracaId, p.day, p.areaId ?? ''],
    queryFn: () => listRouteCandidates({ pracaId: p.pracaId!, day: p.day, areaId: p.areaId }),
    enabled: !!p.pracaId,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['rotas'] });
}

export function useMontarRoteiro() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (input: BuildRouteInput) => buildRoute(input),
    onSuccess: () => {
      invalidar();
      toast.success('Roteiro publicado.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não conseguimos montar o roteiro. Seus ajustes continuam aqui.')),
  });
}

export function useOrdenarRoteiro() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (p: { id: string; version: number; stops: { id: string; fixa: boolean }[] }) => orderRoute(p.id, { version: p.version, stops: p.stops }),
    onSuccess: () => {
      invalidar();
      toast.success('Ordem salva.');
    },
    onError: (e) => {
      invalidar();
      toast.error(apiErrorMessage(e, 'Não foi possível salvar a ordem.'));
    },
  });
}

export function useRefazerRoteiro() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: string) => reoptimizeRoute(id),
    onSuccess: () => {
      invalidar();
      toast.success('Rota refeita.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível refazer a rota.')),
  });
}

export function useRotaConfig() {
  return useQuery({ queryKey: ['rotas', 'config'], queryFn: getRotaConfig });
}

export function useSalvarRotaConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ConfigRota>) => putRotaConfig(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rotas', 'config'] });
      toast.success('Configuração salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a configuração.')),
  });
}

export function useConfigModo() {
  return useQuery({ queryKey: ['rotas', 'config-modo'], queryFn: getConfigModo });
}

export function useSalvarConfigModo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConfigModo) => putConfigModo(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rotas', 'config-modo'] });
      void qc.invalidateQueries({ queryKey: ['rotas', 'config'] });
      toast.success('Modo da visita salvo.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar o modo da visita.')),
  });
}
