import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { phoneKey } from '../../common/phone/phone';
import { hourSp, todaySp } from '../../common/time/dates';
import { CHANNELS, type SendMode } from '../../domain/catalog/messages';
import { dupCutoff, isDupSend, partitionAudience, pickVariant } from '../../domain/disparo-rules';
import { etaText, scheduleTimes, type SendSettings } from '../../domain/send-schedule';
import { isOptOut, renderTemplate, type RenderPraca } from '../../domain/template-render';
import { LeadsService, PARA_LISTA, type LeadListView } from '../leads/leads.service';
import { MessagesService, type SettingsView } from '../messages/messages.service';
import {
  CreateDisparoDto,
  DisparoFiltersDto,
  MarkSendDto,
  PreviewDisparoDto,
  ReplySendDto,
} from './dto/disparos.dto';
import { FREELA_NOT_CONFIGURED_MESSAGE, isFreelaConfigured } from './freela-gate';

// ── views ──────────────────────────────────────────────────────
export interface DisparoFiltersView {
  praca_id: string;
  stage: number;
  classe: string;
  origem: string;
  owner_id: string;
  min_stalled: number;
}

export interface DisparoCountsView {
  total: number;
  queued: number;
  /** Tudo que saiu da fila (enviada, entregue, respondida, falhou). */
  sent: number;
}

export interface DisparoView {
  id: string;
  name: string;
  at: string;
  scheduled_at: string;
  mode: string;
  template_id: string;
  template_name: string;
  split: boolean;
  channel: string;
  by: string;
  filters: DisparoFiltersView;
  skipped_block: number;
  skipped_dup: number;
  status: string;
  freela_campaign_id: string | null;
  counts: DisparoCountsView;
}

export interface SendLeadView {
  id: string;
  name: string;
  city: string;
  phone: string;
}

export interface SendView {
  id: string;
  lead: SendLeadView;
  variant: string;
  text: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  replied_at: string | null;
  failure_reason: string | null;
  stage_at_send: number;
}

export interface DisparoStatsView {
  queued: number;
  sent: number;
  delivered: number;
  replied: number;
  advanced: number;
  blocked_after: number;
}

export interface DisparoDetailView {
  disparo: DisparoView;
  stats: DisparoStatsView;
  /** Respostas por hora de Brasília, 24 posições. */
  by_hour: number[];
  sends: SendView[];
}

export interface PreviewItemView {
  lead_id: string;
  name: string;
  city: string;
  variant: string;
  text: string;
}

export interface DisparoPreviewView {
  audience: number;
  sendable: number;
  blocked: number;
  dupes: number;
  first_at: string;
  eta: string;
  previews: PreviewItemView[];
  /** Como o texto vai virar campanha no Freela — a Task 15 preenche. */
  freela: null;
}

export interface CreateDisparoResult {
  id: string;
  created: number;
  skipped_block: number;
  skipped_dup: number;
}

// ── internos ───────────────────────────────────────────────────
/** O modelo escolhido, no recorte que o disparo precisa. */
interface TemplateRow {
  id: string;
  name: string;
  channel: string;
  text_a: string;
  text_b: string | null;
}

/** Um lead do público, com a primeira vaga (a variável `{{data_vaga}}`). */
interface PublicoLead {
  lead: LeadListView;
  vaga_date: string | null;
}

/** O lote inteiro decidido antes de gravar: quem recebe, quando e com que texto. */
interface Plano {
  audience: number;
  blocked: number;
  dupes: number;
  sendable: PublicoLead[];
  /** Um horário por `sendable`, na mesma ordem. */
  times: string[];
  first_at: string;
  eta: string;
  split: boolean;
  render: (item: PublicoLead, index: number) => { variant: 'A' | 'B'; text: string };
}

const NA_FILA = 'fila';
const STATUS_CONCLUIDO = 'concluido';
const STATUS_AGENDADO = 'agendado';
const RESPONDIDA = 'respondida';

const channelLabel = (id: string): string => CHANNELS.find((c) => c.id === id)?.label ?? id;

/** "2026-09-09" → "09/09/2026" (nome padrão do disparo). */
function brToday(): string {
  const [y, m, d] = todaySp().split('-');
  return `${d}/${m}/${y}`;
}

@Injectable()
export class DisparosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly messages: MessagesService,
  ) {}

  // ── prévia e criação ────────────────────────────────────────
  /**
   * Prévia do lote — `Disparos.tsx:58-91`. Não grava nada: é a tela mostrando
   * quantos recebem, quantos caíram no bloqueio e na trava, quando termina e
   * como ficam as 5 primeiras mensagens de verdade.
   */
  async preview(dto: PreviewDisparoDto, user: AuthUser): Promise<DisparoPreviewView> {
    const tpl = await this.templateOrFail(dto.template_id);
    const plano = await this.plan(dto, tpl, user);
    return {
      audience: plano.audience,
      sendable: plano.sendable.length,
      blocked: plano.blocked,
      dupes: plano.dupes,
      first_at: plano.first_at,
      eta: plano.eta,
      previews: plano.sendable.slice(0, 5).map((item, i) => {
        const { variant, text } = plano.render(item, i);
        return { lead_id: item.lead.id, name: item.lead.name, city: item.lead.city, variant, text };
      }),
      freela: null,
    };
  }

  /**
   * Monta o disparo e a fila de envios — `store.tsx:588-646`. O texto de cada
   * mensagem é renderizado AGORA e guardado: mudar o modelo depois não reescreve
   * o que já está na fila (é o que a pessoa revisou na prévia).
   */
  async create(dto: CreateDisparoDto, user: AuthUser): Promise<CreateDisparoResult> {
    const tpl = await this.templateOrFail(dto.template_id);
    // Antes de qualquer consulta pesada: no modo `freela` quem envia é a
    // campanha do Freela, e sem conexão não há para onde mandar.
    if (dto.mode === 'freela' && !isFreelaConfigured()) {
      throw new ServiceUnavailableException({
        code: 'FREELA_NOT_CONFIGURED',
        message: FREELA_NOT_CONFIGURED_MESSAGE,
      });
    }

    const plano = await this.plan(dto, tpl, user);
    if (plano.sendable.length === 0) {
      throw new BadRequestException({
        code: 'NO_RECIPIENTS',
        message:
          'Ninguém pode receber este disparo: o público está vazio ou todos caíram na lista de bloqueio ou na trava de 30 dias.',
      });
    }

    // Render fora da transação: montar 2.000 textos com a transação aberta
    // seguraria a conexão por nada.
    const sends = plano.sendable.map((item, i) => {
      const { variant, text } = plano.render(item, i);
      return {
        template_id: tpl.id,
        variant,
        lead_id: item.lead.id,
        channel: tpl.channel,
        text,
        mode: dto.mode,
        scheduled_at: new Date(plano.times[i] ?? plano.first_at),
        status: NA_FILA,
        stage_at_send: item.lead.stage,
      };
    });

    const id = await this.prisma.$transaction(async (tx) => {
      const disparo = await tx.disparos.create({
        data: {
          name: dto.name?.trim() || `${tpl.name} · ${brToday()}`,
          scheduled_at: new Date(plano.first_at),
          mode: dto.mode,
          template_id: tpl.id,
          split: plano.split,
          channel: tpl.channel,
          by: user.id,
          filters: this.toFiltersJson(dto.filters),
          skipped_block: plano.blocked,
          skipped_dup: plano.dupes,
          status: STATUS_AGENDADO,
        },
      });
      await tx.msg_sends.createMany({ data: sends.map((s) => ({ ...s, disparo_id: disparo.id })) });
      return disparo.id;
    });

    return {
      id,
      created: sends.length,
      skipped_block: plano.blocked,
      skipped_dup: plano.dupes,
    };
  }

  // ── leitura ─────────────────────────────────────────────────
  async list(): Promise<DisparoView[]> {
    const rows = await this.prisma.disparos.findMany({
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      include: { sends: { select: { status: true } } },
    });
    const nomes = await this.templateNames(rows.map((r) => r.template_id));
    return rows.map((r) => this.toDisparoView(r, nomes.get(r.template_id), r.sends));
  }

  /** Painel do disparo — `Disparos.tsx:385-437`. */
  async get(id: string): Promise<DisparoDetailView> {
    const row = await this.disparoOrFail(id);
    const nomes = await this.templateNames([row.template_id]);
    const leadIds = [...new Set(row.sends.map((s) => s.lead_id))];
    // "Entraram no bloqueio": quem recebeu deste disparo e está na lista hoje —
    // é o preço que o lote cobrou, o número que faz revisar o texto.
    const blockedAfter = leadIds.length
      ? await this.prisma.blocklist.count({ where: { lead_id: { in: leadIds } } })
      : 0;

    const byHour = Array.from({ length: 24 }, () => 0);
    for (const s of row.sends) {
      if (s.status === RESPONDIDA && s.replied_at) byHour[hourSp(s.replied_at)]! += 1;
    }

    return {
      disparo: this.toDisparoView(row, nomes.get(row.template_id), row.sends),
      stats: {
        queued: row.sends.filter((s) => s.status === NA_FILA).length,
        sent: row.sends.filter((s) => s.status !== NA_FILA).length,
        delivered: row.sends.filter((s) => s.status === 'entregue' || s.status === RESPONDIDA).length,
        replied: row.sends.filter((s) => s.status === RESPONDIDA).length,
        // Avançou de etapa depois de receber (a etapa do lead subiu em relação
        // à que ele tinha na hora do envio).
        advanced: row.sends.filter((s) => s.lead.stage > s.stage_at_send).length,
        blocked_after: blockedAfter,
      },
      by_hour: byHour,
      sends: row.sends.map((s) => this.toSendView(s)),
    };
  }

  /**
   * Apaga o disparo e a fila dele (cascata em `msg_sends`). Só admin: o
   * caminho normal é deixar o histórico. Existe para limpar disparo de teste
   * (é o que o smoke usa) e lote montado errado.
   */
  async remove(id: string): Promise<{ ok: true }> {
    await this.disparoOrFail(id);
    await this.prisma.disparos.delete({ where: { id } });
    return { ok: true };
  }

  // ── fila manual ─────────────────────────────────────────────
  /**
   * Marca o envio como enviado/entregue — `store.tsx:648-682`. `enviada` é o
   * toque de verdade: grava evento na timeline do lead e zera o contador de
   * dias parado. `entregue` só confirma a entrega, sem novo evento.
   */
  async mark(id: string, dto: MarkSendDto, user: AuthUser): Promise<SendView> {
    const send = await this.sendOrFail(id);
    const at = new Date();
    const writes: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.msg_sends.update({
        where: { id },
        // `sent_at` não é reescrito: marcar entregue depois de enviada mantém a
        // hora em que a mensagem saiu.
        data: { status: dto.status, sent_at: send.sent_at ?? at },
      }),
    ];
    if (dto.status === 'enviada') {
      const nome = await this.templateName(send.template_id);
      writes.push(
        this.prisma.lead_events.create({
          data: {
            lead_id: send.lead_id,
            at,
            author_id: user.id,
            kind: 'msg_out',
            text: `${nome} (variação ${send.variant}) enviada por ${channelLabel(send.channel)}.`,
          },
        }),
        this.prisma.leads.update({ where: { id: send.lead_id }, data: { last_contact_at: at } }),
      );
    }
    await this.prisma.$transaction(writes);
    if (send.disparo_id) await this.settle(send.disparo_id);
    return this.toSendView(await this.sendOrFail(id));
  }

  /**
   * Registra a resposta do lead — `store.tsx:684-710`. Resposta que pede para
   * parar entra na lista de bloqueio na hora: é o que garante que o próximo
   * disparo não vai bater na mesma porta.
   */
  async reply(id: string, dto: ReplySendDto, user: AuthUser): Promise<{ blocked: boolean }> {
    const send = await this.sendOrFail(id);
    const texto = dto.text.trim();
    const at = new Date();
    const blocked = isOptOut(texto);

    await this.prisma.$transaction([
      this.prisma.msg_sends.update({
        where: { id },
        // Respondeu ⇒ saiu, mesmo que ninguém tenha marcado como enviada.
        data: { status: RESPONDIDA, replied_at: at, sent_at: send.sent_at ?? at },
      }),
      this.prisma.lead_events.create({
        data: { lead_id: send.lead_id, at, author_id: user.id, kind: 'msg_in', text: texto },
      }),
      this.prisma.leads.update({ where: { id: send.lead_id }, data: { last_contact_at: at } }),
    ]);

    if (blocked) {
      await this.messages.blockIfNew({
        phone: send.lead.phone,
        name: send.lead.name,
        lead_id: send.lead_id,
        reason: `pediu para não receber: “${texto}”`,
      });
    }
    if (send.disparo_id) await this.settle(send.disparo_id);
    return { blocked };
  }

  // ── plano do lote ───────────────────────────────────────────
  /**
   * Decide o lote inteiro a partir do filtro: público, quem sai, quando cada
   * mensagem vai e como o texto fica. A prévia e a criação usam o MESMO plano
   * — é o que faz o que a pessoa revisou ser exatamente o que entra na fila
   * (inclusive a ordem, que é quem decide a variante A/B).
   */
  private async plan(dto: PreviewDisparoDto, tpl: TemplateRow, user: AuthUser): Promise<Plano> {
    const settings = await this.messages.getSettings();
    const publico = await this.audience(dto.filters);
    const bloqueados = await this.messages.blockedKeys();
    const repetidos = await this.dupLeadIds(
      tpl.id,
      publico.map((p) => p.lead.id),
    );

    const parte = partitionAudience(
      publico,
      (p) => {
        const k = phoneKey(p.lead.phone);
        return !!k && bloqueados.has(k);
      },
      (p) => repetidos.has(p.lead.id),
    );

    const start = dto.scheduled_at ? new Date(dto.scheduled_at) : new Date();
    const agendado = start.toISOString();
    // Modo `freela`: a campanha lá tem ritmo próprio (anti-bloqueio, janela,
    // opt-out), então todos saem no mesmo instante e o agendador local não
    // sorteia intervalo nenhum.
    const times =
      dto.mode === 'freela'
        ? parte.sendable.map(() => agendado)
        : scheduleTimes(parte.sendable.length, start, this.toSendSettings(settings));
    const first_at = times[0] ?? agendado;
    const eta =
      dto.mode === 'freela'
        ? // Sai de uma vez: o que sobra é a espera até a hora marcada.
          etaText(dto.scheduled_at ? [new Date().toISOString(), agendado] : [agendado])
        : etaText(times);

    const hasB = !!tpl.text_b?.trim();
    const split = dto.split && hasB;
    const pracas = await this.pracasByIds(parte.sendable.map((p) => p.lead.praca_id));
    const vizinhos = await this.messages.neighborsByCity(parte.sendable.map((p) => p.lead.city));
    const me = { name: user.name };
    const defaults = settings.template_defaults;

    return {
      audience: publico.length,
      blocked: parte.blocked,
      dupes: parte.dupes,
      sendable: parte.sendable,
      times,
      first_at,
      eta,
      split,
      render: (item, index) => {
        const variant = pickVariant(index, split, hasB);
        const body = variant === 'B' ? (tpl.text_b ?? '') : tpl.text_a;
        const l = item.lead;
        return {
          variant,
          text: renderTemplate(body, {
            lead: {
              name: l.name,
              decisor: l.decisor,
              city: l.city,
              address: l.address,
              vagas: item.vaga_date ? [{ date: item.vaga_date }] : [],
            },
            // A praça é a DO LEAD (o protótipo usava a praça ativa de quem
            // dispara na hora de gravar, e a do lead na prévia — divergência
            // que fazia a prévia mentir).
            praca: l.praca_id ? pracas.get(l.praca_id) : undefined,
            me,
            neighbor: (vizinhos.get(l.city) ?? []).find((v) => v.id !== l.id)?.name,
            defaults,
          }),
        };
      },
    };
  }

  /**
   * Público do filtro — `Disparos.tsx:58-69`. Fora: arquivado e lead de teste
   * (`is_test`) — mensagem fria não sai para "Bar de Teste QA".
   *
   * `min_stalled` fica em memória de propósito: "dias parado" é regra pura
   * (`stalledDays`, olha o último evento de contato), não uma coluna que o
   * Postgres saiba comparar.
   */
  private async audience(f: DisparoFiltersDto): Promise<PublicoLead[]> {
    const hoje = todaySp();
    const rows = await this.prisma.leads.findMany({
      where: {
        archived: false,
        is_test: false,
        ...(f.praca_id !== 'all' ? { praca_id: f.praca_id } : {}),
        ...(f.stage ? { stage: f.stage } : {}),
        ...(f.classe !== 'all' ? { classe: f.classe } : {}),
        ...(f.origem !== 'all' ? { origem: f.origem } : {}),
        ...(f.owner_id !== 'all' ? { owner_id: f.owner_id } : {}),
      },
      include: {
        ...PARA_LISTA,
        vagas: { orderBy: { date: 'asc' as const }, take: 1, select: { date: true } },
      },
      // Ordem fixa (a mesma da tela do funil): é ela que decide quem recebe A e
      // quem recebe B, então prévia e fila precisam concordar.
      orderBy: [{ stage: 'asc' }, { entered_at: 'asc' }, { created_at: 'asc' }],
    });
    return rows
      .map((r) => ({
        lead: this.leads.toListView(r, r.events, r._count.events, r._count.vagas, hoje),
        vaga_date: r.vagas[0]?.date ?? null,
      }))
      .filter((p) => !f.min_stalled || p.lead.stalled_days >= f.min_stalled);
  }

  /**
   * Quem já recebeu este modelo dentro da janela da trava. O banco corta por
   * modelo e por lead (é o que reduz volume de verdade); a janela de 30 dias é
   * decidida pela regra pura testada (`isDupSend`), não por SQL.
   */
  private async dupLeadIds(templateId: string, leadIds: string[]): Promise<Set<string>> {
    if (leadIds.length === 0) return new Set();
    const rows = await this.prisma.msg_sends.findMany({
      where: { template_id: templateId, lead_id: { in: leadIds } },
      select: { lead_id: true, template_id: true, scheduled_at: true },
    });
    const cutoff = dupCutoff();
    const out = new Set<string>();
    for (const r of rows) {
      if (isDupSend(r, templateId, cutoff)) out.add(r.lead_id);
    }
    return out;
  }

  private async pracasByIds(ids: (string | null)[]): Promise<Map<string, RenderPraca>> {
    const unicos = [...new Set(ids.filter((id): id is string => !!id))];
    const out = new Map<string, RenderPraca>();
    if (unicos.length === 0) return out;
    const rows = await this.prisma.pracas.findMany({
      where: { id: { in: unicos } },
      select: { id: true, name: true, start_date: true },
    });
    for (const p of rows) out.set(p.id, { name: p.name, start_date: p.start_date });
    return out;
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

  // ── internos ────────────────────────────────────────────────
  /** Fecha o disparo quando não sobrou ninguém na fila (`store.tsx:670-679`). */
  private async settle(disparoId: string): Promise<void> {
    const naFila = await this.prisma.msg_sends.count({
      where: { disparo_id: disparoId, status: NA_FILA },
    });
    if (naFila > 0) return;
    await this.prisma.disparos.updateMany({
      where: { id: disparoId, status: { not: STATUS_CONCLUIDO } },
      data: { status: STATUS_CONCLUIDO },
    });
  }

  private async templateOrFail(id: string): Promise<TemplateRow> {
    const row = await this.prisma.msg_templates.findUnique({
      where: { id },
      select: { id: true, name: true, channel: true, text_a: true, text_b: true },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Modelo não encontrado.' });
    return row;
  }

  /** Nome de cada modelo citado — o modelo pode ter sido apagado depois. */
  private async templateNames(ids: string[]): Promise<Map<string, string>> {
    const unicos = [...new Set(ids)];
    const out = new Map<string, string>();
    if (unicos.length === 0) return out;
    const rows = await this.prisma.msg_templates.findMany({
      where: { id: { in: unicos } },
      select: { id: true, name: true },
    });
    for (const t of rows) out.set(t.id, t.name);
    return out;
  }

  /** Nome para o texto do evento: modelo apagado vira "Mensagem" (protótipo). */
  private async templateName(id: string | null): Promise<string> {
    if (!id) return 'Mensagem';
    const row = await this.prisma.msg_templates.findUnique({ where: { id }, select: { name: true } });
    return row?.name ?? 'Mensagem';
  }

  private async disparoOrFail(id: string) {
    if (!isUuid(id)) throw this.disparoNaoAchado();
    const row = await this.prisma.disparos.findUnique({
      where: { id },
      include: {
        sends: {
          // `id` desempata: dois envios podem cair no mesmo instante quando o
          // lote é agendado no modo `freela`.
          orderBy: [{ scheduled_at: 'asc' as const }, { id: 'asc' as const }],
          include: { lead: { select: { id: true, name: true, city: true, phone: true, stage: true } } },
        },
      },
    });
    if (!row) throw this.disparoNaoAchado();
    return row;
  }

  private async sendOrFail(id: string) {
    if (!isUuid(id)) throw this.envioNaoAchado();
    const row = await this.prisma.msg_sends.findUnique({
      where: { id },
      include: { lead: { select: { id: true, name: true, city: true, phone: true, stage: true } } },
    });
    if (!row) throw this.envioNaoAchado();
    return row;
  }

  /** As 6 chaves do filtro como Json de banco — `DisparoFiltersView` na volta. */
  private toFiltersJson(f: DisparoFiltersDto): Prisma.InputJsonObject {
    return {
      praca_id: f.praca_id,
      stage: f.stage,
      classe: f.classe,
      origem: f.origem,
      owner_id: f.owner_id,
      min_stalled: f.min_stalled,
    };
  }

  private toDisparoView(
    r: {
      id: string;
      name: string;
      at: Date;
      scheduled_at: Date;
      mode: string;
      template_id: string;
      split: boolean;
      channel: string;
      by: string;
      filters: unknown;
      skipped_block: number;
      skipped_dup: number;
      status: string;
      freela_campaign_id: string | null;
    },
    templateName: string | undefined,
    sends: { status: string }[],
  ): DisparoView {
    return {
      id: r.id,
      name: r.name,
      at: r.at.toISOString(),
      scheduled_at: r.scheduled_at.toISOString(),
      mode: r.mode,
      template_id: r.template_id,
      // Modelo apagado depois do disparo: o painel mostra "—" em vez de sumir
      // com o disparo (o histórico do lote continua valendo).
      template_name: templateName ?? '—',
      split: r.split,
      channel: r.channel,
      by: r.by,
      filters: this.readFilters(r.filters),
      skipped_block: r.skipped_block,
      skipped_dup: r.skipped_dup,
      status: r.status,
      freela_campaign_id: r.freela_campaign_id,
      counts: {
        total: sends.length,
        queued: sends.filter((s) => s.status === NA_FILA).length,
        sent: sends.filter((s) => s.status !== NA_FILA).length,
      },
    };
  }

  /** `filters` é Json no banco: lixo lá não pode virar 500 aqui. */
  private readFilters(raw: unknown): DisparoFiltersView {
    const f = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<
      string,
      unknown
    >;
    const texto = (v: unknown): string => (typeof v === 'string' && v ? v : 'all');
    const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return {
      praca_id: texto(f.praca_id),
      stage: numero(f.stage),
      classe: texto(f.classe),
      origem: texto(f.origem),
      owner_id: texto(f.owner_id),
      min_stalled: numero(f.min_stalled),
    };
  }

  private toSendView(s: {
    id: string;
    lead: { id: string; name: string; city: string; phone: string };
    variant: string;
    text: string;
    status: string;
    scheduled_at: Date;
    sent_at: Date | null;
    replied_at: Date | null;
    failure_reason: string | null;
    stage_at_send: number;
  }): SendView {
    return {
      id: s.id,
      lead: { id: s.lead.id, name: s.lead.name, city: s.lead.city, phone: s.lead.phone },
      variant: s.variant,
      text: s.text,
      status: s.status,
      scheduled_at: s.scheduled_at.toISOString(),
      sent_at: s.sent_at?.toISOString() ?? null,
      replied_at: s.replied_at?.toISOString() ?? null,
      failure_reason: s.failure_reason,
      stage_at_send: s.stage_at_send,
    };
  }

  private disparoNaoAchado() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Disparo não encontrado.' });
  }

  private envioNaoAchado() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Envio não encontrado.' });
  }
}
