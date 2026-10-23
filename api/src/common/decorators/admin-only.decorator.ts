import { applyDecorators, SetMetadata } from '@nestjs/common';

export const ADMIN_ONLY_KEY = 'adminOnly';

/**
 * Marca de permissão da EQUIPE (lote E, contrato §42.2): uma por rota, a do método vale sobre a da classe. O `JwtAuthGuard` lê
 * só esta chave (resolvida no nível mais específico), nunca uma chave por marca — assim `@GestorOuAdmin()` num método vence o
 * `@AdminOnly()` da classe. Toda rota de ESCRITA da equipe tem uma (teste de proteção `permissoes-protecao.spec.ts`).
 */
export const PERMISSAO_KEY = 'permissao';
export type Permissao = 'admin' | 'gestor' | 'equipe';

/** Só administradores. (Mantém `ADMIN_ONLY_KEY`, que os testes de permissão de antes leem.) */
export const AdminOnly = () => applyDecorators(SetMetadata(ADMIN_ONLY_KEY, true), SetMetadata(PERMISSAO_KEY, 'admin' satisfies Permissao));

/** Admin, ou gestor com `TEAM_GESTOR_ENABLED` (§42.3). Desligada a flag = só admin, com a mesma mensagem de hoje. */
export const GestorOuAdmin = () => SetMetadata(PERMISSAO_KEY, 'gestor' satisfies Permissao);

/** Qualquer pessoa ativa da equipe (o comportamento de sempre das rotas sem marca), agora declarado. */
export const Equipe = () => SetMetadata(PERMISSAO_KEY, 'equipe' satisfies Permissao);
