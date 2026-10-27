import { z } from 'zod';

/**
 * Cupons da 1ª contratação — wire do contrato §38 (fases L6a/L6b). Na tela é sempre "cupom" (nunca "voucher", UX §0.5/G4).
 * Os schemas não são `.strict()`: campo aditivo do servidor não quebra a tela.
 */

export const SITUACOES = ['pedido', 'reprovado', 'registrado', 'aguardando_empresa', 'aguardando_freela', 'criado', 'usado', 'vencido', 'desativado', 'erro'] as const;
export type Situacao = (typeof SITUACOES)[number];

const paramsSchema = z.object({
  discount_type: z.enum(['PERCENT', 'FIXED']),
  percent_off: z.number().nullable(),
  amount_off_cents: z.number().nullable(),
  single_use: z.boolean(),
  validade_dias: z.number().nullable(),
  min_job_hours: z.number().nullable(),
});
export type ParamsCupom = z.infer<typeof paramsSchema>;

export const campoCupomSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  lead_id: z.string(),
  visit_id: z.string().nullable(),
  company_name: z.string(),
  city: z.string(),
  uf: z.string(),
  segment: z.string(),
  freelas_per_week: z.number(),
  status: z.string(),
  situacao: z.enum(SITUACOES),
  decision_reason: z.string().nullable(),
  decided_at: z.string().nullable(),
  coupon_status: z.string().nullable(),
  coupon_code: z.string().nullable(),
  coupon_expires_at: z.string().nullable(),
  redeemed_at: z.string().nullable(),
  created_at: z.string(),
  coupon: paramsSchema.nullable(),
});
export type CampoCupom = z.infer<typeof campoCupomSchema>;

export const cupomEquipeSchema = campoCupomSchema.extend({
  consultant_id: z.string(),
  consultant_name: z.string(),
  praca_id: z.string(),
  decided_by_name: z.string().nullable(),
  contractor_user_id: z.string().nullable(),
  contractor_name: z.string().nullable(),
  contractor_source: z.string().nullable(),
  coupon_params: paramsSchema.nullable(),
  coupon_error_code: z.string().nullable(),
  coupon_error: z.string().nullable(),
  coupon_attempts: z.number(),
  coupon_last_attempt_at: z.string().nullable(),
  coupon_synced_at: z.string().nullable(),
});
export type CupomEquipe = z.infer<typeof cupomEquipeSchema>;

export const listaCuponsSchema = z.object({
  items: z.array(cupomEquipeSchema),
  counts: z.record(z.number()),
  coupons_enabled: z.boolean(),
  freela_configured: z.boolean(),
});
export type ListaCupons = z.infer<typeof listaCuponsSchema>;

export const eventoCupomSchema = z.object({
  id: z.string(),
  type: z.string(),
  actor_kind: z.string(),
  actor_name: z.string().nullable(),
  reason: z.string().nullable(),
  created_at: z.string(),
});
export const detalheCupomSchema = cupomEquipeSchema.extend({ events: z.array(eventoCupomSchema) });
export type DetalheCupom = z.infer<typeof detalheCupomSchema>;

export const configCupomSchema = z.object({
  max_por_empresa: z.number(),
  discount_type: z.enum(['PERCENT', 'FIXED']),
  percent_off: z.number().nullable(),
  amount_off_cents: z.number().nullable(),
  single_use: z.boolean(),
  validade_dias: z.number().nullable(),
  min_job_hours: z.number().nullable(),
  motivo_reprovacao: z.enum(['obrigatorio', 'opcional']),
  voucher_sync_min: z.number(),
  coupons_enabled: z.boolean().optional(),
});
export type ConfigCupom = z.infer<typeof configCupomSchema>;

export const candidatosSchema = z.object({ q: z.string(), items: z.array(z.object({ user_id: z.string(), name: z.string(), city: z.string().nullable() })) });
export type Candidato = z.infer<typeof candidatosSchema>['items'][number];

/** `features` do lote C no `GET settings/config` (§38.1). Servidor antigo não manda = desligado. */
export const featuresLoteCSchema = z.object({
  segments: z.boolean().optional().default(false),
  vouchers: z.boolean().optional().default(false),
  voucher_coupons: z.boolean().optional().default(false),
});
export type FeaturesLoteC = z.infer<typeof featuresLoteCSchema>;
export const SEM_FEATURES_C: FeaturesLoteC = { segments: false, vouchers: false, voucher_coupons: false };

/** `/campo/me.voucher_config` (só com a flag): o que a tela de pedir escreve sem sinal. */
export interface ConfigCupomCampo {
  discount_type: 'PERCENT' | 'FIXED';
  percent_off: number | null;
  amount_off_cents: number | null;
  single_use: boolean;
  validade_dias: number | null;
  min_job_hours: number | null;
  coupons: boolean;
}

// ── textos (UX §3.2, tabela do ciclo de vida; ícone sempre junto do texto) ──

const dataCurta = (iso: string | null): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).replace('.', '');
};
const diaMes = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';

export interface TextoSituacao {
  icone: string;
  texto: string;
  /** Tom da faixa (a cor nunca vai sozinha: sempre com o ícone e o texto). */
  tom: 'espera' | 'ok' | 'fim';
}

export function situacaoParaConsultor(c: Pick<CampoCupom, 'situacao' | 'decision_reason' | 'coupon_code' | 'redeemed_at' | 'coupon_expires_at'>): TextoSituacao {
  switch (c.situacao) {
    case 'pedido':
      return { icone: '⏳', texto: 'Esperando a equipe aprovar', tom: 'espera' };
    case 'reprovado':
      return { icone: '✕', texto: c.decision_reason ? `Não aprovado: ${c.decision_reason}` : 'Não aprovado', tom: 'fim' };
    case 'registrado':
      return { icone: '✓', texto: 'Aprovado pela equipe', tom: 'ok' };
    case 'aguardando_empresa':
      return { icone: '🏪', texto: 'Falta a empresa ter conta no Freela. O cupom sai sozinho quando ela entrar.', tom: 'espera' };
    case 'aguardando_freela':
    case 'erro':
      return { icone: '⏳', texto: 'Aprovado. Criando o cupom no Freela', tom: 'espera' };
    case 'criado':
      return { icone: '✓', texto: `Cupom pronto: ${c.coupon_code ?? ''}`.trim(), tom: 'ok' };
    case 'usado':
      return { icone: '✓', texto: `Usado ${dataCurta(c.redeemed_at)} na 1ª contratação`.replace('  ', ' '), tom: 'ok' };
    case 'vencido':
      return { icone: '✕', texto: `Venceu ${dataCurta(c.coupon_expires_at)} sem uso`.replace('  ', ' '), tom: 'fim' };
    case 'desativado':
      return { icone: '✕', texto: 'Cupom cancelado pela equipe', tom: 'fim' };
  }
}

export function situacaoParaEquipe(c: Pick<CupomEquipe, 'situacao' | 'decision_reason' | 'decided_by_name' | 'redeemed_at' | 'coupon_error'>): TextoSituacao {
  switch (c.situacao) {
    case 'pedido':
      return { icone: '⏳', texto: 'Pedido · esperando aprovação', tom: 'espera' };
    case 'reprovado':
      return { icone: '✕', texto: `Reprovado${c.decided_by_name ? ` por ${c.decided_by_name}` : ''}${c.decision_reason ? `: ${c.decision_reason}` : ''}`, tom: 'fim' };
    case 'registrado':
      return { icone: '✓', texto: 'Aprovado (cupom no Freela não ligado neste servidor)', tom: 'ok' };
    case 'aguardando_empresa':
      return { icone: '🏪', texto: 'Aprovado · aguardando a empresa se cadastrar no Freela', tom: 'espera' };
    case 'aguardando_freela':
      return { icone: '⏳', texto: c.coupon_error ?? 'Aprovado — aguardando conexão com o Freela', tom: 'espera' };
    case 'erro':
      return { icone: '⚠', texto: `Erro ao criar o cupom: ${c.coupon_error ?? 'o Freela recusou.'}`, tom: 'fim' };
    case 'criado':
      return { icone: '✓', texto: 'Cupom criado · ainda não usado', tom: 'ok' };
    case 'usado':
      return { icone: '✓', texto: `Usado em ${diaMes(c.redeemed_at)}`, tom: 'ok' };
    case 'vencido':
      return { icone: '✕', texto: 'Vencido', tom: 'fim' };
    case 'desativado':
      return { icone: '✕', texto: 'Desativado', tom: 'fim' };
  }
}

/** Chips de situação da equipe (UX §3.2), na ordem do ciclo. */
export const ABAS_EQUIPE: { id: Situacao | 'todos'; rotulo: string }[] = [
  { id: 'pedido', rotulo: 'Pedidos' },
  { id: 'aguardando_empresa', rotulo: 'Aguardando a empresa' },
  { id: 'aguardando_freela', rotulo: 'Aguardando o Freela' },
  { id: 'criado', rotulo: 'Criados' },
  { id: 'usado', rotulo: 'Usados' },
  { id: 'vencido', rotulo: 'Vencidos' },
  { id: 'reprovado', rotulo: 'Reprovados' },
  { id: 'registrado', rotulo: 'Aprovados (só registro)' },
  { id: 'erro', rotulo: 'Com erro' },
  { id: 'desativado', rotulo: 'Desativados' },
  { id: 'todos', rotulo: 'Todos' },
];

// ── Vouchers da equipe no desenho da Lovable (redesenho E5.6, UX §4.8) ──

/** Os três grupos do seletor da Lovable: o nosso ciclo fino cabe em "Aprovado" (aprovado de qualquer jeito, com ou sem cupom). */
export type GrupoCupom = 'pendente' | 'aprovado' | 'reprovado';
export type EscolhaGrupo = GrupoCupom | 'todos';

export function grupoDoCupom(situacao: Situacao): GrupoCupom {
  if (situacao === 'pedido') return 'pendente';
  if (situacao === 'reprovado') return 'reprovado';
  return 'aprovado';
}

/** "Pendente (3)", "Aprovado (5)"…: somados dos `counts` do servidor (a praça e a busca já valem neles). */
export function contarGrupos(counts: Record<string, number>): Record<EscolhaGrupo, number> {
  const out: Record<EscolhaGrupo, number> = { todos: 0, pendente: 0, aprovado: 0, reprovado: 0 };
  for (const s of SITUACOES) {
    const n = counts[s] ?? 0;
    out[grupoDoCupom(s)] += n;
    out.todos += n;
  }
  return out;
}

/**
 * O que pedir ao servidor para cada grupo (`GET …/vouchers?situacao=`, que aceita uma situação só): Pendente e Reprovado vão
 * direto; Todos e Aprovado pedem a lista inteira e "Aprovado" filtra na tela (`doGrupo`).
 */
export const situacaoDoGrupo = (g: EscolhaGrupo): Situacao | undefined => (g === 'pendente' ? 'pedido' : g === 'reprovado' ? 'reprovado' : undefined);

export function doGrupo<T extends { situacao: Situacao }>(itens: readonly T[], g: EscolhaGrupo): T[] {
  return g === 'todos' ? [...itens] : itens.filter((c) => grupoDoCupom(c.situacao) === g);
}

/** O selo da Lovable (Pendente `secondary`, Aprovado `default`, Reprovado `destructive`). */
export const SELO_GRUPO: Record<GrupoCupom, { rotulo: string; variante: 'secondary' | 'default' | 'destructive' }> = {
  pendente: { rotulo: 'Pendente', variante: 'secondary' },
  aprovado: { rotulo: 'Aprovado', variante: 'default' },
  reprovado: { rotulo: 'Reprovado', variante: 'destructive' },
};

/** A situação fina embaixo do selo (UX §4.8); `null` = nada a dizer além do selo. */
export function detalheDaSituacao(c: Pick<CupomEquipe, 'situacao' | 'decision_reason' | 'coupon_code' | 'redeemed_at'>): string | null {
  switch (c.situacao) {
    case 'pedido':
      return null;
    case 'reprovado':
      return c.decision_reason ? `Motivo: ${c.decision_reason}` : null;
    case 'registrado':
      return 'Só registro (o cupom no Freela não está ligado)';
    case 'aguardando_empresa':
      return 'Aguardando a conta no Freela';
    case 'aguardando_freela':
      return 'Na fila do Freela';
    case 'criado':
      return c.coupon_code ? `Cupom criado: ${c.coupon_code}` : 'Cupom criado';
    case 'usado':
      return c.redeemed_at ? `Usado em ${diaMes(c.redeemed_at)}` : 'Usado';
    case 'vencido':
      return 'Vencido';
    case 'desativado':
      return 'Desativado';
    case 'erro':
      return 'Erro ao criar o cupom';
  }
}

/** "100% de desconto · vale 1 vez · 30 dias" (a mesma frase do servidor). */
export function resumoDoCupom(p: Pick<ParamsCupom, 'discount_type' | 'percent_off' | 'amount_off_cents' | 'single_use' | 'validade_dias' | 'min_job_hours'>): string {
  const desconto =
    p.discount_type === 'PERCENT'
      ? `${p.percent_off ?? 0}% de desconto`
      : `R$ ${((p.amount_off_cents ?? 0) / 100).toFixed(2).replace('.', ',')} de desconto`;
  const usos = p.single_use ? 'vale 1 vez' : 'vale mais de uma vez';
  const prazo = p.validade_dias == null ? 'sem prazo' : `${p.validade_dias} ${p.validade_dias === 1 ? 'dia' : 'dias'}`;
  const horas = p.min_job_hours == null ? '' : ` · vagas de ${p.min_job_hours}h ou mais`;
  return `${desconto} · ${usos} · ${prazo}${horas}`;
}

/** Resultados do fluxo simples em que o "Pedir cupom" aparece (some em "Fechado" e "Já usa o Freela": não há 1ª contratação). */
export const RESULTADOS_COM_CUPOM = ['cadastrou', 'retorno', 'sem_interesse'] as const;
export const podePedirCupom = (resultado: string | null | undefined): boolean => (RESULTADOS_COM_CUPOM as readonly string[]).includes(resultado ?? '');

/** Ramos para o chip do pedido (o lead não guarda categoria). */
export const RAMOS = ['Bar', 'Restaurante', 'Lanchonete', 'Padaria', 'Café', 'Pizzaria', 'Hamburgueria', 'Buffet', 'Hotel', 'Outro'] as const;
export const FREELAS_RAPIDOS = [0, 1, 2, 3, 5, 10] as const;

/** Mensagem do WhatsApp para o dono (UX §3.2): o consultor escolhe o contato (sem número no link). */
export function mensagemWhatsApp(c: Pick<CampoCupom, 'coupon_code' | 'coupon' | 'coupon_expires_at'>, consultor: string): string {
  const p = c.coupon;
  const desconto = p ? (p.discount_type === 'PERCENT' ? `${p.percent_off ?? 0}% de desconto` : `R$ ${((p.amount_off_cents ?? 0) / 100).toFixed(2).replace('.', ',')} de desconto`) : 'desconto';
  const usos = p?.single_use === false ? '' : ', vale 1 vez';
  const ate = c.coupon_expires_at ? `, até ${diaMes(c.coupon_expires_at)}` : '';
  return `Olá! Aqui é ${consultor}, do Freela. Seu cupom de 1ª contratação: ${c.coupon_code ?? ''} (${desconto}${usos}${ate}).`;
}

export const linkWhatsApp = (texto: string): string => `https://wa.me/?text=${encodeURIComponent(texto)}`;

/** O pedido mais recente deste estabelecimento (para mostrar o existente no lugar do botão, aceite C6). */
export function pedidoDoLead<T extends Pick<CampoCupom, 'lead_id' | 'created_at' | 'situacao'>>(lista: T[], leadId: string | null | undefined): T | null {
  if (!leadId) return null;
  return lista.filter((c) => c.lead_id === leadId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}
