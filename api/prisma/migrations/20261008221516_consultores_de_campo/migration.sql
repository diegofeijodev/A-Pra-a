-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "field_channels" JSONB NOT NULL DEFAULT '["Nenhum","Grupos de WhatsApp","Indicação de conhecidos","Agência de mão de obra"]';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "field_consultants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "cpf" TEXT NOT NULL,
    "praca_id" UUID NOT NULL,
    "pix_key" TEXT NOT NULL,
    "pix_key_type" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "freela_consultant_id" TEXT,
    "freela_code" TEXT,
    "freela_sync_error" TEXT,
    "freela_synced_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_consultants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_journeys" (
    "id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "start_lat" DOUBLE PRECISION NOT NULL,
    "start_lng" DOUBLE PRECISION NOT NULL,
    "start_accuracy" DOUBLE PRECISION NOT NULL,
    "ended_at" TIMESTAMP(3),
    "end_lat" DOUBLE PRECISION,
    "end_lng" DOUBLE PRECISION,
    "end_accuracy" DOUBLE PRECISION,
    "auto_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_points" (
    "id" UUID NOT NULL,
    "journey_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "clock_adjusted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "field_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_visits" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "journey_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "checkin_at" TIMESTAMP(3) NOT NULL,
    "checkin_lat" DOUBLE PRECISION NOT NULL,
    "checkin_lng" DOUBLE PRECISION NOT NULL,
    "checkin_accuracy" DOUBLE PRECISION NOT NULL,
    "distance_m" INTEGER,
    "far_from_place" BOOLEAN NOT NULL DEFAULT false,
    "photo_key" TEXT NOT NULL,
    "photo_bytes" INTEGER NOT NULL,
    "checkout_at" TIMESTAMP(3),
    "checkout_lat" DOUBLE PRECISION,
    "checkout_lng" DOUBLE PRECISION,
    "auto_closed" BOOLEAN NOT NULL DEFAULT false,
    "clock_adjusted" BOOLEAN NOT NULL DEFAULT false,
    "interlocutor_name" TEXT,
    "interlocutor_role" TEXT,
    "freela_status" TEXT,
    "interest" TEXT,
    "open_vagas" INTEGER,
    "vaga_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "freelas_per_week" INTEGER,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channel_other" TEXT,
    "needs_followup" BOOLEAN,
    "followup_what" TEXT,
    "followup_date" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_consultants_email_key" ON "field_consultants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "field_consultants_cpf_key" ON "field_consultants"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "field_journeys_client_id_key" ON "field_journeys"("client_id");

-- CreateIndex
CREATE INDEX "field_journeys_consultant_id_day_idx" ON "field_journeys"("consultant_id", "day");

-- CreateIndex
CREATE INDEX "field_journeys_day_idx" ON "field_journeys"("day");

-- CreateIndex
CREATE UNIQUE INDEX "field_points_client_id_key" ON "field_points"("client_id");

-- CreateIndex
CREATE INDEX "field_points_journey_id_at_idx" ON "field_points"("journey_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "field_visits_client_id_key" ON "field_visits"("client_id");

-- CreateIndex
CREATE INDEX "field_visits_consultant_id_checkin_at_idx" ON "field_visits"("consultant_id", "checkin_at");

-- CreateIndex
CREATE INDEX "field_visits_journey_id_idx" ON "field_visits"("journey_id");

-- CreateIndex
CREATE INDEX "leads_praca_id_lat_lng_idx" ON "leads"("praca_id", "lat", "lng");

-- AddForeignKey
ALTER TABLE "field_consultants" ADD CONSTRAINT "field_consultants_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_consultants" ADD CONSTRAINT "field_consultants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_journeys" ADD CONSTRAINT "field_journeys_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_points" ADD CONSTRAINT "field_points_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "field_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "field_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índices únicos PARCIAIS (spec §5). O Prisma 5 não declara índice parcial:
-- a próxima `prisma migrate dev` vai propor `DROP INDEX` destes dois — apague
-- essas linhas do SQL gerado antes de aplicar (CLAUDE.md).

-- No máximo uma jornada aberta por consultor.
CREATE UNIQUE INDEX "field_journeys_one_open_per_consultant"
  ON "field_journeys"("consultant_id") WHERE "ended_at" IS NULL;

-- No máximo uma visita aberta por consultor.
CREATE UNIQUE INDEX "field_visits_one_open_per_consultant"
  ON "field_visits"("consultant_id") WHERE "checkout_at" IS NULL AND "auto_closed" = false;
