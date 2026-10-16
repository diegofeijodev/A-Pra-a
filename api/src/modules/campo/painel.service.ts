import { BadRequestException, Injectable } from '@nestjs/common';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { addDays, daysBetween, todaySp } from '../../common/time/dates';
import { diasDaSemana } from '../../domain/route-rules';
import { temposPorParada } from '../../domain/visit-rules';
import type { PainelQueryDto, TrilhasQueryDto } from './dto/consultores.dto';

/** Brasília é UTC−3 o ano inteiro (sem horário de verão desde 2019): o dia começa às 03:00 UTC. */
const inicioDoDia = (d: string): Date => new Date(`${d}T03:00:00.000Z`);
const MAX_DIAS = 62;

export interface NumerosPainel {
  rotas: number;
  rotas_iniciadas: number;
  rotas_abertas: number;
  visitas: number;
  meta: number;
  pct_meta: number | null;
  cadastros: number;
  vouchers_solicitados: number;
  vouchers_liberados: number;
  vouchers_usados: number;
  vagas: number;
}

export interface PainelAdminView {
  from: string;
  to: string;
  totals: NumerosPainel;
  por_representante: (NumerosPainel & { consultant_id: string; name: string })[];
}

export interface StopTiming {
  visit_id: string;
  lead_id: string;
  lead_name: string;
  lat: number;
  lng: number;
  checkin_at: string;
  checkout_at: string | null;
  minutes_on_site: number | null;
  minutes_travel: number | null;
  far_from_place: boolean;
  off_route: boolean;
  off_hours: boolean;
  auto_closed: boolean;
  clock_adjusted: boolean;
  final_status: string | null;
}

export interface ClienteItem {
  lead_id: string;
  name: string;
  address: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  stage: number;
  vagas: number;
  last_vaga_at: string | null;
}

export interface PainelCampoView {
  periodo: 'dia' | 'semana' | '30d';
  from: string;
  to: string;
  numbers: { clientes_na_rota: number; visitados: number; cadastrados: number; vouchers: number; vagas: number };
  cadastrou: ClienteItem[];
  abriu_vaga: ClienteItem[];
  nunca_abriu: ClienteItem[];
  sem_vaga_30d: ClienteItem[];
}

const zerado = (): NumerosPainel => ({
  rotas: 0,
  rotas_iniciadas: 0,
  rotas_abertas: 0,
  visitas: 0,
  meta: 0,
  pct_meta: null,
  cadastros: 0,
  vouchers_solicitados: 0,
  vouchers_liberados: 0,
  vouchers_usados: 0,
  vagas: 0,
});

/** Visita do dia com o que o rastro precisa (§21.8). */
type VisitaDoRastro = {
  id: string;
  lead_id: string;
  checkin_at: Date;
  checkout_at: Date | null;
  checkin_lat: number;
  checkin_lng: number;
  far_from_place: boolean;
  off_route: boolean;
  off_hours: boolean;
  auto_closed: boolean;
  clock_adjusted: boolean;
  final_status: string | null;
  lead: { name: string };
};

/** Tempo em cada parada (§21.8), na ordem de check-in. */
export function stopTimings(visitas: VisitaDoRastro[], inicioJornada: Date | null): StopTiming[] {
  const ordem = [...visitas].sort((a, b) => a.checkin_at.getTime() - b.checkin_at.getTime());
  const tempos = temposPorParada(ordem, inicioJornada);
  return ordem.map((v, i) => ({
    visit_id: v.id,
    lead_id: v.lead_id,
    lead_name: v.lead.name,
    lat: v.checkin_lat,
    lng: v.checkin_lng,
    checkin_at: v.checkin_at.toISOString(),
    checkout_at: v.checkout_at?.toISOString() ?? null,
    ...tempos[i]!,
    far_from_place: v.far_from_place,
    off_route: v.off_route,
    off_hours: v.off_hours,
    auto_closed: v.auto_closed,
    clock_adjusted: v.clock_adjusted,
    final_status: v.final_status,
  }));
}

export const SELECAO_RASTRO = {
  id: true,
  lead_id: true,
  checkin_at: true,
  checkout_at: true,
  checkin_lat: true,
  checkin_lng: true,
  far_from_place: true,
  off_route: true,
  off_hours: true,
  auto_closed: true,
  clock_adjusted: true,
  final_status: true,
  lead: { select: { name: true } },
} as const;

/**
 * Painéis do bloco B (contrato §21.9): números do admin (rotas, visitas,
 * cadastros, vouchers, vagas) e "Meus números" do representante.
 */
@Injectable()
export class PainelService {
  constructor(private readonly prisma: PrismaService) {}

  async admin(q: PainelQueryDto, agora = new Date()): Promise<PainelAdminView> {
    const hoje = todaySp(agora);
    const from = q.from ?? hoje;
    const to = q.to ?? from;
    if (to < from || daysBetween(from, to) > MAX_DIAS - 1) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Período inválido: de "from" a "to", até ${MAX_DIAS} dias.` });
    }
    const ini = inicioDoDia(from);
    const fim = inicioDoDia(addDays(to, 1));
    const consultores = await this.prisma.field_consultants.findMany({
      where: {
        ...(q.praca_id ? { praca_id: q.praca_id } : {}),
        ...(q.consultant_id ? { id: q.consultant_id } : {}),
      },
      select: { id: true, name: true, active: true },
      orderBy: { name: 'asc' },
    });
    const ids = consultores.map((c) => c.id);
    const doGrupo = { consultant_id: { in: ids } };

    const [rotas, jornadas, visitas, solicitados, decididos, usados, vagas] = await Promise.all([
      this.prisma.field_routes.findMany({ where: { ...doGrupo, day: { gte: from, lte: to } }, select: { consultant_id: true, day: true, goal: true } }),
      this.prisma.field_journeys.findMany({ where: { ...doGrupo, day: { gte: from, lte: to } }, select: { consultant_id: true, day: true } }),
      this.prisma.field_visits.findMany({
        where: { ...doGrupo, journey: { day: { gte: from, lte: to } } },
        select: { consultant_id: true, final_status: true, checkout_at: true, form_version: true },
      }),
      this.prisma.field_vouchers.findMany({ where: { ...doGrupo, created_at: { gte: ini, lt: fim } }, select: { consultant_id: true } }),
      this.prisma.field_vouchers.findMany({
        where: { ...doGrupo, decided_at: { gte: ini, lt: fim }, status: { not: 'recusado' } },
        select: { consultant_id: true },
      }),
      this.prisma.field_vouchers.findMany({ where: { ...doGrupo, used_at: { gte: ini, lt: fim } }, select: { consultant_id: true } }),
      this.prisma.lead_vagas.findMany({
        where: { source: 'campo', created_at: { gte: ini, lt: fim }, visit: { consultant_id: { in: ids } } },
        select: { visit: { select: { consultant_id: true } } },
      }),
    ]);

    const iniciadas = new Set(jornadas.map((j) => `${j.consultant_id}|${j.day}`));
    const porId = new Map(consultores.map((c) => [c.id, { consultant_id: c.id, name: c.name, ...zerado() }]));
    const conta = (id: string | undefined, f: (n: NumerosPainel) => void) => {
      const n = id ? porId.get(id) : undefined;
      if (n) f(n);
    };
    for (const r of rotas) {
      conta(r.consultant_id, (n) => {
        n.rotas++;
        n.meta += r.goal;
        if (iniciadas.has(`${r.consultant_id}|${r.day}`)) n.rotas_iniciadas++;
        else n.rotas_abertas++;
      });
    }
    for (const v of visitas) {
      conta(v.consultant_id, (n) => {
        n.visitas++;
        if (v.form_version >= 2 && v.checkout_at && v.final_status === 'cadastrou') n.cadastros++;
      });
    }
    for (const v of solicitados) conta(v.consultant_id, (n) => n.vouchers_solicitados++);
    for (const v of decididos) conta(v.consultant_id, (n) => n.vouchers_liberados++);
    for (const v of usados) conta(v.consultant_id, (n) => n.vouchers_usados++);
    for (const v of vagas) conta(v.visit?.consultant_id, (n) => n.vagas++);

    const linhas = [...porId.values()].map((n) => ({ ...n, pct_meta: n.meta ? Math.round((n.visitas / n.meta) * 100) : null }));
    const totals = zerado();
    for (const n of linhas) {
      for (const k of Object.keys(totals) as (keyof NumerosPainel)[]) {
        if (k !== 'pct_meta') totals[k] += n[k] as number;
      }
    }
    totals.pct_meta = totals.meta ? Math.round((totals.visitas / totals.meta) * 100) : null;
    // Ranking: quem tem algo no período, por cadastros e depois visitas; desativados sem nada saem.
    const ativos = new Set(consultores.filter((c) => c.active).map((c) => c.id));
    const ranking = linhas
      .filter((n) => ativos.has(n.consultant_id) || n.visitas || n.rotas)
      .sort((a, b) => b.cadastros - a.cadastros || b.visitas - a.visitas || a.name.localeCompare(b.name));
    return { from, to, totals, por_representante: ranking };
  }

  /** Mapa do admin: trajeto e paradas de todos no dia. */
  async trilhas(q: TrilhasQueryDto, agora = new Date()) {
    const day = q.day ?? todaySp(agora);
    const jornadas = await this.prisma.field_journeys.findMany({
      where: { day, ...(q.praca_id ? { consultant: { praca_id: q.praca_id } } : {}) },
      orderBy: { started_at: 'asc' },
      select: {
        consultant_id: true,
        started_at: true,
        consultant: { select: { name: true } },
        points: { orderBy: { at: 'asc' }, select: { lat: true, lng: true, at: true } },
        visits: { select: SELECAO_RASTRO },
      },
    });
    const porConsultor = new Map<string, { id: string; name: string; points: { lat: number; lng: number; at: string }[]; stops: StopTiming[] }>();
    for (const j of jornadas) {
      const atual = porConsultor.get(j.consultant_id) ?? { id: j.consultant_id, name: j.consultant.name, points: [], stops: [] };
      atual.points.push(...j.points.map((p) => ({ lat: p.lat, lng: p.lng, at: p.at.toISOString() })));
      atual.stops.push(...stopTimings(j.visits, j.started_at));
      porConsultor.set(j.consultant_id, atual);
    }
    return { day, consultants: [...porConsultor.values()] };
  }

  /** "Meus números" do representante (§21.9). */
  async campo(c: CampoConsultant, periodo: 'dia' | 'semana' | '30d' = 'dia', agora = new Date()): Promise<PainelCampoView> {
    const hoje = todaySp(agora);
    const [from, to] =
      periodo === 'semana' ? [diasDaSemana(hoje)[0]!, diasDaSemana(hoje)[5]!] : periodo === '30d' ? [addDays(hoje, -29), hoje] : [hoje, hoje];
    const ini = inicioDoDia(from);
    const fim = inicioDoDia(addDays(to, 1));
    const limite30 = inicioDoDia(addDays(hoje, -29));

    const [paradas, cadastrosVisitas, vouchers, vagasDoPeriodo, clientes] = await Promise.all([
      this.prisma.field_route_stops.findMany({
        where: { removed: false, route: { consultant_id: c.id, day: { gte: from, lte: to } } },
        select: { visit_id: true },
      }),
      this.prisma.field_visits.findMany({
        where: {
          consultant_id: c.id,
          form_version: { gte: 2 },
          final_status: 'cadastrou',
          checkout_at: { gte: ini, lt: fim },
        },
        select: { lead_id: true },
      }),
      this.prisma.field_vouchers.count({ where: { consultant_id: c.id, created_at: { gte: ini, lt: fim } } }),
      this.prisma.lead_vagas.count({ where: { source: 'campo', created_at: { gte: ini, lt: fim }, visit: { consultant_id: c.id } } }),
      this.prisma.leads.findMany({
        where: { field_consultant_id: c.id, archived: false },
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          lat: true,
          lng: true,
          stage: true,
          vagas: { select: { created_at: true }, orderBy: { created_at: 'desc' } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const item = (l: (typeof clientes)[number]): ClienteItem => ({
      lead_id: l.id,
      name: l.name,
      address: l.address,
      phone: l.phone,
      lat: l.lat,
      lng: l.lng,
      stage: l.stage,
      vagas: l.vagas.length,
      last_vaga_at: l.vagas[0]?.created_at.toISOString() ?? null,
    });
    const cadastrouNoPeriodo = new Set(cadastrosVisitas.map((v) => v.lead_id));
    // Quem ele cadastrou no período e o crédito ficou com outro (quem abre o cadastro ganha) não aparece.
    const cadastrou = clientes.filter((l) => cadastrouNoPeriodo.has(l.id)).map(item);
    const abriuVaga = clientes.filter((l) => l.vagas.some((v) => v.created_at >= ini && v.created_at < fim)).map(item);
    const nuncaAbriu = clientes.filter((l) => l.vagas.length === 0).map(item);
    const semVaga30 = clientes.filter((l) => l.vagas.length > 0 && l.vagas[0]!.created_at < limite30).map(item);

    return {
      periodo,
      from,
      to,
      numbers: {
        clientes_na_rota: paradas.length,
        visitados: paradas.filter((p) => p.visit_id).length,
        cadastrados: cadastrouNoPeriodo.size,
        vouchers,
        vagas: vagasDoPeriodo,
      },
      cadastrou,
      abriu_vaga: abriuVaga,
      nunca_abriu: nuncaAbriu,
      sem_vaga_30d: semVaga30,
    };
  }
}
