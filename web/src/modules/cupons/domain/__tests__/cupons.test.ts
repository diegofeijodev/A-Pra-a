import { describe, expect, it } from 'vitest';
import {
  campoCupomSchema,
  linkWhatsApp,
  listaCuponsSchema,
  mensagemWhatsApp,
  pedidoDoLead,
  podePedirCupom,
  resumoDoCupom,
  situacaoParaConsultor,
  situacaoParaEquipe,
  SITUACOES,
  type CampoCupom,
} from '../cupons';

const PADRAO = { discount_type: 'PERCENT' as const, percent_off: 100, amount_off_cents: null, single_use: true, validade_dias: 30, min_job_hours: null };
const cupom = (o: Partial<CampoCupom> = {}): CampoCupom => ({
  id: 'v1', client_id: 'c1', lead_id: 'l1', visit_id: null, company_name: 'Padaria Bom Pão', city: 'BH', uf: 'MG', segment: 'Padaria',
  freelas_per_week: 3, status: 'pendente', situacao: 'pedido', decision_reason: null, decided_at: null, coupon_status: null,
  coupon_code: null, coupon_expires_at: null, redeemed_at: null, created_at: '2026-10-22T15:00:00.000Z', coupon: null, ...o,
});

describe('cupons — textos (UX §3.2)', () => {
  it('cada situação tem ícone e texto para o consultor e para a equipe; nenhum diz "voucher"', () => {
    for (const s of SITUACOES) {
      const c = situacaoParaConsultor({ ...cupom({ situacao: s }) });
      const e = situacaoParaEquipe({ situacao: s, decision_reason: null, decided_by_name: null, redeemed_at: null, coupon_error: null });
      for (const t of [c, e]) {
        expect(t.icone.length).toBeGreaterThan(0);
        expect(t.texto.length).toBeGreaterThan(3);
        expect(t.texto.toLowerCase()).not.toContain('voucher');
      }
    }
  });
  it('código, motivo e datas de Brasília', () => {
    expect(situacaoParaConsultor(cupom({ situacao: 'criado', coupon_code: 'PRACA-7K2M9Q' })).texto).toBe('Cupom pronto: PRACA-7K2M9Q');
    expect(situacaoParaConsultor(cupom({ situacao: 'reprovado', decision_reason: 'Fora do perfil' })).texto).toBe('Não aprovado: Fora do perfil');
    expect(situacaoParaEquipe({ situacao: 'reprovado', decision_reason: 'Fora do perfil', decided_by_name: 'Diego', redeemed_at: null, coupon_error: null }).texto).toBe('Reprovado por Diego: Fora do perfil');
    expect(situacaoParaEquipe({ situacao: 'usado', decision_reason: null, decided_by_name: null, redeemed_at: '2026-10-24T02:00:00.000Z', coupon_error: null }).texto).toBe('Usado em 23/10');
    expect(situacaoParaEquipe({ situacao: 'aguardando_freela', decision_reason: null, decided_by_name: null, redeemed_at: null, coupon_error: null }).texto).toBe(
      'Aprovado — aguardando conexão com o Freela',
    );
  });
  it('resumo do desconto igual ao do servidor', () => {
    expect(resumoDoCupom(PADRAO)).toBe('100% de desconto · vale 1 vez · 30 dias');
    expect(resumoDoCupom({ ...PADRAO, discount_type: 'FIXED', percent_off: null, amount_off_cents: 5000, validade_dias: null, min_job_hours: 6 })).toBe(
      'R$ 50,00 de desconto · vale 1 vez · sem prazo · vagas de 6h ou mais',
    );
  });
});

describe('cupons — quando pedir e o que mostrar', () => {
  it('o botão aparece em Cadastrou agora, Quer retorno e Sem interesse; some em Fechado e Já usa o Freela (aceite C9)', () => {
    expect(['cadastrou', 'retorno', 'sem_interesse'].every(podePedirCupom)).toBe(true);
    expect(['fechado', 'ja_usa', null, undefined, ''].some(podePedirCupom)).toBe(false);
  });
  it('segundo pedido do mesmo estabelecimento mostra o existente (aceite C6)', () => {
    const lista = [cupom({ id: 'a', created_at: '2026-10-20T10:00:00Z' }), cupom({ id: 'b', created_at: '2026-10-21T10:00:00Z' }), cupom({ id: 'c', lead_id: 'outro' })];
    expect(pedidoDoLead(lista, 'l1')?.id).toBe('b');
    expect(pedidoDoLead(lista, null)).toBeNull();
  });
  it('WhatsApp: mensagem pronta sem número no link (o consultor escolhe o contato, aceite C5)', () => {
    const m = mensagemWhatsApp(cupom({ coupon_code: 'PRACA-7K2M9Q', coupon: PADRAO, coupon_expires_at: '2026-11-22T02:59:59.000Z' }), 'Ana');
    expect(m).toBe('Olá! Aqui é Ana, do Freela. Seu cupom de 1ª contratação: PRACA-7K2M9Q (100% de desconto, vale 1 vez, até 21/11).');
    expect(linkWhatsApp(m)).toMatch(/^https:\/\/wa\.me\/\?text=Ol%C3%A1/);
  });
});

describe('cupons — wire (§38.3/§38.4)', () => {
  it('aceita campos aditivos do servidor e a lista com as contagens', () => {
    expect(campoCupomSchema.parse({ ...cupom(), coisa_nova: 1 }).id).toBe('v1');
    const lista = listaCuponsSchema.parse({ items: [], counts: { pedido: 0, todos: 0 }, coupons_enabled: false, freela_configured: false, extra: true });
    expect(lista.counts.todos).toBe(0);
  });
});
