import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CONFIG_ROTA_PADRAO } from '../../../domain/rota-rules';
import { RotasConfigService } from '../rotas-config.service';
import { AGORA, fakePrisma } from './fixtures';

const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000dd', email: 'a@a.com', name: 'A', is_admin: true };
const falha = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e);

describe('RotasConfigService', () => {
  it('sem linha no banco: devolve os padrões e nenhum autor', async () => {
    const s = new RotasConfigService(fakePrisma() as unknown as PrismaService);
    expect(await s.view()).toEqual({ ...CONFIG_ROTA_PADRAO, atualizado_por: null, atualizado_em: null });
  });

  it('PUT parcial: mescla, grava quem/quando e preserva chaves de outras fases', async () => {
    const p = fakePrisma();
    p.app_settings.findUnique.mockResolvedValue({ field_config: { meta_diaria: 25, inatividade_min: 30 } });
    const s = new RotasConfigService(p as unknown as PrismaService);
    await s.atualizar({ minutos_por_visita: 10 }, ADMIN, AGORA);
    const gravado = p.app_settings.upsert.mock.calls[0][0].update.field_config;
    expect(gravado).toMatchObject({ meta_diaria: 25, minutos_por_visita: 10, inatividade_min: 30, atualizado_por: ADMIN.id, atualizado_em: AGORA.toISOString() });
  });

  it('valor fora da faixa ou horários incoerentes → 400 e nada gravado', async () => {
    const p = fakePrisma();
    const s = new RotasConfigService(p as unknown as PrismaService);
    const e = await falha(() => s.atualizar({ almoco_inicio: '08:00' }, ADMIN, AGORA));
    expect((e as { getStatus: () => number }).getStatus()).toBe(400);
    expect(p.app_settings.upsert).not.toHaveBeenCalled();
  });
});
