-- F3 da prospecção: roteiro do dia (contrato §23). Migração ADITIVA.
--
-- Gerada com `prisma migrate diff` (sem nenhum DROP) + SQL manual no fim.
-- ATENÇÃO — índices únicos PARCIAIS não existem para o Prisma: toda `prisma migrate dev` futura vai
-- propor `DROP INDEX` deles. Gere a próxima migração com `--create-only`, APAGUE as linhas `DROP INDEX`
-- destes quatro e aplique com `migrate deploy`:
--   field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant,
--   field_routes_one_active_per_day, field_route_stops_lead_day_unique.

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "field_config" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "field_routes" (
    "id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "area_id" UUID,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "start_lat" DOUBLE PRECISION NOT NULL,
    "start_lng" DOUBLE PRECISION NOT NULL,
    "params_snapshot" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_route_stops" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'planejada',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "fixa" BOOLEAN NOT NULL DEFAULT false,
    "eta_min" INTEGER,
    "planned_minutes" INTEGER NOT NULL,
    "distance_m" INTEGER NOT NULL DEFAULT 0,
    "skip_reason" TEXT,
    "skip_note" TEXT,
    "deferred_to" TEXT,
    "visit_id" UUID,
    "candidate_id" UUID,
    "name_snap" TEXT NOT NULL,
    "address_snap" TEXT NOT NULL DEFAULT '',
    "phone_snap" TEXT NOT NULL DEFAULT '',
    "lat_snap" DOUBLE PRECISION NOT NULL,
    "lng_snap" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_route_events" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "stop_id" UUID,
    "consultant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_route_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_routes_consultant_id_day_idx" ON "field_routes"("consultant_id", "day");

-- CreateIndex
CREATE INDEX "field_routes_day_praca_id_idx" ON "field_routes"("day", "praca_id");

-- CreateIndex
CREATE INDEX "field_route_stops_route_id_seq_idx" ON "field_route_stops"("route_id", "seq");

-- CreateIndex
CREATE INDEX "field_route_stops_lead_id_idx" ON "field_route_stops"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_route_events_client_id_key" ON "field_route_events"("client_id");

-- CreateIndex
CREATE INDEX "field_route_events_route_id_created_at_idx" ON "field_route_events"("route_id", "created_at");

-- AddForeignKey
ALTER TABLE "field_routes" ADD CONSTRAINT "field_routes_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "field_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "field_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "place_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_events" ADD CONSTRAINT "field_route_events_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "field_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_events" ADD CONSTRAINT "field_route_events_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "field_route_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Um roteiro ATIVO por consultor por dia (só no SQL).
CREATE UNIQUE INDEX "field_routes_one_active_per_day"
  ON "field_routes"("consultant_id", "day") WHERE "status" = 'ativa';

-- Dois consultores nunca recebem o mesmo lugar no dia (só no SQL). Pulada/descartada liberam o lugar.
CREATE UNIQUE INDEX "field_route_stops_lead_day_unique"
  ON "field_route_stops"("lead_id", "day") WHERE "status" IN ('pendente', 'visitada', 'adiada');

ALTER TABLE "field_routes" ADD CONSTRAINT "field_routes_status_check" CHECK ("status" IN ('ativa', 'encerrada'));
ALTER TABLE "field_routes" ADD CONSTRAINT "field_routes_source_check" CHECK ("source" IN ('equipe', 'auto', 'consultor'));
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_kind_check" CHECK ("kind" IN ('planejada', 'reserva'));
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_status_check"
  CHECK ("status" IN ('pendente', 'visitada', 'pulada', 'adiada', 'descartada'));
ALTER TABLE "field_route_events" ADD CONSTRAINT "field_route_events_kind_check" CHECK ("kind" IN ('skip', 'defer', 'undo', 'reoptimize'));
