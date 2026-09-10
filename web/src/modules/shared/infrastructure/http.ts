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

/**
 * 401 = a sessão morreu (o JWT vale 12 h, e o guard da API devolve 401 no
 * instante em que um admin desativa quem está logado).
 *
 * Limpar só o `localStorage` deixava a tela PRESA: `useAuthStore.user` continua
 * preenchido (só `hydrate()` o lê, e ele roda uma vez), o portão de
 * `(app)/layout.tsx` vê `user` e não redireciona, o interceptor de request não
 * acha token, toda consulta volta 401 — e, como os hooks de leitura não
 * toastam (convenção do projeto), a pessoa ficava olhando telas vazias sem
 * nenhum sinal até recarregar na mão.
 *
 * `location.replace` em vez de mexer no zustand daqui: o store importa
 * `auth.api`, que importa este arquivo — o import circular voltaria como
 * `undefined` em tempo de execução. Recarregando, o `hydrate` acha o storage
 * vazio e o portão faz o resto (é a regra de hidratação da Task 18).
 */
let redirecionando = false;

api.interceptors.response.use(undefined, (error) => {
  if (error?.response?.status === 401 && typeof window !== 'undefined') {
    const url = String(error.config?.url ?? '');
    if (!url.includes('/auth/login')) {
      clearStoredAuth();
      // Uma vez por página: um 401 em cinco consultas paralelas mandaria cinco
      // `replace`, e na própria tela de entrada viraria laço.
      const naEntrada = window.location.pathname.startsWith('/entrar');
      if (!naEntrada && !redirecionando) {
        redirecionando = true;
        window.location.replace('/entrar');
      }
    }
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

