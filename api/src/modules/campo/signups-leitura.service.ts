/**
 * Leituras dos cadastros confirmados (F7, contrato §27.8). "Confirmado" é calculado AQUI, na leitura,
 * sobre as datas imutáveis de `field_signups` e a regra vigente — nunca guardado.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { daysBetween, todaySp } from '../../common/time/dates';
import { CAMPO_DA_REGRA, COLUNA_DIA_DA_REGRA, semanaDe, type RegraConfirmacao } from '../../domain/signup-sync-rules';
import { RotasConfigService } from '../rotas/rotas-config.service';
import type { SignupsEquipeQueryDto, SignupsPeriodoDto } from './dto/signups.dto';

export const FONTE_SIGNUPS = 'Freela GET /v1/admins/consultants/:id/registrations (sincronizado)';
const LIMITE_ITENS = 500;
const MAX_DIAS = 92;

const FORMULA: Record<RegraConfirmacao, string> = {
  activated: 'cadastros do Freela com activated_at preenchido (primeiro acesso) e dia de Brasília entre from e to',
  first_vacancy: 'cadastros do Freela com first_vacancy_at preenchido (primeira vaga) e dia de Brasília entre from e to',
  first_job_completed: 'cadastros do Freela com first_job_completed_at preenchido (primeiro serviço concluído) e dia de Brasília entre from e to',
};

export interface Contagem {
  today: number;
  week: number;
  rule: RegraConfirmacao;
  source: string;
}

@Injectable()
export class SignupsLeituraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: RotasConfigService,
  ) {}

  private periodo(q: SignupsPeriodoDto, agora: Date): { from: string; to: string } {
    const semana = semanaDe(todaySp(agora));
    const from = q.from ?? (q.to ? q.to : semana.from);
    const to = q.to ?? (q.from ? q.from : semana.to);
    if (to < from) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A data final precisa ser igual ou depois da inicial.' });
    if (daysBetween(from, to) + 1 > MAX_DIAS) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `O período pode ter no máximo ${MAX_DIAS} dias.` });
    return { from, to };
  }

  /** Equipe: todos os consultores do filtro, com a conta e a fonte. */
  async equipe(q: SignupsEquipeQueryDto, agora = new Date()) {
    const regra = (await this.config.cadastro()).confirmation_rule;
    const { from, to } = this.periodo(q, agora);
    const dia = COLUNA_DIA_DA_REGRA[regra];
    const campo = CAMPO_DA_REGRA[regra];

    const consultores = await this.prisma.field_consultants.findMany({
      where: { ...(q.praca_id ? { praca_id: q.praca_id } : {}), ...(q.consultant_id ? { id: q.consultant_id } : {}) },
      select: { id: true, name: true, praca_id: true, signup_sync: true },
      orderBy: { name: 'asc' },
    });
    const ids = consultores.map((c) => c.id);
    const confirmadosWhere = { consultant_id: { in: ids }, [dia]: { gte: from, lte: to } } as Prisma.field_signupsWhereInput;
    const [itens, porConsultor, naoConfirmados, ambiguos] = await Promise.all([
      this.prisma.field_signups.findMany({
        where: confirmadosWhere,
        orderBy: [{ [dia]: 'desc' }, { id: 'asc' }] as Prisma.field_signupsOrderByWithRelationInput[],
        take: LIMITE_ITENS,
      }),
      this.prisma.field_signups.groupBy({ by: ['consultant_id'], where: confirmadosWhere, _count: { _all: true } }),
      this.prisma.field_signups.groupBy({
        by: ['consultant_id'],
        where: { consultant_id: { in: ids }, created_day: { gte: from, lte: to }, [campo]: null } as Prisma.field_signupsWhereInput,
        _count: { _all: true },
      }),
      this.prisma.field_signups.count({ where: { consultant_id: { in: ids }, match_status: 'ambiguous' } }),
    ]);
    const conf = new Map(porConsultor.map((g) => [g.consultant_id, g._count._all]));
    const nao = new Map(naoConfirmados.map((g) => [g.consultant_id, g._count._all]));
    const ultimo = consultores.map((c) => c.signup_sync?.last_ok_at).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
    const total = [...conf.values()].reduce((a, b) => a + b, 0);

    return {
      rule: regra,
      field: campo,
      from,
      to,
      source: FONTE_SIGNUPS,
      formula: FORMULA[regra],
      total,
      pending_review: ambiguos,
      last_sync_at: ultimo ? ultimo.toISOString() : null,
      consultants: consultores.map((c) => ({
        consultant_id: c.id,
        name: c.name,
        praca_id: c.praca_id,
        confirmed: conf.get(c.id) ?? 0,
        not_confirmed: nao.get(c.id) ?? 0,
        sync_error: c.signup_sync?.last_error ?? null,
        last_ok_at: c.signup_sync?.last_ok_at?.toISOString() ?? null,
      })),
      items: itens.map((s) => ({
        id: s.id,
        consultant_id: s.consultant_id,
        company_name: s.company_name,
        source: s.source,
        confirmed_day: s[dia],
        confirmed_at: s[campo]?.toISOString() ?? null,
        created_at: s.freela_created_at.toISOString(),
        match_status: s.match_status,
        lead_id: s.lead_id,
      })),
    };
  }

  /** Consultor: SÓ os dele; sem telefone, e-mail, CNPJ, ids do Freela nem lead. */
  async doConsultor(c: CampoConsultant, q: SignupsPeriodoDto, agora = new Date()) {
    const regra = (await this.config.cadastro()).confirmation_rule;
    const { from, to } = this.periodo(q, agora);
    const dia = COLUNA_DIA_DA_REGRA[regra];
    const campo = CAMPO_DA_REGRA[regra];
    const [confirmados, aguardando] = await Promise.all([
      this.prisma.field_signups.findMany({
        where: { consultant_id: c.id, [dia]: { gte: from, lte: to } } as Prisma.field_signupsWhereInput,
        orderBy: [{ [dia]: 'desc' }, { id: 'asc' }] as Prisma.field_signupsOrderByWithRelationInput[],
        take: LIMITE_ITENS,
        select: { id: true, company_name: true, activated_day: true, first_vacancy_day: true, first_job_day: true },
      }),
      this.prisma.field_signups.findMany({
        where: { consultant_id: c.id, created_day: { gte: from, lte: to }, [campo]: null } as Prisma.field_signupsWhereInput,
        orderBy: { freela_created_at: 'desc' },
        take: LIMITE_ITENS,
        select: { id: true, company_name: true, created_day: true },
      }),
    ]);
    return {
      rule: regra,
      field: campo,
      from,
      to,
      source: FONTE_SIGNUPS,
      total: confirmados.length,
      items: [
        ...confirmados.map((s) => ({ id: s.id, company_name: s.company_name, confirmed_day: s[dia], status: 'confirmed' as const })),
        ...aguardando.map((s) => ({ id: s.id, company_name: s.company_name, confirmed_day: s.created_day, status: 'waiting' as const })),
      ],
    };
  }

  /** Cadastros confirmados hoje/semana por consultor (resumo do Hoje e da lista). */
  async contagens(consultantIds: string[], agora = new Date()): Promise<{ porConsultor: Map<string, { today: number; week: number }>; rule: RegraConfirmacao; source: string }> {
    const regra = (await this.config.cadastro()).confirmation_rule;
    const dia = COLUNA_DIA_DA_REGRA[regra];
    const hoje = todaySp(agora);
    const semana = semanaDe(hoje);
    const mapa = new Map<string, { today: number; week: number }>(consultantIds.map((id) => [id, { today: 0, week: 0 }]));
    if (consultantIds.length) {
      const g = await this.prisma.field_signups.groupBy({
        by: ['consultant_id', dia],
        where: { consultant_id: { in: consultantIds }, [dia]: { gte: semana.from, lte: semana.to } } as Prisma.field_signupsWhereInput,
        _count: { _all: true },
      });
      for (const row of g as unknown as Array<Record<string, unknown> & { consultant_id: string; _count: { _all: number } }>) {
        const m = mapa.get(row.consultant_id);
        if (!m) continue;
        m.week += row._count._all;
        if (row[dia] === hoje) m.today += row._count._all;
      }
    }
    return { porConsultor: mapa, rule: regra, source: FONTE_SIGNUPS };
  }

  async resumoDoConsultor(consultantId: string, agora = new Date()): Promise<Contagem> {
    const r = await this.contagens([consultantId], agora);
    const m = r.porConsultor.get(consultantId) ?? { today: 0, week: 0 };
    return { today: m.today, week: m.week, rule: r.rule, source: r.source };
  }
}
