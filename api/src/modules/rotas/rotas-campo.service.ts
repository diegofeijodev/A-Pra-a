import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { minutesSp, todaySp } from '../../common/time/dates';
import { caixaEnvolvente, carimbo } from '../../domain/campo-rules';
import { retornoRoteirizavel } from '../../domain/followup-rules';
import { pontoNaArea } from '../../domain/area-rules';
import { ordenarRetornosAncorados, paramsDaConfig, planejar, selecionarEncadeados, type ConfigRota } from '../../domain/rota-rules';
import { lerRetornosPendentes } from '../campo/retornos-query';
import { violouUnico } from '../campo/prisma-errors';
import type { AcaoParadaDto, GerarRotaDto, PosicaoRotaDto, PularParadaDto } from './dto/rotas.dto';
import { ModoCampoService } from './modo-campo.service';
import { RotasConfigService } from './rotas-config.service';
import {
  partidaDoDia,
  recalcularEtas,
  reotimizar,
  SEGURA_LUGAR,
  ehConflitoVersao,
  type LeadParaRota,
} from './rotas-plano';
import { COM_PARADAS, lerSnapshot, novoSnapshot, routeView, type RouteView } from './rotas-views';
import { ROTAS_LIGADAS } from './rotas.tokens';

export interface HojeRotaView {
  enabled: boolean;
  route: RouteView | null;
  /** Sem roteiro hoje: a equipe liberou o botão "Montar meu dia"? */
  can_generate: boolean;
}

/** Teto de retornos que entram sozinhos no roteiro (os mais antigos primeiro). */
const MAX_RETORNOS_NO_ROTEIRO = 10;

const desligado = () => new NotFoundException({ code: 'ROUTES_DISABLED', message: 'O roteiro do dia não está habilitado.' });
const semRoteiro = () => new NotFoundException({ code: 'ROUTE_NOT_FOUND', message: 'Você não tem roteiro para hoje.' });
const paradaNaoAchada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Parada não encontrada.' });
const naoPendente = () => new ConflictException({ code: 'STOP_NOT_PENDING', message: 'Esta parada não está mais pendente.' });
const idEmUso = () => new ConflictException({ code: 'CLIENT_ID_IN_USE', message: 'Identificador de envio já usado.' });
const semCandidatos = () =>
  new UnprocessableEntityException({ code: 'ROUTE_NO_CANDIDATES', message: 'Não há estabelecimentos elegíveis perto de você para montar o dia.' });

/** Roteiro do próprio consultor (`/v1/campo/route/*`, contrato §23.3). */
@Injectable()
export class RotasCampoService {
  private readonly log = new Logger(RotasCampoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: RotasConfigService,
    @Inject(ROTAS_LIGADAS) private readonly ligado: boolean,
    @Optional() private readonly modo?: ModoCampoService,
  ) {}

  /** Parâmetros do modo do chefe para a conta de meta (§31.6); sem a flag, o padrão (todas as visitas são `completo`). */
  private async cfgModo() {
    return this.modo?.ligado ? this.modo.config() : undefined;
  }

  get habilitado(): boolean {
    return this.ligado;
  }

  private exigirLigado() {
    if (!this.ligado) throw desligado();
  }

  // ── leitura ─────────────────────────────────────────────────
  async today(c: CampoConsultant, agora = new Date()): Promise<HojeRotaView> {
    if (!this.ligado) return { enabled: false, route: null, can_generate: false };
    const route = await this.ativaDeHoje(c.id, agora);
    if (route) return { enabled: true, route: routeView(route, agora, false, await this.cfgModo()), can_generate: false };
    return { enabled: true, route: null, can_generate: (await this.configs.config()).consultor_pode_gerar };
  }

  private ativaDeHoje(consultantId: string, agora: Date) {
    return this.prisma.field_routes.findFirst({
      where: { consultant_id: consultantId, day: todaySp(agora), status: 'ativa' },
      include: COM_PARADAS,
    });
  }

  private async viewDe(id: string, agora: Date): Promise<RouteView> {
    const r = await this.prisma.field_routes.findUniqueOrThrow({ where: { id }, include: COM_PARADAS });
    return routeView(r, agora, false, await this.cfgModo());
  }

  // ── montagem ────────────────────────────────────────────────
  /** Botão "Montar meu dia": só com `consultor_pode_gerar`. Idempotente: já existindo, devolve o ativo. */
  async generate(c: CampoConsultant, dto: GerarRotaDto, agora = new Date()): Promise<RouteView> {
    this.exigirLigado();
    const existente = await this.ativaDeHoje(c.id, agora);
    if (existente) return routeView(existente, agora, false, await this.cfgModo());
    const config = await this.configs.config();
    if (!config.consultor_pode_gerar) {
      throw new ForbiddenException({ code: 'ROUTE_GENERATE_NOT_ALLOWED', message: 'A equipe monta o seu roteiro. Peça para ela montar o dia.' });
    }
    const criado = await this.montarAuto(c, dto, 'consultor', config, agora);
    if (!criado) throw semCandidatos();
    return criado;
  }

  /**
   * Chamado no fim do `journeys/start`. NUNCA lança: o início da jornada não pode falhar
   * por causa do roteiro (um 4xx faria a fila offline descartar o `start`).
   */
  async gerarAoIniciar(c: CampoConsultant, pos: { lat: number; lng: number }, agora = new Date()): Promise<void> {
    if (!this.ligado) return;
    try {
      const config = await this.configs.config();
      if (!config.gerar_ao_iniciar) return;
      if (await this.ativaDeHoje(c.id, agora)) return;
      await this.montarAuto(c, pos, 'auto', config, agora);
    } catch (e) {
      this.log.warn(`roteiro automático não gerado para o consultor ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async montarAuto(
    c: CampoConsultant,
    pos: { lat: number; lng: number },
    source: 'auto' | 'consultor',
    config: ConfigRota,
    agora: Date,
    tentativa = 0,
  ): Promise<RouteView | null> {
    const params = paramsDaConfig(config);
    const retornos = await this.retornosVencidos(c, agora);
    const idsRetorno = new Set(retornos.map((l) => l.id));
    const leads = (await this.elegiveis(c.praca_id, config, agora)).filter((l) => !idsRetorno.has(l.id));
    const sorteados = selecionarEncadeados(
      pos,
      leads.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng })),
      Math.max(Math.ceil(config.meta_diaria * config.pool_fator) - retornos.length, 0),
    );
    // Retornos vencidos vão ancorados no começo da ordem (§25.6): só no cálculo, não ficam gravados como fixos.
    // Entre si, os retornos seguem a caminhada (mais próximo primeiro), não a ordem das datas.
    // Com hora marcada para hoje vêm primeiro, por hora (§30.3); o resto, pela caminhada.
    const ancorados = ordenarRetornosAncorados(pos, retornos.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, hora: l.hora }))).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, fixa: true }));
    const escolhidos = [...ancorados, ...sorteados];
    if (escolhidos.length === 0) return null;
    const dia = todaySp(agora);
    const plano = planejar({ inicio: pos, partidaMin: partidaDoDia(dia, agora, params), pontos: escolhidos, params });
    const porId = new Map([...leads, ...retornos].map((l) => [l.id, l]));
    const candidatos = await this.candidatosDe(escolhidos.map((p) => p.id));
    const id = randomUUID();
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.field_routes.create({
            data: {
              id,
              consultant_id: c.id,
              praca_id: c.praca_id,
              day: dia,
              source,
              start_lat: pos.lat,
              start_lng: pos.lng,
              params_snapshot: novoSnapshot(null, config, plano.excedentes.length, 1, source, null, agora) as unknown as Prisma.InputJsonValue,
            },
          });
          // `version` já nasce em 1; as paradas entram pela mesma gravação, sem subir a versão.
          await tx.field_route_stops.createMany({
            data: plano.paradas.map((p) => {
              const l = porId.get(p.id)!;
              return {
                route_id: id,
                lead_id: l.id,
                day: dia,
                seq: p.seq,
                kind: p.kind,
                status: 'pendente',
                eta_min: p.eta_min,
                distance_m: p.distancia_m,
                planned_minutes: config.minutos_por_visita,
                candidate_id: candidatos.get(l.id) ?? null,
                name_snap: l.name,
                address_snap: l.address,
                phone_snap: l.phone,
                lat_snap: l.lat,
                lng_snap: l.lng,
              };
            }),
          });
        },
        { timeout: 15_000 },
      );
    } catch (e) {
      if (!violouUnico(e)) throw e;
      // Corrida: outra chamada criou o roteiro do dia (devolve) ou outro consultor levou um lugar (refaz sem ele, uma vez).
      const ganhou = await this.ativaDeHoje(c.id, agora);
      if (ganhou) return routeView(ganhou, agora, false, await this.cfgModo());
      if (tentativa === 0) return this.montarAuto(c, pos, source, config, agora, 1);
      throw new ConflictException({ code: 'ROUTE_CONFLICT', message: 'Não foi possível montar o roteiro agora. Tente de novo.' });
    }
    return this.viewDe(id, agora);
  }

  /**
   * Retornos vencidos das visitas do próprio consultor, prontos para o roteiro (contrato §25.6).
   * Item secundário: qualquer falha aqui vira aviso no log e o roteiro sai sem eles.
   */
  private async retornosVencidos(c: CampoConsultant, agora: Date): Promise<(LeadParaRota & { hora: string | null })[]> {
    try {
      if (!(await this.configs.alertas()).retornos_no_roteiro) return [];
      const dia = todaySp(agora);
      const lidos = await lerRetornosPendentes(this.prisma, { hoje: dia, consultantId: c.id });
      const bons = lidos.itens
        .filter((r) => r.praca_id === c.praca_id && retornoRoteirizavel(r, r.far_from_place))
        .slice(0, MAX_RETORNOS_NO_ROTEIRO);
      if (bons.length === 0) return [];
      const ids = bons.map((r) => r.lead_id);
      const chaves = [...new Set(bons.map((r) => r.phone_key).filter(Boolean))];
      const [bloqueados, ocupados] = await Promise.all([
        chaves.length ? this.prisma.blocklist.findMany({ where: { phone_key: { in: chaves } }, select: { phone_key: true } }) : [],
        this.prisma.field_route_stops.findMany({ where: { day: dia, lead_id: { in: ids }, status: { in: [...SEGURA_LUGAR] } }, select: { lead_id: true } }),
      ]);
      const fora = new Set(ocupados.map((o) => o.lead_id));
      const chavesFora = new Set(bloqueados.map((b) => b.phone_key));
      return bons
        .filter((r) => !fora.has(r.lead_id) && !(r.phone_key && chavesFora.has(r.phone_key)))
        .map((r) => ({
          id: r.lead_id,
          name: r.lead_name,
          address: r.address,
          phone: r.phone,
          lat: r.lat!,
          lng: r.lng!,
          // Só a hora combinada para HOJE ordena (a de um retorno atrasado já passou).
          hora: r.due === 'hoje' ? r.followup_time : null,
        }));
    } catch (e) {
      this.log.warn(`retornos não entraram no roteiro do consultor ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  /** Leads elegíveis para a seleção automática (contrato §23.3 e spec §6.1.1). */
  private async elegiveis(pracaId: string, config: ConfigRota, agora: Date): Promise<LeadParaRota[]> {
    const areas = await this.prisma.field_areas.findMany({ where: { praca_id: pracaId, active: true } });
    if (areas.length === 0) return [];
    const caixas = areas.map((a) => {
      const b = caixaEnvolvente(a, a.radius_m);
      return { lat: { gte: b.latMin, lte: b.latMax }, lng: { gte: b.lngMin, lte: b.lngMax } };
    });
    const linhas = await this.prisma.leads.findMany({
      where: {
        praca_id: pracaId,
        archived: false,
        is_test: false,
        stage: { lte: config.estagio_maximo_rota },
        location_precision: { in: ['point', 'address'] },
        OR: caixas,
      },
      select: { id: true, name: true, address: true, phone: true, phone_key: true, lat: true, lng: true },
      orderBy: { id: 'asc' },
      take: 3000,
    });
    let lista = linhas.filter((l) => l.lat != null && l.lng != null && areas.some((a) => pontoNaArea({ lat: l.lat!, lng: l.lng! }, a)));
    if (lista.length === 0) return [];
    const ids = lista.map((l) => l.id);
    const chaves = [...new Set(lista.map((l) => l.phone_key).filter(Boolean))];
    const [bloqueados, recentes, ocupados] = await Promise.all([
      chaves.length ? this.prisma.blocklist.findMany({ where: { phone_key: { in: chaves } }, select: { phone_key: true } }) : [],
      config.dias_sem_revisitar > 0
        ? this.prisma.field_visits.findMany({
            // Fechado (§30.1) não conta: o lugar pode voltar a ser sorteado.
            where: { lead_id: { in: ids }, outcome: { not: 'fechado' }, checkin_at: { gte: new Date(agora.getTime() - config.dias_sem_revisitar * 86_400_000) } },
            select: { lead_id: true },
          })
        : [],
      this.prisma.field_route_stops.findMany({
        where: { day: todaySp(agora), lead_id: { in: ids }, status: { in: [...SEGURA_LUGAR] } },
        select: { lead_id: true },
      }),
    ]);
    const fora = new Set<string>([...recentes.map((v) => v.lead_id), ...ocupados.map((s) => s.lead_id)]);
    const chavesFora = new Set(bloqueados.map((b) => b.phone_key));
    lista = lista.filter((l) => !fora.has(l.id) && !(l.phone_key && chavesFora.has(l.phone_key)));
    return lista.map((l) => ({ id: l.id, name: l.name, address: l.address, phone: l.phone, lat: l.lat!, lng: l.lng! }));
  }

  private async candidatosDe(leadIds: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.place_candidates.findMany({
      where: { lead_id: { in: leadIds } },
      select: { id: true, lead_id: true },
      orderBy: { created_at: 'asc' },
    });
    const m = new Map<string, string>();
    for (const r of rows) if (r.lead_id && !m.has(r.lead_id)) m.set(r.lead_id, r.id);
    return m;
  }

  // ── refazer rota ────────────────────────────────────────────
  async reoptimize(c: CampoConsultant, dto: PosicaoRotaDto, agora = new Date()): Promise<RouteView> {
    this.exigirLigado();
    const dup = await this.reenvio(c.id, dto.client_id);
    if (dup) return this.viewDe(dup.route_id, agora);
    const rota = await this.ativaDeHoje(c.id, agora);
    if (!rota) throw semRoteiro();

    for (let tentativa = 0; ; tentativa += 1) {
      const atual = tentativa === 0 ? rota : await this.ativaDeHoje(c.id, agora);
      if (!atual) throw semRoteiro();
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.field_route_events.create({
              data: {
                route_id: atual.id,
                consultant_id: c.id,
                client_id: dto.client_id,
                kind: 'reoptimize',
                at: carimbo(dto.at, agora, null).at,
              },
            });
            await reotimizar(tx, atual, { lat: dto.lat, lng: dto.lng }, agora, 'refazer rota', null);
          },
          { timeout: 15_000 },
        );
        return this.viewDe(atual.id, agora);
      } catch (e) {
        if (ehConflitoVersao(e)) {
          if (tentativa === 0) continue;
          throw e;
        }
        if (violouUnico(e)) {
          const dup2 = await this.reenvio(c.id, dto.client_id);
          if (dup2) return this.viewDe(dup2.route_id, agora);
        }
        throw e;
      }
    }
  }

  // ── pular, adiar, desfazer ──────────────────────────────────
  skip(c: CampoConsultant, stopId: string, dto: PularParadaDto, agora = new Date()): Promise<RouteView> {
    return this.agirNaParada(c, stopId, dto.client_id, dto.at, agora, 'skip', { reason: dto.reason, note: dto.note?.trim() || null });
  }

  defer(c: CampoConsultant, stopId: string, dto: AcaoParadaDto, agora = new Date()): Promise<RouteView> {
    return this.agirNaParada(c, stopId, dto.client_id, dto.at, agora, 'defer', {});
  }

  undo(c: CampoConsultant, stopId: string, dto: AcaoParadaDto, agora = new Date()): Promise<RouteView> {
    return this.agirNaParada(c, stopId, dto.client_id, dto.at, agora, 'undo', {});
  }

  private async agirNaParada(
    c: CampoConsultant,
    stopId: string,
    clientId: string,
    at: string | undefined,
    agora: Date,
    kind: 'skip' | 'defer' | 'undo',
    extra: { reason?: string; note?: string | null },
  ): Promise<RouteView> {
    this.exigirLigado();
    if (!isUuid(stopId)) throw paradaNaoAchada();
    // Sempre do próprio consultor: parada de outro é 404, nunca 403.
    const parada = await this.prisma.field_route_stops.findFirst({
      where: { id: stopId, route: { consultant_id: c.id, status: 'ativa' } },
      select: { id: true, route_id: true, status: true },
    });
    if (!parada) throw paradaNaoAchada();
    const dup = await this.reenvio(c.id, clientId);
    if (dup) return this.viewDe(dup.route_id, agora);

    // Desfazer o que já voltou ao roteiro (outra via refez a rota, ou o reenvio chegou depois): nada a fazer.
    if (kind === 'undo' && parada.status === 'pendente') return this.viewDe(parada.route_id, agora);

    const origem = kind === 'undo' ? ['pulada', 'adiada'] : kind === 'skip' ? ['pendente', 'adiada'] : ['pendente'];
    if (!origem.includes(parada.status)) {
      throw kind === 'undo' && (parada.status === 'visitada' || parada.status === 'descartada')
        ? new ConflictException({ code: 'STOP_NOT_UNDOABLE', message: 'Esta parada não pode mais ser desfeita.' })
        : naoPendente();
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const rota = await tx.field_routes.findUniqueOrThrow({ where: { id: parada.route_id }, include: { stops: true } });
          const snap = lerSnapshot(rota.params_snapshot);
          await tx.field_route_events.create({
            data: {
              route_id: rota.id,
              stop_id: parada.id,
              consultant_id: c.id,
              client_id: clientId,
              kind,
              reason: extra.reason ?? null,
              note: extra.note ?? null,
              at: carimbo(at, agora, null).at,
            },
          });
          const alvo =
            kind === 'skip'
              ? { status: 'pulada', skip_reason: extra.reason, skip_note: extra.note ?? null, deferred_to: null, eta_min: null }
              : kind === 'defer'
                ? {
                    status: 'adiada',
                    // Pela hora REAL da ação (`at`, regra de carimbo do §20), não a do recebimento: a fila offline pode enviar tarde.
                    deferred_to: minutesSp(carimbo(at, agora, null).at) < paramsDaConfig(snap.config).almocoFim ? 'tarde' : 'amanha',
                    eta_min: null,
                  }
                : { status: 'pendente', skip_reason: null, skip_note: null, deferred_to: null };
          const r = await tx.field_route_stops.updateMany({ where: { id: parada.id, status: { in: origem } }, data: alvo });
          if (r.count === 0) throw naoPendente();
          await tx.field_routes.update({ where: { id: rota.id }, data: { version: { increment: 1 } } });
          const stops = await tx.field_route_stops.findMany({ where: { route_id: rota.id } });
          await recalcularEtas(tx, rota, stops, agora);
        },
        { timeout: 15_000 },
      );
    } catch (e) {
      if (violouUnico(e)) {
        const dup2 = await this.reenvio(c.id, clientId);
        if (dup2) return this.viewDe(dup2.route_id, agora);
        if (kind === 'undo') {
          throw new ConflictException({ code: 'STOP_TAKEN', message: 'Outro consultor já ficou com este estabelecimento hoje.' });
        }
      }
      throw e;
    }
    return this.viewDe(parada.route_id, agora);
  }

  /** Reenvio da fila: o `client_id` já foi aplicado por este consultor (de outro → conflito). */
  private async reenvio(consultantId: string, clientId: string) {
    const ev = await this.prisma.field_route_events.findUnique({ where: { client_id: clientId }, select: { route_id: true, consultant_id: true } });
    if (!ev) return null;
    if (ev.consultant_id !== consultantId) throw idEmUso();
    return ev;
  }
}
