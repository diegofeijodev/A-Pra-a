-- Restante da Lovable, L11 (contrato §43.3): o razão aceita a parte do MÊS (`work_scope = 'month'`, `work_day` = dia 1 do mês).
-- Só ALARGA três CHECKs (DROP e ADD da mesma constraint, com o conjunto antigo contido no novo): nenhuma linha muda e o
-- trigger de imutabilidade (`field_earnings_immutable`) continua o mesmo. Sem índice novo; nenhum índice parcial tocado.
ALTER TABLE "field_earnings_ledger" DROP CONSTRAINT "field_earnings_ledger_scope_check";
ALTER TABLE "field_earnings_ledger" DROP CONSTRAINT "field_earnings_ledger_scope_kind_check";
ALTER TABLE "field_earnings_ledger" DROP CONSTRAINT "field_earnings_ledger_day_check";

ALTER TABLE "field_earnings_ledger"
  ADD CONSTRAINT "field_earnings_ledger_scope_check" CHECK ("work_scope" IN ('day', 'week', 'month', 'manual')),
  ADD CONSTRAINT "field_earnings_ledger_scope_kind_check" CHECK (("kind" = 'accrual') = ("work_scope" IN ('day', 'week', 'month'))),
  ADD CONSTRAINT "field_earnings_ledger_day_check" CHECK (("work_scope" IN ('day', 'month')) = ("work_day" IS NOT NULL)),
  ADD CONSTRAINT "field_earnings_ledger_month_day_check" CHECK ("work_scope" <> 'month' OR "work_day" ~ '^[0-9]{4}-[0-9]{2}-01$');
