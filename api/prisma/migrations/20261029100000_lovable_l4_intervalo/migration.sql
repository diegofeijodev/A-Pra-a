-- Restante da Lovable, fase L4 (contrato §37): intervalo/almoço como evento da jornada. ADITIVA: tabela nova.
-- Nada de DROP INDEX: os índices únicos parciais (field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant,
-- field_routes_one_active_per_day, field_route_stops_lead_day_unique, field_payouts_one_active_per_week e o novo
-- field_journey_breaks_one_open_per_journey) não existem para o Prisma: toda `migrate dev` futura vai propor DROP deles —
-- gere com --create-only e apague essas linhas.

-- CreateTable
CREATE TABLE "field_journey_breaks" (
    "id" UUID NOT NULL,
    "journey_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "end_client_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "start_lat" DOUBLE PRECISION,
    "start_lng" DOUBLE PRECISION,
    "start_accuracy" DOUBLE PRECISION,
    "end_lat" DOUBLE PRECISION,
    "end_lng" DOUBLE PRECISION,
    "end_accuracy" DOUBLE PRECISION,
    "end_reason" TEXT,
    "auto_closed" BOOLEAN NOT NULL DEFAULT false,
    "clock_adjusted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_journey_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_journey_breaks_client_id_key" ON "field_journey_breaks"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_journey_breaks_end_client_id_key" ON "field_journey_breaks"("end_client_id");

-- CreateIndex
CREATE INDEX "field_journey_breaks_consultant_id_started_at_idx" ON "field_journey_breaks"("consultant_id", "started_at");

-- CreateIndex
CREATE INDEX "field_journey_breaks_journey_id_idx" ON "field_journey_breaks"("journey_id");

-- AddForeignKey
ALTER TABLE "field_journey_breaks" ADD CONSTRAINT "field_journey_breaks_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "field_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_journey_breaks" ADD CONSTRAINT "field_journey_breaks_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Conjunto fechado também no banco (defesa em profundidade; o domínio já valida).
ALTER TABLE "field_journey_breaks" ADD CONSTRAINT "field_journey_breaks_end_reason_check" CHECK ("end_reason" IS NULL OR "end_reason" IN ('manual', 'checkin', 'journey_end', 'auto'));

-- Um intervalo aberto por jornada (o Prisma 5 não declara índice parcial).
CREATE UNIQUE INDEX "field_journey_breaks_one_open_per_journey" ON "field_journey_breaks"("journey_id") WHERE "ended_at" IS NULL;
