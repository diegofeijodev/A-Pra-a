import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { FreelaClient } from '../../freela/freela-client';
import { TarefasService } from '../tarefas.service';

const PRACA = 'aaaaaaaa-0000-4000-8000-000000000001';
const L1 = 'eeeeeeee-0000-4000-8000-000000000001';
const L2 = 'eeeeeeee-0000-4000-8000-000000000002';
const EU = 'bbbbbbbb-0000-4000-8000-000000000001';
// 29/10 12:00 em Brasília.
const AGORA = new Date('2026-10-29T15:00:00.000Z');

type Row = Record<string, any>;
const lead = (id: string, o: Row = {}): Row => ({
  id, name: `Lead ${id.slice(-1)}`, owner_id: EU, stage: 1, phone: '11999990000', archived: false, is_test: false, snooze_until: null,
  stage_since: '2026-10-01', last_contact_at: null, next_step_what: null, next_step_date: null, freela_hirings: null, ...o,
});

function listagem(o: { leads?: Row[]; envios?: Row[]; cadencia?: Row[]; visitas?: Row[]; contatos?: Row[]; praca?: boolean; freela?: boolean } = {}) {
  const chamadas: Record<string, Row[]> = {};
  const reg = (k: string, a: Row) => (chamadas[k] = [...(chamadas[k] ?? []), a]);
  const prisma: any = {
    pracas: { findUnique: jest.fn(async () => (o.praca === false ? null : { id: PRACA })) },
    leads: { findMany: jest.fn(async (a: Row) => (reg('leads', a), o.leads ?? [])) },
    msg_sends: {
      findMany: jest.fn(async (a: Row) => {
        reg('msg_sends', a);
        return a.where.disparo_id ? (o.envios ?? []) : (o.cadencia ?? []);
      }),
    },
    field_visits: { findMany: jest.fn(async (a: Row) => (reg('visits', a), o.visitas ?? [])) },
    field_signups: { findMany: jest.fn(async () => []) },
    lead_events: { groupBy: jest.fn(async (a: Row) => (reg('events', a), o.contatos ?? [])) },
    cadence_nodes: { findMany: jest.fn(async () => [{ task: 'Mandar proposta' }]) },
    disparos: { findMany: jest.fn(async () => [{ id: 'd1', name: 'Verão' }]) },
    cadences: { findMany: jest.fn(async () => [{ id: 'c1', name: 'Boas-vindas' }]) },
  };
  const freela = { isConfigured: () => o.freela ?? true } as unknown as FreelaClient;
  return { svc: new TarefasService(prisma as PrismaService, freela), prisma, chamadas };
}

describe('TarefasService.listar', () => {
  it('praca_id malformado ou inexistente = 404 NOT_FOUND (sem tocar nos leads)', async () => {
    const a = listagem();
    await expect(a.svc.listar('xx', 'all', EU, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(a.prisma.pracas.findUnique).not.toHaveBeenCalled();
    const b = listagem({ praca: false });
    await expect(b.svc.listar(PRACA, 'all', EU, AGORA)).rejects.toBeInstanceOf(NotFoundException);
    expect(b.prisma.leads.findMany).not.toHaveBeenCalled();
  });

  it('carrega em lote (uma leitura por tabela) só da praça, sem arquivados nem testes', async () => {
    const { svc, prisma, chamadas } = listagem({ leads: [lead(L1)] });
    await svc.listar(PRACA, 'all', EU, AGORA);
    expect(prisma.leads.findMany).toHaveBeenCalledTimes(1);
    expect(chamadas.leads![0]!.where).toEqual({ praca_id: PRACA, archived: false, is_test: false });
    expect(prisma.lead_events.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.field_visits.findMany).toHaveBeenCalledTimes(1);
    expect(chamadas.events![0]!.where).toMatchObject({ kind: { in: ['call', 'msg_out', 'msg_in', 'visit'] }, author_id: { not: null } });
    // disparo: fila, até o início de amanhã em Brasília (30/10 03:00Z).
    const envio = chamadas.msg_sends!.find((c) => c.where.disparo_id)!;
    expect(envio.where).toMatchObject({ mode: 'fila', status: 'fila', scheduled_at: { lt: new Date('2026-10-30T03:00:00.000Z') } });
  });

  it('monta o corpo: day, entrada.novos (etapa 1, sem adiados), freela_configured, rótulos de origem', async () => {
    const { svc } = listagem({
      freela: false,
      leads: [lead(L1), lead(L2, { snooze_until: '2026-10-31' }), lead('eeeeeeee-0000-4000-8000-000000000003', { stage: 2 })],
      envios: [{ id: 's1', lead_id: L1, text: 'oi', scheduled_at: new Date('2026-10-29T13:00:00Z'), sent_at: null, disparo_id: 'd1' }],
      cadencia: [{ id: 's2', lead_id: L2, text: 'olá', scheduled_at: new Date('2026-10-29T12:00:00Z'), sent_at: new Date('2026-10-29T12:05:00Z'), cadence_id: 'c1' }],
    });
    const r = await svc.listar(PRACA, 'all', EU, AGORA);
    expect(r).toMatchObject({ day: '2026-10-29', praca_id: PRACA, person: 'all', entrada: { novos: 1 }, freela_configured: false });
    expect(r.groups.map((g) => g.task)).toEqual(['send', 'cadence_send', 'hot_visit', 'next_step', 'stalled', 'first_vacancy']);
    expect(r.groups[0]!.items[0]).toMatchObject({ lead_id: L1, send_id: 's1', origin_label: 'Disparo Verão' });
    // L2 está adiado: a mensagem da cadência dele não aparece.
    expect(r.groups[1]!.total).toBe(0);
    expect(r.counts).toEqual({ me: 1, all: 1 });
  });

  it('contato recente da equipe e passo de cadência entram nas regras', async () => {
    const { svc } = listagem({
      leads: [
        lead(L1, { stage: 3, last_contact_at: new Date('2026-10-20T15:00:00Z'), next_step_what: 'Mandar proposta', next_step_date: '2026-10-28' }),
        lead(L2, { stage: 3, last_contact_at: new Date('2026-10-20T15:00:00Z') }),
      ],
      contatos: [{ lead_id: L2, _max: { at: new Date('2026-10-28T15:00:00Z') } }],
    });
    const r = await svc.listar(PRACA, 'all', EU, AGORA);
    const prox = r.groups.find((g) => g.task === 'next_step')!;
    expect(prox.items[0]!.next_step).toEqual({ what: 'Mandar proposta', date: '2026-10-28', from_cadence: true });
    // L2 teve contato ontem: não está parado.
    expect(r.groups.find((g) => g.task === 'stalled')!.total).toBe(0);
  });

  it('visita: nome do representante vem do join', async () => {
    const { svc } = listagem({
      leads: [lead(L1, { stage: 2 })],
      visitas: [{ lead_id: L1, checkout_at: new Date('2026-10-27T15:00:00Z'), interest: 'alto', consultant: { name: 'Rita' } }],
    });
    const r = await svc.listar(PRACA, 'all', EU, AGORA);
    expect(r.groups.find((g) => g.task === 'hot_visit')!.items[0]!.visit).toEqual({ consultant_name: 'Rita', day: '2026-10-27', interest: 'alto' });
  });

  it("person 'me' devolve o que pediu e usa o usuário informado", async () => {
    const { svc } = listagem({ leads: [lead(L1, { owner_id: 'outro', stage: 3, last_contact_at: new Date('2026-10-01T15:00:00Z') })] });
    const r = await svc.listar(PRACA, 'me', EU, AGORA);
    expect(r.person).toBe('me');
    expect(r.counts).toEqual({ me: 0, all: 1 });
  });
});

function concluir(l: Row | null) {
  const eventos: Row[] = [];
  const updates: Row[] = [];
  const donos: Row[] = [];
  let emTx = false;
  const tx: any = {
    leads: {
      findUnique: jest.fn(async () => l),
      update: jest.fn(async (a: Row) => (updates.push(a), {})),
      updateMany: jest.fn(async (a: Row) => (donos.push(a), { count: 1 })),
    },
    lead_events: { create: jest.fn(async (a: Row) => (eventos.push(a.data), {})) },
  };
  const prisma: any = { $transaction: jest.fn(async (fn: (t: any) => Promise<unknown>) => ((emTx = true), fn(tx))) };
  const svc = new TarefasService(prisma as PrismaService, { isConfigured: () => true } as unknown as FreelaClient);
  return { svc, eventos, updates, donos, prisma, tx, emTx: () => emTx };
}
const USER = { id: EU, email: 'a@b.c', name: 'Ana', is_admin: false };
const base = { lead_id: L1, task: 'stalled', kind: 'call' } as const;

describe('TarefasService.concluir', () => {
  it('grava evento (author_id = usuário) e last_contact_at numa transação; não toca no próximo passo', async () => {
    const t = concluir({ id: L1, archived: false, owner_id: EU });
    await expect(t.svc.concluir({ ...base, text: '  falei com o dono ' }, USER)).resolves.toEqual({ ok: true, lead_id: L1 });
    expect(t.emTx()).toBe(true);
    expect(t.eventos).toEqual([expect.objectContaining({ lead_id: L1, author_id: EU, kind: 'call', text: 'falei com o dono' })]);
    expect(t.updates[0]!.data.last_contact_at).toBeInstanceOf(Date);
    expect(t.updates[0]!.data).not.toHaveProperty('next_step_what');
    expect(t.donos).toEqual([]);
  });

  it('sem texto usa o texto padrão do tipo', async () => {
    const t = concluir({ id: L1, archived: false, owner_id: EU });
    await t.svc.concluir({ ...base, kind: 'msg_out' }, USER);
    expect(t.eventos[0]!.text).toMatch(/Mensagem enviada/);
  });

  it("task 'next_step' sem next_step limpa o passo", async () => {
    const t = concluir({ id: L1, archived: false, owner_id: EU });
    await t.svc.concluir({ ...base, task: 'next_step' }, USER);
    expect(t.updates[0]!.data).toMatchObject({ next_step_what: null, next_step_date: null });
  });

  it('com next_step grava o novo (em qualquer tarefa)', async () => {
    const t = concluir({ id: L1, archived: false, owner_id: EU });
    await t.svc.concluir({ ...base, task: 'next_step', next_step: { what: ' Ligar de novo ', date: '2026-11-03' } }, USER);
    expect(t.updates[0]!.data).toMatchObject({ next_step_what: 'Ligar de novo', next_step_date: '2026-11-03' });
    const u = concluir({ id: L1, archived: false, owner_id: EU });
    await u.svc.concluir({ ...base, next_step: { what: 'Visitar', date: '2026-11-04' } }, USER);
    expect(u.updates[0]!.data).toMatchObject({ next_step_what: 'Visitar' });
  });

  it('lead sem dono: quem fez vira dono (condicional)', async () => {
    const t = concluir({ id: L1, archived: false, owner_id: null });
    await t.svc.concluir(base, USER);
    expect(t.donos).toEqual([{ where: { id: L1, owner_id: null }, data: { owner_id: EU } }]);
  });

  it('lead arquivado = 409 LEAD_ARCHIVED, sem gravar nada', async () => {
    const t = concluir({ id: L1, archived: true, owner_id: EU });
    await expect(t.svc.concluir(base, USER)).rejects.toBeInstanceOf(ConflictException);
    await expect(t.svc.concluir(base, USER)).rejects.toMatchObject({ response: { code: 'LEAD_ARCHIVED' } });
    expect(t.eventos).toEqual([]);
  });

  it('lead inexistente ou id malformado = 404', async () => {
    const t = concluir(null);
    await expect(t.svc.concluir(base, USER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.svc.concluir({ ...base, lead_id: 'x' }, USER)).rejects.toBeInstanceOf(NotFoundException);
  });
});
