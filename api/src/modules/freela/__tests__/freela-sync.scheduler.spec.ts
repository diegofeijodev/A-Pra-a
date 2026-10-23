import type { CampoFreelaService } from '../../campo/campo-freela.service';
import type { FreelaCampaignsService } from '../freela-campaigns.service';
import type { FreelaClient } from '../freela-client';
import type { FreelaOutboxService } from '../freela-outbox.service';
import { FreelaSyncScheduler } from '../freela-sync.scheduler';

function montar(configurado = true) {
  const client = { syncEnabled: () => true, isConfigured: () => configurado };
  const outbox = { flush: jest.fn().mockRejectedValue(new Error('outbox caiu')) };
  const campaigns = { syncAll: jest.fn() };
  const campo = { retryPending: jest.fn().mockResolvedValue(0) };
  const s = new FreelaSyncScheduler(
    client as unknown as FreelaClient,
    outbox as unknown as FreelaOutboxService,
    campaigns as unknown as FreelaCampaignsService,
    campo as unknown as CampoFreelaService,
  );
  return { s, campo };
}

describe('FreelaSyncScheduler — código dos consultores de campo', () => {
  it('falha do outbox não segura o código pendente dos consultores', async () => {
    const { s, campo } = montar();
    await s.tick();
    expect(campo.retryPending).toHaveBeenCalledTimes(1);
  });

  it('sem conexão configurada, nada roda', async () => {
    const { s, campo } = montar(false);
    await s.tick();
    expect(campo.retryPending).not.toHaveBeenCalled();
  });
});

describe('FreelaSyncScheduler — cupons da 1ª contratação (§38.7)', () => {
  function comCupons(configurado: boolean) {
    const client = { syncEnabled: () => true, isConfigured: () => configurado };
    const outbox = { flush: jest.fn().mockResolvedValue({ campaigns: 0, sends: 0, failed: 0, start_pending: 0 }) };
    const campaigns = { syncAll: jest.fn() };
    const campo = { retryPending: jest.fn().mockResolvedValue(0) };
    const cupons = { rodada: jest.fn().mockRejectedValue(new Error('cupons caiu')), avisarSemConexao: jest.fn().mockResolvedValue(undefined) };
    const s = new FreelaSyncScheduler(
      client as unknown as FreelaClient,
      outbox as unknown as FreelaOutboxService,
      campaigns as unknown as FreelaCampaignsService,
      campo as unknown as CampoFreelaService,
      cupons as never,
    );
    return { s, campo, cupons };
  }

  it('com a conexão: roda a rodada dos cupons num try próprio (a falha dela não derruba o relógio)', async () => {
    const { s, campo, cupons } = comCupons(true);
    await expect(s.tick()).resolves.toBeUndefined();
    expect(campo.retryPending).toHaveBeenCalledTimes(1);
    expect(cupons.rodada).toHaveBeenCalledTimes(1);
    expect(cupons.avisarSemConexao).not.toHaveBeenCalled();
  });

  it('sem a conexão: só o aviso (no máximo 1×/h, decidido no serviço), nada chama o Freela', async () => {
    const { s, campo, cupons } = comCupons(false);
    await s.tick();
    expect(cupons.avisarSemConexao).toHaveBeenCalledTimes(1);
    expect(cupons.rodada).not.toHaveBeenCalled();
    expect(campo.retryPending).not.toHaveBeenCalled();
  });
});
