import { Logger } from '@nestjs/common';
import { CRM_DESLIGADAS, type FlagsCrm } from '../../../common/flags/crm.flags';
import { CrmScheduler } from '../crm.scheduler';

const TODAS: FlagsCrm = { ...CRM_DESLIGADAS, auto_stages: true, auto_lost: true, freela_pipeline: true };
// Brasília = UTC-3.
const sp = (iso: string) => new Date(`${iso}-03:00`);

function montar(flags: FlagsCrm | undefined | 'sem' = TODAS, opts: { okHoje?: boolean } = {}) {
  const prisma: any = {
    crm_automation_runs: {
      count: jest.fn(async () => (opts.okHoje ? 1 : 0)),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const etapas: any = { passadaCadastros: jest.fn(async () => ({})) };
  const quadro: any = { rodar: jest.fn(async () => ({})) };
  const semResposta: any = { rodar: jest.fn(async () => ({ candidatos: 0, perdidos: 0 })) };
  const s = new CrmScheduler(prisma, etapas, quadro, semResposta, flags === 'sem' ? undefined : flags);
  return { s, prisma, etapas, quadro, semResposta };
}

describe('CrmScheduler', () => {
  let erro: jest.SpyInstance;
  beforeEach(() => {
    erro = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('A2 roda de hora em hora entre 06h e 23h, só no início da hora', async () => {
    const { s, etapas } = montar();
    await s.bater(sp('2026-10-28T05:55:00'));
    expect(etapas.passadaCadastros).not.toHaveBeenCalled();
    await s.bater(sp('2026-10-28T06:00:00'));
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-28T06:05:00'));
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-28T07:00:00'));
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(2);
    await s.bater(sp('2026-10-28T23:00:00'));
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(3);
    await s.bater(sp('2026-10-29T00:00:00'));
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(3);
  });

  it('A2 roda no primeiro tick dentro da hora (deploy no meio dela) e não repete', async () => {
    const { s, etapas } = montar();
    await s.bater(sp('2026-10-28T06:07:00'));
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-28T06:12:00'));
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(1);
  });

  it('A3 roda no primeiro tick da hora par e não repete', async () => {
    const { s, quadro } = montar();
    await s.bater(sp('2026-10-28T08:35:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-28T08:40:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(1);
  });

  it('A4 que falhou só tenta de novo 60 min depois', async () => {
    const { s, semResposta } = montar();
    semResposta.rodar.mockRejectedValue(new Error('x'));
    await s.bater(sp('2026-10-28T06:10:00'));
    await s.bater(sp('2026-10-28T06:15:00'));
    expect(semResposta.rodar).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-28T07:10:00'));
    expect(semResposta.rodar).toHaveBeenCalledTimes(2);
  });

  it('A2 não repete na mesma hora-alvo nem em reticks', async () => {
    const { s, etapas } = montar();
    await s.bater(sp('2026-10-28T06:00:00'));
    await s.bater(sp('2026-10-28T06:00:30'));
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(1);
  });

  it('A3 nas horas pares de 08 a 20, uma vez por hora-alvo', async () => {
    const { s, quadro } = montar();
    await s.bater(sp('2026-10-28T06:00:00'));
    expect(quadro.rodar).not.toHaveBeenCalled();
    await s.bater(sp('2026-10-28T08:00:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-28T10:00:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(2);
    await s.bater(sp('2026-10-28T10:05:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(2);
    await s.bater(sp('2026-10-28T11:00:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(2);
    await s.bater(sp('2026-10-28T20:00:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(3);
    await s.bater(sp('2026-10-28T21:00:00'));
    await s.bater(sp('2026-10-28T22:00:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(3);
  });

  it('A4 roda uma vez por dia a partir de 06:10 e sobrevive a reinício', async () => {
    const a = montar();
    await a.s.bater(sp('2026-10-28T06:05:00'));
    expect(a.semResposta.rodar).not.toHaveBeenCalled();
    await a.s.bater(sp('2026-10-28T06:10:00'));
    expect(a.semResposta.rodar).toHaveBeenCalledTimes(1);
    expect(a.prisma.crm_automation_runs.count.mock.calls[0][0].where.job).toBe('sem_resposta');

    const b = montar(TODAS, { okHoje: true });
    await b.s.bater(sp('2026-10-28T06:15:00'));
    expect(b.semResposta.rodar).not.toHaveBeenCalled();

    const c = montar(); // reinício às 07:00 sem rodada ok
    await c.s.bater(sp('2026-10-28T07:00:00'));
    expect(c.semResposta.rodar).toHaveBeenCalledTimes(1);
  });

  it('A4 consulta a rodada do dia de Brasília e limpa as antigas uma vez por dia', async () => {
    const { s, prisma, semResposta } = montar();
    const tarde = sp('2026-10-27T23:55:00'); // 02:55Z de 28/10
    expect(tarde.toISOString()).toBe('2026-10-28T02:55:00.000Z');
    await s.bater(tarde);
    expect(semResposta.rodar).toHaveBeenCalledTimes(1);
    const gte: Date = prisma.crm_automation_runs.count.mock.calls[0][0].where.started_at.gte;
    expect(gte.toISOString()).toBe('2026-10-27T03:00:00.000Z');
    expect(prisma.crm_automation_runs.deleteMany).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-27T23:56:00'));
    expect(prisma.crm_automation_runs.deleteMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['só auto_stages', { auto_stages: true }],
    ['só freela_pipeline', { freela_pipeline: true }],
    ['só auto_leads (sem trabalho no relógio)', { auto_leads: true }],
  ])('limpeza das rodadas antigas com %s ligada: uma vez por dia, a qualquer hora', async (_n, ligadas) => {
    const { s, prisma, semResposta } = montar({ ...CRM_DESLIGADAS, ...ligadas });
    await s.bater(sp('2026-10-28T03:00:00'));
    expect(prisma.crm_automation_runs.deleteMany).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-28T09:00:00'));
    expect(prisma.crm_automation_runs.deleteMany).toHaveBeenCalledTimes(1);
    await s.bater(sp('2026-10-29T00:05:00'));
    expect(prisma.crm_automation_runs.deleteMany).toHaveBeenCalledTimes(2);
    expect(semResposta.rodar).not.toHaveBeenCalled();
  });

  it('limpeza não depende da A4: reinício num dia em que a A4 já rodou ok ainda limpa', async () => {
    const { s, prisma, semResposta } = montar(TODAS, { okHoje: true });
    await s.bater(sp('2026-10-28T10:30:00'));
    expect(semResposta.rodar).not.toHaveBeenCalled();
    expect(prisma.crm_automation_runs.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('limpeza que falha: bater resolve, os trabalhos seguem e o log leva só o nome da classe', async () => {
    const { s, prisma, etapas } = montar();
    class Banco extends Error {}
    prisma.crm_automation_runs.deleteMany.mockRejectedValue(new Banco('delete from ... 11999999999'));
    await expect(s.bater(sp('2026-10-28T09:00:00'))).resolves.toBeUndefined();
    expect(etapas.passadaCadastros).toHaveBeenCalledTimes(1);
    expect(erro.mock.calls.map((c) => String(c[0])).join('|')).toContain('limpeza');
    expect(erro.mock.calls.map((c) => String(c[0])).join('|')).not.toContain('11999999999');
  });

  it('rodar que lança: bater resolve, erro no log só com o nome da classe, e os outros seguem', async () => {
    const { s, etapas, quadro, semResposta } = montar();
    class Boom extends Error {}
    etapas.passadaCadastros.mockRejectedValue(new Boom('telefone 11999999999'));
    quadro.rodar.mockRejectedValue(new Boom('x'));
    await expect(s.bater(sp('2026-10-28T08:10:00'))).resolves.toBeUndefined();
    await expect(s.bater(sp('2026-10-28T08:00:00'))).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
    expect(erro.mock.calls.map((c) => String(c[0])).join('|')).not.toContain('11999999999');
    expect(erro.mock.calls.map((c) => String(c[0])).join('|')).toContain('Boom');
    expect(semResposta.rodar).toHaveBeenCalled();
  });

  it('um erro do banco no A4 não escapa', async () => {
    const { s, prisma } = montar();
    prisma.crm_automation_runs.count.mockRejectedValue(new Error('db'));
    await expect(s.bater(sp('2026-10-28T09:00:00'))).resolves.toBeUndefined();
  });

  it('trabalho ainda rodando não começa de novo', async () => {
    const { s, quadro } = montar();
    let solta!: () => void;
    quadro.rodar.mockImplementation(() => new Promise<void>((r) => (solta = r)));
    const p = s.bater(sp('2026-10-28T08:00:00'));
    await new Promise((r) => setImmediate(r));
    // Mesmo se o marcador de hora fosse esquecido, a guarda de "rodando" segura.
    (s as any).ultimoSlot.quadro = null;
    await s.bater(sp('2026-10-28T08:00:00'));
    expect(quadro.rodar).toHaveBeenCalledTimes(1);
    solta();
    await p;
  });

  it('com todas as chaves desligadas não consulta o banco nem chama serviço', async () => {
    for (const flags of [CRM_DESLIGADAS, 'sem' as const]) {
      const { s, prisma, etapas, quadro, semResposta } = montar(flags);
      await s.bater(sp('2026-10-28T08:00:00'));
      await s.bater(sp('2026-10-28T09:00:00'));
      expect(prisma.crm_automation_runs.count).not.toHaveBeenCalled();
      expect(prisma.crm_automation_runs.deleteMany).not.toHaveBeenCalled();
      expect(etapas.passadaCadastros).not.toHaveBeenCalled();
      expect(quadro.rodar).not.toHaveBeenCalled();
      expect(semResposta.rodar).not.toHaveBeenCalled();
    }
  });
});
