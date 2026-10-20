import { describe, expect, it } from 'vitest';
import type { ItemFila, TodayView, VisitAnswers, VisitView } from '../campo.types';
import { montarDia } from '../dia-local';

const POS = { at: '2026-10-08T15:00:00.000Z', lat: -19.9, lng: -43.9, accuracy: 10 };
const base = { consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 0 };
const respostas = (freela_status: VisitAnswers['freela_status']) => ({ freela_status }) as VisitAnswers;

const visita = (over: Partial<VisitView>): VisitView =>
  ({
    client_id: 'v1',
    lead_name: 'Bar do Mercado',
    checkin_at: '2026-10-08T14:00:00.000Z',
    checkout_at: null,
    auto_closed: false,
    answers: respostas(null),
    ...over,
  }) as VisitView;

const hoje = (over: Partial<TodayView> = {}): TodayView => ({
  day: '2026-10-08',
  journey: null,
  journeys: [],
  open_visit: null,
  visits: [],
  counters: { visits: 0, cadastrou_qr: 0 },
  ...over,
});

const JORNADA = { client_id: 'j1', started_at: '2026-10-08T12:00:00.000Z' } as TodayView['journey'];

describe('montarDia — o dia como o consultor vê, com a fila por cima', () => {
  it('sem nada: sem jornada', () => {
    expect(montarDia(null, []).jornada).toBeNull();
  });

  it('início guardado sem sinal já mostra a jornada aberta', () => {
    const fila: ItemFila[] = [{ ...base, seq: 1, kind: 'start', payload: { client_id: 'j9', ...POS } }];
    expect(montarDia(hoje(), fila).jornada).toEqual({ client_id: 'j9', started_at: POS.at, pendente: true });
  });

  it('encerrar guardado fecha a jornada que o servidor ainda vê aberta', () => {
    const fila: ItemFila[] = [{ ...base, seq: 1, kind: 'end', payload: POS }];
    expect(montarDia(hoje({ journey: JORNADA }), fila).jornada).toBeNull();
  });

  it('check-in guardado aparece como visita aberta, com o nome do lugar', () => {
    const fila = [
      { ...base, seq: 1, kind: 'checkin', payload: { client_id: 'v9', place_name: 'Bar Novo', ...POS }, foto: new Blob() },
    ] as ItemFila[];
    const dia = montarDia(hoje({ journey: JORNADA }), fila);
    expect(dia.visitaAberta).toMatchObject({ ref: 'v9', nome: 'Bar Novo', pendente: true });
    expect(dia.contadores.visitas).toBe(1);
  });

  it('checkout guardado fecha a visita do servidor; rascunho "cadastrou agora" conta', () => {
    const fila: ItemFila[] = [
      { ...base, seq: 1, kind: 'answers', visit_ref: 'v1', payload: respostas('cadastrou_qr') },
      { ...base, seq: 2, kind: 'checkout', visit_ref: 'v1', payload: POS },
    ];
    const dia = montarDia(hoje({ journey: JORNADA, visits: [visita({})] }), fila);
    expect(dia.visitaAberta).toBeNull();
    expect(dia.visitas[0]).toMatchObject({ ref: 'v1', checkout_at: POS.at, pendente: true, cadastrou_qr: true });
    expect(dia.contadores).toEqual({ visitas: 1, feitas: 1, fechadas: 0, cadastrou_qr: 1 });
  });

  it('visita fechada à meia-noite não é "aberta"', () => {
    const dia = montarDia(hoje({ journey: JORNADA, visits: [visita({ auto_closed: true })] }), []);
    expect(dia.visitaAberta).toBeNull();
  });

  it('checkout bloqueado (422) NÃO fecha a visita: ela segue aberta para o consultor corrigir', () => {
    const fila: ItemFila[] = [{ ...base, seq: 1, kind: 'checkout', visit_ref: 'v1', payload: POS, bloqueio: 'Falta responder: interesse.' }];
    const dia = montarDia(hoje({ journey: JORNADA, visits: [visita({})] }), fila);
    expect(dia.visitaAberta).toMatchObject({ ref: 'v1', checkout_at: null, pendente: true });
  });
});

describe('montarDia — ações de roteiro na fila não mexem no dia', () => {
  it('pular/adiar/desfazer/refazer não criam visita nem mudam a jornada', () => {
    const info = { consultant_id: 'c', tentativas: 0, proxima_em: 0, criado_em: 0 };
    const dia = montarDia(null, [
      { ...info, seq: 1, kind: 'stop_skip', stop_id: 's', payload: { client_id: 'a', reason: 'fechado', at: '2026-10-08T15:00:00.000Z' } },
      { ...info, seq: 2, kind: 'stop_defer', stop_id: 's', payload: { client_id: 'b', at: '2026-10-08T15:00:00.000Z' } },
      { ...info, seq: 3, kind: 'stop_undo', stop_id: 's', payload: { client_id: 'c', at: '2026-10-08T15:00:00.000Z' } },
      { ...info, seq: 4, kind: 'route_reoptimize', payload: { client_id: 'd', at: '2026-10-08T15:00:00.000Z', lat: 0, lng: 0, accuracy: 5 } },
    ]);
    expect(dia.jornada).toBeNull();
    expect(dia.visitas).toEqual([]);
  });

  it('P0 §30.1: visita "fechado" (servidor ou rascunho na fila) fica fora de `feitas`, mas dentro do total', () => {
    const doServidor = visita({ answers: { ...respostas('ja_usa'), outcome: 'fechado' } } as never);
    const dia = montarDia(hoje({ journey: JORNADA, visits: [doServidor, visita({ client_id: 'v2', answers: respostas('ja_usa') } as never)] }), []);
    expect(dia.contadores).toMatchObject({ visitas: 2, feitas: 1, fechadas: 1 });
    // o rascunho na fila marca a segunda como fechada antes do envio
    const fila: ItemFila[] = [{ ...base, seq: 1, kind: 'answers', visit_ref: 'v2', payload: { ...respostas('ja_usa'), outcome: 'fechado' } }];
    expect(montarDia(hoje({ journey: JORNADA, visits: [doServidor, visita({ client_id: 'v2', answers: respostas('ja_usa') } as never)] }), fila).contadores).toMatchObject({ feitas: 0, fechadas: 2 });
  });
});
