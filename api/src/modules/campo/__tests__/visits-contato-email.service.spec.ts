/**
 * Lote E da Lovable, L9c (contrato §41.4): e-mail de quem atendeu no VisitsService, com os corpos REAIS que o web manda (lição da S1:
 * o completo reenvia `answers` inteiro; o simples manda `rascunhoSimples`), nos DOIS fluxos, com a flag desligada e ligada — e com
 * `contact_email` nulo e ausente. O comportamento de hoje está congelado em `visits-checkout-caracterizacao.spec.ts` (intocado).
 */
import { ValidationPipe } from '@nestjs/common';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { LOVABLE_E_DESLIGADAS, type FlagsLovableE } from '../../../common/flags/lovable-e.flags';
import { CONFIG_MODO_PADRAO, type ConfigModo } from '../../../domain/modo-campo-rules';
import type { ModoCampoService } from '../../rotas/modo-campo.service';
import { AnswersDto } from '../dto/campo.dto';
import type { JourneysService } from '../journeys.service';
import type { PhotoStorage } from '../photo-storage';
import type { PlacesService } from '../places.service';
import { VisitsService } from '../visits.service';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const corpo = (body: unknown) => pipe.transform(body, { type: 'body', metatype: AnswersDto }) as Promise<AnswersDto>;

const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const LEAD = '99999999-9999-4999-8999-999999999999';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const C: CampoConsultant = { id: CONS, name: 'Ana Souza', email: 'ana@exemplo.com', praca_id: PRACA, must_change_password: false };
const AGORA = new Date('2026-10-20T15:00:00.000Z');
const POS = { at: '2026-10-20T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };

/** `RESPOSTAS_VAZIAS` do web de hoje (sem `contact_email`). */
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
const ANSWERS_SERVIDOR = { ...VAZIAS_WEB, result: null, distance_note: null };
/** `rascunhoSimples` do web: tira os campos que o servidor deriva. */
const rascunhoSimples = (a: Record<string, unknown>) => {
  const c = { ...a };
  delete c.outcome;
  delete c.freela_status;
  delete c.needs_followup;
  return c;
};

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
  checklist: null,
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
  p.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p)));
  return p;
}

function servico(p: ReturnType<typeof fakePrisma>, email: boolean, cfg: ConfigModo = CONFIG_MODO_PADRAO) {
  const modo = { ligado: true, config: jest.fn().mockResolvedValue(cfg), fluxoDoConsultor: jest.fn().mockResolvedValue('simples') };
  const flags: FlagsLovableE = { ...LOVABLE_E_DESLIGADAS, contact_email: email };
  return new VisitsService(
    p as unknown as PrismaService,
    { abertaOuFalha: jest.fn() } as unknown as JourneysService,
    { similar: jest.fn() } as unknown as PlacesService,
    { put: jest.fn(), get: jest.fn(), remove: jest.fn() } as unknown as PhotoStorage,
    false,
    modo as unknown as ModoCampoService,
    undefined,
    undefined,
    undefined,
    flags,
  );
}
const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

const CORPOS: [string, 'completo' | 'simples', Record<string, unknown>][] = [
  ['completo: vazio do aparelho, sem contact_email', 'completo', VAZIAS_WEB],
  ['completo: eco do servidor, sem contact_email', 'completo', ANSWERS_SERVIDOR],
  ['completo: eco do servidor com contact_email null (o web novo)', 'completo', { ...ANSWERS_SERVIDOR, contact_email: null }],
  ['simples: rascunho sem contact_email', 'simples', rascunhoSimples({ ...VAZIAS_WEB, result: 'ja_usa' })],
  ['simples: rascunho com contact_email null', 'simples', rascunhoSimples({ ...ANSWERS_SERVIDOR, result: 'retorno', followup_date: '2026-10-21', contact_email: null })],
];

describe('flag DESLIGADA (produção hoje): os corpos reais passam iguais e nada novo é gravado ou mostrado', () => {
  it.each(CORPOS)('%s', async (_n, flow, body) => {
    const p = fakePrisma({ ...LINHA, flow });
    const v = await servico(p, false).saveAnswers(C, CLIENT, await corpo(body), AGORA);
    expect(dataDo(p.field_visits.update)).not.toHaveProperty('contact_email');
    expect(v.answers).not.toHaveProperty('contact_email');
  });
  it('contact_email não nulo = 422 CONTACT_EMAIL_DISABLED, sem gravar nada (nos dois fluxos)', async () => {
    for (const flow of ['completo', 'simples'] as const) {
      const p = fakePrisma({ ...LINHA, flow });
      await expect(servico(p, false).saveAnswers(C, CLIENT, await corpo({ ...ANSWERS_SERVIDOR, contact_email: 'maria@padaria.com' }), AGORA)).rejects.toMatchObject({
        status: 422,
        response: { code: 'CONTACT_EMAIL_DISABLED' },
      });
      expect(p.field_visits.update).not.toHaveBeenCalled();
    }
  });
  it('checkout do simples com contato exigido: e-mail nunca é cobrado', async () => {
    const linha = { ...LINHA, flow: 'simples', result: 'cadastrou', freela_status: 'cadastrou_qr', needs_followup: false, interlocutor_name: 'Maria', interlocutor_role: 'dono', contact_phone: '31988887777' };
    const p = fakePrisma(linha);
    // Mesmo com `email` na lista (gravado com a flag ligada e lido agora pelo serviço, que o tira): o modo entrega a lista sem ele.
    await expect(servico(p, false, { ...CONFIG_MODO_PADRAO, contato_campos: ['nome', 'cargo', 'telefone'] }).checkout(C, CLIENT, POS, AGORA)).resolves.toBeDefined();
  });
});

describe('flag LIGADA', () => {
  it.each(CORPOS)('%s: aceito; o eco traz contact_email explícito (null)', async (_n, flow, body) => {
    const p = fakePrisma({ ...LINHA, flow });
    const v = await servico(p, true).saveAnswers(C, CLIENT, await corpo(body), AGORA);
    // `null` grava null (limpar) e ausente não mexe; em nenhum dos dois o 422 aparece.
    if ('contact_email' in body) expect(dataDo(p.field_visits.update).contact_email).toBeNull();
    else expect(dataDo(p.field_visits.update)).not.toHaveProperty('contact_email');
    expect(v.answers.contact_email).toBeNull();
  });
  it('grava aparado e minúsculo; "" = null', async () => {
    const p = fakePrisma({ ...LINHA, flow: 'simples' });
    await servico(p, true).saveAnswers(C, CLIENT, await corpo({ contact_email: '  Maria@Padaria.COM ' }), AGORA);
    expect(dataDo(p.field_visits.update).contact_email).toBe('maria@padaria.com');
    const p2 = fakePrisma({ ...LINHA, flow: 'completo' });
    await servico(p2, true).saveAnswers(C, CLIENT, await corpo({ ...ANSWERS_SERVIDOR, contact_email: '' }), AGORA);
    expect(dataDo(p2.field_visits.update).contact_email).toBeNull();
  });
  it('inválido = 400 VALIDATION_ERROR sem repetir o valor; nada gravado', async () => {
    const p = fakePrisma({ ...LINHA, flow: 'simples' });
    const e = await servico(p, true)
      .saveAnswers(C, CLIENT, await corpo({ contact_email: 'maria-sem-arroba.com' }), AGORA)
      .then(() => null, (x: { status: number; response: { code: string; message: string } }) => x);
    expect(e).toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
    expect(JSON.stringify(e?.response)).not.toContain('maria-sem-arroba');
    expect(p.field_visits.update).not.toHaveBeenCalled();
  });
  it('no DTO, mais de 160 caracteres = 400 do pipe; 121–160 = 400 do serviço', async () => {
    await expect(corpo({ contact_email: `${'a'.repeat(160)}@x.com` })).rejects.toBeDefined();
    const p = fakePrisma({ ...LINHA, flow: 'simples' });
    await expect(servico(p, true).saveAnswers(C, CLIENT, await corpo({ contact_email: `${'a'.repeat(118)}@x.com` }), AGORA)).rejects.toMatchObject({ status: 400 });
  });
  it('a visita gravada mostra o e-mail ao consultor dono; o evento do CRM nunca o leva', async () => {
    const linha = {
      ...LINHA,
      flow: 'simples',
      result: 'ja_usa',
      freela_status: 'ja_usa',
      needs_followup: false,
      interlocutor_name: 'Maria',
      contact_email: 'maria@padaria.com',
    };
    const p = fakePrisma(linha);
    const v = await servico(p, true).checkout(C, CLIENT, POS, AGORA);
    expect(v.answers.contact_email).toBe('maria@padaria.com');
    expect(JSON.stringify(p.lead_events.create.mock.calls)).not.toContain('maria@padaria.com');
    expect(JSON.stringify(p.leads.update.mock.calls)).not.toContain('maria@padaria.com');
  });
  it('com email em contato_campos e o e-mail GRAVADO na visita, o checkout conclui', async () => {
    const cfg = { ...CONFIG_MODO_PADRAO, contato_campos: ['email' as const] };
    const linha = { ...LINHA, flow: 'simples', result: 'cadastrou', freela_status: 'cadastrou_qr', needs_followup: false, contact_email: 'm@p.com' };
    const p = fakePrisma(linha);
    await expect(servico(p, true, cfg).checkout(C, CLIENT, POS, AGORA)).resolves.toMatchObject({ answers: { contact_email: 'm@p.com' } });
    expect(p.field_visits.updateMany).toHaveBeenCalled();
  });
  it('com email em contato_campos e o resultado exigindo contato, o checkout pede o e-mail', async () => {
    const cfg = { ...CONFIG_MODO_PADRAO, contato_campos: ['email' as const] };
    const linha = { ...LINHA, flow: 'simples', result: 'cadastrou', freela_status: 'cadastrou_qr', needs_followup: false };
    const p = fakePrisma(linha);
    await expect(servico(p, true, cfg).checkout(C, CLIENT, POS, AGORA)).rejects.toMatchObject({
      status: 422,
      response: { code: 'ANSWERS_INCOMPLETE', message: 'Falta responder: e-mail de quem atendeu.' },
    });
  });
});
