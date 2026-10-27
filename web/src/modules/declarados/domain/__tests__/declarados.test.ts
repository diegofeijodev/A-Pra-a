import { describe, expect, it } from 'vitest';
import { relatorioSchema, textoDivergencia, textoPagamento } from '../declarados';

const linha = {
  id: 'a', consultant_id: 'c', consultant_name: 'Ana', praca_id: 'p', declared_day: '2026-10-26', declared_at: '2026-10-26T15:00:00.000Z',
  company_name: 'Bar 1', lead_id: 'l', visit_id: 'v', rule_version: 1, paid_by: 'declared', status: 'unmatched', over_cap: false,
  confirmed_by_other_consultant: false, void: null,
};
const totais = { declared: 5, confirmed: 1, pending_confirmation: 1, unmatched: 3, voided: 0, over_cap: 0, divergence_pct: 60 };

describe('declarados', () => {
  it('o fio do servidor passa pelo schema', () => {
    const r = relatorioSchema.parse({ from: 'a', to: 'b', source: 's', rows: [linha], totals: totais, by_consultant: [{ ...totais, consultant_id: 'c', name: 'Ana', praca_id: 'p' }], conta: ['x'] });
    expect(r.rows[0]?.company_name).toBe('Bar 1');
  });
  it('o texto de pagamento diz o que acontece com a declaração', () => {
    expect(textoPagamento({ paid_by: 'declared', status: 'unmatched', over_cap: false })).toBe('Paga ao representante pela declaração.');
    expect(textoPagamento({ paid_by: 'freela_confirmed', status: 'pending', over_cap: false })).toContain('só registrada'.replace('só', 'Só'));
    expect(textoPagamento({ paid_by: 'declared', status: 'unmatched', over_cap: true })).toContain('Acima do limite');
    expect(textoPagamento({ paid_by: 'declared', status: 'voided', over_cap: false })).toContain('Anulado');
  });
  it('a divergência escreve a divisão', () => {
    expect(textoDivergencia(totais)).toBe('3 sem correspondência ÷ 5 válidas = 60%');
    expect(textoDivergencia({ declared: 0, voided: 0, unmatched: 0, divergence_pct: 0 })).toBe('sem declarações válidas');
  });
});
