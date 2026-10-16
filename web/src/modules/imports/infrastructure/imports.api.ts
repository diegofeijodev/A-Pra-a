import { api } from '@/modules/shared/infrastructure/http';

/**
 * Entrada de leads (§10 do contrato). O arquivo é lido no navegador
 * (`lib/intake.ts`) e sobe já parseado; duplicidade, adivinhação de mapeamento
 * e gravação são do servidor.
 */

export type DupAction = 'ignorar' | 'completar' | 'criar';
export type PracaMode = 'lote' | 'arquivo';
export type OwnerMode = 'lote' | 'rodizio';

/** O lead como a linha do arquivo ficaria depois do mapeamento. */
export interface DraftLead {
  name: string;
  address: string;
  city: string;
  phone: string;
  instagram: string;
  decisor: string;
  classe: string;
  origem: string;
  cnpj: string;
  cnae: string | null;
  bairro: string;
  lat: number | null;
  lng: number | null;
}

export interface EvalRowView {
  draft: DraftLead;
  /** `lead_id` nulo = duplicata de outra linha do MESMO arquivo. */
  dup: { lead_id: string | null; lead_name: string; by: string } | null;
  no_phone: boolean;
  no_name: boolean;
  fora_cnae: boolean;
  praca_id: string | null;
}

export interface EvaluateView {
  total: number;
  dups: number;
  no_phone: number;
  no_name: number;
  will_import: number;
  sem_praca: number;
  fora_cnae: number;
  guessed_map: Record<string, string>;
  /** Só as 10 primeiras linhas — é pré-visualização; as contagens são do arquivo inteiro. */
  rows: EvalRowView[];
}

export interface RunView {
  batch_id: string;
  imported: number;
  updated: number;
  ignored: number;
  reasons: string[];
}

export interface ImportBatchView {
  id: string;
  at: string;
  file_name: string;
  by: string;
  origem: string;
  imported: number;
  ignored: number;
  reasons: string[];
  /** Importado há menos de 24 h — só então o botão "desfazer" aparece. */
  can_undo: boolean;
}

export interface ImportMappingView {
  id: string;
  name: string;
  map: Record<string, string>;
  created_at: string;
}

export interface EvaluateImportInput {
  columns: string[];
  rows: Record<string, string>[];
  map: Record<string, string>;
  origem: string;
  dup_action: DupAction;
  praca_mode: PracaMode;
  lote_praca_id?: string;
  cnaes?: string[];
  allow_no_phone?: boolean;
}

export interface RunImportInput extends EvaluateImportInput {
  file_name: string;
  owner_mode: OwnerMode;
  lote_owner_id?: string;
  rodizio_ids?: string[];
}

export async function evaluateImport(input: EvaluateImportInput): Promise<EvaluateView> {
  const { data } = await api.post('/v1/imports/evaluate', input);
  return data as EvaluateView;
}

export async function runImport(input: RunImportInput): Promise<RunView> {
  const { data } = await api.post('/v1/imports/run', input);
  return data as RunView;
}

export async function listImports(): Promise<ImportBatchView[]> {
  const { data } = await api.get('/v1/imports');
  return data as ImportBatchView[];
}

export async function undoImport(id: string): Promise<{ removed: number; kept: number }> {
  const { data } = await api.post(`/v1/imports/${id}/undo`);
  return data as { removed: number; kept: number };
}

export async function listMappings(): Promise<ImportMappingView[]> {
  const { data } = await api.get('/v1/imports/mappings');
  return data as ImportMappingView[];
}

/** Nome é único: salvar de novo com o mesmo nome SUBSTITUI o mapa (§10). */
export async function saveMapping(
  name: string,
  map: Record<string, string>,
): Promise<ImportMappingView> {
  const { data } = await api.post('/v1/imports/mappings', { name, map });
  return data as ImportMappingView;
}

export async function deleteMapping(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/v1/imports/mappings/${id}`);
  return data as { ok: boolean };
}
