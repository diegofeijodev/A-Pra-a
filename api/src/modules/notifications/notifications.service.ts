import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { todaySp } from '../../common/time/dates';
import { buildNotifications, type NotifItem } from '../../domain/notification-rules';
import { ActionsService } from '../actions/actions.service';
import { LeadsService } from '../leads/leads.service';
import { MidiaService } from '../midia/midia.service';
import { PracasService } from '../pracas/pracas.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pracas: PracasService,
    private readonly actions: ActionsService,
    private readonly leads: LeadsService,
    private readonly midia: MidiaService,
  ) {}

  /**
   * Os avisos do sino de uma praça, já filtrados pelas dispensas do usuário
   * logado. `praca_id` inexistente ou malformado vira 404 (via `pracas.get`,
   * a primeira leitura — as outras rodam em paralelo depois).
   */
  async list(pracaId: string, user: AuthUser): Promise<NotifItem[]> {
    const praca = await this.pracas.get(pracaId);
    const [steps, actions, leadsDaPraca, fill, campanhas, dispensadas] = await Promise.all([
      this.pracas.steps(pracaId),
      this.actions.list(pracaId),
      this.leads.list({ praca_id: pracaId }),
      this.midia.fillBrake(pracaId),
      this.midia.listCampanhas({ praca_id: pracaId }),
      this.prisma.user_dismissed_notifs.findMany({
        where: { user_id: user.id },
        select: { notif_id: true },
      }),
    ]);

    const notifs = buildNotifications({
      praca: { id: praca.id, name: praca.name, start_date: praca.start_date },
      today: todaySp(),
      now: new Date(),
      actions: actions.map((a) => ({
        id: a.id,
        title: a.title,
        step: a.step,
        rec: a.rec,
        due_override: a.due_override,
        completed_at: a.completed_at,
        completions: a.completions,
      })),
      steps: steps.map((s) => ({ n: s.n, status: s.status, lock_reason: s.lock_reason })),
      leads: leadsDaPraca.map((l) => ({
        id: l.id,
        name: l.name,
        stage: l.stage,
        stalled_days: l.stalled_days,
      })),
      fill_hours: fill.fill_hours,
      campanhas_acima_teto: campanhas
        .filter((c) => c.status === 'ativa' && c.metrics.acima_teto)
        .map((c) => ({ id: c.id, name: c.name })),
    });

    // Prefixo por praça (RULING): o mesmo `lock-3` de duas praças não pode
    // compartilhar dispensa — cada aviso é único por (praça, regra).
    const comPrefixo = notifs.map((n) => ({ ...n, id: `${pracaId}:${n.id}` }));
    const dispensadasIds = new Set(dispensadas.map((d) => d.notif_id));
    return comPrefixo.filter((n) => !dispensadasIds.has(n.id));
  }

  /** Marca ids de aviso como dispensados para o usuário logado (upsert — idempotente). */
  async dismiss(ids: string[], user: AuthUser): Promise<{ ok: true }> {
    const unicos = [...new Set(ids)];
    await this.prisma.$transaction(
      unicos.map((notif_id) =>
        this.prisma.user_dismissed_notifs.upsert({
          where: { user_id_notif_id: { user_id: user.id, notif_id } },
          update: {},
          create: { user_id: user.id, notif_id },
        }),
      ),
    );
    return { ok: true };
  }

  /** Desfaz a dispensa dos ids para o usuário logado. Id não dispensado também responde `{ok: true}`. */
  async undismiss(ids: string[], user: AuthUser): Promise<{ ok: true }> {
    const unicos = [...new Set(ids)];
    await this.prisma.user_dismissed_notifs.deleteMany({
      where: { user_id: user.id, notif_id: { in: unicos } },
    });
    return { ok: true };
  }
}
