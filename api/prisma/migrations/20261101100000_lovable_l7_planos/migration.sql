-- Restante da Lovable, lote D, L7 (contrato §39): planos de rota (divisão de uma área em N rotas). ADITIVA.
-- Gerada com `prisma migrate diff` (--create-only); NÃO mexe em `field_routes` nem nos índices parciais
-- (field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant, field_routes_one_active_per_day,
-- field_route_stops_lead_day_unique, field_payouts_one_active_per_week, field_journey_breaks_one_open_per_journey,
-- field_vouchers_one_coupon_per_contractor): se uma migração futura propuser DROP INDEX deles, apague as linhas.

-- CreateTable
CREATE TABLE "field_route_plans" (
    "id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "area_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'geral',
    "parent_lead_id" UUID,
    "travel_mode" TEXT NOT NULL,
    "modelo_tempo" TEXT NOT NULL,
    "params_snapshot" JSONB NOT NULL,
    "total_leads" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),
    "archived_by" UUID,

    CONSTRAINT "field_route_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "field_route_plans_kind_check" CHECK ("kind" IN ('geral', 'shoppings', 'shopping_interno')),
    CONSTRAINT "field_route_plans_travel_mode_check" CHECK ("travel_mode" IN ('carro', 'a_pe')),
    CONSTRAINT "field_route_plans_modelo_tempo_check" CHECK ("modelo_tempo" IN ('lovable', 'roteiro'))
);

-- CreateTable
CREATE TABLE "field_route_plan_items" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "lead_ids" UUID[],
    "distance_m" INTEGER NOT NULL,
    "est_minutes" INTEGER NOT NULL,
    "assigned_route_id" UUID,
    "assigned_consultant_id" UUID,
    "assigned_day" TEXT,
    "assigned_at" TIMESTAMP(3),
    "assigned_by" UUID,

    CONSTRAINT "field_route_plan_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "field_route_plan_items_seq_check" CHECK ("seq" >= 1),
    CONSTRAINT "field_route_plan_items_lead_ids_check" CHECK (cardinality("lead_ids") >= 1)
);

-- CreateIndex
CREATE INDEX "field_route_plans_praca_id_kind_created_at_idx" ON "field_route_plans"("praca_id", "kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "field_route_plan_items_assigned_route_id_idx" ON "field_route_plan_items"("assigned_route_id");

-- CreateIndex
CREATE INDEX "field_route_plan_items_assigned_consultant_id_assigned_day_idx" ON "field_route_plan_items"("assigned_consultant_id", "assigned_day");

-- CreateIndex
CREATE UNIQUE INDEX "field_route_plan_items_plan_id_seq_key" ON "field_route_plan_items"("plan_id", "seq");

-- AddForeignKey
ALTER TABLE "field_route_plans" ADD CONSTRAINT "field_route_plans_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_plans" ADD CONSTRAINT "field_route_plans_parent_lead_id_fkey" FOREIGN KEY ("parent_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_plans" ADD CONSTRAINT "field_route_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_plan_items" ADD CONSTRAINT "field_route_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "field_route_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_plan_items" ADD CONSTRAINT "field_route_plan_items_assigned_route_id_fkey" FOREIGN KEY ("assigned_route_id") REFERENCES "field_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_route_plan_items" ADD CONSTRAINT "field_route_plan_items_assigned_consultant_id_fkey" FOREIGN KEY ("assigned_consultant_id") REFERENCES "field_consultants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
