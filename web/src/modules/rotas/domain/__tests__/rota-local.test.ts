import { describe, expect, it } from 'vitest';
import type { ItemFila } from '@/modules/campo/domain/campo.types';
import {
  acoesDaFila,
  aplicarAcoesPendentes,
  distanciaM,
  etaTexto,
  faltam,
  linkMaps,
  linkTel,
  linkWaze,
  maisProximoEmLinhaReta,
  proximaParada,
  reordenarSemSinal,
  ritmoLocal,
  ritmoTexto,
  trechoTexto,
} from '../rota-local';
import type { ConfigRota, RouteView, StopView } from '../rota.schema';

const PARAMS: ConfigRota = {
  meta_diaria: 30,
  janela_inicio: '09:00',
  janela_fim: '18:00',
  almoco_inicio: '12:00',
  almoco_fim: '13:00',
  minutos_por_visita: 8,
  velocidade_kmh: 4.5,
  fator_desvio: 1.3,
  pool_fator: 1.5,
  dias_sem_revisitar: 14,
  estagio_maximo_rota: 4,
  gerar_ao_iniciar: false,
  consultor_pode_gerar: false,
};
const GRAU_M = 111_195;
const stop = (n: number, over: Partial<StopView> = {}): StopView => ({
  id: `s${n}`, route_id: 'r', lead_id: `l${n}`, seq: n, kind: 'planejada', status: 'pendente', fixa: false,
  eta: '10:00', eta_min: 600, planned_minutes: 8, distance_m: 240, name: `Bar ${n}`, address: `Rua ${n}`, phone: '',
  lat: 0, lng: (n * 300) / GRAU_M, skip_reason: null, skip_note: null, deferred_to: null, visit_id: null, ...over,
});
const rota = (stops: StopView[]): RouteView => ({
  id: 'r', consultant_id: 'c', consultant_name: 'Ana', praca_id: 'p', day: '2026-10-20', status: 'ativa', version: 1, source: 'equipe',
  area_id: null, start: { lat: 0, lng: 0 }, params: PARAMS, stops,
  plan: { planned: 0, reserve: 0, walk_km: 0, fits_meta: true, not_fit: 0 },
  progress: { meta: 30, done: 0, skipped: 0, deferred: 0, pending: 0, expected_now: 0, delta: 0 },
  generated_at: '', updated_at: '',
});

describe('links de navegação', () => {
  it('Maps a pé e Waze com coordenada', () => {
    expect(linkMaps({ lat: -23.6021, lng: -46.6658 })).toBe('https://www.google.com/maps/dir/?api=1&destination=-23.6021,-46.6658&travelmode=walking');
    expect(linkWaze({ lat: -23.6021, lng: -46.6658 })).toBe('https://waze.com/ul?ll=-23.6021%2C-46.6658&navigate=yes');
  });
  it('sem coordenada válida usa o endereço (escapado)', () => {
    const p = { lat: NaN, lng: NaN, name: 'Bar do Zé', address: 'R. Gaivota, 120' };
    expect(linkMaps(p)).toContain('destination=Bar%20do%20Z%C3%A9%2C%20R.%20Gaivota%2C%20120');
    expect(linkWaze(p)).toBe('https://waze.com/ul?q=Bar%20do%20Z%C3%A9%2C%20R.%20Gaivota%2C%20120&navigate=yes');
  });
  it('tel só com número plausível', () => {
    expect(linkTel('')).toBeNull();
    expect(linkTel('123')).toBeNull();
    expect(linkTel('(11) 99999-0000')).toBe('tel:+5511999990000');
    expect(linkTel('5511999990000')).toBe('tel:+5511999990000');
  });
});

describe('próxima parada e textos', () => {
  it('é a primeira planejada pendente, na ordem do seq (reserva, pulada e adiada para amanhã não contam)', () => {
    const stops = [stop(3), stop(1, { status: 'pulada' }), stop(2, { status: 'adiada', deferred_to: 'amanha' }), stop(4, { kind: 'reserva' }), stop(5, { status: 'visitada' })];
    expect(proximaParada(stops)?.id).toBe('s3');
    expect(faltam(stops).map((s) => s.id)).toEqual(['s3']);
    expect(proximaParada([stop(1, { status: 'visitada' })])).toBeNull();
  });
  it('acabando as pendentes, a deixada para a tarde volta como próxima; a de amanhã não', () => {
    const stops = [stop(1, { status: 'visitada' }), stop(2, { status: 'adiada', deferred_to: 'tarde', eta: null, eta_min: null }), stop(3, { status: 'adiada', deferred_to: 'amanha' })];
    expect(proximaParada(stops)?.id).toBe('s2');
    expect(faltam(stops).map((s) => s.id)).toEqual(['s2']);
    expect(proximaParada([stop(4), ...stops])?.id).toBe('s4'); // pendente tem prioridade
  });
  it('formata horário e trecho', () => {
    expect(etaTexto('11:40')).toBe('11h40');
    expect(etaTexto(null)).toBe('—');
    expect(trechoTexto(240, 4.5)).toBe('240 m · 4 min a pé');
    expect(trechoTexto(1250, 4.5)).toBe('1,3 km · 17 min a pé');
  });
});

describe('ritmo com a conta', () => {
  const min = (h: number, m = 0) => h * 60 + m;
  it('à frente: 12 feitas às 11h30 (esperado 9)', () => {
    const r = ritmoLocal(PARAMS, 12, min(11, 30));
    expect(r).toMatchObject({ esperadas: 9, delta: 3, faltam: 18, minutosUteis: 150, minutosPorVisita: 16 });
    const t = ritmoTexto(r, PARAMS, min(11, 30));
    expect(t.titulo).toBe('✓ Ritmo: 3 à frente');
    expect(t.ok).toBe(true);
    expect(t.conta).toBe('Às 11h30 o esperado é 9: 150 min úteis ÷ 16 min por visita');
  });
  it('atrás: texto com quantas faltam e o horário final', () => {
    const r = ritmoLocal(PARAMS, 4, min(14));
    const t = ritmoTexto(r, PARAMS, min(14));
    expect(r).toMatchObject({ esperadas: 15, delta: -11, faltam: 26, minutosUteis: 240 }); // 9h–14h = 300 min − 60 de almoço
    expect(t.titulo).toBe('⚠ Ritmo: 11 atrás. Faltam 26 para chegar a 30 às 18h');
    expect(t.ok).toBe(false);
  });
  it('no ponto e almoço não conta', () => {
    expect(ritmoLocal(PARAMS, 11, min(12, 30)).minutosUteis).toBe(180);
    const t = ritmoTexto(ritmoLocal(PARAMS, 11, min(12, 30)), PARAMS, min(12, 30));
    expect(t.titulo).toBe('✓ Ritmo: no ponto');
  });
});

describe('sem sinal: mais próximo em linha reta', () => {
  it('ordena a partir da posição, com empate pelo id', () => {
    const r = maisProximoEmLinhaReta({ lat: 0, lng: 0 }, [stop(3), stop(1), stop(2)]);
    expect(r.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    const daOutraPonta = maisProximoEmLinhaReta({ lat: 0, lng: (3 * 300) / GRAU_M }, [stop(1), stop(2), stop(3)]);
    expect(daOutraPonta.map((s) => s.id)).toEqual(['s3', 's2', 's1']);
  });
  it('reordenarSemSinal: mantém visitadas e fixas, reaproveita os seq e apaga os horários', () => {
    const r = rota([stop(1, { status: 'visitada' }), stop(2), stop(3, { fixa: true }), stop(4), stop(5)]);
    const novo = reordenarSemSinal(r, { lat: 0, lng: (5 * 300) / GRAU_M });
    const porId = new Map(novo.stops.map((s) => [s.id, s]));
    expect(porId.get('s1')).toMatchObject({ seq: 1, status: 'visitada', eta: '10:00' });
    // antes da âncora s3 (seq 3): só s2 e a própria s3 ocupam os seq 2 e 3
    expect(porId.get('s3')!.seq).toBe(3);
    expect(porId.get('s2')!.seq).toBe(2);
    expect(porId.get('s4')!.seq).toBe(4); // depois da âncora (s3), s4 é o mais perto
    expect(porId.get('s5')!.seq).toBe(5);
    expect(porId.get('s2')!.eta).toBeNull();
  });
});

describe('ações ainda na fila por cima do roteiro', () => {
  const base = rota([stop(1), stop(2), stop(3)]);
  it('pular marca a parada com o motivo; desfazer volta', () => {
    const pulou = aplicarAcoesPendentes(base, [{ kind: 'stop_skip', stop_id: 's2', payload: { reason: 'fechado', at: '2026-10-20T14:00:00Z' } }]);
    expect(pulou.stops.find((s) => s.id === 's2')).toMatchObject({ status: 'pulada', skip_reason: 'fechado', eta: null });
    const voltou = aplicarAcoesPendentes(pulou, [{ kind: 'stop_undo', stop_id: 's2', payload: { at: '2026-10-20T14:00:05Z' } }]);
    expect(voltou.stops.find((s) => s.id === 's2')).toMatchObject({ status: 'pendente', skip_reason: null });
  });
  it('deixar para depois: tarde antes do fim do almoço (11h BRT), amanhã depois (14h BRT)', () => {
    const a = aplicarAcoesPendentes(base, [{ kind: 'stop_defer', stop_id: 's1', payload: { at: '2026-10-20T14:00:00Z' } }]);
    expect(a.stops[0]).toMatchObject({ status: 'adiada', deferred_to: 'tarde' });
    const b = aplicarAcoesPendentes(base, [{ kind: 'stop_defer', stop_id: 's1', payload: { at: '2026-10-20T17:00:00Z' } }]);
    expect(b.stops[0]).toMatchObject({ status: 'adiada', deferred_to: 'amanha' });
  });
  it('não mexe em parada visitada nem altera o original', () => {
    const r = rota([stop(1, { status: 'visitada' })]);
    const x = aplicarAcoesPendentes(r, [{ kind: 'stop_skip', stop_id: 's1', payload: { reason: 'outro', at: '2026-10-20T14:00:00Z' } }]);
    expect(x.stops[0]!.status).toBe('visitada');
    expect(base.stops[1]!.status).toBe('pendente');
  });
  it('refazer sem sinal entra na ordem dos eventos', () => {
    const x = aplicarAcoesPendentes(base, [{ kind: 'route_reoptimize', payload: { lat: 0, lng: (3 * 300) / GRAU_M, at: '2026-10-20T14:00:00Z' } }]);
    expect(proximaParada(x.stops)?.id).toBe('s3');
  });
});

it('haversine igual ao da API (metros inteiros)', () => {
  expect(distanciaM({ lat: 0, lng: 0 }, { lat: 0, lng: 1000 / GRAU_M })).toBe(1000);
});

describe('check-in offline numa parada do roteiro', () => {
  const info = { consultant_id: 'c', tentativas: 0, proxima_em: 0, criado_em: 0 };
  const base = rota([stop(1), stop(2), stop(3, { status: 'pulada' })]);
  const checkin = (leadId: string): ItemFila => ({
    ...info, seq: 1, kind: 'checkin', foto: new Blob(['x']),
    payload: { client_id: 'v1', at: '2026-10-20T14:00:00Z', lat: 0, lng: 0, accuracy: 5, lead_id: leadId, place_name: 'Bar 1' },
  });
  it('a parada visitada na fila sai da vez: a próxima passa a ser a seguinte', () => {
    expect(proximaParada(base.stops)?.id).toBe('s1');
    const x = aplicarAcoesPendentes(base, acoesDaFila([checkin('l1')]));
    expect(x.stops.find((s) => s.id === 's1')?.status).toBe('visitada');
    expect(proximaParada(x.stops)?.id).toBe('s2');
  });
  it('lugar novo (sem lead_id) e parada pulada não mudam', () => {
    const novo: ItemFila = { ...checkin('l1'), payload: { client_id: 'v2', at: '2026-10-20T14:00:00Z', lat: 0, lng: 0, accuracy: 5, new_place: { name: 'X' }, place_name: 'X' } } as ItemFila;
    expect(acoesDaFila([novo])).toEqual([]);
    expect(aplicarAcoesPendentes(base, acoesDaFila([checkin('l3')])).stops.find((s) => s.id === 's3')?.status).toBe('pulada');
  });
});

describe('itens da fila de roteiro', () => {
  const info = { consultant_id: 'c', tentativas: 0, proxima_em: 0, criado_em: 0 };
  it('só as ações de roteiro viram "por cima", na ordem de envio (seq)', () => {
    const itens: ItemFila[] = [
      { ...info, seq: 3, kind: 'stop_undo', stop_id: 's2', payload: { client_id: 'u', at: '2026-10-20T14:00:08Z' } },
      { ...info, seq: 1, kind: 'end', payload: { at: '2026-10-20T14:00:00Z', lat: 0, lng: 0, accuracy: 5 } },
      { ...info, seq: 2, kind: 'stop_skip', stop_id: 's2', payload: { client_id: 'k', reason: 'fechado', at: '2026-10-20T14:00:00Z' } },
      { ...info, seq: 4, kind: 'route_reoptimize', payload: { client_id: 'r', at: '2026-10-20T14:01:00Z', lat: 1, lng: 2, accuracy: 5 } },
    ];
    expect(acoesDaFila(itens).map((a) => a.kind)).toEqual(['stop_skip', 'stop_undo', 'route_reoptimize']);
  });
});
