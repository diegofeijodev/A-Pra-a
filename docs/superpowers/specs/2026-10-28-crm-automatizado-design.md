# CRM do Praça de volta, automático, no visual da Lovable

**Data:** 28/10/2026 · **Branch:** `feat/crm-automatizado` (a partir de `master` = `9652376`) · **Status:** rascunho para o
arquiteto e o designer revisarem antes de implementar (regra do dono).

> Pedido do Denner (28/10): "trazer de volta o CRM do Praça antigo, agora TODO AUTOMATIZADO, dentro do Praça novo".
> No meio da conversa ele pediu para seguir sem perguntas ("pode ir seguindo automático, vou dormir"). Por isso tomei as
> decisões sozinho. Todas estão na §10, todas podem ser desfeitas e tudo o que é novo nasce atrás de uma chave DESLIGADA.

## 1. O que "todo automatizado" quer dizer (a proposta)

Hoje o CRM (grupo "Comercial") depende da equipe para quase tudo: digitar ou importar lead, arrastar o cartão de etapa,
lembrar o follow-up, copiar a mensagem, lançar indicador. **A proposta é que a equipe não precise alimentar o CRM.** O sistema
alimenta e diz o que fazer:

1. **O lead nasce sozinho.** Pode vir da visita do representante (já existe), do formulário público (já existe), da busca de
   estabelecimentos (novo: os achados entram sozinhos) ou da empresa que se cadastrou no Freela na cidade da praça (novo,
   depende do Freela).
2. **O lead muda de etapa sozinho.** Pela visita (já existe). Pelo Freela: cadastrou → "Cadastrado"; primeira contratação →
   "Primeira vaga rodada"; segunda contratação → "Cliente ativo" (novo, depende do Freela). Lead sem resposta há 21 dias vai
   para "Perdido / reaquecer" e volta à fila em 30 dias (novo).
3. **O lead recebe mensagens e follow-ups sozinho.** O motor de cadências já existe. A mensagem só sai sozinha no modo "Via
   Freela", que depende do Freela. No modo "Fila manual" ela vira tarefa, com o botão "Abrir WhatsApp" e o texto pronto.
4. **A equipe recebe tarefas e um resumo do dia.** Tela nova **Tarefas**: tudo o que precisa de uma pessoa hoje (mensagens da
   fila, ligações das cadências, leads quentes da visita, conversas paradas, empresas cadastradas que não publicaram) e, no topo,
   o **resumo do dia** com a conta de cada número. Tela nova **Automações**: o que o automático faz, se está ligado, quando rodou
   pela última vez e o que fez nos últimos 7 dias. Tudo fica dentro do Praça. O Praça não tem canal próprio de WhatsApp nem de
   e-mail para a equipe (§9).

Cada ação do automático vira um evento na ficha do lead, com o autor "Automático" (ou "Automático · Freela"; o sync de hoje já usa "Freela (sincronização)" e fica assim) e o texto da conta
("Freela: cadastro em 12/10, 2 contratações pagas → Cliente ativo"). Assim nada muda em silêncio e o resumo do dia sai dos
próprios eventos.

### 1.1 O que depende das credenciais do Freela (`FREELA_ADMIN_EMAIL/PASSWORD`, hoje vazias em produção)

| Automação | Sem o Freela | Com o Freela |
|---|---|---|
| Lead da visita, do formulário e da busca | funciona | funciona |
| Etapa pela visita; "sem resposta" → Perdido/reaquecer | funciona | funciona |
| Etapa pelo cadastro e pelas contratações no Freela; lead do cadastro no Freela | **inerte** (a tela diz "precisa da conexão com o Freela") | funciona |
| Mensagem que sai sozinha (modo "Via Freela") | **não sai**: vira tarefa da fila manual | sai pelo chip de campanhas do Freela, se o canal de WhatsApp do Freela estiver saudável (as memórias de 07/10 e 27/09 mostram o Meta parado com o erro 131042 e a Z-API desconectada) |
| Tarefas, resumo do dia, página Automações | funcionam (sem as tarefas e os números do Freela) | completas |

## 2. O que já existe (conferido no código em 28/10)

A API do Comercial **não mudou** desde a tag `pre-ui-lovable` (`git diff pre-ui-lovable master` nos módulos do CRM sai vazio). As
páginas do web só ganharam o caminho novo dos links. O redesenho de 27/10 só **escondeu** o grupo atrás de
`TEAM_COMMERCIAL_ENABLED`.

| Peça | Onde | Já é automática? |
|---|---|---|
| Funil de 8 etapas, eventos, vagas do lead | `leads`, `lead_events`, `lead_vagas`; `domain/catalog/funnel.ts` | não: a equipe arrasta o cartão |
| Lead da visita (etapa 1) + etapa depois da visita | `campo/visits.service.ts` (`estagioDepoisDaVisita`, `estagioSimples`) | **sim** |
| Lead do formulário público | `public/public.service.ts` | **sim** |
| Lead da busca de estabelecimentos | `places/places-search.service.ts` (`addLeads`, candidatos escolhidos à mão) | não: alguém escolhe os achados |
| Importar planilha | `imports/` (dedup, desfazer em 24 h) | não (ato manual, fica) |
| Fila "Para tocar hoje" (Entrada) | `leads/queue.service.ts` | **sim** (calculada na leitura) |
| Cadências: entrada automática (`stage_novo`, `reheat_due`, `first_vaga`), mensagens, tarefas, condições, saídas | `cadences/cadence-engine.service.ts` (relógio de 15 s) | **sim**, mas as 5 cadências-modelo nascem **pausadas** (de propósito: ligar é um clique de gente) |
| Envio: modo `fila` (manual) e `freela` (chip do Freela) | `messages/`, `disparos/`, `freela/freela-outbox.service.ts` | `fila` não envia sozinho (é de propósito, para não queimar o número); `freela` envia sozinho |
| Sync dos cadastros do representante (lead → 5 "Cadastrado") | `campo/signup-sync.service.ts` (`leadDeveSubir`), `FIELD_SIGNUP_SYNC_ENABLED` | **sim**, mas desligado em produção (sem `FREELA_ADMIN_*`) |
| Sino de avisos (ações vencendo, etapa travada, lead crítico) | `notifications/` (calculado na leitura) | **sim** |
| Indicadores | `indicators/` + `domain/indicator-rules.ts` | parte sistema, parte lançamento manual |
| Ações do roteiro de abertura da praça (`/hoje`) | `actions/` | recorrência automática; concluir é manual |
| Campanhas de mídia, calendário, criativos, tráfego | `midia/`, telas `/campanhas`, `/calendario` | manual (fica como está) |

**No Freela (`api-freela`, só leitura, `origin/main`):**

- `GET /v1/admins/consultants/:id/registrations` (cadastro assistido, PR #610, atrás de `FIELD_ASSISTED_SIGNUP_ENABLED` **no Freela**)
  já traz `activatedAt`, `firstVacancyAt` e `firstJobCompletedAt`. O Praça já grava isso em `field_signups`, mas só usa para subir
  para a etapa 5.
- `GET /v1/admin/crm/pipeline` (`JwtAdminGuard`, sem permissão extra): é o quadro inteiro de contratantes. Cada cartão traz
  `userId`, `name`, `city`, `state`, `whatsappPhone`, `hiringsCount` (vagas pagas e não canceladas) e `registeredAt`. **Não traz
  data de cada contratação.**
- `activation_campaign_recipients.customMessage` está na main: a mensagem por contato do modo "Via Freela" (`FREELA_PER_CONTACT_MESSAGE`)
  já tem o lado do Freela.

## 3. O que é novo: seis automações

Cada uma tem a sua chave, **desligada por padrão** (`env.validation.ts`, `docker-compose.yml` de dev com `${VAR:-false}`,
`docs/deploy/.env.prod.example`). Produção usa `env_file: .env`, e quem liga é o dono. O grupo Comercial continua atrás de
`TEAM_COMMERCIAL_ENABLED`. Sem ele, nenhuma tela nova aparece, mas os trabalhos da API rodam se as chaves deles estiverem ligadas.
Isso é de propósito: o funil fica certo mesmo com as telas escondidas.

### A1 · Achados da busca entram sozinhos no funil — `CRM_AUTO_LEADS_FROM_SEARCH_ENABLED`

- Quando uma busca do tipo `lugares` termina (`status` vai a `done`), os candidatos `novo` viram leads pelo **mesmo** caminho
  do "Adicionar" de hoje (`addLeads` → `criarLeadsDeBusca`, com o dedup contra os leads de agora e a reserva atômica). A origem é
  `pesquisa automática` e o lote fica com o rótulo "Busca automática dd/mm · área". Não há dono.
- Shoppings e lojas de shopping (`kind` ≠ `lugares`) continuam manuais: o shopping pede marcação à mão (lote D).
- Teto por busca: **300** leads (constante no catálogo). O que passa do teto fica `novo` para escolher à mão, e o evento da rodada
  diz quantos ficaram.
- Falhou (conflito, banco)? A busca continua `done`, a rodada fica registrada como erro em `crm_automation_runs` e o
  "Adicionar" manual segue funcionando.

### A2 · Etapa pelo cadastro do representante (estende o sync que já existe) — `CRM_AUTO_STAGES_ENABLED`

O `signup-sync` já sobe o lead para 5. Com a chave, ele também:
- sobe para **6 "Primeira vaga rodada"** quando `first_job_completed_at` chega;
- registra o evento "Publicou a primeira vaga no Freela em dd/mm" quando `first_vacancy_at` chega (sem mudar a etapa: o funil não tem
  a etapa "publicou").

Só anda para a frente: lead arquivado ou de teste nunca é tocado, e lead em 8 "Perdido" sobe, porque o fato do Freela vale mais que
a marcação de perdido. Depende do Freela (o sync já depende).

### A3 · Etapa e lead pelo quadro de contratantes do Freela — `CRM_FREELA_PIPELINE_ENABLED`

- Trabalho de hora em hora, das 07h às 22h de Brasília: `GET /v1/admin/crm/pipeline` (o quadro inteiro, sem filtro).
- **Casamento** cartão → lead, nesta ordem, **nunca por nome**: (1) `leads.freela_user_id` gravado antes; (2) `field_signups.freela_user_id`
  com `lead_id`; (3) `phone_key` do `whatsappPhone`, igual ao de **um único** lead não arquivado (dois ou mais = ambíguo: não casa e
  conta no registro da rodada). Casou? Grava `leads.freela_user_id`, `freela_hirings` e `freela_synced_at`.
- **Etapa** (só para a frente; arquivado e teste fora; 8 sobe): cartão existe → no mínimo **5**; `hiringsCount ≥ 1` → no mínimo **6**;
  `hiringsCount ≥ 2` → **7 "Cliente ativo"**. A regra do catálogo ("recontratou em 30 dias") precisa da data de cada contratação, que
  o Freela não manda. Ficou "2 contratações ou mais" (minha decisão; §10) até o Freela mandar as datas (§9).
- **Lead novo do cadastro no Freela:** cartão sem lead, com `city`+`state` iguais (sem acento e sem caixa) à cidade da cobertura de uma
  praça aberta (`cobertura_cidade`/`cobertura_uf`, ou uma das `vizinhas`) e `registeredAt` ≥ `start_date` da praça. Vira lead na etapa
  que o cartão pede, com origem `cadastro no Freela`, telefone do cartão e o evento da conta. Uma praça só: se casar com duas, vale a de
  início mais recente. Quem se cadastrou antes da praça abrir fica fora (decisão minha, §10: é cliente antigo do Freela, não resultado da praça).
- Sem `FREELA_ADMIN_*` ou com a chave desligada, o trabalho não chama nada. A rodada registra `nao_configurado` uma vez por hora,
  e não a cada minuto.

### A4 · Lead sem resposta vai para "Perdido / reaquecer" — `CRM_AUTO_STAGES_ENABLED`

- Uma vez por dia, às 06:10 de Brasília. Lead na etapa **2 "Contatado"**, sem nenhum evento de contato (`CONTACT_KINDS`) há **21 dias**
  (ou, sem contato nenhum, com `stage_since` de 21 dias), sem inscrição `ativo` em cadência, não arquivado e não de teste → etapa 8,
  `lost_reason = 'não respondeu'`, `reheat_at = hoje + 30`. O evento diz a conta ("último contato em 05/10, 21 dias sem resposta").
- A trilha de reaquecimento (`reheat_due`) e a fila da Entrada já trazem o lead de volta sozinhas: isso não muda.

### A5 · Tarefas do dia — `CRM_TASKS_ENABLED`

Calculadas na leitura, **sem tabela de tarefas**, como o sino e a fila da Entrada. `GET /v1/crm/tasks?praca_id=&person=all|me`.
Regras puras em `domain/crm-tarefas-rules.ts`, na ordem de prioridade:

| # | Tarefa | Regra | Feito = |
|---|---|---|---|
| T1 | **Mandar mensagem** | `msg_sends` modo `fila`, `status = 'fila'`, `scheduled_at` ≤ fim de hoje, lead da praça | `POST /v1/sends/:id/mark` (o de hoje); "Abrir WhatsApp" monta `wa.me` com o texto |
| T2 | **Lead quente da visita** | última visita concluída do lead com `interest` alto ou médio, lead em etapa < 5, nenhum contato da equipe depois da visita, visita com 1 dia ou mais | registrar contato |
| T3 | **Próximo passo vencido** | `next_step_date` ≤ hoje e etapa ≠ 8 (inclui a ligação que a cadência marca no lead) | registrar contato e limpar o próximo passo |
| T4 | **Conversa parada** | etapa 3 ou 4, sem contato há 5 dias ou mais | registrar contato |
| T5 | **Ajudar a publicar a 1ª vaga** | etapa 5 há 3 dias ou mais (`stage_since`), sem `first_vacancy_at` e sem `freela_hirings ≥ 1` | registrar contato |

- Lead com `snooze_until` > hoje fica fora. "Adiar" = `snooze_until` (1, 3 ou 7 dias). Um lead aparece **uma vez**, na tarefa de maior
  prioridade.
- "Feito" = `POST /v1/crm/tasks/done { lead_id, task, contact: 'call'|'msg_out'|'visit'|'note', note? }`: grava o evento com o autor
  logado e o `last_contact_at`, e limpa `next_step_*` na T3, tudo numa transação. A tarefa some porque a regra deixa de casar. Não há
  estado "tarefa concluída" para guardar.
- Dono: `person=me` mostra os leads com `owner_id` = eu **e** os sem dono. `all` mostra tudo.
- A Entrada não vira tarefa por lead: aparece uma linha "N leads novos esperando o 1º toque → Entrada".

### A6 · Resumo do dia e página Automações — `CRM_TASKS_ENABLED`

- `GET /v1/crm/summary?praca_id=&day=YYYY-MM-DD` (padrão: hoje). O dia vem de `todaySp()`, e eventos e leads são contados pelo
  dia de Brasília. Números, **cada um com a conta e a fonte** (regra do dono, 08/10):
  - leads novos por origem ("12 = 8 da busca + 3 de visitas + 1 do formulário · fonte: leads criados em 27/10");
  - mudanças de etapa, separadas em automáticas e da equipe, por etapa de destino;
  - Freela: cadastros (→5), primeiras contratações (→6), clientes ativos (→7) no dia;
  - mensagens: enviadas e respondidas no dia (`msg_sends.sent_at`/`replied_at`);
  - tarefas abertas agora (as contagens do A5).
- `GET /v1/crm/automations`: para cada automação, devolve a chave (ligada/desligada), se depende do Freela e se ele está configurado,
  a última rodada (`crm_automation_runs`) e quanto ela fez nos últimos 7 dias (eventos com o autor automático). Devolve também as
  cadências (pausada ou não, quantos inscritos ativos) e o modo de envio. A página **não liga chave nenhuma** (chave é `.env`, do dono);
  a cadência continua sendo ligada no play da tela Mensagens, com link para lá.
- Cartão "Comercial hoje" no Dashboard (`/inicio`): só com `commercial` e `crm_tasks`. Mostra 3 números do resumo e o link para Tarefas.

## 4. Telas no visual da Lovable

A Lovable do Diego **não tem** as telas do Comercial. O visual vem das telas redesenhadas em 26–27/10 (Praças em cartões,
Representantes em tabela, Dashboard): `text-3xl font-semibold` no título, subtítulo `text-muted-foreground`, `card-surface` +
`shadow-card`, botão principal `bg-brand`, pílulas de escolha única como em Clientes e Vouchers, e o celular em 1 coluna com a ação
principal à mão (regra do dono, 15/09). O designer detalha.

| Tela | O que muda |
|---|---|
| **Tarefas** `/tarefas` (nova, 1º item do Comercial) | resumo do dia no topo (cartões com a conta), pílulas "Minhas · Todas", grupos T1–T5 em cartões, cada linha com nome, motivo em uma frase, "Feito", "Adiar" e, na T1, "Abrir WhatsApp"; o nome abre o `LeadPanel` de hoje |
| **Automações** `/automacoes` (nova, último item do Comercial) | um cartão por automação (o que faz, Ligada/Desligada, "precisa do Freela", última rodada, o que fez em 7 dias); seção "Mensagens" com o modo de envio e as cadências |
| **Funil** `/funil` | redesenho visual: colunas em cartões, cartão do lead com selo "Automático" quando a última mudança de etapa foi do automático e "Freela: N contratações" quando houver; arrastar continua |
| **Entrada** `/entrada` | cabeçalho, cartões e pílulas no visual novo; a lógica (fila, importação, desfazer) não muda |
| Mensagens, Campanhas, Calendário, Indicadores, Ações, Freela, Buscar estabelecimentos | só o cabeçalho comum (`CabecalhoPagina`) e os cartões externos no visual novo; nada de lógica |
| Buscar estabelecimentos (com A1) | aviso "Os achados entram no funil sozinhos (até 300 por busca)" |
| Dashboard | cartão "Comercial hoje" (A6) |

O menu (`montarMenu`): com `features.crm_tasks`, o grupo "Comercial" ganha "Tarefas" no começo e "Automações" no fim. Sem a chave, o
grupo fica igual ao de hoje.

## 5. Dados (migração aditiva, sem índice parcial novo)

- `leads`: `freela_user_id String?` (índice), `freela_hirings Int?`, `freela_synced_at DateTime?`.
- `crm_automation_runs`: `id`, `job` (`auto_leads_busca` | `etapas_freela` | `pipeline_freela` | `sem_resposta`), `started_at`, `finished_at`,
  `ok`, `summary Json` (contagens), `error String?`. Índice `(job, started_at)`. Limpeza: o próprio trabalho diário apaga as linhas de
  mais de 30 dias.
- O `migrate dev` vai propor `DROP INDEX` dos índices parciais do campo: gerar com `--create-only`, apagar essas linhas e aplicar com
  `migrate deploy` (CLAUDE.md).

## 6. Trabalhos (instância única, como os de hoje)

| Trabalho | Quando | Chave |
|---|---|---|
| A1 | no fim da busca (`lugares`), no mesmo processo, depois do `done` | `CRM_AUTO_LEADS_FROM_SEARCH_ENABLED` |
| A2 | dentro da rodada do `signup-sync` (já de minuto em minuto, intervalo próprio) | `CRM_AUTO_STAGES_ENABLED` + `FIELD_SIGNUP_SYNC_ENABLED` |
| A3 | `0 7-22 * * *` Brasília | `CRM_FREELA_PIPELINE_ENABLED` + Freela configurado |
| A4 + limpeza de `crm_automation_runs` | `10 6 * * *` Brasília | `CRM_AUTO_STAGES_ENABLED` |

Todos com `try/catch` interno (exceção em `@Cron` derruba o processo), trava "rodando" no processo, uma transação por lead (um lead
quebrado não trava os outros) e registro em `crm_automation_runs`.

## 7. Contrato

Novo §47 em `docs/api-contract.md` antes do código: `GET /v1/crm/tasks`, `POST /v1/crm/tasks/done`, `POST /v1/crm/tasks/snooze`,
`GET /v1/crm/summary`, `GET /v1/crm/automations`, os campos novos do lead (`freela_hirings` e `last_stage_auto` no item da lista do
funil) e `features.crm_tasks` / `crm_auto_leads` / `crm_auto_stages` / `crm_freela_pipeline` no `GET settings/config`. As rotas novas
são de leitura e de registro de contato, abertas a toda a equipe (`@Equipe()` no método). Com `CRM_TASKS_ENABLED` desligada, as
rotas `/v1/crm/*` dão **404**, e o web só as chama com `features.crm_tasks` (nunca sondando).

## 8. Fora de escopo e o que continua proibido

- **Fora:** Pix automático (F10, Woovi); `payouts.service.ts` perto da linha 238; ligar `FIELD_EARNINGS_AUTOCLOSE`; mudar o api-freela
  (só leitura: o que falta vira pré-condição, §9); WhatsApp ou e-mail para a equipe saindo do Praça; distribuição automática de dono;
  apagar ou reescrever as telas antigas (Campanhas/Calendário/Freela ficam com a lógica de hoje); ligar sozinho as cadências-modelo.
- **Continuam fora por segurança:** `bootstrapAdmin` com senha fixa, Google Places gravando dados, pagamento sem razão (ledger), login
  por usuário sintético, chave do Google no bundle, dia em UTC, gestor redefinindo senha de admin, status à mão, "Excluir geração"
  apagando rotas.
- O zip da Lovable não entra (não há tela de CRM nele).

## 9. Pré-condições fora do código (o dono faz, nada disto é executado aqui)

1. Conta de admin do Freela para o Praça (`REFERRALS` + `CONSULTANTS`): o dono gera e grava `FREELA_ADMIN_EMAIL/PASSWORD` no
   `/opt/praca/.env`, **num terminal próprio** (segredo nunca passa pelo chat).
2. No Freela: `FIELD_ASSISTED_SIGNUP_ENABLED` ligada (a listagem de cadastros do representante fica atrás dela). Conferir antes de
   ligar a A2.
3. Para a mensagem sair sozinha: modo "Via Freela" na tela Mensagens, `FREELA_PER_CONTACT_MESSAGE=true` no Praça e o canal de
   campanhas do Freela funcionando.
4. Para "Cliente ativo" seguir a regra dos 30 dias: o quadro do Freela precisa mandar a data da última contratação (PR no
   api-freela, revisado pelo Denner, quando ele quiser).

**Ordem sugerida para ligar:** `TEAM_COMMERCIAL_ENABLED` → `CRM_TASKS_ENABLED` → `CRM_AUTO_STAGES_ENABLED` →
`CRM_AUTO_LEADS_FROM_SEARCH_ENABLED` → (com a conta do Freela) `FIELD_SIGNUP_SYNC_ENABLED` e `CRM_FREELA_PIPELINE_ENABLED`.

## 10. Decisões que tomei sozinho (reverta qualquer uma)

1. As telas antigas ficam e o grupo ganha duas (Tarefas e Automações). Não enxuguei o menu: isso tira tela de quem usa e é decisão sua.
2. "Cliente ativo" = 2 contratações pagas ou mais, até o Freela mandar as datas.
3. Lead do cadastro no Freela só a partir do início da praça e só na cidade da cobertura ou numa vizinha.
4. "Sem resposta" = 21 dias em "Contatado" sem contato e fora de cadência → Perdido, reaquecer em 30 dias.
5. Achados da busca entram sozinhos até 300 por busca. Shoppings ficam manuais.
6. O automático nunca volta etapa, nunca toca em arquivado ou teste, e tira de "Perdido" quando o Freela mostra cadastro ou contratação.
7. Tarefas sem tabela: são calculadas, e "Feito" é registrar o contato.
8. O resumo do dia fica só dentro do Praça (sem WhatsApp nem e-mail).
9. As cadências-modelo continuam nascendo pausadas.
10. Quatro chaves em vez de uma, para ligar por partes.

## 11. Verificação (máquina de 7,6 GB: um processo pesado por vez, `free -m` antes)

- Regras puras com teste primeiro: `crm-tarefas-rules`, `crm-etapas-rules` (A2/A3/A4), `crm-resumo-rules`.
- Serviços com o Prisma de teste. O Freela é sempre um dublê (nunca um Freela real).
- jest com `nice -n 19` e `--runInBand`. Os `*caracterizacao*` não se editam para passar.
- `scripts/smoke-crm.sh` com as chaves ligadas, a conexão do Freela vazia e o Overpass num endereço morto.
- web: vitest, `yarn typecheck`, `yarn lint` (foi ele que derrubou o build da Vercel em 21/10).
- `browser-check` com `TEAM_COMMERCIAL_ENABLED` + as chaves novas ligadas: confere Tarefas, Automações, o Funil novo e o cartão do
  Dashboard. O script se atualiza onde o texto mudou; nenhuma checagem sai.
- Sem `nest build`, `next build` nem `npm run build`.
