import { contarCadastros, fonteDoDia, fonteDoPeriodo } from '../cadastros-dia-rules';
import { PRESET_CHEFE, REGRA_PADRAO } from '../earnings-rules';
import { calcularNota, centesimos, CONFIG_RESUMO_DIA, decimos, duracaoTexto, resumoDia, type EntradaResumoDia } from '../resumo-dia-rules';

const PESOS = { peso_rota: 7, peso_conversao: 3, meta_pct: 30 };
const nota = (planejadas: number, feitas: number, visitas: number, cadastros: number, o: Partial<typeof PESOS> = {}) =>
  calcularNota({ planejadas, feitas, visitas, cadastros, ...PESOS, ...o });

describe('calcularNota (Lovable resumoRota, em inteiros)', () => {
  it('vetores da Lovable: 20 de 20 com 6 cadastros = 10; meia rota sem cadastro = 3,5', () => {
    expect(nota(20, 20, 20, 6).nota10).toBe(100);
    expect(nota(20, 10, 10, 0).nota10).toBe(35);
  });
  it('30% de positivação vale a parte cheia; acima disso não passa de 3; rota com teto de 100%', () => {
    expect(nota(20, 20, 20, 20).nota10).toBe(100);
    expect(nota(20, 40, 40, 12).nota10).toBe(100);
    expect(nota(30, 24, 24, 6)).toEqual({ nota10: 81, rota100: 560, conversao100: 250, soma100: 810 });
  });
  it('sem nada planejado ou sem visita: as parcelas são 0, nunca NaN', () => {
    expect(nota(0, 0, 0, 0)).toEqual({ nota10: 0, rota100: 0, conversao100: 0, soma100: 0 });
    expect(nota(10, 0, 0, 0).nota10).toBe(0);
  });
  it('sem ponto flutuante: 6 de 20 (30%) dá exatamente a parte cheia', () => {
    expect(nota(20, 20, 20, 6).conversao100).toBe(300);
  });
  it('J3: as parcelas escritas, somadas e arredondadas, dão a nota (casos de borda)', () => {
    // 15/20 = 0,75 da rota e 0,225/0,30 = 0,75 dos cadastros: 5,25 + 2,25 = 7,50 → 7,5
    expect(nota(20, 15, 40, 9)).toEqual({ nota10: 75, rota100: 525, conversao100: 225, soma100: 750 });
    // 16/21 da rota (5,333…) e 1/9 ÷ 0,3 dos cadastros (1,111…): soma 6,444… → 6,4
    const n = nota(21, 16, 9, 1);
    expect(n.nota10).toBe(64);
    expect(n.rota100 + n.conversao100).toBe(n.soma100);
    for (let p = 1; p <= 30; p += 1)
      for (let f = 0; f <= p; f += 3)
        for (let v = 1; v <= 30; v += 4)
          for (let c = 0; c <= v; c += 2) {
            const x = nota(p, f, v, c);
            expect(Math.floor((2 * x.soma100 * 10 + 100) / 200)).toBe(x.nota10);
          }
  });
  it('pesos configuráveis (5 + 5, alvo 50%)', () => {
    expect(nota(10, 5, 10, 5, { peso_rota: 5, peso_conversao: 5, meta_pct: 50 }).nota10).toBe(75);
  });
  it('formatação', () => {
    expect(centesimos(560)).toBe('5,60');
    expect(centesimos(5)).toBe('0,05');
    expect(decimos(81)).toBe('8,1');
    expect(decimos(100)).toBe('10,0');
    expect(duracaoTexto(520)).toBe('8h40');
    expect(duracaoTexto(45)).toBe('45 min');
  });
});

describe('CONFIG_RESUMO_DIA (§33.2)', () => {
  it('padrão = Lovable (nota, 7/3, 30%, 75 min)', () => {
    expect(CONFIG_RESUMO_DIA.ler({})).toEqual({ ui_resumo_dia: 'nota', nota_peso_rota: 7, nota_peso_conversao: 3, nota_meta_conversao_pct: 30, nota_intervalo_alerta_min: 75 });
  });
  it('pesos precisam somar 10 (PUT sobre o estado mesclado); gravado incoerente volta aos padrões', () => {
    const atual = CONFIG_RESUMO_DIA.padrao;
    expect(CONFIG_RESUMO_DIA.aplicar(atual, { nota_peso_rota: 6 })).toEqual({ ok: false, erro: 'nota_peso_rota: os pesos da nota precisam somar 10 (6 + 3 = 9).' });
    expect(CONFIG_RESUMO_DIA.aplicar(atual, { nota_peso_rota: 6, nota_peso_conversao: 4 })).toMatchObject({ ok: true });
    expect(CONFIG_RESUMO_DIA.ler({ nota_peso_rota: 9, nota_peso_conversao: 3 })).toMatchObject({ nota_peso_rota: 7, nota_peso_conversao: 3 });
    expect(CONFIG_RESUMO_DIA.aplicar(atual, { ui_resumo_dia: 'grafico' })).toMatchObject({ ok: false });
    expect(CONFIG_RESUMO_DIA.aplicar(atual, { nota_meta_conversao_pct: 0 })).toMatchObject({ ok: false });
  });
});

describe('cadastrosDoDia: a fonte segue a versão da regra vigente no dia (§33.3)', () => {
  const versoes = [
    { version: 1, valid_from: '1970-01-01', config: REGRA_PADRAO },
    { version: 2, valid_from: '2026-10-20', config: PRESET_CHEFE },
  ];
  it('antes da versão do chefe = confirmados; a partir dela = declarados', () => {
    expect(fonteDoDia(versoes, '2026-10-19')).toBe('freela_confirmed');
    expect(fonteDoDia(versoes, '2026-10-20')).toBe('declared');
    expect(fonteDoDia([], '2026-10-20')).toBe('freela_confirmed');
  });
  it('conta a fonte do dia (declarações todas, sem o limite diário) e diz quando o período mistura', () => {
    expect(contarCadastros({ signups: 2, declared: 5 }, 'declared')).toBe(5);
    expect(contarCadastros({ signups: 2, declared: 5 }, 'freela_confirmed')).toBe(2);
    expect(contarCadastros(undefined, 'declared')).toBe(0);
    expect(fonteDoPeriodo(['declared', 'freela_confirmed'])).toBe('misto');
    expect(fonteDoPeriodo([])).toBe('freela_confirmed');
  });
});

describe('resumoDia', () => {
  // 22/10 de Brasília: 09:02 → 17:42 (12:02Z → 20:42Z).
  const base: EntradaResumoDia = {
    agora: new Date('2026-10-22T20:43:00.000Z'),
    diaAberto: false,
    jornadas: [{ started_at: new Date('2026-10-22T12:02:00.000Z'), ended_at: new Date('2026-10-22T20:42:00.000Z') }],
    intervaloMin: null,
    rota: { planejadas: 30, visitadas: 24 },
    meta: 30,
    visitasConcluidas: 24,
    duracoesMin: [5, 7, 9],
    cadastros: 6,
    fonte: 'declared',
    syncLigado: false,
    cuponsLigados: false,
    cfg: CONFIG_RESUMO_DIA.padrao,
  };

  it('o exemplo da UX: 24 de 30, 6 de 24 → 5,60 + 2,50 = 8,1, tempos em Brasília', () => {
    const r = resumoDia(base);
    expect(r).toMatchObject({ nota: 8.1, partes: { rota: 5.6, conversao: 2.5 }, cumprimento_pct: 80, positivacao_pct: 25, planned_source: 'roteiro', total_min: 520, first_start: '09:02', last_end: '17:42', avg_visit_min: 7, intervalo_min: null });
    expect(r.conta).toContain('Soma: 5,60 + 2,50 = 8,10 → nota 8,1 (arredondada para 1 casa).');
    expect(r.avaliacao).toEqual([
      'Você visitou 80% da rota. Planejar o tempo em cada estabelecimento pode ajudar a fechar o roteiro completo.',
      'Para aumentar os cadastros, reforce os benefícios do Freela.',
      'Dia muito produtivo. Obrigado pelo empenho!',
    ]);
    expect(r.avaliacao.join(' ')).not.toMatch(/voucher/i);
  });

  it('sem roteiro: a meta do dia é o denominador e a conta diz isso', () => {
    const r = resumoDia({ ...base, rota: null, visitasConcluidas: 15 });
    expect(r).toMatchObject({ planned: 30, planned_source: 'meta', route_visited: null, cumprimento_pct: 50 });
    expect(r.conta.some((l) => l.includes('da meta do dia, sem roteiro hoje'))).toBe(true);
  });

  it('confirmados com a sincronização desligada (produção hoje): positivação 0, nota máxima 7, sem a frase de conversão', () => {
    const r = resumoDia({ ...base, fonte: 'freela_confirmed', cadastros: 0, rota: { planejadas: 30, visitadas: 30 } });
    expect(r.nota).toBe(7);
    expect(r.conta).toContain('A sincronização com o Freela está desligada neste servidor: os cadastros confirmados ficam em 0, a positivação é 0 e a nota máxima é 7.');
    expect(r.conta.some((l) => l.includes('pode ser de visita de outro dia'))).toBe(true);
    expect(r.avaliacao.some((l) => l.includes('aumentar os cadastros'))).toBe(false);
  });

  it('"numeros" (nossa versão): sem nota nem fórmula; os números continuam', () => {
    const r = resumoDia({ ...base, cfg: { ...base.cfg, ui_resumo_dia: 'numeros' } });
    expect(r.nota).toBeNull();
    expect(r.partes).toBeNull();
    expect(r.conta.join(' ')).not.toMatch(/Nota de 0 a 10|Soma:/);
    expect(r.cumprimento_pct).toBe(80);
  });

  it('dia aberto: jornada sem fim conta até agora e a conta avisa', () => {
    const r = resumoDia({ ...base, diaAberto: true, jornadas: [{ started_at: new Date('2026-10-22T12:02:00.000Z'), ended_at: null }] });
    expect(r.total_min).toBe(521);
    expect(r.last_end).toBeNull();
    expect(r.conta).toContain('Dia ainda aberto: a conta é até agora.');
  });

  it('frase do cupom só com o módulo de cupons; ótima conversão acima do alvo; rota excelente', () => {
    expect(resumoDia({ ...base, cuponsLigados: true }).avaliacao[1]).toContain('cupom da 1ª contratação');
    const r = resumoDia({ ...base, rota: { planejadas: 30, visitadas: 29 }, visitasConcluidas: 29, cadastros: 9 });
    expect(r.avaliacao.slice(0, 2)).toEqual(['Excelente cumprimento da rota. Parabéns pela disciplina no roteiro!', 'Ótima conversão em cadastros. Continue nesse ritmo!']);
  });
});
