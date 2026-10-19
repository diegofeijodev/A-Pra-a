import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { todaySp } from '../../common/time/dates';
import {
  CELULA_PADRAO_M,
  MAX_CELULAS,
  latReferencia,
  minutosAproximados,
  montarCelulas,
  proximaCelula,
  resumoCobertura,
  tamanhoCelula,
  validarBbox,
  validarPeriodo,
  type Bbox,
  type ResumoCobertura,
  type TamanhoCelula,
} from '../../domain/heat-grid';
import type { CamadaCalor, HeatmapQueryDto } from './dto/heatmap.dto';

export interface HeatmapBase {
  layer: CamadaCalor;
  praca_id: string;
  consultant_id: string | null;
  area_id: string | null;
  from: string;
  to: string;
  requested_cell_m: number;
  cell: TamanhoCelula;
  lat_ref: number;
  max: number;
  truncated: boolean;
  note: string | null;
}
export type HeatmapView = HeatmapBase &
  (
    | {
        layer: 'visitas';
        cells: { lat: number; lng: number; n: number; leads: number }[];
        summary: { visits: number; leads: number; consultants: { id: string; name: string; visits: number }[] };
      }
    | { layer: 'passagem'; cells: { lat: number; lng: number; n: number; minutes: number }[]; summary: { points: number; minutes: number } }
    | { layer: 'cobertura'; cells: { lat: number; lng: number; n: number; total: number; visited: number }[]; summary: ResumoCobertura }
  );

export const AVISO_PASSAGEM =
  'Mostra onde a tela estava aberta: um ponto a cada 5 min e cada visita. Trechos com tela apagada ou sem sinal não aparecem.';

const naoAchada = (m: string) => new NotFoundException({ code: 'NOT_FOUND', message: m });
const invalido = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });

interface Filtro {
  praca: string;
  from: string;
  to: string;
  consultor: string | null;
  area: { lat: number; lng: number; radius_m: number } | null;
  bbox: Bbox | null;
}
interface LinhaSql {
  i: number;
  j: number;
  n: number;
  [k: string]: number;
}

const { sql, raw, join, empty } = Prisma;
/** Haversine em metros, arredondado (mesma régua do `distanciaM`). Colunas são constantes do código, nunca entrada. */
function filtroGeo(f: Filtro, latCol: string, lngCol: string): Prisma.Sql {
  const lat = raw(latCol);
  const lng = raw(lngCol);
  const partes: Prisma.Sql[] = [];
  if (f.bbox) partes.push(sql`AND ${lat} BETWEEN ${f.bbox.sul}::float8 AND ${f.bbox.norte}::float8 AND ${lng} BETWEEN ${f.bbox.oeste}::float8 AND ${f.bbox.leste}::float8`);
  if (f.area) {
    const { lat: a, lng: o, radius_m: r } = f.area;
    partes.push(sql`AND round(2 * 6371000 * asin(least(1, sqrt(
      power(sin(radians(${lat} - ${a}::float8) / 2), 2) +
      cos(radians(${a}::float8)) * cos(radians(${lat})) * power(sin(radians(${lng} - ${o}::float8) / 2), 2)
    )))) <= ${r}::float8`);
  }
  return partes.length ? join(partes, ' ') : empty;
}
const semBbox = (f: Filtro): Filtro => ({ ...f, bbox: null });
const celulaSql = (t: TamanhoCelula, lat: string, lng: string) =>
  sql`floor(${raw(lat)} / ${t.dlat}::float8)::int AS i, floor(${raw(lng)} / ${t.dlng}::float8)::int AS j`;

/**
 * Mapa de calor e cobertura da equipe (contrato §24). A agregação é `GROUP BY` no banco: nenhuma linha de
 * ponto, de visita ou de lead sobe para a aplicação, e a resposta só tem centro de célula + contagens.
 */
@Injectable()
export class HeatmapService {
  constructor(private readonly prisma: PrismaService) {}

  async heatmap(q: HeatmapQueryDto, agora = new Date()): Promise<HeatmapView> {
    const layer: CamadaCalor = q.layer ?? 'visitas';
    const per = validarPeriodo({ from: q.from, to: q.to }, todaySp(agora));
    if (!per.ok) throw invalido(per.erro);
    let bbox: Bbox | null = null;
    if (q.bbox !== undefined) {
      const b = validarBbox(q.bbox);
      if (!b.ok) throw invalido(b.erro);
      bbox = b.bbox;
    }

    // Tudo da praça pedida: consultor/área de outra praça respondem igual a um id que não existe.
    const praca = await this.prisma.pracas.findUnique({ where: { id: q.praca_id }, select: { id: true, lat: true, lon: true } });
    if (!praca) throw naoAchada('Praça não encontrada.');
    if (q.consultant_id) {
      const c = await this.prisma.field_consultants.findFirst({ where: { id: q.consultant_id, praca_id: praca.id }, select: { id: true } });
      if (!c) throw naoAchada('Consultor não encontrado.');
    }
    const area = q.area_id
      ? await this.prisma.field_areas.findFirst({ where: { id: q.area_id, praca_id: praca.id }, select: { lat: true, lng: true, radius_m: true } })
      : null;
    if (q.area_id && !area) throw naoAchada('Área não encontrada.');

    const f: Filtro = {
      praca: praca.id,
      from: per.from,
      to: per.to,
      // Cobertura é da praça: qualquer consultor que visitou conta (contrato §24.2).
      consultor: layer === 'cobertura' ? null : (q.consultant_id ?? null),
      area,
      bbox,
    };
    const latRef = latReferencia(
      bbox ? (bbox.sul + bbox.norte) / 2 : (area?.lat ?? praca.lat ?? -15),
    );

    const pedido = q.cell_m ?? CELULA_PADRAO_M;
    let m = pedido;
    let t = tamanhoCelula(m, latRef);
    let linhas = await this.linhas(layer, f, t);
    // Passou do teto: célula maior (100→250→500→1000); se ainda passar, `montarCelulas` corta e avisa.
    for (let prox = proximaCelula(m); linhas.length > MAX_CELULAS && prox !== null; prox = proximaCelula(m)) {
      m = prox;
      t = tamanhoCelula(m, latRef);
      linhas = await this.linhas(layer, f, t);
    }

    const base = {
      praca_id: praca.id,
      consultant_id: layer === 'cobertura' ? null : (q.consultant_id ?? null),
      area_id: q.area_id ?? null,
      from: per.from,
      to: per.to,
      requested_cell_m: pedido,
      cell: t,
      lat_ref: latRef,
    };

    if (layer === 'passagem') {
      const g = montarCelulas(linhas, t);
      const resumo = await this.resumoPassagem(semBbox(f));
      return {
        ...base,
        layer,
        cells: g.cells.map((c) => ({ lat: c.lat, lng: c.lng, n: c.n, minutes: minutosAproximados(c.tracks) })),
        max: g.max,
        truncated: g.truncated,
        summary: resumo,
        note: AVISO_PASSAGEM,
      };
    }
    if (layer === 'cobertura') {
      const g = montarCelulas(linhas, t, MAX_CELULAS, { descartarZero: true });
      const r = await this.resumoCobertura(semBbox(f));
      return {
        ...base,
        layer,
        cells: g.cells.map((c) => ({ lat: c.lat, lng: c.lng, n: c.n, total: c.total, visited: c.visited })),
        max: g.max,
        truncated: g.truncated,
        summary: r,
        note: null,
      };
    }
    const g = montarCelulas(linhas, t);
    return {
      ...base,
      layer: 'visitas',
      cells: g.cells.map((c) => ({ lat: c.lat, lng: c.lng, n: c.n, leads: c.leads })),
      max: g.max,
      truncated: g.truncated,
      summary: await this.resumoVisitas(semBbox(f)),
      note: null,
    };
  }

  // ── agregação por célula (um GROUP BY por camada; LIMIT teto+1 só para saber se estourou) ──
  private linhas(layer: CamadaCalor, f: Filtro, t: TamanhoCelula): Promise<LinhaSql[]> {
    const limite = MAX_CELULAS + 1;
    if (layer === 'passagem') {
      return this.prisma.$queryRaw<LinhaSql[]>(sql`
        SELECT ${celulaSql(t, 'p.lat', 'p.lng')}, count(*)::int AS n, (count(*) FILTER (WHERE p.kind = 'track'))::int AS tracks
        FROM field_points p
        JOIN field_journeys jn ON jn.id = p.journey_id
        JOIN field_consultants c ON c.id = jn.consultant_id
        WHERE jn.day BETWEEN ${f.from} AND ${f.to} AND c.praca_id = ${f.praca}::uuid
          ${f.consultor ? sql`AND jn.consultant_id = ${f.consultor}::uuid` : empty}
          ${filtroGeo(f, 'p.lat', 'p.lng')}
        GROUP BY 1, 2 ORDER BY n DESC, 1, 2 LIMIT ${limite}`);
    }
    if (layer === 'cobertura') {
      return this.prisma.$queryRaw<LinhaSql[]>(sql`
        SELECT ${celulaSql(t, 'l.lat', 'l.lng')}, count(*)::int AS total,
          (count(*) FILTER (WHERE ${visitadoNoPeriodo(f)}))::int AS visited,
          (count(*) - count(*) FILTER (WHERE ${visitadoNoPeriodo(f)}))::int AS n
        FROM leads l
        WHERE ${leadsDaCobertura(f)} ${filtroGeo(f, 'l.lat', 'l.lng')}
        GROUP BY 1, 2 ORDER BY n DESC, 1, 2 LIMIT ${limite}`);
    }
    return this.prisma.$queryRaw<LinhaSql[]>(sql`
      SELECT ${celulaSql(t, 'v.checkin_lat', 'v.checkin_lng')}, count(*)::int AS n, count(DISTINCT v.lead_id)::int AS leads
      FROM field_visits v
      JOIN field_journeys jn ON jn.id = v.journey_id
      JOIN leads l ON l.id = v.lead_id
      WHERE jn.day BETWEEN ${f.from} AND ${f.to} AND l.praca_id = ${f.praca}::uuid
        ${f.consultor ? sql`AND v.consultant_id = ${f.consultor}::uuid` : empty}
        ${filtroGeo(f, 'v.checkin_lat', 'v.checkin_lng')}
      GROUP BY 1, 2 ORDER BY n DESC, 1, 2 LIMIT ${limite}`);
  }

  // ── resumos do filtro inteiro (sem o recorte do bbox) ──
  private async resumoVisitas(f: Filtro) {
    const porConsultor = await this.prisma.$queryRaw<{ id: string; name: string; visits: number; leads: number }[]>(sql`
      SELECT c.id::text AS id, c.name, count(*)::int AS visits, count(DISTINCT v.lead_id)::int AS leads
      FROM field_visits v
      JOIN field_journeys jn ON jn.id = v.journey_id
      JOIN field_consultants c ON c.id = v.consultant_id
      JOIN leads l ON l.id = v.lead_id
      WHERE jn.day BETWEEN ${f.from} AND ${f.to} AND l.praca_id = ${f.praca}::uuid
        ${f.consultor ? sql`AND v.consultant_id = ${f.consultor}::uuid` : empty}
        ${filtroGeo(f, 'v.checkin_lat', 'v.checkin_lng')}
      GROUP BY c.id, c.name ORDER BY visits DESC, c.name`);
    const [tot] = await this.prisma.$queryRaw<{ leads: number }[]>(sql`
      SELECT count(DISTINCT v.lead_id)::int AS leads
      FROM field_visits v
      JOIN field_journeys jn ON jn.id = v.journey_id
      JOIN leads l ON l.id = v.lead_id
      WHERE jn.day BETWEEN ${f.from} AND ${f.to} AND l.praca_id = ${f.praca}::uuid
        ${f.consultor ? sql`AND v.consultant_id = ${f.consultor}::uuid` : empty}
        ${filtroGeo(f, 'v.checkin_lat', 'v.checkin_lng')}`);
    return {
      visits: porConsultor.reduce((s, c) => s + c.visits, 0),
      leads: tot?.leads ?? 0,
      consultants: porConsultor.map((c) => ({ id: c.id, name: c.name, visits: c.visits })),
    };
  }

  private async resumoPassagem(f: Filtro) {
    const [r] = await this.prisma.$queryRaw<{ points: number; tracks: number }[]>(sql`
      SELECT count(*)::int AS points, (count(*) FILTER (WHERE p.kind = 'track'))::int AS tracks
      FROM field_points p
      JOIN field_journeys jn ON jn.id = p.journey_id
      JOIN field_consultants c ON c.id = jn.consultant_id
      WHERE jn.day BETWEEN ${f.from} AND ${f.to} AND c.praca_id = ${f.praca}::uuid
        ${f.consultor ? sql`AND jn.consultant_id = ${f.consultor}::uuid` : empty}
        ${filtroGeo(f, 'p.lat', 'p.lng')}`);
    return { points: r?.points ?? 0, minutes: minutosAproximados(r?.tracks ?? 0) };
  }

  private async resumoCobertura(f: Filtro): Promise<ResumoCobertura> {
    const [r] = await this.prisma.$queryRaw<{ total: number; visited: number }[]>(sql`
      SELECT count(*)::int AS total, (count(*) FILTER (WHERE ${visitadoNoPeriodo(f)}))::int AS visited
      FROM leads l WHERE ${leadsDaCobertura(f)} ${filtroGeo(f, 'l.lat', 'l.lng')}`);
    return resumoCobertura(r?.total ?? 0, r?.visited ?? 0);
  }
}

/** Leads que entram na cobertura (contrato §24.2): da praça, ativos, com coordenada de precisão conhecida. */
const leadsDaCobertura = (f: Filtro) => sql`l.praca_id = ${f.praca}::uuid AND NOT l.archived AND NOT l.is_test
  AND l.lat IS NOT NULL AND l.lng IS NOT NULL AND l.location_precision IN ('point', 'address')`;

const visitadoNoPeriodo = (f: Filtro) => sql`EXISTS (
  SELECT 1 FROM field_visits v JOIN field_journeys jn ON jn.id = v.journey_id
  WHERE v.lead_id = l.id AND jn.day BETWEEN ${f.from} AND ${f.to})`;
