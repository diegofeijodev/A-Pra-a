import type { PrismaService } from '../../common/database/prisma.service';
import { CANAIS_PADRAO } from '../../domain/campo-rules';

/** Lista "apps e canais que usa hoje" (`app_settings.field_channels`); sem linha, a padrão. */
export async function lerCanais(prisma: PrismaService): Promise<string[]> {
  const row = await prisma.app_settings.findUnique({ where: { id: 1 }, select: { field_channels: true } });
  const v = row?.field_channels;
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : [...CANAIS_PADRAO];
}
