import {
  acimaDoLimite,
  classificarDeclaracao,
  contagensVazias,
  deveAlertarDivergencia,
  pctDivergencia,
  somar,
  textoDivergencia,
} from '../declared-rules';

const C1 = 'c1';
const C2 = 'c2';

describe('classificarDeclaracao (pareamento pelo lead)', () => {
  it('anulada vence tudo', () => {
    expect(classificarDeclaracao({ anulada: true, consultant_id: C1, cadastros: [{ consultant_id: C1, confirmado: true }] }).status).toBe('voided');
  });
  it('confirmada pelo Freela para o mesmo consultor', () => {
    expect(classificarDeclaracao({ anulada: false, consultant_id: C1, cadastros: [{ consultant_id: C1, confirmado: true }] })).toEqual({ status: 'confirmed', por_outro: false });
  });
  it('ligada mas sem o evento da regra = pendente', () => {
    expect(classificarDeclaracao({ anulada: false, consultant_id: C1, cadastros: [{ consultant_id: C1, confirmado: false }] }).status).toBe('pending');
  });
  it('sem cadastro ligado ao lead = sem correspondência', () => {
    expect(classificarDeclaracao({ anulada: false, consultant_id: C1, cadastros: [] })).toEqual({ status: 'unmatched', por_outro: false });
  });
  it('cadastro do lead feito por OUTRO consultor = sem correspondência para quem declarou, marcado "por outro"', () => {
    expect(classificarDeclaracao({ anulada: false, consultant_id: C1, cadastros: [{ consultant_id: C2, confirmado: true }] })).toEqual({ status: 'unmatched', por_outro: true });
  });
});

describe('acimaDoLimite', () => {
  const d = (id: string, hora: number, o: Partial<{ c: string; dia: string; anulada: boolean }> = {}) => ({
    id,
    consultant_id: o.c ?? C1,
    declared_day: o.dia ?? '2026-10-20',
    declared_at: new Date(2026, 9, 20, hora),
    anulada: o.anulada ?? false,
  });
  it('as primeiras entram, as demais ficam acima; por consultor e dia', () => {
    const r = acimaDoLimite([d('a', 9), d('b', 10), d('c', 11), d('x', 9, { c: C2 })], () => 2);
    expect([...r]).toEqual(['c']);
  });
  it('anulada não ocupa vaga do limite', () => {
    const r = acimaDoLimite([d('a', 9, { anulada: true }), d('b', 10), d('c', 11)], () => 2);
    expect(r.size).toBe(0);
  });
  it('sem limite (null) ninguém fica acima; o limite vem do dia', () => {
    expect(acimaDoLimite([d('a', 9), d('b', 10)], () => null).size).toBe(0);
    const r = acimaDoLimite([d('a', 9, { dia: '2026-10-20' }), d('b', 10, { dia: '2026-10-20' }), d('c', 9, { dia: '2026-10-21' }), d('e', 10, { dia: '2026-10-21' })], (dia) => (dia === '2026-10-20' ? 1 : null));
    expect([...r]).toEqual(['b']);
  });
});

describe('divergência e alerta', () => {
  it('conta escrita e porcentagem inteira para baixo', () => {
    const c = contagensVazias();
    for (let i = 0; i < 7; i++) somar(c, 'unmatched', false);
    for (let i = 0; i < 3; i++) somar(c, 'confirmed', false);
    somar(c, 'voided', false);
    expect(pctDivergencia(c)).toBe(70); // 7 ÷ (11 − 1)
  });
  it('alerta exige os DOIS limites', () => {
    const cfg = { divergencia_alerta_min: 5, divergencia_alerta_pct: 40 };
    expect(deveAlertarDivergencia({ declared: 10, voided: 0, unmatched: 4 }, cfg)).toBe(false); // < 5
    expect(deveAlertarDivergencia({ declared: 20, voided: 0, unmatched: 6 }, cfg)).toBe(false); // 30% < 40%
    expect(deveAlertarDivergencia({ declared: 10, voided: 0, unmatched: 5 }, cfg)).toBe(true); // 50%
    expect(textoDivergencia({ declared: 10, voided: 2, unmatched: 4 })).toContain('4 sem correspondência no Freela ÷ 8 declarações válidas (10 declaradas − 2 anuladas) = 50%');
  });
});
