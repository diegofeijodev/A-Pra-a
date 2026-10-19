import { validateEnv } from '../config/env.validation';

const BASE = { DATABASE_URL: 'postgresql://praca:praca@localhost:5437/praca', JWT_SECRET: 'x'.repeat(16) };

describe('env — pesquisa de estabelecimentos', () => {
  it('padrões: Overpass público, Apify desligado e sem token, tetos 300/3000', () => {
    const e = validateEnv(BASE);
    expect(e.OVERPASS_URL).toBe('https://overpass-api.de/api/interpreter');
    expect(e.PLACES_USER_AGENT).toMatch(/^praca-freela\/1\.0/);
    expect(e.APIFY_ENABLED).toBe('false');
    expect(e.APIFY_TOKEN).toBe('');
    expect(e.APIFY_ACTOR_ID).toBe('compass~crawler-google-places');
    expect(e.APIFY_MAX_PLACES_PER_RUN).toBe(300);
    expect(e.APIFY_MONTHLY_PLACES_CAP).toBe(3000);
  });
  it('vazio (compose com ${VAR:-}) conta como ausente', () => {
    const e = validateEnv({ ...BASE, OVERPASS_URL: '', PLACES_USER_AGENT: '', APIFY_ACTOR_ID: '', APIFY_MAX_PLACES_PER_RUN: '', APIFY_MONTHLY_PLACES_CAP: '' });
    expect(e.OVERPASS_URL).toBe('https://overpass-api.de/api/interpreter');
    expect(e.APIFY_MAX_PLACES_PER_RUN).toBe(300);
    expect(e.APIFY_MONTHLY_PLACES_CAP).toBe(3000);
  });
  it('valores inválidos derrubam a largada', () => {
    expect(() => validateEnv({ ...BASE, OVERPASS_URL: 'nao-e-url' })).toThrow('Configuração de ambiente inválida');
    expect(() => validateEnv({ ...BASE, APIFY_MAX_PLACES_PER_RUN: '0' })).toThrow('Configuração de ambiente inválida');
  });
});

describe('env — roteiro do dia', () => {
  it('desligado por padrão e aceita true', () => {
    expect(validateEnv(BASE).FIELD_ROUTES_ENABLED).toBe('false');
    expect(validateEnv({ ...BASE, FIELD_ROUTES_ENABLED: 'true' }).FIELD_ROUTES_ENABLED).toBe('true');
  });
});
