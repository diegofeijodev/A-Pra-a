import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CRM_DESLIGADAS, type FlagsCrm } from '../../../common/flags/crm.flags';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { EtapasAutomaticasService } from '../etapas-automaticas.service';
import { limparRodadasAntigas, registrarRodada, rodadaOkNoDia, ultimaRodada } from '../rodadas';

const L1 = 'dddddddd-0000-4000-8000-000000000001';
const L2 = 'dddddddd-0000-4000-8000-000000000002';
// 28/10 12:00 em Brasília.
const AGORA = new Date('2026-10-28T15:00:00.000Z');
const LIGADA: FlagsCrm = { ...CRM_DESLIGADAS, auto_stages: true };

type Row = Record<string, any>;

/** Avalia o `where` que o serviço monta (id, booleanos, OR/AND, lt/lte/gte/not, null). NULL nunca casa com comparação. */
function casa(l: Row, w: Row): boolean {
  for (const [k, v] of Object.entries(w)) {
    if (k === 'OR') {
      if (!(v as Row[]).some((x) => casa(l, x))) return false;
      continue;
    }
    if (k === 'AND') {
      if (!(v as Row[]).every((x) => casa(l, x))) return false;
      continue;
    }
    if (v === null || typeof v !== 'object') {
      if (l[k] !== v) return false;
      continue;
    }
    const atual = l[k];
    if ('lt' in v && !(atual !== null && atual < v.lt)) return false;
    if ('lte' in v && !(atual !== null && atual <= v.lte)) return false;
    if ('gte' in v && !(atual !== null && atual >= v.gte)) return false;
    if ('not' in v && atual === v.not) return false;
  }
  return true;
}

const erroP2002 = () => Object.assign(new Error('Unique constraint failed on the fields: (`auto_key`)'), { code: 'P2002' });

function montar(opts: { flags?: FlagsCrm | undefined; regra?: 'activated' | 'first_vacancy' | 'first_job_completed' } = {}) {
  const signups: Row[] = [];
  const leads: Row[] = [];
  const eventos: Row[] = [];
  const rodadas: Row[] = [];

  const prisma: any = {
    field_signups: {
      findMany: jest.fn(async ({ where }: any) =>
        signups
          .filter((s) => s.match_status === where.match_status && s.lead_id !== null)
          .map((s) => ({ ...s, lead: leads.find((l) => l.id === s.lead_id) ? { ...leads.find((l) => l.id === s.lead_id) } : null })),
      ),
    },
    leads: {
      findUnique: jest.fn(async ({ where }: any) => {
        const l = leads.find((x) => x.id === where.id);
        return l ? { ...l } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const alvo = leads.filter((l) => casa(l, where));
        alvo.forEach((l) => Object.assign(l, data));
        return { count: alvo.length };
      }),
    },
    lead_events: {
      findUnique: jest.fn(async ({ where }: any) => eventos.find((e) => e.auto_key === where.auto_key) ?? null),
      findMany: jest.fn(async ({ where }: any) => eventos.filter((e) => where.auto_key.in.includes(e.auto_key)).map((e) => ({ auto_key: e.auto_key }))),
      create: jest.fn(async ({ data }: any) => {
        if (data.auto_key && eventos.some((e) => e.auto_key === data.auto_key)) throw erroP2002();
        eventos.push(data);
        return data;
      }),
    },
    crm_automation_runs: { create: jest.fn(async ({ data }: any) => void rodadas.push(data)) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const config = { cadastro: jest.fn(async () => ({ confirmation_rule: opts.regra ?? 'activated' })) };
  const flags = 'flags' in opts ? opts.flags : LIGADA;
  const svc = new EtapasAutomaticasService(prisma as PrismaService, config as unknown as RotasConfigService, flags);
  return { svc, prisma, config, signups, leads, eventos, rodadas };
}

const lead = (o: Row = {}): Row => ({
  id: L1,
  stage: 5,
  stage_since: '2026-10-10',
  archived: false,
  is_test: false,
  auto_stage_applied: null,
  freela_user_id: null,
  lost_reason: null,
  reheat_at: null,
  ...o,
});
let seq = 0;
const signup = (o: Row = {}): Row => ({
  id: `5165a000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  freela_user_id: 'u1',
  lead_id: L1,
  match_status: 'linked',
  activated_at: new Date('2026-10-05T13:00:00.000Z'),
  first_vacancy_at: null,
  first_vacancy_day: null,
  first_job_completed_at: null,
  ...o,
});

/** Todo `jest.fn` do Prisma falso (e do config), para afirmar "nenhuma chamada". */
function chamadas(prisma: any, config: any): number {
  let n = config.cadastro.mock.calls.length + prisma.$transaction.mock.calls.length;
  for (const tabela of Object.values(prisma)) {
    if (tabela && typeof tabela === 'object') for (const f of Object.values(tabela as Row)) if (jest.isMockFunction(f)) n += f.mock.calls.length;
  }
  return n;
}

beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('EtapasAutomaticasService.passadaCadastros (A2)', () => {
  it('chave auto_stages desligada: nenhuma leitura e zeros', async () => {
    for (const flags of [CRM_DESLIGADAS, undefined]) {
      const t = montar({ flags });
      t.leads.push(lead());
      t.signups.push(signup({ first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }));
      const r = await t.svc.passadaCadastros(AGORA);
      expect(r).toEqual({ vistos: 0, subiram: { '5': 0, '6': 0 }, vagas: 0 });
      expect(chamadas(t.prisma, t.config)).toBe(0);
      expect(t.rodadas).toHaveLength(0);
    }
  });

  it('serviço concluído: lead 5 vai a 6 com evento do automático, marca e rodada', async () => {
    const t = montar();
    t.leads.push(lead());
    const s = signup({ first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') });
    t.signups.push(s);
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r).toEqual({ vistos: 1, subiram: { '5': 0, '6': 1 }, vagas: 0 });
    expect(t.leads[0]).toMatchObject({ stage: 6, stage_since: '2026-10-28', auto_stage_applied: 6 });
    expect(t.eventos).toEqual([
      {
        lead_id: L1,
        at: AGORA,
        kind: 'stage',
        author_label: 'Automático · Freela',
        stage_to: 6,
        text: 'Primeiro serviço concluído no Freela em 20/10. Etapa: Cadastrado → Primeira vaga rodada.',
        auto_key: `a2:etapa:${L1}:6`,
      },
    ]);
    expect(t.rodadas).toHaveLength(1);
    expect(t.rodadas[0]).toMatchObject({ job: 'etapas_cadastro', ref: null, started_at: AGORA, ok: true, error: null });
    expect(t.rodadas[0]!.summary).toMatchObject({ vistos: 1, subiram: { '5': 0, '6': 1 }, vagas: 0, erros: 0 });
    expect(t.rodadas[0]!.finished_at).toBeInstanceOf(Date);
  });

  it('rodar duas vezes: um evento só; a 2ª rodada não abre transação', async () => {
    const t = montar();
    t.leads.push(lead());
    t.signups.push(signup({ first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }));
    await t.svc.passadaCadastros(AGORA);
    const foto = JSON.stringify([t.leads, t.eventos]);
    t.prisma.$transaction.mockClear();
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r).toEqual({ vistos: 1, subiram: { '5': 0, '6': 0 }, vagas: 0 });
    expect(JSON.stringify([t.leads, t.eventos])).toBe(foto);
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
    expect(t.rodadas).toHaveLength(2);
  });

  it('alguém voltou o lead de 6 para 3 depois da marca 6: não sobe de novo', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 3, stage_since: '2026-10-25', auto_stage_applied: 6, freela_user_id: 'u1' }));
    t.signups.push(signup({ first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }));
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r.subiram).toEqual({ '5': 0, '6': 0 });
    expect(t.leads[0]).toMatchObject({ stage: 3, auto_stage_applied: 6 });
    expect(t.eventos).toHaveLength(0);
    expect(t.prisma.leads.updateMany).not.toHaveBeenCalled();
  });

  it('lead em 8 com fato posterior: sobe e limpa motivo e reaquecimento', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 8, stage_since: '2026-10-15', lost_reason: 'não respondeu', reheat_at: '2026-11-14' }));
    t.signups.push(signup({ first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }));
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r.subiram).toEqual({ '5': 0, '6': 1 });
    const { data } = t.prisma.leads.updateMany.mock.calls[0]![0];
    expect(data).toEqual({ stage: 6, stage_since: '2026-10-28', lost_reason: null, reheat_at: null, auto_stage_applied: 6 });
    expect(t.leads[0]).toMatchObject({ stage: 6, lost_reason: null, reheat_at: null });
    expect(t.eventos[0]!.text).toBe('Primeiro serviço concluído no Freela em 20/10. Etapa: Perdido / reaquecer → Primeira vaga rodada.');
  });

  it('lead em 8 marcado DEPOIS do fato: fica em Perdido', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 8, stage_since: '2026-10-25', lost_reason: 'preço' }));
    t.signups.push(signup({ first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }));
    await t.svc.passadaCadastros(AGORA);
    expect(t.leads[0]).toMatchObject({ stage: 8, lost_reason: 'preço', auto_stage_applied: null });
    expect(t.eventos).toHaveLength(0);
  });

  it('cadastro confirmado pela regra tira de Perdido para Cadastrado (5)', async () => {
    const t = montar({ regra: 'activated' });
    t.leads.push(lead({ stage: 8, stage_since: '2026-10-01', lost_reason: 'preço' }));
    t.signups.push(signup({ activated_at: new Date('2026-10-05T13:00:00.000Z') }));
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r.subiram).toEqual({ '5': 1, '6': 0 });
    expect(t.leads[0]).toMatchObject({ stage: 5, auto_stage_applied: 5, lost_reason: null });
    expect(t.eventos[0]).toMatchObject({
      kind: 'stage',
      stage_to: 5,
      auto_key: `a2:etapa:${L1}:5`,
      text: 'Cadastro confirmado no Freela (primeiro acesso, 05/10). Etapa: Perdido / reaquecer → Cadastrado.',
    });
  });

  it('confirmação segue a regra vigente: com first_vacancy, só o primeiro acesso não dá alvo', async () => {
    const t = montar({ regra: 'first_vacancy' });
    t.leads.push(lead({ stage: 8, stage_since: '2026-10-01' }));
    t.signups.push(signup({ activated_at: new Date('2026-10-05T13:00:00.000Z') }));
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r).toEqual({ vistos: 1, subiram: { '5': 0, '6': 0 }, vagas: 0 });
    expect(t.leads[0]).toMatchObject({ stage: 8, auto_stage_applied: null });
  });

  it('lead já em 5 (o sync subiu): grava só a marca, sem evento', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 5 }));
    t.signups.push(signup());
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r.subiram).toEqual({ '5': 0, '6': 0 });
    expect(t.leads[0]).toMatchObject({ stage: 5, auto_stage_applied: 5 });
    expect(t.eventos).toHaveLength(0);
  });

  it('primeira vaga publicada: anotação com auto_key, etapa igual; repetir não duplica', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 5, auto_stage_applied: 5 }));
    const s = signup({ first_vacancy_at: new Date('2026-10-21T22:00:00.000Z'), first_vacancy_day: '2026-10-21' });
    t.signups.push(s);
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r).toEqual({ vistos: 1, subiram: { '5': 0, '6': 0 }, vagas: 1 });
    expect(t.eventos).toEqual([
      {
        lead_id: L1,
        at: AGORA,
        kind: 'note',
        author_label: 'Automático · Freela',
        text: 'Publicou a primeira vaga no Freela em 21/10',
        auto_key: `a2:vaga1:${s.id}`,
      },
    ]);
    expect(t.leads[0]).toMatchObject({ stage: 5 });
    const r2 = await t.svc.passadaCadastros(AGORA);
    expect(r2.vagas).toBe(0);
    expect(t.eventos).toHaveLength(1);
  });

  it('lead arquivado entre a leitura e a escrita: count 0, segue para o próximo sem lançar', async () => {
    const t = montar();
    t.leads.push(lead({ id: L1 }), lead({ id: L2 }));
    t.signups.push(
      signup({ lead_id: L1, freela_user_id: 'u1', first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }),
      signup({ lead_id: L2, freela_user_id: 'u2', first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }),
    );
    const ler = t.prisma.leads.findUnique.getMockImplementation()!;
    t.prisma.leads.findUnique.mockImplementation(async (args: any) => {
      const r = await ler(args);
      if (args.where.id === L1) t.leads.find((l) => l.id === L1)!.archived = true; // arquivado logo depois da leitura
      return r;
    });
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r).toEqual({ vistos: 2, subiram: { '5': 0, '6': 1 }, vagas: 0 });
    expect(t.leads.find((l) => l.id === L1)).toMatchObject({ stage: 5, archived: true, auto_stage_applied: null });
    expect(t.leads.find((l) => l.id === L2)).toMatchObject({ stage: 6 });
    expect(t.eventos.map((e) => e.auto_key)).toEqual([`a2:etapa:${L2}:6`]);
    expect(t.rodadas[0]).toMatchObject({ ok: true });
  });

  it('lead arquivado ou de teste na leitura: não é tocado nem contado', async () => {
    const t = montar();
    t.leads.push(lead({ id: L1, archived: true }), lead({ id: L2, is_test: true }));
    t.signups.push(
      signup({ lead_id: L1, first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }),
      signup({ lead_id: L2, freela_user_id: 'u2', first_vacancy_at: new Date('2026-10-21T22:00:00.000Z'), first_vacancy_day: '2026-10-21' }),
    );
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r).toEqual({ vistos: 0, subiram: { '5': 0, '6': 0 }, vagas: 0 });
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('freela_user_id nulo no lead é preenchido quando o vínculo é único; nunca sobrescreve', async () => {
    const t = montar();
    t.leads.push(lead({ id: L1, stage: 5, auto_stage_applied: 5 }), lead({ id: L2, stage: 5, auto_stage_applied: 5, freela_user_id: 'outro' }));
    t.signups.push(signup({ lead_id: L1, freela_user_id: 'u1' }), signup({ lead_id: L2, freela_user_id: 'u2' }));
    await t.svc.passadaCadastros(AGORA);
    expect(t.leads.find((l) => l.id === L1)!.freela_user_id).toBe('u1');
    expect(t.leads.find((l) => l.id === L2)!.freela_user_id).toBe('outro');
    expect(t.rodadas[0]!.summary).toMatchObject({ vinculados: 1 });
  });

  it('vínculo ambíguo (dois usuários do Freela no mesmo lead, ou um usuário em dois leads): não preenche', async () => {
    const t = montar();
    t.leads.push(lead({ id: L1, auto_stage_applied: 5 }), lead({ id: L2, auto_stage_applied: 5 }));
    t.signups.push(
      signup({ lead_id: L1, freela_user_id: 'u1' }),
      signup({ lead_id: L1, freela_user_id: 'u9' }),
      signup({ lead_id: L2, freela_user_id: 'u2' }),
      // u2 também aponta para um lead arquivado: o vínculo dele não é único
      signup({ lead_id: 'dddddddd-0000-4000-8000-0000000000ff', freela_user_id: 'u2' }),
    );
    t.leads.push(lead({ id: 'dddddddd-0000-4000-8000-0000000000ff', archived: true }));
    await t.svc.passadaCadastros(AGORA);
    expect(t.leads.find((l) => l.id === L1)!.freela_user_id).toBeNull();
    expect(t.leads.find((l) => l.id === L2)!.freela_user_id).toBeNull();
  });

  it('dois cadastros no mesmo lead: vale o alvo maior, um evento só', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 3 }));
    t.signups.push(signup({ freela_user_id: 'u1' }), signup({ freela_user_id: 'u1', first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }));
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r).toEqual({ vistos: 2, subiram: { '5': 0, '6': 1 }, vagas: 0 });
    expect(t.eventos.map((e) => e.stage_to)).toEqual([6]);
    expect(t.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('falha numa transação: conta o erro, segue e a rodada fica não ok com erro saneado', async () => {
    const t = montar();
    t.leads.push(lead({ id: L1 }), lead({ id: L2 }));
    t.signups.push(
      signup({ lead_id: L1, freela_user_id: 'u1', first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }),
      signup({ lead_id: L2, freela_user_id: 'u2', first_job_completed_at: new Date('2026-10-20T15:00:00.000Z') }),
    );
    const fn = t.prisma.$transaction.getMockImplementation()!;
    t.prisma.$transaction.mockImplementationOnce(async () => {
      throw new Error('conexão caiu com telefone 11987654321');
    });
    t.prisma.$transaction.mockImplementation(fn);
    const r = await t.svc.passadaCadastros(AGORA);
    expect(r.subiram).toEqual({ '5': 0, '6': 1 });
    expect(t.rodadas[0]).toMatchObject({ ok: false, error: 'CRM_ERROR: A rodada falhou.' });
    expect(t.rodadas[0]!.summary).toMatchObject({ erros: 1 });
  });

  it('erro antes do laço: rodada não ok gravada e o erro sobe', async () => {
    const t = montar();
    t.prisma.field_signups.findMany.mockRejectedValueOnce(new Error('banco fora'));
    await expect(t.svc.passadaCadastros(AGORA)).rejects.toThrow('banco fora');
    expect(t.rodadas).toEqual([expect.objectContaining({ job: 'etapas_cadastro', ok: false, error: 'CRM_ERROR: A rodada falhou.' })]);
  });
});

describe('EtapasAutomaticasService.subir', () => {
  const base = { lead_id: L1, fato_dia: '2026-10-20', autor_label: 'Automático · Freela', texto: 'Fato.', agora: AGORA };

  it('auto_key já gravado por outra instância (P2002 na criação): trata como "já existe", sem lançar', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 5 }));
    t.eventos.push({ lead_id: L1, auto_key: `a2:etapa:${L1}:6` });
    // A consulta prévia não viu (corrida entre consulta e INSERT).
    t.prisma.lead_events.findUnique.mockResolvedValueOnce(null);
    const d = await t.svc.subir(t.prisma, { ...base, alvo: 6, auto_key: `a2:etapa:${L1}:6` });
    expect(d).toBe('aplicar');
    expect(t.eventos).toHaveLength(1);
  });

  it('evento com a mesma auto_key já existe: não tenta criar (a consulta evita abortar a transação)', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 5 }));
    t.eventos.push({ lead_id: L1, auto_key: `a2:etapa:${L1}:6` });
    const d = await t.svc.subir(t.prisma, { ...base, alvo: 6, auto_key: `a2:etapa:${L1}:6` });
    expect(d).toBe('aplicar');
    expect(t.prisma.lead_events.create).not.toHaveBeenCalled();
  });

  it('lead que não existe: ignorar', async () => {
    const t = montar();
    expect(await t.svc.subir(t.prisma, { ...base, alvo: 6, auto_key: 'k' })).toBe('ignorar');
    expect(t.prisma.leads.updateMany).not.toHaveBeenCalled();
  });

  it('a guarda vive no where do updateMany', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 5 }));
    await t.svc.subir(t.prisma, { ...base, alvo: 6, auto_key: 'k' });
    expect(t.prisma.leads.updateMany.mock.calls[0]![0].where).toEqual({
      id: L1,
      archived: false,
      is_test: false,
      OR: [{ stage: { lt: 6 } }, { stage: 8, stage_since: { lte: '2026-10-20' } }],
      AND: [{ OR: [{ auto_stage_applied: null }, { auto_stage_applied: { lt: 6 } }] }],
    });
  });

  it('lead já à frente (7): só a marca, devolve ja_satisfeito', async () => {
    const t = montar();
    t.leads.push(lead({ stage: 7 }));
    expect(await t.svc.subir(t.prisma, { ...base, alvo: 6, auto_key: 'k' })).toBe('ja_satisfeito');
    expect(t.leads[0]).toMatchObject({ stage: 7, auto_stage_applied: 6 });
    expect(t.prisma.leads.updateMany.mock.calls[0]![0].where).toMatchObject({ stage: { gte: 6, not: 8 } });
    expect(t.eventos).toHaveLength(0);
  });
});

describe('rodadas (crm_automation_runs)', () => {
  function db() {
    const linhas: Row[] = [];
    const noIntervalo = (r: Row, w: Row) =>
      r.job === w.job && (w.ok === undefined || r.ok === w.ok) && (!w.started_at || (r.started_at >= w.started_at.gte && r.started_at < w.started_at.lt));
    const prisma: any = {
      crm_automation_runs: {
        create: jest.fn(async ({ data }: any) => void linhas.push(data)),
        count: jest.fn(async ({ where }: any) => linhas.filter((r) => noIntervalo(r, where)).length),
        findFirst: jest.fn(async ({ where }: any) => [...linhas].filter((r) => r.job === where.job).sort((a, b) => b.started_at - a.started_at)[0] ?? null),
        deleteMany: jest.fn(async ({ where }: any) => {
          const antes = linhas.length;
          for (let i = linhas.length - 1; i >= 0; i--) if (linhas[i]!.started_at < where.started_at.lt) linhas.splice(i, 1);
          return { count: antes - linhas.length };
        }),
      },
    };
    return { prisma, linhas };
  }

  it('registrarRodada grava uma linha com fim, resumo e erro', async () => {
    const t = db();
    await registrarRodada(t.prisma, { job: 'etapas_cadastro', started_at: AGORA, ok: false, summary: { vistos: 2 }, error: 'X: y' });
    expect(t.linhas[0]).toMatchObject({ job: 'etapas_cadastro', ref: null, started_at: AGORA, ok: false, summary: { vistos: 2 }, error: 'X: y' });
    expect(t.linhas[0]!.finished_at).toBeInstanceOf(Date);
  });

  it('rodadaOkNoDia usa o dia de Brasília (23:30 de 20/10 em Brasília já é 21/10 em UTC)', async () => {
    const t = db();
    await registrarRodada(t.prisma, { job: 'sem_resposta', started_at: new Date('2026-10-21T02:30:00.000Z'), ok: true, summary: {} });
    expect(await rodadaOkNoDia(t.prisma, 'sem_resposta', '2026-10-20')).toBe(true);
    expect(await rodadaOkNoDia(t.prisma, 'sem_resposta', '2026-10-21')).toBe(false);
    expect(await rodadaOkNoDia(t.prisma, 'etapas_cadastro', '2026-10-20')).toBe(false);
    expect(t.prisma.crm_automation_runs.count.mock.calls[0]![0].where).toEqual({
      job: 'sem_resposta',
      ok: true,
      started_at: { gte: new Date('2026-10-20T03:00:00.000Z'), lt: new Date('2026-10-21T03:00:00.000Z') },
    });
  });

  it('rodada com erro não conta como ok no dia', async () => {
    const t = db();
    await registrarRodada(t.prisma, { job: 'sem_resposta', started_at: AGORA, ok: false, summary: {}, error: 'E: e' });
    expect(await rodadaOkNoDia(t.prisma, 'sem_resposta', '2026-10-28')).toBe(false);
  });

  it('ultimaRodada devolve a mais recente do trabalho (ou null)', async () => {
    const t = db();
    expect(await ultimaRodada(t.prisma, 'quadro_freela')).toBeNull();
    await registrarRodada(t.prisma, { job: 'quadro_freela', started_at: new Date('2026-10-27T11:00:00.000Z'), ok: true, summary: { a: 1 } });
    await registrarRodada(t.prisma, { job: 'quadro_freela', started_at: AGORA, ok: false, summary: { a: 2 }, error: 'E: e' });
    expect(await ultimaRodada(t.prisma, 'quadro_freela')).toMatchObject({ started_at: AGORA, ok: false, summary: { a: 2 }, error: 'E: e' });
    expect(t.prisma.crm_automation_runs.findFirst.mock.calls[0]![0]).toMatchObject({ where: { job: 'quadro_freela' }, orderBy: { started_at: 'desc' } });
  });

  it('limparRodadasAntigas apaga só as de mais de 30 dias', async () => {
    const t = db();
    await registrarRodada(t.prisma, { job: 'etapas_cadastro', started_at: new Date('2026-09-27T14:00:00.000Z'), ok: true, summary: {} });
    await registrarRodada(t.prisma, { job: 'etapas_cadastro', started_at: new Date('2026-09-28T16:00:00.000Z'), ok: true, summary: {} });
    expect(await limparRodadasAntigas(t.prisma, AGORA)).toBe(1);
    expect(t.linhas).toHaveLength(1);
    expect(t.prisma.crm_automation_runs.deleteMany.mock.calls[0]![0].where.started_at.lt).toEqual(new Date('2026-09-28T15:00:00.000Z'));
  });
});
