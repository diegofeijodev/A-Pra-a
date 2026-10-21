# Praça: portabilidade do restante da versão Lovable do chefe (desenho, sem implementação)

Data: 2026-10-20. Base: `docs/superpowers/specs/2026-10-20-comparacao-versao-lovable-chefe.md` (§2–§5), `…-modo-chefe-arquitetura.md` (eixos A/B/C), contrato §21–§32, `api/prisma/schema.prisma`, `api/src/domain/*`. Lovable lida só como dado (`G/` = `scratchpad/garden/`); nada executado, `.env` não aberto. api-freela lido em `origin/main a96ffb49` (só leitura).

## 0. Regras que valem para todas as fases

- **Diretiva do dono:** padrão = comportamento da Lovable, tudo configurável pela tela, nossas versões preservadas como opção. Onde este documento contraria a arquitetura do modo chefe (§5/§6.6: `ui_resumo_dia = numeros`, vouchers e shoppings fora), vale este.
- **Fora, por segurança ou por regra:** `bootstrapAdmin` com senha fixa; Google Places gravando conteúdo e atualizando pelo `place_id`; pagamento sem ledger e "Desfazer" que apaga a linha; login com `@praca.local`; chave do Google no bundle; dia em UTC.
- **Flag própria por módulo, padrão `false`,** em `env.validation.ts`, `docker-compose.yml`, `.env.example` e `env-places.spec.ts`. O `docker-compose.prod.yml` usa `env_file: .env`: ligar em produção = uma linha no `/opt/praca/.env` e reiniciar. Desligada: `404 <MÓDULO>_DISABLED`, `features.<x> = false` no `/me`, o web não manda campo novo, e campo novo com `null` vale como ausente (`null` nunca gera 422, lição do `result: null` da S1).
- **Padrões do repo:** contrato antes do código (§33 em diante); TDD em `src/domain`; centavos; snake_case; `todaySp()`; isolamento `id` + `praca_id`; `@CampoRoute()` / `@AdminOnly()`; `@Cron` com `try/catch`, reentrância, instância única, reaproveitando relógios existentes; web sem storage novo fora de `auth.storage.ts`. Os schemas zod do web não são `.strict()` (conferido): campo aditivo na resposta é seguro.
- **Migrações** aditivas, depois de `20261027100000`, com `--create-only` e sem `DROP INDEX`. Índices parciais novos (entram na lista do `CLAUDE.md` e no teste de migração): `field_journey_breaks_one_open_per_journey` e `field_vouchers_one_coupon_per_contractor`. Ordem de subida: `migrate deploy`, API, web.
- **Linha de base da regressão,** em toda fase, com todas as flags novas desligadas: `*caracterizacao*` e `earnings-rules-chefe.spec.ts` intocados; `smoke.sh` (882), `smoke-modo-chefe*.sh` e `browser-check` (155) idênticos; teste de payload com os corpos atuais do web (rascunho completo com `result: null`, PATCH e `POST /v1/routes` sem campos novos).

---

## Item 1. Checklist de abordagem (§35, `FIELD_CHECKLIST_ENABLED`)

**Lovable:**
- 7 etapas semeadas em `configuracoes.checklist_visita` (`G/drizzle/migrations/0000_migration.sql:130`).
- No check-in, a lista é fotografada como `{item, feito:false, obs:''}` (`G/src/routes/_authenticated/roteiro.$rotaId.tsx:180`).
- Na tela há um checkbox e uma observação por etapa (`:255-267`); tudo é gravado no finalizar (`:236`).
- **Não é obrigatório:** `pendenciasFinalizar` ignora o checklist (`G/src/lib/visita.ts:35-46`).

**Desenho:**
- **Configuração** (`field_config`):
  - `checklist_items: [{id, text}]`: 1–20 itens; `id` com `^[a-z0-9_]{1,40}$`, estável e gerado pelo servidor; `text` com 1–120 caracteres;
  - `checklist_obrigatorio: 'nao' | 'todas'`;
  - `checklist_fluxos: ['simples','completo']`.
- **Migração:** `field_visits.checklist JSONB NULL`, a coluna já reservada no §31.8.
- **Foto no check-in:** quando a flag está ligada e o fluxo da visita está em `checklist_fluxos`, o servidor grava `{required, items:[{id,text,done:false,note:null}]}`.
- **Wire:** `AnswersBody.checklist?: [{id, done?, note? (≤200)}] | null`, sem default no DTO.
  - Id desconhecido é ignorado (o aparelho offline pode ter uma lista mais velha).
  - Valor não nulo com a flag desligada responde `422 CHECKLIST_DISABLED`.
- **Checkout:** só cobra quando a foto diz `required = 'todas'` (`422 ANSWERS_INCOMPLETE`, "Falta: roteiro da visita (etapas 3, 5)").
  - A regra é avaliada contra a foto do check-in, nunca contra a configuração de agora. Assim, ligar a obrigatoriedade não trava uma fila offline antiga.
- **Exibição:**
  - `VisitView.answers.checklist` traz a foto;
  - `/me.visit_config.checklist_items` permite mostrar a lista sem sinal;
  - o evento do CRM leva só a contagem ("Roteiro: 5/7 etapas"), nunca as observações.
- **Domínio:** `domain/checklist-rules.ts`, com `fotografarChecklist`, `mesclarMarcas` e `pendenciasChecklist`.
- **Junto, na mesma flag:** o cronômetro mm:ss da visita aberta (Lovable `roteiro…:223-227, 252`), só na UI, contado a partir de `checkin_at`.

**Padrão e configuração:**
- Padrão Lovable: as 7 etapas, não obrigatório, nos dois fluxos.
- O botão "Perfil do chefe" (que hoje preenche o modo da visita) passa a preencher também o checklist.

**Nossa versão:** sem checklist. Fica disponível esvaziando `checklist_fluxos` ou desligando a flag.

**Testes:**
- foto imutável depois de a configuração ser editada;
- id desconhecido é ignorado;
- `checklist: null` no fluxo completo não gera 422;
- check-in enfileirado antes de ligar a flag fica sem foto e passa no checkout;
- obrigatoriedade lida da foto;
- caracterização do completo intacta.

## Item 2. Resumo e nota do dia (§33.2, `FIELD_DAY_SUMMARY_ENABLED`)

**Lovable:**
- `resumoRota` (`visita.ts:49-72`):
  - tempo total = `fim_rota − inicio_rota`;
  - intervalo = soma dos pares de início e fim de intervalo;
  - cumprimento = `min(1, visitados/planejados)`;
  - positivação = `cadastros/visitados`;
  - `nota = round1(cumprimento×7 + min(1, positivação/0,3)×3)`;
  - 7 frases de avaliação.
- A tela "Resultado do seu dia" aparece quando a rota está encerrada (`roteiro…:118, 298-323`).

**Desenho:**
- **Domínio:** `domain/resumo-dia-rules.ts`, função pura, resolvida no servidor. As frases vão para o catálogo `domain/catalog/resumo-dia.ts`.

  ```text
  resumoDia({ jornadas, pausas, planejadas, visitadas, cadastros, fonte, cfg })
    → { total_min, intervalo_min, trabalhado_min, cumprimento, positivacao, nota, avaliacao[], conta[] }
  ```
- **Entradas:**
  - `planejadas` = paradas `planejada` não descartadas do roteiro ativo do dia; sem roteiro, `meta_diaria` (*decisão do arquiteto*).
  - `visitadas` = paradas `visitada` com checkout; sem roteiro, as visitas do dia com checkout. O critério segue `contaNaMeta` (§31.6).
  - `cadastros` saem de `cadastrosDoDia(dia)`, que segue a `signup_source` da versão vigente no dia:
    - `declared`: declarações não anuladas do `declared_day`;
    - `freela_confirmed`: `field_signups` com o evento da `confirmation_rule` no dia.
  - A função `cadastrosDoDia` é a mesma do painel (item 3).
  - Dia sempre `field_journeys.day` (Brasília); tempos com as pausas do item 7, quando existirem.
- **A conta escrita precisa dizer duas coisas:**
  - com `freela_confirmed` e o sync desligado (produção hoje), a positivação é 0 e a nota máxima é 7;
  - os confirmados do dia não são a mesma coorte das visitas do dia.
- **Rotas:**
  - `GET /v1/campo/day-summary?day=` (`@CampoRoute`, só do próprio consultor, até 35 dias para trás);
  - `GET /v1/consultores/:id/days/:day/summary` (equipe).
- **Sem migração:** é calculado na leitura, com "calculado às HH:MM", porque uma confirmação tardia muda a nota.

**Padrão e configuração** (`field_config`):

| Chave | Valores | Padrão |
|---|---|---|
| `ui_resumo_dia` | `nota` \| `numeros` \| `desligado` | `nota` (Lovable) |
| `nota_peso_rota` / `nota_peso_conversao` | inteiros que somam 10 | 7 / 3 |
| `nota_meta_conversao_pct` | 1–100 | 30 |
| `nota_intervalo_alerta_min` | minutos | 75 |

A frase do voucher (`visita.ts:68`) só aparece com `FIELD_VOUCHERS_ENABLED` ligada; sem ela, a frase vira "reforce os benefícios" (*decisão do arquiteto*).

**Nossa versão:** `numeros` (só os números, com a conta).

**Testes:**
- vetores da Lovable: 20/20 visitas com 6 cadastros dá 10; meia rota sem cadastro dá 3,5;
- dia de Brasília perto da meia-noite;
- sem roteiro;
- `declared` e `confirmed` com o sync desligado;
- isolamento: consultor A não lê o resumo de B (404).

## Item 3. Painel do gestor (§33.1, `FIELD_DASHBOARD_ENABLED`)

**Lovable:**
- Tela `inicio.tsx:35-131`, com períodos Hoje/7/30/90 e atualização a cada 60 s.
- 8 indicadores, ranking e "Resultado das visitas" por status.
- Fórmulas em `indicadores.ts:6-44`: tempo médio = intervalo entre registros consecutivos com até 120 min (`:4`), mas por dia **UTC** (`:24`, `inicio.tsx:31`).

**O que já existe e é reaproveitado:**
- `GET /v1/consultores/attention`: meta e ritmo de hoje, com a conta;
- a lista `/v1/consultores`, com os contadores do dia;
- o resumo de cobertura do heatmap (§24);
- os relatórios de cadastros (§27.8) e declarados (§32.6);
- ganhos (§28).

**O que falta:** período, percentual de concluídas no roteiro, positivação, tempo médio, ranking, resultado por categoria e os indicadores de vouchers, praças abertas e leads mapeados.

**Desenho:**
- **Rota:** `GET /v1/consultores/dashboard?from&to&praca_id` (equipe; até 92 dias). A agregação é feita no banco, por `field_journeys.day`.
- **Resposta:**

  ```text
  { kpis: { planned_stops, done_stops, pct_done, visits, visited_leads, signups, positivation,
            avg_gap_min, avg_duration_min, vouchers: {approved, pending} | null,
            pracas_open, consultants_active, leads_mapped },
    ranking: [{ consultant_id, name, visits, signups, positivation }],
    by_result: [{ code, label, color, n }],
    conta: { <kpi>: string },
    fonte }
  ```
- **Regras:**
  - Cada número sai com a sua conta.
  - O ranking ordena por cadastros e depois por positivação (`indicadores.ts:41-42`).
  - `by_result` usa `categoriaDoLead` (item 4).
  - "Praça aberta" = `start_date ≤ hoje`, derivado das datas da praça, sem coluna nova.
- **Domínio:** `domain/painel-rules.ts`, com os intervalos entre visitas (≤ `painel_gap_max_min`, padrão 120) e a positivação.
- **Web:** nova tela `/consultores/painel`; a tela "Atenção agora" continua igual.

**Padrão e configuração:**
- `painel_tempo_medio: 'intervalo' | 'duracao'`, padrão `intervalo` (Lovable). Os dois valores voltam na resposta, e o número grande segue a chave.

**Nossa versão:** a tela "Atenção agora" e os relatórios atuais, sem mudança.

**Testes:**
- borda do dia em Brasília;
- praça A não soma na B;
- token de consultor gera 401;
- leitura sem N+1 (quantidade fixa de consultas).

## Item 4. Mapa de pins (§34, `FIELD_MAP_PINS_ENABLED`)

**Lovable** (`mapa.tsx`):
- mostra só praças abertas (`:21-22`);
- pagina de 1.000 em 1.000 no cliente (`:31-44`);
- filtro por praça e legenda clicável com contagem (`:45-77`);
- cores de `status.ts:1-10`;
- o representante também tem a aba Mapa (`route.tsx:38`).

**Desenho:**
- **Rota principal:** `GET /v1/consultores/map/pins?praca_id?&mode=resultado|estagio&bbox?&cursor?&limit≤2000`, que responde:

  ```text
  { legend: [{ code, label, color, n }],
    pins: [[id, lat, lng, code]],
    next_cursor, truncated, without_location, conta }
  ```
  - A legenda é um `GROUP BY` sobre o filtro inteiro, não sobre a página.
  - Leads `archived = false` e `is_test = false`, com `lat`/`lng`.
- **Detalhe ao clicar:** `GET /v1/consultores/map/pins/:lead_id` devolve nome, endereço, estágio e última visita (dia, resultado, consultor), sem telefone.
- **Visão do consultor:** `GET /v1/campo/map/pins` (`@CampoRoute`, mesma flag). Mostra só leads dos roteiros dele e leads visitados por ele, na praça ativa, como a RLS do representante na Lovable.
- **Domínio:** `domain/pin-rules.ts`, com `categoriaDoLead(lead, ultimaVisitaComCheckout, declaracao)`:

  | Categoria | Quando |
  |---|---|
  | `a_visitar` | sem visita com checkout |
  | `cadastrado` | declaração não anulada, estágio ≥ 5 ou resultado `cadastrou`/`cadastrou_qr` |
  | `ja_usa` | já usa o Freela (categoria nossa) |
  | `nao_contrata` | `refusal_reason = nao_contrata_freelancers` |
  | `nao_cadastrado` | sem interesse ou não cadastrou |
  | `fechado` | `outcome = fechado` |
  | `retornar` | Lovable "retornar/ligar depois", unidos como no fluxo simples |

  Cores da Lovable. No `mode=estagio`, cores das etapas do funil (`catalog/funnel`).
- **Web:**
  - Leaflet com `preferCanvas` e `circleMarker`, até 10 mil pontos; acima disso, `truncated`;
  - esconder uma categoria é estado do React;
  - texto do tooltip por `textContent` (lição do XSS do bloco A).
- **Junto, na mesma flag:**
  - `classificarTelefone` (fixo ou WhatsApp, Lovable `format.ts:49-56`), para mostrar o botão WhatsApp só em celular;
  - na fase 2, o filtro "resultado da última visita" na lista de leads, reusando `categoriaDoLead` (Lovable `clientes.tsx`).

**Padrão:** `mode=resultado` e praças abertas.

**Nossa versão:** o mapa de calor (§24) continua na sua aba.

**Testes:**
- tabela de `categoriaDoLead`;
- contagem igual à soma das páginas;
- isolamento por praça;
- o consultor não vê lead que não está no roteiro dele.

## Item 5. Vouchers e o cupom do Freela (§38, `FIELD_VOUCHERS_ENABLED` + `FIELD_VOUCHER_COUPONS_ENABLED`)

**Lovable:**
- **Dados** (`0005_vouchers.sql:1-20`): `nome_cliente` em texto livre, `uf`, `cidade`, `ramo`, `freelas_semana ≥ 0` e status `pendente | aprovado | reprovado`.
- **Fluxo** (`vouchers.tsx`):
  - o representante solicita (`:53-64`);
  - **só o admin** avalia (`:124`); o gestor só lê;
  - a reprovação tem motivo opcional (`:68`).
- **Indicador** no painel (`inicio.tsx:55,79`).
- **Sem cupom real.**

**Dono, 20/10:** "é um cupom que já existe no Freela, de 1ª contratação".

**api-freela (verificado):**
- **Criação:** `POST /v1/admin/coupons` (`coupons-admin.controller.ts`), protegido só por `JwtAdminGuard`, sem guarda de permissão. O único `APP_GUARD` é o Throttler (`app.module.ts:227`). Portanto qualquer conta admin ativa serve.
- **Conflito:** `create` responde **`400 COUPON_CODE_TAKEN`** (não é 409), conferido antes do insert. Numa corrida, o unique do banco vira 5xx.
- **Leitura:** `GET` devolve **todos** os cupons, sem filtro, sem paginação e sem busca por código. As respostas vêm em `{ data }`.
- **Uso:** `unredeemByVacancy` devolve o cupom quando a vaga é cancelada, então "usado" pode voltar atrás.
- **Cupom de 100%:** a vaga é concluída sem gateway (`payments-handlers.spec.ts:303`). O desconto cobre **a vaga inteira** e vale em **qualquer vaga** do contratante. A plataforma paga o repasse.
- **Busca de contratante:** existe só `GET /v1/admin/crm/contractors/search?q=` (`crm.controller.ts:152`, `crm.service.ts:193-238`):
  - busca por **nome**, com `contains`, mínimo de 2 caracteres e até 10 resultados;
  - inclui `casa` (Em Casa, encerrado);
  - **não há busca por CNPJ nem telefone**.

**Desenho:**

**Dados** (migração `…_field_vouchers`):
- `field_vouchers`:
  - **pedido:** `id`, `client_id` UNIQUE, `consultant_id` (FK Restrict), `praca_id` (foto), `lead_id` (**obrigatório**, FK Restrict), `visit_id?` (SetNull);
  - **fotos do pedido:** `company_name`, `uf`, `city`, `segment`, `freelas_per_week ≥ 0`;
  - **decisão:** `status` CHECK `pendente | aprovado | reprovado | cancelado`, `decision_reason`, `decided_by`, `decided_by_name`, `decided_at`;
  - **vínculo com o contratante:** `contractor_user_id?`, `contractor_source` CHECK `company_signup | signup_sync | manual`;
  - **cupom:** `coupon_code` UNIQUE, `coupon_id`, `coupon_status` CHECK `nao_aplicavel | aguardando_vinculo | aguardando_freela | criado | usado | vencido | desativado | erro`, `coupon_params jsonb` (fotografado na aprovação), `coupon_error_code`, `coupon_error`, `coupon_attempts`, `coupon_synced_at`, `redeemed_at`, `created_at`.
- Um trigger barra `DELETE` e qualquer mudança em consultor, lead, `client_id`, nas fotos e em `created_at`. O estado só muda por transição com compare-and-set e evento na mesma transação, como em `field_payouts`.
- `field_voucher_events`: só INSERT (trigger). Tipos `requested | approved | rejected | contractor_linked | coupon_created | coupon_adopted | coupon_failed | coupon_redeemed | coupon_unredeemed | coupon_expired | coupon_deactivated`. Nunca leva telefone nem e-mail.
- Índice parcial **`field_vouchers_one_coupon_per_contractor (contractor_user_id) WHERE coupon_status IN ('aguardando_freela','criado','usado')`**: um cupom do Praça por contratante em toda a vida, que é o que dá sentido a "1ª contratação".
  - `usado` precisa estar no predicado por dois motivos. Uma rede ou um lead duplicado tem outro `lead_id`, então só o limite por empresa não segura. E `unredeemByVacancy` devolve o cupom usado para ativo.
  - `vencido`, `desativado` e `erro` liberam um cupom novo **só por decisão do dono**. Até lá, o serviço também recusa (`409 CONTRACTOR_ALREADY_HAS_COUPON`).
- O limite por empresa é configurável, então é conferido no serviço, sob `pg_advisory_xact_lock('voucher-lead:'||lead_id)`.

**Rotas do consultor** (`@CampoRoute`):
- `POST /v1/campo/vouchers {client_id, lead_id, visit_id?, segment, freelas_per_week, uf?, city?}`:
  - o lead tem de ser da praça ativa (senão 404);
  - `409 VOUCHER_LIMIT_REACHED` acima do limite;
  - reenvio idempotente pelo `client_id`; entra como item da fila offline.
- `GET /v1/campo/vouchers`: só os dele, com o **código e o estado do cupom** depois de criado.

**Rotas da equipe** (leitura: equipe; escrita: admin):
- `GET /v1/consultores/vouchers?status&praca_id&consultant_id&from&to`;
- `GET /v1/consultores/vouchers/:id`, com os eventos;
- `POST …/:id/approve {client_id, note?, contractor_user_id?}`;
- `POST …/:id/reject {client_id, reason (3–500)}`;
- `GET …/:id/contractor-candidates`;
- `POST …/:id/link-contractor {client_id, contractor_user_id}`;
- `POST …/:id/coupon/retry`;
- `POST …/:id/coupon/deactivate {reason}`, que vira `PATCH active=false` no Freela.

**Vínculo com o contratante, nesta ordem:**
1. `field_company_signups.freela_user_id` do lead (§26);
2. `field_signups.freela_user_id` com `lead_id` igual e pareado (§27);
3. **escolha manual do admin** na lista do CRM, filtrada por `module = bars-restaurants`.

Nunca se vincula automaticamente por nome. Em produção hoje (F6 e F7 desligadas) só vale o passo 3.

**Criação do cupom (fora da transação do banco):**
- **Aprovação:** muda o estado para `aprovado` e o cupom para `aguardando_vinculo` ou `aguardando_freela`, com evento.
- **Depois do commit:** uma tentativa imediata. O relógio de 2 min do Freela que já existe (`freela-sync.scheduler.ts`) refaz o que estiver em `aguardando_freela`, até 20 por rodada, com espera crescente por `coupon_attempts`.
- **Código determinístico:** `PRACA-` + 10 caracteres base32 do uuid do voucher.
- **Chamada:** `FreelaClient.createCoupon` (validada com zod), com `{code, discountType, percentOff | amountOffInCents, contractorUserId, singleUse, minJobHours?, expiresAt?}`.
- **Conflito:** em `400 COUPON_CODE_TAKEN` ou 5xx, a API relê a lista.
  - Se o cupom tem o mesmo código, o mesmo `contractorUserId` e o mesmo desconto, ela adota (`coupon_adopted`), como na adoção do §20.6.
  - Senão, grava o erro fixo `COUPON_CODE_CONFLICT`, que o relógio não repete.
- **Freela sem configuração** (`FREELA_ADMIN_*` vazio em produção): o cupom fica em `aguardando_freela` com "Aprovado — aguardando conexão com o Freela", e o log avisa no máximo uma vez por hora.
- **Ponto de extensão:** porta `VoucherCouponIssuer`. Com `FIELD_VOUCHER_COUPONS_ENABLED=false` entra o `NoopIssuer`: o cupom fica `nao_aplicavel` e o voucher é só registro, exatamente como na Lovable.

**Leitura do estado do cupom:**
- No mesmo relógio, a cada `voucher_sync_min` (padrão 30) e só se houver cupom em `criado` ou `usado`.
- Lê `GET /v1/admin/coupons` e filtra os códigos `PRACA-` conhecidos.
- `redeemedAt` dá `usado`; voltar a nulo dá `coupon_unredeemed`; `active=false` dá `desativado`; `expiresAt` passado dá `vencido`.
- **Custo anotado:** a lista cresce com todos os cupons do Freela. Se pesar, proponha ao Freela um `?codePrefix=` (não faz parte desta fase).

**Padrão e configuração** (`field_config.voucher`):

| Chave | Padrão | Origem |
|---|---|---|
| `max_por_empresa` | 1, contando pendente + aprovado | pedido do dono; a Lovable não tem limite |
| `discount_type` | `PERCENT` | dono: "1ª contratação grátis" |
| `percent_off` | 100 | dono |
| `amount_off_cents` | nulo | |
| `single_use` | `true` | |
| `validade_dias` | 30 | *decisão do arquiteto*; `null` = sem validade |
| `min_job_hours` | nulo | |
| `motivo_reprovacao` | obrigatório | *decisão do arquiteto*; desvio da Lovable, que tem motivo opcional |

- Só o admin aprova, como na Lovable.
- **Desvio por regra:** a Lovable usa nome em texto livre. Aqui o `lead_id` é obrigatório; sem ele o limite "1 por empresa" não existe.

**Nossa versão:** sem vouchers.

**Riscos:**
- Cupom de 100% sem teto, em qualquer vaga do contratante, não garante "1ª contratação": é decisão do dono (§D1).
- Busca do CRM só por nome.
- `GET` sem paginação.

**Testes:**
- isolamento: consultor A × B, praça A × B na lista;
- idempotência por `client_id`;
- limite sob concorrência (duas requisições em paralelo);
- aprovar duas vezes gera `409 INVALID_TRANSITION`;
- criação idempotente: um timeout seguido de nova tentativa adota o cupom;
- conflito com outro contratante gera erro fixo;
- Freela sem configuração fica em `aguardando_freela`;
- trigger barra UPDATE das fotos e DELETE;
- índice impede dois cupons ativos por contratante;
- `FIELD_VOUCHER_COUPONS_ENABLED=false` nunca chama o Freela. Testar com um `FreelaClient` falso **com estado** (cupons em memória), conferindo o resultado e não só a chamada.

## Item 6. Shoppings (§40, `FIELD_MALLS_ENABLED`; depende dos itens 8 e 11)

**Lovable** (`rotas.tsx`):
- "shopping grande" = `total_avaliacoes ≥ 2500` do Google (`:16-18`);
- mapeia `shopping_mall` numa grade 3×3 sobre a cidade (`:130-161`);
- rota dos shoppings (`:164-175`);
- lojas internas: busca ±0,0025° e ≤ 300 m, grava `shopping_id` e cria uma rota interna por shopping (`:178-224`; `0004`);
- a aba "Clientes" exclui shoppings e lojas internas (`:62, :113`).

**Viabilidade real do Overpass:**
- **Shopping:** `shop=mall` existe e é confiável como polígono (way ou relation) nas capitais. A área sai do polígono (`out geom`).
- **Lojas internas:** `map_to_area` no polígono, depois `nwr(area)[shop|amenity…]`.
  - O mapeamento interno dos shoppings brasileiros no OSM é **irregular**: muitos têm só a praça de alimentação e as âncoras, ou nada.
  - "Nº de lojas mapeadas" mede a **qualidade do mapeamento**, não o tamanho.
  - Shopping mapeado só como ponto: há fallback por raio, marcado como menos confiável.
- **Não rodei o Overpass:** pré-requisito da fase é um *dry-run* com um curl em BH (BH Shopping, Diamond, Boulevard, Pátio Savassi) para calibrar.
- **Fallback das lojas:**
  - "Adicionar loja ao shopping" na mão (cria um lead com `parent_lead_id`);
  - ou Apify restrito ao polígono, já atrás de `APIFY_ENABLED` e do teto mensal, com a mesma política de não guardar avaliação nem horário.

**Desenho:**
- **Dados** (migração):
  - `leads.place_kind TEXT NULL CHECK ('shopping')`;
  - `leads.parent_lead_id UUID NULL` (FK leads, `SET NULL`), com índices `(parent_lead_id)` e `(praca_id, place_kind)`;
  - `lead_mall_metrics`: `lead_id` PK, `source_ref`, `geometry_kind 'poligono'|'ponto'`, `area_m2?`, `pois_mapped?`, `measured_at`, `large_override bool?`;
  - `place_import_runs.kind TEXT NOT NULL DEFAULT 'lugares'` (`lugares | shoppings | lojas`) e `parent_lead_id?`;
  - `place_candidates.metrics jsonb?`.
- **Cache:** a chave inclui `kind` e `parent_lead_id`. Com a flag desligada, a fórmula de hoje.
- **Busca:**
  - `POST /v1/place-searches` aceita `kind:'shoppings'`, com raio de até 30 km e sem tipos, ou `kind:'lojas'` com `parent_lead_id` e `types` (perfil, item 8);
  - com a flag desligada, `kind ≠ lugares` responde `404 MALLS_DISABLED`;
  - "Adicionar como leads" grava `place_kind`, o `parent_lead_id` e as métricas;
  - lead de shopping fica **fora do `autoEnroll`** da cadência (`cadence-engine.service.ts:167-171`, acréscimo `place_kind: null`; nenhum lead existente muda); lojas internas entram na cadência como qualquer lead da F2.
- **Rotas próprias:**
  - `GET /v1/consultores/shoppings?praca_id`: métricas, `is_large`, a conta do critério e o número de lojas;
  - `PATCH /v1/consultores/shoppings/:lead_id {large_override}` (gestor ou admin).
- **Roteiros:**
  - a "rota dos shoppings" e a "rota interna" são planos do item 11 com `kind = shoppings | shopping_interno`, atribuídos pelo mesmo `POST /v1/routes`;
  - `GET /v1/routes/candidates` ganha `scope = geral | shoppings | shopping:<id>`; ausente = o resultado de hoje.
- **Domínio:**
  - `domain/shopping-rules.ts`: `areaPoligonoM2` (shoelace em projeção equirretangular, outer menos inner), `ehGrande(metricas, cfg)` e a conta escrita;
  - a montagem do QL fica no `places-rules`, nunca com QL vindo do cliente.

**Padrão e configuração** (`field_config.shopping`):
- `criterio: area | lojas | area_ou_lojas | area_e_lojas | todos`, padrão `area`;
- `area_min_m2 = 20000` (*decisão do arquiteto, calibrar no dry-run*; a Lovable usava ≥ 2.500 avaliações ≈ "50+ lojas", e esse dado não temos);
- `lojas_min = 30`;
- `raio_lojas_m = 300` (Lovable);
- `fora_da_rota_geral = true`. Lovable: com a flag ligada, a seleção automática e a aba geral excluem shoppings e lojas internas.

**Nossa versão:** sem shoppings. Desligada, a seleção e os candidatos ficam byte a byte iguais.

**Testes:**
- área de um quadrado de 100 m dá cerca de 10.000 m²;
- relation com furo;
- shopping só como ponto;
- matriz do critério;
- chave de cache por `kind`;
- shopping fora do `autoEnroll`;
- seleção do roteiro idêntica com a flag desligada.

## Item 7. Intervalo e almoço (§37, `FIELD_BREAKS_ENABLED`)

**Lovable:**
- eventos `inicio_intervalo` e `fim_intervalo` (`0009:5`) e `estadoRota` (`visita.ts:7-13`);
- os botões só aparecem sem visita aberta (`roteiro…:110-114`);
- o intervalo entra no resumo (`visita.ts:54-58`), com alerta acima de 75 min (`:69`).

**Desenho:**
- **Tabela própria:** `field_journey_breaks` (não usar `field_points`, que alimenta a camada "passagem" do heatmap):
  - `id`, `journey_id` (cascade), `consultant_id`, `client_id` UNIQUE, `end_client_id` UNIQUE;
  - `started_at`, `ended_at?`, posição opcional no início e no fim;
  - `auto_closed`, `clock_adjusted`.
- **Índice parcial `field_journey_breaks_one_open_per_journey`.**
- **Rotas** (`@CampoRoute`):
  - `POST /v1/campo/journeys/current/breaks/start {client_id, at, lat?, lng?, accuracy?}`;
  - `POST …/breaks/end {client_id, at, …}`.
- **Regras:**
  - erros `409 VISIT_OPEN` (Lovable), `409 BREAK_ALREADY_OPEN`, `409 NO_OPEN_BREAK`;
  - reenvio idempotente; carimbo de hora saneado como no §20.2;
  - entram na fila offline como `break_start`/`break_end`.
- **Check-in durante o intervalo:** a tela esconde o "Cheguei" (Lovable); o servidor **encerra** o intervalo no `at` do check-in, com evento (*decisão do arquiteto*, para não travar a fila offline).
- **Encerramentos automáticos:** `end` da jornada e o fechamento das 00:05 encerram o intervalo aberto.
- **Efeitos, só com a flag ligada:**
  - tempo trabalhado = jornada − intervalos (itens 2 e 3);
  - ritmo e meta (§25.2): no dia em que houve intervalo, desconta o intervalo **real** no lugar do almoço configurado, **nunca os dois**; sem intervalo, segue como hoje;
  - `sem_registro` fica suprimido durante o intervalo;
  - alerta novo `intervalo_longo` acima de `alerta_intervalo_min` (75);
  - roteiro: `EntradaRelogio.pausaFeita`; depois do intervalo, o relógio não insere o almoço configurado;
  - remuneração: chave nova opcional `daily_base_min_worked_minutes` (0–1440 ou nulo, padrão nulo), que exige a flag (`409 BREAKS_DISABLED`). Só versões novas; caracterização intacta.

**Padrão:** botões "Iniciar intervalo" e "Encerrar intervalo" nos dois fluxos.

**Nossa versão:** só a janela de almoço configurada.

**Testes:**
- `ritmo` e `calcularRelogio` idênticos com a flag desligada;
- sem desconto em dobro;
- fila offline: início, check-in, fim;
- fechamento à meia-noite;
- índice impede dois intervalos abertos.

## Item 8. Segmentos de busca editáveis (§36, `FIELD_SEGMENTS_ENABLED`)

**Lovable:**
- tabela `segmentos` com tipos do Google e palavras-chave, e 8 semeados (`0001:33-49`);
- editável pelo admin (`configuracoes.tsx:31-61`);
- serve de "perfil" das lojas internas (`rotas.tsx:182-186`).

**Desenho:**
- **Dados:**
  - `app_settings.place_segments jsonb NULL`: nulo = catálogo padrão;
  - `place_import_runs.segments_snapshot jsonb?`: foto da definição usada.
- **Segmento:** `{slug ^[a-z0-9_]{2,30}$ (imutável), label, filters: [[{key, op:'='|'~', value}]] (OU de E), keywords[], priority, active, apify_term?}`.
- **Montagem segura no servidor:**
  - `key` com `^[a-z_:]{1,40}$`;
  - `value` só com letras, dígitos, `_` e espaço;
  - `~` aceita só alternância desses tokens;
  - `keywords` viram `["name"~"a|b",i]` e exigem um filtro base (`amenity`, `shop`, `craft` ou `tourism`);
  - nada de aspas ou barras: **nunca se aceita QL cru**.
- **Classificação:** `classificarSegmento(tags, segmentos)` usa o primeiro segmento por `priority` que casar. Os específicos vêm antes de `restaurante`.
- **API:**
  - DTO `types[]` sobe para até 10, validado no serviço contra os segmentos ativos;
  - com a flag desligada, a regra de hoje (5 slugs, máximo 5), com a **mesma mensagem**;
  - cache com o hash da foto só com a flag ligada;
  - `GET/PUT /v1/place-searches/segments` (admin; sem DELETE, só desativar).

**Padrão** (*decisão do arquiteto*: os 10, todos ativos):

| Segmento | Filtro OSM | Origem |
|---|---|---|
| `bar` | `amenity~bar\|pub` | Lovable e nossa |
| `restaurante` | `amenity=restaurant` | Lovable e nossa |
| `padaria` | `shop=bakery` | Lovable e nossa |
| `lanchonete` | `amenity=fast_food` | nossa |
| `cafe` | `amenity=cafe` | nossa |
| `buffet` | `craft=caterer` ou `amenity=restaurant + cuisine~buffet` ou palavra "buffet" | Lovable |
| `pizzaria` | `amenity~restaurant\|fast_food + cuisine~pizza` | Lovable |
| `hamburgueria` | `… + cuisine~burger` | Lovable |
| `hotel` | `tourism=hotel` | Lovable |
| `motel` | `tourism=motel` | Lovable |

Os 5 slugs atuais (`places-rules.ts:14, 57-63`) ficam com filtro idêntico, porque estão gravados em `types`, `category` e `cache_key`.

**Nossa versão:** a lista fixa de 5 com a flag desligada.

**Testes:**
- injeção de QL recusada;
- query dos 5 slugs atuais idêntica byte a byte;
- prioridade pizzaria antes de restaurante;
- mensagem de erro igual com a flag desligada.

## Item 9. Regra de senha (§41.1, `PASSWORD_POLICY_ENABLED`)

**Lovable:** `changeOwnPassword` exige 8–72 caracteres, uma maiúscula e um número (`users.functions.ts:129-142`).

**Desenho:**
- **Domínio:** `domain/senha-rules.ts`, com `validarSenhaNova(senha, politica) → falhas[]`.
- **Configuração:** `app_settings.password_policy jsonb?`; nulo com a flag ligada = política da Lovable.
- **Onde se aplica:** no serviço, só em senha **nova**:
  - `new_password` do campo;
  - `PUT /v1/users/:id/password`;
  - senha inicial definida pelo admin.
- **Onde nunca se aplica:** no login e em `current_password` (continuam `MinLength(6)`, `campo.dto.ts:35-44`). Nenhuma senha atual é invalidada.
- **Erro:** `400 WEAK_PASSWORD` ("A senha precisa de: 1 letra maiúscula, 1 número.").
- **Senha provisória:** `gerarSenhaProvisoria` passa a cumprir sempre a política mais forte permitida (teste de propriedade com 1.000 amostras).
- **Para os formulários:** `GET /v1/password-policy` (`@Public`, não é segredo).

**Nossa versão:** 8–72 sem exigências, com a flag desligada.

## Item 10. Bônus por período mensal (§43, `FIELD_EARNINGS_MONTHLY_ENABLED`; exige `FIELD_EARNINGS_ENABLED`, que está LIGADA)

**Lovable:** `regras_bonus.periodo` (padrão `'semana'`, `0000:72`), **ignorado** por `calcularPagamento` (`financeiro.ts:13`). O "mensal" é necessidade real, não comportamento que a Lovable tenha.

**Desenho:**
- **Regra:** `tiers_period` passa a aceitar `month`, só com a flag (`409 MONTHLY_DISABLED`).
- **Restrições com `month`:**
  - `combine ∈ {sum, tier_only}` (`max` contra dias espalhados em semanas diferentes não tem sentido);
  - `cap_cents` nulo;
  - `valid_from` no dia 1;
  - os parâmetros seguem a versão vigente no dia 1.
- **Migração:** alargar o CHECK de `field_earnings_ledger.work_scope` para incluir `month` (DROP e ADD da constraint numa migração nova; o trigger de linhas não muda).
- **Lançamento:**
  - entra na **1ª semana aberta depois do fim do mês** (`payout_week`), com `work_scope='month'`, `work_day='YYYY-MM-01'`, `work_week` = a semana que contém o último dia do mês, e chave `acc:month:YYYY-MM:n`;
  - confirmação tardia dentro de `late_grace_days` gera delta pelo mecanismo do §28.4.
- **Projeção:** na tela, "Meta de outubro: 42 cadastros → faixa 40 = R$ 300,00, entra no Pix de 03/11".

**Testes:**
- dia e semana byte a byte (caracterização);
- mês que atravessa semanas;
- idempotência;
- `payouts.service.ts:238` intocado.

## Item 11. Divisão de uma área em N rotas (§39, `FIELD_ROUTE_PLANS_ENABLED`; exige `FIELD_ROUTES_ENABLED`)

**Lovable:**
- `gerarRotas` ordena por ângulo em torno do centroide e agrupa de forma gulosa até `porRota` e até `tempoPrevistoMin ≤ 600` (`rotas.ts:35-50, 55-64`). A conta é 20 min/cliente + 60 min + km/kmh.
- Cada "Gerar" cria um lote novo, com nome "Rota 01" e cores (`rotas.tsx:110-128`).
- A atribuição de representante e data é por rota, com data opcional (`:226-230`).
- Lotes e rotas podem ser excluídos (`:232-245`).
- O representante vê as rotas num calendário "Minhas rotas" (`inicio.tsx:137-210`).

**Desenho:**
- **Planos são rascunhos sem dono nem dia,** em tabelas próprias. Não se mexe em `field_routes` nem nos seus índices parciais.
  - `field_route_plans`: `id`, `praca_id`, `area_id?`, `kind geral|shoppings|shopping_interno`, `parent_lead_id?`, `travel_mode`, `params_snapshot`, `created_by`, `created_at`, `archived_at`, `archived_by`. Arquiva em vez de apagar.
  - `field_route_plan_items`: `id`, `plan_id`, `seq`, `name`, `color`, `lead_ids uuid[]` (ordem), `distance_m`, `est_minutes`, `assigned_route_id?` (SetNull), `assigned_consultant_id?`, `assigned_day?`, `assigned_at`, `assigned_by`.
- **Rotas da API:**
  - `POST /v1/route-plans {praca_id, area_id?, kind, lead_ids? | elegíveis da área, por_rota 1–100, travel_mode, modelo_tempo?}`, determinístico;
  - `GET /v1/route-plans?praca_id&kind`;
  - `GET /v1/route-plans/:id`;
  - `POST …/:id/items/:itemId/assign {consultant_id, day, confirm_replace?}`;
  - `POST …/:id/archive`.
- **Atribuição:**
  - chama o mesmo serviço do `POST /v1/routes` (`source='equipe'`, fotografa nome, endereço e coordenada, valida praça e `LEAD_IN_OTHER_ROUTE`);
  - se o consultor já tem roteiro ativo no dia, responde `409 ROUTE_EXISTS`, a menos que venha `confirm_replace`;
  - é idempotente: o item já atribuído devolve o roteiro.
  - Isso alimenta a diária `route_assigned` da S2 do jeito que a Lovable faz, sem duplicar regra.
- **"Minhas rotas" do consultor:** `GET /v1/campo/routes?from&to` (≤ 62 dias), só leitura e só as dele. O roteiro de hoje não muda.
- **Domínio:** `domain/divisao-rotas-rules.ts`, com `dividirPorVarredura(pontos, params)` portado da Lovable e testado com os vetores dela (20 paradas a 0 km = 460 min; 10 paradas = 260 min, `rotas-tempo.test.ts`).
  - `modelo_tempo = 'roteiro'`: a capacidade e o ETA saem de `planejar()` (`rota-rules.ts:389`) com a nossa configuração.

**Padrão e configuração** (`field_config.divisao`):
- `por_rota = 20`;
- `modelo_tempo = lovable`;
- `minutos_por_cliente = 20`, `intervalo_min = 60`, `limite_min = 600`;
- `travel_mode = carro` (o botão principal da Lovable, `rotas.tsx:293`).
- Depois de atribuído, o roteiro do dia usa o nosso relógio. A tela diz as duas contas.

**Nossa versão:** NN + 2-opt por consultor e dia ("Montar roteiro"), intacto e ainda o padrão do roteiro diário.

**Testes:**
- vetores da Lovable;
- determinismo;
- atribuição respeita os índices parciais e o `ROUTE_EXISTS`;
- praça A × B;
- flag desligada responde 404.

## Item 12. Perfil "gestor" (§42, `TEAM_GESTOR_ENABLED`)

**Lovable:**
- papéis `admin | gestor | representante` (`0000:1`); `is_staff` = admin ou gestor (`:29-32`);
- o gestor pode criar e editar representantes, praças, clientes, rotas e buscas (policies "staff all");
- o gestor pode gerar acesso e redefinir senha (`users.functions.ts:58, 85`, sem `adminOnly`). Isso inclui **redefinir a senha de qualquer perfil, até admin**: falha de segurança, não trazer;
- só o admin escreve configuração, segmentos, vouchers, pagamentos e usuários (`0000:124`, `0001:44`, `0005:20`, `0006:29`, `users.functions.ts:102, 121`).

**Nosso estado:** a equipe que não é admin já "vê tudo e não configura nem paga". O que falta é a **escrita operacional**.

**Desenho:**
- **Dados:** `users.is_gestor BOOLEAN NOT NULL DEFAULT false`.
- **Guard:** lido do banco a cada request, junto do `is_admin` (`jwt-auth.guard.ts`); `AuthUser.is_gestor` só vale com a flag ligada.
- **Decorator:** `@GestorOuAdmin()`.
- **Tela:** em Pessoas, o admin escolhe "Admin / Gestor / Equipe".

**Mapa de permissões** (o que não aparece aqui não muda):

| Rota | Hoje | Proposta |
|---|---|---|
| `POST /v1/consultores` | admin | gestor ou admin |
| `PATCH /v1/consultores/:id` | admin | gestor, **exceto** `pix_key`/`pix_key_type`/`visit_flow` (`403 FORBIDDEN_FIELD`) |
| `POST /v1/consultores/:id/reset-password` | admin | gestor (só consultor; nunca usuário da equipe) |
| `POST /v1/consultores/:id/freela-sync` | admin | gestor |
| `DELETE /v1/consultores/:id` | admin | admin |
| `POST/PATCH /v1/areas` | admin | gestor |
| `POST /v1/routes`, `PUT …/order`, `POST …/reoptimize`, `/v1/route-plans/*` | admin | gestor |
| `PATCH /v1/consultores/shoppings/:id` | — | gestor |
| `/v1/place-searches/*` | admin | gestor só com `source=osm`; Apify (pago) só admin |
| `PUT settings/config`, `settings/channels`, segmentos, `password_policy` | admin | admin |
| earnings (todas as escritas), payouts (todas, incluindo `pix-key` e CSV), void de declarados | admin | admin |
| vouchers: `approve`/`reject`/`link`/`retry`/`deactivate` | — | admin (como na Lovable) |
| `/v1/users` POST/PATCH/DELETE, `pracas` DELETE, `leads` DELETE | admin | admin |

**Testes:** matriz gerada da tabela acima (admin, gestor, equipe e token de campo, que dá 401). Com a flag desligada, o gestor recebe 403 como hoje.

## Item 13. Consultor em várias praças (§44, `FIELD_MULTI_PRACA_ENABLED`, última fase)

**Lovable:** `praca_representantes` N:N (`0000:98-114`).

**Desenho:**
- **Princípio:** o isolamento continua sendo uma praça por request, e não se reescrevem as consultas.
- **Dados:**
  - `field_consultant_pracas (consultant_id, praca_id)` PK, com `created_at` e `created_by`;
  - `field_consultants.praca_id` continua como praça principal e está sempre no conjunto;
  - `field_journeys.praca_id UUID NULL`, em que nulo = principal.
- **Escolha da praça:**
  - `journeys/start` aceita `praca_id`, que tem de pertencer ao conjunto (senão 404);
  - o padrão é a praça do roteiro de hoje e, sem roteiro, a principal (*decisão do arquiteto*).
- **Resolução no request:** o `CampoAuthGuard` resolve `CampoConsultant.praca_id` como "praça da jornada aberta, senão a principal".
  - Assim **todas** as consultas atuais com `c.praca_id` (places, visits `where {id, praca_id}`, followups, vouchers) passam a enxergar só a praça ativa, sem reescrita.
  - **Exceção:** nas rotas com `:ref` (PATCH `answers`, `checkout`, `DELETE` de visita), a praça vem da jornada **da própria visita**. Motivo: a fila offline pode reenviar uma visita da praça B depois do `end` daquela jornada, e "senão a principal" daria 404.
- **Equipe:**
  - `POST /v1/routes` exige todos os leads numa praça do conjunto, que passa a ser a `route.praca_id`;
  - `attention` e os filtros por praça usam o conjunto;
  - a camada "passagem" usa `journey.praca_id ?? consultant.praca_id`;
  - o matcher da F7 procura no conjunto, ainda exigindo casamento único;
  - `DELETE /v1/pracas/:id` considera o conjunto;
  - ganhos e pagamentos continuam por consultor, listados pela praça principal.
- **Com a flag desligada:** o conjunto é ignorado; `praca_id` diferente da principal no `start` responde `422 MULTI_PRACA_DISABLED`.

**Testes de isolamento:**
- consultor ligado a A e B com jornada em A não vê nem faz check-in em lead de B;
- consultor ligado só a A não inicia jornada em B;
- fila reenviada depois do `end` da jornada em B: o checkout da visita de B passa;
- relatórios da praça A sem dados da B.

## Item 14. Dados cadastrais do representante e e-mail do contato (§41.2–§41.3)

**Lovable:**
- `representantes` com endereço (CEP, rua, número, complemento, bairro, cidade, UF), `banco` e `pix` (`0000:42-57`);
- `visitas.contato_email` (`0009:29`), opcional na tela (`roteiro…:289`).

**Desenho:**
- **Cadastro do consultor** (`FIELD_CONSULTANT_PROFILE_ENABLED`):
  - `field_consultants.address_*` (7 colunas) e `bank_name`, `bank_branch`, `bank_account`, `bank_account_type`, todas nulas;
  - visíveis como CPF e Pix, só para a equipe e o próprio consultor;
  - conta bancária completa só para o admin; mascarada para os demais;
  - nunca em log;
  - não entra em pagamento (o Pix continua fotografado).
- **E-mail do contato** (`FIELD_CONTACT_EMAIL_ENABLED`):
  - `field_visits.contact_email TEXT NULL` (≤ 120, minúsculo, validado);
  - mascarado nas listas da equipe;
  - completo só no `VisitView` do consultor dono e no detalhe da equipe, como o telefone do §30.3;
  - nunca em `lead_events`, resumo ou log;
  - `contato_campos` ganha `email`; opcional por padrão, como na Lovable.

**Junto com o cadastro do consultor:** o botão "Enviar pelo WhatsApp" na tela da senha provisória (`CredenciaisDialog.tsx:12,29`). O `wa.me` é montado no navegador; o risco de a senha ficar no histórico do WhatsApp é mitigado por `must_change_password`.

## Item 15. Bug "Versão 1 · vale desde 01/01/1970" (sem flag; correção de leitura)

**Causa:**
- A migração `20261023100000_field_earnings/migration.sql:129-136` grava a v1 com `valid_from = '1970-01-01'` (sentinela "desde sempre", necessária para `versaoVigente` cobrir qualquer dia) e `created_by_name = 'sistema'`.
- O web imprime a data crua (`web/src/components/praca/RemuneracaoConfig.tsx:46`) e mostra "Por sistema" (`:55`), porque o serviço mapeia `created_by ← created_by_name` (`earnings.service.ts:138`).
- O simulador repete o literal em `earnings.service.ts:670`.

**Correção:**
- **Nunca alterar o valor gravado:** o trigger barra UPDATE e a vigência depende dele.
- **Domínio:** constante `VIGENCIA_INICIAL = '1970-01-01'` em `earnings-rules.ts`, usada nos dois pontos.
- **Resposta:** `versaoView` ganha `is_initial` (aditivo) e `installed_at = created_at`.
- **Web:** mostra "Versão 1 · padrão inicial (vale desde o começo; instalada em dd/mm/aaaa)" e não mostra "Por sistema".

**Testes:** a visão da API e o rótulo no vitest.

## Item 16. Demais diferenças da §2 ("só chefe" ou "diferente")

| Diferença (Lovable) | Decisão | Motivo |
|---|---|---|
| Raio do check-in configurável (`0000:129`; `roteiro…:69`) | **Trazer**, fase L0, sem flag | `field_config.raio_checkin_m` (50–1000, padrão 200 = Lovable = `RAIO_LONGE_M`, `campo-rules.ts:13`); vale só para visitas novas; o padrão é idêntico ao de hoje |
| Remuneração por representante (`forma_remuneracao`, valores, bônus por pessoa: `0000:49-51, 67-75`) | **Trazer como opção**, fase L13 (M–L), `FIELD_EARNINGS_PER_CONSULTANT_ENABLED` | `field_pay_rule_versions.consultant_id NULL`; por dia vale a versão do consultor e, se não houver, a global. É dinheiro: fica por último |
| Já incorporados a outros itens | Trazer | "Minhas rotas" (`inicio.tsx:137-210`) no 11; cronômetro no 1; WhatsApp das credenciais no 14; telefone fixo × WhatsApp (`format.ts:49-56`) e filtro de clientes por resultado no 4; praça "aberta" = `start_date ≤ hoje`, sem coluna, nos 3 e 4 |
| Links Maps/Waze por parada | Já existe | `web/src/modules/rotas/domain/rota-local.ts:33-38` |
| Equipe muda o "status" do cliente na mão (`clientes.tsx`, `mudar`) | Não trazer | O estágio é do funil (já editável); o resultado vem da visita. Editar "status" apagaria a trilha |
| Captação Google em grade e custo em US$ (`BuscaGoogleDialog`, `format.ts:58-72`); cidade pelo Google | Não trazer | Termos do Google e chave no bundle; temos Apify com teto e IBGE com áreas |
| Constantes 20 min / 25 km/h como relógio diário | Não trazer como padrão do roteiro | Só no modelo da divisão (item 11) |
| `pracas.gestor_id`, `dados_confirmados`, `whatsapp_confirmado`, `zona_id` | Não trazer | Sem regra que os use nas telas lidas |
| "Desempenho" do representante | Nada | É "Em breve" (`desempenho.tsx`); o resumo do dia cobre |

---

## Plano de fases

Cada fase é entregável sozinha: contrato, testes de domínio, API, web, smoke da flag ligada, flag desligada no deploy.

| Fase | Itens | Flag(s) | Migração | Tamanho | Dependência e risco |
|---|---|---|---|---|---|
| L0 | 15 + raio do check-in | — | não | S | Nenhuma; só leitura e configuração com padrão idêntico |
| L1 | 3 painel + 2 resumo (`cadastrosDoDia` em comum) | `FIELD_DASHBOARD_ENABLED`, `FIELD_DAY_SUMMARY_ENABLED` | não | M | Só leitura |
| L2 | 4 pins + telefone | `FIELD_MAP_PINS_ENABLED` | não (índices existem) | M | Só leitura |
| L3 | 1 checklist + cronômetro | `FIELD_CHECKLIST_ENABLED` | `field_visits.checklist` | M | **Toca o checkout dos dois fluxos**: caracterização |
| L4 | 7 intervalo | `FIELD_BREAKS_ENABLED` | breaks + índice parcial | M | Toca ritmo, alertas, relógio e uma chave da regra |
| L5 | 8 segmentos | `FIELD_SEGMENTS_ENABLED` | 2 colunas | M | Toca a busca (só admin) |
| L6a | 5 vouchers (registro) | `FIELD_VOUCHERS_ENABLED` | vouchers + eventos + índice | M | — |
| L6b | 5 cupom no Freela | `FIELD_VOUCHER_COUPONS_ENABLED` | não | M | Conta Freela configurada; decisão D1 |
| L7 | 11 planos + "Minhas rotas" | `FIELD_ROUTE_PLANS_ENABLED` | 2 tabelas | L | Reusa `POST /v1/routes` |
| L8 | 6 shoppings | `FIELD_MALLS_ENABLED` | leads, métricas, runs | L | L5 + L7 + dry-run do Overpass em BH |
| L9 | 9 senha + 14 cadastro, e-mail e WhatsApp | `PASSWORD_POLICY_ENABLED`, `FIELD_CONSULTANT_PROFILE_ENABLED`, `FIELD_CONTACT_EMAIL_ENABLED` | colunas | S–M | — |
| L10 | 12 gestor | `TEAM_GESTOR_ENABLED` | `users.is_gestor` | M | Depois de L6/L7, para a matriz já cobrir as rotas novas |
| L11 | 10 bônus mensal | `FIELD_EARNINGS_MONTHLY_ENABLED` | CHECK de `work_scope` | M | **Dinheiro com F8 ligada**: uma semana em sombra |
| L12 | 13 várias praças | `FIELD_MULTI_PRACA_ENABLED` | junção + `journeys.praca_id` | L | Mexe no guard: é a mais arriscada |
| L13 | 16 regra por consultor | `FIELD_EARNINGS_PER_CONSULTANT_ENABLED` | coluna na versão | M–L | Dinheiro; opcional |

Seções do contrato: §33 painel/resumo · §34 pins · §35 checklist · §36 segmentos · §37 intervalo · §38 vouchers · §39 planos · §40 shoppings · §41 senha/cadastro/e-mail · §42 gestor · §43 mensal · §44 várias praças. L0 é acréscimo ao §28.5 e ao §23.1.

## Decisões que dependem do dono (máximo 6; padrão assumido entre parênteses)

1. **Cupom: valor e alcance.** O cupom de 100% cobre a vaga inteira, em qualquer vaga do contratante, e a plataforma paga o repasse. Ter teto (`FIXED` ou jornada mínima) e validade? (*Decisão do arquiteto:* PERCENT 100, uso único, **validade de 30 dias**, sem jornada mínima, só admin aprova, 1 por empresa.)
2. **Vínculo do contratante sem F6/F7.** Aceitar a escolha manual do admin pela busca do CRM, que é só por nome? (*Decisão do arquiteto:* sim, sempre manual e registrado no evento; nunca automático por nome.)
3. **Nota do dia.** A nota 0–10 aparece para o consultor, como na Lovable? (*Decisão do arquiteto:* sim, `nota`, com a conta escrita e o aviso de positivação 0 enquanto o sync estiver desligado.)
4. **Shopping grande sem Google.** (*Decisão do arquiteto:* área do polígono ≥ 20.000 m², calibrada no dry-run; lojas internas pelo OSM e pela mão; Apify só se o dono aceitar o custo.)
5. **Gestor.** Pode desativar consultor e rodar busca OSM, mas não mexe em Pix, pagamentos, configuração nem vouchers? (*Decisão do arquiteto:* sim, conforme a tabela do item 12.)
6. **Bônus mensal.** Pago na 1ª semana depois do mês, só com `combine` `sum` ou `tier_only`? (*Decisão do arquiteto:* sim.)
