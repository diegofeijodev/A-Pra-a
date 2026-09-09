import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { phoneKey } from '../../common/phone/phone';
import {
  DEFAULT_TEMPLATE_DEFAULTS,
  TEMPLATE_DEFAULT_KEYS,
  type TemplateDefaults,
} from '../../domain/catalog/messages';
import { clampHour } from '../../domain/send-schedule';
import {
  missingVariables,
  renderTemplate,
  type RenderCtx,
  type RenderPraca,
} from '../../domain/template-render';
import {
  templateMetrics,
  type MetricsLead,
  type MetricsSend,
  type TemplateMetrics,
} from '../../domain/template-metrics';
import { LeadsService } from '../leads/leads.service';
import { CreateBlockDto, RenderTemplateDto, TemplateBodyDto, UpdateSettingsDto } from './dto/messages.dto';

export interface AttachmentView {
  kind: string;
  name: string;
  url: string | null;
}

export interface TemplateView {
  id: string;
  name: string;
  audience: string;
  stage: number;
  channel: string;
  text_a: string;
  text_b: string;
  attachment: AttachmentView | null;
  created_at: string;
  metrics: TemplateMetrics;
}

export interface SettingsView {
  mode: string;
  window_start: number;
  window_end: number;
  sunday: boolean;
  daily_limit: number;
  gap_min: number;
  gap_max: number;
  daily_quota: number;
  template_defaults: TemplateDefaults;
}

export interface BlockView {
  id: string;
  phone: string;
  phone_key: string;
  name: string;
  lead_id: string | null;
  at: string;
  reason: string;
}

/** Colunas de `msg_templates` que a view enxerga. */
interface TemplateRow {
  id: string;
  name: string;
  audience: string;
  stage: number;
  channel: string;
  text_a: string;
  text_b: string | null;
  attachment_kind: string | null;
  attachment_name: string | null;
  attachment_url: string | null;
  created_at: Date;
}

/** Prisma normal ou o cliente de uma transação aberta por quem chamou. */
type Db = PrismaService | Prisma.TransactionClient;

const NOME_PADRAO_BLOQUEIO = 'adicionado na mão';
const MOTIVO_PADRAO_BLOQUEIO = 'pedido manual';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
  ) {}

  // ── modelos ─────────────────────────────────────────────────
  /**
   * Lista com a medição de cada modelo. Ordem: melhor taxa de resposta
   * primeiro, desempate por volume enviado. Com `msg_sends` vazio todo mundo
   * empata em zero — aí vale a ordem de criação (o `sort` do JS é estável).
   */
  async listTemplates(): Promise<TemplateView[]> {
    const rows = await this.prisma.msg_templates.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    if (rows.length === 0) return [];

    const { sends, leadsById } = await this.metricsInputs(rows.map((r) => r.id));
    return rows
      .map((r) => ({ ...this.toTemplateView(r), metrics: templateMetrics(r.id, sends, leadsById) }))
      .sort((a, b) => b.metrics.resp_rate - a.metrics.resp_rate || b.metrics.sent - a.metrics.sent);
  }

  async createTemplate(dto: TemplateBodyDto): Promise<TemplateView> {
    const row = await this.prisma.msg_templates.create({ data: this.toTemplateData(dto) });
    return { ...this.toTemplateView(row), metrics: await this.metricsFor(row.id) };
  }

  /** PUT substitui o modelo inteiro — anexo ausente no corpo some. */
  async replaceTemplate(id: string, dto: TemplateBodyDto): Promise<TemplateView> {
    await this.templateOrFail(id);
    const row = await this.prisma.msg_templates.update({ where: { id }, data: this.toTemplateData(dto) });
    // A medição é CARREGADA, não zerada: editar um modelo que já foi disparado
    // não pode responder `sent: 0` enquanto o GET mostra o número de verdade.
    return { ...this.toTemplateView(row), metrics: await this.metricsFor(row.id) };
  }

  async removeTemplate(id: string): Promise<{ ok: true }> {
    await this.templateOrFail(id);
    await this.prisma.msg_templates.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Prévia do texto. `lead_id` opcional: sem ele o render mostra o esqueleto
   * com `⟨variavel⟩` no lugar do que viria do lead — é assim que a tela de
   * modelos avisa que o texto tem buraco antes de virar disparo.
   */
  async render(dto: RenderTemplateDto, user: AuthUser): Promise<{ text: string; missing: string[] }> {
    const defaults = await this.templateDefaults();
    const ctx: RenderCtx = { defaults, me: { name: user.name } };

    if (dto.lead_id) {
      const lead = await this.leads.get(dto.lead_id);
      ctx.lead = {
        name: lead.name,
        decisor: lead.decisor,
        city: lead.city,
        address: lead.address,
        vagas: lead.vagas.map((v) => ({ date: v.date })),
      };
      if (lead.praca_id) ctx.praca = await this.pracaFor(lead.praca_id);
      ctx.neighbor = await this.neighborOf(lead.id, lead.city);
    }
    // Sem lead (ou lead órfão de praça): a praça é a que a pessoa está usando.
    if (!ctx.praca) {
      const me = await this.prisma.users.findUnique({
        where: { id: user.id },
        select: { active_praca_id: true },
      });
      if (me?.active_praca_id) ctx.praca = await this.pracaFor(me.active_praca_id);
    }

    return { text: renderTemplate(dto.text, ctx), missing: missingVariables(dto.text, ctx) };
  }

  // ── configurações de envio ──────────────────────────────────
  async getSettings(): Promise<SettingsView> {
    return this.toSettingsView(await this.settingsRow());
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<SettingsView> {
    const cur = await this.settingsRow();
    // A janela é PRESA em 8h–20h, não recusada: o operador que digita 7 vê a
    // hora virar 8 na resposta, em vez de tomar um 400 sem saber o porquê.
    const window_start = clampHour(dto.window_start ?? cur.window_start);
    const window_end = clampHour(dto.window_end ?? cur.window_end);
    const gap_min = dto.gap_min ?? cur.gap_min;
    const gap_max = dto.gap_max ?? cur.gap_max;

    if (window_end <= window_start) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'window_end: a janela precisa fechar depois de abrir.',
      });
    }
    if (gap_max <= gap_min) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'gap_max: o intervalo máximo precisa ser maior que o mínimo.',
      });
    }

    const row = await this.prisma.app_settings.update({
      where: { id: 1 },
      data: {
        mode: dto.mode ?? cur.mode,
        window_start,
        window_end,
        sunday: dto.sunday ?? cur.sunday,
        daily_limit: dto.daily_limit ?? cur.daily_limit,
        gap_min,
        gap_max,
        daily_quota: dto.daily_quota ?? cur.daily_quota,
        // Parcial: manda só a chave que mudou, o resto fica como estava.
        template_defaults: { ...this.mergeDefaults(cur.template_defaults), ...(dto.template_defaults ?? {}) },
      },
    });
    return this.toSettingsView(row);
  }

  // ── lista de bloqueio ───────────────────────────────────────
  async listBlocks(): Promise<BlockView[]> {
    const rows = await this.prisma.blocklist.findMany({ orderBy: [{ at: 'desc' }] });
    return rows.map((r) => ({
      id: r.id,
      phone: r.phone,
      phone_key: r.phone_key,
      name: r.name,
      lead_id: r.lead_id,
      at: r.at.toISOString(),
      reason: r.reason,
    }));
  }

  async addBlock(dto: CreateBlockDto): Promise<BlockView> {
    // Bloqueio é por chave (últimos 9 dígitos), não pelo texto do telefone:
    // "(31) 98000-1000" e "31980001000" são o mesmo número.
    const key = phoneKey(dto.phone);
    if (!key) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'phone: telefone sem dígitos para formar a chave de bloqueio.',
      });
    }
    const ja = await this.prisma.blocklist.findUnique({ where: { phone_key: key } });
    if (ja) throw this.jaBloqueado();

    try {
      const row = await this.prisma.blocklist.create({
        data: {
          phone: dto.phone,
          phone_key: key,
          name: dto.name?.trim() || NOME_PADRAO_BLOQUEIO,
          reason: dto.reason?.trim() || MOTIVO_PADRAO_BLOQUEIO,
          lead_id: dto.lead_id ?? null,
        },
      });
      return {
        id: row.id,
        phone: row.phone,
        phone_key: row.phone_key,
        name: row.name,
        lead_id: row.lead_id,
        at: row.at.toISOString(),
        reason: row.reason,
      };
    } catch (e) {
      // Dois toques no botão ao mesmo tempo: a unique de `phone_key` decide.
      if ((e as { code?: string }).code === 'P2002') throw this.jaBloqueado();
      throw e;
    }
  }

  /**
   * Bloqueia o número se ele ainda não estiver bloqueado; `false` = já estava.
   *
   * É o caminho do opt-out automático (resposta "pare" na fila de envios), que
   * não pode virar `409 ALREADY_BLOCKED` na cara de quem só registrou a
   * resposta do lead — diferente do `POST /v1/blocklist`, que é ato manual e
   * avisa quando o número já está lá.
   */
  async blockIfNew(
    input: {
      phone: string;
      name: string;
      lead_id: string | null;
      reason: string;
    },
    // `db` = a transação de quem chamou. O opt-out da fila de envios grava a
    // resposta e o bloqueio no MESMO commit: registrar "pediu para parar" sem
    // bloquear o número é o pior dos dois mundos.
    db: Db = this.prisma,
  ): Promise<boolean> {
    const key = phoneKey(input.phone);
    if (!key) return false;
    const ja = await db.blocklist.count({ where: { phone_key: key } });
    if (ja) return false;
    try {
      await db.blocklist.create({
        data: {
          phone: input.phone,
          phone_key: key,
          name: input.name.trim() || NOME_PADRAO_BLOQUEIO,
          reason: input.reason.trim() || MOTIVO_PADRAO_BLOQUEIO,
          lead_id: input.lead_id,
        },
      });
      return true;
    } catch (e) {
      // Duas respostas de opt-out ao mesmo tempo: a unique decide, sem 500.
      if ((e as { code?: string }).code === 'P2002') return false;
      throw e;
    }
  }

  /**
   * Todas as chaves bloqueadas. Uma consulta só: o público de um disparo é
   * filtrado por ela em memória, em vez de uma consulta por lead.
   */
  async blockedKeys(): Promise<Set<string>> {
    const rows = await this.prisma.blocklist.findMany({ select: { phone_key: true } });
    return new Set(rows.map((r) => r.phone_key));
  }

  async removeBlock(id: string): Promise<{ ok: true }> {
    if (!isUuid(id)) throw this.bloqueioNaoAchado();
    const row = await this.prisma.blocklist.findUnique({ where: { id } });
    if (!row) throw this.bloqueioNaoAchado();
    await this.prisma.blocklist.delete({ where: { id } });
    return { ok: true };
  }

  // ── internos ────────────────────────────────────────────────
  /**
   * Envios e leads que a medição precisa, para um conjunto de modelos. Duas
   * consultas no total (envios → leads que aparecem neles), nunca a base
   * inteira de leads: `templateMetrics` só olha a etapa atual de quem recebeu.
   */
  private async metricsInputs(
    templateIds: string[],
  ): Promise<{ sends: MetricsSend[]; leadsById: Record<string, MetricsLead> }> {
    if (templateIds.length === 0) return { sends: [], leadsById: {} };

    const rows = await this.prisma.msg_sends.findMany({
      where: { template_id: { in: templateIds } },
      select: {
        template_id: true,
        lead_id: true,
        variant: true,
        status: true,
        sent_at: true,
        stage_at_send: true,
      },
    });
    const sends: MetricsSend[] = rows.map((s) => ({ ...s, sent_at: s.sent_at?.toISOString() ?? null }));

    const leadIds = [...new Set(rows.map((s) => s.lead_id))];
    const leadsById: Record<string, MetricsLead> = {};
    if (leadIds.length > 0) {
      const leads = await this.prisma.leads.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, stage: true, stage_since: true },
      });
      for (const l of leads) leadsById[l.id] = { stage: l.stage, stage_since: l.stage_since };
    }
    return { sends, leadsById };
  }

  /**
   * Medição de um modelo só — é o que POST e PUT devolvem junto da linha
   * salva. Passa pelo mesmo caminho da lista de propósito: a resposta de uma
   * edição tem que bater com o que o `GET` mostra do mesmo modelo.
   */
  private async metricsFor(id: string): Promise<TemplateMetrics> {
    const { sends, leadsById } = await this.metricsInputs([id]);
    return templateMetrics(id, sends, leadsById);
  }

  /** Linha 1 de `app_settings`. O caminho normal é o seed; ler não escreve. */
  private async settingsRow() {
    const row = await this.prisma.app_settings.findUnique({ where: { id: 1 } });
    if (row) return row;
    // Seed não rodou (banco novo). `upsert` em vez de `create` para duas
    // leituras simultâneas não brigarem pela chave 1.
    return this.prisma.app_settings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, template_defaults: DEFAULT_TEMPLATE_DEFAULTS },
    });
  }

  /** Valores-padrão das variáveis: o do catálogo, sobrescrito pelo do banco. */
  private async templateDefaults(): Promise<TemplateDefaults> {
    return this.mergeDefaults((await this.settingsRow()).template_defaults);
  }

  private mergeDefaults(stored: unknown): TemplateDefaults {
    const out: TemplateDefaults = { ...DEFAULT_TEMPLATE_DEFAULTS };
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return out;
    const raw = stored as Record<string, unknown>;
    // Só as 6 chaves conhecidas, e só string: lixo no Json não vira variável.
    for (const k of TEMPLATE_DEFAULT_KEYS) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) out[k] = v;
    }
    return out;
  }

  private async pracaFor(id: string): Promise<RenderPraca | undefined> {
    const p = await this.prisma.pracas.findUnique({
      where: { id },
      select: { name: true, start_date: true },
    });
    return p ?? undefined;
  }

  /**
   * Prova social do texto: outra casa da mesma cidade, a primeira por nome.
   * `is_test` fica fora — esse nome vai dentro da mensagem que um prospecto
   * real recebe, e "Bar de Teste QA" numa mensagem fria queima o contato.
   */
  private async neighborOf(leadId: string, city: string): Promise<string | undefined> {
    const candidatos = (await this.neighborsByCity([city])).get(city) ?? [];
    return candidatos.find((c) => c.id !== leadId)?.name;
  }

  /**
   * Os DOIS primeiros leads (por nome) de cada cidade — a fonte do
   * `{{estabelecimento_vizinho}}`. Dois, e não um, porque o vizinho de um lead
   * é o primeiro que não seja ele mesmo.
   *
   * UMA consulta para todas as cidades (não uma por cidade), apoiada no índice
   * `leads(city, name)`: um disparo que pega 30 cidades resolve a prova social
   * de todas de uma vez. Cidade vazia não tem vizinho.
   */
  async neighborsByCity(cities: string[]): Promise<Map<string, { id: string; name: string }[]>> {
    const out = new Map<string, { id: string; name: string }[]>();
    const alvo = [...new Set(cities.filter((c) => c.trim()))];
    if (alvo.length === 0) return out;

    const rows = await this.prisma.leads.findMany({
      where: { archived: false, is_test: false, city: { in: alvo } },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, city: true },
    });
    for (const r of rows) {
      const lista = out.get(r.city) ?? [];
      // Só os dois primeiros de cada cidade interessam — o resto é descartado
      // na hora, sem crescer a memória com a cidade inteira.
      if (lista.length < 2) out.set(r.city, [...lista, { id: r.id, name: r.name }]);
    }
    return out;
  }

  private async templateOrFail(id: string) {
    if (!isUuid(id)) throw this.modeloNaoAchado();
    const row = await this.prisma.msg_templates.findUnique({ where: { id } });
    if (!row) throw this.modeloNaoAchado();
    return row;
  }

  private toTemplateData(dto: TemplateBodyDto) {
    const a = dto.attachment ?? null;
    return {
      name: dto.name,
      audience: dto.audience,
      stage: dto.stage,
      channel: dto.channel,
      text_a: dto.text_a,
      text_b: dto.text_b ?? '',
      attachment_kind: a?.kind ?? null,
      attachment_name: a?.name ?? null,
      attachment_url: a?.url ?? null,
    };
  }

  private toTemplateView(r: TemplateRow): Omit<TemplateView, 'metrics'> {
    return {
      id: r.id,
      name: r.name,
      audience: r.audience,
      stage: r.stage,
      channel: r.channel,
      text_a: r.text_a,
      // `null` no banco e `""` no corpo significam a mesma coisa (sem variante
      // B); o wire manda sempre string para a tela não tratar dois casos.
      text_b: r.text_b ?? '',
      attachment: r.attachment_kind
        ? { kind: r.attachment_kind, name: r.attachment_name ?? '', url: r.attachment_url }
        : null,
      created_at: r.created_at.toISOString(),
    };
  }

  private toSettingsView(row: {
    mode: string;
    window_start: number;
    window_end: number;
    sunday: boolean;
    daily_limit: number;
    gap_min: number;
    gap_max: number;
    daily_quota: number;
    template_defaults: unknown;
  }): SettingsView {
    return {
      mode: row.mode,
      window_start: row.window_start,
      window_end: row.window_end,
      sunday: row.sunday,
      daily_limit: row.daily_limit,
      gap_min: row.gap_min,
      gap_max: row.gap_max,
      daily_quota: row.daily_quota,
      template_defaults: this.mergeDefaults(row.template_defaults),
    };
  }

  private modeloNaoAchado() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Modelo não encontrado.' });
  }

  private bloqueioNaoAchado() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Bloqueio não encontrado.' });
  }

  private jaBloqueado() {
    return new ConflictException({
      code: 'ALREADY_BLOCKED',
      message: 'Este telefone já está na lista de bloqueio.',
    });
  }
}
