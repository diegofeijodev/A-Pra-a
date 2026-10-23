'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import { SEM_FEATURES_C, type ConfigCupom, type FeaturesLoteC } from '../domain/cupons';
import {
  aprovarCupom,
  campoMeusCupons,
  candidatosCupom,
  desativarCupom,
  detalheCupom,
  getConfigCupom,
  getFeaturesLoteC,
  listarCupons,
  putConfigCupom,
  reprovarCupom,
  tentarCupomDeNovo,
  vincularCupom,
} from '../infrastructure/cupons.api';

/** Flags do lote C (equipe), pela leitura da configuração: nunca sonda rota desligada (404 derruba o browser-check). */
export function useFeaturesLoteC(): FeaturesLoteC & { carregando: boolean } {
  const { data, isPending } = useQuery({ queryKey: ['lovable', 'features-c'], queryFn: getFeaturesLoteC, staleTime: 5 * 60_000 });
  return { ...(data ?? SEM_FEATURES_C), carregando: isPending };
}

export function useCuponsEquipe(q: { situacao?: string; praca_id?: string; q?: string }, ligado: boolean) {
  return useQuery({ queryKey: ['cupons', 'equipe', q.situacao ?? '', q.praca_id ?? '', q.q ?? ''], queryFn: () => listarCupons(q), enabled: ligado, refetchInterval: 60_000 });
}

export function useDetalheCupom(id: string | null) {
  return useQuery({ queryKey: ['cupons', 'detalhe', id], queryFn: () => detalheCupom(id!), enabled: !!id });
}

export function useCandidatos(id: string | null, q: string, ligado: boolean) {
  return useQuery({ queryKey: ['cupons', 'candidatos', id, q], queryFn: () => candidatosCupom(id!, q || undefined), enabled: ligado && !!id, retry: false });
}

export function useConfigCupom(ligado: boolean) {
  return useQuery({ queryKey: ['cupons', 'config'], queryFn: getConfigCupom, enabled: ligado });
}

/** Escritas da equipe: cada uma com `client_id` (reenvio = o mesmo estado). Erro lido com `apiErrorMessage`. */
export function useAcoesCupom() {
  const qc = useQueryClient();
  const depois = () => void qc.invalidateQueries({ queryKey: ['cupons'] });
  const erro = (fallback: string) => (e: unknown) => toast.error(apiErrorMessage(e, fallback));
  return {
    aprovar: useMutation({
      mutationFn: (v: { id: string; contractor_user_id?: string | null; contractor_name?: string | null }) =>
        aprovarCupom(v.id, { client_id: crypto.randomUUID(), contractor_user_id: v.contractor_user_id ?? null, contractor_name: v.contractor_name ?? null }),
      onSuccess: (c) => {
        depois();
        toast.success(c.situacao === 'criado' ? `Cupom criado: ${c.coupon_code}.` : 'Pedido aprovado.');
      },
      onError: erro('Não foi possível aprovar agora.'),
    }),
    reprovar: useMutation({
      mutationFn: (v: { id: string; reason: string | null }) => reprovarCupom(v.id, { client_id: crypto.randomUUID(), reason: v.reason }),
      onSuccess: () => {
        depois();
        toast.success('Pedido reprovado. O consultor vê o motivo.');
      },
      onError: erro('Não foi possível reprovar agora.'),
    }),
    vincular: useMutation({
      mutationFn: (v: { id: string; contractor_user_id: string; contractor_name: string | null }) =>
        vincularCupom(v.id, { client_id: crypto.randomUUID(), contractor_user_id: v.contractor_user_id, contractor_name: v.contractor_name }),
      onSuccess: () => {
        depois();
        toast.success('Conta do Freela vinculada.');
      },
      onError: erro('Não foi possível vincular agora.'),
    }),
    tentar: useMutation({
      mutationFn: (id: string) => tentarCupomDeNovo(id),
      onSuccess: (c) => {
        depois();
        toast(c.situacao === 'criado' ? `Cupom criado: ${c.coupon_code}.` : 'Ainda não deu. Tentamos de novo sozinhos.');
      },
      onError: erro('Não foi possível tentar agora.'),
    }),
    desativar: useMutation({
      mutationFn: (v: { id: string; reason: string }) => desativarCupom(v.id, { client_id: crypto.randomUUID(), reason: v.reason }),
      onSuccess: () => {
        depois();
        toast.success('Cupom desativado no Freela.');
      },
      onError: erro('Não foi possível desativar agora.'),
    }),
    salvarConfig: useMutation({
      mutationFn: (body: Partial<Omit<ConfigCupom, 'coupons_enabled'>>) => putConfigCupom(body),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['cupons', 'config'] });
        toast.success('Regras do cupom salvas.');
      },
      onError: erro('Não foi possível salvar as regras.'),
    }),
  };
}

// ── consultor ──

/** O consultor só busca os cupons com a flag ligada (`features` do `/me`, guardado no aparelho). */
export function useMeusCupons() {
  const me = useCampoMe();
  const ligado = me.data?.features?.vouchers === true;
  const q = useQuery({ queryKey: ['campo', 'cupons'], queryFn: campoMeusCupons, enabled: ligado, refetchInterval: 60_000 });
  return { ...q, ligado, config: me.data?.voucher_config ?? null };
}
