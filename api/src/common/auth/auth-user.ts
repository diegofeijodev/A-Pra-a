/** Usuário autenticado, resolvido pelo guard a cada request e anexado a `request.user`. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  /** Lote E §42.2: gestor EFETIVO (flag `TEAM_GESTOR_ENABLED` e a coluna), lido do banco a cada request; ausente = não. */
  is_gestor?: boolean;
}
