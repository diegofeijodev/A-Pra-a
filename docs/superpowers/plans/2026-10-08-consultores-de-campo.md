# Consultores de campo — bloco A — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contas de consultor de campo separadas da equipe, com jornada e trajeto por GPS, visitas (check-in com foto da fachada + questionário + checkout) que funcionam com sinal ruim, QR code do código de indicação no Freela, fechamento automático à meia-noite, registro no CRM e telas de acompanhamento para a equipe.

**Architecture:** Um módulo novo `api/src/modules/campo/` (consultor, jornada, visita, leitura da equipe, sincronização do código no Freela, fotos), regras puras em `api/src/domain/campo-rules.ts`, e um guard próprio (`CampoAuthGuard`, token com `aud: "campo"`) para o qual o `JwtAuthGuard` global delega as rotas marcadas com `@CampoRoute()`. No web, as telas do consultor vivem em `web/src/app/campo/` (fora do grupo `(app)`, com sessão própria `campoSession` e um axios próprio) e enviam tudo por uma fila no IndexedDB que o servidor aceita de forma idempotente por `client_id`; as telas da equipe vivem em `web/src/app/(app)/consultores/`.

**Tech Stack:** NestJS 11 + Fastify + Prisma 5.22 + PostgreSQL (api, npm, jest) · Next.js 15 + React 19 + Tailwind 4 + shadcn + TanStack Query + zustand (web, yarn) · Leaflet (já no projeto) · novas: `@aws-sdk/client-s3@3.1012.0` (api), `qrcode.react@4.2.0` (web), `vitest@3.2.4` (web, dev).

**Spec:** `docs/superpowers/specs/2026-10-08-consultores-de-campo-design.md` (aprovado pelo dono em 08/10/2026; §14 resolvido: aceitar o e-mail de boas-vindas do Freela — **nada muda no `api-freela`**).

## Global Constraints

- `api/` usa **npm**; `web/` usa **yarn**. Nunca misturar.
- **Não tocar no `api-freela`** (nem em nenhum outro repo do workspace). O e-mail de boas-vindas do Freela é aceito como está (§14 do spec).
- Wire **snake_case** espelhando o banco. Dia = `"YYYY-MM-DD"` de Brasília via `todaySp()`; nunca `toISOString()` para "hoje".
- Erros sempre `{ error: { code, message } }`; no web, ler com `apiErrorMessage()` — nunca achatar para `error.message`.
- **Contrato primeiro:** `docs/api-contract.md` §20 é escrito na Task 1, antes do código.
- Id de URL passa por `isUuid()` antes do Prisma; rotas estáticas **antes** das `:id` no controller.
- Campo opcional de DTO que muda invariante **não** leva inicializador.
- A API roda em **uma** instância (o `@Cron` da meia-noite assume processo único).
- Token do consultor: mesmo `JWT_SECRET`, **`aud: "campo"`**, validade `CAMPO_JWT_EXPIRES_IN` (padrão **`7d`**).
- Distância: haversine; `far_from_place` quando o check-in está a **mais de 200 m** do estabelecimento com localização; duplicado = nome parecido a até **100 m**; "perto de mim" = raio de **500 m**; busca por nome = até **20** resultados.
- Carimbo de hora: aceita `at` entre o início da jornada e **agora + 2 min**, no máximo **24 h** no passado; fora disso usa a hora de recebimento e marca `clock_adjusted`.
- Pontos de trajeto: um a cada **5 min** com a página aberta, descartando `accuracy > 100 m`; lote de até **50** pontos.
- Foto: web reduz para no máximo **1600 px** no lado maior, **JPEG qualidade 0,75**; API aceita **JPEG/PNG/WEBP até 5 MB** (teto de multipart que o projeto já usa).
- Fechamento automático: `@Cron` às **00:05 (Brasília)**.
- CRM no checkout: estágio **1 ou 2 → 3**; ≥ 3 mantém; "Cadastrado" (5) fica para o bloco C.
- Freela: `POST /v1/admins/consultants` com `notes = "Consultor de campo — Praça"`; link do QR = `${FREELA_WEB_URL}/cadastro?consultor=${freela_code}`.
- Canais iniciais: `["Nenhum", "Grupos de WhatsApp", "Indicação de conhecidos", "Agência de mão de obra"]`.
- Fotos: chave `campo/<consultant_id>/<day>/<visit_id>.<ext>`; bucket S3 **privado**; em produção o padrão é `s3`, `disk` só com `PHOTO_STORAGE=disk` explícito; a foto só sai pela API (sem link público).
- Telas do consultor: mobile-first, uma coluna, botões grandes, CTA fixo no rodapé, uso com uma mão.
- **Regras de baixo consumo (máquina do dono):** nunca `npm run build`/`nest build`/`next build`; jest com `maxWorkers: 1` (rodar arquivo único: `npx jest caminho`); só **um** de {jest, tsc, vitest, API, `next dev`} de pé por vez — a única combinação permitida é API (`start:smoke`) + `yarn dev` para o `browser-check`; smoke = `npm run start:smoke` em segundo plano → `curl -s localhost:3014/health` → `npm run smoke` → matar o processo → `ss -ltn | grep -E ':(3014|3024) '` vazio; `npm run typecheck` uma vez, sozinho, no fim da tarefa.
- Banco: `docker compose up -d postgres` (raiz do `praca/`) antes de migração/smoke; `docker compose stop postgres` no fim da Task 13.
- Versões exatas das dependências novas: `@aws-sdk/client-s3@3.1012.0`, `qrcode.react@4.2.0`, `vitest@3.2.4`.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Reenvio duplicado por rede instável** (a resposta do checkout ou do "encerrar jornada" se perde e a fila manda de novo, ou o dedo toca duas vezes): o servidor responde 200 com a visita/jornada já fechada e grava **um** evento no CRM — nunca 409 que trave a fila nem dois eventos. Testes: Task 6 (`checkout` reenviado e concorrente) e Task 5 (`end` reenviado).
2. **Fila guardada depois de o token expirar (7 dias) ou de a senha ser trocada:** 401 pausa a fila sem apagar nada, a tela volta para `/campo/entrar`, e depois do login a fila envia com o token novo (lido na hora do envio, nunca guardado no item). Teste: Task 10 (`classificar` + `drenar` com 401).
3. **Foto HEIC ou grande do iPhone:** o web converte para JPEG ≤ 1600 px; se o navegador não decodificar, só manda o original quando ele já é JPEG/PNG/WEBP ≤ 5 MB, senão explica; a API confere os **bytes mágicos** (não o mimetype declarado) e responde `400 INVALID_FILE_TYPE`/`413 FILE_TOO_LARGE`. Testes: Task 3 (`tipoDaImagem`), Task 6 (check-in com HEIC), Task 11 (`escolherEnvio`).
4. **Fuso na virada do dia:** às 22h30 de Brasília (já é o dia seguinte em UTC) a jornada de hoje **não** pode ser fechada; o fechamento olha `day < todaySp(agora)`. Teste: Task 5 (`closeStale` às 01:30Z).
5. **Consultor desativado no meio do dia / e-mail já usado no Freela:** o próximo request do consultor toma 401 (por `active` e `token_version`), a jornada aberta é fechada pela meia-noite (que não filtra por `active`); o 409 do Freela por e-mail duplicado vira `freela_sync_error` fixo e o relógio de 2 min **não** tenta de novo (a não ser que o consultor seja nosso — aí é adotado). Testes: Task 2 (guard), Task 5 (`closeStale` com consultor inativo), Task 4 (`CampoFreelaService`).

## Decisões deste plano (lacunas e contradições do spec)

Cada item é uma escolha feita aqui para fechar algo que o spec não dizia ou dizia diferente do código; todas entram no contrato (§20.9) para o revisor achar.

1. **`lead_events.kind = "visit"`, não `"visita"`.** O catálogo já tem `EventKind = 'visit'` (rótulo "Visita", conta como contato em `CONTACT_KINDS`, e o painel do lead mostra `event_labels[e.kind]`). Com `"visita"` o evento não contaria como contato nem teria rótulo.
2. **`GET /v1/campo/places/similar?name=&lat=&lng=`** é rota nova: é ela que faz a pergunta "Já existe 'X' a 40 m — é esse?" antes do check-in. O check-in com `new_place` aceita `confirm_new`: `true` (o consultor respondeu "é outro") pula a conferência; ausente/`false` (check-in feito sem sinal, sem como perguntar) **não bloqueia** — cria o lead com `possible_dup = true` quando houver parecido.
3. **`:ref` das rotas de visita aceita o `id` do servidor ou o `client_id`** da visita (sempre do próprio consultor). A fila offline só conhece o `client_id`.
4. **Reenvio = 200 com o que já existe:** `start`/`visits` pelo `client_id`; `checkout` de visita já fechada devolve a visita; `end` sem jornada aberta devolve a última jornada encerrada há menos de 24 h.
5. **`POST /v1/campo/auth/change-password` recebe `{current_password, new_password}`**; senha atual errada é `400 WRONG_PASSWORD` (401 derrubaria a sessão no axios do campo).
6. **`must_change_password` é cobrado no servidor:** `403 PASSWORD_CHANGE_REQUIRED` em todo `/v1/campo/*` exceto `change-password` e `GET /me`.
7. **`DELETE /v1/consultores/:id` (admin) apaga de vez** (jornadas, pontos e visitas por cascata, e as fotos). É o que deixa smoke e browser-check sem resíduo — mesmo papel do `DELETE /v1/leads/:id`. A tela não oferece o botão.
8. **`GET /v1/campo/me` devolve também `channels`** (a lista de "apps e canais" do questionário), para o celular ter a lista sem rota extra.
9. **Extensão da foto pelo tipo real** (`.jpg`/`.png`/`.webp`); o `Content-Type` da resposta sai da extensão da chave. Sem coluna nova.
10. **S3 sem `S3_BUCKET`/`S3_REGION` não derruba o boot:** as rotas de foto respondem `503 PHOTO_STORAGE_NOT_CONFIGURED` e o log avisa na largada — mesmo padrão do `FREELA_NOT_CONFIGURED`. `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` vazias = cadeia padrão do SDK (papel da instância). O padrão continua `s3` em produção e `disk` fora dela.
11. **409 do Freela:** o `FreelaClient` passa a lançar `FreelaHttpError` (subclasse de `BadGatewayException` com `freelaStatus`; o corpo de erro não muda). Com 409 o Praça procura o consultor pelo e-mail na lista do Freela e **adota** se `notes` for o nosso (caso "o Freela criou mas a resposta se perdeu"); senão grava a mensagem fixa `EMAIL_DUPLICADO_NO_FREELA`, que o relógio não repete. Trocar o e-mail no Praça limpa o erro e tenta de novo.
12. **Ativar/desativar sincroniza com o Freela pelo mesmo caminho do código:** falha no `PATCH isActive` vira `freela_sync_error` e o relógio de 2 min repete (consultor com `freela_consultant_id` e erro).
13. **`DELETE /v1/pracas/:id` com consultores na praça** responde `409 PRACA_HAS_CONSULTANTS` (a FK é `Restrict`; sem a guarda, viraria 500).
14. **`PhotoStorage` ganha `remove(key)`** além de `put`/`get` (apagar consultor de teste sem deixar arquivo).
15. **`vitest@3.2.4` no web (só dev):** o web não tem runner de unidade e a parte mais arriscada (fila offline, sobreposição do dia, completude do questionário, redução da foto) é lógica pura. É a mesma versão do `freela-web-v2`. Se o revisor vetar, as specs `*.test.ts` saem e o `browser-check` fica como única rede.
16. `leads` ganha `lat`/`lng` (como o spec manda), embora `pracas` use `lat`/`lon`.
17. **Índices únicos parciais e o Prisma 5.22:** o Prisma não conhece índice parcial; qualquer `prisma migrate dev` futura vai propor `DROP INDEX` dos dois. Por isso a migração desta entrega é gerada com `--create-only`, editada e aplicada com `migrate deploy`; quem gerar migração depois apaga essas linhas do SQL antes de aplicar (aviso no `CLAUDE.md`, Task 13).

## File Structure

**API — novo**
- `api/src/domain/campo-rules.ts` — regras puras: distância, caixa de busca, carimbo de hora, completude e resumo do questionário, estágio, nome parecido, CPF, Pix, situação do dia, senha provisória, canais padrão.
- `api/src/common/auth/campo-consultant.ts` — tipo do consultor no request.
- `api/src/common/decorators/campo-route.decorator.ts` — `@CampoRoute()` e `@AllowPendingPassword()`.
- `api/src/common/decorators/current-consultant.decorator.ts` — `@CurrentConsultant()`.
- `api/src/common/guards/campo-auth.guard.ts` — `CampoAuthGuard` (aud, `active`, `token_version`, senha pendente).
- `api/src/common/validation/flatten-errors.ts` — `flattenErrors` (saiu do `main.ts` para o check-in multipart reaproveitar).
- `api/src/modules/campo/campo.module.ts` — módulo.
- `api/src/modules/campo/campo-links.ts` — `signupUrl()`.
- `api/src/modules/campo/campo-canais.ts` — `lerCanais()`.
- `api/src/modules/campo/prisma-errors.ts` — `violouUnico()`.
- `api/src/modules/campo/campo-auth.service.ts` / `campo-auth.controller.ts` — login, troca de senha, `/me`.
- `api/src/modules/campo/photo-storage.ts` — interface, disco, S3, não configurado, fábrica, `tipoDaImagem`.
- `api/src/modules/campo/campo-freela.service.ts` — código no Freela (criar/adotar/ativar/desativar/repetir).
- `api/src/modules/campo/consultores.service.ts` / `consultores.controller.ts` — telas da equipe.
- `api/src/modules/campo/campo-views.ts` — projeções `JourneyView`, `PointView`, `VisitView`.
- `api/src/modules/campo/journeys.service.ts` — jornada, pontos, hoje, `closeStale`.
- `api/src/modules/campo/campo-autoclose.scheduler.ts` — `@Cron` 00:05.
- `api/src/modules/campo/places.service.ts` — perto / busca / parecidos.
- `api/src/modules/campo/visits.service.ts` — check-in, rascunho, checkout + CRM, foto.
- `api/src/modules/campo/multipart-checkin.ts` — leitura do multipart do check-in.
- `api/src/modules/campo/campo.controller.ts` — rotas `/v1/campo/*` do dia a dia.
- `api/src/modules/campo/dto/campo.dto.ts`, `dto/consultores.dto.ts`.
- Testes: `api/src/domain/__tests__/campo-rules.spec.ts`, `api/src/common/__tests__/campo-guards.spec.ts`, `api/src/modules/campo/__tests__/*.spec.ts`, `api/src/modules/pracas/__tests__/pracas-remove.spec.ts`.

**API — modificado**
- `api/prisma/schema.prisma` + migração `consultores_de_campo`.
- `api/src/common/guards/jwt-auth.guard.ts`, `api/src/app.module.ts`, `api/src/main.ts`, `api/src/common/config/env.validation.ts`.
- `api/src/modules/freela/freela-client.ts`, `freela.module.ts`, `freela-sync.scheduler.ts`, `__tests__/freela-client.spec.ts`.
- `api/src/modules/pracas/pracas.service.ts`.
- `api/scripts/smoke.sh`, `api/.env.example`, `api/package.json`.

**Web — novo**
- `web/vitest.config.ts`.
- `web/src/modules/campo/domain/` — `campo.types.ts`, `questionario.ts`, `dia-local.ts`, `fila-politica.ts`, `foto.ts`, `gps-mensagens.ts` (+ `__tests__/*.test.ts`).
- `web/src/modules/campo/infrastructure/` — `campo-session.storage.ts`, `campo-http.ts`, `campo.api.ts`, `fila-idb.ts`, `fila.ts`, `gps.ts`, `foto-compressao.ts`.
- `web/src/modules/campo/application/` — `campo-session.store.ts`, `use-campo.ts`, `use-fila.ts`, `use-rastreio.ts`, `use-foto-url.ts`.
- `web/src/components/campo/` — `CampoTopo.tsx`, `FaixaFila.tsx`, `AvisoGps.tsx`, `Questionario.tsx`, `QrDoFreela.tsx`.
- `web/src/app/campo/` — `layout.tsx`, `manifest.webmanifest/route.ts`, `icone/[tamanho]/route.tsx`, `entrar/page.tsx`, `senha/page.tsx`, `(sessao)/layout.tsx`, `(sessao)/page.tsx`, `(sessao)/qr/page.tsx`, `(sessao)/visita/nova/page.tsx`, `(sessao)/visita/[ref]/page.tsx`.
- `web/src/modules/consultores/` — `infrastructure/consultores.api.ts`, `application/use-consultores.ts`.
- `web/src/components/praca/` — `ConsultorDialog.tsx`, `ConsultorMapa.tsx`, `ConsultorLinhaDoTempo.tsx`, `CanaisCampo.tsx`.
- `web/src/app/(app)/consultores/page.tsx`, `web/src/app/(app)/consultores/[id]/page.tsx`.

**Web — modificado**
- `web/package.json`, `web/eslint.config.mjs`, `web/src/components/praca/AppShell.tsx`, `web/src/app/(app)/configuracoes/page.tsx`, `web/scripts/browser-check.mjs`.

**Docs/ops:** `docs/api-contract.md` (§20), `README.md`, `CLAUDE.md`, `api/.env.example`.

---

### Task 1: Contrato §20, modelo de dados e regras puras

**Files:**
- Modify: `docs/api-contract.md` (índice no topo + nova seção §20 no fim)
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/<carimbo>_consultores_de_campo/migration.sql` (gerada pelo Prisma e editada)
- Create: `api/src/domain/campo-rules.ts`
- Test: `api/src/domain/__tests__/campo-rules.spec.ts`

**Interfaces:**
- Consumes: `norm()` de `api/src/domain/dedup.ts`.
- Produces (`api/src/domain/campo-rules.ts`): `RAIO_LONGE_M = 200`, `RAIO_DUPLICADO_M = 100`, `RAIO_PERTO_M = 500`, `FUTURO_TOLERADO_MS`, `PASSADO_MAXIMO_MS`, `CARGOS`, `FREELA_STATUS`, `INTERESSES`, `PIX_TIPOS`, `CANAIS_PADRAO: string[]`, `ROTULO_CARGO`, `ROTULO_FREELA`, `ROTULO_INTERESSE`, `interface Coordenada {lat; lng}`, `distanciaM(a, b): number`, `marcaLonge(checkin, lugar): {distance_m: number|null; far_from_place: boolean}`, `caixaEnvolvente(c, raioM): {latMin; latMax; lngMin; lngMax}`, `carimbo(at, agora: Date, piso: Date|null): {at: Date; ajustado: boolean}`, `interface RespostasVisita`, `RESPOSTAS_VAZIAS`, `faltando(r, hoje): string[]`, `resumoVisita(r): string`, `estagioDepoisDaVisita(stage): number`, `nomeParecido(a, b): boolean`, `cpfValido(v): boolean`, `pixValido(tipo, chave): boolean`, `normalizarPix(tipo, chave): string`, `type SituacaoHoje`, `situacaoHoje(jornadas): SituacaoHoje`, `gerarSenhaProvisoria(sorteio?): string`.
- Produces (Prisma): modelos `field_consultants`, `field_journeys`, `field_points`, `field_visits`; `leads.lat/lng`; `app_settings.field_channels`; índices parciais `field_journeys_one_open_per_consultant` e `field_visits_one_open_per_consultant`.

- [ ] **Step 1: Escrever o contrato §20 (antes de qualquer código)**

No índice do topo de `docs/api-contract.md`, depois da linha do §19, acrescente:

```markdown
20. [Consultores de campo — `/v1/campo`, `/v1/consultores`](#20-campo)
```

No fim do arquivo, acrescente:

````markdown
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
| GET | `/v1/campo/places?lat=&lng=` | — | `PlaceView[]` com localização num raio de 500 m, por distância (até 30) |
| GET | `/v1/campo/places?q=` | — | `PlaceView[]` por nome (sem acento/caixa), não arquivados, até 20 |
| GET | `/v1/campo/places/similar?name=&lat=&lng=` | — | `PlaceView[]` com nome parecido a até 100 m |
| POST | `/v1/campo/visits` | multipart (abaixo) | `201 VisitView` |
| PATCH | `/v1/campo/visits/:ref/answers` | `AnswersBody` parcial | `200 VisitView` |
| POST | `/v1/campo/visits/:ref/checkout` | `{at, lat, lng, accuracy}` | `200 VisitView` |
| GET | `/v1/campo/visits/:ref/photo` | — | bytes da foto (`Content-Type` da foto) |

Tudo só na praça do próprio consultor. `/places` sem `q` e sem `lat`+`lng` →
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
A foto só sai pela API, que confere quem pede. Sem bucket/região em modo `s3`, a
API sobe e as rotas de foto respondem `503 PHOTO_STORAGE_NOT_CONFIGURED`.

### 20.8 Privacidade

CPF, chave Pix e localização só aparecem para a equipe e para o próprio
consultor. Localização só é recebida com jornada aberta.

### 20.9 Desvios propositais em relação ao spec

- Evento do CRM com `kind = "visit"` (o do catálogo), não `"visita"`.
- Rota nova `GET /places/similar` e campo `confirm_new` no check-in.
- `:ref` aceita `id` ou `client_id`; reenvios respondem com o que já existe.
- `change-password` pede a senha atual; `403 PASSWORD_CHANGE_REQUIRED` no servidor.
- `DELETE /v1/consultores/:id` (limpeza de teste) e `channels` dentro de `GET /v1/campo/me`.
- S3 incompleto não derruba o boot (503 nas rotas de foto).
- `DELETE /v1/pracas/:id` com consultores na praça → `409 PRACA_HAS_CONSULTANTS`.
````

- [ ] **Step 2: Escrever o teste das regras puras (falhando)**

Crie `api/src/domain/__tests__/campo-rules.spec.ts`:

```ts
import {
  caixaEnvolvente,
  carimbo,
  cpfValido,
  distanciaM,
  estagioDepoisDaVisita,
  faltando,
  gerarSenhaProvisoria,
  marcaLonge,
  nomeParecido,
  normalizarPix,
  pixValido,
  RESPOSTAS_VAZIAS,
  resumoVisita,
  situacaoHoje,
  type RespostasVisita,
} from '../campo-rules';

const CENTRO = { lat: -19.9245, lng: -43.9352 };

const COMPLETAS: RespostasVisita = {
  interlocutor_name: 'João',
  interlocutor_role: 'dono',
  freela_status: 'cadastrou_qr',
  interest: 'alto',
  open_vagas: 2,
  vaga_roles: ['Garçom', 'Cozinheiro'],
  freelas_per_week: 5,
  channels: ['Grupos de WhatsApp'],
  channel_other: 'Indeed',
  needs_followup: true,
  followup_what: 'Ligar para fechar.',
  followup_date: '2026-10-10',
  notes: 'Casa cheia na sexta.',
};

describe('distância e marca de 200 m', () => {
  it('0,001° de latitude ≈ 111 m (haversine)', () => {
    expect(distanciaM(CENTRO, { lat: -19.9235, lng: -43.9352 })).toBe(111);
    expect(distanciaM(CENTRO, CENTRO)).toBe(0);
  });

  it('marca "longe" só acima de 200 m e só com localização no estabelecimento', () => {
    expect(marcaLonge(CENTRO, { lat: -19.9225, lng: -43.9352 })).toEqual({ distance_m: 222, far_from_place: true });
    expect(marcaLonge(CENTRO, { lat: -19.923, lng: -43.9352 })).toEqual({ distance_m: 167, far_from_place: false });
    expect(marcaLonge(CENTRO, { lat: null, lng: null })).toEqual({ distance_m: null, far_from_place: false });
  });

  it('caixa de busca: 1113,2 m no equador ≈ 0,01° para cada lado', () => {
    const c = caixaEnvolvente({ lat: 0, lng: 0 }, 1113.2);
    expect(c.latMin).toBeCloseTo(-0.01, 5);
    expect(c.latMax).toBeCloseTo(0.01, 5);
    expect(c.lngMin).toBeCloseTo(-0.01, 5);
    expect(c.lngMax).toBeCloseTo(0.01, 5);
  });
});

describe('carimbo de hora (§7)', () => {
  const agora = new Date('2026-10-08T15:00:00.000Z');
  const inicio = new Date('2026-10-08T12:00:00.000Z');

  it('aceita a hora do aparelho entre o início da jornada e agora + 2 min', () => {
    expect(carimbo('2026-10-08T14:59:00.000Z', agora, inicio)).toEqual({
      at: new Date('2026-10-08T14:59:00.000Z'),
      ajustado: false,
    });
    expect(carimbo('2026-10-08T15:01:30.000Z', agora, inicio).ajustado).toBe(false);
  });

  it('fora da janela usa a hora de recebimento e marca ajustado', () => {
    expect(carimbo('2026-10-08T15:03:00.000Z', agora, inicio)).toEqual({ at: agora, ajustado: true });
    expect(carimbo('2026-10-08T11:00:00.000Z', agora, inicio)).toEqual({ at: agora, ajustado: true });
  });

  it('sem jornada (início): no máximo 24 h no passado', () => {
    expect(carimbo('2026-10-07T14:00:00.000Z', agora, null).ajustado).toBe(true);
    expect(carimbo('2026-10-07T16:00:00.000Z', agora, null).ajustado).toBe(false);
  });

  it('sem hora ou hora ilegível = hora de recebimento', () => {
    expect(carimbo(undefined, agora, inicio)).toEqual({ at: agora, ajustado: true });
    expect(carimbo('lixo', agora, inicio)).toEqual({ at: agora, ajustado: true });
  });
});

describe('completude do questionário', () => {
  it('vazio: lista tudo o que é obrigatório, em ordem', () => {
    expect(faltando(RESPOSTAS_VAZIAS, '2026-10-08')).toEqual([
      'nome de quem atendeu',
      'cargo de quem atendeu',
      'situação no Freela',
      'interesse',
      'vagas abertas',
      'freelancers por semana',
      'apps e canais que usa',
      'se pediu retorno',
    ]);
  });

  it('completo: nada falta (observação é opcional)', () => {
    expect(faltando({ ...COMPLETAS, notes: null }, '2026-10-08')).toEqual([]);
  });

  it('vagas > 0 exige ao menos uma função; vagas = 0 não', () => {
    expect(faltando({ ...COMPLETAS, vaga_roles: [] }, '2026-10-08')).toEqual(['funções das vagas']);
    expect(faltando({ ...COMPLETAS, open_vagas: 0, vaga_roles: [] }, '2026-10-08')).toEqual([]);
  });

  it('"outro" preenchido vale como canal', () => {
    expect(faltando({ ...COMPLETAS, channels: [], channel_other: 'Indeed' }, '2026-10-08')).toEqual([]);
    expect(faltando({ ...COMPLETAS, channels: [], channel_other: '  ' }, '2026-10-08')).toEqual(['apps e canais que usa']);
  });

  it('retorno pedido exige o quê e data de hoje em diante', () => {
    expect(faltando({ ...COMPLETAS, followup_what: ' ', followup_date: null }, '2026-10-08')).toEqual([
      'o que fazer no retorno',
      'data do retorno',
    ]);
    expect(faltando({ ...COMPLETAS, followup_date: '2026-10-07' }, '2026-10-08')).toEqual([
      'data do retorno (não pode ser no passado)',
    ]);
    expect(faltando({ ...COMPLETAS, followup_date: '2026-10-08' }, '2026-10-08')).toEqual([]);
    expect(faltando({ ...COMPLETAS, needs_followup: false, followup_what: null, followup_date: null }, '2026-10-08')).toEqual([]);
  });
});

describe('resumo do evento no CRM e regra de estágio', () => {
  it('resume as respostas numa frase só', () => {
    expect(resumoVisita(COMPLETAS)).toBe(
      'Visita de campo — atendeu: João (Dono). Freela: cadastrou agora pelo QR. Interesse: alto. ' +
        'Vagas abertas: 2 (Garçom, Cozinheiro). Freelancers por semana: 5. ' +
        'Canais: Grupos de WhatsApp, outro: Indeed. Retorno: Ligar para fechar em 10/10/2026. ' +
        'Obs.: Casa cheia na sexta.',
    );
  });

  it('sem retorno e sem observação', () => {
    expect(
      resumoVisita({ ...COMPLETAS, open_vagas: 0, vaga_roles: [], needs_followup: false, notes: null, channel_other: null }),
    ).toBe(
      'Visita de campo — atendeu: João (Dono). Freela: cadastrou agora pelo QR. Interesse: alto. ' +
        'Vagas abertas: 0. Freelancers por semana: 5. Canais: Grupos de WhatsApp. Retorno: não pediu.',
    );
  });

  it('"Lead novo" e "Contatado" viram "Conversa aberta"; de 3 em diante mantém', () => {
    expect([1, 2, 3, 4, 5, 8].map(estagioDepoisDaVisita)).toEqual([3, 3, 3, 4, 5, 8]);
  });
});

describe('nome parecido (sugestão de duplicado)', () => {
  it.each([
    ['Bar do Zé', 'bar do ze', true],
    ['Bar do Zé', 'Bar do Zé Moema', true],
    ['Restaurante Dona Lúcia', 'Dona Lucia Cozinha', true],
    ['Bar do Zé', 'Bar da Maria', false],
    ['Pizzaria Napoli', 'Cantina Roma', false],
    ['', 'Bar', false],
  ])('%s × %s → %s', (a, b, esperado) => {
    expect(nomeParecido(a, b)).toBe(esperado);
  });
});

describe('CPF e Pix', () => {
  it('CPF confere os dois dígitos e recusa sequência repetida', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('123')).toBe(false);
  });

  it('chave Pix confere com o tipo', () => {
    expect(pixValido('cpf', '529.982.247-25')).toBe(true);
    expect(pixValido('email', 'ana@exemplo.com')).toBe(true);
    expect(pixValido('email', 'ana@')).toBe(false);
    expect(pixValido('telefone', '(31) 99999-0000')).toBe(true);
    expect(pixValido('telefone', '+55 31 99999-0000')).toBe(true);
    expect(pixValido('aleatoria', '123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(pixValido('outro', 'x')).toBe(false);
  });

  it('normaliza a chave para guardar', () => {
    expect(normalizarPix('cpf', '529.982.247-25')).toBe('52998224725');
    expect(normalizarPix('telefone', '(31) 99999-0000')).toBe('31999990000');
    expect(normalizarPix('email', ' Ana@Exemplo.com ')).toBe('ana@exemplo.com');
  });
});

describe('situação de hoje e senha provisória', () => {
  it('em jornada / encerrou / não iniciou', () => {
    expect(situacaoHoje([])).toBe('nao_iniciou');
    expect(situacaoHoje([{ ended_at: null }])).toBe('em_jornada');
    expect(situacaoHoje([{ ended_at: new Date() }])).toBe('encerrou');
    expect(situacaoHoje([{ ended_at: new Date() }, { ended_at: null }])).toBe('em_jornada');
  });

  it('senha provisória: 10 caracteres sem ambíguos', () => {
    expect(gerarSenhaProvisoria(() => 0)).toBe('aaaaaaaaaa');
    const senha = gerarSenhaProvisoria();
    expect(senha).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd api && npx jest src/domain/__tests__/campo-rules.spec.ts`
Expected: FAIL — `Cannot find module '../campo-rules'`.

- [ ] **Step 4: Implementar as regras**

Crie `api/src/domain/campo-rules.ts`:

```ts
/**
 * Regras puras dos consultores de campo — spec 2026-10-08, §5 e §7.
 *
 * Sem Prisma nem HTTP: os serviços leem as linhas e passam aqui. É o que deixa
 * distância, carimbo de hora, completude do questionário e regra de estágio
 * testáveis sem subir a API.
 */
import { randomInt } from 'node:crypto';
import { norm } from './dedup';

export const RAIO_LONGE_M = 200;
export const RAIO_DUPLICADO_M = 100;
export const RAIO_PERTO_M = 500;
/** O aparelho pode estar até 2 min adiantado. */
export const FUTURO_TOLERADO_MS = 2 * 60_000;
/** A fila offline pode mandar até 24 h depois. */
export const PASSADO_MAXIMO_MS = 24 * 60 * 60_000;

export const CARGOS = ['dono', 'gerente', 'outro'] as const;
export const FREELA_STATUS = ['ja_usa', 'cadastrou_qr', 'nao_cadastrou'] as const;
export const INTERESSES = ['alto', 'medio', 'baixo', 'nenhum'] as const;
export const PIX_TIPOS = ['cpf', 'email', 'telefone', 'aleatoria'] as const;

/** Lista inicial de "apps e canais que usa hoje" (§5, `app_settings.field_channels`). */
export const CANAIS_PADRAO = ['Nenhum', 'Grupos de WhatsApp', 'Indicação de conhecidos', 'Agência de mão de obra'];

export const ROTULO_CARGO: Record<string, string> = { dono: 'Dono', gerente: 'Gerente', outro: 'Outro' };
export const ROTULO_FREELA: Record<string, string> = {
  ja_usa: 'já usa o Freela',
  cadastrou_qr: 'cadastrou agora pelo QR',
  nao_cadastrou: 'não cadastrou',
};
export const ROTULO_INTERESSE: Record<string, string> = { alto: 'alto', medio: 'médio', baixo: 'baixo', nenhum: 'nenhum' };

export interface Coordenada {
  lat: number;
  lng: number;
}

const RAIO_TERRA_M = 6_371_000;
const rad = (g: number): number => (g * Math.PI) / 180;

/** Distância em metros (haversine), arredondada. */
export function distanciaM(a: Coordenada, b: Coordenada): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * RAIO_TERRA_M * Math.asin(Math.sqrt(h)));
}

/** Marca "longe do local": só marca, não bloqueia; sem localização no estabelecimento, sem marca. */
export function marcaLonge(
  checkin: Coordenada,
  lugar: { lat: number | null; lng: number | null },
): { distance_m: number | null; far_from_place: boolean } {
  if (lugar.lat == null || lugar.lng == null) return { distance_m: null, far_from_place: false };
  const d = distanciaM(checkin, { lat: lugar.lat, lng: lugar.lng });
  return { distance_m: d, far_from_place: d > RAIO_LONGE_M };
}

/** Retângulo que contém o círculo — filtro barato no banco antes do haversine. */
export function caixaEnvolvente(c: Coordenada, raioM: number) {
  const dLat = raioM / 111_320;
  const dLng = raioM / (111_320 * Math.max(Math.cos(rad(c.lat)), 0.01));
  return { latMin: c.lat - dLat, latMax: c.lat + dLat, lngMin: c.lng - dLng, lngMax: c.lng + dLng };
}

/**
 * Hora do registro (§7): vale a do aparelho se estiver entre o piso (início da
 * jornada; `null` antes de existir jornada) e agora + 2 min, e no máximo 24 h no
 * passado. Fora disso, a hora de recebimento — com a marca `ajustado`, para não
 * aceitar horário inventado nem perder o registro.
 */
export function carimbo(at: string | null | undefined, agora: Date, piso: Date | null): { at: Date; ajustado: boolean } {
  const t = at ? new Date(at) : null;
  if (!t || Number.isNaN(t.getTime())) return { at: agora, ajustado: true };
  const min = Math.max(agora.getTime() - PASSADO_MAXIMO_MS, piso?.getTime() ?? Number.NEGATIVE_INFINITY);
  const max = agora.getTime() + FUTURO_TOLERADO_MS;
  if (t.getTime() < min || t.getTime() > max) return { at: agora, ajustado: true };
  return { at: t, ajustado: false };
}

/** As respostas do questionário como o banco guarda (`null` = não respondido). */
export interface RespostasVisita {
  interlocutor_name: string | null;
  interlocutor_role: string | null;
  freela_status: string | null;
  interest: string | null;
  open_vagas: number | null;
  vaga_roles: string[];
  freelas_per_week: number | null;
  channels: string[];
  channel_other: string | null;
  needs_followup: boolean | null;
  followup_what: string | null;
  followup_date: string | null;
  notes: string | null;
}

export const RESPOSTAS_VAZIAS: RespostasVisita = {
  interlocutor_name: null,
  interlocutor_role: null,
  freela_status: null,
  interest: null,
  open_vagas: null,
  vaga_roles: [],
  freelas_per_week: null,
  channels: [],
  channel_other: null,
  needs_followup: null,
  followup_what: null,
  followup_date: null,
  notes: null,
};

const vazio = (s: string | null | undefined): boolean => !s || !s.trim();

/** O que falta para o checkout (§7, "Questionário completo"), na ordem da tela. */
export function faltando(r: RespostasVisita, hoje: string): string[] {
  const f: string[] = [];
  if (vazio(r.interlocutor_name)) f.push('nome de quem atendeu');
  if (!r.interlocutor_role) f.push('cargo de quem atendeu');
  if (!r.freela_status) f.push('situação no Freela');
  if (!r.interest) f.push('interesse');
  if (r.open_vagas == null) f.push('vagas abertas');
  else if (r.open_vagas > 0 && r.vaga_roles.length === 0) f.push('funções das vagas');
  if (r.freelas_per_week == null) f.push('freelancers por semana');
  if (r.channels.length === 0 && vazio(r.channel_other)) f.push('apps e canais que usa');
  if (r.needs_followup == null) f.push('se pediu retorno');
  else if (r.needs_followup) {
    if (vazio(r.followup_what)) f.push('o que fazer no retorno');
    if (!r.followup_date) f.push('data do retorno');
    else if (r.followup_date < hoje) f.push('data do retorno (não pode ser no passado)');
  }
  return f;
}

const semPontoFinal = (s: string): string => s.trim().replace(/[.\s]+$/, '');
const diaBR = (s: string | null): string => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

/** Texto do evento `visit` no CRM — uma frase por pergunta. */
export function resumoVisita(r: RespostasVisita): string {
  const partes = [
    `Visita de campo — atendeu: ${r.interlocutor_name?.trim() || '—'} (${ROTULO_CARGO[r.interlocutor_role ?? ''] ?? '—'})`,
    `Freela: ${ROTULO_FREELA[r.freela_status ?? ''] ?? '—'}`,
    `Interesse: ${ROTULO_INTERESSE[r.interest ?? ''] ?? '—'}`,
    (r.open_vagas ?? 0) > 0 ? `Vagas abertas: ${r.open_vagas} (${r.vaga_roles.join(', ')})` : 'Vagas abertas: 0',
    `Freelancers por semana: ${r.freelas_per_week ?? 0}`,
  ];
  const canais = [...r.channels, ...(vazio(r.channel_other) ? [] : [`outro: ${r.channel_other!.trim()}`])];
  partes.push(`Canais: ${canais.join(', ') || '—'}`);
  partes.push(
    r.needs_followup
      ? `Retorno: ${semPontoFinal(r.followup_what ?? '')} em ${diaBR(r.followup_date)}`
      : 'Retorno: não pediu',
  );
  if (!vazio(r.notes)) partes.push(`Obs.: ${semPontoFinal(r.notes!)}`);
  return `${partes.join('. ')}.`;
}

/** A visita é conversa presencial: 1 ou 2 → 3; de 3 em diante mantém (5 é do bloco C). */
export const estagioDepoisDaVisita = (stage: number): number => (stage === 1 || stage === 2 ? 3 : stage);

/** Palavras que não distinguem um estabelecimento de outro. */
const GENERICAS = new Set([
  'bar', 'restaurante', 'lanchonete', 'padaria', 'cafe', 'pizzaria', 'hamburgueria',
  'churrascaria', 'boteco', 'casa', 'dos', 'das', 'the',
]);

const palavras = (s: string): Set<string> =>
  new Set(
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 3 && !GENERICAS.has(p)),
  );

/** "Nome parecido" para a pergunta "Já existe 'X' a 40 m — é esse?". */
export function nomeParecido(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [curto, longo] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (curto.length >= 4 && longo.includes(curto)) return true;
  const pa = palavras(a);
  const pb = palavras(b);
  if (pa.size === 0 || pb.size === 0) return false;
  const comuns = [...pa].filter((p) => pb.has(p)).length;
  return comuns / Math.min(pa.size, pb.size) >= 0.5;
}

/** CPF com os dois dígitos verificadores; sequência repetida é inválida. */
export function cpfValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number): number => {
    let soma = 0;
    for (let i = 0; i < n; i += 1) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A chave Pix tem a forma do tipo escolhido. */
export function pixValido(tipo: string, chave: string): boolean {
  const c = chave.trim();
  switch (tipo) {
    case 'cpf':
      return cpfValido(c);
    case 'email':
      return EMAIL_RE.test(c);
    case 'telefone': {
      const d = c.replace(/\D/g, '');
      return d.length === 10 || d.length === 11 || (d.startsWith('55') && (d.length === 12 || d.length === 13));
    }
    case 'aleatoria':
      return UUID_RE.test(c);
    default:
      return false;
  }
}

/** Forma guardada da chave Pix (o bloco D usa como está). */
export function normalizarPix(tipo: string, chave: string): string {
  if (tipo === 'cpf' || tipo === 'telefone') return chave.replace(/\D/g, '');
  return chave.trim().toLowerCase();
}

export type SituacaoHoje = 'em_jornada' | 'encerrou' | 'nao_iniciou';

/** Situação do dia na lista da equipe, a partir das jornadas de hoje. */
export function situacaoHoje(jornadasDeHoje: { ended_at: Date | null }[]): SituacaoHoje {
  if (jornadasDeHoje.some((j) => j.ended_at === null)) return 'em_jornada';
  return jornadasDeHoje.length > 0 ? 'encerrou' : 'nao_iniciou';
}

const ALFABETO_SENHA = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Senha provisória de 10 caracteres, sem os ambíguos (0/o, 1/l/i). */
export function gerarSenhaProvisoria(sorteio: (max: number) => number = randomInt): string {
  let s = '';
  for (let i = 0; i < 10; i += 1) s += ALFABETO_SENHA[sorteio(ALFABETO_SENHA.length)];
  return s;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd api && npx jest src/domain/__tests__/campo-rules.spec.ts`
Expected: PASS (todas as `describe`).

- [ ] **Step 6: Modelo de dados no Prisma**

Em `api/prisma/schema.prisma`:

1. No `model users`, depois de `dismissed_notifs user_dismissed_notifs[]`, acrescente:

```prisma
  field_consultants_created field_consultants[]
```

2. No `model pracas`, depois de `campanhas   campanhas[]`, acrescente:

```prisma
  field_consultants field_consultants[]
```

3. No `model leads`, depois de `is_test         Boolean   @default(false)`, acrescente as colunas, e depois de `enrollments enrollments[]` a relação e o índice:

```prisma
  // Localização do estabelecimento (§5). Nula nos que já existiam; o bloco B
  // preenche em massa; a visita de campo grava a do check-in no lead novo.
  lat             Float?
  lng             Float?
```

```prisma
  field_visits field_visits[]

  @@index([praca_id, lat, lng])
```

4. No `model app_settings`, depois de `template_defaults Json    @default("{}")`:

```prisma
  field_channels    Json    @default("[\"Nenhum\",\"Grupos de WhatsApp\",\"Indicação de conhecidos\",\"Agência de mão de obra\"]")
```

5. No fim do arquivo:

```prisma
// ── consultores de campo (spec 2026-10-08) ───────────────────
model field_consultants {
  id                   String    @id @default(uuid()) @db.Uuid
  name                 String
  email                String    @unique
  phone                String    @default("")
  cpf                  String    @unique
  praca_id             String    @db.Uuid
  pix_key              String
  pix_key_type         String
  password_hash        String
  must_change_password Boolean   @default(true)
  token_version        Int       @default(0)
  active               Boolean   @default(true)
  freela_consultant_id String?
  freela_code          String?
  freela_sync_error    String?
  freela_synced_at     DateTime?
  created_by           String    @db.Uuid
  created_at           DateTime  @default(now())
  updated_at           DateTime  @updatedAt
  praca                pracas    @relation(fields: [praca_id], references: [id], onDelete: Restrict)
  creator              users     @relation(fields: [created_by], references: [id], onDelete: Restrict)

  journeys field_journeys[]
  visits   field_visits[]
}

model field_journeys {
  id             String            @id @default(uuid()) @db.Uuid
  consultant_id  String            @db.Uuid
  day            String
  client_id      String            @unique @db.Uuid
  started_at     DateTime
  start_lat      Float
  start_lng      Float
  start_accuracy Float
  ended_at       DateTime?
  end_lat        Float?
  end_lng        Float?
  end_accuracy   Float?
  auto_closed    Boolean           @default(false)
  created_at     DateTime          @default(now())
  consultant     field_consultants @relation(fields: [consultant_id], references: [id], onDelete: Cascade)

  points field_points[]
  visits field_visits[]

  // Mais o índice único PARCIAL `field_journeys_one_open_per_consultant`
  // (SQL cru na migração — o Prisma 5 não declara índice parcial).
  @@index([consultant_id, day])
  @@index([day])
}

model field_points {
  id             String         @id @default(uuid()) @db.Uuid
  journey_id     String         @db.Uuid
  at             DateTime
  received_at    DateTime       @default(now())
  lat            Float
  lng            Float
  accuracy       Float
  kind           String
  client_id      String         @unique @db.Uuid
  clock_adjusted Boolean        @default(false)
  journey        field_journeys @relation(fields: [journey_id], references: [id], onDelete: Cascade)

  @@index([journey_id, at])
}

model field_visits {
  id                String            @id @default(uuid()) @db.Uuid
  client_id         String            @unique @db.Uuid
  journey_id        String            @db.Uuid
  consultant_id     String            @db.Uuid
  lead_id           String            @db.Uuid
  checkin_at        DateTime
  checkin_lat       Float
  checkin_lng       Float
  checkin_accuracy  Float
  distance_m        Int?
  far_from_place    Boolean           @default(false)
  photo_key         String
  photo_bytes       Int
  checkout_at       DateTime?
  checkout_lat      Float?
  checkout_lng      Float?
  auto_closed       Boolean           @default(false)
  clock_adjusted    Boolean           @default(false)
  interlocutor_name String?
  interlocutor_role String?
  freela_status     String?
  interest          String?
  open_vagas        Int?
  vaga_roles        String[]          @default([])
  freelas_per_week  Int?
  channels          String[]          @default([])
  channel_other     String?
  needs_followup    Boolean?
  followup_what     String?
  followup_date     String?
  notes             String?
  created_at        DateTime          @default(now())
  updated_at        DateTime          @updatedAt
  journey           field_journeys    @relation(fields: [journey_id], references: [id], onDelete: Cascade)
  consultant        field_consultants @relation(fields: [consultant_id], references: [id], onDelete: Cascade)
  lead              leads             @relation(fields: [lead_id], references: [id], onDelete: Cascade)

  // Mais o índice único PARCIAL `field_visits_one_open_per_consultant`.
  @@index([consultant_id, checkin_at])
  @@index([journey_id])
}
```

- [ ] **Step 7: Gerar a migração, acrescentar os índices parciais e aplicar**

```bash
cd /home/doutor/coding/freela/praca && docker compose up -d postgres
cd api && npx prisma migrate dev --create-only --name consultores_de_campo
```

No fim do `migration.sql` recém-criado em `api/prisma/migrations/*_consultores_de_campo/`, acrescente:

```sql
-- Índices únicos PARCIAIS (spec §5). O Prisma 5 não declara índice parcial:
-- a próxima `prisma migrate dev` vai propor `DROP INDEX` destes dois — apague
-- essas linhas do SQL gerado antes de aplicar (CLAUDE.md).

-- No máximo uma jornada aberta por consultor.
CREATE UNIQUE INDEX "field_journeys_one_open_per_consultant"
  ON "field_journeys"("consultant_id") WHERE "ended_at" IS NULL;

-- No máximo uma visita aberta por consultor.
CREATE UNIQUE INDEX "field_visits_one_open_per_consultant"
  ON "field_visits"("consultant_id") WHERE "checkout_at" IS NULL AND "auto_closed" = false;
```

Aplicar com `migrate deploy` (e não `migrate dev`): o `migrate dev` compararia o schema com o banco, veria dois índices que o schema não declara e proporia na hora uma migração nova com `DROP INDEX` — é o mesmo caminho do `meu-funil`, que também tem índice parcial.

Run: `cd api && npx prisma migrate deploy && npx prisma generate`
Expected: `Applying migration ..._consultores_de_campo`, `All migrations have been successfully applied.` e `Generated Prisma Client`.

Run: `docker exec praca-postgres psql -U praca -d praca -tAc "select indexname from pg_indexes where indexname like '%one_open%' order by 1"`
Expected:
```
field_journeys_one_open_per_consultant
field_visits_one_open_per_consultant
```

Run: `docker exec praca-postgres psql -U praca -d praca -tAc "select field_channels from app_settings where id = 1"`
Expected: `["Nenhum", "Grupos de WhatsApp", "Indicação de conhecidos", "Agência de mão de obra"]`

- [ ] **Step 8: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add docs/api-contract.md api/prisma/schema.prisma api/prisma/migrations api/src/domain/campo-rules.ts api/src/domain/__tests__/campo-rules.spec.ts
git commit -m "feat(campo): contrato §20, modelo de dados e regras puras

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sessão do consultor (token `aud: "campo"`, guard próprio, login e troca de senha)

**Files:**
- Create: `api/src/common/auth/campo-consultant.ts`
- Create: `api/src/common/decorators/campo-route.decorator.ts`
- Create: `api/src/common/decorators/current-consultant.decorator.ts`
- Create: `api/src/common/guards/campo-auth.guard.ts`
- Modify: `api/src/common/guards/jwt-auth.guard.ts`
- Modify: `api/src/app.module.ts`
- Modify: `api/src/common/config/env.validation.ts`
- Create: `api/src/modules/campo/campo.module.ts`, `campo-links.ts`, `campo-canais.ts`, `campo-auth.service.ts`, `campo-auth.controller.ts`, `campo.controller.ts`, `dto/campo.dto.ts`
- Test: `api/src/common/__tests__/campo-guards.spec.ts`, `api/src/modules/campo/__tests__/campo-auth.service.spec.ts`

**Interfaces:**
- Consumes: modelos `field_consultants`/`app_settings.field_channels` (Task 1); `CANAIS_PADRAO` (Task 1).
- Produces:
  - `interface CampoConsultant { id: string; name: string; email: string; praca_id: string; must_change_password: boolean }` (em `request.campo`).
  - `CAMPO_ROUTE_KEY`, `CampoRoute()`, `ALLOW_PENDING_PASSWORD_KEY`, `AllowPendingPassword()`, `CurrentConsultant()`.
  - `CAMPO_AUDIENCE = 'campo'`, `interface CampoTokenPayload { sub: string; tv: number }`, `class CampoAuthGuard`.
  - `CampoAuthService.login(email, password)`, `.changePassword(id, dto)`, `.me(id)`, `.issueToken({id, token_version})`; `toMeView(row)`; `interface CampoMeView`; `interface CampoLoginView { access_token; consultant: CampoMeView; must_change_password }`.
  - `signupUrl(code: string | null): string | null` (`campo-links.ts`); `lerCanais(prisma): Promise<string[]>` (`campo-canais.ts`).
  - `CampoModule` (controllers `CampoAuthController`, `CampoController`; provider `CampoAuthService`).
  - DTOs `CampoLoginDto`, `ChangePasswordDto` em `dto/campo.dto.ts`.

- [ ] **Step 1: Escrever os testes do isolamento (falhando)**

Crie `api/src/common/__tests__/campo-guards.spec.ts`:

```ts
/**
 * Isolamento de sessão (spec §4.1): token de consultor nunca entra na equipe,
 * token da equipe nunca entra no campo — e desativar ou trocar a senha derruba
 * a sessão aberta na hora.
 */
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../database/prisma.service';
import { AdminOnly } from '../decorators/admin-only.decorator';
import { AllowPendingPassword, CampoRoute } from '../decorators/campo-route.decorator';
import { CAMPO_AUDIENCE, CampoAuthGuard } from '../guards/campo-auth.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const SEGREDO = 'segredo-de-teste-com-mais-de-16';
const USER = '33333333-3333-4333-8333-333333333333';
const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';

class Rotas {
  @CampoRoute() campo() {}
  @CampoRoute() @AllowPendingPassword() campoLiberada() {}
  equipe() {}
  @AdminOnly() equipeAdmin() {}
}

function contexto(nome: keyof Rotas, token?: string) {
  const request: Record<string, unknown> = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => Rotas.prototype[nome],
    getClass: () => Rotas,
  } as unknown as ExecutionContext;
  return { ctx, request };
}

const CONSULTOR = {
  id: CONS,
  name: 'Ana',
  email: 'ana@exemplo.com',
  praca_id: PRACA,
  active: true,
  token_version: 2,
  must_change_password: false,
};

function fakePrisma(consultor: Record<string, unknown> | null = CONSULTOR) {
  return {
    field_consultants: { findUnique: jest.fn().mockResolvedValue(consultor) },
    users: { findUnique: jest.fn().mockResolvedValue({ active: true, is_admin: true }) },
  };
}

function montar(p: ReturnType<typeof fakePrisma>) {
  const jwt = new JwtService({ secret: SEGREDO });
  const reflector = new Reflector();
  const campo = new CampoAuthGuard(reflector, jwt, p as unknown as PrismaService);
  const equipe = new JwtAuthGuard(reflector, jwt, p as unknown as PrismaService, campo);
  return { jwt, equipe };
}

const tokenEquipe = (jwt: JwtService) =>
  jwt.signAsync({ sub: USER, email: 'diego@praca.local', name: 'Diego', is_admin: true });
const tokenCampo = (jwt: JwtService, tv = 2) => jwt.signAsync({ sub: CONS, tv }, { audience: CAMPO_AUDIENCE });

describe('isolamento de sessão — os dois sentidos', () => {
  it('token de consultor numa rota da equipe → 401, recusado pelo aud (nem consulta users)', async () => {
    const p = fakePrisma();
    const { jwt, equipe } = montar(p);
    const { ctx } = contexto('equipe', await tokenCampo(jwt));

    await expect(equipe.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(p.users.findUnique).not.toHaveBeenCalled();
  });

  it('token de consultor numa rota de admin da equipe → 401 também', async () => {
    const { jwt, equipe } = montar(fakePrisma());
    await expect(equipe.canActivate(contexto('equipeAdmin', await tokenCampo(jwt)).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('token da equipe numa rota /v1/campo → 401 (sem aud "campo")', async () => {
    const p = fakePrisma();
    const { jwt, equipe } = montar(p);

    await expect(equipe.canActivate(contexto('campo', await tokenEquipe(jwt)).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(p.field_consultants.findUnique).not.toHaveBeenCalled();
  });

  it('token de consultor numa rota de campo passa e anexa request.campo', async () => {
    const { jwt, equipe } = montar(fakePrisma());
    const { ctx, request } = contexto('campo', await tokenCampo(jwt));

    await expect(equipe.canActivate(ctx)).resolves.toBe(true);
    expect(request.campo).toEqual({
      id: CONS,
      name: 'Ana',
      email: 'ana@exemplo.com',
      praca_id: PRACA,
      must_change_password: false,
    });
    expect(request.user).toBeUndefined();
  });

  it('token da equipe continua passando nas rotas da equipe', async () => {
    const { jwt, equipe } = montar(fakePrisma());
    const { ctx, request } = contexto('equipe', await tokenEquipe(jwt));

    await expect(equipe.canActivate(ctx)).resolves.toBe(true);
    expect((request.user as { id: string }).id).toBe(USER);
  });
});

describe('CampoAuthGuard — sessão derrubada na hora', () => {
  it('sem token → 401', async () => {
    const { equipe } = montar(fakePrisma());
    await expect(equipe.canActivate(contexto('campo').ctx)).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED', message: 'Token ausente' },
    });
  });

  it('consultor desativado no meio do dia → 401 "Conta desativada"', async () => {
    const { jwt, equipe } = montar(fakePrisma({ ...CONSULTOR, active: false }));
    await expect(equipe.canActivate(contexto('campo', await tokenCampo(jwt)).ctx)).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED', message: 'Conta desativada' },
    });
  });

  it('token_version antigo (nova senha / desativado e reativado) → 401', async () => {
    const { jwt, equipe } = montar(fakePrisma({ ...CONSULTOR, token_version: 3 }));
    await expect(equipe.canActivate(contexto('campo', await tokenCampo(jwt, 2)).ctx)).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED', message: 'Sessão encerrada — entre de novo.' },
    });
  });

  it('consultor apagado → 401', async () => {
    const { jwt, equipe } = montar(fakePrisma(null));
    await expect(equipe.canActivate(contexto('campo', await tokenCampo(jwt)).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('senha provisória pendente → 403 PASSWORD_CHANGE_REQUIRED, menos nas rotas liberadas', async () => {
    const { jwt, equipe } = montar(fakePrisma({ ...CONSULTOR, must_change_password: true }));
    const token = await tokenCampo(jwt);

    const erro = await equipe.canActivate(contexto('campo', token).ctx).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ForbiddenException);
    expect((erro as ForbiddenException).getResponse()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });

    await expect(equipe.canActivate(contexto('campoLiberada', token).ctx)).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx jest src/common/__tests__/campo-guards.spec.ts`
Expected: FAIL — `Cannot find module '../decorators/campo-route.decorator'`.

- [ ] **Step 3: Tipo, decorators e o guard do campo**

Crie `api/src/common/auth/campo-consultant.ts`:

```ts
/** Consultor de campo autenticado, resolvido pelo `CampoAuthGuard` e anexado a `request.campo`. */
export interface CampoConsultant {
  id: string;
  name: string;
  email: string;
  praca_id: string;
  must_change_password: boolean;
}
```

Crie `api/src/common/decorators/campo-route.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const CAMPO_ROUTE_KEY = 'campoRoute';

/**
 * Rota do consultor de campo (`/v1/campo/*`). O `JwtAuthGuard` global vê a marca
 * e delega ao `CampoAuthGuard` — token com `aud: "campo"`, nunca o da equipe.
 */
export const CampoRoute = () => SetMetadata(CAMPO_ROUTE_KEY, true);

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';

/** Rota que o consultor usa ANTES de trocar a senha provisória (troca de senha e `/me`). */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
```

Crie `api/src/common/decorators/current-consultant.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CampoConsultant } from '../auth/campo-consultant';

export const CurrentConsultant = createParamDecorator((_data: unknown, ctx: ExecutionContext): CampoConsultant => {
  return ctx.switchToHttp().getRequest().campo as CampoConsultant;
});
```

Crie `api/src/common/guards/campo-auth.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CampoConsultant } from '../auth/campo-consultant';
import { PrismaService } from '../database/prisma.service';
import { ALLOW_PENDING_PASSWORD_KEY } from '../decorators/campo-route.decorator';

export const CAMPO_AUDIENCE = 'campo';

export interface CampoTokenPayload {
  sub: string;
  /** `token_version` na emissão: menor que o do banco = sessão derrubada. */
  tv: number;
}

/**
 * Guard das rotas `/v1/campo/*` (spec §4.1). Não é APP_GUARD: o `JwtAuthGuard`
 * global delega para cá quando a rota tem `@CampoRoute()`.
 *
 * O `audience` vai no `verifyAsync`: o `jsonwebtoken` só confere `aud` quando a
 * opção é passada, e é isso que recusa o token da equipe (que não tem `aud`) por
 * construção. O consultor é relido a cada request — desativar ou mandar nova
 * senha precisa derrubar a sessão na hora, não daqui a 7 dias.
 */
@Injectable()
export class CampoAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token ausente' });

    let payload: CampoTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<CampoTokenPayload>(token, { audience: CAMPO_AUDIENCE });
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token inválido ou expirado' });
    }

    const c = await this.prisma.field_consultants.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, praca_id: true, active: true, token_version: true, must_change_password: true },
    });
    if (!c?.active) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta desativada' });
    if (typeof payload.tv !== 'number' || payload.tv < c.token_version) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Sessão encerrada — entre de novo.' });
    }

    const liberada = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (c.must_change_password && !liberada) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Troque a senha provisória antes de continuar.',
      });
    }

    request.campo = {
      id: c.id,
      name: c.name,
      email: c.email,
      praca_id: c.praca_id,
      must_change_password: c.must_change_password,
    } satisfies CampoConsultant;
    return true;
  }
}
```

- [ ] **Step 4: O guard global delega e recusa `aud: "campo"`**

Substitua `api/src/common/guards/jwt-auth.guard.ts` inteiro por:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { ADMIN_ONLY_KEY } from '../decorators/admin-only.decorator';
import { CAMPO_ROUTE_KEY } from '../decorators/campo-route.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CAMPO_AUDIENCE, CampoAuthGuard } from './campo-auth.guard';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly campo: CampoAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Rotas do consultor de campo têm sessão própria (spec §4.1).
    const isCampo = this.reflector.getAllAndOverride<boolean>(CAMPO_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isCampo) return this.campo.canActivate(context);

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token ausente' });
    }

    let payload: { sub: string; email: string; name: string; is_admin: boolean; aud?: string | string[] };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token inválido ou expirado' });
    }

    // Recusa EXPLÍCITA do token de consultor: sem isto ele só falharia porque o
    // `sub` não está em `users` — e a segurança da equipe dependeria disso.
    if (([] as string[]).concat(payload.aud ?? []).includes(CAMPO_AUDIENCE)) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Token inválido ou expirado' });
    }

    // Confere no banco, não só no token: uma conta pode ser desativada depois
    // de o JWT já ter sido emitido, e o token continuaria "válido" até expirar.
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: { active: true, is_admin: true },
    });
    if (!user?.active) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta desativada' });
    }

    const isAdminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAdminOnly && !user.is_admin) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Só administradores podem fazer isso.' });
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      is_admin: user.is_admin,
    } satisfies AuthUser;

    return true;
  }
}
```

- [ ] **Step 5: Rodar os testes do guard e ver passar**

Run: `cd api && npx jest src/common/__tests__/campo-guards.spec.ts`
Expected: PASS (10 testes).

- [ ] **Step 6: Escrever o teste do serviço de sessão (falhando)**

Crie `api/src/modules/campo/__tests__/campo-auth.service.spec.ts`:

```ts
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../../../common/database/prisma.service';
import { CAMPO_AUDIENCE } from '../../../common/guards/campo-auth.guard';
import { CampoAuthService } from '../campo-auth.service';

const SEGREDO = 'segredo-de-teste-com-mais-de-16';
const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const HASH = bcrypt.hashSync('provisoria1', 4);

const LINHA = {
  id: CONS,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '31999990000',
  praca_id: PRACA,
  praca: { name: 'Belo Horizonte + Contagem' },
  password_hash: HASH,
  must_change_password: true,
  token_version: 0,
  active: true,
  freela_code: null as string | null,
};

function fakePrisma(linha: typeof LINHA | null = LINHA) {
  return {
    field_consultants: {
      findUnique: jest.fn().mockResolvedValue(linha),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...LINHA,
        must_change_password: data.must_change_password ?? LINHA.must_change_password,
        token_version: LINHA.token_version + 1,
      })),
    },
    app_settings: {
      findUnique: jest.fn().mockResolvedValue({ field_channels: ['Nenhum', 'Grupos de WhatsApp'] }),
    },
  };
}

const jwt = new JwtService({ secret: SEGREDO });
const montar = (p: ReturnType<typeof fakePrisma>) => new CampoAuthService(p as unknown as PrismaService, jwt);

describe('CampoAuthService.login', () => {
  it('devolve token de campo (aud + tv) e avisa da troca obrigatória', async () => {
    const r = await montar(fakePrisma()).login(' Ana@Exemplo.com ', 'provisoria1');

    const payload = await jwt.verifyAsync(r.access_token, { audience: CAMPO_AUDIENCE });
    expect(payload).toMatchObject({ sub: CONS, tv: 0, aud: CAMPO_AUDIENCE });
    expect(r.must_change_password).toBe(true);
    expect(r.consultant).toMatchObject({ id: CONS, praca_name: 'Belo Horizonte + Contagem', freela_code: null, signup_url: null });
    expect(r.consultant).not.toHaveProperty('password_hash');
  });

  it('senha errada ou e-mail desconhecido = INVALID_CREDENTIALS', async () => {
    await expect(montar(fakePrisma()).login('ana@exemplo.com', 'errada12')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    await expect(montar(fakePrisma(null)).login('x@y.com', 'provisoria1')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('senha certa e conta desativada = UNAUTHORIZED', async () => {
    await expect(
      montar(fakePrisma({ ...LINHA, active: false })).login('ana@exemplo.com', 'provisoria1'),
    ).rejects.toMatchObject({ response: { code: 'UNAUTHORIZED', message: 'Conta desativada' } });
  });
});

describe('CampoAuthService.changePassword', () => {
  it('senha atual errada é 400 WRONG_PASSWORD (401 derrubaria a sessão no celular)', async () => {
    await expect(
      montar(fakePrisma()).changePassword(CONS, { current_password: 'errada12', new_password: 'novaSenha9' }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'WRONG_PASSWORD' } });
  });

  it('senha nova igual à atual é 400 SAME_PASSWORD', async () => {
    await expect(
      montar(fakePrisma()).changePassword(CONS, { current_password: 'provisoria1', new_password: 'provisoria1' }),
    ).rejects.toMatchObject({ response: { code: 'SAME_PASSWORD' } });
  });

  it('troca, libera o acesso, sobe token_version e devolve token novo já com a versão nova', async () => {
    const p = fakePrisma();
    const r = await montar(p).changePassword(CONS, { current_password: 'provisoria1', new_password: 'novaSenha9' });

    const data = (p.field_consultants.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ must_change_password: false, token_version: { increment: 1 } });
    expect(await bcrypt.compare('novaSenha9', data.password_hash as string)).toBe(true);
    expect(r.must_change_password).toBe(false);
    expect(await jwt.verifyAsync(r.access_token, { audience: CAMPO_AUDIENCE })).toMatchObject({ tv: 1 });
  });
});

describe('CampoAuthService.me', () => {
  const antes = process.env.FREELA_WEB_URL;
  afterEach(() => {
    if (antes === undefined) delete process.env.FREELA_WEB_URL;
    else process.env.FREELA_WEB_URL = antes;
  });

  it('monta o link do QR com FREELA_WEB_URL e o código; traz os canais', async () => {
    process.env.FREELA_WEB_URL = 'https://freela.exemplo/';
    const r = await montar(fakePrisma({ ...LINHA, freela_code: 'ANASOU7K2P' })).me(CONS);

    expect(r.consultant.signup_url).toBe('https://freela.exemplo/cadastro?consultor=ANASOU7K2P');
    expect(r.channels).toEqual(['Nenhum', 'Grupos de WhatsApp']);
  });

  it('sem FREELA_WEB_URL o link fica nulo mesmo com código', async () => {
    process.env.FREELA_WEB_URL = '';
    const r = await montar(fakePrisma({ ...LINHA, freela_code: 'ANASOU7K2P' })).me(CONS);
    expect(r.consultant.freela_code).toBe('ANASOU7K2P');
    expect(r.consultant.signup_url).toBeNull();
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `cd api && npx jest src/modules/campo/__tests__/campo-auth.service.spec.ts`
Expected: FAIL — `Cannot find module '../campo-auth.service'`.

- [ ] **Step 8: Serviço, ajudantes, DTOs, controllers e módulo**

Crie `api/src/modules/campo/campo-links.ts`:

```ts
/**
 * Link de cadastro do Freela com o código do consultor (spec §7, "Link do QR").
 * O cadastro do Freela web já lê `?consultor=`. Lê `process.env` direto pelo
 * mesmo motivo do `FreelaClient`: o boot já validou, e o teste mexe só no ambiente.
 */
export function signupUrl(code: string | null): string | null {
  const base = (process.env.FREELA_WEB_URL ?? '').trim().replace(/\/+$/, '');
  return base && code ? `${base}/cadastro?consultor=${encodeURIComponent(code)}` : null;
}
```

Crie `api/src/modules/campo/campo-canais.ts`:

```ts
import type { PrismaService } from '../../common/database/prisma.service';
import { CANAIS_PADRAO } from '../../domain/campo-rules';

/** Lista "apps e canais que usa hoje" (`app_settings.field_channels`); sem linha, a padrão. */
export async function lerCanais(prisma: PrismaService): Promise<string[]> {
  const row = await prisma.app_settings.findUnique({ where: { id: 1 }, select: { field_channels: true } });
  const v = row?.field_channels;
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : [...CANAIS_PADRAO];
}
```

Crie `api/src/modules/campo/dto/campo.dto.ts`:

```ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CampoLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  current_password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  new_password!: string;
}
```

Crie `api/src/modules/campo/campo-auth.service.ts`:

```ts
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/database/prisma.service';
import { CAMPO_AUDIENCE, type CampoTokenPayload } from '../../common/guards/campo-auth.guard';
import { lerCanais } from './campo-canais';
import { signupUrl } from './campo-links';
import type { ChangePasswordDto } from './dto/campo.dto';

/** O consultor visto por ele mesmo — nunca `password_hash`, CPF nem Pix. */
export interface CampoMeView {
  id: string;
  name: string;
  email: string;
  phone: string;
  praca_id: string;
  praca_name: string;
  must_change_password: boolean;
  freela_code: string | null;
  signup_url: string | null;
}

export interface CampoLoginView {
  access_token: string;
  consultant: CampoMeView;
  must_change_password: boolean;
}

const COM_PRACA = { praca: { select: { name: true } } } as const;

export function toMeView(c: {
  id: string;
  name: string;
  email: string;
  phone: string;
  praca_id: string;
  praca: { name: string };
  must_change_password: boolean;
  freela_code: string | null;
}): CampoMeView {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    praca_id: c.praca_id,
    praca_name: c.praca.name,
    must_change_password: c.must_change_password,
    freela_code: c.freela_code,
    signup_url: signupUrl(c.freela_code),
  };
}

@Injectable()
export class CampoAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<CampoLoginView> {
    const c = await this.prisma.field_consultants.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: COM_PRACA,
    });
    if (!c || !(await bcrypt.compare(password, c.password_hash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos' });
    }
    if (!c.active) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta desativada' });
    return {
      access_token: await this.issueToken(c),
      consultant: toMeView(c),
      must_change_password: c.must_change_password,
    };
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<CampoLoginView> {
    const c = await this.prisma.field_consultants.findUnique({ where: { id } });
    if (!c) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta não encontrada' });
    // 400, não 401: o axios do campo trata 401 como "sessão morreu" e mandaria
    // o consultor para a tela de entrada por ter errado a senha atual.
    if (!(await bcrypt.compare(dto.current_password, c.password_hash))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'A senha atual não confere.' });
    }
    if (dto.new_password === dto.current_password) {
      throw new BadRequestException({ code: 'SAME_PASSWORD', message: 'A senha nova precisa ser diferente da atual.' });
    }
    const atualizado = await this.prisma.field_consultants.update({
      where: { id },
      data: {
        password_hash: await bcrypt.hash(dto.new_password, 10),
        must_change_password: false,
        token_version: { increment: 1 },
      },
      include: COM_PRACA,
    });
    // Token emitido DEPOIS do incremento: o anterior (com a senha provisória) morre.
    return { access_token: await this.issueToken(atualizado), consultant: toMeView(atualizado), must_change_password: false };
  }

  async me(id: string): Promise<{ consultant: CampoMeView; channels: string[] }> {
    const c = await this.prisma.field_consultants.findUnique({ where: { id }, include: COM_PRACA });
    if (!c) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Conta não encontrada' });
    return { consultant: toMeView(c), channels: await lerCanais(this.prisma) };
  }

  issueToken(c: { id: string; token_version: number }): Promise<string> {
    const payload: CampoTokenPayload = { sub: c.id, tv: c.token_version };
    return this.jwtService.signAsync(payload, {
      audience: CAMPO_AUDIENCE,
      // Mesmo cast do `auth.module.ts`: o tipo do `jsonwebtoken` é template literal.
      expiresIn: (process.env.CAMPO_JWT_EXPIRES_IN || '7d') as `${number}d`,
    });
  }
}
```

Crie `api/src/modules/campo/campo-auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { AllowPendingPassword, CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CampoAuthService } from './campo-auth.service';
import { CampoLoginDto, ChangePasswordDto } from './dto/campo.dto';

@ApiTags('Campo — sessão')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo/auth')
export class CampoAuthController {
  constructor(private readonly auth: CampoAuthService) {}

  // Login aberto à internet: teto próprio por IP, abaixo dos 300/min globais.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: CampoLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @AllowPendingPassword()
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentConsultant() c: CampoConsultant, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(c.id, dto);
  }
}
```

Crie `api/src/modules/campo/campo.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { AllowPendingPassword, CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { CampoAuthService } from './campo-auth.service';

/** Rotas do dia a dia do consultor (`/v1/campo/*`) — §20 do contrato. */
@ApiTags('Campo')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo')
export class CampoController {
  constructor(private readonly auth: CampoAuthService) {}

  @AllowPendingPassword()
  @Get('me')
  me(@CurrentConsultant() c: CampoConsultant) {
    return this.auth.me(c.id);
  }
}
```

Crie `api/src/modules/campo/campo.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CampoAuthController } from './campo-auth.controller';
import { CampoAuthService } from './campo-auth.service';
import { CampoController } from './campo.controller';

/** Consultores de campo — spec 2026-10-08, contrato §20. */
@Module({
  controllers: [CampoAuthController, CampoController],
  providers: [CampoAuthService],
})
export class CampoModule {}
```

Em `api/src/app.module.ts`: importe `CampoAuthGuard` de `./common/guards/campo-auth.guard` e `CampoModule` de `./modules/campo/campo.module`; acrescente `CampoModule,` no fim da lista `imports` (depois de `NotificationsModule,`) e, em `providers`, **antes** dos dois `APP_GUARD`:

```ts
    // Não é APP_GUARD: o `JwtAuthGuard` global delega para ele nas rotas
    // `@CampoRoute()` (sessão do consultor de campo, `aud: "campo"`).
    CampoAuthGuard,
```

Em `api/src/common/config/env.validation.ts`, depois de `FREELA_SYNC_ENABLED: z.string().default('true'),`:

```ts
  // Consultores de campo (spec 2026-10-08). O consultor não deve precisar logar
  // todo dia na rua: token próprio, mais longo que o da equipe.
  CAMPO_JWT_EXPIRES_IN: z.string().default('7d'),
  // Endereço público do Freela web — base do link do QR (`/cadastro?consultor=`).
  FREELA_WEB_URL: z.string().default(''),
```

- [ ] **Step 9: Rodar os dois testes e ver passar**

Run: `cd api && npx jest src/modules/campo/__tests__/campo-auth.service.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/common/__tests__/campo-guards.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add api/src/common api/src/app.module.ts api/src/modules/campo
git commit -m "feat(campo): sessão própria do consultor (aud campo) e isolamento da equipe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Armazenamento das fotos (S3 privado / disco) e configuração

**Files:**
- Modify: `api/package.json`, `api/package-lock.json` (`@aws-sdk/client-s3@3.1012.0`, versão exata — a mesma que o api-freela usa em produção)
- Modify: `api/src/common/config/env.validation.ts`
- Create: `api/src/modules/campo/photo-storage.ts`
- Modify: `api/src/modules/campo/campo.module.ts`
- Test: `api/src/modules/campo/__tests__/photo-storage.spec.ts`, `api/src/common/__tests__/env-campo.spec.ts`

**Interfaces:**
- Produces (`photo-storage.ts`): `interface FotoLida { bytes: Buffer; mime: string }`; `interface PhotoStorage { put(key, bytes, mime): Promise<void>; get(key): Promise<FotoLida | null>; remove(key): Promise<void> }`; `PHOTO_STORAGE` (token de injeção); `type MimeImagem = 'image/jpeg' | 'image/png' | 'image/webp'`; `tipoDaImagem(b: Buffer): MimeImagem | null`; `chaveDaFoto(consultantId, day, visitId, mime): string`; `mimeDaChave(key): MimeImagem`; `CHAVE_FOTO_RE`; classes `DiskPhotoStorage`, `S3PhotoStorage`, `PhotoStorageNaoConfigurado`; `criarPhotoStorage(env): PhotoStorage`.
- Produces (env): `PHOTO_STORAGE: 's3' | 'disk'` (resolvido), `PHOTOS_DIR` (padrão `./uploads`), `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

- [ ] **Step 1: Instalar o SDK do S3 (versão exata)**

Run: `cd api && npm install --save-exact @aws-sdk/client-s3@3.1012.0`
Expected: `package.json` com `"@aws-sdk/client-s3": "3.1012.0"` em `dependencies` (sem `^`).

- [ ] **Step 2: Escrever os testes (falhando)**

Crie `api/src/common/__tests__/env-campo.spec.ts`:

```ts
import { validateEnv } from '../config/env.validation';

const BASE = { DATABASE_URL: 'postgresql://praca:praca@localhost:5437/praca', JWT_SECRET: 'x'.repeat(16) };

describe('env — consultores de campo', () => {
  it('fora de produção as fotos vão para o disco', () => {
    expect(validateEnv(BASE).PHOTO_STORAGE).toBe('disk');
    expect(validateEnv(BASE).PHOTOS_DIR).toBe('./uploads');
  });

  it('em produção o padrão é o bucket S3 (spec §10)', () => {
    expect(validateEnv({ ...BASE, NODE_ENV: 'production' }).PHOTO_STORAGE).toBe('s3');
  });

  it('disco em produção só com PHOTO_STORAGE=disk explícito', () => {
    expect(validateEnv({ ...BASE, NODE_ENV: 'production', PHOTO_STORAGE: 'disk' }).PHOTO_STORAGE).toBe('disk');
  });

  it('PHOTO_STORAGE vazio (compose com ${PHOTO_STORAGE:-}) conta como ausente', () => {
    expect(validateEnv({ ...BASE, NODE_ENV: 'production', PHOTO_STORAGE: '' }).PHOTO_STORAGE).toBe('s3');
  });

  it('valor fora da lista derruba a largada', () => {
    expect(() => validateEnv({ ...BASE, PHOTO_STORAGE: 'ftp' })).toThrow('Configuração de ambiente inválida');
  });

  it('token do consultor vale 7 dias por padrão', () => {
    expect(validateEnv(BASE).CAMPO_JWT_EXPIRES_IN).toBe('7d');
  });
});
```

Crie `api/src/modules/campo/__tests__/photo-storage.spec.ts`:

```ts
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  chaveDaFoto,
  criarPhotoStorage,
  DiskPhotoStorage,
  mimeDaChave,
  PhotoStorageNaoConfigurado,
  S3PhotoStorage,
  tipoDaImagem,
} from '../photo-storage';

const CONS = '44444444-4444-4444-8444-444444444444';
const VISITA = '55555555-5555-4555-8555-555555555555';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]);

describe('tipoDaImagem — pelos bytes, não pelo mimetype declarado', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WEBP', WEBP, 'image/webp'],
    ['HEIC do iPhone', HEIC, null],
    ['texto', Buffer.from('nao e imagem'), null],
    ['vazio', Buffer.alloc(0), null],
  ])('%s', (_nome, bytes, esperado) => {
    expect(tipoDaImagem(bytes as Buffer)).toBe(esperado);
  });
});

describe('chave da foto', () => {
  it('campo/<consultor>/<dia>/<visita>.<ext> e o mime de volta pela extensão', () => {
    const k = chaveDaFoto(CONS, '2026-10-08', VISITA, 'image/png');
    expect(k).toBe(`campo/${CONS}/2026-10-08/${VISITA}.png`);
    expect(mimeDaChave(k)).toBe('image/png');
    expect(mimeDaChave(chaveDaFoto(CONS, '2026-10-08', VISITA, 'image/jpeg'))).toBe('image/jpeg');
  });
});

describe('DiskPhotoStorage', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'praca-fotos-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('guarda, lê e apaga (levando as pastas que ficaram vazias)', async () => {
    const s = new DiskPhotoStorage(dir);
    const k = chaveDaFoto(CONS, '2026-10-08', VISITA, 'image/jpeg');

    await s.put(k, JPEG, 'image/jpeg');
    expect(await s.get(k)).toEqual({ bytes: JPEG, mime: 'image/jpeg' });

    await s.remove(k);
    expect(await s.get(k)).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it('chave fora do formato (../) é recusada antes de tocar no disco', async () => {
    const s = new DiskPhotoStorage(dir);
    await expect(s.put('../../etc/passwd', JPEG, 'image/jpeg')).rejects.toThrow('chave de foto inválida');
  });
});

describe('S3PhotoStorage', () => {
  const k = chaveDaFoto(CONS, '2026-10-08', VISITA, 'image/jpeg');

  it('put manda o objeto privado com tipo e criptografia', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new S3PhotoStorage('fotos-praca', { send } as unknown as S3Client).put(k, JPEG, 'image/jpeg');

    const cmd = send.mock.calls[0]![0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: 'fotos-praca',
      Key: k,
      ContentType: 'image/jpeg',
      ServerSideEncryption: 'AES256',
    });
  });

  it('get devolve os bytes; objeto inexistente = null', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({ ContentType: 'image/jpeg', Body: { transformToByteArray: async () => new Uint8Array(JPEG) } })
      .mockRejectedValueOnce(new NoSuchKey({ message: 'não existe', $metadata: {} }));
    const s = new S3PhotoStorage('fotos-praca', { send } as unknown as S3Client);

    expect(await s.get(k)).toEqual({ bytes: JPEG, mime: 'image/jpeg' });
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
    expect(await s.get(k)).toBeNull();
  });

  it('falha do S3 ao guardar vira 502 PHOTO_STORAGE_ERROR (a fila do celular tenta de novo)', async () => {
    const send = jest.fn().mockRejectedValue(new Error('timeout'));
    const erro = await new S3PhotoStorage('fotos-praca', { send } as unknown as S3Client)
      .put(k, JPEG, 'image/jpeg')
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as BadGatewayException).getResponse()).toMatchObject({ code: 'PHOTO_STORAGE_ERROR' });
  });

  it('remove apaga o objeto', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new S3PhotoStorage('fotos-praca', { send } as unknown as S3Client).remove(k);
    expect(send.mock.calls[0]![0]).toBeInstanceOf(DeleteObjectCommand);
  });
});

describe('criarPhotoStorage', () => {
  const base = {
    PHOTOS_DIR: './uploads',
    S3_BUCKET: '',
    S3_REGION: '',
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
  };

  it('disk → disco', () => {
    expect(criarPhotoStorage({ ...base, PHOTO_STORAGE: 'disk' })).toBeInstanceOf(DiskPhotoStorage);
  });

  it('s3 sem bucket/região sobe, mas responde 503 PHOTO_STORAGE_NOT_CONFIGURED', async () => {
    const s = criarPhotoStorage({ ...base, PHOTO_STORAGE: 's3' });
    expect(s).toBeInstanceOf(PhotoStorageNaoConfigurado);
    const erro = await s.put('x', JPEG, 'image/jpeg').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    expect((erro as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'PHOTO_STORAGE_NOT_CONFIGURED' });
  });

  it('s3 completo → S3 (chaves vazias = cadeia padrão do SDK)', () => {
    expect(criarPhotoStorage({ ...base, PHOTO_STORAGE: 's3', S3_BUCKET: 'fotos', S3_REGION: 'sa-east-1' })).toBeInstanceOf(
      S3PhotoStorage,
    );
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd api && npx jest src/modules/campo/__tests__/photo-storage.spec.ts`
Expected: FAIL — `Cannot find module '../photo-storage'`.

Run: `cd api && npx jest src/common/__tests__/env-campo.spec.ts`
Expected: FAIL — `PHOTO_STORAGE` é `undefined`.

- [ ] **Step 4: Configuração de ambiente**

Em `api/src/common/config/env.validation.ts`:

1. Renomeie `const envSchema = z.object({` para `const envBase = z.object({`.
2. Dentro do objeto, depois de `FREELA_WEB_URL: z.string().default(''),` (Task 2), acrescente:

```ts
  // Fotos das visitas (spec §10). Vazio conta como ausente: o compose declara
  // `PHOTO_STORAGE: ${PHOTO_STORAGE:-}` e o padrão sai do NODE_ENV abaixo.
  PHOTO_STORAGE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['s3', 'disk']).optional()),
  PHOTOS_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default(''),
  // Vazias = cadeia padrão do SDK (papel da instância). Chave dedicada: só este bucket.
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
```

3. Logo depois do fechamento `});` do `envBase`, acrescente:

```ts
/**
 * Produção grava no bucket privado; disco só com `PHOTO_STORAGE=disk` explícito
 * (o EC2 é dividido com o Freela de produção e tem pouco espaço — spec §10).
 */
const envSchema = envBase.transform((e) => ({
  ...e,
  PHOTO_STORAGE: e.PHOTO_STORAGE ?? (e.NODE_ENV === 'production' ? ('s3' as const) : ('disk' as const)),
}));
```

`export type Env = z.infer<typeof envSchema>;` e `validateEnv` ficam como estão (agora sobre o `envSchema` transformado).

- [ ] **Step 5: Implementar o armazenamento**

Crie `api/src/modules/campo/photo-storage.ts`:

```ts
/**
 * Fotos das visitas — spec §10.
 *
 * Duas implementações atrás da mesma interface: **S3** (bucket privado, padrão em
 * produção) e **disco** (desenvolvimento). A foto nunca tem link público: quem
 * lê é a API, que confere quem pede.
 *
 * Bucket ou região faltando em modo `s3` não derruba o boot (o resto do Praça
 * continua de pé): as rotas de foto respondem 503, como o Freela sem conexão.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../../common/config/env.validation';

export type MimeImagem = 'image/jpeg' | 'image/png' | 'image/webp';

export interface FotoLida {
  bytes: Buffer;
  mime: string;
}

export interface PhotoStorage {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<FotoLida | null>;
  remove(key: string): Promise<void>;
}

export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE');

export const PHOTO_STORAGE_NOT_CONFIGURED_MESSAGE =
  'Armazenamento de fotos não configurado (PHOTO_STORAGE=s3 exige S3_BUCKET e S3_REGION).';

/**
 * Tipo real pelos bytes mágicos. O mimetype do multipart é o que o navegador
 * DIZ — um HEIC renomeado para .jpg chegaria como `image/jpeg`.
 */
export function tipoDaImagem(b: Buffer): MimeImagem | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

const EXT: Record<MimeImagem, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME_DA_EXT: Record<string, MimeImagem> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const CHAVE_FOTO_RE = /^campo\/[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function chaveDaFoto(consultantId: string, day: string, visitId: string, mime: MimeImagem): string {
  return `campo/${consultantId}/${day}/${visitId}.${EXT[mime]}`;
}

export function mimeDaChave(key: string): MimeImagem {
  return MIME_DA_EXT[key.slice(key.lastIndexOf('.') + 1)] ?? 'image/jpeg';
}

export class DiskPhotoStorage implements PhotoStorage {
  constructor(private readonly dir: string) {}

  private caminho(key: string): string {
    if (!CHAVE_FOTO_RE.test(key)) throw new Error(`chave de foto inválida: ${key}`);
    return path.join(path.resolve(this.dir), ...key.split('/'));
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const arquivo = this.caminho(key);
    await fs.mkdir(path.dirname(arquivo), { recursive: true });
    await fs.writeFile(arquivo, bytes);
  }

  async get(key: string): Promise<FotoLida | null> {
    try {
      return { bytes: await fs.readFile(this.caminho(key)), mime: mimeDaChave(key) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    const arquivo = this.caminho(key);
    await fs.rm(arquivo, { force: true });
    // As pastas do dia e do consultor que ficaram vazias saem junto: apagar um
    // consultor de teste não deixa árvore morta em `uploads/`.
    const raiz = path.resolve(this.dir);
    let pasta = path.dirname(arquivo);
    while (pasta.startsWith(raiz) && pasta !== raiz) {
      try {
        await fs.rmdir(pasta);
      } catch {
        break;
      }
      pasta = path.dirname(pasta);
    }
  }
}

export class S3PhotoStorage implements PhotoStorage {
  private readonly log = new Logger('PhotoStorage');

  constructor(
    private readonly bucket: string,
    private readonly client: S3Client,
  ) {}

  async put(key: string, bytes: Buffer, mime: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: mime,
          ServerSideEncryption: 'AES256',
        }),
      );
    } catch (e) {
      this.log.error(`S3 put falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
      throw new BadGatewayException({
        code: 'PHOTO_STORAGE_ERROR',
        message: 'Não foi possível guardar a foto agora — tente de novo.',
      });
    }
  }

  async get(key: string): Promise<FotoLida | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!r.Body) return null;
      return { bytes: Buffer.from(await r.Body.transformToByteArray()), mime: r.ContentType ?? mimeDaChave(key) };
    } catch (e) {
      if (e instanceof NoSuchKey || (e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export class PhotoStorageNaoConfigurado implements PhotoStorage {
  private falhar(): never {
    throw new ServiceUnavailableException({
      code: 'PHOTO_STORAGE_NOT_CONFIGURED',
      message: PHOTO_STORAGE_NOT_CONFIGURED_MESSAGE,
    });
  }
  async put(): Promise<void> {
    return this.falhar();
  }
  async get(): Promise<FotoLida | null> {
    return this.falhar();
  }
  async remove(): Promise<void> {
    return this.falhar();
  }
}

type EnvFotos = Pick<
  Env,
  'PHOTO_STORAGE' | 'PHOTOS_DIR' | 'S3_BUCKET' | 'S3_REGION' | 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY'
>;

export function criarPhotoStorage(env: EnvFotos, log = new Logger('PhotoStorage')): PhotoStorage {
  if (env.PHOTO_STORAGE === 'disk') return new DiskPhotoStorage(env.PHOTOS_DIR);
  if (!env.S3_BUCKET || !env.S3_REGION) {
    log.warn(PHOTO_STORAGE_NOT_CONFIGURED_MESSAGE);
    return new PhotoStorageNaoConfigurado();
  }
  const credentials =
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
      : undefined;
  return new S3PhotoStorage(env.S3_BUCKET, new S3Client({ region: env.S3_REGION, ...(credentials ? { credentials } : {}) }));
}
```

- [ ] **Step 6: Registrar o provider no módulo**

Substitua `api/src/modules/campo/campo.module.ts` por:

```ts
import { Module } from '@nestjs/common';
import { validateEnv } from '../../common/config/env.validation';
import { CampoAuthController } from './campo-auth.controller';
import { CampoAuthService } from './campo-auth.service';
import { CampoController } from './campo.controller';
import { criarPhotoStorage, PHOTO_STORAGE } from './photo-storage';

/** Consultores de campo — spec 2026-10-08, contrato §20. */
@Module({
  controllers: [CampoAuthController, CampoController],
  providers: [
    CampoAuthService,
    // O `.env` já está em `process.env` (ConfigModule.forRoot) e foi validado na
    // largada; reler pelo mesmo schema dá o PHOTO_STORAGE já resolvido.
    { provide: PHOTO_STORAGE, useFactory: () => criarPhotoStorage(validateEnv(process.env)) },
  ],
})
export class CampoModule {}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `cd api && npx jest src/modules/campo/__tests__/photo-storage.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/common/__tests__/env-campo.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add api/package.json api/package-lock.json api/src/common/config/env.validation.ts api/src/common/__tests__/env-campo.spec.ts api/src/modules/campo
git commit -m "feat(campo): fotos em S3 privado (padrão em produção) ou disco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Consultores (equipe) — cadastro, senha provisória, código no Freela, desativar e apagar

**Files:**
- Modify: `api/src/modules/freela/freela-client.ts` (`FreelaHttpError`)
- Modify: `api/src/modules/freela/__tests__/freela-client.spec.ts`
- Create: `api/src/modules/campo/prisma-errors.ts`
- Create: `api/src/modules/campo/campo-freela.service.ts`
- Create: `api/src/modules/campo/dto/consultores.dto.ts`
- Create: `api/src/modules/campo/consultores.service.ts`
- Create: `api/src/modules/campo/consultores.controller.ts`
- Modify: `api/src/modules/campo/campo.module.ts`
- Modify: `api/src/modules/freela/freela.module.ts`, `api/src/modules/freela/freela-sync.scheduler.ts`
- Modify: `api/src/modules/pracas/pracas.service.ts`
- Test: `api/src/modules/campo/__tests__/campo-freela.service.spec.ts`, `api/src/modules/campo/__tests__/consultores.service.spec.ts`, `api/src/modules/freela/__tests__/freela-sync.scheduler.spec.ts`, `api/src/modules/pracas/__tests__/pracas-remove.spec.ts`

**Interfaces:**
- Consumes: `cpfValido`, `pixValido`, `normalizarPix`, `situacaoHoje`, `gerarSenhaProvisoria`, `PIX_TIPOS` (Task 1); `signupUrl` (Task 2); `PHOTO_STORAGE`/`PhotoStorage` (Task 3); `FreelaClient.request<T>(method, path, body?)`, `FreelaClient.isConfigured()`.
- Produces:
  - `class FreelaHttpError extends BadGatewayException { readonly freelaStatus: number }` (em `freela-client.ts`).
  - `violouUnico(e: unknown): boolean` (`prisma-errors.ts`).
  - `FREELA_NOTES`, `EMAIL_DUPLICADO_NO_FREELA`, `CampoFreelaService.sync(id): Promise<void>`, `.retryPending(): Promise<number>`, `.desativarAntesDeApagar(c): Promise<void>`.
  - `ConsultorView`, `ConsultorListItem`, `toConsultorView(row)`, `COM_PRACA`; `ConsultoresService.list(agora?)`, `.get(id)`, `.create(dto, admin)`, `.update(id, dto)`, `.resetPassword(id)`, `.freelaSync(id)`, `.remove(id)`, `.findOrFail(id)` (público — a Task 7 usa).
  - DTOs `CreateConsultorDto`, `UpdateConsultorDto`.

- [ ] **Step 1: Teste do status do Freela no erro (falhando)**

Em `api/src/modules/freela/__tests__/freela-client.spec.ts`, troque o import do cliente por:

```ts
import { FreelaClient, FreelaHttpError } from '../freela-client';
```

e acrescente no fim do arquivo:

```ts
describe('FreelaClient — status do Freela na recusa', () => {
  beforeEach(configurar);

  it('409 vira FreelaHttpError com freelaStatus, sem mudar o corpo do erro que a tela vê', async () => {
    fetchMock
      .mockResolvedValueOnce(LOGIN_OK)
      .mockResolvedValueOnce(resp(409, { error: { code: 'CONFLICT', message: 'Já existe um consultor com este e-mail.' } }));

    const erro = await new FreelaClient()
      .request('POST', '/v1/admins/consultants', { name: 'Ana' })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FreelaHttpError);
    expect(erro).toBeInstanceOf(BadGatewayException);
    expect((erro as FreelaHttpError).freelaStatus).toBe(409);
    expect((erro as FreelaHttpError).getResponse()).toEqual({
      code: 'FREELA_ERROR',
      message: 'Já existe um consultor com este e-mail.',
    });
  });
});
```

Run: `cd api && npx jest src/modules/freela/__tests__/freela-client.spec.ts`
Expected: FAIL — `FreelaHttpError` não é exportado (o import vem `undefined` e o `toBeInstanceOf` quebra).

- [ ] **Step 2: `FreelaHttpError` no cliente**

Em `api/src/modules/freela/freela-client.ts`, depois de `export type FreelaMethod = ...`, acrescente:

```ts
/**
 * Recusa do Freela com o status HTTP DELE. O corpo (o que a tela vê) continua
 * `{code: 'FREELA_ERROR', message}`; `freelaStatus` é o que deixa o Praça
 * distinguir "e-mail já usado" (409) de "sem permissão" (403) sem casar texto.
 */
export class FreelaHttpError extends BadGatewayException {
  constructor(
    readonly freelaStatus: number,
    message: string,
  ) {
    super({ code: 'FREELA_ERROR', message });
  }
}
```

e, em `parse()`, troque

```ts
    if (!res.ok)
      throw new BadGatewayException({ code: 'FREELA_ERROR', message: this.mensagem(corpo, res.status) });
```

por

```ts
    if (!res.ok) throw new FreelaHttpError(res.status, this.mensagem(corpo, res.status));
```

Run: `cd api && npx jest src/modules/freela/__tests__/freela-client.spec.ts`
Expected: PASS (inclusive os testes antigos que comparam o corpo com `toEqual`).

- [ ] **Step 3: Testes do código no Freela, do cadastro e do relógio (falhando)**

Crie `api/src/modules/campo/__tests__/campo-freela.service.spec.ts`:

```ts
import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../../common/database/prisma.service';
import { FREELA_NOT_CONFIGURED_MESSAGE, FreelaClient, FreelaHttpError } from '../../freela/freela-client';
import { CampoFreelaService, EMAIL_DUPLICADO_NO_FREELA, FREELA_NOTES } from '../campo-freela.service';

const CONS = '44444444-4444-4444-8444-444444444444';

const LINHA = {
  id: CONS,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '31999990000',
  active: true,
  freela_consultant_id: null as string | null,
  praca: { cobertura_cidade: 'Belo Horizonte' as string | null, cobertura_uf: 'MG' as string | null },
};

function fakePrisma(linha: Record<string, unknown> | null = LINHA) {
  return {
    field_consultants: {
      findUnique: jest.fn().mockResolvedValue(linha),
      findMany: jest.fn().mockResolvedValue([{ id: CONS }]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function montar(p: ReturnType<typeof fakePrisma>, request: jest.Mock) {
  const client = { request, isConfigured: () => true } as unknown as FreelaClient;
  return new CampoFreelaService(p as unknown as PrismaService, client);
}

const dados = (p: ReturnType<typeof fakePrisma>, n = 0) =>
  (p.field_consultants.update.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

describe('CampoFreelaService.sync — criar o código', () => {
  it('cria com a nota do Praça, telefone em +55 e a cobertura da praça; guarda id e código', async () => {
    const p = fakePrisma();
    const request = jest.fn().mockResolvedValue({ data: { id: 'fc-1', code: 'ANASOU7K2P' } });

    await montar(p, request).sync(CONS);

    expect(request).toHaveBeenCalledWith('POST', '/v1/admins/consultants', {
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      notes: FREELA_NOTES,
      phone: '+5531999990000',
      city: 'Belo Horizonte',
      uf: 'MG',
    });
    expect(dados(p)).toMatchObject({ freela_consultant_id: 'fc-1', freela_code: 'ANASOU7K2P', freela_sync_error: null });
  });

  it('praça sem cobertura e telefone inválido: manda só o que o Freela aceita', async () => {
    const p = fakePrisma({ ...LINHA, phone: '123', praca: { cobertura_cidade: null, cobertura_uf: null } });
    const request = jest.fn().mockResolvedValue({ data: { id: 'fc-1', code: 'ANASOU7K2P' } });

    await montar(p, request).sync(CONS);

    expect(request.mock.calls[0]![2]).toEqual({ name: 'Ana Souza', email: 'ana@exemplo.com', notes: FREELA_NOTES });
  });

  it('Freela sem configuração: não lança, guarda o motivo', async () => {
    const p = fakePrisma();
    const request = jest
      .fn()
      .mockRejectedValue(new ServiceUnavailableException({ code: 'FREELA_NOT_CONFIGURED', message: FREELA_NOT_CONFIGURED_MESSAGE }));

    await expect(montar(p, request).sync(CONS)).resolves.toBeUndefined();
    expect(dados(p)).toEqual({ freela_sync_error: FREELA_NOT_CONFIGURED_MESSAGE });
  });

  it('409 com um consultor NOSSO lá (resposta perdida): adota id e código', async () => {
    const p = fakePrisma();
    const request = jest
      .fn()
      .mockRejectedValueOnce(new FreelaHttpError(409, 'Já existe um consultor com este e-mail.'))
      .mockResolvedValueOnce({
        data: [
          { id: 'outro', code: 'OUTRO123', email: 'x@y.com', notes: null },
          { id: 'fc-9', code: 'ANASOU9Z', email: 'Ana@Exemplo.com', notes: FREELA_NOTES },
        ],
      });

    await montar(p, request).sync(CONS);

    expect(request).toHaveBeenLastCalledWith('GET', '/v1/admins/consultants');
    expect(dados(p)).toMatchObject({ freela_consultant_id: 'fc-9', freela_code: 'ANASOU9Z', freela_sync_error: null });
  });

  it('409 com o e-mail de OUTRO consultor do Freela: erro fixo que exige o admin', async () => {
    const p = fakePrisma();
    const request = jest
      .fn()
      .mockRejectedValueOnce(new FreelaHttpError(409, 'Já existe um consultor com este e-mail.'))
      .mockResolvedValueOnce({ data: [{ id: 'fc-7', code: 'ANDRE2K', email: 'ana@exemplo.com', notes: 'Parceiro' }] });

    await montar(p, request).sync(CONS);

    expect(dados(p)).toEqual({ freela_sync_error: EMAIL_DUPLICADO_NO_FREELA });
  });

  it('inativo sem código: nada a criar', async () => {
    const p = fakePrisma({ ...LINHA, active: false });
    const request = jest.fn();
    await montar(p, request).sync(CONS);
    expect(request).not.toHaveBeenCalled();
    expect(p.field_consultants.update).not.toHaveBeenCalled();
  });
});

describe('CampoFreelaService.sync — ativar/desativar', () => {
  it('desativado no Praça → PATCH isActive=false no Freela e limpa o erro', async () => {
    const p = fakePrisma({ ...LINHA, active: false, freela_consultant_id: 'fc-1' });
    const request = jest.fn().mockResolvedValue({ data: {} });

    await montar(p, request).sync(CONS);

    expect(request).toHaveBeenCalledWith('PATCH', '/v1/admins/consultants/fc-1', { isActive: false });
    expect(dados(p)).toMatchObject({ freela_sync_error: null });
  });

  it('falha no PATCH vira erro (o relógio repete)', async () => {
    const p = fakePrisma({ ...LINHA, active: false, freela_consultant_id: 'fc-1' });
    const request = jest.fn().mockRejectedValue(new FreelaHttpError(403, 'Sem permissão.'));

    await montar(p, request).sync(CONS);

    expect(dados(p)).toEqual({ freela_sync_error: 'Sem permissão.' });
  });
});

describe('CampoFreelaService.retryPending', () => {
  it('busca pendentes de criação e de ativação, nunca o e-mail duplicado, e sincroniza um a um', async () => {
    const p = fakePrisma();
    const request = jest.fn().mockResolvedValue({ data: { id: 'fc-1', code: 'ANASOU7K2P' } });

    expect(await montar(p, request).retryPending()).toBe(1);

    const where = (p.field_consultants.findMany.mock.calls[0]![0] as { where: unknown }).where;
    expect(JSON.stringify(where)).toContain(EMAIL_DUPLICADO_NO_FREELA);
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { freela_consultant_id: null, active: true },
            { freela_consultant_id: { not: null }, freela_sync_error: { not: null } },
          ],
        },
        { OR: [{ freela_sync_error: null }, { freela_sync_error: { not: EMAIL_DUPLICADO_NO_FREELA } }] },
      ],
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
```

Crie `api/src/modules/campo/__tests__/consultores.service.spec.ts`:

```ts
import * as bcrypt from 'bcryptjs';
import type { AuthUser } from '../../../common/auth/auth-user';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { CampoFreelaService } from '../campo-freela.service';
import { ConsultoresService } from '../consultores.service';
import type { CreateConsultorDto } from '../dto/consultores.dto';
import type { PhotoStorage } from '../photo-storage';

const CONS = '44444444-4444-4444-8444-444444444444';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const DIEGO = '33333333-3333-4333-8333-333333333333';
const ADMIN: AuthUser = { id: DIEGO, email: 'diego@praca.local', name: 'Diego', is_admin: true };

const LINHA = {
  id: CONS,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  phone: '31999990000',
  cpf: '52998224725',
  praca_id: PRACA,
  praca: { name: 'Belo Horizonte + Contagem' },
  pix_key: '52998224725',
  pix_key_type: 'cpf',
  password_hash: 'x',
  must_change_password: true,
  token_version: 0,
  active: true,
  freela_consultant_id: null as string | null,
  freela_code: null as string | null,
  freela_sync_error: null as string | null,
  freela_synced_at: null as Date | null,
  created_by: DIEGO,
  created_at: new Date('2026-10-08T12:00:00.000Z'),
  updated_at: new Date('2026-10-08T12:00:00.000Z'),
};

const NOVO: CreateConsultorDto = {
  name: ' Ana Souza ',
  email: ' Ana@Exemplo.com ',
  phone: '(31) 99999-0000',
  cpf: '529.982.247-25',
  praca_id: PRACA,
  pix_key_type: 'cpf',
  pix_key: '529.982.247-25',
};

function fakePrisma() {
  return {
    pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA }) },
    field_consultants: {
      // Por padrão: o próprio consultor pelo id; e-mail/CPF ainda livres.
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { id?: string } }) => (where.id === CONS ? LINHA : null)),
      findMany: jest.fn().mockResolvedValue([LINHA]),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...LINHA, ...data, id: CONS })),
      update: jest.fn().mockResolvedValue(LINHA),
      delete: jest.fn().mockResolvedValue(LINHA),
    },
    field_journeys: { findMany: jest.fn().mockResolvedValue([]) },
    field_visits: { findMany: jest.fn().mockResolvedValue([]) },
    field_points: { groupBy: jest.fn().mockResolvedValue([]) },
  };
}

function montar(p: ReturnType<typeof fakePrisma>) {
  const freela = {
    sync: jest.fn().mockResolvedValue(undefined),
    desativarAntesDeApagar: jest.fn().mockResolvedValue(undefined),
  };
  const fotos = { put: jest.fn(), get: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };
  const s = new ConsultoresService(
    p as unknown as PrismaService,
    freela as unknown as CampoFreelaService,
    fotos as unknown as PhotoStorage,
  );
  return { s, freela, fotos };
}

const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

describe('ConsultoresService.create', () => {
  it('normaliza, guarda a senha provisória com hash, dispara o código no Freela e devolve a senha UMA vez', async () => {
    const p = fakePrisma();
    const { s, freela } = montar(p);

    const r = await s.create(NOVO, ADMIN);

    const data = dataDo(p.field_consultants.create);
    expect(data).toMatchObject({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      phone: '31999990000',
      cpf: '52998224725',
      praca_id: PRACA,
      pix_key_type: 'cpf',
      pix_key: '52998224725',
      created_by: DIEGO,
    });
    expect(r.temp_password).toMatch(/^[a-z2-9]{10}$/);
    expect(await bcrypt.compare(r.temp_password, data.password_hash as string)).toBe(true);
    expect(freela.sync).toHaveBeenCalledWith(CONS);
    expect(r.consultant).not.toHaveProperty('password_hash');
    expect(r.consultant).toMatchObject({ id: CONS, praca_name: 'Belo Horizonte + Contagem', signup_url: null });
  });

  it('CPF com dígito errado = 400 INVALID_CPF, nada é gravado', async () => {
    const p = fakePrisma();
    await expect(montar(p).s.create({ ...NOVO, cpf: '529.982.247-24' }, ADMIN)).rejects.toMatchObject({
      response: { code: 'INVALID_CPF' },
    });
    expect(p.field_consultants.create).not.toHaveBeenCalled();
  });

  it('chave Pix que não bate com o tipo = 400 INVALID_PIX', async () => {
    await expect(montar(fakePrisma()).s.create({ ...NOVO, pix_key_type: 'email', pix_key: 'nao-e-email' }, ADMIN)).rejects.toMatchObject(
      { response: { code: 'INVALID_PIX' } },
    );
  });

  it('praça inexistente = 404', async () => {
    const p = fakePrisma();
    p.pracas.findUnique.mockResolvedValue(null);
    await expect(montar(p).s.create(NOVO, ADMIN)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('e-mail ou CPF já usados = 409', async () => {
    const p = fakePrisma();
    p.field_consultants.findUnique.mockImplementation(async ({ where }: { where: { email?: string } }) =>
      where.email ? LINHA : null,
    );
    await expect(montar(p).s.create(NOVO, ADMIN)).rejects.toMatchObject({ response: { code: 'EMAIL_IN_USE' } });

    const q = fakePrisma();
    q.field_consultants.findUnique.mockImplementation(async ({ where }: { where: { cpf?: string } }) =>
      where.cpf ? LINHA : null,
    );
    await expect(montar(q).s.create(NOVO, ADMIN)).rejects.toMatchObject({ response: { code: 'CPF_IN_USE' } });
  });
});

describe('ConsultoresService.update / resetPassword / remove', () => {
  it('desativar sobe token_version (derruba a sessão) e desativa o código no Freela', async () => {
    const p = fakePrisma();
    const { s, freela } = montar(p);

    await s.update(CONS, { active: false });

    expect(dataDo(p.field_consultants.update)).toMatchObject({ active: false, token_version: { increment: 1 } });
    expect(freela.sync).toHaveBeenCalledWith(CONS);
  });

  it('trocar o e-mail sem código no Freela limpa o erro e tenta de novo', async () => {
    const p = fakePrisma();
    const { s, freela } = montar(p);

    await s.update(CONS, { email: 'ana.nova@exemplo.com' });

    expect(dataDo(p.field_consultants.update)).toMatchObject({ email: 'ana.nova@exemplo.com', freela_sync_error: null });
    expect(freela.sync).toHaveBeenCalledWith(CONS);
  });

  it('nova senha provisória: obriga a troca, derruba a sessão e devolve a senha uma vez', async () => {
    const p = fakePrisma();
    const r = await montar(p).s.resetPassword(CONS);

    const data = dataDo(p.field_consultants.update);
    expect(data).toMatchObject({ must_change_password: true, token_version: { increment: 1 } });
    expect(await bcrypt.compare(r.temp_password, data.password_hash as string)).toBe(true);
  });

  it('apagar desliga o código no Freela, apaga o consultor e as fotos', async () => {
    const p = fakePrisma();
    p.field_visits.findMany.mockResolvedValue([{ photo_key: 'campo/a.jpg' }, { photo_key: 'campo/b.jpg' }]);
    const { s, freela, fotos } = montar(p);

    expect(await s.remove(CONS)).toEqual({ ok: true });
    expect(freela.desativarAntesDeApagar).toHaveBeenCalled();
    expect(p.field_consultants.delete).toHaveBeenCalledWith({ where: { id: CONS } });
    expect(fotos.remove.mock.calls.map((c) => c[0])).toEqual(['campo/a.jpg', 'campo/b.jpg']);
  });

  it('id malformado = 404 sem tocar no banco', async () => {
    const p = fakePrisma();
    await expect(montar(p).s.get('nao-e-uuid')).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(p.field_consultants.findUnique).not.toHaveBeenCalled();
  });
});

describe('ConsultoresService.list — situação de hoje', () => {
  it('em jornada, visitas e "cadastrou agora" de hoje, último ponto', async () => {
    const p = fakePrisma();
    p.field_journeys.findMany.mockResolvedValue([{ id: 'j1', consultant_id: CONS, ended_at: null }]);
    p.field_visits.findMany.mockResolvedValue([
      { consultant_id: CONS, freela_status: 'cadastrou_qr' },
      { consultant_id: CONS, freela_status: 'ja_usa' },
    ]);
    p.field_points.groupBy.mockResolvedValue([{ journey_id: 'j1', _max: { at: new Date('2026-10-08T17:40:00.000Z') } }]);

    const [item] = await montar(p).s.list(new Date('2026-10-08T18:00:00.000Z'));

    expect((p.field_journeys.findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({ day: '2026-10-08' });
    expect(item!.today).toEqual({
      status: 'em_jornada',
      visits: 2,
      cadastros: 1,
      last_point_at: '2026-10-08T17:40:00.000Z',
    });
  });
});
```

Crie `api/src/modules/freela/__tests__/freela-sync.scheduler.spec.ts`:

```ts
import type { CampoFreelaService } from '../../campo/campo-freela.service';
import type { FreelaCampaignsService } from '../freela-campaigns.service';
import type { FreelaClient } from '../freela-client';
import type { FreelaOutboxService } from '../freela-outbox.service';
import { FreelaSyncScheduler } from '../freela-sync.scheduler';

function montar(configurado = true) {
  const client = { syncEnabled: () => true, isConfigured: () => configurado };
  const outbox = { flush: jest.fn().mockRejectedValue(new Error('outbox caiu')) };
  const campaigns = { syncAll: jest.fn() };
  const campo = { retryPending: jest.fn().mockResolvedValue(0) };
  const s = new FreelaSyncScheduler(
    client as unknown as FreelaClient,
    outbox as unknown as FreelaOutboxService,
    campaigns as unknown as FreelaCampaignsService,
    campo as unknown as CampoFreelaService,
  );
  return { s, campo };
}

describe('FreelaSyncScheduler — código dos consultores de campo', () => {
  it('falha do outbox não segura o código pendente dos consultores', async () => {
    const { s, campo } = montar();
    await s.tick();
    expect(campo.retryPending).toHaveBeenCalledTimes(1);
  });

  it('sem conexão configurada, nada roda', async () => {
    const { s, campo } = montar(false);
    await s.tick();
    expect(campo.retryPending).not.toHaveBeenCalled();
  });
});
```

Crie `api/src/modules/pracas/__tests__/pracas-remove.spec.ts`:

```ts
import type { PrismaService } from '../../../common/database/prisma.service';
import { PracasService } from '../pracas.service';

const PRACA = '00000000-0000-4000-8000-0000000000aa';

describe('PracasService.remove — consultores de campo na praça', () => {
  it('praça com consultor = 409 PRACA_HAS_CONSULTANTS (a FK é Restrict; sem isto viraria 500)', async () => {
    const p = {
      pracas: { findUnique: jest.fn().mockResolvedValue({ id: PRACA, step_states: [] }), delete: jest.fn() },
      field_consultants: { count: jest.fn().mockResolvedValue(2) },
      users: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const s = new PracasService(p as unknown as PrismaService, null as never);

    await expect(s.remove(PRACA)).rejects.toMatchObject({ status: 409, response: { code: 'PRACA_HAS_CONSULTANTS' } });
    expect(p.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd api && npx jest src/modules/campo/__tests__/campo-freela.service.spec.ts`
Expected: FAIL — `Cannot find module '../campo-freela.service'`.

Run: `cd api && npx jest src/modules/campo/__tests__/consultores.service.spec.ts`
Expected: FAIL — `Cannot find module '../consultores.service'`.

Run: `cd api && npx jest src/modules/freela/__tests__/freela-sync.scheduler.spec.ts`
Expected: FAIL — `retryPending` nunca é chamado.

Run: `cd api && npx jest src/modules/pracas/__tests__/pracas-remove.spec.ts`
Expected: FAIL — a praça é apagada (`$transaction` chamado).

- [ ] **Step 5: Código no Freela**

Crie `api/src/modules/campo/prisma-errors.ts`:

```ts
import { Prisma } from '@prisma/client';

/** Violação de índice único (inclui os índices parciais de "uma aberta por vez"). */
export const violouUnico = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
```

Crie `api/src/modules/campo/campo-freela.service.ts`:

```ts
/**
 * Código de indicação do consultor no Freela — spec §7 ("Código no Freela").
 *
 * O Praça cria o consultor no api-freela (`POST /v1/admins/consultants`) e
 * guarda id + código; o QR leva ao cadastro com `?consultor=CÓDIGO`. Tudo aqui
 * é "melhor esforço que se repete": falha vira `freela_sync_error`, a tela
 * mostra, e o relógio de 2 min do Freela (`FreelaSyncScheduler`) tenta de novo.
 */
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { toE164BR } from '../../common/phone/phone';
import { FreelaClient, FreelaHttpError } from '../freela/freela-client';

export const FREELA_NOTES = 'Consultor de campo — Praça';

/** Erro fixo: o relógio NÃO repete (exige o admin trocar o e-mail). */
export const EMAIL_DUPLICADO_NO_FREELA =
  'O e-mail deste consultor já é usado por outro consultor no Freela — troque o e-mail aqui e tente de novo.';

/** Recorte do `ConsultantView` do api-freela que o Praça usa. */
interface FreelaConsultor {
  id: string;
  code: string;
  email: string | null;
  notes: string | null;
}

class EmailDuplicado extends Error {}

interface LinhaSync {
  name: string;
  email: string;
  phone: string;
  praca: { cobertura_cidade: string | null; cobertura_uf: string | null };
}

@Injectable()
export class CampoFreelaService {
  private readonly log = new Logger(CampoFreelaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FreelaClient,
  ) {}

  /** Põe o Freela em dia com o consultor. NUNCA lança: o erro vira `freela_sync_error`. */
  async sync(id: string): Promise<void> {
    const c = await this.prisma.field_consultants.findUnique({
      where: { id },
      include: { praca: { select: { cobertura_cidade: true, cobertura_uf: true } } },
    });
    if (!c) return;
    try {
      if (!c.freela_consultant_id) {
        if (!c.active) return;
        const criado = await this.criarOuAdotar(c);
        await this.prisma.field_consultants.update({
          where: { id },
          data: {
            freela_consultant_id: criado.id,
            freela_code: criado.code,
            freela_sync_error: null,
            freela_synced_at: new Date(),
          },
        });
        return;
      }
      await this.client.request('PATCH', `/v1/admins/consultants/${encodeURIComponent(c.freela_consultant_id)}`, {
        isActive: c.active,
      });
      await this.prisma.field_consultants.update({
        where: { id },
        data: { freela_sync_error: null, freela_synced_at: new Date() },
      });
    } catch (e) {
      const msg = this.mensagem(e);
      this.log.warn(`código do Freela de ${c.email}: ${msg}`);
      await this.prisma.field_consultants.update({ where: { id }, data: { freela_sync_error: msg } });
    }
  }

  /** Antes de apagar o consultor: desliga o código lá (melhor esforço, sem repetir). */
  async desativarAntesDeApagar(c: { freela_consultant_id: string | null; active: boolean }): Promise<void> {
    if (!c.freela_consultant_id || !c.active || !this.client.isConfigured()) return;
    try {
      await this.client.request('PATCH', `/v1/admins/consultants/${encodeURIComponent(c.freela_consultant_id)}`, {
        isActive: false,
      });
    } catch (e) {
      this.log.warn(`não deu para desativar o código no Freela antes de apagar: ${this.mensagem(e)}`);
    }
  }

  /** Relógio de 2 min: criação pendente e ativar/desativar que falhou — menos o e-mail duplicado. */
  async retryPending(): Promise<number> {
    const pendentes = await this.prisma.field_consultants.findMany({
      where: {
        AND: [
          {
            OR: [
              { freela_consultant_id: null, active: true },
              { freela_consultant_id: { not: null }, freela_sync_error: { not: null } },
            ],
          },
          // `not` do Prisma descarta NULL: o OR explícito mantém quem não tem erro.
          { OR: [{ freela_sync_error: null }, { freela_sync_error: { not: EMAIL_DUPLICADO_NO_FREELA } }] },
        ],
      },
      select: { id: true },
      orderBy: { created_at: 'asc' },
      take: 20,
    });
    for (const p of pendentes) await this.sync(p.id);
    return pendentes.length;
  }

  private async criarOuAdotar(c: LinhaSync): Promise<{ id: string; code: string }> {
    try {
      const r = await this.client.request<FreelaConsultor>('POST', '/v1/admins/consultants', this.corpo(c));
      return { id: r.data.id, code: r.data.code };
    } catch (e) {
      if (!(e instanceof FreelaHttpError) || e.freelaStatus !== 409) throw e;
      // 409 = e-mail já usado lá. Consultor NOSSO (mesmo e-mail + a nota do
      // Praça) = o Freela criou e a resposta se perdeu (timeout): adota.
      const lista = await this.client.request<FreelaConsultor[]>('GET', '/v1/admins/consultants');
      const nosso = (lista.data ?? []).find((x) => x.email?.toLowerCase() === c.email && x.notes === FREELA_NOTES);
      if (nosso) return { id: nosso.id, code: nosso.code };
      throw new EmailDuplicado();
    }
  }

  /** O DTO do Freela valida `uf` como UF de verdade e `phone` com até 20 caracteres: só manda o que é válido. */
  private corpo(c: LinhaSync) {
    const phone = toE164BR(c.phone);
    return {
      name: c.name,
      email: c.email,
      notes: FREELA_NOTES,
      ...(phone ? { phone } : {}),
      ...(c.praca.cobertura_cidade ? { city: c.praca.cobertura_cidade } : {}),
      ...(c.praca.cobertura_uf ? { uf: c.praca.cobertura_uf } : {}),
    };
  }

  private mensagem(e: unknown): string {
    if (e instanceof EmailDuplicado) return EMAIL_DUPLICADO_NO_FREELA;
    if (e instanceof HttpException) {
      const r = e.getResponse() as { message?: unknown };
      if (typeof r?.message === 'string' && r.message) return r.message;
    }
    return 'Erro inesperado ao falar com o Freela.';
  }
}
```

- [ ] **Step 6: DTOs, serviço e controller da equipe**

Crie `api/src/modules/campo/dto/consultores.dto.ts`:

```ts
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { PIX_TIPOS } from '../../../domain/campo-rules';

const TIPOS_PIX = [...PIX_TIPOS] as string[];

export class CreateConsultorDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @Length(8, 30)
  phone!: string;

  @IsString()
  @Length(11, 14)
  cpf!: string;

  @IsUUID()
  praca_id!: string;

  @IsIn(TIPOS_PIX)
  pix_key_type!: string;

  @IsString()
  @Length(1, 140)
  pix_key!: string;
}

/** Tudo opcional e SEM inicializador: `active` ausente = mantém (CLAUDE.md). */
export class UpdateConsultorDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(8, 30)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(11, 14)
  cpf?: string;

  @IsOptional()
  @IsUUID()
  praca_id?: string;

  @IsOptional()
  @IsIn(TIPOS_PIX)
  pix_key_type?: string;

  @IsOptional()
  @IsString()
  @Length(1, 140)
  pix_key?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
```

Crie `api/src/modules/campo/consultores.service.ts`:

```ts
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { digits } from '../../common/phone/phone';
import { todaySp } from '../../common/time/dates';
import {
  cpfValido,
  gerarSenhaProvisoria,
  normalizarPix,
  pixValido,
  situacaoHoje,
  type SituacaoHoje,
} from '../../domain/campo-rules';
import { CampoFreelaService } from './campo-freela.service';
import { signupUrl } from './campo-links';
import { CreateConsultorDto, UpdateConsultorDto } from './dto/consultores.dto';
import { PHOTO_STORAGE, type PhotoStorage } from './photo-storage';
import { violouUnico } from './prisma-errors';

export interface ConsultorView {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  praca_id: string;
  praca_name: string;
  pix_key_type: string;
  pix_key: string;
  active: boolean;
  must_change_password: boolean;
  freela_consultant_id: string | null;
  freela_code: string | null;
  freela_sync_error: string | null;
  freela_synced_at: string | null;
  signup_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConsultorListItem extends ConsultorView {
  today: { status: SituacaoHoje; visits: number; cadastros: number; last_point_at: string | null };
}

export const COM_PRACA = { praca: { select: { name: true } } } as const;

export type ConsultorRow = Prisma.field_consultantsGetPayload<{ include: { praca: { select: { name: true } } } }>;

/** Projeção da equipe — nunca `password_hash` nem `token_version`. */
export function toConsultorView(c: ConsultorRow): ConsultorView {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    cpf: c.cpf,
    praca_id: c.praca_id,
    praca_name: c.praca.name,
    pix_key_type: c.pix_key_type,
    pix_key: c.pix_key,
    active: c.active,
    must_change_password: c.must_change_password,
    freela_consultant_id: c.freela_consultant_id,
    freela_code: c.freela_code,
    freela_sync_error: c.freela_sync_error,
    freela_synced_at: c.freela_synced_at?.toISOString() ?? null,
    signup_url: signupUrl(c.freela_code),
    created_by: c.created_by,
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  };
}

const naoAchado = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Consultor não encontrado.' });

@Injectable()
export class ConsultoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freela: CampoFreelaService,
    @Inject(PHOTO_STORAGE) private readonly fotos: PhotoStorage,
  ) {}

  async list(agora = new Date()): Promise<ConsultorListItem[]> {
    const hoje = todaySp(agora);
    const [consultores, jornadas, visitas] = await Promise.all([
      this.prisma.field_consultants.findMany({ include: COM_PRACA, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      this.prisma.field_journeys.findMany({
        where: { day: hoje },
        select: { id: true, consultant_id: true, ended_at: true },
      }),
      this.prisma.field_visits.findMany({
        where: { journey: { day: hoje } },
        select: { consultant_id: true, freela_status: true },
      }),
    ]);
    const ultimos = jornadas.length
      ? await this.prisma.field_points.groupBy({
          by: ['journey_id'],
          where: { journey_id: { in: jornadas.map((j) => j.id) } },
          _max: { at: true },
        })
      : [];
    const ultimoPorJornada = new Map(ultimos.map((u) => [u.journey_id, u._max.at]));

    return consultores.map((c) => {
      const js = jornadas.filter((j) => j.consultant_id === c.id);
      const vs = visitas.filter((v) => v.consultant_id === c.id);
      const pontos = js.map((j) => ultimoPorJornada.get(j.id)).filter((d): d is Date => d instanceof Date);
      const ultimo = pontos.length ? new Date(Math.max(...pontos.map((d) => d.getTime()))) : null;
      return {
        ...toConsultorView(c),
        today: {
          status: situacaoHoje(js),
          visits: vs.length,
          cadastros: vs.filter((v) => v.freela_status === 'cadastrou_qr').length,
          last_point_at: ultimo?.toISOString() ?? null,
        },
      };
    });
  }

  async get(id: string): Promise<ConsultorView> {
    return toConsultorView(await this.findOrFail(id));
  }

  async create(dto: CreateConsultorDto, admin: AuthUser): Promise<{ consultant: ConsultorView; temp_password: string }> {
    const email = dto.email.trim().toLowerCase();
    const cpf = this.cpfOuFalha(dto.cpf);
    const phone = this.telefoneOuFalha(dto.phone);
    this.pixOuFalha(dto.pix_key_type, dto.pix_key);
    await this.pracaOrFail(dto.praca_id);
    await this.emailLivre(email);
    await this.cpfLivre(cpf);

    const temp = gerarSenhaProvisoria();
    let criado: { id: string };
    try {
      criado = await this.prisma.field_consultants.create({
        data: {
          name: dto.name.trim(),
          email,
          phone,
          cpf,
          praca_id: dto.praca_id,
          pix_key_type: dto.pix_key_type,
          pix_key: normalizarPix(dto.pix_key_type, dto.pix_key),
          password_hash: await bcrypt.hash(temp, 10),
          created_by: admin.id,
        },
      });
    } catch (e) {
      if (violouUnico(e)) {
        throw new ConflictException({ code: 'CONFLICT', message: 'E-mail ou CPF já cadastrado em outro consultor.' });
      }
      throw e;
    }
    await this.freela.sync(criado.id);
    return { consultant: await this.get(criado.id), temp_password: temp };
  }

  async update(id: string, dto: UpdateConsultorDto): Promise<ConsultorView> {
    const atual = await this.findOrFail(id);
    const data: Prisma.field_consultantsUncheckedUpdateInput = {};
    let sincronizar = false;

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = this.telefoneOuFalha(dto.phone);
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== atual.email) {
        await this.emailLivre(email);
        data.email = email;
        // Sem código ainda (talvez pelo e-mail duplicado no Freela): tenta de novo com o e-mail novo.
        if (!atual.freela_consultant_id) {
          data.freela_sync_error = null;
          sincronizar = true;
        }
      }
    }
    if (dto.cpf !== undefined) {
      const cpf = this.cpfOuFalha(dto.cpf);
      if (cpf !== atual.cpf) {
        await this.cpfLivre(cpf);
        data.cpf = cpf;
      }
    }
    if (dto.praca_id !== undefined) {
      await this.pracaOrFail(dto.praca_id);
      data.praca_id = dto.praca_id;
    }
    if (dto.pix_key !== undefined || dto.pix_key_type !== undefined) {
      const tipo = dto.pix_key_type ?? atual.pix_key_type;
      const chave = dto.pix_key ?? atual.pix_key;
      this.pixOuFalha(tipo, chave);
      data.pix_key_type = tipo;
      data.pix_key = normalizarPix(tipo, chave);
    }
    if (dto.active !== undefined && dto.active !== atual.active) {
      data.active = dto.active;
      // Desativar derruba a sessão aberta na hora (o guard compara `tv`).
      if (!dto.active) data.token_version = { increment: 1 };
      sincronizar = true;
    }

    await this.prisma.field_consultants.update({ where: { id }, data });
    if (sincronizar) await this.freela.sync(id);
    return this.get(id);
  }

  async resetPassword(id: string): Promise<{ temp_password: string }> {
    await this.findOrFail(id);
    const temp = gerarSenhaProvisoria();
    await this.prisma.field_consultants.update({
      where: { id },
      data: {
        password_hash: await bcrypt.hash(temp, 10),
        must_change_password: true,
        token_version: { increment: 1 },
      },
    });
    return { temp_password: temp };
  }

  async freelaSync(id: string): Promise<ConsultorView> {
    await this.findOrFail(id);
    await this.freela.sync(id);
    return this.get(id);
  }

  /** Apaga de vez (limpeza de teste): cascata leva jornadas, pontos e visitas; as fotos saem à mão. */
  async remove(id: string): Promise<{ ok: true }> {
    const c = await this.findOrFail(id);
    const fotos = await this.prisma.field_visits.findMany({ where: { consultant_id: id }, select: { photo_key: true } });
    await this.freela.desativarAntesDeApagar(c);
    await this.prisma.field_consultants.delete({ where: { id } });
    for (const f of fotos) await this.fotos.remove(f.photo_key).catch(() => undefined);
    return { ok: true };
  }

  async findOrFail(id: string): Promise<ConsultorRow> {
    if (!isUuid(id)) throw naoAchado();
    const c = await this.prisma.field_consultants.findUnique({ where: { id }, include: COM_PRACA });
    if (!c) throw naoAchado();
    return c;
  }

  // ── internos ────────────────────────────────────────────────
  private cpfOuFalha(valor: string): string {
    if (!cpfValido(valor)) throw new BadRequestException({ code: 'INVALID_CPF', message: 'CPF inválido.' });
    return digits(valor);
  }

  private telefoneOuFalha(valor: string): string {
    const d = digits(valor);
    if (d.length < 10 || d.length > 13) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'phone: informe DDD + número.' });
    }
    return d;
  }

  private pixOuFalha(tipo: string, chave: string): void {
    if (!pixValido(tipo, chave)) {
      throw new BadRequestException({ code: 'INVALID_PIX', message: 'A chave Pix não confere com o tipo escolhido.' });
    }
  }

  private async emailLivre(email: string): Promise<void> {
    if (await this.prisma.field_consultants.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'Já existe um consultor com este e-mail.' });
    }
  }

  private async cpfLivre(cpf: string): Promise<void> {
    if (await this.prisma.field_consultants.findUnique({ where: { cpf }, select: { id: true } })) {
      throw new ConflictException({ code: 'CPF_IN_USE', message: 'Já existe um consultor com este CPF.' });
    }
  }

  private async pracaOrFail(id: string): Promise<void> {
    const naoAchada = new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
    if (!isUuid(id)) throw naoAchada;
    if (!(await this.prisma.pracas.findUnique({ where: { id }, select: { id: true } }))) throw naoAchada;
  }
}
```

Crie `api/src/modules/campo/consultores.controller.ts`:

```ts
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConsultoresService } from './consultores.service';
import { CreateConsultorDto, UpdateConsultorDto } from './dto/consultores.dto';

/**
 * Telas da equipe sobre os consultores de campo (`/v1/consultores`, §20.4).
 * Leitura: qualquer pessoa da equipe. Escrita: só admin — a mesma regra do
 * cadastro de pessoas. Rotas estáticas ANTES das de `:id` (CLAUDE.md).
 */
@ApiTags('Consultores de campo')
@ApiBearerAuth()
@Controller('v1/consultores')
export class ConsultoresController {
  constructor(private readonly consultores: ConsultoresService) {}

  @Get()
  list() {
    return this.consultores.list();
  }

  @AdminOnly()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConsultorDto) {
    return this.consultores.create(dto, user);
  }

  // ── rotas com :id (as estáticas da Task 7 entram ACIMA desta linha) ──
  @Get(':id')
  get(@Param('id') id: string) {
    return this.consultores.get(id);
  }

  @AdminOnly()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConsultorDto) {
    return this.consultores.update(id, dto);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.consultores.resetPassword(id);
  }

  @AdminOnly()
  @HttpCode(200)
  @Post(':id/freela-sync')
  freelaSync(@Param('id') id: string) {
    return this.consultores.freelaSync(id);
  }

  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.consultores.remove(id);
  }
}
```

Substitua `api/src/modules/campo/campo.module.ts` por:

```ts
import { Module } from '@nestjs/common';
import { validateEnv } from '../../common/config/env.validation';
import { FreelaClientModule } from '../freela/freela-client.module';
import { CampoAuthController } from './campo-auth.controller';
import { CampoAuthService } from './campo-auth.service';
import { CampoFreelaService } from './campo-freela.service';
import { CampoController } from './campo.controller';
import { ConsultoresController } from './consultores.controller';
import { ConsultoresService } from './consultores.service';
import { criarPhotoStorage, PHOTO_STORAGE } from './photo-storage';

/**
 * Consultores de campo — spec 2026-10-08, contrato §20.
 *
 * Só depende do `FreelaClientModule` (folha). O `FreelaModule` importa ESTE
 * módulo para o relógio de 2 min repetir o código pendente — sem ciclo.
 */
@Module({
  imports: [FreelaClientModule],
  controllers: [CampoAuthController, CampoController, ConsultoresController],
  providers: [
    CampoAuthService,
    CampoFreelaService,
    ConsultoresService,
    // O `.env` já está em `process.env` (ConfigModule.forRoot) e foi validado na
    // largada; reler pelo mesmo schema dá o PHOTO_STORAGE já resolvido.
    { provide: PHOTO_STORAGE, useFactory: () => criarPhotoStorage(validateEnv(process.env)) },
  ],
  exports: [CampoFreelaService],
})
export class CampoModule {}
```

- [ ] **Step 7: O relógio do Freela repete o código pendente**

Em `api/src/modules/freela/freela.module.ts`, importe `CampoModule` de `../campo/campo.module` e troque `imports: [FreelaClientModule, DisparosModule, MessagesModule],` por:

```ts
  imports: [FreelaClientModule, DisparosModule, MessagesModule, CampoModule],
```

Em `api/src/modules/freela/freela-sync.scheduler.ts`, acrescente o import

```ts
import { CampoFreelaService } from '../campo/campo-freela.service';
```

acrescente `private readonly campoFreela: CampoFreelaService,` como quarto parâmetro do construtor, e substitua o método `tick()` inteiro por:

```ts
  @Cron('*/2 * * * *')
  async tick(): Promise<void> {
    if (!this.client.syncEnabled()) return;
    if (!this.client.isConfigured()) return;
    if (this.rodando) return;
    this.rodando = true;
    try {
      try {
        const entregue = await this.outbox.flush(new Date());
        if (entregue.campaigns > 0 || entregue.failed > 0 || entregue.start_pending > 0) {
          this.log.log(
            `outbox: ${entregue.campaigns} campanha(s), ${entregue.sends} envio(s), ${entregue.failed} sem telefone, ${entregue.start_pending} esperando começar`,
          );
        }
        await this.campaigns.syncAll();
      } catch (e) {
        this.log.error(`rodada do Freela falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Consultores de campo (spec §7): código pendente e ativar/desativar que
      // falhou. `try` próprio: o outbox caído não pode segurar o código do
      // consultor, e vice-versa.
      try {
        const n = await this.campoFreela.retryPending();
        if (n > 0) this.log.log(`campo: ${n} consultor(es) com o código do Freela pendente — tentado de novo`);
      } catch (e) {
        this.log.error(`código do Freela dos consultores falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      this.rodando = false;
    }
  }
```

- [ ] **Step 8: Praça com consultores não é apagada**

Em `api/src/modules/pracas/pracas.service.ts`, acrescente `ConflictException` ao import de `@nestjs/common` e, em `remove(id)`, logo depois de `await this.findOrFail(id);`:

```ts
    // `field_consultants.praca_id` é FK Restrict: sem esta guarda o Prisma
    // estouraria P2003 e a tela veria 500.
    const consultores = await this.prisma.field_consultants.count({ where: { praca_id: id } });
    if (consultores > 0) {
      throw new ConflictException({
        code: 'PRACA_HAS_CONSULTANTS',
        message: 'Esta praça tem consultores de campo. Mude-os de praça ou apague-os antes.',
      });
    }
```

- [ ] **Step 9: Rodar os testes da tarefa e ver passar (um arquivo por vez)**

Run: `cd api && npx jest src/modules/campo/__tests__/campo-freela.service.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/modules/campo/__tests__/consultores.service.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/modules/freela/__tests__/freela-sync.scheduler.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/modules/pracas/__tests__/pracas-remove.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/modules/freela`
Expected: PASS (as suítes antigas do Freela continuam verdes).

- [ ] **Step 10: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add api/src/modules/campo api/src/modules/freela api/src/modules/pracas
git commit -m "feat(campo): cadastro de consultores pela equipe e código no Freela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Jornada, pontos de trajeto, "hoje" e o fechamento da meia-noite

**Files:**
- Create: `api/src/modules/campo/campo-views.ts`
- Create: `api/src/modules/campo/journeys.service.ts`
- Create: `api/src/modules/campo/campo-autoclose.scheduler.ts`
- Modify: `api/src/modules/campo/dto/campo.dto.ts`
- Modify: `api/src/modules/campo/campo.controller.ts`
- Modify: `api/src/modules/campo/campo.module.ts`
- Test: `api/src/modules/campo/__tests__/journeys.service.spec.ts`, `api/src/modules/campo/__tests__/campo-autoclose.scheduler.spec.ts`

**Interfaces:**
- Consumes: `carimbo`, `PASSADO_MAXIMO_MS`, `faltando`, `RespostasVisita` (Task 1); `CampoConsultant`, `CurrentConsultant`, `CampoRoute` (Task 2); `violouUnico` (Task 4).
- Produces:
  - `campo-views.ts`: `JourneyView`, `PointView`, `VisitView`, `VisitRow`, `journeyView(row)`, `pointView(row)`, `visitView(row, hoje)`, `respostasDe(row): RespostasVisita`, `COM_LEAD`.
  - `JourneysService.today(c, agora?)`, `.start(c, dto, agora?)`, `.addPoints(c, dto, agora?)`, `.end(c, dto, agora?)`, `.closeStale(agora?, consultantId?)`, `.abertaOuFalha(consultantId)`; `TodayView`.
  - DTOs `PosicaoDto`, `StartJourneyDto`, `PontoDto`, `PontosDto`.
  - `CampoAutocloseScheduler.tick()` (`@Cron('5 0 * * *', { timeZone: 'America/Sao_Paulo' })`).

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `api/src/modules/campo/__tests__/journeys.service.spec.ts`:

```ts
import { Prisma } from '@prisma/client';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { JourneysService } from '../journeys.service';

const CONS = '44444444-4444-4444-8444-444444444444';
const OUTRO = '66666666-6666-4666-8666-666666666666';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const C: CampoConsultant = { id: CONS, name: 'Ana', email: 'ana@exemplo.com', praca_id: PRACA, must_change_password: false };
const CLIENT = '77777777-7777-4777-8777-777777777777';
const CLIENT2 = '88888888-8888-4888-8888-888888888888';
const AGORA = new Date('2026-10-08T15:00:00.000Z'); // 12:00 em Brasília

const JORNADA = {
  id: 'j1',
  consultant_id: CONS,
  client_id: CLIENT,
  day: '2026-10-08',
  started_at: new Date('2026-10-08T12:00:00.000Z'),
  start_lat: -19.9245,
  start_lng: -43.9352,
  start_accuracy: 10,
  ended_at: null as Date | null,
  end_lat: null as number | null,
  end_lng: null as number | null,
  end_accuracy: null as number | null,
  auto_closed: false,
};

const POS = { at: '2026-10-08T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };

function fakePrisma() {
  const p = {
    $transaction: jest.fn(),
    field_journeys: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(JORNADA),
      create: jest.fn().mockResolvedValue(JORNADA),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_points: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    field_visits: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  p.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p),
  );
  return p;
}

const montar = (p: ReturnType<typeof fakePrisma>) => new JourneysService(p as unknown as PrismaService);
const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

describe('JourneysService.start', () => {
  it('abre a jornada com o dia de Brasília da hora do aparelho e grava o ponto de início', async () => {
    const p = fakePrisma();
    const j = await montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA);

    expect(dataDo(p.field_journeys.create)).toMatchObject({
      consultant_id: CONS,
      client_id: CLIENT,
      day: '2026-10-08',
      started_at: new Date(POS.at),
    });
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'start', clock_adjusted: false, lat: POS.lat });
    expect(j).toMatchObject({ id: 'j1', client_id: CLIENT, ended_at: null });
  });

  it('reenvio com o mesmo client_id devolve a mesma jornada, sem criar nada', async () => {
    const p = fakePrisma();
    p.field_journeys.findUnique.mockResolvedValue(JORNADA);

    const j = await montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA);

    expect(j.id).toBe('j1');
    expect(p.field_journeys.create).not.toHaveBeenCalled();
  });

  it('outro client_id com jornada aberta = 409 JOURNEY_ALREADY_OPEN', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue({ id: 'j1' });
    await expect(montar(p).start(C, { client_id: CLIENT2, ...POS }, AGORA)).rejects.toMatchObject({
      status: 409,
      response: { code: 'JOURNEY_ALREADY_OPEN' },
    });
  });

  it('client_id de outro consultor = 409 CLIENT_ID_IN_USE', async () => {
    const p = fakePrisma();
    p.field_journeys.findUnique.mockResolvedValue({ ...JORNADA, consultant_id: OUTRO });
    await expect(montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA)).rejects.toMatchObject({
      response: { code: 'CLIENT_ID_IN_USE' },
    });
  });

  it('corrida de dois envios (índice único) devolve a jornada que ganhou', async () => {
    const p = fakePrisma();
    p.field_journeys.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(JORNADA);
    p.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5.22.0' }),
    );

    expect((await montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA)).id).toBe('j1');
  });

  it('fecha a jornada esquecida de ontem ANTES de abrir a de hoje', async () => {
    const p = fakePrisma();
    await montar(p).start(C, { client_id: CLIENT, ...POS }, AGORA);
    expect((p.field_journeys.findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({
      ended_at: null,
      day: { lt: '2026-10-08' },
      consultant_id: CONS,
    });
  });
});

describe('JourneysService.addPoints', () => {
  it('sem jornada aberta = 409 NO_OPEN_JOURNEY', async () => {
    await expect(
      montar(fakePrisma()).addPoints(C, { points: [{ client_id: CLIENT, ...POS }] }, AGORA),
    ).rejects.toMatchObject({ response: { code: 'NO_OPEN_JOURNEY' } });
  });

  it('idempotente por client_id (no banco e dentro do lote); hora do futuro vira ajustada', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue(JORNADA);
    p.field_points.findMany.mockResolvedValue([{ client_id: CLIENT }]);
    const futuro = { ...POS, at: '2026-10-08T16:00:00.000Z' };

    const r = await montar(p).addPoints(
      C,
      { points: [{ client_id: CLIENT, ...POS }, { client_id: CLIENT2, ...futuro }, { client_id: CLIENT2, ...futuro }] },
      AGORA,
    );

    expect(r).toEqual({ accepted: 1, duplicates: 2 });
    const linhas = (p.field_points.createMany.mock.calls[0]![0] as { data: Record<string, unknown>[] }).data;
    expect(linhas).toEqual([
      expect.objectContaining({ client_id: CLIENT2, kind: 'track', at: AGORA, clock_adjusted: true, journey_id: 'j1' }),
    ]);
  });
});

describe('JourneysService.end', () => {
  it('com visita aberta = 409 VISIT_OPEN', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue(JORNADA);
    p.field_visits.count.mockResolvedValue(1);
    await expect(montar(p).end(C, POS, AGORA)).rejects.toMatchObject({ response: { code: 'VISIT_OPEN' } });
  });

  it('encerra uma vez só (update condicional) e grava o ponto de fim', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue(JORNADA);

    await montar(p).end(C, POS, AGORA);

    expect(p.field_journeys.updateMany).toHaveBeenCalledWith({
      where: { id: 'j1', ended_at: null },
      data: { ended_at: new Date(POS.at), end_lat: POS.lat, end_lng: POS.lng, end_accuracy: POS.accuracy },
    });
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'end' });
  });

  it('reenvio depois de encerrada (resposta perdida) devolve 200 com a jornada, sem gravar de novo', async () => {
    const p = fakePrisma();
    const encerrada = { ...JORNADA, ended_at: new Date('2026-10-08T14:55:00.000Z') };
    p.field_journeys.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(encerrada);

    const j = await montar(p).end(C, POS, AGORA);

    expect(j.ended_at).toBe('2026-10-08T14:55:00.000Z');
    expect(p.field_journeys.updateMany).not.toHaveBeenCalled();
  });

  it('sem jornada aberta nem encerrada há pouco = 409 NO_OPEN_JOURNEY', async () => {
    await expect(montar(fakePrisma()).end(C, POS, AGORA)).rejects.toMatchObject({
      response: { code: 'NO_OPEN_JOURNEY' },
    });
  });
});

describe('JourneysService.closeStale — fechamento da meia-noite', () => {
  it('às 22h30 de Brasília (01h30 UTC do dia seguinte) a jornada de HOJE não é vencida', async () => {
    const p = fakePrisma();
    await montar(p).closeStale(new Date('2026-10-09T01:30:00.000Z'));
    expect((p.field_journeys.findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({
      ended_at: null,
      day: { lt: '2026-10-08' },
    });
  });

  it('fecha na hora do último ponto; visitas sem checkout ficam "sem checkout"; não filtra consultor inativo', async () => {
    const p = fakePrisma();
    p.field_journeys.findMany.mockResolvedValue([
      { id: 'j1', started_at: new Date('2026-10-07T12:00:00.000Z'), points: [{ at: new Date('2026-10-07T21:10:00.000Z') }] },
      { id: 'j2', started_at: new Date('2026-10-07T13:00:00.000Z'), points: [] },
    ]);
    p.field_visits.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const r = await montar(p).closeStale(new Date('2026-10-08T03:05:00.000Z'));

    expect(r).toEqual({ journeys: 2, visits: 1 });
    expect(p.field_visits.updateMany).toHaveBeenCalledWith({
      where: { journey_id: 'j1', checkout_at: null, auto_closed: false },
      data: { auto_closed: true },
    });
    expect(p.field_journeys.updateMany).toHaveBeenCalledWith({
      where: { id: 'j1', ended_at: null },
      data: { ended_at: new Date('2026-10-07T21:10:00.000Z'), auto_closed: true },
    });
    expect(p.field_journeys.updateMany).toHaveBeenCalledWith({
      where: { id: 'j2', ended_at: null },
      data: { ended_at: new Date('2026-10-07T13:00:00.000Z'), auto_closed: true },
    });
  });
});

describe('JourneysService.today', () => {
  it('jornada aberta, visitas do dia, visita aberta e contadores', async () => {
    const p = fakePrisma();
    p.field_journeys.findFirst.mockResolvedValue(JORNADA);
    p.field_journeys.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([JORNADA]);
    const visita = {
      id: 'v1', client_id: CLIENT2, journey_id: 'j1', lead_id: 'l1',
      checkin_at: new Date('2026-10-08T13:00:00.000Z'), checkin_lat: -19.92, checkin_lng: -43.93, checkin_accuracy: 10,
      distance_m: null, far_from_place: false, photo_bytes: 1000,
      checkout_at: null, checkout_lat: null, checkout_lng: null, auto_closed: false, clock_adjusted: false,
      interlocutor_name: null, interlocutor_role: null, freela_status: 'cadastrou_qr', interest: null,
      open_vagas: null, vaga_roles: [], freelas_per_week: null, channels: [], channel_other: null,
      needs_followup: null, followup_what: null, followup_date: null, notes: null,
      lead: { name: 'Bar do Mercado', possible_dup: false },
    };
    p.field_visits.findMany.mockResolvedValue([visita]);

    const t = await montar(p).today(C, AGORA);

    expect(t.day).toBe('2026-10-08');
    expect(t.journey?.id).toBe('j1');
    expect(t.journeys).toHaveLength(1);
    expect(t.open_visit?.client_id).toBe(CLIENT2);
    expect(t.open_visit?.missing).toContain('interesse');
    expect(t.counters).toEqual({ visits: 1, cadastrou_qr: 1 });
  });
});
```

Crie `api/src/modules/campo/__tests__/campo-autoclose.scheduler.spec.ts`:

```ts
import { CampoAutocloseScheduler } from '../campo-autoclose.scheduler';
import type { JourneysService } from '../journeys.service';

describe('CampoAutocloseScheduler', () => {
  it('fecha o que venceu e nunca deixa o erro sair do @Cron', async () => {
    const closeStale = jest.fn().mockRejectedValueOnce(new Error('banco fora')).mockResolvedValueOnce({ journeys: 1, visits: 0 });
    const s = new CampoAutocloseScheduler({ closeStale } as unknown as JourneysService);

    await expect(s.tick()).resolves.toBeUndefined();
    await expect(s.tick()).resolves.toBeUndefined();
    expect(closeStale).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx jest src/modules/campo/__tests__/journeys.service.spec.ts`
Expected: FAIL — `Cannot find module '../journeys.service'`.

Run: `cd api && npx jest src/modules/campo/__tests__/campo-autoclose.scheduler.spec.ts`
Expected: FAIL — `Cannot find module '../campo-autoclose.scheduler'`.

- [ ] **Step 3: Projeções**

Crie `api/src/modules/campo/campo-views.ts`:

```ts
/** Projeções do wire (contrato §20) — uma só para o consultor e para a equipe. */
import { faltando, type RespostasVisita } from '../../domain/campo-rules';

export interface JourneyView {
  id: string;
  client_id: string;
  day: string;
  started_at: string;
  start_lat: number;
  start_lng: number;
  ended_at: string | null;
  end_lat: number | null;
  end_lng: number | null;
  auto_closed: boolean;
}

export function journeyView(j: {
  id: string;
  client_id: string;
  day: string;
  started_at: Date;
  start_lat: number;
  start_lng: number;
  ended_at: Date | null;
  end_lat: number | null;
  end_lng: number | null;
  auto_closed: boolean;
}): JourneyView {
  return {
    id: j.id,
    client_id: j.client_id,
    day: j.day,
    started_at: j.started_at.toISOString(),
    start_lat: j.start_lat,
    start_lng: j.start_lng,
    ended_at: j.ended_at?.toISOString() ?? null,
    end_lat: j.end_lat,
    end_lng: j.end_lng,
    auto_closed: j.auto_closed,
  };
}

export interface PointView {
  id: string;
  at: string;
  lat: number;
  lng: number;
  accuracy: number;
  kind: string;
  clock_adjusted: boolean;
}

export function pointView(p: {
  id: string;
  at: Date;
  lat: number;
  lng: number;
  accuracy: number;
  kind: string;
  clock_adjusted: boolean;
}): PointView {
  return { id: p.id, at: p.at.toISOString(), lat: p.lat, lng: p.lng, accuracy: p.accuracy, kind: p.kind, clock_adjusted: p.clock_adjusted };
}

/** Include do lead que a visita mostra. */
export const COM_LEAD = { lead: { select: { name: true, possible_dup: true } } } as const;

export interface VisitRow extends RespostasVisita {
  id: string;
  client_id: string;
  journey_id: string;
  lead_id: string;
  checkin_at: Date;
  checkin_lat: number;
  checkin_lng: number;
  checkin_accuracy: number;
  distance_m: number | null;
  far_from_place: boolean;
  photo_bytes: number;
  checkout_at: Date | null;
  checkout_lat: number | null;
  checkout_lng: number | null;
  auto_closed: boolean;
  clock_adjusted: boolean;
  lead: { name: string; possible_dup: boolean };
}

export interface VisitView {
  id: string;
  client_id: string;
  journey_id: string;
  lead_id: string;
  lead_name: string;
  possible_dup: boolean;
  checkin_at: string;
  checkin_lat: number;
  checkin_lng: number;
  checkin_accuracy: number;
  distance_m: number | null;
  far_from_place: boolean;
  photo_bytes: number;
  checkout_at: string | null;
  checkout_lat: number | null;
  checkout_lng: number | null;
  auto_closed: boolean;
  clock_adjusted: boolean;
  answers: RespostasVisita;
  missing: string[];
}

export function respostasDe(v: RespostasVisita): RespostasVisita {
  return {
    interlocutor_name: v.interlocutor_name,
    interlocutor_role: v.interlocutor_role,
    freela_status: v.freela_status,
    interest: v.interest,
    open_vagas: v.open_vagas,
    vaga_roles: v.vaga_roles,
    freelas_per_week: v.freelas_per_week,
    channels: v.channels,
    channel_other: v.channel_other,
    needs_followup: v.needs_followup,
    followup_what: v.followup_what,
    followup_date: v.followup_date,
    notes: v.notes,
  };
}

export function visitView(v: VisitRow, hoje: string): VisitView {
  const answers = respostasDe(v);
  return {
    id: v.id,
    client_id: v.client_id,
    journey_id: v.journey_id,
    lead_id: v.lead_id,
    lead_name: v.lead.name,
    possible_dup: v.lead.possible_dup,
    checkin_at: v.checkin_at.toISOString(),
    checkin_lat: v.checkin_lat,
    checkin_lng: v.checkin_lng,
    checkin_accuracy: v.checkin_accuracy,
    distance_m: v.distance_m,
    far_from_place: v.far_from_place,
    photo_bytes: v.photo_bytes,
    checkout_at: v.checkout_at?.toISOString() ?? null,
    checkout_lat: v.checkout_lat,
    checkout_lng: v.checkout_lng,
    auto_closed: v.auto_closed,
    clock_adjusted: v.clock_adjusted,
    answers,
    // Visita fechada não "falta" nada: a lista é para o botão de checkout.
    missing: v.checkout_at || v.auto_closed ? [] : faltando(answers, hoje),
  };
}
```

- [ ] **Step 4: DTOs da jornada**

Em `api/src/modules/campo/dto/campo.dto.ts`, troque o import do topo por:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
```

e acrescente no fim:

```ts
/**
 * Posição + hora do aparelho. `@Type(() => Number)` porque o check-in chega em
 * multipart (tudo texto) e passa pela mesma classe.
 */
export class PosicaoDto {
  @IsISO8601({ strict: true })
  at!: string;

  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100_000)
  accuracy!: number;
}

export class StartJourneyDto extends PosicaoDto {
  @IsUUID()
  client_id!: string;
}

export class PontoDto extends PosicaoDto {
  @IsUUID()
  client_id!: string;
}

export class PontosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PontoDto)
  points!: PontoDto[];
}
```

- [ ] **Step 5: Serviço da jornada**

Crie `api/src/modules/campo/journeys.service.ts`:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { todaySp } from '../../common/time/dates';
import { carimbo, PASSADO_MAXIMO_MS } from '../../domain/campo-rules';
import { COM_LEAD, journeyView, visitView, type JourneyView, type VisitView } from './campo-views';
import type { PontosDto, PosicaoDto, StartJourneyDto } from './dto/campo.dto';
import { violouUnico } from './prisma-errors';

export interface TodayView {
  day: string;
  journey: JourneyView | null;
  journeys: JourneyView[];
  open_visit: VisitView | null;
  visits: VisitView[];
  counters: { visits: number; cadastrou_qr: number };
}

const jaAberta = () =>
  new ConflictException({
    code: 'JOURNEY_ALREADY_OPEN',
    message: 'Já existe uma jornada aberta — encerre-a antes de iniciar outra.',
  });
const semJornada = () => new ConflictException({ code: 'NO_OPEN_JOURNEY', message: 'Não há jornada aberta.' });

@Injectable()
export class JourneysService {
  constructor(private readonly prisma: PrismaService) {}

  async today(c: CampoConsultant, agora = new Date()): Promise<TodayView> {
    await this.closeStale(agora, c.id);
    const hoje = todaySp(agora);
    const [jornadas, aberta, visitas] = await Promise.all([
      this.prisma.field_journeys.findMany({ where: { consultant_id: c.id, day: hoje }, orderBy: { started_at: 'asc' } }),
      this.prisma.field_journeys.findFirst({ where: { consultant_id: c.id, ended_at: null } }),
      this.prisma.field_visits.findMany({
        where: { consultant_id: c.id, journey: { day: hoje } },
        include: COM_LEAD,
        orderBy: { checkin_at: 'asc' },
      }),
    ]);
    const views = visitas.map((v) => visitView(v, hoje));
    return {
      day: hoje,
      journey: aberta ? journeyView(aberta) : null,
      journeys: jornadas.map(journeyView),
      open_visit: views.find((v) => !v.checkout_at && !v.auto_closed) ?? null,
      visits: views,
      counters: {
        visits: views.length,
        cadastrou_qr: views.filter((v) => v.answers.freela_status === 'cadastrou_qr').length,
      },
    };
  }

  async start(c: CampoConsultant, dto: StartJourneyDto, agora = new Date()): Promise<JourneyView> {
    const mesma = await this.prisma.field_journeys.findUnique({ where: { client_id: dto.client_id } });
    if (mesma) return this.daMesmaPessoa(mesma, c);

    // A de ontem que ficou aberta (API fora à meia-noite) não pode travar o dia.
    await this.closeStale(agora, c.id);
    const aberta = await this.prisma.field_journeys.findFirst({
      where: { consultant_id: c.id, ended_at: null },
      select: { id: true },
    });
    if (aberta) throw jaAberta();

    const { at, ajustado } = carimbo(dto.at, agora, null);
    const id = randomUUID();
    try {
      await this.prisma.$transaction([
        this.prisma.field_journeys.create({
          data: {
            id,
            consultant_id: c.id,
            day: todaySp(at),
            client_id: dto.client_id,
            started_at: at,
            start_lat: dto.lat,
            start_lng: dto.lng,
            start_accuracy: dto.accuracy,
          },
        }),
        this.prisma.field_points.create({
          data: {
            journey_id: id,
            at,
            lat: dto.lat,
            lng: dto.lng,
            accuracy: dto.accuracy,
            kind: 'start',
            client_id: randomUUID(),
            clock_adjusted: ajustado,
          },
        }),
      ]);
    } catch (e) {
      if (!violouUnico(e)) throw e;
      // Corrida (dois toques ou reenvio simultâneo): se foi o mesmo client_id, é a mesma jornada.
      const ganhou = await this.prisma.field_journeys.findUnique({ where: { client_id: dto.client_id } });
      if (ganhou) return this.daMesmaPessoa(ganhou, c);
      throw jaAberta();
    }
    return journeyView(await this.prisma.field_journeys.findUniqueOrThrow({ where: { id } }));
  }

  async addPoints(c: CampoConsultant, dto: PontosDto, agora = new Date()): Promise<{ accepted: number; duplicates: number }> {
    const aberta = await this.abertaOuFalha(c.id);
    const existentes = await this.prisma.field_points.findMany({
      where: { client_id: { in: dto.points.map((p) => p.client_id) } },
      select: { client_id: true },
    });
    const vistos = new Set(existentes.map((p) => p.client_id));
    const novos = dto.points.filter((p) => {
      if (vistos.has(p.client_id)) return false;
      vistos.add(p.client_id);
      return true;
    });
    if (novos.length > 0) {
      await this.prisma.field_points.createMany({
        data: novos.map((p) => {
          const { at, ajustado } = carimbo(p.at, agora, aberta.started_at);
          return {
            journey_id: aberta.id,
            at,
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy,
            kind: 'track',
            client_id: p.client_id,
            clock_adjusted: ajustado,
          };
        }),
        skipDuplicates: true,
      });
    }
    return { accepted: novos.length, duplicates: dto.points.length - novos.length };
  }

  async end(c: CampoConsultant, dto: PosicaoDto, agora = new Date()): Promise<JourneyView> {
    const aberta = await this.prisma.field_journeys.findFirst({ where: { consultant_id: c.id, ended_at: null } });
    if (!aberta) {
      // Reenvio da fila depois de a resposta se perder: devolve o que já foi feito.
      const ultima = await this.prisma.field_journeys.findFirst({
        where: { consultant_id: c.id, ended_at: { not: null } },
        orderBy: { ended_at: 'desc' },
      });
      if (ultima?.ended_at && agora.getTime() - ultima.ended_at.getTime() < PASSADO_MAXIMO_MS) {
        return journeyView(ultima);
      }
      throw semJornada();
    }
    const visitasAbertas = await this.prisma.field_visits.count({
      where: { journey_id: aberta.id, checkout_at: null, auto_closed: false },
    });
    if (visitasAbertas > 0) {
      throw new ConflictException({
        code: 'VISIT_OPEN',
        message: 'Faça o checkout da visita aberta antes de encerrar a jornada.',
      });
    }

    const { at, ajustado } = carimbo(dto.at, agora, aberta.started_at);
    await this.prisma.$transaction(async (tx) => {
      // Condicional: dois "encerrar" simultâneos gravam um ponto de fim só.
      const r = await tx.field_journeys.updateMany({
        where: { id: aberta.id, ended_at: null },
        data: { ended_at: at, end_lat: dto.lat, end_lng: dto.lng, end_accuracy: dto.accuracy },
      });
      if (r.count === 1) {
        await tx.field_points.create({
          data: {
            journey_id: aberta.id,
            at,
            lat: dto.lat,
            lng: dto.lng,
            accuracy: dto.accuracy,
            kind: 'end',
            client_id: randomUUID(),
            clock_adjusted: ajustado,
          },
        });
      }
    });
    return journeyView(await this.prisma.field_journeys.findUniqueOrThrow({ where: { id: aberta.id } }));
  }

  /**
   * Fechamento da meia-noite (§7): jornada de dia ANTERIOR ainda aberta fecha na
   * hora do último ponto, com `auto_closed`; as visitas dela sem checkout ficam
   * "sem checkout" e não tocam o CRM. "Dia anterior" é `day < todaySp(agora)` —
   * Brasília, não UTC (às 22h30 BRT o UTC já virou). Não filtra `active`: o
   * consultor desativado no meio do dia também tem a jornada fechada.
   */
  async closeStale(agora = new Date(), consultantId?: string): Promise<{ journeys: number; visits: number }> {
    const hoje = todaySp(agora);
    const vencidas = await this.prisma.field_journeys.findMany({
      where: { ended_at: null, day: { lt: hoje }, ...(consultantId ? { consultant_id: consultantId } : {}) },
      select: { id: true, started_at: true, points: { orderBy: { at: 'desc' }, take: 1, select: { at: true } } },
    });
    let visitas = 0;
    for (const j of vencidas) {
      const fim = j.points[0]?.at ?? j.started_at;
      const [v] = await this.prisma.$transaction([
        this.prisma.field_visits.updateMany({
          where: { journey_id: j.id, checkout_at: null, auto_closed: false },
          data: { auto_closed: true },
        }),
        this.prisma.field_journeys.updateMany({
          where: { id: j.id, ended_at: null },
          data: { ended_at: fim, auto_closed: true },
        }),
      ]);
      visitas += v.count;
    }
    return { journeys: vencidas.length, visits: visitas };
  }

  async abertaOuFalha(consultantId: string) {
    const aberta = await this.prisma.field_journeys.findFirst({ where: { consultant_id: consultantId, ended_at: null } });
    if (!aberta) throw semJornada();
    return aberta;
  }

  private daMesmaPessoa(j: Parameters<typeof journeyView>[0] & { consultant_id: string }, c: CampoConsultant): JourneyView {
    if (j.consultant_id !== c.id) {
      throw new ConflictException({ code: 'CLIENT_ID_IN_USE', message: 'Identificador de envio já usado.' });
    }
    return journeyView(j);
  }
}
```

- [ ] **Step 6: O relógio da meia-noite**

Crie `api/src/modules/campo/campo-autoclose.scheduler.ts`:

```ts
/**
 * Fechamento da meia-noite (spec §7): 00:05 de Brasília. A API roda em UMA
 * instância (README, "Produção") — com duas, as duas fechariam o mesmo dia
 * (inofensivo aqui: o update é condicional), mas a premissa vale para todo relógio.
 * O erro NUNCA sai do @Cron: exceção não tratada derruba o processo.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JourneysService } from './journeys.service';

@Injectable()
export class CampoAutocloseScheduler {
  private readonly log = new Logger(CampoAutocloseScheduler.name);
  private rodando = false;

  constructor(private readonly journeys: JourneysService) {}

  @Cron('5 0 * * *', { timeZone: 'America/Sao_Paulo' })
  async tick(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      const r = await this.journeys.closeStale(new Date());
      if (r.journeys > 0) {
        this.log.log(`meia-noite: ${r.journeys} jornada(s) e ${r.visits} visita(s) sem checkout fechadas`);
      }
    } catch (e) {
      this.log.error(`fechamento da meia-noite falhou: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.rodando = false;
    }
  }
}
```

- [ ] **Step 7: Rotas e módulo**

Substitua `api/src/modules/campo/campo.controller.ts` por:

```ts
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { AllowPendingPassword, CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { CampoAuthService } from './campo-auth.service';
import { PontosDto, PosicaoDto, StartJourneyDto } from './dto/campo.dto';
import { JourneysService } from './journeys.service';

/** Rotas do dia a dia do consultor (`/v1/campo/*`) — §20 do contrato. */
@ApiTags('Campo')
@ApiBearerAuth()
@CampoRoute()
@Controller('v1/campo')
export class CampoController {
  constructor(
    private readonly auth: CampoAuthService,
    private readonly journeys: JourneysService,
  ) {}

  @AllowPendingPassword()
  @Get('me')
  me(@CurrentConsultant() c: CampoConsultant) {
    return this.auth.me(c.id);
  }

  @Get('today')
  today(@CurrentConsultant() c: CampoConsultant) {
    return this.journeys.today(c);
  }

  // ── jornada ─────────────────────────────────────────────────
  @Post('journeys/start')
  start(@CurrentConsultant() c: CampoConsultant, @Body() dto: StartJourneyDto) {
    return this.journeys.start(c, dto);
  }

  @HttpCode(200)
  @Post('journeys/current/points')
  points(@CurrentConsultant() c: CampoConsultant, @Body() dto: PontosDto) {
    return this.journeys.addPoints(c, dto);
  }

  @HttpCode(200)
  @Post('journeys/current/end')
  end(@CurrentConsultant() c: CampoConsultant, @Body() dto: PosicaoDto) {
    return this.journeys.end(c, dto);
  }
}
```

Em `api/src/modules/campo/campo.module.ts`, importe `JourneysService` de `./journeys.service` e `CampoAutocloseScheduler` de `./campo-autoclose.scheduler`, e acrescente os dois em `providers` (depois de `ConsultoresService,`):

```ts
    JourneysService,
    CampoAutocloseScheduler,
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd api && npx jest src/modules/campo/__tests__/journeys.service.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/modules/campo/__tests__/campo-autoclose.scheduler.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add api/src/modules/campo
git commit -m "feat(campo): jornada com trajeto, tela de hoje e fechamento da meia-noite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Estabelecimentos e visitas — perto/busca/parecidos, check-in com foto, questionário e checkout no CRM

**Files:**
- Create: `api/src/common/validation/flatten-errors.ts`
- Modify: `api/src/main.ts` (usa o `flattenErrors` exportado)
- Create: `api/src/modules/campo/multipart-checkin.ts`
- Create: `api/src/modules/campo/places.service.ts`
- Create: `api/src/modules/campo/visits.service.ts`
- Modify: `api/src/modules/campo/dto/campo.dto.ts`
- Modify: `api/src/modules/campo/campo.controller.ts`
- Modify: `api/src/modules/campo/campo.module.ts`
- Test: `api/src/modules/campo/__tests__/places.service.spec.ts`, `visits.service.spec.ts`, `multipart-checkin.spec.ts`

**Interfaces:**
- Consumes: `caixaEnvolvente`, `distanciaM`, `marcaLonge`, `nomeParecido`, `carimbo`, `faltando`, `resumoVisita`, `estagioDepoisDaVisita`, `ROTULO_CARGO`, `RAIO_PERTO_M`, `RAIO_DUPLICADO_M`, `CARGOS`, `FREELA_STATUS`, `INTERESSES` (Task 1); `norm` (`domain/dedup.ts`); `PHOTO_STORAGE`, `tipoDaImagem`, `chaveDaFoto`, `FotoLida` (Task 3); `violouUnico` (Task 4); `JourneysService.abertaOuFalha`, `COM_LEAD`, `visitView`, `respostasDe`, `PosicaoDto` (Task 5).
- Produces:
  - `flattenErrors(errors, path?)` em `common/validation/flatten-errors.ts`.
  - `lerCheckinMultipart(req): Promise<{ campos: CheckinDto; foto: Buffer }>`.
  - `PlaceView`; `PlacesService.list(c, q)`, `.near(pracaId, ponto, raio?, limite?)`, `.search(pracaId, texto)`, `.similar(c, {name, lat, lng})`.
  - `VisitsService.checkin(c, dto, foto, agora?)`, `.saveAnswers(c, ref, dto, agora?)`, `.checkout(c, ref, dto, agora?)`, `.photo(c, ref): Promise<FotoLida>`.
  - DTOs `NovoLugarDto`, `CheckinDto`, `AnswersDto`, `PlacesQueryDto`, `SimilarQueryDto`.

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `api/src/modules/campo/__tests__/places.service.spec.ts`:

```ts
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import { PlacesService } from '../places.service';

const PRACA = '00000000-0000-4000-8000-0000000000aa';
const C: CampoConsultant = { id: 'c1', name: 'Ana', email: 'a@b.com', praca_id: PRACA, must_change_password: false };
const AQUI = { lat: -19.9245, lng: -43.9352 };

const lead = (id: string, name: string, lat: number | null, lng: number | null) => ({
  id,
  name,
  address: 'Rua X',
  stage: 1,
  lat,
  lng,
});

function montar(linhas: ReturnType<typeof lead>[]) {
  const p = { leads: { findMany: jest.fn().mockResolvedValue(linhas) } };
  return { p, s: new PlacesService(p as unknown as PrismaService) };
}

describe('PlacesService', () => {
  it('perto de mim: só a praça, só com localização no raio de 500 m, do mais perto ao mais longe', async () => {
    const { p, s } = montar([
      lead('l3', 'Longe', -19.9199, -43.9352), // ~512 m — fora
      lead('l2', 'Médio', -19.9225, -43.9352), // ~222 m
      lead('l1', 'Perto', -19.9240, -43.9352), // ~56 m
    ]);

    const r = await s.list(C, AQUI);

    expect(r.map((x) => [x.id, x.distance_m])).toEqual([
      ['l1', 56],
      ['l2', 222],
    ]);
    const where = (p.leads.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ praca_id: PRACA, archived: false });
    expect(where).toHaveProperty('lat.gte');
  });

  it('busca por nome ignora acento e caixa e devolve até 20', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => lead(`x${i}`, `Café ${i}`, null, null));
    const { s } = montar([lead('b1', 'Bar do Mercado', null, null), ...muitos]);

    expect((await s.list(C, { q: 'mercado' })).map((x) => x.id)).toEqual(['b1']);
    expect(await s.list(C, { q: 'CAFE' })).toHaveLength(20);
  });

  it('sem q e sem lat+lng = 400', async () => {
    const { s } = montar([]);
    await expect(s.list(C, {})).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('parecidos: nome parecido a até 100 m', async () => {
    const { s } = montar([
      lead('a', 'Bar do Zé Moema', -19.9241, -43.9352), // ~44 m, parecido
      lead('b', 'Pizzaria Napoli', -19.9244, -43.9352), // ~11 m, outro nome
      lead('c', 'Bar do Zé', -19.9230, -43.9352), // ~167 m, longe demais
    ]);
    expect((await s.similar(C, { name: 'Bar do Zé', ...AQUI })).map((x) => [x.id, x.distance_m])).toEqual([['a', 44]]);
  });
});
```

Crie `api/src/modules/campo/__tests__/multipart-checkin.spec.ts`:

```ts
import type { FastifyRequest } from 'fastify';
import { lerCheckinMultipart } from '../multipart-checkin';

const CLIENT = '77777777-7777-4777-8777-777777777777';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const campo = (fieldname: string, value: string) => ({ type: 'field', fieldname, value });
const arquivo = (bytes: Buffer | Error, fieldname = 'photo') => ({
  type: 'file',
  fieldname,
  toBuffer: async () => {
    if (bytes instanceof Error) throw bytes;
    return bytes;
  },
});

function req(partes: Record<string, unknown>[], multipart = true): FastifyRequest {
  return {
    isMultipart: () => multipart,
    parts: async function* () {
      for (const p of partes) yield p;
    },
  } as unknown as FastifyRequest;
}

const BASE = [
  campo('client_id', CLIENT),
  campo('at', '2026-10-08T14:59:00.000Z'),
  campo('lat', '-19.9245'),
  campo('lng', '-43.9352'),
  campo('accuracy', '12'),
];

describe('lerCheckinMultipart', () => {
  it('campos de texto viram números/booleano/objeto e a foto vem inteira', async () => {
    const r = await lerCheckinMultipart(
      req([...BASE, campo('new_place', '{"name":"Bar Novo","address":"Rua A, 1"}'), campo('confirm_new', 'true'), arquivo(JPEG)]),
    );
    expect(r.foto).toEqual(JPEG);
    expect(r.campos).toMatchObject({ client_id: CLIENT, lat: -19.9245, lng: -43.9352, accuracy: 12, confirm_new: true });
    expect(r.campos.new_place).toMatchObject({ name: 'Bar Novo', address: 'Rua A, 1' });
  });

  it('sem foto = 400 FILE_REQUIRED', async () => {
    await expect(lerCheckinMultipart(req(BASE))).rejects.toMatchObject({ response: { code: 'FILE_REQUIRED' } });
  });

  it('foto acima de 5 MB = 413 FILE_TOO_LARGE', async () => {
    const grande = Object.assign(new Error('request file too large'), { code: 'FST_REQ_FILE_TOO_LARGE' });
    await expect(lerCheckinMultipart(req([...BASE, arquivo(grande)]))).rejects.toMatchObject({
      status: 413,
      response: { code: 'FILE_TOO_LARGE' },
    });
  });

  it('campo fora do DTO = 400 VALIDATION_ERROR (mesma regra do whitelist global)', async () => {
    await expect(lerCheckinMultipart(req([...BASE, campo('praca_id', 'x'), arquivo(JPEG)]))).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('new_place que não é JSON = 400', async () => {
    await expect(lerCheckinMultipart(req([...BASE, campo('new_place', '{quebrado'), arquivo(JPEG)]))).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR', message: 'new_place: JSON inválido.' },
    });
  });

  it('corpo que não é multipart = 400', async () => {
    await expect(lerCheckinMultipart(req([], false))).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});
```

Crie `api/src/modules/campo/__tests__/visits.service.spec.ts`:

```ts
import { Prisma } from '@prisma/client';
import type { CampoConsultant } from '../../../common/auth/campo-consultant';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { CheckinDto } from '../dto/campo.dto';
import type { JourneysService } from '../journeys.service';
import type { PhotoStorage } from '../photo-storage';
import type { PlacesService } from '../places.service';
import { VisitsService } from '../visits.service';

const CONS = '44444444-4444-4444-8444-444444444444';
const OUTRO = '66666666-6666-4666-8666-666666666666';
const PRACA = '00000000-0000-4000-8000-0000000000aa';
const LEAD = '99999999-9999-4999-8999-999999999999';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const C: CampoConsultant = { id: CONS, name: 'Ana Souza', email: 'ana@exemplo.com', praca_id: PRACA, must_change_password: false };
const AGORA = new Date('2026-10-08T15:00:00.000Z');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic')]);

const JORNADA = { id: 'j1', day: '2026-10-08', started_at: new Date('2026-10-08T12:00:00.000Z') };

const RESPOSTAS = {
  interlocutor_name: 'João',
  interlocutor_role: 'dono',
  freela_status: 'cadastrou_qr',
  interest: 'alto',
  open_vagas: 1,
  vaga_roles: ['Garçom'],
  freelas_per_week: 3,
  channels: ['Grupos de WhatsApp'],
  channel_other: null,
  needs_followup: true,
  followup_what: 'Ligar sexta',
  followup_date: '2026-10-10',
  notes: null,
};

const VISITA = {
  id: 'v1',
  client_id: CLIENT,
  journey_id: 'j1',
  consultant_id: CONS,
  lead_id: LEAD,
  checkin_at: new Date('2026-10-08T14:00:00.000Z'),
  checkin_lat: -19.9245,
  checkin_lng: -43.9352,
  checkin_accuracy: 10,
  distance_m: null,
  far_from_place: false,
  photo_key: `campo/${CONS}/2026-10-08/v1.jpg`,
  photo_bytes: 6,
  checkout_at: null as Date | null,
  checkout_lat: null,
  checkout_lng: null,
  auto_closed: false,
  clock_adjusted: false,
  ...RESPOSTAS,
  lead: { name: 'Bar do Mercado', possible_dup: false },
};

const POS = { at: '2026-10-08T14:59:00.000Z', lat: -19.9245, lng: -43.9352, accuracy: 12 };
const checkinDto = (over: Partial<CheckinDto> = {}): CheckinDto => ({ client_id: CLIENT, ...POS, ...over }) as CheckinDto;

function fakePrisma() {
  const p = {
    $transaction: jest.fn(),
    field_visits: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(VISITA),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    field_points: { create: jest.fn().mockResolvedValue({}) },
    leads: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: LEAD, stage: 1 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    lead_events: { create: jest.fn().mockResolvedValue({}) },
    pracas: { findUnique: jest.fn().mockResolvedValue({ cobertura_cidade: 'Belo Horizonte' }) },
  };
  p.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(p),
  );
  return p;
}

function montar(p: ReturnType<typeof fakePrisma>) {
  const journeys = { abertaOuFalha: jest.fn().mockResolvedValue(JORNADA) };
  const places = { similar: jest.fn().mockResolvedValue([]) };
  const fotos = { put: jest.fn().mockResolvedValue(undefined), get: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };
  const s = new VisitsService(
    p as unknown as PrismaService,
    journeys as unknown as JourneysService,
    places as unknown as PlacesService,
    fotos as unknown as PhotoStorage,
  );
  return { s, journeys, places, fotos };
}

const dataDo = (m: jest.Mock, n = 0) => (m.mock.calls[n]![0] as { data: Record<string, unknown> }).data;

describe('VisitsService.checkin', () => {
  it('estabelecimento novo: cria o lead "visita de campo" com a posição, guarda a foto e grava visita + ponto', async () => {
    const p = fakePrisma();
    const { s, fotos } = montar(p);

    await s.checkin(C, checkinDto({ new_place: { name: ' Bar Novo ', address: ' Rua A, 1 ' } }), JPEG, AGORA);

    expect(dataDo(p.leads.create)).toMatchObject({
      praca_id: PRACA,
      name: 'Bar Novo',
      address: 'Rua A, 1',
      city: 'Belo Horizonte',
      origem: 'visita de campo',
      classe: 'alvo',
      stage: 1,
      entered_at: '2026-10-08',
      lat: POS.lat,
      lng: POS.lng,
      possible_dup: false,
    });
    const visita = dataDo(p.field_visits.create);
    expect(visita).toMatchObject({
      client_id: CLIENT,
      journey_id: 'j1',
      consultant_id: CONS,
      lead_id: dataDo(p.leads.create).id,
      photo_bytes: JPEG.length,
      distance_m: null,
      far_from_place: false,
      clock_adjusted: false,
    });
    expect(visita.photo_key).toMatch(new RegExp(`^campo/${CONS}/2026-10-08/[0-9a-f-]{36}\\.jpg$`));
    expect(fotos.put).toHaveBeenCalledWith(visita.photo_key, JPEG, 'image/jpeg');
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'checkin', journey_id: 'j1' });
  });

  it('sem confirmar que é novo (check-in sem sinal) e com parecido a 100 m: cria marcando possible_dup', async () => {
    const p = fakePrisma();
    const { s, places } = montar(p);
    places.similar.mockResolvedValue([{ id: 'x', name: 'Bar do Zé', distance_m: 40 }]);

    await s.checkin(C, checkinDto({ new_place: { name: 'Bar do Zé Moema' } }), JPEG, AGORA);

    expect(dataDo(p.leads.create)).toMatchObject({ possible_dup: true });
  });

  it('"é outro" confirmado: nem procura parecido', async () => {
    const p = fakePrisma();
    const { s, places } = montar(p);
    await s.checkin(C, checkinDto({ new_place: { name: 'Bar do Zé Moema' }, confirm_new: true }), JPEG, AGORA);
    expect(places.similar).not.toHaveBeenCalled();
  });

  it('estabelecimento da praça a mais de 200 m: marca "longe do local" (não bloqueia)', async () => {
    const p = fakePrisma();
    p.leads.findFirst.mockResolvedValue({ id: LEAD, lat: -19.9225, lng: -43.9352 });

    await montar(p).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA);

    expect(p.leads.findFirst).toHaveBeenCalledWith({
      where: { id: LEAD, praca_id: PRACA },
      select: { id: true, lat: true, lng: true },
    });
    expect(dataDo(p.field_visits.create)).toMatchObject({ lead_id: LEAD, distance_m: 222, far_from_place: true });
    expect(p.leads.create).not.toHaveBeenCalled();
  });

  it('estabelecimento de outra praça = 404', async () => {
    await expect(montar(fakePrisma()).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });

  it('HEIC do iPhone (pelos bytes) = 400 INVALID_FILE_TYPE, nada guardado', async () => {
    const p = fakePrisma();
    const { s, fotos } = montar(p);
    await expect(s.checkin(C, checkinDto({ lead_id: LEAD }), HEIC, AGORA)).rejects.toMatchObject({
      response: { code: 'INVALID_FILE_TYPE' },
    });
    expect(fotos.put).not.toHaveBeenCalled();
  });

  it('reenvio com o mesmo client_id devolve a visita, sem guardar foto de novo', async () => {
    const p = fakePrisma();
    p.field_visits.findUnique.mockResolvedValue(VISITA);
    const { s, fotos } = montar(p);

    expect((await s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).id).toBe('v1');
    expect(fotos.put).not.toHaveBeenCalled();
  });

  it('client_id de outro consultor = 409 CLIENT_ID_IN_USE', async () => {
    const p = fakePrisma();
    p.field_visits.findUnique.mockResolvedValue({ ...VISITA, consultant_id: OUTRO });
    await expect(montar(p).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).rejects.toMatchObject({
      response: { code: 'CLIENT_ID_IN_USE' },
    });
  });

  it('lead_id e new_place juntos (ou nenhum) = 400', async () => {
    const { s } = montar(fakePrisma());
    await expect(s.checkin(C, checkinDto(), JPEG, AGORA)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(
      s.checkin(C, checkinDto({ lead_id: LEAD, new_place: { name: 'X X' } }), JPEG, AGORA),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('com visita aberta = 409 VISIT_ALREADY_OPEN', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ id: 'aberta' });
    await expect(montar(p).s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).rejects.toMatchObject({
      response: { code: 'VISIT_ALREADY_OPEN' },
    });
  });

  it('corrida perdida no índice "uma visita aberta": apaga a foto órfã e responde 409', async () => {
    const p = fakePrisma();
    p.leads.findFirst.mockResolvedValue({ id: LEAD, lat: null, lng: null });
    p.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5.22.0' }),
    );
    const { s, fotos } = montar(p);

    await expect(s.checkin(C, checkinDto({ lead_id: LEAD }), JPEG, AGORA)).rejects.toMatchObject({
      response: { code: 'VISIT_ALREADY_OPEN' },
    });
    expect(fotos.remove).toHaveBeenCalledWith(dataDo(p.field_visits.create).photo_key);
  });
});

describe('VisitsService.saveAnswers', () => {
  it('rascunho parcial: apara texto, null limpa, lista null vira []', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, ...{ interlocutor_name: null } });

    await montar(p).s.saveAnswers(C, CLIENT, { interlocutor_name: '  Maria  ', notes: null, vaga_roles: null as unknown as string[] }, AGORA);

    expect(p.field_visits.findFirst).toHaveBeenCalledWith({
      where: { consultant_id: CONS, OR: [{ id: CLIENT }, { client_id: CLIENT }] },
      include: { lead: { select: { name: true, possible_dup: true } } },
    });
    expect(p.field_visits.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { interlocutor_name: 'Maria', notes: null, vaga_roles: [] },
    });
  });

  it('visita encerrada = 409 VISIT_CLOSED', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, checkout_at: new Date() });
    await expect(montar(p).s.saveAnswers(C, 'v1', { interest: 'alto' }, AGORA)).rejects.toMatchObject({
      response: { code: 'VISIT_CLOSED' },
    });
  });

  it('ref malformada ou de outro consultor = 404', async () => {
    const p = fakePrisma();
    await expect(montar(p).s.saveAnswers(C, 'nao-e-uuid', {}, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(montar(p).s.saveAnswers(C, CLIENT, {}, AGORA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});

describe('VisitsService.checkout — CRM numa transação', () => {
  it('questionário incompleto = 422 ANSWERS_INCOMPLETE com a lista', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, interest: null, followup_date: null });
    await expect(montar(p).s.checkout(C, CLIENT, POS, AGORA)).rejects.toMatchObject({
      status: 422,
      response: { code: 'ANSWERS_INCOMPLETE', message: 'Falta responder: interesse, data do retorno.' },
    });
  });

  it('lead em "Lead novo" vai para "Conversa aberta"; decisor, retorno, contato e evento "visit" do consultor', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);

    await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    expect(p.field_visits.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', checkout_at: null, auto_closed: false },
      data: { checkout_at: new Date(POS.at), checkout_lat: POS.lat, checkout_lng: POS.lng },
    });
    expect(p.leads.update).toHaveBeenCalledWith({
      where: { id: LEAD },
      data: {
        decisor: 'João',
        decisor_role: 'Dono',
        last_contact_at: new Date(POS.at),
        stage: 3,
        stage_since: '2026-10-08',
        next_step_what: 'Ligar sexta',
        next_step_date: '2026-10-10',
      },
    });
    expect(dataDo(p.lead_events.create)).toMatchObject({
      lead_id: LEAD,
      kind: 'visit',
      author_label: 'Consultor: Ana Souza',
      stage_to: 3,
      at: new Date(POS.at),
    });
    expect(dataDo(p.lead_events.create).text).toContain('Visita de campo — atendeu: João (Dono)');
    expect(dataDo(p.field_points.create)).toMatchObject({ kind: 'checkout' });
  });

  it('lead de "Reunião marcada" (4) em diante mantém a etapa; sem retorno não mexe no próximo passo', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, needs_followup: false, followup_what: null, followup_date: null });
    p.leads.findUniqueOrThrow.mockResolvedValue({ id: LEAD, stage: 4 });

    await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    const data = (p.leads.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty('stage');
    expect(data).not.toHaveProperty('next_step_what');
    expect(dataDo(p.lead_events.create)).toMatchObject({ stage_to: null });
  });

  it('reenvio de checkout já feito: 200 com a visita, nada gravado de novo', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, checkout_at: new Date('2026-10-08T14:59:00.000Z') });

    const v = await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    expect(v.id).toBe('v1');
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(p.lead_events.create).not.toHaveBeenCalled();
  });

  it('dois checkouts ao mesmo tempo: o update condicional deixa UM evento só', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue(VISITA);
    p.field_visits.updateMany.mockResolvedValue({ count: 0 });

    await montar(p).s.checkout(C, CLIENT, POS, AGORA);

    expect(p.lead_events.create).not.toHaveBeenCalled();
    expect(p.leads.update).not.toHaveBeenCalled();
  });

  it('visita fechada à meia-noite = 409 VISIT_AUTO_CLOSED', async () => {
    const p = fakePrisma();
    p.field_visits.findFirst.mockResolvedValue({ ...VISITA, auto_closed: true });
    await expect(montar(p).s.checkout(C, CLIENT, POS, AGORA)).rejects.toMatchObject({
      response: { code: 'VISIT_AUTO_CLOSED' },
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx jest src/modules/campo/__tests__/places.service.spec.ts`
Expected: FAIL — `Cannot find module '../places.service'`.

Run: `cd api && npx jest src/modules/campo/__tests__/multipart-checkin.spec.ts`
Expected: FAIL — `Cannot find module '../multipart-checkin'`.

Run: `cd api && npx jest src/modules/campo/__tests__/visits.service.spec.ts`
Expected: FAIL — `Cannot find module '../visits.service'`.

- [ ] **Step 3: `flattenErrors` compartilhado**

Crie `api/src/common/validation/flatten-errors.ts`:

```ts
import type { ValidationError } from 'class-validator';

/**
 * Mensagens do class-validator numa linha só ("campo: problema | ..."). Em
 * payload aninhado as constraints ficam nos FILHOS — ler só o nível de cima
 * devolve mensagem vazia. Usado pelo `ValidationPipe` global e pela validação
 * manual do check-in multipart.
 */
export function flattenErrors(errors: ValidationError[], path = ''): string {
  return errors
    .flatMap((e) => {
      const campo = path ? `${path}.${e.property}` : e.property;
      const proprias = Object.values(e.constraints ?? {}).map((m) => `${campo}: ${m}`);
      const filhas = e.children?.length ? [flattenErrors(e.children, campo)] : [];
      return [...proprias, ...filhas];
    })
    .filter(Boolean)
    .join(' | ');
}
```

Em `api/src/main.ts`: apague a função `flattenErrors` local (linhas 14–24), troque `import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';` por `import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';` e acrescente `import { flattenErrors } from './common/validation/flatten-errors';`. Ainda em `main.ts`, troque o comentário do multipart (linhas 59–62) por:

```ts
  // Multipart: o repasse da imagem das campanhas automáticas do Freela
  // (`POST /v1/freela/templates/upload`) e a foto da fachada no check-in do
  // consultor de campo (`POST /v1/campo/visits`). 5 MB, um arquivo — o arquivo
  // grande morre aqui, com 413, e não depois de atravessar a rede.
```

- [ ] **Step 4: DTOs das visitas**

Em `api/src/modules/campo/dto/campo.dto.ts`, troque os imports do topo por:

```ts
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDayString } from '../../../common/validation/is-day.decorator';
import { CARGOS, FREELA_STATUS, INTERESSES } from '../../../domain/campo-rules';
```

e acrescente no fim:

```ts
export class NovoLugarDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;
}

/** Campos do check-in (multipart). `confirm_new` chega como texto. */
export class CheckinDto extends PosicaoDto {
  @IsUUID()
  client_id!: string;

  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NovoLugarDto)
  new_place?: NovoLugarDto;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  confirm_new?: boolean;
}

/** Rascunho do questionário: tudo opcional, `null` limpa, SEM inicializador. */
export class AnswersDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  interlocutor_name?: string | null;

  @IsOptional()
  @IsIn([...CARGOS])
  interlocutor_role?: string | null;

  @IsOptional()
  @IsIn([...FREELA_STATUS])
  freela_status?: string | null;

  @IsOptional()
  @IsIn([...INTERESSES])
  interest?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  open_vagas?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  vaga_roles?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  freelas_per_week?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  channels?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  channel_other?: string | null;

  @IsOptional()
  @IsBoolean()
  needs_followup?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  followup_what?: string | null;

  @IsOptional()
  @IsDayString()
  followup_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class PlacesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  q?: string;
}

export class SimilarQueryDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}
```

- [ ] **Step 5: Leitura do multipart do check-in**

Crie `api/src/modules/campo/multipart-checkin.ts`:

```ts
/**
 * Check-in = campos + foto num multipart só (spec §6.1). Com o
 * `@fastify/multipart` registrado no `main.ts`, `@Body()` não serve: os campos
 * chegam como partes de texto. Lê TODAS as partes (a ordem campo/arquivo não
 * importa), consome o arquivo antes de qualquer consulta ao banco e valida o
 * resultado com a MESMA regra do `ValidationPipe` global (whitelist +
 * forbidNonWhitelisted).
 */
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { flattenErrors } from '../../common/validation/flatten-errors';
import { CheckinDto } from './dto/campo.dto';

export interface CheckinMultipart {
  campos: CheckinDto;
  foto: Buffer;
}

const invalido = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });

export async function lerCheckinMultipart(req: FastifyRequest): Promise<CheckinMultipart> {
  if (!req.isMultipart()) throw invalido('Envie o check-in como multipart/form-data (campos + foto).');

  const campos: Record<string, unknown> = {};
  let foto: Buffer | null = null;
  try {
    for await (const parte of req.parts()) {
      if (parte.type === 'file') {
        const bytes = await parte.toBuffer();
        if (parte.fieldname !== 'photo') throw invalido(`campo de arquivo inesperado: ${parte.fieldname}`);
        foto = bytes;
      } else {
        campos[parte.fieldname] = parte.value;
      }
    }
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    const code = (e as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'A foto passou de 5 MB.' });
    }
    if (code === 'FST_FILES_LIMIT') throw invalido('Envie uma foto só.');
    throw invalido('Não foi possível ler o formulário enviado.');
  }

  if (!foto) {
    throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'A foto da fachada é obrigatória (campo `photo`).' });
  }
  if (typeof campos.new_place === 'string') {
    try {
      campos.new_place = JSON.parse(campos.new_place);
    } catch {
      throw invalido('new_place: JSON inválido.');
    }
  }
  const dto = plainToInstance(CheckinDto, campos);
  const erros = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (erros.length > 0) throw invalido(flattenErrors(erros));
  return { campos: dto, foto };
}
```

- [ ] **Step 6: Estabelecimentos**

Crie `api/src/modules/campo/places.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import {
  caixaEnvolvente,
  distanciaM,
  nomeParecido,
  RAIO_DUPLICADO_M,
  RAIO_PERTO_M,
  type Coordenada,
} from '../../domain/campo-rules';
import { norm } from '../../domain/dedup';
import type { PlacesQueryDto } from './dto/campo.dto';

export interface PlaceView {
  id: string;
  name: string;
  address: string;
  stage: number;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
}

const COLUNAS = { id: true, name: true, address: true, stage: true, lat: true, lng: true } as const;

/** Estabelecimentos (leads) da praça do consultor — §20.3. */
@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  list(c: CampoConsultant, q: PlacesQueryDto): Promise<PlaceView[]> {
    if (q.q?.trim()) return this.search(c.praca_id, q.q);
    if (q.lat !== undefined && q.lng !== undefined) return this.near(c.praca_id, { lat: q.lat, lng: q.lng });
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Informe q (nome) ou lat e lng.' });
  }

  /** Raio pelo haversine, depois de um filtro de caixa barato no banco. */
  async near(pracaId: string, ponto: Coordenada, raio = RAIO_PERTO_M, limite = 30): Promise<PlaceView[]> {
    const box = caixaEnvolvente(ponto, raio);
    const linhas = await this.prisma.leads.findMany({
      where: {
        praca_id: pracaId,
        archived: false,
        lat: { gte: box.latMin, lte: box.latMax },
        lng: { gte: box.lngMin, lte: box.lngMax },
      },
      select: COLUNAS,
      take: 500,
    });
    return linhas
      .map((l) => ({ ...l, distance_m: distanciaM(ponto, { lat: l.lat as number, lng: l.lng as number }) }))
      .filter((l) => l.distance_m <= raio)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, limite);
  }

  /** Por nome, sem acento nem caixa ("cafe" acha "Café"), até 20. */
  async search(pracaId: string, texto: string): Promise<PlaceView[]> {
    const alvo = norm(texto);
    if (!alvo) return [];
    const linhas = await this.prisma.leads.findMany({
      where: { praca_id: pracaId, archived: false },
      select: COLUNAS,
      orderBy: { name: 'asc' },
    });
    return linhas
      .filter((l) => norm(l.name).includes(alvo))
      .slice(0, 20)
      .map((l) => ({ ...l, distance_m: null }));
  }

  /** "Já existe 'X' a 40 m — é esse?": nome parecido a até 100 m. */
  async similar(c: CampoConsultant, q: { name: string; lat: number; lng: number }): Promise<PlaceView[]> {
    const perto = await this.near(c.praca_id, { lat: q.lat, lng: q.lng }, RAIO_DUPLICADO_M, 10);
    return perto.filter((l) => nomeParecido(l.name, q.name));
  }
}
```

- [ ] **Step 7: Visitas**

Crie `api/src/modules/campo/visits.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { todaySp } from '../../common/time/dates';
import {
  carimbo,
  estagioDepoisDaVisita,
  faltando,
  marcaLonge,
  resumoVisita,
  ROTULO_CARGO,
} from '../../domain/campo-rules';
import { COM_LEAD, respostasDe, visitView, type VisitRow, type VisitView } from './campo-views';
import type { AnswersDto, CheckinDto, PosicaoDto } from './dto/campo.dto';
import { JourneysService } from './journeys.service';
import { chaveDaFoto, PHOTO_STORAGE, tipoDaImagem, type FotoLida, type PhotoStorage } from './photo-storage';
import { PlacesService } from './places.service';
import { violouUnico } from './prisma-errors';

const naoAchada = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Visita não encontrada.' });
const visitaAberta = () =>
  new ConflictException({
    code: 'VISIT_ALREADY_OPEN',
    message: 'Faça o checkout da visita aberta antes de começar outra.',
  });
const texto = (s: string | null | undefined): string | null => (s == null ? null : s.trim() || null);

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journeys: JourneysService,
    private readonly places: PlacesService,
    @Inject(PHOTO_STORAGE) private readonly fotos: PhotoStorage,
  ) {}

  async checkin(c: CampoConsultant, dto: CheckinDto, foto: Buffer, agora = new Date()): Promise<VisitView> {
    const mesma = await this.prisma.field_visits.findUnique({ where: { client_id: dto.client_id }, include: COM_LEAD });
    if (mesma) return this.daMesmaPessoa(mesma, c, agora);

    if (!!dto.lead_id === !!dto.new_place) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Informe lead_id ou new_place (um dos dois).' });
    }
    const mime = tipoDaImagem(foto);
    if (!mime) throw new BadRequestException({ code: 'INVALID_FILE_TYPE', message: 'A foto precisa ser JPEG, PNG ou WEBP.' });

    const jornada = await this.journeys.abertaOuFalha(c.id);
    const aberta = await this.prisma.field_visits.findFirst({
      where: { consultant_id: c.id, checkout_at: null, auto_closed: false },
      select: { id: true },
    });
    if (aberta) throw visitaAberta();

    const { at, ajustado } = carimbo(dto.at, agora, jornada.started_at);
    const ponto = { lat: dto.lat, lng: dto.lng };
    let leadId: string;
    let marca: { distance_m: number | null; far_from_place: boolean } = { distance_m: null, far_from_place: false };
    let novoLead: Prisma.leadsUncheckedCreateInput | null = null;

    if (dto.lead_id) {
      const lead = await this.prisma.leads.findFirst({
        where: { id: dto.lead_id, praca_id: c.praca_id },
        select: { id: true, lat: true, lng: true },
      });
      if (!lead) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Estabelecimento não encontrado na sua praça.' });
      leadId = lead.id;
      marca = marcaLonge(ponto, lead);
    } else {
      const lugar = dto.new_place!;
      // Sem "é outro" confirmado (check-in feito sem sinal, sem como perguntar),
      // não bloqueia: cria marcando possível duplicado para a equipe.
      const parecidos = dto.confirm_new ? [] : await this.places.similar(c, { name: lugar.name, ...ponto });
      const praca = await this.prisma.pracas.findUnique({ where: { id: c.praca_id }, select: { cobertura_cidade: true } });
      const dia = todaySp(at);
      leadId = randomUUID();
      novoLead = {
        id: leadId,
        praca_id: c.praca_id,
        name: lugar.name.trim(),
        address: lugar.address?.trim() ?? '',
        city: praca?.cobertura_cidade ?? '',
        origem: 'visita de campo',
        classe: 'alvo',
        stage: 1,
        entered_at: dia,
        stage_since: dia,
        lat: dto.lat,
        lng: dto.lng,
        possible_dup: parecidos.length > 0,
      };
    }

    // O id da visita existe ANTES da foto: a chave leva o id.
    const visitId = randomUUID();
    const key = chaveDaFoto(c.id, jornada.day, visitId, mime);
    await this.fotos.put(key, foto, mime);

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (novoLead) ops.push(this.prisma.leads.create({ data: novoLead }));
    ops.push(
      this.prisma.field_visits.create({
        data: {
          id: visitId,
          client_id: dto.client_id,
          journey_id: jornada.id,
          consultant_id: c.id,
          lead_id: leadId,
          checkin_at: at,
          checkin_lat: dto.lat,
          checkin_lng: dto.lng,
          checkin_accuracy: dto.accuracy,
          distance_m: marca.distance_m,
          far_from_place: marca.far_from_place,
          photo_key: key,
          photo_bytes: foto.length,
          clock_adjusted: ajustado,
        },
      }),
    );
    ops.push(
      this.prisma.field_points.create({
        data: {
          journey_id: jornada.id,
          at,
          lat: dto.lat,
          lng: dto.lng,
          accuracy: dto.accuracy,
          kind: 'checkin',
          client_id: randomUUID(),
          clock_adjusted: ajustado,
        },
      }),
    );
    try {
      await this.prisma.$transaction(ops);
    } catch (e) {
      // A foto já está guardada: sem a linha, ela vira lixo — sai junto.
      await this.fotos.remove(key).catch(() => undefined);
      if (!violouUnico(e)) throw e;
      const ganhou = await this.prisma.field_visits.findUnique({ where: { client_id: dto.client_id }, include: COM_LEAD });
      if (ganhou) return this.daMesmaPessoa(ganhou, c, agora);
      throw visitaAberta();
    }
    return this.porId(visitId, agora);
  }

  async saveAnswers(c: CampoConsultant, ref: string, dto: AnswersDto, agora = new Date()): Promise<VisitView> {
    const v = await this.daVisita(c.id, ref);
    if (v.checkout_at || v.auto_closed) {
      throw new ConflictException({ code: 'VISIT_CLOSED', message: 'Esta visita já foi encerrada.' });
    }
    const data: Prisma.field_visitsUpdateInput = {};
    if (dto.interlocutor_name !== undefined) data.interlocutor_name = texto(dto.interlocutor_name);
    if (dto.interlocutor_role !== undefined) data.interlocutor_role = dto.interlocutor_role;
    if (dto.freela_status !== undefined) data.freela_status = dto.freela_status;
    if (dto.interest !== undefined) data.interest = dto.interest;
    if (dto.open_vagas !== undefined) data.open_vagas = dto.open_vagas;
    if (dto.vaga_roles !== undefined) data.vaga_roles = (dto.vaga_roles ?? []).map((s) => s.trim()).filter(Boolean);
    if (dto.freelas_per_week !== undefined) data.freelas_per_week = dto.freelas_per_week;
    if (dto.channels !== undefined) data.channels = (dto.channels ?? []).map((s) => s.trim()).filter(Boolean);
    if (dto.channel_other !== undefined) data.channel_other = texto(dto.channel_other);
    if (dto.needs_followup !== undefined) data.needs_followup = dto.needs_followup;
    if (dto.followup_what !== undefined) data.followup_what = texto(dto.followup_what);
    if (dto.followup_date !== undefined) data.followup_date = dto.followup_date;
    if (dto.notes !== undefined) data.notes = texto(dto.notes);
    await this.prisma.field_visits.update({ where: { id: v.id }, data });
    return this.porId(v.id, agora);
  }

  async checkout(c: CampoConsultant, ref: string, dto: PosicaoDto, agora = new Date()): Promise<VisitView> {
    const v = await this.daVisita(c.id, ref);
    // Reenvio da fila (a resposta se perdeu): devolve o que já foi feito.
    if (v.checkout_at) return visitView(v, todaySp(agora));
    if (v.auto_closed) {
      throw new ConflictException({
        code: 'VISIT_AUTO_CLOSED',
        message: 'A visita foi fechada automaticamente à meia-noite e não aceita mais checkout.',
      });
    }
    const respostas = respostasDe(v);
    const falta = faltando(respostas, todaySp(agora));
    if (falta.length > 0) {
      throw new UnprocessableEntityException({ code: 'ANSWERS_INCOMPLETE', message: `Falta responder: ${falta.join(', ')}.` });
    }

    const { at, ajustado } = carimbo(dto.at, agora, v.checkin_at);
    const lead = await this.prisma.leads.findUniqueOrThrow({ where: { id: v.lead_id }, select: { id: true, stage: true } });
    const estagio = estagioDepoisDaVisita(lead.stage);
    const mudou = estagio !== lead.stage;

    await this.prisma.$transaction(async (tx) => {
      // Condicional: dois checkouts simultâneos gravam UM evento no CRM.
      const r = await tx.field_visits.updateMany({
        where: { id: v.id, checkout_at: null, auto_closed: false },
        data: { checkout_at: at, checkout_lat: dto.lat, checkout_lng: dto.lng, ...(ajustado ? { clock_adjusted: true } : {}) },
      });
      if (r.count === 0) return;
      await tx.field_points.create({
        data: {
          journey_id: v.journey_id,
          at,
          lat: dto.lat,
          lng: dto.lng,
          accuracy: dto.accuracy,
          kind: 'checkout',
          client_id: randomUUID(),
          clock_adjusted: ajustado,
        },
      });
      await tx.leads.update({
        where: { id: lead.id },
        data: {
          decisor: respostas.interlocutor_name!.trim(),
          decisor_role: ROTULO_CARGO[respostas.interlocutor_role!] ?? '',
          last_contact_at: at,
          ...(mudou ? { stage: estagio, stage_since: todaySp(at) } : {}),
          ...(respostas.needs_followup
            ? { next_step_what: respostas.followup_what!.trim(), next_step_date: respostas.followup_date }
            : {}),
        },
      });
      await tx.lead_events.create({
        data: {
          lead_id: lead.id,
          at,
          author_label: `Consultor: ${c.name}`,
          // `visit` (e não "visita"): é o tipo do catálogo — rótulo "Visita" e conta como contato.
          kind: 'visit',
          text: resumoVisita(respostas),
          stage_to: mudou ? estagio : null,
        },
      });
    });
    return this.porId(v.id, agora);
  }

  async photo(c: CampoConsultant, ref: string): Promise<FotoLida> {
    const v = await this.daVisita(c.id, ref);
    const f = await this.fotos.get(v.photo_key);
    if (!f) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Foto não encontrada.' });
    return f;
  }

  // ── internos ────────────────────────────────────────────────
  /** `ref` = id do servidor OU `client_id` (a fila offline só conhece o segundo); sempre do próprio consultor. */
  private async daVisita(consultantId: string, ref: string) {
    if (!isUuid(ref)) throw naoAchada();
    const v = await this.prisma.field_visits.findFirst({
      where: { consultant_id: consultantId, OR: [{ id: ref }, { client_id: ref }] },
      include: COM_LEAD,
    });
    if (!v) throw naoAchada();
    return v;
  }

  private async porId(id: string, agora: Date): Promise<VisitView> {
    const v = await this.prisma.field_visits.findUniqueOrThrow({ where: { id }, include: COM_LEAD });
    return visitView(v, todaySp(agora));
  }

  private daMesmaPessoa(v: VisitRow & { consultant_id: string }, c: CampoConsultant, agora: Date): VisitView {
    if (v.consultant_id !== c.id) {
      throw new ConflictException({ code: 'CLIENT_ID_IN_USE', message: 'Identificador de envio já usado.' });
    }
    return visitView(v, todaySp(agora));
  }
}
```

- [ ] **Step 8: Rotas e módulo**

Em `api/src/modules/campo/campo.controller.ts`:

1. Troque os imports do topo por:

```ts
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CampoConsultant } from '../../common/auth/campo-consultant';
import { AllowPendingPassword, CampoRoute } from '../../common/decorators/campo-route.decorator';
import { CurrentConsultant } from '../../common/decorators/current-consultant.decorator';
import { CampoAuthService } from './campo-auth.service';
import { AnswersDto, PlacesQueryDto, PontosDto, PosicaoDto, SimilarQueryDto, StartJourneyDto } from './dto/campo.dto';
import { JourneysService } from './journeys.service';
import { lerCheckinMultipart } from './multipart-checkin';
import { PlacesService } from './places.service';
import { VisitsService } from './visits.service';
```

2. Troque o construtor por:

```ts
  constructor(
    private readonly auth: CampoAuthService,
    private readonly journeys: JourneysService,
    private readonly places: PlacesService,
    private readonly visits: VisitsService,
  ) {}
```

3. Acrescente, depois do método `end`:

```ts
  // ── estabelecimentos (a estática `places/similar` antes de `places`) ──
  @Get('places/similar')
  similar(@CurrentConsultant() c: CampoConsultant, @Query() q: SimilarQueryDto) {
    return this.places.similar(c, q);
  }

  @Get('places')
  listPlaces(@CurrentConsultant() c: CampoConsultant, @Query() q: PlacesQueryDto) {
    return this.places.list(c, q);
  }

  // ── visitas ─────────────────────────────────────────────────
  @Post('visits')
  @ApiConsumes('multipart/form-data')
  async checkin(@CurrentConsultant() c: CampoConsultant, @Req() req: FastifyRequest) {
    const { campos, foto } = await lerCheckinMultipart(req);
    return this.visits.checkin(c, campos, foto);
  }

  @Patch('visits/:ref/answers')
  answers(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string, @Body() dto: AnswersDto) {
    return this.visits.saveAnswers(c, ref, dto);
  }

  @HttpCode(200)
  @Post('visits/:ref/checkout')
  checkout(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string, @Body() dto: PosicaoDto) {
    return this.visits.checkout(c, ref, dto);
  }

  @Get('visits/:ref/photo')
  @Header('Cache-Control', 'private, max-age=86400')
  async photo(@CurrentConsultant() c: CampoConsultant, @Param('ref') ref: string) {
    const f = await this.visits.photo(c, ref);
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline' });
  }
```

Em `api/src/modules/campo/campo.module.ts`, importe `PlacesService` de `./places.service` e `VisitsService` de `./visits.service` e acrescente os dois em `providers` (depois de `CampoAutocloseScheduler,`).

- [ ] **Step 9: Rodar e ver passar**

Run: `cd api && npx jest src/modules/campo/__tests__/places.service.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/modules/campo/__tests__/multipart-checkin.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/modules/campo/__tests__/visits.service.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add api/src/main.ts api/src/common/validation/flatten-errors.ts api/src/modules/campo
git commit -m "feat(campo): visitas com foto, questionário e checkout que atualiza o CRM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Leitura da equipe — dia do consultor, foto e lista de canais

**Files:**
- Modify: `api/src/modules/campo/consultores.service.ts`
- Modify: `api/src/modules/campo/consultores.controller.ts`
- Modify: `api/src/modules/campo/dto/consultores.dto.ts`
- Test: `api/src/modules/campo/__tests__/consultores-leitura.spec.ts`

**Interfaces:**
- Consumes: `ConsultoresService.findOrFail` (Task 4); `journeyView`, `pointView`, `visitView`, `COM_LEAD`, `JourneyView`, `PointView`, `VisitView` (Task 5); `lerCanais` (Task 2); `PHOTO_STORAGE`/`FotoLida` (Task 3); `isDateString` (`common/time/dates.ts`).
- Produces: `ConsultoresService.day(id, day)`, `.photo(visitId): Promise<FotoLida>`, `.channels()`, `.setChannels(dto)`; `ChannelsDto`; rotas `GET /v1/consultores/settings/channels`, `PUT /v1/consultores/settings/channels`, `GET /v1/consultores/visits/:visitId/photo`, `GET /v1/consultores/:id/days/:day`.

- [ ] **Step 1: Escrever o teste (falhando)**

Crie `api/src/modules/campo/__tests__/consultores-leitura.spec.ts`:

```ts
import type { PrismaService } from '../../../common/database/prisma.service';
import type { CampoFreelaService } from '../campo-freela.service';
import { ConsultoresService } from '../consultores.service';
import type { PhotoStorage } from '../photo-storage';

const CONS = '44444444-4444-4444-8444-444444444444';
const VISITA = '55555555-5555-4555-8555-555555555555';

function montar() {
  const p = {
    field_consultants: { findUnique: jest.fn().mockResolvedValue({ id: CONS, praca: { name: 'BH' } }) },
    field_journeys: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'j1', client_id: 'c', day: '2026-10-08', started_at: new Date('2026-10-08T12:00:00.000Z'),
          start_lat: -19.92, start_lng: -43.93, ended_at: null, end_lat: null, end_lng: null, auto_closed: false,
          points: [
            { id: 'p1', at: new Date('2026-10-08T12:00:00.000Z'), lat: -19.92, lng: -43.93, accuracy: 10, kind: 'start', clock_adjusted: false },
          ],
        },
      ]),
    },
    field_visits: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ photo_key: `campo/${CONS}/2026-10-08/${VISITA}.jpg` }),
    },
    app_settings: {
      findUnique: jest.fn().mockResolvedValue({ field_channels: ['Nenhum', 'iFood'] }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const fotos = { get: jest.fn().mockResolvedValue({ bytes: Buffer.from([1]), mime: 'image/jpeg' }), put: jest.fn(), remove: jest.fn() };
  const s = new ConsultoresService(p as unknown as PrismaService, {} as CampoFreelaService, fotos as unknown as PhotoStorage);
  return { p, s, fotos };
}

describe('ConsultoresService — leitura da equipe', () => {
  it('dia: jornadas com os pontos em ordem e visitas do dia', async () => {
    const { p, s } = montar();
    const r = await s.day(CONS, '2026-10-08');

    expect(p.field_journeys.findMany).toHaveBeenCalledWith({
      where: { consultant_id: CONS, day: '2026-10-08' },
      orderBy: { started_at: 'asc' },
      include: { points: { orderBy: { at: 'asc' } } },
    });
    expect(r.day).toBe('2026-10-08');
    expect(r.journeys[0]).toMatchObject({ id: 'j1', points: [{ id: 'p1', kind: 'start', at: '2026-10-08T12:00:00.000Z' }] });
    expect(r.visits).toEqual([]);
  });

  it('dia inexistente no calendário = 400 VALIDATION_ERROR', async () => {
    await expect(montar().s.day(CONS, '2026-02-31')).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('foto pela equipe; id malformado = 404 sem consultar', async () => {
    const { p, s } = montar();
    expect(await s.photo(VISITA)).toEqual({ bytes: Buffer.from([1]), mime: 'image/jpeg' });
    await expect(s.photo('nao-e-uuid')).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(p.field_visits.findUnique).toHaveBeenCalledTimes(1);
  });

  it('foto que sumiu do armazenamento = 404', async () => {
    const { s, fotos } = montar();
    fotos.get.mockResolvedValue(null);
    await expect(s.photo(VISITA)).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('canais: lê a lista e grava aparando e sem repetir (sem diferenciar caixa)', async () => {
    const { p, s } = montar();
    expect(await s.channels()).toEqual({ channels: ['Nenhum', 'iFood'] });

    expect(await s.setChannels({ channels: [' iFood ', 'ifood', 'Indeed'] })).toEqual({ channels: ['iFood', 'Indeed'] });
    expect(p.app_settings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { field_channels: ['iFood', 'Indeed'] },
      create: { id: 1, field_channels: ['iFood', 'Indeed'] },
    });
  });

  it('canais só com espaços = 400', async () => {
    await expect(montar().s.setChannels({ channels: ['  '] })).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx jest src/modules/campo/__tests__/consultores-leitura.spec.ts`
Expected: FAIL — `s.day is not a function`.

- [ ] **Step 3: DTO dos canais**

Em `api/src/modules/campo/dto/consultores.dto.ts`, troque o import de `class-validator` por

```ts
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
```

e acrescente no fim:

```ts
export class ChannelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  channels!: string[];
}
```

- [ ] **Step 4: Métodos de leitura no serviço**

Em `api/src/modules/campo/consultores.service.ts`:

1. Acrescente aos imports:

```ts
import { isDateString } from '../../common/time/dates';
import { lerCanais } from './campo-canais';
import {
  COM_LEAD,
  journeyView,
  pointView,
  visitView,
  type JourneyView,
  type PointView,
  type VisitView,
} from './campo-views';
import type { ChannelsDto } from './dto/consultores.dto';
import type { FotoLida } from './photo-storage';
```

(`todaySp` já é importado de `../../common/time/dates` — junte os dois nomes no mesmo import: `import { isDateString, todaySp } from '../../common/time/dates';`.)

2. Acrescente os métodos antes de `async findOrFail(`:

```ts
  /** Linha do tempo de um dia: jornadas (com os pontos em ordem) e visitas. */
  async day(
    id: string,
    day: string,
  ): Promise<{ day: string; journeys: (JourneyView & { points: PointView[] })[]; visits: VisitView[] }> {
    await this.findOrFail(id);
    if (!isDateString(day)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'day: deve ser uma data válida no formato YYYY-MM-DD' });
    }
    const [jornadas, visitas] = await Promise.all([
      this.prisma.field_journeys.findMany({
        where: { consultant_id: id, day },
        orderBy: { started_at: 'asc' },
        include: { points: { orderBy: { at: 'asc' } } },
      }),
      this.prisma.field_visits.findMany({
        where: { consultant_id: id, journey: { day } },
        include: COM_LEAD,
        orderBy: { checkin_at: 'asc' },
      }),
    ]);
    const hoje = todaySp();
    return {
      day,
      journeys: jornadas.map((j) => ({ ...journeyView(j), points: j.points.map(pointView) })),
      visits: visitas.map((v) => visitView(v, hoje)),
    };
  }

  /** Foto de qualquer visita — a equipe inteira lê (spec §11). */
  async photo(visitId: string): Promise<FotoLida> {
    const naoAchada = new NotFoundException({ code: 'NOT_FOUND', message: 'Foto não encontrada.' });
    if (!isUuid(visitId)) throw naoAchada;
    const v = await this.prisma.field_visits.findUnique({ where: { id: visitId }, select: { photo_key: true } });
    if (!v) throw naoAchada;
    const f = await this.fotos.get(v.photo_key);
    if (!f) throw naoAchada;
    return f;
  }

  async channels(): Promise<{ channels: string[] }> {
    return { channels: await lerCanais(this.prisma) };
  }

  /** Apara e tira repetidos sem diferenciar caixa ("iFood" e "ifood" são um só). */
  async setChannels(dto: ChannelsDto): Promise<{ channels: string[] }> {
    const vistos = new Set<string>();
    const lista: string[] = [];
    for (const bruto of dto.channels) {
      const canal = bruto.trim();
      const chave = canal.toLowerCase();
      if (!canal || vistos.has(chave)) continue;
      vistos.add(chave);
      lista.push(canal);
    }
    if (lista.length === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'channels: informe ao menos um canal.' });
    }
    await this.prisma.app_settings.upsert({
      where: { id: 1 },
      update: { field_channels: lista },
      create: { id: 1, field_channels: lista },
    });
    return { channels: lista };
  }
```

- [ ] **Step 5: Rotas (estáticas antes de `:id`)**

Em `api/src/modules/campo/consultores.controller.ts`:

1. Troque o import de `@nestjs/common` por:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  StreamableFile,
} from '@nestjs/common';
```

e o de DTOs por `import { ChannelsDto, CreateConsultorDto, UpdateConsultorDto } from './dto/consultores.dto';`.

2. Logo **acima** do comentário `// ── rotas com :id ...`, acrescente:

```ts
  // ── estáticas: ANTES de ':id', senão ':id' captura "settings" e "visits" ──
  @Get('settings/channels')
  channels() {
    return this.consultores.channels();
  }

  @AdminOnly()
  @Put('settings/channels')
  setChannels(@Body() dto: ChannelsDto) {
    return this.consultores.setChannels(dto);
  }

  @Get('visits/:visitId/photo')
  @Header('Cache-Control', 'private, max-age=86400')
  async photo(@Param('visitId') visitId: string) {
    const f = await this.consultores.photo(visitId);
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline' });
  }
```

3. Depois do método `get(...)` (o `@Get(':id')`), acrescente:

```ts
  @Get(':id/days/:day')
  day(@Param('id') id: string, @Param('day') day: string) {
    return this.consultores.day(id, day);
  }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd api && npx jest src/modules/campo/__tests__/consultores-leitura.spec.ts`
Expected: PASS.

Run: `cd api && npx jest src/modules/campo/__tests__/consultores.service.spec.ts`
Expected: PASS (nada da Task 4 quebrou).

- [ ] **Step 7: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add api/src/modules/campo
git commit -m "feat(campo): equipe lê o dia do consultor, as fotos e a lista de canais

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Smoke contra a API viva + typecheck e suíte inteira da API

**Files:**
- Modify: `api/scripts/smoke.sh`

**Interfaces:**
- Consumes: todas as rotas do §20 (Tasks 2–7); variáveis do smoke já existentes: `API`, `J`, `HD` (Diego, admin), `HN` (Daniel), `PRACA_SEED`, `SUF`, `HOJE`, `HOJE3`, `check`, `ok`, `ko`.
- Produces: seções "Campo: …" no smoke e a checagem de resíduo "nenhum consultor de campo sobrou".

- [ ] **Step 1: Escrever as seções do smoke (antes de subir a API)**

Em `api/scripts/smoke.sh`, logo **antes** da linha `echo "── Freela: conexão desligada ──"`, acrescente:

```bash
echo "── Campo: cadastro pela equipe ──"
# CPF válido e novo a cada rodada (é único): 9 dígitos do carimbo + os 2 verificadores.
cpf_valido(){ node -e '
const b=process.argv[1].slice(-9).padStart(9,"1").split("").map(Number);
const dv=(a)=>{const s=a.reduce((t,d,i)=>t+d*(a.length+1-i),0);const r=(s*10)%11;return r===10?0:r;};
const d1=dv(b),d2=dv([...b,d1]);console.log([...b,d1,d2].join(""));' "$1"; }
uuid(){ cat /proc/sys/kernel/random/uuid; }

EMAIL_CAMPO="campo$SUF@praca.local"
CPF_CAMPO=$(cpf_valido "$SUF")
CPF_ERRADO="${CPF_CAMPO:0:10}$(( (${CPF_CAMPO:10:1} + 1) % 10 ))"
CORPO_CAMPO="{\"name\":\"Consultor $SUF\",\"email\":\"$EMAIL_CAMPO\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$CPF_CAMPO\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$CPF_CAMPO\"}"

check "daniel (não admin) não cria consultor" "FORBIDDEN" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HN" -d "$CORPO_CAMPO" | jq -r .error.code)"
check "CPF com dígito errado = INVALID_CPF" "INVALID_CPF" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$(echo "$CORPO_CAMPO" | jq -c --arg c "$CPF_ERRADO" '.cpf=$c')" | jq -r .error.code)"
check "praça inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$(echo "$CORPO_CAMPO" | jq -c '.praca_id="00000000-0000-4000-8000-00000000beef"')" | jq -r .error.code)"

CRIA_CAMPO=$(curl -s -o /tmp/praca-smoke-campo.json -w '%{http_code}' -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$CORPO_CAMPO")
check "diego cria consultor = 201" "201" "$CRIA_CAMPO"
CONS_ID=$(jq -r .consultant.id /tmp/praca-smoke-campo.json)
SENHA_TEMP=$(jq -r .temp_password /tmp/praca-smoke-campo.json)
check "senha provisória de 10 caracteres" "10" "${#SENHA_TEMP}"
check "consultor não vaza password_hash" "false" "$(jq '.consultant | has("password_hash")' /tmp/praca-smoke-campo.json)"
check "sem Freela configurado: código pendente com o motivo" "true" \
  "$(jq '.consultant.freela_code == null and (.consultant.freela_sync_error | startswith("Conexão com o Freela não configurada"))' /tmp/praca-smoke-campo.json)"
check "e-mail repetido = EMAIL_IN_USE" "EMAIL_IN_USE" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$CORPO_CAMPO" | jq -r .error.code)"
check "CPF repetido = CPF_IN_USE" "CPF_IN_USE" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$(echo "$CORPO_CAMPO" | jq -c --arg e "outro$SUF@praca.local" '.email=$e')" | jq -r .error.code)"
check "consultor com id malformado = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/consultores/nao-e-uuid -H "$HD" | jq -r .error.code)"
check "lista (qualquer pessoa da equipe): ainda não iniciou" "nao_iniciou" \
  "$(curl -s $API/v1/consultores -H "$HN" | jq -r --arg i "$CONS_ID" '.[] | select(.id==$i) | .today.status')"

echo "── Campo: sessão do consultor ──"
check "senha errada = INVALID_CREDENTIALS" "INVALID_CREDENTIALS" \
  "$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL_CAMPO\",\"password\":\"errada123\"}" | jq -r .error.code)"
LOGIN_CAMPO=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL_CAMPO\",\"password\":\"$SENHA_TEMP\"}")
HC0="Authorization: Bearer $(echo "$LOGIN_CAMPO" | jq -r .access_token)"
check "login com a senha provisória pede a troca" "true" "$(echo "$LOGIN_CAMPO" | jq .must_change_password)"
check "antes da troca, /today = PASSWORD_CHANGE_REQUIRED" "PASSWORD_CHANGE_REQUIRED" \
  "$(curl -s $API/v1/campo/today -H "$HC0" | jq -r .error.code)"
check "/me liberado antes da troca" "$CONS_ID" "$(curl -s $API/v1/campo/me -H "$HC0" | jq -r .consultant.id)"
check "token da equipe em /v1/campo/me = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s $API/v1/campo/me -H "$HD" | jq -r .error.code)"
check "token do consultor em /v1/users = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s $API/v1/users -H "$HC0" | jq -r .error.code)"
check "token do consultor em /v1/consultores = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s $API/v1/consultores -H "$HC0" | jq -r .error.code)"
check "senha atual errada = WRONG_PASSWORD (400, não derruba a sessão)" "WRONG_PASSWORD" \
  "$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "$HC0" -d '{"current_password":"errada123","new_password":"campoSenha123"}' | jq -r .error.code)"
TROCA=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "$HC0" \
  -d "{\"current_password\":\"$SENHA_TEMP\",\"new_password\":\"campoSenha123\"}")
HC="Authorization: Bearer $(echo "$TROCA" | jq -r .access_token)"
check "troca de senha libera o acesso" "false" "$(echo "$TROCA" | jq .must_change_password)"
check "token de antes da troca = UNAUTHORIZED" "UNAUTHORIZED" "$(curl -s $API/v1/campo/me -H "$HC0" | jq -r .error.code)"
ME_CAMPO=$(curl -s $API/v1/campo/me -H "$HC")
check "/me: praça do consultor" "Belo Horizonte + Contagem" "$(echo "$ME_CAMPO" | jq -r .consultant.praca_name)"
check "/me: sem código ainda, link do QR nulo" "null" "$(echo "$ME_CAMPO" | jq -r .consultant.signup_url)"
check "/me: os 4 canais iniciais" "4" "$(echo "$ME_CAMPO" | jq '.channels | length')"

echo "── Campo: jornada ──"
AGORA=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
FUTURO=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%S.000Z)
LAT=-19.9245; LNG=-43.9352; LONGE_LAT=-19.9220
J1=$(uuid); P1=$(uuid); P2=$(uuid); V1=$(uuid); V2=$(uuid)
POS_CAMPO="\"at\":\"$AGORA\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"
# JPEG mínimo: a API confere os bytes mágicos (FF D8 FF), não o nome do arquivo.
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada.jpg
echo "nao e imagem" > /tmp/praca-smoke-campo.txt
checkin(){ # $1 client_id, $2 lat, $3 campo do lugar (lead_id=… ou new_place=…), $4 arquivo
  curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$1" -F "at=$AGORA" -F "lat=$2" -F "lng=$LNG" \
    -F "accuracy=12" --form-string "$3" ${4:+-F "photo=@$4;type=image/jpeg"}
}
NOVO_LUGAR="new_place={\"name\":\"Campo $SUF\",\"address\":\"Rua de Teste, 10\"}"

check "check-in sem jornada = NO_OPEN_JOURNEY" "NO_OPEN_JOURNEY" \
  "$(checkin "$V1" "$LAT" "$NOVO_LUGAR" /tmp/praca-smoke-fachada.jpg | jq -r .error.code)"
INICIO=$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$J1\",$POS_CAMPO}")
JORNADA_ID=$(echo "$INICIO" | jq -r .id)
check "jornada aberta com o dia de Brasília" "$HOJE" "$(echo "$INICIO" | jq -r .day)"
check "reenvio do início devolve a mesma jornada" "$JORNADA_ID" \
  "$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$J1\",$POS_CAMPO}" | jq -r .id)"
check "outra jornada com uma aberta = JOURNEY_ALREADY_OPEN" "JOURNEY_ALREADY_OPEN" \
  "$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",$POS_CAMPO}" | jq -r .error.code)"
PONTOS="{\"points\":[{\"client_id\":\"$P1\",$POS_CAMPO},{\"client_id\":\"$P2\",\"at\":\"$FUTURO\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":20}]}"
check "lote de pontos aceito" "2" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/points -H "$J" -H "$HC" -d "$PONTOS" | jq .accepted)"
check "reenvio do lote não duplica" "2" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/points -H "$J" -H "$HC" -d "$PONTOS" | jq .duplicates)"
check "lote acima de 50 pontos = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/points -H "$J" -H "$HC" \
    -d "$(jq -nc --arg at "$AGORA" '{points:[range(51)|{client_id:"00000000-0000-4000-8000-000000000001",at:$at,lat:-19.9,lng:-43.9,accuracy:10}]}')" | jq -r .error.code)"

echo "── Campo: visitas ──"
check "busca por nome acha o lead do seed" "Bar do Mercado" \
  "$(curl -s "$API/v1/campo/places?q=mercado" -H "$HC" | jq -r '.[0].name')"
check "places sem q nem posição = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/campo/places" -H "$HC" | jq -r .error.code)"
check "arquivo que não é imagem (mesmo dizendo image/jpeg) = INVALID_FILE_TYPE" "INVALID_FILE_TYPE" \
  "$(checkin "$V1" "$LAT" "$NOVO_LUGAR" /tmp/praca-smoke-campo.txt | jq -r .error.code)"
check "check-in sem foto = FILE_REQUIRED" "FILE_REQUIRED" \
  "$(checkin "$V1" "$LAT" "$NOVO_LUGAR" | jq -r .error.code)"
VISITA_C=$(checkin "$V1" "$LAT" "$NOVO_LUGAR" /tmp/praca-smoke-fachada.jpg)
VISITA_ID=$(echo "$VISITA_C" | jq -r .id)
LEAD_CAMPO=$(echo "$VISITA_C" | jq -r .lead_id)
check "check-in abre a visita" "null" "$(echo "$VISITA_C" | jq -r .checkout_at)"
check "lead novo do campo: origem e etapa" "visita de campo|1" \
  "$(curl -s $API/v1/leads/$LEAD_CAMPO -H "$HD" | jq -r '"\(.origem)|\(.stage)"')"
check "reenvio do check-in devolve a mesma visita" "$VISITA_ID" \
  "$(checkin "$V1" "$LAT" "$NOVO_LUGAR" /tmp/praca-smoke-fachada.jpg | jq -r .id)"
check "segunda visita com uma aberta = VISIT_ALREADY_OPEN" "VISIT_ALREADY_OPEN" \
  "$(checkin "$V2" "$LAT" "lead_id=$LEAD_CAMPO" /tmp/praca-smoke-fachada.jpg | jq -r .error.code)"
check "parecido a até 100 m acha o lead recém-criado" "$LEAD_CAMPO" \
  "$(curl -s "$API/v1/campo/places/similar?name=Campo%20$SUF&lat=$LAT&lng=$LNG" -H "$HC" | jq -r '.[0].id')"
check "perto de mim acha o lead a 0 m" "0" \
  "$(curl -s "$API/v1/campo/places?lat=$LAT&lng=$LNG" -H "$HC" | jq --arg i "$LEAD_CAMPO" '.[] | select(.id==$i) | .distance_m')"
check "encerrar a jornada com visita aberta = VISIT_OPEN" "VISIT_OPEN" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HC" -d "{$POS_CAMPO}" | jq -r .error.code)"
check "checkout com questionário vazio = ANSWERS_INCOMPLETE (422)" "422|ANSWERS_INCOMPLETE" \
  "$(curl -s -o /tmp/praca-smoke-campo.json -w '%{http_code}' -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS_CAMPO}")|$(jq -r .error.code /tmp/praca-smoke-campo.json)"
check "rascunho parcial salvo pelo client_id: faltam 6 itens" "6" \
  "$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d '{"interlocutor_name":"João","interlocutor_role":"dono"}' | jq '.missing | length')"
check "cargo fora da lista = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d '{"interlocutor_role":"chefe"}' | jq -r .error.code)"
RESPOSTAS_C="{\"freela_status\":\"cadastrou_qr\",\"interest\":\"alto\",\"open_vagas\":2,\"vaga_roles\":[\"Garçom\"],\"freelas_per_week\":4,\"channels\":[\"Grupos de WhatsApp\"],\"needs_followup\":true,\"followup_what\":\"Ligar na sexta\",\"followup_date\":\"$HOJE3\"}"
check "questionário completo: nada falta" "0" \
  "$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d "$RESPOSTAS_C" | jq '.missing | length')"
SAIDA=$(curl -s -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS_CAMPO}")
check "checkout feito" "true" "$(echo "$SAIDA" | jq '.checkout_at != null')"
check "reenvio do checkout devolve a mesma hora (nada gravado de novo)" "$(echo "$SAIDA" | jq -r .checkout_at)" \
  "$(curl -s -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS_CAMPO}" | jq -r .checkout_at)"
LEAD_DEPOIS=$(curl -s $API/v1/leads/$LEAD_CAMPO -H "$HD")
check "CRM: lead foi para Conversa aberta" "3" "$(echo "$LEAD_DEPOIS" | jq .stage)"
check "CRM: decisor é quem atendeu" "João|Dono" "$(echo "$LEAD_DEPOIS" | jq -r '"\(.decisor)|\(.decisor_role)"')"
check "CRM: próximo passo é o retorno pedido" "Ligar na sexta|$HOJE3" \
  "$(echo "$LEAD_DEPOIS" | jq -r '"\(.next_step.what)|\(.next_step.date)"')"
check "CRM: UM evento de visita do consultor, com a etapa nova" "1|3" \
  "$(echo "$LEAD_DEPOIS" | jq -r --arg a "Consultor: Consultor $SUF" '[.events[] | select(.kind=="visit" and .author_label==$a)] | "\(length)|\(.[0].stage_to)"')"
check "foto da visita para o consultor" "image/jpeg" \
  "$(curl -s -o /dev/null -w '%{content_type}' $API/v1/campo/visits/$V1/photo -H "$HC")"
check "foto da visita para a equipe" "image/jpeg" \
  "$(curl -s -o /dev/null -w '%{content_type}' $API/v1/consultores/visits/$VISITA_ID/photo -H "$HN")"

VISITA_2=$(checkin "$V2" "$LONGE_LAT" "lead_id=$LEAD_CAMPO" /tmp/praca-smoke-fachada.jpg)
check "check-in a mais de 200 m marca 'longe do local'" "true|278" \
  "$(echo "$VISITA_2" | jq -r '"\(.far_from_place)|\(.distance_m)"')"
curl -s -X PATCH $API/v1/campo/visits/$V2/answers -H "$J" -H "$HC" \
  -d '{"interlocutor_name":"Maria","interlocutor_role":"gerente","freela_status":"ja_usa","interest":"medio","open_vagas":0,"freelas_per_week":0,"channels":["Nenhum"],"needs_followup":false}' > /dev/null
curl -s -X POST $API/v1/campo/visits/$V2/checkout -H "$J" -H "$HC" -d "{$POS_CAMPO}" > /dev/null
check "segunda visita: etapa ≥ 3 se mantém" "3" "$(curl -s $API/v1/leads/$LEAD_CAMPO -H "$HD" | jq .stage)"
FIM=$(curl -s -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HC" -d "{$POS_CAMPO}")
check "jornada encerrada" "true" "$(echo "$FIM" | jq '.ended_at != null')"
check "reenvio do encerrar devolve a mesma jornada (200)" "$JORNADA_ID" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HC" -d "{$POS_CAMPO}" | jq -r .id)"
check "hoje: 2 visitas, 1 'cadastrou agora', jornada fechada" "2|1|null" \
  "$(curl -s $API/v1/campo/today -H "$HC" | jq -r '"\(.counters.visits)|\(.counters.cadastrou_qr)|\(.journey)"')"

echo "── Campo: telas da equipe ──"
DIA_CAMPO=$(curl -s $API/v1/consultores/$CONS_ID/days/$HOJE -H "$HN")
check "dia: pontos de início, trilha, check-ins, checkouts e fim" "checkin:2,checkout:2,end:1,start:1,track:2" \
  "$(echo "$DIA_CAMPO" | jq -r '[.journeys[0].points[].kind] | group_by(.) | map("\(.[0]):\(length)") | join(",")')"
check "dia: o ponto do futuro ficou com a hora ajustada" "1" \
  "$(echo "$DIA_CAMPO" | jq '[.journeys[0].points[] | select(.clock_adjusted)] | length')"
# As duas visitas têm o mesmo `checkin_at` ($AGORA): ordena antes de comparar.
check "dia: 2 visitas, uma longe do local" "2|false,true" \
  "$(echo "$DIA_CAMPO" | jq -r '"\(.visits | length)|\([.visits[].far_from_place] | sort | map(tostring) | join(","))"')"
check "dia inexistente no calendário = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s $API/v1/consultores/$CONS_ID/days/2026-02-31 -H "$HN" | jq -r .error.code)"
check "lista: encerrou, 2 visitas, 1 cadastro declarado" "encerrou|2|1" \
  "$(curl -s $API/v1/consultores -H "$HN" | jq -r --arg i "$CONS_ID" '.[] | select(.id==$i) | "\(.today.status)|\(.today.visits)|\(.today.cadastros)"')"
CANAIS_ORIGINAIS='{"channels":["Nenhum","Grupos de WhatsApp","Indicação de conhecidos","Agência de mão de obra"]}'
check "canais: a lista inicial" "4" "$(curl -s $API/v1/consultores/settings/channels -H "$HN" | jq '.channels | length')"
check "canais: daniel não muda = FORBIDDEN" "FORBIDDEN" \
  "$(curl -s -X PUT $API/v1/consultores/settings/channels -H "$J" -H "$HN" -d '{"channels":["X"]}' | jq -r .error.code)"
check "canais: admin troca aparando e sem repetir" "iFood|Indeed" \
  "$(curl -s -X PUT $API/v1/consultores/settings/channels -H "$J" -H "$HD" -d '{"channels":[" iFood ","ifood","Indeed"]}' | jq -r '.channels | join("|")')"
check "canais: volta à lista inicial (sem resíduo)" "4" \
  "$(curl -s -X PUT $API/v1/consultores/settings/channels -H "$J" -H "$HD" -d "$CANAIS_ORIGINAIS" | jq '.channels | length')"
NOVA_TEMP=$(curl -s -X POST $API/v1/consultores/$CONS_ID/reset-password -H "$HD" | jq -r .temp_password)
check "nova senha provisória" "10" "${#NOVA_TEMP}"
check "nova senha derruba a sessão aberta" "UNAUTHORIZED" "$(curl -s $API/v1/campo/me -H "$HC" | jq -r .error.code)"
check "tentar o código no Freela agora (sem conexão) mantém o motivo" "true" \
  "$(curl -s -X POST $API/v1/consultores/$CONS_ID/freela-sync -H "$HD" | jq '.freela_sync_error | startswith("Conexão com o Freela")')"
check "desativar o consultor" "false" \
  "$(curl -s -X PATCH $API/v1/consultores/$CONS_ID -H "$J" -H "$HD" -d '{"active":false}' | jq .active)"
check "login de consultor desativado = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL_CAMPO\",\"password\":\"$NOVA_TEMP\"}" | jq -r .error.code)"

echo "── Campo: limpeza ──"
check "daniel não apaga consultor = FORBIDDEN" "FORBIDDEN" \
  "$(curl -s -X DELETE $API/v1/consultores/$CONS_ID -H "$HN" | jq -r .error.code)"
check "admin apaga o consultor de teste (jornadas, visitas e fotos juntos)" "true" \
  "$(curl -s -X DELETE $API/v1/consultores/$CONS_ID -H "$HD" | jq .ok)"
check "consultor apagado = NOT_FOUND" "NOT_FOUND" "$(curl -s $API/v1/consultores/$CONS_ID -H "$HD" | jq -r .error.code)"
check "lead criado pela visita apagado" "true" "$(curl -s -X DELETE $API/v1/leads/$LEAD_CAMPO -H "$HD" | jq .ok)"
# Fotos em disco (PHOTO_STORAGE=disk, PHOTOS_DIR=./uploads, relativo a api/).
check "nenhuma foto de teste sobrou no disco" "nao" "$([ -e "uploads/campo/$CONS_ID" ] && echo sim || echo nao)"
rm -f /tmp/praca-smoke-fachada.jpg /tmp/praca-smoke-campo.txt /tmp/praca-smoke-campo.json
```

E na seção `echo "── Resíduo ──"`, logo depois do check `"nenhuma inscrição em cadência sobrou"`, acrescente:

```bash
check "nenhum consultor de campo sobrou" "0" "$(curl -s $API/v1/consultores -H "$HD" | jq 'length')"
```

Nota sobre `"true|278"`: `LONGE_LAT=-19.9220` fica 0,0025° ao norte de `LAT` — 278 m pelo haversine (`2·6371000·asin(sin(0,0025°/2))` = 277,99).

- [ ] **Step 2: Subir a API sem watcher, rodar o smoke e matar o processo**

Nada mais de pé (nenhum jest/tsc/next). Banco:

Run: `cd /home/doutor/coding/freela/praca && docker compose up -d postgres`

Suba a API **em segundo plano** (no harness, `run_in_background`):

Run: `cd /home/doutor/coding/freela/praca/api && npm run start:smoke`

Espere `curl -s localhost:3014/health` devolver `{"status":"ok",…}` (até ~40 s), e então:

Run: `cd /home/doutor/coding/freela/praca/api && npm run smoke`
Expected: `Resultado: N ok, 0 falha(s)` — anote o `N` (era 771 antes desta entrega); as seções "Campo: …" todas com ✓.

Mate a API: `pkill -f "src/main.ts"` e confirme:

Run: `ss -ltn | grep -E ':(3014|3024) '`
Expected: saída vazia.

Se algo falhar: corrija o código da task dona (não o smoke), mate a API e repita este passo.

- [ ] **Step 3: Rodar o smoke de novo (sem resíduo)**

Repita o Step 2 inteiro (subir, `npm run smoke`, matar, `ss`).
Expected: o mesmo `N ok, 0 falha(s)` — prova de que a primeira rodada não deixou resíduo.

- [ ] **Step 4: Suíte inteira da API (sozinha)**

Run: `cd /home/doutor/coding/freela/praca/api && npm test`
Expected: PASS — as 27 suítes antigas + as novas desta entrega (domínio, guards, env, sessão, fotos, Freela, consultores, jornada, meia-noite, lugares, multipart, visitas, leitura, scheduler do Freela, praça), 0 falhas.

- [ ] **Step 5: Typecheck da API (sozinho)**

Run: `cd /home/doutor/coding/freela/praca/api && npm run typecheck`
Expected: sem saída de erro (exit 0).

- [ ] **Step 6: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add api/scripts/smoke.sh
git commit -m "test(campo): smoke do fluxo do consultor, telas da equipe e 401 cruzados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web do consultor — sessão própria, entrar, trocar a senha, guarda e atalho na tela inicial

**Files:**
- Modify: `web/eslint.config.mjs`
- Create: `web/src/modules/campo/domain/campo.types.ts`
- Create: `web/src/modules/campo/infrastructure/campo-session.storage.ts`
- Create: `web/src/modules/campo/infrastructure/campo-http.ts`
- Create: `web/src/modules/campo/infrastructure/campo.api.ts`
- Create: `web/src/modules/campo/application/campo-session.store.ts`
- Create: `web/src/components/campo/CampoTopo.tsx`
- Create: `web/src/app/campo/layout.tsx`, `web/src/app/campo/manifest.webmanifest/route.ts`, `web/src/app/campo/icone/[tamanho]/route.tsx`
- Create: `web/src/app/campo/entrar/page.tsx`, `web/src/app/campo/senha/page.tsx`
- Create: `web/src/app/campo/(sessao)/layout.tsx`, `web/src/app/campo/(sessao)/page.tsx`
- Test: `web/scripts/browser-check.mjs` (seção "Campo")

**Interfaces:**
- Consumes: `POST /v1/campo/auth/login`, `POST /v1/campo/auth/change-password`, `GET /v1/campo/me` (Task 2); `API_URL`, `apiErrorMessage` (`web/src/modules/shared/infrastructure/http.ts`).
- Produces:
  - Tipos (`campo.types.ts`): `CampoConsultantMe`, `CampoSession`, `CampoLoginResponse`, `CampoMeResponse`, `Posicao`, `JourneyView`, `PointView`, `VisitAnswers`, `VisitView`, `TodayView`, `PlaceView`, `CheckinPayload`, `AcaoFila`, `ItemFila`.
  - Storage: `getCampoSession()`, `storeCampoSession(s)`, `clearCampoSession()`, `getSnapshot<T>(nome)`, `setSnapshot(nome, valor)`, `clearSnapshots()`.
  - `campoApi` (axios do consultor; 401 → limpa só a sessão e vai para `/campo/entrar`).
  - `campoLogin(email, password)`, `campoTrocarSenha(atual, nova)`, `campoMe()`.
  - `useCampoSession` (zustand): `session`, `hydrated`, `hydrate()`, `signIn()`, `trocarSenha()`, `setConsultant()`, `signOut()`.
  - `CampoTopo({ titulo })`.
  - Rotas: `/campo/entrar`, `/campo/senha`, `/campo` (guarda em `(sessao)/layout.tsx`), `/campo/manifest.webmanifest`, `/campo/icone/{180|192|512}`.

- [ ] **Step 1: Escrever a seção do campo no browser-check (falhando)**

Em `web/scripts/browser-check.mjs`:

1. Depois de `const SENHA = process.env.PRACA_CHECK_PASSWORD ?? 'praca123';`, acrescente:

```js
/** Consultor de campo criado pelo roteiro — prefixos fixos: é por eles que a faxina acha resíduo. */
const CAMPO_PREFIXO = 'campo-browser-check-';
const CAMPO_EMAIL = `${CAMPO_PREFIXO}${CARIMBO}@praca.local`;
const CAMPO_NOME = `Consultor Check ${CARIMBO}`;
const CAMPO_SENHA_NOVA = 'campoCheck123';
const CAMPO_LUGAR_PREFIXO = 'Campo Browser-Check';
const CAMPO_LUGAR = `${CAMPO_LUGAR_PREFIXO} ${CARIMBO}`;
/** Posição simulada do celular (Belo Horizonte, praça do seed). */
const POSICAO = { latitude: -19.9245, longitude: -43.9352, accuracy: 15 };

/** CPF válido a partir de uma semente (o CPF do consultor é único). */
function cpfValido(semente) {
  const b = String(semente).replace(/\D/g, '').slice(-9).padStart(9, '1').split('').map(Number);
  const dv = (a) => {
    const s = a.reduce((t, d, i) => t + d * (a.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(b);
  return [...b, d1, dv([...b, d1])].join('');
}
```

2. Em "Ids criados pelo roteiro", depois de `let acaoConcluida = null;`, acrescente:

```js
let consultorId = null;
let leadCampoId = null;
```

3. Na faxina de entrada (bloco `// ── 0.`), logo depois do `for (const l of restos) { … }`, acrescente:

```js
  for (const l of leadsAntes.filter((x) => x.name.startsWith(CAMPO_LUGAR_PREFIXO))) {
    console.log(`  faxina: apagando lead de visita residual "${l.name}"`);
    await api('DELETE', `/v1/leads/${l.id}`);
  }
  for (const c of (await api('GET', '/v1/consultores')).filter((x) => x.email.startsWith(CAMPO_PREFIXO))) {
    console.log(`  faxina: apagando consultor de campo residual ${c.email}`);
    await api('DELETE', `/v1/consultores/${c.id}`);
  }
```

e, nas pré-condições (depois de `check('há ação sem "resultado esperado" para concluir', …)`):

```js
  check('nenhum consultor de campo no banco', (await api('GET', '/v1/consultores')).length === 0);
```

4. Logo **depois** do fechamento do `try { … } catch (e) { ko('roteiro interrompido', …); }` principal (antes de `// ── limpeza: o banco volta ao seed`), acrescente o bloco do campo:

```js
// ── 13. Campo: o consultor no celular ───────────────────────────
// Bloco próprio: uma falha no roteiro da equipe não pula o do campo, e vice-versa.
/** `true` só durante os passos "sem sinal" — e aí só as falhas da lista fechada abaixo são esperadas. */
let offline = false;
/**
 * Lista FECHADA do que é esperado com o aparelho sem rede: a falha de rede em si
 * (`ERR_INTERNET_DISCONNECTED`) e o websocket de recarga do `next dev`, que cai
 * junto. Qualquer outra coisa derruba a rodada, offline ou não.
 */
const OFFLINE_ESPERADO = [/ERR_INTERNET_DISCONNECTED/, /webpack-hmr|turbopack-hmr|WebSocket/i];
const esperadoOffline = (...textos) => offline && textos.some((t) => OFFLINE_ESPERADO.some((re) => re.test(t)));

/** Os mesmos vigias da página principal, para cada página do campo. */
function vigiar(p, rotulo) {
  p.on('console', (m) => {
    if (m.type() === 'error' && !esperadoOffline(m.text())) {
      erros.push(`[console/${rotulo}] ${p.url().replace(BASE, '')}: ${m.text().slice(0, 200)}`);
    }
  });
  p.on('pageerror', (e) => erros.push(`[pageerror/${rotulo}] ${String(e).slice(0, 200)}`));
  p.on('response', (r) => {
    if (r.status() >= 400 && !ignorada(r.url())) {
      erros.push(`[http ${r.status()}/${rotulo}] ${r.request().method()} ${r.url().replace(API, 'api')}`);
    }
  });
  p.on('requestfailed', (r) => {
    const erro = r.failure()?.errorText ?? '?';
    if (!redeIgnorada(r.url(), erro) && !esperadoOffline(erro, r.url())) {
      erros.push(`[rede/${rotulo}] ${r.method()} ${r.url().replace(API, 'api')} — ${erro}`);
    }
  });
}

const celularCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  geolocation: POSICAO,
  permissions: ['geolocation'],
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
});
const cel = await celularCtx.newPage();
vigiar(cel, 'campo');
/** Situação de hoje do consultor do roteiro, como a equipe vê. */
const situacaoCampo = async () => (await api('GET', '/v1/consultores')).find((c) => c.id === consultorId)?.today;

try {
  console.log('-- Campo: entrada e troca de senha --');
  const criado = await api('POST', '/v1/consultores', {
    name: CAMPO_NOME,
    email: CAMPO_EMAIL,
    phone: '(31) 99999-0000',
    cpf: cpfValido(Date.now()),
    praca_id: PRACA,
    pix_key_type: 'email',
    pix_key: CAMPO_EMAIL,
  });
  consultorId = criado.consultant.id;
  check('equipe cria o consultor e recebe a senha provisória', criado.temp_password?.length === 10);

  const manifesto = await (await fetch(`${BASE}/campo/manifest.webmanifest`)).json();
  check('manifest do atalho "Praça Campo" abre em /campo', manifesto.name === 'Praça Campo' && manifesto.start_url === '/campo');
  const icone = await fetch(`${BASE}/campo/icone/192`);
  check('ícone do atalho é PNG', icone.status === 200 && (icone.headers.get('content-type') ?? '').includes('image/png'));

  await cel.goto(`${BASE}/campo/entrar`, { waitUntil: 'networkidle' });
  check('tela de entrada do campo', (await corpo(cel)).includes('entrada do consultor de campo'));
  await cel.locator('#email').fill(CAMPO_EMAIL);
  await cel.locator('#senha').fill(criado.temp_password);
  await cel.getByRole('button', { name: 'Entrar', exact: true }).click();
  await cel.waitForURL('**/campo/senha', { timeout: 20000 });
  check('senha provisória leva à troca obrigatória', cel.url().endsWith('/campo/senha'));
  await cel.locator('#atual').fill(criado.temp_password);
  await cel.locator('#nova').fill(CAMPO_SENHA_NOVA);
  await cel.locator('#confirma').fill(CAMPO_SENHA_NOVA);
  await cel.getByRole('button', { name: 'Salvar senha', exact: true }).click();
  await cel.waitForURL(/\/campo$/, { timeout: 20000 });
  await espera(1500);
  check('depois da troca, a tela de hoje do consultor', (await corpo(cel)).includes(CAMPO_NOME.toLowerCase()));
  const chaves = await cel.evaluate(() => ({
    campo: JSON.parse(localStorage.getItem('campoSession') ?? 'null'),
    equipe: localStorage.getItem('authUser'),
  }));
  check('sessão do campo numa chave própria, sem sessão da equipe', !!chaves.campo?.access_token && chaves.equipe === null);
  await cel.goto(`${BASE}/hoje`, { waitUntil: 'networkidle' });
  await espera(1200);
  check('consultor não entra nas telas da equipe (volta para /entrar)', new URL(cel.url()).pathname === '/entrar');
  await cel.goto(`${BASE}/campo`, { waitUntil: 'networkidle' });
  await espera(1200);
  check('e volta para o campo com a sessão dele', new URL(cel.url()).pathname === '/campo');
} catch (e) {
  ko('roteiro do campo interrompido', String(e).slice(0, 300));
} finally {
  await celularCtx.close();
}
```

5. Na limpeza, logo depois do bloco `if (leadId) { … }`, acrescente:

```js
if (consultorId) {
  await tentar('consultor de campo apagado', async () =>
    check('consultor de campo apagado', (await api('DELETE', `/v1/consultores/${consultorId}`)).ok === true),
  );
}
if (leadCampoId) {
  await tentar('lead da visita de campo apagado', async () =>
    check('lead da visita de campo apagado', (await api('DELETE', `/v1/leads/${leadCampoId}`)).ok === true),
  );
}
await tentar('resíduo: consultores de campo', async () => {
  for (const c of (await api('GET', '/v1/consultores')).filter((x) => x.email.startsWith(CAMPO_PREFIXO))) {
    await api('DELETE', `/v1/consultores/${c.id}`);
  }
  check('nenhum consultor de campo sobrou', (await api('GET', '/v1/consultores')).length === 0);
});
```

e, dentro do `tentar('resíduo: leads', …)`, acrescente:

```js
  check('nenhum lead de visita de campo sobrou', leadsFim.every((l) => !l.name.startsWith(CAMPO_LUGAR_PREFIXO)));
```

- [ ] **Step 2: Rodar e ver falhar**

Nada mais de pé. Suba, em segundo plano, a API (`cd api && npm run start:smoke`) e, quando `curl -s localhost:3014/health` responder, o web (`cd web && yarn dev`); espere `curl -s -o /dev/null -w '%{http_code}' localhost:3024/entrar` dar `200`.

Run: `cd /home/doutor/coding/freela/praca/web && yarn browser-check`
Expected: FAIL — `manifest do atalho …` (404) e `tela de entrada do campo` (a rota `/campo/entrar` não existe). Deixe API e web de pé para o Step 5.

- [ ] **Step 3: Tipos, sessão, axios e API do campo**

Em `web/eslint.config.mjs`, troque `ignores: ['src/modules/auth/infrastructure/auth.storage.ts'],` por:

```js
    // Duas sessões, dois arquivos: a da equipe (`authUser`) e a do consultor de
    // campo (`campoSession`). Nenhum outro arquivo toca o storage.
    ignores: [
      'src/modules/auth/infrastructure/auth.storage.ts',
      'src/modules/campo/infrastructure/campo-session.storage.ts',
    ],
```

Crie `web/src/modules/campo/domain/campo.types.ts`:

```ts
/** Wire do consultor de campo — contrato §20 (`docs/api-contract.md`). */

export interface CampoConsultantMe {
  id: string;
  name: string;
  email: string;
  phone: string;
  praca_id: string;
  praca_name: string;
  must_change_password: boolean;
  freela_code: string | null;
  signup_url: string | null;
}

export interface CampoSession {
  access_token: string;
  consultant: CampoConsultantMe;
}

export interface CampoLoginResponse {
  access_token: string;
  consultant: CampoConsultantMe;
  must_change_password: boolean;
}

export interface CampoMeResponse {
  consultant: CampoConsultantMe;
  channels: string[];
}

/** Posição + hora real do aparelho. */
export interface Posicao {
  at: string;
  lat: number;
  lng: number;
  accuracy: number;
}

export interface JourneyView {
  id: string;
  client_id: string;
  day: string;
  started_at: string;
  start_lat: number;
  start_lng: number;
  ended_at: string | null;
  end_lat: number | null;
  end_lng: number | null;
  auto_closed: boolean;
}

export interface PointView {
  id: string;
  at: string;
  lat: number;
  lng: number;
  accuracy: number;
  kind: 'start' | 'track' | 'checkin' | 'checkout' | 'end';
  clock_adjusted: boolean;
}

export type Cargo = 'dono' | 'gerente' | 'outro';
export type FreelaStatus = 'ja_usa' | 'cadastrou_qr' | 'nao_cadastrou';
export type Interesse = 'alto' | 'medio' | 'baixo' | 'nenhum';

export interface VisitAnswers {
  interlocutor_name: string | null;
  interlocutor_role: Cargo | null;
  freela_status: FreelaStatus | null;
  interest: Interesse | null;
  open_vagas: number | null;
  vaga_roles: string[];
  freelas_per_week: number | null;
  channels: string[];
  channel_other: string | null;
  needs_followup: boolean | null;
  followup_what: string | null;
  followup_date: string | null;
  notes: string | null;
}

export interface VisitView {
  id: string;
  client_id: string;
  journey_id: string;
  lead_id: string;
  lead_name: string;
  possible_dup: boolean;
  checkin_at: string;
  checkin_lat: number;
  checkin_lng: number;
  checkin_accuracy: number;
  distance_m: number | null;
  far_from_place: boolean;
  photo_bytes: number;
  checkout_at: string | null;
  checkout_lat: number | null;
  checkout_lng: number | null;
  auto_closed: boolean;
  clock_adjusted: boolean;
  answers: VisitAnswers;
  missing: string[];
}

export interface TodayView {
  day: string;
  journey: JourneyView | null;
  journeys: JourneyView[];
  open_visit: VisitView | null;
  visits: VisitView[];
  counters: { visits: number; cadastrou_qr: number };
}

export interface PlaceView {
  id: string;
  name: string;
  address: string;
  stage: number;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
}

/** Check-in na fila. `place_name` é só da tela (a lista do dia mostra o nome antes de o envio sair). */
export interface CheckinPayload extends Posicao {
  client_id: string;
  lead_id?: string;
  new_place?: { name: string; address?: string };
  confirm_new?: boolean;
  place_name: string;
}

/** O que a fila offline guarda (spec §9): cada ação com o `client_id` do aparelho e a hora real. */
export type AcaoFila =
  | { kind: 'start'; payload: { client_id: string } & Posicao }
  | { kind: 'points'; payload: { points: ({ client_id: string } & Posicao)[] } }
  | { kind: 'checkin'; payload: CheckinPayload; foto: Blob }
  | { kind: 'answers'; visit_ref: string; payload: VisitAnswers }
  | { kind: 'checkout'; visit_ref: string; payload: Posicao }
  | { kind: 'end'; payload: Posicao };

export type ItemFila = AcaoFila & {
  /** Chave do IndexedDB (autoincremento) — é a ordem de envio. */
  seq?: number;
  /** A fila é por consultor: o celular pode trocar de conta com envio pendente. */
  consultant_id: string;
  tentativas: number;
  /** Epoch ms antes do qual não tenta de novo (espera crescente). */
  proxima_em: number;
  criado_em: number;
};
```

Crie `web/src/modules/campo/infrastructure/campo-session.storage.ts`:

```ts
// Sessão do CONSULTOR de campo: chave própria (`campoSession`), separada da
// sessão da equipe (`authUser`, em `auth/infrastructure/auth.storage.ts`). É o
// segundo e último arquivo autorizado a tocar o storage (eslint.config.mjs).
// Também guarda os "retratos" (`campoSnapshot:*`) que deixam a tela abrir sem sinal.
import type { CampoSession } from '../domain/campo.types';

const CHAVE = 'campoSession';
const RETRATO = 'campoSnapshot:';

function ler<T>(chave: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Storage cheio ou bloqueado: a tela segue, só sem o retrato.
  }
}

export function getCampoSession(): CampoSession | null {
  return ler<CampoSession>(CHAVE);
}

export function storeCampoSession(sessao: CampoSession): void {
  gravar(CHAVE, sessao);
}

/** Só a sessão: a fila (IndexedDB) fica guardada até o próximo login (spec §9). */
export function clearCampoSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CHAVE);
}

export function getSnapshot<T>(nome: string): T | null {
  return ler<T>(RETRATO + nome);
}

export function setSnapshot(nome: string, valor: unknown): void {
  gravar(RETRATO + nome, valor);
}

export function removeSnapshot(nome: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(RETRATO + nome);
}

export function clearSnapshots(): void {
  if (typeof window === 'undefined') return;
  for (const k of Object.keys(window.localStorage)) {
    if (k.startsWith(RETRATO)) window.localStorage.removeItem(k);
  }
}
```

Crie `web/src/modules/campo/infrastructure/campo-http.ts`:

```ts
import axios from 'axios';
import { API_URL } from '@/modules/shared/infrastructure/http';
import { clearCampoSession, getCampoSession } from './campo-session.storage';

/**
 * Axios do CONSULTOR — separado do `api` da equipe: outro token (`campoSession`),
 * outra tela de entrada (`/campo/entrar`). O token é lido NA HORA de cada envio
 * (a fila offline nunca guarda token: depois de entrar de novo, sai o novo).
 */
export const campoApi = axios.create({ baseURL: API_URL, timeout: 30_000 });

campoApi.interceptors.request.use((config) => {
  if (!config.headers.Authorization) {
    const sessao = getCampoSession();
    if (sessao?.access_token) config.headers.Authorization = `Bearer ${sessao.access_token}`;
  }
  return config;
});

/**
 * 401 = sessão morta (expirou em 7 dias, senha trocada, conta desativada).
 * Limpa SÓ a sessão — a fila continua no IndexedDB até o próximo login — e
 * recarrega na entrada (mesmo motivo do `http.ts` da equipe: o zustand não
 * relê o storage sozinho).
 */
let redirecionando = false;
campoApi.interceptors.response.use(undefined, (error) => {
  if (error?.response?.status === 401 && typeof window !== 'undefined') {
    const url = String(error.config?.url ?? '');
    if (!url.includes('/auth/login')) {
      clearCampoSession();
      if (!window.location.pathname.startsWith('/campo/entrar') && !redirecionando) {
        redirecionando = true;
        window.location.replace('/campo/entrar');
      }
    }
  }
  return Promise.reject(error);
});
```

Crie `web/src/modules/campo/infrastructure/campo.api.ts`:

```ts
import type { CampoLoginResponse, CampoMeResponse } from '../domain/campo.types';
import { campoApi } from './campo-http';

export async function campoLogin(email: string, password: string): Promise<CampoLoginResponse> {
  const { data } = await campoApi.post('/v1/campo/auth/login', { email, password });
  return data as CampoLoginResponse;
}

export async function campoTrocarSenha(atual: string, nova: string): Promise<CampoLoginResponse> {
  const { data } = await campoApi.post('/v1/campo/auth/change-password', {
    current_password: atual,
    new_password: nova,
  });
  return data as CampoLoginResponse;
}

export async function campoMe(): Promise<CampoMeResponse> {
  const { data } = await campoApi.get('/v1/campo/me');
  return data as CampoMeResponse;
}
```

Crie `web/src/modules/campo/application/campo-session.store.ts`:

```ts
'use client';

import { create } from 'zustand';
import type { CampoConsultantMe, CampoSession } from '../domain/campo.types';
import { campoLogin, campoTrocarSenha } from '../infrastructure/campo.api';
import {
  clearCampoSession,
  clearSnapshots,
  getCampoSession,
  storeCampoSession,
} from '../infrastructure/campo-session.storage';

interface CampoSessionState {
  session: CampoSession | null;
  hydrated: boolean;
  hydrate: () => void;
  signIn: (email: string, password: string) => Promise<CampoSession>;
  trocarSenha: (atual: string, nova: string) => Promise<CampoSession>;
  /** Dados novos do servidor (`/me`) sem trocar o token. */
  setConsultant: (consultant: CampoConsultantMe) => void;
  /** "Sair": some a sessão e os retratos; a fila fica (é do consultor, sai no próximo login dele). */
  signOut: () => void;
}

export const useCampoSession = create<CampoSessionState>((set, get) => ({
  session: null,
  hydrated: false,
  hydrate: () => set({ session: getCampoSession(), hydrated: true }),
  signIn: async (email, password) => {
    const r = await campoLogin(email, password);
    const session: CampoSession = { access_token: r.access_token, consultant: r.consultant };
    storeCampoSession(session);
    set({ session, hydrated: true });
    return session;
  },
  trocarSenha: async (atual, nova) => {
    const r = await campoTrocarSenha(atual, nova);
    const session: CampoSession = { access_token: r.access_token, consultant: r.consultant };
    storeCampoSession(session);
    set({ session, hydrated: true });
    return session;
  },
  setConsultant: (consultant) => {
    const atual = get().session;
    if (!atual) return;
    const session = { ...atual, consultant };
    storeCampoSession(session);
    set({ session });
  },
  signOut: () => {
    clearCampoSession();
    clearSnapshots();
    set({ session: null, hydrated: true });
  },
}));
```

- [ ] **Step 4: Telas de entrada, troca de senha, guarda e atalho**

Crie `web/src/components/campo/CampoTopo.tsx`:

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';

/** Cabeçalho das telas do consultor: título, quem está logado e "Sair". */
export function CampoTopo({ titulo }: { titulo: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useCampoSession((s) => s.session);
  const signOut = useCampoSession((s) => s.signOut);

  async function sair() {
    // Limpa o cache ANTES de trocar de conta (mesma regra do `useAuth` da equipe).
    await queryClient.cancelQueries();
    queryClient.clear();
    signOut();
    router.replace('/campo/entrar');
  }

  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <p className="font-display text-2xl font-black tracking-tight">{titulo}</p>
        <p className="text-xs text-muted-foreground">
          {session?.consultant.name} · {session?.consultant.praca_name}
        </p>
      </div>
      <button
        onClick={() => void sair()}
        className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
      >
        Sair
      </button>
    </header>
  );
}
```

Crie `web/src/app/campo/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';

/**
 * Raiz das telas do consultor de campo — FORA do grupo `(app)`: outra sessão,
 * outra guarda. Componente de servidor de propósito: é ele que exporta o
 * `metadata` (manifest do atalho "Praça Campo" na tela inicial, spec §8.1).
 */
export const metadata: Metadata = {
  title: 'Praça Campo',
  description: 'Jornada, visitas e QR code do consultor de campo da Freela.',
  manifest: '/campo/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Praça Campo', statusBarStyle: 'black-translucent' },
  icons: { icon: '/campo/icone/192', apple: '/campo/icone/180' },
};

export const viewport: Viewport = {
  themeColor: '#1d1d1b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
```

Crie `web/src/app/campo/manifest.webmanifest/route.ts`:

```ts
/** Manifest do atalho "Praça Campo" (spec §8.1): abre direto em /campo, em tela cheia. */
export function GET() {
  const manifest = {
    name: 'Praça Campo',
    short_name: 'Praça Campo',
    start_url: '/campo',
    scope: '/campo',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1d1d1b',
    theme_color: '#1d1d1b',
    icons: [
      { src: '/campo/icone/192', sizes: '192x192', type: 'image/png' },
      { src: '/campo/icone/512', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
```

Crie `web/src/app/campo/icone/[tamanho]/route.tsx`:

```tsx
import { ImageResponse } from 'next/og';

/** Ícone PNG do atalho, desenhado na hora (sem binário no repo). Só os três tamanhos do manifest. */
const TAMANHOS = new Set(['180', '192', '512']);

export async function GET(_req: Request, { params }: { params: Promise<{ tamanho: string }> }) {
  const { tamanho } = await params;
  if (!TAMANHOS.has(tamanho)) return new Response('Not found', { status: 404 });
  const n = Number(tamanho);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1d1d1b',
          color: '#ECA826',
          fontSize: Math.round(n * 0.5),
          fontWeight: 900,
        }}
      >
        P.
      </div>
    ),
    { width: n, height: n },
  );
}
```

Crie `web/src/app/campo/entrar/page.tsx`:

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const entrarSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().min(6, 'A senha tem ao menos 6 caracteres.'),
});

type EntrarForm = z.infer<typeof entrarSchema>;

export default function EntrarCampoPage() {
  const router = useRouter();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const signIn = useCampoSession((s) => s.signIn);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntrarForm>({ resolver: zodResolver(entrarSchema), defaultValues: { email: '', senha: '' } });

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  // Quem já tem sessão não vê a entrada.
  useEffect(() => {
    if (hydrated && session) router.replace(session.consultant.must_change_password ? '/campo/senha' : '/campo');
  }, [hydrated, session, router]);

  async function onSubmit(values: EntrarForm) {
    try {
      const s = await signIn(values.email, values.senha);
      router.replace(s.consultant.must_change_password ? '/campo/senha' : '/campo');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível entrar.'));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <p className="font-display text-3xl font-black tracking-tight">
        PRAÇA<span className="text-primary">.</span> <span className="text-lg text-muted-foreground">Campo</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Entrada do consultor de campo. O acesso é criado pela equipe do Praça.
      </p>
      <form className="card-surface mt-6 space-y-4 p-5" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" inputMode="email" autoComplete="email" className="h-12" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" autoComplete="current-password" className="h-12" {...register('senha')} />
          {errors.senha && <p className="text-xs text-destructive">{errors.senha.message}</p>}
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </main>
  );
}
```

Crie `web/src/app/campo/senha/page.tsx`:

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const senhaSchema = z
  .object({
    atual: z.string().min(6, 'Informe a senha que você recebeu.'),
    nova: z.string().min(8, 'A senha nova tem ao menos 8 caracteres.').max(72, 'No máximo 72 caracteres.'),
    confirma: z.string(),
  })
  .refine((v) => v.nova === v.confirma, { path: ['confirma'], message: 'As duas senhas não são iguais.' })
  .refine((v) => v.nova !== v.atual, { path: ['nova'], message: 'A senha nova precisa ser diferente da atual.' });

type SenhaForm = z.infer<typeof senhaSchema>;

/** Troca obrigatória no primeiro acesso (spec §2.4) — fica fora da guarda de `(sessao)`. */
export default function SenhaCampoPage() {
  const router = useRouter();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const trocarSenha = useCampoSession((s) => s.trocarSenha);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SenhaForm>({ resolver: zodResolver(senhaSchema), defaultValues: { atual: '', nova: '', confirma: '' } });

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (hydrated && !session) router.replace('/campo/entrar');
  }, [hydrated, session, router]);

  async function onSubmit(values: SenhaForm) {
    try {
      await trocarSenha(values.atual, values.nova);
      toast.success('Senha trocada.');
      router.replace('/campo');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível trocar a senha.'));
    }
  }

  if (!hydrated || !session) {
    return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="font-display text-2xl font-black">Troque sua senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {session.consultant.must_change_password
          ? 'Primeiro acesso: troque a senha provisória que você recebeu da equipe.'
          : 'Escolha uma senha nova.'}
      </p>
      <form className="card-surface mt-6 space-y-4 p-5" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="atual">Senha atual (a provisória)</Label>
          <Input id="atual" type="password" autoComplete="current-password" className="h-12" {...register('atual')} />
          {errors.atual && <p className="text-xs text-destructive">{errors.atual.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="nova">Senha nova</Label>
          <Input id="nova" type="password" autoComplete="new-password" className="h-12" {...register('nova')} />
          {errors.nova && <p className="text-xs text-destructive">{errors.nova.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirma">Repita a senha nova</Label>
          <Input id="confirma" type="password" autoComplete="new-password" className="h-12" {...register('confirma')} />
          {errors.confirma && <p className="text-xs text-destructive">{errors.confirma.message}</p>}
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Salvar senha'}
        </Button>
      </form>
    </main>
  );
}
```

Crie `web/src/app/campo/(sessao)/layout.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';

/**
 * Guarda das telas do consultor (mesma regra do `(app)/layout.tsx` da equipe:
 * a página nem monta sem sessão). Senha provisória pendente → `/campo/senha`.
 */
export default function CampoSessaoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const pendente = session?.consultant.must_change_password ?? false;

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace('/campo/entrar');
    else if (pendente) router.replace('/campo/senha');
  }, [hydrated, session, pendente, router]);

  if (!hydrated || !session || pendente) {
    return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return <div className="mx-auto min-h-dvh max-w-md px-4 pb-36 pt-4">{children}</div>;
}
```

Crie `web/src/app/campo/(sessao)/page.tsx` (a Task 10 troca pela tela completa):

```tsx
'use client';

import { CampoTopo } from '@/components/campo/CampoTopo';

export default function HojeCampoPage() {
  return (
    <main className="space-y-5">
      <CampoTopo titulo="Hoje" />
    </main>
  );
}
```

- [ ] **Step 5: Rodar o browser-check e ver passar; checar tipos e lint**

Com API e web ainda de pé (Step 2):

Run: `cd /home/doutor/coding/freela/praca/web && yarn browser-check`
Expected: `… ok — nenhum erro de console, nenhuma resposta HTTP ≥ 400.`, com as checagens "Campo: entrada e troca de senha" verdes e a limpeza "consultor de campo apagado" / "nenhum consultor de campo sobrou".

Mate os dois processos (`pkill -f "next dev"`, `pkill -f "src/main.ts"`) e confirme `ss -ltn | grep -E ':(3014|3024) '` vazio. Depois, um de cada vez:

Run: `cd web && yarn typecheck`
Expected: sem erro.

Run: `cd web && yarn lint`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add web/eslint.config.mjs web/src/modules/campo web/src/components/campo web/src/app/campo web/scripts/browser-check.mjs
git commit -m "feat(web/campo): sessão do consultor, entrada, troca de senha e atalho Praça Campo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Web do consultor — tela de hoje, jornada, GPS e fila offline (IndexedDB)

**Files:**
- Modify: `web/package.json` (`vitest@3.2.4` em `devDependencies`, script `test`)
- Create: `web/vitest.config.ts`
- Create: `web/src/modules/campo/domain/formatos.ts`, `fila-politica.ts`, `dia-local.ts`, `gps-mensagens.ts`
- Create: `web/src/modules/campo/application/fila-motor.ts`, `use-fila.ts`, `use-campo.ts`, `use-rastreio.ts`, `use-online.ts`
- Create: `web/src/modules/campo/infrastructure/fila-idb.ts`, `fila.ts`, `gps.ts`
- Modify: `web/src/modules/campo/infrastructure/campo.api.ts`
- Create: `web/src/components/campo/FaixaFila.tsx`, `AvisoGps.tsx`
- Modify: `web/src/app/campo/(sessao)/layout.tsx`, `web/src/app/campo/(sessao)/page.tsx`
- Test: `web/src/modules/campo/domain/__tests__/formatos.test.ts`, `fila-politica.test.ts`, `dia-local.test.ts`, `gps-mensagens.test.ts`; `web/src/modules/campo/application/__tests__/fila-motor.test.ts`; `web/scripts/browser-check.mjs`

**Interfaces:**
- Consumes: tipos e `campoApi`/`getCampoSession`/`getSnapshot`/`setSnapshot`/`useCampoSession` (Task 9); rotas `/v1/campo/today`, `journeys/*`, `places*`, `visits*` (Tasks 5–6).
- Produces:
  - `hora(iso)`, `duracaoMin(inicio, fim)`, `plural(n, um, varios)` (`formatos.ts`).
  - `classificar(status, code?): 'ok'|'rede'|'sessao'|'regra'`, `proximaTentativa(tentativas, agora)`, `substituidos(fila, nova): number[]`, `pontoDeTrilhaUtil(accuracy)` (`fila-politica.ts`).
  - `VisitaLocal`, `DiaLocal`, `montarDia(today, fila): DiaLocal` (`dia-local.ts`).
  - `MotivoGps`, `motivoDoErro(code)`, `MENSAGEM_GPS` (`gps-mensagens.ts`); `ErroGps`, `lerPosicao(timeoutMs?)` (`gps.ts`).
  - `DepsMotor`, `drenarCom(deps)` (`fila-motor.ts`); `useFilaStore`, `drenar()`, `enfileirar(acao, consultantId)`, `useFilaRunner(consultantId)` (`use-fila.ts`).
  - `listarFila()`, `adicionarNaFila(item)`, `removerDaFila(seq)`, `atualizarSeExistir(item)` (`fila-idb.ts`); `enviarItem(item)` (`fila.ts`).
  - `campoHoje`, `campoIniciarJornada`, `campoEnviarPontos`, `campoEncerrarJornada`, `campoLugaresPerto`, `campoBuscarLugares`, `campoLugaresParecidos`, `campoCheckin`, `campoSalvarRespostas`, `campoCheckout` (`campo.api.ts`).
  - `useCampoMe()`, `useHojeServidor()`, `useDia(): { dia: DiaLocal; carregando: boolean; hoje: TodayView | undefined }` (`use-campo.ts`); `useRastreio(ativo, consultantId)`; `useOnline()`.
  - `FaixaFila`, `AvisoGps({ motivo, onFechar })`.

- [ ] **Step 1: Instalar o vitest (só dev, versão exata)**

Run: `cd web && yarn add -D --exact vitest@3.2.4`
Expected: `web/package.json` com `"vitest": "3.2.4"` em `devDependencies`.

Em `web/package.json`, em `scripts`, depois de `"typecheck": "tsc --noEmit",`, acrescente:

```json
    "test": "vitest run",
```

Crie `web/vitest.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Só lógica pura do campo (fila offline, dia local, questionário, foto) — sem
// DOM. Um processo só: a máquina do dono trava com paralelismo (CLAUDE.md).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

- [ ] **Step 2: Escrever os testes da lógica pura (falhando)**

Crie `web/src/modules/campo/domain/__tests__/formatos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { duracaoMin, hora, plural } from '../formatos';

describe('formatos do campo', () => {
  it('hora de Brasília, não a do navegador', () => {
    expect(hora('2026-10-08T15:04:00.000Z')).toBe('12:04');
  });

  it('duração em minutos (sem checkout = null)', () => {
    expect(duracaoMin('2026-10-08T15:00:00.000Z', '2026-10-08T15:25:30.000Z')).toBe(26);
    expect(duracaoMin('2026-10-08T15:00:00.000Z', null)).toBeNull();
  });

  it('plural', () => {
    expect(plural(1, 'envio pendente', 'envios pendentes')).toBe('1 envio pendente');
    expect(plural(2, 'envio pendente', 'envios pendentes')).toBe('2 envios pendentes');
  });
});
```

Crie `web/src/modules/campo/domain/__tests__/fila-politica.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ItemFila, VisitAnswers } from '../campo.types';
import { classificar, pontoDeTrilhaUtil, proximaTentativa, substituidos } from '../fila-politica';

const POS = { at: '2026-10-08T15:00:00.000Z', lat: -19.9, lng: -43.9, accuracy: 10 };
const R = {} as VisitAnswers;
const base = { consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 0 };

describe('classificar — o que a fila faz com cada resposta', () => {
  it.each([
    [undefined, undefined, 'rede'],
    [0, undefined, 'rede'],
    [200, undefined, 'ok'],
    [201, undefined, 'ok'],
    [401, 'UNAUTHORIZED', 'sessao'],
    [403, 'PASSWORD_CHANGE_REQUIRED', 'sessao'],
    [403, 'FORBIDDEN', 'regra'],
    [400, 'VALIDATION_ERROR', 'regra'],
    [404, 'NOT_FOUND', 'regra'],
    [409, 'VISIT_ALREADY_OPEN', 'regra'],
    [413, 'FILE_TOO_LARGE', 'regra'],
    [422, 'ANSWERS_INCOMPLETE', 'regra'],
    [408, undefined, 'rede'],
    [429, undefined, 'rede'],
    [502, 'PHOTO_STORAGE_ERROR', 'rede'],
    [503, 'PHOTO_STORAGE_NOT_CONFIGURED', 'rede'],
  ])('%s %s → %s', (status, code, esperado) => {
    expect(classificar(status as number | undefined, code as string | undefined)).toBe(esperado);
  });
});

describe('espera crescente', () => {
  it('2 s, 4 s, 8 s… até 5 min', () => {
    expect(proximaTentativa(0, 1_000)).toBe(3_000);
    expect(proximaTentativa(1, 1_000)).toBe(5_000);
    expect(proximaTentativa(2, 1_000)).toBe(9_000);
    expect(proximaTentativa(20, 1_000)).toBe(301_000);
  });
});

describe('rascunho novo substitui o anterior não enviado da mesma visita', () => {
  const fila: ItemFila[] = [
    { ...base, seq: 1, kind: 'answers', visit_ref: 'v1', payload: R },
    { ...base, seq: 2, kind: 'answers', visit_ref: 'v2', payload: R },
    { ...base, seq: 3, kind: 'end', payload: POS },
  ];

  it('só o rascunho da mesma visita sai', () => {
    expect(substituidos(fila, { kind: 'answers', visit_ref: 'v1', payload: R })).toEqual([1]);
  });

  it('outras ações nunca substituem nada', () => {
    expect(substituidos(fila, { kind: 'checkout', visit_ref: 'v1', payload: POS })).toEqual([]);
  });
});

describe('trilha', () => {
  it('descarta ponto com precisão pior que 100 m', () => {
    expect(pontoDeTrilhaUtil(100)).toBe(true);
    expect(pontoDeTrilhaUtil(101)).toBe(false);
  });
});
```

Crie `web/src/modules/campo/domain/__tests__/dia-local.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ItemFila, TodayView, VisitAnswers, VisitView } from '../campo.types';
import { montarDia } from '../dia-local';

const POS = { at: '2026-10-08T15:00:00.000Z', lat: -19.9, lng: -43.9, accuracy: 10 };
const base = { consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 0 };
const respostas = (freela_status: VisitAnswers['freela_status']) => ({ freela_status }) as VisitAnswers;

const visita = (over: Partial<VisitView>): VisitView =>
  ({
    client_id: 'v1',
    lead_name: 'Bar do Mercado',
    checkin_at: '2026-10-08T14:00:00.000Z',
    checkout_at: null,
    auto_closed: false,
    answers: respostas(null),
    ...over,
  }) as VisitView;

const hoje = (over: Partial<TodayView> = {}): TodayView => ({
  day: '2026-10-08',
  journey: null,
  journeys: [],
  open_visit: null,
  visits: [],
  counters: { visits: 0, cadastrou_qr: 0 },
  ...over,
});

const JORNADA = { client_id: 'j1', started_at: '2026-10-08T12:00:00.000Z' } as TodayView['journey'];

describe('montarDia — o dia como o consultor vê, com a fila por cima', () => {
  it('sem nada: sem jornada', () => {
    expect(montarDia(null, []).jornada).toBeNull();
  });

  it('início guardado sem sinal já mostra a jornada aberta', () => {
    const fila: ItemFila[] = [{ ...base, seq: 1, kind: 'start', payload: { client_id: 'j9', ...POS } }];
    expect(montarDia(hoje(), fila).jornada).toEqual({ client_id: 'j9', started_at: POS.at, pendente: true });
  });

  it('encerrar guardado fecha a jornada que o servidor ainda vê aberta', () => {
    const fila: ItemFila[] = [{ ...base, seq: 1, kind: 'end', payload: POS }];
    expect(montarDia(hoje({ journey: JORNADA }), fila).jornada).toBeNull();
  });

  it('check-in guardado aparece como visita aberta, com o nome do lugar', () => {
    const fila = [
      { ...base, seq: 1, kind: 'checkin', payload: { client_id: 'v9', place_name: 'Bar Novo', ...POS }, foto: new Blob() },
    ] as ItemFila[];
    const dia = montarDia(hoje({ journey: JORNADA }), fila);
    expect(dia.visitaAberta).toMatchObject({ ref: 'v9', nome: 'Bar Novo', pendente: true });
    expect(dia.contadores.visitas).toBe(1);
  });

  it('checkout guardado fecha a visita do servidor; rascunho "cadastrou agora" conta', () => {
    const fila: ItemFila[] = [
      { ...base, seq: 1, kind: 'answers', visit_ref: 'v1', payload: respostas('cadastrou_qr') },
      { ...base, seq: 2, kind: 'checkout', visit_ref: 'v1', payload: POS },
    ];
    const dia = montarDia(hoje({ journey: JORNADA, visits: [visita({})] }), fila);
    expect(dia.visitaAberta).toBeNull();
    expect(dia.visitas[0]).toMatchObject({ ref: 'v1', checkout_at: POS.at, pendente: true, cadastrou_qr: true });
    expect(dia.contadores).toEqual({ visitas: 1, cadastrou_qr: 1 });
  });

  it('visita fechada à meia-noite não é "aberta"', () => {
    const dia = montarDia(hoje({ journey: JORNADA, visits: [visita({ auto_closed: true })] }), []);
    expect(dia.visitaAberta).toBeNull();
  });
});
```

Crie `web/src/modules/campo/domain/__tests__/gps-mensagens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MENSAGEM_GPS, motivoDoErro } from '../gps-mensagens';

describe('GPS negado / indisponível', () => {
  it('códigos do GeolocationPositionError', () => {
    expect(motivoDoErro(1)).toBe('negado');
    expect(motivoDoErro(2)).toBe('indisponivel');
    expect(motivoDoErro(3)).toBe('tempo');
    expect(motivoDoErro(undefined)).toBe('indisponivel');
  });

  it('negado ensina a liberar no iPhone (Safari) e no Android (Chrome)', () => {
    const passos = MENSAGEM_GPS.negado.passos.join(' ');
    expect(MENSAGEM_GPS.negado.titulo).toBe('A localização está bloqueada para este site');
    expect(passos).toContain('Safari');
    expect(passos).toContain('Chrome');
  });

  it('página fora de https explica o motivo', () => {
    expect(MENSAGEM_GPS.inseguro.titulo).toContain('https');
  });
});
```

Crie `web/src/modules/campo/application/__tests__/fila-motor.test.ts`:

```ts
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import type { ItemFila } from '../../domain/campo.types';
import { drenarCom, type DepsMotor } from '../fila-motor';

const POS = { at: '2026-10-08T15:00:00.000Z', lat: -19.9, lng: -43.9, accuracy: 10 };
const item = (seq: number, over: Partial<ItemFila> = {}): ItemFila =>
  ({ seq, kind: 'end', payload: POS, consultant_id: 'c1', tentativas: 0, proxima_em: 0, criado_em: 0, ...over }) as ItemFila;

const erroHttp = (status: number, code: string, message: string) =>
  new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { error: { code, message } },
  } as AxiosResponse);

function deps(fila: ItemFila[], enviar: (i: ItemFila) => Promise<void>, over: Partial<DepsMotor> = {}): DepsMotor {
  return {
    listar: vi.fn(async () => [...fila]),
    remover: vi.fn(async (seq: number) => {
      const i = fila.findIndex((x) => x.seq === seq);
      if (i >= 0) fila.splice(i, 1);
    }),
    atualizar: vi.fn(async (novo: ItemFila) => {
      const i = fila.findIndex((x) => x.seq === novo.seq);
      if (i >= 0) fila[i] = novo;
    }),
    enviar: vi.fn(enviar),
    consultorAtual: () => 'c1',
    online: () => true,
    agora: () => 1_000,
    aoEnviar: vi.fn(),
    aoRecusar: vi.fn(),
    aoPausar: vi.fn(),
    ...over,
  };
}

describe('drenarCom — a fila offline', () => {
  it('envia em ordem e esvazia', async () => {
    const fila = [item(1), item(2)];
    const d = deps(fila, async () => undefined);

    expect(await drenarCom(d)).toBe('vazia');
    expect(vi.mocked(d.enviar).mock.calls.map(([i]) => i.seq)).toEqual([1, 2]);
    expect(fila).toEqual([]);
  });

  it('sem resposta (rede): guarda, espera crescente e NÃO pula para o próximo', async () => {
    const fila = [item(1), item(2)];
    const d = deps(fila, async () => {
      throw new AxiosError('Network Error', 'ERR_NETWORK');
    });

    expect(await drenarCom(d)).toBe('esperando');
    expect(d.enviar).toHaveBeenCalledTimes(1);
    expect(fila[0]).toMatchObject({ seq: 1, tentativas: 1, proxima_em: 3_000 });
    expect(fila).toHaveLength(2);
  });

  it('401 (token de 7 dias venceu, senha trocada): pausa sem apagar nem gastar tentativa; depois do login, envia', async () => {
    const fila = [item(1), item(2)];
    const expirou = deps(fila, async () => {
      throw erroHttp(401, 'UNAUTHORIZED', 'Token inválido ou expirado');
    });

    expect(await drenarCom(expirou)).toBe('sessao');
    expect(fila.map((i) => [i.seq, i.tentativas])).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(expirou.aoPausar).toHaveBeenCalledWith(true);
    expect(expirou.atualizar).not.toHaveBeenCalled();

    const voltou = deps(fila, async () => undefined);
    expect(await drenarCom(voltou)).toBe('vazia');
    expect(voltou.aoPausar).toHaveBeenCalledWith(false);
  });

  it('erro de regra (409/422): tira da fila, mostra a mensagem da API e segue', async () => {
    const fila = [item(1), item(2)];
    let n = 0;
    const d = deps(fila, async () => {
      n += 1;
      if (n === 1) throw erroHttp(409, 'VISIT_ALREADY_OPEN', 'Faça o checkout da visita aberta antes de começar outra.');
    });

    expect(await drenarCom(d)).toBe('vazia');
    expect(d.aoRecusar).toHaveBeenCalledWith('Faça o checkout da visita aberta antes de começar outra.');
    expect(fila).toEqual([]);
  });

  it('sem sinal não envia nada', async () => {
    const d = deps([item(1)], async () => undefined, { online: () => false });
    expect(await drenarCom(d)).toBe('offline');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('item de outro consultor (troca de conta no mesmo celular) fica guardado', async () => {
    const fila = [item(1, { consultant_id: 'c2' })];
    const d = deps(fila, async () => undefined);
    expect(await drenarCom(d)).toBe('vazia');
    expect(d.enviar).not.toHaveBeenCalled();
    expect(fila).toHaveLength(1);
  });

  it('espera não vencida: não tenta antes da hora', async () => {
    const d = deps([item(1, { proxima_em: 5_000 })], async () => undefined);
    expect(await drenarCom(d)).toBe('esperando');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('sem sessão: nada', async () => {
    const d = deps([item(1)], async () => undefined, { consultorAtual: () => null });
    expect(await drenarCom(d)).toBe('sem_sessao');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd web && yarn test`
Expected: FAIL — `Cannot find module '../formatos'` (e os demais módulos).

- [ ] **Step 4: Lógica pura**

Crie `web/src/modules/campo/domain/formatos.ts`:

```ts
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Hora de Brasília ("12:04") — a mesma regra de dia do servidor. */
export const hora = (iso: string): string => HORA.format(new Date(iso));

/** Minutos entre check-in e checkout; sem checkout, `null`. */
export function duracaoMin(inicio: string, fim: string | null): number | null {
  if (!fim) return null;
  return Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000));
}

export const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
```

Crie `web/src/modules/campo/domain/fila-politica.ts`:

```ts
import type { AcaoFila, ItemFila } from './campo.types';

export type Desfecho = 'ok' | 'rede' | 'sessao' | 'regra';

/**
 * O que a fila faz com a resposta de um envio (spec §9):
 * - `rede` (sem resposta, 408, 429, 5xx): guarda e tenta de novo com espera crescente;
 * - `sessao` (401, senha provisória pendente): pausa SEM apagar — sai depois do login;
 * - `regra` (400/403/404/409/413/422): não repete — tira da fila e mostra a mensagem da API.
 */
export function classificar(status: number | undefined, code?: string): Desfecho {
  if (status === undefined || status === 0) return 'rede';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'sessao';
  if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') return 'sessao';
  if (status === 408 || status === 429 || status >= 500) return 'rede';
  return 'regra';
}

export const ESPERA_INICIAL_MS = 2_000;
export const ESPERA_MAXIMA_MS = 5 * 60_000;

/** Próxima tentativa: 2 s, 4 s, 8 s… até 5 min. */
export function proximaTentativa(tentativas: number, agora: number): number {
  return agora + Math.min(ESPERA_INICIAL_MS * 2 ** tentativas, ESPERA_MAXIMA_MS);
}

/**
 * Rascunho novo da mesma visita substitui o anterior ainda na fila: o corpo é o
 * questionário INTEIRO, então só o último importa (sem isso, uma tarde sem sinal
 * enfileiraria um envio por toque).
 */
export function substituidos(fila: ItemFila[], nova: AcaoFila): number[] {
  if (nova.kind !== 'answers') return [];
  return fila
    .filter((i) => i.kind === 'answers' && i.visit_ref === nova.visit_ref && i.seq !== undefined)
    .map((i) => i.seq as number);
}

/** Ponto de trilha com precisão pior que 100 m é descartado (spec §7). */
export const PRECISAO_MAXIMA_TRILHA_M = 100;
export const pontoDeTrilhaUtil = (accuracy: number): boolean => accuracy <= PRECISAO_MAXIMA_TRILHA_M;
```

Crie `web/src/modules/campo/domain/dia-local.ts`:

```ts
import type { ItemFila, TodayView } from './campo.types';

export interface VisitaLocal {
  /** `client_id` da visita — é como a fila e as rotas `/campo/visita/[ref]` a conhecem. */
  ref: string;
  nome: string;
  checkin_at: string;
  checkout_at: string | null;
  auto_closed: boolean;
  cadastrou_qr: boolean;
  /** Ainda tem envio na fila. */
  pendente: boolean;
}

export interface DiaLocal {
  jornada: { client_id: string; started_at: string; pendente: boolean } | null;
  visitas: VisitaLocal[];
  visitaAberta: VisitaLocal | null;
  contadores: { visitas: number; cadastrou_qr: number };
}

/**
 * O dia como o consultor vê: o último retrato do servidor (`/today`) com as
 * ações ainda na fila por cima — sem sinal, a tela anda igual.
 */
export function montarDia(today: TodayView | null, fila: ItemFila[]): DiaLocal {
  let jornada: DiaLocal['jornada'] = today?.journey
    ? { client_id: today.journey.client_id, started_at: today.journey.started_at, pendente: false }
    : null;
  const visitas: VisitaLocal[] = (today?.visits ?? []).map((v) => ({
    ref: v.client_id,
    nome: v.lead_name,
    checkin_at: v.checkin_at,
    checkout_at: v.checkout_at,
    auto_closed: v.auto_closed,
    cadastrou_qr: v.answers.freela_status === 'cadastrou_qr',
    pendente: false,
  }));
  const achar = (ref: string) => visitas.find((v) => v.ref === ref);

  for (const item of [...fila].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    switch (item.kind) {
      case 'start':
        if (jornada?.client_id !== item.payload.client_id) {
          jornada = { client_id: item.payload.client_id, started_at: item.payload.at, pendente: true };
        }
        break;
      case 'end':
        jornada = null;
        break;
      case 'checkin':
        if (!achar(item.payload.client_id)) {
          visitas.push({
            ref: item.payload.client_id,
            nome: item.payload.place_name,
            checkin_at: item.payload.at,
            checkout_at: null,
            auto_closed: false,
            cadastrou_qr: false,
            pendente: true,
          });
        }
        break;
      case 'answers': {
        const v = achar(item.visit_ref);
        if (v) v.cadastrou_qr = item.payload.freela_status === 'cadastrou_qr';
        break;
      }
      case 'checkout': {
        const v = achar(item.visit_ref);
        if (v && !v.checkout_at) {
          v.checkout_at = item.payload.at;
          v.pendente = true;
        }
        break;
      }
      case 'points':
        break;
    }
  }

  const visitaAberta = [...visitas].reverse().find((v) => !v.checkout_at && !v.auto_closed) ?? null;
  return {
    jornada,
    visitas,
    visitaAberta,
    contadores: { visitas: visitas.length, cadastrou_qr: visitas.filter((v) => v.cadastrou_qr).length },
  };
}
```

Crie `web/src/modules/campo/domain/gps-mensagens.ts`:

```ts
export type MotivoGps = 'negado' | 'indisponivel' | 'tempo' | 'sem_suporte' | 'inseguro';

/** `GeolocationPositionError.code` → motivo. */
export function motivoDoErro(code: number | undefined): MotivoGps {
  if (code === 1) return 'negado';
  if (code === 3) return 'tempo';
  return 'indisponivel';
}

/** GPS negado → a ação não acontece e a tela ensina a liberar (spec §9). */
export const MENSAGEM_GPS: Record<MotivoGps, { titulo: string; passos: string[] }> = {
  negado: {
    titulo: 'A localização está bloqueada para este site',
    passos: [
      'iPhone (Safari): Ajustes → Privacidade e Segurança → Serviços de Localização → Safari → "Ao Usar o App". Depois, no Safari, toque em "aA" na barra de endereço → Ajustes do Site → Localização → Permitir.',
      'Android (Chrome): toque no cadeado ao lado do endereço → Permissões → Localização → Permitir.',
      'Depois, recarregue esta página e tente de novo.',
    ],
  },
  indisponivel: {
    titulo: 'Não foi possível achar sua localização',
    passos: ['Confira se a localização do celular está ligada.', 'Vá para um lugar aberto e tente de novo.'],
  },
  tempo: {
    titulo: 'A localização demorou demais para responder',
    passos: ['Tente de novo em alguns segundos, de preferência fora de prédios.'],
  },
  sem_suporte: {
    titulo: 'Este navegador não informa a localização',
    passos: ['Abra esta página no Safari (iPhone) ou no Chrome (Android).'],
  },
  inseguro: {
    titulo: 'A localização só funciona em endereço seguro (https)',
    passos: ['Abra o Praça Campo pelo endereço com https:// que a equipe mandou.'],
  },
};
```

- [ ] **Step 5: Motor da fila (puro, com dependências injetadas)**

Crie `web/src/modules/campo/application/fila-motor.ts`:

```ts
import axios from 'axios';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import type { ItemFila } from '../domain/campo.types';
import { classificar, proximaTentativa } from '../domain/fila-politica';

/** Tudo o que o motor toca, injetado — é o que deixa a fila testável sem IndexedDB nem rede. */
export interface DepsMotor {
  listar: () => Promise<ItemFila[]>;
  remover: (seq: number) => Promise<void>;
  /** Regrava o item SÓ se ele ainda existir (um rascunho novo pode tê-lo substituído no meio do envio). */
  atualizar: (item: ItemFila) => Promise<void>;
  enviar: (item: ItemFila) => Promise<void>;
  consultorAtual: () => string | null;
  online: () => boolean;
  agora: () => number;
  aoEnviar: (item: ItemFila) => void;
  aoRecusar: (mensagem: string) => void;
  aoPausar: (pausada: boolean) => void;
}

export type ResultadoDrenagem = 'vazia' | 'esperando' | 'offline' | 'sessao' | 'sem_sessao';

function lerFalha(e: unknown): { status?: number; code?: string } {
  if (!axios.isAxiosError(e)) return {};
  const corpo = e.response?.data as { error?: { code?: string } } | undefined;
  return { status: e.response?.status, code: corpo?.error?.code };
}

/**
 * Envia a fila do consultor logado EM ORDEM (spec §9). Para no primeiro item
 * que não saiu: a ordem importa (o checkout não pode passar na frente do check-in).
 */
export async function drenarCom(d: DepsMotor): Promise<ResultadoDrenagem> {
  const consultor = d.consultorAtual();
  if (!consultor) return 'sem_sessao';
  for (;;) {
    if (!d.online()) return 'offline';
    const cabeca = (await d.listar()).find((i) => i.consultant_id === consultor);
    if (!cabeca) return 'vazia';
    if (cabeca.proxima_em > d.agora()) return 'esperando';

    let falha: unknown = null;
    try {
      await d.enviar(cabeca);
    } catch (e) {
      falha = e;
    }
    const { status, code } = falha ? lerFalha(falha) : { status: 200, code: undefined };
    const desfecho = classificar(status, code);

    if (desfecho === 'ok' || desfecho === 'regra') {
      await d.remover(cabeca.seq as number);
      if (desfecho === 'regra') d.aoRecusar(apiErrorMessage(falha, 'Um envio foi recusado pelo servidor.'));
      d.aoPausar(false);
      d.aoEnviar(cabeca);
      continue;
    }
    if (desfecho === 'sessao') {
      // Nada é apagado nem conta tentativa: o axios do campo já mandou para
      // /campo/entrar, e depois do login a fila sai com o token novo.
      d.aoPausar(true);
      return 'sessao';
    }
    await d.atualizar({
      ...cabeca,
      tentativas: cabeca.tentativas + 1,
      proxima_em: proximaTentativa(cabeca.tentativas, d.agora()),
    });
    return 'esperando';
  }
}
```

- [ ] **Step 6: Rodar os testes e ver passar**

Run: `cd web && yarn test`
Expected: PASS (formatos, fila-politica, dia-local, gps-mensagens, fila-motor).

- [ ] **Step 7: IndexedDB, GPS, API e o envio de cada ação**

Crie `web/src/modules/campo/infrastructure/fila-idb.ts`:

```ts
/**
 * Fila offline no IndexedDB (spec §9) — wrapper mínimo, sem biblioteca. A chave
 * `seq` é autoincremento: é ela que dá a ordem de envio. O arquivo da foto do
 * check-in vai junto, como Blob.
 */
import type { ItemFila } from '../domain/campo.types';

const BANCO = 'praca-campo';
const LOJA = 'fila';
const VERSAO = 1;

let aberto: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!aberto) {
    aberto = new Promise((resolve, reject) => {
      const req = indexedDB.open(BANCO, VERSAO);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(LOJA)) {
          req.result.createObjectStore(LOJA, { keyPath: 'seq', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        aberto = null;
        reject(req.error);
      };
    });
  }
  return aberto;
}

async function loja(modo: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await abrir()).transaction(LOJA, modo).objectStore(LOJA);
}

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function listarFila(): Promise<ItemFila[]> {
  return pedido((await loja('readonly')).getAll() as IDBRequest<ItemFila[]>);
}

export async function adicionarNaFila(item: ItemFila): Promise<number> {
  return Number(await pedido((await loja('readwrite')).add(item)));
}

export async function removerDaFila(seq: number): Promise<void> {
  await pedido((await loja('readwrite')).delete(seq));
}

/** `get` + `put` na MESMA transação, em callbacks (o Safari fecha a transação entre `await`s). */
export async function atualizarSeExistir(item: ItemFila): Promise<void> {
  const s = await loja('readwrite');
  await new Promise<void>((resolve, reject) => {
    const g = s.get(item.seq as number);
    g.onsuccess = () => {
      if (!g.result) return resolve();
      const p = s.put(item);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    };
    g.onerror = () => reject(g.error);
  });
}
```

Crie `web/src/modules/campo/infrastructure/gps.ts`:

```ts
import type { Posicao } from '../domain/campo.types';
import { motivoDoErro, type MotivoGps } from '../domain/gps-mensagens';

export class ErroGps extends Error {
  constructor(readonly motivo: MotivoGps) {
    super(motivo);
  }
}

/** Posição agora, com a hora REAL da ação (não a do último fix do GPS). */
export function lerPosicao(timeoutMs = 20_000): Promise<Posicao> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) return reject(new ErroGps('inseguro'));
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return reject(new ErroGps('sem_suporte'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          at: new Date().toISOString(),
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Math.round(p.coords.accuracy),
        }),
      (e) => reject(new ErroGps(motivoDoErro(e.code))),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
```

Em `web/src/modules/campo/infrastructure/campo.api.ts`, troque o import de tipos por

```ts
import type {
  CampoLoginResponse,
  CampoMeResponse,
  CheckinPayload,
  JourneyView,
  PlaceView,
  Posicao,
  TodayView,
  VisitAnswers,
  VisitView,
} from '../domain/campo.types';
```

e acrescente no fim:

```ts
export async function campoHoje(): Promise<TodayView> {
  const { data } = await campoApi.get('/v1/campo/today');
  return data as TodayView;
}

export async function campoIniciarJornada(p: { client_id: string } & Posicao): Promise<JourneyView> {
  const { data } = await campoApi.post('/v1/campo/journeys/start', p);
  return data as JourneyView;
}

export async function campoEnviarPontos(
  points: ({ client_id: string } & Posicao)[],
): Promise<{ accepted: number; duplicates: number }> {
  const { data } = await campoApi.post('/v1/campo/journeys/current/points', { points });
  return data as { accepted: number; duplicates: number };
}

export async function campoEncerrarJornada(p: Posicao): Promise<JourneyView> {
  const { data } = await campoApi.post('/v1/campo/journeys/current/end', p);
  return data as JourneyView;
}

export async function campoLugaresPerto(lat: number, lng: number): Promise<PlaceView[]> {
  const { data } = await campoApi.get('/v1/campo/places', { params: { lat, lng } });
  return data as PlaceView[];
}

export async function campoBuscarLugares(q: string): Promise<PlaceView[]> {
  const { data } = await campoApi.get('/v1/campo/places', { params: { q } });
  return data as PlaceView[];
}

export async function campoLugaresParecidos(name: string, lat: number, lng: number): Promise<PlaceView[]> {
  const { data } = await campoApi.get('/v1/campo/places/similar', { params: { name, lat, lng } });
  return data as PlaceView[];
}

/** Multipart: campos + foto. `place_name` é só da tela e não vai. Foto em rede ruim: 2 min de prazo. */
export async function campoCheckin(p: CheckinPayload, foto: Blob): Promise<VisitView> {
  const form = new FormData();
  form.append('client_id', p.client_id);
  form.append('at', p.at);
  form.append('lat', String(p.lat));
  form.append('lng', String(p.lng));
  form.append('accuracy', String(p.accuracy));
  if (p.lead_id) form.append('lead_id', p.lead_id);
  if (p.new_place) form.append('new_place', JSON.stringify(p.new_place));
  if (p.confirm_new !== undefined) form.append('confirm_new', String(p.confirm_new));
  form.append('photo', foto, 'fachada.jpg');
  const { data } = await campoApi.post('/v1/campo/visits', form, { timeout: 120_000 });
  return data as VisitView;
}

export async function campoSalvarRespostas(ref: string, respostas: VisitAnswers): Promise<VisitView> {
  const { data } = await campoApi.patch(`/v1/campo/visits/${ref}/answers`, respostas);
  return data as VisitView;
}

export async function campoCheckout(ref: string, p: Posicao): Promise<VisitView> {
  const { data } = await campoApi.post(`/v1/campo/visits/${ref}/checkout`, p);
  return data as VisitView;
}
```

Crie `web/src/modules/campo/infrastructure/fila.ts`:

```ts
import type { ItemFila } from '../domain/campo.types';
import {
  campoCheckin,
  campoCheckout,
  campoEncerrarJornada,
  campoEnviarPontos,
  campoIniciarJornada,
  campoSalvarRespostas,
} from './campo.api';

/** Um item da fila vira uma chamada — o servidor é idempotente por `client_id` (reenvio não duplica). */
export async function enviarItem(item: ItemFila): Promise<void> {
  switch (item.kind) {
    case 'start':
      await campoIniciarJornada(item.payload);
      return;
    case 'points':
      await campoEnviarPontos(item.payload.points);
      return;
    case 'checkin':
      await campoCheckin(item.payload, item.foto);
      return;
    case 'answers':
      await campoSalvarRespostas(item.visit_ref, item.payload);
      return;
    case 'checkout':
      await campoCheckout(item.visit_ref, item.payload);
      return;
    case 'end':
      await campoEncerrarJornada(item.payload);
      return;
  }
}
```

- [ ] **Step 8: Ganchos (fila, dia, rastreio, sinal)**

Crie `web/src/modules/campo/application/use-online.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';

function assinar(aviso: () => void) {
  window.addEventListener('online', aviso);
  window.addEventListener('offline', aviso);
  return () => {
    window.removeEventListener('online', aviso);
    window.removeEventListener('offline', aviso);
  };
}

/** `navigator.onLine` reativo. */
export const useOnline = (): boolean =>
  useSyncExternalStore(assinar, () => navigator.onLine, () => true);
```

Crie `web/src/modules/campo/application/use-fila.ts`:

```ts
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { AcaoFila, ItemFila } from '../domain/campo.types';
import { substituidos } from '../domain/fila-politica';
import { getCampoSession } from '../infrastructure/campo-session.storage';
import { enviarItem } from '../infrastructure/fila';
import { adicionarNaFila, atualizarSeExistir, listarFila, removerDaFila } from '../infrastructure/fila-idb';
import { drenarCom } from './fila-motor';

interface FilaState {
  /** Itens do consultor logado ainda no aparelho (a faixa e o dia local leem daqui). */
  itens: ItemFila[];
  erros: { id: number; texto: string }[];
  pausada: boolean;
  setItens: (itens: ItemFila[]) => void;
  addErro: (texto: string) => void;
  removerErro: (id: number) => void;
  setPausada: (pausada: boolean) => void;
}

let proximoErro = 1;

export const useFilaStore = create<FilaState>((set) => ({
  itens: [],
  erros: [],
  pausada: false,
  setItens: (itens) => set({ itens }),
  addErro: (texto) => set((s) => ({ erros: [...s.erros, { id: proximoErro++, texto }] })),
  removerErro: (id) => set((s) => ({ erros: s.erros.filter((e) => e.id !== id) })),
  setPausada: (pausada) => set({ pausada }),
}));

async function recarregar(): Promise<void> {
  const consultor = getCampoSession()?.consultant.id;
  const itens = consultor ? (await listarFila()).filter((i) => i.consultant_id === consultor) : [];
  useFilaStore.getState().setItens(itens);
}

let aoEnviar: (() => void) | null = null;
let drenando: Promise<void> | null = null;

/** Uma drenagem por vez; quem chamar no meio recebe a que já está andando. */
export function drenar(): Promise<void> {
  if (drenando) return drenando;
  const loja = useFilaStore.getState();
  drenando = drenarCom({
    listar: listarFila,
    remover: removerDaFila,
    atualizar: atualizarSeExistir,
    enviar: enviarItem,
    consultorAtual: () => getCampoSession()?.consultant.id ?? null,
    online: () => navigator.onLine,
    agora: () => Date.now(),
    aoEnviar: () => {
      aoEnviar?.();
      void recarregar();
    },
    aoRecusar: (mensagem) => loja.addErro(mensagem),
    aoPausar: (pausada) => loja.setPausada(pausada),
  })
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      drenando = null;
      void recarregar();
    });
  return drenando;
}

/** Toda ação do consultor passa por aqui — com sinal, sai na hora; sem sinal, espera. */
export async function enfileirar(acao: AcaoFila, consultantId: string): Promise<void> {
  const fila = (await listarFila()).filter((i) => i.consultant_id === consultantId);
  for (const seq of substituidos(fila, acao)) await removerDaFila(seq);
  await adicionarNaFila({ ...acao, consultant_id: consultantId, tentativas: 0, proxima_em: 0, criado_em: Date.now() });
  await recarregar();
  // Duas voltas: se uma drenagem já estava terminando, a segunda pega o item novo.
  void drenar().then(() => drenar());
}

/** Montado uma vez, no layout das telas do consultor. */
export function useFilaRunner(consultantId: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!consultantId) return;
    aoEnviar = () => void queryClient.invalidateQueries({ queryKey: ['campo', 'today'] });
    void recarregar();
    void drenar();
    const aoVoltarOSinal = () => void drenar();
    window.addEventListener('online', aoVoltarOSinal);
    const relogio = window.setInterval(() => void drenar(), 15_000);
    return () => {
      window.removeEventListener('online', aoVoltarOSinal);
      window.clearInterval(relogio);
      aoEnviar = null;
    };
  }, [consultantId, queryClient]);
}
```

Crie `web/src/modules/campo/application/use-campo.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { todaySp } from '@/lib/dates';
import type { CampoMeResponse, TodayView } from '../domain/campo.types';
import { montarDia, type DiaLocal } from '../domain/dia-local';
import { campoHoje, campoMe } from '../infrastructure/campo.api';
import { getSnapshot, setSnapshot } from '../infrastructure/campo-session.storage';
import { useCampoSession } from './campo-session.store';
import { useFilaStore } from './use-fila';
import { useOnline } from './use-online';

/**
 * `/me` com retrato local: o QR code precisa abrir mesmo sem sinal. O que volta
 * do servidor é escrito na sessão (inclusive `must_change_password`).
 */
export function useCampoMe() {
  const setConsultant = useCampoSession((s) => s.setConsultant);
  const query = useQuery({
    queryKey: ['campo', 'me'],
    queryFn: async () => {
      const r = await campoMe();
      setSnapshot('me', r);
      return r;
    },
    initialData: () => getSnapshot<CampoMeResponse>('me') ?? undefined,
    initialDataUpdatedAt: 0,
  });
  useEffect(() => {
    if (query.data) setConsultant(query.data.consultant);
  }, [query.data, setConsultant]);
  return query;
}

/** `/today` com retrato local — só vale o retrato de HOJE (Brasília). */
export function useHojeServidor() {
  return useQuery({
    queryKey: ['campo', 'today'],
    queryFn: async () => {
      const r = await campoHoje();
      setSnapshot('today', r);
      return r;
    },
    initialData: () => {
      const r = getSnapshot<TodayView>('today');
      return r && r.day === todaySp() ? r : undefined;
    },
    initialDataUpdatedAt: 0,
    refetchInterval: 60_000,
  });
}

/**
 * O dia na tela: servidor + fila por cima. Sem sinal e sem retrato de hoje, não
 * fica "Carregando…" para sempre: a tela anda só com a fila.
 */
export function useDia(): { dia: DiaLocal; carregando: boolean; hoje: TodayView | undefined } {
  const hoje = useHojeServidor();
  const itens = useFilaStore((s) => s.itens);
  const online = useOnline();
  const dia = useMemo(() => montarDia(hoje.data ?? null, itens), [hoje.data, itens]);
  return { dia, carregando: online && hoje.isPending && !hoje.data, hoje: hoje.data };
}
```

Crie `web/src/modules/campo/application/use-rastreio.ts`:

```ts
'use client';

import { useEffect } from 'react';
import { pontoDeTrilhaUtil } from '../domain/fila-politica';
import { lerPosicao } from '../infrastructure/gps';
import { enfileirar } from './use-fila';

const CINCO_MIN = 5 * 60_000;

/**
 * Trilha a cada 5 min ENQUANTO a página está aberta e a jornada está aberta
 * (spec §2.2 e §11): com a tela apagada o navegador para, e antes de "Iniciar"
 * ou depois de "Encerrar" nada é coletado. Precisão pior que 100 m é descartada.
 */
export function useRastreio(ativo: boolean, consultantId: string | null): void {
  useEffect(() => {
    if (!ativo || !consultantId) return;
    const relogio = window.setInterval(async () => {
      try {
        const p = await lerPosicao(15_000);
        if (!pontoDeTrilhaUtil(p.accuracy)) return;
        await enfileirar({ kind: 'points', payload: { points: [{ client_id: crypto.randomUUID(), ...p }] } }, consultantId);
      } catch {
        // GPS falhou nesta volta: a próxima tenta de novo.
      }
    }, CINCO_MIN);
    return () => window.clearInterval(relogio);
  }, [ativo, consultantId]);
}
```

- [ ] **Step 9: Componentes e a tela de hoje**

Crie `web/src/components/campo/FaixaFila.tsx`:

```tsx
'use client';

import { useFilaStore } from '@/modules/campo/application/use-fila';
import { useOnline } from '@/modules/campo/application/use-online';
import { plural } from '@/modules/campo/domain/formatos';

/** "2 envios pendentes — enviando quando voltar o sinal" + os envios recusados (spec §8.1 e §9). */
export function FaixaFila() {
  const itens = useFilaStore((s) => s.itens);
  const erros = useFilaStore((s) => s.erros);
  const pausada = useFilaStore((s) => s.pausada);
  const removerErro = useFilaStore((s) => s.removerErro);
  const online = useOnline();

  if (itens.length === 0 && erros.length === 0) return null;
  const situacao = !online ? 'enviando quando voltar o sinal' : pausada ? 'entre de novo para enviar' : 'enviando…';

  return (
    <div className="space-y-2">
      {itens.length > 0 && (
        <div role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          {plural(itens.length, 'envio pendente', 'envios pendentes')} — {situacao}
        </div>
      )}
      {erros.map((e) => (
        <div key={e.id} role="alert" className="flex items-start justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <span>{e.texto}</span>
          <button onClick={() => removerErro(e.id)} aria-label="Dispensar aviso" className="text-lg leading-none">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

Crie `web/src/components/campo/AvisoGps.tsx`:

```tsx
'use client';

import { MENSAGEM_GPS, type MotivoGps } from '@/modules/campo/domain/gps-mensagens';

/** GPS negado/indisponível: a ação NÃO aconteceu, e a tela diz como liberar. */
export function AvisoGps({ motivo, onFechar }: { motivo: MotivoGps; onFechar: () => void }) {
  const m = MENSAGEM_GPS[motivo];
  return (
    <div className="rounded-md border border-danger/50 bg-danger/10 p-4 text-sm">
      <p className="font-bold">{m.titulo}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {m.passos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <button onClick={onFechar} className="mt-3 text-xs underline">
        Entendi
      </button>
    </div>
  );
}
```

Substitua `web/src/app/campo/(sessao)/layout.tsx` por:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { useFilaRunner } from '@/modules/campo/application/use-fila';
import { useRastreio } from '@/modules/campo/application/use-rastreio';

/** Fila, `/me` e trilha rodam enquanto qualquer tela do consultor estiver aberta. */
function CampoMotor({ consultantId }: { consultantId: string }) {
  useFilaRunner(consultantId);
  useCampoMe();
  const { dia } = useDia();
  useRastreio(!!dia.jornada, consultantId);
  return null;
}

/**
 * Guarda das telas do consultor (mesma regra do `(app)/layout.tsx` da equipe:
 * a página nem monta sem sessão). Senha provisória pendente → `/campo/senha`.
 */
export default function CampoSessaoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const pendente = session?.consultant.must_change_password ?? false;

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace('/campo/entrar');
    else if (pendente) router.replace('/campo/senha');
  }, [hydrated, session, pendente, router]);

  if (!hydrated || !session || pendente) {
    return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-36 pt-4">
      <CampoMotor consultantId={session.consultant.id} />
      {children}
    </div>
  );
}
```

Substitua `web/src/app/campo/(sessao)/page.tsx` por:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { Button } from '@/components/ui/button';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useDia } from '@/modules/campo/application/use-campo';
import { enfileirar } from '@/modules/campo/application/use-fila';
import type { Posicao } from '@/modules/campo/domain/campo.types';
import { duracaoMin, hora } from '@/modules/campo/domain/formatos';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';

/** Tela de hoje do consultor (spec §8.1): iniciar/encerrar, visitas do dia, contadores, QR a um toque. */
export default function HojeCampoPage() {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { dia, carregando } = useDia();
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function comPosicao(acao: (p: Posicao) => Promise<void>) {
    setGps(null);
    setOcupado(true);
    try {
      await acao(await lerPosicao());
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível guardar a ação neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  const iniciar = () =>
    comPosicao((p) => enfileirar({ kind: 'start', payload: { client_id: crypto.randomUUID(), ...p } }, consultantId));

  const encerrar = () => {
    if (!window.confirm('Encerrar a jornada de hoje? A localização para de ser registrada.')) return;
    void comPosicao((p) => enfileirar({ kind: 'end', payload: p }, consultantId));
  };

  return (
    <main className="space-y-5">
      <CampoTopo titulo="Hoje" />
      <FaixaFila />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !dia.jornada ? (
        <section className="card-surface space-y-2 p-5">
          <p className="text-base font-bold">Pronto para sair?</p>
          <p className="text-sm text-muted-foreground">
            A localização só é registrada com a jornada aberta: no início, a cada 5 minutos com esta tela
            aberta, em cada check-in e checkout e no fim. Antes de iniciar e depois de encerrar, nada é
            registrado.
          </p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <div className="card-surface p-4">
              <p className="text-3xl font-black">{dia.contadores.visitas}</p>
              <p className="text-xs text-muted-foreground">{dia.contadores.visitas === 1 ? 'visita hoje' : 'visitas hoje'}</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-3xl font-black">{dia.contadores.cadastrou_qr}</p>
              <p className="text-xs text-muted-foreground">cadastrou agora</p>
            </div>
          </section>

          {dia.visitaAberta ? (
            <Link
              href={`/campo/visita/${dia.visitaAberta.ref}`}
              className="flex h-14 items-center justify-center rounded-md bg-primary px-4 text-center text-base font-bold text-primary-foreground"
            >
              Continuar visita: {dia.visitaAberta.nome}
            </Link>
          ) : (
            <Link
              href="/campo/visita/nova"
              className="flex h-14 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground"
            >
              Nova visita
            </Link>
          )}

          <section>
            <h2 className="tag text-muted-foreground">Visitas de hoje</h2>
            {dia.visitas.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma visita ainda.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {[...dia.visitas].reverse().map((v) => {
                  const min = duracaoMin(v.checkin_at, v.checkout_at);
                  return (
                    <li key={v.ref} className="card-surface flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="font-bold">{v.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {hora(v.checkin_at)}
                          {min !== null ? ` · ${min} min` : ''}
                          {v.cadastrou_qr ? ' · cadastrou agora' : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[11px]">
                        {v.auto_closed && <span className="rounded-sm bg-danger/15 px-1.5 py-0.5 text-danger">sem checkout</span>}
                        {!v.checkout_at && !v.auto_closed && (
                          <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-primary">aberta</span>
                        )}
                        {v.pendente && <span className="text-muted-foreground">aguardando envio</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3">
          <Link href="/campo/qr" className="flex h-14 w-28 items-center justify-center rounded-md border border-border text-sm font-bold">
            QR code
          </Link>
          {!dia.jornada ? (
            <Button onClick={() => void iniciar()} disabled={ocupado || carregando} className="h-14 flex-1 text-base">
              {ocupado ? 'Pegando a localização…' : 'Iniciar jornada'}
            </Button>
          ) : (
            <Button variant="outline" onClick={encerrar} disabled={ocupado || !!dia.visitaAberta} className="h-14 flex-1 text-base">
              Encerrar jornada
            </Button>
          )}
        </div>
        {dia.jornada && dia.visitaAberta && (
          <p className="mx-auto mt-2 max-w-md text-center text-[11px] text-muted-foreground">
            Faça o checkout da visita aberta para encerrar.
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 10: Browser-check — jornada, GPS negado e fila sem sinal (escrever)**

Em `web/scripts/browser-check.mjs`, dentro do `try` do bloco "13. Campo", logo depois de `check('e volta para o campo com a sessão dele', …);`, acrescente:

```js
  console.log('-- Campo: GPS negado --');
  const semGpsCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  try {
    // Negação determinística (o "perguntar" do headless varia por versão).
    await semGpsCtx.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, erro) =>
        erro?.({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    });
    const sg = await semGpsCtx.newPage();
    vigiar(sg, 'campo-sem-gps');
    await sg.goto(`${BASE}/campo/entrar`, { waitUntil: 'networkidle' });
    await sg.locator('#email').fill(CAMPO_EMAIL);
    await sg.locator('#senha').fill(CAMPO_SENHA_NOVA);
    await sg.getByRole('button', { name: 'Entrar', exact: true }).click();
    await sg.waitForURL(/\/campo$/, { timeout: 20000 });
    await sg.getByRole('button', { name: 'Iniciar jornada' }).click();
    await sg.getByText('A localização está bloqueada para este site').waitFor({ timeout: 15000 });
    const aviso = await corpo(sg);
    check('GPS negado: a tela ensina a liberar no iPhone e no Android', aviso.includes('safari') && aviso.includes('chrome'));
    check('GPS negado: nada foi registrado', (await situacaoCampo())?.status === 'nao_iniciou');
  } finally {
    await semGpsCtx.close();
  }

  console.log('-- Campo: jornada --');
  check('aviso de privacidade antes de iniciar', (await corpo(cel)).includes('a localização só é registrada com a jornada aberta'));
  await cel.getByRole('button', { name: 'Iniciar jornada' }).click();
  await cel.getByRole('button', { name: 'Encerrar jornada' }).waitFor({ timeout: 15000 });
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 20000 });
  check('equipe vê o consultor em jornada', (await situacaoCampo())?.status === 'em_jornada');

  // ── campo: visitas (Task 11 entra AQUI, antes de encerrar) ──

  console.log('-- Campo: encerrar sem sinal (fila offline) --');
  offline = true;
  await celularCtx.setOffline(true);
  cel.once('dialog', (d) => void d.accept());
  await cel.getByRole('button', { name: 'Encerrar jornada' }).click();
  await cel.getByText('1 envio pendente').waitFor({ timeout: 15000 });
  check('sem sinal: a faixa avisa que envia quando o sinal voltar', (await corpo(cel)).includes('enviando quando voltar o sinal'));
  check('sem sinal: a jornada continua aberta no servidor', (await situacaoCampo())?.status === 'em_jornada');
  await celularCtx.setOffline(false);
  offline = false;
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });
  check('sinal de volta: a fila enviou o encerramento', (await situacaoCampo())?.status === 'encerrou');
```

- [ ] **Step 11: Rodar o browser-check e ver passar**

Nada mais de pé; suba a API (`npm run start:smoke`) e o web (`yarn dev`) em segundo plano, como na Task 9.

Run: `cd /home/doutor/coding/freela/praca/web && yarn browser-check`
Expected: as novas checagens "GPS negado", "jornada" e "encerrar sem sinal" verdes; nenhum erro de console/HTTP; limpeza sem resíduo.

Mate os dois processos e confirme `ss -ltn | grep -E ':(3014|3024) '` vazio. Depois, um de cada vez: `cd web && yarn test` (PASS), `yarn typecheck` (sem erro), `yarn lint` (sem erro).

- [ ] **Step 12: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add web/package.json web/yarn.lock web/vitest.config.ts web/src/modules/campo web/src/components/campo web/src/app/campo web/scripts/browser-check.mjs
git commit -m "feat(web/campo): tela de hoje, jornada com GPS e fila offline no IndexedDB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 11: Web do consultor — nova visita (lugar, foto, check-in), questionário, QR code e checkout

**Files:**
- Create: `web/src/modules/campo/domain/questionario.ts`, `web/src/modules/campo/domain/foto.ts`
- Test: `web/src/modules/campo/domain/__tests__/questionario.test.ts`, `web/src/modules/campo/domain/__tests__/foto.test.ts`
- Create: `web/src/modules/campo/infrastructure/foto-compressao.ts`, `web/src/modules/campo/application/use-foto-url.ts`
- Modify: `web/src/modules/campo/infrastructure/campo.api.ts` (acrescenta `campoFotoVisita`)
- Create: `web/src/components/campo/Questionario.tsx`, `web/src/components/campo/QrDoFreela.tsx`
- Create: `web/src/app/campo/(sessao)/qr/page.tsx`, `web/src/app/campo/(sessao)/visita/nova/page.tsx`, `web/src/app/campo/(sessao)/visita/[ref]/page.tsx`
- Modify: `web/package.json` (`qrcode.react@4.2.0`), `web/scripts/browser-check.mjs` (no marcador "Task 11 entra AQUI")

**Interfaces:**
- Consumes: `VisitAnswers`, `PlaceView`, `ItemFila`, `Posicao` (`campo.types.ts`, Task 9); `campoApi` (Task 9); `campoLugaresPerto`, `campoBuscarLugares`, `campoLugaresParecidos` (Task 10); `enfileirar`, `useFilaStore` (Task 10); `useDia`, `useCampoMe` (Task 10); `lerPosicao`, `ErroGps` (Task 10); `AvisoGps`, `FaixaFila`, `CampoTopo` (Tasks 9–10); `todaySp` (`web/src/lib/dates.ts`); rotas `POST /v1/campo/visits`, `PATCH …/answers`, `POST …/checkout`, `GET …/photo` (Task 6).
- Produces:
  - `RESPOSTAS_VAZIAS: VisitAnswers`, `FUNCOES_VAGA: readonly string[]`, `faltando(r: VisitAnswers, hoje: string): string[]` (`questionario.ts` — espelho do `faltando` do servidor, mesma ordem e mesmos rótulos).
  - `LADO_MAXIMO_PX = 1600`, `QUALIDADE_JPEG = 0.75`, `TETO_FOTO_BYTES = 5 * 1024 * 1024`, `TIPOS_ACEITOS`, `dimensoesReduzidas(w, h): { largura: number; altura: number }`, `escolherEnvio(original: { tipo: string; bytes: number }, reduzida: { bytes: number } | null): { usar: 'reduzida' | 'original' } | { erro: string }` (`foto.ts`).
  - `prepararFoto(arquivo: File): Promise<Blob>` (`foto-compressao.ts`).
  - `campoFotoVisita(ref: string): Promise<Blob>` (`campo.api.ts`).
  - `useFotoUrl(ref: string): string | null` (`use-foto-url.ts`).
  - `Questionario({ valor, canais, onMudar, desabilitado })`, `QrDoFreela({ url, tamanho? })`.
  - Rotas web: `/campo/qr`, `/campo/visita/nova`, `/campo/visita/[ref]` (`ref` = `client_id` da visita).

- [ ] **Step 1: Instalar o gerador de QR (versão exata)**

Run: `cd /home/doutor/coding/freela/praca/web && yarn add qrcode.react@4.2.0`
Expected: `web/package.json` com `"qrcode.react": "4.2.0"` e `yarn.lock` atualizado. Nada mais de pé.

- [ ] **Step 2: Escrever os testes da lógica pura (falhando)**

Crie `web/src/modules/campo/domain/__tests__/questionario.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { VisitAnswers } from '../campo.types';
import { faltando, RESPOSTAS_VAZIAS } from '../questionario';

const COMPLETAS: VisitAnswers = {
  interlocutor_name: 'Maria',
  interlocutor_role: 'dono',
  freela_status: 'cadastrou_qr',
  interest: 'alto',
  open_vagas: 2,
  vaga_roles: ['Garçom'],
  freelas_per_week: 5,
  channels: ['Grupos de WhatsApp'],
  channel_other: null,
  needs_followup: true,
  followup_what: 'Voltar com proposta',
  followup_date: '2026-10-09',
  notes: null,
};

describe('faltando (espelho do servidor)', () => {
  it('vazio: lista tudo, na ordem da tela', () => {
    expect(faltando(RESPOSTAS_VAZIAS, '2026-10-08')).toEqual([
      'nome de quem atendeu',
      'cargo de quem atendeu',
      'situação no Freela',
      'interesse',
      'vagas abertas',
      'freelancers por semana',
      'apps e canais que usa',
      'se pediu retorno',
    ]);
  });

  it('completo: nada falta', () => {
    expect(faltando(COMPLETAS, '2026-10-08')).toEqual([]);
  });

  it('vagas > 0 exige função; 0 vagas não exige', () => {
    expect(faltando({ ...COMPLETAS, vaga_roles: [] }, '2026-10-08')).toEqual(['funções das vagas']);
    expect(faltando({ ...COMPLETAS, open_vagas: 0, vaga_roles: [] }, '2026-10-08')).toEqual([]);
  });

  it('"outro" preenchido vale como canal', () => {
    expect(faltando({ ...COMPLETAS, channels: [], channel_other: 'App X' }, '2026-10-08')).toEqual([]);
    expect(faltando({ ...COMPLETAS, channels: [], channel_other: '  ' }, '2026-10-08')).toEqual(['apps e canais que usa']);
  });

  it('retorno: o quê + data, e a data não pode ser no passado', () => {
    expect(faltando({ ...COMPLETAS, followup_what: ' ', followup_date: null }, '2026-10-08')).toEqual([
      'o que fazer no retorno',
      'data do retorno',
    ]);
    expect(faltando({ ...COMPLETAS, followup_date: '2026-10-07' }, '2026-10-08')).toEqual([
      'data do retorno (não pode ser no passado)',
    ]);
    expect(faltando({ ...COMPLETAS, needs_followup: false, followup_what: null, followup_date: null }, '2026-10-08')).toEqual([]);
  });
});
```

Crie `web/src/modules/campo/domain/__tests__/foto.test.ts` (pina a linha 3 do Review Focus — foto HEIC/grande do iPhone):

```ts
import { describe, expect, it } from 'vitest';
import { dimensoesReduzidas, escolherEnvio, TETO_FOTO_BYTES } from '../foto';

describe('dimensoesReduzidas', () => {
  it('reduz o lado maior para 1600 px mantendo a proporção', () => {
    expect(dimensoesReduzidas(4032, 3024)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoesReduzidas(3024, 4032)).toEqual({ largura: 1200, altura: 1600 });
  });
  it('não aumenta foto pequena', () => {
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
});

describe('escolherEnvio', () => {
  it('usa a reduzida quando o navegador conseguiu converter', () => {
    expect(escolherEnvio({ tipo: 'image/heic', bytes: 3_000_000 }, { bytes: 400_000 })).toEqual({ usar: 'reduzida' });
  });
  it('HEIC que o navegador não decodifica: explica, não manda', () => {
    const r = escolherEnvio({ tipo: 'image/heic', bytes: 2_000_000 }, null);
    expect('erro' in r && r.erro).toMatch(/Tire de novo/);
  });
  it('sem conversão, manda o original JPEG/PNG/WEBP até 5 MB', () => {
    expect(escolherEnvio({ tipo: 'image/jpeg', bytes: 1_000_000 }, null)).toEqual({ usar: 'original' });
    expect(escolherEnvio({ tipo: 'image/webp', bytes: TETO_FOTO_BYTES }, null)).toEqual({ usar: 'original' });
  });
  it('original acima de 5 MB sem conversão: explica', () => {
    expect('erro' in escolherEnvio({ tipo: 'image/jpeg', bytes: TETO_FOTO_BYTES + 1 }, null)).toBe(true);
  });
  it('reduzida vazia ou acima do teto não vale', () => {
    expect(escolherEnvio({ tipo: 'image/jpeg', bytes: 900_000 }, { bytes: 0 })).toEqual({ usar: 'original' });
    expect('erro' in escolherEnvio({ tipo: 'image/heic', bytes: 9_000_000 }, { bytes: TETO_FOTO_BYTES + 1 })).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /home/doutor/coding/freela/praca/web && yarn test src/modules/campo/domain/__tests__/questionario.test.ts src/modules/campo/domain/__tests__/foto.test.ts`
Expected: FAIL — `Cannot find module '../questionario'` / `'../foto'`.

- [ ] **Step 4: Implementar a lógica pura**

Crie `web/src/modules/campo/domain/questionario.ts`:

```ts
import type { VisitAnswers } from './campo.types';

/**
 * Espelho do `faltando` de `api/src/domain/campo-rules.ts` (mesma ordem, mesmos
 * rótulos). Quem decide é o servidor (`422 ANSWERS_INCOMPLETE`); aqui é só para
 * a tela dizer o que falta antes de tentar — inclusive sem sinal.
 */
export const RESPOSTAS_VAZIAS: VisitAnswers = {
  interlocutor_name: null,
  interlocutor_role: null,
  freela_status: null,
  interest: null,
  open_vagas: null,
  vaga_roles: [],
  freelas_per_week: null,
  channels: [],
  channel_other: null,
  needs_followup: null,
  followup_what: null,
  followup_date: null,
  notes: null,
};

/** Funções das vagas (spec §8.1 — "garçom, cozinheiro, churrasqueiro, motoboy ou outra"). */
export const FUNCOES_VAGA = ['Garçom', 'Cozinheiro', 'Churrasqueiro', 'Motoboy', 'Outra'] as const;

const vazio = (s: string | null | undefined): boolean => !s || !s.trim();

export function faltando(r: VisitAnswers, hoje: string): string[] {
  const f: string[] = [];
  if (vazio(r.interlocutor_name)) f.push('nome de quem atendeu');
  if (!r.interlocutor_role) f.push('cargo de quem atendeu');
  if (!r.freela_status) f.push('situação no Freela');
  if (!r.interest) f.push('interesse');
  if (r.open_vagas == null) f.push('vagas abertas');
  else if (r.open_vagas > 0 && r.vaga_roles.length === 0) f.push('funções das vagas');
  if (r.freelas_per_week == null) f.push('freelancers por semana');
  if (r.channels.length === 0 && vazio(r.channel_other)) f.push('apps e canais que usa');
  if (r.needs_followup == null) f.push('se pediu retorno');
  else if (r.needs_followup) {
    if (vazio(r.followup_what)) f.push('o que fazer no retorno');
    if (!r.followup_date) f.push('data do retorno');
    else if (r.followup_date < hoje) f.push('data do retorno (não pode ser no passado)');
  }
  return f;
}
```

Crie `web/src/modules/campo/domain/foto.ts`:

```ts
/** Foto da fachada (spec §7/§10): o aparelho reduz antes de mandar; a API confere os bytes. */
export const LADO_MAXIMO_PX = 1600;
export const QUALIDADE_JPEG = 0.75;
/** Mesmo teto de multipart da API (`main.ts`). */
export const TETO_FOTO_BYTES = 5 * 1024 * 1024;
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

export function dimensoesReduzidas(w: number, h: number): { largura: number; altura: number } {
  const maior = Math.max(w, h);
  if (maior <= LADO_MAXIMO_PX) return { largura: w, altura: h };
  const f = LADO_MAXIMO_PX / maior;
  return { largura: Math.round(w * f), altura: Math.round(h * f) };
}

export type EscolhaFoto = { usar: 'reduzida' | 'original' } | { erro: string };

/**
 * Qual arquivo vai para a fila. A reduzida (JPEG ≤ 1600 px) sempre que o
 * navegador conseguiu decodificar; senão o original, só se a API aceitar como
 * está (JPEG/PNG/WEBP ≤ 5 MB) — HEIC do iPhone que o navegador não abre volta
 * com explicação, em vez de virar `400 INVALID_FILE_TYPE` lá na frente, já
 * dentro da fila.
 */
export function escolherEnvio(original: { tipo: string; bytes: number }, reduzida: { bytes: number } | null): EscolhaFoto {
  if (reduzida && reduzida.bytes > 0 && reduzida.bytes <= TETO_FOTO_BYTES) return { usar: 'reduzida' };
  if (TIPOS_ACEITOS.includes(original.tipo) && original.bytes > 0 && original.bytes <= TETO_FOTO_BYTES) return { usar: 'original' };
  return { erro: 'Não foi possível usar esta foto. Tire de novo pela câmera do Praça ou escolha outra imagem (JPEG, PNG ou WEBP).' };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /home/doutor/coding/freela/praca/web && yarn test src/modules/campo/domain/__tests__/questionario.test.ts src/modules/campo/domain/__tests__/foto.test.ts`
Expected: PASS (2 arquivos).

- [ ] **Step 6: Redução da foto, foto da visita e gancho da URL**

Crie `web/src/modules/campo/infrastructure/foto-compressao.ts`:

```ts
import { dimensoesReduzidas, escolherEnvio, QUALIDADE_JPEG } from '../domain/foto';

/** Reduz no aparelho (~300–500 KB). `createImageBitmap` respeita a rotação EXIF da câmera. */
async function reduzir(arquivo: File): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    const { largura, altura } = dimensoesReduzidas(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, largura, altura);
    bmp.close();
    return await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALIDADE_JPEG));
  } catch {
    return null; // HEIC em navegador sem suporte, arquivo corrompido…
  }
}

export async function prepararFoto(arquivo: File): Promise<Blob> {
  const reduzida = await reduzir(arquivo);
  const escolha = escolherEnvio({ tipo: arquivo.type, bytes: arquivo.size }, reduzida ? { bytes: reduzida.size } : null);
  if ('erro' in escolha) throw new Error(escolha.erro);
  return escolha.usar === 'reduzida' && reduzida ? reduzida : arquivo;
}
```

Em `web/src/modules/campo/infrastructure/campo.api.ts`, acrescente no fim:

```ts
/** `GET /v1/campo/visits/:ref/photo` — só das visitas do próprio consultor (§20.3). */
export async function campoFotoVisita(ref: string): Promise<Blob> {
  const { data } = await campoApi.get(`/v1/campo/visits/${encodeURIComponent(ref)}/photo`, { responseType: 'blob' });
  return data as Blob;
}
```

(se `campoApi` ainda não estiver importado no arquivo, importe de `./campo-http` como as outras funções do arquivo fazem).

Crie `web/src/modules/campo/application/use-foto-url.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { campoFotoVisita } from '../infrastructure/campo.api';
import { useFilaStore } from './use-fila';

/**
 * A foto da visita para mostrar na tela: o arquivo ainda na fila (check-in sem
 * sinal) ou, depois de enviado, o da API. Libera a URL ao sair.
 */
export function useFotoUrl(ref: string): string | null {
  const naFila = useFilaStore((s) =>
    s.itens.find((i) => i.kind === 'checkin' && i.payload.client_id === ref),
  );
  const blobLocal = naFila?.kind === 'checkin' ? naFila.foto : null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let atual: string | null = null;
    const usar = (b: Blob) => {
      if (!vivo) return;
      atual = URL.createObjectURL(b);
      setUrl(atual);
    };
    if (blobLocal) usar(blobLocal);
    else void campoFotoVisita(ref).then(usar).catch(() => vivo && setUrl(null));
    return () => {
      vivo = false;
      if (atual) URL.revokeObjectURL(atual);
    };
  }, [ref, blobLocal]);

  return url;
}
```

- [ ] **Step 7: Componentes — questionário e QR**

Crie `web/src/components/campo/QrDoFreela.tsx`:

```tsx
'use client';

import { QRCodeSVG } from 'qrcode.react';

/** QR do cadastro no Freela com o código do consultor (`…/cadastro?consultor=CÓDIGO`). */
export function QrDoFreela({ url, tamanho = 280 }: { url: string | null; tamanho?: number }) {
  if (!url) {
    return (
      <p className="card-surface p-5 text-center text-sm text-muted-foreground">
        Seu código no Freela ainda está pendente. Avise a equipe — o QR code aparece aqui assim que ele existir.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-xl bg-white p-4">
        <QRCodeSVG value={url} size={tamanho} level="M" marginSize={0} title="QR code de cadastro no Freela" />
      </div>
      <p className="text-center text-sm text-muted-foreground">Aponte a câmera do celular para se cadastrar no Freela.</p>
    </div>
  );
}
```

Crie `web/src/components/campo/Questionario.tsx`:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { todaySp } from '@/lib/dates';
import type { Cargo, FreelaStatus, Interesse, VisitAnswers } from '@/modules/campo/domain/campo.types';
import { FUNCOES_VAGA } from '@/modules/campo/domain/questionario';

const CARGOS: [Cargo, string][] = [['dono', 'Dono'], ['gerente', 'Gerente'], ['outro', 'Outro']];
const SITUACOES: [FreelaStatus, string][] = [
  ['ja_usa', 'Já usa o Freela'],
  ['cadastrou_qr', 'Cadastrou agora pelo QR'],
  ['nao_cadastrou', 'Não cadastrou'],
];
const INTERESSES: [Interesse, string][] = [['alto', 'Alto'], ['medio', 'Médio'], ['baixo', 'Baixo'], ['nenhum', 'Nenhum']];

function Opcoes<T extends string>({
  valor,
  opcoes,
  onEscolher,
  desabilitado,
}: {
  valor: T | null;
  opcoes: [T, string][];
  onEscolher: (v: T) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map(([v, rotulo]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          disabled={desabilitado}
          onClick={() => onEscolher(v)}
          className={`h-11 rounded-md border px-4 text-sm font-semibold ${
            valor === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
          }`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

function Chips({
  marcados,
  opcoes,
  onTrocar,
  desabilitado,
}: {
  marcados: string[];
  opcoes: readonly string[];
  onTrocar: (lista: string[]) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map((o) => {
        const on = marcados.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            disabled={desabilitado}
            onClick={() => onTrocar(on ? marcados.filter((x) => x !== o) : [...marcados, o])}
            className={`h-10 rounded-full border px-3 text-sm ${on ? 'border-primary bg-primary/15 text-primary' : 'border-border'}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Número inteiro ≥ 0 ou `null` (campo vazio). */
const inteiro = (s: string, max: number): number | null => {
  if (s.trim() === '') return null;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : null;
};

/** Questionário da visita (spec §8.1). Controlado: cada mudança sobe inteira em `onMudar`. */
export function Questionario({
  valor,
  canais,
  onMudar,
  desabilitado,
}: {
  valor: VisitAnswers;
  canais: string[];
  onMudar: (r: VisitAnswers) => void;
  desabilitado?: boolean;
}) {
  const mudar = (parcial: Partial<VisitAnswers>) => onMudar({ ...valor, ...parcial });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="q-nome">Com quem falou</Label>
        <Input
          id="q-nome"
          value={valor.interlocutor_name ?? ''}
          maxLength={120}
          disabled={desabilitado}
          onChange={(e) => mudar({ interlocutor_name: e.target.value || null })}
          placeholder="Nome"
        />
        <Opcoes valor={valor.interlocutor_role} opcoes={CARGOS} onEscolher={(v) => mudar({ interlocutor_role: v })} desabilitado={desabilitado} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Situação no Freela</p>
        <Opcoes valor={valor.freela_status} opcoes={SITUACOES} onEscolher={(v) => mudar({ freela_status: v })} desabilitado={desabilitado} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Interesse</p>
        <Opcoes valor={valor.interest} opcoes={INTERESSES} onEscolher={(v) => mudar({ interest: v })} desabilitado={desabilitado} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="q-vagas">Vagas abertas agora</Label>
        <Input
          id="q-vagas"
          inputMode="numeric"
          value={valor.open_vagas ?? ''}
          disabled={desabilitado}
          onChange={(e) => {
            const n = inteiro(e.target.value, 500);
            mudar({ open_vagas: n, vaga_roles: n ? valor.vaga_roles : [] });
          }}
        />
        {(valor.open_vagas ?? 0) > 0 && (
          <Chips marcados={valor.vaga_roles} opcoes={FUNCOES_VAGA} onTrocar={(l) => mudar({ vaga_roles: l })} desabilitado={desabilitado} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="q-freelas">Freelancers que contrata por semana (mais ou menos)</Label>
        <Input
          id="q-freelas"
          inputMode="numeric"
          value={valor.freelas_per_week ?? ''}
          disabled={desabilitado}
          onChange={(e) => mudar({ freelas_per_week: inteiro(e.target.value, 1000) })}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Apps e canais que usa hoje</p>
        <Chips marcados={valor.channels} opcoes={canais} onTrocar={(l) => mudar({ channels: l })} desabilitado={desabilitado} />
        <Input
          id="q-outro"
          aria-label="Outro app ou canal"
          value={valor.channel_other ?? ''}
          maxLength={120}
          disabled={desabilitado}
          onChange={(e) => mudar({ channel_other: e.target.value || null })}
          placeholder="Outro (qual?)"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Precisa de retorno?</p>
        <Opcoes
          valor={valor.needs_followup == null ? null : valor.needs_followup ? 'sim' : 'nao'}
          opcoes={[['sim', 'Sim'], ['nao', 'Não']] as ['sim' | 'nao', string][]}
          onEscolher={(v) =>
            mudar(v === 'sim' ? { needs_followup: true } : { needs_followup: false, followup_what: null, followup_date: null })
          }
          desabilitado={desabilitado}
        />
        {valor.needs_followup && (
          <div className="space-y-2">
            <Input
              id="q-retorno-oque"
              aria-label="O que fazer no retorno"
              value={valor.followup_what ?? ''}
              maxLength={300}
              disabled={desabilitado}
              onChange={(e) => mudar({ followup_what: e.target.value || null })}
              placeholder="O que fazer"
            />
            <Input
              id="q-retorno-data"
              aria-label="Data do retorno"
              type="date"
              min={todaySp()}
              value={valor.followup_date ?? ''}
              disabled={desabilitado}
              onChange={(e) => mudar({ followup_date: e.target.value || null })}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="q-obs">Observação (opcional)</Label>
        <Textarea
          id="q-obs"
          value={valor.notes ?? ''}
          maxLength={2000}
          disabled={desabilitado}
          onChange={(e) => mudar({ notes: e.target.value || null })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Telas — QR, nova visita e visita aberta**

Crie `web/src/app/campo/(sessao)/qr/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { QrDoFreela } from '@/components/campo/QrDoFreela';
import { useCampoMe } from '@/modules/campo/application/use-campo';

/** QR em tela cheia, para o dono do estabelecimento escanear (spec §8.1). */
export default function QrPage() {
  const me = useCampoMe();
  return (
    <main className="space-y-6">
      <CampoTopo titulo="QR code" />
      <QrDoFreela url={me.data?.consultant.signup_url ?? null} tamanho={300} />
      <Link href="/campo" className="flex h-12 items-center justify-center rounded-md border border-border text-sm font-bold">
        Voltar
      </Link>
    </main>
  );
}
```

Crie `web/src/app/campo/(sessao)/visita/nova/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useDia } from '@/modules/campo/application/use-campo';
import { enfileirar } from '@/modules/campo/application/use-fila';
import { useOnline } from '@/modules/campo/application/use-online';
import type { PlaceView, Posicao } from '@/modules/campo/domain/campo.types';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { campoBuscarLugares, campoLugaresParecidos, campoLugaresPerto } from '@/modules/campo/infrastructure/campo.api';
import { prepararFoto } from '@/modules/campo/infrastructure/foto-compressao';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

type Modo = 'perto' | 'buscar' | 'novo';
interface Escolhido {
  nome: string;
  lead_id?: string;
  new_place?: { name: string; address?: string };
  confirm_new?: boolean;
}

const metros = (m: number | null) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** Nova visita (spec §8.1): estabelecimento → foto da fachada → check-in (pela fila). */
export default function NovaVisitaPage() {
  const router = useRouter();
  const online = useOnline();
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { dia, carregando } = useDia();
  const [modo, setModo] = useState<Modo>('perto');
  const [lugares, setLugares] = useState<PlaceView[] | null>(null);
  const [busca, setBusca] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoEndereco, setNovoEndereco] = useState('');
  const [parecidos, setParecidos] = useState<PlaceView[] | null>(null);
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Com visita aberta, não começa outra (uma por vez — spec §7).
  useEffect(() => {
    if (dia.visitaAberta) router.replace(`/campo/visita/${dia.visitaAberta.ref}`);
  }, [dia.visitaAberta, router]);

  useEffect(() => {
    if (!foto) return;
    const u = URL.createObjectURL(foto);
    setPrevia(u);
    return () => URL.revokeObjectURL(u);
  }, [foto]);

  // Busca por nome com espera de 300 ms; precisa de sinal.
  useEffect(() => {
    if (modo !== 'buscar' || busca.trim().length < 2 || !online) return;
    const t = window.setTimeout(() => {
      campoBuscarLugares(busca.trim())
        .then(setLugares)
        .catch((e) => toast.error(apiErrorMessage(e, 'Não foi possível buscar.')));
    }, 300);
    return () => window.clearTimeout(t);
  }, [modo, busca, online]);

  async function posicao(): Promise<Posicao | null> {
    setGps(null);
    try {
      return await lerPosicao();
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível pegar a localização.');
      return null;
    }
  }

  async function procurarPerto() {
    setOcupado(true);
    try {
      const p = await posicao();
      if (p) setLugares(await campoLugaresPerto(p.lat, p.lng));
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível procurar.'));
    } finally {
      setOcupado(false);
    }
  }

  async function continuarNovo() {
    const name = novoNome.trim();
    if (!name) return;
    const novo: Escolhido = { nome: name, new_place: { name, address: novoEndereco.trim() || undefined } };
    if (!online) {
      // Sem sinal não dá para perguntar; o servidor marca `possible_dup` se houver parecido (decisão 2).
      setEscolhido(novo);
      return;
    }
    setOcupado(true);
    try {
      const p = await posicao();
      if (!p) return;
      const achados = await campoLugaresParecidos(name, p.lat, p.lng);
      if (achados.length > 0) setParecidos(achados);
      else setEscolhido({ ...novo, confirm_new: true });
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível conferir parecidos.'));
    } finally {
      setOcupado(false);
    }
  }

  async function aoEscolherFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      setFoto(await prepararFoto(arquivo));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível usar esta foto.');
    }
  }

  async function fazerCheckin() {
    if (!escolhido || !foto) return;
    setOcupado(true);
    try {
      const p = await posicao();
      if (!p) return;
      const client_id = crypto.randomUUID();
      await enfileirar(
        {
          kind: 'checkin',
          payload: {
            client_id,
            ...p,
            lead_id: escolhido.lead_id,
            new_place: escolhido.new_place,
            confirm_new: escolhido.confirm_new,
            place_name: escolhido.nome,
          },
          foto,
        },
        consultantId,
      );
      router.replace(`/campo/visita/${client_id}`);
    } catch {
      toast.error('Não foi possível guardar o check-in neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!dia.jornada) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Nova visita" />
        <p className="card-surface p-5 text-sm">Inicie a jornada antes de visitar.</p>
        <Link href="/campo" className="flex h-12 items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar
        </Link>
      </main>
    );
  }

  return (
    <main className="space-y-5 pb-28">
      <CampoTopo titulo="Nova visita" />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}

      {!escolhido ? (
        <section className="space-y-4">
          <div role="tablist" className="grid grid-cols-3 gap-2">
            {([['perto', 'Perto de mim'], ['buscar', 'Buscar'], ['novo', 'Novo estabelecimento']] as [Modo, string][]).map(
              ([m, rotulo]) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={modo === m}
                  onClick={() => {
                    setModo(m);
                    setLugares(null);
                    setParecidos(null);
                  }}
                  className={`h-12 rounded-md border text-xs font-bold ${modo === m ? 'border-primary bg-primary/15 text-primary' : 'border-border'}`}
                >
                  {rotulo}
                </button>
              ),
            )}
          </div>

          {modo !== 'novo' && !online && (
            <p className="text-sm text-muted-foreground">Sem sinal: procurar e buscar precisam de internet. Use “Novo estabelecimento”.</p>
          )}

          {modo === 'perto' && online && (
            <Button onClick={() => void procurarPerto()} disabled={ocupado} className="h-12 w-full">
              {ocupado ? 'Procurando…' : 'Procurar perto de mim'}
            </Button>
          )}

          {modo === 'buscar' && (
            <Input id="busca-lugar" aria-label="Nome do estabelecimento" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do estabelecimento" />
          )}

          {modo !== 'novo' && lugares && (
            lugares.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada encontrado. Tente “Novo estabelecimento”.</p>
            ) : (
              <ul className="space-y-2">
                {lugares.map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => setEscolhido({ nome: l.name, lead_id: l.id })}
                      className="card-surface w-full p-3 text-left"
                    >
                      <p className="font-bold">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[l.address, metros(l.distance_m)].filter(Boolean).join(' · ')}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

          {modo === 'novo' && !parecidos && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="novo-nome">Nome</Label>
                <Input id="novo-nome" value={novoNome} maxLength={160} onChange={(e) => setNovoNome(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="novo-endereco">Endereço</Label>
                <Input id="novo-endereco" value={novoEndereco} maxLength={240} onChange={(e) => setNovoEndereco(e.target.value)} />
              </div>
              <Button onClick={() => void continuarNovo()} disabled={ocupado || !novoNome.trim()} className="h-12 w-full">
                Continuar
              </Button>
            </div>
          )}

          {modo === 'novo' && parecidos && (
            <div className="space-y-3">
              {parecidos.map((p) => (
                <div key={p.id} className="card-surface space-y-3 p-4">
                  <p className="text-sm">
                    Já existe <strong>“{p.name}”</strong> a {metros(p.distance_m)} — é esse?
                  </p>
                  <Button onClick={() => setEscolhido({ nome: p.name, lead_id: p.id })} className="h-11 w-full">
                    É esse
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setEscolhido({
                    nome: novoNome.trim(),
                    new_place: { name: novoNome.trim(), address: novoEndereco.trim() || undefined },
                    confirm_new: true,
                  })
                }
                className="h-11 w-full"
              >
                É outro estabelecimento
              </Button>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="card-surface flex items-center justify-between gap-3 p-4">
            <p className="font-bold">{escolhido.nome}</p>
            <button onClick={() => { setEscolhido(null); setFoto(null); }} className="text-xs text-primary">
              trocar
            </button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="foto-fachada">Foto da fachada (obrigatória)</Label>
            <input
              id="foto-fachada"
              type="file"
              accept="image/*"
              capture="environment"
              className="block w-full text-sm"
              onChange={(e) => void aoEscolherFoto(e.target.files?.[0])}
            />
            {previa && <img src={previa} alt="Foto da fachada" className="w-full rounded-md" />}
          </div>
        </section>
      )}

      {escolhido && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            <Button onClick={() => void fazerCheckin()} disabled={!foto || ocupado} className="h-14 w-full text-base">
              {ocupado ? 'Pegando a localização…' : 'Fazer check-in'}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
```

Crie `web/src/app/campo/(sessao)/visita/[ref]/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { Questionario } from '@/components/campo/Questionario';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { useFotoUrl } from '@/modules/campo/application/use-foto-url';
import type { VisitAnswers } from '@/modules/campo/domain/campo.types';
import { hora } from '@/modules/campo/domain/formatos';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { faltando, RESPOSTAS_VAZIAS } from '@/modules/campo/domain/questionario';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';

/** Espera depois da última mudança para guardar o rascunho na fila (que substitui o anterior). */
const ESPERA_RASCUNHO_MS = 800;

/** Visita aberta (spec §8.1): questionário com rascunho automático, QR a um toque, checkout. */
export default function VisitaPage() {
  const { ref } = useParams<{ ref: string }>();
  const router = useRouter();
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { dia, hoje, carregando } = useDia();
  const me = useCampoMe();
  const itens = useFilaStore((s) => s.itens);
  const foto = useFotoUrl(ref);
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const local = dia.visitas.find((v) => v.ref === ref) ?? null;
  const doServidor = hoje?.visits.find((v) => v.client_id === ref) ?? null;
  const rascunhoNaFila = [...itens].reverse().find((i) => i.kind === 'answers' && i.visit_ref === ref);
  const inicial: VisitAnswers =
    (rascunhoNaFila?.kind === 'answers' ? rascunhoNaFila.payload : null) ?? doServidor?.answers ?? RESPOSTAS_VAZIAS;

  /** `null` = ainda não mexeu: segue o que vier do servidor/fila. */
  const [respostas, setRespostas] = useState<VisitAnswers | null>(null);
  const atual = respostas ?? inicial;
  const sujo = useRef(false);

  async function guardarRascunho(r: VisitAnswers) {
    sujo.current = false;
    await enfileirar({ kind: 'answers', visit_ref: ref, payload: r }, consultantId);
  }

  useEffect(() => {
    if (!respostas || !sujo.current) return;
    const t = window.setTimeout(() => void guardarRascunho(respostas), ESPERA_RASCUNHO_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respostas]);

  const fechada = !!local?.checkout_at || !!local?.auto_closed;
  const falta = faltando(atual, todaySp());

  async function checkout() {
    setGps(null);
    setOcupado(true);
    try {
      // O rascunho vai antes do checkout na fila (ordem de envio = ordem de entrada).
      if (respostas && sujo.current) await guardarRascunho(respostas);
      const p = await lerPosicao();
      await enfileirar({ kind: 'checkout', visit_ref: ref, payload: p }, consultantId);
      router.replace('/campo');
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível guardar o checkout neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!local) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Visita" />
        <p className="card-surface p-5 text-sm">Visita não encontrada neste aparelho.</p>
        <Link href="/campo" className="flex h-12 items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar
        </Link>
      </main>
    );
  }

  return (
    <main className="space-y-5 pb-32">
      <CampoTopo titulo={local.nome} />
      <FaixaFila />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}
      <p className="text-xs text-muted-foreground">
        Check-in às {hora(local.checkin_at)}
        {doServidor?.far_from_place ? ' · longe do local' : ''}
        {local.auto_closed ? ' · fechada sem checkout' : ''}
      </p>
      {foto && <img src={foto} alt="Foto da fachada" className="w-full rounded-md" />}

      <Questionario
        valor={atual}
        canais={me.data?.channels ?? []}
        desabilitado={fechada}
        onMudar={(r) => {
          sujo.current = true;
          setRespostas(r);
        }}
      />

      {!fechada && falta.length > 0 && (
        <p className="text-sm text-muted-foreground">Falta responder: {falta.join(', ')}.</p>
      )}

      {!fechada && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-3">
            <Link href="/campo/qr" className="flex h-14 w-28 items-center justify-center rounded-md border border-border text-sm font-bold">
              QR code
            </Link>
            <Button onClick={() => void checkout()} disabled={ocupado || falta.length > 0} className="h-14 flex-1 text-base">
              {ocupado ? 'Pegando a localização…' : 'Fazer checkout'}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 9: browser-check — a visita de ponta a ponta (com check-in sem sinal)**

Em `web/scripts/browser-check.mjs`, troque a linha `// ── campo: visitas (Task 11 entra AQUI, antes de encerrar) ──` por:

```js
  console.log('-- Campo: visita (check-in sem sinal, questionário, checkout, CRM) --');
  await cel.getByRole('link', { name: 'Nova visita' }).click();
  await cel.waitForURL('**/campo/visita/nova', { timeout: 20000 });
  await cel.getByRole('tab', { name: 'Novo estabelecimento' }).click();
  await cel.locator('#novo-nome').fill(CAMPO_LUGAR);
  await cel.locator('#novo-endereco').fill('Rua do Browser-Check, 100');
  await cel.getByRole('button', { name: 'Continuar', exact: true }).click();
  // Nome com carimbo: nenhum parecido a 100 m → vai direto para a foto.
  await cel.locator('#foto-fachada').waitFor({ timeout: 15000 });
  const jpeg = await cel.evaluate(
    () =>
      new Promise((resolve) => {
        const c = document.createElement('canvas');
        c.width = 2400;
        c.height = 1800;
        const g = c.getContext('2d');
        g.fillStyle = '#2E6F7E';
        g.fillRect(0, 0, c.width, c.height);
        c.toBlob((b) => b.arrayBuffer().then((a) => resolve(Array.from(new Uint8Array(a)))), 'image/jpeg', 0.9);
      }),
  );
  await cel.locator('#foto-fachada').setInputFiles({ name: 'fachada.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
  await cel.getByAltText('Foto da fachada').waitFor({ timeout: 15000 });
  check('foto da fachada aparece antes do check-in', true);

  offline = true;
  await celularCtx.setOffline(true);
  await cel.getByRole('button', { name: 'Fazer check-in' }).click();
  await cel.waitForURL(/\/campo\/visita\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await cel.getByText('1 envio pendente').waitFor({ timeout: 15000 });
  check('sem sinal: o check-in fica na fila e a visita abre com a foto', (await cel.getByAltText('Foto da fachada').count()) === 1);
  check('checkout bloqueado com o questionário vazio', await cel.getByRole('button', { name: 'Fazer checkout' }).isDisabled());
  await celularCtx.setOffline(false);
  offline = false;
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });

  const diaCampo = async () => api('GET', `/v1/consultores/${consultorId}/days/${HOJE}`);
  const visitaEnviada = (await diaCampo()).visits.find((v) => v.lead_name === CAMPO_LUGAR);
  leadCampoId = visitaEnviada?.lead_id ?? null;
  check('sinal de volta: a visita chegou com foto reduzida (≤ 5 MB)', !!visitaEnviada && visitaEnviada.photo_bytes > 0 && visitaEnviada.photo_bytes <= 5 * 1024 * 1024);

  await cel.locator('#q-nome').fill('Maria Check');
  await cel.getByRole('button', { name: 'Dono', exact: true }).click();
  await cel.getByRole('button', { name: 'Cadastrou agora pelo QR', exact: true }).click();
  await cel.getByRole('button', { name: 'Alto', exact: true }).click();
  await cel.locator('#q-vagas').fill('2');
  await cel.getByRole('button', { name: 'Garçom', exact: true }).click();
  await cel.locator('#q-freelas').fill('5');
  await cel.getByRole('button', { name: 'Grupos de WhatsApp', exact: true }).click();
  await cel.getByRole('button', { name: 'Sim', exact: true }).click();
  await cel.locator('#q-retorno-oque').fill('Voltar com proposta');
  await cel.locator('#q-retorno-data').fill(HOJE);
  check('questionário completo libera o checkout', !(await cel.getByRole('button', { name: 'Fazer checkout' }).isDisabled()));

  await cel.getByRole('link', { name: 'QR code' }).click();
  await cel.waitForURL('**/campo/qr', { timeout: 15000 });
  check('tela do QR (ou "código pendente" sem Freela configurado)', /aponte a câmera|código no freela ainda está pendente/.test(await corpo(cel)));
  await cel.goBack();
  await cel.waitForURL(/\/campo\/visita\//, { timeout: 15000 });

  await cel.getByRole('button', { name: 'Fazer checkout' }).click();
  await cel.waitForURL(/\/campo$/, { timeout: 20000 });
  await cel.waitForFunction(() => !document.body.innerText.toLowerCase().includes('pendente'), null, { timeout: 30000 });
  const fechada = (await diaCampo()).visits.find((v) => v.lead_id === leadCampoId);
  check('checkout gravado com as respostas', !!fechada?.checkout_at && fechada.answers.freela_status === 'cadastrou_qr');
  check('equipe vê 1 visita e 1 "cadastrou agora" hoje', (await situacaoCampo())?.visits === 1 && (await situacaoCampo())?.cadastros === 1);
  const leadCampo = await api('GET', `/v1/leads/${leadCampoId}`);
  check(
    'CRM: lead "visita de campo" em "Conversa aberta", decisor e próximo passo da visita',
    leadCampo.origem === 'visita de campo' &&
      leadCampo.stage === 3 &&
      leadCampo.decisor === 'Maria Check' &&
      leadCampo.next_step?.date === HOJE &&
      (leadCampo.events ?? []).some((e) => e.kind === 'visit'),
  );
```

A limpeza que a Task 9 já escreveu apaga o consultor (que leva as visitas por cascata) e depois o lead `leadCampoId` — nada a acrescentar lá.

- [ ] **Step 10: Rodar a unidade, o browser-check, tipos e lint (um por vez)**

Run: `cd /home/doutor/coding/freela/praca/web && yarn test`
Expected: PASS (todas as specs do campo).

Suba a API (`npm run start:smoke`) e o web (`yarn dev`) em segundo plano, como na Task 9.

Run: `cd /home/doutor/coding/freela/praca/web && yarn browser-check`
Expected: as checagens novas da visita verdes; nenhum erro de console/HTTP fora da lista fechada; limpeza sem resíduo.

Mate os dois processos e confirme `ss -ltn | grep -E ':(3014|3024) '` vazio. Depois, um de cada vez: `yarn typecheck` (sem erro) e `yarn lint` (sem erro).

- [ ] **Step 11: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add web/package.json web/yarn.lock web/src/modules/campo web/src/components/campo web/src/app/campo web/scripts/browser-check.mjs
git commit -m "feat(web/campo): nova visita com foto, questionário, QR code e checkout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Web da equipe — Consultores (lista, detalhe com linha do tempo e mapa, ações de admin) e canais nas Configurações

**Files:**
- Create: `web/src/modules/consultores/infrastructure/consultores.api.ts`, `web/src/modules/consultores/application/use-consultores.ts`
- Create: `web/src/components/praca/ConsultorDialog.tsx`, `web/src/components/praca/ConsultorMapa.tsx`, `web/src/components/praca/ConsultorLinhaDoTempo.tsx`, `web/src/components/praca/CanaisCampo.tsx`
- Create: `web/src/app/(app)/consultores/page.tsx`, `web/src/app/(app)/consultores/[id]/page.tsx`
- Modify: `web/src/components/praca/AppShell.tsx` (item "Consultores" no menu), `web/src/app/(app)/configuracoes/page.tsx` (seção "Apps e canais (campo)"), `web/scripts/browser-check.mjs`

**Interfaces:**
- Consumes: `api`, `apiErrorMessage` (`web/src/modules/shared/infrastructure/http.ts`); `useAuth` (`user.is_admin`); `usePracas` (`web/src/modules/pracas/application/use-pracas.ts`); `JourneyView`, `PointView`, `VisitView` (`web/src/modules/campo/domain/campo.types.ts`, Task 9); `QrDoFreela` (Task 11); `todaySp`, `fmtBR` (`web/src/lib/dates.ts`); rotas `/v1/consultores*` (Tasks 4 e 7, contrato §20.4).
- Produces:
  - Tipos: `PixKeyType`, `ConsultorView`, `ConsultorListItem`, `DiaConsultor`, `CreateConsultorInput`, `UpdateConsultorInput`.
  - API: `listConsultores()`, `getConsultor(id)`, `createConsultor(input)`, `updateConsultor(id, input)`, `resetSenhaConsultor(id)`, `freelaSyncConsultor(id)`, `diaDoConsultor(id, day)`, `fotoDaVisitaEquipe(visitId)`, `getCanaisCampo()`, `putCanaisCampo(channels)`.
  - Ganchos: `useConsultores()`, `useConsultor(id)`, `useDiaConsultor(id, day)`, `useCreateConsultor()`, `useUpdateConsultor(id)`, `useResetSenhaConsultor(id)`, `useFreelaSyncConsultor(id)`, `useCanaisCampo()`, `useSalvarCanaisCampo()`.
  - Componentes: `ConsultorDialog({ aberto, onFechar, consultor? })`, `ConsultorMapa({ pontos, visitas, dark })` (default export, entra por `next/dynamic` sem SSR), `ConsultorLinhaDoTempo({ dia })`, `CanaisCampo()`.

- [ ] **Step 1: browser-check da equipe (falhando)**

Em `web/scripts/browser-check.mjs`, no bloco do campo, **depois** de "sinal de volta: a fila enviou o encerramento" (fim da Task 10) e antes da limpeza, acrescente (a página `page` é a da equipe, já logada no começo do roteiro):

```js
  console.log('-- Equipe: Consultores --');
  await page.goto(`${BASE}/consultores`, { waitUntil: 'networkidle' });
  check('menu tem "Consultores"', (await page.getByRole('link', { name: 'Consultores' }).count()) > 0);
  check('lista mostra o consultor do roteiro, encerrado hoje', (await corpo(page)).includes(CAMPO_NOME.toLowerCase()) && (await corpo(page)).includes('encerrou'));
  await page.getByRole('link', { name: CAMPO_NOME }).click();
  await page.waitForURL(`**/consultores/${consultorId}`, { timeout: 20000 });
  await page.getByText(CAMPO_LUGAR).first().waitFor({ timeout: 20000 });
  const detalhe = await corpo(page);
  check('detalhe: linha do tempo com início, a visita e o fim', detalhe.includes('início da jornada') && detalhe.includes(CAMPO_LUGAR.toLowerCase()) && detalhe.includes('fim da jornada'));
  check('detalhe: respostas da visita', detalhe.includes('maria check') && detalhe.includes('cadastrou agora pelo qr'));
  await page.locator('.leaflet-container').waitFor({ timeout: 20000 });
  check('detalhe: mapa do dia com o trajeto', (await page.locator('.leaflet-container path.leaflet-interactive').count()) > 0);
  await page.getByAltText(`Fachada — ${CAMPO_LUGAR}`).waitFor({ timeout: 20000 });
  check('detalhe: foto da fachada carrega pela API', true);

  await page.getByRole('button', { name: 'Nova senha provisória' }).click();
  await page.getByRole('button', { name: 'Gerar', exact: true }).click();
  await page.getByTestId('senha-provisoria').waitFor({ timeout: 15000 });
  const novaSenha = (await page.getByTestId('senha-provisoria').innerText()).trim();
  check('nova senha provisória aparece uma vez (10 caracteres)', novaSenha.length === 10);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  // A sessão do celular cai (token_version subiu): o próximo pedido toma 401 e leva a /campo/entrar.
  // Esse 401 é ESPERADO — só nesta janela e só em /v1/campo/ (ver `esperado401` no vigia).
  esperado401 = true;
  await cel.reload({ waitUntil: 'networkidle' });
  await cel.waitForURL('**/campo/entrar', { timeout: 20000 });
  esperado401 = false;
  check('nova senha derruba a sessão aberta no celular', cel.url().endsWith('/campo/entrar'));

  await page.goto(`${BASE}/configuracoes`, { waitUntil: 'networkidle' });
  check('Configurações: seção "Apps e canais (campo)" com a lista', (await corpo(page)).includes('apps e canais (campo)') && (await corpo(page)).includes('grupos de whatsapp'));
```

No mesmo arquivo, deixe o vigia do campo aceitar o 401 da sessão derrubada — e só ele. Logo depois de
`const esperadoOffline = …` (Task 9), acrescente:

```js
/** `true` só na janela "nova senha derruba a sessão": o 401 de /v1/campo/ é o comportamento testado. */
let esperado401 = false;
const e401 = (status, url) => esperado401 && status === 401 && url.includes('/v1/campo/');
```

e, em `vigiar(p, rotulo)`, troque as duas condições:

```js
  p.on('console', (m) => {
    if (m.type() === 'error' && !esperadoOffline(m.text()) && !(esperado401 && /401/.test(m.text()))) {
      erros.push(`[console/${rotulo}] ${p.url().replace(BASE, '')}: ${m.text().slice(0, 200)}`);
    }
  });
```

```js
  p.on('response', (r) => {
    if (r.status() >= 400 && !ignorada(r.url()) && !e401(r.status(), r.url())) {
      erros.push(`[http ${r.status()}/${rotulo}] ${r.request().method()} ${r.url().replace(API, 'api')}`);
    }
  });
```

Run (API `start:smoke` + web `yarn dev` de pé): `cd /home/doutor/coding/freela/praca/web && yarn browser-check`
Expected: FAIL em `menu tem "Consultores"` (a tela não existe). Mate os dois processos.

- [ ] **Step 2: Camada de dados da equipe**

Crie `web/src/modules/consultores/infrastructure/consultores.api.ts`:

```ts
import { api } from '@/modules/shared/infrastructure/http';
import type { JourneyView, PointView, VisitView } from '@/modules/campo/domain/campo.types';

export type PixKeyType = 'cpf' | 'email' | 'telefone' | 'aleatoria';

/** `ConsultorView` — contrato §20.4. */
export interface ConsultorView {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  praca_id: string;
  praca_name: string;
  pix_key_type: PixKeyType;
  pix_key: string;
  active: boolean;
  must_change_password: boolean;
  freela_consultant_id: string | null;
  freela_code: string | null;
  freela_sync_error: string | null;
  freela_synced_at: string | null;
  signup_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConsultorListItem extends ConsultorView {
  today: { status: 'em_jornada' | 'encerrou' | 'nao_iniciou'; visits: number; cadastros: number; last_point_at: string | null };
}

export interface DiaConsultor {
  day: string;
  journeys: (JourneyView & { points: PointView[] })[];
  visits: VisitView[];
}

export interface CreateConsultorInput {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  praca_id: string;
  pix_key_type: PixKeyType;
  pix_key: string;
}

export type UpdateConsultorInput = Partial<CreateConsultorInput> & { active?: boolean };

export async function listConsultores(): Promise<ConsultorListItem[]> {
  const { data } = await api.get('/v1/consultores');
  return data as ConsultorListItem[];
}

export async function getConsultor(id: string): Promise<ConsultorView> {
  const { data } = await api.get(`/v1/consultores/${id}`);
  return data as ConsultorView;
}

export async function createConsultor(input: CreateConsultorInput): Promise<{ consultant: ConsultorView; temp_password: string }> {
  const { data } = await api.post('/v1/consultores', input);
  return data as { consultant: ConsultorView; temp_password: string };
}

export async function updateConsultor(id: string, input: UpdateConsultorInput): Promise<ConsultorView> {
  const { data } = await api.patch(`/v1/consultores/${id}`, input);
  return data as ConsultorView;
}

export async function resetSenhaConsultor(id: string): Promise<{ temp_password: string }> {
  const { data } = await api.post(`/v1/consultores/${id}/reset-password`);
  return data as { temp_password: string };
}

export async function freelaSyncConsultor(id: string): Promise<ConsultorView> {
  const { data } = await api.post(`/v1/consultores/${id}/freela-sync`);
  return data as ConsultorView;
}

export async function diaDoConsultor(id: string, day: string): Promise<DiaConsultor> {
  const { data } = await api.get(`/v1/consultores/${id}/days/${day}`);
  return data as DiaConsultor;
}

export async function fotoDaVisitaEquipe(visitId: string): Promise<Blob> {
  const { data } = await api.get(`/v1/consultores/visits/${visitId}/photo`, { responseType: 'blob' });
  return data as Blob;
}

export async function getCanaisCampo(): Promise<string[]> {
  const { data } = await api.get('/v1/consultores/settings/channels');
  return (data as { channels: string[] }).channels;
}

export async function putCanaisCampo(channels: string[]): Promise<string[]> {
  const { data } = await api.put('/v1/consultores/settings/channels', { channels });
  return (data as { channels: string[] }).channels;
}
```

Crie `web/src/modules/consultores/application/use-consultores.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  createConsultor,
  diaDoConsultor,
  freelaSyncConsultor,
  getCanaisCampo,
  getConsultor,
  listConsultores,
  putCanaisCampo,
  resetSenhaConsultor,
  updateConsultor,
  type CreateConsultorInput,
  type UpdateConsultorInput,
} from '../infrastructure/consultores.api';

const CHAVE = ['consultores'] as const;

/** Lista com a situação de hoje — atualiza a cada minuto (acompanhamento em tempo quase real). */
export function useConsultores() {
  return useQuery({ queryKey: CHAVE, queryFn: listConsultores, refetchInterval: 60_000 });
}

export function useConsultor(id: string) {
  return useQuery({ queryKey: [...CHAVE, id], queryFn: () => getConsultor(id) });
}

export function useDiaConsultor(id: string, day: string) {
  return useQuery({ queryKey: [...CHAVE, id, 'dia', day], queryFn: () => diaDoConsultor(id, day), refetchInterval: 60_000 });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: CHAVE });
}

export function useCreateConsultor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (input: CreateConsultorInput) => createConsultor(input),
    onSuccess: invalidar,
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar o consultor.')),
  });
}

export function useUpdateConsultor(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (input: UpdateConsultorInput) => updateConsultor(id, input),
    onSuccess: invalidar,
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar.')),
  });
}

export function useResetSenhaConsultor(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: () => resetSenhaConsultor(id),
    onSuccess: invalidar,
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível gerar a senha.')),
  });
}

export function useFreelaSyncConsultor(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: () => freelaSyncConsultor(id),
    onSuccess: (c) => {
      invalidar();
      if (c.freela_sync_error) toast.error(`Freela: ${c.freela_sync_error}`);
      else toast.success('Código no Freela pronto.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível falar com o Freela.')),
  });
}

export function useCanaisCampo() {
  return useQuery({ queryKey: [...CHAVE, 'canais'], queryFn: getCanaisCampo });
}

export function useSalvarCanaisCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channels: string[]) => putCanaisCampo(channels),
    onSuccess: (channels) => {
      qc.setQueryData([...CHAVE, 'canais'], channels);
      toast.success('Lista salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a lista.')),
  });
}
```

- [ ] **Step 3: Componentes — formulário, mapa, linha do tempo, canais**

Crie `web/src/components/praca/ConsultorDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { useCreateConsultor, useUpdateConsultor } from '@/modules/consultores/application/use-consultores';
import type { ConsultorView, CreateConsultorInput, PixKeyType } from '@/modules/consultores/infrastructure/consultores.api';

const TIPOS_PIX: [PixKeyType, string][] = [['cpf', 'CPF'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Aleatória']];

/** Criar/editar consultor (admin). Na criação, mostra a senha provisória UMA vez. */
export function ConsultorDialog({ aberto, onFechar, consultor }: { aberto: boolean; onFechar: () => void; consultor?: ConsultorView }) {
  const { data: pracas = [] } = usePracas();
  const criar = useCreateConsultor();
  const editar = useUpdateConsultor(consultor?.id ?? '');
  const [form, setForm] = useState<CreateConsultorInput>(() => ({
    name: consultor?.name ?? '',
    email: consultor?.email ?? '',
    phone: consultor?.phone ?? '',
    cpf: consultor?.cpf ?? '',
    praca_id: consultor?.praca_id ?? pracas[0]?.id ?? '',
    pix_key_type: consultor?.pix_key_type ?? 'cpf',
    pix_key: consultor?.pix_key ?? '',
  }));
  const [senha, setSenha] = useState<string | null>(null);
  const campo = (k: keyof CreateConsultorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function salvar() {
    const dados = { ...form, praca_id: form.praca_id || pracas[0]?.id || '' };
    if (consultor) {
      await editar.mutateAsync(dados);
      onFechar();
    } else {
      const r = await criar.mutateAsync(dados);
      setSenha(r.temp_password);
    }
  }

  const fechar = () => {
    setSenha(null);
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{consultor ? 'Editar consultor' : 'Novo consultor'}</DialogTitle>
        </DialogHeader>
        {senha ? (
          <div className="space-y-3">
            <p className="text-sm">Senha provisória — aparece só agora. Mande pelo WhatsApp junto com o endereço <strong>/campo/entrar</strong>:</p>
            <p data-testid="senha-provisoria" className="rounded-md bg-secondary p-3 text-center font-mono text-lg">
              {senha}
            </p>
            <Button onClick={() => void navigator.clipboard.writeText(senha)} variant="outline" className="w-full">
              Copiar
            </Button>
            <Button onClick={fechar} className="w-full">
              Fechar
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            {(
              [
                ['c-nome', 'Nome', 'name'],
                ['c-email', 'E-mail', 'email'],
                ['c-telefone', 'Telefone', 'phone'],
                ['c-cpf', 'CPF', 'cpf'],
              ] as [string, string, keyof CreateConsultorInput][]
            ).map(([id, rotulo, k]) => (
              <div key={id} className="space-y-1">
                <Label htmlFor={id}>{rotulo}</Label>
                <Input id={id} value={form[k]} onChange={campo(k)} required />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="c-praca">Praça</Label>
              <select id="c-praca" value={form.praca_id} onChange={campo('praca_id')} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                {pracas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <div className="space-y-1">
                <Label htmlFor="c-pix-tipo">Tipo da chave Pix</Label>
                <select id="c-pix-tipo" value={form.pix_key_type} onChange={campo('pix_key_type')} className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
                  {TIPOS_PIX.map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-pix">Chave Pix</Label>
                <Input id="c-pix" value={form.pix_key} onChange={campo('pix_key')} required />
              </div>
            </div>
            <Button type="submit" disabled={criar.isPending || editar.isPending} className="w-full">
              {consultor ? 'Salvar' : 'Criar e gerar senha'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Crie `web/src/components/praca/ConsultorMapa.tsx` (mesmo cuidado do `AberturaMapa`: o Leaflet só entra no navegador):

```tsx
'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { PointView, VisitView } from '@/modules/campo/domain/campo.types';

const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILES_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

/** Mapa do dia (spec §8.2): pontos ligados na ordem gravada + check-ins destacados. Entra por `next/dynamic({ ssr: false })`. */
export default function ConsultorMapa({ pontos, visitas, dark }: { pontos: PointView[]; visitas: VisitView[]; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import('leaflet').Map | null = null;
    let vivo = true;
    void (async () => {
      const L = await import('leaflet');
      if (!vivo || !ref.current) return;
      const trilha = [...pontos].sort((a, b) => a.at.localeCompare(b.at)).map((p) => [p.lat, p.lng] as [number, number]);
      const checkins = visitas.map((v) => [v.checkin_lat, v.checkin_lng] as [number, number]);
      const todos = [...trilha, ...checkins];
      if (todos.length === 0) return;
      map = L.map(ref.current, { zoomControl: true, attributionControl: false });
      L.tileLayer(dark ? TILES : TILES_LIGHT, { maxZoom: 19 }).addTo(map);
      if (trilha.length > 1) L.polyline(trilha, { color: '#ECA826', weight: 3, opacity: 0.85 }).addTo(map);
      for (const v of visitas) {
        L.circleMarker([v.checkin_lat, v.checkin_lng], {
          radius: 7,
          color: v.far_from_place ? '#B4432E' : '#3E8E5A',
          weight: 2,
          fillOpacity: 0.8,
        })
          .bindTooltip(v.lead_name)
          .addTo(map);
      }
      map.fitBounds(L.latLngBounds(todos), { padding: [24, 24], maxZoom: 17 });
    })();
    return () => {
      vivo = false;
      map?.remove();
    };
  }, [pontos, visitas, dark]);

  return <div ref={ref} className="h-80 w-full overflow-hidden rounded-md border border-border" />;
}
```

Crie `web/src/components/praca/ConsultorLinhaDoTempo.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { VisitView } from '@/modules/campo/domain/campo.types';
import { fotoDaVisitaEquipe, type DiaConsultor } from '@/modules/consultores/infrastructure/consultores.api';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const SITUACAO: Record<string, string> = { ja_usa: 'Já usa o Freela', cadastrou_qr: 'Cadastrou agora pelo QR', nao_cadastrou: 'Não cadastrou' };
const INTERESSE: Record<string, string> = { alto: 'alto', medio: 'médio', baixo: 'baixo', nenhum: 'nenhum' };

function FotoVisita({ visita }: { visita: VisitView }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    let atual: string | null = null;
    fotoDaVisitaEquipe(visita.id)
      .then((b) => {
        if (!vivo) return;
        atual = URL.createObjectURL(b);
        setUrl(atual);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
      if (atual) URL.revokeObjectURL(atual);
    };
  }, [visita.id]);
  if (!url) return <div className="h-24 w-32 shrink-0 rounded-md bg-secondary" />;
  return <img src={url} alt={`Fachada — ${visita.lead_name}`} className="h-24 w-32 shrink-0 rounded-md object-cover" />;
}

/** Linha do tempo do dia (spec §8.2): início · visitas · fim/"não encerrada". */
export function ConsultorLinhaDoTempo({ dia }: { dia: DiaConsultor }) {
  if (dia.journeys.length === 0) return <p className="text-sm text-muted-foreground">Sem jornada neste dia.</p>;
  return (
    <ol className="space-y-3">
      {dia.journeys.map((j) => (
        <li key={j.id} className="space-y-3">
          <p className="text-sm">
            <strong>{hora(j.started_at)}</strong> · Início da jornada
          </p>
          {dia.visits
            .filter((v) => v.journey_id === j.id)
            .map((v) => {
              const min = v.checkout_at ? Math.round((Date.parse(v.checkout_at) - Date.parse(v.checkin_at)) / 60000) : null;
              const a = v.answers;
              return (
                <div key={v.id} className="card-surface flex gap-3 p-3">
                  <FotoVisita visita={v} />
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-bold">
                      {hora(v.checkin_at)} · {v.lead_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {min != null ? `${min} min` : 'sem checkout'}
                      {v.far_from_place ? ' · longe do local' : ''}
                      {v.auto_closed ? ' · fechada à meia-noite' : ''}
                      {v.possible_dup ? ' · possível duplicado' : ''}
                    </p>
                    {a.interlocutor_name && (
                      <p>
                        {a.interlocutor_name} ({a.interlocutor_role}) · {a.freela_status ? SITUACAO[a.freela_status] : '—'} · interesse{' '}
                        {a.interest ? INTERESSE[a.interest] : '—'}
                      </p>
                    )}
                    {a.open_vagas != null && (
                      <p className="text-xs">
                        Vagas: {a.open_vagas}
                        {a.vaga_roles.length ? ` (${a.vaga_roles.join(', ')})` : ''} · freelas/semana: {a.freelas_per_week ?? '—'} · canais:{' '}
                        {[...a.channels, a.channel_other].filter(Boolean).join(', ') || '—'}
                      </p>
                    )}
                    {a.needs_followup && (
                      <p className="text-xs">
                        Retorno: {a.followup_what} ({a.followup_date})
                      </p>
                    )}
                    {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                  </div>
                </div>
              );
            })}
          <p className="text-sm">
            {j.ended_at ? (
              <>
                <strong>{hora(j.ended_at)}</strong> · Fim da jornada{j.auto_closed ? ' — não encerrada (fechada à meia-noite)' : ''}
              </>
            ) : (
              <span className="text-primary">Em jornada agora</span>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
```

Crie `web/src/components/praca/CanaisCampo.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useCanaisCampo, useSalvarCanaisCampo } from '@/modules/consultores/application/use-consultores';

/** Configurações → "Apps e canais (campo)": a lista do questionário (1–30 itens, 1–80 caracteres, sem repetir). */
export function CanaisCampo() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const { data } = useCanaisCampo();
  const salvar = useSalvarCanaisCampo();
  const [lista, setLista] = useState<string[]>([]);
  const [novo, setNovo] = useState('');
  useEffect(() => {
    if (data) setLista(data);
  }, [data]);

  const adicionar = () => {
    const v = novo.trim().slice(0, 80);
    if (!v || lista.some((x) => x.toLowerCase() === v.toLowerCase()) || lista.length >= 30) return;
    setLista([...lista, v]);
    setNovo('');
  };

  return (
    <section className="mt-8">
      <h2 className="tag text-muted-foreground">Apps e canais (campo)</h2>
      <p className="mt-1 text-xs text-muted-foreground">Opções da pergunta “Apps e canais que usa hoje” no questionário da visita.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {lista.map((c) => (
          <li key={c} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
            {c}
            {admin && (
              <button aria-label={`Remover ${c}`} onClick={() => setLista(lista.filter((x) => x !== c))} className="text-muted-foreground">
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <div className="mt-3 flex gap-2">
          <Input aria-label="Novo app ou canal" value={novo} maxLength={80} onChange={(e) => setNovo(e.target.value)} placeholder="Novo app ou canal" />
          <Button variant="outline" onClick={adicionar}>
            Adicionar
          </Button>
          <Button onClick={() => salvar.mutate(lista)} disabled={salvar.isPending || lista.length === 0}>
            Salvar
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Telas — lista e detalhe**

Crie `web/src/app/(app)/consultores/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ConsultorDialog } from '@/components/praca/ConsultorDialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useConsultores } from '@/modules/consultores/application/use-consultores';

const SITUACAO = { em_jornada: 'em jornada agora', encerrou: 'encerrou', nao_iniciou: 'não começou' } as const;
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';

export default function ConsultoresPage() {
  const { user } = useAuth();
  const { data: consultores, isPending } = useConsultores();
  const [novo, setNovo] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">Consultores de campo</h1>
        {user?.is_admin && <Button onClick={() => setNovo(true)}>Novo consultor</Button>}
      </div>
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : !consultores?.length ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum consultor ainda.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {consultores.map((c) => (
            <li key={c.id} className={`card-surface p-4 ${c.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/consultores/${c.id}`} className="font-bold hover:underline">
                  {c.name}
                </Link>
                <span className="text-xs text-muted-foreground">{c.active ? SITUACAO[c.today.status] : 'desativado'}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.praca_name} · {c.today.visits} visitas hoje · {c.today.cadastros} cadastrou agora · último ponto {hora(c.today.last_point_at)}
              </p>
              <p className="mt-1 text-xs">
                {c.freela_code ? `Código Freela: ${c.freela_code}` : `Código pendente${c.freela_sync_error ? ` — ${c.freela_sync_error}` : ''}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {novo && <ConsultorDialog aberto onFechar={() => setNovo(false)} />}
    </>
  );
}
```

Crie `web/src/app/(app)/consultores/[id]/page.tsx`:

```tsx
'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { QrDoFreela } from '@/components/campo/QrDoFreela';
import { ConsultorDialog } from '@/components/praca/ConsultorDialog';
import { ConsultorLinhaDoTempo } from '@/components/praca/ConsultorLinhaDoTempo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { todaySp } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import {
  useConsultor,
  useDiaConsultor,
  useFreelaSyncConsultor,
  useResetSenhaConsultor,
  useUpdateConsultor,
} from '@/modules/consultores/application/use-consultores';

const ConsultorMapa = dynamic(() => import('@/components/praca/ConsultorMapa'), { ssr: false });

export default function ConsultorDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const dark = user?.theme !== 'light';
  const [dia, setDia] = useState(todaySp());
  const { data: c } = useConsultor(id);
  const { data: diaDados, isPending } = useDiaConsultor(id, dia);
  const atualizar = useUpdateConsultor(id);
  const resetar = useResetSenhaConsultor(id);
  const sincronizar = useFreelaSyncConsultor(id);
  const [editando, setEditando] = useState(false);
  const [qr, setQr] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [senha, setSenha] = useState<string | null>(null);

  if (!c) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const pontos = diaDados?.journeys.flatMap((j) => j.points) ?? [];

  return (
    <>
      <h1 className="font-display text-xl font-extrabold">{c.name}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {c.praca_name} · {c.email} · {c.phone} · {c.active ? 'ativo' : 'desativado'}
      </p>
      <p className="mt-1 text-xs">
        {c.freela_code ? `Código Freela: ${c.freela_code}` : `Código pendente${c.freela_sync_error ? ` — ${c.freela_sync_error}` : ''}`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setQr(true)}>
          Ver QR code
        </Button>
        {admin && (
          <>
            <Button variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const msg = c.active ? 'Desativar? O acesso dele para na hora e o código no Freela deixa de vincular cadastros.' : 'Reativar o consultor?';
                if (window.confirm(msg)) atualizar.mutate({ active: !c.active });
              }}
            >
              {c.active ? 'Desativar' : 'Reativar'}
            </Button>
            <Button variant="outline" onClick={() => setSenhaAberta(true)}>
              Nova senha provisória
            </Button>
            {(!c.freela_code || c.freela_sync_error) && (
              <Button variant="outline" onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
                Tentar código no Freela
              </Button>
            )}
          </>
        )}
      </div>

      <section className="mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <label htmlFor="dia" className="tag text-muted-foreground">
            Dia
          </label>
          <Input id="dia" type="date" max={todaySp()} value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="w-44" />
        </div>
        {isPending || !diaDados ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ConsultorLinhaDoTempo dia={diaDados} />
            {(pontos.length > 0 || diaDados.visits.length > 0) && <ConsultorMapa pontos={pontos} visitas={diaDados.visits} dark={dark} />}
          </div>
        )}
      </section>

      {editando && <ConsultorDialog aberto consultor={c} onFechar={() => setEditando(false)} />}

      <Dialog open={qr} onOpenChange={setQr}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR code de {c.name}</DialogTitle>
          </DialogHeader>
          <QrDoFreela url={c.signup_url} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={senhaAberta}
        onOpenChange={(o) => {
          if (!o) {
            setSenhaAberta(false);
            setSenha(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova senha provisória</DialogTitle>
          </DialogHeader>
          {senha ? (
            <div className="space-y-3">
              <p className="text-sm">Aparece só agora. O acesso aberto no celular dele caiu; ele entra com esta senha e troca.</p>
              <p data-testid="senha-provisoria" className="rounded-md bg-secondary p-3 text-center font-mono text-lg">
                {senha}
              </p>
              <Button
                onClick={() => {
                  setSenhaAberta(false);
                  setSenha(null);
                }}
                className="w-full"
              >
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">Gera uma senha nova e derruba o acesso aberto no celular do consultor.</p>
              <Button onClick={() => resetar.mutate(undefined, { onSuccess: (r) => setSenha(r.temp_password) })} disabled={resetar.isPending} className="w-full">
                Gerar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 5: Menu e Configurações**

Em `web/src/components/praca/AppShell.tsx`, no objeto `I`, acrescente o ícone (pessoa com alfinete):

```ts
  consultores: "M9 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 0112 0v1M18 8s-3 2.5-3 5a3 3 0 006 0c0-2.5-3-5-3-5z",
```

e, em `NAV`, logo depois de `{ to: "/funil", label: "Funil", icon: I.funil },`:

```ts
  { to: "/consultores", label: "Consultores", icon: I.consultores },
```

Em `web/src/app/(app)/configuracoes/page.tsx`, importe `import { CanaisCampo } from '@/components/praca/CanaisCampo';` e, em `ConfiguracoesPage`, logo depois de `<Pessoas />`, acrescente `<CanaisCampo />`.

- [ ] **Step 6: Rodar o browser-check e ver passar; tipos e lint**

Suba a API (`npm run start:smoke`) e o web (`yarn dev`) em segundo plano.

Run: `cd /home/doutor/coding/freela/praca/web && yarn browser-check`
Expected: as checagens "Equipe: Consultores" verdes (menu, lista, detalhe com linha do tempo, respostas, mapa, foto, nova senha derruba a sessão do celular, canais nas Configurações); nenhum erro de console/HTTP; limpeza sem resíduo.

Mate os dois processos; `ss -ltn | grep -E ':(3014|3024) '` vazio. Depois, um de cada vez: `yarn typecheck`, `yarn lint`.

- [ ] **Step 7: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add web/src/modules/consultores web/src/components/praca/ConsultorDialog.tsx web/src/components/praca/ConsultorMapa.tsx web/src/components/praca/ConsultorLinhaDoTempo.tsx web/src/components/praca/CanaisCampo.tsx "web/src/app/(app)/consultores" web/src/components/praca/AppShell.tsx "web/src/app/(app)/configuracoes/page.tsx" web/scripts/browser-check.mjs
git commit -m "feat(web): tela Consultores — lista, dia com linha do tempo e mapa, ações de admin e canais do campo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Documentação, `.env.example` e verificação final

**Files:**
- Modify: `api/.env.example`, `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–12.
- Produces: documentação de operação do bloco A; nenhuma interface nova.

- [ ] **Step 1: `.env.example`**

Em `api/.env.example`, depois do bloco `FREELA_*`, acrescente:

```dotenv
# Consultores de campo (bloco A) — ver README, "Consultores de campo"
# Link do QR code: ${FREELA_WEB_URL}/cadastro?consultor=CÓDIGO (vazio = sem QR)
FREELA_WEB_URL=
# Validade do acesso do consultor no celular
CAMPO_JWT_EXPIRES_IN=7d
# Fotos das fachadas: s3 (padrão em produção) | disk (padrão fora dela)
PHOTO_STORAGE=disk
PHOTOS_DIR=./uploads
# Bucket S3 PRIVADO (produção). Chaves vazias = cadeia padrão do SDK (papel da instância)
S3_BUCKET=
S3_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

- [ ] **Step 2: README — seção "Consultores de campo"**

Em `README.md`, depois da seção da integração com o Freela, acrescente:

```markdown
## Consultores de campo (bloco A)

Pessoas que visitam bares e restaurantes a pé e levam o dono a se cadastrar no
Freela. Conta **separada** da equipe (tabela `field_consultants`, token com
`aud: "campo"`, telas em `/campo`). Desenho: `docs/superpowers/specs/2026-10-08-consultores-de-campo-design.md`;
contrato: `docs/api-contract.md` §20.

- **Equipe** (`/consultores`, menu "Consultores"): admin cria o consultor (nome,
  e-mail, telefone, CPF, praça, chave Pix) e recebe a senha provisória **uma vez**;
  vê por dia a linha do tempo (início, visitas com foto e respostas, fim) e o mapa
  do trajeto; desativa (derruba o acesso na hora), gera nova senha, vê o QR.
  Configurações → "Apps e canais (campo)" edita a lista do questionário.
- **Consultor** (`/campo/entrar`, atalho "Praça Campo" na tela inicial do
  celular): inicia a jornada, faz visitas (foto da fachada + questionário +
  checkout), mostra o QR code e encerra. Sem sinal, tudo fica numa fila no
  aparelho (IndexedDB) e é enviado quando o sinal volta. A localização só é
  gravada com a jornada aberta e com a página aberta (a cada 5 min + check-in,
  checkout, início e fim) — com a tela apagada, não grava.
- **QR code:** ao criar o consultor, o Praça cria um consultor no api-freela
  (`POST /v1/admins/consultants`); o link é `${FREELA_WEB_URL}/cadastro?consultor=CÓDIGO`.
  O Freela manda ao consultor um e-mail de boas-vindas do portal de consultores
  de lá (decisão do dono: aceito). Freela fora → "código pendente" e nova
  tentativa a cada 2 min (e-mail já usado no Freela exige ação do admin).
- **Meia-noite (00:05 Brasília):** jornadas e visitas esquecidas abertas fecham
  sozinhas, marcadas ("não encerrada" / "sem checkout").
- **CRM:** cada checkout vira evento "Visita" no lead; interlocutor → decisor;
  "Lead novo"/"Contatado" → "Conversa aberta"; pedido de retorno → próximo passo.
  Estabelecimento novo nasce com origem "visita de campo" e a localização do check-in.

**Produção — o que o dono precisa providenciar:**
1. Permissão **`CONSULTANTS`** na conta de admin do Freela usada em `FREELA_ADMIN_EMAIL`.
2. **Bucket S3 privado** + chave com acesso só a ele (`S3_BUCKET`, `S3_REGION`,
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) — direto no `.env` do servidor.
   Sem bucket, a API sobe e as rotas de foto respondem `503 PHOTO_STORAGE_NOT_CONFIGURED`.
   Não use `PHOTO_STORAGE=disk` no EC2 compartilhado com o Freela (o disco enche).
3. `FREELA_WEB_URL` = endereço público do cadastro do Freela web.
```

- [ ] **Step 3: CLAUDE.md — regras novas**

Em `CLAUDE.md`, na lista "Regras rápidas", acrescente:

```markdown
- **Consultor de campo ≠ equipe.** Token com `aud: "campo"`; rotas `/v1/campo/*`
  marcadas com `@CampoRoute()` (o `JwtAuthGuard` global delega ao
  `CampoAuthGuard`). Rota nova do consultor SEM `@CampoRoute()` fica fechada
  para ele (e aberta só para a equipe) — é o comportamento seguro por padrão.
  No web, a sessão do consultor é `campoSession` (separada de `authUser`).
- **Índices únicos parciais (`field_journeys`, `field_visits`) não existem para o
  Prisma.** Toda `prisma migrate dev` futura vai propor `DROP INDEX` deles:
  gere com `--create-only`, **apague essas linhas do SQL** e aplique com
  `migrate deploy`.
- Fotos do campo passam pela API (`PhotoStorage`): nunca link público do bucket.
```

- [ ] **Step 4: Verificação final (um processo por vez, nesta ordem)**

1. `cd /home/doutor/coding/freela/praca && docker compose up -d postgres` (se não estiver de pé).
2. `cd api && npm test` → Expected: PASS em todas as suítes (as 27 antigas + as novas do campo); nada mais de pé.
3. `npm run typecheck` → Expected: sem erro.
4. `npm run start:smoke` em segundo plano → `curl -s localhost:3014/health` → `npm run smoke` → Expected: todas as checagens verdes (as 771 antigas + as do campo), sem resíduo. Mate a API.
5. `cd ../web && yarn test` → PASS; `yarn typecheck` → sem erro; `yarn lint` → sem erro.
6. API (`start:smoke`) + web (`yarn dev`) em segundo plano → `yarn browser-check` → Expected: tudo verde, sem resíduo. Mate os dois.
7. `ss -ltn | grep -E ':(3014|3024) '` → vazio.
8. `cd .. && docker compose stop postgres`.

Se qualquer passo falhar: pare, conserte na tarefa dona do código (com teste que pine o defeito) e recomece deste passo.

- [ ] **Step 5: Commit**

```bash
cd /home/doutor/coding/freela/praca
git add api/.env.example README.md CLAUDE.md
git commit -m "docs: consultores de campo — README, CLAUDE.md e .env.example

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
