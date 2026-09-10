import axios from 'axios';
import { API_URL } from '@/modules/shared/infrastructure/http';

/**
 * Formulário público (§11 do contrato).
 *
 * Instância PRÓPRIA do axios, sem o interceptor de sessão: a página
 * `/formulario/[pracaId]` roda fora da guarda, em anúncio e landing page, e
 * mandar o `Authorization` de quem por acaso estivesse logado no mesmo
 * navegador seria vazar a sessão do time para uma rota pública. O interceptor
 * de resposta também precisa ficar de fora — um 401 aqui não pode apagar a
 * sessão de quem está com o painel aberto em outra aba.
 */
const publicApi = axios.create({ baseURL: API_URL });

export interface PublicPracaView {
  id: string;
  name: string;
  city: string;
}

export interface PublicLeadInput {
  praca_id: string;
  name: string;
  city: string;
  phone: string;
  decisor?: string;
  /** `"0" | "2" | "5" | "10"` — vira `form_answer` no servidor. */
  freq?: string;
  origem: 'pago' | 'organico';
  camp?: string;
}

export async function getPublicPraca(id: string): Promise<PublicPracaView> {
  const { data } = await publicApi.get(`/v1/public/pracas/${id}`);
  return data as PublicPracaView;
}

/** `duplicate` = o telefone já estava na praça; o contato virou nota no lead existente. */
export async function postPublicLead(
  input: PublicLeadInput,
): Promise<{ ok: boolean; duplicate?: boolean }> {
  const { data } = await publicApi.post('/v1/public/leads', input);
  return data as { ok: boolean; duplicate?: boolean };
}
