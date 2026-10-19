# Prospecção, rotas e automação — controle de progresso

Spec: `docs/superpowers/specs/2026-10-19-prospeccao-rotas-automacao-design.md` (arquitetura)
UX: `docs/superpowers/specs/2026-10-19-prospeccao-rotas-ux.md`

## Decisões padrão adotadas (dono pediu "gera o plano e vai implementando"; ajustar se ele disser outra coisa)
1. Cadastro pago: R$10 por empresa que fez o primeiro acesso; faixas 10→R$100, 20→R$250; sem piso abaixo de 10; tudo configurável. Só vale cadastro confirmado pelo Freela.
2. São Paulo/Rio permitidos por "áreas de atuação" (centro+raio); `EXCLUIR` do GeoService não muda.
3. Pesquisa: OSM/Overpass primeiro; Apify atrás de flag (teto 3.000 lugares/mês; token digitado pelo dono no servidor).
4. api-freela NÃO é alterado sem aprovação explícita (deploy automático em produção): F0 fica como proposta em PR separado.
5. Pix: manual primeiro, automático depois.
6. Consultor pode pular/adiar com motivo; não apaga paradas.
7. Só admin dispara busca; resultado passa por revisão antes de virar lead.

## Regras de execução
- Sem build/jest/tsc simultâneos; jest maxWorkers 1; nunca nest build/next build. Um processo pesado por vez; Postgres local desligado ao fim.
- Segredos só pelo dono, no servidor. Push só pelo dono (`!`).
- Atualizar docs/api-contract.md ANTES de endpoint novo. Migrations com `--create-only` (índices parciais).
- Cada fase: flag, testes, commit próprio na branch `feat/prospeccao`. Deploy em produção só com fase concluída e avisando o dono.

## Fases (marcar ao concluir)
- [ ] F0 proposta api-freela (só documento/PR rascunho)
- [x] F1 áreas de atuação (migração 20261019150000_field_areas; sem env; aplicar `migrate deploy` antes do código)
- [ ] F2 pesquisa automática de estabelecimentos
- [ ] F3 roteiro do dia + rota
- [ ] F4 mapa de calor e cobertura
- [ ] F5 metas, alertas, follow-up
- [ ] F6 cadastro assistido com senha temporária (depende de F0 aprovada)
- [ ] F7 sync de cadastros confirmados
- [ ] F8 remuneração
- [ ] F9 Pix manual
- [ ] F10 Pix automático (conta Woovi separada)
