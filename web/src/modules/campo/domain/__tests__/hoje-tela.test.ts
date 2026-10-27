import { describe, expect, it } from 'vitest';
import type { RouteView, StopView } from '@/modules/rotas/domain/rota.schema';
import type { ItemFila, TodayView } from '../campo.types';
import { montarDia } from '../dia-local';
import {
  cadastrosDoDia,
  cartaoDaRota,
  estadoDoDia,
  paradasDaRota,
  primeiroNome,
  progressoDoDia,
  saudacao,
  seloDaParada,
  subtituloHoje,
  tempoMedioMin,
} from '../hoje-tela';

const parada = (over: Partial<StopView>): StopView =>
  ({
    id: 's1',
    route_id: 'r1',
    lead_id: 'l1',
    seq: 1,
    kind: 'planejada',
    status: 'pendente',
    fixa: false,
    eta: '09:00',
    eta_min: null,
    planned_minutes: 20,
    distance_m: 300,
    name: 'Bar do Zé',
    address: 'Rua A, 10',
    phone: '',
    lat: -19.9,
    lng: -43.9,
    skip_reason: null,
    skip_note: null,
    deferred_to: null,
    visit_id: null,
    ...over,
  }) as StopView;

const PARAMS = { janela_inicio: '08:00', minutos_por_visita: 20, fator_desvio: 1.3 } as RouteView['params'];
const rota = (stops: StopView[], over: Partial<RouteView> = {}) =>
  ({ stops, plan: { planned: stops.length, reserve: 0, walk_km: 6.25, fits_meta: true, not_fit: 0 }, params: PARAMS, travel_mode: 'a_pe', ...over }) as RouteView;

describe('Hoje: saudação e subtítulo (UX §4.12)', () => {
  it('primeiro nome, sem sobrenome nem espaços', () => {
    expect(primeiroNome('  Ana Paula Souza ')).toBe('Ana');
    expect(primeiroNome(null)).toBe('');
  });
  it('"Bom trabalho, Ana!" e sem nome só "Bom trabalho!"', () => {
    expect(saudacao('Ana Paula')).toBe('Bom trabalho, Ana!');
    expect(saudacao('')).toBe('Bom trabalho!');
  });
  it('"Hoje, seg 26/10 · praça" (sem praça, só o dia)', () => {
    expect(subtituloHoje('2026-10-26', 'BH + Contagem')).toBe('Hoje, seg 26/10 · BH + Contagem');
    expect(subtituloHoje('2026-10-26', '')).toBe('Hoje, seg 26/10');
  });
});

describe('Hoje: cartão da rota (Lovable CardRota)', () => {
  it('conta só as planejadas que não foram descartadas, na ordem', () => {
    const stops = [parada({ id: 'b', seq: 2 }), parada({ id: 'a', seq: 1 }), parada({ id: 'r', seq: 3, kind: 'reserva' }), parada({ id: 'd', seq: 4, status: 'descartada' })];
    expect(paradasDaRota(stops).map((s) => s.id)).toEqual(['a', 'b']);
    expect(cartaoDaRota(rota(stops)).paradas).toBe(2);
  });
  it('percurso em km com vírgula e o modo da Lovable', () => {
    const c = cartaoDaRota(rota([parada({})]));
    expect(c.percurso).toBe('6,3 km');
    expect(c.modo).toBe('A pé');
    expect(cartaoDaRota(rota([parada({})], { travel_mode: 'carro' })).modo).toBe('Carro/moto');
  });
  it('tempo previsto = abertura da janela até a chegada da última + o tempo de visita, com a conta', () => {
    const c = cartaoDaRota(rota([parada({ eta: '09:00' }), parada({ id: 's2', seq: 2, eta: '16:20' })]));
    // 08:00 → 16:20 + 20 min = 8h40
    expect(c.tempoPrevisto).toBe('8h40');
    expect(c.conta.some((l) => l.includes('8h00') && l.includes('16h20') && l.includes('20 min'))).toBe(true);
  });
  it('sem horário previsto, sem tempo (não inventa)', () => {
    const c = cartaoDaRota(rota([parada({ eta: null })]));
    expect(c.tempoPrevisto).toBeNull();
    expect(c.conta.some((l) => l.startsWith('Tempo previsto'))).toBe(false);
  });
});

describe('Roteiro: situação do dia no selo (Lovable estadoRota)', () => {
  const J = { client_id: 'j1', started_at: '2026-10-26T11:00:00.000Z', pendente: false };
  const I = { client_id: 'i1', started_at: '2026-10-26T15:00:00.000Z', ended_at: null, pendente: false };
  it('sem jornada e sem nenhuma hoje: não iniciada; encerrada hoje: encerrada', () => {
    expect(estadoDoDia({ jornada: null, intervaloAberto: null, encerradaHoje: false }, true)).toBe('nao_iniciada');
    expect(estadoDoDia({ jornada: null, intervaloAberto: null, encerradaHoje: true }, true)).toBe('encerrada');
  });
  it('jornada aberta: em rota; no intervalo só com o intervalo ligado', () => {
    expect(estadoDoDia({ jornada: J, intervaloAberto: null, encerradaHoje: false }, true)).toBe('em_rota');
    expect(estadoDoDia({ jornada: J, intervaloAberto: I, encerradaHoje: false }, true)).toBe('intervalo');
    expect(estadoDoDia({ jornada: J, intervaloAberto: I, encerradaHoje: false }, false)).toBe('em_rota');
  });
});

describe('montarDia: "encerrada hoje" (servidor + fila)', () => {
  const POS = { at: '2026-10-26T20:00:00.000Z', lat: -19.9, lng: -43.9, accuracy: 10 };
  const base = { consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 0 };
  const JV = { id: 'j', client_id: 'j1', day: '2026-10-26', started_at: '2026-10-26T11:00:00.000Z', start_lat: 0, start_lng: 0, end_lat: null, end_lng: null, auto_closed: false };
  const hoje = (over: Partial<TodayView>): TodayView => ({ day: '2026-10-26', journey: null, journeys: [], open_visit: null, visits: [], counters: { visits: 0, cadastrou_qr: 0 }, ...over });
  it('nada hoje: não encerrou', () => {
    expect(montarDia(hoje({}), []).encerradaHoje).toBe(false);
  });
  it('jornada encerrada no servidor: encerrou', () => {
    expect(montarDia(hoje({ journeys: [{ ...JV, ended_at: '2026-10-26T20:00:00.000Z' }] }), []).encerradaHoje).toBe(true);
  });
  it('jornada aberta no servidor e o encerrar na fila (sem sinal): encerrou', () => {
    const fila: ItemFila[] = [{ ...base, seq: 1, kind: 'end', payload: POS }];
    const dia = montarDia(hoje({ journey: { ...JV, ended_at: null }, journeys: [{ ...JV, ended_at: null }] }), fila);
    expect(dia.jornada).toBeNull();
    expect(dia.encerradaHoje).toBe(true);
  });
  it('encerrou e iniciou de novo: não está encerrada', () => {
    const fila: ItemFila[] = [{ ...base, seq: 1, kind: 'start', payload: { client_id: 'j2', ...POS } }];
    expect(montarDia(hoje({ journeys: [{ ...JV, ended_at: '2026-10-26T19:00:00.000Z' }] }), fila).encerradaHoje).toBe(false);
  });
  it('jornada aberta no servidor, sem fila: não encerrou', () => {
    expect(montarDia(hoje({ journey: { ...JV, ended_at: null }, journeys: [{ ...JV, ended_at: null }] }), []).encerradaHoje).toBe(false);
  });
});

describe('Roteiro: a linha do progresso (Lovable "4 de 18 clientes visitados · 2 cadastros · tempo médio 14 min")', () => {
  it('com rota', () => {
    const p = progressoDoDia({ feitos: 4, total: 18, cadastros: 2, tempoMedio: 14, comRota: true });
    expect(p.linha).toBe('4 de 18 clientes visitados · 2 cadastros · tempo médio 14 min');
    expect(p.pct).toBe(22);
  });
  it('sem rota: visitas da meta; 1 cadastro no singular; sem visita concluída não há tempo médio', () => {
    expect(progressoDoDia({ feitos: 3, total: 30, cadastros: 1, tempoMedio: null, comRota: false }).linha).toBe('3 de 30 visitas da meta · 1 cadastro');
  });
  it('sem meta nem rota: só o que foi feito; barra em 0', () => {
    const p = progressoDoDia({ feitos: 2, total: null, cadastros: 0, tempoMedio: null, comRota: false });
    expect(p.linha).toBe('2 visitas feitas · 0 cadastros');
    expect(p.pct).toBe(0);
  });
  it('a barra não passa de 100%', () => {
    expect(progressoDoDia({ feitos: 40, total: 30, cadastros: 0, tempoMedio: null, comRota: false }).pct).toBe(100);
  });
  it('tempo médio: só as concluídas, sem as fechadas à meia-noite', () => {
    const v = (checkin_at: string, checkout_at: string | null, auto_closed = false) => ({ checkin_at, checkout_at, auto_closed });
    expect(tempoMedioMin([v('2026-10-26T12:00:00Z', '2026-10-26T12:10:00Z'), v('2026-10-26T13:00:00Z', '2026-10-26T13:20:00Z'), v('2026-10-26T14:00:00Z', null), v('2026-10-26T15:00:00Z', '2026-10-27T03:00:00Z', true)])).toBe(15);
    expect(tempoMedioMin([])).toBeNull();
  });
  it('cadastros do dia = "cadastrou agora" do simples + o QR do completo', () => {
    expect(cadastrosDoDia({ visitas: 5, feitas: 4, fechadas: 1, cadastrou_qr: 1, cadastrou_agora: 2 })).toBe(3);
  });
});

describe('Roteiro: selo da parada visitada', () => {
  it('simples: o resultado escolhido, com a cor da situação', () => {
    expect(seloDaParada({ flow: 'simples', answers: { result: 'cadastrou' } })).toEqual({ rotulo: 'Cadastrou agora', cor: '#16a34a' });
    expect(seloDaParada({ flow: 'simples', answers: { result: 'sem_interesse' } })).toEqual({ rotulo: 'Sem interesse', cor: '#dc2626' });
  });
  it('completo: QR = cadastrou; fechado; o resto só "Visitado"', () => {
    expect(seloDaParada({ answers: { freela_status: 'cadastrou_qr' } }).rotulo).toBe('Cadastrou agora');
    expect(seloDaParada({ answers: { outcome: 'fechado' } }).rotulo).toBe('Estabelecimento fechado');
    expect(seloDaParada({ answers: { freela_status: 'nao_cadastrou' } })).toEqual({ rotulo: 'Visitado', cor: null });
  });
  it('visita que ainda não chegou ao servidor: "Visitado", sem cor', () => {
    expect(seloDaParada(undefined)).toEqual({ rotulo: 'Visitado', cor: null });
  });
});
