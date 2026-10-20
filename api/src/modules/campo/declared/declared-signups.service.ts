/**
 * Ganho por cadastro declarado (modo do chefe S3, contrato §32). A declaração é um FATO imutável criado dentro do
 * checkout; a conferência com o Freela é um join de leitura (nunca gravado); a anulação é outro fato.
 * O dinheiro continua no razão da F8: aqui só nascem declarações e anulações.
 */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthUser } from '../../../common/auth/auth-user';
import { PrismaService } from '../../../common/database/prisma.service';
import { addDays, todaySp } from '../../../common/time/dates';
import {
  acimaDoLimite,
  classificarDeclaracao,
  contagensVazias,
  deveAlertarDivergencia,
  pctDivergencia,
  somar,
  textoDivergencia,
  type Contagens,
  type MotivoAnulacao,
  type StatusDeclaracao,
} from '../../../domain/declared-rules';
import { inicioDaSemana, normalizarRegra, versaoVigente, type VersaoRegra } from '../../../domain/earnings-rules';
import { CAMPO_DA_REGRA, type RegraConfirmacao } from '../../../domain/signup-sync-rules';
import { RotasConfigService } from '../../rotas/rotas-config.service';
import { EARNINGS_REPOSITORY, type EarningsRepository } from '../earnings/earnings.repository';
import { EARNINGS_OPCOES, type OpcoesEarnings } from '../earnings/earnings.tokens';
import { violouUnico } from '../prisma-errors';
import type { AnularDeclaracaoDto, DeclaredQueryDto } from './dto/declared.dto';

const MAX_DIAS = 92;
const MAX_LINHAS = 500;
const MAX_LIDAS = 20_000;

export const FONTE_DECLARADOS =
  'Cadastros declarados no checkout da visita × cadastros do Freela (field_signups) ligados ao mesmo estabelecimento';

export interface PreparoDeclaracao {
  declared_day: string;
  rule_version: number | null;
}

export interface DeclaracaoLinha {
  id: string;
  consultant_id: string;
  consultant_name: string;
  praca_id: string;
  declared_day: string;
  declared_at: string;
  company_name: string;
  lead_id: string;
  visit_id: string;
  rule_version: number | null;
  paid_by: 'declared' | 'freela_confirmed';
  status: StatusDeclaracao;
  over_cap: boolean;
  confirmed_by_other_consultant: boolean;
  void: { reason: string; note: string; voided_at: string; voided_by: string | null } | null;
}

export interface AlertaDivergencia {
  type: 'declared_divergence';
  consultant_id: string;
  name: string;
  praca_id: string;
  declared: number;
  unmatched: number;
  divergence_pct: number;
  message: string;
}

const naoEncontrada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Declaração não encontrada.' });

@Injectable()
export class DeclaredSignupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: RotasConfigService,
    @Inject(EARNINGS_REPOSITORY) private readonly repo: EarningsRepository,
    @Optional() @Inject(EARNINGS_OPCOES) private readonly opcoes?: OpcoesEarnings,
  ) {}

  get ligado(): boolean {
    return this.opcoes?.declaradasLigado === true;
  }

  // ── checkout ────────────────────────────────────────────────────────────

  /** Dia (Brasília, do SERVIDOR) e versão da regra vigente nele; lido antes da transação do checkout. */
  async preparar(agora: Date): Promise<PreparoDeclaracao> {
    const dia = todaySp(agora);
    const v = versaoVigente(await this.repo.versoes(), dia);
    return { declared_day: dia, rule_version: v?.version ?? null };
  }

  /**
   * Dentro da transação do checkout. Idempotente (`ON CONFLICT DO NOTHING`): uma por visita e UMA POR EMPRESA.
   * Quando nasce, tira o lead das rotas futuras (paradas `pendente` de dias depois da declaração viram `descartada`).
   */
  async registrar(
    tx: Prisma.TransactionClient,
    p: {
      consultant_id: string;
      visit_id: string;
      client_id: string;
      lead: { id: string; name: string };
      flow: string;
      agora: Date;
      preparo: PreparoDeclaracao;
    },
  ): Promise<boolean> {
    const r = await tx.field_declared_signups.createMany({
      data: [
        {
          consultant_id: p.consultant_id,
          visit_id: p.visit_id,
          lead_id: p.lead.id,
          declared_at: p.agora,
          declared_day: p.preparo.declared_day,
          company_name: p.lead.name,
          rule_version: p.preparo.rule_version,
          client_id: p.client_id,
          flow: p.flow,
        },
      ],
      skipDuplicates: true,
    });
    if (r.count === 0) return false;
    await tx.field_route_stops.updateMany({
      where: { lead_id: p.lead.id, status: 'pendente', day: { gt: p.preparo.declared_day } },
      data: { status: 'descartada' },
    });
    return true;
  }

  // ── leitura (relatório e alerta) ────────────────────────────────────────

  private async carregar(f: {
    from: string;
    to: string;
    praca_id?: string;
    consultant_id?: string;
    consultant_ids?: string[];
  }) {
    const [versoes, cad] = await Promise.all([this.repo.versoes(), this.configs.cadastro()]);
    const regraConf: RegraConfirmacao = cad.confirmation_rule;
    const decl = await this.prisma.field_declared_signups.findMany({
      where: {
        declared_day: { gte: f.from, lte: f.to },
        ...(f.consultant_id ? { consultant_id: f.consultant_id } : {}),
        ...(f.consultant_ids ? { consultant_id: { in: f.consultant_ids } } : {}),
        ...(f.praca_id ? { consultant: { praca_id: f.praca_id } } : {}),
      },
      include: { void: true, consultant: { select: { name: true, praca_id: true } } },
      orderBy: [{ declared_at: 'desc' }, { id: 'asc' }],
      take: MAX_LIDAS,
    });
    const leads = [...new Set(decl.map((d) => d.lead_id))];
    const cadastros = leads.length
      ? await this.prisma.field_signups.findMany({
          where: { lead_id: { in: leads } },
          select: {
            lead_id: true,
            consultant_id: true,
            activated_at: true,
            first_vacancy_at: true,
            first_job_completed_at: true,
          },
        })
      : [];
    const evento = CAMPO_DA_REGRA[regraConf];
    const porLead = new Map<string, Array<{ consultant_id: string; confirmado: boolean }>>();
    for (const c of cadastros) {
      const arr = porLead.get(c.lead_id as string) ?? [];
      arr.push({ consultant_id: c.consultant_id, confirmado: c[evento] != null });
      porLead.set(c.lead_id as string, arr);
    }
    const regraDoDia = (dia: string) => normalizarRegra((versaoVigente(versoes, dia) as VersaoRegra | null)?.config ?? ({} as never));
    const capDoDia = (dia: string) => regraDoDia(dia).declared_daily_cap;
    const acima = acimaDoLimite(
      decl.map((d) => ({
        id: d.id,
        consultant_id: d.consultant_id,
        declared_day: d.declared_day,
        declared_at: d.declared_at,
        anulada: !!d.void,
      })),
      capDoDia,
    );
    const linhas = decl.map((d) => {
      const c = classificarDeclaracao({
        anulada: !!d.void,
        consultant_id: d.consultant_id,
        cadastros: porLead.get(d.lead_id) ?? [],
      });
      const linha: DeclaracaoLinha = {
        id: d.id,
        consultant_id: d.consultant_id,
        consultant_name: d.consultant.name,
        praca_id: d.consultant.praca_id,
        declared_day: d.declared_day,
        declared_at: d.declared_at.toISOString(),
        company_name: d.company_name,
        lead_id: d.lead_id,
        visit_id: d.visit_id,
        rule_version: d.rule_version,
        paid_by: regraDoDia(d.declared_day).signup_source,
        status: c.status,
        over_cap: acima.has(d.id),
        confirmed_by_other_consultant: c.por_outro,
        void: d.void
          ? {
              reason: d.void.reason,
              note: d.void.note,
              voided_at: d.void.voided_at.toISOString(),
              voided_by: d.void.voided_by_name,
            }
          : null,
      };
      return linha;
    });
    return { linhas, regraConf };
  }

  private totais(linhas: readonly DeclaracaoLinha[]): Contagens & { divergence_pct: number } {
    const c = contagensVazias();
    for (const l of linhas) somar(c, l.status, l.over_cap);
    return { ...c, divergence_pct: pctDivergencia(c) };
  }

  async relatorio(q: DeclaredQueryDto, agora = new Date()) {
    const vig = versaoVigente(await this.repo.versoes(), todaySp(agora));
    const inicio = inicioDaSemana(todaySp(agora), vig?.config.week_start_weekday ?? 1);
    const from = q.from ?? inicio;
    const to = q.to ?? (q.from ? todaySp(agora) : addDays(inicio, 6));
    if (to < from) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'to: precisa ser igual ou depois de from.' });
    if (addDays(from, MAX_DIAS) < to)
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `O período pode ter no máximo ${MAX_DIAS} dias.` });
    const { linhas, regraConf } = await this.carregar({
      from,
      to,
      ...(q.praca_id ? { praca_id: q.praca_id } : {}),
      ...(q.consultant_id ? { consultant_id: q.consultant_id } : {}),
    });
    const totais = this.totais(linhas);
    const porConsultor = new Map<string, DeclaracaoLinha[]>();
    for (const l of linhas) porConsultor.set(l.consultant_id, [...(porConsultor.get(l.consultant_id) ?? []), l]);
    const filtro = q.status;
    const visiveis = linhas.filter((l) =>
      !filtro ? true : filtro === 'over_cap' ? l.over_cap && l.status !== 'voided' : l.status === filtro,
    );
    return {
      from,
      to,
      source: `${FONTE_DECLARADOS} (regra de confirmação: ${regraConf})`,
      rows: visiveis.slice(0, MAX_LINHAS),
      truncated: visiveis.length > MAX_LINHAS,
      totals: totais,
      by_consultant: [...porConsultor.entries()].map(([id, ls]) => ({
        consultant_id: id,
        name: (ls[0] as DeclaracaoLinha).consultant_name,
        praca_id: (ls[0] as DeclaracaoLinha).praca_id,
        ...this.totais(ls),
      })),
      conta: [
        `${totais.declared} declaradas no período: ${totais.confirmed} confirmadas pelo Freela, ${totais.pending_confirmation} ligadas e aguardando o evento da regra, ${totais.unmatched} sem correspondência, ${totais.voided} anuladas.`,
        `${totais.over_cap} acima do limite diário (não entram no pagamento).`,
        textoDivergencia(totais),
      ],
    };
  }

  /** "Atenção agora" (§32.7): consultores com divergência acima dos dois limites nos últimos 7 dias (até ontem). */
  async alertas(pracaId: string | undefined, agora = new Date()): Promise<AlertaDivergencia[]> {
    const hoje = todaySp(agora);
    const [cfg, { linhas }] = await Promise.all([
      this.configs.modo(),
      this.carregar({ from: addDays(hoje, -7), to: addDays(hoje, -1), ...(pracaId ? { praca_id: pracaId } : {}) }),
    ]);
    const por = new Map<string, DeclaracaoLinha[]>();
    for (const l of linhas) por.set(l.consultant_id, [...(por.get(l.consultant_id) ?? []), l]);
    const out: AlertaDivergencia[] = [];
    for (const [id, ls] of por) {
      const t = this.totais(ls);
      if (!deveAlertarDivergencia(t, cfg)) continue;
      const first = ls[0] as DeclaracaoLinha;
      out.push({
        type: 'declared_divergence',
        consultant_id: id,
        name: first.consultant_name,
        praca_id: first.praca_id,
        declared: t.declared,
        unmatched: t.unmatched,
        divergence_pct: t.divergence_pct,
        message: `${first.consultant_name}: ${textoDivergencia(t)} (últimos 7 dias, até ontem).`,
      });
    }
    return out.sort((a, b) => b.divergence_pct - a.divergence_pct || a.name.localeCompare(b.name));
  }

  // ── anulação manual ─────────────────────────────────────────────────────

  async anular(id: string, dto: AnularDeclaracaoDto, user: AuthUser) {
    const note = dto.note.trim();
    if (note.length < 3)
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'note: informe o motivo (ao menos 3 caracteres).' });
    const existente = await this.prisma.field_declared_signups.findUnique({
      where: { id },
      include: { void: true },
    });
    if (!existente) throw naoEncontrada();
    const jaAnulada = (v: { client_id: string } | null) => {
      if (!v) return false;
      if (v.client_id === dto.client_id) return true; // reenvio do mesmo pedido: devolve a mesma
      throw new ConflictException({ code: 'ALREADY_VOIDED', message: 'Esta declaração já foi anulada.' });
    };
    if (!jaAnulada(existente.void)) {
      try {
        await this.prisma.field_declared_signup_voids.create({
          data: {
            declared_id: id,
            reason: dto.reason as MotivoAnulacao,
            note,
            voided_by: user.id,
            voided_by_name: user.name,
            client_id: dto.client_id,
          },
        });
      } catch (e) {
        if (!violouUnico(e)) throw e;
        // corrida: outro clique anulou no meio
        const v = await this.prisma.field_declared_signup_voids.findUnique({ where: { declared_id: id } });
        if (!jaAnulada(v)) throw e;
      }
    }
    const { linhas } = await this.carregar({ from: existente.declared_day, to: existente.declared_day, consultant_id: existente.consultant_id });
    const linha = linhas.find((l) => l.id === id);
    if (!linha) throw naoEncontrada();
    return linha;
  }
}
