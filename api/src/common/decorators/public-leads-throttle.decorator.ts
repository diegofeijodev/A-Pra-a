import { SetMetadata } from '@nestjs/common';

export const PUBLIC_LEADS_THROTTLE_KEY = 'publicLeadsThrottle';

/**
 * Marca a rota cujo limite por minuto vem de `PUBLIC_LEADS_PER_MINUTE` — lido
 * pelo `AppThrottlerGuard` a cada request.
 *
 * Existe porque decorator é estático: `@Throttle({ limit: 10 })` fixa o número
 * na compilação e não dá para afrouxar em desenvolvimento (o smoke roda ~6
 * envios por rodada e duas rodadas seguidas batiam no teto de produção).
 */
export const PublicLeadsThrottle = () => SetMetadata(PUBLIC_LEADS_THROTTLE_KEY, true);
