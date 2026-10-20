import { HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { FreelaClient, FreelaHttpError } from '../../freela/freela-client';
import { CompanySignupService } from '../company-signup.service';
import type { SignupCreateDto } from '../dto/company-signup.dto';

const CONS = '44444444-4444-4444-8444-444444444444';
const OUTRO = '66666666-6666-4666-8666-666666666666';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const LEAD = '99999999-9999-4999-8999-999999999999';
const VISITA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VISITA_CLIENT = '77777777-7777-4777-8777-777777777777';
const CLIENT = '11111111-1111-4111-8111-111111111111';
const CLIENT2 = '22222222-2222-4222-8222-222222222222';
const AGORA = new Date('2026-10-20T15:00:00.000Z');

const LINK = 'https://freela.example/primeiro-acesso?t=TOKENSECRETOAAAAAAAAAAAAAAAAAAAA123';
const LINK2 = 'https://freela.example/primeiro-acesso?t=OUTROTOKENBBBBBBBBBBBBBBBBBBBBBB456';

const c = (id = CONS): CampoConsultant => ({ id, name: 'Ana', email: 'ana@x.com', praca_id: PRACA, must_change_password: false });

const DTO: SignupCreateDto = {
  client_id: CLIENT,
  company_name: 'Padaria Bom Pão',
  contact_name: 'Marcos',
  phone: '(11) 98765-4321',
  email: 'marcos@padaria.com',
};

type Linha = Record<string, unknown> & { id: string; client_id: string; consultant_id: string };

/** Prisma em memória, só o que o serviço toca. Registra tudo o que é gravado. */
function montar(opts: { freelaId?: string | null; ligado?: boolean } = {}) {
  const linhas: Linha[] = [];
  const gravado: unknown[] = [];
  let seq = 0;
  const visita = {
    id: VISITA_ID,
    client_id: VISITA_CLIENT,
    lead_id: LEAD,
    checkin_lat: -23.6,
    checkin_lng: -46.6,
    far_from_place: false,
    interlocutor_name: 'Seu Zé',
    lead: { name: 'Padaria Bom Pão', phone: '1133334444', cnpj: null, address: 'Rua A, 10', city: '', decisor: '—' },
  };
  const comVisita = (l: Linha) => ({ ...l, visit: l.visit_id ? { client_id: VISITA_CLIENT } : null });
  const prisma = {
    field_visits: {
      findFirst: jest.fn(async ({ where }: { where: { consultant_id: string; OR: { id?: string; client_id?: string }[] } }) =>
        where.consultant_id === CONS && where.OR.some((o) => o.id === VISITA_ID || o.client_id === VISITA_CLIENT) ? visita : null,
      ),
    },
    pracas: { findUnique: jest.fn(async () => ({ cobertura_cidade: 'São Paulo', cobertura_uf: 'SP' })) },
    field_consultants: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === CONS || where.id === OUTRO ? { id: where.id, freela_consultant_id: opts.freelaId === undefined ? 'fc-1' : opts.freelaId } : null,
      ),
    },
    field_company_signups: {
      findUnique: jest.fn(async ({ where }: { where: { client_id: string } }) => {
        const l = linhas.find((x) => x.client_id === where.client_id);
        return l ? comVisita(l) : null;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id?: string; consultant_id: string; visit_id?: string } }) => {
        const l = linhas
          .filter((x) => x.consultant_id === where.consultant_id && (!where.id || x.id === where.id) && (!where.visit_id || x.visit_id === where.visit_id))
          .sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime())[0];
        return l ? comVisita(l) : null;
      }),
      findMany: jest.fn(async ({ where }: { where: { consultant_id: string } }) => linhas.filter((x) => x.consultant_id === where.consultant_id).map(comVisita)),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        gravado.push(data);
        if (linhas.some((x) => x.client_id === data.client_id)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        }
        const l = {
          id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
          freela_user_id: null,
          freela_contractor_id: null,
          link_issued_at: null,
          link_expires_at: null,
          reissue_count: 0,
          activated_at: null,
          last_error_code: null,
          last_error: null,
          created_at: new Date(AGORA.getTime() + seq),
          ...data,
        } as unknown as Linha;
        linhas.push(l);
        return comVisita(l);
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        gravado.push(data);
        const l = linhas.find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries(data)) {
          l[k] = v && typeof v === 'object' && 'increment' in (v as object) ? (l[k] as number) + (v as { increment: number }).increment : v;
        }
        return comVisita(l);
      }),
    },
  };
  const freela = new FreelaClient();
  jest.spyOn(freela, 'ensureConfigured').mockImplementation(() => undefined);
  const svc = new CompanySignupService(prisma as unknown as PrismaService, freela, opts.ligado ?? true);
  return { svc, prisma, freela, linhas, gravado };
}

const CRIADO = { userId: 'u-1', contractorId: 'ct-1', created: true, accessMode: 'setup_link', setupLink: LINK, setupLinkExpiresAt: '2026-10-21T15:00:00.000Z', activatedAt: null };

let logs: string[];
beforeEach(() => {
  logs = [];
  for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
    jest.spyOn(Logger.prototype, m).mockImplementation((...a: unknown[]) => void logs.push(JSON.stringify(a)));
  }
});
afterEach(() => jest.restoreAllMocks());

const falha = async (p: Promise<unknown>): Promise<HttpException> => {
  try {
    await p;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('devia ter lançado');
};
const codigo = (e: HttpException) => (e.getResponse() as { code: string }).code;

describe('CompanySignupService — flag', () => {
  it('desligada: toda operação é 404 e o Freela nem é chamado', async () => {
    const { svc, freela } = montar({ ligado: false });
    const criar = jest.spyOn(freela, 'createCompanyRegistration');
    expect((await falha(svc.criar(c(), VISITA_CLIENT, DTO))).getStatus()).toBe(404);
    expect((await falha(svc.reemitir(c(), CLIENT, {}))).getStatus()).toBe(404);
    expect((await falha(svc.buscar(c(), CLIENT))).getStatus()).toBe(404);
    expect((await falha(svc.daVisitaComPrefill(c(), VISITA_CLIENT))).getStatus()).toBe(404);
    expect((await falha(svc.listarDoConsultor(CONS, {}))).getStatus()).toBe(404);
    expect(criar).not.toHaveBeenCalled();
  });
});

describe('CompanySignupService.criar', () => {
  it('cria: manda ao Freela o corpo determinístico, devolve o link UMA vez e guarda só mascarado', async () => {
    const { svc, freela, linhas } = montar();
    const criar = jest.spyOn(freela, 'createCompanyRegistration').mockResolvedValue(CRIADO);
    const v = await svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    expect(v).toMatchObject({ created: true, setup_link: LINK, status: 'pending', phone_masked: '(11) 9****-4321', email_masked: 'm***@padaria.com', visit_ref: VISITA_CLIENT });
    expect(criar).toHaveBeenCalledWith('fc-1', {
      clientId: CLIENT,
      persona: 'contractor',
      accessMode: 'setup_link',
      companyName: 'Padaria Bom Pão',
      contactName: 'Marcos',
      phone: '+5511987654321',
      email: 'marcos@padaria.com',
      address: { city: 'São Paulo', uf: 'SP' },
      lat: -23.6,
      lng: -46.6,
    });
    expect(linhas[0]).toMatchObject({ freela_user_id: 'u-1', link_issued_at: AGORA });
    expect(linhas[0]!.link_expires_at).toEqual(new Date('2026-10-21T15:00:00.000Z'));
  });

  it('idempotente: reenvio do mesmo client_id NÃO chama o Freela e NÃO devolve link', async () => {
    const { svc, freela, linhas } = montar();
    const criar = jest.spyOn(freela, 'createCompanyRegistration').mockResolvedValue(CRIADO);
    await svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    const v2 = await svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    expect(criar).toHaveBeenCalledTimes(1);
    expect(v2).toMatchObject({ created: false, setup_link: null, status: 'pending' });
    expect(linhas).toHaveLength(1);
  });

  it('resposta perdida: sem freela_user_id local, repete com o MESMO corpo e o replay do Freela vem sem link', async () => {
    const { svc, freela, linhas } = montar();
    const criar = jest
      .spyOn(freela, 'createCompanyRegistration')
      .mockRejectedValueOnce(new Error('rede caiu'))
      .mockResolvedValueOnce({ ...CRIADO, created: false, setupLink: null });
    await falha(svc.criar(c(), VISITA_CLIENT, DTO, AGORA));
    expect(linhas[0]).toMatchObject({ status: 'creating', freela_user_id: null });
    const v = await svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    expect(v).toMatchObject({ created: false, setup_link: null, status: 'pending' });
    expect(linhas[0]).toMatchObject({ freela_user_id: 'u-1', link_issued_at: null });
    expect(JSON.stringify(criar.mock.calls[0]![1])).toBe(JSON.stringify(criar.mock.calls[1]![1]));
    expect(linhas).toHaveLength(1);
  });

  it('corrida (P2002): carrega a linha existente em vez de falhar', async () => {
    const { svc, freela, prisma, linhas } = montar();
    jest.spyOn(freela, 'createCompanyRegistration').mockResolvedValue(CRIADO);
    const buscar = prisma.field_company_signups.findUnique;
    // 1ª leitura não vê nada; a linha aparece antes do create (outro envio ganhou).
    buscar.mockImplementationOnce(async () => null);
    await svc.criar(c(), VISITA_CLIENT, { ...DTO }, AGORA); // cria a 1ª
    buscar.mockImplementationOnce(async () => null);
    const v = await svc.criar(c(), VISITA_CLIENT, { ...DTO }, AGORA);
    expect(linhas).toHaveLength(1);
    expect(v.created).toBe(false);
  });

  it('409 do Freela: guarda already_registered; com vínculo ao consultor o código muda', async () => {
    const { svc, freela, linhas } = montar();
    jest
      .spyOn(freela, 'createCompanyRegistration')
      .mockRejectedValueOnce(new FreelaHttpError(409, 'telefone existe', { code: 'PHONE_ALREADY_REGISTERED', alreadyLinkedToThisConsultant: false }))
      .mockRejectedValueOnce(new FreelaHttpError(409, 'telefone existe', { code: 'PHONE_ALREADY_REGISTERED', alreadyLinkedToThisConsultant: true }));
    const e1 = await falha(svc.criar(c(), VISITA_CLIENT, DTO, AGORA));
    expect([e1.getStatus(), codigo(e1)]).toEqual([409, 'PHONE_ALREADY_REGISTERED']);
    expect(linhas[0]).toMatchObject({ status: 'already_registered', last_error_code: 'PHONE_ALREADY_REGISTERED' });
    // Mesmo client_id outra vez (linha sem freela_user_id): chama de novo e agora vem o vínculo.
    const e2 = await falha(svc.criar(c(), VISITA_CLIENT, DTO, AGORA));
    expect(codigo(e2)).toBe('PHONE_ALREADY_REGISTERED_BY_YOU');
  });

  it('404 genérico do Freela (flag lá desligada) = 503 SIGNUP_UNAVAILABLE', async () => {
    const { svc, freela } = montar();
    jest.spyOn(freela, 'createCompanyRegistration').mockRejectedValue(new FreelaHttpError(404, 'Not Found'));
    const e = await falha(svc.criar(c(), VISITA_CLIENT, DTO, AGORA));
    expect([e.getStatus(), codigo(e)]).toEqual([503, 'SIGNUP_UNAVAILABLE']);
  });

  it('429 diário e erro desconhecido: repassa o código / FREELA_ERROR', async () => {
    const { svc, freela } = montar();
    jest
      .spyOn(freela, 'createCompanyRegistration')
      .mockRejectedValueOnce(new FreelaHttpError(429, 'limite', { code: 'DAILY_REGISTRATION_LIMIT' }))
      .mockRejectedValueOnce(new FreelaHttpError(500, 'boom'));
    expect(codigo(await falha(svc.criar(c(), VISITA_CLIENT, DTO)))).toBe('DAILY_REGISTRATION_LIMIT');
    const e = await falha(svc.criar(c(), VISITA_CLIENT, { ...DTO, client_id: CLIENT2 }));
    expect(e).toBeInstanceOf(FreelaHttpError);
  });

  it('consultor sem código no Freela: 409 FREELA_CODE_PENDING, sem chamar o Freela', async () => {
    const { svc, freela } = montar({ freelaId: null });
    const criar = jest.spyOn(freela, 'createCompanyRegistration');
    expect(codigo(await falha(svc.criar(c(), VISITA_CLIENT, DTO)))).toBe('FREELA_CODE_PENDING');
    expect(criar).not.toHaveBeenCalled();
  });

  it('telefone inválido: 400 antes de qualquer gravação', async () => {
    const { svc, freela, linhas } = montar();
    const criar = jest.spyOn(freela, 'createCompanyRegistration');
    const e = await falha(svc.criar(c(), VISITA_CLIENT, { ...DTO, phone: '(11) 1234' }));
    expect(e.getStatus()).toBe(400);
    expect(criar).not.toHaveBeenCalled();
    expect(linhas).toHaveLength(0);
  });

  it('check-in longe do local: coordenadas não vão ao Freela', async () => {
    const m = montar();
    const criar = jest.spyOn(m.freela, 'createCompanyRegistration').mockResolvedValue(CRIADO);
    (m.prisma.field_visits.findFirst as jest.Mock).mockImplementationOnce(async () => ({
      id: VISITA_ID, client_id: VISITA_CLIENT, lead_id: LEAD, checkin_lat: 1, checkin_lng: 2, far_from_place: true, interlocutor_name: null,
      lead: { name: 'x', phone: '', cnpj: null, address: '', city: '', decisor: '—' },
    }));
    await m.svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    expect(criar.mock.calls[0]![1]).not.toHaveProperty('lat');
  });
});

describe('CompanySignupService — isolamento entre consultores', () => {
  it('visita de outro consultor: 404', async () => {
    const { svc } = montar();
    expect((await falha(svc.criar(c(OUTRO), VISITA_CLIENT, DTO))).getStatus()).toBe(404);
    expect((await falha(svc.daVisitaComPrefill(c(OUTRO), VISITA_CLIENT))).getStatus()).toBe(404);
  });

  it('client_id já usado por OUTRO consultor: 404 (não confirma que existe) e o Freela não é chamado', async () => {
    const m = montar();
    const criar = jest.spyOn(m.freela, 'createCompanyRegistration').mockResolvedValue(CRIADO);
    await m.svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    // O outro consultor "tem" a visita (fake) para chegar até a checagem do client_id.
    (m.prisma.field_visits.findFirst as jest.Mock).mockImplementationOnce(async () => ({
      id: 'zz', client_id: 'zz', lead_id: LEAD, checkin_lat: 0, checkin_lng: 0, far_from_place: false, interlocutor_name: null,
      lead: { name: 'x', phone: '', cnpj: null, address: '', city: '', decisor: '—' },
    }));
    expect((await falha(m.svc.criar(c(OUTRO), VISITA_CLIENT, DTO))).getStatus()).toBe(404);
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it('reemitir e buscar cadastro de outro consultor: 404', async () => {
    const m = montar();
    jest.spyOn(m.freela, 'createCompanyRegistration').mockResolvedValue(CRIADO);
    const v = await m.svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    const reissue = jest.spyOn(m.freela, 'reissueRegistrationLink');
    expect((await falha(m.svc.reemitir(c(OUTRO), v.id, {}))).getStatus()).toBe(404);
    expect((await falha(m.svc.buscar(c(OUTRO), v.id))).getStatus()).toBe(404);
    expect(reissue).not.toHaveBeenCalled();
  });

  it('lista da equipe: só os cadastros do consultor pedido; consultor inexistente = 404', async () => {
    const m = montar();
    jest.spyOn(m.freela, 'createCompanyRegistration').mockResolvedValue(CRIADO);
    await m.svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    const { data } = await m.svc.listarDoConsultor(CONS, {});
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ consultant_id: CONS, freela_user_id: 'u-1', setup_link: null });
    expect((await m.svc.listarDoConsultor(OUTRO, {})).data).toHaveLength(0);
    expect((await falha(m.svc.listarDoConsultor('77777777-0000-4000-8000-000000000000', {}))).getStatus()).toBe(404);
  });
});

describe('CompanySignupService.reemitir', () => {
  async function comCadastro() {
    const m = montar();
    jest.spyOn(m.freela, 'createCompanyRegistration').mockResolvedValue({ ...CRIADO, created: false, setupLink: null });
    const v = await m.svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    return { ...m, v };
  }

  it('devolve o link novo uma vez, conta a reemissão e não o grava', async () => {
    const m = await comCadastro();
    const reissue = jest.spyOn(m.freela, 'reissueRegistrationLink').mockResolvedValue({ userId: 'u-1', setupLink: LINK2, setupLinkExpiresAt: '2026-10-22T15:00:00.000Z' });
    const r = await m.svc.reemitir(c(), m.v.id, { reason: 'perdeu' }, AGORA);
    expect(r).toMatchObject({ setup_link: LINK2, reissue_count: 1 });
    expect(reissue).toHaveBeenCalledWith('fc-1', 'u-1', 'perdeu');
    expect((await m.svc.buscar(c(), m.v.id)).setup_link).toBeNull();
  });

  it('409 ALREADY_ACTIVATED do Freela: linha vira activated e depois nem chama mais', async () => {
    const m = await comCadastro();
    const reissue = jest.spyOn(m.freela, 'reissueRegistrationLink').mockRejectedValue(new FreelaHttpError(409, 'ativado', { code: 'ALREADY_ACTIVATED' }));
    expect(codigo(await falha(m.svc.reemitir(c(), m.v.id, {})))).toBe('ALREADY_ACTIVATED');
    expect((await m.svc.buscar(c(), m.v.id)).status).toBe('activated');
    expect(codigo(await falha(m.svc.reemitir(c(), m.v.id, {})))).toBe('ALREADY_ACTIVATED');
    expect(reissue).toHaveBeenCalledTimes(1);
  });

  it('RESET_LIMIT: 429 e a linha continua pending (não é rebaixada)', async () => {
    const m = await comCadastro();
    jest.spyOn(m.freela, 'reissueRegistrationLink').mockRejectedValue(new FreelaHttpError(429, 'limite', { code: 'RESET_LIMIT' }));
    const e = await falha(m.svc.reemitir(c(), m.v.id, {}));
    expect([e.getStatus(), codigo(e)]).toEqual([429, 'RESET_LIMIT']);
    expect((await m.svc.buscar(c(), m.v.id)).status).toBe('pending');
  });

  it('cadastro que nunca chegou ao Freela: 409 SIGNUP_NOT_CREATED', async () => {
    const m = montar();
    jest.spyOn(m.freela, 'createCompanyRegistration').mockRejectedValue(new Error('rede'));
    await falha(m.svc.criar(c(), VISITA_CLIENT, DTO, AGORA));
    const id = m.linhas[0]!.id;
    expect(codigo(await falha(m.svc.reemitir(c(), id, {})))).toBe('SIGNUP_NOT_CREATED');
  });
});

describe('CompanySignupService — nada de link, token ou dado inteiro persistido', () => {
  it('varre tudo o que foi gravado, logado e devolvido nas leituras', async () => {
    const m = montar();
    jest.spyOn(m.freela, 'createCompanyRegistration').mockResolvedValue(CRIADO);
    jest.spyOn(m.freela, 'reissueRegistrationLink').mockResolvedValue({ userId: 'u-1', setupLink: LINK2, setupLinkExpiresAt: '2026-10-22T15:00:00.000Z' });
    const v = await m.svc.criar(c(), VISITA_CLIENT, DTO, AGORA);
    await m.svc.reemitir(c(), v.id, {}, AGORA);
    // Erro cuja mensagem do Freela traz o link: precisa sair sanitizada de last_error.
    jest.spyOn(m.freela, 'reissueRegistrationLink').mockRejectedValue(new FreelaHttpError(500, `falhou em ${LINK}`));
    await falha(m.svc.reemitir(c(), v.id, {}, AGORA));

    const leituras = [await m.svc.buscar(c(), v.id), await m.svc.daVisitaComPrefill(c(), VISITA_CLIENT), await m.svc.listarDoConsultor(CONS, {})];
    const tudo = JSON.stringify({ gravado: m.gravado, linhas: m.linhas, logs, leituras });
    for (const proibido of ['TOKENSECRETO', 'OUTROTOKEN', 'primeiro-acesso', 'setupLink', '98765-4321', '987654321', 'marcos@padaria.com']) {
      expect(tudo).not.toContain(proibido);
    }
    expect(tudo).not.toMatch(/password|senha_|\"token\"/i);
    expect(m.linhas[0]!.last_error).toContain('[link removido]');
  });
});
