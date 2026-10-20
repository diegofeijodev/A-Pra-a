import { Logger } from '@nestjs/common';
import type { FreelaClient } from '../../freela/freela-client';
import { listaCadastrosSchema } from '../../freela/freela-registrations';
import { SignupSyncScheduler } from '../signup-sync.scheduler';
import type { SignupSyncService } from '../signup-sync.service';

const MANHA = new Date('2026-10-20T13:00:00.000Z'); // 10:00 em Brasília
const MADRUGADA = new Date('2026-10-20T07:00:00.000Z'); // 04:00 em Brasília

function montar(o: { ligado?: boolean; configurado?: boolean; rodar?: jest.Mock } = {}) {
  const rodar = o.rodar ?? jest.fn(async () => ({ consultores: 1, itens: 2, erros: 0, interrompido429: false }));
  const s = new SignupSyncScheduler(
    { rodar } as unknown as SignupSyncService,
    { isConfigured: () => o.configurado ?? true } as unknown as FreelaClient,
    { ligado: o.ligado ?? true, intervaloMin: 10, janelaDias: 45 },
  );
  return { s, rodar };
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('SignupSyncScheduler', () => {
  it('flag desligada ou Freela sem configuração: não roda', async () => {
    const a = montar({ ligado: false });
    await a.s.tick(MANHA);
    const b = montar({ configurado: false });
    await b.s.tick(MANHA);
    expect(a.rodar).not.toHaveBeenCalled();
    expect(b.rodar).not.toHaveBeenCalled();
  });
  it('fora de 06–23h de Brasília não roda', async () => {
    const t = montar();
    await t.s.tick(MADRUGADA);
    expect(t.rodar).not.toHaveBeenCalled();
  });
  it('respeita o intervalo mínimo', async () => {
    const t = montar();
    await t.s.tick(MANHA);
    await t.s.tick(new Date(MANHA.getTime() + 5 * 60_000));
    expect(t.rodar).toHaveBeenCalledTimes(1);
    await t.s.tick(new Date(MANHA.getTime() + 10 * 60_000));
    expect(t.rodar).toHaveBeenCalledTimes(2);
  });
  it('não reentra enquanto uma rodada está em andamento', async () => {
    let solta!: () => void;
    const rodar = jest.fn(() => new Promise((r) => (solta = () => r({ consultores: 0, itens: 0, erros: 0, interrompido429: false }))));
    const t = montar({ rodar });
    const p = t.s.tick(MANHA);
    await t.s.tick(new Date(MANHA.getTime() + 11 * 60_000));
    expect(rodar).toHaveBeenCalledTimes(1);
    solta();
    await p;
  });
  it('o erro nunca sai do @Cron e não vaza a mensagem para o log', async () => {
    const t = montar({ rodar: jest.fn(async () => { throw new Error('telefone +5511987654321'); }) });
    await expect(t.s.tick(MANHA)).resolves.toBeUndefined();
    const msgs = (Logger.prototype.error as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(msgs.join(' ')).not.toMatch(/5511/);
  });
});

describe('contrato da lista do Freela', () => {
  it('aceita source null e activatedAt null', () => {
    const r = listaCadastrosSchema.safeParse({
      data: [{ userId: 'u', companyName: 'X', source: null, createdAt: '2026-10-18T10:00:00.000Z', activatedAt: null, status: 'pending' }],
      nextCursor: null,
    });
    expect(r.success).toBe(true);
  });
});
