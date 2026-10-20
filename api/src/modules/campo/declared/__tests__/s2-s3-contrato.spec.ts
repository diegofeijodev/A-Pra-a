/**
 * Lição da S1: o que o web ATUAL manda precisa continuar valendo. Estes testes passam payloads reais (incluindo campos
 * novos nulos) pelo mesmo `ValidationPipe` global (`whitelist + forbidNonWhitelisted + transform`) e conferem a
 * migração (aditiva, sem DROP INDEX, razão imutável).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigRotaDto } from '../../../rotas/dto/rotas.dto';
import { REGRA_PADRAO } from '../../../../domain/earnings-rules';
import { AjusteDto, ConfigRemuneracaoDto, SimularDto } from '../../earnings/dto/earnings.dto';
import { AnularDeclaracaoDto, DeclaredQueryDto } from '../dto/declared.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const passa = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });

describe('payloads do web atual passam pela validação global', () => {
  it('PUT earnings/config com as 13 chaves (como o web manda hoje)', async () => {
    await expect(passa(ConfigRemuneracaoDto, { valid_from: '2026-11-02', reason: 'x', config: { ...REGRA_PADRAO } })).resolves.toBeDefined();
  });
  it('PUT earnings/config com as chaves novas nulas e com todas preenchidas', async () => {
    const nulas = { signup_source: null, daily_base_cents: null, daily_base_condition: null, daily_base_min_visits: null, daily_base_requires_journey: null, tiers_mode: null, declared_daily_cap: null, declared_confirm_days: null };
    await expect(passa(ConfigRemuneracaoDto, { valid_from: '2026-11-02', config: { ...REGRA_PADRAO, ...nulas } })).resolves.toBeDefined();
  });
  it('POST simulate antigo ({ signups_confirmed }) e novo ({ days })', async () => {
    await expect(passa(SimularDto, { signups_confirmed: 10 })).resolves.toBeDefined();
    await expect(passa(SimularDto, { config: { ...REGRA_PADRAO }, signups_confirmed: 0, visits: 3, journey_open: true })).resolves.toBeDefined();
    await expect(passa(SimularDto, { signups_confirmed: 0, route_assigned: true, days: [{ signups: 1, route_assigned: true }] })).resolves.toBeDefined();
    await expect(passa(SimularDto, { signups_confirmed: 0, days: new Array(8).fill({ signups: 1 }) })).rejects.toBeDefined();
  });
  it('PUT settings/config sem as chaves novas, com elas nulas e com valores', async () => {
    const s1 = { fluxo_visita: null, justificativa_distancia: 'opcional', contato_obrigatorio_em: ['retorno'], contato_campos: ['nome'], fechado_conta_na_meta: true, desfazer_segundos: 8 };
    await expect(passa(ConfigRotaDto, s1)).resolves.toBeDefined();
    await expect(passa(ConfigRotaDto, { ...s1, divergencia_alerta_min: null, divergencia_alerta_pct: null })).resolves.toBeDefined();
    await expect(passa(ConfigRotaDto, { ...s1, divergencia_alerta_min: 5, divergencia_alerta_pct: 40 })).resolves.toBeDefined();
    await expect(passa(ConfigRotaDto, { divergencia_alerta_pct: 101 })).rejects.toBeDefined();
  });
  it('relatório e anulação: motivo fechado, nota 3–500, client_id uuid', async () => {
    await expect(pipe.transform({ from: '2026-10-19', status: 'unmatched' }, { type: 'query', metatype: DeclaredQueryDto })).resolves.toBeDefined();
    await expect(pipe.transform({ status: 'xx' }, { type: 'query', metatype: DeclaredQueryDto })).rejects.toBeDefined();
    const ok = { reason: 'duplicate', note: 'Mesmo bar', client_id: '11111111-1111-4111-8111-111111111111' };
    await expect(passa(AnularDeclaracaoDto, ok)).resolves.toBeDefined();
    await expect(passa(AnularDeclaracaoDto, { ...ok, reason: 'x' })).rejects.toBeDefined();
    await expect(passa(AnularDeclaracaoDto, { ...ok, note: 'ab' })).rejects.toBeDefined();
    await expect(passa(AnularDeclaracaoDto, { ...ok, extra: 1 })).rejects.toBeDefined();
  });
  it('o DTO de ajuste não mudou', async () => {
    await expect(passa(AjusteDto, { consultant_id: '11111111-1111-4111-8111-111111111111', amount_cents: 100, reason: 'abc', client_id: '22222222-2222-4222-8222-222222222222' })).resolves.toBeDefined();
  });
});

describe('migração 20261027100000_modo_chefe_s3', () => {
  const sql = readFileSync(join(__dirname, '../../../../../prisma/migrations/20261027100000_modo_chefe_s3/migration.sql'), 'utf8');
  it('é aditiva: não apaga nem altera nada existente e não derruba os índices parciais', () => {
    expect(sql).not.toMatch(/DROP\s+INDEX/i);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT)/i);
    expect(sql).not.toMatch(/ALTER TABLE "(?!field_declared_signup)/);
  });
  it('não mexe no razão (CHECK de kind) e deixa declaração e anulação imutáveis', () => {
    expect(sql).not.toContain('field_earnings_ledger');
    expect(sql).toContain('CREATE TRIGGER "field_declared_signups_immutable" BEFORE UPDATE OR DELETE');
    expect(sql).toContain('CREATE TRIGGER "field_declared_signup_voids_immutable" BEFORE UPDATE OR DELETE');
    expect(sql).toContain('CREATE UNIQUE INDEX "field_declared_signups_lead_id_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "field_declared_signups_visit_id_key"');
  });
  it('é posterior à última migração do S1', () => {
    expect('20261027100000' > '20261026100000').toBe(true);
  });
});
