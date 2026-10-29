import { CRM_DESLIGADAS, type FlagsCrm } from '../../../common/flags/crm.flags';
import type { PrismaService } from '../../../common/database/prisma.service';
import { SemRespostaService } from '../sem-resposta.service';

const L1 = 'eeeeeeee-0000-4000-8000-000000000001';
// 28/10 12:00 em Brasília: 21 dias depois de 07/10.
const AGORA = new Date('2026-10-28T15:00:00.000Z');
const LIGADA: FlagsCrm = { ...CRM_DESLIGADAS, auto_lost: true };

type Row = Record<string, any>;

function lead(extra: Row = {}): Row {
  return {
    id: L1,
    stage: 2,
    stage_since: '2026-09-20',
    archived: false,
    is_test: false,
    classe: 'depois',
    last_contact_at: null,
    snooze_until: null,
    next_step_date: null,
    events: [{ at: new Date('2026-10-07T15:00:00.000Z'), kind: 'msg_out' }],
    enrollments: [],
    ...extra,
  };
}

function montar(leads: Row[], opts: { flags?: FlagsCrm | undefined; inscricoesNaTrava?: number; count?: number; eventosAntes?: Row[] } = {}) {
  const eventos: Row[] = [];
  const rodadas: Row[] = [];
  const ordem: string[] = [];
  const updates: Row[] = [];
  const tx: any = {
    $executeRaw: jest.fn(async (_s: TemplateStringsArray, ...v: unknown[]) => {
      ordem.push('lock');
      expect(String(_s.join('?'))).toContain("pg_advisory_xact_lock(hashtext(");
      expect(v[0]).toBe(`cadence-enroll:${L1}`);
    }),
    enrollments: {
      count: jest.fn(async () => {
        ordem.push('count');
        return opts.inscricoesNaTrava ?? 0;
      }),
    },
    leads: {
      updateMany: jest.fn(async (a: Row) => {
        ordem.push('update');
        updates.push(a);
        return { count: opts.count ?? 1 };
      }),
    },
    lead_events: {
      // INSERT … ON CONFLICT DO NOTHING (skipDuplicates): a `auto_key` repetida some da conta, sem lançar.
      createMany: jest.fn(async ({ data, skipDuplicates }: Row) => {
        let count = 0;
        for (const d of data) {
          if (eventos.some((e) => e.auto_key === d.auto_key)) {
            if (!skipDuplicates) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            continue;
          }
          eventos.push(d);
          count++;
        }
        return { count };
      }),
    },
  };
  const prisma: any = {
    leads: { findMany: jest.fn(async () => leads) },
    $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
    crm_automation_runs: { create: jest.fn(async ({ data }: Row) => rodadas.push(data)) },
  };
  for (const e of opts.eventosAntes ?? []) eventos.push(e);
  const svc = new SemRespostaService(
    prisma as PrismaService,
    ('flags' in opts ? opts.flags : LIGADA) as FlagsCrm | undefined,
  );
  return { svc, prisma, tx, eventos, rodadas, ordem, updates };
}

describe('SemRespostaService (A4)', () => {
  it('chave desligada: nada lido, nada gravado', async () => {
    const { svc, prisma } = montar([lead()], { flags: CRM_DESLIGADAS });
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 0, perdidos: 0 });
    expect(prisma.leads.findMany).not.toHaveBeenCalled();
    expect(prisma.crm_automation_runs.create).not.toHaveBeenCalled();
  });

  it('sem provedor de chaves: igual a desligada', async () => {
    const { svc, prisma } = montar([lead()], { flags: undefined });
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 0, perdidos: 0 });
    expect(prisma.leads.findMany).not.toHaveBeenCalled();
  });

  it('lead em Contatado parado há 21 dias vai para Perdido, com o evento da conta', async () => {
    const { svc, eventos, rodadas, updates } = montar([lead()]);
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 1, perdidos: 1 });
    expect(updates[0].where).toMatchObject({ id: L1, stage: 2, stage_since: '2026-09-20', archived: false, is_test: false });
    expect(updates[0].data).toEqual({
      stage: 8,
      stage_since: '2026-10-28',
      lost_reason: 'não respondeu',
      reheat_at: '2026-11-27',
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      lead_id: L1,
      kind: 'stage',
      stage_to: 8,
      author_label: 'Automático',
      author_id: null,
      auto_key: `a4:${L1}:2026-09-20`,
    });
    expect(eventos[0].text).toContain('último contato em 07/10, 21 dias sem resposta');
    expect(rodadas).toHaveLength(1);
    expect(rodadas[0]).toMatchObject({ job: 'sem_resposta', ok: true, summary: { candidatos: 1, perdidos: 1 } });
  });

  it('o evento entra por INSERT … ON CONFLICT DO NOTHING (skipDuplicates): um P2002 abortaria a transação', async () => {
    const { svc, tx } = montar([lead()]);
    await svc.rodar(AGORA);
    expect(tx.lead_events.createMany).toHaveBeenCalledTimes(1);
    expect(tx.lead_events.createMany.mock.calls[0][0]).toMatchObject({
      skipDuplicates: true,
      data: [expect.objectContaining({ auto_key: `a4:${L1}:2026-09-20` })],
    });
  });

  it('evento com a mesma auto_key já gravado (count 0): o lead conta como perdido, nada lança e a rodada fica ok', async () => {
    const { svc, eventos, rodadas, tx } = montar([lead()], { eventosAntes: [{ lead_id: L1, auto_key: `a4:${L1}:2026-09-20` }] });
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 1, perdidos: 1 });
    expect(await tx.lead_events.createMany.mock.results[0].value).toEqual({ count: 0 });
    expect(eventos).toHaveLength(1);
    expect(rodadas[0]).toMatchObject({ ok: true, summary: { candidatos: 1, perdidos: 1 } });
  });

  it('antes de reler as inscrições, pega a trava da pessoa (a mesma do autoEnroll)', async () => {
    const { svc, ordem } = montar([lead()]);
    await svc.rodar(AGORA);
    expect(ordem).toEqual(['lock', 'count', 'update']);
  });

  it.each(['ativo', 'aguardando'])('inscrição %s na leitura: fica', async (status) => {
    const { svc, prisma, eventos } = montar([lead({ enrollments: [{ status }] })]);
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 0, perdidos: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(eventos).toHaveLength(0);
  });

  it('inscrição que apareceu depois da leitura (relida com a trava): fica, sem evento', async () => {
    const { svc, eventos, updates } = montar([lead()], { inscricoesNaTrava: 1 });
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 1, perdidos: 0 });
    expect(updates).toHaveLength(0);
    expect(eventos).toHaveLength(0);
  });

  it('adiado ou com próximo passo de hoje em diante: fica', async () => {
    const { svc } = montar([lead({ snooze_until: '2026-10-30' }), lead({ id: 'x', next_step_date: '2026-10-28' })]);
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 0, perdidos: 0 });
  });

  it('parado há 20 dias: fica', async () => {
    const { svc } = montar([lead({ events: [{ at: new Date('2026-10-08T15:00:00.000Z'), kind: 'call' }] })]);
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 0, perdidos: 0 });
  });

  it('stage_since mudou entre a leitura e a escrita (count 0): fica, sem evento', async () => {
    const { svc, eventos, rodadas } = montar([lead()], { count: 0 });
    expect(await svc.rodar(AGORA)).toEqual({ candidatos: 1, perdidos: 0 });
    expect(eventos).toHaveLength(0);
    expect(rodadas[0]).toMatchObject({ ok: true, summary: { candidatos: 1, perdidos: 0 } });
  });

  it('falha em um lead: registra a rodada com erro saneado e não lança', async () => {
    const { svc, prisma, rodadas } = montar([lead()]);
    prisma.$transaction.mockRejectedValueOnce(new Error('select * from leads where phone = 5511999999999'));
    await expect(svc.rodar(AGORA)).resolves.toEqual({ candidatos: 1, perdidos: 0 });
    expect(rodadas[0].ok).toBe(false);
    expect(rodadas[0].error).not.toContain('5511999999999');
  });
});
