/**
 * Insumos do cálculo da remuneração (F8, §28): cadastros confirmados (F7), jornadas e visitas por dia.
 * Só leitura. A regra de "confirmado" vem da MESMA função da F7 (`confirmation_rule` → coluna do dia).
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { todaySp } from '../../../common/time/dates';
import {
  CAMPO_DA_REGRA,
  COLUNA_DIA_DA_REGRA,
  type RegraConfirmacao,
} from '../../../domain/signup-sync-rules';

export interface DiaBruto {
  signups: number;
  visits_checkin: number;
  visits_checkout: number;
  journey: boolean;
  /** S3: declarações NÃO anuladas do dia (antes do limite diário, que é da regra). */
  declared?: number;
  /** S3: declarações anuladas do dia. */
  declared_voided?: number;
  /** S3: para cada confirmado do dia pareado a uma declaração do MESMO consultor, o `declared_day` dela. */
  pareados_declarados?: string[];
  /** S2: havia rota da equipe (`source = 'equipe'`) no dia. */
  route_equipe?: boolean;
  /** Lote B §37.6: minutos trabalhados no dia (jornadas − intervalos; a aberta até agora). */
  worked_minutes?: number;
}

/** Quais insumos extras buscar (derivado das versões da regra; sem versão que use, nenhuma consulta nova). */
export interface InsumosExtras {
  declared: boolean;
  routes: boolean;
  /** Lote B §37.6: alguma versão usa `daily_base_min_worked_minutes`. */
  worked?: boolean;
}

export interface ConsultorBasico {
  id: string;
  name: string;
  praca_id: string;
  active: boolean;
  /** Dia (Brasília) em que o consultor foi criado: antes dele não há piso "sem condição". */
  created_day: string;
}

export interface EarningsInputs {
  consultores(filtro: { ids?: string[]; praca_id?: string }): Promise<ConsultorBasico[]>;
  /** consultor → dia → insumos (só dias com algum movimento). */
  dias(
    consultantIds: string[],
    from: string,
    to: string,
    regra: RegraConfirmacao,
    extras?: InsumosExtras,
  ): Promise<Map<string, Map<string, DiaBruto>>>;
  /** Cadastros sincronizados, criados por esse consultor desde `desdeDia`, ainda sem o evento da regra. */
  naoConfirmados(
    consultantIds: string[],
    regra: RegraConfirmacao,
    desdeDia: string,
  ): Promise<Map<string, number>>;
}

export const EARNINGS_INPUTS = Symbol('EARNINGS_INPUTS');

@Injectable()
export class PrismaEarningsInputs implements EarningsInputs {
  constructor(private readonly prisma: PrismaService) {}

  async consultores(f: { ids?: string[]; praca_id?: string }): Promise<ConsultorBasico[]> {
    const rows = await this.prisma.field_consultants.findMany({
      where: { ...(f.ids ? { id: { in: f.ids } } : {}), ...(f.praca_id ? { praca_id: f.praca_id } : {}) },
      select: { id: true, name: true, praca_id: true, active: true, created_at: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      praca_id: r.praca_id,
      active: r.active,
      created_day: todaySp(r.created_at),
    }));
  }

  async dias(
    ids: string[],
    from: string,
    to: string,
    regra: RegraConfirmacao,
    extras: InsumosExtras = { declared: false, routes: false },
  ): Promise<Map<string, Map<string, DiaBruto>>> {
    const out = new Map<string, Map<string, DiaBruto>>(ids.map((id) => [id, new Map()]));
    if (!ids.length) return out;
    const dia = COLUNA_DIA_DA_REGRA[regra];
    const slot = (c: string, d: string): DiaBruto => {
      const m = out.get(c);
      if (!m) throw new Error('consultor fora do filtro');
      let x = m.get(d);
      if (!x) {
        x = { signups: 0, visits_checkin: 0, visits_checkout: 0, journey: false };
        m.set(d, x);
      }
      return x;
    };
    const [signups, jornadas, visitas] = await Promise.all([
      this.prisma.field_signups.groupBy({
        by: ['consultant_id', dia],
        where: {
          consultant_id: { in: ids },
          [dia]: { gte: from, lte: to },
        } as Prisma.field_signupsWhereInput,
        _count: { _all: true },
      }),
      this.prisma.field_journeys.findMany({
        where: { consultant_id: { in: ids }, day: { gte: from, lte: to } },
        select: { consultant_id: true, day: true },
      }),
      this.prisma.field_visits.findMany({
        where: { consultant_id: { in: ids }, journey: { day: { gte: from, lte: to } } },
        select: { consultant_id: true, checkout_at: true, journey: { select: { day: true } } },
      }),
    ]);
    for (const r of signups as unknown as Array<
      Record<string, unknown> & { consultant_id: string; _count: { _all: number } }
    >) {
      const d = r[dia];
      if (typeof d === 'string') slot(r.consultant_id, d).signups += r._count._all;
    }
    for (const j of jornadas) slot(j.consultant_id, j.day).journey = true;
    for (const v of visitas) {
      const x = slot(v.consultant_id, v.journey.day);
      x.visits_checkin++;
      if (v.checkout_at) x.visits_checkout++;
    }
    if (extras.routes) {
      const rotas = await this.prisma.field_routes.findMany({
        where: { consultant_id: { in: ids }, source: 'equipe', day: { gte: from, lte: to } },
        select: { consultant_id: true, day: true },
      });
      for (const r of rotas) slot(r.consultant_id, r.day).route_equipe = true;
    }
    if (extras.declared) await this.declaradas(ids, from, to, dia, slot);
    if (extras.worked) await this.trabalhado(ids, from, to, slot);
    return out;
  }

  /** Lote B §37.6: minutos trabalhados por dia = Σ(fim − início das jornadas, a aberta até agora) − Σ intervalos. */
  private async trabalhado(ids: string[], from: string, to: string, slot: (c: string, d: string) => DiaBruto, agora = new Date()): Promise<void> {
    const js = await this.prisma.field_journeys.findMany({
      where: { consultant_id: { in: ids }, day: { gte: from, lte: to } },
      select: { consultant_id: true, day: true, started_at: true, ended_at: true, breaks: { select: { started_at: true, ended_at: true } } },
    });
    const min = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60_000));
    for (const j of js) {
      const fim = j.ended_at ?? agora;
      const pausa = j.breaks.reduce((a, b) => a + min(b.started_at, b.ended_at ?? fim), 0);
      const x = slot(j.consultant_id, j.day);
      x.worked_minutes = (x.worked_minutes ?? 0) + Math.max(0, min(j.started_at, fim) - pausa);
    }
  }

  /** S3: declarações por dia (menos anuladas) e o pareamento com os confirmados do mesmo consultor. */
  private async declaradas(
    ids: string[],
    from: string,
    to: string,
    colunaDia: string,
    slot: (c: string, d: string) => DiaBruto,
  ): Promise<void> {
    const decl = await this.prisma.field_declared_signups.findMany({
      where: { consultant_id: { in: ids }, declared_day: { gte: from, lte: to } },
      select: { consultant_id: true, declared_day: true, void: { select: { id: true } } },
    });
    for (const d of decl) {
      const x = slot(d.consultant_id, d.declared_day);
      if (d.void) x.declared_voided = (x.declared_voided ?? 0) + 1;
      else x.declared = (x.declared ?? 0) + 1;
    }
    // Pareamento: confirmado do consultor cujo lead tem declaração DELE, não anulada (qualquer dia da declaração).
    const conf = await this.prisma.field_signups.findMany({
      where: {
        consultant_id: { in: ids },
        lead_id: { not: null },
        [colunaDia]: { gte: from, lte: to },
      } as Prisma.field_signupsWhereInput,
      select: { consultant_id: true, lead_id: true, activated_day: true, first_vacancy_day: true, first_job_day: true },
    });
    const leads = [...new Set(conf.map((c) => c.lead_id).filter((l): l is string => !!l))];
    if (!leads.length) return;
    const pareadas = await this.prisma.field_declared_signups.findMany({
      where: { lead_id: { in: leads }, void: null },
      select: { consultant_id: true, lead_id: true, declared_day: true },
    });
    const porLead = new Map(pareadas.map((p) => [`${p.consultant_id}:${p.lead_id}`, p.declared_day]));
    for (const c of conf) {
      const dd = porLead.get(`${c.consultant_id}:${c.lead_id}`);
      const diaConf = (c as unknown as Record<string, string | null>)[colunaDia];
      if (!dd || !diaConf) continue;
      const x = slot(c.consultant_id, diaConf);
      (x.pareados_declarados ??= []).push(dd);
    }
  }

  async naoConfirmados(
    ids: string[],
    regra: RegraConfirmacao,
    desdeDia: string,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>(ids.map((id) => [id, 0]));
    if (!ids.length) return out;
    const g = await this.prisma.field_signups.groupBy({
      by: ['consultant_id'],
      where: {
        consultant_id: { in: ids },
        created_day: { gte: desdeDia },
        [CAMPO_DA_REGRA[regra]]: null,
      } as Prisma.field_signupsWhereInput,
      _count: { _all: true },
    });
    for (const r of g) out.set(r.consultant_id, r._count._all);
    return out;
  }
}
