/**
 * Lote F2 (contrato §44.7): o lado da equipe do consultor em várias praças — o conjunto no cadastro (só admin), os relatórios
 * por praça (painel: consultores pelo conjunto, visitas e paradas só da praça; cadastros pela principal), a Atenção, a passagem
 * do mapa de calor, o casamento do cadastro confirmado (F7) e a praça do cadastro assistido pelo `:ref`. Com a flag desligada,
 * os `where` e as respostas de hoje.
 */
import { ValidationPipe } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { PracasDoConsultorService } from '../../../common/pracas/pracas-do-consultor.service';
import { CONFIG_PAINEL } from '../../../domain/painel-rules';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { A as CA, B as CB, FakeInputs, FakeRepo } from '../earnings/__tests__/fakes';
import { CadastrosDoDiaService } from '../painel/cadastros-do-dia.service';
import { PainelService } from '../painel/painel.service';
import type { CampoFreelaService } from '../campo-freela.service';
import { CompanySignupService } from '../company-signup.service';
import { ConsultoresService } from '../consultores.service';
import { PracasDoConsultorDto } from '../dto/consultores.dto';
import { HeatmapService } from '../heatmap.service';
import type { PhotoStorage } from '../photo-storage';
import { SignupSyncService } from '../signup-sync.service';

const PA = '00000000-0000-4000-8000-0000000000aa';
const PB = '00000000-0000-4000-8000-0000000000bb';
const PC = '00000000-0000-4000-8000-0000000000cc';
const CONS = '44444444-4444-4444-8444-444444444444';
const ADMIN: AuthUser = { id: '33333333-3333-4333-8333-333333333333', email: 'diego@praca.local', name: 'Diego', is_admin: true };
const AGORA = new Date('2026-10-21T15:00:00.000Z');
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const servico = (p: unknown, ligado: boolean) => new PracasDoConsultorService(p as PrismaService, ligado);
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e as { getStatus(): number; getResponse(): { code: string; message: string } });

describe('PracasDoConsultorService — os filtros (desligada = os de hoje, sem ler nada)', () => {
  it('ondeAtua e visitasNaPraca', () => {
    expect(servico({}, false).ondeAtua(PA)).toEqual({ praca_id: PA });
    expect(servico({}, false).visitasNaPraca(PA)).toEqual({});
    expect(servico({}, true).ondeAtua(PA)).toEqual({ OR: [{ praca_id: PA }, { extra_pracas: { some: { praca_id: PA } } }] });
    expect(servico({}, true).visitasNaPraca(PA)).toEqual({
      OR: [{ journey: { praca_id: PA } }, { journey: { praca_id: null }, consultant: { praca_id: PA } }],
    });
  });
  it('conjunto desligado = [principal] e nenhuma consulta', async () => {
    const p = { field_consultant_pracas: { findMany: jest.fn() } };
    expect(await servico(p, false).conjunto(CONS, PA)).toEqual([PA]);
    expect(await servico(p, false).conjuntos([{ id: CONS, praca_id: PA }])).toEqual(new Map());
    expect(p.field_consultant_pracas.findMany).not.toHaveBeenCalled();
  });
});

describe('PUT /v1/consultores/:id/pracas (§44.7)', () => {
  const LINHA = {
    id: CONS, name: 'Ana', email: 'ana@x', phone: '', cpf: '52998224725', praca_id: PA, praca: { name: 'Moema' }, pix_key: 'x', pix_key_type: 'cpf',
    must_change_password: false, active: true, freela_consultant_id: null, freela_code: null, freela_sync_error: null, freela_synced_at: null,
    visit_flow: null, created_by: ADMIN.id, created_at: AGORA, updated_at: AGORA,
  };
  function montar(ligado: boolean, atuais: string[] = []) {
    const links = new Set(atuais);
    const p = {
      field_consultants: { findUnique: jest.fn().mockResolvedValue(LINHA) },
      pracas: {
        count: jest.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((x) => [PA, PB, PC].includes(x)).length),
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.map((id) => ({ id, name: id === PA ? 'Moema' : id === PB ? 'Pinheiros' : 'Vila Mariana' })),
        ),
      },
      field_consultant_pracas: {
        findMany: jest.fn().mockImplementation(async () => [...links].map((praca_id) => ({ praca_id, consultant_id: CONS }))),
        deleteMany: jest.fn().mockImplementation(async ({ where }: { where: { praca_id: { in: string[] } } }) => where.praca_id.in.forEach((x) => links.delete(x))),
        createMany: jest.fn().mockImplementation(async ({ data }: { data: { praca_id: string }[] }) => data.forEach((d) => links.add(d.praca_id))),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const s = new ConsultoresService(
      p as unknown as PrismaService,
      {} as CampoFreelaService,
      {} as PhotoStorage,
      undefined,
      undefined,
      undefined,
      servico(p, ligado),
    );
    return { s, p, links };
  }
  const corpo = (b: unknown) => pipe.transform(b, { type: 'body', metatype: PracasDoConsultorDto }) as Promise<PracasDoConsultorDto>;

  it('desligada: 404 MULTI_PRACA_DISABLED e o ConsultorView sem chave nova', async () => {
    const { s, p } = montar(false);
    const e = await falha(async () => s.salvarPracas(CONS, await corpo({ praca_ids: [PA, PB] }), ADMIN));
    expect(e?.getStatus()).toBe(404);
    expect(e?.getResponse().code).toBe('MULTI_PRACA_DISABLED');
    expect(await s.get(CONS, ADMIN)).not.toHaveProperty('pracas');
    expect(p.field_consultant_pracas.findMany).not.toHaveBeenCalled();
  });

  it('grava só a diferença, com o autor, e devolve o conjunto (a principal primeiro)', async () => {
    const { s, p, links } = montar(true, [PC]);
    const v = await s.salvarPracas(CONS, await corpo({ praca_ids: [PB, PA] }), ADMIN);
    expect(p.field_consultant_pracas.deleteMany).toHaveBeenCalledWith({ where: { consultant_id: CONS, praca_id: { in: [PC] } } });
    expect(p.field_consultant_pracas.createMany).toHaveBeenCalledWith({ data: [{ consultant_id: CONS, praca_id: PB, created_by: ADMIN.id }], skipDuplicates: true });
    expect([...links]).toEqual([PB]);
    expect(v.pracas).toEqual([
      { id: PA, name: 'Moema', principal: true },
      { id: PB, name: 'Pinheiros', principal: false },
    ]);
    expect(v.praca_ids).toEqual([PA, PB]);
  });

  it('sem a principal = 400 com o nome dela; praça inexistente = 404; id malformado no corpo = 400 do pipe', async () => {
    const { s } = montar(true);
    const e = await falha(async () => s.salvarPracas(CONS, await corpo({ praca_ids: [PB] }), ADMIN));
    expect(e?.getResponse()).toEqual({ code: 'VALIDATION_ERROR', message: 'praca_ids: a praça principal (Moema) fica sempre no conjunto.' });
    const e2 = await falha(async () => s.salvarPracas(CONS, await corpo({ praca_ids: [PA, '00000000-0000-4000-8000-0000000000ff'] }), ADMIN));
    expect(e2?.getStatus()).toBe(404);
    await expect(corpo({ praca_ids: ['x'] })).rejects.toBeTruthy();
  });
});

describe('painel por praça (§44.7: relatórios da praça A sem dados da B)', () => {
  function montar(ligado: boolean) {
    const p = {
      pracas: { findUnique: jest.fn().mockResolvedValue({ id: PA }), findMany: jest.fn().mockResolvedValue([{ start_date: '2026-10-01' }]) },
      field_consultants: {
        findMany: jest.fn().mockResolvedValue([
          { id: CA, name: 'Ana', praca_id: PB, active: true }, // principal B, atua também em A
          { id: CB, name: 'Bruno', praca_id: PA, active: true },
        ]),
      },
      field_visits: { findMany: jest.fn().mockResolvedValue([]) },
      field_route_stops: { findMany: jest.fn().mockResolvedValue([]) },
      leads: { count: jest.fn().mockResolvedValue(0) },
    };
    const repo = new FakeRepo();
    const inputs = new FakeInputs();
    const dias = jest.spyOn(inputs, 'dias');
    const configs = { painel: async () => CONFIG_PAINEL.padrao, cadastro: async () => ({ confirmation_rule: 'activated' as const }) } as unknown as RotasConfigService;
    const cad = new CadastrosDoDiaService(repo, inputs, configs);
    const s = new PainelService(p as unknown as PrismaService, configs, cad, { ligado: false, intervaloMin: 10, janelaDias: 45 }, undefined, servico(p, ligado));
    return { s, p, dias };
  }
  it('ligada: consultores pelo conjunto, visitas e paradas só da praça, cadastros só de quem tem a praça como principal', async () => {
    const { s, p, dias } = montar(true);
    await s.painel({ praca_id: PA }, AGORA);
    expect(p.field_consultants.findMany.mock.calls[0][0].where).toEqual({ OR: [{ praca_id: PA }, { extra_pracas: { some: { praca_id: PA } } }] });
    expect(p.field_visits.findMany.mock.calls[0][0].where.AND).toEqual([
      { OR: [{ journey: { praca_id: PA } }, { journey: { praca_id: null }, consultant: { praca_id: PA } }] },
    ]);
    expect(p.field_route_stops.findMany.mock.calls[0][0].where.route).toMatchObject({ praca_id: PA });
    expect(dias.mock.calls[0]?.[0]).toEqual([CB]);
  });
  it('desligada: os where de hoje (sem AND nem praça na parada) e cadastros de todos os consultores do filtro', async () => {
    const { s, p, dias } = montar(false);
    await s.painel({ praca_id: PA }, AGORA);
    expect(p.field_consultants.findMany.mock.calls[0][0].where).toEqual({ praca_id: PA });
    expect(p.field_visits.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
    expect(p.field_route_stops.findMany.mock.calls[0][0].where.route).not.toHaveProperty('praca_id');
    expect(dias.mock.calls[0]?.[0]).toEqual([CA, CB]);
  });
});

describe('mapa de calor: passagem pela praça da JORNADA (§44.7)', () => {
  it('a camada passagem filtra COALESCE(jornada, principal); o filtro por consultor aceita o conjunto', async () => {
    const consultas: string[] = [];
    const p = {
      pracas: { findUnique: jest.fn().mockResolvedValue({ id: PA, lat: -23.6, lon: -46.6 }) },
      field_consultants: { findFirst: jest.fn().mockResolvedValue({ id: CONS }) },
      field_areas: { findFirst: jest.fn() },
      $queryRaw: jest.fn().mockImplementation(async (q: { strings?: string[]; sql?: string }) => {
        consultas.push(q.sql ?? (q.strings ?? []).join('?'));
        return [];
      }),
    };
    await new HeatmapService(p as unknown as PrismaService, servico(p, true)).heatmap({ praca_id: PA, layer: 'passagem', consultant_id: CONS } as never, AGORA);
    expect(p.field_consultants.findFirst.mock.calls[0][0].where).toEqual({ id: CONS, OR: [{ praca_id: PA }, { extra_pracas: { some: { praca_id: PA } } }] });
    expect(consultas.length).toBeGreaterThan(0);
    for (const c of consultas) expect(c).toContain('COALESCE(jn.praca_id, c.praca_id)');
  });
});

describe('cadastro confirmado (F7): o lead no conjunto, casamento único (§44.7)', () => {
  const procurar = async (ligado: boolean, extras: string[]) => {
    const p = { field_consultant_pracas: { findMany: jest.fn().mockResolvedValue(extras.map((praca_id) => ({ praca_id }))) } };
    const s = new SignupSyncService(p as unknown as PrismaService, {} as never, {} as never, servico(p, ligado));
    const conjunto = await servico(p, ligado).conjunto(CONS, PA);
    const tx = { leads: { findMany: jest.fn().mockResolvedValue([]) } };
    await (s as unknown as { leadsCandidatos: (t: unknown, c: string[], i: unknown) => Promise<string[]> }).leadsCandidatos(tx, conjunto, { phone: '31999990000', cnpj: null });
    return tx.leads.findMany.mock.calls[0][0];
  };
  it('desligada: só a principal (o where de hoje)', async () => {
    expect((await procurar(false, [PB])).where.praca_id).toBe(PA);
  });
  it('ligada: todas as praças do conjunto, ainda com take 2 (2 = ambíguo)', async () => {
    const a = await procurar(true, [PB]);
    expect(a.where.praca_id).toEqual({ in: [PA, PB] });
    expect(a.take).toBe(2);
  });
});

describe('cadastro assistido pelo :ref: a praça é a da jornada DA VISITA (§44.4)', () => {
  const ANA: CampoConsultant = { id: CONS, name: 'Ana', email: 'ana@x', praca_id: PA, must_change_password: false, praca_principal_id: PA };
  const montar = (ligado: boolean) => {
    const p = {
      field_visits: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'v1', client_id: 'c1', lead_id: 'l1', checkin_lat: 0, checkin_lng: 0, far_from_place: false, interlocutor_name: null,
          lead: { name: 'Café de B', phone: '', cnpj: null, address: 'Rua B', city: '', decisor: null },
          journey: { praca_id: PB },
        }),
      },
      field_company_signups: { findFirst: jest.fn().mockResolvedValue(null) },
      pracas: { findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({ cobertura_cidade: where.id === PB ? 'Contagem' : 'BH', cobertura_uf: 'MG' })) },
    };
    return { p, s: new CompanySignupService(p as unknown as PrismaService, {} as never, true, servico(p, ligado)) };
  };
  it('ligada: depois do end da jornada em B (praça ativa A), o pré-preenchimento usa a cidade de B', async () => {
    const { s } = montar(true);
    const r = await s.daVisitaComPrefill(ANA, '77777777-7777-4777-8777-777777777777');
    expect(r.prefill.city).toBe('Contagem');
  });
  it('desligada: a praça do request, como hoje', async () => {
    const { s } = montar(false);
    const r = await s.daVisitaComPrefill({ ...ANA, praca_principal_id: undefined }, '77777777-7777-4777-8777-777777777777');
    expect(r.prefill.city).toBe('BH');
  });
});
