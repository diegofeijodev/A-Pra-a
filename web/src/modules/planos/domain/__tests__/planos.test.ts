import { describe, expect, it } from 'vitest';
import { diaCurto, featuresLoteDSchema, formatarDuracao, planViewSchema, rotuloGeracao, semanasDoMes, textoCriterio, textoPublicada } from '../planos';

const plano = {
  id: 'p1', praca_id: 'pr', area_id: null, area_name: null, kind: 'geral' as const, parent_lead_id: null, travel_mode: 'a_pe' as const,
  modelo_tempo: 'lovable' as const, item_count: 14, assigned_count: 3, lead_count: 412, truncated: false,
  created_at: '2026-10-22T17:10:00.000Z', created_by: 'u', archived_at: null,
};

describe('planos — wire (§39) e textos (UX §3.4)', () => {
  it('features ausentes (servidor antigo) = desligadas', () => {
    expect(featuresLoteDSchema.parse({})).toEqual({ route_plans: false, malls: false });
  });
  it('geração salva: data de Brasília · modo · rotas · publicadas', () => {
    expect(rotuloGeracao(plano)).toBe('22/10 14h10 · a pé · 14 rotas · 3 publicadas');
    expect(rotuloGeracao({ ...plano, item_count: 1, assigned_count: 0, travel_mode: 'carro' })).toBe('22/10 14h10 · carro/moto · 1 rota');
  });
  it('dia curto, duração e o toast da publicação', () => {
    expect(diaCurto('2026-10-23')).toBe('sex 23/10');
    expect(formatarDuracao(381)).toBe('6h21');
    expect(formatarDuracao(45)).toBe('45 min');
    expect(textoPublicada('Rota 01', 'Ana', '2026-10-23')).toBe('Rota 01 publicada para Ana em sex 23/10. Ela vê na tela Hoje nesse dia.');
  });
  it('o ⓘ descreve o critério que vale (padrão: área) e diz que a marcação à mão vale mais; sem "voucher"/"status"', () => {
    const t = textoCriterio({ criterio: 'area', area_min_m2: 20000, lojas_min: 50, raio_lojas_m: 300, fora_da_rota_geral: true });
    expect(t).toContain('pelo menos 20.000 m² de área');
    expect(t).toContain('a marcação vale mais que o critério');
    expect(t.toLowerCase()).not.toMatch(/voucher|status|check-in|checkout/);
  });
  it('calendário: semanas de domingo a sábado com o mês inteiro', () => {
    const s = semanasDoMes(2026, 10);
    expect(s[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(s.flat().filter(Boolean)).toHaveLength(31);
    expect(s.every((w) => w.length === 7)).toBe(true);
  });
  it('a visão do plano aceita item sem publicação e campo aditivo do servidor', () => {
    const v = planViewSchema.parse({
      ...plano, params: {}, extra: 1,
      items: [{ id: 'i1', seq: 1, name: 'Rota 01', color: '#2563eb', lead_ids: ['l1'], distance_m: 0, est_minutes: 80, stops: [], bairro_principal: null,
        do_centro_m: null, conta_lovable: { minutos: 80, texto: 'x' }, conta_roteiro: { minutos: 8, texto: 'y', coube: true, fora: 0 }, assigned: null }],
    });
    expect(v.items[0]!.assigned).toBeNull();
  });
});
