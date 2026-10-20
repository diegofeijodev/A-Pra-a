import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { FollowupsService } from '../followups.service';

const PRACA = '00000000-0000-4000-8000-0000000000a1';
const CONS_A = '00000000-0000-4000-8000-0000000000c1';
const CONS_B = '00000000-0000-4000-8000-0000000000c2';
const AGORA = new Date('2026-10-20T14:00:00.000Z'); // 20/10 11h em Brasília
const A: CampoConsultant = { id: CONS_A, name: 'Ana', email: 'a@a.com', praca_id: PRACA, must_change_password: false };

const visita = (n: number, over: Record<string, unknown> = {}) => ({
  id: `v${n}`, lead_id: `l${n}`, checkin_at: new Date('2026-10-15T15:00:00Z'), checkout_at: new Date('2026-10-15T15:20:00Z'),
  needs_followup: true, followup_date: '2026-10-19', followup_what: `Ligar ${n}`, interlocutor_name: 'Marta', interest: 'alto',
  far_from_place: false, consultant_id: CONS_A, consultant: { name: 'Ana' },
  lead: { name: `Lead ${n}`, phone: '(11) 90000-0000', phone_key: '', address: 'R. X', praca_id: PRACA, lat: -23.6, lng: -46.6, location_precision: 'point' },
  ...over,
});

function fake(visitas: unknown[] = [], recentes: unknown[] = []) {
  return {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA }) },
    field_visits: { findMany: jest.fn().mockResolvedValue(visitas), groupBy: jest.fn().mockResolvedValue(recentes) },
  };
}
const svc = (p: ReturnType<typeof fake>) => new FollowupsService(p as unknown as PrismaService);
const whereDe = (p: ReturnType<typeof fake>) => p.field_visits.findMany.mock.calls[0][0].where;

describe('FollowupsService — fila de retornos', () => {
  it('lista hoje e atrasados, do mais antigo ao mais novo, com os dias de atraso', async () => {
    const p = fake([visita(1, { followup_date: '2026-10-20' }), visita(2, { followup_date: '2026-10-17' }), visita(3, { followup_date: '2026-10-19' })]);
    const r = await svc(p).equipe(undefined, AGORA);
    expect(r).toMatchObject({ day: '2026-10-20', today: 1, overdue: 2, total: 3, truncated: false });
    expect(r.items.map((i) => [i.lead_name, i.due, i.days_late])).toEqual([['Lead 2', 'atrasado', 3], ['Lead 3', 'atrasado', 1], ['Lead 1', 'hoje', 0]]);
    expect(r.items[0]).toMatchObject({ visit_id: 'v2', followup_what: 'Ligar 2', phone: '(11) 90000-0000', consultant_name: 'Ana', interest: 'alto', visited_at: '2026-10-15T15:00:00.000Z' });
  });

  it('a consulta pede só retorno com checkout, data <= hoje (Brasília), lead não arquivado/teste/cadastrado', async () => {
    const p = fake([visita(1)]);
    await svc(p).equipe(undefined, AGORA);
    expect(whereDe(p)).toEqual({
      needs_followup: true,
      checkout_at: { not: null },
      followup_date: { not: null, lte: '2026-10-20' },
      lead: { archived: false, is_test: false, stage: { lt: 5 } },
    });
  });

  it('visita posterior ao lead (qualquer consultor) resolve o retorno e ele sai da fila', async () => {
    const p = fake([visita(1), visita(2)], [{ lead_id: 'l1', _max: { checkin_at: new Date('2026-10-18T15:00:00Z') } }, { lead_id: 'l2', _max: { checkin_at: new Date('2026-10-15T15:00:00Z') } }]);
    const r = await svc(p).equipe(undefined, AGORA);
    expect(r.items.map((i) => i.lead_id)).toEqual(['l2']);
    expect(p.field_visits.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['lead_id'], where: { lead_id: { in: ['l1', 'l2'] } } }));
  });

  it('isolamento da equipe: praca_id vai para o filtro do LEAD; praça inexistente → 404 sem ler visitas', async () => {
    const p = fake([visita(1)]);
    await svc(p).equipe(PRACA, AGORA);
    expect(whereDe(p).lead).toMatchObject({ praca_id: PRACA });
    const sem = fake();
    sem.pracas.findUnique.mockResolvedValue(null);
    await expect(svc(sem).equipe(PRACA, AGORA)).rejects.toMatchObject({ status: 404 });
    expect(sem.field_visits.findMany).not.toHaveBeenCalled();
  });

  it('isolamento do consultor: o filtro é o id do TOKEN; consultor A nunca pede retorno do B', async () => {
    const p = fake([visita(1)]);
    await svc(p).doConsultor(A, AGORA);
    expect(whereDe(p)).toMatchObject({ consultant_id: CONS_A });
    expect(JSON.stringify(whereDe(p))).not.toContain(CONS_B);
    // sem nenhuma visita dele, a fila é vazia e nada mais é consultado
    const vazio = fake([]);
    const r = await svc(vazio).doConsultor(A, AGORA);
    expect(r).toEqual({ day: '2026-10-20', today: 0, overdue: 0, total: 0, truncated: false, items: [] });
    expect(vazio.field_visits.groupBy).not.toHaveBeenCalled();
  });

  it('mais de 200: devolve 200, truncated=true e os totais contam todos', async () => {
    const muitas = Array.from({ length: 230 }, (_, i) => visita(i, { followup_date: '2026-10-19' }));
    const r = await svc(fake(muitas)).equipe(undefined, AGORA);
    expect(r).toMatchObject({ total: 230, overdue: 230, truncated: true });
    expect(r.items).toHaveLength(200);
  });

  it('dia de Brasília, não UTC: 22h30 do dia 19 em Brasília ainda é dia 19', async () => {
    const p = fake([visita(1, { followup_date: '2026-10-19' })]);
    const r = await svc(p).equipe(undefined, new Date('2026-10-20T01:30:00.000Z'));
    expect(r.day).toBe('2026-10-19');
    expect(r.items[0]).toMatchObject({ due: 'hoje' });
  });
});
