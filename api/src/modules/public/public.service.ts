import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { phoneKey } from '../../common/phone/phone';
import { todaySp } from '../../common/time/dates';
import { CreatePublicLeadDto } from './dto/public.dto';

export interface PublicPracaView {
  id: string;
  name: string;
  city: string;
}

export interface PublicLeadResult {
  ok: true;
  duplicate?: true;
}

const AUTOR_FORMULARIO = 'Formulário';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /v1/public/pracas/:id` — só o que a tela do formulário precisa mostrar. */
  async praca(id: string): Promise<PublicPracaView> {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const praca = await this.prisma.pracas.findUnique({
      where: { id },
      select: { id: true, name: true, city: true },
    });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    return praca;
  }

  /**
   * `POST /v1/public/leads` — `formulario.$pracaId.tsx:35-52` portado para o
   * servidor. Telefone repetido na mesma praça não cria lead de novo: só
   * deixa rastro de que a pessoa preencheu outra vez.
   */
  async createLead(dto: CreatePublicLeadDto): Promise<PublicLeadResult> {
    const praca = await this.prisma.pracas.findUnique({ where: { id: dto.praca_id }, select: { id: true } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });

    const key = phoneKey(dto.phone);
    const duplicado = key
      ? await this.prisma.leads.findFirst({
          where: { praca_id: dto.praca_id, phone_key: key, archived: false },
          select: { id: true },
        })
      : null;

    if (duplicado) {
      await this.prisma.lead_events.create({
        data: {
          lead_id: duplicado.id,
          author_id: null,
          author_label: AUTOR_FORMULARIO,
          kind: 'note',
          text: 'Preencheu o formulário de novo.',
        },
      });
      return { ok: true, duplicate: true };
    }

    const owner = await this.prisma.users.findFirst({
      where: { active: true },
      orderBy: [{ sort: 'asc' }, { created_at: 'asc' }],
      select: { id: true },
    });

    const campanhaId = dto.camp && isUuid(dto.camp) ? await this.campanhaIdOrNull(dto.camp) : null;

    const hoje = todaySp();
    const origemLabel = dto.origem === 'pago' ? 'tráfego pago' : 'orgânico';
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.leads.create({
        data: {
          praca_id: dto.praca_id,
          name: dto.name.trim(),
          city: dto.city.trim(),
          phone: dto.phone.trim(),
          phone_key: key,
          decisor: dto.decisor?.trim() || '—',
          classe: 'alvo',
          origem: origemLabel,
          owner_id: owner?.id ?? null,
          stage: 1,
          entered_at: hoje,
          stage_since: hoje,
          campanha_id: campanhaId,
          form_answer: dto.freq ? `Fica sem gente ${dto.freq}x por mês` : null,
        },
      });
      await tx.lead_events.create({
        data: {
          lead_id: lead.id,
          author_id: null,
          author_label: AUTOR_FORMULARIO,
          kind: 'note',
          text: 'Lead entrou pelo formulário de captura.',
        },
      });
    });

    return { ok: true };
  }

  private async campanhaIdOrNull(id: string): Promise<string | null> {
    const campanha = await this.prisma.campanhas.findUnique({ where: { id }, select: { id: true } });
    return campanha?.id ?? null;
  }
}
