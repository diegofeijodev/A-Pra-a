/**
 * Fakes COM ESTADO dos cupons (contrato §38): repositório em memória com o lock por chave, o compare-and-set, os únicos
 * (`client_id`, `coupon_code`, eventos) e o índice parcial `field_vouchers_one_coupon_per_contractor`; e um `FreelaClient`
 * falso com os cupons em memória, que responde como o api-freela (`{ data }` já desembrulhado pelo cliente; código repetido =
 * `400 COUPON_CODE_TAKEN`; o GET lista todos). Os testes conferem o ESTADO, não só a chamada.
 */
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { CorpoCupomFreela, CupomFreela } from '../../../../domain/voucher-rules';
import { FreelaHttpError } from '../../../freela/freela-client';
import type { ContratanteCrm } from '../../../freela/freela-coupons';
import type {
  CondicaoVoucher,
  EventoVoucherNovo,
  EventoVoucherRow,
  FiltroVouchers,
  LeadDoPedido,
  MudancaVoucher,
  VoucherNovo,
  VoucherRow,
  VouchersRepository,
  VouchersTx,
} from '../vouchers.repository';

const unico = (alvo: string) =>
  new Prisma.PrismaClientKnownRequestError(`Unique constraint failed: ${alvo}`, {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: alvo },
  });
const QUE_OCUPAM = ['aguardando_freela', 'criado', 'usado'];

export class RepoFalso implements VouchersRepository {
  vouchers = new Map<string, VoucherRow>();
  eventosGravados: EventoVoucherRow[] = [];
  leads = new Map<string, LeadDoPedido>();
  visitas: { id: string; client_id: string; consultant_id: string; lead_id: string }[] = [];
  pracas = new Map<string, { city: string; cobertura_uf: string | null; cobertura_cidade: string | null }>();
  consultores = new Map<string, string>();
  cadastros = new Map<string, string>();
  syncs = new Map<string, string>();
  config: unknown = undefined;
  chaves: string[] = [];
  private filas = new Map<string, Promise<unknown>>();
  private desfazer: (() => void)[] | null = null;

  // ── leitura ──
  async porId(id: string) {
    const v = this.vouchers.get(id);
    return v ? { ...v } : null;
  }
  async porClientId(c: string) {
    const v = [...this.vouchers.values()].find((x) => x.client_id === c);
    return v ? { ...v } : null;
  }
  async eventoPorClientId(c: string) {
    return this.eventosGravados.find((e) => e.client_id === c) ?? null;
  }
  async eventos(id: string) {
    return this.eventosGravados.filter((e) => e.voucher_id === id);
  }
  private filtrar(f: FiltroVouchers): VoucherRow[] {
    return [...this.vouchers.values()]
      .filter(
        (v) =>
          (!f.consultant_id || v.consultant_id === f.consultant_id) &&
          (!f.praca_id || v.praca_id === f.praca_id) &&
          (!f.status || v.status === f.status) &&
          (f.coupon_status === undefined || v.coupon_status === f.coupon_status) &&
          (!f.desde || v.created_at >= f.desde) &&
          (!f.ate || v.created_at < f.ate) &&
          (!f.q || v.company_name.toLowerCase().includes(f.q.toLowerCase())),
      )
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }
  async listar(f: FiltroVouchers) {
    return this.filtrar(f)
      .slice(0, f.limit ?? 500)
      .map((v) => ({ ...v }));
  }
  async contar(f: FiltroVouchers) {
    const m = new Map<string, { status: string; coupon_status: string | null; n: number }>();
    for (const v of this.filtrar(f)) {
      const k = `${v.status}|${v.coupon_status}`;
      const g = m.get(k) ?? { status: v.status, coupon_status: v.coupon_status, n: 0 };
      g.n++;
      m.set(k, g);
    }
    return [...m.values()];
  }
  async ativosDoLead(leadId: string) {
    return [...this.vouchers.values()]
      .filter((v) => v.lead_id === leadId && (v.status === 'pendente' || v.status === 'aprovado'))
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }
  async comCupomDoContratante(u: string, exceto: string) {
    return (
      [...this.vouchers.values()].find(
        (v) =>
          v.contractor_user_id === u &&
          v.id !== exceto &&
          v.coupon_status !== null &&
          ['aguardando_freela', 'criado', 'usado', 'vencido', 'desativado', 'erro'].includes(v.coupon_status),
      ) ?? null
    );
  }
  async aguardandoFreela(limite: number) {
    return [...this.vouchers.values()]
      .filter((v) => v.coupon_status === 'aguardando_freela')
      .sort((a, b) => (a.coupon_last_attempt_at?.getTime() ?? 0) - (b.coupon_last_attempt_at?.getTime() ?? 0))
      .slice(0, limite)
      .map((v) => ({ ...v }));
  }
  async aguardandoVinculo(limite: number) {
    return [...this.vouchers.values()]
      .filter((v) => v.coupon_status === 'aguardando_vinculo')
      .slice(0, limite)
      .map((v) => ({ ...v }));
  }
  async comCupomAtivo() {
    return [...this.vouchers.values()]
      .filter((v) => v.coupon_status === 'criado' || v.coupon_status === 'usado')
      .map((v) => ({ ...v }));
  }
  async ultimaLeitura() {
    const ds = (await this.comCupomAtivo()).map((v) => v.coupon_synced_at).filter((d): d is Date => !!d);
    return ds.length ? new Date(Math.max(...ds.map((d) => d.getTime()))) : null;
  }
  async nomesDosConsultores(ids: string[]) {
    return new Map(ids.filter((i) => this.consultores.has(i)).map((i) => [i, this.consultores.get(i)!]));
  }
  async visitaDoConsultor(consultantId: string, ref: string) {
    const v = this.visitas.find(
      (x) => x.consultant_id === consultantId && (x.id === ref || x.client_id === ref),
    );
    return v ? { id: v.id, lead_id: v.lead_id } : null;
  }
  async lead(id: string) {
    return this.leads.get(id) ?? null;
  }
  async praca(id: string) {
    return this.pracas.get(id) ?? null;
  }
  async contratanteDoCadastro(leadId: string) {
    return this.cadastros.get(leadId) ?? null;
  }
  async contratanteDoSync(leadId: string) {
    return this.syncs.get(leadId) ?? null;
  }
  async lerConfig() {
    return this.config;
  }

  // ── escrita (só dentro da transação) ──
  private registrar(undo: () => void) {
    this.desfazer?.push(undo);
  }
  private conferirIndice(v: VoucherRow) {
    if (!v.contractor_user_id || !v.coupon_status || !QUE_OCUPAM.includes(v.coupon_status)) return;
    const outro = [...this.vouchers.values()].find(
      (x) =>
        x.id !== v.id &&
        x.contractor_user_id === v.contractor_user_id &&
        x.coupon_status !== null &&
        QUE_OCUPAM.includes(x.coupon_status),
    );
    if (outro) throw unico('field_vouchers_one_coupon_per_contractor');
  }
  private evento(voucherId: string, e: Omit<EventoVoucherNovo, 'voucher_id'>) {
    if (e.client_id && this.eventosGravados.some((x) => x.client_id === e.client_id))
      throw unico('field_voucher_events_client_id_key');
    const row: EventoVoucherRow = { ...e, voucher_id: voucherId, id: randomUUID(), created_at: new Date() };
    this.eventosGravados.push(row);
    this.registrar(() => (this.eventosGravados = this.eventosGravados.filter((x) => x !== row)));
  }

  private tx(): VouchersTx {
    const self = this;
    return {
      porId: (id) => self.porId(id),
      porClientId: (c) => self.porClientId(c),
      eventoPorClientId: (c) => self.eventoPorClientId(c),
      eventos: (id) => self.eventos(id),
      listar: (f) => self.listar(f),
      contar: (f) => self.contar(f),
      ativosDoLead: (id) => self.ativosDoLead(id),
      comCupomDoContratante: (u, e) => self.comCupomDoContratante(u, e),
      aguardandoFreela: (n) => self.aguardandoFreela(n),
      aguardandoVinculo: (n) => self.aguardandoVinculo(n),
      comCupomAtivo: () => self.comCupomAtivo(),
      ultimaLeitura: () => self.ultimaLeitura(),
      nomesDosConsultores: (ids) => self.nomesDosConsultores(ids),
      visitaDoConsultor: (c, r) => self.visitaDoConsultor(c, r),
      lead: (id) => self.lead(id),
      praca: (id) => self.praca(id),
      contratanteDoCadastro: (id) => self.contratanteDoCadastro(id),
      contratanteDoSync: (id) => self.contratanteDoSync(id),
      lerConfig: () => self.lerConfig(),
      async criar(n: VoucherNovo, e) {
        // Um respiro: sem o lock, duas criações em paralelo se intercalariam aqui (é o que o teste de concorrência pega).
        await new Promise((r) => setTimeout(r, 5));
        if ([...self.vouchers.values()].some((x) => x.client_id === n.client_id))
          throw unico('field_vouchers_client_id_key');
        const row: VoucherRow = {
          ...n,
          id: randomUUID(),
          status: 'pendente',
          decision_reason: null,
          decided_by: null,
          decided_by_name: null,
          decided_at: null,
          contractor_user_id: null,
          contractor_name: null,
          contractor_source: null,
          coupon_status: null,
          coupon_code: null,
          coupon_id: null,
          coupon_params: null,
          coupon_expires_at: null,
          coupon_error_code: null,
          coupon_error: null,
          coupon_attempts: 0,
          coupon_last_attempt_at: null,
          coupon_synced_at: null,
          redeemed_at: null,
          created_at: new Date(),
        };
        self.vouchers.set(row.id, row);
        self.registrar(() => self.vouchers.delete(row.id));
        self.evento(row.id, e);
        return { ...row };
      },
      async transitar(id: string, de: CondicaoVoucher, m: MudancaVoucher, e) {
        const v = self.vouchers.get(id);
        if (!v) return null;
        if (de.status !== undefined && v.status !== de.status) return null;
        if (de.coupon_status !== undefined && v.coupon_status !== de.coupon_status) return null;
        // Trigger: decisão é uma só; parâmetros fotografados não mudam.
        if (v.status !== 'pendente' && m.status !== undefined && m.status !== v.status)
          throw new Error('field_vouchers: pedido já decidido não muda de status');
        if (
          v.coupon_params != null &&
          m.coupon_params !== undefined &&
          JSON.stringify(m.coupon_params) !== JSON.stringify(v.coupon_params)
        ) {
          throw new Error('field_vouchers: os parâmetros do cupom fotografados na aprovação são imutáveis');
        }
        const antes = { ...v };
        const depois = { ...v, ...m } as VoucherRow;
        self.vouchers.set(id, depois);
        try {
          self.conferirIndice(depois);
          if (
            depois.coupon_code &&
            [...self.vouchers.values()].some((x) => x.id !== id && x.coupon_code === depois.coupon_code)
          )
            throw unico('field_vouchers_coupon_code_key');
        } catch (err) {
          self.vouchers.set(id, antes);
          throw err;
        }
        self.registrar(() => self.vouchers.set(id, antes));
        if (e) self.evento(id, e);
        return { ...depois };
      },
      async inserirEvento(id, e) {
        self.evento(id, e);
      },
      async gravarConfig(cfg) {
        const antes = self.config;
        self.config = cfg;
        self.registrar(() => (self.config = antes));
      },
    };
  }

  /** Lock por chave (como o advisory lock) e desfaz tudo se a função lançar (como o ROLLBACK). */
  async emTransacao<T>(chave: string, fn: (tx: VouchersTx) => Promise<T>): Promise<T> {
    this.chaves.push(chave);
    const anterior = this.filas.get(chave) ?? Promise.resolve();
    let liberar!: () => void;
    const minha = new Promise<void>((r) => (liberar = r));
    this.filas.set(
      chave,
      anterior.then(() => minha),
    );
    await anterior;
    const log: (() => void)[] = [];
    const externo = this.desfazer;
    this.desfazer = log;
    try {
      return await fn(this.tx());
    } catch (e) {
      for (const u of log.reverse()) u();
      throw e;
    } finally {
      this.desfazer = externo;
      liberar();
    }
  }
}

type Falha = 'timeout' | 'criar_e_timeout' | '500' | '401' | '422' | 'lista_timeout';

/** `FreelaClient` falso com os cupons em memória (o que importa é o estado). */
export class FreelaFalso {
  cupons = new Map<string, CupomFreela>();
  contratantes: ContratanteCrm[] = [];
  chamadas: string[] = [];
  configurado = true;
  proximas: Falha[] = [];

  isConfigured() {
    return this.configurado;
  }

  private exigirConfig() {
    if (!this.configurado)
      throw new ServiceUnavailableException({
        code: 'FREELA_NOT_CONFIGURED',
        message: 'Conexão com o Freela não configurada.',
      });
  }

  private gravar(c: CorpoCupomFreela): CupomFreela {
    const cupom: CupomFreela = {
      id: randomUUID(),
      code: c.code.trim().toUpperCase(),
      discountType: c.discountType,
      percentOff: c.discountType === 'PERCENT' ? (c.percentOff ?? null) : null,
      amountOffInCents: c.discountType === 'FIXED' ? (c.amountOffInCents ?? null) : null,
      contractorUserId: c.contractorUserId,
      singleUse: c.singleUse ?? true,
      active: true,
      expiresAt: c.expiresAt ?? null,
      redeemedAt: null,
    };
    this.cupons.set(cupom.code, cupom);
    return { ...cupom };
  }

  async createCoupon(c: CorpoCupomFreela): Promise<CupomFreela> {
    this.chamadas.push(`create:${c.code}`);
    this.exigirConfig();
    const f = this.proximas[0] && this.proximas[0] !== 'lista_timeout' ? this.proximas.shift() : undefined;
    if (f === 'timeout')
      throw new BadGatewayException({
        code: 'FREELA_UNREACHABLE',
        message: 'O Freela não respondeu em 15 s.',
      });
    if (f === 'criar_e_timeout') {
      this.gravar(c);
      throw new BadGatewayException({
        code: 'FREELA_UNREACHABLE',
        message: 'O Freela não respondeu em 15 s.',
      });
    }
    if (f === '500') throw new FreelaHttpError(500, 'O Freela respondeu HTTP 500.');
    if (f === '401') throw new FreelaHttpError(401, 'Não autorizado.');
    if (f === '422') throw new FreelaHttpError(422, 'Algo inválido.');
    if (this.cupons.has(c.code.trim().toUpperCase()))
      throw new FreelaHttpError(400, 'Código já existe.', { code: 'COUPON_CODE_TAKEN' });
    return this.gravar(c);
  }

  async listCoupons(): Promise<CupomFreela[]> {
    this.chamadas.push('list');
    this.exigirConfig();
    if (this.proximas[0] === 'lista_timeout') {
      this.proximas.shift();
      throw new BadGatewayException({
        code: 'FREELA_UNREACHABLE',
        message: 'O Freela não respondeu em 15 s.',
      });
    }
    return [...this.cupons.values()].map((c) => ({ ...c }));
  }

  async updateCoupon(id: string, corpo: { active: boolean }): Promise<CupomFreela> {
    this.chamadas.push(`update:${id}`);
    this.exigirConfig();
    const c = [...this.cupons.values()].find((x) => x.id === id);
    if (!c) throw new FreelaHttpError(404, 'Cupom não encontrado.', { code: 'COUPON_NOT_FOUND' });
    c.active = corpo.active;
    return { ...c };
  }

  async searchContractors(q: string): Promise<ContratanteCrm[]> {
    this.chamadas.push(`search:${q}`);
    this.exigirConfig();
    return this.contratantes.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  }

  /** O que o Freela faz sozinho (resgate na vaga, cancelamento da vaga, vencimento). */
  resgatar(code: string, quando = '2026-10-23T15:00:00.000Z') {
    this.cupons.get(code)!.redeemedAt = quando;
  }
  devolver(code: string) {
    this.cupons.get(code)!.redeemedAt = null;
  }
}
