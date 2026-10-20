import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { todaySp } from '../../common/time/dates';
import { pontoNaArea } from '../../domain/area-rules';
import { caixaEnvolvente } from '../../domain/campo-rules';
import { calcularRelogio, paramsDaConfig, planejar, type PontoRota } from '../../domain/rota-rules';
import { velocidadeCarroKmh } from './rotas.tokens';
import { violouUnico } from '../campo/prisma-errors';
import type { CandidatosQueryDto, MontarRotaDto, OrdenarRotaDto, ReotimizarEquipeDto, RotasQueryDto } from './dto/rotas.dto';
import { RotasConfigService } from './rotas-config.service';
import {
  conflitoVersao,
  ehConflitoVersao,
  gravarPlano,
  partidaDoDia,
  pontoDaParada,
  reotimizar,
  SEGURA_LUGAR,
  ultimaPosicao,
  type LeadParaRota,
} from './rotas-plano';
import { COM_PARADAS, lerSnapshot, novoSnapshot, paramsDaRota, routeView, type RouteView } from './rotas-views';
import { ROTAS_LIGADAS } from './rotas.tokens';

export interface CandidateView {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  stage: number;
  source: string | null;
  category: string | null;
  in_area: boolean;
}

const desligado = () => new NotFoundException({ code: 'ROUTES_DISABLED', message: 'O roteiro do dia não está habilitado.' });
const naoAchada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Roteiro não encontrado.' });
const invalido = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });

/** Telas da equipe sobre os roteiros (`/v1/routes`, contrato §23.4). */
@Injectable()
export class RotasEquipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: RotasConfigService,
    @Inject(ROTAS_LIGADAS) private readonly ligado: boolean,
  ) {}

  private exigirLigado() {
    if (!this.ligado) throw desligado();
  }

  async list(q: RotasQueryDto, agora = new Date()): Promise<RouteView[]> {
    this.exigirLigado();
    const rotas = await this.prisma.field_routes.findMany({
      where: { day: q.day ?? todaySp(agora), status: 'ativa', ...(q.praca_id ? { praca_id: q.praca_id } : {}) },
      include: COM_PARADAS,
      orderBy: [{ consultant: { name: 'asc' } }, { id: 'asc' }],
    });
    return rotas.map((r) => routeView(r, agora));
  }

  async get(id: string, agora = new Date()): Promise<RouteView> {
    this.exigirLigado();
    return routeView(await this.carregar(id), agora);
  }

  private async carregar(id: string) {
    if (!isUuid(id)) throw naoAchada();
    const r = await this.prisma.field_routes.findUnique({ where: { id }, include: COM_PARADAS });
    if (!r) throw naoAchada();
    return r;
  }

  // ── candidatos ──────────────────────────────────────────────
  async candidates(q: CandidatosQueryDto, agora = new Date()): Promise<CandidateView[]> {
    this.exigirLigado();
    const praca = await this.prisma.pracas.findUnique({ where: { id: q.praca_id }, select: { id: true } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const areas = await this.prisma.field_areas.findMany({ where: { praca_id: q.praca_id, ...(q.area_id ? { id: q.area_id } : { active: true }) } });
    if (q.area_id && areas.length === 0) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });
    if (areas.length === 0) return [];
    const caixas = areas.map((a) => {
      const b = caixaEnvolvente(a, a.radius_m);
      return { lat: { gte: b.latMin, lte: b.latMax }, lng: { gte: b.lngMin, lte: b.lngMax } };
    });
    const config = await this.configs.config();
    const limit = q.limit ?? 100;
    const linhas = await this.prisma.leads.findMany({
      where: {
        praca_id: q.praca_id,
        archived: false,
        is_test: false,
        stage: { lte: config.estagio_maximo_rota },
        location_precision: { in: ['point', 'address'] },
        OR: caixas,
        ...(q.q?.trim() ? { name: { contains: q.q.trim(), mode: 'insensitive' as const } } : {}),
      },
      select: { id: true, name: true, address: true, lat: true, lng: true, stage: true, source: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 2000,
    });
    const naArea = linhas.filter((l) => l.lat != null && l.lng != null && areas.some((a) => pontoNaArea({ lat: l.lat!, lng: l.lng! }, a)));
    const ids = naArea.map((l) => l.id);
    if (ids.length === 0) return [];
    const [ocupados, cands] = await Promise.all([
      this.prisma.field_route_stops.findMany({
        where: { day: q.day ?? todaySp(agora), lead_id: { in: ids }, status: { in: [...SEGURA_LUGAR] } },
        select: { lead_id: true },
      }),
      this.prisma.place_candidates.findMany({ where: { lead_id: { in: ids } }, select: { lead_id: true, category: true }, orderBy: { created_at: 'asc' } }),
    ]);
    const fora = new Set(ocupados.map((o) => o.lead_id));
    const categoria = new Map<string, string>();
    for (const c of cands) if (c.lead_id && !categoria.has(c.lead_id)) categoria.set(c.lead_id, c.category);
    return naArea
      .filter((l) => !fora.has(l.id))
      .slice(0, limit)
      .map((l) => ({
        id: l.id,
        name: l.name,
        address: l.address,
        lat: l.lat!,
        lng: l.lng!,
        stage: l.stage,
        source: l.source,
        category: categoria.get(l.id) ?? null,
        in_area: true,
      }));
  }

  // ── montar ──────────────────────────────────────────────────
  async build(dto: MontarRotaDto, user: AuthUser, agora = new Date()): Promise<RouteView> {
    this.exigirLigado();
    for (let tentativa = 0; ; tentativa += 1) {
      try {
        return await this.montar(dto, user, agora);
      } catch (e) {
        // Corrida por um lugar (índice único parcial): relê e confere os conflitos uma vez.
        if ((violouUnico(e) || ehConflitoVersao(e)) && tentativa === 0) continue;
        if (violouUnico(e)) {
          throw new ConflictException({ code: 'LEAD_IN_OTHER_ROUTE', message: 'Um dos estabelecimentos acabou de entrar no roteiro de outro consultor.' });
        }
        throw e;
      }
    }
  }

  private async montar(dto: MontarRotaDto, user: AuthUser, agora: Date): Promise<RouteView> {
    const consultor = await this.prisma.field_consultants.findUnique({ where: { id: dto.consultant_id }, select: { id: true, praca_id: true, active: true } });
    if (!consultor) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Consultor não encontrado.' });
    if (!consultor.active) throw invalido('consultant_id: o consultor está desativado.');
    if (dto.day < todaySp(agora)) throw invalido('day: use hoje ou uma data futura.');

    const ids = [...new Set(dto.lead_ids)];
    const leads = await this.prisma.leads.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, address: true, phone: true, lat: true, lng: true, praca_id: true, archived: true },
    });
    // Inexistente e de outra praça respondem igual: não revela leads de outras praças.
    if (leads.length !== ids.length || leads.some((l) => l.praca_id !== consultor.praca_id)) {
      throw invalido('lead_ids: um ou mais estabelecimentos não existem ou não pertencem à praça do consultor.');
    }
    const ruins = leads.filter((l) => l.archived || l.lat == null || l.lng == null);
    if (ruins.length > 0) {
      throw invalido(`lead_ids: sem localização ou arquivado: ${ruins.slice(0, 5).map((l) => l.name).join(', ')}.`);
    }
    const area = dto.area_id
      ? await this.prisma.field_areas.findFirst({ where: { id: dto.area_id, praca_id: consultor.praca_id } })
      : null;
    if (dto.area_id && !area) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });

    const ocupados = await this.prisma.field_route_stops.findMany({
      where: { day: dto.day, lead_id: { in: ids }, status: { in: [...SEGURA_LUGAR] }, route: { consultant_id: { not: consultor.id } } },
      select: { name_snap: true },
    });
    if (ocupados.length > 0) {
      throw new ConflictException({
        code: 'LEAD_IN_OTHER_ROUTE',
        message: `Já estão no roteiro de outro consultor neste dia: ${ocupados.slice(0, 5).map((o) => o.name_snap).join(', ')}.`,
      });
    }

    const config = await this.configs.config();
    const existente = await this.prisma.field_routes.findFirst({
      where: { consultant_id: consultor.id, day: dto.day, status: 'ativa' },
      include: { stops: true },
    });
    // Modo de deslocamento (§30.4): ausente mantém o do roteiro existente (ou a pé num novo). A velocidade de
    // carro é fotografada no roteiro; trocar o modo (ou escolher carro num roteiro sem foto) regrava a do env.
    const modo = dto.travel_mode ?? existente?.travel_mode ?? 'a_pe';
    const snapAtual = existente ? lerSnapshot(existente.params_snapshot) : null;
    const kmhCarro = modo === 'carro' ? (modo === existente?.travel_mode && snapAtual?.velocidade_carro_kmh ? snapAtual.velocidade_carro_kmh : velocidadeCarroKmh()) : null;
    const trocouModo = !!existente && modo !== existente.travel_mode;
    const params = paramsDaConfig(config, modo === 'carro' ? kmhCarro! : undefined);
    const info = new Map<string, LeadParaRota>(
      leads.map((l) => [l.id, { id: l.id, name: l.name, address: l.address, phone: l.phone, lat: l.lat!, lng: l.lng! }]),
    );
    const start = dto.start ?? (area ? { lat: area.lat, lng: area.lng } : existente ? { lat: existente.start_lat, lng: existente.start_lng } : { lat: leads[0]!.lat!, lng: leads[0]!.lng! });

    const stopsAtuais = existente?.stops ?? [];
    const visitadas = new Set(stopsAtuais.filter((s) => s.status === 'visitada').map((s) => s.lead_id));
    // Ordem atual primeiro (as fixas só fazem sentido nela), depois os novos na ordem em que a equipe escolheu.
    // Pulada pelo consultor continua pulada (re-escolher o lead não desfaz o pulo; quem desfaz é ele).
    const puladas = new Set(stopsAtuais.filter((s) => s.status === 'pulada').map((s) => s.lead_id));
    const jaNoRoteiro = stopsAtuais
      .filter((s) => ids.includes(s.lead_id) && (s.status === 'pendente' || s.status === 'adiada'))
      .sort((a, b) => a.seq - b.seq);
    const novos = ids.filter((id) => !visitadas.has(id) && !puladas.has(id) && !jaNoRoteiro.some((s) => s.lead_id === id));
    const pontos: PontoRota[] = [
      ...jaNoRoteiro.map(pontoDaParada),
      ...novos.map((id) => ({ id, lat: info.get(id)!.lat, lng: info.get(id)!.lng })),
    ];
    const inicio = existente ? ultimaPosicao(stopsAtuais, dto.start ?? start) : start;
    const plano = planejar({ inicio, partidaMin: partidaDoDia(dto.day, agora, params), pontos, params, jaFeitas: visitadas.size });
    const candidatos = await this.candidatosDe(ids);

    const descartar = [
      ...stopsAtuais.filter((s) => (s.status === 'pendente' || s.status === 'adiada') && !ids.includes(s.lead_id)).map((s) => s.lead_id),
      ...plano.excedentes,
    ];
    let rotaId: string;
    if (existente) {
      rotaId = existente.id;
      await this.prisma.$transaction(
        (tx) =>
          gravarPlano(tx, {
            route: existente,
            stops: stopsAtuais,
            plano,
            config,
            leads: info,
            candidatos,
            descartar,
            motivo: trocouModo ? `montagem pela equipe (modo ${modo === 'carro' ? 'de carro' : 'a pé'})` : 'montagem pela equipe',
            por: user.id,
            agora,
            modo: trocouModo || (modo === 'carro' && !snapAtual?.velocidade_carro_kmh) ? { travel_mode: modo, velocidade_carro_kmh: kmhCarro } : undefined,
            start: dto.start,
            areaId: area ? area.id : undefined,
          }),
        { timeout: 15_000 },
      );
    } else {
      rotaId = randomUUID();
      await this.prisma.$transaction(
        async (tx) => {
          await tx.field_routes.create({
            data: {
              id: rotaId,
              consultant_id: consultor.id,
              praca_id: consultor.praca_id,
              area_id: area?.id ?? null,
              day: dto.day,
              source: 'equipe',
              travel_mode: modo,
              start_lat: start.lat,
              start_lng: start.lng,
              created_by: user.id,
              params_snapshot: novoSnapshot(null, config, plano.excedentes.length, 1, 'montagem pela equipe', user.id, agora, kmhCarro) as unknown as Prisma.InputJsonValue,
            },
          });
          await tx.field_route_stops.createMany({
            data: plano.paradas.map((p) => {
              const l = info.get(p.id)!;
              return {
                route_id: rotaId,
                lead_id: l.id,
                day: dto.day,
                seq: p.seq,
                kind: p.kind,
                status: 'pendente',
                eta_min: p.eta_min,
                distance_m: p.distancia_m,
                planned_minutes: config.minutos_por_visita,
                candidate_id: candidatos.get(l.id) ?? null,
                name_snap: l.name,
                address_snap: l.address,
                phone_snap: l.phone,
                lat_snap: l.lat,
                lng_snap: l.lng,
              };
            }),
          });
        },
        { timeout: 15_000 },
      );
    }
    return routeView(await this.carregar(rotaId), agora);
  }

  private async candidatosDe(leadIds: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.place_candidates.findMany({
      where: { lead_id: { in: leadIds } },
      select: { id: true, lead_id: true },
      orderBy: { created_at: 'asc' },
    });
    const m = new Map<string, string>();
    for (const r of rows) if (r.lead_id && !m.has(r.lead_id)) m.set(r.lead_id, r.id);
    return m;
  }

  // ── editar ──────────────────────────────────────────────────
  async order(id: string, dto: OrdenarRotaDto, user: AuthUser, agora = new Date()): Promise<RouteView> {
    this.exigirLigado();
    const rota = await this.carregar(id);
    if (rota.version !== dto.version) throw conflitoVersao();
    const pendentes = rota.stops.filter((s) => s.status === 'pendente');
    const pedidos = dto.stops.map((s) => s.id);
    const conjunto = new Set(pedidos);
    if (conjunto.size !== pedidos.length || pedidos.length !== pendentes.length || !pendentes.every((s) => conjunto.has(s.id))) {
      throw invalido('stops: informe todas as paradas pendentes do roteiro, uma vez cada.');
    }
    const porId = new Map(pendentes.map((s) => [s.id, s]));
    const fixas = new Map(dto.stops.map((s) => [s.id, s.fixa === true]));
    const snap = lerSnapshot(rota.params_snapshot);
    const params = paramsDaRota(rota);
    const plano = calcularRelogio({
      inicio: ultimaPosicao(rota.stops, { lat: rota.start_lat, lng: rota.start_lng }),
      partidaMin: partidaDoDia(rota.day, agora, params),
      ordem: pedidos.map((pid) => pontoDaParada(porId.get(pid)!)),
      params,
      jaFeitas: rota.stops.filter((s) => s.status === 'visitada').length,
    });
    // Reaproveita os números de `seq` que as pendentes já ocupam: pulada/adiada não mudam de lugar.
    const seqs = pendentes.map((s) => s.seq).sort((a, b) => a - b);
    await this.prisma.$transaction(
      async (tx) => {
        const r = await tx.field_routes.updateMany({
          where: { id: rota.id, version: dto.version },
          data: {
            version: { increment: 1 },
            params_snapshot: novoSnapshot(rota.params_snapshot, snap.config, snap.not_fit, dto.version + 1, 'edição manual da ordem', user.id, agora) as unknown as Prisma.InputJsonValue,
          },
        });
        if (r.count === 0) throw conflitoVersao();
        for (let i = 0; i < plano.paradas.length; i += 1) {
          const p = plano.paradas[i]!;
          const s = rota.stops.find((x) => x.lead_id === p.id)!;
          await tx.field_route_stops.update({
            where: { id: s.id },
            data: { seq: seqs[i]!, kind: p.kind, eta_min: p.eta_min, distance_m: p.distancia_m, fixa: fixas.get(s.id) ?? false },
          });
        }
      },
      { timeout: 15_000 },
    );
    return routeView(await this.carregar(rota.id), agora);
  }

  async reoptimize(id: string, dto: ReotimizarEquipeDto, user: AuthUser, agora = new Date()): Promise<RouteView> {
    this.exigirLigado();
    if ((dto.lat == null) !== (dto.lng == null)) throw invalido('lat/lng: informe os dois ou nenhum.');
    for (let tentativa = 0; ; tentativa += 1) {
      const rota = await this.carregar(id);
      const inicio = dto.lat != null && dto.lng != null ? { lat: dto.lat, lng: dto.lng } : ultimaPosicao(rota.stops, { lat: rota.start_lat, lng: rota.start_lng });
      try {
        await this.prisma.$transaction((tx) => reotimizar(tx, rota, inicio, agora, 'refazer pela equipe', user.id), { timeout: 15_000 });
        return routeView(await this.carregar(id), agora);
      } catch (e) {
        if (ehConflitoVersao(e) && tentativa === 0) continue;
        throw e;
      }
    }
  }
}
