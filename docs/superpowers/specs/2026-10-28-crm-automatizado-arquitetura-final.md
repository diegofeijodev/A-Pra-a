# CRM automático: revisão final de arquitetura (depois de implementar)

**Data:** 29/10/2026 · **Objeto:** branch `feat/crm-automatizado`, `9652376..855e6c3` (API idêntica em `38f4a6f`, que é o commit
de subida) · **Base:** a minha revisão de antes (`2026-10-28-crm-automatizado-arquitetura.md`, §1 achados 1–28 e §2 decisões),
o desenho §12, o contrato §47, o roteiro de subida, o ledger e o relatório da correção final. **Como foi feita:** só leitura do código e
do `api-freela` em `origin/main` (`getBoard`). Nada foi executado; os números de teste citados (jest 162/2457, smoke 923, smoke-crm 36,
browser-check 307/297) são os do ledger.

## Veredito

**A subida (merge + deploy com as cinco chaves desligadas) está aprovada; nada a bloqueia.** Com tudo desligado o relógio não consulta
o banco, `/v1/crm/*` dá 404 e a migração é aditiva. Mudam só as contas do Funil (§47.5) e de três indicadores (§47.7), que são
correções de conta e estão no roteiro.

Por chave:

| Chave | Situação |
|---|---|
| `CRM_TASKS_ENABLED` | pronta (depois de `TEAM_COMMERCIAL_ENABLED`) |
| `CRM_AUTO_LEADS_FROM_SEARCH_ENABLED` | pronta; conferir antes o aviso da cadência "Novo" (D4) |
| `CRM_AUTO_LOST_ENABLED` | **bloqueada** pelos achados 2 (uma condição a mais na regra) e 3 (contagem antes e volta escrita) |
| `CRM_AUTO_STAGES_ENABLED` | pronta, depois das pré-condições do Freela (conta + sync); vigiar a 1ª rodada (achado 5) |
| `CRM_FREELA_PIPELINE_ENABLED` | **bloqueada** pelos achados 1 (cadastro assistido não vinculado vira "cadastro próprio") e 4 (medir o tempo do quadro contra o teto de 15 s) |

A implementação seguiu a §2 da minha revisão quase ao pé da letra. Os desvios estão na §2 abaixo e todos são sólidos. O único desvio
que deixa um buraco é o da prova em banco real (achado 5), e ele não bloqueia nada: vira o que vigiar depois de ligar cada chave.

---

## 1. Conferência das decisões (§2 da revisão de antes)

| Decisão | Como ficou | Avaliação |
|---|---|---|
| §2.1 Cinco chaves, padrão `false`, módulo global, `@Optional() @Inject(CRM_FLAGS)` por último | `common/flags/crm.flags.ts`, `env.validation.ts`, compose de dev, `.env.example`; `features` só `crm_tasks` e `crm_auto_leads` (`rotas-equipe.controller.ts`) | igual |
| §2.2 Fronteiras | só o `AppModule` importa `CrmModule`; `crm/` importa `RotasModule`, `FreelaClientModule`, `GeoModule` (folhas); `places/` e `campo/` leem só `common/flags` e `domain/`; `CartaoFreela` em `domain/freela-cartao.ts` (domínio sem `modules/`) | igual |
| §2.3 A1 sem ciclo | `concluir()` devolve `boolean`; gancho depois dele com `try/catch` próprio (`places-search.service.ts:668-677`); `adicionarSozinho` (`:694`) usa o MESMO `adicionar`, `distance_m` crescente, teto, `NOTHING_TO_ADD` e conflito como na revisão; rodada gravada pelo Prisma; `criarLeadsDeBusca` com `opcoes` + spec de caracterização | igual |
| §2.4 `subirEtapaAutomatica` | `EtapasAutomaticasService.subir()` (`etapas-automaticas.service.ts:130-171`): decisão pura (`deveAplicar`) relida na transação, guarda inteira no `where`, sai do 8 limpando `lost_reason`/`reheat_at`, marca `auto_stage_applied`, "visto satisfeito" | igual, com uma melhora (§2) |
| §2.4 A2 fora do `processarItem` | passada local sobre `field_signups`; o sync só ganha o `since` mais largo e, depois da correção I2, deixa em paz o lead voltado de 5–7 | igual (depois do I2) |
| §2.5 A3 | ordem de casamento id → cadastro → telefone com DDD/cidade, ambíguos, cartões disputados, assistido nunca → 5, D2 com `dia_viu_primeira`, `FATO_SEM_DIA` para a 1ª observação não tirar do 8, lead novo com trava por usuário + a do formulário, escrita só do que mudou, de 2 em 2 h | igual, com o buraco do achado 1 |
| §2.6 Migração | `20261109100000_crm_automatico`, aditiva, sem `DROP INDEX`, os índices pedidos, `auto_key` UNIQUE normal | igual |
| §2.7 Contrato §47 | §47.1–§47.7 batem com o código (201 do `done`, zeros na praça desconhecida, A1 como gancho, A4 com 60 min depois de falha, limpeza com qualquer chave) | igual |
| §2.8 Relógio único | `CrmScheduler` a cada 5 min, "bate e decide", 1º tique da hora-alvo, A4 decidida pela rodada ok do dia no banco, cada trabalho com `rodando` e `try/catch` | igual |
| §2.8 Testes | regras puras primeiro, serviços com Prisma falso, specs congelados intactos, caracterização do `criarLeadsDeBusca` | igual; **o `smoke-crm.sh` não prova as guardas de A2/A3/A4 no banco** (achado 5) |

Achados de antes: 1–28 resolvidos como pedido. Ressalvas: o 3 ficou incompleto (achado 1 abaixo); o 2 ficou sem a separação automático ×
manual no resumo (achado 11); o 27 virou o achado 5.

## 2. Desvios e se são sólidos

1. **Evento por `createMany({ skipDuplicates: true })` em vez de `create` + captura do P2002** (`etapas-automaticas.service.ts:73-76`).
   Melhor que o que eu pedi: no Postgres o INSERT que falha aborta a transação, e a minha versão faria o COMMIT virar ROLLBACK. Sólido.
2. **A2 com alvo 5 nunca sobe lead abaixo de 5 (I2a) e o sync pula o lead voltado de 5–7 (I2b).** Restaura o que a §2.4 dizia ("o 5
   abaixo de 5 é do sync"). A faixa 5–7 do I2b, e não `>= 5`, está certa: com o 8 incluído, o lead perdido pela A4 e reaquecido à mão
   nunca mais ganharia o 5. Sólido.
3. **Indicadores com `jaFoiCliente` pelos eventos com `stage_to` 5–7 (I4).** A receita literal do achado (`stageEnteredAt(l, 5)`) contaria
   todo perdido, porque cai em `stage_since` quando `stage >= 5`. O desvio é o certo. O efeito (perdido sem histórico não conta) está na
   pergunta 5 do roteiro.
4. **Regra D2 refinada** (`crm-quadro-rules.ts:136-148`): 2+ vira 7 na 1ª observação ou quando o Praça vê a contagem subir num dia
   posterior ao da 1ª. Fecha o caso "duas funções no mesmo evento" nas rodadas seguintes. A 1ª observação com 2+ ir direto a 7 é decisão
   registrada (roteiro, "Decisões"). Sólido.
5. **`nao_configurado` gravado como `ok: true` com a marca no `summary`**, e o resumo e o `last_7d` ignorando essa rodada. Sólido.
6. **Trava do formulário (`<praca>:<phone_key>`) também na criação da A3.** Evita duplicata com o formulário público. Sólido.
7. **Limpeza das rodadas fora da A4 (I3)**, uma vez por dia, com qualquer chave de trabalho ligada. Sólido.
8. **`smoke-crm.sh` só com as chaves de leitura** (`smoke-crm.sh:9-11`). O motivo é certo (o relógio rodaria A2/A3/A4 no banco de dev e
   perderia os leads do seed), mas a prova no banco real que a §2.8 pedia ficou faltando. Ver achado 5.

---

## 3. Achados

Formato: **[severidade] onde: o problema, por que importa, a correção.**

### Bloqueiam ligar uma chave

**1. [bloqueia ligar `CRM_FREELA_PIPELINE_ENABLED`] Cadastro assistido não vinculado é tratado como cadastro próprio.**
`quadro-freela.service.ts:407-418`: a consulta de `field_signups` filtra `match_status: 'linked'` e é dela que sai o
`idx.assistidos`. Um cadastro do representante com `match_status` `none` (o sync não achou lead) ou `ambiguous` (achou dois ou mais)
não entra em `assistidos`. Esse `userId` passa então por cadastro próprio: em `:204` vira **lead novo em "Cadastrado"** e em `:252`
recebe o alvo 5. Isso acontece antes da ativação, que é justamente o que o achado 3 e o §12.1 item 3 proíbem. No caso `ambiguous`, ainda
pode criar um 3º lead para a empresa (a A3 não casa por CNPJ, e o sync às vezes casa). O roteiro manda isso para o dono (pergunta 3),
mas o padrão de hoje contraria uma decisão já aceita.
*Correção (pequena):* ler `field_signups` do lote **sem** o filtro de `match_status`. Todo `freela_user_id` que aparece ali entra em
`assistidos`; só o `linked` com lead vivo entra em `porCadastro`. Teste: cadastro `none` e cadastro `ambiguous` de BH não criam lead e
não recebem o 5. Se o dono quiser o lead dessas empresas, que nasça só com vaga paga (alvo 6), como opção explícita depois.

**2. [bloqueia ligar `CRM_AUTO_LOST_ENABLED`] A A4 não confere quanto tempo o lead está NA etapa 2.**
`crm-etapas-rules.ts:42-59` usa `stalled_days` = `stalledDays()` (`lead-rules.ts:50-51`), que conta desde o último contato em qualquer
etapa. Só cai em `stage_since` quando não houve contato nenhum. Exemplo: um lead da Entrada recebeu "Feito" há 40 dias e ficou em
"Lead novo". Esse é o comportamento de hoje (pergunta 2 do roteiro): o contato fica gravado e o lead continua na etapa 1. Alguém o arrasta
para "Contatado" hoje e, amanhã às 06:10, ele vira Perdido. Isso contraria o que o roteiro promete ("21 dias sem resposta em
Contatado"). **O erro é meu, não do implementador:** a correção do achado 10 da revisão de antes pediu literalmente
`stalledDays(lead, hoje) >= 21` e esqueceu de exigir o tempo NA etapa 2. O código fez o que foi pedido.
*Correção (uma linha + teste):* em `candidatoSemResposta`, exigir também `daysBetween(stage_since, hoje) >= DIAS_SEM_RESPOSTA`. O
`updateMany` já leva o `stage_since` lido, então a guarda continua atômica.

**3. [bloqueia ligar `CRM_AUTO_LOST_ENABLED`: passo, não código] A 1ª rodada não tem teto, prévia nem volta.**
A primeira rodada move de uma vez todo lead da etapa 2 que casa com a regra, em todas as praças. O Comercial está escondido em produção e
ninguém registra contato pelo Praça, então a contagem pode ser grande. O roteiro (linha 55) diz "olhe na tela quantos leads estão em
Contatado parados", mas nenhuma tela mostra esse número com a regra da A4.
*Antes de ligar:*
- **Contagem** (só leitura, em produção, aproximada; a exata é rodar a A4 numa cópia do backup do passo 1, sem as variáveis do Freela).
  Já inclui a condição do achado 2:
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
- **Volta escrita no roteiro:** a `auto_key` guarda o `stage_since` de antes (`a4:<lead>:<YYYY-MM-DD>`, `sem-resposta.service.ts:149`).
  Por isso uma rodada inteira se desfaz por SQL: lead ainda em 8 com `lost_reason = 'não respondeu'` e evento `a4:%` do dia D →
  `stage = 2`, `stage_since = split_part(auto_key, ':', 3)`, `lost_reason = NULL`, `reheat_at = NULL`, e um evento `note` "Volta da A4
  (motivo)" para a auditoria.
- **Ordem:** trocar os passos 3 e 4 do roteiro. A A1 só cria leads novos e tem "Desfazer importação"; a A4 mexe em leads existentes.
  Ligar a A4 depois que a equipe usar Tarefas por algumas semanas, ou com a contagem aceita pelo dono.

**4. [bloqueia ligar `CRM_FREELA_PIPELINE_ENABLED`: passo] O quadro inteiro contra o teto de 15 s.**
`getBoard` sem `from/to` (api-freela `crm-pipeline.service.ts:129+`) lê todo contratante ativo dos dois módulos, agrupa as vagas e procura
quem já recebeu mensagem. O `FreelaClient` aborta em 15 s (`freela-client.ts:83`). Se o quadro passar disso, a A3 grava `ok: false` com
`FREELA_UNREACHABLE` de 2 em 2 horas e não faz nada. A tela Automações mostra o erro, mas nada avisa.
*Antes de ligar:* no servidor, num terminal do dono (o token não passa pelo chat), medir uma chamada `GET /v1/admin/crm/pipeline` com a
conta do Praça: tempo, tamanho e número de cartões. Abaixo de ~5 s e de ~5 mil cartões, pode ligar. Acima disso, vale a saída da
revisão de antes (achado 14): `from` + uma volta completa por dia, ou um timeout próprio para esta chamada.

### Não bloqueia; vigiar ao ligar

**5. [vigiar na 1ª rodada de A2, A3 e A4] As guardas atômicas dos trabalhos do relógio só rodaram contra Prisma falso.**
Ficaram fora do banco real (só com o Prisma falso):
- o `where` de `subir()` com `OR`/`AND`/`null`;
- a "visto satisfeito";
- o `updateMany` otimista da A4;
- as travas consultivas;
- o `createMany … skipDuplicates`.

O `smoke-crm.sh` prova no banco o 404, o `done` e o índice único de `auto_key`, e não liga A2/A3/A4 (`smoke-crm.sh:9-11`). O browser-check
também não. A A1 tem risco baixo: usa o código do "Adicionar", que roda em produção, e a caracterização congela o caminho sem `opcoes`.
Para A2/A3/A4, **a 1ª rodada em produção é o teste em banco real**. Os erros mais prováveis do `where` falham para o lado seguro
(`count = 0`, nada move), mas é preciso olhar:
- a linha da rodada em `crm_automation_runs` (Automações → "última rodada": `ok`, contagens, `erros`);
- os eventos do dia com `author_label IN ('Automático', 'Automático · Freela')`, por lead: **um** evento de etapa por lead e por alvo;
- a rodada seguinte da mesma chave (1 h depois para A2, 2 h para A3, A4 no dia seguinte): **zero** etapa nova nos leads da anterior
  (prova da marca `auto_stage_applied` e da `auto_key`);
- um lead que alguém volte de propósito depois disso: não pode ser empurrado de novo.

Opcional e mais seguro para A2 e A4: rodar a chave uma vez numa cópia restaurada do backup do passo 1 (API local com `start:smoke`
apontando para um banco `praca_copia`, **sem** as variáveis `FREELA_*`; o relógio dispara no 1º tique, em até 5 min). A A2 só lê
`field_signups` do banco e a A4 não fala com o Freela, então a cópia sem conexão prova as duas e não manda nada para fora. **A A3 não deve
rodar numa cópia:** ela precisa da conta do Freela, e com a conta o motor de cadências e o outbox da cópia poderiam mandar WhatsApp de
verdade (inclusive os `msg_sends` pendentes vindos de produção). A A3 se prova em produção, com a vigilância desta lista.

### Podem esperar

**6. [pode esperar] Corrida estreita do I2(a)** (`etapas-automaticas.service.ts:222-245`). A passada lê o lead fora da transação. Se
alguém o voltar de 5 para 3 nessa janela, o `subir()` relê, vê "3 < 5, marca nula" e sobe de novo. Isso acontece uma vez só, porque a
marca passa a cobrir o 5. *Correção:* opção `so_saida_do_perdido` no `subir()` para o alvo 5 da A2 (o `where` vira `stage: 8` em vez do `OR`).

**7. [pode esperar] A4 com um lead que sempre falha repete o dia inteiro** (`crm.scheduler.ts:73-87`, `sem-resposta.service.ts:100`).
`erros > 0` grava `ok: false`. O dia não fecha e a A4 relê todos os leads da etapa 2 a cada 60 min até 23:55. Não estraga dado (é
idempotente), só gasta. *Correção (sem mudar o sentido de `ok`):* o relógio passa a contar as tentativas do dia (qualquer rodada
`sem_resposta`, ok ou não) e para depois de um teto, por exemplo 3.

**8. [pode esperar] `cadence_send` "usa" o lead** (`crm-tarefas-rules.ts:148-170`). Um lead com mensagem de cadência hoje (só leitura,
sem "Feito") esconde a tarefa acionável dele, como `next_step` ou `hot_visit`, e sai das contagens. Está documentado, mas inverte a
prioridade para quem opera. *Correção:* `cadence_send` não marca o lead como usado.

**9. [pode esperar] Avisos de Automações só cobrem A1 + cadência "Novo"** (`automacoes.service.ts:105`). Faltam dois:
- A4 ligada + cadência de reaquecimento (`reheat_due`) não pausada no modo Via Freela: cada perdido recebe mensagem automática 30 dias
  depois;
- A3 ligada + cadência `first_vaga` não pausada: risco de mensagem dupla com o painel do Freela (achado 19 de antes).

São duas linhas no mesmo padrão.

**10. [pode esperar] Acoplamentos pequenos:**
- `sem-resposta.service.ts:20` importa `PARA_LISTA` de `leads/leads.service` (detalhe interno de outro módulo); mover para um `select`
  próprio;
- `crm.module.ts:23` exporta três serviços que ninguém importa; tirar;
- `automacoes.service.ts:71` roda `validateEnv(process.env)` a cada request; ler uma vez no construtor.

**11. [pode esperar] A1: rede de segurança e resumo.**
- O "Desfazer importação" (`imports.service.ts:368-394`) não apaga lead com parada de roteiro. Como a A1 alimenta os roteiros do campo
  sozinha (achado 17), essa janela de 24 h encolhe quando o roteiro automático do dia seguinte pega os achados. Vale uma frase no cartão
  da A1.
- O resumo do dia não separa lead da A1 de lead do "Adicionar" (mesma origem `pesquisa automática`; a separação ficou só nas contagens
  de Automações). Se o dono pedir, a parte "busca" do `leads_novos` se divide pelo `author_label` do evento de criação.

**12. [pode esperar] Custo, ok na escala de hoje, medir depois da A1:**
- a A2 lê todos os `field_signups` vinculados de hora em hora, sem paginação (`etapas-automaticas.service.ts:182`);
- `leadsVoltadosDoCinco` roda a cada rodada do sync, de 10 em 10 min (`signup-sync.service.ts:114-121`);
- o resumo varre `lead_events` por `at`, que não tem índice próprio (`resumo.service.ts:50`);
- Tarefas carrega todos os leads da praça a cada 60 s por aba aberta (`tarefas.service.ts:61`).

Com a A1 trazendo até 300 leads por busca, o último é o primeiro a pesar.

**13. [pode esperar] Consequências aceitas do I2, para o dono saber:**
- lead com histórico 5–7 nunca mais ganha o 5 do sync, nem por um cadastro novo, de outro usuário, meses depois (`signup-sync.service.ts:305`);
- cadastro assistido confirmado há mais de 45 dias, sem serviço, com o lead abaixo de 5, não sobe a 5 por ninguém. A A3 só lhe dá 6/7.

### Notas de subida (não bloqueiam)

- O working tree tem 6 arquivos reformatados por um formatador externo (quebra de linha, fora do CRM). O roteiro monta a API por
  `git archive 38f4a6f`, e `38f4a6f..855e6c3` não muda nada em `api/` nem `web/`: está certo. Acrescentar ao roteiro: nunca
  `git add -A` neste working tree.
- Produção do Praça usa `env_file: .env` (`docker-compose.prod.yml:34`), então as chaves novas não precisam de linha no compose de
  produção. Isso é o contrário da regra do api-freela; vale escrever no roteiro para ninguém "corrigir".
- `CREATE UNIQUE INDEX` em `lead_events.auto_key`: trava curta, sobre coluna vazia, instantânea nesta escala.

---

## 4. O que está bom

- **Fronteiras limpas, de verdade.** Nenhum `import` de `crm/` fora do `AppModule`. `places` e `campo` só leem `common/flags` e
  `domain/`. O tipo do cartão do Freela mora no domínio, sem o domínio importar `modules/`. O A1 grava a sua rodada pelo Prisma em vez de
  importar o helper do `crm/`.
- **Um só lugar move etapa por fato** (`subir()`), com a decisão pura (`deveAplicar`) testada à parte e a mesma guarda repetida no
  `where`. Leitura fora da transação só para não abrir transação à toa (`precisaEtapa`).
- **Caso de perda de dado fechado:** sair do 8 limpa `reheat_at` (achado 5); a marca impede brigar com gente (achado 4);
  `FATO_SEM_DIA` impede a 1ª observação de tirar alguém de Perdido; o vínculo recusado na A3 aborta a escrita (I1); A4 com
  `last_contact_at` no `where` otimista (M1) e a mesma trava do `autoEnroll`.
- **Casamento conservador:** na dúvida é ambíguo e nada é gravado, nunca por nome; DDD obrigatório; cidade com UF; praça sem
  `cobertura_ibge` não gera lead (M4).
- **Idempotência pelo banco** (`auto_key` UNIQUE + `ON CONFLICT DO NOTHING`), não por memória do processo.
- **Relógio robusto:** um `@Cron`, nada é lido com as chaves desligadas, a A4 sobrevive a reinício pela tabela de rodadas, nenhum erro
  sai do `@Cron`, e o log leva só o nome da classe (sem telefone).
- **Telefone do Freela só no lead novo** (D3); `summary` e `error` só com contagens e erro saneado; `error` só para admin.
- **Specs congelados intactos** (`signup-sync.service.spec.ts`, `places-search.service.spec.ts`, `*caracterizacao*`); caracterização nova
  para `criarLeadsDeBusca`; cada correção da revisão final com RED → GREEN registrado.
- **Roteiro de subida honesto:** diz o que muda com tudo desligado, tem volta, ordem por chave e o custo do sync com a A2.

## 5. Antes de ligar cada chave (resumo)

| Chave | Antes | Depois da 1ª rodada, olhar |
|---|---|---|
| `TEAM_COMMERCIAL_ENABLED` → `CRM_TASKS_ENABLED` | nada | Tarefas e Automações abrem; o browser-check já cobriu |
| `CRM_AUTO_LEADS_FROM_SEARCH_ENABLED` | Automações sem aviso (cadência "Novo" pausada ou modo `fila`) | a rodada `auto_leads_busca` da 1ª busca: `adicionados`, `ja_na_praca`; o lote "Busca automática …" na Entrada |
| `CRM_AUTO_LOST_ENABLED` | achado 2 corrigido; contagem do achado 3 aceita pelo dono; SQL de volta no roteiro | `perdidos` igual à contagem; no dia seguinte, `perdidos` ≈ 0 |
| `CRM_AUTO_STAGES_ENABLED` | conta do Freela + `FIELD_SIGNUP_SYNC_ENABLED` + `FIELD_ASSISTED_SIGNUP_ENABLED` no Freela | achado 5 (um evento por lead e alvo; a hora seguinte sem etapa nova) |
| `CRM_FREELA_PIPELINE_ENABLED` | achado 1 corrigido; tempo do quadro medido (achado 4) | `cartoes`, `ambiguos`, `criados`, `etapas`; achado 5 na rodada seguinte (2 h) |
