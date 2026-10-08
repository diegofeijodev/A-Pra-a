/** Consultor de campo autenticado, resolvido pelo `CampoAuthGuard` e anexado a `request.campo`. */
export interface CampoConsultant {
  id: string;
  name: string;
  email: string;
  praca_id: string;
  must_change_password: boolean;
}
