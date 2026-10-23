/** Lote E, L9a (contrato §41.2): a regra vale só para senha NOVA, só com a flag; login e senha atual nunca. */
import { ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../../common/database/prisma.service';
import { LOVABLE_E_DESLIGADAS } from '../../../common/flags/lovable-e.flags';
import { CampoAuthService } from '../../campo/campo-auth.service';
import { ChangePasswordDto } from '../../campo/dto/campo.dto';
import type { AuthService } from '../../auth/auth.service';
import { CreateUserDto, SetPasswordDto } from '../../users/dto/users.dto';
import { UsersService } from '../../users/users.service';
import { PasswordPolicyService, type PoliticaView } from '../password-policy.service';
import { PutPasswordPolicyDto } from '../password-policy.controller';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const ligada = { ...LOVABLE_E_DESLIGADAS, password_policy: true };

function fakePrisma(politica: unknown = null) {
  return {
    app_settings: { findUnique: jest.fn().mockResolvedValue({ password_policy: politica }), upsert: jest.fn().mockResolvedValue({}) },
    users: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u1', ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    field_consultants: { findUnique: jest.fn(), update: jest.fn() },
  };
}
const erro = (f: () => Promise<unknown>) => f().then(() => null, (e: { status: number; response: { code: string; message: string } }) => e);

describe('PasswordPolicyService', () => {
  it('desligada: leitura enabled false sem tocar o banco; PUT 404; exigir não faz nada', async () => {
    const p = fakePrisma();
    const s = new PasswordPolicyService(p as unknown as PrismaService, LOVABLE_E_DESLIGADAS);
    expect(await s.view()).toEqual({ enabled: false });
    expect(p.app_settings.findUnique).not.toHaveBeenCalled();
    await expect(s.salvar({ min_length: 10 })).rejects.toMatchObject({ status: 404, response: { code: 'PASSWORD_POLICY_DISABLED' } });
    await expect(s.exigir('abc')).resolves.toBeUndefined();
    // Sem o provedor (módulos antigos): o mesmo que desligada.
    expect(await new PasswordPolicyService(p as unknown as PrismaService).view()).toEqual({ enabled: false });
  });
  it('ligada sem nada gravado: a da Lovable, com as regras na ordem da tela', async () => {
    const s = new PasswordPolicyService(fakePrisma() as unknown as PrismaService, ligada);
    expect(await s.view()).toEqual({
      enabled: true,
      min_length: 8,
      max_length: 72,
      require_upper: true,
      require_digit: true,
      is_default: true,
      rules: [
        { key: 'min_length', label: '8 caracteres ou mais' },
        { key: 'upper', label: 'Uma letra maiúscula' },
        { key: 'digit', label: 'Um número' },
      ],
    } satisfies PoliticaView);
  });
  it('exigir: 400 WEAK_PASSWORD com o que falta e sem a senha', async () => {
    const s = new PasswordPolicyService(fakePrisma() as unknown as PrismaService, ligada);
    const e = await erro(() => s.exigir('segredo1'));
    expect(e).toMatchObject({ status: 400, response: { code: 'WEAK_PASSWORD', message: 'A senha precisa de: 1 letra maiúscula.' } });
    expect(JSON.stringify(e)).not.toContain('segredo1');
    await expect(s.exigir('Segredo12')).resolves.toBeUndefined();
  });
  it('PUT parcial (null = ausente) grava a política inteira; fora da faixa = 400', async () => {
    const p = fakePrisma();
    const s = new PasswordPolicyService(p as unknown as PrismaService, ligada);
    const dto = (await pipe.transform({ min_length: 10, require_upper: null }, { type: 'body', metatype: PutPasswordPolicyDto })) as PutPasswordPolicyDto;
    await s.salvar(dto);
    expect(p.app_settings.upsert.mock.calls[0][0].update).toEqual({ password_policy: { min_length: 10, require_upper: true, require_digit: true } });
    await expect(s.salvar({ min_length: 30 })).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
  });
});

describe('onde vale (só senha NOVA)', () => {
  const authFake = { toUserView: (u: unknown) => u } as unknown as AuthService;
  it('POST /v1/users e PUT /v1/users/:id/password: com a flag, a senha fraca é recusada sem gravar; sem a flag, a de 6 passa como hoje', async () => {
    const p = fakePrisma();
    const on = new UsersService(p as unknown as PrismaService, authFake, new PasswordPolicyService(p as unknown as PrismaService, ligada));
    const fraca = (await pipe.transform({ email: 'n@x.com', password: 'abcdef', name: 'N' }, { type: 'body', metatype: CreateUserDto })) as CreateUserDto;
    await expect(on.create(fraca)).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD' } });
    expect(p.users.create).not.toHaveBeenCalled();
    p.users.findUnique.mockResolvedValue({ id: '00000000-0000-4000-8000-0000000000u1', is_admin: false, active: true });
    const admin = { id: 'a', email: 'a@a', name: 'A', is_admin: true };
    const set = (await pipe.transform({ password: 'abcdef' }, { type: 'body', metatype: SetPasswordDto })) as SetPasswordDto;
    await expect(on.setPassword('00000000-0000-4000-8000-00000000000a', set, admin)).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD' } });
    expect(p.users.update).not.toHaveBeenCalled();

    const p2 = fakePrisma();
    const off = new UsersService(p2 as unknown as PrismaService, authFake, new PasswordPolicyService(p2 as unknown as PrismaService, LOVABLE_E_DESLIGADAS));
    await expect(off.create(fraca)).resolves.toBeDefined();
    expect(p2.app_settings.findUnique).not.toHaveBeenCalled();
  });
  it('troca do consultor: a regra olha só a NOVA; a atual de 6 caracteres continua aceita', async () => {
    const p = fakePrisma();
    p.field_consultants.findUnique.mockResolvedValue({ id: 'c1', password_hash: await bcrypt.hash('abcdef', 4) });
    const s = new CampoAuthService(p as unknown as PrismaService, { signAsync: jest.fn() } as unknown as JwtService, new PasswordPolicyService(p as unknown as PrismaService, ligada));
    const dto = (await pipe.transform({ current_password: 'abcdef', new_password: 'novasenha1' }, { type: 'body', metatype: ChangePasswordDto })) as ChangePasswordDto;
    await expect(s.changePassword('c1', dto)).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD', message: 'A senha precisa de: 1 letra maiúscula.' } });
    expect(p.field_consultants.update).not.toHaveBeenCalled();
  });
});
