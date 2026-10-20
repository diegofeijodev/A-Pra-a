-- F9 (contrato §29): pagamento por Pix manual — obrigação semanal, eventos de auditoria append-only e tipos de lançamento de pagamento no razão. Aditiva.
-- Nenhum índice é removido: os parciais do campo (field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant, field_routes_one_active_per_day, field_route_stops_lead_day_unique) ficam intactos.
-- CreateTable
CREATE TABLE "field_payouts" (
    "id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "week_start" TEXT NOT NULL,
    "week_end" TEXT NOT NULL,
    "due_cents" INTEGER NOT NULL,
    "pix_key" TEXT,
    "pix_key_type" TEXT,
    "block_reason" TEXT,
    "status" TEXT NOT NULL,
    "paid_cents" INTEGER,
    "paid_at" TIMESTAMP(3),
    "paid_by" UUID,
    "paid_by_name" TEXT,
    "method" TEXT NOT NULL DEFAULT 'pix_manual',
    "proof_key" TEXT,
    "proof_mime" TEXT,
    "proof_size" INTEGER,
    "note" TEXT,
    "diff_reason" TEXT,
    "created_by" UUID,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_payout_events" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "actor_id" UUID,
    "actor_name" TEXT,
    "reason" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_payout_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_payouts_week_start_status_idx" ON "field_payouts"("week_start", "status");

-- CreateIndex
CREATE INDEX "field_payouts_consultant_id_week_start_idx" ON "field_payouts"("consultant_id", "week_start");

-- CreateIndex
CREATE INDEX "field_payout_events_payout_id_created_at_idx" ON "field_payout_events"("payout_id", "created_at");

-- AddForeignKey
ALTER TABLE "field_payouts" ADD CONSTRAINT "field_payouts_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_payout_events" ADD CONSTRAINT "field_payout_events_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "field_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Um pagamento ativo por consultor/semana (cancelado pode ser gerado de novo). Índice parcial: só vive aqui.
CREATE UNIQUE INDEX "field_payouts_one_active_per_week" ON "field_payouts"("consultant_id", "week_start") WHERE "status" <> 'cancelled';

-- Invariantes simples no banco (última linha de defesa).
ALTER TABLE "field_payouts"
  ADD CONSTRAINT "field_payouts_status_check" CHECK ("status" IN ('pending', 'paid', 'failed', 'cancelled')),
  ADD CONSTRAINT "field_payouts_method_check" CHECK ("method" IN ('pix_manual')),
  ADD CONSTRAINT "field_payouts_due_check" CHECK ("due_cents" > 0),
  ADD CONSTRAINT "field_payouts_paid_check" CHECK (("status" = 'paid') = ("paid_cents" IS NOT NULL AND "paid_at" IS NOT NULL) OR "status" = 'cancelled'),
  ADD CONSTRAINT "field_payouts_paid_positive_check" CHECK ("paid_cents" IS NULL OR "paid_cents" > 0),
  ADD CONSTRAINT "field_payouts_block_check" CHECK ("block_reason" IS NULL OR ("block_reason" = 'NO_PIX_KEY' AND "pix_key" IS NULL)),
  ADD CONSTRAINT "field_payouts_diff_check" CHECK ("paid_cents" IS NULL OR "paid_cents" = "due_cents" OR ("diff_reason" IS NOT NULL AND length(btrim("diff_reason")) >= 3));

ALTER TABLE "field_payout_events"
  ADD CONSTRAINT "field_payout_events_type_check" CHECK ("type" IN ('created', 'paid', 'failed', 'retried', 'cancelled', 'reversed', 'pix_key_viewed', 'exported'));

-- Auditoria imutável (reaproveita a função da F8).
CREATE TRIGGER "field_payout_events_immutable" BEFORE UPDATE OR DELETE ON "field_payout_events"
  FOR EACH ROW EXECUTE FUNCTION "field_earnings_immutable"();

-- field_payouts: nunca apaga; só estado/pagamento/comprovante podem mudar (consultor, semana, valor devido, chave Pix e criação ficam congelados).
CREATE FUNCTION "field_payouts_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'field_payouts não aceita DELETE: cancele com um evento';
  END IF;
  IF NEW."consultant_id" IS DISTINCT FROM OLD."consultant_id"
     OR NEW."week_start" IS DISTINCT FROM OLD."week_start"
     OR NEW."week_end" IS DISTINCT FROM OLD."week_end"
     OR NEW."due_cents" IS DISTINCT FROM OLD."due_cents"
     OR NEW."pix_key" IS DISTINCT FROM OLD."pix_key"
     OR NEW."pix_key_type" IS DISTINCT FROM OLD."pix_key_type"
     OR NEW."block_reason" IS DISTINCT FROM OLD."block_reason"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'field_payouts: valor devido, semana, consultor e chave Pix são imutáveis';
  END IF;
  IF OLD."status" = 'cancelled' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'field_payouts: pagamento cancelado não muda de status';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "field_payouts_guard" BEFORE UPDATE OR DELETE ON "field_payouts"
  FOR EACH ROW EXECUTE FUNCTION "field_payouts_guard"();

-- Razão da F8: aceita também os lançamentos de pagamento (escopo `manual`, motivo obrigatório pelos CHECKs já existentes).
ALTER TABLE "field_earnings_ledger" DROP CONSTRAINT "field_earnings_ledger_kind_check";
ALTER TABLE "field_earnings_ledger"
  ADD CONSTRAINT "field_earnings_ledger_kind_check" CHECK ("kind" IN ('accrual', 'adjustment', 'reversal', 'payout', 'payout_reversal', 'payout_settlement'));
