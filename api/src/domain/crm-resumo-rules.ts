/**
 * CRM automático (A6) — regras PURAS do resumo do dia (contrato §47.3, arquitetura achado 12). Sem banco nem relógio: as linhas
 * já vêm carregadas e cortadas na janela do dia. Cada número sai com as partes, a conta (`formula`) e a fonte (`source`):
 * regra do dono (08/10). Quem carrega as linhas e serve `GET /v1/crm/summary` é o `resumo.service`.
 */
import { addDays } from '../common/time/dates';
import { AUTOR_AUTOMATICO, AUTOR_AUTOMATICO_FREELA, AUTOR_SYNC_FREELA } from './catalog/crm';
import { FUNNEL_STAGES } from './catalog/funnel';
import { atSpHour } from './send-schedule';

export type Autoria = 'equipe' | 'representante' | 'formulario' | 'cadencia' | 'automatico' | 'outro';

const PREFIXO_REPRESENTANTE = 'Consultor: ';
/** `author_label` gravado pelo formulário público (`public.service`) e pelo motor de cadências. */
const AUTOR_FORMULARIO = 'Formulário';
const AUTOR_CADENCIA = 'Cadência';
const AUTORES_AUTOMATICOS: readonly string[] = [AUTOR_AUTOMATICO, AUTOR_AUTOMATICO_FREELA, AUTOR_SYNC_FREELA];
const AUTORES_FREELA: readonly string[] = [AUTOR_AUTOMATICO_FREELA, AUTOR_SYNC_FREELA];

/**
 * Quem fez o evento. `author_id` nulo NÃO quer dizer máquina (a visita é humana, com rótulo "Consultor: …"), por isso o rótulo manda
 * quando não há `author_id`.
 */
export function autoriaDoEvento(author_id: string | null, author_label: string | null): Autoria {
  if (author_id) return 'equipe';
  const l = author_label ?? '';
  if (l.startsWith(PREFIXO_REPRESENTANTE)) return 'representante';
  if (l.startsWith(AUTOR_FORMULARIO)) return 'formulario';
  if (l.startsWith(AUTOR_CADENCIA)) return 'cadencia';
  if (AUTORES_AUTOMATICOS.includes(l)) return 'automatico';
  return 'outro';
}

/** Janela do dia de Brasília `[início, fim)` — a mesma que o serviço usa nas consultas. */
export function janelaDoDia(day: string): { from: Date; to: Date } {
  return { from: atSpHour(day, 0), to: atSpHour(addDays(day, 1), 0) };
}

/** O instante cai no dia de Brasília `day`? (23:30 de 27/10 em Brasília = 02:30Z de 28/10 e conta em 27/10.) */
export function noDia(at: Date, day: string): boolean {
  const { from, to } = janelaDoDia(day);
  return at >= from && at < to;
}

export interface EventoEtapa {
  author_id: string | null;
  author_label: string | null;
  stage_to: number;
}

export interface EntradaResumo {
  /** Leads criados no dia (sem teste, sem arquivados) por `origem`. */
  leadsPorOrigem: Record<string, number>;
  /** Eventos do dia com `stage_to` não nulo, de qualquer `kind`. */
  eventosEtapa: EventoEtapa[];
  freelaConfigurado: boolean;
  /** "14h00": hora (Brasília) da última leitura do quadro do Freela, se houve. */
  freelaLidoEm: string | null;
  /** Mensagens com `sent_at` no dia, por `msg_sends.mode`. */
  enviadas: { mode: string; n: number }[];
  /** Das `enviadas` fora do modo `freela`: as da cadência (`cadence_id` não nulo; no modo Fila manual o motor marca sozinho). */
  enviadasCadencia: number;
  /** Das `enviadas` fora do modo `freela`: as dos disparos (`disparo_id` não nulo, sem `cadence_id`; alguém marcou à mão). */
  enviadasDisparo: number;
  /** Mensagens com `replied_at` no dia. */
  respostas: number;
}

export interface ParteResumo {
  label: string;
  value: number;
}
export interface NumeroResumo {
  key: string;
  value: number | null;
  parts: ParteResumo[];
  formula: string;
  source: string;
}

const ORIGEM_BUSCA = 'pesquisa automática';
const ORIGEM_VISITA = 'visita de campo';
const ORIGENS_FORMULARIO = ['orgânico', 'tráfego pago'];
const ETAPA_CADASTRADO = 5;
const ETAPA_PRIMEIRA_VAGA = 6;
const ETAPA_CLIENTE_ATIVO = 7;
const NOME_ETAPA = new Map(FUNNEL_STAGES.map((s) => [s.n, s.name]));

/** Concordância: singular só para 1 (0 e 2+ vão no plural). */
const pl = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const soma = (p: ParteResumo[]) => p.reduce((a, x) => a + x.value, 0);
const diaCurto = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** "12 = 8 da busca + 3 de visitas + 1 do formulário": soma das partes; as `fixas` aparecem sempre, as demais só se > 0. */
function conta(total: number, partes: ParteResumo[], fixas: number): string {
  const vistas = partes.filter((p, i) => i < fixas || p.value > 0);
  return `${total} = ${vistas.map((p) => `${p.value} ${p.label}`).join(' + ')}`;
}

export function montarResumo(e: EntradaResumo, day: string): { numbers: NumeroResumo[] } {
  const d = diaCurto(day);
  const numbers: NumeroResumo[] = [];

  // 1. Leads novos, por origem.
  const o = e.leadsPorOrigem;
  const busca = o[ORIGEM_BUSCA] ?? 0;
  const visitas = o[ORIGEM_VISITA] ?? 0;
  const formulario = ORIGENS_FORMULARIO.reduce((a, k) => a + (o[k] ?? 0), 0);
  const total = Object.values(o).reduce((a, n) => a + n, 0);
  const leads: ParteResumo[] = [
    { label: 'da busca', value: busca },
    { label: pl(visitas, 'de visita', 'de visitas'), value: visitas },
    { label: 'do formulário', value: formulario },
    { label: pl(total - busca - visitas - formulario, 'de outra origem', 'de outras origens'), value: total - busca - visitas - formulario },
  ];
  numbers.push({
    key: 'leads_novos',
    value: total,
    parts: leads,
    formula: conta(total, leads, 3),
    source: `Leads criados em ${d} (dia de Brasília), sem os de teste e os arquivados.`,
  });

  // 2. Mudanças de etapa: por autoria e por etapa de destino.
  const porAutoria = new Map<Autoria, number>();
  const porDestino = new Map<number, number>();
  for (const ev of e.eventosEtapa) {
    const a = autoriaDoEvento(ev.author_id, ev.author_label);
    porAutoria.set(a, (porAutoria.get(a) ?? 0) + 1);
    porDestino.set(ev.stage_to, (porDestino.get(ev.stage_to) ?? 0) + 1);
  }
  const n = (a: Autoria) => porAutoria.get(a) ?? 0;
  const etapas: ParteResumo[] = [
    { label: pl(n('automatico'), 'automática', 'automáticas'), value: n('automatico') },
    { label: 'da equipe', value: n('equipe') },
    { label: pl(n('representante'), 'de visita', 'de visitas'), value: n('representante') },
    { label: 'do formulário', value: n('formulario') },
    { label: pl(n('cadencia'), 'da cadência', 'das cadências'), value: n('cadencia') },
    { label: 'de outra origem', value: n('outro') },
  ];
  const totalEtapas = e.eventosEtapa.length;
  const fonteEtapas =
    `Eventos de etapa na ficha dos leads em ${d}. “Automáticas” = autor ${AUTOR_AUTOMATICO}, ${AUTOR_AUTOMATICO_FREELA} ou ${AUTOR_SYNC_FREELA}; ` +
    '“da equipe” = alguém da equipe logado.';
  numbers.push({ key: 'mudancas_etapa', value: totalEtapas, parts: etapas, formula: conta(totalEtapas, etapas, 2), source: fonteEtapas });
  const destinos: ParteResumo[] = [...porDestino.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([etapa, v]) => ({ label: `para ${NOME_ETAPA.get(etapa) ?? `etapa ${etapa}`}`, value: v }));
  numbers.push({
    key: 'mudancas_etapa_destino',
    value: totalEtapas,
    parts: destinos,
    formula: destinos.length ? conta(totalEtapas, destinos, destinos.length) : `${totalEtapas} = nenhuma mudança`,
    source: fonteEtapas,
  });

  // 3. No Freela: chegadas às etapas 5, 6 e 7 pelo Freela (autor automático do Freela ou o sync).
  const doFreela = (etapa: number) =>
    e.eventosEtapa.filter((ev) => ev.stage_to === etapa && !ev.author_id && AUTORES_FREELA.includes(ev.author_label ?? '')).length;
  const lido = e.freelaLidoEm ? ` (quadro de contratantes lido às ${e.freelaLidoEm})` : '';
  const sourceFreela =
    `Mudanças de etapa em ${d} para Cadastrado, Primeira vaga rodada ou Cliente ativo feitas pelo Freela${lido}; conta mudanças, não leads diferentes. ` +
    'Cliente ativo = já tinha 2 ou mais vagas pagas quando o Praça leu o quadro pela primeira vez, ou voltou a contratar num dia depois da primeira vaga paga (como o Praça vê o quadro do Freela).';
  if (!e.freelaConfigurado) {
    numbers.push({ key: 'freela', value: null, parts: [], formula: 'Precisa da conexão com o Freela.', source: sourceFreela });
  } else {
    const f: ParteResumo[] = [
      { label: pl(doFreela(ETAPA_CADASTRADO), 'cadastro', 'cadastros'), value: doFreela(ETAPA_CADASTRADO) },
      { label: pl(doFreela(ETAPA_PRIMEIRA_VAGA), 'primeira contratação', 'primeiras contratações'), value: doFreela(ETAPA_PRIMEIRA_VAGA) },
      { label: pl(doFreela(ETAPA_CLIENTE_ATIVO), 'cliente ativo', 'clientes ativos'), value: doFreela(ETAPA_CLIENTE_ATIVO) },
    ];
    numbers.push({ key: 'freela', value: soma(f), parts: f, formula: conta(soma(f), f, 3), source: sourceFreela });
  }

  // 4. Mensagens enviadas (modo Via Freela x cadência x disparo; UX final, achado 3) e respostas registradas.
  const porModo = (m: string) => e.enviadas.filter((x) => x.mode === m).reduce((a, x) => a + x.n, 0);
  const viaFreela = porModo('freela');
  const totalEnviadas = e.enviadas.reduce((a, x) => a + x.n, 0);
  const cadencia = e.enviadasCadencia;
  const disparo = e.enviadasDisparo;
  // Cadência e disparo são conjuntos separados fora do Freela: o resto (nenhum dos dois) fecha a soma.
  const outra = totalEnviadas - viaFreela - cadencia - disparo;
  const env: ParteResumo[] = [
    { label: pl(viaFreela, 'entregue ao Freela', 'entregues ao Freela'), value: viaFreela },
    { label: pl(cadencia, 'marcada pela cadência', 'marcadas pela cadência'), value: cadencia },
    { label: pl(disparo, 'marcada à mão (disparo)', 'marcadas à mão (disparos)'), value: disparo },
    { label: pl(outra, 'de outra origem', 'de outras origens'), value: outra },
  ];
  numbers.push({
    key: 'mensagens_enviadas',
    value: totalEnviadas,
    parts: env,
    formula: conta(totalEnviadas, env, 3),
    source:
      `Fila de mensagens com envio registrado em ${d}. “Entregues ao Freela” = modo Via Freela (cadência ou disparo); ` +
      '“marcadas pela cadência” e “marcadas à mão” (disparos) = modo Fila manual. ' +
      'No modo Fila manual, a cadência marca a mensagem como enviada no horário dela, mesmo que ninguém tenha mandado. ' +
      'O Praça não sabe se as entregues ao Freela chegaram no WhatsApp.',
  });
  numbers.push({
    key: 'respostas',
    value: e.respostas,
    parts: [{ label: pl(e.respostas, 'resposta registrada', 'respostas registradas'), value: e.respostas }],
    formula: `${e.respostas} = ${e.respostas} ${pl(e.respostas, 'resposta registrada', 'respostas registradas')}`,
    source: `Mensagens com resposta registrada em ${d}. Só conta a resposta registrada no Praça: o WhatsApp não avisa.`,
  });

  return { numbers };
}
