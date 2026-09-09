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

  // Integração com o Freela (api-freela). Sem as três, /v1/freela/* responde 503.
  FREELA_API_URL: z.string().default(''),
  FREELA_ADMIN_EMAIL: z.string().default(''),
  FREELA_ADMIN_PASSWORD: z.string().default(''),
  // Só ligue depois de o api-freela de produção aceitar contacts[].message.
  FREELA_PER_CONTACT_MESSAGE: z.string().default('false'),
  CADENCE_ENGINE_ENABLED: z.string().default('true'),
  FREELA_SYNC_ENABLED: z.string().default('true'),

  SWAGGER_ENABLED: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Configuração de ambiente inválida: ${parsed.error.message}`);
  }
  return parsed.data;
}
