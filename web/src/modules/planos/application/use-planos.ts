'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { chavePrevia, type ConfigDivisao, type ConfigShopping } from '../domain/planos';
import {
  arquivarPlano,
  atribuirItem,
  campoMinhasRotas,
  criarPlano,
  getConfigDivisao,
  getConfigShopping,
  getFeaturesLoteD,
  getPlano,
  getPrevia,
  listarPlanos,
  listarShoppings,
  marcarShopping,
  putConfigDivisao,
  putConfigShopping,
  type CriarPlanoInput,
} from '../infrastructure/planos.api';

/** Flags do lote D pela leitura da configuração (200 sempre). */
export function useFeaturesLoteD() {
  const { data, isPending } = useQuery({ queryKey: ['lovable', 'features-d'], queryFn: getFeaturesLoteD, staleTime: 5 * 60_000 });
  return { features: data ?? { route_plans: false, malls: false }, carregando: isPending };
}

export function useConfigDivisao(ligado: boolean) {
  return useQuery({ queryKey: ['planos', 'config'], queryFn: getConfigDivisao, enabled: ligado, staleTime: 5 * 60_000 });
}

export function useSalvarConfigDivisao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Partial<ConfigDivisao>) => putConfigDivisao(b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planos'] });
      toast.success('Configuração salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a configuração.')),
  });
}

/** `types` já canônicos (`tiposParaEnviar`): entram na chave e na query (E6). */
export function usePrevia(p: { praca_id?: string; area_id?: string; por_rota?: number; types?: string[]; ligado: boolean }) {
  return useQuery({
    queryKey: chavePrevia(p),
    queryFn: () => getPrevia({ praca_id: p.praca_id!, area_id: p.area_id, por_rota: p.por_rota, types: (p.types ?? []).join(',') }),
    enabled: p.ligado && !!p.praca_id && (p.por_rota ?? 1) >= 1,
  });
}

export function usePlanos(pracaId: string | undefined, kind: 'geral' | 'shoppings' | 'shopping_interno', ligado: boolean) {
  return useQuery({ queryKey: ['planos', 'lista', pracaId, kind], queryFn: () => listarPlanos(pracaId!, kind), enabled: ligado && !!pracaId });
}

export function usePlano(id: string | null) {
  return useQuery({ queryKey: ['planos', 'um', id], queryFn: () => getPlano(id!), enabled: !!id });
}

export function useCriarPlano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CriarPlanoInput) => criarPlano(b),
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: ['planos'] });
      toast.success(`${v.item_count} ${v.item_count === 1 ? 'rota gerada e salva' : 'rotas geradas e salvas'}.`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não conseguimos gerar as rotas agora.')),
  });
}

export function useAtribuirItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { planId: string; itemId: string; consultant_id: string; day: string; confirm_replace?: boolean }) =>
      atribuirItem(p.planId, p.itemId, { consultant_id: p.consultant_id, day: p.day, ...(p.confirm_replace ? { confirm_replace: true } : {}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planos'] });
      void qc.invalidateQueries({ queryKey: ['rotas'] });
    },
  });
}

export function useArquivarPlano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => arquivarPlano(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planos'] });
      toast.success('Geração arquivada. As rotas publicadas continuam com os representantes.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível arquivar.')),
  });
}

// ── shoppings ──

export function useShoppings(pracaId: string | undefined, ligado: boolean) {
  return useQuery({ queryKey: ['shoppings', pracaId], queryFn: () => listarShoppings(pracaId!), enabled: ligado && !!pracaId });
}

export function useMarcarShopping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { leadId: string; large_override: boolean | null }) => marcarShopping(p.leadId, p.large_override),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shoppings'] }),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível marcar o shopping.')),
  });
}

export function useConfigShopping(ligado: boolean) {
  return useQuery({ queryKey: ['shoppings', 'config'], queryFn: getConfigShopping, enabled: ligado, staleTime: 5 * 60_000 });
}

export function useSalvarConfigShopping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Partial<ConfigShopping>) => putConfigShopping(b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shoppings'] });
      toast.success('Critério salvo.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar o critério.')),
  });
}

// ── consultor ──

/** "Próximos dias" (§39.7): só com a flag (`features` do `/me`); precisa de sinal (não fica no aparelho). */
export function useMinhasRotas(from: string, to: string) {
  const me = useCampoMe();
  const ligado = me.data?.features?.route_plans === true;
  const q = useQuery({ queryKey: ['campo', 'minhas-rotas', from, to], queryFn: () => campoMinhasRotas(from, to), enabled: ligado });
  return { ...q, ligado };
}
