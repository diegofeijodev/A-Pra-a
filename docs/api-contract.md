# PRAÇA — contrato da API

Base: `http://localhost:3014`. Documento **canônico**: mudou endpoint, atualize
aqui primeiro. Swagger interativo em `/docs` (fora de produção).

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
- Throttle: 300 req/min por IP.

## 2. Auth — `/v1/auth`

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/login` | `{email, password}` | `{access_token, user}` |
| GET | `/me` | — | `{user}` |

`user` é sempre um `UserView` (ver §3). Erros: `INVALID_CREDENTIALS` (e-mail
ou senha não batem), `UNAUTHORIZED` (senha certa, conta desativada — mesmo
código que o guard usa quando a conta é desativada depois do token emitido).

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
| `lost_reasons` | `funnel.ts` | motivos de perda de lead |
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
`shared/users` (`diego@praca.local`, `daniel@praca.local`, `mkt@praca.local`);
o serviço de indicadores (tarefa futura) resolve para `owner_id` procurando o
usuário por e-mail, `null` se não existir.

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

- `cobertura` é `null` quando a praça foi aberta sem cidade-sede do IBGE.
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
  `prospecção ativa`, `evento`). `classe` e `lost_reason`, esses sim, são
  conjuntos fechados do catálogo.
- **PATCH** não aceita `stage`: etapa muda só pelo `/move`, que grava o evento
  e reinicia o `stage_since`. Mandar `stage` no PATCH →
  `400 VALIDATION_ERROR` (`forbidNonWhitelisted`).
- **move**: `stage` é 1..8 e precisa ser diferente da atual
  (`400 SAME_STAGE`). Etapa 8 exige `lost_reason` do catálogo
  (`400 LOST_REASON_REQUIRED`); as outras exigem `next_step`
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
  (distribui em ordem entre `rodizio_ids`; vazio = todo mundo ativo).
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

## 11. Formulário público — `/v1/public`

Porta pública do formulário de captura (`.prototype/src/routes/formulario.$pracaId.tsx`):
embutido em landing page/anúncio, sem login. As duas rotas são `@Public()` e
**não** entram no throttle de 300 req/min — o `POST` tem o seu próprio, bem
mais apertado.

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
  Telefone vazio nunca casa como duplicata.
