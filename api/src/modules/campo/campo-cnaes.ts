import type { PrismaService } from '../../common/database/prisma.service';
import { CNAES_PADRAO, type CnaeDef } from '../../domain/catalog';

/** Lista de CNAEs da configuração; vazia ou inválida = a do catálogo (§21.4). */
export async function lerCnaes(prisma: Pick<PrismaService, 'app_settings'>): Promise<CnaeDef[]> {
  const row = await prisma.app_settings.findUnique({ where: { id: 1 }, select: { field_cnaes: true } });
  const v = row?.field_cnaes;
  const ok =
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((x) => !!x && typeof x === 'object' && typeof (x as unknown as CnaeDef).code === 'string' && typeof (x as unknown as CnaeDef).label === 'string');
  return ok ? (v as unknown as CnaeDef[]) : CNAES_PADRAO.map((c) => ({ ...c }));
}
