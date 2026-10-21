# Praça: o que falta trazer da versão Lovable do chefe (desenho de UX, sem implementação)

Data: qua 21/10/2026. Status: proposta para o dono validar. Fontes lidas: nossa UI (`web/src/app/campo`, `components/campo` e `campo/simples/*`, `app/(app)`, `components/praca/{AppShell, RoteirosEquipe, RemuneracaoConfig, ConsultorDialog}`, `configuracoes/page.tsx`), specs de 19/10 e 20/10 (fluxo simples, prospecção, comparação, modo do chefe) e o zip da Lovable (`garden/src/routes/**`, `components/*`, `lib/{visita,status}.ts`, migrations `0000`/`0001`/`0005`). O zip foi só lido; nada foi executado e o `.env` não foi aberto.

## 0. Regras deste desenho

1. **Regra do dono:** tudo configurável. Com o módulo ligado, o padrão é **o jeito da Lovable**. A nossa versão, quando é melhor, fica guardada como opção ("Perfil completo (nosso)") e nunca é apagada.
2. **Produção não muda no deploy.** Cada módulo novo entra atrás de uma flag de ambiente desligada por padrão (padrão do contrato §31/§32). Os nomes de chave e de flag já reservados no spec de arquitetura são reaproveitados: `FIELD_CHECKLIST_ENABLED`, `FIELD_VOUCHERS_ENABLED`, `ui_checklist`, `checklist_items`, `ui_resumo_dia`, `nota_peso_rota`, `nota_meta_conversao` e `ui_mapa_pins`. Chave nova vem marcada como **(proposta)**.
3. **O fluxo simples que já está no ar não fica mais lento.** Os toques obrigatórios dos critérios A1–A3 (resultado em 1 chip, visita em 3 a 5 toques) continuam iguais. Checklist, cupom e intervalo são opcionais. Onde a Lovable não exige nada, nós também não exigimos.
4. **Substitui três decisões anteriores** (a regra do dono é mais nova): fluxo simples #7 "sem nota do dia" e #9 "intervalo só informativo"; arquitetura `ui_resumo_dia = numeros`. Agora: nota visível, intervalo como evento, `ui_resumo_dia = nota`.
5. **Vocabulário (decisão do designer):** "**Cupom** da 1ª contratação", não "voucher" (o dono digita o código no Freela, onde se chama cupom; sem inglês). "Representante" → "consultor"; "cliente" → "estabelecimento" no campo.
6. **Wireframes:** consultor no celular 390 × 844; equipe no desktop 1280 px; Início, Cupons e Mapa também no celular; nas outras telas da equipe, uma linha "No celular:". Tamanho real: cerca de 680 linhas, das quais umas 380 são wireframes; o texto corrido cabe em cerca de 10 páginas, os desenhos passam disso.

## 1. Inventário: cada tela da Lovable e onde ela fica

| Lovable (`garden/src`) | O que faz | Onde fica aqui |
|---|---|---|
| `routes/_authenticated/route.tsx` | Menu da equipe e do representante, troca obrigatória de senha | §2 |
| `inicio.tsx` (equipe) | Painel com 8 cartões, ranking e resultado das visitas | §3.1 Início |
| `inicio.tsx` (representante) | Calendário "Minhas rotas" | §3.4 "Próximos dias" (a tela Hoje já existe) |
| `vouchers.tsx` + `0005` | Pedir, aprovar e reprovar | §3.2 Cupons (agora é cupom real no Freela) |
| `mapa.tsx` | Pinos por situação, legenda que esconde e mostra, filtro de praça | §3.3 |
| `clientes.tsx` | Lista dos visitados com filtros | §3.3 Lista. **Fica de fora:** a equipe trocar o status na mão. Esse status alimenta a comissão; a correção continua pelo Funil, que deixa rastro |
| `rotas.tsx` (aba geral), `MapaRotas.tsx` | Divide a praça em N rotas, gera lotes e atribui consultor e dia | §3.4 |
| `rotas.tsx` (aba shopping) | Shoppings e rotas internas | §3.7 |
| `roteiro.$rotaId.tsx` | Iniciar, intervalo e encerrar; chegada com foto; cronômetro; checklist; resultado; contato; nota | Chegada, resultado, motivo, retorno e contato **já estão no ar** (P0 + §31). Novos: intervalo e nota (§3.6); checklist, cronômetro e e-mail do contato (§3.5) |
| `representantes.tsx`, `CredenciaisDialog.tsx` | Ficha (endereço, banco, N praças, remuneração e bônus) e acesso enviado pelo WhatsApp | §3.8. A exclusão definitiva vira **desativar** (o nosso preserva histórico e pagamentos) |
| `usuarios.tsx` | Admin/gestor, ativar, redefinir senha | §3.8 |
| `configuracoes.tsx` + `0001` | Segmentos de busca editáveis | §3.9 (sem Google) |
| `trocar-senha.tsx` | 8+ caracteres, 1 maiúscula, 1 número | §3.9 |
| `desempenho.tsx` | "Em breve" (tela vazia) | Não vira aba. O resumo do dia e "Dias anteriores" ficam em Ganhos (§3.6) |
| `financeiro.tsx` | Financeiro e carteira | Usamos os nossos Pagamentos e Ganhos. **Fica de fora** o cálculo da Lovable: pagamento sem unicidade, em horário UTC, e diária sem presença (já existe como opção no preset) |
| `pracas.index.tsx`, `pracas.$id.tsx` | Situação da praça; importar Excel (desligado); buscar no Google; "atualizar dados do Google" | Situação vira filtro "praças abertas" (§3.3). O Excel já existe aqui como Entrada. A busca já existe aqui como Buscar estabelecimentos (mapa aberto). **Fica de fora** guardar horário, site e nota do Google (termos do Google) |
| `BuscaGoogleDialog.tsx` | Busca em grade no Google com custo em US$ | **Fica de fora** (Google). A ideia de "estimar antes de gastar" já existe aqui, na busca paga |
| `routes/index.tsx`, `bootstrapAdmin` | Login `usuario@praca.local`; admin com senha fixa | **Fica de fora** (segurança, §6 da comparação) |

## 2. Mapa de navegação

### 2.1 Menu da equipe

No desktop é a barra lateral; no celular, a gaveta. Os grupos têm título, porque são 19 itens.

```text
PRAÇA.
OPERAÇÃO DE CAMPO   (nomes e ordem da Lovable)
  Início ............ novo; página inicial da equipe (pergunta 5)
  Praças ............ = nossa "Praça"
  Clientes .......... novo: Lista | Mapa | Mapa de calor
  Mapa .............. atalho: abre Clientes no modo Mapa
  Rotas ............. novo: Dividir em rotas | Shoppings | Dia de cada consultor
  Consultores ....... = nosso (Lovable: Representantes)
  Cupons ............ novo (Lovable: Vouchers); número de pedidos pendentes
  Pagamentos ........ = nosso (Lovable: Financeiro)
COMERCIAL           (nosso, sem mudança)
  Funil · Entrada · Buscar estabelecimentos (admin) · Mensagens · Campanhas
  Calendário · Indicadores · Ações · Freela
ADMINISTRAÇÃO       (só admin, como a Lovable)
  Configurações · Usuários
```

- Hoje, o topo de `/consultores` tem os links "Mapa de calor", "Pagamentos", "Declarados" e "Roteiros do dia". Eles viram itens do menu ou abas acima. As URLs antigas redirecionam para as novas (`/consultores/calor` → Clientes > Mapa de calor; `/consultores/roteiros` → Rotas > Dia de cada consultor). "Declarados" vira uma aba de Pagamentos.
- O gestor vê os grupos Operação e Comercial. O grupo Administração não aparece para ele (matriz em §3.8).

### 2.2 Abas do consultor

O rodapé tem 56 px e **continua com 3 abas**. A Lovable tem 5 e nenhuma delas é Cupons: o representante dela não tem link para pedir cupom. A entrada abaixo é desenho nosso.

| Lovable (representante) | Aqui |
|---|---|
| Hoje | **Hoje** (sem mudança; ganha intervalo e escolha de praça) |
| Mapa | Lista ou Mapa dentro de "Ver as N que faltam", com pinos por situação da praça dele |
| Clientes | **Retornos**, com 3 segmentos: Retornos · Cupons · Visitados. O número da aba soma os retornos de hoje e os cupons prontos para entregar |
| Desempenho ("Em breve") | Resumo do dia, aberto ao encerrar e em Ganhos > Dias anteriores |
| Carteira | **Ganhos** |

Novas visões em `/campo` (sem navegação do Next, para funcionar sem sinal): `cupom&id=`, `pedir-cupom&ref=`, `resumo&dia=`, `proximos` e `shopping&id=`.

## 3. Telas por prioridade

| # | Tela | Por que nesta posição |
|---|---|---|
| 1 | Início (painel do gestor) | É o que o chefe abre todo dia. Usa só dado que já é gravado |
| 2 | Cupons | É argumento de venda e agora é cupom real no Freela |
| 3 | Clientes e Mapa por situação | Responde "onde estamos e onde ainda não fomos" |
| 4 | Rotas: dividir a área e atribuir | Distribui o trabalho do jeito da Lovable |
| 5 | Visita: checklist, cronômetro, e-mail | Padroniza a conversa sem custar toque |
| 6 | Jornada: intervalo e resumo/nota | Dá retorno ao consultor no fim do dia |
| 7 | Shoppings | Esforço grande; depende do mapa aberto |
| 8 | Pessoas: gestor, ficha, várias praças | Necessário quando a equipe crescer |
| 9 | Configurações: segmentos, senha, bônus mensal | Ajustes |

### 3.0 Regras comuns (valem para todas as telas; cada seção traz só o que difere)

| Estado | Padrão |
|---|---|
| Carregando | Esqueleto no formato do conteúdo. Nunca spinner de tela cheia por mais de 1 s |
| Vazio | O que é a tela, por que está vazia e um botão para a primeira ação |
| Erro | O que aconteceu, o que fazer e "Tentar de novo". O que foi digitado fica. Mensagem lida com `apiErrorMessage()` |
| Sem internet | Consultor: a ação vai para a fila do aparelho (`client_id`), com a faixa `FaixaFila`. Equipe: "Sem internet. Mostrando o que carregou às 14h32." |
| Sem permissão | O item some do menu. Pela URL direta: "Esta tela é só para administradores. Peça acesso a um administrador." + [Voltar ao Início] |
| Módulo desligado | O item some. Pela URL: "Este recurso ainda não está ligado neste servidor." |

- **Alvos:** tudo ≥ 48 × 48 px com 8 px entre alvos, também na equipe; no campo, botões principais, chips e linhas de lista com 56 px.
- **Contraste (WCAG 2.2 AA):** texto ≥ 4,5:1, ícones e bordas ≥ 3:1 (`--primary-foreground` sobre `--primary` ≈ 8,2:1); nunca `text-primary` âmbar sobre fundo claro; modo Sol com borda de 2 px em `--foreground`; medir no `browser-check`. **Cor nunca sozinha**: sempre forma ou ícone + palavra.
- **Leitor de tela e teclado:** `aria-live="polite"` em toasts e contadores, `role="alert"` em erros, diálogo devolve o foco, zoom 200% sem rolagem lateral, `prefers-reduced-motion`.
- **Celular:** abaixo de 768 px tabela vira cartões, uma coluna, botão principal fixo no rodapé.
- **Números:** todo número diz o que é, a conta e a fonte, logo abaixo ou em 1 toque ("ⓘ Como contamos"). Dia de Brasília (`todaySp()`), nunca UTC; `R$ 1.234,56`, "qui 22/10", "14h32".

### 3.1 Início: painel do gestor (prioridade 1)

Fica em Operação > Início, primeiro item do menu e página inicial da equipe.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Olá, Diego                          (Hoje)(7 dias)(30 dias)(90 dias)   48  │
│ Painel ao vivo da operação · atualizado às 14h32 · Praça [Todas ▾]         │
│ ⚠ Atenção agora: 2 consultores precisam de você   [Ver]   (só com alerta)  │
├──────────────────┬──────────────────┬──────────────────┬───────────────────┤
│ Visitas concluídas│ Positivação     │ Tempo entre visitas│ Visitas realizadas│
│ 80%              │ 18%              │ 16 min            │ 300              │
│ 224 de 280 paradas│ 54 cadastros    │ da chegada numa à │ com resultado,   │
│ planejadas nas   │ declarados ÷ 300 │ chegada na outra  │ 76 delas fora do │
│ rotas            │ visitas · 12% só │ · 7 min dentro do │ roteiro          │
│                  │ confirmados (36) │ local             │                  │
├──────────────────┼──────────────────┼──────────────────┼───────────────────┤
│ Cadastros 54     │ Cupons 9         │ Praças abertas 3  │ Estab. mapeados  │
│ declarados · 36  │ criados · 4      │ 12 consultores    │ 3.406 · 312 sem  │
│ confirmados pelo │ pedidos esperando│ ativos            │ localização exata│
│ Freela           │ você             │                   │                  │
├──────────────────┴──────────────────┴───┬──────────────┴───────────────────┤
│ 🏆 Ranking dos consultores               │ Resultado das visitas            │
│ #   Consultor  Visitas Cadastros Positiv.│ Sem interesse    140 ▇▇▇▇▇▇▇▇▇▇  │
│ 1º  Ana          80      20       25%    │ Quer retorno      60 ▇▇▇▇        │
│ 2º  Bruno        75      15       20%    │ Cadastrou agora   54 ▇▇▇▇        │
│ 3º  Carla        70      11       16%    │ Fechado           25 ▇▇          │
│ Ordem: cadastros, depois positivação     │ Já usa o Freela   21 ▇           │
│ [Baixar CSV]                             │ total 300 = visitas realizadas   │
└──────────────────────────────────────────┴──────────────────────────────────┘
```

No celular:

```text
┌──────────────────────────────────┐
│ ☰ PRAÇA.                         │
│ Olá, Diego · atualizado às 14h32 │
│ (Hoje)(7 dias)(30 dias)(90 dias) │ 48, 4 × 85 px
│ Praça [Todas ▾]                  │ 48
│ ⚠ 2 consultores precisam de você›│ 56, só com alerta
│ ┌──────────────┐┌──────────────┐ │ cartões 2 por linha (171 px)
│ │Concluídas 80%││Positivação18%│ │
│ │224 de 280    ││54 ÷ 300 visit│ │
│ └──────────────┘└──────────────┘ │
│ ... 8 cartões ...                │
│ Ranking                          │
│ 1º Ana · 20 cadastros · 80 visit.│ 56 por linha, toque abre o
│    · 25%                       › │ consultor
│ Resultado das visitas            │ barras com o número escrito
└──────────────────────────────────┘
```

| Cartão | Conta | Fonte |
|---|---|---|
| Visitas concluídas | Paradas de roteiro concluídas ÷ paradas planejadas no período | Roteiros. Sem nenhuma rota no período: "Sem rota planejada no período" (nunca "0%") |
| Positivação | Cadastros declarados ÷ visitas com resultado | Visitas. Linha de baixo: só os confirmados pelo Freela. Chave (proposta) `painel_positivacao`: `declarados` (padrão, Lovable) ou `confirmados` |
| Tempo entre visitas | Média dos intervalos entre chegadas seguidas do mesmo consultor no mesmo dia; intervalos acima de 120 min ficam de fora | Definição da Lovable, com o nome corrigido. A linha "dentro do local" é a média da chegada até a conclusão |
| Visitas realizadas | Visitas concluídas no período, com ou sem roteiro | Visitas |
| Cadastros | "Cadastrou agora" · confirmados pela sincronização | Sem a sincronização ligada: "confirmação ainda não ligada" |
| Cupons | Criados no período · pedidos esperando agora | §3.2 |
| Praças abertas | Praças em andamento ou concluídas pelas datas · consultores ativos | Praças, consultores |
| Estabelecimentos mapeados | Estabelecimentos com localização exata · sem localização exata | `location_precision` |

"7 dias" vai de hoje até 6 dias antes (como a Lovable), contado no dia de Brasília.

| Igual à Lovable | Muda (e por quê) |
|---|---|
| Saudação, "Painel ao vivo", atualização a cada 60 s, 4 períodos, 8 cartões na mesma ordem, ranking (cadastros e depois positivação, 3 medalhas) e barras de resultado | (1) Cada cartão mostra a conta e a fonte (regra do dono). (2) "Tempo médio de visita" vira **"Tempo entre visitas"**: a Lovable mede o intervalo entre registros e usa o mesmo nome para outra métrica. (3) Dia de Brasília, não UTC. (4) Os resultados são os nossos 5, não os 6 status dela. (5) Filtro de praça. (6) Faixa "Atenção agora" (nossa), que só aparece quando há alerta. Sem alerta, a tela é igual à da Lovable. (7) Medalha sempre com o texto "1º" |

Estados específicos: vazio "Ainda não há visitas nesse período. Escolha outro período ou veja os roteiros de hoje." + [Rotas]; fonte desligada no servidor: o cartão diz "Não ligado neste servidor" em texto discreto, nunca "0".

**Aceite:** **I1** cada um dos 8 cartões tem a linha de conta cujas parcelas reproduzem o número grande (dados de semente); **I2** sem rota no período, "Sem rota planejada no período"; **I3** ranking por cadastros e, no empate, positivação; **I4** soma das barras = "Visitas realizadas"; **I5** em 390 px sem rolagem lateral, cartões 2 por linha, ranking em lista; **I6** visita às 23h50 de Brasília conta no dia certo; **I7** "atualizado às" muda a cada 60 s sem piscar.

### 3.2 Cupons da 1ª contratação (prioridade 2)

O que o dono já informou: é o cupom de 1ª contratação que já existe no Freela; a aprovação no Praça cria o cupom lá (padrão 100% na 1ª contratação, uso único, validade opcional); só existe para empresa com conta de contratante no Freela.

**Ciclo de vida do cupom** (o mesmo para consultor e equipe; ícone sempre junto com o texto):

| Situação | O consultor vê | A equipe vê | O que dá para fazer |
|---|---|---|---|
| Pedido | ⏳ "Esperando a equipe aprovar" | "Pedido · esperando aprovação" | Admin: [Aprovar] [Reprovar] |
| Aguardando a empresa | 🏪 "Falta a empresa ter conta no Freela. O cupom sai sozinho quando ela entrar." | "Aprovado · aguardando a empresa se cadastrar no Freela" | Consultor: [Mostrar o QR] [Cadastrar por ele] (cadastro assistido do §26). Admin: [Vincular à conta do Freela] |
| Aguardando o Freela | ⏳ "Aprovado. Criando o cupom no Freela" | "Aprovado · aguardando conexão com o Freela" (se falhar: "O Freela não respondeu às 14h10. Tentamos de novo sozinhos.") | Admin: [Tentar agora] |
| Cupom criado | ✓ "Cupom pronto: **PRACA-7K2M9Q**" + validade | "Cupom criado · ainda não usado" | [Copiar código] [Enviar pelo WhatsApp] |
| Usado | ✓ "Usado sáb 24/10 na 1ª contratação" | "Usado em 24/10" | nada |
| Vencido | ✕ "Venceu seg 30/11 sem uso" | "Vencido" | Consultor: [Pedir de novo] |
| Reprovado | ✕ "Não aprovado: {motivo}" | "Reprovado por Diego: {motivo}" | Consultor: [Pedir de novo] |

O caminho normal é: pedido → aprovado → (aguardando a empresa) → aguardando o Freela → criado → usado ou vencido. A outra saída do pedido é reprovado.

**Decisão do designer (pergunta 1):** dá para aprovar antes de a empresa ter conta. O pedido espera e o cupom é criado quando a sincronização ou o cadastro assistido ligam a empresa a uma conta. O botão "Vincular à conta do Freela" é a saída manual para quando o pareamento automático falha (cadastro feito pelo QR casa mal).

**Pedir o cupom, no campo.** Não acrescenta nenhum toque obrigatório até "Concluir". Entradas: **(a)** na tela de resultado, uma linha "🎟 Pedir cupom da 1ª contratação" (48 px, botão secundário) logo acima de "Mais detalhes", para "Cadastrou agora", "Quer retorno" e "Sem interesse" (some em "Fechado" e em "Já usa o Freela": quem já contrata não tem 1ª contratação, e a equipe só reprovaria); **(b)** na etapa "Oferecer o cupom" do checklist (§3.5); **(c)** na ficha da parada; **(d)** em Retornos > Cupons > [Pedir cupom], escolhendo entre as visitas recentes.

```text
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ ← Pedir cupom da 1ª contratação  │   │ ← Cupom da Padaria Bom Pão       │
│ Padaria Bom Pão                  │   │ ✓ Cupom pronto                   │
│ Moema · São Paulo/SP · Padaria   │   │     PRACA-7K2M9Q                 │ 32 px, monoespaçado
│ (vem da parada)        [Corrigir]│   │ 100% de desconto na 1ª           │
│ Quantos freelas por semana ele   │   │ contratação · vale 1 vez         │
│ costuma chamar?                  │   │ Válido até seg 30/11             │ ou "Sem prazo"
│ [ − ]     3     [ + ]            │56 │ [       Copiar código       ]    │ 56
│ (0)(1)(2)(3)(5)(10+)             │48 │ [   Enviar pelo WhatsApp    ]    │ 56, wa.me do consultor
│ ⓘ Esta empresa ainda não tem     │   │ Como usar: o dono digita o código│
│ conta no Freela: o cupom só sai  │   │ no Freela. [texto a confirmar    │
│ depois do cadastro.              │   │ com o Freela]                    │
│ [Mostrar o QR] [Cadastrar por ele]│  │                                  │
├──────────────────────────────────┤   └──────────────────────────────────┘
│ [   Enviar pedido do cupom   ]   │ fixo, 56
└──────────────────────────────────┘
```

- **Toques:** "Pedir" + 1 chip + "Enviar" = 3 (2 se "freelas por semana" já veio de "Mais detalhes"). Nada é digitado: nome, cidade/UF e ramo vêm da parada. Depois de enviar, a linha vira "⏳ Cupom pedido · esperando a equipe aprovar" e sai o toast "Pedido enviado. Avisamos aqui quando o cupom sair."
- **Quando o cupom é criado:** aviso na tela Hoje (`aria-live`) "Cupom pronto para a Padaria Bom Pão. [Ver]", e o número entra no contador da aba Retornos.
- **Mensagem do WhatsApp:** "Olá, Marcos. Aqui é a Ana, do Freela. Seu cupom de 1ª contratação: PRACA-7K2M9Q (100% de desconto, vale 1 vez, até 30/11)." Usa o telefone de quem atendeu, se houver; senão abre o WhatsApp para escolher o contato.
- **Sem internet:** o pedido entra na fila (item `cupom`, com `client_id`): "Sem internet. O pedido está guardado e sai quando o sinal voltar." O código fica guardado no aparelho só se estiver preso à conta da empresa (§5); se não estiver: "O código aparece quando o celular tiver sinal."
- **Pedido repetido:** a linha mostra o pedido que já existe ("Esta empresa já tem um cupom pedido, por você em 20/10") no lugar do botão.

**Equipe** (Operação > Cupons):

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Cupons                                                  [ Pedir cupom ]    │
│ Aprove ou reprove os cupons de 1ª contratação pedidos pelos consultores.   │
│ (Pedidos 4)(Aguardando a empresa 2)(Aguardando o Freela 0)(Criados 9)      │
│ (Usados 3)(Vencidos 1)(Reprovados 2)(Todos 21)  Praça[Todas▾] [buscar…]    │
├────────────────────────────────────────────────────────────────────────────┤
│ Data  Estabelecimento  Cidade/UF  Ramo    Freelas/sem Consultor Situação   │
│ 20/10 Padaria Bom Pão  SP/SP      Padaria   3         Ana     ⏳ Pedido    │
│       ✓ tem conta no Freela                       [Aprovar] [Reprovar]     │
│ 19/10 Bar do Chico     SP/SP      Bar       5         Bruno   🏪 Aguard.   │
│       sem conta no Freela                         [Vincular à conta]       │
│ 18/10 Café Ipê         SP/SP      Café      2         Ana   ✓ PRACA-7K2M9Q │
│       vale até 30/11 · ainda não usado                         [Copiar]    │
└────────────────────────────────────────────────────────────────────────────┘
```

No celular:

```text
┌──────────────────────────────────┐
│ Cupons             [Pedir cupom] │ 48
│ (Pedidos 4)(Aguard. empresa 2)…  │ chips 48, quebram linha
│ ┌──────────────────────────────┐ │
│ │ ⏳ Pedido · 20/10             │ │ cartão no lugar da linha da tabela
│ │ Padaria Bom Pão · SP/SP      │ │
│ │ Padaria · 3 freelas/semana   │ │
│ │ Ana · ✓ tem conta no Freela  │ │
│ │ [ Reprovar ]  [  Aprovar  ]  │ │ 48 cada
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

**Diálogos** (botão sempre com o verbo):

- **Aprovar:** "Aprovar o cupom da Padaria Bom Pão? Cria no Freela um cupom de **100% de desconto na 1ª contratação, que vale 1 vez**." Campos Desconto [100%] e Validade [Sem prazo | até __/__]. Com conta: "A empresa já tem conta no Freela: o código sai em seguida e aparece para a Ana. Depois de criado, só dá para cancelar no Freela." Sem conta: "A empresa ainda não tem conta: o pedido fica aprovado e o cupom é criado sozinho quando ela se cadastrar." Botões: **Aprovar e criar cupom** · Voltar.
- **Reprovar:** "A Ana vê o motivo." Chips: Já é cliente do Freela · Fora do perfil · Pedido repetido · Outro, mais um texto. O motivo é **obrigatório**; na Lovable era opcional, via `window.prompt`. O consultor precisa saber o que dizer ao dono. Chave (proposta) `cupom_motivo_obrigatorio`. Botões: **Reprovar pedido** · Voltar.
- **Vincular:** busca a empresa no Freela por CNPJ ou telefone, mostra o nome encontrado e oferece [Vincular esta conta].

| Igual à Lovable | Muda (e por quê) |
|---|---|
| Lista com filtro por situação e contagem; colunas data, estabelecimento, cidade/UF, ramo, freelas por semana, consultor, situação + motivo; só o admin aprova; o gestor vê; o consultor vê os dele; a equipe também pede | (1) O pedido nasce na visita, já preenchido. Na Lovable eram 5 campos digitados numa página sem link no menu do representante. (2) É cupom real no Freela, com código, validade e as situações acima. (3) Motivo obrigatório ao reprovar. (4) Um pedido ativo por estabelecimento (cupom de 100% custa dinheiro). (5) O estabelecimento vem do cadastro, não de texto livre: é o que permite achar a conta no Freela. (6) Diálogo com a consequência escrita, no lugar de `window.prompt` |

**Aceite:** **C1** pedir pela tela de resultado em ≤ 3 toques, sem digitar, e os toques até "Concluir" não mudam (A1–A3); **C2** pedido feito sem sinal sobe uma vez só; **C3** cada situação mostra ícone, texto e a ação da tabela; **C4** o diálogo de aprovação mostra desconto, usos e validade antes de criar; **C5** copiar leva 1 toque e o WhatsApp abre com a mensagem pronta; **C6** segundo pedido do mesmo estabelecimento mostra o existente; **C7** o gestor não vê [Aprovar]/[Reprovar]; **C8** com a flag desligada, nada de cupom aparece; **C9** em "Já usa o Freela" e "Fechado" o botão de pedir não aparece.

### 3.3 Clientes e Mapa por situação (prioridade 3)

Fica em Operação > Clientes (abre em Lista) e Operação > Mapa (abre a mesma página em Mapa). "Mapa de calor" é a tela atual de `/consultores/calor`, sem mudança.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Clientes       [ Lista ] [ Mapa ] [ Mapa de calor ]                    48  │
│ Praças abertas (em andamento ou concluídas). Cor e forma mostram a         │
│ situação de cada estabelecimento.                                          │
│ (Todas 3)(Moema)(Pinheiros)(Vila Mariana)                                  │
│ Situação (toque para esconder ou mostrar):                                 │
│ (● A visitar 2.870)(■ Cadastrou, a confirmar 41)(★ Confirmado pelo Freela  │
│ 88)(◆ Já usa o Freela 63)(▲ Quer retorno 97)(✕ Sem interesse 214)          │
│ (▬ Fechado 33)                                                             │
│ 312 sem localização exata não aparecem no mapa · [Ver na lista]            │
├────────────────────────────────────────────────────────────────────────────┤
│                  [ mapa Leaflet / OSM, 620 px de altura ]                  │
└────────────────────────────────────────────────────────────────────────────┘
```

No celular:

```text
┌──────────────────────────────────┐
│ Clientes [Lista][Mapa][Calor]    │ 48
│ Praça [Todas (3) ▾]              │ 48 (lista de opções no lugar dos chips)
│ ┌──────────────────────────────┐ │
│ │     mapa, 55% da altura      │ │
│ └──────────────────────────────┘ │
│ (● A visitar 2.870)(■ Cadastrou  │ chips 48, quebram linha
│ 41)(★ Confirmado 88)…            │
│ 312 sem localização exata        │
├──────────────────────────────────┤
│ [        Ver em lista        ]   │ fixo, 56
└──────────────────────────────────┘
```

- **Legenda:** os 5 resultados do fluxo simples, mais "A visitar" (sem visita) e "Confirmado pelo Freela" (a confirmação vale mais que qualquer resultado). Não usamos os 6 status da Lovable: isso quebraria o resultado em 1 chip. A tradução das visitas do modo completo fica com o arquiteto.
- **Cores:** a paleta da Lovable (A visitar `#2563eb`, Cadastrou `#16a34a`, Sem interesse `#dc2626`, Quer retorno `#9333ea`, Já usa `#f97316`). Confirmado é verde-escuro com ★. Fechado é cinza `#9A9A92`: o `#334155` da Lovable some sobre o mapa escuro invertido.
- **Pinos:** 14 px, borda branca de 2 px e uma forma diferente por situação. A medição de 3:1 contra o mapa fica para o `browser-check`.
- **Toque no pino:** abre um balão (texto puro, nunca HTML) com nome, situação, "última visita qui 22/10 · Ana" e [Abrir no funil].
- **A Lista é a forma equivalente do mapa.** Colunas da Lovable (Estabelecimento com ramo · bairro, Cidade/UF, Contato, Situação) + Última visita; mesmos chips, listas de UF e cidade e busca. Como na Lovable, "A visitar" começa escondido na Lista. A situação é só leitura (sem a troca manual, §1) e o telefone vem mascarado.
- **Filtros na URL**, para compartilhar a vista. Acima de 5.000 pinos, no celular: "Mostrando 5.000 de 8.200. Aproxime o mapa para ver todos."

**Aceite:** **M1** tocar na legenda esconde e mostra os pinos, e a contagem segue o filtro de praça (como na Lovable); **M2** toda situação tem forma e cor diferentes; **M3** "sem localização exata" aparece e bate com a Lista; **M4** Lista e Mapa mostram o mesmo conjunto com os mesmos filtros; **M5** 5.000 pinos em menos de 2 s no desktop.

### 3.4 Rotas: dividir a área em N rotas e atribuir (prioridade 4)

Fica em Operação > Rotas. A aba que abre primeiro é "Dividir em rotas" (a aba "Clientes" da Lovable). "Dia de cada consultor" é o `RoteirosEquipe` atual, sem mudança.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Rotas                                                                      │
│ Rotas de visita em sequência lógica pela localização dos estabelecimentos. │
│ [Dividir em rotas] [Shoppings] [Dia de cada consultor]                     │
│ Praça [Moema ▾]  Área [Todas ▾]  Paradas por rota [ 30 ]                   │
│ 412 estabelecimentos com localização exata, sem rota publicada →           │
│ 14 rotas de até 30 paradas (412 ÷ 30 = 13,7; arredonda para cima)          │
│ [ Gerar rotas de carro/moto ]   [ Gerar rotas a pé ]                       │
├───────────────────────────────┬────────────────────────────────────────────┤
│ Gerações salvas               │                                            │
│ [22/10 14h10 · a pé · 14 rotas│   [mapa: uma linha colorida por rota;      │
│  · 3 atribuídas ▾] [Arquivar] │    a selecionada fica mais grossa e        │
│ ● Rota 01                     │    numerada]                               │
│ Bairro principal: Moema       │                                            │
│ Do centro: 4,2 km             │                                            │
│ 30 paradas · percurso 6,1 km  │                                            │
│ de rua (linha reta × 1,3)     │                                            │
│ A pé · tempo previsto 6h21    │                                            │
│ = 30 × 8 min + 6,1 km ÷ 4,5   │                                            │
│ km/h (81 min) + almoço 1 h    │                                            │
│ Consultor [Ana ▾] Dia [sex 23/10]                                          │
│ ✓ Publicada para Ana          │                                            │
│ ● Rota 02 …                   │                                            │
└───────────────────────────────┴────────────────────────────────────────────┘
```

No celular: cartões das rotas em uma coluna; mapa recolhido atrás de [Ver no mapa]; os dois botões de gerar empilhados, na largura toda; listas de consultor e dia com 48 px.

- **Atribuir** grava na hora, como na Lovable, e mostra um toast com desfazer de 8 s: "Rota 01 publicada para Ana em sex 23/10. Ela vê na tela Hoje nesse dia. [Desfazer]".
- **Conflito:** "Ana já tem roteiro em sex 23/10 (Rota 04). Cada consultor tem um roteiro por dia." + [Trocar pela Rota 01] [Escolher outro dia].
- **Arquivar** (no lugar de excluir): "Arquivar a geração de 22/10 14h10? As 11 rotas ainda não atribuídas saem da lista. As 3 publicadas continuam com os consultores." A Lovable apagava tudo, inclusive o que já tinha sido executado.
- **Consultor, "Próximos dias"** (o calendário "Minhas rotas" da Lovable): em "Ver as N que faltam" > [Próximos dias]; calendário do mês com células de 51 × 48 px e ponto nos dias com rota; abaixo, o cartão "Rota 01 · 30 paradas · a pé · ~6h21" e as paradas, só leitura; [Ir para hoje] como na Lovable. Rota sem dia não aparece para o consultor.

| Igual à Lovable | Muda (e por quê) |
|---|---|
| Abas; praça; paradas por rota; 2 botões de gerar (1 toque); contagem; gerações salvas (data · modo · nº de rotas · atribuídas); campos do cartão (bairro principal, distância do centro, paradas, percurso, modo, tempo previsto e a nota da conta); consultor + dia; mapa colorido | (1) Tempo pela nossa conta: 8 min por visita (configurável), 4,5 km/h × 1,3, janela e almoço. A Lovable usa 20 min + 1 h fixos e um teto de 10 h. (2) O padrão de paradas é a meta do dia (30). A tela da Lovable abria 20, mas a configuração dela própria diz `clientes_max_dia` = 30. (3) Arquivar em vez de excluir. (4) Um roteiro por consultor por dia. (5) Só entram estabelecimentos com localização exata e fora de rota publicada. (6) Desfazer na atribuição |

**Aceite:** **R1** a prévia "N rotas de até X paradas" com a conta aparece antes de gerar; **R2** gerar leva 1 toque; **R3** atribuir leva 2 escolhas (consultor e dia), com desfazer; **R4** o conflito mostra as 2 saídas; **R5** arquivar nunca tira rota publicada; **R6** no dia atribuído, o consultor vê a rota na Hoje; **R7** células do calendário ≥ 48 px; **R8** o cartão mostra o fator de rua (× 1,3) na conta do percurso.

### 3.5 Visita: checklist de abordagem, cronômetro e e-mail do contato (prioridade 5)

Vale para a tela de resultado do fluxo simples. No fluxo completo, o mesmo bloco fica acima do questionário em `VisitaTela`.

```text
┌──────────────────────────────────┐
│ ← Padaria Bom Pão  ⏱ 04:12  [▢] │ cronômetro (Lovable) + miniatura da foto
│ ✓ Chegada registrada · 11h41     │
├──────────────────────────────────┤
│ Roteiro da conversa · 2 de 7   ▾ │ 56, começa aberto (Lovable)
│ [✓] 1. Apresentação pessoal e da │ 56 por linha; tocar na linha marca
│        empresa                   │
│ [✓] 2. Entender o negócio do     │
│        cliente                   │
│ [ ] 3. Identificar a necessidade │
│ [ ] 4. Apresentar a solução e os │
│        benefícios                │
│ [ ] 5. Oferecer o cupom da 1ª    │
│    contratação grátis [Pedir cupom]│ 48, atalho do §3.2
│ [ ] 6. Tratar objeções  [Anotar] │ 48, abre 1 campo ("Objeção principal")
│ [ ] 7. Fechamento: cadastro ou   │
│        próximo passo             │
├──────────────────────────────────┤
│ Como foi a visita?  (chips de    │ sem mudança
│ hoje, 56 px)                     │
│ Quem atendeu: nome · cargo ·     │
│ telefone · E-mail (opcional)     │ novo campo
├──────────────────────────────────┤
│ Falta escolher como foi a visita.│ toque leva aos chips
│ [         Concluir visita        ]│ fixo, 56
└──────────────────────────────────┘
```

- **O checklist não é obrigatório**, como na Lovable (a função `pendenciasFinalizar` dela não o confere). Não acrescenta toque nenhum. Aberto, ele empurra os chips para baixo, o que custa uma rolagem. Para compensar, a frase "Falta escolher como foi a visita." vira um botão que rola até os chips e põe o foco neles. Se o teste com consultores mostrar atrito, o padrão passa a ser fechado (chave `checklist_aberto`).
- **Observação por etapa:** a Lovable mostra um campo em cada etapa (7 campos). Aqui é [Anotar], que abre o campo só daquela etapa, para não deixar a tela longa ao sol. A observação continua possível.
- **Texto das etapas:** o da Lovable, palavra por palavra, trocando só "voucher" por "cupom".
- **Gravação:** junto do rascunho da visita, pela fila; funciona sem sinal.
- **Etapas obrigatórias** (chave `checklist_obrigatorio`, padrão não): se ligada, "Falta marcar 3 etapas do roteiro da conversa."
- **Cronômetro:** minutos e segundos desde a chegada; `role="timer"` com `aria-live="off"`, para o leitor de tela não anunciar a cada segundo.
- **E-mail de quem atendeu (opcional):** `type="email"`, `inputmode="email"`; conferido ao sair do campo ("Confira o e-mail: falta o @ ou o domínio."), e enquanto estiver errado não é gravado (como o telefone). Mascarado nas listas da equipe (`m***@dominio.com`). Nunca obrigatório, como na Lovable.

**Aceite:** **V1** com o checklist ligado e aberto, A1–A3 do fluxo simples continuam com os mesmos toques; **V2** marcar uma etapa = 1 toque na linha inteira (56 px); **V3** checklist marcado sem sinal volta igual ao reabrir a visita; **V4** e-mail inválido mostra a mensagem e não sobe; **V5** o leitor de tela não lê o cronômetro sozinho; **V6** com etapas obrigatórias, "Concluir" fica desligado e diz quantas faltam.

### 3.6 Jornada: intervalo e resumo/nota do dia (prioridade 6)

```text
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ Hoje · qui 22/10 · Moema  [☀ Sol]│   │ ← Resultado do seu dia · qui 22/10│
│ ┌──────────────────────────────┐ │   │              8,1                 │ 40 px
│ │ ☕ Em intervalo desde 12h04   │ │   │         nota de 0 a 10           │
│ │    23 min                    │ │   │ = rota: 24 de 30 (80%) × 7 = 5,6 │
│ │ A localização fica pausada   │ │   │ + cadastros: 6 de 24 (25%; 30%   │
│ │ no intervalo.                │ │   │   vale nota cheia) 25/30 × 3= 2,5│
│ └──────────────────────────────┘ │   ├──────────────────────────────────┤
│ 12 de 30 visitas ▓▓▓▓░░░░░       │   │ Paradas previstas         30     │
│ Ritmo: o intervalo não conta     │   │ Visitadas           24 (80%)     │
│                                  │   │ Cadastros declarados  6 (25%)    │
│                                  │   │ Tempo do dia  8h40 (9h02–17h42)  │
├──────────────────────────────────┤   │ Intervalo              58 min    │
│ [QR] [   Voltar do intervalo   ] │56 │ Tempo médio na visita   7 min    │
│ Hoje │ Retornos (2) │ Ganhos     │   │ Avaliação                        │
└──────────────────────────────────┘   │ • Você visitou 80% da rota.      │
                                       │   Planejar o tempo em cada       │
 Em jornada, sem visita aberta:        │   cliente pode ajudar a fechar o │
 [☕ Intervalo] [Encerrar o dia]  48    │   roteiro completo.              │
 [Visita fora do roteiro]         48    │ • Para aumentar os cadastros,    │
                                       │   reforce os benefícios e a      │
                                       │   oferta do cupom da 1ª          │
                                       │   contratação grátis.            │
                                       │ • Dia muito produtivo. Obrigado  │
                                       │   pelo empenho!                  │
                                       │ O Freela confirma os cadastros   │
                                       │ depois; os ganhos seguem a regra │
                                       │ vigente (confirmados).           │
                                       ├──────────────────────────────────┤
                                       │ [          Fechar          ]     │
                                       └──────────────────────────────────┘
```

**Intervalo** (chave (proposta) `intervalo_ativo`, padrão ligado como na Lovable): 1 toque para começar e 1 para voltar, sem confirmação (o começo tem desfazer de 8 s); durante o intervalo, o botão fixo vira "Voltar do intervalo"; "Cheguei aqui" numa parada encerra o intervalo sozinho ("Intervalo encerrado às 13h02 (58 min)."); depois de 60 min (chave (proposta) `intervalo_lembrete_min`), faixa "Intervalo há 1h. Voltar agora?", sem nunca encerrar sozinho. **Decisão do designer:** a trilha de GPS pausa no intervalo (privacidade no almoço), o alerta "sem registro" não sai e a equipe vê "em intervalo desde 12h04". O ritmo desconta o intervalo real em vez do almoço fixo das 12h às 13h.

**Encerrar o dia:** diálogo no lugar do `window.confirm`: "Encerrar o dia? Você fez 24 de 30 visitas. A localização para de ser registrada." Se houver fila, acrescenta "+ 2 envios ainda guardados neste celular; eles saem sozinhos com sinal." Botões: **Encerrar o dia** · Voltar. Em seguida abre o Resumo.

**Resumo do dia.** A **nota aparece por padrão** (`ui_resumo_dia = nota`, Lovable), sempre com a conta. Fórmula da Lovable: rota × `nota_peso_rota`/10 (7) + mín(1, positivação ÷ `nota_meta_conversao` (30%)) × 3. Rota = paradas do roteiro concluídas ÷ previstas, com teto em 100% (sem roteiro, usa a meta do dia); positivação = cadastros declarados ÷ visitas concluídas do dia; "tempo médio na visita" = da chegada à conclusão (outra métrica que o "tempo entre visitas" do Início, por isso outro nome). As frases de avaliação são as da Lovable, com "voucher" trocado por "cupom"; a última linha muda conforme a regra de ganhos vigente. Com `numeros` (nossa), some a nota grande e a fórmula. Abre ao encerrar, em Ganhos > Dias anteriores e, para a equipe, na página do consultor. Sem sinal: "Conta feita neste celular às 17h43. Confere com a equipe quando o sinal voltar."

**Aceite:** **J1** intervalo = 1 toque para começar e 1 para voltar; **J2** A1–A3 iguais com o intervalo ligado; **J3** as parcelas somam a nota mostrada (arredondamento de 1 casa); **J4** com `numeros` a nota não aparece; **J5** o diálogo de encerrar tem o verbo no botão; **J6** o intervalo fica fora do ritmo e do alerta "sem registro".

### 3.7 Shoppings (prioridade 7)

Fica em Rotas > Shoppings.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Praça [Moema ▾]                                                            │
│ 1. [ Descobrir shoppings da cidade ]   mapa aberto, sem custo              │
│    Shopping grande = pelo menos [ 50 ] lojas no mapa aberto  ⓘ             │
│    Incluir  Shopping             Bairro       Lojas no mapa   Grande?      │
│    ☑        Shopping Ibirapuera  Moema        212             ✓ sim        │
│    ☑        Shopping Eldorado    Pinheiros    180             ✓ sim        │
│    ☐        Mall Pátio X         V. Mariana    12               não        │
│    (marcar à mão vale mais que o critério)                                 │
│ 2. Lojas lá dentro: (Bar)(Restaurante)(Lanchonete)(Café)…  segmentos §3.9  │
│    [ Buscar lojas dentro de 2 shoppings ]                                  │
│ 3. ● Rota dos shoppings · 2 shoppings · 9,4 km · carro/moto                │
│    ● Dentro do Shopping Ibirapuera · 23 lojas · Piso 1 (9) · Piso 2 (14)   │
│    ● Dentro do Shopping Eldorado · 17 lojas                                │
│    Consultor [▾]  Dia [  ]   (mesma atribuição de "Dividir em rotas")      │
└────────────────────────────────────────────────────────────────────────────┘
```

Texto do ⓘ: "A Lovable usava 2.500 avaliações no Google como sinal de shopping grande (50+ lojas). Aqui contamos as lojas que o mapa aberto (OpenStreetMap) tem dentro do shopping; pode haver mais do que aparece."

No celular: os passos 1, 2 e 3 empilhados; a tabela vira cartões com o seletor "Incluir" de 48 px.

```text
Consultor com rota dentro de um shopping:
┌──────────────────────────────────┐
│ Hoje · sex 23/10                 │
│ Shopping Ibirapuera · 9 de 23    │
│ lojas ▓▓▓░░░░                    │
│ Dentro do shopping o GPS falha:  │
│ medimos a distância até o        │
│ shopping, não até a loja.        │
│ PISO 1                           │
│ ✓ Café Ipê                11h10  │
│ ▶ Bar do Chico  [Cheguei aqui]   │ 56
│   Lanchonete Sol [Cheguei aqui]  │
│ PISO 2 · SEM PISO INFORMADO …    │
├──────────────────────────────────┤
│ [QR] [ Cheguei: Bar do Chico ]   │ fixo
└──────────────────────────────────┘
```

- Cada loja segue a mesma visita do fluxo simples: foto da vitrine e o mesmo resultado em 1 chip (toques de A1–A3).
- A chegada conta como "perto" se estiver a até 300 m do shopping (chave (proposta) `raio_shopping_m`; a Lovable usava 0,3 km para decidir o que fica dentro).
- O piso vem da etiqueta `level` do mapa aberto, quando existe. Sem ela, as lojas ficam em "sem piso informado", ordenadas por proximidade.
- Sem sinal dentro do shopping é comum: a fila cobre.

| Igual à Lovable | Muda (e por quê) |
|---|---|
| Aba Shoppings, mapear os shoppings da cidade, perfil das lojas em chips, busca dentro (300 m), "Rota dos shoppings" e uma rota "Dentro do X" por shopping, confirmação com a estimativa | Mapa aberto no lugar do Google (decisão já tomada). Critério de grande configurável, com ajuste manual. Três passos explícitos no lugar da cadeia automática (cada passo cria coisa ou gasta). Agrupamento por piso. Distância medida até o shopping |

**Aceite:** **S1** o critério é editável e a marcação manual vale mais que ele; **S2** a visita a uma loja leva os mesmos toques de A1–A3; **S3** chegada a 250 m do shopping não aparece como longe; **S4** funciona sem sinal.

### 3.8 Pessoas: Usuários (perfil gestor), ficha do consultor e praça no campo (prioridade 8)

Fica em Administração > Usuários. A seção "Pessoas" sai de Configurações e vem para cá; cor, função e telefone ficam em [Editar].

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Usuários                                         [ Novo gestor ou admin ]  │
│ Nome          E-mail            Perfil   Ativo      Ações                  │
│ Diego Feijó   diego@…           Admin    ◉ (você)   [Gerar senha nova]     │
│ Rebeca Lima   rebeca@…          Gestor   ◉          [Gerar senha nova][Editar]│
│ Consultores de campo recebem acesso na tela Consultores.                   │
│ ▸ O que cada perfil pode fazer                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

"Novo": Nome completo, E-mail e Perfil → **Criar e gerar senha**; a senha provisória aparece uma vez, com [Copiar] e [Enviar pelo WhatsApp] (o `CredenciaisDialog` da Lovable), e quem entra troca no primeiro acesso. "Definir senha à mão" (o nosso jeito) fica como link secundário. Usuários de hoje que não são admin passam a se chamar **Gestor**, sem mudar dado. No celular: cartões.

| O que pode | Admin | Gestor (padrão) |
|---|---|---|
| Ver Operação e Comercial; gerar e atribuir rotas; criar e editar consultor; gerar senha provisória; pedir cupom | ✓ | ✓ (Lovable: equipe) |
| Aprovar e reprovar cupom | ✓ | ✕ (Lovable). Opção "Gestor aprova cupons" (pergunta 3) |
| Pix, banco, CPF e endereço do consultor | ✓ vê e muda | Preenche o Pix **ao criar** o consultor (é obrigatório); depois vê mascarado e **só o admin muda**. **Muda da Lovable**: é dado de pagamento (trocar a chave desvia o Pix). Opção "Gestor vê Pix e banco" (pergunta 3) |
| Pagar Pix, mudar a regra de ganhos, busca paga | ✓ | ✕ (nosso, `@AdminOnly`) |
| Configurações e Usuários | ✓ | ✕; o item nem aparece (Lovable) |

**Ficha do consultor.** O `ConsultorDialog` chegaria a uns 15 campos, então vira seções, com o que é opcional recolhido. No celular é tela cheia.

```text
┌ Editar consultor ───────────────────────────────┐
│ DADOS                                           │
│ Nome completo [Ana Souza            ]           │
│ E-mail [ana@…]   Telefone/WhatsApp [(11) 9…]    │
│ CPF [***.456.789-**]                            │
│ PRAÇAS EM QUE ATUA                              │
│ (✓ Moema)(✓ Pinheiros)( Vila Mariana )          │ chips 48, pelo menos 1
│ ▸ ENDEREÇO (opcional)                           │ recolhido; o CEP preenche
│     CEP [04094-050] → rua, bairro, cidade e UF  │ rua, bairro, cidade e UF
│     Número [ ]  Complemento [ ]                 │
│ PAGAMENTO                                       │
│ Tipo da chave Pix [CPF ▾]  Chave Pix [ … ]      │
│ ▸ Banco, agência e conta (opcional)             │
│ REMUNERAÇÃO                                     │
│ Segue a regra geral: versão 3, R$ 10,00 por     │
│ cadastro confirmado… [Ver a regra]              │ pergunta 4
│ MODO DA VISITA [Seguir o padrão ▾]   [✓] Ativo  │
├─────────────────────────────────────────────────┤
│ [Cancelar]                          [ Salvar ]  │
└─────────────────────────────────────────────────┘
```

**Lista de consultores** com os filtros da Lovable (busca por nome, e-mail ou telefone; Situação Todos/Ativos/Inativos; Praça), selo "sem acesso" e ações [Gerar acesso] ou [Gerar senha nova] e [Editar]. "Excluir" vira **Desativar** (os pagamentos precisam do histórico). Nas listas, CPF, Pix e endereço mascarados (endereço só como cidade/UF). CEP não encontrado: "CEP não encontrado. Preencha a rua à mão."

**Praça no campo.** Só aparece quando o consultor atua em mais de uma praça e não tem roteiro hoje. Com roteiro, a praça vem dele (0 toques).

```text
┌──────────────────────────────────┐
│ Pronto para sair?                │
│ Em qual praça você está hoje?    │
│ (✓ Moema)   ( Pinheiros )        │ chips 56; lembra a última
│ A localização só é registrada…   │
├──────────────────────────────────┤
│ [QR] [ Iniciar o dia em Moema ]  │ fixo
└──────────────────────────────────┘
```

Com uma praça só, nada aparece. Vem marcada a última usada, ou a praça cuja área contém a posição do GPS (hipótese a validar). Trocar no meio do dia: "⋯ > Trocar de praça" (muda onde entra um lugar cadastrado na hora e a lista de lugares próximos). O cabeçalho mostra "Hoje · qui 22/10 · Moema".

**Aceite:** **P1** o gestor não vê Configurações nem Usuários e, pela URL, vê a mensagem de sem permissão; **P2** o gestor não vê os botões de aprovação de cupom e não consegue mudar o Pix de consultor já criado; **P3** consultor com uma praça não vê os chips; com várias, a escolha certa já vem marcada e "Iniciar o dia" continua sendo 1 toque; **P4** o CEP preenche rua, bairro, cidade e UF; **P5** Pix e CPF mascarados nas listas.

### 3.9 Configurações: checklist, segmentos, senha e bônus mensal (prioridade 9)

Fica em Administração > Configurações. Seções novas: "Roteiro da conversa", "Segmentos da busca", "Segurança", "Cupons" e "Página inicial da equipe". O bônus mensal entra na seção atual "Remuneração do consultor".

```text
│ Roteiro da conversa (checklist da visita)                                  │
│ [✓] Mostrar na visita   [✓] Começa aberto   [ ] Obrigatório para concluir  │
│     ⚠ Obrigatório soma 1 toque por etapa: 7 × 30 visitas = 210 toques/dia  │
│ 1 [Apresentação pessoal e da empresa     ] [↑][↓][Remover]   (até 12)      │
│ …                                                                          │
│ 7 [Fechamento: cadastro ou próximo passo ] [↑][↓][Remover]                 │
│ [+ Adicionar etapa]   [Voltar ao padrão da Lovable]   [ Salvar ]           │
│ Vale para as visitas abertas depois de salvar.                             │
├────────────────────────────────────────────────────────────────────────────┤
│ Segmentos da busca de estabelecimentos                                     │
│ Aparecem como opção em "Buscar estabelecimentos" e nas lojas de shopping.  │
│ Nome          Busca no mapa aberto             Palavras no nome   Ativo    │
│ Bar           Bar, Pub                          —                 ◉        │
│ Restaurante   Restaurante                       —                 ◉        │
│ Padaria       Padaria                           —                 ◉        │
│ Buffet        Bufê                              buffet            ◉        │
│ Pizzaria      Restaurante com cozinha pizza     —                 ◉        │
│ Hamburgueria  Restaurante/lanchonete, burger    —                 ◉        │
│ Hotel · Motel Hotel · Motel                     —                 ◉        │
│ Lanchonete · Café (nossos de hoje)              —                 ◉        │
│ [+ Novo segmento]          ▸ Avançado: etiquetas (amenity=bar, …)          │
├────────────────────────────────────────────────────────────────────────────┤
│ Segurança · senha nova precisa de: [ 8 ] caracteres · [✓] 1 maiúscula ·    │
│ [✓] 1 número (como a Lovable). Vale para senhas novas; ninguém é obrigado  │
│ a trocar a senha que já tem.                                               │
├────────────────────────────────────────────────────────────────────────────┤
│ Cupons · desconto padrão [100%] · validade padrão [Sem prazo ▾] ·          │
│ [✓] Motivo obrigatório ao reprovar · [ ] Gestor aprova cupons              │
│ Página inicial da equipe: (• Início, como a Lovable) ( Ações )             │
└────────────────────────────────────────────────────────────────────────────┘
```

**Segmentos:** partem dos 8 da Lovable (Bar, Restaurante, Padaria, Buffet, Pizzaria, Hamburgueria, Hotel, Motel), traduzidos para categorias do mapa aberto, mais os nossos Lanchonete e Café. "Novo segmento": nome, categorias escolhidas em chips em português e, opcionalmente, palavras no nome. A Lovable pedia "tipos do Google" em texto técnico; aqui a etiqueta crua fica só em "Avançado", para admin.

**Tela "Crie sua nova senha"** (equipe e consultor, 390 px):

```text
┌──────────────────────────────────┐
│ Crie sua nova senha              │
│ Por segurança, troque a senha    │
│ provisória antes de continuar.   │
│ Nova senha                       │
│ [••••••••          ] [Mostrar]   │ 48
│ ✓ 8 caracteres ou mais           │ marcação ao vivo, ícone + texto
│ ✕ Uma letra maiúscula            │ aria-describedby no campo
│ ✓ Um número                      │
│ Confirmar senha [••••••••     ]  │
│ ✓ As duas senhas são iguais      │
├──────────────────────────────────┤
│ [        Salvar senha        ]   │ fixo
└──────────────────────────────────┘
```

O que muda da Lovable: ela só avisava num toast depois de enviar. Aqui a regra é marcada enquanto se digita, e há o botão "Mostrar" (o consultor digita na rua, com uma mão).

**Bônus mensal** (Remuneração): cada faixa ganha os campos da linha da Lovable, "Nome da meta (opcional)" (ex.: "40 cadastros no mês") e "Conta por: Dia | Semana | **Mês**". Com alguma faixa mensal, a ajuda diz: "O bônus do mês é pago no primeiro Pix depois do fim do mês (outubro → seg 02/11), junto com a semana." O simulador ganha "Simular o mês". Em Ganhos, o consultor vê: "Meta do mês (outubro): 28 de 40 cadastros confirmados. Faltam 12 para R$ 300,00." (Na Lovable a coluna de período existe mas é ignorada no cálculo; aqui ela vale.)

**Aceite:** **K1** uma etapa editada aparece na próxima visita aberta; **K2** ao ligar "Obrigatório", aparece o aviso com a conta; **K3** segmento ativo vira chip em Buscar estabelecimentos; **K4** a senha é marcada ao vivo e a senha provisória gerada cumpre a regra; **K5** a ajuda do bônus mensal mostra a data real do Pix.

## 4. Critérios gerais (regressão)

**G1** A1–A14 do spec do fluxo simples passam com checklist, cupom e intervalo **ligados** (checklist aberto); **G2** os testes `*caracterizacao*` do modo completo passam sem edição; **G3** com todas as flags novas desligadas, produção fica idêntica (`browser-check` atual verde); **G4** nenhum texto novo contém "voucher", "dashboard", "status", "check-in", "checkout" nem, no campo, "lead"; **G5** todo número novo tem conta e fonte, revisado tela a tela; **G6** alvos ≥ 48 px, tabelas viram cartões abaixo de 768 px, zoom 200% sem rolagem lateral.

## 5. Para o software-architect (não decidi; não inventei nome de rota do api-freela)

| Tema | O que decidir |
|---|---|
| Cupom | Como o Praça cria o cupom no Freela (rota, permissão da conta de serviço, desconto, uso único, validade); como saber se a empresa tem conta de contratante (pareamento da F7, `field_company_signups`, CNPJ/telefone); se o código fica **preso à conta da empresa** (decide se pode ficar no aparelho sem sinal; se não, tratar como segredo, §26.0); como saber que foi usado (sincronização) e job de vencimento; 1 pedido ativo por estabelecimento (índice parcial, SQL manual, `--create-only`); item `cupom` na fila, novas tentativas e "Tentar agora"; flag `FIELD_VOUCHERS_ENABLED` |
| Checklist | `field_visits.checklist` e `checklist_items` (já previstos); `checklist_aberto` e `checklist_obrigatorio` (propostas); `FIELD_CHECKLIST_ENABLED` |
| Intervalo | Eventos de começo e fim na jornada, pela fila; trilha pausada; ritmo com o intervalo real; alerta suprimido |
| Resumo do dia | `ui_resumo_dia` com padrão `nota` (substitui o spec de arquitetura); leitura do resumo para a equipe |
| Início | Endpoint agregado que já devolve as contas; dia de Brasília; definição de "tempo entre visitas" |
| Mapa | Derivação da situação (inclusive das visitas do modo completo); endpoint leve de pinos com `location_precision`; situação da praça pelas datas |
| Rotas | Divisão por setor angular (ideia da Lovable) + ordem pela nossa regra (vizinho mais próximo + 2-opt); lotes e rota sem dia; conflito com o índice de 1 roteiro ativo por dia; arquivar; leitura das rotas futuras pelo consultor |
| Shoppings | `shop=mall` com o polígono; contagem de lojas dentro; etiqueta `level`; `leads.parent_id`; distância até o shopping |
| Pessoas | Perfil gestor (rótulo de quem não é admin, ou tabela de papéis) e as 2 opções; Pix editável só pelo admin depois de criado; várias praças por consultor (junção) e praça da jornada; endereço e banco (dado pessoal, mascarado); troca obrigatória de senha também na equipe; senha provisória cumprindo a regra |
| Segmentos | Onde ficam (catálogo ou `field_config`); consulta Overpass montada a partir das categorias |
| Bônus mensal | Período por faixa no lugar de `tiers_period` global; pagamento no primeiro Pix depois do fim do mês |
| E-mail do contato | `contact_email` opcional, mascarado nas listas |

## 6. Perguntas ao dono (5) e padrões assumidos

1. **O cupom pode ser aprovado antes de a empresa ter conta no Freela?** Assumido: sim. O pedido fica "aguardando a empresa" e o cupom sai sozinho quando ela entra.
2. **Validade padrão e limites do cupom?** Assumido: 100% de desconto, 1 uso, sem prazo; um pedido ativo por estabelecimento; sem limite por consultor.
3. **O gestor aprova cupons e vê Pix e banco dos consultores?** Assumido: não aprova (como a Lovable); vê Pix e banco mascarados (diferente da Lovable).
4. **Remuneração por consultor (como a Lovable: diária, comissão e bônus por representante) ou a nossa regra geral versionada?** Assumido: a regra geral; a ficha só a mostra.
5. **A equipe entra direto no Início?** Assumido: sim, para todos. "Ações" continua no menu e a página inicial é configurável.

**Decisão do designer:** "Cupom", não "voucher"; o cupom é pedido pela tela de resultado (menos em "Fechado" e "Já usa o Freela") e pela etapa do checklist, sem passo obrigatório; motivo obrigatório ao reprovar; saída manual "Vincular à conta do Freela". Checklist aberto e não obrigatório, com "Anotar" por etapa no lugar de 7 campos; trilha de GPS pausada no intervalo; nota sempre com a conta; "tempo entre visitas" e "tempo médio na visita" com nomes diferentes. Pinos com os nossos 5 resultados + "A visitar" + "Confirmado pelo Freela"; paradas por rota partindo da meta do dia (30); arquivar em vez de excluir; 1 roteiro por consultor por dia; "shopping grande" = 50 lojas no mapa aberto, com ajuste manual. 3 abas do consultor mantidas; menu da equipe agrupado; ficha do consultor em seções (endereço e banco recolhidos; Pix muda só pelo admin depois de criado); regra de senha só para senhas novas.

## 7. Resumo

- Desenho de **tudo o que falta da Lovable**, com cada tela do zip mapeada (§1) e as exclusões de segurança e de regra mantidas: Google, troca manual de status, login `@praca.local`, `bootstrapAdmin`, pagamento sem razão.
- Ordem pensada para o chefe: (1) **Início** com 8 cartões, cada um com a conta; (2) **Cupons**, agora cupom real no Freela, com 7 situações e a espera pela conta da empresa resolvida por QR, "Cadastrar por ele" ou vínculo manual; (3) **Clientes e Mapa** por situação; (4) **Rotas** que dividem a área e são atribuídas com desfazer; (5) **checklist** e cronômetro na visita; (6) **intervalo** e **nota do dia**; (7) **Shoppings** pelo mapa aberto; (8) **gestor**, várias praças e ficha; (9) **segmentos**, senha e bônus mensal.
- O fluxo simples no ar **não ganha toque obrigatório**: o critério G1 repete A1–A14 com tudo ligado.
- Os padrões são os da Lovable. A nossa versão fica como opção, nas chaves listadas. Nada muda em produção sem ligar a flag de cada módulo.
- Três decisões anteriores foram substituídas pela regra nova do dono: a nota aparece, o intervalo vira evento e `ui_resumo_dia` passa a ter padrão `nota`.
- Ficaram 5 perguntas ao dono (§6) e uma lista de pontos para o arquiteto (§5), todos sem nome de rota inventado.
