import { describe, expect, it } from 'vitest';
import { automacoesViewSchema, resumoCrmViewSchema, selosViewSchema, tarefasViewSchema } from '../crm.api';

const item = { lead_id: 'l1', lead_name: 'Padaria Sol', owner_id: null, stage: 3, phone: '11999990000' };

describe('zod do CRM (contrato §47.3)', () => {
  it('tasks: aceita grupos com itens de cada tipo', () => {
    const r = tarefasViewSchema.parse({
      day: '2026-10-29', praca_id: 'p1', person: 'all', counts: { me: 1, all: 2 }, entrada: { novos: 4 }, freela_configured: true,
      groups: [
        { task: 'send', total: 1, items: [{ ...item, send_id: 's1', text: 'Oi', scheduled_at: '2026-10-29T12:00:00Z', origin_label: 'Disparo X' }] },
        { task: 'cadence_send', total: 1, items: [{ ...item, readonly: true }] },
        { task: 'hot_visit', total: 1, items: [{ ...item, visit: { consultant_name: 'Ana', day: '2026-10-27', interest: 'quente' } }] },
        { task: 'next_step', total: 1, items: [{ ...item, next_step: { what: null, date: '2026-10-29', from_cadence: false } }] },
        { task: 'stalled', total: 1, items: [{ ...item, last_contact_day: '2026-10-20', stage_since: '2026-10-01T00:00:00Z' }] },
        { task: 'first_vacancy', total: 0, items: [] },
      ],
    });
    expect(r.groups).toHaveLength(6);
  });
  it('tasks: recusa grupo sem `task` e `task` desconhecida', () => {
    const base = { day: 'd', praca_id: 'p', person: 'me', counts: { me: 0, all: 0 }, entrada: { novos: 0 }, freela_configured: false };
    expect(tarefasViewSchema.safeParse({ ...base, groups: [{ total: 0, items: [] }] }).success).toBe(false);
    expect(tarefasViewSchema.safeParse({ ...base, groups: [{ task: 'outra', total: 0, items: [] }] }).success).toBe(false);
  });
  it('summary: aceita número com value null (Freela sem conta) e praca_id nulo', () => {
    const r = resumoCrmViewSchema.parse({
      day: '2026-10-29', praca_id: null, freela_configured: false, freela_read_at: null,
      numbers: [
        { key: 'leads_novos', value: 3, parts: [{ label: 'busca', value: 3 }], formula: 'a + b', source: 'leads' },
        { key: 'freela', value: null, parts: [], formula: 'f', source: 's' },
      ],
    });
    expect(r.numbers[1]!.value).toBeNull();
    expect(resumoCrmViewSchema.safeParse({ day: 'd', praca_id: null, freela_configured: true, freela_read_at: null, numbers: [{ key: 'k', parts: [], formula: '', source: '' }] }).success).toBe(false);
  });
  it('automations: aceita jobs com e sem última rodada; recusa bloqueio desconhecido', () => {
    const ok = {
      freela_configured: true, send_mode: 'fila',
      jobs: [
        { key: 'sem_resposta', enabled: true, needs_freela: false, blocked_by: null, last_run: { at: '2026-10-29T10:00:00Z', ok: true, summary: { n: 2 } }, last_7d: { moveu: 3 } },
        { key: 'quadro_freela', enabled: false, needs_freela: true, blocked_by: 'freela', last_run: null, last_7d: {} },
      ],
      cadences: [{ id: 'c1', name: 'Boas-vindas', entry: 'stage_novo', paused: false, active_enrollments: 2 }],
      warnings: [],
    };
    expect(automacoesViewSchema.parse(ok).jobs).toHaveLength(2);
    expect(automacoesViewSchema.safeParse({ ...ok, jobs: [{ ...ok.jobs[1], blocked_by: 'x' }] }).success).toBe(false);
  });
  it('badges: itens com selo e contratações nulas', () => {
    expect(selosViewSchema.parse({ items: [{ lead_id: 'l1', last_stage_auto: true, freela_hirings: null }] }).items).toHaveLength(1);
  });
});
