-- P0 da comparação com a versão Lovable (contrato §30). ADITIVA: colunas com default/opcionais.
-- Gerada com `prisma migrate diff` (sem DROP INDEX dos índices parciais, que o Prisma não conhece).

-- AlterTable
ALTER TABLE "field_visits" ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "followup_time" TEXT,
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'conversa',
ADD COLUMN     "refusal_note" TEXT,
ADD COLUMN     "refusal_reason" TEXT;

-- AlterTable
ALTER TABLE "field_routes" ADD COLUMN     "travel_mode" TEXT NOT NULL DEFAULT 'a_pe';


-- Conjuntos fechados também no banco (defesa em profundidade; o domínio já valida).
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_outcome_check" CHECK ("outcome" IN ('conversa', 'fechado'));
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_followup_time_check" CHECK ("followup_time" IS NULL OR "followup_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_contact_phone_check" CHECK ("contact_phone" IS NULL OR "contact_phone" ~ '^[0-9]{10,11}$');
ALTER TABLE "field_routes" ADD CONSTRAINT "field_routes_travel_mode_check" CHECK ("travel_mode" IN ('a_pe', 'carro'));
