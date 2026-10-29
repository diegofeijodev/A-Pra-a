import { describe, expect, it } from 'vitest';
import type { CandidateView, SearchRunView, SourceView } from '../../infrastructure/places.api';
import {
  AVISO_AUTO_LEADS,
  aberturaDoResultado,
  alternar,
  avisoPago,
  emAndamento,
  filtrar,
  idsParaAdicionar,
  limparVisiveis,
  mensagemVazia,
  MAX_ADICIONAR,
  progressoTexto,
  resumoTexto,
  rotuloCache,
  rotuloDistancia,
  rotuloSituacao,
  selecaoPadrao,
  selecionarVisiveis,
  textoConfirmacao,
} from '../busca';

const cand = (id: string, over: Partial<CandidateView> = {}): CandidateView => ({
  id, name: `Lugar ${id}`, category: 'bar', address: `Rua ${id}`, lat: -23.6, lng: -46.66, location_precision: 'point',
  distance_m: 100, phone: '', website: null, source: 'osm', status: 'novo', reason: null, lead_id: null, lead_name: null,
  selectable: true, ...over,
});

const run = (over: Partial<SearchRunView> = {}): SearchRunView => ({
  id: 'r', praca_id: 'p', area_id: 'a', area_name: 'Moema', source: 'osm', types: ['bar'], center: { lat: -23.6, lng: -46.66 },
  radius_m: 1500, status: 'done', found: 214, novos: 150, duplicados: 37, descartados: 27, truncated: false, est_cost_usd: 0,
  error: null, cached: false, requested_by: 'u', created_at: '2026-10-19T14:00:00.000Z', started_at: null,
  finished_at: '2026-10-19T14:01:00.000Z', expires_at: null, ...over,
});

const LISTA = [
  cand('1'),
  cand('2', { name: 'Padaria Bom Pão', address: 'R. Gaivota, 120' }),
  cand('3', { status: 'duplicado', reason: 'ja_na_praca', selectable: false }),
  cand('4', { status: 'descartado', reason: 'parece_fechado', selectable: false }),
];

describe('seleção', () => {
  it('padrão: só os novos selecionáveis; duplicado e fechado ficam de fora', () => {
    expect([...selecaoPadrao(LISTA)]).toEqual(['1', '2']);
  });
  it('alternar marca e desmarca; não selecionável é ignorado', () => {
    let s = new Set<string>();
    s = alternar(s, LISTA[0]!);
    expect(s.has('1')).toBe(true);
    s = alternar(s, LISTA[0]!);
    expect(s.has('1')).toBe(false);
    expect(alternar(s, LISTA[2]!).size).toBe(0);
  });
  it(`nunca passa de ${MAX_ADICIONAR} (limite do servidor)`, () => {
    const muitos = Array.from({ length: MAX_ADICIONAR + 20 }, (_, i) => cand(String(i)));
    expect(selecaoPadrao(muitos).size).toBe(MAX_ADICIONAR);
    const cheio = selecaoPadrao(muitos);
    expect(alternar(cheio, muitos[MAX_ADICIONAR + 5]!).size).toBe(MAX_ADICIONAR);
    expect(selecionarVisiveis(new Set(), muitos).size).toBe(MAX_ADICIONAR);
  });
  it('selecionar/limpar visíveis mexe só no que está na lista filtrada', () => {
    const base = new Set(['1', '2']);
    expect([...limparVisiveis(base, [LISTA[0]!])]).toEqual(['2']);
    expect([...selecionarVisiveis(new Set(), LISTA)].sort()).toEqual(['1', '2']);
  });
  it('idsParaAdicionar descarta o que deixou de ser selecionável', () => {
    const atual = [cand('1'), cand('2', { selectable: false, status: 'duplicado', reason: 'ja_na_praca' })];
    expect(idsParaAdicionar(new Set(['1', '2', 'sumiu']), atual)).toEqual(['1']);
  });
});

describe('filtrar', () => {
  it('por modo', () => {
    expect(filtrar(LISTA, { texto: '', modo: 'novos' }).map((c) => c.id)).toEqual(['1', '2']);
    expect(filtrar(LISTA, { texto: '', modo: 'na_praca' }).map((c) => c.id)).toEqual(['3']);
    expect(filtrar(LISTA, { texto: '', modo: 'todos' })).toHaveLength(4);
  });
  it('por texto, sem acento nem caixa, em nome e endereço', () => {
    expect(filtrar(LISTA, { texto: 'pao', modo: 'todos' }).map((c) => c.id)).toEqual(['2']);
    expect(filtrar(LISTA, { texto: 'GAIVOTA', modo: 'todos' }).map((c) => c.id)).toEqual(['2']);
  });
});

describe('textos', () => {
  it('confirmação escrita diz quantos, qual praça, origem e que ninguém recebe mensagem', () => {
    const t = textoConfirmacao(177, 'Moema');
    expect(t.titulo).toBe('Adicionar 177 estabelecimentos à praça Moema?');
    expect(t.corpo).toContain('Lead novo');
    expect(t.corpo).toContain('pesquisa automática');
    expect(t.corpo).toContain('Esta ação não envia mensagem');
    expect(t.corpo).toContain('cadência automática');
    expect(t.botao).toBe('Adicionar 177 leads');
    expect(textoConfirmacao(1, 'Moema').botao).toBe('Adicionar 1 lead');
    expect(textoConfirmacao(1, 'Moema').titulo).toBe('Adicionar 1 estabelecimento à praça Moema?');
  });
  it('progresso e resumo', () => {
    expect(progressoTexto(run({ status: 'running', found: 62 }))).toBe('Buscando… 62 encontrados até agora');
    expect(progressoTexto(run({ status: 'running', found: 0 }))).toBe('Buscando…');
    expect(progressoTexto(run({ status: 'queued' }))).toContain('Na fila');
    expect(resumoTexto(run())).toBe('Achamos 214 · 37 já estão na praça');
    expect(resumoTexto(run({ duplicados: 1 }))).toBe('Achamos 214 · 1 já está na praça');
  });
  it('rótulo do cache e vazio', () => {
    expect(rotuloCache(run())).toBe('Busca de 19/10 em Moema, 214 resultados');
    expect(mensagemVazia(run({ found: 0 }))).toBe('Nenhum estabelecimento nessa área. Aumente o raio ou tire algum tipo.');
    expect(mensagemVazia(run())).toBeNull();
  });
  it('situação e distância', () => {
    expect(rotuloSituacao({ status: 'novo', reason: null })).toBe('Novo');
    expect(rotuloSituacao({ status: 'duplicado', reason: 'ja_na_praca' })).toBe('Já está na praça');
    expect(rotuloSituacao({ status: 'descartado', reason: 'parece_fechado' })).toBe('Parece fechado');
    expect(rotuloSituacao({ status: 'adicionado', reason: null })).toBe('Adicionado');
    expect(rotuloDistancia(240)).toBe('240 m');
    expect(rotuloDistancia(1500)).toBe('1,5 km');
  });
  it('emAndamento', () => {
    expect(emAndamento(run({ status: 'queued' }))).toBe(true);
    expect(emAndamento(run({ status: 'running' }))).toBe(true);
    expect(emAndamento(run())).toBe(false);
    expect(emAndamento(undefined)).toBe(false);
  });
  it('aviso de custo só para fonte paga', () => {
    const osm: SourceView = { id: 'osm', label: 'OSM', available: true, paid: false };
    const apify: SourceView = { id: 'apify', label: 'Apify', available: true, paid: true, max_places_per_run: 300, monthly_cap: 3000, used_this_month: 120, est_cost_usd_per_run: 2.1 };
    expect(avisoPago(osm)).toBeNull();
    expect(avisoPago(apify)).toBe('Esta busca usa créditos pagos. Até 300 lugares, estimativa de até US$ 2,10. Neste mês: 120 de 3000 lugares.');
  });
});

describe('segmentos editáveis (§36)', () => {
  it('sem a flag, os 5 de hoje; com ela, os ativos com o rótulo deles', async () => {
    const { opcoesDeTipo, TIPOS, MAX_TIPOS_SEGMENTOS } = await import('../busca');
    expect(opcoesDeTipo(null)).toBe(TIPOS);
    expect(opcoesDeTipo([{ slug: 'pizzaria', label: 'Pizzaria', active: true, priority: 20 }, { slug: 'motel', label: 'Motel', active: false, priority: 50 }])).toEqual([{ id: 'pizzaria', label: 'Pizzaria' }]);
    expect(MAX_TIPOS_SEGMENTOS).toBe(10);
  });
});

describe('UX final, achado 9: o aviso da busca automática não promete sobra', () => {
  it('o aviso diz o teto, sem "ficam aqui"', () => {
    expect(AVISO_AUTO_LEADS).toBe('Os achados entram no funil sozinhos quando a busca termina (até 300 por busca).');
    expect(AVISO_AUTO_LEADS).not.toContain('ficam aqui');
  });
  it('a abertura do passo 3: com a A1 ligada, não manda "revisar antes de adicionar"', () => {
    expect(aberturaDoResultado(true)).toBe(
      'Os achados aparecem aqui; os que ainda não estão no funil entram sozinhos quando a busca termina.',
    );
    expect(aberturaDoResultado(false)).toBe(
      'Escolha uma área e o que buscar. Os resultados aparecem aqui para você revisar antes de adicionar.',
    );
  });
});
