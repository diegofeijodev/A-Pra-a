-- Restante da Lovable, fases L6a/L6b (contrato §38): pedidos de cupom da 1ª contratação e o cupom real no Freela. ADITIVA: duas tabelas novas.
-- Nada de DROP INDEX: os índices únicos parciais (field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant,
-- field_routes_one_active_per_day, field_route_stops_lead_day_unique, field_payouts_one_active_per_week,
-- field_journey_breaks_one_open_per_journey e o novo field_vouchers_one_coupon_per_contractor) não existem para o Prisma: toda
-- `migrate dev` futura vai propor DROP deles — gere com --create-only e apague essas linhas.

-- CreateTable
CREATE TABLE "field_vouchers" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "visit_id" UUID,
    "company_name" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "freelas_per_week" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "decision_reason" TEXT,
    "decided_by" UUID,
    "decided_by_name" TEXT,
    "decided_at" TIMESTAMP(3),
    "contractor_user_id" TEXT,
    "contractor_name" TEXT,
    "contractor_source" TEXT,
    "coupon_status" TEXT,
    "coupon_code" TEXT,
    "coupon_id" TEXT,
    "coupon_params" JSONB,
    "coupon_expires_at" TIMESTAMP(3),
    "coupon_error_code" TEXT,
    "coupon_error" TEXT,
    "coupon_attempts" INTEGER NOT NULL DEFAULT 0,
    "coupon_last_attempt_at" TIMESTAMP(3),
    "coupon_synced_at" TIMESTAMP(3),
    "redeemed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_voucher_events" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "client_id" UUID,
    "actor_kind" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_name" TEXT,
    "reason" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_voucher_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_vouchers_client_id_key" ON "field_vouchers"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_vouchers_coupon_code_key" ON "field_vouchers"("coupon_code");

-- CreateIndex
CREATE INDEX "field_vouchers_lead_id_status_idx" ON "field_vouchers"("lead_id", "status");

-- CreateIndex
CREATE INDEX "field_vouchers_consultant_id_created_at_idx" ON "field_vouchers"("consultant_id", "created_at");

-- CreateIndex
CREATE INDEX "field_vouchers_praca_id_created_at_idx" ON "field_vouchers"("praca_id", "created_at");

-- CreateIndex
CREATE INDEX "field_vouchers_coupon_status_idx" ON "field_vouchers"("coupon_status");

-- CreateIndex
CREATE INDEX "field_vouchers_contractor_user_id_idx" ON "field_vouchers"("contractor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_voucher_events_client_id_key" ON "field_voucher_events"("client_id");

-- CreateIndex
CREATE INDEX "field_voucher_events_voucher_id_created_at_idx" ON "field_voucher_events"("voucher_id", "created_at");

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_vouchers" ADD CONSTRAINT "field_vouchers_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "field_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_voucher_events" ADD CONSTRAINT "field_voucher_events_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "field_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Conjuntos fechados e invariantes no banco (defesa em profundidade; o domínio já valida).
ALTER TABLE "field_vouchers"
  ADD CONSTRAINT "field_vouchers_status_check" CHECK ("status" IN ('pendente', 'aprovado', 'reprovado', 'cancelado')),
  ADD CONSTRAINT "field_vouchers_coupon_status_check" CHECK ("coupon_status" IS NULL OR "coupon_status" IN ('nao_aplicavel', 'aguardando_vinculo', 'aguardando_freela', 'criado', 'usado', 'vencido', 'desativado', 'erro')),
  ADD CONSTRAINT "field_vouchers_coupon_only_approved_check" CHECK (("status" = 'aprovado') = ("coupon_status" IS NOT NULL)),
  ADD CONSTRAINT "field_vouchers_contractor_source_check" CHECK ("contractor_source" IS NULL OR "contractor_source" IN ('company_signup', 'signup_sync', 'manual')),
  ADD CONSTRAINT "field_vouchers_contractor_pair_check" CHECK (("contractor_user_id" IS NULL) = ("contractor_source" IS NULL)),
  ADD CONSTRAINT "field_vouchers_freelas_check" CHECK ("freelas_per_week" >= 0),
  ADD CONSTRAINT "field_vouchers_decision_check" CHECK (("status" = 'pendente') = ("decided_at" IS NULL)),
  ADD CONSTRAINT "field_vouchers_coupon_needs_contractor_check" CHECK ("coupon_status" IS NULL OR "coupon_status" IN ('nao_aplicavel', 'aguardando_vinculo') OR "contractor_user_id" IS NOT NULL);

ALTER TABLE "field_voucher_events"
  ADD CONSTRAINT "field_voucher_events_type_check" CHECK ("type" IN ('requested', 'approved', 'rejected', 'contractor_linked', 'coupon_created', 'coupon_adopted', 'coupon_failed', 'coupon_retried', 'coupon_redeemed', 'coupon_unredeemed', 'coupon_expired', 'coupon_deactivated')),
  ADD CONSTRAINT "field_voucher_events_actor_check" CHECK ("actor_kind" IN ('consultor', 'equipe', 'sistema'));

-- Trilha imutável (reaproveita a função da F8).
CREATE TRIGGER "field_voucher_events_immutable" BEFORE UPDATE OR DELETE ON "field_voucher_events"
  FOR EACH ROW EXECUTE FUNCTION "field_earnings_immutable"();

-- field_vouchers: nunca apaga; o pedido (consultor, estabelecimento, praça, fotos, data) fica congelado; a decisão é uma só;
-- os parâmetros do cupom, depois de fotografados, não mudam; a visita só pode virar nula (visita cancelada, FK SET NULL).
CREATE FUNCTION "field_vouchers_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'field_vouchers não aceita DELETE: o pedido é um fato';
  END IF;
  IF NEW."consultant_id" IS DISTINCT FROM OLD."consultant_id"
     OR NEW."lead_id" IS DISTINCT FROM OLD."lead_id"
     OR NEW."praca_id" IS DISTINCT FROM OLD."praca_id"
     OR NEW."client_id" IS DISTINCT FROM OLD."client_id"
     OR NEW."company_name" IS DISTINCT FROM OLD."company_name"
     OR NEW."uf" IS DISTINCT FROM OLD."uf"
     OR NEW."city" IS DISTINCT FROM OLD."city"
     OR NEW."segment" IS DISTINCT FROM OLD."segment"
     OR NEW."freelas_per_week" IS DISTINCT FROM OLD."freelas_per_week"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
     OR (NEW."visit_id" IS DISTINCT FROM OLD."visit_id" AND NEW."visit_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'field_vouchers: consultor, estabelecimento, praça, fotos do pedido e data são imutáveis';
  END IF;
  IF OLD."status" <> 'pendente' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'field_vouchers: pedido já decidido não muda de status';
  END IF;
  IF OLD."coupon_params" IS NOT NULL AND NEW."coupon_params" IS DISTINCT FROM OLD."coupon_params" THEN
    RAISE EXCEPTION 'field_vouchers: os parâmetros do cupom fotografados na aprovação são imutáveis';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "field_vouchers_guard" BEFORE UPDATE OR DELETE ON "field_vouchers"
  FOR EACH ROW EXECUTE FUNCTION "field_vouchers_guard"();

-- Um cupom do Praça por contratante em toda a vida ("1ª contratação"); `usado` entra porque o Freela devolve o cupom ao
-- cancelar a vaga. O Prisma 5 não declara índice parcial: este só vive aqui.
CREATE UNIQUE INDEX "field_vouchers_one_coupon_per_contractor" ON "field_vouchers"("contractor_user_id") WHERE "coupon_status" IN ('aguardando_freela', 'criado', 'usado');
