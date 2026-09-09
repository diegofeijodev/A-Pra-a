import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { todaySp } from '../../common/time/dates';
import { STEPS } from '../../domain/catalog';
import { fmtBr, parseRec, recFromRow, recToRow, type Rec, type RecRow } from '../../domain/recurrence';
import {
  CompleteActionDto,
  CreateActionDto,
  CreateCommentDto,
  CreateSubitemDto,
  CreateTemplateActionDto,
  PostponeActionDto,
  ReassignActionDto,
  RecDto,
  UncompleteActionDto,
  UpdateActionDto,
  UpdateTemplateActionDto,
} from './dto/actions.dto';

export interface ActionView {
  id: string;
  praca_id: string;
  template_key: string | null;
  step: number;
  title: string;
  owners: string[];
  rec: Rec;
  tools: string[];
  expected: string | null;
  msg: string | null;
  attention: string | null;
  expects_result: boolean;
  due_override: string | null;
  postpone_count: number;
  completed_at: string | null;
  completed_by: string | null;
  result: number | null;
  sort: number;
  completions: Record<string, { by: string; at: string; result: number | null }>;
  comments: { id: string; author_id: string; at: string; text: string }[];
  subitems: { id: string; text: string; done: boolean; sort: number }[];
}

export interface TemplateActionView {
  id: string;
  key: string;
  step: number;
  title: string;
  owners: string[];
  rec: Rec;
  tools: string[];
  how_to: string[];
  expected: string | null;
  msg: string | null;
  attention: string | null;
  expects_result: boolean;
  sort: number;
}

const COM_TUDO = {
  completions: true,
  comments: { orderBy: { at: 'asc' } },
  subitems: { orderBy: { sort: 'asc' } },
} as const;

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── ações da praça ──────────────────────────────────────────
  async list(pracaId: string): Promise<ActionView[]> {
    await this.pracaOrFail(pracaId);
    const rows = await this.prisma.actions.findMany({
      where: { praca_id: pracaId },
      include: COM_TUDO,
      orderBy: [{ step: 'asc' }, { sort: 'asc' }, { created_at: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async get(id: string): Promise<ActionView> {
    return this.toView(await this.findOrFail(id));
  }

  /**
   * Ação avulsa (fora do roteiro): entra como fixa (`step 0`), com data
   * marcada — `rec once day 0` + `due_override` na data escolhida, para que a
   * data não dance quando a praça mudar de início.
   */
  async create(dto: CreateActionDto): Promise<ActionView> {
    const praca = await this.pracaOrFail(dto.praca_id);
    await this.assertPessoas(dto.owners);
    const criada = await this.prisma.actions.create({
      data: {
        praca_id: praca.id,
        step: 0,
        title: dto.title.trim(),
        owners: dto.owners,
        ...recToRow({ kind: 'once', day: 0 }),
        due_override: dto.due_date,
      },
    });
    return this.get(criada.id);
  }

  async update(id: string, dto: UpdateActionDto): Promise<ActionView> {
    await this.findOrFail(id);
    if (dto.owners) await this.assertPessoas(dto.owners);
    await this.prisma.actions.update({
      where: { id },
      data: { title: dto.title?.trim(), owners: dto.owners },
    });
    return this.get(id);
  }

  /**
   * Conclui: ação `once` marca `completed_at/by/result`; recorrente registra a
   * ocorrência do dia em `action_completions` (padrão: hoje em Brasília).
   * Idempotente — concluir de novo só atualiza quem/quando.
   */
  async complete(id: string, dto: CompleteActionDto, user: AuthUser): Promise<ActionView> {
    const acao = await this.findOrFail(id);
    if (recFromRow(acao).kind === 'once') {
      await this.prisma.actions.update({
        where: { id },
        data: { completed_at: new Date(), completed_by: user.id, result: dto.result ?? null },
      });
    } else {
      const date = dto.date ?? todaySp();
      await this.prisma.action_completions.upsert({
        where: { action_id_date: { action_id: id, date } },
        update: { by: user.id, at: new Date(), result: dto.result ?? null },
        create: { action_id: id, date, by: user.id, result: dto.result ?? null },
      });
    }
    return this.get(id);
  }

  async uncomplete(id: string, dto: UncompleteActionDto): Promise<ActionView> {
    const acao = await this.findOrFail(id);
    if (recFromRow(acao).kind === 'once') {
      await this.prisma.actions.update({
        where: { id },
        data: { completed_at: null, completed_by: null, result: null },
      });
    } else {
      await this.prisma.action_completions.deleteMany({
        where: { action_id: id, date: dto.date ?? todaySp() },
      });
    }
    return this.get(id);
  }

  /** Adiar só faz sentido em ação com data marcada (`once`) — deixa rastro em comentário. */
  async postpone(id: string, dto: PostponeActionDto, user: AuthUser): Promise<ActionView> {
    const acao = await this.findOrFail(id);
    if (recFromRow(acao).kind !== 'once') {
      throw new BadRequestException({
        code: 'ACTION_NOT_POSTPONABLE',
        message: 'Só ação com data marcada pode ser adiada.',
      });
    }
    await this.prisma.$transaction([
      this.prisma.actions.update({
        where: { id },
        data: { due_override: dto.new_date, postpone_count: { increment: 1 } },
      }),
      this.prisma.action_comments.create({
        data: {
          action_id: id,
          author_id: user.id,
          text: `Adiada para ${fmtBr(dto.new_date)} — ${dto.reason.trim()}`,
        },
      }),
    ]);
    return this.get(id);
  }

  async reassign(id: string, dto: ReassignActionDto): Promise<ActionView> {
    await this.findOrFail(id);
    await this.assertPessoas([dto.user_id]);
    await this.prisma.actions.update({ where: { id }, data: { owners: [dto.user_id] } });
    return this.get(id);
  }

  async addComment(id: string, dto: CreateCommentDto, user: AuthUser): Promise<ActionView> {
    await this.findOrFail(id);
    await this.prisma.action_comments.create({
      data: { action_id: id, author_id: user.id, text: dto.text.trim() },
    });
    return this.get(id);
  }

  async addSubitem(id: string, dto: CreateSubitemDto): Promise<ActionView> {
    await this.findOrFail(id);
    const ultimo = await this.prisma.action_subitems.findFirst({
      where: { action_id: id },
      orderBy: { sort: 'desc' },
      select: { sort: true },
    });
    await this.prisma.action_subitems.create({
      data: { action_id: id, text: dto.text.trim(), sort: (ultimo?.sort ?? -1) + 1 },
    });
    return this.get(id);
  }

  async toggleSubitem(id: string, subitemId: string): Promise<ActionView> {
    await this.findOrFail(id);
    if (!isUuid(subitemId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Subitem não encontrado.' });
    }
    const sub = await this.prisma.action_subitems.findUnique({ where: { id: subitemId } });
    if (!sub || sub.action_id !== id) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Subitem não encontrado.' });
    }
    await this.prisma.action_subitems.update({ where: { id: subitemId }, data: { done: !sub.done } });
    return this.get(id);
  }

  // ── roteiro-modelo ──────────────────────────────────────────
  async listTemplates(): Promise<TemplateActionView[]> {
    const rows = await this.prisma.template_actions.findMany({
      orderBy: [{ sort: 'asc' }, { key: 'asc' }],
    });
    return rows.map((t) => ({
      id: t.id,
      key: t.key,
      step: t.step,
      title: t.title,
      owners: t.owners,
      rec: recFromRow(t),
      tools: t.tools,
      how_to: t.how_to,
      expected: t.expected,
      msg: t.msg,
      attention: t.attention,
      expects_result: t.expects_result,
      sort: t.sort,
    }));
  }

  async createTemplate(dto: CreateTemplateActionDto): Promise<TemplateActionView> {
    this.assertStep(dto.step);
    await this.assertPessoas(dto.owners);
    const ultimo = await this.prisma.template_actions.findFirst({
      where: { step: dto.step },
      orderBy: { sort: 'desc' },
      select: { sort: true },
    });
    const criada = await this.prisma.template_actions.create({
      data: {
        // `key` é a identidade estável do roteiro (o seed faz upsert por ela);
        // ação criada à mão ganha uma chave própria, fora do padrão `s1a1`.
        key: `custom-${randomUUID().slice(0, 8)}`,
        step: dto.step,
        title: dto.title.trim(),
        owners: dto.owners,
        ...recToRow(this.assertRec(dto.rec)),
        sort: (ultimo?.sort ?? -1) + 1,
      },
    });
    return this.templateOrFail(criada.id);
  }

  async updateTemplate(id: string, dto: UpdateTemplateActionDto): Promise<TemplateActionView> {
    await this.templateOrFail(id);
    if (dto.owners) await this.assertPessoas(dto.owners);
    await this.prisma.template_actions.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        owners: dto.owners,
        ...(dto.rec ? recToRow(this.assertRec(dto.rec)) : {}),
      },
    });
    return this.templateOrFail(id);
  }

  async removeTemplate(id: string): Promise<{ ok: true }> {
    await this.templateOrFail(id);
    // Só some do roteiro-modelo: as ações já instanciadas nas praças ficam.
    await this.prisma.template_actions.delete({ where: { id } });
    return { ok: true };
  }

  // ── internos ────────────────────────────────────────────────
  private assertRec(dto: RecDto): Rec {
    const rec = parseRec(dto);
    if (!rec) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          'rec: faltou campo para este tipo — once exige day; daily/weekday exigem start_day; weekly exige weekday e start_day; monthly exige month_day e start_day.',
      });
    }
    return rec;
  }

  private assertStep(step: number) {
    if (step !== 0 && !STEPS.some((s) => s.n === step)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'step: use 0 (ação fixa) ou uma etapa do roteiro (1 a 11).',
      });
    }
  }

  private async assertPessoas(ids: string[]) {
    const unicos = [...new Set(ids)];
    const achados = await this.prisma.users.count({ where: { id: { in: unicos } } });
    if (achados !== unicos.length) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pessoa não encontrada.' });
    }
  }

  private async pracaOrFail(id: string) {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const praca = await this.prisma.pracas.findUnique({ where: { id } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    return praca;
  }

  private async templateOrFail(id: string): Promise<TemplateActionView> {
    if (!isUuid(id)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ação-modelo não encontrada.' });
    }
    const row = await this.prisma.template_actions.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ação-modelo não encontrada.' });
    }
    return {
      id: row.id,
      key: row.key,
      step: row.step,
      title: row.title,
      owners: row.owners,
      rec: recFromRow(row),
      tools: row.tools,
      how_to: row.how_to,
      expected: row.expected,
      msg: row.msg,
      attention: row.attention,
      expects_result: row.expects_result,
      sort: row.sort,
    };
  }

  private async findOrFail(id: string) {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ação não encontrada.' });
    const acao = await this.prisma.actions.findUnique({ where: { id }, include: COM_TUDO });
    if (!acao) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ação não encontrada.' });
    return acao;
  }

  private toView(
    a: {
      id: string;
      praca_id: string;
      template_key: string | null;
      step: number;
      title: string;
      owners: string[];
      tools: string[];
      expected: string | null;
      msg: string | null;
      attention: string | null;
      expects_result: boolean;
      due_override: string | null;
      postpone_count: number;
      completed_at: Date | null;
      completed_by: string | null;
      result: number | null;
      sort: number;
      completions: { date: string; by: string; at: Date; result: number | null }[];
      comments: { id: string; author_id: string; at: Date; text: string }[];
      subitems: { id: string; text: string; done: boolean; sort: number }[];
    } & RecRow,
  ): ActionView {
    return {
      id: a.id,
      praca_id: a.praca_id,
      template_key: a.template_key,
      step: a.step,
      title: a.title,
      owners: a.owners,
      rec: recFromRow(a),
      tools: a.tools,
      expected: a.expected,
      msg: a.msg,
      attention: a.attention,
      expects_result: a.expects_result,
      due_override: a.due_override,
      postpone_count: a.postpone_count,
      completed_at: a.completed_at?.toISOString() ?? null,
      completed_by: a.completed_by,
      result: a.result,
      sort: a.sort,
      completions: Object.fromEntries(
        [...a.completions]
          .sort((x, y) => x.date.localeCompare(y.date))
          .map((c) => [c.date, { by: c.by, at: c.at.toISOString(), result: c.result }]),
      ),
      comments: a.comments.map((c) => ({
        id: c.id,
        author_id: c.author_id,
        at: c.at.toISOString(),
        text: c.text,
      })),
      subitems: a.subitems.map((s) => ({ id: s.id, text: s.text, done: s.done, sort: s.sort })),
    };
  }
}
