import { SetMetadata } from '@nestjs/common';

export const ADMIN_ONLY_KEY = 'adminOnly';

/** Marca handler/controller como restrito a administradores — conferido pelo `JwtAuthGuard`. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);
