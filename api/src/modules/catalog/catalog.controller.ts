import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  AUDIENCES,
  CAMPANHA_STATUS,
  CANAIS,
  CHANNELS,
  CLASSES,
  CLASSE_ORDER,
  COND_ACTIONS,
  COND_RULES,
  CONTACT_KINDS,
  CREATIVE_STATUS,
  DESTINOS,
  ENTRY_RULES,
  EST_VALUE,
  EVENT_LABEL,
  EXIT_REASON_LABEL,
  FILL_ALERT,
  FILL_LIMIT_H,
  FORMATOS,
  FUNNEL_STAGES,
  GATED_BY,
  GATE_WARNING,
  HARD_MAX,
  HARD_MIN,
  IA_TOOLS,
  IMPORT_ORIGENS,
  IND_CATALOG,
  LEAD_FIELDS,
  LOST_REASONS,
  MESES,
  MILESTONES,
  OBJETIVOS,
  ORIGENS,
  PERIODS,
  PROOF_KIND_LABEL,
  SCRIPT_MODELS,
  SEND_MODES,
  STEPS,
  STEP_BLOCKS,
  VARIABLES,
} from '../../domain/catalog';

// Catálogo de domínio (roteiro-modelo, funil, mensagens, cadências, mídia e
// indicadores) — conteúdo estático, não vem do banco (ver
// `src/domain/catalog/`). Rota pública: usada antes do login (telas de
// onboarding) e por qualquer módulo que precise dos conjuntos fechados.
@ApiTags('Catálogo')
@Controller('v1/catalog')
export class CatalogController {
  @Public()
  @Get()
  get() {
    return {
      steps: STEPS,
      gated_by: GATED_BY,
      step_blocks: STEP_BLOCKS,
      funnel_stages: FUNNEL_STAGES,
      lost_reasons: LOST_REASONS,
      classes: CLASSES,
      origens: ORIGENS,
      import_origens: IMPORT_ORIGENS,
      event_labels: EVENT_LABEL,
      contact_kinds: CONTACT_KINDS,
      est_value: EST_VALUE,
      lead_fields: LEAD_FIELDS,
      classe_order: CLASSE_ORDER,
      channels: CHANNELS,
      audiences: AUDIENCES,
      send_modes: SEND_MODES,
      variables: VARIABLES,
      hard_min: HARD_MIN,
      hard_max: HARD_MAX,
      entry_rules: ENTRY_RULES,
      cond_rules: COND_RULES,
      cond_actions: COND_ACTIONS,
      exit_reason_labels: EXIT_REASON_LABEL,
      objetivos: OBJETIVOS,
      destinos: DESTINOS,
      formatos: FORMATOS,
      creative_status: CREATIVE_STATUS,
      campanha_status: CAMPANHA_STATUS,
      ia_tools: IA_TOOLS,
      meses: MESES,
      script_models: SCRIPT_MODELS,
      proof_kind_labels: PROOF_KIND_LABEL,
      gate_warning: GATE_WARNING,
      fill_alert: FILL_ALERT,
      fill_limit_h: FILL_LIMIT_H,
      indicators: IND_CATALOG,
      milestones: MILESTONES,
      canais: CANAIS,
      periods: PERIODS,
    };
  }
}
