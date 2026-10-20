-- F7 (contrato §27): cadastros confirmados pelo Freela + estado do sync por consultor. Aditiva.
-- CreateTable
CREATE TABLE "field_signups" (
    "id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "freela_user_id" TEXT NOT NULL,
    "freela_contractor_id" TEXT,
    "company_name" TEXT NOT NULL,
    "source" TEXT,
    "freela_created_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "first_vacancy_at" TIMESTAMP(3),
    "first_job_completed_at" TIMESTAMP(3),
    "created_day" TEXT NOT NULL,
    "activated_day" TEXT,
    "first_vacancy_day" TEXT,
    "first_job_day" TEXT,
    "signup_id" UUID,
    "lead_id" UUID,
    "match_status" TEXT NOT NULL DEFAULT 'none',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_signup_sync_state" (
    "consultant_id" UUID NOT NULL,
    "watermark" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "last_ok_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error" TEXT,
    "last_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "field_signup_sync_state_pkey" PRIMARY KEY ("consultant_id")
);

-- CreateIndex
CREATE INDEX "field_signups_consultant_id_activated_day_idx" ON "field_signups"("consultant_id", "activated_day");

-- CreateIndex
CREATE INDEX "field_signups_consultant_id_first_vacancy_day_idx" ON "field_signups"("consultant_id", "first_vacancy_day");

-- CreateIndex
CREATE INDEX "field_signups_consultant_id_first_job_day_idx" ON "field_signups"("consultant_id", "first_job_day");

-- CreateIndex
CREATE INDEX "field_signups_signup_id_idx" ON "field_signups"("signup_id");

-- CreateIndex
CREATE INDEX "field_signups_lead_id_idx" ON "field_signups"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_signups_consultant_id_freela_user_id_key" ON "field_signups"("consultant_id", "freela_user_id");

-- AddForeignKey
ALTER TABLE "field_signups" ADD CONSTRAINT "field_signups_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_signups" ADD CONSTRAINT "field_signups_signup_id_fkey" FOREIGN KEY ("signup_id") REFERENCES "field_company_signups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_signups" ADD CONSTRAINT "field_signups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_signup_sync_state" ADD CONSTRAINT "field_signup_sync_state_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "field_signups"
  ADD CONSTRAINT "field_signups_match_status_check"
  CHECK ("match_status" IN ('linked', 'ambiguous', 'none'));
