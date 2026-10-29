import { ITENS_POR_GRUPO } from '../catalog/crm';
import { montarTarefas, type EntradaTarefas, type EnvioFila, type LeadTarefa, type TipoTarefa } from '../crm-tarefas-rules';

const HOJE = '2026-10-29';
const EU = 'me-1';

const lead = (id: string, o: Partial<LeadTarefa> = {}): LeadTarefa => ({
  id,
  name: `Lead ${id}`,
  owner_id: EU,
  stage: 2,
  phone: '11999990000',
  archived: false,
  is_test: false,
  snooze_until: null,
  stage_since: '2026-10-01',
  last_contact_day: null,
  next_step_what: null,
  next_step_date: null,
  next_step_from_cadence: false,
  freela_hirings: null,
  ...o,
});

const envio = (send_id: string, lead_id: string, o: Partial<EnvioFila> = {}): EnvioFila => ({
  send_id,
  lead_id,
  text: 'oi',
  scheduled_at: new Date('2026-10-29T12:00:00Z'),
  sent_at: null,
  origin_label: 'Disparo X',
  ...o,
});

const base = (o: Partial<EntradaTarefas> = {}): EntradaTarefas => ({
  leads: [],
  envios: [],
  envios_cadencia: [],
  visitas: [],
  cadastros: [],
  contatos_recentes: new Map(),
  ...o,
});

const grupo = (r: ReturnType<typeof montarTarefas>, t: TipoTarefa) => r.groups.find((g) => g.task === t)!;
const ids = (r: ReturnType<typeof montarTarefas>, t: TipoTarefa) => grupo(r, t).items.map((i) => i.lead_id);

describe('montarTarefas', () => {
  it('devolve os 6 grupos na ordem de prioridade, mesmo vazios', () => {
    const r = montarTarefas(base(), HOJE, EU, 'all');
    expect(r.groups.map((g) => g.task)).toEqual(['send', 'cadence_send', 'hot_visit', 'next_step', 'stalled', 'first_vacancy']);
    expect(r.counts).toEqual({ me: 0, all: 0 });
  });

  it('send: um por lead (o mais antigo), com os campos do item; amanhã fica fora', () => {
    const r = montarTarefas(
      base({
        leads: [lead('a'), lead('b')],
        envios: [
          envio('s2', 'a', { scheduled_at: new Date('2026-10-29T15:00:00Z'), text: 'depois' }),
          envio('s1', 'a', { scheduled_at: new Date('2026-10-29T11:00:00Z'), text: 'antes' }),
          envio('s3', 'b', { scheduled_at: new Date('2026-10-30T12:00:00Z') }),
        ],
      }),
      HOJE,
      EU,
      'all',
    );
    const g = grupo(r, 'send');
    expect(g.items).toHaveLength(1);
    expect(g.items[0]).toMatchObject({
      lead_id: 'a',
      lead_name: 'Lead a',
      owner_id: EU,
      stage: 2,
      phone: '11999990000',
      send_id: 's1',
      text: 'antes',
      scheduled_at: '2026-10-29T11:00:00.000Z',
      origin_label: 'Disparo X',
    });
    expect(g.items[0]!.readonly).toBeUndefined();
  });

  it('send atrasado de dias anteriores entra', () => {
    const r = montarTarefas(
      base({ leads: [lead('a')], envios: [envio('s1', 'a', { scheduled_at: new Date('2026-10-20T12:00:00Z') })] }),
      HOJE,
      EU,
      'all',
    );
    expect(ids(r, 'send')).toEqual(['a']);
  });

  it('cadence_send: só os enviados hoje (Brasília), readonly', () => {
    const r = montarTarefas(
      base({
        leads: [lead('a'), lead('b')],
        envios_cadencia: [
          envio('c1', 'a', { sent_at: new Date('2026-10-29T13:00:00Z'), origin_label: 'Cadência Boas-vindas · passo 2' }),
          envio('c2', 'b', { sent_at: new Date('2026-10-28T13:00:00Z') }),
        ],
      }),
      HOJE,
      EU,
      'all',
    );
    const g = grupo(r, 'cadence_send');
    expect(g.total).toBe(1);
    expect(g.items[0]).toMatchObject({ lead_id: 'a', readonly: true, origin_label: 'Cadência Boas-vindas · passo 2', send_id: 'c1' });
  });

  it('cadence_send conta como lead usado: o lead não repete em outro grupo', () => {
    const r = montarTarefas(
      base({
        leads: [lead('a', { stage: 3, last_contact_day: '2026-10-01' })],
        envios_cadencia: [envio('c1', 'a', { sent_at: new Date('2026-10-29T13:00:00Z') })],
      }),
      HOJE,
      EU,
      'all',
    );
    expect(ids(r, 'cadence_send')).toEqual(['a']);
    expect(ids(r, 'stalled')).toEqual([]);
  });

  describe('hot_visit', () => {
    const visita = (lead_id: string, checkout: string, interest = 'alto') => ({
      lead_id,
      checkout_at: new Date(checkout),
      interest,
      consultant_name: 'Rafa',
    });

    it('interesse alto|medio, de 1 a 14 dias atrás, com visit', () => {
      const r = montarTarefas(
        base({
          leads: [lead('a'), lead('b'), lead('c'), lead('d'), lead('e')],
          visitas: [
            visita('a', '2026-10-28T15:00:00Z', 'alto'),
            visita('b', '2026-10-15T15:00:00Z', 'medio'),
            visita('c', '2026-10-28T15:00:00Z', 'baixo'),
            visita('d', '2026-10-29T15:00:00Z', 'alto'), // hoje: ainda não
            visita('e', '2026-10-14T15:00:00Z', 'alto'), // 15 dias: velha
          ],
        }),
        HOJE,
        EU,
        'all',
      );
      expect(ids(r, 'hot_visit').sort()).toEqual(['a', 'b']);
      expect(grupo(r, 'hot_visit').items.find((i) => i.lead_id === 'a')!.visit).toEqual({
        consultant_name: 'Rafa',
        day: '2026-10-28',
        interest: 'alto',
      });
    });

    it('usa a última visita encerrada do lead', () => {
      const r = montarTarefas(
        base({
          leads: [lead('a')],
          visitas: [visita('a', '2026-10-20T15:00:00Z', 'alto'), visita('a', '2026-10-27T15:00:00Z', 'baixo')],
        }),
        HOJE,
        EU,
        'all',
      );
      expect(ids(r, 'hot_visit')).toEqual([]);
    });

    it('fora com etapa 5+ ou contato da equipe depois da visita', () => {
      const r = montarTarefas(
        base({
          leads: [lead('a', { stage: 5 }), lead('b'), lead('c')],
          visitas: [visita('a', '2026-10-27T15:00:00Z'), visita('b', '2026-10-27T15:00:00Z'), visita('c', '2026-10-27T15:00:00Z')],
          contatos_recentes: new Map([
            ['b', '2026-10-28'],
            ['c', '2026-10-27'], // mesmo dia da visita = a própria visita, não conta
          ]),
        }),
        HOJE,
        EU,
        'all',
      );
      expect(ids(r, 'hot_visit')).toEqual(['c']);
    });
  });

  it('next_step: vencido ou de hoje, etapa != 8, com from_cadence', () => {
    const r = montarTarefas(
      base({
        leads: [
          lead('a', { next_step_what: 'Ligar', next_step_date: '2026-10-29', next_step_from_cadence: true }),
          lead('b', { next_step_what: 'Ligar', next_step_date: '2026-10-30' }),
          lead('c', { next_step_what: 'Ligar', next_step_date: '2026-10-01', stage: 8 }),
          lead('d', { next_step_what: 'Visitar', next_step_date: '2026-10-20' }),
        ],
      }),
      HOJE,
      EU,
      'all',
    );
    expect(ids(r, 'next_step')).toEqual(['d', 'a']);
    expect(grupo(r, 'next_step').items[1]!.next_step).toEqual({ what: 'Ligar', date: '2026-10-29', from_cadence: true });
  });

  it('stalled: etapas 3 e 4, 5+ dias (último contato, ou stage_since sem contato)', () => {
    const r = montarTarefas(
      base({
        leads: [
          lead('a', { stage: 3, last_contact_day: '2026-10-24' }), // 5 dias
          lead('b', { stage: 4, last_contact_day: '2026-10-25' }), // 4
          lead('c', { stage: 3, last_contact_day: null, stage_since: '2026-10-10' }),
          lead('d', { stage: 2, last_contact_day: '2026-10-01' }),
        ],
      }),
      HOJE,
      EU,
      'all',
    );
    expect(ids(r, 'stalled')).toEqual(['c', 'a']);
    expect(grupo(r, 'stalled').items[1]!.last_contact_day).toBe('2026-10-24');
  });

  it('first_vacancy: etapa 5 há 3+ dias, sem 1ª vaga, sem contratações, sem contato em 3 dias', () => {
    const r = montarTarefas(
      base({
        leads: [
          lead('a', { stage: 5, stage_since: '2026-10-26' }),
          lead('b', { stage: 5, stage_since: '2026-10-27' }), // 2 dias
          lead('c', { stage: 5, stage_since: '2026-10-20', freela_hirings: 1 }),
          lead('d', { stage: 5, stage_since: '2026-10-20', freela_hirings: 0 }),
          lead('e', { stage: 5, stage_since: '2026-10-20' }), // 1ª vaga conhecida
          lead('f', { stage: 5, stage_since: '2026-10-20' }), // contato ontem
          lead('g', { stage: 5, stage_since: '2026-10-20' }), // contato há 3 dias: ok
        ],
        cadastros: [{ lead_id: 'e', first_vacancy_at: new Date('2026-10-25T12:00:00Z') }],
        contatos_recentes: new Map([
          ['f', '2026-10-28'],
          ['g', '2026-10-26'],
        ]),
      }),
      HOJE,
      EU,
      'all',
    );
    expect(ids(r, 'first_vacancy').sort()).toEqual(['a', 'd', 'g']);
    expect(grupo(r, 'first_vacancy').items.find((i) => i.lead_id === 'a')!.stage_since).toBe('2026-10-26');
  });

  it('lead em duas regras aparece só na de maior prioridade', () => {
    const r = montarTarefas(
      base({
        leads: [lead('a', { stage: 3, last_contact_day: '2026-10-01', next_step_what: 'Ligar', next_step_date: '2026-10-28' })],
        envios: [envio('s1', 'a')],
      }),
      HOJE,
      EU,
      'all',
    );
    expect(ids(r, 'send')).toEqual(['a']);
    expect(ids(r, 'next_step')).toEqual([]);
    expect(ids(r, 'stalled')).toEqual([]);
    expect(r.counts.all).toBe(1);
  });

  it('snooze_until futuro, arquivado e teste ficam fora de todos os grupos', () => {
    const r = montarTarefas(
      base({
        leads: [
          lead('a', { snooze_until: '2026-10-30', stage: 3, last_contact_day: '2026-10-01' }),
          lead('b', { archived: true, stage: 3, last_contact_day: '2026-10-01' }),
          lead('c', { is_test: true, stage: 3, last_contact_day: '2026-10-01' }),
          lead('d', { snooze_until: '2026-10-29', stage: 3, last_contact_day: '2026-10-01' }), // vence hoje: volta
        ],
        envios: [envio('s1', 'a'), envio('s2', 'b'), envio('s3', 'c')],
      }),
      HOJE,
      EU,
      'all',
    );
    expect(r.counts.all).toBe(1);
    expect(ids(r, 'stalled')).toEqual(['d']);
  });

  it("person 'me' = meus + sem dono; counts trazem os dois lados", () => {
    const e = base({
      leads: [
        lead('a', { owner_id: EU, stage: 3, last_contact_day: '2026-10-01' }),
        lead('b', { owner_id: null, stage: 3, last_contact_day: '2026-10-01' }),
        lead('c', { owner_id: 'outro', stage: 3, last_contact_day: '2026-10-01' }),
      ],
    });
    const me = montarTarefas(e, HOJE, EU, 'me');
    expect(ids(me, 'stalled').sort()).toEqual(['a', 'b']);
    expect(me.counts).toEqual({ me: 2, all: 3 });
    expect(grupo(me, 'stalled').total).toBe(2);
    const all = montarTarefas(e, HOJE, EU, 'all');
    expect(ids(all, 'stalled')).toHaveLength(3);
    expect(all.counts).toEqual({ me: 2, all: 3 });
  });

  it('counts e total contam tudo; items são cortados em ITENS_POR_GRUPO', () => {
    const n = ITENS_POR_GRUPO + 10;
    const leads = Array.from({ length: n }, (_, i) => lead(`l${i}`, { stage: 3, last_contact_day: '2026-10-01' }));
    const r = montarTarefas(base({ leads }), HOJE, EU, 'all');
    expect(grupo(r, 'stalled').total).toBe(n);
    expect(grupo(r, 'stalled').items).toHaveLength(ITENS_POR_GRUPO);
    expect(r.counts).toEqual({ me: n, all: n });
  });
});
