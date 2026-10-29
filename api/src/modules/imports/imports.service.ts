import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { digits, phoneKey } from '../../common/phone/phone';
import { todaySp } from '../../common/time/dates';
import { CONTACT_KINDS } from '../../domain/catalog';
import {
  findDuplicate,
  guessMapping,
  matchPraca,
  rowToDraft,
  type DraftLead,
  dupKeys,
  type DupCandidate,
  type DupKind,
} from '../../domain/dedup';
import { EvaluateImportDto, RunImportDto, SaveMappingDto } from './dto/imports.dto';

/**
 * Cliente do Prisma: o de fora (leitura solta) ou o da transação. Toda leitura
 * que decide uma escrita recebe o da transação — ver `run`/`undo`.
 */
type Db = PrismaService | Prisma.TransactionClient;

/** Janela para desfazer uma importação. Passou disso, o lote virou base viva. */
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Quantas linhas avaliadas voltam na pré-visualização (o resto vira contagem). */
const PREVIEW_ROWS = 10;

export interface EvalRowView {
  draft: DraftLead;
  /** `lead_id` nulo = duplicata de outra linha do MESMO arquivo. */
  dup: { lead_id: string | null; lead_name: string; by: DupKind } | null;
  no_phone: boolean;
  no_name: boolean;
  praca_id: string | null;
}

export interface EvaluateView {
  total: number;
  dups: number;
  no_phone: number;
  no_name: number;
  will_import: number;
  sem_praca: number;
  guessed_map: Record<string, string>;
  rows: EvalRowView[];
}

export interface RunView {
  batch_id: string;
  imported: number;
  updated: number;
  ignored: number;
  reasons: string[];
}

export interface ImportBatchView {
  id: string;
  at: string;
  file_name: string;
  by: string;
  origem: string;
  imported: number;
  ignored: number;
  reasons: string[];
  can_undo: boolean;
}

export interface ImportMappingView {
  id: string;
  name: string;
  map: Record<string, string>;
  created_at: string;
}

/** Colunas do lead que a duplicidade e o "completar campos vazios" enxergam. */
interface CandidatoRow {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  cnpj: string | null;
  instagram: string | null;
  decisor: string;
}

interface LinhaAvaliada extends EvalRowView {
  /** O lead do banco que casou (só quando a duplicata é de verdade, com id). */
  existente: CandidatoRow | null;
}

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── avaliação ───────────────────────────────────────────────
  async evaluate(dto: EvaluateImportDto): Promise<EvaluateView> {
    // Pré-visualização: leitura solta, não decide escrita nenhuma.
    const { linhas, resumo } = await this.avaliar(dto, this.prisma);
    return {
      ...resumo,
      guessed_map: guessMapping(dto.columns),
      rows: linhas.slice(0, PREVIEW_ROWS).map((l) => this.toRowView(l)),
    };
  }

  // ── importação ──────────────────────────────────────────────
  /**
   * Avalia e aplica de uma vez, numa transação só — a varredura da
   * duplicidade INCLUSIVE. Se a leitura ficasse fora, duas importações ao
   * mesmo tempo (ou um `POST /v1/leads` no meio) decidiriam sobre um retrato
   * velho da base e criariam o "mesmo" lead duas vezes.
   */
  async run(dto: RunImportDto, user: AuthUser): Promise<RunView> {
    return this.prisma.$transaction(
      async (tx) => this.aplicar(dto, user, tx),
      { timeout: 60_000, maxWait: 20_000 },
    );
  }

  private async aplicar(
    dto: RunImportDto,
    user: AuthUser,
    tx: Prisma.TransactionClient,
  ): Promise<RunView> {
    const { linhas, resumo } = await this.avaliar(dto, tx);
    const pool = await this.poolDeDonos(dto, tx);

    const at = new Date();
    const hoje = todaySp();
    const batchId = randomUUID();
    // Ids gerados aqui para usar `createMany` — uma planilha de 5.000 linhas
    // não pode virar 10.000 INSERTs dentro da transação.
    const criados: {
      id: string;
      praca_id: string | null;
      name: string;
      city: string;
      address: string;
      phone: string;
      phone_key: string;
      cnpj: string | null;
      instagram: string | null;
      decisor: string;
      classe: string;
      origem: string;
      owner_id: string;
      stage: number;
      entered_at: string;
      stage_since: string;
      import_batch_id: string;
      possible_dup: boolean;
    }[] = [];
    const patches: { id: string; data: Record<string, string> }[] = [];
    const eventos: { lead_id: string; at: Date; author_id: string; kind: string; text: string }[] = [];

    let i = 0;
    for (const l of linhas) {
      if (l.no_name || l.no_phone) continue;
      if (l.dup && dto.dup_action === 'ignorar') continue;
      if (l.dup && dto.dup_action === 'completar') {
        // Duplicata de outra linha do mesmo arquivo não tem lead para
        // completar (o protótipo montava um patch para um id temporário, que
        // não casava com ninguém — mesmo efeito, sem a ida ao banco).
        if (!l.existente) continue;
        const data = this.camposVazios(l.existente, l.draft);
        if (Object.keys(data).length) {
          patches.push({ id: l.existente.id, data });
          eventos.push({
            lead_id: l.existente.id,
            at,
            author_id: user.id,
            kind: 'note',
            text: `Campos vazios completados pela importação ${dto.file_name}.`,
          });
        }
        continue;
      }

      const id = randomUUID();
      const origem = l.draft.origem || dto.origem;
      criados.push({
        id,
        praca_id: l.praca_id,
        name: l.draft.name,
        city: l.draft.city,
        address: l.draft.address,
        phone: l.draft.phone,
        phone_key: phoneKey(l.draft.phone),
        cnpj: l.draft.cnpj || null,
        instagram: l.draft.instagram || null,
        decisor: l.draft.decisor || '—',
        classe: l.draft.classe,
        origem,
        owner_id: pool[i % pool.length]!,
        stage: 1,
        entered_at: hoje,
        stage_since: hoje,
        import_batch_id: batchId,
        possible_dup: Boolean(l.dup),
      });
      eventos.push({
        lead_id: id,
        at,
        author_id: user.id,
        kind: 'note',
        text: `Lead importado de ${dto.file_name} · origem ${origem}.`,
      });
      i++;
    }

    const ignored = resumo.total - criados.length;
    const reasons = this.motivos(resumo, dto.dup_action);

    await tx.import_batches.create({
      data: {
        id: batchId,
        at,
        file_name: dto.file_name,
        by: user.id,
        origem: dto.origem,
        imported: criados.length,
        ignored,
        reasons,
      },
    });
    if (criados.length) await tx.leads.createMany({ data: criados });
    // Um UPDATE por lead completado — são só os duplicados do arquivo, não a
    // planilha inteira.
    for (const p of patches) await tx.leads.update({ where: { id: p.id }, data: p.data });
    if (eventos.length) await tx.lead_events.createMany({ data: eventos });

    return { batch_id: batchId, imported: criados.length, updated: patches.length, ignored, reasons };
  }

  /**
   * Leads vindos da pesquisa automática de estabelecimentos (contrato §22). Mesmo
   * caminho da importação por arquivo — lote em `import_batches` (aparece em
   * Entrada e dá para desfazer em 24 h), etapa 1, dono pelo rodízio, evento de
   * nota — mas com coordenada, fonte e id externo, e SEM exigir telefone.
   *
   * Roda dentro da transação de quem chama (o chamador reserva os candidatos e
   * cria os leads de uma vez só). A deduplicação é de quem chama.
   *
   * `opcoes` (A1 do CRM automático, contrato §47): `sem_dono` = lead com dono
   * nulo, sem consultar o rodízio (e ignorando `owner_id`); `autor_label` =
   * evento com `author_id` nulo e esse rótulo. Do `user` só se lê o `id`, que vai
   * para o `by` do lote. Sem `opcoes`, nada muda (caracterização em
   * `__tests__/criar-leads-de-busca-caracterizacao.spec.ts`).
   */
  async criarLeadsDeBusca(
    tx: Prisma.TransactionClient,
    input: {
      praca_id: string;
      file_name: string;
      origem: string;
      owner_id?: string;
      itens: {
        name: string;
        address: string;
        phone: string;
        site: string | null;
        lat: number;
        lng: number;
        location_precision: string;
        source: string;
        source_ref: string;
        /** Lote D (§40.3): só nos achados de shoppings/lojas; ausente = o lead de hoje. */
        place_kind?: string;
        parent_lead_id?: string;
      }[];
    },
    user: Pick<AuthUser, 'id'>,
    opcoes?: { sem_dono?: true; autor_label?: string },
  ): Promise<{ batch_id: string; leads: { source_ref: string; lead_id: string }[] }> {
    const praca = await tx.pracas.findUnique({ where: { id: input.praca_id }, select: { city: true } });
    if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const pool = opcoes?.sem_dono
      ? null
      : await this.poolDeDonos(
          input.owner_id ? { owner_mode: 'lote', lote_owner_id: input.owner_id } : { owner_mode: 'rodizio' },
          tx,
        );
    // Sem `autor_label`, o evento é o de hoje (só `author_id`): nenhuma chave nova no `data`.
    const autor = opcoes?.autor_label ? { author_id: null, author_label: opcoes.autor_label } : { author_id: user.id };

    const at = new Date();
    const hoje = todaySp();
    const batchId = randomUUID();
    const leads = input.itens.map((it, i) => ({
      id: randomUUID(),
      praca_id: input.praca_id,
      name: it.name,
      city: praca.city,
      address: it.address,
      phone: it.phone,
      phone_key: phoneKey(it.phone),
      site: it.site,
      lat: it.lat,
      lng: it.lng,
      location_precision: it.location_precision,
      source: it.source,
      source_ref: it.source_ref,
      ...(it.place_kind ? { place_kind: it.place_kind } : {}),
      ...(it.parent_lead_id ? { parent_lead_id: it.parent_lead_id } : {}),
      classe: 'alvo',
      origem: input.origem,
      owner_id: pool ? pool[i % pool.length]! : null,
      stage: 1,
      entered_at: hoje,
      stage_since: hoje,
      import_batch_id: batchId,
    }));

    await tx.import_batches.create({
      data: {
        id: batchId,
        at,
        file_name: input.file_name,
        by: user.id,
        origem: input.origem,
        imported: leads.length,
        ignored: 0,
        reasons: [],
      },
    });
    await tx.leads.createMany({ data: leads });
    await tx.lead_events.createMany({
      data: leads.map((l) => ({
        lead_id: l.id,
        at,
        ...autor,
        kind: 'note',
        text: `Lead criado por ${input.origem} · ${input.file_name}.`,
      })),
    });
    return { batch_id: batchId, leads: leads.map((l, i) => ({ source_ref: input.itens[i]!.source_ref, lead_id: l.id })) };
  }

  // ── lotes ───────────────────────────────────────────────────
  async listBatches(): Promise<ImportBatchView[]> {
    const rows = await this.prisma.import_batches.findMany({ orderBy: { at: 'desc' } });
    const agora = Date.now();
    return rows.map((b) => ({
      id: b.id,
      at: b.at.toISOString(),
      file_name: b.file_name,
      by: b.by,
      origem: b.origem,
      imported: b.imported,
      ignored: b.ignored,
      reasons: b.reasons,
      can_undo: agora - b.at.getTime() < UNDO_WINDOW_MS,
    }));
  }

  /**
   * Desfaz o lote: some só o lead que ninguém tocou (etapa 1 e nenhum evento
   * de contato). Lead já trabalhado fica — desfazer importação não pode apagar
   * conversa.
   */
  async undo(id: string): Promise<{ removed: number; kept: number }> {
    if (!isUuid(id)) throw this.batchNotFound();
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.import_batches.findUnique({ where: { id } });
        if (!batch) throw this.batchNotFound();
        if (Date.now() - batch.at.getTime() >= UNDO_WINDOW_MS) {
          throw new BadRequestException({
            code: 'UNDO_EXPIRED',
            message: 'Passaram-se mais de 24 horas: esta importação não pode mais ser desfeita.',
          });
        }
        const total = await tx.leads.count({ where: { import_batch_id: id } });
        // O critério vai DENTRO do DELETE: entre ler a lista e apagar, um
        // lead pode receber um contato — e aí ele não pode mais sumir.
        const { count } = await tx.leads.deleteMany({
          where: {
            import_batch_id: id,
            stage: 1,
            // Visita de campo aberta aponta para o lead: apagar levaria a visita junto (cascata).
            field_visits: { none: {} },
            // Parada de roteiro também aponta para o lead (FK RESTRICT).
            route_stops: { none: {} },
            events: { none: { kind: { in: CONTACT_KINDS as string[] } } },
          },
        });
        await tx.import_batches.update({
          where: { id },
          data: {
            imported: { decrement: count },
            reasons: { push: `${count} leads removidos por desfazer importação` },
          },
        });
        return { removed: count, kept: total - count };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  // ── mapeamentos salvos ──────────────────────────────────────
  async listMappings(): Promise<ImportMappingView[]> {
    const rows = await this.prisma.import_mappings.findMany({ orderBy: { created_at: 'asc' } });
    return rows.map((m) => this.toMappingView(m));
  }

  /** Salvar com um nome que já existe substitui o mapa (o nome é único). */
  async saveMapping(dto: SaveMappingDto): Promise<ImportMappingView> {
    const salvo = await this.prisma.import_mappings.upsert({
      where: { name: dto.name },
      create: { name: dto.name, map: dto.map },
      update: { map: dto.map },
    });
    return this.toMappingView(salvo);
  }

  async deleteMapping(id: string): Promise<{ ok: true }> {
    if (!isUuid(id)) throw this.mappingNotFound();
    const achou = await this.prisma.import_mappings.count({ where: { id } });
    if (!achou) throw this.mappingNotFound();
    await this.prisma.import_mappings.delete({ where: { id } });
    return { ok: true };
  }

  // ── internos ────────────────────────────────────────────────
  /**
   * Avalia o arquivo inteiro contra a base. Carrega TODOS os leads não
   * arquivados de uma vez (id, nome, endereço, cidade, telefone, CNPJ,
   * instagram, decisor): é uma varredura só, e a comparação por telefone/CNPJ/
   * nome+endereço não vira índice em SQL. Numa base de dezenas de milhares
   * ainda é barato; se um dia crescer para centenas de milhares, o caminho é
   * pré-filtrar por `phone_key`.
   */
  private async avaliar(dto: EvaluateImportDto, db: Db) {
    if (dto.praca_mode === 'lote') await this.assertPraca(dto.lote_praca_id, db);

    // Uma consulta de cada vez, nunca `Promise.all`: aqui o `db` pode ser o
    // cliente da transação do `run`, preso a UMA conexão — disparar duas
    // consultas em paralelo nele não paraleliza nada e ainda quebra atrás de
    // alguns poolers.
    const candidatos = await db.leads.findMany({
      where: { archived: false },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        phone: true,
        cnpj: true,
        instagram: true,
        decisor: true,
      },
    });
    const pracas =
      dto.praca_mode === 'arquivo'
        ? // Ordem explícita: "a primeira praça que casa" precisa ser sempre a
          // mesma — sem `orderBy` o Postgres não promete ordem nenhuma.
          await db.pracas.findMany({
            select: { id: true, name: true, city: true },
            orderBy: { created_at: 'asc' },
          })
        : [];

    const porId = new Map(candidatos.map((c) => [c.id, c]));
    // A lista cresce a cada linha aceita: duas linhas iguais no MESMO arquivo
    // também são duplicidade.
    const vistos: DupCandidate[] = candidatos.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      phone: c.phone,
      cnpj: c.cnpj,
      // Normaliza uma vez por lead, não uma vez por lead POR linha do arquivo.
      keys: dupKeys(c),
    }));

    const linhas: LinhaAvaliada[] = dto.rows.map((row) => {
      const draft = rowToDraft(row, dto.map, dto.origem);
      const dup = findDuplicate(draft, vistos);
      const praca_id =
        dto.praca_mode === 'lote' ? (dto.lote_praca_id ?? null) : matchPraca(draft.city, pracas);
      if (!dup && draft.name) {
        vistos.push({
          id: null,
          name: draft.name,
          address: draft.address,
          phone: draft.phone,
          cnpj: draft.cnpj,
          keys: dupKeys(draft),
        });
      }
      return {
        draft,
        dup: dup ? { lead_id: dup.lead.id, lead_name: dup.lead.name, by: dup.by } : null,
        no_phone: digits(draft.phone).length < 8,
        no_name: !draft.name,
        praca_id,
        existente: dup?.lead.id ? (porId.get(dup.lead.id) ?? null) : null,
      };
    });

    // "Vai entrar" é exatamente o que o `run` cria — as duas contas usam o
    // mesmo predicado para o relatório nunca prometer mais do que grava.
    const entra = (l: LinhaAvaliada) => !l.no_name && !l.no_phone && (!l.dup || dto.dup_action === 'criar');

    return {
      linhas,
      resumo: {
        total: linhas.length,
        dups: linhas.filter((l) => l.dup).length,
        // Sem telefone só é motivo quando a linha não foi barrada antes por
        // duplicidade ou falta de nome.
        no_phone: linhas.filter((l) => l.no_phone && !l.dup && !l.no_name).length,
        no_name: linhas.filter((l) => l.no_name).length,
        will_import: linhas.filter(entra).length,
        sem_praca: linhas.filter((l) => entra(l) && !l.praca_id).length,
      },
    };
  }

  private toRowView(l: LinhaAvaliada): EvalRowView {
    const { existente: _existente, ...view } = l;
    void _existente;
    return view;
  }

  /** Só o que está vazio no lead é completado — importação não sobrescreve trabalho feito. */
  private camposVazios(ex: CandidatoRow, d: DraftLead): Record<string, string> {
    const data: Record<string, string> = {};
    if (!ex.address && d.address) data.address = d.address;
    if (!ex.city && d.city) data.city = d.city;
    if (!ex.phone && d.phone) {
      data.phone = d.phone;
      // `phone_key` anda junto com `phone` (mesma regra do POST /v1/leads).
      data.phone_key = phoneKey(d.phone);
    }
    if (!ex.instagram && d.instagram) data.instagram = d.instagram;
    if ((!ex.decisor || ex.decisor === '—') && d.decisor) data.decisor = d.decisor;
    if (!ex.cnpj && d.cnpj) data.cnpj = d.cnpj;
    return data;
  }

  /** Texto do relatório do lote — mesmas frases do protótipo (`routes/entrada.tsx:160-167`). */
  private motivos(
    resumo: { dups: number; no_phone: number; no_name: number; sem_praca: number },
    dupAction: string,
  ): string[] {
    const rotulo =
      dupAction === 'ignorar'
        ? 'ignoradas'
        : dupAction === 'completar'
          ? 'campos vazios completados'
          : 'criadas como possível duplicado';
    const reasons: string[] = [];
    if (resumo.dups) reasons.push(`${resumo.dups} duplicadas (${rotulo})`);
    if (resumo.no_phone) reasons.push(`${resumo.no_phone} sem telefone`);
    if (resumo.no_name) reasons.push(`${resumo.no_name} sem nome`);
    if (resumo.sem_praca) reasons.push(`${resumo.sem_praca} sem praça`);
    return reasons;
  }

  /** Donos dos leads criados: uma pessoa só, ou o rodízio (padrão = time ativo). */
  private async poolDeDonos(
    dto: Pick<RunImportDto, 'owner_mode' | 'lote_owner_id' | 'rodizio_ids'>,
    db: Db,
  ): Promise<string[]> {
    if (dto.owner_mode === 'lote') {
      await this.assertPessoas([dto.lote_owner_id!], db);
      return [dto.lote_owner_id!];
    }
    if (dto.rodizio_ids?.length) {
      await this.assertPessoas(dto.rodizio_ids, db);
      return dto.rodizio_ids;
    }
    const ativos = await db.users.findMany({
      where: { active: true },
      orderBy: [{ sort: 'asc' }, { created_at: 'asc' }],
      select: { id: true },
    });
    if (!ativos.length) {
      throw new BadRequestException({
        code: 'NO_OWNERS',
        message: 'Não há ninguém ativo para receber os leads.',
      });
    }
    return ativos.map((u) => u.id);
  }

  private async assertPessoas(ids: string[], db: Db) {
    const achou = await db.users.count({ where: { id: { in: ids }, active: true } });
    if (achou !== new Set(ids).size) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pessoa não encontrada.' });
    }
  }

  private async assertPraca(id: string | undefined, db: Db) {
    if (!id || !isUuid(id)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    }
    const achou = await db.pracas.count({ where: { id } });
    if (!achou) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
  }

  private batchNotFound() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Importação não encontrada.' });
  }

  private mappingNotFound() {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Mapeamento não encontrado.' });
  }

  private toMappingView(m: { id: string; name: string; map: unknown; created_at: Date }): ImportMappingView {
    return {
      id: m.id,
      name: m.name,
      map: (m.map ?? {}) as Record<string, string>,
      created_at: m.created_at.toISOString(),
    };
  }
}
