import { STEPS, GATED_BY, STEP_BLOCKS, FILL_LIMIT_H } from '../steps';
import {
  FUNNEL_STAGES,
  LOST_REASONS,
  CLASSES,
  ORIGENS,
  IMPORT_ORIGENS,
  EVENT_LABEL,
  CONTACT_KINDS,
  EST_VALUE,
  LEAD_FIELDS,
  CLASSE_ORDER,
} from '../funnel';
import { CHANNELS, AUDIENCES, SEND_MODES, VARIABLES, HARD_MIN, HARD_MAX, DEFAULT_TEMPLATE_DEFAULTS } from '../messages';
import { ENTRY_RULES, COND_RULES, COND_ACTIONS, EXIT_REASON_LABEL, AUTO_ENTRIES, MAX_ENROLL_PER_TICK } from '../cadences';
import {
  OBJETIVOS,
  DESTINOS,
  FORMATOS,
  CREATIVE_STATUS,
  CAMPANHA_STATUS,
  IA_TOOLS,
  MESES,
  SCRIPT_MODELS,
  PROOF_KIND_LABEL,
  GATE_WARNING,
  FILL_ALERT,
} from '../midia';
import { IND_CATALOG, FREQ_DAYS, MILESTONES, CANAIS, PERIODS } from '../indicators';

describe('domain/catalog — steps', () => {
  it('STEPS tem as 11 etapas do roteiro-modelo', () => expect(STEPS.length).toBe(11));
  it('STEPS[1] é a etapa 2, com portão de 40 garçons', () => expect(STEPS[1]?.gate?.target).toBe(40));
  it('GATED_BY mapeia etapa → etapa anterior que libera', () => {
    expect(GATED_BY).toEqual({ 3: 2, 7: 6, 11: 10 });
  });
  it('STEP_BLOCKS tem os 5 blocos do roteiro', () => {
    expect(STEP_BLOCKS).toEqual(['Preparar', 'Começar', 'Provar', 'Crescer', 'Fixas']);
  });
  it('FILL_LIMIT_H é 4 horas', () => expect(FILL_LIMIT_H).toBe(4));
});

describe('domain/catalog — funnel', () => {
  it('FUNNEL_STAGES tem as 8 etapas do funil', () => expect(FUNNEL_STAGES.length).toBe(8));
  it('FUNNEL_STAGES[7] é "Perdido / reaquecer"', () => {
    expect(FUNNEL_STAGES[7]?.name).toBe('Perdido / reaquecer');
  });
  it('LOST_REASONS tem os 7 motivos de perda', () => expect(LOST_REASONS.length).toBe(7));
  it('CLASSES tem as 3 classificações', () => expect(CLASSES.length).toBe(3));
  it('ORIGENS tem as 4 origens de lead', () => expect(ORIGENS.length).toBe(4));
  it('IMPORT_ORIGENS tem as 6 origens de importação', () => expect(IMPORT_ORIGENS.length).toBe(6));
  it('EVENT_LABEL rotula os 6 tipos de evento', () => expect(Object.keys(EVENT_LABEL).length).toBe(6));
  it('CONTACT_KINDS tem os 4 tipos que contam como contato', () => expect(CONTACT_KINDS.length).toBe(4));
  it('EST_VALUE tem o valor estimado por classe', () => {
    expect(EST_VALUE).toEqual({ grande: 4500, alvo: 2200, depois: 900 });
  });
  it('LEAD_FIELDS tem os 9 campos mapeáveis na importação', () => expect(LEAD_FIELDS.length).toBe(9));
  it('CLASSE_ORDER ordena grande < alvo < depois', () => {
    expect(CLASSE_ORDER).toEqual({ grande: 0, alvo: 1, depois: 2 });
  });
});

describe('domain/catalog — messages', () => {
  it('CHANNELS tem os 3 canais', () => expect(CHANNELS.length).toBe(3));
  it('AUDIENCES tem os 2 públicos', () => expect(AUDIENCES.length).toBe(2));
  it('SEND_MODES tem os 2 modos de envio (fila, freela)', () => {
    expect(SEND_MODES.length).toBe(2);
    expect(SEND_MODES.map((m) => m.id)).toEqual(['fila', 'freela']);
  });
  it('VARIABLES tem as 16 variáveis de template', () => expect(VARIABLES.length).toBe(16));
  it('HARD_MIN e HARD_MAX definem a janela permitida', () => {
    expect(HARD_MIN).toBe(8);
    expect(HARD_MAX).toBe(20);
  });
  it('DEFAULT_TEMPLATE_DEFAULTS traz os valores-padrão de variável', () => {
    expect(DEFAULT_TEMPLATE_DEFAULTS.funcao).toBe('garçom');
    expect(DEFAULT_TEMPLATE_DEFAULTS.valor).toBe('R$ 120');
  });
});

describe('domain/catalog — cadences', () => {
  it('ENTRY_RULES tem as 6 regras de entrada', () => expect(ENTRY_RULES.length).toBe(6));
  it('COND_RULES tem as 3 condições de nó', () => expect(COND_RULES.length).toBe(3));
  it('COND_ACTIONS tem as 7 ações de saída', () => expect(COND_ACTIONS.length).toBe(7));
  it('EXIT_REASON_LABEL rotula os 10 motivos de saída', () => {
    expect(Object.keys(EXIT_REASON_LABEL).length).toBe(10);
  });
  it('AUTO_ENTRIES tem as 3 entradas automáticas', () => {
    expect(AUTO_ENTRIES).toEqual(['stage_novo', 'reheat_due', 'first_vaga']);
  });
  it('MAX_ENROLL_PER_TICK é 30', () => expect(MAX_ENROLL_PER_TICK).toBe(30));
});

describe('domain/catalog — midia', () => {
  it('OBJETIVOS tem os 5 objetivos de campanha', () => expect(OBJETIVOS.length).toBe(5));
  it('DESTINOS tem os 3 destinos', () => expect(DESTINOS.length).toBe(3));
  it('FORMATOS tem os 6 formatos de criativo', () => expect(FORMATOS.length).toBe(6));
  it('CREATIVE_STATUS tem os 6 status de criativo', () => expect(CREATIVE_STATUS.length).toBe(6));
  it('CAMPANHA_STATUS tem os 4 status de campanha', () => expect(CAMPANHA_STATUS.length).toBe(4));
  it('IA_TOOLS tem as 7 ferramentas', () => expect(IA_TOOLS.length).toBe(7));
  it('MESES tem as 12 abreviações', () => expect(MESES.length).toBe(12));
  it('SCRIPT_MODELS tem os 5 modelos de roteiro', () => expect(SCRIPT_MODELS.length).toBe(5));
  it('SCRIPT_MODELS usa cta_botao em snake_case', () => {
    expect(SCRIPT_MODELS[0]?.cta_botao).toBe('Saiba mais');
  });
  it('PROOF_KIND_LABEL rotula os 3 tipos de prova', () => expect(Object.keys(PROOF_KIND_LABEL).length).toBe(3));
  it('GATE_WARNING e FILL_ALERT trazem os textos do protótipo', () => {
    expect(GATE_WARNING).toBe(
      'Esta praça ainda não bateu o portão de recontratação. Mídia antes disso multiplica o problema.',
    );
    expect(FILL_ALERT).toBe('Preenchimento acima de 4 horas. Corte a mídia e volte para a captação de freelancer.');
  });
});

describe('domain/catalog — indicators', () => {
  it('IND_CATALOG tem os 12 indicadores', () => expect(IND_CATALOG.length).toBe(12));
  it('6 indicadores são "hero" (visão Empresa)', () => {
    expect(IND_CATALOG.filter((d) => d.hero).length).toBe(6);
  });
  it('owner do protótipo virou owner_email', () => {
    const clientesAtivos = IND_CATALOG.find((d) => d.key === 'clientes_ativos');
    expect(clientesAtivos?.owner_email).toBe('daniel@praca.local');
    const custoCliente = IND_CATALOG.find((d) => d.key === 'custo_cliente');
    expect(custoCliente?.owner_email).toBe('mkt@praca.local');
    const contratosRede = IND_CATALOG.find((d) => d.key === 'contratos_rede');
    expect(contratosRede?.owner_email).toBe('diego@praca.local');
  });
  it('FREQ_DAYS converte frequência em dias', () => {
    expect(FREQ_DAYS).toEqual({ diária: 1, semanal: 7, mensal: 31 });
  });
  it('MILESTONES tem as 3 metas por horizonte', () => expect(MILESTONES.length).toBe(3));
  it('CANAIS tem os 6 canais de origem', () => expect(CANAIS.length).toBe(6));
  it('PERIODS tem os 5 períodos pré-definidos', () => expect(PERIODS.length).toBe(5));
});
