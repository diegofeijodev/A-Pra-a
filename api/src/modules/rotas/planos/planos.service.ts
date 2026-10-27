import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/auth/auth-user';
import { PrismaService } from '../../../common/database/prisma.service';
import { PracasDoConsultorService } from '../../../common/pracas/pracas-do-consultor.service';
import { isUuid } from '../../../common/ids/uuid';
import { addDays, daysBetween, todaySp } from '../../../common/time/dates';
import { pontoNaArea } from '../../../domain/area-rules';
import { caixaEnvolvente, distanciaM } from '../../../domain/campo-rules';
import {
  CONFIG_DIVISAO,
  contaLovable,
  contaRelogio,
  corDaRota,
  distanciaTotalKm,
  dividirPorVarredura,
  maisFrequente,
  nomeDaRota,
  paramsDivisao,
  type ConfigDivisao,
  type KindPlano,
  type ModoPlano,
  type PontoDivisao,
} from '../../../domain/divisao-rotas-rules';
import {
  contaPerfil,
  lerTiposDaQuery,
  normalizarPerfis,
  perfisConhecidos,
  perfisDaFoto,
  semLeadsComPerfil,
  type PerfilCliente,
} from '../../../domain/perfil-rota-rules';
import { paramsDaConfig, type ParamsPlano } from '../../../domain/rota-rules';
import { CONFIG_SHOPPING, ehGrande, type ConfigShopping } from '../../../domain/shopping-rules';
import { RotasConfigService } from '../rotas-config.service';
import { RotasEquipeService } from '../rotas-equipe.service';
import { filtroElegivel, filtroPerfis, SEGURA_LUGAR } from '../rotas-plano';
import { ModoCampoService } from '../modo-campo.service';
import { COM_PARADAS, routeView, type RouteView } from '../rotas-views';
import { LOVABLE_C_FLAGS, LOVABLE_D_FLAGS, velocidadeCarroKmh, type FlagsLovableC, type FlagsLovableD } from '../rotas.tokens';
import {
  MAX_LEADS_PLANO,
  type AtribuirItemDto,
  type ConfigDivisaoDto,
  type CriarPlanoDto,
  type MinhasRotasQueryDto,
  type PlanosQueryDto,
  type PreviaPlanoDto,
} from './planos.dto';

export interface PlanItemView {
  id: string;
  seq: number;
  name: string;
  color: string;
  lead_ids: string[];
  distance_m: number;
  est_minutes: number;
  stops: { lead_id: string; name: string; address: string; lat: number; lng: number }[];
  bairro_principal: string | null;
  do_centro_m: number | null;
  conta_lovable: { minutos: number; texto: string };
  conta_roteiro: { minutos: number; coube: boolean; fora: number; texto: string };
  assigned: { route_id: string | null; consultant_id: string | null; consultant_name: string | null; day: string | null; at: string | null } | null;
}

export interface PlanSummary {
  id: string;
  praca_id: string;
  area_id: string | null;
  area_name: string | null;
  kind: string;
  parent_lead_id: string | null;
  travel_mode: string;
  modelo_tempo: string;
  item_count: number;
  assigned_count: number;
  lead_count: number;
  truncated: boolean;
  created_at: string;
  created_by: string;
  archived_at: string | null;
  /** "Perfil dos clientes" da geração (redesenho E6, §39.5): a foto `[{ slug, label }]`, ou `null` = todos (e os planos de antes). */
  types: PerfilCliente[] | null;
}

export interface PlanView extends PlanSummary {
  params: Record<string, unknown>;
  items: PlanItemView[];
}

type ConsultantRouteView = RouteView & { route_plan: { plan_id: string; item_id: string; name: string; color: string } | null };

const desligado = () =>
  new NotFoundException({ code: 'ROUTE_PLANS_DISABLED', message: 'A divisão em rotas não está ligada neste servidor.' });
const shoppingsDesligado = () => new NotFoundException({ code: 'MALLS_DISABLED', message: 'Os shoppings não estão ligados neste servidor.' });
const naoAchado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Plano de rotas não encontrado.' });
const invalido = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });

/** "qui 22/10" (dia de Brasília guardado como `YYYY-MM-DD`). */
function diaCurto(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${sem} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Bairro do endereço do mapa aberto (`Rua X, 10 - Bairro`): o texto depois do último " - ". */
const bairroDoEndereco = (address: string | null | undefined): string | null => {
  const a = address ?? '';
  const i = a.lastIndexOf(' - ');
  const b = i >= 0 ? a.slice(i + 3).trim() : '';
  return b || null;
};

/**
 * Planos de rota (contrato §39): divisão de uma área em N rotas (porta da Lovable) e a publicação pelo MESMO serviço do
 * `POST /v1/routes`. Só com `FIELD_ROUTE_PLANS_ENABLED` (que só vale com `FIELD_ROUTES_ENABLED`). Isolamento por praça.
 */
@Injectable()
export class PlanosService {
  /** Atribuições do mesmo item em fila (a API roda em instância única): o 2º pedido vê o 1º já gravado. */
  private readonly filas = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: RotasConfigService,
    private readonly rotas: RotasEquipeService,
    @Optional() @Inject(LOVABLE_D_FLAGS) private readonly flags?: FlagsLovableD,
    @Optional() private readonly modo?: ModoCampoService,
    @Optional() private readonly pracas?: PracasDoConsultorService,
    /** Lote C: com `FIELD_SEGMENTS_ENABLED` a lista branca do perfil são os segmentos salvos; sem ela, os 5 tipos de hoje (§39.4). */
    @Optional() @Inject(LOVABLE_C_FLAGS) private readonly flagsC?: FlagsLovableC,
  ) {}

  get ligado(): boolean {
    return this.flags?.route_plans === true;
  }

  get shoppingsLigado(): boolean {
    return this.flags?.malls === true;
  }

  private exigir(): void {
    if (!this.ligado) throw desligado();
  }

  // ── configuração (§39.2) ──────────────────────────────────

  private async bruto(): Promise<Record<string, unknown>> {
    const s = await this.prisma.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
    const v = s?.field_config;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  async config(): Promise<ConfigDivisao> {
    this.exigir();
    return CONFIG_DIVISAO.ler((await this.bruto()).divisao);
  }

  async salvarConfig(dto: ConfigDivisaoDto): Promise<ConfigDivisao> {
    this.exigir();
    const parcial = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined && v !== null));
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
      const raw = s?.field_config && typeof s.field_config === 'object' && !Array.isArray(s.field_config) ? (s.field_config as Record<string, unknown>) : {};
      const r = CONFIG_DIVISAO.aplicar(CONFIG_DIVISAO.ler(raw.divisao), parcial);
      if (!r.ok) throw invalido(r.erro);
      // Preserva as chaves das outras fases (`field_config` é um JSON só).
      const novo = { ...raw, divisao: { ...r.config } } as Prisma.InputJsonValue;
      await tx.app_settings.upsert({ where: { id: 1 }, update: { field_config: novo }, create: { id: 1, field_config: novo } });
      return r.config;
    });
  }

  private async configShopping(): Promise<ConfigShopping> {
    return CONFIG_SHOPPING.ler((await this.bruto()).shopping);
  }

  /**
   * "Perfil dos clientes" pedido (§39.4, redesenho E6). Ausente, `null` ou `[]` = todos (`null`), SEM leitura nova: a consulta é a de
   * hoje. Com perfil: as combinações e a lista branca são conferidas aqui, antes de qualquer leitura de estabelecimento.
   */
  private async perfisPedidos(entrada: readonly string[] | null | undefined, ctx?: { kind: string; comLeads: boolean }): Promise<PerfilCliente[] | null> {
    if (!entrada?.length) return null;
    if (ctx && ctx.kind !== 'geral') throw invalido('types: o perfil vale só para a rota geral.');
    if (ctx?.comLeads) throw invalido('types: escolha os estabelecimentos ou o perfil, não os dois.');
    const segmentos = this.flagsC?.segments === true;
    const raw = segmentos
      ? (await this.prisma.app_settings.findUnique({ where: { id: 1 }, select: { place_segments: true } }))?.place_segments
      : null;
    const r = normalizarPerfis(entrada, perfisConhecidos(segmentos, raw));
    if (!r.ok) throw invalido(r.erro);
    return r.perfis;
  }

  // ── criar (§39.4, §39.5) ──────────────────────────────────

  async criar(dto: CriarPlanoDto, user: AuthUser, agora = new Date()): Promise<PlanView> {
    this.exigir();
    const kind = (dto.kind ?? 'geral') as KindPlano;
    if (kind !== 'geral' && !this.shoppingsLigado) throw shoppingsDesligado();
    const perfis = await this.perfisPedidos(dto.types, { kind, comLeads: !!dto.lead_ids?.length });
    const praca = await this.prisma.pracas.findUnique({ where: { id: dto.praca_id }, select: { id: true } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const area = dto.area_id ? await this.prisma.field_areas.findFirst({ where: { id: dto.area_id, praca_id: dto.praca_id } }) : null;
    if (dto.area_id && !area) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });

    const base = CONFIG_DIVISAO.ler((await this.bruto()).divisao);
    const pedido = Object.fromEntries(
      Object.entries({ por_rota: dto.por_rota, travel_mode: dto.travel_mode, modelo_tempo: dto.modelo_tempo }).filter(([, v]) => v !== undefined),
    );
    const ok = CONFIG_DIVISAO.aplicar(base, pedido);
    if (!ok.ok) throw invalido(ok.erro);
    const cfg = ok.config;

    let parentName: string | undefined;
    let pontos: PontoDivisao[];
    let truncated = false;
    let porRota = cfg.por_rota;
    if (kind === 'geral') {
      const r = dto.lead_ids?.length
        ? { pontos: await this.leadsEscolhidos(dto.praca_id, dto.lead_ids), truncated: false }
        : await this.elegiveis(dto.praca_id, area, agora, perfis?.map((x) => x.slug) ?? null);
      pontos = r.pontos;
      truncated = r.truncated;
    } else if (kind === 'shoppings') {
      pontos = await this.shoppingsGrandes(dto.praca_id);
      // Lovable: a rota dos shoppings passa por todos (só o teto de tempo corta).
      porRota = Math.max(porRota, pontos.length);
    } else {
      if (!dto.parent_lead_id) throw invalido('parent_lead_id: informe o shopping.');
      const pai = await this.prisma.leads.findFirst({
        where: { id: dto.parent_lead_id, praca_id: dto.praca_id, place_kind: 'shopping' },
        select: { id: true, name: true },
      });
      if (!pai) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Shopping não encontrado.' });
      parentName = pai.name;
      pontos = await this.lojasDoShopping(dto.praca_id, pai.id);
      porRota = Math.max(porRota, pontos.length);
    }
    if (pontos.length === 0) {
      throw new UnprocessableEntityException({
        code: 'PLAN_NO_LEADS',
        message:
          kind === 'shoppings'
            ? 'Nenhum shopping grande com localização nesta praça. Descubra os shoppings primeiro.'
            : kind === 'shopping_interno'
              ? 'Nenhuma loja cadastrada dentro deste shopping. Busque as lojas primeiro.'
              : perfis
                ? semLeadsComPerfil(perfis)
                : 'Nenhum estabelecimento com localização exata e fora de roteiro publicado nesta área.',
      });
    }

    const plano = await this.relogio(cfg.travel_mode);
    const grupos = dividirPorVarredura(pontos, paramsDivisao({ ...cfg, por_rota: porRota }, plano));
    // A foto guarda os rótulos do perfil (renomear o segmento depois não muda o que o plano diz); sem perfil, a foto de sempre.
    const params = { ...cfg, por_rota: porRota, relogio: plano, ...(perfis ? { types: perfis } : {}) };
    const criado = await this.prisma.$transaction(async (tx) => {
      const p = await tx.field_route_plans.create({
        data: {
          praca_id: dto.praca_id,
          area_id: area?.id ?? null,
          kind,
          parent_lead_id: kind === 'shopping_interno' ? dto.parent_lead_id! : null,
          travel_mode: cfg.travel_mode,
          modelo_tempo: cfg.modelo_tempo,
          params_snapshot: params as unknown as Prisma.InputJsonValue,
          total_leads: pontos.length,
          truncated,
          created_by: user.id,
          created_at: agora,
        },
      });
      await tx.field_route_plan_items.createMany({
        data: grupos.map((g, i) => ({
          plan_id: p.id,
          seq: i + 1,
          name: nomeDaRota(kind, i, grupos.length, parentName),
          color: corDaRota(i),
          lead_ids: g.map((x) => x.id),
          distance_m: Math.round(distanciaTotalKm(g) * 1000),
          est_minutes: cfg.modelo_tempo === 'roteiro' ? contaRelogio(g, plano).minutos : contaLovable(g, cfg, cfg.travel_mode).minutos,
        })),
      });
      return p;
    });
    return this.get(criado.id);
  }

  /**
   * A conta de antes de gerar (UX R1): quantos entram e o mínimo de rotas. Mesmos elegíveis do `criar`. Com perfil (§39.5): duas
   * consultas (com o filtro e sem), `lead_count_total` = os elegíveis sem o filtro e a conta explica quem ficou fora.
   */
  async previa(
    q: PreviaPlanoDto,
    agora = new Date(),
  ): Promise<{ lead_count: number; lead_count_total: number; truncated: boolean; por_rota: number; rotas_min: number; conta: string }> {
    this.exigir();
    const perfis = await this.perfisPedidos(lerTiposDaQuery(q.types));
    const praca = await this.prisma.pracas.findUnique({ where: { id: q.praca_id }, select: { id: true } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const area = q.area_id ? await this.prisma.field_areas.findFirst({ where: { id: q.area_id, praca_id: q.praca_id } }) : null;
    if (q.area_id && !area) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });
    const porRota = q.por_rota ?? CONFIG_DIVISAO.ler((await this.bruto()).divisao).por_rota;
    const semArea = !area && (await this.prisma.field_areas.count({ where: { praca_id: q.praca_id, active: true } })) === 0;
    if (semArea) {
      return { lead_count: 0, lead_count_total: 0, truncated: false, por_rota: porRota, rotas_min: 0, conta: 'Nenhuma área de atuação ativa nesta praça. Cadastre uma em Configurações para dividir em rotas.' };
    }
    // Ordem fixa: o filtrado primeiro, o total depois (só com perfil).
    const { pontos, truncated } = await this.elegiveis(q.praca_id, area, agora, perfis?.map((x) => x.slug) ?? null);
    const n = pontos.length;
    const total = perfis ? (await this.elegiveis(q.praca_id, area, agora)).pontos.length : n;
    const rotasMin = Math.ceil(n / porRota);
    const div = (n / porRota).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const base =
      n === 0
        ? 'Nenhum estabelecimento com localização exata e fora de roteiro publicado nesta área.'
        : `${n.toLocaleString('pt-BR')} ${n === 1 ? 'estabelecimento' : 'estabelecimentos'} com localização exata, fora de roteiro publicado → pelo menos ${rotasMin} ${rotasMin === 1 ? 'rota' : 'rotas'} de até ${porRota} paradas (${n.toLocaleString('pt-BR')} ÷ ${porRota} = ${div}; arredonda para cima; o teto de tempo pode criar mais)`;
    const conta = !perfis || total === 0 ? base : n === 0 ? `${semLeadsComPerfil(perfis)} ${contaPerfil({ n, total, perfis })}` : `${base}. ${contaPerfil({ n, total, perfis })}`;
    return { lead_count: n, lead_count_total: total, truncated, por_rota: porRota, rotas_min: rotasMin, conta };
  }

  /** Os parâmetros do nosso relógio para o modo (a pé: a configuração; carro: a velocidade do ambiente). */
  private async relogio(modo: ModoPlano): Promise<ParamsPlano> {
    const c = await this.configs.config();
    return paramsDaConfig(c, modo === 'carro' ? velocidadeCarroKmh() : undefined);
  }

  /**
   * Os candidatos do §23.4 na área (ou nas áreas ativas), fora de roteiro publicado de hoje em diante. `perfis` (E6) entra no `where`
   * do banco, antes do corte de 2.000; vazio = a consulta de sempre.
   */
  private async elegiveis(
    pracaId: string,
    area: { id: string; lat: number; lng: number; radius_m: number } | null,
    agora: Date,
    perfis: string[] | null = null,
  ): Promise<{ pontos: PontoDivisao[]; truncated: boolean }> {
    const areas = area ? [area] : await this.prisma.field_areas.findMany({ where: { praca_id: pracaId, active: true } });
    if (areas.length === 0) return { pontos: [], truncated: false };
    const config = await this.configs.config();
    const caixas = areas.map((a) => {
      const b = caixaEnvolvente(a, a.radius_m);
      return { lat: { gte: b.latMin, lte: b.latMax }, lng: { gte: b.lngMin, lte: b.lngMax } };
    });
    const semShopping = this.shoppingsLigado && (await this.configShopping()).fora_da_rota_geral;
    const linhas = await this.prisma.leads.findMany({
      where: {
        praca_id: pracaId,
        ...filtroElegivel(config.estagio_maximo_rota),
        OR: caixas,
        route_stops: { none: { day: { gte: todaySp(agora) }, status: { in: [...SEGURA_LUGAR] } } },
        ...(semShopping ? { place_kind: null, parent_lead_id: null } : {}),
        ...filtroPerfis(perfis),
      },
      select: { id: true, lat: true, lng: true },
      orderBy: { id: 'asc' },
      take: MAX_LEADS_PLANO + 1,
    });
    const dentro = linhas.filter((l) => l.lat != null && l.lng != null && areas.some((a) => pontoNaArea({ lat: l.lat!, lng: l.lng! }, a)));
    return {
      pontos: dentro.slice(0, MAX_LEADS_PLANO).map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng! })),
      truncated: linhas.length > MAX_LEADS_PLANO,
    };
  }

  private async leadsEscolhidos(pracaId: string, ids: string[]): Promise<PontoDivisao[]> {
    const unicos = [...new Set(ids)];
    const leads = await this.prisma.leads.findMany({
      where: { id: { in: unicos } },
      select: { id: true, praca_id: true, archived: true, lat: true, lng: true, name: true },
    });
    // Inexistente e de outra praça respondem igual (como o `POST /v1/routes`).
    if (leads.length !== unicos.length || leads.some((l) => l.praca_id !== pracaId)) {
      throw invalido('lead_ids: um ou mais estabelecimentos não existem ou não pertencem à praça.');
    }
    const ruins = leads.filter((l) => l.archived || l.lat == null || l.lng == null);
    if (ruins.length) throw invalido(`lead_ids: sem localização ou arquivado: ${ruins.slice(0, 5).map((l) => l.name).join(', ')}.`);
    return leads.map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng! }));
  }

  private async shoppingsGrandes(pracaId: string): Promise<PontoDivisao[]> {
    const cfg = await this.configShopping();
    const linhas = await this.prisma.leads.findMany({
      where: { praca_id: pracaId, place_kind: 'shopping', archived: false, lat: { not: null }, lng: { not: null } },
      select: { id: true, lat: true, lng: true, mall_metrics: true },
      orderBy: { id: 'asc' },
      take: MAX_LEADS_PLANO,
    });
    return linhas
      .filter((l) => {
        const m = l.mall_metrics;
        const met = m
          ? { geometry_kind: m.geometry_kind as 'poligono' | 'ponto', area_m2: m.area_m2, levels: m.levels, pois_mapped: m.pois_mapped, large_override: m.large_override }
          : { geometry_kind: 'ponto' as const, area_m2: null, levels: null, pois_mapped: null, large_override: null };
        return ehGrande(met, cfg).grande;
      })
      .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng! }));
  }

  private async lojasDoShopping(pracaId: string, parentId: string): Promise<PontoDivisao[]> {
    const linhas = await this.prisma.leads.findMany({
      where: { praca_id: pracaId, parent_lead_id: parentId, archived: false, is_test: false, lat: { not: null }, lng: { not: null } },
      select: { id: true, lat: true, lng: true },
      orderBy: { id: 'asc' },
      take: MAX_LEADS_PLANO,
    });
    return linhas.map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng! }));
  }

  // ── leitura ───────────────────────────────────────────────

  async list(q: PlanosQueryDto): Promise<PlanSummary[]> {
    this.exigir();
    const kind = q.kind ?? 'geral';
    if (kind !== 'geral' && !this.shoppingsLigado) throw shoppingsDesligado();
    const praca = await this.prisma.pracas.findUnique({ where: { id: q.praca_id }, select: { id: true } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const planos = await this.prisma.field_route_plans.findMany({
      where: { praca_id: q.praca_id, kind, archived_at: null },
      include: { items: { select: { assigned_route_id: true } } },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    const areas = await this.nomesDasAreas(planos.map((p) => p.area_id));
    return planos.map((p) => this.resumo(p, p.items, areas));
  }

  private async nomesDasAreas(ids: (string | null)[]): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unicos.length) return new Map();
    const rows = await this.prisma.field_areas.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private resumo(
    p: Prisma.field_route_plansGetPayload<object>,
    items: { assigned_route_id: string | null }[],
    areas: Map<string, string>,
  ): PlanSummary {
    return {
      id: p.id,
      praca_id: p.praca_id,
      area_id: p.area_id,
      area_name: p.area_id ? (areas.get(p.area_id) ?? null) : null,
      kind: p.kind,
      parent_lead_id: p.parent_lead_id,
      travel_mode: p.travel_mode,
      modelo_tempo: p.modelo_tempo,
      item_count: items.length,
      assigned_count: items.filter((i) => i.assigned_route_id).length,
      lead_count: p.total_leads,
      truncated: p.truncated,
      created_at: p.created_at.toISOString(),
      created_by: p.created_by,
      archived_at: p.archived_at?.toISOString() ?? null,
      types: perfisDaFoto(p.params_snapshot),
    };
  }

  async get(id: string): Promise<PlanView> {
    this.exigir();
    if (!isUuid(id)) throw naoAchado();
    const p = await this.prisma.field_route_plans.findUnique({
      where: { id },
      include: { items: { orderBy: { seq: 'asc' }, include: { consultant: { select: { name: true } } } } },
    });
    if (!p) throw naoAchado();
    if (p.kind !== 'geral' && !this.shoppingsLigado) throw shoppingsDesligado();
    const ids = [...new Set(p.items.flatMap((i) => i.lead_ids))];
    const [leads, praca, areas, plano] = await Promise.all([
      this.prisma.leads.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, address: true, lat: true, lng: true } }),
      this.prisma.pracas.findUnique({ where: { id: p.praca_id }, select: { lat: true, lon: true } }),
      this.nomesDasAreas([p.area_id]),
      this.relogio(p.travel_mode as ModoPlano),
    ]);
    const cfg = CONFIG_DIVISAO.ler(p.params_snapshot);
    const porId = new Map(leads.map((l) => [l.id, l]));
    const centro = praca?.lat != null && praca?.lon != null ? { lat: praca.lat, lng: praca.lon } : null;
    const itens: PlanItemView[] = p.items.map((i) => {
      const stops = i.lead_ids
        .map((lid) => porId.get(lid))
        .filter((l): l is NonNullable<typeof l> => !!l && l.lat != null && l.lng != null)
        .map((l) => ({ lead_id: l.id, name: l.name, address: l.address, lat: l.lat!, lng: l.lng! }));
      const ordem = stops.map((s) => ({ id: s.lead_id, lat: s.lat, lng: s.lng }));
      const cen = ordem.length
        ? { lat: ordem.reduce((s, x) => s + x.lat, 0) / ordem.length, lng: ordem.reduce((s, x) => s + x.lng, 0) / ordem.length }
        : null;
      return {
        id: i.id,
        seq: i.seq,
        name: i.name,
        color: i.color,
        lead_ids: i.lead_ids,
        distance_m: i.distance_m,
        est_minutes: i.est_minutes,
        stops,
        bairro_principal: maisFrequente(stops.map((s) => bairroDoEndereco(s.address))),
        do_centro_m: cen && centro ? distanciaM(cen, centro) : null,
        conta_lovable: contaLovable(ordem, cfg, p.travel_mode as ModoPlano),
        conta_roteiro: (({ minutos, coube, fora, texto }) => ({ minutos, coube, fora, texto }))(contaRelogio(ordem, plano)),
        assigned: i.assigned_at
          ? {
              route_id: i.assigned_route_id,
              consultant_id: i.assigned_consultant_id,
              consultant_name: i.consultant?.name ?? null,
              day: i.assigned_day,
              at: i.assigned_at.toISOString(),
            }
          : null,
      };
    });
    return {
      ...this.resumo(p, p.items, areas),
      params: (p.params_snapshot ?? {}) as Record<string, unknown>,
      items: itens,
    };
  }

  // ── publicar (§39.6) ──────────────────────────────────────

  async atribuir(
    planId: string,
    itemId: string,
    dto: AtribuirItemDto,
    user: AuthUser,
    agora = new Date(),
  ): Promise<{ item: PlanItemView; route: RouteView; dropped: number }> {
    this.exigir();
    if (!isUuid(planId) || !isUuid(itemId)) throw naoAchado();
    const anterior = this.filas.get(itemId) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(() => this.atribuirAgora(planId, itemId, dto, user, agora));
    this.filas.set(itemId, atual);
    try {
      return await atual;
    } finally {
      if (this.filas.get(itemId) === atual) this.filas.delete(itemId);
    }
  }

  private async atribuirAgora(
    planId: string,
    itemId: string,
    dto: AtribuirItemDto,
    user: AuthUser,
    agora: Date,
  ): Promise<{ item: PlanItemView; route: RouteView; dropped: number }> {
    const p = await this.prisma.field_route_plans.findUnique({ where: { id: planId }, include: { items: { where: { id: itemId } } } });
    const item = p?.items[0];
    if (!p || !item) throw naoAchado();
    if (p.kind !== 'geral' && !this.shoppingsLigado) throw shoppingsDesligado();
    if (p.archived_at) throw new ConflictException({ code: 'PLAN_ARCHIVED', message: 'Esta geração foi arquivada. Gere as rotas de novo.' });

    const itemView = async () => (await this.get(planId)).items.find((x) => x.id === itemId)!;
    if (item.assigned_at) {
      if (item.assigned_consultant_id === dto.consultant_id && item.assigned_day === dto.day && item.assigned_route_id) {
        const r = await this.prisma.field_routes.findUnique({ where: { id: item.assigned_route_id }, select: { id: true } });
        if (r) return { item: await itemView(), route: await this.rotas.get(r.id, agora), dropped: 0 };
      }
      const quem = item.assigned_consultant_id
        ? await this.prisma.field_consultants.findUnique({ where: { id: item.assigned_consultant_id }, select: { name: true } })
        : null;
      throw new ConflictException({
        code: 'ITEM_ALREADY_ASSIGNED',
        message: `${item.name} já foi publicada${quem ? ` para ${quem.name}` : ''}${item.assigned_day ? ` em ${diaCurto(item.assigned_day)}` : ''}.`,
      });
    }

    const consultor = await this.prisma.field_consultants.findUnique({
      where: { id: dto.consultant_id },
      select: { id: true, name: true, praca_id: true },
    });
    if (!consultor) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Consultor não encontrado.' });
    // Lote F2 §44.7: com a flag, vale o conjunto do consultor (desligada, só a principal: o conjunto é `[principal]`).
    const atua = this.pracas ? await this.pracas.conjunto(consultor.id, consultor.praca_id) : [consultor.praca_id];
    if (!atua.includes(p.praca_id)) throw invalido('consultant_id: o consultor é de outra praça.');

    const existente = await this.prisma.field_routes.findFirst({
      where: { consultant_id: consultor.id, day: dto.day, status: 'ativa' },
      select: { id: true },
    });
    if (existente && dto.confirm_replace !== true) {
      throw new ConflictException({
        code: 'ROUTE_EXISTS',
        message: `${consultor.name} já tem roteiro em ${diaCurto(dto.day)}. Cada consultor tem um roteiro por dia.`,
      });
    }

    const vivos = await this.prisma.leads.findMany({
      where: { id: { in: item.lead_ids }, praca_id: p.praca_id, archived: false, lat: { not: null }, lng: { not: null } },
      select: { id: true },
    });
    const ok = new Set(vivos.map((l) => l.id));
    const leadIds = item.lead_ids.filter((id) => ok.has(id));
    if (leadIds.length === 0) {
      throw new UnprocessableEntityException({
        code: 'PLAN_ITEM_EMPTY',
        message: 'Nenhum estabelecimento desta rota pode mais entrar (arquivado ou sem localização). Gere as rotas de novo.',
      });
    }
    // O MESMO serviço do `POST /v1/routes` (§23.4): praça, dia, consultor ativo, LEAD_IN_OTHER_ROUTE e um roteiro por dia.
    const route = await this.rotas.build(
      {
        consultant_id: consultor.id,
        day: dto.day,
        lead_ids: leadIds,
        ...(p.area_id ? { area_id: p.area_id } : {}),
        travel_mode: p.travel_mode,
      },
      user,
      agora,
    );
    await this.prisma.field_route_plan_items.updateMany({
      where: { id: item.id, assigned_at: null },
      data: {
        assigned_route_id: route.id,
        assigned_consultant_id: consultor.id,
        assigned_day: dto.day,
        assigned_at: agora,
        assigned_by: user.id,
      },
    });
    return { item: await itemView(), route, dropped: item.lead_ids.length - leadIds.length };
  }

  async arquivar(id: string, user: AuthUser, agora = new Date()): Promise<PlanView> {
    this.exigir();
    if (!isUuid(id)) throw naoAchado();
    const p = await this.prisma.field_route_plans.findUnique({ where: { id }, select: { id: true, kind: true } });
    if (!p) throw naoAchado();
    if (p.kind !== 'geral' && !this.shoppingsLigado) throw shoppingsDesligado();
    // Idempotente: o primeiro arquivamento vale. Os roteiros publicados não mudam.
    await this.prisma.field_route_plans.updateMany({ where: { id, archived_at: null }, data: { archived_at: agora, archived_by: user.id } });
    return this.get(id);
  }

  // ── consultor: "Minhas rotas" (§39.7) ─────────────────────

  async minhasRotas(consultantId: string, q: MinhasRotasQueryDto, agora = new Date()): Promise<{ from: string; to: string; routes: ConsultantRouteView[] }> {
    this.exigir();
    const from = q.from ?? todaySp(agora);
    const to = q.to ?? addDays(from, 30);
    if (to < from) throw invalido('to: precisa ser depois de from.');
    if (daysBetween(from, to) > 62) throw invalido('to: no máximo 62 dias depois de from.');
    const rotas = await this.prisma.field_routes.findMany({
      where: { consultant_id: consultantId, day: { gte: from, lte: to } },
      include: { ...COM_PARADAS, plan_items: { select: { id: true, plan_id: true, name: true, color: true }, take: 1, orderBy: { assigned_at: 'desc' } } },
      orderBy: [{ day: 'asc' }, { created_at: 'asc' }],
      take: 200,
    });
    // Mesma conta de meta do roteiro de hoje (§31.6): sem a flag do modo, o padrão.
    const modo = this.modo?.ligado ? await this.modo.config() : undefined;
    return {
      from,
      to,
      routes: rotas.map((r) => {
        const it = r.plan_items[0];
        return {
          ...routeView(r, agora, false, modo),
          route_plan: it ? { plan_id: it.plan_id, item_id: it.id, name: it.name, color: it.color } : null,
        };
      }),
    };
  }
}
