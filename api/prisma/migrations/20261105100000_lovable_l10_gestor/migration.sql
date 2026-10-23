-- Restante da Lovable, lote E, L10 (contrato §42): perfil gestor. ADITIVA: ninguém vira gestor (padrão false) e, com
-- TEAM_GESTOR_ENABLED desligada, a coluna não vale nada (o guard a trata como false). Sem DROP INDEX dos índices parciais.
ALTER TABLE "users" ADD COLUMN "is_gestor" BOOLEAN NOT NULL DEFAULT false;
