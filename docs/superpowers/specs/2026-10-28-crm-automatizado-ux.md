# CRM automático do Praça: revisão de UX e especificação das telas

Data: qua 28/10/2026. Status: revisão da designer ANTES da implementação (regra do dono de 11/10: arquiteto + designer antes de mudança
drástica). Objeto: `docs/superpowers/specs/2026-10-28-crm-automatizado-design.md` (§1, §3 A5/A6 e §4).

Fontes lidas: o desenho; `CLAUDE.md` (Casca da equipe, Visual da Lovable, E5a/E5b); `2026-10-26-ui-lovable-ux.md` e o progresso;
as telas redesenhadas (`inicio`, `PainelGestor`, `pracas`, `representantes`, `clientes`/`ListaClientes`, `vouchers`/`CuponsEquipe`), as telas
antigas do Comercial (`funil`, `entrada`, `hoje`, `bits.tsx`, `LeadPanel.tsx`, `mensagens`, `Disparos`), `AppShell`, `acesso.ts`,
`enderecos.ts`, `ui-store.ts`, `components/ui/{badge,sheet,EmBreve}.tsx`, `globals.css`, `leads.service.ts` (`metrics()`), o catálogo do funil
e as capturas de 27/10 (`~/Downloads/praca-telas-novas/`: Dashboard, Praças, Clientes, Representantes, Vouchers). Nada foi executado.

Quem usa: Diego (dono) e Rebeca (comercial), no computador e no celular, abrindo praças e trazendo bares e restaurantes para o Freela.
A pergunta que as telas novas precisam responder em segundos é **"o que eu faço agora, e o que o sistema já fez sozinho?"**.

Escala de severidade (Nielsen): 0 não é problema · 1 cosmético · 2 menor · 3 maior · 4 catastrófico (impede a tarefa).
Contrastes marcados "conta à mão" usam a fórmula do WCAG 2.x com as cores do catálogo e os fundos reais; o `browser-check` confere.

---

## 1. Achados

### 1.1 Maiores (3): resolver antes de implementar

1. **[3] O resumo do dia no topo empurra as tarefas para fora da tela no celular.** O desenho põe "resumo do dia no topo (cartões com a
   conta)" e as tarefas embaixo. São 5 números com conta: no celular (390 px) isso ocupa cerca de 700 px antes da primeira tarefa. A tela
   existe para agir, e a regra do projeto é "ação antes de informação". **Correção:** as tarefas vêm primeiro. No desktop (`lg`), o resumo
   fica numa coluna à direita. No celular, ele vai para o fim da página e o topo ganha o link "Ver o resumo do dia ↓".

2. **[3] Às 8h o resumo de "hoje" está quase vazio.** O A4 roda às 6h10, o A3 começa às 7h e a equipe ainda não fez nada. Quem abre a
   tela de manhã quer saber o que aconteceu **ontem**. **Correção:** o resumo tem o seletor "Hoje | Ontem" (o `day=` da API já existe).
   Quando o resumo de hoje está todo zerado, ele mostra o vazio "Ainda não aconteceu nada hoje." e o botão [Ver o resumo de ontem].

3. **[3] "Abrir WhatsApp" não é "mandei a mensagem".** Na Entrada de hoje, tocar no link `wa.me` já grava "Mensagem enviada pela fila do
   dia." (`entrada/page.tsx`, `FilaRow`, `onClick` do `<a>`). Se a pessoa abre a conversa e desiste, ou se o número não tem WhatsApp, a ficha
   registra um contato que não houve, e a tarefa some. **Correção:** em Tarefas, "Abrir WhatsApp" **não grava nada**. Só "Feito" grava. A
   Entrada deve seguir o mesmo padrão (§3.6). Isso muda um comportamento da Entrada, por isso fica como decisão em aberto (§5, item 1).

4. **[3] Um "Feito" genérico serve mal às duas consequências diferentes.**
   - Na T1, "Feito" é `POST /v1/sends/:id/mark`, que tira a mensagem da fila para sempre. O comentário de `Disparos.tsx` explica o dedup.
     Um toque errado perde a mensagem da cadência.
   - Na T2–T5, "Feito" grava um contato (`call`, `msg_out`, `visit`, `note`). O servidor precisa saber **o que** foi feito, e o desenho
     não diz como a tela pergunta.

   **Correção:** na T1, "Feito" leva 1 toque e é o fim do par "Abrir WhatsApp → Feito". Na T2–T5, "Feito ▾" abre o menu "O que você fez?"
   (Liguei · Mandei mensagem · Visitei · Só anotar…), o que dá 2 toques. Nas duas, a linha mostra "Desfazer" por 5 s antes de gravar (§3.1.6).

5. **[3] Números que mentem quando o Freela não está conectado** (hoje, em produção, ele não está). "No Freela: 0 cadastros" parece um
   resultado ruim, mas na verdade o Praça não tem como saber. A T5 ("Ajudar a publicar a 1ª vaga") pode mostrar quem já publicou, porque
   `first_vacancy_at` só existe nos cadastros assistidos e `freela_hirings` só conta contratação paga. **Correção:** sem o Freela, o número
   vira "—" com a linha "Precisa da conexão com o Freela". O motivo da T5 diz "nenhuma vaga **vista** no Freela" e o grupo leva um aviso
   (§3.1.5).

6. **[3] Bug na conta do Funil, que o A4 vai piorar** (para o arquiteto, antes de ligar o A4). Em `leads.service.ts` `metrics()`, nas linhas
   248–255, `contatados = stage >= 2` e `cadastrados = stage >= 5` também pegam a etapa **8 "Perdido / reaquecer"**. Então cada lead perdido
   conta como cadastrado em "Contatado → cadastrado" e entra em "Dias até cadastrar". O A4 manda leads de 2 para 8 todo dia, e a taxa
   **sobe** quando o funil piora. Além disso, nenhuma das 6 métricas traz a conta (numerador e denominador), que a regra do dono de 08/10
   exige. **Correção:** a API conta a etapa 8 à parte e devolve `{ n, de }` em cada taxa (a tela escreve "9 de 30 = 30%").

7. **[3] Três lugares dizem a mesma coisa.** A tela `/hoje` (menu "Ações") tem a seção "Funil — contratantes" (`FunilHoje`), com próximo
   passo vencido e leads parados, que são a T3 e a T4. O sino também avisa "lead crítico" e "etapa travada". E agora "Tarefas" e "Ações"
   ficam lado a lado no mesmo grupo do menu, com nomes quase sinônimos. **Correção:** com `features.crm_tasks`, a seção `FunilHoje` da
   `/hoje` dá lugar a uma linha-link "Os contatos com leads estão em Tarefas ›". O sino continua, mas os avisos de lead levam a Tarefas
   (`ROTA.tarefas`). O item "Ações" passa a se chamar **"Ações da praça"**, pois são as ações do plano de abertura (decisão do dono, §5).

8. **[3] O painel do lead, que Tarefas abre em toda linha, não é um diálogo.** `LeadPanel` é um `<aside>` fixo sobre um `<div>`. Ele não tem
   `role="dialog"`, não prende o foco, não fecha com Esc e não devolve o foco a quem o abriu. O botão "Fechar" mede cerca de 26 px (abaixo dos
   24 px do WCAG 2.5.8 com o ícone de 14 px e `p-1.5`, e longe dos 44 px do projeto). No celular ele cobre a tela inteira. **Correção mínima
   (só a casca, sem redesenhar o conteúdo):** montar o conteúdo dentro do `Sheet` de `components/ui/sheet.tsx` (Radix Dialog: foco preso, Esc,
   `aria-modal`, foco devolvido), com `side="right"`, `className="w-full sm:max-w-lg overflow-y-auto"`, título no `SheetTitle` e fechar de
   44 × 44 no celular.

9. **[3] As cores das etapas usadas como TEXTO reprovam no contraste** (conta à mão; o `browser-check` confere). Hoje elas aparecem como
   texto no cabeçalho da coluna do Funil (sobre `bg-card/60` em cima do fundo da página: quase branco), nos chips "Mover para etapa" e
   no selo de etapa do `LeadPanel` (sobre branco, ou sobre a própria cor a 20%).

   | Etapa | Cor | No fundo da coluna | No branco | No selo (cor a 20%) |
   |---|---|---|---|---|
   | 5 Cadastrado | `#ECA826` | 2,0:1 | 2,1:1 | ≈ 1,8:1 |
   | 2 Contatado | `#5A9BC4` | 2,9:1 | 3,0:1 | ≈ 2,6:1 |
   | 6 Primeira vaga rodada | `#C4881A` | 2,9:1 | 3,1:1 | ≈ 2,7:1 |
   | 7 Cliente ativo | `#3E8E5A` | 3,9:1 | 4,0:1 | ≈ 3,6:1 |
   | 3 Conversa aberta | `#3E7EA8` | 4,2:1 | 4,4:1 | ≈ 4,0:1 |
   | 1 Lead novo / 4 Reunião / 8 Perdido | `#6E6B60` / `#6B5B8A` / `#B4432E` | 5,1 / 5,8 / 5,3 | 5,3 / 6,0 / 5,6 | passam no branco |

   Cinco das oito reprovam (texto de 12 px pede 4,5:1). **Correção:** a cor da etapa fica só em bolinha ou faixa (decoração,
   `aria-hidden`), e o texto é sempre `text-foreground`. Nas telas desta leva (Funil e chips do `LeadPanel`), isso vale já. O selo branco
   sobre a cor da etapa na tela Mensagens também reprova (branco sobre `#ECA826` dá 2,1:1) e fica para depois (§4).

10. **[3] No celular, o Funil é um quadro de 8 colunas com rolagem lateral, e arrastar não funciona.** O arrastar do HTML5 não funciona no
    toque nem no teclado. O WCAG 2.2 **2.5.7 (Movimentos de arrasto)** é nível AA e exige um caminho com um toque só. Hoje esse caminho
    existe, mas está escondido ("Mover para etapa", dentro do painel). **Correção:** abaixo de `md`, o Funil vira uma lista por etapa
    (acordeão, §3.4). Em qualquer largura, a dica fica visível: "Arraste o cartão para mudar de etapa, ou abra o lead e use “Mover para
    etapa”." O botão do cartão abre o painel, que é o caminho equivalente.

### 1.2 Menores (2)

11. **[2] "Minhas" engana.** No desenho, `person=me` traz os meus leads **e os sem dono**. Com "Minhas" ligado nas duas contas, Diego e Rebeca
    veem os mesmos leads sem dono e podem ligar para o mesmo restaurante no mesmo dia. **Correção:** abaixo das pílulas vai a linha "Em
    “Minhas” entram as suas e as que ainda não têm dono." Na linha da tarefa sem dono, aparece "Sem dono". Proposta para decisão (§5): o
    "Feito" num lead sem dono torna dono quem fez.

12. **[2] O selo "Automático" precisa de uma definição.** `last_stage_auto` deve valer para tudo o que não foi uma pessoa da equipe: o A2, o A3
    e o A4, o sync de hoje (autor "Freela (sincronização)") e a etapa depois da visita? O desenho não diz. Se a visita contar, quase todo
    lead da etapa 1 leva o selo e ele vira ruído. **Proposta:** o selo aparece só quando a mudança veio do autor "Automático" ou "Freela
    (sincronização)". A mudança pela visita mostra o nome do representante, que é uma pessoa. O arquiteto decide (§5).

13. **[2] "Freela: N contratações" com o nome honesto.** O campo do Freela conta vagas **pagas e não canceladas**. **Correção:** o selo diz
    "Freela: 2 contratações pagas". No celular, se cortar, fica "Freela: 2 pagas" e o nome acessível continua completo.

14. **[2] O erro da rodada é texto técnico.** `crm_automation_runs.error` é a mensagem da exceção. Mostrar esse texto para todos fere a regra
    4 (erro em linguagem comum). **Correção:** para todos, uma frase comum ("A última rodada não terminou. O Praça tenta de novo às 15h00.").
    O texto cru fica só para o admin, recolhido em "Detalhe técnico". O mesmo vale para os nomes das chaves (`CRM_…_ENABLED`): só o admin vê,
    em "Como ligar".

15. **[2] No modo "Via Freela", "enviada" quer dizer "entregue ao Freela".** As memórias de 07/10 (Meta, erro 131042) e de 27/09 (Z-API
    desconectada) mostram o canal do Freela parado sem que nada avisasse. E as respostas só contam quando alguém as registra à mão, porque o
    Freela não devolve resposta (`Disparos.tsx`). **Correção:** a conta das mensagens diz isso com todas as letras (§3.1.7).

16. **[2] O cartão "Comercial hoje" no Dashboard pode ser lido como dado do período.** O Dashboard abre em "7 dias" e "Praça: todas". O cartão
    é de **hoje** e da API **por praça**. **Correção:** o título leva a data ("Comercial hoje · qua 28/10"), a linha "Não segue o período
    acima" e a praça. Pedido ao arquiteto: `praca_id` opcional em `GET /v1/crm/summary` (ausente = todas), para o cartão seguir o seletor do
    Dashboard (§5).

17. **[2] O lugar do cartão no Dashboard.** No celular, os 8 cartões ocupam cerca de 2.600 px (captura `03-dashboard-celular`). Um cartão do
    Comercial depois deles ninguém vê. **Correção:** logo abaixo da faixa "Atenção agora" e antes dos 8 cartões **[desvio da Lovable: regra
    do dono, celular; ação antes de informação]**.

18. **[2] Tarefas da praça ativa somem sem aviso.** `useActivePraca` lê `user.active_praca_id`, e abrir `/pracas/[id]` torna aquela praça a
    ativa (CLAUDE.md, E5a). Quem olha outra praça no detalhe volta a Tarefas e vê outra lista, sem saber por quê. **Correção:** o cabeçalho
    comum do Comercial mostra o seletor "Praça" sempre à vista (§3.7). Pedido ao arquiteto: `praca_id` opcional também em `GET /v1/crm/tasks`
    (ausente = todas as praças), para a opção "Todas as praças" (§5).

19. **[2] O link de Automações para as cadências cai na aba errada.** Mensagens guarda a aba num `useState` e sempre abre em "modelos".
    **Correção:** Mensagens lê `?aba=cadencias` (e `disparos`) para abrir na aba certa. É uma linha de código e não muda a lógica.

20. **[2] Na Entrada, "desfazer importação" apaga leads sem pedir confirmação.** É uma ação de alto risco sem a consequência escrita.
    **Correção:** `AlertDialog` com a consequência (§3.6).

21. **[2] Alvos e letras pequenas no Comercial antigo.** Há botões de `px-2 py-1 text-[11px]` (cerca de 22 px de altura), rótulos `tag` de
    10 px em caixa alta e textos `text-[11px]`/`text-[10px]`. No celular eles reprovam o WCAG 2.5.8 e o piso de 12 px do projeto.
    **Correção nesta leva:** só no Funil, na Entrada e nas telas novas, com `Button`, `Input` e `Badge` de `components/ui` (o `Button` já tem
    `min-h-11 md:min-h-0`). Nas outras telas do Comercial, isso fica para depois (§4).

22. **[2] As métricas do Funil não dizem o que medem.** "Valor estimado: R$ 48.000" não diz de quê (é a estimativa por classificação,
    `estValue(classe)`, das etapas 1 a 6, mas por mês ou por vaga?). "Dias até cadastrar" é uma média, e o rótulo não diz. **Correção:** cada
    métrica com a conta, e a fonte num "ⓘ Como contamos". A definição do valor fica para o dono (§5).

23. **[2] O Funil não tem estado de erro.** Se `useLeads` falha, as 8 colunas mostram "Nada aqui." e parece que a praça não tem leads.
    **Correção:** cartão de erro com "Tentar de novo" (§3.4).

24. **[2] Com o Comercial ligado, o menu do celular tem 21 pílulas** e "Tarefas" fica na 11ª posição, depois de rolar a faixa. **Correção
    nesta leva:** o cartão do Dashboard leva a Tarefas com 1 toque. **Depois (decisão):** no celular, a pílula "Tarefas" vem logo depois de
    "Dashboard".

25. **[2] Na Entrada, o limite "leads por dia por pessoa" muda para a equipe inteira**, num campo solto no meio da fila e sem aviso.
    **Correção:** o campo vai para um `<details>` "Ajustar o limite", com o rótulo "Limite de leads novos por pessoa, por dia (vale para toda a
    equipe)".

### 1.3 Cosméticos (1)

26. **[1] "12d" no cartão do Funil** é abreviação. Fica "12 dias parado".
27. **[1] "Lead" no Comercial × "Cliente" nas telas da Lovable**, para o mesmo registro. O vocabulário da Lovable está fechado e não se reabre.
    Dentro do Comercial, "lead" fica (é o nome da etapa "Lead novo" e do botão "Novo lead"). Nas linhas de Tarefas, a tela usa o nome do
    lugar, e "lead" só aparece em títulos e contas.
28. **[1] O rótulo `tag` em cima do título** ("Funil de contratantes", "Comunicação") sai. As telas redesenhadas não o usam (UX 26/10 §1.3,
    item 8). O cabeçalho comum (§3.7) substitui.

---

## 2. Padrões que todas as telas desta leva copiam (nada de estilo novo)

Tudo sai das telas redesenhadas em 26–27/10. A regra é copiar, não reestilizar.

| Peça | De onde copiar | Classes / texto |
|---|---|---|
| Cartão | `PainelGestor` `CARTAO` | `rounded-2xl bg-card p-5 shadow-card` (lista com linhas: sem `p-5`, `overflow-hidden`) |
| Título da tela | Praças, Representantes | h1 `text-3xl font-semibold`; subtítulo `p` `text-muted-foreground` |
| Título de seção | Representantes ("Em campo hoje") | h2 `text-lg font-semibold` |
| Número | Dashboard | `text-3xl font-semibold` (no resumo lateral, `text-2xl`; nunca menor que 24 px) |
| Conta do número | Dashboard | `text-xs text-muted-foreground`, sempre visível |
| Fonte do número | Dashboard | `<details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer py-1">ⓘ De onde vem</summary>…` |
| Pílulas de escolha única | `ListaClientes` `pilula()` | `flex min-h-11 items-center gap-2 rounded-full border px-3 py-1 text-sm md:min-h-9`; escolhida `border-primary bg-primary text-primary-foreground`; `role="group"` + `aria-label` + `aria-pressed` |
| Seletor segmentado (2–4 opções) | `PainelGestor` "Período" | `flex gap-1 rounded-lg bg-muted p-1` + `Button size="sm"` `default`/`ghost` + `aria-pressed` |
| Carregando | todas | `aria-busy="true"` + esqueleto `animate-pulse rounded-2xl bg-muted` no formato do conteúdo |
| Erro | Praças, Representantes | cartão + `<p role="alert" className="text-sm text-destructive">{apiErrorMessage(error, '…')}</p>` + `Button variant="outline"` "Tentar de novo" |
| Módulo desligado (pela URL) | Clientes, Vouchers | cartão `p-5 text-sm`: "Este recurso ainda não está ligado neste servidor." (sem chamar a rota desligada) |
| Aviso neutro | Vouchers | `rounded-xl bg-secondary p-4 text-sm` |
| Menu "⋯" e menus de ação | Representantes, Vouchers | `DropdownMenu` do `components/ui`, itens `className="min-h-11"` |
| Confirmação de risco | Representantes | `AlertDialog` com a consequência escrita e o verbo no botão |

Regras desta leva:

- **Endereços:** `ROTA.tarefas = '/tarefas'` e `ROTA.automacoes = '/automacoes'` em `modules/acesso/domain/enderecos.ts` (CLAUDE.md:
  "endereço novo = valor no `ROTA`"). `montarMenu`, o cartão do Dashboard e todos os links usam `ROTA`, nunca o texto solto.
- **Menu:** com `features.crm_tasks` (e `commercial`), o grupo "Comercial" ganha "Tarefas" no começo (ícone `ListTodo`, chave
  `'tarefas'`) e "Automações" no fim (ícone `Zap`, chave `'automacoes'`; o mesmo raio do selo "Automático" e das cadências). Sem a chave, o
  grupo fica igual ao de hoje.
- **Datas:** dia de Brasília (`todaySp()`), escritas como pessoa fala: "hoje 14h02", "ontem 22h00", "seg 26/10", "há 3 dias".
- **Nunca** `Switch` nem botão com cara de interruptor para o que a tela não liga (Automações é só leitura).
- **Celular:** uma coluna, sem rolagem lateral de conteúdo; todo alvo com 44 px ou mais (`Button`/`Input` já trazem `min-h-11 md:min-h-0`).
- **Cor nunca sozinha:** situação = ícone + texto; a cor da etapa só em bolinha ou faixa decorativa (achado 9).

---

## 3. Especificação, tela a tela

### 3.1 Tarefas (`ROTA.tarefas`, nova, 1º item do Comercial)

**Job:** "Quando começo o dia (ou volto de uma visita), quero ver quem precisa de mim e resolver cada um em 2 toques, para nenhum lead
esfriar." **Critério de sucesso:** cada tarefa resolvida em 2 toques, fora o tempo da ligação ou da conversa; 10 tarefas em menos de 5 minutos,
sem contar as ligações; nenhuma tarefa marcada por engano sem como voltar.

#### 3.1.1 Wireframes

Desktop (`lg`, 2 colunas: tarefas `lg:col-span-2`, resumo `lg:col-span-1 lg:sticky lg:top-8 self-start`):

```text
┌ menu ┬────────────────────────────────────────────────────────────────────────────────┐
│      │ Tarefas                                               Praça [BH + Contagem  ▾] │
│      │ Hoje, qua 28/10 · o que precisa de você no Comercial                           │
│      │                                                                                │
│      │ ( ✓ Minhas 9 ) ( Todas 14 )                                                    │
│      │ Em “Minhas” entram as suas e as que ainda não têm dono.                        │
│      │                                                                                │
│      │ 9 tarefas para hoje                                  ┌─────────────────────────┐│
│      │ 4 mensagens + 2 leads quentes + 2 próximos passos +  │ Resumo do dia [Hoje|Ont]││
│      │ 1 conversa parada = 9 · cada lead aparece uma vez    │ qua 28/10 · BH+Contagem ││
│      │ ┌──────────────────────────────────────────────────┐ │                         ││
│      │ │ 💬 Mandar mensagem                           [4] │ │ Leads novos          12 ││
│      │ │ Mensagens das cadências e disparos para hoje.    │ │ 8 da busca automática + ││
│      │ │──────────────────────────────────────────────────│ │ 3 de visitas + 1 do for.││
│      │ │ Bar do Zé                                        │ │                         ││
│      │ │ Cadência “Lead novo”, 2ª mensagem · para hoje    │ │ Mudanças de etapa     7 ││
│      │ │ Contagem · de Rebeca                             │ │ 5 automáticas + 2 da eq.││
│      │ │ ┌──────────────────────────────────────────────┐ │ │                         ││
│      │ │ │ Oi, Zé! Aqui é a Rebeca, do Freela. Vi que…  │ │ │ No Freela             — ││
│      │ │ └──────────────────────────────────────────────┘ │ │ Precisa da conexão com  ││
│      │ │ Copiar mensagem                                  │ │ o Freela.               ││
│      │ │ [Abrir WhatsApp] [Feito] [Adiar ▾]               │ │                         ││
│      │ │──────────────────────────────────────────────────│ │ Mensagens enviadas    4 ││
│      │ │ ✓ Marcada como enviada · Desfazer                │ │ Respostas registradas 1 ││
│      │ └──────────────────────────────────────────────────┘ │ ▸ ⓘ De onde vem         ││
│      │ ┌ 🔥 Lead quente da visita                     [2] ┐ └─────────────────────────┘│
│      │ │ Restaurante Forno & Brasa                        │                            │
│      │ │ Visitado por Ana em seg 26/10 · interesse alto · │                            │
│      │ │ ninguém procurou depois                          │                            │
│      │ │ [WhatsApp] [Feito ▾] [Adiar ▾]                   │                            │
│      │ └──────────────────────────────────────────────────┘                            │
│      │ ┌ 📥 Primeiro contato ─────────────────────────────┐                            │
│      │ │ 12 leads novos esperando o 1º contato. [Abrir a Entrada]                      │
│      │ └──────────────────────────────────────────────────┘                            │
```

Celular (360–430 px, uma coluna, as tarefas antes do resumo):

```text
┌──────────────────────────────┐
│▓ ⌖ Praça          🔔  🔑  ⏻ ▓│
│ ‹ Usuários [Tarefas] Funil  ›│ ← pílulas do menu
├──────────────────────────────┤
│ Tarefas                      │
│ Hoje, qua 28/10              │
│ Praça [BH + Contagem      ▾] │
│ ( ✓ Minhas 9 ) ( Todas 14 )  │
│ Em “Minhas” entram as suas e │
│ as que ainda não têm dono.   │
│ 9 tarefas para hoje          │
│ 4 mensagens + 2 leads quentes│
│ + 2 próximos passos + 1 …    │
│ Ver o resumo do dia ↓        │
│┌────────────────────────────┐│
││💬 Mandar mensagem       [4]││
││Bar do Zé                   ││
││Cadência “Lead novo”, 2ª    ││
││mensagem · para hoje        ││
││┌──────────────────────────┐││
│││Oi, Zé! Aqui é a Rebeca…  │││
││└──────────────────────────┘││
││[     Abrir WhatsApp       ]││
││[   Feito    ][  Adiar ▾   ]││
│└────────────────────────────┘│
│┌────────────────────────────┐│
││🔥 Lead quente da visita [2]││
││Forno & Brasa               ││
││Visitado por Ana em seg …   ││
││[  Ligar   ][  WhatsApp   ] ││
││[ Feito ▾  ][  Adiar ▾    ] ││
│└────────────────────────────┘│
│ …                            │
│ Resumo do dia  [Hoje|Ontem]  │ ← id="resumo-do-dia"
└──────────────────────────────┘
```

#### 3.1.2 Hierarquia e componentes

1. `CabecalhoPagina` (§3.7): h1 **"Tarefas"**; subtítulo **"Hoje, {qua 28/10} · o que precisa de você no Comercial"** (no celular, só
   "Hoje, qua 28/10"); seletor **"Praça"** (praça ativa). Sem botão de ação no topo.
2. Pílulas `role="group" aria-label="De quem"`: **"Minhas {n}"** e **"Todas {n}"** (com ✓ antes do texto na escolhida). Elas usam o
   `hojePerson` do `lib/ui-store.ts`, o mesmo da `/hoje` e da Entrada, para as três telas concordarem: "Minhas" grava o id de quem está
   logado e "Todas" grava `'all'`. Se o valor guardado for o id de outra pessoa (escolhida na `/hoje`), Tarefas **mostra** "Todas" mas
   **não regrava** o `hojePerson` enquanto ninguém tocar numa pílula. Assim a escolha feita na `/hoje` continua lá quando a pessoa voltar.
   O padrão do `hojePerson` é `'all'`, então quem nunca escolheu abre em "Todas", como na `/hoje`. Embaixo, `text-sm text-muted-foreground`: **"Em “Minhas” entram as suas e as que ainda não têm dono."** Os números das duas
   pílulas pedem `counts: { me, all }` na resposta (§5). Sem isso, só a escolhida mostra o número.
3. Linha de contagem (`aria-live="polite"`): `p` `text-lg font-semibold` **"{9} tarefas para hoje"** e, embaixo, `text-sm
   text-muted-foreground` com a conta: **"4 mensagens + 2 leads quentes + 2 próximos passos + 1 conversa parada = 9. Cada lead aparece uma
   vez, na tarefa mais urgente."** No celular, o link **"Ver o resumo do dia ↓"** (`href="#resumo-do-dia"`, `min-h-11`).
4. Grupos T1–T5, na ordem do desenho. Cada um é um `section` cartão `rounded-2xl bg-card shadow-card overflow-hidden`,
   `aria-labelledby`, e grupo sem tarefa não aparece:
   - topo `flex items-center gap-2 px-5 pt-5`: ícone `h-5 w-5 text-primary` `aria-hidden`, h2 `text-lg font-semibold`, `Badge
     variant="secondary"` com o número e `<span className="sr-only">tarefas</span>`;
   - explicação `px-5 pb-3 text-sm text-muted-foreground`;
   - `ul` `divide-y border-t` com as linhas (§3.1.3);
   - com mais de 10 linhas, mostra 10 e `Button variant="ghost" className="w-full"` **"Ver mais {30}"**.
5. Cartão **"Primeiro contato"** (só com N > 0): ícone `Inbox`, h2 "Primeiro contato", **"{12} leads novos esperando o 1º contato nesta
   praça."** e `Button variant="outline" asChild` → `/entrada`, **"Abrir a Entrada"**. Usar "1º contato" e não "1º toque", porque "toque"
   confunde com o toque na tela.
6. `Resumo do dia` (§3.1.6), `id="resumo-do-dia"`: coluna da direita no `lg`, último bloco no celular.

#### 3.1.3 Linha da tarefa (`LinhaTarefa`, o mesmo componente da fila da Entrada, §3.6)

`li` `px-5 py-4`, de cima para baixo:

1. Nome do lugar: `<button type="button" aria-haspopup="dialog">`, `inline-flex min-h-11 items-center text-left font-medium
   hover:underline md:min-h-0`. Abre o `LeadPanel` (`openLead(id)`, já dentro do `Sheet`, achado 8).
2. Motivo, numa frase (`text-sm`), pelos modelos da tabela de §3.1.4.
3. Apoio (`text-xs text-muted-foreground`): **"{cidade} · de {Rebeca}"**. Em "Minhas", sem o dono. Lead sem dono: **"Sem dono"**.
4. Só na T1: a mensagem, `rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap line-clamp-3`, e `Button variant="link" size="sm"`
   **"Copiar mensagem"** (aviso "Mensagem copiada.").
5. Ações, `mt-3 flex flex-wrap gap-2`. No celular, cada botão tem `flex-1 basis-[calc(50%-0.25rem)]`, e o "Abrir WhatsApp" da T1 ocupa a
   linha inteira (`basis-full`):

| Grupo | Botões (na ordem) |
|---|---|
| T1 | **[Abrir WhatsApp]** (`default`, ícone `MessageCircle`, `<a target="_blank" rel="noopener noreferrer">` com `wa.me` + `?text=`) · **[Feito]** (`outline`) · **[Adiar ▾]** (`outline`) |
| T2–T5 | só no celular, **[Ligar]** (`outline`, `Phone`, `<a href="tel:…">`, `md:hidden`) · **[WhatsApp]** (`outline`, conversa sem texto pronto) · **[Feito ▾]** (`default`) · **[Adiar ▾]** (`outline`) |

- Sem telefone: "Ligar" e "WhatsApp" somem, e o apoio diz **"Sem telefone no cadastro: abra o lead para ver outro contato."**
- **"Abrir WhatsApp" não grava nada** (achado 3). Depois de tocar nele, a linha mostra `text-sm` **"Mandou? Toque em Feito."** e o "Feito"
  passa a `default` (o "Abrir WhatsApp" vira `outline`). Esse estado fica só na memória da página, guardado pelo id do envio.

#### 3.1.4 Textos por grupo

| # | Título (h2) · ícone | Explicação | Motivo da linha (modelo · exemplo) |
|---|---|---|---|
| T1 | **Mandar mensagem** · `MessageCircle` | "Mensagens das cadências e dos disparos marcadas para hoje. Você manda pelo WhatsApp e marca como feito." | "{origem} · {para hoje \| atrasada desde seg 26/10}" · "Cadência “Lead novo”, 2ª mensagem · para hoje". A API precisa mandar a origem já escrita (cadência e passo, ou nome do disparo), §5. |
| T2 | **Lead quente da visita** · `Flame` | "Gostaram na visita do representante e ninguém da equipe procurou depois." | "Visitado por {Ana} em {seg 26/10} · interesse {alto \| médio} · ninguém procurou depois" |
| T3 | **Próximo passo vencido** · `CalendarClock` | "Combinados com data de hoje ou de antes, inclusive as ligações das cadências." | "“{Ligar para o decisor}” era para {hoje \| seg 26/10, há 2 dias}". Vindo da cadência: "Ligação da cadência “{Reaquecer}” · era para hoje" |
| T4 | **Conversa parada** · `Hourglass` | "Conversa aberta ou reunião marcada, sem contato há 5 dias ou mais." | "{Conversa aberta \| Reunião ou visita marcada} · último contato {qui 22/10}, há {6} dias" |
| T5 | **Ajudar a publicar a 1ª vaga** · `FilePlus2` | "Cadastrados no Freela há 3 dias ou mais, sem vaga vista lá." | "Cadastrado desde {sex 23/10}, há {5} dias · nenhuma vaga vista no Freela" |

T5 sem o Freela conectado: aviso no topo do grupo, `mx-5 mb-3 rounded-lg bg-secondary p-3 text-sm`: **"O Freela não está conectado, então o
Praça não vê as vagas. Confira no Freela antes de ligar."** (achado 5).

#### 3.1.5 Feito, Adiar e Desfazer

**T1, "Feito"** (1 toque): a linha recolhe para **"✓ Marcada como enviada · [Desfazer]"**. Depois de 5 s, sai `POST /v1/sends/:id/mark`
(`status: 'enviada'`).

**T2–T5, "Feito ▾"** (`DropdownMenu`, itens `min-h-11`): `DropdownMenuLabel` **"O que você fez?"**, com os itens:

- **"Liguei"** (`Phone`) → `contact: 'call'`
- **"Mandei mensagem"** (`MessageCircle`) → `'msg_out'`
- **"Visitei"** (`MapPin`) → `'visit'`
- **"Só anotar…"** (`StickyNote`) → abre um `Dialog` "Anotar em {nome}", com `Textarea` de rótulo visível **"O que aconteceu?"**
  (obrigatório; erro "Escreva o que aconteceu.") e os botões **[Salvar nota]** **[Cancelar]**.

A linha recolhe para a confirmação do que foi escolhido: **"✓ Ligação registrada"**, **"✓ Mensagem registrada"**, **"✓ Visita
registrada"** ou **"✓ Nota salva"**, seguida de **"· [Desfazer] · [Abrir o lead]"**. Na T3, acrescenta **"O próximo passo “{Ligar para o
decisor}” foi limpo."**, e "Abrir o lead" vira **"Marcar o próximo passo"** (abre o painel, que tem o "Próximo passo" no topo). Depois de 5 s,
sai `POST /v1/crm/tasks/done`.

**"Adiar ▾"** (todas): `DropdownMenuLabel` **"Adiar até"**, com os itens **"Amanhã · qui 29/10"**, **"Em 3 dias · sáb 31/10"** e **"Em 1
semana · qua 04/11"**. Embaixo, `text-xs text-muted-foreground`: **"O lead some das tarefas e da Entrada até lá."** A linha mostra **"Adiado
para qui 29/10 · [Desfazer]"**. Depois de 5 s, sai `POST /v1/crm/tasks/snooze`.

**Desfazer (envio adiado, sem API nova):**

- Por 5 s nada vai ao servidor. "Desfazer" devolve a linha como estava, e o foco volta ao botão usado.
- Passados os 5 s, o pedido sai. Deu certo: a linha sai e a lista é relida. Falhou: a linha volta com a mensagem do servidor
  (`apiErrorMessage`) e **[Tentar de novo]**. Exemplo para a T1 já marcada por outra pessoa (o código fica com o arquiteto): "Alguém já
  marcou esta mensagem como enviada."
- Saiu da tela antes dos 5 s? Manda na hora, na desmontagem do componente. Fechou a aba? No `pagehide` só dá para mandar se o cliente http
  (`modules/shared/infrastructure/http.ts`) aceitar `keepalive`, o que está no §5, item 14. Sem isso, o envio adiado perde o que foi marcado
  quando a aba fecha, e o arquiteto escolhe entre acrescentar o `keepalive` e criar uma rota de desfazer.
- Uma rota de desfazer no servidor seria a alternativa, mas o `mark` não volta e o evento só recebe inserção. Fica para o arquiteto (§5).

**Atualização:** relê ao voltar para a aba (o padrão do TanStack, que é quando a pessoa volta do WhatsApp) e de 60 em 60 s, como o
Dashboard. Linha em confirmação ou com menu aberto não pula: a releitura espera ela terminar.

#### 3.1.6 Resumo do dia

Cartão `rounded-2xl bg-card p-5 shadow-card`, `section aria-labelledby`:

- h2 **"Resumo do dia"** e, à direita, o segmentado **"Hoje | Ontem"** (`role="group" aria-label="Dia do resumo"`).
- `text-sm text-muted-foreground`: **"{qua 28/10} · {BH + Contagem}"**.
- Lista `dl`/`div` com `divide-y`. Em cada linha: rótulo `text-sm text-muted-foreground`, número `text-2xl font-semibold` à direita e a
  conta `text-xs text-muted-foreground` embaixo.

| Rótulo | Conta (exemplo) | Zero / sem dado |
|---|---|---|
| **Leads novos** | "8 da busca automática + 3 de visitas + 1 do formulário" | "Nenhum lead criado hoje." |
| **Mudanças de etapa** | "5 automáticas + 2 da equipe" e, na 2ª linha, "Para: Cadastrado 3 · Perdido / reaquecer 2 · Conversa aberta 2" | "Nenhum lead mudou de etapa hoje." |
| **No Freela** | "2 cadastros + 1 primeira contratação + 0 clientes ativos" | sem a conexão: **"—"** e "Precisa da conexão com o Freela." |
| **Mensagens enviadas** | fila manual: "marcadas como enviadas hoje"; Via Freela: "3 entregues ao Freela + 1 marcada à mão. O Praça não sabe se chegaram no WhatsApp." | "Nenhuma mensagem enviada hoje." |
| **Respostas registradas** | "Só conta a resposta registrada no Praça: o WhatsApp não avisa." | "Nenhuma resposta registrada hoje." |

- "Tarefas abertas agora" **não** se repete aqui: a contagem da lista (§3.1.2, item 3) já é esse número. O número aparece no cartão do
  Dashboard.
- Embaixo, um `<details>` **"ⓘ De onde vem"**: "Leads novos: leads criados em 28/10 (dia de Brasília) nesta praça, sem os de teste e os
  arquivados. Mudanças de etapa: eventos de etapa na ficha dos leads em 28/10; “automáticas” = autor Automático ou Freela (sincronização).
  No Freela: leads que chegaram hoje a Cadastrado, Primeira vaga rodada ou Cliente ativo pelo Freela (quadro de contratantes lido às 14h00).
  Por enquanto, Cliente ativo = 2 contratações pagas ou mais. Mensagens: fila de mensagens com envio ou resposta registrados em 28/10."
- Os textos das contas saem de uma função pura no web (`resumoDoDia(…)`, como `cartoesDoPainel`), testada no vitest. A API manda contagens
  estruturadas (por origem, por autor e destino, por modo), não frases.
- Hoje todo zerado: **"Ainda não aconteceu nada hoje."** + `Button variant="outline" size="sm"` **"Ver o resumo de ontem"** (achado 2).

#### 3.1.7 Estados

| Situação | O que aparece |
|---|---|
| `features.crm_tasks` desligada (pela URL) | cabeçalho + "Este recurso ainda não está ligado neste servidor." **Nenhuma chamada a `/v1/crm/*`** (desenho §7: nunca sondar 404) |
| Lendo o `features` | esqueleto `h-40` |
| Sem praça | cartão: "Nenhuma praça ainda. As tarefas são por praça." + [Abrir Praças] (`ROTA.pracas`) |
| Carregando as tarefas | 2 esqueletos de grupo (`h-48`) e, no `lg`, o do resumo (`h-80`) |
| Erro nas tarefas | cartão de erro: `apiErrorMessage(error, 'Não deu para carregar as tarefas. Verifique a internet e tente de novo.')` + [Tentar de novo]. O resumo é outra consulta e continua de pé |
| Erro no resumo | dentro do cartão do resumo: "Não deu para carregar o resumo." + [Tentar de novo]. As tarefas continuam |
| Tudo feito | cartão `p-8 text-center`: `CheckCircle2 h-8 w-8 text-success` `aria-hidden`, h2 **"Tudo em dia"**, p **"Nenhuma tarefa para hoje nesta praça. Quando uma mensagem vencer, um cliente gostar da visita ou uma conversa parar, ela aparece aqui."** Com leads novos na Entrada: [Abrir a Entrada ({12} leads novos)]; sem eles: [Ver o funil] |
| "Minhas" vazio, "Todas" não | **"Nada seu agora. Há {5} tarefas de outras pessoas."** + [Ver todas] |
| Praça sem nenhum lead | **"Esta praça ainda não tem leads."** + "Os leads entram pela visita dos representantes, pelo formulário, pela busca de estabelecimentos ou por planilha." + [Abrir a Entrada]. Pede `leads_total` na resposta (§5); sem ele, cai em "Tudo em dia" |
| Freela não conectado | **sem faixa na página toda**: só o aviso do grupo T5 (§3.1.4) e o "—" do resumo. As outras tarefas funcionam |

#### 3.1.8 Acessibilidade (WCAG 2.2 AA)

- ✓ h1 → h2 por grupo; listas em `ul`/`li`; resumo em `dl`.
- ✓ Nomes únicos: o botão do nome é o nome do lugar; **"Feito"** tem `aria-label="Feito: {nome}"` e **"Adiar"** tem `aria-label="Adiar:
  {nome}"` (o texto visível vem primeiro no nome acessível, WCAG 2.5.3); "Abrir WhatsApp" leva `sr-only` " de {nome} (abre em outra aba)".
- ✓ Uma região `aria-live="polite"` `sr-only` por página anuncia cada resultado: **"Ligação registrada para Bar do Zé. Faltam 8
  tarefas."**, **"Desfeito."**, **"Adiado para qui 29/10."**
- ✓ Foco: quando a linha sai, ele vai ao nome da linha seguinte. Se o grupo acabou, vai ao h2 do próximo grupo (`tabIndex={-1}`). Se não
  sobrou tarefa, vai ao h2 "Tudo em dia". Nunca cai no `body` (2.4.3).
- ✓ Menus e diálogos são os Radix de `components/ui` (teclado, Esc, foco devolvido). O `LeadPanel` fica dentro do `Sheet` (achado 8).
- ✓ Alvos: 44 px no celular (`Button`); links "Copiar mensagem" e "Ver o resumo do dia" com `min-h-11`.
- ✓ 2.4.11 (Foco não encoberto): a tela não tem barra fixa. Se uma for acrescentada no celular, o conteúdo ganha o `pb` dela e o
  `scroll-padding-bottom`.
- ✓ Contraste: só tokens já medidos na UX de 26/10 (`--muted-foreground` 5,3–5,5:1, `--success` 5,6:1).
- ✓ `prefers-reduced-motion`: o recolher da linha não anima (`motion-reduce:transition-none`).

#### 3.1.9 Toques

| Ação | Toques |
|---|---|
| Mensagem da fila (T1) | **2** (Abrir WhatsApp → Feito), mais o envio no WhatsApp |
| Lead quente, próximo passo, conversa parada, 1ª vaga (T2–T5) | **2** (Feito → Liguei) |
| Ligar pelo celular e registrar | **3** (Ligar → Feito → Liguei) |
| Adiar | **2** · Desfazer **1** · Abrir o lead **1** |
| Chegar a Tarefas | **1** pelo menu ou pelo cartão do Dashboard |

### 3.2 Automações (`ROTA.automacoes`, nova, último item do Comercial)

**Job:** "Quando o funil mudou sem ninguém mexer, ou nada mudou quando devia, quero ver em segundos se o automático está ligado, se rodou e
o que fez, para confiar no funil (ou saber a quem pedir para ligar)." **Critério:** responder "está funcionando?" sem nenhum toque depois de
abrir a tela. A tela é **só leitura**: nada nela liga ou desliga.

#### 3.2.1 Wireframe

```text
Automações
O que o Praça faz sozinho no Comercial: se está ligado, quando rodou pela última vez e o que fez nos
últimos 7 dias. Vale para todas as praças.

┌ ⚠ O Freela não está conectado. Duas automações e o envio “Via Freela” dependem dele e estão  ┐
│   parados: Etapa pelo cadastro do representante e Etapa e leads pelo Freela.                 │
│   [Abrir a tela Freela]                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────────────┘

Leads e etapas                                                  (grid gap-4 md:grid-cols-2)
┌───────────────────────────────────────────┐ ┌───────────────────────────────────────────┐
│ 🔍 Achados da busca entram no funil       │ │ 🧾 Etapa pelo cadastro do representante    │
│ (✓ Ligada)                                │ │ (⚠ Parada: falta o Freela)                 │
│ Quando uma busca de estabelecimentos      │ │ Quando a empresa que o representante       │
│ termina, os achados viram leads em …      │ │ cadastrou tem a 1ª contratação …           │
│ Roda no fim de cada busca.                │ │ Roda a cada minuto, junto com a …          │
│ ───────────────────────────────────────── │ │ ─────────────────────────────────────────  │
│ Última rodada   hoje 14h02 · 34 leads     │ │ Última rodada   não rodou: falta a conexão │
│                 entraram                  │ │                 com o Freela (14h01)       │
│ Últimos 7 dias  120 leads em 5 buscas ·   │ │ Últimos 7 dias  nada                       │
│                 12 ficaram para escolher  │ │                                            │
│ ▸ ⓘ De onde vem   ▸ Como ligar (admin)    │ │ ▸ ⓘ De onde vem   ▸ Como ligar (admin)     │
└───────────────────────────────────────────┘ └───────────────────────────────────────────┘
┌ 🔌 Etapa e leads pelo Freela ──────────────┐ ┌ ⏳ Sem resposta vai para Perdido / reaquecer┐
└────────────────────────────────────────────┘ └────────────────────────────────────────────┘

Mensagens
┌ Modo de envio: Fila manual ───────────────────────────────────────────────────────────────────┐
│ As mensagens das cadências não saem sozinhas: viram a tarefa “Mandar mensagem”, com o texto    │
│ pronto.                                                                    [Ver as tarefas]    │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
┌ Cadências ────────────────────────────────────────────────────────────────────────────────────┐
│ Lead novo                    (⏸ Pausada)      0 leads dentro agora                             │
│ Reaquecer                    (▶ Rodando)      12 leads dentro agora                            │
│ As cadências-modelo nascem pausadas: ligar é sempre um clique de alguém da equipe.             │
│ [Ligar ou pausar em Mensagens]                                                                 │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Componentes e textos

- `CabecalhoPagina`: h1 **"Automações"**; subtítulo **"O que o Praça faz sozinho no Comercial: se está ligado, quando rodou pela última vez e
  o que fez nos últimos 7 dias. Vale para todas as praças."** **Sem** seletor de praça (os trabalhos são globais).
- **Faixa do Freela** (só se `freela_configured = false` e alguma automação ligada depender dele): `rounded-xl border border-warning/40
  bg-warning/10 p-4 text-sm` (o mesmo tom da "Atenção agora"), com `AlertTriangle` `aria-hidden` e o texto acima, listando pelo nome as que
  estão paradas. **[Abrir a tela Freela]** (`Button variant="outline" size="sm"`, `/freela`).
- h2 **"Leads e etapas"** e a grade `grid gap-4 md:grid-cols-2` com um cartão por automação (`section aria-labelledby`, h3 `text-base
  font-semibold`, ícone `h-5 w-5 text-primary`):
  1. Título, e embaixo o **selo de situação** (próximo item).
  2. "O que faz" (`text-sm`) e "Quando roda" (`text-sm text-muted-foreground`), pela tabela abaixo.
  3. `dl` `mt-3 border-t pt-3 text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1`, com **"Última rodada"** e **"Últimos 7 dias"**.
  4. `<details>` **"ⓘ De onde vem"**: "Última rodada: o registro das rodadas do trabalho. Últimos 7 dias: eventos com o autor Automático (ou
     Freela (sincronização)) na ficha dos leads, de {22/10} a {28/10}."
  5. Só para o admin: `<details>` **"Como ligar"** (com a automação desligada) e **"Detalhe técnico"** (com a última rodada falhando, o texto
     cru de `error` em `pre whitespace-pre-wrap break-words font-mono text-xs`). Quem não é admin, com a automação desligada, lê **"Para
     ligar, fale com o administrador."**

| Automação | Título · ícone | O que faz | Quando roda | Últimos 7 dias (modelo) |
|---|---|---|---|---|
| A1 | **Achados da busca entram no funil** · `Search` | "Quando uma busca de estabelecimentos termina, os achados viram leads em “Lead novo”, até 300 por busca. O que passar disso fica na busca para escolher à mão. Shoppings continuam à mão." | "Roda no fim de cada busca." | "{120} leads criados em {5} buscas · {12} ficaram para escolher à mão" |
| A2 | **Etapa pelo cadastro do representante** · `UserCheck` | "Quando a empresa que o representante cadastrou tem a 1ª contratação concluída no Freela, o lead vai para “Primeira vaga rodada”. A 1ª vaga publicada vira uma anotação na ficha." | "Roda a cada minuto, junto com a sincronização dos cadastros." | "{3} leads foram para Primeira vaga rodada · {5} primeiras vagas anotadas" |
| A3 | **Etapa e leads pelo Freela** · `Plug` | "De hora em hora, o Praça lê as empresas do Freela. Cadastrou: “Cadastrado”. 1 contratação paga: “Primeira vaga rodada”. 2 ou mais: “Cliente ativo”. Empresa nova na cidade de uma praça aberta, cadastrada depois do início da praça, vira lead. A empresa é ligada ao lead pelo telefone, nunca pelo nome." | "Roda de hora em hora, das 7h às 22h." | "{9} leads mudaram de etapa (Cadastrado {6} · Primeira vaga rodada {2} · Cliente ativo {1}) · {4} leads novos do Freela · {2} empresas sem lead certo (o telefone está em mais de um lead)" |
| A4 | **Sem resposta vai para Perdido / reaquecer** · `Hourglass` | "Lead em “Contatado” há 21 dias sem contato e fora de cadência vai para “Perdido / reaquecer”, com o motivo “não respondeu”, e volta à fila da Entrada em 30 dias. Nunca toca em arquivado nem em lead de teste." | "Roda todo dia às 6h10." | "{7} leads foram para Perdido / reaquecer" |

Os textos de "o que faz" moram no web (catálogo da tela). A API manda só as chaves, a situação e as contagens.

**Selo de situação** (um `span`, **nunca** `Switch` nem botão), com as classes `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5
text-xs font-semibold` e o ícone `h-3.5 w-3.5` `aria-hidden`. Calculado no web, numa função pura, nesta ordem:

| Condição | Selo | Linha de apoio |
|---|---|---|
| chave desligada | `PowerOff` **"Desligada"** (`bg-muted text-muted-foreground`) | "Não faz nada até ser ligada no servidor." |
| ligada, depende do Freela e ele não está configurado (ou falta a sincronização dos cadastros, na A2) | `AlertTriangle` **"Parada: falta o Freela"** ou **"Parada: falta a sincronização dos cadastros"** (`bg-warning/10 text-warning`) | "Ligada no servidor, mas sem {a conexão com o Freela} ela não faz nada." |
| ligada, a última rodada falhou | `AlertTriangle` **"Falhou na última rodada"** (`bg-destructive/10 text-destructive`) | "A última rodada não terminou ({hoje 14h00}). O Praça tenta de novo {às 15h00 \| amanhã às 6h10 \| na próxima busca}." |
| ligada, nunca rodou | `Clock` **"Ligada · ainda não rodou"** (`bg-secondary text-secondary-foreground`) | o "Quando roda" |
| ligada, a última rodada deu certo | `CheckCircle2` **"Ligada"** (`bg-success/10 text-success`) | — |

"Última rodada", conforme o caso: **"{hoje 14h02} · {34} leads entraram ({2} já estavam no funil)"**, **"não rodou: falta a conexão com o
Freela (conferido às 14h01)"** (rodada `nao_configurado`), **"{hoje 14h00} · não terminou"** ou **"ainda não rodou"**. Data em `<time
dateTime>`. Contraste a conferir: `text-destructive` sobre `bg-destructive/10` dá cerca de 4,6:1 (conta à mão). Se o `browser-check` medir
menos que 4,5:1, o selo de falha passa a `bg-card border border-destructive`.

**Mensagens** (h2), em dois cartões:

- **"Modo de envio: {Fila manual | Via Freela}"**.
  - Fila manual: "As mensagens das cadências não saem sozinhas: viram a tarefa “Mandar mensagem”, com o texto pronto." + **[Ver as
    tarefas]** (`ROTA.tarefas`).
  - Via Freela: "As mensagens saem sozinhas pelo número de campanhas do Freela. Se o WhatsApp do Freela parar, elas não chegam, e o Praça
    não fica sabendo: confira em Mensagens, aba Disparos." + **[Abrir os disparos]** (`/mensagens?aba=disparos`).
  - Via Freela sem a conexão, com o selo "Parada: falta o Freela": "Sem a conexão com o Freela, as mensagens viram a tarefa “Mandar
    mensagem”."
  - **Qual modo mostrar** (o `app_settings.mode` global ou o de cada disparo, que se escolhe no passo 4 de Disparos) é pergunta para o
    arquiteto (§5). A tela não adivinha.
- **"Cadências"**: `ul divide-y`; cada linha com o nome (`font-medium`), o selo **"Rodando"** (`Play`, `bg-success/10 text-success`) ou
  **"Pausada"** (`Pause`, `bg-muted text-muted-foreground`) e **"{12} leads dentro agora"**. Embaixo: "As cadências-modelo nascem pausadas:
  ligar é sempre um clique de alguém da equipe." + **[Ligar ou pausar em Mensagens]** (`Button variant="outline" asChild`,
  `/mensagens?aba=cadencias`, achado 19). Sem cadência: "Nenhuma cadência criada." + [Criar em Mensagens].

"Como ligar" (só admin, automação desligada): **"Esta automação liga no servidor, não nesta tela. Quem cuida do servidor grava
`{CRM_AUTO_LEADS_FROM_SEARCH_ENABLED}=true` no `.env` e reinicia a API. Ordem sugerida: Tarefas, etapas, busca e, com a conta do Freela, a
sincronização e o quadro do Freela."** A A2 e a A4 dividem a mesma chave, e o texto diz isso: "A mesma chave liga “{Sem resposta vai para
Perdido / reaquecer}”."

#### 3.2.3 Estados, celular, acessibilidade, toques

- **Estados:** chave `crm_tasks` desligada → "Este recurso ainda não está ligado neste servidor." (sem chamar a API); carregando → 4
  esqueletos `h-56` em `md:grid-cols-2` + 1 `h-40`; erro → cartão de erro "Não deu para carregar as automações." + [Tentar de novo]; tudo
  desligado (o normal no começo) → os 4 cartões "Desligada", e no topo o aviso neutro **"Nenhuma automação está ligada ainda. O funil só muda
  pela equipe e pelas visitas."**
- **Celular:** uma coluna; o selo desce para baixo do título (`flex-wrap`); o `dl` vira `grid-cols-1` (rótulo em cima, valor embaixo);
  `summary` com `min-h-11`.
- **Acessibilidade:** ✓ cada cartão é um `section` com h3; ✓ o selo é texto + ícone (cor nunca sozinha); ✓ nada focável que pareça
  interruptor; ✓ `<time>`; ✓ texto cru só dentro de `details` do admin; ✓ links com verbo ("Abrir a tela Freela", "Ligar ou pausar em
  Mensagens").
- **Toques:** "Está funcionando?" se responde com **0** toques depois de abrir (1 pelo menu). Ver o que fez: **0**. Saber como ligar:
  **1** (admin).

### 3.3 Cartão "Comercial hoje" no Dashboard (`/inicio`)

Só aparece com `features.commercial` e `features.crm_tasks`. Fica **logo abaixo da faixa "Atenção agora" e antes dos 8 cartões**
(achado 17, **[desvio da Lovable: regra do dono, celular]**). Na `/inicio` sem o painel (`features.dashboard` desligada), ele fica depois do
`AtencaoAgora`.

```text
desktop                                                        celular
┌──────────────────────────────────────────────────────────┐   ┌──────────────────────────────┐
│ 📋 Comercial hoje                                         │   │ 📋 Comercial hoje             │
│ qua 28/10 · BH + Contagem · não segue o período acima    │   │ qua 28/10 · BH + Contagem ·   │
│                                                           │   │ não segue o período acima     │
│ Tarefas para hoje   Leads novos      Mudanças de etapa    │   │ Tarefas para hoje          9 │
│ 9                   12               7                    │   │ 4 mensagens + 3 próximos …   │
│ 4 mensagens + 3     8 da busca auto. 5 automáticas + 2    │   │ Leads novos               12 │
│ próximos passos +   + 3 de visitas + da equipe            │   │ 8 da busca automática + 3 …  │
│ 2 conversas paradas 1 do formulário                       │   │ Mudanças de etapa          7 │
│ ▸ ⓘ De onde vem                         [Abrir tarefas]   │   │ 5 automáticas + 2 da equipe  │
└──────────────────────────────────────────────────────────┘   │ ▸ ⓘ De onde vem               │
                                                               │ [       Abrir tarefas       ]│
                                                               └──────────────────────────────┘
```

- `section` `rounded-2xl bg-card p-5 shadow-card` `aria-labelledby`. h2 `flex items-center gap-2 text-lg font-semibold`, com `ListTodo h-5
  w-5 text-primary` `aria-hidden` e **"Comercial hoje"**. Embaixo, `text-sm text-muted-foreground`: **"{qua 28/10} · {BH + Contagem |
  todas as praças} · não segue o período acima"**.
- Três números. Do `sm` em diante, `mt-4 grid gap-4 sm:grid-cols-3`, com rótulo `text-sm text-muted-foreground`, valor `text-3xl
  font-semibold` e conta `text-xs`. No celular, linhas `divide-y` (rótulo à esquerda, número `text-2xl` à direita, conta embaixo):
  1. **"Tarefas para hoje"**, com a conta por grupo ("4 mensagens + 3 próximos passos + 2 conversas paradas"). É a visão "Todas" (o
     Dashboard é a visão geral). Zero: "Nenhuma tarefa para hoje."
  2. **"Leads novos"**, com a conta por origem. Zero: "Nenhum lead criado hoje."
  3. **"Mudanças de etapa"**, com "{5} automáticas + {2} da equipe". Zero: "Nenhum lead mudou de etapa hoje."
- `<details>` **"ⓘ De onde vem"**: "Tarefas: calculadas agora, às {14h32}, pela mesma regra da tela Tarefas, para todas as pessoas. Leads
  novos e mudanças de etapa: leads criados e eventos de etapa em {28/10}, dia de Brasília, sem os de teste."
- **[Abrir tarefas]** (`Button`, `asChild` `Link` `ROTA.tarefas`): à direita do `details` no desktop, `w-full` embaixo no celular.
- Praça: segue o "Praça" do Dashboard se a API aceitar `praca_id` ausente (= todas); senão mostra a praça ativa pelo nome (§5).
- **Estados:** carregando → esqueleto `h-44` no lugar; erro → dentro do cartão "Não deu para carregar o Comercial de hoje." + [Tentar de
  novo], sem derrubar o resto do Dashboard; chave desligada → o cartão não existe (nada é chamado).
- **Toques:** do Dashboard a Tarefas, **1**.

### 3.4 Funil (`/funil`): redesenho visual, mesma lógica

```text
desktop (md+)
Funil                                               Praça [BH + Contagem ▾] [+ Novo lead] [Entrada de leads]
Bares, restaurantes, hotéis, buffets e casas de evento da praça, etapa por etapa.
┌Leads no funil┐┌Contatado→cad.┐┌Cadastrado→ativo┐┌Dias até cadastrar┐┌Parados há 7+ dias┐┌Valor estimado┐
│ 84           ││ 30%          ││ 20%            ││ 12 dias          ││ ⚠ 5              ││ R$ 48.000    │
│ sem arquivados││9 de 30       ││2 de 10         ││média de 9 leads  ││sem contato há 7+ ││etapas 1 a 6  │
└──────────────┘└──────────────┘└────────────────┘└──────────────────┘└──────────────────┘└──────────────┘
▸ ⓘ Como contamos
[🔍 Buscar por nome, cidade ou decisor        ] [Todos os donos ▾] [Todas as classificações ▾] [☐ Mostrar arquivados]
Arraste o cartão para mudar de etapa, ou abra o lead e use “Mover para etapa”.
┌ ● 1. Lead novo   [12] ┐┌ ● 2. Contatado   [30] ┐┌ ● 3. Conversa aberta [8]┐ … (rola na horizontal, região com foco)
│ 12 leads · R$ 4.800   ││ 30 leads · R$ 12.000  ││ 8 leads · R$ 3.200     │
│┌─────────────────────┐││┌─────────────────────┐││                        │
││Bar do Zé          ⚠ ││││Hotel Mirante Norte  │││                        │
││Contagem · Sr. José  ││││Belo Horizonte · Ana │││                        │
││⚡Automático          ││││▣ Freela: 2 contrata-│││                        │
││→ Ligar · qui 29/10  ││││  ções pagas         │││                        │
││(R) Rebeca 12 dias   ││││Sem próximo passo    │││                        │
││          parado     ││││(D) Diego  3 dias    │││                        │
│└─────────────────────┘││└─────────────────────┘││                        │
└───────────────────────┘└───────────────────────┘└────────────────────────┘

celular (< md): sem quadro; uma etapa aberta por vez
┌──────────────────────────────┐
│ Funil                        │
│ Praça [BH + Contagem      ▾] │
│ [+ Novo lead ][Entrada leads]│
│ (6 números em 2 colunas)     │
│ [🔍 Buscar…                 ]│
│ ▾ ● 1. Lead novo         12  │
│   ┌────────────────────────┐ │
│   │ Bar do Zé            ⚠ │ │
│   │ …                      │ │
│   └────────────────────────┘ │
│ ▸ ● 2. Contatado         30  │
│ ▸ ● 3. Conversa aberta    8  │
│ …                            │
│ Toque no lead e use “Mover   │
│ para etapa”.                 │
└──────────────────────────────┘
```

- **Cabeçalho** (§3.7): h1 **"Funil"**; subtítulo **"Bares, restaurantes, hotéis, buffets e casas de evento da praça, etapa por etapa."**;
  Praça; ações **[Novo lead]** (`default`, `Plus`) e **[Entrada de leads]** (`outline`, `Inbox`, `/entrada`). Antes, o nome da praça
  era o h1. Agora ele está no seletor.
- **Números** (`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6`, cartão `rounded-2xl bg-card p-4 shadow-card`, rótulo `text-sm
  text-muted-foreground`, valor `text-2xl font-semibold`, conta `text-xs`):

  | Rótulo | Conta |
  |---|---|
  | "Leads no funil" | "sem os arquivados" |
  | "Contatado → cadastrado" | "{9} de {30} contatados" (depende do achado 6) |
  | "Cadastrado → ativo" | "{2} de {10} cadastrados" |
  | "Dias até cadastrar" | "média de {9} leads, sem o tempo parado" |
  | "Parados há 7+ dias" | "sem contato há 7 dias ou mais". Com valor > 0: `AlertTriangle` + `text-warning` (cor com ícone) |
  | "Valor estimado" | "estimativa por classificação, etapas 1 a 6" (definição com o dono, achado 22) |

  Embaixo da grade, um único `<details>` **"ⓘ Como contamos"** com as fórmulas e "Fonte: leads desta praça, agora".
- **Filtros** (`flex flex-wrap gap-3`, como em Representantes): busca com ícone (`aria-label` e `placeholder` **"Buscar por nome, cidade ou
  decisor"**, `min-w-60 flex-1`); `select` **"Todos os donos"**; `select` **"Todas as classificações"**; `Checkbox` + `Label` **"Mostrar
  arquivados"** (`min-h-11`). Embaixo, a dica `text-xs text-muted-foreground`: **"Arraste o cartão para mudar de etapa, ou abra o lead e use
  “Mover para etapa”."** (no celular: **"Toque no lead e use “Mover para etapa”."**).
- **Quadro (md+):** `div role="region" aria-label="Quadro do funil" tabIndex={0}`, `flex gap-4 overflow-x-auto pb-4`, com foco visível. Uma
  região que rola precisa ser alcançável pelo teclado (2.1.1). A rolagem lateral é aceita no desktop. Coluna: `section aria-labelledby`, `flex
  w-72 shrink-0 flex-col rounded-2xl bg-muted/60 p-2`, e `ring-2 ring-primary` quando um cartão passa por cima dela. Cabeçalho da coluna:
  bolinha `h-2.5 w-2.5 rounded-full` com a cor da etapa (`aria-hidden`), h2 `text-sm font-semibold text-foreground` **"{n}. {nome}"** (texto
  **nunca** na cor da etapa, achado 9), `Badge variant="secondary"` com o número e, embaixo, `text-xs text-muted-foreground` **"{12} leads ·
  {R$ 4.800}"**. Coluna vazia: **"Nenhum lead nesta etapa."**
- **Cartão do lead:** `button` (`draggable` só no `md+`), `w-full rounded-xl bg-card p-3 text-left shadow-card hover:ring-1 hover:ring-primary
  focus-visible:ring-2 focus-visible:ring-ring`. De cima para baixo:
  1. Nome `text-sm font-medium line-clamp-2`. Lead crítico: `AlertTriangle h-4 w-4 text-destructive` + `sr-only` "Crítico." e
     `ring-1 ring-destructive` (cor + ícone + texto).
  2. `text-xs text-muted-foreground truncate`: **"{cidade} · {decisor}"**.
  3. **Selos** (só se houver algum; `mt-2 flex flex-wrap gap-1`), os dois no mesmo estilo neutro: `inline-flex items-center gap-1
     rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground`, com o ícone `h-3 w-3` `aria-hidden`:
     - `Zap` **"Automático"**: quando a última mudança de etapa veio do automático (`last_stage_auto`, definição no achado 12). O detalhe
       (qual automação e a conta) está na linha do tempo do painel.
     - `BriefcaseBusiness` **"Freela: {2} contratações pagas"** (**"1 contratação paga"** no singular), só com `freela_hirings ≥ 1`. Com 0
       não aparece: a etapa "Cadastrado" já diz isso.

     **Por que não polui:** a linha só existe quando há selo, o tom é neutro (nenhuma cor nova competindo com o alerta do lead crítico), e os
     dois respondem às perguntas que a equipe vai fazer ("quem mexeu neste cartão?" e "ele já contrata?").
  4. `mt-2 text-xs`: **"→ {Ligar para o decisor} · {qui 29/10}"**. Vencido: `text-destructive` + **"vencido"**. Sem próximo passo:
     **"Sem próximo passo"** (`text-muted-foreground`). Perdido: **"Perdido: {não respondeu} · reaquecer em {27/11}"**.
  5. Rodapé `mt-2 flex items-center justify-between text-xs text-muted-foreground`: avatar 20 px + o primeiro nome do dono (ou **"Sem
     dono"**); à direita **"{12} dias parado"** (`text-warning` + `Clock` a partir de 7 dias; `text-destructive` quando crítico).

  **Saem do cartão** (decisão, §5): a linha "último contato dd/mm" (está no painel) e o selo de valor em R$ (está na soma da coluna e no
  painel). Com isso, os selos novos cabem sem o cartão crescer.
- **Celular (< md):** sem quadro. São 8 `details` (`name="etapas-funil"`, um aberto por vez), cada um um cartão `rounded-2xl bg-card
  shadow-card`. O `summary` (`flex min-h-11 items-center gap-2 px-4 py-3`) leva a bolinha, **"{n}. {nome}"** e o `Badge` com o número.
  Aberto, mostra a lista dos mesmos cartões (`draggable={false}`). Abre na primeira etapa com lead, ou na última aberta, guardada no
  `ui-store`. Mudar de etapa: tocar no lead → "Mover para etapa" no painel → confirmar (`MoveLeadDialog`, como hoje). Esse é o caminho de
  um toque que o WCAG 2.5.7 pede.
- **Estados:** sem praça → "Nenhuma praça ainda. O funil é por praça." + [Abrir Praças]; carregando → 4 colunas-esqueleto `h-72 w-72`
  (celular: 4 `h-14`); erro → cartão de erro "Não deu para carregar o funil." + [Tentar de novo] (achado 23); praça sem leads →
  **"Nenhum lead nesta praça ainda."** + "Os leads entram pela visita dos representantes, pelo formulário, pela busca de estabelecimentos
  ou por planilha." + [Entrada de leads] [Novo lead]; filtro sem resultado → **"Nenhum lead com esses filtros."** + [Limpar filtros].
- **Toques:** abrir um lead **1**; mudar de etapa no desktop, arrastando, **1 gesto + confirmar**; no celular **3** (lead → etapa →
  confirmar).

### 3.5 Buscar estabelecimentos com a A1 (`/prospeccao` **e** o diálogo "Buscar clientes no mapa" do detalhe da praça)

`BuscaEstabelecimentos` é o mesmo componente nos dois lugares (UX 26/10 §4.3). O aviso tem de aparecer nos dois. Só com
`features.crm_auto_leads`:

- No passo "3. Escolha quais entram", no topo, aviso neutro (`rounded-xl bg-secondary p-4 text-sm`, `Zap` `aria-hidden`): **"Os achados
  entram no funil sozinhos quando a busca termina, até 300 por busca. Os que passarem disso ficam aqui para você escolher."**
- Com a busca rodando: **"Quando a busca terminar, os achados entram no funil sozinhos."**
- Depois da rodada, os candidatos que entraram aparecem como **"Já no funil"**. O botão **"Importar {n} clientes"** conta só os que
  sobraram. Sem sobra, o botão some e o texto diz **"Todos os achados já entraram no funil."**
- Busca de shoppings (`kind` ≠ `lugares`): **"A busca de shoppings continua à mão: escolha quais entram."**
- Se a A1 falhar: **"Não deu para pôr os achados no funil sozinho. Escolha quais entram e toque em “Importar {n} clientes”."** Para isso, a
  busca precisa saber da falha (§5).

### 3.6 Entrada (`/entrada`): visual novo, mesma lógica (com uma exceção proposta)

Ordem: o que é ação vem primeiro.

1. **Cabeçalho** (§3.7): h1 **"Entrada de leads"**; subtítulo **"Os leads novos para o 1º contato, a importação de planilha e o formulário de
   captura."**; Praça; ações **[Novo lead]** (`default`) e **[Ver o funil]** (`outline`).
2. **"Primeiro contato de hoje"** (hoje "Para tocar hoje": "tocar" confunde com o toque na tela, e o mesmo nome aparece no cartão de
   Tarefas, §5). Cartão `rounded-2xl bg-card shadow-card`:
   - `text-lg font-semibold` **"{20} leads para o 1º contato hoje"** e, em `text-xs text-muted-foreground`, a conta: **"{34} na fila ({6}
     casas grandes); mostrando {20}, o limite por pessoa. Fonte: leads em “Lead novo” e os de reaquecer com data vencida, nesta praça. Ordem:
     casa grande, depois alvo, depois o resto; os mais antigos na frente."** Fila maior que o limite: `AlertTriangle` + **"{14} leads
     ficaram para outro dia pelo limite de {20} por pessoa."**
   - Seletor "De quem" (`select` com rótulo `sr-only`): o `hojePerson` de sempre.
   - Linhas: o **mesmo `LinhaTarefa` de Tarefas** (§3.1.3). Motivo: **"Lead novo há {3} dias · {Casa grande}"** ou **"Volta do “Perdido /
     reaquecer” · motivo: {não respondeu}"**. A classificação vai em `Badge variant="secondary"` (o texto `#ECA826` de hoje reprova: 2,1:1).
     Ações: [Ligar] (celular) · [WhatsApp] · [Feito ▾] · [Adiar ▾], ligadas às mutações de hoje (`useAddLeadEvent` com `call`, `msg_out`,
     `visit` ou `note`, e `useSnoozeLead`), com o mesmo Desfazer de 5 s.
   - **Exceção proposta (achado 3, decisão no §5):** o `wa.me` deixa de gravar "Mensagem enviada" no clique. Grava só o "Feito ▾ → Mandei
     mensagem".
   - Vazio: **"Ninguém esperando o 1º contato hoje."** + "Os leads novos chegam pela visita, pelo formulário, pela busca e por planilha."
     (sai "Fila zerada. Bom trabalho.").
   - `<details>` **"Ajustar o limite"**: `Input type="number" inputMode="numeric"` com o rótulo visível **"Limite de leads novos por pessoa,
     por dia (vale para toda a equipe)"** (achado 25). A lógica do PATCH com espera não muda.
3. **"Importar planilha"** (sem o "1."): **"Aceita planilha .csv e XML. Arraste o arquivo ou escolha pelo botão."**
   - Área de soltar `rounded-xl border-2 border-dashed border-input p-8 text-center` + `Button variant="outline"` **"Escolher arquivo"**.
   - Mapeamento com `Label` visível em cima de cada `select` (`h-11 md:h-9`). "Origem do lote", "Praça" e "Dono" do mesmo jeito.
   - Repetidos: `role="radiogroup" aria-label="Se a linha já existir"`, com 3 pílulas `role="radio" aria-checked` e ✓ na escolhida:
     **"Ignorar a linha nova"**, **"Completar os campos vazios do lead que já existe"**, **"Criar mesmo assim (marca como possível
     duplicado)"**.
   - Resumo `rounded-lg bg-muted p-3 text-sm`: **"{120} linhas lidas · {10} repetidas · {5} sem telefone · {2} sem praça · {103} vão
     entrar"**.
   - Prévia linha a linha: tabela `hidden md:block` (no desktop, a rolagem dentro do cartão é aceita). No celular: **"A prévia linha a linha
     aparece no computador."**
   - Botões: [Cancelar] (`outline`) e **[Importar {103} leads]** (o verbo com o número, no lugar de "Confirmar importação"). Deu certo:
     `role="status"` **"{103} leads importados · {4} atualizados · {13} ignorados."**
   - "Sem praça ({n})": `rounded-xl border border-warning/40 bg-warning/10 p-4`, com um `select` por linha e o rótulo `sr-only` **"Praça de
     {nome}"**.
4. **"Formulário de captura"** (sem o "2."): **"Endereço público por praça. Quem preencher entra direto em “Lead novo”. É o destino dos
   anúncios das campanhas."** O link vai em `rounded-lg bg-muted p-3 font-mono text-xs break-all`, com **[Copiar link]** (aviso "Link
   copiado.") e **[Abrir o formulário]** (`target="_blank"`). O seletor "Origem do link" tem as opções "Tráfego pago" e "Orgânico".
5. **"Histórico de importações"**: **"Dá para desfazer por 24 horas: saem só os leads do lote que ainda não tiveram contato."**
   - Linha: o nome do arquivo `font-medium`; **"{28/10 14h02} · por {Rebeca} · origem {planilha}"**; **"{103} entraram · {13} ignorados"**
     (texto, não só cor).
   - **[Desfazer importação]** abre um `AlertDialog` (achado 20): título **"Desfazer a importação de “{lista.csv}”?"**; texto **"Saem {n}
     leads deste lote que ainda não tiveram contato. Os que já tiveram contato ficam no funil. Para trazer de volta, só importando de
     novo."**; botões [Cancelar] e **[Desfazer importação]** (`destructive`). Depois: **"Importação desfeita: {n} leads saíram, {k} ficaram
     por já terem contato."**

**Toques:** 1º contato de um lead **2** (Feito → Liguei), ou **3** no celular ligando. Importar no computador: **4** (Escolher arquivo →
arquivo → conferir → Importar).

### 3.7 Cabeçalho comum (`components/praca/CabecalhoPagina.tsx`) e as outras telas do Comercial

```tsx
<CabecalhoPagina titulo="Funil" subtitulo="…" comPraca acoes={<>…</>} />
```

- Raiz `flex flex-wrap items-end justify-between gap-3`. À esquerda (`min-w-0`), h1 `text-3xl font-semibold` e p `text-muted-foreground`. À
  direita, `flex w-full flex-wrap items-center gap-2 sm:w-auto`: o seletor de praça e as ações (a principal primeiro).
- `comPraca`: `<label htmlFor="praca-ativa" className="sr-only">Praça</label>` + `select#praca-ativa` `h-11 min-w-0 flex-1 rounded-md border
  border-input bg-background px-3 text-sm sm:min-w-48 sm:flex-none md:h-9`, com as praças pelo nome. O `onChange` chama `useSetActivePraca`
  (a praça ativa vale para todo o Comercial, achado 18), e `aria-busy` fica ligado enquanto ela é gravada.
- No celular, o título vem em cima, depois o seletor na largura toda e depois as ações (`w-full sm:w-auto`).
- A página usa `space-y-6`, como as redesenhadas (sai o `mt-4` por seção). Sem o rótulo `tag` em cima do título (achado 28).

| Tela | h1 | Subtítulo | Praça | Ações no topo |
|---|---|---|---|---|
| Tarefas | Tarefas | "Hoje, {qua 28/10} · o que precisa de você no Comercial" | sim | — |
| Funil | Funil | "Bares, restaurantes, hotéis, buffets e casas de evento da praça, etapa por etapa." | sim | Novo lead · Entrada de leads |
| Entrada | Entrada de leads | "Os leads novos para o 1º contato, a importação de planilha e o formulário de captura." | sim | Novo lead · Ver o funil |
| Buscar estabelecimentos, Mensagens, Campanhas, Calendário, Indicadores, Freela | o nome do menu | o subtítulo de hoje, sem o `tag` | como hoje | como hoje |
| Ações (`/hoje`, hoje **sem h1**) | **Ações da praça** (§5) | "Ações do plano de abertura: atrasadas, de hoje e dos próximos 7 dias." | sim | Nova ação |
| Automações | Automações | §3.2.2 | não | — |

Nas telas que só ganham o cabeçalho, os cartões de fora passam de `rounded-lg border border-border bg-card/60` para `rounded-2xl bg-card
shadow-card`, e o h2 passa de `font-display … font-extrabold` para `text-lg font-semibold`. **O miolo não muda** nesta leva (§4).

**`/hoje` e o sino com `features.crm_tasks` (achado 7):**

- A seção `FunilHoje` sai. No lugar entra o cartão **"Contatos com leads"**: **"Próximo passo vencido e conversas paradas agora ficam em
  Tarefas."** + [Abrir tarefas].
- No sino, embaixo da lista, o link **"Contatos com leads: ver em Tarefas ›"**.

---

## 4. O que fica para depois (sem perder o essencial)

**O essencial desta leva** (não cortar):

- a lista de Tarefas com "Feito" em 2 toques, "Adiar" e "Desfazer";
- "Abrir WhatsApp" sem gravar nada;
- o resumo com a conta e o "Hoje | Ontem";
- o "—" quando o Freela não está conectado;
- a situação de cada automação em texto;
- os selos do Funil;
- o Funil no celular sem rolagem lateral;
- o `LeadPanel` dentro do `Sheet`;
- a cor das etapas fora do texto;
- o bug da etapa 8 nas métricas (arquiteto).

**Fica para depois:**

1. **Tarefas:** a opção "Todas as praças" (depende da API, §5); atalhos de teclado no desktop (F feito, A adiar, J/K próxima); ações em lote;
   trocar o dono na própria linha.
2. **Resumo:** só "Hoje | Ontem". Escolher qualquer data e a quebra por destino além da 2ª linha ficam para depois.
3. **Automações:**
   - o selo "Atrasada", para a rodada esperada que não veio (A3 sem rodar há mais de 2 h entre 7h e 22h; A4 há mais de 26 h);
   - a lista das empresas do Freela que não casaram (telefone repetido), com o atalho para corrigir;
   - a saúde do canal de WhatsApp do Freela (falhas dos últimos 7 dias).
4. **Funil:** o filtro "Só os que mudaram sozinhos"; números por período; arrastar no celular.
5. **`LeadPanel`:** o redesenho do conteúdo (rótulos `tag` de 10 px, chips, campos). Agora só entram a casca `Sheet` e o texto das etapas em
   `text-foreground`.
6. **Miolo de Mensagens, Campanhas, Calendário, Indicadores e Freela:**
   - `tag` de 10 px, botões de cerca de 22 px, `text-[10px]`/`text-[11px]`;
   - o selo branco sobre a cor da etapa (2,1:1 no "Cadastrado");
   - as abas de Mensagens sem `role="tablist"`.

   Nesta leva, essas telas só ganham o cabeçalho e o cartão de fora, além do `?aba=` de Mensagens.
7. **Celular:** a pílula "Tarefas" logo depois de "Dashboard" (decisão); a prévia linha a linha da importação em cartões.
8. **Sino:** juntar os avisos de lead com Tarefas, para um lugar só.
9. **Desfazer pelo servidor**, se o arquiteto preferir isso à espera de 5 s no web.

**Se faltar tempo, dá para cortar nesta ordem sem perder o essencial:**

- (a) a lista de cadências em Automações (fica só o link para Mensagens e o modo de envio);
- (b) o botão "Ligar" do celular (fica o WhatsApp);
- (c) o número na pílula que não está escolhida;
- (d) o cartão "Contatos com leads" na `/hoje` (a seção `FunilHoje` só sai).

---

## 5. Decisões em aberto

**Para o dono (Denner/Diego):**

1. Na Entrada, o link do WhatsApp **deixa de gravar** "Mensagem enviada"; só o "Feito" grava (achado 3). Recomendo que sim.
2. "Ações" passa a se chamar **"Ações da praça"** (achado 7).
3. "Feito" num lead **sem dono** torna dono quem fez? Isso evita duas pessoas ligarem para o mesmo lugar (achado 11).
4. O cartão do Funil perde "último contato" e o valor em R$, que continuam no painel e na soma da coluna (§3.4).
5. "Valor estimado": é por mês? por vaga? (achado 22)
6. "Para tocar hoje" passa a se chamar **"Primeiro contato de hoje"** (§3.6).
7. Depois: a pílula "Tarefas" logo depois de "Dashboard" no celular (achado 24).

**Para o arquiteto (`software-architect`):**

8. `metrics()`: a etapa 8 fora de "contatados" e "cadastrados", e `{ n, de }` em cada taxa, **antes de ligar o A4** (achado 6).
9. A definição de `last_stage_auto`: quais autores contam (achado 12).
10. `praca_id` opcional (ausente = todas) em `GET /v1/crm/summary` (cartão do Dashboard) e em `GET /v1/crm/tasks` (achados 16 e 18).
11. Resposta de `GET /v1/crm/tasks`:
    - `counts: { me, all }`, `leads_total` e o número da Entrada;
    - por tarefa, o que o motivo precisa:
      - T1: a origem já escrita (cadência e passo, ou disparo), `scheduled_at` e o texto;
      - T2: o representante, a data e o interesse;
      - T3: o "o quê" e a data do próximo passo, e se veio de cadência;
      - T4: a etapa e o último contato;
      - T5: `stage_since`;
    - o nome do dono e o telefone;
    - `freela_configured`.
12. Resposta de `GET /v1/crm/summary`: contagens estruturadas (por origem; por autor e destino; mensagens por modo e respostas),
    `freela_configured` e a hora da última leitura do Freela ("lido às 14h00"). As frases ficam no web.
13. Qual "modo de envio" Automações mostra: o `app_settings.mode` ou o de cada disparo (§3.2.2).
14. Desfazer:
    - envio adiado no web (o padrão proposto, com `keepalive` no cliente http) ou uma rota de desfazer;
    - o código de erro para a T1 já marcada por outra pessoa;
    - o que o `done` faz quando o lead já saiu da regra (aceita e grava o contato?).
15. Automações:
    - o `summary` de cada rodada com as contagens que os textos de §3.2.2 usam;
    - por automação, um `blocked_by: 'freela' | 'signup_sync' | null` decidido no servidor. O web não adivinha: `FIELD_SIGNUP_SYNC_ENABLED`
      não está no `features`;
    - a dependência da A2 do lado do Freela (`FIELD_ASSISTED_SIGNUP_ENABLED`) o Praça não tem como ver. Ela vai só no texto "Como ligar" do
      admin ("e a listagem de cadastros ligada no Freela"), nunca como selo calculado;
    - a busca (A1) saber que a sua rodada falhou (§3.5).

---

## 6. Acessibilidade: hoje × depois desta leva

| Item (WCAG 2.2 AA) | Hoje no Comercial | Nesta leva |
|---|---|---|
| 1.4.3 Contraste do texto (cores das etapas) | ✗ 5 de 8 cores reprovam (achado 9) | ✓ texto em `foreground`; cor só na bolinha |
| 1.4.1 Cor não é o único sinal | ✗ crítico/parado só pela cor da borda e do número | ✓ ícone + texto ("Crítico.", "12 dias parado") |
| 2.1.1 Teclado / região que rola | ✗ quadro sem foco | ✓ `role="region"` com `tabIndex={0}` |
| 2.5.7 Movimentos de arrasto | ✗ caminho de um toque escondido | ✓ dica visível + "Mover para etapa" pelo painel |
| 2.5.8 Tamanho do alvo | ✗ botões de cerca de 22 px, fechar do painel cerca de 26 px | ✓ `Button` com 44 px no celular; o miolo das outras telas fica para depois |
| 2.4.3 Ordem do foco / 4.1.2 Nome e papel (painel do lead) | ✗ `aside` sem diálogo, sem Esc | ✓ `Sheet` (Radix Dialog) |
| 2.4.3 Foco depois de remover a linha | — (tela nova) | ✓ vai para a próxima linha ou para o h2 |
| 4.1.3 Mensagens de status | ✗ fila e importação mudam sem aviso | ✓ `aria-live="polite"` / `role="status"` |
| 2.5.3 Rótulo no nome | — | ✓ "Feito: {nome}", "Adiar: {nome}" |
| 2.4.11 Foco não encoberto | — | ✓ sem barra fixa nas telas novas |
| 1.3.1 Títulos | ✗ `/hoje` sem h1; seções com `tag` | ✓ h1 → h2 → h3 em todas |

