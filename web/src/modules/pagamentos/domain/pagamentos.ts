/**
 * Pagamento por Pix manual (contrato §29) — tipos do fio e funções PURAS de texto/estado.
 * Nenhuma regra de valor mora aqui: o servidor calcula e valida. O Praça só REGISTRA o Pix feito fora do sistema.
 */
import { z } from 'zod';
import { brl, rotuloSemana } from '@/modules/remuneracao/domain/remuneracao';

export { brl, rotuloSemana };

export const STATUS = ['pending', 'paid', 'failed', 'cancelled'] as const;
export type StatusPagamento = (typeof STATUS)[number];

export const pagamentoSchema = z.object({
  id: z.string(),
  consultant_id: z.string(),
  consultant_name: z.string().nullable(),
  praca_id: z.string().nullable(),
  week: z.object({ from: z.string(), to: z.string() }),
  due_cents: z.number().int(),
  status: z.enum(STATUS),
  blocked: z.boolean(),
  block_reason: z.string().nullable(),
  pix_key_type: z.string().nullable(),
  pix_key_masked: z.string().nullable(),
  pix_date: z.string(),
  pix_label: z.string(),
  paid_cents: z.number().int().nullable(),
  diff_cents: z.number().int().nullable(),
  diff_reason: z.string().nullable(),
  paid_at: z.string().nullable(),
  paid_by: z.string().nullable(),
  method: z.string(),
  has_proof: z.boolean(),
  proof_mime: z.string().nullable(),
  note: z.string().nullable(),
  last_reason: z.string().nullable(),
  created_at: z.string(),
  conta: z.array(z.string()),
});
export type Pagamento = z.infer<typeof pagamentoSchema>;

export const listaSchema = z.object({
  week: z.object({ from: z.string(), to: z.string() }),
  pix_date: z.string(),
  summary: z.object({
    to_pay_cents: z.number().int(),
    blocked_cents: z.number().int(),
    failed_cents: z.number().int(),
    paid_cents: z.number().int(),
    counts: z.object({ pending: z.number(), blocked: z.number(), failed: z.number(), paid: z.number(), cancelled: z.number() }),
    conta: z.array(z.string()),
    source: z.string(),
  }),
  proof_required: z.boolean(),
  payouts: z.array(pagamentoSchema),
});
export type ListaPagamentos = z.infer<typeof listaSchema>;

export const gerarSchema = z.object({
  week: z.object({ from: z.string(), to: z.string() }),
  created: z.number().int(),
  blocked: z.number().int(),
  existing: z.number().int(),
  unblocked: z.number().int(),
  skipped_non_positive: z.number().int(),
  payouts: z.array(pagamentoSchema),
});
export type ResultadoGerar = z.infer<typeof gerarSchema>;

export const detalheSchema = pagamentoSchema.extend({
  balance_cents: z.number().int(),
  already_paid: z.boolean().optional(),
  events: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      from_status: z.string().nullable(),
      to_status: z.string().nullable(),
      actor: z.string().nullable(),
      reason: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});
export type DetalhePagamento = z.infer<typeof detalheSchema>;

export const chaveSchema = z.object({ pix_key: z.string(), pix_key_type: z.string() });

export const pagamentosCampoSchema = z.object({
  payouts: z.array(
    z.object({
      id: z.string(),
      week: z.object({ from: z.string(), to: z.string() }),
      due_cents: z.number().int(),
      status: z.enum(STATUS),
      label: z.string(),
      pix_date: z.string(),
      pix_label: z.string(),
      paid_cents: z.number().int().nullable(),
      paid_at: z.string().nullable(),
      has_proof: z.boolean(),
      text: z.string(),
    }),
  ),
});
export type PagamentosCampo = z.infer<typeof pagamentosCampoSchema>;

export const alertaPixSchema = z.object({
  kind: z.enum(['pix_bloqueado', 'pix_falhou']),
  payout_id: z.string(),
  consultant_id: z.string(),
  name: z.string(),
  week: z.object({ from: z.string(), to: z.string() }),
  message: z.string(),
});
export type AlertaPix = z.infer<typeof alertaPixSchema>;

// ── estado e textos ───────────────────────────────────────────────────────

export function rotuloStatus(p: Pick<Pagamento, 'status' | 'blocked'>): string {
  if (p.blocked && p.status === 'pending') return 'Bloqueado: falta chave Pix';
  return { pending: 'A pagar', paid: 'Pago', failed: 'Falhou', cancelled: 'Cancelado' }[p.status];
}

export type Tom = 'ok' | 'atencao' | 'erro' | 'neutro';

export function tomDoStatus(p: Pick<Pagamento, 'status' | 'blocked'>): Tom {
  if (p.status === 'paid') return 'ok';
  if (p.status === 'failed' || (p.blocked && p.status === 'pending')) return 'erro';
  if (p.status === 'pending') return 'atencao';
  return 'neutro';
}

export interface Acoes {
  pagar: boolean;
  falhou: boolean;
  tentarDeNovo: boolean;
  cancelar: boolean;
  estornar: boolean;
  verChave: boolean;
}

/** O que cada botão pode fazer (espelha as transições do servidor; ele é quem decide de verdade). */
export function acoesDisponiveis(p: Pick<Pagamento, 'status' | 'blocked'>): Acoes {
  const bloqueado = p.blocked && p.status !== 'cancelled';
  return {
    pagar: !bloqueado && (p.status === 'pending' || p.status === 'failed'),
    falhou: !bloqueado && p.status === 'pending',
    tentarDeNovo: !bloqueado && p.status === 'failed',
    cancelar: p.status === 'pending' || p.status === 'failed',
    estornar: p.status === 'paid',
    verChave: !p.blocked && p.status !== 'cancelled',
  };
}

/** Fila: o que precisa de ação vem primeiro (bloqueado/falhou), depois a pagar, depois pago. */
export function ordenarFila<T extends Pick<Pagamento, 'status' | 'blocked' | 'consultant_name'>>(lista: readonly T[]): T[] {
  const peso = (p: T) => (p.blocked && p.status === 'pending' ? 0 : p.status === 'failed' ? 1 : p.status === 'pending' ? 2 : p.status === 'paid' ? 3 : 4);
  return [...lista].sort((a, b) => peso(a) - peso(b) || (a.consultant_name ?? '').localeCompare(b.consultant_name ?? '', 'pt-BR'));
}

/** Confirmação com a consequência escrita (antes de gravar). */
export function textoConfirmarPagamento(p: Pick<Pagamento, 'consultant_name' | 'due_cents'>, pagoCents: number): string[] {
  const nome = p.consultant_name ?? 'o consultor';
  const linhas = [
    `Registrar que você JÁ pagou ${brl(pagoCents)} em Pix para ${nome}. O Praça não envia dinheiro: isso só anota o pagamento feito no seu banco.`,
  ];
  if (pagoCents !== p.due_cents) {
    const diff = p.due_cents - pagoCents;
    linhas.push(
      diff > 0
        ? `Você pagou ${brl(diff)} a menos que o devido (${brl(p.due_cents)}). Essa diferença entra como acréscimo na semana corrente e sai no próximo Pix.`
        : `Você pagou ${brl(-diff)} a mais que o devido (${brl(p.due_cents)}). Essa diferença será descontada na semana corrente.`,
    );
  }
  linhas.push('Depois de marcado, só dá para desfazer estornando o pagamento, com motivo registrado no seu nome.');
  return linhas;
}

export const TEXTO_ESTORNAR =
  'O pagamento volta para "cancelado", o valor volta a ser devido e uma nova linha poderá ser gerada na fila. Fica registrado quem estornou e por quê.';

export const TEXTO_CANCELAR = 'O pagamento deixa de contar na fila. Fica registrado quem cancelou e por quê; a semana poderá ser gerada de novo.';

export const TEXTO_FALHOU = 'Use quando o banco recusou ou a chave não funcionou. Ele aparece em "Atenção agora" até você tentar de novo ou cancelar.';

// ── comprovante (a regra de verdade está no servidor: bytes mágicos e 5 MB) ──

export const LIMITE_COMPROVANTE_MB = 5;
const TIPOS_OK = ['image/jpeg', 'image/png', 'application/pdf'];

export function erroDoComprovante(f: { type: string; size: number }): string | null {
  if (f.size === 0) return 'O arquivo está vazio.';
  if (f.size > LIMITE_COMPROVANTE_MB * 1024 * 1024) return `O comprovante passou de ${LIMITE_COMPROVANTE_MB} MB. Envie uma foto menor ou um PDF.`;
  if (!TIPOS_OK.includes(f.type)) return 'Envie uma foto (JPEG ou PNG) ou um PDF.';
  return null;
}

/** Valor digitado para "pago" → centavos; vazio = o devido. */
export function pagoEmCentavos(texto: string, devido: number, converter: (t: string) => number | null): { ok: true; cents: number } | { ok: false; erro: string } {
  if (texto.trim() === '') return { ok: true, cents: devido };
  const c = converter(texto);
  if (c === null || c < 1) return { ok: false, erro: 'Informe um valor válido, por exemplo 250,00.' };
  if (c > 10_000_000) return { ok: false, erro: 'O valor passou do limite (R$ 100.000,00).' };
  return { ok: true, cents: c };
}

export const nomeDoCsv = (semanaInicio: string) => `pagamentos-pix-${semanaInicio}.csv`;

// ── Financeiro no desenho da Lovable (redesenho E5.7, UX §4.9) ─────────────

export interface CartaoFinanceiro {
  titulo: 'Total a pagar' | 'Já pago' | 'Pendente';
  cents: number;
  /** A conta embaixo do valor (regra do dono: todo número com a conta). */
  apoio: string;
}

const plu = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Os três cartões da Lovable sobre o `summary` da semana (§29.4). "Pendente" = o que falta pagar, com o bloqueado por falta de chave
 * (que o servidor deixa FORA do `to_pay_cents`) e o que falhou; "Já pago" = o registrado como pago; "Total a pagar" = os dois juntos
 * (cancelados ficam fora), a mesma relação da Lovable (pendente = total − pago).
 */
export function cartoesFinanceiro(s: ListaPagamentos['summary']): CartaoFinanceiro[] {
  const pendente = s.to_pay_cents + s.blocked_cents;
  const total = pendente + s.paid_cents;
  const partes = [s.blocked_cents ? `${brl(s.blocked_cents)} sem chave Pix` : null, s.failed_cents ? `${brl(s.failed_cents)} que falhou` : null].filter(Boolean);
  const aPagar = s.counts.pending + s.counts.failed + s.counts.blocked;
  return [
    { titulo: 'Total a pagar', cents: total, apoio: `= ${brl(s.paid_cents)} já pago + ${brl(pendente)} pendente (cancelados fora).` },
    { titulo: 'Já pago', cents: s.paid_cents, apoio: `${plu(s.counts.paid, 'pagamento registrado', 'pagamentos registrados')} como pago.` },
    {
      titulo: 'Pendente',
      cents: pendente,
      apoio: partes.length ? `${plu(aPagar, 'pagamento', 'pagamentos')}; inclui ${partes.join(' e ')}.` : `${plu(aPagar, 'pagamento', 'pagamentos')} a pagar.`,
    },
  ];
}

const DIA_MES_SP = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

/** O selo da coluna "Situação" (Lovable: "Pago dd/mm"; os nossos estados com a variante do `Badge`). */
export function seloFinanceiro(p: Pick<Pagamento, 'status' | 'blocked' | 'paid_at'>): { rotulo: string; variante: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (p.status === 'paid') return { rotulo: p.paid_at ? `Pago ${DIA_MES_SP.format(new Date(p.paid_at))}` : 'Pago', variante: 'default' };
  if (p.status === 'cancelled') return { rotulo: 'Cancelado', variante: 'outline' };
  if (p.status === 'failed') return { rotulo: 'Falhou', variante: 'destructive' };
  if (p.blocked) return { rotulo: 'Bloqueado', variante: 'destructive' };
  return { rotulo: 'Pendente', variante: 'secondary' };
}
