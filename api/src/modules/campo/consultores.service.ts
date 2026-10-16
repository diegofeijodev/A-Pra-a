import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { digits } from '../../common/phone/phone';
import { isDateString, todaySp } from '../../common/time/dates';
import {
  cpfValido,
  gerarSenhaProvisoria,
  normalizarPix,
  pixValido,
  situacaoHoje,
  type SituacaoHoje,
} from '../../domain/campo-rules';
import { idade } from '../../domain/route-rules';
import { SELECAO_RASTRO, stopTimings, type StopTiming } from './painel.service';
import { CampoFreelaService } from './campo-freela.service';
import { lerCanais } from './campo-canais';
import { lerCnaes } from './campo-cnaes';
import { signupUrl } from './campo-links';
import { COM_PRACA } from './campo-prisma';
import {
  COM_LEAD,
  journeyView,
  pointView,
  visitView,
  type JourneyView,
  type PointView,
  type VisitView,
} from './campo-views';
import {
  AreaFieldsDto,
  ChannelsDto,
  CnaesDto,
  CreateConsultorDto,
  UpdateConsultorDto,
} from './dto/consultores.dto';
import { lerFotoOuFalha, PHOTO_STORAGE, type FotoLida, type PhotoStorage } from './photo-storage';
import { colunaUnicaDoConsultor, violouUnico } from './prisma-errors';

export interface ConsultorView {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  praca_id: string;
  praca_name: string;
  pix_key_type: string;
  pix_key: string;
  active: boolean;
  must_change_password: boolean;
  freela_consultant_id: string | null;
  freela_code: string | null;
  freela_sync_error: string | null;
  freela_synced_at: string | null;
  signup_url: string | null;
  birth_date: string | null;
  age: number | null;
  area_lat: number | null;
  area_lng: number | null;
  area_radius_km: number | null;
  area_bairros: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConsultorListItem extends ConsultorView {
  today: { status: SituacaoHoje; visits: number; cadastros: number; last_point_at: string | null };
}

export type ConsultorRow = Prisma.field_consultantsGetPayload<{
  include: { praca: { select: { name: true } } };
}>;

/** Projeção da equipe — nunca `password_hash` nem `token_version`. */
export function toConsultorView(c: ConsultorRow, hoje = todaySp()): ConsultorView {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    cpf: c.cpf,
    praca_id: c.praca_id,
    praca_name: c.praca.name,
    pix_key_type: c.pix_key_type,
    pix_key: c.pix_key,
    active: c.active,
    must_change_password: c.must_change_password,
    freela_consultant_id: c.freela_consultant_id,
    freela_code: c.freela_code,
    freela_sync_error: c.freela_sync_error,
    freela_synced_at: c.freela_synced_at?.toISOString() ?? null,
    signup_url: signupUrl(c.freela_code),
    birth_date: c.birth_date,
    age: c.birth_date ? idade(c.birth_date, hoje) : null,
    area_lat: c.area_lat,
    area_lng: c.area_lng,
    area_radius_km: c.area_radius_km,
    area_bairros: c.area_bairros,
    created_by: c.created_by,
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  };
}

/** O que `areaOuFalha` grava — serve à criação e à edição. */
interface CamposDaArea {
  birth_date?: string | null;
  area_lat?: number | null;
  area_lng?: number | null;
  area_radius_km?: number | null;
  area_bairros?: string[];
}

const naoAchado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Consultor não encontrado.' });

const emailEmUso = () =>
  new ConflictException({ code: 'EMAIL_IN_USE', message: 'Já existe um consultor com este e-mail.' });
const cpfEmUso = () =>
  new ConflictException({ code: 'CPF_IN_USE', message: 'Já existe um consultor com este CPF.' });

@Injectable()
export class ConsultoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freela: CampoFreelaService,
    @Inject(PHOTO_STORAGE) private readonly fotos: PhotoStorage,
  ) {}

  async list(agora = new Date()): Promise<ConsultorListItem[]> {
    const hoje = todaySp(agora);
    const [consultores, jornadas, visitas] = await Promise.all([
      this.prisma.field_consultants.findMany({
        include: COM_PRACA,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.field_journeys.findMany({
        where: { day: hoje },
        select: { id: true, consultant_id: true, ended_at: true },
      }),
      this.prisma.field_visits.findMany({
        where: { journey: { day: hoje } },
        select: { consultant_id: true, freela_status: true, final_status: true },
      }),
    ]);
    const ultimos = jornadas.length
      ? await this.prisma.field_points.groupBy({
          by: ['journey_id'],
          where: { journey_id: { in: jornadas.map((j) => j.id) } },
          _max: { at: true },
        })
      : [];
    const ultimoPorJornada = new Map(ultimos.map((u) => [u.journey_id, u._max.at]));

    return consultores.map((c) => {
      const js = jornadas.filter((j) => j.consultant_id === c.id);
      const vs = visitas.filter((v) => v.consultant_id === c.id);
      const pontos = js.map((j) => ultimoPorJornada.get(j.id)).filter((d): d is Date => d instanceof Date);
      const ultimo = pontos.length ? new Date(Math.max(...pontos.map((d) => d.getTime()))) : null;
      return {
        ...toConsultorView(c),
        today: {
          status: situacaoHoje(js),
          visits: vs.length,
          // v1: "cadastrou agora pelo QR"; v2 (§21.6): status final "cadastrou".
          cadastros: vs.filter((v) => v.freela_status === 'cadastrou_qr' || v.final_status === 'cadastrou').length,
          last_point_at: ultimo?.toISOString() ?? null,
        },
      };
    });
  }

  async get(id: string): Promise<ConsultorView> {
    return toConsultorView(await this.findOrFail(id));
  }

  async create(
    dto: CreateConsultorDto,
    admin: AuthUser,
  ): Promise<{ consultant: ConsultorView; temp_password: string }> {
    const email = dto.email.trim().toLowerCase();
    const cpf = this.cpfOuFalha(dto.cpf);
    const phone = this.telefoneOuFalha(dto.phone);
    this.pixOuFalha(dto.pix_key_type, dto.pix_key);
    await this.pracaOrFail(dto.praca_id);
    await this.emailLivre(email);
    await this.cpfLivre(cpf);
    const area = this.areaOuFalha(dto, null);

    const temp = gerarSenhaProvisoria();
    let criado: { id: string };
    try {
      criado = await this.prisma.field_consultants.create({
        data: {
          name: dto.name.trim(),
          email,
          phone,
          cpf,
          praca_id: dto.praca_id,
          pix_key_type: dto.pix_key_type,
          pix_key: normalizarPix(dto.pix_key_type, dto.pix_key),
          password_hash: await bcrypt.hash(temp, 10),
          created_by: admin.id,
          ...area,
        },
      });
    } catch (e) {
      throw this.conflitoUnico(e);
    }
    await this.freela.sync(criado.id);
    return { consultant: await this.get(criado.id), temp_password: temp };
  }

  async update(id: string, dto: UpdateConsultorDto): Promise<ConsultorView> {
    const atual = await this.findOrFail(id);
    const data: Prisma.field_consultantsUncheckedUpdateInput = { ...this.areaOuFalha(dto, atual) };
    let sincronizar = false;

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = this.telefoneOuFalha(dto.phone);
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== atual.email) {
        await this.emailLivre(email);
        data.email = email;
        // Sem código ainda (talvez pelo e-mail duplicado no Freela): tenta de novo com o e-mail novo.
        if (!atual.freela_consultant_id) {
          data.freela_sync_error = null;
          sincronizar = true;
        }
      }
    }
    if (dto.cpf !== undefined) {
      const cpf = this.cpfOuFalha(dto.cpf);
      if (cpf !== atual.cpf) {
        await this.cpfLivre(cpf);
        data.cpf = cpf;
      }
    }
    if (dto.praca_id !== undefined) {
      await this.pracaOrFail(dto.praca_id);
      data.praca_id = dto.praca_id;
    }
    if (dto.pix_key !== undefined || dto.pix_key_type !== undefined) {
      const tipo = dto.pix_key_type ?? atual.pix_key_type;
      const chave = dto.pix_key ?? atual.pix_key;
      this.pixOuFalha(tipo, chave);
      data.pix_key_type = tipo;
      data.pix_key = normalizarPix(tipo, chave);
    }
    if (dto.active !== undefined && dto.active !== atual.active) {
      data.active = dto.active;
      // Desativar derruba a sessão aberta na hora (o guard compara `tv`).
      if (!dto.active) data.token_version = { increment: 1 };
      sincronizar = true;
    }

    try {
      await this.prisma.field_consultants.update({ where: { id }, data });
    } catch (e) {
      throw this.conflitoUnico(e);
    }
    if (sincronizar) await this.freela.sync(id);
    return this.get(id);
  }

  async resetPassword(id: string): Promise<{ temp_password: string }> {
    await this.findOrFail(id);
    const temp = gerarSenhaProvisoria();
    await this.prisma.field_consultants.update({
      where: { id },
      data: {
        password_hash: await bcrypt.hash(temp, 10),
        must_change_password: true,
        token_version: { increment: 1 },
      },
    });
    return { temp_password: temp };
  }

  async freelaSync(id: string): Promise<ConsultorView> {
    await this.findOrFail(id);
    await this.freela.sync(id);
    return this.get(id);
  }

  /** Apaga de vez (limpeza de teste): cascata leva jornadas, pontos e visitas; as fotos saem à mão. */
  async remove(id: string): Promise<{ ok: true }> {
    const c = await this.findOrFail(id);
    const fotos = await this.prisma.field_visits.findMany({
      where: { consultant_id: id },
      select: { photo_key: true },
    });
    await this.freela.desativarAntesDeApagar(c);
    await this.prisma.field_consultants.delete({ where: { id } });
    for (const f of fotos) await this.fotos.remove(f.photo_key).catch(() => undefined);
    return { ok: true };
  }

  /** Linha do tempo de um dia: jornadas (com os pontos em ordem) e visitas. */
  async day(
    id: string,
    day: string,
  ): Promise<{
    day: string;
    journeys: (JourneyView & { points: PointView[] })[];
    visits: VisitView[];
    stops: StopTiming[];
    route: { id: string; goal: number; total: number; visitados: number } | null;
  }> {
    await this.findOrFail(id);
    if (!isDateString(day)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'day: deve ser uma data válida no formato YYYY-MM-DD',
      });
    }
    const [jornadas, visitas, rastro, rota] = await Promise.all([
      this.prisma.field_journeys.findMany({
        where: { consultant_id: id, day },
        orderBy: { started_at: 'asc' },
        include: { points: { orderBy: { at: 'asc' } } },
      }),
      this.prisma.field_visits.findMany({
        where: { consultant_id: id, journey: { day } },
        include: COM_LEAD,
        orderBy: { checkin_at: 'asc' },
      }),
      this.prisma.field_visits.findMany({ where: { consultant_id: id, journey: { day } }, select: SELECAO_RASTRO }),
      this.prisma.field_routes.findUnique({
        where: { consultant_id_day: { consultant_id: id, day } },
        select: { id: true, goal: true, stops: { where: { removed: false }, select: { visit_id: true } } },
      }),
    ]);
    const hoje = todaySp();
    return {
      day,
      journeys: jornadas.map((j) => ({ ...journeyView(j), points: j.points.map(pointView) })),
      visits: visitas.map((v) => visitView(v, hoje)),
      // Tempo em cada parada (§21.8): o deslocamento da primeira conta do início do dia.
      stops: stopTimings(rastro, jornadas[0]?.started_at ?? null),
      route: rota
        ? { id: rota.id, goal: rota.goal, total: rota.stops.length, visitados: rota.stops.filter((s) => s.visit_id).length }
        : null,
    };
  }

  /** Foto de qualquer visita — a equipe inteira lê (spec §11). */
  async photo(visitId: string): Promise<FotoLida> {
    if (!isUuid(visitId)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Foto não encontrada.' });
    const v = await this.prisma.field_visits.findUnique({
      where: { id: visitId },
      select: { photo_key: true },
    });
    if (!v) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Foto não encontrada.' });
    return lerFotoOuFalha(this.fotos, v.photo_key);
  }

  async channels(): Promise<{ channels: string[] }> {
    return { channels: await lerCanais(this.prisma) };
  }

  /** Apara e tira repetidos sem diferenciar caixa ("iFood" e "ifood" são um só). */
  async setChannels(dto: ChannelsDto): Promise<{ channels: string[] }> {
    const vistos = new Set<string>();
    const lista: string[] = [];
    for (const bruto of dto.channels) {
      const canal = bruto.trim();
      const chave = canal.toLowerCase();
      if (!canal || vistos.has(chave)) continue;
      if (canal.length > 80) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'channels: cada canal tem no máximo 80 caracteres.',
        });
      }
      vistos.add(chave);
      lista.push(canal);
    }
    if (lista.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'channels: informe ao menos um canal.',
      });
    }
    await this.prisma.app_settings.upsert({
      where: { id: 1 },
      update: { field_channels: lista },
      create: { id: 1, field_channels: lista },
    });
    return { channels: lista };
  }

  async cnaes(): Promise<{ cnaes: { code: string; label: string }[] }> {
    return { cnaes: await lerCnaes(this.prisma) };
  }

  /** Lista de CNAEs da base (§21.4): código sem repetir, rótulo aparado. */
  async setCnaes(dto: CnaesDto): Promise<{ cnaes: { code: string; label: string }[] }> {
    const vistos = new Set<string>();
    const cnaes = dto.cnaes.map((c) => ({ code: c.code, label: c.label.trim() }));
    for (const c of cnaes) {
      if (vistos.has(c.code) || !c.label) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: vistos.has(c.code) ? `cnaes: o código ${c.code} aparece duas vezes.` : 'cnaes: todo CNAE precisa de um nome.',
        });
      }
      vistos.add(c.code);
    }
    await this.prisma.app_settings.upsert({
      where: { id: 1 },
      update: { field_cnaes: cnaes },
      create: { id: 1, field_cnaes: cnaes },
    });
    return { cnaes };
  }

  async findOrFail(id: string): Promise<ConsultorRow> {
    if (!isUuid(id)) throw naoAchado();
    const c = await this.prisma.field_consultants.findUnique({ where: { id }, include: COM_PRACA });
    if (!c) throw naoAchado();
    return c;
  }

  // ── internos ────────────────────────────────────────────────
  /**
   * Nascimento e área (§21.1). Devolve só o que mudou; `atual` nulo = criação.
   * Raio exige centro; centro sem raio é recusado (o centro só serve ao raio).
   */
  private areaOuFalha(
    dto: AreaFieldsDto,
    atual: Pick<ConsultorRow, 'area_lat' | 'area_lng' | 'area_radius_km'> | null,
  ): CamposDaArea {
    const data: CamposDaArea = {};
    if (dto.birth_date !== undefined) {
      if (dto.birth_date !== null) {
        const anos = idade(dto.birth_date, todaySp());
        if (anos < 14 || anos > 100) {
          throw new BadRequestException({
            code: 'INVALID_BIRTH_DATE',
            message: 'Data de nascimento inválida: a idade precisa ficar entre 14 e 100 anos.',
          });
        }
      }
      data.birth_date = dto.birth_date;
    }
    if (dto.area_bairros !== undefined) {
      const vistos = new Set<string>();
      data.area_bairros = (dto.area_bairros ?? [])
        .map((b) => b.trim())
        .filter((b) => {
          const k = b.toLowerCase();
          if (!b || vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
    }
    const tocouRaio =
      dto.area_lat !== undefined || dto.area_lng !== undefined || dto.area_radius_km !== undefined;
    if (!tocouRaio) return data;
    if (dto.area_radius_km === null) {
      // `null` no raio limpa o círculo inteiro.
      return { ...data, area_lat: null, area_lng: null, area_radius_km: null };
    }
    const lat = dto.area_lat !== undefined ? dto.area_lat : (atual?.area_lat ?? null);
    const lng = dto.area_lng !== undefined ? dto.area_lng : (atual?.area_lng ?? null);
    const raio = dto.area_radius_km !== undefined ? dto.area_radius_km : (atual?.area_radius_km ?? null);
    if ((lat == null) !== (lng == null) || (raio != null && lat == null) || (raio == null && lat != null)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Área: informe o centro (latitude e longitude) e o raio juntos.',
      });
    }
    return { ...data, area_lat: lat, area_lng: lng, area_radius_km: raio };
  }

  private cpfOuFalha(valor: string): string {
    if (!cpfValido(valor)) throw new BadRequestException({ code: 'INVALID_CPF', message: 'CPF inválido.' });
    return digits(valor);
  }

  private telefoneOuFalha(valor: string): string {
    const d = digits(valor);
    if (d.length < 10 || d.length > 13) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'phone: informe DDD + número.' });
    }
    return d;
  }

  private pixOuFalha(tipo: string, chave: string): void {
    if (!pixValido(tipo, chave)) {
      throw new BadRequestException({
        code: 'INVALID_PIX',
        message: 'A chave Pix não confere com o tipo escolhido.',
      });
    }
  }

  /** Corrida entre a conferência e a gravação: o índice único decide, com o mesmo código da conferência. */
  private conflitoUnico(e: unknown): unknown {
    const coluna = colunaUnicaDoConsultor(e);
    if (coluna === 'email') return emailEmUso();
    if (coluna === 'cpf') return cpfEmUso();
    if (violouUnico(e)) {
      return new ConflictException({
        code: 'CONFLICT',
        message: 'E-mail ou CPF já cadastrado em outro consultor.',
      });
    }
    return e;
  }

  private async emailLivre(email: string): Promise<void> {
    if (await this.prisma.field_consultants.findUnique({ where: { email }, select: { id: true } })) {
      throw emailEmUso();
    }
  }

  private async cpfLivre(cpf: string): Promise<void> {
    if (await this.prisma.field_consultants.findUnique({ where: { cpf }, select: { id: true } })) {
      throw cpfEmUso();
    }
  }

  private async pracaOrFail(id: string): Promise<void> {
    const naoAchada = new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    if (!isUuid(id)) throw naoAchada;
    if (!(await this.prisma.pracas.findUnique({ where: { id }, select: { id: true } }))) throw naoAchada;
  }
}
