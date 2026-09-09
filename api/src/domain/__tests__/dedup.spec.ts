import {
  dupKeys,
  findDuplicate,
  guessClasse,
  guessMapping,
  matchPraca,
  norm,
  rowToDraft,
  samePhone,
  type DraftLead,
  type DupCandidate,
} from '../dedup';

const draft = (over: Partial<DraftLead> = {}): DraftLead => ({
  name: 'Bar do Mercado',
  address: 'Rua 100',
  city: 'Belo Horizonte',
  phone: '(31) 98000-1000',
  instagram: '',
  decisor: '',
  classe: 'alvo',
  origem: 'importação',
  cnpj: '',
  ...over,
});

const lead = (over: Partial<DupCandidate> = {}): DupCandidate => ({
  id: 'lead-1',
  name: 'Bar do Mercado',
  address: 'Rua 100',
  phone: '(31) 98000-1000',
  cnpj: null,
  ...over,
});

describe('norm', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(norm('Rua São João, 100')).toBe('ruasaojoao100');
    expect(norm('  BELO   HORIZONTE ')).toBe('belohorizonte');
  });
});

describe('samePhone', () => {
  it('mesmo telefone com máscara diferente é o mesmo telefone', () => {
    expect(samePhone('(31) 98000-1000', '+55 31 98000 1000')).toBe(true);
    expect(samePhone('31980001000', '980001000')).toBe(true);
  });

  it('telefone curto demais não casa com nada', () => {
    expect(samePhone('1234', '1234')).toBe(false);
    expect(samePhone('', '')).toBe(false);
  });

  it('telefones diferentes não casam', () => {
    expect(samePhone('(31) 98000-1000', '(31) 98000-1001')).toBe(false);
  });
});

describe('guessClasse', () => {
  it('reconhece casa grande', () => {
    expect(guessClasse('Grande')).toBe('grande');
    expect(guessClasse('ALTA prioridade')).toBe('grande');
  });

  it('reconhece o "depois"', () => {
    expect(guessClasse('frio')).toBe('depois');
    expect(guessClasse('Baixa')).toBe('depois');
    expect(guessClasse('depois')).toBe('depois');
  });

  it('vazio e desconhecido caem em alvo', () => {
    expect(guessClasse('')).toBe('alvo');
    expect(guessClasse('   ')).toBe('alvo');
    expect(guessClasse('restaurante')).toBe('alvo');
  });
});

describe('guessMapping', () => {
  it('mapeia as colunas óbvias do arquivo', () => {
    expect(guessMapping(['Nome', 'Telefone', 'Cidade'])).toEqual({
      name: 'Nome',
      phone: 'Telefone',
      city: 'Cidade',
    });
  });

  it('acha a coluna por dica parcial e sem acento', () => {
    const map = guessMapping(['Razão Social', 'Endereço completo', 'WhatsApp', 'CNPJ']);
    expect(map.name).toBe('Razão Social');
    expect(map.address).toBe('Endereço completo');
    expect(map.phone).toBe('WhatsApp');
    expect(map.cnpj).toBe('CNPJ');
  });

  it('não usa a mesma coluna em dois campos', () => {
    const map = guessMapping(['Nome']);
    const usadas = Object.values(map);
    expect(new Set(usadas).size).toBe(usadas.length);
  });

  it('arquivo sem coluna reconhecível devolve mapa vazio', () => {
    expect(guessMapping(['col1', 'col2'])).toEqual({});
  });
});

describe('rowToDraft', () => {
  const row = {
    Nome: '  Bar do Mercado  ',
    Fone: '(31) 98000-1000',
    Porte: 'Casa grande',
    Origem: '',
  };

  it('lê a linha pelo mapa e apara os valores', () => {
    const d = rowToDraft(row, { name: 'Nome', phone: 'Fone', classe: 'Porte' }, 'importação');
    expect(d.name).toBe('Bar do Mercado');
    expect(d.phone).toBe('(31) 98000-1000');
    expect(d.classe).toBe('grande');
  });

  it('campo sem coluna mapeada vira vazio e a origem cai para a do lote', () => {
    const d = rowToDraft(row, { name: 'Nome', origem: 'Origem' }, 'importação');
    expect(d.address).toBe('');
    expect(d.city).toBe('');
    expect(d.origem).toBe('importação');
  });

  it('origem da própria linha vence a do lote', () => {
    const d = rowToDraft({ ...row, Origem: 'indicação' }, { origem: 'Origem' }, 'importação');
    expect(d.origem).toBe('indicação');
  });
});

describe('findDuplicate', () => {
  it('mesmo telefone com máscara diferente é duplicado', () => {
    const hit = findDuplicate(draft({ phone: '+55 (31) 98000-1000' }), [lead()]);
    expect(hit?.by).toBe('telefone');
    expect(hit?.lead.id).toBe('lead-1');
  });

  it('CNPJ igual (com e sem pontuação) é duplicado', () => {
    const hit = findDuplicate(draft({ phone: '', cnpj: '12.345.678/0001-90' }), [
      lead({ phone: '', cnpj: '12345678000190' }),
    ]);
    expect(hit?.by).toBe('cnpj');
  });

  it('CNPJ incompleto não vale como duplicidade', () => {
    expect(
      findDuplicate(draft({ phone: '', name: '', cnpj: '12345' }), [lead({ phone: '', cnpj: '12345' })]),
    ).toBeNull();
  });

  it('nome + endereço normalizados são duplicados', () => {
    const hit = findDuplicate(draft({ phone: '', name: 'BAR DO MERCADO', address: 'rua  100' }), [
      lead({ phone: '', name: 'Bar do Mercado', address: 'Rua 100' }),
    ]);
    expect(hit?.by).toBe('nome+endereço');
  });

  it('só o nome igual, com endereço diferente, não é duplicado', () => {
    expect(findDuplicate(draft({ phone: '', address: 'Avenida 9' }), [lead({ phone: '' })])).toBeNull();
  });

  it('telefone vence CNPJ, que vence nome+endereço', () => {
    const porTelefone = lead({ id: 'tel', name: 'Outro nome', address: 'Outro', cnpj: null });
    const porCnpj = lead({
      id: 'cnpj',
      name: 'Outro nome',
      address: 'Outro',
      phone: '',
      cnpj: '12345678000190',
    });
    const porNome = lead({ id: 'nome', phone: '', cnpj: null });
    const d = draft({ cnpj: '12.345.678/0001-90' });
    expect(findDuplicate(d, [porNome, porCnpj, porTelefone])?.lead.id).toBe('tel');
    expect(findDuplicate(d, [porNome, porCnpj])?.lead.id).toBe('cnpj');
    expect(findDuplicate(d, [porNome])?.lead.id).toBe('nome');
  });

  it('base vazia nunca acusa duplicidade', () => {
    expect(findDuplicate(draft(), [])).toBeNull();
  });

  it('candidato com chaves pré-calculadas dá o mesmo resultado', () => {
    const cru = lead({ phone: '', name: 'BAR DO MERCADO', address: 'rua  100' });
    const pronto = { ...cru, keys: dupKeys(cru) };
    const d = draft({ phone: '', cnpj: '' });
    const comChave = findDuplicate(d, [pronto]);
    const semChave = findDuplicate(d, [cru]);
    expect(comChave?.by).toBe(semChave?.by);
    expect(comChave?.lead.id).toBe(semChave?.lead.id);
    expect(comChave?.by).toBe('nome+endereço');
    expect(findDuplicate(draft(), [{ ...lead(), keys: dupKeys(lead()) }])?.by).toBe('telefone');
  });
});

describe('matchPraca', () => {
  const pracas = [
    { id: 'p1', name: 'Praça BH', city: 'Belo Horizonte' },
    { id: 'p2', name: 'Praça Contagem', city: 'Contagem' },
  ];

  it('acha a praça pela cidade, ignorando acento e caixa', () => {
    expect(matchPraca('belo horizonte', pracas)).toBe('p1');
    expect(matchPraca('CONTAGEM', pracas)).toBe('p2');
  });

  it('acha a praça pelo nome quando a cidade não bate', () => {
    expect(matchPraca('BH', pracas)).toBe('p1');
  });

  it('cidade vazia ou desconhecida fica sem praça', () => {
    expect(matchPraca('', pracas)).toBeNull();
    expect(matchPraca('Curitiba', pracas)).toBeNull();
  });
});
