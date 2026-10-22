import { describe, expect, it } from 'vitest';
import type { BreakView, ItemFila, TodayView } from '../campo.types';
import { montarDia } from '../dia-local';
import { pausasEmMinutos, ritmoLocal, ritmoTexto } from '@/modules/rotas/domain/rota-local';

const base = { consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 0 };
const JORNADA = { client_id: 'j1', started_at: '2026-10-22T12:00:00.000Z' } as TodayView['journey'];
const hoje = (over: Partial<TodayView> = {}): TodayView => ({
  day: '2026-10-22',
  journey: JORNADA,
  journeys: [],
  open_visit: null,
  visits: [],
  counters: { visits: 0, cadastrou_qr: 0 },
  ...over,
});
const pausa = (over: Partial<BreakView> = {}): BreakView => ({
  id: 'b1',
  client_id: 'p1',
  journey_id: 'j1',
  started_at: '2026-10-22T15:04:00.000Z',
  ended_at: null,
  minutes: 10,
  end_reason: null,
  auto_closed: false,
  clock_adjusted: false,
  ...over,
});
const PARAMS = { meta_diaria: 30, janela_inicio: '09:00', janela_fim: '18:00', almoco_inicio: '12:00', almoco_fim: '13:00' };

describe('montarDia — intervalo (lote B §37)', () => {
  it('sem a flag o servidor não manda breaks: nenhum intervalo (a tela é a de hoje)', () => {
    const d = montarDia(hoje(), []);
    expect(d.intervalos).toEqual([]);
    expect(d.intervaloAberto).toBeNull();
  });
  it('o aberto do servidor; início guardado sem sinal; fim na fila fecha', () => {
    expect(montarDia(hoje({ breaks: [pausa()] }), []).intervaloAberto?.client_id).toBe('p1');
    const inicio: ItemFila[] = [{ ...base, seq: 1, kind: 'break_start', payload: { client_id: 'p9', at: '2026-10-22T15:30:00.000Z' } }];
    expect(montarDia(hoje(), inicio).intervaloAberto).toEqual({ client_id: 'p9', started_at: '2026-10-22T15:30:00.000Z', ended_at: null, pendente: true });
    const fim: ItemFila[] = [...inicio, { ...base, seq: 2, kind: 'break_end', payload: { client_id: 'p10', at: '2026-10-22T16:00:00.000Z' } }];
    const d = montarDia(hoje(), fim);
    expect(d.intervaloAberto).toBeNull();
    expect(d.intervalos[0]!.ended_at).toBe('2026-10-22T16:00:00.000Z');
  });
  it('chegar (check-in) durante o intervalo o encerra na hora da chegada, como o servidor', () => {
    const fila: ItemFila[] = [
      { ...base, seq: 1, kind: 'checkin', payload: { client_id: 'v1', at: '2026-10-22T16:02:00.000Z', lat: 0, lng: 0, accuracy: 5, place_name: 'Bar' }, foto: new Blob() },
    ];
    const d = montarDia(hoje({ breaks: [pausa()] }), fila);
    expect(d.intervaloAberto).toBeNull();
    expect(d.intervalos[0]!.ended_at).toBe('2026-10-22T16:02:00.000Z');
  });
});

describe('ritmo do aparelho com o intervalo (espelho da API)', () => {
  it('sem intervalo: a conta de hoje', () => {
    expect(ritmoLocal(PARAMS, 10, 14 * 60)).toEqual(ritmoLocal(PARAMS, 10, 14 * 60, []));
    expect(ritmoLocal(PARAMS, 10, 14 * 60).minutosUteis).toBe(240);
  });
  it('com intervalo: o real no lugar do almoço (mesmos números da API: 242 às 14h com 12:04–13:02)', () => {
    const r = ritmoLocal(PARAMS, 10, 14 * 60, [{ ini: 12 * 60 + 4, fim: 13 * 60 + 2 }]);
    expect(r.minutosUteis).toBe(242);
    expect(r.esperadas).toBe(15);
    expect(r.minutosPorVisita).toBe(16);
    expect(ritmoTexto(r, PARAMS, 14 * 60).conta).toContain('o intervalo de 58 min não conta');
  });
  it('pausas em minutos de Brasília (o aberto até agora)', () => {
    expect(pausasEmMinutos([{ started_at: '2026-10-22T15:04:00.000Z', ended_at: null }], Date.parse('2026-10-22T15:30:00.000Z'))).toEqual([{ ini: 12 * 60 + 4, fim: 12 * 60 + 30 }]);
  });
});
