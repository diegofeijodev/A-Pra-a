import { DEFAULT_TEMPLATE_DEFAULTS } from '../catalog/messages';
import { todaySp } from '../../common/time/dates';
import {
  firstName,
  isOptOut,
  missingVariables,
  renderTemplate,
  usedVariables,
  type RenderCtx,
} from '../template-render';

const ctx = (over: Partial<RenderCtx> = {}): RenderCtx => ({
  lead: {
    name: 'Bar do Mercado',
    decisor: 'Marcos Vieira',
    city: 'Belo Horizonte',
    address: 'Rua das Flores, 120, Savassi',
    vagas: [],
  },
  praca: { name: 'Belo Horizonte + Contagem', start_date: '2026-09-01' },
  me: { name: 'Daniel Alves' },
  neighbor: 'Bar Esquina 47',
  defaults: DEFAULT_TEMPLATE_DEFAULTS,
  ...over,
});

describe('firstName', () => {
  it('pega só o primeiro nome', () => expect(firstName('Marcos Vieira')).toBe('Marcos'));
  it('aguenta string vazia', () => expect(firstName('')).toBe(''));
  it('aguenta espaço sobrando', () => expect(firstName('  Ana Clara Freitas ')).toBe('Ana'));
});

describe('renderTemplate', () => {
  it('troca {{primeiro_nome_dono}} pelo primeiro nome do decisor', () => {
    expect(renderTemplate('Oi {{primeiro_nome_dono}}, tudo bem?', ctx())).toBe('Oi Marcos, tudo bem?');
  });

  it('troca {{estabelecimento}}, {{cidade}} e {{praca}}', () => {
    expect(renderTemplate('{{estabelecimento}} · {{cidade}} · {{praca}}', ctx())).toBe(
      'Bar do Mercado · Belo Horizonte · Belo Horizonte + Contagem',
    );
  });

  it('{{nome}} usa o decisor e cai para o estabelecimento quando não há decisor', () => {
    expect(renderTemplate('{{nome}}', ctx())).toBe('Marcos Vieira');
    const semDecisor = ctx({ lead: { ...ctx().lead!, decisor: '' } });
    expect(renderTemplate('{{nome}}', semDecisor)).toBe('Bar do Mercado');
  });

  it('{{meu_nome}} é o primeiro nome de quem está mandando', () => {
    expect(renderTemplate('{{meu_nome}}', ctx())).toBe('Daniel');
  });

  it('{{bairro}} é o último pedaço do endereço', () => {
    expect(renderTemplate('{{bairro}}', ctx())).toBe('Savassi');
  });

  it('deixa ⟨bairro⟩ visível quando o endereço está vazio', () => {
    const semEndereco = ctx({ lead: { ...ctx().lead!, address: '' } });
    expect(renderTemplate('Local: {{bairro}}', semEndereco)).toBe('Local: ⟨bairro⟩');
  });

  it('usa defaults.valor, defaults.funcao e defaults.turno', () => {
    expect(renderTemplate('{{funcao}} · {{turno}} · {{valor}}', ctx())).toBe('garçom · 18h às 00h · R$ 120');
  });

  it('defaults editados vencem os do catálogo', () => {
    const outro = ctx({ defaults: { ...DEFAULT_TEMPLATE_DEFAULTS, valor: 'R$ 200' } });
    expect(renderTemplate('{{valor}}', outro)).toBe('R$ 200');
  });

  it('{{data_vaga}} usa a primeira vaga e cai para hoje quando não há vaga', () => {
    const comVaga = ctx({ lead: { ...ctx().lead!, vagas: [{ date: '2026-10-03' }] } });
    expect(renderTemplate('{{data_vaga}}', comVaga)).toBe('2026-10-03');
    expect(renderTemplate('{{data_vaga}}', ctx())).toBe(todaySp());
  });

  it('{{data}} usa o começo da praça', () => {
    expect(renderTemplate('{{data}}', ctx())).toBe('2026-09-01');
  });

  it('{{estabelecimento_vizinho}} vem do vizinho e some sem vizinho', () => {
    expect(renderTemplate('{{estabelecimento_vizinho}}', ctx())).toBe('Bar Esquina 47');
    expect(renderTemplate('{{estabelecimento_vizinho}}', ctx({ neighbor: undefined }))).toBe(
      '⟨estabelecimento_vizinho⟩',
    );
  });

  it('extras vencem tudo', () => {
    expect(renderTemplate('{{cidade}}', ctx({ extras: { cidade: 'Contagem' } }))).toBe('Contagem');
  });

  it('variável desconhecida fica visível como ⟨variavel⟩', () => {
    expect(renderTemplate('{{inventada}}', ctx())).toBe('⟨inventada⟩');
  });

  it('aceita espaço dentro das chaves', () => {
    expect(renderTemplate('{{ cidade }}', ctx())).toBe('Belo Horizonte');
  });

  it('sem lead, o que depende do lead fica visível', () => {
    expect(renderTemplate('{{estabelecimento}} {{cidade}}', ctx({ lead: undefined }))).toBe(
      '⟨estabelecimento⟩ ⟨cidade⟩',
    );
  });
});

describe('usedVariables', () => {
  it('lista sem repetir e na ordem de uso', () => {
    expect(usedVariables('{{nome}} {{cidade}} {{nome}}')).toEqual(['nome', 'cidade']);
  });
  it('texto sem variável devolve lista vazia', () => expect(usedVariables('oi tudo bem')).toEqual([]));
});

describe('missingVariables', () => {
  it('devolve só o que ficou sem valor', () => {
    const semEndereco = ctx({ lead: { ...ctx().lead!, address: '' } });
    expect(missingVariables('{{primeiro_nome_dono}} {{bairro}}', semEndereco)).toEqual(['bairro']);
  });

  it('variável desconhecida entra como faltando', () => {
    expect(missingVariables('{{inventada}}', ctx())).toEqual(['inventada']);
  });

  it('texto com tudo preenchido não tem faltando', () => {
    expect(missingVariables('{{estabelecimento}} {{valor}}', ctx())).toEqual([]);
  });
});

describe('isOptOut', () => {
  it('pega PARE em maiúscula', () => expect(isOptOut('PARE')).toBe(true));
  it('pega frase com "não quero"', () => expect(isOptOut('não quero mais')).toBe(true));
  it('pega "me remove por favor"', () => expect(isOptOut('me remove por favor')).toBe(true));
  it('não pega "sim"', () => expect(isOptOut('sim')).toBe(false));
  it('não pega texto vazio', () => expect(isOptOut('')).toBe(false));
  it('não pega resposta normal', () => expect(isOptOut('quero saber mais sobre a vaga')).toBe(false));
});
