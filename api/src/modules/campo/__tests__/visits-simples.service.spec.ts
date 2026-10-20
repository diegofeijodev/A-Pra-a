/**
 * Modo do chefe, S1 (contrato §31): o fluxo `simples` no VisitsService. O fluxo `completo` (e a flag
 * desligada) é provado pelos testes de `visits.service.spec.ts` e de caracterização, que não foram editados.
 */
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_MODO_PADRAO, PRESETS_MODO, type ConfigModo } from '../../../domain/modo-campo-rules';
import type { ModoCampoService } from '../../rotas/modo-campo.service';
import type { CheckinDto } from '../dto/campo.dto';
import type { JourneysService } from '../journeys.service';
import type { PhotoStorage } from '../photo-storage';
import type { PlacesService } from '../places.service';
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

function montar(p: ReturnType<typeof fakePrisma>, opts: { ligado?: boolean; cfg?: ConfigModo; fluxo?: 'simples' | 'completo' } = {}) {
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
  );
  return { s, modo, fotos };
}
const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;
const checkinDto = (over: Partial<CheckinDto> = {}): CheckinDto => ({ client_id: CLIENT, lead_id: LEAD, ...POS, ...over }) as CheckinDto;

describe('check-in grava o fluxo da visita (§31.2)', () => {
  it('flag desligada: ignora a dica e não toca na coluna (a visita nasce completo)', async () => {
    const p = fakePrisma();
    await montar(p, { ligado: false }).s.checkin(C, checkinDto({ flow: 'simples' }), JPEG, AGORA);
    expect(dataDo(p.field_visits.create)).not.toHaveProperty('flow');
  });
  it('flag ligada, sem dica: o fluxo resolvido no servidor', async () => {
    const p = fakePrisma();
    await montar(p, { fluxo: 'simples' }).s.checkin(C, checkinDto(), JPEG, AGORA);
    expect(dataDo(p.field_visits.create)).toMatchObject({ flow: 'simples' });
  });
  it('flag ligada, servidor diz completo: não grava flow', async () => {
    const p = fakePrisma();
    await montar(p, { fluxo: 'completo' }).s.checkin(C, checkinDto(), JPEG, AGORA);
    expect(dataDo(p.field_visits.create)).not.toHaveProperty('flow');
  });
  it('a dica do aparelho vale (fila offline enviada depois de a equipe trocar a chave)', async () => {
    const p = fakePrisma();
    await montar(p, { fluxo: 'completo' }).s.checkin(C, checkinDto({ flow: 'simples' }), JPEG, AGORA);
    expect(dataDo(p.field_visits.create)).toMatchObject({ flow: 'simples' });
  });
});

describe('rascunho do fluxo simples (§31.5)', () => {
  const salvar = async (visita: Record<string, unknown>, dto: Record<string, unknown>) => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, ...visita });
    await montar(p).s.saveAnswers(C, CLIENT, dto as never, AGORA);
    return dataDo(p.field_visits.update);
  };

  it('result em visita completo = 422 FLOW_MODE_MISMATCH, nada gravado', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, flow: 'completo' });
    await expect(montar(p).s.saveAnswers(C, CLIENT, { result: 'fechado' } as never, AGORA)).rejects.toMatchObject({
      status: 422,
      response: { code: 'FLOW_MODE_MISMATCH' },
    });
    expect(p.field_visits.update).not.toHaveBeenCalled();
  });
  it('rascunho do questionário completo manda result: null (estado inteiro da tela): aceito, nada de result gravado', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, flow: 'completo' });
    await montar(p).s.saveAnswers(C, CLIENT, { result: null, distance_note: null, interlocutor_name: 'Maria' } as never, AGORA);
    const d = dataDo(p.field_visits.update);
    expect(d).toMatchObject({ interlocutor_name: 'Maria' });
    expect(d).not.toHaveProperty('result');
  });
  it('as 8 perguntas antigas continuam aceitas no simples ("Mais detalhes") e são gravadas', async () => {
    const d = await salvar({}, { result: 'ja_usa', interlocutor_name: ' Marcos ', open_vagas: 2, vaga_roles: ['Garçom'], freelas_per_week: 3, channels: ['Nenhum'], notes: 'ok' });
    expect(d).toMatchObject({ interlocutor_name: 'Marcos', open_vagas: 2, vaga_roles: ['Garçom'], freelas_per_week: 3, channels: ['Nenhum'], notes: 'ok', result: 'ja_usa', freela_status: 'ja_usa' });
  });
  it('sem_interesse: deriva os campos antigos e PRESERVA o motivo (interesse "nenhum")', async () => {
    const d = await salvar({}, { result: 'sem_interesse', refusal_reason: 'preco' });
    expect(d).toMatchObject({ result: 'sem_interesse', outcome: 'conversa', freela_status: 'nao_cadastrou', interest: 'nenhum', needs_followup: false });
    expect(d.refusal_reason).toBe('preco');
  });
  it('sem_interesse com interesse "baixo" informado em Mais detalhes: o interesse vale e o motivo também', async () => {
    const d = await salvar({}, { result: 'sem_interesse', refusal_reason: 'sem_demanda', interest: 'baixo' });
    expect(d.interest).toBe('baixo');
    expect(d.refusal_reason).toBe('sem_demanda');
  });
  it('retorno: precisa de retorno, "Retornar" e interesse médio quando vazios; hora vale', async () => {
    const d = await salvar({}, { result: 'retorno', followup_date: '2026-10-21', followup_time: '15:30' });
    expect(d).toMatchObject({ needs_followup: true, followup_what: 'Retornar', interest: 'medio', freela_status: null, followup_time: '15:30' });
  });
  it('trocar o resultado para outro limpa o retorno que sobrou', async () => {
    const d = await salvar({ result: 'retorno', needs_followup: true, followup_date: '2026-10-21', followup_what: 'Retornar', followup_time: '15:30' }, { result: 'ja_usa' });
    expect(d).toMatchObject({ needs_followup: false, followup_date: null, followup_what: null, followup_time: null });
  });
  it('fechado: outcome fechado', async () => {
    expect(await salvar({}, { result: 'fechado' })).toMatchObject({ outcome: 'fechado', result: 'fechado' });
  });
  it('rascunho de Mais detalhes depois do resultado (sem result no corpo) re-deriva do resultado gravado', async () => {
    const d = await salvar({ result: 'cadastrou', freela_status: 'declarou' }, { notes: 'Gostou' });
    expect(d).toMatchObject({ freela_status: 'declarou', outcome: 'conversa', notes: 'Gostou' });
  });
  it('distance_note é aparada', async () => {
    expect((await salvar({}, { distance_note: '  Entrada pelos fundos ' })).distance_note).toBe('Entrada pelos fundos');
  });
});

describe('checkout do fluxo simples (§31.5)', () => {
  const sair = async (visita: Record<string, unknown>, opts: Parameters<typeof montar>[1] = {}) => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, ...visita });
    type Erro = { status: number; response: { code: string; message: string } };
    const r: { v?: unknown; e?: Erro } = await montar(p, opts).s.checkout(C, CLIENT, POS, AGORA).then(
      (v) => ({ v }),
      (e: unknown) => ({ e: e as Erro }),
    );
    return { p, ...r };
  };

  it('sem resultado: só "resultado da visita" falta (as 8 perguntas não)', async () => {
    const { e, p } = await sair({});
    expect(e).toMatchObject({ status: 422, response: { code: 'ANSWERS_INCOMPLETE', message: 'Falta responder: resultado da visita.' } });
    expect(p.field_visits.updateMany).not.toHaveBeenCalled();
  });
  it('fechado fotografado: conclui sem nada, evento "note", sem tocar no lead', async () => {
    const { p, e } = await sair({ result: 'fechado', outcome: 'fechado' });
    expect(e).toBeUndefined();
    expect(p.leads.update).not.toHaveBeenCalled();
    expect(dataDo(p.lead_events.create)).toMatchObject({ kind: 'note', stage_to: null, text: 'Visita de campo — estabelecimento fechado.' });
  });
  it('já usa o Freela sem digitar nada: conclui; lead 1 → 3 sem apagar atendente (não veio)', async () => {
    const { p, e } = await sair({ result: 'ja_usa', freela_status: 'ja_usa', needs_followup: false });
    expect(e).toBeUndefined();
    const lead = dataDo(p.leads.update);
    expect(lead).toMatchObject({ last_contact_at: new Date(POS.at), stage: 3, stage_since: '2026-10-20' });
    expect(lead).not.toHaveProperty('decisor');
    expect(lead).not.toHaveProperty('next_step_what');
    expect(dataDo(p.lead_events.create)).toMatchObject({ kind: 'visit', stage_to: 3 });
  });
  it('sem_interesse sem motivo: "Falta responder: motivo."', async () => {
    const { e } = await sair({ result: 'sem_interesse', outcome: 'conversa' });
    expect(e?.response.message).toBe('Falta responder: motivo.');
  });
  it('retorno: exige a data e o contato (padrão); com tudo, grava o próximo passo do lead', async () => {
    const falta = await sair({ result: 'retorno', needs_followup: true, followup_what: 'Retornar' });
    expect(falta.e?.response.message).toBe('Falta responder: quando voltar, nome de quem atendeu, cargo de quem atendeu, telefone de quem atendeu.');
    const ok = await sair({ result: 'retorno', needs_followup: true, followup_what: 'Retornar', followup_date: '2026-10-22', followup_time: '15:30', ...CONTATO });
    expect(ok.e).toBeUndefined();
    expect(dataDo(ok.p.leads.update)).toMatchObject({ decisor: 'Marcos', decisor_role: 'Dono', stage: 3, next_step_what: 'Retornar', next_step_date: '2026-10-22' });
    const texto = dataDo(ok.p.lead_events.create).text as string;
    expect(texto).toBe('Visita de campo — resultado: Quer retorno. atendeu: Marcos (Dono). Retorno: Retornar em 22/10/2026 às 15:30.');
    expect(texto).not.toContain('987654321');
  });
  it('cadastrou: não muda o estágio do lead; contato do padrão é exigido', async () => {
    const falta = await sair({ result: 'cadastrou', freela_status: 'declarou' });
    expect(falta.e?.response.message).toContain('nome de quem atendeu');
    const ok = await sair({ result: 'cadastrou', freela_status: 'declarou', ...CONTATO });
    expect(dataDo(ok.p.leads.update)).not.toHaveProperty('stage');
    expect(dataDo(ok.p.lead_events.create)).toMatchObject({ kind: 'visit', stage_to: null });
  });
  it('a configuração é lida na hora: contato vazio na config = conclui sem contato; perfil do chefe = exige em todo resultado', async () => {
    const livre = await sair({ result: 'cadastrou', freela_status: 'declarou' }, { cfg: { ...CONFIG_MODO_PADRAO, contato_obrigatorio_em: [] } });
    expect(livre.e).toBeUndefined();
    const chefe = await sair({ result: 'ja_usa' }, { cfg: PRESETS_MODO.chefe });
    expect(chefe.e?.response.message).toBe('Falta responder: nome de quem atendeu, cargo de quem atendeu, telefone de quem atendeu.');
  });
  it('longe do local: justificativa só é exigida se configurada como obrigatória', async () => {
    const opc = await sair({ result: 'fechado', outcome: 'fechado', far_from_place: true });
    expect(opc.e).toBeUndefined();
    const obr = await sair({ result: 'fechado', outcome: 'fechado', far_from_place: true }, { cfg: { ...CONFIG_MODO_PADRAO, justificativa_distancia: 'obrigatoria' } });
    expect(obr.e?.response.message).toBe('Falta responder: motivo de a visita ter sido longe do local.');
    const ok = await sair({ result: 'fechado', outcome: 'fechado', far_from_place: true, distance_note: 'Entrada pelos fundos' }, { cfg: { ...CONFIG_MODO_PADRAO, justificativa_distancia: 'obrigatoria' } });
    expect(ok.e).toBeUndefined();
  });
  it('o checkout segue o fluxo GRAVADO na visita, não a config de agora (visita simples com a chave virada para completo)', async () => {
    const { e } = await sair({ result: 'ja_usa' }, { fluxo: 'completo' });
    expect(e).toBeUndefined();
  });
  it('visita completo com a flag ligada continua exigindo as 8 perguntas', async () => {
    const { e } = await sair({ flow: 'completo' });
    expect(e?.response.message).toContain('nome de quem atendeu, cargo de quem atendeu, situação no Freela, interesse');
  });
});

describe('cancelar visita por engano (§31.7)', () => {
  const cancelar = async (visita: Record<string, unknown> | null, opts: Parameters<typeof montar>[1] = {}) => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(visita ? { ...VISITA, ...visita } : null);
    const m = montar(p, opts);
    const r: { v?: unknown; e?: { status: number; response: { code: string } } } = await m.s.cancel(C, CLIENT).then(
      (v) => ({ v }),
      (e: unknown) => ({ e: e as { status: number; response: { code: string } } }),
    );
    return { p, ...m, ...r };
  };
  it('flag desligada = 404 FLOW_SELECT_DISABLED, nada apagado', async () => {
    const { e, p } = await cancelar({}, { ligado: false });
    expect(e).toMatchObject({ status: 404, response: { code: 'FLOW_SELECT_DISABLED' } });
    expect(p.field_visits.deleteMany).not.toHaveBeenCalled();
  });
  it('visita simples aberta: apaga a visita, o ponto de check-in e a foto; a parada volta a pendente', async () => {
    const { v, p, fotos } = await cancelar({});
    expect(v).toEqual({ cancelled: true });
    expect(p.field_route_stops.updateMany).toHaveBeenCalledWith({ where: { visit_id: 'v1' }, data: { status: 'pendente', visit_id: null } });
    expect(p.field_points.deleteMany).toHaveBeenCalledWith({ where: { journey_id: 'j1', kind: 'checkin', at: VISITA.checkin_at } });
    expect(p.field_visits.deleteMany).toHaveBeenCalledWith({ where: { id: 'v1', checkout_at: null, auto_closed: false } });
    expect(fotos.remove).toHaveBeenCalledWith(VISITA.photo_key);
  });
  it('visita já encerrada = 409 VISIT_CLOSED; completo = 422; de outro consultor/inexistente = 404', async () => {
    expect((await cancelar({ checkout_at: new Date() })).e).toMatchObject({ status: 409, response: { code: 'VISIT_CLOSED' } });
    expect((await cancelar({ flow: 'completo' })).e).toMatchObject({ status: 422, response: { code: 'FLOW_MODE_MISMATCH' } });
    expect((await cancelar(null)).e).toMatchObject({ status: 404, response: { code: 'NOT_FOUND' } });
  });
});
