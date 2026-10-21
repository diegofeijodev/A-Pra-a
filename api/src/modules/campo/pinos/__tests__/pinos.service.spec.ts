import type { CampoConsultant } from '../../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../../common/database/prisma.service';
import { montarRespostaPinos, PinosService, type InsumoPino } from '../pinos.service';

const PRACA_A = 'aaaaaaaa-1111-4000-8000-00000000000a';
const CONS = 'cccccccc-1111-4000-8000-00000000000c';
const C: CampoConsultant = { id: CONS, name: 'Ana', email: 'a@x.com', praca_id: PRACA_A, must_change_password: false };
const AGORA = new Date('2026-10-21T15:00:00.000Z');
const sem = { decl: false, tem_visita: false, outcome: null, result: null, freela_status: null, needs_followup: null, refusal_reason: null };
const ins = (o: Partial<InsumoPino>): InsumoPino => ({ stage: 1, ...sem, ...o });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('montarRespostaPinos (contrato §34.1)', () => {
  const grupos = [
    { ...ins({}), n: 3 },
    { ...ins({ tem_visita: true, outcome: 'fechado', result: 'fechado' }), n: 1 },
    { ...ins({ stage: 5 }), n: 2 },
    { ...ins({ decl: true }), n: 1 },
  ];
  const linhas = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ ...ins(n === 4 ? { tem_visita: true, outcome: 'fechado', result: 'fechado' } : n <= 3 ? {} : { stage: 5 }), id: id(n), lat: -19.9, lng: -43.9 }));
  const resp = (pagina: typeof linhas, limite: number) =>
    montarRespostaPinos({ modo: 'resultado', pracas: [], grupos, pagina, limite, semLocalizacao: 2, conta: (t, s) => `${t}|${s}` });

  it('legenda do filtro inteiro em ordem fixa (com zeros); total = soma da legenda', () => {
    const r = resp(linhas.slice(0, 3), 2000);
    expect(r.legend.map((l) => [l.code, l.n])).toEqual([
      ['a_visitar', 3], ['cadastrado', 3], ['ja_usa', 0], ['retornar', 0], ['nao_contrata', 0], ['nao_cadastrado', 0], ['fechado', 1],
    ]);
    expect(r.total).toBe(7);
    expect(r.without_location).toBe(2);
    expect(r.conta).toBe('7|2');
  });

  it('página com cursor: limit+1 diz se há mais; a soma das páginas = total', () => {
    let vistos = 0;
    let cursor: string | null = null;
    let voltas = 0;
    do {
      const resto = linhas.filter((l) => !cursor || l.id > cursor).slice(0, 3);
      const r = resp(resto, 2);
      vistos += r.pins.length;
      cursor = r.next_cursor;
      voltas += 1;
    } while (cursor && voltas < 10);
    expect(vistos).toBe(7);
    expect(voltas).toBe(4);
  });

  it('pino = [id, lat, lng, código] sem nome nem telefone; modo estágio usa a etapa', () => {
    const r = resp(linhas.slice(3, 5), 2000);
    expect(r.pins).toEqual([[id(4), -19.9, -43.9, 'fechado'], [id(5), -19.9, -43.9, 'cadastrado']]);
    const e = montarRespostaPinos({ modo: 'estagio', pracas: [], grupos, pagina: linhas.slice(4, 5), limite: 10, semLocalizacao: 0, conta: () => '' });
    expect(e.pins[0]![3]).toBe('5');
    expect(e.legend.find((l) => l.code === '5')?.n).toBe(2);
    expect(e.legend.find((l) => l.code === '1')?.n).toBe(5);
  });
});

function fakePrisma() {
  return {
    pracas: {
      findUnique: jest.fn().mockResolvedValue({ id: PRACA_A, name: 'Moema' }),
      findMany: jest.fn().mockResolvedValue([{ id: PRACA_A, name: 'Moema' }]),
    },
    $queryRaw: jest.fn().mockImplementation((q: { strings: string[] }) =>
      Promise.resolve(q.strings.join('?').includes('GROUP BY') ? [{ ...ins({}), n: 1 }] : q.strings.join('?').includes('count(*)::int AS n FROM') ? [{ n: 4 }] : [{ ...ins({}), id: id(1), lat: 1, lng: 2 }]),
    ),
    leads: { findFirst: jest.fn().mockResolvedValue({ id: id(1), name: 'Padaria', address: 'Rua A', city: 'BH', praca_id: PRACA_A, stage: 3, phone: '(31) 98765-4321' }) },
    field_visits: { findFirst: jest.fn().mockResolvedValue({ outcome: 'conversa', result: 'retorno', freela_status: null, needs_followup: true, refusal_reason: null, journey: { day: '2026-10-20' }, consultant: { name: 'Ana' } }) },
    field_declared_signups: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}
const valores = (p: ReturnType<typeof fakePrisma>) => p.$queryRaw.mock.calls.flatMap((c: unknown[]) => (c[0] as { values: unknown[] }).values);

describe('PinosService', () => {
  it('equipe sem praça = as praças abertas (início até hoje, Brasília); a praça vai como parâmetro', async () => {
    const p = fakePrisma();
    const r = await new PinosService(p as unknown as PrismaService).equipe({}, AGORA);
    expect(p.pracas.findMany.mock.calls[0][0].where).toEqual({ start_date: { lte: '2026-10-21' } });
    expect(valores(p)).toContain(PRACA_A);
    expect(r).toMatchObject({ total: 1, without_location: 4, pracas: [{ id: PRACA_A, name: 'Moema' }] });
  });

  it('praça inexistente = 404; bbox inválido = 400; sem praça aberta = vazio sem consultar leads', async () => {
    const p = fakePrisma();
    p.pracas.findUnique.mockResolvedValue(null);
    await expect(new PinosService(p as unknown as PrismaService).equipe({ praca_id: PRACA_A }, AGORA)).rejects.toMatchObject({ status: 404 });
    await expect(new PinosService(fakePrisma() as unknown as PrismaService).equipe({ bbox: 'x' }, AGORA)).rejects.toMatchObject({ status: 400 });
    const p3 = fakePrisma();
    p3.pracas.findMany.mockResolvedValue([]);
    const r = await new PinosService(p3 as unknown as PrismaService).equipe({}, AGORA);
    expect(r.total).toBe(0);
    expect(p3.$queryRaw).not.toHaveBeenCalled();
  });

  it('consultor: só a praça dele e o filtro "roteiro dele ou visitado por ele" (id do token)', async () => {
    const p = fakePrisma();
    await new PinosService(p as unknown as PrismaService).consultor(C, {});
    expect(p.pracas.findUnique.mock.calls[0][0].where).toEqual({ id: PRACA_A });
    const sqls = p.$queryRaw.mock.calls.map((c: unknown[]) => (c[0] as { strings: string[] }).strings.join('?'));
    expect(sqls.every((s: string) => s.includes('r.consultant_id =') && s.includes('v2.consultant_id ='))).toBe(true);
    expect(valores(p).filter((v) => v === CONS).length).toBe(6);
  });

  it('detalhe: telefone só mascarado com o tipo; id mal formado = 404', async () => {
    const r = await new PinosService(fakePrisma() as unknown as PrismaService).detalhe(id(1));
    expect(r).toMatchObject({ category: { code: 'retornar' }, stage_label: '3. Conversa aberta', last_visit: { day: '2026-10-20', label: 'Quer retorno', consultant_name: 'Ana' }, phone: { masked: '(31) 9****-4321', kind: 'whatsapp' } });
    expect(JSON.stringify(r)).not.toContain('98765');
    await expect(new PinosService(fakePrisma() as unknown as PrismaService).detalhe('x')).rejects.toMatchObject({ status: 404 });
  });
});
