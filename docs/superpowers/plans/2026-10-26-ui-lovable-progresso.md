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
- [x] 6. Filtro "Perfil dos clientes" na rota geral (API + contrato + tela) — API `c055655` (contrato §39.4/§39.5: `types` na prévia e no
      `POST /v1/route-plans`, `lead_count_total`, `PlanSummary.types`; `domain/perfil-rota-rules.ts`, `filtroPerfis`; smoke-lovable-d +3 checagens,
      sem rodar) + web `3423052` (pílulas em `DividirRotas`, seletor fora de `ShoppingsRotas` com Bar + Restaurante fixos; browser-check +3 ligadas,
      sem rodar). Jest rotas + domain 53 suítes/1077 (+2 suítes/33), `tsc` 0; web lint 0, typecheck 0, vitest 42/460 (+5). Desvios: com os segmentos
      desligados as pílulas são os 5 tipos no singular (`Bar`…, os rótulos que a API grava; o `TIPOS` da busca é plural); na aba Shoppings o seletor SAI (Lovable de 26/10),
      não "pré-marcado e editável" como dizia a arquitetura §4.7.
- [x] 7. Endereços da Lovable + redirecionamentos — web `c4e1506` (`git mv` para `/inicio`, `/clientes`, `/mapa`, `/mapa/calor`, `/rotas`,
      `/representantes(/[id])`, `/vouchers`, `/financeiro(/declarados)`; `(app)/praca` saiu; `ROTA` novo + `rotaDoRepresentante`; tabela ÚNICA de 13
      linhas 307 em `web/src/modules/acesso/domain/redirecionamentos.ts`, lida pelo `redirects()` do `next.config.ts` por caminho relativo e testada em
      `__tests__/redirecionamentos.test.ts`; carregada pelo `loadConfig` do Next 15.5 sem erro e conferida com o matcher do próprio Next, sem subir nada).
      Web lint 0, typecheck 0 (depois de `next typegen`: o `.next/types/validator.ts` velho apontava as páginas movidas), vitest 43/469 (+1/+9); sem API
      (nenhum link da API aponta para tela da equipe; manifest `scope: '/campo'` intacto, sem service worker). browser-check atualizado sem rodar
      (+6 nas duas configurações: 4 × 307 por `fetch` sem seguir + representante em `/desempenho` e `/consultores/painel`). Desvios (seguiu a arquitetura):
      `/consultores/roteiros` → `/rotas` e `/consultores/declarados` → `/financeiro/declarados` (a UX dizia `?aba=`; as abas são estado da tela);
      `/campo/entrar` e `/campo/senha` NÃO redirecionam (E3, escopo do atalho); `/roteiro/:id` (da Lovable) → `/campo?v=roteiro`.
- [x] 8. Verificação: lint, typecheck, vitest, jest das partes tocadas, browser-check (um processo por vez, `nice`) — 27/10, sobre `fb320b2`.
      Números: web lint 0, typecheck 0, vitest 43/469; API `tsc` 0, jest da suíte INTEIRA 142 suítes/2169 testes (80 snapshots iguais);
      `smoke.sh` 923/923 (flags desligadas) e 928/928 (só `FIELD_EARNINGS_ENABLED`); nos cabeçalhos: `smoke-lovable-d` 40/40 (2×, sem resíduo),
      `-e` 68/68 (com `LOG_API`), `-a` 38, `-b` 34, `-c` 42, `-f1` 39, `-f2` 38, `smoke-modo-chefe` 28, `-s3` 43 (os 5xx dos logs são só os 503
      `FREELA_NOT_CONFIGURED` esperados); `browser-check` (a) produção antiga 226/226, (b) + lotes A–F (menos VOUCHER_COUPONS; gestor e consultor
      em duas praças) 288/288, (c) + `TEAM_COMMERCIAL_ENABLED` 288/288 — todas com o Overpass num endereço morto.
      Correções: `e36953a` limpeza (o `NewPracaForm` órfão desde a E7 e o parâmetro `dark` de `tilesOptions`/mapas, arquitetura §5 E8.7);
      `37acbb0` o `smoke-lovable-d` inseria `place_candidates` sem `id` (sem default no banco), então as 2 checagens do perfil (E6) nunca
      tinham passado; `e027c2b` o passo do gestor do `browser-check` saía do Dashboard antes do GET do painel responder (`ERR_ABORTED` em (b));
      `87e9abe` o `smoke-lovable-f1` sondava os CHECKs do razão na semana fixa 2026-10-26, que virou a semana corrente (4100 em vez de 4000).
      Nenhum bug de produto. Não feito: capturas desktop/celular de cada tela para o Denner (E8.9).
- [ ] 9. Prévia na Vercel → Denner aprova → subida
      - Revisão de código do diff inteiro (27/10 ~03:20): nada alto/médio; 3 baixos — teto próprio na troca de senha e
        login da equipe 40/min por causa da entrada única (`40a7f5f`, jest auth+permissões 84/84, tsc 0); o nome do colega
        na última visita do `GET /v1/campo/map/list` é intencional (contrato §34.7) e ficou.
      - Prévia (build da Vercel com lint): `praca-1gmddyer2-freelas-projects-ccf14064.vercel.app` (Ready, web de `6a818fe` =
        web de hoje; as 15 páginas novas respondem 200). A prévia NÃO fala com a API (o `NEXT_PUBLIC_API_URL` só existe em
        Production), então serve para provar o build; o design se confere nas capturas `~/Downloads/praca-telas-novas/`.
      - Fechamento (27/10 manhã): jest da API inteira 142 suítes / 2171 testes / 80 snapshots depois do acabamento; prévia final
        `praca-6a6mf37gv-freelas-projects-ccf14064.vercel.app` (Ready; `/consultores/painel` → 307 `/inicio`). Cópia limpa da API
        para o rsync: `/tmp/claude-1000/-home-doutor-coding-freela/afbdab81-1f14-4838-9037-9eec9f310175/scratchpad/deploy-api-<sha final>/api/`.
      - **Subida (Denner, via `!`), nesta ordem — API antes do web; nenhuma migração; nenhuma flag nova a ligar
        (`TEAM_COMMERCIAL_ENABLED` ausente = Comercial escondido):**
        1. backup: `ssh ubuntu@56.124.127.54 "docker exec praca-postgres pg_dump -U praca praca | gzip > /opt/praca/backup-pre-ui-lovable-\$(date +%Y%m%d-%H%M).sql.gz && ls -la /opt/praca/backup-pre-ui-lovable-*"`
        2. master + GitHub: `cd /home/doutor/coding/freela/praca && git checkout master && git merge --ff-only feat/ui-lovable && git push origin master:stack-freela`
        3. código da API a partir da CÓPIA LIMPA do commit (o working tree tem arquivos só reformatados por um formatador externo):
           `rsync -a --delete --exclude node_modules --exclude dist --exclude .env --exclude '.env.*' --exclude coverage --exclude uploads <cópia>/api/ ubuntu@56.124.127.54:/opt/praca/api/ && echo RSYNC_OK`
        4. (Claude) `docker tag praca-api:latest praca-api:pre-ui-lovable` + `docker build -t praca-api:<sha> -t praca-api:latest .` no EC2
        5. `ssh ubuntu@56.124.127.54 "cd /opt/praca && docker compose -f docker-compose.prod.yml up -d --no-deps --no-build api"`
        6. (Claude) `/health`, `features` novos no `settings/config`, `POST /v1/auth/change-password` 401 sem token, logs sem erro
        7. (Claude) web: cópia sem git do commit + `vercel deploy --prod`; conferir aberturademercado.com.br/entrar
      - Volta: API `praca-api:pre-ui-lovable` (`docker tag` + compose up); web: promover o deploy anterior na Vercel; git: tag `pre-ui-lovable`.
      - Acabamento das capturas (27/10 ~04:30): `bb55fd1` "Lovable" fora dos textos de tela (web + a fonte do "Tempo médio" na API);
        `1dc462c` textos no lugar certo (área → detalhe da praça, com link; "Buscar clientes no mapa"; Shoppings 1-2-3) + varredura
        "consultor" → "representante" no web; `84cb259` pílula acesa do menu no meio da faixa (recentra quando o `features` acrescenta
        itens antes dela e quando a fonte chega); `5f60bcb` + `fec4a36` celular (etapa do voucher, "Cheguei" na barra inteira, detalhe da
        praça, nomes das paradas quebram linha); `f265ae7` números: Dashboard "Visitas concluídas" contava a visita ABERTA (a parada vira
        `visitada` na chegada) — agora só a concluída, como a ficha (API + contrato §33.4 + jest); Rotas "feita · 09h00" era o horário
        PREVISTO → "chegada registrada · prevista para 09h00"; Clientes "31 no filtro" contava os 22 a visitar → "9 nesta lista de 31…";
        `13b967f` + `8868796` pino com o símbolo da legenda (canvas) e "Sem interesse" #dc2626 → #9f1239 (API + contrato §34.3).
        Dado de teste/horário, não bug: "Visitadas 0" e "Feitas 0 de 30" com a visita aberta; "03:42" (madrugada). Verificação: web lint 0,
        typecheck 0, vitest 43/481; API tsc 0, jest 10 suítes/118 (painel, pinos, pin-rules, lote A/C/F2, modo); capturas regeradas (44,
        sem rolagem lateral, nada fora da tela nem cortado, banco de volta ao seed); browser-check flags A–F 288/288.
        Fica para depois: telefone sem máscara para a equipe, contraste de botões desabilitados, fonte 12 px; a frase da API "Cadastre uma
        em Configurações" (`planos.service.ts:317`, presa ao `planos-perfil.spec.ts` só reformatado — a tela já mostra a nossa); textos da
        API com "consultor"; `eta` da parada `visitada` (o contrato §23 diz nulo, o check-in não zera); mapa borrado no celular (ladrilhos
        sem retina); `progress.done` da rota conta a chegada (rotulado, não mudado).
