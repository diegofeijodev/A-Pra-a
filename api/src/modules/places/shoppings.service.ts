import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { CONFIG_SHOPPING, CRITERIOS_SHOPPING, ehGrande, type ConfigShopping, type MetricasShopping } from '../../domain/shopping-rules';
import { LOVABLE_D_FLAGS, type FlagsLovableD } from '../rotas/rotas.tokens';

export class ShoppingsQueryDto {
  @IsUUID() praca_id!: string;
}

/** `PATCH /v1/consultores/shoppings/:lead_id` (§40.4): `null` = volta ao critério. */
export class MarcarShoppingDto {
  @ValidateIf((_o, v) => v !== null)
  @IsBoolean()
  large_override!: boolean | null;
}

/** `PUT /v1/consultores/shoppings/config` (§40.2): parcial; `null` = ausente; a faixa é conferida no domínio. */
export class ConfigShoppingDto {
  @IsOptional() @IsIn([...CRITERIOS_SHOPPING]) criterio?: string | null;
  @IsOptional() @IsInt() @Min(1000) @Max(1_000_000) area_min_m2?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1000) lojas_min?: number | null;
  @IsOptional() @IsInt() @Min(50) @Max(2000) raio_lojas_m?: number | null;
  @IsOptional() @IsBoolean() fora_da_rota_geral?: boolean | null;
}

export interface ShoppingView {
  lead_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  source_ref: string | null;
  geometry_kind: string;
  area_m2: number | null;
  levels: number | null;
  pois_mapped: number | null;
  large_override: boolean | null;
  is_large: boolean;
  por: 'manual' | 'criterio';
  conta: string;
  stores: number;
  measured_at: string | null;
}

const desligado = () => new NotFoundException({ code: 'MALLS_DISABLED', message: 'Os shoppings não estão ligados neste servidor.' });
const naoAchado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Shopping não encontrado.' });

const COM_METRICAS = { mall_metrics: true, _count: { select: { stores: { where: { archived: false } } } } } as const;
type LinhaShopping = Prisma.leadsGetPayload<{ include: typeof COM_METRICAS }>;

/** Shoppings da praça com o critério de "grande" e a marcação à mão (contrato §40.2, §40.4). Só com `FIELD_MALLS_ENABLED`. */
@Injectable()
export class ShoppingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(LOVABLE_D_FLAGS) private readonly flags?: FlagsLovableD,
  ) {}

  get ligado(): boolean {
    return this.flags?.malls === true;
  }

  private exigir(): void {
    if (!this.ligado) throw desligado();
  }

  private async bruto(): Promise<Record<string, unknown>> {
    const s = await this.prisma.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
    const v = s?.field_config;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  async config(): Promise<ConfigShopping> {
    this.exigir();
    return CONFIG_SHOPPING.ler((await this.bruto()).shopping);
  }

  async salvarConfig(dto: ConfigShoppingDto): Promise<ConfigShopping> {
    this.exigir();
    const parcial = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined && v !== null));
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
      const raw = s?.field_config && typeof s.field_config === 'object' && !Array.isArray(s.field_config) ? (s.field_config as Record<string, unknown>) : {};
      const r = CONFIG_SHOPPING.aplicar(CONFIG_SHOPPING.ler(raw.shopping), parcial);
      if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
      // Preserva as chaves das outras fases (`field_config` é um JSON só).
      const novo = { ...raw, shopping: { ...r.config } } as Prisma.InputJsonValue;
      await tx.app_settings.upsert({ where: { id: 1 }, update: { field_config: novo }, create: { id: 1, field_config: novo } });
      return r.config;
    });
  }

  async list(q: ShoppingsQueryDto): Promise<{ config: ConfigShopping; shoppings: ShoppingView[] }> {
    this.exigir();
    const praca = await this.prisma.pracas.findUnique({ where: { id: q.praca_id }, select: { id: true } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const config = CONFIG_SHOPPING.ler((await this.bruto()).shopping);
    const linhas = await this.prisma.leads.findMany({
      where: { praca_id: q.praca_id, place_kind: 'shopping', archived: false },
      include: COM_METRICAS,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const views = linhas.map((l) => viewDe(l, config));
    views.sort((a, b) => Number(b.is_large) - Number(a.is_large) || (b.area_m2 ?? -1) - (a.area_m2 ?? -1) || a.name.localeCompare(b.name, 'pt-BR'));
    return { config, shoppings: views };
  }

  async marcar(leadId: string, dto: MarcarShoppingDto, user: AuthUser, agora = new Date()): Promise<ShoppingView> {
    this.exigir();
    if (!isUuid(leadId)) throw naoAchado();
    const lead = await this.prisma.leads.findFirst({ where: { id: leadId, place_kind: 'shopping' }, select: { id: true, source_ref: true } });
    if (!lead) throw naoAchado();
    await this.prisma.lead_mall_metrics.upsert({
      where: { lead_id: lead.id },
      update: { large_override: dto.large_override, updated_by: user.id },
      // Shopping sem métrica (cadastrado à mão como shopping): fica como ponto, sem área.
      create: { lead_id: lead.id, source_ref: lead.source_ref ?? '', geometry_kind: 'ponto', measured_at: agora, large_override: dto.large_override, updated_by: user.id },
    });
    const l = await this.prisma.leads.findUniqueOrThrow({ where: { id: lead.id }, include: COM_METRICAS });
    return viewDe(l, CONFIG_SHOPPING.ler((await this.bruto()).shopping));
  }
}

function viewDe(l: LinhaShopping, cfg: ConfigShopping): ShoppingView {
  const m = l.mall_metrics;
  const met: MetricasShopping = {
    geometry_kind: m?.geometry_kind === 'poligono' ? 'poligono' : 'ponto',
    area_m2: m?.area_m2 ?? null,
    levels: m?.levels ?? null,
    pois_mapped: m?.pois_mapped ?? null,
    large_override: m?.large_override ?? null,
  };
  const g = ehGrande(met, cfg);
  return {
    lead_id: l.id,
    name: l.name,
    address: l.address,
    lat: l.lat,
    lng: l.lng,
    source_ref: m?.source_ref ?? l.source_ref ?? null,
    geometry_kind: met.geometry_kind,
    area_m2: met.area_m2,
    levels: met.levels,
    pois_mapped: met.pois_mapped,
    large_override: met.large_override,
    is_large: g.grande,
    por: g.por,
    conta: g.conta,
    stores: l._count.stores,
    measured_at: m?.measured_at.toISOString() ?? null,
  };
}
