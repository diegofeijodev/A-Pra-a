import type { PrismaService } from '../../../common/database/prisma.service';
import { consultaGeo, geoInicial } from '../../../domain/geo-rules';
import { rowToDraft } from '../../../domain/dedup';
import { GeocodeService } from '../geocode.service';
import { desligado, geocoderDoAmbiente, google, GeocoderIndisponivel, nominatim, type Geocoder } from '../geocoder';
import { lerFiltroCnae, statusNoMapa } from '../mapa.service';

const resposta = (status: number, corpo: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as unknown as Response;

describe('geo-rules', () => {
  it('estado inicial: coordenada vale mais que endereço; sem nada, nulo', () => {
    expect(geoInicial({ address: 'Rua A, 10', lat: -19.9, lng: -43.9 })).toBe('ok');
    expect(geoInicial({ address: 'Rua A, 10', lat: null, lng: null })).toBe('pendente');
    expect(geoInicial({ address: '  ', lat: null, lng: null })).toBeNull();
  });

  it('consulta: endereço, bairro, cidade, Brasil — sem vazios', () => {
    expect(consultaGeo({ address: 'Rua A, 10', bairro: 'Centro', city: 'Belo Horizonte' })).toBe(
      'Rua A, 10, Centro, Belo Horizonte, Brasil',
    );
    expect(consultaGeo({ address: 'Rua A, 10', bairro: null, city: '' })).toBe('Rua A, 10, Brasil');
  });
});

describe('planilha → rascunho com CNAE, bairro e coordenadas', () => {
  const map = { name: 'Nome', cnae: 'CNAE', bairro: 'Bairro', lat: 'Latitude', lng: 'Longitude' };
  it('lê CNAE com máscara e coordenada com vírgula', () => {
    const d = rowToDraft({ Nome: 'Bar', CNAE: '5611-2/01', Bairro: ' Centro ', Latitude: '-19,93', Longitude: '-43,94' }, map, 'importação');
    expect(d).toMatchObject({ cnae: '5611201', bairro: 'Centro', lat: -19.93, lng: -43.94 });
  });
  it('só o par de coordenadas vale', () => {
    const d = rowToDraft({ Nome: 'Bar', CNAE: '', Bairro: '', Latitude: '-19,93', Longitude: '' }, map, 'importação');
    expect(d).toMatchObject({ cnae: null, lat: null, lng: null });
  });
});

describe('provedores', () => {
  it('nominatim: User-Agent, Brasil e o primeiro resultado', async () => {
    const f = jest.fn().mockResolvedValue(resposta(200, [{ lat: '-19.9', lon: '-43.9' }]));
    const g = nominatim('praca-teste/1.0', f as unknown as typeof fetch);
    expect(await g.buscar('Rua A, Brasil')).toEqual({ lat: -19.9, lng: -43.9 });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('countrycodes=br');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('praca-teste/1.0');
  });

  it('nominatim: lista vazia = não achou; 429 = indisponível', async () => {
    const vazio = nominatim('x', jest.fn().mockResolvedValue(resposta(200, [])) as unknown as typeof fetch);
    expect(await vazio.buscar('nada')).toBeNull();
    const limite = nominatim('x', jest.fn().mockResolvedValue(resposta(429, {})) as unknown as typeof fetch);
    await expect(limite.buscar('x')).rejects.toBeInstanceOf(GeocoderIndisponivel);
  });

  it('google: ZERO_RESULTS = não achou; outro status = indisponível', async () => {
    const zero = google('k', jest.fn().mockResolvedValue(resposta(200, { status: 'ZERO_RESULTS' })) as unknown as typeof fetch);
    expect(await zero.buscar('x')).toBeNull();
    const negado = google('k', jest.fn().mockResolvedValue(resposta(200, { status: 'REQUEST_DENIED' })) as unknown as typeof fetch);
    await expect(negado.buscar('x')).rejects.toBeInstanceOf(GeocoderIndisponivel);
  });

  it('escolha pelo ambiente: google sem chave cai para desligado', () => {
    expect(geocoderDoAmbiente({ GEOCODER: 'off' }).nome).toBe('off');
    expect(geocoderDoAmbiente({ GEOCODER: 'google' }).nome).toBe('off');
    expect(geocoderDoAmbiente({ GEOCODER: 'google', GOOGLE_MAPS_API_KEY: 'k' }).nome).toBe('google');
    expect(geocoderDoAmbiente({}).nome).toBe('nominatim');
  });
});

describe('GeocodeService.rodada', () => {
  const fila = [
    { id: 'a', address: 'Rua A, 10', bairro: null, city: 'BH' },
    { id: 'b', address: 'Rua B, 20', bairro: 'Centro', city: 'BH' },
    { id: 'c', address: 'Rua C, 30', bairro: null, city: 'BH' },
  ];
  const montar = (g: Geocoder) => {
    const prisma = {
      leads: {
        findMany: jest.fn().mockResolvedValue(fila),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { prisma, s: new GeocodeService(prisma as unknown as PrismaService, g) };
  };
  const semPausa = async () => undefined;

  it('grava achados e não achados, condicionado ao endereço não ter mudado', async () => {
    const g: Geocoder = {
      nome: 'nominatim',
      intervaloMs: 0,
      buscar: jest.fn().mockResolvedValueOnce({ lat: 1, lng: 2 }).mockResolvedValueOnce(null).mockResolvedValueOnce({ lat: 3, lng: 4 }),
    };
    const { prisma, s } = montar(g);
    expect(await s.rodada(50, semPausa)).toEqual({ ok: 2, falhou: 1, parou: false });
    const primeiro = prisma.leads.updateMany.mock.calls[0]![0];
    expect(primeiro.where).toEqual({ id: 'a', geo_status: 'pendente', address: 'Rua A, 10' });
    expect(primeiro.data).toMatchObject({ lat: 1, lng: 2, geo_status: 'ok' });
    expect(prisma.leads.updateMany.mock.calls[1]![0].data).toMatchObject({ geo_status: 'falhou' });
  });

  it('provedor indisponível: para a rodada e deixa o resto pendente', async () => {
    const g: Geocoder = {
      nome: 'nominatim',
      intervaloMs: 0,
      buscar: jest.fn().mockResolvedValueOnce({ lat: 1, lng: 2 }).mockRejectedValueOnce(new GeocoderIndisponivel('HTTP 429')),
    };
    const { prisma, s } = montar(g);
    expect(await s.rodada(50, semPausa)).toEqual({ ok: 1, falhou: 0, parou: true });
    expect(prisma.leads.updateMany).toHaveBeenCalledTimes(1);
  });

  it('desligado: nem lê a fila', async () => {
    const { prisma, s } = montar(desligado);
    expect(await s.rodada()).toEqual({ ok: 0, falhou: 0, parou: false });
    expect(prisma.leads.findMany).not.toHaveBeenCalled();
  });
});

describe('mapa', () => {
  it('status: vaga > cadastrado > visitado > não visitado', () => {
    expect(statusNoMapa({ stage: 1, vagas: 1, visitas: 0 })).toBe('com_vaga');
    expect(statusNoMapa({ stage: 5, vagas: 0, visitas: 1 })).toBe('cadastrado');
    expect(statusNoMapa({ stage: 3, vagas: 0, visitas: 1 })).toBe('visitado');
    expect(statusNoMapa({ stage: 1, vagas: 0, visitas: 0 })).toBe('nao_visitado');
  });

  it('filtro de CNAE: vazio = todos; código fora de 7 dígitos = 400', () => {
    expect(lerFiltroCnae(undefined)).toEqual([]);
    expect(lerFiltroCnae('5611201, 5611204')).toEqual(['5611201', '5611204']);
    expect(() => lerFiltroCnae('5611-2/01')).toThrow();
  });
});
