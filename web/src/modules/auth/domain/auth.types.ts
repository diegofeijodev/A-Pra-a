/** `UserView` do contrato (§3). Nunca traz `password_hash`. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role_label: string;
  color: string;
  phone: string;
  is_admin: boolean;
  active: boolean;
  theme: Theme;
  active_praca_id: string | null;
  sort: number;
}

export type Theme = 'dark' | 'light';

export interface AuthSession {
  access_token: string;
  user: AuthUser;
}
