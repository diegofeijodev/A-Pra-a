-- Modo do chefe S3 (contrato §32.8): ganho por cadastro declarado. ADITIVA: duas tabelas novas, nenhuma coluna nova em tabela existente.
-- Gerada por `prisma migrate diff`; sem DROP INDEX dos índices parciais conhecidos (field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant, field_routes_one_active_per_day, field_route_stops_lead_day_unique, field_payouts_one_active_per_week).

-- CreateTable
CREATE TABLE "field_declared_signups" (
    "id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declared_day" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "rule_version" INTEGER,
    "client_id" UUID NOT NULL,
    "flow" TEXT NOT NULL DEFAULT 'simples',

    CONSTRAINT "field_declared_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_declared_signup_voids" (
    "id" UUID NOT NULL,
    "declared_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_by" UUID,
    "voided_by_name" TEXT,
    "client_id" UUID NOT NULL,

    CONSTRAINT "field_declared_signup_voids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_declared_signups_visit_id_key" ON "field_declared_signups"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_declared_signups_lead_id_key" ON "field_declared_signups"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_declared_signups_client_id_key" ON "field_declared_signups"("client_id");

-- CreateIndex
CREATE INDEX "field_declared_signups_consultant_id_declared_day_idx" ON "field_declared_signups"("consultant_id", "declared_day");

-- CreateIndex
CREATE UNIQUE INDEX "field_declared_signup_voids_declared_id_key" ON "field_declared_signup_voids"("declared_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_declared_signup_voids_client_id_key" ON "field_declared_signup_voids"("client_id");

-- AddForeignKey
ALTER TABLE "field_declared_signups" ADD CONSTRAINT "field_declared_signups_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_declared_signups" ADD CONSTRAINT "field_declared_signups_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "field_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_declared_signups" ADD CONSTRAINT "field_declared_signups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_declared_signup_voids" ADD CONSTRAINT "field_declared_signup_voids_declared_id_fkey" FOREIGN KEY ("declared_id") REFERENCES "field_declared_signups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Anulação: motivos fechados e nota obrigatória (3–500).
ALTER TABLE "field_declared_signup_voids"
  ADD CONSTRAINT "field_declared_signup_voids_reason_check" CHECK ("reason" IN ('not_confirmed', 'duplicate', 'admin_review', 'fraud')),
  ADD CONSTRAINT "field_declared_signup_voids_note_check" CHECK (length(btrim("note")) BETWEEN 3 AND 500);

ALTER TABLE "field_declared_signups"
  ADD CONSTRAINT "field_declared_signups_day_check" CHECK ("declared_day" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  ADD CONSTRAINT "field_declared_signups_flow_check" CHECK ("flow" IN ('simples', 'completo'));

-- Imutabilidade: declaração e anulação só recebem INSERT (mesma função do razão, migração 20261023100000).
CREATE TRIGGER "field_declared_signups_immutable" BEFORE UPDATE OR DELETE ON "field_declared_signups"
  FOR EACH ROW EXECUTE FUNCTION "field_earnings_immutable"();
CREATE TRIGGER "field_declared_signup_voids_immutable" BEFORE UPDATE OR DELETE ON "field_declared_signup_voids"
  FOR EACH ROW EXECUTE FUNCTION "field_earnings_immutable"();
