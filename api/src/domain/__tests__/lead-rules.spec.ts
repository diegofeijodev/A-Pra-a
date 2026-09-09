import {
  daysSince,
  estValue,
  isCritical,
  isStalled,
  lastContactDate,
  stalledDays,
  type LeadRules,
} from '../lead-rules';
import { addDays } from '../../common/time/dates';

// Dia de referência fixo: as funções aceitam "hoje" por parâmetro justamente
// para o teste não depender do relógio da máquina.
const HOJE = '2026-09-09';

const lead = (over: Partial<LeadRules> = {}): LeadRules => ({
  stage: 3,
  stage_since: HOJE,
  archived: false,
  classe: 'alvo',
  last_contact_at: null,
  events: [],
  ...over,
});

describe('lastContactDate', () => {
  it('pega o contato mais recente e ignora mudança de etapa e nota', () => {
    const l = lead({
      events: [
        { at: '2026-09-01T12:00:00.000Z', kind: 'msg_out' },
        { at: '2026-09-05T12:00:00.000Z', kind: 'call' },
        { at: '2026-09-08T12:00:00.000Z', kind: 'stage' },
        { at: '2026-09-08T13:00:00.000Z', kind: 'note' },
      ],
    });
    expect(lastContactDate(l)).toBe('2026-09-05');
  });

  it('cai para last_contact_at quando não há evento de contato', () => {
    const l = lead({
      last_contact_at: '2026-09-03T12:00:00.000Z',
      events: [{ at: '2026-09-08T12:00:00.000Z', kind: 'note' }],
    });
    expect(lastContactDate(l)).toBe('2026-09-03');
  });

  it('devolve undefined quando não há contato nenhum', () => {
    expect(lastContactDate(lead())).toBeUndefined();
  });

  it('usa o dia de Brasília, não o dia UTC do instante', () => {
    // 10/09 02:00 UTC = 09/09 23:00 em Brasília — o dia é 09, não 10.
    const l = lead({ events: [{ at: '2026-09-10T02:00:00.000Z', kind: 'visit' }] });
    expect(lastContactDate(l)).toBe('2026-09-09');
  });
});

describe('daysSince', () => {
  it('sem data = 999 (o "nunca" do protótipo)', () => {
    expect(daysSince(undefined, HOJE)).toBe(999);
    expect(daysSince(null, HOJE)).toBe(999);
  });

  it('conta os dias corridos até hoje', () => {
    expect(daysSince(HOJE, HOJE)).toBe(0);
    expect(daysSince('2026-09-02', HOJE)).toBe(7);
  });

  it('data no futuro não vira número negativo', () => {
    expect(daysSince('2026-09-20', HOJE)).toBe(0);
  });

  it('aceita instante ISO e o converte para o dia de Brasília', () => {
    expect(daysSince('2026-09-02T23:30:00.000Z', HOJE)).toBe(7);
  });
});

describe('stalledDays', () => {
  it('sem contato registrado, cai para a entrada na etapa', () => {
    const l = lead({ stage_since: addDays(HOJE, -9) });
    expect(stalledDays(l, HOJE)).toBe(9);
  });

  it('com contato, conta do último contato (não do stage_since)', () => {
    const l = lead({
      stage_since: addDays(HOJE, -30),
      events: [{ at: `${addDays(HOJE, -2)}T14:30:00.000Z`, kind: 'msg_out' }],
    });
    expect(stalledDays(l, HOJE)).toBe(2);
  });
});

describe('isStalled / isCritical', () => {
  const parado = (dias: number, over: Partial<LeadRules> = {}) =>
    lead({ stage_since: addDays(HOJE, -dias), ...over });

  it('parado é mais de 7 dias — 7 ainda não conta', () => {
    expect(isStalled(parado(7), HOJE)).toBe(false);
    expect(isStalled(parado(8), HOJE)).toBe(true);
  });

  it('crítico é mais de 15 dias — 15 ainda não conta', () => {
    expect(isCritical(parado(15), HOJE)).toBe(false);
    expect(isCritical(parado(16), HOJE)).toBe(true);
  });

  it('crítico também é parado', () => {
    expect(isStalled(parado(16), HOJE)).toBe(true);
  });

  it('arquivado e perdido (etapa 8) nunca contam', () => {
    expect(isStalled(parado(40, { archived: true }), HOJE)).toBe(false);
    expect(isCritical(parado(40, { archived: true }), HOJE)).toBe(false);
    expect(isStalled(parado(40, { stage: 8 }), HOJE)).toBe(false);
    expect(isCritical(parado(40, { stage: 8 }), HOJE)).toBe(false);
  });
});

describe('estValue', () => {
  it('vale o que a classe do lead vale', () => {
    expect(estValue('grande')).toBe(4500);
    expect(estValue('alvo')).toBe(2200);
    expect(estValue('depois')).toBe(900);
  });

  it('classe fora do catálogo vale o piso (900), como no protótipo', () => {
    expect(estValue('inventada')).toBe(900);
  });
});
