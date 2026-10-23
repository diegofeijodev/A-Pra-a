-- Restante da Lovable, L12 (contrato §44.2): consultor em várias praças. Só acréscimos; nenhum índice parcial tocado
-- (os de `field_journeys`, `field_visits`, `field_routes`, `field_route_stops`, `field_payouts`, `field_journey_breaks` e
-- `field_vouchers` ficam como estão — este SQL veio de `prisma migrate diff` entre os dois schemas, sem DROP INDEX).
-- `field_journeys.praca_id` NULO = a principal do consultor (todas as jornadas de antes); FK Restrict, nunca SET NULL.
-- `field_consultant_pracas` guarda só as praças ALÉM da principal (conjunto = principal ∪ linhas).

-- AlterTable
ALTER TABLE "field_journeys" ADD COLUMN     "praca_id" UUID;

-- CreateTable
CREATE TABLE "field_consultant_pracas" (
    "consultant_id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_consultant_pracas_pkey" PRIMARY KEY ("consultant_id","praca_id")
);

-- CreateIndex
CREATE INDEX "field_consultant_pracas_praca_id_idx" ON "field_consultant_pracas"("praca_id");

-- CreateIndex
CREATE INDEX "field_journeys_praca_id_day_idx" ON "field_journeys"("praca_id", "day");

-- AddForeignKey
ALTER TABLE "field_consultant_pracas" ADD CONSTRAINT "field_consultant_pracas_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_consultant_pracas" ADD CONSTRAINT "field_consultant_pracas_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_consultant_pracas" ADD CONSTRAINT "field_consultant_pracas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_journeys" ADD CONSTRAINT "field_journeys_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

