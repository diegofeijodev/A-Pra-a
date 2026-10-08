import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3014),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGINS: z.string().default(''),
  PUBLIC_URL: z.string().default('http://localhost:3014'),
  APP_URL: z.string().default('http://localhost:3024'),

  // Teto do formulário público por minuto e por IP (é o único ponto que a
  // internet escreve sem login). Produção fica em 10; em desenvolvimento vale
  // afrouxar para o smoke rodar duas vezes seguidas.
  PUBLIC_LEADS_PER_MINUTE: z.coerce.number().int().min(1).default(10),

  // Integração com o Freela (api-freela). Sem as três, /v1/freela/* responde 503.
  FREELA_API_URL: z.string().default(''),
  FREELA_ADMIN_EMAIL: z.string().default(''),
  FREELA_ADMIN_PASSWORD: z.string().default(''),
  // Só ligue depois de o api-freela de produção aceitar contacts[].message.
  FREELA_PER_CONTACT_MESSAGE: z.string().default('false'),
  CADENCE_ENGINE_ENABLED: z.string().default('true'),
  FREELA_SYNC_ENABLED: z.string().default('true'),
  // Consultores de campo (spec 2026-10-08). O consultor não deve precisar logar
  // todo dia na rua: token próprio, mais longo que o da equipe.
  CAMPO_JWT_EXPIRES_IN: z.string().default('7d'),
  // Endereço público do Freela web — base do link do QR (`/cadastro?consultor=`).
  FREELA_WEB_URL: z.string().default(''),

  SWAGGER_ENABLED: z.string().optional(),

  /**
   * `true` faz o Fastify confiar em `X-Forwarded-For` — é o que faz `req.ip`
   * (o tracker do throttle) ser o IP de quem pediu, e não o do proxy.
   *
   * Fica em `false` por padrão de propósito: confiar no cabeçalho sem proxy na
   * frente deixaria qualquer um forjar o próprio IP e furar o teto do
   * formulário público. Atrás de nginx (como todo o workspace é publicado)
   * ligue — senão o mundo inteiro divide um balde só, que é a forma do
   * incidente `throttler-global-bucket-429-outage` do api-freela.
   */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Configuração de ambiente inválida: ${parsed.error.message}`);
  }
  return parsed.data;
}
