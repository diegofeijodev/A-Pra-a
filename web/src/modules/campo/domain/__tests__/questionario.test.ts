import { describe, expect, it } from 'vitest';
import type { VisitAnswers } from '../campo.types';
import { formatarTelefone, mascararTelefone, normalizarTelefone } from '../contato';
import { canaisExclusivos, faltando, RESPOSTAS_VAZIAS } from '../questionario';
import { MOTIVOS_RECUSA, pedeMotivoRecusa, rotuloMotivoRecusa } from '../recusa';

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

describe('canaisExclusivos ("Nenhum")', () => {
  it('marcar "Nenhum" limpa os outros', () => {
    expect(canaisExclusivos(['Grupos de WhatsApp'], ['Grupos de WhatsApp', 'Nenhum'])).toEqual(['Nenhum']);
  });
  it('marcar outro desmarca "Nenhum"', () => {
    expect(canaisExclusivos(['Nenhum'], ['Nenhum', 'Indicação de conhecidos'])).toEqual(['Indicação de conhecidos']);
  });
  it('desmarcar "Nenhum" deixa vazio; lista comum não muda', () => {
    expect(canaisExclusivos(['Nenhum'], [])).toEqual([]);
    expect(canaisExclusivos(['A'], ['A', 'B'])).toEqual(['A', 'B']);
  });
});

describe('P0 §30 — fechado, motivo e hora do retorno', () => {
  it('fechado não exige nada; conversa (ou ausente) continua exigindo', () => {
    expect(faltando({ ...RESPOSTAS_VAZIAS, outcome: 'fechado' }, '2026-10-08')).toEqual([]);
    expect(faltando({ ...RESPOSTAS_VAZIAS, outcome: 'conversa' }, '2026-10-08')).toHaveLength(8);
    const semOutcome = { ...RESPOSTAS_VAZIAS };
    delete semOutcome.outcome;
    expect(faltando(semOutcome, '2026-10-08')).toHaveLength(8);
  });
  it('respostas antigas (sem os campos novos) continuam completas', () => {
    expect(faltando(COMPLETAS, '2026-10-08')).toEqual([]);
  });
  it('a pergunta do motivo só aparece em conversa com interesse "nenhum"', () => {
    expect(pedeMotivoRecusa({ interest: 'nenhum' })).toBe(true);
    expect(pedeMotivoRecusa({ interest: 'nenhum', outcome: 'conversa' })).toBe(true);
    expect(pedeMotivoRecusa({ interest: 'nenhum', outcome: 'fechado' })).toBe(false);
    expect(pedeMotivoRecusa({ interest: 'alto' })).toBe(false);
  });
  it('o catálogo tem as 6 chaves padrão e rótulos', () => {
    expect(MOTIVOS_RECUSA.map((m) => m.key)).toEqual(['ja_usa_outro_app', 'sem_interesse_momento', 'nao_contrata_freelancers', 'decisor_ausente', 'preco', 'outro']);
    expect(rotuloMotivoRecusa('preco')).toBe('Preço');
    expect(rotuloMotivoRecusa('x')).toBeNull();
  });
});

describe('P0 §30 — telefone do contato', () => {
  it('normaliza como a API: dígitos 10–11, tira 55, vazio limpa, inválido recusa', () => {
    expect(normalizarTelefone('(11) 98765-4321')).toEqual({ ok: true, valor: '11987654321' });
    expect(normalizarTelefone('+55 11 98765-4321')).toEqual({ ok: true, valor: '11987654321' });
    expect(normalizarTelefone('  ')).toEqual({ ok: true, valor: null });
    expect(normalizarTelefone('1234').ok).toBe(false);
    expect(normalizarTelefone('99999999999').ok).toBe(false);
  });
  it('máscara e formatação do campo', () => {
    expect(mascararTelefone('11987654321')).toBe('(11) 9****-4321');
    expect(mascararTelefone('1134567890')).toBe('(11) ****-7890');
    expect(mascararTelefone(null)).toBeNull();
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(formatarTelefone('1134567890')).toBe('(11) 3456-7890');
    expect(formatarTelefone('119')).toBe('(11) 9');
  });
});
