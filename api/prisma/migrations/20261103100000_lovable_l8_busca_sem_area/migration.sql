-- Restante da Lovable, lote D, L8 (contrato §40.3): a busca de lojas dentro de um shopping não tem área de atuação (o "lugar" é o
-- shopping) e a de shoppings pode usar o centro da praça. Só RELAXA o NOT NULL de `place_import_runs.area_id`: nenhuma linha muda e
-- toda busca de `lugares` continua com a área (a tela de hoje só lista as de `lugares`). Sem DROP INDEX dos índices parciais.
ALTER TABLE "place_import_runs" ALTER COLUMN "area_id" DROP NOT NULL;
ALTER TABLE "place_import_runs" ADD CONSTRAINT "place_import_runs_area_lugares_check" CHECK ("kind" <> 'lugares' OR "area_id" IS NOT NULL);
