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
    return out;
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
