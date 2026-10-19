import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { aplicarConfigRota, lerConfigRota, type ConfigRota } from '../../domain/rota-rules';
import type { ConfigRotaDto } from './dto/rotas.dto';

export interface ConfigView extends ConfigRota {
  atualizado_por: string | null;
  atualizado_em: string | null;
}

/** Parâmetros de negócio do roteiro em `app_settings.field_config` (contrato §23.1). */
@Injectable()
export class RotasConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private async bruto(): Promise<Record<string, unknown>> {
    const s = await this.prisma.app_settings.findUnique({ where: { id: 1 }, select: { field_config: true } });
    const v = s?.field_config;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  /** Configuração válida (padrão onde faltar). Usada por quem monta roteiros. */
  async config(): Promise<ConfigRota> {
    return lerConfigRota(await this.bruto());
  }

  async view(): Promise<ConfigView> {
    const raw = await this.bruto();
    return {
      ...lerConfigRota(raw),
      atualizado_por: typeof raw.atualizado_por === 'string' ? raw.atualizado_por : null,
      atualizado_em: typeof raw.atualizado_em === 'string' ? raw.atualizado_em : null,
    };
  }

  async atualizar(dto: ConfigRotaDto, user: AuthUser, agora = new Date()): Promise<ConfigView> {
    const raw = await this.bruto();
    const parcial = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    const r = aplicarConfigRota(lerConfigRota(raw), parcial);
    if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
    // Preserva as chaves de outras fases (F5) que já estejam no JSON.
    const novo = { ...raw, ...r.config, atualizado_por: user.id, atualizado_em: agora.toISOString() };
    await this.prisma.app_settings.upsert({
      where: { id: 1 },
      update: { field_config: novo as Prisma.InputJsonValue },
      create: { id: 1, field_config: novo as Prisma.InputJsonValue },
    });
    return this.view();
  }
}
