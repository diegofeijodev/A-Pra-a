import { describe, expect, it } from 'vitest';
import type { VisitAnswers } from '../campo.types';
import { faltando, RESPOSTAS_VAZIAS } from '../questionario';

const COMPLETAS: VisitAnswers = {
  interlocutor_name: 'Maria',
  interlocutor_role: 'dono',
  freela_status: 'cadastrou_qr',
  interest: 'alto',
  open_vagas: 2,
  vaga_roles: ['Garçom'],
  freelas_per_week: 5,
  channels: ['Grupos de WhatsApp'],
  channel_other: null,
  needs_followup: true,
  followup_what: 'Voltar com proposta',
  followup_date: '2026-10-09',
  notes: null,
};

describe('faltando (espelho do servidor)', () => {
  it('vazio: lista tudo, na ordem da tela', () => {
    expect(faltando(RESPOSTAS_VAZIAS, '2026-10-08')).toEqual([
      'nome de quem atendeu',
      'cargo de quem atendeu',
      'situação no Freela',
      'interesse',
      'vagas abertas',
      'freelancers por semana',
      'apps e canais que usa',
      'se pediu retorno',
    ]);
  });

  it('completo: nada falta', () => {
    expect(faltando(COMPLETAS, '2026-10-08')).toEqual([]);
  });

  it('vagas > 0 exige função; 0 vagas não exige', () => {
    expect(faltando({ ...COMPLETAS, vaga_roles: [] }, '2026-10-08')).toEqual(['funções das vagas']);
    expect(faltando({ ...COMPLETAS, open_vagas: 0, vaga_roles: [] }, '2026-10-08')).toEqual([]);
  });

  it('"outro" preenchido vale como canal', () => {
    expect(faltando({ ...COMPLETAS, channels: [], channel_other: 'App X' }, '2026-10-08')).toEqual([]);
    expect(faltando({ ...COMPLETAS, channels: [], channel_other: '  ' }, '2026-10-08')).toEqual(['apps e canais que usa']);
  });

  it('retorno: o quê + data, e a data não pode ser no passado', () => {
    expect(faltando({ ...COMPLETAS, followup_what: ' ', followup_date: null }, '2026-10-08')).toEqual([
      'o que fazer no retorno',
      'data do retorno',
    ]);
    expect(faltando({ ...COMPLETAS, followup_date: '2026-10-07' }, '2026-10-08')).toEqual([
      'data do retorno (não pode ser no passado)',
    ]);
    expect(faltando({ ...COMPLETAS, needs_followup: false, followup_what: null, followup_date: null }, '2026-10-08')).toEqual([]);
  });
});
