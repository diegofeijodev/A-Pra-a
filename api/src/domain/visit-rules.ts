// Formulário de visita versão 2 (bloco B, contrato §21.6–21.7). Regras puras.
import { randomInt } from 'node:crypto';
import { VOUCHER_MINIMO_SEMANA } from './catalog/campo';
import { ROTULO_CARGO } from './campo-rules';

export const FINAIS = ['cadastrou', 'cadastra_depois', 'nao_quis', 'ligar_depois'] as const;
export type StatusFinal = (typeof FINAIS)[number];
export const MODOS_CADASTRO = ['qr', 'assistido', 'nao_abriu'] as const;
export const CARGOS_V2 = ['dono', 'gerente'] as const;

export interface RespostasV2 {
  interlocutor_name: string | null;
  interlocutor_role: string | null;
  hires_freelancer: boolean | null;
  channels: string[];
  channel_other: string | null;
  freelas_per_week: number | null;
  voucher_accepted: boolean | null;
  signup_mode: string | null;
  final_status: string | null;
  final_date: string | null;
  final_reason: string | null;
  callback_phone: string | null;
  notes: string | null;
}

const vazio = (s: string | null | undefined): boolean => !s || !s.trim();

/** A oferta do voucher aparece? "Acima de 5 por semana" — 5 não ganha (§21.7). */
export const ofereceVoucher = (r: Pick<RespostasV2, 'hires_freelancer' | 'freelas_per_week'>): boolean =>
  r.hires_freelancer === true && (r.freelas_per_week ?? 0) > VOUCHER_MINIMO_SEMANA;

/** O que falta para o checkout, na ordem da tela (§21.6). */
export function faltandoV2(r: RespostasV2, hoje: string, ctx: { voucherPedido: boolean; vagas: number }): string[] {
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

export const ROTULO_FINAL: Record<string, string> = {
  cadastrou: 'cadastrou',
  cadastra_depois: 'vai cadastrar depois',
  nao_quis: 'não quis',
  ligar_depois: 'ligar depois',
};
const ROTULO_MODO: Record<string, string> = { qr: 'pelo QR code', assistido: 'cadastro assistido', nao_abriu: 'não abriu' };

const semPontoFinal = (s: string): string => s.trim().replace(/[.\s]+$/, '');
const diaBR = (s: string | null): string => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

/** Texto do evento `visit` no CRM (v2) — uma frase por pergunta. */
export function resumoV2(r: RespostasV2, ctx: { voucher: string | null; vagas: { date: string; funcao: string }[] }): string {
  const partes = [`Visita de campo — contato: ${r.interlocutor_name?.trim() || '—'} (${ROTULO_CARGO[r.interlocutor_role ?? ''] ?? '—'})`];
  if (r.hires_freelancer) {
    const canais = [...r.channels, ...(vazio(r.channel_other) ? [] : [`outro: ${r.channel_other!.trim()}`])];
    partes.push(`Contrata freelancer: sim, ${r.freelas_per_week ?? 0} por semana (${canais.join(', ') || '—'})`);
  } else partes.push('Contrata freelancer: não');
  if (ofereceVoucher(r)) partes.push(r.voucher_accepted ? `Voucher: aceitou${ctx.voucher ? ` (${ctx.voucher})` : ''}` : 'Voucher: não aceitou');
  if (ctx.vagas.length) partes.push(`Vagas abertas na visita: ${ctx.vagas.map((v) => `${v.funcao} em ${diaBR(v.date)}`).join('; ')}`);
  partes.push(`Cadastro: ${ROTULO_MODO[r.signup_mode ?? ''] ?? '—'}`);
  let final = `Status final: ${ROTULO_FINAL[r.final_status ?? ''] ?? '—'}`;
  if (r.final_status === 'cadastra_depois' || r.final_status === 'ligar_depois') final += ` em ${diaBR(r.final_date)}`;
  if (r.final_status === 'ligar_depois' && r.callback_phone) final += ` (${r.callback_phone.trim()})`;
  if (r.final_status === 'nao_quis' && r.final_reason) final += ` — ${semPontoFinal(r.final_reason)}`;
  partes.push(final);
  if (!vazio(r.notes)) partes.push(`Obs.: ${semPontoFinal(r.notes!)}`);
  return `${partes.join('. ')}.`;
}

export interface EfeitoNoFunil {
  stage: number;
  /** Mudou de etapa? (vai em `stage_to` no evento.) */
  mudou: boolean;
  next_step: { what: string; date: string } | null;
  lost_reason: string | null;
}

/** Status final → funil (§21.6): cadastrou → 5; não quis → 8; retornos → próximo passo. */
export function efeitoNoFunil(stage: number, r: RespostasV2): EfeitoNoFunil {
  const conversa = stage === 1 || stage === 2 ? 3 : stage;
  switch (r.final_status) {
    case 'cadastrou': {
      const s = stage < 5 ? 5 : stage;
      return { stage: s, mudou: s !== stage, next_step: null, lost_reason: null };
    }
    case 'nao_quis':
      return { stage: 8, mudou: stage !== 8, next_step: null, lost_reason: semPontoFinal(r.final_reason ?? '') || 'não quis' };
    case 'cadastra_depois':
      return { stage: conversa, mudou: conversa !== stage, next_step: { what: 'Confirmar cadastro', date: r.final_date! }, lost_reason: null };
    case 'ligar_depois':
      return {
        stage: conversa,
        mudou: conversa !== stage,
        next_step: { what: `Ligar (${r.callback_phone?.trim() ?? ''})`, date: r.final_date! },
        lost_reason: null,
      };
    default:
      return { stage: conversa, mudou: conversa !== stage, next_step: null, lost_reason: null };
  }
}

/** `PRC-` + 6 caracteres sem 0/O/1/I (lido em voz alta pelo telefone sem confusão). */
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function codigoVoucher(sorteio: (max: number) => number = randomInt): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFABETO[sorteio(ALFABETO.length)];
  return `PRC-${s}`;
}

/**
 * Tempo em cada parada (§21.8): visitas do dia JÁ em ordem de check-in. Tempo
 * parado = checkout − check-in; deslocamento = check-in − checkout anterior
 * (a primeira, desde o início da jornada; `null` se a anterior não fechou).
 */
export function temposPorParada(
  visitas: { checkin_at: Date; checkout_at: Date | null }[],
  inicioJornada: Date | null,
): { minutes_on_site: number | null; minutes_travel: number | null }[] {
  const min = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
  return visitas.map((v, i) => {
    const anterior = i === 0 ? inicioJornada : visitas[i - 1]!.checkout_at;
    return {
      minutes_on_site: v.checkout_at ? min(v.checkin_at, v.checkout_at) : null,
      minutes_travel: anterior ? min(anterior, v.checkin_at) : null,
    };
  });
}
