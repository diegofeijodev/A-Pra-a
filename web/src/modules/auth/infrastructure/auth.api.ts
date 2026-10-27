import { api } from '@/modules/shared/infrastructure/http';
import type { AuthSession, AuthUser } from '../domain/auth.types';

export async function login(email: string, password: string): Promise<AuthSession> {
  const { data } = await api.post('/v1/auth/login', { email, password });
  return data as AuthSession;
}

export async function me(): Promise<{ user: AuthUser }> {
  const { data } = await api.get('/v1/auth/me');
  return data as { user: AuthUser };
}

/**
 * A PRÓPRIA senha, pedindo a atual (contrato §2, redesenho E3). Senha atual errada = `400 WRONG_PASSWORD` (não 401: o interceptor do
 * `http.ts` trataria como sessão morta). O token não muda (o JWT da equipe não tem `token_version`).
 */
export async function trocarSenha(atual: string, nova: string): Promise<{ ok: true }> {
  const { data } = await api.post('/v1/auth/change-password', { current_password: atual, new_password: nova });
  return data as { ok: true };
}
