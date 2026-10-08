import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CAMPO_AUDIENCE } from '../../../common/guards/campo-auth.guard';
import { CampoAuthService } from '../campo-auth.service';

const SEGREDO = 'segredo-de-teste-com-mais-de-16';
const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const HASH = bcrypt.hashSync('provisoria1', 4);

const LINHA = {
  id: CONS,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '31999990000',
  praca_id: PRACA,
  praca: { name: 'Belo Horizonte + Contagem' },
  password_hash: HASH,
  must_change_password: true,
  token_version: 0,
  active: true,
  freela_code: null as string | null,
};

function fakePrisma(linha: typeof LINHA | null = LINHA) {
  return {
    field_consultants: {
      findUnique: jest.fn().mockResolvedValue(linha),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...LINHA,
        must_change_password: data.must_change_password ?? LINHA.must_change_password,
        token_version: LINHA.token_version + 1,
      })),
    },
    app_settings: {
      findUnique: jest.fn().mockResolvedValue({ field_channels: ['Nenhum', 'Grupos de WhatsApp'] }),
    },
  };
}

const jwt = new JwtService({ secret: SEGREDO });
const montar = (p: ReturnType<typeof fakePrisma>) => new CampoAuthService(p as unknown as PrismaService, jwt);

describe('CampoAuthService.login', () => {
  it('devolve token de campo (aud + tv) e avisa da troca obrigatória', async () => {
    const r = await montar(fakePrisma()).login(' Ana@Exemplo.com ', 'provisoria1');

    const payload = await jwt.verifyAsync(r.access_token, { audience: CAMPO_AUDIENCE });
    expect(payload).toMatchObject({ sub: CONS, tv: 0, aud: CAMPO_AUDIENCE });
    expect(r.must_change_password).toBe(true);
    expect(r.consultant).toMatchObject({ id: CONS, praca_name: 'Belo Horizonte + Contagem', freela_code: null, signup_url: null });
    expect(r.consultant).not.toHaveProperty('password_hash');
  });

  it('senha errada ou e-mail desconhecido = INVALID_CREDENTIALS', async () => {
    await expect(montar(fakePrisma()).login('ana@exemplo.com', 'errada12')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    await expect(montar(fakePrisma(null)).login('x@y.com', 'provisoria1')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('senha certa e conta desativada = UNAUTHORIZED', async () => {
    await expect(
      montar(fakePrisma({ ...LINHA, active: false })).login('ana@exemplo.com', 'provisoria1'),
    ).rejects.toMatchObject({ response: { code: 'UNAUTHORIZED', message: 'Conta desativada' } });
  });
});

describe('CampoAuthService.changePassword', () => {
  it('senha atual errada é 400 WRONG_PASSWORD (401 derrubaria a sessão no celular)', async () => {
    await expect(
      montar(fakePrisma()).changePassword(CONS, { current_password: 'errada12', new_password: 'novaSenha9' }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'WRONG_PASSWORD' } });
  });

  it('senha nova igual à atual é 400 SAME_PASSWORD', async () => {
    await expect(
      montar(fakePrisma()).changePassword(CONS, { current_password: 'provisoria1', new_password: 'provisoria1' }),
    ).rejects.toMatchObject({ response: { code: 'SAME_PASSWORD' } });
  });

  it('troca, libera o acesso, sobe token_version e devolve token novo já com a versão nova', async () => {
    const p = fakePrisma();
    const r = await montar(p).changePassword(CONS, { current_password: 'provisoria1', new_password: 'novaSenha9' });

    const data = (p.field_consultants.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ must_change_password: false, token_version: { increment: 1 } });
    expect(await bcrypt.compare('novaSenha9', data.password_hash as string)).toBe(true);
    expect(r.must_change_password).toBe(false);
    expect(await jwt.verifyAsync(r.access_token, { audience: CAMPO_AUDIENCE })).toMatchObject({ tv: 1 });
  });
});

describe('CampoAuthService.me', () => {
  const antes = process.env.FREELA_WEB_URL;
  afterEach(() => {
    if (antes === undefined) delete process.env.FREELA_WEB_URL;
    else process.env.FREELA_WEB_URL = antes;
  });

  it('monta o link do QR com FREELA_WEB_URL e o código; traz os canais', async () => {
    process.env.FREELA_WEB_URL = 'https://freela.exemplo/';
    const r = await montar(fakePrisma({ ...LINHA, freela_code: 'ANASOU7K2P' })).me(CONS);

    expect(r.consultant.signup_url).toBe('https://freela.exemplo/cadastro?consultor=ANASOU7K2P');
    expect(r.channels).toEqual(['Nenhum', 'Grupos de WhatsApp']);
  });

  it('sem FREELA_WEB_URL o link fica nulo mesmo com código', async () => {
    process.env.FREELA_WEB_URL = '';
    const r = await montar(fakePrisma({ ...LINHA, freela_code: 'ANASOU7K2P' })).me(CONS);
    expect(r.consultant.freela_code).toBe('ANASOU7K2P');
    expect(r.consultant.signup_url).toBeNull();
  });
});
