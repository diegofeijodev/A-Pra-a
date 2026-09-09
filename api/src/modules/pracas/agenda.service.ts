import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { addDays, daysBetween, eachDay, todaySp } from '../../common/time/dates';
import {
  dueDateOf,
  isDoneOn,
  occursOn,
  recFromRow,
  type RecAction,
  type RecPraca,
} from '../../domain/recurrence';
import { AgendaQueryDto } from './dto/pracas.dto';

/** Máximo de dias que `by_date` cobre de uma vez (contrato §6). */
export const AGENDA_MAX_DIAS = 62;

export interface AgendaAction extends RecAction {
  id: string;
  owners: string[];
}

export interface AgendaInput {
  praca: RecPraca;
  actions: AgendaAction[];
  /** Pessoas consideradas na carga do dia — sempre todas, sem o filtro `person`. */
  users: { id: string }[];
  today: string;
  /** `'all'` (padrão) ou o uuid de uma pessoa. */
  person?: string;
  from?: string | null;
  to?: string | null;
}

export interface AgendaView {
  late: { action_id: string; date: string; days_late: number }[];
  today: { action_id: string; date: string }[];
  next7: { date: string; action_ids: string[] }[];
  by_date: Record<string, string[]>;
  load: { user_id: string; count: number }[];
}

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async agenda(pracaId: string, query: AgendaQueryDto): Promise<AgendaView> {
    if (!isUuid(pracaId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    }
    const praca = await this.prisma.pracas.findUnique({ where: { id: pracaId } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });

    const person = query.person ?? 'all';
    if (person !== 'all' && !isUuid(person)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'person: use "all" ou o id de uma pessoa.',
      });
    }

    const { from, to } = this.faixa(query);

    const [rows, users] = await Promise.all([
      this.prisma.actions.findMany({
        where: { praca_id: pracaId },
        include: { completions: true },
        orderBy: [{ step: 'asc' }, { sort: 'asc' }],
      }),
      this.prisma.users.findMany({
        where: { active: true },
        orderBy: [{ sort: 'asc' }, { created_at: 'asc' }],
        select: { id: true },
      }),
    ]);

    const actions: AgendaAction[] = rows.map((a) => ({
      id: a.id,
      step: a.step,
      owners: a.owners,
      rec: recFromRow(a),
      due_override: a.due_override,
      completed_at: a.completed_at,
      completions: Object.fromEntries(
        a.completions.map((c) => [c.date, { by: c.by, at: c.at.toISOString(), result: c.result }]),
      ),
    }));

    return this.computeAgenda({
      praca: { start_date: praca.start_date },
      actions,
      users,
      today: todaySp(),
      person,
      from,
      to,
    });
  }

  /**
   * `from`/`to` valem só para `by_date`. Sem nenhum dos dois, `by_date` volta
   * vazio (a tela "Hoje" não precisa dele). Com só um, o outro vira o mesmo
   * dia. Intervalo maior que `AGENDA_MAX_DIAS` (ou invertido) = 400.
   */
  private faixa(query: AgendaQueryDto): { from: string | null; to: string | null } {
    const from = query.from ?? query.to ?? null;
    const to = query.to ?? query.from ?? null;
    if (!from || !to) return { from: null, to: null };

    const dias = daysBetween(from, to) + 1;
    if (dias < 1) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'to: a data final não pode ser anterior à inicial.',
      });
    }
    if (dias > AGENDA_MAX_DIAS) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `O intervalo de from a to não pode passar de ${AGENDA_MAX_DIAS} dias.`,
      });
    }
    return { from, to };
  }

  /**
   * Cálculo puro da agenda — porta de `.prototype/src/routes/index.tsx:32-83`.
   *
   * `late`/`today`/`next7` são SEMPRE relativos a `today` (nunca a `from`/`to`,
   * que só recortam `by_date`). Para ação recorrente entra no máximo UMA linha
   * em `late`: a varredura vai de 7 dias atrás até ontem e para na primeira
   * ocorrência perdida — ou seja, a mais antiga dentro da janela (o comentário
   * do protótipo diz "a mais recente", mas o código faz assim; mantido igual).
   *
   * `load` ignora o filtro `person` de propósito: a barra de carga mostra o
   * dia de todo mundo, como no protótipo (`index.tsx:74-83`).
   */
  computeAgenda(input: AgendaInput): AgendaView {
    const { praca, today, users } = input;
    const person = input.person ?? 'all';
    const acts = person === 'all' ? input.actions : input.actions.filter((a) => a.owners.includes(person));

    const late: AgendaView['late'] = [];
    const todayItems: AgendaView['today'] = [];
    const next7: AgendaView['next7'] = [];
    const emNext7 = (date: string): string[] => {
      let bloco = next7.find((b) => b.date === date);
      if (!bloco) {
        bloco = { date, action_ids: [] };
        next7.push(bloco);
      }
      return bloco.action_ids;
    };

    for (const a of acts) {
      if (a.rec.kind === 'once') {
        const due = dueDateOf(a, praca);
        if (!a.completed_at && due < today) {
          late.push({ action_id: a.id, date: due, days_late: daysBetween(due, today) });
        } else if (due === today) {
          todayItems.push({ action_id: a.id, date: today });
        } else if (due > today && due <= addDays(today, 7)) {
          emNext7(due).push(a.id);
        }
      } else {
        for (let i = 7; i >= 1; i--) {
          const d = addDays(today, -i);
          if (occursOn(a, praca, d) && !isDoneOn(a, d)) {
            late.push({ action_id: a.id, date: d, days_late: i });
            break; // uma linha por ação
          }
        }
        if (occursOn(a, praca, today)) todayItems.push({ action_id: a.id, date: today });
        for (let i = 1; i <= 7; i++) {
          const d = addDays(today, i);
          if (occursOn(a, praca, d)) emNext7(d).push(a.id);
        }
      }
    }
    next7.sort((x, y) => x.date.localeCompare(y.date));

    const by_date: Record<string, string[]> = {};
    if (input.from && input.to) {
      for (const d of eachDay(input.from, input.to)) {
        by_date[d] = acts
          .filter((a) => (a.rec.kind === 'once' ? dueDateOf(a, praca) === d : occursOn(a, praca, d)))
          .map((a) => a.id);
      }
    }

    const load = users.map((u) => ({
      user_id: u.id,
      count: input.actions.filter(
        (a) =>
          a.owners.includes(u.id) &&
          !isDoneOn(a, today) &&
          (a.rec.kind === 'once' ? dueDateOf(a, praca) === today : occursOn(a, praca, today)),
      ).length,
    }));

    return { late, today: todayItems, next7, by_date, load };
  }
}
