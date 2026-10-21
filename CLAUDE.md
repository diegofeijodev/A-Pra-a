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
  `TRUST_PROXY`.
- Id que vem da URL passa por `isUuid()` antes do Prisma: sem isso, id
  malformado vira 500 em vez de 404.
- Guarda de sessão do web vive em `app/(app)/layout.tsx`, não no `AppShell`:
  a página não pode montar (e disparar `useQuery`) sem sessão.
- **Consultor de campo ≠ equipe.** Token com `aud: "campo"`; rotas `/v1/campo/*`
  marcadas com `@CampoRoute()` (o `JwtAuthGuard` global delega ao
  `CampoAuthGuard`). Rota nova do consultor SEM `@CampoRoute()` fica fechada
  para ele (e aberta só para a equipe) — é o comportamento seguro por padrão.
  No web, a sessão do consultor é `campoSession` (separada de `authUser`).
- **Índices únicos parciais (`field_journeys`, `field_visits`, `field_routes`,
  `field_route_stops`, `field_payouts`) não existem para o Prisma** (`field_journeys_one_open_per_consultant`,
  `field_visits_one_open_per_consultant`, `field_routes_one_active_per_day`,
  `field_route_stops_lead_day_unique`, `field_payouts_one_active_per_week`). Toda `prisma migrate dev` futura vai propor `DROP INDEX` deles:
  gere com `--create-only`, **apague essas linhas do SQL** e aplique com
  `migrate deploy`. (Aviso espelhado em comentário na migração
  `20261008221516_consultores_de_campo`.)
- **Modo do chefe (contrato §31):** a flag `FIELD_VISIT_FLOW_SELECT_ENABLED` (padrão `false`) liga a escolha do fluxo da visita (`simples` | `completo`). Desligada, toda visita é `completo` e nada muda. O fluxo é gravado em `field_visits.flow` na abertura e o checkout o obedece; no web, `/campo` roteia pelas telas de `components/campo/simples/` só com a flag ligada e o fluxo resolvido `simples`. Os testes `*caracterizacao*` congelam o fluxo completo: não editar para "fazer passar". `scripts/smoke-modo-chefe.sh` roda com a flag LIGADA (não junto do `smoke.sh`).
- **Modo do chefe S2/S3 (contrato §32):** regra de pagamento ganhou 8 chaves OPCIONAIS (`normalizarRegra` preenche com o comportamento da v1; `REGRA_PADRAO` não muda e a config gravada fica crua) e a flag `FIELD_DECLARED_SIGNUPS_ENABLED` (padrão `false`, exige `FIELD_EARNINGS_ENABLED`) liga o ganho por cadastro declarado: declaração e anulação são fatos imutáveis (`field_declared_signups`/`_voids`, trigger como o razão). `*caracterizacao*` e `earnings-rules-chefe.spec.ts` congelam a v1: não editar para "fazer passar". Não mexa em `payouts.service.ts` ~238 (semana ≤ 0 não gera Pix e o negativo não é carregado) sem a S4. `scripts/smoke-modo-chefe-s3.sh` roda com as flags LIGADAS.
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
npm run smoke                      # scripts/smoke.sh contra a API viva — 882 checagens, repetível sem resíduo
                                   # (menos sem o container `praca-postgres`: a limpeza final é por psql)
npm test                           # jest maxWorkers 1 — 87 suítes, 1466 testes
npm run prisma:migrate:dev | prisma:generate | prisma:studio

# web/
yarn dev | typecheck | lint        # `build` só se o dono pedir (ver abaixo)
yarn test                          # vitest run (fork único) — 22 arquivos, 281 testes
yarn browser-check                 # scripts/browser-check.mjs — 155 checagens (154 sem as flags do ganho declarado)
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
(`requestfailed`) ou resposta HTTP ≥ 400 — a única exceção é o 404 do
`hot-update.json` do `next dev` (lista fechada `IGNORADAS`, com motivo no
script). Sem o Freela configurado a tela do Freela só chama
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
