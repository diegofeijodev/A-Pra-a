import type { PrismaService } from '../../../common/database/prisma.service';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { SignupsLeituraService } from '../signups-leitura.service';

type Row = Record<string, any>;
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
// Terça 2026-10-20 10:00 em Brasília
const AGORA = new Date('2026-10-20T13:00:00.000Z');

const linha = (o: Row): Row => ({
  id: `s-${Math.random()}`, consultant_id: A, freela_user_id: 'u', company_name: 'Padaria', source: 'on_behalf',
  freela_created_at: new Date('2026-10-18T10:00:00Z'), created_day: '2026-10-18',
  activated_at: null, first_vacancy_at: null, first_job_completed_at: null,
  activated_day: null, first_vacancy_day: null, first_job_day: null, match_status: 'none', lead_id: null, ...o,
});

function casa(r: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
    if (v && typeof v === 'object' && ('gte' in v || 'lte' in v)) return r[k] != null && (v.gte === undefined || r[k] >= v.gte) && (v.lte === undefined || r[k] <= v.lte);
    return r[k] === v;
  });
}

function montar(rows: Row[], regra: 'activated' | 'first_vacancy' | 'first_job_completed' = 'activated') {
  const prisma: any = {
    field_consultants: {
      findMany: jest.fn(async ({ where }: any) =>
        [
          { id: A, name: 'Ana', praca_id: 'p1', signup_sync: { last_ok_at: new Date('2026-10-20T12:50:00Z'), last_error: null } },
          { id: B, name: 'Beto', praca_id: 'p2', signup_sync: { last_ok_at: null, last_error: 'O Freela respondeu HTTP 404.' } },
        ].filter((c) => (!where.id || c.id === where.id) && (!where.praca_id || c.praca_id === where.praca_id)),
      ),
    },
    field_signups: {
      findMany: jest.fn(async ({ where, take }: any) => rows.filter((r) => casa(r, where)).slice(0, take)),
      count: jest.fn(async ({ where }: any) => rows.filter((r) => casa(r, where)).length),
      groupBy: jest.fn(async ({ by, where }: any) => {
        const g = new Map<string, Row>();
        for (const r of rows.filter((x) => casa(x, where))) {
          const key = by.map((b: string) => r[b]).join('|');
          const cur = g.get(key) ?? { ...Object.fromEntries(by.map((b: string) => [b, r[b]])), _count: { _all: 0 } };
          cur._count._all++;
          g.set(key, cur);
        }
        return [...g.values()];
      }),
    },
  };
  const config = { cadastro: async () => ({ confirmation_rule: regra }) } as unknown as RotasConfigService;
  return new SignupsLeituraService(prisma as PrismaService, config);
}

const rows = [
  linha({ activated_at: new Date('2026-10-20T12:00:00Z'), activated_day: '2026-10-20' }), // hoje
  linha({ activated_at: new Date('2026-10-19T12:00:00Z'), activated_day: '2026-10-19' }), // segunda
  linha({ activated_at: new Date('2026-10-18T12:00:00Z'), activated_day: '2026-10-18' }), // domingo da semana anterior
  linha({ consultant_id: B, activated_at: new Date('2026-10-20T12:00:00Z'), activated_day: '2026-10-20', company_name: 'Do Beto', first_vacancy_day: '2026-10-21' }),
  linha({ created_day: '2026-10-19', company_name: 'Esperando' }), // sem activated
];

describe('SignupsLeituraService', () => {
  it('equipe: padrão = semana atual; mostra regra, campo, fonte e conta por consultor', async () => {
    const r = await montar(rows).equipe({}, AGORA);
    expect(r).toMatchObject({ rule: 'activated', field: 'activated_at', from: '2026-10-19', to: '2026-10-25', total: 3, pending_review: 0 });
    expect(r.source).toContain('Freela');
    expect(r.formula).toContain('activated_at');
    expect(r.consultants.find((c) => c.consultant_id === A)).toMatchObject({ confirmed: 2, not_confirmed: 1, sync_error: null });
    expect(r.consultants.find((c) => c.consultant_id === B)).toMatchObject({ confirmed: 1, sync_error: 'O Freela respondeu HTTP 404.' });
    expect(r.last_sync_at).toBe('2026-10-20T12:50:00.000Z');
  });
  it('equipe: filtra por consultor, praça e período; sem vazar entre contas', async () => {
    const s = montar(rows);
    expect((await s.equipe({ consultant_id: B }, AGORA)).items.map((i) => i.company_name)).toEqual(['Do Beto']);
    expect((await s.equipe({ praca_id: 'p1' }, AGORA)).consultants.map((c) => c.consultant_id)).toEqual([A]);
    expect((await s.equipe({ from: '2026-10-18', to: '2026-10-18' }, AGORA)).total).toBe(1);
  });
  it('a regra muda a conta sem tocar nos dados', async () => {
    const r = await montar(rows, 'first_vacancy').equipe({}, AGORA);
    expect(r).toMatchObject({ rule: 'first_vacancy', field: 'first_vacancy_at', total: 1 });
  });
  it('valida o período', async () => {
    const s = montar(rows);
    await expect(s.equipe({ from: '2026-10-20', to: '2026-10-19' }, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(s.equipe({ from: '2026-01-01', to: '2026-12-31' }, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
  it('consultor: só os dele e só campos não sensíveis', async () => {
    const r = await montar(rows).doConsultor({ id: B } as any, {}, AGORA);
    expect(r.items).toEqual([{ id: expect.any(String), company_name: 'Do Beto', confirmed_day: '2026-10-20', status: 'confirmed' }]);
    const a = await montar(rows).doConsultor({ id: A } as any, {}, AGORA);
    expect(a.items.map((i) => [i.company_name, i.status])).toEqual([['Padaria', 'confirmed'], ['Padaria', 'confirmed'], ['Esperando', 'waiting']]);
    expect(JSON.stringify(a)).not.toMatch(/freela_user_id|lead_id|phone|cnpj|email/);
  });
  it('contagens hoje/semana em dia e semana de Brasília', async () => {
    const r = await montar(rows).contagens([A, B], AGORA);
    expect(r.porConsultor.get(A)).toEqual({ today: 1, week: 2 });
    expect(r.porConsultor.get(B)).toEqual({ today: 1, week: 1 });
    // 23:30 de domingo em Brasília ainda é a semana de 19–25
    const dom = new Date('2026-10-26T02:30:00Z');
    const r2 = await montar([linha({ activated_day: '2026-10-25' })]).contagens([A], dom);
    expect(r2.porConsultor.get(A)).toEqual({ today: 1, week: 1 });
  });
});
