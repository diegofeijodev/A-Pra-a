import * as bcrypt from 'bcryptjs';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { CampoFreelaService } from '../campo-freela.service';
import { ConsultoresService } from '../consultores.service';
import type { CreateConsultorDto } from '../dto/consultores.dto';
import type { PhotoStorage } from '../photo-storage';

const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const DIEGO = '33333333-3333-4333-8333-333333333333';
const ADMIN: AuthUser = { id: DIEGO, email: 'diego@praca.local', name: 'Diego', is_admin: true };

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
  freela_consultant_id: null as string | null,
  freela_code: null as string | null,
  freela_sync_error: null as string | null,
  freela_synced_at: null as Date | null,
  created_by: DIEGO,
  created_at: new Date('2026-10-08T12:00:00.000Z'),
  updated_at: new Date('2026-10-08T12:00:00.000Z'),
};

const NOVO: CreateConsultorDto = {
  name: ' Ana Souza ',
  email: ' Ana@Exemplo.com ',
  phone: '(31) 99999-0000',
  cpf: '529.982.247-25',
  praca_id: PRACA,
  pix_key_type: 'cpf',
  pix_key: '529.982.247-25',
};

function fakePrisma() {
  return {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA }) },
    field_consultants: {
      // Por padrão: o próprio consultor pelo id; e-mail/CPF ainda livres.
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id === CONS ? LINHA : null)),
      findMany: jest.fn().mockResolvedValue([LINHA]),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...LINHA, ...data, id: CONS })),
      update: jest.fn().mockResolvedValue(LINHA),
      delete: jest.fn().mockResolvedValue(LINHA),
    },
    field_journeys: { findMany: jest.fn().mockResolvedValue([]) },
    field_visits: { findMany: jest.fn().mockResolvedValue([]) },
    field_points: { groupBy: jest.fn().mockResolvedValue([]) },
  };
}

function montar(p: ReturnType<typeof fakePrisma>) {
  const freela = {
    sync: jest.fn().mockResolvedValue(undefined),
    desativarAntesDeApagar: jest.fn().mockResolvedValue(undefined),
  };
  const fotos = { put: jest.fn(), get: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };
  const s = new ConsultoresService(
    p as unknown as PrismaService,
    freela as unknown as CampoFreelaService,
    fotos as unknown as PhotoStorage,
  );
  return { s, freela, fotos };
}

const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

describe('ConsultoresService.create', () => {
  it('normaliza, guarda a senha provisória com hash, dispara o código no Freela e devolve a senha UMA vez', async () => {
    const p = fakePrisma();
    const { s, freela } = montar(p);

    const r = await s.create(NOVO, ADMIN);

    const data = dataDo(p.field_consultants.create);
    expect(data).toMatchObject({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      phone: '31999990000',
      cpf: '52998224725',
      praca_id: PRACA,
      pix_key_type: 'cpf',
      pix_key: '52998224725',
      created_by: DIEGO,
    });
    expect(r.temp_password).toMatch(/^[a-z2-9]{10}$/);
    expect(await bcrypt.compare(r.temp_password, data.password_hash as string)).toBe(true);
    expect(freela.sync).toHaveBeenCalledWith(CONS);
    expect(r.consultant).not.toHaveProperty('password_hash');
    expect(r.consultant).toMatchObject({ id: CONS, praca_name: 'Belo Horizonte + Contagem', signup_url: null });
  });

  it('CPF com dígito errado = 400 INVALID_CPF, nada é gravado', async () => {
    const p = fakePrisma();
    await expect(montar(p).s.create({ ...NOVO, cpf: '529.982.247-24' }, ADMIN)).rejects.toMatchObject({
      response: { code: 'INVALID_CPF' },
    });
    expect(p.field_consultants.create).not.toHaveBeenCalled();
  });

  it('chave Pix que não bate com o tipo = 400 INVALID_PIX', async () => {
    await expect(montar(fakePrisma()).s.create({ ...NOVO, pix_key_type: 'email', pix_key: 'nao-e-email' }, ADMIN)).rejects.toMatchObject(
      { response: { code: 'INVALID_PIX' } },
    );
  });

  it('praça inexistente = 404', async () => {
    const p = fakePrisma();
    p.pracas.findUnique.mockResolvedValue(null);
    await expect(montar(p).s.create(NOVO, ADMIN)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('e-mail ou CPF já usados = 409', async () => {
    const p = fakePrisma();
    p.field_consultants.findUnique.mockImplementation(async ({ where }: { where: { email?: string } }) =>
      where.email ? LINHA : null,
    );
    await expect(montar(p).s.create(NOVO, ADMIN)).rejects.toMatchObject({ response: { code: 'EMAIL_IN_USE' } });

    const q = fakePrisma();
    q.field_consultants.findUnique.mockImplementation(async ({ where }: { where: { cpf?: string } }) =>
      where.cpf ? LINHA : null,
    );
    await expect(montar(q).s.create(NOVO, ADMIN)).rejects.toMatchObject({ response: { code: 'CPF_IN_USE' } });
  });
});

describe('ConsultoresService.update / resetPassword / remove', () => {
  it('desativar sobe token_version (derruba a sessão) e desativa o código no Freela', async () => {
    const p = fakePrisma();
    const { s, freela } = montar(p);

    await s.update(CONS, { active: false });

    expect(dataDo(p.field_consultants.update)).toMatchObject({ active: false, token_version: { increment: 1 } });
    expect(freela.sync).toHaveBeenCalledWith(CONS);
  });

  it('trocar o e-mail sem código no Freela limpa o erro e tenta de novo', async () => {
    const p = fakePrisma();
    const { s, freela } = montar(p);

    await s.update(CONS, { email: 'ana.nova@exemplo.com' });

    expect(dataDo(p.field_consultants.update)).toMatchObject({ email: 'ana.nova@exemplo.com', freela_sync_error: null });
    expect(freela.sync).toHaveBeenCalledWith(CONS);
  });

  it('nova senha provisória: obriga a troca, derruba a sessão e devolve a senha uma vez', async () => {
    const p = fakePrisma();
    const r = await montar(p).s.resetPassword(CONS);

    const data = dataDo(p.field_consultants.update);
    expect(data).toMatchObject({ must_change_password: true, token_version: { increment: 1 } });
    expect(await bcrypt.compare(r.temp_password, data.password_hash as string)).toBe(true);
  });

  it('apagar desliga o código no Freela, apaga o consultor e as fotos', async () => {
    const p = fakePrisma();
    p.field_visits.findMany.mockResolvedValue([{ photo_key: 'campo/a.jpg' }, { photo_key: 'campo/b.jpg' }]);
    const { s, freela, fotos } = montar(p);

    expect(await s.remove(CONS)).toEqual({ ok: true });
    expect(freela.desativarAntesDeApagar).toHaveBeenCalled();
    expect(p.field_consultants.delete).toHaveBeenCalledWith({ where: { id: CONS } });
    expect(fotos.remove.mock.calls.map((c) => c[0])).toEqual(['campo/a.jpg', 'campo/b.jpg']);
  });

  it('id malformado = 404 sem tocar no banco', async () => {
    const p = fakePrisma();
    await expect(montar(p).s.get('nao-e-uuid')).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(p.field_consultants.findUnique).not.toHaveBeenCalled();
  });
});

describe('ConsultoresService.list — situação de hoje', () => {
  it('em jornada, visitas e "cadastrou agora" de hoje, último ponto', async () => {
    const p = fakePrisma();
    p.field_journeys.findMany.mockResolvedValue([{ id: 'j1', consultant_id: CONS, ended_at: null }]);
    p.field_visits.findMany.mockResolvedValue([
      { consultant_id: CONS, freela_status: 'cadastrou_qr' },
      { consultant_id: CONS, freela_status: 'ja_usa' },
    ]);
    p.field_points.groupBy.mockResolvedValue([{ journey_id: 'j1', _max: { at: new Date('2026-10-08T17:40:00.000Z') } }]);

    const [item] = await montar(p).s.list(new Date('2026-10-08T18:00:00.000Z'));

    expect((p.field_journeys.findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({ day: '2026-10-08' });
    expect(item!.today).toEqual({
      status: 'em_jornada',
      visits: 2,
      cadastros: 1,
      last_point_at: '2026-10-08T17:40:00.000Z',
    });
  });
});

describe('ConsultoresService — corrida no índice único (P2002)', () => {
  const { Prisma } = jest.requireActual('@prisma/client') as typeof import('@prisma/client');
  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target },
    });

  const casos: Array<[string, unknown, string]> = [
    ['e-mail (colunas)', ['email'], 'EMAIL_IN_USE'],
    ['e-mail (nome do índice)', 'field_consultants_email_key', 'EMAIL_IN_USE'],
    ['CPF (colunas)', ['cpf'], 'CPF_IN_USE'],
    ['CPF (nome do índice)', 'field_consultants_cpf_key', 'CPF_IN_USE'],
  ];

  it.each(casos)('create: %s = 409 %s', async (_n, target, code) => {
    const p = fakePrisma();
    p.field_consultants.create.mockRejectedValue(p2002(target));
    await expect(montar(p).s.create(NOVO, ADMIN)).rejects.toMatchObject({ status: 409, response: { code } });
  });

  it.each(casos)('update: %s = 409 %s', async (_n, target, code) => {
    const p = fakePrisma();
    p.field_consultants.update.mockRejectedValue(p2002(target));
    await expect(montar(p).s.update(CONS, { name: 'Outro Nome' })).rejects.toMatchObject({
      status: 409,
      response: { code },
    });
  });
});
