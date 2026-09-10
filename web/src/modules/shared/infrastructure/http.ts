import axios from 'axios';
import { clearStoredAuth, getStoredAuth } from '@/modules/auth/infrastructure/auth.storage';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3014';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  // Só anexa o token quando o chamador não definiu um — sobrescrever um
  // Authorization explícito já causou "login com o nome da conta anterior" no
  // app do Freela.
  if (!config.headers.Authorization) {
    const auth = getStoredAuth();
    if (auth?.access_token) config.headers.Authorization = `Bearer ${auth.access_token}`;
  }
  return config;
});

api.interceptors.response.use(undefined, (error) => {
  if (error?.response?.status === 401 && typeof window !== 'undefined') {
    const url = String(error.config?.url ?? '');
    if (!url.includes('/auth/login')) clearStoredAuth();
  }
  return Promise.reject(error);
});

/**
 * A mensagem real da API vive em `error.response.data.error.message`.
 * NUNCA achate para `error.message` — isso já custou um dia de diagnóstico no
 * freela-web-v2.
 */
export function apiErrorMessage(error: unknown, fallback = 'Erro inesperado'): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error?.message;
    if (typeof message === 'string' && message.length > 0) return message;
    if (error.code === 'ERR_NETWORK') return 'Sem conexão com o servidor';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function apiErrorCode(error: unknown): string | null {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.error?.code;
    if (typeof code === 'string') return code;
  }
  return null;
}
