import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../../common/database/prisma.service';
import { FREELA_NOT_CONFIGURED_MESSAGE, FreelaClient, FreelaHttpError } from '../../freela/freela-client';
import { CampoFreelaService, EMAIL_DUPLICADO_NO_FREELA, FREELA_NOTES } from '../campo-freela.service';

const CONS = '44444444-4444-4444-8444-444444444444';

const LINHA = {
  id: CONS,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '31999990000',
  active: true,
  freela_consultant_id: null as string | null,
  praca: { cobertura_cidade: 'Belo Horizonte' as string | null, cobertura_uf: 'MG' as string | null },
};

function fakePrisma(linha: Record<string, unknown> | null = LINHA) {
  return {
    field_consultants: {
      findUnique: jest.fn().mockResolvedValue(linha),
      findMany: jest.fn().mockResolvedValue([{ id: CONS }]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function montar(p: ReturnType<typeof fakePrisma>, request: jest.Mock) {
  const client = { request, isConfigured: () => true } as unknown as FreelaClient;
  return new CampoFreelaService(p as unknown as PrismaService, client);
}

const dados = (p: ReturnType<typeof fakePrisma>, n = 0) =>
  (p.field_consultants.update.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

describe('CampoFreelaService.sync — criar o código', () => {
  it('cria com a nota do Praça, telefone em +55 e a cobertura da praça; guarda id e código', async () => {
    const p = fakePrisma();
    const request = jest.fn().mockResolvedValue({ data: { id: 'fc-1', code: 'ANASOU7K2P' } });

    await montar(p, request).sync(CONS);

    expect(request).toHaveBeenCalledWith('POST', '/v1/admins/consultants', {
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      notes: FREELA_NOTES,
      phone: '+5531999990000',
      city: 'Belo Horizonte',
      uf: 'MG',
    });
    expect(dados(p)).toMatchObject({ freela_consultant_id: 'fc-1', freela_code: 'ANASOU7K2P', freela_sync_error: null });
  });

  it('praça sem cobertura e telefone inválido: manda só o que o Freela aceita', async () => {
    const p = fakePrisma({ ...LINHA, phone: '123', praca: { cobertura_cidade: null, cobertura_uf: null } });
    const request = jest.fn().mockResolvedValue({ data: { id: 'fc-1', code: 'ANASOU7K2P' } });

    await montar(p, request).sync(CONS);

    expect(request.mock.calls[0]![2]).toEqual({ name: 'Ana Souza', email: 'ana@exemplo.com', notes: FREELA_NOTES });
  });

  it('Freela sem configuração: não lança, guarda o motivo', async () => {
    const p = fakePrisma();
    const request = jest
      .fn()
      .mockRejectedValue(new ServiceUnavailableException({ code: 'FREELA_NOT_CONFIGURED', message: FREELA_NOT_CONFIGURED_MESSAGE }));

    await expect(montar(p, request).sync(CONS)).resolves.toBeUndefined();
    expect(dados(p)).toEqual({ freela_sync_error: FREELA_NOT_CONFIGURED_MESSAGE });
  });

  it('409 com um consultor NOSSO lá (resposta perdida): adota id e código', async () => {
    const p = fakePrisma();
    const request = jest
      .fn()
      .mockRejectedValueOnce(new FreelaHttpError(409, 'Já existe um consultor com este e-mail.'))
      .mockResolvedValueOnce({
        data: [
          { id: 'outro', code: 'OUTRO123', email: 'x@y.com', notes: null },
          { id: 'fc-9', code: 'ANASOU9Z', email: 'Ana@Exemplo.com', notes: FREELA_NOTES },
        ],
      });

    await montar(p, request).sync(CONS);

    expect(request).toHaveBeenLastCalledWith('GET', '/v1/admins/consultants');
    expect(dados(p)).toMatchObject({ freela_consultant_id: 'fc-9', freela_code: 'ANASOU9Z', freela_sync_error: null });
  });

  it('409 com o e-mail de OUTRO consultor do Freela: erro fixo que exige o admin', async () => {
    const p = fakePrisma();
    const request = jest
      .fn()
      .mockRejectedValueOnce(new FreelaHttpError(409, 'Já existe um consultor com este e-mail.'))
      .mockResolvedValueOnce({ data: [{ id: 'fc-7', code: 'ANDRE2K', email: 'ana@exemplo.com', notes: 'Parceiro' }] });

    await montar(p, request).sync(CONS);

    expect(dados(p)).toEqual({ freela_sync_error: EMAIL_DUPLICADO_NO_FREELA });
  });

  it('inativo sem código: nada a criar', async () => {
    const p = fakePrisma({ ...LINHA, active: false });
    const request = jest.fn();
    await montar(p, request).sync(CONS);
    expect(request).not.toHaveBeenCalled();
    expect(p.field_consultants.update).not.toHaveBeenCalled();
  });
});

describe('CampoFreelaService.sync — ativar/desativar', () => {
  it('desativado no Praça → PATCH isActive=false no Freela e limpa o erro', async () => {
    const p = fakePrisma({ ...LINHA, active: false, freela_consultant_id: 'fc-1' });
    const request = jest.fn().mockResolvedValue({ data: {} });

    await montar(p, request).sync(CONS);

    expect(request).toHaveBeenCalledWith('PATCH', '/v1/admins/consultants/fc-1', { isActive: false });
    expect(dados(p)).toMatchObject({ freela_sync_error: null });
  });

  it('falha no PATCH vira erro (o relógio repete)', async () => {
    const p = fakePrisma({ ...LINHA, active: false, freela_consultant_id: 'fc-1' });
    const request = jest.fn().mockRejectedValue(new FreelaHttpError(403, 'Sem permissão.'));

    await montar(p, request).sync(CONS);

    expect(dados(p)).toEqual({ freela_sync_error: 'Sem permissão.' });
  });
});

describe('CampoFreelaService.retryPending', () => {
  it('busca pendentes de criação e de ativação, nunca o e-mail duplicado, e sincroniza um a um', async () => {
    const p = fakePrisma();
    const request = jest.fn().mockResolvedValue({ data: { id: 'fc-1', code: 'ANASOU7K2P' } });

    expect(await montar(p, request).retryPending()).toBe(1);

    const where = (p.field_consultants.findMany.mock.calls[0]![0] as { where: unknown }).where;
    expect(JSON.stringify(where)).toContain(EMAIL_DUPLICADO_NO_FREELA);
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { freela_consultant_id: null, active: true },
            { freela_consultant_id: { not: null }, freela_sync_error: { not: null } },
          ],
        },
        { OR: [{ freela_sync_error: null }, { freela_sync_error: { not: EMAIL_DUPLICADO_NO_FREELA } }] },
      ],
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
