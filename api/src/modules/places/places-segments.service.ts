import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import {
  LIMITES_SEGMENTOS,
  lerSegmentos,
  segmentosDaBusca,
  validarSegmentos,
  type Segmento,
} from '../../domain/segmentos-rules';
import { LOVABLE_C_FLAGS, type FlagsLovableC } from '../rotas/rotas.tokens';

export interface SegmentosView {
  segments: Segmento[];
  is_default: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

const desligado = () =>
  new NotFoundException({
    code: 'SEGMENTS_DISABLED',
    message: 'Os segmentos editáveis da busca não estão ligados neste servidor.',
  });

/**
 * Segmentos editáveis da busca (contrato §36). Só com `FIELD_SEGMENTS_ENABLED`. Guardados em `app_settings.place_segments`
 * (nulo = padrão do código). Também é a porta dos segmentos para a busca de lojas de shopping (§40, fase L8).
 */
@Injectable()
export class PlacesSegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(LOVABLE_C_FLAGS) private readonly flags?: FlagsLovableC,
  ) {}

  get ligado(): boolean {
    return this.flags?.segments === true;
  }

  private async bruto(): Promise<unknown> {
    const s = await this.prisma.app_settings.findUnique({
      where: { id: 1 },
      select: { place_segments: true },
    });
    return s?.place_segments ?? null;
  }

  async view(): Promise<SegmentosView> {
    if (!this.ligado) throw desligado();
    const raw = await this.bruto();
    const { segmentos, is_default } = lerSegmentos(raw);
    const meta = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      segments: segmentos,
      is_default,
      updated_at: !is_default && typeof meta.atualizado_em === 'string' ? meta.atualizado_em : null,
      updated_by: !is_default && typeof meta.atualizado_por === 'string' ? meta.atualizado_por : null,
    };
  }

  /** A lista inteira; nenhum slug que já existe (inclusive os padrão) pode sumir — só desativar. */
  async salvar(lista: unknown[], user: AuthUser, agora = new Date()): Promise<SegmentosView> {
    if (!this.ligado) throw desligado();
    const atuais = lerSegmentos(await this.bruto()).segmentos;
    const r = validarSegmentos(
      lista,
      atuais.map((s) => s.slug),
    );
    if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
    const gravar = { segments: r.segmentos, atualizado_por: user.id, atualizado_em: agora.toISOString() };
    await this.prisma.app_settings.upsert({
      where: { id: 1 },
      update: { place_segments: gravar as unknown as Prisma.InputJsonValue },
      create: { id: 1, place_segments: gravar as unknown as Prisma.InputJsonValue },
    });
    return this.view();
  }

  /** Segmentos ativos agora (a busca valida os `types` contra eles). */
  async ativos(): Promise<Segmento[]> {
    return lerSegmentos(await this.bruto()).segmentos.filter((s) => s.active);
  }

  /**
   * `types` da busca com a flag ligada: 1–10 slugs sem repetir, todos de segmentos ATIVOS. Devolve os slugs ordenados (a ordem
   * da consulta de hoje) e a foto das definições.
   */
  async fotoDaBusca(types: unknown): Promise<{ types: string[]; foto: Segmento[] }> {
    const max = LIMITES_SEGMENTOS.porBusca;
    if (
      !Array.isArray(types) ||
      types.length < 1 ||
      types.length > max ||
      types.some((t) => typeof t !== 'string')
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `types: escolha de 1 a ${max} segmentos.`,
      });
    }
    if (new Set(types).size !== types.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'types: cada segmento só uma vez.',
      });
    }
    const ativos = await this.ativos();
    const fora = (types as string[]).find((t) => !ativos.some((s) => s.slug === t));
    if (fora !== undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `types: '${fora.slice(0, 40)}' não é um segmento ativo da busca.`,
      });
    }
    const ordenados = [...(types as string[])].sort();
    return { types: ordenados, foto: segmentosDaBusca(ativos, ordenados) };
  }
}
