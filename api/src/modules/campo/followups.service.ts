import { Injectable, NotFoundException } from '@nestjs/common';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { todaySp } from '../../common/time/dates';
import { LIMITE_FILA, lerRetornosPendentes, type RetornoLinha } from './retornos-query';

export interface FollowupView {
  visit_id: string;
  lead_id: string;
  lead_name: string;
  phone: string;
  address: string;
  consultant_id: string;
  consultant_name: string;
  praca_id: string | null;
  followup_what: string;
  followup_date: string;
  due: 'hoje' | 'atrasado';
  days_late: number;
  visited_at: string;
  interlocutor_name: string | null;
  interest: string | null;
}

export interface FollowupsResponse {
  day: string;
  today: number;
  overdue: number;
  total: number;
  truncated: boolean;
  items: FollowupView[];
}

const view = (r: RetornoLinha): FollowupView => ({
  visit_id: r.visit_id,
  lead_id: r.lead_id,
  lead_name: r.lead_name,
  phone: r.phone,
  address: r.address,
  consultant_id: r.consultant_id,
  consultant_name: r.consultant_name,
  praca_id: r.praca_id,
  followup_what: r.followup_what,
  followup_date: r.followup_date,
  due: r.due,
  days_late: r.days_late,
  visited_at: r.visited_at.toISOString(),
  interlocutor_name: r.interlocutor_name,
  interest: r.interest,
});

/** Fila "Retornos de hoje / atrasados" (contrato §25.4): equipe (por praça) e consultor (só os dele). */
@Injectable()
export class FollowupsService {
  constructor(private readonly prisma: PrismaService) {}

  async equipe(pracaId: string | undefined, agora = new Date()): Promise<FollowupsResponse> {
    if (pracaId) {
      const praca = await this.prisma.pracas.findUnique({ where: { id: pracaId }, select: { id: true } });
      if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    }
    return this.montar(await lerRetornosPendentes(this.prisma, { hoje: todaySp(agora), pracaId }), todaySp(agora));
  }

  /** O consultor só enxerga retornos das próprias visitas — o filtro é do token, nunca do pedido. */
  async doConsultor(c: CampoConsultant, agora = new Date()): Promise<FollowupsResponse> {
    const hoje = todaySp(agora);
    return this.montar(await lerRetornosPendentes(this.prisma, { hoje, consultantId: c.id }), hoje);
  }

  private montar(l: Awaited<ReturnType<typeof lerRetornosPendentes>>, day: string): FollowupsResponse {
    return {
      day,
      today: l.today,
      overdue: l.overdue,
      total: l.itens.length,
      truncated: l.itens.length > LIMITE_FILA,
      items: l.itens.slice(0, LIMITE_FILA).map(view),
    };
  }
}
