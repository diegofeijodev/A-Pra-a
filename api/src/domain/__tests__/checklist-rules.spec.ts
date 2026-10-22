import {
  CONFIG_CHECKLIST,
  ETAPAS_PADRAO,
  fotografarChecklist,
  lerFotoChecklist,
  mesclarMarcas,
  pendenciasChecklist,
  prepararItensChecklist,
  resumoChecklist,
  viewDoChecklist,
} from '../checklist-rules';

const gerador = () => {
  let n = 0;
  return () => `etapa_${String(++n).padStart(8, '0')}`;
};

describe('etapas padrão (Lovable checklist_visita)', () => {
  it('as 7 etapas, na ordem, com "cupom" no lugar de "voucher" e ids estáveis', () => {
    expect(ETAPAS_PADRAO.map((e) => e.id)).toEqual([
      'apresentacao',
      'entender_negocio',
      'identificar_necessidade',
      'apresentar_solucao',
      'oferecer_cupom',
      'tratar_objecoes',
      'fechamento',
    ]);
    expect(ETAPAS_PADRAO[4]!.text).toBe('Oferecer o cupom da 1ª contratação grátis');
    expect(ETAPAS_PADRAO.map((e) => e.text).join(' ').toLowerCase()).not.toContain('voucher');
  });
  it('configuração ausente = Lovable: 7 etapas, não obrigatório, nos dois fluxos, começa aberto', () => {
    expect(CONFIG_CHECKLIST.ler({})).toEqual({
      checklist_items: ETAPAS_PADRAO,
      checklist_obrigatorio: 'nao',
      checklist_fluxos: ['simples', 'completo'],
      checklist_aberto: true,
    });
  });
  it('gravado inválido volta ao padrão chave a chave', () => {
    const c = CONFIG_CHECKLIST.ler({ checklist_items: [], checklist_obrigatorio: 'sim', checklist_fluxos: ['outro'], checklist_aberto: 'x' });
    expect(c).toEqual(CONFIG_CHECKLIST.padrao);
  });
  it('fluxos: lista vazia é válida (nossa versão, sem checklist)', () => {
    expect(CONFIG_CHECKLIST.aplicar(CONFIG_CHECKLIST.padrao, { checklist_fluxos: [] })).toMatchObject({ ok: true, config: { checklist_fluxos: [] } });
    expect(CONFIG_CHECKLIST.aplicar(CONFIG_CHECKLIST.padrao, { checklist_fluxos: ['simples', 'simples'] }).ok).toBe(false);
  });
});

describe('prepararItensChecklist (PUT)', () => {
  it('item sem id ganha id do servidor; id enviado é mantido; texto aparado', () => {
    const r = prepararItensChecklist([{ id: 'apresentacao', text: ' Apresentação ' }, { text: 'Nova etapa' }, { id: null, text: 'Outra' }], gerador());
    expect(r).toEqual({
      ok: true,
      itens: [
        { id: 'apresentacao', text: 'Apresentação' },
        { id: 'etapa_00000001', text: 'Nova etapa' },
        { id: 'etapa_00000002', text: 'Outra' },
      ],
    });
  });
  it.each([
    ['lista vazia', []],
    ['mais de 20', Array.from({ length: 21 }, (_, i) => ({ text: `e${i}` }))],
    ['texto vazio', [{ text: '   ' }]],
    ['texto longo', [{ text: 'x'.repeat(121) }]],
    ['id inválido', [{ id: 'Com Espaço', text: 'a' }]],
    ['id repetido', [{ id: 'a', text: 'a' }, { id: 'a', text: 'b' }]],
    ['campo a mais', [{ id: 'a', text: 'a', done: true }]],
    ['não é lista', 'x'],
  ])('%s → erro com o campo', (_n, raw) => {
    const r = prepararItensChecklist(raw, gerador());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.startsWith('checklist_items:')).toBe(true);
  });
});

describe('foto no check-in e marcas', () => {
  const cfg = { ...CONFIG_CHECKLIST.padrao, checklist_items: ETAPAS_PADRAO.slice(0, 3) };

  it('só nos fluxos configurados; leva o "obrigatório" daquele instante', () => {
    expect(fotografarChecklist(cfg, 'simples')).toEqual({
      required: 'nao',
      items: ETAPAS_PADRAO.slice(0, 3).map((e) => ({ ...e, done: false, note: null })),
    });
    expect(fotografarChecklist({ ...cfg, checklist_fluxos: ['completo'] }, 'simples')).toBeNull();
    expect(fotografarChecklist({ ...cfg, checklist_obrigatorio: 'todas' }, 'completo')?.required).toBe('todas');
  });

  it('a foto não muda quando a configuração muda (a cópia é independente)', () => {
    const foto = fotografarChecklist(cfg, 'simples')!;
    cfg.checklist_items[0] = { id: 'apresentacao', text: 'mudou' } as never;
    expect(foto.items[0]!.text).toBe('Apresentação pessoal e da empresa');
  });

  it('mesclar: atualiza done/note das etapas citadas; id desconhecido ignorado; nota vazia = null; o resto fica', () => {
    const foto = fotografarChecklist({ ...CONFIG_CHECKLIST.padrao, checklist_items: ETAPAS_PADRAO.slice(0, 3) }, 'simples')!;
    const m = mesclarMarcas(foto, [
      { id: 'apresentacao', done: true },
      { id: 'entender_negocio', note: '  quer preço  ' },
      { id: 'nao_existe', done: true },
    ]);
    expect(m.items.map((i) => [i.id, i.done, i.note])).toEqual([
      ['apresentacao', true, null],
      ['entender_negocio', false, 'quer preço'],
      ['identificar_necessidade', false, null],
    ]);
    expect(mesclarMarcas(m, [{ id: 'entender_negocio', note: '   ' }]).items[1]!.note).toBeNull();
    expect(foto.items[0]!.done).toBe(false); // sem efeito colateral
  });

  it('pendências: só com "todas" na FOTO; posição na lista; singular e plural', () => {
    const base = fotografarChecklist({ ...CONFIG_CHECKLIST.padrao, checklist_items: ETAPAS_PADRAO.slice(0, 5) }, 'simples')!;
    expect(pendenciasChecklist(base)).toEqual([]);
    const todas = { ...base, required: 'todas' as const };
    expect(pendenciasChecklist(mesclarMarcas(todas, [{ id: 'apresentacao', done: true }, { id: 'entender_negocio', done: true }, { id: 'apresentar_solucao', done: true }]))).toEqual([
      'roteiro da visita (etapas 3, 5)',
    ]);
    const quase = mesclarMarcas(todas, ETAPAS_PADRAO.slice(0, 4).map((e) => ({ id: e.id, done: true })));
    expect(pendenciasChecklist(quase)).toEqual(['roteiro da visita (etapa 5)']);
    expect(pendenciasChecklist(mesclarMarcas(quase, [{ id: 'oferecer_cupom', done: true }]))).toEqual([]);
    expect(pendenciasChecklist(null)).toEqual([]);
  });

  it('leitura defensiva da coluna; view com a contagem; resumo do CRM sem as observações', () => {
    expect(lerFotoChecklist(null)).toBeNull();
    expect(lerFotoChecklist({ required: 'x', items: [] })).toBeNull();
    expect(lerFotoChecklist({ required: 'nao', items: [{ id: 'a', text: 'A', done: 'sim', note: null }] })).toBeNull();
    const foto = mesclarMarcas(fotografarChecklist(cfg, 'simples')!, [{ id: 'apresentacao', done: true, note: 'segredo' }]);
    expect(lerFotoChecklist(JSON.parse(JSON.stringify(foto)))).toEqual(foto);
    expect(viewDoChecklist(foto)).toMatchObject({ required: 'nao', done: 1, total: 3 });
    expect(resumoChecklist(foto)).toBe('Roteiro da conversa: 1 de 3 etapas.');
    expect(resumoChecklist(foto)).not.toContain('segredo');
  });
});
