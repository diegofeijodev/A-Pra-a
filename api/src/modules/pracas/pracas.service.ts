import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { STEPS } from '../../domain/catalog';
import { recFromRow, stepInfo, type StepInfo, type StepPraca } from '../../domain/recurrence';
import { GeoService, RAIO_KM_PADRAO } from '../geo/geo.service';
import { CreatePracaDto, StepResultDto, StepUnlockDto, UpdatePracaDto } from './dto/pracas.dto';

export interface PracaView {
  id: string;
  name: string;
  city: string;
  start_date: string;
  end_date: string;
  cobertura: {
    uf: string;
    cidade: string;
    ibge: string;
    lat: number | null;
    lon: number | null;
    vizinhas: string[];
  } | null;
  steps: Record<number, { actual: number | null; unlock: { by: string; at: string; reason: string } | null }>;
  route_daily_goal: number;
  route_start_hour: number;
  route_end_hour: number;
  created_at: string;
}

// Linha de `pracas` + estados das etapas, como sai do Prisma.
type PracaRow = {
  id: string;
  name: string;
  city: string;
  start_date: string;
  end_date: string;
  cobertura_uf: string | null;
  cobertura_cidade: string | null;
  cobertura_ibge: string | null;
  lat: number | null;
  lon: number | null;
  vizinhas: string[];
  route_daily_goal: number;
  route_start_hour: number;
  route_end_hour: number;
  created_at: Date;
  step_states: {
    step_n: number;
    actual: number | null;
    unlocked_by: string | null;
    unlocked_at: Date | null;
    unlock_reason: string | null;
  }[];
};

@Injectable()
export class PracasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  async list(): Promise<PracaView[]> {
    const rows = await this.prisma.pracas.findMany({
      include: { step_states: true },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((p) => this.toView(p));
  }

  async get(id: string): Promise<PracaView> {
    return this.toView(await this.findOrFail(id));
  }

  /**
   * Abre a praça e instancia o roteiro-modelo inteiro como ações dela
   * (`store.tsx:108-118`): cada `template_actions` vira uma `actions` com as
   * mesmas colunas e os `how_to` viram subitens. Também troca a praça ativa
   * de quem criou — quem abre a praça já entra nela.
   */
  async create(dto: CreatePracaDto, user: AuthUser): Promise<PracaView> {
    this.assertPeriodo(dto.start_date, dto.end_date);
    const cobertura = this.resolveCobertura(dto);

    const templates = await this.prisma.template_actions.findMany({
      orderBy: [{ sort: 'asc' }, { key: 'asc' }],
    });

    const pracaId = randomUUID();
    // Ids gerados aqui para poder usar `createMany` (dois INSERTs em vez de
    // ~250) — o roteiro tem 84 ações e a transação interativa do Prisma
    // expira em 5s.
    const acoes = templates.map((t) => {
      const { id: _id, key, how_to: _how, ...cols } = t;
      void _id;
      void _how;
      return { ...cols, id: randomUUID(), praca_id: pracaId, template_key: key };
    });
    const subitens = templates.flatMap((t, i) =>
      t.how_to.map((text, sort) => ({ action_id: acoes[i]!.id, text, sort })),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.pracas.create({
        data: {
          id: pracaId,
          name: dto.name.trim(),
          city: dto.city.trim(),
          start_date: dto.start_date,
          end_date: dto.end_date,
          ...cobertura,
        },
      });
      if (acoes.length) await tx.actions.createMany({ data: acoes });
      if (subitens.length) await tx.action_subitems.createMany({ data: subitens });
      await tx.users.update({ where: { id: user.id }, data: { active_praca_id: pracaId } });
    });

    return this.get(pracaId);
  }

  async update(id: string, dto: UpdatePracaDto): Promise<PracaView> {
    const atual = await this.findOrFail(id);
    this.assertPeriodo(dto.start_date ?? atual.start_date, dto.end_date ?? atual.end_date);
    const inicio = dto.route_start_hour ?? atual.route_start_hour;
    const fim = dto.route_end_hour ?? atual.route_end_hour;
    if (fim <= inicio) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'O horário de fim das rotas precisa ser depois do início.',
      });
    }
    await this.prisma.pracas.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        city: dto.city?.trim(),
        start_date: dto.start_date,
        end_date: dto.end_date,
        route_daily_goal: dto.route_daily_goal,
        route_start_hour: dto.route_start_hour,
        route_end_hour: dto.route_end_hour,
      },
    });
    return this.get(id);
  }

  /**
   * Apaga a praça e, em cascata (schema), ações, subitens, comentários,
   * conclusões e estados de etapa. Quem estava com ela ativa fica sem praça
   * ativa — `users.active_praca_id` não tem FK, então é limpo à mão.
   */
  async remove(id: string): Promise<{ ok: true }> {
    await this.findOrFail(id);
    // `field_consultants.praca_id` é FK Restrict: sem esta guarda o Prisma
    // estouraria P2003 e a tela veria 500.
    const consultores = await this.prisma.field_consultants.count({ where: { praca_id: id } });
    if (consultores > 0) {
      throw new ConflictException({
        code: 'PRACA_HAS_CONSULTANTS',
        message: 'Esta praça tem consultores de campo. Mude-os de praça ou apague-os antes.',
      });
    }
    await this.prisma.$transaction([
      this.prisma.users.updateMany({ where: { active_praca_id: id }, data: { active_praca_id: null } }),
      this.prisma.pracas.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  /** Volta todas as ações da praça para a data original do roteiro (`store.tsx:411-420`). */
  async recalcDates(id: string): Promise<{ ok: true; updated: number }> {
    await this.findOrFail(id);
    const { count } = await this.prisma.actions.updateMany({
      where: { praca_id: id },
      data: { due_override: null, postpone_count: 0 },
    });
    return { ok: true, updated: count };
  }

  async steps(id: string): Promise<StepInfo[]> {
    const { praca, actions } = await this.stepContext(id);
    return STEPS.map((s) => stepInfo(praca, actions, s.n));
  }

  async setStepResult(id: string, n: string, dto: StepResultDto): Promise<StepInfo> {
    const step_n = this.assertStep(n);
    await this.findOrFail(id);
    await this.prisma.praca_step_states.upsert({
      where: { praca_id_step_n: { praca_id: id, step_n } },
      update: { actual: dto.value },
      create: { praca_id: id, step_n, actual: dto.value },
    });
    return this.stepView(id, step_n);
  }

  /** Destrave manual do portão — autor é sempre quem está logado. */
  async unlockStep(id: string, n: string, dto: StepUnlockDto, user: AuthUser): Promise<StepInfo> {
    const step_n = this.assertStep(n);
    await this.findOrFail(id);
    const unlock = {
      unlocked_by: user.id,
      unlocked_at: new Date(),
      unlock_reason: dto.reason.trim(),
    };
    await this.prisma.praca_step_states.upsert({
      where: { praca_id_step_n: { praca_id: id, step_n } },
      update: unlock,
      create: { praca_id: id, step_n, ...unlock },
    });
    return this.stepView(id, step_n);
  }

  // ── internos ────────────────────────────────────────────────
  private async stepView(id: string, n: number): Promise<StepInfo> {
    const { praca, actions } = await this.stepContext(id);
    return stepInfo(praca, actions, n);
  }

  private async stepContext(id: string) {
    const row = await this.findOrFail(id);
    const rows = await this.prisma.actions.findMany({
      where: { praca_id: id },
      include: { completions: { select: { date: true } } },
    });
    const view = this.toView(row);
    const praca: StepPraca = { start_date: row.start_date, steps: view.steps };
    const actions = rows.map((a) => ({
      step: a.step,
      rec: recFromRow(a),
      due_override: a.due_override,
      completed_at: a.completed_at,
      // `stepInfo` só olha SE existe conclusão na data (`actionEverDone`), não
      // quem fez nem quando — por isso a consulta traz só a data e o resto do
      // registro fica vazio aqui.
      completions: Object.fromEntries(a.completions.map((c) => [c.date, { by: '', at: '' }])),
    }));
    return { praca, actions };
  }

  private resolveCobertura(dto: CreatePracaDto) {
    if (!dto.cobertura) return {};
    const centro = this.geo.find(dto.cobertura.ibge);
    if (!centro) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Município não encontrado.' });
    }
    const vizinhas = this.geo.cidadesNoRaio(centro.ibge, dto.cobertura.km ?? RAIO_KM_PADRAO);
    return {
      cobertura_uf: centro.uf,
      cobertura_cidade: centro.nome,
      cobertura_ibge: centro.ibge,
      lat: centro.lat,
      lon: centro.lon,
      vizinhas: vizinhas.map((v) => v.nome),
    };
  }

  private assertPeriodo(start: string, end: string) {
    if (end < start) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'end_date: o fim da praça não pode ser antes do começo.',
      });
    }
  }

  private assertStep(n: string): number {
    const step_n = Number(n);
    if (!Number.isInteger(step_n) || !STEPS.some((s) => s.n === step_n)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Etapa não encontrada.' });
    }
    return step_n;
  }

  private async findOrFail(id: string): Promise<PracaRow> {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const praca = await this.prisma.pracas.findUnique({ where: { id }, include: { step_states: true } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    return praca;
  }

  private toView(p: PracaRow): PracaView {
    const steps: PracaView['steps'] = {};
    for (const s of p.step_states) {
      steps[s.step_n] = {
        actual: s.actual,
        unlock:
          s.unlocked_by && s.unlocked_at
            ? { by: s.unlocked_by, at: s.unlocked_at.toISOString(), reason: s.unlock_reason ?? '' }
            : null,
      };
    }
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      start_date: p.start_date,
      end_date: p.end_date,
      cobertura: p.cobertura_ibge
        ? {
            uf: p.cobertura_uf ?? '',
            cidade: p.cobertura_cidade ?? '',
            ibge: p.cobertura_ibge,
            lat: p.lat,
            lon: p.lon,
            vizinhas: p.vizinhas,
          }
        : null,
      steps,
      route_daily_goal: p.route_daily_goal,
      route_start_hour: p.route_start_hour,
      route_end_hour: p.route_end_hour,
      created_at: p.created_at.toISOString(),
    };
  }
}
