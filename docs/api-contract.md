# PRAÇA — contrato da API

Base: `http://localhost:3014`. Documento **canônico**: mudou endpoint, atualize
aqui primeiro. Swagger interativo em `/docs` (fora de produção).

## 1. Convenções

- Wire **snake_case**, espelhando o banco.
- Data "só dia": string `"YYYY-MM-DD"`. Timestamp: ISO UTC. "Hoje" vem de
  `todaySp()` (`src/common/time/dates.ts`), nunca de `new Date().toISOString()`.
- Erro **sempre** `{ "error": { "code": "CODIGO", "message": "texto" } }`.
- Autenticação: `Authorization: Bearer <jwt>` (HS256, 12h). Rotas públicas
  (`@Public()`): `GET /health`, `POST /v1/auth/login` e `GET /v1/catalog`.
  Todas as demais exigem token — `JwtAuthGuard` é global.
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
referencia `pracas.id` (sem FK no banco — a praça é criada em tarefa futura);
`null` desvincula.

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
