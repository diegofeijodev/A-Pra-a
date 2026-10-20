import { describe, expect, it } from 'vitest';
import { atencaoSchema, diaCurto, followupsSchema, linkLigar, linkWhatsApp, porcentagem, ritmoDaLinha, rotuloVencimento, rotuloVencimentoComHora, type GoalView } from '../atencao';

const goal = (over: Partial<GoalView> = {}): GoalView => ({
  meta: 30, feitas: 8, esperadas: 17, delta: -9, faltam: 22, minutos_uteis: 280, minutos_por_visita_ritmo: 16, dia_de_trabalho: true, conta: 'c', fonte: 'f', ...over,
});

describe('links de contato (abertos pela própria pessoa)', () => {
  it('tel: e wa.me com DDI 55 quando falta, sem duplicar quando já tem', () => {
    expect(linkLigar('(11) 99999-0000')).toBe('tel:+5511999990000');
    expect(linkLigar('5511999990000')).toBe('tel:+5511999990000');
    expect(linkWhatsApp('(11) 99999-0000')).toBe('https://wa.me/5511999990000');
    expect(linkWhatsApp('+55 11 99999-0000')).toBe('https://wa.me/5511999990000');
    expect(linkWhatsApp('11 3333-4444')).toBe('https://wa.me/551133334444');
  });

  it('número curto ou vazio não vira link', () => {
    expect(linkLigar('')).toBeNull();
    expect(linkWhatsApp('1234-567')).toBeNull();
    expect(linkWhatsApp('—')).toBeNull();
  });

  it('texto opcional vai codificado', () => {
    expect(linkWhatsApp('11999990000', 'Oi, Marta! Voltando ao assunto.')).toBe('https://wa.me/5511999990000?text=Oi%2C%20Marta!%20Voltando%20ao%20assunto.');
  });
});

describe('ritmoDaLinha', () => {
  it('à frente, no ponto e atrás: ícone + palavra', () => {
    expect(ritmoDaLinha(goal({ delta: 3 }), 'em_jornada')).toEqual({ texto: '✓ 3 à frente', ok: true });
    expect(ritmoDaLinha(goal({ delta: 0 }), 'em_jornada')).toEqual({ texto: '✓ no ponto', ok: true });
    expect(ritmoDaLinha(goal(), 'nao_iniciou')).toEqual({ texto: '⚠ 9 atrás', ok: false });
  });

  it('dia sem expediente não cobra ritmo; quem encerrou mostra o total', () => {
    expect(ritmoDaLinha(goal({ dia_de_trabalho: false }), 'nao_iniciou')).toEqual({ texto: 'Dia sem expediente', ok: true });
    expect(ritmoDaLinha(goal({ feitas: 31 }), 'encerrou')).toEqual({ texto: 'Encerrou com 31 de 30', ok: true });
    expect(ritmoDaLinha(goal(), 'encerrou').ok).toBe(false);
  });
});

describe('textos', () => {
  it('vencimento do retorno', () => {
    expect(rotuloVencimento({ due: 'hoje', days_late: 0 })).toBe('Hoje');
    expect(rotuloVencimento({ due: 'atrasado', days_late: 1 })).toBe('Atrasado há 1 dia');
    expect(rotuloVencimento({ due: 'atrasado', days_late: 12 })).toBe('Atrasado há 12 dias');
  });

  it('porcentagem limitada a 100 e meta zero não divide por zero', () => {
    expect(porcentagem(8, 30)).toBe(27);
    expect(porcentagem(45, 30)).toBe(100);
    expect(porcentagem(1, 0)).toBe(100);
    expect(diaCurto('2026-10-19')).toBe('19/10');
  });
});

describe('contrato §25 no fio', () => {
  it('aceita a resposta de attention e a de followups', () => {
    const a = {
      day: '2026-10-20', generated_at: '2026-10-20T17:00:00.000Z', now: '14:00', dia_de_trabalho: true,
      thresholds: { alerta_inicio_apos_min: 30, alerta_visita_aberta_min: 40, alerta_sem_registro_min: 30, alerta_ritmo_atras: 5, alerta_parada_vencida_min: 30 },
      alerts: [{ code: 'nao_iniciou', severity: 'alta', consultant_id: 'c', consultant_name: 'Bruno', praca_id: 'p', praca_name: 'SP', phone: '', message: 'm', conta: 'c', since: null }],
      consultants: [{ consultant_id: 'c', name: 'Bruno', praca_id: 'p', praca_name: 'SP', phone: '', status: 'nao_iniciou', goal: goal(), alerts: [] }],
    };
    expect(atencaoSchema.parse(a).alerts).toHaveLength(1);
    expect(() => atencaoSchema.parse({ ...a, alerts: [{ ...a.alerts[0], code: 'outro' }] })).toThrow();
    const f = { day: '2026-10-20', today: 0, overdue: 0, total: 0, truncated: false, items: [] };
    expect(followupsSchema.parse(f).items).toEqual([]);
  });
});

describe('P0 §30.3 — vencimento com hora combinada', () => {
  it('sem hora é o rótulo de antes; com hora acrescenta o horário', () => {
    expect(rotuloVencimentoComHora({ due: 'hoje', days_late: 0, followup_time: null })).toBe('Hoje');
    expect(rotuloVencimentoComHora({ due: 'hoje', days_late: 0, followup_time: '15:30' })).toBe('Hoje, combinado para 15:30');
    expect(rotuloVencimentoComHora({ due: 'atrasado', days_late: 2, followup_time: '09:00' })).toBe('Atrasado há 2 dias, combinado para 09:00');
  });
});
