import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { LOVABLE_E_FLAGS, type FlagsLovableE } from '../../common/flags/lovable-e.flags';
import { todaySp } from '../../common/time/dates';
import { mascararEmailContato, mascararTelefoneContato } from '../../domain/campo-rules';
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
  /** `HH:mm` de Brasília ou `null` (§30.3). */
  followup_time: string | null;
  /** `(11) 9****-4321`; o número completo só vai ao consultor dono (`contact_phone`). */
  contact_phone_masked: string | null;
  contact_phone?: string | null;
  /** Lote E §41.4 (só com a flag): `m***@dominio.com`; o completo só ao consultor dono (`contact_email`). */
  contact_email_masked?: string | null;
  contact_email?: string | null;
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

const view = (r: RetornoLinha, completo = false): FollowupView => ({
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
  followup_time: r.followup_time,
  contact_phone_masked: mascararTelefoneContato(r.contact_phone),
  ...(completo ? { contact_phone: r.contact_phone } : {}),
  ...(r.contact_email !== undefined
    ? { contact_email_masked: mascararEmailContato(r.contact_email), ...(completo ? { contact_email: r.contact_email } : {}) }
    : {}),
  due: r.due,
  days_late: r.days_late,
  visited_at: r.visited_at.toISOString(),
  interlocutor_name: r.interlocutor_name,
  interest: r.interest,
});

/** Fila "Retornos de hoje / atrasados" (contrato §25.4): equipe (por praça) e consultor (só os dele). */
@Injectable()
export class FollowupsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(LOVABLE_E_FLAGS) private readonly lovE?: FlagsLovableE,
  ) {}

  private get comEmail(): boolean {
    return this.lovE?.contact_email === true;
  }

  async equipe(pracaId: string | undefined, agora = new Date()): Promise<FollowupsResponse> {
    if (pracaId) {
      const praca = await this.prisma.pracas.findUnique({ where: { id: pracaId }, select: { id: true } });
      if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    }
    return this.montar(await lerRetornosPendentes(this.prisma, { hoje: todaySp(agora), pracaId, comEmail: this.comEmail }), todaySp(agora), false);
  }

  /** O consultor só enxerga retornos das próprias visitas — o filtro é do token, nunca do pedido. */
  async doConsultor(c: CampoConsultant, agora = new Date()): Promise<FollowupsResponse> {
    const hoje = todaySp(agora);
    return this.montar(await lerRetornosPendentes(this.prisma, { hoje, consultantId: c.id, comEmail: this.comEmail }), hoje, true);
  }

  private montar(l: Awaited<ReturnType<typeof lerRetornosPendentes>>, day: string, completo: boolean): FollowupsResponse {
    return {
      day,
      today: l.today,
      overdue: l.overdue,
      total: l.itens.length,
      truncated: l.itens.length > LIMITE_FILA,
      items: l.itens.slice(0, LIMITE_FILA).map((r) => view(r, completo)),
    };
  }
}
