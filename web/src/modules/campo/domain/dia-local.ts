import type { ItemFila, TodayView } from './campo.types';

export interface VisitaLocal {
  /** `client_id` da visita — é como a fila e a visão `?v=visita&ref=` a conhece. */
  ref: string;
  nome: string;
  checkin_at: string;
  checkout_at: string | null;
  auto_closed: boolean;
  cadastrou_qr: boolean;
  /** Ainda tem envio na fila. */
  pendente: boolean;
}

export interface DiaLocal {
  jornada: { client_id: string; started_at: string; pendente: boolean } | null;
  visitas: VisitaLocal[];
  visitaAberta: VisitaLocal | null;
  contadores: { visitas: number; cadastrou_qr: number };
}

/**
 * O dia como o consultor vê: o último retrato do servidor (`/today`) com as
 * ações ainda na fila por cima — sem sinal, a tela anda igual.
 */
export function montarDia(today: TodayView | null, fila: ItemFila[]): DiaLocal {
  let jornada: DiaLocal['jornada'] = today?.journey
    ? { client_id: today.journey.client_id, started_at: today.journey.started_at, pendente: false }
    : null;
  const visitas: VisitaLocal[] = (today?.visits ?? []).map((v) => ({
    ref: v.client_id,
    nome: v.lead_name,
    checkin_at: v.checkin_at,
    checkout_at: v.checkout_at,
    auto_closed: v.auto_closed,
    cadastrou_qr: v.answers.freela_status === 'cadastrou_qr',
    pendente: false,
  }));
  const achar = (ref: string) => visitas.find((v) => v.ref === ref);

  for (const item of [...fila].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    switch (item.kind) {
      case 'start':
        if (jornada?.client_id !== item.payload.client_id) {
          jornada = { client_id: item.payload.client_id, started_at: item.payload.at, pendente: true };
        }
        break;
      case 'end':
        jornada = null;
        break;
      case 'checkin':
        if (!achar(item.payload.client_id)) {
          visitas.push({
            ref: item.payload.client_id,
            nome: item.payload.place_name,
            checkin_at: item.payload.at,
            checkout_at: null,
            auto_closed: false,
            cadastrou_qr: false,
            pendente: true,
          });
        }
        break;
      case 'answers': {
        const v = achar(item.visit_ref);
        if (v) v.cadastrou_qr = item.payload.freela_status === 'cadastrou_qr';
        break;
      }
      case 'checkout': {
        const v = achar(item.visit_ref);
        if (v && !v.checkout_at) {
          v.checkout_at = item.payload.at;
          v.pendente = true;
        }
        break;
      }
      case 'points':
        break;
    }
  }

  const visitaAberta = [...visitas].reverse().find((v) => !v.checkout_at && !v.auto_closed) ?? null;
  return {
    jornada,
    visitas,
    visitaAberta,
    contadores: { visitas: visitas.length, cadastrou_qr: visitas.filter((v) => v.cadastrou_qr).length },
  };
}
