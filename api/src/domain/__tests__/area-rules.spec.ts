import { distanciaM } from '../campo-rules';
import {
  BRASIL,
  chaveNomeArea,
  dentroDoBrasil,
  pontoNaArea,
  RAIO_AREA_MAX_M,
  RAIO_AREA_MIN_M,
  raioValido,
  validarArea,
} from '../area-rules';

const MOEMA = { lat: -23.6021, lng: -46.6658, radius_m: 1500 };

describe('dentroDoBrasil', () => {
  it('aceita São Paulo, Manaus e Porto Alegre', () => {
    expect(dentroDoBrasil({ lat: -23.6, lng: -46.66 })).toBe(true);
    expect(dentroDoBrasil({ lat: -3.1, lng: -60.02 })).toBe(true);
    expect(dentroDoBrasil({ lat: -30.03, lng: -51.2 })).toBe(true);
  });

  it('recusa Buenos Aires, Lisboa e o ponto 0,0', () => {
    expect(dentroDoBrasil({ lat: -34.6, lng: -58.4 })).toBe(false);
    expect(dentroDoBrasil({ lat: 38.7, lng: -9.1 })).toBe(false);
    expect(dentroDoBrasil({ lat: 0, lng: 0 })).toBe(false);
  });

  it('as bordas do retângulo contam como dentro, um pouco além não', () => {
    expect(dentroDoBrasil({ lat: BRASIL.latMin, lng: BRASIL.lngMin })).toBe(true);
    expect(dentroDoBrasil({ lat: BRASIL.latMax, lng: BRASIL.lngMax })).toBe(true);
    expect(dentroDoBrasil({ lat: BRASIL.latMin - 0.01, lng: -50 })).toBe(false);
    expect(dentroDoBrasil({ lat: -10, lng: BRASIL.lngMax + 0.01 })).toBe(false);
  });

  it('NaN e infinito não passam', () => {
    expect(dentroDoBrasil({ lat: NaN, lng: -46 })).toBe(false);
    expect(dentroDoBrasil({ lat: -23, lng: Infinity })).toBe(false);
  });
});

describe('raioValido', () => {
  it('200 e 5000 são os limites; inteiro apenas', () => {
    expect(RAIO_AREA_MIN_M).toBe(200);
    expect(RAIO_AREA_MAX_M).toBe(5000);
    expect(raioValido(200)).toBe(true);
    expect(raioValido(5000)).toBe(true);
    expect(raioValido(199)).toBe(false);
    expect(raioValido(5001)).toBe(false);
    expect(raioValido(1500.5)).toBe(false);
    expect(raioValido(NaN)).toBe(false);
  });
});

describe('validarArea', () => {
  it('devolve null quando tudo é válido', () => {
    expect(validarArea(MOEMA)).toBeNull();
  });

  it('centro fora do Brasil => erro em lat', () => {
    expect(validarArea({ lat: 38.7, lng: -9.1, radius_m: 500 })).toMatch(/Brasil/);
  });

  it('raio fora da faixa => mensagem com os limites', () => {
    expect(validarArea({ ...MOEMA, radius_m: 100 })).toMatch(/200/);
    expect(validarArea({ ...MOEMA, radius_m: 9000 })).toMatch(/5\.000|5000/);
  });
});

describe('pontoNaArea', () => {
  it('o centro está na área', () => {
    expect(pontoNaArea(MOEMA, MOEMA)).toBe(true);
  });

  it('ponto a ~1 km do centro está dentro de 1,5 km; a ~3 km está fora', () => {
    const perto = { lat: MOEMA.lat + 0.009, lng: MOEMA.lng }; // ~1.000 m
    const longe = { lat: MOEMA.lat + 0.027, lng: MOEMA.lng }; // ~3.000 m
    expect(pontoNaArea(perto, MOEMA)).toBe(true);
    expect(pontoNaArea(longe, MOEMA)).toBe(false);
  });

  it('exatamente na borda (distância == raio) conta como dentro; um metro além, fora', () => {
    const p = { lat: MOEMA.lat + 0.01, lng: MOEMA.lng };
    const d = distanciaM(p, MOEMA);
    expect(pontoNaArea(p, { ...MOEMA, radius_m: d })).toBe(true);
    expect(pontoNaArea(p, { ...MOEMA, radius_m: d - 1 })).toBe(false);
  });
});

describe('chaveNomeArea', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(chaveNomeArea('  Itaim-Bibi ')).toBe(chaveNomeArea('itaim bibi'));
    expect(chaveNomeArea('Vila Olímpia')).toBe(chaveNomeArea('VILA OLIMPIA'));
  });
});
