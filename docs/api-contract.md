# PRAÇA — contrato da API

Base: `http://localhost:3014`. Documento **canônico**: mudou endpoint, atualize
aqui primeiro. Swagger interativo em `/docs` (fora de produção).

## Índice

1. [Convenções](#1-convencoes)
2. [Auth — `/v1/auth`](#2-auth)
3. [Pessoas — `/v1/users`](#3-pessoas)
4. [Catálogo — `/v1/catalog`](#4-catalogo)
5. [Geo — `/v1/geo`](#5-geo)
6. [Praças — `/v1/pracas`](#6-pracas)
7. [Ações — `/v1/actions`](#7-acoes)
8. [Roteiro-modelo — `/v1/template-actions`](#8-roteiro-modelo)
9. [Funil de leads — `/v1/leads`](#9-funil)
10. [Entrada de leads — `/v1/imports`](#10-entrada)
11. [Formulário público — `/v1/public`](#11-formulario-publico)
12. [Mensagens — `/v1/msg-templates`, `/v1/settings`, `/v1/blocklist`](#12-mensagens)
13. [Disparos — `/v1/disparos`, `/v1/sends`](#13-disparos)
14. [Cadências — `/v1/cadences`, `/v1/enrollments`](#14-cadencias)
15. [Mídia — `/v1/campanhas`, `/v1/creatives`, `/v1/traffic`, `/v1/proofs`](#15-midia)
16. [Indicadores — `/v1/indicators`](#16-indicadores)
17. [Notificações — `/v1/notifications`](#17-notificacoes)
18. [Freela — `/v1/freela`](#18-freela)
19. [Desvios propositais em relação ao protótipo](#19-desvios)
20. [Consultores de campo — `/v1/campo`, `/v1/consultores`](#20-campo)

<a id="1-convencoes"></a>

## 1. Convenções

- Wire **snake_case**, espelhando o banco.
- Data "só dia": string `"YYYY-MM-DD"` — validada por `@IsDayString()`
  (`src/common/validation/is-day.decorator.ts`), que confere formato **e**
  existência no calendário: `"2026-02-31"` responde `400 VALIDATION_ERROR`,
  não vira 500 na primeira conta de data. Timestamp: ISO UTC. "Hoje" vem de
  `todaySp()` (`src/common/time/dates.ts`), nunca de `new Date().toISOString()`.
- Erro **sempre** `{ "error": { "code": "CODIGO", "message": "texto" } }`.
- Autenticação: `Authorization: Bearer <jwt>` (HS256, 12h). Rotas públicas
  (`@Public()`): `GET /health`, `POST /v1/auth/login`, `GET /v1/catalog`,
  todo o `GET /v1/geo/*` (§5) e todo o `/v1/public/*` (§11 — formulário de
  captura). Todas as demais exigem token — `JwtAuthGuard` é global.
- `ValidationPipe` global com `whitelist + forbidNonWhitelisted + transform`:
  campo sem decorator no DTO derruba a requisição com `VALIDATION_ERROR`.
  PATCH aceita apenas os campos declarados — mandar o objeto inteiro que veio
  do GET quebra.
- Id vindo da URL passa por `isUuid()` antes do Prisma: id malformado responde
  `404 NOT_FOUND`, nunca `500`.
- Throttle: 300 req/min **por rota** e por IP — o `@nestjs/throttler` monta a
  chave com classe + handler, então cada rota tem o seu balde. O formulário
  público tem teto próprio (§11).
- O IP é o `req.ip` do Fastify. Atrás de proxy reverso (nginx) isso é o IP do
  proxy — e aí o mundo inteiro divide um balde só. Por isso existe
  `TRUST_PROXY=true` (ver README, "Produção"), que faz o Fastify ler
  `X-Forwarded-For`. Sem proxy na frente ela fica **desligada**: confiar no
  cabeçalho ali deixaria qualquer um forjar o próprio IP.

<a id="2-auth"></a>

## 2. Auth — `/v1/auth`

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/login` | `{email, password}` | `{access_token, user}` |
| GET | `/me` | — | `{user}` |

`user` é sempre um `UserView` (ver §3). Erros: `INVALID_CREDENTIALS` (e-mail
ou senha não batem), `UNAUTHORIZED` (senha certa, conta desativada — mesmo
código que o guard usa quando a conta é desativada depois do token emitido).

<a id="3-pessoas"></a>

## 3. Pessoas — `/v1/users`

`UserView`:

```json
{
  "id": "uuid",
  "email": "diego@praca.local",
  "name": "Diego",
  "role_label": "CEO — visitas às casas grandes, decisões, aprovação de verba",
  "color": "#ECA826",
  "phone": "",
  "is_admin": true,
  "active": true,
  "theme": "dark",
  "active_praca_id": null,
  "sort": 0
}
```

Nunca inclui `password_hash`.

| Método | Rota | Quem | Corpo | Observação |
|---|---|---|---|---|
| GET | `/` | qualquer autenticado | — | `UserView[]`, ordem `sort, created_at`; inclui inativos (`active:false`) |
| POST | `/` | admin | `{email, password, name, role_label?, color?, phone?, is_admin?}` | `201`; `409 EMAIL_IN_USE` |
| PATCH | `/me` | qualquer autenticado | `{name?, color?, phone?, theme?, active_praca_id?}` | atualiza a própria conta |
| PATCH | `/:id` | admin | `{name?, role_label?, color?, phone?, is_admin?, active?, sort?}` | ver regras abaixo |
| PUT | `/:id/password` | admin, ou o próprio | `{password}` | `{ok:true}`; senão `403 FORBIDDEN` |
| DELETE | `/:id` | admin | — | soft delete: `active=false`; `{ok:true}` |

Regras de desativação (`active:false`, via `PATCH /:id` ou `DELETE /:id`):

- Uma conta não pode se autodesativar: `400 CANNOT_DEACTIVATE_SELF`.
- A última conta admin ativa não pode ser desativada: `400 LAST_ADMIN`.

`theme` ∈ `dark`, `light`. `color` é hex (`#RRGGBB`). `active_praca_id`
referencia `pracas.id` (§6; sem FK no banco — quando a praça é apagada, o
campo é limpo à mão pelo `DELETE /v1/pracas/:id`); `null` desvincula.

`PATCH /me` com `active_praca_id` **confere a praça** (uuid e existência) e
responde `404 NOT_FOUND` quando ela não existe. Sem essa conferência, um uuid
bem-formado e inexistente entrava com `200` e estourava depois: `POST
/v1/cadences/:id/test` grava essa praça em `leads.praca_id`, que **tem** FK, e o
erro do Prisma virava `500 INTERNAL_ERROR`. Id malformado é
`400 VALIDATION_ERROR` (o `@IsUUID()` do DTO).

<a id="4-catalogo"></a>

## 4. Catálogo — `/v1/catalog`

Conteúdo estático (roteiro-modelo, funil, mensagens, cadências, mídia e
indicadores) — vive em código (`src/domain/catalog/`), não no banco. Rota
**pública** (`@Public()`, sem token — ver §1).

| Método | Rota | Quem | Resposta |
|---|---|---|---|
| GET | `/` | público (sem token) | objeto único com todo o catálogo (ver campos abaixo) |

Campos da resposta:

| Campo | Origem (`src/domain/catalog/`) | Conteúdo |
|---|---|---|
| `steps` | `steps.ts` | roteiro-modelo — 11 etapas (`n, name, block, expected, gate?`) |
| `gated_by` | `steps.ts` | etapa → etapa anterior que a libera (`{"3":2,"7":6,"11":10}`) |
| `step_blocks` | `steps.ts` | blocos do roteiro (`Preparar, Começar, Provar, Crescer, Fixas`) |
| `funnel_stages` | `funnel.ts` | 8 etapas do funil de leads (`n, name, meaning, color`) |
| `lost_reasons` | `funnel.ts` | motivos de perda de lead (lista sugerida — o campo aceita texto livre) |
| `classes` | `funnel.ts` | classificação do lead (`grande, alvo, depois`) |
| `origens` | `funnel.ts` | origens de lead |
| `import_origens` | `funnel.ts` | origens usadas na importação em lote |
| `event_labels` | `funnel.ts` | rótulo de cada tipo de evento do lead |
| `contact_kinds` | `funnel.ts` | tipos de evento que contam como contato |
| `est_value` | `funnel.ts` | valor estimado (R$) por classe de lead |
| `lead_fields` | `funnel.ts` | campos mapeáveis na importação de leads (com dicas de coluna) |
| `classe_order` | `funnel.ts` | ordem de exibição das classes |
| `channels` | `messages.ts` | canais de mensagem |
| `audiences` | `messages.ts` | públicos de mensagem (contratante/freelancer) |
| `send_modes` | `messages.ts` | modos de envio — `fila` (fila manual) e `freela` (via campanhas do Freela) |
| `variables` | `messages.ts` | variáveis de template disponíveis (16) |
| `hard_min` / `hard_max` | `messages.ts` | janela de horário permitida para envio (8h–20h) |
| `entry_rules` | `cadences.ts` | regras de entrada em cadência |
| `cond_rules` | `cadences.ts` | condições avaliadas em um nó de cadência |
| `cond_actions` | `cadences.ts` | ações de saída de um nó condicional |
| `exit_reason_labels` | `cadences.ts` | rótulo de cada motivo de saída de cadência |
| `objetivos` | `midia.ts` | objetivos de campanha |
| `destinos` | `midia.ts` | destinos de campanha |
| `formatos` | `midia.ts` | formatos de criativo |
| `creative_status` | `midia.ts` | status do criativo (kanban) |
| `campanha_status` | `midia.ts` | status da campanha |
| `ia_tools` | `midia.ts` | ferramentas de IA usadas em criativos |
| `meses` | `midia.ts` | abreviações de mês (nome de campanha) |
| `script_models` | `midia.ts` | modelos de roteiro de criativo (5) |
| `proof_kind_labels` | `midia.ts` | rótulo de cada tipo de prova social |
| `gate_warning` | `midia.ts` | aviso de portão do playbook não batido |
| `fill_alert` | `midia.ts` | aviso de preenchimento de vaga acima do limite |
| `fill_limit_h` | `steps.ts` | limite de horas para preenchimento da vaga (4) |
| `indicators` | `indicators.ts` | catálogo de indicadores (12; 6 marcados `hero`) |
| `milestones` | `indicators.ts` | metas por horizonte de tempo |
| `canais` | `indicators.ts` | canais de origem para leitura de indicadores |
| `periods` | `indicators.ts` | períodos pré-definidos (hoje, semana, mês, 90 dias, livre) |

`owner_email` (dentro de cada item de `indicators`) é um dos e-mails de
`shared/users` (`diego@praca.local`, `rebeca@praca.local`, `mkt@praca.local`);
o serviço de indicadores (tarefa futura) resolve para `owner_id` procurando o
usuário por e-mail, `null` se não existir.

<a id="5-geo"></a>

## 5. Geo — `/v1/geo`

Municípios do IBGE (coordenadas + população, Censo 2022) — dado estático em
`src/modules/geo/data/municipios.json` (copiado de
`.prototype/src/lib/praca/municipios.json`), carregado uma vez no boot. Todas
as rotas são **públicas** (`@Public()`, sem token — ver §1); usadas na tela de
abertura de praça, antes de existir vínculo com uma praça específica.

**Regra `EXCLUIR`** (do protótipo, `geo.ts:26`): os municípios "Rio de
Janeiro" e "São Paulo" nunca aparecem — nem em `/municipios`, nem como
`centro` ou `vizinhas` de `/vizinhas`. A exclusão é aplicada uma vez, na
carga do JSON, e vale para o módulo inteiro (inclusive `GET
/v1/geo/municipios/:ibge/vizinhas` com o `:ibge` de uma dessas duas cidades
— `404 NOT_FOUND`, o mesmo código de um IBGE que não existe).

`Municipio` (forma usada em `/municipios` e em `centro`/cada item de
`vizinhas`):

```json
{
  "ibge": "3106200",
  "nome": "Belo Horizonte",
  "uf": "MG",
  "lat": -19.9102,
  "lon": -43.9266,
  "pop": 2315560,
  "capital": true
}
```

| Método | Rota | Query | Resposta | Observação |
|---|---|---|---|---|
| GET | `/estados` | — | `string[]` (27 UFs, código de 2 letras) | ordem do JSON de origem |
| GET | `/municipios` | `uf` (obrigatória) | `Municipio[]` | ordenado por `nome` (`localeCompare` pt-BR); `400 VALIDATION_ERROR` sem `uf` |
| GET | `/municipios/:ibge/vizinhas` | `km?` (1–300, default 50) | `{centro, raio_km, vizinhas, pop_total}` | `404 NOT_FOUND` se `:ibge` não existe |

`GET /municipios/:ibge/vizinhas`:

- `centro`: o próprio `Municipio` de `:ibge`.
- `raio_km`: o `km` efetivamente usado (o da query, ou 50).
- `vizinhas`: `Municipio[]` + `km` (distância até o centro, `haversineKm`,
  sem arredondar), **excluindo o próprio centro**, ordenado da maior para a
  menor população.
- `pop_total`: soma de `pop` de todas as `vizinhas` **mais** a `pop` do
  `centro` (mesmo cálculo do protótipo, `AberturaPraca.tsx` — `popTotal`).

`km` fora de `1..300` (ex.: `0` ou `301`) → `400 VALIDATION_ERROR`.

`GeoService` (uso interno, fora do wire): `haversineKm(aLat, aLon, bLat,
bLon)` — mesma fórmula de `geo.ts:41-57` (Haversine, raio da Terra = 6371 km);
`cidadesNoRaio(ibge, km)`; `find(ibge)` (lookup simples, `undefined` se não
existir); `municipiosPorUf(uf)`; `estados()`.

<a id="6-pracas"></a>

## 6. Praças — `/v1/pracas`

Praça é a unidade de trabalho do sistema: uma cidade (mais as vizinhas) sendo
aberta em ~98 dias, com o roteiro-modelo (§8) instanciado como ações (§7) e as
11 etapas do catálogo (§4 `steps`) medidas por portões.

`PracaView`:

```json
{
  "id": "uuid",
  "name": "Belo Horizonte + Contagem",
  "city": "Belo Horizonte · MG",
  "start_date": "2026-09-01",
  "end_date": "2026-12-08",
  "cobertura": {
    "uf": "MG",
    "cidade": "Belo Horizonte",
    "ibge": "3106200",
    "lat": -19.9102,
    "lon": -43.9266,
    "vizinhas": ["Contagem", "Betim", "..."]
  },
  "steps": { "2": { "actual": 22, "unlock": null } },
  "created_at": "2026-09-09T11:00:00.000Z"
}
```

- `cobertura` é `null` quando a praça foi aberta sem cidade-sede do IBGE. Essa praça funciona normalmente no trabalho de campo: ela ganha **áreas de atuação** (§21), que dão o centro e o raio do que se visita.
- `steps` só traz as etapas que já têm estado (resultado lançado ou destrave);
  a chave é o número da etapa. `unlock` é `{by, at, reason}` ou `null`.

| Método | Rota | Quem | Corpo | Observação |
|---|---|---|---|---|
| GET | `/` | autenticado | — | `PracaView[]`, ordem `created_at` |
| POST | `/` | autenticado | `{name, city, start_date, end_date, cobertura?}` | `201`; instancia o roteiro-modelo e vira a praça ativa de quem criou |
| GET | `/:id` | autenticado | — | `PracaView` |
| PATCH | `/:id` | autenticado | `{name?, city?, start_date?, end_date?}` | `PracaView` |
| DELETE | `/:id` | **admin** | — | apaga a praça e tudo dela (cascata); `{ok:true}` |
| POST | `/:id/recalc-dates` | autenticado | — | `{ok:true, updated}` |
| GET | `/:id/steps` | autenticado | — | `StepInfoView[]` (as 11 etapas, em ordem) |
| PUT | `/:id/steps/:n/result` | autenticado | `{value}` | `StepInfoView` da etapa |
| POST | `/:id/steps/:n/unlock` | autenticado | `{reason}` | `StepInfoView` da etapa; autor = quem está logado |
| GET | `/:id/agenda` | autenticado | — | ver "Agenda" abaixo |

`POST /` — `cobertura` entra como `{ibge, km?}` (código de 7 dígitos do IBGE,
raio em km, 1–300, padrão 50): UF, cidade, `lat`/`lon` e `vizinhas` saem do
`GeoService` (§5), nunca do cliente. `ibge` que não existe → `404 NOT_FOUND`.
A criação instancia **todas** as `template_actions` como `actions` da praça
(mesmas colunas, `template_key` = `key` da modelo, `how_to` vira subitem) e
grava `users.active_praca_id` de quem criou.

`end_date` anterior a `start_date` → `400 VALIDATION_ERROR` (em `POST` e em
`PATCH`, considerando os campos que já estão gravados).

`POST /:id/recalc-dates` devolve as ações da praça para a data do roteiro:
zera `due_override` e `postpone_count` de todas (comentários de adiamento
ficam, como rastro). `updated` = quantas ações foram tocadas.

`DELETE /:id` apaga em cascata ações, subitens, comentários, conclusões e
estados de etapa; quem estava com essa praça ativa fica com
`active_praca_id: null` (o campo não tem FK — ver §3).

`:n` fora das 11 etapas do roteiro → `404 NOT_FOUND`.

### `StepInfoView`

```json
{
  "n": 3,
  "name": "Fechar os 10 primeiros PDVs",
  "block": "Começar",
  "expected": "10 clientes fechados, sendo 3 casas grandes, todos com a primeira vaga marcada.",
  "gate": null,
  "status": "locked",
  "done": 0,
  "total": 6,
  "window": ["2026-09-17", "2026-09-28"],
  "lock_reason": "Falta bater o Portão: 40 garçons confirmados. Hoje: 22",
  "actual": null,
  "unlock": null
}
```

- `gate` é o portão **da própria etapa** (`{target, dir, label}`, do catálogo)
  ou `null`; quem trava a etapa é o portão da etapa anterior (`GATED_BY`:
  3←2, 7←6, 11←10).
- `status`: `locked` (portão da anterior não batido e sem destrave) ·
  `done` (todas as ações concluídas **e** `actual` lançado) · `active`
  (alguma concluída) · `todo`.
- `lock_reason` só vem preenchido em `locked`; o texto é o do protótipo
  (`Falta bater o Portão: {label}. Hoje: {actual da anterior, 0 se vazio}`).
- `window` é `[primeiro, último]` dia da etapa, calculado do `start_date` da
  praça + os dias do roteiro (`day`/`start_day`/`end_day`); `null` se a etapa
  não tem ação.
- Portão `gte` compara com `actual ?? 0` (sem resultado nunca bate); portão
  `lte` exige resultado lançado. Assimetria portada do protótipo.

### Agenda — `GET /:id/agenda?from&to&person`

```json
{
  "late": [{ "action_id": "uuid", "date": "2026-09-03", "days_late": 7 }],
  "today": [{ "action_id": "uuid", "date": "2026-09-10" }],
  "next7": [{ "date": "2026-09-11", "action_ids": ["uuid"] }],
  "by_date": { "2026-09-12": ["uuid"] },
  "load": [{ "user_id": "uuid", "count": 3 }]
}
```

- `late`, `today` e `next7` são **sempre relativos a hoje** (`todaySp()`), não
  a `from`/`to`. `next7` cobre os 7 dias seguintes a hoje (sem hoje),
  agrupado e ordenado por data.
- Ação com data marcada (`once`) entra em `late` quando venceu e não foi
  concluída. Ação recorrente entra **no máximo uma vez**: a varredura vai de 7
  dias atrás até ontem e para na primeira ocorrência perdida — ou seja, a mais
  antiga dentro da janela (mesmo comportamento do protótipo,
  `routes/index.tsx:604-608`).
- `person`: `all` (padrão) ou o uuid de uma pessoa; filtra `late`, `today`,
  `next7` e `by_date` por `owners`. Qualquer outro valor →
  `400 VALIDATION_ERROR`.
- `load` **ignora** `person` de propósito (é a barra de carga do dia de todo
  mundo): uma linha por pessoa ativa, com quantas ações caem hoje para ela e
  ainda não estão concluídas.
- `from`/`to` valem só para `by_date`, que cobre o intervalo **inclusive**.
  Sem os dois, `by_date` vem vazio (`{}`); com só um deles, o outro vira o
  mesmo dia. Intervalo invertido ou maior que **62 dias** →
  `400 VALIDATION_ERROR`.

### Recorrência (`rec`)

Objeto usado nas ações (§7) e no roteiro-modelo (§8); no banco vira colunas
`rec_*`:

| `kind` | Campos | Quando ocorre |
|---|---|---|
| `once` | `day` | no dia `start_date + day` (ou em `due_override`, se adiada) |
| `daily` | `start_day`, `end_day?` | todo dia da janela |
| `weekday` | `start_day`, `end_day?` | de segunda a sexta, dentro da janela |
| `weekly` | `weekday` (0=domingo), `start_day`, `end_day?` | naquele dia da semana, dentro da janela |
| `monthly` | `month_day`, `start_day` | todo dia `month_day` do mês, a partir do início |

`start_day`/`end_day`/`day` são **dias desde o início da praça**, não datas.
Ação fixa (`step: 0`) roda todo dia, **inclusive antes** do `start_date` da
praça (regra do protótipo) — mas ainda respeita o `end_day`.

<a id="7-acoes"></a>

## 7. Ações — `/v1/actions`

`ActionView`:

```json
{
  "id": "uuid",
  "praca_id": "uuid",
  "template_key": "s1a2",
  "step": 1,
  "title": "Aprovar a área desenhada",
  "owners": ["uuid"],
  "rec": { "kind": "once", "day": 3 },
  "tools": ["CRM"],
  "expected": null,
  "msg": null,
  "attention": null,
  "expects_result": false,
  "due_override": null,
  "postpone_count": 0,
  "completed_at": null,
  "completed_by": null,
  "result": null,
  "sort": 1,
  "completions": { "2026-09-07": { "by": "uuid", "at": "2026-09-07T12:00:00.000Z", "result": null } },
  "comments": [{ "id": "uuid", "author_id": "uuid", "at": "2026-09-09T11:00:00.000Z", "text": "…" }],
  "subitems": [{ "id": "uuid", "text": "Abrir o Google Maps…", "done": false, "sort": 0 }]
}
```

`template_key` é `null` em ação avulsa. `step: 0` = ação fixa (fora das
etapas). `completions` é um mapa por data (só ação recorrente usa).

| Método | Rota | Corpo | Observação |
|---|---|---|---|
| GET | `/?praca_id=` | — | `ActionView[]` da praça, ordem `step, sort`; `praca_id` é obrigatório |
| POST | `/` | `{praca_id, title, owners, due_date}` | ação avulsa: `step 0`, `rec once day 0`, `due_override = due_date` |
| GET | `/:id` | — | `ActionView` |
| PATCH | `/:id` | `{title?, owners?}` | `ActionView` |
| POST | `/:id/complete` | `{date?, result?}` | conclui |
| POST | `/:id/uncomplete` | `{date?}` | desfaz |
| POST | `/:id/postpone` | `{new_date, reason}` | só ação `once` |
| POST | `/:id/reassign` | `{user_id}` | troca o dono (`owners` vira `[user_id]`) |
| POST | `/:id/comments` | `{text}` | `ActionView` com o comentário no fim |
| POST | `/:id/subitems` | `{text}` | novo subitem no fim |
| POST | `/:id/subitems/:sid/toggle` | — | marca/desmarca |

Toda rota devolve o `ActionView` inteiro depois de escrever (o front repinta a
ação sem um segundo GET). Exige token; não há restrição de admin — qualquer
pessoa do time mexe em qualquer ação.

- **complete**: ação `once` grava `completed_at`, `completed_by` e `result`
  (o `date` do corpo é ignorado). Ação recorrente grava a ocorrência do dia em
  `completions[date]` — `date` padrão é hoje em Brasília. Repetir só atualiza
  quem/quando (idempotente). `result` só é escrito quando vem no corpo:
  concluir de novo sem `result` **mantém** o número já lançado — para zerar,
  use `uncomplete`.
- **uncomplete**: `once` limpa `completed_at/by/result`; recorrente apaga a
  ocorrência de `date` (padrão hoje).
- **postpone**: só faz sentido com data marcada — ação recorrente responde
  `400 ACTION_NOT_POSTPONABLE`. Grava `due_override = new_date`, soma 1 em
  `postpone_count` e deixa o comentário `Adiada para dd/mm/aaaa — motivo`.
- `owners`/`user_id` que não existem em `users` → `404 NOT_FOUND`.
- `:sid` que não é subitem daquela ação → `404 NOT_FOUND`.

> POST sem corpo (`recalc-dates`, `toggle`) precisa ser enviado **sem**
> `Content-Type: application/json` — o Fastify recusa corpo vazio com esse
> cabeçalho antes de a requisição chegar no Nest.

<a id="8-roteiro-modelo"></a>

## 8. Roteiro-modelo — `/v1/template-actions`

O playbook de abertura de praça: 84 ações-modelo (seed
`prisma/seed-data/template-actions.ts`, portadas do protótipo). Toda praça
nova nasce com uma cópia dessa lista.

Item:

```json
{
  "id": "uuid",
  "key": "s2a3",
  "step": 2,
  "title": "Disparar a reativação em lotes de 300 por dia",
  "owners": ["uuid"],
  "rec": { "kind": "weekday", "start_day": 5, "end_day": 12 },
  "tools": ["WhatsApp Business"],
  "how_to": ["…"],
  "expected": null,
  "msg": null,
  "attention": "Não dispare a base inteira de uma vez: lotes de 300 evitam bloqueio do número.",
  "expects_result": false,
  "sort": 15
}
```

| Método | Rota | Quem | Corpo | Observação |
|---|---|---|---|---|
| GET | `/` | autenticado | — | lista ordenada por `sort` |
| POST | `/` | **admin** | `{step, title, owners, rec}` | `201`; `key` é gerada (`custom-xxxxxxxx`) |
| PATCH | `/:id` | **admin** | `{title?, owners?, rec?}` | |
| DELETE | `/:id` | **admin** | — | `{ok:true}` |

- `key` é a identidade estável da ação-modelo: o seed faz upsert por ela com
  `update: {}`, então rodar o seed de novo **não** desfaz edição do time.
- `step`: `0` (ação fixa) ou `1..11`; fora disso → `400 VALIDATION_ERROR`.
- `rec` precisa dos campos do seu `kind` (§6 "Recorrência") — faltando
  qualquer um, `400 VALIDATION_ERROR`.
- `DELETE` só tira do roteiro-modelo: as ações já instanciadas nas praças
  continuam lá.

<a id="9-funil"></a>

## 9. Funil de leads — `/v1/leads`

Os contratantes mapeados na praça (bares, restaurantes, hotéis, buffets e casas
de evento) e o histórico de cada um. Etapas 1 a 8 do funil vêm do catálogo
(§4 `funnel`).

`LeadListView`:

```json
{
  "id": "uuid",
  "praca_id": "uuid",
  "name": "Bar do Mercado",
  "city": "Belo Horizonte",
  "address": "Rua 100, Belo Horizonte",
  "phone": "(31) 98000-1000",
  "cnpj": null,
  "instagram": "@bardomercado",
  "site": "",
  "decisor": "Marcos Vieira",
  "decisor_role": "Proprietário",
  "classe": "alvo",
  "origem": "importação",
  "owner_id": "uuid",
  "stage": 1,
  "entered_at": "2026-08-28",
  "stage_since": "2026-09-06",
  "last_contact_at": null,
  "last_contact_date": null,
  "stalled_days": 3,
  "est_value": 2200,
  "next_step": { "what": "Novo toque no WhatsApp", "date": "2026-09-11" },
  "lost_reason": null,
  "reheat_at": null,
  "archived": false,
  "import_batch_id": null,
  "possible_dup": false,
  "snooze_until": null,
  "campanha_id": null,
  "form_answer": null,
  "is_test": false,
  "events_count": 1,
  "vagas_count": 0
}
```

`LeadView` = `LeadListView` + a ficha inteira:

```json
{
  "events": [
    { "id": "uuid", "at": "2026-09-06T14:30:00.000Z", "author_id": "uuid", "author_label": null, "kind": "msg_out", "text": "Primeira mensagem enviada no WhatsApp.", "stage_to": null }
  ],
  "vagas": [{ "id": "uuid", "date": "2026-08-20", "funcao": "Garçom", "filled": true, "hours": 3 }]
}
```

Campos calculados (regras puras em `src/domain/lead-rules.ts`, portadas do
protótipo):

- `last_contact_date`: dia (Brasília) do último evento de contato
  (`msg_out`, `msg_in`, `call`, `visit`) ou, na falta dele, de
  `last_contact_at`. Nota e mudança de etapa **não** contam como contato.
- `stalled_days`: dias desde `last_contact_date`; sem contato nenhum, cai para
  `stage_since`. Parado = mais de 7 dias; crítico = mais de 15.
- `est_value`: `4500` (casa grande), `2200` (alvo), `900` (depois).
- `author_label` é o nome de quem escreveu quando o evento não veio de uma
  pessoa do time (importação, robô); com `author_id` preenchido, vem `null`.

| Método | Rota | Quem | Corpo | Observação |
|---|---|---|---|---|
| GET | `/?praca_id&q&owner_id&classe&stage&archived&campanha_id` | autenticado | — | `LeadListView[]`, ordem `stage, entered_at` |
| POST | `/` | autenticado | `{praca_id?, name, city?, address?, phone, cnpj?, instagram?, site?, decisor?, decisor_role?, classe, origem, owner_id, stage?, campanha_id?}` | `LeadView` |
| GET | `/queue?person=all\|<uuid>` | autenticado | — | fila do dia |
| GET | `/metrics?praca_id` | autenticado | — | painel do funil |
| GET | `/orphans` | autenticado | — | `LeadListView[]` sem praça |
| GET | `/:id` | autenticado | — | `LeadView` |
| PATCH | `/:id` | autenticado | mesmos campos do POST, opcionais (menos `stage`) | `LeadView` |
| POST | `/:id/move` | autenticado | `{stage, next_step?, lost_reason?}` | muda de etapa |
| POST | `/:id/events` | autenticado | `{kind, text}` | `kind` ∈ `msg_out\|msg_in\|call\|visit\|note` |
| PUT | `/:id/next-step` | autenticado | `{what, date}` | troca o próximo passo |
| POST | `/:id/archive` | autenticado | — | arquiva (histórico fica) |
| POST | `/:id/snooze` | autenticado | `{until}` | tira da fila do dia até a data |
| POST | `/:id/vagas` | autenticado | `{date, funcao, filled, hours?}` | vaga rodada pela casa |
| DELETE | `/:id` | **admin** | — | `{ok:true}` — apaga de vez |

Toda rota devolve o `LeadView` inteiro depois de escrever (o front repinta a
ficha sem um segundo GET).

- **GET `/`**: `archived` é `"true"` ou `"false"` (texto, é query string);
  o padrão esconde os arquivados e `archived=true` traz os dois. `q` busca em
  `name`, `city` e `decisor`, sem diferenciar maiúsculas de minúsculas.
- **POST**: `entered_at` e `stage_since` nascem com hoje (Brasília) e o
  `phone_key` (últimos 9 dígitos) é derivado do `phone`. `stage` padrão é `1`.
  `owner_id`, `praca_id` e `campanha_id` que não existem → `404 NOT_FOUND`.
- `origem` é **texto livre** (1 a 60 caracteres, aparado). As listas do
  catálogo (§4 `origens` e `import_origens`) são sugestão de tela, não trava:
  a importação de planilha, o formulário público e o diálogo de novo lead
  gravam origens que não estão na lista curta (`tráfego pago`, `orgânico`,
  `prospecção ativa`, `evento`). `lost_reason` segue a mesma regra: é **texto
  livre** (1 a 120 caracteres, aparado) e a lista do catálogo (§4
  `lost_reasons`) é sugestão de tela — a opção "outro" do diálogo de mover
  grava o motivo que o usuário digitou. Só `classe` é conjunto fechado do
  catálogo.
- **PATCH** não aceita `stage`: etapa muda só pelo `/move`, que grava o evento
  e reinicia o `stage_since`. Mandar `stage` no PATCH →
  `400 VALIDATION_ERROR` (`forbidNonWhitelisted`).
- **move**: `stage` é 1..8 e precisa ser diferente da atual
  (`400 SAME_STAGE`). Etapa 8 exige `lost_reason` — texto livre de 1 a 120
  caracteres, do catálogo ou digitado pelo usuário
  (`400 LOST_REASON_REQUIRED` sem motivo, `400 VALIDATION_ERROR` com motivo
  vazio ou acima de 120 caracteres); as outras exigem `next_step`
  (`400 NEXT_STEP_REQUIRED`). Grava `stage_since = hoje` e um evento
  `kind: "stage"` com `stage_to`, texto
  `Mudou de etapa: <de> → <para>` (ou `Voltou etapa: …` quando volta) mais
  ` · motivo: <motivo>` quando há motivo. `lost_reason === "não respondeu"`
  agenda `reheat_at = hoje + 30`; sair da etapa 8 limpa `lost_reason` e
  `reheat_at`.
- **events**: `kind: "stage"` é recusado (`400 VALIDATION_ERROR`) — etapa só
  pelo `/move`. Evento de contato (`msg_out`, `msg_in`, `call`, `visit`)
  carimba `last_contact_at = agora`; `note` não.
- **archive** não apaga nada: marca `archived` e deixa a nota
  `Lead arquivado (histórico mantido).` no histórico. **DELETE** é o oposto —
  apaga o lead e, por cascata, eventos, vagas, envios e inscrições; existe
  para limpar lead de teste e importação errada, e por isso é só de admin.
- `:id` malformado → `404 NOT_FOUND` (nunca 500).

### Fila do dia — `GET /queue?person=all|<uuid>`

```json
{ "total": 5, "grandes": 1, "quota": 20, "items": [{ "…LeadListView": "…", "is_reheat": false }] }
```

Quem entra: lead **não arquivado**, sem soneca vigente
(`snooze_until` nulo ou já vencida) e que seja lead novo (`stage 1`) **ou**
perdido com reaquecimento vencido (`stage 8` e `reheat_at <= hoje`). Ordem:
casa grande, alvo, depois — e, dentro da classe, os mais antigos na frente
(`entered_at`).

- `quota` vem de `app_settings.daily_quota` (20 enquanto ninguém salvou os
  ajustes) e corta `items`; `total` é a fila inteira, para a tela avisar
  quantos ficaram de fora. `grandes` conta as casas grandes da fila inteira.
- `is_reheat` marca o lead que voltou por reaquecimento (`stage 8`).
- `person` é `"all"` (padrão) ou o id de uma pessoa; qualquer outra coisa →
  `400 VALIDATION_ERROR`.

### Painel do funil — `GET /metrics?praca_id`

```json
{ "total": 25, "conv_contact": 43, "conv_active": 33, "avg_days": 9, "stalled": 4, "critical": 2, "lost": 2, "pipeline": 52700 }
```

Sempre só sobre os **não arquivados** da praça (sem `praca_id`, sobre a base
inteira). `conv_contact` = cadastrados (`stage >= 5`) sobre contatados
(`stage >= 2`), em %; `conv_active` = clientes ativos (`stage 7`) sobre
cadastrados; `avg_days` = média de dias da entrada até o último toque dos
cadastrados (descontado o tempo parado); `stalled`/`critical` = parados há
mais de 7 e de 15 dias; `lost` = etapa 8; `pipeline` = soma de `est_value`
das etapas 1 a 6.

> POST sem corpo (`archive`) precisa ser enviado **sem**
> `Content-Type: application/json` — o Fastify recusa corpo vazio com esse
> cabeçalho antes de a requisição chegar no Nest.

---

<a id="10-entrada"></a>

## 10. Entrada de leads — `/v1/imports`

Importação de arquivo (CSV/XML lido no navegador — a API recebe as linhas já
parseadas), com duplicidade conferida **no servidor**, mapeamentos salvos e
desfazer em até 24 h. Regras puras em `src/domain/dedup.ts`, portadas do
protótipo (`lib/praca/intake.ts`).

### Conceitos

- **Mapeamento** (`map`): `campo do lead → coluna do arquivo`. Os campos são os
  do catálogo (§4 `lead_fields`): `name`, `address`, `city`, `phone`,
  `instagram`, `decisor`, `classe`, `origem`, `cnpj`. Campo fora dessa lista →
  `400 VALIDATION_ERROR`.
- **Duplicidade**, em três degraus, nesta ordem: **telefone** (últimos 9
  dígitos, ignorando máscara e DDI) → **CNPJ** (14 dígitos) → **nome +
  endereço** (sem acento, caixa nem pontuação). Vale contra **todos os leads
  não arquivados** e também **entre as linhas do próprio arquivo** — a segunda
  linha igual do arquivo é duplicata da primeira (nesse caso `dup.lead_id` vem
  `null`, porque ainda não existe lead no banco).
- **`dup_action`**: `ignorar` (não entra), `completar` (preenche só os campos
  vazios do lead que já existe) ou `criar` (entra marcado com
  `possible_dup: true`).
- **`praca_mode`**: `lote` (a praça de `lote_praca_id` vale para o arquivo
  inteiro) ou `arquivo` (a praça sai da cidade de cada linha — a primeira praça
  cuja cidade **ou** nome contém a cidade da linha; em empate vence a **mais
  antiga**, que é a ordem em que as praças são lidas). Sem casar, o lead entra
  **sem praça** e aparece em `GET /v1/leads/orphans`.
- **`owner_mode`**: `lote` (todos para `lote_owner_id`) ou `rodizio`
  (distribui em ordem entre `rodizio_ids`; vazio = todo mundo ativo). Rodízio
  que não encontra ninguém ativo → `400 NO_OWNERS`
  (`"Não há ninguém ativo para receber os leads."`); acontece com
  `rodizio_ids` vazio numa base onde todas as contas foram desativadas.
- Linha **sem nome** ou **sem telefone** (menos de 8 dígitos) nunca entra.

`classe` é adivinhada do texto da planilha: "grande"/"alta" → `grande`;
"depois"/"baixa"/"frio" → `depois`; vazio ou desconhecido → `alvo`.

### Avaliar — `POST /evaluate`

Corpo:

```json
{
  "columns": ["Nome", "Telefone", "Cidade"],
  "rows": [{ "Nome": "Bar Novo", "Telefone": "(31) 97000-1234", "Cidade": "Belo Horizonte" }],
  "map": { "name": "Nome", "phone": "Telefone", "city": "Cidade" },
  "origem": "importação",
  "dup_action": "ignorar",
  "praca_mode": "lote",
  "lote_praca_id": "uuid"
}
```

Resposta:

```json
{
  "total": 3,
  "dups": 1,
  "no_phone": 1,
  "no_name": 0,
  "will_import": 1,
  "sem_praca": 0,
  "guessed_map": { "name": "Nome", "phone": "Telefone", "city": "Cidade" },
  "rows": [
    {
      "draft": { "name": "Bar Novo", "address": "", "city": "Belo Horizonte", "phone": "(31) 97000-1234", "instagram": "", "decisor": "", "classe": "alvo", "origem": "importação", "cnpj": "" },
      "dup": { "lead_id": "uuid", "lead_name": "Bar do Mercado", "by": "telefone" },
      "no_phone": false,
      "no_name": false,
      "praca_id": "uuid"
    }
  ]
}
```

- `rows` traz só as **10 primeiras** linhas avaliadas (pré-visualização); as
  contagens são do arquivo inteiro.
- `guessed_map` vem **sempre**, calculado das `columns` pelas dicas do
  catálogo — a tela usa quando o `map` do usuário ainda está vazio.
- `will_import` usa exatamente o mesmo critério do `run`
  (`tem nome && tem telefone && (não é duplicata || dup_action = criar)`), para
  o relatório nunca prometer mais do que a importação grava. `sem_praca` conta,
  dessas, as que ficariam sem praça.
- `dup.by` ∈ `telefone | cnpj | nome+endereço`.
- Tetos: 5.000 linhas, 60 colunas, 500 caracteres por célula — **e o corpo
  inteiro precisa caber em 8 MB** (`bodyLimit` do Fastify em `main.ts`). Acima
  disso o Fastify corta antes do Nest: vem um `413` cru, sem
  `{error:{code,message}}`. Planilha grande demais → mandar em partes.
  `praca_mode` `lote` **exige** `lote_praca_id` (`400 VALIDATION_ERROR`), e a
  praça precisa existir (`404 NOT_FOUND`).

### Importar — `POST /run`

Mesmo corpo de `/evaluate` mais `file_name`, `owner_mode`, `lote_owner_id?` e
`rodizio_ids?`. Avalia **de novo** e aplica na mesma transação — a varredura da
duplicidade inclusive: a decisão nunca é tomada num retrato da base e gravada
em outro. Duas importações ao mesmo tempo, ou um `POST /v1/leads` no meio, não
criam o "mesmo" lead duas vezes.

```json
{ "batch_id": "uuid", "imported": 1, "updated": 0, "ignored": 2, "reasons": ["1 duplicadas (ignoradas)", "1 sem telefone"] }
```

- Lead criado: `stage 1`, `entered_at`/`stage_since` = hoje (Brasília),
  `import_batch_id` = `batch_id`, `decisor` = `"—"` quando o arquivo não traz,
  `origem` = a da linha ou a do lote, `possible_dup` quando é duplicata que
  entrou por `criar`. Ganha o evento
  `"Lead importado de <arquivo> · origem <origem>."`.
- Lead completado (`dup_action: completar`) ganha
  `"Campos vazios completados pela importação <arquivo>."`; só campos vazios
  são tocados (`decisor` conta como vazio quando é `"—"`), e `phone` completado
  atualiza a chave de comparação junto.
- `ignored` = linhas do arquivo que não viraram lead novo (inclui as
  completadas). `reasons` traz, nesta ordem: duplicadas (com o que foi feito
  com elas), sem telefone, sem nome, sem praça.

### Lotes — `GET /` e `POST /:id/undo`

```json
[{ "id": "uuid", "at": "2026-09-09T18:20:00.000Z", "file_name": "leads.csv", "by": "uuid", "origem": "importação", "imported": 12, "ignored": 3, "reasons": ["..."], "can_undo": true }]
```

Mais novo primeiro. `can_undo` = importado há menos de 24 h.

`POST /:id/undo` → `{ "removed": 1, "kept": 0 }`. Remove **só** o lead do lote
que ninguém tocou (etapa 1 e nenhum evento de contato) — lead já trabalhado
fica. O critério vai dentro do próprio `DELETE`, na mesma transação da
leitura: lead que recebe um contato durante o desfazer não some.

Desfazer **não exige admin**: é o botão da tela de Entrada, usado por quem
acabou de importar (vendedor, não administrador), e só alcança leads daquele
lote que ninguém tocou, dentro de 24 h. Diferente do `DELETE /v1/leads/:id`
(§9), que apaga um lead qualquer com histórico e por isso é ferramenta de
limpeza do admin. O lote continua na lista, com `imported` abatido e o motivo
`"N leads removidos por desfazer importação"` anexado. Depois de 24 h →
`400 UNDO_EXPIRED`; lote inexistente ou id malformado → `404 NOT_FOUND`.

### Mapeamentos salvos — `/mappings`

```json
[{ "id": "uuid", "name": "Planilha do Google Maps", "map": { "name": "Nome" }, "created_at": "2026-09-09T18:20:00.000Z" }]
```

| Método | Rota | Quem | Corpo | Observação |
|---|---|---|---|---|
| GET | `/` | autenticado | — | lotes, do mais novo para o mais velho |
| POST | `/evaluate` | autenticado | ver acima | não grava nada |
| POST | `/run` | autenticado | ver acima | avalia e grava, em transação |
| GET | `/mappings` | autenticado | — | mapeamentos salvos |
| POST | `/mappings` | autenticado | `{name, map}` | nome é único: salvar de novo **substitui** o mapa |
| DELETE | `/mappings/:id` | autenticado | — | `{ok: true}`; inexistente → `404 NOT_FOUND` |
| POST | `/:id/undo` | autenticado | — | `{removed, kept}` |

> A duplicidade carrega todos os leads não arquivados numa consulta só
> (`id, nome, endereço, cidade, telefone, CNPJ, instagram, decisor`) e compara
> em memória: telefone/CNPJ/nome+endereço normalizados não viram índice em SQL.
> Numa base de dezenas de milhares de leads é uma varredura barata; se um dia
> crescer para centenas de milhares, o caminho é pré-filtrar por `phone_key`.

---

<a id="11-formulario-publico"></a>

## 11. Formulário público — `/v1/public`

Porta pública do formulário de captura (`.prototype/src/routes/formulario.$pracaId.tsx`):
embutido em landing page/anúncio, sem login. As duas rotas são `@Public()`
(sem JWT). O throttle: o `POST` tem balde **próprio**, bem mais apertado —
**`PUBLIC_LEADS_PER_MINUTE` por minuto e por IP** (padrão 10, o valor de
produção; em desenvolvimento sobe para o smoke rodar duas vezes seguidas); o
`GET /pracas/:id` cai no balde global de 300/min por rota (§1). Estourar
responde `429 TOO_MANY_REQUESTS`.

> Sem `TRUST_PROXY=true` atrás de nginx, "por IP" vira "por proxy" e o teto de
> 10/min passa a valer para o mundo inteiro junto — ver §1 e o README.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/pracas/:id` | — | `{id, name, city}` |
| POST | `/leads` | ver abaixo | `{ok: true, duplicate?: true}` |

### `GET /pracas/:id`

Só o que a tela precisa mostrar antes de enviar o formulário — não vaza
`steps`, `cobertura` nem o resto do `PracaView` (§6). Praça inexistente ou
`:id` malformado → `404 NOT_FOUND` (mesmo `isUuid()` das rotas autenticadas).

### `POST /leads` — `@Throttle({default:{limit:10, ttl:60000}})`

Corpo:

```json
{
  "praca_id": "uuid",
  "name": "Bar do Mercado",
  "city": "Belo Horizonte",
  "phone": "(31) 98000-1000",
  "decisor": "Marcos Vieira",
  "freq": "5",
  "origem": "pago",
  "camp": "uuid"
}
```

- `praca_id`, `name`, `city`, `phone`, `origem` são obrigatórios; `decisor`,
  `freq` e `camp` são opcionais. `origem` só aceita `"pago"` ou `"organico"`
  (grava `"tráfego pago"` / `"orgânico"`, os mesmos rótulos do protótipo) —
  qualquer outro valor é `400 VALIDATION_ERROR`. `freq` só aceita
  `"0"|"2"|"5"|"10"` e vira `form_answer = "Fica sem gente <freq>x por mês"`;
  sem `freq`, `form_answer` fica `null`.
- `praca_id` que não existe → `404 NOT_FOUND` (`praca_id` malformado, por não
  ser UUID, → `400 VALIDATION_ERROR`, igual a qualquer outro `@IsUUID()` de
  corpo). `camp` **não** é validado como UUID: se vier e não for um UUID
  válido, ou não existir em `campanhas`, é **ignorado em silêncio**
  (`campanha_id` grava `null`) — o link de um anúncio não pode quebrar o
  formulário por causa do parâmetro de rastreio.
- Lead criado: `stage 1`, `classe "alvo"`, `decisor` vazio vira `"—"`,
  `entered_at`/`stage_since` = hoje (Brasília), dono = a primeira pessoa
  **ativa** por `sort, created_at` (rodízio simples — o mesmo critério do
  protótipo, `s.people[0]`). Evento `note` com `author_id: null`,
  `author_label: "Formulário"` e texto
  `"Lead entrou pelo formulário de captura."`.
- **Telefone duplicado**: mesma `phone_key` (últimos 9 dígitos, ver §10) já
  cadastrada, **não arquivada**, na **mesma praça** → não cria lead novo, só
  acrescenta ao lead existente o evento `note`
  `"Preencheu o formulário de novo."` (mesmo `author_label`) e a resposta
  vem `{"ok": true, "duplicate": true}` em vez de criar um segundo registro.
  Telefone vazio nunca casa como duplicata. Envios simultâneos do mesmo
  telefone são serializados no servidor; só um lead nasce.

---

<a id="12-mensagens"></a>

## 12. Mensagens — `/v1/msg-templates`, `/v1/settings`, `/v1/blocklist`

Modelos de mensagem (com A/B e medição), configurações de envio da operação e
lista de bloqueio. Porta de `.prototype/src/lib/praca/mensagens.ts`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/v1/msg-templates` | — | `TemplateView[]` |
| POST | `/v1/msg-templates` | `TemplateBody` | `TemplateView` |
| POST | `/v1/msg-templates/render` | `{text, lead_id?}` | `{text, missing}` |
| PUT | `/v1/msg-templates/:id` | `TemplateBody` | `TemplateView` |
| DELETE | `/v1/msg-templates/:id` | — | `{ok: true}`; `409 TEMPLATE_IN_USE` |
| GET | `/v1/settings` | — | `SettingsView` |
| PATCH | `/v1/settings` | campos opcionais | `SettingsView` |
| GET | `/v1/blocklist` | — | `BlockView[]` |
| POST | `/v1/blocklist` | `{phone, name?, reason?, lead_id?}` | `BlockView` |
| DELETE | `/v1/blocklist/:id` | — | `{ok: true}` |

Todas exigem JWT. `:id` malformado → `404 NOT_FOUND` (nunca 500).

`DELETE /v1/msg-templates/:id` recusa com **`409 TEMPLATE_IN_USE`** (a mensagem
diz quais cadências) quando algum `cadence_nodes.template_id` aponta para o
modelo. `cadence_nodes` **não** tem FK para `msg_templates` (o nó guarda o id
solto, por desenho — §14): sem a guarda, o nó ficava apontando para o nada e o
motor gravava `msg_sends` com texto **vazio** — mensagem em branco no modo
`fila`, `whatsappTemplate: ""` no modo `freela`. Silencioso nos dois casos, e as
5 cadências-modelo citam os 8 modelos semeados, então era o caminho normal.
Troque o passo (ou apague a cadência) antes de apagar o modelo.

### `TemplateView`

```json
{
  "id": "00000000-0000-4000-8000-00000000f001",
  "name": "Contratante · toque 1 (lead novo)",
  "audience": "contratante",
  "stage": 1,
  "channel": "whatsapp",
  "text_a": "Oi {{primeiro_nome_dono}}…",
  "text_b": "",
  "attachment": { "kind": "video", "name": "caso-40s.mp4", "url": null },
  "created_at": "2026-09-09T12:00:00.000Z",
  "metrics": {
    "sent": 0, "responded": 0, "resp_rate": 0,
    "advanced": 0, "adv_rate": 0,
    "a": { "sent": 0, "responded": 0, "rate": 0 },
    "b": { "sent": 0, "responded": 0, "rate": 0 },
    "winner": "—"
  }
}
```

- `text_b` é sempre **string**: sem variante B o wire manda `""`, nunca `null`.
- `attachment` é `null` quando não há anexo; `url` dentro dele pode ser `null`.
- Ordem da lista: `metrics.resp_rate` desc, depois `metrics.sent` desc; empate
  mantém a ordem de criação (é o caso com `msg_sends` vazio).

**`metrics`** (`mensagens.ts:184-224`) — só conta envio que saiu da fila
(`status != "fila"`):

- `sent` = envios do modelo; `responded` = `status == "respondida"`;
  `resp_rate = responded / sent`.
- `advanced` = envios em que o lead **subiu de etapa** em relação a
  `stage_at_send` e a mudança de etapa está a até 7 dias do envio
  (`diffDays(data do envio, lead.stage_since)` entre 0 e 7, mesma conta do
  protótipo). `adv_rate = advanced / sent`.
- `a`/`b` = a mesma quebra por variante. `winner` só sai de `"—"` com **3
  envios de cada lado** e taxas diferentes — amostra menor não elege nada.

### `TemplateBody` (POST e PUT)

```json
{
  "name": "Contratante · toque 1",
  "audience": "contratante",
  "stage": 1,
  "channel": "whatsapp",
  "text_a": "Oi {{primeiro_nome_dono}}",
  "text_b": "",
  "attachment": { "kind": "video", "name": "caso.mp4", "url": "https://…" }
}
```

- `audience ∈ contratante | freelancer`; `channel ∈ whatsapp | email | interno`;
  `stage` inteiro de 0 a 8 (0 = vale para qualquer etapa); `text_a` de 1 a 4000
  caracteres; `text_b` opcional, até 4000, `""` permitido.
- `attachment` opcional: `kind ∈ video | imagem | documento`, `name`
  obrigatório, `url` opcional. `null` ou ausente = sem anexo.
- **PUT substitui o modelo inteiro**: anexo que não vier no corpo é removido.
  Fora do catálogo, campo faltando ou campo desconhecido → `400
  VALIDATION_ERROR`.

### `POST /v1/msg-templates/render`

Prévia do texto antes de virar disparo. Corpo `{text, lead_id?}` (`text` até
4000; `lead_id` UUID opcional), resposta `{text, missing}`.

Substitui `{{variavel}}` pelas 16 variáveis do catálogo (§4). **Variável sem
valor não some**: fica visível como `⟨variavel⟩` — e entra em `missing`, junto
com qualquer `{{nome_inventado}}` que não exista no catálogo.

De onde vem cada valor:

| Variável | Origem |
|---|---|
| `nome` | `lead.decisor`, caindo para `lead.name` |
| `estabelecimento`, `cidade` | `lead.name`, `lead.city` |
| `primeiro_nome_dono` | primeiro nome de `lead.decisor` |
| `bairro` | último pedaço de `lead.address` depois da vírgula |
| `data_vaga` | primeira vaga do lead, ou hoje (Brasília) |
| `praca`, `data` | praça do lead — sem lead, a **praça ativa** de quem chamou |
| `meu_nome` | primeiro nome de quem está logado |
| `estabelecimento_vizinho` | outro lead não arquivado da mesma cidade, o primeiro por nome |
| `link_video_caso`, `link_cadastro`, `funcao`, `valor`, `dia_forte`, `turno` | `settings.template_defaults` |

`lead_id` que não existe → `404 NOT_FOUND`; `lead_id` que não é UUID → `400
VALIDATION_ERROR`.

### `SettingsView` e `PATCH /v1/settings`

```json
{
  "mode": "fila",
  "window_start": 9,
  "window_end": 19,
  "sunday": false,
  "daily_limit": 200,
  "gap_min": 20,
  "gap_max": 90,
  "daily_quota": 20,
  "template_defaults": {
    "link_video_caso": "https://freela.app/casos/bh",
    "link_cadastro": "https://freela.app/cadastro",
    "funcao": "garçom",
    "valor": "R$ 120",
    "dia_forte": "sábado",
    "turno": "18h às 00h"
  }
}
```

Uma linha só no banco (`app_settings`, id 1) — é ajuste da operação inteira,
não por pessoa nem por praça. A linha nasce na primeira leitura se o seed não
tiver rodado. Todos os campos do `PATCH` são opcionais.

- `mode ∈ fila | freela` (§4, `send_modes`).
- `window_start`/`window_end` são **horas de Brasília** e ficam **presas** em
  `hard_min..hard_max` (8–20): mandar `7` grava `8` e a resposta já mostra `8`
  — não é erro. Depois de presas, `window_end > window_start`, senão `400
  VALIDATION_ERROR`.
- `gap_min`/`gap_max` em **segundos**, mínimo 5, com `gap_max > gap_min`.
  `daily_limit` e `daily_quota` inteiros ≥ 1.
- `template_defaults` é **parcial**: manda só a chave que mudou, o resto fica.
  Aceita apenas as 6 chaves acima, valores de até 300 caracteres — qualquer
  outra chave é `400 VALIDATION_ERROR`. A resposta traz sempre as 6, com o
  padrão do catálogo no que não foi configurado; gravar `""` numa chave também
  cai no padrão do catálogo (variável-padrão vazia não faria o texto render).

O agendamento do lote (`nextSlot`/`scheduleTimes`, `src/domain/send-schedule.ts`)
lê essa janela **em horário de Brasília**, independente do fuso do processo:
sábado 21h BRT com `sunday: false` e janela 9–19 cai na segunda às 9h BRT.

### `BlockView` e lista de bloqueio

```json
{
  "id": "uuid",
  "phone": "(31) 98000-1000",
  "phone_key": "980001000",
  "name": "adicionado na mão",
  "lead_id": null,
  "at": "2026-09-09T12:00:00.000Z",
  "reason": "pedido manual"
}
```

- Lista ordenada por `at` desc.
- `POST` normaliza o telefone em `phone_key` (últimos 9 dígitos, §10): telefone
  sem dígito nenhum → `400 VALIDATION_ERROR`; chave já bloqueada → `409
  ALREADY_BLOCKED` (o mesmo número escrito de outro jeito é o mesmo bloqueio).
- `name` vazio vira `"adicionado na mão"`; `reason` vazio vira
  `"pedido manual"`. `lead_id` é opcional e guardado como veio.

<a id="13-disparos"></a>

## 13. Disparos — `/v1/disparos`, `/v1/sends`

Um disparo é **uma mensagem, para um grupo de pessoas, uma vez**: o filtro do
funil vira público, o modelo vira texto renderizado lead a lead e cada mensagem
vira uma linha em `msg_sends`. Porta de
`.prototype/src/components/praca/Disparos.tsx` e de `store.tsx:588-710`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/v1/disparos/preview` | `{filters, template_id\|text, split?, mode, scheduled_at?}` | `DisparoPreview` |
| POST | `/v1/disparos` | o mesmo, só com `template_id`, + `name?` | `{id, created, skipped_block, skipped_dup}` |
| GET | `/v1/disparos` | — | `DisparoView[]` (mais novo primeiro) |
| GET | `/v1/disparos/:id` | — | `{disparo, stats, by_hour, sends}` |
| DELETE | `/v1/disparos/:id` | — | `{ok: true}` — **só admin** |
| POST | `/v1/sends/:id/mark` | `{status}` | `SendView` |
| POST | `/v1/sends/:id/reply` | `{text}` | `{blocked}` |
| GET | `/v1/sends/count` | — | `{total}` — **só admin** |

Todas exigem JWT. `:id` malformado → `404 NOT_FOUND` (nunca 500). `DELETE` leva a
fila do lote por cascata (`msg_sends.disparo_id`), por isso é só de admin — o
caminho normal é deixar o histórico. `GET /v1/sends/count` não é tela: é a
contagem crua de `msg_sends` (todo modo/status), usada só pelo smoke para
fechar a conta de resíduo (§19) — como `msg_sends.lead_id` tem
`onDelete: Cascade`, some sozinha quando o lead ou o disparo de teste é
apagado.

### `DisparoFilters`

```json
{ "praca_id": "all", "stage": 0, "classe": "all", "origem": "all", "owner_id": "all", "min_stalled": 0 }
```

Todo campo é opcional e o padrão é "sem filtro" (`all` / `0`) — `filters: {}` é o
público inteiro. `praca_id`/`owner_id` aceitam `all` ou UUID (outra coisa é `400
VALIDATION_ERROR`); `stage` de 0 a 8 (0 = todas as etapas); `classe ∈ all |
grande | alvo | depois`; `origem` é texto livre até 60 (o lead grava origem fora
da lista curta do catálogo); `min_stalled` é inteiro ≥ 0.

**Público** = leads **não arquivados** e **não de teste** (`is_test`) que casam
com todos os filtros. `min_stalled` compara com `stalled_days` do funil (§9) —
regra pura (`stalledDays`, olha o último evento de contato), decidida no
servidor e não no SQL. A ordem do público é a da tela do funil (`stage`,
`entered_at`, `created_at`) e **é ela que decide quem recebe A e quem recebe B**:
prévia e fila usam o mesmo plano, então o que foi revisado é o que sai.

Quem sai do envio:

- **lista de bloqueio** — `phone_key` do lead (últimos 9 dígitos, §12) na
  `blocklist`;
- **trava de 30 dias** — já existe `msg_send` do **mesmo modelo** para o lead com
  `scheduled_at` nos últimos 30 dias, em **qualquer status** (inclusive `fila`):
  o que a trava evita é montar a mesma mensagem duas vezes.

Os dois números são contados de forma independente (o mesmo lead pode aparecer
nos dois), então `sendable + blocked + dupes` não fecha necessariamente com
`audience`.

### `POST /v1/disparos/preview`

```json
{
  "audience": 5, "sendable": 4, "blocked": 1, "dupes": 0,
  "first_at": "2026-09-10T12:00:00.000Z", "eta": "3 min",
  "previews": [{ "lead_id": "uuid", "name": "Bar do Mercado", "city": "Belo Horizonte", "variant": "A", "text": "Oi Marcos…" }],
  "freela": null
}
```

Não grava nada. `previews` traz as **5 primeiras** mensagens de verdade, com
`variant` alternando A/B por índice (ímpar = B) quando o disparo pede divisão e
o modelo tem `text_b` — sem variante B todo mundo recebe A, mesmo com
`split: true`.

O texto passa pelo mesmo render do §12, com uma diferença: `praca` é a praça **do
lead** (não a praça ativa de quem dispara), `me` é quem está logado,
`estabelecimento_vizinho` é outro lead da mesma cidade (o primeiro por nome que
não seja ele) e `data_vaga` é a primeira vaga do lead. Variável sem valor
continua visível como `⟨variavel⟩`.

`first_at`/`eta` (`src/domain/send-schedule.ts`):

- modo `fila` — `scheduleTimes` sorteia o intervalo de cada mensagem dentro da
  janela de `GET /v1/settings` (horário de Brasília, limite diário, domingo);
  `eta` é o texto do lote (`3 min`, `4,2 h`, `2 dias úteis`).
- modo `freela` — todos saem no mesmo instante (a campanha do Freela tem ritmo
  próprio): `eta` é `"imediato"` sem hora marcada, ou a espera até a hora
  marcada.

`freela` é `null` no modo `fila` e, no modo `freela`, traz o modelo já
convertido para o formato de campanha do Freela (§18.3):
`{template, unsupported_variables}`. Modelo inexistente → `404 NOT_FOUND`.

**`template_id` ou `text` — exatamente um dos dois** (os dois juntos, ou nenhum,
é `400 VALIDATION_ERROR`). `text` (1 a 4000, aparado) é o texto escrito na mão da
caixa de campanha do Freela (§18.2, "escrever aqui"): existe para ela poder
contar o público **sem** um modelo salvo. Com `text`:

- as **variantes** vêm de uma linha só com `---` (espaços em volta valem, `---`
  no meio da frase não separa nada). A 1ª vira a variante A e a 2ª a B nas
  mensagens de exemplo de `previews`, como num modelo salvo; a conversão para o
  Freela (`freela.template`) leva **todas** — é ela que sobe;
- **não há trava de 30 dias**: a trava é por modelo (`msg_sends.template_id`) e
  aqui não há modelo. `dupes` é sempre `0`; a lista de bloqueio continua valendo;
- no modo `freela` a conversão é a MESMA de `POST /v1/freela/campaigns` com
  `whatsapp_template` (§18.3) — o que a prévia mostra é o que a campanha manda;
- `POST /v1/disparos` **não** aceita `text` (`400 VALIDATION_ERROR`): o envio
  guarda `template_id`, e é dele que sai a trava de 30 dias.

### `POST /v1/disparos`

`scheduled_at` (na prévia e na criação) é **instante ISO 8601 com fuso** (`Z` ou
`±HH:MM`, ex.: `2026-09-14T12:00:00Z`). Hora "solta" do `datetime-local`
(`2026-09-14T12:00`) é `400 VALIDATION_ERROR`: o processo da API roda em UTC e
gravar 12:00 sem fuso adiantaria o lote em três horas. Quem converte é o web,
que sabe o fuso de quem está olhando.

Mesmo corpo da prévia, mais `name?` (até 160). Cria a linha de `disparos` e a
fila de `msg_sends` na **mesma transação**, com `status: "fila"`, o `mode` do
disparo, a `variant` e o **texto já renderizado** — mudar o modelo depois não
reescreve o que está na fila. `stage_at_send` guarda a etapa do lead na hora
(é o que mede "avançou de etapa"), `channel` vem do modelo e `scheduled_at` de
cada mensagem vem do agendamento acima.

- `name` vazio → `"<modelo> · dd/mm/aaaa"` (data de Brasília).
- `split` gravado é `split && text_b` — pedir divisão num modelo sem variante B
  grava `false`.
- `sendable == 0` → `400 NO_RECIPIENTS`.
- `mode: "freela"` sem conexão com o Freela → `503 FREELA_NOT_CONFIGURED`
  (`FreelaClient.isConfigured()`, §18.1). **Com** conexão, o lote nasce igual —
  `msg_sends` em `fila` com a hora marcada — e quem entrega é o outbox (§18.5):
  o `freela_campaign_id` só aparece depois que a campanha existe lá.
- A criação é **serializada por modelo** (`pg_advisory_xact_lock` em
  `'disparo:' || template_id`) e relê a trava de 30 dias **dentro** da
  transação: dois cliques em "Confirmar" (ou duas abas) não montam a fila duas
  vezes — o segundo vê os envios do primeiro, pula esses leads (`skipped_dup`) e,
  se não sobrar ninguém, responde `400 NO_RECIPIENTS` sem gravar nada.

### `DisparoView`

```json
{
  "id": "uuid", "name": "Contratante · toque 1 (lead novo) · 09/09/2026",
  "at": "2026-09-09T12:00:00.000Z", "scheduled_at": "2026-09-10T12:00:00.000Z",
  "mode": "fila", "template_id": "uuid", "template_name": "Contratante · toque 1 (lead novo)",
  "split": true, "channel": "whatsapp", "by": "uuid",
  "filters": { "praca_id": "all", "stage": 1, "classe": "all", "origem": "all", "owner_id": "all", "min_stalled": 0 },
  "skipped_block": 1, "skipped_dup": 0, "status": "agendado", "freela_campaign_id": null,
  "counts": { "total": 4, "queued": 3, "sent": 1 }
}
```

- `scheduled_at` do disparo é o horário da **primeira** mensagem.
- `status ∈ agendado | concluido`: fecha em `concluido` quando **nenhum envio do
  lote está em `fila`** (vale para `mark` e para `reply`).
- `counts.sent` é tudo que saiu da fila (`status != "fila"`).
- Modelo apagado depois do disparo: `template_name` vira `"—"` e o histórico do
  lote continua.
- `filters` é o Json gravado na criação, sempre com as 6 chaves.

### `GET /v1/disparos/:id`

```json
{
  "disparo": { "…": "DisparoView" },
  "stats": { "queued": 3, "sent": 1, "delivered": 1, "replied": 1, "advanced": 0, "blocked_after": 1 },
  "by_hour": [0, 0, "…24 posições"],
  "sends": [{
    "id": "uuid",
    "lead": { "id": "uuid", "name": "Bar do Mercado", "city": "Belo Horizonte", "phone": "(31) 98000-1000" },
    "variant": "A", "text": "Oi Marcos…", "status": "fila",
    "scheduled_at": "2026-09-10T12:00:00.000Z", "sent_at": null, "replied_at": null,
    "failure_reason": null, "stage_at_send": 1
  }]
}
```

- `delivered` conta `entregue` **e** `respondida` (se o lead respondeu, chegou);
  `replied` conta `respondida`.
- `advanced` = envios em que o lead **está hoje** numa etapa maior que
  `stage_at_send`.
- `blocked_after` = quantos leads deste lote estão na lista de bloqueio hoje — é
  o preço que o lote cobrou.
- `by_hour` são as respostas por **hora de Brasília** de `replied_at`, 24
  posições (o gráfico do painel).
- `sends` sai ordenado por `scheduled_at` (`id` desempata) e traz o telefone
  porque é ele que monta o link da conversa. O painel do protótipo mostra os 60
  primeiros.

### `POST /v1/sends/:id/mark` e `POST /v1/sends/:id/reply`

Fila manual: a tela copia o texto, abre a conversa e volta para dizer o que
aconteceu. Rota por **envio** (não por disparo) porque envio também nasce de
cadência.

`mark` — `{status}` com `status ∈ enviada | entregue` (`falhou` é do motor, não
da tela). Envio em modo `freela` → `409 FREELA_SEND` ("Envio do modo Freela:
quem marca é o Freela."): lá a fila não é do Praça — o outbox garimpa
exatamente `mode: 'freela'` + `status: 'fila'` (§18.5) e a sincronização escreve
`enviada`/`entregue` de lá para cá, então marcar à mão tiraria o envio da
garimpagem e ele nunca chegaria à campanha. `reply` continua liberado nos dois
modos (a resposta chega pelo WhatsApp de quem operou, não pelo Freela). Envio já
`respondida` → `400 ALREADY_REPLIED` ("Este envio já foi
respondido."): voltar atrás apagaria a resposta do painel e gravaria um segundo
evento de saída. Grava `sent_at` se ainda estiver vazio e **não reescreve** o que
já existe. `enviada` é o toque de verdade: grava evento `msg_out` na timeline do
lead — `"<modelo> (variação A) enviada por WhatsApp."` (rótulo do canal, §4) — e
atualiza `last_contact_at`, o que zera os dias parados do funil. `entregue` só
confirma a entrega, sem evento novo. Responde o `SendView` atualizado.

`reply` — `{text}` (1 a 2000). Marca `respondida`, grava `replied_at`
(e `sent_at` se estiver vazio), grava evento `msg_in` com o texto e atualiza
`last_contact_at`. Resposta que pede para parar entra na
`blocklist` na hora, com `name` do lead, `lead_id` e motivo
`pediu para não receber: “<texto>”` — número já bloqueado não vira erro. Responde
`{blocked}` (`true` = o texto é um pedido de opt-out).

As palavras de opt-out (`sair`, `pare`, `remove`…) vivem **só no servidor**
(`src/domain/catalog/messages.ts`, `OPTOUT_WORDS`) e **não** são devolvidas por
`GET /v1/catalog`: publicá-las ensinaria a burlar a lista. A comparação casa a
palavra inteira **ou** contida no texto ("me remove por favor" sai), igual ao
protótipo.

`reply` apara o texto antes de validar: corpo só com espaço é `400
VALIDATION_ERROR`.

As duas rotas gravam **tudo num commit** — envio, evento do lead,
`last_contact_at`, bloqueio do opt-out e o fechamento do disparo em `concluido`.
Nada de "pediu para parar" registrado sem o número bloqueado, nem lote com a fila
zerada preso em `agendado`.

Envio inexistente → `404 NOT_FOUND`.

---

<a id="14-cadencias"></a>

## 14. Cadências — `/v1/cadences`, `/v1/enrollments`

Uma cadência é **uma trilha de toques, para uma pessoa por vez, no tempo**: o
lead entra (na mão ou pela regra de entrada), o relógio do servidor caminha pelos
nós da trilha e a pessoa sai quando responde, quando a condição manda ou quando a
trilha acaba. Porta de `.prototype/src/components/praca/Cadencias.tsx`,
`lib/praca/cadencias.ts` e `lib/praca/cadencias-engine.ts`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/v1/cadences` | — | `CadenceView[]` (ordem de criação) |
| POST | `/v1/cadences` | `CadenceBody` | `CadenceView` |
| POST | `/v1/cadences/restore-seed` | — | `{created}` |
| GET | `/v1/cadences/:id` | — | `CadenceView` |
| GET | `/v1/cadences/:id/stats` | — | `CadenceStats` |
| PUT | `/v1/cadences/:id` | `CadenceBody` | `CadenceView` |
| DELETE | `/v1/cadences/:id` | — | `{ok: true}` |
| POST | `/v1/cadences/:id/toggle-pause` | — | `CadenceView` |
| POST | `/v1/cadences/:id/enroll` | `{lead_id}` | `{ok, waiting}` |
| POST | `/v1/cadences/:id/test` | `{phone}` | `{enrollment_id, lead_id}` |
| GET | `/v1/enrollments` | `?cadence_id` | `EnrollmentView[]` (200 mais recentes) |
| POST | `/v1/enrollments/:id/exit` | `{reason?}` | `EnrollmentView` |

Todas exigem JWT. `:id` malformado → `404 NOT_FOUND` (nunca 500);
`?cadence_id` malformado → `400 VALIDATION_ERROR` (é filtro, não caminho).
`DELETE` leva as inscrições e os logs por cascata — o que já foi enviado
(`msg_sends`) fica, é histórico do lead. Não é só de admin: no protótipo quem
monta a cadência apaga a cadência.

### `CadenceView`

```json
{
  "id": "uuid", "name": "Prospecção de contratante — 3 toques",
  "audience": "contratante", "entry": "stage_novo",
  "exit": { "action": "reaquecer_30", "note": "Quem chegou ao fim sem responder…" },
  "paused": true, "created_at": "2026-09-09T12:00:00.000Z",
  "nodes": [
    { "id": "uuid", "sort": 0, "kind": "msg", "day": 0, "channel": "whatsapp",
      "template_id": "uuid", "text": null, "task": null, "rule": null, "action": null, "note": null }
  ]
}
```

`audience ∈ catalog.audiences` (§12), `entry ∈ catalog.entry_rules`,
`exit.action ∈ catalog.cond_actions` **menos `continua`** (o fim da trilha tem de
sair de algum jeito), `exit.note` até 400.

`paused` (booleano, opcional) faz parte do `CadenceBody` e tem tratamento
próprio, porque é a trava contra "matricular a base inteira":

| | `paused` ausente | `paused` no corpo |
|---|---|---|
| `POST` | nasce **pausada** (`true`) | vale o que veio |
| `PUT` | **mantém** o valor atual | vale o que veio |

Cadência não nasce rodando de propósito: com entrada automática
(`stage_novo`/`reheat_due`/`first_vaga`) o relógio de 15 s matricularia até 30
leads por rodada e começaria a gravar mensagens — em modo `fila` isso queima a
contabilidade (marca `enviada`, grava evento, mexe em `last_contact_at`, consome
a trava de 30 dias); em modo `freela` são WhatsApp de verdade saindo. E o `PUT`
mantendo o valor atual é o que impede que **editar o texto de um passo** de uma
das 5 cadências-modelo (3 têm entrada automática, todas nascem pausadas)
despause a trilha em silêncio. Quem liga e desliga na tela é
`POST /v1/cadences/:id/toggle-pause`.

Nós (`nodes`, até 40, na ordem recebida — o `sort` é o índice):

- `kind: "msg"` — precisa de `template_id` **ou** `text` (até 2000, aparado);
  mandar os dois grava só o `template_id` (o texto seria um segundo texto
  possível para a mesma mensagem). `channel ∈ catalog.channels`, padrão
  `whatsapp`. `template_id` que não existe → `404 NOT_FOUND`.
- `kind: "task"` — precisa de `task` (até 300). Não é mensagem: vira nota e
  próximo passo na ficha do lead.
- `kind: "cond"` — precisa de `rule ∈ catalog.cond_rules` e
  `action ∈ catalog.cond_actions`. `day` é sempre gravado como `0`: a condição
  roda junto do passo seguinte, não tem dia próprio.
- `note` (opcional, até 400) vale para qualquer tipo de nó: é a anotação de quem
  montou a trilha ("aqui é só se o dono não respondeu"), não vai para o lead.

Combinação errada (mensagem sem texto nem modelo, tarefa sem `task`, condição sem
`rule`) → `400 VALIDATION_ERROR` com o índice do nó (`nodes[2]: …`).

### `PUT /v1/cadences/:id`

Mesmo corpo do `POST` (com a diferença do `paused` acima) e substitui a cadência
inteira, com uma regra que importa:
**nó que volta com o `id` que já tinha é atualizado no lugar**; nó sem `id` (ou
com id de outra cadência) é criado; nó que não veio no corpo é apagado. É o que
mantém `enrollment_logs.node_id` válido — recriar todos os nós faria quem está no
passo 3 voltar para o passo 1 e receber a trilha de novo.

### `POST /v1/cadences/:id/enroll`

`{ok: true, waiting: false}` = entrou e já está rodando. `{ok: true, waiting:
true}` = entrou, mas fica `aguardando` porque a pessoa já roda outra cadência
(**uma cadência por pessoa de cada vez**); o relógio a solta quando a outra
terminar. `{ok: false, waiting: false}` = a pessoa já está nesta cadência (ativa
ou esperando) ou a cadência não tem passo nenhum. Lead ou cadência inexistente →
`404 NOT_FOUND`. Entrada manual **não** olha `paused`: a cadência pausada aceita
gente, só não anda.

### `POST /v1/cadences/:id/test` — "Testar comigo"

Põe **o seu número** na trilha com o tempo comprimido: cada dia da cadência vira
**5 segundos**, então dá para ver os toques chegarem na tela. Cria (ou
reaproveita) um lead único chamado `Teste — Cadência` com `is_test: true`, na
praça ativa de quem chamou, etapa 1, `classe: "alvo"`, `origem: "manual"`; em
reaproveitamento só o telefone e a praça são atualizados. As inscrições de teste
que estavam rodando (qualquer cadência) saem com `saiu`/`manual` — duas trilhas
comprimidas no mesmo número viram bagunça. A inscrição nasce `ativo` com
`next_at = started_at` (vence agora) e `is_test`.

Lead de teste é ignorado por disparo, público e prova social (§13), e a inscrição
de teste ignora **lista de bloqueio** e **limite diário** — é o seu próprio
número. Cadência sem passo nenhum → `400 NO_STEPS`.

### `EnrollmentView`

```json
{
  "id": "uuid", "cadence_id": "uuid", "lead_id": "uuid",
  "started_at": "2026-09-09T12:00:00.000Z", "next_at": "2026-09-11T12:00:00.000Z",
  "status": "ativo", "exit_reason": null, "stage_at_start": 1, "is_test": false,
  "logs": [{ "node_id": "uuid", "at": "2026-09-09T12:00:00.000Z", "send_id": "uuid", "kind": "msg" }]
}
```

`status ∈ ativo | aguardando | saiu | concluido`. `exit_reason` é, no caminho
normal, um motivo de `catalog.exit_reason_labels` (`respondeu`, `abriu_vaga`,
`reaquecer_30`, `reaquecer_60`, `fila_confirmacao`, `fecha_conta`, `fim`,
`bloqueio`, `manual`, `arquivado`); a saída disparada por uma **condição** grava o motivo da
regra (`abriu_vaga`) ou, nas outras regras, o **id da ação** (`sai`,
`reaquecer_30`…) — é o que o protótipo faz, e a tela cai no id quando não há
rótulo. `POST /v1/enrollments/:id/exit` só aceita os motivos do catálogo.
`logs` é o rastro do que já foi cumprido, um por nó (`kind ∈ msg |
task | cond`; `send_id` só na mensagem). `next_at` é quando o próximo nó vence.

`POST /v1/enrollments/:id/exit` marca `saiu` com `exit_reason = reason ?? manual`
— tirada na mão, sem os efeitos das saídas do motor (não mexe em etapa,
reaquecimento nem próximo passo). Inscrição já encerrada (`saiu`/`concluido`) →
`400 ALREADY_EXITED`: reescrever o motivo apagaria por que a pessoa saiu de
verdade e o painel passaria a contar "retirada manual" no lugar.

### `GET /v1/cadences/:id/stats`

```json
{
  "entered": 12, "active": 3,
  "per_step": [{ "node": { "id": "uuid", "kind": "msg", "day": 0, "…": "…" },
                 "here": 1, "reached": 12, "replied": 4, "resp_rate": 0.3333 }],
  "exits": [{ "reason": "respondeu", "count": 5 }],
  "advanced": 6,
  "inside": [{ "enrollment_id": "uuid", "lead_id": "uuid", "lead_name": "Bar do Mercado",
               "status": "ativo", "step_index": 1, "next_at": "2026-09-11T12:00:00.000Z" }]
}
```

`per_step` só tem **passos** (`msg`/`task`; condição não é passo): `reached` = já
cumpriram o nó, `here` = estão ativos esperando exatamente este passo, `replied` =
responderam **depois** deste nó, `resp_rate` = `replied/reached` (fração 0..1, como
em §12). `exits` conta os motivos (maior primeiro), `advanced` = a etapa do lead
subiu em relação a `stage_at_start`, `inside` = quem está `ativo` ou `aguardando`
(**20 primeiros**, como no protótipo).

### O relógio (motor) — `CADENCE_ENGINE_ENABLED`

`@Cron('*/15 * * * * *')` com trava de reentrância; `CADENCE_ENGINE_ENABLED`
(padrão `true`) desliga tudo sem mexer no código. Erro nunca sai do cron: cada
rodada registra a falha e segue. Cada inscrição avança na **sua própria
transação** — envio, evento, log e `next_at` num commit só, e o tombo de uma não
para as outras.

Três fases por rodada, na ordem do protótipo:

1. **Entrada automática** — só cadências **não pausadas** com
   `entry` automática (constante do servidor `AUTO_ENTRIES`, não exposta no
   catálogo): (`stage_novo` = etapa 1, `reheat_due` =
   `reheat_at <= hoje`, `first_vaga` = etapa 6). As outras regras
   (`praca_mapeamento`, `freela_first_turn`, `manual`) entram só pelo `enroll`.
   Fora: arquivado, `is_test` e quem **já teve** inscrição naquela cadência (em
   qualquer estado — senão quem saiu voltaria na rodada seguinte, para sempre).
   Teto de 30 por rodada e por cadência (`MAX_ENROLL_PER_TICK`, também constante
   do servidor), mais antigos primeiro, em ordem fixa de cadência (`created_at`).
   Quem já roda outra cadência entra `aguardando`. Cada matrícula é serializada
   por pessoa (`pg_advisory_xact_lock`), como a da tela.
2. **Avanço** de quem está `ativo` com `next_at <= agora` (cadência pausada não
   anda). Caminha pelos nós enquanto vencerem:
   - trilha acabou → sai com a ação de `exit` e motivo `fim`;
   - **lead arquivado** → sai como `saiu`/`arquivado` com a nota
     `Saiu da cadência “X” (lead arquivado).`, antes de qualquer nó: quem foi
     tirado da base não recebe mais toque (o protótipo continuava mandando);
   - **respondeu depois de entrar** (`lead_events.kind = msg_in` com
     `at >= started_at`) → sai como `sai_conversa`/`respondeu`, sempre, antes de
     qualquer nó;
   - `cond` → vai para o log e é avaliada (`respondeu`, `abriu_vaga` = vaga com
     `date >= dia da entrada` ou etapa ≥ 6, `sem_resposta`); batendo, aplica a
     ação (menos `continua`, que segue a trilha);
   - nó que ainda não venceu (`started_at + day`, ou `day × 5 s` no teste) →
     grava `next_at` e para;
   - `task` → nota `Tarefa da cadência “X”: <task>` na timeline e próximo passo
     do lead (`what` = a tarefa, `date` = hoje);
   - `msg` → telefone na lista de bloqueio sai como `sai`/`bloqueio`; limite
     diário estourado (mensagens com `sent_at` **hoje em Brasília**, qualquer
     modo, ≥ `settings.daily_limit`) adia `next_at` para o próximo slot 12 h à
     frente; senão grava `msg_sends` com `cadence_id`/`node_id`/`enrollment_id` e
     o texto **já renderizado** (mesmo render do §12: praça e vaga do lead,
     vizinho da mesma cidade, valores-padrão; sem `me` — quem manda é o relógio).
3. **Fila de espera** — quem está `aguardando` e ficou livre volta a `ativo` com
   `started_at` de agora (a trilha de 9 dias conta de quando ela começou de
   verdade, não de quando entrou na fila).

Os dois modos de envio (`app_settings.mode`, §12):

- `fila` — a mensagem já nasce `enviada` com `sent_at` (`scheduled_at` =
  próximo slot da janela, ou agora no teste), grava evento `msg_out`
  `Cadência “X” · dia N: <texto>` na timeline e atualiza `last_contact_at` (zera
  os dias parados). É o protótipo: a fila é o operador.
- `freela` — a mensagem fica `fila`, `scheduled_at` agora, `sent_at: null` e
  **sem evento**: quem entrega é a campanha do Freela (Task 15) e é o retorno
  dela que escreve o evento. Mensagem sem `sent_at` não conta no limite diário —
  o ritmo é o da campanha.

As saídas deixam rastro diferente na ficha do lead (`author_label: "Cadência"`,
sem autor humano):

| Ação | Evento | Efeito no lead |
|---|---|---|
| `sai_conversa` | `Saiu da cadência “X” (respondeu) → etapa Conversa aberta.` | etapa 3 e `stage_since` hoje **só se a etapa atual for menor que 3** (a etapa só sobe; quem já passou fica onde está e o evento vai sem `stage_to`) |
| `reaquecer_30` / `reaquecer_60` | `Saiu da cadência “X” → fila de reaquecimento em N dias.` | `reheat_at` = hoje + N |
| `fila_confirmacao` | `Saiu da cadência “X” → fila de ligação de confirmação.` | próximo passo `Ligar para confirmar presença` hoje |
| `fecha_conta` | `Cadência “X” encerrada — conta fechada e resultado registrado.` | — |
| `sai` (e qualquer outra) | `Saiu da cadência “X”.` | — |
| *(lead arquivado)* | `Saiu da cadência “X” (lead arquivado).` | — |

`fim` e `fecha_conta` fecham a inscrição como `concluido`; o resto é `saiu`.

> **A API roda em UMA instância.** O avanço relê a inscrição dentro da
> transação, mas **sem** `FOR UPDATE`, e a transação tem teto explícito
> (`timeout: 30 s`) para a trilha longa não morrer com `P2028`. Com duas
> réplicas, os dois relógios de 15 s pegariam a mesma inscrição e ela avançaria
> duas vezes (o lead receberia o passo duas vezes). Mesma premissa do §18.5/§18.6
> — ver README, "Produção".

### Seed e `restore-seed`

O seed planta as **5 cadências-modelo** do protótipo (nomes, trilhas e textos
iguais), idempotente **por nome** — id é gerado, então renomear, editar e apagar
é livre e rodar o seed de novo não desfaz nada.

`POST /v1/cadences/restore-seed` recria só as que faltam (também por nome) e
responde `{created}` — é o "restaurar as 5 cadências prontas" da tela.

**Uma diferença deliberada em relação ao protótipo:** elas nascem
**`paused: true`**. No protótipo o relógio rodava na aba aberta de uma demo com
25 leads; aqui é um `@Cron` no servidor sobre a base de verdade, e ligadas a
primeira rodada matricularia todo lead na etapa 1 e todo lead que rodou a
primeira vaga, marcando mensagem como enviada na ficha de gente real sem ninguém
ter pedido. Ligar cada uma é ato de gente (o botão play da tela).

---

<a id="15-midia"></a>

## 15. Mídia — `/v1/campanhas`, `/v1/creatives`, `/v1/traffic`, `/v1/proofs`

Mídia é o **último passo do playbook, não o primeiro**: campanha existe para
multiplicar uma praça que já funciona. Por isso tudo aqui é atravessado por dois
freios — o **portão** das etapas 2 e 6 e o **tempo de preenchimento** da vaga.
Porta de `.prototype/src/lib/praca/campanhas.ts` e dos componentes
`CampEstrategia.tsx`, `CampCriativos.tsx`, `CampTrafego.tsx`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/v1/proofs` | `?praca_id` (obrigatório) | `ProofView[]` |
| POST | `/v1/proofs` | `{praca_id, kind, title}` | `ProofView` |
| GET | `/v1/campanhas` | `?praca_id` (opcional) | `CampanhaView[]` (ordem de criação) |
| POST | `/v1/campanhas` | `CampanhaBody` | `CampanhaView` |
| POST | `/v1/campanhas/suggest-name` | `{praca_id, publico, objetivo, start}` | `{name}` |
| GET | `/v1/campanhas/fill-hours` | `?praca_id` (obrigatório) | `FillBrakeView` |
| GET | `/v1/campanhas/:id` | — | `CampanhaView` (a mesma da lista) |
| PUT | `/v1/campanhas/:id` | `CampanhaBody` | `CampanhaView`; `409 CAMPANHA_HAS_CHILDREN` |
| DELETE | `/v1/campanhas/:id` | — | `{ok: true}` |
| POST | `/v1/campanhas/:id/duplicate` | `{praca_id}` | `CampanhaView` (a cópia) |
| POST | `/v1/campanhas/:id/status` | `{status, justification?}` | `CampanhaView` |
| GET | `/v1/creatives` | `?campanha_id` (obrigatório) | `CreativeView[]` (por prazo) |
| POST | `/v1/creatives` | `CreativeBody` | `CreativeView` |
| PUT | `/v1/creatives/:id` | `CreativeBody` | `CreativeView` |
| DELETE | `/v1/creatives/:id` | — | `{ok: true}` |
| POST | `/v1/creatives/:id/status` | `{status}` | `CreativeView` |
| POST | `/v1/creatives/:id/publish-date` | `{date}` | `CreativeView` |
| POST | `/v1/creatives/:id/review` | `{kind, text?}` | `CreativeView` |
| GET | `/v1/traffic` | `?campanha_id` (obrigatório) | `TrafficEntryView[]` |
| POST | `/v1/traffic` | `TrafficBody` | `TrafficEntryView` |
| PUT | `/v1/traffic/:id` | `TrafficBody` | `TrafficEntryView`; `409 CAMPANHA_HAS_CHILDREN` |
| DELETE | `/v1/traffic/:id` | — | `{ok: true}` |
| PUT | `/v1/traffic/:id/days` | `{date, investido, alcance, cliques, conversoes, auto?}` | `TrafficDayView` |
| POST | `/v1/traffic/:id/pull-api` | — | `TrafficDayView` (o dia de hoje) |

Todas exigem JWT e nenhuma é só de admin (quem monta a campanha é a agência).
`:id` malformado → `404 NOT_FOUND` (nunca 500); `?praca_id`/`?campanha_id`
malformado ou ausente onde é obrigatório → `400 VALIDATION_ERROR` (é filtro, não
caminho). Conjuntos fechados vêm do catálogo de mídia (`src/domain/catalog/midia.ts`).

`?praca_id` de praça **inexistente** é `404 NOT_FOUND` em
`GET /v1/proofs` e `GET /v1/campanhas`, como em todo o resto da API (o
`fill-hours`, que recebe o mesmo DTO, já era): lista vazia esconderia o id
errado. `GET /v1/campanhas` **sem** `praca_id` continua listando todas.

**Nem a campanha nem a entrada de tráfego trocam de pai pelo `PUT`:**

- `PUT /v1/campanhas/:id` com outro `praca_id` → `409 CAMPANHA_HAS_CHILDREN`
  quando a campanha já tem criativo ou entrada de tráfego. As provas são
  revalidadas, mas `creatives` e `traffic_entries` (verba, gerenciador, dias já
  investidos) iriam junto: o portão e o `fill-hours` passariam a ser avaliados
  contra a praça de destino com o gasto da origem. É o vazamento que o
  `/duplicate` evita de propósito ("Tráfego NÃO vai"). Campanha ainda **sem**
  filho pode trocar: não há o que vazar.
- `PUT /v1/traffic/:id` com outro `campanha_id` → `409 CAMPANHA_HAS_CHILDREN`
  sempre: os dias já lançados são daquela campanha. Quem errou apaga a entrada e
  cria na outra. (Simétrico ao `PUT /v1/creatives/:id`, que recusa a troca de
  `campanha_id` com `400 VALIDATION_ERROR` — ali a entrada de tráfego guarda o
  id do criativo num array sem FK.)

Para mover campanha de praça de verdade existe `POST /v1/campanhas/:id/duplicate`.

Campo opcional deste bloco aceita ser **omitido**, não aceita vir `null`
explícito: `null` em `status`, `justification`, `file_url`, `text`,
`manager_url`, `api_connected` ou `auto` é `400 VALIDATION_ERROR` (a coluna é
`NOT NULL`; deixar passar viraria 500). Os três campos que o banco aceita nulo
de verdade — `owner_id`, `publish_at` e `ia` — aceitam `null` normalmente.

### `ProofView`

```json
{ "id": "uuid", "praca_id": "uuid", "kind": "video_dono", "title": "Bar do Mercado — sábado sem falta" }
```

`kind ∈ video_dono | video_freela | caso`, `title` até 200. A prova é da **praça**,
não da campanha: a mesma prova entra em quantas campanhas quiser, e prova de
outra praça na campanha → `400 VALIDATION_ERROR`.

### `CampanhaView`

```json
{
  "id": "uuid", "name": "BH-Contratante-Cadastro-Set26", "praca_id": "uuid",
  "publico": "contratante", "objetivo": "cadastro_contratante",
  "start": "2026-09-09", "end": "2026-10-09", "verba": 6000, "gasto": 0,
  "dor": "Dono de bar perde o sábado quando falta gente no turno.",
  "oferta": "Primeira contratação sem taxa.",
  "mensagem_chave": "Faltou gente? A vaga é preenchida no mesmo dia…",
  "provas": ["uuid"], "destino": "formulario",
  "kpi_name": "Cadastros de contratante", "kpi_meta": 30, "kpi_custo": 130,
  "cac_teto": 130, "status": "ativa",
  "gate_justification": { "by": "Diego", "at": "2026-09-09T12:00:00.000Z", "text": "…" },
  "created_at": "2026-09-09T12:00:00.000Z",
  "metrics": { "investido": 720, "alcance": 64800, "cliques": 1188, "conversoes": 5,
               "cpc": 144, "leads": 0, "cadastros": 0, "ativos": 0,
               "cp_cadastro": 0, "cp_ativo": 0, "acima_teto": false },
  "gate": { "ok": false, "falta": ["Etapa 2 — 40 garçons confirmados (hoje: 22)"] }
}
```

`CampanhaBody` = `{praca_id, publico ∈ contratante|freelancer,
objetivo ∈ catalog.objetivos, start, end, verba, gasto, dor (1..400),
oferta (≤400), mensagem_chave (1..400), provas: uuid[], destino ∈ catalog.destinos,
kpi_name (≤120), kpi_meta, kpi_custo, cac_teto, status?, justification?}`. Todos
obrigatórios no `POST` e no `PUT`, menos `status` e `justification`.

`status` **omitido** = `rascunho` no `POST` e **o status que a campanha já tem**
no `PUT`: o briefing é uma tela de texto e não pode rebaixar campanha ativa a
rascunho por omissão.

**`name` não entra no corpo** — quem monta é o servidor (`campanhaName`), a partir
da sigla da cidade da praça, do público, do objetivo e do mês do `start`
(`BH-Contratante-Cadastro-Set26`, o mesmo nome usado no Meta e no Google). Mandar
`name` → `400 VALIDATION_ERROR` (whitelist). `POST /v1/campanhas/suggest-name`
devolve o nome antes de salvar, para a tela mostrar enquanto se escolhe.

`metrics` (`campMetrics`): `investido` é a soma dos dias lançados no tráfego e só
cai no `gasto` declarado quando **nenhum** dia foi lançado; `cpc` é custo por
**conversão**; `leads` são os leads com `campanha_id` desta campanha, `cadastros`
os que estão na etapa ≥ 5 e `ativos` os que estão exatamente na 7; `acima_teto` é
`cp_ativo > cac_teto` **e** `ativos > 0` — sem ativo não há alerta, dividir por
zero não é notícia.

### O portão (freio de mídia)

`gate` (`gatesOk`) lê as etapas do playbook da praça: a **2** (40 garçons
confirmados) e a **6** (5 clientes com segunda vaga). Etapa liberada na mão
(`unlocked_at` da etapa 3 / 7) dispensa o número, como na tela de etapas (§6).

Sair do rascunho com o portão fechado exige **justificativa escrita**: se
`status != "rascunho"`, `gate.ok == false` e a campanha ainda **não** tem
`gate_justification`, o `POST /:id/status` (e o `POST`/`PUT` que muda o status)
pede `justification` de 10 a 400 caracteres. Sem ela:

```json
{ "error": { "code": "GATE_JUSTIFICATION_REQUIRED",
             "message": "Esta praça ainda não bateu o portão. Escreva a justificativa (mínimo 10 caracteres)." } }
```

A justificativa fica gravada com autor (nome de quem estava logado) e hora, e
**não é cobrada de novo**: reeditar o briefing ou pausar/reativar depois passa
direto. O texto do aviso da tela é `catalog.gate_warning` (§4).

`GET /v1/campanhas/fill-hours?praca_id` é o outro freio — `FillBrakeView`:

```json
{ "praca_id": "uuid", "fill_hours": 2.7, "limit_h": 4, "above": false }
```

`fill_hours` é a média de horas das vagas **preenchidas que anotaram a hora**
(`lead_vagas`) dos leads da praça, `null` quando ninguém anotou. `above` acende o
`catalog.fill_alert`: acima de 4 horas, corta a mídia e volta para a captação de
freelancer.

### `DELETE /v1/campanhas/:id`

Leva criativos, comentários, entradas de tráfego e dias por cascata. O **lead
não vai**: não há FK dele para a campanha, então o mesmo `DELETE` zera
`leads.campanha_id` na mesma transação — apagar campanha nunca apaga gente do
funil, só apaga a origem dela.

### `POST /v1/campanhas/:id/duplicate`

Copia a campanha para outra praça (`{praca_id}`): nome **recalculado** para a
praça de destino, `provas` trocadas pelas primeiras da praça de destino (mesma
quantidade), `gasto: 0`, `status: "rascunho"`, sem a justificativa de portão da
origem. Os criativos vão como `a_fazer`, sem arquivo, sem comentário e sem
aprovação. **Tráfego não vai**: verba, gerenciador e números são da praça de
origem.

### `CreativeView`

```json
{
  "id": "uuid", "campanha_id": "uuid", "formato": "reels",
  "titulo": "O dia do dono", "gancho": "3 primeiros segundos: …",
  "roteiro": { "gancho": "…", "desenvolvimento": "…", "prova": "…", "cta": "…" },
  "legenda": "…", "cta_botao": "Abrir vaga", "owner_id": null,
  "due": "2026-09-14", "publish_at": "2026-09-16", "status": "aprovado",
  "file_url": "", "ia": { "tool": "Sora", "prompt": "…" },
  "approved_at": "2026-09-09T12:00:00.000Z", "created_at": "2026-09-09T12:00:00.000Z",
  "comments": [ { "id": "uuid", "at": "2026-09-09T12:00:00.000Z",
                  "author": "Diego", "kind": "aprovacao", "text": "Aprovado." } ]
}
```

`CreativeBody` = `{campanha_id, formato ∈ catalog.formatos, titulo (≤120),
gancho (≤240), roteiro {gancho, desenvolvimento, prova, cta} (≤1000 cada),
legenda (≤1000), cta_botao (≤40), owner_id (uuid|null), due, publish_at (dia|null),
status ∈ catalog.creative_status, file_url (≤500), ia {tool ∈ catalog.ia_tools,
prompt (≤2000)} | null}`. `owner_id` de pessoa que não existe →
`400 VALIDATION_ERROR`. Os roteiros-modelo prontos vêm em `catalog.script_models` (§4).

No `PUT` o `campanha_id` tem de ser o mesmo do criativo →
`400 VALIDATION_ERROR` (`campanha_id não pode ser alterado`). Mudar de campanha
deixaria o id pendurado nas entradas de tráfego da campanha antiga; quem troca
apaga e recria (ou duplica a campanha).

`POST /:id/review` é a revisão da agência:

- `{kind: "aprovacao", text?}` → `status: "aprovado"` e `approved_at` = agora;
  `text` vazio grava o comentário **`"Aprovado."`**.
- `{kind: "ajuste", text}` → `status: "producao"` e `approved_at` **apagado** — o
  que voltou para a mesa não está mais aprovado. `text` é obrigatório
  (`400 VALIDATION_ERROR` sem ele).

O comentário fica no nome de quem estava logado, com `kind ∈ nota|ajuste|aprovacao`.
`POST /:id/publish-date {date}` muda `publish_at` **e** deixa o comentário
`nota`: `Data de publicação movida para dd/mm/aaaa.`. `POST /:id/status {status}`
só move o quadro, sem comentário.

`DELETE /v1/creatives/:id` tira o id do criativo das entradas de tráfego que o
citavam na mesma transação (`traffic_entries.criativos` é array sem FK) — sem
isso o id órfão travaria o próximo `PUT` da entrada.

### `TrafficEntryView`

```json
{
  "id": "uuid", "campanha_id": "uuid", "plataforma": "meta",
  "nome_la": "BH-Contratante-Cadastro-Set26",
  "publico": "Donos de bar e restaurante, 25–55…",
  "geo": "Belo Horizonte · MG + cidades num raio de 50 km",
  "verba_diaria": 120, "criativos": ["uuid"], "manager_url": "", "api_connected": false,
  "days": [ { "id": "uuid", "entry_id": "uuid", "date": "2026-09-03",
              "investido": 120, "alcance": 9200, "cliques": 168,
              "conversoes": 0, "auto": false } ]
}
```

`TrafficBody` = `{campanha_id, plataforma ∈ meta|google, nome_la (≤120),
publico (≤300), geo (≤200), verba_diaria ≥ 0, criativos: uuid[], manager_url
(http(s) ou vazio, ≤500), api_connected}`. `criativos` só aceita criativo **desta
campanha** → senão `400 VALIDATION_ERROR`. **O status não filtra**: no protótipo
o "só aprovados" era a lista de caixas da tela, e o que já estava salvo na
entrada continuava salvo. Filtrar aqui derrubaria um `PUT` que devolve a própria
entrada assim que alguém pedisse ajuste numa peça que já está no ar — quem
oferece só os aprovados é a tela.

`PUT /v1/traffic/:id/days` é **upsert por data** (`traffic_days` é único em
`entry_id + date`): mandar o mesmo dia duas vezes **corrige** a linha, não cria
outra. `auto` marca que o número veio da plataforma, não da mão.

`POST /v1/traffic/:id/pull-api` é o "puxar pela API" da tela. Sem
`api_connected` → `400 API_NOT_CONNECTED`. Com ela, grava (upsert) o dia de
**hoje** (Brasília) estimado a partir da verba diária, exatamente como o
protótipo: `investido = verba_diaria`, `alcance = verba_diaria × 90`,
`cliques = round(verba_diaria × 1,6)`, `conversoes = max(1, round(verba_diaria /
110))`, `auto: true`. É simulação declarada — a integração de verdade com Meta e
Google ainda não existe.

### Seed da mídia

A praça de demonstração nasce com a mídia do protótipo: **13 provas** (5 vídeos
de dono, 5 de freelancer, 3 casos escritos), **2 campanhas** (contratante e
freelancer, nomes montados por `campanhaName` com o mês de hoje), **5 criativos**
tirados dos roteiros-modelo (`aprovado`, `producao`, `a_fazer`, `aprovacao`,
`a_fazer`), **1 entrada de tráfego no Meta** com os 3 criativos da campanha de
contratante e **6 dias** lançados (`today-6` a `today-1`, R$ 120/dia → 720
investidos, 5 conversões). Idempotente: se a praça seed já tem campanha, o seed
não faz nada.

---

<a id="16-indicadores"></a>

## 16. Indicadores — `/v1/indicators`

Painel único de **Empresa, Praça, Pessoa e Canal**. Nada aqui é tabela de
resumo: cada requisição monta um retrato do banco (funil, ações, mídia,
mensagens, etapas, lançamentos) e roda as funções puras de
`src/domain/indicator-rules.ts` — porta de
`.prototype/src/lib/praca/indicadores.ts`. O catálogo dos 12 indicadores, os 3
marcos, os 6 canais e os 5 períodos são estáticos
(`src/domain/catalog/indicators.ts`, §4). Formatação (`fmtVal`, cor do
semáforo) é do web: a API só devolve número — com a precisão do cálculo
(`2.7272727272727275`, não `2,73`). Os exemplos deste bloco estão abreviados.

| Método | Rota | Query / corpo | Resposta |
|---|---|---|---|
| GET | `/v1/indicators` | `?scope=empresa\|praca&praca_id&period&from&to` | `{range, readings: IndReadingView[]}` (12, na ordem do catálogo) |
| GET | `/v1/indicators/empresa` | `?period&from&to` | `{range, heroes, milestones, months, changed}` |
| GET | `/v1/indicators/pracas` | `?period&from&to` | `IndPracaRowView[]` (uma por praça) |
| GET | `/v1/indicators/pessoas` | `?period&from&to` | `IndPersonRowView[]` (uma por conta **ativa**) |
| GET | `/v1/indicators/canais` | `?praca_id` (obrigatório)`&period&from&to` | `IndCanalRowView[]` (sempre 6) |
| POST | `/v1/indicators/:key/entries` | `{praca_id, date, value}` | `IndicatorEntryView` (upsert) |
| DELETE | `/v1/indicators/:key/entries` | `?praca_id&date` | `{ok: true}` |

Todas exigem JWT e nenhuma é só de admin — quem lança o número à mão é quem
opera a praça. `:key` fora do catálogo → `404 NOT_FOUND`; `praca_id` que não
existe → `404 NOT_FOUND`; `praca_id` malformado ou ausente onde é obrigatório →
`400 VALIDATION_ERROR` (é filtro, não caminho).

### Período

`period ∈ hoje | semana | mes | d90 | livre`, **padrão `mes`**. A janela sai de
"hoje" em Brasília (`todaySp()`), nunca do relógio do navegador:

| `period` | `from` | `to` | `label` |
|---|---|---|---|
| `hoje` | hoje | hoje | `hoje` |
| `semana` | **segunda** desta semana | hoje | `esta semana` |
| `mes` | dia 1º do mês | hoje | `este mês` |
| `d90` | hoje − 89 dias | hoje | `últimos 90 dias` |
| `livre` | `from` | `to` | `período livre` |

`from`/`to` são **obrigatórios em `livre`** (ausentes → `400
VALIDATION_ERROR`) e ignorados nos outros. `from > to` →
`400 VALIDATION_ERROR` ("O início do período não pode ser depois do fim.").
O indicador calculado compara com a **janela anterior de mesmo tamanho**
(`prev`), imediatamente antes de `from`.

`range` volta em toda resposta: `{ "from": "2026-09-01", "to": "2026-09-09", "label": "este mês" }`.

### Escopo

`scope=empresa` (padrão) soma **todas** as praças; `scope=praca` exige
`praca_id` e olha só uma (com `scope=empresa` o `praca_id` é ignorado). Lead
**arquivado** e lead **de teste** ficam sempre fora — número de operação não
conta simulação nem casa que saiu da base.

### `IndReadingView`

```json
{
  "key": "falta", "name": "Falta",
  "what": "Percentual de turnos em que o freelancer não apareceu.",
  "meta": 3, "meta_label": "≤ 3%", "unit": "%", "dir": "lte", "freq": "semanal",
  "owner_id": "uuid", "source": "manual", "origem": "aplicativo Freela",
  "hero": true, "value": 2.5, "prev": 8, "delta": -5.5, "sem": "ok",
  "stale": false, "last_at": "2026-09-09",
  "history": [{ "date": "2026-09-09", "value": 2.5 }]
}
```

`owner_id` é o `owner_email` do catálogo resolvido para id de conta — `null` se
a conta não existe ou está desativada. `hero` marca os 6 números grandes da visão Empresa.
`value: null` significa **sem base para calcular** (não zero): a tela mostra "—".

`sem` (semáforo): `ok` bateu a meta · `warn` até 15% fora · `bad` abaixo disso ·
`none` sem número. `dir=gte` compara `value >= meta`; `dir=lte`, `value <= meta`.

### Os 12 indicadores

`source: "sistema"` = calculado a cada requisição; `source: "manual"` = lançado
à mão (`indicator_entries`).

| `key` | como sai o número |
|---|---|
| `clientes_ativos` | leads na etapa 7 que entraram nela até o fim do período |
| `recontratacao` | leads na etapa ≥ 7 sobre leads na etapa ≥ 6 (%) |
| `tempo_preencher` | média das horas das vagas preenchidas; na Empresa, média das **praças** (não das vagas) |
| `falta` | **à mão** |
| `perda_mensal` | perdidos (etapa 8) no período sobre a base da etapa ≥ 5 mais eles (%) |
| `custo_cliente` | verba de mídia do período ÷ clientes que viraram ativos |
| `freelancers` | **à mão**; sem lançamento, cai no resultado da **etapa 2** da praça |
| `leads_novos` | leads com `entered_at` no período |
| `passagem_etapa` | leads na etapa ≥ 5 (menos os perdidos) sobre leads na etapa ≥ 2 (%) |
| `taxa_resposta` | envios respondidos sobre envios que saíram da fila no período (%) |
| `contratos_rede` | **à mão** |
| `playbook` | ações pontuais vencidas até o fim do período que já foram concluídas (%) |

A verba de mídia é a soma dos **dias lançados** no tráfego dentro do período e
só cai no `gasto` declarado da campanha quando **nenhum** dia entrou na janela
(mesma regra do `metrics.investido` de §15).

### Indicador à mão: número velho e junção de praças

`stale: true` é o "número velho" da tela (a linha fica cinza): **nenhum**
lançamento, ou o último mais antigo que a frequência do indicador
(`diária` 1 dia, `semanal` 7, `mensal` 31). Indicador calculado nunca é velho.

`value` é o último lançamento **até `range.to`**; `prev`, o último **antes de
`range.from`**; `last_at` é sempre a data do lançamento mais recente. Na visão
**Empresa** os últimos valores de cada praça são juntados: **soma** quando
`unit` é vazio (contagem — freelancers, contratos de rede) e **média** quando é
`%`, `h` ou `R$` (proporção). `stale` na Empresa só é `true` quando **todas** as
praças estão velhas.

### `GET /v1/indicators/empresa`

```json
{
  "range": { "from": "2026-09-01", "to": "2026-09-09", "label": "este mês" },
  "heroes": [ "…6 IndReadingView com hero: true…" ],
  "milestones": [
    { "when": "2026-12-31", "label": "dez/26",
      "targets": [{ "name": "clientes ativos", "meta": 500, "unit": "",
                    "key": "clientes_ativos", "dir": "gte", "value": 3, "pct": 0.6 }] }
  ],
  "months": [{ "month": "2026-09", "label": "set/26", "value": 3, "meta": 216 }],
  "changed": {
    "good": [{ "name": "Leads novos no mês", "from": 1, "to": 3, "pct": 200, "good": true, "unit": "" }],
    "bad": []
  }
}
```

`milestones` são os 3 marcos do catálogo (dez/26, fev/27, ago/27) com o valor de
hoje e `pct` = quanto do caminho já foi andado: `dir=gte` → `value / meta`;
`dir=lte` → `meta / value`; teto de 100%, e 0 quando não há número.

`months` são 12 meses terminando no mês de hoje. `value` = clientes ativos que
já eram ativos no fim daquele mês. `meta` é o caminho **interpolado** de zero em
01/06/2026 até 500 em 31/12/2026, medido no dia 1º de cada mês (antes de jun/26
é 0; depois de dez/26 fica em 500).

`changed` é o "o que mudou desde a semana passada": compara os **últimos 7 dias**
com os 7 anteriores, ignora variação abaixo de 1% e devolve os **3 maiores**
saltos de cada lado (`good` = andou na direção da meta). `from`/`to` aqui são
valores do indicador, não datas.

### `GET /v1/indicators/pracas`

```json
{ "praca": { "id": "uuid", "name": "Belo Horizonte + Contagem" },
  "step_atual": 1, "ativos": 3, "recontratacao": 62.5, "fill": 2.73,
  "falta": null, "freelancers": 22, "custo": 240, "atrasadas": 6 }
```

`step_atual` = quantas etapas do roteiro têm **todas** as ações concluídas, mais
um, com teto na etapa 11 — etapa sem ação nenhuma conta como concluída (quirk do
protótipo, mantido). `atrasadas` = ações **pontuais** da praça vencidas e ainda
abertas (ação concluída nunca conta como atrasada). `falta` e `freelancers` vêm
do lançamento à mão; o resto é calculado para aquela praça.

### `GET /v1/indicators/pessoas`

```json
{ "id": "uuid", "name": "Rebeca", "no_prazo": 0, "atrasadas": 4,
  "leads_tocados": 10, "leads_avancados": 0, "fechados": 5, "vagas": 10 }
```

Uma linha por conta **ativa**, na ordem das pessoas (§3) — é material para a
conversa individual, **não** ranking. `no_prazo` = conclusões de ação (pontual ou
dia marcado de recorrente) dentro do período; `atrasadas` = ações pontuais dela
vencidas e abertas; `leads_tocados` = leads distintos dela com **mensagem
enviada, ligação ou visita** no período (resposta do lead e nota não são toque);
`leads_avancados` = leads dela com evento de mudança de etapa no período;
`fechados` = leads dela que entraram na etapa ≥ 6 no período; `vagas` = vagas
dos leads dela com data no período.

### `GET /v1/indicators/canais`

```json
{ "id": "trafego", "label": "Tráfego pago", "leads": 7, "ativos": 1,
  "conv": 14.29, "custo": 720, "tempo_primeira_vaga": null }
```

Sempre os **6 canais** do catálogo, mesmo os sem lead. O canal do lead sai da
`origem` escrita nele (`canalOf`): sem casar nenhuma palavra, cai em
`prospeccao`. `conv` = ativos ÷ leads do canal (%). `custo` só existe em
`trafego` — os outros canais não consomem verba, e vem `null` neles.
`tempo_primeira_vaga` = média de dias entre a entrada do lead e a **primeira**
vaga dele (negativo é descartado: vaga anterior à entrada é dado de importação).

### Lançamento à mão

```
POST /v1/indicators/falta/entries   { "praca_id": "uuid", "date": "2026-09-09", "value": 2.5 }
→ { "praca_id": "uuid", "key": "falta", "date": "2026-09-09", "value": 2.5 }
```

**Upsert por (praça, indicador, dia)** — `indicator_entries` tem PK tripla:
lançar o mesmo dia duas vezes **corrige** a linha, não cria outra. `value` é
número de 0 a 1 000 000 000 (`null` ou negativo → `400 VALIDATION_ERROR`);
`date` precisa existir no calendário (`2026-02-31` → `400 VALIDATION_ERROR`).
Lançar em `key` de `source: "sistema"` é aceito e entra no `history`, mas **não**
muda o `value` daquele indicador — quem manda ali é o cálculo.

`DELETE /v1/indicators/:key/entries?praca_id&date` apaga um lançamento e
responde `{ok: true}` mesmo quando o dia não tinha nada (idempotente). Não é
rota de admin.

<a id="17-notificacoes"></a>

## 17. Notificações — `/v1/notifications`

Os avisos do sino — porta de `.prototype/src/components/praca/Layout.tsx:42-89`
(`useNotifications`). Cada requisição monta um retrato **de UMA praça**
(etapas, ações, funil, mídia) e roda a função pura
`buildNotifications` de `src/domain/notification-rules.ts`; quem lê o banco e
filtra pelas dispensas do usuário é o `NotificationsService`.

| Método | Rota | Query / corpo | Resposta |
|---|---|---|---|
| GET | `/v1/notifications` | `?praca_id` (obrigatório) | `NotifItem[]`, já sem as dispensadas pelo usuário logado |
| POST | `/v1/notifications/dismiss` | `{ids: string[]}` (1 a 100, cada um até 120 chars) | `{ok: true}` |
| POST | `/v1/notifications/undismiss` | `{ids: string[]}` (1 a 100, cada um até 120 chars) | `{ok: true}` |

Todas exigem JWT; nenhuma é só de admin. `praca_id` ausente ou malformado →
`400 VALIDATION_ERROR`; praça que não existe → `404 NOT_FOUND`.

### `NotifItem`

```json
{ "id": "<praca_id>:lock-3", "text": "Etapa 3 travada — Falta bater o Portão: 40 garçons confirmados. Hoje: 22", "tone": "warn" }
```

`tone ∈ warn | info`. `id` é **sempre** prefixado com `<praca_id>:` — a
dispensa é por usuário (`user_dismissed_notifs`, PK `[user_id, notif_id]`), e
sem o prefixo o mesmo `lock-3` de duas praças diferentes compartilharia
dispensa. O resto do id segue o esquema do protótipo:

| id (sem o prefixo) | regra | tone |
|---|---|---|
| `tmw-<action_id>` | ação **recorrente** (não `once`) que ocorre amanhã | `info` |
| `lock-<n>` | etapa `n` travada (o portão da etapa anterior não bateu e ninguém destravou) | `warn` |
| `stall-<n>` | etapa `n` **ativa** e sem NENHUMA ação concluída há mais de 7 dias | `warn` |
| `lead-<lead_id>` | lead crítico: mais de 15 dias sem toque, fora a etapa 8 (perdido) — mesmo limiar de `lead-rules.ts#isCritical` | `warn` |
| `fill-<praca_id>` | freio automático: tempo médio de preenchimento das vagas da praça acima de `FILL_LIMIT_H` (4h) | `warn` |
| `teto-<campanha_id>` | campanha **ativa** da praça com `metrics.acima_teto` (custo por cliente novo acima do `cac_teto`) | `warn` |

A ordem da lista é a mesma do protótipo: amanhã → etapas travadas/paradas →
leads críticos → freio de preenchimento → campanhas acima do teto. Etapa
`done`/`todo` nunca gera aviso; etapa `active` sem nenhuma conclusão registrada
também não (nada para comparar com os 7 dias).

### `POST /v1/notifications/dismiss` e `.../undismiss`

```
POST /v1/notifications/dismiss   { "ids": ["<praca_id>:lock-3"] }
→ { "ok": true }
```

`dismiss` é um **upsert por (usuário, id)** — dispensar de novo não dá erro
nem duplica linha. `undismiss` apaga a dispensa; id nunca dispensado também
responde `{ok: true}` (idempotente, igual ao `DELETE` de §16). Não existe
"dispensar para todo mundo": a dispensa é sempre da conta logada, e a mesma
`id` pode estar dispensada para um usuário e visível para outro.

<a id="18-freela"></a>

## 18. Freela — `/v1/freela`

A ponte com o **api-freela**: as campanhas de WhatsApp (normais e automáticas)
saem pelo chip de campanha do Freela, com ritmo anti-bloqueio, janela comercial
e opt-out ("responda SAIR"). Desenho completo em §7 do
`docs/superpowers/specs/2026-09-09-praca-port-design.md`; o código fica isolado
em `src/modules/freela/`.

### 18.1 Conexão

O Freela **não tem chave de API nem conta de serviço**: a única porta é o JWT
de um **admin** com a permissão `REFERRALS`. O Praça usa uma conta dedicada,
criada pelo dono no painel do Freela, e três variáveis de ambiente:

| Variável | O que é |
|---|---|
| `FREELA_API_URL` | base da API do Freela (ex.: `http://localhost:3000`) |
| `FREELA_ADMIN_EMAIL` | e-mail da conta de serviço (papel `ADMIN` + `REFERRALS`) |
| `FREELA_ADMIN_PASSWORD` | senha dessa conta |
| `FREELA_PER_CONTACT_MESSAGE` | `true` liga o texto por contato (§18.4). Padrão `false` |
| `FREELA_SYNC_ENABLED` | `false` desliga o relógio de 2 min sem mexer no código |

`FreelaClient` faz `POST /v1/admins/login` na primeira chamada, guarda o
`accessToken` **em memória** e refaz o login **uma vez** em `401` (sem fluxo de
refresh: relogar é uma chamada só). Timeout de 15 s por chamada.

Três erros, três códigos:

| Código | HTTP | Quando |
|---|---|---|
| `FREELA_NOT_CONFIGURED` | 503 | falta uma das três variáveis |
| `FREELA_ERROR` | 502 | o Freela respondeu e recusou — a mensagem é **a dele** (`error.message` → `message` → `HTTP <status>`) |
| `FREELA_UNREACHABLE` | 502 | não deu para falar com ele (rede, DNS, 15 s) |

Sem as três variáveis o resto do Praça funciona normal: só `/v1/freela/*` e o
modo de envio `freela` (§13) param.

### 18.2 Rotas

| Método | Rota | Corpo / query | Resposta |
|---|---|---|---|
| GET | `/v1/freela/status` | — | `FreelaStatus` — **única** rota que responde 200 sem conexão |
| GET | `/v1/freela/audience-options` | `?audience=` (**previsível**) | opções de recorte do público (repasse) |
| POST | `/v1/freela/audience-preview` | `{audience (previsível), filters?}` | contagem do público (repasse) |
| GET | `/v1/freela/campaigns` | `?praca_id` | `FreelaCampaign[]` (espelho local) |
| POST | `/v1/freela/campaigns` | `CreateCampaign` | `{campaign, recipients_count, invalid_phones, duplicate_phones, unsupported_variables, start_error}` |
| GET | `/v1/freela/campaigns/:id` | — | `{campaign, freela, recipients, recipients_meta}` |
| PATCH | `/v1/freela/campaigns/:id/start` | — | `FreelaCampaign` |
| PATCH | `/v1/freela/campaigns/:id/pause` | — | `FreelaCampaign` |
| PATCH | `/v1/freela/campaigns/:id/cancel` | — | `FreelaCampaign` |
| GET | `/v1/freela/templates` | `?praca_id` | campanhas automáticas do Freela + `praca_id` |
| POST | `/v1/freela/templates` | `CreateTemplate` | a campanha criada (nasce **desligada**) |
| GET | `/v1/freela/templates/:id` | — | a campanha automática + `praca_id` |
| PUT | `/v1/freela/templates/:id` | mesmo corpo, `praca_id?` | a campanha atualizada |
| PATCH | `/v1/freela/templates/:id/enabled` | `{enabled}` | a campanha |
| POST | `/v1/freela/templates/upload` | `multipart/form-data`, campo `file` | `{key, url}` |

Todas exigem JWT; nenhuma é só de admin. **`:id` aqui é o id do Freela** — é o
que a lista de lá devolve e o que o vínculo local guarda em `freela_id`. Em
campanha, id que não existe no espelho → `404 NOT_FOUND`; em campanha
automática, `:id` é **UUID** no Freela e id malformado morre aqui como
`404 NOT_FOUND`, sem virar chamada lá.

**Dois conjuntos de público** (os mesmos dois do Freela):

| Conjunto | Onde vale | Valores |
|---|---|---|
| **previsível** | `audience-options`, `audience-preview`, campanhas automáticas | os 4 internos + `CONTRACTORS_ALL` + `CONTRACTORS_ACTIVE` |
| **criável** | `POST /v1/freela/campaigns` | os 4 internos + `EXTERNAL_LIST` |

Os 4 internos são `CONTRACTORS_NEVER_PUBLISHED`, `CONTRACTORS_DORMANT_90D`,
`PROVIDERS_NEVER_APPLIED`, `PROVIDERS_DORMANT_90D`. `EXTERNAL_LIST` em rota de
prévia é `400 VALIDATION_ERROR` **local** (não é consulta na base do Freela: a
lista vem do funil do Praça, e prever ali é a prévia do disparo, §13);
`CONTRACTORS_ALL`/`ACTIVE` em `POST /campaigns` também é `400` — campanha de
ativação não dispara para a base inteira.

Corpos de entrada são **snake_case** (§1) e o serviço traduz para o camelCase do
Freela. As **leituras** que só repassam o Freela (`GET /campaigns/:id` →
`freela`/`recipients`, e as campanhas automáticas) devolvem o objeto **como ele
veio, em camelCase**, com `praca_id` a mais: espelhar campo a campo criaria uma
segunda definição para manter sincronizada a cada mudança do Freela.

#### `FreelaStatus`

```json
{ "configured": true, "reachable": true, "admin_email": "praca@freela.app",
  "scheduler_enabled": true, "per_contact_message": false,
  "last_sync_at": "2026-09-09T18:40:00.000Z", "error": null }
```

`reachable` é um `GET` de verdade nas campanhas do Freela — nunca lança: se
falhar, vem `reachable: false` e `error` com o motivo. `scheduler_enabled` é o
`meta.schedulerEnabled` do Freela (as flags `ACTIVATION_CAMPAIGNS_ENABLED` /
`CAMPAIGN_TEMPLATES_ENABLED` do servidor **dele**): com ele `false`, a campanha
é criada mas **nada sai**. `last_sync_at` é o `last_synced_at` mais recente do
espelho.

#### `FreelaCampaign` (espelho local, `freela_campaigns`)

```json
{ "id": "uuid", "freela_id": "cmp_123", "name": "Toque 1 · 09/09/2026",
  "kind": "disparo", "praca_id": "uuid", "disparo_id": "uuid",
  "audience": "EXTERNAL_LIST", "audience_filters": null, "status": "RUNNING",
  "stats": { "total": 25, "sent": 3, "failed": 0 },
  "created_by": "uuid", "created_at": "…", "last_synced_at": "…" }
```

`kind ∈ disparo | cadencia | base | manual` — de onde a campanha saiu (disparo do
funil, lote de cadências, público do Freela, lista montada na tela do Freela).
`status` e `stats` são **do Freela**: o espelho nunca decide, só copia. `GET
/v1/freela/campaigns` sincroniza antes as **5** campanhas mais velhas com mais
de 60 s, em melhor esforço (Freela fora do ar abre a tela com o número de
antes); o resto fica para o relógio de 2 min. `GET /v1/freela/campaigns/:id`
atualiza `status`/`stats` com o que acabou de chegar, sem paginar destinatário,
e devolve `recipients_meta` em snake_case (`{total, page, page_size}`, do
`{total, page, pageSize}` que vem dentro de `data`).

#### `CreateCampaign`

```json
{ "name": "Reativar bares de BH", "praca_id": "uuid",
  "audience": "CONTRACTORS_DORMANT_90D",
  "filters": { "cities": ["Belo Horizonte", "Contagem"], "ufs": ["MG"],
               "modules": ["bars-restaurants"], "radius": { "city": "Belo Horizonte", "km": 50 } },
  "lead_filters": { "praca_id": "uuid", "stage": 2 },
  "template_id": "uuid", "whatsapp_template": "Oi {{nome}}!",
  "pacing": { "messages_per_hour": 30, "daily_cap": 200,
              "window_start_hour": 9, "window_end_hour": 19, "weekdays_only": true },
  "start_now": true }
```

- `name` de 3 a 120; `audience` no conjunto **criável** (os 4 internos +
  `EXTERNAL_LIST`).
- **Texto:** `template_id` (modelo do Praça, convertido pelo §18.3) **ou**
  `whatsapp_template` (até 4.000, até 3 variantes separadas por uma linha
  `---`). Sem nenhum dos dois → `400 TEMPLATE_REQUIRED`.
- **`EXTERNAL_LIST`** monta a lista com os leads do funil: exige `lead_filters`
  (o **mesmo** `DisparoFilters` do §13, com lista de bloqueio e trava de 30 dias
  quando há `template_id`) — sem ele, `400 LEAD_FILTERS_REQUIRED`; ninguém
  elegível → `400 NO_RECIPIENTS`; mais de 5.000 contatos (teto do Freela) →
  `400 TOO_MANY_CONTACTS`. `kind` fica `manual`, e os destinatários viram
  `msg_sends` no Praça — é o **§18.7** (é ele que faz a trava de 30 dias
  acumular de verdade e o toque aparecer na ficha do lead).
- Os outros públicos são do Freela e usam `filters` (`audienceFilters` lá).
  `kind` fica `base`.
- `pacing` ausente = o ritmo do Praça (`GET /v1/settings`) convertido pelo
  §18.3; o que vier preenche por cima, campo a campo.
- `start_now` é **obrigatório** (booleano; não tem padrão — mandar campanha é
  ato explícito). `true` cria e já inicia; `false` deixa a campanha em `DRAFT`
  no Freela (é o `PATCH /:id/start` que solta), e a sincronização **não** a
  inicia sozinha (§18.6, passo 0: só lote de `disparo`/`cadencia` é retomado).
- Praça inexistente → `404 NOT_FOUND`.
- **Telefone repetido** na lista é descartado (o Freela também descarta) e
  volta contado em `duplicate_phones`.
- `start_error` traz o motivo quando a campanha **nasceu** mas o
  `PATCH /:id/start` falhou: ela fica em `DRAFT` no Freela e no espelho, e a
  tela pode tentar `start` de novo. A campanha nunca é criada duas vezes por
  isso (§18.5).

#### `CreateTemplate` (campanha automática)

`{praca_id, name, schedule_kind ∈ WEEKLY|DATED, weekdays?: 0..6 (0 = domingo),
send_hour? 0..23, target_month? 1..12, target_day? 1..31, target_year?
2020..2100, lead_days? 0..60, audience, filters? {cities, ufs, modules},
channels: ("PUSH"|"WHATSAPP")[] (≥ 1), whatsapp_template?, push_title? (≤120),
push_body? (≤500), image_key? (≤512), deep_link? (≤256), pacing?, max_per_run?}`.

`audience` aqui aceita os quatro públicos acima **mais** `CONTRACTORS_ALL` e
`CONTRACTORS_ACTIVE`, e `filters` **não** tem `radius` (o Freela não recorta
campanha automática por raio). A campanha nasce `enabled: false`; quem liga é
`PATCH /:id/enabled`. `PUT` substitui o corpo inteiro lá — `praca_id` é
opcional e, quando vem, atualiza o vínculo local (`freela_templates`).

`POST /v1/freela/templates/upload` repassa o arquivo (campo `file`, PNG/JPEG/
WEBP, até 5 MB) para o Freela e devolve `{key, url}` — o `key` é o que vai em
`image_key`. Sem arquivo → `400 FILE_REQUIRED`; tipo errado → `400
INVALID_FILE_TYPE`; acima de 5 MB → `413 FILE_TOO_LARGE`. O arquivo passa **pelo
Praça** porque a credencial de admin do Freela é da API, não da tela.

### 18.3 Conversão Praça → Freela

O Freela conhece **três** variáveis por destinatário; o Praça tem dezesseis
(§12). `toFreelaTemplate` (`src/modules/freela/freela-template.ts`) faz a ponte:

| Variável do Praça | Vira | Por quê |
|---|---|---|
| `{{primeiro_nome_dono}}` | `{{primeiro_nome}}` | mesma coisa, nome diferente |
| `{{nome}}`, `{{primeiro_nome}}` | iguais | existem nos dois (quem escreve o texto na mão escreve no vocabulário do Freela) |
| `{{cidade}}` | **cidade-sede da praça** (texto), ou fica avisada | o Freela só preenche `{{cidade}}` para a base dele: em lista externa o destinatário nasce com `city: null` e a variável sairia vazia |
| `{{praca}}`, `{{meu_nome}}`, `{{link_video_caso}}`, `{{link_cadastro}}`, `{{funcao}}`, `{{valor}}`, `{{turno}}`, `{{dia_forte}}`, `{{data}}` | **texto resolvido agora** | são fixas por campanha (praça do filtro, quem dispara, `template_defaults`) |
| `{{estabelecimento}}`, `{{bairro}}`, `{{estabelecimento_vizinho}}`, `{{data_vaga}}` | **ficam como estão** e entram em `unsupported_variables` | são por lead e o Freela não as tem |
| qualquer outra | idem | variável desconhecida não vira buraco no texto |

A cidade-sede vem de `cobertura_cidade` da praça (ou do `city` da linha, antes
do `·`) e entra quando a campanha é **de uma praça**: prévia/criação de disparo
com `filters.praca_id` diferente de `all` e `POST /v1/freela/campaigns` (que
sempre tem `praca_id`). Em filtro `all` a cidade não existe, então `{{cidade}}`
fica no texto e entra em `unsupported_variables` — para não mandar frase pela
metade. No **lote de cadência** (§18.5) não há praça, mas há os leads: a cidade
entra quando todos os do lote são da mesma (o valor é o mesmo que o render lead
a lead daria); com cidades diferentes, fica avisada.

Variante A e B viram `A\n---\nB` (o Freela alterna variantes por índice — é
exatamente o teste A/B do Praça). Variável fixa sem valor continua visível como
`⟨praca⟩`, igual ao render do §12: é o que faz ver o buraco antes de disparar.

**Texto escrito na mão** (`whatsapp_template` em `POST /v1/freela/campaigns`, e
`text` na prévia do disparo, §13) passa pela **mesma** conversão, com as
variantes separadas pela linha `---` preservadas
(`toFreelaTemplateFromText`). Sem isso, um `{{meu_nome}}` digitado no campo
subiria cru e o lead receberia a chave no lugar do valor — e a prévia do §13
mostraria um texto diferente do que a campanha manda.

Ritmo (`toFreelaPacing`, a partir de `GET /v1/settings`):

| Praça | Freela | Conta |
|---|---|---|
| `gap_min` / `gap_max` (segundos entre mensagens) | `messagesPerHour` | `clamp(round(3600 / ((gap_min+gap_max)/2)), 1, 60)` |
| `daily_limit` | `dailyCap` | `clamp(daily_limit, 1, 1000)` |
| `window_start` | `windowStartHour` | igual (0..23) |
| `window_end` | `windowEndHour` | igual — fim **exclusivo** nos dois (1..24) |
| `sunday` | `weekdaysOnly` | `!sunday` |

⚠️ **O Freela não distingue sábado.** `sunday: false` no Praça (não mandar no
domingo) vira `weekdaysOnly: true` lá, que também corta o sábado. Quem precisa
de sábado tem que ligar `sunday` no Praça — e aí o domingo entra junto.

### 18.4 Flag `FREELA_PER_CONTACT_MESSAGE`

As variáveis por lead (`{{estabelecimento}}` e companhia) só sobem se o Freela
aceitar um texto **por contato**. Isso depende da extensão opcional descrita em
§7.5 do desenho (`ExternalContactDto.message`, branch local
`feat/activation-campaigns-contact-message`, ainda **não** mesclada).

- `FREELA_PER_CONTACT_MESSAGE=false` (padrão): `contacts[]` vai só com
  `{name, phone}` e todo mundo recebe o modelo convertido. As variáveis por
  lead ficam visíveis no texto — é o que `unsupported_variables` avisa.
- `=true`: cada contato leva `message` com o texto **já renderizado** para
  aquele lead.

**Não ligue a flag antes de o api-freela de produção ter a extensão**: o
`forbidNonWhitelisted` de lá devolve `400` no lote inteiro por causa do campo a
mais.

A extensão já está escrita e testada no api-freela, em branch **local, sem
push**: `feat/activation-campaigns-contact-message`, **dois** commits —
`d30bff00365000d523f9e71b8618245752816d9a` (a extensão) e
`34fe46f1` (o rodapé de opt-out forçado) — no worktree
`/home/doutor/coding/freela/.wt/api-contact-message`. Ela adiciona
`ExternalContactDto.message` (opcional, ≤ 4000), a coluna
`activation_campaign_recipients.custom_message` (migração
`20260909220000_activation_recipients_custom_message`) e faz o despachante
mandar o texto do destinatário — com o rodapé de opt-out — em vez do template.
Nesse caminho o rodapé é colado **sempre**, a não ser que o texto já traga a
instrução inteira (`responda`/`responder SAIR`) — então não precisamos escrever
opt-out no modelo do Praça, e um "sair" solto no meio da frase não some com o
rodapé.
Só o canal WhatsApp usa esse texto, e ele sai **como está** (nenhum `{{...}}` é
substituído lá; quem renderiza é o Praça). `FREELA_PER_CONTACT_MESSAGE=true`
somente **depois** que essa branch for mesclada e deployada em produção — o
dono decide o merge.

### 18.5 Outbox: disparo e cadência em modo `freela`

No modo `freela` ninguém envia pelo Praça. O disparo (§13) e o motor de
cadências (§14) gravam `msg_sends` em `fila` com `scheduled_at`; o
`FreelaOutboxService` roda a cada 2 min e entrega o que venceu:

- **um lote por disparo** — nome da campanha = nome do disparo, texto = modelo
  do disparo convertido (as duas variantes quando `split`), praça = a do filtro,
  autor = quem criou o disparo;
- **um lote por NÓ de cadência** (`disparo_id` nulo, agrupado por `node_id`) —
  nome `Cadências — dd/mm HH:mm · <cadência> · passo <n>` (Brasília), texto = o
  **modelo do nó** (modelo salvo ou texto próprio do passo) convertido pelo
  mesmo caminho do disparo (§18.3), autor = o primeiro admin ativo (sem nenhum,
  o lote espera).

  O nó é a unidade porque o Freela manda **um** `whatsappTemplate` por
  campanha: agrupar a rodada inteira obrigaria a escolher o texto de um passo
  para todos. E o texto que sobe é o MODELO, não o texto que o motor renderizou
  para um lead — aquele já tem `{{primeiro_nome_dono}}`, `{{estabelecimento}}` e
  `{{cidade}}` substituídos, e subi-lo faria os outros N contatos do lote serem
  chamados pelo nome do dono do primeiro bar.

  O que só existe lead a lead (`{{estabelecimento}}`, `{{bairro}}`,
  `{{estabelecimento_vizinho}}`, `{{data_vaga}}`) fica no texto como `{{chave}}`
  e sai num aviso no log — é a mesma regra do §18.3, e a tela de cadências não
  tem prévia do Freela para avisar antes. `{{cidade}}` é resolvida quando todos
  os leads do lote são da **mesma** cidade (o caso normal: a cadência corre por
  praça), porque aí o valor é o mesmo que o render lead a lead daria; com
  cidades diferentes ela fica no aviso. `{{praca}}` nunca é resolvida num lote
  de cadência: ele atravessa praças.

  Nó apagado (ou envio sem `node_id`) só sobe se **todos** os textos do lote
  forem idênticos — aí não há nada de um lead no texto do outro; senão o lote
  fica na fila com aviso no log. Nó sem texto nenhum (o modelo citado foi
  apagado) também fica na fila, em vez de subir `whatsappTemplate: ""` — mas
  esse caminho ficou raro depois do `409 TEMPLATE_IN_USE` do §12;
- cada lote vira **uma** campanha `EXTERNAL_LIST` com `listFileName:
  "praca:<kind>"`, `skipRegistered: false` e `start` imediato;
- lote acima de **5.000** contatos (teto do Freela) vira duas campanhas ou
  mais, com `(parte n/total)` no nome — senão o lote gigante seria recusado a
  cada 2 minutos para sempre;
- telefone que não vira E.164 **não sobe**: o envio fica `falhou` com
  `failure_reason: "Telefone inválido para WhatsApp."` (o Freela recusaria o
  lote inteiro por causa de um número quebrado);
- **telefone repetido** no lote também não sobe: o Freela descarta o segundo
  contato do mesmo número, então o envio extra fica `falhou` com
  `"Telefone repetido no lote."` em vez de esperar para sempre um destinatário
  que nunca vai existir;
- a ordem é **criar → espelho → começar**: o `POST` cria a campanha em `DRAFT`,
  o espelho e o `freela_campaign_id` dos envios são gravados **no mesmo
  commit** e só então vem o `PATCH /:id/start`. Campanha criada com envio solto
  faria a rodada seguinte criar tudo de novo e o lead receber duas vezes; start
  que falha só deixa a campanha em `DRAFT` (o motivo vai para o log e para
  `start_error`) e o lote **não** conta como entregue — ele entra em
  `start_pending` no resultado da rodada e a sincronização tenta iniciar de novo
  no próximo tick (§18.6).

A garimpagem da fila roda numa transação curta com
`pg_advisory_xact_lock(hashtext('freela-outbox'))`; a chamada HTTP acontece
**fora** de transação. Campanha recusada pelo Freela deixa os envios em `fila`
para a próxima rodada — nada fica meio enviado.

> **A API roda em UMA instância.** O lock consultivo da garimpagem é soltado no
> fim da transação, **antes** da chamada HTTP, e os envios não recebem marca de
> "garimpado". Com duas réplicas, os dois relógios rodam em paralelo e o mesmo
> lote vira duas campanhas — o lead recebe duas vezes. Se um dia houver duas,
> o caminho é marcar as linhas na garimpagem (`UPDATE … SET claimed_at`) e ler
> com `SELECT … FOR UPDATE SKIP LOCKED`. Ver README, "Produção".

Por isso `POST /v1/sends/:id/mark` num envio em modo `freela` é
`409 FREELA_SEND` (§13): a garimpagem é exatamente `mode: 'freela'` +
`status: 'fila'`, então marcar à mão tiraria o envio dela e ele nunca chegaria
à campanha — a fila do Praça constaria como enviada sem ninguém ter mandado
nada. `POST /v1/sends/:id/reply` continua liberado nos dois modos.

### 18.6 Sincronização

`FreelaSyncScheduler` (`@Cron('*/2 * * * *')`, travado por
`FREELA_SYNC_ENABLED`, conexão configurada e reentrância; erro nunca sai do
relógio) faz, nesta ordem: `outbox.flush()` e depois, para cada campanha do
espelho fora de `COMPLETED|CANCELLED`:

0. **retenta o `start`** quando o espelho está em `DRAFT` e a campanha é de
   lote (`kind ∈ disparo | cadencia`, que nascem sempre com `start` pedido):
   uma tentativa por rodada, e falhar só adia para a próxima. Sem isso, um erro
   de dois segundos no `PATCH /:id/start` deixaria a campanha `DRAFT`, os
   destinatários `PENDING` e o lote em `fila` **para sempre** — o espelho e o
   `freela_campaign_id` já estão gravados, então a garimpagem do outbox
   (`freela_campaign_id IS NULL`) não pega mais esses envios. Campanha de tela
   (`base`/`manual`) em `DRAFT` **não** é iniciada: ali o `DRAFT` pode ser
   `start_now: false`, e começar sozinho seria disparar sem ordem;
1. `GET /:id` → atualiza `status`, `stats` e `last_synced_at`;
2. se há `msg_sends` pendurados, pagina `GET /:id/recipients?pageSize=200`
   (resposta `{data: {total, page, pageSize, items}}`) e casa o campo
   **`phone`** do destinatário — que o Freela monta como
   `COALESCE(external_phone, users.phone, destination)` — com o telefone do
   lead, os dois normalizados para E.164:
   - `SENT` → envio vira `enviada` com `sent_at` do Freela, guarda
     `freela_recipient_id`, grava o evento `msg_out` na linha do tempo do lead
     (`"<disparo | Cadência “X” | Campanha “X”> enviada pelo Freela
     (WhatsApp)."` — a campanha entra quando o envio não é de disparo nem de
     cadência, que é o caso do §18.7) e atualiza `last_contact_at` — **uma vez
     só** (o passo só olha envio em `fila`);
   - `FAILED`/`SKIPPED` → `falhou` com o motivo do Freela;
3. disparo sem ninguém na fila vira `concluido` (mesma regra do §13).

Campanha com envio pendurado e **nenhum** destinatário com telefone lido vira
aviso no log (`nenhum destinatário com telefone lido`): ou a campanha ainda não
tem destinatário, ou o Freela mudou o nome do campo — e nos dois casos o envio
ficaria em `fila` para sempre em silêncio.

A **resposta** do lead continua sendo registrada à mão no Praça (`POST
/v1/sends/:id/reply`): o Freela não devolve resposta.

> Mesma premissa de **instância única** do §18.5: o passo 2 lê e escreve envio
> por envio, sem lock. Duas réplicas resolveriam o mesmo destinatário duas
> vezes.

### 18.7 Espelho dos envios da campanha criada pela tela (`EXTERNAL_LIST`)

`POST /v1/freela/campaigns` com `audience: "EXTERNAL_LIST"` (a caixa
**Freela → Campanhas → Nova**) monta a lista com os leads do funil — e grava
**um `msg_sends` por destinatário**, como o disparo em modo `freela` (§18.5):

| coluna | valor |
|---|---|
| `template_id` | o do corpo, ou `null` quando o texto foi escrito na mão |
| `variant` | `"A"` |
| `channel` | `"whatsapp"` |
| `text` | o texto do lead quando `FREELA_PER_CONTACT_MESSAGE` está ligado (§18.4); senão o **modelo convertido** da campanha, que é o que o Freela vai personalizar e mandar |
| `mode` / `status` | `"freela"` / `"fila"` |
| `scheduled_at` | agora |
| `stage_at_send` | a etapa do funil do lead no momento do envio |
| `freela_campaign_id` | a campanha criada |
| `disparo_id` / `cadence_id` / `node_id` | `null` — é campanha de tela |

Por que existe: sem esses envios, a campanha da caixa não deixava rastro
nenhum. Consequências que o operador via:

1. a **trava de 30 dias por modelo** era LIDA (o público passa pelo mesmo plano
   do disparo) e nunca escrita — mandar o mesmo modelo duas vezes por esta caixa
   acertava as mesmas pessoas, e a frase da própria tela prometia o contrário;
2. o lead continuava "parado há N dias", voltava para a fila do dia, entrava em
   cadência e em disparo, e a ficha não mostrava que um WhatsApp saiu;
3. `taxa_resposta` e as métricas de modelo (§12) ignoravam esses envios.

Duas decisões de desenho:

- as linhas nascem **depois** de a campanha existir e **já com**
  `freela_campaign_id`. Criá-las antes (como o disparo faz, para o outbox
  garimpar) deixaria envios em `fila` sem campanha se o Freela recusasse o lote
  — e a rodada seguinte do outbox criaria uma **segunda** campanha para as
  mesmas pessoas;
- falhar ao espelhar **não** derruba a resposta (a campanha já está no Freela):
  vai um aviso no log. Dizer "não deu" para uma campanha que vai enviar é pior
  que o rastro faltando.

Só entram os destinatários que realmente subiram: telefone inválido ou repetido
no lote fica de fora (eles voltam contados em `invalid_phones` /
`duplicate_phones`). Daí para frente é a sincronização do §18.6 que resolve
`enviada`/`falhou`, grava o `msg_out` e o `last_contact_at` — mesmo caminho do
disparo, sem código novo.

Com **texto escrito na mão** (sem `template_id`) o envio é gravado igual, mas
não acumula trava nenhuma: a trava é por modelo e ali não há modelo. É o que a
própria caixa diz.

Público que **não** é `EXTERNAL_LIST` (os quatro da base do Freela) não gera
envio nenhum: aqueles destinatários não são leads do Praça.

### 18.8 Teste manual contra um api-freela local

O smoke (`scripts/smoke.sh`) roda com a conexão **desligada** — ele prova o 503
e a conversão do modelo, não a integração de verdade. Para provar a integração:

1. no `api-freela`, suba a API (`npm run start:dev`, porta 3000) com
   `ACTIVATION_CAMPAIGNS_ENABLED=true` e `CAMPAIGN_TEMPLATES_ENABLED=true`;
2. crie/garanta um admin com permissão `REFERRALS`
   (`POST /v1/admins/panel-users`);
3. no `praca/api/.env`: `FREELA_API_URL=http://localhost:3000`,
   `FREELA_ADMIN_EMAIL=<o admin>`, `FREELA_ADMIN_PASSWORD=<a senha>`; suba a API
   do Praça (`npm run start:smoke`);
4. `GET /v1/freela/status` → `configured: true`, `reachable: true`,
   `scheduler_enabled: true`;
5. crie uma campanha de teste com **um contato seu**:

```bash
curl -s -X POST localhost:3014/v1/freela/campaigns -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{
    "name":"Teste Praça","praca_id":"<uuid da praça>","audience":"EXTERNAL_LIST",
    "lead_filters":{"praca_id":"<uuid da praça>","stage":1},
    "template_id":"<uuid do modelo>","start_now":true }'
```

6. `GET /v1/freela/campaigns/:id` → `freela.campaign.status: "RUNNING"` e o seu
   número em `recipients`;
7. espere até 2 min: o relógio sincroniza, o `msg_send` vira `enviada` e o
   evento aparece na linha do tempo do lead (`GET /v1/leads/:id`);
8. `PATCH /:id/cancel` no fim, para não deixar campanha viva no Freela.

Para o caminho do disparo: `POST /v1/disparos` com `mode: "freela"` e espere a
rodada do outbox — o `disparos.freela_campaign_id` aparece quando a campanha é
criada.

**Estado deste teste (Task 24, 10/09/2026):** o caminho **sem conexão** está
verificado ponta a ponta, inclusive na tela (`/freela` mostra o cartão de
configuração nas três abas, com os botões de criar desligados; o diálogo de
campanha abre pré-preenchido pelo cartão de campanha e não deixa criar; o
disparo no modo `freela` mostra o 503 num aviso, sem quebrar a tela). O caminho
**com conexão** continua coberto só pelos testes de unidade e pelo smoke com o
Freela desligado: o passo a passo acima, contra um `api-freela` de verdade,
**está pendente para o dono** — subir a API do Freela nesta máquina junto com a
do Praça e o banco dele derruba a máquina de desenvolvimento (7,6 GB de RAM).
Ao rodar, registre aqui o resultado dos passos 4 a 8.

<a id="19-desvios"></a>

## 19. Desvios propositais em relação ao protótipo

Lista fechada: o spec do port (`docs/superpowers/specs/2026-09-09-praca-port-design.md`
§9) definiu os itens 1–12 antes de começar a implementação; os itens 13–23
foram decisões tomadas durante a implementação da API (Task 17), os 24–29
durante a implementação do web e no fechamento (Task 25) e os 30–33 na revisão
final da branch. Nenhum é bug — é
comportamento deliberado, diferente do protótipo Lovable de referência
(`.prototype/`).

1. Motor de cadências roda no servidor (`@Cron` a cada 15 s) — no protótipo só
   rodava com a aba Mensagens aberta. Ver [§14](#14-cadencias).
2. Regra de negócio (agenda, fila do dia, duplicidade de importação,
   indicadores, métricas de campanha) mora no servidor — a tela só exibe o que
   a API já calculou. Ver [§6](#6-pracas), [§9](#9-funil), [§10](#10-entrada),
   [§16](#16-indicadores).
3. Pessoas do protótipo (`people`) viraram contas (`users`) com login; o autor
   de toda ação (conclusão, comentário, adiamento, evento, aprovação) é quem
   está logado, não um seletor "agindo como". Ver [§3](#3-pessoas).
4. Dois modos de envio: `fila` (manual) e `freela` (delega ao sistema de
   campanhas do api-freela). Os modos "Meta oficial" e "provedor externo" do
   protótipo eram só campos de configuração sem envio de verdade — não
   entraram no port. Ver [§12](#12-mensagens), [§13](#13-disparos).
5. `?camp=<id>` no formulário público: o protótipo citava o parâmetro e nunca
   lia; aqui grava `leads.campanha_id` de verdade. Ver
   [§11](#11-formulario-publico).
6. O evento de mudança de etapa grava `stage_to` (inteiro) — o protótipo
   descobria a etapa fazendo `text.includes("7")`, o que também casava com
   "17". Ver [§9](#9-funil).
7. O lead de teste da cadência ("Testar comigo") é um lead válido marcado
   `is_test`, não um objeto com campos inexistentes via cast como no
   protótipo. Ver [§14](#14-cadencias).
8. Variáveis fixas do render (`link_video_caso`, `link_cadastro`, `funcao`,
   `valor`, `turno`, `dia_forte`) viram `app_settings.template_defaults`,
   editáveis em Configurações, em vez de constantes hardcoded no código. Ver
   [§12](#12-mensagens).
9. Indicadores manuais na visão Empresa somam os últimos valores por praça
   (contagens) ou tiram a média (`%`/`h`/`R$`) — o protótipo só lia a primeira
   praça da lista. Ver [§16](#16-indicadores).
10. O formulário público atribui o lead ao **primeiro usuário ativo** (por
    `sort`, `created_at`) — a consulta é global, não por praça: as contas são
    poucas e do mesmo time, e "quem atende o lead novo" não é atributo da praça
    (o protótipo pegava `people[0]` sem checar se estava ativo). E é limitado por
    IP. Ver [§11](#11-formulario-publico).
11. O JSON do IBGE (~500 KB) saiu do bundle do navegador e ficou na API,
    servido por UF (`GET /v1/geo/municipios?uf=`). Ver [§5](#5-geo).
12. Tema (`dark`/`light`) e praça ativa (`active_praca_id`) são por usuário, no
    banco — não mais estado solto de UI. Ver [§3](#3-pessoas).
13. `late` da agenda mostra a ocorrência perdida **mais antiga** dos últimos 7
    dias (é o comportamento real do código do protótipo, não o que a
    descrição do produto sugeria). Ver [§6](#6-pracas).
14. `origem` do lead é texto livre, 1 a 60 caracteres — o catálogo de origens é
    só sugestão de UI (autocomplete), não uma lista fechada validada no
    servidor. Ver [§9](#9-funil).
15. Desfazer importação (`POST /v1/imports/:id/undo`) não exige admin: é o
    botão de quem importou, na própria tela de Entrada. Ver
    [§10](#10-entrada).
16. As 5 cadências-modelo nascem **pausadas** no seed — o motor real, se
    ligado de cara, matricularia a base inteira de leads na primeira rodada de
    15 s. Ver [§14](#14-cadencias).
17. `sai_conversa` só rebaixa quem está **antes** da etapa 3 (ainda não
    avançou o funil de verdade); lead arquivado sai de qualquer cadência com
    motivo `arquivado`. Ver [§14](#14-cadencias).
18. `recontratacao` mantém a fórmula literal do protótipo (a base da etapa ≥ 6
    inclui leads perdidos — dá 62,5% no seed) e a meta mensal de clientes
    ativos é interpolada linearmente no dia do mês (1/dez/26 lê 430). Ver
    [§16](#16-indicadores).
19. `scheduled_at` do disparo exige ISO 8601 **com fuso** (`+00:00`/`Z`, nunca
    hora "solta"); `POST /v1/sends/:id/mark` num envio já respondido é
    recusado com `ALREADY_REPLIED`; duplo clique em "Confirmar" ao criar o
    disparo é serializado (advisory lock), não gera duas filas. Ver
    [§13](#13-disparos).
20. `traffic.criativos` aceita qualquer criativo da **mesma campanha** — o
    protótipo só filtrava a lista de checkboxes da tela, sem validar no
    servidor. `PUT` de campanha sem `status` no corpo mantém o status atual
    (não reseta para o default do DTO). Ver [§15](#15-midia).
21. `{{cidade}}` numa campanha `EXTERNAL_LIST` disparada para o Freela vira a
    cidade-sede da praça (é sempre uma cidade só, ao contrário de `{{nome}}` /
    `{{primeiro_nome}}`, que são por contato) — fora de `EXTERNAL_LIST` a
    variável não é suportada e cai em `unsupported_variables`. Ver
    [§18](#18-freela).
22. Formulário público: dois envios simultâneos do mesmo telefone são
    serializados por advisory lock (`praca_id`, `phone_key`) dentro da
    transação, nunca viram dois leads; o limite por IP é configurável
    (`PUBLIC_LEADS_PER_MINUTE`, env). Ver [§11](#11-formulario-publico).
23. `GET /v1/freela/status` responde **200** mesmo com o Freela desconfigurado
    (`configured: false`, sem inventar conta nem flag de servidor) — é a única
    rota de `/v1/freela/*` que **responde algo útil** sem conexão: as demais
    respondem `503 FREELA_NOT_CONFIGURED`. Três caminhos, porém, morrem **antes**
    de tocar o cliente do Freela, e por isso não dão 503: `POST
    /v1/freela/templates/upload` sem arquivo (`400 FILE_REQUIRED`) ou com tipo
    errado (`400 INVALID_FILE_TYPE`), e `POST /v1/freela/templates` com praça
    inexistente (`404 NOT_FOUND`) — validação de corpo vem primeiro em toda a
    API. Ver [§18](#18-freela).
24. Cadência nasce **pausada** (o protótipo criava despausada): com entrada
    automática, o motor de 15 s matricularia a base inteira antes de a pessoa
    terminar de montar os passos — quem liga é gente, pelo "Retomar" do cartão.
    Mesma razão do seed pausado (item 16). Quem garante é o **servidor**:
    `paused` ausente é `true` no `POST` e "mantém o atual" no `PUT`, para que
    editar o texto de um passo não despause a trilha. Ver
    [§14](#14-cadencias).
25. Motivo da perda (`lost_reason`) é **texto livre** de 1 a 120 caracteres: o
    `catalog.lost_reasons` é só a lista sugerida do diálogo de mudança de etapa,
    e escolher "outro" grava o texto digitado — não a palavra "outro". Mesma
    razão do item 14 (`origem`): lista fechada no servidor engessaria o que o
    time escreve na rua. Ver [§9](#9-funil).
26. `POST /v1/sends/:id/mark` num envio em modo `freela` é recusado com
    `409 FREELA_SEND`. Lá a fila não é do Praça: o outbox garimpa exatamente
    `mode: 'freela'` + `status: 'fila'` e a sincronização escreve
    `enviada`/`entregue` de lá para cá — marcar à mão tiraria o envio da
    garimpagem e ele nunca chegaria à campanha. `POST /v1/sends/:id/reply`
    continua liberado nos dois modos (a resposta do lead chega no WhatsApp de
    quem operou, não pelo Freela). No protótipo havia um botão só, sem modo.
    Ver [§13](#13-disparos) e [§18](#18-freela).
27. `POST /v1/disparos/preview` aceita **`text`** (texto escrito na mão, com
    variantes separadas por `---`) no lugar de `template_id` — exatamente um dos
    dois. É o que faz a caixa de campanha do Freela contar o mesmo público nos
    seus dois modos sem inventar um modelo. Com `text` **não há trava de 30
    dias** (ela é por modelo) e a criação do disparo continua exigindo
    `template_id`. Ver [§13](#13-disparos).
28. O **e-mail** de uma pessoa é só leitura depois de criada: nenhum `PATCH` do
    contrato troca e-mail (é a credencial de login, que o protótipo não tinha).
    Trocar de e-mail = criar outra conta e desativar a antiga. Ver
    [§3](#3-pessoas).
29. `template_defaults` (item 8) é um **bloco parcial de chaves fechadas**:
    `PATCH /v1/settings` aceita só as 6 chaves conhecidas — qualquer outra é
    `400 VALIDATION_ERROR` —, funde com o que já estava gravado (manda-se só a
    que mudou) e responde sempre as 6, caindo no padrão do catálogo no que
    estiver vazio. Ver [§12](#12-mensagens).
30. A campanha do Freela criada **pela tela** com `EXTERNAL_LIST` grava
    `msg_sends` no Praça, como o disparo em modo `freela` — não existe no
    protótipo (nem a tela do Freela existia), e é o que faz a trava de 30 dias
    por modelo acumular de verdade e o toque aparecer na ficha do lead. Com
    texto escrito na mão o envio é gravado igual, mas sem trava (ela é por
    modelo). Ver [§18.7](#18-freela).
31. O `<head>` por rota do protótipo (título, descrição e `og:` de cada tela)
    **não** foi portado: todas as telas do app servem o título da raiz
    (`PRAÇA — Freela Serviços`). O app é interno, atrás de login e sem
    indexação, e todas as páginas são `'use client'` — o ganho não pagava um
    `layout.tsx` por segmento. A única tela pública (o formulário) tem texto
    próprio na página.
32. `FreelaCampaign.stats` é **opaco**: é repasse cru do `counts` do Freela
    (hoje `{total, pending, sent, failed, skipped, contacted, registered}`), não
    um objeto do Praça. A tela lê as chaves com tolerância (minúsculas e
    maiúsculas) porque o Freela já mudou essa forma antes. Ver
    [§18.2](#18-freela).
33. `PUT` não move filho de praça: campanha com criativo ou tráfego recusa a
    troca de `praca_id` e entrada de tráfego recusa a troca de `campanha_id`
    (`409 CAMPANHA_HAS_CHILDREN`) — no protótipo o objeto era um só em memória e
    a questão não existia. Para mover, `/duplicate`. Ver [§15](#15-midia).

<a id="20-campo"></a>

## 20. Consultores de campo — `/v1/campo`, `/v1/consultores`

Consultor de campo é uma conta **separada** da equipe (tabela `field_consultants`,
login, token e telas próprios). Desenho: `docs/superpowers/specs/2026-10-08-consultores-de-campo-design.md`.

### 20.1 Sessão do consultor

- Token: JWT HS256 com o mesmo `JWT_SECRET`, **`aud: "campo"`**, `sub` = id do
  consultor, `tv` = `token_version`. Validade `CAMPO_JWT_EXPIRES_IN` (padrão `7d`).
- Isolamento nos dois sentidos: token de consultor em qualquer rota da equipe →
  `401 UNAUTHORIZED`; token da equipe em `/v1/campo/*` → `401 UNAUTHORIZED`.
- O consultor é relido a cada request: `active = false` → `401 UNAUTHORIZED`
  ("Conta desativada"); `tv` menor que o `token_version` do banco → `401
  UNAUTHORIZED` ("Sessão encerrada — entre de novo."). Desativar, "nova senha
  provisória" e trocar a senha sobem `token_version`.
- Com `must_change_password = true`, toda rota `/v1/campo/*` responde
  `403 PASSWORD_CHANGE_REQUIRED`, exceto `POST /auth/change-password` e `GET /me`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/v1/campo/auth/login` | `{email, password}` | `200 {access_token, consultant, must_change_password}` — público, 20/min por IP |
| POST | `/v1/campo/auth/change-password` | `{current_password, new_password}` (nova: 8–72) | `200 {access_token, consultant, must_change_password: false}` |
| GET | `/v1/campo/me` | — | `{consultant, channels}` |

Erros: `401 INVALID_CREDENTIALS`, `401 UNAUTHORIZED` (conta desativada),
`400 WRONG_PASSWORD` (senha atual não confere — **não** é 401, para não derrubar
a sessão), `400 SAME_PASSWORD`.

`CampoMeView` (`consultant`):

```json
{
  "id": "uuid", "name": "Ana Souza", "email": "ana@exemplo.com", "phone": "31999990000",
  "praca_id": "uuid", "praca_name": "Belo Horizonte + Contagem",
  "must_change_password": false,
  "freela_code": "ANASOU7K2P",
  "signup_url": "https://app.freelaservicos.com.br/cadastro?consultor=ANASOU7K2P"
}
```

`freela_code`/`signup_url` ficam `null` enquanto o código no Freela estiver
pendente; `signup_url` também é `null` sem `FREELA_WEB_URL`. `channels` é a lista
de "apps e canais" do questionário (§20.4, `settings/channels`).

### 20.2 Jornada

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/v1/campo/today` | — | `TodayView` |
| POST | `/v1/campo/journeys/start` | `{client_id, at, lat, lng, accuracy}` | `201 JourneyView` |
| POST | `/v1/campo/journeys/current/points` | `{points: [{client_id, at, lat, lng, accuracy}]}` (1–50) | `200 {accepted, duplicates}` |
| POST | `/v1/campo/journeys/current/end` | `{at, lat, lng, accuracy}` | `200 JourneyView` |

- Uma jornada aberta por vez (índice único parcial). `start` com um `client_id`
  já gravado devolve a mesma jornada (reenvio da fila); com outro `client_id` e
  jornada aberta → `409 JOURNEY_ALREADY_OPEN`.
- `points` é idempotente por `client_id` (repetido conta em `duplicates`). Sem
  jornada aberta → `409 NO_OPEN_JOURNEY`.
- `end` com visita aberta → `409 VISIT_OPEN`. Sem jornada aberta: se a última
  foi encerrada há menos de 24 h devolve ela com `200` (reenvio); senão
  `409 NO_OPEN_JOURNEY`.
- `day` da jornada = `todaySp(at)`. Antes de `start` e de `today`, jornadas de
  dias anteriores ainda abertas são fechadas como na meia-noite (§20.5).
- **Carimbo de hora:** `at` vale se estiver entre o início da jornada e
  agora + 2 min, e no máximo 24 h no passado; fora disso vale a hora de
  recebimento e o ponto/visita fica com `clock_adjusted: true`.

`JourneyView`: `{id, client_id, day, started_at, start_lat, start_lng, ended_at, end_lat, end_lng, auto_closed}`.

`TodayView`:

```json
{
  "day": "2026-10-08",
  "journey": { "id": "uuid", "client_id": "uuid", "day": "2026-10-08", "started_at": "…", "start_lat": -19.92, "start_lng": -43.93, "ended_at": null, "end_lat": null, "end_lng": null, "auto_closed": false },
  "journeys": [ "JourneyView de hoje, em ordem de início" ],
  "open_visit": "VisitView | null",
  "visits": [ "VisitView de hoje, em ordem de check-in" ],
  "counters": { "visits": 3, "cadastrou_qr": 1 }
}
```

### 20.3 Estabelecimentos e visitas

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/v1/campo/places?lat=&lng=` | — | `PlaceView[]` com localização num raio de 500 m, por distância (até 30) — **exige jornada aberta** |
| GET | `/v1/campo/places?q=` | — | `PlaceView[]` por nome (sem acento/caixa), não arquivados, até 20 |
| GET | `/v1/campo/places/similar?name=&lat=&lng=` | — | `PlaceView[]` com nome parecido a até 100 m — **exige jornada aberta** |
| POST | `/v1/campo/visits` | multipart (abaixo) | `201 VisitView` |
| PATCH | `/v1/campo/visits/:ref/answers` | `AnswersBody` parcial | `200 VisitView` |
| POST | `/v1/campo/visits/:ref/checkout` | `{at, lat, lng, accuracy}` | `200 VisitView` |
| GET | `/v1/campo/visits/:ref/photo` | — | bytes da foto (`Content-Type` da foto) |

Tudo só na praça do próprio consultor. `/places?lat&lng` e `/places/similar`
recebem localização e por isso exigem jornada aberta (`409 NO_OPEN_JOURNEY`);
`/places?q=` (sem posição) não exige. `/places` sem `q` e sem `lat`+`lng` →
`400 VALIDATION_ERROR`. `:ref` = `id` **ou** `client_id` da visita (a fila offline
só conhece o `client_id`); visita de outro consultor → `404 NOT_FOUND`.

`PlaceView`: `{id, name, address, stage, lat, lng, distance_m}` (`distance_m`
`null` quando a busca não tem posição).

**Check-in (`POST /visits`, multipart/form-data):** campos `client_id`, `at`,
`lat`, `lng`, `accuracy` e **um** de `lead_id` | `new_place` (JSON
`{"name", "address"}`), mais `confirm_new` (`"true"`/`"false"`, opcional) e o
arquivo `photo` (JPEG/PNG/WEBP pelos bytes, até 5 MB).

- Sem jornada aberta → `409 NO_OPEN_JOURNEY`; com visita aberta →
  `409 VISIT_ALREADY_OPEN`; `client_id` já gravado → devolve a mesma visita.
- Sem arquivo → `400 FILE_REQUIRED`; arquivo que não é JPEG/PNG/WEBP →
  `400 INVALID_FILE_TYPE`; acima de 5 MB → `413 FILE_TOO_LARGE`.
- `lead_id` fora da praça do consultor → `404 NOT_FOUND`. Estabelecimento com
  `lat/lng` a mais de 200 m do check-in → `far_from_place: true` (só marca).
- `new_place` cria o lead com `origem = "visita de campo"`, `classe = "alvo"`,
  `stage = 1`, a praça do consultor, `lat/lng` do check-in e o endereço digitado.
  Sem `confirm_new: true`, se houver nome parecido a até 100 m o lead nasce com
  `possible_dup: true` (o check-in feito sem sinal não pôde perguntar).
- Foto sem armazenamento configurado → `503 PHOTO_STORAGE_NOT_CONFIGURED`.

`AnswersBody` (todos opcionais; `null` limpa):
`interlocutor_name` (≤ 120), `interlocutor_role` (`dono|gerente|outro`),
`freela_status` (`ja_usa|cadastrou_qr|nao_cadastrou`), `interest`
(`alto|medio|baixo|nenhum`), `open_vagas` (0–500), `vaga_roles` (string[] ≤ 20),
`freelas_per_week` (0–1000), `channels` (string[] ≤ 20), `channel_other` (≤ 120),
`needs_followup` (bool), `followup_what` (≤ 300), `followup_date` (`YYYY-MM-DD`),
`notes` (≤ 2000). Visita encerrada → `409 VISIT_CLOSED`.

**Checkout:** exige o questionário completo — interlocutor (nome + cargo),
situação no Freela, interesse, vagas abertas (≥ 0; se > 0, ao menos uma função),
freelancers por semana (≥ 0), ao menos um canal (ou "outro" preenchido) e retorno
(sim/não; se sim, o quê + data ≥ hoje). Faltando → `422 ANSWERS_INCOMPLETE` com
a lista em `message` ("Falta responder: interesse, data do retorno."). Visita já
com checkout → `200` com ela (reenvio; nada é gravado de novo). Visita fechada à
meia-noite → `409 VISIT_AUTO_CLOSED`.

No checkout, numa transação: `lead_events` `kind = "visit"`,
`author_label = "Consultor: <nome>"`, texto com o resumo das respostas;
`decisor`/`decisor_role` ← interlocutor; `last_contact_at` ← checkout; lead em
"Lead novo" (1) ou "Contatado" (2) → "Conversa aberta" (3) com `stage_to: 3` no
evento e `stage_since` = dia do checkout; se pediu retorno, `next_step_what` /
`next_step_date` ← o pedido.

`VisitView`:

```json
{
  "id": "uuid", "client_id": "uuid", "journey_id": "uuid", "lead_id": "uuid",
  "lead_name": "Bar do Mercado", "possible_dup": false,
  "checkin_at": "…", "checkin_lat": -19.92, "checkin_lng": -43.93, "checkin_accuracy": 12,
  "distance_m": 40, "far_from_place": false, "photo_bytes": 412345,
  "checkout_at": null, "checkout_lat": null, "checkout_lng": null,
  "auto_closed": false, "clock_adjusted": false,
  "answers": { "interlocutor_name": null, "interlocutor_role": null, "freela_status": null, "interest": null,
               "open_vagas": null, "vaga_roles": [], "freelas_per_week": null, "channels": [], "channel_other": null,
               "needs_followup": null, "followup_what": null, "followup_date": null, "notes": null },
  "missing": ["nome de quem atendeu", "…"]
}
```

### 20.4 Equipe — `/v1/consultores`

Leitura: qualquer pessoa da equipe. Escrita: **admin** (`403 FORBIDDEN`).

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/` | — | `ConsultorListItem[]` (ativos primeiro, por nome) |
| POST | `/` | `{name, email, phone, cpf, praca_id, pix_key_type, pix_key}` | `201 {consultant, temp_password}` |
| GET | `/settings/channels` | — | `{channels}` |
| PUT | `/settings/channels` | `{channels}` (1–30, cada 1–80, sem repetir) | `{channels}` |
| GET | `/visits/:visitId/photo` | — | bytes da foto |
| GET | `/:id` | — | `ConsultorView` |
| PATCH | `/:id` | `{name?, email?, phone?, cpf?, praca_id?, pix_key_type?, pix_key?, active?}` | `ConsultorView` |
| POST | `/:id/reset-password` | — | `200 {temp_password}` |
| POST | `/:id/freela-sync` | — | `200 ConsultorView` |
| GET | `/:id/days/:day` | — | `{day, journeys: [JourneyView + points: PointView[]], visits: VisitView[]}` |
| DELETE | `/:id` | — | `{ok: true}` — apaga de vez (jornadas, pontos, visitas, fotos); para consultor de teste |

- `temp_password` (10 caracteres) aparece **só** nessa resposta; o consultor é
  obrigado a trocar no primeiro acesso.
- Erros: `400 INVALID_CPF`, `400 INVALID_PIX`, `409 EMAIL_IN_USE`,
  `409 CPF_IN_USE`, `404 NOT_FOUND` (praça ou consultor; id malformado também).
- `active: false` sobe `token_version` (derruba sessões abertas) e desativa o
  código no Freela; `active: true` reativa lá.
- `:day` fora de `YYYY-MM-DD` válido → `400 VALIDATION_ERROR`.

`ConsultorView`: `{id, name, email, phone, cpf, praca_id, praca_name, pix_key_type,
pix_key, active, must_change_password, freela_consultant_id, freela_code,
freela_sync_error, freela_synced_at, signup_url, created_by, created_at, updated_at}`.

`ConsultorListItem` = `ConsultorView` + `today: {status, visits, cadastros, last_point_at}`,
com `status` ∈ `em_jornada|encerrou|nao_iniciou` e `cadastros` = visitas de hoje
com `freela_status = "cadastrou_qr"` (declaração do consultor, não confirmação do Freela).

`PointView`: `{id, at, lat, lng, accuracy, kind, clock_adjusted}` com `kind` ∈
`start|track|checkin|checkout|end`.

### 20.5 Fechamento da meia-noite

`@Cron` às 00:05 de Brasília (processo único, como os outros relógios): toda
jornada de dia anterior (`day < todaySp()`) ainda aberta ganha `ended_at` = hora
do último ponto (ou o início, se não houver ponto) e `auto_closed: true`; as
visitas dela sem checkout ficam `auto_closed: true` ("sem checkout") e **não**
mexem no CRM. O mesmo fechamento roda, só para o consultor, antes de
`journeys/start` e de `today`.

### 20.6 Código no Freela

Ao criar o consultor o Praça chama `POST /v1/admins/consultants` no api-freela
(`name`, `email`, `phone` em `+55…` quando válido, `city`/`uf` da cobertura da
praça quando existirem, `notes = "Consultor de campo — Praça"`) e guarda
`freela_consultant_id` e `freela_code`. O Freela manda ao consultor um e-mail com
a senha do portal de consultores dele (decisão do dono: aceito).

- Falha (Freela fora, sem permissão `CONSULTANTS`, sem configuração) →
  `freela_sync_error` com a mensagem; o relógio de 2 min do Freela tenta de novo
  os pendentes; `POST /:id/freela-sync` tenta na hora.
- `409` do Freela (e-mail já usado): se o consultor de lá tiver o mesmo e-mail e
  `notes = "Consultor de campo — Praça"`, ele é adotado (o Freela criou e a
  resposta se perdeu); senão fica o erro fixo "O e-mail deste consultor já é usado
  por outro consultor no Freela — troque o e-mail aqui e tente de novo.", que o
  relógio **não** repete. Trocar o e-mail limpa o erro e tenta de novo.
- Ativar/desativar no Praça → `PATCH /v1/admins/consultants/:id {isActive}`;
  falha vira `freela_sync_error` e o relógio repete.
- Link do QR: `${FREELA_WEB_URL}/cadastro?consultor=${freela_code}`.

### 20.7 Fotos

`PHOTO_STORAGE=s3|disk` (padrão `s3` em produção, `disk` fora dela). S3: bucket
privado (`S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` —
chaves vazias = cadeia padrão do SDK). Disco: `PHOTOS_DIR` (padrão
`./uploads`, já no `.gitignore`). Chave `campo/<consultant_id>/<day>/<visit_id>.<jpg|png|webp>`.
A porta `PhotoStorage` tem `put(key, bytes, mime)` (3 argumentos, em toda
implementação), `get(key)` e `remove(key)`. A foto só sai pela API, que confere quem pede. Sem bucket/região em modo `s3`, a
API sobe e as rotas de foto respondem `503 PHOTO_STORAGE_NOT_CONFIGURED`.

### 20.8 Privacidade

CPF, chave Pix e localização só aparecem para a equipe e para o próprio
consultor. Localização só é recebida com jornada aberta.

### 20.9 Desvios propositais em relação ao spec

1. Evento do CRM com `kind = "visit"` (o do catálogo), não `"visita"`: assim conta como contato e tem rótulo.
2. Rota nova `GET /places/similar` e campo `confirm_new` no check-in; sem `confirm_new: true` o check-in nunca bloqueia, só marca `possible_dup`.
3. `:ref` das rotas de visita aceita `id` ou `client_id` (sempre do próprio consultor).
4. Reenvio: os POSTs que criam (`journeys/start`, `visits`) respondem `201` também no reenvio, com o mesmo objeto (pelo `client_id`); `checkout` de visita já fechada e `end` sem jornada aberta (última encerrada há menos de 24 h) respondem `200`.
5. `change-password` pede a senha atual; senha errada é `400 WRONG_PASSWORD` (401 derrubaria a sessão).
6. `403 PASSWORD_CHANGE_REQUIRED` cobrado no servidor em todo `/v1/campo/*` exceto `change-password` e `GET /me`.
7. `DELETE /v1/consultores/:id` (admin) apaga de vez, inclusive as fotos; a tela não oferece o botão.
8. `GET /v1/campo/me` devolve também `channels`.
9. Extensão da foto pelo tipo real (`.jpg`/`.png`/`.webp`); o `Content-Type` sai da extensão da chave; sem coluna nova.
10. S3 sem `S3_BUCKET`/`S3_REGION` não derruba o boot: rotas de foto respondem `503 PHOTO_STORAGE_NOT_CONFIGURED` e o log avisa na largada; chaves AWS vazias = cadeia padrão do SDK.
11. `FreelaClient` passa a lançar `FreelaHttpError` (subclasse de `BadGatewayException` com `freelaStatus`); `409` do Freela adota o consultor se for nosso, senão grava `EMAIL_DUPLICADO_NO_FREELA`, que o relógio não repete.
12. Ativar/desativar sincroniza com o Freela pelo mesmo caminho do código: falha vira `freela_sync_error` e o relógio de 2 min repete.
13. `DELETE /v1/pracas/:id` com consultores na praça → `409 PRACA_HAS_CONSULTANTS`.
14. `PhotoStorage` ganha `remove(key)` além de `put`/`get`.
15. `vitest@3.2.4` no web (só dev), para a lógica pura (fila offline, completude, redução da foto).
16. `leads` ganha `lat`/`lng` (como o spec manda), embora `pracas` use `lat`/`lon`.
17. Índices únicos parciais (`field_journeys_one_open_per_consultant`, `field_visits_one_open_per_consultant`) vivem só no SQL da migração: o Prisma 5.22 não os declara, então qualquer `prisma migrate dev` futura propõe `DROP INDEX` deles — apague essas linhas do SQL gerado antes de aplicar.

## 21. Áreas de atuação — `/v1/areas`

Área de atuação é a geometria do **trabalho de campo** (prospecção): um círculo
(centro + raio) dentro de uma praça. Uma praça pode ter várias ("Moema",
"Itaim"). Não substitui a cobertura do IBGE (§6): a praça "São Paulo – Moema" é
aberta **sem** `cobertura` (já permitido) e ganha áreas; `GeoService`, `/v1/geo/*`
e a lista `EXCLUIR` (São Paulo, Rio de Janeiro) não mudam. Desenho:
`docs/superpowers/specs/2026-10-19-prospeccao-rotas-automacao-design.md` §4.1.

`AreaView`:

```json
{
  "id": "uuid",
  "praca_id": "uuid",
  "name": "Moema",
  "lat": -23.6021,
  "lng": -46.6658,
  "radius_m": 1500,
  "active": true,
  "created_at": "2026-10-19T14:00:00.000Z"
}
```

| Método | Rota | Quem | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/v1/areas?praca_id=` | autenticado (equipe) | `praca_id` obrigatório | `AreaView[]`, ordem `created_at`; inclui as inativas |
| POST | `/v1/areas` | **admin** | `{praca_id, name, lat, lng, radius_m}` | `201 AreaView`; `active = true` |
| PATCH | `/v1/areas/:id?praca_id=` | **admin** | `{name?, lat?, lng?, radius_m?, active?}` | `AreaView` |

- Toda leitura/escrita de uma área filtra por `id` **e** `praca_id`: área de outra
  praça responde `404 NOT_FOUND` ("Área não encontrada."). `praca_id` não muda
  depois de criada (e mandá-lo no corpo do `PATCH` é `400`, campo desconhecido).
- Validação (`400 VALIDATION_ERROR`): `name` 1–80 caracteres (sem espaços nas
  pontas, único por praça ignorando maiúsculas e acentos →
  `409 AREA_NAME_TAKEN`); `radius_m` inteiro de **200 a 5000**; centro dentro do
  retângulo do Brasil (lat −33,75 a 5,30; lng −74,00 a −28,80). `lat`/`lng` e
  `radius_m` vêm sempre juntos de valor numérico; no `PATCH`, a validade do
  conjunto final é conferida no servidor.
- Praça inexistente ou `praca_id` malformado → `404 NOT_FOUND`.
- **Não há `DELETE`**: fases seguintes (busca, roteiro) referenciam a área;
  desativar (`active: false`) preserva o histórico.
- Rota fechada ao consultor de campo (sem `@CampoRoute()`): token `aud: "campo"` → `401`.
- Pertinência (regra única, `domain/area-rules.ts`): um ponto está na área quando
  a distância haversine até o centro é **≤** `radius_m`.
- Banco: `CHECK (radius_m BETWEEN 200 AND 5000)`, índice `(praca_id, active)`, FK
  para `pracas` com `ON DELETE CASCADE` (apagar a praça apaga as áreas).
- Sem variável de ambiente nem flag (leitura/cadastro puros, spec §10.1).

### 21.1 Desvios propositais

1. Rotas com `praca_id` em query em vez de aninhadas em `/v1/pracas/:id/areas`: segue o spec (`/v1/areas`) e deixa a checagem "área da praça" explícita.
2. Sem `DELETE` (ver acima).
3. A migração `field_areas` é gerada com `--create-only`; o `DROP INDEX` dos dois índices únicos parciais do bloco A é removido do SQL (§20.9, item 17).

---

## 22. Pesquisa automática de estabelecimentos — `/v1/place-searches`

F2 da prospecção. A equipe (**só admin**) escolhe uma **área de atuação** (§21) e os
tipos de estabelecimento; a API busca num provedor (OpenStreetMap/Overpass por padrão,
Apify atrás de flag), guarda os achados como **candidatos** e a pessoa revisa antes de
virarem leads. Desenho: `docs/superpowers/specs/2026-10-19-prospeccao-rotas-automacao-design.md`
§3 e §10; tela: `...-rotas-ux.md` §5.1.

Todas as rotas são `@AdminOnly()` e fechadas ao consultor de campo (sem `@CampoRoute()`).
Toda leitura/escrita filtra por `id` **e** `praca_id`: busca de outra praça é `404 NOT_FOUND`.

### 22.1 Tipos

| `types[]` | Etiqueta | OSM |
|---|---|---|
| `bar` | Bares | `amenity=bar\|pub` |
| `restaurante` | Restaurantes | `amenity=restaurant` |
| `lanchonete` | Lanchonetes | `amenity=fast_food` |
| `padaria` | Padarias | `shop=bakery` |
| `cafe` | Cafés | `amenity=cafe` |

### 22.2 `SearchRunView`

```json
{
  "id": "uuid",
  "praca_id": "uuid",
  "area_id": "uuid",
  "area_name": "Moema",
  "source": "osm",
  "types": ["bar", "restaurante"],
  "center": { "lat": -23.6021, "lng": -46.6658 },
  "radius_m": 1500,
  "status": "queued | running | done | error | cancelled",
  "found": 214,
  "novos": 150,
  "duplicados": 37,
  "descartados": 27,
  "truncated": false,
  "est_cost_usd": 0,
  "error": null,
  "cached": false,
  "requested_by": "uuid",
  "created_at": "2026-10-19T14:00:00.000Z",
  "started_at": "...",
  "finished_at": "...",
  "expires_at": "2026-10-26T14:00:00.000Z"
}
```

- `found` cresce durante a execução (progresso: "62 encontrados até agora"); os contadores
  `novos/duplicados/descartados` só fecham quando `status = done`.
- `truncated = true` quando passou de **300** resultados (ficam 300, os mais próximos do centro entre os
  que a fonte devolveu) ou quando a fonte parou no próprio teto (Overpass: 2.000 elementos por consulta,
  que vêm na ordem dos ids, não por distância). A tela pede para reduzir a área.
- `expires_at` = fim do cache de 7 dias (`finished_at` + 7 d); só existe em `done`.
- `error` é texto para pessoa (nunca URL, cabeçalho ou token).

### 22.3 Rotas

| Método | Rota | Corpo / query | Resposta |
|---|---|---|---|
| POST | `/v1/place-searches` | `{praca_id, area_id, types[], source?, refresh?}` | `202 SearchRunView` (nova, `queued`) ou `200 SearchRunView` com `cached: true` (busca igual concluída há < 7 dias) |
| GET | `/v1/place-searches/sources` | | `SourceView[]` (fontes deste servidor) |
| GET | `/v1/place-searches?praca_id=` | `praca_id` obrigatório | `SearchRunView[]`, as 20 mais recentes |
| GET | `/v1/place-searches/:id?praca_id=` | | `SearchRunView` (a tela consulta a cada 2 s enquanto `queued`/`running`) |
| GET | `/v1/place-searches/:id/candidates?praca_id=` | | `CandidateView[]`, ordem `distance_m` |
| POST | `/v1/place-searches/:id/cancel?praca_id=` | | `SearchRunView` (`cancelled`; só em `queued`/`running`, senão `409 RUN_NOT_CANCELLABLE`) |
| POST | `/v1/place-searches/:id/leads` | `{praca_id, candidate_ids[], owner_id?}` | `201 AddLeadsView` |

- `source`: `osm` (padrão) ou `apify`. `apify` com a flag desligada ou sem token →
  `422 SOURCE_UNAVAILABLE` ("A fonte Apify não está ligada neste servidor.").
- `types`: 1 a 5 valores distintos de §22.1 (`400 VALIDATION_ERROR`). `area_id` precisa ser da
  praça e estar `active` (`404` / `409 AREA_INACTIVE`).
- Cache: chave = hash de `lat`, `lng`, `radius_m` **da área no momento do pedido**, tipos
  ordenados e fonte. Só reaproveita busca `done` com `finished_at` < 7 dias. `refresh: true`
  ignora o cache. Mudar o centro/raio da área gera chave nova.
- Uma busca por vez no servidor (fila em memória, instância única). No boot, `queued`/`running`
  viram `error` com `"Interrompida: o servidor foi reiniciado."`.
- Overpass: `User-Agent` identificado (`PLACES_USER_AGENT`), timeout, 1 requisição por vez,
  intervalo mínimo entre requisições, `429`/`504` com espera crescente (respeita `Retry-After`);
  esgotadas as tentativas → `status = error`, "A busca não funcionou agora. Nada foi cobrado."

`SourceView` (a tela só oferece o que está `available` e avisa quando `paid`):

```json
{ "id": "osm", "label": "OpenStreetMap", "available": true, "paid": false }
{ "id": "apify", "label": "Google Maps (Apify)", "available": false, "paid": true,
  "max_places_per_run": 300, "monthly_cap": 3000, "used_this_month": 0, "est_cost_usd_per_run": 2.1 }
```

`est_cost_usd_per_run` = estimativa conservadora (US$ 7 por 1.000 lugares) para o teto da próxima busca.
`used_this_month` soma `reserved_places` das buscas Apify do mês de Brasília: ao iniciar, a busca reserva o
seu `limite` (cancelar ou estourar o tempo só aborta a nossa requisição, o actor segue cobrando no Apify).

`CandidateView`:

```json
{
  "id": "uuid",
  "name": "Bar do Chico",
  "category": "bar",
  "address": "Av. Ibirapuera, 88",
  "lat": -23.6,
  "lng": -46.66,
  "location_precision": "point",
  "distance_m": 480,
  "phone": "(11) 3333-4444",
  "website": null,
  "source": "osm",
  "status": "novo | duplicado | descartado | adicionado",
  "reason": "ja_na_praca | repetido_na_busca | parece_fechado | sem_nome | null",
  "lead_id": "uuid | null",
  "lead_name": "string | null",
  "selectable": true
}
```

- `status`/`reason` são **recalculados na leitura** para candidatos `novo` (um lead pode ter sido
  criado depois da busca, dentro dos 7 dias de cache): vira `duplicado / ja_na_praca` com `lead_id`.
- `selectable = status === 'novo'`. Duplicado, descartado e já adicionado não podem ser adicionados.
- Duplicidade contra leads existentes (regra única em `domain/places-rules.ts`): mesmo
  `source`+`source_ref`; mesmo telefone (9 últimos dígitos); nome+endereço iguais; ou
  `nomeParecido` a **≤ 100 m** de um lead com coordenada (mesma regra do bloco A).
  Dentro da própria busca vale `nomeParecido` ≤ 100 m (fica o primeiro por distância ao centro).
- Lead **arquivado** com o mesmo `source`+`source_ref` também conta como duplicado (o `UNIQUE` do banco vale
  para arquivado), os demais critérios só olham leads não arquivados.
- Descartados: `parece_fechado` (OSM `disused:*`/`abandoned:*`/`opening_hours=off`, Apify
  `permanentlyClosed`) e `sem_nome`.
- `location_precision`: `point` (coordenada pontual do provedor). Nunca se geocodifica por CEP/município.

`AddLeadsView`:

```json
{ "batch_id": "uuid", "created": 177, "skipped": [{ "candidate_id": "uuid", "reason": "ja_na_praca" }] }
```

- Transação única: os candidatos pedidos são reservados (`novo → adicionado`; se algum não está
  mais `novo`, ele vai em `skipped` com `reason` — duas pessoas clicando juntas não duplicam), os
  leads são criados pelo **mesmo caminho do módulo imports** (`ImportsService`): etapa 1, `classe`
  `alvo`, `origem = "pesquisa automática"`, `lat/lng`, `location_precision`, `source`/`source_ref`,
  `import_batch_id`, evento de nota, dono = `owner_id` ou rodízio do time ativo. Ninguém recebe mensagem.
- Até 300 `candidate_ids` por chamada; lista vazia ou sem nenhum `novo` → `400 VALIDATION_ERROR`/`409 NOTHING_TO_ADD`.
- **Cadências:** a criação do lead não envia mensagem, mas o lead nasce na etapa 1 (Lead novo) e o motor de
  cadências (`entry = stage_novo`) matricula qualquer lead novo não arquivado, sem filtro de praça ou origem — como
  na importação por arquivo. A tela avisa isso na confirmação; mudar a regra de entrada é decisão do dono.
- O lote aparece em `GET /v1/imports` (`file_name` = "Busca 19/10 · Moema (OSM)") e pode ser
  desfeito em 24 h como qualquer importação; o candidato mantém `lead_id` com `ON DELETE SET NULL`.

### 22.4 Variáveis de ambiente (zod em `env.validation.ts`)

| Variável | Padrão | Observação |
|---|---|---|
| `OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | trocar de instância sem deploy de código |
| `PLACES_USER_AGENT` | `praca-freela/1.0 (contato: tecnologia@freelaservicos.com.br)` | identificação exigida pelas instâncias públicas |
| `APIFY_ENABLED` | `false` | sem `APIFY_TOKEN` a flag fica inerte |
| `APIFY_TOKEN` | vazio | **segredo; o dono digita no servidor**, nunca em código/commit/docs |
| `APIFY_ACTOR_ID` | `compass~crawler-google-places` | |
| `APIFY_MAX_PLACES_PER_RUN` | `300` | teto por busca |
| `APIFY_MONTHLY_PLACES_CAP` | `3000` | teto do mês (Brasília), somando `reserved_places` das buscas Apify |

### 22.5 Banco

- `place_import_runs` (busca; `reserved_places` = lugares reservados no Apify) e `place_candidates` (achados); `leads` ganha `source`,
  `source_ref`, `location_precision` (todas nulas nos antigos) e `UNIQUE (source, source_ref)`
  (NULLs não conflitam). Migração aditiva.
- `place_candidates`: `UNIQUE (run_id, source, source_ref)`; FK `run_id` `CASCADE`; `lead_id`
  `SET NULL`; índice `(run_id, status)`.

### 22.6 Desvios propositais

1. O spec (§5) promove candidato a lead só ao entrar na rota (F3). Por pedido do dono a F2 cria o lead
   na revisão ("Adicionar N como leads"), com confirmação escrita na tela.
2. `UNIQUE(source, source_ref)` do spec ficou `UNIQUE(run_id, source, source_ref)` em `place_candidates`
   (o mesmo ponto do OSM aparece em buscas repetidas ou sobrepostas) e passou a `leads`, onde diz "este ponto já é lead".
3. `origem` = "pesquisa automática" (o UX diz "busca automática"; vale o pedido da F2).
4. Lead de busca pode ter **telefone vazio** (muito ponto do OSM não tem); a importação por arquivo exige telefone, esta não.
5. Sem `PLACES_SOURCES`/cadeia de fallback: a busca usa **uma** fonte por pedido (`source`).
6. "Bairro ou endereço" e "Desenhar no mapa" do UX dependem de geocodificação/mapa e ficam para depois; a F2 usa as áreas da F1.

---

## 23. Roteiro do dia — `/v1/campo/route`, `/v1/routes`

F3 da prospecção. Cada consultor tem **no máximo um roteiro ativo por dia** (dia de Brasília): a lista ordenada de estabelecimentos
(leads) a visitar, com horário estimado de chegada (ETA). A ordem sai de uma **heurística local, sem serviço externo**: vizinho mais
próximo + 2-opt sobre a distância haversine × `fator_desvio` (linha reta → rua), a pé a `velocidade_kmh`, respeitando a janela de
trabalho e o almoço. Desenho: `docs/superpowers/specs/2026-10-19-prospeccao-rotas-automacao-design.md` §4.2, §4.3 e §6.1.
(O spec numerava este contrato como §22; a F2 ocupou o §22 e a numeração das fases seguintes avança em um — ver §23.8.)

**Flag**: `FIELD_ROUTES_ENABLED` (padrão `false`). Desligada, `GET /v1/campo/route/today` responde `200 { enabled: false, route: null }`
(a tela Hoje consulta de 60 em 60 s e o fluxo do bloco A fica idêntico) e **todas as outras rotas deste capítulo** respondem
`404 ROUTES_DISABLED`. Não há `@Cron`: o roteiro nasce sob demanda.

### 23.1 Configuração — `GET/PUT /v1/consultores/settings/config`

Guardada em `app_settings.field_config` (JSON; a F5 acrescenta chaves aqui). Leitura: equipe. Escrita: **admin**, parcial (só as chaves
enviadas mudam), e grava `atualizado_por` (id) e `atualizado_em`. Ausente ou inválida no banco = padrão. Vale mesmo com a flag desligada.

| Chave | Padrão | Validação | Significado |
|---|---|---|---|
| `meta_diaria` | 30 | inteiro 1–100 | visitas planejadas por dia |
| `janela_inicio` / `janela_fim` | `"09:00"` / `"18:00"` | `HH:MM`, início < fim | horário de Brasília |
| `almoco_inicio` / `almoco_fim` | `"12:00"` / `"13:00"` | `HH:MM`, dentro da janela, início < fim | pausa do consultor |
| `minutos_por_visita` | 8 | inteiro 1–120 | tempo parado em cada visita |
| `velocidade_kmh` | 4.5 | número 1–15 | caminhada |
| `fator_desvio` | 1.3 | número 1–3 | linha reta → rua |
| `pool_fator` | 1.5 | número 1–5 | no automático: candidatas = meta × fator (reserva para pulos) |
| `dias_sem_revisitar` | 14 | inteiro 0–365 | automático: exclui lead visitado há menos dias |
| `estagio_maximo_rota` | 4 | inteiro 1–6 | automático: lead em estágio maior (cadastrado) fica fora |
| `gerar_ao_iniciar` | `false` | boolean | ao iniciar a jornada, a API monta o roteiro sozinha (se não houver) |
| `consultor_pode_gerar` | `false` | boolean | libera o botão "Montar meu dia" no celular |

Chave desconhecida ou valor fora da faixa → `400 VALIDATION_ERROR`. Resposta: o objeto completo com os padrões aplicados.

### 23.2 Tipos

`StopView`:

```json
{
  "id": "uuid", "route_id": "uuid", "lead_id": "uuid",
  "seq": 3, "kind": "planejada", "status": "pendente", "fixa": false,
  "eta": "11:40", "eta_min": 700, "planned_minutes": 8, "distance_m": 240,
  "name": "Padaria Bom Pão", "address": "R. Gaivota, 120", "phone": "(11) 99999-0000",
  "lat": -23.6021, "lng": -46.6658,
  "skip_reason": null, "skip_note": null, "deferred_to": null, "visit_id": null
}
```

- `kind`: `planejada` (entra na meta) | `reserva` (sobra para pulos; `eta` nulo).
- `status`: `pendente` | `visitada` | `pulada` | `adiada` | `descartada` (saiu do roteiro numa remontagem; só a equipe vê).
- `eta` = `"HH:MM"` de Brasília; `eta_min` = minutos desde 00:00 (nulos em `reserva`, `pulada`, `visitada`, `adiada para amanhã`).
- `distance_m` = distância estimada **de rua** até a parada anterior (haversine × `fator_desvio`); a primeira conta a partir do ponto de partida.
- `skip_reason`: `fechado` | `sem_dono` | `ja_cliente` | `outro` (com `skip_note` livre, até 200 caracteres).
- `deferred_to`: `tarde` (sai da vez; volta no fim do roteiro de hoje em "Refazer rota" e, acabando as pendentes, a tela a oferece como próxima parada) | `amanha` (sai de hoje; **o lugar continua reservado a este consultor no dia**, para outro consultor não receber o mesmo estabelecimento — o remanejamento para amanhã é manual da equipe, não há transferência automática). Quem decide é o servidor
  pela hora REAL da ação (`at`, com a regra de carimbo do §20 — a fila offline pode enviar horas depois): antes do fim do almoço = `tarde`, depois = `amanha`.
- Nome, endereço, telefone e coordenada são **fotografados** na criação da parada: corrigir o lead depois não reescreve o roteiro do dia.

`RouteView`:

```json
{
  "id": "uuid", "consultant_id": "uuid", "consultant_name": "Ana", "praca_id": "uuid",
  "day": "2026-10-20", "status": "ativa", "version": 2, "source": "equipe",
  "area_id": "uuid|null", "start": { "lat": -23.6, "lng": -46.66 },
  "params": { "meta_diaria": 30, "janela_inicio": "09:00", "janela_fim": "18:00", "almoco_inicio": "12:00",
              "almoco_fim": "13:00", "minutos_por_visita": 8, "velocidade_kmh": 4.5, "fator_desvio": 1.3 },
  "stops": ["StopView, ordem seq"],
  "plan": { "planned": 28, "reserve": 4, "walk_km": 7.8, "fits_meta": false, "not_fit": 0 },
  "progress": { "meta": 30, "done": 12, "skipped": 1, "deferred": 0, "pending": 15, "expected_now": 11, "delta": 1 },
  "generated_at": "2026-10-20T11:58:00.000Z", "updated_at": "..."
}
```

- `source`: `equipe` | `auto` (gerado ao iniciar a jornada) | `consultor` (botão "Montar meu dia").
- `plan.walk_km` = soma dos trechos de rua estimados das paradas planejadas pendentes (conta: Σ haversine × `fator_desvio`); `fits_meta` = a meta coube na janela;
  `not_fit` = quantos dos leads escolhidos pela equipe nem como reserva couberam (não foram gravados).
- `progress.done` conta paradas `visitada`; pulada e adiada **não** contam. `expected_now` = quantas já deveriam estar feitas agora (minutos úteis decorridos
  — janela menos almoço — ÷ minutos úteis por visita, `floor`); `delta` = `done − expected_now` (positivo = à frente). `done`/`delta` ignoram visitas avulsas; a tela do
  consultor soma as visitas do dia (`GET /v1/campo/today`) por conta própria.

### 23.3 Consultor — `@CampoRoute()`, só o roteiro do próprio consultor

Roteiro, parada ou id de outro consultor → `404 NOT_FOUND` (nunca `403`).

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/v1/campo/route/today` | — | `200 { enabled, route: RouteView \| null, can_generate }` — `can_generate` = sem roteiro hoje e a equipe liberou o botão "Montar meu dia" (`consultor_pode_gerar`) |
| POST | `/v1/campo/route/generate` | `{client_id, lat, lng}` | `200 RouteView`. Se já existe roteiro ativo hoje, devolve ele (idempotente). Sem ele: exige `consultor_pode_gerar` (senão `403 ROUTE_GENERATE_NOT_ALLOWED`); sem leads elegíveis → `422 ROUTE_NO_CANDIDATES` |
| POST | `/v1/campo/route/reoptimize` | `{client_id, lat, lng, at?}` | `200 RouteView`. Mantém as visitadas, refaz a ordem das pendentes (e traz reservas / adiadas da tarde) a partir da posição e da hora; sobe `version`. Sem roteiro hoje → `404 ROUTE_NOT_FOUND` |
| POST | `/v1/campo/route/stops/:id/skip` | `{client_id, reason, note?, at?}` | `200 RouteView`. `pendente`/`adiada` → `pulada`. Não troca a ordem; só recalcula os ETAs |
| POST | `/v1/campo/route/stops/:id/defer` | `{client_id, at?}` | `200 RouteView`. `pendente` → `adiada` (`deferred_to` pela hora do servidor, ver acima) |
| POST | `/v1/campo/route/stops/:id/undo` | `{client_id, at?}` | `200 RouteView`. `pulada`/`adiada` → `pendente` na posição original. `409 STOP_NOT_UNDOABLE` se já `visitada`/`descartada`; `409 STOP_TAKEN` se outro consultor já ficou com o lugar hoje |

- **Idempotência**: `client_id` (uuid do aparelho) de `reoptimize`/`skip`/`defer`/`undo` fica gravado em `field_route_events` (único). Reenvio com o mesmo
  `client_id` do mesmo consultor devolve o roteiro atual sem refazer; de outro consultor → `409 CLIENT_ID_IN_USE`. `at` é a hora real do aparelho
  (mesma regra de carimbo do §20: fora de −24 h/+2 min vale a hora do recebimento). Estas ações **não tocam em `leads` nem em `lead_events`** (nem "Já é cliente").
- `skip`/`defer`/`undo` em parada `visitada` → `409 STOP_NOT_PENDING`; `skip` em parada já `pulada` com o mesmo `client_id` é o reenvio (200).
- **Concorrência**: `reoptimize` e a edição da equipe atualizam o roteiro com trava otimista em `version`; quem perde relê e tenta de novo uma vez.
- **Check-in numa parada** (`POST /v1/campo/visits`, §20.3): com a flag ligada, a parada `pendente`/`adiada` do mesmo lead no roteiro ativo **do dia da jornada** vira `visitada`
  com `visit_id`, na mesma transação do check-in. Não exige que seja a próxima. Check-in em lead fora do roteiro continua permitido (visita avulsa).
- **Início da jornada** (`POST /v1/campo/journeys/start`): com a flag ligada e `gerar_ao_iniciar`, depois de gravar a jornada a API tenta montar o roteiro `auto`
  (leads das áreas ativas da praça, com localização exata, vizinho-mais-próximo encadeado). Qualquer falha é registrada no log e **nunca** faz o `start` falhar.

### 23.4 Equipe — `/v1/routes` (sem `@CampoRoute()`: token de consultor → `401`)

Leitura: equipe. Escrita: **admin**.

| Método | Rota | Corpo / query | Resposta |
|---|---|---|---|
| GET | `/v1/routes?day=&praca_id=` | `day` (padrão hoje), `praca_id` opcional | `RouteView[]` do dia (planejado × realizado: `progress` e `stops` com status e motivos) |
| GET | `/v1/routes/candidates?praca_id=&day=&area_id=&q=&limit=` | `limit` ≤ 200 (padrão 100) | `CandidateView[]`: leads da praça com localização exata, não arquivados, fora do roteiro de outro consultor no dia |
| POST | `/v1/routes` | `{consultant_id, day, lead_ids[], area_id?, start?: {lat,lng}}` | `201 RouteView`. Cria o roteiro do dia **ou substitui o conjunto** do ativo (mantém as paradas `visitada`; o que sai vira `descartada`; `version`+1) |
| GET | `/v1/routes/:id` | — | `RouteView` |
| PUT | `/v1/routes/:id/order` | `{version, stops: [{id, fixa?}]}` | `RouteView`. Define a ordem das paradas pendentes/reserva e quais ficam **fixas**; recalcula ETAs. `409 ROUTE_VERSION_CONFLICT` se a versão mudou |
| POST | `/v1/routes/:id/reoptimize` | `{lat?, lng?}` | `RouteView`. Refaz as pendentes respeitando as fixas, a partir da posição (padrão: última visitada ou o ponto de partida) |

`CandidateView`: `{ id, name, address, lat, lng, stage, source, category?, in_area }`.

- **Fixa** = âncora: a parada mantém a posição na sequência; o resto é reordenado **dentro de cada trecho entre duas fixas** (o trecho é o que está entre elas na ordem atual).
  Visitadas ficam sempre à frente, na ordem em que aconteceram.
- Regras de montagem (`POST /v1/routes`): `consultant_id` ativo; `day` de hoje em diante (Brasília); cada `lead_id` precisa ser **da mesma praça do consultor**, ter `lat/lng`, não estar
  arquivado e não estar em roteiro de outro consultor no dia (`409 LEAD_IN_OTHER_ROUTE`, com a lista); `area_id`, se vier, é da praça (senão `404 NOT_FOUND`). Ponto de partida padrão:
  centro da área, senão o primeiro lead. `lead_ids` repetidos contam uma vez; 1–200 itens. Leads de outra praça → `400 VALIDATION_ERROR` ("lead_ids: … não pertencem à praça do consultor").
- A equipe escolhe **leads existentes** (os candidatos da busca da F2, §22, que já viraram lead em "Adicionar N como leads"); a parada guarda `candidate_id` quando o lead veio de uma busca.
  Montar roteiro **não cria lead**, não mexe em estágio e não dispara cadência.
- A lista cabe até a meta e a janela; o que sobra vira `reserva` (até 10) e o restante vem em `plan.not_fit`.

### 23.5 Banco

Migração aditiva `field_routes`: `app_settings.field_config`; `field_routes` (`UNIQUE` parcial `field_routes_one_active_per_day (consultant_id, day) WHERE status = 'ativa'`);
`field_route_stops` (`UNIQUE` parcial `field_route_stops_lead_day_unique (lead_id, day) WHERE status IN ('pendente','visitada','adiada')`: dois consultores nunca recebem o mesmo lugar
no dia; FK `lead_id` `RESTRICT`; `visit_id` e `candidate_id` `SET NULL`); `field_route_events` (histórico append-only de pular/adiar/desfazer/refazer, `client_id` único).
Os dois índices parciais vivem só no SQL — **entram no grupo de risco do §20.9, item 17**: gere a próxima migração com `--create-only` e apague os `DROP INDEX` deles.

### 23.6 Variáveis de ambiente

| Variável | Padrão | Observação |
|---|---|---|
| `FIELD_ROUTES_ENABLED` | `false` | liga todo o capítulo; o parâmetro de negócio fica em `field_config` (§23.1) |

### 23.7 Offline (web do consultor)

O roteiro do dia é guardado no IndexedDB do aparelho (`praca-campo`, loja `roteiro`) e mostrado sem sinal. `skip`, `defer`, `undo` e `reoptimize` entram na **fila offline**
existente com `client_id` e `at`. "Refazer rota" sem sinal reordena **no aparelho** pelo mais próximo em linha reta (aviso na tela) **e** enfileira o `reoptimize`; a ordem local nunca é a
autoridade — quando o servidor responde, a resposta substitui o guardado.

### 23.8 Desvios propositais

1. Seção §23 (e não §22) e flag `FIELD_ROUTES_ENABLED`, como na tabela de env do spec; rotas como no spec (`/route/*`), mais `defer`/`undo`, que o UX exige.
2. `swap-reserve` do spec fica para depois: a reserva entra sozinha em `reoptimize`.
3. Sem "obrigatórias primeiro" nem seleção por retornos/leads quentes (F5, que depende de `field_config` estendida); a seleção automática usa só os filtros do §23.1.
4. Montar roteiro usa **leads existentes**; o spec previa promover candidato na hora (§5). A F2 já cria o lead na revisão.
5. O horário "de Brasília" é calculado em minutos desde 00:00 a partir da hora real do pedido; um roteiro de outro dia usa `janela_inicio` como partida.
6. `minutos_por_visita` é o padrão da configuração; a mediana real do consultor (spec §4.3) fica para a F5.
7. Pular não reotimiza sozinho (o spec lista o pulo como gatilho): reordenar sob o dedo do consultor atrapalharia o "Desfazer"; só os ETAs são recalculados. "Refazer rota" é explícito.

## 24. Mapa de calor e cobertura — `GET /v1/consultores/heatmap`

F4 da prospecção. Uma rota só, **leitura**, agregada em **grade** no servidor: a resposta traz células (centro + contagens), **nunca**
coordenadas de pontos de GPS, de check-ins nem de leads. Desenho: spec `2026-10-19-prospeccao-rotas-automacao-design.md` §6.2 e UX §5.3.
(O spec numerava este contrato como §23; a numeração avança em um — ver §24.7.) Sem flag e sem variável de ambiente: leitura pura.

Acesso: **equipe** (admin e não admin). Está no bloco estático do `ConsultoresController` (antes de `:id`), sem `@AdminOnly()` e **sem**
`@CampoRoute()`: token de consultor de campo → `401` — o consultor nunca vê o calor de ninguém, nem o dele.

### 24.1 Parâmetros (query)

| Parâmetro | Obrigatório | Regra |
|---|---|---|
| `praca_id` | sim | uuid de praça existente (`404 NOT_FOUND` se não existe) |
| `layer` | não (`visitas`) | `passagem` \| `visitas` \| `cobertura` |
| `from`, `to` | não | `YYYY-MM-DD` (dia de Brasília, existente no calendário); `to` padrão = hoje (`todaySp`), `from` padrão = `to`; `from ≤ to`; **no máximo 92 dias** (inclusive). Filtra por `field_journeys.day` |
| `consultant_id` | não | uuid de consultor **da `praca_id`**; de outra praça ou inexistente → o mesmo `404 NOT_FOUND` |
| `area_id` | não | uuid de área **da `praca_id`**; de outra praça ou inexistente → o mesmo `404 NOT_FOUND`. Restringe ao círculo da área |
| `cell_m` | não (`250`) | lado da célula em metros: `100`, `250`, `500` ou `1000` |
| `bbox` | não | `sul,oeste,norte,leste` (graus decimais): recorta o que a tela está vendo. Dentro do Brasil, `sul < norte`, `oeste < leste`, no máximo 3° de lado |

Erro de parâmetro: `400 VALIDATION_ERROR` (formato único do §1). A equipe enxerga todas as praças (o `AuthUser` não tem escopo por praça); o
isolamento é pelo `praca_id` obrigatório: nada de outra praça entra na conta.

### 24.2 Camadas

| `layer` | Fonte | Praça da linha | Célula |
|---|---|---|---|
| `visitas` | `field_visits.checkin_lat/lng` das jornadas do período | `leads.praca_id` do estabelecimento visitado | `n` = visitas, `leads` = estabelecimentos distintos |
| `passagem` | `field_points` das jornadas do período | `consultant.praca_id` do dono da jornada (ponto não tem praça: quem mudou de praça leva o trajeto antigo para a nova) | `n` = pontos gravados, `minutes` = pontos `track` × 5 (**aproximado**) |
| `cobertura` | `leads` da praça com lat/lng × visitas do período | `leads.praca_id` | `total` = leads, `visited` = com ao menos 1 visita no período, `n` = `total − visited` ("falta visitar") |

- **Passagem não é trajeto.** O ponto só é gravado no início/fim, em check-in/check-out e a cada ~5 min **com a tela aberta**; o campo `note`
  da resposta repete o aviso e a tela o exibe sempre.
- **Cobertura**: entram leads `archived = false`, `is_test = false`, com `lat`/`lng` e `location_precision IN ('point','address')` (mesma regra
  do roteiro, §23: coordenada de centro de cidade ou de precisão desconhecida não vira "célula brilhante falsa"). "Visitado" conta visita de
  **qualquer** consultor da praça no período: `consultant_id` **não** filtra esta camada (cobertura é da praça), e a resposta devolve `consultant_id: null`.
- `consultant_id` filtra `visitas` e `passagem`. `area_id` filtra as três (ponto/lead dentro do círculo).

### 24.3 Grade e limites

- Célula = retângulo alinhado à origem (0°,0°): `i = floor(lat/Δlat)`, `j = floor(lng/Δlng)`, `Δlat = m/111320`, `Δlng = m/(111320·cos(latRef))`, com
  `latRef` = latitude de referência **arredondada ao grau** do centro (do `bbox`, senão do centro da praça/área, senão −15°). A grade não "anda" com o zoom.
- Limite de **5.000 células** por resposta. Passou: o servidor refaz com a próxima célula maior (100→250→500→1000); se ainda passar, devolve as
  5.000 de maior peso e `truncated: true`. `cell.m` diz o tamanho **usado**; `requested_cell_m`, o pedido.
- A agregação é `GROUP BY` no banco; nenhuma linha de ponto é carregada na aplicação.

### 24.4 Resposta `HeatmapView`

```json
{
  "layer": "cobertura", "praca_id": "uuid", "consultant_id": null, "area_id": null,
  "from": "2026-10-12", "to": "2026-10-19",
  "requested_cell_m": 250, "cell": { "m": 250, "dlat": 0.0022457, "dlng": 0.0024395 }, "lat_ref": -23,
  "cells": [ { "lat": -23.6012, "lng": -46.6655, "n": 4, "total": 6, "visited": 2 } ],
  "max": 9, "truncated": false,
  "summary": { "leads_total": 140, "leads_visited": 87, "leads_missing": 53, "percent": 62 },
  "note": null
}
```

`cells[].lat/lng` = **centro da célula** (múltiplo da grade, não ponto real). Campos por camada: `visitas` → `{lat,lng,n,leads}`; `passagem` →
`{lat,lng,n,minutes}`; `cobertura` → `{lat,lng,n,total,visited}`. `max` = maior `n` (a tela normaliza a cor por ele).
`summary` por camada: `visitas` → `{ visits, leads, consultants: [{ id, name, visits }] }`; `passagem` → `{ points, minutes }`;
`cobertura` → `{ leads_total, leads_visited, leads_missing, percent }` (`percent` inteiro, `0` se `leads_total = 0`). O resumo é do
**filtro inteiro** (período + área + consultor), não só do recorte do `bbox`. `note` = aviso de precisão da camada `passagem`, `null` nas outras.

### 24.5 Banco

Migração aditiva `field_visits_lead_id_idx` (`field_visits (lead_id)`): a camada `cobertura` procura visitas por estabelecimento e a FK não tinha índice.
Gere com `migrate diff` e **apague todos os `DROP INDEX`** dos quatro índices parciais (`field_journeys_one_open_per_consultant`, `field_visits_one_open_per_consultant`,
`field_routes_one_active_per_day`, `field_route_stops_lead_day_unique`) — §20.9 item 17 e §23.5.

### 24.6 Privacidade

Localização individual só da equipe, só de jornadas abertas pelo próprio consultor (já avisado a ele). A resposta não carrega id de ponto/visita/lead nem
coordenada crua; com `cell_m = 100` e um consultor filtrado a célula ainda mostra "por onde ele andou", por isso a rota é só da equipe.

### 24.7 Desvios propositais

1. Seção §24 (não §23) — a F2 e a F3 avançaram a numeração.
2. Sem pinos de visita nem tooltip com nome do estabelecimento (UX §5.3): isso exigiria coordenada/identificador de visita na resposta; a tela mostra só a grade e uma tabela "quadras" equivalente.
3. Filtro de consultor único (não multi-seleção) — a multi-seleção fica para depois.
4. Sem amostragem "por quadra de 25 m" para >50 mil pontos: a agregação em grade no banco torna o volume irrelevante para a resposta.
5. Job de retenção dos pontos `track` (spec §6.2) **não** faz parte da F4.

## 25. Metas, alertas e retornos — `/v1/consultores/attention`, `/v1/consultores/followups`, `/v1/campo/followups`

F5 da prospecção. Tudo é **calculado na hora da leitura** (regras puras em `api/src/domain/alerta-rules.ts` e `followup-rules.ts`): **sem
`@Cron`, sem tabela nova, sem migração, sem variável de ambiente e sem flag**. Os alertas existem **só dentro da tela** (a lista de
consultores já consulta de 60 em 60 s); nada sai por WhatsApp, e-mail ou push, porque esses canais estão fora do ar. "Ligar" e "Chamar no
WhatsApp" são links `tel:` / `wa.me` que a própria pessoa abre. (O spec previa a tabela `field_alerts` para não repetir o aviso e jobs a cada
5 min; calculado sob demanda o alerta some sozinho quando a causa some e não há o que repetir — ver §25.8.)

Acesso: `attention` e `followups` da equipe são **leitura de equipe** (admin ou não), sem `@AdminOnly()` e **sem** `@CampoRoute()` (token de
consultor → `401`). `/v1/campo/followups` é `@CampoRoute()` e mostra **só os retornos das visitas do próprio consultor**.

### 25.1 Configuração — mesmas rotas do §23.1 (`GET/PUT /v1/consultores/settings/config`)

Chaves novas em `app_settings.field_config` (parciais, `PUT` só admin, ausente/inválida = padrão; a resposta traz o conjunto completo):

| Chave | Padrão | Validação | Significado |
|---|---|---|---|
| `alerta_inicio_apos_min` | 30 | inteiro 0–240 | "não iniciou": alerta quando `agora ≥ janela_inicio + N min` e ainda não há jornada hoje |
| `alerta_visita_aberta_min` | 40 | inteiro 5–480 | visita com check-in e sem checkout há mais de N min |
| `alerta_sem_registro_min` | 30 | inteiro 5–480 | jornada aberta sem nenhum registro (ponto/check-in/checkout) há mais de N min. O spec dizia 25 e o UX 30: vale 30 |
| `alerta_ritmo_atras` | 5 | inteiro 1–100 | ritmo atrasado: `feitas − esperadas ≤ −N` visitas |
| `alerta_parada_vencida_min` | 30 | inteiro 5–240 | parada pendente do roteiro cujo ETA passou há mais de N min (só com `FIELD_ROUTES_ENABLED=true` e roteiro ativo) |
| `dias_trabalho` | `[1,2,3,4,5,6]` | lista de inteiros 0–6 sem repetir, ao menos 1 (0 = domingo, 6 = sábado, dia da semana de Brasília) | fora desses dias não há alerta nem cobrança de ritmo |
| `retornos_no_roteiro` | `true` | boolean | o roteiro automático (§23.3) leva os retornos vencidos do consultor como paradas prioritárias (§25.6) |

Os horários (`janela_*`, `almoco_*`) e a meta (`meta_diaria`) são os do §23.1 — a mesma conta do roteiro. Chave desconhecida ou fora da faixa → `400 VALIDATION_ERROR`.

### 25.2 `GoalView` — meta e ritmo (com a conta e a fonte)

```json
{
  "meta": 30, "feitas": 8, "esperadas": 17, "delta": -9, "faltam": 22,
  "minutos_uteis": 280, "minutos_por_visita_ritmo": 16, "dia_de_trabalho": true,
  "conta": "30 visitas em 8 h úteis (09:00–18:00, menos 1 h de almoço) = 1 a cada 16 min. Às 14:40 já deveriam ser 17 (280 min úteis ÷ 16 min); feitas: 8.",
  "fonte": "Feitas = visitas com check-in nas jornadas de hoje (inclui a aberta e as sem checkout; pulada ou adiada do roteiro não conta). Meta e horários = configuração do roteiro."
}
```

- `feitas` vem de `field_visits` das jornadas do dia (Brasília), **não** das paradas do roteiro: vale visita avulsa e funciona com a flag de roteiro desligada.
  É o mesmo número da tela Hoje (`counters.visits`) e do card do roteiro (UX §4.2: meta de visitas, não de paradas).
- `esperadas = min(meta, floor(minutos_uteis ÷ minutos_por_visita_ritmo))`, com `minutos_uteis` = tempo decorrido da janela menos o almoço (mesma função `ritmo()` do §23).
- `delta > 0` = à frente. `faltam = max(meta − feitas, 0)`. `dia_de_trabalho = false` (hoje fora de `dias_trabalho`) → a tela não cobra ritmo.

### 25.3 `GET /v1/consultores/attention` — "Atenção agora" e meta da equipe

Query: `praca_id` (uuid, opcional). Dado, restringe aos consultores **ativos** daquela praça (`404 NOT_FOUND` se a praça não existe); ausente, todas
(a equipe enxerga todas as praças — mesma regra do §24).

```json
{
  "day": "2026-10-20", "generated_at": "2026-10-20T12:42:10.000Z", "now": "09:42", "dia_de_trabalho": true,
  "thresholds": { "alerta_inicio_apos_min": 30, "alerta_visita_aberta_min": 40, "alerta_sem_registro_min": 30, "alerta_ritmo_atras": 5, "alerta_parada_vencida_min": 30 },
  "alerts": [ { "code": "nao_iniciou", "severity": "alta", "consultant_id": "uuid", "consultant_name": "Bruno Lima", "praca_id": "uuid", "praca_name": "São Paulo",
                "phone": "(11) 99999-0000", "message": "Bruno Lima — não iniciou a jornada (começa às 09:00; agora 09:42).",
                "conta": "Janela começa às 09:00 + 30 min de tolerância = 09:30. Agora são 09:42 e não há jornada hoje.", "since": null } ],
  "consultants": [ { "consultant_id": "uuid", "name": "Ana Souza", "praca_id": "uuid", "praca_name": "São Paulo", "phone": "(11) 98888-0000",
                     "status": "em_jornada", "goal": { "...": "GoalView" }, "alerts": [] } ]
}
```

Códigos de alerta (`code`), na ordem de exibição de mesma severidade; `severity` ∈ `alta|media`; um consultor pode ter vários:

| `code` | Severidade | Dispara quando (consultor ativo, dia de trabalho, jornada de hoje não encerrada) |
|---|---|---|
| `nao_iniciou` | alta | sem jornada hoje e `janela_inicio + alerta_inicio_apos_min ≤ agora < janela_fim` |
| `sem_registro` | alta | jornada aberta e há mais de `alerta_sem_registro_min` desde o último registro (maior entre ponto, check-in, checkout e início da jornada). Texto honesto: "pode ser tela apagada". **Suprimido** se há visita aberta (o alerta de visita aberta cobre) |
| `visita_aberta` | media | check-in sem checkout há mais de `alerta_visita_aberta_min` |
| `ritmo_atrasado` | media | jornada aberta, `janela_inicio ≤ agora ≤ janela_fim` e `delta ≤ −alerta_ritmo_atras` |
| `parada_vencida` | media | jornada aberta e há paradas `pendente`/`planejada` do roteiro ativo de hoje com `eta + alerta_parada_vencida_min < agora` (≤ `janela_fim`). Uma linha por consultor, com a contagem e a primeira |

- `since` = instante (ISO) a partir do qual a condição vale (check-in, último registro…) ou `null`. `conta` = a conta feita, com os números e a fonte, em frase.
- Consultor que **encerrou** a jornada, desativado, ou em dia fora de `dias_trabalho` não gera alerta. Cada consultor ativo aparece em `consultants` (com `goal`).
- `alerts` é a lista plana já ordenada (severidade, depois nome do consultor, depois `code`); `consultants[].alerts` é a mesma, por pessoa.
- O telefone é o do cadastro do consultor (para o `tel:`/`wa.me` abertos pela equipe).
- **"Fora de rota"** (distância da última posição à próxima parada) **não** foi feito: o ponto só é gravado com a tela aberta a cada ~5 min, e acusar o consultor por um ponto velho gera falso alarme (§25.8).

### 25.4 Retornos (follow-up)

`FollowupView`:

```json
{
  "visit_id": "uuid", "lead_id": "uuid", "lead_name": "Padaria Bom Pão", "phone": "(11) 99999-0000", "address": "R. Gaivota, 120",
  "consultant_id": "uuid", "consultant_name": "Ana Souza", "praca_id": "uuid",
  "followup_what": "Levar o contrato", "followup_date": "2026-10-19", "due": "atrasado", "days_late": 1,
  "visited_at": "2026-10-15T14:00:00.000Z", "interlocutor_name": "Marta", "interest": "alto"
}
```

Resposta: `{ day, today: n, overdue: n, total: n, truncated: bool, items: FollowupView[] }`, ordenada por `followup_date` (mais antigo primeiro), depois nome. Máximo 200 itens
(`truncated: true` se houver mais; `today`/`overdue`/`total` contam todos os pendentes **lidos**, não só os 200 devolvidos). A leitura olha as 1.000 visitas com retorno vencido mais antigas.

| Método | Rota | Quem | Escopo |
|---|---|---|---|
| GET | `/v1/consultores/followups?praca_id=` | equipe | leads da praça (`leads.praca_id`); sem `praca_id`, todas; praça inexistente → `404` |
| GET | `/v1/campo/followups` | consultor (`@CampoRoute()`) | só visitas com `consultant_id` = o próprio. Retorno de outro consultor **nunca** aparece (mesmo na mesma praça) |

Um retorno está **pendente** quando valem todas: (1) é a visita **mais recente** daquele lead (qualquer visita posterior de qualquer consultor o resolve);
(2) tem checkout de verdade (`checkout_at` preenchido — visita aberta ou "sem checkout" guarda só rascunho das respostas; o checkout é quem as valida); (3) `needs_followup = true`
e `followup_date` preenchida e `≤ hoje` (Brasília); (4) o lead não está `archived`, não é `is_test` e está em estágio `< 5` (cadastrado). `due = "hoje"` se `followup_date = hoje`;
senão `"atrasado"` com `days_late = hoje − followup_date` em dias. Retorno futuro não entra na fila.

### 25.5 `GET /v1/campo/today` ganha `goal`

`TodayView.goal: GoalView | null` — a meta e o ritmo do **próprio** consultor com a conta do §25.2 (`null` só se a configuração não puder ser lida). Não depende da flag de roteiro.
O web usa `goal` no resumo da tela Hoje quando **não há card de roteiro** (flag desligada ou sem roteiro hoje); com roteiro, o card do §23 já mostra a mesma conta
(mesmos `feitas`, mesma `meta_diaria`). O cliente recalcula o ritmo com o relógio do aparelho (funciona sem sinal) a partir dos horários que vêm no próprio `goal`:
`goal.params = { meta_diaria, janela_inicio, janela_fim, almoco_inicio, almoco_fim }`.

### 25.6 Retorno vencido como parada prioritária do roteiro automático

Com `FIELD_ROUTES_ENABLED=true` e `retornos_no_roteiro = true`, ao montar o roteiro **automático** (`gerar_ao_iniciar` ou "Montar meu dia", §23.3), os retornos vencidos
(§25.4) **das visitas do próprio consultor** entram **antes** da seleção por proximidade, ancorados no começo da ordem, entre si do mais próximo ao mais longe da posição de partida (`fixa` só no cálculo da montagem; não é gravada, então
"Refazer rota" reordena por distância como qualquer parada). Regras: ignoram `dias_sem_revisitar` (o lead foi visitado há pouco, é justamente o caso) e a área de atuação;
exigem `lat/lng` e (`location_precision` ∈ `point|address` **ou** a visita do retorno com `far_from_place = false`, isto é, o check-in foi no local); pulam lead bloqueado
(`blocklist`), lead já em roteiro de hoje (de qualquer consultor) e arquivado/teste/estágio ≥ 5. Entram no máximo 10 (os mais antigos). Falha ao ler os retornos só vai para o log e o roteiro sai sem eles. Contam na meta como qualquer parada e respeitam o relógio da janela (podem virar
reserva se a janela estourar). A equipe, ao montar à mão (`POST /v1/routes`), escolhe os leads — a fila de retornos da tela traz o nome para ela incluir.

### 25.7 Fechamento da meia-noite (§20.5)

**Sem mudança.** Roteiro de dia anterior com paradas `pendente` fica como está: toda leitura e toda trava filtram por `day`, o índice único parcial
`field_route_stops_lead_day_unique` é por dia (lead pendente ontem não bloqueia hoje) e a tela da equipe (`GET /v1/routes?day=`) só lista `status = 'ativa'`
— marcar o roteiro velho como `encerrada` o **esconderia** do histórico. O status `encerrada` continua sem uso.

### 25.8 Desvios propositais

1. Sem `field_alerts`, sem `@Cron`, sem `FIELD_ALERTS_ENABLED`: o spec (§10) previa job a cada 5 min e tabela de deduplicação para alertas **enviados**. Aqui o alerta é só uma leitura, recalculada a cada consulta.
2. **Fim automático às `fim_automatico` (20:00)** do spec (§9, item 6) **não** foi feito: esta fase não toca o fechamento; o `@Cron` das 00:05 segue o único. Pendência.
3. **Fora de rota** (§9, item 5): ver §25.3. Pendência — precisa de rastreio com a tela apagada ou de um limite mais tolerante para não acusar quem só guardou o celular.
4. Fila de "leads quentes" sem retorno marcado (interesse alto/médio, §9 item 3): fora; a fila desta fase é a de retornos que o consultor **pediu** (`needs_followup`).
5. `mediana real de minutos por visita` (§23.8 item 6) segue pendente.
6. **"Check-in longe do local"** (UX §5.4, um dos alertas padrão) **não** foi feito como alerta da equipe: a visita já nasce marcada `far_from_place` e a tela de cada dia do consultor (§20.4) a mostra. Pendência.
7. Os limiares moram no mesmo JSON de configuração do §23.1 (e no mesmo `GET/PUT`), mas a tela do F3 ("Meta e horários do roteiro") não os edita; há um bloco próprio "Alertas".

---

## 26. Cadastro assistido da empresa no Freela — `/v1/campo/visits/:ref/company-signup`, `/v1/campo/company-signups`, `/v1/consultores/:id/company-signups`

F6 da prospecção. O consultor cadastra a empresa visitada no Freela **sem ver senha**: o Freela devolve um **link de primeiro acesso** (`accessMode: "setup_link"`) que
o dono do estabelecimento abre no próprio celular (QR na tela do consultor, ou WhatsApp pelo celular do consultor) e **escolhe a própria senha**.
Tudo atrás de `FIELD_COMPANY_SIGNUP_ENABLED` (padrão `false`). Depende do contrato do api-freela `POST /v1/admins/consultants/:id/registrations` (ainda fora do ar; a flag do
Freela, `FIELD_ASSISTED_SIGNUP_ENABLED`, também nasce desligada — sem ela o Freela responde `404` genérico, que o Praça trata como "indisponível", §26.7).

### 26.0 Regra de ouro: o link é exibido uma única vez e nunca persistido

- O `setup_link` aparece **somente** no corpo da resposta de `POST …/company-signup` (criação) e de `POST …/reissue-link`. Nenhuma leitura (`GET`, listagens da equipe, `/today`) o devolve.
- **Nunca** vai para o banco do Praça, para log, para `last_error`, para o IndexedDB/fila offline, para o cache do TanStack Query nem para o `localStorage`. O web o guarda apenas em memória (estado da tela) e o perde ao recarregar.
- O Praça **nunca** recebe nem grava senha. O banco guarda só o **fato** da emissão (`link_issued_at`, `link_expires_at`, `reissue_count`), telefone/e-mail **mascarados**, o `userId` do Freela e as datas.
- Replay idempotente (mesmo `client_id`) e resposta perdida **não** devolvem o link: o Praça responde `setup_link: null` e a tela oferece "Gerar novo link" (`reissue-link`), que invalida o anterior no Freela.
- Mensagens de erro do Freela passam por `sanitizarErroDoFreela` (URLs e tokens removidos) antes de ir a `last_error` ou à resposta.

### 26.1 Desvios intencionais em relação ao F0 (proposta) e ao spec de arquitetura

1. Flag `FIELD_COMPANY_SIGNUP_ENABLED` (o spec dizia `FIELD_SIGNUP_ENABLED`).
2. Acesso por **link de primeiro acesso** (decisão do dono), não por senha temporária: o `field_signups` do spec virou `field_company_signups` e não tem campo de senha.
3. A chave de idempotência do Freela é `clientId` (a proposta dizia `idempotencyKey`), e o `409` de duplicidade traz `alreadyLinkedToThisConsultant` direto em `error` (a proposta o punha em `error.details`).
4. O filtro global de erros do Praça devolve só `{error:{code,message}}`: o booleano do Freela vira **dois códigos** (§26.6), não um campo extra.
5. A rota é `…/visits/:ref/company-signup` (a proposta/spec dizia `…/signup`).

### 26.2 Banco — `field_company_signups` (migração aditiva `20261021100000_field_company_signups`)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid **UNIQUE** | idempotência: gerado no aparelho; é o `clientId` enviado ao Freela |
| `consultant_id` | uuid FK `field_consultants` (cascade) | isolamento: toda leitura filtra por ele |
| `visit_id` | uuid? FK `field_visits` (set null) | visita de origem |
| `lead_id` | uuid? FK `leads` (set null) | |
| `company_name` | text | nome mostrado na tela (não é PII sensível) |
| `phone_masked`, `email_masked` | text, text? | `(11) 9****-1234`, `m***@dominio.com` — o original **não** é guardado |
| `status` | text CHECK | `creating` · `pending` · `activated` · `already_registered` · `failed` |
| `freela_user_id`, `freela_contractor_id` | text? | devolvidos pelo Freela |
| `link_issued_at`, `link_expires_at` | timestamptz? | fato da emissão (nunca o link) |
| `reissue_count` | int | |
| `activated_at` | timestamptz? | F6: só vira `activated` quando o Freela responde `409 ALREADY_ACTIVATED`; a data real vem do sync da F7 |
| `last_error_code`, `last_error` | text? | código + mensagem **sanitizada** |
| `created_at`, `updated_at` | timestamptz | |

Índices: `(consultant_id, created_at)`, `(visit_id)`, `(lead_id)`.

### 26.3 Rotas do consultor — `@CampoRoute()`, sempre do **próprio** consultor

Flag desligada: **todas** respondem `404 NOT_FOUND`. `GET /v1/campo/me` ganha `features: { company_signup: boolean }` — é o que esconde o botão no web.
`:ref` é resolvido como nas demais rotas de visita (id do servidor ou `client_id`; visita de outro consultor = `404`).

| Método e caminho | Corpo | Resposta |
|---|---|---|
| `GET /v1/campo/visits/:ref/company-signup` | — | `200 { signup: SignupView \| null, prefill: Prefill }` (o cadastro mais recente da visita; **sem link**) |
| `POST /v1/campo/visits/:ref/company-signup` | `SignupCreateDto` | `201` (criado agora) ou `200` (replay) → `SignupView` |
| `POST /v1/campo/company-signups/:id/reissue-link` | `{ reason?: string ≤ 200 }` | `200 SignupView` com `setup_link` novo |
| `GET /v1/campo/company-signups/:id` | — | `200 SignupView` (sem link) — status "aguardando o dono definir a senha" / "ativado" |

`SignupCreateDto` (snake_case; whitelist estrita): `client_id` (uuid), `company_name` (1–120), `contact_name` (1–120), `phone` (10–11 dígitos nacionais, aceita máscara; vira `+55…`),
`email?`, `cnpj?` (14 dígitos, só números/máscara), `corporate_reason?`, `address?: { cep?, street?, number?, complement?, neighborhood?, city?, uf? }`.
`address.city`/`address.uf` ausentes caem na cobertura da praça do consultor; sem nenhuma das duas fontes → `400 VALIDATION_ERROR`.
O corpo enviado ao Freela é montado **só** do DTO + dados determinísticos (o `freela_consultant_id` do consultor e o check-in da visita, quando `far_from_place = false`): nada é relido do lead,
porque um reenvio com corpo diferente do original é `422 IDEMPOTENCY_KEY_REUSED` no Freela. O pré-preenchimento (`prefill`) é entregue ao aparelho no `GET` e o aparelho devolve tudo no `POST`.

`SignupView`: `{ id, client_id, visit_ref, lead_id, status, company_name, phone_masked, email_masked, link_issued_at, link_expires_at, reissue_count, activated_at, last_error_code, last_error, created_at, created: boolean, setup_link: string | null }`.
`setup_link` só é não nulo nas respostas de criação e reemissão (§26.0). `Prefill`: `{ company_name, contact_name, phone, cnpj, street, city, uf }` (do lead e da praça; vazio quando não há).

Fluxo do `POST` (por `client_id`): insere a linha `creating` → chama o Freela com o mesmo `clientId` → grava `pending` (+`freela_user_id`, datas) e devolve o link se `created:true`.
Em `P2002` (reenvio) carrega a linha existente (de **outro** consultor = `404`): se já tem `freela_user_id`, **não** chama o Freela de novo e responde `200` com `setup_link: null`;
se não tem (`creating`/`failed`/`already_registered`), repete a chamada com o mesmo corpo. Replay do Freela (`created:false`) também resulta em `setup_link: null`.
**Nunca** reemite automaticamente (o Freela limita a 3 reemissões em 24 h e as tentativas da fila queimariam o limite).

### 26.4 Equipe — sem `@CampoRoute()` (token de consultor → `401`)

`GET /v1/consultores/:id/company-signups?status=&limit=` (limit 1–200, padrão 50, mais novos primeiro): cadastros **daquele** consultor (`404` se o consultor não existe), `SignupView` sem link, mais `freela_user_id`.
Flag desligada: `404`. Leitura de equipe (admin ou não), como o resto de `/v1/consultores`.

### 26.5 Offline (fila do celular)

Item novo da fila: `signup` (`{ visit_ref, payload: SignupCreateDto }`), idempotente por `client_id`. O item **não carrega link** e o IndexedDB nunca o recebe: ao sair da fila, a resposta
é descartada. Sem sinal, a tela diz "o link só aparece quando o celular tiver sinal"; ao voltar o sinal o cadastro é criado e a tela passa a oferecer **Gerar link** (`reissue-link`).
`429 DAILY_REGISTRATION_LIMIT` e `RESET_LIMIT` são erros de regra (não repetem); os demais `429`/`5xx` seguem a espera crescente. Check-in recusado leva junto o `signup` da mesma visita.

### 26.6 Erros (formato plano `{ error: { code, message } }`)

| Situação no Freela | Status e `code` no Praça |
|---|---|
| flag do Freela desligada (`404` genérico), `ACCESS_MODE_NOT_AVAILABLE` | `503 SIGNUP_UNAVAILABLE` |
| sem configuração do Freela | `503 FREELA_NOT_CONFIGURED` |
| consultor sem `freela_consultant_id` ou `404 CONSULTANT_NOT_FOUND` | `409 FREELA_CODE_PENDING` |
| `409 PHONE_ALREADY_REGISTERED` | `409 PHONE_ALREADY_REGISTERED` ou, se `alreadyLinkedToThisConsultant`, `409 PHONE_ALREADY_REGISTERED_BY_YOU` |
| `409 EMAIL_…` / `CNPJ_ALREADY_REGISTERED` | idem, com o sufixo `_BY_YOU` quando o Freela confirma o vínculo ao consultor (linha local = `already_registered`) |
| `400 INVALID_CNPJ`, `CITY_NOT_FOUND`, validação | `400` com o mesmo `code` e a mensagem do Freela (sanitizada) |
| `422 IDEMPOTENCY_KEY_REUSED` | `422 IDEMPOTENCY_KEY_REUSED` |
| `429 DAILY_REGISTRATION_LIMIT` / `RESET_LIMIT` | `429` com o mesmo `code` |
| `reissue`: `409 ALREADY_ACTIVATED` | `409 ALREADY_ACTIVATED` (linha local vira `activated`) |
| `reissue`: `404 REGISTRATION_NOT_FOUND` | `409 SIGNUP_NOT_FOUND_IN_FREELA` |
| `reissue` sem `freela_user_id` local | `409 SIGNUP_NOT_CREATED` |
| resposta do Freela fora do formato (zod) | `502 FREELA_ERROR` (mensagem fixa; o corpo cru, que contém o link, nunca é logado) |
| demais | `502 FREELA_ERROR` / `FREELA_UNREACHABLE` com a mensagem do Freela |

### 26.7 Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `FIELD_COMPANY_SIGNUP_ENABLED` | `false` | `true` liga as rotas do §26 e o botão "Cadastrar no Freela" |

**Pré-condições para ligar em produção:** (1) o api-freela com as rotas de cadastro assistido no ar e `FIELD_ASSISTED_SIGNUP_ENABLED` ligada lá; (2) a página `/primeiro-acesso` do `freela-web-v2` no ar
(é ela que o link abre; **sem ela o link não funciona**); (3) a conta de serviço do Praça com a permissão `CONSULTANTS`; (4) `migrate deploy` antes do código.

### 26.8 Cliente do Freela (`FreelaClient`)

`createCompanyRegistration`, `reissueRegistrationLink` e `listRegistrations` (esta, para a F7) validam a resposta com zod. O cliente guarda o `error.code` e o `alreadyLinkedToThisConsultant` do Freela em `FreelaHttpError.freelaError` (apenas esses dois campos — nunca o corpo).

### 26.9 Desvios propositais

1. `activated` na F6 só vem do `409 ALREADY_ACTIVATED` do `reissue-link`; a leitura `listRegistrations` (com `activatedAt`) é da F7.
2. A equipe só **lista** (sem criar nem reemitir pelo painel).
3. O `409` por duplicidade não traz `userId`: a linha fica `already_registered` e a F7 a reconcilia.

## 27. Cadastros confirmados pelo Freela (sincronização) — `/v1/consultores/signups`, `/v1/campo/signups`

F7 da prospecção. O Praça passa a **trazer do Freela** a lista de empresas cadastradas por cada consultor e a data em que cada uma foi **confirmada** (primeiro acesso, primeira vaga ou
primeiro serviço concluído). É a base de pagamento da F8: "só vale cadastro confirmado pelo Freela". O "cadastrou agora" do questionário da visita continua sendo **só declaração** e nunca entra nesta conta.
Tudo atrás de `FIELD_SIGNUP_SYNC_ENABLED` (padrão `false`) para o **job**; as leituras respondem sempre (vazias enquanto nada foi sincronizado).

### 27.1 Desvios intencionais

1. Tabela `field_signups` (nome do spec; a F6 usou `field_company_signups` para o cadastro **iniciado pelo consultor**). `field_signups` guarda o que o **Freela confirmou**, inclusive os cadastros por **QR** (sem linha em `field_company_signups`).
2. O Praça **não guarda telefone, e-mail nem CNPJ inteiros** do Freela (§26.0): só o nome da empresa e as datas. Telefone/CNPJ/e-mail vêm na resposta do Freela, servem para casar com lead/cadastro **em memória** e são descartados.
3. A tabela guarda **fatos imutáveis** (datas de cada evento, preenchidas uma vez). "Confirmado em que dia, sob qual regra" é uma **função pura sobre esses fatos, avaliada na leitura** (§27.4): trocar a regra nunca reescreve o histórico. A F8 deve ler pela mesma função e **fotografar** a regra e o dia no seu próprio ledger quando pagar.
4. Não existe estado `link_issued` em `field_company_signups`: "link emitido" é `pending`.

### 27.2 Banco (migração aditiva `20261022100000_field_signups`)

`field_signups`:

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `consultant_id` | uuid FK `field_consultants` (cascade) | isolamento: toda leitura filtra por ele |
| `freela_user_id` | text | **UNIQUE com `consultant_id`**: re-sincronizar nunca duplica |
| `freela_contractor_id` | text? | |
| `company_name` | text | |
| `source` | text? | `on_behalf` · `qr` · null (o Freela pode mandar null) |
| `freela_created_at` | timestamptz | `createdAt` no Freela; é o campo do `since` |
| `activated_at`, `first_vacancy_at`, `first_job_completed_at` | timestamptz? | **escrita única**: só preenche nulo; valor existente nunca é sobrescrito nem volta a nulo (divergência = contador no log) |
| `created_day`, `activated_day`, `first_vacancy_day`, `first_job_day` | text? `YYYY-MM-DD` | o dia em **Brasília** do instante correspondente (filtros de dia/semana viram comparação de texto indexada) |
| `signup_id` | uuid? FK `field_company_signups` (set null) | vínculo ao cadastro iniciado pelo consultor |
| `lead_id` | uuid? FK `leads` (set null) | vínculo ao lead |
| `match_status` | text CHECK | `linked` (vínculo único) · `ambiguous` (mais de um candidato: **nada é ligado**, vai para revisão) · `none` (sem candidato; normal no QR) |
| `first_seen_at`, `synced_at`, `updated_at` | timestamptz | |

Índices: `UNIQUE(consultant_id, freela_user_id)`, `(consultant_id, activated_day)`, `(consultant_id, first_vacancy_day)`, `(consultant_id, first_job_day)`, `(signup_id)`, `(lead_id)`.

`field_signup_sync_state` (uma linha por consultor): `consultant_id` PK/FK cascade, `watermark` timestamptz? (maior `freela_created_at` visto numa passada **completa**), `last_run_at`, `last_ok_at`,
`last_error_code`, `last_error` (**sanitizado**: sem URL, token, telefone ou corpo), `last_count` int.

### 27.3 O job

`FIELD_SIGNUP_SYNC_ENABLED=true` + Freela configurado. `@Cron` a cada minuto (Brasília); só roda se passaram `FIELD_SIGNUP_SYNC_INTERVAL_MIN` (padrão 10) minutos desde a última rodada e dentro de 06:00–23:59. Trava de reentrância
na instância (a API roda em UMA instância; se duas rodassem, o `UNIQUE`, a escrita única e o `stage < 5` mantêm o sync idempotente). O erro nunca sai do `@Cron`.

Por consultor com `freela_consultant_id` (**inclui inativos**: cadastro feito antes de sair ainda vale):
1. `since = max(agora − FIELD_SIGNUP_RECONCILE_DAYS, min(watermark − 1 dia, `freela_created_at` do cadastro mais antigo ainda **sem** a data do evento da regra))`; sem watermark = `agora − FIELD_SIGNUP_RECONCILE_DAYS` (padrão 45; 1ª rodada traz a janela inteira). Motivo: o `since` do Freela filtra por `createdAt`, mas `activatedAt`/`firstVacancyAt`/`firstJobCompletedAt` chegam depois; a janela de reconciliação reabre os ainda não confirmados.
2. Pagina com `limit=200` e `cursor` até `nextCursor` nulo. **Teto de 25 páginas por consultor por rodada**; cursor repetido interrompe (sem laço infinito). O watermark só avança quando a passada termina; a próxima continua do mesmo ponto (os upserts são idempotentes).
3. Por item: upsert por `(consultant_id, freela_user_id)` (datas de escrita única), casamento (§27.5), reconciliação do `field_company_signups` (§27.6) e avanço do lead (§27.7), cada item na sua transação.
4. Falha: `429` encerra a **rodada inteira** (todos os consultores); `404`/`403`/`5xx`/rede/formato inválido gravam `last_error_code` + `last_error` sanitizado **daquele** consultor e seguem para o próximo. Freela não configurado: o job não roda.

### 27.4 Regra de "confirmado" (configurável)

`app_settings.field_config.confirmation_rule` (mesmo `GET/PUT /v1/consultores/settings/config`, validado; chave desconhecida = `400`):

| Valor | Confirmado quando | Data que vale |
|---|---|---|
| `activated` (**padrão**) | `activated_at` não nulo | `activated_day` |
| `first_vacancy` | `first_vacancy_at` não nulo | `first_vacancy_day` |
| `first_job_completed` | `first_job_completed_at` não nulo | `first_job_day` |

`activatedAt` nulo = **não confirmado** (a conta pode estar ativa só por "esqueci a senha"). Origem `qr`: o Freela já manda `activatedAt = createdAt`. O dia vale em Brasília; a **semana** é segunda a domingo de Brasília.
O ajuste da regra grava `atualizado_por`/`atualizado_em` como o resto da config. Mudar a regra muda a contagem **a partir da leitura**; o histórico dos fatos não é tocado.

### 27.5 Casamento (nunca sobrescreve dado humano)

Em ordem, sempre dentro do **mesmo consultor**: (1) `field_company_signups.freela_user_id = userId`; (2) cadastro sem `freela_user_id` do consultor cujo `phone_masked` = máscara do telefone do Freela **e** nome normalizado igual
(sem acento, caixa, pontuação). Mais de um candidato = `ambiguous`. Lead: o `lead_id` do cadastro; senão leads **da mesma praça do consultor** com o mesmo `phone_key` ou CNPJ; só liga se houver **exatamente um**.
Só preenche vínculos nulos; nunca troca um vínculo existente nem altera nome/telefone/cnpj do lead.

### 27.6 Reconciliação de `field_company_signups`

Linha ligada, em `creating`/`pending`/`already_registered`/`failed` (sem `freela_user_id`): grava `freela_user_id` e `freela_contractor_id` quando nulos; `creating`/`failed` → `pending`. Se o Freela trouxe `activatedAt`:
status `activated` e `activated_at` (se nulo). Linha `activated` não regride.

### 27.7 Lead → "Cadastrado" (5)

Só quando o cadastro está **confirmado pela regra vigente**, o lead está ligado (§27.5), não é `archived`, não é `is_test` e `stage < 5` (nunca retrocede; **etapa 8 "Perdido" não é tocada**: a decisão de reabrir é humana, o vínculo fica registrado).
Transação: `stage = 5`, `stage_since = hoje (Brasília)`, `lead_events { kind: 'stage', stage_to: 5, author_label: 'Freela (sincronização)', text }` sem `author_id`. Idempotente pelo `stage < 5`.

### 27.8 Leituras

`GET /v1/consultores/signups?praca_id=&consultant_id=&from=&to=` (equipe; `from`/`to` = dias `YYYY-MM-DD` de Brasília, inclusive; padrão = a semana atual; `to` ≥ `from`, no máximo 92 dias; `praca_id`/`consultant_id` uuid):

```
{ "rule": "activated", "field": "activated_at", "from": "2026-10-19", "to": "2026-10-25",
  "source": "Freela GET /v1/admins/consultants/:id/registrations (sincronizado)",
  "formula": "cadastros do Freela com activated_at preenchido e dia de Brasília entre from e to",
  "total": 3, "pending_review": 1 /* vínculos ambíguos de todo o histórico dos consultores filtrados */, "last_sync_at": "…" | null,
  "consultants": [ { "consultant_id", "name", "praca_id", "confirmed": 2, "not_confirmed": 1, "sync_error": "…" | null, "last_ok_at": "…" | null } ],
  "items": [ { "id", "consultant_id", "company_name", "source": "on_behalf"|"qr"|null, "confirmed_day": "YYYY-MM-DD", "confirmed_at": "…", "created_at": "…", "match_status", "lead_id": uuid|null } ] }
```
`items` traz só os **confirmados** no período (limite 500, mais novos primeiro); `not_confirmed` conta os sincronizados criados no período e ainda sem o evento da regra. Equipe lê tudo; não há `@CampoRoute()` (token de consultor = `401`).

`GET /v1/campo/signups?from=&to=` (consultor; **só os dele**; mesmos padrões): `{ rule, field, from, to, source, total, items: [ { id, company_name, confirmed_day, status: 'confirmed' } ] }` — sem telefone, e-mail, CNPJ, `freela_user_id` ou `lead_id`.
Aparecem também os **não confirmados** criados no período com `status: 'waiting'` (empresa e data de criação), para o consultor saber que falta o dono acessar.

Resumo: `GET /v1/campo/today` ganha `signups_confirmed: { today, week, rule, source }` e cada item de `GET /v1/consultores` ganha `signups_confirmed` (mesmo formato), `null` se a leitura falhar. Contagem = linhas de `field_signups` do consultor cujo dia do evento da regra cai no dia / na semana (segunda–domingo, Brasília).

### 27.9 Variáveis

| Variável | Padrão | Efeito |
|---|---|---|
| `FIELD_SIGNUP_SYNC_ENABLED` | `false` | liga o job |
| `FIELD_SIGNUP_SYNC_INTERVAL_MIN` | `10` | intervalo mínimo entre rodadas (1–120) |
| `FIELD_SIGNUP_RECONCILE_DAYS` | `45` | janela de reconciliação (7–180) |

**Para produção:** `migrate deploy` antes do código; api-freela com `GET …/registrations` no ar e a conta de serviço com a permissão `CONSULTANTS`; ligar a flag; conferir a tela `/consultores` (contagem e `sync_error`) antes de a F8 usar.

## 28. Remuneração do consultor — `/v1/consultores/earnings/*`, `GET /v1/campo/earnings`

F8 da prospecção. Calcula **em centavos inteiros** quanto cada consultor ganhou por dia e por semana a partir dos cadastros **confirmados pelo Freela** (§27) e das jornadas/visitas do dia, com a **conta escrita**. Tudo atrás de `FIELD_EARNINGS_ENABLED` (padrão `false`): desligada, **todas** as rotas abaixo respondem `404 EARNINGS_DISABLED`, `features.earnings` em `GET /v1/campo/me` é `false` e a UI some. Pagamento (Pix) NÃO está aqui: é a F9. Nenhuma resposta traz chave Pix, telefone, e-mail ou CNPJ.
Dinheiro: **inteiro em centavos** no banco, no cálculo e no fio (campos `*_cents`); nunca ponto flutuante. Não há divisão no cálculo, logo não há arredondamento.

### 28.1 Desvios intencionais

1. Nomes: `field_earnings_ledger` (razão) e `field_payout_periods` (fechamento) no lugar de `field_payout_entries`/`field_payout_closings` do spec; tipos `accrual` · `adjustment` · `reversal` (o `pagamento` entra na F9); flag `FIELD_EARNINGS_ENABLED` no lugar de `FIELD_PAYROLL_ENABLED`.
2. **Nenhum valor é fixo no código.** `REGRA_PADRAO` (R$ 10,00 por cadastro; faixas 10 → R$ 100,00 e 20 → R$ 250,00; modo `max`; faixa **por dia**; **sem piso**; fechamento na segunda) é só a versão 1, gravada pela migração e **editável** por nova versão.
3. O padrão **não** inclui piso (`floor_cents = 0`): a leitura "piso R$ 100 por diária" do dono é ambígua e, sem condição, pagaria dia sem trabalho. Para ter piso, o admin liga `floor_cents` e escolhe a condição.
4. Fuso: **sempre Brasília** (`America/Sao_Paulo`). O dia de cada cadastro confirmado já foi gravado em Brasília (§27.2); outro fuso desalinharia dia e razão. Não é parâmetro.
5. Dia da confirmação = dia (Brasília) do **evento da regra** `confirmation_rule` (§27.4), não o dia em que o consultor cadastrou. Cadastro ainda sem o evento é **"Ainda não confirmado"** e vale R$ 0.

### 28.2 Regra (parâmetros) e vigência

Uma **versão** = `{ version, valid_from, config, reason, created_by, created_at }`, tabela `field_pay_rule_versions` (só insere; **nunca** `UPDATE`/`DELETE`). `config`:

| Campo | Tipo / limites | Padrão | Significado |
|---|---|---|---|
| `unit_cents` | int 0–1.000.000 | `1000` | valor por cadastro confirmado |
| `tiers_period` | `day` \| `week` | `day` | faixas contam cadastros no dia ou na semana |
| `tiers` | até 10 de `{ min_signups 1–1000, amount_cents 1–10.000.000 }`; `min_signups` estritamente crescente; `amount_cents` não decrescente | `[10→10000, 20→25000]` | valor **fixo** ao atingir a faixa (vale a maior atingida) |
| `combine` | `max` \| `sum` \| `tier_only` | `max` | `max`: o maior entre `n × unit_cents` e a faixa · `sum`: soma · `tier_only`: só a faixa (`unit_cents` ignorado; o piso continua valendo) |
| `cap_cents` | int ≥ 1 \| `null` | `null` | teto **por período** (`tiers_period`); `null` = sem teto. Deve ser ≥ `floor_cents` |
| `floor_cents` | int 0–10.000.000 | `0` | piso **por diária**; `0` = sem piso |
| `floor_condition` | `none` \| `journey_open` \| `min_visits` | `none` | quando o piso vale: sempre (só consultor ativo) · houve jornada iniciada no dia · ao menos `floor_min_visits` visitas |
| `floor_min_visits` | int 0–1000 | `0` | obrigatório ≥ 1 com `min_visits` |
| `visits_count` | `checkin` \| `checkout` | `checkin` | visita conta ao fazer check-in ou só com checkout; dia = `field_journeys.day` da visita |
| `week_start_weekday` | 0–6 (0 = domingo) | `1` | primeiro dia da semana de pagamento |
| `payout_weekday` | 0–6 | `1` | dia do Pix (o primeiro depois do fim da semana) e dia do fechamento automático |
| `autoclose_hour` | 0–23 | `6` | hora (Brasília) a partir da qual o job fecha |
| `late_grace_days` | 0–92 | `14` | quantos dias após o fim de uma semana fechada uma confirmação tardia ainda gera ajuste |

**Fórmula do dia** (`n` = cadastros confirmados no dia): `núcleo = combine(n × unit_cents, faixa(n))` (faixa só se `tiers_period = day`; senão o núcleo é `n × unit_cents`, ou 0 em `tier_only`) → **piso** (`max(núcleo, floor_cents)` se a condição vale) → **teto** (`min`, só se `tiers_period = day`). O dia ainda não terminado é calculado "até agora".
**Fórmula da semana, faixa por dia:** soma dos dias. **Faixa semanal** (`tiers_period = week`): `N` = cadastros confirmados na semana; `Σd` = soma dos dias (núcleo `n × unit` + piso, sem teto); semana = `max(Σd, faixa(N))` (modo `max`) · `Σd + faixa(N)` (`sum`) · `Σd + faixa(N)` com `unit` ignorado (`tier_only`); depois `min(cap_cents)`. No razão, a parte semanal é um lançamento próprio (`work_scope = 'week'`) de valor `semana − Σd`.
**Vigência:** cada dia usa a versão com maior `valid_from ≤ dia` (empate: maior `version`). Parâmetros semanais (faixa, teto) seguem a versão vigente no **primeiro dia da semana**.

### 28.3 Banco (migração aditiva `20261023100000_field_earnings`)

- `field_pay_rule_versions`: `id` uuid PK, `version` int UNIQUE (autoincremento), `valid_from` text `YYYY-MM-DD`, `config` jsonb, `reason` text?, `created_by` uuid? (FK `users`; nulo na versão 1), `created_at`. Índice `(valid_from, version)`. A versão 1 (`valid_from = '1970-01-01'`) é inserida pela migração.
- `field_earnings_ledger` (**razão append-only**): `id` uuid PK, `consultant_id` uuid FK **Restrict**, `kind` CHECK `accrual|adjustment|reversal`, `amount_cents` int (com sinal; `accrual` ≠ 0 não é obrigatório), `work_scope` CHECK `day|week|manual`, `work_day` text?, `work_week` text (início da semana trabalhada), `payout_week` text (início da semana em que entra no pagamento), `rule_version` int? FK `field_pay_rule_versions(version)`, `source` text, `reason` text? (**obrigatório** e não vazio em `adjustment`/`reversal`, CHECK), `reverses_id` uuid? FK própria, **UNIQUE** (um lançamento só é estornado uma vez; CHECK: `kind = 'reversal'` ⇔ `reverses_id` não nulo), `idempotency_key` text, `snapshot` jsonb (regra completa, `confirmation_rule`, contagens usadas, a conta), `created_by` uuid? (FK `users`; nulo = sistema), `created_at`. **UNIQUE `(consultant_id, payout_week, kind, idempotency_key)`**. Índices `(consultant_id, payout_week)` e `(consultant_id, work_week, work_scope, work_day)`. **Trigger** barra `UPDATE` e `DELETE` (última linha de defesa); o código também só insere e lê.
- `field_payout_periods`: `id` uuid PK, `consultant_id` FK **Restrict**, `week_start`, `week_end`, `status` CHECK `open|closed`, `total_cents` int, `entries` int, `rule_version` int (vigente no fechamento), `closed_at`, `closed_by` uuid? (nulo = job), `closed_mode` `manual|auto`. **UNIQUE `(consultant_id, week_start)`**. Só linhas `closed` são gravadas (semana aberta é calculada).
- FKs `Restrict`: um consultor com razão não pode ser apagado (`DELETE /v1/consultores/:id` → `409 HAS_EARNINGS`; desative em vez de apagar).

### 28.4 Razão: o que entra e como não duplica

- **Uma só conta** serve a leitura e o fechamento: `alvo` (função pura sobre cadastros confirmados, jornadas e visitas) menos `já lançado` (**somente** lançamentos `accrual` daquele período de trabalho) = `delta`. Ajustes e estornos manuais **nunca** entram nessa subtração (senão o próximo fechamento desfaria o ajuste). Delta 0 não grava nada.
- **Fechar uma semana** (`W`, já encerrada) = em transação, travando o consultor (`pg_advisory_xact_lock`): lançar os deltas dos dias de `W` (e a parte semanal) em `payout_week = W`; somar o razão de `payout_week = W`; gravar `field_payout_periods` (`UNIQUE` impede o duplo fechamento; repetir devolve o fechamento existente, `already_closed: true`). Semana fechada **não reabre**.
- **Confirmação tardia:** dia de uma semana **já fechada**, dentro de `late_grace_days` do fim dela, com `alvo` diferente do lançado → o delta entra na **primeira semana ainda aberta depois dela** (a que fecha em seguida; em geral a semana seguinte), `source = 'late_confirmation'`, com o dia de origem no `snapshot`. Assim a tela da semana, o fechamento e o Pix mostram o mesmo número. Fora do prazo nada é lançado (ajuste manual, se o dono quiser).
- **Leitura = lançado + planejado:** o total de uma semana é o que já está no razão (`payout_week`) **mais** os deltas que seriam lançados agora para essa semana. Assim a tela mostra o mesmo número que o fechamento grava, inclusive confirmações tardias ainda não lançadas.
- **Idempotência:** chave do lançamento `acc:<escopo>:<dia|semana>:<n>`, `n` = quantidade de `accrual` já existentes naquele período de trabalho + 1, calculado dentro da transação travada; conflito `UNIQUE` = já lançado (nada duplica).
- **Ajuste manual** (`adjustment`): valor com sinal ≠ 0 e **motivo obrigatório**, sempre na semana corrente; chave = `client_id` enviado pelo cliente. **Estorno** (`reversal`): só de `adjustment`, valor = oposto do original, motivo obrigatório, uma vez só. Para desfazer um ganho do sistema, lance um `adjustment` negativo com motivo.

### 28.5 Equipe — `/v1/consultores/earnings` (estáticas, antes de `:id`)

Leitura: equipe. Escrita: `@AdminOnly()`. Token de consultor de campo → `401`. Flag desligada → `404 EARNINGS_DISABLED`.

| Método e rota | Corpo / query | Resposta |
|---|---|---|
| `GET /v1/consultores/earnings/config` | — | `{ current: Versão, upcoming: Versão[], history: Versão[] (50 últimas), default_config, limits }` |
| `PUT /v1/consultores/earnings/config` | `{ valid_from, reason?, config: { …os 13 campos de §28.2, todos obrigatórios } }` (admin) | `200` com a nova `Versão`. `valid_from` ≥ hoje (Brasília); chave desconhecida ou fora dos limites → `400 VALIDATION_ERROR` (a mensagem diz o campo). Com faixa/teto semanal (na nova ou na vigente), `valid_from` tem de ser o 1º dia da semana. Mudar `week_start_weekday` depois que existe razão/fechamento → `409 WEEK_START_LOCKED`. Nunca edita versão antiga |
| `POST /v1/consultores/earnings/simulate` | `{ config?, signups_confirmed (0–1000), visits? (0–1000), journey_open? }` (equipe; `config` no mesmo formato do PUT) | `{ day: { total_cents, conta: string[] } }`; sem `config` usa a vigente. Não grava nada. Mesma função do cálculo real |
| `GET /v1/consultores/earnings` | `?week=YYYY-MM-DD` (qualquer dia da semana; padrão a atual) `&praca_id= &consultant_id=` | `{ week: {from, to}, source, rule_version, confirmation_rule, total_cents, consultants: [ { consultant_id, name, praca_id, active, status: 'open'\|'closed', total_cents, confirmed_signups, closed_at, closed_mode, days: [ { day, total_cents, confirmed_signups, visits, journey_open, rule_version, conta: string[] } ], week_part_cents, extras_cents, conta: string[] } ], ledger?: Lançamento[] (só com consultant_id; até 200) }` |
| `POST /v1/consultores/earnings/close` | `{ week_start, consultant_id? }` (admin) | `{ week: {from,to}, closed: n, already_closed: n, total_cents, periods: [ { consultant_id, total_cents, already_closed } ] }`. Semana não encerrada → `409 WEEK_NOT_ENDED`; `week_start` que não é início de semana → `400` |
| `POST /v1/consultores/earnings/reconcile` | `{ consultant_id? }` (admin) | `{ posted: n, total_cents }` lança as confirmações tardias na primeira semana aberta depois da fechada (§28.4) |
| `POST /v1/consultores/earnings/adjustments` | `{ consultant_id, amount_cents (≠ 0, |v| ≤ 10.000.000), reason (3–500), client_id (uuid) }` (admin) | `201 Lançamento` (repetir o mesmo `client_id` devolve o mesmo lançamento, sem duplicar) |
| `POST /v1/consultores/earnings/adjustments/:id/reverse` | `{ reason, client_id }` (admin) | `201 Lançamento`; `409 ALREADY_REVERSED`; `422 NOT_REVERSIBLE` (só `adjustment`) |

`Lançamento`: `{ id, kind, amount_cents, work_scope, work_day, work_week, payout_week, rule_version, source, reason, reverses_id, created_by, created_at }`. Consultor inexistente → `404 NOT_FOUND`.

### 28.6 Consultor — `GET /v1/campo/earnings` (`@CampoRoute()`)

Só os ganhos **dele** (id vem do token). Resposta:

```
{ "rule_version": 1, "confirmation_rule": "activated",
  "source": "Cadastros confirmados pelo Freela (sincronizado) × regra de remuneração versão 1",
  "as_of": "…",
  "today": { "day": "2026-10-20", "total_cents": 10000, "confirmed_signups": 10, "visits": 8, "journey_open": true, "conta": ["10 cadastros confirmados × R$ 10,00 = R$ 100,00.", "…"] },
  "week": { "from": "2026-10-19", "to": "2026-10-25", "total_cents": 18000, "extras_cents": 0, "days": [ { "day", "total_cents", "confirmed_signups" } ], "conta": ["…"] },
  "unconfirmed": { "count": 3, "text": "3 cadastros ainda não confirmados pelo Freela: não entram na conta e contam no dia em que o dono acessar." },
  "pix": { "date": "2026-10-26", "week_to": "2026-10-25", "text": "Pix previsto para 26/10/2026, referente a 19/10 a 25/10." },
  "previous_weeks": [ { "from", "to", "total_cents", "status": "closed"|"open" } ] }
```
Seção "Confirmado pelo Freela" = `confirmed_signups` e `total_cents`; "Ainda não confirmado" = `unconfirmed` (sem valor em reais). `previous_weeks`: 4 anteriores. `GET /v1/campo/me` ganha `features.earnings`.

### 28.7 Fechamento automático

`FIELD_EARNINGS_AUTOCLOSE_ENABLED=true` (e `FIELD_EARNINGS_ENABLED=true`): `@Cron` a cada 30 min (Brasília) que decide no código: só quando o dia da semana de hoje é o `payout_weekday` vigente, a hora é ≥ `autoclose_hour` e ainda não rodou hoje (memória; reiniciar repete, e é idempotente). Fecha as semanas **encerradas e ainda abertas** (até 8 semanas atrás) e reconcilia confirmações tardias. **Nunca cria histórico:** cada consultor continua a partir do **seu** último fechamento; quem ainda não tem nenhum começa pela última semana encerrada. Trava de reentrância (`rodando`), instância única, `try/catch` completo (o erro nunca sai do `@Cron`).

### 28.8 Variáveis

| Variável | Padrão | Efeito |
|---|---|---|
| `FIELD_EARNINGS_ENABLED` | `false` | habilita rotas e UI |
| `FIELD_EARNINGS_AUTOCLOSE_ENABLED` | `false` | liga o fechamento automático |

**Para produção:** `migrate deploy` antes do código; F7 já ligada e conferida (a F8 só vale com cadastros sincronizados); ligar `FIELD_EARNINGS_ENABLED`; conferir 2 semanas **em sombra** na tela da equipe (conta × cálculo à mão) antes de ligar o fechamento automático e antes da F9.

## 29. Pagamento por Pix MANUAL — `/v1/consultores/payouts/*`, `GET /v1/campo/payouts`

F9 da prospecção. Da semana **fechada** (§28) sai uma fila de pagamentos por consultor/semana; o admin paga **fora do sistema** (app do banco) e aqui só **registra** (marcar como pago, comprovante, CSV). **Nenhuma chamada a provedor de pagamento, nenhum envio automático de dinheiro** (o Pix automático é a F10, fora desta fase). Tudo atrás de `FIELD_PAYOUTS_ENABLED` (padrão `false`) **e** `FIELD_EARNINGS_ENABLED`: sem as duas, **todas** as rotas abaixo respondem `404 PAYOUTS_DISABLED`, `features.payouts` em `GET /v1/campo/me` é `false` e a UI some.
Dinheiro: **inteiro em centavos** (`*_cents`) em todo o stack. Erro: `{ "error": { "code", "message" } }` (§1).

### 29.1 Desvios intencionais

1. O spec previa `field_payout_payments` + entrada `pagamento`; aqui: `field_payouts` (a obrigação semanal, com a chave Pix **fotografada**) + `field_payout_events` (auditoria append-only) + lançamentos `payout*` no razão da F8.
2. A tabela do pagamento tem **colunas de estado** (`status`, `paid_*`, comprovante) que mudam **só** por transição válida, sempre com um evento na mesma transação; um trigger no banco barra `DELETE` e qualquer mudança de `consultant_id`, `week_start`, `week_end`, `due_cents`, chave Pix/tipo e `created_at`.
3. O comprovante é opcional/obrigatório conforme `payout_proof_required` em `field_config` (padrão **`true`**, editável por `PUT /v1/consultores/settings/config`).

### 29.2 Banco (migração aditiva `20261024100000_field_payouts`)

- `field_payouts`: `id` uuid PK, `consultant_id` FK **Restrict**, `week_start`, `week_end` (text `YYYY-MM-DD`), `due_cents` int **> 0** (total do fechamento `field_payout_periods.total_cents`, fotografado), `pix_key`, `pix_key_type` (**copiados** do cadastro no momento da geração; nulos se a chave estava ausente/inválida), `block_reason` (`NO_PIX_KEY` ou nulo: **bloqueado**), `status` CHECK `pending|paid|failed|cancelled`, `paid_cents` int?, `paid_at`, `paid_by`, `paid_by_name`, `method` (`pix_manual`), `proof_key`, `proof_mime`, `proof_size`, `note`, `diff_reason`, `created_by`, `created_by_name`, `created_at`. **UNIQUE parcial `(consultant_id, week_start) WHERE status <> 'cancelled'`** (não duplica a fila; cancelado pode ser gerado de novo). CHECK de coerência (pago ⇒ `paid_cents`/`paid_at`; bloqueado ⇒ sem chave; diferença ⇒ `diff_reason`).
- `field_payout_events` (**append-only**, trigger barra `UPDATE`/`DELETE`): `id`, `payout_id` FK Restrict, `type` (`created|paid|failed|retried|cancelled|reversed|pix_key_viewed|exported`), `from_status`, `to_status`, `actor_id`, `actor_name`, `reason`, `data` jsonb (**nunca** a chave Pix), `created_at`.
- `field_earnings_ledger.kind` passa a aceitar também `payout`, `payout_reversal`, `payout_settlement` (CHECK recriado; `work_scope = 'manual'`, motivo obrigatório como nos ajustes). Esses tipos **não entram** nas somas da F8 (visão, fechamento, extras): só o saldo do §29.5.

### 29.3 Regras

1. **Gerar a fila** (`POST …/generate {week_start}`): semana **fechada** (§28). Para cada `field_payout_periods` da semana com `total_cents > 0` e sem pagamento ativo cria `pending` com `due_cents = total_cents`. Total ≤ 0 não gera (a semana negativa já se compensa nas seguintes pelo razão). Chave `pixValido(tipo, chave)` falsa/ausente ⇒ nasce **bloqueado** (`block_reason = 'NO_PIX_KEY'`), visível na equipe e em "Atenção agora". Rodar de novo não duplica (UNIQUE parcial) e **reavalia os bloqueados**: se o consultor já tem chave válida, o bloqueado é cancelado (evento, motivo "chave Pix cadastrada") e um novo `pending` é criado com a chave atual.
2. **Transições** (todas travam o consultor com o mesmo advisory lock da F8, fazem *compare-and-set* no status e gravam o evento na mesma transação): `pending → paid | failed | cancelled` · `failed → pending (retry) | paid | cancelled` · `paid → cancelled (reverse, com motivo)` · `cancelled →` nada. Bloqueado só pode ser cancelado. Pagar/falhou/tentar de novo num pagamento bloqueado ⇒ `409 PIX_KEY_MISSING` (o mesmo código sai de `GET …/:id/pix-key` quando o pagamento não tem chave copiada). Qualquer outra transição ⇒ `409 INVALID_TRANSITION`.
3. **Marcar como pago é idempotente:** já `paid` ⇒ `200` com o pagamento existente e `already_paid: true`, **sem** novo evento, lançamento nem arquivo.
4. **Valor pago ≠ devido** exige `reason` (`400 REASON_REQUIRED`) e vira acerto: razão de `W` (semana paga) ganha `payout −paid` e `payout_settlement −(due−paid)` (fecha `W` em zero), e a **semana corrente** ganha um `adjustment` `+(due−paid)` (`source = 'payout_difference'`; paga a menos ⇒ o resto vai no próximo Pix; paga a mais ⇒ desconta). `paid_cents` ≥ 1 e ≤ 10.000.000.
5. **Comprovante:** multipart, campo `proof`, **JPEG, PNG ou PDF** conferidos pelos **bytes mágicos** (não pelo mimetype), até **5 MB** (`413 FILE_TOO_LARGE`; `415 INVALID_PROOF` tipo inválido). Guardado no storage das fotos (S3 privado ou disco) sob `pagamentos/<consultant_id>/<uuid>.<ext>` (no S3, sob o prefixo do bucket, p. ex. `praca/pagamentos/…`). **Nunca URL pública:** só os endpoints autenticados de stream (`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`). `payout_proof_required = true` e sem arquivo ⇒ `400 PROOF_REQUIRED`. Já pago ⇒ o arquivo enviado é ignorado; transação falhou ⇒ o arquivo é removido.
6. **Estorno de pagamento** (`reverse`): grava `payout_reversal +paid` (e desfaz o acerto, se houve: `payout_settlement` oposto + `reversal` do ajuste `payout_difference`), o pagamento vira `cancelled` e a semana volta a poder ser gerada. O ajuste `payout_difference` não pode ser estornado pela rota da F8 (`422 NOT_REVERSIBLE`): estorne pelo pagamento.
7. **Segurança:** a chave completa só sai em `GET …/:id/pix-key` (admin) e no CSV com `include_pix_key=true` (admin) — ambos gravam evento (`pix_key_viewed`/`exported`) **sem a chave**; em nenhuma lista, log ou erro. Isolamento: consultor só enxerga o que é dele (id do token; pagamento de outro = `404`); equipe filtra por `praca_id`.

### 29.4 Equipe — `/v1/consultores/payouts` (estáticas antes de `:id`)

Leitura: equipe. Escrita: `@AdminOnly()`. Token de consultor de campo ⇒ `401`.

| Método e rota | Corpo / query | Resposta |
|---|---|---|
| `GET /v1/consultores/payouts` | `?week=YYYY-MM-DD` (qualquer dia da semana; padrão a última encerrada) `&consultant_id= &praca_id= &status=` | `{ week: {from,to}, pix_date, summary: { to_pay_cents, blocked_cents, failed_cents, paid_cents, counts: {pending,blocked,failed,paid,cancelled}, conta: string[], source }, proof_required, payouts: Pagamento[] }` (cancelados só com `status=cancelled`) |
| `POST /v1/consultores/payouts/generate` | `{ week_start }` (admin) | `{ week, created, blocked, existing, unblocked, skipped_non_positive, payouts: Pagamento[] }`; `409 WEEK_NOT_CLOSED` se nenhum consultor tem a semana fechada |
| `GET /v1/consultores/payouts/export.csv` | `?week= &consultant_id= &praca_id= &include_pix_key=true` (**a rota inteira é admin**) | CSV (§29.7) |
| `GET /v1/consultores/payouts/:id` | — | `Pagamento` + `balance_cents` (saldo da semana, §29.5) + `events: [ { id, type, from_status, to_status, actor, reason, created_at } ]` |
| `POST /v1/consultores/payouts/:id/pay` | multipart: `proof?` (arquivo), `paid_cents?` (padrão `due_cents`), `reason?`, `note?` (admin) | `200 Pagamento` + `already_paid` |
| `POST /v1/consultores/payouts/:id/fail` | `{ reason }` 3–500 (admin) | `200 Pagamento` |
| `POST /v1/consultores/payouts/:id/retry` | `{}` (admin) — "Tentar de novo" (manual) | `200 Pagamento` (volta a `pending`) |
| `POST /v1/consultores/payouts/:id/cancel` | `{ reason }` (admin) | `200 Pagamento` |
| `POST /v1/consultores/payouts/:id/reverse` | `{ reason }` (admin) | `200 Pagamento` (cancelado) |
| `GET /v1/consultores/payouts/:id/proof` | — | stream do arquivo; `404` sem comprovante |
| `GET /v1/consultores/payouts/:id/pix-key` | — (admin) | `{ pix_key, pix_key_type }` (grava evento) |

`Pagamento`: `{ id, consultant_id, consultant_name, praca_id, week: {from,to}, due_cents, status, blocked, block_reason, pix_key_type, pix_key_masked, pix_date, pix_label, paid_cents, diff_cents, diff_reason, paid_at, paid_by, method, has_proof, proof_mime, note, last_reason, created_at, conta: string[] }`. `pix_date` = dia absoluto do Pix (§28: primeiro `payout_weekday` depois do fim da semana); `pix_label` p.ex. `seg 26/10`. Máscaras: CPF `***.***.***-44`, e-mail `a***@dominio.com`, telefone `(**) *****-1234`, aleatória `…ab12cd34`.

### 29.5 Saldo

Saldo da semana = **fechado − pago líquido**: `due_cents − (Σ payout + Σ payout_settlement + Σ payout_reversal)` no razão (com o sinal do razão). Pago exatamente ⇒ 0; pago a menos ⇒ 0 na semana e o resto reaparece como `adjustment` na corrente (uma vez só); o razão do consultor soma 0 quando tudo está pago.

### 29.6 Consultor — `GET /v1/campo/payouts` (`@CampoRoute()`)

Só os dele (id do token). `{ payouts: [ { id, week: {from,to}, due_cents, status, label, pix_date, pix_label, paid_cents, paid_at, has_proof, text } ] }` (até 12 semanas, as mais recentes primeiro; sem chave Pix; bloqueado aparece como `status: 'pending'` com `text` "Falta cadastrar sua chave Pix"). `GET /v1/campo/payouts/:id/proof` entrega o comprovante dele (de outro ⇒ `404`).

### 29.7 CSV — `GET …/export.csv`

UTF-8 **com BOM**, separador `;`, quebra `\r\n`, campos com `;`, `"`, quebra de linha entre aspas (aspas dobradas). Colunas: `Semana início;Semana fim;Consultor;Praça;Tipo da chave;Chave Pix;Valor devido (R$);Valor devido (centavos);Valor pago (R$);Valor pago (centavos);Situação;Pago em;Data do Pix;Observação`. Valores em reais com vírgula (`1.234,50` **sem** milhar: `1234,50`) e também centavos. A chave Pix sai **mascarada**; `include_pix_key=true` (admin) inclui a completa. **Injeção de fórmula:** célula de TEXTO que começa com `=`, `+`, `-`, `@`, tab ou CR recebe um `'` na frente (colunas de valor ficam numéricas, nunca prefixadas). Telefone completo (`5511…`) é gravado só com dígitos, sem `+`, para não ser prefixado. Cancelados ficam fora.

### 29.8 "Atenção agora"

Com as duas flags ligadas, `GET /v1/consultores/attention` ganha `payout_alerts: [ { kind: 'pix_bloqueado'|'pix_falhou', payout_id, consultant_id, name, week, message } ]` (flag desligada ⇒ campo ausente e **nenhuma consulta**).

### 29.9 Variáveis e produção

| Variável | Padrão | Efeito |
|---|---|---|
| `FIELD_PAYOUTS_ENABLED` | `false` | habilita rotas e UI (exige `FIELD_EARNINGS_ENABLED=true`) |

Config: `payout_proof_required` (boolean, padrão `true`) em `field_config`.
**Para produção:** `migrate deploy` antes do código; 2 semanas de F8 conferidas; conferir o storage de fotos (S3 privado) ou `PHOTOS_DIR`; ligar `FIELD_PAYOUTS_ENABLED`; na segunda: **Gerar fila** → pagar no banco → **Marcar como pago** com o comprovante → **Baixar CSV** para a contabilidade.

## 30. P0 da comparação com a versão Lovable — resultado "fechado", motivo de recusa, retorno com hora e contato, modo a pé/carro

Origem: `docs/superpowers/specs/2026-10-20-comparacao-versao-lovable-chefe.md` (§5, P0 1–3). **Sem flag nova.** Todos os campos novos são
opcionais ou têm default (`outcome = 'conversa'`, `travel_mode = 'a_pe'`): o que já existe não muda. Migração aditiva
`20261025100000_p0_comparacao_lovable` (`migrate deploy` antes do código). Nomes no wire em inglês/`snake_case`, como o resto do contrato
(`outcome`, `refusal_reason`, `followup_time`, `contact_phone`, `travel_mode`).

### 30.1 Resultado da visita: `outcome`

Novo campo do rascunho (`AnswersBody`, `PATCH /v1/campo/visits/:ref/answers`) e de `VisitView.answers`:

| Campo | Valores | Padrão |
|---|---|---|
| `outcome` | `conversa` \| `fechado` | `conversa` (coluna `NOT NULL DEFAULT 'conversa'`: toda visita antiga é `conversa`) |

`fechado` = o consultor chegou e o estabelecimento estava fechado (no horário ou de vez; **sem** distinção entre os dois, de propósito). Valor
fora da lista → `400 VALIDATION_ERROR`. Regras do `fechado`:

- **Checkout sem questionário:** `faltando()` só cobra o retorno se o consultor marcou "Sim" (então exige o quê e uma data ≥ hoje, como na conversa); o resto não é cobrado (não há com quem conversar). `outcome` volta a `conversa` quando o consultor desfaz a marca (rascunho).
- **Retorno de uma visita "fechado"** ("volto amanhã às 10h"): vale e entra na fila (§25.4) pelo `followup_date`/`followup_time`, mas NÃO grava `next_step_what`/`next_step_date` no lead (isso é da conversa) e não muda atendente nem estágio.
- **Não é conversa:** o checkout NÃO grava `decisor`/`decisor_role`/`last_contact_at`, NÃO avança o estágio do lead e grava o evento do CRM com `kind = 'note'` (e não `visit`, que está em `CONTACT_KINDS` e contaria como contato), texto "Visita de campo — estabelecimento fechado." (sem respostas).
- **Metas:** fica fora da conta de meta/ritmo: `atencao` (`feitas`), `goal` de `GET /v1/campo/today` e o `progress.done`/`plan.fits_meta` do roteiro. Total e fechadas aparecem **separados**: `GET /v1/campo/today` → `counters.closed`; `GET /v1/consultores` → `today.closed`; `counters.visits` e `today.visits` continuam sendo o total de check-ins do dia (nada muda de significado). A remuneração (`min_visits` do piso, §28) **não** foi alterada: segue contando check-ins/checkouts; é decisão do dono se fechado conta para o piso.
- **Não bloqueia o roteiro:** a parada continua `visitada` desde o check-in (§23.3) e o próximo lugar segue normal. O `fechado` NÃO entra no filtro `dias_sem_revisitar` do roteiro automático (o lugar pode voltar a ser sorteado; ponto fechado de vez se resolve arquivando o lead) e NÃO "resolve" um retorno pendente de visita anterior (§25.4 (1): a visita mais recente é calculada sem as `fechado`).
- **Ressalva do roteiro:** `progress.done` e `plan.fits_meta` não contam o `fechado`, mas o planejador (`jaFeitas`) ainda abate toda parada visitada da meta restante; logo, logo depois de um `fechado` o card da equipe pode mostrar "não cabe a meta" (`done + pendentes = meta − fechados`). Não corrigido de propósito: mudar `jaFeitas` deslocaria a numeração (`seq`) das paradas.
- Mapa de calor/cobertura (§24) não muda: o consultor esteve lá, então o lugar conta como visitado.

### 30.2 Motivo de recusa

Catálogo FECHADO no código (`api/src/domain/catalog/refusal.ts`; **lista padrão, ajustável — o dono confirma**). Espelho de rótulos em `web/src/modules/campo/domain/recusa.ts` (mesmo padrão de `MOTIVOS_PULO`):

| `refusal_reason` | Rótulo |
|---|---|
| `ja_usa_outro_app` | Já usa outro app |
| `sem_interesse_momento` | Sem interesse no momento |
| `nao_contrata_freelancers` | Não contrata freelancers |
| `decisor_ausente` | Dono/decisor ausente |
| `preco` | Preço |
| `outro` | Outro |

Campos do rascunho: `refusal_reason` (slug acima ou `null`) e `refusal_note` (texto livre ≤ 120, **só** com `refusal_reason = 'outro'`). A tela pergunta quando `interest = 'nenhum'`.
Normalização no servidor, sempre sobre o estado **já mesclado** (o PATCH é parcial): `refusal_reason` só vale com `interest = 'nenhum'` e `outcome = 'conversa'` (senão vira `null`); `refusal_note` só vale com `refusal_reason = 'outro'` (senão `null`). Slug fora do catálogo → `400 VALIDATION_ERROR`.
**Não é exigido no checkout** (`faltando()` não muda): um rascunho enfileirado antes do deploy não pode tomar `422` e travar a fila offline; a tela é quem pede. O motivo aparece no detalhe da visita (equipe: linha do tempo do consultor) e em `resumoVisita` (evento do CRM).
Indicadores por motivo (ranking de recusas): **não feitos** — fica para depois (não há lugar natural hoje; os indicadores do campo ainda não agregam respostas do questionário).

### 30.3 Retorno com hora e contato do atendente

Campos novos no rascunho e em `VisitView.answers`:

| Campo | Formato | Regra |
|---|---|---|
| `followup_time` | `HH:mm` (24 h, Brasília) ou `null` | opcional; só vale com `needs_followup = true` (senão `null`); **não** se rejeita hora que já passou (a hora pode passar durante a visita ou offline); `followup_date` continua só-dia e é quem define `hoje`/`atrasado` |
| `contact_phone` | só dígitos, 10–11 (DDD + número) | opcional; o servidor tira tudo que não é dígito e um `55` inicial quando sobram 12–13 dígitos; inválido → `400 VALIDATION_ERROR` com mensagem que **não repete o número**. `null`/`""` limpa |

O nome de quem atendeu já é `interlocutor_name` (obrigatório): **não** se criou campo de nome novo. O telefone é dado pessoal de terceiro: nunca vai para log, erro ou `lead_events`/`resumoVisita`; só trafega em `VisitView.answers` (consultor dono e equipe, detalhe da visita).

`FollowupView` (§25.4, equipe e consultor) ganha: `followup_time` (`HH:mm` | `null`), `contact_phone_masked` (`(11) 9****-4321`; 10 dígitos: `(11) ****-4321`; `null` sem telefone) e **somente** em `GET /v1/campo/followups` (as visitas dele) `contact_phone` (completo, para `tel:`/`wa.me`). A fila da equipe nunca recebe o número completo.
Ordem da fila (`compararRetornos`): `followup_date` ↑; no mesmo dia, **com hora antes de sem hora**, os com hora por `followup_time` ↑; depois nome (pt-BR) e `visit_id`. Sem nenhuma hora, a ordem é a de antes.
Roteiro automático (§25.6): os retornos vencidos entram ancorados no começo; agora **os combinados para HOJE com hora vêm primeiro, por hora** (hora de retorno atrasado, de data anterior, não ordena), e os demais seguem pelo vizinho mais próximo, como antes. O corte `MAX_RETORNOS_NO_ROTEIRO` segue a nova ordem. O relógio do roteiro **não espera** a hora marcada: a hora é só ordem e rótulo (a tela mostra "combinado para 15:30"), o ETA continua sendo o da caminhada.

### 30.4 Modo de deslocamento: `travel_mode`

`field_routes.travel_mode` (`NOT NULL DEFAULT 'a_pe'`): `a_pe` | `carro`. Define a **velocidade** usada no relógio do roteiro (ETA de cada parada e quantas paradas cabem na janela/meta):

| Modo | Velocidade | Conta do trecho |
|---|---|---|
| `a_pe` | `velocidade_kmh` da configuração (§23.1; padrão 4,5) | `ceil( metros_em_linha_reta × fator_desvio ÷ (velocidade × 1000 ÷ 60) )` minutos |
| `carro` | env `ROTA_VELOCIDADE_CARRO_KMH` (padrão **25**; faixa 5–80), **fotografada** no roteiro (`params_snapshot.velocidade_carro_kmh`) | a mesma conta; `fator_desvio` continua valendo |

Exemplo com `fator_desvio = 1,3`: 1,0 km em linha reta → 1,3 km de rua → a pé (4,5 km/h) `ceil(1300 ÷ 75)` = 18 min; de carro (25 km/h) `ceil(1300 ÷ 416,67)` = 4 min. O tempo parado em cada visita (`minutos_por_visita`) não muda com o modo — **o 25 km/h é média urbana com o carro em movimento, sem estacionar** (por isso o padrão é conservador e vale validar com os consultores).
A velocidade fotografada não muda se o env mudar depois; ao trocar o modo (ou remontar escolhendo `carro` num roteiro que ainda não tinha foto) ela é gravada de novo a partir do env atual.

- `POST /v1/routes` (`MontarRotaDto`, §23.4) ganha `travel_mode?` (sem default no DTO): ausente = **mantém** o modo do roteiro existente, ou `a_pe` num roteiro novo. Valor fora da lista → `400`. Trocar o modo recalcula ETAs e o corte pelo plano completo (sobe `version`).
- Todo cálculo sobre roteiro existente usa o modo dele: pular, adiar, desfazer, reordenar (`PUT …/order`), refazer (equipe e consultor) e a leitura (`routeView`). O roteiro automático/do consultor nasce `a_pe` (a equipe escolhe o modo ao montar).
- `RouteView` ganha `travel_mode` e `travel: { mode, speed_kmh, detour_factor, text }` — `text` é a conta escrita ("A pé: 4,5 km/h × desvio de rua 1,3" / "De carro: 25 km/h × desvio de rua 1,3 (média urbana, sem estacionar)"). `params.velocidade_kmh` continua sendo a de caminhada.
- Env: `ROTA_VELOCIDADE_CARRO_KMH` (inteiro ou decimal 5–80, vazio = 25). Documentada em `.env.example`.

### 30.5 Ordem de subida (obrigatória)

`migrate deploy` → **API** → **web**. Nunca o web antes da API: o web novo manda `outcome`, `refusal_*`, `followup_time`, `contact_phone` nos rascunhos e `travel_mode` ao montar o roteiro, e a API antiga (`whitelist + forbidNonWhitelisted`) responde `400` a campo que não conhece, quebrando todo salvamento de rascunho e todo "Montar roteiro". API nova com web antigo é seguro (todos os campos são opcionais).

## 31. Modo do chefe, S0 e S1 — fluxo da visita `simples` x `completo`

Origem: `docs/superpowers/specs/2026-10-20-modo-chefe-arquitetura.md` (eixo A, §0, §4.3), `…-fluxo-simples-ux.md` e a versão Lovable do chefe
(`src/lib/visita.ts`: `STATUS_FINAL`, `MOTIVOS_NAO`, `pendenciasFinalizar`, `precisaJustificativa`; `roteiro.$rotaId.tsx`, raio de 200 m).
**Tudo é configurável** pela tela de equipe (Configurações do campo); o padrão do modo `simples` é o da spec (que já decidiu por segurança) e o botão
"Perfil do chefe" preenche o formulário com os valores exatos da Lovable. O servidor não conhece "perfil": só as chaves. O modo `completo` (o fluxo atual) fica intacto.
Migração aditiva `20261026100000_modo_chefe_s1`; erros no formato plano `{ error: { code, message } }`; wire `snake_case`.
S0/S1 não tocam em dinheiro: remuneração, ganho declarado e regra versionada ficam para S2/S3 (§4.4 da arquitetura).

### 31.1 Trava de lançamento: `FIELD_VISIT_FLOW_SELECT_ENABLED` (padrão `false`)

| Estado | Efeito |
|---|---|
| Desligada | `fluxo_visita` (global e por consultor) é **ignorado**: toda visita nova nasce `completo`; `result`/`distance_note` no corpo → `422 FLOW_MODE_MISMATCH`; `DELETE /v1/campo/visits/:ref` → `404 FLOW_SELECT_DISABLED`; `features.visit_flow = false`. **Prod fica idêntica à de hoje** (provado por testes de caracterização). |
| Ligada | Fluxo = consultor (`field_consultants.visit_flow`) → global (`field_config.fluxo_visita`) → **`simples`** (chave ausente). Reverter sem reiniciar: `PUT fluxo_visita = "completo"`. |

Passos do dono: (1) deploy com a flag desligada; (2) ligar a flag e reiniciar: o `simples` vale para visitas abertas dali em diante; (3) voltar = `PUT fluxo_visita: "completo"` ou desligar a flag.

### 31.2 O fluxo é da visita (`field_visits.flow`)

`flow` (`simples` \| `completo`, `NOT NULL DEFAULT 'completo'`) é gravado **na abertura** (check-in). Checkout, rascunho e fila offline são validados contra ele, nunca contra a configuração de agora.

- O check-in (multipart) aceita o campo opcional `flow` — a dica do aparelho (o fluxo da tela que o consultor viu, vindo do `/me` guardado, mesmo sem sinal). **Com a flag ligada** o servidor a respeita (`simples`\|`completo`); sem a dica, ou com a flag desligada, vale o resolvido no servidor (§31.1). Motivo: a fila offline pode enviar o check-in depois de a equipe trocar a chave; sem a dica, a tela `simples` abriria uma visita `completo` e o rascunho seria recusado. **Risco aceito e registrado:** o consultor poderia forjar o valor chamando a API na mão; o efeito é só em dados dele (menos perguntas), sem dinheiro.
- Corpo do outro fluxo → `422 FLOW_MODE_MISMATCH` (`result` num rascunho `completo`). Os campos do questionário antigo são aceitos nos dois fluxos (no `simples` viram "Mais detalhes", opcionais, **todos preservados**).
- `VisitView` ganha `flow`. Visitas antigas = `completo`.

### 31.3 Configuração — `GET/PUT /v1/consultores/settings/config` (leitura: equipe; escrita: só admin)

Chaves novas (todas opcionais no PUT; chave desconhecida ou fora da faixa → `400 VALIDATION_ERROR`; valores em `field_config`):

| Chave | Valores | Padrão (chave ausente) | "Perfil do chefe" (Lovable) |
|---|---|---|---|
| `fluxo_visita` | `simples` \| `completo` \| `null` (= sem escolha) | `null` → com a flag ligada, `simples` | `simples` |
| `justificativa_distancia` | `nao` \| `opcional` \| `obrigatoria` | `opcional` | `obrigatoria` (Lovable: `precisaJustificativa`, raio 200 m) |
| `contato_obrigatorio_em` | subconjunto de `cadastrou`,`ja_usa`,`retorno`,`sem_interesse` | `["retorno","cadastrou"]` (decisão do designer) | os quatro (Lovable: contato em todo status menos "fechado") |
| `contato_campos` | subconjunto de `nome`,`cargo`,`telefone` | `["nome","cargo","telefone"]` | os três (Lovable: nome, telefone ≥ 10 dígitos, cargo) |
| `fechado_conta_na_meta` | boolean | `true` (só visitas `simples`; ver §31.6) | `true` |
| `desfazer_segundos` | inteiro 0–30 | `8` | `8` |

"Perfil completo" (preset) = `fluxo_visita: "completo"` e os demais nos padrões. Os presets **só preenchem o formulário**; o admin revisa e salva.
`GET` devolve as chaves já normalizadas (padrão onde faltar) e `presets: { completo: {…}, chefe: {…} }` para o formulário. `fluxo_visita` volta como `null` quando não há escolha.

**Exceção por consultor:** `PATCH /v1/consultores/:id` (admin) aceita `visit_flow` (`simples` \| `completo` \| `null` = seguir o padrão); `ConsultorView` devolve `visit_flow` (a exceção) e `visit_flow_effective` (o que vale agora). O consultor vale mais que o global. O consultor **não** troca o próprio fluxo.

### 31.4 `GET /v1/campo/me`

`features.visit_flow` (boolean: a flag), `visit_flow` (`simples`\|`completo` resolvido agora) e, com a flag ligada, `visit_config: { justificativa_distancia, contato_obrigatorio_em, contato_campos, fechado_conta_na_meta, desfazer_segundos }` para a tela conferir o que falta **sem sinal** (o servidor continua a decidir: `422`). Flag desligada: `features.visit_flow = false`, `visit_flow = "completo"` e sem `visit_config`.

### 31.5 Resultado da visita `simples`

Campos novos do rascunho (`PATCH /v1/campo/visits/:ref/answers`) e de `VisitView.answers` (`null` limpa; sem inicializador no DTO):

| Campo | Valores |
|---|---|
| `result` | `cadastrou` (Cadastrou agora) \| `ja_usa` (Já usa o Freela) \| `retorno` (Quer retorno) \| `sem_interesse` (Sem interesse) \| `fechado` (Estabelecimento fechado) |
| `distance_note` | texto ≤ 200: por que a visita foi feita longe do local (só tem efeito com `far_from_place`) |

O servidor **deriva** os campos antigos do resultado a cada gravação (o consultor não precisa enviá-los):

| `result` | `outcome` | `freela_status` | `interest` | `needs_followup` | `followup_what` |
|---|---|---|---|---|---|
| `cadastrou` | `conversa` | `declarou` | `alto` (se vazio) | `false` | — |
| `ja_usa` | `conversa` | `ja_usa` | — | `false` | — |
| `retorno` | `conversa` | `null` | `medio` (se vazio) | `true` | `Retornar` (se vazio) |
| `sem_interesse` | `conversa` | `nao_cadastrou` | `nenhum` (se vazio) | `false` | — |
| `fechado` | `fechado` | `null` | — | `false` | — |

`outcome`, `freela_status` e `needs_followup` são sempre sobrescritos pela derivação; `interest` e `followup_what` só quando vazios (o que o consultor preencheu em "Mais detalhes" vale). `freela_status = 'declarou'` é valor novo (conjunto fechado no código, sem enum de banco): **não** reaproveita `cadastrou_qr`, para não poluir os indicadores de QR (arquitetura §1.1). Divergência anotada: a arquitetura mapeia "não cadastrado" para `interest: baixo`; aqui `sem_interesse` deriva `nenhum`, porque a normalização do motivo de recusa (§30.2) descartaria o motivo com outro interesse. A normalização passa a aceitar `result = sem_interesse` como equivalente a `interest = nenhum`.

**Motivos de recusa** (`refusal_reason`, §30.2): ganha o slug `sem_demanda` ("Sem demanda"), que a Lovable tem (`MOTIVOS_NAO`) e o catálogo não tinha (só se acrescenta; nada é renomeado).

**O que o checkout `simples` exige** (`faltandoSimples`; `422 ANSWERS_INCOMPLETE`, mensagem `Falta responder: …`):

| Condição | Exigência |
|---|---|
| sempre | `result` ("resultado da visita") |
| `sem_interesse` | `refusal_reason` ("motivo") |
| `retorno` | `followup_date` ("quando voltar"), ≥ hoje (dia do carimbo); hora (`followup_time`) opcional |
| `result ∈ contato_obrigatorio_em` | cada item de `contato_campos`: `nome` (= `interlocutor_name`), `cargo` (= `interlocutor_role`), `telefone` (= `contact_phone`, 10–11 dígitos) |
| visita `far_from_place` e `justificativa_distancia = obrigatoria` | `distance_note` ("motivo de a visita ter sido longe do local") |

As 8 perguntas antigas **não** são exigidas. Divergência anotada com a UX (A2: "Quer retorno" com 0 digitação): o padrão exigido pelo pedido do dono é contato em `retorno` e `cadastrou`; para o fluxo sem digitação, esvaziar `contato_obrigatorio_em`.

**Efeitos do checkout `simples`:** evento do CRM com `resumoVisitaSimples` ("Visita de campo — resultado: Sem interesse (Preço)…", nunca o telefone); `fechado` → evento `note`, não grava atendente nem estágio (§30.1); `cadastrou` → **não** muda o número do estágio (arquitetura §1, linha 2; sair das rotas como estágio alto é S3); `ja_usa`, `retorno`, `sem_interesse` → `estagioDepoisDaVisita` (1,2 → 3) como hoje; atendente/cargo só se informados; `retorno` grava `next_step_what`/`next_step_date` no lead e entra na fila de retornos (§25.4).

### 31.6 Meta

`fechado` hoje fica fora da meta (§30.1) e **continua assim no `completo`**. No `simples`, `fechado_conta_na_meta = true` (padrão) faz o "fechado" fotografado **contar** na meta/ritmo (`goal`, `atencao.feitas`, `progress.done` do roteiro); "Pular > Fechado" (sem check-in) nunca conta. Quem decide é `contaNaMeta({ outcome, flow }, cfg)`: `outcome !== 'fechado' || (flow === 'simples' && fechado_conta_na_meta)`. `counters.closed` continua sendo o total de "fechado". `counters` ganha `cadastrou_agora` (visitas com `result = cadastrou`; `cadastrou_qr` continua só QR). Remuneração não muda.

### 31.7 Cancelar visita aberta por engano — `DELETE /v1/campo/visits/:ref` (`@CampoRoute()`)

Versão mínima: só **visita aberta, do próprio consultor, de fluxo `simples`, com a flag ligada**. É **exclusão** (não "cancelada"): apaga a visita, a foto do storage e o ponto de check-in da trilha, e devolve a parada do roteiro (se houver) para `pendente`. O estabelecimento criado por `new_place` **fica** (pode ter outro vínculo; a equipe vê como "visita de campo"). Respostas: `200 { cancelled: true }`; `404 NOT_FOUND` (inexistente, de outro consultor ou já cancelada: o aparelho trata como sucesso); `409 VISIT_CLOSED` (já fez checkout); `422 FLOW_MODE_MISMATCH` (visita `completo`); `404 FLOW_SELECT_DISABLED` (flag desligada). Nada de lead/estágio foi mexido antes do checkout, então não há o que reverter ali.
**Desfazer 8 s** é do aparelho: o checkout `simples` espera `desfazer_segundos` na fila local (`proxima_em`) e o toast "Desfazer" o remove antes do envio; o servidor não conhece o desfazer.

### 31.8 Banco (migração aditiva `20261026100000_modo_chefe_s1`)

`field_visits`: `flow TEXT NOT NULL DEFAULT 'completo'` (CHECK `simples`\|`completo`), `result TEXT NULL` (CHECK nos 5 valores), `distance_note TEXT NULL`. `field_consultants`: `visit_flow TEXT NULL` (CHECK). Sem `DROP INDEX`, sem migração de dado em `field_config`.
`field_visits.checklist` (arquitetura §4.1) fica para a fase do checklist (S5, `FIELD_CHECKLIST_ENABLED`): nada usa a coluna agora.

### 31.9 Variáveis

| Variável | Padrão | Efeito |
|---|---|---|
| `FIELD_VISIT_FLOW_SELECT_ENABLED` | `false` | liga a escolha do fluxo (§31.1) |

**Ordem de subida:** `migrate deploy` → **API** → **web**. O web novo manda `flow` no check-in (multipart) e `result`/`distance_note` nos rascunhos; a API antiga (`whitelist + forbidNonWhitelisted`) responderia `400`. Com a flag desligada o web mantém a tela atual e não manda nada novo.
