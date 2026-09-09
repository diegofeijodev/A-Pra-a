import { templateMetrics, type MetricsLead, type MetricsSend } from '../template-metrics';

const TPL = 'tpl-1';

const send = (over: Partial<MetricsSend> = {}): MetricsSend => ({
  template_id: TPL,
  lead_id: 'l1',
  variant: 'A',
  status: 'enviada',
  sent_at: '2026-09-10T12:00:00.000Z',
  stage_at_send: 2,
  ...over,
});

const LEADS: Record<string, MetricsLead> = {
  // Avançou (3 > 2) e a mudança de etapa está na janela de 7 dias do envio.
  l1: { stage: 3, stage_since: '2026-09-08' },
  // Avançou, mas a mudança é de muito antes do envio.
  l2: { stage: 3, stage_since: '2026-07-01' },
  // Não avançou.
  l3: { stage: 2, stage_since: '2026-09-09' },
};

describe('templateMetrics', () => {
  it('sem envio, tudo zero e sem vencedor', () => {
    const m = templateMetrics(TPL, [], LEADS);
    expect(m).toEqual({
      sent: 0,
      responded: 0,
      resp_rate: 0,
      advanced: 0,
      adv_rate: 0,
      a: { sent: 0, responded: 0, rate: 0 },
      b: { sent: 0, responded: 0, rate: 0 },
      winner: '—',
    });
  });

  it('ignora envio de outro modelo e o que ainda está na fila', () => {
    const m = templateMetrics(TPL, [send(), send({ template_id: 'tpl-2' }), send({ status: 'fila' })], LEADS);
    expect(m.sent).toBe(1);
  });

  it('taxa de resposta é respondida / enviada', () => {
    const m = templateMetrics(
      TPL,
      [send({ status: 'respondida' }), send(), send({ status: 'entregue' })],
      LEADS,
    );
    expect(m.responded).toBe(1);
    expect(m.resp_rate).toBeCloseTo(1 / 3);
  });

  it('conta como avançado só dentro da janela de 7 dias', () => {
    const m = templateMetrics(
      TPL,
      [send({ lead_id: 'l1' }), send({ lead_id: 'l2' }), send({ lead_id: 'l3' })],
      LEADS,
    );
    expect(m.advanced).toBe(1);
    expect(m.adv_rate).toBeCloseTo(1 / 3);
  });

  it('envio sem sent_at ou de lead desconhecido não conta como avançado', () => {
    const m = templateMetrics(TPL, [send({ sent_at: null }), send({ lead_id: 'sumiu' })], LEADS);
    expect(m.advanced).toBe(0);
  });

  it('quebra por variante A e B', () => {
    const m = templateMetrics(
      TPL,
      [send({ variant: 'A', status: 'respondida' }), send({ variant: 'A' }), send({ variant: 'B' })],
      LEADS,
    );
    expect(m.a).toEqual({ sent: 2, responded: 1, rate: 0.5 });
    expect(m.b).toEqual({ sent: 1, responded: 0, rate: 0 });
  });

  it('só declara vencedor com 3 envios de cada lado e taxas diferentes', () => {
    const a = [send({ variant: 'A', status: 'respondida' }), send({ variant: 'A' }), send({ variant: 'A' })];
    const b = [send({ variant: 'B' }), send({ variant: 'B' }), send({ variant: 'B' })];
    expect(templateMetrics(TPL, [...a, ...b], LEADS).winner).toBe('A');
    // Com só 2 de cada lado ninguém vence — amostra pequena demais.
    expect(templateMetrics(TPL, [...a.slice(0, 2), ...b.slice(0, 2)], LEADS).winner).toBe('—');
    // Empate técnico também não tem vencedor.
    const empate = [...a.slice(1), send({ variant: 'A' }), ...b];
    expect(templateMetrics(TPL, empate, LEADS).winner).toBe('—');
  });
});
