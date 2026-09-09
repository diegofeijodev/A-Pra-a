import { GeoService } from '../geo.service';

// Belo Horizonte (MG). Vizinha imediata: Contagem.
const BH = '3106200';

describe('GeoService', () => {
  let service: GeoService;

  beforeEach(() => {
    service = new GeoService();
  });

  describe('haversineKm', () => {
    it('calcula a distância BH → Contagem (mesma fórmula de geo.ts:41-57)', () => {
      const bh = service.find(BH)!;
      const contagem = service.municipiosPorUf('MG').find((m) => m.nome === 'Contagem')!;

      const km = service.haversineKm(bh.lat, bh.lon, contagem.lat, contagem.lon);

      // BH e Contagem são conurbadas — reta em linha reta ~13,5 km (não os
      // ~20 km do brief da tarefa: checado contra as coordenadas reais do
      // municipios.json, ver task-4-report.md § Desvios do brief).
      expect(km).toBeGreaterThan(10);
      expect(km).toBeLessThan(17);
    });
  });

  describe('cidadesNoRaio', () => {
    it("inclui Contagem e não inclui a própria Belo Horizonte, no raio de 50 km", () => {
      const vizinhas = service.cidadesNoRaio(BH, 50);
      const nomes = vizinhas.map((v) => v.nome);

      expect(nomes).toContain('Contagem');
      expect(nomes).not.toContain('Belo Horizonte');
    });

    it('ordena da maior para a menor população', () => {
      const vizinhas = service.cidadesNoRaio(BH, 50);
      const pops = vizinhas.map((v) => v.pop);
      const ordenado = [...pops].sort((a, b) => b - a);
      expect(pops).toEqual(ordenado);
    });

    it('404 NOT_FOUND quando o código IBGE não existe', () => {
      expect(() => service.cidadesNoRaio('0000000', 50)).toThrow();
    });
  });

  describe('municipiosPorUf', () => {
    it("'MG' não contém 'Rio de Janeiro' (nunca cruza UF)", () => {
      const nomes = service.municipiosPorUf('MG').map((m) => m.nome);
      expect(nomes).not.toContain('Rio de Janeiro');
    });

    it("regra EXCLUIR do protótipo (geo.ts:26): 'RJ' não contém 'Rio de Janeiro' e 'SP' não contém 'São Paulo'", () => {
      expect(service.municipiosPorUf('RJ').map((m) => m.nome)).not.toContain('Rio de Janeiro');
      expect(service.municipiosPorUf('SP').map((m) => m.nome)).not.toContain('São Paulo');
    });

    it('traz Belo Horizonte para uf=MG, ordenado por nome pt-BR', () => {
      const nomes = service.municipiosPorUf('MG').map((m) => m.nome);
      expect(nomes).toContain('Belo Horizonte');
      const ordenado = [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      expect(nomes).toEqual(ordenado);
    });
  });

  describe('estados', () => {
    it('devolve as 27 UFs', () => {
      expect(service.estados()).toHaveLength(27);
    });
  });

  describe('find', () => {
    it('devolve undefined para um ibge inexistente', () => {
      expect(service.find('0000000')).toBeUndefined();
    });
  });
});
