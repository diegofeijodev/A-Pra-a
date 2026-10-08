import type { CampoLoginResponse, CampoMeResponse } from '../domain/campo.types';
import { campoApi } from './campo-http';

export async function campoLogin(email: string, password: string): Promise<CampoLoginResponse> {
  const { data } = await campoApi.post('/v1/campo/auth/login', { email, password });
  return data as CampoLoginResponse;
}

export async function campoTrocarSenha(atual: string, nova: string): Promise<CampoLoginResponse> {
  const { data } = await campoApi.post('/v1/campo/auth/change-password', {
    current_password: atual,
    new_password: nova,
  });
  return data as CampoLoginResponse;
}

export async function campoMe(): Promise<CampoMeResponse> {
  const { data } = await campoApi.get('/v1/campo/me');
  return data as CampoMeResponse;
}
