# Praça, consultor de campo: fluxo SIMPLES (padrão) + modo completo (preservado)

Data: 2026-10-20. Só desenho; nada foi construído. Fontes lidas: `praca/web/src/components/campo/*` (HojeTela, RoteiroCard, RoteiroTela, ParadaAcoes, NovaVisitaTela, VisitaTela, Questionario, CadastroEmpresaTela, RetornosCampo), `api-contract.md` §20.3/§23.1, `questionario.ts` (`faltando`), o relatório de comparação de 20/10 e, do chefe, `roteiro.$rotaId.tsx` e `visita.ts`. Não li a branch `feat/p0-comparacao-lovable`: os nomes de campo dela abaixo são suposição, a confirmar. Não li `ParadaTela`.

Job: "Quando chego num bar, quero registrar o que aconteceu e seguir para o próximo, para fechar 30 visitas entre 9h e 18h sem perder dado."
Contexto: celular Android, sol, uma mão, 4G que cai. Meta: **visita concluída em ≤ 4 toques no app e 0 digitação** (sem contar o obturador da câmera).

---

## 1. Diagnóstico (a conta)

Cenário medido: roteiro ligado, jornada aberta, online, resultado "sem interesse", sem cadastro.

| Item | Nosso hoje | Chefe (Lovable) | Simples proposto |
|---|---|---|---|
| Telas do app, da lista até concluir | 3 (Hoje, Nova visita, Visita) + câmera do sistema | 2 (lista + diálogo de chegada; a visita abre inline na mesma página) | 2 (Roteiro e Resultado; a câmera do sistema entre elas) |
| Toques em botão/chip | 9: Cheguei, foto, Fazer check-in, 5 chips (cargo, situação, interesse, canais, retorno), Fazer checkout | 5 a 6: Cheguei, foto, Confirmar chegada, status, motivo, Finalizar | **4**: Cheguei (abre a câmera), resultado, motivo, Concluir |
| Campos digitados (obrigatórios) | 3: nome de quem atendeu, vagas abertas, freelas por semana (cada um = foco + teclado, ~8 teclas no mínimo) | 3: nome, telefone (10+ dígitos), cargo (~22 teclas), em todo resultado menos "fechado" | **0** |
| Perguntas obrigatórias | 8 fixas (`faltando()`): nome, cargo, situação, interesse, vagas, freelas/semana, canais, retorno; +3 condicionais (funções se vagas > 0; o quê e data se pedir retorno) | 1 (status) + 3 de contato; +1 condicional (motivo ou data/hora) | 1 + 1 condicional (motivo ou quando) |
| Interações totais (toques + focos + teclas) | ≈ 20 (9 + 3 + ~8). Com retorno "sim": ≈ +15 (texto e seletor de data). Com cadastro assistido: ≈ +25 e +2 telas | ≈ 30 em "não cadastrado" (≈ 6 em "fechado") | 4 a 5 (+ cadastro: ver §4) |
| Offline | funciona (fila) | não funciona (sem fila) | funciona (fila) |

**Da parada na lista até a visita concluída (o que o pedido perguntou):**

| Caminho hoje | Telas | Toques até o questionário abrir | Obs. |
|---|---|---|---|
| Próxima parada: Hoje → "Cheguei: fazer check-in" → foto → "Fazer check-in" | Hoje → Nova visita → Visita | 3 (+ rolar a Hoje até o botão) | caso comum |
| Outra parada da lista: Hoje → "Ver as N que faltam" → toque na linha → (Parada) "Cheguei: fazer check-in" → foto → "Fazer check-in" | Hoje → Roteiro → Parada → Nova visita → Visita (5) | 5 | +2 telas e +2 toques; o botão fixo existe aqui, mas a lista não tem "Cheguei" na linha |
| **Roteiro desligado** (`FIELD_ROUTES_ENABLED=false` é o padrão, §23; o card nem aparece): Hoje → "Nova visita" → aba "Perto de mim" → "Procurar perto de mim" (espera de rede) → escolher na lista → foto → "Fazer check-in" | Hoje → Nova visita → Visita | 4, com espera de rede e, sem sinal, digitar nome e endereço | é o caminho mais pesado e **o desenho anterior (19/10) não o redesenhou** |

Depois disso vêm as 8 perguntas e o checkout (+9 interações, ver tabela acima).

Onde nosso fluxo pesa:
1. **Checkout travado por 8 respostas.** O botão "Fazer checkout" só liga com o questionário inteiro (`faltando(...).length === 0`). Quem visita 30 locais responde 240 perguntas por dia.
2. **Digitação em pé, no sol:** nome, vagas e freelas/semana são campos de texto; o retorno pede texto livre + data.
3. **O botão "Cheguei" não é fixo.** Na Hoje ele vem depois de ~7 blocos (Cadastros confirmados, Ganhos, Pix, Roteiro, contadores...), então exige rolagem. O rodapé fixo tem só "QR code" e "Iniciar/Encerrar jornada".
4. **O resultado da visita não existe como decisão.** Ele fica "escondido" na combinação situação × interesse × retorno; o consultor precisa traduzir o que aconteceu em 3 perguntas.
5. **Cadastro assistido fica no fim de uma tela longa** (depois do questionário), com +2 telas.

Leitura honesta para o dono: o fluxo do Diego tem ≈ 30 interações contra ≈ 20 do nosso, então o peso que ele sentiu não são os toques em si. São **8 decisões obrigatórias seguidas, tela longa e nenhum atalho para o caso comum**. O simples ataca isso (1 decisão + 1 condicional), não só o número de toques.

O que o chefe acerta (copiar a estrutura): **resultado primeiro, em 1 toque; o resto só aparece se aquele resultado exigir.** O que não copiar: contato (nome, telefone, cargo) obrigatório em quase todo resultado. Isso é a parte mais cara dele (≈ 22 teclas) e ainda sem validação de quem é o dono.

Observação: os números de tempo (segundos por visita) são **hipótese a medir**; o que está contado acima são toques e campos, lidos no código.

---

## 2. Fluxo simples (padrão)

### 2.1 Jornada do dia

```text
[Iniciar o dia] (1x, modo A pé/De carro)
      |
 ROTEIRO (lista + próxima parada)  <------------------------+
      |                                                       |
 [Cheguei] -> câmera do sistema (foto da fachada)             |
      |                                                       |
 RESULTADO: 1 chip  -> (se precisa) 1 sub-escolha             |
      |                                                       |
 [Concluir visita]  -> toast "Desfazer" 8 s ------------------+
      |
 (fim do dia) [Encerrar o dia] -> Resumo com contas
```

Toques no app por resultado (da lista até concluir; câmera do sistema fora da conta):

| Resultado | Toques | Digitação |
|---|---|---|
| Fechado | 3 (Cheguei, chip, Concluir) | 0 |
| Já usa o Freela | 3 | 0 |
| Sem interesse + motivo | 4 | 0 |
| Quer retorno + quando | 4 | 0 (telefone do contato é opcional) |
| Cadastrou agora, pelo QR | 4 (Cheguei, chip, Mostrar QR, Concluir) | 0 |
| Cadastrou agora, "Cadastrar por ele" | 5 | 2 campos (responsável, WhatsApp) |

### 2.2 Telas (390 × 844, uma mão, alvos ≥ 48 px, chips 56 px)

**S1. Roteiro** (substitui a Hoje no modo simples; "Hoje" continua sendo o nome da aba)

```text
┌──────────────────────────────────┐
│ Hoje · ter 20/10         [☀ Sol] │ 48
│ 12 de 30 visitas                 │ 28 px
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░             │
│ ✓ Ritmo: 1 à frente              │
│ (às 11h30 o esperado é 11)       │
├──────────────────────────────────┤
│ PRÓXIMA PARADA · chega ~11h40    │
│ Padaria Bom Pão                  │ 20 px negrito
│ R. Gaivota, 120 · 240 m a pé     │
│ [ Abrir no Maps ] [ Waze ]       │ 48
│ [ Ligar ]  [ Pular ] [ Depois ]  │ 48
├──────────────────────────────────┤
│ Ver as 17 que faltam           › │ 56
│ Meus retornos de hoje (2)      › │ 56  <- aba/atalho, ver nota
├──────────────────────────────────┤
│ (fixo no rodapé)                 │
│ [QR]  [ Cheguei: tirar a foto ]  │ 56
├──────────────────────────────────┤
│ Hoje │ Retornos (2) │ Ganhos     │ barra de 3 abas, 56
└──────────────────────────────────┘
```

- "Cheguei" **fica fixo** e **é** o `<label>` do `<input type="file" capture="environment">`: um toque abre a câmera direto (o clique tem que ser síncrono; por isso a posição de GPS é pedida em paralelo e usada quando a foto volta). Cancelar a câmera não cria nada.
- Sai da Hoje (vai para as abas "Retornos" e "Ganhos"): Ganhos, Pix, Cadastros confirmados, lista "Visitas de hoje", cartões de retorno. Dado nenhum é apagado.
- **Chegar a outra parada que não a próxima:** "Ver as 17 que faltam" abre a lista; **cada linha pendente tem o botão "Cheguei aqui"** (48 px, abre a câmera para aquela parada). 2 toques em vez de 5 telas/toques de hoje. Tocar no nome da linha abre os detalhes (Maps, Ligar, Pular).
- Se houver visita aberta: o botão fixo vira "Continuar visita: Padaria Bom Pão".
- **Fechado: dois caminhos, uma regra.** "Pular > Fechado" (sem foto, **não** conta na meta) é para quem vê de longe que o lugar está fechado e nem chega. O chip "Estabelecimento fechado" é para quem chegou e fotografou (**conta** como visita, porque a meta e o piso contam no check-in; ver pergunta 4). O texto do botão Pular explica: "Pular: não chegou ao local".
- Modo a pé/de carro (P0): chips "A pé · De carro" na tela "Iniciar o dia", lembrando o último; troca depois em "Roteiro > ⋯". Muda só o tempo estimado.
- "Visita fora do roteiro": item pequeno no menu "⋯" do topo (não ocupa o caminho principal); mantém `Nova visita` do modo completo.

**S0. Visita no caminho (roteiro desligado, sem parada, ou lugar que não está no roteiro)**

```text
┌──────────────────────────────────┐
│ ← Onde você está?                │
│ [ Buscar pelo nome        ]      │ 48, opcional
│ Perto de você (500 m)            │
│ ┌──────────────────────────────┐ │
│ │ Padaria Bom Pão       40 m   │ │ 64, a lista já abre carregada
│ │ R. Gaivota, 120              │ │
│ └──────────────────────────────┘ │
│ ... até 30, por distância ...    │
│ Não está na lista? [Cadastrar o  │
│ lugar]                           │ 56: nome + endereço (2 campos)
└──────────────────────────────────┘
```

- Entrada: botão "Visita no caminho" (no rodapé fixo da S1 quando não há parada; no menu "⋯" quando há). A lista **carrega ao abrir** (sem botão "Procurar") com a posição e mostra esqueleto de 4 linhas.
- Toque na linha → tela com o nome, a distância e o botão fixo "Tirar a foto da fachada" (abre a câmera) → S2. **5 toques até concluir "Fechado"** (Visita no caminho, escolher o lugar, foto, chip, Concluir) e 6 com motivo; 0 digitação quando o lugar está na lista.
- Estados: vazio "Nada cadastrado perto de você. Busque pelo nome ou cadastre o lugar."; sem sinal "Sem internet. A lista perto de você precisa de sinal. Cadastre o lugar (nome e endereço) e siga; conferimos depois." (único caso com digitação); GPS negado como em §2.3.
- O duplicado ("Já existe 'X' a 40 m: é esse?") do `NovaVisitaTela` continua, mas só depois de tocar "Cadastrar o lugar".

**S2. Resultado** (aparece assim que a foto volta; o check-in já está na fila)

```text
┌──────────────────────────────────┐
│ ← Padaria Bom Pão       [foto ▢] │ 56
│ ✓ Chegada registrada · 11h41     │
│ Como foi a visita?               │ 22 px
│ ┌────────────┐ ┌────────────┐    │
│ │ Cadastrou  │ │ Já usa o   │    │ 56 cada, 2 colunas, 8 px entre
│ │ agora      │ │ Freela     │    │
│ └────────────┘ └────────────┘    │
│ ┌────────────┐ ┌────────────┐    │
│ │ Quer       │ │ Sem        │    │
│ │ retorno    │ │ interesse  │    │
│ └────────────┘ └────────────┘    │
│ ┌────────────────────────────┐   │
│ │ Estabelecimento fechado    │   │
│ └────────────────────────────┘   │
│ ▸ Mais detalhes (opcional)       │ 56
├──────────────────────────────────┤
│ [   Concluir visita   ]          │ fixo, 56, desligado até escolher
└──────────────────────────────────┘
```

Sub-escolha (aparece **no mesmo lugar**, abaixo dos chips, sem outra tela, um toque):

| Chip | O que aparece | Obrigatório? |
|---|---|---|
| Sem interesse | "Por quê?" chips: Já usa outro app · Preço · Sem demanda · Outro | sim (1 toque) |
| Quer retorno | "Quando?" chips: Hoje à tarde · Amanhã · Em 2 dias · Escolher dia. Depois, opcionais: hora (chips Manhã/Tarde ou seletor) e "Telefone de quem atendeu" | sim, só o "quando" |
| Cadastrou agora | "Dar acesso ao Freela": [Mostrar o QR] · [Cadastrar por ele] (ver §4) | sim, uma das duas ou "Ainda não" (volta aos chips) |
| Já usa o Freela | nada | - |
| Fechado | nada (foto da fachada fechada é a prova) | - |

- O botão fixo diz o que vai acontecer: "Concluir: Sem interesse, Preço". Se escolheu "Quer retorno" e falta o quando: botão desligado com a frase "Falta dizer quando voltar."
- Nenhum chip vem pré-marcado (valor padrão errado vira dado falso, principalmente retorno).
- Depois de "Concluir": toast "Visita concluída: Padaria Bom Pão. Próxima: Bar do Chico. [Desfazer]" por 8 s e volta para S1 já com a nova parada. O envio do checkout aguarda os 8 s na fila local.

**Mais detalhes (opcional)**: acordeão **na própria S2** (não é tela nem diálogo). Reaproveita o `Questionario` atual, tudo opcional:

| Pergunta | Controle no modo simples |
|---|---|
| Quem atendeu | nome (texto) + chips Dono/Gerente/Outro |
| Interesse | chips Alto/Médio/Baixo/Nenhum |
| Vagas abertas agora | stepper − 0 + (e funções em chips se > 0) |
| Freelas por semana | stepper − 0 + (mesmo número exato do modo completo; faixas em chips perderiam precisão) |
| Apps e canais | chips (como hoje) + "Outro" |
| Observação | texto (ditado do teclado) |

**Resumo do que SAI do caminho principal sem perder dado:**

| Dado | Modo simples | Quem usa |
|---|---|---|
| Situação no Freela | derivada do resultado (Cadastrou→`cadastrou_qr`, Já usa→`ja_usa`, demais→`nao_cadastrou`, Fechado→vazio) | metas e "cadastrou agora" (contadores, ganhos) |
| Retorno (o quê, data) | "Quer retorno" + quando; "o quê" vira Observação opcional | lista Retornos e `next_step` do lead |
| Cadastro | chip "Cadastrou agora" + acesso | ganhos (só vale confirmado pelo Freela) |
| Nome, cargo, interesse, vagas, funções, freelas/semana, canais | **Mais detalhes (opcional)** | CRM do lead. **Deixam de ser obrigatórios**: pergunta 1 ao dono |
| Motivo da recusa, fechado, hora do retorno, telefone do contato, a pé/de carro | entram como no P0 da outra branch | análise de recusa e retorno |

### 2.3 Estados (S1, S2)

| Estado | S1 Roteiro | S2 Resultado |
|---|---|---|
| Carregando | esqueleto: faixa de meta + cartão de parada + 3 linhas; nunca spinner de tela cheia | miniatura da foto aparece na hora; chips já ativos (não dependem de rede) |
| Vazio (sem roteiro) | "Sem roteiro para hoje. Você pode visitar quem estiver no caminho." + [Visita fora do roteiro] e, se a equipe liberou, [Montar meu dia] | n/a |
| Vazio (acabou) | "Roteiro concluído: 30 de 30 visitas. Encerrar o dia?" [Encerrar o dia] | n/a |
| Erro de carga | "Não carregamos o roteiro. Mostrando o último guardado às 09h12." [Tentar de novo] | n/a |
| Erro ao enviar | n/a | "Não conseguimos enviar agora. Está guardado neste celular e sai sozinho." (sem ação do usuário) |
| Offline | faixa "Sem internet. 2 envios guardados" (a `FaixaFila` atual); lista guardada; Maps/Waze funcionam por endereço | tudo funciona; QR funciona; "Cadastrar por ele" guarda e avisa que o link só aparece com sinal |
| GPS negado | faixa "Ligue a localização para registrar a chegada. Configurações > Localização > Praça Campo." [Tentar de novo]. A foto tirada **fica guardada**, nada se perde. Sem desvio: sem posição não há check-in (decisão do designer) | idem |
| Longe do local (> 200 m) | n/a | faixa neutra (não vermelha) "Você está a 480 m do endereço." chips opcionais: "O endereço está errado" · "Estou na porta mesmo". **Não bloqueia**; marca `far_from_place` (como hoje). Nada de texto livre obrigatório como o do chefe |
| Sucesso | toast com Desfazer + parada seguinte em destaque | mesmo toast |

### 2.4 Microcopy

| Elemento | Texto |
|---|---|
| Botão fixo antes de chegar | "Cheguei: tirar a foto" |
| Botão com visita aberta | "Continuar visita: {nome}" |
| Pergunta | "Como foi a visita?" |
| Chips | "Cadastrou agora" · "Já usa o Freela" · "Quer retorno" · "Sem interesse" · "Estabelecimento fechado" |
| Botão fixo | "Concluir visita" / "Concluir: {resultado}" |
| Falta algo | "Falta escolher o motivo." / "Falta dizer quando voltar." |
| Sucesso | "Visita concluída. Próxima: {nome}." Desfazer |
| Encerrar dia (diálogo) | título "Encerrar o dia?" corpo "Você fez 24 de 30 visitas. A localização para de ser registrada." botões **Encerrar o dia** / Voltar |

Vocabulário: "parada", "retorno", "dono", nunca "lead", "check-in", "checkout", "status", "interlocutor". Tratamento "você". Sem ponto de exclamação em erro.

### 2.5 Acessibilidade e sol (WCAG 2.2 AA, a validar na implementação)

- Chips = `role="radiogroup"` com `role="radio"` e `aria-checked`; o escolhido tem **ícone ✓, borda de 3 px e fundo cheio**, não só cor. Sub-escolha anunciada com `aria-live="polite"`.
- Alvos: chips 56 px de altura × ~175 px de largura (2 colunas em 358 px úteis, 8 px entre), botões 48-56 px, abas 56 px. Texto ≥ 16 px nos chips e 14 px no mínimo no resto; "12 de 30" em 28 px.
- Contraste (calculado com os tokens de `globals.css`): `--primary-foreground` sobre `--primary` (#1D1D1B sobre #ECA826) **≈ 8,2:1** (passa). Mantido para o chip escolhido. Texto âmbar sobre fundo claro **≈ 1,9:1 (não passa)**: no tema claro nunca usar `text-primary`; usar fundo cheio com texto escuro ou `--foreground`. A borda `--border` do tema claro (≈ 1,3:1) não cumpre 3:1 para componente (1.4.11): no modo "Sol" chip e cartão usam borda de 2 px em `--foreground`. A medição final fica para o `browser-check` (critério C5 do spec de 19/10).
- "Cheguei" é um `<label>` ligado ao `<input>` (nome acessível "Cheguei: tirar a foto da fachada"). Foco devolvido ao chip escolhido depois que a sub-escolha abre. Zoom 200% sem rolagem horizontal. `prefers-reduced-motion`: sem animação além do estado.
- Teste real a fazer: leitor de tela (TalkBack) em S1 → S2 → Concluir.

---

## 3. Como o modo completo (nosso) convive

**Decisão do designer.** O modo completo é o fluxo de hoje, **sem alteração** (Hoje + Nova visita + Visita com as 8 perguntas obrigatórias). O modo simples é um segundo conjunto de visões em `/campo`, escolhido por configuração, e reutiliza `Questionario`, a fila, o roteiro e o cadastro assistido.

| Pergunta | Proposta |
|---|---|
| Por praça, por consultor ou por dia? | **Padrão da operação (global) + exceção por consultor.** Por dia não: a fila offline e o relatório ficariam misturados. Por praça: só se o dono pedir (mesma regra, uma camada a mais) |
| Quem escolhe? | Equipe admin. O consultor **não** troca sozinho (evita voltar ao antigo sem querer e o dado fica comparável) |
| Qual vale? | consultor > global. Vazio no consultor = "seguir o padrão" |
| Padrão na estreia | **Simples** para todos. O dono pediu o simples como padrão |
| Atalho no celular | Sem seletor no app. No modo simples, "Mais detalhes" já oferece tudo do completo, opcional, em uma visita específica. Quem está no modo completo vê o fluxo de hoje |
| Visita já aberta quando o modo muda | Cada visita guarda o modo em que nasceu (`mode` no check-in). O checkout é validado por esse modo, assim a fila offline de ontem continua válida |

Telas da equipe afetadas (mínimo):
1. **Configurações do campo** (`field_config`, §23.1): campo "Modo da visita" (Simples | Completo) com explicação de uma linha de cada.
2. **Ficha/diálogo do consultor**: "Modo da visita: Seguir o padrão · Simples · Completo".
3. **Dia do consultor** e **linha do tempo do estabelecimento** (já lê o resumo gravado no checkout): mostrar "Resultado: Sem interesse (Preço)". Em visita simples, campos não respondidos aparecem como "-" e **nunca** como "falta responder".
4. Alertas e indicadores não mudam (meta, jornada, ritmo vêm de check-in e jornada).

---

## 4. Cadastro da empresa visitada (cadastro assistido) no fluxo simples

**Momento certo:** logo depois do chip "Cadastrou agora", com o dono ainda na frente do consultor (hoje fica no fim de uma tela longa, depois de 8 perguntas).

```text
┌──────────────────────────────────┐
│ ← Dar acesso ao Freela           │
│ Padaria Bom Pão                  │
│ ┌──────────────────────────────┐ │
│ │ Mostrar o QR code            │ │ 56, ação principal: o dono aponta a câmera
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Cadastrar por ele            │ │ 56: pede 2 campos
│ └──────────────────────────────┘ │
│ Ainda não deu · voltar           │ 48
└──────────────────────────────────┘
```

- **Mostrar o QR** (0 digitação, funciona offline): tela atual `QrTela` em 300 px. Volta para S2 com "Concluir: Cadastrou agora".
- **Cadastrar por ele:** 2 campos obrigatórios, **Nome do responsável** e **WhatsApp**; "Nome da empresa" já vem da parada. E-mail, CNPJ e endereço saem para "Mais dados (opcional)" (hoje já é um `<details>`). Botão "Criar acesso" → tela com o QR do link de primeiro acesso (o consultor nunca vê senha, igual hoje) → "Concluir".
- Telas a mais: 1 (QR/formulário), em vez das 2 de hoje (formulário + link) mais a volta à visita.
- Textos: no QR, "Peça para o Marcos apontar a câmera. Ele escolhe a própria senha e já entra." Depois: "O Freela confirma depois. Só então conta nos ganhos."
- Sem sinal em "Cadastrar por ele": "Sem internet. Guardamos o pedido; o link só aparece quando o sinal voltar. Mostre o QR simples agora." (comportamento atual de `CadastroEmpresaTela`).
- "Cadastrou agora" continua sendo **declaração**; o ganho só conta quando o Freela confirma (regra existente). A aba Ganhos separa "Confirmado pelo Freela" e "Ainda não confirmado".

---

## 5. Critérios de aceite (testáveis, celular 390 × 844, Android intermediário)

| # | Critério | Como medir |
|---|---|---|
| A1 | Visita "Fechado" concluída em **≤ 3 toques** no app, 0 digitação | `browser-check` conta cliques da S1 até a visita na lista |
| A2 | "Sem interesse + motivo" e "Quer retorno + quando" em **≤ 4 toques**, 0 digitação | idem |
| A3 | "Cadastrou agora" pelo QR em **≤ 4 toques**; por "Cadastrar por ele" em **≤ 5 toques e 2 campos** | idem |
| A3b | Visita no caminho (sem roteiro) com lugar da lista concluída em **≤ 5 toques** (≤ 6 com motivo), 0 digitação; a lista abre carregada | idem |
| A3c | Chegar a uma parada que não é a próxima em **≤ 2 toques** até a câmera | idem |
| A4 | "Cheguei" visível **sem rolagem** em S1, a qualquer estado | medir `getBoundingClientRect()` no viewport |
| A5 | Todo alvo tocável ≥ 48 × 48 px (chips 56) e 8 px de distância | script de medição |
| A6 | Texto ≥ 14 px; contraste ≥ 4,5:1 (ícone/borda ≥ 3:1) nos dois temas, inclusive "Sol" | verificação automática (acrescentar ao `browser-check`) |
| A7 | Sem sinal: chegada, resultado, conclusão e QR funcionam; ao voltar o sinal sobem **em ordem e sem duplicar** (`client_id`) | simular offline |
| A8 | GPS negado: foto não se perde e a mensagem diz onde liberar | teste de navegador |
| A9 | Desfazer em até 8 s restaura a parada e nada é enviado antes | teste de navegador |
| A10 | Modo completo: fluxo atual intacto (os testes existentes continuam passando) | `yarn test`, `browser-check` |
| A11 | Trocar o modo de um consultor vale na próxima visita e não quebra visita aberta nem fila | teste de integração |
| A12 | Nenhum texto do consultor contém "lead", "check-in", "checkout", "status" ou código de erro | busca de texto |
| A13 | Zoom 200% sem rolagem horizontal; TalkBack percorre S1 → S2 → Concluir | teste manual |
| A14 | Uma pessoa nova conclui a primeira visita sem ajuda em **≤ 60 s** (hipótese a calibrar) | teste com pessoas |

### Teste de usabilidade (5 consultores, 1 sessão de ~30 min cada, em rua, celular deles)

Protocolo: pensar em voz alta, sem ajuda; um colega faz o dono do bar.
1. Iniciar o dia e ir até a primeira parada (Maps).
2. Chegar, tirar a foto e registrar "Estabelecimento fechado".
3. Registrar uma visita "Sem interesse" com motivo.
4. Registrar "Quer retorno" para amanhã, com o telefone de quem atendeu.
5. Registrar "Cadastrou agora" mostrando o QR ao colega; depois repetir com "Cadastrar por ele".
6. Errar de propósito (resultado errado) e desfazer; ficar sem sinal e continuar.
Métricas: conclusão, tempo, toques, erros, SUS (System Usability Scale, questionário de 10 perguntas), "o que você faria do jeito antigo em vez de usar isto?". Em campo: legibilidade ao sol (escuro × "Sol"), uso com uma mão, queda de sinal. Comparação A/B opcional: 2 dos 5 fazem a tarefa 3 também no modo completo, para ter a diferença em segundos reais.

---

## 6. Para o software-architect (não decidi sozinho)

- Visita ganha `result` (`cadastrou|ja_usa|retorno|sem_interesse|fechado`) e `mode` (`simples|completo`); `freela_status` derivado do resultado. `ANSWERS_INCOMPLETE` (§20.3) passa a depender do `mode` guardado no check-in (simples exige só resultado + motivo/quando; completo exige as 8 respostas).
- `GET /v1/campo/me` devolve `visit_mode` (consultor > global); `field_config.visit_mode` e `field_consultants.visit_mode` (nulo = seguir).
- Segurar o checkout 8 s na fila (Desfazer) e "cancelar visita aberta por engano": não sei se existe hoje.
- **Efeito do resultado no estabelecimento:** hoje o checkout move o lead de estágio 1 ou 2 para 3 "Conversa aberta" (§20.3). Isso é errado para `fechado` (não mudar estágio) e discutível para `sem_interesse` (gravar o motivo da perda, `lost_reason`, em vez de abrir conversa). Definir a regra por `result`.
- **Contagem:** visita conta na meta e no piso pelo check-in (`visits_count: checkin`, §28); um "fechado" fotografado entra na meta de 30 e no `min_visits`. Decidir se conta (pergunta 4).
- Resumo do checkout (`lead_events`) com o texto do resultado e do motivo.
- Contrato dos campos da outra branch (fechado, motivo, retorno com hora, contato opcional, modo a pé/de carro): confirmar nomes.

## 7. Perguntas ao dono (máx. 5)

1. **Vagas abertas, freelas por semana, canais, interesse e nome de quem atendeu: a equipe usa esses dados hoje?** Se não, saem do caminho (ficam em "Mais detalhes"). Se sim, qual deles vira um chip de 1 toque logo depois do resultado?
2. **Contato (nome, telefone, cargo) como o Diego faz:** obrigatório em todo resultado, ou só quando "Quer retorno" e "Cadastrou agora"? Eu proponho só nesses dois, e o telefone opcional.
3. **Simples já para todos os consultores na estreia,** e só admin troca o modo? Ou começar com 1 ou 2 consultores?
4. **Foto da fachada continua obrigatória** em qualquer resultado (inclusive "fechado")? Proponho sim (é a prova da visita). Nesse caso, um "fechado" fotografado **conta como visita** (meta de 30 e piso do ganho) ou só "Pular > Fechado" fica de fora da meta e o fotografado também? Proponho: fotografado conta, pulado não.
5. **O chip "Cadastrou agora" pode ser marcado antes do Freela confirmar** (como hoje, contado como declarado), ou o chip só aparece depois do QR/cadastro feito?

### Padrões que assumi (decisão do designer)

1. Resultado sem pré-seleção. 2. Concluir em 2 passos (chip + botão) com Desfazer de 8 s, em vez de um toque no chip que já conclui. 3. "Cheguei" fixo e abre a câmera direto; sem tela de confirmação extra (a câmera do sistema já confirma). 4. Longe do local (> 200 m) só marca e oferece 1 toque de motivo opcional; nunca texto obrigatório. 5. GPS negado bloqueia o check-in, sem desvio. 6. Três abas fixas (Hoje, Retornos, Ganhos); nada de menu hambúrguer. 7. Sem "nota do dia" para o consultor; o resumo do fim do dia mostra números com a conta ("24 de 30 visitas; 3 cadastros declarados, 1 confirmado"). 8. Modo por consultor + padrão geral; por praça só depois. 9. Intervalo/almoço continua informativo (sem evento).
