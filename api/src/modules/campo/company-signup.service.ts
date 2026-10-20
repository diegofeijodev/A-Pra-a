/**
 * Cadastro assistido da empresa visitada no Freela (F6, contrato §26).
 *
 * Invariantes que este arquivo defende:
 * - o link de primeiro acesso (`setupLink`) só passa pela resposta de criar/reemitir: não vai para
 *   o banco, para `last_error`, nem para log (todo `data` do Prisma é montado campo a campo);
 * - o Praça não grava telefone/e-mail inteiros, só mascarados;
 * - tudo é do PRÓPRIO consultor (visita e cadastro de outro = 404);
 * - o corpo enviado ao Freela só depende do DTO + dados determinísticos (um reenvio com corpo
 *   diferente é 422 lá), e nunca há reemissão automática (o Freela limita a 3 em 24 h).
 */
import { HttpException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import {
  corpoDoFreela,
  erroDoFreela,
  mascararEmail,
  mascararTelefone,
  sanitizarErroDoFreela,
} from '../../domain/company-signup-rules';
import { FreelaClient, FreelaHttpError } from '../freela/freela-client';
import { COMPANY_SIGNUP_LIGADO } from './company-signup.tokens';
import type { ReissueLinkDto, SignupCreateDto, SignupsQueryDto } from './dto/company-signup.dto';
import { violouUnico } from './prisma-errors';

const naoAchado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Não encontrado.' });
const http = (status: number, code: string, message: string) => new HttpException({ code, message }, status);

const COM_VISITA = { visit: { select: { client_id: true } } } satisfies Prisma.field_company_signupsInclude;
type Linha = Prisma.field_company_signupsGetPayload<{ include: typeof COM_VISITA }>;

export interface SignupView {
  id: string;
  client_id: string;
  visit_ref: string | null;
  lead_id: string | null;
  status: string;
  company_name: string;
  phone_masked: string;
  email_masked: string | null;
  link_issued_at: string | null;
  link_expires_at: string | null;
  reissue_count: number;
  activated_at: string | null;
  last_error_code: string | null;
  last_error: string | null;
  created_at: string;
  created: boolean;
  /** Só nas respostas de criar/reemitir (§26.0). */
  setup_link: string | null;
}

export interface SignupEquipeView extends SignupView {
  consultant_id: string;
  freela_user_id: string | null;
}

export interface Prefill {
  company_name: string;
  contact_name: string;
  phone: string;
  cnpj: string;
  street: string;
  city: string;
  uf: string;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function signupView(l: Linha, opcoes: { created?: boolean; link?: string | null } = {}): SignupView {
  return {
    id: l.id,
    client_id: l.client_id,
    visit_ref: l.visit?.client_id ?? null,
    lead_id: l.lead_id,
    status: l.status,
    company_name: l.company_name,
    phone_masked: l.phone_masked,
    email_masked: l.email_masked,
    link_issued_at: iso(l.link_issued_at),
    link_expires_at: iso(l.link_expires_at),
    reissue_count: l.reissue_count,
    activated_at: iso(l.activated_at),
    last_error_code: l.last_error_code,
    last_error: l.last_error,
    created_at: l.created_at.toISOString(),
    created: opcoes.created ?? false,
    setup_link: opcoes.link ?? null,
  };
}

const dataOuNull = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

@Injectable()
export class CompanySignupService {
  private readonly log = new Logger(CompanySignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FreelaClient,
    @Inject(COMPANY_SIGNUP_LIGADO) private readonly ligado: boolean,
  ) {}

  /** Flag desligada: a rota "não existe". */
  private exigirLigado(): void {
    if (!this.ligado) throw naoAchado();
  }

  /** `ref` = id do servidor OU `client_id` da visita; sempre do próprio consultor. */
  private async daVisita(consultantId: string, ref: string) {
    if (!isUuid(ref)) throw naoAchado();
    const v = await this.prisma.field_visits.findFirst({
      where: { consultant_id: consultantId, OR: [{ id: ref }, { client_id: ref }] },
      select: {
        id: true,
        client_id: true,
        lead_id: true,
        checkin_lat: true,
        checkin_lng: true,
        far_from_place: true,
        interlocutor_name: true,
        lead: { select: { name: true, phone: true, cnpj: true, address: true, city: true, decisor: true } },
      },
    });
    if (!v) throw naoAchado();
    return v;
  }

  private praca(pracaId: string) {
    return this.prisma.pracas.findUnique({ where: { id: pracaId }, select: { cobertura_cidade: true, cobertura_uf: true } });
  }

  // ── consultor ───────────────────────────────────────────────

  /** Cadastro mais recente da visita + dados para pré-preencher o formulário (nada de link). */
  async daVisitaComPrefill(c: CampoConsultant, ref: string): Promise<{ signup: SignupView | null; prefill: Prefill }> {
    this.exigirLigado();
    const v = await this.daVisita(c.id, ref);
    const [linha, praca] = await Promise.all([
      this.prisma.field_company_signups.findFirst({
        where: { consultant_id: c.id, visit_id: v.id },
        orderBy: { created_at: 'desc' },
        include: COM_VISITA,
      }),
      this.praca(c.praca_id),
    ]);
    const decisor = v.lead.decisor && v.lead.decisor !== '—' ? v.lead.decisor : '';
    return {
      signup: linha ? signupView(linha) : null,
      prefill: {
        company_name: v.lead.name,
        contact_name: v.interlocutor_name?.trim() || decisor,
        phone: v.lead.phone,
        cnpj: v.lead.cnpj ?? '',
        street: v.lead.address,
        city: v.lead.city || praca?.cobertura_cidade || '',
        uf: praca?.cobertura_uf ?? '',
      },
    };
  }

  async buscar(c: CampoConsultant, id: string): Promise<SignupView> {
    this.exigirLigado();
    return signupView(await this.doConsultor(c.id, id));
  }

  private async doConsultor(consultantId: string, id: string): Promise<Linha> {
    if (!isUuid(id)) throw naoAchado();
    const l = await this.prisma.field_company_signups.findFirst({
      where: { id, consultant_id: consultantId },
      include: COM_VISITA,
    });
    if (!l) throw naoAchado();
    return l;
  }

  /** Código do consultor no Freela; sem ele não há como chamar o Freela. */
  private async codigoNoFreela(consultantId: string): Promise<string> {
    const c = await this.prisma.field_consultants.findUnique({
      where: { id: consultantId },
      select: { freela_consultant_id: true },
    });
    if (!c?.freela_consultant_id)
      throw http(409, 'FREELA_CODE_PENDING', 'Seu código no Freela ainda não está ativo. Avise a equipe.');
    return c.freela_consultant_id;
  }

  async criar(c: CampoConsultant, ref: string, dto: SignupCreateDto, agora = new Date()): Promise<SignupView> {
    this.exigirLigado();
    this.client.ensureConfigured();
    const visita = await this.daVisita(c.id, ref);

    let linha = await this.porClientId(dto.client_id, c.id);
    // Já existe no Freela: reenvio da fila/resposta perdida. Não repete a criação e NUNCA reemite sozinho.
    if (linha?.freela_user_id) return signupView(linha, { created: false });

    const freelaId = await this.codigoNoFreela(c.id);
    const praca = await this.praca(c.praca_id);
    const checkin = visita.far_from_place ? null : { lat: visita.checkin_lat, lng: visita.checkin_lng };
    const corpo = corpoDoFreela(dto, { cidade: praca?.cobertura_cidade ?? null, uf: praca?.cobertura_uf ?? null }, checkin);
    if (!corpo) {
      throw http(400, 'VALIDATION_ERROR', 'Confira o telefone e informe cidade e UF da empresa.');
    }

    if (!linha) {
      try {
        linha = await this.prisma.field_company_signups.create({
          data: {
            client_id: dto.client_id,
            consultant_id: c.id,
            visit_id: visita.id,
            lead_id: visita.lead_id,
            company_name: corpo.companyName,
            phone_masked: mascararTelefone(corpo.phone),
            email_masked: mascararEmail(corpo.email),
            status: 'creating',
          },
          include: COM_VISITA,
        });
      } catch (e) {
        if (!violouUnico(e)) throw e;
        // Corrida entre dois envios do mesmo client_id.
        linha = await this.porClientId(dto.client_id, c.id);
        if (!linha) throw naoAchado();
        if (linha.freela_user_id) return signupView(linha, { created: false });
      }
    }

    let r;
    try {
      r = await this.client.createCompanyRegistration(freelaId, corpo);
    } catch (e) {
      throw await this.registrarFalha(linha.id, e, 'criar');
    }

    const ativado = dataOuNull(r.activatedAt);
    const emitiu = r.created && !!r.setupLink;
    const atualizada = await this.prisma.field_company_signups.update({
      where: { id: linha.id },
      data: {
        status: ativado ? 'activated' : 'pending',
        freela_user_id: r.userId,
        freela_contractor_id: r.contractorId,
        activated_at: ativado,
        last_error_code: null,
        last_error: null,
        ...(emitiu ? { link_issued_at: agora, link_expires_at: dataOuNull(r.setupLinkExpiresAt) } : {}),
      },
      include: COM_VISITA,
    });
    this.log.log(`cadastro assistido ${r.created ? 'criado' : 'repetido'}: signup=${atualizada.id} consultor=${c.id}`);
    return signupView(atualizada, { created: r.created, link: emitiu ? r.setupLink : null });
  }

  async reemitir(c: CampoConsultant, id: string, dto: ReissueLinkDto, agora = new Date()): Promise<SignupView> {
    this.exigirLigado();
    this.client.ensureConfigured();
    const linha = await this.doConsultor(c.id, id);
    if (linha.status === 'activated')
      throw http(409, 'ALREADY_ACTIVATED', 'O dono já definiu a senha. Não é preciso gerar outro link.');
    if (!linha.freela_user_id)
      throw http(409, 'SIGNUP_NOT_CREATED', 'Este cadastro ainda não foi criado no Freela. Envie-o de novo.');
    const freelaId = await this.codigoNoFreela(c.id);

    let r;
    try {
      r = await this.client.reissueRegistrationLink(freelaId, linha.freela_user_id, dto.reason);
    } catch (e) {
      throw await this.registrarFalha(linha.id, e, 'reemitir');
    }
    const atualizada = await this.prisma.field_company_signups.update({
      where: { id: linha.id },
      data: {
        link_issued_at: agora,
        link_expires_at: dataOuNull(r.setupLinkExpiresAt),
        reissue_count: { increment: 1 },
        last_error_code: null,
        last_error: null,
      },
      include: COM_VISITA,
    });
    this.log.log(`link reemitido: signup=${atualizada.id} consultor=${c.id}`);
    return signupView(atualizada, { link: r.setupLink });
  }

  private async porClientId(clientId: string, consultantId: string): Promise<Linha | null> {
    const l = await this.prisma.field_company_signups.findUnique({ where: { client_id: clientId }, include: COM_VISITA });
    if (!l) return null;
    // Cadastro de outro consultor: 404, nunca 403 (não confirma que o id existe).
    if (l.consultant_id !== consultantId) throw naoAchado();
    return l;
  }

  /**
   * Grava o motivo (sanitizado) e devolve a exceção a lançar. Só `FreelaHttpError` conhecido vira
   * estado; falha de rede mantém a linha como está (o reenvio com o mesmo client_id repete).
   */
  private async registrarFalha(id: string, e: unknown, operacao: 'criar' | 'reemitir'): Promise<unknown> {
    if (!(e instanceof FreelaHttpError)) return e;
    const t = erroDoFreela({ freelaStatus: e.freelaStatus, ...e.freelaError, message: e.message }, operacao);
    const code = t?.code ?? 'FREELA_ERROR';
    const message = sanitizarErroDoFreela(t?.message ?? e.message);
    const ativado = t?.code === 'ALREADY_ACTIVATED';
    // Reemitir não rebaixa um cadastro já criado: só 'ALREADY_ACTIVATED' muda o estado.
    const status = operacao === 'criar' ? (t?.local ?? 'failed') : ativado ? 'activated' : undefined;
    await this.prisma.field_company_signups.update({
      where: { id },
      data: { ...(status ? { status } : {}), last_error_code: code, last_error: message },
    });
    this.log.warn(`cadastro assistido recusado: signup=${id} codigo=${code}`);
    return t ? http(t.status, t.code, message) : new FreelaHttpError(e.freelaStatus, message, e.freelaError);
  }

  // ── equipe ──────────────────────────────────────────────────

  async listarDoConsultor(consultantId: string, q: SignupsQueryDto): Promise<{ data: SignupEquipeView[] }> {
    this.exigirLigado();
    if (!isUuid(consultantId)) throw naoAchado();
    const existe = await this.prisma.field_consultants.findUnique({ where: { id: consultantId }, select: { id: true } });
    if (!existe) throw naoAchado();
    const linhas = await this.prisma.field_company_signups.findMany({
      where: { consultant_id: consultantId, ...(q.status ? { status: q.status } : {}) },
      orderBy: { created_at: 'desc' },
      take: q.limit ?? 50,
      include: COM_VISITA,
    });
    return {
      data: linhas.map((l) => ({ ...signupView(l), consultant_id: l.consultant_id, freela_user_id: l.freela_user_id })),
    };
  }
}
