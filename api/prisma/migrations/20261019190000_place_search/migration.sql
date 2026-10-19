-- F2 da prospecção: pesquisa automática de estabelecimentos (contrato §22).
--
-- ATENÇÃO: gerada com `prisma migrate diff`. Os índices únicos parciais
-- `field_journeys_one_open_per_consultant` e `field_visits_one_open_per_consultant`
-- NÃO existem para o Prisma: toda `prisma migrate dev` futura vai propor `DROP INDEX`
-- deles. Gere com `--create-only`, APAGUE essas linhas do SQL e aplique com
-- `migrate deploy`. Esta migração não toca em nenhum deles (conferido: sem DROP).
-- Migração aditiva (colunas nulas + tabelas novas): pode ir à produção antes do código.
-- `leads_source_source_ref_key` é UNIQUE comum: NULL não conflita, então os leads antigos não são afetados.

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "location_precision" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "source_ref" TEXT;

-- CreateTable
CREATE TABLE "place_import_runs" (
    "id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "area_name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "types" TEXT[],
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius_m" INTEGER NOT NULL,
    "cache_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "found" INTEGER NOT NULL DEFAULT 0,
    "novos" INTEGER NOT NULL DEFAULT 0,
    "duplicados" INTEGER NOT NULL DEFAULT 0,
    "descartados" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "est_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "place_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_candidates" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "source_ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "location_precision" TEXT NOT NULL DEFAULT 'point',
    "phone" TEXT NOT NULL DEFAULT '',
    "website" TEXT,
    "distance_m" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'novo',
    "reason" TEXT,
    "lead_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "place_import_runs_praca_id_created_at_idx" ON "place_import_runs"("praca_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "place_import_runs_cache_key_status_finished_at_idx" ON "place_import_runs"("cache_key", "status", "finished_at");

-- CreateIndex
CREATE INDEX "place_import_runs_source_status_finished_at_idx" ON "place_import_runs"("source", "status", "finished_at");

-- CreateIndex
CREATE INDEX "place_candidates_run_id_status_idx" ON "place_candidates"("run_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "place_candidates_run_id_source_source_ref_key" ON "place_candidates"("run_id", "source", "source_ref");

-- CreateIndex
CREATE UNIQUE INDEX "leads_source_source_ref_key" ON "leads"("source", "source_ref");

-- AddForeignKey
ALTER TABLE "place_import_runs" ADD CONSTRAINT "place_import_runs_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_import_runs" ADD CONSTRAINT "place_import_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_candidates" ADD CONSTRAINT "place_candidates_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "place_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_candidates" ADD CONSTRAINT "place_candidates_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- O Prisma não declara CHECK: conjuntos fechados também no banco.
ALTER TABLE "place_import_runs" ADD CONSTRAINT "place_import_runs_status_check"
  CHECK ("status" IN ('queued', 'running', 'done', 'error', 'cancelled'));
ALTER TABLE "place_import_runs" ADD CONSTRAINT "place_import_runs_source_check"
  CHECK ("source" IN ('osm', 'apify'));
ALTER TABLE "place_candidates" ADD CONSTRAINT "place_candidates_status_check"
  CHECK ("status" IN ('novo', 'duplicado', 'descartado', 'adicionado'));
