/**
 * Lote D da Lovable (contrato §39.8, §40.7): migrações aditivas — depois das do lote C, nesta ordem, sem DROP de índice parcial
 * nem de coluna, com os CHECKs; nenhum lead existente muda (colunas nulas; `kind` com o padrão de hoje).
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const ler = (n: string) => readFileSync(join(RAIZ, 'prisma/migrations', n, 'migration.sql'), 'utf8');
const D = ['20261101100000_lovable_l7_planos', '20261102100000_lovable_l8_shoppings', '20261103100000_lovable_l8_busca_sem_area'];
const PARCIAIS = [
  'field_journeys_one_open_per_consultant',
  'field_visits_one_open_per_consultant',
  'field_routes_one_active_per_day',
  'field_route_stops_lead_day_unique',
  'field_payouts_one_active_per_week',
  'field_journey_breaks_one_open_per_journey',
  'field_vouchers_one_coupon_per_contractor',
];

describe('migrações do lote D', () => {
  it('vêm logo depois das do lote C, nesta ordem', () => {
    const nomes = readdirSync(join(RAIZ, 'prisma/migrations')).filter((n) => /^\d{14}_/.test(n)).sort();
    const iC = nomes.indexOf('20261031100000_lovable_l6_cupons');
    expect(iC).toBeGreaterThanOrEqual(0);
    expect(nomes.slice(iC + 1, iC + 4)).toEqual(D);
  });
  it('aditivas: nenhum DROP (fora o NOT NULL relaxado da busca), nenhum índice parcial tocado', () => {
    for (const n of D) {
      const sql = ler(n)
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n');
      expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|COLUMN|CONSTRAINT)/i);
      for (const p of PARCIAIS) expect(sql).not.toContain(p);
    }
    expect(ler(D[2]!)).toContain('ALTER COLUMN "area_id" DROP NOT NULL');
  });
  it('CHECKs: kinds e modos dos planos, place_kind só shopping, kind da busca e lugares sempre com área', () => {
    expect(ler(D[0]!)).toContain(`CHECK ("kind" IN ('geral', 'shoppings', 'shopping_interno'))`);
    expect(ler(D[0]!)).toContain(`CHECK ("travel_mode" IN ('carro', 'a_pe'))`);
    expect(ler(D[0]!)).toContain(`CHECK ("modelo_tempo" IN ('lovable', 'roteiro'))`);
    expect(ler(D[1]!)).toContain(`CHECK ("place_kind" IS NULL OR "place_kind" IN ('shopping'))`);
    expect(ler(D[1]!)).toContain(`"kind" TEXT NOT NULL DEFAULT 'lugares'`);
    expect(ler(D[1]!)).toContain(`CHECK ("kind" IN ('lugares', 'shoppings', 'lojas'))`);
    expect(ler(D[2]!)).toContain(`CHECK ("kind" <> 'lugares' OR "area_id" IS NOT NULL)`);
  });
});
