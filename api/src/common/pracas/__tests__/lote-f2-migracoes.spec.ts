/**
 * Lote F2 da Lovable (contrato §44.2): migração aditiva logo depois das do lote F1. Junção das praças extras e a praça da
 * jornada (nula = principal; FK Restrict, nunca SET NULL). Nenhum índice parcial tocado, nenhuma linha muda.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const NOME = '20261108100000_lovable_l12_varias_pracas';
const ler = () => readFileSync(join(RAIZ, 'prisma/migrations', NOME, 'migration.sql'), 'utf8');
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

describe('migração do lote F2 (L12)', () => {
  it('vem logo depois da do L13', () => {
    const nomes = readdirSync(join(RAIZ, 'prisma/migrations')).filter((n) => /^\d{14}_/.test(n)).sort();
    const i = nomes.indexOf('20261107100000_lovable_l13_regra_consultor');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(nomes[i + 1]).toBe(NOME);
  });
  it('só acréscimos: nada apagado, nenhuma linha mexida, nenhum índice parcial', () => {
    const sql = semComentario(ler());
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\s/im);
    for (const p of PARCIAIS) expect(sql).not.toContain(p);
    for (const linha of sql.split('\n').filter((l) => /NOT NULL/.test(l) && /ADD COLUMN/.test(l))) expect(linha).toMatch(/DEFAULT/);
  });
  it('a praça da jornada é nula, indexada e Restrict (nunca SET NULL)', () => {
    const sql = ler();
    expect(sql).toContain('ALTER TABLE "field_journeys" ADD COLUMN     "praca_id" UUID;');
    expect(sql).toContain('"field_journeys"("praca_id", "day")');
    expect(sql).toMatch(/"field_journeys_praca_id_fkey" FOREIGN KEY \("praca_id"\) REFERENCES "pracas"\("id"\) ON DELETE RESTRICT/);
    expect(semComentario(sql)).not.toMatch(/SET NULL/);
  });
  it('a junção: PK (consultor, praça), consultor Cascade, praça e autor Restrict', () => {
    const sql = ler();
    expect(sql).toContain('PRIMARY KEY ("consultant_id","praca_id")');
    expect(sql).toMatch(/"field_consultant_pracas_consultant_id_fkey" .* ON DELETE CASCADE/);
    expect(sql).toMatch(/"field_consultant_pracas_praca_id_fkey" .* ON DELETE RESTRICT/);
    expect(sql).toMatch(/"field_consultant_pracas_created_by_fkey" .* REFERENCES "users"\("id"\) ON DELETE RESTRICT/);
  });
});
