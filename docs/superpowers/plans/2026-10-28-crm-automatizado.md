# CRM automático — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer o CRM (grupo "Comercial") de volta ao Praça novo, com seis automações atrás de chaves desligadas e as telas no visual da Lovable.

**Architecture:** Módulo novo `api/src/modules/crm/`, que só importa módulos folha. As regras ficam puras em `api/src/domain/crm-*.ts`, um relógio só (`CrmScheduler`) e uma tabela de rodadas. O gancho da busca (A1) e o `since` do sync (A2) ficam nos módulos donos e leem só `common/flags/crm.flags.ts`. No web: `modules/crm/`, duas telas novas (Tarefas, Automações), o Funil e a Entrada redesenhados, e o cabeçalho comum nas outras telas do Comercial.

**Tech Stack:** NestJS 11 + Fastify + Prisma 5.22 + Postgres (api, npm, jest com Prisma falso); Next 15 + React 19 + Tailwind 4 + shadcn + TanStack Query + zod (web, yarn, vitest).

**Spec:** `docs/superpowers/specs/2026-10-28-crm-automatizado-design.md` (vale a §12). As revisões a acompanham:
`docs/superpowers/specs/2026-10-28-crm-automatizado-arquitetura.md` (§2 = como construir a API, numeração dos achados) e
`docs/superpowers/specs/2026-10-28-crm-automatizado-ux.md` (§2 = padrões visuais, §3 = cada tela com textos exatos). **Quem implementa
lê a seção citada em cada tarefa.**

## Global Constraints

- `api/` usa **npm**; `web/` usa **yarn**. Nunca `nest build`, `next build` nem `npm run build`.
- A máquina tem 7,6 GB. Rode `free -m` antes de qualquer processo; se a coluna "disponível" estiver abaixo de 1500, espere. Um processo pesado
  por vez (jest, tsc, API, `next dev`, browser-check).
- jest sempre por arquivo: `cd api && nice -n 19 npx jest --runInBand <caminho-relativo-a-src>`; vitest por arquivo: `cd web && nice -n 19 yarn vitest run <arquivo>`.
- Processo em segundo plano morre pelo PID (`kill <pid>`), nunca `pkill -f`. Não mexa em contêiner nem processo de outro projeto.
- **Git:** `git add` sempre por caminho, nunca `-A`/`-a`/`.`. **Nunca** commite estes 6 arquivos, só reformatados por um formatador externo:
  `api/src/common/__tests__/ui-flags-contrato.spec.ts`, `api/src/domain/__tests__/perfil-rota-rules.spec.ts`, `api/src/domain/perfil-rota-rules.ts`,
  `api/src/modules/campo/pinos/pinos.service.ts`, `api/src/modules/rotas/__tests__/planos-perfil.spec.ts`, `api/src/modules/rotas/rotas-plano.ts`.
  Se a tarefa precisar mudar um deles, pare e avise. Não aplique o stash "prettier externo 23/10 03:08". Não rode `npm run lint` da API
  (é `--fix` na árvore inteira).
- Mensagem de commit em português, no estilo `feat(crm): …` / `fix(leads): …`, terminando com a linha
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Contrato primeiro: endpoint novo ou mudado entra em `docs/api-contract.md` §47 antes do código.
- Wire em snake_case; dia só-dia `"YYYY-MM-DD"` de `todaySp()`; erro `{ error: { code, message } }`; id da URL/query passa por `isUuid()`.
- Toda chave nova começa `false` (`env.validation.ts` com `.default('false')`, `docker-compose.yml` de dev com `${VAR:-false}`).
  Quem injeta `CRM_FLAGS` usa `@Optional() @Inject(CRM_FLAGS)` como **último** parâmetro do construtor.
- Rota nova da equipe: `@Equipe()` em **cada método** (o `permissoes-protecao.spec` derruba a suíte se faltar).
- Specs que **não se editam para passar**: os `*caracterizacao*`, `places/__tests__/places-search.service.spec.ts`,
  `campo/__tests__/signup-sync.service.spec.ts`. Caso novo vai em arquivo novo.
- Autores dos eventos automáticos: `'Automático'` (A1, A4) e `'Automático · Freela'` (A2, A3). O sync de hoje continua com
  `'Freela (sincronização)'`.
- Texto de tela em pt-BR do dia a dia, sem jargão. Quem vai a campo é "representante", nunca "consultor". Todo número leva o que é, a
  conta e a fonte (regra do dono).
- Visual: tema claro único da Lovable (tokens de `web/src/app/globals.css`), copiando as telas redesenhadas (UX §2). Nada de tema escuro.
- Proibido neste lote: Pix automático, `payouts.service.ts` perto da linha 238, `FIELD_EARNINGS_AUTOCLOSE`, alterar o `api-freela`,
  bootstrapAdmin com senha fixa, Google Places gravando dados, pagamento sem razão, login por usuário sintético, chave do Google no
  bundle, dia em UTC, gestor redefinindo senha de admin, status à mão, "Excluir geração" apagando rotas, ler `.env` de produção ou o zip da
  Lovable.
- Nunca chamar um Freela real: nos testes o Freela é sempre um dublê.

## Review Focus

1. **Telefone que casa com o lead errado** (mesmo celular em DDDs diferentes; telefone do Freela que é de outra pessoa) → não casa,
   conta como ambíguo. Teste na Task 9.
2. **Alguém volta o cartão depois do automático** (5 → 3, ou marca Perdido) → nenhuma rodada seguinte empurra de novo. Testes nas Tasks 4 e 5.
3. **Freela responde 401/500/HTML/fora do formato no meio da rodada** → rodada registrada com erro, leads já gravados ficam, nada
   lança para fora do `@Cron`. Teste na Task 10.
4. **Lead arquivado, de teste ou apagado entre a leitura e a escrita** → é pulado sem derrubar a rodada. Testes nas Tasks 5, 7 e 10.
5. **Virada do dia em Brasília** (evento às 23h30 conta no dia certo; A4 roda uma vez por dia mesmo com reinício às 06:10) → Testes nas
   Tasks 11 e 15.

---

### Task 1: Contrato §47, chaves e catálogo do CRM

**Files:**
- Modify: `docs/api-contract.md` (novo §47 no fim), `CLAUDE.md` (item novo "CRM automático (contrato §47)" na lista de regras rápidas)
- Modify: `api/src/common/config/env.validation.ts`, `docker-compose.yml` (serviço da API, junto de `TEAM_COMMERCIAL_ENABLED`)
- Create: `api/src/common/flags/crm.flags.ts`, `api/src/domain/catalog/crm.ts`
- Modify: `api/src/app.module.ts` (registrar `CrmFlagsModule` junto do `UiFlagsModule`)
- Test: `api/src/common/__tests__/crm-flags.spec.ts`

**Interfaces:**
- Produces: `interface FlagsCrm { tasks: boolean; auto_leads: boolean; auto_stages: boolean; auto_lost: boolean; freela_pipeline: boolean }`,
  `CRM_FLAGS: symbol`, `CRM_DESLIGADAS: Readonly<FlagsCrm>`, `lerFlagsCrm(env?: Record<string, unknown>): FlagsCrm`, `@Global() CrmFlagsModule`.
- Produces (`domain/catalog/crm.ts`): `AUTOR_AUTOMATICO = 'Automático'`, `AUTOR_AUTOMATICO_FREELA = 'Automático · Freela'`,
  `AUTOR_SYNC_FREELA = 'Freela (sincronização)'`, `TETO_AUTO_LEADS_POR_BUSCA = 300`, `DIAS_SEM_RESPOSTA = 21`, `DIAS_REAQUECER = 30`,
  `DIAS_CONVERSA_PARADA = 5`, `DIAS_AJUDAR_PUBLICAR = 3`, `DIAS_SEM_CONTATO_T5 = 3`, `DIAS_VISITA_QUENTE = { min: 1, max: 14 }`,
  `DIAS_RETENCAO_RODADAS = 30`, `ITENS_POR_GRUPO = 50`, `ORIGEM_CADASTRO_FREELA = 'cadastro no Freela'`,
  `JOBS_CRM = ['auto_leads_busca', 'etapas_cadastro', 'quadro_freela', 'sem_resposta'] as const`, `type JobCrm = (typeof JOBS_CRM)[number]`.

- [ ] **Step 1: Escrever o §47 do contrato.** As rotas, os corpos e as respostas exatas da arquitetura §2.7, com estes acréscimos da §12 do desenho:
  - `GET /v1/crm/tasks` → `{ day, praca_id, person, counts: { me, all }, entrada: { novos }, freela_configured, groups: [{ task, total, items }] }`;
    item = `{ lead_id, lead_name, owner_id, stage, phone, send_id?, text?, scheduled_at?, origin_label?, visit?: { consultant_name, day, interest },
    next_step?: { what, date, from_cadence }, last_contact_day?, stage_since?, readonly? }`;
  - `POST /v1/crm/tasks/done`: com `owner_id` nulo, quem fez vira dono;
  - `GET /v1/crm/summary` com `praca_id` **opcional** (ausente = todas), `freela_configured` e `freela_read_at`;
  - `GET /v1/leads/metrics` ganha `conv_contact_n`, `conv_contact_de`, `conv_active_n`, `conv_active_de`, e a etapa 8 sai de contatados e cadastrados;
  - as 5 chaves, o que cada uma liga, e `features.crm_tasks` / `features.crm_auto_leads`.
- [ ] **Step 2: Escrever o teste que falha** em `crm-flags.spec.ts`:
  ```ts
  it('tudo desligado sem variável', () => expect(lerFlagsCrm({})).toEqual({ tasks: false, auto_leads: false, auto_stages: false, auto_lost: false, freela_pipeline: false }));
  it('cada chave liga só a sua', () => {
    expect(lerFlagsCrm({ CRM_TASKS_ENABLED: 'true' }).tasks).toBe(true);
    expect(lerFlagsCrm({ CRM_AUTO_LEADS_FROM_SEARCH_ENABLED: 'true' })).toMatchObject({ auto_leads: true, tasks: false });
    expect(lerFlagsCrm({ CRM_AUTO_STAGES_ENABLED: 'true' }).auto_stages).toBe(true);
    expect(lerFlagsCrm({ CRM_AUTO_LOST_ENABLED: 'true' }).auto_lost).toBe(true);
    expect(lerFlagsCrm({ CRM_FREELA_PIPELINE_ENABLED: 'true' }).freela_pipeline).toBe(true);
  });
  it('"1" ou "yes" não ligam', () => expect(lerFlagsCrm({ CRM_TASKS_ENABLED: '1' }).tasks).toBe(false));
  it('CRM_DESLIGADAS congelado', () => expect(Object.isFrozen(CRM_DESLIGADAS)).toBe(true));
  ```
- [ ] **Step 3:** `cd api && nice -n 19 npx jest --runInBand common/__tests__/crm-flags.spec.ts`. Esperado: FAIL (módulo não existe).
- [ ] **Step 4: Implementar** as 5 variáveis em `env.validation.ts` (`z.string().default('false')`, como `TEAM_COMMERCIAL_ENABLED`) e em
  `docker-compose.yml`, `crm.flags.ts` (copiar a forma de `common/flags/ui.flags.ts`: `validateEnv` e `=== 'true'`) e `catalog/crm.ts`.
  Registrar o módulo no `AppModule`.
- [ ] **Step 5:** Rodar o teste do Step 3 → PASS. Rodar também `common/__tests__/ui-flags-contrato.spec.ts` → PASS sem mudar o arquivo.
- [ ] **Step 6: Commit** (`docs/api-contract.md CLAUDE.md api/src/common/config/env.validation.ts docker-compose.yml api/src/common/flags/crm.flags.ts api/src/domain/catalog/crm.ts api/src/app.module.ts api/src/common/__tests__/crm-flags.spec.ts`), mensagem `feat(crm): contrato §47, cinco chaves desligadas e catálogo`.

### Task 2: Migração `20261109100000_crm_automatico`

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/20261109100000_crm_automatico/migration.sql`
- Test: `api/src/modules/crm/__tests__/crm-migracao.spec.ts` (lê o SQL como texto)

**Interfaces:**
- Produces (Prisma):
  - `leads.freela_user_id String?` com `@@index([freela_user_id])`, NÃO único;
  - `leads.freela_hirings Int?`, `leads.auto_stage_applied Int?`;
  - `lead_events.auto_key String? @unique`;
  - `field_signups @@index([freela_user_id])`;
  - modelo `crm_automation_runs { id String @id @default(uuid()) @db.Uuid; job String; ref String?; started_at DateTime; finished_at DateTime?; ok Boolean; summary Json @default("{}"); error String?; @@index([job, started_at(sort: Desc)]) }`.

- [ ] **Step 1: Teste que falha**, lendo `migration.sql`:
  - contém `ADD COLUMN "freela_user_id"`, `"auto_stage_applied"`, `"freela_hirings"`, `CREATE UNIQUE INDEX "lead_events_auto_key_key"`, `CREATE TABLE "crm_automation_runs"`;
  - **não** contém `DROP INDEX` nem `DROP`.
- [ ] **Step 2:** rodar o teste → FAIL (arquivo não existe).
- [ ] **Step 3:** subir o banco local se estiver parado (`docker compose up -d postgres` na raiz do `praca/`; confira com
  `docker ps | grep praca-postgres`). Editar o schema, rodar `cd api && npx prisma migrate dev --create-only --name crm_automatico`,
  **apagar do SQL as linhas `DROP INDEX`** dos índices parciais (CLAUDE.md), mover a pasta para `20261109100000_crm_automatico`, rodar
  `npx prisma migrate deploy` e depois `npx prisma generate`.
- [ ] **Step 4:** rodar o teste → PASS. `docker exec praca-postgres psql -U praca -d praca -qtAc "select count(*) from crm_automation_runs"` → `0`.
- [ ] **Step 5: Commit** (`api/prisma/schema.prisma api/prisma/migrations/20261109100000_crm_automatico api/src/modules/crm/__tests__/crm-migracao.spec.ts`), `feat(crm): migração aditiva do CRM automático`.

### Task 3: Métricas do Funil sem a etapa 8 e com a conta

**Files:**
- Modify: `api/src/modules/leads/leads.service.ts` (`metrics()`, ~linhas 236–265)
- Test: `api/src/modules/leads/__tests__/leads-metrics-perdidos.spec.ts` (novo)

**Interfaces:**
- Produces: a resposta de `metrics()` ganha `conv_contact_n`, `conv_contact_de`, `conv_active_n`, `conv_active_de` (inteiros). Os campos de hoje
  ficam, com a conta corrigida.

- [ ] **Step 1: Teste que falha.** Prisma falso com leads nas etapas `[2, 3, 5, 7, 8, 8]` da mesma praça:
  ```ts
  expect(m).toMatchObject({ conv_contact_n: 2, conv_contact_de: 4, conv_contact: 50, conv_active_n: 1, conv_active_de: 2, conv_active: 50, lost: 2 });
  ```
  Contatados = etapas 2 a 7; cadastrados = 5 a 7; ativos = 7. `avg_days` só conta etapas 5 a 7.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** corrigir os filtros e acrescentar os quatro campos. **Step 4:** rodar → PASS. Rodar também os specs de
  `leads/__tests__/` que já existem → PASS.
- [ ] **Step 5: Commit**, `fix(leads): etapa Perdido fora das taxas do funil e conta de cada taxa`.

### Task 4: Regras puras de etapa (A2, A4 e a guarda)

**Files:**
- Create: `api/src/domain/crm-etapas-rules.ts`
- Test: `api/src/domain/__tests__/crm-etapas-rules.spec.ts`

**Interfaces:**
- Produces:
  - `type DecisaoEtapa = 'aplicar' | 'ja_satisfeito' | 'ignorar'`
  - `deveAplicar(lead: { stage: number; stage_since: string; archived: boolean; is_test: boolean; auto_stage_applied: number | null }, alvo: 5 | 6 | 7, fatoDia: string): DecisaoEtapa`
  - `alvoDoCadastro(s: { confirmado_em: Date | null; first_job_completed_at: Date | null }): { alvo: 5 | 6; fato: Date; motivo: 'cadastro' | 'servico' } | null`
  - `candidatoSemResposta(l: { stage: number; archived: boolean; is_test: boolean; snooze_until: string | null; next_step_date: string | null; stalled_days: number; em_cadencia: boolean }, hoje: string): boolean`

- [ ] **Step 1: Testes que falham** (arquitetura achados 4, 5, 10):
  - `deveAplicar`:
    - etapa 3 → 5 com marca nula = `'aplicar'`;
    - etapa 5 com alvo 5 = `'ja_satisfeito'`;
    - marca 5 e alvo 5 com o lead em 3 (alguém voltou o cartão) = `'ignorar'`;
    - marca 5, alvo 6, lead em 3 = `'aplicar'`;
    - etapa 8 com `stage_since '2026-10-20'` e `fatoDia '2026-10-19'` = `'ignorar'`; com `'2026-10-20'` = `'aplicar'`;
    - arquivado ou teste = `'ignorar'`;
    - etapa 7 com alvo 6 = `'ja_satisfeito'`.
  - `alvoDoCadastro`: serviço concluído vence (`{ alvo: 6, motivo: 'servico' }`); só confirmado dá `{ alvo: 5, motivo: 'cadastro' }`; nenhum dá `null`.
  - `candidatoSemResposta` com `hoje '2026-10-28'`:
    - etapa 2 e `stalled_days` 21 = `true`; 20 = `false`;
    - etapa 3 = `false`;
    - `em_cadencia` = `false`;
    - `snooze_until '2026-10-29'` = `false`;
    - `next_step_date '2026-10-28'` = `false` (hoje conta como futuro).
- [ ] **Step 2:** `nice -n 19 npx jest --runInBand domain/__tests__/crm-etapas-rules.spec.ts` → FAIL. **Step 3:** implementar (os limiares vêm de
  `catalog/crm.ts`). **Step 4:** → PASS. **Step 5: Commit**, `feat(crm): regras puras de etapa automática`.

### Task 5: `subirEtapaAutomatica`, rodadas e passada A2

**Files:**
- Create: `api/src/modules/crm/crm.module.ts`, `api/src/modules/crm/rodadas.ts`, `api/src/modules/crm/etapas-automaticas.service.ts`
- Modify: `api/src/app.module.ts` (importa `CrmModule`)
- Test: `api/src/modules/crm/__tests__/etapas-automaticas.service.spec.ts`

**Interfaces:**
- Consumes: `deveAplicar`, `alvoDoCadastro` (Task 4); `CRM_FLAGS` (Task 1); `RotasConfigService.cadastro()` e `classificar` do sync (a MESMA regra de
  confirmação; ver `campo/signup-sync.service.ts` e `domain/signup-sync-rules.ts`).
- Produces:
  - `registrarRodada(db, r: { job: JobCrm; ref?: string; started_at: Date; ok: boolean; summary: Record<string, unknown>; error?: string }): Promise<void>`
  - `rodadaOkNoDia(db, job: JobCrm, dia: string): Promise<boolean>` (dia de Brasília)
  - `ultimaRodada(db, job: JobCrm): Promise<{ started_at; finished_at; ok; summary; error } | null>`
  - `limparRodadasAntigas(db, agora: Date): Promise<number>`
  - `EtapasAutomaticasService.subir(tx, a: { lead_id: string; alvo: 5 | 6 | 7; fato_dia: string; autor_label: string; texto: string; auto_key: string; agora: Date }): Promise<DecisaoEtapa>`
  - `EtapasAutomaticasService.passadaCadastros(agora: Date): Promise<{ vistos: number; subiram: Record<'5' | '6', number>; vagas: number }>`

- [ ] **Step 1: Testes que falham** (Prisma falso, no padrão de `campo/__tests__/signup-sync.service.spec.ts`):
  - chave `auto_stages` desligada → `passadaCadastros` não lê nada (0 chamadas ao Prisma) e devolve zeros;
  - `field_signups` vinculado com `first_job_completed_at` → lead 5 vai a 6, evento `kind:'stage'`, `stage_to: 6`, `author_label: 'Automático · Freela'`, `auto_key 'a2:etapa:<lead>:6'`, `auto_stage_applied: 6`;
  - rodar duas vezes → um evento só (`auto_key` repetido: P2002 tratado como "já existe");
  - lead que alguém voltou de 6 para 3 depois da marca 6 → não sobe;
  - lead em 8 com fato posterior → sobe, com `lost_reason: null` e `reheat_at: null` no `data`;
  - `first_vacancy_at` → evento `note` "Publicou a primeira vaga no Freela em dd/mm" com `auto_key 'a2:vaga1:<signup>'`, etapa igual;
  - lead arquivado entre a leitura e a escrita (`updateMany` devolve `count: 0`) → segue para o próximo sem lançar;
  - `freela_user_id` nulo no lead é preenchido quando o vínculo é único.
- [ ] **Step 2:** → FAIL. **Step 3: Implementar** conforme a arquitetura §2.4. Um `updateMany` com a guarda no `where` (achados 4/5) e o evento na
  mesma transação. `rodadas.ts` grava `error` saneado (reusar `sanitizarErroSync`). **Step 4:** → PASS. **Step 5: Commit**, `feat(crm): etapa automática pelo cadastro do representante (A2)`.

### Task 6: `since` mais largo do sync com a chave

**Files:**
- Modify: `api/src/modules/campo/signup-sync.service.ts` (só o argumento `maisAntigoSemEvento` de `escolherDesde`, ~linha 118)
- Test: `api/src/modules/campo/__tests__/signup-sync-crm.spec.ts` (novo)

**Interfaces:**
- Consumes: `CRM_FLAGS` como último parâmetro do construtor do `SignupSyncService`.

- [ ] **Step 1: Teste que falha:**
  - com `auto_stages` ligada e um cadastro ativado sem `first_job_completed_at`, criado antes do mais antigo sem o evento da regra → o `since`
    pedido ao Freela é o `freela_created_at` desse cadastro (preso ao piso da janela);
  - desligada → o `since` de hoje, e `findFirst` chamado **uma** vez.
- [ ] **Step 2:** → FAIL. **Step 3:** com a chave, uma segunda consulta (`first_job_completed_at: null`) e o mínimo das duas datas. **Step 4:** → PASS,
  e `campo/__tests__/signup-sync.service.spec.ts` → PASS **sem edição**. **Step 5: Commit**, `feat(crm): sync relê cadastros sem serviço concluído (chave do CRM)`.

### Task 7: A4 — sem resposta vira Perdido

**Files:**
- Create: `api/src/modules/crm/sem-resposta.service.ts`
- Test: `api/src/modules/crm/__tests__/sem-resposta.service.spec.ts`

**Interfaces:**
- Consumes: `candidatoSemResposta` (Task 4), `stalledDays` de `domain/lead-rules.ts`, `registrarRodada` (Task 5).
- Produces: `SemRespostaService.rodar(agora: Date): Promise<{ candidatos: number; perdidos: number }>`.

- [ ] **Step 1: Testes que falham** (arquitetura achado 10):
  - chave `auto_lost` desligada → nada lido;
  - lead em 2 parado há 21 dias → etapa 8, `lost_reason 'não respondeu'`, `reheat_at = addDays(hoje, 30)`, evento com `author_label 'Automático'`,
    `stage_to: 8`, `auto_key 'a4:<lead>:<stage_since>'` e o texto da conta ("último contato em 07/10, 21 dias sem resposta");
  - inscrição `ativo` ou `aguardando` → fica;
  - `stage_since` mudou entre a leitura e a escrita (`count: 0`) → fica, sem evento;
  - a transação chama `pg_advisory_xact_lock(hashtext('cadence-enroll:' || id))` antes de reler as inscrições.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. **Step 5: Commit**, `feat(crm): lead sem resposta há 21 dias vai para Perdido (A4)`.

### Task 8: Cliente do quadro de contratantes do Freela

**Files:**
- Create: `api/src/modules/freela/freela-pipeline.ts`
- Modify: `api/src/modules/freela/freela-client.ts` (método novo)
- Test: `api/src/modules/freela/__tests__/freela-pipeline.spec.ts`

**Interfaces:**
- Produces:
  - `interface CartaoFreela { userId: string; name: string; city: string | null; state: string | null; whatsappPhone: string | null; hiringsCount: number; registeredAt: string }`
  - `achatarQuadro(data: unknown): CartaoFreela[]` (zod sobre `{ columns: [{ stage, cards: [...] }], totalContractors? }`)
  - `FreelaClient.quadroDeContratantes(): Promise<CartaoFreela[]>` (`GET /v1/admin/crm/pipeline`, sem query)

- [ ] **Step 1: Testes que falham** com `fetch` falso, no padrão dos specs do cliente que já existem:
  - envelope `{ data: { columns: [...] } }` com 2 colunas e 3 cartões → 3 `CartaoFreela`;
  - cartão sem `whatsappPhone` → `null`;
  - `data` fora do formato → `BadGatewayException` com `code 'FREELA_ERROR'` e mensagem fixa (sem ecoar o corpo).
- [ ] **Step 2:** → FAIL. **Step 3:** implementar com o `validar` que já existe. **Step 4:** → PASS. **Step 5: Commit**, `feat(freela): leitura do quadro de contratantes`.

### Task 9: Regras puras da A3

**Files:**
- Create: `api/src/domain/crm-quadro-rules.ts`
- Test: `api/src/domain/__tests__/crm-quadro-rules.spec.ts`

**Interfaces:**
- Consumes: `CartaoFreela` (Task 8), `phoneKey` de `common/phone/phone.ts`.
- Produces:
  - `telefoneNacional(raw: string | null): string | null` — 10 ou 11 dígitos depois de tirar `+55`, senão `null`.
  - `interface IndicesQuadro { porFreelaUserId: Map<string, string[]>; porCadastro: Map<string, string[]>; porChave: Map<string, { lead_id: string; phone: string; praca_id: string | null; freela_user_id: string | null }[]>; assistidos: Set<string> }`
  - `type Casamento = { lead_id: string; por: 'id' | 'cadastro' | 'telefone' } | { ambiguo: true } | null`
  - `casarCartao(c: CartaoFreela, idx: IndicesQuadro, pracasDaCidade: Set<string>): Casamento` (`pracasDaCidade` = ids das praças cuja cobertura casa com a cidade/UF do cartão)
  - `normalizarCidade(s: string): string` (sem acento, minúscula, espaços únicos)
  - `interface PracaCobertura { id: string; start_date: string; end_date: string; cidades: { cidade: string; uf: string }[] }`
  - `pracaDoCartao(c: CartaoFreela, pracas: PracaCobertura[], hoje: string): string | null`
  - `alvoDasContratacoes(x: { hirings: number; antes: number | null; hoje: string; dia_viu_primeira: string | null; assistido: boolean }): 5 | 6 | 7 | null`

- [ ] **Step 1: Testes que falham** (arquitetura achados 3, 6, 13, 19 e a D2 da §12):
  - `telefoneNacional`: `'+55 31 98765-4321'` → `'31987654321'`; `'987654321'` → `null`.
  - `casarCartao`:
    - `freela_user_id` conhecido vence o telefone;
    - `field_signups` com 2 leads → `{ ambiguo: true }`;
    - mesmo `phone_key` em `'31987654321'` e `'11987654321'`, cartão de BH sem lead em praça de BH → `{ ambiguo: true }` (ou `null` se nenhum casar o número inteiro);
    - número inteiro igual → casa por telefone;
    - lead que já tem outro `freela_user_id` → `{ ambiguo: true }`.
  - `pracaDoCartao`:
    - "Belo Horizonte"/"MG" casa "belo horizonte";
    - "Contagem" pela vizinha (resolvida com UF);
    - `registeredAt '2026-10-11T02:30:00Z'` = dia 10/10 em Brasília, antes do `start_date '2026-10-12'` → `null`;
    - duas praças → a de `start_date` mais recente;
    - praça fechada (`end_date` < hoje) → fora.
  - `alvoDasContratacoes`:
    - hirings 0 → 5 (`null` se assistido);
    - 1 → 6;
    - 2 na 1ª observação (`antes: null`) → 7;
    - de 1 para 2 com `dia_viu_primeira === hoje` → 6;
    - com `dia_viu_primeira` anterior → 7.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. **Step 5: Commit**, `feat(crm): regras puras do quadro do Freela (A3)`.

### Task 10: A3 — rodada do quadro

**Files:**
- Create: `api/src/modules/crm/quadro-freela.service.ts`
- Modify: `api/src/modules/crm/crm.module.ts` (imports `FreelaClientModule`, `GeoModule`)
- Test: `api/src/modules/crm/__tests__/quadro-freela.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 5, 8 e 9; `GeoService` para resolver `vizinhas` (o município com esse nome mais perto de `cobertura_ibge`, até 100 km).
- Produces: `QuadroFreelaService.rodar(agora: Date): Promise<ResumoQuadro>`, em que
  `ResumoQuadro = { cartoes; casados_por_id; casados_por_cadastro; casados_por_telefone; ambiguos; criados; etapas: { '5': number; '6': number; '7': number }; contratacoes: number } | { nao_configurado: true }`.

- [ ] **Step 1: Testes que falham** (Freela dublê devolvendo um fixture; arquitetura §2.5):
  - chave desligada → nenhuma chamada ao Freela;
  - chave ligada sem `isConfigured()` → rodada `{ nao_configurado: true }` gravada, nenhuma chamada;
  - cartão casado com 1 contratação → lead a 6, `freela_hirings: 1`, evento "Freela: 0 → 1 vaga paga (visto em 28/10)" com `auto_key 'a3:contratacoes:<lead>:1'`;
  - mesma rodada repetida → nenhuma escrita;
  - cadastro assistido conhecido com 0 contratações → não vai a 5;
  - cartão novo de BH depois do início da praça → lead criado com `origem 'cadastro no Freela'`, `owner_id null`, `phone` do cartão,
    `auto_key 'a3:criado:<userId>'` e `stage_to` no evento;
  - cartão ambíguo → nada gravado e `ambiguos: 1`;
  - o Freela lança `FreelaHttpError(500)` → rodada `ok: false` com erro saneado, sem lançar;
  - o telefone do cartão nunca aparece no `summary` nem no erro.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. Leituras em lote com `IN` em pedaços de 500; uma transação por lead; criação com
  `pg_advisory_xact_lock(hashtext('crm-freela-user:' || userId))`, reconferindo dentro da trava. **Step 4:** → PASS. **Step 5: Commit**, `feat(crm): etapas e leads pelo quadro do Freela (A3)`.

### Task 11: `CrmScheduler`

**Files:**
- Create: `api/src/modules/crm/crm.scheduler.ts`
- Test: `api/src/modules/crm/__tests__/crm.scheduler.spec.ts`

**Interfaces:**
- Consumes: `passadaCadastros` (Task 5), `SemRespostaService.rodar` (Task 7), `QuadroFreelaService.rodar` (Task 10), `rodadaOkNoDia`/`limparRodadasAntigas` (Task 5).
- Produces: `CrmScheduler.bater(agora?: Date): Promise<void>` com `@Cron('*/5 * * * *', { timeZone: 'America/Sao_Paulo' })`, que nunca lança.

- [ ] **Step 1: Testes que falham** (com `agora` injetado; horários de Brasília):
  - A2 de hora em hora entre 06h e 23h (`passadaCadastros` em 06:00 e 07:00, não em 06:05 nem em 05:55);
  - A3 nas horas pares de 08 a 20, uma vez por hora-alvo (10:00 roda, 10:05 não, 11:00 não, 21:00 não);
  - A4 uma vez por dia a partir de 06:10: em 06:10 roda; em 06:15, com a rodada ok do dia, não; reinício às 07:00 sem rodada ok → roda;
  - às 23:55 de 27/10 (02:55Z de 28/10) o "dia" é 27/10;
  - `rodar` que lança → `bater` resolve, o erro fica no log;
  - um trabalho ainda `rodando` não começa de novo;
  - com todas as chaves desligadas, nenhuma consulta.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar no padrão de `campo/signup-sync.scheduler.ts` ("bate e decide"). **Step 4:** → PASS. **Step 5: Commit**, `feat(crm): relógio único do CRM`.

### Task 12: A1 — achados da busca viram lead

**Files:**
- Modify: `api/src/modules/imports/imports.service.ts` (`criarLeadsDeBusca` ganha `opcoes`), `api/src/modules/places/places-search.service.ts`
  (`concluir` devolve `boolean`; gancho `adicionarSozinho`)
- Test: `api/src/modules/imports/__tests__/criar-leads-de-busca-caracterizacao.spec.ts` (novo), `api/src/modules/places/__tests__/places-auto-leads.spec.ts` (novo)

**Interfaces:**
- Produces:
  - `criarLeadsDeBusca(tx, input, user, opcoes?: { sem_dono?: true; autor_label?: string })`
  - `PlacesSearchService.adicionarSozinho(runId: string): Promise<void>` (só importa `common/` e `domain/`; nunca `crm/`).

- [ ] **Step 1: Testes que falham:**
  - caracterização: sem `opcoes`, os `data` passados a `leads.create`/`lead_events.create`/`import_batches.create` são iguais aos de hoje
    (rodízio de donos e `author_id` do usuário) → congelar com snapshot **antes** de mexer;
  - com `{ sem_dono: true, autor_label: 'Automático' }` → `owner_id: null`, `poolDeDonos` não chamado, evento com `author_id: null` e
    `author_label 'Automático'`;
  - `places-auto-leads`:
    - chave ligada e busca `lugares` concluída → candidatos `novo` viram leads, rótulo do lote "Busca automática dd/mm · área (OSM)";
    - `kind 'shoppings'` → nada;
    - chave desligada → nada;
    - `NOTHING_TO_ADD` → rodada ok com 0;
    - conflito → rodada com `error 'CONFLITO'` e a busca continua `done`;
    - mais de 300 → só os 300 de menor `distance_m`, `acima_do_teto` na rodada;
    - a rodada é gravada em `crm_automation_runs` com `job 'auto_leads_busca'` e `ref = run.id`.
- [ ] **Step 2:** → FAIL (os novos; a caracterização passa antes da mudança: rodar e commitar o snapshot primeiro).
- [ ] **Step 3:** implementar (arquitetura §2.3).
- [ ] **Step 4:** → PASS. `places/__tests__/places-search.service.spec.ts` → PASS **sem edição**.
- [ ] **Step 5: Commit**, `feat(crm): achados da busca entram sozinhos no funil (A1)`.

### Task 13: Regras puras das tarefas

**Files:**
- Create: `api/src/domain/crm-tarefas-rules.ts`
- Test: `api/src/domain/__tests__/crm-tarefas-rules.spec.ts`

**Interfaces:**
- Produces:
  - `type TipoTarefa = 'send' | 'cadence_send' | 'hot_visit' | 'next_step' | 'stalled' | 'first_vacancy'` (ordem = prioridade);
  - `interface EntradaTarefas { leads: LeadTarefa[]; envios: EnvioFila[]; envios_cadencia: EnvioFila[]; visitas: VisitaQuente[]; cadastros: { lead_id: string; first_vacancy_at: Date | null }[]; contatos_recentes: Map<string, string> }`
    (a forma de cada tipo é decidida aqui, com os campos do item do §47);
  - `montarTarefas(e: EntradaTarefas, hoje: string, eu: string, person: 'all' | 'me'): { counts: { me: number; all: number }; groups: { task: TipoTarefa; total: number; items: ItemTarefa[] }[] }`.

- [ ] **Step 1: Testes que falham** (desenho §3 A5 + §12.1 item 13 + arquitetura achados 1, 9, 22):
  - `send` só de disparo, um por lead (o mais antigo);
  - `cadence_send` com `readonly: true`;
  - visita quente só com interesse `alto|medio` e `checkout_at` entre 1 e 14 dias atrás, sem contato da equipe depois;
  - próximo passo vencido (`next_step_date <= hoje`, etapa ≠ 8) com `from_cadence`;
  - conversa parada (etapas 3 e 4, 5+ dias);
  - ajudar a publicar (etapa 5 há 3+ dias, sem 1ª vaga, sem `freela_hirings >= 1`, sem contato há 3 dias);
  - lead em duas regras aparece só na de maior prioridade;
  - `snooze_until` > hoje fica fora;
  - `person 'me'` = meus + sem dono;
  - `counts` contam todos os grupos, mesmo acima de `ITENS_POR_GRUPO` (50);
  - arquivado e teste ficam fora.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. **Step 5: Commit**, `feat(crm): regras puras das tarefas do dia`.

### Task 14: Rotas das tarefas

**Files:**
- Create: `api/src/modules/crm/crm.guard.ts`, `api/src/modules/crm/crm.controller.ts`, `api/src/modules/crm/tarefas.service.ts`, `api/src/modules/crm/dto/crm.dto.ts`
- Test: `api/src/modules/crm/__tests__/tarefas.service.spec.ts`, `api/src/modules/crm/__tests__/crm.controller.spec.ts`

**Interfaces:**
- Consumes: `montarTarefas` (Task 13), `FreelaClient.isConfigured()`.
- Produces: `GET /v1/crm/tasks`, `POST /v1/crm/tasks/done` (corpo e resposta do §47). Guard de classe `CrmLigadoGuard` → 404 `CRM_TASKS_DISABLED`
  (o padrão de `campo/painel/lovable.guards.ts`). `@Equipe()` em cada método.

- [ ] **Step 1: Testes que falham:**
  - chave desligada → 404 `CRM_TASKS_DISABLED`;
  - `praca_id` malformado → 404 `NOT_FOUND`;
  - `person=me` usa o `sub` do token;
  - `done`:
    - grava evento (`author_id` = usuário) e `last_contact_at` numa transação;
    - com `task 'next_step'` e sem `next_step` → limpa `next_step_*`;
    - com `next_step` → grava o novo;
    - lead sem dono → `owner_id` = usuário;
    - lead arquivado → 409 `LEAD_ARCHIVED`;
    - `kind 'note'` → 400.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar; controller no `CrmModule`. **Step 4:** → PASS. Rodar `common/__tests__/permissoes-protecao.spec.ts` e
  `permissoes-gestor-matriz.spec.ts` → PASS. **Step 5: Commit**, `feat(crm): rotas das tarefas do dia`.

### Task 15: Resumo do dia

**Files:**
- Create: `api/src/domain/crm-resumo-rules.ts`, `api/src/modules/crm/resumo.service.ts`
- Modify: `api/src/modules/crm/crm.controller.ts` (`GET summary`), `dto/crm.dto.ts`
- Test: `api/src/domain/__tests__/crm-resumo-rules.spec.ts`, `api/src/modules/crm/__tests__/resumo.service.spec.ts`

**Interfaces:**
- Produces:
  - `type Autoria = 'equipe' | 'representante' | 'formulario' | 'cadencia' | 'automatico' | 'outro'`
  - `autoriaDoEvento(author_id: string | null, author_label: string | null): Autoria` (arquitetura achado 12)
  - `montarResumo(e: EntradaResumo, day: string): { numbers: { key: string; value: number | null; parts: { label: string; value: number }[]; formula: string; source: string }[] }`
  - `GET /v1/crm/summary?praca_id?&day?` → `{ day, praca_id: string | null, freela_configured, freela_read_at, numbers }`

- [ ] **Step 1: Testes que falham:**
  - `autoriaDoEvento`: `'Consultor: Ana'` = representante; `'Freela (sincronização)'` e `'Automático · Freela'` = automatico; `author_id` presente = equipe.
  - Mudança de etapa = evento com `stage_to` não nulo, de qualquer `kind`.
  - Evento às 23:30 de 27/10 em Brasília (02:30Z de 28/10) conta em 27/10.
  - Sem o Freela configurado, os números do Freela vêm `value: null` (a tela escreve "—").
  - `formula` de "leads novos" = `"12 = 8 da busca + 3 de visitas + 1 do formulário"`.
  - `praca_id` ausente = todas as praças.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. **Step 5: Commit**, `feat(crm): resumo do dia com a conta de cada número`.

### Task 16: Automações, selos e `features`

**Files:**
- Create: `api/src/modules/crm/automacoes.service.ts`
- Modify: `api/src/modules/crm/crm.controller.ts` (`GET automations`, `GET badges`), `api/src/modules/rotas/rotas-equipe.controller.ts` (`features.crm_tasks`, `features.crm_auto_leads`; `CRM_FLAGS` como último parâmetro)
- Test: `api/src/modules/crm/__tests__/automacoes.service.spec.ts`, `api/src/modules/rotas/__tests__/crm-features-contrato.spec.ts`

**Interfaces:**
- Produces:
  - `GET /v1/crm/automations` → `{ freela_configured, send_mode, jobs: [{ key: JobCrm, enabled, needs_freela, blocked_by: 'freela' | 'signup_sync' | null, last_run: { at, ok, summary, error? } | null, last_7d: Record<string, number> }], cadences: [{ id, name, entry, paused, active_enrollments }], warnings: string[] }`.
    `error` só para admin. `last_7d` = soma dos `summary` das rodadas de 7 dias.
  - `GET /v1/crm/badges?praca_id` → `{ items: [{ lead_id, last_stage_auto: boolean, freela_hirings: number | null }] }`, só leads com algo a
    mostrar; `last_stage_auto` = autoria `automatico` do último evento com `stage_to` (um `$queryRaw` com `DISTINCT ON`).

- [ ] **Step 1: Testes que falham:**
  - `warnings` traz o aviso quando `auto_leads` está ligada e existe cadência `stage_novo` não pausada;
  - `blocked_by 'freela'` para `quadro_freela` sem conta;
  - `blocked_by 'signup_sync'` para `etapas_cadastro` com `FIELD_SIGNUP_SYNC_ENABLED` desligada;
  - equipe não recebe `error`, admin recebe;
  - nunca o e-mail da conta do Freela;
  - `features` com as chaves desligadas = `crm_tasks: false, crm_auto_leads: false`, e o resto do `features` igual ao de hoje.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Rodar `rotas/__tests__/` do settings config → PASS. **Step 5: Commit**, `feat(crm): página de automações, selos do funil e features`.

### Task 17: `scripts/smoke-crm.sh` e verificação da API

**Files:**
- Create: `api/scripts/smoke-crm.sh` (cabeçalho com o modo de subir; padrão de `scripts/smoke-lovable-e.sh`)

- [ ] **Step 1: Escrever o smoke.** Contra a API viva, com as 5 chaves ligadas, o Freela vazio e `OVERPASS_URL=http://127.0.0.1:9/api/interpreter`.
  Cria os próprios leads e limpa tudo no fim (psql do contêiner). Checa:
  - as rotas `/v1/crm/*` respondem 200 e o formato do §47;
  - `done` grava um evento e a tarefa some;
  - `person=me`;
  - o resumo conta o lead criado;
  - automações mostra `blocked_by 'freela'`;
  - `features.crm_tasks: true`;
  - a guarda do `auto_key` no banco de verdade (um INSERT duplicado pelo psql falha com `23505`). A4, A2 e A3 não têm rota para disparar:
    eles se provam no jest (Tasks 5, 7, 10, 11).
- [ ] **Step 2:** `free -m`; subir a API com as cinco chaves (`CRM_TASKS_ENABLED=true … npm run start:smoke > <scratchpad>/praca-api.log 2>&1 &`), esperar
  `curl -s localhost:3014/health`, rodar `bash scripts/smoke-crm.sh` → todas ✓. Matar a API pelo PID, subir SEM as chaves (o `smoke.sh` é das chaves
  desligadas), rodar `npm run smoke` → o total do CLAUDE.md (923), e matar de novo. Conferir `ss -ltn | grep -E ':(3014|3024) '` vazio.
- [ ] **Step 3:** `nice -n 19 npm run typecheck` sozinho → 0 erros.
- [ ] **Step 4: Commit**, `test(crm): smoke do CRM automático`.

### Task 18: Web — chaves, endereços, menu e cliente da API

**Files:**
- Modify: `web/src/modules/acesso/domain/acesso.ts` (`featuresMenuSchema` + `crm_tasks`/`crm_auto_leads`; `montarMenu`: "Tarefas" no começo e
  "Automações" no fim do Comercial com `crm_tasks`; "Ações" → "Ações da praça"; ícones `tarefas`/`automacoes` em `ChaveIcone`), `web/src/modules/acesso/domain/enderecos.ts`
  (`ROTA.tarefas = '/tarefas'`, `ROTA.automacoes = '/automacoes'`), o mapa de ícones do `AppShell` (`ListTodo`, `Zap`)
- Create: `web/src/modules/crm/infrastructure/crm.api.ts` (zod de cada resposta do §47), `web/src/modules/crm/application/use-crm.ts` (hooks TanStack)
- Test: `web/src/modules/acesso/__tests__/` (o teste do menu que já existe ganha os casos), `web/src/modules/crm/__tests__/crm.api.test.ts`

**Interfaces:**
- Produces:
  - `useTarefas(pracaId, person)`, `useFeito()`, `useResumoCrm(pracaId | null, day)`, `useAutomacoes()`, `useSelosFunil(pracaId)`, `useAdiarLead()` (reusa `POST /v1/leads/:id/snooze`);
  - tipos `TarefasView`, `ResumoCrmView`, `AutomacoesView`, `SelosView`.

- [ ] **Step 1: Testes que falham:**
  - `montarMenu` com `commercial` + `crm_tasks` → grupo `['Tarefas','Funil','Entrada','Buscar estabelecimentos','Mensagens','Campanhas','Calendário','Indicadores','Ações da praça','Freela','Automações']`;
  - sem `crm_tasks` → o grupo de hoje, com "Ações da praça";
  - schema sem as chaves → `false`;
  - zod de `tasks`/`summary`/`automations` aceita o exemplo do §47 e recusa `groups` sem `task`.
- [ ] **Step 2:** `nice -n 19 yarn vitest run <arquivos>` → FAIL. **Step 3:** implementar. **Step 4:** → PASS. **Step 5: Commit**, `feat(web): menu do Comercial com Tarefas e Automações + cliente do CRM`.

### Task 19: Web — cabeçalho comum, painel do lead no `Sheet`, aba de Mensagens

**Files:**
- Create: `web/src/components/praca/CabecalhoPagina.tsx` (UX §3.7)
- Modify: `web/src/components/praca/LeadPanel.tsx` (casca `Sheet`, UX achado 8; texto da etapa em `text-foreground` com bolinha de cor, achado 9),
  `web/src/app/(app)/mensagens/page.tsx` (lê `?aba=cadencias|disparos`), o topo de `mensagens`, `campanhas`, `calendario`, `indicadores`, `hoje`,
  `freela` e `prospeccao` (só o cabeçalho e o cartão de fora; nada de lógica)
- Test: `web/src/components/praca/__tests__/cabecalho-pagina.test.tsx` (se o projeto testar componentes; senão, a regra pura de aba em `modules/`)

- [ ] **Step 1: Teste que falha:**
  - `abaDeMensagens('?aba=cadencias')` → `'cadencias'`;
  - valor desconhecido → `'modelos'`;
  - `CabecalhoPagina` renderiza o h1 com `text-3xl font-semibold` e o subtítulo.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar com os textos da UX §3.7. Na `/hoje`, com `features.crm_tasks`, a seção `FunilHoje` vira a
  linha-link para Tarefas (UX achado 7). **Step 4:** → PASS. **Step 5: Commit**, `feat(web): cabeçalho comum do Comercial e painel do lead acessível`.

### Task 20: Web — tela Tarefas

**Files:**
- Create: `web/src/app/(app)/tarefas/page.tsx`, `web/src/components/crm/LinhaTarefa.tsx`, `web/src/components/crm/ResumoDoDia.tsx`,
  `web/src/modules/crm/domain/tarefas.ts` (textos de motivo puros, montagem do link `wa.me`, conta do "Desfazer")
- Test: `web/src/modules/crm/__tests__/tarefas.test.ts`

**Interfaces:**
- Consumes: hooks da Task 18; `openLead` de `lib/ui-store.ts`.

- [ ] **Step 1: Testes que falham** (UX §3.1.4–§3.1.6):
  - motivo de cada grupo com os textos exatos da UX;
  - `linkWhatsApp('31987654321', 'Oi')` → `https://wa.me/5531987654321?text=Oi` (codificado);
  - "Desfazer" em 5 s: a função pura de fila adiada só chama o envio depois de 5000 ms e cancela antes;
  - sem o Freela, o número do Freela vira `'—'`.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar a tela como a UX §3.1:
  - tarefas antes do resumo; o resumo à direita no `lg`, no fim no celular;
  - "Hoje | Ontem";
  - "Minhas | Todas";
  - "Feito" com 1 toque na T1 e menu "O que você fez?" nas outras;
  - "Adiar" 1/3/7 dias;
  - "Abrir WhatsApp" sem gravar;
  - estados vazio/carregando/erro/desligado.
- [ ] **Step 4:** → PASS. **Step 5: Commit**, `feat(web): tela Tarefas com o resumo do dia`.

### Task 21: Web — Automações e cartão do Dashboard

**Files:**
- Create: `web/src/app/(app)/automacoes/page.tsx`, `web/src/components/crm/CartaoComercialHoje.tsx`, `web/src/modules/crm/domain/automacoes.ts` (texto da situação de cada automação)
- Modify: `web/src/app/(app)/inicio/page.tsx` (cartão abaixo de "Atenção agora", só com `commercial` e `crm_tasks`)
- Test: `web/src/modules/crm/__tests__/automacoes.test.ts`

- [ ] **Step 1: Testes que falham** (UX §3.2.2 e §3.3):
  - situação em texto para `enabled` × `blocked_by` × `last_run.ok` (os textos exatos da UX);
  - "Como ligar" e "Detalhe técnico" só para o admin;
  - última rodada como "hoje 14h02".
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. É só leitura: nenhum `Switch`. O link da cadência vai para `/mensagens?aba=cadencias`. **Step 4:** → PASS. **Step 5: Commit**, `feat(web): página Automações e cartão Comercial hoje no Dashboard`.

### Task 22: Web — Funil no visual novo

**Files:**
- Modify: `web/src/app/(app)/funil/page.tsx`
- Create: `web/src/modules/leads/domain/funil.ts` (texto das métricas com a conta, nomes acessíveis dos selos, "12 dias parado")
- Test: `web/src/modules/leads/__tests__/funil.test.ts`

- [ ] **Step 1: Testes que falham** (UX §3.4, achados 6, 9, 13, 22, 26):
  - `"Contatado → cadastrado"` mostra `"2 de 4 = 50%"` a partir de `conv_contact_n/de`;
  - selo `"Freela: 2 contratações pagas"`; `"Automático"` só com `last_stage_auto`;
  - `"12 dias parado"`;
  - a cor da etapa nunca entra em `color` de texto (a função devolve só a cor da bolinha).
- [ ] **Step 2:** → FAIL. **Step 3:** implementar:
  - colunas em cartões; acordeão por etapa abaixo de `md`;
  - região rolável com `role="region"`, `tabIndex={0}`;
  - dica de "Mover para etapa"; o arrastar continua;
  - estado de erro com "Tentar de novo";
  - selos pelo `useSelosFunil` (só com `crm_tasks`).
- [ ] **Step 4:** → PASS. **Step 5: Commit**, `feat(web): funil no visual novo, com selos do automático`.

### Task 23: Web — Entrada e busca

**Files:**
- Modify: `web/src/app/(app)/entrada/page.tsx` (UX §3.6: visual novo; o link do WhatsApp deixa de gravar, decisão U1; `AlertDialog` no "Desfazer
  importação"; "Primeiro contato de hoje"; limite num `<details>`), `web/src/components/praca/BuscaEstabelecimentos.tsx` (aviso da A1 com
  `features.crm_auto_leads`, UX §3.5)
- Test: `web/src/modules/leads/__tests__/entrada.test.ts` (regras puras que a tela usar; no mínimo: o clique no link não chama a gravação)

- [ ] **Step 1:** teste que falha da regra pura usada (por exemplo `acaoDoLinkWhatsApp()` devolve `'abrir'`, nunca `'gravar'`). **Step 2:** → FAIL. **Step 3:**
  implementar. **Step 4:** → PASS. **Step 5: Commit**, `feat(web): Entrada no visual novo e aviso da busca automática`.

### Task 24: Verificação final e `browser-check`

**Files:**
- Modify: `web/scripts/browser-check.mjs`. Atualizar onde o texto mudou ("Ações" → "Ações da praça", Funil, Entrada, `/hoje`); **nenhuma checagem
  sai**. Novas checagens com `TEAM_COMMERCIAL_ENABLED` + `CRM_TASKS_ENABLED`:
  - menu com Tarefas e Automações;
  - `/tarefas` abre, mostra um grupo e o resumo; "Feito" de um lead criado pelo script some da lista depois de 5 s;
  - `/automacoes` mostra "Precisa da conexão com o Freela";
  - cartão "Comercial hoje" no Dashboard;
  - o Funil carrega sem erro com `GET /v1/crm/badges` (o selo em si não tem como ser disparado pela tela; ele se prova no vitest da Task 22).
  O teardown apaga o que criou.
- Modify: `CLAUDE.md` (contagens novas: jest, vitest, smoke-crm, browser-check), `docs/superpowers/plans/2026-10-28-crm-automatizado.md` (marcar as caixas)

- [ ] **Step 1:** `cd web && nice -n 19 yarn lint` → 0 erros; depois `nice -n 19 yarn typecheck` → 0 erros (`node_modules/.bin/next typegen` antes,
  por causa das páginas novas).
- [ ] **Step 2:** `nice -n 19 yarn test` → tudo verde.
- [ ] **Step 3:** `cd api && nice -n 19 npm test` sozinho → tudo verde (anotar suítes/testes).
- [ ] **Step 4:** browser-check:
  - subir a API com `TEAM_COMMERCIAL_ENABLED=true CRM_TASKS_ENABLED=true CRM_AUTO_STAGES_ENABLED=true CRM_AUTO_LOST_ENABLED=true CRM_AUTO_LEADS_FROM_SEARCH_ENABLED=true`, as
    flags de produção (ROUTES, VISIT_FLOW_SELECT, EARNINGS, DECLARED_SIGNUPS, PAYOUTS) e `OVERPASS_URL` morto, via `npm run start:smoke`;
  - subir o web com `yarn dev` (3024);
  - `yarn browser-check` → tudo ✓;
  - matar os dois pelo PID; `ss -ltn | grep -E ':(3014|3024) '` vazio.
- [ ] **Step 5:** browser-check de novo com a configuração de produção de hoje (sem o Comercial) → o mesmo total de antes (226), para provar que
  nada mudou com as chaves desligadas.
- [ ] **Step 6:** parar o Postgres local (`docker compose stop postgres` na raiz do `praca/`). **Commit** final, `test(crm): browser-check do CRM automático e contagens`.
