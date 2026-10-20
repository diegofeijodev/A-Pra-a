-- F8 (contrato §28): remuneração do consultor — versões da regra, razão append-only e fechamento semanal. Aditiva.
-- Nenhum índice é removido: os índices parciais do campo (field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant, field_routes_one_active_per_day, field_route_stops_lead_day_unique) ficam intactos.
-- CreateTable
CREATE TABLE "field_pay_rule_versions" (
    "id" UUID NOT NULL,
    "version" SERIAL NOT NULL,
    "valid_from" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "reason" TEXT,
    "created_by" UUID,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_pay_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_earnings_ledger" (
    "id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "work_scope" TEXT NOT NULL,
    "work_day" TEXT,
    "work_week" TEXT NOT NULL,
    "payout_week" TEXT NOT NULL,
    "rule_version" INTEGER,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "reverses_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by" UUID,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_earnings_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_payout_periods" (
    "id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "week_start" TEXT NOT NULL,
    "week_end" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "entries" INTEGER NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL,
    "closed_by" UUID,
    "closed_by_name" TEXT,
    "closed_mode" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_payout_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_pay_rule_versions_version_key" ON "field_pay_rule_versions"("version");

-- CreateIndex
CREATE INDEX "field_pay_rule_versions_valid_from_version_idx" ON "field_pay_rule_versions"("valid_from", "version");

-- CreateIndex
CREATE UNIQUE INDEX "field_earnings_ledger_reverses_id_key" ON "field_earnings_ledger"("reverses_id");

-- CreateIndex
CREATE INDEX "field_earnings_ledger_consultant_id_payout_week_idx" ON "field_earnings_ledger"("consultant_id", "payout_week");

-- CreateIndex
CREATE INDEX "field_earnings_ledger_consultant_id_work_week_work_scope_wo_idx" ON "field_earnings_ledger"("consultant_id", "work_week", "work_scope", "work_day");

-- CreateIndex
CREATE UNIQUE INDEX "field_earnings_ledger_consultant_id_payout_week_kind_idempo_key" ON "field_earnings_ledger"("consultant_id", "payout_week", "kind", "idempotency_key");

-- CreateIndex
CREATE INDEX "field_payout_periods_week_start_idx" ON "field_payout_periods"("week_start");

-- CreateIndex
CREATE UNIQUE INDEX "field_payout_periods_consultant_id_week_start_key" ON "field_payout_periods"("consultant_id", "week_start");

-- AddForeignKey
ALTER TABLE "field_earnings_ledger" ADD CONSTRAINT "field_earnings_ledger_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_earnings_ledger" ADD CONSTRAINT "field_earnings_ledger_rule_version_fkey" FOREIGN KEY ("rule_version") REFERENCES "field_pay_rule_versions"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_earnings_ledger" ADD CONSTRAINT "field_earnings_ledger_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "field_earnings_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_payout_periods" ADD CONSTRAINT "field_payout_periods_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariantes simples no banco (última linha de defesa).
ALTER TABLE "field_pay_rule_versions"
  ADD CONSTRAINT "field_pay_rule_versions_valid_from_check" CHECK ("valid_from" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  ADD CONSTRAINT "field_pay_rule_versions_config_check" CHECK (jsonb_typeof("config") = 'object');

ALTER TABLE "field_earnings_ledger"
  ADD CONSTRAINT "field_earnings_ledger_kind_check" CHECK ("kind" IN ('accrual', 'adjustment', 'reversal')),
  ADD CONSTRAINT "field_earnings_ledger_scope_check" CHECK ("work_scope" IN ('day', 'week', 'manual')),
  ADD CONSTRAINT "field_earnings_ledger_scope_kind_check" CHECK (("kind" = 'accrual') = ("work_scope" IN ('day', 'week'))),
  ADD CONSTRAINT "field_earnings_ledger_day_check" CHECK (("work_scope" = 'day') = ("work_day" IS NOT NULL)),
  ADD CONSTRAINT "field_earnings_ledger_amount_check" CHECK ("amount_cents" <> 0),
  ADD CONSTRAINT "field_earnings_ledger_reason_check" CHECK ("kind" = 'accrual' OR ("reason" IS NOT NULL AND length(btrim("reason")) >= 3)),
  ADD CONSTRAINT "field_earnings_ledger_reversal_check" CHECK (("kind" = 'reversal') = ("reverses_id" IS NOT NULL));

ALTER TABLE "field_payout_periods"
  ADD CONSTRAINT "field_payout_periods_status_check" CHECK ("status" IN ('open', 'closed')),
  ADD CONSTRAINT "field_payout_periods_mode_check" CHECK ("closed_mode" IN ('manual', 'auto'));

-- Imutabilidade: razão, versões da regra e fechamentos só recebem INSERT. Correção = novo lançamento.
CREATE FUNCTION "field_earnings_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tabela % é append-only: corrija com um novo lançamento', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "field_earnings_ledger_immutable" BEFORE UPDATE OR DELETE ON "field_earnings_ledger"
  FOR EACH ROW EXECUTE FUNCTION "field_earnings_immutable"();
CREATE TRIGGER "field_pay_rule_versions_immutable" BEFORE UPDATE OR DELETE ON "field_pay_rule_versions"
  FOR EACH ROW EXECUTE FUNCTION "field_earnings_immutable"();
CREATE TRIGGER "field_payout_periods_immutable" BEFORE UPDATE OR DELETE ON "field_payout_periods"
  FOR EACH ROW EXECUTE FUNCTION "field_earnings_immutable"();

-- Versão 1 da regra = padrão INICIAL (REGRA_PADRAO em src/domain/earnings-rules.ts), editável por nova versão.
INSERT INTO "field_pay_rule_versions" ("id", "valid_from", "config", "reason", "created_by_name")
VALUES (
  gen_random_uuid(),
  '1970-01-01',
  '{"unit_cents":1000,"tiers_period":"day","tiers":[{"min_signups":10,"amount_cents":10000},{"min_signups":20,"amount_cents":25000}],"combine":"max","cap_cents":null,"floor_cents":0,"floor_condition":"none","floor_min_visits":0,"visits_count":"checkin","week_start_weekday":1,"payout_weekday":1,"autoclose_hour":6,"late_grace_days":14}'::jsonb,
  'Padrão inicial',
  'sistema'
);
