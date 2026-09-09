import {
  DUP_WINDOW_DAYS,
  dupCutoff,
  isDupSend,
  partitionAudience,
  pickVariant,
  type DupSend,
} from '../disparo-rules';

const TPL = '00000000-0000-4000-8000-00000000f001';
const OUTRO = '00000000-0000-4000-8000-00000000f002';

const send = (over: Partial<DupSend> = {}): DupSend => ({
  template_id: TPL,
  scheduled_at: '2026-09-09T12:00:00.000Z',
  ...over,
});

describe('pickVariant', () => {
  it('sem divisão, todo mundo recebe A', () => {
    expect(pickVariant(0, false, true)).toBe('A');
    expect(pickVariant(1, false, true)).toBe('A');
    expect(pickVariant(7, false, true)).toBe('A');
  });

  it('divide alternando um a um: índice ímpar é B', () => {
    expect([0, 1, 2, 3, 4].map((i) => pickVariant(i, true, true))).toEqual(['A', 'B', 'A', 'B', 'A']);
  });

  it('modelo sem variante B manda A mesmo pedindo divisão', () => {
    expect([0, 1, 2].map((i) => pickVariant(i, true, false))).toEqual(['A', 'A', 'A']);
  });
});

describe('dupCutoff', () => {
  it('olha 30 dias para trás', () => {
    const agora = new Date('2026-09-09T12:00:00.000Z');
    expect(dupCutoff(agora).toISOString()).toBe('2026-08-10T12:00:00.000Z');
    expect(DUP_WINDOW_DAYS).toBe(30);
  });
});

describe('isDupSend', () => {
  const cutoff = dupCutoff(new Date('2026-09-09T12:00:00.000Z'));

  it('mesmo modelo dentro da janela tranca', () => {
    expect(isDupSend(send({ scheduled_at: '2026-09-01T10:00:00.000Z' }), TPL, cutoff)).toBe(true);
  });

  it('mesmo modelo fora da janela não tranca', () => {
    expect(isDupSend(send({ scheduled_at: '2026-07-01T10:00:00.000Z' }), TPL, cutoff)).toBe(false);
  });

  it('exatamente no limite não tranca (a comparação é estritamente depois)', () => {
    expect(isDupSend(send({ scheduled_at: cutoff.toISOString() }), TPL, cutoff)).toBe(false);
  });

  it('outro modelo não tranca', () => {
    expect(isDupSend(send({ template_id: OUTRO }), TPL, cutoff)).toBe(false);
  });

  it('envio sem modelo (cadência antiga) não tranca', () => {
    expect(isDupSend(send({ template_id: null }), TPL, cutoff)).toBe(false);
  });

  it('aceita Date além de ISO', () => {
    expect(isDupSend(send({ scheduled_at: new Date('2026-09-08T10:00:00.000Z') }), TPL, cutoff)).toBe(true);
  });
});

describe('partitionAudience', () => {
  const publico = ['a', 'b', 'c', 'd'];

  it('sem bloqueio nem trava, todo o público recebe', () => {
    const r = partitionAudience(
      publico,
      () => false,
      () => false,
    );
    expect(r.sendable).toEqual(publico);
    expect(r.blocked).toBe(0);
    expect(r.dupes).toBe(0);
  });

  it('quem está bloqueado ou repetido sai do envio', () => {
    const r = partitionAudience(
      publico,
      (x) => x === 'a',
      (x) => x === 'c',
    );
    expect(r.sendable).toEqual(['b', 'd']);
    expect(r.blocked).toBe(1);
    expect(r.dupes).toBe(1);
  });

  it('bloqueado E repetido conta nos dois números, e sai uma vez só', () => {
    const r = partitionAudience(
      publico,
      (x) => x === 'a',
      (x) => x === 'a',
    );
    expect(r.sendable).toEqual(['b', 'c', 'd']);
    expect(r.blocked).toBe(1);
    expect(r.dupes).toBe(1);
  });

  it('preserva a ordem do público (é ela que decide a variante A/B)', () => {
    const r = partitionAudience(
      ['x', 'y', 'z'],
      () => false,
      (v) => v === 'y',
    );
    expect(r.sendable).toEqual(['x', 'z']);
  });

  it('público vazio devolve zero em tudo', () => {
    const r = partitionAudience(
      [],
      () => true,
      () => true,
    );
    expect(r).toEqual({ sendable: [], blocked: 0, dupes: 0 });
  });
});
