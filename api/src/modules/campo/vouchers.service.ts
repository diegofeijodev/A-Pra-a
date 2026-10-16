import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { todaySp } from '../../common/time/dates';
import type { DecideVoucherDto, VouchersQueryDto } from './dto/consultores.dto';

export interface VoucherView {
  id: string;
  code: string;
  status: string;
  valid_until: string;
  lead_id: string;
  lead_name: string;
  consultant_id: string;
  consultant_name: string;
  visit_id: string;
  praca_id: string;
  freela_ref: string | null;
  decision_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  used_at: string | null;
  created_at: string;
}

const COM_NOMES = {
  lead: { select: { name: true } },
  consultant: { select: { name: true } },
  decider: { select: { name: true } },
} satisfies Prisma.field_vouchersInclude;

type VoucherRow = Prisma.field_vouchersGetPayload<{ include: typeof COM_NOMES }>;

function toView(v: VoucherRow): VoucherView {
  return {
    id: v.id,
    code: v.code,
    status: v.status,
    valid_until: v.valid_until,
    lead_id: v.lead_id,
    lead_name: v.lead.name,
    consultant_id: v.consultant_id,
    consultant_name: v.consultant.name,
    visit_id: v.visit_id,
    praca_id: v.praca_id,
    freela_ref: v.freela_ref,
    decision_note: v.decision_note,
    decided_by_name: v.decider?.name ?? null,
    decided_at: v.decided_at?.toISOString() ?? null,
    used_at: v.used_at?.toISOString() ?? null,
    created_at: v.created_at.toISOString(),
  };
}

const naoAchado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Voucher não encontrado.' });

/**
 * Vouchers do lado do gestor (contrato §21.7): o representante pede, o gestor
 * lança no Freela e libera (ou recusa), e depois marca usado. Validade = a
 * semana do pedido; o fechamento das 00:05 expira os vencidos.
 */
@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: VouchersQueryDto): Promise<VoucherView[]> {
    const rows = await this.prisma.field_vouchers.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.praca_id ? { praca_id: q.praca_id } : {}) },
      include: COM_NOMES,
      orderBy: { created_at: 'desc' },
      take: 500,
    });
    // Pedidos esperando o gestor primeiro.
    return rows.sort((a, b) => Number(b.status === 'solicitado') - Number(a.status === 'solicitado')).map(toView);
  }

  async decide(id: string, dto: DecideVoucherDto, user: AuthUser, agora = new Date()): Promise<VoucherView> {
    const v = await this.findOrFail(id);
    if (v.status !== 'solicitado') throw this.estado(v.status);
    this.naoVencido(v, agora);
    if (dto.decision === 'recusado' && !dto.note?.trim()) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'note: diga por que o voucher foi recusado.' });
    }
    const r = await this.prisma.field_vouchers.updateMany({
      where: { id, status: 'solicitado' },
      data: {
        status: dto.decision,
        freela_ref: dto.freela_ref?.trim() || null,
        decision_note: dto.note?.trim() || null,
        decided_by: user.id,
        decided_at: agora,
      },
    });
    if (r.count === 0) throw this.estado((await this.findOrFail(id)).status);
    return toView(await this.findOrFail(id));
  }

  async markUsed(id: string, agora = new Date()): Promise<VoucherView> {
    const v = await this.findOrFail(id);
    if (v.status !== 'liberado') throw this.estado(v.status);
    this.naoVencido(v, agora);
    const r = await this.prisma.field_vouchers.updateMany({ where: { id, status: 'liberado' }, data: { status: 'usado', used_at: agora } });
    if (r.count === 0) throw this.estado((await this.findOrFail(id)).status);
    return toView(await this.findOrFail(id));
  }

  /** Fechamento da meia-noite: pedidos e liberados vencidos viram `expirado`. */
  async expire(agora = new Date()): Promise<number> {
    const r = await this.prisma.field_vouchers.updateMany({
      where: { status: { in: ['solicitado', 'liberado'] }, valid_until: { lt: todaySp(agora) } },
      data: { status: 'expirado' },
    });
    return r.count;
  }

  private async findOrFail(id: string): Promise<VoucherRow> {
    if (!isUuid(id)) throw naoAchado();
    const v = await this.prisma.field_vouchers.findUnique({ where: { id }, include: COM_NOMES });
    if (!v) throw naoAchado();
    return v;
  }

  private naoVencido(v: { valid_until: string }, agora: Date): void {
    if (v.valid_until < todaySp(agora)) {
      throw new ConflictException({ code: 'VOUCHER_EXPIRED', message: 'O voucher venceu: ele valia só para a semana do pedido.' });
    }
  }

  private estado(status: string) {
    return new ConflictException({ code: 'VOUCHER_STATE', message: `Este voucher está "${status}" e não aceita essa ação.` });
  }
}
