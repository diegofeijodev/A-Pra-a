import { describe, expect, it } from 'vitest';
import { centavosDeTexto } from '@/modules/remuneracao/domain/remuneracao';
import { atencaoSchema } from '@/modules/consultores/domain/atencao';
import {
  acoesDisponiveis,
  cartoesFinanceiro,
  seloFinanceiro,
  alertaPixSchema,
  erroDoComprovante,
  listaSchema,
  nomeDoCsv,
  ordenarFila,
  pagamentoSchema,
  pagamentosCampoSchema,
  pagoEmCentavos,
  rotuloStatus,
  textoConfirmarPagamento,
  tomDoStatus,
} from '../pagamentos';

const base = {
  id: 'p1',
  consultant_id: 'c1',
  consultant_name: 'Ana',
  praca_id: 'pr1',
  week: { from: '2026-10-19', to: '2026-10-25' },
  due_cents: 25000,
  status: 'pending' as const,
  blocked: false,
  block_reason: null,
  pix_key_type: 'cpf',
  pix_key_masked: '***.***.***-25',
  pix_date: '2026-10-26',
  pix_label: 'seg 26/10',
  paid_cents: null,
  diff_cents: null,
  diff_reason: null,
  paid_at: null,
  paid_by: null,
  method: 'pix_manual',
  has_proof: false,
  proof_mime: null,
  note: null,
  last_reason: null,
  created_at: '2026-10-26T12:00:00.000Z',
  conta: ['x'],
};

describe('estado do pagamento', () => {
  it('rótulos e tom por situação', () => {
    expect(rotuloStatus(base)).toBe('A pagar');
    expect(rotuloStatus({ status: 'pending', blocked: true })).toBe('Bloqueado: falta chave Pix');
    expect(rotuloStatus({ status: 'paid', blocked: false })).toBe('Pago');
    expect(rotuloStatus({ status: 'failed', blocked: false })).toBe('Falhou');
    expect(rotuloStatus({ status: 'cancelled', blocked: false })).toBe('Cancelado');
    expect(tomDoStatus({ status: 'paid', blocked: false })).toBe('ok');
    expect(tomDoStatus({ status: 'failed', blocked: false })).toBe('erro');
    expect(tomDoStatus({ status: 'pending', blocked: true })).toBe('erro');
    expect(tomDoStatus({ status: 'pending', blocked: false })).toBe('atencao');
    expect(tomDoStatus({ status: 'cancelled', blocked: false })).toBe('neutro');
  });

  it('ações espelham as transições do servidor', () => {
    expect(acoesDisponiveis({ status: 'pending', blocked: false })).toEqual({ pagar: true, falhou: true, tentarDeNovo: false, cancelar: true, estornar: false, verChave: true });
    expect(acoesDisponiveis({ status: 'failed', blocked: false })).toEqual({ pagar: true, falhou: false, tentarDeNovo: true, cancelar: true, estornar: false, verChave: true });
    expect(acoesDisponiveis({ status: 'paid', blocked: false })).toEqual({ pagar: false, falhou: false, tentarDeNovo: false, cancelar: false, estornar: true, verChave: true });
    expect(acoesDisponiveis({ status: 'pending', blocked: true })).toEqual({ pagar: false, falhou: false, tentarDeNovo: false, cancelar: true, estornar: false, verChave: false });
    expect(acoesDisponiveis({ status: 'cancelled', blocked: false })).toEqual({ pagar: false, falhou: false, tentarDeNovo: false, cancelar: false, estornar: false, verChave: false });
  });

  it('a fila põe o que precisa de ação primeiro', () => {
    const l = [
      { status: 'paid' as const, blocked: false, consultant_name: 'Ana' },
      { status: 'pending' as const, blocked: false, consultant_name: 'Caio' },
      { status: 'failed' as const, blocked: false, consultant_name: 'Bia' },
      { status: 'pending' as const, blocked: true, consultant_name: 'Zé' },
      { status: 'cancelled' as const, blocked: false, consultant_name: 'Ana' },
    ];
    expect(ordenarFila(l).map((x) => x.consultant_name)).toEqual(['Zé', 'Bia', 'Caio', 'Ana', 'Ana']);
  });
});

describe('confirmação com a consequência escrita', () => {
  it('valor igual: diz que só registra e que não envia dinheiro', () => {
    const t = textoConfirmarPagamento(base, 25000);
    expect(t[0]).toContain('JÁ pagou R$ 250,00');
    expect(t[0]).toContain('não envia dinheiro');
    expect(t).toHaveLength(2);
    expect(t.at(-1)).toContain('estornando');
  });

  it('a menos: a diferença vai no próximo Pix; a mais: é descontada', () => {
    expect(textoConfirmarPagamento(base, 20000)[1]).toBe('Você pagou R$ 50,00 a menos que o devido (R$ 250,00). Essa diferença entra como acréscimo na semana corrente e sai no próximo Pix.');
    expect(textoConfirmarPagamento(base, 26000)[1]).toContain('R$ 10,00 a mais');
  });
});

describe('valor pago e comprovante', () => {
  it('vazio vale o devido; vírgula e milhar; recusa lixo, zero e acima do teto', () => {
    expect(pagoEmCentavos('', 25000, centavosDeTexto)).toEqual({ ok: true, cents: 25000 });
    expect(pagoEmCentavos('200,50', 25000, centavosDeTexto)).toEqual({ ok: true, cents: 20050 });
    expect(pagoEmCentavos('1.234,00', 25000, centavosDeTexto)).toEqual({ ok: true, cents: 123400 });
    for (const t of ['abc', '0', '0,00', '-5', '100.001,00']) expect(pagoEmCentavos(t, 25000, centavosDeTexto).ok).toBe(false);
  });

  it('comprovante: JPEG, PNG ou PDF de até 5 MB', () => {
    expect(erroDoComprovante({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(erroDoComprovante({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
    expect(erroDoComprovante({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toContain('5 MB');
    expect(erroDoComprovante({ type: 'image/webp', size: 10 })).toContain('JPEG ou PNG');
    expect(erroDoComprovante({ type: 'image/png', size: 0 })).toContain('vazio');
  });

  it('nome do CSV segue o servidor', () => {
    expect(nomeDoCsv('2026-10-19')).toBe('pagamentos-pix-2026-10-19.csv');
  });
});

describe('contratos do fio', () => {
  it('lê o pagamento, a lista e a visão do consultor sem chave Pix completa', () => {
    expect(pagamentoSchema.parse(base).pix_key_masked).toBe('***.***.***-25');
    const lista = listaSchema.parse({
      week: base.week,
      pix_date: '2026-10-26',
      summary: { to_pay_cents: 25000, blocked_cents: 0, failed_cents: 0, paid_cents: 0, counts: { pending: 1, blocked: 0, failed: 0, paid: 0, cancelled: 0 }, conta: ['a'], source: 's' },
      proof_required: true,
      payouts: [base],
    });
    expect(lista.payouts).toHaveLength(1);
    const campo = pagamentosCampoSchema.parse({
      payouts: [{ id: 'p1', week: base.week, due_cents: 25000, status: 'pending', label: 'A pagar', pix_date: '2026-10-26', pix_label: 'seg 26/10', paid_cents: null, paid_at: null, has_proof: false, text: 'Pix de R$ 250,00 a pagar em seg 26/10.' }],
    });
    expect(campo.payouts[0].pix_label).toBe('seg 26/10');
  });

  it('o alerta de Pix entra na visão de "Atenção agora" só quando existe', () => {
    const alerta = { kind: 'pix_bloqueado', payout_id: 'p1', consultant_id: 'c1', name: 'Ana', week: base.week, message: 'm' };
    expect(alertaPixSchema.parse(alerta).kind).toBe('pix_bloqueado');
    const vazio = { day: '2026-10-20', generated_at: 'x', now: '10:00', dia_de_trabalho: true, thresholds: { alerta_inicio_apos_min: 1, alerta_visita_aberta_min: 1, alerta_sem_registro_min: 1, alerta_ritmo_atras: 1, alerta_parada_vencida_min: 1 }, alerts: [], consultants: [] };
    expect(atencaoSchema.parse(vazio).payout_alerts).toBeUndefined();
    expect(atencaoSchema.parse({ ...vazio, payout_alerts: [alerta] }).payout_alerts).toHaveLength(1);
  });
});

describe('Financeiro no desenho da Lovable (E5.7, UX §4.9)', () => {
  const resumo = (o: Partial<{ to_pay_cents: number; blocked_cents: number; failed_cents: number; paid_cents: number }> = {}, counts = { pending: 0, blocked: 0, failed: 0, paid: 0, cancelled: 0 }) => ({
    to_pay_cents: 0, blocked_cents: 0, failed_cents: 0, paid_cents: 0, counts, conta: [], source: 'razão', ...o,
  });
  it('Total = Já pago + Pendente; o bloqueado (fora do to_pay do servidor) entra no Pendente', () => {
    const c = cartoesFinanceiro(resumo({ to_pay_cents: 33000, blocked_cents: 12000, failed_cents: 8000, paid_cents: 50000 }, { pending: 2, blocked: 1, failed: 1, paid: 2, cancelled: 1 }));
    expect(c.map((x) => [x.titulo, x.cents])).toEqual([['Total a pagar', 95000], ['Já pago', 50000], ['Pendente', 45000]]);
    expect(c[0]!.apoio).toBe('= R$ 500,00 já pago + R$ 450,00 pendente (cancelados fora).');
    expect(c[1]!.apoio).toBe('2 pagamentos registrados como pago.');
    expect(c[2]!.apoio).toBe('4 pagamentos; inclui R$ 120,00 sem chave Pix e R$ 80,00 que falhou.');
  });
  it('semana vazia e semana só a pagar', () => {
    expect(cartoesFinanceiro(resumo()).map((x) => x.cents)).toEqual([0, 0, 0]);
    expect(cartoesFinanceiro(resumo({ to_pay_cents: 25000 }, { pending: 1, blocked: 0, failed: 0, paid: 0, cancelled: 0 }))[2]!.apoio).toBe('1 pagamento a pagar.');
  });
  it('selo da situação: Pago dd/mm (Brasília), Pendente, Falhou, Bloqueado, Cancelado', () => {
    // 01h30 de 27/10 em UTC ainda é 26/10 em Brasília.
    expect(seloFinanceiro({ status: 'paid', blocked: false, paid_at: '2026-10-27T01:30:00.000Z' })).toEqual({ rotulo: 'Pago 26/10', variante: 'default' });
    expect(seloFinanceiro({ status: 'pending', blocked: false, paid_at: null }).rotulo).toBe('Pendente');
    expect(seloFinanceiro({ status: 'pending', blocked: true, paid_at: null })).toEqual({ rotulo: 'Bloqueado', variante: 'destructive' });
    expect(seloFinanceiro({ status: 'failed', blocked: false, paid_at: null }).rotulo).toBe('Falhou');
    expect(seloFinanceiro({ status: 'cancelled', blocked: true, paid_at: null })).toEqual({ rotulo: 'Cancelado', variante: 'outline' });
  });
});
