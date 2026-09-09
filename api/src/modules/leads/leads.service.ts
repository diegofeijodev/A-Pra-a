import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { phoneKey } from '../../common/phone/phone';
import { addDays, todaySp } from '../../common/time/dates';
import { CONTACT_KINDS, FUNNEL_STAGES } from '../../domain/catalog';
import {
  daysSince,
  estValue,
  isCritical,
  isStalled,
  lastContactDate,
  stalledDays,
  type LeadRules,
} from '../../domain/lead-rules';
import {
  CreateLeadDto,
  CreateLeadEventDto,
  CreateLeadVagaDto,
  LeadsMetricsQueryDto,
  ListLeadsQueryDto,
  MoveLeadDto,
  NextStepDto,
  SnoozeLeadDto,
  UpdateLeadDto,
} from './dto/leads.dto';

export interface LeadEventView {
  id: string;
  at: string;
  author_id: string | null;
  author_label: string | null;
  kind: string;
  text: string;
  stage_to: number | null;
}

export interface LeadVagaView {
  id: string;
  date: string;
  funcao: string;
  filled: boolean;
  hours: number | null;
}

export interface LeadListView {
  id: string;
  praca_id: string | null;
  name: string;
  city: string;
  address: string;
  phone: string;
  cnpj: string | null;
  instagram: string | null;
  site: string | null;
  decisor: string;
  decisor_role: string;
  classe: string;
  origem: string;
  owner_id: string | null;
  stage: number;
  entered_at: string;
  stage_since: string;
  last_contact_at: string | null;
  last_contact_date: string | null;
  stalled_days: number;
  est_value: number;
  next_step: { what: string; date: string } | null;
  lost_reason: string | null;
  reheat_at: string | null;
  archived: boolean;
  import_batch_id: string | null;
  possible_dup: boolean;
  snooze_until: string | null;
  campanha_id: string | null;
  form_answer: string | null;
  is_test: boolean;
  events_count: number;
  vagas_count: number;
}

export interface LeadView extends LeadListView {
  events: LeadEventView[];
  vagas: LeadVagaView[];
}

export interface LeadsMetricsView {
  total: number;
  conv_contact: number;
  conv_active: number;
  avg_days: number;
  stalled: number;
  critical: number;
  lost: number;
  pipeline: number;
}

/** Colunas de `leads` — o que o `toListView` precisa ver. */
export interface LeadColumns {
  id: string;
  praca_id: string | null;
  name: string;
  city: string;
  address: string;
  phone: string;
  cnpj: string | null;
  instagram: string | null;
  site: string | null;
  decisor: string;
  decisor_role: string;
  classe: string;
  origem: string;
  owner_id: string | null;
  stage: number;
  entered_at: string;
  stage_since: string;
  last_contact_at: Date | null;
  next_step_what: string | null;
  next_step_date: string | null;
  lost_reason: string | null;
  reheat_at: string | null;
  archived: boolean;
  import_batch_id: string | null;
  possible_dup: boolean;
  snooze_until: string | null;
  campanha_id: string | null;
  form_answer: string | null;
  is_test: boolean;
}

interface EventoRow {
  id: string;
  at: Date;
  author_id: string | null;
  author_label: string | null;
  kind: string;
  text: string;
  stage_to: number | null;
}

interface VagaRow {
  id: string;
  date: string;
  funcao: string;
  filled: boolean;
  hours: number | null;
}

/**
 * Include da LISTA: dos eventos, só o último contato — é tudo que
 * `stalledDays` precisa. Carregar a timeline inteira de cada lead só para
 * contar dias parados derrubaria a tela do funil numa base importada.
 */
export const PARA_LISTA = {
  events: {
    where: { kind: { in: CONTACT_KINDS as string[] } },
    orderBy: { at: 'desc' },
    take: 1,
    select: { at: true, kind: true },
  },
  _count: { select: { events: true, vagas: true } },
} as const;

/** Include do detalhe: timeline inteira e as vagas. */
const COM_TUDO = {
  // `id` como desempate: dois eventos gravados no mesmo milissegundo (mover de
  // etapa grava lead + evento juntos) precisam sair sempre na mesma ordem.
  // Sem `as const` no objeto todo: `readonly [...]` não serve de `orderBy` para
  // o Prisma — o literal é fixado campo a campo.
  events: { orderBy: [{ at: 'asc' as const }, { id: 'asc' as const }] },
  vagas: { orderBy: { date: 'asc' as const } },
};

const stageName = (n: number): string => FUNNEL_STAGES.find((s) => s.n === n)?.name ?? '?';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── leitura ─────────────────────────────────────────────────
  async list(query: ListLeadsQueryDto): Promise<LeadListView[]> {
    const hoje = todaySp();
    const busca = query.q?.trim();
    const rows = await this.prisma.leads.findMany({
      where: {
        // Arquivado só aparece quando pedido — em `true` a lista traz os dois.
        ...(query.archived === 'true' ? {} : { archived: false }),
        ...(query.praca_id ? { praca_id: query.praca_id } : {}),
        ...(query.owner_id ? { owner_id: query.owner_id } : {}),
        ...(query.classe ? { classe: query.classe } : {}),
        ...(query.stage ? { stage: query.stage } : {}),
        ...(query.campanha_id ? { campanha_id: query.campanha_id } : {}),
        ...(busca
          ? {
              OR: [
                { name: { contains: busca, mode: 'insensitive' as const } },
                { city: { contains: busca, mode: 'insensitive' as const } },
                { decisor: { contains: busca, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: PARA_LISTA,
      orderBy: [{ stage: 'asc' }, { entered_at: 'asc' }, { created_at: 'asc' }],
    });
    return rows.map((r) => this.toListView(r, r.events, r._count.events, r._count.vagas, hoje));
  }

  async get(id: string): Promise<LeadView> {
    const lead = await this.findOrFail(id);
    return this.toView(lead, lead.events, lead.vagas, todaySp());
  }

  /** Leads sem praça — órfãos de importação ou de praça apagada. */
  async orphans(): Promise<LeadListView[]> {
    const hoje = todaySp();
    const pracas = await this.prisma.pracas.findMany({ select: { id: true } });
    const ids = pracas.map((p) => p.id);
    const rows = await this.prisma.leads.findMany({
      where: {
        archived: false,
        // `praca_id` tem FK com `onDelete: SetNull`, então na prática o órfão
        // é o de praça nula; o `notIn` é o cinto de segurança.
        OR: [{ praca_id: null }, ...(ids.length ? [{ praca_id: { notIn: ids } }] : [])],
      },
      include: PARA_LISTA,
      orderBy: [{ created_at: 'asc' }],
    });
    return rows.map((r) => this.toListView(r, r.events, r._count.events, r._count.vagas, hoje));
  }

  /** Painel do funil — `routes/funil.tsx:56-77`, sempre só sobre os não arquivados. */
  async metrics(query: LeadsMetricsQueryDto): Promise<LeadsMetricsView> {
    const hoje = todaySp();
    if (query.praca_id) await this.pracaOrFail(query.praca_id);
    const rows = await this.prisma.leads.findMany({
      where: { archived: false, ...(query.praca_id ? { praca_id: query.praca_id } : {}) },
      include: PARA_LISTA,
    });
    const leads = rows.map((r) => ({
      stage: r.stage,
      entered_at: r.entered_at,
      classe: r.classe,
      rules: this.toRules(r, r.events),
    }));

    const contatados = leads.filter((l) => l.stage >= 2).length;
    const cadastrados = leads.filter((l) => l.stage >= 5).length;
    const ativos = leads.filter((l) => l.stage === 7).length;
    // Dias até cadastrar: da entrada até o último toque (tira o tempo parado).
    const tempos = leads
      .filter((l) => l.stage >= 5)
      .map((l) => daysSince(l.entered_at, hoje) - stalledDays(l.rules, hoje))
      .filter((n) => n > 0);

    return {
      total: leads.length,
      conv_contact: contatados ? Math.round((cadastrados / contatados) * 100) : 0,
      conv_active: cadastrados ? Math.round((ativos / cadastrados) * 100) : 0,
      avg_days: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0,
      stalled: leads.filter((l) => isStalled(l.rules, hoje)).length,
      critical: leads.filter((l) => isCritical(l.rules, hoje)).length,
      lost: leads.filter((l) => l.stage === 8).length,
      pipeline: leads.filter((l) => l.stage >= 1 && l.stage <= 6).reduce((a, l) => a + estValue(l.classe), 0),
    };
  }

  // ── escrita ─────────────────────────────────────────────────
  async create(dto: CreateLeadDto): Promise<LeadView> {
    if (dto.praca_id) await this.pracaOrFail(dto.praca_id);
    await this.assertPessoa(dto.owner_id);
    if (dto.campanha_id) await this.assertCampanha(dto.campanha_id);
    const hoje = todaySp();
    const criado = await this.prisma.leads.create({
      data: {
        praca_id: dto.praca_id ?? null,
        name: dto.name.trim(),
        ...this.camposEditaveis(dto),
        owner_id: dto.owner_id,
        stage: dto.stage ?? 1,
        entered_at: hoje,
        stage_since: hoje,
      },
    });
    return this.get(criado.id);
  }

  async update(id: string, dto: UpdateLeadDto): Promise<LeadView> {
    await this.findOrFail(id);
    if (dto.praca_id) await this.pracaOrFail(dto.praca_id);
    if (dto.owner_id) await this.assertPessoa(dto.owner_id);
    if (dto.campanha_id) await this.assertCampanha(dto.campanha_id);
    await this.prisma.leads.update({
      where: { id },
      data: {
        ...(dto.praca_id ? { praca_id: dto.praca_id } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.owner_id ? { owner_id: dto.owner_id } : {}),
        ...this.camposEditaveis(dto),
      },
    });
    return this.get(id);
  }

  /**
   * Move de etapa — `store.tsx:442-467`. Etapa 8 exige motivo; as outras
   * exigem próximo passo (lead sem próximo passo é lead esquecido). Sair da
   * 8 limpa motivo e reaquecimento.
   */
  async move(id: string, dto: MoveLeadDto, user: AuthUser): Promise<LeadView> {
    const lead = await this.findOrFail(id);
    if (dto.stage === lead.stage) {
      throw new BadRequestException({
        code: 'SAME_STAGE',
        message: 'O lead já está nessa etapa.',
      });
    }
    if (dto.stage === 8 && !dto.lost_reason) {
      throw new BadRequestException({
        code: 'LOST_REASON_REQUIRED',
        message: 'Para marcar como perdido, diga o motivo.',
      });
    }
    if (dto.stage !== 8 && !dto.next_step) {
      throw new BadRequestException({
        code: 'NEXT_STEP_REQUIRED',
        message: 'Diga qual é o próximo passo e para quando.',
      });
    }

    const hoje = todaySp();
    const voltou = dto.stage < lead.stage;
    const text =
      `${voltou ? 'Voltou etapa' : 'Mudou de etapa'}: ${stageName(lead.stage)} → ${stageName(dto.stage)}` +
      (dto.lost_reason ? ` · motivo: ${dto.lost_reason}` : '');

    await this.prisma.$transaction([
      this.prisma.leads.update({
        where: { id },
        data: {
          stage: dto.stage,
          stage_since: hoje,
          ...(dto.next_step ? this.nextStepData(dto.next_step) : {}),
          ...(dto.stage === 8
            ? {
                lost_reason: dto.lost_reason,
                // "não respondeu" volta para a fila daqui a 30 dias.
                reheat_at: dto.lost_reason === 'não respondeu' ? addDays(hoje, 30) : null,
              }
            : { lost_reason: null, reheat_at: null }),
        },
      }),
      this.prisma.lead_events.create({
        data: { lead_id: id, author_id: user.id, kind: 'stage', text, stage_to: dto.stage },
      }),
    ]);
    return this.get(id);
  }

  async addEvent(id: string, dto: CreateLeadEventDto, user: AuthUser): Promise<LeadView> {
    await this.findOrFail(id);
    const at = new Date();
    const evento = this.prisma.lead_events.create({
      data: { lead_id: id, at, author_id: user.id, kind: dto.kind, text: dto.text.trim() },
    });
    // Nota não é contato: não zera o contador de dias parado.
    if ((CONTACT_KINDS as string[]).includes(dto.kind)) {
      await this.prisma.$transaction([
        evento,
        this.prisma.leads.update({ where: { id }, data: { last_contact_at: at } }),
      ]);
    } else {
      await evento;
    }
    return this.get(id);
  }

  async setNextStep(id: string, dto: NextStepDto): Promise<LeadView> {
    await this.findOrFail(id);
    await this.prisma.leads.update({ where: { id }, data: this.nextStepData(dto) });
    return this.get(id);
  }

  async archive(id: string, user: AuthUser): Promise<LeadView> {
    await this.findOrFail(id);
    await this.prisma.$transaction([
      this.prisma.leads.update({ where: { id }, data: { archived: true } }),
      this.prisma.lead_events.create({
        data: {
          lead_id: id,
          author_id: user.id,
          kind: 'note',
          text: 'Lead arquivado (histórico mantido).',
        },
      }),
    ]);
    return this.get(id);
  }

  /** Soneca: tira da fila do dia até a data escolhida (sem evento, como no protótipo). */
  async snooze(id: string, dto: SnoozeLeadDto): Promise<LeadView> {
    await this.findOrFail(id);
    await this.prisma.leads.update({ where: { id }, data: { snooze_until: dto.until } });
    return this.get(id);
  }

  async addVaga(id: string, dto: CreateLeadVagaDto): Promise<LeadView> {
    await this.findOrFail(id);
    await this.prisma.lead_vagas.create({
      data: {
        lead_id: id,
        date: dto.date,
        funcao: dto.funcao.trim(),
        filled: dto.filled,
        hours: dto.hours ?? null,
      },
    });
    return this.get(id);
  }

  /**
   * Apaga de vez (eventos, vagas, envios e inscrições vão junto, por cascata).
   * Só admin: o caminho normal é arquivar, que mantém o histórico. Existe para
   * limpar lead de teste (é o que o smoke usa) e importação errada.
   */
  async remove(id: string): Promise<{ ok: true }> {
    await this.findOrFail(id);
    await this.prisma.leads.delete({ where: { id } });
    return { ok: true };
  }

  // ── internos ────────────────────────────────────────────────
  /** Campos que POST e PATCH escrevem igual — `phone` traz o `phone_key` junto. */
  private camposEditaveis(dto: CreateLeadDto | UpdateLeadDto) {
    return {
      ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
      ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim(), phone_key: phoneKey(dto.phone) } : {}),
      ...(dto.cnpj !== undefined ? { cnpj: dto.cnpj.trim() } : {}),
      ...(dto.instagram !== undefined ? { instagram: dto.instagram.trim() } : {}),
      ...(dto.site !== undefined ? { site: dto.site.trim() } : {}),
      ...(dto.decisor !== undefined ? { decisor: dto.decisor.trim() } : {}),
      ...(dto.decisor_role !== undefined ? { decisor_role: dto.decisor_role.trim() } : {}),
      ...(dto.classe !== undefined ? { classe: dto.classe } : {}),
      ...(dto.origem !== undefined ? { origem: dto.origem } : {}),
      ...(dto.campanha_id !== undefined ? { campanha_id: dto.campanha_id } : {}),
    };
  }

  private nextStepData(next: NextStepDto) {
    return { next_step_what: next.what.trim(), next_step_date: next.date };
  }

  private async assertPessoa(id: string) {
    const achou = await this.prisma.users.count({ where: { id } });
    if (!achou) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pessoa não encontrada.' });
  }

  private async assertCampanha(id: string) {
    const achou = await this.prisma.campanhas.count({ where: { id } });
    if (!achou) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campanha não encontrada.' });
    }
  }

  private async pracaOrFail(id: string) {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const praca = await this.prisma.pracas.findUnique({ where: { id } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    return praca;
  }

  private async findOrFail(id: string) {
    if (!isUuid(id)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lead não encontrado.' });
    const lead = await this.prisma.leads.findUnique({ where: { id }, include: COM_TUDO });
    if (!lead) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lead não encontrado.' });
    return lead;
  }

  /** O recorte do lead que as regras puras enxergam. */
  private toRules(lead: LeadColumns, eventos: { at: Date; kind: string }[]): LeadRules {
    return {
      stage: lead.stage,
      stage_since: lead.stage_since,
      archived: lead.archived,
      classe: lead.classe,
      last_contact_at: lead.last_contact_at?.toISOString() ?? null,
      events: eventos.map((e) => ({ at: e.at.toISOString(), kind: e.kind })),
    };
  }

  /**
   * Linha do funil. `eventos` pode ser só o último contato (lista) ou a
   * timeline inteira (detalhe) — `lastContactDate` dá o mesmo resultado nos
   * dois casos. Público porque a fila do dia (`QueueService`) monta a mesma
   * linha.
   */
  toListView(
    lead: LeadColumns,
    eventos: { at: Date; kind: string }[],
    eventsCount: number,
    vagasCount: number,
    today: string,
  ): LeadListView {
    const rules = this.toRules(lead, eventos);
    return {
      id: lead.id,
      praca_id: lead.praca_id,
      name: lead.name,
      city: lead.city,
      address: lead.address,
      phone: lead.phone,
      cnpj: lead.cnpj,
      instagram: lead.instagram,
      site: lead.site,
      decisor: lead.decisor,
      decisor_role: lead.decisor_role,
      classe: lead.classe,
      origem: lead.origem,
      owner_id: lead.owner_id,
      stage: lead.stage,
      entered_at: lead.entered_at,
      stage_since: lead.stage_since,
      last_contact_at: lead.last_contact_at?.toISOString() ?? null,
      last_contact_date: lastContactDate(rules) ?? null,
      stalled_days: stalledDays(rules, today),
      est_value: estValue(lead.classe),
      next_step:
        lead.next_step_what !== null && lead.next_step_date !== null
          ? { what: lead.next_step_what, date: lead.next_step_date }
          : null,
      lost_reason: lead.lost_reason,
      reheat_at: lead.reheat_at,
      archived: lead.archived,
      import_batch_id: lead.import_batch_id,
      possible_dup: lead.possible_dup,
      snooze_until: lead.snooze_until,
      campanha_id: lead.campanha_id,
      form_answer: lead.form_answer,
      is_test: lead.is_test,
      events_count: eventsCount,
      vagas_count: vagasCount,
    };
  }

  private toView(lead: LeadColumns, eventos: EventoRow[], vagas: VagaRow[], today: string): LeadView {
    return {
      ...this.toListView(lead, eventos, eventos.length, vagas.length, today),
      events: eventos.map((e) => ({
        id: e.id,
        at: e.at.toISOString(),
        author_id: e.author_id,
        author_label: e.author_label,
        kind: e.kind,
        text: e.text,
        stage_to: e.stage_to,
      })),
      vagas: vagas.map((v) => ({
        id: v.id,
        date: v.date,
        funcao: v.funcao,
        filled: v.filled,
        hours: v.hours,
      })),
    };
  }
}
