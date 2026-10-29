import { ROTA } from '@/modules/acesso/domain/enderecos';
import { addDays, daySp, WD_SHORT } from '@/lib/dates';
import type { AutomacoesView } from '../infrastructure/crm.api';

/**
 * Textos da tela Automações (UX §3.2.2): tudo função pura, sem React nem relógio próprio (o "agora" entra por parâmetro).
 * A API manda só chaves, situação e contagens; o que cada automação faz mora aqui. A situação de quem está "bloqueado" vem do
 * servidor (`blocked_by`): a tela não adivinha.
 */

type Job = AutomacoesView['jobs'][number];

export const JOBS_ORDEM = ['auto_leads_busca', 'etapas_cadastro', 'quadro_freela', 'sem_resposta'] as const;
type JobConhecido = (typeof JOBS_ORDEM)[number];

export interface InfoJob {
  titulo: string;
  faz: string;
  /** "Quando roda" (e a linha de apoio de quem ainda não rodou). */
  quando: string;
  /** Quando tentar de novo, depois de uma rodada que falhou. */
  proxima: string;
  /** Só o admin: a chave (e as outras variáveis) que liga no servidor. */
  chave: string;
  extras: string[];
  /** Quem não é admin lê isto, com a automação desligada. */
  paraLigar: string;
}

/** Mensagens é do Comercial e não tem entrada no `ROTA`; `?aba=` é o que a tela lê (`abaDeMensagens`). */
export const MENSAGENS = '/mensagens';

const PARA_LIGAR = 'Para ligar, fale com o administrador.';

export const CATALOGO_JOBS: Record<JobConhecido, InfoJob> = {
  auto_leads_busca: {
    titulo: 'Achados da busca entram no funil',
    faz:
      'Quando uma busca de estabelecimentos termina, os achados viram leads em “Lead novo”, até 300 por busca. O que passar disso fica na busca ' +
      'para escolher à mão. Shoppings continuam à mão. Esses leads também alimentam os roteiros do campo. Uma busca que terminou com a chave ' +
      'desligada continua manual: ligar depois não puxa o que ficou para trás.',
    quando: 'Roda no fim de cada busca.',
    proxima: 'na próxima busca',
    chave: 'CRM_AUTO_LEADS_FROM_SEARCH_ENABLED',
    extras: [],
    paraLigar: PARA_LIGAR,
  },
  etapas_cadastro: {
    titulo: 'Etapa pelo cadastro do representante',
    faz:
      'Quando a empresa que o representante cadastrou tem a 1ª contratação concluída no Freela, o lead vai para “Primeira vaga rodada”. ' +
      'A 1ª vaga publicada vira uma anotação na ficha.',
    quando: 'Roda de hora em hora, das 6h às 23h, junto com a sincronização dos cadastros.',
    proxima: 'na próxima hora cheia',
    chave: 'CRM_AUTO_STAGES_ENABLED',
    extras: ['FIELD_SIGNUP_SYNC_ENABLED', 'FIELD_ASSISTED_SIGNUP_ENABLED (no Freela)'],
    paraLigar: PARA_LIGAR,
  },
  quadro_freela: {
    titulo: 'Etapa e leads pelo Freela',
    faz:
      'O Praça lê as empresas do Freela. Cadastrou: “Cadastrado”. 1 contratação paga: “Primeira vaga rodada”. 2 ou mais: “Cliente ativo”. ' +
      'Empresa nova na cidade de uma praça aberta, cadastrada depois do início da praça, vira lead. A empresa é ligada ao lead pelo ' +
      'telefone, nunca pelo nome.',
    quando: 'Roda de 2 em 2 horas, das 8h às 20h.',
    proxima: 'na próxima rodada (de 2 em 2 horas, das 8h às 20h)',
    chave: 'CRM_FREELA_PIPELINE_ENABLED',
    extras: ['FREELA_ADMIN_EMAIL', 'FREELA_ADMIN_PASSWORD'],
    paraLigar: PARA_LIGAR,
  },
  sem_resposta: {
    titulo: 'Sem resposta vai para Perdido / reaquecer',
    faz:
      'Lead em “Contatado” há 21 dias sem contato e fora de cadência vai para “Perdido / reaquecer”, com o motivo “não respondeu”, e volta à ' +
      'fila da Entrada em 30 dias. Nunca toca em arquivado nem em lead de teste.',
    quando: 'Roda todo dia, a partir das 6h10.',
    proxima: 'em cerca de 1 hora',
    chave: 'CRM_AUTO_LOST_ENABLED',
    extras: [],
    paraLigar: PARA_LIGAR,
  },
};

const info = (key: string): InfoJob | undefined => (CATALOGO_JOBS as Record<string, InfoJob>)[key];

// ── datas ───────────────────────────────────────────────────

const HORA_SP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hhmm = (d: Date): string => {
  const p = HORA_SP.formatToParts(d);
  const h = p.find((x) => x.type === 'hour')?.value ?? '00';
  const m = p.find((x) => x.type === 'minute')?.value ?? '00';
  return `${h}h${m}`;
};

/** "14h02" (Brasília). */
export const horaDita = hhmm;

/** "hoje 14h02", "ontem 22h00", "seg 26/10 17h05" (Brasília). Texto que não é data = "". */
export function quandoDito(iso: string, agora: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = daySp(d);
  const hoje = daySp(agora);
  if (dia === hoje) return `hoje ${hhmm(d)}`;
  if (dia === addDays(hoje, -1)) return `ontem ${hhmm(d)}`;
  const [y, m, dd] = dia.split('-').map(Number);
  const sem = WD_SHORT[new Date(Date.UTC(y!, m! - 1, dd!)).getUTCDay()];
  return `${sem} ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')} ${hhmm(d)}`;
}

// ── números do resumo ───────────────────────────────────────

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** `summary` é `unknown` na API: lê `a.b.c` como número, 0 se faltar. */
function num(summary: unknown, caminho: string): number {
  let v: unknown = summary;
  for (const k of caminho.split('.')) {
    if (!v || typeof v !== 'object') return 0;
    v = (v as Record<string, unknown>)[k];
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

const semConexao = (j: Job): boolean => (j.last_run?.summary as { nao_configurado?: unknown } | null | undefined)?.nao_configurado === true;

// ── situação ────────────────────────────────────────────────

export type TipoSituacao = 'desligada' | 'parada' | 'falhou' | 'nunca' | 'ligada';
export interface Situacao {
  tipo: TipoSituacao;
  rotulo: string;
  apoio?: string;
}

/** Selo de situação, na ordem da UX §3.2.2: desligada, parada, falhou, nunca rodou, ligada. */
export function situacaoDoJob(j: Job, agora: Date): Situacao {
  const i = info(j.key);
  if (!j.enabled) return { tipo: 'desligada', rotulo: 'Desligada', apoio: 'Não faz nada até ser ligada no servidor.' };
  if (j.blocked_by === 'freela') {
    return { tipo: 'parada', rotulo: 'Parada: falta o Freela', apoio: 'Ligada no servidor, mas sem a conexão com o Freela ela não faz nada.' };
  }
  if (j.blocked_by === 'signup_sync') {
    return {
      tipo: 'parada',
      rotulo: 'Parada: falta a sincronização dos cadastros',
      apoio: 'Ligada no servidor, mas sem a sincronização dos cadastros ela não faz nada.',
    };
  }
  if (j.last_run && !j.last_run.ok) {
    const quando = quandoDito(j.last_run.at, agora);
    return {
      tipo: 'falhou',
      rotulo: 'Falhou na última rodada',
      apoio: `A última rodada não terminou${quando ? ` (${quando})` : ''}. O Praça tenta de novo ${i?.proxima ?? 'na próxima rodada'}.`,
    };
  }
  if (!j.last_run) return { tipo: 'nunca', rotulo: 'Ligada · ainda não rodou', ...(i ? { apoio: i.quando } : {}) };
  return { tipo: 'ligada', rotulo: 'Ligada' };
}

/** "às 14h01" (hoje), "ontem às 22h00", "seg 26/10 às 17h05": a hora sozinha só quando é de hoje. */
function conferidoEm(iso: string, agora: Date): string {
  const quando = quandoDito(iso, agora);
  if (!quando) return '';
  const hora = horaDita(new Date(iso));
  const dia = quando.slice(0, -hora.length).trim();
  return dia === 'hoje' ? `às ${hora}` : `${dia} às ${hora}`;
}

/** "Última rodada": quando e o que fez. */
export function textoUltimaRodada(j: Job, agora: Date): string {
  const r = j.last_run;
  if (!r) return 'ainda não rodou';
  const quando = quandoDito(r.at, agora);
  if (!r.ok) return `${quando} · não terminou`;
  if (semConexao(j)) return `não rodou: falta a conexão com o Freela (conferido ${conferidoEm(r.at, agora)})`;
  const s = r.summary;
  let o: string;
  switch (j.key) {
    case 'auto_leads_busca': {
      const n = num(s, 'adicionados');
      const ja = num(s, 'ja_na_praca');
      o = n === 0 ? 'nenhum lead entrou' : `${n} ${plural(n, 'lead entrou', 'leads entraram')}${ja > 0 ? ` (${ja} já ${plural(ja, 'estava', 'estavam')} no funil)` : ''}`;
      break;
    }
    case 'etapas_cadastro': {
      const vistos = num(s, 'vistos');
      const sobem = num(s, 'subiram.6');
      o = `${vistos} ${plural(vistos, 'cadastro conferido', 'cadastros conferidos')} · ${
        sobem === 0 ? 'nenhum lead mudou de etapa' : `${sobem} ${plural(sobem, 'lead foi', 'leads foram')} para Primeira vaga rodada`
      }`;
      break;
    }
    case 'quadro_freela': {
      const lidas = num(s, 'cartoes');
      const mudou = num(s, 'etapas.5') + num(s, 'etapas.6') + num(s, 'etapas.7');
      const criados = num(s, 'criados');
      o =
        `${lidas} ${plural(lidas, 'empresa lida', 'empresas lidas')} · ` +
        (mudou === 0 ? 'nenhum lead mudou de etapa' : `${mudou} ${plural(mudou, 'lead mudou', 'leads mudaram')} de etapa`) +
        (criados > 0 ? ` · ${criados} ${plural(criados, 'lead novo', 'leads novos')}` : '');
      break;
    }
    case 'sem_resposta': {
      const p = num(s, 'perdidos');
      o = p === 0 ? 'nenhum lead foi para Perdido / reaquecer' : `${p} ${plural(p, 'lead foi', 'leads foram')} para Perdido / reaquecer`;
      break;
    }
    default:
      o = '';
  }
  return o ? `${quando} · ${o}` : quando;
}

const NOME_ETAPA: Record<string, string> = { '5': 'Cadastrado', '6': 'Primeira vaga rodada', '7': 'Cliente ativo' };

/** "Últimos 7 dias": as contagens somadas pela API, em frase. Tudo zero = "nada". */
export function textoUltimos7Dias(j: Job): string {
  const d = j.last_7d;
  const g = (k: string) => d[k] ?? 0;
  const partes: string[] = [];
  switch (j.key) {
    case 'auto_leads_busca': {
      if (g('adicionados') > 0) partes.push(`${g('adicionados')} ${plural(g('adicionados'), 'lead criado', 'leads criados')}`);
      if (g('acima_do_teto') > 0) partes.push(`${g('acima_do_teto')} ${plural(g('acima_do_teto'), 'ficou', 'ficaram')} para escolher à mão`);
      if (g('ja_na_praca') > 0) partes.push(`${g('ja_na_praca')} ${plural(g('ja_na_praca'), 'já estava', 'já estavam')} na praça ou ${plural(g('ja_na_praca'), 'foi adicionado', 'foram adicionados')} à mão`);
      break;
    }
    case 'etapas_cadastro': {
      if (g('subiram.6') > 0) partes.push(`${g('subiram.6')} ${plural(g('subiram.6'), 'lead foi', 'leads foram')} para Primeira vaga rodada`);
      if (g('subiram.5') > 0) partes.push(`${g('subiram.5')} ${plural(g('subiram.5'), 'lead foi', 'leads foram')} para Cadastrado`);
      if (g('vagas') > 0) partes.push(`${g('vagas')} ${plural(g('vagas'), 'primeira vaga anotada', 'primeiras vagas anotadas')}`);
      break;
    }
    case 'quadro_freela': {
      const por = ['5', '6', '7'].map((e) => ({ e, n: g(`etapas.${e}`) }));
      const total = por.reduce((a, x) => a + x.n, 0);
      if (total > 0) {
        const det = por.filter((x) => x.n > 0).map((x) => `${NOME_ETAPA[x.e]} ${x.n}`).join(' · ');
        partes.push(`${total} ${plural(total, 'lead mudou', 'leads mudaram')} de etapa (${det})`);
      }
      if (g('criados') > 0) partes.push(`${g('criados')} ${plural(g('criados'), 'lead novo do Freela', 'leads novos do Freela')}`);
      if (g('ambiguos') > 0) {
        partes.push(`${g('ambiguos')} ${plural(g('ambiguos'), 'empresa sem lead certo', 'empresas sem lead certo')} (o telefone está em mais de um lead)`);
      }
      break;
    }
    case 'sem_resposta': {
      if (g('perdidos') > 0) partes.push(`${g('perdidos')} ${plural(g('perdidos'), 'lead foi', 'leads foram')} para Perdido / reaquecer`);
      break;
    }
  }
  return partes.length ? partes.join(' · ') : 'nada';
}

// ── só o admin ──────────────────────────────────────────────

/** "Como ligar": só para o admin e só com a automação desligada. */
export function comoLigar(j: Job, admin: boolean): string | null {
  const i = info(j.key);
  if (!admin || j.enabled || !i) return null;
  const extras = i.extras.length ? ` Também precisa de: ${i.extras.join(', ')}.` : '';
  return (
    `Esta automação liga no servidor, não nesta tela. Quem cuida do servidor grava ${i.chave}=true no .env e reinicia a API.${extras} ` +
    'Ordem sugerida: Tarefas, etapas, busca e, com a conta do Freela, a sincronização e o quadro do Freela.'
  );
}

/** "Detalhe técnico": o texto cru do erro, só para o admin e só com a última rodada falhando. */
export function detalheTecnico(j: Job, admin: boolean): string | null {
  if (!admin || !j.enabled || !j.last_run || j.last_run.ok) return null;
  return j.last_run.error?.trim() || null;
}

// ── faixas e mensagens ──────────────────────────────────────

export const AVISO_NADA_LIGADO = 'Nenhuma automação está ligada ainda. O funil só muda pela equipe e pelas visitas.';

const NUM_EXTENSO: Record<number, [string, string]> = { 1: ['Uma', 'parada'], 2: ['Duas', 'paradas'] };

/** Faixa do Freela: só se ele não está conectado e alguma automação ligada depende dele. */
export function avisoDoFreela(v: AutomacoesView): string | null {
  if (v.freela_configured) return null;
  const paradas = v.jobs.filter((j) => j.enabled && j.blocked_by === 'freela');
  if (paradas.length === 0) return null;
  const nomes = paradas.map((j) => info(j.key)?.titulo ?? j.key);
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
  const [qtd, estado] = NUM_EXTENSO[paradas.length] ?? [`${paradas.length}`, 'paradas'];
  const [sujeito, verbo] = paradas.length === 1 ? [`${qtd} automação`, 'dependem dele e está parada'] : [`${qtd} automações`, `dependem dele e estão ${estado}`];
  return `O Freela não está conectado. ${sujeito} e o envio “Via Freela” ${verbo}: ${lista}.`;
}

export interface ModoEnvio {
  titulo: string;
  texto: string;
  selo?: string;
  acao: { rotulo: string; href: string };
}

/** Modo de envio das cadências (`app_settings.mode`). */
export function modoDeEnvio(modo: string, freelaConfigurado: boolean): ModoEnvio {
  if (modo === 'freela') {
    return {
      titulo: 'Modo de envio: Via Freela',
      ...(freelaConfigurado
        ? {
            texto:
              'As mensagens saem sozinhas pelo número de campanhas do Freela. Se o WhatsApp do Freela parar, elas não chegam, e o Praça não fica ' +
              'sabendo: confira em Mensagens, aba Disparos.',
          }
        : {
            // `freela-outbox.service.ts`: sem a conexão, os envios do modo `freela` ficam em `fila` esperando; a T1 só lê o modo `fila`.
            texto:
              'Sem a conexão com o Freela, nenhuma mensagem sai: as das cadências e dos disparos ficam esperando na fila e saem quando a ' +
              'conexão voltar. Elas não viram tarefa.',
            selo: 'Parada: falta o Freela',
          }),
      acao: { rotulo: 'Abrir os disparos', href: `${MENSAGENS}?aba=disparos` },
    };
  }
  return {
    titulo: 'Modo de envio: Fila manual',
    // Desenho §12.1 item 1: a cadência grava a mensagem já como enviada (grupo só de leitura); só o disparo fica para o "Feito".
    texto:
      'As mensagens não saem sozinhas: quem manda é a equipe, pelo WhatsApp. As das cadências aparecem em Tarefas, em “Mensagens das ' +
      'cadências de hoje”, já marcadas como enviadas. As dos disparos viram a tarefa “Mandar mensagem”, com o texto pronto.',
    acao: { rotulo: 'Ver as tarefas', href: ROTA.tarefas },
  };
}

export const contaDaCadencia = (n: number): string => `${n} ${plural(n, 'lead dentro agora', 'leads dentro agora')}`;
