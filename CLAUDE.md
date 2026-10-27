# CLAUDE.md — praça

Projeto independente dentro do workspace Freela (repo git próprio). Port do app
Lovable "PRAÇA" para a stack do Freela.

## Regras rápidas

- `api/` usa **npm**; `web/` usa **yarn**. Não misturar.
- Portas: API **3014**, web **3024**, Postgres **5437** (docker compose na raiz).
  3000/5432 são do Freela, 3010/3020/5433 do gestao-de-time, 3011/3021/5434 do
  plano-estrategico, 3012/3022/5435 do pedidos-online, 3013/3023/5436 do
  meu-par.
- **Contrato canônico da API: `docs/api-contract.md`.** Mudou endpoint? Atualize
  o contrato primeiro.
- Wire **snake_case** espelhando o banco. Data só-dia = `"YYYY-MM-DD"` em
  varchar; "hoje" vem de `todaySp()` (Brasília), nunca de `toISOString()`.
- Erros sempre `{ error: { code, message } }`; no web, ler com `apiErrorMessage()`
  de `modules/shared/infrastructure/http.ts` — **nunca achatar** para
  `error.message`.
- Envio de mensagens tem dois modos: `fila` (fila interna, dedup e agendador
  local) e `freela` (delega ao sistema de campanhas do api-freela). O modo vive
  em `app_settings.mode`.
- Catálogo estático (roteiro-modelo, etapas do funil, mensagens-padrão,
  cadências-modelo, mídia) vive em `src/domain/catalog/`, não no banco.
- Protótipo Lovable de referência fica em `.prototype/` (gitignored, só
  leitura) — telas portadas 1:1 (mesmo JSX/UX/textos).
- Integração com o Freela (`api-freela`) isolada em `src/modules/freela/`. Sem
  `FREELA_API_URL`/`FREELA_ADMIN_EMAIL`/`FREELA_ADMIN_PASSWORD` configuradas,
  `/v1/freela/*` responde `503 FREELA_NOT_CONFIGURED` em vez de quebrar o boot.
- `ValidationPipe` global tem `whitelist + forbidNonWhitelisted`: todo campo
  aceito precisa de decorator no DTO, e mandar a linha inteira de um GET num
  PATCH quebra com 400.
- Rotas estáticas **antes** das `:id` no controller — a ordem importa.
- Campo opcional que muda invariante NÃO leva default no DTO: `paused` da
  cadência e `status` da campanha ficam sem inicializador, e o serviço aplica
  "ausente = X no POST, mantém o atual no PUT". Com default no DTO, o
  `class-transformer` preenche o campo e o `PUT` não distingue "omitido" de
  "mandou o valor" — foi assim que o `PUT` de cadência despausava a trilha.
- A API roda em **uma** instância: os dois `@Cron` (motor de cadências e outbox
  do Freela) duplicariam mensagem com duas réplicas. Ver README, "Produção".
- Throttle é por rota + IP, e `req.ip` atrás de nginx é o IP do proxy: flag
  `TRUST_PROXY`. Os dois logins (`POST /v1/auth/login` e `/v1/campo/auth/login`)
  têm teto de **20/min por IP**; nenhum `smoke*.sh` passa de 6 logins da equipe
  (`smoke.sh` e `smoke-lovable-e.sh`) nem o `browser-check` (≈ 6 espalhados em
  minutos). Rodar vários smokes colados no mesmo minuto pode bater no teto (429).
- Id que vem da URL passa por `isUuid()` antes do Prisma: sem isso, id
  malformado vira 500 em vez de 404.
- Guarda de sessão do web vive em `app/(app)/layout.tsx`, não no `AppShell`:
  a página não pode montar (e disparar `useQuery`) sem sessão.
- **Casca da equipe (Lovable, contrato §46):** menu lateral azul-marinho com os nomes e a ordem da Lovable, montado por
  `modules/acesso/montarMenu` só pelo `features` do `GET settings/config` (nunca sondando 404); item ativo = o de prefixo
  mais longo (`itemAtivo`). Endereços num lugar só: `modules/acesso/domain/enderecos.ts` (`ROTA`, ainda os de hoje até a E7).
  Página inicial da equipe = SEMPRE o Dashboard (`ROTA.inicio`; sem `FIELD_DASHBOARD_ENABLED` ele mostra o aviso e a
  "Atenção agora"), nunca mais `/hoje`. **Chave do Comercial `TEAM_COMMERCIAL_ENABLED`** (padrão `false`, módulo GLOBAL
  `common/flags/ui.flags.ts`, que também dá `routes`/`earnings`/`payouts`/`declared_signups` ao `features`): desligada, o
  grupo "Comercial" (Funil, Entrada, Buscar estabelecimentos, Mensagens, Campanhas, Calendário, Indicadores, Ações, Freela),
  o sino e as seções do Comercial nas Configurações saem da tela; **a API, os dados e os motores não mudam** e o endereço
  direto continua abrindo (o `browser-check` visita essas telas pela URL).
- **Visual da Lovable (redesenho de 26/10, `docs/superpowers/plans/2026-10-26-ui-lovable-progresso.md`):** tema ÚNICO, claro —
  tokens de `garden-v2/src/styles.css` em `web/src/app/globals.css` (com os 4 ajustes de contraste da UX §1.2: `--destructive`,
  `--success`, `--warning`, `--input`), Manrope + Sora por `next/font` (variáveis no `<html>`), `bg-brand`, `shadow-card` e
  `card-surface` = cartão da Lovable. Sem `.light`, sem `ThemeSync` e sem botão de tema: `users.theme` segue no banco e no
  `PATCH /v1/users/me`, sem efeito na tela; mapas com `dark={false}`. Não reintroduza tema escuro sem pedido do dono.
- **Entrada única (redesenho E3, contrato §2):** `components/entrada/EntradaUnica.tsx`, a mesma em `/entrar` e `/campo/entrar` (o
  atalho instalado não sai do `scope: '/campo'`). Tenta a EQUIPE; só num 401 tenta o consultor; 429/rede/5xx da equipe param ali
  (`modules/entrada/domain/entrada.ts`, `decidirEntrada`). Entrar numa conta APAGA a outra do aparelho (a fila offline fica) e limpa o
  cache. Quem tem sessão não vê a entrada (`destinoDaSessao`: a equipe vence; consultor → `/campo/senha` ou `/campo`). O `(app)/layout.tsx`
  manda quem só tem `campoSession` para a casca dele (`destinoDoRepresentantePorEndereco`), nunca monta `CampoMotor`. Troca de senha no
  cartão da Lovable (`TrocarSenhaCartao`): equipe em `/trocar-senha` (link no rodapé do menu; `POST /v1/auth/change-password`, pede a atual,
  400 `WRONG_PASSWORD`, nunca 401), consultor em `/campo/senha` (fica dentro de `/campo`). Os dois logins comparam com um hash fixo
  (`common/auth/senha-falsa.ts`) quando o e-mail não existe. Troca OBRIGATÓRIA da equipe e `token_version` da equipe ficam para depois (D2).
- **Casca do representante (redesenho E4, arquitetura §3.6):** `campo/(sessao)/layout.tsx` monta a faixa azul (`FaixaRepresentante`: "Praça" + "Sair",
  que saiu do `CampoTopo`) e as 5 abas da Lovable (`AbasRepresentante`: Hoje, Mapa, Clientes, Desempenho, Carteira). Cada aba é uma VISÃO de `/campo`
  (`?v=mapa|clientes|desempenho|carteira`), trocada por `irPara` (`pushState`) num `<button>` — **nunca `Link`** (sem sinal a navegação do Next falha) e
  **sem `role="tab"`** (o "Lista | Mapa" das paradas usa esse papel no `browser-check`). `abaDaTela(tela)` (`use-tela.ts`) diz qual acende; `null`
  (nova, visita, cadastro, pedir-cupom, parada) esconde a barra, e o botão fixo da tela fica em `bottom-0`. Nas visões com abas, barra fixa de tela fica
  em `bottom-[calc(3.5rem+env(safe-area-inset-bottom))]`. As URLs das visões de antes não mudam (o teste confere). Ganhos, Pix, cadastros confirmados e
  "Resultado do dia" moram na Carteira; retornos, vouchers e "Visitados" (`GET /v1/campo/map/list`, só com `features.map_pins`) em Clientes; Desempenho
  é "Em construção" (`components/ui/EmBreve.tsx`) com atalho para o resultado do dia (D5). `destinoDoRepresentantePorEndereco` leva cada endereço
  compartilhado à visão equivalente (`/mapa` e `/consultores/mapa` → `?v=mapa`, `/financeiro` e `/consultores/pagamentos` → `?v=carteira`…).
- **Consultor de campo ≠ equipe.** Token com `aud: "campo"`; rotas `/v1/campo/*`
  marcadas com `@CampoRoute()` (o `JwtAuthGuard` global delega ao
  `CampoAuthGuard`). Rota nova do consultor SEM `@CampoRoute()` fica fechada
  para ele (e aberta só para a equipe) — é o comportamento seguro por padrão.
  No web, a sessão do consultor é `campoSession` (separada de `authUser`).
- **Índices únicos parciais (`field_journeys`, `field_visits`, `field_routes`,
  `field_route_stops`, `field_payouts`, `field_journey_breaks`, `field_vouchers`) não existem para o Prisma** (`field_journeys_one_open_per_consultant`,
  `field_visits_one_open_per_consultant`, `field_routes_one_active_per_day`,
  `field_route_stops_lead_day_unique`, `field_payouts_one_active_per_week`,
  `field_journey_breaks_one_open_per_journey`, `field_vouchers_one_coupon_per_contractor`). Toda `prisma migrate dev` futura vai propor `DROP INDEX` deles:
  gere com `--create-only`, **apague essas linhas do SQL** e aplique com
  `migrate deploy`. (Aviso espelhado em comentário na migração
  `20261008221516_consultores_de_campo`.)
- **Modo do chefe (contrato §31):** a flag `FIELD_VISIT_FLOW_SELECT_ENABLED` (padrão `false`) liga a escolha do fluxo da visita (`simples` | `completo`). Desligada, toda visita é `completo` e nada muda. O fluxo é gravado em `field_visits.flow` na abertura e o checkout o obedece; no web, `/campo` roteia pelas telas de `components/campo/simples/` só com a flag ligada e o fluxo resolvido `simples`. Os testes `*caracterizacao*` congelam o fluxo completo: não editar para "fazer passar". `scripts/smoke-modo-chefe.sh` roda com a flag LIGADA (não junto do `smoke.sh`).
- **Modo do chefe S2/S3 (contrato §32):** regra de pagamento ganhou 8 chaves OPCIONAIS (`normalizarRegra` preenche com o comportamento da v1; `REGRA_PADRAO` não muda e a config gravada fica crua) e a flag `FIELD_DECLARED_SIGNUPS_ENABLED` (padrão `false`, exige `FIELD_EARNINGS_ENABLED`) liga o ganho por cadastro declarado: declaração e anulação são fatos imutáveis (`field_declared_signups`/`_voids`, trigger como o razão). `*caracterizacao*` e `earnings-rules-chefe.spec.ts` congelam a v1: não editar para "fazer passar". Não mexa em `payouts.service.ts` ~238 (semana ≤ 0 não gera Pix e o negativo não é carregado) sem a S4. `scripts/smoke-modo-chefe-s3.sh` roda com as flags LIGADAS.
- **Restante da Lovable, lote A (contrato §23.1, §28.5, §33, §34):** `raio_checkin_m` (padrão 200 m, estrito, sem flag) e a versão 1 da regra com `is_initial`/`installed_at` (o `1970-01-01` gravado nunca muda). Painel do gestor, resumo/nota do dia e mapa de pinos atrás de `FIELD_DASHBOARD_ENABLED`, `FIELD_DAY_SUMMARY_ENABLED` e `FIELD_MAP_PINS_ENABLED` (padrão `false`; só leitura, sem migração). As chaves novas de `field_config` são grupos de `domain/config-grupo.ts`: `null` no PUT = ausente e só a chave enviada é gravada. O web descobre as flags pelo `features` do `GET settings/config` (equipe) e do `/campo/me` — **nunca** sondando rota desligada (404 derruba o `browser-check`). `scripts/smoke-lovable-a.sh` roda com as três ligadas (mais `FIELD_ROUTES_ENABLED` e `FIELD_EARNINGS_ENABLED`).
- **Restante da Lovable, lote B (contrato §35, §37):** checklist da visita + cronômetro atrás de `FIELD_CHECKLIST_ENABLED` e intervalo da jornada atrás de `FIELD_BREAKS_ENABLED` (padrão `false`; migrações aditivas `20261028100000_lovable_l3_checklist` e `20261029100000_lovable_l4_intervalo`). A foto do checklist fica em `VisitView.checklist`, **fora** de `answers` (o web reenvia `answers` no rascunho); `checklist` não nulo com a flag desligada = `422 CHECKLIST_DISABLED`, nulo = ignorado; a obrigatoriedade é lida da foto do check-in e só cobra com a flag ligada. O intervalo real entra no lugar do almoço configurado na conta do ritmo (nunca os dois); check-in, fim da jornada e meia-noite o encerram. `visits-checkout-caracterizacao.spec.ts` congela rascunho e checkout dos dois fluxos com os corpos reais do web: não editar para "fazer passar". `scripts/smoke-lovable-b.sh` roda com as flags ligadas; o `browser-check` cobre o fluxo **simples** de ponta a ponta (consultor próprio) além do completo (que ganha a exceção `visit_flow: completo` quando o simples é o padrão).
- **Restante da Lovable, lote C (contrato §36, §38):** segmentos editáveis da busca atrás de `FIELD_SEGMENTS_ENABLED` (consulta do Overpass montada no servidor por lista branca, nunca QL do cliente; os 5 tipos de hoje saem byte a byte iguais; desligada, a mensagem do `types` é a do class-validator de hoje, via `ValidateIf`), pedidos de cupom da 1ª contratação atrás de `FIELD_VOUCHERS_ENABLED` e o cupom real no Freela atrás de `FIELD_VOUCHER_COUPONS_ENABLED` (só vale com a anterior; desligada = `NoopIssuer`, nenhuma chamada ao Freela). Migrações aditivas `20261030100000_lovable_l5_segmentos` e `20261031100000_lovable_l6_cupons`. O pedido é um **fato** (trigger barra DELETE e congela consultor, lead, fotos e data; eventos só INSERT): `DELETE` de consultor ou de lead com pedido = `409 HAS_VOUCHER`, e o banco de teste só se limpa com `set session_replication_role = replica`. A configuração do cupom mora em `field_config.voucher` com rota própria (`/v1/consultores/vouchers/config`; o `PUT settings/config` não muda). O consultor pede pela fila (`voucher`, com `visit_ref` porque o lugar novo não tem `lead_id` no aparelho). `features.segments/vouchers/voucher_coupons` no `GET settings/config` e `features.vouchers` + `voucher_config` no `/me`. O relógio de 2 min do Freela refaz os cupons `aguardando_freela` (só com `FREELA_SYNC_ENABLED` e a conexão). `scripts/smoke-lovable-c.sh` exige a conexão do Freela VAZIA e o Overpass num endereço morto (o cabeçalho diz como subir); nunca um Freela real.
- **Restante da Lovable, lote D (contrato §39, §40):** divisão de uma área em N rotas + "Próximos dias" do consultor atrás de `FIELD_ROUTE_PLANS_ENABLED` (só vale com `FIELD_ROUTES_ENABLED`) e shoppings atrás de `FIELD_MALLS_ENABLED` (só vale com `FIELD_SEGMENTS_ENABLED` e `FIELD_ROUTE_PLANS_ENABLED`); padrão `false`; migrações aditivas `20261101100000_lovable_l7_planos`, `20261102100000_lovable_l8_shoppings` e `20261103100000_lovable_l8_busca_sem_area` (esta só relaxa o `NOT NULL` de `place_import_runs.area_id`, com CHECK: `lugares` sempre com área). Planos são rascunhos (`field_route_plans`/`_items`, arquiva, nunca apaga) e publicar uma rota chama o MESMO `RotasEquipeService.build` do `POST /v1/routes` (`ROUTE_EXISTS` sem `confirm_replace`; atribuições do mesmo item em fila no processo). `domain/divisao-rotas-rules.ts` (`dividirPorVarredura`, determinístico) e `domain/shopping-rules.ts` (área do polígono do OSM, critério de "grande" com a marcação à mão). Desligadas: `kind` ≠ `lugares` na busca, `scope` nos candidatos e as rotas novas = 404; busca, chave do cache, lista, candidatos, seleção automática e inscrição da cadência iguais aos de hoje (`filtroElegivel` em `rotas-plano.ts` é o `where` de sempre). Com os shoppings ligados, a lista de buscas mostra só as de `lugares`. A aba que abre em `/consultores/roteiros` continua "Dia de cada consultor" (o `browser-check` depende disso). `scripts/smoke-lovable-d.sh` roda com as flags ligadas e o Overpass num endereço morto (cancela as buscas); os testes usam a fixture `places/__tests__/fixtures/overpass-shoppings-bh.json` do dry-run, nunca o Overpass real.
- **Restante da Lovable, lote E (contrato §34.6, §41, §42):** regra de senha NOVA atrás de `PASSWORD_POLICY_ENABLED` (`domain/senha-rules.ts`; `app_settings.password_policy`, nulo = a da Lovable: 8+, maiúscula, número; `min_length` 8–12; vale só em `new_password` do campo, `PUT /v1/users/:id/password` e `POST /v1/users` — nunca no login nem na senha atual; `400 WEAK_PASSWORD`; `GET /v1/password-policy` é `@Public` e responde **200 sempre**, desligada = `{ enabled: false }`), endereço e banco do consultor atrás de `FIELD_CONSULTANT_PROFILE_ENABLED` (conta completa só para o admin, nunca em log nem no pagamento), e-mail de quem atendeu atrás de `FIELD_CONTACT_EMAIL_ENABLED` (`answers.contact_email` só com a flag; `null`/ausente ignorado e valor com a flag desligada = `422 CONTACT_EMAIL_DISABLED`; mascarado nas listas da equipe; `email` em `contato_campos` só com a flag) e o perfil gestor atrás de `TEAM_GESTOR_ENABLED` (`users.is_gestor`, lido do banco a cada request; desligada = o gestor é equipe e recebe o 403 de hoje). Flags num módulo GLOBAL (`common/flags/lovable-e.flags.ts`). Migrações aditivas `20261104100000_lovable_l9_cadastro` e `20261105100000_lovable_l10_gestor` (sem índice parcial novo). A senha provisória tem **12** caracteres com maiúscula, minúscula e número (com ou sem a flag). `GET /v1/consultores/map/list` (Clientes > Lista) usa a trava do mapa (`FIELD_MAP_PINS_ENABLED`); a do representante, `GET /v1/campo/map/list` (contrato §34.7, redesenho E4: recorte do §34.4 na praça ATIVA do token, sem `pracas`, sem `praca_id` na query), também. No web, o menu e a página inicial passaram à casca da Lovable (ver o item "Casca da equipe" acima). `scripts/smoke-lovable-e.sh` roda com as flags ligadas (o cabeçalho diz quais).
- **Restante da Lovable, lote F1 (contrato §43, §45):** bônus por período MENSAL atrás de `FIELD_EARNINGS_MONTHLY_ENABLED` e regra de pagamento POR CONSULTOR atrás de `FIELD_EARNINGS_PER_CONSULTANT_ENABLED` (padrão `false`; as duas exigem `FIELD_EARNINGS_ENABLED`). Migrações aditivas `20261106100000_lovable_l11_mensal` (só alarga três CHECKs do razão + o CHECK do dia 1; trigger intacto) e `20261107100000_lovable_l13_regra_consultor` (`field_pay_rule_versions.consultant_id` nulo, índice, FK Restrict); nenhum índice parcial novo; **o L12 começa em `20261108100000` ou depois**. Mês: `tiers_period: month` com a flag desligada = `409 MONTHLY_DISABLED` (antes da validação; os outros valores inválidos seguem o 400 de hoje); a parte do mês é um ALVO a mais da semana que contém o último dia (`work_scope=month`, `work_day=YYYY-MM-01`, `acc:month:YYYY-MM:n`), paga no Pix dessa semana (outubro → seg 02/11) ou, se ela já fechou, pelo mecanismo da confirmação tardia; os dias do mês só são lidos quando há versão mensal. **Desligar a flag do mês não reescreve o passado** (a versão mensal publicada continua valendo); **desligar a do consultor IGNORA as regras próprias** (decisão do orquestrador: semanas abertas voltam à geral e as fechadas dentro do prazo tardio ganham delta — por isso não deve existir regra por consultor em produção com a flag desligada). **`EarningsRepository.versoes()` devolve SÓ a regra geral (`consultant_id` nulo)** e é lido por remuneração, declarados, painel/resumo e Pix: NUNCA tire esse `where` (uma regra de consultor valeria para todos); as próprias vêm de `versoesDosConsultores`, chamado só com a flag. Por dia vale a do consultor (a partir da 1ª dele) ou a geral, nunca as duas (`domain/regra-consultor-rules.ts`); o calendário (semana, Pix, fechamento, prazo tardio) é sempre o da geral; `valid_from` só em semana ainda aberta dele (`409 WEEK_CLOSED`); gravada sob o lock do fechamento (`409 RULE_CHANGED` se mudar no meio). Rotas `GET/POST /v1/consultores/earnings/consultant-rules` só admin (gestor e equipe 403). Painel e resumo do dia contam pela fonte da regra GERAL. `earnings-servico-caracterizacao.spec.ts` (42 snapshots) congela o serviço de antes do lote: não editar para "fazer passar". `scripts/smoke-lovable-f1.sh` roda com as flags ligadas (o cabeçalho diz quais).
- **Restante da Lovable, lote F2 (contrato §44):** consultor em várias praças atrás de `FIELD_MULTI_PRACA_ENABLED` (padrão `false`; flag e serviço num módulo GLOBAL: `common/flags/multi-praca.flags.ts` + `common/pracas/pracas-do-consultor.{module,service}.ts`). Migração aditiva `20261108100000_lovable_l12_varias_pracas`: `field_consultant_pracas` guarda só as praças **além** da principal (conjunto = `field_consultants.praca_id` ∪ linhas; FK da praça Restrict) e `field_journeys.praca_id` (nulo = a principal; FK Restrict, **nunca** SET NULL; com a flag o início grava sempre o id explícito); nenhum índice parcial novo. **O isolamento continua uma praça por request:** com a flag, o `CampoAuthGuard` lê na MESMA consulta a jornada aberta e as extras e põe em `request.campo.praca_id` a praça ATIVA (a da jornada aberta, se ainda estiver no conjunto; senão a principal) e em `praca_principal_id` a principal — use `principalDe(c)` quando precisar da principal; desligada, o `select` e o `request.campo` são os de hoje. Rota nova do consultor que lê `c.praca_id` enxerga só a praça ativa; rota com `:ref` (ou `visit_ref`) que precise de praça usa a da jornada DA VISITA (`pracaDaJornada(journey.praca_id, principalDe(c))`) — a fila offline reenvia depois do `end`. `POST journeys/start` escolhe a própria praça (`praca_id?`; pedida no conjunto, senão a do roteiro de hoje, senão a principal; desligada, outra = `422 MULTI_PRACA_DISABLED`) e passa `{...c, praca_id}` ao roteiro automático. Na equipe, "consultores desta praça" = `PracasDoConsultorService.ondeAtua(pracaId)` (desligada = `{ praca_id }`); relatório por praça conta as visitas pela praça da jornada (`visitasNaPraca`); ganhos, Pix e cadastros seguem listados pela **principal**. `PUT /v1/consultores/:id/pracas` é só admin (`@AdminOnly()` no método). `DELETE /v1/pracas/:id` conta o conjunto e as jornadas (409). `scripts/smoke-lovable-f2.sh` roda com as flags ligadas (o cabeçalho diz quais).
- **Permissão da equipe = UMA marca por rota (lote E, §42.2):** `@AdminOnly()`, `@GestorOuAdmin()` ou `@Equipe()` (`common/decorators/admin-only.decorator.ts`), numa chave só (`PERMISSAO_KEY`) que o `JwtAuthGuard` resolve no nível mais específico (o método vence a classe). **Toda rota nova de ESCRITA da equipe (POST/PUT/PATCH/DELETE sem `@CampoRoute()`/`@Public()`) precisa de uma marca NO MÉTODO** — na classe só vale `@AdminOnly()` (o padrão restritivo). O teste de proteção `common/__tests__/permissoes-protecao.spec.ts` percorre todos os controllers do `AppModule` e derruba a suíte se faltar; a matriz `permissoes-gestor-matriz.spec.ts` exige que o conjunto `@GestorOuAdmin()` seja EXATAMENTE a tabela do §42.3 (rota nova de gestor = linha nova na tabela e no contrato). Regra por campo do gestor fica no serviço (`403 FORBIDDEN_FIELD` para Pix, modo da visita e banco; `place-searches` só `source = osm`).
- Fotos do campo passam pela API (`PhotoStorage`): nunca link público do bucket.
- Ao rodar verificações nesta máquina: **um build/typecheck por vez** (a
  máquina do usuário trava com builds paralelos). Prefira `tsc --noEmit`, o
  `smoke.sh` e o `browser-check.mjs` a `next build`.

## Regras de baixo consumo (máquina do dono)

A máquina do dono tem 7,6 GB de RAM e outros containers/projetos rodando —
ela **trava** (e já reiniciou sozinha) sob build/teste em paralelo. Ao rodar
verificações em `api/`:

1. **Nunca rode `npm run build` / `nest build`** durante uma tarefa comum. Se
   precisar confirmar que um JSON importado (`resolveJsonModule`) chega ao
   `dist/`, declare-o defensivamente em `nest-cli.json` →
   `compilerOptions.assets` (com `outDir` explícito) em vez de rodar o build
   para checar.
2. `jest.config.js` tem `maxWorkers: 1` — não reverta. Rode `npm test` só
   quando nenhum outro processo Node nosso (API, outro jest, etc.) estiver de
   pé.
3. Só UM de {jest, tsc, API, `next dev`, `browser-check`} de pé por vez.
   Para smoke test e browser-check, use `npm run start:smoke` (`ts-node --transpile-only`,
   sem `--watch`) em vez de `start:dev` — sobe uma vez, sem o watcher do
   Nest recompilando em segundo plano. Suba em background, espere
   `curl -s localhost:3014/health` responder, rode `npm run smoke`, e
   **mate o processo** em seguida (confira com
   `ss -ltn | grep -E ':(3014|3024) '` que as portas ficaram livres) antes de
   rodar qualquer outra coisa. O web do browser-check sobe com `yarn dev` —
   nunca `next build`/`next start`.
4. `npm run typecheck` (`tsc --noEmit`) roda **uma vez, sozinho**, no fim da
   tarefa. Nunca dois de {jest, tsc, API} ao mesmo tempo.

## Comandos

```bash
# api/
npm run start:dev | build | typecheck | lint | test | seed
npm run start:smoke                # sobe sem watcher (ts-node --transpile-only), pra smoke
npm run smoke                      # scripts/smoke.sh contra a API viva — 923 checagens com as flags desligadas (928 só com FIELD_EARNINGS_ENABLED), repetível sem resíduo
                                   # (menos sem o container `praca-postgres`: a limpeza final é por psql)
npm test                           # jest maxWorkers 1 — 137 suítes, 2102 testes (antes da E3 e da E4, que somaram 1 suíte/15 testes e 7 testes sem rodar a suíte inteira)
npm run prisma:migrate:dev | prisma:generate | prisma:studio

# web/
yarn dev | typecheck | lint        # `build` só se o dono pedir (ver abaixo)
yarn test                          # vitest run (fork único) — 37 arquivos, 401 testes
yarn browser-check                 # scripts/browser-check.mjs — 213 checagens na configuração de produção antiga (ROUTES, VISIT_FLOW_SELECT, EARNINGS, DECLARED_SIGNUPS, PAYOUTS; fluxo simples e completo); 263 com as flags dos lotes A–F ligadas (menos VOUCHER_COUPONS), com um passo logado como gestor e um consultor em duas praças; 263 também com TEAM_COMMERCIAL_ENABLED (mesmas checagens, outro ramo) — rodado depois da E4 (27/10)
                                   # precisa da API na 3014 (start:smoke) e do web na 3024 (yarn dev)
                                   # conta: PRACA_CHECK_EMAIL/PASSWORD (padrão = seed), login pelo formulário
```

O `browser-check` cria coisas de verdade (ação concluída, lead, disparo,
lançamento de indicador) e **apaga tudo no fim** — inclusive desfazendo a
conclusão da ação pela API (`POST /v1/actions/:id/uncomplete`), cada passo do
teardown no seu próprio `try`. Antes de começar ele afirma as pré-condições do
seed de que depende e faz uma faxina do que uma rodada interrompida possa ter
deixado. Resultado: o banco volta ao seed e o script roda de novo em seguida.
Ele falha em qualquer erro de console, `pageerror`, falha de rede
(`requestfailed`) ou resposta HTTP ≥ 400 — as exceções são o 404 do
`hot-update.json` do `next dev` (lista fechada `IGNORADAS`, com motivo no
script) e as recusas que o próprio roteiro provoca, cada uma numa janela só em
volta do passo e só para o par exato: `recusaEsperada` (o 401 do login da
equipe quando um representante entra pela tela única, via
`entrarComoRepresentante`; o 400 da troca de senha com a atual errada) e
`esperado401` (a sessão do celular caindo depois da senha nova). Sem o Freela configurado a tela do Freela só chama
`GET /v1/freela/status`, que responde 200.

## Onde fica o conteúdo

Conjuntos fechados (`String`/`Int` no Prisma, sem enum de banco) e o roteiro-
-modelo, etapas do funil, mensagens-padrão e cadências-modelo vivem no código
(`src/domain/catalog/`), não no banco. O texto vem sempre em pt-BR idêntico ao
protótipo.

## Referência do app original

O protótipo Lovable fica fora do repo (`.prototype/`, gitignored). As telas
foram portadas 1:1 (mesmo JSX/UX/textos); o estado que era um único objeto em
`localStorage` (`praca-v2`) virou banco com pessoas, praças, funil, mensagens,
cadências e campanhas.
