/**
 * Divisão de uma área em N rotas (contrato §39, fase L7): `dividirPorVarredura` portado da Lovable (`src/lib/rotas.ts`) e testado
 * com os vetores dela (`rotas-tempo.test.ts`, `test/rotas.test.ts`), mais o determinismo e o modelo de tempo do nosso relógio.
 */
import {
  CONFIG_DIVISAO,
  CORES_ROTA,
  contaLovable,
  contaRelogio,
  distanciaTotalKm,
  dividirPorVarredura,
  maisFrequente,
  nomeDaRota,
  ordenarVizinhoLovable,
  paramsDivisao,
  tempoPrevistoMin,
  type PontoDivisao,
} from '../divisao-rotas-rules';
import { CONFIG_ROTA_PADRAO, paramsDaConfig } from '../rota-rules';

const LOV = CONFIG_DIVISAO.padrao;
const grade = (n: number, linhas: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), lat: -23.5 + (i % linhas) * 0.01, lng: -46.6 + Math.floor(i / linhas) * 0.01 }));

describe('tempo previsto (vetores da Lovable)', () => {
  it('20 paradas a 0 km = 460 min; 10 paradas = 260 min', () => {
    expect(tempoPrevistoMin(20, 0)).toBe(460);
    expect(tempoPrevistoMin(10, 0)).toBe(260);
  });
  it('soma o deslocamento a 25 km/h (carro) e a 5 km/h (a pé)', () => {
    expect(tempoPrevistoMin(3, 25)).toBe(180);
    expect(tempoPrevistoMin(3, 5, 5)).toBe(180);
  });
  it('bairro principal é o mais frequente', () => {
    expect(maisFrequente(['A', 'B', 'B', null])).toBe('B');
    expect(maisFrequente([null, undefined, ''])).toBeNull();
  });
});

describe('dividirPorVarredura (modelo da Lovable)', () => {
  const lovable = (porRota: number, modo: 'carro' | 'a_pe' = 'carro') => paramsDivisao({ ...LOV, por_rota: porRota, travel_mode: modo });

  it('cada rota tem no máximo o pedido e nenhum estabelecimento se perde (23 pontos, 10 por rota = 3 rotas)', () => {
    const r = dividirPorVarredura(grade(23, 5), lovable(10));
    expect(r).toHaveLength(3);
    expect(r.every((g) => g.length <= 10)).toBe(true);
    expect(new Set(r.flat().map((p) => p.id)).size).toBe(23);
  });
  it('nenhuma rota passa de 10 horas, de carro e a pé (60 pontos, até 100 por rota)', () => {
    for (const [modo, kmh] of [
      ['carro', 25],
      ['a_pe', 5],
    ] as const) {
      const g = dividirPorVarredura(grade(60, 8), lovable(100, modo));
      expect(g.flat()).toHaveLength(60);
      for (const r of g) expect(tempoPrevistoMin(r.length, distanciaTotalKm(r), kmh)).toBeLessThanOrEqual(600);
    }
  });
  it('vizinho mais próximo vai para o ponto mais perto, partindo do mais ao norte-oeste', () => {
    const o = ordenarVizinhoLovable([
      { id: 'far', lat: -1, lng: 1 },
      { id: 'a', lat: 0, lng: 0 },
      { id: 'near', lat: -0.01, lng: 0 },
    ]);
    expect(o.map((p) => p.id)).toEqual(['a', 'near', 'far']);
  });
  it('determinístico: a mesma entrada embaralhada dá as mesmas rotas, na mesma ordem', () => {
    const base = grade(47, 6).map((p) => ({ ...p, id: `lead-${p.id.padStart(3, '0')}` }));
    const embaralhada = [...base].sort((a, b) => (a.id.charCodeAt(7) * 31 + a.id.charCodeAt(6)) % 7 - (b.id.charCodeAt(7) * 31 + b.id.charCodeAt(6)) % 7 || (a.id < b.id ? 1 : -1));
    const ids = (r: PontoDivisao[][]) => r.map((g) => g.map((p) => p.id));
    expect(ids(dividirPorVarredura(embaralhada, lovable(8)))).toEqual(ids(dividirPorVarredura(base, lovable(8))));
    // Empate total (pontos no mesmo lugar): a ordem sai do id.
    const mesmos = ['c', 'a', 'b'].map((id) => ({ id, lat: -19.9, lng: -43.9 }));
    expect(ids(dividirPorVarredura(mesmos, lovable(2)))).toEqual([['a', 'b'], ['c']]);
  });
  it('vazio ou por_rota < 1 = nenhuma rota (como a Lovable)', () => {
    expect(dividirPorVarredura([], lovable(10))).toEqual([]);
    expect(dividirPorVarredura(grade(3, 3), { ...lovable(10), por_rota: 0 })).toEqual([]);
  });
});

describe('dividirPorVarredura (modelo do nosso relógio)', () => {
  it('a capacidade sai do relógio do roteiro: a rota cabe inteira na janela, com o almoço', () => {
    const plano = paramsDaConfig(CONFIG_ROTA_PADRAO);
    const p = paramsDivisao({ ...LOV, modelo_tempo: 'roteiro', por_rota: 100, travel_mode: 'a_pe' }, plano);
    const pontos = grade(120, 10).map((x) => ({ ...x, lat: -19.92 + (x.lat + 23.5) / 20, lng: -43.94 + (x.lng + 46.6) / 20 }));
    const r = dividirPorVarredura(pontos, p);
    expect(r.flat()).toHaveLength(120);
    for (const g of r) expect(contaRelogio(g, plano).coube).toBe(true);
    // 9h de janela − 1 h de almoço = 480 min; a 8 min por visita sem andar nada, no máximo 60 paradas.
    expect(r.every((g) => g.length <= 60)).toBe(true);
  });
});

describe('as duas contas (a tela mostra as duas)', () => {
  const g = [
    { id: 'a', lat: -19.92, lng: -43.94 },
    { id: 'b', lat: -19.92, lng: -43.93 },
  ];
  it('Lovable: N × 20 min + 1 h + km ÷ km/h, com o teto de 10 h', () => {
    const c = contaLovable(g, LOV, 'carro');
    const desl = Math.round((distanciaTotalKm(g) / 25) * 60); // 1,05 km a 25 km/h = 3 min
    expect(desl).toBe(3);
    expect(c.minutos).toBe(2 * 20 + 60 + desl);
    expect(c.texto).toBe('2 × 20 min + 1 h de intervalo + 1 km em linha reta ÷ 25 km/h (3 min) = 1h43 (máx. 10h)');
  });
  it('nosso relógio: N × 8 min + rua (linha reta × 1,3) ÷ velocidade + almoço, e se cabe na janela', () => {
    const plano = paramsDaConfig(CONFIG_ROTA_PADRAO);
    const c = contaRelogio(g, plano);
    expect(c.coube).toBe(true);
    expect(c.texto).toContain('2 × 8 min');
    expect(c.texto).toContain('linha reta × 1,3');
    expect(c.texto).toContain('4,5 km/h');
  });
});

describe('nomes, cores e configuração', () => {
  it('Rota 01, 02…; cores da Lovable em ciclo', () => {
    expect(nomeDaRota('geral', 0, 3)).toBe('Rota 01');
    expect(nomeDaRota('geral', 11, 12)).toBe('Rota 12');
    expect(nomeDaRota('shoppings', 0, 1)).toBe('Rota dos shoppings');
    expect(nomeDaRota('shoppings', 1, 2)).toBe('Rota dos shoppings 2');
    expect(CORES_ROTA[0]).toBe('#2563eb');
    expect(CORES_ROTA).toHaveLength(8);
  });
  it('padrões da spec (§39): 20 por rota, modelo lovable, 20/60/600, carro (25 km/h; a pé 5 km/h)', () => {
    expect(LOV).toEqual({
      por_rota: 20,
      modelo_tempo: 'lovable',
      minutos_por_cliente: 20,
      intervalo_min: 60,
      limite_min: 600,
      travel_mode: 'carro',
      kmh_carro: 25,
      kmh_pe: 5,
    });
    expect(CONFIG_DIVISAO.aplicar(LOV, { por_rota: 101 })).toMatchObject({ ok: false });
    expect(CONFIG_DIVISAO.aplicar(LOV, { modelo_tempo: 'roteiro', travel_mode: 'a_pe' })).toMatchObject({ ok: true });
  });
});
