import { CampoAutocloseScheduler } from '../campo-autoclose.scheduler';
import type { JourneysService } from '../journeys.service';

describe('CampoAutocloseScheduler', () => {
  it('fecha o que venceu e nunca deixa o erro sair do @Cron', async () => {
    const closeStale = jest.fn().mockRejectedValueOnce(new Error('banco fora')).mockResolvedValueOnce({ journeys: 1, visits: 0 });
    const s = new CampoAutocloseScheduler({ closeStale } as unknown as JourneysService);

    await expect(s.tick()).resolves.toBeUndefined();
    await expect(s.tick()).resolves.toBeUndefined();
    expect(closeStale).toHaveBeenCalledTimes(2);
  });
});
