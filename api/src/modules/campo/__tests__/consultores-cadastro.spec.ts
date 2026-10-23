/**
 * Lote E (contrato §41.3, §42.3): endereço e banco do consultor (FIELD_CONSULTANT_PROFILE_ENABLED) e o que o gestor não muda nem vê
 * (Pix, modo da visita, banco). Com as flags desligadas, `ConsultorView` é a de hoje e o corpo de hoje passa igual.
 */
import { ValidationPipe } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { LOVABLE_E_DESLIGADAS, type FlagsLovableE } from '../../../common/flags/lovable-e.flags';
import type { CampoFreelaService } from '../campo-freela.service';
import { ConsultoresService } from '../consultores.service';
import { CreateConsultorDto, UpdateConsultorDto } from '../dto/consultores.dto';
import type { PhotoStorage } from '../photo-storage';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const ADMIN: AuthUser = { id: '33333333-3333-4333-8333-333333333333', email: 'diego@praca.local', name: 'Diego', is_admin: true };
const GESTOR: AuthUser = { id: '55555555-5555-4555-8555-555555555555', email: 'rebeca@praca.local', name: 'Rebeca', is_admin: false, is_gestor: true };
const EQUIPE: AuthUser = { id: '66666666-6666-4666-8666-666666666666', email: 'eq@praca.local', name: 'Eq', is_admin: false };

const LINHA = {
  id: CONS,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '31999990000',
  cpf: '52998224725',
  praca_id: PRACA,
  praca: { name: 'Belo Horizonte + Contagem' },
  pix_key: '52998224725',
  pix_key_type: 'cpf',
  password_hash: 'x',
  must_change_password: true,
  token_version: 0,
  active: true,
  freela_consultant_id: null,
  freela_code: null,
  freela_sync_error: null,
  freela_synced_at: null,
  visit_flow: null,
  created_by: ADMIN.id,
  created_at: new Date('2026-10-08T12:00:00.000Z'),
  updated_at: new Date('2026-10-08T12:00:00.000Z'),
  address_cep: '30140071',
  address_street: 'Rua da Bahia',
  address_number: '100',
  address_complement: null,
  address_district: 'Centro',
  address_city: 'Belo Horizonte',
  address_state: 'MG',
  bank_name: 'Banco X',
  bank_branch: '1234',
  bank_account: '123456-7',
  bank_account_type: 'corrente',
};
/** O corpo que o `ConsultorDialog` de hoje manda ao editar (o formulário inteiro + o modo). */
const EDICAO_WEB = { name: 'Ana Souza', email: 'ana@exemplo.com', phone: '31999990000', cpf: '52998224725', praca_id: PRACA, pix_key_type: 'cpf', pix_key: '52998224725', visit_flow: null };
const NOVO_WEB = { name: 'Ana Souza', email: 'ana@exemplo.com', phone: '(31) 99999-0000', cpf: '529.982.247-25', praca_id: PRACA, pix_key_type: 'cpf', pix_key: '529.982.247-25' };

function fakePrisma() {
  return {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA }) },
    field_consultants: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id === CONS ? LINHA : null)),
      findMany: jest.fn().mockResolvedValue([LINHA]),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...LINHA, ...data, id: CONS })),
      update: jest.fn().mockResolvedValue(LINHA),
    },
    field_journeys: { findMany: jest.fn().mockResolvedValue([]) },
    field_visits: { findMany: jest.fn().mockResolvedValue([]) },
    field_points: { groupBy: jest.fn().mockResolvedValue([]) },
  };
}
function montar(p: ReturnType<typeof fakePrisma>, flags: Partial<FlagsLovableE> = {}) {
  return new ConsultoresService(
    p as unknown as PrismaService,
    { sync: jest.fn().mockResolvedValue(undefined) } as unknown as CampoFreelaService,
    { put: jest.fn(), get: jest.fn(), remove: jest.fn() } as unknown as PhotoStorage,
    undefined,
    undefined,
    { ...LOVABLE_E_DESLIGADAS, ...flags },
  );
}
const upd = (b: unknown) => pipe.transform(b, { type: 'body', metatype: UpdateConsultorDto }) as Promise<UpdateConsultorDto>;
const cri = (b: unknown) => pipe.transform(b, { type: 'body', metatype: CreateConsultorDto }) as Promise<CreateConsultorDto>;
const NOVAS = ['address_cep', 'address_street', 'address_number', 'address_complement', 'address_district', 'address_city', 'address_state', 'bank_name', 'bank_branch', 'bank_account_type', 'bank_account_masked', 'bank_account'];

describe('flags desligadas (produção hoje)', () => {
  it('a visão é a de hoje: nenhuma chave nova e o Pix inteiro para todos', async () => {
    const s = montar(fakePrisma());
    for (const quem of [ADMIN, EQUIPE, GESTOR, undefined]) {
      const v = await s.get(CONS, quem);
      for (const k of NOVAS) expect(v).not.toHaveProperty(k);
      // Gestor com a flag desligada: o guard nunca marca `is_gestor` (o teste usa a marca só para provar o efeito com ela).
      if (quem !== GESTOR) expect(v.pix_key).toBe('52998224725');
    }
  });
  it('o corpo de hoje do web passa; endereço/banco nulos são ignorados; valor = 422 CONSULTANT_PROFILE_DISABLED sem gravar', async () => {
    const p = fakePrisma();
    const s = montar(p);
    await s.update(CONS, await upd(EDICAO_WEB), ADMIN);
    expect(p.field_consultants.update.mock.calls[0][0].data).not.toHaveProperty('bank_name');
    await s.update(CONS, await upd({ ...EDICAO_WEB, bank_name: null, address_cep: null }), ADMIN);
    expect(p.field_consultants.update.mock.calls[1][0].data).not.toHaveProperty('address_cep');
    await expect(s.update(CONS, await upd({ address_city: 'BH' }), ADMIN)).rejects.toMatchObject({ status: 422, response: { code: 'CONSULTANT_PROFILE_DISABLED' } });
    await expect(s.create(await cri({ ...NOVO_WEB, bank_account: '1' }), ADMIN)).rejects.toMatchObject({ status: 422 });
    expect(p.field_consultants.update).toHaveBeenCalledTimes(2);
    expect(p.field_consultants.create).not.toHaveBeenCalled();
  });
});

describe('cadastro ligado (§41.3)', () => {
  it('admin vê tudo, inclusive a conta completa; a equipe vê a conta mascarada (a chave completa não vem)', async () => {
    const s = montar(fakePrisma(), { consultant_profile: true });
    const a = await s.get(CONS, ADMIN);
    expect(a).toMatchObject({ address_cep: '30140071', address_state: 'MG', bank_name: 'Banco X', bank_branch: '1234', bank_account: '123456-7', bank_account_masked: '•••6-7', bank_account_type: 'corrente' });
    const e = await s.get(CONS, EQUIPE);
    expect(e).toMatchObject({ address_city: 'Belo Horizonte', bank_account_masked: '•••6-7' });
    expect(e).not.toHaveProperty('bank_account');
    const [item] = await s.list(new Date('2026-10-08T18:00:00.000Z'), EQUIPE);
    expect(item).not.toHaveProperty('bank_account');
  });
  it('grava normalizado; null limpa; inválido = 400 com o campo e sem o valor', async () => {
    const p = fakePrisma();
    const s = montar(p, { consultant_profile: true });
    await s.update(CONS, await upd({ address_cep: '30140-071', address_state: 'mg', bank_account: '99-X', bank_name: null }), ADMIN);
    expect(p.field_consultants.update.mock.calls[0][0].data).toMatchObject({ address_cep: '30140071', address_state: 'MG', bank_account: '99-x', bank_name: null });
    const e = await s.update(CONS, await upd({ address_cep: '123' }), ADMIN).then(() => null, (x: { status: number; response: unknown }) => x);
    expect(e).toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
    expect(JSON.stringify(e?.response)).toContain('address_cep');
    expect(JSON.stringify(e?.response)).not.toContain('"123"');
    await s.create(await cri({ ...NOVO_WEB, email: 'b@b.com', cpf: '11144477735', address_city: 'Contagem' }), ADMIN);
    expect(p.field_consultants.create.mock.calls[0][0].data).toMatchObject({ address_city: 'Contagem' });
  });
});

describe('gestor (§42.3)', () => {
  it('vê o Pix mascarado e a conta mascarada', async () => {
    const s = montar(fakePrisma(), { consultant_profile: true, team_gestor: true });
    const g = await s.get(CONS, GESTOR);
    expect(g.pix_key).toBe('•••4725');
    expect(g).not.toHaveProperty('bank_account');
    expect((await s.get(CONS, ADMIN)).pix_key).toBe('52998224725');
  });
  it('com o perfil gestor ligado, a equipe que não é gestor também vê o Pix mascarado (decisão do dono 23/10); o admin vê inteiro', async () => {
    const s = montar(fakePrisma(), { team_gestor: true });
    expect((await s.get(CONS, EQUIPE)).pix_key).toBe('•••4725');
    expect((await s.list(new Date(), EQUIPE))[0]!.pix_key).toBe('•••4725');
    expect((await s.get(CONS, ADMIN)).pix_key).toBe('52998224725');
    // Chamada interna (sem quem pede) segue como hoje.
    expect((await s.get(CONS)).pix_key).toBe('52998224725');
  });
  it.each([
    ['pix_key', { pix_key: '52998224725' }, 'a chave Pix'],
    ['pix_key_type', { pix_key_type: 'cpf' }, 'o tipo da chave Pix'],
    ['visit_flow (mesmo null)', { visit_flow: null }, 'o modo da visita'],
    ['bank_* (mesmo null)', { bank_name: null }, 'os dados do banco'],
  ])('PATCH com %s = 403 FORBIDDEN_FIELD, sem gravar e sem o valor', async (_n, corpo, rotulo) => {
    const p = fakePrisma();
    const s = montar(p, { consultant_profile: true, team_gestor: true });
    const e = await s.update(CONS, await upd({ name: 'Ana', ...corpo }), GESTOR).then(() => null, (x: { status: number; response: { message: string } }) => x);
    expect(e).toMatchObject({ status: 403, response: { code: 'FORBIDDEN_FIELD', message: `Gestor não muda ${rotulo}: peça a um administrador.` } });
    expect(e?.response.message).not.toContain('52998224725');
    expect(p.field_consultants.update).not.toHaveBeenCalled();
  });
  it('o corpo que o web do gestor manda (sem Pix, modo e banco) passa; endereço ele muda', async () => {
    const p = fakePrisma();
    const s = montar(p, { consultant_profile: true, team_gestor: true });
    const semProibidos = Object.fromEntries(Object.entries(EDICAO_WEB).filter(([k]) => !['pix_key', 'pix_key_type', 'visit_flow'].includes(k)));
    await s.update(CONS, await upd({ ...semProibidos, address_city: 'Contagem' }), GESTOR);
    expect(p.field_consultants.update.mock.calls[0][0].data).toMatchObject({ name: 'Ana Souza', address_city: 'Contagem' });
    expect(p.field_consultants.update.mock.calls[0][0].data).not.toHaveProperty('pix_key');
  });
  it('cria com o Pix (obrigatório); banco no cadastro = 403', async () => {
    const p = fakePrisma();
    const s = montar(p, { consultant_profile: true, team_gestor: true });
    const r = await s.create(await cri(NOVO_WEB), GESTOR);
    expect(p.field_consultants.create.mock.calls[0][0].data).toMatchObject({ pix_key: '52998224725', created_by: GESTOR.id });
    expect(r.consultant.pix_key).toBe('•••4725');
    await expect(s.create(await cri({ ...NOVO_WEB, bank_account: '1' }), GESTOR)).rejects.toMatchObject({ status: 403, response: { code: 'FORBIDDEN_FIELD' } });
  });
  it('admin que também tem is_gestor continua admin (muda tudo)', async () => {
    const p = fakePrisma();
    const s = montar(p, { consultant_profile: true, team_gestor: true });
    await s.update(CONS, await upd({ pix_key: '52998224725', visit_flow: 'simples', bank_name: 'Y' }), { ...ADMIN, is_gestor: true });
    expect(p.field_consultants.update).toHaveBeenCalled();
  });
});
