/**
 * Lote E, L10 (contrato §42.3, §42.5) — MATRIZ de permissões gerada da tabela do item 12 da arquitetura. Para cada linha, o
 * `JwtAuthGuard` de verdade (com o `Reflector` e as marcas reais dos controllers) decide para: admin, gestor (flag ligada),
 * gestor com a flag DESLIGADA (403 como hoje, mesma mensagem), equipe e token de campo (401). O conjunto de rotas
 * `@GestorOuAdmin()` tem de ser EXATAMENTE o da tabela: rota nova de gestor exige linha nova aqui.
 */
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../database/prisma.service';
import { LOVABLE_E_DESLIGADAS } from '../flags/lovable-e.flags';
import { CAMPO_AUDIENCE, type CampoAuthGuard } from '../guards/campo-auth.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AreasController } from '../../modules/areas/areas.controller';
import { ConsultoresController } from '../../modules/campo/consultores.controller';
import { DeclaredSignupsEquipeController } from '../../modules/campo/declared/declared-signups.controller';
import { EarningsEquipeController } from '../../modules/campo/earnings/earnings.controller';
import { PayoutsEquipeController } from '../../modules/campo/payouts/payouts.controller';
import { VouchersEquipeController } from '../../modules/campo/vouchers/vouchers.controller';
import { LeadsController } from '../../modules/leads/leads.controller';
import { PasswordPolicyController } from '../../modules/password-policy/password-policy.controller';
import { PlacesController } from '../../modules/places/places.controller';
import { ShoppingsController } from '../../modules/places/shoppings.controller';
import { PracasController } from '../../modules/pracas/pracas.controller';
import { PlanosController } from '../../modules/rotas/planos/planos.controller';
import { RotasConfigController, RotasEquipeController } from '../../modules/rotas/rotas-equipe.controller';
import { UsersController } from '../../modules/users/users.controller';
import { rotasDoApp } from './rotas-do-app';

type Classe = { name: string; prototype: object };
type Linha = [rota: string, controller: Classe, handlers: string[], quem: 'gestor' | 'admin'];

/** A tabela do item 12 (arquitetura) = contrato §42.3, linha por linha. */
const TABELA: Linha[] = [
  ['POST /v1/consultores', ConsultoresController, ['create'], 'gestor'],
  ['PATCH /v1/consultores/:id (Pix, modo e banco = 403 FORBIDDEN_FIELD no serviço)', ConsultoresController, ['update'], 'gestor'],
  ['POST /v1/consultores/:id/reset-password (só consultor)', ConsultoresController, ['resetPassword'], 'gestor'],
  ['POST /v1/consultores/:id/freela-sync', ConsultoresController, ['freelaSync'], 'gestor'],
  ['DELETE /v1/consultores/:id', ConsultoresController, ['remove'], 'admin'],
  ['POST/PATCH /v1/areas', AreasController, ['create', 'update'], 'gestor'],
  ['POST /v1/routes, PUT …/order, POST …/reoptimize', RotasEquipeController, ['build', 'order', 'reoptimize'], 'gestor'],
  ['/v1/route-plans/* (escritas)', PlanosController, ['criar', 'atribuir', 'arquivar'], 'gestor'],
  ['PUT /v1/route-plans/config', PlanosController, ['salvarConfig'], 'admin'],
  ['PATCH /v1/consultores/shoppings/:lead_id', ShoppingsController, ['marcar'], 'gestor'],
  ['PUT /v1/consultores/shoppings/config', ShoppingsController, ['salvarConfig'], 'admin'],
  ['/v1/place-searches/* (só source=osm, no serviço)', PlacesController, ['start', 'sources', 'segmentos', 'list', 'get', 'candidates', 'cancel', 'addLeads'], 'gestor'],
  ['PUT /v1/place-searches/segments', PlacesController, ['salvarSegmentos'], 'admin'],
  ['PUT settings/config', RotasConfigController, ['put'], 'admin'],
  ['PUT settings/channels', ConsultoresController, ['setChannels'], 'admin'],
  ['PUT /v1/password-policy', PasswordPolicyController, ['put'], 'admin'],
  ['earnings (escritas)', EarningsEquipeController, ['salvarConfig', 'fechar', 'reconciliar', 'ajustar', 'estornar'], 'admin'],
  ['payouts (todas, inclusive pix-key e CSV)', PayoutsEquipeController, ['gerar', 'exportar', 'pagar', 'falhou', 'tentarDeNovo', 'cancelar', 'estornar', 'chavePix'], 'admin'],
  ['void de declarados', DeclaredSignupsEquipeController, ['anular'], 'admin'],
  ['vouchers: approve/reject/link/retry/deactivate (+ config e candidatos)', VouchersEquipeController, ['salvarConfig', 'aprovar', 'reprovar', 'candidatos', 'vincular', 'tentarDeNovo', 'desativar'], 'admin'],
  ['/v1/users POST/PATCH/DELETE', UsersController, ['create', 'update', 'deactivate'], 'admin'],
  ['DELETE /v1/pracas/:id', PracasController, ['remove'], 'admin'],
  ['DELETE /v1/leads/:id', LeadsController, ['remove'], 'admin'],
];

const reflector = new Reflector();
type Perfil = { is_admin: boolean; is_gestor: boolean };
const PERFIS: Record<'admin' | 'gestor' | 'equipe', Perfil> = {
  admin: { is_admin: true, is_gestor: false },
  gestor: { is_admin: false, is_gestor: true },
  equipe: { is_admin: false, is_gestor: false },
};

function guarda(perfil: Perfil, flagGestor: boolean, campo = false) {
  const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', email: 'u@x', name: 'U', ...(campo ? { aud: CAMPO_AUDIENCE } : {}) }) };
  const prisma = { users: { findUnique: jest.fn().mockResolvedValue({ active: true, ...perfil }) } };
  const g = new JwtAuthGuard(reflector, jwt as unknown as JwtService, prisma as unknown as PrismaService, {} as unknown as CampoAuthGuard, {
    ...LOVABLE_E_DESLIGADAS,
    team_gestor: flagGestor,
  });
  return { g, prisma };
}
function contexto(C: Classe, h: string) {
  const request: { headers: Record<string, string>; user?: unknown } = { headers: { authorization: 'Bearer x' } };
  const ctx = {
    getHandler: () => (C.prototype as Record<string, unknown>)[h],
    getClass: () => C,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}
async function decide(C: Classe, h: string, perfil: Perfil, flag: boolean, campo = false) {
  const { g } = guarda(perfil, flag, campo);
  const { ctx, request } = contexto(C, h);
  try {
    await g.canActivate(ctx);
    return { s: 200, user: request.user as { is_gestor?: boolean } };
  } catch (e) {
    if (e instanceof ForbiddenException) return { s: 403, msg: (e.getResponse() as { message: string }).message };
    if (e instanceof UnauthorizedException) return { s: 401 };
    throw e;
  }
}

const casos = TABELA.flatMap(([rota, C, hs, quem]) => hs.map((h) => [`${rota} — ${C.name}.${h}`, C, h, quem] as const));

describe('matriz do §42.3 (guard de verdade, marcas de verdade)', () => {
  it.each(casos)('%s', async (_n, C, h, quem) => {
    // Existe e é rota (senão a tabela está desatualizada).
    expect(typeof (C.prototype as Record<string, unknown>)[h]).toBe('function');
    expect((await decide(C, h, PERFIS.admin, true)).s).toBe(200);
    expect((await decide(C, h, PERFIS.admin, false)).s).toBe(200);
    expect(await decide(C, h, PERFIS.equipe, true)).toMatchObject({ s: 403 });
    // Flag desligada: o gestor é equipe, 403 com a MESMA mensagem de hoje.
    expect(await decide(C, h, PERFIS.gestor, false)).toEqual({ s: 403, msg: 'Só administradores podem fazer isso.' });
    expect((await decide(C, h, PERFIS.admin, true, true)).s).toBe(401);
    const g = await decide(C, h, PERFIS.gestor, true);
    if (quem === 'gestor') {
      expect(g.s).toBe(200);
      expect(g.user?.is_gestor).toBe(true);
    } else {
      expect(g).toEqual({ s: 403, msg: 'Só administradores podem fazer isso.' });
    }
  });

  it('as rotas @GestorOuAdmin() são EXATAMENTE as linhas "gestor" da tabela', () => {
    const daTabela = new Set(TABELA.filter((l) => l[3] === 'gestor').flatMap(([, C, hs]) => hs.map((h) => `${C.name}.${h}`)));
    const doApp = new Set(rotasDoApp().filter((r) => r.permissao === 'gestor').map((r) => `${r.controller.name}.${r.handler}`));
    expect([...doApp].sort()).toEqual([...daTabela].sort());
  });

  it('com a flag ligada, a equipe (não gestor) recebe a mensagem nova; rota sem marca (leitura) segue aberta a todos', async () => {
    expect(await decide(ConsultoresController, 'create', PERFIS.equipe, true)).toEqual({ s: 403, msg: 'Só administradores ou gestores podem fazer isso.' });
    for (const p of Object.values(PERFIS)) expect((await decide(ConsultoresController, 'list', p, true)).s).toBe(200);
  });

  it('o gestor é lido do BANCO a cada request (nunca do token) e só vale com a flag', async () => {
    const { g, prisma } = guarda(PERFIS.gestor, false);
    const { ctx, request } = contexto(ConsultoresController, 'list');
    await g.canActivate(ctx);
    expect(prisma.users.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: { active: true, is_admin: true, is_gestor: true } }));
    expect((request.user as { is_gestor: boolean }).is_gestor).toBe(false);
  });
});
