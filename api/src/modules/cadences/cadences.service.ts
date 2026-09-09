import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { phoneKey } from '../../common/phone/phone';
import { todaySp } from '../../common/time/dates';
import { SEED_CADENCES, seedCadenceNodeRows } from '../../domain/catalog/cadences';
import { stepDueAt, stepIndexOf, stepNodes } from '../../domain/cadence-rules';
import {
  CadenceBodyDto,
  CadenceNodeDto,
  EnrollLeadDto,
  EnrollmentsQueryDto,
  ExitEnrollmentDto,
  TestCadenceDto,
} from './dto/cadences.dto';

// ── views ──────────────────────────────────────────────────────
export interface CadenceNodeView {
  id: string;
  sort: number;
  kind: string;
  day: number;
  channel: string | null;
  template_id: string | null;
  text: string | null;
  task: string | null;
  rule: string | null;
  action: string | null;
  note: string | null;
}

export interface CadenceView {
  id: string;
  name: string;
  audience: string;
  entry: string;
  exit: { action: string; note: string };
  paused: boolean;
  created_at: string;
  nodes: CadenceNodeView[];
}

export interface EnrollmentLogView {
  node_id: string;
  at: string;
  send_id: string | null;
  kind: string;
}

export interface EnrollmentView {
  id: string;
  cadence_id: string;
  lead_id: string;
  started_at: string;
  next_at: string;
  status: string;
  exit_reason: string | null;
  stage_at_start: number;
  is_test: boolean;
  logs: EnrollmentLogView[];
}

export interface CadenceStepStatsView {
  node: CadenceNodeView;
  here: number;
  reached: number;
  replied: number;
  resp_rate: number;
}

export interface CadenceInsideView {
  enrollment_id: string;
  lead_id: string;
  lead_name: string;
  status: string;
  step_index: number;
  next_at: string;
}

export interface CadenceStatsView {
  entered: number;
  active: number;
  per_step: CadenceStepStatsView[];
  exits: { reason: string; count: number }[];
  advanced: number;
  inside: CadenceInsideView[];
}

export interface EnrollResult {
  ok: boolean;
  waiting: boolean;
}

// ── estados da inscrição ───────────────────────────────────────
export const ATIVO = 'ativo';
export const AGUARDANDO = 'aguardando';
export const SAIU = 'saiu';
export const CONCLUIDO = 'concluido';
/** Quem ainda está na cadência (aparece em "quem está dentro"). */
export const DENTRO = [ATIVO, AGUARDANDO];

/** O lead do botão "Testar comigo" — um só, reaproveitado a cada teste. */
export const TEST_LEAD_NAME = 'Teste — Cadência';
/** No teste cada dia da cadência vira 5 segundos. */
const TEST_COMPRESS_SEC = 5;
/** Quantas pessoas "quem está dentro" mostra (`Cadencias.tsx:159`). */
const INSIDE_LIMIT = 20;
/** Teto do `GET /v1/enrollments` — a tabela cresce para sempre. */
const ENROLLMENTS_LIMIT = 200;

/** Colunas de `cadence_nodes` — o que a view do nó precisa ver. */
interface NodeRow {
  id: string;
  sort: number;
  kind: string;
  day: number;
  channel: string | null;
  template_id: string | null;
  text: string | null;
  task: string | null;
  rule: string | null;
  action: string | null;
  note: string | null;
}

/** Nós sempre na ordem da trilha. */
const COM_NOS = { nodes: { orderBy: { sort: 'asc' as const } } };

@Injectable()
export class CadencesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── cadências ───────────────────────────────────────────────
  async list(): Promise<CadenceView[]> {
    const rows = await this.prisma.cadences.findMany({
      include: COM_NOS,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async get(id: string): Promise<CadenceView> {
    return this.toView(await this.cadenceOrFail(id));
  }

  /** Cria a cadência e os nós na ordem recebida (o `sort` é o índice). */
  async create(dto: CadenceBodyDto): Promise<CadenceView> {
    this.checkNodes(dto.nodes);
    await this.templatesOrFail(dto.nodes);
    const row = await this.prisma.cadences.create({
      data: {
        ...this.toCadenceData(dto),
        nodes: { create: dto.nodes.map((n, i) => ({ sort: i, ...this.toNodeData(n) })) },
      },
      include: COM_NOS,
    });
    return this.toView(row);
  }

  /**
   * Substitui a cadência inteira. Nó que volta com o `id` que já tinha é
   * ATUALIZADO no lugar; nó que não veio no corpo é apagado.
   *
   * Preservar o id é o ponto: `enrollment_logs.node_id` aponta para o nó, então
   * recriar tudo do zero (o caminho fácil) faria quem está no passo 3 voltar
   * para o passo 1 e receber a trilha de novo.
   */
  async replace(id: string, dto: CadenceBodyDto): Promise<CadenceView> {
    const atual = await this.cadenceOrFail(id);
    this.checkNodes(dto.nodes);
    await this.templatesOrFail(dto.nodes);

    const existentes = new Set(atual.nodes.map((n) => n.id));
    const manter = dto.nodes.map((n) => n.id).filter((nid): nid is string => !!nid && existentes.has(nid));

    await this.prisma.$transaction(async (tx) => {
      await tx.cadences.update({ where: { id }, data: this.toCadenceData(dto) });
      // Apaga o que saiu da trilha ANTES de reordenar: o `sort` não é único, mas
      // deixar nó órfão dentro da cadência bagunçaria a ordem dos passos.
      await tx.cadence_nodes.deleteMany({
        where: { cadence_id: id, ...(manter.length ? { id: { notIn: manter } } : {}) },
      });
      for (const [i, n] of dto.nodes.entries()) {
        const data = { sort: i, ...this.toNodeData(n) };
        if (n.id && existentes.has(n.id)) {
          await tx.cadence_nodes.update({ where: { id: n.id }, data });
        } else {
          await tx.cadence_nodes.create({ data: { cadence_id: id, ...data } });
        }
      }
    });
    return this.get(id);
  }

  /** Apaga a cadência; as inscrições e os logs vão por cascata. */
  async remove(id: string): Promise<{ ok: true }> {
    await this.cadenceOrFail(id);
    await this.prisma.cadences.delete({ where: { id } });
    return { ok: true };
  }

  /** Pausa/despausa. Pausada, o relógio não entra ninguém nem avança quem está dentro. */
  async togglePause(id: string): Promise<CadenceView> {
    const atual = await this.cadenceOrFail(id);
    await this.prisma.cadences.update({ where: { id }, data: { paused: !atual.paused } });
    return this.get(id);
  }

  /**
   * Recria as cadências-modelo que faltarem, por NOME (`Cadencias.tsx:63-67`).
   * Rodar duas vezes não duplica; a que foi editada fica como está.
   */
  async restoreSeed(): Promise<{ created: number }> {
    let created = 0;
    for (const c of SEED_CADENCES) {
      const ja = await this.prisma.cadences.count({ where: { name: c.name } });
      if (ja) continue;
      await this.prisma.cadences.create({
        data: {
          name: c.name,
          audience: c.audience,
          entry: c.entry,
          exit_action: c.exit_action,
          exit_note: c.exit_note,
          paused: c.paused,
          nodes: { create: seedCadenceNodeRows(c) },
        },
      });
      created++;
    }
    return { created };
  }

  // ── inscrições ──────────────────────────────────────────────
  /**
   * Entrada manual (`store.tsx:729-750`). `ok: false` = a pessoa já está nesta
   * cadência (ativa ou esperando), ou a cadência não tem passo nenhum.
   * `waiting: true` = entrou, mas fica na fila porque a pessoa já roda outra
   * cadência — uma cadência por pessoa de cada vez.
   */
  async enroll(id: string, dto: EnrollLeadDto): Promise<EnrollResult> {
    const cad = await this.cadenceOrFail(id);
    const lead = await this.leadOrFail(dto.lead_id);
    const first = stepNodes(cad.nodes)[0];
    if (!first) return { ok: false, waiting: false };

    return this.prisma.$transaction(async (tx) => {
      // Serializa POR PESSOA: dois cliques em "colocar na cadência" (ou duas
      // abas) leriam "não está dentro" antes de qualquer um gravar (TOCTOU) e a
      // pessoa receberia a trilha duas vezes. O lock vale por transação e só
      // trava quem disputa o MESMO lead — é o que também faz o `waiting` sair
      // certo quando as duas entradas são em cadências diferentes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cadence-enroll:${lead.id}`}))`;

      const ja = await tx.enrollments.count({
        where: { cadence_id: id, lead_id: lead.id, status: { in: DENTRO } },
      });
      if (ja) return { ok: false, waiting: false };

      const ocupado = await tx.enrollments.count({
        where: { lead_id: lead.id, status: ATIVO },
      });
      const waiting = ocupado > 0;
      const startedAt = new Date();
      await tx.enrollments.create({
        data: {
          cadence_id: id,
          lead_id: lead.id,
          started_at: startedAt,
          next_at: new Date(stepDueAt(startedAt.toISOString(), first.day)),
          status: waiting ? AGUARDANDO : ATIVO,
          stage_at_start: lead.stage,
        },
      });
      return { ok: true, waiting };
    });
  }

  /**
   * "Testar comigo" (`store.tsx:761-787`): põe o SEU telefone na cadência com o
   * tempo comprimido (cada dia vira 5 s), para ver a trilha inteira chegar.
   *
   * O lead de teste é um só, reaproveitado (`is_test`, fora de disparo, público
   * e prova social). As inscrições de teste anteriores saem: duas trilhas
   * comprimidas ao mesmo tempo no mesmo número viram bagunça.
   */
  async test(
    id: string,
    dto: TestCadenceDto,
    user: AuthUser,
  ): Promise<{ enrollment_id: string; lead_id: string }> {
    const cad = await this.cadenceOrFail(id);
    if (!stepNodes(cad.nodes)[0]) {
      throw new BadRequestException({
        code: 'NO_STEPS',
        message: 'Esta cadência não tem nenhum passo para testar.',
      });
    }
    const me = await this.prisma.users.findUnique({
      where: { id: user.id },
      select: { active_praca_id: true },
    });
    const hoje = todaySp();

    return this.prisma.$transaction(async (tx) => {
      // O lead de teste é UM só e a inscrição de teste também: dois cliques em
      // "Testar comigo" ao mesmo tempo criariam dois leads "Teste — Cadência"
      // (o `findFirst` de um roda antes do `create` do outro) e duas trilhas
      // comprimidas no mesmo número. O lock é global porque o lead é global.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cadence-test'))`;

      const achado = await tx.leads.findFirst({
        where: { name: TEST_LEAD_NAME, is_test: true },
        select: { id: true, stage: true },
      });
      const lead = achado
        ? await tx.leads.update({
            where: { id: achado.id },
            // Só o telefone e a praça mudam: a etapa e a timeline do teste
            // anterior ficam, como no protótipo.
            data: {
              phone: dto.phone,
              phone_key: phoneKey(dto.phone),
              praca_id: me?.active_praca_id ?? null,
            },
            select: { id: true, stage: true },
          })
        : await tx.leads.create({
            data: {
              praca_id: me?.active_praca_id ?? null,
              name: TEST_LEAD_NAME,
              phone: dto.phone,
              phone_key: phoneKey(dto.phone),
              decisor: '',
              classe: 'alvo',
              origem: 'manual',
              stage: 1,
              entered_at: hoje,
              stage_since: hoje,
              is_test: true,
            },
            select: { id: true, stage: true },
          });

      await tx.enrollments.updateMany({
        where: { is_test: true, status: { in: DENTRO } },
        data: { status: SAIU, exit_reason: 'manual' },
      });

      const startedAt = new Date();
      const enr = await tx.enrollments.create({
        data: {
          cadence_id: id,
          lead_id: lead.id,
          started_at: startedAt,
          // Vence agora: o teste não espera a primeira rodada do dia.
          next_at: startedAt,
          status: ATIVO,
          stage_at_start: lead.stage,
          is_test: true,
          compress_sec: TEST_COMPRESS_SEC,
        },
        select: { id: true, lead_id: true },
      });
      return { enrollment_id: enr.id, lead_id: enr.lead_id };
    });
  }

  /** As inscrições (200 mais recentes), filtradas por cadência quando pedido. */
  async listEnrollments(query: EnrollmentsQueryDto): Promise<EnrollmentView[]> {
    if (query.cadence_id) await this.cadenceOrFail(query.cadence_id);
    const rows = await this.prisma.enrollments.findMany({
      where: query.cadence_id ? { cadence_id: query.cadence_id } : {},
      include: { logs: { orderBy: [{ at: 'asc' }, { id: 'asc' }] } },
      orderBy: [{ started_at: 'desc' }, { id: 'desc' }],
      take: ENROLLMENTS_LIMIT,
    });
    return rows.map((r) => this.toEnrollmentView(r, r.logs));
  }

  /** Tira a pessoa da cadência na mão (`store.tsx:752-758`). */
  async exitEnrollment(id: string, dto: ExitEnrollmentDto): Promise<EnrollmentView> {
    const atual = await this.enrollmentOrFail(id);
    // Inscrição encerrada não sai de novo: reescrever o motivo apagaria por que
    // a pessoa saiu de verdade (respondeu, bloqueio, fim da trilha) e o painel
    // passaria a contar "retirada manual" no lugar.
    if (atual.status === SAIU || atual.status === CONCLUIDO) {
      throw new BadRequestException({
        code: 'ALREADY_EXITED',
        message: 'Esta inscrição já saiu da cadência.',
      });
    }
    const row = await this.prisma.enrollments.update({
      where: { id },
      data: { status: SAIU, exit_reason: dto.reason ?? 'manual' },
      include: { logs: { orderBy: [{ at: 'asc' }, { id: 'asc' }] } },
    });
    return this.toEnrollmentView(row, row.logs);
  }

  // ── painel ──────────────────────────────────────────────────
  /** Medição da cadência — `cadencias.ts:93-121` mais "quem está dentro". */
  async stats(id: string): Promise<CadenceStatsView> {
    const cad = await this.cadenceOrFail(id);
    const inscricoes = await this.prisma.enrollments.findMany({
      where: { cadence_id: id },
      include: {
        logs: { select: { node_id: true, at: true } },
        lead: { select: { id: true, name: true, stage: true } },
      },
      orderBy: [{ started_at: 'asc' }, { id: 'asc' }],
    });

    // Respostas de quem passou pela cadência, numa consulta só: "respondeu
    // depois DESTE passo" precisa comparar o instante do log com o da resposta.
    const respostas = new Map<string, string[]>();
    const leadIds = [...new Set(inscricoes.map((e) => e.lead_id))];
    if (leadIds.length) {
      const rows = await this.prisma.lead_events.findMany({
        where: { lead_id: { in: leadIds }, kind: 'msg_in' },
        select: { lead_id: true, at: true },
      });
      for (const r of rows) {
        const lista = respostas.get(r.lead_id) ?? [];
        lista.push(r.at.toISOString());
        respostas.set(r.lead_id, lista);
      }
    }

    const nodes = cad.nodes.map((n) => this.toNodeView(n));
    const passos = stepNodes(nodes);
    const per_step: CadenceStepStatsView[] = passos.map((node, i) => {
      let reached = 0;
      let here = 0;
      let replied = 0;
      for (const e of inscricoes) {
        const log = e.logs.find((l) => l.node_id === node.id);
        if (log) {
          reached++;
          const desde = log.at.toISOString();
          if ((respostas.get(e.lead_id) ?? []).some((at) => at >= desde)) replied++;
        }
        if (e.status === ATIVO && stepIndexOf(nodes, e.logs) === i) here++;
      }
      return { node, here, reached, replied, resp_rate: reached ? replied / reached : 0 };
    });

    const motivos = new Map<string, number>();
    for (const e of inscricoes) {
      if (e.exit_reason) motivos.set(e.exit_reason, (motivos.get(e.exit_reason) ?? 0) + 1);
    }

    return {
      entered: inscricoes.length,
      active: inscricoes.filter((e) => e.status === ATIVO).length,
      per_step,
      exits: [...motivos.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
      // Avançou de etapa depois de entrar (a etapa do lead subiu em relação à
      // que ele tinha na hora da inscrição).
      advanced: inscricoes.filter((e) => e.lead.stage > e.stage_at_start).length,
      inside: inscricoes
        .filter((e) => DENTRO.includes(e.status))
        .slice(0, INSIDE_LIMIT)
        .map((e) => ({
          enrollment_id: e.id,
          lead_id: e.lead_id,
          lead_name: e.lead.name,
          status: e.status,
          step_index: stepIndexOf(nodes, e.logs),
          next_at: e.next_at.toISOString(),
        })),
    };
  }

  // ── internos ────────────────────────────────────────────────
  /**
   * O que cada tipo de nó exige. `class-validator` valida campo a campo; a
   * combinação (mensagem sem texto nem modelo, condição sem regra) é regra de
   * domínio e mora aqui.
   */
  private checkNodes(nodes: CadenceNodeDto[]): void {
    for (const [i, n] of nodes.entries()) {
      const erro = this.nodeError(n);
      if (erro) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `nodes[${i}]: ${erro}` });
      }
    }
  }

  private nodeError(n: CadenceNodeDto): string | null {
    if (n.kind === 'msg') {
      return n.template_id || n.text?.trim() ? null : 'nó de mensagem precisa de template_id ou de text.';
    }
    if (n.kind === 'task') return n.task?.trim() ? null : 'nó de tarefa precisa de task.';
    return n.rule && n.action ? null : 'nó de condição precisa de rule e action.';
  }

  /** Modelo citado por um nó tem de existir — id solto viraria mensagem vazia. */
  private async templatesOrFail(nodes: CadenceNodeDto[]): Promise<void> {
    const ids = [...new Set(nodes.map((n) => n.template_id).filter((id): id is string => !!id))];
    if (!ids.length) return;
    const achados = await this.prisma.msg_templates.count({ where: { id: { in: ids } } });
    if (achados !== ids.length) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Modelo não encontrado.' });
    }
  }

  private toCadenceData(dto: CadenceBodyDto) {
    return {
      name: dto.name,
      audience: dto.audience,
      entry: dto.entry,
      exit_action: dto.exit.action,
      exit_note: dto.exit.note ?? '',
      paused: dto.paused,
    };
  }

  /** Campos do nó no banco. O que não vale para o tipo do nó vira `null`. */
  private toNodeData(n: CadenceNodeDto) {
    const msg = n.kind === 'msg';
    const cond = n.kind === 'cond';
    return {
      kind: n.kind,
      // Condição roda junto do passo seguinte: não tem dia próprio.
      day: cond ? 0 : n.day,
      channel: msg ? (n.channel ?? 'whatsapp') : null,
      template_id: msg ? (n.template_id ?? null) : null,
      // Modelo vence texto próprio: os dois juntos seriam dois textos possíveis
      // para a mesma mensagem.
      text: msg && !n.template_id ? (n.text ?? null) : null,
      task: n.kind === 'task' ? (n.task ?? null) : null,
      rule: cond ? (n.rule ?? null) : null,
      action: cond ? (n.action ?? null) : null,
      note: n.note ?? null,
    };
  }

  private async cadenceOrFail(id: string) {
    if (!isUuid(id)) throw this.cadenciaNaoAchada();
    const row = await this.prisma.cadences.findUnique({ where: { id }, include: COM_NOS });
    if (!row) throw this.cadenciaNaoAchada();
    return row;
  }

  private async enrollmentOrFail(id: string) {
    if (!isUuid(id)) throw this.inscricaoNaoAchada();
    const row = await this.prisma.enrollments.findUnique({ where: { id } });
    if (!row) throw this.inscricaoNaoAchada();
    return row;
  }

  private async leadOrFail(id: string) {
    const row = await this.prisma.leads.findUnique({
      where: { id },
      select: { id: true, stage: true },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lead não encontrado.' });
    return row;
  }

  private toView(r: {
    id: string;
    name: string;
    audience: string;
    entry: string;
    exit_action: string;
    exit_note: string;
    paused: boolean;
    created_at: Date;
    nodes: NodeRow[];
  }): CadenceView {
    return {
      id: r.id,
      name: r.name,
      audience: r.audience,
      entry: r.entry,
      exit: { action: r.exit_action, note: r.exit_note },
      paused: r.paused,
      created_at: r.created_at.toISOString(),
      nodes: r.nodes.map((n) => this.toNodeView(n)),
    };
  }

  private toNodeView(n: NodeRow): CadenceNodeView {
    return {
      id: n.id,
      sort: n.sort,
      kind: n.kind,
      day: n.day,
      channel: n.channel,
      template_id: n.template_id,
      text: n.text,
      task: n.task,
      rule: n.rule,
      action: n.action,
      note: n.note,
    };
  }

  private toEnrollmentView(
    e: {
      id: string;
      cadence_id: string;
      lead_id: string;
      started_at: Date;
      next_at: Date;
      status: string;
      exit_reason: string | null;
      stage_at_start: number;
      is_test: boolean;
    },
    logs: { node_id: string; at: Date; send_id: string | null; kind: string }[],
  ): EnrollmentView {
    return {
      id: e.id,
      cadence_id: e.cadence_id,
      lead_id: e.lead_id,
      started_at: e.started_at.toISOString(),
      next_at: e.next_at.toISOString(),
      status: e.status,
      exit_reason: e.exit_reason,
      stage_at_start: e.stage_at_start,
      is_test: e.is_test,
      logs: logs.map((l) => ({
        node_id: l.node_id,
        at: l.at.toISOString(),
        send_id: l.send_id,
        kind: l.kind,
      })),
    };
  }

  private cadenciaNaoAchada() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Cadência não encontrada.' });
  }

  private inscricaoNaoAchada() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Inscrição não encontrada.' });
  }
}
