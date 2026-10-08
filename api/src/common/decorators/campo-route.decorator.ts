import { SetMetadata } from '@nestjs/common';

export const CAMPO_ROUTE_KEY = 'campoRoute';

/**
 * Rota do consultor de campo (`/v1/campo/*`). O `JwtAuthGuard` global vê a marca
 * e delega ao `CampoAuthGuard` — token com `aud: "campo"`, nunca o da equipe.
 */
export const CampoRoute = () => SetMetadata(CAMPO_ROUTE_KEY, true);

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';

/** Rota que o consultor usa ANTES de trocar a senha provisória (troca de senha e `/me`). */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
