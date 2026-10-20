import { z } from 'zod';

/** Vazio conta como ausente: o compose declara `VAR: ${VAR:-}` e o padrão sai do zod. */
const vazioComoAusente = (v: unknown) => (v === '' ? undefined : v);

const envBase = z.object({
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
  // Fotos das visitas (spec §10). Vazio conta como ausente: o compose declara
  // `PHOTO_STORAGE: ${PHOTO_STORAGE:-}` e o padrão sai do NODE_ENV abaixo.
  PHOTO_STORAGE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['s3', 'disk']).optional()),
  PHOTOS_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default(''),
  // Pasta dentro do bucket (ex.: `praca/` no bucket do Freela). Só o S3 vê o prefixo:
  // a chave guardada no banco continua `campo/...`. Vazio = raiz do bucket.
  S3_PREFIX: z.string().default(''),
  // Vazias = cadeia padrão do SDK (papel da instância). Chave dedicada: só este bucket.
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),

  // Pesquisa automática de estabelecimentos (F2, contrato §22). OSM/Overpass não
  // usa chave. Apify fica inerte sem `APIFY_ENABLED=true` E `APIFY_TOKEN`; o token
  // é segredo — o dono digita no servidor, nunca vai a código, commit ou doc.
  OVERPASS_URL: z.preprocess(vazioComoAusente, z.string().url().default('https://overpass-api.de/api/interpreter')),
  PLACES_USER_AGENT: z.preprocess(
    vazioComoAusente,
    z.string().min(8).default('praca-freela/1.0 (contato: tecnologia@freelaservicos.com.br)'),
  ),
  APIFY_ENABLED: z.string().default('false'),
  APIFY_TOKEN: z.string().default(''),
  APIFY_ACTOR_ID: z.preprocess(vazioComoAusente, z.string().min(3).default('compass~crawler-google-places')),
  APIFY_MAX_PLACES_PER_RUN: z.preprocess(vazioComoAusente, z.coerce.number().int().min(1).max(1000).default(300)),
  APIFY_MONTHLY_PLACES_CAP: z.preprocess(vazioComoAusente, z.coerce.number().int().min(0).default(3000)),

  // Roteiro do dia do consultor (F3, contrato §23). Desligado = o bloco A fica idêntico.
  FIELD_ROUTES_ENABLED: z.string().default('false'),
  // Velocidade média de carro (km/h) do modo "De carro" do roteiro (contrato §30.4). Vazio = 25.
  ROTA_VELOCIDADE_CARRO_KMH: z.preprocess(vazioComoAusente, z.coerce.number().min(5).max(80).default(25)),

  // Cadastro assistido da empresa visitada no Freela, por link de primeiro acesso (F6, contrato §26).
  FIELD_COMPANY_SIGNUP_ENABLED: z.string().default('false'),

  // Sync dos cadastros confirmados pelo Freela (F7, contrato §27). Desligado = o job não roda.
  FIELD_SIGNUP_SYNC_ENABLED: z.string().default('false'),
  FIELD_SIGNUP_SYNC_INTERVAL_MIN: z.preprocess(vazioComoAusente, z.coerce.number().int().min(1).max(120).default(10)),
  FIELD_SIGNUP_RECONCILE_DAYS: z.preprocess(vazioComoAusente, z.coerce.number().int().min(7).max(180).default(45)),

  // Remuneração do consultor (F8, contrato §28). Desligado = rotas 404 e UI oculta; os parâmetros ficam no banco (regra versionada).
  FIELD_EARNINGS_ENABLED: z.string().default('false'),
  FIELD_EARNINGS_AUTOCLOSE_ENABLED: z.string().default('false'),

  // Pagamento por Pix MANUAL (F9, contrato §29). Exige FIELD_EARNINGS_ENABLED. Sem chamada a provedor de pagamento.
  FIELD_PAYOUTS_ENABLED: z.string().default('false'),

  // Modo do chefe S1 (contrato §31). Desligado = `fluxo_visita` é ignorado e toda visita nasce `completo` (prod idêntica).
  FIELD_VISIT_FLOW_SELECT_ENABLED: z.string().default('false'),

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

/**
 * Produção grava no bucket privado; disco só com `PHOTO_STORAGE=disk` explícito
 * (o EC2 é dividido com o Freela de produção e tem pouco espaço — spec §10).
 */
const envSchema = envBase.transform((e) => ({
  ...e,
  PHOTO_STORAGE: e.PHOTO_STORAGE ?? (e.NODE_ENV === 'production' ? ('s3' as const) : ('disk' as const)),
}));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Configuração de ambiente inválida: ${parsed.error.message}`);
  }
  return parsed.data;
}
