/**
 * Resumo e nota do dia (contrato §33.5). Só leitura, calculado na hora ("calculado às HH:MM": uma confirmação tardia muda
 * a nota). A conta sai do domínio (`resumo-dia-rules`); os cadastros, da mesma `cadastrosDoDia` do painel.
 */
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CampoConsultant } from '../../../common/auth/campo-consultant';
import { PrismaService } from '../../../common/database/prisma.service';
import { isUuid } from '../../../common/ids/uuid';
import { addDays, isDateString, todaySp } from '../../../common/time/dates';
import { CONFIG_MODO_DESLIGADO, contaNaMeta } from '../../../domain/modo-campo-rules';
import { resumoDia } from '../../../domain/resumo-dia-rules';
import { ModoCampoService } from '../../rotas/modo-campo.service';
import { RotasConfigService } from '../../rotas/rotas-config.service';
import { ROTAS_LIGADAS } from '../../rotas/rotas.tokens';
import { SIGNUP_SYNC_OPCOES, type OpcoesSignupSync } from '../signup-sync.tokens';
import { CadastrosDoDiaService } from './cadastros-do-dia.service';

/** O consultor lê até 35 dias para trás (arquitetura item 2). */
export const DIAS_RESUMO_CONSULTOR = 35;

const invalido = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });

@Injectable()
export class ResumoDiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: RotasConfigService,
    private readonly cadastros: CadastrosDoDiaService,
    @Optional() @Inject(ROTAS_LIGADAS) private readonly rotasLigadas: boolean = false,
    @Optional() private readonly modo?: ModoCampoService,
    @Optional() @Inject(SIGNUP_SYNC_OPCOES) private readonly sync?: OpcoesSignupSync,
  ) {}

  /** Só o PRÓPRIO consultor (id do token); até 35 dias para trás, nunca no futuro. */
  async doConsultor(c: CampoConsultant, day: string | undefined, agora = new Date()) {
    const hoje = todaySp(agora);
    const dia = day ?? hoje;
    if (!isDateString(dia)) throw invalido('day: deve ser uma data válida no formato YYYY-MM-DD');
    if (dia > hoje) throw invalido('day: não pode ser no futuro.');
    if (dia < addDays(hoje, -DIAS_RESUMO_CONSULTOR)) throw invalido(`day: o resumo mostra no máximo os últimos ${DIAS_RESUMO_CONSULTOR} dias.`);
    return this.calcular({ id: c.id, name: c.name }, dia, agora);
  }

  /** Equipe: qualquer consultor; dia válido e não futuro. */
  async daEquipe(id: string, day: string, agora = new Date()) {
    const naoAchado = new NotFoundException({ code: 'NOT_FOUND', message: 'Consultor não encontrado.' });
    if (!isUuid(id)) throw naoAchado;
    const c = await this.prisma.field_consultants.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!c) throw naoAchado;
    if (!isDateString(day)) throw invalido('day: deve ser uma data válida no formato YYYY-MM-DD');
    if (day > todaySp(agora)) throw invalido('day: não pode ser no futuro.');
    return this.calcular(c, day, agora);
  }

  private async calcular(c: { id: string; name: string }, dia: string, agora: Date) {
    const hoje = todaySp(agora);
    const [jornadas, visitas, rota, cfgRota, cfg, cad, modoCfg] = await Promise.all([
      this.prisma.field_journeys.findMany({ where: { consultant_id: c.id, day: dia }, select: { started_at: true, ended_at: true }, orderBy: { started_at: 'asc' } }),
      this.prisma.field_visits.findMany({
        where: { consultant_id: c.id, journey: { day: dia } },
        select: { id: true, checkin_at: true, checkout_at: true, outcome: true, flow: true },
      }),
      this.rotasLigadas
        ? this.prisma.field_routes.findFirst({ where: { consultant_id: c.id, day: dia, status: 'ativa' }, select: { stops: { select: { kind: true, status: true, visit_id: true } } } })
        : Promise.resolve(null),
      this.configs.config(),
      this.configs.resumoDia(),
      this.cadastros.periodo([c.id], dia, dia),
      this.modo?.ligado ? this.modo.config() : Promise.resolve(CONFIG_MODO_DESLIGADO),
    ]);
    const concluidas = visitas.filter((v) => v.checkout_at && contaNaMeta(v, modoCfg));
    const idsConcluidas = new Set(concluidas.map((v) => v.id));
    const planejadas = rota ? rota.stops.filter((s) => s.kind === 'planejada' && s.status !== 'descartada') : [];
    const r = resumoDia({
      agora,
      diaAberto: dia === hoje && (jornadas.length === 0 || jornadas.some((j) => j.ended_at === null)),
      jornadas,
      intervaloMin: null,
      rota: rota ? { planejadas: planejadas.length, visitadas: planejadas.filter((s) => s.status === 'visitada' && !!s.visit_id && idsConcluidas.has(s.visit_id)).length } : null,
      meta: cfgRota.meta_diaria,
      visitasConcluidas: concluidas.length,
      duracoesMin: concluidas.map((v) => Math.max(0, Math.round((v.checkout_at!.getTime() - v.checkin_at.getTime()) / 60_000))),
      cadastros: cad.totais.get(c.id) ?? 0,
      fonte: cad.fontePorDia.get(dia) ?? 'freela_confirmed',
      syncLigado: this.sync?.ligado ?? false,
      cuponsLigados: false,
      cfg,
    });
    return { day: dia, consultant_id: c.id, consultant_name: c.name, calculated_at: agora.toISOString(), ...r };
  }
}
