# Prospecção, rotas e ganhos — desenho de UX (blocos B, C e D)

**Data:** 19/10/2026 · **Status:** proposta para validação do dono · **Projeto:** `praca/`
**Base:** spec do bloco A (`2026-10-08-consultores-de-campo-design.md`) e o código de `web/src/components/campo/`,
`web/src/components/praca/ConsultorMapa.tsx`, `web/src/app/(app)/consultores/`, `web/src/lib/map-tiles.ts` e
`web/src/app/globals.css`.

Este documento só desenha (fluxos, telas, textos, critérios). Nada daqui foi construído. Onde o desenho depende de API
ou de regra que ainda não existe, está marcado **[API]** ou **[DECISÃO]**.

---

## 0. Resumo

| Pedido do dono | Entrega de UX | Onde vive |
|---|---|---|
| 1. Pesquisa de estabelecimentos | Tela "Buscar estabelecimentos": área, tipo, lista revisável, "Adicionar como leads" | Equipe (desktop), `/prospeccao` |
| 2. Cálculo de rota | Sem tela própria: a rota é o resultado de "Montar roteiro" e de "Refazer rota" | Equipe + consultor |
| 3. Roteiro do consultor | A tela **Hoje** passa a responder "para onde vou agora?": próxima parada, meta 30, navegação, pular/adiar | Consultor (celular), `/campo` |
| 4. Mapa de calor | Aba "Mapa de calor" em `/consultores` com filtros e leitura honesta | Equipe (desktop) |
| 5. Cadastro da empresa na visita | "Cadastrar a empresa agora" na visita, com acesso entregue por link/QR | Consultor + dono do estabelecimento |
| 6. Metas, alertas, ganhos, Pix | Meta na Hoje, "Atenção agora" na equipe, tela "Meus ganhos", fechamento de segunda | Ambos |

**Ordem de entrega (valor mais cedo, menos dependência):**

| Etapa | O que entra | Por que nesta ordem | Depende de |
|---|---|---|---|
| E1 | Meta e ritmo na Hoje + "Atenção agora" na equipe + Mapa de calor | Usa só dados que o bloco A já grava (jornadas, pontos, visitas). Nenhuma coleta nova | Só web + 1 endpoint de leitura agregada **[API]** |
| E2 | Buscar estabelecimentos (equipe) | Enche a base de leads com localização (hoje `leads.lat/lng` quase nulos). É pré-requisito do roteiro | Apify (decisão de custo) **[API]** |
| E3 | Montar roteiro (equipe) + Roteiro na Hoje + abrir no Maps/Waze + pular/adiar + refazer rota | Só faz sentido com leads localizados (E2) | E2 |
| E4 | Cadastro assistido da empresa | Precisa de endpoint de criação de conta no Freela que talvez não exista **[API]** | Freela + decisão 1 |
| E5 | Meus ganhos + fechamento semanal + Pix de segunda | Só paga o que o Freela confirma (blocos C e D) | Confirmação do Freela, carteira/Woovi |

Se o dono quiser algo visível em poucos dias, E1 sozinha já entrega: o chefe vê onde a equipe andou, e o consultor vê
"12 de 30".

---

## 1. Personas e contexto

Todas as descrições abaixo são **hipóteses** a partir do spec do bloco A e do pedido; validar nas 3 primeiras semanas
de uso real (plano na seção 12).

| Campo | Consultor de campo | Equipe do Praça (gestor/admin) | Dono do estabelecimento (receptor) |
|---|---|---|---|
| Quem é | Pessoa nova, contratada por diária variável, anda a pé num bairro (ex.: Moema). Familiaridade com tecnologia: usa WhatsApp e Maps todo dia, não é técnico | Diego, Rebeca, gestores. Acompanham vários consultores e várias praças | Dono ou gerente de bar/restaurante, em horário de trabalho, muitas vezes atrás do balcão, com pressa |
| Onde e quando | Rua, 9h–18h, **sol forte**, em pé ou andando, **uma mão** (a outra com água/pasta), celular Android intermediário, 4G que cai dentro de shoppings e subsolos, bateria que vai a 20% à tarde | Escritório, desktop 1280 px, ao longo do dia e na segunda cedo (fechamento) | Celular dele, na porta do estabelecimento, por 1 a 3 minutos |
| Precisa fazer | Frequentes: ver a próxima parada e ir até lá; fazer a visita (check-in, questionário, checkout); mostrar o QR. Críticas: não perder o que registrou sem sinal; saber quanto vai ganhar | Frequentes: ver quem está atrasado; ver onde andaram; montar o dia. Críticas: encher a base com estabelecimentos certos; fechar o pagamento de segunda sem erro | Entrar no Freela sem decorar nada |
| Usa hoje | WhatsApp com o chefe, Google Maps, planilha | Planilha, CRM do Praça, WhatsApp | Grupos de WhatsApp, agência |
| Permissões | Só o próprio dia, roteiro e ganhos (`aud: "campo"`) | Ler: toda a equipe. Escrever (criar consultor, publicar roteiro, ajustar regra de ganhos, pagar): `@AdminOnly` | Nenhuma no Praça |

**Jobs:**

- Consultor: "Quando termino uma visita, quero ver na hora para onde ir e abrir o caminho no meu app de mapa, para
  chegar às 30 visitas sem planejar nada de cabeça."
- Equipe: "Quando abro a praça de Moema, quero encher a lista de estabelecimentos e distribuir o dia de cada consultor,
  para que ninguém saia sem saber para onde ir."
- Equipe: "Quando fecho a semana, quero ver onde cada um andou e quanto cada um ganhou, com a conta, para pagar sem
  discussão."
- Dono do estabelecimento: "Quando o consultor me mostra o Freela, quero ter acesso em um minuto, sem anotar senha."

**Contexto físico, e o que isso obriga** (vale para toda tela do consultor):

- Uma mão e o polegar: ação principal na faixa fixa de baixo, 56 px de altura (já é o padrão `h-14` de `HojeTela`).
- Sol: texto mínimo 14 px nas telas novas, números de progresso em 28 px ou mais, tema claro de alto contraste
  disponível (seção 9).
- Sinal ruim: tudo o que o consultor faz **sem rede** precisa funcionar (seção 7). Pesquisa e montagem da rota são
  tarefas da equipe, com rede.
- Tela apaga: o GPS só grava com a página aberta (decisão 2 do bloco A). Nada neste desenho promete rastro contínuo.

---

## 2. Vocabulário (confirmar com o dono)

| Termo técnico (não usar na tela) | Termo cotidiano |
|---|---|
| lead, candidate | estabelecimento (no campo) · lead só na equipe, onde já se usa |
| route, itinerary, stop | roteiro, parada |
| reoptimize | "Refazer rota" |
| skip / postpone | "Pular" / "Deixar para depois" |
| heatmap | "Mapa de calor" (a equipe já diz assim) |
| journey | jornada (já usado no bloco A) |
| geocoding, Apify | nunca aparece; "Buscar estabelecimentos" |
| signup, onboarding | "Cadastro", "primeiro acesso" |
| payout | "Pix de segunda" |
| status `cadastrou_qr` | "cadastrou agora" (já usado) |
| confirmado / a confirmar | "Confirmado pelo Freela" / "Ainda não confirmado" |

Tratamento "você". Quem trabalha no Freela é "freelancer", nunca "profissional".

---

## 3. Regras de UX adotadas neste desenho

1. A tela **Hoje** responde à pergunta mais frequente do consultor: "para onde vou agora?".
2. Uma ação principal por tela, sempre no mesmo lugar (rodapé fixo), com verbo.
3. Mapa nunca é o único jeito de ver algo: toda tela de mapa tem uma lista equivalente (acessibilidade e sinal ruim).
4. **Todo número mostra a conta e a fonte** (regra permanente do dono, 08/10). Ex.: "R$ 120 = 12 cadastros
   confirmados × R$ 10".
5. Ações de efeito amplo (adicionar 37 leads, publicar roteiro, gerar acesso à empresa, pagar) pedem confirmação
   escrevendo a consequência. Ações reversíveis (pular parada) usam "Desfazer" por 8 segundos.
6. Nada depende de mensagem automática (WhatsApp/e-mail) para o trabalho do dia acontecer; mensagem é reforço. Motivo:
   o WhatsApp oficial e o Z-API estão fora do ar e o e-mail cai em spam (memória de 07/10, 27/09, 24/09).
7. Toda tela tem os quatro estados (carregando, vazio, erro, sucesso) e, no campo, o estado offline.

---

## 4. Consultor — fluxos e telas (celular, 360 × 640)

### 4.1 Fluxo do dia (caminho feliz) e contagem de toques

```text
Abrir o atalho "Praça Campo"  ─►  Hoje (já mostra a próxima parada)
        │
        ├─ [Iniciar jornada]                              1 toque  (como hoje)
        ├─ [Abrir no Maps] (ou Waze)                      1 toque  → app de mapa
        ├─ volta ao Praça, [Cheguei: fazer check-in]      1 toque  → foto (câmera) → [Fazer check-in]
        ├─ questionário (já existe) → [Fazer checkout]    como hoje
        └─ volta à Hoje com a parada seguinte já na frente
```

| Tarefa | Hoje (bloco A) | Com roteiro | Meta |
|---|---|---|---|
| Ir à próxima visita | Nova visita → Perto de mim → Procurar → escolher na lista = 4 toques e 1 espera de rede | [Abrir no Maps] = 1 toque | ≤ 1 toque, ≤ 3 s |
| Começar a visita | Escolher + foto + check-in | Cheguei + foto + check-in (estabelecimento já escolhido) | ≤ 3 toques + a foto |
| Pular uma parada fechada | não existe | Pular → motivo = 2 toques | ≤ 2 toques, com desfazer |
| Refazer a rota | não existe | Roteiro → Refazer rota = 2 toques | ≤ 2 toques, ≤ 5 s com sinal |
| Mostrar o QR | 1 toque | 1 toque (mantido) | 1 toque |
| Saber quanto ganhou hoje | não existe | Card na Hoje, 0 toques; conta com 1 toque | 0 toques para o total |

Desvios:

- **Sem sinal ao pedir "Refazer rota":** o aparelho reordena sozinho pelo mais próximo em linha reta e avisa
  "Rota refeita sem internet — pode haver caminho melhor. Refazemos de novo quando voltar o sinal."
- **Parada que não existe mais / fechou:** Pular → motivo "Fechado".
- **Visita fora do roteiro (surgiu um bar no caminho):** o fluxo "Nova visita" do bloco A continua; ela entra como
  "extra" e conta para a meta.
- **Já tem visita aberta:** a Hoje mostra "Continuar visita" no lugar de "Cheguei" (comportamento atual mantido).
- **GPS negado:** `AvisoGps` (existente) em cima; a navegação por Maps/Waze continua funcionando porque abre pelo
  endereço, sem precisar da posição do Praça.

### 4.2 Tela "Hoje" com roteiro (estado: jornada aberta)

```text
┌──────────────────────────────┐
│ Hoje · seg 19/10         ☀ Sol │  ← "Sol" liga o tema de alto contraste (§9)
├──────────────────────────────┤
│ 2 envios pendentes — enviando  │  ← FaixaFila (existente)
│ quando voltar o sinal          │
├──────────────────────────────┤
│ 12 de 30 visitas               │
│ ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░         │
│ Ritmo: 1 à frente  ✓           │
│ (às 11h30 o esperado é 11)     │
├──────────────────────────────┤
│ PRÓXIMA PARADA · chega ~11h40  │
│ Padaria Bom Pão                │
│ R. Gaivota, 120                │
│ 240 m · 4 min a pé             │
│ [  Abrir no Maps  ] [ Waze ]   │  ← h-12 (48 px), lado a lado
│ [ Pular ]  [ Deixar p/ depois ]│
├──────────────────────────────┤
│ Ver as 17 que faltam         › │  ← lista/mapa (§4.3)
│ Ganhos de hoje  R$ 100       › │  ← §4.7
├──────────────────────────────┤
│ Visitas de hoje (card-surface) │
│ Bar do Zé · 10h52 · 14 min     │
│ ...                            │
├──────────────────────────────┤
│ [QR code] [ Cheguei: fazer     │  ← rodapé fixo (padrão atual)
│            check-in         ]  │
└──────────────────────────────┘
```

Regras da tela:

- "12 de 30" conta visitas **concluídas ou abertas**; parada pulada ou adiada **não** conta (pedido do dono: meta de
  visitas, não de paradas).
- O ritmo é calculado e mostrado com a conta: 30 visitas em 8 h úteis (9h–18h menos 1 h de almoço) = uma a cada
  16 min. Texto: "Ritmo: 1 à frente" / "Ritmo: 3 atrás — faltam 10 para chegar a 30 às 18h". Sempre com ícone (✓ ou
  ⚠) e texto, nunca só cor.
- Quando o GPS atual está a menos de 150 m da parada, aparece o selo "Você está a 40 m daqui" (ajuda, não bloqueia).
- Quando não há roteiro, a Hoje fica como hoje (card "Pronto para sair?" e "Nova visita"), com uma linha: "Sem
  roteiro para hoje. Você pode fazer visitas livres; peça à equipe para montar um." e o botão secundário "Montar meu
  dia" (usa a rota automática da praça dele, se a equipe permitir — **[DECISÃO]** 3).

### 4.3 Roteiro completo (lista primeiro, mapa depois)

```text
┌──────────────────────────────┐
│ ←  Roteiro de hoje             │
│ [ Lista ] [ Mapa ]             │  ← segmentado, 48 px, Lista é o padrão
├──────────────────────────────┤
│ MANHÃ                          │
│ ✓ 1  Bar do Zé        10h52    │
│ ✓ 2  Café Ipê         11h10    │
│ ▶ 3  Padaria Bom Pão  ~11h40   │  ← parada atual destacada (ícone ▶ + negrito)
│   4  Churrascaria Sul ~11h55   │
├──────────────────────────────┤
│ ALMOÇO  12h00–13h00            │
├──────────────────────────────┤
│ TARDE                          │
│   5  Lanchonete 24h   ~13h10   │
│ ⏭ 9  Bar do Chico  (para depois)│
│ ✕ 7  Boteco X        pulada: fechado │
├──────────────────────────────┤
│ [  Refazer rota a partir daqui ]│  ← CTA fixo
└──────────────────────────────┘
```

- Cada linha tem alvo de 56 px; toque abre a parada (§4.4). Estado sempre por ícone + palavra: ✓ feita, ▶ agora,
  ⏭ para depois, ✕ pulada.
- Bloco **Almoço 12h–13h** é só informativo: não trava nada, não exige "iniciar almoço". Depois de 13h, as horas
  estimadas são recalculadas.
- **Mapa:** o mesmo Leaflet de `ConsultorMapa`, pinos numerados na ordem, linha âmbar ligando as paradas
  (`#ECA826`, como o trajeto da equipe), pino da parada atual maior com contorno branco. Tem sempre a lista logo
  abaixo ao rolar; nunca é a única forma de ver (sinal ruim carrega o mapa devagar).
- "Refazer rota a partir daqui" abre um diálogo: "Refazer a ordem das 17 paradas que faltam, a partir de onde você
  está? As já feitas não mudam." Botões: **Refazer rota** / Cancelar.

### 4.4 Parada (detalhe) e "Pular / Deixar para depois"

```text
┌──────────────────────────────┐
│ ←  Padaria Bom Pão             │
│ R. Gaivota, 120 · 240 m        │
│ Última visita: nunca           │
│ [  Abrir no Maps  ] [ Waze ]   │
│ [  Ligar  ]  (se tiver telefone)│
├──────────────────────────────┤
│ Pular ou deixar para depois?   │
│ (  Fechado  ) ( Sem dono aqui ) │  ← chips h-12, um toque já confirma
│ (  Já é cliente  ) ( Outro   ) │
│ [ Deixar para depois das 13h ] │
└──────────────────────────────┘
```

- Escolher um motivo pula na hora e mostra o toast "Pulada: Fechado. [Desfazer]" por 8 s. Sem confirmação extra (baixo
  risco e reversível).
- "Deixar para depois" manda a parada para o fim do bloco (manhã vai à tarde; tarde vai para amanhã). O texto diz para
  onde foi: "Deixada para a tarde" / "Deixada para amanhã".
- A equipe vê os motivos (§6.5). Se o dono decidir que o consultor não pode pular livremente, o botão passa a ser
  "Pedir para pular" **[DECISÃO]** 3.

### 4.5 Chegada e check-in (reaproveita `NovaVisitaTela`)

"Cheguei: fazer check-in" abre a mesma tela de check-in já existente, **pulando a escolha do estabelecimento** (o
`escolhido` já vem preenchido com a parada) e indo direto para "Foto da fachada". O restante (foto, `Fazer check-in`,
questionário, checkout) não muda. O selo "longe do local" (>200 m) continua só como marca para a equipe.

### 4.6 Cadastro da empresa durante a visita (item 5)

**Princípio:** por padrão, o consultor não vê nem digita senha da empresa (exceção: a opção "senha temporária" abaixo, em que ele vê a senha, que por isso vale só para o primeiro acesso e expira em 24 h); o acesso é entregue ao dono por link/QR aberto no
celular dele. Isso mantém o vínculo com o código do consultor (decisão 3 do bloco A) e não depende de mensagem
automática (regra 6). **[DECISÃO]** 1.

Dois caminhos na tela da visita (hoje só existe o QR):

```text
┌──────────────────────────────┐
│ ←  Padaria Bom Pão (visita)    │
│ ... questionário ...           │
├──────────────────────────────┤
│ Dar acesso ao Freela           │
│ ( Mostrar o QR code )          │  ← caminho A: o dono cadastra sozinho (atual)
│ ( Cadastrar por ele )          │  ← caminho B: o consultor preenche 3 campos
└──────────────────────────────┘
```

**Caminho B, passo 1 — dados mínimos (4 campos no máximo):**

```text
┌──────────────────────────────┐
│ ←  Cadastrar a empresa         │
│ Nome do responsável            │
│ [ Marcos Oliveira          ]   │
│ WhatsApp do responsável        │
│ [ (11) 9____-____          ]   │  ← inputmode=tel
│ Nome da empresa                │
│ [ Padaria Bom Pão (da visita)] │  ← já preenchido
│ E-mail (opcional)              │
│ [                          ]   │
├──────────────────────────────┤
│ [   Criar acesso   ]           │
└──────────────────────────────┘
```

**Passo 2 — entregar na hora (tela para mostrar ao dono, texto grande, sem nada técnico):**

```text
┌──────────────────────────────┐
│ Acesso criado para             │
│ Padaria Bom Pão                │
│                                │
│     ┌────────────┐             │
│     │   QR code  │             │  ← 300 px, mesmo QrDoFreela
│     └────────────┘             │
│ Peça para o Marcos apontar a   │
│ câmera. Ele escolhe a própria  │
│ senha e já entra.              │
│ O link vale por 24 horas.      │
├──────────────────────────────┤
│ [ Enviar também por WhatsApp ] │  ← reforço, abre o WhatsApp do consultor (wa.me)
│ [ Concluir ]                   │
└──────────────────────────────┘
```

- O envio é feito pelo **WhatsApp do próprio consultor** (link `wa.me` com a mensagem pronta), não por disparo do
  servidor. Assim funciona mesmo com a Meta/Z-API fora.
- **Senha temporária (opção secundária, só se o dono pedir):** botão pequeno "O dono prefere uma senha". Abre diálogo
  "Gerar senha temporária? Ela aparece uma única vez nesta tela, para o dono anotar. Ele troca no primeiro acesso."
  Nesse caso o consultor vê a senha; por isso ela vale só para o primeiro acesso e expira em 24 h.
  Botão **Gerar senha temporária**. A senha fica em 28 px, com contagem "some em 60 s". Nada de senha no histórico
  nem no resumo da visita.
- Estados:
  - Carregando: botão vira "Criando acesso…" (sem spinner de tela cheia).
  - Sem sinal: "Sem internet. Guardamos o pedido e criamos o acesso quando voltar o sinal. Mostre o QR simples agora."
    (cai no caminho A, que já funciona offline porque o link é do consultor.)
  - Telefone já cadastrado: "Esse WhatsApp já tem conta no Freela. Peça para ele entrar com o número dele, ou use o
    QR code." Link "Mostrar o QR code".
  - Erro do Freela: "Não conseguimos criar o acesso agora. Seus dados continuam aqui. Tente de novo ou mostre o QR code."
    [Tentar de novo].
  - Sucesso: a visita ganha a marca "Acesso criado · aguardando o dono entrar". Vira "Cadastro confirmado" só quando o
    Freela confirmar (bloco C). O contador "cadastrou agora" continua sendo declaração, como no spec do bloco A.
  - "Mensagem não saiu": se o consultor tocou em "Enviar também por WhatsApp" e voltou sem enviar, a visita mostra
    "Link ainda não enviado. [Enviar de novo] [Mostrar o QR]".

### 4.7 Meus ganhos (item 6)

Entrada: card "Ganhos de hoje" na Hoje (0 toques para o total, 1 toque para a conta).

```text
┌──────────────────────────────┐
│ ←  Meus ganhos                 │
├──────────────────────────────┤
│ HOJE · seg 19/10               │
│ R$ 100                         │  ← 32 px
│ = piso da diária (R$ 100).     │
│ 4 cadastros confirmados ×      │
│ R$ 10 = R$ 40, menor que o piso│
│                                │
│ Cadastros hoje                 │
│  4 confirmados pelo Freela  ✓  │
│  3 ainda não confirmados    ⏳ │  ← não entram no valor
│ Faltam 16 confirmados para o   │
│ bônus de R$ 250 (20 a 25).     │
├──────────────────────────────┤
│ SEMANA · 19/10 a 25/10         │
│ R$ 100 até agora               │
│ Pix previsto: seg 26/10        │
├──────────────────────────────┤
│ Dias anteriores  ›             │
└──────────────────────────────┘
```

- Duas linhas sempre separadas: **Confirmado pelo Freela** (paga) e **Ainda não confirmado** (declarado; pode não
  pagar). O consultor não deve achar que já ganhou o que ainda não foi confirmado.
- A conta aparece escrita; cada número tem a origem na própria frase.
- A data do Pix é absoluta ("seg 26/10"), nunca "na próxima segunda".
- A regra de valor é **ambígua no pedido** (seção 11, decisão 2). A tela é desenhada para a leitura padrão; se o dono
  escolher outra, só muda o texto da conta.
- Estados: carregando (esqueleto de 3 blocos); vazio ("Ainda não há ganhos hoje. O piso de R$ 100 vale quando você
  fizer visitas."); erro ("Não conseguimos carregar seus ganhos. Tente de novo."); offline (mostra o último valor
  guardado com "atualizado às 11h10, sem internet").

---

## 5. Equipe — desktop (1280 px)

### 5.1 Buscar estabelecimentos (item 1)

Item novo no menu: **Buscar estabelecimentos** (`/prospeccao`). Três passos numa só tela, sem modal dentro de modal.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Buscar estabelecimentos                                               │
│ Encontre bares e restaurantes numa região e escolha quais viram leads.│
├───────────────────────────┬──────────────────────────────────────────┤
│ 1. Onde buscar            │  [mapa Leaflet com o círculo da busca]    │
│ Praça [ Moema ▾ ]         │                                           │
│ ( ) A praça inteira       │                                           │
│ (•) Bairro ou endereço    │                                           │
│   [ Moema, São Paulo   ]  │                                           │
│   Raio  ──●──── 1,5 km    │                                           │
│ ( ) Desenhar no mapa      │                                           │
│                           │                                           │
│ 2. O que buscar           │                                           │
│ (Bares)(Restaurantes)     │                                           │
│ (Lanchonetes)(Padarias)   │                                           │
│ (Cafés)                   │                                           │
│                           │                                           │
│ Esta busca usa créditos   │                                           │
│ pagos. Estimativa: ~200   │                                           │
│ resultados.               │                                           │
│ [   Buscar   ]            │                                           │
└───────────────────────────┴──────────────────────────────────────────┘
```

**Resultado (mesma tela, abaixo ou à direita), revisão antes de virar lead:**

```text
│ 3. Escolha quais entram                         Achamos 214 · 37 já estão na praça │
│ [ buscar na lista… ]   Mostrar: (Todos)(Novos)(Já na praça)                        │
│ ☑ Nome                    Endereço              Dist.  Telefone    Situação        │
│ ☑ Padaria Bom Pão         R. Gaivota, 120       240 m  (11) 3…     Novo            │
│ ☑ Bar do Chico            Av. Ibirapuera, 88    480 m  —           Novo            │
│ ☐ Café Ipê                Al. dos Anapurus, 7   510 m  (11) 2…     Já está na praça│
│ ☐ Boteco X                R. Pavão, 15          700 m  —           Parece fechado  │
│ ...                                                                                │
│ 177 selecionados            [ Adicionar 177 como leads ]                           │
```

- Padrão: marcar todos os **Novos** que não parecem fechados; "Já está na praça" (mesmo nome parecido a menos de
  100 m — a mesma regra do bloco A) vem desmarcado e não pode ser adicionado de novo.
- Confirmação (alto efeito): "Adicionar 177 estabelecimentos à praça Moema? Entram como **Lead novo**, origem
  'busca automática'. Ninguém recebe mensagem." Botão **Adicionar 177 leads**.
- Sucesso: toast "177 leads adicionados à praça Moema" + botões "Ver a praça" e "Montar roteiro com eles" (leva ao 5.2).
- **A busca é um trabalho com progresso, não um spinner:** "Buscando… 62 encontrados até agora" com botão
  "Cancelar". O resultado fica guardado por 7 dias ("Busca de 19/10 em Moema, 214 resultados") para o gestor voltar
  sem pagar de novo.
- Estados:
  - Vazio: "Escolha uma área e o que buscar. Os resultados aparecem aqui para você revisar antes de adicionar."
  - Nada encontrado: "Nenhum estabelecimento nessa área. Aumente o raio ou tire algum tipo."
  - Muitos resultados (> 300): "Achamos mais de 300. Reduza a área para ver todos." (impede estourar custo e lista).
  - Erro do provedor: "A busca não funcionou agora. Nada foi cobrado. [Tentar de novo]" **[API]** (confirmar se
    cobra em falha parcial).
  - Parcial: "A busca parou em 140 de ~200 (limite do provedor). Os 140 podem ser usados. [Buscar o resto]".
- Acessibilidade: a tabela é a forma principal; o mapa é apoio, com o mesmo conteúdo na lista; marcar linha com
  Espaço, "Selecionar todos os novos" com atalho visível.
- **[DECISÃO]** 4: quem pode disparar uma busca paga e se o resultado entra direto como lead ou sempre passa por
  esta revisão. Recomendação: só admin dispara; sempre revisão.

### 5.2 Montar roteiro (item 2: o cálculo da rota)

Não existe tela de "calcular rota": a rota nasce quando a equipe monta o dia. Tela `/consultores/roteiros`.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Montar roteiro                       Dia [ ter 20/10 ▾ ]  Praça [Moema▾]│
├──────────────────────────────────────────────────────────────────────┤
│ Consultor     Ponto de partida   Visitas   Resultado                    │
│ Ana Souza     [ R. Gaivota 1 ▾ ] [ 30 ]    30 paradas · ~7,8 km a pé    │
│ Bruno Lima    [ último ponto ▾ ] [ 30 ]    28 paradas (faltam 2) ⚠      │
│ [ Montar roteiros ]                                                     │
├──────────────────────────────┬───────────────────────────────────────┤
│ Ana · 30 paradas (lista)     │ [mapa com as paradas numeradas]        │
│ 1 Padaria Bom Pão  ~9h10     │                                        │
│ 2 ...  (arrastar para mudar) │                                        │
├──────────────────────────────┴───────────────────────────────────────┤
│ Só entram estabelecimentos "Lead novo" sem visita nos últimos 30 dias.  │
│                          [ Publicar roteiros para 2 consultores ]       │
```

- A equipe escolhe dia, praça e consultores; o sistema separa os estabelecimentos por região (um bairro/quadrante por
  consultor, sem sobreposição) e ordena cada rota pelo menor caminho, com paradas de 9h às 18h e o bloco de almoço
  12h–13h. Mostra "30 paradas · ~7,8 km a pé" (a conta: soma dos trechos em linha reta × 1,3, a pé; **[API]** o fator
  real vem do serviço de rota).
- A equipe pode arrastar uma parada para outra posição ou outro consultor. "Montar de novo" refaz do zero.
- Faltam estabelecimentos para chegar a 30 → aviso com ação: "Bruno ficou com 28. Rode uma busca em Moema ou aceite 28".
- Publicar (efeito para terceiros): "Publicar o roteiro de ter 20/10 para Ana e Bruno? Eles veem na tela Hoje ao abrir o
  aplicativo." Botão **Publicar roteiros**. Republicar substitui o anterior e avisa quem já começou.
- Estados: carregando ("Calculando as rotas…" com barra, até 10 s); vazio ("Ainda não há estabelecimentos com
  localização nesta praça. [Buscar estabelecimentos]"); erro ("Não conseguimos calcular. Seus ajustes continuam aqui.
  [Tentar de novo]").

### 5.3 Mapa de calor (item 4)

Aba nova em `/consultores`: **Lista | Mapa de calor**.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Consultores   [ Lista ] [ Mapa de calor ]                             │
├──────────────────────────────────────────────────────────────────────┤
│ Consultor [ Todos ▾ ]  Período (Hoje)(7 dias)(30 dias)[ 10/10–19/10 ] │
│ Praça [ Moema ▾ ]      Mostrar ☑ Onde passaram ☑ Visitas ☐ Falta visitar│
├───────────────────────────────────────────────┬──────────────────────┤
│                                               │ Resumo (10/10–19/10)  │
│   [ mapa Leaflet, tiles escuros ]             │ 412 visitas feitas    │
│        calor âmbar → branco                   │ 140 estabelecimentos  │
│        pinos de visita                        │ 87 já visitados (62%) │
│                                               │ = 87 de 140 leads com │
│  Legenda: ░ poucos passos ▒ ▓ █ muitos        │ ao menos 1 visita     │
│                                               │ Por consultor         │
│  "Mostra onde a tela estava aberta: um ponto  │ Ana    214 visitas    │
│  a cada 5 min e cada visita. Trechos com tela │ Bruno  198 visitas    │
│  apagada ou sem sinal não aparecem."          │ [Baixar lista CSV]    │
└───────────────────────────────────────────────┴──────────────────────┘
```

- **Leitura honesta:** o calor soma pontos de trajeto (peso 1) e check-ins (peso 5), porque o check-in é o dado mais
  confiável (o trajeto só grava com a página aberta, decisão 2 do bloco A). O texto de aviso acima fica sempre
  visível, não escondido atrás de "?".
- "Falta visitar" desenha os leads da praça sem visita como pontos cinza-claro com contorno (sem cor como único sinal:
  forma diferente do pino de visita) — responde a pergunta que a equipe mais faz: "onde ainda não fomos?".
- Filtros são multi-seleção de consultor, período e praça; ficam na URL para a equipe compartilhar a vista.
- Tooltip do pino: nome do estabelecimento, hora, consultor (textContent, nunca HTML — mesma regra do
  `ConsultorMapa` atual).
- Estados: carregando (mapa vazio com esqueleto e "Carregando pontos…"); vazio ("Nenhum registro de trajeto nesse
  período. Escolha outro período ou consultor."); erro ("Não conseguimos carregar o mapa. [Tentar de novo]");
  muitos pontos (mais de ~50 mil → amostra por quadra de 25 m e aviso "Mostrando uma amostra do período").
- Alternativa sem mapa: tabela "Quadras mais visitadas" (endereço aproximado, visitas, última visita), para leitor de
  tela e para quem prefere números.

#### Paleta do mapa de calor (sobre tiles OSM invertidos)

Fatos do código: o OSM só tem mapa claro; no tema escuro a camada de tiles recebe `.tiles-escuros`
(`invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9) saturate(0.5)`). O filtro é só na camada de tiles; o calor
é desenhado por cima e **não** é invertido. Resultado esperado (**hipótese, não verificada sobre o mapa renderizado**): fundo
cinza-carvão; com `invert(1)` o que fica claro tende a ser o texto (nomes de rua), e as vias menores podem ficar mais
escuras que o terreno; água e parques azulados/esverdeados dessaturados. Por isso o topo da rampa não pode cobrir
rótulos de rua (opacidade máxima 75%, cor até `#FFC857`):

- Evitar azul, ciano e verde no calor (se confundem com água e parque depois do `hue-rotate`).
- Variar a **luminosidade** de forma monótona (quanto mais passos, mais claro), e a matiz só como apoio, para quem não
  distingue cores.
- A ponta baixa fica **transparente**, não preta: o mapa por baixo continua legível.

| Densidade | Tema escuro (tiles invertidos) | Tema claro (tiles normais) |
|---|---|---|
| 0 (nada) | transparente | transparente |
| ~15% | `#B4701A` a 25% de opacidade | `#F2C36B` a 35% |
| ~40% | `#ECA826` a 55% (âmbar do sistema) | `#E08A12` a 60% |
| ~70% | `#FFC857` a 75% | `#B8500A` a 75% |
| 100% | `#FFC857` a 75% (teto; branco puro apagaria rótulos) | `#6B240A` a 75% |

- Raio de cada ponto 22 px e desfoque 18 px no zoom 15; visita (check-in) tem peso 5.
- Pinos de visita: círculo com borda branca de 2 px e miolo âmbar `#ECA826`; "longe do local" com borda
  `#B4432E`, **mais** um símbolo "!" dentro (não só cor). "Falta visitar": círculo vazio de 8 px, borda `#9A9A92`.
- Linhas de trajeto de um dia continuam `#ECA826`, como no `ConsultorMapa` atual.
- A legenda é um degradê com três rótulos em texto ("poucos passos", "alguns", "muitos") e um tooltip com o número
  absoluto ao passar o mouse.
- **[Para verificar com o mapa real]:** as opacidades acima são ponto de partida; precisam ser olhadas sobre os tiles
  de Moema (zoom 14 a 17) antes de fechar, conferindo que **o calor não cobre rótulos de rua**. Não foram medidas
  contra o mapa renderizado.

### 5.4 Lista de consultores: metas, "Atenção agora" e ganhos (itens 6)

Em `/consultores` (aba Lista), acima da tabela atual:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Atenção agora (3)                                                     │
│ ⚠ Bruno Lima — não iniciou a jornada (esperado às 9h; agora 9h40)     │
│   [ Ligar ] [ Chamar no WhatsApp ]                                    │
│ ⚠ Ana Souza — visita aberta há 52 min (Churrascaria Sul)              │
│ ⚠ Carla Dias — 8 de 18 esperadas até 14h (ritmo 10 atrás)             │
├──────────────────────────────────────────────────────────────────────┤
│ Consultor   Situação      Meta de hoje          Ritmo     Último ponto │
│ Ana Souza   Em jornada    12 de 30 ▓▓▓▓░░░      ✓ ok      11h32        │
│ Bruno Lima  Não iniciou   0 de 30               ⚠ atraso   —           │
```

- Alertas **dentro da tela**, não por mensagem (regra 6 da seção 3). "Ligar" é `tel:`; "Chamar no WhatsApp" é `wa.me`,
  abertos pela própria pessoa da equipe.
- Os alertas e os limites (9h30, 40 min, 30 min sem ponto) ficam em Configurações, editáveis. Padrões:
  não iniciou até 9h30; visita aberta há mais de 40 min; sem registro há mais de 30 min com jornada aberta; ritmo
  atrás por 5 ou mais visitas; check-in longe do local.
- Texto honesto para "sem registro": "Sem registro há 35 min (pode ser tela apagada)". Não acusa.
- Tela dos ganhos da equipe (fechamento de segunda, bloco D) fica em "Pagamentos": tabela por consultor com a conta
  em cada linha, "Confirmado" × "Ainda não confirmado", total a pagar e botão **Pagar 6 consultores por Pix**
  (confirmação: "Pagar R$ 1.340,00 por Pix a 6 consultores? Não dá para desfazer."). Estados de Pix: Agendado,
  Enviado, Falhou. **Requisito:** falha de Pix aparece em "Atenção agora" e tem "Tentar de novo" manual (no Freela, em
  17/10, um saque FAILED não alertou ninguém nem foi tentado de novo; não repetir). Risco para o bloco D: a conta
  Woovi está com saques bloqueados (TOO_MANY_REQUESTS) desde 17/10.

---

## 6. Microcopy (pt-BR)

| Elemento | Texto |
|---|---|
| Título da Hoje | "Hoje" (já existe) |
| Meta | "12 de 30 visitas" |
| Ritmo bom | "Ritmo: 1 à frente" |
| Ritmo atrás | "Ritmo: 3 atrás. Faltam 10 para chegar a 30 às 18h" |
| Próxima parada | "Próxima parada · chega por volta das 11h40" |
| Navegar | "Abrir no Maps" · "Abrir no Waze" |
| Perto | "Você está a 40 m daqui" |
| CTA | "Cheguei: fazer check-in" |
| Pular | "Pular" · motivos: "Fechado", "Sem dono aqui", "Já é cliente", "Outro motivo" |
| Adiar | "Deixar para depois" · "Deixada para a tarde" / "Deixada para amanhã" |
| Desfazer | "Pulada: Fechado. Desfazer" |
| Refazer | "Refazer rota a partir daqui" · diálogo: "Refazer a ordem das 17 paradas que faltam, a partir de onde você está? As já feitas não mudam." · botão "Refazer rota" |
| Refazer sem internet | "Rota refeita sem internet. Pode haver caminho melhor; refazemos quando voltar o sinal." |
| Almoço | "Almoço · 12h às 13h" |
| Fim do dia | "18h. Faltam 6 visitas. Encerrar a jornada?" |
| Encerrar (diálogo, substitui o `window.confirm` atual) | "Encerrar a jornada de hoje? Você fez 24 de 30 visitas e a localização para de ser registrada." · botão "Encerrar jornada" |
| Cadastro assistido | "Cadastrar a empresa" · "Criar acesso" · "Acesso criado para Padaria Bom Pão" · "Peça para o Marcos apontar a câmera. Ele escolhe a própria senha e já entra." |
| Ganhos | "Ganhos de hoje" · "Confirmado pelo Freela" · "Ainda não confirmado" · "Pix previsto: seg 26/10" |
| Busca | "Buscar estabelecimentos" · "Adicionar 177 leads" · "Já está na praça" · "Parece fechado" |
| Roteiro (equipe) | "Montar roteiros" · "Publicar roteiros" |
| Mapa de calor | "Onde passaram" · "Visitas" · "Falta visitar" · aviso: "Mostra onde a tela estava aberta: um ponto a cada 5 min e cada visita. Trechos com tela apagada ou sem sinal não aparecem." |
| Erro genérico de rede | "Sem internet. Seu pedido está guardado e sai quando o sinal voltar." |
| Erro de servidor | "Não conseguimos fazer isso agora. Seus dados continuam aqui. [Tentar de novo]" |

Sem ponto de exclamação em erro; sem "lead" nem "rota otimizada" nas telas do consultor.

---

## 7. Estados, em resumo (e comportamento offline)

| Tela | Carregando | Vazio | Erro | Offline |
|---|---|---|---|---|
| Hoje com roteiro | Esqueleto de meta + card de parada (nunca spinner de tela cheia) | "Sem roteiro para hoje…" | "Não carregamos o roteiro. Mostrando o último guardado às 09h12. [Tentar de novo]" | Mostra o roteiro guardado no aparelho (como os snapshots de `today`), faixa `FaixaFila` |
| Roteiro (lista) | 5 linhas de esqueleto | "Nenhuma parada pendente. Você fez tudo." | idem | Lista completa guardada; mapa pode não carregar os tiles, a lista continua |
| Parada / pular / adiar | — | — | — | Pular e adiar entram na **fila offline existente** (novo tipo de item), com `client_id` e hora real |
| Refazer rota | "Refazendo a rota…" (≤ 5 s) | — | "Não conseguimos refazer. A ordem atual continua. [Tentar de novo]" | Reordena no aparelho pelo mais próximo em linha reta e avisa (§6) |
| Cadastrar empresa | "Criando acesso…" | — | ver §4.6 | Guarda o pedido e mostra o QR simples |
| Meus ganhos | Esqueleto | texto de §4.7 | "Não conseguimos carregar seus ganhos." | Último valor guardado + "atualizado às…" |
| Buscar estabelecimentos | Progresso "62 encontrados" | ver §5.1 | ver §5.1 | Equipe usa com rede; sem rede: "Sem internet. A busca precisa de conexão." |
| Mapa de calor | Esqueleto do mapa | ver §5.3 | ver §5.3 | idem |

Regras offline do roteiro: o roteiro do dia é gravado no aparelho ao publicar/abrir; mudanças feitas offline (pular,
adiar, check-in) entram na fila existente e **respeitam a ordem**; o abrir no Maps/Waze funciona por endereço
(link universal), sem nenhum dado do Praça.

---

## 8. Reaproveitamento de componentes e tokens

| Necessidade | Reaproveitar | Observação |
|---|---|---|
| Cartões | `card-surface` (`globals.css`, fundo `--card`, borda `--border`) | Todos os cards novos |
| Botão principal fixo | Barra `fixed inset-x-0 bottom-0` de `HojeTela` e `NovaVisitaTela` (`h-14`, safe-area, `bg-background/95`) | Mesmo padrão, com o CTA contextual |
| Botão secundário | `Button variant="outline"` | Maps/Waze/Pular em `h-12` |
| Cabeçalho com voltar | `CampoTopo` | Telas novas do campo |
| Faixa offline | `FaixaFila` (`role="status"`, `warning`) | Os novos tipos de item (pular, adiar, cadastrar) entram na mesma fila |
| Aviso de GPS | `AvisoGps` | Mesmo uso |
| QR | `QrDoFreela` (300 px), `QrTela` | Também na tela de acesso criado |
| Mapa da equipe | `ConsultorMapa` (Leaflet dinâmico, `ssr: false`), `TILES_URL`, `tilesOptions(dark, …)`, `.tiles-escuros` | Camada de calor em componente novo irmão, `CalorMapa`, mesmo padrão de carga |
| Seleção por abas | `role="tablist"` de `NovaVisitaTela` | Lista/Mapa, Lista/Mapa de calor |
| Diálogos | `Dialog` (já usado em `ConsultorDialog`) com `max-h-[85vh] overflow-y-auto` (gotcha do Dialog) | Confirmações com verbo |
| Segredo mostrado uma vez | Padrão do `ConsultorDialog`/nova senha (fecha só no botão) | Senha temporária da empresa |
| Cores | `--primary` (#ECA826), `--success`, `--warning`, `--danger` | Sempre com ícone e texto |
| Fila de data | `todaySp()` | "hoje" do roteiro e dos ganhos |

Rota do consultor: `/campo` já alterna visões por `irPara({ v: ... })`. Visões novas: `roteiro`, `parada`,
`cadastro`, `ganhos`. Equipe: `/prospeccao`, `/consultores/roteiros`, aba "Mapa de calor" em `/consultores`.

---

## 9. Acessibilidade (WCAG 2.2, nível AA como piso)

**Alvos:** mínimo 48 × 48 px em tudo que o consultor toca na rua (pedido do dono; o WCAG 2.5.8 exige 24 px, a Apple
44 pt, o Material 48 dp). Espaço de 8 px entre alvos. Linhas de lista com 56 px.

**Contraste (cálculo a partir dos tokens, aproximado; não é medição):** usei luminância relativa aproximada pelo L do
oklch ao cubo, que vale para cinzas e é só estimativa para o âmbar.

| Par | Razão estimada | Leitura |
|---|---|---|
| Texto `--foreground` sobre `--background` (escuro) | ≈ 15:1 | Passa com folga |
| `--muted-foreground` (L 0,66) sobre `--card` (L 0,255) | ≈ 5:1 | Passa AA para texto; fica frágil ao sol |
| `--primary-foreground` sobre `--primary` (botão âmbar) | ≈ 8:1 | Passa |
| `--danger` (L 0,52) sobre `--background` escuro | ≈ 3:1 | **Não passa** para texto pequeno (as etiquetas "sem checkout" de `HojeTela`) |
| `text-primary` (âmbar) sobre `--background` **claro** | ≈ 2:1 | **Não passa**: no tema claro, o âmbar não pode ser cor de texto, só de fundo com texto escuro |
| `--muted-foreground` claro (L 0,5) sobre `--card` branco | ≈ 6:1 | Passa |

Consequências para o desenho: nas telas novas, texto de estado usa `--accent-foreground` (que no claro é mais escuro) ou
texto em `--foreground` sobre fundo tintado; nunca âmbar fino sobre claro; ícone + palavra em todo estado.
**Pedir uma medição real com o ferramental do `browser-check`** antes de fechar (critério A11).

**Sol:** o botão "Sol" na Hoje alterna para o tema claro com `--foreground` puro e bordas de 2 px nos cards; guarda a
escolha no aparelho. Hipótese a validar em campo: no claro, o consultor lê melhor ao sol (a validar com 3 pessoas).

**Texto:** nas telas novas, mínimo 14 px; números de progresso 28 a 32 px; zoom de 200% sem perder função.

**Semântica:** `button` para ações, `a` para links (Maps/Waze/`tel:`/`wa.me`), listas em `ul`, pinos do mapa com
equivalente na lista; `aria-live="polite"` no progresso ("12 de 30 visitas") e nos toasts; `role="status"` na faixa
da fila (já existe); `role="alert"` nos erros; foco visível; ordem de Tab lógica na tabela de busca; seleção de linha com
Espaço; diálogo devolve o foco ao botão que o abriu.

**Movimento:** respeitar `prefers-reduced-motion` (nenhuma animação de rota necessária); a barra de progresso muda sem
animar se o usuário pedir.

**Cor nunca sozinha:** ✓ ⏳ ⚠ ▶ ⏭ ✕ + palavra em cada estado; "longe do local" tem "!" além da borda vermelha.

### Problemas já existentes no bloco A (achados desta leitura)

| Sev. | Onde | Problema | Correção sugerida (fora do escopo, só registrar) |
|---|---|---|---|
| 3 | `HojeTela` `encerrar` | `window.confirm` sem o verbo da ação e com texto longo | Diálogo com resumo e botão "Encerrar jornada" |
| 2 | `NovaVisitaTela` abas | Texto `text-xs` (12 px), abaixo de 14 px; três abas apertadas em 360 px | Texto 14 px, rótulos curtos ("Perto", "Buscar", "Novo") |
| 2 | `NovaVisitaTela` "trocar" | Link `text-xs` sem área de toque de 48 px | Botão `h-12` com texto "Trocar" |
| 2 | `FaixaFila` botões de descartar | `py-2` + `text-xs` ≈ 32 px de altura; ação destrutiva pequena e sem consequência clara no texto do botão | Altura ≥ 48 px, texto "Descartar este envio" já existe, manter confirmação em diálogo |
| 2 | `HojeTela` etiquetas "sem checkout" | `text-danger` sobre fundo tintado, ≈ 3:1 estimado | Usar `--foreground` sobre fundo `danger/15` + ícone |
| 1 | `NovaVisitaTela` foto | `<input type="file">` com aparência nativa pequena | Botão grande "Tirar foto da fachada" que aciona o input |
| 1 | Questionário e telas | `text-[11px]` em rodapés | 14 px |

---

## 10. Critérios de aceite de usabilidade (verificáveis)

Medidos em celular de 360 × 640 com o `browser-check` (viewport de celular, geolocalização simulada) e, onde dito,
com pessoas.

| # | Critério | Como verificar |
|---|---|---|
| C1 | Da Hoje com roteiro, abrir a navegação da próxima parada em **1 toque e menos de 3 s** | `browser-check`: um clique em "Abrir no Maps" gera o link com o endereço |
| C2 | Check-in de uma parada do roteiro em **no máximo 3 toques + a foto** | Script conta cliques desde a Hoje até "Fazer check-in" concluído |
| C3 | Pular parada com motivo em **2 toques**, com "Desfazer" por 8 s que restaura a posição | Teste de navegador |
| C4 | Todo alvo tocável das telas novas tem **≥ 48 × 48 px** e **8 px** de distância do vizinho | Script mede `getBoundingClientRect()` de `button`, `a`, `input` |
| C5 | Texto das telas novas **≥ 14 px**; razão de contraste de texto **≥ 4,5:1** (ícones e bordas ≥ 3:1) nos dois temas | Verificação automática de contraste no `browser-check` (hoje não existe: adicionar) |
| C6 | Com o avião ligado, a Hoje abre com o roteiro, pular/adiar/check-in entram na fila e saem **em ordem** quando volta o sinal, **sem duplicar** (`client_id`) | Simular offline e voltar online |
| C7 | "Refazer rota" sem sinal reordena no aparelho em **≤ 2 s** e mostra o aviso | Teste de navegador |
| C8 | Nenhum texto das telas novas contém: lead (no campo), roteirização, dashboard, status, erro com código | Busca de texto nos componentes |
| C9 | Toda tela nova tem os 4 estados + offline implementados e navegáveis | Checklist de revisão por tela |
| C10 | Cada número em ganhos e metas mostra a conta ao lado ou em 1 toque | Revisão |
| C11 | Em "Buscar estabelecimentos", adicionar leads exige **no máximo 3 passos** (área e tipo, buscar, adicionar) e a confirmação diz quantos leads e a origem | Teste de navegador |
| C12 | Mapa de calor: legenda visível; aviso de limitação sempre visível; filtros por consultor, período e praça refletem na URL; há lista equivalente | Teste de navegador |
| C13 | Com zoom 200% a Hoje e o roteiro continuam usáveis (sem rolagem horizontal) | Teste de navegador |
| C14 | Uma pessoa que nunca viu o app conclui "ir à próxima parada e fazer check-in" sem ajuda em menos de 90 s | Teste com 3 a 5 consultores |

---

## 11. Decisões em aberto

### Para o dono validar (as 4 que mudam o produto)

| # | Decisão | Recomendação padrão |
|---|---|---|
| 1 | Como entregar o acesso à empresa (item 5) | Link/QR de primeiro acesso aberto no celular do dono, que escolhe a própria senha (o consultor não vê senha). Senha temporária só se o dono pedir, mostrada uma vez ao dono. Envio por WhatsApp do próprio consultor (`wa.me`) como reforço |
| 2 | Fórmula da remuneração | Leitura padrão: o dia vale o **maior entre R$ 100 e R$ 10 × cadastros confirmados**, e **20 a 25 confirmados fecham R$ 250** (acima de 25 volta a R$ 10 cada, então 26 = R$ 260). Exemplos que a tela mostrará: 4 → R$ 100; 12 → R$ 120; 19 → R$ 190; 20 → R$ 250; 25 → R$ 250; 26 → R$ 260. Observação: "R$ 10 por cadastro" daria R$ 200 com 20, não R$ 250; por isso a faixa. Só cadastro confirmado pelo Freela conta. **Segundo eixo ambíguo:** a faixa de 20 a 25 vale por **dia** ou por **semana**? Por dia exige 67% a 83% de conversão sobre 30 visitas (alto); isso muda qual card da tela de ganhos carrega o bônus (hoje desenhado por dia). E o piso de R$ 100 exige jornada aberta ou um mínimo de visitas? (a frase do estado vazio "O piso vale quando você fizer visitas" é **hipótese**, não regra confirmada) |
| 3 | O consultor pode pular/adiar/reordenar à vontade? | Pode pular e deixar para depois com motivo e refazer a rota; não pode inventar o roteiro nem apagar paradas. A equipe vê os motivos e os pulos por consultor. Se a equipe quiser travar, vira "Pedir para pular" |
| 4 | Quem dispara a busca paga e se vira lead direto | Só admin dispara; o resultado sempre passa pela revisão ("Adicionar N leads"). Mostrar custo estimado antes de buscar |

### Para o `software-architect`

- **Criação de conta da empresa no Freela com vínculo ao código do consultor.** Não está claro se existe endpoint no
  api-freela; precisa de token de primeiro acesso de uso único e prazo de 24 h. Sem isso, E4 trava.
- Endpoint de agregação do calor (pontos + check-ins por período/consultor/praça, com amostragem) e de resumo da praça
  ("87 de 140 leads visitados").
- Serviço de rota (distância a pé e tempo) e política de custo: provedor, limite por dia, fallback em linha reta.
- Limites e custo da busca (Apify): cancelar, guardar resultado 7 dias, tratamento de falha parcial, deduplicação com a
  regra de 100 m + nome parecido já existente.
- Novos tipos na fila offline: `pular`, `adiar`, `cadastrar-empresa`. Idempotentes por `client_id`.
- Confirmação do cadastro pelo Freela (bloco C) para a separação "Confirmado × Ainda não confirmado".
- Limites da praça (polígono) para a opção "A praça inteira": não sei se `pracas` tem polígono (hipótese: não;
  fallback = bairro + raio).
- Meta 30, horários 9h–18h, almoço 12h–13h e limites de alerta como configuração (não constantes).

---

## 12. Plano de teste de usabilidade

- **Quando:** E1 e E3, com o primeiro lote de consultores reais (3 a 5 pessoas).
- **Tarefas (pensar em voz alta, sem ajuda):** (1) iniciar a jornada e ir à primeira parada; (2) fazer o check-in de uma
  parada; (3) pular uma parada fechada e desfazer; (4) ficar sem sinal e continuar; (5) mostrar o acesso a um dono (papel
  de um colega); (6) dizer quanto ganhou hoje e por quê.
- **Métricas:** conclusão, tempo, erros, toques, SUS (System Usability Scale, questionário de 10 perguntas) e a
  pergunta "o que você faria do jeito antigo em vez de usar isso?".
- **Em campo, 1 dia:** observar a legibilidade ao sol (tema escuro × claro), uso com uma mão e o que acontece quando o
  sinal cai.
- **Equipe:** 2 gestores montam roteiro e leem o mapa de calor: "onde ainda não fomos?" em menos de 30 s.

---

## 13. Checklist de revisão (heurísticas de Nielsen, resumo)

| Heurística | Situação no desenho |
|---|---|
| Visibilidade do status | Meta, ritmo, fila, "criando acesso…", progresso da busca |
| Mundo real | "Parada", "Cheguei", "Pix de segunda", horas e datas relativas com data absoluta onde há dinheiro |
| Controle e liberdade | Desfazer 8 s ao pular; voltar sempre; cancelar busca |
| Consistência | CTA no rodapé em toda tela; mesmos verbos |
| Prevenção de erro | Parecido a 100 m, limite de 300 resultados, confirmação com consequência |
| Reconhecimento | Próxima parada pronta; nada de buscar ou digitar |
| Eficiência | 1 toque para navegar; lista e mapa; filtros na URL |
| Minimalismo | Uma ação principal por tela; conta de ganhos atrás de 1 toque |
| Recuperação de erro | Mensagens com o que aconteceu + o que fazer; dados preservados |
| Ajuda | Aviso do mapa de calor sempre visível; dicas só na primeira vez |

Nenhum problema de severidade 4 foi encontrado nesta fase de desenho; os de severidade 3 e 2 existentes estão na
tabela da seção 9.
