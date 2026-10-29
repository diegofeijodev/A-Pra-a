# CRM automático: como subir e como ligar (roteiro para o Denner)

Branch `feat/crm-automatizado` (a partir de `master` = `9652376`). Nada disto foi executado. Os passos marcados "(Denner, `!`)" são do
Denner; os marcados "(Claude)" eu faço depois do ok dele.

## O que muda em produção ao subir, com as cinco chaves novas desligadas

- **Nada de automação roda.** O relógio do CRM não consulta o banco, `/v1/crm/*` responde 404, e o menu e o Dashboard ficam como estão
  (o Comercial continua escondido: `TEAM_COMMERCIAL_ENABLED` ausente).
- **Migração aditiva** `20261109100000_crm_automatico`, aplicada no boot pelo `migrate deploy` do contêiner: 3 colunas novas em `leads`,
  `lead_events.auto_key` (índice único sobre uma coluna vazia, instantâneo), o índice `field_signups.freela_user_id` e a tabela
  `crm_automation_runs`. Nenhum índice parcial é tocado.
- **Mudam de propósito, mesmo com as chaves desligadas:**
  - as taxas do Funil (`GET /v1/leads/metrics`) não contam mais a etapa 8 como "contatado/cadastrado" (contrato §47.5);
  - os indicadores "Recontratação", "Perda mensal" e "Passagem de etapa" não contam mais os perdidos como clientes (contrato §47.7).
    Os números caem.
  - as telas do Comercial ganham o visual novo. Hoje elas só abrem pelo endereço direto, porque o Comercial está escondido;
  - o painel do lead, que também abre em Clientes, no Mapa e no detalhe da praça, virou um painel acessível: fecha com Esc e devolve
    o foco;
  - na Entrada, tocar no link do WhatsApp deixa de gravar "Mensagem enviada"; só o "Feito" grava.

## Subida (nesta ordem: API antes do web)

1. **Backup (Denner, `!`):**
   `ssh ubuntu@56.124.127.54 "docker exec praca-postgres pg_dump -U praca praca | gzip > /opt/praca/backup-pre-crm-\$(date +%Y%m%d-%H%M).sql.gz && ls -la /opt/praca/backup-pre-crm-*"`
2. **master + GitHub (Denner, `!`), sem tocar no working tree:**
   `cd /home/doutor/coding/freela/praca && git merge-base --is-ancestor master feat/crm-automatizado && git branch -f master feat/crm-automatizado && git push origin master:stack-freela`
3. **Código da API a partir de uma CÓPIA LIMPA (Denner, `!`).** O working tree tem arquivos reformatados por um formatador externo. A API de qualquer commit de docs depois de `38f4a6f` é idêntica:
   `C=~/praca-deploy-api && rm -rf $C && mkdir -p $C && git -C /home/doutor/coding/freela/praca archive 38f4a6f api | tar -x -C $C`
   `rsync -a --delete --exclude node_modules --exclude dist --exclude .env --exclude '.env.*' --exclude coverage --exclude uploads $C/api/ ubuntu@56.124.127.54:/opt/praca/api/ && echo RSYNC_OK`
4. **Imagem (Claude):** `docker tag praca-api:latest praca-api:pre-crm`, depois `docker build -t praca-api:38f4a6f -t praca-api:latest .` no EC2.
5. **Subir a API (Denner, `!`):**
   `ssh ubuntu@56.124.127.54 "cd /opt/praca && docker compose -f docker-compose.prod.yml up -d --no-deps --no-build api"`
6. **Conferir (Claude):**
   - `/health` 200;
   - a migração `20261109100000_crm_automatico` aplicada, sem nenhuma pendente;
   - `settings/config` com `features.crm_tasks: false` e `features.crm_auto_leads: false`;
   - `GET /v1/crm/tasks` 404 `CRM_TASKS_DISABLED`;
   - log sem erro.
7. **Web (Claude):** cópia sem git do `38f4a6f`, depois `vercel deploy --prod`. Conferir aberturademercado.com.br/entrar.

**Volta:**
- API: `docker tag praca-api:pre-crm praca-api:latest` e o mesmo `compose up`. A migração é aditiva, então pode ficar.
- Web: promover o deploy anterior na Vercel.
- Git: tag local `pre-crm` = `9652376` (já criada).

## Como ligar, por partes (`/opt/praca/.env`, num terminal do Denner, depois `compose up` da API)

Ligue uma chave por vez e olhe a página **Automações** antes da próxima.

| Ordem | Chave | O que liga | Precisa de |
|---|---|---|---|
| 1 | `TEAM_COMMERCIAL_ENABLED=true` | o grupo Comercial no menu (as telas no visual novo) | nada |
| 2 | `CRM_TASKS_ENABLED=true` | Tarefas, Automações, o cartão "Comercial hoje" no Dashboard e os selos do Funil | a 1 |
| 3 | `CRM_AUTO_LOST_ENABLED=true` | "21 dias sem resposta em Contatado" → Perdido (todo dia a partir das 06h10) | nada; **antes, olhe na tela quantos leads estão em Contatado parados** |
| 4 | `CRM_AUTO_LEADS_FROM_SEARCH_ENABLED=true` | os achados da busca entram sozinhos no funil (até 300 por busca) e passam a alimentar os roteiros do campo | nada; **se a cadência "Lead novo" estiver ligada no modo "Via Freela", sai mensagem fria em massa** (a tela Automações avisa) |
| 5 | `FREELA_ADMIN_EMAIL/PASSWORD` + `FIELD_SIGNUP_SYNC_ENABLED=true` + `CRM_AUTO_STAGES_ENABLED=true` | o sync dos cadastros do representante, as etapas 5 e 6 por ele, e "publicou a 1ª vaga" | a conta de admin do Freela (segredo: num terminal seu, nunca pelo chat) e `FIELD_ASSISTED_SIGNUP_ENABLED` ligada **no Freela** |
| 6 | `CRM_FREELA_PIPELINE_ENABLED=true` | o quadro de contratantes do Freela de 2 em 2 horas (08h–20h): etapas 5/6/7 e lead novo para quem se cadastrou sozinho na cidade da praça | a conta do Freela |

**Custo da 5:** enquanto houver cadastro sem serviço concluído, o sync relê a janela inteira de 45 dias de cada representante, a cada
10 minutos.

## Decisões que tomei sem você (o desenho, §12, tem todas, com o porquê)

- As telas antigas ficam. O menu ganha "Tarefas" e "Automações", e "Ações" passou a "Ações da praça".
- **"Cliente ativo"** passa a ser quem tinha 2 ou mais vagas pagas na primeira leitura do Praça, ou quem voltou a contratar num dia
  depois da primeira vaga paga. Duas vagas no mesmo dia **não** contam.
- O lead que a busca cria fica **sem dono**. "Feito" numa tarefa de lead sem dono torna dono quem fez.
- O lead novo vindo do Freela leva o telefone do Freela (só o lead novo; nunca sobrescreve) e só entra se o cadastro for de depois do
  início da praça, na cidade da praça ou numa vizinha.
- O automático nunca volta uma etapa, nunca toca em lead arquivado ou de teste, e só tira de "Perdido" por um fato do mesmo dia da
  marcação ou posterior. Se alguém volta o cartão, ele não empurra de novo.
- As cadências-modelo continuam nascendo pausadas, e o motor de cadências não mudou.

## Perguntas para você (nada disto bloqueia a subida)

1. **"Valor estimado" do Funil:** é por mês ou por vaga? Hoje a tela diz "estimativa pela classificação" e explica a conta.
2. **"Feito" na Entrada:** ele grava o contato, mas o lead continua em "Lead novo" e volta para a fila no dia seguinte. Esse é o
   comportamento de antes. Quer que o primeiro contato mova o lead para "Contatado" sozinho e que quem fez vire o dono, como em Tarefas?
3. **Cadastro assistido que não casou com nenhum lead:** hoje o quadro do Freela o trata como cadastro próprio (lead novo em
   "Cadastrado"). Prefere ignorar?
4. **Pílula "Tarefas" logo depois de "Dashboard" no celular?** (Hoje ela fica no grupo Comercial.)
5. **Lead criado direto em 5 ou mais e depois perdido** não entra na "Perda mensal", porque não há histórico de etapa. Tudo bem?
