-- Modo do chefe, S0/S1 (contrato §31). ADITIVA: colunas com default/opcionais; nada de DROP INDEX
-- (os índices únicos parciais de field_journeys/field_visits/field_routes/field_route_stops/field_payouts
-- não existem para o Prisma e ficam como estão).

-- AlterTable
ALTER TABLE "field_visits" ADD COLUMN     "distance_note" TEXT,
ADD COLUMN     "flow" TEXT NOT NULL DEFAULT 'completo',
ADD COLUMN     "result" TEXT;

-- AlterTable
ALTER TABLE "field_consultants" ADD COLUMN     "visit_flow" TEXT;

-- Conjuntos fechados também no banco (defesa em profundidade; o domínio já valida).
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_flow_check" CHECK ("flow" IN ('simples', 'completo'));
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_result_check" CHECK ("result" IS NULL OR "result" IN ('cadastrou', 'ja_usa', 'retorno', 'sem_interesse', 'fechado'));
ALTER TABLE "field_consultants" ADD CONSTRAINT "field_consultants_visit_flow_check" CHECK ("visit_flow" IS NULL OR "visit_flow" IN ('simples', 'completo'));
