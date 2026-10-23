/**
 * O cupom real no Freela (fase L6b; contrato §38.6–§38.7). Criação fora da transação do banco, idempotente pelo código
 * determinístico; adoção quando uma tentativa anterior criou e não soubemos; espera crescente; leitura do estado; vínculo
 * automático (passos 1 e 2, só com as flags da F6/F7). Com `FIELD_VOUCHER_COUPONS_ENABLED` desligada a porta é o `NoopIssuer`
 * e nada aqui chama o Freela. Nunca lança para o relógio.
 */
import { ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { todaySp } from '../../../common/time/dates';
import {
  codigoDoCupom,
  CONFIG_VOUCHER,
  corpoDoCupom,
  cupomConfere,
  desfechoDaFalha,
  devidoAgora,
  horaDeLer,
  lerParamsCupom,
  MENSAGEM_ERRO_CUPOM,
  mudancaDoSync,
  PREFIXO_CUPOM,
  type CupomFreela,
  type FonteContratante,
} from '../../../domain/voucher-rules';
import { LOVABLE_C_FLAGS, type FlagsLovableC } from '../../rotas/rotas.tokens';
import { COMPANY_SIGNUP_LIGADO } from '../company-signup.tokens';
import { SIGNUP_SYNC_OPCOES, type OpcoesSignupSync } from '../signup-sync.tokens';
import { VOUCHERS_REPOSITORY, type VoucherRow, type VouchersRepository } from './vouchers.repository';
import { VOUCHER_COUPON_ISSUER, type VoucherCouponIssuer } from './vouchers.tokens';

/** Por rodada do relógio (§38.7). */
export const LIMITE_POR_RODADA = 20;
const UMA_HORA_MS = 60 * 60_000;

export const cuponsDesligados = () =>
  new NotFoundException({ code: 'VOUCHER_COUPONS_DISABLED', message: 'O cupom no Freela não está ligado neste servidor.' });

/** Só o que o domínio precisa do erro (status e códigos); a mensagem do Freela nunca é lida. */
function infoDoErro(e: unknown): { status?: number; code?: string; freelaStatus?: number; freelaCode?: string } {
  const x = e as { getStatus?: () => number; getResponse?: () => unknown; freelaStatus?: number; freelaError?: { code?: string } };
  const resp = typeof x?.getResponse === 'function' ? (x.getResponse() as { code?: unknown }) : null;
  return {
    ...(typeof x?.getStatus === 'function' ? { status: x.getStatus() } : {}),
    ...(resp && typeof resp.code === 'string' ? { code: resp.code } : {}),
    ...(typeof x?.freelaStatus === 'number' ? { freelaStatus: x.freelaStatus } : {}),
    ...(typeof x?.freelaError?.code === 'string' ? { freelaCode: x.freelaError.code } : {}),
  };
}

export interface ResultadoRodada {
  vinculados: number;
  tentados: number;
  criados: number;
  lidos: number;
}

@Injectable()
export class VoucherCouponsService {
  private readonly log = new Logger(VoucherCouponsService.name);
  /** Instância única (README "Produção"): evita duas tentativas do mesmo pedido ao mesmo tempo (aprovação × relógio). */
  private readonly emCurso = new Set<string>();
  private ultimoAviso = 0;

  constructor(
    @Inject(VOUCHERS_REPOSITORY) private readonly repo: VouchersRepository,
    @Inject(VOUCHER_COUPON_ISSUER) private readonly issuer: VoucherCouponIssuer,
    @Optional() @Inject(LOVABLE_C_FLAGS) private readonly flags?: FlagsLovableC,
    @Optional() @Inject(COMPANY_SIGNUP_LIGADO) private readonly cadastroLigado: boolean = false,
    @Optional() @Inject(SIGNUP_SYNC_OPCOES) private readonly sync?: OpcoesSignupSync,
  ) {}

  /** O cupom real está ligado (flag + porta de verdade). */
  get ligado(): boolean {
    return this.flags?.voucher_coupons === true && this.issuer.ativo;
  }

  freelaConfigurado(): boolean {
    return this.ligado && this.issuer.configurado();
  }

  /** Passos 1 e 2 do vínculo (§38.6), cada um só com a flag da sua fase. Nunca por nome. */
  async vinculoAutomatico(leadId: string): Promise<{ user_id: string; source: FonteContratante } | null> {
    if (!this.ligado) return null;
    if (this.cadastroLigado) {
      const u = await this.repo.contratanteDoCadastro(leadId);
      if (u) return { user_id: u, source: 'company_signup' };
    }
    if (this.sync?.ligado) {
      const u = await this.repo.contratanteDoSync(leadId);
      if (u) return { user_id: u, source: 'signup_sync' };
    }
    return null;
  }

  /** Log de "aguardando conexão" no máximo uma vez por hora (nada quebra o boot). */
  async avisarSemConexao(agora = new Date()): Promise<void> {
    if (!this.ligado || agora.getTime() - this.ultimoAviso < UMA_HORA_MS) return;
    this.ultimoAviso = agora.getTime();
    const n = (await this.repo.aguardandoFreela(LIMITE_POR_RODADA)).length;
    if (n > 0) {
      this.log.warn(`${n}${n === LIMITE_POR_RODADA ? '+' : ''} cupom(ns) aprovado(s) aguardando conexão com o Freela (FREELA_API_URL/FREELA_ADMIN_* vazios).`);
    }
  }

  /**
   * Uma tentativa de criar o cupom do pedido (`aguardando_freela`). Chamada depois do commit da aprovação, do vínculo e do
   * retry, e pelo relógio. Nunca lança: o que não deu fica para a próxima rodada.
   */
  async tentarCriar(id: string, agora = new Date()): Promise<VoucherRow | null> {
    if (!this.ligado || this.emCurso.has(id)) return null;
    this.emCurso.add(id);
    try {
      return await this.criar(id, agora);
    } catch (e) {
      this.log.error(`cupom do pedido ${id}: ${e instanceof Error ? e.name : 'erro'}`);
      return null;
    } finally {
      this.emCurso.delete(id);
    }
  }

  private async criar(id: string, agora: Date): Promise<VoucherRow | null> {
    const v = await this.repo.porId(id);
    if (!v || v.coupon_status !== 'aguardando_freela' || !v.contractor_user_id) return v;
    const params = lerParamsCupom(v.coupon_params);
    if (!params) return this.falhar(v, 'FREELA_REJECTED', agora);
    const code = v.coupon_code ?? codigoDoCupom(v.id);
    if (!this.issuer.configurado()) {
      await this.avisarSemConexao(agora);
      if (v.coupon_error_code === 'FREELA_NOT_CONFIGURED') return v;
      return this.anotar(v, 'FREELA_NOT_CONFIGURED', agora, false);
    }
    const esperado = { code, contractorUserId: v.contractor_user_id, params };
    try {
      const c = await this.issuer.criar(corpoDoCupom(params, code, v.contractor_user_id, todaySp(agora)));
      return this.concluir(v, c, 'coupon_created', agora);
    } catch (e) {
      const d = desfechoDaFalha(infoDoErro(e));
      if (d.tipo === 'rejeitado') return this.falhar(v, d.code, agora);
      if (d.tipo === 'reler') {
        let achado: CupomFreela | undefined;
        try {
          achado = (await this.issuer.listar()).find((c) => c.code.toUpperCase() === code.toUpperCase());
        } catch {
          achado = undefined;
        }
        if (achado) {
          return cupomConfere(achado, esperado) ? this.concluir(v, achado, 'coupon_adopted', agora) : this.falhar(v, 'COUPON_CODE_CONFLICT', agora);
        }
      }
      return this.anotar(v, d.code, agora, true);
    }
  }

  /** Tentativa que não deu: conta, guarda o código e a mensagem FIXA e espera (sem evento: não é mudança de estado). */
  private async anotar(v: VoucherRow, code: string, agora: Date, contar: boolean): Promise<VoucherRow | null> {
    return this.repo.emTransacao(`voucher:${v.id}`, (tx) =>
      tx.transitar(
        v.id,
        { coupon_status: 'aguardando_freela' },
        {
          coupon_error_code: code,
          coupon_error: MENSAGEM_ERRO_CUPOM[code] ?? MENSAGEM_ERRO_CUPOM.FREELA_UNKNOWN,
          ...(contar ? { coupon_attempts: v.coupon_attempts + 1, coupon_last_attempt_at: agora } : {}),
        },
        null,
      ),
    );
  }

  private async falhar(v: VoucherRow, code: string, agora: Date): Promise<VoucherRow | null> {
    return this.repo.emTransacao(`voucher:${v.id}`, (tx) =>
      tx.transitar(
        v.id,
        { coupon_status: 'aguardando_freela' },
        {
          coupon_status: 'erro',
          coupon_error_code: code,
          coupon_error: MENSAGEM_ERRO_CUPOM[code] ?? MENSAGEM_ERRO_CUPOM.FREELA_REJECTED,
          coupon_attempts: v.coupon_attempts + 1,
          coupon_last_attempt_at: agora,
        },
        { type: 'coupon_failed', client_id: null, actor_kind: 'sistema', actor_id: null, actor_name: null, reason: null, data: { code } },
      ),
    );
  }

  private async concluir(v: VoucherRow, c: CupomFreela, tipo: 'coupon_created' | 'coupon_adopted', agora: Date): Promise<VoucherRow | null> {
    return this.repo.emTransacao(`voucher:${v.id}`, (tx) =>
      tx.transitar(
        v.id,
        { coupon_status: 'aguardando_freela' },
        {
          coupon_status: 'criado',
          coupon_code: v.coupon_code ?? c.code,
          coupon_id: c.id,
          coupon_expires_at: c.expiresAt ? new Date(c.expiresAt) : null,
          coupon_error_code: null,
          coupon_error: null,
          coupon_attempts: v.coupon_attempts + 1,
          coupon_last_attempt_at: agora,
          coupon_synced_at: agora,
        },
        { type: tipo, client_id: null, actor_kind: 'sistema', actor_id: null, actor_name: null, reason: null, data: { code: c.code, coupon_id: c.id } },
      ),
    );
  }

  /** "Tentar agora" (admin): `erro` volta para a fila; `aguardando_freela` tenta já. */
  async tentarDeNovo(id: string, ator: { id: string; name: string }, agora = new Date()): Promise<void> {
    if (!this.ligado) throw cuponsDesligados();
    const v = await this.repo.porId(id);
    if (!v) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pedido de cupom não encontrado.' });
    if ((v.coupon_status !== 'erro' && v.coupon_status !== 'aguardando_freela') || !v.contractor_user_id) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'Este cupom não está esperando o Freela.' });
    }
    const de = v.coupon_status;
    const r = await this.repo.emTransacao(`voucher:${id}`, (tx) =>
      tx.transitar(
        id,
        { coupon_status: de },
        { coupon_status: 'aguardando_freela', coupon_last_attempt_at: null },
        { type: 'coupon_retried', client_id: null, actor_kind: 'equipe', actor_id: ator.id, actor_name: ator.name, reason: null, data: { from: de } },
      ),
    );
    if (!r) throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'Este cupom mudou enquanto você olhava. Atualize a tela.' });
    await this.tentarCriar(id, agora);
  }

  /** Desativa no Freela (`PATCH active=false`) e só então marca `desativado`. Falha do Freela sobe (502/503) e nada muda. */
  async desativar(id: string, clientId: string, motivo: string, ator: { id: string; name: string }, agora = new Date()): Promise<void> {
    if (!this.ligado) throw cuponsDesligados();
    const v = await this.repo.porId(id);
    if (!v) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pedido de cupom não encontrado.' });
    if ((v.coupon_status !== 'criado' && v.coupon_status !== 'usado') || !v.coupon_id) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'Só dá para desativar um cupom criado no Freela.' });
    }
    await this.issuer.desativar(v.coupon_id);
    const de = v.coupon_status;
    const r = await this.repo.emTransacao(`voucher:${id}`, (tx) =>
      tx.transitar(
        id,
        { coupon_status: de },
        { coupon_status: 'desativado', coupon_synced_at: agora },
        { type: 'coupon_deactivated', client_id: clientId, actor_kind: 'equipe', actor_id: ator.id, actor_name: ator.name, reason: motivo, data: { source: 'praca' } },
      ),
    );
    if (!r) throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'Este cupom mudou enquanto você olhava. Atualize a tela.' });
  }

  /**
   * Uma rodada do relógio do Freela (`freela-sync.scheduler.ts`, a cada 2 min, com a conexão configurada): vínculo automático
   * (F6/F7), até 20 criações devidas e a leitura do estado a cada `voucher_sync_min`. Cada parte no seu `try`.
   */
  async rodada(agora = new Date()): Promise<ResultadoRodada> {
    const r: ResultadoRodada = { vinculados: 0, tentados: 0, criados: 0, lidos: 0 };
    if (!this.ligado) return r;
    if (this.cadastroLigado || this.sync?.ligado) {
      try {
        for (const v of await this.repo.aguardandoVinculo(LIMITE_POR_RODADA)) {
          const auto = await this.vinculoAutomatico(v.lead_id);
          if (!auto) continue;
          if (await this.repo.comCupomDoContratante(auto.user_id, v.id)) continue;
          const feito = await this.repo
            .emTransacao(`voucher:${v.id}`, (tx) =>
              tx.transitar(
                v.id,
                { coupon_status: 'aguardando_vinculo' },
                {
                  contractor_user_id: auto.user_id,
                  contractor_source: auto.source,
                  coupon_status: 'aguardando_freela',
                  coupon_code: codigoDoCupom(v.id),
                },
                { type: 'contractor_linked', client_id: null, actor_kind: 'sistema', actor_id: null, actor_name: null, reason: null, data: { source: auto.source } },
              ),
            )
            .catch(() => null);
          if (feito) r.vinculados++;
        }
      } catch (e) {
        this.log.error(`vínculo automático dos cupons falhou: ${e instanceof Error ? e.name : 'erro'}`);
      }
    }
    if (!this.issuer.configurado()) {
      await this.avisarSemConexao(agora).catch(() => undefined);
      return r;
    }
    try {
      const devidos = (await this.repo.aguardandoFreela(LIMITE_POR_RODADA * 5)).filter((v) => devidoAgora(v, agora)).slice(0, LIMITE_POR_RODADA);
      for (const v of devidos) {
        r.tentados++;
        const depois = await this.tentarCriar(v.id, agora);
        if (depois?.coupon_status === 'criado') r.criados++;
      }
    } catch (e) {
      this.log.error(`criação dos cupons falhou: ${e instanceof Error ? e.name : 'erro'}`);
    }
    try {
      r.lidos = await this.lerEstado(agora);
    } catch (e) {
      this.log.error(`leitura do estado dos cupons falhou: ${e instanceof Error ? e.name : 'erro'}`);
    }
    return r;
  }

  /** Usado, devolvido, vencido ou desativado no Freela (§38.7). Devolve quantos pedidos foram lidos. */
  async lerEstado(agora = new Date()): Promise<number> {
    if (!this.ligado || !this.issuer.configurado()) return 0;
    const cfg = CONFIG_VOUCHER.ler(await this.repo.lerConfig());
    if (!horaDeLer(await this.repo.ultimaLeitura(), agora, cfg.voucher_sync_min)) return 0;
    const ativos = await this.repo.comCupomAtivo();
    if (ativos.length === 0) return 0;
    const porCodigo = new Map(
      (await this.issuer.listar()).filter((c) => c.code.toUpperCase().startsWith(PREFIXO_CUPOM)).map((c) => [c.code.toUpperCase(), c]),
    );
    for (const v of ativos) {
      const c = v.coupon_code ? porCodigo.get(v.coupon_code.toUpperCase()) : undefined;
      const de = v.coupon_status!;
      const m = c ? mudancaDoSync(de, c, agora) : null;
      await this.repo.emTransacao(`voucher:${v.id}`, (tx) =>
        tx.transitar(
          v.id,
          { coupon_status: de },
          {
            coupon_synced_at: agora,
            ...(m ? { coupon_status: m.para, ...(m.redeemed_at !== undefined ? { redeemed_at: m.redeemed_at } : {}) } : {}),
          },
          m ? { type: m.evento, client_id: null, actor_kind: 'sistema', actor_id: null, actor_name: null, reason: null, data: { source: 'freela' } } : null,
        ),
      );
    }
    return ativos.length;
  }
}
