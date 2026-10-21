/**
 * Regras puras dos consultores de campo — spec 2026-10-08, §5 e §7.
 *
 * Sem Prisma nem HTTP: os serviços leem as linhas e passam aqui. É o que deixa
 * distância, carimbo de hora, completude do questionário e regra de estágio
 * testáveis sem subir a API.
 */
import { randomInt } from 'node:crypto';
import { isUuid } from '../common/ids/uuid';
import { MOTIVO_RECUSA_COM_TEXTO, CHAVES_MOTIVO_RECUSA, rotuloMotivoRecusa } from './catalog/refusal';
import { grupoConfig, inteiroEntre } from './config-grupo';
import { norm } from './dedup';

/** Raio "longe do local" de hoje. Fase L0: vira `field_config.raio_checkin_m` com este MESMO padrão (contrato §23.1). */
export const RAIO_LONGE_M = 200;
export const RAIO_DUPLICADO_M = 100;
export const RAIO_PERTO_M = 500;
/** O aparelho pode estar até 2 min adiantado. */
export const FUTURO_TOLERADO_MS = 2 * 60_000;
/** A fila offline pode mandar até 24 h depois. */
export const PASSADO_MAXIMO_MS = 24 * 60 * 60_000;

export const CARGOS = ['dono', 'gerente', 'outro'] as const;
export const FREELA_STATUS = ['ja_usa', 'cadastrou_qr', 'nao_cadastrou'] as const;
export const INTERESSES = ['alto', 'medio', 'baixo', 'nenhum'] as const;
/** Resultado da visita (contrato §30.1): `fechado` = chegou e o estabelecimento estava fechado. */
export const RESULTADOS_VISITA = ['conversa', 'fechado'] as const;
export type ResultadoVisita = (typeof RESULTADOS_VISITA)[number];
export const HORA_RETORNO_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const PIX_TIPOS = ['cpf', 'email', 'telefone', 'aleatoria'] as const;

/** Lista inicial de "apps e canais que usa hoje" (§5, `app_settings.field_channels`). */
export const CANAIS_PADRAO = ['Nenhum', 'Grupos de WhatsApp', 'Indicação de conhecidos', 'Agência de mão de obra'];

export const ROTULO_CARGO: Record<string, string> = { dono: 'Dono', gerente: 'Gerente', outro: 'Outro' };
export const ROTULO_FREELA: Record<string, string> = {
  ja_usa: 'já usa o Freela',
  cadastrou_qr: 'cadastrou agora pelo QR',
  nao_cadastrou: 'não cadastrou',
  // Modo do chefe (contrato §31.5): valor derivado do resultado `cadastrou`; não é aceito no rascunho (FREELA_STATUS).
  declarou: 'declarou o cadastro',
};
export const ROTULO_INTERESSE: Record<string, string> = { alto: 'alto', medio: 'médio', baixo: 'baixo', nenhum: 'nenhum' };

export interface Coordenada {
  lat: number;
  lng: number;
}

const RAIO_TERRA_M = 6_371_000;
const rad = (g: number): number => (g * Math.PI) / 180;

/** Distância em metros (haversine), arredondada. */
export function distanciaM(a: Coordenada, b: Coordenada): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * RAIO_TERRA_M * Math.asin(Math.sqrt(h)));
}

/**
 * Marca "longe do local": só marca, não bloqueia; sem localização no estabelecimento, sem marca. Comparação ESTRITA
 * (`>`): exatamente no raio não é longe. Sem `raioM`, o de sempre (200 m).
 */
export function marcaLonge(
  checkin: Coordenada,
  lugar: { lat: number | null; lng: number | null },
  raioM: number = RAIO_LONGE_M,
): { distance_m: number | null; far_from_place: boolean } {
  if (lugar.lat == null || lugar.lng == null) return { distance_m: null, far_from_place: false };
  const d = distanciaM(checkin, { lat: lugar.lat, lng: lugar.lng });
  return { distance_m: d, far_from_place: d > raioM };
}

/** `field_config.raio_checkin_m` (contrato §23.1, Lovable `configuracoes.raio_checkin_m`): 50–1000 m, padrão 200. Sem flag. */
export interface ConfigCheckin {
  raio_checkin_m: number;
}
export const CONFIG_CHECKIN = grupoConfig<ConfigCheckin>({ raio_checkin_m: RAIO_LONGE_M }, { raio_checkin_m: inteiroEntre(50, 1000) });

/** Retângulo que contém o círculo — filtro barato no banco antes do haversine. */
export function caixaEnvolvente(c: Coordenada, raioM: number) {
  const dLat = raioM / 111_320;
  const dLng = raioM / (111_320 * Math.max(Math.cos(rad(c.lat)), 0.01));
  return { latMin: c.lat - dLat, latMax: c.lat + dLat, lngMin: c.lng - dLng, lngMax: c.lng + dLng };
}

/**
 * Hora do registro (§7): vale a do aparelho se estiver entre o piso (início da
 * jornada; `null` antes de existir jornada) e agora + 2 min, e no máximo 24 h no
 * passado. Fora disso, a hora de recebimento — com a marca `ajustado`, para não
 * aceitar horário inventado nem perder o registro.
 */
export function carimbo(at: string | null | undefined, agora: Date, piso: Date | null): { at: Date; ajustado: boolean } {
  const t = at ? new Date(at) : null;
  if (!t || Number.isNaN(t.getTime())) return { at: agora, ajustado: true };
  const min = Math.max(agora.getTime() - PASSADO_MAXIMO_MS, piso?.getTime() ?? Number.NEGATIVE_INFINITY);
  const max = agora.getTime() + FUTURO_TOLERADO_MS;
  if (t.getTime() < min || t.getTime() > max) return { at: agora, ajustado: true };
  return { at: t, ajustado: false };
}

/** As respostas do questionário como o banco guarda (`null` = não respondido). */
export interface RespostasVisita {
  interlocutor_name: string | null;
  interlocutor_role: string | null;
  freela_status: string | null;
  interest: string | null;
  open_vagas: number | null;
  vaga_roles: string[];
  freelas_per_week: number | null;
  channels: string[];
  channel_other: string | null;
  needs_followup: boolean | null;
  followup_what: string | null;
  followup_date: string | null;
  notes: string | null;
  /** P0 §30 — todos opcionais: ausente = `conversa` / sem motivo / sem hora / sem telefone. */
  outcome?: string | null;
  refusal_reason?: string | null;
  refusal_note?: string | null;
  followup_time?: string | null;
  contact_phone?: string | null;
  /** Modo do chefe §31 — só o fluxo `simples` preenche; ausente = `null`. */
  result?: string | null;
  distance_note?: string | null;
}

export const RESPOSTAS_VAZIAS: RespostasVisita = {
  interlocutor_name: null,
  interlocutor_role: null,
  freela_status: null,
  interest: null,
  open_vagas: null,
  vaga_roles: [],
  freelas_per_week: null,
  channels: [],
  channel_other: null,
  needs_followup: null,
  followup_what: null,
  followup_date: null,
  notes: null,
  outcome: 'conversa',
  refusal_reason: null,
  refusal_note: null,
  followup_time: null,
  contact_phone: null,
  result: null,
  distance_note: null,
};

export const vazio = (s: string | null | undefined): boolean => !s || !s.trim();

/** O que falta para o checkout (§7, "Questionário completo"), na ordem da tela. */
export function faltando(r: RespostasVisita, hoje: string): string[] {
  const f: string[] = [];
  // Estabelecimento fechado (§30.1): não houve com quem conversar, então o questionário não se exige;
  // mas, se o consultor marcou retorno ("volto amanhã"), o retorno precisa de o quê e de uma data válida.
  if (r.outcome === 'fechado') {
    if (r.needs_followup === true) faltandoRetorno(r, hoje, f);
    return f;
  }
  if (vazio(r.interlocutor_name)) f.push('nome de quem atendeu');
  if (!r.interlocutor_role) f.push('cargo de quem atendeu');
  if (!r.freela_status) f.push('situação no Freela');
  if (!r.interest) f.push('interesse');
  if (r.open_vagas == null) f.push('vagas abertas');
  else if (r.open_vagas > 0 && r.vaga_roles.length === 0) f.push('funções das vagas');
  if (r.freelas_per_week == null) f.push('freelancers por semana');
  if (r.channels.length === 0 && vazio(r.channel_other)) f.push('apps e canais que usa');
  if (r.needs_followup == null) f.push('se pediu retorno');
  else if (r.needs_followup) faltandoRetorno(r, hoje, f);
  return f;
}

function faltandoRetorno(r: RespostasVisita, hoje: string, f: string[]): void {
  if (vazio(r.followup_what)) f.push('o que fazer no retorno');
  if (!r.followup_date) f.push('data do retorno');
  else if (r.followup_date < hoje) f.push('data do retorno (não pode ser no passado)');
}

const semPontoFinal = (s: string): string => s.trim().replace(/[.\s]+$/, '');
const diaBR = (s: string | null): string => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

/** Texto do evento `visit` no CRM — uma frase por pergunta. */
export function resumoVisita(r: RespostasVisita): string {
  if (r.outcome === 'fechado') {
    return `Visita de campo — estabelecimento fechado.${vazio(r.notes) ? '' : ` Obs.: ${semPontoFinal(r.notes!)}.`}`;
  }
  const partes = [
    `Visita de campo — atendeu: ${r.interlocutor_name?.trim() || '—'} (${ROTULO_CARGO[r.interlocutor_role ?? ''] ?? '—'})`,
    `Freela: ${ROTULO_FREELA[r.freela_status ?? ''] ?? '—'}`,
    `Interesse: ${ROTULO_INTERESSE[r.interest ?? ''] ?? '—'}`,
    ...(rotuloMotivoRecusa(r.refusal_reason)
      ? [
          `Motivo da recusa: ${rotuloMotivoRecusa(r.refusal_reason)}${
            r.refusal_reason === MOTIVO_RECUSA_COM_TEXTO && !vazio(r.refusal_note) ? ` (${semPontoFinal(r.refusal_note!)})` : ''
          }`,
        ]
      : []),
    (r.open_vagas ?? 0) > 0 ? `Vagas abertas: ${r.open_vagas} (${r.vaga_roles.join(', ')})` : 'Vagas abertas: 0',
    `Freelancers por semana: ${r.freelas_per_week ?? 0}`,
  ];
  const canais = [...r.channels, ...(vazio(r.channel_other) ? [] : [`outro: ${r.channel_other!.trim()}`])];
  partes.push(`Canais: ${canais.join(', ') || '—'}`);
  partes.push(
    r.needs_followup
      ? `Retorno: ${semPontoFinal(r.followup_what ?? '')} em ${diaBR(r.followup_date)}${r.followup_time ? ` às ${r.followup_time}` : ''}`
      : 'Retorno: não pediu',
  );
  if (!vazio(r.notes)) partes.push(`Obs.: ${semPontoFinal(r.notes!)}`);
  return `${partes.join('. ')}.`;
}

/**
 * Motivo de recusa sobre o estado JÁ MESCLADO (o PATCH é parcial): só vale com interesse "nenhum"
 * numa conversa; a nota (texto livre curto) só vale com o motivo "outro".
 */
export function normalizarRecusa(m: {
  interest: string | null;
  outcome?: string | null;
  /** Modo do chefe §31.5: o resultado `sem_interesse` vale como interesse "nenhum" para o motivo. */
  result?: string | null;
  refusal_reason: string | null;
  refusal_note: string | null;
}): { refusal_reason: string | null; refusal_note: string | null } {
  const vale = (m.interest === 'nenhum' || m.result === 'sem_interesse') && (m.outcome ?? 'conversa') === 'conversa' && !!m.refusal_reason && CHAVES_MOTIVO_RECUSA.includes(m.refusal_reason);
  if (!vale) return { refusal_reason: null, refusal_note: null };
  const nota = m.refusal_reason === MOTIVO_RECUSA_COM_TEXTO ? m.refusal_note?.trim() || null : null;
  return { refusal_reason: m.refusal_reason, refusal_note: nota };
}

/** A hora do retorno só faz sentido se o consultor pediu retorno. */
export function normalizarRetorno(m: { needs_followup: boolean | null; followup_time: string | null }): { followup_time: string | null } {
  return { followup_time: m.needs_followup === true && m.followup_time && HORA_RETORNO_RE.test(m.followup_time) ? m.followup_time : null };
}

/**
 * Telefone do contato (§30.3): só dígitos; tira o `55` quando sobram 12–13; exige 10–11 com DDD
 * 11–99 e não aceita todos os dígitos iguais. Vazio/nulo limpa. Nunca devolve o texto recebido
 * em mensagem de erro (dado pessoal de terceiro).
 */
export function normalizarTelefoneContato(bruto: string | null | undefined): { ok: true; valor: string | null } | { ok: false } {
  if (bruto == null) return { ok: true, valor: null };
  let d = bruto.replace(/\D/g, '');
  if (d === '') return bruto.trim() === '' ? { ok: true, valor: null } : { ok: false };
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return { ok: false };
  if (Number(d.slice(0, 2)) < 11 || /^(\d)\1+$/.test(d)) return { ok: false };
  return { ok: true, valor: d };
}

/** `(11) 9****-4321` (11 dígitos) ou `(11) ****-7890` (10). */
export function mascararTelefoneContato(d: string | null | undefined): string | null {
  if (!d) return null;
  const x = d.replace(/\D/g, '');
  if (x.length === 11) return `(${x.slice(0, 2)}) ${x[2]}****-${x.slice(7)}`;
  if (x.length === 10) return `(${x.slice(0, 2)}) ****-${x.slice(6)}`;
  return null;
}

/** A visita é conversa presencial: 1 ou 2 → 3; de 3 em diante mantém (5 é do bloco C). */
export const estagioDepoisDaVisita = (stage: number): number => (stage === 1 || stage === 2 ? 3 : stage);

/** Palavras que não distinguem um estabelecimento de outro. */
const GENERICAS = new Set([
  'bar', 'restaurante', 'lanchonete', 'padaria', 'cafe', 'pizzaria', 'hamburgueria',
  'churrascaria', 'boteco', 'casa', 'dos', 'das', 'the',
]);

const palavras = (s: string): Set<string> =>
  new Set(
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 3 && !GENERICAS.has(p)),
  );

/** "Nome parecido" para a pergunta "Já existe 'X' a 40 m — é esse?". */
export function nomeParecido(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [curto, longo] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (curto.length >= 4 && longo.includes(curto)) return true;
  const pa = palavras(a);
  const pb = palavras(b);
  if (pa.size === 0 || pb.size === 0) return false;
  const comuns = [...pa].filter((p) => pb.has(p)).length;
  return comuns / Math.min(pa.size, pb.size) >= 0.5;
}

/** CPF com os dois dígitos verificadores; sequência repetida é inválida. */
export function cpfValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number): number => {
    let soma = 0;
    for (let i = 0; i < n; i += 1) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A chave Pix tem a forma do tipo escolhido. */
export function pixValido(tipo: string, chave: string): boolean {
  const c = chave.trim();
  switch (tipo) {
    case 'cpf':
      return cpfValido(c);
    case 'email':
      return EMAIL_RE.test(c);
    case 'telefone': {
      const d = c.replace(/\D/g, '');
      return d.length === 10 || d.length === 11 || (d.startsWith('55') && (d.length === 12 || d.length === 13));
    }
    case 'aleatoria':
      return isUuid(c);
    default:
      return false;
  }
}

/** Forma guardada da chave Pix (o bloco D usa como está). */
export function normalizarPix(tipo: string, chave: string): string {
  if (tipo === 'cpf' || tipo === 'telefone') return chave.replace(/\D/g, '');
  return chave.trim().toLowerCase();
}

export type SituacaoHoje = 'em_jornada' | 'encerrou' | 'nao_iniciou';

/** Situação do dia na lista da equipe, a partir das jornadas de hoje. */
export function situacaoHoje(jornadasDeHoje: { ended_at: Date | null }[]): SituacaoHoje {
  if (jornadasDeHoje.some((j) => j.ended_at === null)) return 'em_jornada';
  return jornadasDeHoje.length > 0 ? 'encerrou' : 'nao_iniciou';
}

const ALFABETO_SENHA = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Senha provisória de 10 caracteres, sem os ambíguos (0/o, 1/l/i). */
export function gerarSenhaProvisoria(sorteio: (max: number) => number = randomInt): string {
  let s = '';
  for (let i = 0; i < 10; i += 1) s += ALFABETO_SENHA[sorteio(ALFABETO_SENHA.length)];
  return s;
}
