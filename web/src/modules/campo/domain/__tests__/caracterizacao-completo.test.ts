/**
 * Modo do chefe, S0 — caracterização do fluxo COMPLETO no web (espelho de `faltando` e contadores do dia).
 * Congela a saída atual; as fases S1+ não podem alterá-la com o fluxo `completo`.
 */
import { describe, expect, it } from 'vitest';
import type { VisitAnswers } from '../campo.types';
import { faltando, RESPOSTAS_VAZIAS } from '../questionario';

const HOJE = '2026-10-20';
const completa: VisitAnswers = {
  ...RESPOSTAS_VAZIAS,
  interlocutor_name: 'João',
  interlocutor_role: 'dono',
  freela_status: 'ja_usa',
  interest: 'alto',
  open_vagas: 2,
  vaga_roles: ['Garçom'],
  freelas_per_week: 3,
  channels: ['Grupos de WhatsApp'],
  needs_followup: true,
  followup_what: 'Ligar sexta',
  followup_date: '2026-10-23',
  notes: null,
};

describe('caracterização — faltando() completo (espelho do servidor)', () => {
  const casos: Record<string, VisitAnswers> = {
    vazio: RESPOSTAS_VAZIAS,
    completa,
    'vagas sem funções': { ...completa, vaga_roles: [] },
    'retorno sem o quê nem data': { ...completa, followup_what: null, followup_date: null },
    'retorno no passado': { ...completa, followup_date: '2026-10-19' },
    'canal só "outro"': { ...completa, channels: [], channel_other: 'Instagram' },
    fechado: { ...RESPOSTAS_VAZIAS, outcome: 'fechado' },
    'fechado com retorno incompleto': { ...RESPOSTAS_VAZIAS, outcome: 'fechado', needs_followup: true },
  };
  for (const [nome, r] of Object.entries(casos)) {
    it(nome, () => {
      expect(faltando(r, HOJE)).toMatchSnapshot();
    });
  }
});
