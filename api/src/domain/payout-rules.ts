/**
 * Pagamento por Pix manual (F9, contrato §29) — regras PURAS: máscara da chave, transições, lançamentos
 * do razão, saldo, comprovante (bytes mágicos), CSV. Sem banco, sem relógio, sem framework.
 * Dinheiro sempre em centavos inteiros.
 */
import { brl, dataBR, diaMes, rotuloDia } from './earnings-rules';
import { pixValido } from './campo-rules';

export const STATUS_PAGAMENTO = ['pending', 'paid', 'failed', 'cancelled'] as const;
export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number];

export const TIPOS_EVENTO = [
  'created',
  'paid',
  'failed',
  'retried',
  'cancelled',
  'reversed',
  'pix_key_viewed',
  'exported',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const LIMITE_COMPROVANTE_BYTES = 5 * 1024 * 1024;
export const VALOR_MAXIMO_CENTS = 10_000_000;

// ── transições ──────────────────────────────────────────────────────────

export type Acao = 'pay' | 'fail' | 'retry' | 'cancel' | 'reverse';

const TRANSICOES: Record<Acao, { de: readonly StatusPagamento[]; para: StatusPagamento; evento: TipoEvento }> = {
  pay: { de: ['pending', 'failed'], para: 'paid', evento: 'paid' },
  fail: { de: ['pending'], para: 'failed', evento: 'failed' },
  retry: { de: ['failed'], para: 'pending', evento: 'retried' },
  cancel: { de: ['pending', 'failed'], para: 'cancelled', evento: 'cancelled' },
  reverse: { de: ['paid'], para: 'cancelled', evento: 'reversed' },
};

export type ResultadoTransicao =
  | { ok: true; para: StatusPagamento; evento: TipoEvento }
  | { ok: false; code: 'INVALID_TRANSITION' | 'PIX_KEY_MISSING'; message: string };

const ROTULO_STATUS: Record<StatusPagamento, string> = {
  pending: 'a pagar',
  paid: 'pago',
  failed: 'falhou',
  cancelled: 'cancelado',
};

/** Pagamento bloqueado (sem chave Pix) só pode ser cancelado; o resto segue a tabela de transições. */
export function transicao(status: StatusPagamento, acao: Acao, bloqueado: boolean): ResultadoTransicao {
  const t = TRANSICOES[acao];
  if (bloqueado && acao !== 'cancel') {
    return {
      ok: false,
      code: 'PIX_KEY_MISSING',
      message: 'Este pagamento está bloqueado: falta a chave Pix do consultor. Cadastre a chave e gere a fila de novo.',
    };
  }
  if (!t.de.includes(status)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `Não dá para fazer isso com um pagamento ${ROTULO_STATUS[status]}.`,
    };
  }
  return { ok: true, para: t.para, evento: t.evento };
}

// ── chave Pix ───────────────────────────────────────────────────────────

/** Chave do cadastro serve para pagar? Tipo × formato (a mesma regra do cadastro do consultor). */
export const chavePixUtilizavel = (tipo: string | null | undefined, chave: string | null | undefined): boolean =>
  !!tipo && !!chave && chave.trim().length > 0 && pixValido(tipo, chave);

/** Máscara de leitura: a chave completa nunca sai em lista, log ou erro. */
export function mascararPix(tipo: string | null | undefined, chave: string | null | undefined): string | null {
  if (!chave) return null;
  const c = chave.trim();
  switch (tipo) {
    case 'cpf': {
      const d = c.replace(/\D/g, '');
      return `***.***.***-${d.slice(-2).padStart(2, '*')}`;
    }
    case 'email': {
      const [local, dominio] = c.split('@');
      return dominio ? `${local.slice(0, 1)}***@${dominio}` : '***';
    }
    case 'telefone': {
      const d = c.replace(/\D/g, '');
      return `(**) *****-${d.slice(-4).padStart(4, '*')}`;
    }
    case 'aleatoria':
      return `…${c.slice(-8)}`;
    default:
      return '***';
  }
}

// ── lançamentos no razão da F8 ──────────────────────────────────────────

export interface LinhaRazao {
  kind: 'payout' | 'payout_reversal' | 'payout_settlement' | 'adjustment' | 'reversal';
  amount_cents: number;
  /** `semana` = a semana paga; `corrente` = a semana aberta de hoje. */
  em: 'semana' | 'corrente';
  source: string;
  reason: string;
  idempotency_key: string;
  /** Só `reversal`: estorna o ajuste `payout_difference` do mesmo pagamento. */
  estorna_ajuste?: boolean;
}

/**
 * Pagar `paid` de `due`: o razão da semana paga fecha em zero e a diferença vai (uma vez só) para a semana corrente.
 * paga a menos ⇒ ajuste positivo (o resto sai no próximo Pix); paga a mais ⇒ ajuste negativo (desconta).
 */
export function linhasDePagamento(p: {
  payout_id: string;
  due_cents: number;
  paid_cents: number;
  semana: { from: string; to: string };
  diff_reason: string | null;
}): LinhaRazao[] {
  const diff = p.due_cents - p.paid_cents;
  const periodo = `${diaMes(p.semana.from)} a ${diaMes(p.semana.to)}`;
  const linhas: LinhaRazao[] = [
    {
      kind: 'payout',
      amount_cents: -p.paid_cents,
      em: 'semana',
      source: 'pix_manual',
      reason: `Pix manual da semana ${periodo}`,
      idempotency_key: `payout:${p.payout_id}:paid`,
    },
  ];
  if (diff !== 0) {
    const motivo = p.diff_reason ?? 'valor pago diferente do devido';
    linhas.push(
      {
        kind: 'payout_settlement',
        amount_cents: -diff,
        em: 'semana',
        source: 'payout_difference',
        reason: motivo,
        idempotency_key: `payout:${p.payout_id}:settle`,
      },
      {
        kind: 'adjustment',
        amount_cents: diff,
        em: 'corrente',
        source: 'payout_difference',
        reason: `Diferença do Pix da semana ${periodo}: ${motivo}`,
        idempotency_key: `payout:${p.payout_id}:diff`,
      },
    );
  }
  return linhas;
}

/** Estorno do pagamento: desfaz cada linha de `linhasDePagamento`, também uma vez só. */
export function linhasDeEstorno(p: {
  payout_id: string;
  due_cents: number;
  paid_cents: number;
  semana: { from: string; to: string };
  reason: string;
}): LinhaRazao[] {
  const diff = p.due_cents - p.paid_cents;
  const periodo = `${diaMes(p.semana.from)} a ${diaMes(p.semana.to)}`;
  const linhas: LinhaRazao[] = [
    {
      kind: 'payout_reversal',
      amount_cents: p.paid_cents,
      em: 'semana',
      source: 'pix_manual_reversal',
      reason: `Estorno do Pix da semana ${periodo}: ${p.reason}`,
      idempotency_key: `payout:${p.payout_id}:reversed`,
    },
  ];
  if (diff !== 0) {
    linhas.push(
      {
        kind: 'payout_settlement',
        amount_cents: diff,
        em: 'semana',
        source: 'payout_difference_reversal',
        reason: `Estorno do acerto: ${p.reason}`,
        idempotency_key: `payout:${p.payout_id}:settle_rev`,
      },
      {
        kind: 'reversal',
        amount_cents: -diff,
        em: 'corrente',
        source: 'payout_difference_reversal',
        reason: `Estorno da diferença do Pix da semana ${periodo}: ${p.reason}`,
        idempotency_key: `payout:${p.payout_id}:diff_rev`,
        estorna_ajuste: true,
      },
    );
  }
  return linhas;
}

export const TIPOS_DE_PAGAMENTO_NO_RAZAO = ['payout', 'payout_reversal', 'payout_settlement'] as const;
export const ehLancamentoDePagamento = (kind: string): boolean =>
  (TIPOS_DE_PAGAMENTO_NO_RAZAO as readonly string[]).includes(kind);

/** Saldo da semana = fechado − pago líquido (soma dos lançamentos de pagamento, que já vêm com sinal). */
export function saldoDaSemana(fechado_cents: number, lancamentosDePagamento: readonly number[]): number {
  return fechado_cents + lancamentosDePagamento.reduce((a, v) => a + v, 0);
}

/** Valor pago informado: inteiro em centavos, entre 1 e o teto. */
export function validarValorPago(v: unknown): { ok: true; cents: number } | { ok: false; message: string } {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > VALOR_MAXIMO_CENTS) {
    return { ok: false, message: 'paid_cents: informe o valor pago em centavos (inteiro entre 1 e 10.000.000).' };
  }
  return { ok: true, cents: v };
}

// ── comprovante ─────────────────────────────────────────────────────────

export type MimeComprovante = 'image/jpeg' | 'image/png' | 'application/pdf';

/** Tipo REAL pelos bytes mágicos (o mimetype do multipart é só o que o navegador diz). JPEG, PNG ou PDF. */
export function tipoDoComprovante(b: Buffer): MimeComprovante | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export const EXTENSAO_COMPROVANTE: Record<MimeComprovante, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export type ResultadoComprovante =
  | { ok: true; mime: MimeComprovante; size: number }
  | { ok: false; code: 'FILE_TOO_LARGE' | 'INVALID_PROOF'; message: string };

export function validarComprovante(b: Buffer): ResultadoComprovante {
  if (b.length === 0) return { ok: false, code: 'INVALID_PROOF', message: 'O comprovante está vazio.' };
  if (b.length > LIMITE_COMPROVANTE_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: 'O comprovante passou de 5 MB.' };
  }
  const mime = tipoDoComprovante(b);
  if (!mime) {
    return { ok: false, code: 'INVALID_PROOF', message: 'O comprovante precisa ser uma foto (JPEG ou PNG) ou um PDF.' };
  }
  return { ok: true, mime, size: b.length };
}

// ── textos ──────────────────────────────────────────────────────────────

export const rotuloPix = (diaDoPix: string): string => rotuloDia(diaDoPix);

/** O que a pessoa lê sobre o Pix da semana (data absoluta, nunca "na próxima segunda"). */
export function textoDoConsultor(p: {
  status: StatusPagamento;
  bloqueado: boolean;
  due_cents: number;
  paid_cents: number | null;
  paid_at: Date | null;
  pix_date: string;
  /** Dia (Brasília) do pagamento, `YYYY-MM-DD`. */
  paid_day: string | null;
}): { label: string; text: string } {
  if (p.status === 'paid' && p.paid_cents !== null) {
    const dia = p.paid_day ? ` em ${dataBR(p.paid_day)}` : '';
    return { label: 'Pago', text: `Pix de ${brl(p.paid_cents)} pago${dia}.` };
  }
  if (p.bloqueado) {
    return { label: 'Falta a chave Pix', text: 'Falta cadastrar sua chave Pix. Fale com a equipe para receber.' };
  }
  if (p.status === 'failed') {
    return { label: 'Pix com problema', text: 'O Pix não saiu. A equipe já foi avisada e vai tentar de novo.' };
  }
  return { label: 'A pagar', text: `Pix de ${brl(p.due_cents)} a pagar em ${rotuloDia(p.pix_date)}.` };
}

export interface ResumoFila {
  to_pay_cents: number;
  blocked_cents: number;
  failed_cents: number;
  paid_cents: number;
  counts: { pending: number; blocked: number; failed: number; paid: number; cancelled: number };
  conta: string[];
}

export interface ItemResumo {
  status: StatusPagamento;
  bloqueado: boolean;
  due_cents: number;
  paid_cents: number | null;
}

/** Total a pagar com a conta escrita (regra do dono: todo número mostra a conta e a fonte). */
export function resumirFila(itens: readonly ItemResumo[], semana: { from: string; to: string }): ResumoFila {
  const counts = { pending: 0, blocked: 0, failed: 0, paid: 0, cancelled: 0 };
  let toPay = 0;
  let blocked = 0;
  let failed = 0;
  let paid = 0;
  const parcelas: number[] = [];
  for (const i of itens) {
    if (i.status === 'cancelled') counts.cancelled++;
    else if (i.status === 'paid') {
      counts.paid++;
      paid += i.paid_cents ?? 0;
    } else if (i.bloqueado) {
      counts.blocked++;
      blocked += i.due_cents;
    } else if (i.status === 'failed') {
      counts.failed++;
      failed += i.due_cents;
      toPay += i.due_cents;
      parcelas.push(i.due_cents);
    } else {
      counts.pending++;
      toPay += i.due_cents;
      parcelas.push(i.due_cents);
    }
  }
  const conta: string[] = [];
  if (parcelas.length) {
    conta.push(
      `A pagar (${diaMes(semana.from)} a ${diaMes(semana.to)}): ${parcelas.map(brl).join(' + ')} = ${brl(toPay)}.`,
    );
  } else {
    conta.push(`Nada a pagar na semana ${diaMes(semana.from)} a ${diaMes(semana.to)}.`);
  }
  if (counts.blocked) conta.push(`Bloqueado por falta de chave Pix (não entra no total): ${brl(blocked)}.`);
  if (counts.paid) conta.push(`Já pago: ${brl(paid)}.`);
  return { to_pay_cents: toPay, blocked_cents: blocked, failed_cents: failed, paid_cents: paid, counts, conta };
}

// ── CSV ─────────────────────────────────────────────────────────────────

export const BOM = '﻿';

/** "1234,50" (sem milhar, para o Excel ler como número); só aritmética inteira. */
export function reaisCsv(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Célula de TEXTO: neutraliza injeção de fórmula (`= + - @` tab CR no começo ganham `'`) e protege `;`, `"`, quebras.
 * Colunas de valor NÃO passam por aqui (ficam numéricas).
 */
export function celulaTexto(valor: string | null | undefined): string {
  let t = valor ?? '';
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export const COLUNAS_CSV = [
  'Semana início',
  'Semana fim',
  'Consultor',
  'Praça',
  'Tipo da chave',
  'Chave Pix',
  'Valor devido (R$)',
  'Valor devido (centavos)',
  'Valor pago (R$)',
  'Valor pago (centavos)',
  'Situação',
  'Pago em',
  'Data do Pix',
  'Observação',
] as const;

export interface LinhaCsv {
  week_start: string;
  week_end: string;
  consultor: string;
  praca: string;
  pix_key_type: string | null;
  /** Já mascarada ou completa, conforme a opção do admin. */
  pix_key: string | null;
  due_cents: number;
  paid_cents: number | null;
  situacao: string;
  paid_day: string | null;
  pix_date: string;
  observacao: string | null;
}

export function montarCsv(linhas: readonly LinhaCsv[]): string {
  const cab = COLUNAS_CSV.join(';');
  const corpo = linhas.map((l) =>
    [
      celulaTexto(l.week_start),
      celulaTexto(l.week_end),
      celulaTexto(l.consultor),
      celulaTexto(l.praca),
      celulaTexto(l.pix_key_type),
      celulaTexto(l.pix_key),
      reaisCsv(l.due_cents),
      String(l.due_cents),
      l.paid_cents === null ? '' : reaisCsv(l.paid_cents),
      l.paid_cents === null ? '' : String(l.paid_cents),
      celulaTexto(l.situacao),
      celulaTexto(l.paid_day),
      celulaTexto(l.pix_date),
      celulaTexto(l.observacao),
    ].join(';'),
  );
  return BOM + [cab, ...corpo].join('\r\n') + '\r\n';
}

export const situacaoCsv = (status: StatusPagamento, bloqueado: boolean): string =>
  bloqueado ? 'Bloqueado: falta chave Pix' : { pending: 'A pagar', paid: 'Pago', failed: 'Falhou', cancelled: 'Cancelado' }[status];
