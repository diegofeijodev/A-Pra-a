/**
 * Campanhas **automáticas** do Freela (os "templates") vistas pelo Praça —
 * §7.7. Aqui o Praça é quase só uma tela: quem guarda a campanha automática é
 * o Freela, e o único dado nosso é o vínculo praça ↔ campanha
 * (`freela_templates`), que existe para a tela conseguir filtrar "desta praça".
 *
 * Por isso a leitura devolve o objeto do Freela **como ele veio** (camelCase),
 * com um `praca_id` a mais: espelhar campo a campo em snake_case criaria uma
 * segunda definição de campanha automática para manter sincronizada com a de
 * lá a cada mudança do Freela. A escrita, essa sim, é snake_case (o DTO) e
 * traduz aqui.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { CreateFreelaTemplateDto, FreelaTemplateBodyDto, UpdateFreelaTemplateDto } from './dto/freela.dto';
import { FreelaClient, type FreelaMultipart } from './freela-client';

/** Raiz das campanhas automáticas no Freela. */
export const TEMPLATES_PATH = '/v1/admins/campaign-templates';

/** Imagem do push: o Freela aceita estes três tipos, até 5 MB. */
export const IMAGENS_ACEITAS = ['image/png', 'image/jpeg', 'image/webp'];

/** Campanha automática do Freela + o vínculo com a praça do Praça. */
export type FreelaTemplateView = Record<string, unknown> & { praca_id: string | null };

@Injectable()
export class FreelaTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FreelaClient,
  ) {}

  /** Lista do Freela com o vínculo local; `praca_id` filtra "desta praça". */
  async list(pracaId?: string): Promise<FreelaTemplateView[]> {
    const r = await this.client.request<unknown>('GET', TEMPLATES_PATH);
    const lista = this.listaDe(r.data);
    const vinculos = await this.vinculos();
    const out = lista.map((t) => this.comVinculo(t, vinculos));
    return pracaId ? out.filter((t) => t.praca_id === pracaId) : out;
  }

  async get(id: string): Promise<FreelaTemplateView> {
    this.idOrFail(id);
    const r = await this.client.request<Record<string, unknown>>(
      'GET',
      `${TEMPLATES_PATH}/${encodeURIComponent(id)}`,
    );
    if (!r.data)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campanha automática não encontrada.' });
    return this.comVinculo(r.data, await this.vinculos());
  }

  /**
   * Cria no Freela e guarda o vínculo com a praça. A campanha nasce
   * **desligada** lá (`enabled: false`): quem liga é `PATCH /:id/enabled`,
   * depois de a pessoa conferir o texto e o público.
   */
  async create(dto: CreateFreelaTemplateDto, user: AuthUser): Promise<FreelaTemplateView> {
    await this.pracaOrFail(dto.praca_id);
    const r = await this.client.request<Record<string, unknown>>('POST', TEMPLATES_PATH, this.toBody(dto));
    const id = this.idDe(r.data);
    await this.prisma.freela_templates.upsert({
      where: { freela_id: id },
      create: { freela_id: id, praca_id: dto.praca_id, created_by: user.id },
      update: { praca_id: dto.praca_id },
    });
    return this.comVinculo(r.data ?? {}, await this.vinculos());
  }

  /** `PUT` substitui a campanha inteira lá; aqui só o vínculo pode mudar. */
  async update(id: string, dto: UpdateFreelaTemplateDto, user: AuthUser): Promise<FreelaTemplateView> {
    this.idOrFail(id);
    if (dto.praca_id) await this.pracaOrFail(dto.praca_id);
    const r = await this.client.request<Record<string, unknown>>(
      'PUT',
      `${TEMPLATES_PATH}/${encodeURIComponent(id)}`,
      this.toBody(dto),
    );
    if (dto.praca_id) {
      await this.prisma.freela_templates.upsert({
        where: { freela_id: id },
        create: { freela_id: id, praca_id: dto.praca_id, created_by: user.id },
        update: { praca_id: dto.praca_id },
      });
    }
    return this.comVinculo(r.data ?? {}, await this.vinculos());
  }

  async setEnabled(id: string, enabled: boolean): Promise<FreelaTemplateView> {
    this.idOrFail(id);
    const r = await this.client.request<Record<string, unknown>>(
      'PATCH',
      `${TEMPLATES_PATH}/${encodeURIComponent(id)}/enabled`,
      { enabled },
    );
    return this.comVinculo(r.data ?? {}, await this.vinculos());
  }

  /**
   * Imagem do push. O arquivo **passa** pelo Praça (não vai direto do
   * navegador para o Freela) porque quem tem a credencial de admin do Freela é
   * a API, não a tela.
   */
  async uploadImage(file: FreelaMultipart): Promise<unknown> {
    if (!IMAGENS_ACEITAS.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'A imagem precisa ser PNG, JPEG ou WEBP.',
      });
    }
    const r = await this.client.request<unknown>('POST', `${TEMPLATES_PATH}/upload`, undefined, file);
    return r.data;
  }

  // ── internos ────────────────────────────────────────────────
  /** DTO snake_case do Praça → corpo camelCase do Freela. */
  private toBody(dto: FreelaTemplateBodyDto): Record<string, unknown> {
    const p = dto.pacing;
    // Chave com `undefined` some no `JSON.stringify`, então o Freela recebe só
    // o que a tela mandou (o `forbidNonWhitelisted` de lá não reclama).
    return {
      name: dto.name,
      scheduleKind: dto.schedule_kind,
      weekdays: dto.weekdays,
      sendHour: dto.send_hour,
      targetMonth: dto.target_month,
      targetDay: dto.target_day,
      targetYear: dto.target_year,
      leadDays: dto.lead_days,
      audience: dto.audience,
      audienceFilters: dto.filters,
      channels: dto.channels,
      whatsappTemplate: dto.whatsapp_template,
      pushTitle: dto.push_title,
      pushBody: dto.push_body,
      imageKey: dto.image_key,
      deepLink: dto.deep_link,
      messagesPerHour: p?.messages_per_hour,
      dailyCap: p?.daily_cap,
      windowStartHour: p?.window_start_hour,
      windowEndHour: p?.window_end_hour,
      weekdaysOnly: p?.weekdays_only,
      maxPerRun: dto.max_per_run,
    };
  }

  private async vinculos(): Promise<Map<string, string | null>> {
    const rows = await this.prisma.freela_templates.findMany({
      select: { freela_id: true, praca_id: true },
    });
    return new Map(rows.map((r) => [r.freela_id, r.praca_id]));
  }

  private comVinculo(t: unknown, vinculos: Map<string, string | null>): FreelaTemplateView {
    const obj = (typeof t === 'object' && t !== null ? t : {}) as Record<string, unknown>;
    const id = obj.id === undefined || obj.id === null ? '' : String(obj.id);
    return { ...obj, praca_id: vinculos.get(id) ?? null };
  }

  /** `data` pode vir como lista ou como `{items}` — aceita os dois. */
  private listaDe(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    const itens = (data as { items?: unknown } | null)?.items;
    return Array.isArray(itens) ? itens : [];
  }

  private idDe(data: unknown): string {
    const id = (data as { id?: unknown } | null)?.id;
    if (id === undefined || id === null || String(id) === '') {
      throw new BadRequestException({
        code: 'FREELA_ERROR',
        message: 'O Freela não devolveu o id da campanha automática criada.',
      });
    }
    return String(id);
  }

  /**
   * `:id` é o id do Freela, e lá `campaign_templates.id` é UUID. Barrar aqui
   * evita repassar lixo da URL (e tomar 500 do outro lado) por um 404 nosso.
   */
  private idOrFail(id: string): void {
    if (!isUuid(id)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campanha automática não encontrada.' });
    }
  }

  private async pracaOrFail(id: string): Promise<void> {
    const p = await this.prisma.pracas.findUnique({ where: { id }, select: { id: true } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
  }
}
