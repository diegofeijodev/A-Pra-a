'use client';

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  createCampanha,
  createCreative,
  createTraffic,
  deleteCampanha,
  deleteCreative,
  deleteTraffic,
  duplicateCampanha,
  fetchFillBrake,
  listCampanhas,
  listCreatives,
  listProofs,
  listTraffic,
  pullTrafficApi,
  replaceCampanha,
  replaceCreative,
  replaceTraffic,
  reviewCreative,
  saveTrafficDay,
  setCampanhaStatus,
  setCreativePublishDate,
  setCreativeStatus,
  suggestCampanhaName,
  type CampanhaBody,
  type CampanhaView,
  type CampMetricsView,
  type CreativeBody,
  type CreativeCommentView,
  type CreativeIa,
  type CreativeRoteiro,
  type CreativeView,
  type FillBrakeView,
  type GateView,
  type ProofBody,
  type ProofView,
  type ScriptModelView,
  type SuggestNameInput,
  type TrafficBody,
  type TrafficDayBody,
  type TrafficDayView,
  type TrafficEntryView,
} from '../infrastructure/midia.api';

export type {
  CampanhaBody,
  CampanhaView,
  CampMetricsView,
  CreativeBody,
  CreativeCommentView,
  CreativeIa,
  CreativeRoteiro,
  CreativeView,
  FillBrakeView,
  GateView,
  ProofBody,
  ProofView,
  ScriptModelView,
  SuggestNameInput,
  TrafficBody,
  TrafficDayBody,
  TrafficDayView,
  TrafficEntryView,
};

/**
 * Mídia (§15) — campanhas, criativos, tráfego e provas.
 *
 * Invalidação por PREFIXO, como em `use-leads.ts` e `use-disparos.ts`: as
 * chaves são `['campanhas', pracaId]`, `['creatives', campanhaId]`,
 * `['traffic', campanhaId]`, `['proofs', pracaId]` e `['fill-brake', pracaId]`,
 * e a mutação invalida o prefixo inteiro por não saber (nem precisar saber) em
 * qual recorte a linha caiu.
 */

/**
 * Mexer em campanha respinga longe: o `DELETE` leva criativos e tráfego por
 * cascata e zera `leads.campanha_id` na mesma transação (§15), e as métricas
 * (`metrics`) que a tela mostra saem do servidor. O freio de preenchimento
 * entra na lista porque é lido lado a lado com as campanhas na aba Tráfego —
 * uma releitura é barata perto de mostrar número velho.
 */
function invalidateCampanha(queryClient: QueryClient) {
  for (const key of [
    ['campanhas'],
    ['creatives'],
    ['traffic'],
    ['fill-brake'],
    ['leads'],
    ['lead'],
    ['indicators'],
    ['notifications'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * Criativo mexe no quadro e nas entradas de tráfego que o citavam: o `DELETE`
 * tira o id do criativo de `traffic_entries.criativos` na mesma transação
 * (§15), senão o id órfão travaria o próximo `PUT` da entrada.
 */
function invalidateCreative(queryClient: QueryClient) {
  for (const key of [['creatives'], ['traffic']]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * Dia lançado no tráfego muda `metrics.investido` da campanha (a soma dos dias
 * substitui o gasto declarado), então as campanhas entram junto.
 */
function invalidateTraffic(queryClient: QueryClient) {
  for (const key of [['traffic'], ['campanhas'], ['indicators'], ['notifications']]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * `combine` estável dos `useQueries` de calendário: uma arrow declarada no
 * corpo do componente é uma função nova a cada render, o que anula a
 * memoização do `useQueries` (ele reexecuta o `combine` e realoca o array
 * sempre). Hoistada aqui, roda só quando o resultado das consultas muda.
 */
function combineData<T>(results: { data?: T[] }[]): T[] {
  return results.flatMap((r) => r.data ?? []);
}

// ── provas ─────────────────────────────────────────────────────
export function useProofs(pracaId: string | null | undefined) {
  return useQuery({
    queryKey: ['proofs', pracaId],
    queryFn: () => listProofs(pracaId as string),
    // `?praca_id` é obrigatório na rota: sem praça o pedido seria 400.
    enabled: !!pracaId,
  });
}

// ── campanhas ──────────────────────────────────────────────────
/**
 * Lista de campanhas. Sem `pracaId` traz as de todas as praças — é o que a
 * tela do protótipo mostrava (`s.campanhas`): o cartão diz de qual praça é,
 * duplicar joga para outra e o calendário tem filtro próprio de praça.
 */
export function useCampanhas(pracaId?: string) {
  return useQuery({
    queryKey: ['campanhas', pracaId],
    queryFn: () => listCampanhas(pracaId),
    placeholderData: keepPreviousData,
  });
}

/** `id` presente = `PUT` (briefing existente); ausente = `POST` (campanha nova). */
export function useSaveCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CampanhaBody }) =>
      id ? replaceCampanha(id, body) : createCampanha(body),
    onSuccess: () => invalidateCampanha(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a campanha.')),
  });
}

export function useDeleteCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCampanha(id),
    onSuccess: () => invalidateCampanha(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível apagar a campanha.')),
  });
}

export function useDuplicateCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, praca_id }: { id: string; praca_id: string }) =>
      duplicateCampanha(id, praca_id),
    onSuccess: () => invalidateCampanha(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível duplicar a campanha.')),
  });
}

/**
 * Sair do rascunho com o portão fechado exige justificativa escrita: sem ela o
 * servidor responde `400 GATE_JUSTIFICATION_REQUIRED` e a mensagem dele é a
 * que a tela mostra.
 */
export function useSetCampanhaStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      justification,
    }: {
      id: string;
      status: string;
      justification?: string;
    }) => setCampanhaStatus(id, status, justification),
    onSuccess: () => invalidateCampanha(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível mudar o status.')),
  });
}

/**
 * O nome padronizado (`BH-Contratante-Cadastro-Set26`) é montado pelo servidor
 * — o briefing pede o nome enquanto a pessoa escolhe praça, público, objetivo
 * e início, e o mesmo nome é usado no Meta e no Google.
 */
export function useSuggestName() {
  return useMutation({
    mutationFn: (input: SuggestNameInput) => suggestCampanhaName(input),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível sugerir o nome.')),
  });
}

/** Freio de preenchimento da praça (média de horas para preencher a vaga). */
export function useFillBrake(pracaId: string | null | undefined) {
  return useQuery({
    queryKey: ['fill-brake', pracaId],
    queryFn: () => fetchFillBrake(pracaId as string),
    enabled: !!pracaId,
  });
}

// ── criativos ──────────────────────────────────────────────────
export function useCreatives(campanhaId: string | null | undefined) {
  return useQuery({
    queryKey: ['creatives', campanhaId],
    queryFn: () => listCreatives(campanhaId as string),
    // `?campanha_id` é obrigatório na rota.
    enabled: !!campanhaId,
  });
}

/**
 * As peças de VÁRIAS campanhas de uma vez — o calendário mostra o mês inteiro,
 * atravessando campanhas, e `GET /v1/creatives` pede uma campanha por vez.
 * As chaves são as mesmas de `useCreatives`, então o cache é compartilhado e a
 * invalidação por prefixo alcança as duas.
 */
export function useCreativesOfCampanhas(campanhaIds: string[]): CreativeView[] {
  return useQueries({
    queries: campanhaIds.map((id) => ({
      queryKey: ['creatives', id],
      queryFn: () => listCreatives(id),
    })),
    combine: combineData,
  });
}

export function useSaveCreative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreativeBody }) =>
      id ? replaceCreative(id, body) : createCreative(body),
    onSuccess: () => invalidateCreative(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a peça.')),
  });
}

export function useDeleteCreative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCreative(id),
    onSuccess: () => invalidateCreative(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível apagar a peça.')),
  });
}

/** Só move o quadro — sem comentário no histórico (§15). */
export function useSetCreativeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => setCreativeStatus(id, status),
    onSuccess: () => invalidateCreative(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível mover a peça.')),
  });
}

/** Arrastar no calendário: muda `publish_at` e deixa a nota no histórico. */
export function useSetPublishDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => setCreativePublishDate(id, date),
    onSuccess: () => invalidateCreative(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível mudar a data de publicação.')),
  });
}

/** `aprovacao` (texto vazio vira "Aprovado.") ou `ajuste` (texto obrigatório). */
export function useReviewCreative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind, text }: { id: string; kind: string; text?: string }) =>
      reviewCreative(id, kind, text),
    onSuccess: () => invalidateCreative(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível registrar a revisão.')),
  });
}

// ── tráfego ────────────────────────────────────────────────────
export function useTraffic(campanhaId: string | null | undefined) {
  return useQuery({
    queryKey: ['traffic', campanhaId],
    queryFn: () => listTraffic(campanhaId as string),
    // `?campanha_id` é obrigatório na rota.
    enabled: !!campanhaId,
  });
}

/** As entradas de várias campanhas — o filtro Meta/Google do calendário. */
export function useTrafficOfCampanhas(campanhaIds: string[]): TrafficEntryView[] {
  return useQueries({
    queries: campanhaIds.map((id) => ({
      queryKey: ['traffic', id],
      queryFn: () => listTraffic(id),
    })),
    combine: combineData,
  });
}

export function useSaveTraffic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: TrafficBody }) =>
      id ? replaceTraffic(id, body) : createTraffic(body),
    onSuccess: () => invalidateTraffic(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a entrada.')),
  });
}

export function useDeleteTraffic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTraffic(id),
    onSuccess: () => invalidateTraffic(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível apagar a entrada.')),
  });
}

/** Upsert por data: lançar o mesmo dia duas vezes corrige a linha (§15). */
export function useSaveTrafficDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TrafficDayBody }) => saveTrafficDay(id, body),
    onSuccess: () => invalidateTraffic(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível lançar o dia.')),
  });
}

export function usePullTrafficApi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pullTrafficApi(id),
    onSuccess: () => invalidateTraffic(queryClient),
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível puxar os números.')),
  });
}
