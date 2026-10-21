/**
 * Mapa de pinos por situação (contrato §34). Só leitura. A situação de cada estabelecimento é decidida em UM lugar,
 * `categoriaDoLead` (domínio); o banco só entrega os insumos: a legenda é um `GROUP BY` sobre os insumos do filtro
 * inteiro (poucos grupos, classificados aqui) e os pinos vêm paginados por `id` (cursor estável).
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { PrismaService } from '../../../common/database/prisma.service';
import { isUuid } from '../../../common/ids/uuid';
import { todaySp } from '../../../common/time/dates';
import { validarBbox, type Bbox } from '../../../domain/heat-grid';
import { categoriaDaVisita, categoriaDoLead, classificarTelefone, legenda, META_CATEGORIA, rotuloEtapa, type ModoPinos } from '../../../domain/pin-rules';
import type { PinosCampoQueryDto, PinosQueryDto } from './pinos.dto';

const { sql, join, empty } = Prisma;
export const LIMITE_PADRAO_PINOS = 2000;

interface Escopo {
  pracaIds: string[];
  /** Consultor: só leads de roteiros dele ou que ele visitou (§34.4). */
  consultor?: string;
}

/** Insumos da situação (uma linha por estabelecimento ou por grupo). */
export interface InsumoPino {
  stage: number;
  decl: boolean;
  tem_visita: boolean;
  outcome: string | null;
  result: string | null;
  freela_status: string | null;
  needs_followup: boolean | null;
  refusal_reason: string | null;
}

export const codigoDoPino = (x: InsumoPino, modo: ModoPinos): string =>
  modo === 'estagio' ? String(x.stage) : categoriaDoLead({ stage: x.stage }, x.tem_visita ? x : null, x.decl);

const daPraca = (e: Escopo): Prisma.Sql => sql`l.praca_id IN (${join(e.pracaIds.map((id) => sql`${id}::uuid`))})`;
const doConsultor = (e: Escopo): Prisma.Sql =>
  e.consultor
    ? sql`AND (EXISTS (SELECT 1 FROM field_route_stops s JOIN field_routes r ON r.id = s.route_id WHERE s.lead_id = l.id AND r.consultant_id = ${e.consultor}::uuid)
           OR EXISTS (SELECT 1 FROM field_visits v2 WHERE v2.lead_id = l.id AND v2.consultant_id = ${e.consultor}::uuid))`
    : empty;
const COM_INSUMOS = sql`
  LEFT JOIN LATERAL (
    SELECT true AS tem, v.outcome, v.result, v.freela_status, v.needs_followup, v.refusal_reason
    FROM field_visits v WHERE v.lead_id = l.id AND v.checkout_at IS NOT NULL
    ORDER BY v.checkout_at DESC, v.id DESC LIMIT 1
  ) u ON true`;
const DECLARADO = sql`EXISTS (SELECT 1 FROM field_declared_signups d WHERE d.lead_id = l.id
  AND NOT EXISTS (SELECT 1 FROM field_declared_signup_voids x WHERE x.declared_id = d.id))`;

@Injectable()
export class PinosService {
  constructor(private readonly prisma: PrismaService) {}

  async equipe(q: PinosQueryDto, agora = new Date()) {
    let pracas: { id: string; name: string }[];
    if (q.praca_id) {
      const p = await this.prisma.pracas.findUnique({ where: { id: q.praca_id }, select: { id: true, name: true } });
      if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
      pracas = [p];
    } else {
      // Como a Lovable: só as praças abertas (início até hoje, no dia de Brasília).
      pracas = await this.prisma.pracas.findMany({ where: { start_date: { lte: todaySp(agora) } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    }
    return this.montar({ pracaIds: pracas.map((p) => p.id) }, pracas, q.mode ?? 'resultado', q, this.bbox(q.bbox));
  }

  async consultor(c: CampoConsultant, q: PinosCampoQueryDto) {
    const p = await this.prisma.pracas.findUnique({ where: { id: c.praca_id }, select: { id: true, name: true } });
    const pracas = p ? [p] : [];
    return this.montar({ pracaIds: pracas.map((x) => x.id), consultor: c.id }, pracas, q.mode ?? 'resultado', q, null);
  }

  /** Balão do pino (§34.2): sem telefone inteiro — só a máscara e o tipo. */
  async detalhe(leadId: string) {
    const naoAchado = new NotFoundException({ code: 'NOT_FOUND', message: 'Estabelecimento não encontrado.' });
    if (!isUuid(leadId)) throw naoAchado;
    const lead = await this.prisma.leads.findFirst({
      where: { id: leadId, archived: false, is_test: false },
      select: { id: true, name: true, address: true, city: true, praca_id: true, stage: true, phone: true },
    });
    if (!lead) throw naoAchado;
    const [ultima, decl] = await Promise.all([
      this.prisma.field_visits.findFirst({
        where: { lead_id: lead.id, checkout_at: { not: null } },
        orderBy: [{ checkout_at: 'desc' }, { id: 'desc' }],
        select: { outcome: true, result: true, freela_status: true, needs_followup: true, refusal_reason: true, journey: { select: { day: true } }, consultant: { select: { name: true } } },
      }),
      this.prisma.field_declared_signups.findFirst({ where: { lead_id: lead.id, void: null }, select: { id: true } }),
    ]);
    const code = categoriaDoLead({ stage: lead.stage }, ultima, !!decl);
    return {
      id: lead.id,
      name: lead.name,
      address: lead.address,
      city: lead.city,
      praca_id: lead.praca_id,
      stage: lead.stage,
      stage_label: rotuloEtapa(lead.stage),
      category: { code, label: META_CATEGORIA[code].label, color: META_CATEGORIA[code].color },
      last_visit: ultima
        ? { day: ultima.journey.day, label: META_CATEGORIA[categoriaDaVisita(ultima)].label, consultant_name: ultima.consultant.name }
        : null,
      phone: classificarTelefone(lead.phone),
    };
  }

  // ── internos ────────────────────────────────────────────────

  private bbox(texto: string | undefined): Bbox | null {
    if (texto === undefined) return null;
    const b = validarBbox(texto);
    if (!b.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: b.erro });
    return b.bbox;
  }

  private async montar(
    escopo: Escopo,
    pracas: { id: string; name: string }[],
    modo: ModoPinos,
    q: { cursor?: string; limit?: number },
    bbox: Bbox | null,
  ) {
    const limite = q.limit ?? LIMITE_PADRAO_PINOS;
    if (escopo.pracaIds.length === 0) {
      return { mode: modo, pracas, legend: legenda(new Map(), modo), pins: [], next_cursor: null, total: 0, without_location: 0, conta: this.conta(modo, 0, 0) };
    }
    const [grupos, pagina, [semLocal]] = await Promise.all([
      this.prisma.$queryRaw<(InsumoPino & { n: number })[]>(sql`
        SELECT l.stage, ${DECLARADO} AS decl, (u.tem IS NOT NULL) AS tem_visita,
          u.outcome, u.result, u.freela_status, u.needs_followup, u.refusal_reason, count(*)::int AS n
        FROM leads l ${COM_INSUMOS}
        WHERE l.archived = false AND l.is_test = false AND ${daPraca(escopo)} AND l.lat IS NOT NULL AND l.lng IS NOT NULL ${doConsultor(escopo)}
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`),
      this.prisma.$queryRaw<(InsumoPino & { id: string; lat: number; lng: number })[]>(sql`
        SELECT l.id::text AS id, l.lat, l.lng, l.stage, ${DECLARADO} AS decl, (u.tem IS NOT NULL) AS tem_visita,
          u.outcome, u.result, u.freela_status, u.needs_followup, u.refusal_reason
        FROM leads l ${COM_INSUMOS}
        WHERE l.archived = false AND l.is_test = false AND ${daPraca(escopo)} AND l.lat IS NOT NULL AND l.lng IS NOT NULL ${doConsultor(escopo)}
          ${q.cursor ? sql`AND l.id > ${q.cursor}::uuid` : empty}
          ${bbox ? sql`AND l.lat BETWEEN ${bbox.sul}::float8 AND ${bbox.norte}::float8 AND l.lng BETWEEN ${bbox.oeste}::float8 AND ${bbox.leste}::float8` : empty}
        ORDER BY l.id LIMIT ${limite + 1}`),
      this.prisma.$queryRaw<{ n: number }[]>(sql`
        SELECT count(*)::int AS n FROM leads l
        WHERE l.archived = false AND l.is_test = false AND ${daPraca(escopo)} AND (l.lat IS NULL OR l.lng IS NULL) ${doConsultor(escopo)}`),
    ]);
    return montarRespostaPinos({ modo, pracas, grupos, pagina, limite, semLocalizacao: semLocal?.n ?? 0, conta: (total, sem) => this.conta(modo, total, sem) });
  }

  private conta(modo: ModoPinos, total: number, sem: number): string {
    const criterio =
      modo === 'estagio'
        ? 'Cor = etapa do funil do estabelecimento.'
        : 'Situação = última visita concluída; cadastro declarado (não anulado) ou etapa 5 a 7 do funil = Cadastrou; sem visita concluída = A visitar.';
    return `${total.toLocaleString('pt-BR')} estabelecimentos com localização no mapa + ${sem.toLocaleString('pt-BR')} sem localização (não aparecem). ${criterio} Fora os arquivados e os de teste.`;
  }
}

/** Parte pura da resposta (testável sem banco): legenda do filtro inteiro + página com cursor. */
export function montarRespostaPinos(p: {
  modo: ModoPinos;
  pracas: { id: string; name: string }[];
  grupos: (InsumoPino & { n: number })[];
  pagina: (InsumoPino & { id: string; lat: number; lng: number })[];
  limite: number;
  semLocalizacao: number;
  conta: (total: number, sem: number) => string;
}) {
  const contagem = new Map<string, number>();
  for (const g of p.grupos) {
    const k = codigoDoPino(g, p.modo);
    contagem.set(k, (contagem.get(k) ?? 0) + g.n);
  }
  const total = [...contagem.values()].reduce((a, n) => a + n, 0);
  const temMais = p.pagina.length > p.limite;
  const linhas = temMais ? p.pagina.slice(0, p.limite) : p.pagina;
  return {
    mode: p.modo,
    pracas: p.pracas,
    legend: legenda(contagem, p.modo),
    pins: linhas.map((x) => [x.id, x.lat, x.lng, codigoDoPino(x, p.modo)] as [string, number, number, string]),
    next_cursor: temMais ? linhas[linhas.length - 1]!.id : null,
    total,
    without_location: p.semLocalizacao,
    conta: p.conta(total, p.semLocalizacao),
  };
}
