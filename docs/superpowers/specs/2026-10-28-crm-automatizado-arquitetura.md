# CRM automático — revisão de arquitetura (antes de implementar)

**Data:** 28/10/2026 · **Objeto:** `docs/superpowers/specs/2026-10-28-crm-automatizado-design.md` (commit `a33f2f1`, branch
`feat/crm-automatizado`) · **Como foi feita:** só leitura do código (API, web, schema, migrações) e do `api-freela` em `origin/main`
(`crm-pipeline.service.ts`, `crm-pipeline.controller.ts`, `admins-consultant-registrations.controller.ts`,
`assisted-registration.service.ts`). Nada foi executado (sem jest, tsc, build ou servidor).

> Nota de passagem: o branch tem um diff NÃO commitado em `api/src/common/__tests__/ui-flags-contrato.spec.ts` que é só
> reformatação (quebra de linhas). Não é desta revisão; decidir antes da 1ª tarefa (commitar à parte ou descartar).

## Resumo

O desenho está no rumo certo (tudo atrás de chave desligada, tarefas calculadas na leitura, Freela só leitura), mas tem **quatro
afirmações que o código desmente** (T1 não vê mensagem de cadência; A1 não fica "sem dono" pelo caminho do "Adicionar"; o quadro
do Freela põe em "Cadastrado" a empresa do cadastro assistido ANTES de ela ativar; "Feito" não faz a T5 sumir) e **três riscos de
dado altos** (o automático brigando de hora em hora com quem moveu o cartão para trás; casamento por telefone de 9 dígitos sem
DDD em todas as praças; tirar de "Perdido" sem limpar `reheat_at`, que põe cliente na trilha de reaquecimento). Também: o A2, do
jeito que está, quase nunca dispara a etapa 6, porque o sync não relê o cadastro depois de confirmado. Todos têm correção pequena,
descrita abaixo. As decisões em aberto estão na §2 e a ordem das tarefas na §3.

---

## 1. Achados

Formato: **[severidade] onde — o problema — por que importa — correção.**

### Altos

**1. [alta] T1 não enxerga as mensagens das cadências no modo "Fila manual".**
`cadences/cadence-engine.service.ts:462-496`: no modo `fila` a cadência grava o envio já como `status: 'enviada'`, com `sent_at`
(o horário da janela), o evento `msg_out` e `last_contact_at` — "a mensagem já conta como enviada… é o operador que copia e manda
de fato". Só o modo `freela` deixa `status: 'fila'`. Quem cria `msg_sends` com `mode: 'fila'` + `status: 'fila'` é o **disparo**
(`disparos/disparos.service.ts:262-271`). Logo a promessa do §1 item 3 ("no modo Fila manual a mensagem vira tarefa") é falsa para
cadência, e a regra T1 do §3 A5 só pega mensagens de disparos.
*Correção:* T1 = `msg_sends` com `disparo_id IS NOT NULL`, `mode = 'fila'`, `status = 'fila'`, `scheduled_at` < início de amanhã
(Brasília), lead da praça, um item por lead (o envio mais antigo). As mensagens de cadência do dia no modo `fila` entram como grupo
SÓ de leitura ("Mensagens das cadências de hoje", `cadence_id IS NOT NULL`, `mode = 'fila'`, `sent_at` no dia), com "Abrir
WhatsApp" e **sem** "Feito" (o motor já as registrou). Mudar o motor para gravar `status: 'fila'` é outra mudança, com chave
própria e decisão do dono (§4, D6) — não misturar neste lote. Registrar no desenho que, no modo `fila`, a cadência conta contato
mesmo que ninguém mande (isso afeta A4 e T4).

**2. [alta] A1 "sem dono" e "autor Automático" não acontecem pelo caminho do "Adicionar".**
`imports/imports.service.ts:277-280` chama `poolDeDonos` em **rodízio** sobre todos os `users.active` (admins incluídos;
`NO_OWNERS` se não houver ninguém); `:315` grava `import_batches.by = user.id` (`String @db.Uuid` não nulo) e `:327` grava cada
evento com `author_id: user.id`. O A1 não tem usuário, e o desenho não diz quem é o `by` nem como o dono fica nulo.
Além disso, a origem `pesquisa automática` **já é** a do "Adicionar" manual (`places-search.service.ts:46`), então ela não separa
automático de manual no resumo.
*Correção:* `criarLeadsDeBusca(tx, input, user, opcoes?)` ganha `opcoes = { sem_dono?: true; autor_label?: string }`. Ausente = o
de hoje, byte a byte (teste de caracterização). No A1: `user = { id: run.requested_by }` só para `import_batches.by` (quem pediu a
busca), `sem_dono: true` (`owner_id` nulo, sem `poolDeDonos`), eventos com `author_id: null` + `author_label: 'Automático'`,
rótulo do lote "Busca automática dd/mm · área (OSM)". A separação automático × manual no resumo vem do `author_label` do evento de
criação, não da origem. (Dono: §4, D1.)

**3. [alta] O quadro do Freela põe em "Cadastrado" a empresa do cadastro assistido antes de ela ativar a conta.**
No Freela, o cadastro assistido cria o `bRContractor` já com `isActive: true` (`assisted-registration.service.ts:204-226`) e o
`getBoard` lista todo contratante ativo. Com a regra "cartão existe → no mínimo 5", a A3 sobe o lead da visita para 5 no minuto em
que o representante cria a conta (o telefone digitado na visita casa pelo passo 3), passando por cima da `confirmation_rule`
(padrão `activated`) que o `signup-sync` respeita (`signup-sync.service.ts:270-292`) e que o time vê em "cadastros confirmados".
*Correção:* para `userId` que o Praça conhece como cadastro assistido (`field_company_signups.freela_user_id` ou `field_signups`
com `match_status = 'linked'`), a A3 **não** aplica o alvo 5; o 5 continua do sync pela regra vigente. A A3 só aplica 6/7 (pelas
contratações) a esses. Para os demais (cadastro próprio), "cartão existe → 5" vale.

**4. [alta] O automático briga de hora em hora com quem moveu o cartão para trás.**
A guarda proposta é "só para a frente" (`stage < alvo`), avaliada a cada rodada sobre o ESTADO. Se alguém da equipe volta um lead de
5 para 3 (casamento errado, empresa que não é essa) ou marca como Perdido, a próxima rodada da A3 (ou do A2) sobe de novo e grava
outro evento — 16 vezes por dia. O `move()` manual (`leads.service.ts:311-358`) não deixa marca que o automático possa respeitar.
*Correção:* coluna `leads.auto_stage_applied Int?` = maior alvo que o automático (A2/A3) já aplicou **ou já viu satisfeito**. Regra
pura `deveAplicar(lead, alvo, fato)`: aplica só se `alvo > (auto_stage_applied ?? 0)`; ao aplicar, ou ao ver o lead já na etapa
≥ alvo, grava `auto_stage_applied = alvo`. Para etapa 8 vale também: o fato tem de ser do mesmo dia ou depois de `stage_since`
(perdido marcado DEPOIS do cadastro é decisão de gente e fica). Assim cada fato move o lead uma vez só. Efeito esperado ao ligar a
chave pela primeira vez: lead que alguém já tinha voltado para trás (marca nula) é empurrado UMA vez; aparece na contagem da rodada
em Automações.

**5. [alta] Tirar de "Perdido" sem limpar `reheat_at` põe cliente na trilha de reaquecimento.**
O `move()` limpa `lost_reason` e `reheat_at` em todo destino ≠ 8 (`leads.service.ts:345-351`). A entrada `reheat_due` do motor é
`reheat_at <= hoje` **sem filtro de etapa** (`cadence-engine.service.ts:222-225`), e a saída `reaquecer_30/60` grava `reheat_at`
em qualquer etapa (`:532-541`). A guarda de hoje é `stage: { lt: 5 }` (`signup-sync.service.ts:276`) e `leadDeveSubir` exclui a 8
de propósito (`signup-sync-rules.ts:167-170`).
*Correção:* uma função única `subirEtapaAutomatica(tx, …)` (§2.4) usada por A2 e A3: `updateMany` com
`OR: [{ stage: { lt: alvo } }, { stage: 8 }]`, `archived: false`, `is_test: false` e a guarda do achado 4 no `where`; `data`
com `stage`, `stage_since = todaySp(agora)`, `lost_reason: null`, `reheat_at: null`, `auto_stage_applied`. `leadDeveSubir` e o
caminho de hoje do sync não mudam.

**6. [alta] Casamento por telefone de 9 dígitos, sem DDD, em todas as praças.**
`phoneKey` = últimos 9 dígitos (`common/phone/phone.ts:4`): o mesmo celular em DDDs diferentes colide, e `leads.phone_key` tem
`@default("")`. O `signup-sync` só casa por telefone dentro das praças do consultor e exige 10+ dígitos e chave de 9
(`signup-sync.service.ts:298-307`); a A3 casaria contra a base inteira, e um casamento errado vira `freela_user_id` gravado e etapa
5–7 para sempre (o automático nunca volta). As memórias de 24/10 lembram que o telefone do Freela às vezes é de outra pessoa.
*Correção:* passo 3 só com telefone do cartão de 10–11 dígitos nacionais e chave de 9; candidato = lead não arquivado, não teste,
com a mesma chave **e** (mesmo DDD+número completo **ou** lead numa praça cuja cobertura casa com a cidade/UF do cartão). 0 = sem
casamento; 2+ = ambíguo (conta na rodada). Também ambíguo: dois cartões apontando para o mesmo lead na mesma rodada, e lead que já
tem outro `freela_user_id`. O passo 2 (`field_signups`) também pode dar 2 leads (o UNIQUE é `(consultant_id, freela_user_id)`):
2+ = ambíguo. O evento do lead diz por onde casou ("casado pelo telefone").

**7. [alta] A2, como está, quase nunca sobe para 6.**
O sync relê um cadastro só enquanto ele cai no `since` (`escolherDesde`, `signup-sync-rules.ts:112-118`): 1 dia antes do
watermark, ou até o mais antigo **sem o evento da regra** (`signup-sync.service.ts:118-128`). Com a regra padrão `activated`, o
cadastro ativado sai da releitura em ~1 dia; o `firstJobCompletedAt` que chega semanas depois não é gravado em `field_signups`.
O desenho "estende o sync que já existe" sem tocar nisso.
*Correção:* com `CRM_AUTO_STAGES_ENABLED`, o sync passa a `escolherDesde` o mínimo entre o mais antigo sem o evento da regra e o
mais antigo sem `first_job_completed_at` (sempre preso ao piso da janela, 45 dias). Desligada, nenhuma consulta a mais. Depois dos
45 dias, quem cobre é a A3 (contratações). `escolherDesde` não muda; muda só o argumento que o serviço passa.
*Custo:* com a chave, quase sempre há cadastro sem serviço concluído nos últimos 45 dias, então o `since` fica no piso em toda
rodada (a cada 10 min) e o sync passa a reler a janela inteira de cada consultor. É limitado por `MAX_PAGINAS_POR_CONSULTOR = 25`
× 200 e pelo corte no 429 que já existem, e já acontece hoje quando há cadastro pendente; com a chave vira o caso comum. Por isso o
alargamento é **opcional**: a A3 dá o 6 mesmo sem ele. Recomendo fazer (tarefa 6) e medir; se pesar, tirar e deixar o 6 com a A3.

**8. [alta] A1 com a cadência "Lead novo" ligada vira disparo frio em massa.**
A entrada `stage_novo` é `{ stage: 1 }` para todo lead não arquivado, não teste (`cadence-engine.service.ts:169-183, 220-221`). A1
cria até 300 leads em etapa 1 por busca; um play na cadência-modelo (um clique) e, no modo `freela`, saem mensagens sozinhas para
números do OSM (muitos fixos ou vazios), pelo chip de campanhas do Freela. Hoje quem filtra é a pessoa que escolhe os achados.
*Correção (sem mexer no motor):* a tela Automações mostra o aviso quando A1 está ligada e existe cadência `stage_novo` não pausada
(`warnings` em `GET /v1/crm/automations`), e a decisão de ligar os dois juntos fica registrada como do dono (§4, D4). O teto por
busca não resolve (achado 16).

### Médios

**9. [média] "Feito" não faz a T5 sumir; e "Feito" com `note` não faz nenhuma de T2/T4/T5 sumir.**
A T5 é "etapa 5 há 3+ dias, sem 1ª vaga, sem contratação": registrar contato não muda nada disso, então a tarefa fica até a vaga.
E `note` não é contato (`leads.service.ts:367-375`, `CONTACT_KINDS`), logo não mexe em `last_contact_at`.
*Correção:* T5 ganha "e sem contato da equipe nos últimos 3 dias" (volta depois de 3 dias se a vaga não sair). `done` aceita só
`call | msg_out | msg_in | visit`; nota avulsa é o "Adiar".

**10. [média] A4: inscrição `aguardando`, adiado e próximo passo futuro.**
O desenho exclui só inscrição `ativo`. `aguardando` é quem vai entrar na trilha (`cadence-engine.service.ts:577-616`). Lead com
`snooze_until` futuro ou `next_step_date >= hoje` tem gente cuidando. A corrida com a matrícula automática existe.
*Correção:* candidato = etapa 2, não arquivado, não teste, `stalledDays(lead, hoje) >= 21` (reuso de `domain/lead-rules.ts`, a
mesma conta do funil e do sino), sem inscrição `ativo|aguardando`, sem `snooze_until > hoje`, sem `next_step_date >= hoje`. Por
lead, numa transação: `pg_advisory_xact_lock(hashtext('cadence-enroll:' || id))` (a MESMA trava do `autoEnroll`, `:195`), relê as
inscrições, `updateMany` com `stage: 2, stage_since: <lido>` no `where`, `lost_reason: 'não respondeu'`,
`reheat_at = addDays(hoje, 30)` (igual ao `move()`, `:345-350`) e o evento com a conta.

**11. [média] A4 e A2 debaixo da mesma chave.**
A2 só promove por fato do Freela; A4 rebaixa para Perdido por silêncio. São riscos diferentes, e o §10.10 do desenho diz "para
ligar por partes". *Correção:* `CRM_AUTO_LOST_ENABLED` própria para a A4 (5 chaves no total, §2.1).

**12. [média] Resumo: "mudança de etapa" e "automático × equipe".**
A visita muda etapa com `kind: 'visit'` + `stage_to` (`campo/visits.service.ts:486-497`); a saída `sai_conversa` grava
`kind: 'stage'` **sem** `stage_to` quando não sobe (`cadence-engine.service.ts:520-528`). Contar por `kind = 'stage'` erra para
os dois lados. E `author_id` nulo não quer dizer máquina: a visita é humana com `author_id` nulo e `author_label: 'Consultor: …'`.
*Correção:* mudança de etapa = evento com `stage_to IS NOT NULL`. Autoria por função pura `autoriaDoEvento(author_id,
author_label)` → `equipe` (author_id não nulo) · `representante` (rótulo começa com `Consultor: `) · `formulario` (`Formulário`) ·
`cadencia` (`Cadência`) · `automatico` (`Automático`, `Automático · Freela`, `Freela (sincronização)`). Rótulos num só lugar
(`domain/catalog/crm.ts`). Eventos novos: A1 e A4 = `Automático`; A2 e A3 = `Automático · Freela` (o sync de hoje segue
`Freela (sincronização)`).

**13. [média] Cidade da A3: `vizinhas` não tem UF; praça sem cobertura.**
`pracas.vizinhas` guarda só nomes (`pracas/pracas.service.ts:266-273`); `cobertura_*` são nulos na praça criada sem cobertura. Nome
de cidade se repete entre estados; o raio usado na criação não é gravado.
*Correção:* o conjunto (cidade normalizada, UF) da praça vem de `cobertura_cidade/cobertura_uf` + cada nome de `vizinhas` resolvido
pelo `GeoService` (o município com esse nome mais perto de `cobertura_ibge`, até 100 km). Praça sem `cobertura_ibge` não gera lead
pela A3 (só casa por telefone/ids). Praça "aberta" = `start_date <= hoje <= end_date`; o dia do cadastro é `todaySp(registeredAt)`
(instante → dia de Brasília), nunca a string ISO cortada.

**14. [média] Custo da A3: quadro inteiro de hora em hora e escrita em todo lead casado.**
`getBoard` sem `from/to` lê todos os contratantes ativos dos dois módulos, agrupa as vagas e devolve
`{ data: { columns: [{ stage, cards }], totalContractors } }` (não é lista plana). O `from` existe, mas cortaria os leads
prospectados que já eram clientes do Freela (o lead que "já usa" deve ir para 5). Do lado do Praça, gravar `freela_synced_at` em
todo lead casado a cada hora é escrita sem mudança.
*Correção:* quadro inteiro, **de 2 em 2 horas, 08h–20h** (7 chamadas/dia) em vez de 16; leituras do Praça em lote (mapas por
`freela_user_id`, `field_signups` e `phone_key`, `IN` em pedaços de 500), escrita só quando muda (vínculo, contratações, etapa). Sem
`freela_synced_at` por lead: o "visto em" fica na rodada (`crm_automation_runs`). Se o quadro passar de ~5 mil cartões, trocar para
`from` + uma volta diária completa.

**15. [média] Migração: nome e índices.**
O CLAUDE.md fixa a ordem das migrações (a última é `20261108100000_lovable_l12_varias_pracas`). O `migrate dev --create-only` de hoje
gera `20261028…`, que ordena ANTES de L4–L12 já aplicadas. `field_signups` não tem índice em `freela_user_id` (o UNIQUE começa
por `consultant_id`), e a A3 consulta por ele.
*Correção:* gerar com `--create-only`, apagar os `DROP INDEX` dos índices parciais, **renomear a pasta para
`20261109100000_crm_automatico`**, aplicar com `migrate deploy`. Conteúdo na §2.6.

**16. [média] Teto de 300 do A1 não corta nada na busca de hoje.**
`MAX_RESULTADOS = 300` (`domain/places-rules.ts:21`): a busca OSM devolve no máximo 300. O teto só morderia no Apify
(`APIFY_MAX_PLACES_PER_RUN` até 1000). *Correção:* manter a constante (`TETO_AUTO_LEADS_POR_BUSCA = 300` em `domain/catalog/crm.ts`),
dizer no desenho que hoje ela só vale para o Apify, e escolher os achados por `distance_m` crescente quando cortar.

**17. [média] A1 também alimenta os roteiros do campo.**
`filtroElegivel` (`rotas/rotas-plano.ts:29-36`) pega todo lead não arquivado com `location_precision` `point|address` até a etapa
máxima: os achados que entram sozinhos passam a ir para o roteiro automático e para a divisão de rotas sem ninguém escolher.
É provavelmente o desejado, mas muda o trabalho do representante. *Correção:* escrever no desenho e no cartão da A1 em Automações.
Rede de segurança que já existe: "Desfazer importação" em 24 h (`imports.service.ts:357-394`) vale para o lote automático.

**18. [média] Telefone do Freela gravado no lead.**
O `signup-sync` tem como invariante "nunca telefone, e-mail ou CNPJ do Freela" (`signup-sync.service.ts:5-10`). A A3 cria lead com
o `whatsappPhone` do cartão (e casa por ele). É útil (a T5 e a T1 precisam do número), mas contraria uma regra escrita.
*Correção:* decisão explícita do dono (§4, D3); se sim, o `whatsappPhone` só vai para `leads.phone` do lead NOVO (nunca sobrescreve o
telefone de um lead existente) e nunca para log ou `crm_automation_runs.summary`.

**19. [média] Regras 6 e 7 da A3 ("contratação" = vaga paga, não rodada).**
`hiringsCount` conta vaga com job não cancelado (`crm-pipeline.service.ts`, `bRVacancy.groupBy … job.status ≠ CANCELLED`): paga,
ainda não necessariamente rodada; cancelada depois some da conta, mas o lead já subiu. "2 vagas pagas" pode ser o mesmo dia (duas
funções no mesmo evento) e virar "Cliente ativo" no primeiro uso.
*Correção:* manter a decisão §10.2 do desenho, com o texto do evento honesto ("2 vagas pagas no Freela") e a opção para o dono
(§4, D2): promover a 7 só quando o Praça VÊ a contagem subir de 1 para 2 num dia diferente do que viu 1 (aproxima "recontratou"
sem as datas). Também guardar `lastMessageSentAt` do cartão não é preciso agora; só anotar o risco de mensagem dupla (o painel do
Freela também manda WhatsApp para esses contratantes).

### Baixos

**20. [baixa] `POST /v1/crm/tasks/snooze` duplica rota existente.** `POST /v1/leads/:id/snooze { until }` com `@Equipe()`
(`leads/leads.controller.ts:92-93`, `leads.service.ts:402-406`). Reusar; o web calcula `until` pelo dia de Brasília.

**21. [baixa] "Sem a chave … registra `nao_configurado`".** Com a chave DESLIGADA nada roda e nada é gravado. `nao_configurado` só com
a chave ligada e o Freela sem as três variáveis, uma linha por hora-alvo.

**22. [baixa] T2 sem limite de tempo.** "Visita com 1 dia ou mais" faz visita de meses atrás virar tarefa. Janela: visita encerrada
entre 1 e 14 dias atrás (`checkout_at`), `interest in ('alto','medio')` (os valores do banco não têm acento, `campo-rules.ts:42`);
depois disso o lead cai na T4.

**23. [baixa] Selo "Automático" e contratações no Funil sem mexer no `GET /v1/leads`.** Pôr `last_stage_auto`/`freela_hirings` no
item da lista exige outro `include` no endpoint mais pesado e muda o wire. *Correção:* `GET /v1/crm/badges?praca_id=` (só com
`CRM_TASKS_ENABLED`), devolvendo só os leads com algo a mostrar. `LeadsService` intacto. `last_stage_auto` = autoria do último evento com `stage_to` de cada lead da praça, numa consulta só:
`SELECT DISTINCT ON (e.lead_id) … ORDER BY e.lead_id, e.at DESC, e.id DESC` em `$queryRaw` (o `distinct` do Prisma traz tudo e
filtra em memória; um `findFirst` por lead seria N consultas).

**24. [baixa] "Quanto fez em 7 dias" pelos eventos varre `lead_events` sem índice em `at`.** Somar o `summary` das rodadas
(`crm_automation_runs`, ≤ 30 dias) dá o número exato e barato.

**25. [baixa] `features`: só o que o web precisa.** `crm_tasks` (menu, Dashboard) e `crm_auto_leads` (aviso na busca). O estado das
outras automações vem de `GET /v1/crm/automations`. As chaves ficam num módulo GLOBAL próprio (`common/flags/crm.flags.ts`), não em
`FlagsUi` (o `ui-flags-contrato.spec` fixa as 5 de lá).

**26. [baixa] `.env.prod.example` não lista nenhuma flag hoje.** O desenho manda acrescentar as novas lá: ou se acrescentam todas
(convenção nova, tarefa à parte) ou nenhuma. Recomendo nenhuma neste lote; a lista vai no contrato §47 e no compose de dev.

**27. [baixa] Testes de serviço do repo usam Prisma FALSO**, não banco de teste (`signup-sync.service.spec.ts:44`). As guardas
atômicas (`updateMany` com `where` de etapa, trava consultiva) só se provam no banco de verdade: o `smoke-crm.sh` tem de cobrir
(§2.8).

**28. [baixa] Linha "N leads novos → Entrada".** A fila da Entrada não filtra praça (`leads/queue.service.ts:53-63`); a linha da
tarefa conta na praça. Escrever "N nesta praça" e linkar a Entrada assim mesmo.

---

## 2. Decisões

### 2.1 Chaves (todas `false` por padrão; `env.validation.ts` + `docker-compose.yml` de dev com `${VAR:-false}`)

| Chave | Liga | Depende de |
|---|---|---|
| `CRM_TASKS_ENABLED` | rotas `/v1/crm/*` (desligada = 404 `CRM_TASKS_DISABLED`), telas Tarefas e Automações, cartão do Dashboard, selos do Funil | nada (o web mostra só com `commercial` também) |
| `CRM_AUTO_LEADS_FROM_SEARCH_ENABLED` | A1 | nada |
| `CRM_AUTO_STAGES_ENABLED` | A2 (passada local) + o `since` mais largo do sync (achado 7) | dados de `field_signups` (o sync ligado e a conta do Freela) |
| `CRM_AUTO_LOST_ENABLED` | A4 | nada |
| `CRM_FREELA_PIPELINE_ENABLED` | A3 | conta do Freela |

`common/flags/crm.flags.ts`: `interface FlagsCrm { tasks; auto_leads; auto_stages; auto_lost; freela_pipeline }`, `lerFlagsCrm(env)`
(via `validateEnv`), token `CRM_FLAGS`, `CRM_DESLIGADAS` congelado, `@Global() CrmFlagsModule` registrado no `AppModule` junto de
`UiFlagsModule`. Quem lê injeta `@Optional() @Inject(CRM_FLAGS)` como **último** parâmetro (os testes montam por posição).
`features` do `GET /v1/consultores/settings/config`: `RotasConfigController` ganha um 9º parâmetro `@Optional() @Inject(CRM_FLAGS)
crm?` depois de `flagsUi` (ajustar o comentário "por último") e as chaves `crm_tasks` e `crm_auto_leads`. Web: as duas em
`featuresMenuSchema` com `.default(false)`.

### 2.2 Fronteiras e arquivos

```text
api/src/
├── common/flags/crm.flags.ts                 # chaves (global)
├── domain/catalog/crm.ts                     # constantes: tetos, prazos (21/30/5/3/14 dias), rótulos de autor, nomes das rodadas
├── domain/crm-etapas-rules.ts                # alvo pelo cadastro (A2), deveAplicar (achados 4/5), semResposta (A4)
├── domain/crm-quadro-rules.ts                # A3: achatar colunas, casar cartão → lead, praça do cartão, alvo 5/6/7, plano da rodada
├── domain/crm-tarefas-rules.ts               # T1–T5: elegibilidade, prioridade, um lead uma vez, motivo em uma frase
├── domain/crm-resumo-rules.ts                # autoriaDoEvento, números do dia com conta e fonte
├── modules/freela/freela-pipeline.ts         # zod do quadro + achatamento; FreelaClient.quadroDeContratantes()
├── modules/crm/
│   ├── crm.module.ts                         # imports: FreelaClientModule, RotasModule, GeoModule (folhas). NUNCA Places/Campo.
│   ├── crm.controller.ts                     # /v1/crm (estáticas, sem :id)
│   ├── crm.guard.ts                          # 404 CRM_TASKS_DISABLED (como painel/lovable.guards.ts), na classe
│   ├── crm.scheduler.ts                      # um relógio, decide por chave
│   ├── rodadas.ts                            # registrar/ultimaDoDia/limpar em crm_automation_runs (helper do módulo)
│   ├── etapas-automaticas.service.ts         # subirEtapaAutomatica (A2 e A3) + passada A2
│   ├── quadro-freela.service.ts              # A3
│   ├── sem-resposta.service.ts               # A4
│   ├── tarefas.service.ts                    # A5 (leitura + done)
│   ├── resumo.service.ts                     # A6 resumo
│   ├── automacoes.service.ts                 # A6 automações + badges
│   └── dto/crm.dto.ts
├── modules/places/places-search.service.ts   # gancho A1 (só importa common/ e domain/)
├── modules/imports/imports.service.ts        # criarLeadsDeBusca ganha `opcoes`
└── modules/campo/signup-sync.service.ts      # só o argumento de escolherDesde, com a chave (achado 7)
```

Regras de dependência: `places` e `campo` nunca importam `crm/`; o que eles leem é `common/flags/crm.flags.ts`, `domain/` e o
Prisma. `crm/` lê `field_signups`, `field_visits`, `msg_sends`, `enrollments` e `place_import_runs` pelo Prisma (leitura de
composição, como o `notifications`) e escreve só em `leads`, `lead_events` e `crm_automation_runs`.

### 2.3 A1 — gancho sem ciclo

- `PlacesSearchService`: `concluir()` passa a devolver `boolean` (o `count` do `updateMany` de `done`; nada mais muda). Em `executar`,
  depois de `concluir` devolver `true`, se `crm?.auto_leads && run.kind === 'lugares'`: `await this.adicionarSozinho(run.id)` num
  `try/catch` PRÓPRIO (o erro nunca chega ao `falhar`, que já não teria efeito com `done`). Roda dentro da fila em memória: as buscas
  ficam em série com o A1 (bom: o provedor externo continua recebendo uma por vez).
- `adicionarSozinho(runId)`: relê a busca (`status = 'done'`); pega os candidatos `novo` por `distance_m` asc, até o teto; chama o
  MESMO `adicionar(tx, run, { praca_id, candidate_ids }, autor)` numa transação `{ timeout: 60_000, maxWait: 20_000 }` com as
  opções do achado 2. `NOTHING_TO_ADD` = rodada ok com 0; conflito (`violouUnico` ou a contagem da reserva) = rodada com erro
  `CONFLITO` e os candidatos ficam `novo` (o "Adicionar" manual segue). Sem `doGestor` (não há gestor).
- Rodada gravada direto pelo Prisma em `crm_automation_runs` (`job = 'auto_leads_busca'`, `ref = run.id`, summary
  `{ adicionados, ja_na_praca, acima_do_teto }`). Places não importa `crm/`.
- Cache de 7 dias: uma busca reaproveitada não roda o A1 de novo; busca que terminou com a chave desligada fica manual. Escrever.

### 2.4 A2 e o `subirEtapaAutomatica`

**Divergência registrada:** a revisão considerou pôr o A2 dentro de `processarItem` do sync. Fica FORA, numa passada local, porque
(a) o `processarItem` só vê o cadastro que a listagem devolve (achado 7), e a passada pega também o que já está gravado, inclusive o
que chegou antes de a chave ligar; (b) com a chave desligada o sync fica byte a byte (só o argumento do `since` muda, e só ligada);
(c) A2 e A3 usam a mesma função, com a mesma guarda.

- `subirEtapaAutomatica(tx, { lead_id, alvo, fato_dia, autor_label, texto, auto_key, agora })`: `updateMany` com
  `id`, `archived: false`, `is_test: false`, `OR: [{ stage: { lt: alvo } }, { stage: 8, stage_since: { lte: fato_dia } }]`,
  `AND: [{ OR: [{ auto_stage_applied: null }, { auto_stage_applied: { lt: alvo } }] }]`; `data` com `stage`, `stage_since`,
  `lost_reason: null`, `reheat_at: null`, `auto_stage_applied: alvo`. `count === 1` → evento `kind: 'stage'`, `stage_to: alvo`,
  `auto_key`. `count === 0` → `updateMany` que só grava `auto_stage_applied = alvo` quando o lead já está em etapa ≥ alvo e ≠ 8
  ("visto satisfeito"). Tudo na transação do lead.
- Passada A2 (de hora em hora, 06h–23h): `field_signups` com `lead_id` não nulo e `match_status = 'linked'`, lead não arquivado,
  não teste. Alvo pela regra pura: `first_job_completed_at` → 6 (fato = esse dia); senão confirmado pela `confirmation_rule`
  vigente (`classificar`, a MESMA do sync; `RotasConfigService.cadastro()`) → 5 (o sync já faz o 5 abaixo de 5; a passada só
  acrescenta a saída do 8 e grava a marca). **Não** fazer o 5 independente da regra: o funil hoje segue a regra configurada e dois
  "Cadastrado" diferentes confundem o time.
- "Publicou a 1ª vaga no Freela em dd/mm": evento `note` com `auto_key = 'a2:vaga1:<field_signup_id>'` (criado com tratamento de
  P2002 = já existe). Sem mudar etapa.
- Grava `leads.freela_user_id` quando nulo e o vínculo é único.

### 2.5 A3 — quadro de contratantes

- `FreelaClient.quadroDeContratantes()`: `GET /v1/admin/crm/pipeline` (sem query), zod em `freela/freela-pipeline.ts` sobre
  `{ columns: [{ stage, cards: [...] }] }`, achatado para `CartaoFreela[]` (`userId`, `name`, `city`, `state`, `whatsappPhone`,
  `hiringsCount`, `registeredAt`); falha de formato = `FREELA_ERROR` de mensagem fixa (o `validar` de hoje).
- Rodada (de 2 em 2 h, 08h–20h; chave ligada e `isConfigured()`): carrega em lote os mapas do achado 14, roda o plano puro
  (`crm-quadro-rules.ts`): casamento na ordem (1) `leads.freela_user_id`, (2) `field_signups` vinculado, (3) telefone do achado 6;
  alvo: cadastro assistido (achado 3) → só 6/7; senão 5/6/7. Por lead, uma transação: vínculo (`freela_user_id` se nulo),
  `freela_hirings` só quando mudou (evento `note` "Freela: 1 → 2 vagas pagas (visto em 28/10)", `auto_key` com o número) e
  `subirEtapaAutomatica`. Para lead em 8, o fato de contratação só conta quando o Praça VÊ a contagem subir (o dia é hoje); na 1ª
  observação, não tira de Perdido.
- Lead novo: cartão sem casamento, sem lead (nem arquivado) com o mesmo `freela_user_id` ou a mesma chave de telefone na praça
  escolhida, não assistido, praça aberta com a cidade/UF do achado 13, `todaySp(registeredAt) >= start_date`; desempate pela praça de
  início mais recente. Cria com `pg_advisory_xact_lock(hashtext('crm-freela-user:' || userId))` e reconfere dentro da trava; etapa
  pelo alvo; `origem: 'cadastro no Freela'`, `owner_id` nulo, `entered_at`/`stage_since` = hoje; evento de criação com `stage_to`
  (para o resumo contar) e `auto_key = 'a3:criado:<userId>'`.
- Rodada: `{ cartoes, casados_por_id, casados_por_cadastro, casados_por_telefone, ambiguos, criados, etapas: {5,6,7}, contratacoes }`.

### 2.6 Dados — migração `20261109100000_crm_automatico` (aditiva, sem índice parcial novo)

- `leads`: `freela_user_id String?` (`@@index([freela_user_id])`, NÃO único — rede com várias lojas pode ter um usuário),
  `freela_hirings Int?`, `auto_stage_applied Int?`. Sem `freela_synced_at`.
- `lead_events`: `auto_key String? @unique` (UNIQUE normal; vários NULL convivem no Postgres; não é índice parcial). Chaves:
  `a2:etapa:<lead>:<alvo>`, `a2:vaga1:<signup>`, `a3:etapa:<lead>:<alvo>`, `a3:contratacoes:<lead>:<n>`, `a3:criado:<userId>`,
  `a4:<lead>:<stage_since>`. É a idempotência dos eventos do automático (rodada repetida ou duas instâncias não duplicam).
- `field_signups`: `@@index([freela_user_id])`.
- `crm_automation_runs`: `id uuid`, `job String`, `ref String?`, `started_at`, `finished_at DateTime?`, `ok Boolean`,
  `summary Json @default("{}")`, `error String?` (sanitizado, como `sanitizarErroSync`); `@@index([job, started_at(sort: Desc)])`.
  Limpeza de > 30 dias na rodada diária (achado 21: só se alguma chave CRM estiver ligada).

### 2.7 Contrato §47 (antes do código) — rotas, DTOs e respostas

Todas em `/v1/crm`, guard de 404 na classe, `@Equipe()` em cada método (escrita e leitura), controller no `AppModule` (o
`permissoes-protecao.spec` passa a vê-lo; a matriz do gestor não muda). Erros `{ error: { code, message } }`.

| Rota | Entrada | Saída |
|---|---|---|
| `GET /v1/crm/tasks` | `praca_id` (string; `isUuid` no serviço → 404 `NOT_FOUND`), `person?: 'all' \| 'me'` (padrão `all`; `me` = `owner_id` do token **ou** nulo) | `{ day, praca_id, person, entrada: { novos }, groups: [{ task, total, items: [{ lead_id, lead_name, owner_id, stage, phone, reason, send_id?, text?, readonly? }] }] }` — `task` ∈ `send`, `cadence_send` (só leitura), `hot_visit`, `next_step`, `stalled`, `first_vacancy`; até 50 itens por grupo, `total` com todos |
| `POST /v1/crm/tasks/done` | `{ lead_id (IsUUID), task (IsIn hot_visit\|next_step\|stalled\|first_vacancy), kind (IsIn call\|msg_out\|msg_in\|visit), text? (≤ 2000), next_step? (NextStepDto) }` — sem default em campo opcional | `{ ok: true, lead_id }`. Uma transação: evento (`author_id` do token) e `last_contact_at`. `next_step` presente = grava o novo passo (em qualquer tarefa); ausente = **não toca**, exceto com `task = 'next_step'`, em que ausente limpa `next_step_*` (o serviço decide; o DTO não tem default). 404 lead; 409 `LEAD_ARCHIVED` |
| `GET /v1/crm/summary` | `praca_id`, `day?` (`IsDayString`; padrão `todaySp()`) | `{ day, praca_id, numbers: [{ key, value, parts: [{ label, value }], formula, source }] }` — janela do dia = `[atSpHour(day,0), atSpHour(addDays(day,1),0))` |
| `GET /v1/crm/automations` | — | `{ freela_configured, send_mode, jobs: [{ key, enabled, needs_freela, blocked_by, last_run, last_7d }], cadences: [{ id, name, entry, paused, active_enrollments }], warnings: [] }` — nunca o e-mail da conta |
| `GET /v1/crm/badges` | `praca_id` | `{ items: [{ lead_id, last_stage_auto, freela_hirings }] }` |

T1 "Feito" = `POST /v1/sends/:id/mark { status: 'enviada' }` (existe). "Adiar" = `POST /v1/leads/:id/snooze { until }` (existe).

### 2.8 Trabalhos (instância única) e testes

- **Um relógio** `CrmScheduler`, `@Cron('*/5 * * * *', { timeZone: 'America/Sao_Paulo' })`, no padrão do `signup-sync.scheduler`
  ("o @Cron não lê configuração; bate e decide"): A2 a cada 60 min (06h–23h); A3 nas horas pares 08–20, uma vez por hora-alvo;
  A4 uma vez por dia depois de 06:10, decidida pela rodada `sem_resposta` ok do dia em `crm_automation_runs` (sobrevive a reinício,
  ao contrário de um `@Cron('10 6 * * *')` que perde o dia se o processo estiver caindo às 06:10). Cada trabalho com `rodando`
  próprio, `try/catch` e `agora` injetável no teste.
- **Testes:** regras puras primeiro (`src/domain/__tests__/crm-*.spec.ts`: alvo, `deveAplicar` com marca e 8, `semResposta`,
  casamento com ambíguos e DDD, praça do cartão, tarefas com prioridade e "um lead uma vez", autoria e contas do resumo com evento
  às 23h). Serviços com Prisma falso e o Freela como dublê (`quadroDeContratantes` devolvendo fixture), como os specs de hoje.
  Caracterização: `criarLeadsDeBusca` sem `opcoes` igual; `places-search.service.spec` e `signup-sync.service.spec` passam SEM
  edição com a chave desligada (os novos casos vão em arquivos novos). `smoke-crm.sh` (chaves ligadas, Freela vazio, Overpass morto)
  prova no banco de verdade: guarda de etapa (rodar duas vezes = um evento), `auto_key`, 404 com a chave desligada, `done` atômico.

---

## 3. Ordem das tarefas

Cada uma testável sozinha. Máquina de 7,6 GB: um processo pesado por vez (`free -m` antes), jest por arquivo com
`nice -n 19 npx jest --runInBand <arquivo>`, `tsc --noEmit` uma vez só no fim, nada de `nest build`/`next build`.

1. **Contrato §47 + CLAUDE.md** (só docs): rotas, chaves, wire, erros, a divergência do A2, o que fica fora.
2. **Chaves**: `env.validation.ts` (5 chaves), compose de dev, `common/flags/crm.flags.ts` + módulo global no `AppModule`,
   `domain/catalog/crm.ts`. Teste: `crm-flags.spec.ts` (padrão desligado; cada chave segue a sua).
3. **Migração** `20261109100000_crm_automatico` (`--create-only`, tirar os `DROP INDEX`, renomear, `migrate deploy`, `prisma generate`).
   Nenhum código usa ainda.
4. **Regras puras de etapa** `crm-etapas-rules.ts` + spec.
5. **`subirEtapaAutomatica` + passada A2** (`crm.module.ts` mínimo, `etapas-automaticas.service.ts`, `rodadas.ts`) + spec com Prisma
   falso (chave desligada = nada; humano voltou = não reaplica; 8 com fato antigo fica; `reheat_at` limpo).
6. **`since` do sync com a chave** (achado 7) + spec novo `signup-sync-crm.spec.ts`; o spec de hoje roda sem edição.
7. **A4** `sem-resposta.service.ts` + spec (exclusões do achado 10, trava, evento com a conta).
8. **`CrmScheduler`** (A2 e A4 por enquanto) + spec com `agora` injetado (horários, uma vez por dia, reinício, erro não escapa).
9. **Cliente do quadro** `freela-pipeline.ts` + `quadroDeContratantes()` + spec com `fetch` falso (envelope, formato errado).
10. **Regras puras da A3** `crm-quadro-rules.ts` + spec.
11. **A3** `quadro-freela.service.ts` + entrada no scheduler + spec com dublê do Freela.
12. **A1**: `criarLeadsDeBusca` com `opcoes` (spec de caracterização) → gancho em `places-search.service.ts` + spec novo
    `places-auto-leads.spec.ts` (sem dono, autor, teto, conflito, `kind` ≠ `lugares` ignorado).
13. **Regras puras das tarefas** `crm-tarefas-rules.ts` + spec.
14. **Rotas de tarefas**: `crm.guard.ts`, `crm.controller.ts` (`tasks`, `tasks/done`), `tarefas.service.ts`, DTOs + spec (404 desligada,
    `person=me` pelo token, `done` em transação). Rodar `permissoes-protecao.spec`.
15. **Resumo** `crm-resumo-rules.ts` + `resumo.service.ts` + rota + spec.
16. **Automações e selos** `automacoes.service.ts` (+ `warnings` do achado 8) + rotas + spec; `features` no `RotasConfigController` +
    `crm-features-contrato.spec.ts`.
17. **`scripts/smoke-crm.sh`** (API com `start:smoke`, matar depois).
18. **Web, uma tela por tarefa** (com o designer): `featuresMenuSchema` + `montarMenu` (vitest) → `modules/crm/infrastructure/crm.api.ts`
    (zod) → Tarefas → Automações → cartão do Dashboard → selos do Funil → aviso na busca. `yarn test` por arquivo; `yarn lint` e
    `yarn typecheck` uma vez no fim.
19. **Fechamento**: `npm run typecheck` sozinho, jest inteiro sozinho, `browser-check` com as chaves ligadas.

---

## 4. Para o dono decidir (nada disto bloqueia as tarefas 1–11)

- **D1** Dono do lead da A1: nulo (recomendado; "Minhas" mostra os sem dono) × quem pediu a busca × rodízio de hoje.
- **D2** "Cliente ativo": ≥ 2 vagas pagas (desenho) × ≥ 2 vistas em dias diferentes pelo Praça (achado 19). Recomendo a 2ª.
- **D3** Gravar o telefone do Freela no lead novo da A3 (achado 18). Recomendo sim, só no lead novo.
- **D4** A1 com cadência "Lead novo" ligada no modo Via Freela (achado 8): aceitar com aviso (recomendado) × impedir.
- **D5** Etapa 6 = vaga paga (quadro) × serviço concluído (cadastro assistido): o desenho usa as duas; recomendo aceitar, com o
  evento dizendo qual fato foi.
- **D6** Fazer o motor de cadências gravar `status: 'fila'` no modo Fila manual (achado 1). Recomendo NÃO neste lote.
