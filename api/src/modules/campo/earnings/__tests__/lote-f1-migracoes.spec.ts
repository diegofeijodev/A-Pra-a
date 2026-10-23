/**
 * Lote F1 da Lovable (contrato §43.3, §45.3): migrações aditivas — logo depois das do lote E, nesta ordem. A do L11 só
 * alarga três CHECKs do razão (DROP e ADD da MESMA constraint, o conjunto antigo contido no novo); a do L13 só acrescenta
 * coluna nula, índice e FK. Nenhum índice parcial tocado, nenhum trigger mexido, nenhuma linha muda.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..', '..', '..');
const ler = (n: string) => readFileSync(join(RAIZ, 'prisma/migrations', n, 'migration.sql'), 'utf8');
const F1 = ['20261106100000_lovable_l11_mensal', '20261107100000_lovable_l13_regra_consultor'];
const PARCIAIS = [
  'field_journeys_one_open_per_consultant',
  'field_visits_one_open_per_consultant',
  'field_routes_one_active_per_day',
  'field_route_stops_lead_day_unique',
  'field_payouts_one_active_per_week',
  'field_journey_breaks_one_open_per_journey',
  'field_vouchers_one_coupon_per_contractor',
];
const semComentario = (sql: string) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

describe('migrações do lote F1', () => {
  it('vêm logo depois das do lote E, nesta ordem', () => {
    const nomes = readdirSync(join(RAIZ, 'prisma/migrations')).filter((n) => /^\d{14}_/.test(n)).sort();
    const iE = nomes.indexOf('20261105100000_lovable_l10_gestor');
    expect(iE).toBeGreaterThanOrEqual(0);
    expect(nomes.slice(iE + 1, iE + 3)).toEqual(F1);
  });
  it('nenhum índice parcial, trigger, tabela ou coluna apagados; NOT NULL só com padrão', () => {
    for (const n of F1) {
      const sql = semComentario(ler(n));
      expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|COLUMN|NOT NULL|TRIGGER|FUNCTION)/i);
      expect(sql).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\s/im);
      for (const p of PARCIAIS) expect(sql).not.toContain(p);
      for (const linha of sql.split('\n').filter((l) => /NOT NULL/.test(l) && /ADD COLUMN/.test(l))) expect(linha).toMatch(/DEFAULT/);
    }
  });
  it('L11: só as três constraints do escopo saem, e voltam com o conjunto antigo contido no novo', () => {
    const sql = semComentario(ler(F1[0]!));
    const drops = [...sql.matchAll(/DROP CONSTRAINT "([^"]+)"/g)].map((m) => m[1]);
    expect(drops.sort()).toEqual(['field_earnings_ledger_day_check', 'field_earnings_ledger_scope_check', 'field_earnings_ledger_scope_kind_check']);
    expect(sql).toContain(`CHECK ("work_scope" IN ('day', 'week', 'month', 'manual'))`);
    expect(sql).toContain(`CHECK (("kind" = 'accrual') = ("work_scope" IN ('day', 'week', 'month')))`);
    expect(sql).toContain(`CHECK (("work_scope" IN ('day', 'month')) = ("work_day" IS NOT NULL))`);
    expect(sql).toContain(`CHECK ("work_scope" <> 'month' OR "work_day" ~ '^[0-9]{4}-[0-9]{2}-01$')`);
  });
  it('L13: coluna nula, índice e FK Restrict', () => {
    const sql = ler(F1[1]!);
    expect(sql).toContain('ALTER TABLE "field_pay_rule_versions" ADD COLUMN "consultant_id" UUID;');
    expect(sql).toContain('"field_pay_rule_versions"("consultant_id", "valid_from", "version")');
    expect(sql).toContain('REFERENCES "field_consultants"("id") ON DELETE RESTRICT');
  });
});
