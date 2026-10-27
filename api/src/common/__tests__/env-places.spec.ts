import { validateEnv } from '../config/env.validation';
import { lerFlagsLovableD, velocidadeCarroKmh } from '../../modules/rotas/rotas.tokens';
import { lerFlagsLovableE } from '../flags/lovable-e.flags';
import { lerMultiPraca } from '../flags/multi-praca.flags';
import { lerFlagsUi } from '../flags/ui.flags';
import { earningsOpcoesProvider } from '../../modules/campo/earnings/earnings.tokens';

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

describe('env — ganho por cadastro declarado (modo do chefe S3, §32.5)', () => {
  it('desligado por padrão e aceita true', () => {
    expect(validateEnv(BASE).FIELD_DECLARED_SIGNUPS_ENABLED).toBe('false');
    expect(validateEnv({ ...BASE, FIELD_DECLARED_SIGNUPS_ENABLED: 'true' }).FIELD_DECLARED_SIGNUPS_ENABLED).toBe('true');
  });
});

describe('env — restante da Lovable, lote B (§35/§37)', () => {
  it('checklist e intervalo: desligados por padrão e aceitam true', () => {
    for (const k of ['FIELD_CHECKLIST_ENABLED', 'FIELD_BREAKS_ENABLED'] as const) {
      expect(validateEnv(BASE)[k]).toBe('false');
      expect(validateEnv({ ...BASE, [k]: 'true' })[k]).toBe('true');
    }
  });
});

describe('env — restante da Lovable, lote C (§36/§38)', () => {
  it('segmentos, pedidos de cupom e cupom no Freela: desligados por padrão e aceitam true', () => {
    for (const k of ['FIELD_SEGMENTS_ENABLED', 'FIELD_VOUCHERS_ENABLED', 'FIELD_VOUCHER_COUPONS_ENABLED'] as const) {
      expect(validateEnv(BASE)[k]).toBe('false');
      expect(validateEnv({ ...BASE, [k]: 'true' })[k]).toBe('true');
    }
  });
});

describe('env — restante da Lovable, lote D (§39/§40)', () => {
  it('planos de rota e shoppings: desligados por padrão e aceitam true', () => {
    for (const k of ['FIELD_ROUTE_PLANS_ENABLED', 'FIELD_MALLS_ENABLED'] as const) {
      expect(validateEnv(BASE)[k]).toBe('false');
      expect(validateEnv({ ...BASE, [k]: 'true' })[k]).toBe('true');
    }
  });
  it('planos só valem com o roteiro do dia; shoppings só com os segmentos e os planos', () => {
    const t = 'true';
    expect(lerFlagsLovableD({ ...BASE })).toEqual({ route_plans: false, malls: false });
    expect(lerFlagsLovableD({ ...BASE, FIELD_ROUTE_PLANS_ENABLED: t })).toEqual({ route_plans: false, malls: false });
    expect(lerFlagsLovableD({ ...BASE, FIELD_ROUTES_ENABLED: t, FIELD_ROUTE_PLANS_ENABLED: t })).toEqual({ route_plans: true, malls: false });
    expect(lerFlagsLovableD({ ...BASE, FIELD_ROUTES_ENABLED: t, FIELD_ROUTE_PLANS_ENABLED: t, FIELD_MALLS_ENABLED: t })).toEqual({ route_plans: true, malls: false });
    expect(
      lerFlagsLovableD({ ...BASE, FIELD_ROUTES_ENABLED: t, FIELD_ROUTE_PLANS_ENABLED: t, FIELD_SEGMENTS_ENABLED: t, FIELD_MALLS_ENABLED: t }),
    ).toEqual({ route_plans: true, malls: true });
    expect(lerFlagsLovableD({ ...BASE, FIELD_SEGMENTS_ENABLED: t, FIELD_MALLS_ENABLED: t })).toEqual({ route_plans: false, malls: false });
  });
});

describe('env — restante da Lovable, lote E (§41/§42)', () => {
  const E = ['PASSWORD_POLICY_ENABLED', 'FIELD_CONSULTANT_PROFILE_ENABLED', 'FIELD_CONTACT_EMAIL_ENABLED', 'TEAM_GESTOR_ENABLED'] as const;
  it('senha, cadastro do consultor, e-mail do contato e gestor: desligados por padrão e aceitam true', () => {
    for (const k of E) {
      expect(validateEnv(BASE)[k]).toBe('false');
      expect(validateEnv({ ...BASE, [k]: 'true' })[k]).toBe('true');
    }
    expect(lerFlagsLovableE({ ...BASE })).toEqual({ password_policy: false, consultant_profile: false, contact_email: false, team_gestor: false });
  });
  it('cada flag liga só o seu módulo', () => {
    expect(lerFlagsLovableE({ ...BASE, PASSWORD_POLICY_ENABLED: 'true' })).toEqual({ password_policy: true, consultant_profile: false, contact_email: false, team_gestor: false });
    expect(lerFlagsLovableE({ ...BASE, TEAM_GESTOR_ENABLED: 'true' })).toEqual({ password_policy: false, consultant_profile: false, contact_email: false, team_gestor: true });
    expect(lerFlagsLovableE({ ...BASE, FIELD_CONSULTANT_PROFILE_ENABLED: 'true', FIELD_CONTACT_EMAIL_ENABLED: 'true' })).toEqual({
      password_policy: false,
      consultant_profile: true,
      contact_email: true,
      team_gestor: false,
    });
  });
});

describe('env — restante da Lovable, lote A (§33/§34)', () => {
  it('painel, resumo do dia e mapa de pinos: desligados por padrão e aceitam true', () => {
    for (const k of ['FIELD_DASHBOARD_ENABLED', 'FIELD_DAY_SUMMARY_ENABLED', 'FIELD_MAP_PINS_ENABLED'] as const) {
      expect(validateEnv(BASE)[k]).toBe('false');
      expect(validateEnv({ ...BASE, [k]: 'true' })[k]).toBe('true');
    }
  });
});

describe('env — restante da Lovable, lote F1 (§43/§45)', () => {
  const F1 = ['FIELD_EARNINGS_MONTHLY_ENABLED', 'FIELD_EARNINGS_PER_CONSULTANT_ENABLED'] as const;
  const opcoes = (env: Record<string, string>) => {
    const antes = { ...process.env };
    try {
      Object.assign(process.env, BASE, env);
      return (earningsOpcoesProvider as { useFactory: () => { mensalLigado?: boolean; porConsultorLigado?: boolean } }).useFactory();
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k];
      Object.assign(process.env, antes);
    }
  };
  it('bônus mensal e regra por consultor: desligados por padrão e aceitam true', () => {
    for (const k of F1) {
      expect(validateEnv(BASE)[k]).toBe('false');
      expect(validateEnv({ ...BASE, [k]: 'true' })[k]).toBe('true');
    }
  });
  it('só valem com FIELD_EARNINGS_ENABLED; cada flag liga só o seu módulo', () => {
    const off = { FIELD_EARNINGS_ENABLED: 'false', FIELD_EARNINGS_MONTHLY_ENABLED: 'true', FIELD_EARNINGS_PER_CONSULTANT_ENABLED: 'true' };
    expect(opcoes(off)).toMatchObject({ mensalLigado: false, porConsultorLigado: false });
    expect(opcoes({ FIELD_EARNINGS_ENABLED: 'true', FIELD_EARNINGS_MONTHLY_ENABLED: 'true', FIELD_EARNINGS_PER_CONSULTANT_ENABLED: 'false' })).toMatchObject({ mensalLigado: true, porConsultorLigado: false });
    expect(opcoes({ FIELD_EARNINGS_ENABLED: 'true', FIELD_EARNINGS_MONTHLY_ENABLED: 'false', FIELD_EARNINGS_PER_CONSULTANT_ENABLED: 'true' })).toMatchObject({ mensalLigado: false, porConsultorLigado: true });
  });
});

describe('env — restante da Lovable, lote F2 (§44)', () => {
  it('consultor em várias praças: desligado por padrão e aceita true (o módulo global lê a mesma chave)', () => {
    expect(validateEnv(BASE).FIELD_MULTI_PRACA_ENABLED).toBe('false');
    expect(validateEnv({ ...BASE, FIELD_MULTI_PRACA_ENABLED: 'true' }).FIELD_MULTI_PRACA_ENABLED).toBe('true');
    expect(lerMultiPraca(BASE)).toBe(false);
    expect(lerMultiPraca({ ...BASE, FIELD_MULTI_PRACA_ENABLED: 'true' })).toBe(true);
    expect(lerMultiPraca({ ...BASE, FIELD_MULTI_PRACA_ENABLED: '' })).toBe(false);
  });
});

describe('env — casca da Lovable (§46)', () => {
  it('chave do Comercial: desligada por padrão e aceita true', () => {
    expect(validateEnv(BASE).TEAM_COMMERCIAL_ENABLED).toBe('false');
    expect(validateEnv({ ...BASE, TEAM_COMMERCIAL_ENABLED: 'true' }).TEAM_COMMERCIAL_ENABLED).toBe('true');
  });
  it('features de navegação: tudo desligado por padrão; cada flag liga só a sua', () => {
    expect(lerFlagsUi(BASE)).toEqual({ commercial: false, routes: false, earnings: false, payouts: false, declared_signups: false });
    expect(lerFlagsUi({ ...BASE, TEAM_COMMERCIAL_ENABLED: 'true' })).toEqual({ commercial: true, routes: false, earnings: false, payouts: false, declared_signups: false });
    expect(lerFlagsUi({ ...BASE, FIELD_ROUTES_ENABLED: 'true' })).toEqual({ commercial: false, routes: true, earnings: false, payouts: false, declared_signups: false });
  });
  it('Pix e cadastro declarado só valem com a remuneração ligada (a mesma conta dos módulos donos)', () => {
    const t = 'true';
    expect(lerFlagsUi({ ...BASE, FIELD_PAYOUTS_ENABLED: t, FIELD_DECLARED_SIGNUPS_ENABLED: t })).toMatchObject({ earnings: false, payouts: false, declared_signups: false });
    expect(lerFlagsUi({ ...BASE, FIELD_EARNINGS_ENABLED: t })).toMatchObject({ earnings: true, payouts: false, declared_signups: false });
    expect(lerFlagsUi({ ...BASE, FIELD_EARNINGS_ENABLED: t, FIELD_PAYOUTS_ENABLED: t })).toMatchObject({ earnings: true, payouts: true, declared_signups: false });
    expect(lerFlagsUi({ ...BASE, FIELD_EARNINGS_ENABLED: t, FIELD_DECLARED_SIGNUPS_ENABLED: t })).toMatchObject({ earnings: true, payouts: false, declared_signups: true });
  });
});
