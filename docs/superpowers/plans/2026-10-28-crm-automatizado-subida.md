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
  - na Entrada, tocar no link do WhatsApp deixa de gravar "Mensagem enviada"; só o "Feito" grava;
  - na Entrada, a fila do 1º contato passa a ser só a da praça ativa, sem os leads de teste (antes: todas as praças), como o cartão
    "Primeiro contato" de Tarefas;
  - na Entrada, depois do "Feito" a linha **fica** na fila com a marca "✓ Contato registrado hoje · continua em “Lead novo”" (antes ela
    sumia e o lead voltava no dia seguinte, como se ninguém tivesse ligado). O lead só passa a "Contatado" com `CRM_TASKS_ENABLED`.

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
| 2 | `CRM_TASKS_ENABLED=true` | Tarefas, Automações, o cartão "Comercial hoje" no Dashboard e os selos do Funil; o "Feito" da Entrada e o de Tarefas passam a levar o lead de "Lead novo" a "Contatado" | a 1 |
| 3 | `CRM_AUTO_LEADS_FROM_SEARCH_ENABLED=true` (A1) | os achados da busca entram sozinhos no funil (até 300 por busca) e passam a alimentar os roteiros do campo | nada; **se a cadência "Lead novo" estiver ligada no modo "Via Freela", sai mensagem fria em massa** (a tela Automações avisa, numa faixa amarela) |
| 4 | `CRM_AUTO_LOST_ENABLED=true` (A4) | lead há 21 dias **na etapa** "Contatado" e há 21 dias sem contato → Perdido (todo dia a partir das 06h10) | **a contagem de "Antes de ligar a 4" aceita por você** (nenhuma tela mostra esse número); de preferência depois de a equipe usar Tarefas por algumas semanas |
| 5 | `FREELA_ADMIN_EMAIL/PASSWORD` + `FIELD_SIGNUP_SYNC_ENABLED=true` + `CRM_AUTO_STAGES_ENABLED=true` (A2) | o sync dos cadastros do representante, as etapas 5 e 6 por ele, e "publicou a 1ª vaga" | a conta de admin do Freela (segredo: num terminal seu, nunca pelo chat) e `FIELD_ASSISTED_SIGNUP_ENABLED` ligada **no Freela** |
| 6 | `CRM_FREELA_PIPELINE_ENABLED=true` (A3) | o quadro de contratantes do Freela de 2 em 2 horas (08h–20h): etapas 5/6/7 e lead novo para quem se cadastrou sozinho na cidade da praça | a conta do Freela e **a medida de "Antes de ligar a 6"** (o quadro inteiro contra o teto de 15 s) |

Por que a A1 vem antes da A4: a A1 só cria leads novos e tem o "Desfazer importação"; a A4 mexe em leads que já existem.

**Custo da 5:** enquanto houver cadastro sem serviço concluído, o sync relê a janela inteira de 45 dias de cada representante, a cada
10 minutos.

### Antes de ligar a 4 (A4): a contagem e a volta

**Contagem** (só leitura, em produção; aproximada, porque a exata é rodar a A4 numa cópia do backup do passo 1, sem as variáveis `FREELA_*`).
Já tem as duas condições da regra (21 dias na etapa 2 e 21 dias sem contato), sem os de teste, sem os adiados, sem próximo passo de hoje
em diante e fora de cadência:

```sql
WITH h AS (SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS hoje,
                  (now() AT TIME ZONE 'America/Sao_Paulo')::date - 21 AS limite)
SELECT count(*) FROM leads l, h
WHERE l.stage = 2 AND NOT l.archived AND NOT l.is_test
  AND l.stage_since::date <= h.limite
  AND (l.snooze_until IS NULL OR l.snooze_until <= h.hoje)
  AND (l.next_step_date IS NULL OR l.next_step_date < h.hoje)
  AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.lead_id = l.id AND e.status IN ('ativo', 'aguardando'))
  AND COALESCE(
        ((SELECT max(ev.at) FROM lead_events ev WHERE ev.lead_id = l.id AND ev.kind IN ('msg_out','msg_in','call','visit'))
           AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date,
        (l.last_contact_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date,
        l.stage_since::date) <= h.limite;
```

A 1ª rodada move de uma vez todos esses leads, em todas as praças. Ligue só com o número aceito por você.

**Volta de uma rodada inteira (dia D).** Cada lead movido pela A4 tem um evento de etapa com `lead_events.auto_key = 'a4:<lead>:<stage_since
de antes>'`, então dá para devolver cada um à etapa 2 com a data de antes. Nesta ordem:

1. **Desligue a A4** (`CRM_AUTO_LOST_ENABLED=false` + `compose up` da API). Os leads devolvidos continuam casando com a regra; com a chave
   ligada, a rodada seguinte os moveria de novo.
2. Rode, trocando o dia `D` e o motivo:

```sql
BEGIN;
WITH volta AS (
  SELECT ev.id AS evento, ev.lead_id, split_part(ev.auto_key, ':', 3) AS stage_since_antes
  FROM lead_events ev JOIN leads l ON l.id = ev.lead_id
  WHERE ev.auto_key LIKE 'a4:%'
    AND (ev.at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = DATE 'D'   -- o dia da rodada, AAAA-MM-DD
    AND l.stage = 8 AND l.lost_reason = 'não respondeu'
    AND l.stage_since = 'D'                                                              -- ninguém mexeu nele depois
), leads_de_volta AS (
  UPDATE leads l SET stage = 2, stage_since = v.stage_since_antes, lost_reason = NULL, reheat_at = NULL
  FROM volta v WHERE l.id = v.lead_id
  RETURNING l.id
), chave_livre AS (
  -- Libera a `auto_key`: sem isto, se a A4 for religada e mover o lead de novo, o evento novo não seria gravado (mesma chave).
  UPDATE lead_events ev SET auto_key = ev.auto_key || ':desfeito'
  FROM volta v WHERE ev.id = v.evento
)
INSERT INTO lead_events (id, lead_id, at, author_label, kind, text)
SELECT gen_random_uuid(), id, now() AT TIME ZONE 'UTC', 'Volta manual da A4', 'note', 'Volta da A4: <motivo>' FROM leads_de_volta;
-- confira o número de linhas antes de seguir; se não bater com a rodada (Automações → "Última rodada"), ROLLBACK;
COMMIT;
```

### Antes de ligar a 6 (A3): o quadro inteiro contra o teto de 15 s

A A3 lê o quadro inteiro do Freela (`GET /v1/admin/crm/pipeline`, sem período), e o cliente do Freela no Praça desiste em 15 s
(`freela-client.ts`, `TIMEOUT_MS`). Se o quadro passar disso, a A3 grava "falhou" de 2 em 2 horas e não faz nada (a tela Automações mostra
o erro; nada mais avisa). **Antes de ligar, meça uma chamada com a conta do Praça**, num terminal seu no EC2 (o token não passa pelo chat):

```sh
cd /opt/praca && set -a && . ./.env && set +a
T=$(curl -s -X POST "$FREELA_API_URL/v1/admins/login" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,os;print(json.dumps({"email":os.environ["FREELA_ADMIN_EMAIL"],"password":os.environ["FREELA_ADMIN_PASSWORD"]}))')" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["accessToken"])')
curl -s -o /tmp/quadro.json -w 'tempo %{time_total}s · %{size_download} bytes\n' -H "Authorization: Bearer $T" "$FREELA_API_URL/v1/admin/crm/pipeline"
python3 -c 'import json;d=json.load(open("/tmp/quadro.json"))["data"];print(sum(len(c["cards"]) for c in d["columns"]), "cartões")'
rm /tmp/quadro.json; unset T
```

Abaixo de ~5 s e de ~5 mil cartões, pode ligar. Acima disso, a A3 precisa antes de uma mudança (ler por período, com uma volta completa por
dia, ou um tempo de espera próprio para esta chamada).

### O que vigiar na 1ª rodada de A2, A3 e A4

As travas desses três trabalhos (a escrita só se o lead ainda estiver como foi lido, a marca de "já aplicado", a `auto_key` única) só
rodaram nos testes contra um banco de mentira. **A 1ª rodada em produção é o teste no banco de verdade.** Os erros mais prováveis falham para
o lado seguro (nada se move), mas olhe:

- **a rodada** em Automações ("Última rodada"): ok, as contagens e os erros;
  - A4: `perdidos` igual à contagem de "Antes de ligar a 4"; no dia seguinte, `perdidos` perto de 0;
  - A2: um evento de etapa por lead e por etapa-alvo; na hora seguinte, nenhuma etapa nova;
  - A3: `cartoes`, `ambiguos`, `criados`, `etapas`; na rodada seguinte (2 h depois), nenhuma etapa nova nos mesmos leads;
- **um evento de etapa por lead e por etapa** no dia (esta consulta tem de voltar vazia):

```sql
SELECT lead_id, stage_to, count(*) FROM lead_events
WHERE kind = 'stage' AND author_label IN ('Automático', 'Automático · Freela')
  AND (at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
GROUP BY lead_id, stage_to HAVING count(*) > 1;
```

- **a rodada seguinte da mesma chave** (1 h depois para a A2, 2 h para a A3, o dia seguinte para a A4): nenhuma etapa nova nos leads da
  anterior;
- **um lead que alguém volte de propósito** depois disso: o automático não pode empurrá-lo de novo.

Opcional e mais seguro para a A2 e a A4: rodar a chave uma vez numa cópia restaurada do backup do passo 1 (API local com `start:smoke`
apontando para um banco `praca_copia`, **sem** as variáveis `FREELA_*`; o relógio dispara em até 5 min). **A A3 nunca numa cópia:** ela
precisa da conta do Freela, e com a conta o motor de cadências e o outbox da cópia poderiam mandar WhatsApp de verdade.

## Decisões que tomei sem você (o desenho, §12, tem todas, com o porquê)

- As telas antigas ficam. O menu ganha "Tarefas" e "Automações", e "Ações" passou a "Ações da praça".
- **"Cliente ativo"** passa a ser quem tinha 2 ou mais vagas pagas na primeira leitura do Praça, ou quem voltou a contratar num dia
  depois da primeira vaga paga. Duas vagas no mesmo dia **não** contam.
- O lead que a busca cria fica **sem dono**. "Feito" numa tarefa de lead sem dono torna dono quem fez.
- **O 1º contato leva o lead a "Contatado", só com `CRM_TASKS_ENABLED`** (é o que "Contatado" quer dizer: o primeiro toque dado; e é o
  que faz a A4 alcançar esse lead). Com a chave, o "Feito" (Liguei, Mandei mensagem, Visitei) num lead em "Lead novo", na Entrada ou em
  Tarefas, grava o contato e o leva a "Contatado" na mesma hora, com o evento de etapa de quem fez; sem dono, quem fez vira dono. A linha
  da Entrada sai e não volta. Lead em "Perdido / reaquecer" só grava o contato. **Sem a chave**, o "Feito" da Entrada só grava o contato,
  como antes, mas a linha **fica** na fila com a marca "✓ Contato registrado hoje" (a marca vem do último contato do lead, então
  continua depois de recarregar e aparece para quem mais abrir a fila). Pergunta 2.
- O lead novo vindo do Freela leva o telefone do Freela (só o lead novo; nunca sobrescreve) e só entra se o cadastro for de depois do
  início da praça, na cidade da praça ou numa vizinha.
- O automático nunca volta uma etapa, nunca toca em lead arquivado ou de teste, e só tira de "Perdido" por um fato do mesmo dia da
  marcação ou posterior. Se alguém volta o cartão, ele não empurra de novo.
- As cadências-modelo continuam nascendo pausadas, e o motor de cadências não mudou.

## Perguntas para você (nada disto bloqueia a subida)

1. **"Valor estimado" do Funil:** é por mês ou por vaga? Hoje a tela diz "estimativa pela classificação" e explica a conta.
2. **O 1º contato leva a "Contatado"** (decisão acima, só com `CRM_TASKS_ENABLED`): concorda? E duas portas ainda deixam o lead em "Lead
   novo" depois do envio, mesmo com a chave: o "Feito" numa tarefa "Mandar mensagem" (disparo) e a fila de Mensagens. Elas gravam a
   mensagem como enviada, mas não mudam a etapa, e o lead segue na Entrada. Quer que a mensagem marcada como enviada também leve o lead
   a "Contatado"?
3. **Pílula "Tarefas" logo depois de "Dashboard" no celular?** (Hoje ela fica no grupo Comercial.)
4. **Lead criado direto em 5 ou mais e depois perdido** não entra na "Perda mensal", porque não há histórico de etapa. Tudo bem?
