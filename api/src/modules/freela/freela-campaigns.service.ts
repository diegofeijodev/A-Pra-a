/**
 * Campanhas normais (de ativação) do Freela vistas pelo Praça — §7.3 e §7.6.
 *
 * Três caminhos chegam aqui e todos terminam numa campanha do Freela:
 *
 * - **disparo do funil em modo `freela`** — o outbox chama `createFromLeads`
 *   com os leads da fila (`EXTERNAL_LIST`);
 * - **campanha para a base do Freela** — `createForBase`, público do próprio
 *   Freela recortado pela cobertura da praça;
 * - **lista do funil do Praça** — `create` com `audience: 'EXTERNAL_LIST'` e o
 *   filtro do funil.
 *
 * `freela_campaigns` é **espelho**, não fonte da verdade: quem manda no status
 * e nas contagens é o Freela, e a sincronização (§7.6) copia de lá para cá. Por
 * isso toda leitura mostra `last_synced_at` — a tela precisa dizer de quando é
 * o número que está na frente do operador.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { toE164BR } from '../../common/phone/phone';
import type { SendMode } from '../../domain/catalog/messages';
import type { SendSettings } from '../../domain/send-schedule';
import type { RenderPraca } from '../../domain/template-render';
import { DisparosService } from '../disparos/disparos.service';
import { MessagesService, type SettingsView } from '../messages/messages.service';
import {
  AudiencePreviewDto,
  CreateFreelaCampaignDto,
  FreelaPacingDto,
  type FreelaCampaignKind,
} from './dto/freela.dto';
import { FreelaClient } from './freela-client';
import { pracaCidade, toFreelaPacing, toFreelaTemplate, type FreelaPacing } from './freela-template';

/** Raiz das campanhas de ativação no Freela. */
export const CAMPAIGNS_PATH = '/v1/admins/activation-campaigns';

/** Status em que a campanha parou de andar — não vale mais sincronizar. */
const TERMINAIS = ['COMPLETED', 'CANCELLED'];

/**
 * Campanhas que o **outbox** cria: nascem sempre com `start` pedido (a fila do
 * Praça já venceu, não há "criar para começar depois"). Se o espelho de uma
 * dessas está em `DRAFT`, o `start` falhou na criação e precisa ser tentado de
 * novo — as de tela (`base`/`manual`) podem estar em `DRAFT` porque alguém
 * pediu `start_now: false`, e forçar o início delas seria disparar sem ordem.
 */
const KINDS_COM_START = ['disparo', 'cadencia'];

/** Idade máxima do espelho antes de a leitura sincronizar de novo. */
const FRESCOR_MS = 60_000;

/** Quantas campanhas velhas uma leitura sincroniza antes de responder. */
const SYNC_ON_READ_MAX = 5;

/** Teto de contatos por campanha no Freela (`contacts` ≤ 5.000). */
export const MAX_CONTATOS = 5000;

/** Motivo gravado no envio quando o telefone não vira WhatsApp. */
export const TELEFONE_INVALIDO = 'Telefone inválido para WhatsApp.';

/** Motivo do envio que repetiu o telefone de outro lead do mesmo lote. */
export const TELEFONE_REPETIDO = 'Telefone repetido no lote.';

export interface FreelaCampaignView {
  id: string;
  freela_id: string;
  name: string;
  kind: string;
  praca_id: string | null;
  disparo_id: string | null;
  audience: string;
  audience_filters: unknown;
  status: string;
  stats: unknown;
  created_by: string;
  created_at: string;
  last_synced_at: string | null;
}

export interface FreelaStatusView {
  configured: boolean;
  reachable: boolean;
  admin_email: string | null;
  /** `meta.schedulerEnabled` do Freela: com ele desligado, nada sai de lá. */
  scheduler_enabled: boolean | null;
  per_contact_message: boolean;
  last_sync_at: string | null;
  /** Por que não deu para falar com o Freela (null quando deu). */
  error: string | null;
}

/** Um lead do Praça no recorte que vira contato de campanha. */
export interface FreelaLeadContact {
  id: string;
  name: string;
  decisor: string;
  phone: string;
  city: string;
  /** Texto já renderizado para ESTE lead (só sobe com a extensão §7.5). */
  text: string;
}

export interface CreateFromLeadsArgs {
  name: string;
  praca_id: string | null;
  disparo_id?: string | null;
  kind: FreelaCampaignKind;
  leads: FreelaLeadContact[];
  template: string;
  pacing: FreelaPacing;
  start_now: boolean;
  created_by: string;
  /** `msg_sends` que passam a apontar para a campanha, no mesmo commit. */
  link_send_ids?: string[];
}

export interface CreateFromLeadsResult {
  /** `null` quando nenhum contato tinha telefone válido: nada foi criado. */
  freela_id: string | null;
  recipients_count: number;
  invalid_phones: number;
  invalid_lead_ids: string[];
  /** Leads descartados por repetirem o telefone de outro lead do lote. */
  duplicate_lead_ids: string[];
  /** Motivo de a campanha ter nascido e não ter começado (`start_now`). */
  start_error: string | null;
}

export interface CreateForBaseArgs {
  name: string;
  praca_id: string | null;
  audience: string;
  filters: Record<string, unknown> | undefined;
  template: string;
  pacing: FreelaPacing;
  start_now: boolean;
  created_by: string;
}

/** Linha de `freela_campaigns` como sai do Prisma. */
interface CampaignRow {
  id: string;
  freela_id: string;
  name: string;
  kind: string;
  praca_id: string | null;
  disparo_id: string | null;
  audience: string;
  audience_filters: Prisma.JsonValue;
  status: string;
  stats: Prisma.JsonValue;
  created_by: string;
  created_at: Date;
  last_synced_at: Date | null;
}

/** A praça da campanha: o que o render precisa dela. */
interface PracaCtx {
  praca: RenderPraca;
  /** Cidade-sede, para o `{{cidade}}` do Freela (§18.3). */
  cidade: string | undefined;
}

/**
 * Um destinatário da campanha, no recorte que a sincronização usa.
 *
 * O campo do telefone é **`phone`**: o Freela devolve
 * `COALESCE(external_phone, users.phone, destination) AS phone`
 * (`activation-campaign.service.ts` → `RecipientView`). `externalPhone` e
 * `destination` ficam aceitos só por defesa — nenhuma versão da API expõe os
 * dois hoje.
 */
interface Recipient {
  id?: string;
  status?: string;
  phone?: string | null;
  externalPhone?: string | null;
  destination?: string | null;
  sentAt?: string | null;
  failureReason?: string | null;
}

@Injectable()
export class FreelaCampaignsService {
  private readonly log = new Logger(FreelaCampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FreelaClient,
    private readonly disparos: DisparosService,
    private readonly messages: MessagesService,
  ) {}

  // ── conexão ─────────────────────────────────────────────────
  /**
   * Tela **Freela → Conexão**. É a ÚNICA rota `/v1/freela/*` que responde 200
   * sem o Freela configurado: é ela que explica por que as outras não
   * respondem, então não pode responder 503.
   */
  async status(): Promise<FreelaStatusView> {
    const per_contact_message = this.client.perContactMessage();
    if (!this.client.isConfigured()) {
      return {
        configured: false,
        reachable: false,
        admin_email: null,
        scheduler_enabled: null,
        per_contact_message,
        last_sync_at: null,
        error: null,
      };
    }

    let reachable = false;
    let scheduler_enabled: boolean | null = null;
    let error: string | null = null;
    try {
      const r = await this.client.request<unknown[]>('GET', CAMPAIGNS_PATH);
      reachable = true;
      const flag = r.meta?.schedulerEnabled;
      scheduler_enabled = typeof flag === 'boolean' ? flag : null;
    } catch (e) {
      // Nunca lança: a tela de conexão existe justamente para mostrar o erro.
      error = this.motivo(e);
    }

    const ultima = await this.prisma.freela_campaigns.aggregate({ _max: { last_synced_at: true } });
    return {
      configured: true,
      reachable,
      admin_email: this.client.adminEmail(),
      scheduler_enabled,
      per_contact_message,
      last_sync_at: ultima._max.last_synced_at?.toISOString() ?? null,
      error,
    };
  }

  // ── público do Freela ───────────────────────────────────────
  async audienceOptions(audience: string): Promise<unknown> {
    const q = new URLSearchParams({ audience }).toString();
    return (await this.client.request('GET', `${CAMPAIGNS_PATH}/audience-options?${q}`)).data;
  }

  async audiencePreview(dto: AudiencePreviewDto): Promise<unknown> {
    const body = { audience: dto.audience, ...(dto.filters ? { filters: dto.filters } : {}) };
    return (await this.client.request('POST', `${CAMPAIGNS_PATH}/audience-preview`, body)).data;
  }

  // ── leitura do espelho ──────────────────────────────────────
  /** Lista o espelho local, sincronizando antes o que está velho (60 s). */
  async list(pracaId?: string): Promise<FreelaCampaignView[]> {
    // Espelho de campanha que não existe mais (conexão desligada) mentiria na
    // tela: sem Freela configurado, a lista responde 503 como as outras.
    this.client.ensureConfigured();

    const limite = new Date(Date.now() - FRESCOR_MS);
    const velhas = await this.prisma.freela_campaigns.findMany({
      where: {
        status: { notIn: TERMINAIS },
        OR: [{ last_synced_at: null }, { last_synced_at: { lt: limite } }],
        ...(pracaId ? { praca_id: pracaId } : {}),
      },
      select: { freela_id: true },
      orderBy: [{ last_synced_at: 'asc' }, { created_at: 'asc' }],
      // Teto de 5 por leitura: sincronizar uma campanha pagina destinatários, e
      // 30 campanhas velhas de uma vez fariam a tela esperar minutos. O resto
      // fica para o relógio de 2 min (§18.6).
      take: SYNC_ON_READ_MAX,
    });
    // Melhor esforço: o Freela fora do ar deixa a tela abrir com o número de
    // antes, em vez de virar erro.
    for (const c of velhas) await this.syncOne(c.freela_id).catch(() => undefined);

    const rows = await this.prisma.freela_campaigns.findMany({
      where: pracaId ? { praca_id: pracaId } : {},
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  /** Painel da campanha: espelho local + o que o Freela diz agora. */
  async detail(freelaId: string): Promise<{
    campaign: FreelaCampaignView;
    freela: unknown;
    recipients: unknown;
    recipients_meta: { total: number; page: number; page_size: number } | null;
  }> {
    this.client.ensureConfigured();
    await this.rowOrFail(freelaId);
    const detalhe = await this.client.request('GET', `${CAMPAIGNS_PATH}/${encodeURIComponent(freelaId)}`);
    const lista = await this.client.request(
      'GET',
      `${CAMPAIGNS_PATH}/${encodeURIComponent(freelaId)}/recipients?page=1&pageSize=50`,
    );
    // Atualiza o espelho com o que acabou de chegar, sem paginar destinatário:
    // resolver envio é trabalho do relógio (§18.6), não de abrir uma tela.
    await this.gravarStatus(freelaId, detalhe.data).catch(() => undefined);
    return {
      campaign: this.toView(await this.rowOrFail(freelaId)),
      freela: detalhe.data,
      recipients: this.recipientsOf(lista.data),
      // A paginação vem DENTRO de `data` (`{total, page, pageSize, items}`), não
      // em `meta` — e sai em snake_case, como o resto do Praça.
      recipients_meta: this.recipientsMeta(lista.data),
    };
  }

  /** `{total, page, pageSize}` do corpo do Freela em snake_case. */
  private recipientsMeta(data: unknown): { total: number; page: number; page_size: number } | null {
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const total = numero(d.total);
    if (total === null) return null;
    return { total, page: numero(d.page) ?? 1, page_size: numero(d.pageSize) ?? 0 };
  }

  /** Começar, pausar ou cancelar — o Freela decide, o espelho copia. */
  async setState(freelaId: string, action: 'start' | 'pause' | 'cancel'): Promise<FreelaCampaignView> {
    this.client.ensureConfigured();
    await this.rowOrFail(freelaId);
    const r = await this.client.request<{ status?: string }>(
      'PATCH',
      `${CAMPAIGNS_PATH}/${encodeURIComponent(freelaId)}/${action}`,
    );
    const status = r.data?.status;
    if (status) {
      await this.prisma.freela_campaigns.update({
        where: { freela_id: freelaId },
        data: { status, last_synced_at: new Date() },
      });
    } else {
      await this.syncOne(freelaId).catch(() => undefined);
    }
    return this.toView(await this.rowOrFail(freelaId));
  }

  // ── criação ─────────────────────────────────────────────────
  /**
   * `POST /v1/freela/campaigns` — a tela **Freela → Campanhas → Nova**.
   * `EXTERNAL_LIST` monta a lista com os leads do funil do Praça; os outros
   * públicos são do Freela e vão direto.
   */
  async create(
    dto: CreateFreelaCampaignDto,
    user: AuthUser,
  ): Promise<{
    campaign: FreelaCampaignView;
    recipients_count: number | null;
    invalid_phones: number;
    duplicate_phones: number;
    unsupported_variables: string[];
    start_error: string | null;
  }> {
    this.client.ensureConfigured();
    const praca = await this.pracaOrFail(dto.praca_id);
    const modelo = await this.resolveTemplate(dto, user, praca);
    const pacing = await this.pacing(dto.pacing);

    if (dto.audience !== 'EXTERNAL_LIST') {
      const feita = await this.createForBase({
        name: dto.name,
        praca_id: dto.praca_id,
        audience: dto.audience,
        filters: dto.filters as Record<string, unknown> | undefined,
        template: modelo.template,
        pacing,
        start_now: dto.start_now,
        created_by: user.id,
      });
      return {
        campaign: feita.campaign,
        recipients_count: null,
        invalid_phones: 0,
        duplicate_phones: 0,
        unsupported_variables: modelo.unsupported_variables,
        start_error: feita.start_error,
      };
    }

    if (!dto.lead_filters) {
      throw new BadRequestException({
        code: 'LEAD_FILTERS_REQUIRED',
        message: 'Campanha de lista externa precisa do filtro do funil (lead_filters).',
      });
    }
    // Texto por lead só é renderizado se for subir (§18.4): sem a flag, o
    // Freela usa o modelo único e renderizar 2.000 textos seria trabalho jogado
    // fora.
    const publico = await this.disparos.audienceForFreela(
      dto.lead_filters,
      dto.template_id ?? null,
      user,
      this.client.perContactMessage(),
    );
    const feito = await this.createFromLeads({
      name: dto.name,
      praca_id: dto.praca_id,
      kind: 'manual',
      leads: publico.leads,
      template: modelo.template,
      pacing,
      start_now: dto.start_now,
      created_by: user.id,
    });
    if (!feito.freela_id) {
      throw new BadRequestException({
        code: 'NO_RECIPIENTS',
        message:
          'Ninguém pode receber esta campanha: o público está vazio, caiu na lista de bloqueio ou nenhum telefone vira WhatsApp.',
      });
    }
    return {
      campaign: this.toView(await this.rowOrFail(feito.freela_id)),
      recipients_count: feito.recipients_count,
      invalid_phones: feito.invalid_phones,
      duplicate_phones: feito.duplicate_lead_ids.length,
      unsupported_variables: modelo.unsupported_variables,
      start_error: feito.start_error,
    };
  }

  /**
   * Lista do Praça → campanha `EXTERNAL_LIST` no Freela. Telefone que não vira
   * E.164 não sobe (e volta contado, para quem chamou marcar o envio como
   * falhou). O `whatsappTemplate` é o modelo convertido; `contacts[].message`
   * só sai com a extensão §7.5 ligada — sem ela o `forbidNonWhitelisted` do
   * Freela devolveria 400 no lote inteiro.
   */
  async createFromLeads(args: CreateFromLeadsArgs): Promise<CreateFromLeadsResult> {
    this.client.ensureConfigured();
    const perContact = this.client.perContactMessage();
    const contacts: { name: string; phone: string; message?: string }[] = [];
    const invalid_lead_ids: string[] = [];
    const duplicate_lead_ids: string[] = [];
    const vistos = new Set<string>();

    for (const l of args.leads) {
      const phone = toE164BR(l.phone);
      if (!phone) {
        invalid_lead_ids.push(l.id);
        continue;
      }
      // O Freela descarta telefone repetido na normalização da lista: mandar
      // dois contatos com o mesmo número cria UM destinatário, e o segundo
      // envio ficaria em `fila` esperando alguém que nunca vai existir.
      if (vistos.has(phone)) {
        duplicate_lead_ids.push(l.id);
        continue;
      }
      vistos.add(phone);
      contacts.push({
        // O funil grava "—" quando ninguém sabe o nome do dono: aí vale o nome
        // da casa, que é como o WhatsApp vai chamar a pessoa.
        name: l.decisor && l.decisor !== '—' ? l.decisor : l.name,
        phone,
        ...(perContact ? { message: l.text } : {}),
      });
    }

    if (contacts.length > MAX_CONTATOS) {
      // O Freela recusaria o lote inteiro com a mensagem dele; aqui a conta
      // aparece e a tela sabe o que apertar.
      throw new BadRequestException({
        code: 'TOO_MANY_CONTACTS',
        message: `A lista tem ${contacts.length} contatos e o Freela aceita ${MAX_CONTATOS} por campanha. Aperte o filtro do funil.`,
      });
    }

    if (contacts.length === 0) {
      return {
        freela_id: null,
        recipients_count: 0,
        invalid_phones: invalid_lead_ids.length,
        invalid_lead_ids,
        duplicate_lead_ids,
        start_error: null,
      };
    }

    const criada = await this.client.request<{ id?: string; status?: string }>('POST', CAMPAIGNS_PATH, {
      name: args.name,
      audience: 'EXTERNAL_LIST',
      contacts,
      listFileName: `praca:${args.kind}`,
      skipRegistered: false,
      whatsappTemplate: args.template,
      ...args.pacing,
    });
    const freelaId = criada.data?.id;
    if (!freelaId) {
      throw new BadRequestException({
        code: 'FREELA_ERROR',
        message: 'O Freela não devolveu o id da campanha criada.',
      });
    }

    // Espelho ANTES do start: a campanha já existe lá, e é o
    // `freela_campaign_id` nos envios que impede a próxima rodada de criar
    // outra igual.
    await this.gravarEspelho(
      {
        freela_id: freelaId,
        name: args.name,
        kind: args.kind,
        praca_id: args.praca_id,
        disparo_id: args.disparo_id ?? null,
        audience: 'EXTERNAL_LIST',
        audience_filters: Prisma.DbNull,
        status: criada.data?.status ?? 'DRAFT',
        created_by: args.created_by,
      },
      args.link_send_ids,
      args.disparo_id ?? null,
    );
    const inicio = await this.startIfAsked(freelaId, args.start_now);

    return {
      freela_id: freelaId,
      recipients_count: contacts.length,
      invalid_phones: invalid_lead_ids.length,
      invalid_lead_ids,
      duplicate_lead_ids,
      start_error: inicio.error,
    };
  }

  /** Público do próprio Freela (contratantes/freelancers parados etc.). */
  async createForBase(
    args: CreateForBaseArgs,
  ): Promise<{ campaign: FreelaCampaignView; start_error: string | null }> {
    this.client.ensureConfigured();
    const criada = await this.client.request<{ id?: string; status?: string }>('POST', CAMPAIGNS_PATH, {
      name: args.name,
      audience: args.audience,
      ...(args.filters ? { audienceFilters: args.filters } : {}),
      whatsappTemplate: args.template,
      ...args.pacing,
    });
    const freelaId = criada.data?.id;
    if (!freelaId) {
      throw new BadRequestException({
        code: 'FREELA_ERROR',
        message: 'O Freela não devolveu o id da campanha criada.',
      });
    }
    await this.gravarEspelho({
      freela_id: freelaId,
      name: args.name,
      kind: 'base',
      praca_id: args.praca_id,
      disparo_id: null,
      audience: args.audience,
      audience_filters: (args.filters ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
      status: criada.data?.status ?? 'DRAFT',
      created_by: args.created_by,
    });
    const inicio = await this.startIfAsked(freelaId, args.start_now);
    return { campaign: this.toView(await this.rowOrFail(freelaId)), start_error: inicio.error };
  }

  /** Ritmo pedido na tela por cima do ritmo do Praça (`GET /v1/settings`). */
  async pacing(dto?: FreelaPacingDto): Promise<FreelaPacing> {
    const base = toFreelaPacing(this.toSendSettings(await this.messages.getSettings()));
    if (!dto) return base;
    return {
      messagesPerHour: dto.messages_per_hour ?? base.messagesPerHour,
      dailyCap: dto.daily_cap ?? base.dailyCap,
      windowStartHour: dto.window_start_hour ?? base.windowStartHour,
      windowEndHour: dto.window_end_hour ?? base.windowEndHour,
      weekdaysOnly: dto.weekdays_only ?? base.weekdaysOnly,
    };
  }

  // ── sincronização (§7.6) ────────────────────────────────────
  /** Todas as campanhas que ainda andam. Uma que falha não para as outras. */
  async syncAll(): Promise<{ synced: number }> {
    const rows = await this.prisma.freela_campaigns.findMany({
      where: { status: { notIn: TERMINAIS } },
      select: { freela_id: true },
      orderBy: { created_at: 'asc' },
    });
    let synced = 0;
    for (const r of rows) {
      try {
        await this.syncOne(r.freela_id);
        synced++;
      } catch (e) {
        this.log.warn(`campanha ${r.freela_id} não sincronizou: ${this.motivo(e)}`);
      }
    }
    return { synced };
  }

  /**
   * Copia status e contagens de UMA campanha e, se ela tem envios do Praça
   * pendurados, resolve cada um pelo telefone do destinatário. O casamento é
   * por E.164 porque é a única chave que os dois lados têm: o Freela não sabe
   * nada de `msg_sends`.
   */
  async syncOne(freelaId: string): Promise<void> {
    await this.retryStart(freelaId);
    const r = await this.client.request<Record<string, unknown>>(
      'GET',
      `${CAMPAIGNS_PATH}/${encodeURIComponent(freelaId)}`,
    );
    await this.gravarStatus(freelaId, r.data);
    await this.syncSends(freelaId);
  }

  /**
   * Tenta de novo o `start` que falhou na criação.
   *
   * A campanha do outbox é criada e **depois** iniciada (§18.5). Se o Freela
   * piscar exatamente no `PATCH /:id/start`, a campanha fica `DRAFT` com os
   * destinatários `PENDING` — e o lote não voltaria nunca: o espelho e o
   * `freela_campaign_id` já estão gravados, então a garimpagem do outbox
   * (`freela_campaign_id IS NULL`) não pega mais esses envios. Uma tentativa
   * por rodada, aqui, é o que impede o lote de morrer na fila por um erro de
   * dois segundos.
   */
  private async retryStart(freelaId: string): Promise<void> {
    const row = await this.prisma.freela_campaigns.findUnique({
      where: { freela_id: freelaId },
      select: { status: true, kind: true },
    });
    if (!row || row.status !== 'DRAFT' || !KINDS_COM_START.includes(row.kind)) return;
    this.log.log(`campanha ${freelaId} ficou em DRAFT: tentando iniciar de novo`);
    // `startIfAsked` já loga e NÃO lança: falhar aqui só adia para a próxima
    // rodada, sem impedir a leitura de status que vem depois.
    await this.startIfAsked(freelaId, true);
  }

  /**
   * Copia status e contagens do corpo de `GET /:id` para o espelho. O Freela
   * já mudou a forma desse corpo antes (campanha na raiz × dentro de
   * `campaign`), então as duas são aceitas.
   */
  private async gravarStatus(freelaId: string, data: unknown): Promise<void> {
    const corpo = (data ?? {}) as Record<string, unknown>;
    const campanha = (corpo.campaign ?? corpo) as Record<string, unknown>;
    const status = typeof campanha.status === 'string' ? campanha.status : null;
    const stats = (corpo.counts ?? corpo.stats ?? campanha.stats ?? null) as Prisma.InputJsonValue | null;

    await this.prisma.freela_campaigns.update({
      where: { freela_id: freelaId },
      data: {
        ...(status ? { status } : {}),
        stats: stats === null ? Prisma.DbNull : stats,
        last_synced_at: new Date(),
      },
    });
  }

  /** Resolve os `msg_sends` presos nesta campanha (fila → enviada/falhou). */
  private async syncSends(freelaId: string): Promise<void> {
    const pendentes = await this.prisma.msg_sends.findMany({
      where: { freela_campaign_id: freelaId, status: 'fila' },
      include: { lead: { select: { id: true, phone: true } } },
    });
    if (pendentes.length === 0) return;

    const porTelefone = await this.recipientsByPhone(freelaId);
    if (porTelefone.size === 0) {
      // Campanha com envio pendurado e nenhum telefone lido: ou a campanha
      // ainda não tem destinatário, ou o Freela mudou o nome do campo. Nos dois
      // casos o envio ficaria em `fila` para sempre em silêncio.
      this.log.warn(
        `campanha ${freelaId}: ${pendentes.length} envio(s) na fila e nenhum destinatário com telefone lido`,
      );
      return;
    }

    const nomes = await this.loteNames(pendentes);
    const disparosTocados = new Set<string>();

    for (const s of pendentes) {
      const chave = toE164BR(s.lead.phone);
      const r = chave ? porTelefone.get(chave) : undefined;
      if (!r) continue;
      if (s.disparo_id) disparosTocados.add(s.disparo_id);

      if (r.status === 'SENT') {
        const at = r.sentAt ? new Date(r.sentAt) : new Date();
        const nome = nomes.get(s.id) ?? 'Mensagem';
        await this.prisma.$transaction([
          this.prisma.msg_sends.update({
            where: { id: s.id },
            data: {
              status: 'enviada',
              sent_at: at,
              ...(r.id ? { freela_recipient_id: r.id } : {}),
            },
          }),
          this.prisma.lead_events.create({
            data: {
              lead_id: s.lead_id,
              at,
              kind: 'msg_out',
              text: `${nome} enviada pelo Freela (WhatsApp).`,
            },
          }),
          this.prisma.leads.update({ where: { id: s.lead_id }, data: { last_contact_at: at } }),
        ]);
      } else if (r.status === 'FAILED' || r.status === 'SKIPPED') {
        await this.prisma.msg_sends.update({
          where: { id: s.id },
          data: {
            status: 'falhou',
            failure_reason:
              r.failureReason ??
              (r.status === 'SKIPPED' ? 'O Freela pulou este contato.' : 'O Freela não conseguiu enviar.'),
            ...(r.id ? { freela_recipient_id: r.id } : {}),
          },
        });
      }
    }

    for (const id of disparosTocados) await this.settleDisparo(id);
  }

  /** Todos os destinatários da campanha, indexados pelo telefone E.164. */
  private async recipientsByPhone(freelaId: string): Promise<Map<string, Recipient>> {
    const out = new Map<string, Recipient>();
    const base = `${CAMPAIGNS_PATH}/${encodeURIComponent(freelaId)}/recipients`;
    // Teto de páginas: 200 × 50 = 10.000 destinatários, o dobro do limite de
    // contatos do Freela — se estourar, é laço, não campanha.
    for (let page = 1; page <= 50; page++) {
      const r = await this.client.request<unknown>('GET', `${base}?page=${page}&pageSize=200`);
      const itens = this.recipientsOf(r.data);
      for (const item of itens) {
        const tel = toE164BR(item.phone ?? item.externalPhone ?? item.destination ?? null);
        if (tel && !out.has(tel)) out.set(tel, item);
      }
      if (itens.length < 200) break;
    }
    return out;
  }

  /** `data` pode ser a lista ou `{items}` — o Freela mudou isso antes. */
  private recipientsOf(data: unknown): Recipient[] {
    if (Array.isArray(data)) return data as Recipient[];
    const itens = (data as { items?: unknown } | null)?.items;
    return Array.isArray(itens) ? (itens as Recipient[]) : [];
  }

  /** Nome que vai no evento do lead: o do disparo ou o da cadência. */
  private async loteNames(
    sends: { id: string; disparo_id: string | null; cadence_id: string | null }[],
  ): Promise<Map<string, string>> {
    const disparoIds = [...new Set(sends.map((s) => s.disparo_id).filter((x): x is string => !!x))];
    const cadenceIds = [...new Set(sends.map((s) => s.cadence_id).filter((x): x is string => !!x))];
    const disparos = disparoIds.length
      ? await this.prisma.disparos.findMany({
          where: { id: { in: disparoIds } },
          select: { id: true, name: true },
        })
      : [];
    const cadencias = cadenceIds.length
      ? await this.prisma.cadences.findMany({
          where: { id: { in: cadenceIds } },
          select: { id: true, name: true },
        })
      : [];
    const porDisparo = new Map(disparos.map((d) => [d.id, d.name]));
    const porCadencia = new Map(cadencias.map((c) => [c.id, `Cadência “${c.name}”`]));

    const out = new Map<string, string>();
    for (const s of sends) {
      const nome =
        (s.disparo_id ? porDisparo.get(s.disparo_id) : undefined) ??
        (s.cadence_id ? porCadencia.get(s.cadence_id) : undefined);
      if (nome) out.set(s.id, nome);
    }
    return out;
  }

  /**
   * Fecha o disparo quando não sobrou ninguém na fila. Repete a regra de
   * `DisparosService.settle` (que é privada) de propósito: importar o serviço
   * aqui criaria dependência circular entre os dois módulos.
   */
  async settleDisparo(disparoId: string): Promise<void> {
    const naFila = await this.prisma.msg_sends.count({
      where: { disparo_id: disparoId, status: 'fila' },
    });
    if (naFila > 0) return;
    await this.prisma.disparos.updateMany({
      where: { id: disparoId, status: { not: 'concluido' } },
      data: { status: 'concluido' },
    });
  }

  // ── internos ────────────────────────────────────────────────
  /** Cria a linha do espelho e (quando há) pendura os envios no mesmo commit. */
  private async gravarEspelho(
    data: {
      freela_id: string;
      name: string;
      kind: string;
      praca_id: string | null;
      disparo_id: string | null;
      audience: string;
      audience_filters: Prisma.InputJsonValue | typeof Prisma.DbNull;
      status: string;
      created_by: string;
    },
    linkSendIds?: string[],
    disparoId?: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.freela_campaigns.create({ data });
      // No MESMO commit: campanha criada e envio sem `freela_campaign_id`
      // faria a próxima rodada do outbox criar a campanha de novo — o lead
      // receberia duas vezes.
      if (linkSendIds?.length) {
        await tx.msg_sends.updateMany({
          where: { id: { in: linkSendIds } },
          data: { freela_campaign_id: data.freela_id },
        });
      }
      if (disparoId) {
        await tx.disparos.update({
          where: { id: disparoId },
          data: { freela_campaign_id: data.freela_id },
        });
      }
    });
  }

  /**
   * `PATCH /:id/start` — chamado **depois** de o espelho existir.
   *
   * Falhar aqui não desfaz a campanha: o espelho fica com o status de
   * nascimento (`DRAFT`), o motivo volta em `start_error` e a próxima
   * sincronização traz o status de verdade. Começar antes de gravar o espelho
   * abriria a janela em que a rodada seguinte do outbox criaria tudo de novo.
   */
  private async startIfAsked(
    freelaId: string,
    startNow: boolean,
  ): Promise<{ status: string | null; error: string | null }> {
    if (!startNow) return { status: null, error: null };
    try {
      const r = await this.client.request<{ status?: string }>(
        'PATCH',
        `${CAMPAIGNS_PATH}/${encodeURIComponent(freelaId)}/start`,
      );
      const status = r.data?.status ?? 'RUNNING';
      await this.prisma.freela_campaigns.update({
        where: { freela_id: freelaId },
        data: { status, last_synced_at: new Date() },
      });
      return { status, error: null };
    } catch (e) {
      const error = this.motivo(e);
      this.log.warn(`campanha ${freelaId} criada, mas não começou: ${error}`);
      return { status: null, error };
    }
  }

  /** Modelo do Praça convertido, ou o texto escrito na mão. */
  private async resolveTemplate(
    dto: CreateFreelaCampaignDto,
    user: AuthUser,
    praca: PracaCtx,
  ): Promise<{ template: string; unsupported_variables: string[] }> {
    if (dto.template_id) {
      const tpl = await this.prisma.msg_templates.findUnique({
        where: { id: dto.template_id },
        select: { text_a: true, text_b: true },
      });
      if (!tpl) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Modelo não encontrado.' });
      const settings = await this.messages.getSettings();
      return toFreelaTemplate(tpl.text_a, tpl.text_b, {
        praca: praca.praca,
        cidade: praca.cidade,
        me: { name: user.name },
        defaults: settings.template_defaults,
      });
    }
    if (!dto.whatsapp_template?.trim()) {
      throw new BadRequestException({
        code: 'TEMPLATE_REQUIRED',
        message: 'Escolha um modelo do Praça (template_id) ou escreva o texto (whatsapp_template).',
      });
    }
    return { template: dto.whatsapp_template, unsupported_variables: [] };
  }

  private async pracaOrFail(id: string): Promise<PracaCtx> {
    const p = await this.prisma.pracas.findUnique({
      where: { id },
      select: { name: true, start_date: true, city: true, cobertura_cidade: true },
    });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    return { praca: { name: p.name, start_date: p.start_date }, cidade: pracaCidade(p) };
  }

  private async rowOrFail(freelaId: string): Promise<CampaignRow> {
    const row = await this.prisma.freela_campaigns.findUnique({ where: { freela_id: freelaId } });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campanha não encontrada no Praça.' });
    }
    return row;
  }

  private toSendSettings(s: SettingsView): SendSettings {
    return {
      mode: s.mode as SendMode,
      window_start: s.window_start,
      window_end: s.window_end,
      sunday: s.sunday,
      daily_limit: s.daily_limit,
      gap_min: s.gap_min,
      gap_max: s.gap_max,
    };
  }

  private toView(r: CampaignRow): FreelaCampaignView {
    return {
      id: r.id,
      freela_id: r.freela_id,
      name: r.name,
      kind: r.kind,
      praca_id: r.praca_id,
      disparo_id: r.disparo_id,
      audience: r.audience,
      audience_filters: r.audience_filters ?? null,
      status: r.status,
      stats: r.stats ?? null,
      created_by: r.created_by,
      created_at: r.created_at.toISOString(),
      last_synced_at: r.last_synced_at?.toISOString() ?? null,
    };
  }

  /** Mensagem legível de um erro, para log e para a tela de conexão. */
  private motivo(e: unknown): string {
    const corpo = (e as { getResponse?: () => unknown }).getResponse?.();
    if (corpo && typeof corpo === 'object' && typeof (corpo as { message?: unknown }).message === 'string') {
      return (corpo as { message: string }).message;
    }
    return e instanceof Error ? e.message : String(e);
  }
}
