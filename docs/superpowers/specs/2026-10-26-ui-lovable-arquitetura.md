# Praça igual à Lovable (zip de 26/10): desenho de arquitetura do redesenho do web

Data: 2026-10-26. Branch `feat/ui-lovable` (sobre master `e095234`, tag `pre-ui-lovable`). Pedido do Denner: "refaça o praça pra ser seguindo totalmente esse
aqui, até o design, tudo". Decisões já tomadas: `docs/superpowers/plans/2026-10-26-ui-lovable-progresso.md` (não reabertas aqui). Base: `CLAUDE.md`, contrato
`docs/api-contract.md` (§20–§45), `docs/superpowers/specs/2026-10-21-lovable-restante-arquitetura.md` e o código de `web/` e `api/` lidos nesta data.

Lovable lida só como dado: `G/` = `scratchpad/garden-v2/` (nada executado, `.env` não aberto, nenhuma chamada Supabase copiada).

---

## 0. Resumo e regras que valem para todas as etapas

**O que muda de verdade.** Quase tudo é apresentação: tokens, fontes, menu, nomes, cascas, telas e endereços. Funcionalidade nova são só três coisas, e todas
pequenas:

1. O filtro "Perfil dos clientes" na aba geral das Rotas (`G/src/routes/_authenticated/rotas.tsx:51, 59-71, 118-122, 287-298`).
2. A entrada única, com a troca de senha da equipe exigindo a senha atual.
3. Os acréscimos de leitura que a casca precisa para não sondar rota desligada: `features.commercial/routes/earnings/payouts`, `leads_count` das praças e
   (se aprovado) a lista de clientes do representante.

**Nenhuma migração** em todo o plano. Ordem de subida de sempre: API, depois web. O web novo contra a API velha só perde itens de menu, porque `features`
ausente vale `false`.

**Regras deste redesenho:**

- **O consultor continua morando em `/campo`.** É uma rota só e as telas dele são visões (`?v=`), por causa do offline (`use-tela.ts:5-9`) e do atalho
  instalado (`scope: '/campo'`). Ver §3.4.
- **As duas sessões nunca se misturam.** A equipe usa `authUser` e `api`, o consultor usa `campoSession` e `campoApi`. Os guardas ficam nos layouts
  (`(app)/layout.tsx` e `campo/(sessao)/layout.tsx`). Nenhuma árvore da equipe monta `CampoMotor` (fila, `/me`, rastreio). A única leitura cruzada é o
  layout da equipe perguntar se existe `campoSession`, num sentido só.
- **O web descobre os módulos pelo `features`** do `GET /v1/consultores/settings/config` (equipe) e do `GET /v1/campo/me` (consultor), nunca sondando rota
  desligada: um 404 derruba o `browser-check`. Hoje "Pagamentos" é descoberto por sondagem (`use-pagamentos.ts:21-28`, `consultores/page.tsx:24-25`). Este
  plano corrige isso (§2.3).
- **Continua fora** (aceito pelo dono em 23/10):
  - senha fixa do `bootstrapAdmin` (`G/src/routes/index.tsx:31`);
  - login por usuário `@praca.local` (`G/src/lib/format.ts`);
  - Google Places gravando dados (`BuscaGoogleDialog`, `mapearShoppings`, `atualizarDadosGoogle`, avaliação, site e horário do Google em
    `G/src/routes/_authenticated/pracas.$id.tsx:60-64, 89-100`);
  - chave do Google no bundle;
  - pagamento sem ledger e "Desfazer" apagando (`G/…/financeiro.tsx:68-76`);
  - dia em UTC (`iso = toISOString().slice(0,10)` em `G/…/inicio.tsx:31` e `financeiro.tsx:29`);
  - gestor redefinindo senha de admin (`G/src/lib/users.functions.ts:85`);
  - status do cliente mudado à mão (`G/…/clientes.tsx:48-52`);
  - status da praça mudado à mão (`G/…/pracas.$id.tsx:53-59`);
  - "Excluir geração" apagando rotas (`G/…/rotas.tsx:241-254`): nós arquivamos (§39.6).
- **Padrões do repo de sempre:**
  - contrato antes do código;
  - TDD no domínio;
  - centavos, snake_case e `todaySp()`;
  - `apiErrorMessage()`, nunca achatar o erro;
  - storage só em `auth.storage.ts` e `campo-session.storage.ts`;
  - toda rota nova de escrita da equipe leva marca NO MÉTODO (`@AdminOnly/@GestorOuAdmin/@Equipe`; o teste `permissoes-protecao.spec.ts` derruba a suíte se
    faltar);
  - verificação com um processo por vez (`CLAUDE.md`, "Regras de baixo consumo").

---

## 1. Mapa tela a tela: Lovable → rota nova → o que reaproveita → de onde vêm os dados

Rotas novas da equipe ficam em `web/src/app/(app)/…`. As do representante são visões de `web/src/app/campo/(sessao)/page.tsx`. As rotas da API citadas estão
no contrato.

### 1.1 Equipe (admin, gestor e equipe)

| Lovable (`G/src/routes/…`) | Rota nova | Reaproveita | Dados (API) | Lacuna ou divergência |
|---|---|---|---|---|
| `index.tsx` (login, metade azul + formulário) | `/entrar` (canônica) e `/campo/entrar` (mesmo componente, §3.2) | `entrarSchema` de `app/entrar/page.tsx:35-38`, `useAuthStore.signIn`, `useCampoSession.signIn` | `POST /v1/auth/login` (`auth.controller.ts:15-20`) e, se der 401, `POST /v1/campo/auth/login` (`campo-auth.controller.ts:18-25`) | Campo "E-mail", não "Usuário" (decisão 3). Sem `bootstrapAdmin` |
| `_authenticated/route.tsx:89-120` (menu lateral azul-marinho) | casca em `components/praca/AppShell.tsx` | `montarMenu` (`modules/acesso/domain/acesso.ts:82`), `useFeaturesMenu` | `GET /v1/consultores/settings/config` → `features` (`rotas-equipe.controller.ts:82-108`) | `features` ganha `commercial`, `routes`, `earnings` e `payouts` (§2.3). Rodapé: nome, e-mail e perfil (não há `@username`) |
| `inicio.tsx:35-132` "Dashboard" | `/inicio` | `PainelGestor` (`components/praca/PainelGestor.tsx`); sem o painel, `AtencaoAgora` (`EquipeAtencao.tsx:25`) | `GET /v1/consultores/dashboard` (§33.4, `campo/painel/painel.controller.ts`); `GET /v1/consultores/attention` (§25.3) | Nenhuma: os 8 indicadores, o ranking e o resultado por situação já vêm prontos. Período Hoje/7/30/90 conferido no `PainelGestor` |
| `pracas.index.tsx` (cartões: nome, cidade/UF, status, "N clientes", "Nova praça") | `/pracas` | `NewPracaForm`, `useActivePraca`/`usePracas` (`modules/pracas`) | `GET /v1/pracas` (`pracas.service.ts:59`), `POST /v1/pracas` | **Lacuna G2:** a visão não traz contagem de clientes → aditivo `leads_count` (§1.3). **Divergência:** o status é derivado das datas (`start_date`/`end_date`; Planejamento, Em andamento ou Concluída), não editável |
| `pracas.$id.tsx` (tabela de clientes + "Buscar no Google Maps") | `/pracas/[id]` | `ListaClientes` (ganha a prop `pracaId`), `BuscaEstabelecimentos` (`praca` já é prop), `AreasAtuacao`, "Dados da praça" (hoje em `configuracoes/page.tsx:314`), `AberturaPraca` (só com o Comercial) | `GET /v1/consultores/map/list?praca_id=` (§34.6), `/v1/place-searches/*` (§22, §36), `/v1/areas` (§21) | Sem Google (fora). **G3:** a coluna "Origem" pede `source` no item do §34.6 (aditivo, opcional). Abrir o detalhe torna a praça **ativa** (`active_praca_id`, o mesmo de hoje), para os componentes que leem `useActivePraca()` funcionarem sem reescrita |
| `clientes.tsx` (chips por status + UF, cidade e busca) | `/clientes` | `ListaClientes` (`components/praca/ListaClientes.tsx:30`), `useListaClientes` | `GET /v1/consultores/map/list` (§34.6) | **Divergência:** filtros UF/cidade viram os chips de praça + `q` (que já procura no nome, no endereço e na cidade). O status vem da visita (`categoriaDoLead`) e não se edita à mão |
| `mapa.tsx` (só praças abertas, chips por praça, legenda clicável) | `/mapa`; o nosso mapa de calor em `/mapa/calor` | `MapaSituacao`, `PinosMapa`; `MapaDeCalor` | `GET /v1/consultores/map/pins` (§34.1), `GET /v1/consultores/heatmap` (§24) | Nenhuma ("abertas" = `start_date ≤ hoje`, §34.1) |
| `rotas.tsx` (abas Clientes \| Shoppings; Perfil dos clientes; gerações salvas; representante e data por rota) | `/rotas` | `DividirRotas`, `ShoppingsRotas`, `RoteirosEquipe` (a nossa aba "Dia de cada consultor", que fica como 3ª), `RotaPlanoCard`, `RotasMapa` | `/v1/route-plans*` (§39), `/v1/routes*` (§23.4), `/v1/consultores/shoppings` (§40) | **Lacuna G1 (a única funcional):** filtro por perfil, §4. Aba "Shoppings": a Lovable fixou Bar + Restaurante e tirou o seletor; nós **pré-marcamos** Bar + Restaurante e deixamos editar (diretiva "configurável") |
| `representantes.tsx` (tabela, busca, filtros, "Gerar acesso/Redefinir senha", formulário com endereço, praças, remuneração, bônus, banco e Pix) | `/representantes` e `/representantes/[id]` (o nosso detalhe fica) | `ConsultorDialog`, `PracasDoConsultor`, `GanhosConsultor`, `ConsultorLinhaDoTempo`, `ResumoDiaEquipe`, `QrDoFreela` | `/v1/consultores*` (§20.4, §41.3, §44.7), `POST /v1/consultores/:id/reset-password` | **G4:** coluna "Remuneração" (diária e comissão por pessoa). A nossa regra é versionada (geral + por consultor, §45, só admin); a lista mostra "Regra geral" ou "Regra própria" só se `ConsultorView` ganhar `has_own_rule` (aditivo, só admin). Sem isso, a coluna sai. "Sem acesso" não existe (o consultor nasce com senha provisória) |
| `vouchers.tsx` (solicitar com cliente em texto livre; só admin avalia) | `/vouchers` | `CuponsEquipe` (`components/praca/CuponsEquipe.tsx:21`) | `/v1/consultores/vouchers*` (§38.4) | **Fora (G8):** "Solicitar voucher" pela equipe com cliente livre. O nosso pedido é um fato ligado a lead, visita e consultor (trigger, 1 por contratante, §38). A equipe vê, filtra e (admin) decide |
| `financeiro.tsx` (De/Até, 15 dias, mês; total, pago, pendente; "Marcar como pago"/"Desfazer") | `/financeiro` (+ `/financeiro/declarados`) | `PagamentosEquipe`, `GanhosConsultor`, `DeclaracoesEquipe` | `GET /v1/consultores/payouts` (§29.4, `summary.to_pay_cents/paid_cents`), `/v1/consultores/earnings` (§28.5), `/v1/consultores/declared-signups` (§32.6) | **Divergência (G6):** período = semana fechada (razão + Pix semanal). "Últimos 15 dias" e "Este mês" ficam fora. "Desfazer" vira "Estornar" (`/reverse`, com motivo) |
| `usuarios.tsx` (lista com perfil, ativo, "Redefinir senha" gerando senha provisória, "Novo gestor/admin") | `/usuarios` (sai de Configurações > Pessoas) | `Pessoas` (`configuracoes/page.tsx:124`), `perfilDe/corpoDoPerfil` (`acesso.ts:34-38`), `linkWhatsappAcesso` | `/v1/users` (POST/PATCH/DELETE só admin), `PUT /v1/users/:id/password` | **G7:** a equipe não tem senha provisória com troca obrigatória (`users` não tem `must_change_password`, `schema.prisma:11-34`). "Redefinir senha" gera a senha no navegador, seguindo a regra (§41.2), grava pelo `PUT` e mostra uma vez, mas não obriga a trocar (decisão D2) |
| `configuracoes.tsx` (Segmentos da busca) | `/configuracoes` | `SegmentosBusca` no topo, depois `RemuneracaoConfig`, `CanaisCampo`, "Segurança" (`RegraSenha`), `AreasAtuacao` | `/v1/place-searches/segments` (§36.6), `/v1/consultores/earnings/config`, `/v1/consultores/settings/config` | "Variáveis padrão das mensagens", "Roteiro-modelo" e "Impressão" só com o Comercial (§2). **Divergência mantida:** a página aparece para toda a equipe (o gestor cuida das áreas, §42.3); a Lovable a dá só ao admin |
| `trocar-senha.tsx` (nova + confirmar, regra 8 + maiúscula + número) | `/trocar-senha` (equipe; para o consultor, `/campo/senha`, §3.5) | `RegraSenha`, `politicaSchema/senhaCumpre` (`modules/acesso/domain/senha.ts`) | **novo** `POST /v1/auth/change-password` (§3.5); consultor: `POST /v1/campo/auth/change-password` | A nossa pede a **senha atual** (a Lovable não pede): é segurança, não volta |
| `desempenho.tsx` (Em construção) | `/desempenho` (só para o endereço existir; fora do menu da equipe) | `EmBreve` novo em `components/ui/` | — | Igual à Lovable |

### 1.2 Representante (consultor; casca com 5 abas embaixo)

| Lovable | Visão nova (`/campo…`) | Reaproveita | Dados (API) | Lacuna ou divergência |
|---|---|---|---|---|
| `route.tsx:70-87` (faixa azul + 5 abas) | casca em `campo/(sessao)/layout.tsx` | `CampoMotor` (fila, `/me`, rastreio), `useTela`/`irPara` (`use-tela.ts`) | `GET /v1/campo/me` → `features` | A fila offline (IndexedDB) continua por baixo |
| `inicio.tsx:137-210` "Hoje" (calendário "Minhas rotas") | `/campo` (Hoje, padrão) | `HojeTela`/`SimplesHojeTela` (jornada, meta, roteiro, retornos, intervalo, praça do dia), `ProximosDiasTela` como calendário | `GET /v1/campo/today` (§20.2, §25.5), `GET /v1/campo/route/today` (§23.3), `GET /v1/campo/routes?from&to` (§39.7, só com `features.route_plans`) | "Rotas sem data" não existem para nós (item de plano não atribuído não é do consultor). O calendário precisa de sinal; sem sinal, só o dia de hoje (retrato) |
| `roteiro.$rotaId.tsx` (iniciar, intervalo, chegada com foto, cronômetro, checklist, status final, resultado do dia) | `/campo?v=roteiro`, `?v=nova`, `?v=visita&ref=`, `?v=resumo` (sem mudança de URL) | `RoteiroTela`/`SimplesListaTela`, `NovaVisitaTela`/`OndeVoceEstaTela`, `VisitaTela`/`ResultadoTela`, `ChecklistVisita`, `Cronometro`, `IntervaloCampo`, `ResumoDiaTela` | §20, §23, §31, §35, §37, §33.5 | Só restyle. Os testes `*caracterizacao*` não se tocam |
| aba "Mapa" (`mapa.tsx`, filtrado pela RLS) | `/campo?v=mapa` | `useMapaPinosCampo` (`modules/pinos/application/use-pinos.ts:33`), `PinosMapa`, legenda do `MapaSituacao` | `GET /v1/campo/map/pins` (§34.4) | Só com `features.map_pins`; desligada, a aba mostra "ainda não ligado" |
| aba "Clientes" (`clientes.tsx`, os dele) | `/campo?v=clientes` | `RetornosCampo`, `ListaClientes` (só o visual) | **Lacuna G5:** não existe `GET /v1/campo/map/list`. Há só `GET /v1/campo/places?q=` (busca por nome, §20.3) e os pinos | Decisão D3: rota nova `@CampoRoute` (recomendado, §1.3) ou "Retornos + busca por nome" |
| aba "Desempenho" (Em construção) | `/campo?v=desempenho` | `EmBreve` + atalho para "Resultado do seu dia" (`ResumoDiaAtalhos`) | `GET /v1/campo/day-summary` (§33.5), se ligado | Decisão D5 |
| aba "Carteira" (`/financeiro`, as linhas dele) | `/campo?v=carteira` | `GanhosCard`, `PixCard`, `CadastrosConfirmadosCard` (saem da Hoje) | `GET /v1/campo/earnings` (§28.6), `GET /v1/campo/payouts` (§29.6), `/v1/campo/signups` (§27.8) | Só com `features.earnings`/`payouts` do `/me`. Desligada: "ainda não ligado" |

### 1.3 Lacunas que pedem mudança na API (todas aditivas, sem migração)

| # | O quê | Onde | Teste |
|---|---|---|---|
| G1 | `types` no `POST /v1/route-plans` e no `GET /v1/route-plans/preview` | §4 | §4.6 |
| G2 | `leads_count` em cada `PracaView` do `GET /v1/pracas`: leads `archived = false`, `is_test = false` da praça. Um `groupBy` só, sem N+1 | `pracas.service.ts:59`, contrato §6 | jest: contagem por praça, arquivado e teste fora, praça sem lead = 0 |
| G3 (opcional) | `source` (ou `origem`) no item do §34.6 | `campo/pinos/pinos.service.ts` | jest da lista |
| G4 (opcional) | `has_own_rule` no `ConsultorView`, só para admin (lido das versões por consultor quando `FIELD_EARNINGS_PER_CONSULTANT_ENABLED`) | `consultores.service.ts` | jest: gestor e equipe não recebem a chave |
| G5 (D3) | `GET /v1/campo/map/list?codes=&q=&cursor=&limit=` (`@CampoRoute()`, mesma trava `FIELD_MAP_PINS_ENABLED`, `404 MAP_PINS_DISABLED`). Base do §34.4: só leads da praça ativa que estão num roteiro dele ou que ele visitou. Resposta = a do §34.6 sem `pracas`, telefone só mascarado | `campo/pinos/pinos.controller.ts` + `pinos.service.ts` (o mesmo filtro de `consultor()`), contrato §34.7 | jest: A × B (consultor B não vê lead de A que não passou por ele), lead de outra praça fora, `codes` desconhecido → 400, flag desligada → 404 |
| §2.3 | `features.commercial`, `routes`, `earnings`, `payouts`, `declared_signups` no `GET /v1/consultores/settings/config` | `rotas-equipe.controller.ts:82-108` | jest: padrão `false`; com o env, `true` |
| §3 | `POST /v1/auth/change-password`; `@Throttle` no login da equipe | `auth.controller.ts`, `auth.service.ts` | §3.5, §3.2 |

---

## 2. A chave do Comercial

### 2.1 O que é

| Item | Decisão |
|---|---|
| Nome | `TEAM_COMMERCIAL_ENABLED`, padrão `false`. No wire: `features.commercial` |
| Onde mora | Na **API** (env), como todas as outras flags. Vai em `env.validation.ts`, `docker-compose.yml`, `.env.example` e `env-places.spec.ts`. Em produção, `env_file: .env` (uma linha em `/opt/praca/.env` e reiniciar a API). O web lê pelo `features` do `GET /v1/consultores/settings/config` |
| O que esconde | O grupo "Comercial" do menu: Funil `/funil`, Entrada `/entrada`, Buscar estabelecimentos `/prospeccao` (só admin e gestor, como hoje), Mensagens `/mensagens`, Campanhas `/campanhas`, Calendário `/calendario`, Indicadores `/indicadores`, Ações `/hoje` e Freela `/freela`. Também o sino de notificações (avisos de ações) e as seções "Variáveis padrão das mensagens", "Roteiro-modelo" e "Impressão" das Configurações. Na `/pracas/[id]`, a aba "Abertura (etapas)", que é o `AberturaPraca` de hoje |
| O que **não** esconde | A API, os dados e os motores. Leads, eventos, cadências, outbox do Freela, formulário público `/formulario/[pracaId]` e `/v1/*` seguem iguais. O lead é a entidade comum do funil e do campo (visita cria lead e `lead_events`); trancar a API do Comercial quebraria o campo e o motor de cadências |
| Ligada | O menu ganha o 2º grupo "Comercial" com os itens de hoje, na ordem de hoje. Volta o sino. Voltam as seções das Configurações |

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **A. Env da API + `features.commercial`** (recomendada) | Mesmo padrão das 22 flags; um lugar só para ligar; o `browser-check` já lê `features` | Uma linha na API |
| B. `NEXT_PUBLIC_COMMERCIAL_ENABLED` no web | Não toca a API | Fica gravada no build: ligar exige novo deploy na Vercel; foge da regra "o web descobre pelo `features`" |
| C. Chave em `app_settings` editável pela tela (admin) | "Configurável pela tela" | PUT, auditoria e tela; não há pedido para isso; vira A + tela depois, se o dono quiser |

### 2.2 Endereço direto com a chave desligada

As páginas **abrem normalmente** dentro da casca nova, sem item ativo no menu. Isto vale para `/funil` e para os outros endereços do Comercial.

- **Motivo:** nada nelas é perigoso.
- **Quem chega por elas:** favoritos e vídeos antigos (`/hoje` era a página inicial).
- **O que se evita:** a regressão do Comercial no `browser-check` continua rodando sem ligar nada. As visitas diretas das linhas 384-555 seguem iguais.

Bloquear exigiria condicionar cerca de 20 passos do check e um guarda novo. A alternativa "bloqueia e mostra 'área desligada'" fica registrada (D4).

### 2.3 Itens do menu que dependem de flag (sem sondar 404)

`features` ganha, além de `commercial`:

- `routes` (`FIELD_ROUTES_ENABLED`);
- `earnings` (`FIELD_EARNINGS_ENABLED`);
- `payouts` (`FIELD_PAYOUTS_ENABLED`, que só vale com `earnings`);
- `declared_signups` (`FIELD_DECLARED_SIGNUPS_ENABLED`, que só vale com `earnings`). O link "Declarados" do Financeiro hoje é descoberto pela mesma sondagem
  de 404 (`declarados.api.ts:9`, `DECLARED_DISABLED`).

As cinco são lidas num provedor global novo, `api/src/common/flags/ui.flags.ts`, no molde de `lovable-e.flags.ts`, e injetadas no `RotasConfigController`.
O `RotasModule` continua folha.

| Item (Lovable) | Aparece quando | Destino |
|---|---|---|
| Dashboard | sempre (é a página inicial) | `/inicio`: `PainelGestor` com `features.dashboard`; sem ele, "Atenção agora" |
| Praças | sempre | `/pracas` |
| Clientes, Mapa | `map_pins` | `/clientes`, `/mapa` |
| Rotas | `routes` | `/rotas` |
| Representantes | sempre | `/representantes` |
| Vouchers | `vouchers` | `/vouchers` |
| Financeiro | `payouts` | `/financeiro` |
| Configurações | sempre (divergência mantida, §1.1) | `/configuracoes` |
| Usuários | `is_admin` | `/usuarios` |
| Grupo "Comercial" | `commercial` | itens do §2.1 |

**Página inicial:** sempre `/inicio`. `paginaInicial()` não depende mais de `/hoje`, que é do Comercial. Com o Comercial e o painel desligados, a equipe ainda
tem para onde ir.

`app/page.tsx:19` manda quem não tem sessão para `/hoje` (funciona por quique). Passa a mandar para `/entrar`.

---

## 3. Entrada única, cascas por perfil e senhas

### 3.1 O que existe hoje (conferido)

| | Equipe | Consultor |
|---|---|---|
| Login | `POST /v1/auth/login` → `{ access_token, user }`; 401 `INVALID_CREDENTIALS` "E-mail ou senha inválidos" ou 401 `UNAUTHORIZED` "Conta desativada" (`auth.service.ts:72-85`) | `POST /v1/campo/auth/login` → `{ access_token, consultant, must_change_password }`; os mesmos dois 401 (`campo-auth.service.ts`) |
| Throttle do login | **só o global**, 300/min por IP (`app.module.ts:40`) | 20/min por IP (`campo-auth.controller.ts:18-20`) |
| Token | JWT de 12 h, **sem** `token_version`; o guard confere `active`, `is_admin` e `is_gestor` no banco a cada request | `aud: "campo"`, 7 dias, `tv` = `token_version` (troca de senha derruba o anterior) |
| Sessão no web | `authUser` (`auth.storage.ts`), `useAuthStore`, `api` (`http.ts`) | `campoSession` (`campo-session.storage.ts`), `useCampoSession`, `campoApi` (`campo-http.ts`) |
| 401 no web | limpa `authUser` e vai para `/entrar`; ignora URL com `/auth/login` (`http.ts:37-52`) | limpa `campoSession` e vai para `/campo/entrar`; ignora `/auth/login` (`campo-http.ts:27-37`; `/v1/campo/auth/login` também casa: **não "consertar"**) |
| Troca obrigatória | não existe (`users` não tem a coluna) | `must_change_password`; o guard responde `403 PASSWORD_CHANGE_REQUIRED` e o web vai para `/campo/senha` (`campo-http.ts:40-49`) |
| Troca voluntária | `PUT /v1/users/:id/password { password }`: o próprio ou o admin, **sem a senha atual** e sem derrubar o token (`users.service.ts:111-125`) | `POST /v1/campo/auth/change-password { current_password, new_password }`: 400 `WRONG_PASSWORD`/`SAME_PASSWORD`/`WEAK_PASSWORD` e token novo |

### 3.2 Entrada única

**Um componente, `components/entrada/EntradaUnica.tsx`** (layout da Lovable: metade azul + formulário), montado em dois endereços:

- `/entrar`, o canônico: menu, links, 401 da equipe.
- `/campo/entrar`: mesmo componente, para o atalho instalado continuar dentro do `scope: '/campo'` (§3.4). O texto do WhatsApp do `ConsultorDialog.tsx:42,131`
  continua válido.

**Fluxo** (orquestrado em `modules/entrada/application/use-entrada.ts`; regra pura em `modules/entrada/domain/entrada.ts`):

1. Valida o formulário: `email` (e-mail válido) e `senha` (mínimo 6), com react-hook-form + zod. Os rótulos "E-mail", "Senha" e "Entrar" ficam iguais aos de
   hoje, e os seletores do `browser-check` continuam valendo.
2. Chama `POST /v1/auth/login`. Se der certo, limpa a sessão do consultor (`useCampoSession.getState().signOut()`; a **fila fica** no IndexedDB),
   `queryClient.clear()` e vai para `/inicio`.
3. Se a equipe respondeu **401** (qualquer código), chama `POST /v1/campo/auth/login`. Se der certo, limpa a sessão da equipe
   (`useAuthStore.getState().signOut()`), `queryClient.clear()`, `registrarConsultor` (já existe) e vai para `/campo/senha` (se `must_change_password`) ou
   `/campo`.
4. Qualquer outro resultado da equipe (429, rede, 5xx) **para** sem tentar o consultor.

**Mensagens** (`decidirEntrada(resEquipe, resCampo?)` → `{ entra: 'equipe' | 'campo', destino } | { erro }`):

| Equipe | Consultor | Mostra |
|---|---|---|
| 200 | — | entra na equipe |
| 401 (qualquer) | 200 | entra no campo |
| 401 `INVALID_CREDENTIALS` | 401 `INVALID_CREDENTIALS` | "E-mail ou senha inválidos." (a mensagem da API) |
| 401 `UNAUTHORIZED` (desativada) | 401 `INVALID_CREDENTIALS` | a mensagem "Conta desativada" da API + "Fale com o administrador." |
| 401 `INVALID_CREDENTIALS` | 401 `UNAUTHORIZED` | idem |
| 429 | (não tenta) | "Muitas tentativas. Espere um minuto e tente de novo." |
| 401 | 429 | idem |
| rede ou 5xx | (não tenta) | `apiErrorMessage(e)` ("Sem conexão com o servidor", etc.) |

**Por que não vaza se o e-mail existe:**

- As duas APIs respondem a mesma coisa para e-mail inexistente e senha errada.
- "Conta desativada" só sai depois de a senha bater, então não serve para enumerar.
- O web mostra uma mensagem só, nunca "e-mail não encontrado".

**Hardening recomendado na mesma etapa** (barato, sem mudar o wire): nas duas `login()`, quando o e-mail não existe, rodar um `bcrypt.compare` contra um hash
fixo. Hoje a resposta para e-mail inexistente sai mais rápida, o que é um oráculo de tempo, e a tela única dobra as consultas.

**Throttle:** `@Throttle({ default: { limit: 20, ttl: 60_000 } })` também no `POST /v1/auth/login`, igual ao do campo. Cada tentativa errada na tela única
custa uma consulta na equipe e uma no campo. Antes de subir:

- contar quantos logins de equipe por minuto `scripts/smoke*.sh` e `browser-check.mjs` fazem (`smoke.sh` tem 6 chamadas, `smoke-lovable-e.sh` tem 6, algumas
  dentro de funções);
- se algum passar de 20/min, usar 30.

Atrás de nginx vale `TRUST_PROXY` (CLAUDE.md).

### 3.3 Guardas e cascas

| Endereço | Guarda | Regra |
|---|---|---|
| `/` (`app/page.tsx`) | — | `destinoDaSessao({ equipe, campo })`: com equipe → `/inicio`; senão, com campo → `/campo/senha` ou `/campo`; sem nada → `/entrar` |
| `/entrar`, `/campo/entrar` | — | Hidrata as **duas** stores. Quem já tem sessão sai pelo `destinoDaSessao` (a equipe vence) |
| `(app)/*` (equipe) | `(app)/layout.tsx` | Hidrata as duas. Com `authUser`: monta `AppShell`. Sem `authUser` e com `campoSession`: `router.replace(destinoDoRepresentante(pathname))`. Sem nenhuma: `/entrar` |
| `campo/(sessao)/*` | `campo/(sessao)/layout.tsx` (sem mudança de regra) | Sem `campoSession`: `/campo/entrar`. `must_change_password`: `/campo/senha` |
| `/trocar-senha` | página fora dos dois grupos | Com `authUser`: a troca da equipe. Senão, com `campoSession`: `router.replace('/campo/senha')`. Sem nada: `/entrar` |
| `/campo/senha` | página (fora de `(sessao)`, como hoje) | Só a troca do consultor |

`destinoDoRepresentante(pathname)` é uma função pura em `modules/acesso/domain/enderecos.ts`, testada no vitest. É o que dá o comportamento da Lovable: o
mesmo link serve às duas pessoas.

| Pathname | Destino |
|---|---|
| `/inicio` | `/campo` |
| `/mapa` | `/campo?v=mapa` |
| `/clientes` | `/campo?v=clientes` |
| `/financeiro` | `/campo?v=carteira` |
| `/desempenho` | `/campo?v=desempenho` |
| qualquer outro | `/campo` |

**Sem laço:**

- Consultor em `/inicio` → `/campo`, que ele tem.
- Equipe em `/campo` → `(sessao)` manda para `/campo/entrar` → a entrada vê `authUser` → `/inicio`.
- Ninguém → `/entrar`, que não tem guarda.
- 401 da equipe limpa `authUser`. Se ainda houver `campoSession`, `/entrar` manda para `/campo` (a fila e a sessão do consultor não se perdem).

**Duas sessões no mesmo navegador.**

- **Regra nova:** login bem-sucedido de uma pessoa **limpa a outra**. Uma pessoa por navegador; a fila do consultor nunca é apagada.
- **Estado antigo** (alguém já tinha as duas antes do deploy): cada casca usa a sua; a entrada e a raiz preferem a equipe; nada é apagado na hidratação.
  Apagar ali derrubaria um consultor sem aviso.

**O que mais muda nos layouts:**

- `(app)/layout.tsx` deixa de montar `ThemeSync`.
- O `useMe()` da equipe só roda com `authUser`, como hoje.
- O layout lê `useCampoSession` **só** para saber se existe sessão. Nunca monta `CampoMotor` nem chama `campoApi`.

### 3.4 Endereços: a colisão `/inicio`, `/mapa`, `/clientes`, `/financeiro`

A Lovable usa a mesma URL e escolhe a tela pela pessoa (`G/…/inicio.tsx:25-29`, `route.tsx:70`). Duas formas de fazer isso aqui:

| | **A. Consultor continua em `/campo` (recomendada)** | B. URL compartilhada com "despachante" por sessão |
|---|---|---|
| Como | Equipe nos endereços da Lovable. Consultor em `/campo` com as abas como visões (`?v=mapa`, `clientes`, `desempenho`, `carteira`). Os endereços compartilhados levam o consultor à visão equivalente (§3.3) | `/inicio`, `/mapa`, `/clientes`, `/financeiro` e `/desempenho` num grupo `(compartilhado)` com um layout que monta a casca da equipe **ou** a do consultor, conforme a sessão. As abas do consultor trocam a URL por `pushState` entre esses caminhos |
| Offline | Igual a hoje: visões de uma rota só, troca por `history.pushState` (`use-tela.ts:5-9`), sem buscar nada no servidor | Também por `pushState`, mas a página montada é a do 1º endereço carregado, e as visões de fluxo (`nova`, `visita`…) passam a viver em `/inicio?v=…` |
| Atalho instalado (PWA) | Intacto: `scope: '/campo'`, `start_url: '/campo'` (`campo/manifest.webmanifest/route.ts`). Ninguém reinstala | O `scope` vira `/`. Atalhos já instalados (iOS nunca relê o manifest) ficam fora do escopo, abrindo com a barra do navegador: **reinstalar em todos os celulares** |
| Guardas | Um por grupo, como no `CLAUDE.md` ("a página não pode montar sem sessão") | Um layout que decide em tempo de execução qual casca e qual motor montar: as duas sessões e os dois motores no mesmo pacote |
| `browser-check` | Cerca de 40 regexes `/\/campo\?v=…/` (linhas 759-887, 1286-1456) intactas | Todas mudam |
| O que o consultor vê na barra | `/campo?v=mapa`, não `/mapa` (no atalho instalado não há barra) | `/mapa`, igual à Lovable |

**Recomendação: A.** É a mais simples e a mais segura, sem reinstalação e sem misturar sessões. A diferença visível é só a URL na aba do navegador do
consultor. Fica como decisão D1.

**Por que `/campo/entrar` e `/campo/senha` continuam páginas, não redirecionamentos.** São os únicos momentos em que o atalho sairia do escopo: o 401 depois de
7 dias e o 403 `PASSWORD_CHANGE_REQUIRED`. No iOS, sair do escopo em modo standalone abre um navegador dentro do app, e o `router.replace('/campo')` depois do
login cairia ali, não no app. Por isso:

- `campo-http.ts` mantém os destinos `/campo/entrar` e `/campo/senha`;
- o manifest mantém `scope` e `start_url`;
- mudam só as cores (`theme_color`/`background_color` e o `themeColor` do `campo/layout.tsx:17` passam do `#1d1d1b` para o hex do `--primary-deep` da
  Lovable), o que só afeta instalações novas;
- o nome "Praça Campo" fica (o iOS não muda o nome de atalho instalado).

**Renomear pastas vs. `rewrites`.** Recomendo **renomear** as pastas do App Router (`git mv`, que preserva o histórico) e pôr `redirects()` no `next.config.ts`
para os endereços antigos:

- **Por que não `rewrites`:** deixariam duas URLs para a mesma página, confundiriam o item ativo do menu (`usePathname`) e os links, e o código deixaria de
  ler como a URL.
- **Por que `redirects()`:** são aplicados na borda da Vercel, sem JS, servem a favoritos e vídeos e aceitam `has` de query (`?modo=mapa`).
- **Por que `permanent: false` (307):** um 308 fica no cache do navegador para sempre, e um nome ainda pode mudar se o dono trouxer outra versão da Lovable.
  Trocar por 308 depois de estabilizar é uma linha.

**Tabela de redirecionamentos** (num módulo TS puro, `web/src/modules/acesso/domain/redirecionamentos.ts`, importado com caminho **relativo** no
`next.config.ts`, porque o `next.config` não resolve `@/`). As rotas estáticas vêm antes das dinâmicas:

| Antigo | Novo |
|---|---|
| `/consultores/painel` | `/inicio` |
| `/consultores/clientes?modo=mapa` (`has: [{ type: 'query', key: 'modo', value: 'mapa' }]`, antes da regra seguinte) | `/mapa` (o Next repassa a query que sobrou: chega `/mapa?modo=mapa`, que a página ignora; o teste confere o pathname) |
| `/consultores/clientes` | `/clientes` |
| `/consultores/mapa` | `/mapa` |
| `/consultores/calor` | `/mapa/calor` |
| `/consultores/roteiros` | `/rotas` |
| `/consultores/cupons` | `/vouchers` |
| `/consultores/pagamentos` | `/financeiro` |
| `/consultores/declarados` | `/financeiro/declarados` |
| `/consultores/:id` | `/representantes/:id` |
| `/consultores` | `/representantes` |
| `/praca` | `/pracas` |
| `/roteiro/:id` | `/campo?v=roteiro` (só o consultor usa; a equipe que cair ali vai para `/campo/entrar`, que a manda para `/inicio`) |

**Ficam como estão:**

- `/hoje`, `/funil`, `/entrada`, `/prospeccao`, `/mensagens`, `/campanhas`, `/calendario`, `/indicadores` e `/freela` (Comercial, §2.2);
- `/configuracoes`;
- `/campo*`;
- `/formulario/[pracaId]`;
- `/entrar`.

### 3.5 Trocar senha

**Equipe: rota nova `POST /v1/auth/change-password`.**

| Item | Desenho |
|---|---|
| Corpo | `{ current_password, new_password }` (`ChangeOwnPasswordDto`: `current_password` 6–72; `new_password` 8–72, sem inicializador) |
| Autorização | Só o próprio (o id vem do token, nunca do corpo). Marca `@Equipe()` no método |
| Resposta | `200 { ok: true }` |
| Erros | `400 WRONG_PASSWORD` (400, não 401: o `http.ts` trata 401 como sessão morta; mesma lição do campo); `400 SAME_PASSWORD`; `400 WEAK_PASSWORD` pela `PasswordPolicyService.exigir`, injetada como no `UsersService` (`users.service.ts:17`) |
| Contrato | Linha nova no §3 |
| O que não muda | O `PUT /v1/users/:id/password` fica para o admin redefinir a de outra pessoa (§1.1 Usuários) |

**Alternativa descartada:** a tela usar o `PUT` do próprio, que não pede a senha atual. Com uma sessão roubada, qualquer um troca a senha e toma a conta.

**Limite conhecido:** o JWT da equipe não tem `token_version`, então o token antigo vale até expirar (≤ 12 h) depois da troca. Fica anotado (D2), junto com a
troca obrigatória.

**Tela:**

- **Componente:** `components/entrada/TrocarSenhaCartao.tsx` (cartão da Lovable: "Crie sua nova senha"), usado por `/trocar-senha` (equipe) e
  `/campo/senha` (consultor).
- **Props:** `pedeAtual`, `obrigatoria` e `onSalvar(atual, nova)`.
- **Esquema:** `modules/entrada/domain/trocar-senha.ts` (nova = confirma; nova ≠ atual; 8–72; regra ao vivo por `senhaCumpre` quando
  `GET /v1/password-policy` diz `enabled`).
- **Campo a mais:** "Senha atual" (a Lovable não tem).
- **Acesso:** o consultor chega à troca obrigatória como hoje; a equipe, por um link "Trocar senha" no rodapé do menu.
- **Equipe sem troca obrigatória:** nesta leva, não existe. "Senha provisória + troca no 1º acesso" (o fluxo do `/usuarios` da Lovable) pede
  `users.must_change_password`, o guard respondendo 403 e o web redirecionando (D2).

### 3.6 Casca do representante

- **Onde:** `app/campo/(sessao)/layout.tsx` ganha a faixa azul do topo (`bg-brand`, "Praça", "Sair") e a barra de 5 abas embaixo
  (`components/campo/AbasRepresentante.tsx`). O "Sair" sai do `CampoTopo` e vai para a faixa; o `browser-check` não clica nele.
- **Visões:** `Tela` (`use-tela.ts`) ganha `{ v: 'mapa' }`, `{ v: 'clientes' }`, `{ v: 'desempenho' }` e `{ v: 'carteira' }`. As visões de hoje (`nova`,
  `visita`, `qr`, `cadastro`, `roteiro`, `parada`, `resumo`, `pedir-cupom`, `proximos`) ficam com URL **byte a byte igual**.
- **Troca de aba:** `irPara()` (`pushState`), **nunca** `router.push`.
- **Aba ativa ou barra escondida:** `abaDaTela(tela) → 'hoje' | 'mapa' | 'clientes' | 'desempenho' | 'carteira' | null`, função pura. `null` esconde a barra
  nas telas de fluxo com botão fixo embaixo (`nova`, `visita`, `cadastro`, `pedir-cupom`, `parada`); `roteiro`, `resumo`, `proximos` e `qr` acendem "Hoje".
  O desenho final é do designer.
- **Abas sempre visíveis:** são 5 sempre, como na Lovable. O conteúdo de uma aba sem módulo ligado (`features` do `/me`) é um cartão "ainda não ligado",
  sem chamar rota desligada.
- **Sem sinal:** Mapa, Clientes e o calendário da Hoje dizem "precisa de sinal" (`use-online.ts`). Carteira usa os retratos que já existem nos cartões.
- **Mapas:** passam a usar tiles claros. O `escuro={!sol}` de `RoteiroTela.tsx:124` e `SimplesListaTela.tsx:33` vira `false`. O modo "Sol" (borda de 2 px)
  continua.

---

## 4. Filtro "Perfil dos clientes" na rota geral (API completa)

### 4.1 O que a Lovable faz

O seletor é múltiplo e mostra os segmentos ativos por nome. "Nenhum selecionado = todos os clientes" (`G/…/rotas.tsx:287-298`). Ele filtra:

- a contagem "N clientes com localização" (`:59-71`, `.in("segmento", segSelGeral)`);
- quais clientes entram nas rotas geradas (`:118-122`).

Cliente sem segmento fica de fora quando há filtro (`segSelGeral.includes(c.segmento ?? "")`).

### 4.2 Como o segmento do lead existe hoje (conferido)

- **`leads` não tem coluna de segmento** (`schema.prisma`, `model leads`).
- O segmento vem do achado da busca: `place_candidates.category` = o `slug` do segmento (com `FIELD_SEGMENTS_ENABLED`) ou um dos 5 tipos fixos
  (`TIPOS_LUGAR`, `domain/places-rules.ts:14`).
- O lead se liga ao achado por `place_candidates.lead_id`, ao ser adicionado ou quando um achado novo é marcado `duplicado` de um lead que já existe
  (`places-search.service.ts:492, 543, 590`).
- **Um lead pode ter vários achados**, até de categorias diferentes: por exemplo, "restaurante" numa busca antiga e "pizzaria" depois de ligar os segmentos.
- Lead criado à mão, importado ou aberto na visita ("lugar novo") **não tem** achado, logo não tem perfil.
- `RotasEquipeService.candidates` mostra a categoria do achado **mais antigo** (`rotas-equipe.service.ts:132-136`).
- **A lista de segmentos não mora em `field_config`:** mora em `app_settings.place_segments` (`{ segments, atualizado_por, atualizado_em }`; nulo = os 10
  padrão, §36.5/§36.7), lida por `lerSegmentos()` (`domain/segmentos-rules.ts:281`). Com a flag desligada, valem os 5 de hoje.

### 4.3 Regra (decisões)

| Ponto | Decisão | Por quê |
|---|---|---|
| Nome no wire | `types` (lista de `slug`) | O mesmo vocabulário do `POST /v1/place-searches.types` (§22.3, §36.6); "Perfil dos clientes" é só o rótulo da tela |
| Ausente, `null` ou `[]` | Todos: o comportamento de hoje, byte a byte | Lovable: "nenhum = todos"; `null` nunca gera erro (lição do `result: null` da S1) |
| Lead casa o perfil quando | **Algum** achado ligado a ele tem `category` na lista (`place_candidates: { some: { category: { in: types } } }`) | Uma condição só, inteira no banco, que vem antes do corte de 2.000 (`take: MAX_LEADS_PLANO + 1`, `planos.service.ts:296-320`). Filtrar na memória depois do corte daria resultado errado em praça grande. "Achado como Bar numa busca e como Restaurante noutra" entra nos dois perfis. A categoria mostrada no "Dia de cada consultor" (a mais antiga) não muda; a divergência fica anotada no contrato |
| Lead sem achado | Fora quando há filtro | Lovable; a `conta` diz isso por escrito (regra do dono: todo número com a conta e a fonte) |
| `slug`s válidos | Com `FIELD_SEGMENTS_ENABLED` (`LOVABLE_C_FLAGS.segments`, já exportado por `rotas.tokens.ts:72-88` e provido no `RotasModule`): todos os `slug` de `lerSegmentos(app_settings.place_segments)`, **ativos ou não** (lead achado por um segmento hoje desativado continua filtrável). Desligada: os 5 `TIPOS_LUGAR`, com os rótulos no singular do `SEGMENTOS_PADRAO` | Espelha o §36.1. Lê `app_settings` direto (o `PlanosService` já lê, `bruto()`). **Não** importa o `PlacesSegmentsService`: o `RotasModule` continua folha |
| Combinações | `types` com `lead_ids` → `400 VALIDATION_ERROR` "types: escolha os estabelecimentos ou o perfil, não os dois." `types` com `kind ≠ geral` → `400` "types: o perfil vale só para a rota geral." `slug` desconhecido → `400` "types: 'x' não é um perfil de cliente." Formato: `^[a-z0-9_]{2,30}$`, até 40 (`LIMITES_SEGMENTOS.lista`) | Nada de filtro ignorado em silêncio |
| Foto | `params_snapshot.types = [{ slug, label }]` (ou `null`), gravada no plano | "Referências mudam, registros não": renomear um segmento depois não muda o que o plano diz. `get()` faz `CONFIG_DIVISAO.ler(p.params_snapshot)` (`planos.service.ts:437`); conferir no teste que chave desconhecida é ignorada, como `relogio` já é |
| Flag nova | **Não.** É um parâmetro opcional de uma rota que já tem trava (`FIELD_ROUTE_PLANS_ENABLED`), e ausente = hoje | Ligar ou desligar nada muda para quem não manda `types`; produção tem `route_plans` e `segments` ligadas |
| Índice | Nenhum agora. `place_candidates` não tem índice em `lead_id`; o `EXISTS` vira semi-join sobre uma tabela pequena (no máximo 300 achados por busca) | Medir antes de migrar. Se a prévia passar de ~300 ms, migração aditiva `place_candidates (lead_id, category)` com `--create-only` e sem `DROP INDEX` (regra dos índices parciais do `CLAUDE.md`) |

### 4.4 Domínio (puro, testável sem banco): `api/src/domain/perfil-rota-rules.ts`

```text
perfisConhecidos(segmentosLigados: boolean, placeSegmentsRaw: unknown) → { slug, label }[]
    // ligada: lerSegmentos(raw).segmentos (ordem por label, pt-BR)
    // desligada: SEGMENTOS_PADRAO ∩ TIPOS_LUGAR
lerTiposDaQuery(raw?: string) → string[] | undefined
    // "bar, restaurante,," → ['bar', 'restaurante']; vazio → undefined
normalizarPerfis(entrada?: string[] | null, conhecidos)
    → { ok: true, perfis: { slug, label }[] | null } | { ok: false, erro: string }
    // sem repetição; ordem canônica = a de `conhecidos`
    // (mesmo conjunto = mesma foto e mesma chave de cache do web); [] → null
contaPerfil({ n, total, perfis }) → string
    // "38 dos 120 estabelecimentos elegíveis têm o perfil Bar ou Restaurante.
    //  Os outros 82 são de outro perfil ou não têm perfil
    //  (cadastrados à mão, importados ou abertos na visita)."
```

A cláusula do Prisma fica fora do domínio, ao lado de `filtroElegivel` em `api/src/modules/rotas/rotas-plano.ts`:

```text
filtroPerfis(perfis: string[] | null) → perfis?.length ? { place_candidates: { some: { category: { in: perfis } } } } : {}
```

`filtroElegivel` **não muda**: é o `where` do "Dia de cada consultor", da seleção automática e da cadência.

### 4.5 API

- **DTOs** (`api/src/modules/rotas/planos/planos.dto.ts`):
  - `CriarPlanoDto.types?: string[] | null`: `@IsOptional() @IsArray() @ArrayMaxSize(40) @Matches(/^[a-z0-9_]{2,30}$/, { each: true })`, sem inicializador.
  - `PreviaPlanoDto.types?: string`: `@IsOptional() @IsString() @MaxLength(1300)`, separado por vírgula, como `PinosListaQueryDto.codes`
    (`campo/pinos/pinos.dto.ts:23`).
- **Serviço** (`planos.service.ts`):
  - `elegiveis(pracaId, area, agora, perfis: string[] | null)` acrescenta `...filtroPerfis(perfis)` ao `where`.
  - `criar` (`:177`): valida as combinações e o `normalizarPerfis` **antes** de ler leads; grava `types` na foto. `PLAN_NO_LEADS` com perfil diz qual: "Nenhum
    estabelecimento com o perfil Bar ou Restaurante, com localização exata e fora de roteiro publicado nesta área."
  - `previa` (`:267`): com `types`, chama `elegiveis` duas vezes, com e sem filtro, e responde `lead_count` (filtrado), `lead_count_total` (sem o filtro),
    `rotas_min` sobre o filtrado e `conta` com as duas partes. Sem `types`, a resposta de hoje e mais `lead_count_total = lead_count`. São duas consultas de
    até 2.001 linhas cada, só quando há filtro.
  - `resumo` (`:397`): `PlanSummary.types: { slug, label }[] | null` (aditivo; os esquemas zod do web não são `.strict()`).
- **Contrato** (`docs/api-contract.md`, atualizar **antes** do código):
  - §39.5: as linhas de `POST /v1/route-plans` (corpo `types?`) e de `GET /v1/route-plans/preview` (query `types=` e resposta com `lead_count_total`);
    `PlanSummary` com `types`.
  - §39.4 "Elegíveis": a regra do `some`, o lead sem achado e a divergência com a categoria do §23.4.
  - Nota: "sem flag nova; ausente = hoje".

### 4.6 Testes

**Domínio** (`api/src/domain/__tests__/perfil-rota-rules.spec.ts`):

- ausente, `null` e `[]` → todos;
- repetição e ordem canônica;
- `slug` desconhecido → mensagem exata;
- desligada → os 5 com rótulo no singular;
- ligada com a lista salva (incluindo desativado) → conhecido;
- `lerTiposDaQuery` com espaços e vírgulas vazias;
- `contaPerfil` (um e vários perfis, `n = total`, `n = 0`).

**Serviço** (em `api/src/modules/rotas/__tests__/planos-l7.spec.ts` ou num `planos-perfil.spec.ts` ao lado, com o `fake()` de lá):

1. sem `types`, o `where` do `leads.findMany` é **idêntico** ao de hoje (caracterização do argumento: é a prova de "ausente = hoje");
2. com `types`, o mesmo `where` mais `place_candidates.some` e nada mais;
3. `params_snapshot.types` com os rótulos, e `PlanSummary.types` devolvido;
4. `PLAN_NO_LEADS` com o perfil na mensagem;
5. `types` com `lead_ids` → 400; com `kind: 'shoppings'` → 400; desconhecido → 400 (antes de qualquer leitura de lead);
6. prévia com `types`: `lead_count`, `lead_count_total` e `conta`;
7. praça A × B continua isolada (os testes de hoje, intocados);
8. flag desligada → `404 ROUTE_PLANS_DISABLED`, como hoje.

**Integração de verdade** (`api/scripts/smoke-lovable-d.sh`, com as flags ligadas):

- semeia por psql uma busca `done` com dois achados (`bar` e `padaria`) ligados a dois leads da área de teste, mais um lead sem achado;
- prévia sem `types` = 3; `types=bar` = 1 (com a `conta`); `types=bar,padaria` = 2;
- `POST` com `types: ['bar']` → plano com só o lead do bar e `types` na resposta;
- `types: ['nao_existe']` → 400;
- limpa tudo.

**Web** (`web/src/modules/planos/domain/__tests__/planos.test.ts`):

- `previaSchema`/`planSummarySchema` com e sem `types`/`lead_count_total`;
- texto "Perfil: Bar, Restaurante" ou "Todos os perfis";
- chave da consulta da prévia com os `types` em ordem canônica.

### 4.7 Web

- **`DividirRotas`** (`components/praca/DividirRotas.tsx`): chips "Perfil dos clientes", vários, com "Nenhum selecionado = todos os clientes", **só para quem
  opera** (`podeOperar`), porque gerar já é `@GestorOuAdmin`.
  - Opções: com `features.segments`, `useSegmentos(operar)` (`GET /v1/place-searches/segments`, gestor ou admin) passado por `opcoesDeTipo`
    (`modules/places/domain/busca.ts:17`); desligada, os 5 `TIPOS`.
  - A prévia e o "Gerar" mandam `types`, e a `conta` aparece embaixo.
  - A lista de gerações mostra o perfil de cada plano (`PlanSummary.types`), sem precisar da lista de segmentos (a equipe comum não pode lê-la).
- **`usePrevia`** (`modules/planos/application/use-planos.ts:48`): a chave inclui os `types`.
- **`ShoppingsRotas`**: as lojas de dentro vêm com Bar + Restaurante pré-marcados (se ativos), e o resto fica editável.

---

## 5. Plano em etapas (cada uma é um commit ou um grupo pequeno; o app funciona ao fim de cada uma)

Regras de verificação em todas: um processo por vez e com `nice`; `yarn lint` e `yarn typecheck` uma vez no fim da etapa; `npm test -- <arquivos tocados>`
sem nada de pé; `browser-check` com API (`start:smoke`) e web (`yarn dev`), matando os dois depois.

O `browser-check` roda em duas configurações:

- flags dos lotes A–F desligadas: hoje 195 checagens;
- flags ligadas: hoje 244.

E uma vez com `TEAM_COMMERCIAL_ENABLED=true`. As contagens do `CLAUDE.md` são atualizadas na E8.

### E1. Tokens, fontes e fim do botão de tema (só web)

**Arquivos:**

- `web/src/app/globals.css`:
  - `:root` = tokens de `G/src/styles.css:53-92` (azul `oklch(0.52 0.19 258)`, menu `oklch(0.3 0.12 262)`, raio `.75rem`, `--primary-deep`, `--sidebar-*`,
    `--chart-*`, `--gradient-brand`, `--shadow-card`);
  - **sai** o bloco `.light`;
  - `--danger` vira o `--destructive` da Lovable; ficam `--success`/`--warning`;
  - `@utility bg-brand` e `@utility shadow-card`;
  - `card-surface` e `tag` (usados no app inteiro) são redesenhados no estilo Lovable (`rounded-2xl bg-card shadow-card`);
  - sai `.tiles-escuros`;
  - ficam `.simples-chip` e as regras de impressão.
- `web/src/app/layout.tsx`: `next/font/google` com Manrope (texto) e Sora (títulos), nas variáveis do `@theme`; `h1, h2, h3` em Sora com `-0.02em`;
  título "Praça". Sora vai até 800: os `font-black` (900) caem para 800.
- `web/src/app/(app)/ThemeSync.tsx`: **apagar**; tirar do `(app)/layout.tsx`.
- `web/src/components/praca/AppShell.tsx:142-166`: sai o botão "Tema claro/escuro" e o `useUpdateMe`.
- Mapas sem filtro escuro (`dark`/`escuro` → `false`):
  - `MapaSituacao.tsx:22`, `AberturaPraca.tsx:25`, `AreasAtuacao.tsx:38`, `MapaDeCalor.tsx:51`, `DividirRotas.tsx:47`;
  - `campo/RoteiroTela.tsx:124`, `campo/simples/SimplesListaTela.tsx:33`;
  - `lib/map-tiles.ts` mantém a assinatura; o parâmetro morre na E8.
- `web/src/app/campo/layout.tsx:17` e `campo/manifest.webmanifest/route.ts`: cores para o hex do `--primary-deep`; `scope`/`start_url` **iguais**.

**API:** nada. `users.theme` e `PATCH /v1/users/me { theme }` continuam aceitos, só não mandam na tela.

**Testes:** vitest de hoje verde (35 arquivos). `browser-check`: nenhuma checagem de tema (conferido), roda igual; a manifest assertion (linhas 680-681)
continua verde. Capturas de tela desktop e celular para o designer conferir. `acesso.test.ts`: sem mudança.

### E2. Casca da equipe e chave do Comercial

**API (aditiva):**

- `api/src/common/flags/ui.flags.ts` (módulo global: `commercial`, `routes`, `earnings`, `payouts`, `declared_signups`);
- `common/config/env.validation.ts` (`TEAM_COMMERCIAL_ENABLED`, padrão `'false'`), `docker-compose.yml`, `.env.example`, `env-places.spec.ts`;
- `rotas-equipe.controller.ts:82-108` (5 chaves em `features`);
- contrato §33.1 (lista de `features`) e §46 novo, curto: "Casca da Lovable: chave do Comercial, `features` de navegação".
- **Jest:** o teste do `features` do `settings/config` (padrão `false`; com o env, `true`; `payouts` só com `earnings`).

**Web:**

- `modules/acesso/domain/enderecos.ts` (novo): mapa único `ROTA` com os valores **antigos** até a E7, mais `destinoDoRepresentante` (na E2 tudo → `/campo`).
- `modules/acesso/domain/acesso.ts`:
  - `featuresMenuSchema` + `commercial`, `routes`, `earnings`, `payouts`, `declared_signups`;
  - `montarMenu` novo: lista da Lovable e grupo "Comercial";
  - saem `menuDeHoje` e `menuAgrupadoLigado`;
  - `itemAtivo` passa a escolher **o item de prefixo mais longo** (na E2 `/consultores/painel` e `/consultores` convivem);
  - `paginaInicial()` → `ROTA.inicio`.
- `components/praca/AppShell.tsx`:
  - layout de `G/…/route.tsx:89-120`: lateral `bg-sidebar` w-60, "Praça" com o ícone `MapPin` (lucide-react já é dependência);
  - rodapé com nome, e-mail, perfil, "Trocar senha" (a partir da E3) e "Sair";
  - no celular, faixa `bg-brand` e menu horizontal rolável no lugar da gaveta;
  - sino só com `commercial`.
- `app/page.tsx` e `app/entrar/page.tsx`: sem `/hoje` (§2.3).
- `(app)/consultores/painel/page.tsx`: sem o painel, mostra `AtencaoAgora`.
- `configuracoes/page.tsx`: as 3 seções do Comercial atrás de `features.commercial`.
- `CLAUDE.md`: linha da chave.

**`acesso.test.ts`** (substitui o `describe('menu da equipe')`, linhas 29-61):

- admin com `dashboard`, `map_pins`, `routes`, `vouchers`, `earnings` e `payouts`, Comercial desligado → um grupo sem título com
  `['Dashboard','Praças','Clientes','Mapa','Rotas','Representantes','Vouchers','Financeiro','Configurações','Usuários']`;
- gestor e equipe, as mesmas flags → a mesma lista sem `'Usuários'`;
- tudo desligado, admin → `['Dashboard','Praças','Representantes','Configurações','Usuários']`;
- `commercial: true` → 2º grupo `'Comercial'` com `['Funil','Entrada','Buscar estabelecimentos','Mensagens','Campanhas','Calendário','Indicadores','Ações','Freela']`
  para admin e gestor, e sem `'Buscar estabelecimentos'` para a equipe;
- `itemAtivo`: `/consultores/<uuid>` acende só "Representantes" e `/consultores/painel` só "Dashboard";
- `paginaInicial()` = `ROTA.inicio`.

**`browser-check`:**

- bloco do menu (linhas 1126-1137): passa a esperar o link "Praças" (não "Funil"); confere a lista da Lovable conforme `lov.*`; grupo "Comercial" só com
  `lov.commercial`; "Dashboard" sempre;
- linha 900: `'menu tem "Representantes"'`;
- linha 1178 (gestor espera "Buscar estabelecimentos"): só com `lov.commercial`; sem ele, vai para a aba de busca da praça (a partir da E5; até lá, `goto`
  direto `/prospeccao`, que continua abrindo, §2.2);
- linhas 301-311: o destino do login continua `ROTA.inicio`.

### E3. Entrada única, trocar senha e sessões

**API:**

- `auth.controller.ts`: `@Throttle` no login; `POST change-password` com `@Equipe()`;
- `auth.service.ts`: `changePassword`; o `bcrypt` fixo para e-mail inexistente, também em `campo-auth.service.ts`;
- `dto/auth.dto.ts`: `ChangeOwnPasswordDto`;
- contrato §3.
- **Jest:**
  - senha atual errada → `400 WRONG_PASSWORD` (nunca 401);
  - igual → `SAME_PASSWORD`;
  - política ligada e fraca → `WEAK_PASSWORD`; desligada → só 8–72;
  - sucesso troca o hash e responde `{ ok: true }`;
  - o id vem do token (corpo com `user_id` → 400 do `forbidNonWhitelisted`);
  - metadado de throttle no login, no mesmo molde de qualquer teste do campo, se houver; senão um teste de metadado;
  - `permissoes-protecao.spec.ts` cobre a marca sozinho.

**Web:**

- `modules/entrada/domain/entrada.ts` (`decidirEntrada`, `destinoDaSessao`);
- `modules/entrada/domain/trocar-senha.ts` (esquema);
- `modules/entrada/application/use-entrada.ts`;
- `components/entrada/EntradaUnica.tsx`, `components/entrada/TrocarSenhaCartao.tsx`;
- páginas `app/entrar/page.tsx`, `app/campo/entrar/page.tsx`, `app/trocar-senha/page.tsx` (nova), `app/campo/senha/page.tsx` (o esquema inline sai para o
  domínio);
- `modules/auth/infrastructure/auth.api.ts` (`trocarSenha`);
- `(app)/layout.tsx` (hidrata `useCampoSession` e aplica `destinoDoRepresentante`).

**Vitest** (`modules/entrada/domain/__tests__/entrada.test.ts`, `trocar-senha.test.ts`):

- a tabela do §3.2 inteira, linha a linha (incluindo "429 da equipe não tenta o campo");
- `destinoDaSessao` com as 4 combinações de sessão e com `must_change_password`;
- esquema da troca.

**`browser-check`:**

- **o que fica igual:** os logins da equipe (linha 295) e do consultor (linhas 685, 736, 1249, 1521, por `/campo/entrar`), porque o componente é o mesmo e os
  rótulos também;
- **novo:** o consultor entra por `/entrar` e cai em `/campo/senha` ou `/campo`;
- **linhas 713-715:** "consultor não entra nas telas da equipe (volta para /entrar)" vira "consultor que abre endereço da equipe cai na casca dele (`/campo`)";
- **novo:** `/trocar-senha` da equipe com a senha atual errada mostra a mensagem e **não** derruba a sessão. Testar só o caminho de erro, para não mexer na
  senha da conta do seed;
- **novo:** a equipe que abre `/campo` volta para `/inicio` sem laço.

**`acesso.test.ts`:** `destinoDoRepresentante` (na E3, tudo → `/campo`).

### E4. Casca do representante

**Web:**

- `app/campo/(sessao)/layout.tsx` (faixa + `AbasRepresentante`);
- `components/campo/AbasRepresentante.tsx`;
- `components/campo/CampoTopo.tsx` (sem "Sair");
- `modules/campo/application/use-tela.ts` (4 visões + `abaDaTela`);
- `app/campo/(sessao)/page.tsx` (casos novos);
- telas novas:
  - `components/campo/MapaRepresentanteTela.tsx` (`useMapaPinosCampo` + `PinosMapa` + legenda);
  - `ClientesRepresentanteTela.tsx` (até a G5: `RetornosCampo` + busca por nome em `/v1/campo/places?q=`);
  - `DesempenhoTela.tsx` (`EmBreve`);
  - `CarteiraTela.tsx` (`GanhosCard`, `PixCard` e `CadastrosConfirmadosCard`, que saem de `HojeTela`/`SimplesHojeTela`);
- `components/ui/EmBreve.tsx`;
- `destinoDoRepresentante` com a tabela final do §3.3.

**API:** nada (a G5 entra na E5.11).

**Vitest:**

- `modules/campo/application/__tests__/use-tela.test.ts`: ida e volta das 4 visões novas, e **as URLs de todas as visões antigas iguais**;
- `abaDaTela` (barra escondida nas telas de fluxo);
- `acesso.test.ts`: a tabela de `destinoDoRepresentante`.

**`browser-check`:**

- as regexes `/\/campo\?v=…/` não mudam;
- novo: as 5 abas aparecem na Hoje;
- novo, no bloco "sem sinal" (linhas 881-887): "trocar para Carteira sem rede não navega (`?v=carteira`)";
- toda checagem que procure ganhos, Pix ou cadastros confirmados na Hoje clica antes em "Carteira" (conferir na hora; hoje a busca por "Ganhos/Pix" no
  script só achou a tela da equipe, linhas 996-997).

### E5. Telas, uma a uma, no desenho da Lovable (um commit por tela; o desenho fino vem do `-ux.md`)

Em todas: só apresentação sobre os componentes do §1, salvo o que está marcado como API. Nenhum teste `*caracterizacao*` muda. `acesso.test.ts`: sem
mudança (as telas não tocam o menu; os `to` só mudam na E7).

| Sub | Tela | Arquivos principais | API | Testes |
|---|---|---|---|---|
| 5.1 | Dashboard | `PainelGestor.tsx`, `(app)/consultores/painel/page.tsx` | — | vitest de `painel.ts` igual |
| 5.2 | Praças: lista + detalhe | `(app)/pracas/page.tsx` e `(app)/pracas/[id]/page.tsx` (novas; `/praca` continua até a E7), `modules/pracas/domain/status-praca.ts` (status pelas datas e `todaySp`), `ListaClientes` com `pracaId` | **G2** `leads_count` (contrato §6) | jest da contagem; vitest de `status-praca` (borda: início hoje, fim ontem); `browser-check`: lista com cartões e detalhe com a aba "Buscar estabelecimentos" |
| 5.3 | Clientes, Mapa e Mapa de calor | `(app)/consultores/clientes/page.tsx` dividido; Mapa em página própria | G3 opcional | `browser-check` 1139-1149: "Mapa" passa a ser página, não `?modo=` (ajustar na E7 com o endereço) |
| 5.4 | Rotas | `(app)/consultores/roteiros/page.tsx`: abas "Clientes \| Shoppings \| Dia de cada consultor"; abre em **Clientes** com `route_plans` (Lovable), senão "Dia" | — | `browser-check` 1039 e 1095: clicar em "Dia de cada consultor" antes (hoje depende de abrir nela) |
| 5.5 | Representantes | `(app)/consultores/page.tsx` (tabela, busca e filtros da Lovable), `[id]/page.tsx` | G4 opcional | `browser-check` 899-903, 977, 1028-1029, 1055: os links internos "Painel", "Mapa por situação", "Cupons" e "Declarados" saem da página (estão no menu) → as checagens passam a olhar o menu ou o Financeiro |
| 5.6 | Vouchers | `CuponsEquipe.tsx`, `(app)/consultores/cupons/page.tsx` | — | `browser-check` 1056: título "Vouchers" |
| 5.7 | Financeiro | `PagamentosEquipe.tsx` (cartões Total a pagar / Já pago / Pendente sobre `summary`), `(app)/consultores/pagamentos/page.tsx` | — | vitest de `pagamentos.ts` |
| 5.8 | Usuários | `(app)/usuarios/page.tsx` (novo, com `Pessoas` movido), `modules/acesso/domain/cadastro.ts` (gerador de senha que cumpre a regra mais forte, mostrado uma vez) | — (`PUT /v1/users/:id/password` de hoje) | vitest do gerador (1.000 amostras cumprem a política); `browser-check` 538 e 951: Pessoas mudou de página |
| 5.9 | Configurações | `configuracoes/page.tsx` (Segmentos no topo) | — | `browser-check` 1077 e 1151 |
| 5.10 | Desempenho (equipe) | `(app)/desempenho/page.tsx` (`EmBreve`) | — | — |
| 5.11 | Representante: Hoje com calendário e Clientes | `HojeTela`/`SimplesHojeTela` (saudação + calendário de `GET /v1/campo/routes`), `ClientesRepresentanteTela` | **G5** `GET /v1/campo/map/list` (se D3 = rota nova; contrato §34.7) | jest de isolamento A × B e da praça ativa (§44.4); `browser-check`: aba Clientes com a flag `map_pins` |
| 5.12 | Roteiro e visita (restyle) | `RoteiroTela`, `VisitaTela`, `ResultadoTela`, `ResumoDiaTela`, `ChecklistVisita`, `Cronometro` | — | `caracterizacao-completo.test.ts` (web) e os `*caracterizacao*` da API **intocados** |

### E6. Filtro "Perfil dos clientes" (§4)

1. Contrato (§39.4, §39.5).
2. `domain/perfil-rota-rules.ts` + spec (TDD).
3. `rotas-plano.ts` (`filtroPerfis`).
4. DTOs.
5. Serviço + spec.
6. `smoke-lovable-d.sh`.
7. Web: `planos.ts`, `use-planos.ts`, `DividirRotas.tsx`, `ShoppingsRotas.tsx` (pré-marcação).

**`browser-check`** (só com `route_plans`), no bloco "Dividir em rotas":

- marcar "Bar" muda a prévia, e a requisição leva `types=bar`;
- "Gerar" → o plano mostra "Perfil: Bar";
- o teardown arquiva o plano, como o bloco já faz.

`acesso.test.ts`: sem mudança.

### E7. Endereços da Lovable e redirecionamentos

**`git mv`** (com `[id]` junto):

- `(app)/consultores/painel` → `(app)/inicio`
- `consultores/clientes` → `clientes`
- `consultores/mapa` → `mapa`
- `consultores/calor` → `mapa/calor`
- `consultores/roteiros` → `rotas`
- `consultores/cupons` → `vouchers`
- `consultores/pagamentos` → `financeiro`
- `consultores/declarados` → `financeiro/declarados`
- `consultores/[id]` → `representantes/[id]`
- `consultores/page.tsx` → `representantes/page.tsx`
- remover `(app)/praca` (a abertura já vive em `/pracas/[id]`, E5.2)

**`next.config.ts`:** `redirects()` da tabela do §3.4, vinda de `modules/acesso/domain/redirecionamentos.ts` por caminho relativo.

**Constantes:** `ROTA` com os valores novos.

**Links fixos a trocar** (≈ 70 ocorrências, levantadas nesta data):

- `acesso.ts` (17);
- `consultores/page.tsx` (8);
- `consultores/clientes/page.tsx` (4);
- `PainelGestor` (3);
- `MapaDeCalor`, `EquipeAtencao`, `AppShell` e `consultores/mapa` (2 cada);
- 1 cada em `RoteirosEquipe`, `BuscaEstabelecimentos`, `indicadores`, `hoje`, `funil`, `entrada`, `campanhas`, `calendario`, `configuracoes`, `roteiros`,
  `painel`, `pagamentos`, `declarados`, `cupons`, `calor`.

**Ficam:** `ConsultorDialog` (`/campo/entrar` continua válido) e `campo-http.ts`.

**Vitest** (`modules/acesso/domain/__tests__/redirecionamentos.test.ts`):

- todo endereço antigo tem destino;
- nenhum destino é origem de outra regra (sem cadeia);
- a regra com `modo=mapa` vem antes de `/consultores/clientes`;
- as estáticas vêm antes de `/consultores/:id`;
- todo destino está na lista de rotas do app (`ROTA`).

**`acesso.test.ts`:** as expectativas de `to` (se houver) passam a usar `ROTA.*`.

**`browser-check`:**

- trocar os `goto` e `waitForURL`:

  | Linhas | De | Para |
  |---|---|---|
  | 374 | `/praca` | `/pracas` |
  | 899, 976, 1027, 1053, 1157, 1180 | `/consultores` | `/representantes` |
  | 903, 1013, 1512 | `**/consultores/${id}` | `/representantes/${id}` |
  | 980 | | `**/financeiro/declarados` |
  | 303, 1030, 1073, 1176 | `**/consultores/painel` | `**/inicio` |
  | 1039, 1095, 1183 | | `/rotas` |
  | 1043 | | `/mapa` |
  | 1056 | | `/vouchers` |
  | 1139, 1144, 1149 | | `/clientes` e `/mapa` (com a página do mapa, não `?modo=`) |

- o `goto` de `/hoje` (linha 308) e os do Comercial ficam;
- **bloco novo** "endereços antigos": `fetch(BASE + antigo, { redirect: 'manual' })` para cada linha da tabela → 307 e `Location` certo (sem abrir página,
  então sem 404 no vigia).

### E8. Verificação

1. `yarn lint` (a lint de `localStorage` já derrubou um build da Vercel).
2. `yarn typecheck`.
3. `yarn test`.
4. `npm run typecheck` e o `npm test` das suítes tocadas: planos, auth, rotas-config, pracas, pinos e permissões (um de cada vez).
5. `smoke.sh` e `smoke-lovable-d.sh` (+ `-e`, pelo login).
6. `browser-check` nas duas configurações e uma vez com o Comercial ligado.
7. Limpeza: o parâmetro `dark` de `tilesOptions` e os `dark=` mortos.
8. `CLAUDE.md`: novas contagens, as regras de URL e sessão do §3, a chave do Comercial e "consultor mora em `/campo`".
9. Capturas desktop e celular de cada tela para o Denner.

### E9. Prévia na Vercel → Denner aprova → subida

API primeiro (sem migração; rollback = imagem anterior), depois o web (`vercel deploy --prod` por cópia). Conferir `git status` antes do `rsync`: um
formatador externo reformata arquivos da API de madrugada.

---

## 6. Riscos e como mitigar

| Risco | Mitigação |
|---|---|
| **`browser-check` quebrar a cada etapa** (URLs, nomes de link, abas que abrem, contagens 195/244) | Cada etapa lista as linhas que muda (§5). Rodar as duas configurações no fim de cada etapa que mexe em tela. A E7 ganha um bloco que prova os redirecionamentos sem navegação |
| **Vídeos tutoriais** (`~/Downloads/praca-tutorial-*.mp4`, `praca-novidades.mp4`) com URLs e design antigos | Os endereços antigos redirecionam (307), então os vídeos não levam a 404. O visual muda inteiro: regravar com os scripts de `freela/exports/video-praca/` (LEIA-ME) depois da subida, contra o banco local com dados fictícios, como da outra vez |
| **Atalho do consultor (PWA)** com `scope: '/campo'` | Opção A (§3.4): o consultor fica em `/campo`; `/campo/entrar` e `/campo/senha` continuam páginas; manifest sem mudança de escopo. Só as cores mudam (afeta instalação nova). Não há service worker no projeto (conferido), então não há cache de app a invalidar |
| **iOS saindo do escopo** na entrada ou na troca de senha | Coberto pelo item acima: os dois destinos ficam dentro de `/campo` |
| **Cache da Vercel e abas abertas na versão velha** | Redirecionamentos só valem a partir do deploy novo. Navegação de cliente numa aba antiga pode buscar RSC de rota que mudou de nome; o Next recarrega a página inteira (sem perda de dado). 307 em vez de 308 evita cache permanente de um nome provisório |
| **Duas sessões no mesmo aparelho** | Login limpa a outra; estado antigo convive (§3.3). A fila do consultor nunca é apagada pela entrada |
| **Throttle novo no login da equipe derrubar smoke ou `browser-check`** | Contar os logins por minuto antes; se passar de 20, usar 30. `TRUST_PROXY` em produção |
| **Token da equipe vale 12 h depois de trocar a senha** | Anotado (D2). Igual a hoje com o `PUT`; resolver junto com `must_change_password`/`token_version` numa leva própria |
| **Menu piscando enquanto `features` carrega** (itens com flag aparecem depois) | Já é assim hoje; `staleTime` de 5 min (`use-acesso.ts:13`); os itens fixos (Dashboard, Praças, Representantes, Configurações) seguram o layout |
| **Abrir `/pracas/[id]` muda a praça ativa** (`active_praca_id`) | É o conceito de hoje, que outras telas leem; dito na tela ("praça ativa: X"). Alternativa (passar `praca` por prop a todos) fica para quando alguém reclamar |
| **Fontes** (Sora sem peso 900; `next/font` baixa no build da Vercel) | Designer revê os `font-black`; o build já faz isso com Inter e Montserrat hoje |
| **`next.config.ts` importando TS** | Caminho relativo, sem `@/`; módulo sem dependências |
| **Formatador externo de madrugada na API** | `git status` antes de subir (já é rotina) |
| **Segmento "achado como dois perfis"** conta nos dois | Escrito na `conta` e no contrato; é o comportamento mais inclusivo e coerente com "algum achado" |

---

## 7. Decisões que precisam do usuário (padrão assumido entre parênteses)

1. **D1. Endereço do representante.**
   - A: fica em `/campo?v=mapa` etc., e os links da Lovable levam para lá.
   - B: os mesmos `/mapa`, `/clientes`…, com reinstalação do atalho em todos os celulares.
   - *(A.)*
2. **D2. Senha provisória com troca obrigatória para a equipe** (o "Redefinir senha" do `/usuarios` da Lovable). Pede `users.must_change_password`, o guard
   com 403 e `token_version`, para a troca derrubar o token. *(Fica para uma leva própria; nesta, o admin gera, mostra uma vez e a pessoa troca quando
   quiser.)*
3. **D3. Clientes do representante.**
   - Rota nova `GET /v1/campo/map/list` (os dele, com situação).
   - Ou "Retornos + busca por nome".
   - *(Rota nova, atrás da trava do mapa.)*
4. **D4. Endereço direto do Comercial com a chave desligada.**
   - Abre normalmente, sem item no menu.
   - Ou mostra "área desligada".
   - *(Abre.)*
5. **D5. Aba "Desempenho" do representante.**
   - "Em construção", como na Lovable, com atalho para "Resultado do seu dia".
   - Ou já com os números da meta e do resumo.
   - *(Em construção + atalho.)*
6. **D6. Aba que abre em Rotas.** "Clientes" (Lovable) ou "Dia de cada consultor" (a de hoje). *(Clientes, quando os planos estão ligados.)*

## 8. Fora do escopo (e por quê)

- **Tudo da regra 6:** Google, `bootstrapAdmin`, `@praca.local`, pagamento sem ledger, UTC, gestor e a senha de admin.
- **Status do cliente e da praça à mão:** apagaria a trilha. O status vem da visita e das datas.
- **"Solicitar voucher" pela equipe com cliente livre:** fato do §38.
- **Período livre no Financeiro:** razão semanal.
- **Excluir geração de rotas:** nós arquivamos.
- **Trocar o token da equipe para cookie `httpOnly`:** hoje mora em `localStorage`, que é a convenção do workspace. É mudança de segurança à parte, com ADR
  própria.
- **Bloquear a API do Comercial:** o lead é comum ao campo e às cadências.
