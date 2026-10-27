/**
 * Redesenho E6 (arquitetura §4.5/§4.6, contrato §39.4/§39.5): filtro "Perfil dos clientes" na prévia e na criação do plano geral.
 * Ausente/`null`/`[]` = a consulta de hoje (o `where` é comparado INTEIRO); com `types`, o mesmo `where` + `place_candidates.some`;
 * lista branca pelos segmentos (com a flag) ou pelos 5 tipos; combinações recusadas antes de ler estabelecimentos; foto no plano.
 */
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { caixaEnvolvente } from '../../../domain/campo-rules';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import { PlanosService } from '../planos/planos.service';
import type { RotasConfigService } from '../rotas-config.service';
import type { RotasEquipeService } from '../rotas-equipe.service';
import { AGORA, DIA, LEAD, PRACA } from './fixtures';

const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };
const PLANO = '88888888-8888-4888-8888-888888888888';
const AREA_ROW = { id: '00000000-0000-4000-8000-0000000000cc', name: 'Centro', praca_id: PRACA, lat: -19.92, lng: -43.94, radius_m: 3000, active: true };
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);
const resposta = (e: unknown) => (e as { getResponse: () => { code: string; message: string } }).getResponse();
const status = (e: unknown) => (e as { getStatus: () => number }).getStatus();
/** Grade apertada (≤ ~700 m do centro): todos caem dentro da área de 3 km, então a contagem é a do mock. */
const leadGeo = (n: number) => ({ id: LEAD(n), lat: -19.92 + (n % 10) * 0.0005, lng: -43.94 + Math.floor(n / 10) * 0.0005 });
const comNome = (ns: number[]) => ns.map((n) => ({ ...leadGeo(n), name: `Bar ${n}`, address: `Rua ${n}, 10 - Savassi` }));

/** O `where` que o plano geral mandou ao Prisma ANTES do E6 (área única, sem shoppings): a prova de "ausente = hoje". */
const b = caixaEnvolvente(AREA_ROW, AREA_ROW.radius_m);
const WHERE_DE_HOJE = {
  praca_id: PRACA,
  archived: false,
  is_test: false,
  stage: { lte: CONFIG_ROTA_PADRAO.estagio_maximo_rota },
  declared_signups: { none: { void: null } },
  location_precision: { in: ['point', 'address'] },
  OR: [{ lat: { gte: b.latMin, lte: b.latMax }, lng: { gte: b.lngMin, lte: b.lngMax } }],
  route_stops: { none: { day: { gte: DIA }, status: { in: ['pendente', 'visitada', 'adiada'] } } },
};

function fake(placeSegments: unknown = null) {
  const planos: Record<string, unknown>[] = [];
  const itens: Record<string, unknown>[] = [];
  return {
    planos,
    itens,
    app_settings: {
      findUnique: jest.fn().mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
        select.place_segments ? { place_segments: placeSegments } : { field_config: {} },
      ),
      upsert: jest.fn(),
    },
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA, lat: -19.92, lon: -43.94 }) },
    field_areas: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([AREA_ROW]),
      count: jest.fn().mockResolvedValue(1),
    },
    leads: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    field_route_plans: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const p = { id: PLANO, archived_at: null, archived_by: null, ...data };
        planos.push(p);
        return p;
      }),
      findUnique: jest.fn().mockImplementation(async () => ({ ...planos[0], items: itens.map((i, k) => ({ ...i, id: `i${k}`, consultant: null, assigned_at: null })) })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    field_route_plan_items: {
      createMany: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown>[] }) => {
        itens.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: jest.fn(),
  };
}

function montar(p: ReturnType<typeof fake>, opts: { route_plans?: boolean; malls?: boolean; segments?: boolean } = {}) {
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(p));
  const configs = { config: jest.fn().mockResolvedValue(CONFIG_ROTA_PADRAO) } as unknown as RotasConfigService;
  const flagsD = { route_plans: opts.route_plans ?? true, malls: opts.malls ?? false };
  const flagsC = { segments: opts.segments ?? false, vouchers: false, voucher_coupons: false };
  return new PlanosService(p as unknown as PrismaService, configs, {} as RotasEquipeService, flagsD, undefined, undefined, flagsC);
}

/** Chamou a leitura da lista de segmentos? (só deve acontecer com `types` E a flag dos segmentos.) */
const leuSegmentos = (p: ReturnType<typeof fake>) => p.app_settings.findUnique.mock.calls.some(([a]) => (a as { select: Record<string, boolean> }).select.place_segments);

describe('ausente = hoje (caracterização do argumento do Prisma)', () => {
  it.each([['ausente', undefined], ['null', null], ['[]', [] as string[]]])('criar com types %s: o where é IDÊNTICO ao de hoje e a foto não ganha chave', async (_, types) => {
    const p = fake();
    p.leads.findMany.mockResolvedValueOnce([leadGeo(1), leadGeo(2)]).mockResolvedValue([]);
    const v = await montar(p, { segments: true }).criar({ praca_id: PRACA, ...(types !== undefined ? { types } : {}) }, ADMIN, AGORA);
    expect(p.leads.findMany.mock.calls[0][0].where).toEqual(WHERE_DE_HOJE);
    expect(p.planos[0]!.params_snapshot).not.toHaveProperty('types');
    expect(v.types).toBeNull();
    expect(leuSegmentos(p)).toBe(false);
  });

  it('prévia sem types: uma consulta só, a conta de sempre e lead_count_total = lead_count', async () => {
    const p = fake();
    p.leads.findMany.mockResolvedValue(Array.from({ length: 41 }, (_, n) => leadGeo(n + 1)));
    const r = await montar(p).previa({ praca_id: PRACA, por_rota: 20 }, AGORA);
    expect(p.leads.findMany).toHaveBeenCalledTimes(1);
    expect(p.leads.findMany.mock.calls[0][0].where).toEqual(WHERE_DE_HOJE);
    expect(r).toEqual({
      lead_count: 41,
      lead_count_total: 41,
      truncated: false,
      por_rota: 20,
      rotas_min: 3,
      conta: '41 estabelecimentos com localização exata, fora de roteiro publicado → pelo menos 3 rotas de até 20 paradas (41 ÷ 20 = 2,1; arredonda para cima; o teto de tempo pode criar mais)',
    });
    expect(await montar(fake()).previa({ praca_id: PRACA, types: ' , ' }, AGORA)).toMatchObject({ lead_count: 0, lead_count_total: 0 });
  });

  it('prévia sem área ativa: a mensagem de sempre, com lead_count_total 0', async () => {
    const p = fake();
    p.field_areas.count.mockResolvedValue(0);
    const r = await montar(p).previa({ praca_id: PRACA, types: 'bar' }, AGORA);
    expect(r).toMatchObject({ lead_count: 0, lead_count_total: 0, conta: 'Nenhuma área de atuação ativa nesta praça. Cadastre uma em Configurações para dividir em rotas.' });
    expect(p.leads.findMany).not.toHaveBeenCalled();
  });
});

describe('com types', () => {
  it('criar: o mesmo where + place_candidates.some (e nada mais); a foto e o PlanSummary levam os rótulos na ordem canônica', async () => {
    const p = fake();
    p.leads.findMany.mockResolvedValueOnce([leadGeo(1), leadGeo(2)]).mockResolvedValue(comNome([1, 2]));
    const v = await montar(p).criar({ praca_id: PRACA, types: ['restaurante', 'bar', 'bar'] }, ADMIN, AGORA);
    expect(p.leads.findMany.mock.calls[0][0].where).toEqual({ ...WHERE_DE_HOJE, place_candidates: { some: { category: { in: ['bar', 'restaurante'] } } } });
    const foto = p.planos[0]!.params_snapshot as Record<string, unknown>;
    expect(foto.types).toEqual([
      { slug: 'bar', label: 'Bar' },
      { slug: 'restaurante', label: 'Restaurante' },
    ]);
    // A foto da divisão continua inteira (o CONFIG_DIVISAO.ler do get ignora a chave nova).
    expect(foto).toMatchObject({ por_rota: 20, modelo_tempo: 'lovable', travel_mode: 'carro' });
    expect(v.types).toEqual([
      { slug: 'bar', label: 'Bar' },
      { slug: 'restaurante', label: 'Restaurante' },
    ]);
    expect(v.items[0]!.conta_lovable.texto).toMatch(/^2 × 20 min \+ 1 h de intervalo/);
  });

  it('nenhum com o perfil = 422 PLAN_NO_LEADS dizendo qual', async () => {
    const e = await falha(() => montar(fake()).criar({ praca_id: PRACA, types: ['bar', 'restaurante'] }, ADMIN, AGORA));
    expect(status(e)).toBe(422);
    expect(resposta(e)).toEqual({
      code: 'PLAN_NO_LEADS',
      message: 'Nenhum estabelecimento com o perfil Bar ou Restaurante, com localização exata e fora de roteiro publicado nesta área.',
    });
  });

  it('combinações e lista branca: 400 VALIDATION_ERROR ANTES de ler qualquer estabelecimento', async () => {
    const casos: [Record<string, unknown>, string, { malls?: boolean }][] = [
      [{ types: ['bar'], lead_ids: [LEAD(1)] }, 'types: escolha os estabelecimentos ou o perfil, não os dois.', {}],
      [{ types: ['bar'], kind: 'shoppings' }, 'types: o perfil vale só para a rota geral.', { malls: true }],
      [{ types: ['bar'], kind: 'shopping_interno', parent_lead_id: LEAD(9) }, 'types: o perfil vale só para a rota geral.', { malls: true }],
      [{ types: ['pizzaria'] }, "types: 'pizzaria' não é um perfil de cliente.", {}],
    ];
    for (const [corpo, msg, flags] of casos) {
      const p = fake();
      const e = await falha(() => montar(p, flags).criar({ praca_id: PRACA, ...corpo }, ADMIN, AGORA));
      expect([status(e), resposta(e)]).toEqual([400, { code: 'VALIDATION_ERROR', message: msg }]);
      expect(p.leads.findMany).not.toHaveBeenCalled();
      expect(p.leads.findFirst).not.toHaveBeenCalled();
    }
  });

  it('types [] com lead_ids = sem perfil (nada recusado); shoppings desligados seguem 404 MALLS_DISABLED antes do 400', async () => {
    const p = fake();
    p.leads.findMany.mockResolvedValue([{ ...leadGeo(1), praca_id: PRACA, archived: false, name: 'Bar 1', address: '' }]);
    await expect(montar(p).criar({ praca_id: PRACA, lead_ids: [LEAD(1)], types: [] }, ADMIN, AGORA)).resolves.toMatchObject({ types: null });
    const e = await falha(() => montar(fake()).criar({ praca_id: PRACA, kind: 'shoppings', types: ['bar'] }, ADMIN, AGORA));
    expect([status(e), resposta(e).code]).toEqual([404, 'MALLS_DISABLED']);
  });

  it('prévia: filtrado primeiro, total depois; lead_count/rotas_min sobre o perfil e a conta com as duas partes', async () => {
    const p = fake();
    p.leads.findMany
      .mockResolvedValueOnce(Array.from({ length: 38 }, (_, n) => leadGeo(n + 1)))
      .mockResolvedValueOnce(Array.from({ length: 120 }, (_, n) => leadGeo(n + 1)));
    const r = await montar(p).previa({ praca_id: PRACA, por_rota: 20, types: 'restaurante, bar' }, AGORA);
    expect(p.leads.findMany).toHaveBeenCalledTimes(2);
    expect(p.leads.findMany.mock.calls[0][0].where).toEqual({ ...WHERE_DE_HOJE, place_candidates: { some: { category: { in: ['bar', 'restaurante'] } } } });
    expect(p.leads.findMany.mock.calls[1][0].where).toEqual(WHERE_DE_HOJE);
    expect(r).toMatchObject({ lead_count: 38, lead_count_total: 120, rotas_min: 2, truncated: false });
    expect(r.conta).toBe(
      '38 estabelecimentos com localização exata, fora de roteiro publicado → pelo menos 2 rotas de até 20 paradas (38 ÷ 20 = 1,9; arredonda para cima; o teto de tempo pode criar mais). ' +
        '38 dos 120 estabelecimentos elegíveis têm o perfil Bar ou Restaurante. Os outros 82 são de outro perfil ou não têm perfil (cadastrados à mão, importados ou abertos na visita).',
    );
  });

  it('prévia: nenhum do perfil começa por "Nenhum estabelecimento com o perfil…" e diz quantos elegíveis há; nenhum elegível = a mensagem de sempre', async () => {
    const p = fake();
    p.leads.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([leadGeo(1), leadGeo(2)]);
    const r = await montar(p).previa({ praca_id: PRACA, types: 'bar' }, AGORA);
    expect(r).toMatchObject({ lead_count: 0, lead_count_total: 2, rotas_min: 0 });
    expect(r.conta).toBe(
      'Nenhum estabelecimento com o perfil Bar, com localização exata e fora de roteiro publicado nesta área. Os 2 estabelecimentos elegíveis são de outro perfil ou não têm perfil (cadastrados à mão, importados ou abertos na visita).',
    );
    const q = fake();
    const r2 = await montar(q).previa({ praca_id: PRACA, types: 'bar' }, AGORA);
    expect(r2.conta).toBe('Nenhum estabelecimento com localização exata e fora de roteiro publicado nesta área.');
  });

  it('prévia: slug desconhecido = 400 antes de ler estabelecimentos', async () => {
    const p = fake();
    const e = await falha(() => montar(p).previa({ praca_id: PRACA, types: 'bar,nao_existe' }, AGORA));
    expect([status(e), resposta(e)]).toEqual([400, { code: 'VALIDATION_ERROR', message: "types: 'nao_existe' não é um perfil de cliente." }]);
    expect(p.leads.findMany).not.toHaveBeenCalled();
  });
});

describe('lista branca pela flag dos segmentos', () => {
  const salvo = {
    segments: [
      { slug: 'pizzaria', label: 'Pizzaria da casa', filters: [[{ key: 'cuisine', op: '~', value: 'pizza' }]], keywords: [], priority: 1, active: false },
      { slug: 'bar', label: 'Bar', filters: [[{ key: 'amenity', op: '~', value: 'bar|pub' }]], keywords: [], priority: 2, active: true },
    ],
  };

  it('ligada: lê app_settings.place_segments e aceita um segmento DESATIVADO, com o rótulo gravado na foto', async () => {
    const p = fake(salvo);
    p.leads.findMany.mockResolvedValueOnce([leadGeo(1)]).mockResolvedValue([]);
    const v = await montar(p, { segments: true }).criar({ praca_id: PRACA, types: ['pizzaria'] }, ADMIN, AGORA);
    expect(leuSegmentos(p)).toBe(true);
    expect(v.types).toEqual([{ slug: 'pizzaria', label: 'Pizzaria da casa' }]);
    expect(p.leads.findMany.mock.calls[0][0].where.place_candidates).toEqual({ some: { category: { in: ['pizzaria'] } } });
  });

  it('desligada: só os 5 tipos de hoje (pizzaria = 400) e a lista salva nem é lida', async () => {
    const p = fake(salvo);
    const e = await falha(() => montar(p, { segments: false }).criar({ praca_id: PRACA, types: ['pizzaria'] }, ADMIN, AGORA));
    expect(status(e)).toBe(400);
    expect(leuSegmentos(p)).toBe(false);
  });
});

describe('trava e leitura', () => {
  it('planos desligados: 404 ROUTE_PLANS_DISABLED também com types, sem tocar no banco', async () => {
    const p = fake();
    const s = montar(p, { route_plans: false });
    for (const f of [() => s.criar({ praca_id: PRACA, types: ['bar'] }, ADMIN, AGORA), () => s.previa({ praca_id: PRACA, types: 'bar' }, AGORA)]) {
      const e = await falha(f);
      expect([status(e), resposta(e).code]).toEqual([404, 'ROUTE_PLANS_DISABLED']);
    }
    expect(p.leads.findMany).not.toHaveBeenCalled();
    expect(p.app_settings.findUnique).not.toHaveBeenCalled();
  });

  it('lista: o perfil de cada geração vem da foto; plano de antes (sem a chave) = null', async () => {
    const p = fake();
    const base = { praca_id: PRACA, area_id: null, kind: 'geral', parent_lead_id: null, travel_mode: 'carro', modelo_tempo: 'lovable', total_leads: 3, truncated: false, created_by: ADMIN.id, created_at: AGORA, archived_at: null, items: [] };
    p.field_route_plans.findMany.mockResolvedValue([
      { ...base, id: 'novo', params_snapshot: { por_rota: 20, types: [{ slug: 'bar', label: 'Bar' }] } },
      { ...base, id: 'antigo', params_snapshot: { por_rota: 20 } },
    ]);
    const l = await montar(p).list({ praca_id: PRACA });
    expect(l.map((x) => [x.id, x.types])).toEqual([
      ['novo', [{ slug: 'bar', label: 'Bar' }]],
      ['antigo', null],
    ]);
  });
});
