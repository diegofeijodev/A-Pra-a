import type { VisitAnswers } from './campo.types';

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
  outcome: 'conversa',
  refusal_reason: null,
  refusal_note: null,
  followup_time: null,
  contact_phone: null,
};

/** Funções das vagas (spec §8.1 — "garçom, cozinheiro, churrasqueiro, motoboy ou outra"). */
export const FUNCOES_VAGA = ['Garçom', 'Cozinheiro', 'Churrasqueiro', 'Motoboy', 'Outra'] as const;

const vazio = (s: string | null | undefined): boolean => !s || !s.trim();

export function faltando(r: VisitAnswers, hoje: string): string[] {
  const f: string[] = [];
  // Estabelecimento fechado (§30.1): sem questionário, mas retorno marcado ("Sim") exige o quê e uma data válida.
  if (r.outcome === 'fechado') {
    if (r.needs_followup === true) faltandoRetorno(r, hoje, f);
    return f;
  }
  if (vazio(r.interlocutor_name)) f.push('nome de quem atendeu');
  if (!r.interlocutor_role) f.push('cargo de quem atendeu');
  if (!r.freela_status) f.push('situação no Freela');
  if (!r.interest) f.push('interesse');
  if (r.open_vagas == null) f.push('vagas abertas');
  else if (r.open_vagas > 0 && r.vaga_roles.length === 0) f.push('funções das vagas');
  if (r.freelas_per_week == null) f.push('freelancers por semana');
  if (r.channels.length === 0 && vazio(r.channel_other)) f.push('apps e canais que usa');
  if (r.needs_followup == null) f.push('se pediu retorno');
  else if (r.needs_followup) faltandoRetorno(r, hoje, f);
  return f;
}

function faltandoRetorno(r: VisitAnswers, hoje: string, f: string[]): void {
  if (vazio(r.followup_what)) f.push('o que fazer no retorno');
  if (!r.followup_date) f.push('data do retorno');
  else if (r.followup_date < hoje) f.push('data do retorno (não pode ser no passado)');
}

const NENHUM = 'Nenhum';

/** "Nenhum" é exclusivo: marcá-lo limpa os outros canais; marcar outro canal desmarca "Nenhum". */
export function canaisExclusivos(anterior: string[], nova: string[]): string[] {
  if (nova.includes(NENHUM) && !anterior.includes(NENHUM)) return [NENHUM];
  return nova.length > 1 ? nova.filter((c) => c !== NENHUM) : nova;
}
