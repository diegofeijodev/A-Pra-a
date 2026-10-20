import { randomUUID } from 'crypto';
import { ViolacaoUnica } from '../../earnings/__tests__/fakes';
import type { EarningsTx } from '../../earnings/earnings.repository';
import type { FotoLida, PhotoStorage } from '../../photo-storage';
import type {
  DadosConsultor,
  EventoNovo,
  EventoRow,
  FiltroPayouts,
  MudancaPayout,
  PayoutNovo,
  PayoutRow,
  PayoutsRepository,
  PayoutsTx,
} from '../payouts.repository';
import type { StatusPagamento } from '../../../../domain/payout-rules';

export const CPF_VALIDO = '52998224725';

/** Repositório em memória com as mesmas restrições do banco (UNIQUE parcial, CAS) sobre o razão da F8 compartilhado. */
export class FakePayoutsRepo implements PayoutsRepository {
  payouts: PayoutRow[] = [];
  eventosGravados: EventoRow[] = [];
  dados = new Map<string, DadosConsultor>();
  /** Simula falha no meio da transação (o banco desfaria tudo; aqui o teste confere a limpeza do arquivo). */
  falharNoRazao = false;

  constructor(private readonly ganhos: { emTransacao<T>(id: string, fn: (tx: EarningsTx) => Promise<T>): Promise<T> }) {}

  async listar(f: FiltroPayouts) {
    const rows = this.payouts
      .filter((p) => !f.week_start || p.week_start === f.week_start)
      .filter((p) => !f.consultant_ids || f.consultant_ids.includes(p.consultant_id))
      .filter((p) => (f.status ? p.status === f.status : f.incluirCancelados ? true : p.status !== 'cancelled'))
      .sort((a, b) => (a.week_start === b.week_start ? a.created_at.getTime() - b.created_at.getTime() : a.week_start < b.week_start ? 1 : -1));
    return f.limit ? rows.slice(0, f.limit) : rows;
  }
  async porId(id: string) {
    return this.payouts.find((p) => p.id === id) ?? null;
  }
  async eventos(id: string) {
    return this.eventosGravados.filter((e) => e.payout_id === id);
  }
  async ultimosEventos(ids: string[]) {
    const out = new Map<string, EventoRow>();
    for (const e of this.eventosGravados) if (ids.includes(e.payout_id) && e.type !== 'pix_key_viewed' && e.type !== 'exported') out.set(e.payout_id, e);
    return out;
  }
  async dadosDosConsultores(ids: string[]) {
    return new Map(ids.flatMap((id) => (this.dados.has(id) ? [[id, this.dados.get(id) as DadosConsultor] as const] : [])));
  }
  async comProblema() {
    return this.payouts.filter((p) => p.status === 'failed' || (p.status === 'pending' && p.block_reason !== null));
  }

  private inserirEvento(e: EventoNovo) {
    this.eventosGravados.push({ ...e, id: randomUUID(), created_at: new Date() });
  }

  async emTransacao<T>(consultantId: string, fn: (tx: PayoutsTx) => Promise<T>): Promise<T> {
    return this.ganhos.emTransacao(consultantId, async (etx) => {
      const self = this;
      const tx = Object.create(etx) as PayoutsTx;
      Object.assign(tx, {
        listar: (f: FiltroPayouts) => self.listar(f),
        porId: (id: string) => self.porId(id),
        eventos: (id: string) => self.eventos(id),
        ultimosEventos: (ids: string[]) => self.ultimosEventos(ids),
        dadosDosConsultores: (ids: string[]) => self.dadosDosConsultores(ids),
        comProblema: () => self.comProblema(),
        inserirEvento: async (e: EventoNovo) => self.inserirEvento(e),
        inserirLancamento: async (n: Parameters<EarningsTx['inserirLancamento']>[0]) => {
          if (self.falharNoRazao) throw new Error('falha simulada no razão');
          return etx.inserirLancamento(n);
        },
        criar: async (n: PayoutNovo, ator: { id: string | null; name: string }) => {
          if (self.payouts.some((p) => p.consultant_id === n.consultant_id && p.week_start === n.week_start && p.status !== 'cancelled')) {
            throw new ViolacaoUnica('field_payouts_one_active_per_week');
          }
          const row: PayoutRow = {
            ...n,
            id: randomUUID(),
            status: 'pending',
            paid_cents: null,
            paid_at: null,
            paid_by: null,
            paid_by_name: null,
            method: 'pix_manual',
            proof_key: null,
            proof_mime: null,
            proof_size: null,
            note: null,
            diff_reason: null,
            created_at: new Date(),
          };
          self.payouts.push(row);
          self.inserirEvento({ payout_id: row.id, type: 'created', from_status: null, to_status: 'pending', actor_id: ator.id, actor_name: ator.name, reason: n.block_reason ? 'Bloqueado: falta a chave Pix' : null, data: {} });
          return row;
        },
        transitar: async (
          id: string,
          de: StatusPagamento,
          para: StatusPagamento,
          mudanca: MudancaPayout,
          evento: Omit<EventoNovo, 'payout_id' | 'from_status' | 'to_status'>,
        ) => {
          const p = self.payouts.find((x) => x.id === id);
          if (!p || p.status !== de) return null;
          Object.assign(p, mudanca, { status: para });
          self.inserirEvento({ ...evento, payout_id: id, from_status: de, to_status: para });
          return p;
        },
      });
      return fn(tx);
    });
  }
}

export class FakeStorage implements PhotoStorage {
  arquivos = new Map<string, { bytes: Buffer; mime: string }>();
  puts: string[] = [];
  removidos: string[] = [];
  async put(key: string, bytes: Buffer, mime: string) {
    this.puts.push(key);
    this.arquivos.set(key, { bytes, mime });
  }
  async get(key: string): Promise<FotoLida | null> {
    return this.arquivos.get(key) ?? null;
  }
  async remove(key: string) {
    this.removidos.push(key);
    this.arquivos.delete(key);
  }
}

export const PDF = Buffer.from('%PDF-1.7\ncomprovante');
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
