import { classificarRetorno, compararRetornos, retornosPendentes, retornoRoteirizavel, retornoVencido, type VisitaComRetorno } from '../followup-rules';

const HOJE = '2026-10-20';
const d = (s: string) => new Date(`${s}T15:00:00Z`);
const v = (over: Partial<VisitaComRetorno> = {}): VisitaComRetorno => ({
  id: 'v1',
  lead_id: 'l1',
  checkin_at: d('2026-10-15'),
  checkout_at: d('2026-10-15'),
  needs_followup: true,
  followup_date: '2026-10-19',
  ...over,
});

describe('retornoVencido', () => {
  it('exige checkout real, pedido de retorno, data preenchida e data <= hoje', () => {
    expect(retornoVencido(v(), HOJE)).toBe(true);
    expect(retornoVencido(v({ followup_date: HOJE }), HOJE)).toBe(true);
    expect(retornoVencido(v({ followup_date: '2026-10-21' }), HOJE)).toBe(false);
    expect(retornoVencido(v({ checkout_at: null }), HOJE)).toBe(false);
    expect(retornoVencido(v({ needs_followup: false }), HOJE)).toBe(false);
    expect(retornoVencido(v({ needs_followup: null }), HOJE)).toBe(false);
    expect(retornoVencido(v({ followup_date: null }), HOJE)).toBe(false);
  });
});

describe('retornosPendentes', () => {
  it('visita posterior ao lead (de qualquer consultor) resolve o retorno', () => {
    const maisRecente = new Map([['l1', d('2026-10-18')]]);
    expect(retornosPendentes([v()], maisRecente, HOJE)).toEqual([]);
  });

  it('a própria visita como mais recente mantém o retorno pendente', () => {
    const maisRecente = new Map([['l1', d('2026-10-15')]]);
    expect(retornosPendentes([v()], maisRecente, HOJE)).toHaveLength(1);
  });

  it('duas candidatas do mesmo lead: fica só a mais recente', () => {
    const velha = v({ id: 'a', checkin_at: d('2026-10-10'), followup_date: '2026-10-12' });
    const nova = v({ id: 'b', checkin_at: d('2026-10-15') });
    const r = retornosPendentes([velha, nova], new Map([['l1', d('2026-10-15')]]), HOJE);
    expect(r.map((x) => x.id)).toEqual(['b']);
  });

  it('sem mais recente conhecida, vale a candidata; futuro e sem checkout ficam de fora', () => {
    const futuro = v({ id: 'f', lead_id: 'l2', followup_date: '2026-11-01' });
    const aberto = v({ id: 'o', lead_id: 'l3', checkout_at: null });
    expect(retornosPendentes([v(), futuro, aberto], new Map(), HOJE).map((x) => x.id)).toEqual(['v1']);
  });
});

describe('classificarRetorno e ordem', () => {
  it('hoje x atrasado com os dias de atraso', () => {
    expect(classificarRetorno(HOJE, HOJE)).toEqual({ due: 'hoje', days_late: 0 });
    expect(classificarRetorno('2026-10-17', HOJE)).toEqual({ due: 'atrasado', days_late: 3 });
    expect(classificarRetorno('2026-09-30', HOJE)).toEqual({ due: 'atrasado', days_late: 20 });
  });

  it('data mais antiga primeiro, depois nome', () => {
    const itens = [
      { followup_date: HOJE, lead_name: 'Bar', visit_id: '1' },
      { followup_date: '2026-10-10', lead_name: 'Zé', visit_id: '2' },
      { followup_date: HOJE, lead_name: 'Árvore', visit_id: '3' },
    ];
    expect(itens.sort(compararRetornos).map((i) => i.visit_id)).toEqual(['2', '3', '1']);
  });
});

describe('retornoRoteirizavel', () => {
  it('precisa de coordenada; precisão confiável OU check-in no local', () => {
    expect(retornoRoteirizavel({ lat: null, lng: null, location_precision: 'point' }, false)).toBe(false);
    expect(retornoRoteirizavel({ lat: -23.6, lng: -46.6, location_precision: 'point' }, true)).toBe(true);
    expect(retornoRoteirizavel({ lat: -23.6, lng: -46.6, location_precision: 'address' }, true)).toBe(true);
    expect(retornoRoteirizavel({ lat: -23.6, lng: -46.6, location_precision: null }, false)).toBe(true);
    expect(retornoRoteirizavel({ lat: -23.6, lng: -46.6, location_precision: 'city' }, true)).toBe(false);
  });
});
