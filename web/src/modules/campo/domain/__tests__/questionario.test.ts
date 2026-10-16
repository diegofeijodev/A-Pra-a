import { describe, expect, it } from 'vitest';
import type { VisitAnswers } from '../campo.types';
import { canaisExclusivos, faltando, RESPOSTAS_VAZIAS } from '../questionario';

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

import { faltandoV2, respostasV1De, respostasV2De, RESPOSTAS_V2_VAZIAS } from '../questionario';

describe('formulário v2 (espelho da API)', () => {
  const completo = { ...RESPOSTAS_V2_VAZIAS, interlocutor_name: 'João', interlocutor_role: 'dono' as const, hires_freelancer: false, signup_mode: 'qr' as const, final_status: 'cadastrou' as const };
  const ctx = { voucherPedido: false, vagas: 0 };

  it('completo não falta nada; acima de 5 pede o voucher', () => {
    expect(faltandoV2(completo, '2026-10-08', ctx)).toEqual([]);
    const muitos = { ...completo, hires_freelancer: true, channels: ['Agência'], freelas_per_week: 6 };
    expect(faltandoV2(muitos, '2026-10-08', ctx)).toEqual(['resposta da oferta do voucher']);
    expect(faltandoV2({ ...muitos, voucher_accepted: true }, '2026-10-08', ctx)).toEqual(['pedir o voucher ao gestor', 'abrir a vaga do voucher']);
  });

  it('separa os campos de cada versão (o PATCH recusa os da outra)', () => {
    const doServidor = { ...completo, freela_status: null, interest: null };
    expect(Object.keys(respostasV2De(doServidor))).not.toContain('freela_status');
    expect(Object.keys(respostasV1De(doServidor as never))).not.toContain('final_status');
  });
});
