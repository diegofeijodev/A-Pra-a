-- Restante da Lovable, lote D, L8 (contrato §40): shoppings pelo mapa aberto. ADITIVA: colunas nulas (nenhum lead existente muda),
-- `kind` das buscas com padrão 'lugares' (a de hoje). Gerada com `prisma migrate diff` (--create-only); sem DROP INDEX dos índices
-- parciais (lista no CLAUDE.md).

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "parent_lead_id" UUID,
ADD COLUMN     "place_kind" TEXT;
ALTER TABLE "leads" ADD CONSTRAINT "leads_place_kind_check" CHECK ("place_kind" IS NULL OR "place_kind" IN ('shopping'));
ALTER TABLE "leads" ADD CONSTRAINT "leads_parent_not_self_check" CHECK ("parent_lead_id" IS NULL OR "parent_lead_id" <> "id");

-- AlterTable
ALTER TABLE "place_candidates" ADD COLUMN     "metrics" JSONB;

-- AlterTable
ALTER TABLE "place_import_runs" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'lugares',
ADD COLUMN     "parent_lead_id" UUID;
ALTER TABLE "place_import_runs" ADD CONSTRAINT "place_import_runs_kind_check" CHECK ("kind" IN ('lugares', 'shoppings', 'lojas'));

-- CreateTable
CREATE TABLE "lead_mall_metrics" (
    "lead_id" UUID NOT NULL,
    "source_ref" TEXT NOT NULL,
    "geometry_kind" TEXT NOT NULL,
    "area_m2" INTEGER,
    "levels" INTEGER,
    "pois_mapped" INTEGER,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "large_override" BOOLEAN,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_mall_metrics_pkey" PRIMARY KEY ("lead_id"),
    CONSTRAINT "lead_mall_metrics_geometry_kind_check" CHECK ("geometry_kind" IN ('poligono', 'ponto')),
    CONSTRAINT "lead_mall_metrics_area_check" CHECK ("area_m2" IS NULL OR "area_m2" >= 0),
    CONSTRAINT "lead_mall_metrics_pois_check" CHECK ("pois_mapped" IS NULL OR "pois_mapped" >= 0)
);

-- CreateIndex
CREATE INDEX "leads_parent_lead_id_idx" ON "leads"("parent_lead_id");

-- CreateIndex
CREATE INDEX "leads_praca_id_place_kind_idx" ON "leads"("praca_id", "place_kind");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_parent_lead_id_fkey" FOREIGN KEY ("parent_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_import_runs" ADD CONSTRAINT "place_import_runs_parent_lead_id_fkey" FOREIGN KEY ("parent_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_mall_metrics" ADD CONSTRAINT "lead_mall_metrics_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
