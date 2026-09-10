/**
 * As duas guardas de "não mova o filho de praça" (§15).
 *
 * `PUT /v1/campanhas/:id` gravava `praca_id: dto.praca_id` sem comparar com o
 * atual: salvar o briefing com outra praça movia a campanha e levava
 * `creatives` e `traffic_entries` (verba, gerenciador, dias já investidos)
 * junto — o portão (`gateOf`) e o `fill-hours` passavam a ser avaliados contra
 * a praça de destino enquanto o gasto continuava sendo da origem. É o
 * vazamento que o `/duplicate` evita de propósito ("Tráfego NÃO vai").
 * `PUT /v1/traffic/:id` tinha a mesma porta, um andar abaixo.
 */
import type { PrismaService } from '../../../common/database/prisma.service';
import type { AuthUser } from '../../../common/auth/auth-user';
import { MidiaService } from '../midia.service';
import type { CampanhaBodyDto, TrafficBodyDto } from '../dto/midia.dto';

const CAMPANHA = '77777777-7777-4777-8777-777777777777';
const ENTRADA = '88888888-8888-4888-8888-888888888888';
const PRACA_A = '11111111-1111-4111-8111-111111111111';
const PRACA_B = '22222222-2222-4222-8222-222222222222';
const USER = { id: 'u1', name: 'Diego', is_admin: true } as AuthUser;

function campanhaRow(over: Record<string, unknown> = {}) {
  return {
    id: CAMPANHA,
    name: 'BH · Setembro · contratantes',
    praca_id: PRACA_A,
    publico: 'contratantes',
    objetivo: 'cadastro',
    start: '2026-09-01',
    end: '2026-09-30',
    verba: 3000,
    gasto: 500,
    dor: 'falta de gente',
    oferta: 'primeira vaga sem taxa',
    mensagem_chave: 'a gente resolve hoje',
    destino: 'formulario',
    kpi_name: 'cadastros',
    kpi_meta: 30,
    kpi_custo: 40,
    cac_teto: 120,
    status: 'ativa',
    gate_just_by: 'Diego',
    gate_just_at: new Date('2026-09-01T12:00:00Z'),
    gate_just_text: 'combinado com o dono',
    created_at: new Date('2026-09-01T12:00:00Z'),
    provas: [],
    ...over,
  };
}

function fakePrisma(criativos = 0, trafego = 0) {
  const p = {
    $transaction: jest.fn(),
    pracas: { findUnique: jest.fn().mockResolvedValue({ name: 'BH · Setembro', city: 'Belo Horizonte' }) },
    campanhas: {
      findUnique: jest.fn().mockResolvedValue(campanhaRow()),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(campanhaRow({ praca_id: PRACA_B })),
    },
    campanha_provas: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    creatives: { count: jest.fn().mockResolvedValue(criativos) },
    traffic_entries: {
      count: jest.fn().mockResolvedValue(trafego),
      findUnique: jest.fn().mockResolvedValue({ id: ENTRADA, campanha_id: CAMPANHA, criativos: [] }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: ENTRADA, campanha_id: CAMPANHA, days: [] }),
    },
    traffic_days: { findMany: jest.fn().mockResolvedValue([]) },
    leads: { findMany: jest.fn().mockResolvedValue([]) },
    praca_step_states: { findMany: jest.fn().mockResolvedValue([]) },
    proofs: { count: jest.fn().mockResolvedValue(0) },
  };
  p.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(p));
  return p;
}

const montar = (p: ReturnType<typeof fakePrisma>) => new MidiaService(p as unknown as PrismaService);

const corpoCampanha = (praca_id: string): CampanhaBodyDto =>
  ({
    praca_id,
    publico: 'contratantes',
    objetivo: 'cadastro',
    start: '2026-09-01',
    end: '2026-09-30',
    verba: 3000,
    gasto: 500,
    dor: 'falta de gente',
    oferta: 'primeira vaga sem taxa',
    mensagem_chave: 'a gente resolve hoje',
    destino: 'formulario',
    provas: [],
    kpi_name: 'cadastros',
    kpi_meta: 30,
    kpi_custo: 40,
    cac_teto: 120,
  }) as CampanhaBodyDto;

const corpoTrafego = (campanha_id: string): TrafficBodyDto =>
  ({
    campanha_id,
    plataforma: 'meta',
    nome_la: 'BH · setembro',
    publico: 'raio 8 km',
    geo: 'Belo Horizonte',
    verba_diaria: 100,
    criativos: [],
    manager_url: '',
    api_connected: false,
  }) as TrafficBodyDto;

describe('MidiaService.replaceCampanha — troca de praça', () => {
  it('campanha com criativo recusa a troca com 409 CAMPANHA_HAS_CHILDREN', async () => {
    const p = fakePrisma(2, 0);

    await expect(montar(p).replaceCampanha(CAMPANHA, corpoCampanha(PRACA_B), USER)).rejects.toMatchObject({
      response: { code: 'CAMPANHA_HAS_CHILDREN' },
    });
    expect(p.campanhas.update).not.toHaveBeenCalled();
  });

  it('campanha com entrada de tráfego também recusa (o gasto é da praça de origem)', async () => {
    const p = fakePrisma(0, 1);

    await expect(montar(p).replaceCampanha(CAMPANHA, corpoCampanha(PRACA_B), USER)).rejects.toMatchObject({
      response: { code: 'CAMPANHA_HAS_CHILDREN' },
    });
  });

  it('campanha sem filho nenhum pode trocar de praça: não há o que vazar', async () => {
    const p = fakePrisma(0, 0);

    await montar(p).replaceCampanha(CAMPANHA, corpoCampanha(PRACA_B), USER);

    expect(p.campanhas.update).toHaveBeenCalledTimes(1);
  });

  it('salvar o briefing na MESMA praça não conta filho nenhum (o caminho normal)', async () => {
    const p = fakePrisma(3, 2);

    await montar(p).replaceCampanha(CAMPANHA, corpoCampanha(PRACA_A), USER);

    expect(p.creatives.count).not.toHaveBeenCalled();
    expect(p.traffic_entries.count).not.toHaveBeenCalled();
    expect(p.campanhas.update).toHaveBeenCalledTimes(1);
  });
});

describe('MidiaService.replaceTraffic — troca de campanha', () => {
  it('mudar `campanha_id` no PUT é 409 CAMPANHA_HAS_CHILDREN', async () => {
    const p = fakePrisma();

    await expect(
      montar(p).replaceTraffic(ENTRADA, corpoTrafego('99999999-9999-4999-8999-999999999999')),
    ).rejects.toMatchObject({ response: { code: 'CAMPANHA_HAS_CHILDREN' } });
    expect(p.traffic_entries.update).not.toHaveBeenCalled();
  });

  it('mesma campanha salva normalmente', async () => {
    const p = fakePrisma();

    await montar(p).replaceTraffic(ENTRADA, corpoTrafego(CAMPANHA));

    expect(p.traffic_entries.update).toHaveBeenCalledTimes(1);
  });
});

describe('MidiaService — praça inexistente nas listas', () => {
  it('`GET /v1/proofs?praca_id=` de praça que não existe é 404, não lista vazia', async () => {
    const p = fakePrisma();
    p.pracas.findUnique.mockResolvedValue(null);

    await expect(montar(p).listProofs(PRACA_A)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });

  it('`GET /v1/campanhas?praca_id=` de praça que não existe é 404', async () => {
    const p = fakePrisma();
    p.pracas.findUnique.mockResolvedValue(null);

    await expect(montar(p).listCampanhas({ praca_id: PRACA_A })).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });

  it('`GET /v1/campanhas` sem filtro não exige praça nenhuma', async () => {
    const p = fakePrisma();
    p.pracas.findUnique.mockResolvedValue(null);

    await expect(montar(p).listCampanhas({})).resolves.toEqual([]);
    expect(p.pracas.findUnique).not.toHaveBeenCalled();
  });
});
