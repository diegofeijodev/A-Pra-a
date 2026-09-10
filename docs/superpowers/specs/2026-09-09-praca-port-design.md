# PRAÇA — port do protótipo Lovable para a stack Freela (design)

**Data:** 2026-09-09 · **Origem:** `~/Downloads/Plaza Launchpad.zip` (TanStack Start +
estado inteiro em `localStorage`, chave `praca-v2`) · **Destino:**
`/home/doutor/coding/freela/praca/` (repo git próprio, mesmo molde de
`gestao-de-time`, `plano-estrategico`, `pedidos-online` e `meu-par`).

## 1. O que o produto é

Checklist de execução para **abrir uma praça** (cidade) da Freela Serviços:
o manual de 11 etapas vira ações com dono, prazo e recorrência; um CRM de
contratantes (bares, restaurantes, hotéis, buffets) com funil de 8 etapas;
entrada de leads (planilha/XML, formulário público, cadastro manual); mensagens
(modelos A/B, disparos em lote, cadências que rodam sozinhas); campanhas de
mídia paga (briefing, criativos, tráfego Meta/Google, calendário); calendário
das ações; indicadores (empresa / praça / pessoa / canal); configurações
(pessoas, praça, roteiro-modelo).

Novo em relação ao protótipo: **integração com o sistema de campanhas do
Freela** (api-freela) — tanto as campanhas normais (ativação one-shot, inclusive
por lista de contatos) quanto as **automáticas** (recorrentes).

## 2. Stack, portas, comandos

| Peça | Stack | Porta |
|---|---|---|
| `api/` | NestJS 11 + Fastify + Prisma 5.22 + PostgreSQL 16 (**npm**) | **3014** |
| `web/` | Next.js 15 (App Router) + React 19 + Tailwind 4 + kit shadcn (**yarn**) | **3024** |
| Postgres | `docker compose up -d postgres` na raiz (container `praca-postgres`) | **5437** |

3000/5432 = Freela · 3010/3020/5433 = gestao-de-time · 3011/3021/5434 =
plano-estrategico · 3012/3022/5435 = pedidos-online · 3013/3023/5436 = meu-par.

Convenções herdadas dos outros ports: wire **snake_case** 1:1 com o banco;
data só-dia é varchar `"YYYY-MM-DD"`; "hoje" é `todaySp()` (Brasília), nunca
`toISOString()`; erro sempre `{ error: { code, message } }`; `ValidationPipe`
global com `whitelist + forbidNonWhitelisted` e `exceptionFactory` que percorre
`children`; id de URL passa por `isUuid()` antes do Prisma; rotas estáticas antes
das `:id`; guarda de sessão do web em `app/(app)/layout.tsx`; `localStorage`
só em `auth.storage.ts`; dinheiro/valores como número no JSON.

## 3. Contas e pessoas

O protótipo não tinha login: tinha uma lista `people` (Diego, Daniel, Mkt
externo) e um seletor "agindo como". No port:

- **`users` = pessoa + credencial.** `email`, `password_hash`, `name`,
  `role_label` (texto livre: "CEO — visitas às casas grandes…"), `color`,
  `phone`, `is_admin`, `active`, `theme` (`dark|light`), `active_praca_id`.
- Login e-mail + senha → JWT HS256 12h. Sem cadastro aberto: admin cria pessoas
  em Configurações → Pessoas (`POST /v1/users`) e define/reseta senha.
- **Autor de tudo é o usuário logado** (conclusão, comentário, adiamento,
  evento do lead, aprovação de criativo). O seletor "Todos / Diego / Daniel /
  Mkt" continua existindo em Hoje e Entrada, mas só como **filtro de visão**
  (estado de UI, não persistido).
- Seed: `diego@praca.local` (admin), `daniel@praca.local`, `mkt@praca.local`,
  senha `praca123`. Cores e funções iguais ao protótipo.

## 4. Modelo de dados (30 tabelas, schema `public`)

| Grupo | Tabelas |
|---|---|
| Pessoas | `users`, `user_dismissed_notifs` |
| Praça | `pracas` (nome, cidade, `start_date`, `end_date`, cobertura: `cobertura_uf`, `cobertura_cidade`, `cobertura_ibge`, `lat`, `lon`, `vizinhas text[]`), `praca_step_states` (PK `praca_id,step_n`: `actual`, `unlocked_by`, `unlocked_at`, `unlock_reason`) |
| Roteiro | `template_actions` (roteiro-modelo editável, seed = 84 ações do protótipo; `key` tipo `s1a1`, `step`, `title`, `owners uuid[]`, recorrência em colunas `rec_kind/rec_day/rec_start_day/rec_end_day/rec_weekday/rec_month_day`, `tools text[]`, `how_to text[]`, `expected`, `msg`, `attention`, `expects_result`, `sort`) |
| Ações | `actions` (instância por praça, mesmos campos + `template_key`, `due_override`, `postpone_count`, `completed_at`, `completed_by`, `result`), `action_completions` (PK `action_id,date`: `by`, `at`, `result`), `action_comments`, `action_subitems` |
| Indicadores | `indicator_entries` (PK `praca_id,key,date`: `value`) — o catálogo (12 indicadores) é código |
| Funil | `leads`, `lead_events` (`kind`, `text`, `author_id` nullable, `author_label` p/ "Cadência"/"Formulário", `stage_to` int p/ `kind=stage`), `lead_vagas` |
| Entrada | `import_mappings`, `import_batches` (leads apontam por `import_batch_id`) |
| Mensagens | `msg_templates`, `app_settings` (linha única: janela, limite diário, intervalo, domingo, modo padrão, `daily_quota` da fila do dia, `template_defaults` jsonb), `blocklist` (`phone`, `phone_key`), `disparos` (era `Campaign`: filtros jsonb, modo, contagens, status, `freela_campaign_id`), `msg_sends` (`disparo_id` ou `cadence_id`+`node_id`, `template_id`, `variant`, `text`, `scheduled_at`, `sent_at`, `replied_at`, `status fila|enviada|entregue|respondida|falhou`, `failure_reason`, `mode`, `freela_campaign_id`, `freela_recipient_id`) |
| Cadências | `cadences`, `cadence_nodes` (`sort`, `kind msg|task|cond`, `day`, `channel`, `template_id`, `text`, `task`, `rule`, `action`, `note`), `enrollments` (`status ativo|aguardando|saiu|concluido`, `is_test`, `compress_sec`), `enrollment_logs` |
| Mídia | `proofs`, `campanhas` (+ `campanha_provas`), `creatives` (roteiro em 4 colunas, `ia_tool`, `ia_prompt`), `creative_comments`, `traffic_entries` (`criativos uuid[]`), `traffic_days` (unique `entry_id,date`) |
| Freela | `freela_campaigns` (espelho local: `freela_id` unique, `name`, `kind disparo|cadencia|base|manual`, `praca_id`, `disparo_id`, `audience`, `audience_filters`, `status`, `stats jsonb`, `created_by`, `last_synced_at`), `freela_templates` (vínculo `freela_id` ↔ `praca_id`; o conteúdo é lido ao vivo do Freela) |

Conjuntos fechados (`classe`, `origem`, `stage`, `status`…) são varchar/int com
`@IsIn`/`@IsInt` no DTO, não enum de banco (rótulos pt-BR com acento).

## 5. Regra de negócio que sai do navegador e vai para o servidor

1. **Agenda das ações** (`occursOn`, `dueDateOf`, `stepInfo`, atrasadas,
   próximos 7 dias): `GET /v1/pracas/:id/agenda?from&to&person` e
   `GET /v1/pracas/:id/steps` devolvem tudo calculado.
2. **Portões** (etapa 3 ← 2, 7 ← 6, 11 ← 10) e destrave com justificativa.
3. **Fila do dia** (Lead novo + reaquecer vencido, casa grande primeiro, mais
   antigo na frente, cota por pessoa, soneca até amanhã).
4. **Importação**: o arquivo é lido no navegador (CSV puro / XML via
   `DOMParser`) e a API recebe `{columns, rows}` (≤ 5.000 linhas);
   `POST /v1/imports/evaluate` faz a duplicidade **contra o banco**
   (telefone → CNPJ → nome+endereço), `POST /v1/imports/run` grava o lote,
   `POST /v1/imports/:id/undo` desfaz em 24h só o que não teve contato.
5. **Disparos**: elegibilidade (lista de bloqueio, trava de 30 dias por
   modelo), horários (`nextSlot`/`scheduleTimes` com janela, domingo, limite
   diário e intervalo sorteado), render dos modelos com variáveis, A/B.
6. **Motor de cadências**: no protótipo era um `setInterval` de 15 s que só
   rodava com a aba Mensagens aberta. Aqui é `@Cron` a cada 15 s no servidor:
   entrada automática (`stage_novo`, `reheat_due`, `first_vaga`), avanço por
   nós, condições, saídas, fila de espera (uma cadência por pessoa), lista de
   bloqueio, limite diário. "Testar comigo" cria lead de teste (`is_test`) com
   `compress_sec = 5` (cada dia vira 5 s).
7. **Indicadores**: as 12 leituras (valor, período anterior, delta, semáforo,
   "número velho"), visões praça/pessoa/canal, clientes ativos mês a mês, "o que
   mudou", metas por horizonte — tudo em `GET /v1/indicators/*`.
8. **Métricas de campanha** (investido, CPC, custo por cadastro/ativo, acima do
   teto), freio de preenchimento (> 4 h), portões do playbook para mídia.
9. **Notificações** do sino (`GET /v1/notifications?praca_id`), dispensa por
   usuário.
10. **Catálogo** (`GET /v1/catalog`, público): etapas, blocos, estágios do
    funil, motivos de perda, classes, origens, canais, públicos, modos de envio,
    variáveis, regras/condições/ações de cadência, objetivos, destinos, formatos,
    status de criativo, ferramentas de IA, modelos de roteiro, catálogo de
    indicadores, marcos, canais de origem. O web não tem segunda cópia.

## 6. API (resumo — contrato completo em `docs/api-contract.md`)

Base `http://localhost:3014`. Tudo autenticado exceto `GET /health`,
`POST /v1/auth/login`, `GET /v1/catalog`, `GET /v1/public/pracas/:id`,
`POST /v1/public/leads` (throttle mais apertado) e `GET /v1/geo/*`.

| Área | Rotas |
|---|---|
| Auth/pessoas | `POST /v1/auth/login` · `GET /v1/auth/me` · `GET/POST /v1/users` · `PATCH /v1/users/me` · `PATCH /v1/users/:id` · `PUT /v1/users/:id/password` · `DELETE /v1/users/:id` (desativa) |
| Praças | `GET/POST /v1/pracas` · `PATCH /:id` · `POST /:id/recalc-dates` · `GET /:id/steps` · `PUT /:id/steps/:n/result` · `POST /:id/steps/:n/unlock` · `GET /:id/agenda` |
| Geo | `GET /v1/geo/estados` · `GET /v1/geo/municipios?uf=` · `GET /v1/geo/municipios/:ibge/vizinhas?km=50` (o JSON do IBGE fica na API) |
| Ações | `GET /v1/actions?praca_id` · `POST` (ação avulsa) · `GET /:id` · `PATCH /:id` · `POST /:id/complete` · `/uncomplete` · `/postpone` · `/reassign` · `/comments` · `/subitems` · `POST /:id/subitems/:sid/toggle` |
| Roteiro-modelo | `GET /v1/template-actions` · `POST` · `PATCH /:id` · `DELETE /:id` (admin) |
| Indicadores | `GET /v1/indicators?scope=empresa\|praca&praca_id&period&from&to` · `GET /v1/indicators/empresa` (heroes+marcos+mês a mês+mudanças) · `GET /v1/indicators/pracas` · `/pessoas` · `/canais` · `POST /v1/indicators/:key/entries` |
| Leads | `GET /v1/leads` (filtros) · `POST` · `GET /:id` · `PATCH /:id` · `POST /:id/move` · `/events` · `PUT /:id/next-step` · `POST /:id/archive` · `/snooze` · `/vagas` · `GET /v1/leads/queue?person` · `GET /v1/leads/metrics?praca_id` · `GET /v1/leads/orphans` |
| Entrada | `GET/POST/DELETE /v1/imports/mappings` · `POST /v1/imports/evaluate` · `POST /v1/imports/run` · `GET /v1/imports` · `POST /v1/imports/:id/undo` |
| Público | `GET /v1/public/pracas/:id` · `POST /v1/public/leads` (`praca_id, name, city, phone, decisor, freq, origem pago\|organico, camp?`) |
| Mensagens | `GET/POST/PUT/DELETE /v1/msg-templates` · `GET /v1/msg-templates/metrics` · `POST /v1/msg-templates/render` · `GET/PATCH /v1/settings` · `GET/POST/DELETE /v1/blocklist` |
| Disparos | `POST /v1/disparos/preview` · `POST /v1/disparos` · `GET /v1/disparos` · `GET /:id` · `POST /v1/sends/:id/mark` · `POST /v1/sends/:id/reply` |
| Cadências | `GET/POST/PUT/DELETE /v1/cadences` · `POST /:id/toggle-pause` · `/enroll` · `/test` · `GET /:id/stats` · `GET /v1/enrollments?cadence_id` · `POST /v1/enrollments/:id/exit` · `POST /v1/cadences/restore-seed` |
| Mídia | `GET/POST/PUT/DELETE /v1/campanhas` · `POST /:id/duplicate` · `/status` · `GET /:id/metrics` · `POST /v1/campanhas/suggest-name` · `GET/POST/PUT/DELETE /v1/creatives` · `POST /:id/status` · `/publish-date` · `/review` · `GET/POST/PUT/DELETE /v1/traffic` · `PUT /v1/traffic/:id/days` · `GET/POST /v1/proofs` |
| Notificações | `GET /v1/notifications?praca_id` · `POST /v1/notifications/dismiss` |
| Freela | ver §7 |

## 7. Integração com o sistema de campanhas do Freela

### 7.1 O que existe do lado do Freela (api-freela, main)

- **Campanhas normais (ativação):** `POST /v1/admins/activation-campaigns`
  com `audience` ∈ `CONTRACTORS_NEVER_PUBLISHED | CONTRACTORS_DORMANT_90D |
  PROVIDERS_NEVER_APPLIED | PROVIDERS_DORMANT_90D | EXTERNAL_LIST`,
  `audienceFilters {cities[], ufs[], modules[], radius{city,km}}`,
  `contacts[{name,phone,email}]` (≤ 5.000, só `EXTERNAL_LIST`),
  `whatsappTemplate` (até 3 variantes separadas por linha `---`; placeholders
  `{{nome}}`, `{{primeiro_nome}}`, `{{cidade}}`; obrigatório em
  `EXTERNAL_LIST`), ritmo `messagesPerHour ≤ 60`, `dailyCap ≤ 1000`,
  `windowStartHour/windowEndHour` (BRT), `weekdaysOnly`. Nasce `DRAFT`;
  `PATCH /:id/start|pause|cancel`. Leitura: `GET /` (stats + `meta.schedulerEnabled`),
  `GET /:id` (counts), `GET /:id/recipients?status&page&pageSize`,
  `POST /audience-preview`, `GET /audience-options?audience=`,
  `POST /external-list/preview`. O despachante roda a cada minuto, 1 mensagem
  por tick por campanha, pelo **chip de campanha** (Z-API/Wafly), com opt-out
  "responda SAIR" no rodapé. Flag de servidor: `ACTIVATION_CAMPAIGNS_ENABLED`.
- **Campanhas automáticas (templates):** `POST /v1/admins/campaign-templates`
  (`scheduleKind WEEKLY|DATED`, `weekdays[]`, `sendHour`, `targetMonth/Day/Year`,
  `leadDays`, `audience` (6 opções, inclui `CONTRACTORS_ALL|ACTIVE`),
  `audienceFilters {cities, ufs, modules}`, `channels [WHATSAPP|PUSH]`,
  `whatsappTemplate`, `pushTitle/pushBody`, `imageKey`, `deepLink`, ritmo,
  `maxPerRun`) · `PUT /:id` · `PATCH /:id/enabled {enabled}` ·
  `POST /upload` (multipart `file`, png/jpeg/webp ≤ 5 MB) · `GET /` · `GET /:id`.
  Cada ocorrência gera uma campanha de ativação (`templateId`) que o mesmo
  despachante drena. Flag: `CAMPAIGN_TEMPLATES_ENABLED`.
- **Autenticação:** só JWT de **admin** (`POST /v1/admins/login {email,password}`
  → `{data:{accessToken, refreshToken}}`) com permissão `REFERRALS`. **Não
  existe** chave de API nem conta de serviço.

### 7.2 Como o Praça se conecta

- **Conta de serviço = um admin do Freela** dedicado ao Praça (papel `ADMIN`,
  permissão `REFERRALS`), criado pelo dono no painel (`/v1/admins/panel-users`).
  No Praça: `FREELA_API_URL`, `FREELA_ADMIN_EMAIL`, `FREELA_ADMIN_PASSWORD`.
  `FreelaClient` faz login sob demanda, guarda o token em memória, refaz o login
  em 401. Sem as três variáveis, toda rota `/v1/freela/*` e o modo de envio
  `freela` respondem `503 FREELA_NOT_CONFIGURED` com mensagem clara — o resto
  do app funciona normal.
- **Sem alterar o api-freela para o essencial.** Uma extensão opcional está
  descrita em 7.5.

### 7.3 "Campanhas normais" a partir do Praça — três caminhos

1. **Disparo do funil (modo `freela`).** Em Mensagens → Disparos, o modo de
   envio ganha a opção **"Via Freela (número da empresa)"** — recomendada quando
   conectado. O disparo vira **uma** campanha `EXTERNAL_LIST` no Freela:
   `contacts` = leads elegíveis (nome = decisor ou estabelecimento, telefone
   E.164), `whatsappTemplate` = modelo do Praça **convertido** (§7.4), ritmo =
   janela/limite/intervalo do Praça mapeados para `windowStartHour/
   windowEndHour/dailyCap/messagesPerHour/weekdaysOnly`, `start` imediato ou no
   horário agendado (o `FreelaOutbox` cria a campanha quando chega a hora).
   Os `msg_sends` nascem `fila` e recebem `freela_campaign_id`; a sincronização
   (§7.6) vira `enviada`/`falhou` e escreve na linha do tempo do lead.
2. **Campanha para a base do Freela.** Tela **Freela → Campanhas → Nova**:
   público ∈ contratantes/freelancers (nunca publicaram, parados 90 d) recortado
   pela **cobertura da praça** (`cities` = cidade-sede + vizinhas, ou `radius`
   {cidade, 50 km}), prévia de contagem (`audience-preview`), texto com até 3
   variantes, ritmo, criar + iniciar. Serve o passo 2 do roteiro ("disparar a
   reativação de freelancers da área").
3. **Atalho na aba Campanhas (mídia).** No cartão do briefing, botão
   **"Campanha de WhatsApp no Freela"** abre o mesmo diálogo do item 2
   pré-preenchido (público, praça, mensagem-chave + oferta).

Todas aparecem em **Freela → Campanhas** com status/contagens espelhados
(`freela_campaigns`), pausar/cancelar/retomar e a lista de destinatários lida
ao vivo.

### 7.4 Conversão de modelo Praça → Freela

`toFreelaTemplate(textA, textB, ctx)`: `{{primeiro_nome_dono}}` →
`{{primeiro_nome}}`, `{{nome}}` → `{{nome}}`, `{{cidade}}` → `{{cidade}}`;
variáveis de contexto fixo por campanha (`praca`, `meu_nome`, `link_*`,
`funcao`, `valor`, `turno`, `dia_forte`, `data`) são resolvidas no Praça antes
de enviar; variáveis **por lead que o Freela não tem** (`estabelecimento`,
`bairro`, `estabelecimento_vizinho`, `data_vaga`) ficam na lista
`unsupported_variables` e a prévia avisa — a não ser que a extensão 7.5 esteja
ligada. Variação A/B vira `A --- B` (o Freela alterna variantes por índice, o
que é exatamente o teste A/B).

### 7.5 Extensão opcional no api-freela (branch, sem push)

Para manter **todas** as variáveis do Praça por lead, uma mudança pequena e
retrocompatível no api-freela, feita em branch local
`feat/activation-campaigns-contact-message` (o dono decide mesclar):
`ExternalContactDto.message?` (≤ 4000) → coluna
`activation_campaign_recipients.custom_message` → o despachante usa o texto do
destinatário quando existir (com o rodapé de opt-out). No Praça a flag
`FREELA_PER_CONTACT_MESSAGE=true` passa a mandar `contacts[].message` com o
texto já renderizado por lead (default `false` até o Freela de produção ter a
extensão — senão `forbidNonWhitelisted` devolve 400).

### 7.6 Sincronização e cadências

- `FreelaSyncScheduler` (`@Cron` a cada 2 min, só com Freela configurado):
  (a) **outbox** — `msg_sends` em modo `freela`, `status=fila`, `scheduled_at ≤
  agora` e sem campanha → uma campanha `EXTERNAL_LIST` por lote (disparo
  agendado, ou mensagens de cadência vencidas naquele intervalo); (b) para cada
  `freela_campaigns` não terminal, `GET /:id` (status/stats) e, se tem
  `msg_sends` vinculados, `GET /:id/recipients` paginado casando por telefone
  E.164 → `SENT` ⇒ `enviada` (+ evento `msg_out` no lead, `last_contact_at`);
  `FAILED/SKIPPED` ⇒ `falhou` + `failure_reason`.
- Nas **cadências**, passos de mensagem em modo `freela` não "enviam" no tick:
  gravam o `msg_send` em `fila` e o outbox entrega ao Freela. A resposta
  continua sendo registrada à mão no Praça (o Freela não trata resposta), e a
  resposta tira da cadência como no protótipo.

### 7.7 Campanhas automáticas a partir do Praça

Tela **Freela → Automáticas**: lista (nome, agenda legível, público, canais,
ligada/pausada, última rodada) das campanhas automáticas do Freela, com filtro
"desta praça"; **Nova/Editar** com nome, agenda (`WEEKLY` dias da semana + hora
· `DATED` dia/mês, ano opcional, X dias antes), público (6 opções) recortado por
cidades da praça / UF / módulo, canais (WhatsApp e/ou push), texto (variantes),
título/corpo do push, imagem (upload por multipart passando pelo Praça), ritmo,
máximo por rodada; **ligar/pausar**. O vínculo praça ↔ template fica em
`freela_templates`. A tela **Freela → Conexão** mostra: configurado, alcançável,
e-mail da conta, flags de servidor (`meta.schedulerEnabled`), a flag de mensagem
por contato e o horário da última sincronização.

## 8. Web

```
src/app/
  layout.tsx · providers.tsx · globals.css (paleta do protótipo em oklch: dark
  padrão, .light por usuário; fontes Montserrat/Inter via next/font)
  entrar/page.tsx
  formulario/[pracaId]/page.tsx              (público, sem shell)
  page.tsx                                   (raiz: redirect('/hoje'))
  (app)/layout.tsx                           (guarda de sessão + AppShell)
  (app)/hoje · praca · funil · entrada · mensagens · campanhas ·
  calendario · indicadores · configuracoes · freela
src/modules/<feature>/infrastructure/*.api.ts   (axios + zod na borda)
src/modules/<feature>/application/use-*.ts      (react-query)
src/modules/shared/infrastructure/http.ts       (apiErrorMessage — nunca achatar)
src/modules/auth/…                              (auth.storage.ts é o único localStorage)
src/components/praca/*                          (AppShell, ActionPanel, LeadPanel, Disparos,
                                                 Cadencias, Camp*, AberturaPraca, bits, IndBits…)
src/components/ui/*                             (kit shadcn do protótipo)
src/lib/dates.ts · format.ts · utils.ts · ui-store.ts (+ recurrence, indicators…)
```

Telas portadas 1:1 (mesmo JSX/UX/textos) trocando `usePraca()` por hooks de
react-query e mutações; painéis (ação, lead) abrem por estado de UI (Zustand:
`openActionId`, `openLeadId`, `hojePerson`). Mapa da abertura de praça em
Leaflet (import dinâmico, só cliente). Impressão (`window.print()`) mantida.

## 9. Desvios propositais em relação ao protótipo

1. Motor de cadências no servidor (antes só rodava com a aba aberta).
2. Regra de negócio no servidor (agenda, fila, duplicidade, indicadores,
   métricas) — a tela só exibe.
3. Pessoas viraram contas; autor = quem está logado.
4. Modos de envio: `fila` (manual) e `freela`. Os modos "Meta oficial" e
   "provedor externo" do protótipo eram só campos de configuração sem envio; não
   entram (o chip e o ritmo anti-bloqueio já são do Freela).
5. `?camp=<id>` no formulário público: o protótipo citava e nunca lia; aqui grava
   `leads.campanha_id` (a ligação campanha ↔ funil passa a existir de verdade).
6. Evento de etapa guarda `stage_to` (o protótipo descobria a etapa fazendo
   `text.includes("7")`, que casa com "17").
7. Lead de teste da cadência é um lead válido marcado `is_test` (o protótipo
   criava um objeto com campos inexistentes via cast).
8. Variáveis fixas do render (`link_video_caso`, `link_cadastro`, `funcao`,
   `valor`, `turno`, `dia_forte`) viram `app_settings.template_defaults`,
   editáveis em Configurações, em vez de constantes no código.
9. Indicadores manuais na visão Empresa: soma dos últimos valores por praça
   para contagens, média para `%`/`h`/`R$` (o protótipo pegava a primeira praça).
10. Formulário público atribui o lead ao primeiro usuário ativo (consulta
    global, não por praça — o protótipo pegava `people[0]` sem checar se estava
    ativo) e é limitado por IP.
11. Dados do IBGE (500 KB) saem do bundle do navegador e ficam na API,
    servidos por UF.
12. Tema e praça ativa são por usuário, no banco.

> Estes 12 foram os desvios previstos **antes** da implementação. A lista
> fechada e atual (hoje 33 itens, com os que apareceram durante a
> implementação e na revisão final) é a do contrato:
> `docs/api-contract.md` §19.

## 10. Verificação

- `npm run typecheck` / `yarn typecheck` limpos; `npm run smoke` na API (login,
  catálogo, praça + agenda + portões, leads + fila + importação + desfazer,
  formulário público, modelos + disparo manual + reply/opt-out, cadência +
  teste comprimido, campanhas de mídia, indicadores, notificações, Freela
  desconfigurado = 503 e conversão de modelo) — repetível, sem resíduo;
  `node web/scripts/browser-check.mjs` (login pelo formulário, as telas sem erro
  de console, concluir ação **e desfazer**, criar lead e mover de etapa, criar
  disparo e abrir o painel **do disparo**, marcar envio como enviado, lançar e
  apagar indicador à mão, e o formulário público + o portão de sessão em
  contexto anônimo; a tela `/campanhas` só é conferida por texto).
- Integração Freela: testes unitários do `FreelaClient` (login/refresh/503),
  do conversor de modelo e do outbox/sync com o Freela mockado; teste manual
  contra a API local do Freela (3000) documentado no `docs/api-contract.md`.
- Um build/typecheck por vez (a máquina trava com builds paralelos).

## 11. Fora do escopo (agora)

Lembretes por e-mail (7h/semanal), integração real com Meta/Google Ads (o
"puxar pela API" continua simulado como no protótipo), tratamento de resposta
vinda do WhatsApp (o Freela também não trata), deploy em produção (fica
documentado no README como os outros ports).
