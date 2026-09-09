# PRAÇA

Checklist de execução para abrir uma praça (cidade) da Freela Serviços: o
manual de 11 etapas vira ações com dono, prazo e recorrência; um CRM de
contratantes (bares, restaurantes, hotéis, buffets) com funil de 8 etapas;
entrada de leads (planilha/XML, formulário público, cadastro manual); mensagens
(modelos A/B, disparos em lote, cadências que rodam sozinhas); campanhas de
mídia paga (briefing, criativos, tráfego Meta/Google, calendário); calendário
das ações; indicadores (empresa / praça / pessoa / canal); configurações
(pessoas, praça, roteiro-modelo).

Port do protótipo Lovable (TanStack Start + estado em `localStorage`) para a
stack do Freela: **NestJS 11 + Fastify + Prisma + PostgreSQL** na API e
**Next.js 15 + React 19 + Tailwind 4 + shadcn** no web. Mesmo molde de
[`meu-par`](../meu-par), [`gestao-de-time`](../gestao-de-time),
[`plano-estrategico`](../plano-estrategico) e [`pedidos-online`](../pedidos-online).

Novo em relação ao protótipo: integração com o sistema de campanhas do Freela
(`api-freela`) — campanhas normais e automáticas.

## Como subir

```bash
# 1. banco (na raiz do projeto)
docker compose up -d postgres          # Postgres em 5437

# 2. API
cd api
npm install
cp .env.example .env                   # ajuste JWT_SECRET (16+ caracteres)
npm run prisma:migrate:deploy
npm run seed                           # pessoas + catálogo de demonstração
npm run start:dev                      # http://localhost:3014 · Swagger em /docs

# 3. web
cd ../web
yarn install
echo 'NEXT_PUBLIC_API_URL=http://localhost:3014' > .env.local
yarn dev                               # http://localhost:3024
```

**Portas:** API `3014`, web `3024`, Postgres `5437`. (3000/5432 são do Freela;
3010/3020/5433 do gestao-de-time; 3011/3021/5434 do plano-estrategico;
3012/3022/5435 do pedidos-online; 3013/3023/5436 do meu-par.)

**Demonstração:** `diego@praca.local` (admin), `daniel@praca.local`,
`mkt@praca.local` — senha `praca123`.

## Telas

| Rota | O que faz |
|---|---|
| _(preencher ao longo do plano)_ | |

## Documentos

- **`docs/api-contract.md`** — contrato canônico da API (preenchido tarefa a
  tarefa).
- **`docs/superpowers/specs/2026-09-09-praca-port-design.md`** — spec de
  design do port.
- **`docs/superpowers/plans/2026-09-09-praca-port.md`** — plano de
  implementação.
- **`CLAUDE.md`** — regras rápidas para trabalhar neste repo.
