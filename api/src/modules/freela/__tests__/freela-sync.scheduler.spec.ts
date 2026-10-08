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
