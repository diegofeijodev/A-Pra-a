import { BadGatewayException, NotFoundException, StreamableFile } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import { CampoController } from '../campo.controller';

const C = { id: 'c1', name: 'Ana', email: 'a@b.com', praca_id: 'p', must_change_password: false } as CampoConsultant;
const REF = '77777777-7777-4777-8777-777777777777';

function montar(photo: jest.Mock) {
  const visits = { photo };
  const c = new CampoController({} as never, {} as never, {} as never, visits as never, {} as never);
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

describe('CampoController.me — features', () => {
  const auth = { me: jest.fn().mockResolvedValue({ consultant: { id: 'c1' }, channels: [] }) };
  it('company_signup segue a flag (padrão desligada)', async () => {
    const off = new CampoController(auth as never, {} as never, {} as never, {} as never, {} as never);
    const on = new CampoController(auth as never, {} as never, {} as never, {} as never, {} as never, true);
    // Lote A da Lovable (§33.1): + day_summary e map_pins; lote B (§35.6/§37.6): + checklist e breaks (aditivos, desligados por padrão).
    // Lote C (§38.1): + vouchers (aditivo, desligado por padrão).
    const novas = { day_summary: false, map_pins: false, checklist: false, breaks: false, vouchers: false };
    expect((await off.me(C)).features).toEqual({ company_signup: false, earnings: false, payouts: false, visit_flow: false, declared_signups: false, ...novas });
    expect((await on.me(C)).features).toEqual({ company_signup: true, earnings: false, payouts: false, visit_flow: false, declared_signups: false, ...novas });
    expect(await off.me(C)).not.toHaveProperty('checklist_config');
  });

  it('earnings segue FIELD_EARNINGS_ENABLED (padrão desligada)', async () => {
    const op = (ligado: boolean) => ({ ligado, autoClose: false, janelaNaoConfirmadosDias: 45 });
    const off = new CampoController(auth as never, {} as never, {} as never, {} as never, {} as never, false, op(false));
    const on = new CampoController(auth as never, {} as never, {} as never, {} as never, {} as never, false, op(true));
    expect((await off.me(C)).features?.earnings).toBe(false);
    expect((await on.me(C)).features?.earnings).toBe(true);
  });

  it('payouts segue FIELD_PAYOUTS_ENABLED (e exige a remuneração)', async () => {
    const earn = { ligado: true, autoClose: false, janelaNaoConfirmadosDias: 45 };
    const mk = (ligado: boolean) => new CampoController(auth as never, {} as never, {} as never, {} as never, {} as never, false, earn, { ligado });
    expect((await mk(false).me(C)).features?.payouts).toBe(false);
    expect((await mk(true).me(C)).features?.payouts).toBe(true);
  });

  it('day_summary e map_pins seguem as flags do lote A da Lovable', async () => {
    const mk = (f: { dashboard: boolean; day_summary: boolean; map_pins: boolean }) =>
      new CampoController(auth as never, {} as never, {} as never, {} as never, {} as never, false, undefined, undefined, undefined, f);
    expect((await mk({ dashboard: true, day_summary: true, map_pins: false }).me(C)).features).toMatchObject({ day_summary: true, map_pins: false });
    expect((await mk({ dashboard: false, day_summary: false, map_pins: true }).me(C)).features).toMatchObject({ day_summary: false, map_pins: true });
  });
});

describe('CampoController.me — lote C (§38.1)', () => {
  const auth = { me: jest.fn().mockResolvedValue({ consultant: { id: 'c1' }, channels: [] }) };
  const vouchers = { config: jest.fn().mockResolvedValue({ max_por_empresa: 1, discount_type: 'PERCENT', percent_off: 100, amount_off_cents: null, single_use: true, validade_dias: 30, min_job_hours: null, motivo_reprovacao: 'obrigatorio', voucher_sync_min: 30 }) };
  const mk = (flags: { segments: boolean; vouchers: boolean; voucher_coupons: boolean }) =>
    new CampoController(auth as never, {} as never, {} as never, {} as never, {} as never, false, undefined, undefined, undefined, undefined, undefined, undefined, undefined, flags, vouchers as never);
  it('desligada: features.vouchers false e sem voucher_config (nenhuma leitura)', async () => {
    vouchers.config.mockClear();
    const r = await mk({ segments: false, vouchers: false, voucher_coupons: false }).me(C);
    expect(r.features.vouchers).toBe(false);
    expect(r).not.toHaveProperty('voucher_config');
    expect(vouchers.config).not.toHaveBeenCalled();
  });
  it('ligada: o desconto e a validade para a tela sem sinal', async () => {
    const r = await mk({ segments: false, vouchers: true, voucher_coupons: true }).me(C);
    expect(r.features.vouchers).toBe(true);
    expect(r.voucher_config).toEqual({ discount_type: 'PERCENT', percent_off: 100, amount_off_cents: null, single_use: true, validade_dias: 30, min_job_hours: null, coupons: true });
  });
});
