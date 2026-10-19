-- F2: lugares reservados no Apify ao iniciar a busca (teto mensal conta o reservado:
-- cancelar/estourar o tempo não interrompe o actor, que segue cobrando).
--
-- Gerada com `prisma migrate diff`; sem DROP dos índices únicos parciais
-- `field_journeys_one_open_per_consultant` / `field_visits_one_open_per_consultant`
-- (não existem para o Prisma: gere sempre com `--create-only` e apague essas linhas).
-- Migração aditiva: pode ir à produção antes do código.

-- AlterTable
ALTER TABLE "place_import_runs" ADD COLUMN     "reserved_places" INTEGER NOT NULL DEFAULT 0;
