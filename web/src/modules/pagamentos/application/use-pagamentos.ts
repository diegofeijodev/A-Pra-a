'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  baixarComprovante,
  baixarCsv,
  campoPagamentos,
  gerarFila,
  getChavePix,
  getPagamentos,
  marcarPago,
  mudarPagamento,
  pagamentosDesligados,
} from '../infrastructure/pagamentos.api';

const CHAVE = ['pagamentos'] as const;

/** Fila da semana. `desligada` = flag fechada no servidor (404): a tela inteira some. */
export function usePagamentos(week?: string) {
  const q = useQuery({
    queryKey: [...CHAVE, 'lista', week ?? 'padrao'],
    queryFn: () => getPagamentos({ week }),
    retry: (n, e) => !pagamentosDesligados(e) && n < 1,
  });
  return { ...q, desligada: q.isError && pagamentosDesligados(q.error) };
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CHAVE });
    void qc.invalidateQueries({ queryKey: ['consultores', 'atencao'] });
    void qc.invalidateQueries({ queryKey: ['remuneracao'] });
  };
}

export function useGerarFila() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: gerarFila,
    onSuccess: (r) => {
      invalidar();
      const partes = [`${r.created} novo(s)`, r.blocked ? `${r.blocked} bloqueado(s) por falta de chave Pix` : null, r.existing ? `${r.existing} já existiam` : null].filter(Boolean);
      toast.success(`Fila da semana atualizada: ${partes.join(', ')}.`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível gerar a fila.')),
  });
}

export function useMarcarPago() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, ...v }: { id: string; paid_cents?: number; reason?: string; note?: string; proof?: File | null }) => marcarPago(id, v),
    onSuccess: (r) => {
      invalidar();
      toast.success(r.already_paid ? 'Este pagamento já estava marcado como pago.' : 'Pagamento registrado.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível registrar o pagamento.')),
  });
}

export function useMudarPagamento() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, acao, reason }: { id: string; acao: 'fail' | 'retry' | 'cancel' | 'reverse'; reason?: string }) => mudarPagamento(id, acao, reason),
    onSuccess: () => invalidar(),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível concluir a ação.')),
  });
}

export const useChavePix = () => useMutation({ mutationFn: getChavePix, onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível ler a chave Pix.')) });

/** Baixa pelo cliente autenticado (o link direto não levaria o token) e entrega o arquivo ao navegador. */
export function entregarArquivo(blob: Blob, nome: string | null, abrir: boolean) {
  const url = URL.createObjectURL(blob);
  // Sem `noopener`: o blob é do mesmo domínio e é o arquivo da própria pessoa; com `noopener` o retorno é sempre nulo
  // e o Safari (iPhone) bloqueia o popup em silêncio. Bloqueado → baixa pelo link.
  if (abrir && window.open(url, '_blank')) {
    // aberto em outra aba
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = nome ?? 'arquivo';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const useBaixarCsv = () =>
  useMutation({
    mutationFn: baixarCsv,
    onSuccess: ({ blob, nome }, v) => entregarArquivo(blob, nome ?? `pagamentos-pix-${v.week}.csv`, false),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível baixar o CSV.')),
  });

export const useAbrirComprovante = () =>
  useMutation({
    mutationFn: baixarComprovante,
    onSuccess: ({ blob }) => entregarArquivo(blob, null, true),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível abrir o comprovante.')),
  });

/** Pix do consultor — só busca se o servidor disse que os pagamentos estão ligados (`features.payouts`). */
export function usePagamentosCampo() {
  const me = useCampoMe();
  const ligado = me.data?.features?.payouts === true;
  const q = useQuery({ queryKey: ['campo', 'payouts'], queryFn: campoPagamentos, enabled: ligado, refetchInterval: 5 * 60_000, retry: 1 });
  return { ...q, ligado };
}
