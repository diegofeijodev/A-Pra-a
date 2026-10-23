/**
 * Pedidos de cupom da 1ª contratação (fase L6a; contrato §38). O consultor pede (idempotente por `client_id`, na fila
 * offline), a equipe lê e só o admin decide. Limite por empresa sob advisory lock; cada mudança é compare-and-set com evento
 * na mesma transação. O cupom real (L6b) fica no `VoucherCouponsService`; com a flag dele desligada, aprovar é só registro.
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/auth-user';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { isUuid } from '../../../common/ids/uuid';
import { addDays } from '../../../common/time/dates';
import {
  CHAVES_VOUCHER_ANULAVEIS,
  codigoDoCupom,
  condicaoDaSituacao,
  CONFIG_VOUCHER,
  mensagemDoLimite,
  paramsDoCupom,
  situacaoDo,
  SITUACOES,
  type ConfigVoucher,
  type CouponStatus,
  type Situacao,
  type StatusVoucher,
} from '../../../domain/voucher-rules';
import { LOVABLE_C_FLAGS, type FlagsLovableC } from '../../rotas/rotas.tokens';
import { violouUnico } from '../prisma-errors';
import type { AprovarVoucherDto, ConfigVoucherDto, PedirVoucherDto, ReprovarVoucherDto, VincularContratanteDto, VouchersQueryDto } from './dto/vouchers.dto';
import { cuponsDesligados, VoucherCouponsService } from './voucher-coupons.service';
import { VOUCHERS_REPOSITORY, type FiltroVouchers, type VoucherRow, type VouchersRepository } from './vouchers.repository';
import { campoVoucherView, eventoVoucherView, voucherView, type CampoVoucherView, type EventoVoucherView, type VoucherView } from './vouchers-views';
import { VOUCHER_COUPON_ISSUER, type ContratanteCandidato, type VoucherCouponIssuer } from './vouchers.tokens';

export const vouchersDesligados = () =>
  new NotFoundException({ code: 'VOUCHERS_DISABLED', message: 'Os cupons da 1ª contratação não estão ligados neste servidor.' });
const naoEncontrado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Pedido de cupom não encontrado.' });
const estabelecimentoNaoEncontrado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Estabelecimento não encontrado na sua praça.' });
const transicaoInvalida = (m: string) => new ConflictException({ code: 'INVALID_TRANSITION', message: m });
const jaTemCupom = () =>
  new ConflictException({
    code: 'CONTRACTOR_ALREADY_HAS_COUPON',
    message: 'Esta conta do Freela já recebeu um cupom do Praça. Um cupom de 1ª contratação por empresa.',
  });
const clientIdEmUso = () => new ConflictException({ code: 'CLIENT_ID_IN_USE', message: 'Identificador de envio já usado.' });

/** Dia de Brasília → instante (00:00 de Brasília). */
const inicioDoDia = (dia: string): Date => new Date(`${dia}T00:00:00.000-03:00`);

export interface ListaVouchers {
  items: VoucherView[];
  counts: Record<Situacao | 'todos', number>;
  coupons_enabled: boolean;
  freela_configured: boolean;
}

export interface ResumoCuponsPainel {
  requested: number;
  pending: number;
  approved: number;
  rejected: number;
  coupons_created: number;
}

@Injectable()
export class VouchersService {
  constructor(
    @Inject(VOUCHERS_REPOSITORY) private readonly repo: VouchersRepository,
    private readonly cupons: VoucherCouponsService,
    @Inject(VOUCHER_COUPON_ISSUER) private readonly issuer: VoucherCouponIssuer,
    @Optional() @Inject(LOVABLE_C_FLAGS) private readonly flags?: FlagsLovableC,
  ) {}

  get ligado(): boolean {
    return this.flags?.vouchers === true;
  }

  /** O cupom real no Freela está ligado (o painel cita os criados). */
  get cuponsNoFreela(): boolean {
    return this.cupons.ligado;
  }

  private exigirLigado(): void {
    if (!this.ligado) throw vouchersDesligados();
  }

  // ── configuração (§38.2) ──────────────────────────────────

  async config(): Promise<ConfigVoucher> {
    return CONFIG_VOUCHER.ler(await this.repo.lerConfig());
  }

  async configView(): Promise<ConfigVoucher & { coupons_enabled: boolean }> {
    this.exigirLigado();
    return { ...(await this.config()), coupons_enabled: this.cupons.ligado };
  }

  async salvarConfig(dto: ConfigVoucherDto, _user: AuthUser): Promise<ConfigVoucher & { coupons_enabled: boolean }> {
    this.exigirLigado();
    const anulaveis = new Set<string>(CHAVES_VOUCHER_ANULAVEIS);
    const parcial = Object.fromEntries(
      Object.entries(dto).filter(([k, v]) => v !== undefined && !(v === null && !anulaveis.has(k))),
    );
    await this.repo.emTransacao('voucher-config', async (tx) => {
      const atual = CONFIG_VOUCHER.ler(await tx.lerConfig());
      const r = CONFIG_VOUCHER.aplicar(atual, parcial);
      if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
      await tx.gravarConfig({ ...r.config });
    });
    return this.configView();
  }

  // ── consultor (§38.3) ─────────────────────────────────────

  async pedir(c: CampoConsultant, dto: PedirVoucherDto): Promise<{ view: CampoVoucherView; criado: boolean }> {
    this.exigirLigado();
    const mesmo = await this.repo.porClientId(dto.client_id);
    if (mesmo) {
      if (mesmo.consultant_id !== c.id) throw clientIdEmUso();
      return { view: campoVoucherView(mesmo), criado: false };
    }
    const leadDoCorpo = dto.lead_id ?? null;
    const ref = dto.visit_ref ?? null;
    if (!leadDoCorpo && !ref) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'lead_id ou visit_ref: obrigatório.' });
    let leadId = leadDoCorpo;
    let visitId: string | null = null;
    if (ref) {
      if (!isUuid(ref)) throw estabelecimentoNaoEncontrado();
      const visita = await this.repo.visitaDoConsultor(c.id, ref);
      if (!visita) throw estabelecimentoNaoEncontrado();
      if (leadDoCorpo && visita.lead_id !== leadDoCorpo) {
        throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', message: 'lead_id: não é o estabelecimento desta visita.' });
      }
      leadId = visita.lead_id;
      visitId = visita.id;
    }
    if (!leadId || !isUuid(leadId)) throw estabelecimentoNaoEncontrado();
    const lead = await this.repo.lead(leadId);
    if (!lead || lead.praca_id !== c.praca_id) throw estabelecimentoNaoEncontrado();
    const praca = await this.repo.praca(c.praca_id);
    const cfg = await this.config();
    const city = lead.city.trim() || praca?.cobertura_cidade?.trim() || praca?.city?.trim() || dto.city?.trim() || '';
    const uf = (praca?.cobertura_uf?.trim() || dto.uf?.trim() || '').toUpperCase().slice(0, 2);
    const segment = dto.segment.trim();
    if (!segment) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'segment: escolha o ramo.' });

    try {
      const v = await this.repo.emTransacao(`voucher-lead:${lead.id}`, async (tx) => {
        const corrida = await tx.porClientId(dto.client_id);
        if (corrida) return { row: corrida, criado: false };
        const ativos = await tx.ativosDoLead(lead.id);
        if (ativos.length >= cfg.max_por_empresa) {
          const primeiro = ativos[0]!;
          const nomes = await tx.nomesDosConsultores([primeiro.consultant_id]);
          throw new ConflictException({
            code: 'VOUCHER_LIMIT_REACHED',
            message: mensagemDoLimite({ consultant_name: nomes.get(primeiro.consultant_id) ?? 'outro consultor', created_at: primeiro.created_at, status: primeiro.status }),
          });
        }
        const row = await tx.criar(
          {
            client_id: dto.client_id,
            consultant_id: c.id,
            praca_id: c.praca_id,
            lead_id: lead.id,
            visit_id: visitId,
            company_name: lead.name,
            uf,
            city,
            segment,
            freelas_per_week: dto.freelas_per_week,
          },
          { type: 'requested', client_id: null, actor_kind: 'consultor', actor_id: c.id, actor_name: c.name, reason: null, data: { segment, freelas_per_week: dto.freelas_per_week } },
        );
        return { row, criado: true };
      });
      if (v.row.consultant_id !== c.id) throw clientIdEmUso();
      return { view: campoVoucherView(v.row), criado: v.criado };
    } catch (e) {
      if (!violouUnico(e)) throw e;
      const ganhou = await this.repo.porClientId(dto.client_id);
      if (ganhou && ganhou.consultant_id === c.id) return { view: campoVoucherView(ganhou), criado: false };
      throw clientIdEmUso();
    }
  }

  async doConsultor(c: CampoConsultant): Promise<{ items: CampoVoucherView[] }> {
    this.exigirLigado();
    const rows = await this.repo.listar({ consultant_id: c.id, limit: 200 });
    return { items: rows.map(campoVoucherView) };
  }

  // ── equipe (§38.4) ────────────────────────────────────────

  async listar(q: VouchersQueryDto): Promise<ListaVouchers> {
    this.exigirLigado();
    if (q.praca_id && !isUuid(q.praca_id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    if (q.consultant_id && !isUuid(q.consultant_id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Consultor não encontrado.' });
    if (q.from && q.to && q.from > q.to) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'from: não pode ser depois de to.' });
    const base: FiltroVouchers = {
      ...(q.praca_id ? { praca_id: q.praca_id } : {}),
      ...(q.consultant_id ? { consultant_id: q.consultant_id } : {}),
      ...(q.from ? { desde: inicioDoDia(q.from) } : {}),
      ...(q.to ? { ate: inicioDoDia(addDays(q.to, 1)) } : {}),
      ...(q.q?.trim() ? { q: q.q.trim() } : {}),
      ...(q.status ? { status: q.status as StatusVoucher } : {}),
    };
    const cond = q.situacao ? condicaoDaSituacao(q.situacao as Situacao) : {};
    const [rows, grupos] = await Promise.all([this.repo.listar({ ...base, ...cond, limit: 500 }), this.repo.contar(base)]);
    const counts = Object.fromEntries([...SITUACOES, 'todos'].map((s) => [s, 0])) as Record<Situacao | 'todos', number>;
    for (const g of grupos) {
      counts[situacaoDo(g)] += g.n;
      counts.todos += g.n;
    }
    return {
      items: await this.comNomes(rows),
      counts,
      coupons_enabled: this.cupons.ligado,
      freela_configured: this.cupons.freelaConfigurado(),
    };
  }

  async detalhe(id: string): Promise<VoucherView & { events: EventoVoucherView[] }> {
    this.exigirLigado();
    const v = await this.achar(id);
    const [view] = await this.comNomes([v]);
    return { ...view!, events: (await this.repo.eventos(id)).map(eventoVoucherView) };
  }

  async aprovar(id: string, dto: AprovarVoucherDto, user: AuthUser, agora = new Date()): Promise<VoucherView> {
    this.exigirLigado();
    const v = await this.achar(id);
    if (await this.replay(dto.client_id, id)) return this.view(id);
    const manual = dto.contractor_user_id ?? null;
    if (manual && !this.cupons.ligado) throw cuponsDesligados();
    if (v.status !== 'pendente') throw transicaoInvalida('Este pedido já foi decidido.');
    const cfg = await this.config();
    const auto = !manual ? await this.cupons.vinculoAutomatico(v.lead_id) : null;
    const link = manual
      ? { user_id: manual, name: dto.contractor_name?.trim() || null, source: 'manual' as const }
      : auto
        ? { user_id: auto.user_id, name: null, source: auto.source }
        : null;
    if (link && this.cupons.ligado && (await this.repo.comCupomDoContratante(link.user_id, id))) throw jaTemCupom();
    const couponStatus: CouponStatus = !this.cupons.ligado ? 'nao_aplicavel' : link ? 'aguardando_freela' : 'aguardando_vinculo';
    const note = dto.note?.trim() || null;
    let r: VoucherRow | null;
    try {
      r = await this.repo.emTransacao(`voucher:${id}`, async (tx) => {
        const feito = await tx.transitar(
          id,
          { status: 'pendente' },
          {
            status: 'aprovado',
            decision_reason: note,
            decided_by: user.id,
            decided_by_name: user.name,
            decided_at: agora,
            coupon_status: couponStatus,
            ...(couponStatus === 'nao_aplicavel' ? {} : { coupon_params: paramsDoCupom(cfg) }),
            ...(link && this.cupons.ligado
              ? { contractor_user_id: link.user_id, contractor_name: link.name, contractor_source: link.source, coupon_code: codigoDoCupom(id) }
              : {}),
          },
          { type: 'approved', client_id: dto.client_id, actor_kind: 'equipe', actor_id: user.id, actor_name: user.name, reason: note, data: { coupon_status: couponStatus } },
        );
        if (feito && link && this.cupons.ligado) {
          await tx.inserirEvento(id, {
            type: 'contractor_linked',
            client_id: null,
            actor_kind: link.source === 'manual' ? 'equipe' : 'sistema',
            actor_id: link.source === 'manual' ? user.id : null,
            actor_name: link.source === 'manual' ? user.name : null,
            reason: null,
            data: { source: link.source, ...(link.name ? { contractor_name: link.name } : {}) },
          });
        }
        return feito;
      });
    } catch (e) {
      if (violouUnico(e)) {
        if (await this.replay(dto.client_id, id)) return this.view(id);
        throw jaTemCupom();
      }
      throw e;
    }
    if (!r) throw transicaoInvalida('Este pedido já foi decidido.');
    if (couponStatus === 'aguardando_freela') await this.cupons.tentarCriar(id, agora);
    return this.view(id);
  }

  async reprovar(id: string, dto: ReprovarVoucherDto, user: AuthUser, agora = new Date()): Promise<VoucherView> {
    this.exigirLigado();
    const v = await this.achar(id);
    if (await this.replay(dto.client_id, id)) return this.view(id);
    const cfg = await this.config();
    const motivo = dto.reason?.trim() || null;
    if ((cfg.motivo_reprovacao === 'obrigatorio' && !motivo) || (motivo !== null && motivo.length < 3)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'reason: diga o motivo (de 3 a 500 caracteres). O consultor vê o que você escrever.' });
    }
    if (v.status !== 'pendente') throw transicaoInvalida('Este pedido já foi decidido.');
    const r = await this.repo
      .emTransacao(`voucher:${id}`, (tx) =>
        tx.transitar(
          id,
          { status: 'pendente' },
          { status: 'reprovado', decision_reason: motivo, decided_by: user.id, decided_by_name: user.name, decided_at: agora },
          { type: 'rejected', client_id: dto.client_id, actor_kind: 'equipe', actor_id: user.id, actor_name: user.name, reason: motivo, data: {} },
        ),
      )
      .catch(async (e) => {
        if (violouUnico(e) && (await this.replay(dto.client_id, id))) return 'replay' as const;
        throw e;
      });
    if (r === 'replay') return this.view(id);
    if (!r) throw transicaoInvalida('Este pedido já foi decidido.');
    return this.view(id);
  }

  async candidatos(id: string, q?: string): Promise<{ q: string; items: ContratanteCandidato[] }> {
    this.exigirLigado();
    if (!this.cupons.ligado) throw cuponsDesligados();
    const v = await this.achar(id);
    const termo = (q?.trim() || v.company_name).slice(0, 80);
    if (termo.length < 2) return { q: termo, items: [] };
    return { q: termo, items: await this.issuer.contratantes(termo) };
  }

  async vincular(id: string, dto: VincularContratanteDto, user: AuthUser, agora = new Date()): Promise<VoucherView> {
    this.exigirLigado();
    if (!this.cupons.ligado) throw cuponsDesligados();
    const v = await this.achar(id);
    if (await this.replay(dto.client_id, id)) return this.view(id);
    if (v.status !== 'aprovado' || v.coupon_status !== 'aguardando_vinculo') throw transicaoInvalida('Este pedido não está esperando a conta da empresa.');
    if (await this.repo.comCupomDoContratante(dto.contractor_user_id, id)) throw jaTemCupom();
    const nome = dto.contractor_name?.trim() || null;
    let r: VoucherRow | null;
    try {
      r = await this.repo.emTransacao(`voucher:${id}`, (tx) =>
        tx.transitar(
          id,
          { status: 'aprovado', coupon_status: 'aguardando_vinculo' },
          {
            contractor_user_id: dto.contractor_user_id,
            contractor_name: nome,
            contractor_source: 'manual',
            coupon_status: 'aguardando_freela',
            coupon_code: codigoDoCupom(id),
            ...(v.coupon_params ? {} : { coupon_params: paramsDoCupom(CONFIG_VOUCHER.padrao) }),
          },
          {
            type: 'contractor_linked',
            client_id: dto.client_id,
            actor_kind: 'equipe',
            actor_id: user.id,
            actor_name: user.name,
            reason: null,
            data: { source: 'manual', ...(nome ? { contractor_name: nome } : {}) },
          },
        ),
      );
    } catch (e) {
      if (violouUnico(e)) {
        if (await this.replay(dto.client_id, id)) return this.view(id);
        throw jaTemCupom();
      }
      throw e;
    }
    if (!r) throw transicaoInvalida('Este pedido não está esperando a conta da empresa.');
    await this.cupons.tentarCriar(id, agora);
    return this.view(id);
  }

  async tentarDeNovo(id: string, user: AuthUser): Promise<VoucherView> {
    this.exigirLigado();
    await this.achar(id);
    await this.cupons.tentarDeNovo(id, { id: user.id, name: user.name });
    return this.view(id);
  }

  async desativar(id: string, dto: { client_id: string; reason: string }, user: AuthUser): Promise<VoucherView> {
    this.exigirLigado();
    await this.achar(id);
    if (await this.replay(dto.client_id, id)) return this.view(id);
    await this.cupons.desativar(id, dto.client_id, dto.reason.trim(), { id: user.id, name: user.name });
    return this.view(id);
  }

  // ── painel (§38.8) ────────────────────────────────────────

  /** Pedidos feitos no período (dias de Brasília, inclusive) e a situação de cada um agora. `null` com a flag desligada. */
  async resumoPainel(from: string, to: string, pracaId?: string): Promise<ResumoCuponsPainel | null> {
    if (!this.ligado) return null;
    const grupos = await this.repo.contar({ desde: inicioDoDia(from), ate: inicioDoDia(addDays(to, 1)), ...(pracaId ? { praca_id: pracaId } : {}) });
    const r: ResumoCuponsPainel = { requested: 0, pending: 0, approved: 0, rejected: 0, coupons_created: 0 };
    for (const g of grupos) {
      r.requested += g.n;
      if (g.status === 'pendente') r.pending += g.n;
      if (g.status === 'aprovado') r.approved += g.n;
      if (g.status === 'reprovado') r.rejected += g.n;
      if (g.coupon_status && ['criado', 'usado', 'vencido', 'desativado'].includes(g.coupon_status)) r.coupons_created += g.n;
    }
    return r;
  }

  // ── internos ──────────────────────────────────────────────

  private async achar(id: string): Promise<VoucherRow> {
    if (!isUuid(id)) throw naoEncontrado();
    const v = await this.repo.porId(id);
    if (!v) throw naoEncontrado();
    return v;
  }

  /** Reenvio (mesmo `client_id`) da mesma decisão: `true` = devolver o estado atual; de outro pedido = `409 CLIENT_ID_IN_USE`. */
  private async replay(clientId: string, id: string): Promise<boolean> {
    const ev = await this.repo.eventoPorClientId(clientId);
    if (!ev) return false;
    if (ev.voucher_id !== id) throw clientIdEmUso();
    return true;
  }

  private async view(id: string): Promise<VoucherView> {
    const [v] = await this.comNomes([await this.achar(id)]);
    return v!;
  }

  private async comNomes(rows: VoucherRow[]): Promise<VoucherView[]> {
    const nomes = await this.repo.nomesDosConsultores([...new Set(rows.map((r) => r.consultant_id))]);
    return rows.map((r) => voucherView(r, nomes.get(r.consultant_id) ?? '—'));
  }
}
