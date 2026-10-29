/**
 * CRM automático — A3: etapa e lead pelo quadro de contratantes do Freela (arquitetura §2.5, achados 3, 6, 13, 14, 18 e 19;
 * desenho §12.2 D2 e D3; contrato §47).
 *
 * De 2 em 2 horas (o relógio é a Task 11) lê o quadro inteiro (`FreelaClient.quadroDeContratantes`) e, para cada empresa:
 * - casa com um lead pelas regras puras (`casarCartao`: usuário do Freela, cadastro do representante, telefone com DDD); na
 *   dúvida é ambíguo e nada é gravado (casamento errado é para sempre: o automático nunca volta a etapa);
 * - grava o vínculo (`freela_user_id`, só quando nulo) e as vagas pagas (`freela_hirings`, só quando mudam, com o evento
 *   "Freela: 1 → 2 vagas pagas"), e sobe a etapa pelo MESMO `subir()` da A2 (alvo 5/6/7 de `alvoDasContratacoes`; o cadastro
 *   assistido nunca vai a 5 por aqui, o 5 dele é do sync);
 * - a empresa que se cadastrou sozinha na cidade de uma praça aberta, depois do início dela, vira lead novo, sem dono, com o
 *   telefone do cartão (D3: o telefone do Freela vai SÓ para o lead novo, nunca sobrescreve o de um lead que já existe).
 *
 * Leituras em lote (`IN` em pedaços de 500), uma transação por lead, escrita só do que mudou. `rodar` nunca lança; o `summary`
 * da rodada só tem contagens e o erro é saneado (`erroDaRodada`): nunca nome, telefone ou e-mail.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CRM_FLAGS, type FlagsCrm } from '../../common/flags/crm.flags';
import { phoneKey } from '../../common/phone/phone';
import { todaySp } from '../../common/time/dates';
import { AUTOR_AUTOMATICO_FREELA, ORIGEM_CADASTRO_FREELA } from '../../domain/catalog/crm';
import {
  alvoDasContratacoes,
  casarCartao,
  leadsDisputados,
  normalizarCidade,
  pracaDoCartao,
  type Casamento,
  type IndicesQuadro,
  type PracaCobertura,
} from '../../domain/crm-quadro-rules';
import type { CartaoFreela } from '../../domain/freela-cartao';
import { FreelaClient } from '../freela/freela-client';
import { GeoService } from '../geo/geo.service';
import { criarEventoAuto, EtapasAutomaticasService, nomeEtapa, precisaEtapa } from './etapas-automaticas.service';
import { erroDaRodada, registrarRodada, type RodadaNova } from './rodadas';

export interface ContagemQuadro {
  cartoes: number;
  casados_por_id: number;
  casados_por_cadastro: number;
  casados_por_telefone: number;
  ambiguos: number;
  /** Leads novos (empresa que se cadastrou sozinha); não entram em `etapas`. */
  criados: number;
  /** Leads que já existiam e subiram de etapa nesta rodada. */
  etapas: Record<'5' | '6' | '7', number>;
  /** Eventos "Freela: x → n vagas pagas" gravados nesta rodada. */
  contratacoes: number;
}
export type ResumoQuadro = ContagemQuadro | { nao_configurado: true };

/** `IN` em pedaços (achado 14). */
const LOTE = 500;
/** Até onde procurar o município de cada nome de `vizinhas` (achado 13). */
const RAIO_VIZINHAS_KM = 100;
/**
 * Fato sem dia conhecido (contagem que o Praça não VIU subir): ordena antes de qualquer `stage_since`, então nem `deveAplicar`
 * nem o `where` do `subir` tiram o lead de "Perdido" — nem se alguém o marcar perdido entre a leitura e a transação.
 */
const FATO_SEM_DIA = '0000-00-00';
const PREFIXO_CONTRATACOES = 'a3:contratacoes:';
const POR_ONDE: Record<'id' | 'cadastro' | 'telefone', string> = {
  id: 'casado pelo usuário do Freela',
  cadastro: 'casado pelo cadastro do representante',
  telefone: 'casado pelo telefone',
};

const diaMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const vagasPagas = (n: number): string => `${n} ${n === 1 ? 'vaga paga' : 'vagas pagas'}`;
const chaveCidade = (cidade: string, uf: string): string => `${normalizarCidade(cidade)}|${uf.trim().toUpperCase()}`;
/** Chave de 9 dígitos do telefone do cartão; mais curta não serve para casar nem para barrar duplicata. */
const chaveDoTelefone = (raw: string | null): string | null => {
  const k = phoneKey(raw);
  return k.length === 9 ? k : null;
};
/** Dia de Brasília do cadastro no Freela; `registeredAt` que não é data = null (o zod só exige texto). */
const diaDoCadastro = (c: CartaoFreela): string | null => {
  const d = new Date(c.registeredAt);
  return Number.isNaN(d.getTime()) ? null : todaySp(d);
};

function pedacos<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += LOTE) out.push(xs.slice(i, i + LOTE));
  return out;
}

function vazio(): ContagemQuadro {
  return {
    cartoes: 0,
    casados_por_id: 0,
    casados_por_cadastro: 0,
    casados_por_telefone: 0,
    ambiguos: 0,
    criados: 0,
    etapas: { '5': 0, '6': 0, '7': 0 },
    contratacoes: 0,
  };
}

interface LeadDoQuadro {
  id: string;
  stage: number;
  stage_since: string;
  archived: boolean;
  is_test: boolean;
  auto_stage_applied: number | null;
  freela_user_id: string | null;
  freela_hirings: number | null;
}

/** O que a rodada leu do Praça para o quadro todo (achado 14). */
interface Leitura {
  idx: IndicesQuadro;
  /** `userId` com algum lead, arquivado ou de teste incluídos: não vira lead novo. */
  comLead: Set<string>;
  /** `praca_id|phone_key` com algum lead, arquivado ou de teste incluídos: não vira lead novo nessa praça. */
  ocupadas: Set<string>;
}

@Injectable()
export class QuadroFreelaService {
  private readonly log = new Logger(QuadroFreelaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly freela: FreelaClient,
    private readonly geo: GeoService,
    private readonly etapas: EtapasAutomaticasService,
    @Optional() @Inject(CRM_FLAGS) private readonly crm?: FlagsCrm,
  ) {}

  async rodar(agora: Date): Promise<ResumoQuadro> {
    const r = vazio();
    if (!this.crm?.freela_pipeline) return r;
    if (!this.freela.isConfigured()) {
      // Nada falhou e nada foi lido: `ok` e a marca no summary (a tela diz "falta a conexão com o Freela").
      await this.gravarRodada({ job: 'quadro_freela', started_at: agora, ok: true, summary: { nao_configurado: true } });
      return { nao_configurado: true };
    }
    const extra = { vinculados: 0, datas_invalidas: 0, erros: 0 };
    let primeiroErro: unknown = null;
    const falhou = (e: unknown, onde: string) => {
      extra.erros++;
      primeiroErro ??= e;
      this.log.warn(`A3: ${onde} (${erroDaRodada(e)})`);
    };

    try {
      const hoje = todaySp(agora);
      const cartoes = await this.freela.quadroDeContratantes();
      r.cartoes = cartoes.length;
      const pracas = await this.pracasComCobertura();
      const porCidade = new Map<string, Set<string>>();
      for (const p of pracas) {
        for (const x of p.cidades) {
          const k = chaveCidade(x.cidade, x.uf);
          if (!porCidade.has(k)) porCidade.set(k, new Set());
          porCidade.get(k)!.add(p.id);
        }
      }
      const pracasDaCidade = (c: CartaoFreela): Set<string> =>
        (c.city && c.state && porCidade.get(chaveCidade(c.city, c.state))) || new Set();

      const lido = await this.ler(cartoes);
      const casamentos: Casamento[] = cartoes.map((c) => casarCartao(c, lido.idx, pracasDaCidade(c)));
      const disputados = leadsDisputados(casamentos);

      const casados: Array<{ c: CartaoFreela; lead_id: string; por: 'id' | 'cadastro' | 'telefone' }> = [];
      const semLead: CartaoFreela[] = [];
      cartoes.forEach((c, i) => {
        if (diaDoCadastro(c) === null) extra.datas_invalidas++;
        const m = casamentos[i]!;
        if (m && ('ambiguo' in m || disputados.has(m.lead_id))) r.ambiguos++;
        else if (m) casados.push({ c, ...m });
        else semLead.push(c);
      });
      for (const x of casados) r[`casados_por_${x.por}`]++;

      // ── leads que já existem ──
      const estado = await this.estadoDosLeads(casados.map((x) => x.lead_id));
      // Lido ANTES de gravar os eventos desta rodada: um salto 0 → 2 visto agora dá `null` (nunca viu a 1ª) → 6, não 7.
      const viuPrimeira = await this.diasViuPrimeira(
        casados.filter((x) => x.c.hiringsCount >= 2 && (estado.get(x.lead_id)?.freela_hirings ?? null) !== null).map((x) => x.lead_id),
      );
      for (const x of casados) {
        const lead = estado.get(x.lead_id);
        if (!lead || lead.archived || lead.is_test) continue;
        try {
          const out = await this.atualizar(x.c, x.por, lead, viuPrimeira.get(lead.id) ?? null, lido, hoje, agora);
          if (!out) continue;
          if (out.vinculou) extra.vinculados++;
          if (out.anotou) r.contratacoes++;
          if (out.subiu) r.etapas[String(out.subiu) as '5' | '6' | '7']++;
        } catch (e) {
          falhou(e, `lead ${lead.id} não atualizado`);
        }
      }

      // ── empresas que se cadastraram sozinhas ──
      for (const c of semLead) {
        if (lido.idx.assistidos.has(c.userId) || lido.comLead.has(c.userId)) continue;
        if (diaDoCadastro(c) === null) continue;
        const pracaId = pracaDoCartao(c, pracas, hoje);
        if (!pracaId) continue;
        const chave = chaveDoTelefone(c.whatsappPhone);
        if (chave && lido.ocupadas.has(`${pracaId}|${chave}`)) continue;
        try {
          const n = await this.criar(c, pracaId, chave, hoje, agora);
          if (n.criou) r.criados++;
          if (n.anotou) r.contratacoes++;
        } catch (e) {
          falhou(e, 'lead novo não criado');
        }
      }
    } catch (e) {
      falhou(e, 'rodada interrompida');
    }

    await this.gravarRodada({
      job: 'quadro_freela',
      started_at: agora,
      ok: extra.erros === 0,
      summary: { ...r, etapas: { ...r.etapas }, ...extra },
      ...(primeiroErro ? { error: erroDaRodada(primeiroErro) } : {}),
    });
    return r;
  }

  /**
   * Um lead casado, numa transação, só se há o que gravar: vínculo (se nulo), vagas pagas (se mudaram) e a etapa. A etapa só
   * sai de "Perdido" quando o Praça VÊ a contagem subir (fato = hoje); na 1ª observação, ou sem subida, o fato fica sem dia.
   */
  private async atualizar(
    c: CartaoFreela,
    por: 'id' | 'cadastro' | 'telefone',
    lead: LeadDoQuadro,
    diaViuPrimeira: string | null,
    lido: Leitura,
    hoje: string,
    agora: Date,
  ): Promise<{ vinculou: boolean; anotou: boolean; subiu: 5 | 6 | 7 | null } | null> {
    const hirings = c.hiringsCount;
    const antes = lead.freela_hirings;
    const alvo = alvoDasContratacoes({
      hirings,
      antes,
      hoje,
      dia_viu_primeira: diaViuPrimeira,
      assistido: lido.idx.assistidos.has(c.userId),
    });
    const fatoDia = antes !== null && hirings > antes ? hoje : FATO_SEM_DIA;
    const etapa = alvo !== null && precisaEtapa(lead, alvo, fatoDia) ? alvo : null;
    const vincular = lead.freela_user_id === null;
    // `null → 0` também grava (sem evento): sem isso, um salto 0 → 2 depois pareceria 1ª observação e iria a 7.
    const contar = antes !== hirings;
    if (!etapa && !vincular && !contar) return null;

    return this.prisma.$transaction(async (tx) => {
      let vinculou = false;
      if (vincular) {
        const v = await tx.leads.updateMany({
          where: { id: lead.id, freela_user_id: null, archived: false, is_test: false },
          data: { freela_user_id: c.userId },
        });
        vinculou = v.count === 1;
        // Vínculo recusado: o lead mudou entre a leitura e a transação (a A2, na mesma hora par, pode tê-lo ligado a OUTRO
        // usuário do Freela; ou foi arquivado). O casamento já não vale: nem vagas nem etapa por este cartão.
        if (!vinculou) return { vinculou: false, anotou: false, subiu: null };
      }
      let anotou = false;
      if (contar) {
        const h = await tx.leads.updateMany({
          where: { id: lead.id, freela_hirings: antes, archived: false, is_test: false },
          data: { freela_hirings: hirings },
        });
        if (h.count === 1 && hirings !== (antes ?? 0)) {
          anotou = await criarEventoAuto(tx, {
            lead_id: lead.id,
            at: agora,
            kind: 'note',
            author_id: null,
            author_label: AUTOR_AUTOMATICO_FREELA,
            text: `Freela: ${antes ?? 0} → ${vagasPagas(hirings)} (visto em ${diaMes(hoje)})`,
            auto_key: `${PREFIXO_CONTRATACOES}${lead.id}:${hirings}`,
          });
        }
      }
      let subiu: 5 | 6 | 7 | null = null;
      if (etapa) {
        const dia = diaDoCadastro(c);
        const fato =
          etapa === 5 ? `Empresa cadastrada no Freela${dia ? ` em ${diaMes(dia)}` : ''}` : `${vagasPagas(hirings)} no Freela`;
        const d = await this.etapas.subir(tx, {
          lead_id: lead.id,
          alvo: etapa,
          fato_dia: fatoDia,
          autor_label: AUTOR_AUTOMATICO_FREELA,
          texto: `${fato} (${POR_ONDE[por]}).`,
          auto_key: `a3:etapa:${lead.id}:${etapa}`,
          agora,
        });
        if (d === 'aplicar') subiu = etapa;
      }
      return { vinculou, anotou, subiu };
    });
  }

  /**
   * Lead novo da empresa que se cadastrou sozinha (D3). Trava por usuário do Freela (duas rodadas não criam dois) e a MESMA
   * trava do formulário de captura para o telefone na praça; reconfere dentro das travas, com arquivados.
   */
  private async criar(
    c: CartaoFreela,
    pracaId: string,
    chave: string | null,
    hoje: string,
    agora: Date,
  ): Promise<{ criou: boolean; anotou: boolean }> {
    const hirings = c.hiringsCount;
    // Cadastro próprio: nunca nulo (0 → 5).
    const alvo = alvoDasContratacoes({ hirings, antes: null, hoje, dia_viu_primeira: null, assistido: false })!;
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-freela-user:${c.userId}`}))`;
        if (chave) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${pracaId}:${chave}`}))`;
        const ja = await tx.leads.findFirst({
          where: { OR: [{ freela_user_id: c.userId }, ...(chave ? [{ praca_id: pracaId, phone_key: chave }] : [])] },
          select: { id: true },
        });
        if (ja) return { criou: false, anotou: false };

        const phone = (c.whatsappPhone ?? '').trim();
        const novo = await tx.leads.create({
          data: {
            praca_id: pracaId,
            name: c.name.trim() || 'Contratante',
            city: (c.city ?? '').trim(),
            phone,
            phone_key: phoneKey(phone),
            classe: 'alvo',
            origem: ORIGEM_CADASTRO_FREELA,
            owner_id: null,
            stage: alvo,
            entered_at: hoje,
            stage_since: hoje,
            freela_user_id: c.userId,
            freela_hirings: hirings,
            auto_stage_applied: alvo,
          },
          select: { id: true },
        });
        const dia = diaDoCadastro(c)!;
        await criarEventoAuto(tx, {
          lead_id: novo.id,
          at: agora,
          kind: 'stage',
          author_id: null,
          author_label: AUTOR_AUTOMATICO_FREELA,
          stage_to: alvo,
          text:
            `Empresa nova no Freela: cadastro em ${diaMes(dia)} (${(c.city ?? '').trim()}/${(c.state ?? '').trim().toUpperCase()}), ` +
            `${hirings > 0 ? vagasPagas(hirings) : 'sem vaga paga ainda'}. Entrou no funil em ${nomeEtapa(alvo)}.`,
          auto_key: `a3:criado:${c.userId}`,
        });
        // A 1ª observação das vagas também vira evento: é dele que sai o `dia_viu_primeira` das próximas rodadas.
        const anotou =
          hirings > 0 &&
          (await criarEventoAuto(tx, {
            lead_id: novo.id,
            at: agora,
            kind: 'note',
            author_id: null,
            author_label: AUTOR_AUTOMATICO_FREELA,
            text: `Freela: 0 → ${vagasPagas(hirings)} (visto em ${diaMes(hoje)})`,
            auto_key: `${PREFIXO_CONTRATACOES}${novo.id}:${hirings}`,
          }));
        return { criou: true, anotou };
      },
      { timeout: 10_000, maxWait: 5_000 },
    );
  }

  /** Mapas do achado 14, em lote: por usuário do Freela, pelos cadastros do campo e pela chave de 9 dígitos do telefone. */
  private async ler(cartoes: CartaoFreela[]): Promise<Leitura> {
    const idx: IndicesQuadro = { porFreelaUserId: new Map(), porCadastro: new Map(), porChave: new Map(), assistidos: new Set() };
    const comLead = new Set<string>();
    const ocupadas = new Set<string>();
    const juntar = (m: Map<string, string[]>, k: string, v: string) => {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(v);
    };
    const usuarios = [...new Set(cartoes.map((c) => c.userId))];
    const chaves = [...new Set(cartoes.map((c) => chaveDoTelefone(c.whatsappPhone)).filter((k): k is string => k !== null))];

    for (const lote of pedacos(usuarios)) {
      const leads = await this.prisma.leads.findMany({
        where: { freela_user_id: { in: lote } },
        select: { id: true, freela_user_id: true, archived: true, is_test: true },
      });
      for (const l of leads) {
        comLead.add(l.freela_user_id!);
        if (!l.archived && !l.is_test) juntar(idx.porFreelaUserId, l.freela_user_id!, l.id);
      }
      const signups = await this.prisma.field_signups.findMany({
        where: { freela_user_id: { in: lote }, match_status: 'linked' },
        select: { freela_user_id: true, lead_id: true, lead: { select: { archived: true, is_test: true, freela_user_id: true } } },
      });
      for (const s of signups) {
        idx.assistidos.add(s.freela_user_id);
        const l = s.lead;
        if (!s.lead_id || !l || l.archived || l.is_test) continue;
        // Lead já ligado a OUTRO usuário do Freela não casa por aqui (o passo do telefone, se casar, dá ambíguo).
        if (l.freela_user_id !== null && l.freela_user_id !== s.freela_user_id) continue;
        juntar(idx.porCadastro, s.freela_user_id, s.lead_id);
      }
      const empresas = await this.prisma.field_company_signups.findMany({
        where: { freela_user_id: { in: lote } },
        select: { freela_user_id: true },
      });
      for (const e of empresas) if (e.freela_user_id) idx.assistidos.add(e.freela_user_id);
    }

    for (const lote of pedacos(chaves)) {
      const leads = await this.prisma.leads.findMany({
        where: { phone_key: { in: lote } },
        select: { id: true, phone: true, phone_key: true, praca_id: true, freela_user_id: true, archived: true, is_test: true },
      });
      for (const l of leads) {
        if (l.praca_id) ocupadas.add(`${l.praca_id}|${l.phone_key}`);
        if (l.archived || l.is_test) continue;
        if (!idx.porChave.has(l.phone_key)) idx.porChave.set(l.phone_key, []);
        idx.porChave.get(l.phone_key)!.push({ lead_id: l.id, phone: l.phone, praca_id: l.praca_id, freela_user_id: l.freela_user_id });
      }
    }
    return { idx, comLead, ocupadas };
  }

  private async estadoDosLeads(ids: string[]): Promise<Map<string, LeadDoQuadro>> {
    const out = new Map<string, LeadDoQuadro>();
    for (const lote of pedacos([...new Set(ids)])) {
      const leads = await this.prisma.leads.findMany({
        where: { id: { in: lote } },
        select: {
          id: true,
          stage: true,
          stage_since: true,
          archived: true,
          is_test: true,
          auto_stage_applied: true,
          freela_user_id: true,
          freela_hirings: true,
        },
      });
      for (const l of leads) out.set(l.id, l);
    }
    return out;
  }

  /** `dia_viu_primeira` de cada lead: o dia de Brasília do evento `a3:contratacoes:<lead>:*` MAIS ANTIGO (qualquer n). */
  private async diasViuPrimeira(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const lote of pedacos([...new Set(ids)])) {
      const eventos = await this.prisma.lead_events.findMany({
        where: { lead_id: { in: lote }, auto_key: { startsWith: PREFIXO_CONTRATACOES } },
        select: { lead_id: true, at: true },
        orderBy: { at: 'asc' },
      });
      for (const e of eventos) if (!out.has(e.lead_id)) out.set(e.lead_id, todaySp(e.at));
    }
    return out;
  }

  /**
   * Cidades (com UF) de cada praça (achado 13): a da cobertura + cada nome de `vizinhas` resolvido para o município com esse
   * nome mais perto do centro (`cobertura_ibge`), até 100 km. Sem `cobertura_ibge`, nenhuma cidade.
   */
  private async pracasComCobertura(): Promise<PracaCobertura[]> {
    const pracas = await this.prisma.pracas.findMany({
      select: {
        id: true,
        start_date: true,
        end_date: true,
        cobertura_cidade: true,
        cobertura_uf: true,
        cobertura_ibge: true,
        vizinhas: true,
      },
    });
    return pracas.map((p) => {
      const cidades: PracaCobertura['cidades'] = [];
      // Sem `cobertura_ibge` a praça não entra com cidade nenhuma (achado 13): não gera lead e o telefone só casa pelo número.
      if (p.cobertura_ibge && p.cobertura_cidade && p.cobertura_uf) cidades.push({ cidade: p.cobertura_cidade, uf: p.cobertura_uf });
      if (p.cobertura_ibge && p.vizinhas.length > 0 && this.geo.find(p.cobertura_ibge)) {
        const perto = this.geo.cidadesNoRaio(p.cobertura_ibge, RAIO_VIZINHAS_KM).map((m) => ({ ...m, chave: normalizarCidade(m.nome) }));
        for (const nome of p.vizinhas) {
          const alvo = normalizarCidade(nome);
          let melhor: (typeof perto)[number] | undefined;
          for (const m of perto) if (m.chave === alvo && (!melhor || m.km < melhor.km)) melhor = m;
          if (melhor) cidades.push({ cidade: melhor.nome, uf: melhor.uf });
        }
      }
      return { id: p.id, start_date: p.start_date, end_date: p.end_date, cidades };
    });
  }

  /** A gravação da rodada nunca derruba `rodar` (nem mascara o erro que ela registra). */
  private async gravarRodada(r: RodadaNova): Promise<void> {
    try {
      await registrarRodada(this.prisma, r);
    } catch (e) {
      this.log.error(`A3: rodada não gravada (${erroDaRodada(e)})`);
    }
  }
}
