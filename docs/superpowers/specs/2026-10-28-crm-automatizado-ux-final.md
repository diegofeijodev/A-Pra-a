# CRM automático: revisão final de UX (depois de implementado)

Data: qui 29/10/2026. Quem revisa: a designer que escreveu a spec `2026-10-28-crm-automatizado-ux.md` (regra do dono: arquiteto e designer
revisam de novo no fim). Objeto: o branch `feat/crm-automatizado` em `web/` (`9652376..855e6c3`), com as decisões do §12 do desenho, o
ledger `progress.md`, a leva final (`final-web-findings.md`, `final-fix-web-report.md`) e os relatórios das tasks 19 a 23.

Método: só leitura do código, da API que as telas consomem e dos relatórios. Não subi servidor nem navegador, e nada foi medido na tela.
Onde escrevo "estimativa", a conta foi feita à mão e precisa ser conferida no navegador (§8).

Escala de severidade (Nielsen): 0 não é problema · 1 cosmético · 2 menor · 3 maior · 4 catastrófico (impede a tarefa).

---

## 1. Veredito

**Aprovado, com correções antes de ligar as chaves.** O essencial da spec (§4 dela) está lá e bem feito:

- Tarefas com "Feito" em 1 toque (T1) e 2 toques (T2 a T5), "Adiar" e "Desfazer" de 5 s;
- "Abrir WhatsApp" que não grava nada;
- o resumo com a conta e o seletor "Hoje | Ontem";
- o "—" quando o Freela não está conectado;
- Automações só leitura, com a situação de cada uma escrita em texto;
- as cores das etapas fora do texto;
- o Funil no celular sem rolagem lateral;
- o `LeadPanel` dentro do `Sheet`.

Não achei nada catastrófico (4). Os três achados maiores (3) estão em **números que dizem uma coisa e contam outra** e na **fila da
Entrada**, por onde passa o 1º contato. Um deles nasceu de um texto meu na spec (achado 1).

---

## 2. O que corrigir antes de ligar cada chave

| Antes de ligar | Itens | Tamanho |
|---|---|---|
| `TEAM_COMMERCIAL_ENABLED` | **1** (o filtro na API; só o texto, se a API não chegar a tempo), **2** (o que bloqueia é a decisão do dono: se for "não mover", o paliativo na tela, com a linha visível, é obrigatório), **4** | 1 é uma regra pequena na API; 2 é decisão + uma regra pequena na API ou na tela; 4 é texto |
| `CRM_TASKS_ENABLED` | **3** (se alguma cadência estiver "Rodando" no modo "Fila manual"; a tela Automações mostra isso), **5**, **6** | 3 é um `groupBy` a mais na API; 5 e 6 são texto |
| As chaves das automações (A1 a A4) | **7**, **9**, **10** | 7 é uma classe CSS; 9 e 10 são texto |
| Pode ir depois, na próxima leva | os outros (2 e 1) | — |

---

## 3. Achados

### 3.1 Maiores (3)

1. **[3] A Entrada diz "nesta praça", mas a fila é de todas as praças.**
   - **Onde:** `web/src/modules/leads/domain/entrada.ts:55`: "Fonte: leads em “Lead novo” e os de reaquecer com data vencida, nesta
     praça." A API (`api/src/modules/leads/queue.service.ts:53-63`) não filtra por praça nem tira os leads de teste. A tela chama
     `useLeadQueue(who)` sem praça (`web/src/app/(app)/entrada/page.tsx:638`).
   - **Por que confunde:** o cabeçalho tem o seletor de praça (`entrada/page.tsx:91`), o que faz parecer que ele filtra a fila. E o
     cartão "Primeiro contato" de Tarefas conta **por praça**, só a etapa 1 e sem teste (`api/src/modules/crm/tarefas.service.ts:155`;
     texto em `web/src/modules/crm/domain/tarefas.ts:158-159`, "12 leads novos esperando o 1º contato nesta praça").
   - **Consequência:** a pessoa toca em [Abrir a Entrada] e vê outro número ("34 na fila"), com leads de outras praças no meio. O número
     diz o que é, mas a fonte escrita está errada (regra do dono de 08/10).
   - **Origem:** o texto "nesta praça" é meu, da spec §3.6. Eu supus a fila por praça sem conferir a API.
   - **Correção (escolha do arquiteto):**
     - **(a) Recomendada:** `praca_id` opcional em `GET /v1/leads/queue`, com a tela mandando a praça ativa. A fila também passa a tirar
       `is_test`, como em Tarefas. Os dois números ficam iguais, desde que o cartão de Tarefas conte também os de reaquecer vencidos, ou
       diga "leads novos" e a Entrada separe "{n} novos + {k} de reaquecer".
     - **(b) Mínima, só texto:** "…com data vencida, **em todas as praças**". O cartão de Tarefas passa a dizer "{12} leads novos desta
       praça; a Entrada mostra todas as praças". O texto fica verdadeiro, mas a passagem de Tarefas para a Entrada continua quebrada: quem
       tem duas praças toca em [Abrir a Entrada] e cai numa lista que não é a que tocou. Só vale se o (a) não ficar pronto antes de ligar
       a chave.

2. **[3] Na Entrada, o "Feito" some com a linha, mas o lead continua na fila e volta.**
   - **Onde:** o "Feito ▾ → Liguei" grava o contato (`api/src/modules/leads/leads.service.ts:372-388`), mas o lead fica em "Lead novo".
     A fila é "etapa 1 ou reaquecer vencido" (`queue.service.ts:58`). Na tela, a linha fica escondida pelo `feitas`
     (`web/src/modules/crm/application/use-acoes-adiadas.ts:28-29` e `:85-89`), mas só enquanto a página está aberta.
   - **Consequência:**
     - recarregou a página ou voltou no dia seguinte, o mesmo restaurante reaparece como "Lead novo há 4 dias";
     - a outra pessoa da equipe vê o lead na fila dela e liga de novo;
     - a A4 ("Contatado há 21 dias → Perdido") nunca alcança esses leads, porque só olha a etapa 2.
   - **Por que piorou:** a tela antiga deixava a linha à vista depois do clique. A nova esconde a linha e diz "Faltam N tarefas", ou
     seja, promete que acabou.
   - **Status:** estacionado no ledger (Task 23 e item 10 da revisão final) como decisão do dono.
   - **Correção (recomendo):** o "Feito" da Entrada passa o lead de 1 para 2 ("Contatado"), e de 8 para 2 no reaquecer, com o evento de
     etapa de quem fez. É o que "Contatado" quer dizer, e é o que liga a Entrada à A4. A alternativa é a fila tirar quem teve contato
     hoje, mas aí o lead volta amanhã do mesmo jeito. Se o dono decidir não mexer, a linha **não pode sumir**: ela fica com "✓ Ligação
     registrada · continua em Lead novo".

3. **[3] "Mensagens enviadas" chama de "marcadas à mão" as que a cadência marcou sozinha.**
   - **Onde:** `api/src/domain/crm-resumo-rules.ts:175-178` divide só pelo modo: "entregues ao Freela" e "o resto = marcadas à mão". No
     modo "Fila manual", o motor da cadência grava a mensagem como `enviada`, com `sent_at`, sem ninguém da equipe
     (`api/src/modules/cadences/cadence-engine.service.ts:399-401` e `:477-478`).
   - **Consequência:** com uma cadência rodando, o resumo diz "4 = 0 entregues ao Freela + 4 marcadas à mão". A equipe lê que mandou 4
     mensagens e não mandou nenhuma. O grupo só leitura de Tarefas diz o contrário ("As cadências já marcaram estas mensagens como
     enviadas hoje. Se ainda não mandou…"), e as duas telas se desmentem.
   - **Correção:** `msg_sends` já tem `cadence_id` e `disparo_id` (`tarefas.service.ts:69` e `:73`). A conta passa a ser "{n} = {a}
     entregues ao Freela + {b} marcadas pela cadência + {c} marcadas à mão (disparos)". A fonte acrescenta: "No modo Fila manual, a
     cadência marca a mensagem como enviada no horário dela, mesmo que ninguém tenha mandado."
   - **Origem:** o rótulo "marcada à mão" é meu, da tabela do resumo na spec §3.1.6. Escrevi sem lembrar que a cadência também marca.
   - **Quando:** só aparece com uma cadência "Rodando" no modo "Fila manual". As cadências-modelo nascem pausadas, e Automações mostra
     quais estão rodando. Se alguma estiver, corrigir antes de `CRM_TASKS_ENABLED`.
   - **Pano de fundo (D6 do desenho):** o mesmo motor zera os "dias parado" desses leads, e a A4 nunca os alcança. Isso é decisão de
     produto, não de tela, e está no §9.

### 3.2 Menores (2)

4. **[2] "Limite de {20} por pessoa" com "Todos os donos" escolhido.**
   - **Onde:** a API corta a lista **inteira** em `quota` (`queue.service.ts:83`), mas a tela escreve "{14} leads ficaram para outro dia
     pelo limite de 20 por pessoa" (`entrada/page.tsx:757-759`) e ", o limite por pessoa" (`entrada.ts:52`).
   - **Consequência:** em "Todos os donos" são 20 no total, não 20 por pessoa.
   - **Correção:** com "Todos os donos", escrever "mostrando 20 (o limite da fila)". Com uma pessoa, fica "o limite por pessoa".

5. **[2] A fonte dos "Últimos 7 dias" em Automações está errada.**
   - **Onde:** a tela diz "eventos com o autor {Automático} na ficha dos leads, de 23/10 a 29/10" (`web/src/app/(app)/automacoes/page.tsx:217`
     e `:247`). A API soma os `summary` das rodadas de `crm_automation_runs` nas últimas 168 horas (`api/src/modules/crm/automacoes.service.ts:76`
     e `:85-89`).
   - **Consequência:** são outra fonte e outra janela.
   - **Correção:** "Últimos 7 dias: a soma do que cada rodada registrou desde {qui 22/10 14h32}. O registro das rodadas guarda 30 dias."

6. **[2] O cartão "Comercial hoje" com "Praça: todas" leva a uma Tarefas de uma praça só.**
   - **Onde:** o cartão soma as tarefas de todas as praças (`web/src/components/crm/CartaoComercialHoje.tsx:42`). O [Abrir tarefas] (`:100`)
     cai em Tarefas, que mostra só a praça ativa (A10 do desenho).
   - **Consequência:** o 14 do Dashboard vira 9 em Tarefas, sem aviso.
   - **Correção (texto):** com "todas" e mais de uma praça, a conta ganha "em {3} praças; a tela Tarefas mostra uma praça por vez", e o
     botão diz "Abrir tarefas de {praça ativa}".

7. **[2] O selo "Falhou na última rodada" provavelmente reprova no contraste.**
   - **Onde:** `text-destructive` sobre `bg-destructive/10` (`automacoes/page.tsx:38`). Na spec eu estimei cerca de 4,6:1. Refeita com a
     mistura no espaço de cor da tela, a conta dá **cerca de 4,3:1**, abaixo dos 4,5:1 que o texto de 12 px pede.
   - **As outras duas combinações** (estimativa): "Ligada" (`success` a 10%) dá cerca de 4,9:1 e "Parada" (`warning` a 10%) cerca de 5,9:1.
     As duas passam.
   - **Ninguém mediu:** o `browser-check` não confere contraste, e a Task 21 já tinha avisado.
   - **Correção:** o plano B da própria spec, `bg-card border border-destructive text-destructive`. Antes, conferir no navegador (§8).

8. **[2] No celular pequeno, a primeira tarefa fica abaixo da dobra** (estimativa; conferir no navegador).
   - **Onde:** em 360 × 640, até o nome da primeira linha vêm a barra do topo, as pílulas do menu, o h1, o subtítulo, a praça, "Minhas |
     Todas", a linha "Em “Minhas”…", a contagem com a conta em 3 linhas, "Ver o resumo do dia ↓" e o topo do grupo
     (`web/src/app/(app)/tarefas/page.tsx:398-437`).
   - **Consequência:** a conta dá cerca de 650 px. A spec queria ação antes de informação.
   - **Correção, sem perder a conta:**
     - no celular, "Ver o resumo do dia ↓" vai para a mesma linha do título da contagem;
     - a frase "Cada lead aparece uma vez, na tarefa mais urgente." fica só do `sm` para cima;
     - a linha "Em “Minhas”…" só aparece com "Minhas" escolhida.

9. **[2] O aviso da busca automática promete uma sobra que a busca OSM não tem.**
   - **Onde:** "Os que passarem disso ficam aqui para você escolher." (`web/src/components/praca/BuscaEstabelecimentos.tsx:275-276`).
   - **Por que é falso:** o desenho §12.1 item 2 diz que a busca OSM já devolve no máximo 300. E o aviso de corte, logo abaixo, diz
     "Mostramos 300. Reduza a área para ver todos." (`:325-329`). Então nada "fica aqui".
   - **Outra contradição:** o texto de abertura do passo 3 continua dizendo "revisar antes de adicionar" (`:281-283`).
   - **Origem:** o texto do aviso é meu (spec §3.5).
   - **Correção:** "Os achados entram no funil sozinhos quando a busca termina (até 300 por busca)." Com a A1 ligada, a abertura do
     passo 3 passa a ser "Os achados aparecem aqui; os que ainda não estão no funil entram sozinhos quando a busca termina."
   - **Estados da §3.5 que faltam:** "Todos os achados já entraram no funil." e o aviso de falha da A1. Eles dependem de dado da busca,
     e ficam para depois.

10. **[2] O aviso "busca automática + cadência de lead novo" tem cara de informação, mas é um risco.**
    - **Onde:** sai como `bg-secondary`, sem ícone (`automacoes/page.tsx:112-116`). O texto mora na API (`automacoes.service.ts:46-49`)
      e usa termos de dentro ("cadência de entrada “Novo”", "antes de ligar", com as duas coisas já ligadas).
    - **Correção:**
      - visual da faixa de atenção: `border-warning/40 bg-warning/10` + `AlertTriangle`;
      - a API manda só a chave do aviso e o nome da cadência, e o texto mora no web: "A busca põe leads no funil sozinha e a cadência
        “{Lead novo}” está rodando: cada lead novo recebe a 1ª mensagem sem ninguém ter conversado antes. Se não quiser isso, pause a
        cadência.";
      - o botão [Pausar em Mensagens] leva a `/mensagens?aba=cadencias`.

11. **[2] O painel do lead não abre enquanto carrega e fica mudo no erro.**
    - **Onde:** `web/src/components/praca/LeadPanel.tsx:80` devolve `null` até o lead chegar. Em Tarefas, todo nome abre o painel.
    - **Consequência:** no celular com sinal fraco, o toque parece não funcionar. Se a leitura falha, nada acontece.
    - **Correção:** abrir o `Sheet` na hora, com esqueleto e com o erro "Não deu para abrir o lead." + [Tentar de novo].
    - **Mesmo padrão do achado 3 da spec:** o botão rápido "Enviar mensagem" (`:223`) grava "Mensagem enviada" sem enviar nada. Trocar o
      rótulo para **"Registrar mensagem"**, uma palavra.
    - **Continua adiado** (spec §4.5): o resto do miolo (rótulos `tag` de 10 px, campos só com placeholder em `:144-156`, botões rápidos de
      cerca de 32 px em `:309-317`).

12. **[2] O que a spec pediu à API para Tarefas e não veio.** Cada item tem um paliativo na tela:
    - **Cidade na linha:** a API não manda `city` (`web/src/modules/crm/domain/tarefas.ts:176-188`). Com dois "Bar do Zé" em cidades
      diferentes, a pessoa não sabe qual é.
    - **`leads_total`:** sem ele, numa praça nova a tela mostra "Tudo em dia" + [Ver o funil] em vez de "Esta praça ainda não tem leads."
      (`tarefas/page.tsx:311-324`).
    - **Nome da cadência na T3:** a tela usa o texto do passo (achado 18).

    Pedido ao arquiteto: os três campos em `GET /v1/crm/tasks` (§47.3).

13. **[2] As pílulas de Tarefas e o "De quem" da Entrada não concordam.**
    - **Onde:** a Entrada lê o `hojePerson` uma vez (`useState(hojePerson)`, `entrada/page.tsx:629`) e nunca grava de volta (`:751`).
      Tarefas grava.
    - **Consequência:** escolher "Rebeca" na Entrada não muda nada nas outras telas, e vice-versa. A spec (§3.1.2) queria as três telas
      concordando.
    - **Correção:** a Entrada passa a usar o `setHojePerson`.

14. **[2] Os números do Funil: o valor longo e a média sem a base.**
    - **Onde:** o número grande virou "9 de 30 = 30%" (`web/src/app/(app)/funil/page.tsx:188-189`; `web/src/modules/leads/domain/funil.ts:11-16`).
    - **Consequência:** em `text-2xl`, num cartão de cerca de 124 px úteis no celular (2 colunas) e de cerca de 114 px no `lg` (6
      colunas), "120 de 300 = 40%" quebra em duas linhas.
    - **Como a spec pedia:** valor **"30%"** e conta **"9 de 30 contatados"**.
    - **A média sem a base:** "Dias até cadastrar" diz "média dos leads cadastrados", mas não diz de quantos, porque a API não manda o N
      (`web/src/modules/leads/infrastructure/leads.api.ts:116`). Pedido ao arquiteto: `avg_days_n`, para escrever "média de {9} leads".

15. **[2] O acordeão do Funil no celular pode fechar a etapa que a pessoa abriu.**
    - **Onde:** o `open` de cada etapa é recalculado como "a 1ª etapa com lead" (`funil/page.tsx:358`).
    - **Consequência:** ao digitar na busca, a primeira etapa com lead muda, e o React troca qual está aberta.
    - **Correção:** guardar a última etapa aberta (no `ui-store`, como a spec pedia) e só cair na 1ª com lead quando nada foi aberto.
      Conferir no navegador.

16. **[2] Os chips de mapeamento salvos têm 36 px no celular, e a lixeira apaga sem volta.**
    - **Onde:** `entrada/page.tsx:369` e `:374`.
    - **Correção:** `min-h-11` / `size-11` abaixo de `md`, e um toast com [Desfazer], ou a confirmação com o nome do mapeamento.

### 3.3 Cosméticos (1)

17. **[1] Plural.** "1 leads · R$ …" na coluna e no acordeão do Funil (`funil/page.tsx:345` e `:368`), e "1 leads ficaram para outro dia"
    (`entrada/page.tsx:759`).
18. **[1] Motivo da T3 vindo da cadência.** "Ligação da cadência “Ligar e perguntar se recebeu” · era para hoje"
    (`tarefas.ts:85-87`) se lê como se o texto entre aspas fosse o nome da cadência. Proposta: "“{passo}” · ligação de uma cadência · era
    para hoje". No grupo da cadência, "Cadência Lead novo · …" (`api/src/modules/crm/tarefas.service.ts:133`) fica melhor com aspas:
    "Cadência “Lead novo”".
19. **[1] "Hoje" sozinho no rodapé do cartão do Funil** quando os dias parados são 0 (`funil.ts:40`). Fica "Contato hoje" ou "0 dias parado".
20. **[1] A faixa do Freela fala do envio "Via Freela" mesmo no modo "Fila manual"** (`web/src/modules/crm/domain/automacoes.ts:291-292`).
    Só citar o envio quando `send_mode === 'freela'`.
21. **[1] A dica do "Adiar ▾" não chega ao leitor de tela.** "O lead some das tarefas e da Entrada até lá." é um `<p>` dentro do
    `role="menu"` (`web/src/components/crm/LinhaTarefa.tsx:249`). A frase pode entrar no `DropdownMenuLabel` ("Adiar até · o lead some das
    tarefas até lá"), ou ir em `aria-describedby` no conteúdo.
22. **[1] O cartão "Comercial hoje" escreve as contas de dois jeitos.** A linha de tarefas não traz "= total"
    (`web/src/modules/crm/domain/comercial-hoje.ts:59`), e as outras trazem "12 = …". A fonte diz "sem os de teste"
    (`comercial-hoje.ts:75`), e a do resumo diz "sem os de teste e os arquivados".
23. **[1] "Tentar de novo" repete um erro que não passa.** Quando a T1 já foi marcada por outra pessoa, a linha volta com o erro, e
    "Tentar de novo" dá o mesmo erro (`use-acoes-adiadas.ts:55`; `LinhaTarefa.tsx:148-157`). A releitura de 60 s acaba tirando a linha.
    Com um código próprio (`SEND_NOT_QUEUED`, por exemplo), a linha sai na hora com "Alguém já marcou esta mensagem como enviada."
24. **[1] Formulário de captura.**
    - "Link copiado." aparece mesmo quando a cópia falha (`entrada/page.tsx:596`).
    - "Carregando…" em texto (`:558`) e "Nenhuma praça ainda — abra a primeira em Praças." (`:566`) estão no padrão antigo.
25. **[1] O seletor de praça no celular.** Com duas ações no cabeçalho (Funil, Entrada), ele divide a linha com "Novo lead" em vez de
    ocupar a largura toda (`web/src/components/praca/CabecalhoPagina.tsx:32` e `:56`). Conferir. Se ficar torto, o `select` ganha
    `basis-full sm:basis-auto`.
26. **[1] A bolinha da linha do tempo do painel não tem `aria-hidden`** (`LeadPanel.tsx:267`).

---

## 4. O que é correção da minha spec (o código está certo)

- **Horários de Automações.** A A2 roda de hora em hora, das 6h às 23h, e a A3 de 2 em 2 horas, das 8h às 20h
  (`web/src/modules/crm/domain/automacoes.ts:53` e `:65`, iguais a `api/src/modules/crm/crm.scheduler.ts:3-4`). A tabela da minha §3.2.2
  estava velha.
- **"Só anotar…" saiu do menu "O que você fez?"** O `done` aceita só contato de verdade, e uma nota não tira o lead da regra. Certo.
- **A A2 e a A4 têm chaves separadas**, por isso a frase "A mesma chave liga…" não existe mais. Certo.
- **A T1 é só de disparos**, e as mensagens das cadências vão para um grupo só leitura (desenho §12.1 item 1). Os textos novos dizem a
  verdade do motor.
- **"Saem até {n} leads"** no "Desfazer importação" e **"Completar até {n} leads"** na importação: o "até" é honesto, porque só o servidor
  sabe o número exato. Ficam.
- **A contagem de Tarefas sem `aria-live`**, com a região do fim da página anunciando "Faltam N tarefas": evita dois anúncios por toque.
- **`/hoje` com um link e não o cartão "Contatos com leads"** é o corte (d) que a spec permitia.
- **Três textos meus estavam errados:** "nesta praça" na Entrada (achado 1), "marcada à mão" no resumo (achado 3) e "Os que passarem
  disso ficam aqui" na busca (achado 9). Também a minha estimativa de contraste do selo de falha (achado 7).

---

## 5. O que ficou bom

- **Tarefas.**
  - A ação vem primeiro: no `lg`, o resumo vai para a coluna da direita, `sticky`; no celular, ele fica no fim, com o link para ele.
  - O "Abrir WhatsApp" nunca grava (`LinhaTarefa.tsx:174`, um `<a>` puro). Depois de tocar nele, a linha mostra "Mandou? Toque em
    Feito." e o "Feito" vira o botão cheio.
  - O "Feito" leva 1 toque na T1 e 2 na T2 a T5.
  - O "Desfazer" de 5 s manda também quando a aba é escondida (trocar para o WhatsApp no celular) e na desmontagem, com `keepalive`.
  - O foco volta ao botão usado, vai à linha seguinte quando uma sai e nunca cai no `body`.
  - O anúncio repete "Desfeito." duas vezes quando é o caso.
  - As pílulas "Minhas | Todas" explicam o "sem dono".
  - O aviso da T5 sem o Freela e o "—" no resumo estão lá.
  - O "Hoje | Ontem" tem o vazio "Ainda não aconteceu nada hoje."
  - Os estados estão todos: chave desligada (sem chamar `/v1/crm/*`), sem praça, carregando, erro com o resumo de pé, "Tudo em dia" (que
    não aparece com mensagens da cadência na tela) e "Nada seu agora".
- **Automações.**
  - É só leitura de verdade: nenhum `Switch`, e cada selo tem texto e ícone.
  - O bloqueio vem do servidor (`blocked_by`); a tela não adivinha.
  - O erro técnico e os nomes das chaves só aparecem para o admin. Quem não é admin lê "Para ligar, fale com o administrador."
  - "Conferido ontem às 22h00" diz o dia.
  - O `dl` fica em uma coluna no celular.
- **Cartão do Dashboard.**
  - Está no lugar certo: logo abaixo de "Atenção agora", antes dos 8 cartões.
  - Nunca mostra um 0 falso: só dá o número com tudo lido.
  - O erro fica dentro do cartão, sem derrubar o Dashboard.
  - O "não segue o período acima" só aparece onde há período.
- **Funil.**
  - A cor da etapa ficou só na bolinha, e o texto é sempre `text-foreground`, também nos chips do painel.
  - No celular, o acordeão não tem rolagem lateral, e a dica diz como mudar de etapa sem arrastar.
  - O quadro é uma região com foco.
  - "Crítico." vai como texto para o leitor de tela, e o próximo passo vencido é escrito, não só colorido.
  - Os números ficam "—" até chegar a resposta, e no erro.
  - Os cinco estados da spec estão lá.
  - Os selos são neutros.
- **Entrada.**
  - O 1º contato vem primeiro, com o mesmo `LinhaTarefa`.
  - O WhatsApp não grava (U1).
  - O limite foi para dentro de "Ajustar o limite", com o rótulo inteiro.
  - O "Desfazer importação" usa um `AlertDialog` com a consequência escrita e devolve o foco.
  - Nunca aparece "Importar 0 leads".
  - A prévia linha a linha só aparece no computador, com o aviso no celular.
- **Painel do lead.** Está no `Sheet`: o foco fica preso, o Esc fecha e o foco volta a quem abriu (ou ao h1). O botão de fechar tem 44 px.
- **Menu e `/hoje`.** "Tarefas" é o 1º item do Comercial e "Automações" o último; "Ações da praça" ganhou h1; o funil não pisca enquanto as
  chaves são lidas.

---

## 6. Acessibilidade (a tabela WCAG 2.2 AA da spec §6, agora conferida no código)

| Item | Resultado |
|---|---|
| 1.4.3 Contraste do texto (cores das etapas) | ✓ cor só na bolinha (`funil/page.tsx:338`, `:360`; `LeadPanel.tsx:116`, `:212`) |
| 1.4.3 Contraste dos selos de Automações | a conferir: o de falha provavelmente reprova (cerca de 4,3:1, achado 7); "Ligada" e "Parada" passam (estimativa) |
| 1.4.1 Cor não é o único sinal | ✓ crítico (ícone + "Crítico."), vencido (texto), parados (ícone + texto), selos (ícone + texto) |
| 2.1.1 Teclado / região que rola | ✓ `role="region"` + `tabIndex={0}` + anel de foco no quadro |
| 2.5.7 Movimentos de arrasto | ✓ dica visível + "Mover para etapa" no painel; no celular não há arrasto |
| 2.5.8 Tamanho do alvo | ✓ nas telas novas (`Button` com `min-h-11`, `summary` com `min-h-11`, pílulas); ✗ chips de mapeamento com 36 px (achado 16: passam os 24 px do AA, mas não os 44 px do projeto); o miolo do painel fica para depois |
| 2.4.3 Foco (painel do lead) | ✓ `Sheet` + `devolverFoco` |
| 2.4.3 Foco depois que a linha sai | ✓ no código (`proximoFoco`); sem teste automatizado, conferir no navegador |
| 4.1.3 Mensagens de status | ✓ região `sr-only` + `useAnuncio`; (1) "Mandou? Toque em Feito." aparece sem anúncio |
| 2.5.3 Rótulo no nome | ✓ "Feito: {nome}", "Adiar: {nome}", "Desfazer: {nome}"; "Abrir WhatsApp de {nome} (abre em outra aba)" |
| 2.4.11 Foco não encoberto | ✓ sem barra fixa; `focarSemPular` rola quando precisa |
| 1.3.1 Títulos | ✓ h1 em todas as telas, h2 por grupo ou seção, h3 nos cartões de Automações |
| 4.1.2 Nome e papel | ✓ pílulas com `aria-pressed`; (1) o grupo de rádio da importação não anda pelas setas (cada opção leva um Tab); (1) achado 21 |

---

## 7. A regra "todo número com a conta e a fonte" (08/10), número por número

| Número | Conta à vista | Fonte | Situação |
|---|---|---|---|
| Tarefas: "9 tarefas para hoje" e as pílulas | ✓ | ✓ (explicação de cada grupo) | ok |
| Resumo: Leads novos, Mudanças de etapa, No Freela | ✓ | ✓ "ⓘ De onde vem" | ok |
| Resumo: Mensagens enviadas | ✓ | ✓ | ✗ o rótulo "marcadas à mão" mente (achado 3) |
| Cartão do Dashboard | ✓ | ✓ | ✗ "todas as praças" × Tarefas de uma praça (achado 6) |
| Funil: as 6 métricas | ✓ (dentro do valor) | ✓ "Como contamos" | (2) "Dias até cadastrar" sem o N; "Valor estimado" ainda sem definição (U5) |
| Automações: última rodada | ✓ | ✓ | ok |
| Automações: últimos 7 dias | ✓ | ✗ fonte e janela erradas (achado 5) | corrigir |
| Entrada: fila e limite | ✓ | ✗ "nesta praça" (achado 1); "por pessoa" (achado 4) | corrigir |

---

## 8. O que olhar no navegador primeiro (nesta ordem)

1. **Entrada × Tarefas, com duas praças com leads** (achado 1). Compare o "Primeiro contato" de Tarefas com o número da Entrada, e veja se
   aparecem leads da outra praça.
2. **Entrada: "Feito ▾ → Liguei" num lead novo, esperar 5 s e recarregar** (achado 2). O lead volta?
3. **Tarefas em 360 × 640 e em 390 × 844** (achado 8). Onde começa a primeira linha? Depois, o fluxo da T1: Abrir WhatsApp → voltar →
   Feito → 5 s → a linha sai. Repita trocando de aba antes dos 5 s (o "Desfazer" some e o pedido sai).
4. **Dashboard com "Praça: todas" e duas praças** (achado 6). O número do cartão bate com o de Tarefas?
5. **Funil em 360 px e em 1280 px, com números de 3 dígitos** (achado 14). No celular, abra a etapa 3 e digite na busca (achado 15).
6. **Contraste do selo "Falhou na última rodada"** (achado 7), com o seletor de cor do DevTools. Os outros elementos com
   `bg-destructive/10 text-destructive` servem de amostra.
7. **Painel do lead com a rede em "Slow 3G"** (achado 11): o toque no nome mostra alguma coisa? Esc devolve o foco ao nome da linha?
8. **Teclado e leitor de tela numa linha de Tarefas** (NVDA ou VoiceOver): Tab até "Feito", Enter, escolher "Liguei". O anúncio diz
   "Ligação registrada para {nome}. Faltam N tarefas."? Depois, Desfazer: o foco volta ao "Feito"?
9. **Zoom de 200% em Tarefas no computador.** A tela vira uma coluna, e o resumo vai para o fim, sem cobrir nada.

---

## 9. Decisões em aberto

**Para o dono:**

1. O "Feito" da Entrada passa o lead para "Contatado"? Recomendo que sim (achado 2).
2. Há alguma cadência "Rodando" no modo "Fila manual" em produção? Se houver, o achado 3 é corrigido antes de `CRM_TASKS_ENABLED`. O D6
   (a cadência marcar como enviada sem ninguém ter mandado) continua uma decisão de produto: ela zera os "dias parado" e esconde esses
   leads da A4.
3. U5, "Valor estimado": é por mês? por vaga? Continua sem resposta.
4. U7, a pílula "Tarefas" logo depois de "Dashboard" no celular: continua para depois.

**Para o arquiteto:**

5. `praca_id` (e sem `is_test`) em `GET /v1/leads/queue` (achado 1).
6. A conta de mensagens do resumo separada por `cadence_id` / `disparo_id` (achado 3).
7. Em `GET /v1/crm/tasks`: `city`, `leads_total` e o nome da cadência na T3 (achado 12).
8. `avg_days_n` nas métricas do funil (achado 14).
9. Um código próprio para a T1 já marcada (achado 23).
10. O texto do aviso "busca + cadência" mudar da API para o web (achado 10).
