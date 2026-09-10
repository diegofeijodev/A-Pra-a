'use client';

import { useEffect, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  createDisparo,
  getDisparo,
  listDisparos,
  markSend,
  previewDisparo,
  replySend,
  EMPTY_FILTERS,
  type CreateDisparoResult,
  type DisparoDetailView,
  type DisparoFilters,
  type DisparoInput,
  type DisparoPreviewView,
  type DisparoStatsView,
  type DisparoView,
  type FreelaTemplateView,
  type PreviewItemView,
  type SendView,
} from '../infrastructure/disparos.api';

export { EMPTY_FILTERS };
export type {
  CreateDisparoResult,
  DisparoDetailView,
  DisparoFilters,
  DisparoInput,
  DisparoPreviewView,
  DisparoStatsView,
  DisparoView,
  FreelaTemplateView,
  PreviewItemView,
  SendView,
};

/** Espera o valor parar de mudar por `ms` antes de deixá-lo virar chave de query. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
    // `key` é a forma serializada do valor: o objeto é remontado a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return debounced;
}

/**
 * Prévia do disparo. Cada tecla no filtro mudaria a chave da query, então o
 * pedido só sai 300 ms depois de a tela parar de mexer; `keepPreviousData`
 * segura o retrato anterior no lugar enquanto o novo não chega (sem isso a
 * contagem some e volta a cada clique).
 *
 * `enabled` só com modelo e modo escolhidos: sem eles o servidor responde 400.
 */
export function useDisparoPreview(input: DisparoInput) {
  const debounced = useDebounced(input, 300);
  return useQuery({
    queryKey: ['disparo-preview', debounced],
    queryFn: () => previewDisparo(debounced),
    // Modelo E modo: os dois chegam de pedidos diferentes (`GET
    // /v1/msg-templates` e `GET /v1/settings`), e disparar a prévia com o modo
    // ainda vazio seria um 400 garantido.
    enabled: !!debounced.template_id && !!debounced.mode,
    placeholderData: keepPreviousData,
  });
}

/**
 * Criar o lote muda a lista de disparos e, no modo `fila`, a fila do próprio
 * lote. Invalidação por PREFIXO (a prévia também: a trava de 30 dias acabou de
 * pegar os leads que entraram na fila).
 */
function invalidateDisparo(queryClient: QueryClient) {
  for (const key of [['disparos'], ['disparo'], ['disparo-preview'], ['templates']]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useCreateDisparo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DisparoInput) => createDisparo(input),
    onSuccess: () => invalidateDisparo(queryClient),
    // Modo `freela` sem a conexão configurada responde 503 FREELA_NOT_CONFIGURED
    // — a mensagem da API é o que a tela mostra.
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar o disparo.')),
  });
}

export function useDisparos() {
  return useQuery({ queryKey: ['disparos'], queryFn: listDisparos });
}

/**
 * O painel de um lote. No modo `freela` quem entrega é o outbox do servidor
 * (§18.5), a cada 2 min: enquanto o lote não fechou, a tela repergunta a cada
 * 30 s para ver `enviada`/`falhou` chegarem sozinhos. No modo `fila` quem move
 * a fila é o próprio operador — repolling ali seria pedido à toa.
 */
export function useDisparo(id: string | null | undefined) {
  return useQuery({
    queryKey: ['disparo', id],
    queryFn: () => getDisparo(id as string),
    enabled: !!id,
    refetchInterval: (query) => {
      const detail = query.state.data as DisparoDetailView | undefined;
      if (!detail) return false;
      const { mode, status } = detail.disparo;
      return mode === 'freela' && status !== 'concluido' ? 30_000 : false;
    },
  });
}

/**
 * Marcar e responder mexem no envio, no lote (que fecha em `concluido` quando a
 * fila zera), nas métricas do modelo e — no caso de "pare" — na lista de
 * bloqueio e na ficha do lead.
 */
function invalidateSend(queryClient: QueryClient) {
  for (const key of [
    ['disparo'],
    ['disparos'],
    ['templates'],
    ['blocklist'],
    ['leads'],
    ['lead'],
    ['cadence-stats'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useMarkSend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => markSend(id, status),
    onSuccess: () => invalidateSend(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível marcar o envio.')),
  });
}

export function useReplySend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => replySend(id, text),
    onSuccess: (result) => {
      invalidateSend(queryClient);
      // O servidor já bloqueou o número (§13) — a tela só avisa.
      if (result.blocked) {
        toast.warning('Resposta de descadastro detectada — lead foi para a lista de bloqueio.');
      }
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível registrar a resposta.')),
  });
}
