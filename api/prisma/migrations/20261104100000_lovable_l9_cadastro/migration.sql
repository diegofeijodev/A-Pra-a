-- Restante da Lovable, lote E, L9 (contrato §41): regra de senha nova, cadastro do consultor (endereço e banco) e e-mail de quem
-- atendeu na visita. Tudo ADITIVO e nulo: nenhuma linha existente muda e, com as flags desligadas, nada lê nem grava estas colunas.
-- Sem DROP INDEX dos índices parciais (eles não existem para o Prisma; ver CLAUDE.md).

-- §41.2: nulo = a política da Lovable (8+, 1 maiúscula, 1 número).
ALTER TABLE "app_settings" ADD COLUMN "password_policy" JSONB;

-- §41.3: endereço e banco do consultor; a conta completa só para o admin, nunca em log e fora do pagamento (o Pix continua fotografado).
ALTER TABLE "field_consultants" ADD COLUMN "address_cep" TEXT,
ADD COLUMN "address_street" TEXT,
ADD COLUMN "address_number" TEXT,
ADD COLUMN "address_complement" TEXT,
ADD COLUMN "address_district" TEXT,
ADD COLUMN "address_city" TEXT,
ADD COLUMN "address_state" TEXT,
ADD COLUMN "bank_name" TEXT,
ADD COLUMN "bank_branch" TEXT,
ADD COLUMN "bank_account" TEXT,
ADD COLUMN "bank_account_type" TEXT;
ALTER TABLE "field_consultants" ADD CONSTRAINT "field_consultants_bank_account_type_check" CHECK ("bank_account_type" IS NULL OR "bank_account_type" IN ('corrente', 'poupanca', 'pagamento'));

-- §41.4: e-mail de quem atendeu (≤ 120, minúsculo, validado no serviço).
ALTER TABLE "field_visits" ADD COLUMN "contact_email" TEXT;
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_contact_email_len_check" CHECK ("contact_email" IS NULL OR char_length("contact_email") <= 120);
