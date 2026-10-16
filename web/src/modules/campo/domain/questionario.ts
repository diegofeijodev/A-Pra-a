import type { VisitAnswers, VisitAnswersV2 } from './campo.types';

/**
 * Espelho do `faltando` de `api/src/domain/campo-rules.ts` (mesma ordem, mesmos
 * rótulos). Quem decide é o servidor (`422 ANSWERS_INCOMPLETE`); aqui é só para
 * a tela dizer o que falta antes de tentar — inclusive sem sinal.
 */
export const RESPOSTAS_VAZIAS: VisitAnswers = {
  interlocutor_name: null,
  interlocutor_role: null,
  freela_status: null,
  interest: null,
  open_vagas: null,
  vaga_roles: [],
  freelas_per_week: null,
  channels: [],
  channel_other: null,
  needs_followup: null,
  followup_what: null,
  followup_date: null,
  notes: null,
};

/** Funções das vagas (spec §8.1 — "garçom, cozinheiro, churrasqueiro, motoboy ou outra"). */
export const FUNCOES_VAGA = ['Garçom', 'Cozinheiro', 'Churrasqueiro', 'Motoboy', 'Outra'] as const;

const vazio = (s: string | null | undefined): boolean => !s || !s.trim();

export function faltando(r: VisitAnswers, hoje: string): string[] {
  const f: string[] = [];
  if (vazio(r.interlocutor_name)) f.push('nome de quem atendeu');
  if (!r.interlocutor_role) f.push('cargo de quem atendeu');
  if (!r.freela_status) f.push('situação no Freela');
  if (!r.interest) f.push('interesse');
  if (r.open_vagas == null) f.push('vagas abertas');
  else if (r.open_vagas > 0 && r.vaga_roles.length === 0) f.push('funções das vagas');
  if (r.freelas_per_week == null) f.push('freelancers por semana');
  if (r.channels.length === 0 && vazio(r.channel_other)) f.push('apps e canais que usa');
  if (r.needs_followup == null) f.push('se pediu retorno');
  else if (r.needs_followup) {
    if (vazio(r.followup_what)) f.push('o que fazer no retorno');
    if (!r.followup_date) f.push('data do retorno');
    else if (r.followup_date < hoje) f.push('data do retorno (não pode ser no passado)');
  }
  return f;
}

const NENHUM = 'Nenhum';

/** "Nenhum" é exclusivo: marcá-lo limpa os outros canais; marcar outro canal desmarca "Nenhum". */
export function canaisExclusivos(anterior: string[], nova: string[]): string[] {
  if (nova.includes(NENHUM) && !anterior.includes(NENHUM)) return [NENHUM];
  return nova.length > 1 ? nova.filter((c) => c !== NENHUM) : nova;
}

// ── formulário v2 (bloco B, §21.6) ──────────────────────────

export const RESPOSTAS_V2_VAZIAS: VisitAnswersV2 = {
  interlocutor_name: null,
  interlocutor_role: null,
  hires_freelancer: null,
  channels: [],
  channel_other: null,
  freelas_per_week: null,
  voucher_accepted: null,
  signup_mode: null,
  final_status: null,
  final_date: null,
  final_reason: null,
  callback_phone: null,
  notes: null,
};

/** O rascunho é do formulário v2? (o v1 não tem `hires_freelancer` nem `final_status`). */
export const ehV2 = (r: object): r is VisitAnswersV2 => 'hires_freelancer' in r || 'final_status' in r || 'signup_mode' in r;

/** Só os campos do v2, a partir das respostas que o servidor devolve (v1 e v2 lado a lado). */
export function respostasV2De(r: Partial<VisitAnswersV2> | null | undefined): VisitAnswersV2 {
  const out = { ...RESPOSTAS_V2_VAZIAS };
  if (!r) return out;
  for (const k of Object.keys(out) as (keyof VisitAnswersV2)[]) {
    const v = r[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** "Acima de 5 por semana" ganha a oferta do voucher (5 não ganha). */
export const ofereceVoucher = (r: Pick<VisitAnswersV2, 'hires_freelancer' | 'freelas_per_week'>): boolean =>
  r.hires_freelancer === true && (r.freelas_per_week ?? 0) > 5;

/** Espelho do `faltandoV2` de `api/src/domain/visit-rules.ts` (mesma ordem, mesmos rótulos). */
export function faltandoV2(r: VisitAnswersV2, hoje: string, ctx: { voucherPedido: boolean; vagas: number }): string[] {
  const f: string[] = [];
  if (vazio(r.interlocutor_name)) f.push('nome do contato');
  if (!r.interlocutor_role) f.push('função (dono ou gerente)');
  if (r.hires_freelancer == null) f.push('se contrata freelancer');
  else if (r.hires_freelancer) {
    if (r.channels.length === 0 && vazio(r.channel_other)) f.push('como contrata');
    if (r.freelas_per_week == null || r.freelas_per_week < 1) f.push('quantos freelancers por semana');
  }
  if (ofereceVoucher(r)) {
    if (r.voucher_accepted == null) f.push('resposta da oferta do voucher');
    else if (r.voucher_accepted) {
      if (!ctx.voucherPedido) f.push('pedir o voucher ao gestor');
      if (ctx.vagas === 0) f.push('abrir a vaga do voucher');
    }
  }
  if (!r.signup_mode) f.push('como abriu o cadastro');
  if (!r.final_status) f.push('status final');
  else {
    if (r.final_status === 'cadastrou' && r.signup_mode === 'nao_abriu') f.push('como abriu o cadastro (cadastrou sem abrir?)');
    if (r.final_status === 'cadastra_depois' || r.final_status === 'ligar_depois') {
      if (!r.final_date) f.push('data do retorno');
      else if (r.final_date < hoje) f.push('data do retorno (não pode ser no passado)');
    }
    if (r.final_status === 'ligar_depois' && vazio(r.callback_phone)) f.push('telefone para ligar');
    if (r.final_status === 'nao_quis' && vazio(r.final_reason)) f.push('motivo de não querer');
  }
  return f;
}

/** Só os campos do v1 — as respostas do servidor trazem os do v2 junto, e o PATCH de uma visita v1 recusa campo do v2. */
export function respostasV1De(r: Partial<VisitAnswers> | null | undefined): VisitAnswers {
  const out = { ...RESPOSTAS_VAZIAS };
  if (!r) return out;
  for (const k of Object.keys(out) as (keyof VisitAnswers)[]) {
    const v = r[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
