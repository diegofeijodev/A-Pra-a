import { minutesSp } from '../../common/time/dates';
import {
  aplicarConfigRota,
  calcularRelogio,
  caminhadaMin,
  CONFIG_ROTA_PADRAO,
  custoCaminhoM,
  hhmmParaMin,
  lerConfigRota,
  melhorarDoisOpt,
  minParaHhmm,
  MODOS_DESLOCAMENTO,
  minutosUteisAte,
  textoDoModo,
  velocidadeDoModo,
  VELOCIDADE_CARRO_PADRAO,
  ordenarComFixas,
  ordenarRetornosAncorados,
  ordenarVizinhoMaisProximo,
  paramsDaConfig,
  planejar,
  reordenarLinhaReta,
  ritmo,
  ruaM,
  selecionarEncadeados,
  type ParamsPlano,
  type PontoRota,
} from '../rota-rules';

const P: ParamsPlano = paramsDaConfig(CONFIG_ROTA_PADRAO);
const H = (s: string) => hhmmParaMin(s)!;
/** 1 grau de longitude no equador ≈ 111.195 m (raio 6.371 km). */
const GRAU_M = 111_195;
const leste = (id: string, metros: number): PontoRota => ({ id, lat: 0, lng: metros / GRAU_M });
const ORIGEM = { lat: 0, lng: 0 };

/** Gerador pseudo-aleatório com semente: o teste de propriedade precisa ser repetível. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const aleatorios = (n: number, seed: number): PontoRota[] => {
  const r = lcg(seed);
  return Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(3, '0')}`, lat: -23.6 + r() * 0.02, lng: -46.66 + r() * 0.02 }));
};

describe('horários', () => {
  it('converte HH:MM e rejeita lixo', () => {
    expect(hhmmParaMin('09:30')).toBe(570);
    expect(hhmmParaMin('24:00')).toBeNull();
    expect(hhmmParaMin('9:30')).toBeNull();
    expect(hhmmParaMin(930)).toBeNull();
    expect(minParaHhmm(700)).toBe('11:40');
  });
});

describe('geometria', () => {
  it('rua = reta × fator; caminhada arredonda para cima', () => {
    expect(ruaM(ORIGEM, leste('a', 1000), 1.3)).toBe(1300);
    expect(caminhadaMin(75, 4.5)).toBe(1); // 4,5 km/h = 75 m/min
    expect(caminhadaMin(76, 4.5)).toBe(2);
    expect(caminhadaMin(0, 4.5)).toBe(0);
  });
});

describe('ordenação', () => {
  it('vizinho mais próximo encadeia a partir do início', () => {
    const o = ordenarVizinhoMaisProximo(ORIGEM, [leste('c', 900), leste('a', 100), leste('b', 400)]);
    expect(o.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('poucos pontos: 0, 1 e 2', () => {
    expect(planejar({ inicio: ORIGEM, partidaMin: H('09:00'), pontos: [], params: P }).paradas).toEqual([]);
    const um = planejar({ inicio: ORIGEM, partidaMin: H('09:00'), pontos: [leste('a', 150)], params: P });
    expect(um.paradas).toHaveLength(1);
    expect(um.paradas[0]).toMatchObject({ id: 'a', seq: 1, kind: 'planejada', eta_min: H('09:00') + 3 }); // 195 m de rua = 3 min
    const dois = planejar({ inicio: ORIGEM, partidaMin: H('09:00'), pontos: [leste('longe', 800), leste('perto', 100)], params: P });
    expect(dois.paradas.map((x) => x.id)).toEqual(['perto', 'longe']);
  });

  it('pontos duplicados: id repetido conta uma vez; mesma coordenada com ids diferentes ficam (distância 0)', () => {
    const r = planejar({
      inicio: ORIGEM,
      partidaMin: H('09:00'),
      pontos: [leste('a', 200), leste('a', 200), leste('b', 200), leste('c', 600)],
      params: P,
    });
    expect(r.paradas.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r.paradas[1]!.distancia_m).toBe(0);
    expect(r.paradas[1]!.eta_min).toBe(r.paradas[0]!.eta_min! + P.minutosPorVisita);
  });

  it('2-opt nunca piora o vizinho mais próximo (propriedade, 25 sementes)', () => {
    let melhorou = 0;
    for (let seed = 1; seed <= 25; seed += 1) {
      const pts = aleatorios(30, seed);
      const inicio = { lat: -23.59, lng: -46.65 };
      const nn = ordenarVizinhoMaisProximo(inicio, pts);
      const dois = melhorarDoisOpt(inicio, nn);
      expect(custoCaminhoM(inicio, dois)).toBeLessThanOrEqual(custoCaminhoM(inicio, nn));
      expect(dois.map((p) => p.id).sort()).toEqual(pts.map((p) => p.id).sort());
      if (custoCaminhoM(inicio, dois) < custoCaminhoM(inicio, nn)) melhorou += 1;
    }
    expect(melhorou).toBeGreaterThan(0);
  });

  it('determinística: mesma entrada, mesma saída; e a ordem de entrada não muda o resultado', () => {
    const pts = aleatorios(40, 7);
    const inicio = { lat: -23.59, lng: -46.65 };
    const a = planejar({ inicio, partidaMin: H('09:00'), pontos: pts, params: P });
    const b = planejar({ inicio, partidaMin: H('09:00'), pontos: pts, params: P });
    const embaralhado = [...pts].reverse();
    const c = planejar({ inicio, partidaMin: H('09:00'), pontos: embaralhado, params: P });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});

describe('relógio', () => {
  it('orçamento de 480 min: 30 visitas a ~460 m entre paradas fecham no fim da janela, a 31ª vira reserva', () => {
    const pts = Array.from({ length: 33 }, (_, i) => leste(`p${String(i).padStart(2, '0')}`, 460 * (i + 1)));
    const r = planejar({ inicio: ORIGEM, partidaMin: H('09:00'), pontos: pts, params: { ...P, meta: 40 } });
    const plan = r.paradas.filter((x) => x.kind === 'planejada');
    expect(plan).toHaveLength(30);
    expect(plan[0]!.eta_min).toBe(H('09:08')); // 460 × 1,3 = 598 m → 8 min
    const ultima = plan[29]!;
    expect(ultima.eta_min! + P.minutosPorVisita).toBeLessThanOrEqual(H('18:00'));
    expect(ultima.eta_min! + P.minutosPorVisita).toBe(H('18:00') - 4);
    expect(r.paradas.filter((x) => x.kind === 'reserva').map((x) => x.id)).toEqual(['p30', 'p31', 'p32']);
    expect(r.coube).toBe(false); // meta 40 não coube
  });

  it('meta 30 com 33 pontos: 30 planejadas, 3 reservas, coube', () => {
    const pts = Array.from({ length: 33 }, (_, i) => leste(`p${String(i).padStart(2, '0')}`, 460 * (i + 1)));
    const r = planejar({ inicio: ORIGEM, partidaMin: H('09:00'), pontos: pts, params: P });
    expect(r.paradas.filter((x) => x.kind === 'planejada')).toHaveLength(30);
    expect(r.paradas.filter((x) => x.kind === 'reserva')).toHaveLength(3);
    expect(r.coube).toBe(true);
    expect(r.paradas.every((x, i) => x.seq === i + 1)).toBe(true);
  });

  it('janela estourada: visitas longas e pontos longe cortam antes da meta', () => {
    const pts = Array.from({ length: 12 }, (_, i) => leste(`p${String(i).padStart(2, '0')}`, 2000 * (i + 1)));
    const r = planejar({ inicio: ORIGEM, partidaMin: H('09:00'), pontos: pts, params: { ...P, minutosPorVisita: 30 } });
    const plan = r.paradas.filter((x) => x.kind === 'planejada');
    expect(plan.length).toBeLessThan(12);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.at(-1)!.eta_min! + 30).toBeLessThanOrEqual(H('18:00'));
    expect(r.coube).toBe(false);
    expect(r.paradas.filter((x) => x.kind === 'reserva').length + plan.length).toBe(12);
  });

  it('reserva tem teto de 10; o resto é excedente', () => {
    const pts = Array.from({ length: 25 }, (_, i) => leste(`p${String(i).padStart(2, '0')}`, 300 * (i + 1)));
    const r = planejar({ inicio: ORIGEM, partidaMin: H('09:00'), pontos: pts, params: { ...P, meta: 5 } });
    expect(r.paradas.filter((x) => x.kind === 'reserva')).toHaveLength(10);
    expect(r.excedentes).toHaveLength(10);
  });

  it('almoço: chegada dentro dele vira 13h; sair durante o almoço também espera', () => {
    // 10 pontos a ~150 m: com 90 min de visita, o 2º ponto chega às 10h30 e termina 12h00.
    const a = planejar({
      inicio: ORIGEM,
      partidaMin: H('11:50'),
      pontos: [leste('a', 100), leste('b', 200)],
      params: { ...P, minutosPorVisita: 20 },
    });
    // a: chega 11:52 e termina 12:12 (dentro do almoço) → b só sai às 13:00 e chega 13:02
    expect(a.paradas.map((x) => x.eta_min)).toEqual([H('11:50') + 2, H('13:02')]);
    const b = planejar({ inicio: ORIGEM, partidaMin: H('12:30'), pontos: [leste('a', 100)], params: P });
    expect(b.paradas[0]!.eta_min).toBe(H('13:02'));
    const c = planejar({ inicio: ORIGEM, partidaMin: H('11:58'), pontos: [leste('a', 700)], params: P });
    expect(c.paradas[0]!.eta_min).toBe(H('13:00')); // chegaria 12:10, dentro do almoço
  });

  it('partida antes da janela vale a janela; depois do fim, tudo vira reserva', () => {
    const cedo = planejar({ inicio: ORIGEM, partidaMin: H('07:00'), pontos: [leste('a', 100)], params: P });
    expect(cedo.paradas[0]!.eta_min).toBeGreaterThanOrEqual(H('09:00'));
    const tarde = planejar({ inicio: ORIGEM, partidaMin: H('18:30'), pontos: [leste('a', 100)], params: P });
    expect(tarde.paradas[0]!.kind).toBe('reserva');
    expect(tarde.coube).toBe(false);
  });
});

describe('fixas e reotimização', () => {
  it('fixa é âncora: o que está entre duas fixas não atravessa a âncora', () => {
    const pts: PontoRota[] = [leste('a', 100), { ...leste('fixa', 1000), fixa: true }, leste('b', 200), leste('c', 300)];
    const o = ordenarComFixas(ORIGEM, pts);
    expect(o.map((p) => p.id)).toEqual(['a', 'fixa', 'c', 'b']); // depois da âncora (1000 m), c está mais perto que b
    // sem a âncora, b e c viriam antes (estão mais perto da origem)
    const livre = ordenarComFixas(ORIGEM, pts.map((p) => ({ ...p, fixa: false })));
    expect(livre.map((p) => p.id)).toEqual(['a', 'b', 'c', 'fixa']);
  });

  it('o trecho antes da âncora é otimizado com fim fixo', () => {
    const ancora: PontoRota = { ...leste('fixa', 1000), fixa: true };
    const o = ordenarComFixas(ORIGEM, [leste('z', 300), leste('y', 100), ancora]);
    expect(o.map((p) => p.id)).toEqual(['y', 'z', 'fixa']);
  });

  it('reotimização mantém a contagem: visitadas abatem a meta e o seq continua depois delas', () => {
    const pts = Array.from({ length: 8 }, (_, i) => leste(`p${i}`, 300 * (i + 1)));
    const r = planejar({ inicio: ORIGEM, partidaMin: H('14:00'), pontos: pts, params: { ...P, meta: 10 }, jaFeitas: 4 });
    expect(r.paradas.filter((x) => x.kind === 'planejada')).toHaveLength(6);
    expect(r.paradas.filter((x) => x.kind === 'reserva')).toHaveLength(2);
    expect(r.paradas[0]!.seq).toBe(5);
    expect(r.paradas.every((x) => x.kind === 'reserva' || x.eta_min! >= H('14:00'))).toBe(true);
  });

  it('reotimização a partir de outra posição muda a primeira parada', () => {
    const pts = [leste('oeste', -500), leste('leste', 5000)];
    const daqui = planejar({ inicio: { lat: 0, lng: 5000 / GRAU_M }, partidaMin: H('10:00'), pontos: pts, params: P, jaFeitas: 3 });
    const dali = planejar({ inicio: ORIGEM, partidaMin: H('10:00'), pontos: pts, params: P, jaFeitas: 3 });
    expect(daqui.paradas[0]!.id).toBe('leste');
    expect(dali.paradas[0]!.id).toBe('oeste');
  });

  it('adiada para a tarde (depois) vai para o fim e não chega antes do fim do almoço', () => {
    const pts: PontoRota[] = [{ ...leste('adiada', 50), depois: true }, leste('b', 400), leste('c', 600)];
    const r = planejar({ inicio: ORIGEM, partidaMin: H('10:00'), pontos: pts, params: P });
    expect(r.paradas.map((x) => x.id)).toEqual(['b', 'c', 'adiada']);
    expect(r.paradas[2]!.eta_min).toBeGreaterThanOrEqual(H('13:00'));
  });

  it('mantém a ordem dada em calcularRelogio (edição manual da equipe)', () => {
    const ordem = [leste('longe', 900), leste('perto', 100)];
    const r = calcularRelogio({ inicio: ORIGEM, partidaMin: H('09:00'), ordem, params: P });
    expect(r.paradas.map((x) => x.id)).toEqual(['longe', 'perto']);
  });

  it('linha reta (offline) reordena pelo mais próximo e preserva fixas', () => {
    const pts: PontoRota[] = [leste('longe', 900), leste('perto', 100), { ...leste('ancora', 500), fixa: true }, leste('x', 700)];
    expect(reordenarLinhaReta(ORIGEM, pts).map((p) => p.id)).toEqual(['perto', 'longe', 'ancora', 'x']);
  });
});

describe('seleção automática', () => {
  it('encadeia vizinhos (cluster contíguo) e corta em n', () => {
    const pts = [leste('a', 100), leste('b', 200), leste('c', 300), { id: 'norte', lat: 0.05, lng: 0 }];
    expect(selecionarEncadeados(ORIGEM, pts, 3).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(selecionarEncadeados(ORIGEM, pts, 0)).toEqual([]);
  });
});

describe('ritmo', () => {
  it('conta a conta: 480 min úteis ÷ 30 = 16 min por visita', () => {
    const r = ritmo({ agoraMin: H('11:30'), feitas: 12, params: P });
    expect(r.minutos_por_visita_ritmo).toBe(16);
    expect(minutosUteisAte(H('11:30'), P)).toBe(150);
    expect(r.esperadas).toBe(9);
    expect(r.delta).toBe(3);
    expect(r.faltam).toBe(18);
  });
  it('almoço não conta; antes e depois da janela saturam', () => {
    expect(minutosUteisAte(H('12:30'), P)).toBe(180);
    expect(minutosUteisAte(H('13:00'), P)).toBe(180);
    expect(minutosUteisAte(H('08:00'), P)).toBe(0);
    expect(minutosUteisAte(H('20:00'), P)).toBe(480);
    expect(ritmo({ agoraMin: H('20:00'), feitas: 24, params: P })).toMatchObject({ esperadas: 30, delta: -6, faltam: 6 });
  });
});

describe('configuração', () => {
  it('padrões e lixo no banco caem no padrão', () => {
    expect(lerConfigRota(null)).toEqual(CONFIG_ROTA_PADRAO);
    expect(lerConfigRota({ meta_diaria: 'x', janela_inicio: '25:00', velocidade_kmh: 5 })).toMatchObject({
      meta_diaria: 30,
      janela_inicio: '09:00',
      velocidade_kmh: 5,
    });
  });
  it('horários incoerentes no banco voltam ao padrão juntos', () => {
    const c = lerConfigRota({ janela_inicio: '19:00' });
    expect([c.janela_inicio, c.janela_fim]).toEqual(['09:00', '18:00']);
  });
  it('PUT parcial: valida faixa, chave desconhecida e coerência', () => {
    expect(aplicarConfigRota(CONFIG_ROTA_PADRAO, { meta_diaria: 20 })).toMatchObject({ ok: true, config: { meta_diaria: 20 } });
    expect(aplicarConfigRota(CONFIG_ROTA_PADRAO, { meta_diaria: 0 })).toMatchObject({ ok: false });
    expect(aplicarConfigRota(CONFIG_ROTA_PADRAO, { meta_diaria: 20.5 })).toMatchObject({ ok: false });
    expect(aplicarConfigRota(CONFIG_ROTA_PADRAO, { foo: 1 })).toMatchObject({ ok: false });
    expect(aplicarConfigRota(CONFIG_ROTA_PADRAO, { almoco_inicio: '08:00' })).toMatchObject({ ok: false });
    expect(aplicarConfigRota(CONFIG_ROTA_PADRAO, { almoco_inicio: '11:30', almoco_fim: '12:30' })).toMatchObject({ ok: true });
  });
});

describe('minutesSp (hora de Brasília, não UTC)', () => {
  it('converte o instante UTC para minutos do dia em Brasília', () => {
    expect(minutesSp(new Date('2026-10-20T14:00:00Z'))).toBe(11 * 60);
    expect(minutesSp(new Date('2026-10-20T02:30:00Z'))).toBe(23 * 60 + 30); // ainda dia 19 em Brasília
    expect(minutesSp(new Date('2026-10-20T03:00:00Z'))).toBe(0);
  });
});

describe('P0 §30 — modo de deslocamento a pé / de carro', () => {
  const pontos = (n: number): PontoRota[] =>
    Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, lat: -23.6 - i * 0.01, lng: -46.66 }));
  const inicio = { lat: -23.6, lng: -46.66 };

  it('catálogo e padrão', () => {
    expect(MODOS_DESLOCAMENTO).toEqual(['a_pe', 'carro']);
    expect(VELOCIDADE_CARRO_PADRAO).toBe(25);
  });
  it('velocidadeDoModo: a pé usa a configuração; carro usa a do carro; fotografada vence o padrão', () => {
    expect(velocidadeDoModo('a_pe', CONFIG_ROTA_PADRAO, 25)).toBe(4.5);
    expect(velocidadeDoModo('carro', CONFIG_ROTA_PADRAO, 25)).toBe(25);
    expect(velocidadeDoModo('carro', CONFIG_ROTA_PADRAO, 40)).toBe(40);
    expect(velocidadeDoModo('qualquer', CONFIG_ROTA_PADRAO, 25)).toBe(4.5);
  });
  it('paramsDaConfig(config) sem segundo argumento fica idêntico ao de antes (a pé)', () => {
    expect(paramsDaConfig(CONFIG_ROTA_PADRAO).velocidadeKmh).toBe(4.5);
    expect(paramsDaConfig(CONFIG_ROTA_PADRAO, 25).velocidadeKmh).toBe(25);
  });
  it('a conta: 1 km em linha reta x 1,3 = 1.300 m → 18 min a pé, 4 min de carro', () => {
    expect(caminhadaMin(1300, 4.5)).toBe(18);
    expect(caminhadaMin(1300, 25)).toBe(4);
  });
  it('de carro as paradas chegam antes e cabem mais paradas na mesma janela', () => {
    const base = { inicio, partidaMin: 540, pontos: pontos(40) };
    const aPe = planejar({ ...base, params: { ...paramsDaConfig({ ...CONFIG_ROTA_PADRAO, meta_diaria: 100 }) } });
    const carro = planejar({ ...base, params: { ...paramsDaConfig({ ...CONFIG_ROTA_PADRAO, meta_diaria: 100 }, 25) } });
    const plan = (x: typeof aPe) => x.paradas.filter((p) => p.kind === 'planejada');
    expect(plan(carro).length).toBeGreaterThan(plan(aPe).length);
    expect(plan(carro)[3]!.eta_min!).toBeLessThan(plan(aPe)[3]!.eta_min!);
  });
  it('texto da conta escrito para a tela', () => {
    expect(textoDoModo('a_pe', 4.5, 1.3)).toBe('A pé: 4,5 km/h × desvio de rua 1,3');
    expect(textoDoModo('carro', 25, 1.3)).toBe('De carro: 25 km/h × desvio de rua 1,3 (média urbana, sem estacionar)');
  });
});

describe('P0 §30 — retornos ancorados com hora', () => {
  const ini = { lat: -23.6, lng: -46.66 };
  it('com hora primeiro (por hora); sem hora pelo vizinho mais próximo do último', () => {
    const r = [
      { id: 'longe', lat: -23.7, lng: -46.66 },
      { id: 'tarde', lat: -23.62, lng: -46.66, hora: '16:00' },
      { id: 'perto', lat: -23.601, lng: -46.66 },
      { id: 'cedo', lat: -23.65, lng: -46.66, hora: '09:30' },
    ];
    expect(ordenarRetornosAncorados(ini, r).map((x) => x.id)).toEqual(['cedo', 'tarde', 'perto', 'longe']);
  });
  it('sem nenhuma hora o resultado é o do vizinho mais próximo (comportamento anterior)', () => {
    const r = [{ id: 'b', lat: -23.7, lng: -46.66 }, { id: 'a', lat: -23.601, lng: -46.66 }];
    expect(ordenarRetornosAncorados(ini, r)).toEqual(ordenarVizinhoMaisProximo(ini, r));
  });
});
