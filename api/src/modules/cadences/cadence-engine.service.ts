/**
 * O relógio das cadências — porta de
 * `.prototype/src/lib/praca/cadencias-engine.ts:57-204` (`tickCadences`) sobre o
 * banco.
 *
 * Diferença estrutural em relação ao protótipo: lá a rodada inteira era uma
 * função pura sobre um objeto em `localStorage` (tudo ou nada, num navegador
 * só). Aqui **cada inscrição avança na sua própria transação**: uma que estoure
 * (lead apagado no meio, modelo que sumiu) não pode travar as outras 200 nem
 * deixar meia mensagem gravada.
 *
 * O que continua igual ao protótipo: a ordem das três fases (entrada
 * automática, avanço, fila de espera), as saídas e os textos dos eventos.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { phoneKey } from '../../common/phone/phone';
import { addDays, todaySp } from '../../common/time/dates';
import { AUTO_ENTRIES, MAX_ENROLL_PER_TICK } from '../../domain/catalog/cadences';
import type { SendMode, TemplateDefaults } from '../../domain/catalog/messages';
import {
  firstPendingNode,
  matchesEntry,
  openedVaga,
  stepDueAt,
  stepNodes,
  type RuleLog,
} from '../../domain/cadence-rules';
import { atSpHour, nextSlot, type SendSettings } from '../../domain/send-schedule';
import { renderTemplate, type RenderPraca } from '../../domain/template-render';
import { MessagesService } from '../messages/messages.service';
import { AGUARDANDO, ATIVO, CONCLUIDO, SAIU } from './cadences.service';

/** Prisma normal ou o cliente de uma transação já aberta. */
type Db = PrismaService | Prisma.TransactionClient;

/** A cadência com os nós na ordem, como o motor a lê. */
type CadenceComNos = Prisma.cadencesGetPayload<{ include: { nodes: true } }>;

/** Trava do laço de nós: cadência mal montada não prende a rodada. */
const GUARD = 40;

/** Quando o limite diário estoura, o próximo passo tenta 12 h depois. */
const ADIA_MS = 12 * 3_600_000;

const NA_FILA = 'fila';
const ENVIADA = 'enviada';

/** O estado da rodada — o que vale para todas as inscrições dela. */
interface Tick {
  now: Date;
  now_iso: string;
  hoje: string;
  settings: SendSettings;
  defaults: TemplateDefaults;
  mode: SendMode;
  bloqueados: Set<string>;
  /** Quantas mensagens já saíram hoje (banco + o que esta rodada mandou). */
  sent_today: number;
  changed: boolean;
}

@Injectable()
export class CadenceEngineService {
  private readonly log = new Logger(CadenceEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  /**
   * Uma rodada do relógio. Devolve `changed: true` quando algo mudou no banco —
   * é o que o agendador registra.
   */
  async tick(now: Date = new Date()): Promise<{ changed: boolean }> {
    const cadences = await this.prisma.cadences.findMany({
      include: { nodes: { orderBy: { sort: 'asc' } } },
      // Ordem fixa: com duas cadências automáticas disputando o mesmo lead, é
      // ela que decide quem matricula e quem fica esperando — a rodada tem de
      // dar sempre o mesmo resultado.
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    if (cadences.length === 0) return { changed: false };

    const settings = await this.messages.getSettings();
    const hoje = todaySp(now);
    const st: Tick = {
      now,
      now_iso: now.toISOString(),
      hoje,
      settings: {
        mode: settings.mode as SendMode,
        window_start: settings.window_start,
        window_end: settings.window_end,
        sunday: settings.sunday,
        daily_limit: settings.daily_limit,
        gap_min: settings.gap_min,
        gap_max: settings.gap_max,
      },
      defaults: settings.template_defaults,
      mode: settings.mode as SendMode,
      bloqueados: await this.messages.blockedKeys(),
      sent_today: await this.sentToday(hoje),
      changed: false,
    };

    // 1 · entrada automática
    for (const cad of cadences) {
      if (cad.paused || !(AUTO_ENTRIES as readonly string[]).includes(cad.entry)) continue;
      try {
        await this.autoEnroll(cad, st);
      } catch (e) {
        this.log.error(`entrada automática da cadência ${cad.id} falhou: ${this.motivo(e)}`);
      }
    }

    // 2 · avanço de quem está dentro
    const porId = new Map(cadences.map((c) => [c.id, c]));
    const vencidas = await this.prisma.enrollments.findMany({
      where: { status: ATIVO, next_at: { lte: now } },
      select: { id: true, cadence_id: true },
      orderBy: [{ next_at: 'asc' }, { id: 'asc' }],
    });
    for (const e of vencidas) {
      const cad = porId.get(e.cadence_id);
      // Cadência pausada segura a trilha onde está (não tira ninguém dela).
      if (!cad || cad.paused) continue;
      try {
        // Uma transação por inscrição: o passo é atômico (envio + evento + log
        // + `next_at`), mas o tombo de uma não derruba as outras.
        // Teto explícito: `advance` percorre até 40 nós e o padrão do Prisma
        // (5 s) derrubaria a inscrição com `P2028` numa trilha longa.
        await this.prisma.$transaction((tx) => this.advance(tx, cad, e.id, st), {
          timeout: 30_000,
          maxWait: 10_000,
        });
      } catch (err) {
        this.log.error(`inscrição ${e.id} não avançou: ${this.motivo(err)}`);
      }
    }

    // 3 · fila de espera
    try {
      await this.releaseWaiting(porId, st);
    } catch (e) {
      this.log.error(`fila de espera das cadências falhou: ${this.motivo(e)}`);
    }

    return { changed: st.changed };
  }

  // ── 1 · entrada automática ──────────────────────────────────
  /**
   * Entra quem bate a regra de entrada da cadência. Fora: arquivado, lead de
   * teste (mensagem fria não sai para "Bar de Teste QA") e quem JÁ TEVE
   * inscrição nesta cadência — em qualquer estado, senão quem saiu voltaria
   * na rodada seguinte, para sempre.
   */
  private async autoEnroll(cad: CadenceComNos, st: Tick): Promise<void> {
    const first = stepNodes(cad.nodes)[0];
    if (!first) return;
    const where = this.entryWhere(cad.entry, st.hoje);
    if (!where) return;

    const leads = await this.prisma.leads.findMany({
      where: {
        archived: false,
        is_test: false,
        ...where,
        enrollments: { none: { cadence_id: cad.id } },
      },
      select: { id: true, stage: true, reheat_at: true },
      // Os mais antigos primeiro: o teto por rodada não pode deixar ninguém
      // esperando para sempre.
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: MAX_ENROLL_PER_TICK,
    });
    // Segunda peneira pela regra PURA: o `where` é só o recorte que o Postgres
    // sabe fazer, quem decide é `matchesEntry` (testado).
    const entram = leads.filter((l) => matchesEntry(cad.entry, l, st.hoje));
    if (entram.length === 0) return;

    for (const l of entram) {
      // Mesma trava por pessoa do `enroll` da tela: sem ela, uma matrícula
      // manual gravada entre a peneira acima e este insert colocaria a pessoa
      // duas vezes na mesma trilha. Uma transação por lead — a falha de uma não
      // derruba a matrícula das outras 29.
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cadence-enroll:${l.id}`}))`;
        const ja = await tx.enrollments.count({ where: { cadence_id: cad.id, lead_id: l.id } });
        if (ja) return;
        await tx.enrollments.create({
          data: {
            cadence_id: cad.id,
            lead_id: l.id,
            started_at: st.now,
            next_at: new Date(stepDueAt(st.now_iso, first.day)),
            // Relê "está ocupado?" com o lock na mão: o mapa acima foi lido
            // antes da trava.
            status: (await tx.enrollments.count({ where: { lead_id: l.id, status: ATIVO } }))
              ? AGUARDANDO
              : ATIVO,
            stage_at_start: l.stage,
          },
        });
        st.changed = true;
      });
    }
  }

  /** O recorte da regra de entrada que o Postgres sabe filtrar. */
  private entryWhere(entry: string, hoje: string): Prisma.leadsWhereInput | null {
    switch (entry) {
      case 'stage_novo':
        return { stage: 1 };
      case 'reheat_due':
        // `reheat_at` é data "só dia" em varchar: comparar string funciona
        // porque "YYYY-MM-DD" ordena igual à data.
        return { reheat_at: { not: null, lte: hoje } };
      case 'first_vaga':
        return { stage: 6 };
      default:
        return null;
    }
  }

  // ── 2 · avanço ──────────────────────────────────────────────
  /**
   * Avança UMA inscrição até onde der nesta rodada: caminha pelos nós enquanto
   * eles já venceram, para no primeiro que ainda não venceu e sai da cadência
   * quando a regra manda.
   */
  private async advance(
    tx: Prisma.TransactionClient,
    cad: CadenceComNos,
    enrollmentId: string,
    st: Tick,
  ): Promise<void> {
    const e = await tx.enrollments.findUnique({
      where: { id: enrollmentId },
      include: { logs: { select: { node_id: true } } },
    });
    // Relê dentro da transação: a tela pode ter tirado a pessoa da cadência
    // entre a leitura da lista e este passo.
    if (!e || e.status !== ATIVO || e.next_at.getTime() > st.now.getTime()) return;

    const lead = await tx.leads.findUnique({
      where: { id: e.lead_id },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        decisor: true,
        phone: true,
        stage: true,
        praca_id: true,
        archived: true,
      },
    });
    if (!lead) return;

    // Lead arquivado saiu do funil: a trilha para nele. Sem isso a cadência
    // continuaria mandando mensagem para quem foi tirado da base de propósito.
    if (lead.archived) {
      await this.leadEvent(
        tx,
        lead.id,
        'note',
        `Saiu da cadência “${cad.name}” (lead arquivado).`,
        st.now,
      );
      await tx.enrollments.update({
        where: { id: e.id },
        data: { status: SAIU, exit_reason: 'arquivado' },
      });
      st.changed = true;
      return;
    }

    const desde = e.started_at.toISOString();
    // As duas perguntas que decidem tudo, respondidas UMA vez: nada dentro do
    // laço grava resposta do lead nem vaga, então elas não mudam no meio.
    const respondeu =
      (await tx.lead_events.count({
        where: { lead_id: lead.id, kind: 'msg_in', at: { gte: e.started_at } },
      })) > 0;
    const vagasDesde = await tx.lead_vagas.findMany({
      where: { lead_id: lead.id, date: { gte: desde.slice(0, 10) } },
      select: { date: true },
      take: 1,
    });
    const abriuVaga = openedVaga(vagasDesde, lead.stage, desde);

    const logs: RuleLog[] = e.logs.map((l) => ({ node_id: l.node_id }));
    let status = e.status;
    let exitReason = e.exit_reason;
    let nextAt = e.next_at;

    for (let guard = 0; guard < GUARD; guard++) {
      const node = firstPendingNode(cad.nodes, logs);
      if (!node) {
        ({ status, exitReason } = await this.applyExit(tx, cad, lead, cad.exit_action, 'fim', st));
        break;
      }
      // Respondeu depois de entrar: sai na hora e vira conversa de gente.
      if (respondeu) {
        ({ status, exitReason } = await this.applyExit(tx, cad, lead, 'sai_conversa', 'respondeu', st));
        break;
      }

      if (node.kind === 'cond') {
        // A condição também vai para o log: sem isso o motor a reavaliaria a
        // cada rodada e nunca passaria do primeiro `cond`.
        await tx.enrollment_logs.create({
          data: { enrollment_id: e.id, node_id: node.id, at: st.now, kind: 'cond' },
        });
        logs.push({ node_id: node.id });
        const bateu =
          node.rule === 'respondeu' ? respondeu : node.rule === 'abriu_vaga' ? abriuVaga : !respondeu;
        if (bateu && node.action && node.action !== 'continua') {
          ({ status, exitReason } = await this.applyExit(
            tx,
            cad,
            lead,
            node.action,
            node.rule === 'abriu_vaga' ? 'abriu_vaga' : node.action,
            st,
          ));
          break;
        }
        continue;
      }

      const due = stepDueAt(desde, node.day, e.compress_sec);
      if (new Date(due).getTime() > st.now.getTime()) {
        nextAt = new Date(due);
        break;
      }

      if (node.kind === 'task') {
        await this.leadEvent(
          tx,
          lead.id,
          'note',
          `Tarefa da cadência “${cad.name}”: ${node.task ?? ''}`,
          st.now,
        );
        await tx.leads.update({
          where: { id: lead.id },
          data: {
            next_step_what: node.task ?? 'Ligação da cadência',
            next_step_date: st.hoje,
          },
        });
        await tx.enrollment_logs.create({
          data: { enrollment_id: e.id, node_id: node.id, at: st.now, kind: 'task' },
        });
        logs.push({ node_id: node.id });
        continue;
      }

      // ── mensagem ──
      const chave = phoneKey(lead.phone);
      // Lead de teste ("Testar comigo") ignora bloqueio e limite diário: é o
      // seu próprio número, e o teste tem de rodar a trilha inteira agora.
      if (!e.is_test && chave && st.bloqueados.has(chave)) {
        ({ status, exitReason } = await this.applyExit(tx, cad, lead, 'sai', 'bloqueio', st));
        break;
      }
      if (!e.is_test && st.sent_today >= st.settings.daily_limit) {
        nextAt = nextSlot(new Date(st.now.getTime() + ADIA_MS), st.settings);
        break;
      }

      const send = await this.sendMessage(tx, cad, node, e, lead, st);
      await tx.enrollment_logs.create({
        data: { enrollment_id: e.id, node_id: node.id, at: st.now, send_id: send.id, kind: 'msg' },
      });
      logs.push({ node_id: node.id });
    }

    await tx.enrollments.update({
      where: { id: e.id },
      data: { status, exit_reason: exitReason, next_at: nextAt },
    });
    st.changed = true;
  }

  /**
   * Grava a mensagem do passo. Dois modos (`app_settings.mode`):
   *
   * - `fila` — a fila é a do protótipo: a mensagem já conta como enviada
   *   (`enviada`, `sent_at` agora), grava o evento na timeline do lead e zera os
   *   dias parados. É o operador que copia e manda de fato.
   * - `freela` — a mensagem fica `fila`, sem `sent_at` e SEM evento: quem
   *   entrega é a campanha do Freela (Task 15), e é o retorno dela que escreve
   *   o evento. Gravar o evento aqui contaria contato que ninguém fez.
   */
  private async sendMessage(
    tx: Prisma.TransactionClient,
    cad: CadenceComNos,
    node: CadenceComNos['nodes'][number],
    e: { id: string; is_test: boolean },
    lead: {
      id: string;
      name: string;
      city: string;
      address: string;
      decisor: string;
      stage: number;
      praca_id: string | null;
    },
    st: Tick,
  ): Promise<{ id: string }> {
    const tpl = node.template_id
      ? await tx.msg_templates.findUnique({
          where: { id: node.template_id },
          select: { text_a: true },
        })
      : null;
    const praca = lead.praca_id
      ? ((await tx.pracas.findUnique({
          where: { id: lead.praca_id },
          select: { name: true, start_date: true },
        })) ?? undefined)
      : undefined;
    const vaga = await tx.lead_vagas.findMany({
      where: { lead_id: lead.id },
      orderBy: { date: 'asc' },
      take: 1,
      select: { date: true },
    });
    // Prova social: outra casa da mesma cidade. Leitura fora da transação de
    // propósito — é `SELECT` de apoio ao texto, não faz parte do commit.
    const vizinho = (await this.messages.neighborsByCity([lead.city]))
      .get(lead.city)
      ?.find((v) => v.id !== lead.id)?.name;

    const corpo = node.text ?? tpl?.text_a ?? '';
    const text = renderTemplate(corpo, {
      lead: {
        name: lead.name,
        decisor: lead.decisor,
        city: lead.city,
        address: lead.address,
        vagas: vaga.map((v) => ({ date: v.date })),
      },
      praca: praca as RenderPraca | undefined,
      // Cadência não tem "quem está logado": quem manda é o relógio.
      me: undefined,
      neighbor: vizinho,
      defaults: st.defaults,
    });

    const naFila = st.mode === 'freela';
    // Teste manda agora; o resto respeita a janela de Brasília.
    const quando = e.is_test || naFila ? st.now : nextSlot(st.now, st.settings);
    const send = await tx.msg_sends.create({
      data: {
        cadence_id: cad.id,
        node_id: node.id,
        enrollment_id: e.id,
        template_id: node.template_id ?? null,
        variant: 'A',
        lead_id: lead.id,
        channel: node.channel ?? 'whatsapp',
        text,
        mode: st.mode,
        scheduled_at: quando,
        sent_at: naFila ? null : quando,
        status: naFila ? NA_FILA : ENVIADA,
        stage_at_send: lead.stage,
      },
      select: { id: true },
    });

    if (!naFila) {
      await this.leadEvent(
        tx,
        lead.id,
        'msg_out',
        `Cadência “${cad.name}” · dia ${node.day}: ${text}`,
        st.now,
      );
      await tx.leads.update({ where: { id: lead.id }, data: { last_contact_at: st.now } });
      // Só o que tem `sent_at` conta no limite diário (é o que o banco conta na
      // próxima rodada); no modo `freela` o ritmo é da campanha do Freela.
      st.sent_today++;
    }
    return send;
  }

  /**
   * As 5 saídas da cadência (`cadencias-engine.ts:29-50`) — cada uma deixa um
   * rastro diferente na ficha do lead. `fim` e `fecha_conta` fecham como
   * `concluido`; o resto é `saiu`.
   */
  private async applyExit(
    tx: Prisma.TransactionClient,
    cad: CadenceComNos,
    lead: { id: string; stage: number },
    action: string,
    reason: string,
    st: Tick,
  ): Promise<{ status: string; exitReason: string }> {
    const leadId = lead.id;
    const nome = cad.name;
    if (action === 'sai_conversa') {
      // A etapa só SOBE. No protótipo isso era `stage: 3` cravado, e um cliente
      // ativo (etapa 7) que respondesse voltava para "Conversa aberta" — a
      // resposta rebaixava quem já estava mais à frente. Quem já passou da
      // etapa 3 sai da cadência e ganha o evento, mas fica onde está.
      const sobe = lead.stage < 3;
      await this.leadEvent(
        tx,
        leadId,
        'stage',
        `Saiu da cadência “${nome}” (respondeu) → etapa Conversa aberta.`,
        st.now,
        sobe ? 3 : undefined,
      );
      if (sobe) {
        await tx.leads.update({ where: { id: leadId }, data: { stage: 3, stage_since: st.hoje } });
      }
    } else if (action === 'reaquecer_30' || action === 'reaquecer_60') {
      const dias = action === 'reaquecer_30' ? 30 : 60;
      await this.leadEvent(
        tx,
        leadId,
        'note',
        `Saiu da cadência “${nome}” → fila de reaquecimento em ${dias} dias.`,
        st.now,
      );
      await tx.leads.update({ where: { id: leadId }, data: { reheat_at: addDays(st.hoje, dias) } });
    } else if (action === 'fila_confirmacao') {
      await this.leadEvent(
        tx,
        leadId,
        'note',
        `Saiu da cadência “${nome}” → fila de ligação de confirmação.`,
        st.now,
      );
      await tx.leads.update({
        where: { id: leadId },
        data: { next_step_what: 'Ligar para confirmar presença', next_step_date: st.hoje },
      });
    } else if (action === 'fecha_conta') {
      await this.leadEvent(
        tx,
        leadId,
        'note',
        `Cadência “${nome}” encerrada — conta fechada e resultado registrado.`,
        st.now,
      );
    } else {
      await this.leadEvent(tx, leadId, 'note', `Saiu da cadência “${nome}”.`, st.now);
    }
    return {
      status: reason === 'fim' || action === 'fecha_conta' ? CONCLUIDO : SAIU,
      exitReason: reason,
    };
  }

  // ── 3 · fila de espera ──────────────────────────────────────
  /**
   * Quem estava esperando entra quando a pessoa fica livre. O relógio começa
   * AGORA (`started_at` novo): a trilha de 9 dias conta do dia em que ela
   * realmente começou, não de quando entrou na fila.
   */
  private async releaseWaiting(porId: Map<string, CadenceComNos>, st: Tick): Promise<void> {
    const esperando = await this.prisma.enrollments.findMany({
      where: { status: AGUARDANDO },
      select: { id: true, lead_id: true, cadence_id: true },
      orderBy: [{ started_at: 'asc' }, { id: 'asc' }],
    });
    if (esperando.length === 0) return;

    const ocupados = new Set(
      (
        await this.prisma.enrollments.findMany({
          where: { lead_id: { in: esperando.map((e) => e.lead_id) }, status: ATIVO },
          select: { lead_id: true },
        })
      ).map((r) => r.lead_id),
    );

    for (const e of esperando) {
      if (ocupados.has(e.lead_id)) continue;
      const cad = porId.get(e.cadence_id);
      const first = cad ? stepNodes(cad.nodes)[0] : undefined;
      if (!cad || !first) continue;
      try {
        await this.prisma.enrollments.update({
          where: { id: e.id },
          data: {
            status: ATIVO,
            started_at: st.now,
            next_at: new Date(stepDueAt(st.now_iso, first.day)),
          },
        });
        // A pessoa ficou ocupada agora: a próxima cadência dela espera a
        // rodada seguinte.
        ocupados.add(e.lead_id);
        st.changed = true;
      } catch (err) {
        this.log.error(`inscrição ${e.id} não saiu da fila de espera: ${this.motivo(err)}`);
      }
    }
  }

  // ── internos ────────────────────────────────────────────────
  /**
   * Quantas mensagens já saíram hoje (Brasília), em qualquer modo. Janela de
   * instante, não `date(sent_at)`: o processo roda em UTC e entre 21h e 00h a
   * data UTC já é a de amanhã.
   */
  private async sentToday(hoje: string): Promise<number> {
    return this.prisma.msg_sends.count({
      where: { sent_at: { gte: atSpHour(hoje, 0), lt: atSpHour(addDays(hoje, 1), 0) } },
    });
  }

  /** Evento da cadência na timeline do lead — autor é a máquina, não gente. */
  private async leadEvent(
    db: Db,
    leadId: string,
    kind: 'msg_out' | 'note' | 'stage',
    text: string,
    at: Date,
    stageTo?: number,
  ): Promise<void> {
    await db.lead_events.create({
      data: {
        lead_id: leadId,
        at,
        author_id: null,
        author_label: 'Cadência',
        kind,
        text,
        stage_to: stageTo ?? null,
      },
    });
  }

  private motivo(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
