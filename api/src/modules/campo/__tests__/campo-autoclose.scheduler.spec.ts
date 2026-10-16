import { CampoAutocloseScheduler } from '../campo-autoclose.scheduler';
import type { JourneysService } from '../journeys.service';
import type { VouchersService } from '../vouchers.service';

describe('CampoAutocloseScheduler', () => {
  it('fecha o que venceu e nunca deixa o erro sair do @Cron', async () => {
    const closeStale = jest.fn().mockRejectedValueOnce(new Error('banco fora')).mockResolvedValueOnce({ journeys: 1, visits: 0 });
    const expire = jest.fn().mockResolvedValue(0);
    const s = new CampoAutocloseScheduler({ closeStale } as unknown as JourneysService, { expire } as unknown as VouchersService);

    await expect(s.tick()).resolves.toBeUndefined();
    await expect(s.tick()).resolves.toBeUndefined();
    expect(closeStale).toHaveBeenCalledTimes(2);
  });

  it('expira os vouchers vencidos junto com o fechamento (§21.7)', async () => {
    const expire = jest.fn().mockResolvedValue(2);
    const s = new CampoAutocloseScheduler(
      { closeStale: jest.fn().mockResolvedValue({ journeys: 0, visits: 0 }) } as unknown as JourneysService,
      { expire } as unknown as VouchersService,
    );
    await s.tick();
    expect(expire).toHaveBeenCalledTimes(1);
  });
});
