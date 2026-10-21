import { CONFIG_PAINEL, intervalosEntreChegadas, montarPainel, type EntradaPainel, type VisitaPainel } from '../painel-rules';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'aaaaaaaa-0000-4000-8000-000000000002';
const C = 'aaaaaaaa-0000-4000-8000-000000000003';
let n = 0;
const v = (consultor: string, day: string, hhmm: string, o: Partial<VisitaPainel> = {}): VisitaPainel => {
  // Brasília = UTC−3.
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = day.split('-').map(Number);
  const checkin = new Date(Date.UTC(y!, mo! - 1, d!, h! + 3, m!));
  n += 1;
  return { id: `v${n}`, consultant_id: consultor, day, checkin_at: checkin, checkout_at: new Date(checkin.getTime() + 7 * 60_000), na_rota: true, outcome: 'conversa', result: 'sem_interesse', ...o };
};

const base = (o: Partial<EntradaPainel> = {}): EntradaPainel => ({
  consultores: [
    { id: A, name: 'Ana', praca_id: 'p1', active: true },
    { id: B, name: 'Bruno', praca_id: 'p1', active: true },
    { id: C, name: 'Carla', praca_id: 'p1', active: false },
  ],
  visitas: [],
  paradas: { planejadas: 0, visitadas: 0 },
  cadastros: new Map(),
  fonteCadastros: 'declared',
  syncLigado: false,
  pracasAbertas: 1,
  leadsMapeados: 10,
  leadsSemLocalizacao: 2,
  cfg: CONFIG_PAINEL.padrao,
  ...o,
});

describe('intervalosEntreChegadas', () => {
  it('mesmo consultor, mesmo dia de Brasília; acima de 120 min e 0 ficam de fora', () => {
    const vs = [v(A, '2026-10-20', '09:00'), v(A, '2026-10-20', '09:16'), v(A, '2026-10-20', '12:00'), v(A, '2026-10-20', '12:00'), v(B, '2026-10-20', '09:10')];
    expect(intervalosEntreChegadas(vs, 120)).toEqual([16]);
  });
  it('visita às 23h50 e às 00h10 de Brasília são dias diferentes (a Lovable juntaria pelo dia UTC)', () => {
    const vs = [v(A, '2026-10-20', '23:30'), v(A, '2026-10-20', '23:50'), v(A, '2026-10-21', '00:10')];
    expect(intervalosEntreChegadas(vs, 120)).toEqual([20]);
  });
});

describe('montarPainel', () => {
  it('sem rota planejada: pct_done null e a conta diz "Sem rota planejada no período" (nunca 0%)', () => {
    const p = montarPainel(base());
    expect(p.kpis.pct_done).toBeNull();
    expect(p.conta.pct_done).toBe('Sem rota planejada no período.');
    expect(p.kpis.positivation_pct).toBeNull();
  });

  it('I1/I4: cada cartão reproduz o número; a soma das barras = visitas realizadas', () => {
    const vs = [
      v(A, '2026-10-20', '09:00', { result: 'cadastrou', freela_status: 'declarou' }),
      v(A, '2026-10-20', '09:16', { result: 'retorno', needs_followup: true }),
      v(A, '2026-10-20', '09:30', { outcome: 'fechado', result: 'fechado', na_rota: false }),
      v(B, '2026-10-20', '10:00', { result: 'ja_usa', freela_status: 'ja_usa' }),
    ];
    const p = montarPainel(base({ visitas: vs, paradas: { planejadas: 5, visitadas: 3 }, cadastros: new Map([[A, 1]]) }));
    expect(p.kpis).toMatchObject({ planned_stops: 5, done_stops: 3, pct_done: 60, visits: 4, visits_off_route: 1, signups: 1, declared_now: 1, positivation_pct: 25, avg_gap_min: 15, avg_duration_min: 7, consultants_active: 2 });
    expect(p.conta.pct_done).toBe('3 de 5 paradas planejadas nas rotas = 60%.');
    expect(p.conta.positivation).toContain('1 cadastro ÷ 4 visitas = 25%');
    expect(p.by_result.reduce((a, x) => a + x.n, 0)).toBe(4);
    expect(p.by_result.find((x) => x.code === 'fechado')?.n).toBe(1);
    expect(p.by_result.map((x) => x.code)).not.toContain('a_visitar');
  });

  it('I3: ranking por cadastros, depois positivação (razão exata), depois nome; sem movimento fica de fora', () => {
    const vs = [v(A, '2026-10-20', '09:00'), v(A, '2026-10-20', '09:20'), v(B, '2026-10-20', '09:00'), v(B, '2026-10-20', '09:20'), v(B, '2026-10-20', '09:40')];
    const p = montarPainel(base({ visitas: vs, cadastros: new Map([[A, 1], [B, 1]]) }));
    expect(p.ranking.map((r) => r.name)).toEqual(['Ana', 'Bruno']); // 1/2 > 1/3
    expect(p.ranking[0]).toMatchObject({ visits: 2, signups: 1, positivation_pct: 50 });
    const p2 = montarPainel(base({ visitas: vs, cadastros: new Map([[A, 1], [B, 2]]) }));
    expect(p2.ranking.map((r) => r.name)).toEqual(['Bruno', 'Ana']);
  });

  it('tempo: número grande segue a chave; o outro volta na conta; fonte e conta em todos os cartões', () => {
    const p = montarPainel(base({ visitas: [v(A, '2026-10-20', '09:00'), v(A, '2026-10-20', '09:10')], cfg: { painel_tempo_medio: 'duracao', painel_gap_max_min: 120 } }));
    expect(p.kpis.time_headline).toBe('duracao');
    expect(p.conta.time).toContain('chegada → conclusão');
    for (const k of Object.keys(p.conta)) expect((p.fonte as Record<string, string>)[k]).toBeTruthy();
  });

  it('confirmados com a sincronização desligada: a fonte diz que ficam em 0', () => {
    const p = montarPainel(base({ fonteCadastros: 'freela_confirmed', syncLigado: false }));
    expect(p.fonte.signups).toContain('A sincronização com o Freela está desligada');
  });
});
