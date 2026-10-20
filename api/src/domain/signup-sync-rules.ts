/**
 * Sincronização dos cadastros confirmados pelo Freela (F7, contrato §27) — regras PURAS.
 * Sem banco, rede ou log. Datas de evento são fatos de escrita única; "confirmado" é função
 * dessas datas + a regra vigente, avaliada na leitura (trocar a regra não reescreve o passado).
 */
import { addDays, todaySp, weekdayOf } from '../common/time/dates';
import { mascararTelefone, somenteDigitos } from './company-signup-rules';

export const REGRAS_CONFIRMACAO = ['activated', 'first_vacancy', 'first_job_completed'] as const;
export type RegraConfirmacao = (typeof REGRAS_CONFIRMACAO)[number];

export interface ConfigCadastro {
  confirmation_rule: RegraConfirmacao;
}
export const CONFIG_CADASTRO_PADRAO: ConfigCadastro = { confirmation_rule: 'activated' };
export const CHAVES_CONFIG_CADASTRO = ['confirmation_rule'] as const;

const regraValida = (v: unknown): v is RegraConfirmacao => (REGRAS_CONFIRMACAO as readonly unknown[]).includes(v);

/** Chave ausente/inválida no JSON do banco cai no padrão. */
export function lerConfigCadastro(raw: unknown): ConfigCadastro {
  const base = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { confirmation_rule: regraValida(base.confirmation_rule) ? base.confirmation_rule : CONFIG_CADASTRO_PADRAO.confirmation_rule };
}

export function aplicarConfigCadastro(
  atual: ConfigCadastro,
  parcial: Record<string, unknown>,
): { ok: true; config: ConfigCadastro } | { ok: false; erro: string } {
  const novo = { ...atual };
  for (const [k, v] of Object.entries(parcial)) {
    if (k !== 'confirmation_rule') return { ok: false, erro: `${k}: campo desconhecido.` };
    if (!regraValida(v)) return { ok: false, erro: 'confirmation_rule: use activated, first_vacancy ou first_job_completed.' };
    novo.confirmation_rule = v;
  }
  return { ok: true, config: novo };
}

/** Nome do evento (coluna `*_at`) que a regra usa e o texto que a tela mostra. */
export const CAMPO_DA_REGRA: Record<RegraConfirmacao, 'activated_at' | 'first_vacancy_at' | 'first_job_completed_at'> = {
  activated: 'activated_at',
  first_vacancy: 'first_vacancy_at',
  first_job_completed: 'first_job_completed_at',
};
export const COLUNA_DIA_DA_REGRA: Record<RegraConfirmacao, 'activated_day' | 'first_vacancy_day' | 'first_job_day'> = {
  activated: 'activated_day',
  first_vacancy: 'first_vacancy_day',
  first_job_completed: 'first_job_day',
};

export interface Eventos {
  activated_at: Date | null;
  first_vacancy_at: Date | null;
  first_job_completed_at: Date | null;
}

/** Dia civil em Brasília de um instante. */
export const diaBrasilia = (d: Date): string => todaySp(d);

export interface EventosMesclados {
  valor: Eventos;
  /** Quantos eventos já gravados vieram com instante diferente (o gravado vence; só vai para contagem). */
  divergencias: number;
}

/** Escrita única: preenche nulo; valor existente nunca é trocado nem volta a nulo. */
export function mesclarEventos(atual: Eventos, novo: Eventos): EventosMesclados {
  const valor = { ...atual };
  let divergencias = 0;
  for (const k of Object.keys(CAMPO_DA_REGRA).map((r) => CAMPO_DA_REGRA[r as RegraConfirmacao])) {
    const a = atual[k];
    const n = novo[k];
    if (a === null && n !== null) valor[k] = n;
    else if (a !== null && n !== null && a.getTime() !== n.getTime()) divergencias++;
  }
  return { valor, divergencias };
}

export interface Classificacao {
  confirmado: boolean;
  /** Instante e dia (Brasília) do evento da regra; nulos quando não confirmado. */
  em: Date | null;
  dia: string | null;
}

export function classificar(e: Eventos, regra: RegraConfirmacao): Classificacao {
  const em = e[CAMPO_DA_REGRA[regra]];
  return em ? { confirmado: true, em, dia: diaBrasilia(em) } : { confirmado: false, em: null, dia: null };
}

/** Semana de Brasília, segunda a domingo, que contém `dia`. */
export function semanaDe(dia: string): { from: string; to: string } {
  const sd = weekdayOf(dia);
  const from = addDays(dia, -((sd + 6) % 7));
  return { from, to: addDays(from, 6) };
}

export interface EntradaDesde {
  agora: Date;
  janelaDias: number;
  watermark: Date | null;
  /** `freela_created_at` do cadastro mais antigo ainda sem o evento da regra. */
  maisAntigoSemEvento: Date | null;
}

const DIA_MS = 86_400_000;

/**
 * `since` da listagem (filtra por `createdAt` no Freela, mas os eventos chegam depois):
 * volta 1 dia do watermark e, se houver cadastro ainda não confirmado, até ele — nunca além da janela.
 */
export function escolherDesde(e: EntradaDesde): Date {
  const piso = new Date(e.agora.getTime() - e.janelaDias * DIA_MS);
  if (!e.watermark) return piso;
  let desde = new Date(e.watermark.getTime() - DIA_MS);
  if (e.maisAntigoSemEvento && e.maisAntigoSemEvento < desde) desde = e.maisAntigoSemEvento;
  return desde < piso ? piso : desde;
}

/** Sem acento, minúsculas, só letras/dígitos separados por espaço único. */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface CandidatoCadastro {
  id: string;
  freela_user_id: string | null;
  company_name: string;
  phone_masked: string;
}

export type Casamento = { tipo: 'linked'; id: string } | { tipo: 'ambiguous' } | { tipo: 'none' };

/**
 * Casa um item do Freela com os cadastros iniciados pelo MESMO consultor (§27.5):
 * 1) `freela_user_id` igual; 2) sem `freela_user_id`, mesma máscara de telefone e mesmo nome.
 * Mais de um candidato num passo = ambíguo (nada é ligado).
 */
export function casarCadastro(
  item: { userId: string; companyName: string; phone: string | null | undefined },
  candidatos: CandidatoCadastro[],
): Casamento {
  const porId = candidatos.filter((c) => c.freela_user_id === item.userId);
  if (porId.length === 1) return { tipo: 'linked', id: porId[0]!.id };
  if (porId.length > 1) return { tipo: 'ambiguous' };
  if (!item.phone) return { tipo: 'none' };
  const mask = mascararTelefone(item.phone);
  if (mask === '****') return { tipo: 'none' };
  const nome = normalizarNome(item.companyName);
  const soft = candidatos.filter((c) => c.freela_user_id === null && c.phone_masked === mask && normalizarNome(c.company_name) === nome);
  if (soft.length === 1) return { tipo: 'linked', id: soft[0]!.id };
  return soft.length > 1 ? { tipo: 'ambiguous' } : { tipo: 'none' };
}

/** CNPJ do Freela nas formas em que o lead pode tê-lo guardado (só dígitos ou máscara). */
export function variantesCnpj(cnpj: string | null | undefined): string[] {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14) return [];
  return [d, `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`];
}

/** Lead sobe para "Cadastrado" (5) só se confirmado, ativo, não-teste e antes da etapa 5; a etapa 8 (Perdido) não é tocada. */
export function leadDeveSubir(lead: { stage: number; archived: boolean; is_test: boolean }, confirmado: boolean): boolean {
  return confirmado && !lead.archived && !lead.is_test && lead.stage < 5;
}

export function sanitizarErroSync(e: unknown): { code: string; message: string } {
  const status = (e as { freelaStatus?: unknown } | null)?.freelaStatus;
  if (status === 404 || status === 403) return { code: `FREELA_${status}`, message: 'O Freela ainda não oferece a listagem de cadastros para esta conta.' };
  if (status === 429) return { code: 'FREELA_429', message: 'O Freela limitou as consultas (muitas requisições).' };
  if (typeof status === 'number') return { code: `FREELA_${status}`, message: `O Freela respondeu HTTP ${status}.` };
  const code = (e as { response?: { code?: unknown } } | null)?.response?.code;
  if (code === 'FREELA_UNREACHABLE') return { code, message: 'Não foi possível falar com o Freela.' };
  if (code === 'FREELA_NOT_CONFIGURED') return { code, message: 'Conexão com o Freela não configurada.' };
  return { code: 'SYNC_ERROR', message: 'A sincronização falhou.' };
}
