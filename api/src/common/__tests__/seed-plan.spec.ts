import { planoDoSeed, SEED_USER_IDS, SENHA_DEMO } from '../../../prisma/seed-plan';

const PROD = { NODE_ENV: 'production', SEED_ADMIN_PASSWORD: 'senhaForte123', SEED_ADMIN_EMAIL: 'Diego@Freela.com.br' };

describe('planoDoSeed', () => {
  it('fora de produção: dados de exemplo e as três contas com a senha de demonstração', () => {
    const p = planoDoSeed({ NODE_ENV: 'development' });
    expect(p.demo).toBe(true);
    expect(p.contas.map((c) => c.user.email)).toEqual(['diego@praca.local', 'rebeca@praca.local', 'mkt@praca.local']);
    expect(p.contas.every((c) => c.senha === SENHA_DEMO)).toBe(true);
  });

  it('produção: sem dados de exemplo; admin com o e-mail e a senha do ambiente', () => {
    const p = planoDoSeed(PROD);
    expect(p.demo).toBe(false);
    const admin = p.contas.find((c) => c.user.id === SEED_USER_IDS.diego)!;
    expect(admin.user.email).toBe('diego@freela.com.br');
    expect(admin.user.is_admin).toBe(true);
    expect(admin.senha).toBe('senhaForte123');
    expect(admin.origem).toBe('SEED_ADMIN_PASSWORD');
  });

  it('produção: Rebeca e Mkt existem (as ações têm dono), mas com senha aleatória e nunca a de demonstração', () => {
    const p = planoDoSeed(PROD);
    const outras = p.contas.filter((c) => !c.user.is_admin);
    expect(outras.map((c) => c.user.id)).toEqual([SEED_USER_IDS.rebeca, SEED_USER_IDS.mkt]);
    for (const c of outras) {
      expect(c.origem).toBe('aleatoria');
      expect(c.senha).not.toBe(SENHA_DEMO);
      expect(c.senha).not.toBe(PROD.SEED_ADMIN_PASSWORD);
      expect(c.senha.length).toBeGreaterThanOrEqual(24);
    }
    expect(outras[0]!.senha).not.toBe(outras[1]!.senha);
  });

  it('produção: e-mails da Rebeca e do Mkt vêm do ambiente quando definidos', () => {
    const p = planoDoSeed({ ...PROD, SEED_REBECA_EMAIL: 'rebeca@freela.com.br', SEED_MKT_EMAIL: 'agencia@exemplo.com' });
    expect(p.contas.map((c) => c.user.email)).toEqual(['diego@freela.com.br', 'rebeca@freela.com.br', 'agencia@exemplo.com']);
  });

  it('produção: recusa sem senha forte, sem e-mail de admin, com e-mail inválido ou repetido', () => {
    expect(() => planoDoSeed({ ...PROD, SEED_ADMIN_PASSWORD: 'curta' })).toThrow(/SEED_ADMIN_PASSWORD/);
    expect(() => planoDoSeed({ ...PROD, SEED_ADMIN_EMAIL: '' })).toThrow(/SEED_ADMIN_EMAIL/);
    expect(() => planoDoSeed({ ...PROD, SEED_ADMIN_EMAIL: 'diego' })).toThrow(/SEED_ADMIN_EMAIL/);
    expect(() => planoDoSeed({ ...PROD, SEED_REBECA_EMAIL: 'nao-e-email' })).toThrow(/SEED_REBECA_EMAIL/);
    expect(() => planoDoSeed({ ...PROD, SEED_MKT_EMAIL: 'diego@freela.com.br' })).toThrow(/diferentes/);
  });
});
