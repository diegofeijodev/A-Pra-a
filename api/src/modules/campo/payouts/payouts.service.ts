/**
 * Pagamento por Pix MANUAL (F9, contrato §29). Registra o que o admin pagou FORA do sistema: fila "a pagar" a
 * partir das semanas fechadas (F8), marcar como pago com comprovante, CSV. Nenhuma chamada a provedor de pagamento.
 * Regras de negócio vivem em `domain/payout-rules`; aqui só orquestração: transação, autorização, auditoria.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { addDays, todaySp } from '../../../common/time/dates';
import { normalizarPix } from '../../../domain/campo-rules';
import { brl, diaMes, inicioDaSemana, proximoPagamento, rotuloDia } from '../../../domain/earnings-rules';
import {
  chavePixUtilizavel,
  linhasDeEstorno,
  linhasDePagamento,
  mascararPix,
  montarCsv,
  resumirFila,
  saldoDaSemana,
  situacaoCsv,
  textoDoConsultor,
  transicao,
  validarComprovante,
  validarValorPago,
  EXTENSAO_COMPROVANTE,
  TIPOS_DE_PAGAMENTO_NO_RAZAO,
  type Acao,
  type LinhaCsv,
  type LinhaRazao,
} from '../../../domain/payout-rules';
import { RotasConfigService } from '../../rotas/rotas-config.service';
import { EARNINGS_INPUTS, type ConsultorBasico, type EarningsInputs } from '../earnings/earnings-inputs';
import { EARNINGS_REPOSITORY, type EarningsRepository } from '../earnings/earnings.repository';
import { EarningsService, type Ator } from '../earnings/earnings.service';
import { chaveDoComprovante, lerFotoOuFalha, PHOTO_STORAGE, type FotoLida, type PhotoStorage } from '../photo-storage';
import { PAYOUTS_REPOSITORY, type EventoRow, type PayoutRow, type PayoutsRepository, type PayoutsTx } from './payouts.repository';

export const FONTE_PAYOUTS = 'Fechamento semanal da remuneração (razão) — pagamento registrado à mão';
const LIMITE_CONSULTOR = 12;

const naoEncontrado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Pagamento não encontrado.' });
const invalido = (message: string, code = 'VALIDATION_ERROR') => new BadRequestException({ code, message });

export interface PagarEntrada {
  paid_cents?: number;
  reason?: string;
  note?: string;
  proof?: Buffer | null;
}

interface Contexto {
  hoje: string;
  semanaAtual: string;
  weekStart: number;
  payoutWeekday: number;
}

@Injectable()
export class PayoutsService {
  private readonly log = new Logger(PayoutsService.name);

  constructor(
    @Inject(PAYOUTS_REPOSITORY) private readonly repo: PayoutsRepository,
    @Inject(EARNINGS_REPOSITORY) private readonly ganhos: EarningsRepository,
    @Inject(EARNINGS_INPUTS) private readonly inputs: EarningsInputs,
    private readonly earnings: EarningsService,
    private readonly config: RotasConfigService,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
  ) {}

  // ── visão ───────────────────────────────────────────────────────────────

  private pixDa(semanaFim: string, cal: Contexto): string {
    return proximoPagamento(semanaFim, cal.payoutWeekday);
  }

  private visao(
    r: PayoutRow,
    c: ConsultorBasico | undefined,
    cal: Contexto,
    ultimo: EventoRow | undefined,
    extra: { conta?: string[]; saldo?: number } = {},
  ) {
    const pix = this.pixDa(r.week_end, cal);
    const diff = r.paid_cents === null ? null : r.due_cents - r.paid_cents;
    const conta = [
      `Fechamento da semana ${diaMes(r.week_start)} a ${diaMes(r.week_end)}: ${brl(r.due_cents)} (soma do razão da remuneração, §28).`,
      ...(r.paid_cents !== null
        ? [
            diff === 0
              ? `Pago ${brl(r.paid_cents)}: igual ao devido.`
              : `Pago ${brl(r.paid_cents)} de ${brl(r.due_cents)}: diferença de ${brl(diff as number)} ${(diff as number) > 0 ? 'vai no próximo Pix' : 'é descontada do próximo Pix'}.`,
          ]
        : []),
      ...(extra.conta ?? []),
    ];
    return {
      id: r.id,
      consultant_id: r.consultant_id,
      consultant_name: c?.name ?? null,
      praca_id: c?.praca_id ?? null,
      week: { from: r.week_start, to: r.week_end },
      due_cents: r.due_cents,
      status: r.status,
      blocked: r.block_reason !== null,
      block_reason: r.block_reason,
      pix_key_type: r.pix_key_type,
      pix_key_masked: mascararPix(r.pix_key_type, r.pix_key),
      pix_date: pix,
      pix_label: rotuloDia(pix),
      paid_cents: r.paid_cents,
      diff_cents: diff,
      diff_reason: r.diff_reason,
      paid_at: r.paid_at ? r.paid_at.toISOString() : null,
      paid_by: r.paid_by_name,
      method: r.method,
      has_proof: r.proof_key !== null,
      proof_mime: r.proof_mime,
      note: r.note,
      last_reason: ultimo?.reason ?? null,
      created_at: r.created_at.toISOString(),
      conta,
      ...(extra.saldo !== undefined ? { balance_cents: extra.saldo } : {}),
    };
  }

  private async montar(rows: PayoutRow[], cal: Contexto) {
    const ids = [...new Set(rows.map((r) => r.consultant_id))];
    const [cs, ultimos] = await Promise.all([
      this.inputs.consultores({ ids }),
      this.repo.ultimosEventos(rows.map((r) => r.id)),
    ]);
    const porId = new Map(cs.map((c) => [c.id, c]));
    return rows.map((r) => this.visao(r, porId.get(r.consultant_id), cal, ultimos.get(r.id)));
  }

  // ── equipe: leitura ─────────────────────────────────────────────────────

  private async semanaDe(q: { week?: string }, agora: Date) {
    const cal = await this.earnings.calendario(agora);
    const week = q.week ? inicioDaSemana(q.week, cal.weekStart) : addDays(cal.semanaAtual, -7);
    return { cal, week, to: addDays(week, 6) };
  }

  private async filtrarConsultores(q: { praca_id?: string; consultant_id?: string }): Promise<string[]> {
    const cs = await this.inputs.consultores({
      ...(q.praca_id ? { praca_id: q.praca_id } : {}),
      ...(q.consultant_id ? { ids: [q.consultant_id] } : {}),
    });
    return cs.map((c) => c.id);
  }

  async listar(q: { week?: string; consultant_id?: string; praca_id?: string; status?: string }, agora = new Date()) {
    const { cal, week, to } = await this.semanaDe(q, agora);
    const ids = await this.filtrarConsultores(q);
    const [rows, cfg] = await Promise.all([
      ids.length
        ? this.repo.listar({
            week_start: week,
            consultant_ids: ids,
            ...(q.status ? { status: q.status as PayoutRow['status'] } : {}),
          })
        : Promise.resolve([] as PayoutRow[]),
      this.config.alertas(),
    ]);
    const resumo = resumirFila(
      rows.map((r) => ({ status: r.status, bloqueado: r.block_reason !== null, due_cents: r.due_cents, paid_cents: r.paid_cents })),
      { from: week, to },
    );
    const { conta, ...numeros } = resumo;
    return {
      week: { from: week, to },
      pix_date: this.pixDa(to, cal),
      summary: { ...numeros, conta, source: FONTE_PAYOUTS },
      proof_required: cfg.payout_proof_required,
      payouts: await this.montar(rows, cal),
    };
  }

  async detalhe(id: string, agora = new Date()) {
    const r = await this.carregar(id);
    const cal = await this.earnings.calendario(agora);
    const [eventos, lancs] = await Promise.all([
      this.repo.eventos(id),
      this.ganhos.lancamentos([r.consultant_id], { payout_week: r.week_start, kinds: [...TIPOS_DE_PAGAMENTO_NO_RAZAO] }),
    ]);
    const saldo = saldoDaSemana(r.due_cents, lancs.map((l) => l.amount_cents));
    const [v] = await this.montar([r], cal);
    return {
      ...v,
      balance_cents: saldo,
      events: eventos.map((e) => ({
        id: e.id,
        type: e.type,
        from_status: e.from_status,
        to_status: e.to_status,
        actor: e.actor_name,
        reason: e.reason,
        created_at: e.created_at.toISOString(),
      })),
    };
  }

  private async carregar(id: string): Promise<PayoutRow> {
    const r = await this.repo.porId(id);
    if (!r) throw naoEncontrado();
    return r;
  }

  // ── gerar a fila ────────────────────────────────────────────────────────

  async gerar(weekStart: string, ator: Ator, agora = new Date()) {
    const cal = await this.earnings.calendario(agora);
    const week = inicioDaSemana(weekStart, cal.weekStart);
    const to = addDays(week, 6);
    const consultores = await this.inputs.consultores({});
    const ids = consultores.map((c) => c.id);
    const periodos = (await this.ganhos.periodos(ids, [week])).filter((p) => p.status === 'closed');
    if (!periodos.length) {
      throw new ConflictException({
        code: 'WEEK_NOT_CLOSED',
        message: 'Nenhum consultor tem esta semana fechada. Feche a semana na tela de ganhos antes de gerar os pagamentos.',
      });
    }
    const dados = await this.repo.dadosDosConsultores(periodos.map((p) => p.consultant_id));
    const out = { created: 0, blocked: 0, existing: 0, unblocked: 0, skipped_non_positive: 0 };
    const ids2: string[] = [];
    for (const p of periodos) {
      if (p.total_cents <= 0) {
        out.skipped_non_positive++;
        continue;
      }
      const d = dados.get(p.consultant_id);
      const utilizavel = chavePixUtilizavel(d?.pix_key_type, d?.pix_key);
      await this.repo.emTransacao(p.consultant_id, async (tx) => {
        const [atual] = await tx.listar({ consultant_ids: [p.consultant_id], week_start: week });
        if (atual) {
          const desbloquear = atual.block_reason !== null && atual.status === 'pending' && utilizavel;
          if (!desbloquear) {
            out.existing++;
            ids2.push(atual.id);
            return;
          }
          const cancelado = await tx.transitar(atual.id, 'pending', 'cancelled', {}, {
            type: 'cancelled',
            actor_id: ator.id,
            actor_name: ator.name,
            reason: 'Chave Pix cadastrada: pagamento recriado com a chave atual',
            data: {},
          });
          if (!cancelado) {
            out.existing++;
            ids2.push(atual.id);
            return;
          }
          out.unblocked++;
        }
        const novo = await tx.criar(
          {
            consultant_id: p.consultant_id,
            week_start: week,
            week_end: to,
            due_cents: p.total_cents,
            pix_key: utilizavel && d ? normalizarPix(d.pix_key_type as string, d.pix_key as string) : null,
            pix_key_type: utilizavel && d ? d.pix_key_type : null,
            block_reason: utilizavel ? null : 'NO_PIX_KEY',
            created_by: ator.id,
            created_by_name: ator.name,
          },
          ator,
        );
        ids2.push(novo.id);
        if (utilizavel) out.created++;
        else out.blocked++;
      });
    }
    const rows = (await this.repo.listar({ week_start: week })).filter((r) => ids2.includes(r.id));
    return { week: { from: week, to }, ...out, payouts: await this.montar(rows, cal) };
  }

  // ── transições ──────────────────────────────────────────────────────────

  private falhaDeTransicao(r: { ok: false; code: string; message: string }): never {
    throw new ConflictException({ code: r.code, message: r.message });
  }

  /** Lança no razão da F8 (mesma transação, mesmo lock). Cada linha tem chave própria: repetir não duplica. */
  private async lancar(tx: PayoutsTx, row: PayoutRow, linhas: LinhaRazao[], corrente: string, ator: Ator, extra: Record<string, unknown>) {
    for (const l of linhas) {
      let reverses: string | null = null;
      if (l.estorna_ajuste) {
        const adj = await tx.lancamentoPorChave(row.consultant_id, 'adjustment', `payout:${row.id}:diff`);
        if (!adj) throw new Error('ajuste da diferença do pagamento não encontrado no razão');
        reverses = adj.id;
      }
      const semana = l.em === 'semana' ? row.week_start : corrente;
      await tx.inserirLancamento({
        consultant_id: row.consultant_id,
        kind: l.kind,
        amount_cents: l.amount_cents,
        work_scope: 'manual',
        work_day: null,
        work_week: semana,
        payout_week: semana,
        rule_version: null,
        source: l.source,
        reason: l.reason,
        reverses_id: reverses,
        idempotency_key: l.idempotency_key,
        snapshot: { payout_id: row.id, due_cents: row.due_cents, by: ator.name, ...extra },
        created_by: ator.id,
        created_by_name: ator.name,
      });
    }
  }

  async pagar(id: string, entrada: PagarEntrada, ator: Ator, agora = new Date()) {
    const antes = await this.carregar(id);
    const cal = await this.earnings.calendario(agora);

    // Já pago: idempotente — nada de novo evento, lançamento ou arquivo.
    if (antes.status === 'paid') return { ...(await this.detalhe(id, agora)), already_paid: true };

    const t0 = transicao(antes.status, 'pay', antes.block_reason !== null);
    if (!t0.ok) this.falhaDeTransicao(t0);

    const valor = entrada.paid_cents === undefined ? { ok: true as const, cents: antes.due_cents } : validarValorPago(entrada.paid_cents);
    if (!valor.ok) throw invalido(valor.message);
    const reason = entrada.reason?.trim() ?? '';
    const diferente = valor.cents !== antes.due_cents;
    if (diferente && reason.length < 3) {
      throw invalido('reason: valor pago diferente do devido exige o motivo (ao menos 3 caracteres).', 'REASON_REQUIRED');
    }
    const cfg = await this.config.alertas();
    if (!entrada.proof && cfg.payout_proof_required) {
      throw invalido('Anexe o comprovante do Pix (foto ou PDF) para marcar como pago.', 'PROOF_REQUIRED');
    }

    let prova: { key: string; mime: string; size: number } | null = null;
    if (entrada.proof) {
      const v = validarComprovante(entrada.proof);
      if (!v.ok) {
        if (v.code === 'FILE_TOO_LARGE') throw new PayloadTooLargeException({ code: v.code, message: v.message });
        throw new UnsupportedMediaTypeException({ code: v.code, message: v.message });
      }
      const key = chaveDoComprovante(antes.consultant_id, randomUUID(), EXTENSAO_COMPROVANTE[v.mime] as 'jpg' | 'png' | 'pdf');
      await this.storage.put(key, entrada.proof, v.mime);
      prova = { key, mime: v.mime, size: v.size };
    }

    try {
      const resultado = await this.repo.emTransacao(antes.consultant_id, async (tx) => {
        const atual = await tx.porId(id);
        if (!atual) throw naoEncontrado();
        if (atual.status === 'paid') return { jaPago: true };
        const t = transicao(atual.status, 'pay', atual.block_reason !== null);
        if (!t.ok) this.falhaDeTransicao(t);
        const agoraSemana = cal.semanaAtual;
        const paga = await tx.transitar(
          id,
          atual.status,
          'paid',
          {
            paid_cents: valor.cents,
            paid_at: agora,
            paid_by: ator.id,
            paid_by_name: ator.name,
            proof_key: prova?.key ?? null,
            proof_mime: prova?.mime ?? null,
            proof_size: prova?.size ?? null,
            note: entrada.note?.trim() || null,
            diff_reason: diferente ? reason : null,
          },
          {
            type: 'paid',
            actor_id: ator.id,
            actor_name: ator.name,
            reason: diferente ? reason : null,
            data: { due_cents: atual.due_cents, paid_cents: valor.cents, proof: prova !== null, method: 'pix_manual' },
          },
        );
        if (!paga) return { jaPago: true };
        await this.lancar(
          tx,
          paga,
          linhasDePagamento({
            payout_id: id,
            due_cents: paga.due_cents,
            paid_cents: valor.cents,
            semana: { from: paga.week_start, to: paga.week_end },
            diff_reason: diferente ? reason : null,
          }),
          agoraSemana,
          ator,
          { paid_cents: valor.cents },
        );
        return { jaPago: false };
      });
      if (resultado.jaPago) {
        await this.removerArquivo(prova?.key);
        return { ...(await this.detalhe(id, agora)), already_paid: true };
      }
    } catch (e) {
      await this.removerArquivo(prova?.key);
      throw e;
    }
    return { ...(await this.detalhe(id, agora)), already_paid: false };
  }

  private async removerArquivo(key: string | undefined): Promise<void> {
    if (!key) return;
    try {
      await this.storage.remove(key);
    } catch (e) {
      this.log.warn(`não foi possível remover o comprovante órfão (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** `fail`, `retry`, `cancel` e `reverse` (contrato §29.4). */
  async mudar(id: string, acao: Exclude<Acao, 'pay'>, motivo: string | null, ator: Ator, agora = new Date()) {
    const antes = await this.carregar(id);
    const cal = await this.earnings.calendario(agora);
    const reason = motivo?.trim() ?? '';
    if (acao !== 'retry' && reason.length < 3) throw invalido('reason: informe o motivo (ao menos 3 caracteres).');
    await this.repo.emTransacao(antes.consultant_id, async (tx) => {
      const atual = await tx.porId(id);
      if (!atual) throw naoEncontrado();
      const t = transicao(atual.status, acao, atual.block_reason !== null);
      if (!t.ok) this.falhaDeTransicao(t);
      const novo = await tx.transitar(id, atual.status, t.para, {}, {
        type: t.evento,
        actor_id: ator.id,
        actor_name: ator.name,
        reason: reason || null,
        data: { due_cents: atual.due_cents },
      });
      if (!novo) {
        throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'O pagamento mudou enquanto você agia. Recarregue a tela.' });
      }
      if (acao === 'reverse') {
        await this.lancar(
          tx,
          novo,
          linhasDeEstorno({
            payout_id: id,
            due_cents: novo.due_cents,
            paid_cents: novo.paid_cents as number,
            semana: { from: novo.week_start, to: novo.week_end },
            reason,
          }),
          cal.semanaAtual,
          ator,
          { reversed: true },
        );
      }
    });
    return this.detalhe(id, agora);
  }

  // ── comprovante e chave ─────────────────────────────────────────────────

  private async stream(r: PayoutRow): Promise<FotoLida> {
    if (!r.proof_key) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Este pagamento não tem comprovante.' });
    const f = await lerFotoOuFalha(this.storage, r.proof_key);
    return { bytes: f.bytes, mime: r.proof_mime ?? f.mime };
  }

  comprovante(id: string): Promise<FotoLida> {
    return this.carregar(id).then((r) => this.stream(r));
  }

  /** Do consultor: pagamento de outro = 404 (nunca 403, para não confirmar que existe). */
  async comprovanteDoConsultor(id: string, c: CampoConsultant): Promise<FotoLida> {
    const r = await this.repo.porId(id);
    if (!r || r.consultant_id !== c.id) throw naoEncontrado();
    return this.stream(r);
  }

  /** A chave COMPLETA: só admin, só aqui. Grava evento (sem a chave). Nada de log. */
  async chavePix(id: string, ator: Ator) {
    const r = await this.carregar(id);
    if (!r.pix_key || !r.pix_key_type) {
      throw new ConflictException({ code: 'PIX_KEY_MISSING', message: 'Este pagamento está sem chave Pix.' });
    }
    await this.repo.emTransacao(r.consultant_id, (tx) =>
      tx.inserirEvento({
        payout_id: r.id,
        type: 'pix_key_viewed',
        from_status: null,
        to_status: null,
        actor_id: ator.id,
        actor_name: ator.name,
        reason: null,
        data: {},
      }),
    );
    return { pix_key: r.pix_key, pix_key_type: r.pix_key_type };
  }

  // ── CSV ─────────────────────────────────────────────────────────────────

  async exportarCsv(
    q: { week?: string; consultant_id?: string; praca_id?: string; include_pix_key?: boolean },
    ator: Ator,
    agora = new Date(),
  ): Promise<{ filename: string; csv: string }> {
    const { cal, week } = await this.semanaDe(q, agora);
    const ids = await this.filtrarConsultores(q);
    const rows = ids.length ? await this.repo.listar({ week_start: week, consultant_ids: ids }) : [];
    const [cs, dados] = await Promise.all([
      this.inputs.consultores({ ids: [...new Set(rows.map((r) => r.consultant_id))] }),
      this.repo.dadosDosConsultores([...new Set(rows.map((r) => r.consultant_id))]),
    ]);
    const nomes = new Map(cs.map((c) => [c.id, c.name]));
    const linhas: LinhaCsv[] = rows.map((r) => ({
      week_start: r.week_start,
      week_end: r.week_end,
      consultor: nomes.get(r.consultant_id) ?? '',
      praca: dados.get(r.consultant_id)?.praca_name ?? '',
      pix_key_type: r.pix_key_type,
      pix_key: q.include_pix_key ? r.pix_key : mascararPix(r.pix_key_type, r.pix_key),
      due_cents: r.due_cents,
      paid_cents: r.paid_cents,
      situacao: situacaoCsv(r.status, r.block_reason !== null),
      paid_day: r.paid_at ? todaySp(r.paid_at) : null,
      pix_date: this.pixDa(r.week_end, cal),
      observacao: r.diff_reason ?? r.note,
    }));
    const csv = montarCsv(linhas);
    if (q.include_pix_key) {
      // Auditoria da exportação com a chave completa: falhou ao gravar = não entrega o arquivo.
      for (const r of rows) {
        await this.repo.emTransacao(r.consultant_id, (tx) =>
          tx.inserirEvento({
            payout_id: r.id,
            type: 'exported',
            from_status: null,
            to_status: null,
            actor_id: ator.id,
            actor_name: ator.name,
            reason: null,
            data: { full_pix_key: true, rows: rows.length },
          }),
        );
      }
    }
    return { filename: `pagamentos-pix-${week}.csv`, csv };
  }

  // ── consultor ───────────────────────────────────────────────────────────

  async doConsultor(c: CampoConsultant, agora = new Date()) {
    const cal = await this.earnings.calendario(agora);
    const rows = await this.repo.listar({ consultant_ids: [c.id], limit: LIMITE_CONSULTOR });
    return {
      payouts: rows.map((r) => {
        const pix = this.pixDa(r.week_end, cal);
        const t = textoDoConsultor({
          status: r.status,
          bloqueado: r.block_reason !== null,
          due_cents: r.due_cents,
          paid_cents: r.paid_cents,
          paid_at: r.paid_at,
          pix_date: pix,
          paid_day: r.paid_at ? todaySp(r.paid_at) : null,
        });
        return {
          id: r.id,
          week: { from: r.week_start, to: r.week_end },
          due_cents: r.due_cents,
          status: r.status,
          label: t.label,
          pix_date: pix,
          pix_label: rotuloDia(pix),
          paid_cents: r.paid_cents,
          paid_at: r.paid_at ? r.paid_at.toISOString() : null,
          has_proof: r.proof_key !== null,
          text: t.text,
        };
      }),
    };
  }

  // ── "Atenção agora" ─────────────────────────────────────────────────────

  async alertas(pracaId?: string) {
    const rows = await this.repo.comProblema();
    if (!rows.length) return [];
    const cs = await this.inputs.consultores({ ids: [...new Set(rows.map((r) => r.consultant_id))], ...(pracaId ? { praca_id: pracaId } : {}) });
    const nomes = new Map(cs.map((c) => [c.id, c.name]));
    return rows
      .filter((r) => nomes.has(r.consultant_id))
      .map((r) => {
        const nome = nomes.get(r.consultant_id) as string;
        const semana = `${diaMes(r.week_start)} a ${diaMes(r.week_end)}`;
        const bloqueado = r.block_reason !== null;
        return {
          kind: bloqueado ? ('pix_bloqueado' as const) : ('pix_falhou' as const),
          payout_id: r.id,
          consultant_id: r.consultant_id,
          name: nome,
          week: { from: r.week_start, to: r.week_end },
          message: bloqueado
            ? `${nome}: Pix de ${brl(r.due_cents)} (semana ${semana}) bloqueado — falta a chave Pix.`
            : `${nome}: o Pix de ${brl(r.due_cents)} (semana ${semana}) falhou. Tente de novo.`,
        };
      });
  }
}
