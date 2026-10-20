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
- [x] F2 pesquisa automática de estabelecimentos (migrações 20261019190000_place_search + 20261019200000_place_runs_reserved; contrato §22; env OVERPASS_URL, PLACES_USER_AGENT, APIFY_*; `migrate deploy` antes do código; Apify só com APIFY_ENABLED=true + APIFY_TOKEN no servidor; Overpass em Moema 500 m: 33 resultados em ~45 s, só 6 com telefone, 21 com rua; mapa e "bairro/endereço" ficam para depois)
- [x] F3 roteiro do dia + rota (migração 20261020100000_field_routes; contrato §23; flag `FIELD_ROUTES_ENABLED` (padrão false); `migrate deploy` antes do código; parâmetros em `app_settings.field_config` via `GET/PUT /v1/consultores/settings/config`; heurística NN + 2-opt em `api/src/domain/rota-rules.ts`, sem serviço pago. Pendências: aba "Mapa" do roteiro, `swap-reserve`, selo "você está a 40 m", extensão do `smoke.sh`, mediana real de minutos por visita, obrigatórias/retornos na seleção (F5))
- [x] F4 mapa de calor e cobertura (contrato §24; `GET /v1/consultores/heatmap`, só equipe, sem flag/env; migração 20261020200000_field_visits_lead_idx (índice aditivo) — `migrate deploy` antes do código; grade no banco (100/250/500/1000 m, teto 5.000 quadras), regras em `api/src/domain/heat-grid.ts`; tela `/consultores/calor`, Leaflet puro em canvas, sem dependência nova. Pendências: job de retenção dos pontos `track` (spec §6.2), pinos/tooltip de visita e multi-seleção de consultor (desvios §24.7), olhar a rampa sobre os tiles reais de Moema (UX §5.3), aba na lista em vez de link, camadas simultâneas)
- [x] F5 metas, alertas, follow-up (contrato §25; **sem migração, sem env, sem flag, sem @Cron**: tudo calculado na leitura. `GET /v1/consultores/attention` (meta/ritmo com a conta + alertas nao_iniciou/sem_registro/visita_aberta/ritmo_atrasado/parada_vencida), `GET /v1/consultores/followups` (equipe), `GET /v1/campo/followups` (só as visitas do consultor), `goal` em `GET /v1/campo/today`; limiares e `dias_trabalho` em `field_config` (mesmo `GET/PUT /v1/consultores/settings/config`); retorno vencido entra como parada prioritária no roteiro automático (§25.6, `retornos_no_roteiro`); regras puras em `api/src/domain/alerta-rules.ts` e `followup-rules.ts`; tela `/consultores` com Atenção agora, meta por consultor, retornos e limites; Hoje do consultor com meta e retornos. Fechamento 00:05: verificado, sem mudança (§25.7). Pendências: alerta "fora de rota", alerta "check-in longe do local", fim automático às 20:00, fila de leads quentes sem retorno marcado, mediana real de min/visita, botão "incluir no roteiro" na fila de retornos da equipe, olhar as telas no celular)
- [ ] F6 cadastro assistido com senha temporária (depende de F0 aprovada)
- [ ] F7 sync de cadastros confirmados
- [ ] F8 remuneração
- [ ] F9 Pix manual
- [ ] F10 Pix automático (conta Woovi separada)
