import { calcularAlertas, CONFIG_ALERTAS_PADRAO, metaDoDia, type EntradaConsultor } from '../alerta-rules';
import { calcularDia, normalizarRegra, REGRA_PADRAO, validarRegra } from '../earnings-rules';
import { CONFIG_INTERVALO, fimDaPausa, minutosDePausas, minutosUteisComPausas, pausasEmMinutos } from '../intervalo-rules';
import { CONFIG_RESUMO_DIA, resumoDia, type EntradaResumoDia } from '../resumo-dia-rules';
import { calcularRelogio, CONFIG_ROTA_PADRAO, paramsDaConfig, ritmo, type PontoRota } from '../rota-rules';

const D = (hhmm: string) => new Date(`2026-10-22T${hhmm}:00-03:00`);
const P = paramsDaConfig(CONFIG_ROTA_PADRAO); // 09:00–18:00, almoço 12:00–13:00, meta 30

describe('CONFIG_INTERVALO (§37.2)', () => {
  it('padrão: ligado (Lovable), lembrete 60 min (UX), alerta 75 min (Lovable)', () => {
    expect(CONFIG_INTERVALO.ler({})).toEqual({ intervalo_ativo: true, intervalo_lembrete_min: 60, alerta_intervalo_min: 75 });
    expect(CONFIG_INTERVALO.aplicar(CONFIG_INTERVALO.padrao, { alerta_intervalo_min: 10 }).ok).toBe(false);
    expect(CONFIG_INTERVALO.aplicar(CONFIG_INTERVALO.padrao, { intervalo_ativo: false })).toMatchObject({ ok: true, config: { intervalo_ativo: false } });
  });
});

describe('minutos de intervalo', () => {
  it('soma dos pares; o aberto conta até agora; o fim nunca fica antes do início', () => {
    const ps = [
      { started_at: D('12:04'), ended_at: D('13:02') },
      { started_at: D('15:00'), ended_at: null },
    ];
    expect(minutosDePausas(ps, D('15:10'))).toBe(58 + 10);
    expect(pausasEmMinutos(ps, D('15:10'))).toEqual([
      { ini: 12 * 60 + 4, fim: 13 * 60 + 2 },
      { ini: 15 * 60, fim: 15 * 60 + 10 },
    ]);
    expect(fimDaPausa(D('12:00'), D('11:59')).getTime()).toBe(D('12:00').getTime());
    expect(fimDaPausa(D('12:00'), D('12:30')).getTime()).toBe(D('12:30').getTime());
  });
  it('minutos úteis: janela até agora menos a sobreposição REAL dos intervalos (nunca o almoço configurado)', () => {
    // 14:00, intervalo 12:04–13:02 (58 min): 300 − 58 = 242 (o almoço configurado daria 240).
    expect(minutosUteisComPausas(14 * 60, P, [{ ini: 12 * 60 + 4, fim: 13 * 60 + 2 }])).toBe(242);
    // intervalo antes da janela não desconta; o que passa do "agora" não desconta.
    expect(minutosUteisComPausas(10 * 60, P, [{ ini: 8 * 60, fim: 9 * 60 + 30 }])).toBe(30);
    expect(minutosUteisComPausas(12 * 60 + 30, P, [{ ini: 12 * 60, fim: 13 * 60 }])).toBe(180);
  });
});

describe('ritmo e meta com intervalo (§37.6)', () => {
  it('sem intervalo: idênticos aos de hoje (mesmos números e mesma conta)', () => {
    for (const t of [9 * 60, 11 * 60, 12 * 60 + 30, 14 * 60, 17 * 60 + 59]) {
      expect(ritmo({ agoraMin: t, feitas: 7, params: P, pausas: [] })).toEqual(ritmo({ agoraMin: t, feitas: 7, params: P }));
      const c = { ...CONFIG_ROTA_PADRAO };
      expect(metaDoDia({ agoraMin: t, feitas: 7, config: c, diaDeTrabalho: true, pausas: [] })).toEqual(metaDoDia({ agoraMin: t, feitas: 7, config: c, diaDeTrabalho: true }));
    }
  });
  it('com intervalo: desconta o real NO LUGAR do almoço (nunca os dois); o ritmo por visita é o do plano', () => {
    const pausas = [{ ini: 12 * 60 + 4, fim: 13 * 60 + 2 }];
    const r = ritmo({ agoraMin: 14 * 60, feitas: 10, params: P, pausas });
    expect(r.minutos_por_visita_ritmo).toBe(16);
    expect(r.esperadas).toBe(Math.floor(242 / 16));
    // Intervalo curto (20 min) às 12:30: sem o almoço configurado, 210 − 0… o real é o que conta.
    const curto = ritmo({ agoraMin: 12 * 60 + 30, feitas: 10, params: P, pausas: [{ ini: 12 * 60, fim: 12 * 60 + 20 }] });
    expect(curto.esperadas).toBe(Math.floor((210 - 20) / 16));
    const g = metaDoDia({ agoraMin: 14 * 60, feitas: 10, config: CONFIG_ROTA_PADRAO, diaDeTrabalho: true, pausas });
    expect(g.minutos_uteis).toBe(242);
    expect(g.conta).toContain('descontado o intervalo registrado de 58 min');
    expect(g.conta).not.toContain('menos 1 h de almoço');
  });
});

describe('relógio do roteiro (§37.6)', () => {
  const pts: PontoRota[] = [1, 2, 3].map((i) => ({ id: `p${i}`, lat: -19.92 + i * 0.0001, lng: -43.93 }));
  it('sem pausaFeita: igual ao de hoje (a parada que cairia no almoço vai para 13:00)', () => {
    const base = { inicio: { lat: -19.92, lng: -43.93 }, partidaMin: 11 * 60 + 55, ordem: pts, params: P };
    expect(calcularRelogio({ ...base, pausaFeita: false })).toEqual(calcularRelogio(base));
    expect(calcularRelogio(base).paradas[1]!.eta_min).toBeGreaterThanOrEqual(13 * 60);
  });
  it('com pausaFeita: o relógio não insere mais o almoço configurado', () => {
    const p = calcularRelogio({ inicio: { lat: -19.92, lng: -43.93 }, partidaMin: 11 * 60 + 55, ordem: pts, params: P, pausaFeita: true });
    expect(p.paradas[1]!.eta_min).toBeLessThan(12 * 60 + 15);
  });
});

describe('alertas com intervalo (§37.6)', () => {
  const base: EntradaConsultor = {
    id: 'c1',
    name: 'Ana',
    phone: '',
    praca_id: 'p',
    praca_name: 'Moema',
    active: true,
    situacao: 'em_jornada',
    ultimoRegistro: D('12:00'),
    visitaAberta: null,
    feitas: 10,
    paradasPendentes: null,
  };
  const entrada = (c: EntradaConsultor, agora: Date, intervalo?: { alerta_intervalo_min: number }) => ({
    agora,
    agoraMin: agora.getHours() * 60 + agora.getMinutes(),
    diaSemana: 4,
    config: CONFIG_ROTA_PADRAO,
    alertas: CONFIG_ALERTAS_PADRAO,
    consultores: [c],
    ...(intervalo ? { intervalo } : {}),
  });
  it('sem intervalo: "sem registro" como hoje', () => {
    const r = calcularAlertas({ ...entrada(base, D('13:30')), agoraMin: 13 * 60 + 30 });
    expect(r[0]!.alerts.map((a) => a.code)).toContain('sem_registro');
  });
  it('em intervalo: sem "sem registro"; acima do limite, intervalo_longo com a conta', () => {
    const c = { ...base, intervaloAberto: D('12:04'), pausas: [{ ini: 12 * 60 + 4, fim: 13 * 60 + 24 }] };
    const r = calcularAlertas({ ...entrada(c, D('13:24'), { alerta_intervalo_min: 75 }), agoraMin: 13 * 60 + 24 });
    const codes = r[0]!.alerts.map((a) => a.code);
    expect(codes).not.toContain('sem_registro');
    const a = r[0]!.alerts.find((x) => x.code === 'intervalo_longo')!;
    expect(a.conta).toBe('Agora 13:24 − início do intervalo 12:04 = 80 min; o limite é 75 min.');
    expect(a.since).toBe(D('12:04').toISOString());
    const curto = calcularAlertas({ ...entrada({ ...c, intervaloAberto: D('13:00') }, D('13:24'), { alerta_intervalo_min: 75 }), agoraMin: 13 * 60 + 24 });
    expect(curto[0]!.alerts.map((x) => x.code)).not.toContain('intervalo_longo');
  });
});

describe('diária com tempo trabalhado mínimo (§37.6, daily_base_min_worked_minutes)', () => {
  const dia = { dia: '2026-10-22', signups: 0, visits: 5, journey_open: true, elegivel: true };
  const regra = { ...REGRA_PADRAO, daily_base_cents: 15000, daily_base_condition: 'journey_open' as const };
  it('ausente/null = hoje (a diária vale com a jornada); a v1 não muda', () => {
    expect(calcularDia(regra, dia, 2).total_cents).toBe(15000);
    expect(calcularDia({ ...regra, daily_base_min_worked_minutes: null }, dia, 2)).toEqual(calcularDia(regra, dia, 2));
    expect(normalizarRegra(REGRA_PADRAO).daily_base_min_worked_minutes).toBeNull();
    expect(validarRegra({ ...REGRA_PADRAO, daily_base_min_worked_minutes: null }).ok).toBe(true);
  });
  it('com mínimo: abaixo não vale, com a conta; acima vale; faixa 0–1440', () => {
    const r = { ...regra, daily_base_min_worked_minutes: 360 };
    const abaixo = calcularDia(r, { ...dia, worked_minutes: 300 }, 2);
    expect(abaixo.total_cents).toBe(0);
    expect(abaixo.conta.join(' ')).toContain('foram 5h00 trabalhados (jornada menos intervalo) e o mínimo é 6h00');
    const acima = calcularDia(r, { ...dia, worked_minutes: 361 }, 2);
    expect(acima.total_cents).toBe(15000);
    expect(acima.conta.join(' ')).toContain('ao menos 6h00 trabalhados');
    expect(validarRegra({ ...REGRA_PADRAO, daily_base_min_worked_minutes: 1441 }).ok).toBe(false);
    expect(validarRegra({ ...REGRA_PADRAO, daily_base_min_worked_minutes: 1.5 }).ok).toBe(false);
  });
});

describe('resumo do dia com o intervalo (§37.6)', () => {
  const base: EntradaResumoDia = {
    agora: new Date('2026-10-22T20:43:00.000Z'),
    diaAberto: false,
    jornadas: [{ started_at: new Date('2026-10-22T12:02:00.000Z'), ended_at: new Date('2026-10-22T20:42:00.000Z') }],
    intervaloMin: null,
    rota: { planejadas: 30, visitadas: 24 },
    meta: 30,
    visitasConcluidas: 24,
    duracoesMin: [5, 7, 9],
    cadastros: 6,
    fonte: 'declared',
    syncLigado: false,
    cuponsLigados: false,
    cfg: CONFIG_RESUMO_DIA.padrao,
  };
  it('sem registro (flag desligada): a resposta do lote A, sem trabalhado_min', () => {
    const r = resumoDia(base);
    expect(r.intervalo_min).toBeNull();
    expect(r).not.toHaveProperty('trabalhado_min');
  });
  it('com intervalo: trabalhado = tempo do dia − intervalo, com a conta; acima do limite, a frase da Lovable', () => {
    const r = resumoDia({ ...base, intervaloMin: 58 });
    expect(r.total_min).toBe(520);
    expect(r.trabalhado_min).toBe(462);
    expect(r.conta.join(' ')).toContain('tempo trabalhado = tempo do dia − intervalo = 7h42');
    expect(resumoDia({ ...base, intervaloMin: 80 }).avaliacao.join(' ')).toContain('O intervalo passou de 1 hora');
  });
});
