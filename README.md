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
(`api-freela`) — campanhas normais e automáticas (§ Integração com o Freela).

**Status:** port **concluído**. API com 17 módulos (contrato em
`docs/api-contract.md`) e web com as **9 telas** do protótipo mais três coisas
que ele não tinha — `/freela`, `/entrar` e o formulário público. Verificação de
ponta a ponta: 457 testes de unidade, 771 checagens de smoke contra a API viva e
97 checagens de navegador (§ Verificação).

## Como subir

```bash
# 1. banco (na raiz do projeto)
docker compose up -d postgres          # Postgres em 5437 (container praca-postgres)

# 2. API
cd api
npm install
cp .env.example .env                   # ajuste JWT_SECRET (16+ caracteres)
npm run prisma:migrate:deploy
npm run seed                           # pessoas + catálogo de demonstração
npm run start:dev                      # http://localhost:3014 · Swagger em /docs
```

```bash
# 3. web (usa yarn — nunca npm neste diretório)
cd web
yarn install
echo 'NEXT_PUBLIC_API_URL=http://localhost:3014' > .env.local
yarn dev                               # http://localhost:3024
```

Com os dois de pé, `http://localhost:3024/entrar` pede e-mail e senha (a conta
semeada abaixo). O atalho `?demo=1`, que nasce com o formulário preenchido, só
existe com as três linhas de `web/.env.example` no `.env.local`
(`NEXT_PUBLIC_DEMO_LOGIN=1` + e-mail + senha): a senha de um **admin** não fica
no pacote do navegador de graça.

**Portas**

| Projeto | API | Web | Postgres |
|---|---|---|---|
| **PRAÇA** | **3014** | **3024** | **5437** |
| Freela (api-freela / freela-web-v2) | 3000 | — | 5432 |
| gestao-de-time | 3010 | 3020 | 5433 |
| plano-estrategico | 3011 | 3021 | 5434 |
| pedidos-online | 3012 | 3022 | 5435 |
| meu-par | 3013 | 3023 | 5436 |

**Logins de demonstração** (seed em desenvolvimento): senha `praca123` para os
três.

| E-mail | Papel |
|---|---|
| `diego@praca.local` | admin — CEO, visitas às casas grandes |
| `daniel@praca.local` | operação |
| `mkt@praca.local` | marketing externo |

Em `NODE_ENV=production` o seed **não** usa essa senha e **não** cria as duas
contas de demonstração — ver § Produção.

## Telas

Todas as telas do app exigem sessão (a guarda vive em
`web/src/app/(app)/layout.tsx`); `/entrar` e `/formulario/[pracaId]` são
públicas. Os textos são os do protótipo Lovable, portados 1:1.

| Rota | Tela | O que faz |
|---|---|---|
| `/` | — | redireciona para `/hoje` |
| `/entrar` | Entrada | login por e-mail e senha; `?demo=1` preenche a conta de demonstração **só** com `NEXT_PUBLIC_DEMO_LOGIN=1` |
| `/hoje` | Ações | agenda do dia: atrasadas, para hoje, próximos 7 dias, carga por pessoa e os leads do funil que precisam de toque hoje. Concluir/desfazer direto na linha |
| `/praca` | Praça | as 11 etapas do roteiro de abertura com portão por resultado, cobertura geográfica e progresso por etapa |
| `/funil` | Funil | quadro de 8 etapas com os contratantes: métricas do topo, filtros, cartão arrastável, ficha lateral (linha do tempo, próximo passo, mudança de etapa) |
| `/entrada` | Entrada de leads | importar planilha/XML com mapeamento de campos e regra de duplicidade, endereço do formulário público, fila "para tocar hoje" e desfazer importação |
| `/mensagens` | Mensagens | modelos com variação A/B e prévia real, disparos em lote (público, prévia, agendamento, fila manual) e cadências que rodam sozinhas |
| `/campanhas` | Campanhas | mídia paga: briefing com portão, quadro de criativos, tráfego dia a dia e calendário de publicação |
| `/calendario` | Calendário | mês/semana das ações, com marcos das etapas e remanejamento por arrastar |
| `/indicadores` | Indicadores | os 12 indicadores nas visões empresa / praça / pessoa / canal, metas por horizonte e lançamento à mão |
| `/configuracoes` | Configurações | pessoas e acessos, dados da praça, variáveis padrão das mensagens e roteiro-modelo das próximas praças |
| `/freela` | Freela | campanhas de WhatsApp no Freela (normais e automáticas) e o estado da conexão |
| `/formulario/[pracaId]` | Formulário público | captura sem login por praça (`?origem=` e `?camp=`), com limite por IP |

## API — rotas por área

Contrato completo, com corpo/resposta de cada rota, em
[`docs/api-contract.md`](docs/api-contract.md) (índice no topo do arquivo).

| Área | Base | O que cobre |
|---|---|---|
| Auth / Pessoas | `/v1/auth`, `/v1/users` | login, CRUD de pessoas, senha, tema, praça ativa |
| Praças | `/v1/pracas` | CRUD, cobertura geográfica, 11 etapas, portões, agenda |
| Geo | `/v1/geo` | estados/municípios do IBGE, vizinhas por raio (pública) |
| Ações | `/v1/actions` | instâncias por praça: concluir, adiar, reatribuir, subitens |
| Roteiro-modelo | `/v1/template-actions` | as 84 ações-modelo (só admin escreve) |
| Funil de leads | `/v1/leads` | CRUD, mover de etapa, eventos, fila do dia, métricas |
| Entrada de leads | `/v1/imports` | avaliar/rodar importação, mapeamentos salvos, desfazer |
| Formulário público | `/v1/public` | captura sem login, throttle por IP |
| Mensagens | `/v1/msg-templates`, `/v1/settings`, `/v1/blocklist` | modelos A/B, configurações de envio, bloqueio |
| Disparos | `/v1/disparos`, `/v1/sends` | disparo em lote, fila de envio manual, opt-out |
| Cadências | `/v1/cadences`, `/v1/enrollments` | sequência automática, inscrições, teste comprimido |
| Mídia | `/v1/campanhas`, `/v1/creatives`, `/v1/traffic`, `/v1/proofs` | briefing, criativos, tráfego pago, provas sociais |
| Indicadores | `/v1/indicators` | 12 leituras, visões empresa/praça/pessoa/canal |
| Notificações | `/v1/notifications` | sino, dispensa por usuário |
| Catálogo | `/v1/catalog` | listas fechadas (pública, sem login) |
| Freela | `/v1/freela` | ver § Integração com o Freela |

## Integração com o Freela

O Praça se conecta ao `api-freela` como um **admin dedicado** (papel `ADMIN`,
permissão `REFERRALS`) — sem chave de API nem conta de serviço própria.

**Variáveis de ambiente** (`api/.env`):

| Variável | Para quê |
|---|---|
| `FREELA_API_URL` | base da API do Freela (ex.: `http://localhost:3000`) |
| `FREELA_ADMIN_EMAIL` | login do admin dedicado ao Praça |
| `FREELA_ADMIN_PASSWORD` | senha desse admin |
| `FREELA_PER_CONTACT_MESSAGE` | `true` só depois que a extensão abaixo estiver em produção no Freela (default `false`) |
| `FREELA_SYNC_ENABLED` | relógio de 2 min do outbox + sincronização (default **`true`**; ausente = ligado) |

Sem as três primeiras, toda rota `/v1/freela/*` e o modo de envio `freela`
respondem `503 FREELA_NOT_CONFIGURED` — o resto do Praça funciona normal
(comportamento verificado no smoke, seção "Freela: conexão desligada").

**Extensão opcional no api-freela** (não mesclada, sem push): branch
`feat/activation-campaigns-contact-message`, hoje num worktree local em
`/home/doutor/coding/freela/.wt/api-contact-message` (commits `d30bff00` +
`34fe46f1`). Adiciona `ExternalContactDto.message?` (≤ 4000 chars) — o
despachante do Freela usa o texto por contato quando existir, em vez de um
único texto de campanha para todo mundo. É o que permite ao Praça mandar
**todas** as variáveis por lead (`estabelecimento`, `bairro`, etc.), não só as
que o Freela já conhece. O dono decide se/quando mescla; até lá,
`FREELA_PER_CONTACT_MESSAGE` fica `false`.

**Flags do lado do Freela** (`api-freela`, não deste repo) que precisam estar
`true` em produção para a integração valer:

- `ACTIVATION_CAMPAIGNS_ENABLED` — campanhas normais (ativação).
- `CAMPAIGN_TEMPLATES_ENABLED` — campanhas automáticas (recorrentes).

Detalhe de como o Praça converte modelo, sincroniza status e lida com as duas
famílias de campanha: [`docs/api-contract.md` §18](docs/api-contract.md#18-freela).

## Produção

Todo o resto das variáveis do `api/.env` está em
[`api/.env.example`](api/.env.example) e é validado por zod na largada
(`src/common/config/env.validation.ts`) — a API **não sobe** com configuração
inválida. Cinco delas mudam comportamento e valem uma linha aqui:

| Variável | Default | Para quê |
|---|---|---|
| `TRUST_PROXY` | `false` | **ligue (`true`) atrás de nginx.** Sem ela o `req.ip` do Fastify é o IP do proxy: todo visitante vira um IP só e o teto por IP (300/min por rota; 10/min no formulário público) passa a valer para o mundo inteiro junto — é a forma do incidente `throttler-global-bucket-429-outage` do api-freela. Sem proxy na frente, deixe `false`: confiar no `X-Forwarded-For` ali deixaria qualquer um forjar o próprio IP |
| `PUBLIC_LEADS_PER_MINUTE` | `10` | teto do formulário público por minuto e por IP (é o único ponto que a internet escreve sem login) |
| `CADENCE_ENGINE_ENABLED` | `true` | relógio de 15 s do motor de cadências |
| `FREELA_SYNC_ENABLED` | `true` | relógio de 2 min do outbox/sincronização do Freela |
| `SEED_ADMIN_PASSWORD` | — | **obrigatória** para rodar `npm run seed` com `NODE_ENV=production` |

Flag nova precisa estar declarada no `docker-compose.yml`/`.prod` (regra de ops
do workspace) — mesmo quando o default do zod já resolve.

**A API roda em UMA instância.** Os dois relógios (`@Cron`) assumem processo
único: a garimpagem do outbox solta o lock consultivo antes da chamada HTTP e
não marca as linhas, e o avanço da cadência relê a inscrição sem `FOR UPDATE`.
Com duas réplicas, o mesmo lote vira duas campanhas (o lead recebe duas vezes) e
a mesma inscrição avança duas vezes. Se um dia precisar de duas, o caminho é
marcar as linhas na garimpagem (`UPDATE … SET claimed_at`) e ler com
`SELECT … FOR UPDATE SKIP LOCKED` — ver `docs/api-contract.md` §14, §18.5 e
§18.6.

**Seed em produção.** O formulário público precisa estar na internet (ele é
embutido em anúncio e landing), então a API inteira fica exposta —
`POST /v1/auth/login` incluído. Por isso `npm run seed` com
`NODE_ENV=production`:

- **exige** `SEED_ADMIN_PASSWORD` (mínimo 8 caracteres) e falha com mensagem
  clara sem ela;
- cria **só** a conta admin (`diego@praca.local`) com essa senha — as duas
  contas de demonstração ficam de fora.

Em desenvolvimento nada muda: as três contas nascem com `praca123`. Troque as
senhas (e o e-mail do admin, criando outra conta) antes de expor a API.

**Web.** Nunca ligue `NEXT_PUBLIC_DEMO_LOGIN` num host de verdade: com ela, as
credenciais de demonstração vão para o JS estático e `/entrar?demo=1` entrega o
formulário preenchido.

## Verificação

**Um de cada vez** — esta máquina trava com dois processos pesados juntos (ver
[`CLAUDE.md`](CLAUDE.md), "Regras de baixo consumo"). Nunca rode `nest build`
nem `next build` numa tarefa comum.

```bash
cd api
npm test                 # jest, maxWorkers 1 — 27 suítes, 457 testes
npm run typecheck        # tsc --noEmit, sozinho
npm run lint

# smoke: sobe a API sem watcher, roda os checks contra ela e mata o processo
npm run start:smoke &    # espere `curl -s localhost:3014/health` responder
npm run smoke            # 771 checagens, repetível sem resíduo
                         # (769 sem o container `praca-postgres` de pé: a última
                         #  limpeza das contas de teste é por psql)
```

```bash
cd web
yarn typecheck
yarn lint

# navegador: precisa da API na 3014 (start:smoke) e do web na 3024 (yarn dev)
yarn dev &
yarn browser-check       # 97 checagens; limpa o que cria e pode repetir
                         # PRACA_CHECK_FAXINA=1 apaga resíduo de rodada morta (todos os disparos e conclusões da praça do seed)
```

`browser-check` entra **pelo formulário** (conta em `PRACA_CHECK_EMAIL` /
`PRACA_CHECK_PASSWORD`, padrão a do seed), abre as telas do app e o formulário
público (num contexto sem sessão) e faz ações de verdade: concluir e desfazer
uma ação, criar um lead e movê-lo de etapa, montar um disparo em fila e marcar
enviada, lançar um indicador à mão.

Ele começa afirmando as **pré-condições do seed** de que depende (a praça, o
dono sem lead nenhum, a tabela de disparos vazia, o indicador `falta` sem
histórico) e faz uma **faxina de entrada** do que uma rodada interrompida possa
ter deixado; no fim **apaga tudo o que criou**, cada passo com tratamento de
erro próprio — inclusive desfazendo a conclusão da ação pela API
(`POST /v1/actions/:id/uncomplete`) —, de modo que o banco termina igual ao
seed e a rodada seguinte passa. Qualquer erro de console, `pageerror`, falha de
rede ou resposta HTTP ≥ 400 derruba a rodada (a única exceção é o 404 do
`hot-update.json` do `next dev`, com motivo escrito no script).

Depois, mate os dois processos e confirme que as portas ficaram livres:
`ss -ltn | grep -E ':(3014|3024) '` tem que voltar vazio.

## Documentos

- **`docs/api-contract.md`** — contrato canônico da API (§1–§19, com índice no
  topo).
- **`docs/superpowers/specs/2026-09-09-praca-port-design.md`** — spec de
  design do port.
- **`docs/api-contract.md` §19** — **desvios propositais** em relação ao
  protótipo Lovable: a lista fechada do que é diferente de propósito (motor de
  cadências no servidor, dois modos de envio, pessoas com login, `text` na
  prévia do disparo, cadência nova nascendo pausada, etc.). Antes de reportar
  "isso não é igual ao protótipo", confira lá.
- **`docs/superpowers/plans/2026-09-09-praca-port.md`** — plano de
  implementação.
- **`CLAUDE.md`** — regras rápidas para trabalhar neste repo.
