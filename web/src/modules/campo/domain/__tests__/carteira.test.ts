import { describe, expect, it } from 'vitest';
import type { PagamentosCampo } from '@/modules/pagamentos/domain/pagamentos';
import type { GanhosCampo } from '@/modules/remuneracao/domain/remuneracao';
import { cartoesCarteira } from '../carteira';

const ganhos = (over: Partial<GanhosCampo> = {}): GanhosCampo =>
  ({
    rule_version: 1,
    confirmation_rule: 'x',
    source: 'razão de ganhos',
    as_of: '2026-10-27T15:00:00.000Z',
    today: { day: '2026-10-27', total_cents: 1500, confirmed_signups: 1, visits: 4, journey_open: true, conta: [] },
    week: { from: '2026-10-26', to: '2026-11-01', total_cents: 4500, extras_cents: 0, days: [], conta: [] },
    unconfirmed: { count: 0, text: '' },
    pix: { date: '2026-11-02', week_to: '2026-11-01', text: 'Pix previsto para 02/11/2026, referente a 26/10 a 01/11.' },
    previous_weeks: [{ from: '2026-10-19', to: '2026-10-25', total_cents: 9000, status: 'closed' }],
    ...over,
  }) as GanhosCampo;

const pix = (over: Partial<PagamentosCampo['payouts'][number]>): PagamentosCampo['payouts'][number] => ({
  id: 'p1',
  week: { from: '2026-10-19', to: '2026-10-25' },
  due_cents: 9000,
  status: 'pending',
  label: 'A pagar',
  pix_date: '2026-10-27',
  pix_label: 'ter 27/10',
  paid_cents: null,
  paid_at: null,
  has_proof: false,
  text: 'A pagar em ter 27/10.',
  ...over,
});

describe('Carteira: os três cartões (UX §4.14)', () => {
  it('Hoje e Esta semana pelos ganhos, com a conta na linha de apoio', () => {
    const [hoje, semana] = cartoesCarteira(ganhos(), undefined, '2026-10-27');
    expect(hoje).toEqual({ rotulo: 'Hoje', valor: 'R$ 15,00', apoio: 'ter 27/10: 1 cadastro confirmado pelo Freela' });
    expect(semana).toEqual({ rotulo: 'Esta semana', valor: 'R$ 45,00', apoio: '26/10 a 01/11, até agora' });
  });
  it('cadastro declarado diz "declarado" (lote S3)', () => {
    const [hoje] = cartoesCarteira(ganhos({ signup_source: 'declared', today: { ...ganhos().today, confirmed_signups: 2 } }), undefined, '2026-10-27');
    expect(hoje!.apoio).toBe('ter 27/10: 2 cadastros declarados');
  });
  it('Próximo Pix: o primeiro a pagar (ou que falhou), pela data, com o texto do servidor', () => {
    const p: PagamentosCampo = {
      payouts: [
        pix({ id: 'pago', status: 'paid', pix_date: '2026-10-20' }),
        pix({ id: 'depois', pix_date: '2026-11-03', pix_label: 'ter 03/11', due_cents: 100 }),
        pix({ id: 'falhou', status: 'failed', text: 'O Pix falhou; a equipe vai tentar de novo.' }),
      ],
    };
    const proximo = cartoesCarteira(ganhos(), p, '2026-10-27').at(-1);
    expect(proximo).toEqual({ rotulo: 'Próximo Pix', valor: 'R$ 90,00', apoio: 'ter 27/10 · semana 19/10 a 25/10 · O Pix falhou; a equipe vai tentar de novo.' });
  });
  it('sem Pix gerado: a data prevista dos ganhos, com o total da semana a que ela se refere', () => {
    expect(cartoesCarteira(ganhos(), { payouts: [] }, '2026-10-27').at(-1)).toEqual({
      rotulo: 'Próximo Pix',
      valor: 'R$ 45,00',
      apoio: 'Pix previsto para 02/11/2026, referente a 26/10 a 01/11.',
    });
    const anterior = ganhos({ pix: { date: '2026-10-26', week_to: '2026-10-25', text: 'Pix previsto para 26/10/2026, referente a 19/10 a 25/10.' } });
    expect(cartoesCarteira(anterior, undefined, '2026-10-26').at(-1)!.valor).toBe('R$ 90,00');
  });
  it('só os Pix (ganhos desligados): só o cartão do Pix; nada ligado: nenhum cartão', () => {
    expect(cartoesCarteira(undefined, { payouts: [pix({})] }, '2026-10-27').map((c) => c.rotulo)).toEqual(['Próximo Pix']);
    expect(cartoesCarteira(undefined, undefined, '2026-10-27')).toEqual([]);
    expect(cartoesCarteira(undefined, { payouts: [] }, '2026-10-27')).toEqual([]);
  });
});
