/**
 * Modo do chefe, S0/S1 (contrato §31) — regras PURAS do fluxo da visita `simples` x `completo`.
 *
 * Sem Prisma nem HTTP. Um ponto de decisão por assunto (nada de `if (modo === 'chefe')` espalhado):
 * `resolverFluxo` (qual fluxo vale), `faltandoSimples` (o que o checkout simples exige),
 * `derivarDoResultado` (resultado → campos antigos), `contaNaMeta` (fechado na meta) e `estagioSimples`.
 *
 * Origem dos valores do "Perfil do chefe": versão Lovable — `src/lib/visita.ts` (`STATUS_FINAL`,
 * `MOTIVOS_NAO`, `pendenciasFinalizar`: contato em todo status menos "fechado"; `precisaJustificativa`:
 * fora do raio exige justificativa) e `roteiro.$rotaId.tsx` (raio de 200 m = `RAIO_LONGE_M`).
 * Os PADRÕES (chave ausente) seguem a spec do designer/arquiteto, que já decidiu por segurança.
 */
import { estagioDepoisDaVisita, vazio, type RespostasVisita } from './campo-rules';

export const FLUXOS_VISITA = ['simples', 'completo'] as const;
export type FluxoVisita = (typeof FLUXOS_VISITA)[number];
export const ehFluxo = (v: unknown): v is FluxoVisita => v === 'simples' || v === 'completo';

/** Resultado do fluxo simples (Lovable `STATUS_FINAL`, agrupado em 5 chips pela spec do designer). */
export const RESULTADOS_SIMPLES = ['cadastrou', 'ja_usa', 'retorno', 'sem_interesse', 'fechado'] as const;
export type ResultadoSimples = (typeof RESULTADOS_SIMPLES)[number];
export const ehResultadoSimples = (v: unknown): v is ResultadoSimples =>
  (RESULTADOS_SIMPLES as readonly unknown[]).includes(v);

export const ROTULO_RESULTADO: Record<ResultadoSimples, string> = {
  cadastrou: 'Cadastrou agora',
  ja_usa: 'Já usa o Freela',
  retorno: 'Quer retorno',
  sem_interesse: 'Sem interesse',
  fechado: 'Estabelecimento fechado',
};

/** Resultados em que faz sentido exigir contato (o "fechado" nunca: não há com quem falar). */
export const RESULTADOS_COM_CONTATO = ['cadastrou', 'ja_usa', 'retorno', 'sem_interesse'] as const;
/** Lote E §41.4: `email` entra no fim da ordem canônica; só vale com `FIELD_CONTACT_EMAIL_ENABLED` (a leitura o tira com a flag desligada). */
export const CAMPOS_CONTATO = ['nome', 'cargo', 'telefone', 'email'] as const;
export type CampoContato = (typeof CAMPOS_CONTATO)[number];
export const JUSTIFICATIVAS_DISTANCIA = ['nao', 'opcional', 'obrigatoria'] as const;
export type JustificativaDistancia = (typeof JUSTIFICATIVAS_DISTANCIA)[number];

// ── configuração (app_settings.field_config) ───────────────────

export interface ConfigModo {
  /** `null` = a equipe não escolheu (com a flag ligada vale `simples`). */
  fluxo_visita: FluxoVisita | null;
  justificativa_distancia: JustificativaDistancia;
  contato_obrigatorio_em: (typeof RESULTADOS_COM_CONTATO)[number][];
  contato_campos: CampoContato[];
  /** Só visitas `simples`: o "fechado" fotografado conta na meta. */
  fechado_conta_na_meta: boolean;
  desfazer_segundos: number;
  /** S3 (contrato §32.7): alerta de divergência declaração × Freela: mínimo de "sem correspondência" e % mínimo. */
  divergencia_alerta_min: number;
  divergencia_alerta_pct: number;
}

export const CONFIG_MODO_PADRAO: ConfigModo = {
  fluxo_visita: null,
  justificativa_distancia: 'opcional',
  contato_obrigatorio_em: ['cadastrou', 'retorno'],
  contato_campos: ['nome', 'cargo', 'telefone'],
  fechado_conta_na_meta: true,
  desfazer_segundos: 8,
  divergencia_alerta_min: 5,
  divergencia_alerta_pct: 40,
};

/**
 * Flag `FIELD_VISIT_FLOW_SELECT_ENABLED` desligada: o "fechado" volta a ficar fora da meta mesmo de uma visita
 * `simples` que tenha ficado de antes de a flag ser desligada (comportamento de antes do modo do chefe).
 */
export const CONFIG_MODO_DESLIGADO: ConfigModo = { ...CONFIG_MODO_PADRAO, fechado_conta_na_meta: false };

/** Os dois botões de preset da tela de configuração: só preenchem o formulário (o admin revisa e salva). */
export const PRESETS_MODO: { completo: ConfigModo; chefe: ConfigModo } = {
  completo: { ...CONFIG_MODO_PADRAO, fluxo_visita: 'completo' },
  chefe: {
    fluxo_visita: 'simples',
    justificativa_distancia: 'obrigatoria',
    contato_obrigatorio_em: ['cadastrou', 'ja_usa', 'retorno', 'sem_interesse'],
    contato_campos: ['nome', 'cargo', 'telefone'],
    fechado_conta_na_meta: true,
    desfazer_segundos: 8,
    divergencia_alerta_min: 5,
    divergencia_alerta_pct: 40,
  },
};

const subconjunto = (permitidos: readonly string[]) => (v: unknown) =>
  Array.isArray(v) &&
  v.length <= permitidos.length &&
  v.every((x) => typeof x === 'string' && permitidos.includes(x)) &&
  new Set(v).size === v.length;

const VALIDADORES: Record<keyof ConfigModo, (v: unknown) => boolean> = {
  fluxo_visita: (v) => v === null || ehFluxo(v),
  justificativa_distancia: (v) => (JUSTIFICATIVAS_DISTANCIA as readonly unknown[]).includes(v),
  contato_obrigatorio_em: subconjunto(RESULTADOS_COM_CONTATO),
  contato_campos: subconjunto(CAMPOS_CONTATO),
  fechado_conta_na_meta: (v) => typeof v === 'boolean',
  desfazer_segundos: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 30,
  divergencia_alerta_min: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1000,
  divergencia_alerta_pct: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 100,
};

export const CHAVES_CONFIG_MODO = Object.keys(VALIDADORES) as (keyof ConfigModo)[];
export const ehChaveDeModo = (k: string): k is keyof ConfigModo => k in VALIDADORES;

/** Ordem canônica (a do contrato), para o JSON salvo não depender da ordem do clique. */
const emOrdem = <T extends string>(valores: T[], ordem: readonly T[]): T[] =>
  ordem.filter((o) => valores.includes(o));

function canonico(c: ConfigModo): ConfigModo {
  return {
    ...c,
    contato_obrigatorio_em: emOrdem(c.contato_obrigatorio_em, RESULTADOS_COM_CONTATO),
    contato_campos: emOrdem(c.contato_campos, CAMPOS_CONTATO),
  };
}

/** Chave ausente ou inválida cai no padrão (o JSON pode ter sido editado à mão). */
export function lerConfigModo(raw: unknown): ConfigModo {
  const base = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c: Record<string, unknown> = { ...CONFIG_MODO_PADRAO };
  for (const k of CHAVES_CONFIG_MODO) if (k in base && VALIDADORES[k](base[k])) c[k] = base[k];
  return canonico(c as unknown as ConfigModo);
}

/** Valida um PUT parcial só com chaves do modo. */
export function aplicarConfigModo(
  atual: ConfigModo,
  parcial: Record<string, unknown>,
): { ok: true; config: ConfigModo } | { ok: false; erro: string } {
  const novo: Record<string, unknown> = { ...atual };
  for (const [k, v] of Object.entries(parcial)) {
    if (!ehChaveDeModo(k)) return { ok: false, erro: `${k}: campo desconhecido.` };
    if (!VALIDADORES[k](v)) return { ok: false, erro: `${k}: valor fora do permitido.` };
    novo[k] = v;
  }
  return { ok: true, config: canonico(novo as unknown as ConfigModo) };
}

// ── qual fluxo vale ────────────────────────────────────────

/**
 * Flag desligada: sempre `completo` (prod idêntica). Ligada: consultor → global → `simples`.
 * (Chave ausente = o padrão do chefe só existe com a flag ligada: é o ato deliberado do dono.)
 */
export function resolverFluxo(p: {
  ligado: boolean;
  global: FluxoVisita | null | undefined;
  consultor: FluxoVisita | null | undefined;
}): FluxoVisita {
  if (!p.ligado) return 'completo';
  if (ehFluxo(p.consultor)) return p.consultor;
  if (ehFluxo(p.global)) return p.global;
  return 'simples';
}

/**
 * No check-in: a dica do aparelho (o fluxo da tela que o consultor viu, mesmo sem sinal) vale enquanto a
 * flag estiver ligada; sem dica, ou flag desligada, vale o resolvido no servidor (contrato §31.2).
 */
export function fluxoDoCheckin(p: {
  ligado: boolean;
  resolvido: FluxoVisita;
  dica: string | null | undefined;
}): FluxoVisita {
  if (!p.ligado) return 'completo';
  return ehFluxo(p.dica) ? p.dica : p.resolvido;
}

// ── resultado → campos antigos ─────────────────────────────

/**
 * Tabela do contrato §31.5. `outcome`, `freela_status` e `needs_followup` são SEMPRE do resultado;
 * `interest` e `followup_what` só entram quando vazios (o que o consultor pôs em "Mais detalhes" vale).
 * Fora de `retorno` o retorno é limpo (não sobra data velha pedindo visita).
 */
export function derivarDoResultado(
  result: ResultadoSimples,
  atual: Pick<RespostasVisita, 'interest' | 'followup_what'>,
): Partial<RespostasVisita> {
  const base: Partial<RespostasVisita> = { outcome: result === 'fechado' ? 'fechado' : 'conversa' };
  switch (result) {
    case 'cadastrou':
      return {
        ...base,
        freela_status: 'declarou',
        needs_followup: false,
        ...(atual.interest ? {} : { interest: 'alto' }),
        ...limpaRetorno(),
      };
    case 'ja_usa':
      return { ...base, freela_status: 'ja_usa', needs_followup: false, ...limpaRetorno() };
    case 'retorno':
      return {
        ...base,
        freela_status: null,
        needs_followup: true,
        ...(atual.interest ? {} : { interest: 'medio' }),
        ...(vazio(atual.followup_what) ? { followup_what: 'Retornar' } : {}),
      };
    case 'sem_interesse':
      return {
        ...base,
        freela_status: 'nao_cadastrou',
        needs_followup: false,
        ...(atual.interest ? {} : { interest: 'nenhum' }),
        ...limpaRetorno(),
      };
    case 'fechado':
      return { ...base, freela_status: null, needs_followup: false, ...limpaRetorno() };
  }
}

const limpaRetorno = (): Partial<RespostasVisita> => ({
  followup_what: null,
  followup_date: null,
  followup_time: null,
});

// ── o que o checkout simples exige ─────────────────────────

/** Mesma ordem da tela: resultado, sub-escolha, contato, justificativa. Mensagens no vocabulário do consultor. */
export function faltandoSimples(
  r: RespostasVisita,
  hoje: string,
  cfg: ConfigModo,
  ctx: { far_from_place: boolean },
): string[] {
  if (!ehResultadoSimples(r.result)) return ['resultado da visita'];
  const f: string[] = [];
  if (r.result === 'sem_interesse' && !r.refusal_reason) f.push('motivo');
  if (r.result === 'retorno') {
    if (!r.followup_date) f.push('quando voltar');
    else if (r.followup_date < hoje) f.push('quando voltar (não pode ser no passado)');
  }
  if ((cfg.contato_obrigatorio_em as readonly string[]).includes(r.result)) {
    if (cfg.contato_campos.includes('nome') && vazio(r.interlocutor_name)) f.push('nome de quem atendeu');
    if (cfg.contato_campos.includes('cargo') && !r.interlocutor_role) f.push('cargo de quem atendeu');
    if (cfg.contato_campos.includes('telefone') && vazio(r.contact_phone)) f.push('telefone de quem atendeu');
    if (cfg.contato_campos.includes('email') && vazio(r.contact_email)) f.push('e-mail de quem atendeu');
  }
  if (ctx.far_from_place && cfg.justificativa_distancia === 'obrigatoria' && vazio(r.distance_note)) {
    f.push('motivo de a visita ter sido longe do local');
  }
  return f;
}

// ── efeitos do checkout ────────────────────────────────────

/**
 * Estágio do lead depois da visita simples (contrato §31.5): `fechado` e `cadastrou` não mudam o número
 * (o cadastro real vem do sync; sair das rotas é S3); os demais como no fluxo completo (1,2 → 3).
 */
export function estagioSimples(result: ResultadoSimples, stage: number): number {
  return result === 'fechado' || result === 'cadastrou' ? stage : estagioDepoisDaVisita(stage);
}

/**
 * A visita conta na meta/ritmo? Hoje (e no `completo`) o "fechado" fica de fora (§30.1); no `simples`,
 * `fechado_conta_na_meta` o traz de volta. "Pular > Fechado" não tem check-in: nunca chega aqui.
 */
export function contaNaMeta(
  v: { outcome?: string | null; flow?: string | null },
  cfg: Pick<ConfigModo, 'fechado_conta_na_meta'>,
): boolean {
  if (v.outcome !== 'fechado') return true;
  return v.flow === 'simples' && cfg.fechado_conta_na_meta;
}

const semPontoFinal = (s: string): string => s.trim().replace(/[.\s]+$/, '');
const diaBR = (s: string | null | undefined): string => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

/** Texto do evento `visit` no CRM do fluxo simples. Nunca leva o telefone do contato (dado de terceiro). */
export function resumoVisitaSimples(
  r: RespostasVisita,
  rotuloMotivo: (k: string | null | undefined) => string | null,
): string {
  if (r.result === 'fechado') {
    return `Visita de campo — estabelecimento fechado.${vazio(r.notes) ? '' : ` Obs.: ${semPontoFinal(r.notes!)}.`}`;
  }
  const rotulo = ehResultadoSimples(r.result) ? ROTULO_RESULTADO[r.result] : '—';
  const motivo = r.result === 'sem_interesse' ? rotuloMotivo(r.refusal_reason) : null;
  const nota =
    r.result === 'sem_interesse' && r.refusal_reason === 'outro' && !vazio(r.refusal_note)
      ? ` (${semPontoFinal(r.refusal_note!)})`
      : '';
  const partes = [`Visita de campo — resultado: ${rotulo}${motivo ? ` (${motivo}${nota})` : ''}`];
  if (!vazio(r.interlocutor_name)) {
    const cargo = r.interlocutor_role
      ? ` (${{ dono: 'Dono', gerente: 'Gerente', outro: 'Outro' }[r.interlocutor_role] ?? '—'})`
      : '';
    partes.push(`atendeu: ${r.interlocutor_name!.trim()}${cargo}`);
  }
  if (r.result === 'retorno') {
    partes.push(
      `Retorno: ${semPontoFinal(r.followup_what ?? 'Retornar')} em ${diaBR(r.followup_date)}${r.followup_time ? ` às ${r.followup_time}` : ''}`,
    );
  }
  if (!vazio(r.distance_note)) partes.push(`Longe do local: ${semPontoFinal(r.distance_note!)}`);
  if (!vazio(r.notes)) partes.push(`Obs.: ${semPontoFinal(r.notes!)}`);
  return `${partes.join('. ')}.`;
}
