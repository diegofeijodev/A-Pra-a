import {
  aplicarConfigAlertas,
  calcularAlertas,
  CONFIG_ALERTAS_PADRAO,
  duracao,
  ehDiaDeTrabalho,
  lerConfigAlertas,
  metaDoDia,
  ordenarAlertas,
  type Alerta,
  type EntradaConsultor,
} from '../alerta-rules';
import { CONFIG_ROTA_PADRAO } from '../rota-rules';

const brt = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00-03:00`);
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const TERCA = 2;

const cons = (over: Partial<EntradaConsultor> = {}): EntradaConsultor => ({
  id: 'c1',
  name: 'Ana Souza',
  phone: '(11) 98888-0000',
  praca_id: 'p1',
  praca_name: 'São Paulo',
  active: true,
  situacao: 'em_jornada',
  ultimoRegistro: null,
  visitaAberta: null,
  feitas: 0,
  paradasPendentes: null,
  ...over,
});

function rodar(hhmm: string, c: Partial<EntradaConsultor>, extra: { diaSemana?: number; alertas?: Partial<typeof CONFIG_ALERTAS_PADRAO> } = {}) {
  const [r] = calcularAlertas({
    agora: brt(hhmm),
    agoraMin: min(hhmm),
    diaSemana: extra.diaSemana ?? TERCA,
    config: CONFIG_ROTA_PADRAO,
    alertas: { ...CONFIG_ALERTAS_PADRAO, ...extra.alertas },
    consultores: [cons(c)],
  });
  return r!;
}
const codigos = (alerts: Alerta[]) => alerts.map((a) => a.code);

describe('metaDoDia — a conta explícita', () => {
  it('30 visitas em 8 h úteis = 1 a cada 16 min; às 14:40 esperam 17 (280 min úteis)', () => {
    const g = metaDoDia({ agoraMin: min('14:40'), feitas: 8, config: CONFIG_ROTA_PADRAO, diaDeTrabalho: true });
    expect(g).toMatchObject({ meta: 30, feitas: 8, esperadas: 17, delta: -9, faltam: 22, minutos_uteis: 280, minutos_por_visita_ritmo: 16 });
  });

  it('a conta cita meta, janela, almoço, minutos por visita e o que era esperado', () => {
    const g = metaDoDia({ agoraMin: min('10:00'), feitas: 2, config: CONFIG_ROTA_PADRAO, diaDeTrabalho: true });
    expect(g.minutos_uteis).toBe(60);
    expect(g.esperadas).toBe(3);
    expect(g.conta).toBe(
      '30 visitas em 8 h úteis (09:00–18:00, menos 1 h de almoço) = 1 a cada 16 min. Às 10:00 já deveriam ser 3 (60 min úteis ÷ 16 min); feitas: 2.',
    );
    expect(g.fonte).toMatch(/check-in nas jornadas de hoje/);
  });

  it('antes da janela nada é esperado; depois, a meta inteira', () => {
    expect(metaDoDia({ agoraMin: min('07:00'), feitas: 0, config: CONFIG_ROTA_PADRAO, diaDeTrabalho: true }).esperadas).toBe(0);
    expect(metaDoDia({ agoraMin: min('21:00'), feitas: 20, config: CONFIG_ROTA_PADRAO, diaDeTrabalho: true })).toMatchObject({ esperadas: 30, delta: -10, faltam: 10 });
  });

  it('almoço não conta como tempo útil', () => {
    expect(metaDoDia({ agoraMin: min('12:30'), feitas: 0, config: CONFIG_ROTA_PADRAO, diaDeTrabalho: true }).minutos_uteis).toBe(180);
    expect(metaDoDia({ agoraMin: min('13:00'), feitas: 0, config: CONFIG_ROTA_PADRAO, diaDeTrabalho: true }).minutos_uteis).toBe(180);
  });

  it('feitas acima da meta: delta positivo e nada falta', () => {
    expect(metaDoDia({ agoraMin: min('10:00'), feitas: 31, config: CONFIG_ROTA_PADRAO, diaDeTrabalho: true })).toMatchObject({ delta: 28, faltam: 0 });
  });
});

describe('calcularAlertas', () => {
  it('não iniciou: só depois de janela_inicio + tolerância, e só até o fim da janela', () => {
    expect(rodar('09:29', { situacao: 'nao_iniciou' }).alerts).toEqual([]);
    const a = rodar('09:42', { situacao: 'nao_iniciou' }).alerts;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ code: 'nao_iniciou', severity: 'alta', consultant_id: 'c1', praca_name: 'São Paulo', phone: '(11) 98888-0000', since: null });
    expect(a[0]!.message).toBe('Ana Souza — não iniciou a jornada (começa às 09:00; agora 09:42).');
    expect(a[0]!.conta).toBe('Janela começa às 09:00 + 30 min de tolerância = 09:30. Agora são 09:42 e não há jornada hoje.');
    expect(rodar('18:00', { situacao: 'nao_iniciou' }).alerts).toEqual([]);
    expect(rodar('21:00', { situacao: 'nao_iniciou' }).alerts).toEqual([]);
  });

  it('a tolerância é configurável', () => {
    expect(codigos(rodar('09:10', { situacao: 'nao_iniciou' }, { alertas: { alerta_inicio_apos_min: 5 } }).alerts)).toEqual(['nao_iniciou']);
  });

  it('visita aberta: acima do limite alerta com a hora do check-in; no limite não', () => {
    const c = { feitas: 6, ultimoRegistro: brt('10:10') };
    expect(rodar('10:50', { ...c, visitaAberta: { nome: 'Churrascaria Sul', checkin_at: brt('10:10') } }).alerts).toEqual([]);
    const a = rodar('11:02', { ...c, visitaAberta: { nome: 'Churrascaria Sul', checkin_at: brt('10:10') } }).alerts.find((x) => x.code === 'visita_aberta')!;
    expect(a.severity).toBe('media');
    expect(a.message).toBe('Ana Souza — visita aberta há 52 min (Churrascaria Sul).');
    expect(a.conta).toBe('Agora 11:02 − check-in 10:10 = 52 min; o limite é 40 min.');
    expect(a.since).toBe(brt('10:10').toISOString());
  });

  it('sem registro: alerta com texto honesto; com visita aberta não se aplica (o aviso é o da visita)', () => {
    const base = { feitas: 3, ultimoRegistro: brt('10:00') };
    expect(codigos(rodar('10:30', base).alerts)).toEqual([]);
    const a = rodar('10:35', base).alerts;
    expect(codigos(a)).toContain('sem_registro');
    const s = a.find((x) => x.code === 'sem_registro')!;
    expect(s.severity).toBe('alta');
    expect(s.message).toBe('Ana Souza — sem registro há 35 min (pode ser tela apagada).');
    expect(s.conta).toMatch(/Agora 10:35 − último registro 10:00 = 35 min; o limite é 30 min/);
    const comVisita = rodar('11:00', { ...base, visitaAberta: { nome: 'Bar X', checkin_at: brt('10:00') } }).alerts;
    expect(codigos(comVisita)).toContain('visita_aberta');
    expect(codigos(comVisita)).not.toContain('sem_registro');
  });

  it('ritmo atrasado: só com atraso >= limite, dentro da janela, e jornada aberta', () => {
    // 10:00 esperam 3; 4 de atraso é pouco
    expect(codigos(rodar('10:00', { feitas: 0, ultimoRegistro: brt('09:55') }, { alertas: { alerta_ritmo_atras: 5 } }).alerts)).toEqual([]);
    // 14:40: esperam 17; feitas 8 → atrás 9
    const a = rodar('14:40', { feitas: 8, ultimoRegistro: brt('14:35') }).alerts;
    expect(codigos(a)).toEqual(['ritmo_atrasado']);
    expect(a[0]!.message).toBe('Ana Souza — 8 de 17 esperadas até 14:40 (ritmo 9 atrás).');
    expect(a[0]!.conta).toMatch(/Atraso 9 = 17 esperadas − 8 feitas; o limite é 5/);
    // depois da janela não cobra mais
    expect(codigos(rodar('19:00', { feitas: 8, ultimoRegistro: brt('18:55') }).alerts)).toEqual([]);
    // à frente do ritmo: nada
    expect(codigos(rodar('14:40', { feitas: 20, ultimoRegistro: brt('14:35') }).alerts)).toEqual([]);
  });

  it('parada vencida: ETA + tolerância passou; mostra a contagem e a primeira; sem roteiro não alerta', () => {
    const base = { feitas: 5, ultimoRegistro: brt('10:55') };
    const paradas = [
      { nome: 'Padaria B', eta_min: min('10:00') },
      { nome: 'Bar A', eta_min: min('09:40') },
      { nome: 'Pizzaria C', eta_min: min('10:50') },
    ];
    const a = rodar('11:00', { ...base, paradasPendentes: paradas }, { alertas: { alerta_ritmo_atras: 100 } }).alerts;
    expect(codigos(a)).toEqual(['parada_vencida']);
    expect(a[0]!.message).toBe('Ana Souza — 2 paradas do roteiro passaram do horário previsto (a primeira: Bar A, previsto 09:40).');
    expect(a[0]!.conta).toBe('Agora 11:00 − horário previsto 09:40 = 80 min; o limite é 30 min.');
    expect(codigos(rodar('11:00', { ...base, paradasPendentes: null }, { alertas: { alerta_ritmo_atras: 100 } }).alerts)).toEqual([]);
    expect(codigos(rodar('11:00', { ...base, paradasPendentes: [] }, { alertas: { alerta_ritmo_atras: 100 } }).alerts)).toEqual([]);
    // no limite exato não vence
    expect(codigos(rodar('10:30', { ...base, ultimoRegistro: brt('10:25'), paradasPendentes: [{ nome: 'X', eta_min: min('10:00') }] }, { alertas: { alerta_ritmo_atras: 100 } }).alerts)).toEqual([]);
    const uma = rodar('11:00', { ...base, paradasPendentes: [{ nome: 'X', eta_min: min('10:00') }] }, { alertas: { alerta_ritmo_atras: 100 } }).alerts[0]!;
    expect(uma.message).toContain('1 parada do roteiro passou');
  });

  it('quem encerrou, consultor inativo e dia sem expediente (domingo) não geram alerta', () => {
    expect(rodar('15:00', { situacao: 'encerrou', feitas: 1 }).alerts).toEqual([]);
    expect(calcularAlertas({ agora: brt('15:00'), agoraMin: min('15:00'), diaSemana: TERCA, config: CONFIG_ROTA_PADRAO, alertas: CONFIG_ALERTAS_PADRAO, consultores: [cons({ active: false, situacao: 'nao_iniciou' })] })).toEqual([]);
    const dom = rodar('10:30', { situacao: 'nao_iniciou' }, { diaSemana: 0 });
    expect(dom.alerts).toEqual([]);
    expect(dom.goal.dia_de_trabalho).toBe(false);
  });

  it('dia de trabalho vem da configuração', () => {
    expect(ehDiaDeTrabalho(0, CONFIG_ALERTAS_PADRAO)).toBe(false);
    expect(ehDiaDeTrabalho(6, CONFIG_ALERTAS_PADRAO)).toBe(true);
    expect(ehDiaDeTrabalho(6, { dias_trabalho: [1, 2, 3, 4, 5] })).toBe(false);
  });

  it('ordena por severidade, nome e código; resultado determinístico', () => {
    const mk = (code: Alerta['code'], severity: Alerta['severity'], name: string): Alerta => ({
      code, severity, consultant_id: name, consultant_name: name, praca_id: 'p', praca_name: 'P', phone: '', message: '', conta: '', since: null,
    });
    const lista = [mk('ritmo_atrasado', 'media', 'Ana'), mk('sem_registro', 'alta', 'Zeca'), mk('visita_aberta', 'media', 'Ana'), mk('nao_iniciou', 'alta', 'Bruno')];
    expect([...lista].sort(ordenarAlertas).map((a) => `${a.consultant_name}:${a.code}`)).toEqual([
      'Bruno:nao_iniciou',
      'Zeca:sem_registro',
      'Ana:visita_aberta',
      'Ana:ritmo_atrasado',
    ]);
  });
});

describe('configuração de alertas', () => {
  it('padrão quando ausente ou inválido', () => {
    expect(lerConfigAlertas(undefined)).toEqual(CONFIG_ALERTAS_PADRAO);
    expect(lerConfigAlertas({ alerta_sem_registro_min: 'x', dias_trabalho: [9], alerta_ritmo_atras: 7 })).toEqual({ ...CONFIG_ALERTAS_PADRAO, alerta_ritmo_atras: 7 });
  });

  it('PUT parcial valida faixa, rejeita chave desconhecida e ordena os dias', () => {
    const ok = aplicarConfigAlertas(CONFIG_ALERTAS_PADRAO, { dias_trabalho: [5, 1, 3], alerta_visita_aberta_min: 60 });
    expect(ok).toEqual({ ok: true, config: { ...CONFIG_ALERTAS_PADRAO, dias_trabalho: [1, 3, 5], alerta_visita_aberta_min: 60 } });
    for (const ruim of [{ alerta_visita_aberta_min: 4 }, { alerta_ritmo_atras: 0 }, { dias_trabalho: [] }, { dias_trabalho: [1, 1] }, { dias_trabalho: [7] }, { retornos_no_roteiro: 'sim' }, { meta_diaria: 3 }]) {
      expect(aplicarConfigAlertas(CONFIG_ALERTAS_PADRAO, ruim).ok).toBe(false);
    }
  });

  it('duração em texto', () => {
    expect([duracao(45), duracao(60), duracao(480), duracao(510)]).toEqual(['45 min', '1 h', '8 h', '8 h 30 min']);
  });
});
