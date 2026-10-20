import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { FreelaClient } from '../../freela/freela-client';
import type { CadastroListado } from '../../freela/freela-registrations';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { SignupSyncService } from '../signup-sync.service';

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';
const LEAD = 'dddddddd-0000-4000-8000-000000000001';
const AGORA = new Date('2026-10-20T15:00:00.000Z');
const OPC = { janelaDias: 45 };

type Row = Record<string, any>;

const item = (o: Partial<CadastroListado> & { userId: string }): CadastroListado => ({
  contractorId: `ct-${o.userId}`,
  persona: 'contractor',
  companyName: 'Padaria Bom Pão',
  cnpj: null,
  phone: '+5511987654321',
  email: null,
  source: 'on_behalf',
  accessMode: 'setup_link',
  createdAt: '2026-10-18T13:00:00.000Z',
  activatedAt: null,
  firstVacancyAt: null,
  firstJobCompletedAt: null,
  status: 'pending',
  ...o,
});

function montar(opts: { regra?: 'activated' | 'first_vacancy' | 'first_job_completed'; consultores?: Row[] } = {}) {
  const consultores: Row[] = opts.consultores ?? [{ id: A, praca_id: PRACA, freela_consultant_id: 'fc-A' }];
  const estados: Row[] = [];
  const signups: Row[] = [];
  const cadastros: Row[] = [];
  const leads: Row[] = [];
  const eventos: Row[] = [];
  let seq = 0;

  const prisma: any = {
    field_consultants: { findMany: jest.fn(async () => consultores) },
    field_signup_sync_state: {
      findUnique: jest.fn(async ({ where }: any) => estados.find((e) => e.consultant_id === where.consultant_id) ?? null),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const e = estados.find((x) => x.consultant_id === where.consultant_id);
        if (e) Object.assign(e, update);
        else estados.push({ ...create });
      }),
    },
    field_signups: {
      findFirst: jest.fn(async ({ where }: any) => {
        const campo = Object.keys(where).find((k) => k.endsWith('_at'))!;
        return signups.filter((s) => s.consultant_id === where.consultant_id && s[campo] === null).sort((a, b) => a.freela_created_at - b.freela_created_at)[0] ?? null;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const k = where.consultant_id_freela_user_id;
        return signups.find((s) => s.consultant_id === k.consultant_id && s.freela_user_id === k.freela_user_id) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        if (signups.some((s) => s.consultant_id === data.consultant_id && s.freela_user_id === data.freela_user_id)) throw new Error('dup');
        signups.push({ id: `s${++seq}`, ...data });
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(signups.find((s) => s.id === where.id)!, data)),
    },
    field_company_signups: {
      findMany: jest.fn(async ({ where }: any) =>
        cadastros.filter((c) => c.consultant_id === where.consultant_id && where.OR.some((o: any) => c.freela_user_id === o.freela_user_id)),
      ),
      update: jest.fn(async ({ where, data }: any) => Object.assign(cadastros.find((c) => c.id === where.id)!, data)),
    },
    leads: {
      findMany: jest.fn(async ({ where }: any) =>
        leads.filter(
          (l) => l.praca_id === where.praca_id && where.OR.some((o: any) => (o.phone_key ? l.phone_key === o.phone_key : o.cnpj.in.includes(l.cnpj))),
        ),
      ),
      findUnique: jest.fn(async ({ where }: any) => leads.find((l) => l.id === where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const l = leads.find((x) => x.id === where.id && x.stage < where.stage.lt && x.archived === where.archived && x.is_test === where.is_test);
        if (!l) return { count: 0 };
        Object.assign(l, data);
        return { count: 1 };
      }),
    },
    lead_events: { create: jest.fn(async ({ data }: any) => void eventos.push(data)) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const paginas: Record<string, Array<{ data: CadastroListado[]; nextCursor: string | null } | Error>> = {};
  const list = jest.fn(async (fid: string, f: any) => {
    const fila = paginas[fid] ?? [];
    const idx = f.cursor ? Number(f.cursor.replace('c', '')) : 0;
    const p = fila[idx];
    if (!p) return { data: [], nextCursor: null };
    if (p instanceof Error) throw p;
    return p;
  });
  const freela = { listRegistrations: list } as unknown as FreelaClient;
  const config = { cadastro: async () => ({ confirmation_rule: opts.regra ?? 'activated' }) } as unknown as RotasConfigService;
  const svc = new SignupSyncService(prisma as PrismaService, freela, config);
  return { svc, prisma, signups, cadastros, leads, eventos, estados, paginas, list, consultores };
}

const lead = (o: Row = {}): Row => ({ id: LEAD, praca_id: PRACA, stage: 3, archived: false, is_test: false, phone_key: '987654321', cnpj: null, ...o });
const cad = (o: Row = {}): Row => ({
  id: 'cs1', consultant_id: A, freela_user_id: null, company_name: 'Padaria Bom Pão', phone_masked: '(11) 9****-4321',
  lead_id: LEAD, status: 'pending', activated_at: null, freela_contractor_id: null, ...o,
});

beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('SignupSyncService', () => {
  it('pagina com cursor, persiste tudo e avança o watermark só ao fim', async () => {
    const t = montar();
    t.paginas['fc-A'] = [
      { data: [item({ userId: 'u1', createdAt: '2026-10-17T10:00:00.000Z', phone: null })], nextCursor: 'c1' },
      { data: [item({ userId: 'u2', createdAt: '2026-10-19T10:00:00.000Z', phone: null }), item({ userId: 'u3', createdAt: '2026-10-18T10:00:00.000Z', phone: null })], nextCursor: null },
    ];
    const r = await t.svc.rodar(AGORA, OPC);
    expect(r).toMatchObject({ consultores: 1, itens: 3, erros: 0 });
    expect(t.signups.map((s) => s.freela_user_id).sort()).toEqual(['u1', 'u2', 'u3']);
    expect(t.list).toHaveBeenCalledTimes(2);
    expect(t.list.mock.calls[0]![1]).toMatchObject({ limit: 200, since: '2026-09-05T15:00:00.000Z' });
    expect(t.list.mock.calls[1]![1].cursor).toBe('c1');
    expect(t.estados[0]!.watermark).toEqual(new Date('2026-10-19T10:00:00.000Z'));
    expect(t.estados[0]!.last_error).toBeNull();
  });

  it('idempotente: rodar 2x não duplica linhas, eventos nem muda datas', async () => {
    const t = montar();
    t.leads.push(lead());
    t.cadastros.push(cad());
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    const foto = JSON.stringify([t.signups, t.cadastros, t.leads, t.eventos]);
    await t.svc.rodar(new Date('2026-10-20T15:10:00.000Z'), OPC);
    expect(t.signups).toHaveLength(1);
    expect(t.eventos).toHaveLength(1);
    expect(JSON.stringify([t.signups.map(({ synced_at, ...r }) => r), t.cadastros, t.leads, t.eventos])).toBe(
      JSON.stringify([JSON.parse(foto)[0].map(({ synced_at, ...r }: Row) => r), ...JSON.parse(foto).slice(1)]),
    );
  });

  it('activatedAt nulo = não confirmado: grava, mas não sobe o lead; depois confirma e sobe', async () => {
    const t = montar();
    t.leads.push(lead());
    t.cadastros.push(cad());
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.signups[0]).toMatchObject({ activated_at: null, activated_day: null, match_status: 'linked', lead_id: LEAD });
    expect(t.leads[0]!.stage).toBe(3);
    expect(t.cadastros[0]).toMatchObject({ freela_user_id: 'u1', status: 'pending' });

    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-20T02:30:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(new Date('2026-10-20T15:10:00.000Z'), OPC);
    expect(t.signups[0]).toMatchObject({ activated_day: '2026-10-19' }); // 23:30 em Brasília
    expect(t.cadastros[0]).toMatchObject({ status: 'activated', activated_at: new Date('2026-10-20T02:30:00.000Z') });
    expect(t.leads[0]).toMatchObject({ stage: 5, stage_since: '2026-10-20' });
    expect(t.eventos).toEqual([expect.objectContaining({ lead_id: LEAD, kind: 'stage', stage_to: 5, author_label: 'Freela (sincronização)' })]);
    expect(t.eventos[0]).not.toHaveProperty('author_id');
  });

  it('datas de evento são de escrita única: o Freela mudar depois não reescreve', async () => {
    const t = montar();
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-20T09:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: null })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.signups[0]).toMatchObject({ activated_at: new Date('2026-10-19T12:00:00.000Z'), activated_day: '2026-10-19' });
  });

  it('casa por telefone mascarado + nome (sem user id) e liga o userId ao cadastro', async () => {
    const t = montar();
    t.cadastros.push(cad({ lead_id: null, status: 'already_registered' }));
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', companyName: 'PADARIA BOM PAO', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.signups[0]).toMatchObject({ signup_id: 'cs1', match_status: 'linked' });
    expect(t.cadastros[0]).toMatchObject({ freela_user_id: 'u1', freela_contractor_id: 'ct-u1', status: 'activated' });
  });

  it('não retrocede nem toca etapa >= 5, perdido (8), arquivado ou de teste', async () => {
    for (const o of [{ stage: 5 }, { stage: 6 }, { stage: 7 }, { stage: 8 }, { archived: true }, { is_test: true }]) {
      const t = montar();
      t.leads.push(lead(o));
      t.cadastros.push(cad());
      t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
      await t.svc.rodar(AGORA, OPC);
      expect(t.leads[0]).toMatchObject(o);
      expect(t.eventos).toHaveLength(0);
      expect(t.signups[0]!.lead_id).toBe(LEAD); // o vínculo fica registrado
    }
  });

  it('lead por telefone único na praça sobe; dois candidatos = ambíguo, nada sobe', async () => {
    const t = montar();
    t.leads.push(lead());
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.leads[0]!.stage).toBe(5);

    const d = montar();
    d.leads.push(lead(), lead({ id: 'outro-lead' }));
    d.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
    await d.svc.rodar(AGORA, OPC);
    expect(d.signups[0]).toMatchObject({ match_status: 'ambiguous', lead_id: null });
    expect(d.leads.map((l) => l.stage)).toEqual([3, 3]);
  });

  it('lead de outra praça nunca casa', async () => {
    const t = montar();
    t.leads.push(lead({ praca_id: 'outra-praca' }));
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.leads[0]!.stage).toBe(3);
    expect(t.signups[0]).toMatchObject({ match_status: 'none', lead_id: null });
  });

  it('isolamento: o mesmo userId em dois consultores vira duas linhas; cadastro de B não é ligado a A', async () => {
    const t = montar({ consultores: [{ id: A, praca_id: PRACA, freela_consultant_id: 'fc-A' }, { id: B, praca_id: PRACA, freela_consultant_id: 'fc-B' }] });
    t.cadastros.push(cad({ id: 'cs-B', consultant_id: B, lead_id: null }));
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.signups).toHaveLength(1);
    expect(t.signups[0]).toMatchObject({ consultant_id: A, signup_id: null });
    expect(t.cadastros[0]!.freela_user_id).toBeNull();
  });

  it('falha parcial: um consultor com 404 não derruba o outro; erro gravado sanitizado', async () => {
    const t = montar({ consultores: [{ id: A, praca_id: PRACA, freela_consultant_id: 'fc-A' }, { id: B, praca_id: PRACA, freela_consultant_id: 'fc-B' }] });
    t.paginas['fc-A'] = [Object.assign(new Error('GET /x?phone=+5511987654321 token=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123'), { freelaStatus: 404 })];
    t.paginas['fc-B'] = [{ data: [item({ userId: 'u9', phone: null })], nextCursor: null }];
    const r = await t.svc.rodar(AGORA, OPC);
    expect(r).toMatchObject({ consultores: 2, erros: 1, itens: 1, interrompido429: false });
    const ea = t.estados.find((e) => e.consultant_id === A)!;
    expect(ea.last_error_code).toBe('FREELA_404');
    expect(JSON.stringify(ea)).not.toMatch(/5511|ABCDEF|token/);
    expect(t.estados.find((e) => e.consultant_id === B)!.last_ok_at).toEqual(AGORA);
  });

  it('429 interrompe a rodada inteira', async () => {
    const t = montar({ consultores: [{ id: A, praca_id: PRACA, freela_consultant_id: 'fc-A' }, { id: B, praca_id: PRACA, freela_consultant_id: 'fc-B' }] });
    t.paginas['fc-A'] = [Object.assign(new Error('x'), { freelaStatus: 429 })];
    const r = await t.svc.rodar(AGORA, OPC);
    expect(r.interrompido429).toBe(true);
    expect(t.list).toHaveBeenCalledTimes(1);
  });

  it('itens salvos antes da falha ficam; o watermark não avança', async () => {
    const t = montar();
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', phone: null })], nextCursor: 'c1' }, new Error('rede')];
    const r = await t.svc.rodar(AGORA, OPC);
    expect(r.erros).toBe(1);
    expect(t.signups).toHaveLength(1);
    expect(t.estados[0]!.watermark ?? null).toBeNull();
  });

  it('cursor que não anda e teto de páginas não viram laço infinito', async () => {
    const t = montar();
    t.paginas['fc-A'] = [
      { data: [item({ userId: 'u1', phone: null })], nextCursor: 'c1' },
      { data: [item({ userId: 'u2', phone: null })], nextCursor: 'c1' },
      { data: [], nextCursor: 'c1' },
    ];
    await t.svc.rodar(AGORA, OPC);
    expect(t.list.mock.calls.length).toBeLessThanOrEqual(3);
    expect(t.estados[0]!.last_error_code).toBe('SYNC_INCOMPLETE');

    const u = montar();
    u.list.mockImplementation(async () => ({ data: [], nextCursor: `n${u.list.mock.calls.length}` }));
    await u.svc.rodar(AGORA, { ...OPC, maxPaginas: 4 });
    expect(u.list).toHaveBeenCalledTimes(4);
  });

  it('a regra é configurável: com first_vacancy só sobe quando há primeira vaga', async () => {
    const t = montar({ regra: 'first_vacancy' });
    t.leads.push(lead());
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.leads[0]!.stage).toBe(3);
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', activatedAt: '2026-10-19T12:00:00.000Z', firstVacancyAt: '2026-10-20T10:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.leads[0]!.stage).toBe(5);
    expect(t.eventos[0]!.text).toContain('primeira vaga');
  });

  it('janela de reconciliação: com cadastro ainda sem o evento, o since recua até ele', async () => {
    const t = montar();
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', phone: null, createdAt: '2026-10-05T10:00:00.000Z' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    t.paginas['fc-A'] = [{ data: [], nextCursor: null }];
    await t.svc.rodar(new Date('2026-10-20T16:00:00.000Z'), OPC);
    expect(t.list.mock.calls[1]![1].since).toBe('2026-10-04T10:00:00.000Z'); // watermark - 1 dia (já antes do cadastro pendente)
  });

  it('aceita source null e ignora item com data inválida', async () => {
    const t = montar();
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', source: null, phone: null }), item({ userId: 'u2', createdAt: 'lixo' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(t.signups).toHaveLength(1);
    expect(t.signups[0]!.source).toBeNull();
  });

  it('não guarda telefone, e-mail nem CNPJ do Freela', async () => {
    const t = montar();
    t.paginas['fc-A'] = [{ data: [item({ userId: 'u1', email: 'dono@padaria.com', cnpj: '12345678000195' })], nextCursor: null }];
    await t.svc.rodar(AGORA, OPC);
    expect(JSON.stringify(t.signups)).not.toMatch(/987654321|dono@|12345678000195/);
  });

  it('consultor sem código no Freela não entra (a consulta filtra)', async () => {
    const t = montar({ consultores: [] });
    expect((await t.svc.rodar(AGORA, OPC)).consultores).toBe(0);
    expect(t.list).not.toHaveBeenCalled();
  });
});
