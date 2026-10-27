# Praça igual à Lovable (zip `idea-to-internet-garden (1).zip`, 26/10) — progresso

Pedido do Denner (26/10): "refaça o praça pra ser seguindo totalmente esse aqui, até o design, tudo."

**Retomada automática:** se a sessão cair, ler este arquivo, achar o primeiro item `[ ]` e continuar. Branch `feat/ui-lovable`
(sobre master `e095234`, tag de volta `pre-ui-lovable`). Nada vai para produção sem o Denner (push e compose up via `!`).

## O que o zip novo muda

- Diferença para o zip de 20/10 (`~/Downloads/idea-to-internet-garden`, já portado em L0–L13): **um arquivo só**,
  `src/routes/_authenticated/rotas.tsx` — na aba "geral" das rotas entra o seletor "Perfil dos clientes" (segmentos, vários;
  "Nenhum selecionado = todos os clientes"), que filtra a contagem e quais clientes entram na rota gerada. Na aba "shopping"
  o seletor de perfil sai da tela (fica fixo em Bar + Restaurante para as lojas de dentro).
- O resto do pedido é **apresentação**: telas, menu, nomes, endereços e o design da Lovable.

## Decisões (tomadas sem perguntar, reversíveis)

1. **Menu e telas da Lovable**; o grupo "Comercial" (Funil, Entrada, Buscar estabelecimentos, Mensagens, Campanhas,
   Calendário, Indicadores, Ações, Freela) **some do menu atrás de uma chave** (desligada por padrão), sem apagar código nem
   dados. Prod em 26/10: 1 lead (15/10), 0 ações concluídas, 0 campanhas, 0 disparos, 0 campanhas do Freela — ninguém usa.
2. **Design da Lovable**: claro, azul `oklch(0.52 0.19 258)`, menu lateral azul-marinho `oklch(0.3 0.12 262)`, raio `.75rem`,
   faixa em degradê (`bg-brand`), sombra de cartão, fontes Manrope (texto) + Sora (títulos). Sem botão de tema (a Lovable não
   tem); `users.theme` deixa de mandar.
3. **Uma tela de entrada só**, no layout da Lovable (metade azul + formulário). O campo continua **E-mail** (login por usuário
   com `@praca.local` segue fora, por segurança). Envia para a equipe; se 401, tenta o consultor (token `aud:campo`
   separado). Cada um cai na sua casca.
4. **Casca do representante** igual à Lovable: faixa azul no topo + 5 abas embaixo (Hoje, Mapa, Clientes, Desempenho,
   Carteira). A fila offline (IndexedDB) do campo continua por baixo — é requisito de campo, a Lovable não tem.
5. Continuam fora (já aceito pelo dono 23/10): senha fixa do `bootstrapAdmin`, Google Places gravando dados, pagamento sem
   ledger/"Desfazer" apagando, login `@praca.local`, chave do Google no bundle, dia em UTC, gestor redefinindo senha de admin.

## Padrões adotados para as perguntas em aberto (26/10, noite; Denner dormindo)

- Arquitetura §7: D1 = A (representante segue em `/campo?v=…`; links da Lovable levam para lá; atalho instalado não quebra);
  D2 = troca obrigatória de senha da equipe fica para depois (admin gera, mostra uma vez); D3 = rota nova `GET /v1/campo/map/list`
  atrás da trava do mapa; D4 = endereço direto do Comercial abre normalmente, só sem item no menu; D5 = Desempenho "Em construção"
  com atalho para "Resultado do seu dia"; D6 = Rotas abre na aba "Clientes" quando os planos estão ligados.
- UX §7 (dono): "Iniciar/Encerrar o dia"; nossos resultados da visita ("Como foi a visita?"); situação da praça pelas datas;
  Desempenho "Em construção"; voucher só nasce na visita.
- UX §7 (arquiteto), o que a spec de arquitetura não fechou: rótulos dos pinos só no web; coluna Remuneração por representante
  fica de fora (G4 opcional); CEP sem preencher sozinho (sem ViaCEP no navegador); mensagens da API que dizem "consultor" ficam
  como estão nesta leva.
- Execução: uma etapa por subagente, um de cada vez; lint/typecheck/vitest/jest com `nice`, um processo por vez; o
  `browser-check` (pesado) roda depois da E4 e na E8 — as etapas atualizam as linhas dele no mesmo commit.

## Mapa Lovable → nosso

| Lovable | Nosso hoje | Destino |
|---|---|---|
| `/` (login) | `/entrar` + `/campo/entrar` | `/entrar` única, layout Lovable |
| `/inicio` "Dashboard" (equipe) | `/consultores/painel` | idem, nome "Dashboard" |
| `/inicio` "Hoje" (representante) | `/campo` | casca nova do representante |
| `/pracas`, `/pracas/$id` | `/praca` | lista + detalhe |
| `/clientes` | `/consultores/clientes` | idem |
| `/mapa` | `/consultores/clientes?modo=mapa` | idem |
| `/rotas` (+ filtro de perfil novo) | `/consultores/roteiros` | idem + filtro |
| `/roteiro/$rotaId` | RoteiroTela (campo) | idem |
| `/representantes` | `/consultores`, `/consultores/[id]` | nome "Representantes" |
| `/vouchers` | `/consultores/cupons` | nome "Vouchers" |
| `/financeiro` (equipe) / "Carteira" (rep.) | `/consultores/pagamentos` / GanhosCard+PixCard | idem |
| `/desempenho` | — | "Em breve" (a Lovable também é só "Em breve") |
| `/usuarios` | dentro de `/configuracoes` | tela própria |
| `/configuracoes` | `/configuracoes` | só o que a Lovable mostra no topo; o resto abaixo |
| `/trocar-senha` | `/campo/senha` (+ equipe?) | tela no layout Lovable |

Endereços novos com redirecionamento dos antigos (vídeos, favoritos e o browser-check usam os antigos).

## Etapas

- [x] 0. Arquiteto + designer (regra 11/10): `docs/superpowers/specs/2026-10-26-ui-lovable-arquitetura.md` (plano E1–E9, §5)
      e `-ux.md` (telas, §4; troca do browser-check, §6.2). Decisões em aberto: adotados os PADRÕES das duas specs (lista abaixo),
      todos reversíveis; o Denner revê de manhã.
- [x] 1. Tokens, fontes e fim do botão de tema (commit próprio) — `49031be`. Tokens da Lovable + 4 ajustes de contraste (UX §1.2),
      Manrope/Sora (variáveis no `<html>`), `bg-brand`/`shadow-card`/`card-surface`, sem `.light`/`ThemeSync`/botão, mapas claros,
      `min-h-11` no Button/Input abaixo de `md`, atalho do campo em `#072869`. Web: lint 0, typecheck 0, vitest 35 arquivos/360.
      Fica para depois: `font-black`/`font-extrabold` caem no 700 do Sora (troca nas telas da E5); ✓ do chip escolhido (E4).
- [x] 2. Casca da equipe (menu lateral azul-marinho, nomes da Lovable, chave do Comercial) — API `c9d3559` (§46, `TEAM_COMMERCIAL_ENABLED`,
      `features.commercial/routes/earnings/payouts/declared_signups`) + web (este commit: `AppShell`, `montarMenu`/`itemAtivo`/`ROTA`,
      Dashboard sempre como início, Comercial nas Configurações atrás da chave, browser-check atualizado sem rodar). Jest 7 suítes/130,
      `tsc` 0; web lint 0, typecheck 0, vitest 35/364. Fica para depois: "Trocar senha" no rodapé (E3), `not-found`/`error` da Lovable
      (UX §2.4), "Usuários" aponta para `/configuracoes#pessoas` até a tela própria (E5), sondagem de "Pagamentos"/"Declarados" na
      tela Consultores trocada pelo `features` junto da tela Financeiro (E5).
- [x] 3. Entrada única + trocar senha no layout Lovable — API `95d521c` (contrato §2: `POST /v1/auth/change-password` com `@Equipe()`, 400
      `WRONG_PASSWORD`/`SAME_PASSWORD`/`WEAK_PASSWORD`; `@Throttle` 20/min no login; hash fixo de custo 10 para e-mail inexistente nos dois
      logins) + web `5127dcf` (`EntradaUnica` em `/entrar` e `/campo/entrar`, `decidirEntrada`/`destinoDaSessao`, `TrocarSenhaCartao` em
      `/trocar-senha` e `/campo/senha`, "Trocar senha" no rodapé, `(app)/layout` leva o consultor a `/campo`, browser-check com a janela
      `recusaEsperada`, sem rodar). Jest 7 suítes/98 (auth, campo-auth, users, password-policy, permissões), `tsc` 0; web lint 0, typecheck 0,
      vitest 37/384. Seguiu a arquitetura onde as specs divergem: o consultor fica em `/campo/senha` e `/campo/entrar` (sem redirecionar para
      `/trocar-senha`/`/entrar`, escopo do atalho); tenta o campo em QUALQUER 401 da equipe. Fica para depois: `?como=representante` (UX §3.1.6),
      troca obrigatória e `token_version` da equipe (D2), contagem exata do browser-check (≈ +5) na rodada da E4.
- [x] 4. Casca do representante (5 abas) por cima do campo atual — API `c449eba` (contrato §34.7: `GET /v1/campo/map/list`, `@CampoRoute()` +
      trava do mapa, recorte do §34.4 na praça ATIVA, sem `pracas`/`praca_id`; a G5 veio nesta etapa a pedido, não na E5.11) + web `38e4dd4` (faixa
      `bg-brand` com "Sair", `AbasRepresentante`, `abaDaTela`, visões `mapa|clientes|desempenho|carteira`, Ganhos/Pix/cadastros/resultado do dia
      → Carteira, retornos/vouchers/"Visitados" → Clientes, `EmBreve` + atalho D5, barras fixas acima das abas, `destinoDoRepresentante` final,
      browser-check +11/+12 sem rodar). Jest 10 suítes/120 (pinos, campo.controller, painel, guardas do campo, permissões), `tsc` 0; web lint 0,
      typecheck 0, vitest 37/401. Fica para depois (E5): Hoje no desenho §4.12 (saudação, `CardRota`, quadros), Roteiro §4.13 (sem "Lista | Mapa",
      "← Minhas rotas"), Sol e `FaixaFila` na faixa do topo, `CampoTopo` só h1, renomes ("Iniciar/Encerrar intervalo", rótulos da §4.4), os 3
      cartões de resumo da Carteira; smoke da rota nova (nenhum `smoke*.sh` a chama ainda).
      browser-check depois da E4: 213/213 (flags desligadas), 263/263 (ligadas), 263/263 (Comercial). Duas correções: `devIndicators: false`
      no `next.config.ts` (a bolinha do `next dev` ficava por cima da aba "Hoje" e o toque não chegava nela) e o script espera os ladrilhos
      do mapa do representante antes de trocar de aba (`esperarLadrilhos`; sem isso, `ERR_ABORTED` em `tile.openstreetmap.org` às vezes).
- [x] 5. Telas, uma a uma, no desenho da Lovable (Dashboard, Praças, Clientes, Mapa, Rotas, Roteiro, Representantes,
      Vouchers, Financeiro, Usuários, Configurações, Desempenho)
  - E5a (5.1, 5.2, 5.8, 5.9, 5.10): feito — API `5400da7` (G2 `leads_count` em todo `PracaView`, contrato §6: um `groupBy` na lista, um
    `count` no resto) + web `2eecd34` (Desempenho `EmBreve`), `00bbdaa` (Dashboard: 7 dias, cartões da Lovable, ranking em tabela),
    `8f464db` (Usuários em `/usuarios` com a senha gerada no navegador, 5.000 amostras no vitest; Configurações com Segmentos no topo e
    cartões recolhidos), `10b30a2` (Praças: lista `/pracas` + detalhe `/pracas/[id]`, situação pelas datas, Áreas e Plano recolhidos;
    `ROTA.pracas`/`ROTA.usuarios` nos endereços novos; `/praca` continua). Jest pracas 3 suítes/18, `tsc` 0; web lint 0, typecheck 0,
    vitest 39/413. browser-check atualizado sem rodar (`abrirSecao` para os `<details>`; ≈ +6 desligadas / +8 ligadas). Desvios:
    rótulos dos cartões mudaram em `painel.ts` (o teste acompanha); sem a coluna "Origem" no detalhe (G3 mexe em `pinos.service.ts`);
    a senha da equipe é gerada (a UX dizia digitada; o admin ainda pode trocar o texto); Configurações segue aberta a toda a equipe
    (arquitetura §2.3) em vez do "Apenas administradores" da UX §4.11.
  - E5b (5.3–5.7): feito — web `10cb782` (Clientes só a lista com as pílulas de escolha única + Mapa em página própria em
    `/consultores/mapa`, `pracasAbertas`, Mapa de calor como link), `2fbfa01` (Rotas: abre em "Clientes" com os planos, D6; "Praça" na barra;
    cartões compactos ao lado do mapa; arquivar com AlertDialog; "Dia de cada representante" 3ª aba), `4b7990c` (Representantes: tabela,
    busca/filtros, "Em campo hoje", cadastro em grade, "Acesso gerado" no novo e no "Redefinir senha"; sem as sondagens de 404), `a314152`
    (Vouchers: seletor Todos/Pendente/Aprovado/Reprovado, tabela + situação fina, sem "Solicitar voucher"), `bc0c322` (Financeiro: semana
    fechada, três cartões com a conta, tabela por representante, aba "Cadastros declarados"). Web lint 0, typecheck 0, vitest 40/427; sem API.
    browser-check atualizado sem rodar (≈ +1 desligadas / +8 ligadas): clica em "Dia de cada representante" antes das seções de configuração;
    Mapa em `/consultores/mapa`; seletor de Vouchers por `#vouchers-situacao`; bloco novo do Financeiro. Desvios: rótulos de situação ainda os
    da API (etapa própria com o §34.3); sem G3/G4 (Origem, Remuneração); lixeira = "Desativar" (o contrato §20.9 item 7 tira o apagar da tela);
    a praça do cadastro é a principal (as outras, F2, na ficha); "Esta semana"/"Semana passada" no lugar de De/Até/15 dias/mês.
  - E5c (5.11, 5.12 + sobras da E4): feito — web `efe6f2e` (topo da casca: Sol na faixa azul só em Hoje/Roteiro, `useSol` num estado só e
    `data-sol` na raiz, `FaixaFila` fixa no topo em todas as visões, `--campo-topo`, `CampoTopo` só h1; Hoje nos dois fluxos com "Bom trabalho,
    {primeiro nome}!" + "Hoje, seg 26/10 · praça", `CardRotaHoje` no lugar do `RoteiroCard`, "Nenhuma rota hoje", quadros `bg-muted`,
    "Iniciar/Encerrar intervalo"; `useJornada`; `montarDia.encerradaHoje`), `0c5456d` (Roteiro: um componente para os dois fluxos, cartão fixo com
    selo/barra/linha da Lovable e os botões da jornada, "Resultado do seu dia" ao encerrar (encerrar cai em `?v=roteiro`), "Visita em andamento",
    "Próximo sugerido", lista numerada com Google Maps/Waze/"Cheguei no cliente", sem "Lista | Mapa"; visita com o cabeçalho da Lovable, "Roteiro da
    visita", voucher no lugar de cupom, "Confirmar chegada e iniciar visita"/"Finalizar visita", "Novo cliente"), `b72c802` (Carteira: três cartões
    Hoje/Esta semana/Próximo Pix com a conta), `11409fe` (o Sol alcança os cartões novos: `card-surface`). Web lint 0, typecheck 0, vitest 42/455 (+2 arquivos/+28: `hoje-tela`, `carteira`); sem API.
    browser-check atualizado sem rodar (≈ ±0 nas duas configurações): saudação pelo primeiro nome, "Nenhuma rota hoje", "Iniciar/Encerrar
    intervalo", "Novo cliente"/"É outro cliente", "Confirmar chegada e iniciar visita", "Finalizar visita", "Roteiro da visita", voucher, o roteiro
    do simples por "← Minhas rotas" + cartão "Em rota" (mapa pela aba de baixo), encerrar → `?v=roteiro` com "Resultado do seu dia" e "Encerrada".
    Desvios: o cartão da rota diz "Rota de hoje" com a bolinha azul (o `RouteView` não traz o nome nem a cor do plano; só o `/v1/campo/routes`);
    "Tempo previsto" = abertura da janela → fim da última parada pelo relógio do roteiro (com a conta no "ⓘ"); o "Resultado do seu dia" usa os
    NOSSOS rótulos em quadros (não os 6 da Lovable; o L4 procura "Tempo trabalhado (dia − intervalo)"); o checklist segue com [Anotar] (a
    observação não fica sempre aberta); o diálogo "Chegada" da Lovable não entra (a foto é a chegada); no sugerido, "Cheguei no cliente" só no quadro
    de cima (dois campos de foto com o mesmo nome confundiriam leitor de tela e o Playwright); "Refazer rota a partir daqui" segue só no completo;
    rótulos de situação da §4.4 continuam os da API (etapa própria com o contrato §34.3).
- [ ] 6. Filtro "Perfil dos clientes" na rota geral (API + contrato + tela)
- [ ] 7. Endereços da Lovable + redirecionamentos
- [ ] 8. Verificação: lint, typecheck, vitest, jest das partes tocadas, browser-check (um processo por vez, `nice`)
- [ ] 9. Prévia na Vercel → Denner aprova → subida
