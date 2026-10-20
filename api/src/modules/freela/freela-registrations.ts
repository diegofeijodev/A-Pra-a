/**
 * Contrato do Freela para o cadastro assistido (`/v1/admins/consultants/:id/registrations`, §26).
 * Só os schemas zod e os tipos; a chamada está em `FreelaClient`. A resposta de criação e a de
 * reemissão carregam o `setupLink` (credencial de uso único): estes schemas NUNCA ecoam o corpo
 * em mensagem de erro.
 */
import { z } from 'zod';

export interface CorpoCadastroFreela {
  clientId: string;
  persona: 'contractor';
  accessMode: 'setup_link';
  companyName: string;
  corporateReason?: string;
  contactName: string;
  phone: string;
  email?: string;
  cnpj?: string;
  address: Record<string, string>;
  lat?: number;
  lng?: number;
  cityId?: string;
}

const data = z.string().min(1);

export const cadastroCriadoSchema = z.object({
  userId: z.string().min(1),
  contractorId: z.string().min(1),
  created: z.boolean(),
  accessMode: z.string(),
  setupLink: z.string().url().nullable(),
  setupLinkExpiresAt: data.nullable().optional(),
  activatedAt: data.nullable().optional(),
});
export type CadastroCriado = z.infer<typeof cadastroCriadoSchema>;

export const linkReemitidoSchema = z.object({
  userId: z.string().min(1),
  setupLink: z.string().url(),
  setupLinkExpiresAt: data,
});
export type LinkReemitido = z.infer<typeof linkReemitidoSchema>;

export const cadastroListadoSchema = z.object({
  userId: z.string().min(1),
  contractorId: z.string().nullable().optional(),
  persona: z.string().optional(),
  companyName: z.string(),
  cnpj: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  accessMode: z.string().nullable().optional(),
  createdAt: data,
  activatedAt: data.nullable().optional(),
  firstVacancyAt: data.nullable().optional(),
  firstJobCompletedAt: data.nullable().optional(),
  status: z.enum(['pending', 'activated']),
});
export type CadastroListado = z.infer<typeof cadastroListadoSchema>;

export const listaCadastrosSchema = z.object({
  data: z.array(cadastroListadoSchema),
  nextCursor: z.string().nullable(),
});

export interface FiltroListaCadastros {
  since?: string;
  until?: string;
  source?: string;
  status?: 'pending' | 'activated';
  cursor?: string;
  limit?: number;
}
