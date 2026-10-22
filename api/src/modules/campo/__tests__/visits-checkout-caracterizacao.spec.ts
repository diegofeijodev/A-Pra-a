/**
 * Lote B da Lovable (L3 checklist, L4 intervalo) — testes de CARACTERIZAÇÃO do rascunho e do checkout dos DOIS fluxos.
 *
 * Congelam (em snapshot), ANTES de o lote B tocar no checkout, o que o servidor grava hoje para os corpos REAIS que o web atual
 * manda (lição da S1: o web do fluxo completo reenvia `answers` inteiro, com `result: null`; o simples manda `rascunhoSimples`,
 * sem `outcome`/`freela_status`/`needs_followup`). Os corpos passam pelo mesmo `ValidationPipe` global e depois pelo
 * `VisitsService` com as flags novas desligadas (construtor sem os parâmetros novos). Não editar para "fazer passar".
 */
import { ValidationPipe } from '@nestjs/common';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_MODO_PADRAO } from '../../../domain/modo-campo-rules';
import type { ModoCampoService } from '../../rotas/modo-campo.service';
import { AnswersDto, PosicaoDto } from '../dto/campo.dto';
import type { JourneysService } from '../journeys.service';
import type { PhotoStorage } from '../photo-storage';
import type { PlacesService } from '../places.service';
import { VisitsService } from '../visits.service';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const corpo = <T extends object>(metatype: new () => T, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype }) as Promise<T>;

const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const LEAD = '99999999-9999-4999-8999-999999999999';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const C: CampoConsultant = {
  id: CONS,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  praca_id: PRACA,
  must_change_password: false,
};
const AGORA = new Date('2026-10-20T15:00:00.000Z');
/** O corpo do checkout que o web manda (`lerPosicao()`): igual nos dois fluxos. */
const POS = { at: '2026-10-20T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };

/** `RESPOSTAS_VAZIAS` do web (`modules/campo/domain/questionario.ts`): o estado da tela antes de o servidor responder (sem `result`). */
const VAZIAS_WEB = {
  interlocutor_name: null,
  interlocutor_role: null,
  freela_status: null,
  interest: null,
  open_vagas: null,
  vaga_roles: [] as string[],
  freelas_per_week: null,
  channels: [] as string[],
  channel_other: null,
  needs_followup: null,
  followup_what: null,
  followup_date: null,
  notes: null,
  outcome: 'conversa',
  refusal_reason: null,
  refusal_note: null,
  followup_time: null,
  contact_phone: null,
};
/** `VisitView.answers` do servidor (o web do completo o reenvia inteiro, com os campos do modo do chefe nulos). */
const ANSWERS_SERVIDOR = { ...VAZIAS_WEB, result: null, distance_note: null };

const LINHA = {
  id: 'v1',
  client_id: CLIENT,
  journey_id: 'j1',
  consultant_id: CONS,
  lead_id: LEAD,
  checkin_at: new Date('2026-10-20T14:00:00.000Z'),
  checkin_lat: -19.9245,
  checkin_lng: -43.9352,
  checkin_accuracy: 10,
  distance_m: null,
  far_from_place: false,
  photo_key: `campo/${CONS}/2026-10-20/v1.jpg`,
  photo_bytes: 6,
  checkout_at: null as Date | null,
  checkout_lat: null,
  checkout_lng: null,
  auto_closed: false,
  clock_adjusted: false,
  ...ANSWERS_SERVIDOR,
  lead: { name: 'Bar do Mercado', possible_dup: false },
};

function fakePrisma(linha: Record<string, unknown>) {
  const p = {
    $transaction: jest.fn(),
    field_visits: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(linha),
      findUniqueOrThrow: jest.fn().mockResolvedValue(linha),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_points: { create: jest.fn().mockResolvedValue({}) },
    field_route_stops: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    leads: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: LEAD, stage: 1, name: 'Bar do Mercado' }),
      update: jest.fn().mockResolvedValue({}),
    },
    lead_events: { create: jest.fn().mockResolvedValue({}) },
  };
  p.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p),
  );
  return p;
}

/** Construtor de HOJE (sem nenhum parâmetro do lote B): é o que vale com as flags novas desligadas. */
function servico(p: ReturnType<typeof fakePrisma>, modoLigado: boolean) {
  const modo = {
    ligado: modoLigado,
    config: jest.fn().mockResolvedValue(CONFIG_MODO_PADRAO),
    fluxoDoConsultor: jest.fn().mockResolvedValue('simples'),
  };
  return new VisitsService(
    p as unknown as PrismaService,
    { abertaOuFalha: jest.fn() } as unknown as JourneysService,
    { similar: jest.fn() } as unknown as PlacesService,
    { put: jest.fn(), get: jest.fn(), remove: jest.fn() } as unknown as PhotoStorage,
    false,
    modo as unknown as ModoCampoService,
  );
}

const gravado = (p: ReturnType<typeof fakePrisma>) => ({
  update: p.field_visits.update.mock.calls.map((c) => c[0]),
  updateMany: p.field_visits.updateMany.mock.calls.map((c) => c[0]),
  // O `client_id` do ponto da trilha é um `randomUUID()` novo a cada chamada: fica marcado, não congelado.
  ponto: p.field_points.create.mock.calls.map((c) => {
    const a = c[0] as { data: Record<string, unknown> };
    return {
      ...a,
      data: { ...a.data, client_id: typeof a.data.client_id === 'string' ? '<uuid>' : a.data.client_id },
    };
  }),
  lead: p.leads.update.mock.calls.map((c) => c[0]),
  evento: p.lead_events.create.mock.calls.map((c) => c[0]),
});

/**
 * O DTO validado SEM as chaves `undefined`: a instância do `class-transformer` declara toda propriedade da classe (um campo novo opcional
 * apareceria como `undefined` sem mudar comportamento nenhum); o que importa é o que foi ACEITO e o que o serviço gravou.
 */
const aceito = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

async function rascunho(linha: Record<string, unknown>, body: unknown, modoLigado: boolean) {
  const dto = await corpo(AnswersDto, body);
  const p = fakePrisma(linha);
  const view = await servico(p, modoLigado).saveAnswers(C, CLIENT, dto, AGORA);
  return { dto: aceito(dto), gravado: gravado(p), missing: view.missing, chaves: Object.keys(view).sort() };
}

async function checkout(linha: Record<string, unknown>, modoLigado: boolean) {
  const dto = await corpo(PosicaoDto, POS);
  const p = fakePrisma(linha);
  const r = await servico(p, modoLigado)
    .checkout(C, CLIENT, dto, AGORA)
    .then(
      (v) => ({ ok: true, chaves: Object.keys(v).sort(), answers: Object.keys(v.answers).sort() }),
      (e: { status: number; response: unknown }) => ({ ok: false, status: e.status, response: e.response }),
    );
  return { r, gravado: gravado(p) };
}

// ── fluxo COMPLETO (VisitaTela reenvia o estado inteiro da tela) ──────────────

const COMPLETO_PREENCHIDO = {
  ...ANSWERS_SERVIDOR,
  interlocutor_name: 'Maria Check',
  interlocutor_role: 'dono',
  freela_status: 'cadastrou_qr',
  interest: 'alto',
  open_vagas: 2,
  vaga_roles: ['Garçom'],
  freelas_per_week: 5,
  channels: ['Grupos de WhatsApp'],
  needs_followup: true,
  followup_what: 'Voltar com proposta',
  followup_date: '2026-10-20',
};

describe('caracterização — rascunho do fluxo COMPLETO com o corpo real do web', () => {
  it.each([
    ['flag do modo desligada (produção antes do modo do chefe)', false],
    ['flag do modo ligada (produção hoje, visita completo)', true],
  ])('%s', async (_n, modoLigado) => {
    const linha = { ...LINHA, flow: 'completo' };
    expect(await rascunho(linha, VAZIAS_WEB, modoLigado)).toMatchSnapshot('vazio do aparelho (sem result)');
    expect(await rascunho(linha, ANSWERS_SERVIDOR, modoLigado)).toMatchSnapshot(
      'eco do servidor (result: null)',
    );
    expect(await rascunho(linha, COMPLETO_PREENCHIDO, modoLigado)).toMatchSnapshot('questionário preenchido');
  });
});

describe('caracterização — checkout do fluxo COMPLETO', () => {
  it.each([
    ['flag do modo desligada', false],
    ['flag do modo ligada', true],
  ])('%s', async (_n, modoLigado) => {
    expect(await checkout({ ...LINHA, flow: 'completo' }, modoLigado)).toMatchSnapshot(
      'questionário vazio → 422',
    );
    expect(
      await checkout({ ...LINHA, flow: 'completo', ...COMPLETO_PREENCHIDO }, modoLigado),
    ).toMatchSnapshot('preenchido → conclui');
    expect(await checkout({ ...LINHA, flow: 'completo', outcome: 'fechado' }, modoLigado)).toMatchSnapshot(
      'fechado → note',
    );
  });
});

// ── fluxo SIMPLES (ResultadoTela manda `rascunhoSimples(r)`) ──────────────

/** `rascunhoSimples` do web: tira os campos que o servidor deriva. */
const rascunhoSimples = (a: Record<string, unknown>) => {
  const c = { ...a };
  delete c.outcome;
  delete c.freela_status;
  delete c.needs_followup;
  return c;
};

describe('caracterização — rascunho do fluxo SIMPLES com o corpo real do web (produção hoje: flag do modo ligada)', () => {
  const linha = { ...LINHA, flow: 'simples' };
  it('1 toque: só o resultado (a partir do vazio do aparelho e do eco do servidor)', async () => {
    expect(await rascunho(linha, rascunhoSimples({ ...VAZIAS_WEB, result: 'ja_usa' }), true)).toMatchSnapshot(
      'já usa, do vazio',
    );
    expect(
      await rascunho(linha, rascunhoSimples({ ...ANSWERS_SERVIDOR, result: 'fechado' }), true),
    ).toMatchSnapshot('fechado, do eco');
  });
  it('sem interesse com motivo; quer retorno com dia, hora e contato', async () => {
    expect(
      await rascunho(
        linha,
        rascunhoSimples({ ...ANSWERS_SERVIDOR, result: 'sem_interesse', refusal_reason: 'preco' }),
        true,
      ),
    ).toMatchSnapshot('sem interesse');
    expect(
      await rascunho(
        linha,
        rascunhoSimples({
          ...ANSWERS_SERVIDOR,
          result: 'retorno',
          followup_date: '2026-10-21',
          followup_time: '09:00',
          interlocutor_name: 'Rui',
          interlocutor_role: 'gerente',
          contact_phone: '(31) 98888-7777',
        }),
        true,
      ),
    ).toMatchSnapshot('quer retorno');
  });
  it('eco do servidor depois da derivação (interest/followup_what derivados voltam no corpo)', async () => {
    const derivada = {
      ...linha,
      result: 'retorno',
      outcome: 'conversa',
      needs_followup: true,
      interest: 'medio',
      followup_what: 'Retornar',
      followup_date: '2026-10-21',
    };
    expect(
      await rascunho(
        derivada,
        rascunhoSimples({
          ...ANSWERS_SERVIDOR,
          result: 'retorno',
          interest: 'medio',
          followup_what: 'Retornar',
          followup_date: '2026-10-21',
          notes: 'Volta amanhã',
        }),
        true,
      ),
    ).toMatchSnapshot();
  });
});

describe('caracterização — checkout do fluxo SIMPLES', () => {
  const linha = { ...LINHA, flow: 'simples' };
  it('sem resultado → 422; já usa → conclui; fechado → note; sem interesse sem motivo → 422; com motivo → conclui', async () => {
    expect(await checkout(linha, true)).toMatchSnapshot('sem resultado');
    expect(
      await checkout({ ...linha, result: 'ja_usa', freela_status: 'ja_usa', needs_followup: false }, true),
    ).toMatchSnapshot('já usa');
    expect(
      await checkout({ ...linha, result: 'fechado', outcome: 'fechado', needs_followup: false }, true),
    ).toMatchSnapshot('fechado');
    expect(
      await checkout(
        {
          ...linha,
          result: 'sem_interesse',
          freela_status: 'nao_cadastrou',
          interest: 'nenhum',
          needs_followup: false,
        },
        true,
      ),
    ).toMatchSnapshot('sem motivo');
    expect(
      await checkout(
        {
          ...linha,
          result: 'sem_interesse',
          freela_status: 'nao_cadastrou',
          interest: 'nenhum',
          needs_followup: false,
          refusal_reason: 'preco',
        },
        true,
      ),
    ).toMatchSnapshot('com motivo');
  });
  it('quer retorno: sem contato → 422 (padrão); com contato → próximo passo no lead', async () => {
    const retorno = {
      ...linha,
      result: 'retorno',
      needs_followup: true,
      interest: 'medio',
      followup_what: 'Retornar',
      followup_date: '2026-10-21',
      followup_time: '09:00',
    };
    expect(await checkout(retorno, true)).toMatchSnapshot('sem contato');
    expect(
      await checkout(
        { ...retorno, interlocutor_name: 'Rui', interlocutor_role: 'gerente', contact_phone: '31988887777' },
        true,
      ),
    ).toMatchSnapshot('com contato');
  });
});
