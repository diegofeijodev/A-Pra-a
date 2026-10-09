import { describe, expect, it } from 'vitest';
import type { ItemFila, VisitAnswers } from '../campo.types';
import { planejarRascunho, classificar, nomeDaVisita, pontoDeTrilhaUtil, proximaTentativa, substituidos, seguirSemConferirParecidos, temEnvioDepoisDoCheckout } from '../fila-politica';

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

describe('rascunho novo: o checkout da visita vem depois dele, o resto da fila mantém a ordem', () => {
  const novo = { kind: 'answers', visit_ref: 'v1', payload: R } as const;
  const info = { consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 5 };
  const seqs = (l: { seq?: number }[]) => l.map((i) => i.seq);
  const ck = (seq: number, ref: string, extra = {}): ItemFila => ({ ...base, seq, kind: 'checkout', visit_ref: ref, payload: POS, ...extra });
  const rs = (seq: number, ref: string): ItemFila => ({ ...base, seq, kind: 'answers', visit_ref: ref, payload: R });
  const checkin = (seq: number, ref: string): ItemFila =>
    ({ ...base, seq, kind: 'checkin', payload: { client_id: ref, place_name: 'Bar', ...POS }, foto: new Blob() }) as ItemFila;
  const forma = (l: { kind: string; visit_ref?: string; payload?: unknown }[]) =>
    l.map((i) => `${i.kind}:${i.visit_ref ?? (i.payload as { client_id?: string })?.client_id ?? ''}`);

  it('checkout v1 bloqueado na frente de check-in v2: v1 (rascunho + checkout) primeiro, v2 depois, na ordem', () => {
    const fila = [ck(1, 'v1', { bloqueio: 'Falta' }), checkin(2, 'v2'), rs(3, 'v2'), ck(4, 'v2')];
    const plano = planejarRascunho(fila, novo, info, true);
    expect(plano.remover.sort()).toEqual([1, 2, 3, 4]);
    expect(forma(plano.adicionar)).toEqual(['answers:v1', 'checkout:v1', 'checkin:v2', 'answers:v2', 'checkout:v2']);
    expect(plano.adicionar.some((i) => 'bloqueio' in i && i.bloqueio)).toBe(false);
    expect(plano.adicionar.every((i) => !('seq' in i))).toBe(true);
  });

  it('um "end" depois do checkout continua depois dele', () => {
    const fila = [ck(1, 'v1'), { ...base, seq: 2, kind: 'end', payload: POS } as ItemFila];
    expect(forma(planejarRascunho(fila, novo, info, true).adicionar)).toEqual(['answers:v1', 'checkout:v1', 'end:']);
  });

  it('rascunho antigo e não enviado da mesma visita é substituído', () => {
    const fila = [rs(1, 'v1'), ck(2, 'v1')];
    const plano = planejarRascunho(fila, novo, info, true);
    expect(plano.remover.sort()).toEqual([1, 2]);
    expect(forma(plano.adicionar)).toEqual(['answers:v1', 'checkout:v1']);
  });

  it('sem checkout na fila: só acrescenta o rascunho (e troca o antigo)', () => {
    const fila = [rs(1, 'v1'), rs(2, 'v2'), checkin(3, 'v3')];
    const plano = planejarRascunho(fila, novo, info, true);
    expect(plano.remover).toEqual([1]);
    expect(forma(plano.adicionar)).toEqual(['answers:v1']);
    expect(plano.adicionar[0]).toMatchObject({ consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 5 });
  });

  it('rascunho INCOMPLETO: fica antes do checkout, que continua bloqueado', () => {
    const fila = [ck(1, 'v1', { bloqueio: 'Falta' }), checkin(2, 'v2')];
    const plano = planejarRascunho(fila, novo, info, false);
    expect(forma(plano.adicionar)).toEqual(['answers:v1', 'checkout:v1', 'checkin:v2']);
    const co = plano.adicionar[1];
    expect('bloqueio' in co && co.bloqueio).toBe('Falta');
  });

  it('rascunho COMPLETO: o checkout perde o bloqueio', () => {
    const plano = planejarRascunho([ck(1, 'v1', { bloqueio: 'Falta' })], novo, info, true);
    expect('bloqueio' in plano.adicionar[1]).toBe(false);
  });

  it('itens antes do checkout não se mexem', () => {
    const fila = [checkin(1, 'v1'), ck(2, 'v1')];
    expect(seqs(fila) && planejarRascunho(fila, novo, info, true).remover.sort()).toEqual([2]);
  });
});

describe('nome da visita para avisar o consultor', () => {
  it('check-in na fila, depois retrato do /today, depois "visita"', () => {
    const f = [{ ...base, seq: 1, kind: 'checkin', payload: { client_id: 'v1', place_name: 'Bar Novo', ...POS }, foto: new Blob() }] as ItemFila[];
    expect(nomeDaVisita('v1', f, [])).toBe('Bar Novo');
    expect(nomeDaVisita('v2', [], [{ client_id: 'v2', lead_name: 'Padaria' }])).toBe('Padaria');
    expect(nomeDaVisita('v3', [], [])).toBe('visita');
  });
});

describe('temEnvioDepoisDoCheckout', () => {
  const base = { consultant_id: 'c', tentativas: 0, proxima_em: 0, criado_em: 0 };
  const pos = { at: 'x', lat: 0, lng: 0, accuracy: 1 };
  const co = { kind: 'checkout', visit_ref: 'a', payload: pos, seq: 2, ...base } as ItemFila;
  it('checkin ou end depois do checkout', () => {
    expect(temEnvioDepoisDoCheckout([co, { kind: 'end', payload: pos, seq: 3, ...base } as ItemFila], 2)).toBe(true);
    expect(
      temEnvioDepoisDoCheckout([co, { kind: 'checkin', payload: { client_id: 'b', place_name: 'B', ...pos }, foto: new Blob(), seq: 3, ...base } as ItemFila], 2),
    ).toBe(true);
  });
  it('só rascunho ou itens antes: não', () => {
    expect(temEnvioDepoisDoCheckout([co, { kind: 'end', payload: pos, seq: 1, ...base } as ItemFila], 2)).toBe(false);
    expect(temEnvioDepoisDoCheckout([co], 2)).toBe(false);
  });
});

describe('seguirSemConferirParecidos', () => {
  it('rede, timeout, 5xx e NO_OPEN_JOURNEY seguem; outras recusas não', () => {
    expect(seguirSemConferirParecidos(undefined)).toBe(true);
    expect(seguirSemConferirParecidos(408)).toBe(true);
    expect(seguirSemConferirParecidos(503)).toBe(true);
    expect(seguirSemConferirParecidos(409, 'NO_OPEN_JOURNEY')).toBe(true);
    expect(seguirSemConferirParecidos(409, 'OTHER')).toBe(false);
    expect(seguirSemConferirParecidos(400)).toBe(false);
    expect(seguirSemConferirParecidos(401)).toBe(false);
  });
});
