# Comparação: Praça (nossa, produção) x Praça do chefe (Lovable, TanStack Start + Supabase)

Data: 2026-10-20. Somente leitura de código; nada foi executado. O zip do chefe é dado não confiável: só foi lido (o `.env` dele não foi aberto; nenhuma chave ou URL de projeto aparece aqui, "(chave omitida)").

Convenções de citação. Chefe = `garden/` extraído em `/tmp/claude-1000/-home-doutor-coding-freela/afbdab81-1f14-4838-9037-9eec9f310175/scratchpad/garden/`, abreviado `G/`. Nossa = `/home/doutor/coding/freela/praca/`, abreviado `N/`.

## 1. Resumo executivo

- As duas versões resolvem o mesmo problema (representantes/consultores visitando estabelecimentos), mas a nossa é muito mais profunda: funil de leads, mensagens/cadências, mídia, indicadores de marketing, consultores de campo com jornada/GPS/fila offline, pesquisa automática (Overpass/Apify), roteiro com relógio, mapa de calor, metas/alertas, cadastro assistido no Freela, sync de cadastros confirmados, remuneração versionada em centavos e Pix manual (`N/docs/superpowers/plans/2026-10-19-prospeccao-progresso.md`, F0–F9).
- Só o chefe tem: vouchers de "1ª contratação grátis" (solicitação/aprovação), captação por Google Places com busca em grade e estimativa de custo em US$/R$, rotas "shopping" (rota dos shoppings + rota interna por shopping), rota a pé x carro, lotes de geração de rota, checklist de abordagem configurável por visita, nota 0–10 do dia, mapa com pins por status do cliente, calendário/lista "Minhas rotas" do representante, motivos fixos de recusa, contato (nome/telefone/cargo/e-mail) como campos obrigatórios da visita.
- Diferente e conflitante: (a) quem declara o "cadastro" — no chefe o representante marca `status_final = cadastrado` e isso paga comissão; na nossa só vale cadastro confirmado pelo Freela (F7); (b) a diária do chefe é paga por dia com rota atribuída, não por dia trabalhado; (c) bônus do chefe ignora a coluna `periodo`; (d) dinheiro em `numeric` reais x nosso centavos inteiros com regra versionada; (e) Google Places gravando telefone, horário, nota e site x nossa decisão de não guardar conteúdo do Google; (f) login por usuário com e-mail sintético x nosso e-mail + CPF com token `aud: campo`.
- Só a nossa tem (sem equivalente no chefe): funil/CRM, mensagens e cadências, mídia paga/criativos, indicadores de marketing, jornada com trilha GPS, fila offline com carimbo de hora saneado, mapa de calor/cobertura, metas e alertas, follow-ups, integração Freela (cadastro assistido por link/QR, sync), remuneração versionada com razão (ledger), fechamento por semana e fila de Pix, áreas de atuação, importação CSV/XML com deduplicação no servidor.
- Segurança: o servidor deles (Supabase/RLS) confia no cliente para status, GPS, foto e horário; o nosso valida no servidor. Há um endpoint público `bootstrapAdmin` com senha padrão fixa (ver §4.3).
- Recomendação: não migrar nada de arquitetura. Trazer, em ordem, motivos de recusa + contato na visita, vouchers (se o dono confirmar o processo), rota a pé/carro e checklist de abordagem, rota de shoppings via OSM (sem Google), mapa de pins por status, nota do dia.

## 2. Tabela de funcionalidades

Situação: igual / só chefe / só nossa / diferente.

| Funcionalidade | Chefe (Lovable) | Nossa | Situação | Observação |
|---|---|---|---|---|
| Login e perfis | Perfis admin/gestor/representante em `user_roles`; login só por usuário; e-mail sintético `<usuario>@praca.local` (`G/src/lib/format.ts` `usernameToEmail`); Supabase Auth | Equipe: e-mail+senha (`N/docs/api-contract.md` §2). Consultor de campo: conta separada `field_consultants`, e-mail+CPF, token `aud:"campo"` (§20.1). `users.is_admin` booleano; sem perfil "gestor" separado | diferente | Nosso isolamento equipe x campo é mais forte. "Gestor" não existe como perfil na nossa (não confirmado se há perfil intermediário; schema só tem `is_admin`) |
| Troca obrigatória de senha | `profiles.deve_trocar_senha`; layout redireciona para `/trocar-senha` (`G/src/routes/_authenticated/route.tsx` l.56-61); senha nova 8–72, 1 maiúscula, 1 número (`G/src/lib/users.functions.ts` `changeOwnPassword`) | `must_change_password`; rotas do campo respondem `403 PASSWORD_CHANGE_REQUIRED` (§20.1); nova senha 8–72 sem exigir maiúscula/número | igual (regra de força diferente) | Opcional: exigir maiúscula+número (S) |
| Usuários (equipe) | Tela `usuarios.tsx`: criar admin/gestor, ativar/desativar (ban 876000h), redefinir senha; só admin | Pessoas `/v1/users` (§3), `users.active` | igual (aprox.) | Desativação nossa: `token_version` + checagem a cada request |
| Representantes/consultores | CRUD (`representantes.tsx`), endereço, telefone, banco, PIX, forma de remuneração, vínculo com praças (`praca_representantes`), "gerar acesso" com senha temporária, link WhatsApp | `field_consultants` (CPF, Pix com validação, praça, código Freela, senha provisória `gerarSenhaProvisoria`) (§20.4, `N/api/src/domain/campo-rules.ts`) | diferente | Nosso: 1 praça por consultor; do chefe: N praças por representante (tabela de junção). Endereço/banco do chefe não existem na nossa |
| Praças | CRUD; status `planejamento/em_andamento/concluida`; mapa só mostra abertas (`G/src/routes/_authenticated/mapa.tsx` l.21) | `pracas` com etapas, ações, roteiro-modelo, formulário público (§6) | diferente | Nossa praça é unidade de execução comercial; a do chefe é só agrupador geográfico |
| Importação Excel | Botão "Importar Excel" desabilitado (`G/src/routes/_authenticated/pracas.$id.tsx` l.60); roadmap item 3 marcado como bloqueado | `/v1/imports` com CSV/XML parseado no navegador, mapeamento salvo, duplicidade no servidor, desfazer em 24 h (§10) | só nossa | O chefe tem só a coluna `origem='excel'` prevista |
| Geocodificação | Só de cidade (Google Geocoding via conector) para obter limites da grade (`buscarCidade`, `G/src/lib/google.functions.ts`); endereço de cliente: não implementado | Municípios IBGE estáticos (§5) + coordenadas do Overpass; `leads.location_precision` | diferente | Geocodificação de endereço livre na nossa: não confirmado |
| Clientes e status | `clientes` com 6 status finais + `a_visitar` (`G/src/lib/status.ts`); staff altera status direto na tela `clientes.tsx` l.49 | `leads` com estágio (1–7+) e eventos; visita muda estágio 1,2→3 (`campo-rules.ts` `estagioDepoisDaVisita`) | diferente | Modelos distintos; ver §3.2 |
| Captação Google Maps | Grade (célula 1/1,5/2 km, máx 300 células), tipos+palavras por segmento, estimativa de custo, pré-visualização, duplicados por place_id/telefone/endereço, upsert `onConflict praca_id,google_place_id` (`G/src/components/BuscaGoogleDialog.tsx`) | Pesquisa por área circular (200–5000 m) via Overpass; Apify atrás de flag com teto mensal; cache 7 dias; classificação novo/duplicado/descartado; revisão antes de virar lead (§22, `places-rules.ts`) | diferente | Mesmo objetivo, fonte e política diferentes (§3.6 e §6) |
| Segmentos de busca | Tabela `segmentos` (tipos Google + palavras-chave), editável em Configurações | `TIPOS_LUGAR` fixo no código (bar, restaurante, lanchonete, padaria, café) | diferente | Editável no chefe, fechado na nossa |
| Estimativa de custo | US$ 0,035 por chamada x cotação 5,5 fixa (`G/src/lib/format.ts` l.~70) | `estimarCustoApifyUsd` e teto mensal 3.000 lugares (`places-rules.ts` l.294-300) | diferente | Constantes do chefe são fixas no código, sem fonte do preço do Google (não confirmado) |
| Rotas: geração por proximidade | `gerarRotas`: ordena por ângulo ao redor do centroide, corta grupos de até N paradas e até 10 h, ordena por vizinho mais próximo (`G/src/lib/rotas.ts`) | NN + 2-opt, relógio com janela/almoço, reserva, determinístico (`N/api/src/domain/rota-rules.ts`) | diferente | A nossa é por consultor/dia; a do chefe divide uma praça em várias rotas |
| Modos de rota | `carro` 25 km/h, `pe` 5 km/h | Só caminhada 4,5 km/h x fator 1,3 | **FEITO (P0 3, §30.4)** | `travel_mode` `a_pe`\|`carro` por roteiro; carro = env `ROTA_VELOCIDADE_CARRO_KMH` (padrão 25) × fator de desvio 1,3 |
| Lotes de geração | `lote_id` + `gerado_em`; cada "Gerar" cria lote novo sem apagar (`0011`) | `field_routes.version`, uma rota ativa por dia | diferente | |
| Atribuição de rota | Staff atribui `rotas.representante_id` e `data` | Rota gerada ao iniciar a jornada ou por equipe (`/v1/routes`, §23.4) | diferente | |
| Rotas de shopping | Aba "shopping": mapeia shoppings (`shopping_mall`), exige `total_avaliacoes >= 2500` como sinal de "grande", cria rota dos shoppings e rota interna por shopping; `clientes.shopping_id` (`G/src/routes/_authenticated/rotas.tsx` l.16-19,130-181) | Não existe | só chefe | Depende de dado do Google (avaliações) |
| Roteiro do dia: iniciar/intervalo/encerrar | Eventos `inicio_rota`, `inicio_intervalo`, `fim_intervalo`, `fim_rota` com lat/lng (`0009`, `G/src/lib/visita.ts` `estadoRota`) | Jornada com início/fim, trilha de pontos, fechamento automático à meia-noite (§20.2, §20.5) | diferente | Intervalo explícito só no chefe |
| Chegada com foto e distância | Foto obrigatória no bucket privado `fachadas/<uid>/`; distância Haversine; >raio exige justificativa por texto (`Chegada` em `roteiro.$rotaId.tsx`, `precisaJustificativa`) | Foto obrigatória (`photo_key`), distância e marca `far_from_place` (>200 m), só marca, não bloqueia; foto passa pela API (`PhotoStorage`) | igual no limiar, diferente na ação | Ver §3.3 |
| Cronômetro | Relógio por segundo na visita aberta; `duracao_seg` = checkout − checkin | Tempos por `checkin_at`/`checkout_at`; cronômetro na tela: não confirmado | igual (provável) | |
| Checklist | Lista em `configuracoes.checklist_visita` (7 etapas), cada etapa `feito`+`obs` guardada em `visitas.checklist` | Questionário fixo de 9 perguntas (`faltando()` em `campo-rules.ts`); sem checklist de abordagem | só chefe | |
| Status final da visita | 6 valores; exige motivo, data de retorno e contato conforme o caso (`pendenciasFinalizar`) | `freela_status` (3), `interest` (4), `needs_followup`+data+o quê; **+ `outcome` conversa\|fechado e `refusal_reason` (P0 1, §30.1–30.2)** | diferente (P0 1 **FEITO**) | Ver §3.2 |
| Contato | `contato_nome`, `contato_telefone` (≥10 dígitos), `contato_cargo`, `contato_email` | `interlocutor_name`, `interlocutor_role` (dono/gerente/outro) **+ `contact_phone` opcional e `followup_time` (P0 2, §30.3)** | diferente (P0 2 **FEITO**; e-mail do contato ficou de fora) | Telefone: só dígitos, mascarado nas listas da equipe |
| Offline | Não implementado (roadmap 6b aberto) | Fila offline com carimbo de hora saneado (±2 min futuro, 24 h passado), `fila-motor.ts` (§23.7) | só nossa | |
| Mapa: pins por status | Google Maps JS; pins por status, filtro por praça, legenda clicável com contagem (`G/src/routes/_authenticated/mapa.tsx`) | Mapa de calor/cobertura em Leaflet (`/consultores/calor`); mapa de pins por status do lead: não confirmado | só chefe (pins) | |
| Mapa de calor | Roadmap: pendente | `GET /v1/consultores/heatmap`, grade 100/250/500/1000 m (`heat-grid.ts`) | só nossa | |
| Vouchers | `vouchers`: representante solicita (cliente, UF, cidade, ramo, freelas/semana), admin aprova/reprova com motivo (`G/src/routes/_authenticated/vouchers.tsx`, `0005`) | Não existe (nenhuma ocorrência em `api/src` ou `web/src`) | só chefe | Decisão do dono |
| Financeiro / carteira / lançamentos | Cálculo na tela, por período; botão "Marcar como pago" grava `pagamentos` (`G/src/routes/_authenticated/financeiro.tsx`) | Razão (ledger) por dia/semana, fechamento, fila de Pix, comprovante, estorno, CSV (§28, §29) | diferente | Nossa é auditável e idempotente |
| Bônus | `regras_bonus` (meta, valor, período, por representante ou geral) | Faixas diárias em `RegraRemuneracao.tiers` (10→R$100, 20→R$250), combinação `max/sum/tier_only`, piso e teto | diferente | Ver §3.1 |
| Desempenho / indicadores | `inicio.tsx` (gestor): % concluídas, positivação, tempo médio, ranking; `desempenho.tsx` do representante é "Em breve" | Indicadores de marketing (`indicator-rules.ts`), metas e alertas (`/consultores/attention`), ritmo (`rota-rules.ts` `ritmo`) | diferente | Positivação como definida pelo chefe não existe na nossa (não confirmado) |
| Configurações | Só edita segmentos; chaves de parâmetros existem no banco mas quase nenhuma é lida (§4.4) | `app_settings.field_config` (meta, janela, almoço, minutos/visita, velocidade, fator, dias sem revisitar, etc.) | só nossa (de fato) | |
| Checklist em Configurações | Chave existe em `configuracoes`; tela para editar: não existe | n/a | só chefe (parcial) | |
| Shoppings | Ver "Rotas de shopping" | Não existe | só chefe | |
| Zonas com IA | Roadmap 5b aberto; `clientes.zona_id` sem FK | Não existe; "áreas de atuação" circulares são outra coisa (§21) | nenhuma | Nenhuma das duas |
| Mensagens, cadências, campanhas, mídia | Não existe | Existe (§12–§15) | só nossa | |
| Integração Freela | Não existe | `/v1/freela`, cadastro assistido (§26), sync de cadastros (§27) | só nossa | |
| Cobrança Google em geral | Chave via conector `connector-gateway.lovable.dev` com `LOVABLE_API_KEY` (chave omitida) | Sem Google | só chefe | |

## 3. Diferenças de REGRA DE NEGÓCIO

### 3.1 Ganho, comissão, bônus, diária

| Item | Chefe | Nossa |
|---|---|---|
| Onde | `G/src/lib/financeiro.ts` `calcularPagamento` | `N/api/src/domain/earnings-rules.ts` `calcularDia` (l.355), `calcularSemana` (l.460), `REGRA_PADRAO` (l.45) |
| Unidade de dinheiro | `numeric` em reais (`0006`), cálculo em `number` | Centavos inteiros (`unit_cents`, `amount_cents`) |
| Diária | `diarias = nº de dias distintos com rota atribuída ao representante entre início e `min(fim, hoje)`` x `valor_diaria`. A fonte é `rotas.data`, não a presença (`financeiro.tsx` l.48-52) | Não há diária; piso diário opcional (`floor_cents`) condicionado a `journey_open` ou `min_visits` |
| Comissão | `cadastros x valor_comissao_cadastro`. `cadastros` = clientes com `status='cadastrado'` e `status_atualizado_em` no período (`financeiro.tsx` l.49-50) | `unit_cents = 1000` (R$10) por cadastro **confirmado pelo Freela** (F7) |
| Bônus | Soma de todo `regras_bonus` (do representante ou geral) com `meta <= cadastros` do período inteiro, independentemente de `periodo` ('semana') | Faixas por dia: 10 cadastros → R$100, 20 → R$250; `combine='max'` (vale o maior entre por-cadastro e faixa) |
| Teto/piso | Nenhum | `cap_cents` (nulo), `floor_cents` (0), condições configuráveis |
| Versionamento | Valores no cadastro do representante, sobrescritos | Versões com `valid_from >= hoje`, nunca edita a antiga |

Contas (fonte: testes e padrões de cada lado):
- Chefe, teste `financeiro.test.ts`: diária R$150, 3 registros em 2 dias distintos → 2 x 150 = R$300; comissão R$10 x 5 = R$50; bônus meta 5 / R$200 com 5 cadastros e diária R$100: 1 x 100 + 5 x 10 + 200 = R$350.
- Nossa, padrão: 12 cadastros no dia → max(12 x 1.000, 10.000) = 12.000 centavos = R$120; 10 → max(10.000, 10.000) = R$100; 20 → max(20.000, 25.000) = R$250.

Qual parece mais correto:
- Nossa, porque (a) paga só cadastro confirmado, (b) não paga por rota que o representante nunca executou (no chefe um dia com rota atribuída e sem visita ainda gera diária), (c) é auditável. Pontos do chefe que valem: contar `periodo` do bônus (semana/mês) é uma necessidade real de negócio que a nossa cobre só por dia ou semana (`tiers_period` 'day'|'week').
- Risco do chefe: `status_atualizado_em` guarda só a última mudança; se o cliente sair de "Cadastrado" depois do período, o cadastro some do histórico (o cálculo olha o estado atual). Comparar com nossa `field_signups` imutável.

### 3.2 Status final da visita

| Chefe (`G/src/lib/visita.ts` `STATUS_FINAL`, `G/src/lib/status.ts`) | Nossa |
|---|---|
| cadastrado, nao_cadastrado, nao_contrata_freela, estabelecimento_fechado, retornar_outro_dia, ligar_depois | `freela_status`: ja_usa / cadastrou_qr / nao_cadastrou; `interest`: alto/médio/baixo/nenhum; `needs_followup` + `followup_date` + `followup_what` (`campo-rules.ts` `faltando`) |
| `pendenciasFinalizar`: não cadastrado exige motivo (Sem interesse, Já usa concorrente, Preço, Sem demanda, Outro); retornar/ligar exige data e hora; todos menos "fechado" exigem nome, telefone (≥10 dígitos) e cargo | Checkout exige as 9 respostas; retorno não pode ser no passado; sem motivo de recusa por visita (existe `leads.lost_reason`, schema l.196) |
| Trigger `visita_atualiza_cliente` copia `status_final` para `clientes.status` (SECURITY DEFINER, `0009`) | Visita move estágio 1,2→3 só; cadastro vem do sync |

Mais correto: o modelo nosso (confirmação externa). Mas faltam à nossa dois elementos do chefe que são úteis: "estabelecimento fechado" como resultado de visita (hoje só `parece_fechado` na pesquisa, `places-rules.ts`) e motivo estruturado de recusa. O "retornar/ligar depois" do chefe pede data **e hora**; o nosso só data (`followup_date` em `YYYY-MM-DD`).

### 3.3 Distância mínima na chegada

- Chefe: `precisaJustificativa(dist, raio)` = `dist != null && dist > raio` (`G/src/lib/visita.ts`); raio vem de `configuracoes.raio_checkin_m`, padrão 200 (`roteiro.$rotaId.tsx` l.69). Fora do raio exige texto de justificativa antes de gravar. Sem coordenada no cliente, sem exigência.
- Nossa: `RAIO_LONGE_M = 200`, `marcaLonge` marca `far_from_place = d > 200` e nunca bloqueia (`campo-rules.ts` l.12, l.53-60). Raio constante no código, não configurável (não confirmado se há override em `field_config`).
- Ambos: 200 m, comparação estrita `>`. Diferença é a ação (justificativa obrigatória x só marca). A do chefe gera um texto livre auditável; a nossa mantém o registro sem fricção. Mais correto para o negócio: combinar, marcar sempre e pedir justificativa curta opcional.

### 3.4 Tempos e ETA

| Item | Chefe (`G/src/lib/rotas.ts`) | Nossa (`rota-rules.ts`, `CONFIG_ROTA_PADRAO`) |
|---|---|---|
| Minutos por cliente | `MIN_POR_CLIENTE = 20` constante | `minutos_por_visita = 8` configurável |
| Intervalo | `MIN_INTERVALO = 60` somado ao total | Almoço 12:00–13:00 dentro da janela |
| Deslocamento | `round(km / kmh x 60)`, linha reta, sem fator de rua; 25 km/h carro, 5 km/h a pé | 4,5 km/h x `fator_desvio = 1,3` |
| Limite | `LIMITE_ROTA_MIN = 600` (10 h) por rota; `porRota` padrão 20 (UI) | Janela 09:00–18:00 e `meta_diaria = 30`; corta no que cabe, resto vira reserva (`RESERVA_MAX = 10`) |
| ETA por parada | Não calcula | `eta_min` por parada (`ParadaPlano`) |

Contas: chefe, 20 paradas, 0 km: 20 x 20 + 60 = 460 min (7 h 40); 10 paradas: 10 x 20 + 60 = 260 (teste `rotas-tempo.test.ts`). Chefe, 30 paradas (o `clientes_max_dia = 30` do seu próprio seed): 30 x 20 + 60 = 660 min > 600, ou seja, o seu padrão máximo não cabe no seu limite de 10 h. Nossa, janela útil: (18:00 − 09:00) − 1 h = 480 min; 480 / 30 = 16 min por visita no ritmo (`ritmo()` l.426-438), contra 8 min por visita no relógio de rota.
Mais correto: a nossa (ETA por parada, fator de desvio, parâmetros editáveis). Dois números (8 min e 16 min) precisam ser explicados na UI para não confundir. O modo a pé/carro do chefe é aproveitável.

### 3.5 Fórmulas de indicadores

Chefe (`G/src/lib/indicadores.ts`, `calcularIndicadores`):
- `planejadas` = clientes distintos em `rotas.cliente_ids` do período.
- `visitas` = clientes com `status != 'a_visitar'` (inclui mudança manual da equipe).
- `concluidas` = visitas cujo cliente está nas rotas; `pctConcluidas = concluidas / planejadas`.
- `positivacao = cadastrados / visitas`.
- `tempoMedioMin` = média dos intervalos entre registros consecutivos do mesmo representante no mesmo dia, ignorando intervalos > 120 min (`MAX_GAP_MIN`) e usando o dia UTC (`slice(0,10)`).
- Há uma segunda definição de "tempo médio" no roteiro (`roteiro.$rotaId.tsx` l.84): média de `duracao_seg` (checkin→checkout). Duas métricas com o mesmo nome.
- Nota do dia (`resumoRota`, `visita.ts`): `nota = (cumprimento x 7 + min(1, positivacao / 0,3) x 3)`, arredondada a 1 casa. Teste: 20 planejadas, 20 visitadas, 6 cadastros: 7 + min(1, 0,3/0,3) x 3 = 10. Metade da rota sem cadastro: 0,5 x 7 = 3,5.

Nossa: `ritmo` (esperadas x feitas pela janela útil), `attention` (alertas) e `resumoCobertura = round(visitados/total x 100)` (`heat-grid.ts` l.88-97); indicadores de marketing são outro domínio. Positivação (cadastros ÷ visitas) e nota do dia não existem como tal (não confirmado em `consultores.service.ts`).
Mais correto: contar cadastro confirmado (nossa) no numerador e visita com check-in no denominador; evitar o dia UTC (nossa regra `todaySp()`). O corte de 30% e os pesos 70/30 da nota são escolha de negócio, não verificável no código: decisão do dono.

### 3.6 Fechamento financeiro

- Chefe: sem fechamento. Para cada período escolhido calcula na hora; "Marcar como pago" insere em `pagamentos` com os valores calculados e não há unicidade (`0006`: sem UNIQUE em `(representante_id, periodo_inicio, periodo_fim)`). Períodos sobrepostos ou duplo clique podem pagar duas vezes. "Desfazer" apaga a linha. "Hoje" e início de semana usam `toISOString()` (UTC) e filtros `T00:00:00` sem fuso.
- Nossa: semanas fechadas, `autoclose_hour = 6`, `late_grace_days = 14`, razão append-only, fila `a pagar` com chave Pix fotografada, comprovante, estorno e CSV (§28, §29, `payout-rules.ts`). Brasília via `todaySp()`.
- Mais correto: a nossa.

### 3.7 Vouchers

- Chefe: tabela `vouchers` com `status in (pendente, aprovado, reprovado)`, `freelas_semana >= 0`, policy de insert `solicitante_id = auth.uid() AND status = 'pendente'`, update só admin (`0005`, `vouchers.tsx`). Não há vínculo com o Freela (não gera cupom): só registro e aprovação. O texto do checklist cita "Oferecer o voucher da 1ª contratação grátis" (seed de `0000`).
- Nossa: nada.
- Pergunta ao dono: o voucher é cupom real no Freela? Se sim, a aprovação teria de chamar o api-freela (isso exige a mesma aprovação que o F0).

### 3.8 Duplicados e captação

- Chefe: duplicado se `place_id` igual, telefone igual ou rua+número normalizado igual (`BuscaGoogleDialog.tsx` l.94-101). Estimativa de custo: `celulas x (tipos+palavras por segmento) x 0,035` US$. Exemplo: bounds ~20 x 20 km, célula 1,5 km → 14 x 14 = 196 células; com os 8 segmentos seed (Buffet tem tipo+palavra, 9 buscas/célula) → 196 x 9 = 1.764 buscas x 0,035 = US$ 61,74 ≈ R$ 339,57 (x 5,5). Teto de 300 células → 300 x 9 x 0,035 = US$ 94,50. Palavra-chave pode gastar até 3 páginas por busca (estimativa "mínimo").
- Nossa: dedupe por `source_ref`, telefone, nome+endereço, nome+proximidade (`places-rules.ts` l.239-250), cache de 7 dias, `MAX_RESULTADOS = 300`, revisão antes de virar lead.
- Mais correto: a nossa; a do chefe é útil como ideia só no passo de "estimar antes de gastar" (já temos para Apify).

## 4. Modelo de dados e segurança

### 4.1 Tabelas/colunas do chefe que não existem na nossa

(Migrations `G/drizzle/migrations/0000`–`0012`; `0001` é a de clientes/segmentos/buscas.)

| Chefe | Existe na nossa? |
|---|---|
| `profiles`, `user_roles`, enum `app_role` | Não; nossa usa `users.is_admin` e `field_consultants` separado |
| `representantes` (endereço, banco, pix, `forma_remuneracao`, `valor_diaria`, `valor_comissao_cadastro`) | Parcial (`field_consultants`: sem endereço/banco, sem diária) |
| `praca_representantes` (N:N) | Não (1 praça por consultor) |
| `regras_bonus` (meta/período/valor) | Substituída por `field_pay_rule_versions` |
| `clientes` (`status`, `status_atualizado_em`, `shopping_id`, `zona_id`, `dados_confirmados`, `whatsapp_confirmado`, `horario_funcionamento`, `avaliacao_google`, `total_avaliacoes`, `google_*`) | Parcial: `leads` + `place_candidates` (sem avaliações/horário do Google por política) |
| `segmentos` (tipos Google e palavras-chave editáveis) | Não |
| `buscas_google` (log de busca, custo estimado) | `place_import_runs` (equivalente) |
| `rotas` (`tipo`, `modo`, `lote_id`, `gerado_em`, `cor`, `distancia_km`, `data`, `cliente_ids uuid[]`) | `field_routes` + `field_route_stops` (normalizado) |
| `rota_eventos` (inicio/intervalo/fim) | `field_journeys` (sem evento de intervalo) |
| `visitas` (`status_final`, `motivo`, `retorno_em` com hora, contato completo, `checklist jsonb`, `justificativa_distancia`) | `field_visits` (sem esses campos) |
| `vouchers` | Não |
| `pagamentos` (diárias, valor_diarias, cadastros, valor_comissao, valor_bonus, valor_total) | Substituída por `field_earnings_ledger`, `field_payouts` |
| `configuracoes` (chave/valor jsonb) | `app_settings` |

### 4.2 Tabelas/colunas que só a nossa tem

`field_journeys` e `field_points` (trilha GPS), `field_areas`, `place_candidates` com `cache_key`, `field_route_events`, `field_company_signups`, `field_signups`, `field_signup_sync_state`, `field_pay_rule_versions`, `field_earnings_ledger`, `field_payout_periods`, `field_payouts`, `field_payout_events`, e todo o CRM (`leads`, `lead_events`, `msg_*`, `cadences`, `campanhas`, etc.). Índices únicos parciais (uma jornada e uma visita abertas por consultor, uma rota ativa por dia, uma parada por lead e dia, um pagamento ativo por semana) que o Prisma não declara (`N/CLAUDE.md`).

### 4.3 Segurança: o que cada servidor garante

O servidor do chefe é o Postgres do Supabase com RLS; a regra de negócio vive em policies e no navegador. O que se verifica no código:

- `visitas` (`0009`): o representante faz INSERT com `representante_id` próprio, mas a policy não confere que a rota é dele nem que o cliente está na rota. O UPDATE da visita aberta permite alterar qualquer coluna (inclusive `status_final`, `checkin_em`, `distancia_endereco_m`, `foto_fachada_url`). Distância, GPS, hora e caminho da foto vêm do navegador e não são recalculados no servidor.
- Trigger `visita_atualiza_cliente` (SECURITY DEFINER): `status_final` do cliente vira `clientes.status`. Como o representante declara "cadastrado", e a comissão conta `status='cadastrado'`, ele é quem libera o próprio pagamento. É o principal risco financeiro.
- `rota_eventos`: INSERT aceita `em` do cliente (coluna com default, mas gravável). Sem unicidade de "rota iniciada".
- `pagamentos`: sem UNIQUE do período; só admin escreve (bom).
- `configuracoes`: leitura para qualquer autenticado (os parâmetros não são secretos).
- Storage `fachadas`: pasta por `auth.uid()`; leitura só do dono e da equipe (bom).
- `profiles`: UPDATE revogado do cliente; escritas por server functions com checagem de papel (bom, `users.functions.ts` `assertStaff`).
- `bootstrapAdmin` (`users.functions.ts` l.19-40): server function **sem middleware de autenticação**, cria o admin `diegofreela` com senha fixa "Mudar@123" se não existir admin. A senha padrão é conhecida e fica ativa até a primeira troca. Para a nossa isso é "não trazer".
- Desativação: `ban_duration = 876000h` no Supabase Auth, equivalente ao nosso `token_version`.
- Nossa: token `aud:"campo"` isolado da equipe, checagem do consultor a cada request, hora do registro saneada, foto pela API (`PhotoStorage`), rota nova do campo fechada por padrão sem `@CampoRoute()`, `ValidationPipe` com whitelist, índices parciais, throttle por rota.

### 4.4 Configurações do chefe que não são lidas pelo código

A migration `0000` semeia `clientes_min_dia`, `clientes_max_dia`, `minutos_por_cliente`, `minutos_intervalo`, `raio_checkin_m`, `inicio_jornada`, `fim_jornada`, `checklist_visita`. Busca no código-fonte (`grep` em `src/`, fora de `types.ts`): só `raio_checkin_m` e `checklist_visita` são lidas, e só em `roteiro.$rotaId.tsx` l.62-70. As demais são constantes no código (`rotas.ts`: `MIN_POR_CLIENTE = 20`, `MIN_INTERVALO = 60`). Não existe tela para editar essas chaves (a tela de Configurações só edita segmentos).

## 5. Recomendação de portabilidade (priorizada)

Princípio: a nossa já é superior em arquitetura. Portar **ideias de produto**, reimplementadas no nosso modelo. Nada de copiar código Supabase.

### P0 (fazer primeiro; baixo risco, valor claro)

1. **[FEITO 2026-10-20, contrato §30.1–30.2] Resultado "estabelecimento fechado" e motivo de recusa na visita.**
   - O que: acrescentar à visita um resultado `fechado` e `motivo` estruturado (Sem interesse, Já usa concorrente, Preço, Sem demanda, Outro) com lista em `field_config` ou no catálogo.
   - Por que: dá dado para analisar recusa e evita voltar a lugar fechado; hoje a nossa só mantém `lost_reason` no lead.
   - Esforço: S–M. Dependências: migração aditiva em `field_visits`; contrato §20.3 primeiro. Risco: baixo. Conflito com decisões: não conflita (campos opcionais, sem flag nova obrigatória; seguir "flags desligadas por padrão" se quiser esconder a UI). Decisão do dono: confirmar a lista de motivos.
2. **[FEITO 2026-10-20, contrato §30.3] Retorno com data e hora (e telefone/e-mail do contato opcionais).**
   - O que: `followup_date` passa a aceitar hora; contato com telefone opcional.
   - Por que: o chefe pede "data e hora do retorno" e telefone de quem atendeu; ajuda o follow-up.
   - Esforço: S. Dependências: §25 (follow-ups). Risco: baixo. Privacidade: dado pessoal de terceiros; pode exigir o mesmo cuidado de §20.8. Decisão do dono: sim/não para coletar telefone do contato.
3. **[FEITO 2026-10-20, contrato §30.4] Modo de deslocamento (a pé x carro/moto) por rota.**
   - O que: parâmetro `velocidade_kmh` por modo (a pé 4,5; carro 25 do chefe seria só ponto de partida a validar).
   - Por que: o consultor de bairro com carro hoje é calculado como pedestre.
   - Esforço: S. Dependências: `field_config`. Risco: baixo. Sem conflito.

### P1

4. **Vouchers de 1ª contratação grátis (solicitação/aprovação).**
   - O que: `field_vouchers` (consultor solicita com cliente/cidade/ramo/freelas por semana; admin aprova/reprova com motivo), com trilha e sem apagar.
   - Por que: o checklist do chefe já trata isso como argumento de venda; sem sistema o benefício fica solto no WhatsApp.
   - Esforço: M. Dependências: contrato novo §30; flag desligada por padrão. Se o voucher precisar virar cupom no Freela, o api-freela teria de mudar (hoje sem aprovação para alterar). Risco: médio (financeiro indireto). **Depende de DECISÃO DO DONO** (existe cupom? quem aprova? limite?).
5. **Checklist de abordagem configurável durante a visita.**
   - O que: lista editável (`field_config.checklist`) exibida na visita, marcando etapas feitas; não obrigatória para o checkout.
   - Por que: padroniza a abordagem; o chefe já usa 7 etapas.
   - Esforço: M. Dependências: UI do campo e `field_visits.checklist` (jsonb). Risco: baixo. Conflito: nenhum, desde que não vire bloqueio. **Decisão do dono**: texto das etapas e se é obrigatório.
6. **Mapa de pins por status/estágio do lead.**
   - O que: mapa Leaflet (já usamos) com pontos coloridos por estágio, filtros e contagem por cor.
   - Por que: o chefe tem e a equipe pede visão "onde estão meus leads"; nosso mapa mostra só calor/cobertura.
   - Esforço: M. Dependências: coordenadas dos leads (`location_precision`), endpoint de leitura leve com paginação. Risco: baixo. Sem Google Maps (usar OSM/Leaflet).
7. **Resumo/nota do dia ao encerrar a jornada.**
   - O que: tela final com tempo total, intervalo, % da rota cumprida e cadastros do dia (conta explícita).
   - Por que: feedback ao consultor; o chefe usa 70% cumprimento + 30% positivação.
   - Esforço: S–M. Dependências: nenhuma de dados novos. Risco: baixo, mas a **nota** é política de RH. **Decisão do dono**: mostrar nota ou só números (regra "todo número com conta e fonte").
8. **Rota de shoppings usando OSM (sem Google).**
   - O que: na pesquisa Overpass, categoria `shop=mall`; rota que passa pelos shoppings e rota interna por shopping.
   - Por que: shopping concentra muitos estabelecimentos por metro caminhado.
   - Esforço: L. Dependências: modelo de "pai" (`leads.parent_id`) e lojas internas via Overpass; o critério do chefe (`total_avaliacoes >= 2500`) depende do Google e **não** deve ser copiado. Risco: médio. **Decisão do dono**: shoppings entram no escopo?

### P2

9. **Intervalo/almoço registrado como evento da jornada** (`inicio_intervalo`/`fim_intervalo`). S–M. Hoje o almoço é só janela de plano. Útil para calcular tempo trabalhado e para o piso condicionado a jornada. Risco: baixo.
10. **Segmentos de busca editáveis** (hoje `TIPOS_LUGAR` fixo). S. Só vale se o dono quiser tipos além dos cinco.
11. **Regra de senha mais forte** (maiúscula+número) no campo e na equipe. S. Risco: atrito de uso.
12. **Bônus por período mensal** (`tiers_period` hoje só `day|week`). M. Só se o dono quiser meta mensal; encaixa na regra versionada (nova versão, sem editar a antiga).
13. **Ordenação por varredura angular no agrupamento de rotas de equipe** (ideia do `gerarRotas`). M. Hoje geramos por consultor; só interessa se a equipe quiser dividir uma área em N rotas.
14. **Perfil "gestor"** com permissões intermediárias (o chefe separa admin e gestor). M. Depende de o dono precisar de alguém que vê tudo mas não paga/configura. **Decisão do dono**.

Conflitos já mapeados: nenhum item acima muda remuneração configurável em centavos, tokens `aud:campo`, Overpass/Apify ou índices parciais. Qualquer item que crie unicidade ("um voucher pendente por cliente", por exemplo) precisa de `--create-only` e do ajuste manual do SQL (`N/CLAUDE.md`).

## 6. O que NÃO trazer

- **Supabase/RLS e Drizzle/TanStack Start.** Nossa stack (NestJS+Prisma+Next) já valida no servidor; RLS do chefe deixa o cliente autorizar status, GPS e foto.
- **Comissão baseada em `clientes.status = 'cadastrado'` declarado pelo representante.** Contraria F7 (só cadastro confirmado pelo Freela) e é fraudável.
- **Diária por rota atribuída.** Paga sem presença; se o dono quiser diária, usar o piso condicionado a `journey_open` ou `min_visits` da nossa regra.
- **Pagamento sem unicidade/ledger** (`pagamentos`, "Desfazer" apagando linha, hoje em UTC).
- **`bootstrapAdmin` com senha fixa "Mudar@123"** e qualquer server function pública que crie contas.
- **Login por usuário com e-mail sintético `@praca.local`.** Conflita com e-mail+CPF únicos, recuperação, e a conta `aud:campo`. Só reavaliar se houver consultor sem e-mail (aí seria usuário próprio, não domínio fictício).
- **Google Places gravando telefone, horário, nota e site** (`normalize()` + `clientes.horario_funcionamento`, `avaliacao_google`, `google_atualizado_em`) e **atualização automática pelo `place_id`** (`atualizarDadosGoogle`). Nossa decisão documentada: termos do Google proíbem guardar o conteúdo além do `place_id`/coordenadas por prazo curto (`N/docs/superpowers/specs/2026-10-19-prospeccao-rotas-automacao-design.md` §3). Não confirmado o texto atual dos termos fora desse documento.
- **Cotação fixa 5,5 e preço fixo de US$ 0,035/busca** como verdade (sem fonte no código).
- **Chave do Google Maps no bundle do navegador** (`VITE_..._BROWSER_KEY`, chave omitida) e dependência do `connector-gateway.lovable.dev`.
- **Constantes de rota como padrão** (20 min por cliente, 25 km/h sem fator de rua), pois a nossa é calibrável e mais realista.
- **Dado "dia UTC"** em indicadores (`slice(0,10)`).

## 7. Perguntas abertas para o dono

1. Voucher da 1ª contratação grátis existe como cupom real no Freela? Quem aprova e qual o limite por cliente?
2. Pode ser coletado telefone/e-mail de quem atendeu na visita (dado de terceiros)?
3. A nota do dia (0–10, 70% rota + 30% conversão) deve ser mostrada ao consultor, ou só os números com a conta?
4. Quais os motivos oficiais de recusa e o checklist de abordagem (as 7 etapas do chefe servem)?
5. Shoppings entram no escopo? Se sim, rota interna por shopping vale o esforço L?
6. Diária (valor fixo por dia trabalhado) existe no seu modelo de pagamento, ou é 100% variável como na nossa regra?
7. O chefe precisa de perfil "gestor" separado de admin, e de mais de uma praça por representante?
8. Seguimos sem Google Places (só Overpass e Apify) mesmo que o chefe espere a busca em grade pelo Google?
