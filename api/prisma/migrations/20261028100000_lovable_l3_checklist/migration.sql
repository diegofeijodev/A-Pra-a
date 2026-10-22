-- Restante da Lovable, fase L3 (contrato §35): foto do checklist da visita. ADITIVA: coluna opcional, sem migração de dado.
-- Nada de DROP INDEX: os índices únicos parciais (field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant,
-- field_routes_one_active_per_day, field_route_stops_lead_day_unique, field_payouts_one_active_per_week) não existem para o
-- Prisma e ficam como estão.

-- AlterTable
ALTER TABLE "field_visits" ADD COLUMN     "checklist" JSONB;
