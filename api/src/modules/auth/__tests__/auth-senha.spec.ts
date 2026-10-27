/**
 * Redesenho de 26/10, E3 (contrato §2): a entrada única tenta a equipe e, só num 401, o consultor — por isso o login da equipe ganha
 * teto por IP e o mesmo tempo de resposta para e-mail inexistente; e a equipe troca a PRÓPRIA senha pedindo a atual
 * (`POST /v1/auth/change-password`).
 */
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { HASH_FALSO } from '../../../common/auth/senha-falsa';
import type { PrismaService } from '../../../common/database/prisma.service';
import { PERMISSAO_KEY } from '../../../common/decorators/admin-only.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { LOVABLE_E_DESLIGADAS } from '../../../common/flags/lovable-e.flags';
import { CampoAuthService } from '../../campo/campo-auth.service';
import { CampoAuthController } from '../../campo/campo-auth.controller';
import { PasswordPolicyService } from '../../password-policy/password-policy.service';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { ChangeOwnPasswordDto } from '../dto/auth.dto';

// O `import * as` do TS lê a função do módulo na hora da chamada: espionar o objeto do `require` alcança os serviços.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcryptModulo = require('bcryptjs') as typeof bcrypt;

const DIEGO = '33333333-3333-4333-8333-333333333333';
const HASH = bcrypt.hashSync('praca123', 4);
const LINHA = {
  id: DIEGO,
  email: 'diego@praca.local',
  name: 'Diego',
  role_label: '',
  color: '#ECA826',
  phone: '',
  is_admin: true,
  is_gestor: false,
  active: true,
  theme: 'dark',
  active_praca_id: null,
  sort: 0,
  password_hash: HASH,
};

function fakePrisma(linha: typeof LINHA | null = LINHA, politica: unknown = null) {
  return {
    users: {
      findUnique: jest.fn().mockResolvedValue(linha),
      update: jest.fn().mockResolvedValue({}),
    },
    field_consultants: { findUnique: jest.fn().mockResolvedValue(null) },
    app_settings: { findUnique: jest.fn().mockResolvedValue({ password_policy: politica }) },
  };
}

const jwt = new JwtService({ secret: 'segredo-de-teste-com-mais-de-16' });
const montar = (p: ReturnType<typeof fakePrisma>, regra: 'ligada' | 'desligada' | 'sem' = 'sem') => {
  const flags = { ...LOVABLE_E_DESLIGADAS, password_policy: regra === 'ligada' };
  const senhas =
    regra === 'sem' ? undefined : new PasswordPolicyService(p as unknown as PrismaService, flags);
  return new AuthService(p as unknown as PrismaService, jwt, LOVABLE_E_DESLIGADAS, senhas);
};
const erro = (f: () => Promise<unknown>) =>
  f().then(
    () => null,
    (e: { status: number; response: { code: string; message: string } }) => e,
  );
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const validar = (body: unknown) => pipe.transform(body, { type: 'body', metatype: ChangeOwnPasswordDto });

afterEach(() => jest.restoreAllMocks());

describe('POST /v1/auth/login: teto por IP e tempo igual para e-mail inexistente', () => {
  it('o login da equipe tem o dobro do teto do consultor (40 x 20 por minuto): a entrada única passa por ele antes do campo', () => {
    const login = AuthController.prototype.login as unknown as object;
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', login)).toBe(40);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', login)).toBe(60_000);
    const doCampo = CampoAuthController.prototype.login as unknown as object;
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', doCampo)).toBe(20);
  });

  it('a troca da própria senha tem teto próprio de 10 por minuto, na equipe e no campo', () => {
    for (const rota of [AuthController.prototype.changePassword, CampoAuthController.prototype.changePassword]) {
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', rota as unknown as object)).toBe(10);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', rota as unknown as object)).toBe(60_000);
    }
  });

  it('o hash fixo tem o MESMO custo dos hashes de verdade (10), senão o tempo ainda denunciaria o e-mail', () => {
    expect(bcrypt.getRounds(HASH_FALSO)).toBe(10);
  });

  it('equipe: e-mail inexistente compara a senha com o hash fixo e responde INVALID_CREDENTIALS', async () => {
    const compare = jest.spyOn(bcryptModulo, 'compare');
    const e = await erro(() => montar(fakePrisma(null)).login('ninguem@praca.local', 'qualquer1'));
    expect(e).toMatchObject({
      status: 401,
      response: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos' },
    });
    expect(compare).toHaveBeenCalledWith('qualquer1', HASH_FALSO);
  });

  it('equipe: senha errada (conta existe) responde igual, comparando com o hash da conta', async () => {
    const compare = jest.spyOn(bcryptModulo, 'compare');
    const e = await erro(() => montar(fakePrisma()).login('diego@praca.local', 'errada12'));
    expect(e).toMatchObject({
      status: 401,
      response: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos' },
    });
    expect(compare).toHaveBeenCalledWith('errada12', HASH);
  });

  it('equipe: o login certo e a conta desativada continuam como antes', async () => {
    const r = await montar(fakePrisma()).login(' Diego@Praca.local ', 'praca123');
    expect(r.user).toMatchObject({ id: DIEGO, email: 'diego@praca.local' });
    expect(r.user).not.toHaveProperty('password_hash');
    expect(
      await erro(() =>
        montar(fakePrisma({ ...LINHA, active: false })).login('diego@praca.local', 'praca123'),
      ),
    ).toMatchObject({
      status: 401,
      response: { code: 'UNAUTHORIZED', message: 'Conta desativada' },
    });
  });

  it('consultor: e-mail inexistente também compara com o hash fixo', async () => {
    const compare = jest.spyOn(bcryptModulo, 'compare');
    const p = fakePrisma();
    const e = await erro(() =>
      new CampoAuthService(p as unknown as PrismaService, jwt).login('ninguem@x.com', 'qualquer1'),
    );
    expect(e).toMatchObject({ status: 401, response: { code: 'INVALID_CREDENTIALS' } });
    expect(compare).toHaveBeenCalledWith('qualquer1', HASH_FALSO);
  });
});

describe('POST /v1/auth/change-password (a própria senha, com a atual)', () => {
  it('rota da equipe com marca @Equipe() no método, não pública', () => {
    const h = AuthController.prototype.changePassword as unknown as object;
    expect(Reflect.getMetadata(PATH_METADATA, h)).toBe('change-password');
    expect(Reflect.getMetadata(METHOD_METADATA, h)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PERMISSAO_KEY, h)).toBe('equipe');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, h)).toBeUndefined();
  });

  it('o id vem do token: o controller passa o usuário logado, e `user_id` no corpo é 400 VALIDATION_ERROR (whitelist)', async () => {
    const service = { changePassword: jest.fn().mockResolvedValue({ ok: true }) };
    const dto = { current_password: 'praca123', new_password: 'NovaSenha9' } as ChangeOwnPasswordDto;
    await new AuthController(service as unknown as AuthService).changePassword({ id: DIEGO } as never, dto);
    expect(service.changePassword).toHaveBeenCalledWith(DIEGO, dto);
    await expect(validar({ ...dto, user_id: '44444444-4444-4444-8444-444444444444' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('DTO: atual 6–72 e nova 8–72', async () => {
    await expect(
      validar({ current_password: 'praca123', new_password: 'NovaSenha9' }),
    ).resolves.toBeInstanceOf(ChangeOwnPasswordDto);
    await expect(validar({ current_password: '12345', new_password: 'NovaSenha9' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(validar({ current_password: 'praca123', new_password: 'curta12' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      validar({ current_password: 'praca123', new_password: 'x'.repeat(73) }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(validar({ current_password: 'praca123' })).rejects.toMatchObject({ status: 400 });
  });

  it('senha atual errada = 400 WRONG_PASSWORD (nunca 401: o web trataria como sessão morta) e nada é gravado', async () => {
    const p = fakePrisma();
    const e = await erro(() =>
      montar(p).changePassword(DIEGO, { current_password: 'errada12', new_password: 'NovaSenha9' }),
    );
    expect(e).toMatchObject({
      status: 400,
      response: { code: 'WRONG_PASSWORD', message: 'A senha atual não confere.' },
    });
    expect(p.users.update).not.toHaveBeenCalled();
  });

  it('nova igual à atual = 400 SAME_PASSWORD', async () => {
    const p = fakePrisma();
    const e = await erro(() =>
      montar(p).changePassword(DIEGO, { current_password: 'praca123', new_password: 'praca123' }),
    );
    expect(e).toMatchObject({ status: 400, response: { code: 'SAME_PASSWORD' } });
    expect(p.users.update).not.toHaveBeenCalled();
  });

  it('regra ligada e senha fraca = 400 WEAK_PASSWORD (a atual nunca passa pela regra)', async () => {
    const p = fakePrisma();
    const e = await erro(() =>
      montar(p, 'ligada').changePassword(DIEGO, {
        current_password: 'praca123',
        new_password: 'semmaiuscula1',
      }),
    );
    expect(e).toMatchObject({ status: 400, response: { code: 'WEAK_PASSWORD' } });
    expect(e?.response.message).toContain('1 letra maiúscula');
    expect(e?.response.message).not.toContain('semmaiuscula1');
    expect(p.users.update).not.toHaveBeenCalled();
  });

  it('regra desligada (ou sem o serviço): só os 8–72 do DTO valem', async () => {
    for (const regra of ['desligada', 'sem'] as const) {
      const p = fakePrisma();
      await expect(
        montar(p, regra).changePassword(DIEGO, {
          current_password: 'praca123',
          new_password: 'semmaiuscula1',
        }),
      ).resolves.toEqual({ ok: true });
      expect(p.users.update).toHaveBeenCalledTimes(1);
    }
  });

  it('sucesso: grava o hash novo SÓ na conta do token e responde { ok: true }', async () => {
    const p = fakePrisma();
    const r = await montar(p, 'ligada').changePassword(DIEGO, {
      current_password: 'praca123',
      new_password: 'NovaSenha9',
    });
    expect(r).toEqual({ ok: true });
    expect(p.users.findUnique).toHaveBeenCalledWith({ where: { id: DIEGO } });
    const arg = p.users.update.mock.calls[0]![0] as { where: { id: string }; data: Record<string, unknown> };
    expect(arg.where).toEqual({ id: DIEGO });
    expect(Object.keys(arg.data)).toEqual(['password_hash']);
    expect(await bcrypt.compare('NovaSenha9', arg.data.password_hash as string)).toBe(true);
    expect(bcrypt.getRounds(arg.data.password_hash as string)).toBe(10);
  });

  it('conta que sumiu entre o token e a troca = 401 UNAUTHORIZED (como o /me)', async () => {
    const e = await erro(() =>
      montar(fakePrisma(null)).changePassword(DIEGO, {
        current_password: 'praca123',
        new_password: 'NovaSenha9',
      }),
    );
    expect(e).toMatchObject({ status: 401, response: { code: 'UNAUTHORIZED' } });
  });
});
