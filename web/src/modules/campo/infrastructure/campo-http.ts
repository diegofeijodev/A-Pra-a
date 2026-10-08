import axios from 'axios';
import { API_URL } from '@/modules/shared/infrastructure/http';
import { clearCampoSession, getCampoSession } from './campo-session.storage';

/**
 * Axios do CONSULTOR — separado do `api` da equipe: outro token (`campoSession`),
 * outra tela de entrada (`/campo/entrar`). O token é lido NA HORA de cada envio
 * (a fila offline nunca guarda token: depois de entrar de novo, sai o novo).
 */
export const campoApi = axios.create({ baseURL: API_URL, timeout: 30_000 });

campoApi.interceptors.request.use((config) => {
  if (!config.headers.Authorization) {
    const sessao = getCampoSession();
    if (sessao?.access_token) config.headers.Authorization = `Bearer ${sessao.access_token}`;
  }
  return config;
});

/**
 * 401 = sessão morta (expirou em 7 dias, senha trocada, conta desativada).
 * Limpa SÓ a sessão — a fila continua no IndexedDB até o próximo login — e
 * recarrega na entrada (mesmo motivo do `http.ts` da equipe: o zustand não
 * relê o storage sozinho).
 */
let redirecionando = false;
campoApi.interceptors.response.use(undefined, (error) => {
  if (error?.response?.status === 401 && typeof window !== 'undefined') {
    const url = String(error.config?.url ?? '');
    if (!url.includes('/auth/login')) {
      clearCampoSession();
      if (!window.location.pathname.startsWith('/campo/entrar') && !redirecionando) {
        redirecionando = true;
        window.location.replace('/campo/entrar');
      }
    }
  }
  return Promise.reject(error);
});
