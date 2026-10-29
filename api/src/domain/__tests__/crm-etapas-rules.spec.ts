import { alvoDoCadastro, candidatoSemResposta, deveAplicar } from '../crm-etapas-rules';

const lead = (o: Partial<Parameters<typeof deveAplicar>[0]> = {}) => ({
  stage: 3, stage_since: '2026-10-01', archived: false, is_test: false, auto_stage_applied: null, ...o,
});

describe('deveAplicar', () => {
  it('etapa 3 → 5 com marca nula aplica', () => expect(deveAplicar(lead(), 5, '2026-10-10')).toBe('aplicar'));
  it('etapa 5 com alvo 5 já satisfeito', () => expect(deveAplicar(lead({ stage: 5 }), 5, '2026-10-10')).toBe('ja_satisfeito'));
  it('marca 5, alvo 5, lead em 3 (alguém voltou) ignora', () =>
    expect(deveAplicar(lead({ auto_stage_applied: 5 }), 5, '2026-10-10')).toBe('ignorar'));
  it('marca 5, alvo 6, lead em 3 aplica', () => expect(deveAplicar(lead({ auto_stage_applied: 5 }), 6, '2026-10-10')).toBe('aplicar'));
  it('etapa 8: fato antes de entrar em Perdido ignora; no mesmo dia aplica', () => {
    const l = lead({ stage: 8, stage_since: '2026-10-20' });
    expect(deveAplicar(l, 5, '2026-10-19')).toBe('ignorar');
    expect(deveAplicar(l, 5, '2026-10-20')).toBe('aplicar');
  });
  it('etapa 8 com marca já cobrindo o alvo ignora', () =>
    expect(deveAplicar(lead({ stage: 8, stage_since: '2026-10-20', auto_stage_applied: 5 }), 5, '2026-10-21')).toBe('ignorar'));
  it('arquivado ou teste ignora', () => {
    expect(deveAplicar(lead({ archived: true }), 5, '2026-10-10')).toBe('ignorar');
    expect(deveAplicar(lead({ is_test: true }), 5, '2026-10-10')).toBe('ignorar');
  });
  it('etapa 7 com alvo 6 já satisfeito', () => expect(deveAplicar(lead({ stage: 7 }), 6, '2026-10-10')).toBe('ja_satisfeito'));
});

describe('alvoDoCadastro', () => {
  const d = new Date('2026-10-10T12:00:00Z');
  it('serviço concluído vence', () =>
    expect(alvoDoCadastro({ confirmado_em: d, first_job_completed_at: d })).toEqual({ alvo: 6, fato: d, motivo: 'servico' }));
  it('só confirmado dá 5', () =>
    expect(alvoDoCadastro({ confirmado_em: d, first_job_completed_at: null })).toEqual({ alvo: 5, fato: d, motivo: 'cadastro' }));
  it('nenhum dá null', () => expect(alvoDoCadastro({ confirmado_em: null, first_job_completed_at: null })).toBeNull());
});

describe('candidatoSemResposta', () => {
  const base = {
    stage: 2, stage_since: '2026-10-01', archived: false, is_test: false, snooze_until: null, next_step_date: null, stalled_days: 21, em_cadencia: false,
  };
  const hoje = '2026-10-28';
  it('21 dias na etapa 2 é candidato; 20 não', () => {
    expect(candidatoSemResposta(base, hoje)).toBe(true);
    expect(candidatoSemResposta({ ...base, stalled_days: 20 }, hoje)).toBe(false);
  });
  it('arquitetura final, achado 2: movido para a etapa 2 ontem, com o último contato há 40 dias, NÃO é candidato', () =>
    expect(candidatoSemResposta({ ...base, stage_since: '2026-10-27', stalled_days: 40 }, hoje)).toBe(false));
  it('21 dias ou mais NA etapa 2 e 21 ou mais sem contato é candidato; 20 dias na etapa não', () => {
    expect(candidatoSemResposta({ ...base, stage_since: '2026-10-07', stalled_days: 21 }, hoje)).toBe(true);
    expect(candidatoSemResposta({ ...base, stage_since: '2026-09-01', stalled_days: 40 }, hoje)).toBe(true);
    expect(candidatoSemResposta({ ...base, stage_since: '2026-10-08', stalled_days: 21 }, hoje)).toBe(false);
  });
  it('etapa 1 (nunca contatado) não é candidato', () => expect(candidatoSemResposta({ ...base, stage: 1 }, hoje)).toBe(false));
  it('etapa 3 não é candidato', () => expect(candidatoSemResposta({ ...base, stage: 3 }, hoje)).toBe(false));
  it('em cadência não é candidato', () => expect(candidatoSemResposta({ ...base, em_cadencia: true }, hoje)).toBe(false));
  it('arquivado não é candidato', () => expect(candidatoSemResposta({ ...base, archived: true }, hoje)).toBe(false));
  it('teste não é candidato', () => expect(candidatoSemResposta({ ...base, is_test: true }, hoje)).toBe(false));
  it('adiado até hoje já venceu (só adiamento estritamente futuro exclui)', () =>
    expect(candidatoSemResposta({ ...base, snooze_until: hoje }, hoje)).toBe(true));
  it('adiado ou próximo passo de hoje em diante não', () => {
    expect(candidatoSemResposta({ ...base, snooze_until: '2026-10-29' }, hoje)).toBe(false);
    expect(candidatoSemResposta({ ...base, next_step_date: '2026-10-28' }, hoje)).toBe(false);
    expect(candidatoSemResposta({ ...base, next_step_date: '2026-10-27' }, hoje)).toBe(true);
  });
});
