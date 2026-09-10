/**
 * Outbox: a fila do Praça virando campanha no Freela — §7.6(a).
 *
 * No modo `freela` ninguém "envia" no Praça. O disparo e o motor de cadências
 * gravam `msg_sends` em `fila` com a hora marcada; quando a hora chega, este
 * serviço junta o lote e cria **uma** campanha `EXTERNAL_LIST` no Freela, que
 * tem o ritmo anti-bloqueio, a janela comercial e o opt-out. O caminho de volta
 * (quem recebeu, quem falhou) é da sincronização.
 *
 * Duas regras que decidem o desenho:
 *
 * - **um lote, uma campanha.** Por disparo (o nome da campanha é o nome do
 *   disparo) e, para as cadências, um lote por rodada — senão cada mensagem
 *   viraria uma campanha de um contato só e o Freela ficaria com centenas de
 *   campanhas de uma linha.
 * - **HTTP fora de transação.** A garimpagem da fila roda numa transação curta
 *   com lock consultivo; a chamada ao Freela acontece depois, sem transação
 *   aberta. Se ela falhar, os envios continuam em `fila` e a próxima rodada
 *   tenta de novo — nada fica "meio enviado".
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { toE164BR } from '../../common/phone/phone';
import { MessagesService } from '../messages/messages.service';
import {
  FreelaCampaignsService,
  MAX_CONTATOS,
  TELEFONE_INVALIDO,
  TELEFONE_REPETIDO,
  type FreelaLeadContact,
} from './freela-campaigns.service';
import { FreelaClient } from './freela-client';
import { pracaCidade, toFreelaTemplate } from './freela-template';

const SP_TZ = 'America/Sao_Paulo';

/** Um `msg_sends` na fila do modo `freela`, com o lead que vai receber. */
interface PendingSend {
  id: string;
  disparo_id: string | null;
  cadence_id: string | null;
  node_id: string | null;
  lead_id: string;
  text: string;
  lead: { id: string; name: string; decisor: string; phone: string; city: string };
}

/** Um lote: tudo que vira UMA campanha. */
interface Lote {
  disparo_id: string | null;
  /**
   * Nó da cadência do lote (só nos lotes de cadência). É o que garante **um
   * texto por campanha**: o Freela manda um `whatsappTemplate` para todo o
   * lote, então misturar passos diferentes na mesma campanha faria todo mundo
   * receber o texto de um deles.
   */
  node_id: string | null;
  sends: PendingSend[];
  /** Só quando o lote não caberia numa campanha só (`n` de `total`). */
  parte?: { n: number; total: number };
}

export interface FlushResult {
  /** Campanhas criadas **e iniciadas** no Freela nesta rodada. */
  campaigns: number;
  /** Envios que entraram nessas campanhas. */
  sends: number;
  /** Envios que morreram aqui (telefone inválido ou repetido no lote). */
  failed: number;
  /**
   * Campanhas criadas que **não** começaram (o `start` falhou). Não contam
   * como entregues: a sincronização tenta iniciar de novo na próxima rodada.
   */
  start_pending: number;
}

const NOME_PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: SP_TZ,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Nome máximo da campanha no Freela — cadência de nome longo não estoura o campo. */
const MAX_NOME = 120;

/**
 * "Cadências — 09/09 12:30 · Reaquecimento · passo 2" (horário de Brasília).
 *
 * O passo entra no nome porque cada nó vira uma campanha própria (um texto por
 * campanha): sem ele, duas campanhas da mesma rodada nasceriam homônimas e
 * ninguém saberia qual passo é qual na tela do Freela.
 */
function nomeDoLoteDeCadencia(now: Date, cadencia?: string, passo?: number): string {
  const p: Record<string, string> = {};
  for (const part of NOME_PARTES.formatToParts(now)) p[part.type] = part.value;
  const hora = String(Number(p.hour ?? '0') % 24).padStart(2, '0');
  const base = `Cadências — ${p.day}/${p.month} ${hora}:${p.minute}`;
  if (!cadencia || !passo) return base;
  const sufixo = ` · passo ${passo}`;
  const espaco = MAX_NOME - base.length - sufixo.length - 3;
  const nome = cadencia.length > espaco ? `${cadencia.slice(0, Math.max(0, espaco - 1))}…` : cadencia;
  return `${base} · ${nome}${sufixo}`;
}

/** O texto do lote quando ele é um só (todos idênticos). */
const primeiroTexto = (sends: PendingSend[]): string => sends[0]!.text;

@Injectable()
export class FreelaOutboxService {
  private readonly log = new Logger(FreelaOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FreelaClient,
    private readonly campaigns: FreelaCampaignsService,
    private readonly messages: MessagesService,
  ) {}

  /** Entrega ao Freela tudo que venceu até `now`. Nunca lança por lote. */
  async flush(now: Date = new Date()): Promise<FlushResult> {
    const out: FlushResult = { campaigns: 0, sends: 0, failed: 0, start_pending: 0 };
    // Sem conexão não adianta nem garimpar: a fila fica esperando a conexão
    // voltar (é o mesmo lote, com a mesma hora marcada).
    if (!this.client.isConfigured()) return out;

    const pendentes = await this.claim(now);
    if (pendentes.length === 0) return out;

    for (const lote of this.agrupar(pendentes)) {
      const validos: PendingSend[] = [];
      const invalidos: string[] = [];
      const repetidos: string[] = [];
      const vistos = new Set<string>();
      for (const s of lote.sends) {
        const tel = toE164BR(s.lead.phone);
        if (!tel) invalidos.push(s.id);
        // O Freela descarta telefone repetido: o segundo envio nunca teria
        // destinatário para casar e ficaria em `fila` para sempre.
        else if (vistos.has(tel)) repetidos.push(s.id);
        else {
          vistos.add(tel);
          validos.push(s);
        }
      }

      // Morrem aqui, com motivo na tela: o Freela recusaria o lote inteiro por
      // causa de um telefone quebrado.
      out.failed += await this.marcarFalha(invalidos, TELEFONE_INVALIDO, lote.disparo_id);
      out.failed += await this.marcarFalha(repetidos, TELEFONE_REPETIDO, lote.disparo_id);

      if (validos.length === 0) continue;

      try {
        const ctx = await this.contexto(lote, validos, now);
        if (!ctx) continue;
        const feito = await this.campaigns.createFromLeads({
          name: lote.parte ? `${ctx.name} (parte ${lote.parte.n}/${lote.parte.total})` : ctx.name,
          praca_id: ctx.praca_id,
          disparo_id: lote.disparo_id,
          kind: lote.disparo_id ? 'disparo' : 'cadencia',
          leads: validos.map((s) => this.toContact(s)),
          template: ctx.template,
          pacing: ctx.pacing,
          start_now: true,
          created_by: ctx.created_by,
          link_send_ids: validos.map((s) => s.id),
        });
        if (!feito.freela_id) continue;
        if (feito.start_error) {
          // Campanha existe e os envios já estão pendurados nela, mas ninguém
          // vai receber até ela começar: NÃO conta como entregue.
          out.start_pending += 1;
          this.log.warn(
            `lote ${lote.disparo_id ?? 'cadências'} → campanha ${feito.freela_id} criada mas não iniciada (retry no próximo tick): ${feito.start_error}`,
          );
          continue;
        }
        out.campaigns += 1;
        out.sends += feito.recipients_count;
        this.log.log(
          `lote ${lote.disparo_id ?? 'cadências'} → campanha ${feito.freela_id} (${feito.recipients_count} contatos)`,
        );
      } catch (e) {
        // Fica na fila: a próxima rodada tenta de novo. Erro de um lote não
        // pode levar os outros junto.
        this.log.warn(
          `lote ${lote.disparo_id ?? 'cadências'} não virou campanha: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return out;
  }

  /** Tira os envios da fila com um motivo e fecha o disparo se ninguém sobrou. */
  private async marcarFalha(ids: string[], motivo: string, disparoId: string | null): Promise<number> {
    if (ids.length === 0) return 0;
    await this.prisma.msg_sends.updateMany({
      where: { id: { in: ids } },
      data: { status: 'falhou', failure_reason: motivo },
    });
    if (disparoId) await this.campaigns.settleDisparo(disparoId);
    return ids.length;
  }

  /**
   * Garimpa a fila numa transação curta com `pg_advisory_xact_lock`: duas
   * rodadas ao mesmo tempo (relógio lento + sincronização por leitura) leriam
   * os mesmos envios e criariam a campanha duas vezes.
   */
  private async claim(now: Date): Promise<PendingSend[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('freela-outbox'))`;
      return tx.msg_sends.findMany({
        where: {
          mode: 'freela',
          status: 'fila',
          freela_campaign_id: null,
          scheduled_at: { lte: now },
        },
        select: {
          id: true,
          disparo_id: true,
          cadence_id: true,
          node_id: true,
          lead_id: true,
          text: true,
          lead: { select: { id: true, name: true, decisor: true, phone: true, city: true } },
        },
        orderBy: [{ scheduled_at: 'asc' }, { id: 'asc' }],
      });
    });
  }

  /**
   * Um lote por disparo (o modelo é o do disparo) e, nas cadências, **um lote
   * por nó** — não um lote por rodada.
   *
   * O nó é a unidade certa porque o Freela manda UM `whatsappTemplate` por
   * campanha: juntar passos (e cadências) diferentes num lote só obrigaria a
   * escolher o texto de um deles para todos. É de propósito que o agrupamento
   * NÃO é por cadência: dois passos da mesma cadência têm textos diferentes.
   */
  private agrupar(sends: PendingSend[]): Lote[] {
    const porDisparo = new Map<string, PendingSend[]>();
    const porNo = new Map<string, PendingSend[]>();
    for (const s of sends) {
      const chave = s.disparo_id ?? null;
      const mapa = chave ? porDisparo : porNo;
      // `node_id` nulo não acontece pelo motor (ele sempre grava o nó); a chave
      // de reserva existe para o envio de cadência que chegar sem nó não cair
      // no lote de outro passo.
      const k = chave ?? s.node_id ?? 'sem-no';
      const atual = mapa.get(k) ?? [];
      atual.push(s);
      mapa.set(k, atual);
    }
    const lotes: Lote[] = [];
    for (const [disparo_id, ls] of porDisparo) lotes.push(...this.fatiar(disparo_id, null, ls));
    for (const [, ls] of porNo) lotes.push(...this.fatiar(null, ls[0]!.node_id, ls));
    return lotes;
  }

  /**
   * Um lote maior que o teto de contatos do Freela (5.000) vira duas campanhas
   * ou mais. Sem isso, um disparo gigante seria recusado a cada 2 minutos para
   * sempre.
   */
  private fatiar(disparoId: string | null, nodeId: string | null, sends: PendingSend[]): Lote[] {
    if (sends.length <= MAX_CONTATOS) return [{ disparo_id: disparoId, node_id: nodeId, sends }];
    const total = Math.ceil(sends.length / MAX_CONTATOS);
    return Array.from({ length: total }, (_, i) => ({
      disparo_id: disparoId,
      node_id: nodeId,
      sends: sends.slice(i * MAX_CONTATOS, (i + 1) * MAX_CONTATOS),
      parte: { n: i + 1, total },
    }));
  }

  /**
   * Nome, modelo, praça, autor e ritmo do lote. `null` = o lote não tem como
   * ser criado agora (some da rodada e volta na próxima).
   */
  private async contexto(
    lote: Lote,
    validos: PendingSend[],
    now: Date,
  ): Promise<{
    name: string;
    template: string;
    praca_id: string | null;
    created_by: string;
    pacing: Awaited<ReturnType<FreelaCampaignsService['pacing']>>;
  } | null> {
    const pacing = await this.campaigns.pacing();
    const primeiro = validos[0]!;

    if (!lote.disparo_id) {
      // Cadência não tem "quem disparou": quem manda é o relógio. O autor do
      // espelho é o primeiro admin ativo — sem nenhum, o lote espera.
      const admin = await this.prisma.users.findFirst({
        where: { is_admin: true, active: true },
        orderBy: [{ sort: 'asc' }, { created_at: 'asc' }],
        select: { id: true },
      });
      if (!admin) {
        this.log.warn('lote de cadências sem admin ativo para assinar a campanha — fica na fila');
        return null;
      }
      const modelo = await this.modeloDoNo(lote, validos, now);
      if (!modelo) return null;
      return {
        name: modelo.name,
        template: modelo.template,
        praca_id: null,
        created_by: admin.id,
        pacing,
      };
    }

    const disparo = await this.prisma.disparos.findUnique({
      where: { id: lote.disparo_id },
      select: { id: true, name: true, by: true, split: true, template_id: true, filters: true },
    });
    if (!disparo) return null;

    const pracaId = this.pracaIdDoFiltro(disparo.filters);
    const [tpl, praca, autor, settings] = await Promise.all([
      this.prisma.msg_templates.findUnique({
        where: { id: disparo.template_id },
        select: { text_a: true, text_b: true },
      }),
      pracaId
        ? this.prisma.pracas.findUnique({
            where: { id: pracaId },
            select: { name: true, start_date: true, city: true, cobertura_cidade: true },
          })
        : Promise.resolve(null),
      this.prisma.users.findUnique({ where: { id: disparo.by }, select: { name: true } }),
      this.messages.getSettings(),
    ]);

    const cidade = pracaCidade(praca);
    if (!cidade) {
      // Disparo com filtro `all` (ou praça sem cidade): o Freela deixaria
      // `{{cidade}}` vazio na lista externa, então a variável sobe intacta e
      // fica no aviso.
      this.log.warn(
        `disparo ${disparo.id} sem praça no filtro: {{cidade}} não vai ser preenchida na campanha`,
      );
    }
    // Modelo apagado depois do disparo: sobe o texto que já estava na fila.
    const convertido = tpl
      ? toFreelaTemplate(tpl.text_a, disparo.split ? tpl.text_b : null, {
          praca: praca ?? undefined,
          cidade,
          me: { name: autor?.name ?? '' },
          defaults: settings.template_defaults,
        }).template
      : primeiro.text;

    return {
      name: disparo.name,
      template: convertido,
      praca_id: pracaId,
      created_by: disparo.by,
      pacing,
    };
  }

  /**
   * Nome e `whatsappTemplate` do lote de cadência — o ponto que fecha o buraco
   * do "todo mundo recebe o texto do primeiro lead".
   *
   * O motor renderiza o texto de cada envio lead a lead (`{{estabelecimento}}`,
   * `{{primeiro_nome_dono}}`, `{{bairro}}`… já substituídos). Subir esse texto
   * como modelo da campanha faria os outros N contatos serem chamados pelo nome
   * do dono do primeiro bar. Então aqui a campanha sobe o **modelo do nó**
   * (modelo salvo ou texto próprio do passo) pela MESMA conversão do ramo do
   * disparo: `{{primeiro_nome_dono}}` → `{{primeiro_nome}}` (o Freela
   * personaliza por destinatário) e o que é fixo por campanha vira texto.
   *
   * O que só existe lead a lead (`{{estabelecimento}}`, `{{bairro}}`,
   * `{{estabelecimento_vizinho}}`, `{{data_vaga}}`) fica no texto como
   * `{{chave}}` e sai no aviso — §18.5. `{{cidade}}` é resolvida quando todos
   * os leads do lote são da mesma cidade (é o caso normal: a cadência corre por
   * praça), porque aí o valor é o mesmo que o render lead a lead daria.
   *
   * `null` = o lote não tem como subir agora (fica na fila).
   */
  private async modeloDoNo(
    lote: Lote,
    validos: PendingSend[],
    now: Date,
  ): Promise<{ name: string; template: string } | null> {
    const no = lote.node_id
      ? await this.prisma.cadence_nodes.findUnique({
          where: { id: lote.node_id },
          select: {
            sort: true,
            text: true,
            template_id: true,
            cadence: { select: { name: true } },
          },
        })
      : null;

    if (!no) {
      // Nó apagado (ou envio sem nó): sem o modelo não há como despersonalizar
      // o texto. Só sobe se os textos do lote forem idênticos — aí não há nada
      // de um lead no texto do outro.
      const unicos = new Set(validos.map((s) => s.text));
      if (unicos.size !== 1) {
        this.log.warn(
          `lote de cadência sem nó (${lote.node_id ?? 'nulo'}) e com ${unicos.size} textos diferentes — fica na fila`,
        );
        return null;
      }
      return { name: nomeDoLoteDeCadencia(now), template: primeiroTexto(validos) };
    }

    const tpl = no.template_id
      ? await this.prisma.msg_templates.findUnique({
          where: { id: no.template_id },
          select: { text_a: true },
        })
      : null;
    // Mesma ordem do motor (`cadence-engine.service.ts`): texto próprio do nó
    // vence, senão o modelo citado.
    const corpo = no.text ?? tpl?.text_a ?? '';
    if (!corpo.trim()) {
      this.log.warn(
        `nó ${lote.node_id} sem texto (modelo apagado?) — o lote fica na fila em vez de subir mensagem vazia`,
      );
      return null;
    }

    const settings = await this.messages.getSettings();
    // Uma cidade só no lote: a variável vira texto (é o mesmo valor que o
    // render lead a lead usou). Cidades diferentes: fica no aviso.
    const cidades = new Set(validos.map((s) => s.lead.city.trim()).filter(Boolean));
    const cidade = cidades.size === 1 ? [...cidades][0] : undefined;
    const convertido = toFreelaTemplate(corpo, null, {
      // Lote de cadência atravessa praças: `{{praca}}` não tem valor único.
      praca: undefined,
      cidade,
      // Cadência não tem "quem está logado" — igual ao motor.
      me: undefined,
      defaults: settings.template_defaults,
    });
    if (convertido.unsupported_variables.length > 0) {
      this.log.warn(
        `nó ${lote.node_id}: ${convertido.unsupported_variables.map((v) => `{{${v}}}`).join(', ')} não têm equivalente no Freela e vão no texto como estão`,
      );
    }
    return {
      name: nomeDoLoteDeCadencia(now, no.cadence.name, no.sort + 1),
      template: convertido.template,
    };
  }

  private toContact(s: PendingSend): FreelaLeadContact {
    return {
      id: s.lead.id,
      name: s.lead.name,
      decisor: s.lead.decisor,
      phone: s.lead.phone,
      city: s.lead.city,
      text: s.text,
    };
  }

  /** `filters.praca_id` do disparo — `all` (ou lixo) não é praça nenhuma. */
  private pracaIdDoFiltro(filters: unknown): string | null {
    const f = (typeof filters === 'object' && filters !== null ? filters : {}) as Record<string, unknown>;
    const id = f.praca_id;
    return typeof id === 'string' && id !== 'all' ? id : null;
  }
}
