import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { validateEnv } from '../../../../common/config/env.validation';
import { REGRA_PADRAO, validarRegra } from '../../../../domain/earnings-rules';
import { EarningsCampoController, EarningsEquipeController } from '../earnings.controller';
import { EarningsLigadoGuard } from '../earnings.guard';
import { PrismaEarningsRepository } from '../earnings.repository';
import { EarningsScheduler } from '../earnings.scheduler';
import { EarningsService } from '../earnings.service';

const RAIZ = join(__dirname, '..', '..', '..', '..', '..');
const BASE = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === 'node_modules' || n === 'dist' ? [] : arquivos(p)) : p.endsWith('.ts') && !p.includes('__tests__') ? [p] : [];
  });
}

describe('imutabilidade do razão', () => {
  it('nenhum código escreve no razão, nas versões ou nos fechamentos além de INSERT', () => {
    const proibido = /(field_earnings_ledger|field_pay_rule_versions|field_payout_periods)\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\b/;
    const ofensores = arquivos(join(RAIZ, 'src')).filter((f) => proibido.test(readFileSync(f, 'utf8')));
    expect(ofensores).toEqual([]);
  });

  it('nenhum SQL cru altera o razão', () => {
    const cru = /(UPDATE|DELETE\s+FROM|TRUNCATE)\s+"?(field_earnings_ledger|field_pay_rule_versions|field_payout_periods)/i;
    const ofensores = arquivos(join(RAIZ, 'src')).filter((f) => cru.test(readFileSync(f, 'utf8')));
    expect(ofensores).toEqual([]);
  });

  it('o repositório não expõe método de update/delete', () => {
    const metodos = new Set<string>();
    for (let p = PrismaEarningsRepository.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const n of Object.getOwnPropertyNames(p)) metodos.add(n);
    }
    expect([...metodos].filter((n) => /update|delete|remove|apagar|editar|alterar|upsert/i.test(n))).toEqual([]);
    expect(metodos.has('inserirLancamento')).toBe(false); // só dentro da transação (EarningsTx)
    expect(metodos.has('emTransacao')).toBe(true);
  });

  it('a migração protege o banco: trigger de append-only, chaves e CHECK de motivo', () => {
    const sql = readFileSync(join(RAIZ, 'prisma', 'migrations', '20261023100000_field_earnings', 'migration.sql'), 'utf8');
    expect(sql).toMatch(/CREATE TRIGGER "field_earnings_ledger_immutable" BEFORE UPDATE OR DELETE ON "field_earnings_ledger"/);
    expect(sql).toMatch(/CREATE TRIGGER "field_pay_rule_versions_immutable" BEFORE UPDATE OR DELETE/);
    expect(sql).toMatch(/CREATE TRIGGER "field_payout_periods_immutable" BEFORE UPDATE OR DELETE/);
    expect(sql).toMatch(/UNIQUE INDEX "field_earnings_ledger_consultant_id_payout_week_kind_idempo_key"/);
    expect(sql).toMatch(/UNIQUE INDEX "field_payout_periods_consultant_id_week_start_key"/);
    expect(sql).toMatch(/UNIQUE INDEX "field_earnings_ledger_reverses_id_key"/);
    expect(sql).toMatch(/"reason" IS NOT NULL AND length\(btrim\("reason"\)\) >= 3/);
    expect(sql).toMatch(/ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
    // os índices parciais do campo não são tocados
    expect(sql).not.toMatch(/DROP INDEX/);
    // dinheiro só em inteiro
    expect(sql).not.toMatch(/amount_cents"\s+(DOUBLE|REAL|NUMERIC|DECIMAL|FLOAT)/i);
  });

  it('a versão 1 gravada pela migração é exatamente o padrão do domínio', () => {
    const sql = readFileSync(join(RAIZ, 'prisma', 'migrations', '20261023100000_field_earnings', 'migration.sql'), 'utf8');
    const json = /'(\{"unit_cents".*?\})'::jsonb/s.exec(sql)?.[1];
    expect(json).toBeDefined();
    const seed = JSON.parse(json as string);
    expect(seed).toEqual(REGRA_PADRAO);
    expect(validarRegra(seed).ok).toBe(true);
  });
});

describe('flags (sem a flag, 404 e nada de job)', () => {
  it('flag desligada: o guard responde 404 EARNINGS_DISABLED', () => {
    const g = new EarningsLigadoGuard({ ligado: false, autoClose: false, janelaNaoConfirmadosDias: 45 });
    expect(() => g.canActivate()).toThrow(expect.objectContaining({ status: 404, response: expect.objectContaining({ code: 'EARNINGS_DISABLED' }) }));
    expect(new EarningsLigadoGuard({ ligado: true, autoClose: false, janelaNaoConfirmadosDias: 45 }).canActivate()).toBe(true);
  });

  it('as duas controllers estão atrás do guard; só a do consultor é @CampoRoute e só a da equipe tem escrita de admin', () => {
    const guards = (c: object): unknown[] => Reflect.getMetadata('__guards__', c) ?? [];
    expect(guards(EarningsEquipeController)).toContain(EarningsLigadoGuard);
    expect(guards(EarningsCampoController)).toContain(EarningsLigadoGuard);
    const campo = (c: object) => Reflect.getMetadataKeys(c).some((k) => String(k).toLowerCase().includes('campo'));
    expect(campo(EarningsCampoController)).toBe(true);
    expect(campo(EarningsEquipeController)).toBe(false);
    const admin = (n: string) => Reflect.getMetadata('adminOnly', EarningsEquipeController.prototype[n as keyof EarningsEquipeController]);
    for (const n of ['salvarConfig', 'fechar', 'reconciliar', 'ajustar', 'estornar']) expect(admin(n)).toBe(true);
    for (const n of ['config', 'simular', 'extrato']) expect(admin(n)).toBeUndefined();
  });

  it('env: as duas flags nascem desligadas', () => {
    const e = validateEnv(BASE);
    expect(e.FIELD_EARNINGS_ENABLED).toBe('false');
    expect(e.FIELD_EARNINGS_AUTOCLOSE_ENABLED).toBe('false');
    expect(validateEnv({ ...BASE, FIELD_EARNINGS_ENABLED: 'true' }).FIELD_EARNINGS_ENABLED).toBe('true');
  });
});

describe('EarningsScheduler', () => {
  const SEGUNDA_6H = new Date('2026-10-26T09:00:00.000Z');
  function montar(autoClose: boolean, o: { deve?: boolean; falha?: boolean } = {}) {
    const earnings = {
      deveFecharAgora: jest.fn().mockResolvedValue(o.deve ?? true),
      fecharEncerradas: jest.fn().mockImplementation(async () => {
        if (o.falha) throw new Error('boom com segredo');
        return { semanas: 1, fechados: 2, tardios: 0 };
      }),
    };
    const sch = new EarningsScheduler(earnings as unknown as EarningsService, { ligado: true, autoClose, janelaNaoConfirmadosDias: 45 });
    return { sch, earnings };
  }

  it('flag do fechamento desligada: não faz nada', async () => {
    const { sch, earnings } = montar(false);
    await sch.tick(SEGUNDA_6H);
    expect(earnings.deveFecharAgora).not.toHaveBeenCalled();
    expect(earnings.fecharEncerradas).not.toHaveBeenCalled();
  });

  it('fora do dia/hora configurados: não fecha', async () => {
    const { sch, earnings } = montar(true, { deve: false });
    await sch.tick(SEGUNDA_6H);
    expect(earnings.fecharEncerradas).not.toHaveBeenCalled();
  });

  it('no dia e hora: fecha uma vez por dia (rodar de novo no mesmo dia é ignorado)', async () => {
    const { sch, earnings } = montar(true);
    await sch.tick(SEGUNDA_6H);
    await sch.tick(new Date('2026-10-26T09:30:00.000Z'));
    expect(earnings.fecharEncerradas).toHaveBeenCalledTimes(1);
    await sch.tick(new Date('2026-11-02T09:00:00.000Z'));
    expect(earnings.fecharEncerradas).toHaveBeenCalledTimes(2);
  });

  it('reentrância: tick durante outro tick não dispara um segundo fechamento', async () => {
    const { sch, earnings } = montar(true);
    let liberar!: () => void;
    earnings.fecharEncerradas.mockImplementationOnce(() => new Promise((r) => (liberar = () => r({ semanas: 1, fechados: 0, tardios: 0 }))));
    const primeiro = sch.tick(SEGUNDA_6H);
    await new Promise((r) => setImmediate(r));
    await sch.tick(SEGUNDA_6H);
    liberar();
    await primeiro;
    expect(earnings.fecharEncerradas).toHaveBeenCalledTimes(1);
  });

  it('erro nunca sai do @Cron e não marca o dia como feito (tenta de novo na próxima batida)', async () => {
    const { sch, earnings } = montar(true, { falha: true });
    await expect(sch.tick(SEGUNDA_6H)).resolves.toBeUndefined();
    earnings.fecharEncerradas.mockResolvedValueOnce({ semanas: 1, fechados: 1, tardios: 0 });
    await sch.tick(new Date('2026-10-26T09:30:00.000Z'));
    expect(earnings.fecharEncerradas).toHaveBeenCalledTimes(2);
  });
});
