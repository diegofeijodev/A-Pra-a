import { describe, expect, it } from 'vitest';
import type { ItemFila, VisitAnswers } from '../campo.types';
import { classificar, pontoDeTrilhaUtil, proximaTentativa, substituidos } from '../fila-politica';

const POS = { at: '2026-10-08T15:00:00.000Z', lat: -19.9, lng: -43.9, accuracy: 10 };
const R = {} as VisitAnswers;
const base = { consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 0 };

describe('classificar — o que a fila faz com cada resposta', () => {
  it.each([
    [undefined, undefined, 'rede'],
    [0, undefined, 'rede'],
    [200, undefined, 'ok'],
    [201, undefined, 'ok'],
    [401, 'UNAUTHORIZED', 'sessao'],
    [403, 'PASSWORD_CHANGE_REQUIRED', 'sessao'],
    [403, 'FORBIDDEN', 'regra'],
    [400, 'VALIDATION_ERROR', 'regra'],
    [404, 'NOT_FOUND', 'regra'],
    [409, 'VISIT_ALREADY_OPEN', 'regra'],
    [413, 'FILE_TOO_LARGE', 'regra'],
    [422, 'ANSWERS_INCOMPLETE', 'regra'],
    [408, undefined, 'rede'],
    [429, undefined, 'rede'],
    [502, 'PHOTO_STORAGE_ERROR', 'rede'],
    [503, 'PHOTO_STORAGE_NOT_CONFIGURED', 'rede'],
  ])('%s %s → %s', (status, code, esperado) => {
    expect(classificar(status as number | undefined, code as string | undefined)).toBe(esperado);
  });
});

describe('espera crescente', () => {
  it('2 s, 4 s, 8 s… até 5 min', () => {
    expect(proximaTentativa(0, 1_000)).toBe(3_000);
    expect(proximaTentativa(1, 1_000)).toBe(5_000);
    expect(proximaTentativa(2, 1_000)).toBe(9_000);
    expect(proximaTentativa(20, 1_000)).toBe(301_000);
  });
});

describe('rascunho novo substitui o anterior não enviado da mesma visita', () => {
  const fila: ItemFila[] = [
    { ...base, seq: 1, kind: 'answers', visit_ref: 'v1', payload: R },
    { ...base, seq: 2, kind: 'answers', visit_ref: 'v2', payload: R },
    { ...base, seq: 3, kind: 'end', payload: POS },
  ];

  it('só o rascunho da mesma visita sai', () => {
    expect(substituidos(fila, { kind: 'answers', visit_ref: 'v1', payload: R })).toEqual([1]);
  });

  it('outras ações nunca substituem nada', () => {
    expect(substituidos(fila, { kind: 'checkout', visit_ref: 'v1', payload: POS })).toEqual([]);
  });
});

describe('trilha', () => {
  it('descarta ponto com precisão pior que 100 m', () => {
    expect(pontoDeTrilhaUtil(100)).toBe(true);
    expect(pontoDeTrilhaUtil(101)).toBe(false);
  });
});
