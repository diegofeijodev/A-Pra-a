import { api } from '@/modules/shared/infrastructure/http';
import type { AuthUser, Theme } from '@/modules/auth/domain/auth.types';

export type UserView = AuthUser;

/** Campos que a própria conta pode mudar — `PATCH /v1/users/me` (§3). */
export interface UpdateMeInput {
  name?: string;
  color?: string;
  phone?: string;
  theme?: Theme;
  active_praca_id?: string | null;
}

/** Campos que só admin muda em outra conta — `PATCH /v1/users/:id` (§3). */
export interface UpdateUserInput {
  name?: string;
  role_label?: string;
  color?: string;
  phone?: string;
  is_admin?: boolean;
  active?: boolean;
  sort?: number;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role_label?: string;
  color?: string;
  phone?: string;
  is_admin?: boolean;
}

export async function listUsers(): Promise<UserView[]> {
  const { data } = await api.get('/v1/users');
  return data as UserView[];
}

export async function updateMe(input: UpdateMeInput): Promise<UserView> {
  const { data } = await api.patch('/v1/users/me', input);
  return data as UserView;
}

export async function createUser(input: CreateUserInput): Promise<UserView> {
  const { data } = await api.post('/v1/users', input);
  return data as UserView;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserView> {
  const { data } = await api.patch(`/v1/users/${id}`, input);
  return data as UserView;
}

export async function setPassword(id: string, password: string): Promise<{ ok: boolean }> {
  const { data } = await api.put(`/v1/users/${id}/password`, { password });
  return data as { ok: boolean };
}

/** `DELETE /v1/users/:id` (§3) — desativação (soft delete): `active = false`. */
export async function deactivateUser(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/v1/users/${id}`);
  return data as { ok: boolean };
}
