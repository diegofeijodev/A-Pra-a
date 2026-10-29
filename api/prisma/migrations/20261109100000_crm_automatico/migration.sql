-- AlterTable
ALTER TABLE "lead_events" ADD COLUMN     "auto_key" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "auto_stage_applied" INTEGER,
ADD COLUMN     "freela_hirings" INTEGER,
ADD COLUMN     "freela_user_id" TEXT;

-- CreateTable
CREATE TABLE "crm_automation_runs" (
    "id" UUID NOT NULL,
    "job" TEXT NOT NULL,
    "ref" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "crm_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_automation_runs_job_started_at_idx" ON "crm_automation_runs"("job", "started_at" DESC);

-- CreateIndex
CREATE INDEX "field_signups_freela_user_id_idx" ON "field_signups"("freela_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_events_auto_key_key" ON "lead_events"("auto_key");

-- CreateIndex
CREATE INDEX "leads_freela_user_id_idx" ON "leads"("freela_user_id");

