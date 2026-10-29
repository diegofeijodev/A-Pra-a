import type { CartaoFreela } from '../freela-cartao';
import {
  alvoDasContratacoes,
  casarCartao,
  leadsDisputados,
  normalizarCidade,
  pracaDoCartao,
  telefoneNacional,
  type IndicesQuadro,
  type PracaCobertura,
} from '../crm-quadro-rules';

const cartao = (o: Partial<CartaoFreela> = {}): CartaoFreela => ({
  userId: 'u-1',
  name: 'Bar do Zé',
  city: 'Belo Horizonte',
  state: 'MG',
  whatsappPhone: '+55 31 98765-4321',
  hiringsCount: 0,
  registeredAt: '2026-10-20T15:00:00Z',
  ...o,
});

type LeadDaChave = { lead_id: string; phone: string; praca_id: string | null; freela_user_id: string | null };

const indices = (o: Partial<IndicesQuadro> = {}): IndicesQuadro => ({
  porFreelaUserId: new Map(),
  porCadastro: new Map(),
  porChave: new Map(),
  assistidos: new Set(),
  ...o,
});

/** Leads com o mesmo `phone_key` (últimos 9 dígitos) que o cartão de BH. */
const naChave = (...leads: LeadDaChave[]) => new Map([['987654321', leads]]);

const BH = 'praca-bh';
const SP = 'praca-sp';

describe('telefoneNacional', () => {
  it('tira +55 e a máscara', () => expect(telefoneNacional('+55 31 98765-4321')).toBe('31987654321'));
  it('9 dígitos (sem DDD) não é telefone nacional', () => expect(telefoneNacional('987654321')).toBeNull());
  it('fixo com DDD (10 dígitos) vale', () => expect(telefoneNacional('(31) 3333-4444')).toBe('3133334444'));
  it('DDD 55 sem o +55 não perde o DDD', () => expect(telefoneNacional('55987654321')).toBe('55987654321'));
  it('nulo ou vazio dá null', () => {
    expect(telefoneNacional(null)).toBeNull();
    expect(telefoneNacional('')).toBeNull();
  });
});

describe('casarCartao', () => {
  it('freela_user_id conhecido vence o telefone', () => {
    const idx = indices({
      porFreelaUserId: new Map([['u-1', ['lead-id']]]),
      porChave: naChave({ lead_id: 'lead-tel', phone: '31987654321', praca_id: BH, freela_user_id: null }),
    });
    expect(casarCartao(cartao(), idx, new Set([BH]))).toEqual({ lead_id: 'lead-id', por: 'id' });
  });

  it('dois leads com o mesmo freela_user_id → ambíguo', () => {
    const idx = indices({ porFreelaUserId: new Map([['u-1', ['lead-a', 'lead-b']]]) });
    expect(casarCartao(cartao(), idx, new Set())).toEqual({ ambiguo: true });
  });

  it('cadastro do representante (field_signups) com um lead casa por cadastro, antes do telefone', () => {
    const idx = indices({
      porCadastro: new Map([['u-1', ['lead-cad']]]),
      porChave: naChave({ lead_id: 'lead-tel', phone: '31987654321', praca_id: BH, freela_user_id: null }),
    });
    expect(casarCartao(cartao(), idx, new Set([BH]))).toEqual({ lead_id: 'lead-cad', por: 'cadastro' });
  });

  it('field_signups com 2 leads → ambíguo', () => {
    const idx = indices({ porCadastro: new Map([['u-1', ['lead-a', 'lead-b']]]) });
    expect(casarCartao(cartao(), idx, new Set())).toEqual({ ambiguo: true });
  });

  it('o mesmo lead repetido em field_signups é um lead só', () => {
    const idx = indices({ porCadastro: new Map([['u-1', ['lead-a', 'lead-a']]]) });
    expect(casarCartao(cartao(), idx, new Set())).toEqual({ lead_id: 'lead-a', por: 'cadastro' });
  });

  it('número inteiro igual → casa por telefone, mesmo com o lead fora das praças de BH', () => {
    const idx = indices({
      porChave: naChave(
        { lead_id: 'lead-31', phone: '(31) 98765-4321', praca_id: SP, freela_user_id: null },
        { lead_id: 'lead-11', phone: '11987654321', praca_id: SP, freela_user_id: null },
      ),
    });
    expect(casarCartao(cartao(), idx, new Set([BH]))).toEqual({ lead_id: 'lead-31', por: 'telefone' });
  });

  it('mesma chave em 31… e 11…, cartão de outro DDD e nenhum lead em praça de BH → null', () => {
    const idx = indices({
      porChave: naChave(
        { lead_id: 'lead-31', phone: '31987654321', praca_id: SP, freela_user_id: null },
        { lead_id: 'lead-11', phone: '11987654321', praca_id: SP, freela_user_id: null },
      ),
    });
    expect(casarCartao(cartao({ whatsappPhone: '21987654321' }), idx, new Set([BH]))).toBeNull();
  });

  it('mesma chave em 31… e 11…, os dois em praças de BH → ambíguo', () => {
    const idx = indices({
      porChave: naChave(
        { lead_id: 'lead-31', phone: '31987654321', praca_id: BH, freela_user_id: null },
        { lead_id: 'lead-11', phone: '11987654321', praca_id: 'praca-contagem', freela_user_id: null },
      ),
    });
    expect(casarCartao(cartao({ whatsappPhone: '21987654321' }), idx, new Set([BH, 'praca-contagem']))).toEqual({
      ambiguo: true,
    });
  });

  it('um lead pelo número inteiro e outro pela praça de BH → ambíguo', () => {
    const idx = indices({
      porChave: naChave(
        { lead_id: 'lead-31', phone: '31987654321', praca_id: SP, freela_user_id: null },
        { lead_id: 'lead-11', phone: '11987654321', praca_id: BH, freela_user_id: null },
      ),
    });
    expect(casarCartao(cartao(), idx, new Set([BH]))).toEqual({ ambiguo: true });
  });

  it('chave igual com DDD diferente, lead numa praça de BH → casa por telefone', () => {
    const idx = indices({
      porChave: naChave({ lead_id: 'lead-bh', phone: '987654321', praca_id: BH, freela_user_id: null }),
    });
    expect(casarCartao(cartao({ whatsappPhone: '21987654321' }), idx, new Set([BH]))).toEqual({
      lead_id: 'lead-bh',
      por: 'telefone',
    });
  });

  it('lead sem praça não passa pela praça', () => {
    const idx = indices({
      porChave: naChave({ lead_id: 'lead-x', phone: '11987654321', praca_id: null, freela_user_id: null }),
    });
    expect(casarCartao(cartao(), idx, new Set([BH]))).toBeNull();
  });

  it('lead que já tem outro freela_user_id → ambíguo', () => {
    const idx = indices({
      porChave: naChave({ lead_id: 'lead-31', phone: '31987654321', praca_id: BH, freela_user_id: 'u-outro' }),
    });
    expect(casarCartao(cartao(), idx, new Set([BH]))).toEqual({ ambiguo: true });
  });

  it('telefone do cartão sem DDD (9 dígitos) nem tenta o telefone', () => {
    const idx = indices({
      porChave: naChave({ lead_id: 'lead-31', phone: '31987654321', praca_id: BH, freela_user_id: null }),
    });
    expect(casarCartao(cartao({ whatsappPhone: '987654321' }), idx, new Set([BH]))).toBeNull();
    expect(casarCartao(cartao({ whatsappPhone: null }), idx, new Set([BH]))).toBeNull();
  });

  it('nada conhecido → null', () => expect(casarCartao(cartao(), indices(), new Set([BH]))).toBeNull());
});

describe('leadsDisputados', () => {
  it('lead apontado por dois cartões na mesma rodada', () => {
    const r = leadsDisputados([
      { lead_id: 'lead-a', por: 'telefone' },
      { lead_id: 'lead-b', por: 'id' },
      { lead_id: 'lead-a', por: 'cadastro' },
      { ambiguo: true },
      null,
    ]);
    expect([...r]).toEqual(['lead-a']);
  });
});

describe('normalizarCidade', () => {
  it('sem acento, minúscula, espaço único', () => expect(normalizarCidade('  São   João del-Rei ')).toBe('sao joao del-rei'));
});

describe('pracaDoCartao', () => {
  const hoje = '2026-10-28';
  const praca = (o: Partial<PracaCobertura> = {}): PracaCobertura => ({
    id: 'p-bh',
    start_date: '2026-10-01',
    end_date: '2026-12-31',
    cidades: [{ cidade: 'belo horizonte', uf: 'MG' }],
    ...o,
  });

  it('"Belo Horizonte"/"MG" casa "belo horizonte"', () => expect(pracaDoCartao(cartao(), [praca()], hoje)).toBe('p-bh'));

  it('acento, caixa e UF minúscula não atrapalham', () =>
    expect(pracaDoCartao(cartao({ city: 'São Paulo', state: 'sp' }), [praca({ id: 'p-sp', cidades: [{ cidade: 'Sao Paulo', uf: 'SP' }] })], hoje)).toBe('p-sp'));

  it('"Contagem" pela vizinha (resolvida com UF)', () => {
    const p = praca({ cidades: [{ cidade: 'belo horizonte', uf: 'MG' }, { cidade: 'contagem', uf: 'MG' }] });
    expect(pracaDoCartao(cartao({ city: 'Contagem' }), [p], hoje)).toBe('p-bh');
  });

  it('mesmo nome de cidade em outra UF não casa', () =>
    expect(pracaDoCartao(cartao({ city: 'Belo Horizonte', state: 'SP' }), [praca()], hoje)).toBeNull());

  it('registeredAt 2026-10-11T02:30:00Z = 10/10 em Brasília, antes do início 12/10 → null', () =>
    expect(pracaDoCartao(cartao({ registeredAt: '2026-10-11T02:30:00Z' }), [praca({ start_date: '2026-10-12' })], hoje)).toBeNull());

  it('2026-10-12T03:30:00Z = 00:30 de 12/10 em Brasília, no dia do início → casa', () =>
    expect(pracaDoCartao(cartao({ registeredAt: '2026-10-12T03:30:00Z' }), [praca({ start_date: '2026-10-12' })], hoje)).toBe('p-bh'));

  it('duas praças → a de start_date mais recente', () => {
    const antiga = praca({ id: 'p-antiga', start_date: '2026-09-01' });
    const nova = praca({ id: 'p-nova', start_date: '2026-10-05' });
    expect(pracaDoCartao(cartao(), [antiga, nova], hoje)).toBe('p-nova');
    expect(pracaDoCartao(cartao(), [nova, antiga], hoje)).toBe('p-nova');
  });

  it('mesmo início → o menor id (sempre a mesma)', () => {
    const b = praca({ id: 'p-b' });
    const a = praca({ id: 'p-a' });
    expect(pracaDoCartao(cartao(), [b, a], hoje)).toBe('p-a');
  });

  it('praça fechada (end_date < hoje) fica fora', () => {
    const fechada = praca({ id: 'p-fechada', start_date: '2026-10-10', end_date: '2026-10-27' });
    expect(pracaDoCartao(cartao(), [fechada], hoje)).toBeNull();
    expect(pracaDoCartao(cartao(), [fechada, praca()], hoje)).toBe('p-bh');
  });

  it('praça que ainda não começou (start_date > hoje) fica fora', () =>
    expect(pracaDoCartao(cartao(), [praca({ start_date: '2026-10-29' })], hoje)).toBeNull());

  it('último dia da praça (end_date = hoje) ainda vale', () =>
    expect(pracaDoCartao(cartao(), [praca({ end_date: hoje })], hoje)).toBe('p-bh'));

  it('cartão sem cidade ou sem UF → null', () => {
    expect(pracaDoCartao(cartao({ city: null }), [praca()], hoje)).toBeNull();
    expect(pracaDoCartao(cartao({ state: null }), [praca()], hoje)).toBeNull();
  });

  it('registeredAt que não é data → null, sem lançar', () =>
    expect(pracaDoCartao(cartao({ registeredAt: 'ontem' }), [praca()], hoje)).toBeNull());
});

describe('alvoDasContratacoes', () => {
  const hoje = '2026-10-28';
  const x = (o: Partial<Parameters<typeof alvoDasContratacoes>[0]> = {}) => ({
    hirings: 0,
    antes: null,
    hoje,
    dia_viu_primeira: null,
    assistido: false,
    ...o,
  });

  it('0 contratações → 5', () => expect(alvoDasContratacoes(x())).toBe(5));
  it('0 contratações de cadastro assistido → null (o 5 vem do sync)', () =>
    expect(alvoDasContratacoes(x({ assistido: true }))).toBeNull());
  it('1 → 6 (assistido também)', () => {
    expect(alvoDasContratacoes(x({ hirings: 1 }))).toBe(6);
    expect(alvoDasContratacoes(x({ hirings: 1, assistido: true }))).toBe(6);
  });
  it('2 na 1ª observação (antes: null) → 7', () => expect(alvoDasContratacoes(x({ hirings: 2 }))).toBe(7));
  it('de 1 para 2 com dia_viu_primeira === hoje → 6', () =>
    expect(alvoDasContratacoes(x({ hirings: 2, antes: 1, dia_viu_primeira: hoje }))).toBe(6));
  it('de 1 para 2 com dia_viu_primeira anterior → 7', () =>
    expect(alvoDasContratacoes(x({ hirings: 2, antes: 1, dia_viu_primeira: '2026-10-27' }))).toBe(7));
  it('de 0 para 2 sem nunca ter visto 1 → 6', () => expect(alvoDasContratacoes(x({ hirings: 2, antes: 0 }))).toBe(6));
  it('já tinha 2 ou mais → 7', () => expect(alvoDasContratacoes(x({ hirings: 3, antes: 2, dia_viu_primeira: hoje }))).toBe(7));
});
