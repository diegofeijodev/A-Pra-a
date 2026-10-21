import { describe, expect, it } from 'vitest';
import { rotuloVersao, versaoSchema, type VersaoRegra } from '../remuneracao';

const BASE = { reason: 'Padrão inicial', created_by: 'sistema', config: {} } as unknown as VersaoRegra;

describe('rótulo da versão da regra (item 15, contrato §28.5)', () => {
  it('versão inicial: "padrão inicial (vale desde o começo; instalada em dd/mm/aaaa)" em Brasília e nunca "Por sistema"', () => {
    // 23/10 às 01:30 de Brasília = 04:30 UTC: a data mostrada é a de Brasília.
    const v = { ...BASE, version: 1, valid_from: '1970-01-01', created_at: '2026-10-23T04:30:00.000Z', is_initial: true, installed_at: '2026-10-23T04:30:00.000Z' };
    const r = rotuloVersao(v);
    expect(r.titulo).toBe('Versão 1 · padrão inicial (vale desde o começo; instalada em 23/10/2026)');
    expect(r.autoria).not.toMatch(/sistema/i);
    expect(r.titulo).not.toMatch(/1970/);
  });

  it('servidor antigo (sem is_initial): a sentinela 1970-01-01 também vira "padrão inicial"', () => {
    const r = rotuloVersao({ ...BASE, version: 1, valid_from: '1970-01-01', created_at: '2026-10-22T23:59:00.000Z' });
    expect(r.titulo).toBe('Versão 1 · padrão inicial (vale desde o começo; instalada em 22/10/2026)');
  });

  it('versão nova: data de início e autoria como antes', () => {
    const r = rotuloVersao({ ...BASE, version: 3, valid_from: '2026-11-02', created_by: 'Diego', reason: 'Novo valor', created_at: '2026-10-27T13:00:00.000Z', is_initial: false });
    expect(r.titulo).toBe('Versão 3 · vale desde 02/11/2026');
    expect(r.autoria).toBe('Por Diego · Novo valor');
  });

  it('o schema aceita os campos novos e também a resposta antiga sem eles', () => {
    const antigo = { version: 1, valid_from: '1970-01-01', reason: null, created_by: null, created_at: '2026-10-23T00:00:00.000Z', config: { unit_cents: 1000, tiers_period: 'day', tiers: [], combine: 'max', cap_cents: null, floor_cents: 0, floor_condition: 'none', floor_min_visits: 0, visits_count: 'checkin', week_start_weekday: 1, payout_weekday: 1, autoclose_hour: 6, late_grace_days: 14 } };
    expect(versaoSchema.parse(antigo).is_initial).toBeUndefined();
    expect(versaoSchema.parse({ ...antigo, is_initial: true, installed_at: antigo.created_at }).is_initial).toBe(true);
  });
});
