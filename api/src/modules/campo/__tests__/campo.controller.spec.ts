import { BadGatewayException, NotFoundException, StreamableFile } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import { CampoController } from '../campo.controller';

const C = { id: 'c1', name: 'Ana', email: 'a@b.com', praca_id: 'p', must_change_password: false } as CampoConsultant;
const REF = '77777777-7777-4777-8777-777777777777';

function montar(photo: jest.Mock) {
  const visits = { photo };
  const c = new CampoController({} as never, {} as never, {} as never, visits as never, {} as never, {} as never);
  const res = { header: jest.fn().mockReturnThis() };
  return { c, res: res as unknown as FastifyReply, header: res.header };
}

describe('CampoController.photo — cache só na resposta de sucesso', () => {
  it('sucesso: devolve o arquivo e marca Cache-Control privado de 24 h', async () => {
    const { c, res, header } = montar(jest.fn().mockResolvedValue({ bytes: Buffer.from([1]), mime: 'image/jpeg' }));
    expect(await c.photo(C, REF, res)).toBeInstanceOf(StreamableFile);
    expect(header).toHaveBeenCalledWith('Cache-Control', 'private, max-age=86400');
  });

  it.each([
    ['404', new NotFoundException({ code: 'NOT_FOUND', message: 'x' })],
    ['502', new BadGatewayException({ code: 'PHOTO_STORAGE_ERROR', message: 'x' })],
  ])('erro %s: não carrega Cache-Control', async (_n, erro) => {
    const { c, res, header } = montar(jest.fn().mockRejectedValue(erro));
    await expect(c.photo(C, REF, res)).rejects.toBe(erro);
    expect(header).not.toHaveBeenCalled();
  });
});
