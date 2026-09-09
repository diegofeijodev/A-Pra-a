# PRAÇA — Plano de implementação do port

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir o protótipo Lovable "PRAÇA" como sistema real (API NestJS + Postgres, web Next.js) e ligá-lo ao sistema de campanhas do Freela (normais e automáticas) via API.

**Architecture:** `api/` NestJS 11 + Fastify + Prisma 5.22 + PostgreSQL, um módulo Nest por área de negócio (`src/modules/<area>/`), regra de negócio no servidor, catálogo estático em `src/domain/catalog/`. `web/` Next.js 15 App Router que porta as telas do protótipo 1:1 trocando o store em `localStorage` por react-query + axios. Integração Freela isolada em `src/modules/freela/` (porta `FreelaClient` + outbox/sync em `@nestjs/schedule`).

**Tech Stack:** NestJS 11, Fastify 5, Prisma 5.22, PostgreSQL 16 (docker), class-validator, @nestjs/schedule, @nestjs/jwt, bcryptjs, jest + ts-jest (API); Next.js 15, React 19, Tailwind 4, shadcn/Radix, @tanstack/react-query 5, axios, zod, zustand, leaflet, lucide-react, sonner (web); Playwright (browser-check, via `freela-web-v2/node_modules`).

**Spec:** `docs/superpowers/specs/2026-09-09-praca-port-design.md` — leia antes de qualquer tarefa.

## Global Constraints

- Raiz do projeto: `/home/doutor/coding/freela/praca/`. Repo git próprio. **Commit a cada tarefa** (autor padrão; mensagem em pt-BR, prefixo `feat|fix|chore|docs|test`).
- Protótipo de referência (leitura, gitignored): `/home/doutor/coding/freela/praca/.prototype/src/` — `lib/praca/*.ts` (domínio), `routes/*.tsx` (telas), `components/praca/*.tsx` (componentes), `components/ui/*` (kit shadcn), `styles.css` (paleta).
- Molde de infraestrutura para copiar: `/home/doutor/coding/freela/meu-par/` (api: `src/common/**`, `src/main.ts`, `src/app.module.ts`, `src/shared/auth/**`, `scripts/smoke.sh`, `Dockerfile`, `eslint.config.mjs`, `.prettierrc`, `tsconfig.json`, `nest-cli.json`; web: `src/modules/shared/infrastructure/http.ts`, `src/modules/auth/**`, `src/app/providers.tsx`, `src/app/(app)/layout.tsx`, `scripts/browser-check.mjs`, `postcss.config.mjs`, `next.config.ts`, `tsconfig.json`).
- Portas: API **3014**, web **3024**, Postgres **5437** (container `praca-postgres`, user/pass/db `praca`/`praca`/`praca`).
- `api/` usa **npm**; `web/` usa **yarn** (1.22). Nunca `npm install` no web.
- Wire **snake_case** espelhando o banco. Data só-dia = string `"YYYY-MM-DD"`. Timestamp = ISO UTC. "Hoje" = `todaySp()` de `src/common/time/dates.ts`. Dinheiro/valores = número no JSON.
- Erro sempre `{ error: { code, message } }` (`HttpExceptionFilter` global). Códigos em MAIÚSCULO_SNAKE.
- `ValidationPipe` global `whitelist + forbidNonWhitelisted + transform` — **todo campo aceito precisa de decorator no DTO**.
- Todas as rotas exigem JWT (`JwtAuthGuard` global) exceto as marcadas `@Public()`.
- Id vindo da URL passa por `isUuid()` (404 `NOT_FOUND`, nunca 500). Rotas estáticas antes das `:id`.
- Conjuntos fechados são `String`/`Int` no Prisma com `@IsIn`/`@IsInt` no DTO (rótulos pt-BR com acento). Sem enum de banco.
- Testes unitários da API em `src/**/__tests__/*.spec.ts` (jest + ts-jest). Smoke em `api/scripts/smoke.sh` (bash + curl + jq contra a API viva), **repetível e sem resíduo** (sufixo por rodada).
- **Um build/typecheck por vez** nesta máquina. Prefira `tsc --noEmit` a `next build`.
- Textos de UI em pt-BR idênticos ao protótipo. Não "melhorar" copy.
- Contrato canônico: `docs/api-contract.md` — cada tarefa de API acrescenta sua seção.

---

## Mapa de arquivos (API)

```
api/
  package.json · tsconfig.json · nest-cli.json · eslint.config.mjs · .prettierrc · jest.config.js
  .env.example · Dockerfile
  prisma/schema.prisma · prisma/seed.ts · prisma/seed-data/{template-actions,leads,msg-templates,cadences,midia}.ts
  scripts/smoke.sh
  src/main.ts · src/app.module.ts
  src/common/{config/env.validation.ts, database/{prisma.module,prisma.service}.ts, filters/http-exception.filter.ts,
              guards/jwt-auth.guard.ts, decorators/{current-user,public,admin-only}.decorator.ts, auth/auth-user.ts,
              ids/uuid.ts, time/dates.ts, health/{health.module,health.controller}.ts, phone/phone.ts}
  src/domain/catalog/{steps,funnel,messages,cadences,midia,indicators}.ts   ← constantes do protótipo
  src/domain/{recurrence.ts, template-render.ts, send-schedule.ts, dedup.ts}  ← funções puras
  src/modules/auth/            (auth.module, auth.controller, auth.service, dto/auth.dto.ts)
  src/modules/users/           (users.module, users.controller, users.service, dto/users.dto.ts)
  src/modules/catalog/         (catalog.module, catalog.controller)
  src/modules/geo/             (geo.module, geo.controller, geo.service, data/municipios.json)
  src/modules/pracas/          (pracas.module, pracas.controller, pracas.service, agenda.service, dto/pracas.dto.ts)
  src/modules/actions/         (actions.module, actions.controller, actions.service, template-actions.controller, dto/actions.dto.ts)
  src/modules/indicators/      (indicators.module, indicators.controller, indicators.service)
  src/modules/leads/           (leads.module, leads.controller, leads.service, queue.service, dto/leads.dto.ts)
  src/modules/imports/         (imports.module, imports.controller, imports.service, dto/imports.dto.ts)
  src/modules/public/          (public.module, public.controller)
  src/modules/messages/        (messages.module, templates.controller, settings.controller, blocklist.controller, messages.service, dto/messages.dto.ts)
  src/modules/disparos/        (disparos.module, disparos.controller, disparos.service, sends.controller, dto/disparos.dto.ts)
  src/modules/cadences/        (cadences.module, cadences.controller, cadences.service, cadence-engine.service, cadence.scheduler.ts, dto/cadences.dto.ts)
  src/modules/midia/           (midia.module, campanhas.controller, creatives.controller, traffic.controller, proofs.controller, midia.service, dto/midia.dto.ts)
  src/modules/notifications/   (notifications.module, notifications.controller, notifications.service)
  src/modules/freela/          (freela.module, freela.controller, freela-client.ts, freela-template.ts, freela-campaigns.service, freela-templates.service, freela-sync.scheduler.ts)
```

## Mapa de arquivos (web)

```
web/
  package.json · tsconfig.json · next.config.ts · postcss.config.mjs · .env.local
  scripts/browser-check.mjs
  src/app/{layout.tsx, providers.tsx, globals.css, page.tsx→redirect}
  src/app/entrar/page.tsx
  src/app/formulario/[pracaId]/page.tsx
  src/app/(app)/layout.tsx  (guarda + AppShell)
  src/app/(app)/{hoje,praca,funil,entrada,mensagens,campanhas,calendario,indicadores,configuracoes,freela}/page.tsx
  src/components/ui/*  (copiado do protótipo)
  src/components/praca/{AppShell,ActionPanel,LeadPanel,MoveLeadDialog,NovoLeadDialog,bits,IndBits,AberturaPraca,Disparos,Cadencias,CampEstrategia,CampCriativos,CampTrafego,CampCalendario,FreelaCampaignDialog,FreelaTemplateDialog}.tsx
  src/lib/{dates.ts, format.ts, utils.ts, intake.ts (parse CSV/XML no navegador), ui-store.ts}
  src/modules/shared/infrastructure/http.ts
  src/modules/auth/{domain/auth.types.ts, infrastructure/{auth.api,auth.storage}.ts, application/{auth.store,use-auth}.ts}
  src/modules/catalog/{infrastructure/catalog.api.ts, application/use-catalog.ts}
  src/modules/<area>/{infrastructure/<area>.api.ts, application/use-<area>.ts}  para pracas, actions, leads, imports,
      messages, disparos, cadences, midia, indicators, notifications, users, geo, freela
```

---

## Fase A — API

### Task 1: Scaffold da API, infraestrutura comum e schema Prisma completo

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/nest-cli.json`, `api/eslint.config.mjs`, `api/.prettierrc`, `api/jest.config.js`, `api/.env.example`, `api/.env`, `api/Dockerfile`, `docker-compose.yml` (raiz), `.gitignore` (já existe), `README.md` (esqueleto), `CLAUDE.md`
- Create: `api/src/main.ts`, `api/src/app.module.ts`, `api/src/common/config/env.validation.ts`, `api/src/common/database/prisma.module.ts`, `api/src/common/database/prisma.service.ts`, `api/src/common/filters/http-exception.filter.ts`, `api/src/common/guards/jwt-auth.guard.ts`, `api/src/common/decorators/current-user.decorator.ts`, `api/src/common/decorators/public.decorator.ts`, `api/src/common/decorators/admin-only.decorator.ts`, `api/src/common/auth/auth-user.ts`, `api/src/common/ids/uuid.ts`, `api/src/common/time/dates.ts`, `api/src/common/phone/phone.ts`, `api/src/common/health/health.module.ts`, `api/src/common/health/health.controller.ts`
- Create: `api/prisma/schema.prisma`, `api/prisma/migrations/<ts>_init/migration.sql` (gerada)
- Test: `api/src/common/__tests__/dates.spec.ts`, `api/src/common/__tests__/phone.spec.ts`

**Interfaces (produz):**
- `PrismaService` (extends `PrismaClient`), injetável.
- `AuthUser { id: string; email: string; name: string; is_admin: boolean }` em `request.user`; `@CurrentUser()`; `@Public()`; `@AdminOnly()` (guard lança `403 FORBIDDEN` "Só administradores" quando `!user.is_admin`).
- `isUuid(v)`; `todaySp()`, `addDays(d, n)`, `daysBetween(a, b)`, `dateFromString`, `dateToString`, `eachDay`, `weekdayOf(d): 0..6` (0 = domingo, calculado em UTC meio-dia), `monthDayOf(d)`.
- `phoneKey(p): string` (só dígitos, últimos 9 — igual ao protótipo `mensagens.ts:100`), `toE164BR(p): string | null` (`+55` + DDD + número; aceita máscara `(31) 98765-4321`, `31987654321`, `5531987654321`, `+55…`; retorna `null` se não tiver 10–11 dígitos nacionais).
- Todos os nomes de modelo/coluna do schema abaixo — **canônicos para todas as tarefas**.

- [ ] **Step 1: Copiar o molde do meu-par e ajustar nomes/portas**

```bash
cd /home/doutor/coding/freela/praca
mkdir -p api/src/common api/prisma api/scripts
cp -r ../meu-par/api/src/common/{config,database,filters,guards,decorators,auth,ids,time,health} api/src/common/
rm api/src/common/decorators/current-couple.decorator.ts api/src/common/time/special-dates.ts
cp ../meu-par/api/{tsconfig.json,nest-cli.json,eslint.config.mjs,.prettierrc,Dockerfile} api/
cp ../meu-par/api/src/main.ts api/src/main.ts
```

Ajustes obrigatórios:
- `api/package.json`: nome `praca-api`, mesmas dependências do meu-par **menos** `@fastify/multipart` e **mais** `jest@^29.7.0`, `ts-jest@^29.2.5`, `@types/jest@^29.5.14` (devDependencies). Scripts: `build`, `start`, `start:dev`, `start:prod` (`node dist/src/main`), `lint`, `typecheck`, `test` (`jest`), `prisma:generate`, `prisma:migrate:dev`, `prisma:migrate:deploy`, `prisma:studio`, `seed` (`ts-node -r tsconfig-paths/register prisma/seed.ts`), `smoke` (`bash scripts/smoke.sh`).
- `api/jest.config.js`: `{ preset: 'ts-jest', testEnvironment: 'node', rootDir: 'src', testRegex: '.*\\.spec\\.ts$' }`.
- `env.validation.ts`: `PORT` default `3014`; `PUBLIC_URL` default `http://localhost:3014`; `APP_URL` default `http://localhost:3024`; remover `UPLOADS_DIR` e `ZAPI_*`/`QUEUE_*`; adicionar `FREELA_API_URL: z.string().default('')`, `FREELA_ADMIN_EMAIL: z.string().default('')`, `FREELA_ADMIN_PASSWORD: z.string().default('')`, `FREELA_PER_CONTACT_MESSAGE: z.string().default('false')`, `CADENCE_ENGINE_ENABLED: z.string().default('true')`, `FREELA_SYNC_ENABLED: z.string().default('true')`.
- `main.ts`: título Swagger "PRAÇA — API", descrição "Checklist de abertura de praças, funil de contratantes, mensagens, campanhas e integração com o Freela. Contrato em docs/api-contract.md."; remover `multipart` e `mkdirSync` de uploads; `bodyLimit: 8 * 1024 * 1024` (importações de até 5.000 linhas); porta default 3014; log `📍 PRAÇA API`.
- `jwt-auth.guard.ts`: payload `{ sub, email, name, is_admin }`; sem consulta de casal — mas **conferir `users.active`** (`findUnique({ where: { id: payload.sub }, select: { active: true, is_admin: true } })`; inativo ⇒ `401 UNAUTHORIZED` "Conta desativada"). `request.user = { id, email, name, is_admin }`.
- `auth-user.ts`: só `AuthUser` acima.
- Criar `admin-only.decorator.ts`: `SetMetadata('adminOnly', true)` + no `JwtAuthGuard`, depois de resolver o usuário, se o handler/classe tem `adminOnly` e `!is_admin` ⇒ `ForbiddenException({ code: 'FORBIDDEN', message: 'Só administradores podem fazer isso.' })`.
- `dates.ts`: manter tudo do meu-par e acrescentar:

```ts
/** Dia da semana (0 = domingo … 6 = sábado) de uma date-string, imune a fuso. */
export const weekdayOf = (dateStr: string): number => dateFromString(dateStr).getUTCDay();
export const monthDayOf = (dateStr: string): number => Number(dateStr.slice(8, 10));
/** ISO UTC de agora. */
export const nowIso = (): string => new Date().toISOString();
/** Hora local de Brasília (0..23) de um instante. */
export function hourSp(date: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(date).replace('24', '0'));
}
/** Dia da semana em Brasília (0..6) de um instante. */
export function weekdaySp(date: Date = new Date()): number {
  return weekdayOf(todaySp(date));
}
```

- `phone.ts`:

```ts
export const digits = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');
/** Chave de comparação: últimos 9 dígitos (igual ao protótipo). */
export const phoneKey = (p: string | null | undefined): string => digits(p).slice(-9);
/** +55DDDNÚMERO. null se não parecer telefone brasileiro (10 ou 11 dígitos nacionais). */
export function toE164BR(p: string | null | undefined): string | null {
  let d = digits(p);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}
```

- `docker-compose.yml` na raiz: igual ao do meu-par com `praca-postgres`, `POSTGRES_USER/PASSWORD/DB = praca`, porta `5437:5432`, volume `praca_pgdata`; serviço `api` (profile `full`) porta 3014, `CORS_ORIGINS: http://localhost:3024`, sem volume de uploads.
- `api/.env.example` e `api/.env`:

```
NODE_ENV=development
PORT=3014
DATABASE_URL=postgresql://praca:praca@localhost:5437/praca?schema=public
JWT_SECRET=dev-secret-change-me-please
JWT_EXPIRES_IN=12h
CORS_ORIGINS=http://localhost:3024
PUBLIC_URL=http://localhost:3014
APP_URL=http://localhost:3024
CADENCE_ENGINE_ENABLED=true
# Integração com o Freela (api-freela). Sem as três, /v1/freela/* responde 503.
FREELA_API_URL=
FREELA_ADMIN_EMAIL=
FREELA_ADMIN_PASSWORD=
# Só ligue depois de o api-freela de produção aceitar contacts[].message.
FREELA_PER_CONTACT_MESSAGE=false
FREELA_SYNC_ENABLED=true
```

- [ ] **Step 2: Escrever o schema Prisma completo**

`api/prisma/schema.prisma` — copiar **integralmente**:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── pessoas ──────────────────────────────────────────────────
model users {
  id              String   @id @default(uuid()) @db.Uuid
  email           String   @unique
  password_hash   String
  name            String
  role_label      String   @default("")
  color           String   @default("#ECA826")
  phone           String   @default("")
  is_admin        Boolean  @default(false)
  active          Boolean  @default(true)
  theme           String   @default("dark")
  active_praca_id String?  @db.Uuid
  sort            Int      @default(0)
  created_at      DateTime @default(now())

  dismissed_notifs user_dismissed_notifs[]
}

model user_dismissed_notifs {
  user_id  String   @db.Uuid
  notif_id String
  at       DateTime @default(now())
  user     users    @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@id([user_id, notif_id])
}

// ── praça ────────────────────────────────────────────────────
model pracas {
  id               String   @id @default(uuid()) @db.Uuid
  name             String
  city             String
  start_date       String
  end_date         String
  cobertura_uf     String?
  cobertura_cidade String?
  cobertura_ibge   String?
  lat              Float?
  lon              Float?
  vizinhas         String[] @default([])
  created_at       DateTime @default(now())

  step_states praca_step_states[]
  actions     actions[]
  leads       leads[]
  proofs      proofs[]
  campanhas   campanhas[]
}

model praca_step_states {
  praca_id      String    @db.Uuid
  step_n        Int
  actual        Float?
  unlocked_by   String?   @db.Uuid
  unlocked_at   DateTime?
  unlock_reason String?
  praca         pracas    @relation(fields: [praca_id], references: [id], onDelete: Cascade)

  @@id([praca_id, step_n])
}

// ── roteiro-modelo e ações ───────────────────────────────────
model template_actions {
  id             String   @id @default(uuid()) @db.Uuid
  key            String   @unique
  step           Int
  title          String
  owners         String[] @default([])
  rec_kind       String
  rec_day        Int?
  rec_start_day  Int?
  rec_end_day    Int?
  rec_weekday    Int?
  rec_month_day  Int?
  tools          String[] @default([])
  how_to         String[] @default([])
  expected       String?
  msg            String?
  attention      String?
  expects_result Boolean  @default(false)
  sort           Int      @default(0)
}

model actions {
  id             String    @id @default(uuid()) @db.Uuid
  praca_id       String    @db.Uuid
  template_key   String?
  step           Int
  title          String
  owners         String[]  @default([])
  rec_kind       String
  rec_day        Int?
  rec_start_day  Int?
  rec_end_day    Int?
  rec_weekday    Int?
  rec_month_day  Int?
  tools          String[]  @default([])
  expected       String?
  msg            String?
  attention      String?
  expects_result Boolean   @default(false)
  due_override   String?
  postpone_count Int       @default(0)
  completed_at   DateTime?
  completed_by   String?   @db.Uuid
  result         Float?
  sort           Int       @default(0)
  created_at     DateTime  @default(now())
  praca          pracas    @relation(fields: [praca_id], references: [id], onDelete: Cascade)

  completions action_completions[]
  comments    action_comments[]
  subitems    action_subitems[]

  @@index([praca_id, step])
}

model action_completions {
  action_id String   @db.Uuid
  date      String
  by        String   @db.Uuid
  at        DateTime @default(now())
  result    Float?
  action    actions  @relation(fields: [action_id], references: [id], onDelete: Cascade)

  @@id([action_id, date])
}

model action_comments {
  id        String   @id @default(uuid()) @db.Uuid
  action_id String   @db.Uuid
  author_id String   @db.Uuid
  at        DateTime @default(now())
  text      String
  action    actions  @relation(fields: [action_id], references: [id], onDelete: Cascade)
}

model action_subitems {
  id        String  @id @default(uuid()) @db.Uuid
  action_id String  @db.Uuid
  text      String
  done      Boolean @default(false)
  sort      Int     @default(0)
  action    actions @relation(fields: [action_id], references: [id], onDelete: Cascade)
}

// ── indicadores ──────────────────────────────────────────────
model indicator_entries {
  praca_id String @db.Uuid
  key      String
  date     String
  value    Float

  @@id([praca_id, key, date])
}

// ── funil ────────────────────────────────────────────────────
model leads {
  id              String    @id @default(uuid()) @db.Uuid
  praca_id        String?   @db.Uuid
  name            String
  city            String    @default("")
  address         String    @default("")
  phone           String    @default("")
  phone_key       String    @default("")
  cnpj            String?
  instagram       String?
  site            String?
  decisor         String    @default("—")
  decisor_role    String    @default("")
  classe          String    @default("alvo")
  origem          String    @default("prospecção")
  owner_id        String?   @db.Uuid
  stage           Int       @default(1)
  entered_at      String
  stage_since     String
  last_contact_at DateTime?
  next_step_what  String?
  next_step_date  String?
  lost_reason     String?
  reheat_at       String?
  archived        Boolean   @default(false)
  import_batch_id String?   @db.Uuid
  possible_dup    Boolean   @default(false)
  snooze_until    String?
  campanha_id     String?   @db.Uuid
  form_answer     String?
  is_test         Boolean   @default(false)
  created_at      DateTime  @default(now())
  praca           pracas?   @relation(fields: [praca_id], references: [id], onDelete: SetNull)

  events      lead_events[]
  vagas       lead_vagas[]
  sends       msg_sends[]
  enrollments enrollments[]

  @@index([praca_id, stage])
  @@index([phone_key])
  @@index([import_batch_id])
}

model lead_events {
  id           String   @id @default(uuid()) @db.Uuid
  lead_id      String   @db.Uuid
  at           DateTime @default(now())
  author_id    String?  @db.Uuid
  author_label String?
  kind         String
  text         String
  stage_to     Int?
  lead         leads    @relation(fields: [lead_id], references: [id], onDelete: Cascade)

  @@index([lead_id, at])
}

model lead_vagas {
  id      String  @id @default(uuid()) @db.Uuid
  lead_id String  @db.Uuid
  date    String
  funcao  String
  filled  Boolean @default(false)
  hours   Float?
  lead    leads   @relation(fields: [lead_id], references: [id], onDelete: Cascade)
}

model import_mappings {
  id         String   @id @default(uuid()) @db.Uuid
  name       String   @unique
  map        Json
  created_at DateTime @default(now())
}

model import_batches {
  id        String   @id @default(uuid()) @db.Uuid
  at        DateTime @default(now())
  file_name String
  by        String   @db.Uuid
  origem    String
  imported  Int
  ignored   Int
  reasons   String[] @default([])
}

// ── mensagens ────────────────────────────────────────────────
model msg_templates {
  id              String   @id @default(uuid()) @db.Uuid
  name            String
  audience        String
  stage           Int      @default(0)
  channel         String   @default("whatsapp")
  text_a          String
  text_b          String?
  attachment_kind String?
  attachment_name String?
  attachment_url  String?
  created_at      DateTime @default(now())
}

model app_settings {
  id                Int     @id @default(1)
  mode              String  @default("fila")
  window_start      Int     @default(9)
  window_end        Int     @default(19)
  sunday            Boolean @default(false)
  daily_limit       Int     @default(200)
  gap_min           Int     @default(20)
  gap_max           Int     @default(90)
  daily_quota       Int     @default(20)
  template_defaults Json    @default("{}")
}

model blocklist {
  id        String   @id @default(uuid()) @db.Uuid
  phone     String
  phone_key String   @unique
  name      String   @default("")
  lead_id   String?  @db.Uuid
  at        DateTime @default(now())
  reason    String   @default("")
}

model disparos {
  id                 String   @id @default(uuid()) @db.Uuid
  name               String
  at                 DateTime @default(now())
  scheduled_at       DateTime
  mode               String
  template_id        String   @db.Uuid
  split              Boolean  @default(false)
  channel            String
  by                 String   @db.Uuid
  filters            Json
  skipped_block      Int      @default(0)
  skipped_dup        Int      @default(0)
  status             String   @default("agendado")
  freela_campaign_id String?

  sends msg_sends[]
}

model msg_sends {
  id                  String    @id @default(uuid()) @db.Uuid
  disparo_id          String?   @db.Uuid
  cadence_id          String?   @db.Uuid
  node_id             String?   @db.Uuid
  enrollment_id       String?   @db.Uuid
  template_id         String?   @db.Uuid
  variant             String    @default("A")
  lead_id             String    @db.Uuid
  channel             String    @default("whatsapp")
  text                String
  mode                String    @default("fila")
  scheduled_at        DateTime
  sent_at             DateTime?
  replied_at          DateTime?
  status              String    @default("fila")
  failure_reason      String?
  stage_at_send       Int
  freela_campaign_id  String?
  freela_recipient_id String?
  created_at          DateTime  @default(now())
  disparo             disparos? @relation(fields: [disparo_id], references: [id], onDelete: Cascade)
  lead                leads     @relation(fields: [lead_id], references: [id], onDelete: Cascade)

  @@index([disparo_id])
  @@index([lead_id])
  @@index([status, mode])
  @@index([freela_campaign_id])
}

// ── cadências ────────────────────────────────────────────────
model cadences {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  audience    String
  entry       String
  exit_action String
  exit_note   String   @default("")
  paused      Boolean  @default(false)
  created_at  DateTime @default(now())

  nodes       cadence_nodes[]
  enrollments enrollments[]
}

model cadence_nodes {
  id          String   @id @default(uuid()) @db.Uuid
  cadence_id  String   @db.Uuid
  sort        Int
  kind        String
  day         Int      @default(0)
  channel     String?
  template_id String?  @db.Uuid
  text        String?
  task        String?
  rule        String?
  action      String?
  note        String?
  cadence     cadences @relation(fields: [cadence_id], references: [id], onDelete: Cascade)

  @@index([cadence_id, sort])
}

model enrollments {
  id             String    @id @default(uuid()) @db.Uuid
  cadence_id     String    @db.Uuid
  lead_id        String    @db.Uuid
  started_at     DateTime
  next_at        DateTime
  status         String    @default("ativo")
  exit_reason    String?
  stage_at_start Int
  is_test        Boolean   @default(false)
  compress_sec   Int?
  cadence        cadences  @relation(fields: [cadence_id], references: [id], onDelete: Cascade)
  lead           leads     @relation(fields: [lead_id], references: [id], onDelete: Cascade)

  logs enrollment_logs[]

  @@index([cadence_id, status])
  @@index([lead_id, status])
}

model enrollment_logs {
  id            String      @id @default(uuid()) @db.Uuid
  enrollment_id String      @db.Uuid
  node_id       String      @db.Uuid
  at            DateTime    @default(now())
  send_id       String?     @db.Uuid
  kind          String
  enrollment    enrollments @relation(fields: [enrollment_id], references: [id], onDelete: Cascade)
}

// ── mídia ────────────────────────────────────────────────────
model proofs {
  id       String @id @default(uuid()) @db.Uuid
  praca_id String @db.Uuid
  kind     String
  title    String
  praca    pracas @relation(fields: [praca_id], references: [id], onDelete: Cascade)

  campanhas campanha_provas[]
}

model campanhas {
  id             String    @id @default(uuid()) @db.Uuid
  name           String
  praca_id       String    @db.Uuid
  publico        String
  objetivo       String
  start          String
  end            String
  verba          Float     @default(0)
  gasto          Float     @default(0)
  dor            String    @default("")
  oferta         String    @default("")
  mensagem_chave String    @default("")
  destino        String    @default("formulario")
  kpi_name       String    @default("")
  kpi_meta       Float     @default(0)
  kpi_custo      Float     @default(0)
  cac_teto       Float     @default(0)
  status         String    @default("rascunho")
  gate_just_by   String?
  gate_just_at   DateTime?
  gate_just_text String?
  created_at     DateTime  @default(now())
  praca          pracas    @relation(fields: [praca_id], references: [id], onDelete: Cascade)

  provas    campanha_provas[]
  creatives creatives[]
  traffic   traffic_entries[]
}

model campanha_provas {
  campanha_id String    @db.Uuid
  proof_id    String    @db.Uuid
  campanha    campanhas @relation(fields: [campanha_id], references: [id], onDelete: Cascade)
  proof       proofs    @relation(fields: [proof_id], references: [id], onDelete: Cascade)

  @@id([campanha_id, proof_id])
}

model creatives {
  id                     String    @id @default(uuid()) @db.Uuid
  campanha_id            String    @db.Uuid
  formato                String
  titulo                 String    @default("")
  gancho                 String    @default("")
  roteiro_gancho         String    @default("")
  roteiro_desenvolvimento String   @default("")
  roteiro_prova          String    @default("")
  roteiro_cta            String    @default("")
  legenda                String    @default("")
  cta_botao              String    @default("Saiba mais")
  owner_id               String?   @db.Uuid
  due                    String
  publish_at             String?
  status                 String    @default("a_fazer")
  file_url               String    @default("")
  ia_tool                String?
  ia_prompt              String?
  approved_at            DateTime?
  created_at             DateTime  @default(now())
  campanha               campanhas @relation(fields: [campanha_id], references: [id], onDelete: Cascade)

  comments creative_comments[]
}

model creative_comments {
  id          String    @id @default(uuid()) @db.Uuid
  creative_id String    @db.Uuid
  at          DateTime  @default(now())
  author      String
  text        String
  kind        String
  creative    creatives @relation(fields: [creative_id], references: [id], onDelete: Cascade)
}

model traffic_entries {
  id            String    @id @default(uuid()) @db.Uuid
  campanha_id   String    @db.Uuid
  plataforma    String
  nome_la       String    @default("")
  publico       String    @default("")
  geo           String    @default("")
  verba_diaria  Float     @default(0)
  criativos     String[]  @default([])
  manager_url   String    @default("")
  api_connected Boolean   @default(false)
  campanha      campanhas @relation(fields: [campanha_id], references: [id], onDelete: Cascade)

  days traffic_days[]
}

model traffic_days {
  id         String          @id @default(uuid()) @db.Uuid
  entry_id   String          @db.Uuid
  date       String
  investido  Float           @default(0)
  alcance    Int             @default(0)
  cliques    Int             @default(0)
  conversoes Int             @default(0)
  auto       Boolean         @default(false)
  entry      traffic_entries @relation(fields: [entry_id], references: [id], onDelete: Cascade)

  @@unique([entry_id, date])
}

// ── integração Freela ────────────────────────────────────────
model freela_campaigns {
  id               String    @id @default(uuid()) @db.Uuid
  freela_id        String    @unique
  name             String
  kind             String
  praca_id         String?   @db.Uuid
  disparo_id       String?   @db.Uuid
  audience         String
  audience_filters Json?
  status           String
  stats            Json?
  created_by       String    @db.Uuid
  created_at       DateTime  @default(now())
  last_synced_at   DateTime?
}

model freela_templates {
  id         String   @id @default(uuid()) @db.Uuid
  freela_id  String   @unique
  praca_id   String?  @db.Uuid
  created_by String   @db.Uuid
  created_at DateTime @default(now())
}
```

- [ ] **Step 3: Subir o banco, instalar, gerar migração e testes das funções puras**

```bash
cd /home/doutor/coding/freela/praca && docker compose up -d postgres
cd api && npm install
npx prisma migrate dev --name init
```

`src/common/__tests__/dates.spec.ts`:

```ts
import { addDays, daysBetween, monthDayOf, weekdayOf } from '../time/dates';
describe('dates', () => {
  it('weekdayOf: 2026-09-01 é terça (2)', () => expect(weekdayOf('2026-09-01')).toBe(2));
  it('addDays cruza mês', () => expect(addDays('2026-09-30', 1)).toBe('2026-10-01'));
  it('daysBetween', () => expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7));
  it('monthDayOf', () => expect(monthDayOf('2026-09-15')).toBe(15));
});
```

`src/common/__tests__/phone.spec.ts`:

```ts
import { phoneKey, toE164BR } from '../phone/phone';
describe('phone', () => {
  it('phoneKey pega os 9 últimos dígitos', () => expect(phoneKey('(31) 98765-4321')).toBe('987654321'));
  it('E.164 a partir de máscara', () => expect(toE164BR('(31) 98765-4321')).toBe('+5531987654321'));
  it('E.164 a partir de 55 na frente', () => expect(toE164BR('5531987654321')).toBe('+5531987654321'));
  it('rejeita número curto', () => expect(toE164BR('1234')).toBeNull());
});
```

Run: `npm test` → 8 passando. `npm run typecheck` limpo. `npm run start:dev` sobe e `curl localhost:3014/health` → `{"status":"ok"}` (o `HealthController` do meu-par já faz isso).

- [ ] **Step 4: `CLAUDE.md` e `README.md` do projeto (esqueleto)**

`CLAUDE.md`: copiar a estrutura do `meu-par/CLAUDE.md` trocando nome, portas (3014/3024/5437) e as regras específicas: modos de envio `fila|freela`; catálogo em `src/domain/catalog`; protótipo em `.prototype/` (gitignored); Freela desconfigurado = 503 `FREELA_NOT_CONFIGURED`; um build por vez. `README.md`: título, o que é, como subir (compose + api + web), portas, logins demo, tabela de telas (preencher ao longo do plano).

- [ ] **Step 5: Commit**

```bash
cd /home/doutor/coding/freela/praca && git add -A && git commit -m "chore(api): scaffold NestJS+Prisma, infraestrutura comum e schema completo"
```

---

### Task 2: Auth + usuários (pessoas) + seed das contas

**Files:**
- Create: `api/src/modules/auth/{auth.module.ts,auth.controller.ts,auth.service.ts,dto/auth.dto.ts}`, `api/src/modules/users/{users.module.ts,users.controller.ts,users.service.ts,dto/users.dto.ts}`, `api/prisma/seed.ts` (esqueleto com `seedUsers()`), `api/scripts/smoke.sh` (início), `docs/api-contract.md` (§1 convenções, §2 auth, §3 pessoas)
- Modify: `api/src/app.module.ts` (importar AuthModule, UsersModule; `APP_GUARD` Throttler + JwtAuthGuard)

**Interfaces:**
- `POST /v1/auth/login {email, password}` → `{access_token, user: UserView}`; `GET /v1/auth/me` → `{user: UserView}`. Erro `401 INVALID_CREDENTIALS`.
- `UserView { id, email, name, role_label, color, phone, is_admin, active, theme, active_praca_id, sort }` — **sem** `password_hash`.
- `GET /v1/users` → `UserView[]` (ordem `sort, created_at`; inclui inativos com `active:false`).
- `POST /v1/users {email, password, name, role_label?, color?, phone?, is_admin?}` (admin) → `UserView`. `409 EMAIL_IN_USE`.
- `PATCH /v1/users/me {name?, color?, phone?, theme?, active_praca_id?}` → `UserView`.
- `PATCH /v1/users/:id {name?, role_label?, color?, phone?, is_admin?, active?, sort?}` (admin) → `UserView`. Não pode desativar a si mesmo (`400 CANNOT_DEACTIVATE_SELF`).
- `PUT /v1/users/:id/password {password}` (admin, ou o próprio) → `{ok:true}`.
- `DELETE /v1/users/:id` (admin) = `active=false`. Última conta admin ativa não pode ser desativada (`400 LAST_ADMIN`).
- Seed: `seedUsers(prisma)` cria (idempotente por e-mail) `diego@praca.local` (Diego, "CEO — visitas às casas grandes, decisões, aprovação de verba", `#ECA826`, admin, sort 0), `daniel@praca.local` (Daniel, "Comercial e Sucesso do Cliente — prospecção, operação das vagas, retenção", `#2E6F7E`, sort 1), `mkt@praca.local` (Mkt externo, "Agência — disparos, edição de vídeo, peças e tráfego pago", `#6B5B8A`, sort 2), senha `praca123`. Exporta `SEED_USER_IDS = { diego, daniel, mkt }` (uuids fixos: `00000000-0000-4000-8000-000000000001/2/3`) para as demais seeds referenciarem donos.

- [ ] **Step 1: DTOs e serviço** — portar `meu-par/api/src/shared/auth/*` removendo casal; `class-validator` em tudo (`@IsEmail`, `@MinLength(6)` na senha, `@IsHexColor` na cor, `@IsBoolean`, `@IsIn(['dark','light'])`, `@IsUUID` em `active_praca_id`). `bcryptjs` custo 10. JWT payload `{sub, email, name, is_admin}`.
- [ ] **Step 2: Seed** — `prisma/seed.ts` com `main()` que chama `seedUsers` e, nas tarefas seguintes, as outras seeds na ordem; idempotente (upsert por chave natural). `npm run seed`.
- [ ] **Step 3: Smoke** — `scripts/smoke.sh` no molde do meu-par (`check`, `ok`, `ko`, `SUF`), seção "Saúde e login": health; login diego → token; senha errada → `INVALID_CREDENTIALS`; sem token em `/v1/users` → `UNAUTHORIZED`; daniel (não admin) `POST /v1/users` → `FORBIDDEN`; diego cria `teste$SUF@praca.local` → 201, e-mail repetido → `EMAIL_IN_USE`; `PATCH /v1/users/me {theme:'light'}` → `light`; desativa a conta de teste → `GET /v1/users` mostra `active:false`; login da conta desativada → `UNAUTHORIZED`.
- [ ] **Step 4: Contrato** — `docs/api-contract.md` §1–§3 (formato do meu-par).
- [ ] **Step 5: Commit** — `feat(api): auth, pessoas e seed das contas`.

---

### Task 3: Catálogo de domínio (`src/domain/catalog`) e `GET /v1/catalog`

**Files:**
- Create: `api/src/domain/catalog/steps.ts`, `funnel.ts`, `messages.ts`, `cadences.ts`, `midia.ts`, `indicators.ts`, `index.ts`; `api/src/modules/catalog/{catalog.module.ts,catalog.controller.ts}`
- Test: `api/src/domain/catalog/__tests__/catalog.spec.ts`

**Interfaces (produz — nomes exatos, usados por todos os módulos):**
- `steps.ts`: `STEPS: StepDef[]` (11, de `.prototype/src/lib/praca/template.ts:9-21`), `GATED_BY = {3:2, 7:6, 11:10}`, `STEP_BLOCKS = ['Preparar','Começar','Provar','Crescer','Fixas']`, `FILL_LIMIT_H = 4`.
- `funnel.ts`: `FUNNEL_STAGES` (8, `funil.ts:11-20`), `LOST_REASONS`, `CLASSES`, `ORIGENS`, `IMPORT_ORIGENS` (`intake.ts:25-32`), `EVENT_LABEL`, `CONTACT_KINDS`, `EST_VALUE = {grande:4500, alvo:2200, depois:900}`, `LEAD_FIELDS` (`intake.ts:9-20`), `CLASSE_ORDER`.
- `messages.ts`: `CHANNELS`, `AUDIENCES`, `SEND_MODES` = `[{id:'fila', label:'Fila manual', desc:<texto do protótipo>, tone:'ok'}, {id:'freela', label:'Via Freela (número da empresa)', desc:'Sai pelo chip de campanha do Freela, com ritmo anti-bloqueio, janela comercial e opt-out automático ("responda SAIR"). Precisa da conexão com o Freela configurada.', tone:'ok'}]`, `VARIABLES` (16, `mensagens.ts:42-46`), `OPTOUT_WORDS`, `HARD_MIN = 8`, `HARD_MAX = 20`, `DEFAULT_TEMPLATE_DEFAULTS = { link_video_caso:'https://freela.app/casos/bh', link_cadastro:'https://freela.app/cadastro', funcao:'garçom', valor:'R$ 120', dia_forte:'sábado', turno:'18h às 00h' }`.
- `cadences.ts`: `ENTRY_RULES`, `COND_RULES`, `COND_ACTIONS`, `EXIT_REASON_LABEL`, `AUTO_ENTRIES = ['stage_novo','reheat_due','first_vaga']`, `MAX_ENROLL_PER_TICK = 30`.
- `midia.ts`: `OBJETIVOS`, `DESTINOS`, `FORMATOS`, `CREATIVE_STATUS`, `CAMPANHA_STATUS`, `IA_TOOLS`, `MESES`, `SCRIPT_MODELS` (5, `campanhas.ts:111-190`), `PROOF_KIND_LABEL`, `GATE_WARNING`, `FILL_ALERT`.
- `indicators.ts`: `IND_CATALOG` (12, `indicadores.ts:66-79`; o `owner` do protótipo vira `owner_email: 'diego@praca.local' | 'daniel@praca.local' | 'mkt@praca.local'`, e o serviço de indicadores resolve para `owner_id` procurando o usuário pelo e-mail, `null` se não existir), `FREQ_DAYS`, `MILESTONES` (`indicadores.ts:248-258`), `CANAIS` (`indicadores.ts:358-365`), `PERIODS`.
- `GET /v1/catalog` (público) devolve todos os itens acima em snake_case: `{steps, gated_by, step_blocks, funnel_stages, lost_reasons, classes, origens, import_origens, event_labels, contact_kinds, est_value, lead_fields, classe_order, channels, audiences, send_modes, variables, hard_min, hard_max, entry_rules, cond_rules, cond_actions, exit_reason_labels, objetivos, destinos, formatos, creative_status, campanha_status, ia_tools, meses, script_models, proof_kind_labels, gate_warning, fill_alert, fill_limit_h, indicators, milestones, canais, periods}`.

- [ ] **Step 1: Teste** — `catalog.spec.ts`: `STEPS.length === 11`, `STEPS[1].gate.target === 40`, `FUNNEL_STAGES[7].name === 'Perdido / reaquecer'`, `SCRIPT_MODELS.length === 5`, `IND_CATALOG.filter(d=>d.hero).length === 6`, `VARIABLES.length === 16`.
- [ ] **Step 2: Portar as constantes** copiando os literais do protótipo (não reescrever textos). Tipos exportados: `StepDef`, `StageDef`, `IndDef`, `ScriptModel`.
- [ ] **Step 3: Controller público** + smoke ("catálogo é público": `.steps|length == 11`, `.send_modes|length == 2`, `.indicators|length == 12`). Contrato §4.
- [ ] **Step 4: Commit** — `feat(api): catálogo de domínio e GET /v1/catalog`.

---

### Task 4: Geo (municípios do IBGE por UF, vizinhas no raio)

**Files:**
- Create: `api/src/modules/geo/{geo.module.ts,geo.controller.ts,geo.service.ts}`, `api/src/modules/geo/data/municipios.json` (copiar de `.prototype/src/lib/praca/municipios.json`)
- Test: `api/src/modules/geo/__tests__/geo.service.spec.ts`

**Interfaces:**
- `GET /v1/geo/estados` (público) → `string[]` (27 UFs).
- `GET /v1/geo/municipios?uf=MG` (público) → `[{ibge, nome, uf, lat, lon, pop, capital}]` ordenado por nome pt-BR; `400 VALIDATION_ERROR` sem `uf`. Exclui as cidades "Rio de Janeiro" e "São Paulo" (regra do protótipo `geo.ts:26`).
- `GET /v1/geo/municipios/:ibge/vizinhas?km=50` (público) → `{centro:{…}, raio_km, vizinhas:[{ibge, nome, uf, lat, lon, pop, km}] (da maior para a menor população), pop_total}`. `404 NOT_FOUND` se o código não existe. `km` 1..300, default 50.
- `GeoService.haversineKm(a,b,c,d)`, `GeoService.cidadesNoRaio(ibge, km)` (mesma matemática de `geo.ts:41-57`), `GeoService.find(ibge)`.

- [ ] **Step 1: Teste** — haversine BH→Contagem ≈ 20 km (±3); `cidadesNoRaio('3106200', 50)` inclui "Contagem" e não inclui "Belo Horizonte"; `municipiosPorUf('MG')` não contém "Rio de Janeiro".
- [ ] **Step 2: Serviço** carrega o JSON uma vez (`import municipios from './data/municipios.json'` com `resolveJsonModule`), monta `Map<ibge, Municipio>`.
- [ ] **Step 3: Controller** + smoke (`estados|length == 27`; `municipios?uf=MG` traz "Belo Horizonte"; vizinhas de 3106200 ≥ 10). Contrato §5.
- [ ] **Step 4: Commit** — `feat(api): geo do IBGE por UF e vizinhas no raio`.

---

### Task 5: Praças, roteiro-modelo, ações e agenda

**Files:**
- Create: `api/src/domain/recurrence.ts`, `api/src/modules/pracas/{pracas.module.ts,pracas.controller.ts,pracas.service.ts,agenda.service.ts,dto/pracas.dto.ts}`, `api/src/modules/actions/{actions.module.ts,actions.controller.ts,actions.service.ts,template-actions.controller.ts,dto/actions.dto.ts}`, `api/prisma/seed-data/template-actions.ts`
- Modify: `api/prisma/seed.ts` (seedTemplateActions, seedPraca)
- Test: `api/src/domain/__tests__/recurrence.spec.ts`, `api/src/modules/pracas/__tests__/agenda.service.spec.ts`

**Interfaces:**
- `recurrence.ts` (puro): `type Rec = {kind:'once', day} | {kind:'daily'|'weekday', start_day, end_day?} | {kind:'weekly', weekday, start_day, end_day?} | {kind:'monthly', month_day, start_day}`; `recFromRow(row)`, `recToRow(rec)` (colunas `rec_*`); `dueDateOf(a, praca)` (once: `due_override ?? addDays(start_date, day)`; senão `''`); `occursOn(a, praca, date)` (portar `store.tsx:29-42` exatamente — ações fixas `step===0` rolam todo dia inclusive antes do início); `isDoneOn(a, date)`, `actionEverDone(a)`, `recLabel(a, praca)` (`store.tsx:50-59`), `stepInfo(praca, actions, n)` (`store.tsx:70-102`, com `STEPS`/`GATED_BY`).
- `ActionView { id, praca_id, template_key, step, title, owners: string[], rec: Rec, tools, expected, msg, attention, expects_result, due_override, postpone_count, completed_at, completed_by, result, sort, completions: Record<date,{by,at,result}>, comments: [{id, author_id, at, text}], subitems: [{id, text, done, sort}] }`.
- `PracaView { id, name, city, start_date, end_date, cobertura: {uf, cidade, ibge, lat, lon, vizinhas}|null, steps: Record<n, {actual, unlock:{by, at, reason}|null}>, created_at }`.
- `StepInfoView { n, name, block, expected, gate, status:'locked'|'done'|'active'|'todo', done, total, window:[from,to]|null, lock_reason, actual, unlock }`.
- Rotas: `GET /v1/pracas` → `PracaView[]`; `POST /v1/pracas {name, city, start_date, end_date, cobertura?}` → `PracaView` (instancia `template_actions` como `actions` com `subitems` a partir de `how_to`, e define `users.active_praca_id` do autor); `GET /v1/pracas/:id`; `PATCH /v1/pracas/:id {name?, city?, start_date?, end_date?}`; `POST /v1/pracas/:id/recalc-dates` (zera `due_override` e `postpone_count` de todas as ações da praça); `GET /v1/pracas/:id/steps` → `StepInfoView[]`; `PUT /v1/pracas/:id/steps/:n/result {value}`; `POST /v1/pracas/:id/steps/:n/unlock {reason}` (autor = usuário logado); `GET /v1/pracas/:id/agenda?from&to&person=all|<uuid>` → `{late:[{action_id, date, days_late}], today:[{action_id, date}], next7:[{date, action_ids}], by_date: Record<date, action_ids[]>, load:[{user_id, count}]}` — `late/today/next7/load` seguem `routes/index.tsx:594-646` (para recorrente, só a ocorrência perdida mais recente nos últimos 7 dias); `by_date` cobre `from..to` (máx. 62 dias).
- Ações: `GET /v1/actions?praca_id` → `ActionView[]`; `POST /v1/actions {praca_id, title, owners, due_date}` (avulsa: `step 0`, `rec once day 0`, `due_override=due_date`); `GET /v1/actions/:id`; `PATCH /v1/actions/:id {title?, owners?}`; `POST /v1/actions/:id/complete {date?, result?}` (once ⇒ `completed_at/by/result`; recorrente ⇒ upsert em `action_completions[date ?? hoje]`); `POST /:id/uncomplete {date?}`; `POST /:id/postpone {new_date, reason}` (só once; `due_override`, `postpone_count+1`, comentário "Adiada para dd/mm/aaaa — motivo"); `POST /:id/reassign {user_id}`; `POST /:id/comments {text}`; `POST /:id/subitems {text}`; `POST /:id/subitems/:sid/toggle`.
- Roteiro: `GET /v1/template-actions` → `[{id, key, step, title, owners, rec, tools, how_to, expected, msg, attention, expects_result, sort}]`; `POST` (admin) `{step, title, owners, rec}`; `PATCH /:id` (admin) `{title?, owners?, rec?}`; `DELETE /:id` (admin).
- Seed: 84 ações de `template.ts:34-138` com `owners` mapeados por `SEED_USER_IDS`; praça "Belo Horizonte + Contagem" (`city: 'Belo Horizonte · MG'`, `2026-09-01`→`2026-12-08`, `steps {2:{actual:22}}`, id fixo `00000000-0000-4000-8000-0000000000aa`) com as ações instanciadas; `active_praca_id` dos 3 usuários = essa praça.

- [ ] **Step 1: Testes de recorrência** — `occursOn` com praça `start_date 2026-09-01`: `weekday start 5 end 12` ocorre em `2026-09-07` (seg) e não em `2026-09-05` (sáb) nem `2026-09-14`; `weekly weekday 2 start 61` ocorre só nas terças ≥ `2026-11-01`; `monthly month_day 1 start 74` ocorre em `2026-12-01`; fixa `step 0 daily start 0` ocorre em `2026-08-15` (antes do início); `stepInfo` etapa 3 travada sem `actual` da 2 (`lock_reason` começa com "Falta bater o Portão"), destravada com `unlock`, `done` quando todas concluídas e `actual != null`.
- [ ] **Step 2: Implementar** domínio, serviços, controllers, seed. `agenda.service.spec.ts` monta 3 ações em memória e confere `late/today/next7`.
- [ ] **Step 3: Smoke** — praça seed tem 84 ações; `steps` etapa 2 `actual == 22`, etapa 3 `status == "locked"` (22 < 40) com `lock_reason` começando por "Falta bater o Portão"; `unlock` etapa 3 ⇒ `todo`; agenda de hoje devolve `load` com 3 pessoas; concluir a ação `s1a2` ⇒ `completed_at`; desfazer ⇒ `null`; adiar ⇒ `postpone_count == 1` e comentário; criar praça nova `Praça $SUF` ⇒ 84 ações; nova praça com `cobertura` ⇒ `cobertura.vizinhas|length > 0`; `recalc-dates` zera `postpone_count`; ação avulsa ⇒ `step == 0`; template-actions `POST` por daniel ⇒ `FORBIDDEN`. Apagar a praça de teste ao fim (`DELETE /v1/pracas/:id`, admin — adicionar a rota: cascade).
- [ ] **Step 4: Contrato §6–§8. Commit** — `feat(api): praças, roteiro-modelo, ações e agenda`.

---

### Task 6: Leads (funil), eventos, vagas, fila do dia, métricas

**Files:**
- Create: `api/src/modules/leads/{leads.module.ts,leads.controller.ts,leads.service.ts,queue.service.ts,dto/leads.dto.ts}`, `api/src/domain/lead-rules.ts`, `api/prisma/seed-data/leads.ts`
- Modify: `api/prisma/seed.ts`
- Test: `api/src/domain/__tests__/lead-rules.spec.ts`

**Interfaces:**
- `lead-rules.ts` (puro): `lastContactDate(lead+events)`, `daysSince(dateStr)`, `stalledDays(lead)`, `isStalled`, `isCritical`, `estValue(classe)` — portar `funil.ts:56-80` (usando `todaySp()`).
- `LeadListView { id, praca_id, name, city, address, phone, cnpj, instagram, site, decisor, decisor_role, classe, origem, owner_id, stage, entered_at, stage_since, last_contact_at, last_contact_date, stalled_days, est_value, next_step:{what,date}|null, lost_reason, reheat_at, archived, import_batch_id, possible_dup, snooze_until, campanha_id, form_answer, is_test, events_count, vagas_count }`; `LeadView = LeadListView & { events:[{id, at, author_id, author_label, kind, text, stage_to}], vagas:[{id, date, funcao, filled, hours}] }`.
- `GET /v1/leads?praca_id&q&owner_id&classe&stage&archived=true|false(default false)&campanha_id` → `LeadListView[]` (busca em `name city decisor`, case-insensitive). `GET /v1/leads/:id` → `LeadView`.
- `POST /v1/leads {praca_id?, name, city?, address?, phone, cnpj?, instagram?, site?, decisor?, decisor_role?, classe, origem, owner_id, stage?=1, campanha_id?}` → `LeadView` (`entered_at = stage_since = hoje`, `phone_key`).
- `PATCH /v1/leads/:id` (mesmos campos opcionais + `praca_id`, `owner_id`).
- `POST /v1/leads/:id/move {stage, next_step?:{what,date}, lost_reason?}` → regras de `store.tsx:442-467`: evento `stage` com `stage_to`, texto "Mudou de etapa: A → B" / "Voltou etapa: …" + " · motivo: X"; etapa 8 exige `lost_reason` (`400 LOST_REASON_REQUIRED`), demais exigem `next_step` (`400 NEXT_STEP_REQUIRED`); `lost_reason === 'não respondeu'` ⇒ `reheat_at = hoje+30`.
- `POST /v1/leads/:id/events {kind, text}` (kind ∈ `msg_out|msg_in|call|visit|note`; contato ⇒ `last_contact_at = agora`). `PUT /v1/leads/:id/next-step {what, date}`. `POST /v1/leads/:id/archive` (evento note "Lead arquivado (histórico mantido)."). `POST /v1/leads/:id/snooze {until}`. `POST /v1/leads/:id/vagas {date, funcao, filled, hours?}`.
- `GET /v1/leads/queue?person=all|<uuid>` → `{total, grandes, quota, items: (LeadListView & {is_reheat})[]}` — regra de `routes/entrada.tsx:439-457` (não arquivado, sem soneca vigente, `stage 1` ou `stage 8 && reheat_at <= hoje`, filtro por dono, ordem `CLASSE_ORDER` depois `entered_at`), `items` cortado em `quota` (`app_settings.daily_quota`).
- `GET /v1/leads/metrics?praca_id` → `{total, conv_contact, conv_active, avg_days, stalled, critical, lost, pipeline}` (`routes/funil.tsx:637-658`).
- `GET /v1/leads/orphans` → leads não arquivados com `praca_id` nulo ou inexistente.
- Seed: 25 leads de `funil.ts:107-187` (`ROWS` + `seedLeads`) com `owner_id` por `SEED_USER_IDS`, eventos e vagas, `phone_key`. Idempotente: pular se já existir lead com o mesmo nome na praça seed.

- [ ] **Step 1: Testes** de `lead-rules` (stalled cai para `stage_since` sem contato; `isCritical` > 15; `estValue`).
- [ ] **Step 2: Implementar + seed.**
- [ ] **Step 3: Smoke** — lista da praça seed ≥ 25; cria lead `Bar $SUF` (stage 1); `move` p/ 2 sem next_step ⇒ `NEXT_STEP_REQUIRED`; com next_step ⇒ evento `stage_to == 2`; `move` p/ 8 com "não respondeu" ⇒ `reheat_at` = hoje+30; `events` call ⇒ `last_contact_at` preenchido; `queue` contém leads stage 1 e respeita `quota`; `snooze` tira da fila; `metrics.total ≥ 26`; `archive` ⇒ some da lista sem `archived=true`; id inválido `/v1/leads/abc` ⇒ 404 `NOT_FOUND`. Apagar o lead de teste (`DELETE /v1/leads/:id`, admin — hard delete só para testes/limpeza; documentar).
- [ ] **Step 4: Contrato §9. Commit** — `feat(api): funil de leads, eventos, fila do dia e métricas`.

---

### Task 7: Entrada de leads (mapeamentos, avaliação, importação, desfazer)

**Files:**
- Create: `api/src/domain/dedup.ts`, `api/src/modules/imports/{imports.module.ts,imports.controller.ts,imports.service.ts,dto/imports.dto.ts}`
- Test: `api/src/domain/__tests__/dedup.spec.ts`

**Interfaces:**
- `dedup.ts` (puro, portado de `intake.ts:121-207`): `norm(s)`, `samePhone(a,b)`, `guessClasse(v)`, `guessMapping(columns)`, `rowToDraft(row, map, origemLote)`, `findDuplicate(draft, existing: {id, phone, cnpj, name, address}[])` (telefone → CNPJ → nome+endereço), `matchPraca(city, pracas)`.
- `POST /v1/imports/evaluate {columns: string[], rows: Record<string,string>[] (≤5000), map: Record<string,string>, origem, dup_action:'ignorar'|'completar'|'criar', praca_mode:'lote'|'arquivo', lote_praca_id?}` → `{total, dups, no_phone, no_name, will_import, sem_praca, guessed_map (se map vazio), rows: [{draft, dup:{lead_id, lead_name, by}|null, no_phone, no_name, praca_id}] (só as 10 primeiras + contagens)}` — duplicidade **contra todos os leads do banco** + entre linhas do próprio arquivo.
- `POST /v1/imports/run {file_name, ...mesmos campos de evaluate, owner_mode:'lote'|'rodizio', lote_owner_id?, rodizio_ids?: uuid[]}` → `{batch_id, imported, updated, ignored, reasons}` — cria leads (`import_batch_id`, `possible_dup` quando dup+`criar`, evento note "Lead importado de <arquivo> · origem <origem>."), completa campos vazios quando `completar` (evento "Campos vazios completados pela importação <arquivo>."), rodízio de dono; tudo em transação.
- `GET /v1/imports` → `[{id, at, file_name, by, origem, imported, ignored, reasons, can_undo}]` (`can_undo` = < 24 h). `POST /v1/imports/:id/undo` → `{removed, kept}` (remove só leads do lote sem evento de contato e `stage === 1`; `400 UNDO_EXPIRED` após 24 h).
- `GET/POST/DELETE /v1/imports/mappings` (`{name, map}`; `POST` substitui pelo nome).

- [ ] **Step 1: Testes** de `dedup` (mesmo telefone com máscara diferente é dup; CNPJ; nome+endereço normalizados; `guessMapping(['Nome','Telefone','Cidade'])` mapeia `name/phone/city`; `guessClasse('Grande')==='grande'`, `('frio')==='depois'`, `('')==='alvo'`).
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Smoke** — evaluate com 3 linhas (uma duplicando o telefone de um lead seed, uma sem telefone) ⇒ `dups == 1`, `no_phone == 1`, `will_import == 1`; run ⇒ `imported == 1`; mapping salvo/listado/apagado; undo ⇒ `removed == 1`; lista não tem mais o lead.
- [ ] **Step 4: Contrato §10. Commit** — `feat(api): entrada de leads por arquivo com duplicidade no servidor`.

---

### Task 8: Formulário público de captura

**Files:**
- Create: `api/src/modules/public/{public.module.ts,public.controller.ts,dto/public.dto.ts}`

**Interfaces:**
- `GET /v1/public/pracas/:id` (público) → `{id, name, city}` (404 se não existe).
- `POST /v1/public/leads {praca_id, name, city, phone, decisor?, freq?:'0'|'2'|'5'|'10', origem:'pago'|'organico', camp?: uuid}` (público, `@Throttle({default:{limit:10, ttl:60000}})`) → `{ok:true}` — cria lead `stage 1`, `classe 'alvo'`, `origem` = `'tráfego pago'|'orgânico'`, `decisor || '—'`, `form_answer = 'Fica sem gente Nx por mês'`, `campanha_id = camp` se existir campanha com esse id, `owner_id` = primeiro usuário ativo por `sort`, evento note "Lead entrou pelo formulário de captura." com `author_label 'Formulário'`. Telefone duplicado (mesma `phone_key` na mesma praça) ⇒ não cria de novo, só acrescenta evento note "Preencheu o formulário de novo." e responde `{ok:true, duplicate:true}`.

- [ ] **Step 1: Implementar + smoke** (sem token; praça inexistente 404; lead criado aparece em `GET /v1/leads?praca_id` com `origem == "tráfego pago"` e `form_answer`; segundo envio ⇒ `duplicate:true`; limpar).
- [ ] **Step 2: Contrato §11. Commit** — `feat(api): formulário público de captura`.

---

### Task 9: Modelos de mensagem, configurações de envio, lista de bloqueio, render e métricas

**Files:**
- Create: `api/src/domain/template-render.ts`, `api/src/domain/send-schedule.ts`, `api/src/modules/messages/{messages.module.ts,templates.controller.ts,settings.controller.ts,blocklist.controller.ts,messages.service.ts,dto/messages.dto.ts}`, `api/prisma/seed-data/msg-templates.ts`
- Test: `api/src/domain/__tests__/template-render.spec.ts`, `api/src/domain/__tests__/send-schedule.spec.ts`

**Interfaces:**
- `template-render.ts`: `renderTemplate(text, ctx: {lead?, praca?, me?, neighbor?, defaults: TemplateDefaults, extras?})` → string (`mensagens.ts:59-84`, mas `link_video_caso/link_cadastro/funcao/valor/dia_forte/turno` vêm de `defaults`); `usedVariables(text)`; `missingVariables(text, ctx)`; `isOptOut(text)`; `firstName`.
- `send-schedule.ts`: `nextSlot(d: Date, st: SendSettings): Date` e `scheduleTimes(count, start, st): string[]` (`mensagens.ts:123-171`) **em horário de Brasília** (use `hourSp`/`weekdaySp` e ajuste com `Date` em UTC — teste garante que `windowStart 9` significa 9h BRT); `etaText(times)`.
- `SendSettings { mode, window_start, window_end, sunday, daily_limit, gap_min, gap_max }`.
- Rotas: `GET /v1/msg-templates` → `[{id, name, audience, stage, channel, text_a, text_b, attachment:{kind,name,url}|null, created_at, metrics: {sent, responded, resp_rate, advanced, adv_rate, a:{sent,responded,rate}, b:{…}, winner}}]` (métricas de `mensagens.ts:195-224`, ordenadas por `resp_rate desc, sent desc`); `POST/PUT/DELETE`; `POST /v1/msg-templates/render {text, lead_id?}` → `{text, missing: string[]}`.
- `GET /v1/settings` → `{mode, window_start, window_end, sunday, daily_limit, gap_min, gap_max, daily_quota, template_defaults}`; `PATCH /v1/settings` (mesmos campos opcionais; janela travada em `HARD_MIN..HARD_MAX`, `window_end > window_start`, `gap_max > gap_min ≥ 5`, `daily_limit ≥ 1`, `daily_quota ≥ 1`, `mode ∈ fila|freela`).
- `GET /v1/blocklist`; `POST /v1/blocklist {phone, name?, reason?, lead_id?}` (409 `ALREADY_BLOCKED`); `DELETE /v1/blocklist/:id`.
- Seed: 8 modelos de `mensagens.ts:231-310` com ids fixos `00000000-0000-4000-8000-00000000f001` … `…f008` (só hex — as cadências da Task 11 referenciam `tpl-1`→`…f001`, `tpl-2`→`…f002`, `tpl-4`→`…f004`, `tpl-6`→`…f006`, `tpl-8`→`…f008`); `app_settings` linha 1 com `template_defaults = DEFAULT_TEMPLATE_DEFAULTS`.

- [ ] **Step 1: Testes** — render substitui `{{primeiro_nome_dono}}` pelo primeiro nome do decisor, deixa `⟨bairro⟩` quando endereço vazio, usa `defaults.valor`; `isOptOut('PARE')`, `isOptOut('não quero mais')`, `!isOptOut('sim')`; `scheduleTimes(3, sábado 21h BRT, {window 9-19, sunday:false, gap 20-90, limit 200})` ⇒ primeiro horário é **segunda 9:00 BRT**; `dailyLimit 2` com 3 mensagens ⇒ a 3ª cai no dia seguinte.
- [ ] **Step 2: Implementar + seed.**
- [ ] **Step 3: Smoke** — 8 modelos; render com lead seed traz o nome do decisor; settings patch `window_start 7` ⇒ vira 8 (clamp); bloqueia telefone, repete ⇒ `ALREADY_BLOCKED`, remove.
- [ ] **Step 4: Contrato §12. Commit** — `feat(api): modelos, configurações de envio, bloqueio e render`.

---

### Task 10: Disparos e fila de envios (modo `fila`; ganchos para `freela`)

**Files:**
- Create: `api/src/modules/disparos/{disparos.module.ts,disparos.controller.ts,sends.controller.ts,disparos.service.ts,dto/disparos.dto.ts}`

**Interfaces:**
- `DisparoFilters { praca_id:'all'|uuid, stage:0..8, classe:'all'|…, origem:'all'|…, owner_id:'all'|uuid, min_stalled:number }`.
- `POST /v1/disparos/preview {filters, template_id, split, mode, scheduled_at?}` → `{audience, sendable, blocked, dupes, first_at, eta, previews:[{lead_id, name, city, variant, text}] (5), freela: null | {template, unsupported_variables:string[]}}` — audiência = `Disparos.tsx:58-69`; bloqueio pela `blocklist`; trava de 30 dias = já existe `msg_send` do mesmo `template_id` para o lead com `scheduled_at` nos últimos 30 dias; `neighbor` = outro lead da mesma cidade; `me` = usuário logado. Em `mode:'freela'` chama `FreelaTemplateConverter` (Task 15) — até lá devolve `freela: null`.
- `POST /v1/disparos {name?, template_id, split, mode, scheduled_at?, filters}` → `{id, created, skipped_block, skipped_dup}` — cria `disparos` + `msg_sends` (`status 'fila'`, `mode`, `variant` A/B alternando por índice quando `split && text_b`, `text` renderizado, `scheduled_at` de `scheduleTimes` no modo `fila`; no modo `freela` todos com `scheduled_at = agendado ?? agora` — quem cria a campanha no Freela é o outbox da Task 15). Nome padrão `"<modelo> · dd/mm/aaaa"`. `400 NO_RECIPIENTS` se `sendable == 0`. `503 FREELA_NOT_CONFIGURED` se `mode freela` sem Freela (Task 15 define `FreelaClient.isConfigured()`; até lá, `mode freela` ⇒ 503 sempre).
- `GET /v1/disparos` → `[{id, name, at, scheduled_at, mode, template_id, template_name, split, channel, by, filters, skipped_block, skipped_dup, status, freela_campaign_id, counts:{total, queued, sent}}]`.
- `GET /v1/disparos/:id` → `{disparo, stats:{queued, sent, delivered, replied, advanced, blocked_after}, by_hour:number[24] (respostas por hora BRT), sends:[{id, lead:{id,name,city,phone}, variant, text, status, scheduled_at, sent_at, replied_at, failure_reason, stage_at_send}]}` (`Disparos.tsx:385-437`).
- `POST /v1/sends/:id/mark {status:'enviada'|'entregue'}` — `store.tsx:648-682`: `sent_at` se vazio; `enviada` ⇒ evento `msg_out` "<modelo> (variação A) enviada por WhatsApp." + `last_contact_at`; disparo vira `concluido` quando nenhum `fila`.
- `POST /v1/sends/:id/reply {text}` → `{blocked:boolean}` — `store.tsx:684-710`: `respondida`, `replied_at`, evento `msg_in`, opt-out ⇒ entra na `blocklist` com motivo `pediu para não receber: “<texto>”`.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Smoke** — preview stage 1 com modelo tp01 ⇒ `sendable ≥ 1`, 5 prévias; cria disparo ⇒ `created == sendable`; `GET /:id` `stats.queued == created`; `mark enviada` ⇒ `stats.sent == 1` e lead tem evento `msg_out`; `reply "pare"` ⇒ `blocked:true` e lead na blocklist; preview de novo ⇒ `dupes ≥ 1` (trava de 30 dias) e `blocked ≥ 1`; `mode:'freela'` ⇒ 503 `FREELA_NOT_CONFIGURED`. Limpeza: `DELETE /v1/disparos/:id` (admin; cascade) e remover da blocklist.
- [ ] **Step 3: Contrato §13. Commit** — `feat(api): disparos em lote e fila manual de envios`.

---

### Task 11: Cadências, inscrições e motor no servidor

**Files:**
- Create: `api/src/modules/cadences/{cadences.module.ts,cadences.controller.ts,cadences.service.ts,cadence-engine.service.ts,cadence.scheduler.ts,dto/cadences.dto.ts}`, `api/src/domain/cadence-rules.ts`, `api/prisma/seed-data/cadences.ts`
- Test: `api/src/modules/cadences/__tests__/cadence-engine.spec.ts`

**Interfaces:**
- `cadence-rules.ts` (puro, de `cadencias.ts:364-446`): `isStep`, `stepNodes`, `respondedSince(events, since)`, `openedVaga(vagas, stage, since)`, `matchesEntry(rule, lead)`, `stepDueAt(startedAt, day, compressSec?)`, `stepIndexOf(nodes, logs)`.
- `CadenceView { id, name, audience, entry, exit:{action, note}, paused, created_at, nodes:[{id, sort, kind, day, channel, template_id, text, task, rule, action, note}] }`.
- `GET /v1/cadences` → `CadenceView[]`; `POST /v1/cadences {name, audience, entry, exit:{action,note}, paused?, nodes:[{kind, day, channel?, template_id?, text?, task?, rule?, action?, note?}]}` (nós recriados na ordem recebida); `PUT /v1/cadences/:id` (mesmo corpo; **preserva ids dos nós existentes** quando o cliente manda `id`, para não perder o `log` das inscrições); `DELETE /:id`; `POST /:id/toggle-pause`; `POST /:id/enroll {lead_id}` → `{ok, waiting}` (`store.tsx:729-750`); `POST /:id/test {phone}` → `{enrollment_id, lead_id}` (lead "Teste — Cadência" `is_test`, `compress_sec 5`, remove inscrições de teste ativas anteriores); `GET /:id/stats` → `{entered, active, per_step:[{node, here, reached, replied, resp_rate}], exits:[{reason,count}], advanced, inside:[{enrollment_id, lead_id, lead_name, status, step_index, next_at}]}`; `POST /v1/cadences/restore-seed` (recria as 5 cadências que faltarem, por nome).
- `GET /v1/enrollments?cadence_id` → `[{id, cadence_id, lead_id, started_at, next_at, status, exit_reason, stage_at_start, is_test, logs:[{node_id, at, send_id, kind}]}]`; `POST /v1/enrollments/:id/exit {reason?}`.
- `CadenceEngineService.tick(now = new Date()): Promise<{changed:boolean}>` — porta `cadencias-engine.ts:591-738` sobre o banco, em transação por inscrição: (1) entrada automática (`AUTO_ENTRIES`, `MAX_ENROLL_PER_TICK`, pula quem já tem inscrição naquela cadência, `aguardando` se já roda outra); (2) avanço: resposta desde `started_at` ⇒ sai `sai_conversa`; `cond` avalia e sai/continua; `task` ⇒ evento note + `next_step`; `msg` ⇒ bloqueio ⇒ sai `bloqueio`; limite diário (`sent_at` hoje ≥ `daily_limit`, ignorado em teste) ⇒ `next_at` = próximo slot +12 h; senão cria `msg_send` com `cadence_id/node_id/enrollment_id`, `text` renderizado, `mode` = `app_settings.mode` (**`fila`** ⇒ `status 'enviada'`, `sent_at = agora`, evento `msg_out` "Cadência “X” · dia N: <texto>", como no protótipo; **`freela`** ⇒ `status 'fila'`, `scheduled_at = agora`, sem evento — o outbox da Task 15 entrega e o sync escreve o evento); (3) fila de espera. `applyExit` com os 5 efeitos de `cadencias-engine.ts:563-584` (`author_label 'Cadência'`).
- `CadenceScheduler`: `@Cron('*/15 * * * * *')` gated por `CADENCE_ENGINE_ENABLED === 'true'`, com trava de reentrância.
- Seed: 5 cadências de `cadencias.ts:460-534` (ids de modelo → `00000000-0000-4000-8000-00000000f00N`).

- [ ] **Step 1: Teste do motor** com Prisma mockado é caro; em vez disso, `cadence-engine.spec.ts` testa as **funções puras** (`matchesEntry`, `stepIndexOf`, `stepDueAt` com compressão) e um cenário de integração é coberto pelo smoke abaixo.
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Smoke** — 5 cadências; `enroll` do lead de teste da Task 6 na "Prospecção…" ⇒ `ok`; segundo `enroll` ⇒ `ok:false`; `test` com telefone `(31) 90000-$SUF` ⇒ inscrição `is_test`; **esperar 20 s** (`sleep 20`) ⇒ `GET /v1/enrollments?cadence_id` mostra `logs|length ≥ 1` e o lead de teste tem `msg_send` `status 'enviada'`; `stats.entered ≥ 2`; `exit` manual ⇒ `saiu`; pause/unpause. Limpeza: apagar lead de teste da cadência e o lead `Bar $SUF`.
- [ ] **Step 4: Contrato §14. Commit** — `feat(api): cadências com motor no servidor`.

---

### Task 12: Mídia — provas, campanhas, criativos, tráfego e métricas

**Files:**
- Create: `api/src/modules/midia/{midia.module.ts,campanhas.controller.ts,creatives.controller.ts,traffic.controller.ts,proofs.controller.ts,midia.service.ts,dto/midia.dto.ts}`, `api/src/domain/midia-rules.ts`, `api/prisma/seed-data/midia.ts`
- Test: `api/src/domain/__tests__/midia-rules.spec.ts`

**Interfaces:**
- `midia-rules.ts`: `campanhaName(praca, publico, objetivo, start)` (`campanhas.ts:52-62`), `gatesOk(praca, stepStates)` (`:70-77`), `fillHours(vagas)` (`:82-89`), `campMetrics(campanha, traffic, days, leads)` (`:106-133`).
- `CampanhaView { id, name, praca_id, publico, objetivo, start, end, verba, gasto, dor, oferta, mensagem_chave, provas: uuid[], destino, kpi_name, kpi_meta, kpi_custo, cac_teto, status, gate_justification:{by, at, text}|null, created_at, metrics: CampMetrics, gate:{ok, falta:string[]} }`.
- Rotas: `GET /v1/campanhas?praca_id?` → `CampanhaView[]`; `POST/PUT /v1/campanhas(/:id)` (corpo = campos editáveis + `provas`; ao sair do rascunho com portão fechado sem `gate_justification` prévia exige `justification` (≥10 chars) senão `400 GATE_JUSTIFICATION_REQUIRED`); `DELETE`; `POST /:id/duplicate {praca_id}` (`store.tsx:804-829`); `POST /:id/status {status, justification?}`; `POST /v1/campanhas/suggest-name {praca_id, publico, objetivo, start}` → `{name}`.
- `GET /v1/creatives?campanha_id` → `[{…, roteiro:{gancho, desenvolvimento, prova, cta}, ia:{tool,prompt}|null, comments:[…]}]`; `POST/PUT/DELETE`; `POST /:id/status {status}`; `POST /:id/publish-date {date}` (comentário nota "Data de publicação movida para dd/mm/aaaa."); `POST /:id/review {kind:'aprovacao'|'ajuste', text}` (`store.tsx:867-880`, autor = nome do usuário).
- `GET /v1/traffic?campanha_id` → `[{…, days:[…]}]`; `POST/PUT/DELETE`; `PUT /v1/traffic/:id/days {date, investido, alcance, cliques, conversoes, auto?}` (upsert por data). `POST /v1/traffic/:id/pull-api` → simula "puxar pela API" como o protótipo (`CampTrafego.tsx:1584`) só se `api_connected`.
- `GET /v1/proofs?praca_id`; `POST /v1/proofs {praca_id, kind, title}`.
- Seed: 13 provas, 2 campanhas, 5 criativos, 1 entrada Meta e 6 dias (`campanhas.ts:196-296`) na praça seed.

- [ ] **Step 1: Testes** — `campanhaName(BH+Contagem, contratante, cadastro_contratante, 2026-09-01) === 'BH-Contratante-Cadastro-Set26'`; `gatesOk` com `actual 22` ⇒ falta etapa 2; `campMetrics` com 2 ativos e 600 investido ⇒ `cp_ativo 300`, `acima_teto` quando `cac_teto 130`.
- [ ] **Step 2: Implementar + seed.**
- [ ] **Step 3: Smoke** — 2 campanhas seed com `metrics.investido == 720`; criar campanha rascunho; mudar status p/ `ativa` sem justificativa ⇒ `GATE_JUSTIFICATION_REQUIRED`; com justificativa ⇒ ok; duplicar ⇒ nome novo e `status rascunho`; criativo criado, `review aprovacao` ⇒ `approved_at`; traffic day upsert 2× mesma data ⇒ 1 linha. Limpeza.
- [ ] **Step 4: Contrato §15. Commit** — `feat(api): campanhas de mídia, criativos, tráfego e provas`.

---

### Task 13: Indicadores

**Files:**
- Create: `api/src/modules/indicators/{indicators.module.ts,indicators.controller.ts,indicators.service.ts,dto/indicators.dto.ts}`, `api/src/domain/indicator-rules.ts`
- Test: `api/src/domain/__tests__/indicator-rules.spec.ts`

**Interfaces:**
- `indicator-rules.ts`: `periodRange(id, custom?)`, `prevRange`, `semaphore(value, meta, dir)`, `fmtVal` (**não** — formatação fica no web), `computeValue(key, data, pracaId|null, range)` sobre um `IndData { leads (com events, vagas), campanhas, traffic, days, actions, pracas, sends }` (`indicadores.ts:130-187`, com `stage_to` em vez de `text.includes`), `readIndicator`, `activeByMonth`, `whatChanged`, `pracaRows`, `personRows` (`leads_tocados` = leads do dono com evento de contato no período), `canalRows`, `canalOf`.
- Manual na visão Empresa: soma dos últimos valores por praça para `unit ''`, média para `%|h|R$` (desvio 9 do spec).
- `GET /v1/indicators?scope=empresa|praca&praca_id&period=hoje|semana|mes|d90|livre&from&to` → `{range, readings: IndReadingView[]}` com `IndReadingView { key, name, what, meta, meta_label, unit, dir, freq, owner_id, source, origem, hero, value, prev, delta, sem, stale, last_at, history }`.
- `GET /v1/indicators/empresa?period…` → `{range, heroes, milestones:[{when,label,targets:[{name,meta,unit,key,dir,value,pct}]}], months:[{month,label,value,meta}], changed:{good:[…],bad:[…]}}`.
- `GET /v1/indicators/pracas?period…` → `[{praca:{id,name}, step_atual, ativos, recontratacao, fill, falta, freelancers, custo, atrasadas}]`; `GET /v1/indicators/pessoas?period…` → `[{id, name, no_prazo, atrasadas, leads_tocados, leads_avancados, fechados, vagas}]`; `GET /v1/indicators/canais?praca_id&period…` → `[{id, label, leads, ativos, conv, custo, tempo_primeira_vaga}]`.
- `POST /v1/indicators/:key/entries {praca_id, date, value}` (upsert).

- [ ] **Step 1: Testes** — `semaphore(38, 40, 'gte') === 'warn'`, `(30,40,'gte')==='bad'`, `(3.5, 4, 'lte')==='ok'`; `periodRange('semana')` começa na segunda; `computeValue('recontratacao')` com 3 leads stage ≥6 sendo 2 stage 7 ⇒ 66.67; `passagem_etapa`; `clientes_ativos`.
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Smoke** — `GET /v1/indicators?scope=empresa&period=mes` ⇒ 12 leituras, `clientes_ativos.value == 3` (seed tem 3 leads na etapa 7), `recontratacao.value ≈ 50`; `empresa` traz 3 marcos e 12 meses; lançar `falta` 2.5 hoje ⇒ leitura `value 2.5`, `sem ok`, `stale false`; `pracas` 1 linha; `pessoas` 3 linhas; `canais` 6 linhas.
- [ ] **Step 4: Contrato §16. Commit** — `feat(api): indicadores calculados no servidor`.

---

### Task 14: Notificações do sino

**Files:**
- Create: `api/src/modules/notifications/{notifications.module.ts,notifications.controller.ts,notifications.service.ts}`

**Interfaces:**
- `GET /v1/notifications?praca_id` → `[{id, text, tone:'warn'|'info'}]` — regras de `Layout.tsx:42-89` (amanhã: recorrentes que ocorrem amanhã; etapas travadas; etapa ativa há 7+ dias sem conclusão; leads críticos; freio de preenchimento; campanha ativa acima do teto), **já filtradas** pelas dispensas do usuário.
- `POST /v1/notifications/dismiss {ids: string[]}` → `{ok:true}`.

- [ ] **Step 1: Implementar + smoke** (praça seed tem `lock-3`; dismiss ⇒ some; ids de teste removidos da tabela ao fim).
- [ ] **Step 2: Contrato §17. Commit** — `feat(api): notificações`.

---

### Task 15: Integração com o Freela (cliente, conversor, campanhas, automáticas, outbox e sync)

**Files:**
- Create: `api/src/modules/freela/{freela.module.ts,freela.controller.ts,freela-client.ts,freela-template.ts,freela-campaigns.service.ts,freela-templates.service.ts,freela-sync.scheduler.ts,freela-outbox.service.ts,dto/freela.dto.ts}`
- Modify: `api/src/modules/disparos/disparos.service.ts` (preview/create em modo `freela`), `api/src/app.module.ts`
- Test: `api/src/modules/freela/__tests__/freela-client.spec.ts`, `freela-template.spec.ts`, `freela-outbox.spec.ts`

**Interfaces:**
- `FreelaClient` (injetável; `fetch` nativo do Node 20): `isConfigured()`; `request<T>(method, path, body?, {multipart?})` — faz `POST /v1/admins/login {email,password}` na primeira chamada e guarda `accessToken` em memória; em `401` refaz o login uma vez; lança `ServiceUnavailableException({code:'FREELA_NOT_CONFIGURED', message:'Conexão com o Freela não configurada (FREELA_API_URL, FREELA_ADMIN_EMAIL, FREELA_ADMIN_PASSWORD).'})` quando não configurado; `BadGatewayException({code:'FREELA_ERROR', message: <mensagem do Freela: body.error?.message ?? body.message ?? status>})` em erro HTTP; timeout 15 s. Todos os corpos do Freela são **camelCase** e as respostas vêm em `{data, meta?}` — o cliente devolve `data` (e `meta` quando houver).
- `freela-template.ts` (puro): `toFreelaTemplate(textA, textB|null, ctx: RenderCtx sem lead): {template, unsupported_variables}` — mapeia `{{primeiro_nome_dono}}→{{primeiro_nome}}`, `{{nome}}→{{nome}}`, `{{cidade}}→{{cidade}}`; resolve `praca, meu_nome, link_video_caso, link_cadastro, funcao, valor, turno, dia_forte, data` pelo contexto/defaults; deixa intactas e lista em `unsupported_variables` as de lead (`estabelecimento, bairro, estabelecimento_vizinho, data_vaga`); junta variantes com `\n---\n`. `toFreelaPacing(settings: SendSettings): {messagesPerHour, dailyCap, windowStartHour, windowEndHour, weekdaysOnly}` — `messagesPerHour = clamp(round(3600 / ((gap_min+gap_max)/2)), 1, 60)`, `dailyCap = clamp(daily_limit, 1, 1000)`, `windowEndHour = window_end` (Freela usa fim exclusivo 1..24, Praça também é exclusivo), `weekdaysOnly = !sunday` (**nota no contrato**: o Freela não distingue sábado; `sunday:false` no Praça vira dias úteis no Freela).
- `FreelaCampaignsService`:
  - `status()` → `{configured, reachable, admin_email, scheduler_enabled: boolean|null, per_contact_message: boolean, last_sync_at}` (reachable via `GET /v1/admins/activation-campaigns` que também traz `meta.schedulerEnabled`).
  - `audienceOptions(audience)`, `audiencePreview({audience, filters})` — proxies (`GET …/audience-options?audience=`, `POST …/audience-preview`).
  - `createFromLeads({name, praca_id, disparo_id?, kind, leads:[{id, name, decisor, phone, city, text}], template, pacing, start_now})` → cria `EXTERNAL_LIST` com `contacts = leads.map(l => ({name: decisor||name, phone: toE164BR(phone), …(perContact ? {message: l.text} : {})}))` (pula telefone inválido, contando `invalid_phones`), `whatsappTemplate = template`, `listFileName: 'praca:<kind>'`, `skipRegistered: false`; se `start_now` chama `PATCH /:id/start`; grava `freela_campaigns`; devolve `{freela_id, recipients_count, invalid_phones}`.
  - `createForBase({name, praca_id, audience, filters, template, pacing, start_now})` (audiência do Freela).
  - `list(praca_id?)` → espelho local + `stats` (se `last_synced_at` > 60 s, sincroniza antes); `detail(id)` → `{campaign (local), freela: <GET /:id do Freela>, recipients: <GET /:id/recipients?page&pageSize=50>}`; `setState(id, 'start'|'pause'|'cancel')`.
- `FreelaTemplatesService`: `list(praca_id?)` (lista do Freela + `praca_id` do vínculo local), `get(id)`, `create(dto, praca_id)` (grava `freela_templates`), `update(id, dto)`, `setEnabled(id, enabled)`, `uploadImage(file)` (multipart repassado ao `POST …/campaign-templates/upload`, campo `file`).
- `FreelaOutboxService.flush(now)`: seleciona `msg_sends` `mode='freela' AND status='fila' AND scheduled_at <= now AND freela_campaign_id IS NULL` agrupados por `disparo_id` (um lote por disparo, nome do disparo) e, para os de cadência (`disparo_id IS NULL`), um lote único nomeado `Cadências — dd/mm HH:mm`; cada lote vira `createFromLeads(...)` com `start_now:true` e o `template` = `toFreelaTemplate` do modelo do disparo (ou, para cadências, o texto do primeiro envio como variante única); grava `freela_campaign_id` nos `msg_sends`; telefone inválido ⇒ `status 'falhou'`, `failure_reason 'Telefone inválido para WhatsApp.'`.
- `FreelaSyncScheduler` `@Cron('*/2 * * * *')`, gated por `FREELA_SYNC_ENABLED === 'true'` e `isConfigured()`: `outbox.flush()`; depois, para cada `freela_campaigns` com `status` ∉ `COMPLETED|CANCELLED`: `GET /:id` ⇒ atualiza `status/stats/last_synced_at`; se há `msg_sends` vinculados, pagina `GET /:id/recipients?pageSize=200` e casa `recipient.externalPhone` com `toE164BR(lead.phone)`: `SENT` ⇒ `status 'enviada'`, `sent_at = recipient.sentAt`, `freela_recipient_id`, evento `msg_out` no lead ("<nome do disparo/cadência> enviada pelo Freela (WhatsApp).") + `last_contact_at`, uma única vez; `FAILED|SKIPPED` ⇒ `'falhou'` + `failure_reason`; disparo vira `concluido` quando nenhum `fila`.
- Rotas do Praça: `GET /v1/freela/status`; `GET /v1/freela/audience-options?audience=`; `POST /v1/freela/audience-preview {audience, filters}`; `GET /v1/freela/campaigns?praca_id`; `POST /v1/freela/campaigns {name, praca_id, audience, filters?, lead_filters?: DisparoFilters, template_id?, whatsapp_template?, pacing?, start_now}` (`audience:'EXTERNAL_LIST'` exige `lead_filters` ou `template_id`); `GET /v1/freela/campaigns/:id`; `PATCH /v1/freela/campaigns/:id/start|pause|cancel`; `GET /v1/freela/templates?praca_id`; `GET /:id`; `POST /v1/freela/templates {praca_id, …CreateCampaignTemplateDto em snake_case}`; `PUT /:id`; `PATCH /:id/enabled {enabled}`; `POST /v1/freela/templates/upload` (multipart — adicionar a dependência `@fastify/multipart@^9` ao `package.json` e registrar em `main.ts` com `limits.fileSize 5MB`; o `GET /v1/freela/status` é a única rota `/v1/freela/*` que responde 200 sem Freela configurado). DTOs do Praça em snake_case e o serviço converte para o camelCase do Freela.
- `DisparosService`: em `mode:'freela'`, `preview` devolve `freela: toFreelaTemplate(...)`; `create` valida `isConfigured()` (503) e deixa os `msg_sends` em `fila` com `scheduled_at` para o outbox.

- [ ] **Step 1: Testes** — `freela-client.spec.ts` com `global.fetch` mockado: não configurado ⇒ 503; login + chamada; 401 ⇒ relogin e retry uma vez; erro 400 do Freela ⇒ `FREELA_ERROR` com a mensagem do corpo. `freela-template.spec.ts`: conversão do modelo tp01 ⇒ `{{primeiro_nome}}`, `{{cidade}}` mantidos, `{{meu_nome}}` resolvido, `unsupported_variables` contém `estabelecimento` e `estabelecimento_vizinho`; `toFreelaPacing({gap 20-90, daily 200, window 9-19, sunday false})` ⇒ `{messagesPerHour: 60, dailyCap: 200, windowStartHour: 9, windowEndHour: 19, weekdaysOnly: true}`. `freela-outbox.spec.ts`: com Prisma e cliente mockados, 3 sends de um disparo viram 1 campanha e recebem `freela_campaign_id`; telefone inválido vira `falhou`.
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Smoke** (Freela desconfigurado no `.env` de teste): `GET /v1/freela/status` ⇒ `configured false`; `POST /v1/freela/campaigns` ⇒ 503; preview de disparo `mode freela` ⇒ `freela.unsupported_variables` contém `estabelecimento`. **Teste manual documentado** no contrato §18 contra a API local do Freela (`FREELA_API_URL=http://localhost:3000`, conta admin com `REFERRALS`): criar campanha de teste `EXTERNAL_LIST` com 1 contato próprio, ver `status RUNNING`, sync em 2 min.
- [ ] **Step 4: Contrato §18 (inclui a tabela Praça ↔ Freela e a nota da flag `FREELA_PER_CONTACT_MESSAGE`). Commit** — `feat(api): integração com campanhas do Freela (normais e automáticas)`.

---

### Task 16: Extensão opcional no api-freela — mensagem por contato (branch local, sem push)

**Files (em `/home/doutor/coding/freela/api-freela`, branch `feat/activation-campaigns-contact-message` criada a partir de `main`):**
- Modify: `src/shared/activation-campaigns/adapters/http/dtos/activation-campaign.dto.ts` (`ExternalContactDto.message?: string` `@IsOptional() @IsString() @MaxLength(4000)`), `src/shared/activation-campaigns/domain/external-contact.ts` (normalização preserva `message` aparado), `prisma/schema.prisma` (`ActivationCampaignRecipient.customMessage String? @map("custom_message")`), `prisma/migrations/<ts>_activation_recipients_custom_message/migration.sql` (`ALTER TABLE shared.activation_campaign_recipients ADD COLUMN custom_message TEXT;`), `src/shared/activation-campaigns/application/activation-campaign.service.ts` (ao materializar recipients de `EXTERNAL_LIST`, gravar `customMessage`), `src/shared/activation-campaigns/application/activation-dispatcher.service.ts` (texto = `recipient.customMessage ? withOptOut(recipient.customMessage) : <render atual>`), `docs/api-contracts.md` (§ campanhas: campo `contacts[].message`).
- Test: `src/shared/activation-campaigns/__tests__/activation-campaign-external-list.spec.ts` (aceita e guarda `message`), `activation-dispatcher.service.spec.ts` (usa `customMessage` quando presente).

- [ ] **Step 1:** `git -C /home/doutor/coding/freela/api-freela stash -u` **NÃO** — o repo está na branch `feat/enable-message-flags` com trabalho; use `git worktree add /home/doutor/coding/freela/.wt/api-contact-message -b feat/activation-campaigns-contact-message main` e trabalhe lá.
- [ ] **Step 2:** testes primeiro (falham), implementar, `npx jest src/shared/activation-campaigns` verde, `npx tsc --noEmit -p tsconfig.json` limpo.
- [ ] **Step 3:** commit na branch (`feat(campanhas): contacts[].message — texto por destinatário na lista externa`), **sem push**. Anotar no `docs/api-contract.md` do Praça (§18) que a flag `FREELA_PER_CONTACT_MESSAGE` só pode ligar depois do merge/deploy dessa branch.

---

### Task 17: Smoke consolidado, contrato e documentação da API

**Files:**
- Modify: `api/scripts/smoke.sh` (ordem, limpeza, contagem final), `docs/api-contract.md` (índice, §19 "Desvios propositais" = seção 9 do spec), `README.md`, `CLAUDE.md`

- [ ] **Step 1:** rodar `npm run smoke` duas vezes seguidas ⇒ mesmas contagens, 0 falhas, sem leads/praças/disparos residuais (conferir por `GET /v1/leads?q=$SUF`). Rodar `npm test` e `npm run typecheck`.
- [ ] **Step 2:** `README.md` completo (como subir, portas, logins, tabela de telas, integração Freela). Commit — `docs(api): contrato, smoke e README`.

---

## Fase B — Web

### Task 18: Scaffold do web, tema, kit de UI, auth, shell e catálogo

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs`, `web/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:3014`), `web/eslint.config.mjs`, `web/src/app/{layout.tsx,providers.tsx,globals.css,page.tsx}`, `web/src/app/entrar/page.tsx`, `web/src/app/(app)/layout.tsx`, `web/src/components/ui/*` (copiar de `.prototype/src/components/ui/`), `web/src/components/praca/AppShell.tsx`, `web/src/lib/{dates.ts,format.ts,utils.ts,ui-store.ts}`, `web/src/modules/shared/infrastructure/http.ts`, `web/src/modules/auth/{domain/auth.types.ts,infrastructure/auth.api.ts,infrastructure/auth.storage.ts,application/auth.store.ts,application/use-auth.ts}`, `web/src/modules/catalog/{infrastructure/catalog.api.ts,application/use-catalog.ts}`, `web/src/modules/users/{infrastructure/users.api.ts,application/use-users.ts}`, `web/src/modules/pracas/{infrastructure/pracas.api.ts,application/use-pracas.ts}`, `web/src/modules/notifications/{infrastructure/notifications.api.ts,application/use-notifications.ts}`

**Interfaces:**
- `package.json`: copiar do meu-par (nome `praca-web`, portas 3024) e **adicionar** `leaflet@^1.9.4`, `@types/leaflet@^1.9.22`.
- `globals.css`: `@import 'tailwindcss'; @import 'tw-animate-css';` + o conteúdo de `.prototype/src/styles.css` a partir de `@custom-variant` (tema dark padrão em `:root`, `.light` como override, `@utility tag`, `@utility card-surface`, `@media print`), com `--font-display: var(--font-montserrat)` e `--font-sans: var(--font-inter)` vindos de `next/font/google` no `layout.tsx` (`Montserrat 700/800/900`, `Inter 400–700`). `<html lang="pt-BR">`; a classe `light` é aplicada no `<html>` por um `ThemeSync` no `(app)/layout.tsx` a partir de `user.theme`.
- `http.ts`: igual ao meu-par sem `mediaUrl`; `API_URL` default `http://localhost:3014`.
- `auth.types.ts`: `AuthSession { access_token, user: UserView }`; `auth.store.ts` (zustand): `user`, `hydrated`, `hydrate()`, `signIn(email,password)`, `setUser(u)`, `signOut()`; `use-auth.ts` como no meu-par (limpa o cache do react-query antes de sair).
- `ui-store.ts` (zustand, sem persistência): `hojePerson: 'all'|uuid`, `openActionId`, `openLeadId`, `setHojePerson`, `openAction(id|null)`, `openLead(id|null)`.
- `use-catalog.ts`: `useCatalog()` → react-query `['catalog']` `staleTime: Infinity`; expõe o objeto do `GET /v1/catalog` tipado por zod (`catalog.api.ts`).
- `use-pracas.ts`: `usePracas()`, `useActivePraca()` (praça de `user.active_praca_id` ou a primeira), `useSetActivePraca()` (`PATCH /v1/users/me {active_praca_id}` + invalidação), `useCreatePraca()`, `useUpdatePraca()`, `useRecalcDates()`.
- `use-users.ts`: `useUsers()` (`['users']`), `usePerson(id)` helper (do cache), `useUpdateMe()`, `useCreateUser()`, `useUpdateUser()`, `useSetPassword()`.
- `use-notifications.ts`: `useNotifications(pracaId)` (`refetchInterval: 60_000`), `useDismissNotifications()`.
- `AppShell.tsx`: porta `Layout.tsx` (NAV com 10 itens: os 9 do protótipo + `{to:'/freela', label:'Freela', icon: <caminho SVG de um plug: "M6 7V3M10 7V3M4 7h8v3a4 4 0 01-8 0V7zM8 14v7">}`), `Bell` lendo `useNotifications`, botão de tema chamando `useUpdateMe({theme})`, subtítulo com praça ativa, botão "Sair". Rotas do Next: `/` → `redirect('/hoje')`; o item "Ações" aponta para `/hoje`.
- `(app)/layout.tsx`: guarda (sem `user` ⇒ `/entrar`) + `<AppShell>` + `<ActionPanel/>` global (Task 19) + `<LeadPanel/>` global (Task 20).
- `entrar/page.tsx`: e-mail + senha (react-hook-form + zod), erro via `apiErrorMessage`, `?demo=1` preenche `diego@praca.local/praca123`; logado ⇒ `/hoje`.
- `lib/dates.ts`: `todaySp()`, `addDays`, `diffDays`, `fmtBR`, `fmtShort`, `fmtDateTime` (em BRT), `wdOf`, `WD_LONG`, `WD_SHORT`, `iso(Date)` para o calendário — portar `store-dates.ts` **trocando** `todayISO` por `todaySp` (Intl com `America/Sao_Paulo`).

- [ ] **Step 1:** `yarn install`; copiar UI kit; escrever os arquivos; `yarn typecheck` limpo.
- [ ] **Step 2:** subir `yarn dev` e conferir manualmente `/entrar?demo=1` → `/hoje` mostra o shell com a praça "Belo Horizonte + Contagem" e o sino com contagem.
- [ ] **Step 3: Commit** — `feat(web): scaffold, tema do protótipo, auth e shell`.

---

### Task 19: Hoje, Plano da praça, Calendário, ActionPanel, abertura de praça

**Files:**
- Create: `web/src/app/(app)/hoje/page.tsx`, `web/src/app/(app)/praca/page.tsx`, `web/src/app/(app)/calendario/page.tsx`, `web/src/components/praca/{ActionPanel,bits,AberturaPraca,NewPracaForm}.tsx`, `web/src/modules/actions/{infrastructure/actions.api.ts,application/use-actions.ts}`, `web/src/modules/geo/{infrastructure/geo.api.ts,application/use-geo.ts}`
- Modify: `web/src/app/(app)/layout.tsx` (monta `<ActionPanel/>`)

**Interfaces:**
- `use-actions.ts`: `useActions(pracaId)` (`['actions', pracaId]` → `ActionView[]`), `useAgenda(pracaId, {from, to, person})` (`['agenda', …]`), `useSteps(pracaId)`, `useCompleteAction()`, `useUncompleteAction()`, `usePostponeAction()`, `useReassignAction()`, `useAddComment()`, `useAddSubitem()`, `useToggleSubitem()`, `useCreateAction()`, `useSetStepResult()`, `useUnlockStep()`. Toda mutação invalida `['actions', pracaId]`, `['agenda']`, `['steps', pracaId]`, `['notifications']`.
- `use-geo.ts`: `useEstados()`, `useMunicipios(uf)` (`enabled: !!uf`), `useVizinhas(ibge, km)`.
- Helpers de apresentação em `bits.tsx` (`Avatar`, `StepTag`, `Check`, `ActionRow`, `SectionHead`, `NewActionButton`) portados de `.prototype/src/components/praca/bits.tsx`; `ActionRow` recebe `action: ActionView`, `praca`, `date?`, `showDate?` e usa `isDoneOn` (`completions[date]` para recorrente, `completed_at` para once) — copiar `dueDateOf/recLabel` para `web/src/lib/recurrence.ts` (mesmo código puro da API; é apresentação de prazo).
- Páginas: portar `routes/index.tsx` (Hoje) usando `useAgenda(praca.id, {from: hoje-7, to: hoje+7, person})` para `late/today/next7/load` e `useActions` para resolver `action_id`; `FunilHoje` usa `useLeads({praca_id, archived:false})` — implementar já nesta tarefa `web/src/modules/leads/{infrastructure/leads.api.ts,application/use-leads.ts}` só com `useLeads(filters)` e `useLead(id)`; a Task 20 completa o módulo. Portar `routes/praca.tsx` (seletor de praça via `useSetActivePraca`, `useSteps`, resultado/destrave, `AberturaPraca` com Leaflet via `dynamic(() => import(...), {ssr:false})` e `useMunicipios/useVizinhas`, `NewPracaForm`), `routes/calendario.tsx` (`useAgenda` com `from/to` do grid de 42 dias, `by_date`; drag de ação once ⇒ `usePostponeAction` com motivo "Remanejada pelo calendário"; faixas de etapa via `useSteps().window`).
- `ActionPanel.tsx`: portar `ActionPanel.tsx` lendo `openActionId` do `ui-store`, `useActions` (todas as praças? — o painel abre ações da praça ativa; para ações de outra praça, buscar `GET /v1/actions/:id` via `useAction(id)`), autor = usuário logado (o `<select>` de autor do protótipo some), `expects_result` pede número.

- [ ] **Step 1:** escrever módulos + páginas; `yarn typecheck`.
- [ ] **Step 2:** navegação manual: Hoje lista atrasadas/hoje/próximos; concluir pelo checkbox some da lista e aparece riscado; abrir painel, adiar, comentar; Plano mostra 11 etapas com 3 travada, destravar; Abertura de praça: MG → Belo Horizonte → mapa com círculo e vizinhas → criar praça; Calendário mês/semana, arrastar ação.
- [ ] **Step 3: Commit** — `feat(web): hoje, plano da praça, calendário e painel da ação`.

---

### Task 20: Funil, Entrada de leads, painel do lead, formulário público

**Files:**
- Create: `web/src/app/(app)/funil/page.tsx`, `web/src/app/(app)/entrada/page.tsx`, `web/src/app/formulario/[pracaId]/page.tsx`, `web/src/components/praca/{LeadPanel,MoveLeadDialog,NovoLeadDialog}.tsx`, `web/src/lib/intake.ts` (parse CSV/XML do protótipo `intake.ts:44-108` — só leitura de arquivo; avaliação é da API), `web/src/modules/leads/{infrastructure/leads.api.ts,application/use-leads.ts}` (completar), `web/src/modules/imports/{infrastructure/imports.api.ts,application/use-imports.ts}`, `web/src/modules/public/infrastructure/public.api.ts`
- Modify: `web/src/app/(app)/layout.tsx` (monta `<LeadPanel/>`)

**Interfaces:**
- `use-leads.ts`: `useLeads(filters)`, `useLead(id)` (`enabled: !!id`), `useLeadQueue(person)`, `useLeadMetrics(pracaId)`, `useOrphanLeads()`, `useCreateLead()`, `useUpdateLead()`, `useMoveLead()`, `useAddLeadEvent()`, `useSetNextStep()`, `useArchiveLead()`, `useSnoozeLead()`. Invalidação: `['leads']`, `['lead', id]`, `['lead-queue']`, `['lead-metrics']`, `['indicators']`, `['notifications']`.
- `use-imports.ts`: `useMappings()`, `useSaveMapping()`, `useDeleteMapping()`, `useEvaluateImport()` (mutation que devolve o resultado), `useRunImport()`, `useImports()`, `useUndoImport()`.
- `public.api.ts`: `getPublicPraca(id)`, `postPublicLead(body)` — **sem** token (axios direto, não o `api` com interceptor).
- Portar `routes/funil.tsx` (métricas de `useLeadMetrics`, kanban de `useLeads({praca_id, archived})` com drag ⇒ `MoveLeadDialog` ⇒ `useMoveLead`), `routes/entrada.tsx` (`FilaDoDia` = `useLeadQueue`; `ImportSection`: `readFile` local ⇒ `useEvaluateImport` a cada mudança de mapeamento/opções (debounce 300 ms) ⇒ tabela de prévia com as 10 linhas devolvidas ⇒ `useRunImport`; `SemPracaList` = `useOrphanLeads` + `useUpdateLead`; `FormularioSection` monta a URL `${window.location.origin}/formulario/<id>?origem=pago|organico`; `HistoricoSection` = `useImports` + `useUndoImport`), `LeadPanel.tsx` (`openLeadId` ⇒ `useLead`; botões rápidos ⇒ `useAddLeadEvent`; dono ⇒ `useUpdateLead`; mover ⇒ `MoveLeadDialog`), `NovoLeadDialog`, `MoveLeadDialog`, e `routes/formulario.$pracaId.tsx` como página pública (`searchParams.origem`, `searchParams.camp`) chamando `postPublicLead`.

- [ ] **Step 1:** implementar; `yarn typecheck`.
- [ ] **Step 2:** manual: kanban com 25+ leads, arrastar para "Contatado" pede próximo passo e grava; painel do lead mostra linha do tempo; Entrada: importar um CSV de 3 linhas (criar `web/scripts/fixtures/leads.csv`), ver duplicado/sem telefone, confirmar, desfazer; formulário público em aba anônima cria lead com origem "tráfego pago".
- [ ] **Step 3: Commit** — `feat(web): funil, entrada de leads, painel do lead e formulário público`.

---

### Task 21: Mensagens — modelos, disparos (fila e Freela), cadências

**Files:**
- Create: `web/src/app/(app)/mensagens/page.tsx`, `web/src/components/praca/{Disparos,Cadencias,TemplateEditor}.tsx`, `web/src/modules/messages/{infrastructure/messages.api.ts,application/use-messages.ts}`, `web/src/modules/disparos/{infrastructure/disparos.api.ts,application/use-disparos.ts}`, `web/src/modules/cadences/{infrastructure/cadences.api.ts,application/use-cadences.ts}`

**Interfaces:**
- `use-messages.ts`: `useTemplates()`, `useSaveTemplate()`, `useDeleteTemplate()`, `useRenderTemplate()` (mutation), `useSettings()`, `useUpdateSettings()`, `useBlocklist()`, `useAddBlock()`, `useRemoveBlock()`.
- `use-disparos.ts`: `useDisparoPreview(input)` (query com `keepPreviousData`, `enabled` quando há modelo), `useCreateDisparo()`, `useDisparos()`, `useDisparo(id)` (`refetchInterval: 30_000` enquanto houver `fila` em modo `freela`), `useMarkSend()`, `useReplySend()`.
- `use-cadences.ts`: `useCadences()`, `useSaveCadence()`, `useDeleteCadence()`, `useTogglePause()`, `useEnroll()`, `useRunTest()`, `useCadenceStats(id)` (`refetchInterval: 15_000` quando aberto), `useExitEnrollment()`, `useRestoreSeed()`.
- Portar `routes/mensagens.tsx` (abas modelos/disparos/cadências; `Modelos` com métricas vindas do `GET`), `TemplateEditor` (prévia via `useRenderTemplate` com debounce), `Disparos.tsx` (modos = `catalog.send_modes` — 2 cartões; ao escolher `freela` mostrar o bloco "Como vai sair pelo Freela" com `preview.freela.template` e o aviso das `unsupported_variables`; `ConfigEnvio` sem os blocos Meta/provedor; `PainelDisparo` mostra `failure_reason` e o link para `/freela` quando `freela_campaign_id`), `Cadencias.tsx` (sem `setInterval` — o motor é do servidor; "Testar comigo" diz "cada dia da cadência vira 5 segundos").

- [ ] **Step 1:** implementar; `yarn typecheck`.
- [ ] **Step 2:** manual: criar modelo com variação B, prévia com lead real; disparo em fila com 3 leads, marcar enviada, registrar resposta "pare" ⇒ toast de bloqueio; modo Freela desconfigurado ⇒ toast com a mensagem 503; cadência: editar, salvar, "Testar comigo" e ver os passos avançarem em ~30 s.
- [ ] **Step 3: Commit** — `feat(web): mensagens, disparos e cadências`.

---

### Task 22: Campanhas de mídia (estratégia, criativos, tráfego, calendário) + atalho Freela

**Files:**
- Create: `web/src/app/(app)/campanhas/page.tsx`, `web/src/components/praca/{CampEstrategia,CampCriativos,CampTrafego,CampCalendario}.tsx`, `web/src/modules/midia/{infrastructure/midia.api.ts,application/use-midia.ts}`

**Interfaces:**
- `use-midia.ts`: `useCampanhas(pracaId?)`, `useSaveCampanha()`, `useDeleteCampanha()`, `useDuplicateCampanha()`, `useSetCampanhaStatus()`, `useSuggestName()`, `useCreatives(campanhaId)`, `useSaveCreative()`, `useDeleteCreative()`, `useSetCreativeStatus()`, `useSetPublishDate()`, `useReviewCreative()`, `useTraffic(campanhaId)`, `useSaveTraffic()`, `useDeleteTraffic()`, `useSaveTrafficDay()`, `usePullTrafficApi()`, `useProofs(pracaId)`, `useAddProof()`.
- Portar os 4 componentes e a rota. `CampanhaCard` ganha o botão **"Campanha de WhatsApp no Freela"** que abre `FreelaCampaignDialog` (Task 24) com `initial = {name: c.name, praca_id, audience: publico==='freelancer' ? 'PROVIDERS_NEVER_APPLIED' : 'CONTRACTORS_NEVER_PUBLISHED', whatsapp_template: `${c.mensagem_chave}\n${c.oferta}`.trim()}` — para não criar dependência circular de tarefas, o botão só renderiza se o componente existir (`import { FreelaCampaignDialog } from './FreelaCampaignDialog'` é criado na Task 24; nesta tarefa criar um stub `FreelaCampaignDialog.tsx` que exporta `null` e a Task 24 substitui).

- [ ] **Step 1:** implementar; `yarn typecheck`.
- [ ] **Step 2:** manual: briefing salva com nome sugerido; status ativa exige justificativa quando o portão está fechado; kanban de criativos com drag; aprovar peça; tráfego lança dia e mostra freio quando preenchimento > 4 h; calendário arrasta peça.
- [ ] **Step 3: Commit** — `feat(web): campanhas de mídia`.

---

### Task 23: Indicadores e Configurações

**Files:**
- Create: `web/src/app/(app)/indicadores/page.tsx`, `web/src/app/(app)/configuracoes/page.tsx`, `web/src/components/praca/IndBits.tsx`, `web/src/modules/indicators/{infrastructure/indicators.api.ts,application/use-indicators.ts}`, `web/src/modules/template-actions/{infrastructure/template-actions.api.ts,application/use-template-actions.ts}`

**Interfaces:**
- `use-indicators.ts`: `useIndicators({scope, praca_id, period, from, to})`, `useEmpresa(period…)`, `usePracaRows(period…)`, `usePessoaRows(period…)`, `useCanalRows(praca_id, period…)`, `useAddEntry()`.
- `use-template-actions.ts`: `useTemplateActions()`, `useCreateTemplateAction()`, `useUpdateTemplateAction()`, `useDeleteTemplateAction()`.
- Portar `routes/indicadores.tsx` (+ `IndBits.tsx`; `fmtVal` vive em `web/src/lib/format.ts`) e `routes/configuracoes.tsx`: Pessoas (lista `useUsers` com cor/nome/função/e-mail/telefone editáveis por admin, "definir senha", "desativar"; "+ Adicionar" pede e-mail e senha), Dados da praça (`useUpdatePraca`, `useRecalcDates`), **Variáveis padrão das mensagens** (novo bloco: `template_defaults` via `useUpdateSettings`), Roteiro-modelo (`useTemplateActions`, só admin edita), impressão.

- [ ] **Step 1:** implementar; `yarn typecheck`.
- [ ] **Step 2:** manual: Empresa mostra 6 heróis e 3 marcos; lançar "Falta" 2.5; visão Pessoa 3 linhas; Configurações: criar pessoa, trocar cor, editar título de uma ação-modelo.
- [ ] **Step 3: Commit** — `feat(web): indicadores e configurações`.

---

### Task 24: Tela Freela (campanhas, automáticas, conexão)

**Files:**
- Create: `web/src/app/(app)/freela/page.tsx`, `web/src/components/praca/{FreelaCampaignDialog,FreelaTemplateDialog,FreelaCampaignDetail}.tsx`, `web/src/modules/freela/{infrastructure/freela.api.ts,application/use-freela.ts}`
- Modify: `web/src/components/praca/CampEstrategia.tsx` (usa o diálogo real)

**Interfaces:**
- `use-freela.ts`: `useFreelaStatus()` (`refetchInterval: 60_000`), `useAudienceOptions(audience)`, `useAudiencePreview()` (mutation), `useFreelaCampaigns(pracaId?)` (`refetchInterval: 30_000`), `useFreelaCampaign(id)`, `useCreateFreelaCampaign()`, `useSetFreelaCampaignState()`, `useFreelaTemplates(pracaId?)`, `useFreelaTemplate(id)`, `useCreateFreelaTemplate()`, `useUpdateFreelaTemplate()`, `useSetFreelaTemplateEnabled()`, `useUploadFreelaImage()`.
- Página com abas **Campanhas / Automáticas / Conexão**. Quando `status.configured === false`, cada aba mostra o cartão "Conexão com o Freela não configurada" com as 3 variáveis e o passo a passo (criar admin com permissão `REFERRALS` no painel do Freela) — e os botões de criar ficam desabilitados.
- `FreelaCampaignDialog` (`initial?`): nome; praça; público (`EXTERNAL_LIST` "Leads do funil" com o mesmo bloco de filtros do Disparos + modelo; ou uma das 4 audiências do Freela com recorte "Cidades da praça" (`cities` = sede + vizinhas), "Raio de 50 km da sede", "UF", módulo); botão "Contar" (`useAudiencePreview`); texto (até 3 variantes separadas por `---`, contador de caracteres) ou modelo do Praça (mostra a conversão e as variáveis não suportadas); ritmo (mensagens/hora ≤ 60, teto/dia, janela, só dias úteis) pré-preenchido pelas configurações; "Criar e iniciar" / "Salvar rascunho". Aviso fixo em vermelho: "Disparo frio queima número. O Freela usa o chip de campanha, ritmo baixo e opt-out — mesmo assim, mande só para quem faz sentido."
- Lista de campanhas: nome, tipo (disparo/cadência/base/manual), praça, status, `stats` (pendentes/enviadas/falhas/puladas), ações pausar/retomar/cancelar, "ver destinatários" (`FreelaCampaignDetail`: tabela paginada com nome, telefone mascarado, status, motivo).
- `FreelaTemplateDialog`: os campos de `CreateCampaignTemplateDto` em snake_case (agenda WEEKLY com 7 toggles + hora · DATED com dia/mês, "repetir todo ano", X dias antes; público + recorte; canais; texto WhatsApp; título/corpo do push; imagem via `useUploadFreelaImage`; ritmo; máximo por rodada). Lista com "ligada/pausada" (`Switch`), "última rodada", "editar".
- Aba Conexão: `useFreelaStatus` (configurada, alcançável, e-mail, `scheduler_enabled`, `per_contact_message`, última sincronização) + texto explicando as duas flags do servidor do Freela.

- [ ] **Step 1:** implementar; `yarn typecheck`.
- [ ] **Step 2:** manual sem Freela: tela mostra o cartão de configuração. **Com Freela local** (subir `api-freela` em 3000 com `ACTIVATION_CAMPAIGNS_ENABLED=false` e uma conta admin `REFERRALS`; preencher o `.env` do Praça): criar campanha `EXTERNAL_LIST` com 1 lead (seu telefone), ver `DRAFT` → iniciar → `RUNNING`; criar template automático semanal e ligar; ver os dois no painel do Freela (`freela-admin`). Registrar o resultado no `docs/api-contract.md` §18.
- [ ] **Step 3: Commit** — `feat(web): tela Freela — campanhas, automáticas e conexão`.

---

### Task 25: browser-check, revisão cruzada e fechamento

**Files:**
- Create: `web/scripts/browser-check.mjs`
- Modify: `README.md`, `CLAUDE.md`, `docs/api-contract.md`

- [ ] **Step 1:** `browser-check.mjs` no molde do meu-par (Playwright de `freela-web-v2/node_modules`), API 3014 / web 3024, login `?demo=1`, abre as 10 telas + `/formulario/<praça seed>` e falha em qualquer erro de console ou HTTP ≥ 400 (`GET /v1/freela/status` responde 200 com `configured:false` quando o Freela não está configurado — só as demais rotas `/v1/freela/*` dão 503); ações reais: concluir uma ação pendente no Hoje (e desfazer), mover um lead novo para "Contatado" com próximo passo (e voltar), criar disparo em fila com 1 lead e marcar enviada, abrir o painel do disparo, lançar indicador "Falta". Mínimo 40 checagens.
- [ ] **Step 2:** rodar `npm run smoke` (API), `node web/scripts/browser-check.mjs`, `yarn typecheck`, `npm run typecheck`, `npm test` — tudo verde, um de cada vez.
- [ ] **Step 3:** revisão adversarial: dispatch de um subagente revisor (`superpowers:requesting-code-review`) sobre o diff inteiro procurando: filtro de praça faltando em query, mutação sem invalidação, `toISOString()` como "hoje", campo aceito sem decorator, id sem `isUuid`, texto de UI diferente do protótipo. Corrigir tudo.
- [ ] **Step 4:** README final (tabela de telas, integração Freela com a nota da branch do api-freela), `docs/api-contract.md` §19 desvios propositais. Commit — `docs: README, contrato e fechamento do port`. Deixar os arquivos **commitados** neste repo (diferente dos ports anteriores, que ficaram só em stage — o dono pediu "bem arquitetado"; o histórico ajuda).
