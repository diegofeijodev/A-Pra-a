import { describe, expect, it } from 'vitest';
import type { VisitAnswers } from '../campo.types';
import { CONFIG_VISITA_PADRAO, faltandoSimples, frasePendencia, rascunhoSimples, textoConcluir } from '../fluxo';
import { RESPOSTAS_VAZIAS } from '../questionario';
import { rotuloMotivoRecusa } from '../recusa';
import { montarDia } from '../dia-local';

const HOJE = '2026-10-20';
const base = (o: Partial<VisitAnswers> = {}): VisitAnswers => ({ ...RESPOSTAS_VAZIAS, ...o });
const PERTO = { far_from_place: false };
const contato = { interlocutor_name: 'Marcos', interlocutor_role: 'dono', contact_phone: '11987654321' } as const;
const chefe = { ...CONFIG_VISITA_PADRAO, justificativa_distancia: 'obrigatoria' as const, contato_obrigatorio_em: ['cadastrou', 'ja_usa', 'retorno', 'sem_interesse'] as never };

// Mesma tabela do teste da API (`modo-campo-rules.spec.ts`): o espelho não pode divergir.
describe('faltandoSimples (espelho da API)', () => {
  it('sem resultado só falta o resultado', () => {
    expect(faltandoSimples(base(), HOJE, CONFIG_VISITA_PADRAO, PERTO)).toEqual(['resultado da visita']);
  });
  it('fechado, já usa e sem interesse com motivo concluem sem digitar', () => {
    expect(faltandoSimples(base({ result: 'fechado' }), HOJE, CONFIG_VISITA_PADRAO, PERTO)).toEqual([]);
    expect(faltandoSimples(base({ result: 'ja_usa' }), HOJE, CONFIG_VISITA_PADRAO, PERTO)).toEqual([]);
    expect(faltandoSimples(base({ result: 'sem_interesse', refusal_reason: 'preco' }), HOJE, CONFIG_VISITA_PADRAO, PERTO)).toEqual([]);
    expect(faltandoSimples(base({ result: 'sem_interesse' }), HOJE, CONFIG_VISITA_PADRAO, PERTO)).toEqual(['motivo']);
  });
  it('retorno: quando voltar + contato do padrão', () => {
    expect(faltandoSimples(base({ result: 'retorno' }), HOJE, CONFIG_VISITA_PADRAO, PERTO)).toEqual([
      'quando voltar',
      'nome de quem atendeu',
      'cargo de quem atendeu',
      'telefone de quem atendeu',
    ]);
    expect(faltandoSimples(base({ result: 'retorno', followup_date: '2026-10-19', ...contato }), HOJE, CONFIG_VISITA_PADRAO, PERTO)).toEqual(['quando voltar (não pode ser no passado)']);
    expect(faltandoSimples(base({ result: 'retorno', followup_date: HOJE, ...contato }), HOJE, CONFIG_VISITA_PADRAO, PERTO)).toEqual([]);
  });
  it('perfil do chefe: contato em todo resultado menos fechado; justificativa de distância obrigatória', () => {
    expect(faltandoSimples(base({ result: 'ja_usa' }), HOJE, chefe, PERTO)).toHaveLength(3);
    expect(faltandoSimples(base({ result: 'fechado' }), HOJE, chefe, PERTO)).toEqual([]);
    expect(faltandoSimples(base({ result: 'fechado' }), HOJE, chefe, { far_from_place: true })).toEqual(['motivo de a visita ter sido longe do local']);
    expect(faltandoSimples(base({ result: 'fechado' }), HOJE, CONFIG_VISITA_PADRAO, { far_from_place: true })).toEqual([]);
  });
});

describe('textos e rascunho', () => {
  it('frases curtas da spec', () => {
    expect(frasePendencia(['resultado da visita'])).toBe('Falta escolher como foi a visita.');
    expect(frasePendencia(['motivo'])).toBe('Falta escolher o motivo.');
    expect(frasePendencia(['quando voltar', 'nome de quem atendeu'])).toBe('Falta dizer quando voltar.');
    expect(frasePendencia([])).toBeNull();
  });
  it('botão: Concluir: Sem interesse, Preço', () => {
    expect(textoConcluir(base(), rotuloMotivoRecusa)).toBe('Concluir visita');
    expect(textoConcluir(base({ result: 'sem_interesse', refusal_reason: 'preco' }), rotuloMotivoRecusa)).toBe('Concluir: Sem interesse, Preço');
    expect(textoConcluir(base({ result: 'fechado' }), rotuloMotivoRecusa)).toBe('Concluir: Estabelecimento fechado');
  });
  it('o rascunho não ecoa os campos derivados (freela_status "declarou" daria 400)', () => {
    const r = rascunhoSimples(base({ result: 'cadastrou', freela_status: 'declarou' as never, outcome: 'conversa', needs_followup: false }));
    expect(r).not.toHaveProperty('freela_status');
    expect(r).not.toHaveProperty('outcome');
    expect(r).not.toHaveProperty('needs_followup');
    expect(r.result).toBe('cadastrou');
  });
});

describe('dia local no fluxo simples', () => {
  const today = (flow: 'simples' | 'completo') =>
    ({
      day: HOJE, journey: null, journeys: [], open_visit: null, counters: { visits: 1, cadastrou_qr: 0 },
      visits: [{ client_id: 'v1', lead_name: 'Bar', checkin_at: '2026-10-20T14:00:00Z', checkout_at: null, auto_closed: false, flow, answers: base({ result: 'fechado', outcome: 'fechado' }) }],
    }) as never;
  it('"fechado" fotografado conta na meta só no simples e só se configurado', () => {
    expect(montarDia(today('simples'), [], { fechadoContaNaMeta: true }).contadores.feitas).toBe(1);
    expect(montarDia(today('simples'), [], { fechadoContaNaMeta: false }).contadores.feitas).toBe(0);
    expect(montarDia(today('completo'), [], { fechadoContaNaMeta: true }).contadores.feitas).toBe(0);
    expect(montarDia(today('simples'), []).contadores.feitas).toBe(0);
  });
});
