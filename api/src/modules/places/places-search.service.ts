import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { CRM_FLAGS, type FlagsCrm } from '../../common/flags/crm.flags';
import { isUuid } from '../../common/ids/uuid';
import { phoneKey } from '../../common/phone/phone';
import { todaySp } from '../../common/time/dates';
import { caixaEnvolvente, RAIO_DUPLICADO_M } from '../../domain/campo-rules';
import { AUTOR_AUTOMATICO, TETO_AUTO_LEADS_POR_BUSCA } from '../../domain/catalog/crm';
import {
  acharLeadDuplicado,
  cacheValido,
  chaveCache,
  classificarAchados,
  estimarCustoApifyUsd,
  fimDoCache,
  limiteApify,
  mesDeBrasilia,
  type FonteLugar,
  type LeadParaDedup,
  type LugarNormalizado,
  type MotivoAchado,
  type TipoLugar,
  MAX_RESULTADOS,
} from '../../domain/places-rules';
import { hashSegmentos, lerFotoSegmentos, type Segmento } from '../../domain/segmentos-rules';
import { CONFIG_SHOPPING, type ConfigShopping } from '../../domain/shopping-rules';
import { LOVABLE_D_FLAGS, type FlagsLovableD } from '../rotas/rotas.tokens';
import { violouUnico } from '../campo/prisma-errors';
import { ImportsService } from '../imports/imports.service';
import { AddPlaceLeadsDto, StartPlaceSearchDto } from './dto/places.dto';
import { PlacesSegmentsService } from './places-segments.service';
import { PLACES_LIMITS, PLACES_PROVIDERS, type PlacesLimits } from './places.tokens';
import { BuscaCancelada, ProviderError, type BuscaParams, type PlacesProvider } from './providers/places-provider';

const ORIGEM_LEAD = 'pesquisa automática';
const ROTULO_FONTE: Record<FonteLugar, string> = { osm: 'OSM', apify: 'Apify' };
const MSG_REINICIO = 'Interrompida: o servidor foi reiniciado.';
const MSG_GENERICA = 'Não conseguimos fazer isso agora. Tente de novo.';

type Db = PrismaService | Prisma.TransactionClient;

export interface SearchRunView {
  id: string;
  praca_id: string;
  /** Nulo só nas buscas de lojas e de shoppings sem área (lote D, §40.3); `lugares` sempre tem. */
  area_id: string | null;
  area_name: string;
  source: string;
  types: string[];
  center: { lat: number; lng: number };
  radius_m: number;
  status: string;
  found: number;
  novos: number;
  duplicados: number;
  descartados: number;
  truncated: boolean;
  est_cost_usd: number;
  error: string | null;
  cached: boolean;
  requested_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string | null;
  /** Lote D (§40.3): só nas buscas de `shoppings`/`lojas` (as de `lugares` não ganham chave nova). */
  kind?: string;
  parent_lead_id?: string | null;
}

export interface SourceView {
  id: FonteLugar;
  label: string;
  available: boolean;
  paid: boolean;
  max_places_per_run?: number;
  monthly_cap?: number;
  used_this_month?: number;
  est_cost_usd_per_run?: number;
}

export interface CandidateView {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  location_precision: string;
  distance_m: number;
  phone: string;
  website: string | null;
  source: string;
  status: string;
  reason: string | null;
  lead_id: string | null;
  lead_name: string | null;
  selectable: boolean;
  /** Lote D (§40.3): só nos achados de `shoppings`. */
  metrics?: Record<string, unknown>;
}

export interface AddLeadsView {
  batch_id: string;
  created: number;
  skipped: { candidate_id: string; reason: string }[];
}

type RunRow = {
  id: string;
  praca_id: string;
  area_id: string | null;
  area_name: string;
  source: string;
  types: string[];
  lat: number;
  lng: number;
  radius_m: number;
  status: string;
  found: number;
  novos: number;
  duplicados: number;
  descartados: number;
  truncated: boolean;
  est_cost_usd: number;
  error: string | null;
  requested_by: string;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  /** Foto dos segmentos (§36.6); ausente/nulo = tipos fixos de hoje. */
  segments_snapshot?: unknown;
  /** Lote D (§40.3): `lugares` (a de hoje) | `shoppings` | `lojas`. */
  kind?: string;
  parent_lead_id?: string | null;
};

type CandidateRow = {
  id: string;
  source: string;
  source_ref: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  location_precision: string;
  phone: string;
  website: string | null;
  distance_m: number;
  status: string;
  reason: string | null;
  lead_id: string | null;
  lead?: { name: string } | null;
  metrics?: unknown;
};

const naoEncontrada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Pesquisa não encontrada.' });
const shoppingsDesligado = () => new NotFoundException({ code: 'MALLS_DISABLED', message: 'Os shoppings não estão ligados neste servidor.' });
/** Lote D (§40.3): raio padrão da busca de shoppings em volta do centro (até 30 km). */
const RAIO_SHOPPINGS_PADRAO_M = 15_000;
const pracaNaoEncontrada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });

/**
 * Pesquisa automática de estabelecimentos (§22). Busca em segundo plano numa
 * fila em memória de uma tarefa por vez (a API é instância única): o provedor
 * externo nunca recebe duas requisições juntas. Todo acesso filtra por `id` E
 * `praca_id`.
 */
/** Gestor efetivo (o guard já combinou a flag com a coluna): só o mapa aberto (§42.3). Admin nunca é limitado. */
const soMapaAberto = (u?: AuthUser): boolean => !!u && !u.is_admin && u.is_gestor === true;
const apifySoAdmin = () =>
  new ForbiddenException({ code: 'FORBIDDEN', message: 'A busca paga (Google Maps pelo Apify) é só para administradores.' });

@Injectable()
export class PlacesSearchService implements OnApplicationBootstrap {
  private readonly log = new Logger(PlacesSearchService.name);
  private fila: Promise<void> = Promise.resolve();
  private readonly cancelamentos = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ImportsService,
    @Inject(PLACES_PROVIDERS) private readonly providers: Record<FonteLugar, PlacesProvider>,
    @Inject(PLACES_LIMITS) private readonly limits: PlacesLimits,
    @Optional() private readonly segmentos?: PlacesSegmentsService,
    @Optional() @Inject(LOVABLE_D_FLAGS) private readonly flagsD?: FlagsLovableD,
    @Optional() @Inject(CRM_FLAGS) private readonly crm?: FlagsCrm,
  ) {}

  /** Lote D (§40): shoppings e lojas de dentro (só valem com os segmentos e os planos de rota). */
  get shoppingsLigado(): boolean {
    return this.flagsD?.malls === true;
  }

  /** Execução interrompida por reinício não termina nunca: vira erro legível. */
  async onApplicationBootstrap(): Promise<void> {
    await this.reconciliarInterrompidas();
  }

  async reconciliarInterrompidas(): Promise<number> {
    const { count } = await this.prisma.place_import_runs.updateMany({
      where: { status: { in: ['queued', 'running'] } },
      data: { status: 'error', error: MSG_REINICIO, finished_at: new Date() },
    });
    return count;
  }

  /** Espera a fila esvaziar (testes). */
  aguardarFila(): Promise<void> {
    return this.fila;
  }

  // ── pedido ──────────────────────────────────────────────────
  async start(dto: StartPlaceSearchDto, user: AuthUser): Promise<{ run: SearchRunView; nova: boolean }> {
    // Lote E §42.3: o gestor só busca no mapa aberto (o Apify é pago: só admin).
    if (soMapaAberto(user) && (dto.source ?? 'osm') !== 'osm') throw apifySoAdmin();
    // Lote D (§40.3): `kind` ausente (ou `lugares`) = tudo como hoje; os outros só com a flag dos shoppings.
    const kind = dto.kind ?? 'lugares';
    if (kind !== 'lugares') {
      if (!this.shoppingsLigado) throw shoppingsDesligado();
      return kind === 'shoppings' ? this.startShoppings(dto, user) : this.startLojas(dto, user);
    }
    await this.assertPraca(dto.praca_id);
    if (!isUuid(dto.area_id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });
    const area = await this.prisma.field_areas.findFirst({ where: { id: dto.area_id, praca_id: dto.praca_id } });
    if (!area) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });
    if (!area.active) {
      throw new ConflictException({ code: 'AREA_INACTIVE', message: 'Esta área está desativada. Ative-a em Configurações.' });
    }
    const source = (dto.source ?? 'osm') as FonteLugar;
    if (!this.providers[source]?.disponivel()) {
      throw new UnprocessableEntityException({
        code: 'SOURCE_UNAVAILABLE',
        message: 'A fonte Apify não está ligada neste servidor.',
      });
    }

    // Segmentos editáveis (§36): os tipos são os segmentos ativos e a busca fotografa as definições. Desligada = hoje.
    let foto: Segmento[] | null = null;
    let types = this.segmentos?.ligado ? [] : [...dto.types].sort();
    if (this.segmentos?.ligado) ({ types, foto } = await this.segmentos.fotoDaBusca(dto.types));

    // A geometria é a da área AGORA: editar a área depois gera outra chave.
    const cacheKey = chaveCache({
      lat: area.lat,
      lng: area.lng,
      radius_m: area.radius_m,
      types,
      source,
      ...(foto ? { segmentos_hash: hashSegmentos(foto) } : {}),
    });

    // Mesma busca já na fila ou rodando: devolve a que existe (duplo clique não paga duas vezes).
    const emAndamento = await this.prisma.place_import_runs.findFirst({
      where: { praca_id: dto.praca_id, cache_key: cacheKey, status: { in: ['queued', 'running'] } },
      orderBy: { created_at: 'desc' },
    });
    if (emAndamento) return { run: toView(emAndamento, false), nova: false };

    if (!dto.refresh) {
      const recente = await this.prisma.place_import_runs.findFirst({
        where: { praca_id: dto.praca_id, cache_key: cacheKey, status: 'done', finished_at: { not: null } },
        orderBy: { finished_at: 'desc' },
      });
      if (recente && cacheValido(recente.finished_at, new Date())) {
        return { run: toView(recente, true), nova: false };
      }
    }

    const row = await this.prisma.place_import_runs.create({
      data: {
        praca_id: dto.praca_id,
        area_id: area.id,
        area_name: area.name,
        source,
        types,
        lat: area.lat,
        lng: area.lng,
        radius_m: area.radius_m,
        cache_key: cacheKey,
        requested_by: user.id,
        ...(foto ? { segments_snapshot: foto as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    this.enfileirar(row.id);
    return { run: toView(row, false), nova: true };
  }

  /** Mesma busca na fila/rodando ou recente (cache de 7 dias): devolve a que existe. */
  private async reaproveitar(pracaId: string, cacheKey: string, refresh: boolean | undefined): Promise<{ run: SearchRunView; nova: boolean } | null> {
    const emAndamento = await this.prisma.place_import_runs.findFirst({
      where: { praca_id: pracaId, cache_key: cacheKey, status: { in: ['queued', 'running'] } },
      orderBy: { created_at: 'desc' },
    });
    if (emAndamento) return { run: toView(emAndamento, false), nova: false };
    if (!refresh) {
      const recente = await this.prisma.place_import_runs.findFirst({
        where: { praca_id: pracaId, cache_key: cacheKey, status: 'done', finished_at: { not: null } },
        orderBy: { finished_at: 'desc' },
      });
      if (recente && cacheValido(recente.finished_at, new Date())) return { run: toView(recente, true), nova: false };
    }
    return null;
  }

  private exigirOsm(dto: StartPlaceSearchDto): void {
    if ((dto.source ?? 'osm') !== 'osm') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'source: shoppings e lojas de dentro só pelo mapa aberto (OSM).' });
    }
  }

  private async configShopping(): Promise<ConfigShopping> {
    const s = await this.prisma.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
    const v = s?.field_config;
    return CONFIG_SHOPPING.ler(v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).shopping : undefined);
  }

  /** Lote D (§40.3): `shop=mall` em volta da área (ou do centro da praça), com o polígono. */
  private async startShoppings(dto: StartPlaceSearchDto, user: AuthUser): Promise<{ run: SearchRunView; nova: boolean }> {
    await this.assertPraca(dto.praca_id);
    this.exigirOsm(dto);
    let centro: { lat: number; lng: number };
    let areaId: string | null = null;
    let areaName: string;
    if (dto.area_id) {
      if (!isUuid(dto.area_id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });
      const area = await this.prisma.field_areas.findFirst({ where: { id: dto.area_id, praca_id: dto.praca_id } });
      if (!area) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Área não encontrada.' });
      if (!area.active) throw new ConflictException({ code: 'AREA_INACTIVE', message: 'Esta área está desativada. Ative-a em Configurações.' });
      centro = { lat: area.lat, lng: area.lng };
      areaId = area.id;
      areaName = area.name;
    } else {
      const praca = await this.prisma.pracas.findUnique({ where: { id: dto.praca_id }, select: { name: true, lat: true, lon: true } });
      if (praca?.lat == null || praca.lon == null) {
        throw new UnprocessableEntityException({ code: 'PRACA_SEM_CENTRO', message: 'Esta praça não tem centro no mapa. Escolha uma área.' });
      }
      centro = { lat: praca.lat, lng: praca.lon };
      areaName = praca.name;
    }
    const radius = dto.radius_m ?? RAIO_SHOPPINGS_PADRAO_M;
    const cacheKey = chaveCache({ lat: centro.lat, lng: centro.lng, radius_m: radius, types: [], source: 'osm', kind: 'shoppings' });
    const reuso = await this.reaproveitar(dto.praca_id, cacheKey, dto.refresh);
    if (reuso) return reuso;
    const row = await this.prisma.place_import_runs.create({
      data: {
        praca_id: dto.praca_id,
        area_id: areaId,
        area_name: areaName,
        source: 'osm',
        types: [],
        lat: centro.lat,
        lng: centro.lng,
        radius_m: radius,
        cache_key: cacheKey,
        requested_by: user.id,
        kind: 'shoppings',
      },
    });
    this.enfileirar(row.id);
    return { run: toView(row, false), nova: true };
  }

  /** Lote D (§40.3): lojas dentro de um shopping, com os segmentos ativos como perfil. */
  private async startLojas(dto: StartPlaceSearchDto, user: AuthUser): Promise<{ run: SearchRunView; nova: boolean }> {
    await this.assertPraca(dto.praca_id);
    this.exigirOsm(dto);
    const naoAchado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Shopping não encontrado.' });
    if (!dto.parent_lead_id || !isUuid(dto.parent_lead_id)) throw naoAchado();
    const pai = await this.prisma.leads.findFirst({
      where: { id: dto.parent_lead_id, praca_id: dto.praca_id, place_kind: 'shopping' },
      include: { mall_metrics: true },
    });
    if (!pai) throw naoAchado();
    if (pai.lat == null || pai.lng == null) {
      throw new UnprocessableEntityException({ code: 'PLACE_WITHOUT_LOCATION', message: 'Este shopping não tem localização.' });
    }
    if (!this.segmentos) throw shoppingsDesligado();
    const { types, foto } = await this.segmentos.fotoDaBusca(dto.types);
    const cfg = await this.configShopping();
    const m = pai.mall_metrics;
    // Polígono: o corte por distância precisa alcançar o shopping inteiro (≈ 1,5 × o lado do quadrado de mesma área).
    const radius = m?.geometry_kind === 'poligono' && m.area_m2 ? Math.max(cfg.raio_lojas_m, Math.ceil(1.5 * Math.sqrt(m.area_m2))) : cfg.raio_lojas_m;
    const cacheKey = chaveCache({
      lat: pai.lat,
      lng: pai.lng,
      radius_m: radius,
      types,
      source: 'osm',
      segmentos_hash: hashSegmentos(foto),
      kind: 'lojas',
      parent_lead_id: pai.id,
    });
    const reuso = await this.reaproveitar(dto.praca_id, cacheKey, dto.refresh);
    if (reuso) return reuso;
    const row = await this.prisma.place_import_runs.create({
      data: {
        praca_id: dto.praca_id,
        area_id: null,
        area_name: pai.name,
        source: 'osm',
        types,
        lat: pai.lat,
        lng: pai.lng,
        radius_m: radius,
        cache_key: cacheKey,
        requested_by: user.id,
        kind: 'lojas',
        parent_lead_id: pai.id,
        segments_snapshot: foto as unknown as Prisma.InputJsonValue,
      },
    });
    this.enfileirar(row.id);
    return { run: toView(row, false), nova: true };
  }

  /** Fontes disponíveis neste servidor (a tela esconde o que não funciona e avisa o que é pago). */
  async sources(): Promise<SourceView[]> {
    const usado = await this.apifyUsadoNoMes();
    return [
      { id: 'osm', label: 'OpenStreetMap', available: this.providers.osm.disponivel(), paid: false },
      {
        id: 'apify',
        label: 'Google Maps (Apify)',
        available: this.providers.apify.disponivel(),
        paid: true,
        max_places_per_run: this.limits.apifyMaxPerRun,
        monthly_cap: this.limits.apifyMonthlyCap,
        used_this_month: usado,
        est_cost_usd_per_run: estimarCustoApifyUsd(
          limiteApify({ porBusca: this.limits.apifyMaxPerRun, tetoMensal: this.limits.apifyMonthlyCap, usadoNoMes: usado }),
        ),
      },
    ];
  }

  async list(pracaId: string, user?: AuthUser): Promise<SearchRunView[]> {
    await this.assertPraca(pracaId);
    const rows = await this.prisma.place_import_runs.findMany({
      // Lote D (§40.3): a lista da busca de hoje só mostra as de `lugares` (as de shoppings têm a tela delas).
      // Lote E (§42.3): o gestor vê só as buscas do mapa aberto.
      where: { praca_id: pracaId, ...(this.shoppingsLigado ? { kind: 'lugares' } : {}), ...(soMapaAberto(user) ? { source: 'osm' } : {}) },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    return rows.map((r) => toView(r, false));
  }

  async get(id: string, pracaId: string, user?: AuthUser): Promise<SearchRunView> {
    return toView(this.doGestor(await this.findOrFail(id, pracaId), user), false);
  }

  async cancel(id: string, pracaId: string, user?: AuthUser): Promise<SearchRunView> {
    this.doGestor(await this.findOrFail(id, pracaId), user);
    const { count } = await this.prisma.place_import_runs.updateMany({
      where: { id, praca_id: pracaId, status: { in: ['queued', 'running'] } },
      data: { status: 'cancelled', finished_at: new Date() },
    });
    if (count === 0) {
      throw new ConflictException({ code: 'RUN_NOT_CANCELLABLE', message: 'Esta pesquisa já terminou e não pode ser cancelada.' });
    }
    this.cancelamentos.get(id)?.abort();
    return toView(await this.findOrFail(id, pracaId), false);
  }

  // ── revisão ─────────────────────────────────────────────────
  async candidates(id: string, pracaId: string, user?: AuthUser): Promise<CandidateView[]> {
    const run = this.doGestor(await this.findOrFail(id, pracaId), user);
    const rows = await this.prisma.place_candidates.findMany({
      where: { run_id: run.id },
      orderBy: [{ distance_m: 'asc' }, { name: 'asc' }],
      include: { lead: { select: { name: true } } },
    });
    // Um lead pode ter sido criado depois da busca (cache de 7 dias): recalcula os "novos".
    const novos = rows.filter((r) => r.status === 'novo');
    const leads = await this.leadsParaDedup(this.prisma, pracaId, novos.map(paraLugar));
    return rows.map((r) => {
      if (r.status !== 'novo') return toCandidateView(r);
      const dup = acharLeadDuplicado(paraLugar(r), leads);
      return dup
        ? toCandidateView({ ...r, status: 'duplicado', reason: 'ja_na_praca', lead_id: dup.lead.id, lead: { name: dup.lead.name } })
        : toCandidateView(r);
    });
  }

  /** "Adicionar N como leads": reserva os candidatos e cria os leads numa transação só. */
  async addLeads(id: string, dto: AddPlaceLeadsDto, user: AuthUser): Promise<AddLeadsView> {
    const run = this.doGestor(await this.findOrFail(id, dto.praca_id), user);
    if (run.status !== 'done') {
      throw new ConflictException({ code: 'RUN_NOT_READY', message: 'A pesquisa ainda não terminou.' });
    }
    if (dto.candidate_ids.some((c) => !isUuid(c))) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'candidate_ids: identificador inválido.' });
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => this.adicionar(tx, run, dto, user),
        { timeout: 60_000, maxWait: 20_000 },
      );
    } catch (e) {
      if (violouUnico(e)) throw this.conflitoDeConcorrencia();
      throw e;
    }
  }

  /**
   * O "Adicionar" — o do botão e o do A1 (`automatico`): mesma deduplicação contra os leads de agora e a mesma reserva atômica.
   * No A1 o lote se chama "Busca automática …", o lead fica sem dono e o evento sai com o autor "Automático"; do `user` só se usa o
   * `id` (o `by` do lote = quem pediu a busca).
   */
  private async adicionar(
    tx: Prisma.TransactionClient,
    run: RunRow,
    dto: AddPlaceLeadsDto,
    user: Pick<AuthUser, 'id'>,
    automatico = false,
  ): Promise<AddLeadsView> {
    const rows = await tx.place_candidates.findMany({ where: { run_id: run.id, id: { in: dto.candidate_ids } } });
    const porId = new Map(rows.map((r) => [r.id, r]));
    const skipped: AddLeadsView['skipped'] = [];
    const novos: typeof rows = [];
    for (const cid of dto.candidate_ids) {
      const r = porId.get(cid);
      if (!r) skipped.push({ candidate_id: cid, reason: 'nao_encontrado' });
      else if (r.status === 'novo') novos.push(r);
      else skipped.push({ candidate_id: cid, reason: r.status === 'adicionado' ? 'ja_adicionado' : (r.reason ?? r.status) });
    }

    // Reconfere contra os leads de AGORA (a busca pode ter até 7 dias).
    const leads = await this.leadsParaDedup(tx, run.praca_id, novos.map(paraLugar));
    const elegiveis: typeof rows = [];
    for (const r of novos) {
      const dup = acharLeadDuplicado(paraLugar(r), leads);
      if (dup) {
        skipped.push({ candidate_id: r.id, reason: 'ja_na_praca' });
        await tx.place_candidates.update({
          where: { id: r.id },
          data: { status: 'duplicado', reason: 'ja_na_praca', lead_id: dup.lead.id },
        });
      } else {
        elegiveis.push(r);
      }
    }
    if (elegiveis.length === 0) {
      throw new ConflictException({
        code: 'NOTHING_TO_ADD',
        message: 'Nenhum dos estabelecimentos escolhidos pode ser adicionado (já estão na praça ou já foram adicionados).',
      });
    }

    // Reserva atômica: se outra pessoa adicionou algum no meio, o count não bate e nada é criado.
    const { count } = await tx.place_candidates.updateMany({
      where: { run_id: run.id, id: { in: elegiveis.map((r) => r.id) }, status: 'novo' },
      data: { status: 'adicionado' },
    });
    if (count !== elegiveis.length) throw this.conflitoDeConcorrencia();

    const rotulo = `${automatico ? 'Busca automática' : 'Busca'} ${rotuloDia(todaySp())} · ${run.area_name} (${ROTULO_FONTE[run.source as FonteLugar] ?? run.source})`;
    const criado = await this.imports.criarLeadsDeBusca(
      tx,
      {
        praca_id: run.praca_id,
        file_name: rotulo,
        origem: ORIGEM_LEAD,
        owner_id: dto.owner_id,
        itens: elegiveis.map((r) => ({
          name: r.name,
          address: r.address,
          phone: r.phone,
          site: r.website,
          lat: r.lat,
          lng: r.lng,
          location_precision: r.location_precision,
          source: r.source,
          source_ref: r.source_ref,
          // Lote D (§40.3): o shopping vira lead marcado; a loja de dentro aponta para o shopping. `lugares` = nada novo.
          ...(run.kind === 'shoppings' ? { place_kind: 'shopping' } : {}),
          ...(run.kind === 'lojas' && run.parent_lead_id ? { parent_lead_id: run.parent_lead_id } : {}),
        })),
      },
      user,
      automatico ? { sem_dono: true, autor_label: AUTOR_AUTOMATICO } : undefined,
    );
    const leadPorRef = new Map(criado.leads.map((l) => [l.source_ref, l.lead_id]));
    for (const r of elegiveis) {
      await tx.place_candidates.update({ where: { id: r.id }, data: { lead_id: leadPorRef.get(r.source_ref) } });
    }
    if (run.kind === 'shoppings') {
      const agora = new Date();
      await tx.lead_mall_metrics.createMany({
        data: elegiveis.map((r) => {
          const m = (r.metrics && typeof r.metrics === 'object' ? r.metrics : {}) as Record<string, unknown>;
          const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
          return {
            lead_id: leadPorRef.get(r.source_ref)!,
            source_ref: r.source_ref,
            geometry_kind: m.geometry_kind === 'poligono' ? 'poligono' : 'ponto',
            area_m2: m.geometry_kind === 'poligono' ? num(m.area_m2) : null,
            levels: num(m.levels),
            measured_at: agora,
          };
        }),
        skipDuplicates: true,
      });
    }
    return { batch_id: criado.batch_id, created: elegiveis.length, skipped };
  }

  // ── execução em segundo plano ───────────────────────────────
  private enfileirar(runId: string): void {
    const ac = new AbortController();
    this.cancelamentos.set(runId, ac);
    this.fila = this.fila
      .then(() => this.executar(runId, ac.signal))
      .catch((e: unknown) => this.log.error(`Fila de pesquisa: ${e instanceof Error ? e.name : 'erro'}`))
      .finally(() => {
        this.cancelamentos.delete(runId);
      });
  }

  private async executar(runId: string, signal: AbortSignal): Promise<void> {
    const { count } = await this.prisma.place_import_runs.updateMany({
      where: { id: runId, status: 'queued' },
      data: { status: 'running', started_at: new Date() },
    });
    if (count === 0) return; // cancelada antes de começar
    const run = await this.prisma.place_import_runs.findUniqueOrThrow({ where: { id: runId } });

    try {
      const provider = this.providers[run.source as FonteLugar];
      const limite = await this.limiteDaBusca(run);
      let parcial = false;
      const segmentos = lerFotoSegmentos(run.segments_snapshot);
      const modo = await this.modoDaBusca(run);
      let alvo: 'area' | 'raio' | null = null;
      const lugares = await provider.buscar({
        centro: { lat: run.lat, lng: run.lng },
        raio_m: run.radius_m,
        types: run.types as TipoLugar[],
        ...(segmentos ? { segmentos } : {}),
        ...(modo ? { modo, onAlvo: (t: 'area' | 'raio') => (alvo = t) } : {}),
        limite,
        signal,
        onParcial: () => {
          parcial = true;
        },
        onProgress: (n) => {
          void this.prisma.place_import_runs
            .updateMany({ where: { id: runId, status: 'running' }, data: { found: n } })
            .catch(() => undefined);
        },
      });
      const concluida = await this.concluir(run, lugares, parcial, alvo);
      // A1 (CRM automático, §47): só a busca que ESTA execução concluiu (a do cache de 7 dias não passa por aqui) e só `lugares`.
      // `try` próprio: a busca já está `done`, e nada do A1 pode chegar ao `falhar`.
      if (concluida && this.crm?.auto_leads === true && run.kind === 'lugares') {
        try {
          await this.adicionarSozinho(run.id);
        } catch (e) {
          this.log.error(`A1 da pesquisa ${run.id}: ${e instanceof Error ? e.name : 'erro'}`);
        }
      }
    } catch (e) {
      await this.falhar(run.id, e);
    }
  }

  /**
   * A1 (CRM automático, contrato §47): os achados `novo` de uma busca de `lugares` concluída entram no funil sozinhos, pelo MESMO
   * `adicionar` do botão (deduplicação contra os leads de agora + reserva atômica), sem dono e com autor "Automático"; os de menor
   * `distance_m` primeiro, até `TETO_AUTO_LEADS_POR_BUSCA` (hoje só morde no Apify: a busca OSM já devolve até 300).
   *
   * Uma linha em `crm_automation_runs` por busca (`job = 'auto_leads_busca'`, `ref` = a busca), gravada aqui direto pelo Prisma
   * (`places` não importa `crm/`). Conta: `adicionados` = leads criados; `ja_na_praca` = escolhidos que não viraram lead (já eram
   * lead na praça agora, ou alguém os adicionou no meio); `acima_do_teto` = `novo` que ficaram de fora pelo teto.
   * `NOTHING_TO_ADD` = rodada ok com 0; conflito (a reserva não bate ou o índice único estoura) = rodada com erro `CONFLITO`, e os
   * candidatos continuam `novo` (a transação volta inteira; o "Adicionar" manual segue valendo).
   */
  async adicionarSozinho(runId: string): Promise<void> {
    const run = await this.prisma.place_import_runs.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'done' || run.kind !== 'lugares') return;
    const inicio = new Date();
    const resumo = { adicionados: 0, ja_na_praca: 0, acima_do_teto: 0 };
    let erro: string | null = null;
    try {
      const novos = await this.prisma.place_candidates.findMany({
        where: { run_id: run.id, status: 'novo' },
        orderBy: [{ distance_m: 'asc' }, { name: 'asc' }],
        select: { id: true },
      });
      const escolhidos = novos.slice(0, TETO_AUTO_LEADS_POR_BUSCA).map((c) => c.id);
      resumo.acima_do_teto = novos.length - escolhidos.length;
      if (escolhidos.length > 0) {
        try {
          const r = await this.prisma.$transaction(
            async (tx) => this.adicionar(tx, run, { praca_id: run.praca_id, candidate_ids: escolhidos }, { id: run.requested_by }, true),
            { timeout: 60_000, maxWait: 20_000 },
          );
          resumo.adicionados = r.created;
          resumo.ja_na_praca = escolhidos.length - r.created;
        } catch (e) {
          const code = e instanceof HttpException ? (e.getResponse() as { code?: unknown }).code : undefined;
          if (code === 'NOTHING_TO_ADD') resumo.ja_na_praca = escolhidos.length;
          else if (code === 'CANDIDATES_CHANGED' || violouUnico(e)) erro = 'CONFLITO';
          else throw e;
        }
      }
    } catch (e) {
      // Nunca a mensagem original (pode trazer telefone, SQL ou URL): o código do Prisma ajuda a achar a causa e não carrega dado.
      const code = (e as { code?: unknown } | null)?.code;
      erro = typeof code === 'string' && /^P\d{4}$/.test(code) ? `CRM_ERROR: A rodada falhou (${code}).` : 'CRM_ERROR: A rodada falhou.';
      this.log.error(`A1 da pesquisa ${run.id}: ${e instanceof Error ? e.name : 'erro'}`);
    }
    await this.prisma.crm_automation_runs.create({
      data: {
        job: 'auto_leads_busca',
        ref: run.id,
        started_at: inicio,
        finished_at: new Date(),
        ok: erro === null,
        summary: resumo,
        error: erro,
      },
    });
  }

  /** Lote D (§40.3): o modo do provedor nas buscas de shoppings/lojas; `lugares` = nenhum (a chamada de hoje). */
  private async modoDaBusca(run: RunRow): Promise<BuscaParams['modo'] | undefined> {
    if (run.kind === 'shoppings') return { kind: 'shoppings' };
    if (run.kind !== 'lojas') return undefined;
    const m = run.parent_lead_id ? await this.prisma.lead_mall_metrics.findUnique({ where: { lead_id: run.parent_lead_id } }) : null;
    const cfg = await this.configShopping();
    const reserva = { centro: { lat: run.lat, lng: run.lng }, raio_m: cfg.raio_lojas_m };
    const poligono = m?.geometry_kind === 'poligono' && /^(way|relation)\/[1-9][0-9]*$/.test(m.source_ref);
    return {
      kind: 'lojas',
      alvo: poligono ? { tipo: 'area', source_ref: m!.source_ref } : { tipo: 'raio', centro: reserva.centro, raio_m: reserva.raio_m },
      reserva,
    };
  }

  private async limiteDaBusca(run: RunRow): Promise<number> {
    if (run.source !== 'apify') return MAX_RESULTADOS + 1;
    // O teto é conferido aqui, dentro da fila (uma busca por vez): dois pedidos seguidos não furam o mês.
    const limite = limiteApify({
      porBusca: this.limits.apifyMaxPerRun,
      tetoMensal: this.limits.apifyMonthlyCap,
      usadoNoMes: await this.apifyUsadoNoMes(run.id),
    });
    if (limite === 0) {
      throw new ProviderError('O limite mensal de pesquisas pagas foi atingido. Nada foi cobrado.', 'apify teto mensal');
    }
    // Reserva antes de chamar: cancelar ou estourar o tempo só aborta a nossa requisição, o
    // actor segue rodando (e cobrando) no Apify. O teto mensal conta o reservado, não o devolvido.
    await this.prisma.place_import_runs.updateMany({
      where: { id: run.id, status: 'running' },
      data: { reserved_places: limite },
    });
    return limite;
  }

  /** Lugares reservados no Apify neste mês (Brasília), somando `reserved_places` das buscas que começaram. */
  private async apifyUsadoNoMes(exceto?: string): Promise<number> {
    const inicio = new Date(`${mesDeBrasilia(new Date())}-01T03:00:00.000Z`); // 00:00 em Brasília
    const soma = await this.prisma.place_import_runs.aggregate({
      _sum: { reserved_places: true },
      where: { source: 'apify', ...(exceto ? { id: { not: exceto } } : {}), started_at: { gte: inicio } },
    });
    return soma._sum.reserved_places ?? 0;
  }

  /** Grava os achados e marca `done`; devolve se ESTA chamada concluiu a busca (`false` = foi cancelada no meio). */
  private async concluir(run: RunRow, lugares: LugarNormalizado[], parcial: boolean, alvo: 'area' | 'raio' | null = null): Promise<boolean> {
    const { achados, truncated: passouDoTeto } = classificarAchados(lugares, { lat: run.lat, lng: run.lng }, run.radius_m);

    const truncated = passouDoTeto || parcial;
    const leads = await this.leadsParaDedup(
      this.prisma,
      run.praca_id,
      achados.filter((a) => a.status === 'novo').map((a) => a.lugar),
      { lat: run.lat, lng: run.lng, radius_m: run.radius_m },
    );
    const linhas = achados.map((a) => {
      let status: string = a.status;
      let reason: MotivoAchado | null = a.reason;
      let leadId: string | null = null;
      if (a.status === 'novo') {
        const dup = acharLeadDuplicado(a.lugar, leads);
        if (dup) {
          status = 'duplicado';
          reason = 'ja_na_praca';
          leadId = dup.lead.id;
        }
      }
      const l = a.lugar;
      return {
        run_id: run.id,
        source: l.source,
        source_ref: l.source_ref,
        name: l.name,
        category: l.category,
        address: l.address,
        lat: l.lat,
        lng: l.lng,
        location_precision: l.location_precision,
        phone: l.phone,
        website: l.website,
        distance_m: a.distance_m,
        status,
        reason,
        lead_id: leadId,
        ...(l.metrics ? { metrics: l.metrics as Prisma.InputJsonValue } : {}),
      };
    });
    // A chave única do banco é (run, fonte, ref): a repetição exata da mesma ref na resposta não é gravada duas vezes.
    const vistos = new Set<string>();
    const unicas = linhas.filter((l) => {
      const k = `${l.source}:${l.source_ref}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    const conta = (s: string) => unicas.filter((l) => l.status === s).length;

    return this.prisma.$transaction(async (tx) => {
      // Cancelada no meio? `status = running` no filtro: o cancelamento vence e nada é gravado.
      const { count } = await tx.place_import_runs.updateMany({
        where: { id: run.id, status: 'running' },
        data: {
          status: 'done',
          found: unicas.length,
          novos: conta('novo'),
          duplicados: conta('duplicado'),
          descartados: conta('descartado'),
          truncated,
          est_cost_usd: run.source === 'apify' ? estimarCustoApifyUsd(lugares.length) : 0,
          finished_at: new Date(),
          error: null,
        },
      });
      if (count === 0) return false;
      await tx.place_candidates.createMany({ data: unicas });
      // Lote D (§40.3): busca dentro do polígono = quantas lojas o mapa aberto tem no shopping.
      if (run.kind === 'lojas' && alvo === 'area' && run.parent_lead_id) {
        await tx.lead_mall_metrics.updateMany({ where: { lead_id: run.parent_lead_id }, data: { pois_mapped: unicas.length, measured_at: new Date() } });
      }
      return true;
    });
  }

  private async falhar(runId: string, e: unknown): Promise<void> {
    if (e instanceof BuscaCancelada) return; // o cancelamento já gravou o status
    let mensagem = MSG_GENERICA;
    if (e instanceof ProviderError) {
      mensagem = e.userMessage;
      this.log.warn(`Pesquisa ${runId}: ${e.detalhe}`);
    } else {
      this.log.error(`Pesquisa ${runId}: ${e instanceof Error ? e.name : 'erro'}`);
    }
    await this.prisma.place_import_runs.updateMany({
      where: { id: runId, status: 'running' },
      data: { status: 'error', error: mensagem, finished_at: new Date() },
    });
  }

  // ── internos ────────────────────────────────────────────────
  /**
   * Leads que podem ser a mesma coisa que os lugares: da própria praça (nome+endereço),
   * com o mesmo telefone (qualquer praça), com o mesmo id externo (qualquer praça, até arquivado) ou com coordenada perto
   * (caixa dos lugares + 100 m). A regra de decisão é `acharLeadDuplicado`.
   */
  private async leadsParaDedup(
    db: Db,
    pracaId: string,
    lugares: LugarNormalizado[],
    area?: { lat: number; lng: number; radius_m: number },
  ): Promise<LeadParaDedup[]> {
    if (lugares.length === 0) return [];
    const telefones = [...new Set(lugares.map((l) => phoneKey(l.phone)).filter((k) => k.length >= 8))];
    const refs = lugares.map((l) => l.source_ref);
    const caixa = area
      ? caixaEnvolvente(area, area.radius_m + RAIO_DUPLICADO_M)
      : {
          latMin: Math.min(...lugares.map((l) => l.lat)) - 0.001,
          latMax: Math.max(...lugares.map((l) => l.lat)) + 0.001,
          lngMin: Math.min(...lugares.map((l) => l.lng)) - 0.001,
          lngMax: Math.max(...lugares.map((l) => l.lng)) + 0.001,
        };
    const rows = await db.leads.findMany({
      where: {
        OR: [
          { archived: false, praca_id: pracaId },
          ...(telefones.length ? [{ archived: false, phone_key: { in: telefones } }] : []),
          // Sem filtro de arquivado: o UNIQUE (source, source_ref) vale para arquivado também;
          // lead arquivado deste ponto tem que contar, senão todo "adicionar" estoura no banco.
          { source_ref: { in: refs } },
          { archived: false, lat: { gte: caixa.latMin, lte: caixa.latMax }, lng: { gte: caixa.lngMin, lte: caixa.lngMax } },
        ],
      },
      select: { id: true, name: true, address: true, phone: true, lat: true, lng: true, source: true, source_ref: true },
    });
    return rows;
  }

  private async assertPraca(pracaId: string): Promise<void> {
    if (!isUuid(pracaId)) throw pracaNaoEncontrada();
    const praca = await this.prisma.pracas.findUnique({ where: { id: pracaId }, select: { id: true } });
    if (!praca) throw pracaNaoEncontrada();
  }

  /** Lote E §42.3: uma busca paga (Apify) não é do gestor — nem abrir, nem cancelar, nem adicionar. */
  private doGestor<T extends { source: string }>(run: T, user?: AuthUser): T {
    if (soMapaAberto(user) && run.source !== 'osm') throw apifySoAdmin();
    return run;
  }

  private async findOrFail(id: string, pracaId: string): Promise<RunRow> {
    if (!isUuid(id) || !isUuid(pracaId)) throw naoEncontrada();
    const row = await this.prisma.place_import_runs.findFirst({ where: { id, praca_id: pracaId } });
    if (!row) throw naoEncontrada();
    return row;
  }

  private conflitoDeConcorrencia() {
    return new ConflictException({
      code: 'CANDIDATES_CHANGED',
      message: 'Outra pessoa acabou de adicionar alguns destes estabelecimentos. Atualize a lista e tente de novo.',
    });
  }
}

function paraLugar(r: CandidateRow): LugarNormalizado {
  return {
    name: r.name,
    category: r.category,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    location_precision: 'point',
    phone: r.phone,
    website: r.website,
    source: r.source as FonteLugar,
    source_ref: r.source_ref,
    closed: false,
  };
}

function toView(r: RunRow, cached: boolean): SearchRunView {
  return {
    id: r.id,
    praca_id: r.praca_id,
    area_id: r.area_id,
    area_name: r.area_name,
    source: r.source,
    types: r.types,
    center: { lat: r.lat, lng: r.lng },
    radius_m: r.radius_m,
    status: r.status,
    found: r.found,
    novos: r.novos,
    duplicados: r.duplicados,
    descartados: r.descartados,
    truncated: r.truncated,
    est_cost_usd: r.est_cost_usd,
    error: r.error,
    cached,
    requested_by: r.requested_by,
    created_at: r.created_at.toISOString(),
    started_at: r.started_at?.toISOString() ?? null,
    finished_at: r.finished_at?.toISOString() ?? null,
    expires_at: r.status === 'done' && r.finished_at ? fimDoCache(r.finished_at).toISOString() : null,
    ...(r.kind && r.kind !== 'lugares' ? { kind: r.kind, parent_lead_id: r.parent_lead_id ?? null } : {}),
  };
}

function toCandidateView(r: CandidateRow): CandidateView {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    location_precision: r.location_precision,
    distance_m: r.distance_m,
    phone: r.phone,
    website: r.website,
    source: r.source,
    status: r.status,
    reason: r.reason,
    lead_id: r.lead_id,
    lead_name: r.lead?.name ?? null,
    selectable: r.status === 'novo',
    ...(r.metrics && typeof r.metrics === 'object' ? { metrics: r.metrics as Record<string, unknown> } : {}),
  };
}

/** `2026-10-19` → `19/10`. */
function rotuloDia(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

