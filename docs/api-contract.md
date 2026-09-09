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
mais apertado: **`PUBLIC_LEADS_PER_MINUTE` por minuto e por IP** (padrão 10, o
valor de produção; em desenvolvimento sobe para o smoke rodar duas vezes
seguidas). Estourar responde `429 TOO_MANY_REQUESTS`.

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

## 12. Mensagens — `/v1/msg-templates`, `/v1/settings`, `/v1/blocklist`

Modelos de mensagem (com A/B e medição), configurações de envio da operação e
lista de bloqueio. Porta de `.prototype/src/lib/praca/mensagens.ts`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/v1/msg-templates` | — | `TemplateView[]` |
| POST | `/v1/msg-templates` | `TemplateBody` | `TemplateView` |
| POST | `/v1/msg-templates/render` | `{text, lead_id?}` | `{text, missing}` |
| PUT | `/v1/msg-templates/:id` | `TemplateBody` | `TemplateView` |
| DELETE | `/v1/msg-templates/:id` | — | `{ok: true}` |
| GET | `/v1/settings` | — | `SettingsView` |
| PATCH | `/v1/settings` | campos opcionais | `SettingsView` |
| GET | `/v1/blocklist` | — | `BlockView[]` |
| POST | `/v1/blocklist` | `{phone, name?, reason?, lead_id?}` | `BlockView` |
| DELETE | `/v1/blocklist/:id` | — | `{ok: true}` |

Todas exigem JWT. `:id` malformado → `404 NOT_FOUND` (nunca 500).

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

## 13. Disparos — `/v1/disparos`, `/v1/sends`

Um disparo é **uma mensagem, para um grupo de pessoas, uma vez**: o filtro do
funil vira público, o modelo vira texto renderizado lead a lead e cada mensagem
vira uma linha em `msg_sends`. Porta de
`.prototype/src/components/praca/Disparos.tsx` e de `store.tsx:588-710`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/v1/disparos/preview` | `{filters, template_id, split?, mode, scheduled_at?}` | `DisparoPreview` |
| POST | `/v1/disparos` | o mesmo + `name?` | `{id, created, skipped_block, skipped_dup}` |
| GET | `/v1/disparos` | — | `DisparoView[]` (mais novo primeiro) |
| GET | `/v1/disparos/:id` | — | `{disparo, stats, by_hour, sends}` |
| DELETE | `/v1/disparos/:id` | — | `{ok: true}` — **só admin** |
| POST | `/v1/sends/:id/mark` | `{status}` | `SendView` |
| POST | `/v1/sends/:id/reply` | `{text}` | `{blocked}` |

Todas exigem JWT. `:id` malformado → `404 NOT_FOUND` (nunca 500). `DELETE` leva a
fila do lote por cascata (`msg_sends.disparo_id`), por isso é só de admin — o
caminho normal é deixar o histórico.

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

`freela` é sempre `null` até a Task 15 (é onde vai o texto convertido para o
formato de campanha do Freela e as variáveis que ele não suporta). Modelo
inexistente → `404 NOT_FOUND`.

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
  (`src/modules/disparos/freela-gate.ts`; hoje é **sempre** — a Task 15 troca a
  porteira por `FreelaClient.isConfigured()`).
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
da tela). Envio já `respondida` → `400 ALREADY_REPLIED` ("Este envio já foi
respondido."): voltar atrás apagaria a resposta do painel e gravaria um segundo
evento de saída. Grava `sent_at` se ainda estiver vazio e **não reescreve** o que
já existe. `enviada` é o toque de verdade: grava evento `msg_out` na timeline do
lead — `"<modelo> (variação A) enviada por WhatsApp."` (rótulo do canal, §4) — e
atualiza `last_contact_at`, o que zera os dias parados do funil. `entregue` só
confirma a entrega, sem evento novo. Responde o `SendView` atualizado.

`reply` — `{text}` (1 a 2000). Marca `respondida`, grava `replied_at`
(e `sent_at` se estiver vazio), grava evento `msg_in` com o texto e atualiza
`last_contact_at`. Resposta que pede para parar (`catalog.optout_words`) entra na
`blocklist` na hora, com `name` do lead, `lead_id` e motivo
`pediu para não receber: “<texto>”` — número já bloqueado não vira erro. Responde
`{blocked}` (`true` = o texto é um pedido de opt-out).

`reply` apara o texto antes de validar: corpo só com espaço é `400
VALIDATION_ERROR`.

As duas rotas gravam **tudo num commit** — envio, evento do lead,
`last_contact_at`, bloqueio do opt-out e o fechamento do disparo em `concluido`.
Nada de "pediu para parar" registrado sem o número bloqueado, nem lote com a fila
zerada preso em `agendado`.

Envio inexistente → `404 NOT_FOUND`.

---

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

Combinação errada (mensagem sem texto nem modelo, tarefa sem `task`, condição sem
`rule`) → `400 VALIDATION_ERROR` com o índice do nó (`nodes[2]: …`).

### `PUT /v1/cadences/:id`

Mesmo corpo do `POST` e substitui a cadência inteira, com uma regra que importa:
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
normal, um motivo de `catalog.exit_reason_label` (`respondeu`, `abriu_vaga`,
`reaquecer_30`, `reaquecer_60`, `fila_confirmacao`, `fecha_conta`, `fim`,
`bloqueio`, `manual`); a saída disparada por uma **condição** grava o motivo da
regra (`abriu_vaga`) ou, nas outras regras, o **id da ação** (`sai`,
`reaquecer_30`…) — é o que o protótipo faz, e a tela cai no id quando não há
rótulo. `POST /v1/enrollments/:id/exit` só aceita os motivos do catálogo.
`logs` é o rastro do que já foi cumprido, um por nó (`kind ∈ msg |
task | cond`; `send_id` só na mensagem). `next_at` é quando o próximo nó vence.

`POST /v1/enrollments/:id/exit` marca `saiu` com `exit_reason = reason ?? manual`
— tirada na mão, sem os efeitos das saídas do motor (não mexe em etapa,
reaquecimento nem próximo passo).

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
   `entry ∈ catalog.auto_entries` (`stage_novo` = etapa 1, `reheat_due` =
   `reheat_at <= hoje`, `first_vaga` = etapa 6). As outras regras
   (`praca_mapeamento`, `freela_first_turn`, `manual`) entram só pelo `enroll`.
   Fora: arquivado, `is_test` e quem **já teve** inscrição naquela cadência (em
   qualquer estado — senão quem saiu voltaria na rodada seguinte, para sempre).
   Teto de 30 por rodada e por cadência (`catalog.max_enroll_per_tick`), mais
   antigos primeiro. Quem já roda outra cadência entra `aguardando`.
2. **Avanço** de quem está `ativo` com `next_at <= agora` (cadência pausada não
   anda). Caminha pelos nós enquanto vencerem:
   - trilha acabou → sai com a ação de `exit` e motivo `fim`;
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
| `sai_conversa` | `Saiu da cadência “X” (respondeu) → etapa Conversa aberta.` | etapa 3, `stage_since` hoje |
| `reaquecer_30` / `reaquecer_60` | `Saiu da cadência “X” → fila de reaquecimento em N dias.` | `reheat_at` = hoje + N |
| `fila_confirmacao` | `Saiu da cadência “X” → fila de ligação de confirmação.` | próximo passo `Ligar para confirmar presença` hoje |
| `fecha_conta` | `Cadência “X” encerrada — conta fechada e resultado registrado.` | — |
| `sai` (e qualquer outra) | `Saiu da cadência “X”.` | — |

`fim` e `fecha_conta` fecham a inscrição como `concluido`; o resto é `saiu`.

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
