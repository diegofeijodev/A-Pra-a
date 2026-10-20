import { describe, expect, it } from 'vitest';
import { routeViewSchema } from '../rota.schema';

const base = {
  id: 'r', consultant_id: 'c', consultant_name: 'Ana', praca_id: 'p', day: '2026-10-20', status: 'ativa', version: 1, source: 'equipe', area_id: null,
  start: { lat: 0, lng: 0 },
  params: { meta_diaria: 30, janela_inicio: '09:00', janela_fim: '18:00', almoco_inicio: '12:00', almoco_fim: '13:00', minutos_por_visita: 8, velocidade_kmh: 4.5, fator_desvio: 1.3, pool_fator: 1.5, dias_sem_revisitar: 14, estagio_maximo_rota: 4, gerar_ao_iniciar: false, consultor_pode_gerar: false },
  stops: [],
  plan: { planned: 0, reserve: 0, walk_km: 0, fits_meta: true, not_fit: 0 },
  progress: { meta: 30, done: 0, skipped: 0, deferred: 0, pending: 0, expected_now: 0, delta: 0 },
  generated_at: '', updated_at: '',
};

describe('routeViewSchema — modo de deslocamento (§30.4)', () => {
  it('resposta antiga (sem travel_mode) vale como a pé', () => {
    const r = routeViewSchema.parse(base);
    expect(r.travel_mode).toBe('a_pe');
    expect(r.travel).toBeUndefined();
  });
  it('aceita o modo carro com a conta', () => {
    const r = routeViewSchema.parse({ ...base, travel_mode: 'carro', travel: { mode: 'carro', speed_kmh: 25, detour_factor: 1.3, text: 'De carro: 25 km/h × desvio de rua 1,3 (média urbana, sem estacionar)' } });
    expect(r.travel?.speed_kmh).toBe(25);
  });
  it('recusa modo desconhecido', () => {
    expect(() => routeViewSchema.parse({ ...base, travel_mode: 'moto' })).toThrow();
  });
});
