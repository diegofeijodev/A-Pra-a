# Registro da execução — consultores de campo (bloco A): decisões tomadas e pendências menores adiadas
Spec: docs/superpowers/specs/2026-10-08-consultores-de-campo-design.md (aprovado 08/10)
Branch: feat/consultores-de-campo (criada a partir de master 923499d). Repo sem remote.
Ruling: execução numa branch no mesmo checkout, não em worktree — worktree exigiria npm/yarn install de novo na máquina do dono (7,6 GB, trava) — custo se errado: nenhum além de não poder trabalhar em master em paralelo.
Ruling: Tasks 11–13 do plano foram escritas pelo controlador (o agente do plano foi parado pelo usuário após a Task 10) — custo se errado: interfaces das 11–13 podem divergir das 1–10; o pre-flight confere.

## Pre-flight (tabela em preflight.md — 19 achados) — rulings
Ruling: M1 (T3) `PhotoStorage.put(key, bytes, mime)` com 3 args em TODAS as implementações (spec §10 define a interface assim); o disco ignora o mime — custo se errado: nenhum.
Ruling: M2 (T6) `PlacesService.list` vira `async` (erro sempre como rejeição) — custo: nenhum.
Ruling: M3 (T6) o teste de `saveAnswers` em visita fechada usa um UUID válido como ref (não 'v1') — custo: nenhum.
Ruling: M4 todas as dependências novas com versão EXATA (`yarn add --exact`, `npm install --save-exact`) — Global Constraints.
Ruling: M5 (T11) o rascunho pendente do questionário é gravado na fila ao desmontar a tela/trocar de tela (flush no cleanup), não só pelo debounce — custo se errado: rascunho perdido = checkout bloqueado no campo.
Ruling: M6 docker-compose.yml declara TODAS as variáveis novas (FREELA_WEB_URL, CAMPO_JWT_EXPIRES_IN, PHOTO_STORAGE, PHOTOS_DIR, S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) — regra do README ("flag nova precisa estar declarada no compose"); feito na T13 e incluído no git add; T3 não deve afirmar que o compose já declara — custo: nenhum.
Ruling: M7 (T10/T11) telas do consultor SEM navegação de servidor: nova visita, visita aberta e QR viram VISÕES client-side da rota `/campo`, trocadas por `window.history.pushState/replaceState` (Next 15 integra com useSearchParams sem ida ao servidor) com `?v=nova`, `?v=visita&ref=<client_id>`, `?v=qr`; as rotas `/campo/visita/nova`, `/campo/visita/[ref]`, `/campo/qr` NÃO são criadas; componentes `NovaVisita`, `VisitaAberta`, `QrTela` em `web/src/components/campo/`; o browser-check usa esses endereços — porque navegação do App Router busca o payload no servidor e falha sem sinal, e o spec §9 exige uso sem sinal — custo se errado: retrabalho de rotas (URLs internas do celular, sem impacto externo). Limitação conhecida (não no spec): recarregar a página SEM sinal não abre (sem service worker) — deferred.
Ruling: M8/M19 (T11/T12) nada de `check('…', true)`: assertivas reais (`isVisible()`/`waitFor` + `src` começa com `blob:`), e a contagem da foto vem depois de `waitFor` da própria imagem.
Ruling: M9 (T12) reusar `hora`/`duracaoMin` de `web/src/modules/campo/domain/formatos.ts`; sem `fmtBR`.
Ruling: M10 tasks de API (T2–T7) terminam com `npm run typecheck` uma vez, sozinho (Global Constraints).
Ruling: M11 (T5) o teste "closeStale não filtra consultor inativo" ganha de fato um consultor inativo.
Ruling: M12 (T13) README/CLAUDE.md atualizam contagens (testes, smoke, browser-check) com os números REAIS da verificação final e a permissão CONSULTANTS na seção do Freela.
Ruling: M13 File Structure incompleto — só documentação do plano; sem ação.
Ruling: M14 trailer de commit fica "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" (atribuição desta sessão) em todos os commits — custo: rótulo de autoria impreciso em commits feitos por subagentes de outro modelo.
Ruling: M15 (T1) §20.9 do contrato lista as 17 decisões do plano, não só 7.
Ruling: M16 sem duplicação: `isUuid` de `api/src/common/ids` (não UUID_RE próprio), `COM_PRACA` definido uma vez e importado, import de `./photo-storage` uma vez por arquivo.
Ruling: M17 (T12) `pontos` do mapa com `useMemo` no detalhe (deps estáveis); mapa não é recriado a cada render.
Ruling: M18 (T6) `GET /v1/campo/places?lat&lng` e `/places/similar` exigem jornada aberta (`409 NO_OPEN_JOURNEY`) — spec §11/§20.8: localização só com jornada aberta; `?q=` (sem posição) continua livre — custo: consultor não procura "perto" sem iniciar a jornada (é o fluxo esperado).
Task 1: dispatched (BASE 923499d, implementer a61f9fb7e456e4ebc, sonnet)
Task 1: implementer DONE 4e32772; review dispatched (ad2c244d882e08c39)
Task 1: ⚠️ resolvidos pelo controlador — `../common/ids/uuid` é o caminho usado no resto do repo (não há barrel); trailer confere (Opus 5.5).
Task 1: minor (deferred): nomeParecido aceita metade das palavras ("Dona Lúcia" × "Dona Maria") — só marca possible_dup.
Task 1: minor (deferred): faltam testes de borda (200 m exato, caixaEnvolvente fora do equador, carimbo entre os dois pisos).
Task 1: minor (deferred): schema.prisma relações sem alinhamento (prisma format não rodado de propósito).
Task 1: minor (deferred): migration.sql aponta para aviso no CLAUDE.md que só nasce na T13 — conferir na T13.
Ruling: TodayView.journey = a jornada ABERTA do consultor (null sem jornada aberta); `journeys` = as do dia; `/places?lat&lng` exclui arquivados como `?q=` — o contrato não dizia; é o comportamento que a tela (montarDia) já supõe — custo: baixo, ajuste de consulta.
Task 1: complete (commits 923499d..4e32772, review clean)
Task 2: dispatched (BASE 4e32772, implementer a961579edf784bb7a, sonnet). Ruling: COM_PRACA único em api/src/modules/campo/campo-prisma.ts (T4 importa)
Task 2: implementer DONE_WITH_CONCERNS a7f455d (sem boot da API; throttle do login não testado)
Task 2: review dispatched (a624e8dc99c44b352, opus, com checagem de boot)
Task 2: ⚠️ trailer conferido pelo controlador (Opus 5.5). Boot ao vivo OK (revisor): DI, @Public, 401 cruzados.
Task 2: minor (deferred): login sem hash fictício → tempo revela e-mails existentes (igual ao login da equipe).
Task 2: minor (deferred): nenhum teste prende @Public/@AllowPendingPassword nos controllers reais (só no boot/smoke).
Task 2: minor (deferred): faltam testes de token sem `tv`, assinatura ruim/expirado; trim/lowercase do e-mail não asserido.
Task 2: minor (deferred): CAMPO_JWT_EXPIRES_IN aceita qualquer string (valor ruim = 500 no login, não falha no boot).
Task 2: minor (deferred): MaxLength(72) conta caracteres, bcrypt corta em 72 bytes (igual ao repo).
Task 2: complete (commits 4e32772..a7f455d, review clean)
Task 3: dispatched (BASE a7f455d, implementer af9687b2765526663, sonnet)
Task 3: implementer DONE 5d3cad4
Task 3: review dispatched (aad342db7c5597019, sonnet)
Task 3: ⚠️ trailer conferido (Opus 5.5).
Task 3: minor (deferred): S3 get/remove deixam erro bruto do SDK virar 500 (put mapeia 502 PHOTO_STORAGE_ERROR) — T6/T7 podem tratar no chamador.
Task 3: minor (deferred): IAM precisa de s3:ListBucket, senão chave ausente vira 403/500 em vez de null — nota de deploy (README T13).
Task 3: minor (deferred): corrida rmdir×put no disco (só dev); factory relê process.env (escolha do plano).
Task 3: complete (commits a7f455d..5d3cad4, review clean)
Task 4: dispatched (BASE 5d3cad4, implementer ae9bcd821b497a9b9, sonnet)
Task 4: implementer DONE 0ee53a3 (RED só do freela-client; demais specs escritas antes, sem RED executado)
Task 4: review dispatched (a574bdfd26d4b0e09, sonnet)
Task 4: review → Needs fixes (Important: corrida de único — create devolve CONFLICT em vez de EMAIL_IN_USE/CPF_IN_USE; update sem P2002 → 500). Fix round 1 enviado ao implementador (FIX_BASE 0ee53a3).
Task 4: minor (deferred): retry do Freela sem back-off para erros ≠ e-mail duplicado (até 20 a cada 2 min, para sempre).
Task 4: minor (deferred): retry de consultores depende de FREELA_SYNC_ENABLED (documentar no README).
Task 4: minor (deferred): trocar praça/telefone não atualiza o consultor no Freela (cidade/UF só na criação).
Task 4: minor (deferred): testes — retryPending reafirma o where; falta asserir que GET/lista omitem password_hash; foto órfã se visita entra entre leitura e delete.
Task 4: fix round 1 implementado f870c27; re-review dispatched (a6a739125c94c0a51, haiku)
Task 4: fix round 1/5 (1 addressed, 0 open — corrida de único → EMAIL_IN_USE/CPF_IN_USE em create/update; commits 0ee53a3..f870c27)
Task 4: minor (deferred): P2002 sem meta.target cai no CONFLICT genérico (re-checar emailLivre/cpfLivre seria o endurecimento).
Task 4: complete (commits 5d3cad4..f870c27, review clean)
Task 5: dispatched (BASE f870c27, implementer a5ac3437b95b2ea3e, sonnet)
Task 5: implementer DONE 8f312f1
Task 5: review dispatched (a630afa3e927316a2, sonnet)
Task 5: ⚠️ trailer conferido; typecheck do relatório (implementador) aceito.
Task 5: minor (deferred): addPoints/end não rodam closeStale (jornada velha pode receber pontos se o cron falhar).
Task 5: minor (deferred): closeStale sem isolamento por jornada (uma falha aborta as demais e o today/start).
Task 5: minor (deferred): reenvio do end devolve até jornada auto_closed; start offline de ontem nasce com day=ontem e fecha logo.
Task 5: minor (deferred): VISIT_OPEN×end não atômico (janela mínima); accepted pode contar a mais sob corrida; teste "inativo" prova só o where; ramo P2002 com client_id diferente sem teste.
Task 5: complete (commits f870c27..8f312f1, review clean)
Task 6: dispatched (BASE 8f312f1, implementer a9ba019074882d92e, sonnet). Ruling: rota de foto mapeia falha do storage para 502 PHOTO_STORAGE_ERROR (fecha minor da T3 no chamador)
Task 6: implementer DONE df3ff09
Task 6: review dispatched (a25dc777aa35eecc8, opus)
Task 6: review (opus) → Needs fixes: 2 Important plan-mandated — (1) Cache-Control 24h via @Header vale também para 404/502/503 da foto; (2) similar() corta 10 mais próximos ANTES de comparar nome → duplicado silencioso.
Ruling: Task 6 Important #1 e #2 (plan-mandated) entram no fix round — o spec manda "todo nome parecido a até 100 m" e a 502 é transitória; o plano errou no código — custo se errado: nenhum (correções pequenas).
Ruling: contrato contradiz o status do reenvio (§20.3 tabela 201 × §20.9 #4 "200"): POST que cria (journeys/start, visits) devolve 201 também no reenvio; checkout/end devolvem 200 — corrigir o texto do §20.9 #4 no mesmo fix round — custo: nenhum (a fila aceita qualquer 2xx).
Task 6: minor (deferred): busca ?q= carrega todos os leads da praça (sem take); near faz take 500 antes de ordenar por distância (plan-mandated).
Task 6: minor (deferred): new_place como array JSON passa no ValidateNested e vira 500 (sem efeito colateral) — adicionar @IsObject.
Task 6: minor (deferred): Length(2,120) do nome antes do trim; arquivo extra bufferizado antes do 400; remove() órfão silencioso sem log.
Task 6: minor (deferred): checkout lê o estágio do lead fora da transação (pode sobrescrever 4→3); saveAnswers update incondicional após checar fechado.
Task 6: minor (deferred): faltando() usa todaySp(agora) e o CRM usa todaySp(at) — checkout da fila 23:5x entregue 00:00–00:05 com retorno "hoje" toma 422 (plan-mandated).
Task 6: minor (deferred): ramos sem teste (perdedor encontra auto_closed, P2002 mesmo client_id, falha não-P2002 remove foto, FST_FILES_LIMIT, campo de arquivo inesperado, confirm_new inválido, saveAnswers em auto_closed); Swagger sem @ApiBody.
Task 6: minor (deferred, produto): checkout 1/2→3 não limpa reheat_at nem encerra cadência ativa (lead visitado ainda pode receber mensagem automática) — mesmo gap do motor existente; levar ao dono.
Task 6: fix round 1 enviado (FIX_BASE df3ff09).
Task 6: fix round 1 implementado 0ad69bb; re-review dispatched (ae5c77db16b690b2b, sonnet)
Task 6: fix round 1/5 (3 addressed, 0 open — cache da foto só no sucesso; similar sem corte prematuro; §20.9 #4 201/200; commits df3ff09..0ad69bb)
Task 6: complete (commits 8f312f1..0ad69bb, review clean)
Task 7: dispatched (BASE 0ad69bb, implementer a74869471cd3189d7, sonnet)
Task 7: implementer DONE fc0ab89 (lerFotoOuFalha compartilhado em photo-storage.ts, refatorou VisitsService.photo).
Ruling: canais repetidos (sem diferenciar maiúsculas) são DEDUPLICADOS no PUT, não 400 — corrige minha instrução ao implementador; o teste do plano espera dedupe e o contrato "sem repetir" descreve a lista gravada — custo se errado: admin não recebe erro ao repetir um canal (a lista sai certa).
Task 7: review dispatched (a02b265a60c64752b, sonnet)
Task 7: ⚠️ trailer conferido; guard da equipe em /v1/consultores é o JwtAuthGuard global (T2) + @AdminOnly existente; HTTP real fica para o smoke (T8).
Task 7: minor (deferred): reformatação (prettier) de linhas não relacionadas em visits/consultores/photo-storage misturada ao commit.
Task 7: minor (deferred): @Length(1,80) do DTO roda antes do trim (canal de 79 + espaços → 400); checagem de 80 no service é redundante.
Task 7: minor (deferred): faltam testes — day() de consultor inexistente → 404; ordem de rotas/403/cache em nível de controller.
Task 7: complete (commits 0ad69bb..fc0ab89, review clean)
Task 8: dispatched (BASE fc0ab89, implementer ad36d2f134ad16ba1, sonnet)
Task 8: implementer DONE_WITH_CONCERNS d5b06ba — smoke 857 ok/1 fail (2 rodadas idênticas, sem resíduo); jest 43/627; typecheck ok.
Ruling: a falha "nome da campanha é o mesmo do gerenciador" (espera -Out26, banco local semeado em set → -Set26) é PRÉ-EXISTENTE e depende da data do seed, fora do escopo; NÃO ressemear o banco local sem o dono pedir — custo: a verificação final reporta 1 falha conhecida e explicada.
Task 8: review dispatched (a9480f160e4b6450b, sonnet)
Task 8: review → Needs fixes (Important: reenvios sem asserir status 201/200). Fix round 1 enviado (FIX_BASE d5b06ba).
Task 8: minor (deferred): limpeza do campo sem trap (Ctrl-C deixa consultor/lead; a checagem de resíduo pega na próxima); desativar só testado no login (token válido de consultor desativado não exercitado no smoke — coberto por unidade na T2); checagem de foto no disco com caminho relativo; checagem depende do nome do seed "Bar do Mercado"; 400/403 de alguns erros sem asserir status.
Task 8: fix round 1 implementado b92e4aa (857/1 conhecida, 2 rodadas); re-review dispatched (ac71c522bf358ed5a, haiku)
Task 8: fix round 1/5 (1 addressed, 0 open — status 201/200 dos reenvios asseridos; commits d5b06ba..b92e4aa)
Task 8: complete (commits fc0ab89..b92e4aa, review clean)
Task 9: dispatched (BASE b92e4aa, implementer aa9efb934a9a677f5, sonnet)
Task 9: sessão anterior caiu com o implementador no meio (trabalho sem commit; API+next dev mortos pelo controlador); implementador retomado com o estado da árvore
Task 9: implementer DONE 67f8e1a (browser-check 110/110; lint 2 warnings de variáveis que T10/T11 usam)
Task 9: review dispatched (a9b04f9d0d2ce9d0b, sonnet)
Task 9: ⚠️ trailer conferido.
Task 9: minor (deferred → carregado para T10): 403 PASSWORD_CHANGE_REQUIRED sem ramo no campo-http (plan-mandated); removeItem sem try/catch; safe-area iOS (viewportFit cover) sem padding; signIn de outro consultor não limpa retratos/cache.
Task 9: minor (deferred): a11y (aria-invalid/describedby, botão Sair < 44px); sem listener de storage multi-aba; lacunas do browser-check (sem sessão → /campo/entrar, 401, senha errada, tamanhos 180/512); form de entrar pisca 1 quadro antes do redirect.
Task 9: complete (commits b92e4aa..67f8e1a, review clean)
Ruling: T10 implementa a navegação client-side (M7): `(sessao)/page.tsx` vira roteador de visões por `?v=` (useSearchParams dentro de <Suspense>), helper `irPara()` em `web/src/modules/campo/application/use-tela.ts` com window.history.pushState/replaceState; conteúdo da tela de hoje em `web/src/components/campo/HojeTela.tsx`; "Nova visita"/"Continuar visita"/"QR code" chamam irPara; visões nova/visita/qr entram na T11 (na T10 ficam como componentes mínimos que a T11 substitui) — custo: estado intermediário entre T10 e T11 dentro da branch.
Task 10: dispatched (BASE 67f8e1a, implementer ad6947ed5f9b394ac, sonnet) com ruling M7 (use-tela.ts, HojeTela, placeholders NovaVisitaTela/VisitaTela/QrTela) + minors da T9
Task 10: implementer DONE fdb2696 (vitest 47, browser-check 119/119; chave nova campoUltimoConsultor)
Task 10: review dispatched (a91de68c20d525811, opus)
Task 10: review (opus) → Needs fixes: Important #1 (plan-mandated) item recusado derruba os dependentes (checkin recusado → answers/checkout viram 404 e somem; checkout 422 deixa visita aberta → próximo checkin 409 → visita inteira perdida); #2 (plan-mandated) pendência some da tela antes do /today atualizar (botão Iniciar volta → 2º toque → 409); #3 consultor lido uma vez por drenagem (troca de conta no meio manda itens de A com token de B).
Ruling: T10 #1 — (a) API: completude do checkout usa o dia do `at` aceito (todaySp(at)), não o dia de recebimento (fecha o 422 da madrugada; minor da T6); (b) checkin recusado → remove ele e os itens da mesma visita, UMA mensagem "Visita em <lugar> não foi registrada: <motivo>"; (c) checkout recusado 422 → NÃO remove: fica `bloqueio` (mensagem), a fila para nele e mostra "Checkout de <nome> precisa de você"; ao enfileirar respostas dessa visita, o checkout vai para depois delas e o bloqueio sai; outros recusos do checkout (409 AUTO_CLOSED/404) → remove + 1 mensagem; (d) respostas enfileiradas com checkout pendente da mesma visita → checkout reposicionado depois — porque spec §9 "o que já foi preenchido não se perde" e a ordem checkin→respostas→checkout é invariante — custo: lógica a mais na fila (testada por unidade).
Ruling: T10 #2 — `aoEnviar` espera o refetch de ['campo','today'] antes de recarregar a fila (pendência só some quando o retrato do servidor já a contém).
Ruling: T10 #3 — conferir o consultor da sessão a cada passada da drenagem; mudou → para ('sem_sessao').
Ruling: minors da T10 que o spec §9/§7 exige entram no mesmo round: ponto em voo após "Encerrar" é cancelado e `points` recusado é descartado sem faixa vermelha; evento `online` zera a espera (reenvia já); IndexedDB resolve escrita no `oncomplete` da transação e reabre a conexão em onclose/onversionchange — custo: round maior.
Task 10: minor (deferred): erro não-Axios tratado como rede (cabeça presa para sempre); sem lock entre abas (navigator.locks); montarDia não filtra por dia / pendente só de rascunho; useDia sem estado de erro; estado da fila (erros/pausada) não zera na troca de conta sem reload; AvisoGps fora da vista com lista longa; "Voltar" dos placeholders empilha histórico; nits (comentário truncado HojeTela:18, import fora do grupo, console.log na coluna 0); visibilidade da página não checada no rastreio.
Task 10: fix round 1 enviado (FIX_BASE fdb2696).
Task 10: fix round 1 implementado 44890e6 (vitest 57, jest visits 28, browser-check 119)
Task 10: re-review dispatched (a652bfaa3dfe870d3, opus)
Task 10: fix round 1/5 (3 de 4 addressed, 1 com quebra nova — reposicionar o checkout para o fim deixa itens posteriores passarem na frente (checkin v2 → 409 → visita v2 perdida; end → 409); commits fdb2696..44890e6)
Ruling: reposição correta = reanexar [respostas novas, checkout, e TODOS os itens que estavam atrás dele] na ordem original, numa transação só (fecha também a janela não atômica); cascata do checkin relê a fila depois da falha (pega itens enfileirados durante o upload); faixa do checkout bloqueado mostra "parado" (não "enviando…"), tem botão "Abrir visita" (irPara visita&ref) e "Descartar este checkout" com confirmação (válvula de escape se a visita não puder ser corrigida) — custo: mais UI na faixa; descartar deixa a visita aberta até o fechamento da meia-noite.
Task 10: minor (deferred): cada item drenado custa um refetch serial do /today (inclusive lotes de pontos); piscada residual se o refetch falhar.
Task 10: fix round 2 enviado (FIX_BASE 44890e6).
Task 10: fix round 2 implementado 3155077 (vitest 61; browser-check 119; um vitest estourou memória durante o RED por laço no teste — corrigido)
Task 10: re-review round 2 dispatched (abd010070ba645e87, opus)
Task 10: fix round 2/5 (4 addressed, 0 open — reposição atômica na ordem original, cascata relê a fila, faixa parado/Abrir visita/Descartar; commits 44890e6..3155077)
Ruling: "Descartar este checkout" com checkin/end enfileirados atrás → o confirm AVISA que as visitas/encerramento seguintes podem ser recusados (não bloqueia o botão) — feito na T11 junto com a tela da visita — custo: o consultor ainda pode perder a visita seguinte se confirmar.
Task 10: minor (deferred): teste 'itens antes do checkout não se mexem' com guarda sempre-verdadeira e sem conferir tentativas/proxima_em zerados; `void descartar()` sem catch; janela estreita de 2ª mensagem na cascata.
Task 10: complete (commits 67f8e1a..3155077, 2 fix rounds, review clean)
Task 11: dispatched (BASE 3155077, implementer aefb2ed32002d3aa8, sonnet) — rulings: visões em vez de rotas, flush do rascunho ao sair, tela da visita mostra bloqueio e 'Salvar correções', aviso no Descartar, sem check(true), qrcode.react exato
Task 11: implementer DONE 5a0ec70 (vitest 75, browser-check 130/130, lint 0 warnings)
Task 11: review dispatched (aee68d833166dc946, opus)
Task 11: review (opus) → Needs fixes: CRITICAL VisitaTela sem key → trocar de visita sem remontar leva as respostas digitadas da visita B para a A (CRM errado); Important #1 auto-save com checkout bloqueado tira o bloqueio, a visita parece fechada e o formulário trava a cada pausa; #2 useFotoUrl recria a URL a cada recarga da fila; #3 (plan-mandated) "Novo estabelecimento" trava com conexão fraca ou start ainda na fila (similar 30 s / 409 NO_OPEN_JOURNEY).
Ruling: Critical → `<VisitaTela key={tela.ref} …/>`.
Ruling: #1 → o checkout só DESBLOQUEIA quando o rascunho novo está completo: `planejarRascunho` recebe `completo` (faltando(rascunho, todaySp()) vazio, calculado em `enfileirar`) e mantém `bloqueio` se incompleto (checkout continua depois das respostas); auto-save segue normal sem travar o formulário — custo: regra da fila passa a depender da completude (mesma regra do servidor).
Ruling: #2 → useFotoUrl depende do seq do item (não do Blob clonado). #3 → falha de rede/timeout ou 409 NO_OPEN_JOURNEY na conferência de parecidos segue o caminho offline (new_place sem confirm_new; servidor marca possible_dup).
Ruling: minors baratos entram no round: prévia quebrada após "trocar"; "Salvar correções" sem rascunho pendente enfileira o atual; questionário desabilitado enquanto `ocupado`; bmp.close em finally; QR com max-w (320 px); "Nenhum" exclusivo nos canais.
Task 11: minor (deferred): a11y (tabs sem tabpanel, grupos sem role=group, chips h-10, alvos pequenos, data sem rótulo visível); sem feedback durante a redução da foto / input não reseta; decode de foto enorme em celular fraco; arquivo com type vazio; consultor.current atribuído no render; browser-check não prova a redução nem isola o save do unmount; sem RED separado para temEnvioDepoisDoCheckout.
Task 11: fix round 1 enviado (FIX_BASE 5a0ec70).
Task 11: fix round 1 implementado c79bdad (vitest 81, browser-check 135/135)
Task 11: re-review dispatched (a025448ed1681a159, opus)
Task 11: fix round 1/5 (5 addressed, 0 open — key da visita, bloqueio só sai com rascunho completo, foto por seq, parecidos sem sinal → caminho offline, minors; commits 5a0ec70..c79bdad)
Task 11: minor (deferred): com checkout bloqueado, auto-save COMPLETO reenvia o checkout e trava o form (observação digitada depois pode ficar de fora); "Continuar" pode esperar até 30 s antes do caminho offline; "Perto de mim"/"Buscar" sem fallback offline; canaisExclusivos não limpa channel_other; literal 'Nenhum' duplicado cliente/servidor; 429/5xx também seguem o caminho offline (servidor ainda marca possible_dup).
Task 11: complete (commits 3155077..c79bdad, 1 fix round, review clean)
Task 12: dispatched (BASE c79bdad, implementer a97cc9e347780539b, sonnet)
Task 12: implementer DONE_WITH_CONCERNS 7304fd3 (browser-check 144/144; vitest 81; typecheck/lint ok).
Task 11/12: minor (deferred, final review): rodada intermediária do browser-check teve `net::ERR_FILE_NOT_FOUND` num blob: da prévia da foto em ?v=visita (corrida de revogação em useFotoUrl/prévia) — não reproduziu; possível flake.
Task 12: review dispatched (a28923b0d7190a711, sonnet)
Task 12: review → Needs fixes: Important #1 sem estado de erro (detalhe "Carregando…" eterno; lista diz "Nenhum consultor" quando falha); #2 senha provisória perdida num toque fora/Esc (e se fechar durante o envio nunca aparece).
Ruling: "Ver QR code" fica visível para a equipe toda (é leitura; a API serve signup_url na leitura) — custo: nenhum.
Ruling: minors baratos entram no round: temp_password não fica no cache de mutação (gcTime 0/reset ao fechar); Dialogs do QR e da senha com max-h/overflow; plural nos textos ("1 visita"); data do retorno em DD/MM/AAAA; mapa com uma linha por jornada, ordenada por tempo real (Date), e a checagem do browser-check exige a linha (polyline) e não só o círculo.
Task 12: minor (deferred): select da praça mostra 1ª opção com valor vazio (fallback cobre); inputs sem type email/tel e sem validação de CPF/telefone no cliente; clipboard sem tratamento de erro; FotoVisita sem mensagem de falha; CanaisCampo (alvo pequeno, Enter, feedback de duplicado/limite, aperto em 360 px); polling de dias passados; regex de 401 no console só por tempo; sem browser-check de criar/editar/desativar/salvar canais; ordem de import.
Task 12: fix round 1 enviado (FIX_BASE 7304fd3).
Task 12: fix round 1 implementado ec9eec1 (browser-check 144/144 na última; 2 de 4 rodadas falharam no blob: da prévia da foto da T11).
Task 11: Ruling (pós-conclusão, load-bearing): o `net::ERR_FILE_NOT_FOUND` no blob: da foto em ?v=visita reproduz em 2 de 4 rodadas — browser-check instável + foto quebrada para o consultor; correção dedicada no código da T11 (implementador da T11 retomado) antes da T13 — custo: uma rodada extra.
Task 12: re-review dispatched (ac342d9b26f40d666, haiku). Task 11: fix pós-conclusão do blob dispatched ao implementador da T11 (aefb2ed32002d3aa8), BASE ec9eec1
Task 12: ⚠️ resolvidos pelo controlador — fmtBR divide a string (sem fuso) e trata vazio ("—"); plural exportado de formatos.ts.
Task 12: fix round 1/5 (2 Important + polish addressed, 0 open; commits 7304fd3..ec9eec1)
Task 12: minor (deferred): temp_password fica no MutationCache até o gc padrão (~5 min) após reset() — gcTime 0 resolveria.
Task 12: complete (commits c79bdad..ec9eec1, 1 fix round, review clean)
Task 11: fix pós-conclusão implementado 51af01d (revogação adiada 10 s; browser-check 4×144/144)
Task 11: re-review do fix do blob dispatched (ad355369c4631d392, sonnet)
Task 11: fix pós-conclusão do blob — ADDRESSED (commits ec9eec1..51af01d).
Task 11: minor (deferred): useFotoUrl mantém URL antiga se o fetch da foto da API falhar após trocar de fonte (some em 10 s) — setUrl(null) no início do efeito resolveria.
Task 13: dispatched (BASE 51af01d, implementer abf6c440f4a3c79a4, sonnet) — rulings: compose com as 8 variáveis, contagens reais, CONSULTANTS no README, visões/limitação offline/IAM ListBucket, aviso de índice parcial, verificação completa, falha conhecida do smoke
Task 13: implementer DONE 71e183c — jest 43/628; smoke 857/858 (1 conhecida); vitest 81; browser-check 144/144; typecheck/lint ok; postgres parado
Task 13: review dispatched (a441bab9f3e9c53ec, sonnet)
Task 13: minor (deferred): .env.example com PHOTO_STORAGE=disk (copiar para produção força disco no EC2 compartilhado) — deixar vazio; README chama FREELA_WEB_URL de "endereço do cadastro" (é a URL base, sem /cadastro); linhas longas no status do README; frase "menos sem o container" no CLAUDE.md.
Task 13: complete (commits 51af01d..71e183c, review clean)
## Final review
Final review dispatched (a724f81c5f35af7e3, opus) sobre 923499d..71e183c
Final review (opus): With fixes — CRITICAL XSS armazenado: ConsultorMapa bindTooltip(v.lead_name) vira innerHTML (Leaflet) → nome digitado pelo consultor executa script no navegador da equipe (token admin em localStorage). Important: #1 itens da fila entregues depois das 00:05 são recusados e apagados (closeStale fecha a jornada de ontem); #2 limites do novo lugar diferentes cliente×servidor (160/240 × 120/200) → 400 → visita inteira apagada; #3 README subestima a falta do S3 (todo check-in 503 → fila parada).
Ruling: XSS → tooltip por elemento com textContent + checagem no browser-check com nome "<b>x</b>" literal.
Ruling: Important #1 → mitigação no cliente AGORA (aviso ao encerrar com envios pendentes, aviso na tela de hoje com fila, faixa marca envios de ontem) + aceitar itens atrasados dentro da jornada fechada automaticamente é decisão de desenho do DONO (vai no relatório final) — custo: até a decisão, visitas feitas sem sinal e enviadas só no dia seguinte continuam se perdendo (com aviso).
Ruling: #2 limites alinhados (nome 2–120 com trim, endereço ≤ 200); #3 README diz que sem bucket o recurso não funciona em produção + teste de 1 check-in real antes de ir ao ar.
Ruling: minors promovidos ao fix final: .env.example PHOTO_STORAGE vazio; README FREELA_WEB_URL = URL base (sem /cadastro) com exemplo; signupUrl tira barra final e "/cadastro" acidental; desfazer importação não apaga lead com visita de campo; cargo do interlocutor com rótulo ("Dono"); rejeição do mutateAsync tratada no ConsultorDialog; válvula de escape: item da cabeça com 8+ falhas de rede seguidas ganha "Descartar este envio" (confirm; checkin descartado leva seus dependentes) — custo: mais UI na faixa.
Task final: minor (deferred): mapa da equipe reconstrói (perde zoom) a cada ponto novo no polling; leads.remove pela equipe ainda apaga visitas em cascata (decisão consciente da equipe).
Final fix wave enviado (FIX_BASE 71e183c).
Final fix wave dispatched (aff847ded3d9efbf2, sonnet) — 10 itens
Final fix wave implementado 257c9ed — jest 45/640; smoke 857/858 (conhecida); vitest 91; browser-check 145/145 (XSS travado)
Final fix wave: re-review dispatched (a8b929f2cab0332c9, opus)
Final fix wave: re-review → todos os 10 ADDRESSED, sem quebra nova (commits 71e183c..257c9ed). Final review CLEAN.
