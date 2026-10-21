/** Fase L0 (contrato §23.1): raio do check-in configurável, padrão IDÊNTICO ao de hoje (200 m, comparação estrita `>`). */
import { CONFIG_CHECKIN, marcaLonge, RAIO_LONGE_M } from '../campo-rules';

const CENTRO = { lat: -19.9245, lng: -43.9352 };
/** Lugar a `m` metros ao norte do centro (1° de latitude = 6.371.000 × π/180 m na régua do `distanciaM`). */
const aNorte = (m: number) => ({ lat: CENTRO.lat + m / ((6_371_000 * Math.PI) / 180), lng: CENTRO.lng });

describe('raio do check-in', () => {
  it('padrão = RAIO_LONGE_M = 200 e a comparação é estrita: 200 m não é longe, 201 m é', () => {
    expect(RAIO_LONGE_M).toBe(200);
    expect(CONFIG_CHECKIN.padrao).toEqual({ raio_checkin_m: 200 });
    expect(marcaLonge(CENTRO, aNorte(200))).toEqual({ distance_m: 200, far_from_place: false });
    expect(marcaLonge(CENTRO, aNorte(201))).toEqual({ distance_m: 201, far_from_place: true });
  });

  it('sem raio informado é exatamente o de hoje; com raio, a mesma régua estrita', () => {
    expect(marcaLonge(CENTRO, aNorte(201))).toEqual(marcaLonge(CENTRO, aNorte(201), 200));
    expect(marcaLonge(CENTRO, aNorte(300), 300)).toEqual({ distance_m: 300, far_from_place: false });
    expect(marcaLonge(CENTRO, aNorte(301), 300)).toEqual({ distance_m: 301, far_from_place: true });
    expect(marcaLonge(CENTRO, aNorte(60), 50).far_from_place).toBe(true);
    expect(marcaLonge(CENTRO, { lat: null, lng: null }, 50)).toEqual({ distance_m: null, far_from_place: false });
  });

  it('configuração: 50–1000 inteiro; ausente ou inválido no banco = 200; PUT fora da faixa = erro', () => {
    expect(CONFIG_CHECKIN.ler({})).toEqual({ raio_checkin_m: 200 });
    expect(CONFIG_CHECKIN.ler({ raio_checkin_m: 350 })).toEqual({ raio_checkin_m: 350 });
    for (const ruim of [49, 1001, 120.5, '300', null]) expect(CONFIG_CHECKIN.ler({ raio_checkin_m: ruim })).toEqual({ raio_checkin_m: 200 });
    expect(CONFIG_CHECKIN.aplicar(CONFIG_CHECKIN.padrao, { raio_checkin_m: 50 })).toEqual({ ok: true, config: { raio_checkin_m: 50 } });
    expect(CONFIG_CHECKIN.aplicar(CONFIG_CHECKIN.padrao, { raio_checkin_m: 1000 })).toEqual({ ok: true, config: { raio_checkin_m: 1000 } });
    expect(CONFIG_CHECKIN.aplicar(CONFIG_CHECKIN.padrao, { raio_checkin_m: 40 })).toEqual({ ok: false, erro: 'raio_checkin_m: valor fora do permitido.' });
    expect(CONFIG_CHECKIN.aplicar(CONFIG_CHECKIN.padrao, { outra: 1 })).toEqual({ ok: false, erro: 'outra: campo desconhecido.' });
  });
});
