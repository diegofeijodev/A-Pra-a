-- Restante da Lovable, L13 (contrato §45.3): regra de pagamento por consultor. Coluna NULA (nulo = regra geral: todas as
-- versões de antes continuam gerais), índice e FK Restrict (quem tem regra própria é desativado, não apagado).
-- O trigger de imutabilidade de `field_pay_rule_versions` não muda (só INSERT). Nenhum índice parcial tocado.
ALTER TABLE "field_pay_rule_versions" ADD COLUMN "consultant_id" UUID;

CREATE INDEX "field_pay_rule_versions_consultant_id_valid_from_version_idx" ON "field_pay_rule_versions"("consultant_id", "valid_from", "version");

ALTER TABLE "field_pay_rule_versions" ADD CONSTRAINT "field_pay_rule_versions_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "field_consultants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
