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
    expect(dia.contadores).toEqual({ visitas: 1, cadastrou_qr: 1 });
  });

  it('visita fechada à meia-noite não é "aberta"', () => {
    const dia = montarDia(hoje({ journey: JORNADA, visits: [visita({ auto_closed: true })] }), []);
    expect(dia.visitaAberta).toBeNull();
  });
});
