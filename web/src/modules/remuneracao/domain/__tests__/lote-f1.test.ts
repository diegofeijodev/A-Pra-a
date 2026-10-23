import { describe, expect, it } from 'vitest';
import {
  ajudaPixMensal,
  configRespostaSchema,
  corpoSimulacao,
  extratoSchema,
  formParaRegra,
  ganhosCampoSchema,
  pixDoMes,
  proximoDia1,
  regraParaForm,
  regrasConsultorSchema,
  resumoRegra,
  sugerirInicio,
  versaoSchema,
  type RegraRemuneracao,
} from '../remuneracao';

const PADRAO: RegraRemuneracao = {
  unit_cents: 1000,
  tiers_period: 'day',
  tiers: [{ min_signups: 10, amount_cents: 10000 }],
  combine: 'max',
  cap_cents: null,
  floor_cents: 0,
  floor_condition: 'none',
  floor_min_visits: 0,
  visits_count: 'checkin',
  week_start_weekday: 1,
  payout_weekday: 1,
  autoclose_hour: 6,
  late_grace_days: 14,
};
const MENSAL: RegraRemuneracao = { ...PADRAO, tiers_period: 'month', combine: 'sum', tiers: [{ min_signups: 40, amount_cents: 30000 }] };
const versao = (config: RegraRemuneracao, o: Record<string, unknown> = {}) => ({ version: 2, valid_from: '2026-11-01', reason: null, created_by: 'Diego', created_at: '2026-10-23T12:00:00.000Z', config, ...o });

describe('L11 — bônus mensal no web', () => {
  it('uma versão mensal no histórico não derruba a leitura da configuração (o zod aceita month)', () => {
    const r = configRespostaSchema.parse({ current: versao(PADRAO), upcoming: [versao(MENSAL)], history: [versao(MENSAL), versao(PADRAO)], default_config: PADRAO, features: { routes_enabled: true, declared_signups_enabled: false, monthly_enabled: true } });
    expect(r.upcoming[0]?.config.tiers_period).toBe('month');
    expect(r.features?.monthly_enabled).toBe(true);
  });
  it('início sugerido: o próximo dia 1 com regra mensal', () => {
    expect(proximoDia1('2026-10-23')).toBe('2026-11-01');
    expect(proximoDia1('2026-12-05')).toBe('2027-01-01');
    expect(proximoDia1('2026-11-01')).toBe('2026-11-01');
    expect(sugerirInicio('2026-10-23', MENSAL)).toBe('2026-11-01');
    expect(sugerirInicio('2026-10-23', PADRAO)).toBe('2026-10-23');
  });
  it('a ajuda mostra a data REAL do Pix do mês (K5): outubro → seg 02/11', () => {
    expect(pixDoMes('2026-10', 1, 1)).toBe('2026-11-02');
    // novembro termina numa segunda: a semana é 30/11–06/12 e o Pix, seg 07/12
    expect(pixDoMes('2026-11', 1, 1)).toBe('2026-12-07');
    expect(ajudaPixMensal('2026-10', MENSAL)).toBe('O bônus do mês é pago no primeiro Pix depois do fim do mês (outubro → seg 02/11), junto com a semana que contém o último dia.');
  });
  it('formulário: o período mensal vai no corpo; a regra antiga continua com 13 chaves', () => {
    const r = formParaRegra(regraParaForm(MENSAL));
    expect(r.ok && r.regra.tiers_period).toBe('month');
    const antiga = formParaRegra(regraParaForm(PADRAO));
    expect(antiga.ok && Object.keys(antiga.regra)).toHaveLength(13);
  });
  it('simulador: "Simular o mês" só manda month_signups com regra mensal', () => {
    const p = { signups: '3', visits: '0', journey_open: true, month_signups: '42' };
    expect(corpoSimulacao(regraParaForm(MENSAL), p)?.month_signups).toBe(42);
    expect(corpoSimulacao(regraParaForm(PADRAO), p)).not.toHaveProperty('month_signups');
    expect(corpoSimulacao(regraParaForm(MENSAL), { ...p, month_signups: 'x' })).toBeNull();
  });
  it('resumo em palavras diz "no mês" e quando o bônus sai', () => {
    const l = resumoRegra(MENSAL).join(' ');
    expect(l).toContain('Faixas no mês');
    expect(l).toContain('primeiro Pix depois do fim do mês');
  });
  it('extrato e ganhos do consultor aceitam a parte do mês e a regra que valeu (e continuam aceitando sem elas)', () => {
    const mes = { month: '2026-10', label: 'outubro', from: '2026-10-01', to: '2026-10-31', rule_version: 2, signups: 42, tier: { min_signups: 40, amount_cents: 30000 }, amount_cents: 30000, next_tier: null, ended: true, work_week: '2026-10-26', pix_date: '2026-11-02', pix_label: 'seg 02/11', text: 'Meta de outubro…', conta: ['a'] };
    const regra = { scope: 'consultant', version: 7, valid_from: '2026-10-19', label: 'Regra própria de Ana · versão 7' };
    const linha = { consultant_id: 'a', name: 'Ana', praca_id: 'p', active: true, status: 'open', total_cents: 1, confirmed_signups: 1, closed_at: null, closed_mode: null, week_part_cents: 0, extras_cents: 0, conta: [] };
    const dia = { day: '2026-10-26', total_cents: 1, confirmed_signups: 1, visits: 0, journey_open: true, rule_version: 7, future: false, conta: [] };
    const ex = { week: { from: '2026-10-26', to: '2026-11-01' }, source: 's', rule_version: 1, confirmation_rule: 'activated', total_cents: 1 };
    expect(extratoSchema.parse({ ...ex, consultants: [{ ...linha, days: [{ ...dia, rule_scope: 'consultant' }], month: mes, month_part_cents: 30000, rule: regra }] }).consultants[0]?.rule?.scope).toBe('consultant');
    expect(extratoSchema.parse({ ...ex, consultants: [{ ...linha, days: [dia] }] }).consultants[0]?.month).toBeUndefined();
    const campo = { rule_version: 7, confirmation_rule: 'activated', source: 's', as_of: 'x', today: { day: 'd', total_cents: 0, confirmed_signups: 0, visits: 0, journey_open: false, conta: [] }, week: { from: 'a', to: 'b', total_cents: 0, extras_cents: 0, days: [], conta: [] }, unconfirmed: { count: 0, text: '' }, pix: { date: 'd', week_to: 'w', text: 't' }, previous_weeks: [] };
    expect(ganhosCampoSchema.parse({ ...campo, month: mes, rule: regra }).month?.text).toBe('Meta de outubro…');
  });
});

describe('L13 — regra própria do consultor no web', () => {
  it('lê a resposta de consultant-rules (versões próprias com consultant_id)', () => {
    const r = regrasConsultorSchema.parse({
      consultant_id: 'a',
      name: 'Ana',
      today: '2026-10-23',
      current: { scope: 'consultant', version: 7, valid_from: '2026-10-19', label: 'Regra própria de Ana · versão 7', config_effective: PADRAO },
      own: [versao(PADRAO, { version: 7, consultant_id: 'a' })],
      global_current: versao(PADRAO, { version: 1 }),
      min_valid_from: '2026-10-19',
    });
    expect(r.own[0]?.consultant_id).toBe('a');
    expect(versaoSchema.parse(versao(PADRAO)).consultant_id).toBeUndefined();
  });
});
