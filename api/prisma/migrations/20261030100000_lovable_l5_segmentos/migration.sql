-- Restante da Lovable, fase L5 (contrato §36): segmentos editáveis da busca de estabelecimentos. ADITIVA: duas colunas anuláveis.
-- Nada de DROP INDEX: os índices únicos parciais (field_journeys_one_open_per_consultant, field_visits_one_open_per_consultant,
-- field_routes_one_active_per_day, field_route_stops_lead_day_unique, field_payouts_one_active_per_week,
-- field_journey_breaks_one_open_per_journey e field_vouchers_one_coupon_per_contractor) não existem para o Prisma: toda
-- `migrate dev` futura vai propor DROP deles — gere com --create-only e apague essas linhas.

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "place_segments" JSONB;

-- AlterTable
ALTER TABLE "place_import_runs" ADD COLUMN     "segments_snapshot" JSONB;
