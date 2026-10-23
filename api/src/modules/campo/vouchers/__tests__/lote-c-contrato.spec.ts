/**
 * Lote C da Lovable (contrato §36, §38): migrações aditivas, rotas e permissões, ordem dos controllers, corpos do web pelo
 * `ValidationPipe` global (lição da S1: campo novo nulo não gera 400/422), imutabilidade e flags.
 */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ADMIN_ONLY_KEY } from '../../../../common/decorators/admin-only.decorator';
import { CAMPO_ROUTE_KEY } from '../../../../common/decorators/campo-route.decorator';
import { CONFIG_PAINEL, montarPainel } from '../../../../domain/painel-rules';
import { PutSegmentsDto } from '../../../places/dto/places.dto';
import { RotasConfigController } from '../../../rotas/rotas-equipe.controller';
import { lerFlagsLovableC } from '../../../rotas/rotas.tokens';
import {
  AprovarVoucherDto,
  ConfigVoucherDto,
  PedirVoucherDto,
  ReprovarVoucherDto,
  VincularContratanteDto,
  VouchersQueryDto,
} from '../dto/vouchers.dto';
import { VouchersCampoController, VouchersEquipeController } from '../vouchers.controller';
import { PrismaVouchersRepository } from '../vouchers.repository';

const RAIZ = join(__dirname, '..', '..', '..', '..', '..');
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const corpo = (metatype: new () => object, body: unknown, type: 'body' | 'query' = 'body') =>
  pipe.transform(body, { type, metatype });
const C = '11111111-1111-4111-8111-111111111111';

describe('migrações do lote C', () => {
  // Sem os comentários (que AVISAM para não derrubar os índices parciais).
  const ler = (n: string) =>
    readFileSync(join(RAIZ, `prisma/migrations/${n}/migration.sql`), 'utf8').replace(/--.*$/gm, '');
  const sql5 = ler('20261030100000_lovable_l5_segmentos');
  const sql6 = ler('20261031100000_lovable_l6_cupons');
  it('são aditivas e não derrubam índice nenhum (nem os parciais)', () => {
    for (const sql of [sql5, sql6]) {
      expect(sql).not.toMatch(/DROP\s+INDEX/i);
      expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    }
    expect(sql5).toMatch(/ALTER TABLE "app_settings" ADD COLUMN\s+"place_segments" JSONB;/);
    expect(sql5).toMatch(/ALTER TABLE "place_import_runs" ADD COLUMN\s+"segments_snapshot" JSONB;/);
    expect(sql6).not.toMatch(/ALTER TABLE "(?!field_voucher)/);
  });
  it('índice parcial de um cupom por contratante, triggers de imutabilidade e CHECKs', () => {
    expect(sql6).toContain(
      `CREATE UNIQUE INDEX "field_vouchers_one_coupon_per_contractor" ON "field_vouchers"("contractor_user_id") WHERE "coupon_status" IN ('aguardando_freela', 'criado', 'usado');`,
    );
    expect(sql6).toContain(
      'CREATE TRIGGER "field_vouchers_guard" BEFORE UPDATE OR DELETE ON "field_vouchers"',
    );
    expect(sql6).toContain(
      'CREATE TRIGGER "field_voucher_events_immutable" BEFORE UPDATE OR DELETE ON "field_voucher_events"',
    );
    expect(sql6).toContain('"lead_id" UUID NOT NULL');
    expect(sql6).toMatch(/field_vouchers_lead_id_fkey.*ON DELETE RESTRICT/);
    expect(sql6).toMatch(/field_vouchers_consultant_id_fkey.*ON DELETE RESTRICT/);
    for (const t of [
      'requested',
      'approved',
      'rejected',
      'contractor_linked',
      'coupon_created',
      'coupon_adopted',
      'coupon_failed',
      'coupon_retried',
      'coupon_redeemed',
      'coupon_unredeemed',
      'coupon_expired',
      'coupon_deactivated',
    ]) {
      expect(sql6).toContain(`'${t}'`);
    }
  });
  it('vêm depois da última migração do lote B, nesta ordem', () => {
    const nomes = readdirSync(join(RAIZ, 'prisma/migrations'))
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
    expect(nomes.slice(-2)).toEqual([
      '20261030100000_lovable_l5_segmentos',
      '20261031100000_lovable_l6_cupons',
    ]);
    expect('20261030100000' > '20261029100000').toBe(true);
  });
  it('o CLAUDE.md lista o índice parcial novo', () => {
    expect(readFileSync(join(RAIZ, '..', 'CLAUDE.md'), 'utf8')).toContain(
      'field_vouchers_one_coupon_per_contractor',
    );
  });
});

describe('rotas e permissões (§38.3, §38.4)', () => {
  const adminOnly = (alvo: object, nome: string) =>
    Reflect.getMetadata(ADMIN_ONLY_KEY, (alvo as Record<string, object>)[nome]) === true;
  const proto = VouchersEquipeController.prototype as unknown as Record<string, object>;
  it('toda escrita da equipe é só admin; leitura é da equipe (o gestor é a fase L10)', () => {
    for (const n of [
      'salvarConfig',
      'aprovar',
      'reprovar',
      'candidatos',
      'vincular',
      'tentarDeNovo',
      'desativar',
    ])
      expect(adminOnly(proto, n)).toBe(true);
    for (const n of ['listar', 'config', 'detalhe']) expect(adminOnly(proto, n)).toBe(false);
  });
  it('as rotas do consultor são @CampoRoute e as da equipe não', () => {
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, VouchersCampoController)).toBeTruthy();
    expect(Reflect.getMetadata(CAMPO_ROUTE_KEY, VouchersEquipeController)).toBeFalsy();
  });
  it("'config' vem antes de ':id' e o controller vem antes do ConsultoresController", () => {
    const t = readFileSync(join(RAIZ, 'src/modules/campo/vouchers/vouchers.controller.ts'), 'utf8');
    expect(t.indexOf("@Get('config')")).toBeLessThan(t.indexOf("@Get(':id')"));
    const mod = readFileSync(join(RAIZ, 'src/modules/campo/campo.module.ts'), 'utf8');
    expect(mod.indexOf('VouchersEquipeController,')).toBeLessThan(mod.indexOf('ConsultoresController,'));
  });
});

describe('corpos do web pelo ValidationPipe global (lição da S1)', () => {
  it('pedido: com lead_id ou só com visit_ref; nulos = ausentes; campo a mais recusado', async () => {
    const base = { client_id: C, segment: 'Padaria', freelas_per_week: 3 };
    await expect(corpo(PedirVoucherDto, { ...base, lead_id: C })).resolves.toBeDefined();
    await expect(
      corpo(PedirVoucherDto, { ...base, lead_id: null, visit_ref: C, uf: null, city: null }),
    ).resolves.toBeDefined();
    for (const ruim of [
      { ...base, lead_id: C, extra: 1 },
      { ...base, lead_id: C, freelas_per_week: -1 },
      { ...base, lead_id: C, freelas_per_week: '3' },
      { ...base, lead_id: C, segment: '' },
      { ...base, lead_id: C, uf: 'Minas' },
      { ...base, client_id: 'x', lead_id: C },
      { ...base, lead_id: C, phone: '31999990000' },
    ]) {
      await expect(corpo(PedirVoucherDto, ruim)).rejects.toBeDefined();
    }
  });
  it('decisões: nulos = ausentes; contractor_user_id com caractere estranho é recusado', async () => {
    await expect(
      corpo(AprovarVoucherDto, { client_id: C, note: null, contractor_user_id: null, contractor_name: null }),
    ).resolves.toBeDefined();
    await expect(
      corpo(AprovarVoucherDto, { client_id: C, contractor_user_id: 'u-1_A' }),
    ).resolves.toBeDefined();
    await expect(corpo(AprovarVoucherDto, { client_id: C, contractor_user_id: 'a"b' })).rejects.toBeDefined();
    await expect(corpo(ReprovarVoucherDto, { client_id: C, reason: null })).resolves.toBeDefined();
    await expect(
      corpo(VincularContratanteDto, { client_id: C, contractor_user_id: 'u1', contractor_name: null }),
    ).resolves.toBeDefined();
    await expect(corpo(VincularContratanteDto, { client_id: C })).rejects.toBeDefined();
  });
  it('configuração: as 9 chaves passam (inclusive nulas); chave desconhecida é recusada', async () => {
    const tudo = {
      max_por_empresa: 1,
      discount_type: 'PERCENT',
      percent_off: 100,
      amount_off_cents: null,
      single_use: true,
      validade_dias: null,
      min_job_hours: null,
      motivo_reprovacao: 'obrigatorio',
      voucher_sync_min: 30,
    };
    expect(await corpo(ConfigVoucherDto, tudo)).toEqual(tudo);
    await expect(corpo(ConfigVoucherDto, { ...tudo, coisa: 1 })).rejects.toBeDefined();
  });
  it('filtros da lista e PUT dos segmentos', async () => {
    await expect(
      corpo(VouchersQueryDto, { situacao: 'pedido', from: '2026-10-01', to: '2026-10-22' }, 'query'),
    ).resolves.toBeDefined();
    await expect(corpo(VouchersQueryDto, { situacao: 'outra' }, 'query')).rejects.toBeDefined();
    await expect(corpo(PutSegmentsDto, { segments: [{ slug: 'bar' }] })).resolves.toBeDefined();
    await expect(corpo(PutSegmentsDto, { segments: 'x' })).rejects.toBeDefined();
  });
});

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory()
      ? n === 'node_modules' || n === 'dist'
        ? []
        : arquivos(p)
      : p.endsWith('.ts') && !p.includes('__tests__')
        ? [p]
        : [];
  });
}

describe('imutabilidade dos pedidos de cupom', () => {
  it('nenhum código altera ou apaga eventos, nem apaga pedidos; o único update é o compare-and-set do repositório', () => {
    const proibido =
      /(field_voucher_events\s*\.\s*(update|updateMany|delete|deleteMany|upsert)|field_vouchers\s*\.\s*(update|delete|deleteMany|upsert))\b/;
    const cru = /(UPDATE|DELETE\s+FROM|TRUNCATE)\s+"?(field_voucher_events|field_vouchers)\b/i;
    const fontes = arquivos(join(RAIZ, 'src'));
    expect(
      fontes.filter((f) => proibido.test(readFileSync(f, 'utf8')) || cru.test(readFileSync(f, 'utf8'))),
    ).toEqual([]);
    expect(
      fontes
        .filter((f) => /field_vouchers\s*\.\s*updateMany/.test(readFileSync(f, 'utf8')))
        .map((f) => f.split('/').pop()),
    ).toEqual(['vouchers.repository.ts']);
  });
  it('o repositório não expõe método de apagar/editar', () => {
    const metodos = Object.getOwnPropertyNames(PrismaVouchersRepository.prototype);
    expect(metodos.filter((n) => /delete|remove|apagar|editar|upsert|update/i.test(n))).toEqual([]);
  });
});

describe('flags do lote C', () => {
  const BASE = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32) };
  it('FIELD_VOUCHER_COUPONS_ENABLED só vale com FIELD_VOUCHERS_ENABLED', () => {
    expect(lerFlagsLovableC(BASE)).toEqual({ segments: false, vouchers: false, voucher_coupons: false });
    expect(lerFlagsLovableC({ ...BASE, FIELD_VOUCHER_COUPONS_ENABLED: 'true' }).voucher_coupons).toBe(false);
    expect(
      lerFlagsLovableC({
        ...BASE,
        FIELD_VOUCHERS_ENABLED: 'true',
        FIELD_VOUCHER_COUPONS_ENABLED: 'true',
        FIELD_SEGMENTS_ENABLED: 'true',
      }),
    ).toEqual({ segments: true, vouchers: true, voucher_coupons: true });
  });
  it('GET settings/config: features do lote C (aditivas; desligadas por padrão)', async () => {
    const config = { view: jest.fn().mockResolvedValue({}) };
    const off = await new RotasConfigController(config as never).get();
    expect(off.features).toMatchObject({ segments: false, vouchers: false, voucher_coupons: false });
    const on = await new RotasConfigController(config as never, undefined, undefined, {
      segments: true,
      vouchers: true,
      voucher_coupons: false,
    }).get();
    expect(on.features).toMatchObject({ segments: true, vouchers: true, voucher_coupons: false });
  });
});

describe('painel (§38.8)', () => {
  const entrada = {
    consultores: [],
    visitas: [],
    paradas: { planejadas: 0, visitadas: 0 },
    cadastros: new Map<string, number>(),
    fonteCadastros: 'declared' as const,
    syncLigado: false,
    pracasAbertas: 1,
    leadsMapeados: 0,
    leadsSemLocalizacao: 0,
    cfg: CONFIG_PAINEL.padrao,
  };
  it('sem a entrada de cupons (flag desligada) = o cartão de hoje', () => {
    const p = montarPainel(entrada);
    expect(p.kpis.vouchers).toBeNull();
    expect(p.conta.vouchers).toBe('Não ligado neste servidor.');
  });
  it('com cupons: o número, a conta (as parcelas somam os pedidos) e a fonte', () => {
    const cupons = { requested: 5, pending: 2, approved: 2, rejected: 1, coupons_created: 1 };
    const sem = montarPainel({ ...entrada, cupons });
    expect(sem.kpis.vouchers).toEqual(cupons);
    expect(sem.conta.vouchers).toBe('5 pedidos no período: 2 aprovados, 2 esperando aprovação, 1 reprovado.');
    const com = montarPainel({ ...entrada, cupons, cuponsNoFreela: true });
    expect(com.conta.vouchers).toBe(
      '5 pedidos no período: 2 aprovados, 2 esperando aprovação, 1 reprovado; 1 cupom criado no Freela.',
    );
    expect(com.fonte.vouchers).toMatch(/Pedidos de cupom da 1ª contratação/);
  });
});

describe('porta do cupom (§38.1)', () => {
  it('com FIELD_VOUCHER_COUPONS_ENABLED desligada entra o NoopIssuer, que nunca chama o Freela', async () => {
    const { voucherIssuerProvider, NoopIssuer, FreelaCouponIssuer } = await import('../vouchers.tokens');
    const cliente = {
      isConfigured: jest.fn(),
      createCoupon: jest.fn(),
      listCoupons: jest.fn(),
      updateCoupon: jest.fn(),
      searchContractors: jest.fn(),
    };
    const fab = (voucherIssuerProvider as unknown as { useFactory: (c: unknown, f: unknown) => unknown })
      .useFactory;
    const off = fab(cliente, { segments: false, vouchers: true, voucher_coupons: false }) as InstanceType<
      typeof NoopIssuer
    >;
    expect(off).toBeInstanceOf(NoopIssuer);
    expect(off.ativo).toBe(false);
    expect(off.configurado()).toBe(false);
    expect(() => off.criar()).toThrow(/NoopIssuer/);
    expect(Object.values(cliente).every((f) => f.mock.calls.length === 0)).toBe(true);
    expect(fab(cliente, { segments: false, vouchers: true, voucher_coupons: true })).toBeInstanceOf(
      FreelaCouponIssuer,
    );
  });
});
