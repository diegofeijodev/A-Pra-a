import { describe, expect, it } from 'vitest';
import {
  cartoesDoPainel,
  configLovableSchema,
  corpoConfigLovable,
  csvRanking,
  duracao,
  errosConfigLovable,
  intervaloDoPeriodo,
  linhasDoResumo,
  notaTexto,
  painelSchema,
  posicao,
  resumoDiaSchema,
  SEM_FEATURES,
  type PainelView,
} from '../painel';

const conta = { pct_done: 'c1', visits: 'c2', positivation: 'c3', time: 'c4', signups: 'c5', vouchers: 'Não ligado neste servidor.', pracas_open: 'c7', leads_mapped: 'c8' };
const PAINEL: PainelView = painelSchema.parse({
  from: '2026-10-15',
  to: '2026-10-21',
  praca_id: null,
  today: '2026-10-21',
  generated_at: '2026-10-21T15:00:00.000Z',
  kpis: { planned_stops: 280, done_stops: 224, pct_done: 80, visits: 300, visits_off_route: 76, signups: 54, signups_source: 'declared', declared_now: 54, positivation_pct: 18, avg_gap_min: 16, avg_duration_min: 7, time_headline: 'intervalo', vouchers: null, pracas_open: 3, consultants_active: 12, leads_mapped: 3406, leads_without_exact_location: 312 },
  ranking: [
    { consultant_id: 'a', name: 'Ana', praca_id: 'p', visits: 80, signups: 20, positivation_pct: 25 },
    { consultant_id: 'b', name: 'Bruno; Lima', praca_id: 'p', visits: 75, signups: 15, positivation_pct: 20 },
  ],
  by_result: [{ code: 'nao_cadastrado', label: 'Sem interesse', color: '#dc2626', n: 300 }],
  conta,
  fonte: conta,
  signup_sync_enabled: false,
});

describe('painel do gestor (UX §3.1)', () => {
  it('"7 dias" = hoje e os 6 anteriores (dia de Brasília); Hoje = só hoje', () => {
    expect(intervaloDoPeriodo('7', '2026-10-21')).toEqual({ from: '2026-10-15', to: '2026-10-21' });
    expect(intervaloDoPeriodo('hoje', '2026-10-21')).toEqual({ from: '2026-10-21', to: '2026-10-21' });
    expect(intervaloDoPeriodo('90', '2026-10-21').from).toBe('2026-07-24');
  });
  it('I1: os 8 cartões na ordem, cada um com conta e fonte; cupom desligado mostra "—", nunca 0', () => {
    const c = cartoesDoPainel(PAINEL);
    expect(c.map((x) => x.titulo)).toEqual(['Visitas concluídas', 'Positivação', 'Tempo entre visitas', 'Visitas realizadas', 'Cadastros', 'Cupons', 'Praças abertas', 'Estabelecimentos mapeados']);
    expect(c.every((x) => x.conta && x.fonte)).toBe(true);
    expect(c.find((x) => x.id === 'vouchers')?.numero).toBe('—');
    // Lote C (§38.8): com os cupons ligados o cartão mostra os aprovados (Lovable) e a conta vem do servidor.
    const comCupons = painelSchema.parse({ ...PAINEL, kpis: { ...PAINEL.kpis, vouchers: { requested: 5, pending: 2, approved: 2, rejected: 1, coupons_created: 1 } } });
    expect(cartoesDoPainel(comCupons).find((x) => x.id === 'vouchers')?.numero).toBe('2');
    expect(c.find((x) => x.id === 'leads_mapped')?.numero).toBe('3.406');
  });
  it('I2: sem rota planejada o número é "—" (a conta diz "Sem rota planejada no período")', () => {
    const p = { ...PAINEL, kpis: { ...PAINEL.kpis, pct_done: null } };
    expect(cartoesDoPainel(p)[0]!.numero).toBe('—');
  });
  it('medalha com texto e CSV do ranking com ; e aspas', () => {
    expect(posicao(0)).toBe('1º');
    const csv = csvRanking(PAINEL).split('\n');
    expect(csv[0]).toBe('Posição;Consultor;Visitas;Cadastros;Positivação (%)');
    expect(csv[2]).toBe('2º;"Bruno; Lima";75;15;20');
  });
});

describe('configuração do lote A', () => {
  it('servidor antigo sem as chaves: padrões; features ausente = tudo desligado', () => {
    const c = configLovableSchema.parse({});
    expect(c).toMatchObject({ raio_checkin_m: 200, ui_resumo_dia: 'nota', nota_peso_rota: 7, nota_peso_conversao: 3, painel_gap_max_min: 120 });
    expect(c.features).toBeUndefined();
  });
  it('o PUT só leva as chaves dos módulos ligados; raio sempre', () => {
    const c = configLovableSchema.parse({});
    expect(Object.keys(corpoConfigLovable(c, SEM_FEATURES))).toEqual(['raio_checkin_m']);
    expect(Object.keys(corpoConfigLovable(c, { dashboard: true, day_summary: true, map_pins: false }))).toContain('nota_peso_rota');
  });
  it('erros com a conta', () => {
    const c = { ...configLovableSchema.parse({}), nota_peso_rota: 6 };
    expect(errosConfigLovable(c, { dashboard: false, day_summary: true, map_pins: false })).toEqual(['Os pesos da nota precisam somar 10 (6 + 3 = 9).']);
    expect(errosConfigLovable({ ...c, raio_checkin_m: 20 }, SEM_FEATURES)).toEqual(['Raio da chegada: de 50 a 1000 m.']);
  });
});

describe('resumo do dia (UX §3.6)', () => {
  const r = resumoDiaSchema.parse({
    day: '2026-10-22', consultant_id: 'a', consultant_name: 'Ana', calculated_at: '2026-10-22T20:43:00.000Z', display: 'nota', day_open: false,
    planned: 30, planned_source: 'roteiro', route_visited: 24, visits_done: 24, signups: 6, signups_source: 'declared', signup_sync_enabled: false,
    cumprimento_pct: 80, positivacao_pct: 25, nota: 8.1, partes: { rota: 5.6, conversao: 2.5 }, total_min: 520, first_start: '09:02', last_end: '17:42',
    intervalo_min: null, avg_visit_min: 7, avaliacao: ['x'], conta: ['y'],
  });
  it('linhas com a conta e os horários', () => {
    expect(linhasDoResumo(r)).toEqual([
      ['Paradas previstas', '30'],
      ['Visitadas', '24 (80%)'],
      ['Cadastros declarados', '6 (25%)'],
      ['Tempo do dia', '8h40 (9h02–17h42)'],
      ['Intervalo', 'não registrado'],
      ['Tempo médio na visita', '7 min'],
    ]);
    expect(notaTexto(8.1)).toBe('8,1');
    expect(notaTexto(10)).toBe('10,0');
    expect(duracao(45)).toBe('45 min');
  });
  it('dia aberto: "agora" no lugar do fim', () => {
    expect(linhasDoResumo({ ...r, last_end: null, day_open: true })[3]).toEqual(['Tempo do dia', '8h40 (9h02–agora)']);
  });
});
