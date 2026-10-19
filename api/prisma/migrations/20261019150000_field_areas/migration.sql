-- F1 da prospecção: áreas de atuação do campo (círculo = centro + raio).
--
-- ATENÇÃO: gerada com `prisma migrate diff` (o `migrate dev --create-only` recusa
-- ambiente não interativo). Os índices únicos parciais `field_journeys_one_open_per_consultant`
-- e `field_visits_one_open_per_consultant` NÃO existem para o Prisma: toda
-- `prisma migrate dev` futura vai propor `DROP INDEX` deles. Gere com
-- `--create-only`, APAGUE essas linhas do SQL e aplique com `migrate deploy`.
-- Esta migração não toca em nenhum deles. Migração aditiva: pode ir à produção
-- antes do código.

-- CreateTable
CREATE TABLE "field_areas" (
    "id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius_m" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_areas_praca_id_active_idx" ON "field_areas"("praca_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "field_areas_praca_id_name_key_key" ON "field_areas"("praca_id", "name_key");

-- AddForeignKey
ALTER TABLE "field_areas" ADD CONSTRAINT "field_areas_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_areas" ADD CONSTRAINT "field_areas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- O Prisma não declara CHECK: o raio (200 m a 5 km) é garantido também no banco.
ALTER TABLE "field_areas" ADD CONSTRAINT "field_areas_radius_m_check" CHECK ("radius_m" BETWEEN 200 AND 5000);
