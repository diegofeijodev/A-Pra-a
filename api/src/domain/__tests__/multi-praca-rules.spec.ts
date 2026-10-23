/**
 * Consultor em várias praças (L12, contrato §44) — regras puras: o conjunto, a praça ativa do request, a praça da jornada,
 * a praça do início do dia, a praça única dos leads de um roteiro e o conjunto novo que o admin grava.
 */
import {
  conjuntoDe,
  conjuntoNovo,
  MAX_PRACAS_POR_CONSULTOR,
  pracaAtiva,
  pracaDaJornada,
  pracaDoInicio,
  pracaUnicaDosLeads,
} from '../multi-praca-rules';

const A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-0000000000bb';
const C = '00000000-0000-4000-8000-0000000000cc';

describe('conjuntoDe (§44.3)', () => {
  it('a principal vem primeiro e nunca se repete', () => {
    expect(conjuntoDe(A, [B, A, C, B])).toEqual([A, B, C]);
  });
  it('sem junção = só a principal (o de hoje)', () => {
    expect(conjuntoDe(A, [])).toEqual([A]);
  });
});

describe('pracaAtiva (§44.4)', () => {
  it('sem jornada aberta = a principal', () => {
    expect(pracaAtiva({ principal: A, extras: [B], jornadaAberta: undefined })).toBe(A);
  });
  it('jornada aberta numa praça do conjunto = a praça da jornada', () => {
    expect(pracaAtiva({ principal: A, extras: [B], jornadaAberta: B })).toBe(B);
  });
  it('jornada antiga com praça nula = a principal', () => {
    expect(pracaAtiva({ principal: A, extras: [B], jornadaAberta: null })).toBe(A);
  });
  it('a praça da jornada saiu do conjunto = a principal (o acesso cai na hora)', () => {
    expect(pracaAtiva({ principal: A, extras: [], jornadaAberta: B })).toBe(A);
  });
  it('a principal mudou e a jornada é da antiga, que não está marcada = a nova principal', () => {
    expect(pracaAtiva({ principal: C, extras: [B], jornadaAberta: A })).toBe(C);
  });
});

describe('pracaDaJornada (§44.2: nulo = principal)', () => {
  it('nulo vira a principal; explícito fica', () => {
    expect(pracaDaJornada(null, A)).toBe(A);
    expect(pracaDaJornada(undefined, A)).toBe(A);
    expect(pracaDaJornada(B, A)).toBe(B);
  });
});

describe('pracaDoInicio (§44.5)', () => {
  const base = { principal: A, conjunto: [A, B], doRoteiro: null as string | null };

  it('desligada: ausente, null ou igual à principal = como hoje (não grava praça)', () => {
    for (const pedida of [undefined, null, A]) {
      expect(pracaDoInicio({ ...base, ligado: false, pedida })).toEqual({ ok: true, praca_id: null });
    }
  });
  it('desligada: outra praça = MULTI_PRACA_DISABLED (mesmo que estivesse no conjunto)', () => {
    expect(pracaDoInicio({ ...base, ligado: false, pedida: B })).toEqual({ ok: false, erro: 'MULTI_PRACA_DISABLED' });
  });
  it('ligada: pedida no conjunto = ela', () => {
    expect(pracaDoInicio({ ...base, ligado: true, pedida: B })).toEqual({ ok: true, praca_id: B });
  });
  it('ligada: pedida fora do conjunto = NOT_IN_SET (404)', () => {
    expect(pracaDoInicio({ ...base, ligado: true, pedida: C })).toEqual({ ok: false, erro: 'NOT_IN_SET' });
  });
  it('ligada: sem pedido, a do roteiro de hoje (se no conjunto)', () => {
    expect(pracaDoInicio({ ...base, ligado: true, pedida: null, doRoteiro: B })).toEqual({ ok: true, praca_id: B });
  });
  it('ligada: sem pedido e roteiro fora do conjunto (ou sem roteiro) = a principal, gravada explícita', () => {
    expect(pracaDoInicio({ ...base, ligado: true, pedida: undefined, doRoteiro: C })).toEqual({ ok: true, praca_id: A });
    expect(pracaDoInicio({ ...base, ligado: true, pedida: undefined, doRoteiro: null })).toEqual({ ok: true, praca_id: A });
  });
  it('ligada: o pedido vale mais que o roteiro', () => {
    expect(pracaDoInicio({ ...base, ligado: true, pedida: A, doRoteiro: B })).toEqual({ ok: true, praca_id: A });
  });
});

describe('pracaUnicaDosLeads (§44.7)', () => {
  it('todos numa praça do conjunto = ela', () => {
    expect(pracaUnicaDosLeads([B, B], [A, B])).toEqual({ ok: true, praca_id: B });
  });
  it('algum fora do conjunto = FORA (a frase de hoje)', () => {
    expect(pracaUnicaDosLeads([A, C], [A, B])).toEqual({ ok: false, erro: 'FORA' });
  });
  it('praças diferentes do conjunto = MISTURADAS', () => {
    expect(pracaUnicaDosLeads([A, B], [A, B])).toEqual({ ok: false, erro: 'MISTURADAS' });
  });
  it('lista vazia = FORA (não decide praça)', () => {
    expect(pracaUnicaDosLeads([], [A])).toEqual({ ok: false, erro: 'FORA' });
  });
});

describe('conjuntoNovo (PUT /v1/consultores/:id/pracas, §44.7)', () => {
  it('guarda só as extras, sem repetir, sem a principal', () => {
    expect(conjuntoNovo(A, [B, A, C, B])).toEqual({ ok: true, extras: [B, C] });
  });
  it('só a principal = nenhuma extra', () => {
    expect(conjuntoNovo(A, [A])).toEqual({ ok: true, extras: [] });
  });
  it('sem a principal = erro com o campo', () => {
    const r = conjuntoNovo(A, [B]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/^praca_ids: a praça principal/);
  });
  it('vazio ou acima do teto = erro com o campo', () => {
    const vazio = conjuntoNovo(A, []);
    expect(vazio.ok).toBe(false);
    const muitos = conjuntoNovo(A, [A, ...Array.from({ length: MAX_PRACAS_POR_CONSULTOR }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)]);
    expect(muitos.ok).toBe(false);
    if (!muitos.ok) expect(muitos.erro).toMatch(/^praca_ids: no máximo 20/);
  });
});
