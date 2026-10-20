/**
 * Modo do chefe, S0 — testes de CARACTERIZAÇÃO do fluxo COMPLETO.
 *
 * Congelam (em snapshot) a saída atual das regras que S1–S3 vão tocar. Se alguma fase mudar o
 * comportamento do modo completo com as flags desligadas, estes testes quebram — e a mudança tem de
 * ser deliberada (atualizar o snapshot com o motivo no commit). Não editar para "fazer passar".
 */
import { calcularDia, calcularSemana, REGRA_PADRAO, type EntradaDia, type VersaoRegra } from '../earnings-rules';
import {
  estagioDepoisDaVisita,
  faltando,
  normalizarRecusa,
  normalizarRetorno,
  RESPOSTAS_VAZIAS,
  resumoVisita,
  type RespostasVisita,
} from '../campo-rules';

const HOJE = '2026-10-20';
const completa: RespostasVisita = {
  ...RESPOSTAS_VAZIAS,
  interlocutor_name: 'João',
  interlocutor_role: 'dono',
  freela_status: 'ja_usa',
  interest: 'alto',
  open_vagas: 2,
  vaga_roles: ['Garçom'],
  freelas_per_week: 3,
  channels: ['Grupos de WhatsApp'],
  needs_followup: true,
  followup_what: 'Ligar sexta',
  followup_date: '2026-10-23',
  followup_time: '14:30',
  notes: 'Pediu proposta.',
};

describe('caracterização — faltando() do fluxo completo', () => {
  const casos: Record<string, RespostasVisita> = {
    vazio: RESPOSTAS_VAZIAS,
    completa,
    'vagas sem funções': { ...completa, vaga_roles: [] },
    'retorno sem o quê nem data': { ...completa, followup_what: null, followup_date: null },
    'retorno no passado': { ...completa, followup_date: '2026-10-19' },
    'sem retorno': { ...completa, needs_followup: false, followup_what: null, followup_date: null },
    'canal só "outro"': { ...completa, channels: [], channel_other: 'Instagram' },
    fechado: { ...RESPOSTAS_VAZIAS, outcome: 'fechado' },
    'fechado com retorno incompleto': { ...RESPOSTAS_VAZIAS, outcome: 'fechado', needs_followup: true },
    'campos novos do chefe ignorados no completo': { ...RESPOSTAS_VAZIAS, ...({ result: 'sem_interesse', distance_note: 'x' } as object) },
  };
  it.each(Object.entries(casos))('%s', (_nome, r) => {
    expect(faltando(r, HOJE)).toMatchSnapshot();
  });
});

describe('caracterização — resumo do CRM, estágio, recusa e retorno', () => {
  it('resumoVisita: conversa completa, fechado e recusa', () => {
    expect([
      resumoVisita(completa),
      resumoVisita({ ...RESPOSTAS_VAZIAS, outcome: 'fechado', notes: 'Portão baixo.' }),
      resumoVisita({ ...completa, interest: 'nenhum', refusal_reason: 'outro', refusal_note: 'Vai fechar a casa', needs_followup: false }),
    ]).toMatchSnapshot();
  });
  it('estágio depois da visita', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(estagioDepoisDaVisita)).toEqual([0, 3, 3, 3, 4, 5, 6]);
  });
  it('normalizarRecusa e normalizarRetorno', () => {
    expect([
      normalizarRecusa({ interest: 'nenhum', refusal_reason: 'preco', refusal_note: 'x' }),
      normalizarRecusa({ interest: 'baixo', refusal_reason: 'preco', refusal_note: null }),
      normalizarRecusa({ interest: 'nenhum', outcome: 'fechado', refusal_reason: 'preco', refusal_note: null }),
      normalizarRetorno({ needs_followup: true, followup_time: '09:05' }),
      normalizarRetorno({ needs_followup: false, followup_time: '09:05' }),
    ]).toMatchSnapshot();
  });
});

describe('caracterização — regra de pagamento v1 (REGRA_PADRAO), valores em centavos', () => {
  const dia = (signups: number, over: Partial<EntradaDia> = {}): EntradaDia => ({
    dia: '2026-10-19',
    signups,
    visits: 0,
    journey_open: true,
    elegivel: true,
    ...over,
  });
  it('calcularDia para 0, 9, 10, 12, 20 cadastros', () => {
    expect([0, 9, 10, 12, 20].map((n) => calcularDia(REGRA_PADRAO, dia(n), 1))).toMatchSnapshot();
  });
  it('calcularSemana com a v1', () => {
    const versoes: VersaoRegra[] = [{ version: 1, valid_from: '2026-01-01', config: REGRA_PADRAO }];
    const r = calcularSemana({
      from: '2026-10-19',
      to: '2026-10-25',
      hoje: '2026-10-21',
      versoes,
      entradas: {
        '2026-10-19': dia(10),
        '2026-10-20': { ...dia(3), dia: '2026-10-20' },
        '2026-10-21': { ...dia(0), dia: '2026-10-21' },
      },
    });
    expect(r).toMatchSnapshot();
  });
});
