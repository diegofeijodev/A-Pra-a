import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { AuthUser } from '../../../../common/auth/auth-user';
import type { CampoConsultant } from '../../../../common/auth/campo-consultant';
import { codigoDoCupom } from '../../../../domain/voucher-rules';
import type { FreelaClient } from '../../../freela/freela-client';
import type { FlagsLovableC } from '../../../rotas/rotas.tokens';
import { VoucherCouponsService } from '../voucher-coupons.service';
import { VouchersService } from '../vouchers.service';
import { FreelaCouponIssuer, NoopIssuer, type VoucherCouponIssuer } from '../vouchers.tokens';
import { FreelaFalso, RepoFalso } from './fakes';

beforeAll(() => Logger.overrideLogger(false));

const PRACA_A = '00000000-0000-4000-8000-0000000000aa';
const PRACA_B = '00000000-0000-4000-8000-0000000000bb';
const LEAD_A = '00000000-0000-4000-8000-00000000a001';
const LEAD_A2 = '00000000-0000-4000-8000-00000000a002';
const LEAD_B = '00000000-0000-4000-8000-00000000b001';
const VISITA_A = '00000000-0000-4000-8000-00000000c001';
const VISITA_A_CLIENT = '00000000-0000-4000-8000-00000000c0c1';
const ANA: CampoConsultant = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Ana',
  email: 'ana@x',
  praca_id: PRACA_A,
  must_change_password: false,
};
const BIA: CampoConsultant = {
  id: '00000000-0000-4000-8000-0000000000a2',
  name: 'Bia',
  email: 'bia@x',
  praca_id: PRACA_A,
  must_change_password: false,
};
const CAIO: CampoConsultant = {
  id: '00000000-0000-4000-8000-0000000000b1',
  name: 'Caio',
  email: 'caio@x',
  praca_id: PRACA_B,
  must_change_password: false,
};
const DIEGO: AuthUser = {
  id: '00000000-0000-4000-8000-0000000000d1',
  email: 'diego@x',
  name: 'Diego',
  is_admin: true,
};
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function montar(
  o: { vouchers?: boolean; cupons?: boolean; configurado?: boolean; cadastro?: boolean; sync?: boolean } = {},
) {
  const flags: FlagsLovableC = {
    segments: false,
    vouchers: o.vouchers ?? true,
    voucher_coupons: (o.vouchers ?? true) && (o.cupons ?? false),
  };
  const repo = new RepoFalso();
  const freela = new FreelaFalso();
  freela.configurado = o.configurado ?? true;
  const issuer: VoucherCouponIssuer = flags.voucher_coupons
    ? new FreelaCouponIssuer(freela as unknown as FreelaClient)
    : new NoopIssuer();
  const cupons = new VoucherCouponsService(
    repo,
    issuer,
    flags,
    o.cadastro ?? false,
    o.sync ? { ligado: true, intervaloMin: 10, janelaDias: 45 } : undefined,
  );
  const service = new VouchersService(repo, cupons, issuer, flags);
  repo.leads.set(LEAD_A, { id: LEAD_A, name: 'Padaria Bom Pão', city: 'Belo Horizonte', praca_id: PRACA_A });
  repo.leads.set(LEAD_A2, { id: LEAD_A2, name: 'Bar do Chico', city: '', praca_id: PRACA_A });
  repo.leads.set(LEAD_B, { id: LEAD_B, name: 'Café de Outra Praça', city: 'Contagem', praca_id: PRACA_B });
  repo.pracas.set(PRACA_A, { city: 'BH', cobertura_uf: 'MG', cobertura_cidade: 'Belo Horizonte' });
  repo.pracas.set(PRACA_B, { city: 'Contagem', cobertura_uf: 'MG', cobertura_cidade: 'Contagem' });
  repo.visitas.push({ id: VISITA_A, client_id: VISITA_A_CLIENT, consultant_id: ANA.id, lead_id: LEAD_A });
  for (const c of [ANA, BIA, CAIO]) repo.consultores.set(c.id, c.name);
  return { service, cupons, repo, freela };
}

const pedido = (over: Record<string, unknown> = {}) => ({
  client_id: uuid(),
  lead_id: LEAD_A,
  segment: 'Padaria',
  freelas_per_week: 3,
  ...over,
});

describe('pedir (consultor)', () => {
  it('fotografa nome, cidade e UF do servidor; evento requested sem telefone/e-mail', async () => {
    const { service, repo } = montar();
    const { view, criado } = await service.pedir(ANA, pedido({ city: 'Outra', uf: 'sp' }));
    expect(criado).toBe(true);
    expect(view).toMatchObject({
      company_name: 'Padaria Bom Pão',
      city: 'Belo Horizonte',
      uf: 'MG',
      segment: 'Padaria',
      status: 'pendente',
      situacao: 'pedido',
      coupon_code: null,
    });
    expect(repo.eventosGravados.map((e) => e.type)).toEqual(['requested']);
    expect(JSON.stringify(repo.eventosGravados)).not.toMatch(/@|\(\d\d\)/);
    const semCidade = await service.pedir(ANA, pedido({ lead_id: LEAD_A2 }));
    expect(semCidade.view.city).toBe('Belo Horizonte');
  });

  it('pela visita (sem sinal o lugar novo não tem lead_id no aparelho): resolve o lead pelo client_id da visita', async () => {
    const { service } = montar();
    const { view } = await service.pedir(ANA, pedido({ lead_id: null, visit_ref: VISITA_A_CLIENT }));
    expect(view).toMatchObject({ lead_id: LEAD_A, visit_id: VISITA_A });
    await expect(service.pedir(ANA, pedido({ lead_id: LEAD_A2, visit_ref: VISITA_A }))).rejects.toMatchObject(
      { status: 422 },
    );
    await expect(service.pedir(ANA, pedido({ lead_id: null }))).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('isolamento: lead de outra praça, visita de outro consultor e id malformado = 404', async () => {
    const { service } = montar();
    await expect(service.pedir(ANA, pedido({ lead_id: LEAD_B }))).rejects.toMatchObject({ status: 404 });
    await expect(service.pedir(BIA, pedido({ lead_id: null, visit_ref: VISITA_A }))).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.pedir(ANA, pedido({ lead_id: 'xx' }))).rejects.toMatchObject({ status: 404 });
    await expect(service.pedir(CAIO, pedido())).rejects.toMatchObject({ status: 404 });
  });

  it('idempotente pelo client_id (fila offline); client_id de outro consultor = 409', async () => {
    const { service, repo } = montar();
    const corpo = pedido();
    const a = await service.pedir(ANA, corpo);
    const b = await service.pedir(ANA, corpo);
    expect(b).toEqual({ view: a.view, criado: false });
    expect(repo.vouchers.size).toBe(1);
    await expect(service.pedir(BIA, corpo)).rejects.toMatchObject({
      status: 409,
      response: { code: 'CLIENT_ID_IN_USE' },
    });
  });

  it('isolamento na leitura: cada consultor só vê os dele', async () => {
    const { service } = montar();
    await service.pedir(ANA, pedido());
    await service.pedir(BIA, pedido({ lead_id: LEAD_A2 }));
    await service.pedir(CAIO, pedido({ lead_id: LEAD_B }));
    expect((await service.doConsultor(ANA)).items.map((v) => v.company_name)).toEqual(['Padaria Bom Pão']);
    expect((await service.doConsultor(CAIO)).items.map((v) => v.company_name)).toEqual([
      'Café de Outra Praça',
    ]);
    const daPracaA = await service.listar({ praca_id: PRACA_A });
    expect(daPracaA.items.map((v) => v.company_name).sort()).toEqual(['Bar do Chico', 'Padaria Bom Pão']);
    expect(daPracaA.counts).toMatchObject({ pedido: 2, todos: 2 });
    expect((await service.listar({ praca_id: PRACA_B })).items).toHaveLength(1);
  });

  it('limite por empresa SOB CONCORRÊNCIA: dois pedidos em paralelo do mesmo estabelecimento = um passa, o outro 409', async () => {
    const { service, repo } = montar();
    const r = await Promise.allSettled([service.pedir(ANA, pedido()), service.pedir(BIA, pedido())]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const recusa = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(recusa.reason).toMatchObject({
      status: 409,
      response: {
        code: 'VOUCHER_LIMIT_REACHED',
        message: expect.stringMatching(
          /^Esta empresa já tem um cupom pedido, por (Ana|Bia) em \d\d\/\d\d\.$/,
        ),
      },
    });
    expect(repo.vouchers.size).toBe(1);
    expect(repo.chaves.filter((k) => k === `voucher-lead:${LEAD_A}`)).toHaveLength(2);
  });

  it('reprovado libera um pedido novo; o limite é configurável', async () => {
    const { service } = montar();
    const a = await service.pedir(ANA, pedido());
    await service.reprovar(a.view.id, { client_id: uuid(), reason: 'Fora do perfil' }, DIEGO);
    await expect(service.pedir(ANA, pedido())).resolves.toMatchObject({ criado: true });
    await service.salvarConfig({ max_por_empresa: 2 }, DIEGO);
    await expect(service.pedir(BIA, pedido())).resolves.toMatchObject({ criado: true });
    await expect(service.pedir(BIA, pedido())).rejects.toMatchObject({
      response: { code: 'VOUCHER_LIMIT_REACHED' },
    });
  });
});

describe('decisão (só admin; compare-and-set)', () => {
  it('aprovar duas vezes com outro client_id = 409 INVALID_TRANSITION; o mesmo client_id = o mesmo estado', async () => {
    const { service, repo } = montar();
    const { view } = await service.pedir(ANA, pedido());
    const c1 = uuid();
    const a = await service.aprovar(view.id, { client_id: c1 }, DIEGO);
    expect(a).toMatchObject({
      status: 'aprovado',
      coupon_status: 'nao_aplicavel',
      situacao: 'registrado',
      decided_by_name: 'Diego',
    });
    await expect(service.aprovar(view.id, { client_id: c1 }, DIEGO)).resolves.toMatchObject({
      status: 'aprovado',
    });
    await expect(service.aprovar(view.id, { client_id: uuid() }, DIEGO)).rejects.toMatchObject({
      status: 409,
      response: { code: 'INVALID_TRANSITION' },
    });
    await expect(
      service.reprovar(view.id, { client_id: uuid(), reason: 'Tarde demais' }, DIEGO),
    ).rejects.toMatchObject({ status: 409, response: { code: 'INVALID_TRANSITION' } });
    expect(repo.eventosGravados.map((e) => e.type)).toEqual(['requested', 'approved']);
  });

  it('dois admins aprovando ao mesmo tempo: um passa, o outro 409', async () => {
    const { service } = montar();
    const { view } = await service.pedir(ANA, pedido());
    const r = await Promise.allSettled([
      service.aprovar(view.id, { client_id: uuid() }, DIEGO),
      service.reprovar(view.id, { client_id: uuid(), reason: 'Repetido' }, DIEGO),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({
      response: { code: 'INVALID_TRANSITION' },
    });
  });

  it('reprovar: motivo obrigatório (3–500) por padrão; "opcional" aceita sem motivo; o consultor vê o motivo', async () => {
    const { service } = montar();
    const a = await service.pedir(ANA, pedido());
    await expect(service.reprovar(a.view.id, { client_id: uuid() }, DIEGO)).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
    await expect(
      service.reprovar(a.view.id, { client_id: uuid(), reason: 'ok' }, DIEGO),
    ).rejects.toMatchObject({ status: 400 });
    await service.reprovar(a.view.id, { client_id: uuid(), reason: '  Já é cliente do Freela  ' }, DIEGO);
    expect((await service.doConsultor(ANA)).items[0]).toMatchObject({
      situacao: 'reprovado',
      decision_reason: 'Já é cliente do Freela',
    });
    await service.salvarConfig({ motivo_reprovacao: 'opcional' }, DIEGO);
    const b = await service.pedir(ANA, pedido());
    await expect(
      service.reprovar(b.view.id, { client_id: uuid(), reason: null }, DIEGO),
    ).resolves.toMatchObject({ status: 'reprovado', decision_reason: null });
  });

  it('detalhe traz os eventos; id malformado = 404', async () => {
    const { service } = montar();
    const a = await service.pedir(ANA, pedido());
    await service.aprovar(a.view.id, { client_id: uuid(), note: 'ok' }, DIEGO);
    const d = await service.detalhe(a.view.id);
    expect(d.events.map((e) => [e.type, e.actor_kind])).toEqual([
      ['requested', 'consultor'],
      ['approved', 'equipe'],
    ]);
    await expect(service.detalhe('nao-e-uuid')).rejects.toMatchObject({ status: 404 });
  });
});

describe('flags', () => {
  it('FIELD_VOUCHERS_ENABLED desligada: tudo 404 VOUCHERS_DISABLED e o painel fica null', async () => {
    const { service } = montar({ vouchers: false });
    await expect(service.pedir(ANA, pedido())).rejects.toMatchObject({
      status: 404,
      response: { code: 'VOUCHERS_DISABLED' },
    });
    await expect(service.listar({})).rejects.toMatchObject({ response: { code: 'VOUCHERS_DISABLED' } });
    await expect(service.configView()).rejects.toMatchObject({ response: { code: 'VOUCHERS_DISABLED' } });
    expect(await service.resumoPainel('2026-10-01', '2026-10-22')).toBeNull();
  });

  it('FIELD_VOUCHER_COUPONS_ENABLED desligada: aprovar é só registro e o Freela NUNCA é chamado', async () => {
    const { service, cupons, freela } = montar({ cupons: false });
    const a = await service.pedir(ANA, pedido());
    expect(
      await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: null }, DIEGO),
    ).toMatchObject({ coupon_status: 'nao_aplicavel', coupon_code: null, coupon_params: null });
    const b = await service.pedir(ANA, pedido({ lead_id: LEAD_A2 }));
    await expect(
      service.aprovar(b.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO),
    ).rejects.toMatchObject({ status: 404, response: { code: 'VOUCHER_COUPONS_DISABLED' } });
    await expect(service.candidatos(b.view.id)).rejects.toMatchObject({
      response: { code: 'VOUCHER_COUPONS_DISABLED' },
    });
    await expect(service.tentarDeNovo(b.view.id, DIEGO)).rejects.toMatchObject({
      response: { code: 'VOUCHER_COUPONS_DISABLED' },
    });
    expect(await cupons.rodada()).toEqual({ vinculados: 0, tentados: 0, criados: 0, lidos: 0 });
    await cupons.avisarSemConexao();
    expect(freela.chamadas).toEqual([]);
    expect(freela.cupons.size).toBe(0);
  });
});

describe('cupom no Freela (L6b)', () => {
  it('aprovar com o contratante escolhido cria o cupom NO FREELA (100%, uso único, 30 dias) e o consultor vê o código', async () => {
    const { service, freela, repo } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    const v = await service.aprovar(
      a.view.id,
      { client_id: uuid(), contractor_user_id: 'user-bom-pao', contractor_name: 'Padaria Bom Pão LTDA' },
      DIEGO,
    );
    const code = codigoDoCupom(a.view.id);
    expect(v).toMatchObject({
      situacao: 'criado',
      coupon_status: 'criado',
      coupon_code: code,
      contractor_source: 'manual',
      contractor_name: 'Padaria Bom Pão LTDA',
    });
    const noFreela = freela.cupons.get(code)!;
    expect(noFreela).toMatchObject({
      contractorUserId: 'user-bom-pao',
      discountType: 'PERCENT',
      percentOff: 100,
      singleUse: true,
      active: true,
    });
    expect(new Date(noFreela.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect((await service.doConsultor(ANA)).items[0]).toMatchObject({
      coupon_code: code,
      coupon: { percent_off: 100, validade_dias: 30 },
    });
    expect(repo.eventosGravados.map((e) => e.type)).toEqual([
      'requested',
      'approved',
      'contractor_linked',
      'coupon_created',
    ]);
  });

  it('sem contratante: aguarda a empresa; o vínculo manual cria o cupom', async () => {
    const { service, freela } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    expect(await service.aprovar(a.view.id, { client_id: uuid() }, DIEGO)).toMatchObject({
      situacao: 'aguardando_empresa',
      coupon_code: null,
    });
    freela.contratantes = [
      { userId: 'u-bar', name: 'Padaria Bom Pão', city: 'BH', module: 'bars-restaurants' },
      { userId: 'u-casa', name: 'Padaria Bom Pão (casa)', city: 'BH', module: 'home-services' },
    ];
    expect(await service.candidatos(a.view.id)).toEqual({
      q: 'Padaria Bom Pão',
      items: [{ user_id: 'u-bar', name: 'Padaria Bom Pão', city: 'BH' }],
    });
    const c = uuid();
    const v = await service.vincular(
      a.view.id,
      { client_id: c, contractor_user_id: 'u-bar', contractor_name: 'Padaria Bom Pão' },
      DIEGO,
    );
    expect(v).toMatchObject({ situacao: 'criado', contractor_user_id: 'u-bar' });
    await expect(
      service.vincular(a.view.id, { client_id: c, contractor_user_id: 'u-bar' }, DIEGO),
    ).resolves.toMatchObject({ situacao: 'criado' });
    await expect(
      service.vincular(a.view.id, { client_id: uuid(), contractor_user_id: 'u-bar' }, DIEGO),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
  });

  it('timeout seguido de adoção: a 1ª tentativa criou mas não respondeu (e a releitura também caiu); a seguinte adota o MESMO cupom', async () => {
    const { service, cupons, freela, repo } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    freela.proximas = ['criar_e_timeout', 'lista_timeout'];
    const v = await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO);
    expect(v).toMatchObject({
      coupon_status: 'aguardando_freela',
      coupon_error_code: 'FREELA_UNREACHABLE',
      coupon_attempts: 1,
    });
    expect(freela.cupons.size).toBe(1);
    const depois = new Date(Date.now() + 3 * 60_000);
    expect(await cupons.rodada(depois)).toMatchObject({ tentados: 1, criados: 1 });
    expect(repo.vouchers.get(a.view.id)).toMatchObject({
      coupon_status: 'criado',
      coupon_id: freela.cupons.get(codigoDoCupom(a.view.id))!.id,
      coupon_error_code: null,
    });
    expect(freela.cupons.size).toBe(1);
    expect(repo.eventosGravados.at(-1)?.type).toBe('coupon_adopted');
  });

  it('timeout com a releitura funcionando adota na hora; 5xx sem cupom criado fica para depois', async () => {
    const { service, freela, repo } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    freela.proximas = ['criar_e_timeout'];
    expect(
      await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO),
    ).toMatchObject({ coupon_status: 'criado' });
    expect(repo.eventosGravados.at(-1)?.type).toBe('coupon_adopted');
    const b = await service.pedir(ANA, pedido({ lead_id: LEAD_A2 }));
    freela.proximas = ['500'];
    expect(
      await service.aprovar(b.view.id, { client_id: uuid(), contractor_user_id: 'u2' }, DIEGO),
    ).toMatchObject({ coupon_status: 'aguardando_freela', coupon_error_code: 'FREELA_5XX' });
  });

  it('o mesmo código no Freela para OUTRO contratante = erro fixo COUPON_CODE_CONFLICT, e o relógio não repete', async () => {
    const { service, cupons, freela } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    const code = codigoDoCupom(a.view.id);
    freela.cupons.set(code, {
      id: 'alheio',
      code,
      discountType: 'PERCENT',
      percentOff: 100,
      amountOffInCents: null,
      contractorUserId: 'outra-empresa',
      singleUse: true,
      active: true,
      expiresAt: null,
      redeemedAt: null,
    });
    const v = await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO);
    expect(v).toMatchObject({
      situacao: 'erro',
      coupon_status: 'erro',
      coupon_error_code: 'COUPON_CODE_CONFLICT',
    });
    expect(v.coupon_error).not.toMatch(/outra-empresa/);
    const antes = freela.chamadas.length;
    await cupons.rodada(new Date(Date.now() + 2 * 3_600_000));
    expect(freela.chamadas.filter((c) => c.startsWith('create')).length).toBe(
      freela.chamadas.slice(0, antes).filter((c) => c.startsWith('create')).length,
    );
    expect(freela.cupons.get(code)!.contractorUserId).toBe('outra-empresa');
  });

  it('recusa 4xx = erro FREELA_REJECTED; "Tentar agora" volta para a fila e tenta já', async () => {
    const { service, freela } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    freela.proximas = ['422'];
    expect(
      await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO),
    ).toMatchObject({ coupon_status: 'erro', coupon_error_code: 'FREELA_REJECTED' });
    expect(await service.tentarDeNovo(a.view.id, DIEGO)).toMatchObject({ coupon_status: 'criado' });
  });

  it('Freela sem configuração: aguardando_freela ("aguardando conexão"), nenhuma chamada, aviso no máximo 1×/hora', async () => {
    const { service, cupons, freela } = montar({ cupons: true, configurado: false });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const a = await service.pedir(ANA, pedido());
      const v = await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO);
      expect(v).toMatchObject({
        situacao: 'aguardando_freela',
        coupon_error_code: 'FREELA_NOT_CONFIGURED',
        coupon_error: 'Aprovado — aguardando conexão com o Freela.',
        coupon_attempts: 0,
      });
      expect((await service.listar({})).freela_configured).toBe(false);
      const t0 = new Date();
      await cupons.rodada(new Date(t0.getTime() + 10 * 60_000));
      await cupons.avisarSemConexao(new Date(t0.getTime() + 30 * 60_000));
      expect(warn).toHaveBeenCalledTimes(1);
      await cupons.avisarSemConexao(new Date(t0.getTime() + 61 * 60_000));
      expect(warn).toHaveBeenCalledTimes(2);
      expect(freela.chamadas).toEqual([]);
      freela.configurado = true;
      await cupons.rodada(new Date(t0.getTime() + 62 * 60_000));
      expect(freela.cupons.size).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('um cupom do Praça por contratante: outro pedido com a mesma conta = 409 CONTRACTOR_ALREADY_HAS_COUPON (também com o vencido)', async () => {
    const { service, repo } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO);
    const b = await service.pedir(BIA, pedido({ lead_id: LEAD_A2 }));
    await expect(
      service.aprovar(b.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CONTRACTOR_ALREADY_HAS_COUPON' } });
    expect(repo.vouchers.get(b.view.id)!.status).toBe('pendente');
    repo.vouchers.get(a.view.id)!.coupon_status = 'vencido';
    await expect(
      service.aprovar(b.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO),
    ).rejects.toMatchObject({ response: { code: 'CONTRACTOR_ALREADY_HAS_COUPON' } });
  });

  it('o índice parcial segura a corrida que passou pela conferência (P2002 → 409, nada muda)', async () => {
    const { service, repo } = montar({ cupons: true, configurado: false });
    const a = await service.pedir(ANA, pedido());
    const b = await service.pedir(BIA, pedido({ lead_id: LEAD_A2 }));
    const espiao = jest.spyOn(repo, 'comCupomDoContratante').mockResolvedValue(null);
    await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO);
    await expect(
      service.aprovar(b.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO),
    ).rejects.toMatchObject({ response: { code: 'CONTRACTOR_ALREADY_HAS_COUPON' } });
    expect(repo.vouchers.get(b.view.id)).toMatchObject({ status: 'pendente', contractor_user_id: null });
    expect(repo.eventosGravados.filter((e) => e.voucher_id === b.view.id).map((e) => e.type)).toEqual([
      'requested',
    ]);
    espiao.mockRestore();
  });

  it('vínculo automático só com as flags da F6/F7 (nunca por nome)', async () => {
    const semFlags = montar({ cupons: true });
    semFlags.repo.cadastros.set(LEAD_A, 'u-cadastro');
    const a = await semFlags.service.pedir(ANA, pedido());
    expect(await semFlags.service.aprovar(a.view.id, { client_id: uuid() }, DIEGO)).toMatchObject({
      coupon_status: 'aguardando_vinculo',
    });

    const comCadastro = montar({ cupons: true, cadastro: true });
    comCadastro.repo.cadastros.set(LEAD_A, 'u-cadastro');
    const b = await comCadastro.service.pedir(ANA, pedido());
    expect(await comCadastro.service.aprovar(b.view.id, { client_id: uuid() }, DIEGO)).toMatchObject({
      coupon_status: 'criado',
      contractor_source: 'company_signup',
      contractor_user_id: 'u-cadastro',
    });

    const comSync = montar({ cupons: true, sync: true });
    const c = await comSync.service.pedir(ANA, pedido());
    await comSync.service.aprovar(c.view.id, { client_id: uuid() }, DIEGO);
    comSync.repo.syncs.set(LEAD_A, 'u-sync');
    expect(await comSync.cupons.rodada()).toMatchObject({ vinculados: 1, criados: 1 });
    expect(comSync.repo.vouchers.get(c.view.id)).toMatchObject({
      contractor_source: 'signup_sync',
      coupon_status: 'criado',
    });
  });

  it('leitura do estado a cada voucher_sync_min: usado, devolvido, vencido e desativado', async () => {
    const { service, cupons, freela, repo } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO);
    const code = codigoDoCupom(a.view.id);
    const t0 = Date.now();
    freela.resgatar(code);
    expect(await cupons.lerEstado(new Date(t0 + 10 * 60_000))).toBe(0);
    expect(await cupons.lerEstado(new Date(t0 + 31 * 60_000))).toBe(1);
    expect(repo.vouchers.get(a.view.id)).toMatchObject({
      coupon_status: 'usado',
      redeemed_at: new Date('2026-10-23T15:00:00.000Z'),
    });
    freela.devolver(code);
    await cupons.lerEstado(new Date(t0 + 62 * 60_000));
    expect(repo.vouchers.get(a.view.id)!.coupon_status).toBe('criado');
    freela.cupons.get(code)!.expiresAt = new Date(t0 + 60 * 60_000).toISOString();
    await cupons.lerEstado(new Date(t0 + 93 * 60_000));
    expect(repo.vouchers.get(a.view.id)!.coupon_status).toBe('vencido');
    expect(repo.eventosGravados.slice(-3).map((e) => e.type)).toEqual([
      'coupon_redeemed',
      'coupon_unredeemed',
      'coupon_expired',
    ]);

    const b = await service.pedir(ANA, pedido({ lead_id: LEAD_A2 }));
    await service.aprovar(b.view.id, { client_id: uuid(), contractor_user_id: 'u2' }, DIEGO);
    freela.cupons.get(codigoDoCupom(b.view.id))!.active = false;
    await cupons.lerEstado(new Date(t0 + 200 * 60_000));
    expect(repo.vouchers.get(b.view.id)!.coupon_status).toBe('desativado');
  });

  it('desativar: PATCH active=false no Freela e só então desativado', async () => {
    const { service, freela } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO);
    const v = await service.desativar(a.view.id, { client_id: uuid(), reason: 'Empresa fechou' }, DIEGO);
    expect(v).toMatchObject({ coupon_status: 'desativado', situacao: 'desativado' });
    expect(freela.cupons.get(codigoDoCupom(a.view.id))!.active).toBe(false);
    await expect(
      service.desativar(a.view.id, { client_id: uuid(), reason: 'De novo' }, DIEGO),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
  });
});

describe('painel (§38.8)', () => {
  it('pedidos do período e a situação de cada um agora', async () => {
    const { service } = montar({ cupons: true });
    const a = await service.pedir(ANA, pedido());
    const b = await service.pedir(ANA, pedido({ lead_id: LEAD_A2 }));
    await service.pedir(CAIO, pedido({ lead_id: LEAD_B }));
    await service.aprovar(a.view.id, { client_id: uuid(), contractor_user_id: 'u1' }, DIEGO);
    await service.reprovar(b.view.id, { client_id: uuid(), reason: 'Fora do perfil' }, DIEGO);
    const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    expect(await service.resumoPainel(hoje, hoje)).toEqual({
      requested: 3,
      pending: 1,
      approved: 1,
      rejected: 1,
      coupons_created: 1,
    });
    expect(await service.resumoPainel(hoje, hoje, PRACA_B)).toEqual({
      requested: 1,
      pending: 1,
      approved: 0,
      rejected: 0,
      coupons_created: 0,
    });
  });
});
