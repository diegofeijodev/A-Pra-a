// Regras dos avisos do sino — porta literal de
// `.prototype/src/components/praca/Layout.tsx:42-89` (`useNotifications`).
// Módulo PURO: sem Nest, sem Prisma, sem relógio embutido — "hoje" e "agora"
// sempre entram por parâmetro (quem lê o banco e resolve o relógio é o
// `NotificationsService`).
import { addDays } from '../common/time/dates';
import { FILL_ALERT, FILL_LIMIT_H } from './catalog';
import { occursOn, type RecAction, type RecPraca, type StepStatus } from './recurrence';

/** Ação vista pela regra "amanhã" — os campos de `RecAction` + id/título pro texto. */
export interface NotifAction extends RecAction {
  id: string;
  title: string;
}

/** Etapa vista pela regra de travamento/estagnação — `StepInfo` já resolvido. */
export interface NotifStep {
  n: number;
  status: StepStatus;
  lock_reason: string | null;
}

/** Lead visto pela regra de "crítico" — os mesmos campos de `LeadListView`. */
export interface NotifLead {
  id: string;
  name: string;
  stage: number;
  stalled_days: number;
}

/** Campanha ATIVA já com os números calculados (`CampanhaView.metrics.acima_teto`). */
export interface NotifCampanha {
  id: string;
  name: string;
}

export interface NotifPraca extends RecPraca {
  id: string;
  name: string;
}

export interface BuildNotificationsInput {
  praca: NotifPraca;
  /** "Hoje" em Brasília (`todaySp()`) — vira "amanhã" com `addDays`. */
  today: string;
  /** Instante de agora — só a regra "7+ dias sem conclusão" usa (precisão de hora, não de dia). */
  now: Date;
  /** TODAS as ações da praça (roteiro + fixas), na ordem de exibição. */
  actions: NotifAction[];
  /** As 11 etapas do roteiro já resolvidas (`PracasService.steps`). */
  steps: NotifStep[];
  /** Leads NÃO arquivados da praça — o filtro de "crítico" mora aqui dentro. */
  leads: NotifLead[];
  fill_hours: number | null;
  /** Campanhas ATIVAS da praça que já passaram do teto de custo por cliente novo. */
  campanhas_acima_teto: NotifCampanha[];
}

export interface NotifItem {
  id: string;
  text: string;
  tone: 'warn' | 'info';
}

const SETE_DIAS_MS = 7 * 86_400_000;
/** Lead crítico: mais de 15 dias sem toque — mesmo limiar de `lead-rules.ts#isCritical`. */
const LEAD_CRITICO_DIAS = 15;
/** Etapa 8 (perdido) fica de fora, como em `isCritical`. */
const ETAPA_PERDIDO = 8;

/**
 * Monta os avisos do sino, na MESMA ordem do protótipo: amanhã → etapas
 * travadas/paradas → leads críticos → freio de preenchimento → campanhas
 * acima do teto. Ids SEM o prefixo `<praca_id>:` — quem chama
 * (`NotificationsService`) prefixa antes de devolver no wire (as dispensas
 * são por usuário, e o mesmo `lock-3` de duas praças não pode se confundir).
 */
export function buildNotifications(input: BuildNotificationsInput): NotifItem[] {
  const out: NotifItem[] = [];
  const tomorrow = addDays(input.today, 1);

  // Amanhã: só ação RECORRENTE (a `once` tem data marcada, não "toda vez que cai").
  for (const a of input.actions) {
    if (a.rec.kind === 'once') continue;
    if (occursOn(a, input.praca, tomorrow)) {
      out.push({ id: `tmw-${a.id}`, text: `Amanhã: ${a.title}`, tone: 'info' });
    }
  }

  // Etapas travadas (portão não bateu) ou ativas há 7+ dias sem NENHUMA ação concluída.
  for (const st of input.steps) {
    if (st.status === 'locked') {
      out.push({ id: `lock-${st.n}`, text: `Etapa ${st.n} travada — ${st.lock_reason}`, tone: 'warn' });
      continue;
    }
    if (st.status === 'active') {
      const lastDone = input.actions
        .filter((a) => a.step === st.n)
        .flatMap((a) => [a.completed_at ?? null, ...Object.values(a.completions ?? {}).map((c) => c.at)])
        .filter((v): v is string => !!v)
        .sort()
        .pop();
      if (lastDone && input.now.getTime() - new Date(lastDone).getTime() > SETE_DIAS_MS) {
        out.push({
          id: `stall-${st.n}`,
          text: `Etapa ${st.n} há 7+ dias sem ação concluída — avisar Diego`,
          tone: 'warn',
        });
      }
    }
  }

  // Funil: leads parados (crítico = mais de 15 dias sem toque, fora etapa 8/perdido).
  for (const l of input.leads) {
    if (l.stage === ETAPA_PERDIDO || l.stalled_days <= LEAD_CRITICO_DIAS) continue;
    out.push({ id: `lead-${l.id}`, text: `Lead parado há ${l.stalled_days} dias: ${l.name}`, tone: 'warn' });
  }

  // Campanhas: freio automático por tempo de preenchimento...
  if (input.fill_hours != null && input.fill_hours > FILL_LIMIT_H) {
    out.push({
      id: `fill-${input.praca.id}`,
      text: `${FILL_ALERT} (${input.fill_hours.toFixed(1)}h em ${input.praca.name}) — avisar Diego e Mkt externo`,
      tone: 'warn',
    });
  }

  // ...e teto de custo por cliente novo.
  for (const c of input.campanhas_acima_teto) {
    out.push({ id: `teto-${c.id}`, text: `${c.name} passou do teto de custo por cliente novo`, tone: 'warn' });
  }

  return out;
}
