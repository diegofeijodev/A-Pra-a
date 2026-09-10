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
