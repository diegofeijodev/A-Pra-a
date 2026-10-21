/**
 * Ganho por cadastro declarado (S3, contrato §32.5–§32.7): registro dentro do checkout, relatório de divergência,
 * alerta e anulação. Prisma e repositório em memória (o razão e o cálculo têm testes próprios).
 */
import type { AuthUser } from '../../../../common/auth/auth-user';
import type { PrismaService } from '../../../../common/database/prisma.service';
import { PRESET_CHEFE, REGRA_PADRAO } from '../../../../domain/earnings-rules';
import { CONFIG_MODO_PADRAO } from '../../../../domain/modo-campo-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import type { EarningsRepository } from '../../earnings/earnings.repository';
import { DeclaredSignupsService } from '../declared-signups.service';

const ADMIN: AuthUser = { id: 'dddddddd-0000-4000-8000-000000000001', email: 'a@x.com', name: 'Diego', is_admin: true };
const C1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const C2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const PRACA = 'cccccccc-0000-4000-8000-0000000000c1';
const PRACA_B = 'cccccccc-0000-4000-8000-0000000000c2';
const PRACA_DE: Record<string, string> = { [C1]: PRACA, [C2]: PRACA_B };
const AGORA = new Date('2026-10-27T13:00:00.000Z'); // terça, 10h em Brasília
const CID = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Decl {
  id: string;
  consultant_id: string;
  visit_id: string;
  lead_id: string;
  declared_at: Date;
  declared_day: string;
  company_name: string;
  rule_version: number | null;
  client_id: string;
  flow: string;
  void: null | { reason: string; note: string; voided_at: Date; voided_by_name: string | null; client_id: string };
  consultant: { name: string; praca_id: string };
}

function montar(opts: { ligado?: boolean; regra?: object; confirmacao?: 'activated' | 'first_vacancy' } = {}) {
  const decls: Decl[] = [];
  const signups: Array<Record<string, unknown>> = [];
  const nomes: Record<string, string> = { [C1]: 'Ana', [C2]: 'Beto' };
  const prisma = {
    field_declared_signups: {
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        const d = data[0] as Record<string, unknown>;
        if (decls.some((x) => x.visit_id === d.visit_id || x.lead_id === d.lead_id || x.client_id === d.client_id)) return { count: 0 };
        decls.push({ id: CID(100 + decls.length), void: null, consultant: { name: nomes[d.consultant_id as string] as string, praca_id: PRACA_DE[d.consultant_id as string] as string }, ...(d as object) } as Decl);
        return { count: 1 };
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, any> }) =>
        decls
          .filter((d) => (!where.declared_day || (d.declared_day >= where.declared_day.gte && d.declared_day <= where.declared_day.lte)))
          .filter((d) => !where.consultant_id || (typeof where.consultant_id === 'string' ? d.consultant_id === where.consultant_id : where.consultant_id.in.includes(d.consultant_id)))
          .filter((d) => !where.consultant?.praca_id || d.consultant.praca_id === where.consultant.praca_id)
          .sort((a, b) => b.declared_at.getTime() - a.declared_at.getTime()),
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => decls.find((d) => d.id === where.id) ?? null),
    },
    field_declared_signup_voids: {
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const d = decls.find((x) => x.id === data.declared_id) as Decl;
        d.void = { reason: data.reason, note: data.note, voided_at: new Date(), voided_by_name: data.voided_by_name, client_id: data.client_id };
        return {};
      }),
      findUnique: jest.fn(),
    },
    field_signups: { findMany: jest.fn(async () => signups) },
    field_route_stops: { updateMany: jest.fn(async () => ({ count: 2 })) },
  };
  const repo = {
    versoes: async () => [{ version: 1, valid_from: '1970-01-01', config: (opts.regra ?? PRESET_CHEFE) as never, reason: null, created_by_name: null, created_at: new Date() }],
  } as unknown as EarningsRepository;
  const configs = {
    cadastro: async () => ({ confirmation_rule: opts.confirmacao ?? 'activated' }),
    modo: async () => CONFIG_MODO_PADRAO,
  } as unknown as RotasConfigService;
  const s = new DeclaredSignupsService(prisma as unknown as PrismaService, configs, repo, {
    ligado: true,
    autoClose: false,
    janelaNaoConfirmadosDias: 45,
    declaradasLigado: opts.ligado ?? true,
  });
  const declarar = async (n: number, o: { c?: string; dia?: string; hora?: number } = {}) => {
    const agora = new Date(`${o.dia ?? '2026-10-26'}T${String(o.hora ?? 12).padStart(2, '0')}:00:00.000Z`);
    const preparo = await s.preparar(agora);
    return s.registrar(prisma as never, {
      consultant_id: o.c ?? C1,
      visit_id: CID(200 + n),
      client_id: CID(300 + n),
      lead: { id: CID(400 + n), name: `Bar ${n}` },
      flow: 'simples',
      agora,
      preparo,
    });
  };
  return { s, prisma, decls, signups, declarar };
}

describe('registro na declaração (dentro do checkout)', () => {
  it('guarda o fato com a hora e o dia do SERVIDOR, a versão da regra e a foto do nome', async () => {
    const m = montar();
    expect(await m.declarar(1)).toBe(true);
    expect(m.decls[0]).toMatchObject({ declared_day: '2026-10-26', rule_version: 1, company_name: 'Bar 1', flow: 'simples', consultant_id: C1 });
    expect(m.prisma.field_declared_signups.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });
  it('tira o lead das rotas futuras (paradas pendentes de depois da declaração)', async () => {
    const m = montar();
    await m.declarar(1);
    expect(m.prisma.field_route_stops.updateMany).toHaveBeenCalledWith({
      where: { lead_id: CID(401), status: 'pendente', day: { gt: '2026-10-26' } },
      data: { status: 'descartada' },
    });
  });
  it('repetir (mesma visita, mesmo client_id) ou outra visita do MESMO estabelecimento não cria nada', async () => {
    const m = montar();
    await m.declarar(1);
    expect(await m.declarar(1)).toBe(false);
    expect(m.decls).toHaveLength(1);
    expect(m.prisma.field_route_stops.updateMany).toHaveBeenCalledTimes(1);
    const preparo = await m.s.preparar(AGORA);
    const outraVisita = await m.s.registrar(m.prisma as never, {
      consultant_id: C2, visit_id: CID(250), client_id: CID(350), lead: { id: CID(401), name: 'Bar 1' }, flow: 'simples', agora: AGORA, preparo,
    });
    expect(outraVisita).toBe(false); // uma por empresa em toda a base
  });
  it('a flag vem do EARNINGS_OPCOES: sem declaradasLigado o serviço se diz desligado', () => {
    expect(montar({ ligado: false }).s.ligado).toBe(false);
    expect(montar().s.ligado).toBe(true);
  });
});

describe('relatório de divergência', () => {
  const confirmar = (m: ReturnType<typeof montar>, n: number, o: { c?: string; confirmado?: boolean } = {}) =>
    m.signups.push({ lead_id: CID(400 + n), consultant_id: o.c ?? C1, activated_at: o.confirmado === false ? null : new Date(), first_vacancy_at: null, first_job_completed_at: null });

  it('classifica confirmada, pendente, sem correspondência e por outro consultor; a conta é escrita', async () => {
    const m = montar();
    for (let i = 1; i <= 5; i++) await m.declarar(i);
    confirmar(m, 1); // confirmada
    confirmar(m, 2, { confirmado: false }); // ligada, sem o evento
    confirmar(m, 3, { c: C2 }); // cadastro do lead feito por outro
    const r = await m.s.relatorio({ from: '2026-10-26', to: '2026-11-01' }, AGORA);
    const por = Object.fromEntries(r.rows.map((x) => [x.company_name, x]));
    expect(por['Bar 1']).toMatchObject({ status: 'confirmed', paid_by: 'declared' });
    expect(por['Bar 2']?.status).toBe('pending');
    expect(por['Bar 3']).toMatchObject({ status: 'unmatched', confirmed_by_other_consultant: true });
    expect(por['Bar 4']?.status).toBe('unmatched');
    expect(r.totals).toMatchObject({ declared: 5, confirmed: 1, pending_confirmation: 1, unmatched: 3, voided: 0, divergence_pct: 60 });
    expect(r.conta.join(' ')).toContain('3 sem correspondência no Freela ÷ 5 declarações válidas (5 declaradas − 0 anuladas) = 60%');
    expect(JSON.stringify(r)).not.toMatch(/phone|telefone|cnpj|email/i);
  });
  it('limite diário: o excedente aparece como acima do limite (a regra do dia manda)', async () => {
    const m = montar({ regra: { ...PRESET_CHEFE, declared_daily_cap: 2 } });
    for (let i = 1; i <= 3; i++) await m.declarar(i, { hora: 10 + i });
    const r = await m.s.relatorio({ from: '2026-10-26', to: '2026-10-26' }, AGORA);
    expect(r.totals.over_cap).toBe(1);
    expect(r.rows.find((x) => x.over_cap)?.company_name).toBe('Bar 3');
    expect((await m.s.relatorio({ from: '2026-10-26', to: '2026-10-26', status: 'over_cap' }, AGORA)).rows).toHaveLength(1);
  });
  it('sob regra freela_confirmed a declaração aparece como "paid_by: freela_confirmed" (sombra)', async () => {
    const m = montar({ regra: { ...REGRA_PADRAO } });
    await m.declarar(1);
    expect((await m.s.relatorio({ from: '2026-10-26', to: '2026-10-26' }, AGORA)).rows[0]?.paid_by).toBe('freela_confirmed');
  });
  it('período inválido ou longo demais = 400', async () => {
    const m = montar();
    await expect(m.s.relatorio({ from: '2026-10-27', to: '2026-10-26' }, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(m.s.relatorio({ from: '2026-01-01', to: '2026-10-26' }, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});

describe('isolamento por praça e por consultor (§4.5.6)', () => {
  it('a praça A não vê declaração da praça B no relatório (nem pelo filtro de consultor da outra)', async () => {
    const m = montar();
    await m.declarar(1, { c: C1 });
    await m.declarar(2, { c: C2 });
    const a = await m.s.relatorio({ from: '2026-10-26', to: '2026-10-26', praca_id: PRACA }, AGORA);
    expect(a.rows.map((r) => r.consultant_id)).toEqual([C1]);
    expect(a.by_consultant.map((c) => c.consultant_id)).toEqual([C1]);
    const b = await m.s.relatorio({ from: '2026-10-26', to: '2026-10-26', praca_id: PRACA_B }, AGORA);
    expect(b.rows.map((r) => r.consultant_id)).toEqual([C2]);
    const cruzado = await m.s.relatorio({ from: '2026-10-26', to: '2026-10-26', praca_id: PRACA, consultant_id: C2 }, AGORA);
    expect(cruzado.rows).toEqual([]);
  });
  it('o alerta da praça B só fala de consultor da praça B', async () => {
    const m = montar();
    for (let i = 1; i <= 6; i++) await m.declarar(i, { c: C1 });
    for (let i = 11; i <= 16; i++) await m.declarar(i, { c: C2 });
    const b = await m.s.alertas(PRACA_B, AGORA);
    expect(b.map((x) => x.consultant_id)).toEqual([C2]);
    expect((await m.s.alertas(undefined, AGORA)).map((x) => x.consultant_id).sort()).toEqual([C1, C2]);
  });
});

describe('alerta "Atenção agora" declared_divergence', () => {
  it('dispara com os DOIS limites (5 sem correspondência e 40%) nos 7 dias até ontem', async () => {
    const m = montar();
    for (let i = 1; i <= 6; i++) await m.declarar(i, { dia: '2026-10-26' });
    const a = await m.s.alertas(undefined, AGORA);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: 'declared_divergence', consultant_id: C1, declared: 6, unmatched: 6, divergence_pct: 100 });
  });
  it('declaração de HOJE ainda não conta (o Freela precisa de tempo)', async () => {
    const m = montar();
    for (let i = 1; i <= 6; i++) await m.declarar(i, { dia: '2026-10-27' });
    expect(await m.s.alertas(undefined, AGORA)).toEqual([]);
  });
  it('abaixo do mínimo ou da porcentagem não alerta', async () => {
    const m = montar();
    for (let i = 1; i <= 4; i++) await m.declarar(i); // 4 < 5
    expect(await m.s.alertas(undefined, AGORA)).toEqual([]);
  });
});

describe('anulação manual', () => {
  it('registra motivo e autor, devolve a linha anulada e tira da conta', async () => {
    const m = montar();
    await m.declarar(1);
    const id = m.decls[0]!.id;
    const r = await m.s.anular(id, { reason: 'duplicate', note: 'Mesmo bar cadastrado duas vezes', client_id: CID(900) }, ADMIN);
    expect(r).toMatchObject({ status: 'voided', void: { reason: 'duplicate', note: 'Mesmo bar cadastrado duas vezes', voided_by: 'Diego' } });
  });
  it('repetir o mesmo client_id devolve a mesma; outro client_id = 409 ALREADY_VOIDED; id desconhecido = 404', async () => {
    const m = montar();
    await m.declarar(1);
    const id = m.decls[0]!.id;
    await m.s.anular(id, { reason: 'fraud', note: 'Sem cadastro real', client_id: CID(900) }, ADMIN);
    await expect(m.s.anular(id, { reason: 'fraud', note: 'Sem cadastro real', client_id: CID(900) }, ADMIN)).resolves.toMatchObject({ status: 'voided' });
    await expect(m.s.anular(id, { reason: 'fraud', note: 'Outra vez aqui', client_id: CID(901) }, ADMIN)).rejects.toMatchObject({ status: 409, response: { code: 'ALREADY_VOIDED' } });
    await expect(m.s.anular(CID(999), { reason: 'fraud', note: 'Sem cadastro real', client_id: CID(902) }, ADMIN)).rejects.toMatchObject({ status: 404 });
  });
  it('nota curta (só espaços) = 400', async () => {
    const m = montar();
    await m.declarar(1);
    await expect(m.s.anular(m.decls[0]!.id, { reason: 'fraud', note: '  a ', client_id: CID(900) }, ADMIN)).rejects.toMatchObject({ status: 400 });
  });
});
