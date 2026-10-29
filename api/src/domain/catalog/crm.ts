/** CRM automático (contrato §47): constantes do catálogo. Nada aqui lê banco nem ambiente. */

/** Autores dos eventos automáticos (`author_label`). O sync de hoje continua com `AUTOR_SYNC_FREELA`. */
export const AUTOR_AUTOMATICO = 'Automático';
export const AUTOR_AUTOMATICO_FREELA = 'Automático · Freela';
export const AUTOR_SYNC_FREELA = 'Freela (sincronização)';

/** A1: teto de leads criados sozinhos por busca. */
export const TETO_AUTO_LEADS_POR_BUSCA = 300;
/** A4: dias sem resposta até o lead ir para "Perdido / reaquecer". */
export const DIAS_SEM_RESPOSTA = 21;
export const DIAS_REAQUECER = 30;
/** Tarefas do dia. */
export const DIAS_CONVERSA_PARADA = 5;
export const DIAS_AJUDAR_PUBLICAR = 3;
export const DIAS_SEM_CONTATO_T5 = 3;
export const DIAS_VISITA_QUENTE = { min: 1, max: 14 } as const;
/** Retenção das rodadas em `crm_automation_runs`. */
export const DIAS_RETENCAO_RODADAS = 30;
/** Itens por grupo em `GET /v1/crm/tasks` (o `total` conta todos). */
export const ITENS_POR_GRUPO = 50;

export const ORIGEM_CADASTRO_FREELA = 'cadastro no Freela';

export const JOBS_CRM = ['auto_leads_busca', 'etapas_cadastro', 'quadro_freela', 'sem_resposta'] as const;
export type JobCrm = (typeof JOBS_CRM)[number];
