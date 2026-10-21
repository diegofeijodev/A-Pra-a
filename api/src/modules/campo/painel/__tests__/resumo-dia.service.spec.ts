import type { CampoConsultant } from '../../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../../common/database/prisma.service';
import { CONFIG_ROTA_PADRAO } from '../../../../domain/rota-rules';
import { CONFIG_RESUMO_DIA } from '../../../../domain/resumo-dia-rules';
import { PRESET_CHEFE } from '../../../../domain/earnings-rules';
import type { RotasConfigService } from '../../../rotas/rotas-config.service';
import { A, B, FakeInputs, FakeRepo } from '../../earnings/__tests__/fakes';
import { CadastrosDoDiaService } from '../cadastros-do-dia.service';
import { ResumoDiaService } from '../resumo-dia.service';

const AGORA = new Date('2026-10-22T21:00:00.000Z'); // 18:00 de Brasília
const DIA = '2026-10-22';
const CA: CampoConsultant = { id: A, name: 'Ana', email: 'a@x.com', praca_id: 'p', must_change_password: false };

function fakePrisma() {
  return {
    field_consultants: { findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === B ? { id: B, name: 'Bruno' } : null)) },
    field_journeys: { findMany: jest.fn().mockResolvedValue([{ started_at: new Date('2026-10-22T12:02:00Z'), ended_at: new Date('2026-10-22T20:42:00Z') }]) },
    field_visits: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'v1', checkin_at: new Date('2026-10-22T13:00:00Z'), checkout_at: new Date('2026-10-22T13:07:00Z'), outcome: 'conversa', flow: 'simples' },
        { id: 'v2', checkin_at: new Date('2026-10-22T14:00:00Z'), checkout_at: new Date('2026-10-22T14:05:00Z'), outcome: 'fechado', flow: 'completo' },
        { id: 'v3', checkin_at: new Date('2026-10-22T15:00:00Z'), checkout_at: null, outcome: 'conversa', flow: 'simples' },
      ]),
    },
    field_routes: {
      findFirst: jest.fn().mockResolvedValue({
        stops: [
          { kind: 'planejada', status: 'visitada', visit_id: 'v1' },
          { kind: 'planejada', status: 'visitada', visit_id: 'v3' },
          { kind: 'planejada', status: 'pendente', visit_id: null },
          { kind: 'planejada', status: 'descartada', visit_id: null },
        ],
      }),
    },
  };
}

function montar(o: { rotas?: boolean; repo?: FakeRepo; inputs?: FakeInputs } = {}) {
  const p = fakePrisma();
  const configs = {
    config: async () => CONFIG_ROTA_PADRAO,
    resumoDia: async () => CONFIG_RESUMO_DIA.padrao,
    cadastro: async () => ({ confirmation_rule: 'activated' as const }),
  } as unknown as RotasConfigService;
  const cad = new CadastrosDoDiaService(o.repo ?? new FakeRepo(), o.inputs ?? new FakeInputs(), configs);
  return { s: new ResumoDiaService(p as unknown as PrismaService, configs, cad, o.rotas ?? true, undefined, { ligado: false, intervaloMin: 10, janelaDias: 45 }), p };
}
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e as { getStatus(): number; getResponse(): { code: string } });

describe('ResumoDiaService (contrato §33.5)', () => {
  it('consultor: só os dados DELE (id do token); roteiro do dia; fechado do completo fora da meta; aberta não conta', async () => {
    const { s, p } = montar();
    const r = await s.doConsultor(CA, DIA, AGORA);
    for (const m of [p.field_journeys.findMany, p.field_visits.findMany]) expect(m.mock.calls[0][0].where.consultant_id).toBe(A);
    expect(p.field_routes.findFirst.mock.calls[0][0].where).toEqual({ consultant_id: A, day: DIA, status: 'ativa' });
    expect(r).toMatchObject({ day: DIA, consultant_id: A, planned: 3, planned_source: 'roteiro', route_visited: 1, visits_done: 1, total_min: 520, first_start: '09:02', last_end: '17:42', day_open: false, display: 'nota' });
    // produção hoje: confirmados + sincronização desligada → positivação 0, nota máxima 7
    expect(r.signups_source).toBe('freela_confirmed');
    expect(r.conta.join(' ')).toContain('a nota máxima é 7');
  });

  it('sem a flag do roteiro: a meta do dia', async () => {
    const r = await montar({ rotas: false }).s.doConsultor(CA, DIA, AGORA);
    expect(r).toMatchObject({ planned: 30, planned_source: 'meta', route_visited: null });
  });

  it('regra do dia "declarado": os declarados do dia contam', async () => {
    const repo = new FakeRepo();
    repo.versions.push({ version: 2, valid_from: '2026-10-20', config: PRESET_CHEFE, reason: null, created_by_name: 'Diego', created_at: new Date() });
    const inputs = new FakeInputs();
    inputs.set(A, DIA, { signups: 0, declared: 1 });
    const r = await montar({ repo, inputs }).s.doConsultor(CA, DIA, AGORA);
    expect(r).toMatchObject({ signups: 1, signups_source: 'declared', positivacao_pct: 100 });
  });

  it('dia: futuro e mais de 35 dias atrás = 400; padrão = hoje (Brasília)', async () => {
    const { s } = montar();
    expect((await falha(() => s.doConsultor(CA, '2026-10-23', AGORA)))?.getStatus()).toBe(400);
    expect((await falha(() => s.doConsultor(CA, '2026-09-16', AGORA)))?.getStatus()).toBe(400);
    expect((await s.doConsultor(CA, undefined, AGORA)).day).toBe(DIA);
  });

  it('equipe: id mal formado ou inexistente = 404 (isolamento: A não lê B pela rota do consultor — ela não tem id)', async () => {
    const { s } = montar();
    expect((await falha(() => s.daEquipe('x', DIA, AGORA)))?.getStatus()).toBe(404);
    expect((await falha(() => s.daEquipe(A, DIA, AGORA)))?.getStatus()).toBe(404);
    expect((await s.daEquipe(B, DIA, AGORA)).consultant_name).toBe('Bruno');
    expect((await falha(() => s.daEquipe(B, '2026-10-30', AGORA)))?.getStatus()).toBe(400);
  });
});
