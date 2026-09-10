'use client';

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
  createFreelaCampaign,
  createFreelaTemplate,
  fetchAudienceOptions,
  fetchFreelaStatus,
  getFreelaCampaign,
  listFreelaCampaigns,
  listFreelaTemplates,
  previewAudience,
  setFreelaCampaignState,
  setFreelaTemplateEnabled,
  updateFreelaTemplate,
  uploadFreelaImage,
  AUDIENCE_LABELS,
  FREELA_BASE_AUDIENCES,
  FREELA_CHANNELS,
  FREELA_CREATABLE_AUDIENCES,
  FREELA_MODULES,
  FREELA_PREVIEWABLE_AUDIENCES,
  KIND_LABELS,
  STATUS_LABELS,
  type AudienceCity,
  type AudienceOptionsView,
  type AudiencePreviewView,
  type CreateFreelaCampaignInput,
  type CreateFreelaCampaignResult,
  type FreelaCampaignAction,
  type FreelaCampaignDetailView,
  type FreelaCampaignStats,
  type FreelaCampaignView,
  type FreelaFiltersInput,
  type FreelaPacingInput,
  type FreelaRecipientView,
  type FreelaStatusView,
  type FreelaTemplateBody,
  type FreelaTemplateView,
  type FreelaUploadResult,
} from '../infrastructure/freela.api';

export {
  AUDIENCE_LABELS,
  FREELA_BASE_AUDIENCES,
  FREELA_CHANNELS,
  FREELA_CREATABLE_AUDIENCES,
  FREELA_MODULES,
  FREELA_PREVIEWABLE_AUDIENCES,
  KIND_LABELS,
  STATUS_LABELS,
};
export type {
  AudienceCity,
  AudienceOptionsView,
  AudiencePreviewView,
  CreateFreelaCampaignInput,
  CreateFreelaCampaignResult,
  FreelaCampaignAction,
  FreelaCampaignDetailView,
  FreelaCampaignStats,
  FreelaCampaignView,
  FreelaFiltersInput,
  FreelaPacingInput,
  FreelaRecipientView,
  FreelaStatusView,
  FreelaTemplateBody,
  FreelaTemplateView,
  FreelaUploadResult,
};

/**
 * Freela (§18) — conexão, campanhas normais e campanhas automáticas.
 *
 * Duas regras valem para o arquivo inteiro:
 *
 * 1. **Só `status` fala sem conexão.** Sem as três variáveis de ambiente na
 *    API, todas as outras rotas respondem `503 FREELA_NOT_CONFIGURED`; por isso
 *    cada consulta tem `enabled` amarrado em `status.configured` — sem isso a
 *    tela abriria com uma saraivada de 503 (e o `refetchInterval` repetiria
 *    para sempre).
 * 2. **Invalidação por PREFIXO**, como em `use-midia.ts`: as chaves são
 *    `['freela','campaigns', pracaId]`, `['freela','campaign', id]`,
 *    `['freela','templates', pracaId]` e `['freela','template', id]`, e a
 *    mutação invalida o prefixo sem saber em que recorte a linha caiu.
 */

/** Espelho de campanha que ainda anda (o relógio do servidor sincroniza a cada 2 min). */
const CAMPAIGNS_POLL_MS = 30_000;

/** A conexão pode cair (ou subir) sem ninguém recarregar a página. */
const STATUS_POLL_MS = 60_000;

function invalidateCampaigns(queryClient: QueryClient) {
  for (const key of [
    ['freela', 'campaigns'],
    ['freela', 'campaign'],
    ['freela', 'status'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

function invalidateTemplates(queryClient: QueryClient) {
  for (const key of [
    ['freela', 'templates'],
    ['freela', 'template'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

// ── conexão ────────────────────────────────────────────────────
/**
 * A única rota que responde 200 sem conexão — e a que explica por que as outras
 * não respondem. `reachable` é um `GET` de verdade no Freela, então o relógio
 * de 60 s também serve de "voltou ao ar" sem recarregar a tela.
 */
export function useFreelaStatus() {
  return useQuery({
    queryKey: ['freela', 'status'],
    queryFn: fetchFreelaStatus,
    refetchInterval: STATUS_POLL_MS,
  });
}

/** Atalho interno: `true` só quando dá para chamar o resto de `/v1/freela/*`. */
function useConfigured(): boolean {
  const { data } = useFreelaStatus();
  return data?.configured === true;
}

// ── público do Freela ──────────────────────────────────────────
/**
 * Cidades que existem naquele público, com o tamanho de cada uma — é o que
 * deixa a tela dizer quanta gente a cobertura da praça alcança em vez de a
 * pessoa escolher no escuro. Só vale para público **previsível**: com
 * `EXTERNAL_LIST` a rota responde `400` (a lista vem do funil, §18.2).
 */
export function useAudienceOptions(audience: string) {
  const configured = useConfigured();
  return useQuery({
    queryKey: ['freela', 'audience-options', audience],
    queryFn: () => fetchAudienceOptions(audience),
    enabled: configured && FREELA_PREVIEWABLE_AUDIENCES.includes(audience),
    // A base do Freela não muda de minuto a minuto e a consulta lá é cara.
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Contar o público ANTES de criar. É mutação, não consulta: o botão "Contar" é
 * um ato do operador (a consulta é pesada do lado do Freela) e não deve sair
 * sozinha a cada tecla no recorte.
 */
export function useAudiencePreview() {
  return useMutation({
    mutationFn: (input: { audience: string; filters?: FreelaFiltersInput }) =>
      previewAudience(input),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível contar o público.')),
  });
}

// ── campanhas normais ──────────────────────────────────────────
/**
 * O espelho local. `GET` sincroniza as 5 campanhas mais velhas antes de
 * responder (§18.2), então repetir a cada 30 s é o que faz `status`/`stats`
 * andarem na tela enquanto o Freela dispara — mas só com a conexão de pé.
 */
export function useFreelaCampaigns(pracaId?: string) {
  const configured = useConfigured();
  return useQuery({
    queryKey: ['freela', 'campaigns', pracaId],
    queryFn: () => listFreelaCampaigns(pracaId),
    enabled: configured,
    refetchInterval: configured ? CAMPAIGNS_POLL_MS : false,
    placeholderData: keepPreviousData,
  });
}

/**
 * O detalhe (campanha + destinatários) é leitura sob demanda: cada tique custa
 * **duas** chamadas ao Freela (detalhe + `recipients`) e um `UPDATE` no espelho.
 * Por isso o relógio só corre enquanto a campanha está **andando**
 * (`RUNNING`) — em rascunho, pausada ou terminada nada muda lá sozinho.
 */
export function useFreelaCampaign(id: string | null | undefined) {
  const configured = useConfigured();
  return useQuery({
    queryKey: ['freela', 'campaign', id],
    queryFn: () => getFreelaCampaign(id as string),
    enabled: configured && !!id,
    refetchInterval: (query) =>
      configured && query.state.data?.campaign.status === 'RUNNING' ? CAMPAIGNS_POLL_MS : false,
    placeholderData: keepPreviousData,
  });
}

/**
 * `POST /v1/freela/campaigns`. O resultado (contagens, telefones repetidos,
 * variáveis não suportadas e `start_error`) é de quem chamou: quem cria precisa
 * VER o que ficou de fora, então o diálogo mostra o retorno em vez de fechar.
 */
export function useCreateFreelaCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFreelaCampaignInput) => createFreelaCampaign(input),
    onSuccess: () => invalidateCampaigns(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar a campanha.')),
  });
}

/** Começar, pausar, cancelar — e tentar de novo o `start` que falhou (§18.5). */
export function useSetFreelaCampaignState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: FreelaCampaignAction }) =>
      setFreelaCampaignState(id, action),
    onSuccess: () => invalidateCampaigns(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível mudar a campanha.')),
  });
}

// ── campanhas automáticas ──────────────────────────────────────
export function useFreelaTemplates(pracaId?: string) {
  const configured = useConfigured();
  return useQuery({
    queryKey: ['freela', 'templates', pracaId],
    queryFn: () => listFreelaTemplates(pracaId),
    enabled: configured,
    placeholderData: keepPreviousData,
  });
}

/** A campanha automática nasce DESLIGADA lá — quem liga é `useSetFreelaTemplateEnabled`. */
export function useCreateFreelaTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FreelaTemplateBody) => createFreelaTemplate(body),
    onSuccess: () => invalidateTemplates(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar a campanha automática.')),
  });
}

/** `PUT` substitui o corpo INTEIRO lá: a tela sempre manda todos os campos. */
export function useUpdateFreelaTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: FreelaTemplateBody }) =>
      updateFreelaTemplate(id, body),
    onSuccess: () => invalidateTemplates(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a campanha automática.')),
  });
}

export function useSetFreelaTemplateEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setFreelaTemplateEnabled(id, enabled),
    onSuccess: () => invalidateTemplates(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível ligar/pausar a campanha.')),
  });
}

/** Imagem do push: sobe pela API do Praça e devolve a `key` que vai no corpo. */
export function useUploadFreelaImage() {
  return useMutation({
    mutationFn: (file: File) => uploadFreelaImage(file),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível enviar a imagem.')),
  });
}
