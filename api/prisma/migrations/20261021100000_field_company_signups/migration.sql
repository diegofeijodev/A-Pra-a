-- F6 (contrato §26): cadastro assistido da empresa no Freela. Aditiva. NUNCA guarda link nem senha.
-- CreateTable
CREATE TABLE "field_company_signups" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "visit_id" UUID,
    "lead_id" UUID,
    "company_name" TEXT NOT NULL,
    "phone_masked" TEXT NOT NULL,
    "email_masked" TEXT,
    "status" TEXT NOT NULL DEFAULT 'creating',
    "freela_user_id" TEXT,
    "freela_contractor_id" TEXT,
    "link_issued_at" TIMESTAMP(3),
    "link_expires_at" TIMESTAMP(3),
    "reissue_count" INTEGER NOT NULL DEFAULT 0,
    "activated_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_company_signups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_company_signups_client_id_key" ON "field_company_signups"("client_id");

-- CreateIndex
CREATE INDEX "field_company_signups_consultant_id_created_at_idx" ON "field_company_signups"("consultant_id", "created_at");

-- CreateIndex
CREATE INDEX "field_company_signups_visit_id_idx" ON "field_company_signups"("visit_id");

-- CreateIndex
CREATE INDEX "field_company_signups_lead_id_idx" ON "field_company_signups"("lead_id");

-- AddForeignKey
ALTER TABLE "field_company_signups" ADD CONSTRAINT "field_company_signups_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_company_signups" ADD CONSTRAINT "field_company_signups_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "field_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_company_signups" ADD CONSTRAINT "field_company_signups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Estados da linha (a aplicação é quem transita; o banco só recusa valor fora da lista).
ALTER TABLE "field_company_signups"
  ADD CONSTRAINT "field_company_signups_status_check"
  CHECK ("status" IN ('creating', 'pending', 'activated', 'already_registered', 'failed'));
