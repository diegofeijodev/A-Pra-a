import type { ItemFila, TodayView } from './campo.types';

export interface VisitaLocal {
  /** `client_id` da visita — é como a fila e a visão `?v=visita&ref=` a conhece. */
  ref: string;
  nome: string;
  checkin_at: string;
  checkout_at: string | null;
  auto_closed: boolean;
  cadastrou_qr: boolean;
  /** Estabelecimento fechado (§30.1): visita sem conversa, fora da meta. */
  fechado: boolean;
  /** Contrato §31.2: fluxo da visita; sem a informação vale `completo`. */
  flow: 'simples' | 'completo';
  /** Fluxo simples: resultado escolhido (`cadastrou`…`fechado`). */
  result: string | null;
  /** Ainda tem envio na fila. */
  pendente: boolean;
}

/** Intervalo da jornada como a tela vê (lote B §37): servidor + fila por cima. */
export interface IntervaloLocal {
  client_id: string;
  started_at: string;
  ended_at: string | null;
  pendente: boolean;
}

export interface DiaLocal {
  /** `praca_id` (lote F2 §44.5): a praça da jornada, do servidor ou do início na fila; ausente sem a flag. */
  jornada: { client_id: string; started_at: string; pendente: boolean; praca_id?: string | null } | null;
  /** Intervalos do dia (só existe algo com o intervalo ligado no servidor). */
  intervalos: IntervaloLocal[];
  intervaloAberto: IntervaloLocal | null;
  visitas: VisitaLocal[];
  visitaAberta: VisitaLocal | null;
  /** `visitas` = total de check-ins do dia; `feitas` = só as com conversa (a conta da meta); `fechadas` = fora da meta. */
  contadores: { visitas: number; feitas: number; fechadas: number; cadastrou_qr: number; cadastrou_agora: number };
}

/**
 * O dia como o consultor vê: o último retrato do servidor (`/today`) com as
 * ações ainda na fila por cima — sem sinal, a tela anda igual.
 */
export function montarDia(today: TodayView | null, fila: ItemFila[], opcoes: { fechadoContaNaMeta?: boolean } = {}): DiaLocal {
  let jornada: DiaLocal['jornada'] = today?.journey
    ? {
        client_id: today.journey.client_id,
        started_at: today.journey.started_at,
        pendente: false,
        ...(today.journey.praca_id ? { praca_id: today.journey.praca_id } : {}),
      }
    : null;
  const visitas: VisitaLocal[] = (today?.visits ?? []).map((v) => ({
    ref: v.client_id,
    nome: v.lead_name,
    checkin_at: v.checkin_at,
    checkout_at: v.checkout_at,
    auto_closed: v.auto_closed,
    cadastrou_qr: v.answers.freela_status === 'cadastrou_qr',
    fechado: v.answers.outcome === 'fechado',
    flow: v.flow ?? 'completo',
    result: v.answers.result ?? null,
    pendente: false,
  }));
  const achar = (ref: string) => visitas.find((v) => v.ref === ref);
  const intervalos: IntervaloLocal[] = (today?.breaks ?? []).map((b) => ({ client_id: b.client_id, started_at: b.started_at, ended_at: b.ended_at, pendente: false }));
  /** Check-in, fim do intervalo e fim da jornada encerram o intervalo aberto (o servidor faz o mesmo, §37.5). */
  const fecharIntervalo = (at: string) => {
    const aberto = intervalos.find((i) => !i.ended_at);
    if (aberto) {
      aberto.ended_at = at < aberto.started_at ? aberto.started_at : at;
      aberto.pendente = true;
    }
  };

  for (const item of [...fila].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    switch (item.kind) {
      case 'start':
        if (jornada?.client_id !== item.payload.client_id) {
          jornada = {
            client_id: item.payload.client_id,
            started_at: item.payload.at,
            pendente: true,
            ...(item.payload.praca_id ? { praca_id: item.payload.praca_id } : {}),
          };
        }
        break;
      case 'end':
        fecharIntervalo(item.payload.at);
        jornada = null;
        break;
      case 'break_start':
        if (!intervalos.some((i) => i.client_id === item.payload.client_id)) {
          intervalos.push({ client_id: item.payload.client_id, started_at: item.payload.at, ended_at: null, pendente: true });
        }
        break;
      case 'break_end':
        fecharIntervalo(item.payload.at);
        break;
      case 'checkin':
        fecharIntervalo(item.payload.at);
        if (!achar(item.payload.client_id)) {
          visitas.push({
            ref: item.payload.client_id,
            nome: item.payload.place_name,
            checkin_at: item.payload.at,
            checkout_at: null,
            auto_closed: false,
            cadastrou_qr: false,
            fechado: false,
            flow: item.payload.flow ?? 'completo',
            result: null,
            pendente: true,
          });
        }
        break;
      case 'signup':
      case 'voucher':
        // Cadastro assistido (§26) e pedido de cupom (§38) não mudam a visita: só saem da fila.
        break;
      case 'answers': {
        const v = achar(item.visit_ref);
        if (v) {
          v.cadastrou_qr = item.payload.freela_status === 'cadastrou_qr';
          // No fluxo simples o rascunho não leva `outcome` (o servidor deriva): vale o resultado escolhido.
          v.fechado = item.payload.outcome === 'fechado' || item.payload.result === 'fechado';
          if (item.payload.result !== undefined) v.result = item.payload.result;
        }
        break;
      }
      case 'checkout': {
        const v = achar(item.visit_ref);
        // Checkout bloqueado (422) não fecha nada: a visita segue aberta para corrigir.
        if (v && !v.checkout_at) {
          if (item.bloqueio) v.pendente = true;
          else {
            v.checkout_at = item.payload.at;
            v.pendente = true;
          }
        }
        break;
      }
      case 'points':
      case 'stop_skip':
      case 'stop_defer':
      case 'stop_undo':
      case 'route_reoptimize':
        break;
    }
  }

  const visitaAberta = [...visitas].reverse().find((v) => !v.checkout_at && !v.auto_closed) ?? null;
  return {
    jornada,
    intervalos,
    intervaloAberto: jornada ? (intervalos.find((i) => !i.ended_at) ?? null) : null,
    visitas,
    visitaAberta,
    contadores: {
      visitas: visitas.length,
      // §31.6: no fluxo simples o "fechado" fotografado conta, se configurado (`fechado_conta_na_meta`).
      feitas: visitas.filter((v) => !v.fechado || (v.flow === 'simples' && opcoes.fechadoContaNaMeta === true)).length,
      fechadas: visitas.filter((v) => v.fechado).length,
      cadastrou_qr: visitas.filter((v) => v.cadastrou_qr).length,
      cadastrou_agora: visitas.filter((v) => v.result === 'cadastrou').length,
    },
  };
}
