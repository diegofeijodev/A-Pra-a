import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { addDays, todaySp } from '../../common/time/dates';
import { DIAS_NAO_QUIS } from '../../domain/catalog';
import {
  chaveBairro,
  dentroDaArea,
  diasDaSemana,
  planejarSemana,
  rankDoNovo,
  segundaDaSemana,
  semArea,
  type Area,
  type Candidato,
} from '../../domain/route-rules';
import { lerCnaes } from './campo-cnaes';
import type { EditRouteDto, GenerateRoutesDto, RoutesQueryDto } from './dto/consultores.dto';

export type StatusRota = 'aberta' | 'iniciada' | 'encerrada';

export interface StopView {
  id: string;
  position: number;
  lead_id: string;
  lead_name: string;
  address: string;
  bairro: string | null;
  phone: string;
  lat: number | null;
  lng: number | null;
  classe: string;
  stage: number;
  reason: string;
  removed: boolean;
  visit: { id: string; checkin_at: string; checkout_at: string | null; final_status: string | null } | null;
}

export interface RouteView {
  id: string;
  consultant_id: string;
  consultant_name: string;
  praca_id: string;
  day: string;
  goal: number;
  source: string;
  status: StatusRota;
  counts: { total: number; visitados: number };
  stops: StopView[];
}

export interface GenerateView {
  generated: number;
  kept_started: number;
  skipped_past: number;
  sem_localizacao: number;
  routes: RouteView[];
}

/** Paradas pendentes de rotas passadas valem por duas semanas. */
const JANELA_PENDENTE_DIAS = 14;

const COM_PARADAS = {
  consultant: { select: { name: true } },
  stops: {
    orderBy: { position: 'asc' },
    include: {
      lead: { select: { name: true, address: true, bairro: true, phone: true, lat: true, lng: true, classe: true, stage: true } },
      visit: { select: { id: true, checkin_at: true, checkout_at: true, final_status: true } },
    },
  },
} satisfies Prisma.field_routesInclude;

type RotaRow = Prisma.field_routesGetPayload<{ include: typeof COM_PARADAS }>;

const naoAchada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Rota não encontrada.' });

/**
 * Rotas de visita (contrato §21.5). A divisão da semana é a função pura
 * `planejarSemana`; aqui fica só o que depende do banco: quem é candidato,
 * o que já começou e a gravação.
 */
@Injectable()
export class RoutesService {
  private readonly log = new Logger(RoutesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── leitura ────────────────────────────────────────────────
  async list(q: RoutesQueryDto, agora = new Date()): Promise<RouteView[]> {
    const dias = diasDaSemana(q.week ?? todaySp(agora));
    const rotas = await this.prisma.field_routes.findMany({
      where: {
        day: { in: dias },
        ...(q.praca_id ? { praca_id: q.praca_id } : {}),
        ...(q.consultant_id ? { consultant_id: q.consultant_id } : {}),
      },
      include: COM_PARADAS,
      orderBy: [{ consultant: { name: 'asc' } }, { day: 'asc' }],
    });
    return this.views(rotas, true);
  }

  async today(c: CampoConsultant, agora = new Date()): Promise<RouteView | null> {
    const r = await this.prisma.field_routes.findUnique({
      where: { consultant_id_day: { consultant_id: c.id, day: todaySp(agora) } },
      include: COM_PARADAS,
    });
    return r ? (await this.views([r], false))[0]! : null;
  }

  async week(c: CampoConsultant, agora = new Date()): Promise<{ week_start: string; routes: RouteView[] }> {
    const dias = diasDaSemana(todaySp(agora));
    const rotas = await this.prisma.field_routes.findMany({
      where: { consultant_id: c.id, day: { in: dias } },
      include: COM_PARADAS,
      orderBy: { day: 'asc' },
    });
    return { week_start: dias[0]!, routes: await this.views(rotas, false) };
  }

  /** Rota do dia (para ligar a jornada e o check-in). */
  rotaDoDia(consultantId: string, day: string) {
    return this.prisma.field_routes.findUnique({
      where: { consultant_id_day: { consultant_id: consultantId, day } },
      select: { id: true, stops: { where: { removed: false }, select: { id: true, lead_id: true, visit_id: true } } },
    });
  }

  // ── geração ────────────────────────────────────────────────
  async generate(dto: GenerateRoutesDto, userId: string | null, agora = new Date()): Promise<GenerateView> {
    const hoje = todaySp(agora);
    const semana = diasDaSemana(dto.week);
    const dias = semana.filter((d) => d >= hoje);
    const consultores = await this.prisma.field_consultants.findMany({
      where: { active: true, ...(dto.consultant_ids?.length ? { id: { in: dto.consultant_ids } } : {}) },
      include: { praca: { select: { route_daily_goal: true } } },
      orderBy: { name: 'asc' },
    });
    const total: GenerateView = { generated: 0, kept_started: 0, skipped_past: semana.length - dias.length, sem_localizacao: 0, routes: [] };
    const cnaes = new Set((await lerCnaes(this.prisma)).map((c) => c.code));

    for (const c of consultores) {
      const r = await this.gerarDoRepresentante(c, dias, hoje, cnaes, userId);
      total.generated += r.generated;
      total.kept_started += r.kept_started;
      total.sem_localizacao += r.sem_localizacao;
    }
    total.routes = await this.list({ week: dto.week, ...(dto.consultant_ids?.length === 1 ? { consultant_id: dto.consultant_ids[0] } : {}) }, agora);
    if (dto.consultant_ids?.length) total.routes = total.routes.filter((r) => dto.consultant_ids!.includes(r.consultant_id));
    return total;
  }

  /** Relógio da segunda: só quem ainda não tem rota nenhuma na semana. */
  async generateMonday(agora = new Date()): Promise<number> {
    const hoje = todaySp(agora);
    const semana = diasDaSemana(hoje);
    const ativos = await this.prisma.field_consultants.findMany({
      where: { active: true, routes: { none: { day: { in: semana } } } },
      select: { id: true },
    });
    if (!ativos.length) return 0;
    const r = await this.generate({ week: segundaDaSemana(hoje), consultant_ids: ativos.map((a) => a.id) }, null, agora);
    return r.generated;
  }

  private async gerarDoRepresentante(
    c: {
      id: string;
      praca_id: string;
      area_lat: number | null;
      area_lng: number | null;
      area_radius_km: number | null;
      area_bairros: string[];
      praca: { route_daily_goal: number };
    },
    dias: string[],
    hoje: string,
    cnaes: Set<string>,
    userId: string | null,
  ): Promise<{ generated: number; kept_started: number; sem_localizacao: number }> {
    const iniciados = new Set(
      (
        await this.prisma.field_journeys.findMany({
          where: { consultant_id: c.id, day: { in: dias } },
          select: { day: true },
        })
      ).map((j) => j.day),
    );
    const gerar = dias.filter((d) => !iniciados.has(d));
    if (!gerar.length) return { generated: 0, kept_started: iniciados.size, sem_localizacao: 0 };

    const area: Area = { lat: c.area_lat, lng: c.area_lng, radius_km: c.area_radius_km, bairros: c.area_bairros };
    const [leads, visitas, pendentes, jaNaSemana] = await Promise.all([
      this.prisma.leads.findMany({
        where: { praca_id: c.praca_id, archived: false, stage: { lt: 5 } },
        select: { id: true, lat: true, lng: true, bairro: true, classe: true, cnae: true },
      }),
      // Visitas fechadas da praça, da mais nova para a mais velha: a primeira de cada lead é a última.
      this.prisma.field_visits.findMany({
        where: { lead: { praca_id: c.praca_id }, checkout_at: { not: null } },
        select: { lead_id: true, checkout_at: true, final_status: true, final_date: true },
        orderBy: { checkout_at: 'desc' },
      }),
      this.prisma.field_route_stops.findMany({
        where: {
          visit_id: null,
          removed: false,
          route: { consultant_id: c.id, day: { lt: hoje, gte: addDays(hoje, -JANELA_PENDENTE_DIAS) } },
        },
        select: { lead_id: true, route: { select: { day: true } } },
      }),
      // Paradas dos dias já iniciados desta semana não se repetem nos outros.
      this.prisma.field_route_stops.findMany({
        where: { removed: false, route: { consultant_id: c.id, day: { in: [...iniciados] } } },
        select: { lead_id: true },
      }),
    ]);

    const ultima = new Map<string, (typeof visitas)[number]>();
    for (const v of visitas) if (!ultima.has(v.lead_id)) ultima.set(v.lead_id, v);
    const limiteNaoQuis = addDays(hoje, -DIAS_NAO_QUIS);
    const pendentePorLead = new Map<string, string>();
    for (const p of pendentes) {
      const antes = pendentePorLead.get(p.lead_id);
      if (!antes || p.route.day > antes) pendentePorLead.set(p.lead_id, p.route.day);
    }
    const repetidos = new Set(jaNaSemana.map((s) => s.lead_id));

    const candidatos: Candidato[] = [];
    let semLocalizacao = 0;
    for (const l of leads) {
      if (repetidos.has(l.id)) continue;
      if (l.cnae && cnaes.size && !cnaes.has(l.cnae)) continue;
      const v = ultima.get(l.id);
      if (v?.final_status === 'nao_quis' && v.checkout_at && todaySp(v.checkout_at) > limiteNaoQuis) continue;
      if (l.lat == null || l.lng == null) {
        if (semArea(area) || (l.bairro && area.bairros.some((b) => chaveBairro(b) === chaveBairro(l.bairro)))) semLocalizacao++;
        continue;
      }
      if (!dentroDaArea(l, area)) continue;
      const base = { id: l.id, lat: l.lat, lng: l.lng };
      if (v && (v.final_status === 'cadastra_depois' || v.final_status === 'ligar_depois') && v.final_date) {
        candidatos.push({ ...base, rank: 0, reason: 'retorno', dia: v.final_date });
        continue;
      }
      const pendenteDesde = pendentePorLead.get(l.id);
      // Pendente só se ninguém visitou depois daquele dia.
      if (pendenteDesde && !(v?.checkout_at && todaySp(v.checkout_at) >= pendenteDesde)) {
        candidatos.push({ ...base, rank: 1, reason: 'pendente' });
        continue;
      }
      candidatos.push({ ...base, rank: rankDoNovo(l.classe, !!v), reason: 'novo' });
    }

    const centro = area.radius_km && area.lat != null && area.lng != null ? { lat: area.lat, lng: area.lng } : null;
    const plano = planejarSemana({ candidatos, dias: gerar, meta: c.praca.route_daily_goal, centro });

    await this.prisma.$transaction(async (tx) => {
      // Dia sem jornada é refeito por inteiro (a cascata leva as paradas).
      await tx.field_routes.deleteMany({ where: { consultant_id: c.id, day: { in: gerar } } });
      for (const dia of gerar) {
        const paradas = plano.get(dia) ?? [];
        await tx.field_routes.create({
          data: {
            consultant_id: c.id,
            praca_id: c.praca_id,
            day: dia,
            goal: c.praca.route_daily_goal,
            source: 'auto',
            created_by: userId,
            stops: { create: paradas.map((p, i) => ({ lead_id: p.lead_id, position: i + 1, reason: p.reason })) },
          },
        });
      }
    });
    return { generated: gerar.length, kept_started: iniciados.size, sem_localizacao: semLocalizacao };
  }

  // ── edição ─────────────────────────────────────────────────
  async edit(id: string, dto: EditRouteDto): Promise<RouteView> {
    if (!isUuid(id)) throw naoAchada();
    const rota = await this.prisma.field_routes.findUnique({ where: { id }, include: { stops: true } });
    if (!rota) throw naoAchada();
    // Repetido na lista: vale a primeira posição.
    const lista = dto.stops.filter((s, i) => dto.stops.findIndex((x) => x.lead_id === s.lead_id) === i);
    const ids = lista.map((s) => s.lead_id);
    const daPraca = await this.prisma.leads.findMany({ where: { id: { in: ids }, praca_id: rota.praca_id }, select: { id: true } });
    if (daPraca.length !== ids.length) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Estabelecimento não encontrado na praça da rota.' });
    }
    const atuais = new Map(rota.stops.map((s) => [s.lead_id, s]));
    const pedidos = new Map(lista.map((s) => [s.lead_id, s]));
    for (const s of rota.stops) {
      const pedido = pedidos.get(s.lead_id);
      if (s.visit_id && (!pedido || pedido.removed)) {
        throw new ConflictException({ code: 'STOP_VISITED', message: 'Uma parada já visitada não pode sair da rota.' });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      // Fora da lista = removida (fica registrada para a equipe).
      for (const s of rota.stops) {
        if (!pedidos.has(s.lead_id)) await tx.field_route_stops.update({ where: { id: s.id }, data: { removed: true, position: 10_000 + s.position } });
      }
      for (const [i, p] of lista.entries()) {
        const pos = i + 1;
        const atual = atuais.get(p.lead_id);
        if (atual) await tx.field_route_stops.update({ where: { id: atual.id }, data: { position: pos, removed: !!p.removed } });
        else await tx.field_route_stops.create({ data: { route_id: id, lead_id: p.lead_id, position: pos, reason: 'incluido', removed: !!p.removed } });
      }
      await tx.field_routes.update({ where: { id }, data: { source: 'admin' } });
    });
    const atualizada = await this.prisma.field_routes.findUniqueOrThrow({ where: { id }, include: COM_PARADAS });
    return (await this.views([atualizada], true))[0]!;
  }

  // ── projeção ───────────────────────────────────────────────
  private async views(rotas: RotaRow[], comRemovidas: boolean): Promise<RouteView[]> {
    if (!rotas.length) return [];
    const jornadas = await this.prisma.field_journeys.findMany({
      where: { OR: rotas.map((r) => ({ consultant_id: r.consultant_id, day: r.day })) },
      select: { consultant_id: true, day: true, ended_at: true },
    });
    return rotas.map((r) => {
      const js = jornadas.filter((j) => j.consultant_id === r.consultant_id && j.day === r.day);
      const status: StatusRota = !js.length ? 'aberta' : js.some((j) => !j.ended_at) ? 'iniciada' : 'encerrada';
      const stops = r.stops.filter((s) => comRemovidas || !s.removed);
      const ativas = r.stops.filter((s) => !s.removed);
      return {
        id: r.id,
        consultant_id: r.consultant_id,
        consultant_name: r.consultant.name,
        praca_id: r.praca_id,
        day: r.day,
        goal: r.goal,
        source: r.source,
        status,
        counts: { total: ativas.length, visitados: ativas.filter((s) => s.visit_id).length },
        stops: stops.map((s) => ({
          id: s.id,
          position: s.position,
          lead_id: s.lead_id,
          lead_name: s.lead.name,
          address: s.lead.address,
          bairro: s.lead.bairro,
          phone: s.lead.phone,
          lat: s.lead.lat,
          lng: s.lead.lng,
          classe: s.lead.classe,
          stage: s.lead.stage,
          reason: s.reason,
          removed: s.removed,
          visit: s.visit
            ? {
                id: s.visit.id,
                checkin_at: s.visit.checkin_at.toISOString(),
                checkout_at: s.visit.checkout_at?.toISOString() ?? null,
                final_status: s.visit.final_status,
              }
            : null,
        })),
      };
    });
  }

  logErro(e: unknown): void {
    this.log.error(`rotas da segunda falharam: ${e instanceof Error ? e.message : String(e)}`);
  }
}
