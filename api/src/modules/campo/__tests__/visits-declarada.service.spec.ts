/**
 * Modo do chefe, S3 (contrato §32.5): a declaração nasce DENTRO do checkout `simples` com result = cadastrou, só com a
 * flag ligada. Fora disso (flag desligada, fluxo completo, outros resultados) o checkout não toca no ganho declarado.
 */
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_MODO_PADRAO, PRESETS_MODO, type ConfigModo } from '../../../domain/modo-campo-rules';
import type { ModoCampoService } from '../../rotas/modo-campo.service';
import type { CheckinDto } from '../dto/campo.dto';
import type { JourneysService } from '../journeys.service';
import type { PhotoStorage } from '../photo-storage';
import type { PlacesService } from '../places.service';
import type { DeclaredSignupsService } from '../declared/declared-signups.service';
import { VisitsService } from '../visits.service';

const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const LEAD = '99999999-9999-4999-8999-999999999999';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const C: CampoConsultant = { id: CONS, name: 'Ana Souza', email: 'ana@exemplo.com', praca_id: PRACA, must_change_password: false };
const AGORA = new Date('2026-10-20T15:00:00.000Z');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const JORNADA = { id: 'j1', day: '2026-10-20', started_at: new Date('2026-10-20T12:00:00.000Z') };
const POS = { at: '2026-10-20T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };

const VAZIA = {
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
  result: null,
  distance_note: null,
};
const VISITA = {
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
  flow: 'simples',
  ...VAZIA,
  lead: { name: 'Bar do Mercado', possible_dup: false },
};
const CONTATO = { interlocutor_name: 'Marcos', interlocutor_role: 'dono', contact_phone: '11987654321' };

function fakePrisma() {
  const p = {
    $transaction: jest.fn(),
    field_visits: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(VISITA),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_points: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    field_route_stops: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    leads: {
      findFirst: jest.fn().mockResolvedValue({ id: LEAD, lat: null, lng: null }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: LEAD, stage: 1 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    lead_events: { create: jest.fn().mockResolvedValue({}) },
    pracas: { findUnique: jest.fn().mockResolvedValue({ cobertura_cidade: 'Belo Horizonte' }) },
  };
  p.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p)));
  return p;
}

function montar(p: ReturnType<typeof fakePrisma>, opts: { ligado?: boolean; cfg?: ConfigModo; fluxo?: 'simples' | 'completo'; declarada?: boolean | null } = {}) {
  const declared = {
    ligado: opts.declarada === true,
    preparar: jest.fn().mockResolvedValue({ declared_day: '2026-10-20', rule_version: 1 }),
    registrar: jest.fn().mockResolvedValue(true),
  };
  const modo = {
    ligado: opts.ligado ?? true,
    config: jest.fn().mockResolvedValue(opts.cfg ?? CONFIG_MODO_PADRAO),
    fluxoDoConsultor: jest.fn().mockResolvedValue(opts.fluxo ?? 'simples'),
  };
  const fotos = { put: jest.fn().mockResolvedValue(undefined), get: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };
  const s = new VisitsService(
    p as unknown as PrismaService,
    { abertaOuFalha: jest.fn().mockResolvedValue(JORNADA) } as unknown as JourneysService,
    { similar: jest.fn().mockResolvedValue([]) } as unknown as PlacesService,
    fotos as unknown as PhotoStorage,
    false,
    modo as unknown as ModoCampoService,
    opts.declarada === null ? undefined : (declared as unknown as DeclaredSignupsService),
  );
  return { s, modo, fotos, declared };
}
const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;
const checkinDto = (over: Partial<CheckinDto> = {}): CheckinDto => ({ client_id: CLIENT, lead_id: LEAD, ...POS, ...over }) as CheckinDto;


const sair = async (visita: Record<string, unknown>, opts: Parameters<typeof montar>[1] = {}) => {
  const p = fakePrisma();
  p.field_visits.findFirst.mockResolvedValue({ ...VISITA, ...visita });
  p.leads.findUniqueOrThrow.mockResolvedValue({ id: LEAD, stage: 1, name: 'Bar do Mercado' });
  const m = montar(p, opts);
  const v = await m.s.checkout(C, CLIENT, POS, AGORA);
  return { p, v, declared: m.declared };
};
const CADASTROU = { result: 'cadastrou', freela_status: 'declarou', ...CONTATO };

describe('checkout e a declaração (§32.5)', () => {
  it('flag ligada + simples + cadastrou: registra DENTRO da transação, com a hora do servidor e o client_id da visita', async () => {
    const { p, declared } = await sair(CADASTROU, { declarada: true });
    expect(declared.preparar).toHaveBeenCalledWith(AGORA);
    expect(declared.registrar).toHaveBeenCalledTimes(1);
    const arg = declared.registrar.mock.calls[0]![1] as Record<string, unknown>;
    expect(declared.registrar.mock.calls[0]![0]).toBe(p); // o tx do checkout
    expect(arg).toMatchObject({ consultant_id: CONS, visit_id: 'v1', client_id: CLIENT, flow: 'simples', agora: AGORA, lead: { id: LEAD, name: 'Bar do Mercado' } });
  });
  it('flag desligada: o checkout é o de antes e a declaração não é nem consultada', async () => {
    const { declared, p } = await sair(CADASTROU, { declarada: false });
    expect(declared.preparar).not.toHaveBeenCalled();
    expect(declared.registrar).not.toHaveBeenCalled();
    expect(p.field_visits.updateMany).toHaveBeenCalled();
  });
  it('sem o serviço injetado (módulo antigo): funciona', async () => {
    const { v } = await sair(CADASTROU, { declarada: null });
    expect(v).toBeDefined();
  });
  it.each([['ja_usa', { freela_status: 'ja_usa' }], ['sem_interesse', { refusal_reason: 'preco', interest: 'nenhum' }], ['fechado', { outcome: 'fechado' }]])(
    'resultado %s não declara',
    async (result, extra) => {
      const { declared } = await sair({ result, ...CONTATO, ...extra }, { declarada: true, cfg: { ...CONFIG_MODO_PADRAO, contato_obrigatorio_em: [] } });
      expect(declared.registrar).not.toHaveBeenCalled();
    },
  );
  it('visita do fluxo completo não declara, mesmo com a flag ligada', async () => {
    const { declared } = await sair({ flow: 'completo', ...VAZIA, interlocutor_name: 'Maria', interlocutor_role: 'dono', freela_status: 'cadastrou_qr', interest: 'alto', open_vagas: 0, vaga_roles: [], freelas_per_week: 1, channels: ['Nenhum'], needs_followup: false }, { declarada: true });
    expect(declared.registrar).not.toHaveBeenCalled();
  });
  it('checkout que perdeu a corrida (count 0) não declara nada', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, ...CADASTROU });
    p.field_visits.updateMany.mockResolvedValue({ count: 0 });
    const m = montar(p, { declarada: true });
    await m.s.checkout(C, CLIENT, POS, AGORA);
    expect(m.declared.registrar).not.toHaveBeenCalled();
  });
  it('cadastrou continua sem mudar o estágio do lead (a saída das rotas é pela declaração)', async () => {
    const { p } = await sair(CADASTROU, { declarada: true });
    expect(dataDo(p.leads.update)).not.toHaveProperty('stage');
  });
});
