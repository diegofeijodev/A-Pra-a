/**
 * Lote E da Lovable (contrato §41.5, §42.2): migrações aditivas — logo depois das do lote D, nesta ordem, sem DROP de índice
 * parcial nem de coluna; colunas nulas (ou com padrão false), nenhuma linha existente muda.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const ler = (n: string) => readFileSync(join(RAIZ, 'prisma/migrations', n, 'migration.sql'), 'utf8');
const E = ['20261104100000_lovable_l9_cadastro', '20261105100000_lovable_l10_gestor'];
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

describe('migrações do lote E', () => {
  it('vêm logo depois das do lote D, nesta ordem', () => {
    const nomes = readdirSync(join(RAIZ, 'prisma/migrations')).filter((n) => /^\d{14}_/.test(n)).sort();
    const iD = nomes.indexOf('20261103100000_lovable_l8_busca_sem_area');
    expect(iD).toBeGreaterThanOrEqual(0);
    expect(nomes.slice(iD + 1, iD + 3)).toEqual(E);
  });
  it('aditivas: nenhum DROP, nenhum índice parcial tocado, nenhum NOT NULL sem padrão', () => {
    for (const n of E) {
      const sql = semComentario(ler(n));
      expect(sql).not.toMatch(/DROP\s+(INDEX|TABLE|COLUMN|CONSTRAINT|NOT NULL)/i);
      for (const p of PARCIAIS) expect(sql).not.toContain(p);
      for (const linha of sql.split('\n').filter((l) => /NOT NULL/.test(l))) expect(linha).toMatch(/DEFAULT/);
    }
  });
  it('as colunas e os CHECKs do contrato', () => {
    const l9 = ler(E[0]!);
    expect(l9).toContain('ALTER TABLE "app_settings" ADD COLUMN "password_policy" JSONB;');
    for (const c of ['address_cep', 'address_street', 'address_number', 'address_complement', 'address_district', 'address_city', 'address_state', 'bank_name', 'bank_branch', 'bank_account', 'bank_account_type']) {
      expect(l9).toContain(`ADD COLUMN "${c}" TEXT`);
    }
    expect(l9).toContain(`CHECK ("bank_account_type" IS NULL OR "bank_account_type" IN ('corrente', 'poupanca', 'pagamento'))`);
    expect(l9).toContain(`CHECK ("contact_email" IS NULL OR char_length("contact_email") <= 120)`);
    expect(ler(E[1]!)).toContain('ADD COLUMN "is_gestor" BOOLEAN NOT NULL DEFAULT false');
  });
});
