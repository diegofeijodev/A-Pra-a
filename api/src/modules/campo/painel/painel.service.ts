/**
 * Painel do gestor (contrato §33.4). Só leitura, número fixo de consultas (sem N+1); a conta de cada cartão sai do
 * domínio (`painel-rules`). Dia sempre de Brasília (`field_journeys.day`, `todaySp`).
 */
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { todaySp } from '../../../common/time/dates';
import { validarPeriodo } from '../../../domain/heat-grid';
import { montarPainel } from '../../../domain/painel-rules';
import { RotasConfigService } from '../../rotas/rotas-config.service';
import { SIGNUP_SYNC_OPCOES, type OpcoesSignupSync } from '../signup-sync.tokens';
import { CadastrosDoDiaService } from './cadastros-do-dia.service';
import type { PainelQueryDto } from './painel.dto';

const PRECISAO_EXATA = ['point', 'address'];

@Injectable()
export class PainelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: RotasConfigService,
    private readonly cadastros: CadastrosDoDiaService,
    @Optional() @Inject(SIGNUP_SYNC_OPCOES) private readonly sync?: OpcoesSignupSync,
  ) {}

  async painel(q: PainelQueryDto, agora = new Date()) {
    const hoje = todaySp(agora);
    const per = validarPeriodo({ from: q.from, to: q.to }, hoje);
    if (!per.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: per.erro });
    const { from, to } = per;
    if (q.praca_id) {
      const praca = await this.prisma.pracas.findUnique({ where: { id: q.praca_id }, select: { id: true } });
      if (!praca) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    }
    const daPraca = q.praca_id ? { praca_id: q.praca_id } : {};
    const consultores = await this.prisma.field_consultants.findMany({
      where: daPraca,
      select: { id: true, name: true, praca_id: true, active: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const ids = consultores.map((c) => c.id);
    const leadsBase = { archived: false, is_test: false, ...daPraca };

    const [visitas, paradas, cad, pracas, exatos, todos, cfg] = await Promise.all([
      this.prisma.field_visits.findMany({
        where: { consultant_id: { in: ids }, checkout_at: { not: null }, journey: { day: { gte: from, lte: to } } },
        select: {
          id: true,
          consultant_id: true,
          checkin_at: true,
          checkout_at: true,
          outcome: true,
          result: true,
          freela_status: true,
          needs_followup: true,
          refusal_reason: true,
          journey: { select: { day: true } },
        },
      }),
      this.prisma.field_route_stops.findMany({
        where: { day: { gte: from, lte: to }, route: { status: 'ativa', consultant_id: { in: ids } } },
        select: { kind: true, status: true, visit_id: true },
      }),
      this.cadastros.periodo(ids, from, to),
      this.prisma.pracas.findMany({ where: q.praca_id ? { id: q.praca_id } : {}, select: { start_date: true } }),
      this.prisma.leads.count({ where: { ...leadsBase, lat: { not: null }, lng: { not: null }, location_precision: { in: PRECISAO_EXATA } } }),
      this.prisma.leads.count({ where: leadsBase }),
      this.configs.painel(),
    ]);
    const naRota = new Set(paradas.map((p) => p.visit_id).filter((id): id is string => !!id));
    const planejadas = paradas.filter((p) => p.kind === 'planejada' && p.status !== 'descartada');
    const calculado = montarPainel({
      consultores,
      visitas: visitas.map((v) => ({
        id: v.id,
        consultant_id: v.consultant_id,
        day: v.journey.day,
        checkin_at: v.checkin_at,
        checkout_at: v.checkout_at!,
        outcome: v.outcome,
        result: v.result,
        freela_status: v.freela_status,
        needs_followup: v.needs_followup,
        refusal_reason: v.refusal_reason,
        na_rota: naRota.has(v.id),
      })),
      paradas: { planejadas: planejadas.length, visitadas: planejadas.filter((p) => p.status === 'visitada').length },
      cadastros: cad.totais,
      fonteCadastros: cad.fonte,
      syncLigado: this.sync?.ligado ?? false,
      pracasAbertas: pracas.filter((p) => p.start_date <= hoje).length,
      leadsMapeados: exatos,
      leadsSemLocalizacao: Math.max(0, todos - exatos),
      cfg,
    });
    return {
      from,
      to,
      praca_id: q.praca_id ?? null,
      today: hoje,
      generated_at: agora.toISOString(),
      ...calculado,
      signup_sync_enabled: this.sync?.ligado ?? false,
    };
  }
}
