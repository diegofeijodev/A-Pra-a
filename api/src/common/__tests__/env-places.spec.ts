import { validateEnv } from '../config/env.validation';
import { velocidadeCarroKmh } from '../../modules/rotas/rotas.tokens';

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

describe('env — sync de cadastros confirmados (F7)', () => {
  it('desligado por padrão, intervalo 10 min e janela 45 dias', () => {
    const e = validateEnv(BASE);
    expect(e.FIELD_SIGNUP_SYNC_ENABLED).toBe('false');
    expect(e.FIELD_SIGNUP_SYNC_INTERVAL_MIN).toBe(10);
    expect(e.FIELD_SIGNUP_RECONCILE_DAYS).toBe(45);
  });
  it('rejeita intervalo e janela fora da faixa', () => {
    expect(() => validateEnv({ ...BASE, FIELD_SIGNUP_SYNC_INTERVAL_MIN: '0' })).toThrow('Configuração de ambiente inválida');
    expect(() => validateEnv({ ...BASE, FIELD_SIGNUP_RECONCILE_DAYS: '3' })).toThrow('Configuração de ambiente inválida');
  });
});

describe('env — velocidade de carro do roteiro (§30.4)', () => {
  it('padrão 25 km/h; vazio conta como ausente; aceita decimal', () => {
    expect(validateEnv(BASE).ROTA_VELOCIDADE_CARRO_KMH).toBe(25);
    expect(validateEnv({ ...BASE, ROTA_VELOCIDADE_CARRO_KMH: '' }).ROTA_VELOCIDADE_CARRO_KMH).toBe(25);
    expect(validateEnv({ ...BASE, ROTA_VELOCIDADE_CARRO_KMH: '32.5' }).ROTA_VELOCIDADE_CARRO_KMH).toBe(32.5);
  });
  it('fora de 5–80 derruba a largada', () => {
    expect(() => validateEnv({ ...BASE, ROTA_VELOCIDADE_CARRO_KMH: '4' })).toThrow('Configuração de ambiente inválida');
    expect(() => validateEnv({ ...BASE, ROTA_VELOCIDADE_CARRO_KMH: '120' })).toThrow('Configuração de ambiente inválida');
  });
  it('velocidadeCarroKmh() lê o ambiente e cai em 25 se vazio ou inválido', () => {
    expect(velocidadeCarroKmh({})).toBe(25);
    expect(velocidadeCarroKmh({ ROTA_VELOCIDADE_CARRO_KMH: '' })).toBe(25);
    expect(velocidadeCarroKmh({ ROTA_VELOCIDADE_CARRO_KMH: '40' })).toBe(40);
    expect(velocidadeCarroKmh({ ROTA_VELOCIDADE_CARRO_KMH: 'abc' })).toBe(25);
    expect(velocidadeCarroKmh({ ROTA_VELOCIDADE_CARRO_KMH: '200' })).toBe(25);
  });
});

describe('env — fluxo da visita (modo do chefe, §31.1)', () => {
  it('desligado por padrão e aceita true', () => {
    expect(validateEnv(BASE).FIELD_VISIT_FLOW_SELECT_ENABLED).toBe('false');
    expect(validateEnv({ ...BASE, FIELD_VISIT_FLOW_SELECT_ENABLED: 'true' }).FIELD_VISIT_FLOW_SELECT_ENABLED).toBe('true');
  });
});
