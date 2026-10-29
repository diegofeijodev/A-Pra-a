import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CRM_DESLIGADAS, type FlagsCrm } from '../../../common/flags/crm.flags';
import type { CartaoFreela } from '../../../domain/freela-cartao';
import { FreelaHttpError, type FreelaClient } from '../../freela/freela-client';
import { GeoService } from '../../geo/geo.service';
import type { RotasConfigService } from '../../rotas/rotas-config.service';
import { EtapasAutomaticasService } from '../etapas-automaticas.service';
import { QuadroFreelaService } from '../quadro-freela.service';

// 28/10 12:00 em Brasília.
const AGORA = new Date('2026-10-28T15:00:00.000Z');
const LIGADA: FlagsCrm = { ...CRM_DESLIGADAS, freela_pipeline: true };
const BH = 'aaaaaaaa-0000-4000-8000-000000000001';
const SP = 'aaaaaaaa-0000-4000-8000-000000000002';
const L1 = 'dddddddd-0000-4000-8000-000000000001';
const L2 = 'dddddddd-0000-4000-8000-000000000002';
const TEL = '+55 31 98765-4321';

type Row = Record<string, any>;

/** Avalia o `where` do serviço: igualdade (null incluso), in, startsWith, lt/lte/gte/not, OR/AND. NULL nunca casa com comparação. */
function casa(l: Row, w: Row): boolean {
  for (const [k, v] of Object.entries(w)) {
    if (v === undefined) continue;
    if (k === 'OR') {
      if (!(v as Row[]).some((x) => casa(l, x))) return false;
      continue;
    }
    if (k === 'AND') {
      if (!(v as Row[]).every((x) => casa(l, x))) return false;
      continue;
    }
    const atual = l[k];
    if (v === null || typeof v !== 'object') {
      if (atual !== v) return false;
      continue;
    }
    if ('in' in v && !v.in.includes(atual)) return false;
    if ('startsWith' in v && !(typeof atual === 'string' && atual.startsWith(v.startsWith))) return false;
    if ('lt' in v && !(atual !== null && atual < v.lt)) return false;
    if ('lte' in v && !(atual !== null && atual <= v.lte)) return false;
    if ('gte' in v && !(atual !== null && atual >= v.gte)) return false;
    if ('not' in v && atual === v.not) return false;
  }
  return true;
}

const cartao = (o: Partial<CartaoFreela> = {}): CartaoFreela => ({
  userId: 'u-1',
  name: 'Bar do Zé',
  city: 'Belo Horizonte',
  state: 'MG',
  whatsappPhone: TEL,
  hiringsCount: 0,
  registeredAt: '2026-10-20T15:00:00.000Z',
  ...o,
});

const lead = (o: Row = {}): Row => ({
  id: L1,
  praca_id: BH,
  name: 'Bar do Zé',
  phone: '31987654321',
  phone_key: '987654321',
  stage: 3,
  stage_since: '2026-10-10',
  archived: false,
  is_test: false,
  auto_stage_applied: null,
  freela_user_id: null,
  freela_hirings: null,
  lost_reason: null,
  reheat_at: null,
  ...o,
});

function montar(opts: { flags?: FlagsCrm | undefined; configurado?: boolean; cartoes?: CartaoFreela[] } = {}) {
  const pracas: Row[] = [
    {
      id: BH,
      start_date: '2026-10-12',
      end_date: '2026-12-12',
      cobertura_cidade: 'Belo Horizonte',
      cobertura_uf: 'MG',
      cobertura_ibge: '3106200',
      vizinhas: ['Contagem', 'Santa Luzia', 'Bom Jesus'],
    },
    { id: SP, start_date: '2026-10-01', end_date: '2026-12-01', cobertura_cidade: null, cobertura_uf: null, cobertura_ibge: null, vizinhas: [] },
  ];
  const leads: Row[] = [];
  const signups: Row[] = [];
  const empresas: Row[] = [];
  const eventos: Row[] = [];
  const rodadas: Row[] = [];
  const travas: string[] = [];
  let seq = 0;

  const prisma: any = {
    pracas: { findMany: jest.fn(async () => pracas.map((p) => ({ ...p }))) },
    leads: {
      findMany: jest.fn(async ({ where }: any) => leads.filter((l) => casa(l, where)).map((l) => ({ ...l }))),
      findFirst: jest.fn(async ({ where }: any) => {
        const l = leads.find((x) => casa(x, where));
        return l ? { ...l } : null;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const l = leads.find((x) => x.id === where.id);
        return l ? { ...l } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const alvo = leads.filter((l) => casa(l, where));
        alvo.forEach((l) => Object.assign(l, data));
        return { count: alvo.length };
      }),
      create: jest.fn(async ({ data }: any) => {
        const novo = { id: `eeeeeeee-0000-4000-8000-${String(++seq).padStart(12, '0')}`, archived: false, is_test: false, ...data };
        leads.push(novo);
        return { id: novo.id };
      }),
    },
    field_signups: {
      findMany: jest.fn(async ({ where }: any) =>
        signups
          .filter((s) => casa(s, where))
          .map((s) => {
            const l = leads.find((x) => x.id === s.lead_id);
            return { ...s, lead: l ? { ...l } : null };
          }),
      ),
    },
    field_company_signups: { findMany: jest.fn(async ({ where }: any) => empresas.filter((e) => casa(e, where)).map((e) => ({ ...e }))) },
    lead_events: {
      findMany: jest.fn(async ({ where }: any) =>
        eventos.filter((e) => casa(e, where)).sort((a, b) => a.at.getTime() - b.at.getTime()).map((e) => ({ lead_id: e.lead_id, at: e.at })),
      ),
      createMany: jest.fn(async ({ data, skipDuplicates }: any) => {
        let count = 0;
        for (const d of data) {
          if (d.auto_key && eventos.some((e) => e.auto_key === d.auto_key)) {
            if (!skipDuplicates) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            continue;
          }
          eventos.push(d);
          count++;
        }
        return { count };
      }),
    },
    crm_automation_runs: { create: jest.fn(async ({ data }: any) => void rodadas.push(data)) },
    $executeRaw: jest.fn(async (_s: TemplateStringsArray, ...v: unknown[]) => {
      expect(_s.join('?')).toContain('pg_advisory_xact_lock(hashtext(');
      travas.push(String(v[0]));
      return 1;
    }),
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const freela = {
    isConfigured: jest.fn(() => opts.configurado ?? true),
    quadroDeContratantes: jest.fn(async () => (opts.cartoes ?? []).map((c) => ({ ...c }))),
  };
  const flags = 'flags' in opts ? opts.flags : LIGADA;
  const config = { cadastro: jest.fn(async () => ({ confirmation_rule: 'activated' })) };
  const etapas = new EtapasAutomaticasService(prisma as PrismaService, config as unknown as RotasConfigService, flags);
  const svc = new QuadroFreelaService(prisma as PrismaService, freela as unknown as FreelaClient, new GeoService(), etapas, flags);
  return { svc, prisma, freela, pracas, leads, signups, empresas, eventos, rodadas, travas };
}

/** Todo `jest.fn` do Prisma falso, para afirmar "nenhuma chamada". */
function chamadas(prisma: any): number {
  let n = prisma.$transaction.mock.calls.length + prisma.$executeRaw.mock.calls.length;
  for (const tabela of Object.values(prisma)) {
    if (tabela && typeof tabela === 'object') for (const f of Object.values(tabela as Row)) if (jest.isMockFunction(f)) n += f.mock.calls.length;
  }
  return n;
}

const vazio = {
  cartoes: 0,
  casados_por_id: 0,
  casados_por_cadastro: 0,
  casados_por_telefone: 0,
  ambiguos: 0,
  criados: 0,
  etapas: { '5': 0, '6': 0, '7': 0 },
  contratacoes: 0,
};

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('QuadroFreelaService.rodar (A3)', () => {
  it('chave desligada (ou sem provedor): nenhuma chamada ao Freela nem ao banco', async () => {
    for (const flags of [CRM_DESLIGADAS, undefined]) {
      const t = montar({ flags, cartoes: [cartao()] });
      expect(await t.svc.rodar(AGORA)).toEqual(vazio);
      expect(t.freela.quadroDeContratantes).not.toHaveBeenCalled();
      expect(chamadas(t.prisma)).toBe(0);
    }
  });

  it('chave ligada sem a conexão do Freela: rodada { nao_configurado } gravada, nenhuma leitura do quadro', async () => {
    const t = montar({ configurado: false, cartoes: [cartao()] });
    expect(await t.svc.rodar(AGORA)).toEqual({ nao_configurado: true });
    expect(t.freela.quadroDeContratantes).not.toHaveBeenCalled();
    expect(t.rodadas).toEqual([
      expect.objectContaining({ job: 'quadro_freela', started_at: AGORA, ok: true, summary: { nao_configurado: true }, error: null }),
    ]);
    expect(t.prisma.leads.findMany).not.toHaveBeenCalled();
  });

  it('cartão casado pelo telefone com 1 vaga paga: lead a 6, vínculo, vagas e eventos com auto_key', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead());
    const r = await t.svc.rodar(AGORA);
    expect(r).toEqual({ ...vazio, cartoes: 1, casados_por_telefone: 1, etapas: { '5': 0, '6': 1, '7': 0 }, contratacoes: 1 });
    expect(t.leads[0]).toMatchObject({
      stage: 6,
      stage_since: '2026-10-28',
      auto_stage_applied: 6,
      freela_user_id: 'u-1',
      freela_hirings: 1,
      phone: '31987654321',
    });
    expect(t.eventos).toEqual([
      {
        lead_id: L1,
        at: AGORA,
        kind: 'note',
        author_id: null,
        author_label: 'Automático · Freela',
        text: 'Freela: 0 → 1 vaga paga (visto em 28/10)',
        auto_key: `a3:contratacoes:${L1}:1`,
      },
      {
        lead_id: L1,
        at: AGORA,
        kind: 'stage',
        author_label: 'Automático · Freela',
        stage_to: 6,
        text: '1 vaga paga no Freela (casado pelo telefone). Etapa: Conversa aberta → Primeira vaga rodada.',
        auto_key: `a3:etapa:${L1}:6`,
      },
    ]);
    expect(t.rodadas).toHaveLength(1);
    expect(t.rodadas[0]).toMatchObject({ job: 'quadro_freela', ref: null, started_at: AGORA, ok: true, error: null });
    expect(t.rodadas[0]!.summary).toEqual({ ...r, vinculados: 1, datas_invalidas: 0, erros: 0 });
  });

  it('mesma rodada repetida: nenhuma escrita (nem transação), só a linha da rodada', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead());
    await t.svc.rodar(AGORA);
    const foto = JSON.stringify([t.leads, t.eventos]);
    t.prisma.$transaction.mockClear();
    const r = await t.svc.rodar(AGORA);
    expect(r).toEqual({ ...vazio, cartoes: 1, casados_por_id: 1 });
    expect(JSON.stringify([t.leads, t.eventos])).toBe(foto);
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
    expect(t.rodadas).toHaveLength(2);
  });

  it('empresa no quadro sem vaga (cadastro próprio): vai a 5 com a data do cadastro', async () => {
    const t = montar({ cartoes: [cartao()] });
    t.leads.push(lead({ freela_user_id: 'u-1' }));
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ casados_por_id: 1, etapas: { '5': 1, '6': 0, '7': 0 }, contratacoes: 0 });
    expect(t.leads[0]).toMatchObject({ stage: 5, freela_hirings: 0, auto_stage_applied: 5 });
    expect(t.eventos.map((e) => e.text)).toEqual([
      'Empresa cadastrada no Freela em 20/10 (casado pelo usuário do Freela). Etapa: Conversa aberta → Cadastrado.',
    ]);
  });

  it('cadastro assistido conhecido com 0 contratações: não vai a 5 (o 5 é do sync); só o vínculo e a contagem', async () => {
    const t = montar({ cartoes: [cartao()] });
    t.leads.push(lead());
    t.signups.push({ freela_user_id: 'u-1', lead_id: L1, match_status: 'linked' });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ casados_por_cadastro: 1, etapas: { '5': 0, '6': 0, '7': 0 }, criados: 0 });
    expect(t.leads[0]).toMatchObject({ stage: 3, auto_stage_applied: null, freela_user_id: 'u-1', freela_hirings: 0 });
    expect(t.eventos).toHaveLength(0);
  });

  it('assistido pelo cadastro da visita (field_company_signups) com 1 vaga: vai a 6', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead());
    t.empresas.push({ freela_user_id: 'u-1' });
    await t.svc.rodar(AGORA);
    expect(t.leads[0]).toMatchObject({ stage: 6, auto_stage_applied: 6 });
  });

  it('cadastro do representante ligado a um lead que já é de OUTRO usuário do Freela: não casa por ali', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1, whatsappPhone: null })] });
    t.leads.push(lead({ freela_user_id: 'u-9' }));
    t.signups.push({ freela_user_id: 'u-1', lead_id: L1, match_status: 'linked' });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ casados_por_cadastro: 0, criados: 0 });
    expect(t.leads[0]).toMatchObject({ stage: 3, freela_user_id: 'u-9', freela_hirings: null });
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cartão novo de BH, cadastrado depois do início da praça: lead criado sem dono, com o telefone do cartão', async () => {
    const t = montar({ cartoes: [cartao({ userId: 'u-novo', hiringsCount: 1 })] });
    const r = await t.svc.rodar(AGORA);
    expect(r).toEqual({ ...vazio, cartoes: 1, criados: 1, contratacoes: 1 });
    expect(t.leads).toHaveLength(1);
    const novo = t.leads[0]!;
    expect(novo).toMatchObject({
      praca_id: BH,
      name: 'Bar do Zé',
      city: 'Belo Horizonte',
      phone: TEL,
      phone_key: '987654321',
      classe: 'alvo',
      origem: 'cadastro no Freela',
      owner_id: null,
      stage: 6,
      entered_at: '2026-10-28',
      stage_since: '2026-10-28',
      freela_user_id: 'u-novo',
      freela_hirings: 1,
      auto_stage_applied: 6,
    });
    expect(t.eventos).toEqual([
      {
        lead_id: novo.id,
        at: AGORA,
        kind: 'stage',
        author_id: null,
        author_label: 'Automático · Freela',
        stage_to: 6,
        text: 'Empresa nova no Freela: cadastro em 20/10 (Belo Horizonte/MG), 1 vaga paga. Entrou no funil em Primeira vaga rodada.',
        auto_key: 'a3:criado:u-novo',
      },
      expect.objectContaining({ kind: 'note', text: 'Freela: 0 → 1 vaga paga (visto em 28/10)', auto_key: `a3:contratacoes:${novo.id}:1` }),
    ]);
    expect(t.travas).toEqual(['crm-freela-user:u-novo', `${BH}:987654321`]);
    // Nada pessoal na rodada.
    expect(JSON.stringify(t.rodadas)).not.toMatch(/9876|Bar do Z/);
  });

  it('lead novo sem vaga entra em Cadastrado (5); repetir a rodada casa pelo id e não cria outro', async () => {
    const t = montar({ cartoes: [cartao({ userId: 'u-novo' })] });
    await t.svc.rodar(AGORA);
    expect(t.leads).toEqual([expect.objectContaining({ stage: 5, freela_hirings: 0, auto_stage_applied: 5 })]);
    expect(t.eventos.map((e) => e.auto_key)).toEqual(['a3:criado:u-novo']);
    const r2 = await t.svc.rodar(AGORA);
    expect(r2).toMatchObject({ casados_por_id: 1, criados: 0 });
    expect(t.leads).toHaveLength(1);
  });

  it('vizinha resolvida com UF: Santa Luzia/MG entra na praça de BH; Santa Luzia/BA e Bom Jesus/RS (longe) não', async () => {
    const t = montar({
      cartoes: [
        cartao({ userId: 'u-mg', city: 'Santa Luzia', state: 'MG', whatsappPhone: '31911112222' }),
        cartao({ userId: 'u-ba', city: 'Santa Luzia', state: 'BA', whatsappPhone: '73922223333' }),
        cartao({ userId: 'u-rs', city: 'Bom Jesus', state: 'RS', whatsappPhone: '54933334444' }),
      ],
    });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ cartoes: 3, criados: 1 });
    expect(t.leads.map((l) => [l.freela_user_id, l.praca_id])).toEqual([['u-mg', BH]]);
  });

  it('cadastro antes do início da praça, praça sem cobertura ou cartão sem cidade: nenhum lead', async () => {
    const t = montar({
      cartoes: [
        cartao({ userId: 'u-antes', registeredAt: '2026-10-11T15:00:00.000Z' }),
        cartao({ userId: 'u-sp', city: 'Campinas', state: 'SP', whatsappPhone: '19911112222' }),
        cartao({ userId: 'u-sem', city: null, whatsappPhone: '31911113333' }),
      ],
    });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ cartoes: 3, criados: 0 });
    expect(t.leads).toHaveLength(0);
  });

  it('registeredAt que não é data: não cria, conta em datas_invalidas e não lança', async () => {
    const t = montar({ cartoes: [cartao({ userId: 'u-x', registeredAt: 'ontem' })] });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ criados: 0 });
    expect(t.leads).toHaveLength(0);
    expect(t.rodadas[0]).toMatchObject({ ok: true, summary: expect.objectContaining({ datas_invalidas: 1 }) });
  });

  it('já existe lead (mesmo arquivado) com o usuário do Freela, ou com o telefone na praça: não cria', async () => {
    const t = montar({
      cartoes: [cartao({ userId: 'u-arq', whatsappPhone: '31911110000' }), cartao({ userId: 'u-tel', whatsappPhone: '31922220000' })],
    });
    t.leads.push(
      lead({ id: L1, archived: true, freela_user_id: 'u-arq', phone: '', phone_key: '' }),
      lead({ id: L2, archived: true, phone: '(31) 92222-0000', phone_key: '922220000' }),
    );
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ criados: 0, casados_por_id: 0, casados_por_telefone: 0 });
    expect(t.leads).toHaveLength(2);
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lead criado por outro processo entre a leitura e a trava: a reconferência dentro da trava não cria outro', async () => {
    const t = montar({ cartoes: [cartao({ userId: 'u-novo' })] });
    const tx = t.prisma.$transaction.getMockImplementation()!;
    t.prisma.$transaction.mockImplementationOnce(async (fn: any) => {
      t.leads.push(lead({ id: L2, freela_user_id: 'u-novo', phone: '', phone_key: '' }));
      return tx(fn);
    });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ criados: 0 });
    expect(t.leads).toHaveLength(1);
    expect(t.travas[0]).toBe('crm-freela-user:u-novo');
    expect(t.eventos).toHaveLength(0);
  });

  it('cartão ambíguo (dois leads com o mesmo telefone na cidade): nada gravado e ambiguos: 1', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead({ id: L1 }), lead({ id: L2 }));
    const foto = JSON.stringify(t.leads);
    const r = await t.svc.rodar(AGORA);
    expect(r).toEqual({ ...vazio, cartoes: 1, ambiguos: 1 });
    expect(JSON.stringify(t.leads)).toBe(foto);
    expect(t.eventos).toHaveLength(0);
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('dois cartões no mesmo lead na mesma rodada: os dois ficam ambíguos', async () => {
    const t = montar({
      cartoes: [cartao({ userId: 'u-1', whatsappPhone: null }), cartao({ userId: 'u-2', hiringsCount: 1 })],
    });
    t.leads.push(lead());
    t.signups.push({ freela_user_id: 'u-1', lead_id: L1, match_status: 'linked' });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ ambiguos: 2, casados_por_cadastro: 0, casados_por_telefone: 0, criados: 0 });
    expect(t.leads[0]).toMatchObject({ stage: 3, freela_user_id: null });
  });

  it('de 1 para 2 vagas com a 1ª vista num dia anterior: Cliente ativo (7)', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 2 })] });
    t.leads.push(lead({ stage: 6, freela_user_id: 'u-1', freela_hirings: 1, auto_stage_applied: 6 }));
    t.eventos.push({ lead_id: L1, at: new Date('2026-10-20T15:00:00.000Z'), auto_key: `a3:contratacoes:${L1}:1` });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ casados_por_id: 1, etapas: { '5': 0, '6': 0, '7': 1 }, contratacoes: 1 });
    expect(t.leads[0]).toMatchObject({ stage: 7, freela_hirings: 2, auto_stage_applied: 7 });
    expect(t.eventos.map((e) => e.text)).toEqual([
      undefined,
      'Freela: 1 → 2 vagas pagas (visto em 28/10)',
      '2 vagas pagas no Freela (casado pelo usuário do Freela). Etapa: Primeira vaga rodada → Cliente ativo.',
    ]);
  });

  it('de 1 para 2 no mesmo dia em que viu a 1ª: fica em 6 (duas funções no mesmo evento)', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 2 })] });
    t.leads.push(lead({ stage: 6, freela_user_id: 'u-1', freela_hirings: 1, auto_stage_applied: 6 }));
    t.eventos.push({ lead_id: L1, at: new Date('2026-10-28T12:00:00.000Z'), auto_key: `a3:contratacoes:${L1}:1` });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ etapas: { '5': 0, '6': 0, '7': 0 }, contratacoes: 1 });
    expect(t.leads[0]).toMatchObject({ stage: 6, freela_hirings: 2 });
  });

  it('salto de 0 para 2 na mesma rodada: dia_viu_primeira é lido ANTES do evento desta rodada → 6', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 2 })] });
    t.leads.push(lead({ stage: 5, freela_user_id: 'u-1', freela_hirings: 0, auto_stage_applied: 5 }));
    await t.svc.rodar(AGORA);
    expect(t.leads[0]).toMatchObject({ stage: 6, freela_hirings: 2, auto_stage_applied: 6 });
  });

  it('lead em Perdido, 1ª observação com vagas: não sai do Perdido (só grava vínculo e contagem)', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead({ stage: 8, stage_since: '2026-10-01', lost_reason: 'preço', reheat_at: '2026-10-31' }));
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ etapas: { '5': 0, '6': 0, '7': 0 } });
    expect(t.leads[0]).toMatchObject({ stage: 8, lost_reason: 'preço', freela_user_id: 'u-1', freela_hirings: 1, auto_stage_applied: null });
    expect(t.eventos.map((e) => e.kind)).toEqual(['note']);
  });

  it('lead em Perdido e o Praça VÊ a contagem subir: sai do Perdido, limpa motivo e reaquecimento', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead({ stage: 8, stage_since: '2026-10-25', lost_reason: 'preço', reheat_at: '2026-11-24', freela_user_id: 'u-1', freela_hirings: 0 }));
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ etapas: { '5': 0, '6': 1, '7': 0 } });
    expect(t.leads[0]).toMatchObject({ stage: 6, lost_reason: null, reheat_at: null, auto_stage_applied: 6, freela_hirings: 1 });
  });

  it('lead lido em 5 e marcado Perdido hoje antes da transação: fica em Perdido, sem evento de etapa', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead({ stage: 5, freela_user_id: 'u-1' }));
    const tx = t.prisma.$transaction.getMockImplementation()!;
    t.prisma.$transaction.mockImplementationOnce(async (fn: any) => {
      Object.assign(t.leads[0]!, { stage: 8, stage_since: '2026-10-28', lost_reason: 'fechou' });
      return tx(fn);
    });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ etapas: { '5': 0, '6': 0, '7': 0 } });
    expect(t.leads[0]).toMatchObject({ stage: 8, lost_reason: 'fechou', freela_hirings: 1 });
    expect(t.eventos.filter((e) => e.kind === 'stage')).toHaveLength(0);
  });

  it('vínculo recusado (a A2 ligou o lead a OUTRO usuário entre a leitura e a transação): nada mais é gravado', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead());
    const tx = t.prisma.$transaction.getMockImplementation()!;
    t.prisma.$transaction.mockImplementationOnce(async (fn: any) => {
      t.leads[0]!.freela_user_id = 'u-9';
      return tx(fn);
    });
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ casados_por_telefone: 1, etapas: { '5': 0, '6': 0, '7': 0 }, contratacoes: 0 });
    expect(t.leads[0]).toMatchObject({ stage: 3, freela_user_id: 'u-9', freela_hirings: null, auto_stage_applied: null });
    expect(t.eventos).toHaveLength(0);
    expect(t.rodadas[0]!.summary).toMatchObject({ vinculados: 0, erros: 0 });
  });

  it('praça com cidade da cobertura mas sem cobertura_ibge: não gera lead (achado 13)', async () => {
    const t = montar({ cartoes: [cartao({ userId: 'u-novo' })] });
    t.pracas[0]!.cobertura_ibge = null;
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ cartoes: 1, criados: 0 });
    expect(t.leads).toHaveLength(0);
  });

  it('alguém voltou o lead de 6 para 3 depois da marca: o quadro não sobe de novo', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1 })] });
    t.leads.push(lead({ stage: 3, auto_stage_applied: 6, freela_user_id: 'u-1', freela_hirings: 1 }));
    await t.svc.rodar(AGORA);
    expect(t.leads[0]).toMatchObject({ stage: 3, auto_stage_applied: 6 });
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('o telefone de um lead que já existe nunca é trocado pelo do cartão', async () => {
    const t = montar({ cartoes: [cartao({ hiringsCount: 1, whatsappPhone: '+55 31 91234-0000' })] });
    t.leads.push(lead({ freela_user_id: 'u-1', phone: '(31) 3333-4444', phone_key: '933334444' }));
    await t.svc.rodar(AGORA);
    expect(t.leads[0]).toMatchObject({ stage: 6, phone: '(31) 3333-4444', phone_key: '933334444' });
    expect(t.prisma.leads.updateMany.mock.calls.every(([a]: any) => !('phone' in a.data) && !('phone_key' in a.data))).toBe(true);
  });

  it('o Freela lança FreelaHttpError(500): rodada ok: false com erro saneado, sem lançar', async () => {
    const t = montar({ cartoes: [cartao()] });
    t.freela.quadroDeContratantes.mockRejectedValueOnce(new FreelaHttpError(500, `falhou para ${TEL}`));
    await expect(t.svc.rodar(AGORA)).resolves.toEqual(vazio);
    expect(t.rodadas).toEqual([
      expect.objectContaining({ job: 'quadro_freela', ok: false, error: 'FREELA_500: O Freela respondeu HTTP 500.' }),
    ]);
  });

  it('falha num lead: os outros seguem; o telefone do cartão nunca vai para o summary nem para o erro', async () => {
    const t = montar({
      cartoes: [cartao({ hiringsCount: 1 }), cartao({ userId: 'u-2', hiringsCount: 1, whatsappPhone: '+55 31 95555-0000' })],
    });
    t.leads.push(lead({ id: L1 }), lead({ id: L2, phone: '31955550000', phone_key: '955550000' }));
    const tx = t.prisma.$transaction.getMockImplementation()!;
    t.prisma.$transaction.mockImplementationOnce(async () => {
      throw Object.assign(new Error(`violou o índice com o telefone ${TEL} e 31987654321`), { code: 'P2034' });
    });
    t.prisma.$transaction.mockImplementation(tx);
    const r = await t.svc.rodar(AGORA);
    expect(r).toMatchObject({ casados_por_telefone: 2, etapas: { '5': 0, '6': 1, '7': 0 } });
    expect(t.rodadas[0]).toMatchObject({ ok: false, error: 'CRM_ERROR: A rodada falhou (P2034).' });
    expect(t.rodadas[0]!.summary).toMatchObject({ erros: 1 });
    expect(JSON.stringify(t.rodadas)).not.toMatch(/9876|5555|Bar do Z/);
  });

  it('a gravação da rodada falha: rodar resolve mesmo assim', async () => {
    const t = montar({ cartoes: [cartao()] });
    t.prisma.crm_automation_runs.create.mockRejectedValueOnce(new Error('tabela trancada'));
    await expect(t.svc.rodar(AGORA)).resolves.toMatchObject({ cartoes: 1 });
  });

  it('leituras em lote: IN em pedaços de 500', async () => {
    const cartoes = Array.from({ length: 1001 }, (_, i) =>
      cartao({ userId: `u-${i}`, whatsappPhone: `319${String(i).padStart(8, '0')}`, registeredAt: '2026-10-01T15:00:00.000Z' }),
    );
    const t = montar({ cartoes });
    await t.svc.rodar(AGORA);
    const porUsuario = t.prisma.leads.findMany.mock.calls.filter(([a]: any) => a.where.freela_user_id?.in);
    expect(porUsuario.map(([a]: any) => a.where.freela_user_id.in.length)).toEqual([500, 500, 1]);
    const porChave = t.prisma.leads.findMany.mock.calls.filter(([a]: any) => a.where.phone_key?.in);
    expect(porChave.map(([a]: any) => a.where.phone_key.in.length)).toEqual([500, 500, 1]);
    expect(t.prisma.field_signups.findMany).toHaveBeenCalledTimes(3);
    expect(t.prisma.field_company_signups.findMany).toHaveBeenCalledTimes(3);
  });
});
