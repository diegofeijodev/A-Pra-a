import { describe, expect, it } from 'vitest';
import { alternarFixa, mover, mudou, pendentesParaOrdenar, resumoDaMeta, rotuloAndamento, rotuloParadaVisitada } from '../ordem';
import type { StopView } from '../rota.schema';

const s = (n: number, over: Partial<StopView> = {}): StopView => ({
  id: `s${n}`, route_id: 'r', lead_id: `l${n}`, seq: n, kind: 'planejada', status: 'pendente', fixa: false, eta: null, eta_min: null,
  planned_minutes: 8, distance_m: 0, name: `B${n}`, address: '', phone: '', lat: 0, lng: 0, skip_reason: null, skip_note: null,
  deferred_to: null, visit_id: null, ...over,
});

describe('ordem editável pela equipe', () => {
  it('só as pendentes, na ordem do seq', () => {
    const l = pendentesParaOrdenar([s(3), s(1, { status: 'visitada' }), s(2, { fixa: true }), s(4, { status: 'pulada' })]);
    expect(l).toEqual([{ id: 's2', fixa: true }, { id: 's3', fixa: false }]);
  });
  it('mover troca com a vizinha e respeita os limites', () => {
    const l = pendentesParaOrdenar([s(1), s(2), s(3)]);
    expect(mover(l, 1, -1).map((i) => i.id)).toEqual(['s2', 's1', 's3']);
    expect(mover(l, 1, 1).map((i) => i.id)).toEqual(['s1', 's3', 's2']);
    expect(mover(l, 0, -1)).toBe(l);
    expect(mover(l, 2, 1)).toBe(l);
  });
  it('fixar alterna só a escolhida; mudou compara ordem e fixa', () => {
    const l = pendentesParaOrdenar([s(1), s(2)]);
    const f = alternarFixa(l, 's2');
    expect(f).toEqual([{ id: 's1', fixa: false }, { id: 's2', fixa: true }]);
    expect(mudou(l, l)).toBe(false);
    expect(mudou(l, f)).toBe(true);
    expect(mudou(l, mover(l, 0, 1))).toBe(true);
  });
  it('resumo da meta com a conta', () => {
    expect(resumoDaMeta({ planned: 28, reserve: 2, fits_meta: false, not_fit: 0 }, 30, 0)).toBe(
      '28 paradas planejadas, faltam 2 para a meta de 30. Rode uma busca na área ou aceite 28.',
    );
    expect(resumoDaMeta({ planned: 18, reserve: 3, fits_meta: true, not_fit: 0 }, 30, 12)).toBe('30 paradas planejadas (meta 30); 3 de reserva.');
  });
});

describe('parada visitada na rota da equipe (o número diz o que é)', () => {
  it('o horário é o PREVISTO, não o da chegada: nunca "feita · 09h00"', () => {
    expect(rotuloParadaVisitada('09:00')).toBe('chegada registrada · prevista para 09h00');
    expect(rotuloParadaVisitada(null)).toBe('chegada registrada');
    expect(rotuloParadaVisitada('09:00')).not.toMatch(/feita/);
  });
  it('o andamento conta paradas com chegada (a visita aberta entra), não visitas concluídas', () => {
    expect(rotuloAndamento({ done: 1, meta: 30 })).toBe('1 de 30 paradas com chegada registrada');
  });
});
