import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { LOVABLE_E_FLAGS, type FlagsLovableE } from '../../common/flags/lovable-e.flags';
import { PracasDoConsultorService, type PracaDoConjunto } from '../../common/pracas/pracas-do-consultor.service';
import { conjuntoNovo } from '../../domain/multi-praca-rules';
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
import { CAMPOS_BANCO, CAMPOS_CADASTRO, mascararConta, mascararPix, normalizarCadastro, type CampoCadastro } from '../../domain/consultor-cadastro-rules';
import { CampoFreelaService } from './campo-freela.service';
import { lerCanais } from './campo-canais';
import { signupUrl } from './campo-links';
import { COM_PRACA } from './campo-prisma';
import { SignupsLeituraService, type Contagem } from './signups-leitura.service';
import {
  COM_LEAD,
  journeyView,
  pointView,
  visitView,
  type JourneyView,
  type PointView,
  type VisitView,
} from './campo-views';
import { ChannelsDto, CreateConsultorDto, PracasDoConsultorDto, UpdateConsultorDto } from './dto/consultores.dto';
import { ModoCampoService } from '../rotas/modo-campo.service';
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
  /** Exceção do fluxo da visita (contrato §31.3): `simples`|`completo`; `null` = seguir o padrão. */
  visit_flow: string | null;
  /** O fluxo que vale HOJE para ele (flag + consultor + global). */
  visit_flow_effective: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Lote E §41.3 (só com FIELD_CONSULTANT_PROFILE_ENABLED): endereço e banco; `bank_account` completa só para o admin.
  address_cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_district?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_type?: string | null;
  bank_account_masked?: string | null;
  bank_account?: string | null;
  // Lote F2 §44.7 (só com FIELD_MULTI_PRACA_ENABLED): o conjunto de praças (a principal primeiro) e os ids dele.
  pracas?: PracaDoConjunto[];
  praca_ids?: string[];
}

export interface ConsultorListItem extends ConsultorView {
  today: { status: SituacaoHoje; visits: number; closed: number; cadastros: number; cadastrou_agora: number; last_point_at: string | null };
  /** Cadastros confirmados pelo Freela hoje/na semana (contrato §27.8); `null` se não pôde ser lido. */
  signups_confirmed: Contagem | null;
}

export type ConsultorRow = Prisma.field_consultantsGetPayload<{
  include: { praca: { select: { name: true } } };
}>;

/** Projeção da equipe — nunca `password_hash` nem `token_version`. */
export function toConsultorView(c: ConsultorRow, efetivo = 'completo'): ConsultorView {
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
    visit_flow: c.visit_flow ?? null,
    visit_flow_effective: efetivo,
    created_by: c.created_by,
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  };
}

const naoAchado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Consultor não encontrado.' });

const perfilDesligado = () =>
  new UnprocessableEntityException({
    code: 'CONSULTANT_PROFILE_DISABLED',
    message: 'Endereço e banco do consultor não estão ligados neste servidor.',
  });

/** §42.3: o que o gestor não muda (o Pix, o modo da visita e o banco são do admin). Sem o valor na mensagem. */
const ROTULO_PROIBIDO: Record<string, string> = {
  pix_key: 'a chave Pix',
  pix_key_type: 'o tipo da chave Pix',
  visit_flow: 'o modo da visita',
  bank: 'os dados do banco',
};
const campoProibido = (campo: keyof typeof ROTULO_PROIBIDO) =>
  new ForbiddenException({ code: 'FORBIDDEN_FIELD', message: `Gestor não muda ${ROTULO_PROIBIDO[campo]}: peça a um administrador.` });

/** Gestor efetivo (o guard já combinou a flag com a coluna); admin nunca é tratado como gestor. */
const ehGestor = (u?: AuthUser): boolean => !!u && !u.is_admin && u.is_gestor === true;

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
    @Optional() private readonly signups?: SignupsLeituraService,
    @Optional() private readonly modo?: ModoCampoService,
    @Optional() @Inject(LOVABLE_E_FLAGS) private readonly lovE?: FlagsLovableE,
    @Optional() private readonly pracas?: PracasDoConsultorService,
  ) {}

  /** Lote F2 §44.7: o conjunto no `ConsultorView` (só com a flag; desligada, nada lido e nenhuma chave nova). */
  private comPracas<T extends ConsultorView>(view: T, conjunto: PracaDoConjunto[] | undefined): T {
    if (!this.pracas?.ligado || !conjunto) return view;
    return { ...view, pracas: conjunto, praca_ids: conjunto.map((p) => p.id) };
  }

  private get perfilLigado(): boolean {
    return this.lovE?.consultant_profile === true;
  }

  /**
   * O que cada um vê (§41.3, §42.3): o gestor vê o Pix mascarado; com o cadastro ligado entram endereço e banco, e a conta
   * completa só vai ao admin. Sem quem pede (chamadas internas) = o mais restrito para a conta.
   */
  private projetar(view: ConsultorView, c: ConsultorRow, quem?: AuthUser): ConsultorView {
    let out = ehGestor(quem) ? { ...view, pix_key: mascararPix(view.pix_key) } : view;
    if (!this.perfilLigado) return out;
    out = {
      ...out,
      address_cep: c.address_cep ?? null,
      address_street: c.address_street ?? null,
      address_number: c.address_number ?? null,
      address_complement: c.address_complement ?? null,
      address_district: c.address_district ?? null,
      address_city: c.address_city ?? null,
      address_state: c.address_state ?? null,
      bank_name: c.bank_name ?? null,
      bank_branch: c.bank_branch ?? null,
      bank_account_type: c.bank_account_type ?? null,
      bank_account_masked: mascararConta(c.bank_account),
      ...(quem?.is_admin ? { bank_account: c.bank_account ?? null } : {}),
    };
    return out;
  }

  /** Endereço e banco do corpo (§41.3): desligado = `null`/ausente ignorado e valor recusado; o gestor nunca escreve o banco (§42.3). */
  private cadastroDoCorpo(dto: object, quem?: AuthUser): Partial<Record<CampoCadastro, string | null>> {
    const corpo = dto as Partial<Record<CampoCadastro, unknown>>;
    const presentes = CAMPOS_CADASTRO.filter((k) => corpo[k] !== undefined);
    if (!this.perfilLigado) {
      if (presentes.some((k) => corpo[k] !== null)) throw perfilDesligado();
      return {};
    }
    if (ehGestor(quem) && presentes.some((k) => (CAMPOS_BANCO as readonly string[]).includes(k))) throw campoProibido('bank');
    const r = normalizarCadastro(corpo);
    if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
    return r.dados;
  }

  /** Fluxo da visita que vale para o consultor agora (contrato §31.1); sem o serviço, `completo`. */
  private async fluxoEfetivo(c: { id: string; visit_flow: string | null }): Promise<string> {
    return this.modo ? this.modo.fluxoDoConsultor(c.id) : 'completo';
  }

  async list(agora = new Date(), quem?: AuthUser): Promise<ConsultorListItem[]> {
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
        select: { consultant_id: true, freela_status: true, outcome: true, result: true },
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

    let conf: Awaited<ReturnType<SignupsLeituraService['contagens']>> | null = null;
    try {
      conf = this.signups ? await this.signups.contagens(consultores.map((c) => c.id), agora) : null;
    } catch {
      conf = null; // a lista da equipe não cai por causa do contador
    }

    const efetivos = new Map<string, string>();
    for (const c of consultores) efetivos.set(c.id, await this.fluxoEfetivo(c));
    // Lote F2 §44.7: os conjuntos numa leitura só (desligada: nenhuma consulta).
    const conjuntos = this.pracas ? await this.pracas.conjuntos(consultores) : new Map<string, PracaDoConjunto[]>();
    return consultores.map((c) => {
      const js = jornadas.filter((j) => j.consultant_id === c.id);
      const vs = visitas.filter((v) => v.consultant_id === c.id);
      const pontos = js.map((j) => ultimoPorJornada.get(j.id)).filter((d): d is Date => d instanceof Date);
      const ultimo = pontos.length ? new Date(Math.max(...pontos.map((d) => d.getTime()))) : null;
      return {
        ...this.comPracas(this.projetar(toConsultorView(c, efetivos.get(c.id)), c, quem), conjuntos.get(c.id)),
        today: {
          status: situacaoHoje(js),
          visits: vs.length,
          closed: vs.filter((v) => v.outcome === 'fechado').length,
          cadastros: vs.filter((v) => v.freela_status === 'cadastrou_qr').length,
          // Modo do chefe §31.5: "Cadastrou agora" do fluxo simples (declarado; o confirmado vem de signups_confirmed).
          cadastrou_agora: vs.filter((v) => v.result === 'cadastrou').length,
          last_point_at: ultimo?.toISOString() ?? null,
        },
        signups_confirmed: conf
          ? { today: conf.porConsultor.get(c.id)?.today ?? 0, week: conf.porConsultor.get(c.id)?.week ?? 0, rule: conf.rule, source: conf.source }
          : null,
      };
    });
  }

  async get(id: string, quem?: AuthUser): Promise<ConsultorView> {
    const c = await this.findOrFail(id);
    const view = this.projetar(toConsultorView(c, await this.fluxoEfetivo(c)), c, quem);
    return this.pracas?.ligado ? this.comPracas(view, await this.pracas.conjuntoComNomes(c.id, c.praca_id)) : view;
  }

  /**
   * Lote F2 §44.7 (só admin; a marca está no controller): grava o conjunto INTEIRO de praças do consultor. A principal fica
   * sempre e nunca é gravada na junção; grava só a diferença, com quem mudou. Desligada = 404 MULTI_PRACA_DISABLED.
   */
  async salvarPracas(id: string, dto: PracasDoConsultorDto, quem: AuthUser): Promise<ConsultorView> {
    if (!this.pracas?.ligado) {
      throw new NotFoundException({ code: 'MULTI_PRACA_DISABLED', message: 'Várias praças por consultor não estão ligadas neste servidor.' });
    }
    const c = await this.findOrFail(id);
    const r = conjuntoNovo(c.praca_id, dto.praca_ids, c.praca.name);
    if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
    const existentes = r.extras.length ? await this.prisma.pracas.count({ where: { id: { in: r.extras } } }) : 0;
    if (existentes !== r.extras.length) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    const atuais = (await this.prisma.field_consultant_pracas.findMany({ where: { consultant_id: id }, select: { praca_id: true } })).map((x) => x.praca_id);
    const sair = atuais.filter((p) => !r.extras.includes(p));
    const entrar = r.extras.filter((p) => !atuais.includes(p));
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (sair.length) ops.push(this.prisma.field_consultant_pracas.deleteMany({ where: { consultant_id: id, praca_id: { in: sair } } }));
    if (entrar.length) {
      ops.push(
        this.prisma.field_consultant_pracas.createMany({
          data: entrar.map((praca_id) => ({ consultant_id: id, praca_id, created_by: quem.id })),
          skipDuplicates: true,
        }),
      );
    }
    if (ops.length) await this.prisma.$transaction(ops);
    return this.get(id, quem);
  }

  async create(
    dto: CreateConsultorDto,
    admin: AuthUser,
  ): Promise<{ consultant: ConsultorView; temp_password: string }> {
    const email = dto.email.trim().toLowerCase();
    const cpf = this.cpfOuFalha(dto.cpf);
    const phone = this.telefoneOuFalha(dto.phone);
    this.pixOuFalha(dto.pix_key_type, dto.pix_key);
    const cadastro = this.cadastroDoCorpo(dto, admin);
    await this.pracaOrFail(dto.praca_id);
    await this.emailLivre(email);
    await this.cpfLivre(cpf);

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
          ...cadastro,
        },
      });
    } catch (e) {
      throw this.conflitoUnico(e);
    }
    await this.freela.sync(criado.id);
    return { consultant: await this.get(criado.id, admin), temp_password: temp };
  }

  async update(id: string, dto: UpdateConsultorDto, quem?: AuthUser): Promise<ConsultorView> {
    // §42.3: o gestor não muda Pix nem o modo da visita — a PRESENÇA da chave basta (mesmo `null`), antes de qualquer leitura.
    if (ehGestor(quem)) {
      for (const k of ['pix_key', 'pix_key_type', 'visit_flow'] as const) if (dto[k] !== undefined) throw campoProibido(k);
    }
    const cadastro = this.cadastroDoCorpo(dto, quem);
    const atual = await this.findOrFail(id);
    const data: Prisma.field_consultantsUncheckedUpdateInput = { ...cadastro };
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
    // Contrato §31.3: exceção do fluxo da visita (só admin; `null` = seguir o padrão). Vale para visitas abertas dali em diante.
    if (dto.visit_flow !== undefined) data.visit_flow = dto.visit_flow;
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
    return this.get(id, quem);
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
    // O razão da remuneração é permanente (FK Restrict, §28.3): quem tem ganhos lançados é desativado, não apagado.
    // L13 (§45.3): regra própria também é permanente (FK Restrict + trigger): uma contagem a mais, mesmo com a flag desligada.
    const [ganhos, fechamentos, declaracoes, regras] = await Promise.all([
      this.prisma.field_earnings_ledger.count({ where: { consultant_id: id } }),
      this.prisma.field_payout_periods.count({ where: { consultant_id: id } }),
      this.prisma.field_declared_signups.count({ where: { consultant_id: id } }),
      this.prisma.field_pay_rule_versions.count({ where: { consultant_id: id } }),
    ]);
    if (ganhos + fechamentos + declaracoes + regras > 0) {
      throw new ConflictException({ code: 'HAS_EARNINGS', message: 'Este consultor tem ganhos lançados e não pode ser apagado. Desative o acesso em vez de apagar.' });
    }
    // Pedido de cupom é um fato (FK Restrict + trigger, contrato §38.9): quem pediu é desativado, não apagado.
    if (await this.prisma.field_vouchers.count({ where: { consultant_id: id } })) {
      throw new ConflictException({ code: 'HAS_VOUCHER', message: 'Este consultor pediu cupons da 1ª contratação e não pode ser apagado. Desative o acesso em vez de apagar.' });
    }
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
  ): Promise<{ day: string; journeys: (JourneyView & { points: PointView[] })[]; visits: VisitView[] }> {
    await this.findOrFail(id);
    if (!isDateString(day)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'day: deve ser uma data válida no formato YYYY-MM-DD',
      });
    }
    const [jornadas, visitas] = await Promise.all([
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
    ]);
    const hoje = todaySp();
    return {
      day,
      journeys: jornadas.map((j) => ({ ...journeyView(j), points: j.points.map(pointView) })),
      // Lote E §41.4: o detalhe da equipe vê o e-mail de quem atendeu completo (como o telefone do §30.3), só com a flag.
      visits: visitas.map((v) => visitView(v, hoje, undefined, this.lovE?.contact_email ? { contact_email: true } : {})),
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

  async findOrFail(id: string): Promise<ConsultorRow> {
    if (!isUuid(id)) throw naoAchado();
    const c = await this.prisma.field_consultants.findUnique({ where: { id }, include: COM_PRACA });
    if (!c) throw naoAchado();
    return c;
  }

  // ── internos ────────────────────────────────────────────────
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
