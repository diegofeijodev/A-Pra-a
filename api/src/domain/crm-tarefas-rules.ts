/**
 * CRM automático (A5) — regras PURAS das tarefas do dia. Sem banco nem relógio: as linhas já vêm carregadas e "hoje" ("YYYY-MM-DD",
 * Brasília) chega por parâmetro. Quem carrega as linhas e serve `GET /v1/crm/tasks` é o `tarefas.service`.
 *
 * Prioridade (ordem de `TIPOS_TAREFA`): send > cadence_send > hot_visit > next_step > stalled > first_vacancy. Um lead aparece UMA vez, no
 * grupo de maior prioridade. `cadence_send` é só informação (o motor já gravou a mensagem como enviada), mas também "usa" o lead.
 * A prioridade vale antes do filtro `person`: o grupo de um lead não muda conforme quem olha.
 */
import { addDays, daysBetween, todaySp } from '../common/time/dates';
import {
  DIAS_AJUDAR_PUBLICAR,
  DIAS_CONVERSA_PARADA,
  DIAS_SEM_CONTATO_T5,
  DIAS_VISITA_QUENTE,
  ITENS_POR_GRUPO,
} from './catalog/crm';

export const TIPOS_TAREFA = ['send', 'cadence_send', 'hot_visit', 'next_step', 'stalled', 'first_vacancy'] as const;
export type TipoTarefa = (typeof TIPOS_TAREFA)[number];

const ETAPA_PERDIDO = 8;
const ETAPA_CADASTRADO = 5;

/** O que as regras precisam do lead (dias em "YYYY-MM-DD"). */
export interface LeadTarefa {
  id: string;
  name: string;
  owner_id: string | null;
  stage: number;
  phone: string | null;
  archived: boolean;
  is_test: boolean;
  snooze_until: string | null;
  stage_since: string;
  /** Dia de `last_contact_at`, se houver. */
  last_contact_day: string | null;
  next_step_what: string | null;
  next_step_date: string | null;
  next_step_from_cadence: boolean;
  /** `freela_hirings` (contratações pagas no Freela); null = desconhecido. */
  freela_hirings: number | null;
}

/** Mensagem em `msg_sends` modo `fila`. O chamador já separa: `envios` = disparo em `status 'fila'`; `envios_cadencia` = cadência (`sent_at`). */
export interface EnvioFila {
  send_id: string;
  lead_id: string;
  text: string;
  scheduled_at: Date;
  sent_at: Date | null;
  /** Ex.: "Disparo Verão" ou "Cadência Boas-vindas · passo 2" (o chamador monta; sem o passo, só o nome). */
  origin_label: string;
}

/** Visita encerrada (`checkout_at` não nulo). `interest` como está no banco ('alto' | 'medio' | 'baixo', sem acento). */
export interface VisitaQuente {
  lead_id: string;
  checkout_at: Date;
  interest: string | null;
  consultant_name: string;
}

export interface EntradaTarefas {
  leads: LeadTarefa[];
  envios: EnvioFila[];
  envios_cadencia: EnvioFila[];
  visitas: VisitaQuente[];
  cadastros: { lead_id: string; first_vacancy_at: Date | null }[];
  /**
   * lead_id -> DIA (Brasília) do contato mais recente da equipe: evento `call | msg_out | msg_in | visit` com `author_id` não nulo
   * (evento automático não conta). Sem entrada = nenhum contato conhecido.
   */
  contatos_recentes: Map<string, string>;
}

/** Item do `GET /v1/crm/tasks` (contrato §47, snake_case). */
export interface ItemTarefa {
  lead_id: string;
  lead_name: string;
  owner_id: string | null;
  stage: number;
  phone: string | null;
  send_id?: string;
  text?: string;
  scheduled_at?: string;
  origin_label?: string;
  visit?: { consultant_name: string; day: string; interest: string };
  next_step?: { what: string | null; date: string; from_cadence: boolean };
  last_contact_day?: string;
  stage_since?: string;
  readonly?: true;
}

export interface GrupoTarefa {
  task: TipoTarefa;
  total: number;
  items: ItemTarefa[];
}

export interface ResultadoTarefas {
  counts: { me: number; all: number };
  groups: GrupoTarefa[];
}

interface Candidato {
  lead: LeadTarefa;
  item: ItemTarefa;
  /** Chave de ordenação dentro do grupo (crescente). */
  ordem: string;
}

const base = (l: LeadTarefa): ItemTarefa => ({
  lead_id: l.id,
  lead_name: l.name,
  owner_id: l.owner_id,
  stage: l.stage,
  phone: l.phone,
});

const maisAntigo = <T>(xs: T[], chave: (x: T) => number): T | undefined =>
  xs.reduce<T | undefined>((m, x) => (m === undefined || chave(x) < chave(m) ? x : m), undefined);

const porLead = <T extends { lead_id: string }>(xs: T[]): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(x.lead_id, [...(m.get(x.lead_id) ?? []), x]);
  return m;
};

function itemEnvio(l: LeadTarefa, e: EnvioFila, readonly: boolean): ItemTarefa {
  return {
    ...base(l),
    send_id: e.send_id,
    text: e.text,
    scheduled_at: e.scheduled_at.toISOString(),
    origin_label: e.origin_label,
    ...(readonly ? { readonly: true as const } : {}),
  };
}

export function montarTarefas(
  e: EntradaTarefas,
  hoje: string,
  eu: string,
  person: 'all' | 'me',
): ResultadoTarefas {
  const leads = new Map(e.leads.filter((l) => !l.archived && !l.is_test && !(l.snooze_until && l.snooze_until > hoje)).map((l) => [l.id, l]));
  const porTipo = new Map<TipoTarefa, Candidato[]>(TIPOS_TAREFA.map((t) => [t, []]));
  const usados = new Set<string>();
  const entrar = (tipo: TipoTarefa, lead: LeadTarefa, item: ItemTarefa, ordem: string): void => {
    if (usados.has(lead.id)) return;
    usados.add(lead.id);
    porTipo.get(tipo)!.push({ lead, item, ordem });
  };

  // send: disparo na fila com horário até o fim de hoje (atrasadas entram); uma por lead, a mais antiga.
  for (const [id, xs] of porLead(e.envios)) {
    const l = leads.get(id);
    const envio = maisAntigo(
      xs.filter((x) => todaySp(x.scheduled_at) <= hoje),
      (x) => x.scheduled_at.getTime(),
    );
    if (l && envio) entrar('send', l, itemEnvio(l, envio, false), envio.scheduled_at.toISOString());
  }

  // cadence_send: cadência já enviada hoje (Brasília). Só leitura; o mais recente do dia representa o lead.
  for (const [id, xs] of porLead(e.envios_cadencia)) {
    const l = leads.get(id);
    const doDia = xs.filter((x) => x.sent_at && todaySp(x.sent_at) === hoje);
    const envio = maisAntigo(doDia, (x) => -x.sent_at!.getTime());
    if (l && envio) entrar('cadence_send', l, itemEnvio(l, envio, true), envio.sent_at!.toISOString());
  }

  // hot_visit: a ÚLTIMA visita encerrada do lead decide (se a última foi fria, visita quente mais velha não vale).
  // Contato da equipe "depois" = dia do contato > dia do checkout; no mesmo dia o evento é a própria visita (granularidade de dia).
  for (const [id, xs] of porLead(e.visitas)) {
    const l = leads.get(id);
    const v = maisAntigo(xs, (x) => -x.checkout_at.getTime());
    if (!l || !v || l.stage >= ETAPA_CADASTRADO) continue;
    if (v.interest !== 'alto' && v.interest !== 'medio') continue;
    const dia = todaySp(v.checkout_at);
    const idade = daysBetween(dia, hoje);
    if (idade < DIAS_VISITA_QUENTE.min || idade > DIAS_VISITA_QUENTE.max) continue;
    const contato = e.contatos_recentes.get(id);
    if (contato && contato > dia) continue;
    entrar(
      'hot_visit',
      l,
      { ...base(l), visit: { consultant_name: v.consultant_name, day: dia, interest: v.interest } },
      dia,
    );
  }

  // next_step: vencido ou de hoje, fora de "Perdido".
  for (const l of leads.values()) {
    if (!l.next_step_date || l.next_step_date > hoje || l.stage === ETAPA_PERDIDO) continue;
    entrar(
      'next_step',
      l,
      { ...base(l), next_step: { what: l.next_step_what, date: l.next_step_date, from_cadence: l.next_step_from_cadence } },
      l.next_step_date,
    );
  }

  // stalled: etapas 3 e 4; último contato (lead ou equipe, o mais novo) ou, sem contato, a entrada na etapa.
  for (const l of leads.values()) {
    if (l.stage !== 3 && l.stage !== 4) continue;
    const contatos = [l.last_contact_day, e.contatos_recentes.get(l.id)].filter((d): d is string => !!d);
    const ultimo = contatos.length ? contatos.reduce((a, b) => (a > b ? a : b)) : l.stage_since;
    if (daysBetween(ultimo, hoje) < DIAS_CONVERSA_PARADA) continue;
    entrar('stalled', l, { ...base(l), last_contact_day: ultimo }, ultimo);
  }

  // first_vacancy: cadastrada há 3+ dias, sem 1ª vaga/contratação e sem contato da equipe nos últimos 3 dias.
  const primeiraVaga = new Set(e.cadastros.filter((c) => c.first_vacancy_at).map((c) => c.lead_id));
  for (const l of leads.values()) {
    if (l.stage !== ETAPA_CADASTRADO || daysBetween(l.stage_since, hoje) < DIAS_AJUDAR_PUBLICAR) continue;
    if (primeiraVaga.has(l.id) || (l.freela_hirings ?? 0) >= 1) continue;
    const contato = e.contatos_recentes.get(l.id);
    if (contato && contato > addDays(hoje, -DIAS_SEM_CONTATO_T5)) continue;
    entrar('first_vacancy', l, { ...base(l), stage_since: l.stage_since }, l.stage_since);
  }

  const meu = (c: Candidato): boolean => c.lead.owner_id === eu || c.lead.owner_id === null;
  const groups = TIPOS_TAREFA.map((task): GrupoTarefa => {
    const todos = [...porTipo.get(task)!].sort(
      (a, b) => a.ordem.localeCompare(b.ordem) || a.item.lead_name.localeCompare(b.item.lead_name) || a.item.lead_id.localeCompare(b.item.lead_id),
    );
    const vistos = person === 'me' ? todos.filter(meu) : todos;
    return { task, total: vistos.length, items: vistos.slice(0, ITENS_POR_GRUPO).map((c) => c.item) };
  });
  const todosCands = [...porTipo.values()].flat();
  return { counts: { me: todosCands.filter(meu).length, all: todosCands.length }, groups };
}
