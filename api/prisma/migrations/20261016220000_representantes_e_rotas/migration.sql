-- Bloco B — representantes e rotas (contrato §21).
-- AVISO: os índices únicos PARCIAIS field_journeys_one_open_per_consultant e
-- field_visits_one_open_per_consultant (migração 20261008221516) não existem para o Prisma.
-- Toda `prisma migrate dev` futura vai propor DROP INDEX deles: gere com --create-only
-- e apague essas linhas antes de aplicar.

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "field_cnaes" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "field_consultants" ADD COLUMN     "area_bairros" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "area_lat" DOUBLE PRECISION,
ADD COLUMN     "area_lng" DOUBLE PRECISION,
ADD COLUMN     "area_radius_km" DOUBLE PRECISION,
ADD COLUMN     "birth_date" TEXT;

-- AlterTable
ALTER TABLE "field_journeys" ADD COLUMN     "route_id" UUID;

-- AlterTable
ALTER TABLE "field_visits" ADD COLUMN     "callback_phone" TEXT,
ADD COLUMN     "final_date" TEXT,
ADD COLUMN     "final_reason" TEXT,
ADD COLUMN     "final_status" TEXT,
ADD COLUMN     "form_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "hires_freelancer" BOOLEAN,
ADD COLUMN     "off_hours" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "off_route" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signup_mode" TEXT,
ADD COLUMN     "voucher_accepted" BOOLEAN;

-- AlterTable
ALTER TABLE "lead_vagas" ADD COLUMN     "client_id" UUID,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "visit_id" UUID;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cnae" TEXT,
ADD COLUMN     "field_consultant_id" UUID,
ADD COLUMN     "geo_error" TEXT,
ADD COLUMN     "geo_status" TEXT;

-- AlterTable
ALTER TABLE "pracas" ADD COLUMN     "route_daily_goal" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "route_end_hour" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "route_start_hour" INTEGER NOT NULL DEFAULT 9;

-- CreateTable
CREATE TABLE "field_routes" (
    "id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "goal" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
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
    "position" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "visit_id" UUID,
    "removed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "field_route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_vouchers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "visit_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'solicitado',
    "valid_until" TEXT NOT NULL,
    "freela_ref" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "used_at" TIMESTAMP(3),
    "vaga_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_routes_praca_id_day_idx" ON "field_routes"("praca_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "field_routes_consultant_id_day_key" ON "field_routes"("consultant_id", "day");

-- CreateIndex
CREATE INDEX "field_route_stops_lead_id_idx" ON "field_route_stops"("lead_id");

-- CreateIndex
CREATE INDEX "field_route_stops_visit_id_idx" ON "field_route_stops"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_route_stops_route_id_lead_id_key" ON "field_route_stops"("route_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_vouchers_code_key" ON "field_vouchers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "field_vouchers_visit_id_key" ON "field_vouchers"("visit_id");

-- CreateIndex
CREATE INDEX "field_vouchers_lead_id_status_idx" ON "field_vouchers"("lead_id", "status");

-- CreateIndex
CREATE INDEX "field_vouchers_status_valid_until_idx" ON "field_vouchers"("status", "valid_until");

-- CreateIndex
CREATE INDEX "field_vouchers_consultant_id_created_at_idx" ON "field_vouchers"("consultant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_vagas_client_id_key" ON "lead_vagas"("client_id");

-- CreateIndex
CREATE INDEX "lead_vagas_lead_id_created_at_idx" ON "lead_vagas"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_vagas_source_created_at_idx" ON "lead_vagas"("source", "created_at");

-- CreateIndex
CREATE INDEX "leads_praca_id_cnae_idx" ON "leads"("praca_id", "cnae");

-- CreateIndex
CREATE INDEX "leads_geo_status_idx" ON "leads"("geo_status");

-- CreateIndex
CREATE INDEX "leads_field_consultant_id_idx" ON "leads"("field_consultant_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_field_consultant_id_fkey" FOREIGN KEY ("field_consultant_id") REFERENCES "field_consultants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_vagas" ADD CONSTRAINT "lead_vagas_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "field_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_journeys" ADD CONSTRAINT "field_journeys_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "field_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_routes" ADD CONSTRAINT "field_routes_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_routes" ADD CONSTRAINT "field_routes_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "field_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_stops" ADD CONSTRAINT "field_route_stops_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "field_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "field_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_vaga_id_fkey" FOREIGN KEY ("vaga_id") REFERENCES "lead_vagas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

