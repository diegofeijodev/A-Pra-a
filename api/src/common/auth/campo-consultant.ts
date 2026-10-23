/** Consultor de campo autenticado, resolvido pelo `CampoAuthGuard` e anexado a `request.campo`. */
export interface CampoConsultant {
  id: string;
  name: string;
  email: string;
  /**
   * A praça ATIVA do request. Com `FIELD_MULTI_PRACA_ENABLED` (contrato §44.4) é a da jornada aberta (se ainda estiver no
   * conjunto), senão a principal; desligada, é sempre a principal (`field_consultants.praca_id`).
   */
  praca_id: string;
  must_change_password: boolean;
  /** Só com `FIELD_MULTI_PRACA_ENABLED`: a principal. Ausente = `praca_id` já é a principal. */
  praca_principal_id?: string;
}

/** A principal do consultor do request (com a flag desligada, `praca_id` já é ela). */
export const principalDe = (c: CampoConsultant): string => c.praca_principal_id ?? c.praca_id;
