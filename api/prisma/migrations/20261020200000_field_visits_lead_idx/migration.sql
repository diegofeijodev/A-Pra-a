-- F4 (contrato §24): a camada "cobertura" procura visitas por estabelecimento; a FK lead_id não tinha índice.
-- Aditiva. (Sem DROP INDEX dos índices parciais: o Prisma não os declara.)
-- CreateIndex
CREATE INDEX "field_visits_lead_id_idx" ON "field_visits"("lead_id");
