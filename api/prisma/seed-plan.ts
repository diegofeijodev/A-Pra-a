/**
 * O que o seed cria, conforme o ambiente — regra pura (sem banco), testada em
 * `src/common/__tests__/seed-plan.spec.ts`.
 *
 * - **Desenvolvimento** (`NODE_ENV` ≠ production): as três contas com a senha de
 *   demonstração e TODOS os dados de exemplo (praça com progresso na etapa 2,
 *   leads e mídia) — é o que o smoke e o browser-check esperam.
 * - **Produção**: a praça real "Belo Horizonte + Contagem" com o roteiro inteiro,
 *   sem leads, sem mídia e sem progresso inventado. As três pessoas existem
 *   (as ações do roteiro têm dono), mas só o admin entra: e-mail e senha vêm de
 *   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`; Rebeca e Mkt externo nascem com
 *   senha aleatória que ninguém conhece — o admin define a senha delas em
 *   Configurações → Pessoas quando forem usar. E-mails delas: `SEED_REBECA_EMAIL`
 *   e `SEED_MKT_EMAIL` (opcionais; sem eles, o e-mail de demonstração).
 */
import { randomBytes } from 'node:crypto';

/** Senha das contas em desenvolvimento. Nunca usada em produção. */
export const SENHA_DEMO = 'praca123';

/** Senha mínima do admin em produção — a mesma do `SetPasswordDto`. */
export const MIN_SENHA = 8;

export const SEED_USER_IDS = {
  diego: '00000000-0000-4000-8000-000000000001',
  rebeca: '00000000-0000-4000-8000-000000000002',
  mkt: '00000000-0000-4000-8000-000000000003',
} as const;

export interface SeedUser {
  id: string;
  email: string;
  name: string;
  role_label: string;
  color: string;
  is_admin: boolean;
  sort: number;
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    id: SEED_USER_IDS.diego,
    email: 'diego@praca.local',
    name: 'Diego',
    role_label: 'CEO — visitas às casas grandes, decisões, aprovação de verba',
    color: '#ECA826',
    is_admin: true,
    sort: 0,
  },
  {
    id: SEED_USER_IDS.rebeca,
    email: 'rebeca@praca.local',
    name: 'Rebeca',
    role_label: 'Comercial e Sucesso do Cliente — prospecção, operação das vagas, retenção',
    color: '#2E6F7E',
    is_admin: false,
    sort: 1,
  },
  {
    id: SEED_USER_IDS.mkt,
    email: 'mkt@praca.local',
    name: 'Mkt externo',
    role_label: 'Agência — disparos, edição de vídeo, peças e tráfego pago',
    color: '#6B5B8A',
    is_admin: false,
    sort: 2,
  },
];

export interface ContaDoSeed {
  user: SeedUser;
  senha: string;
  /** Como a senha foi escolhida — só para o log do seed (nunca a senha em si). */
  origem: 'demo' | 'SEED_ADMIN_PASSWORD' | 'aleatoria';
}

export interface PlanoDoSeed {
  /** `true` = dados de exemplo (leads, mídia, progresso na etapa 2). */
  demo: boolean;
  contas: ContaDoSeed[];
}

type Env = Record<string, string | undefined>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailOpcional(env: Env, nome: string, padrao: string): string {
  const v = (env[nome] ?? '').trim().toLowerCase();
  if (!v) return padrao;
  if (!EMAIL_RE.test(v)) throw new Error(`${nome} não parece um e-mail: "${v}".`);
  return v;
}

export function planoDoSeed(env: Env = process.env): PlanoDoSeed {
  if (env.NODE_ENV !== 'production') {
    return { demo: true, contas: SEED_USERS.map((user) => ({ user, senha: SENHA_DEMO, origem: 'demo' })) };
  }
  const senha = (env.SEED_ADMIN_PASSWORD ?? '').trim();
  if (senha.length < MIN_SENHA) {
    throw new Error(
      `NODE_ENV=production: defina SEED_ADMIN_PASSWORD (mínimo ${MIN_SENHA} caracteres) antes de rodar o seed. ` +
        'Sem ela, a API subiria com a senha de demonstração pública.',
    );
  }
  const adminEmail = (env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(adminEmail)) {
    throw new Error('NODE_ENV=production: defina SEED_ADMIN_EMAIL (o e-mail real do admin) antes de rodar o seed.');
  }
  const emails: Record<string, string> = {
    [SEED_USER_IDS.diego]: adminEmail,
    [SEED_USER_IDS.rebeca]: emailOpcional(env, 'SEED_REBECA_EMAIL', 'rebeca@praca.local'),
    [SEED_USER_IDS.mkt]: emailOpcional(env, 'SEED_MKT_EMAIL', 'mkt@praca.local'),
  };
  if (new Set(Object.values(emails)).size !== 3) throw new Error('Os e-mails do seed precisam ser diferentes entre si.');
  return {
    demo: false,
    contas: SEED_USERS.map((u) => {
      const user = { ...u, email: emails[u.id]! };
      return u.is_admin
        ? { user, senha, origem: 'SEED_ADMIN_PASSWORD' as const }
        : { user, senha: randomBytes(24).toString('base64url'), origem: 'aleatoria' as const };
    }),
  };
}
