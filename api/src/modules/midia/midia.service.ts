import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { todaySp } from '../../common/time/dates';
import { FILL_LIMIT_H } from '../../domain/catalog/steps';
import {
  GATE_STEP_NS,
  campMetrics,
  campanhaName,
  fillHours,
  gatesOk,
  type CampMetrics,
  type GateView,
} from '../../domain/midia-rules';
import { fmtBr } from '../../domain/recurrence';
import {
  CampanhaBodyDto,
  CampanhaStatusDto,
  CampanhasQueryDto,
  CreativeBodyDto,
  CreativeStatusDto,
  DuplicateCampanhaDto,
  ProofBodyDto,
  PublishDateDto,
  ReviewCreativeDto,
  SuggestNameDto,
  TrafficBodyDto,
  TrafficDayDto,
} from './dto/midia.dto';

// ── views ──────────────────────────────────────────────────────
export interface ProofView {
  id: string;
  praca_id: string;
  kind: string;
  title: string;
}

export interface GateJustificationView {
  by: string;
  at: string;
  text: string;
}

export interface CampanhaView {
  id: string;
  name: string;
  praca_id: string;
  publico: string;
  objetivo: string;
  start: string;
  end: string;
  verba: number;
  gasto: number;
  dor: string;
  oferta: string;
  mensagem_chave: string;
  provas: string[];
  destino: string;
  kpi_name: string;
  kpi_meta: number;
  kpi_custo: number;
  cac_teto: number;
  status: string;
  gate_justification: GateJustificationView | null;
  created_at: string;
  metrics: CampMetrics;
  gate: GateView;
}

export interface CreativeCommentView {
  id: string;
  at: string;
  author: string;
  kind: string;
  text: string;
}

export interface CreativeView {
  id: string;
  campanha_id: string;
  formato: string;
  titulo: string;
  gancho: string;
  roteiro: { gancho: string; desenvolvimento: string; prova: string; cta: string };
  legenda: string;
  cta_botao: string;
  owner_id: string | null;
  due: string;
  publish_at: string | null;
  status: string;
  file_url: string;
  ia: { tool: string; prompt: string } | null;
  approved_at: string | null;
  created_at: string;
  comments: CreativeCommentView[];
}

export interface TrafficDayView {
  id: string;
  entry_id: string;
  date: string;
  investido: number;
  alcance: number;
  cliques: number;
  conversoes: number;
  auto: boolean;
}

export interface TrafficEntryView {
  id: string;
  campanha_id: string;
  plataforma: string;
  nome_la: string;
  publico: string;
  geo: string;
  verba_diaria: number;
  criativos: string[];
  manager_url: string;
  api_connected: boolean;
  days: TrafficDayView[];
}

/** Freio automático de mídia da praça (`CampTrafego.tsx:16-17`). */
export interface FillBrakeView {
  praca_id: string;
  fill_hours: number | null;
  limit_h: number;
  above: boolean;
}

/** Ordem estável das provas — `proofs` não tem `created_at` para ordenar. */
const PROOF_ORDER = [{ kind: 'asc' as const }, { title: 'asc' as const }];

/** Texto do comentário quando a aprovação vem sem palavra nenhuma. */
const APROVADO_SECO = 'Aprovado.';

/** Simulação do "puxar pela API" (`CampTrafego.tsx:182`). */
const PULL = {
  alcancePorReal: 90,
  cliquesPorReal: 1.6,
  reaisPorConversao: 110,
} as const;

type CampanhaRow = {
  id: string;
  name: string;
  praca_id: string;
  publico: string;
  objetivo: string;
  start: string;
  end: string;
  verba: number;
  gasto: number;
  dor: string;
  oferta: string;
  mensagem_chave: string;
  destino: string;
  kpi_name: string;
  kpi_meta: number;
  kpi_custo: number;
  cac_teto: number;
  status: string;
  gate_just_by: string | null;
  gate_just_at: Date | null;
  gate_just_text: string | null;
  created_at: Date;
  provas: { proof_id: string }[];
};

@Injectable()
export class MidiaService {
  constructor(private readonly prisma: PrismaService) {}

  // ── provas ───────────────────────────────────────────────────
  async listProofs(praca_id: string): Promise<ProofView[]> {
    // Praça inexistente é 404 aqui como em todo o resto da API (o `fill-brake`,
    // que recebe o MESMO DTO, já era 404): lista vazia esconderia o id errado.
    await this.pracaOrFail(praca_id);
    const rows = await this.prisma.proofs.findMany({ where: { praca_id }, orderBy: PROOF_ORDER });
    return rows.map((p) => ({ id: p.id, praca_id: p.praca_id, kind: p.kind, title: p.title }));
  }

  async createProof(dto: ProofBodyDto): Promise<ProofView> {
    await this.pracaOrFail(dto.praca_id);
    const p = await this.prisma.proofs.create({
      data: { praca_id: dto.praca_id, kind: dto.kind, title: dto.title },
    });
    return { id: p.id, praca_id: p.praca_id, kind: p.kind, title: p.title };
  }

  // ── campanhas ────────────────────────────────────────────────
  async listCampanhas(query: CampanhasQueryDto): Promise<CampanhaView[]> {
    // Idem: `?praca_id=` de praça que não existe é 404, não lista vazia.
    if (query.praca_id) await this.pracaOrFail(query.praca_id);
    const rows = await this.prisma.campanhas.findMany({
      where: query.praca_id ? { praca_id: query.praca_id } : {},
      include: { provas: { select: { proof_id: true } } },
      orderBy: [{ created_at: 'asc' }, { name: 'asc' }],
    });
    return this.toViews(rows);
  }

  async getCampanha(id: string): Promise<CampanhaView> {
    const row = await this.campanhaRow(id);
    return (await this.toViews([row]))[0]!;
  }

  suggestName(dto: SuggestNameDto): Promise<{ name: string }> {
    return this.pracaOrFail(dto.praca_id).then((praca) => ({
      name: campanhaName(praca, dto.publico, dto.objetivo, dto.start),
    }));
  }

  /** Freio do preenchimento: média de horas das vagas preenchidas da praça. */
  async fillBrake(praca_id: string): Promise<FillBrakeView> {
    await this.pracaOrFail(praca_id);
    const vagas = await this.prisma.lead_vagas.findMany({
      where: { lead: { praca_id } },
      select: { filled: true, hours: true },
    });
    const fill = fillHours(vagas);
    return { praca_id, fill_hours: fill, limit_h: FILL_LIMIT_H, above: fill != null && fill > FILL_LIMIT_H };
  }

  async createCampanha(dto: CampanhaBodyDto, user: AuthUser): Promise<CampanhaView> {
    const praca = await this.pracaOrFail(dto.praca_id);
    await this.provasOrFail(dto.praca_id, dto.provas);
    const gate = await this.gateOf(dto.praca_id);
    // Sem `status` no corpo, campanha nova nasce rascunho.
    const status = dto.status ?? 'rascunho';
    // Campanha nova nunca tem justificativa gravada: se ela já nasce fora do
    // rascunho com o portão fechado, a justificativa vem no mesmo corpo.
    const just = this.justOrFail(status, gate, null, dto.justification, user);

    const criada = await this.prisma.campanhas.create({
      data: {
        ...this.campanhaData(dto, praca, status),
        ...just,
        provas: { create: this.provasRows(dto.provas) },
      },
      include: { provas: { select: { proof_id: true } } },
    });
    return (await this.toViews([criada]))[0]!;
  }

  async replaceCampanha(id: string, dto: CampanhaBodyDto, user: AuthUser): Promise<CampanhaView> {
    const atual = await this.campanhaRow(id);
    await this.assertMesmaPraca(id, dto.praca_id, atual.praca_id);
    const praca = await this.pracaOrFail(dto.praca_id);
    await this.provasOrFail(dto.praca_id, dto.provas);
    const gate = await this.gateOf(dto.praca_id);
    // `status` ausente MANTÉM o que a campanha já tem: o briefing é uma tela de
    // texto, não pode rebaixar uma campanha ativa a rascunho por omissão.
    const status = dto.status ?? atual.status;
    // Só a MUDANÇA de status passa pelo portão: reeditar o briefing de uma
    // campanha que já saiu do rascunho não pede a justificativa outra vez.
    const just =
      status === atual.status
        ? {}
        : this.justOrFail(status, gate, this.justificationOf(atual), dto.justification, user);

    const salva = await this.prisma.$transaction(async (tx) => {
      await tx.campanha_provas.deleteMany({ where: { campanha_id: id } });
      return tx.campanhas.update({
        where: { id },
        data: {
          ...this.campanhaData(dto, praca, status),
          ...just,
          provas: { create: this.provasRows(dto.provas) },
        },
        include: { provas: { select: { proof_id: true } } },
      });
    });
    return (await this.toViews([salva]))[0]!;
  }

  async setCampanhaStatus(id: string, dto: CampanhaStatusDto, user: AuthUser): Promise<CampanhaView> {
    const atual = await this.campanhaRow(id);
    const gate = await this.gateOf(atual.praca_id);
    const just = this.justOrFail(dto.status, gate, this.justificationOf(atual), dto.justification, user);
    const salva = await this.prisma.campanhas.update({
      where: { id },
      data: { status: dto.status, ...just },
      include: { provas: { select: { proof_id: true } } },
    });
    return (await this.toViews([salva]))[0]!;
  }

  /**
   * Copia a campanha para outra praça (`store.tsx:804-829`): nome recalculado
   * para a praça de destino, provas trocadas pelas de lá, gasto zerado, de volta
   * ao rascunho e sem a justificativa antiga. Os criativos vão como "a fazer",
   * sem arquivo, sem comentário e sem aprovação. Tráfego NÃO vai: verba e
   * gerenciador são da praça de origem.
   */
  async duplicateCampanha(id: string, dto: DuplicateCampanhaDto): Promise<CampanhaView> {
    const src = await this.campanhaRow(id);
    const praca = await this.pracaOrFail(dto.praca_id);
    const criativos = await this.prisma.creatives.findMany({
      where: { campanha_id: id },
      orderBy: [{ due: 'asc' }, { created_at: 'asc' }],
    });
    const provasDestino = src.provas.length
      ? await this.prisma.proofs.findMany({
          where: { praca_id: dto.praca_id },
          orderBy: PROOF_ORDER,
          take: src.provas.length,
          select: { id: true },
        })
      : [];

    const copia = await this.prisma.campanhas.create({
      data: {
        name: campanhaName(praca, src.publico, src.objetivo, src.start),
        praca_id: dto.praca_id,
        publico: src.publico,
        objetivo: src.objetivo,
        start: src.start,
        end: src.end,
        verba: src.verba,
        gasto: 0,
        dor: src.dor,
        oferta: src.oferta,
        mensagem_chave: src.mensagem_chave,
        destino: src.destino,
        kpi_name: src.kpi_name,
        kpi_meta: src.kpi_meta,
        kpi_custo: src.kpi_custo,
        cac_teto: src.cac_teto,
        status: 'rascunho',
        provas: { create: provasDestino.map((p) => ({ proof_id: p.id })) },
        creatives: {
          create: criativos.map((c) => ({
            formato: c.formato,
            titulo: c.titulo,
            gancho: c.gancho,
            roteiro_gancho: c.roteiro_gancho,
            roteiro_desenvolvimento: c.roteiro_desenvolvimento,
            roteiro_prova: c.roteiro_prova,
            roteiro_cta: c.roteiro_cta,
            legenda: c.legenda,
            cta_botao: c.cta_botao,
            owner_id: c.owner_id,
            due: c.due,
            publish_at: c.publish_at,
            status: 'a_fazer',
            file_url: '',
            ia_tool: c.ia_tool,
            ia_prompt: c.ia_prompt,
          })),
        },
      },
      include: { provas: { select: { proof_id: true } } },
    });
    return (await this.toViews([copia]))[0]!;
  }

  /**
   * Apaga a campanha. Criativos, comentários, entradas de tráfego e dias vão
   * por cascata do banco; o lead NÃO vai — ele perde só a origem
   * (`leads.campanha_id`), porque não há FK dele para a campanha.
   */
  async removeCampanha(id: string): Promise<{ ok: true }> {
    await this.campanhaRow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.leads.updateMany({ where: { campanha_id: id }, data: { campanha_id: null } });
      await tx.campanhas.delete({ where: { id } });
    });
    return { ok: true };
  }

  // ── criativos ────────────────────────────────────────────────
  async listCreatives(campanha_id: string): Promise<CreativeView[]> {
    await this.campanhaRow(campanha_id);
    const rows = await this.prisma.creatives.findMany({
      where: { campanha_id },
      include: { comments: { orderBy: { at: 'asc' } } },
      orderBy: [{ due: 'asc' }, { created_at: 'asc' }],
    });
    return rows.map((r) => this.toCreativeView(r));
  }

  async createCreative(dto: CreativeBodyDto): Promise<CreativeView> {
    await this.campanhaRow(dto.campanha_id);
    await this.ownerOrFail(dto.owner_id);
    const row = await this.prisma.creatives.create({
      data: this.creativeData(dto),
      include: { comments: true },
    });
    return this.toCreativeView(row);
  }

  async replaceCreative(id: string, dto: CreativeBodyDto): Promise<CreativeView> {
    const atual = await this.creativeRow(id);
    // Mudar de campanha pelo PUT deixaria o id do criativo pendurado nas
    // entradas de tráfego da campanha antiga. Quem troca de campanha apaga e
    // recria (ou duplica a campanha).
    if (dto.campanha_id !== atual.campanha_id) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'campanha_id não pode ser alterado',
      });
    }
    await this.ownerOrFail(dto.owner_id);
    const row = await this.prisma.creatives.update({
      where: { id },
      data: this.creativeData(dto),
      include: { comments: { orderBy: { at: 'asc' } } },
    });
    return this.toCreativeView(row);
  }

  /**
   * Apaga o criativo. A entrada de tráfego guarda os ids num array sem FK, então
   * a limpeza é na mão: sem isso o id órfão fica no gerenciador e o próximo
   * `PUT /v1/traffic/:id` cai na validação de "criativo aprovado desta campanha".
   */
  async removeCreative(id: string): Promise<{ ok: true }> {
    const row = await this.creativeRow(id);
    await this.prisma.$transaction(async (tx) => {
      const entries = await tx.traffic_entries.findMany({
        where: { campanha_id: row.campanha_id, criativos: { has: id } },
        select: { id: true, criativos: true },
      });
      for (const e of entries) {
        await tx.traffic_entries.update({
          where: { id: e.id },
          data: { criativos: e.criativos.filter((c) => c !== id) },
        });
      }
      await tx.creatives.delete({ where: { id } });
    });
    return { ok: true };
  }

  async setCreativeStatus(id: string, dto: CreativeStatusDto): Promise<CreativeView> {
    await this.creativeRow(id);
    const row = await this.prisma.creatives.update({
      where: { id },
      data: { status: dto.status },
      include: { comments: { orderBy: { at: 'asc' } } },
    });
    return this.toCreativeView(row);
  }

  /** Mover a data de publicação deixa nota no criativo — o time precisa saber. */
  async setPublishDate(id: string, dto: PublishDateDto, user: AuthUser): Promise<CreativeView> {
    await this.creativeRow(id);
    const row = await this.prisma.creatives.update({
      where: { id },
      data: {
        publish_at: dto.date,
        comments: {
          create: {
            author: user.name,
            kind: 'nota',
            text: `Data de publicação movida para ${fmtBr(dto.date)}.`,
          },
        },
      },
      include: { comments: { orderBy: { at: 'asc' } } },
    });
    return this.toCreativeView(row);
  }

  /**
   * Revisão do criativo (`store.tsx:867-880`): aprovar joga para "aprovado" e
   * grava a hora da aprovação; pedir ajuste volta para "em produção" e APAGA a
   * aprovação anterior — o que voltou para a mesa não está mais aprovado.
   */
  async reviewCreative(id: string, dto: ReviewCreativeDto, user: AuthUser): Promise<CreativeView> {
    await this.creativeRow(id);
    const aprovou = dto.kind === 'aprovacao';
    const text = dto.text.trim();
    if (!aprovou && !text) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'text: escreva o que precisa de ajuste.',
      });
    }
    const row = await this.prisma.creatives.update({
      where: { id },
      data: {
        status: aprovou ? 'aprovado' : 'producao',
        approved_at: aprovou ? new Date() : null,
        comments: { create: { author: user.name, kind: dto.kind, text: text || APROVADO_SECO } },
      },
      include: { comments: { orderBy: { at: 'asc' } } },
    });
    return this.toCreativeView(row);
  }

  // ── tráfego ──────────────────────────────────────────────────
  async listTraffic(campanha_id: string): Promise<TrafficEntryView[]> {
    await this.campanhaRow(campanha_id);
    const rows = await this.prisma.traffic_entries.findMany({
      where: { campanha_id },
      include: { days: { orderBy: { date: 'asc' } } },
      orderBy: [{ plataforma: 'asc' }, { nome_la: 'asc' }],
    });
    return rows.map((r) => this.toTrafficView(r));
  }

  async createTraffic(dto: TrafficBodyDto): Promise<TrafficEntryView> {
    await this.campanhaRow(dto.campanha_id);
    await this.criativosOrFail(dto.campanha_id, dto.criativos);
    const row = await this.prisma.traffic_entries.create({
      data: this.trafficData(dto),
      include: { days: true },
    });
    return this.toTrafficView(row);
  }

  async replaceTraffic(id: string, dto: TrafficBodyDto): Promise<TrafficEntryView> {
    const atual = await this.trafficRow(id);
    // Mudar de campanha pelo PUT levaria a verba, o gerenciador e os dias já
    // investidos para outra campanha (e, por ela, para outra praça): o gasto
    // seria de uma e o portão/`fill-hours` de outra. Quem errou a campanha
    // apaga a entrada e cria de novo — simétrico ao guarda do criativo.
    if (dto.campanha_id !== atual.campanha_id) {
      throw new ConflictException({
        code: 'CAMPANHA_HAS_CHILDREN',
        message:
          'campanha_id não pode ser alterado: os dias já investidos são desta campanha. Apague a entrada e crie na outra campanha.',
      });
    }
    await this.campanhaRow(dto.campanha_id);
    await this.criativosOrFail(dto.campanha_id, dto.criativos);
    const row = await this.prisma.traffic_entries.update({
      where: { id },
      data: this.trafficData(dto),
      include: { days: { orderBy: { date: 'asc' } } },
    });
    return this.toTrafficView(row);
  }

  async removeTraffic(id: string): Promise<{ ok: true }> {
    await this.trafficRow(id);
    await this.prisma.traffic_entries.delete({ where: { id } });
    return { ok: true };
  }

  /** Lançamento do dia — um por data (`traffic_days` é único em entry_id+date). */
  async upsertDay(id: string, dto: TrafficDayDto): Promise<TrafficDayView> {
    await this.trafficRow(id);
    const valores = {
      investido: dto.investido,
      alcance: dto.alcance,
      cliques: dto.cliques,
      conversoes: dto.conversoes,
      auto: dto.auto,
    };
    const row = await this.prisma.traffic_days.upsert({
      where: { entry_id_date: { entry_id: id, date: dto.date } },
      update: valores,
      create: { entry_id: id, date: dto.date, ...valores },
    });
    return this.toDayView(row);
  }

  /**
   * "Puxar pela API" da plataforma. Enquanto a integração de verdade não existe,
   * o número sai da verba diária exatamente como no protótipo
   * (`CampTrafego.tsx:182`) — e só para quem marcou a API como ligada.
   */
  async pullApi(id: string): Promise<TrafficDayView> {
    const entry = await this.trafficRow(id);
    if (!entry.api_connected) {
      throw new BadRequestException({
        code: 'API_NOT_CONNECTED',
        message: 'Esta entrada não está com a API da plataforma ligada.',
      });
    }
    const verba = entry.verba_diaria;
    return this.upsertDay(id, {
      date: todaySp(),
      investido: verba,
      alcance: Math.round(verba * PULL.alcancePorReal),
      cliques: Math.round(verba * PULL.cliquesPorReal),
      conversoes: Math.max(1, Math.round(verba / PULL.reaisPorConversao)),
      auto: true,
    });
  }

  // ── montagem das views ───────────────────────────────────────
  /**
   * Números e portão das campanhas numa leitura só por tabela: entradas de
   * tráfego, dias, leads de origem e etapas das praças — nunca uma consulta por
   * campanha dentro do laço.
   */
  private async toViews(rows: CampanhaRow[]): Promise<CampanhaView[]> {
    if (!rows.length) return [];
    const ids = rows.map((c) => c.id);
    const pracaIds = [...new Set(rows.map((c) => c.praca_id))];

    const entries = await this.prisma.traffic_entries.findMany({
      where: { campanha_id: { in: ids } },
      select: { id: true, campanha_id: true },
    });
    const days = entries.length
      ? await this.prisma.traffic_days.findMany({
          where: { entry_id: { in: entries.map((e) => e.id) } },
          select: { entry_id: true, investido: true, alcance: true, cliques: true, conversoes: true },
        })
      : [];
    const leads = await this.prisma.leads.findMany({
      where: { campanha_id: { in: ids } },
      select: { campanha_id: true, stage: true },
    });
    const steps = await this.prisma.praca_step_states.findMany({
      where: { praca_id: { in: pracaIds }, step_n: { in: GATE_STEP_NS } },
      select: { praca_id: true, step_n: true, actual: true, unlocked_at: true },
    });

    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      praca_id: c.praca_id,
      publico: c.publico,
      objetivo: c.objetivo,
      start: c.start,
      end: c.end,
      verba: c.verba,
      gasto: c.gasto,
      dor: c.dor,
      oferta: c.oferta,
      mensagem_chave: c.mensagem_chave,
      provas: c.provas.map((p) => p.proof_id),
      destino: c.destino,
      kpi_name: c.kpi_name,
      kpi_meta: c.kpi_meta,
      kpi_custo: c.kpi_custo,
      cac_teto: c.cac_teto,
      status: c.status,
      gate_justification: this.justificationOf(c),
      created_at: c.created_at.toISOString(),
      metrics: campMetrics(c, entries, days, leads),
      gate: gatesOk(steps.filter((s) => s.praca_id === c.praca_id)),
    }));
  }

  private justificationOf(c: Pick<CampanhaRow, 'gate_just_by' | 'gate_just_at' | 'gate_just_text'>) {
    if (!c.gate_just_by) return null;
    return {
      by: c.gate_just_by,
      at: (c.gate_just_at ?? new Date(0)).toISOString(),
      text: c.gate_just_text ?? '',
    };
  }

  private toCreativeView(r: {
    id: string;
    campanha_id: string;
    formato: string;
    titulo: string;
    gancho: string;
    roteiro_gancho: string;
    roteiro_desenvolvimento: string;
    roteiro_prova: string;
    roteiro_cta: string;
    legenda: string;
    cta_botao: string;
    owner_id: string | null;
    due: string;
    publish_at: string | null;
    status: string;
    file_url: string;
    ia_tool: string | null;
    ia_prompt: string | null;
    approved_at: Date | null;
    created_at: Date;
    comments: { id: string; at: Date; author: string; kind: string; text: string }[];
  }): CreativeView {
    return {
      id: r.id,
      campanha_id: r.campanha_id,
      formato: r.formato,
      titulo: r.titulo,
      gancho: r.gancho,
      roteiro: {
        gancho: r.roteiro_gancho,
        desenvolvimento: r.roteiro_desenvolvimento,
        prova: r.roteiro_prova,
        cta: r.roteiro_cta,
      },
      legenda: r.legenda,
      cta_botao: r.cta_botao,
      owner_id: r.owner_id,
      due: r.due,
      publish_at: r.publish_at,
      status: r.status,
      file_url: r.file_url,
      ia: r.ia_tool ? { tool: r.ia_tool, prompt: r.ia_prompt ?? '' } : null,
      approved_at: r.approved_at ? r.approved_at.toISOString() : null,
      created_at: r.created_at.toISOString(),
      comments: r.comments.map((c) => ({
        id: c.id,
        at: c.at.toISOString(),
        author: c.author,
        kind: c.kind,
        text: c.text,
      })),
    };
  }

  private toTrafficView(r: {
    id: string;
    campanha_id: string;
    plataforma: string;
    nome_la: string;
    publico: string;
    geo: string;
    verba_diaria: number;
    criativos: string[];
    manager_url: string;
    api_connected: boolean;
    days: {
      id: string;
      entry_id: string;
      date: string;
      investido: number;
      alcance: number;
      cliques: number;
      conversoes: number;
      auto: boolean;
    }[];
  }): TrafficEntryView {
    return {
      id: r.id,
      campanha_id: r.campanha_id,
      plataforma: r.plataforma,
      nome_la: r.nome_la,
      publico: r.publico,
      geo: r.geo,
      verba_diaria: r.verba_diaria,
      criativos: r.criativos,
      manager_url: r.manager_url,
      api_connected: r.api_connected,
      days: r.days.map((d) => this.toDayView(d)),
    };
  }

  private toDayView(d: {
    id: string;
    entry_id: string;
    date: string;
    investido: number;
    alcance: number;
    cliques: number;
    conversoes: number;
    auto: boolean;
  }): TrafficDayView {
    return {
      id: d.id,
      entry_id: d.entry_id,
      date: d.date,
      investido: d.investido,
      alcance: d.alcance,
      cliques: d.cliques,
      conversoes: d.conversoes,
      auto: d.auto,
    };
  }

  // ── colunas ──────────────────────────────────────────────────
  /**
   * `name` NUNCA vem do cliente: quem monta é o servidor. `status` chega já
   * resolvido (rascunho no `POST`, o atual no `PUT` que omitiu o campo).
   */
  private campanhaData(dto: CampanhaBodyDto, praca: { name: string; city: string }, status: string) {
    return {
      name: campanhaName(praca, dto.publico, dto.objetivo, dto.start),
      praca_id: dto.praca_id,
      publico: dto.publico,
      objetivo: dto.objetivo,
      start: dto.start,
      end: dto.end,
      verba: dto.verba,
      gasto: dto.gasto,
      dor: dto.dor,
      oferta: dto.oferta,
      mensagem_chave: dto.mensagem_chave,
      destino: dto.destino,
      kpi_name: dto.kpi_name,
      kpi_meta: dto.kpi_meta,
      kpi_custo: dto.kpi_custo,
      cac_teto: dto.cac_teto,
      status,
    };
  }

  private creativeData(dto: CreativeBodyDto) {
    return {
      campanha_id: dto.campanha_id,
      formato: dto.formato,
      titulo: dto.titulo,
      gancho: dto.gancho,
      roteiro_gancho: dto.roteiro.gancho,
      roteiro_desenvolvimento: dto.roteiro.desenvolvimento,
      roteiro_prova: dto.roteiro.prova,
      roteiro_cta: dto.roteiro.cta,
      legenda: dto.legenda,
      cta_botao: dto.cta_botao,
      owner_id: dto.owner_id,
      due: dto.due,
      publish_at: dto.publish_at,
      status: dto.status,
      file_url: dto.file_url,
      ia_tool: dto.ia ? dto.ia.tool : null,
      ia_prompt: dto.ia ? dto.ia.prompt : null,
    };
  }

  private trafficData(dto: TrafficBodyDto) {
    return {
      campanha_id: dto.campanha_id,
      plataforma: dto.plataforma,
      nome_la: dto.nome_la,
      publico: dto.publico,
      geo: dto.geo,
      verba_diaria: dto.verba_diaria,
      criativos: dto.criativos,
      manager_url: dto.manager_url,
      api_connected: dto.api_connected,
    };
  }

  // ── guardas ──────────────────────────────────────────────────
  /** Provas sem repetição: id repetido violaria a PK de `campanha_provas`. */
  private provasRows(provas: string[]) {
    return [...new Set(provas)].map((proof_id) => ({ proof_id }));
  }

  private async pracaOrFail(id: string): Promise<{ name: string; city: string }> {
    if (!isUuid(id)) throw this.pracaNaoAchada();
    const praca = await this.prisma.pracas.findUnique({ where: { id }, select: { name: true, city: true } });
    if (!praca) throw this.pracaNaoAchada();
    return praca;
  }

  private async campanhaRow(id: string): Promise<CampanhaRow> {
    if (!isUuid(id)) throw this.campanhaNaoAchada();
    const row = await this.prisma.campanhas.findUnique({
      where: { id },
      include: { provas: { select: { proof_id: true } } },
    });
    if (!row) throw this.campanhaNaoAchada();
    return row;
  }

  private async creativeRow(id: string) {
    if (!isUuid(id)) throw this.criativoNaoAchado();
    const row = await this.prisma.creatives.findUnique({ where: { id } });
    if (!row) throw this.criativoNaoAchado();
    return row;
  }

  private async trafficRow(id: string) {
    if (!isUuid(id)) throw this.entradaNaoAchada();
    const row = await this.prisma.traffic_entries.findUnique({ where: { id } });
    if (!row) throw this.entradaNaoAchada();
    return row;
  }

  /**
   * O `PUT` do briefing NÃO muda a praça de uma campanha que já tem filho.
   *
   * As provas são revalidadas, mas `creatives` e `traffic_entries` (verba,
   * gerenciador, dias já investidos) iriam junto: o portão (`gateOf`) e o
   * `fill-hours` passariam a ser avaliados contra a praça de destino enquanto o
   * gasto continua sendo da origem. É o vazamento que o `/duplicate` evita de
   * propósito ("Tráfego NÃO vai"). Campanha ainda sem criativo e sem tráfego
   * pode trocar: não há o que vazar.
   */
  private async assertMesmaPraca(id: string, nova: string, atual: string): Promise<void> {
    if (nova === atual) return;
    const [criativos, trafego] = await Promise.all([
      this.prisma.creatives.count({ where: { campanha_id: id } }),
      this.prisma.traffic_entries.count({ where: { campanha_id: id } }),
    ]);
    if (criativos === 0 && trafego === 0) return;
    throw new ConflictException({
      code: 'CAMPANHA_HAS_CHILDREN',
      message: `Esta campanha já tem ${criativos} criativo(s) e ${trafego} entrada(s) de tráfego desta praça. Use "Duplicar em outra praça" em vez de trocar a praça no briefing.`,
    });
  }

  /** Prova de outra praça não entra na campanha — a prova é local. */
  private async provasOrFail(praca_id: string, provas: string[]): Promise<void> {
    const ids = [...new Set(provas)];
    if (!ids.length) return;
    const achadas = await this.prisma.proofs.count({ where: { id: { in: ids }, praca_id } });
    if (achadas !== ids.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'provas: só prova desta praça entra na campanha.',
      });
    }
  }

  /**
   * No gerenciador só entra criativo DESTA campanha — o status não filtra.
   * No protótipo o filtro de "aprovado" era só a lista de caixas da tela; o que
   * já estava salvo na entrada continuava salvo. Filtrar aqui derrubaria um
   * `PUT` que devolve a própria entrada assim que alguém pedisse ajuste numa
   * peça que já estava no ar.
   */
  private async criativosOrFail(campanha_id: string, criativos: string[]): Promise<void> {
    const ids = [...new Set(criativos)];
    if (!ids.length) return;
    const achados = await this.prisma.creatives.count({ where: { id: { in: ids }, campanha_id } });
    if (achados !== ids.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'criativos: só criativo desta campanha entra no gerenciador.',
      });
    }
  }

  private async ownerOrFail(owner_id: string | null): Promise<void> {
    if (!owner_id) return;
    const achado = await this.prisma.users.count({ where: { id: owner_id } });
    if (!achado) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'owner_id: pessoa não encontrada.',
      });
    }
  }

  /**
   * O freio de mídia do playbook: sair do rascunho com o portão fechado exige
   * justificativa ESCRITA, e ela fica gravada com autor e hora. Campanha que já
   * tem justificativa não é cobrada de novo.
   */
  private justOrFail(
    status: string,
    gate: GateView,
    anterior: GateJustificationView | null,
    justification: string | undefined,
    user: AuthUser,
  ) {
    if (status === 'rascunho' || gate.ok || anterior) return {};
    if (!justification) {
      throw new BadRequestException({
        code: 'GATE_JUSTIFICATION_REQUIRED',
        message: 'Esta praça ainda não bateu o portão. Escreva a justificativa (mínimo 10 caracteres).',
      });
    }
    return { gate_just_by: user.name, gate_just_at: new Date(), gate_just_text: justification };
  }

  private async gateOf(praca_id: string): Promise<GateView> {
    const steps = await this.prisma.praca_step_states.findMany({
      where: { praca_id, step_n: { in: GATE_STEP_NS } },
      select: { step_n: true, actual: true, unlocked_at: true },
    });
    return gatesOk(steps);
  }

  private pracaNaoAchada() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
  }

  private campanhaNaoAchada() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Campanha não encontrada.' });
  }

  private criativoNaoAchado() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Criativo não encontrado.' });
  }

  private entradaNaoAchada() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Entrada de tráfego não encontrada.' });
  }
}
