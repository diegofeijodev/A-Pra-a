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
- Id que vem da URL passa por `isUuid()` antes do Prisma: sem isso, id
  malformado vira 500 em vez de 404.
- Guarda de sessão do web vive em `app/(app)/layout.tsx`, não no `AppShell`:
  a página não pode montar (e disparar `useQuery`) sem sessão.
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
3. Para smoke test, use `npm run start:smoke` (`ts-node --transpile-only`,
   sem `--watch`) em vez de `start:dev` — sobe uma vez, sem o watcher do
   Nest recompilando em segundo plano. Suba em background, espere
   `curl -s localhost:3014/health` responder, rode `npm run smoke`, e
   **mate o processo** em seguida (confira com
   `ss -ltn | grep 3014` que a porta ficou livre) antes de rodar qualquer
   outra coisa.
4. `npm run typecheck` (`tsc --noEmit`) roda **uma vez, sozinho**, no fim da
   tarefa. Nunca dois de {jest, tsc, API} ao mesmo tempo.

## Comandos

```bash
# api/
npm run start:dev | build | typecheck | lint | test | seed
npm run start:smoke                # sobe sem watcher (ts-node --transpile-only), pra smoke
npm run smoke                      # scripts/smoke.sh contra a API viva — 747 checks, repetível sem resíduo
npm run prisma:migrate:dev | prisma:generate | prisma:studio

# web/
yarn dev | build | typecheck | lint
node scripts/browser-check.mjs     # precisa da API na 3014 e do web na 3024
```

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
