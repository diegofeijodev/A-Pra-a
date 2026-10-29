import { readFileSync } from 'fs';
import { join } from 'path';

// Lê o SQL da migração como texto: ela é aditiva e NÃO pode derrubar os índices
// parciais que o Prisma não conhece (CLAUDE.md).
const sql = readFileSync(
  join(__dirname, '../../../../prisma/migrations/20261109100000_crm_automatico/migration.sql'),
  'utf8',
);

describe('migração 20261109100000_crm_automatico', () => {
  it('acrescenta as colunas do lead', () => {
    expect(sql).toMatch(/ADD COLUMN\s+"freela_user_id"/);
    expect(sql).toMatch(/ADD COLUMN\s+"auto_stage_applied"/);
    expect(sql).toMatch(/ADD COLUMN\s+"freela_hirings"/);
  });

  it('cria a chave única dos eventos e a tabela de rodadas', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "lead_events_auto_key_key"');
    expect(sql).toContain('CREATE TABLE "crm_automation_runs"');
  });

  it('não derruba nada (índices parciais ficam)', () => {
    expect(sql).not.toContain('DROP');
  });
});
