import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { addDays, hourSp, todaySp } from '../../common/time/dates';
import { DIAS_NAO_QUIS } from '../../domain/catalog';
import {
  carimbo,
  estagioDepoisDaVisita,
  faltando,
  marcaLonge,
  resumoVisita,
  ROTULO_CARGO,
} from '../../domain/campo-rules';
import { sabadoDaSemana } from '../../domain/route-rules';
import { CARGOS_V2, codigoVoucher, efeitoNoFunil, faltandoV2, ofereceVoucher, resumoV2 } from '../../domain/visit-rules';
import { COM_LEAD, respostasDe, respostasV2De, visitView, type VisitRow, type VisitView } from './campo-views';
import type { AnswersDto, CheckinDto, PosicaoDto, VagaDaVisitaDto } from './dto/campo.dto';
import { JourneysService } from './journeys.service';
import {
  chaveDaFoto,
  lerFotoOuFalha,
  PHOTO_STORAGE,
  tipoDaImagem,
  type FotoLida,
  type PhotoStorage,
} from './photo-storage';
import { PlacesService } from './places.service';
import { violouUnico } from './prisma-errors';

const naoAchada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Visita não encontrada.' });
const visitaAberta = () =>
  new ConflictException({
    code: 'VISIT_ALREADY_OPEN',
    message: 'Faça o checkout da visita aberta antes de começar outra.',
  });
const autoFechada = () =>
  new ConflictException({
    code: 'VISIT_AUTO_CLOSED',
    message: 'A visita foi fechada automaticamente à meia-noite e não aceita mais checkout.',
  });
const texto = (s: string | null | undefined): string | null => (s == null ? null : s.trim() || null);
const visitaFechada = () => new ConflictException({ code: 'VISIT_CLOSED', message: 'Esta visita já foi encerrada.' });

/** Campos que só existem numa versão do formulário (§21.6): mandar o da outra é erro do cliente. */
const SO_V1 = ['freela_status', 'interest', 'open_vagas', 'vaga_roles', 'needs_followup', 'followup_what', 'followup_date'] as const;
const SO_V2 = ['hires_freelancer', 'voucher_accepted', 'signup_mode', 'final_status', 'final_date', 'final_reason', 'callback_phone'] as const;

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journeys: JourneysService,
    private readonly places: PlacesService,
    @Inject(PHOTO_STORAGE) private readonly fotos: PhotoStorage,
  ) {}

  async checkin(c: CampoConsultant, dto: CheckinDto, foto: Buffer, agora = new Date()): Promise<VisitView> {
    const mesma = await this.prisma.field_visits.findUnique({
      where: { client_id: dto.client_id },
      include: COM_LEAD,
    });
    if (mesma) return this.daMesmaPessoa(mesma, c, agora);

    if (!!dto.lead_id === !!dto.new_place) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Informe lead_id ou new_place (um dos dois).',
      });
    }
    const mime = tipoDaImagem(foto);
    if (!mime)
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'A foto precisa ser JPEG, PNG ou WEBP.',
      });

    const jornada = await this.journeys.abertaOuFalha(c.id);
    const aberta = await this.prisma.field_visits.findFirst({
      where: { consultant_id: c.id, checkout_at: null, auto_closed: false },
      select: { id: true },
    });
    if (aberta) throw visitaAberta();

    const { at, ajustado } = carimbo(dto.at, agora, jornada.started_at);
    const ponto = { lat: dto.lat, lng: dto.lng };
    let leadId: string;
    let marca: { distance_m: number | null; far_from_place: boolean } = {
      distance_m: null,
      far_from_place: false,
    };
    let novoLead: Prisma.leadsUncheckedCreateInput | null = null;

    if (dto.lead_id) {
      const lead = await this.prisma.leads.findFirst({
        where: { id: dto.lead_id, praca_id: c.praca_id },
        select: { id: true, lat: true, lng: true },
      });
      if (!lead)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Estabelecimento não encontrado na sua praça.',
        });
      leadId = lead.id;
      marca = marcaLonge(ponto, lead);
    } else {
      const lugar = dto.new_place!;
      // Sem "é outro" confirmado (check-in feito sem sinal, sem como perguntar),
      // não bloqueia: cria marcando possível duplicado para a equipe.
      const parecidos = dto.confirm_new ? [] : await this.places.similar(c, { name: lugar.name, ...ponto });
      const praca = await this.prisma.pracas.findUnique({
        where: { id: c.praca_id },
        select: { cobertura_cidade: true },
      });
      const dia = todaySp(at);
      leadId = randomUUID();
      novoLead = {
        id: leadId,
        praca_id: c.praca_id,
        name: lugar.name.trim(),
        address: lugar.address?.trim() ?? '',
        city: praca?.cobertura_cidade ?? '',
        origem: 'visita de campo',
        classe: 'alvo',
        stage: 1,
        entered_at: dia,
        stage_since: dia,
        lat: dto.lat,
        lng: dto.lng,
        possible_dup: parecidos.length > 0,
      };
    }

    // Bloco B (§21.5): a parada da rota do dia recebe a visita; fora dela, marca.
    // Fora da janela de trabalho da praça também só marca.
    const [rota, praca] = await Promise.all([
      this.prisma.field_routes.findUnique({
        where: { consultant_id_day: { consultant_id: c.id, day: jornada.day } },
        select: { stops: { where: { removed: false, visit_id: null }, select: { id: true, lead_id: true } } },
      }),
      this.prisma.pracas.findUnique({ where: { id: c.praca_id }, select: { route_start_hour: true, route_end_hour: true } }),
    ]);
    const parada = rota?.stops.find((s) => s.lead_id === leadId) ?? null;
    const foraDaRota = !!rota && !parada;
    const horaLocal = hourSp(at);
    const foraDoHorario = !!praca && (horaLocal < praca.route_start_hour || horaLocal >= praca.route_end_hour);

    // O id da visita existe ANTES da foto: a chave leva o id.
    const visitId = randomUUID();
    const key = chaveDaFoto(c.id, jornada.day, visitId, mime);
    await this.fotos.put(key, foto, mime);

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (novoLead) ops.push(this.prisma.leads.create({ data: novoLead }));
    ops.push(
      this.prisma.field_visits.create({
        data: {
          id: visitId,
          client_id: dto.client_id,
          journey_id: jornada.id,
          consultant_id: c.id,
          lead_id: leadId,
          checkin_at: at,
          checkin_lat: dto.lat,
          checkin_lng: dto.lng,
          checkin_accuracy: dto.accuracy,
          distance_m: marca.distance_m,
          far_from_place: marca.far_from_place,
          photo_key: key,
          photo_bytes: foto.length,
          clock_adjusted: ajustado,
          form_version: 2,
          off_route: foraDaRota,
          off_hours: foraDoHorario,
        },
      }),
    );
    if (parada) {
      // Condicional: se outra visita pegou a parada no meio, esta fica sem (não quebra o check-in).
      ops.push(this.prisma.field_route_stops.updateMany({ where: { id: parada.id, visit_id: null }, data: { visit_id: visitId } }));
    }
    ops.push(
      this.prisma.field_points.create({
        data: {
          journey_id: jornada.id,
          at,
          lat: dto.lat,
          lng: dto.lng,
          accuracy: dto.accuracy,
          kind: 'checkin',
          client_id: randomUUID(),
          clock_adjusted: ajustado,
        },
      }),
    );
    try {
      await this.prisma.$transaction(ops);
    } catch (e) {
      // A foto já está guardada: sem a linha, ela vira lixo — sai junto.
      await this.fotos.remove(key).catch(() => undefined);
      if (!violouUnico(e)) throw e;
      const ganhou = await this.prisma.field_visits.findUnique({
        where: { client_id: dto.client_id },
        include: COM_LEAD,
      });
      if (ganhou) return this.daMesmaPessoa(ganhou, c, agora);
      throw visitaAberta();
    }
    return this.porId(visitId, agora);
  }

  async saveAnswers(
    c: CampoConsultant,
    ref: string,
    dto: AnswersDto,
    agora = new Date(),
  ): Promise<VisitView> {
    const v = await this.daVisita(c.id, ref);
    if (v.checkout_at || v.auto_closed) throw visitaFechada();
    const v2 = v.form_version >= 2;
    const errados = (v2 ? SO_V1 : SO_V2).filter((k) => dto[k] !== undefined);
    if (errados.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Campos de outra versão do formulário: ${errados.join(', ')}.`,
      });
    }
    if (v2 && dto.interlocutor_role && !(CARGOS_V2 as readonly string[]).includes(dto.interlocutor_role)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'interlocutor_role: dono ou gerente.' });
    }
    const data: Prisma.field_visitsUpdateInput = {};
    if (dto.interlocutor_name !== undefined) data.interlocutor_name = texto(dto.interlocutor_name);
    if (dto.interlocutor_role !== undefined) data.interlocutor_role = dto.interlocutor_role;
    if (dto.freela_status !== undefined) data.freela_status = dto.freela_status;
    if (dto.interest !== undefined) data.interest = dto.interest;
    if (dto.open_vagas !== undefined) data.open_vagas = dto.open_vagas;
    if (dto.vaga_roles !== undefined)
      data.vaga_roles = (dto.vaga_roles ?? []).map((s) => s.trim()).filter(Boolean);
    if (dto.freelas_per_week !== undefined) data.freelas_per_week = dto.freelas_per_week;
    if (dto.channels !== undefined) data.channels = (dto.channels ?? []).map((s) => s.trim()).filter(Boolean);
    if (dto.channel_other !== undefined) data.channel_other = texto(dto.channel_other);
    if (dto.needs_followup !== undefined) data.needs_followup = dto.needs_followup;
    if (dto.followup_what !== undefined) data.followup_what = texto(dto.followup_what);
    if (dto.followup_date !== undefined) data.followup_date = dto.followup_date;
    if (dto.notes !== undefined) data.notes = texto(dto.notes);
    if (dto.hires_freelancer !== undefined) data.hires_freelancer = dto.hires_freelancer;
    if (dto.voucher_accepted !== undefined) data.voucher_accepted = dto.voucher_accepted;
    if (dto.signup_mode !== undefined) data.signup_mode = dto.signup_mode;
    if (dto.final_status !== undefined) data.final_status = dto.final_status;
    if (dto.final_date !== undefined) data.final_date = dto.final_date;
    if (dto.final_reason !== undefined) data.final_reason = texto(dto.final_reason);
    if (dto.callback_phone !== undefined) data.callback_phone = texto(dto.callback_phone);
    await this.prisma.field_visits.update({ where: { id: v.id }, data });
    return this.porId(v.id, agora);
  }

  async checkout(c: CampoConsultant, ref: string, dto: PosicaoDto, agora = new Date()): Promise<VisitView> {
    const v = await this.daVisita(c.id, ref);
    // Reenvio da fila (a resposta se perdeu): devolve o que já foi feito.
    if (v.checkout_at) return visitView(v, todaySp(agora));
    if (v.auto_closed) throw autoFechada();
    if (v.form_version >= 2) return this.checkoutV2(c, v, dto, agora);
    const respostas = respostasDe(v);
    // "Hoje" é o dia do carimbo aceito, não o do recebimento: um rascunho
    // sincronizado depois da meia-noite não pode reprovar o retorno marcado
    // para o dia da própria visita.
    const { at, ajustado } = carimbo(dto.at, agora, v.checkin_at);
    const falta = faltando(respostas, todaySp(at));
    if (falta.length > 0) {
      throw new UnprocessableEntityException({
        code: 'ANSWERS_INCOMPLETE',
        message: `Falta responder: ${falta.join(', ')}.`,
      });
    }

    const lead = await this.prisma.leads.findUniqueOrThrow({
      where: { id: v.lead_id },
      select: { id: true, stage: true },
    });
    const estagio = estagioDepoisDaVisita(lead.stage);
    const mudou = estagio !== lead.stage;

    await this.prisma.$transaction(async (tx) => {
      // Condicional: dois checkouts simultâneos gravam UM evento no CRM.
      const r = await tx.field_visits.updateMany({
        where: { id: v.id, checkout_at: null, auto_closed: false },
        data: {
          checkout_at: at,
          checkout_lat: dto.lat,
          checkout_lng: dto.lng,
          ...(ajustado ? { clock_adjusted: true } : {}),
        },
      });
      if (r.count === 0) return;
      await tx.field_points.create({
        data: {
          journey_id: v.journey_id,
          at,
          lat: dto.lat,
          lng: dto.lng,
          accuracy: dto.accuracy,
          kind: 'checkout',
          client_id: randomUUID(),
          clock_adjusted: ajustado,
        },
      });
      await tx.leads.update({
        where: { id: lead.id },
        data: {
          decisor: respostas.interlocutor_name!.trim(),
          decisor_role: ROTULO_CARGO[respostas.interlocutor_role!] ?? '',
          last_contact_at: at,
          ...(mudou ? { stage: estagio, stage_since: todaySp(at) } : {}),
          ...(respostas.needs_followup
            ? { next_step_what: respostas.followup_what!.trim(), next_step_date: respostas.followup_date }
            : {}),
        },
      });
      await tx.lead_events.create({
        data: {
          lead_id: lead.id,
          at,
          author_label: `Consultor: ${c.name}`,
          // `visit` (e não "visita"): é o tipo do catálogo — rótulo "Visita" e conta como contato.
          kind: 'visit',
          text: resumoVisita(respostas),
          stage_to: mudou ? estagio : null,
        },
      });
    });
    // Perdeu a corrida (reenvio/duplo toque): o vencedor já gravou tudo — devolve a visita fechada.
    const atual = await this.porId(v.id, agora);
    if (!atual.checkout_at && atual.auto_closed) throw autoFechada();
    return atual;
  }

  /**
   * Checkout do formulário v2 (§21.6): status final decide o funil. Na mesma
   * transação condicional do v1 — dois checkouts gravam UM evento.
   */
  private async checkoutV2(c: CampoConsultant, v: VisitRow & { consultant_id: string }, dto: PosicaoDto, agora: Date): Promise<VisitView> {
    const respostas = respostasV2De(v);
    const { at, ajustado } = carimbo(dto.at, agora, v.checkin_at);
    const dia = todaySp(at);
    const falta = faltandoV2(respostas, dia, { voucherPedido: !!v.voucher, vagas: v.vagas.length });
    if (falta.length > 0) {
      throw new UnprocessableEntityException({ code: 'ANSWERS_INCOMPLETE', message: `Falta responder: ${falta.join(', ')}.` });
    }
    const lead = await this.prisma.leads.findUniqueOrThrow({
      where: { id: v.lead_id },
      select: { id: true, stage: true, field_consultant_id: true },
    });
    const efeito = efeitoNoFunil(lead.stage, respostas);

    await this.prisma.$transaction(async (tx) => {
      const r = await tx.field_visits.updateMany({
        where: { id: v.id, checkout_at: null, auto_closed: false },
        data: { checkout_at: at, checkout_lat: dto.lat, checkout_lng: dto.lng, ...(ajustado ? { clock_adjusted: true } : {}) },
      });
      if (r.count === 0) return;
      await tx.field_points.create({
        data: {
          journey_id: v.journey_id,
          at,
          lat: dto.lat,
          lng: dto.lng,
          accuracy: dto.accuracy,
          kind: 'checkout',
          client_id: randomUUID(),
          clock_adjusted: ajustado,
        },
      });
      await tx.leads.update({
        where: { id: lead.id },
        data: {
          decisor: respostas.interlocutor_name!.trim(),
          decisor_role: ROTULO_CARGO[respostas.interlocutor_role!] ?? '',
          last_contact_at: at,
          ...(efeito.mudou ? { stage: efeito.stage, stage_since: dia } : {}),
          ...(efeito.next_step ? { next_step_what: efeito.next_step.what, next_step_date: efeito.next_step.date } : {}),
          // "Não quis" volta para a rota em 30 dias (decisão do dono): o reaquecimento acompanha.
          ...(efeito.lost_reason ? { lost_reason: efeito.lost_reason, reheat_at: addDays(dia, DIAS_NAO_QUIS) } : {}),
          // Quem abre o cadastro ganha o cliente (decisão 19): o primeiro "cadastrou" fica.
          ...(respostas.final_status === 'cadastrou' && !lead.field_consultant_id ? { field_consultant_id: c.id } : {}),
        },
      });
      await tx.lead_events.create({
        data: {
          lead_id: lead.id,
          at,
          author_label: `Representante: ${c.name}`,
          kind: 'visit',
          text: resumoV2(respostas, { voucher: v.voucher?.code ?? null, vagas: v.vagas }),
          stage_to: efeito.mudou ? efeito.stage : null,
        },
      });
    });
    const atual = await this.porId(v.id, agora);
    if (!atual.checkout_at && atual.auto_closed) throw autoFechada();
    return atual;
  }

  // ── vagas e voucher da visita (§21.6–21.7) ─────────────────
  async addVaga(c: CampoConsultant, ref: string, dto: VagaDaVisitaDto, agora = new Date()): Promise<VisitView> {
    const mesma = await this.prisma.lead_vagas.findUnique({ where: { client_id: dto.client_id }, select: { visit_id: true } });
    const v = await this.daVisita(c.id, ref);
    if (mesma) {
      if (mesma.visit_id !== v.id) throw new ConflictException({ code: 'CLIENT_ID_IN_USE', message: 'Identificador de envio já usado.' });
      return visitView(v, todaySp(agora));
    }
    if (v.checkout_at || v.auto_closed) throw visitaFechada();
    if (dto.date < todaySp(agora)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'date: a vaga não pode ser no passado.' });
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const vaga = await tx.lead_vagas.create({
          data: { lead_id: v.lead_id, date: dto.date, funcao: dto.funcao, filled: false, source: 'campo', visit_id: v.id, client_id: dto.client_id },
        });
        // Voucher pedido antes da vaga: a primeira vaga é a dele.
        if (v.voucher) await tx.field_vouchers.updateMany({ where: { id: v.voucher.id, vaga_id: null }, data: { vaga_id: vaga.id } });
      });
    } catch (e) {
      if (!violouUnico(e)) throw e;
    }
    return this.porId(v.id, agora);
  }

  async removeVaga(c: CampoConsultant, ref: string, vagaId: string, agora = new Date()): Promise<VisitView> {
    const v = await this.daVisita(c.id, ref);
    if (v.checkout_at || v.auto_closed) throw visitaFechada();
    if (!isUuid(vagaId) || !v.vagas.some((x) => x.id === vagaId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Vaga não encontrada nesta visita.' });
    }
    await this.prisma.lead_vagas.delete({ where: { id: vagaId } });
    return this.porId(v.id, agora);
  }

  async requestVoucher(c: CampoConsultant, ref: string, agora = new Date()): Promise<VisitView> {
    const v = await this.daVisita(c.id, ref);
    if (v.voucher) return visitView(v, todaySp(agora)); // reenvio da fila
    if (v.checkout_at || v.auto_closed) throw visitaFechada();
    if (v.form_version < 2 || !ofereceVoucher(respostasV2De(v))) {
      throw new UnprocessableEntityException({
        code: 'VOUCHER_NOT_ELIGIBLE',
        message: 'O voucher é para quem contrata mais de 5 freelancers por semana.',
      });
    }
    const hoje = todaySp(agora);
    const ativo = await this.prisma.field_vouchers.findFirst({
      where: { lead_id: v.lead_id, status: { in: ['solicitado', 'liberado'] }, valid_until: { gte: hoje } },
      select: { code: true },
    });
    if (ativo) {
      throw new ConflictException({ code: 'VOUCHER_ACTIVE', message: `Este estabelecimento já tem um voucher em aberto (${ativo.code}).` });
    }
    for (let tentativa = 0; ; tentativa++) {
      try {
        await this.prisma.$transaction([
          this.prisma.field_vouchers.create({
            data: {
              code: codigoVoucher(),
              visit_id: v.id,
              lead_id: v.lead_id,
              consultant_id: c.id,
              praca_id: c.praca_id,
              status: 'solicitado',
              valid_until: sabadoDaSemana(hoje),
              vaga_id: v.vagas[0]?.id ?? null,
            },
          }),
          this.prisma.field_visits.update({ where: { id: v.id }, data: { voucher_accepted: true } }),
        ]);
        break;
      } catch (e) {
        if (!violouUnico(e)) throw e;
        // Dois toques ao mesmo tempo: o outro criou o da visita.
        if (await this.prisma.field_vouchers.findUnique({ where: { visit_id: v.id }, select: { id: true } })) break;
        if (tentativa >= 3) throw e; // código repetido quatro vezes seguidas: não é sorte, é bug
      }
    }
    return this.porId(v.id, agora);
  }

  async photo(c: CampoConsultant, ref: string): Promise<FotoLida> {
    const v = await this.daVisita(c.id, ref);
    return lerFotoOuFalha(this.fotos, v.photo_key);
  }

  // ── internos ────────────────────────────────────────────────
  /** `ref` = id do servidor OU `client_id` (a fila offline só conhece o segundo); sempre do próprio consultor. */
  private async daVisita(consultantId: string, ref: string) {
    if (!isUuid(ref)) throw naoAchada();
    const v = await this.prisma.field_visits.findFirst({
      where: { consultant_id: consultantId, OR: [{ id: ref }, { client_id: ref }] },
      include: COM_LEAD,
    });
    if (!v) throw naoAchada();
    return v;
  }

  private async porId(id: string, agora: Date): Promise<VisitView> {
    const v = await this.prisma.field_visits.findUniqueOrThrow({ where: { id }, include: COM_LEAD });
    return visitView(v, todaySp(agora));
  }

  private daMesmaPessoa(v: VisitRow & { consultant_id: string }, c: CampoConsultant, agora: Date): VisitView {
    if (v.consultant_id !== c.id) {
      throw new ConflictException({ code: 'CLIENT_ID_IN_USE', message: 'Identificador de envio já usado.' });
    }
    return visitView(v, todaySp(agora));
  }
}
