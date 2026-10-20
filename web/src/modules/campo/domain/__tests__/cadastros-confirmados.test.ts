import { describe, expect, it } from 'vitest';
import { textoCadastrosConfirmados } from '../cadastros-confirmados';

describe('textoCadastrosConfirmados', () => {
  it('título com singular/plural e a conta com a fonte', () => {
    const t = textoCadastrosConfirmados({ today: 1, week: 4, rule: 'activated', source: 'Freela' });
    expect(t.titulo).toBe('1 confirmado hoje · 4 na semana');
    expect(t.conta).toContain('primeiro acesso');
    expect(t.conta).toContain('Fonte: Freela');
  });
  it('zero e regra de primeira vaga', () => {
    const t = textoCadastrosConfirmados({ today: 0, week: 0, rule: 'first_vacancy', source: 'x' });
    expect(t.titulo).toBe('0 confirmados hoje · 0 na semana');
    expect(t.conta).toContain('primeira vaga');
  });
});
