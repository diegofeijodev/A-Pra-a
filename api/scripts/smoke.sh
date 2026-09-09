#!/usr/bin/env bash
# Smoke test da API do PRAÇA. Não sobe nada: conversa com a API viva.
#   npm run smoke            (API em http://localhost:3014)
API=${API:-http://localhost:3014}
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko(){ FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s — %s\n' "$1" "$2"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "esperado '$2', veio '$3'"; fi }

J='Content-Type: application/json'
# Sufixo novo a cada rodada: o smoke cria uma pessoa de teste de verdade.
# Nanossegundos (não só segundos) — duas rodadas no mesmo segundo não colidem.
SUF=${SUF:-$(date +%s%N)}
EMAIL_TESTE="teste$SUF@praca.local"

echo "── Saúde e login ──"
check "health" "ok" "$(curl -s $API/health | jq -r .status)"

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
TD=$(echo "$DIEGO" | jq -r .access_token); HD="Authorization: Bearer $TD"
[ "$TD" != "null" ] && ok "login do Diego" || ko "login do Diego" "$DIEGO"
DIEGO_ID=$(echo "$DIEGO" | jq -r .user.id)
check "UserView não vaza password_hash" "false" "$(echo "$DIEGO" | jq '.user | has("password_hash")')"
check "senha errada = INVALID_CREDENTIALS" "INVALID_CREDENTIALS" \
  "$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"errada"}' | jq -r .error.code)"

DANIEL=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"daniel@praca.local","password":"praca123"}')
TN=$(echo "$DANIEL" | jq -r .access_token); HN="Authorization: Bearer $TN"
[ "$TN" != "null" ] && ok "login do Daniel" || ko "login do Daniel" "$DANIEL"
DANIEL_ID=$(echo "$DANIEL" | jq -r .user.id)

check "sem token em /v1/users = UNAUTHORIZED" "UNAUTHORIZED" "$(curl -s $API/v1/users | jq -r .error.code)"
check "daniel (não admin) não cria pessoa" "FORBIDDEN" \
  "$(curl -s -X POST $API/v1/users -H "$J" -H "$HN" -d "{\"email\":\"$EMAIL_TESTE\",\"password\":\"teste123\",\"name\":\"Teste\"}" | jq -r .error.code)"

CRIA_STATUS=$(curl -s -o /tmp/praca-smoke-cria.json -w '%{http_code}' -X POST $API/v1/users -H "$J" -H "$HD" \
  -d "{\"email\":\"$EMAIL_TESTE\",\"password\":\"teste123\",\"name\":\"Teste\"}")
check "diego cria pessoa de teste = 201" "201" "$CRIA_STATUS"
TESTE_ID=$(jq -r .id /tmp/praca-smoke-cria.json)
check "e-mail repetido barrado" "EMAIL_IN_USE" \
  "$(curl -s -X POST $API/v1/users -H "$J" -H "$HD" -d "{\"email\":\"$EMAIL_TESTE\",\"password\":\"teste123\",\"name\":\"Teste\"}" | jq -r .error.code)"

check "PATCH /v1/users/me troca o tema" "light" \
  "$(curl -s -X PATCH $API/v1/users/me -H "$J" -H "$HD" -d '{"theme":"light"}' | jq -r .theme)"

echo "── Senha ──"
TESTE_LOGIN=$(curl -s -X POST $API/v1/auth/login -H "$J" -d "{\"email\":\"$EMAIL_TESTE\",\"password\":\"teste123\"}")
HT="Authorization: Bearer $(echo "$TESTE_LOGIN" | jq -r .access_token)"
check "a própria pessoa troca a senha" "true" \
  "$(curl -s -X PUT $API/v1/users/$TESTE_ID/password -H "$J" -H "$HT" -d '{"password":"novaSenha123"}' | jq -r .ok)"
check "daniel não troca senha alheia" "FORBIDDEN" \
  "$(curl -s -X PUT $API/v1/users/$TESTE_ID/password -H "$J" -H "$HN" -d '{"password":"outra123456"}' | jq -r .error.code)"
check "admin troca senha de qualquer um" "true" \
  "$(curl -s -X PUT $API/v1/users/$TESTE_ID/password -H "$J" -H "$HD" -d '{"password":"teste123"}' | jq -r .ok)"

echo "── Regras de desativação ──"
check "id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s -X PATCH $API/v1/users/nao-e-uuid -H "$J" -H "$HD" -d '{"sort":1}' | jq -r .error.code)"

# Diego é o único admin neste ponto: rebaixar OU desativar a si mesmo tiraria
# o último admin ativo do sistema — LAST_ADMIN barra as duas formas.
check "único admin não se autorrebaixa (is_admin:false)" "LAST_ADMIN" \
  "$(curl -s -X PATCH $API/v1/users/$DIEGO_ID -H "$J" -H "$HD" -d '{"is_admin":false}' | jq -r .error.code)"
check "único admin não se autodesativa (active:false)" "LAST_ADMIN" \
  "$(curl -s -X PATCH $API/v1/users/$DIEGO_ID -H "$J" -H "$HD" -d '{"active":false}' | jq -r .error.code)"

# Promove a pessoa de teste a admin: agora há 2 admins ativos, então desativar
# Diego não é mais "o último admin" — vira caso puro de CANNOT_DEACTIVATE_SELF.
curl -s -X PATCH $API/v1/users/$TESTE_ID -H "$J" -H "$HD" -d '{"is_admin":true}' > /dev/null
check "admin não desativa a si mesmo (havendo outro admin)" "CANNOT_DEACTIVATE_SELF" \
  "$(curl -s -X DELETE $API/v1/users/$DIEGO_ID -H "$HD" | jq -r .error.code)"

curl -s -X DELETE $API/v1/users/$TESTE_ID -H "$HD" > /dev/null
check "conta de teste desativada" "false" \
  "$(curl -s $API/v1/users -H "$HD" | jq --arg i "$TESTE_ID" '[.[] | select(.id==$i)][0].active')"
check "login da conta desativada = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s -X POST $API/v1/auth/login -H "$J" -d "{\"email\":\"$EMAIL_TESTE\",\"password\":\"teste123\"}" | jq -r .error.code)"

# Sem resíduo: o Diego seed nasce com theme "dark" — o smoke trocou para
# "light" lá em cima, então devolve antes de terminar.
check "tema do Diego restaurado (sem resíduo)" "dark" \
  "$(curl -s -X PATCH $API/v1/users/me -H "$J" -H "$HD" -d '{"theme":"dark"}' | jq -r .theme)"

echo "── Catálogo ──"
# Sem header de Authorization: /v1/catalog é pública (@Public()).
CATALOGO=$(curl -s $API/v1/catalog)
check "catálogo é público: .steps|length" "11" "$(echo "$CATALOGO" | jq '.steps | length')"
check "catálogo: .send_modes|length" "2" "$(echo "$CATALOGO" | jq '.send_modes | length')"
check "catálogo: .indicators|length" "12" "$(echo "$CATALOGO" | jq '.indicators | length')"

echo "── Geo ──"
# Público, só leitura do JSON estático (data/municipios.json) — sem resíduo.
check "estados|length == 27" "27" "$(curl -s $API/v1/geo/estados | jq 'length')"
check "municipios sem uf = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s $API/v1/geo/municipios | jq -r .error.code)"
check "municipios?uf=MG traz Belo Horizonte" "true" \
  "$(curl -s "$API/v1/geo/municipios?uf=MG" | jq 'any(.nome=="Belo Horizonte")')"
check "municipios?uf=RJ não traz Rio de Janeiro (regra EXCLUIR geo.ts:26)" "false" \
  "$(curl -s "$API/v1/geo/municipios?uf=RJ" | jq 'any(.nome=="Rio de Janeiro")')"
check "vizinhas de Belo Horizonte (3106200, raio padrão) >= 10" "true" \
  "$(curl -s "$API/v1/geo/municipios/3106200/vizinhas" | jq '(.vizinhas | length) >= 10')"
check "vizinhas: da maior para a menor população" "true" \
  "$(curl -s "$API/v1/geo/municipios/3106200/vizinhas" | jq '[.vizinhas[].pop] as $p | $p == ($p | sort | reverse)')"
check "vizinhas: ibge inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s "$API/v1/geo/municipios/0000000/vizinhas" | jq -r .error.code)"
check "vizinhas: km fora do range (301) = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/geo/municipios/3106200/vizinhas?km=301" | jq -r .error.code)"

echo "── Praças e ações ──"
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"

# --- praça do seed: só leitura, nada aqui deixa resíduo ---
check "praça do seed tem as 84 ações do roteiro" "84" \
  "$(curl -s "$API/v1/actions?praca_id=$PRACA_SEED" -H "$HD" | jq 'length')"
check "roteiro-modelo tem 84 ações-modelo" "84" \
  "$(curl -s $API/v1/template-actions -H "$HD" | jq 'length')"
check "ação s1a1 nasce com os subitens do how_to" "3" \
  "$(curl -s "$API/v1/actions?praca_id=$PRACA_SEED" -H "$HD" | jq '[.[] | select(.template_key=="s1a1")][0].subitems | length')"

ETAPAS=$(curl -s $API/v1/pracas/$PRACA_SEED/steps -H "$HD")
check "etapa 2 do seed com resultado 22" "22" "$(echo "$ETAPAS" | jq '[.[] | select(.n==2)][0].actual')"
check "etapa 3 travada pelo portão (22 < 40)" "locked" "$(echo "$ETAPAS" | jq -r '[.[] | select(.n==3)][0].status')"
check "etapa 3 diz qual portão falta" "true" \
  "$(echo "$ETAPAS" | jq '[.[] | select(.n==3)][0].lock_reason | startswith("Falta bater o Portão")')"
check "GET /steps devolve as 11 etapas" "11" "$(echo "$ETAPAS" | jq 'length')"

AGENDA=$(curl -s $API/v1/pracas/$PRACA_SEED/agenda -H "$HD")
check "agenda: carga do dia com as 3 pessoas" "3" "$(echo "$AGENDA" | jq '.load | length')"
check "agenda: sem from/to, by_date vem vazio" "0" "$(echo "$AGENDA" | jq '.by_date | length')"
check "agenda: from..to inclusive (3 dias)" "3" \
  "$(curl -s "$API/v1/pracas/$PRACA_SEED/agenda?from=2026-09-01&to=2026-09-03" -H "$HD" | jq '.by_date | length')"
check "agenda: intervalo acima de 62 dias barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/pracas/$PRACA_SEED/agenda?from=2026-01-01&to=2026-12-31" -H "$HD" | jq -r .error.code)"
check "agenda: person que não é 'all' nem uuid barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/pracas/$PRACA_SEED/agenda?person=fulano" -H "$HD" | jq -r .error.code)"
check "praça com id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s $API/v1/pracas/nao-e-uuid -H "$HD" | jq -r .error.code)"

# --- praça de teste: tudo que escreve acontece aqui e some no DELETE do fim ---
NOVA=$(curl -s -X POST $API/v1/pracas -H "$J" -H "$HD" \
  -d "{\"name\":\"Praça $SUF\",\"city\":\"Belo Horizonte · MG\",\"start_date\":\"2026-09-01\",\"end_date\":\"2026-12-08\",\"cobertura\":{\"ibge\":\"3106200\"}}")
NOVA_ID=$(echo "$NOVA" | jq -r .id)
check "praça nova instancia as 84 ações do roteiro" "84" \
  "$(curl -s "$API/v1/actions?praca_id=$NOVA_ID" -H "$HD" | jq 'length')"
check "cobertura resolvida pelo IBGE traz as vizinhas" "true" "$(echo "$NOVA" | jq '(.cobertura.vizinhas | length) > 0')"
check "cobertura guarda a cidade-sede" "Belo Horizonte" "$(echo "$NOVA" | jq -r .cobertura.cidade)"
check "quem abre a praça entra nela (active_praca_id)" "$NOVA_ID" \
  "$(curl -s $API/v1/auth/me -H "$HD" | jq -r .user.active_praca_id)"
check "praça nova: fim antes do começo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/pracas -H "$J" -H "$HD" -d '{"name":"X","city":"Y","start_date":"2026-09-10","end_date":"2026-09-01"}' | jq -r .error.code)"
check "data que não existe no calendário barrada (2026-02-31)" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/pracas -H "$J" -H "$HD" -d '{"name":"X","city":"Y","start_date":"2026-02-31","end_date":"2026-12-08"}' | jq -r .error.code)"
check "agenda: from com mês/dia impossível barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/pracas/$NOVA_ID/agenda?from=2026-13-45&to=2026-13-46" -H "$HD" | jq -r .error.code)"
check "adiar para data que não existe barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/actions/00000000-0000-4000-8000-00000000beef/postpone -H "$J" -H "$HD" -d '{"new_date":"2026-02-31","reason":"não vale"}' | jq -r .error.code)"

check "etapa 3 da praça nova nasce travada" "locked" \
  "$(curl -s $API/v1/pracas/$NOVA_ID/steps -H "$HD" | jq -r '[.[] | select(.n==3)][0].status')"
DESTRAVE=$(curl -s -X POST $API/v1/pracas/$NOVA_ID/steps/3/unlock -H "$J" -H "$HD" -d '{"reason":"decisão do Diego no smoke"}')
check "destravar a etapa 3 solta para 'todo'" "todo" "$(echo "$DESTRAVE" | jq -r .status)"
check "destrave registra quem destravou" "$DIEGO_ID" "$(echo "$DESTRAVE" | jq -r .unlock.by)"
check "lançar resultado da etapa 2" "40" \
  "$(curl -s -X PUT $API/v1/pracas/$NOVA_ID/steps/2/result -H "$J" -H "$HD" -d '{"value":40}' | jq '.actual')"
check "etapa que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X PUT $API/v1/pracas/$NOVA_ID/steps/99/result -H "$J" -H "$HD" -d '{"value":1}' | jq -r .error.code)"

ACOES=$(curl -s "$API/v1/actions?praca_id=$NOVA_ID" -H "$HD")
S1A2=$(echo "$ACOES" | jq -r '[.[] | select(.template_key=="s1a2")][0].id')
F1=$(echo "$ACOES" | jq -r '[.[] | select(.template_key=="f1")][0].id')
check "concluir ação com data marcada grava completed_at" "true" \
  "$(curl -s -X POST $API/v1/actions/$S1A2/complete -H "$J" -H "$HD" -d '{}' | jq '.completed_at != null')"
check "desfazer a conclusão volta para null" "null" \
  "$(curl -s -X POST $API/v1/actions/$S1A2/uncomplete -H "$J" -H "$HD" -d '{}' | jq -r '.completed_at')"
check "concluir ação recorrente registra a ocorrência do dia" "1" \
  "$(curl -s -X POST $API/v1/actions/$F1/complete -H "$J" -H "$HD" -d '{"date":"2026-09-07"}' | jq '.completions | length')"
check "desfazer a ocorrência do dia" "0" \
  "$(curl -s -X POST $API/v1/actions/$F1/uncomplete -H "$J" -H "$HD" -d '{"date":"2026-09-07"}' | jq '.completions | length')"

S2A7=$(echo "$ACOES" | jq -r '[.[] | select(.template_key=="s2a7")][0].id')
check "concluir com resultado grava o número" "42" \
  "$(curl -s -X POST $API/v1/actions/$S2A7/complete -H "$J" -H "$HD" -d '{"result":42}' | jq '.result')"
check "reconcluir sem resultado mantém o número" "42" \
  "$(curl -s -X POST $API/v1/actions/$S2A7/complete -H "$J" -H "$HD" -d '{}' | jq '.result')"
check "concluir com outro resultado sobrescreve" "7" \
  "$(curl -s -X POST $API/v1/actions/$S2A7/complete -H "$J" -H "$HD" -d '{"result":7}' | jq '.result')"
check "desfazer limpa o resultado" "null" \
  "$(curl -s -X POST $API/v1/actions/$S2A7/uncomplete -H "$J" -H "$HD" -d '{}' | jq -r '.result')"
check "ocorrência recorrente também mantém o resultado" "9" \
  "$(curl -s -X POST $API/v1/actions/$F1/complete -H "$J" -H "$HD" -d '{"date":"2026-09-07","result":9}' > /dev/null; curl -s -X POST $API/v1/actions/$F1/complete -H "$J" -H "$HD" -d '{"date":"2026-09-07"}' | jq '.completions["2026-09-07"].result')"
curl -s -X POST $API/v1/actions/$F1/uncomplete -H "$J" -H "$HD" -d '{"date":"2026-09-07"}' > /dev/null

ADIADA=$(curl -s -X POST $API/v1/actions/$S1A2/postpone -H "$J" -H "$HD" -d '{"new_date":"2026-09-30","reason":"dono viajou"}')
check "adiar conta o adiamento" "1" "$(echo "$ADIADA" | jq '.postpone_count')"
check "adiar muda a data devida" "2026-09-30" "$(echo "$ADIADA" | jq -r '.due_override')"
check "adiar deixa comentário com data e motivo" "true" \
  "$(echo "$ADIADA" | jq '.comments[-1].text == "Adiada para 30/09/2026 — dono viajou"')"
check "adiar ação recorrente é barrado" "ACTION_NOT_POSTPONABLE" \
  "$(curl -s -X POST $API/v1/actions/$F1/postpone -H "$J" -H "$HD" -d '{"new_date":"2026-09-30","reason":"não vale"}' | jq -r .error.code)"
check "recalc-dates zera adiamentos da praça" "true" \
  "$(curl -s -X POST $API/v1/pracas/$NOVA_ID/recalc-dates -H "$HD" | jq '.updated >= 84')"
check "ação volta para a data do roteiro" "0" \
  "$(curl -s $API/v1/actions/$S1A2 -H "$HD" | jq '.postpone_count')"
check "recalc-dates limpa o due_override" "null" \
  "$(curl -s $API/v1/actions/$S1A2 -H "$HD" | jq -r '.due_override')"

check "passar a ação para outra pessoa" "$DANIEL_ID" \
  "$(curl -s -X POST $API/v1/actions/$S1A2/reassign -H "$J" -H "$HD" -d "{\"user_id\":\"$DANIEL_ID\"}" | jq -r '.owners[0]')"
SUB=$(curl -s -X POST $API/v1/actions/$S1A2/subitems -H "$J" -H "$HD" -d '{"text":"subitem do smoke"}')
SUB_ID=$(echo "$SUB" | jq -r '.subitems[-1].id')
check "marcar subitem" "true" \
  "$(curl -s -X POST $API/v1/actions/$S1A2/subitems/$SUB_ID/toggle -H "$HD" | jq '.subitems[-1].done')"
check "subitem de outra ação = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/actions/$F1/subitems/$SUB_ID/toggle -H "$HD" | jq -r .error.code)"

AVULSA=$(curl -s -X POST $API/v1/actions -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$NOVA_ID\",\"title\":\"Ação avulsa do smoke\",\"owners\":[\"$DIEGO_ID\"],\"due_date\":\"2026-09-20\"}")
check "ação avulsa entra como fixa (step 0)" "0" "$(echo "$AVULSA" | jq '.step')"
check "ação avulsa fica com a data escolhida" "2026-09-20" "$(echo "$AVULSA" | jq -r '.due_override')"
check "ação avulsa com dono inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/actions -H "$J" -H "$HD" -d "{\"praca_id\":\"$NOVA_ID\",\"title\":\"X\",\"owners\":[\"00000000-0000-4000-8000-00000000dead\"],\"due_date\":\"2026-09-20\"}" | jq -r .error.code)"
check "ação que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/actions/00000000-0000-4000-8000-00000000beef -H "$HD" | jq -r .error.code)"

echo "── Roteiro-modelo (só admin escreve) ──"
check "daniel (não admin) não cria ação-modelo" "FORBIDDEN" \
  "$(curl -s -X POST $API/v1/template-actions -H "$J" -H "$HN" -d "{\"step\":1,\"title\":\"Não deve entrar\",\"owners\":[\"$DIEGO_ID\"],\"rec\":{\"kind\":\"once\",\"day\":1}}" | jq -r .error.code)"
check "daniel não apaga praça" "FORBIDDEN" "$(curl -s -X DELETE $API/v1/pracas/$NOVA_ID -H "$HN" | jq -r .error.code)"
MODELO=$(curl -s -X POST $API/v1/template-actions -H "$J" -H "$HD" \
  -d "{\"step\":1,\"title\":\"Ação-modelo do smoke $SUF\",\"owners\":[\"$DIEGO_ID\"],\"rec\":{\"kind\":\"weekly\",\"weekday\":2,\"start_day\":10}}")
MODELO_ID=$(echo "$MODELO" | jq -r .id)
check "admin cria ação-modelo com recorrência semanal" "2" "$(echo "$MODELO" | jq '.rec.weekday')"
check "rec sem o campo do kind = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/template-actions -H "$J" -H "$HD" -d "{\"step\":1,\"title\":\"X\",\"owners\":[\"$DIEGO_ID\"],\"rec\":{\"kind\":\"monthly\",\"start_day\":1}}" | jq -r .error.code)"
check "admin edita a ação-modelo" "Ação-modelo editada" \
  "$(curl -s -X PATCH $API/v1/template-actions/$MODELO_ID -H "$J" -H "$HD" -d '{"title":"Ação-modelo editada"}' | jq -r .title)"
check "admin apaga a ação-modelo (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/template-actions/$MODELO_ID -H "$HD" | jq -r .ok)"
check "roteiro-modelo voltou às 84" "84" "$(curl -s $API/v1/template-actions -H "$HD" | jq 'length')"

echo "── Funil ──"
# "Hoje" do servidor é Brasília: as contas de data do funil (reaquecimento,
# soneca, dias parado) precisam bater com o mesmo fuso.
HOJE=$(TZ=America/Sao_Paulo date +%F)
HOJE3=$(TZ=America/Sao_Paulo date -d '+3 days' +%F)
HOJE30=$(TZ=America/Sao_Paulo date -d '+30 days' +%F)

check "funil da praça seed tem os 25 leads do protótipo" "true" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED" -H "$HD" | jq 'length >= 25')"
check "busca por texto ignora maiúsculas" "Bar do Mercado" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&q=bar%20do%20mercado" -H "$HD" | jq -r '.[0].name')"
check "casa grande vale R$ 4.500 estimados" "true" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&classe=grande" -H "$HD" | jq '[.[] | select(.est_value != 4500)] | length == 0')"
check "lead parado no seed conta os dias sem contato" "true" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&q=Casa%20de%20Eventos%20Aurora" -H "$HD" | jq '.[0].stalled_days >= 17')"

LEAD=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Bar $SUF\",\"city\":\"Belo Horizonte\",\"phone\":\"(31) 98888-7777\",\"decisor\":\"Fulano de Teste\",\"classe\":\"alvo\",\"origem\":\"prospecção\",\"owner_id\":\"$DIEGO_ID\"}")
LEAD_ID=$(echo "$LEAD" | jq -r .id)
check "lead novo nasce na etapa 1" "1" "$(echo "$LEAD" | jq '.stage')"
check "lead novo entra hoje" "$HOJE" "$(echo "$LEAD" | jq -r '.entered_at')"
check "lead novo sem contato tem 0 dia parado" "0" "$(echo "$LEAD" | jq '.stalled_days')"
check "lead com dono inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" -d "{\"name\":\"X\",\"phone\":\"31999999999\",\"classe\":\"alvo\",\"origem\":\"prospecção\",\"owner_id\":\"00000000-0000-4000-8000-00000000dead\"}" | jq -r .error.code)"

# Origem é texto livre: a importação, o formulário público e o diálogo de novo
# lead usam origens fora da lista curta do catálogo.
LEAD_ORIGEM=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Origem $SUF\",\"phone\":\"(31) 97777-6666\",\"classe\":\"depois\",\"origem\":\" prospecção ativa \",\"owner_id\":\"$DIEGO_ID\"}")
check "origem fora da lista curta é aceita e vem aparada" "prospecção ativa" \
  "$(echo "$LEAD_ORIGEM" | jq -r .origem)"
curl -s -X DELETE $API/v1/leads/$(echo "$LEAD_ORIGEM" | jq -r .id) -H "$HD" > /dev/null

FILA=$(curl -s "$API/v1/leads/queue" -H "$HD")
check "fila do dia traz o lead novo" "1" \
  "$(echo "$FILA" | jq --arg i "$LEAD_ID" '[.items[] | select(.id==$i)] | length')"
check "fila do dia usa a cota padrão (20) sem app_settings" "20" "$(echo "$FILA" | jq '.quota')"
check "fila do dia nunca passa da cota" "true" "$(echo "$FILA" | jq '(.items | length) <= .quota')"
check "casa grande vem na frente da fila" "grande" "$(echo "$FILA" | jq -r '.items[0].classe')"
check "fila conta as casas grandes" "true" "$(echo "$FILA" | jq '.grandes >= 1')"
check "fila de uma pessoa só traz os leads dela" "0" \
  "$(curl -s "$API/v1/leads/queue?person=$DIEGO_ID" -H "$HD" | jq --arg i "$DANIEL_ID" '[.items[] | select(.owner_id==$i)] | length')"
check "person inválido na fila = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/leads/queue?person=fulano" -H "$HD" | jq -r .error.code)"

check "soneca marca a data" "$HOJE3" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/snooze -H "$J" -H "$HD" -d "{\"until\":\"$HOJE3\"}" | jq -r .snooze_until)"
check "soneca tira o lead da fila do dia" "0" \
  "$(curl -s "$API/v1/leads/queue" -H "$HD" | jq --arg i "$LEAD_ID" '[.items[] | select(.id==$i)] | length')"

check "mover sem próximo passo = NEXT_STEP_REQUIRED" "NEXT_STEP_REQUIRED" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d '{"stage":2}' | jq -r .error.code)"
MOVIDO=$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" \
  -d "{\"stage\":2,\"next_step\":{\"what\":\"Novo toque no WhatsApp\",\"date\":\"$HOJE3\"}}")
check "mover grava o evento de etapa" "2" "$(echo "$MOVIDO" | jq '.events[-1].stage_to')"
check "texto da mudança de etapa" "Mudou de etapa: Lead novo → Contatado" \
  "$(echo "$MOVIDO" | jq -r '.events[-1].text')"
check "mover reinicia o relógio da etapa" "$HOJE" "$(echo "$MOVIDO" | jq -r '.stage_since')"
check "próximo passo fica no lead" "Novo toque no WhatsApp" "$(echo "$MOVIDO" | jq -r '.next_step.what')"
check "mover para a mesma etapa = SAME_STAGE" "SAME_STAGE" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d "{\"stage\":2,\"next_step\":{\"what\":\"x\",\"date\":\"$HOJE3\"}}" | jq -r .error.code)"
check "voltar de etapa é registrado como volta" "Voltou etapa: Contatado → Lead novo" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d "{\"stage\":1,\"next_step\":{\"what\":\"x\",\"date\":\"$HOJE3\"}}" | jq -r '.events[-1].text')"

EVENTO=$(curl -s -X POST $API/v1/leads/$LEAD_ID/events -H "$J" -H "$HD" -d '{"kind":"call","text":"Liguei, falei com o gerente."}')
check "ligação preenche o último contato" "true" "$(echo "$EVENTO" | jq '.last_contact_at != null')"
check "último contato é hoje (Brasília)" "$HOJE" "$(echo "$EVENTO" | jq -r '.last_contact_date')"
check "contato zera os dias parado" "0" "$(echo "$EVENTO" | jq '.stalled_days')"
check "nota não conta como contato" "note" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/events -H "$J" -H "$HD" -d '{"kind":"note","text":"Anotação do smoke."}' | jq -r '.events[-1].kind')"
check "etapa não entra por /events" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/events -H "$J" -H "$HD" -d '{"kind":"stage","text":"não deve entrar"}' | jq -r .error.code)"

check "perder sem motivo = LOST_REASON_REQUIRED" "LOST_REASON_REQUIRED" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d '{"stage":8}' | jq -r .error.code)"
check "motivo fora da lista = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d '{"stage":8,"lost_reason":"cansei"}' | jq -r .error.code)"
PERDIDO=$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d '{"stage":8,"lost_reason":"não respondeu"}')
check "'não respondeu' agenda o reaquecimento para daqui a 30 dias" "$HOJE30" \
  "$(echo "$PERDIDO" | jq -r '.reheat_at')"
check "motivo entra no texto do evento" "true" \
  "$(echo "$PERDIDO" | jq '.events[-1].text | endswith(" · motivo: não respondeu")')"
check "sair da etapa 8 limpa motivo e reaquecimento" "null" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d "{\"stage\":3,\"next_step\":{\"what\":\"Retomar\",\"date\":\"$HOJE3\"}}" | jq -r '.reheat_at')"

check "PUT next-step troca o próximo passo" "Mandar a proposta" \
  "$(curl -s -X PUT $API/v1/leads/$LEAD_ID/next-step -H "$J" -H "$HD" -d "{\"what\":\"Mandar a proposta\",\"date\":\"$HOJE3\"}" | jq -r '.next_step.what')"
check "PATCH edita o decisor" "Beltrana de Teste" \
  "$(curl -s -X PATCH $API/v1/leads/$LEAD_ID -H "$J" -H "$HD" -d '{"decisor":"Beltrana de Teste"}' | jq -r .decisor)"
check "PATCH não mexe em etapa" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $API/v1/leads/$LEAD_ID -H "$J" -H "$HD" -d '{"stage":5}')"
check "vaga entra na ficha do lead" "1" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/vagas -H "$J" -H "$HD" -d "{\"date\":\"$HOJE\",\"funcao\":\"Garçom\",\"filled\":true,\"hours\":6}" | jq '.vagas_count')"

MET=$(curl -s "$API/v1/leads/metrics?praca_id=$PRACA_SEED" -H "$HD")
check "métricas contam o funil inteiro" "true" "$(echo "$MET" | jq '.total >= 26')"
check "métricas somam o valor do pipeline" "true" "$(echo "$MET" | jq '.pipeline > 0')"
check "métricas trazem as conversões em %" "true" \
  "$(echo "$MET" | jq '(.conv_contact >= 0 and .conv_contact <= 100) and (.conv_active >= 0 and .conv_active <= 100)')"
check "lead com praça não é órfão" "0" \
  "$(curl -s $API/v1/leads/orphans -H "$HD" | jq --arg i "$LEAD_ID" '[.[] | select(.id==$i)] | length')"

check "arquivar deixa a nota no histórico" "Lead arquivado (histórico mantido)." \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/archive -H "$HD" | jq -r '.events[-1].text')"
check "arquivado some da lista" "0" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED" -H "$HD" | jq --arg i "$LEAD_ID" '[.[] | select(.id==$i)] | length')"
check "archived=true traz o arquivado de volta" "1" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&archived=true" -H "$HD" | jq --arg i "$LEAD_ID" '[.[] | select(.id==$i)] | length')"

check "id malformado = NOT_FOUND (não 500)" "NOT_FOUND" "$(curl -s $API/v1/leads/abc -H "$HD" | jq -r .error.code)"
check "lead que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/leads/00000000-0000-4000-8000-00000000beef -H "$HD" | jq -r .error.code)"

echo "── Limpeza do lead de teste ──"
check "daniel (não admin) não apaga lead" "FORBIDDEN" \
  "$(curl -s -X DELETE $API/v1/leads/$LEAD_ID -H "$HN" | jq -r .error.code)"
check "admin apaga o lead de teste (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$LEAD_ID -H "$HD" | jq -r .ok)"
check "lead de teste sumiu" "NOT_FOUND" "$(curl -s $API/v1/leads/$LEAD_ID -H "$HD" | jq -r .error.code)"
check "funil voltou aos 25 leads do seed" "25" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&archived=true" -H "$HD" | jq 'length')"

echo "── Entrada de leads ──"
# Telefone de um lead do seed com OUTRA máscara: a duplicidade olha os últimos
# 9 dígitos, não o texto.
DUP_DIG=$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&q=Bar%20do%20Mercado" -H "$HD" | jq -r '.[0].phone' | tr -cd '0-9')
COLS='["Nome","Telefone","Cidade"]'
MAPA='{"name":"Nome","phone":"Telefone","city":"Cidade"}'
LINHAS3="[{\"Nome\":\"Importado A $SUF\",\"Telefone\":\"(31) 97000-1234\",\"Cidade\":\"Belo Horizonte\"},{\"Nome\":\"Importado B $SUF\",\"Telefone\":\"\",\"Cidade\":\"Belo Horizonte\"},{\"Nome\":\"Duplicado $SUF\",\"Telefone\":\"+55 $DUP_DIG\",\"Cidade\":\"Belo Horizonte\"}]"

cat > /tmp/praca-smoke-import.json <<EOF
{"columns":$COLS,"rows":$LINHAS3,"map":$MAPA,"origem":"importação","dup_action":"ignorar","praca_mode":"lote","lote_praca_id":"$PRACA_SEED"}
EOF
AVAL=$(curl -s -X POST $API/v1/imports/evaluate -H "$J" -H "$HD" -d @/tmp/praca-smoke-import.json)
check "avaliação conta as 3 linhas do arquivo" "3" "$(echo "$AVAL" | jq '.total')"
check "telefone do seed com outra máscara é duplicidade" "1" "$(echo "$AVAL" | jq '.dups')"
check "linha sem telefone é contada" "1" "$(echo "$AVAL" | jq '.no_phone')"
check "só uma linha entra de verdade" "1" "$(echo "$AVAL" | jq '.will_import')"
check "avaliação diz qual lead duplicou" "Bar do Mercado" "$(echo "$AVAL" | jq -r '.rows[2].dup.lead_name')"
check "avaliação diz por qual regra duplicou" "telefone" "$(echo "$AVAL" | jq -r '.rows[2].dup.by')"
check "modo lote joga o arquivo inteiro na praça escolhida" "$PRACA_SEED" \
  "$(echo "$AVAL" | jq -r '.rows[0].praca_id')"
check "avaliação devolve o mapeamento adivinhado" "Nome" "$(echo "$AVAL" | jq -r '.guessed_map.name')"

# Modo "praça pela cidade do arquivo": linha de cidade sem praça vira órfã.
cat > /tmp/praca-smoke-import.json <<EOF
{"columns":$COLS,"rows":[{"Nome":"Cidade certa $SUF","Telefone":"(31) 97001-0001","Cidade":"Belo Horizonte"},{"Nome":"Cidade sem praça $SUF","Telefone":"(41) 97001-0002","Cidade":"Curitiba"}],"map":$MAPA,"origem":"importação","dup_action":"ignorar","praca_mode":"arquivo"}
EOF
ARQ=$(curl -s -X POST $API/v1/imports/evaluate -H "$J" -H "$HD" -d @/tmp/praca-smoke-import.json)
check "cidade do arquivo acha a praça" "true" "$(echo "$ARQ" | jq '.rows[0].praca_id != null')"
check "cidade sem praça fica sem praça" "null" "$(echo "$ARQ" | jq -r '.rows[1].praca_id')"
check "as duas entram, uma como órfã" "true" "$(echo "$ARQ" | jq '.will_import == 2 and .sem_praca == 1')"

check "modo lote sem praça = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/imports/evaluate -H "$J" -H "$HD" -d "{\"columns\":$COLS,\"rows\":[],\"map\":$MAPA,\"origem\":\"importação\",\"dup_action\":\"ignorar\",\"praca_mode\":\"lote\"}" | jq -r .error.code)"
check "praça inexistente na importação = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/imports/evaluate -H "$J" -H "$HD" -d "{\"columns\":$COLS,\"rows\":[],\"map\":$MAPA,\"origem\":\"importação\",\"dup_action\":\"ignorar\",\"praca_mode\":\"lote\",\"lote_praca_id\":\"00000000-0000-4000-8000-00000000beef\"}" | jq -r .error.code)"
check "campo fora do catálogo no mapa = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/imports/evaluate -H "$J" -H "$HD" -d "{\"columns\":$COLS,\"rows\":[],\"map\":{\"telefone\":\"Telefone\"},\"origem\":\"importação\",\"dup_action\":\"ignorar\",\"praca_mode\":\"lote\",\"lote_praca_id\":\"$PRACA_SEED\"}" | jq -r .error.code)"
check "linha que não é objeto de texto = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/imports/evaluate -H "$J" -H "$HD" -d "{\"columns\":$COLS,\"rows\":[\"linha\"],\"map\":$MAPA,\"origem\":\"importação\",\"dup_action\":\"ignorar\",\"praca_mode\":\"lote\",\"lote_praca_id\":\"$PRACA_SEED\"}" | jq -r .error.code)"

echo "── Mapeamentos salvos ──"
MAPEAMENTO=$(curl -s -X POST $API/v1/imports/mappings -H "$J" -H "$HD" -d "{\"name\":\"Mapa $SUF\",\"map\":$MAPA}")
MAPA_ID=$(echo "$MAPEAMENTO" | jq -r .id)
check "mapeamento salvo guarda o mapa" "Nome" "$(echo "$MAPEAMENTO" | jq -r '.map.name')"
check "mapeamento aparece na lista" "1" \
  "$(curl -s $API/v1/imports/mappings -H "$HD" | jq --arg i "$MAPA_ID" '[.[] | select(.id==$i)] | length')"
check "salvar com o mesmo nome substitui, não duplica" "$MAPA_ID" \
  "$(curl -s -X POST $API/v1/imports/mappings -H "$J" -H "$HD" -d "{\"name\":\"Mapa $SUF\",\"map\":{\"name\":\"Título\"}}" | jq -r .id)"
check "substituição trocou mesmo o mapa" "Título" \
  "$(curl -s $API/v1/imports/mappings -H "$HD" | jq -r --arg i "$MAPA_ID" '[.[] | select(.id==$i)][0].map.name')"
check "apaga o mapeamento (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/imports/mappings/$MAPA_ID -H "$HD" | jq -r .ok)"
check "apagar mapeamento que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X DELETE $API/v1/imports/mappings/$MAPA_ID -H "$HD" | jq -r .error.code)"

echo "── Importar, completar e desfazer ──"
cat > /tmp/praca-smoke-import.json <<EOF
{"file_name":"leads-$SUF.csv","columns":$COLS,"rows":$LINHAS3,"map":$MAPA,"origem":"importação","dup_action":"ignorar","praca_mode":"lote","lote_praca_id":"$PRACA_SEED","owner_mode":"lote","lote_owner_id":"$DIEGO_ID"}
EOF
RUN=$(curl -s -X POST $API/v1/imports/run -H "$J" -H "$HD" -d @/tmp/praca-smoke-import.json)
LOTE_A=$(echo "$RUN" | jq -r .batch_id)
check "importação grava só a linha boa" "1" "$(echo "$RUN" | jq '.imported')"
check "duplicada e sem telefone ficam de fora" "2" "$(echo "$RUN" | jq '.ignored')"
check "relatório explica a duplicada" "1 duplicadas (ignoradas)" "$(echo "$RUN" | jq -r '.reasons[0]')"
check "relatório explica a linha sem telefone" "1 sem telefone" "$(echo "$RUN" | jq -r '.reasons[1]')"

IMPORTADO=$(curl -s "$API/v1/leads?q=Importado%20A%20$SUF" -H "$HD" | jq -r '.[0].id')
FICHA=$(curl -s $API/v1/leads/$IMPORTADO -H "$HD")
check "lead importado nasce na etapa 1" "1" "$(echo "$FICHA" | jq '.stage')"
check "lead importado entra hoje (Brasília)" "$HOJE" "$(echo "$FICHA" | jq -r '.entered_at')"
check "lead importado guarda o lote" "$LOTE_A" "$(echo "$FICHA" | jq -r '.import_batch_id')"
check "lead importado sem decisor vira travessão" "—" "$(echo "$FICHA" | jq -r '.decisor')"
check "lead importado vai para o dono escolhido" "$DIEGO_ID" "$(echo "$FICHA" | jq -r '.owner_id')"
check "importação deixa a nota na ficha" "Lead importado de leads-$SUF.csv · origem importação." \
  "$(echo "$FICHA" | jq -r '.events[-1].text')"
check "lead importado sem duplicidade não é 'possível duplicado'" "false" "$(echo "$FICHA" | jq '.possible_dup')"

LOTES=$(curl -s $API/v1/imports -H "$HD")
check "lista de importações começa pela mais nova" "$LOTE_A" "$(echo "$LOTES" | jq -r '.[0].id')"
check "importação de agora pode ser desfeita" "true" "$(echo "$LOTES" | jq '.[0].can_undo')"
check "lista traz o arquivo e quem importou" "true" \
  "$(echo "$LOTES" | jq --arg b "$DIEGO_ID" '.[0].file_name != "" and .[0].by == $b')"

# Lead tocado não some no desfazer — desfazer importação não apaga conversa.
curl -s -X POST $API/v1/leads/$IMPORTADO/events -H "$J" -H "$HD" -d '{"kind":"call","text":"Liguei antes de desfazer."}' > /dev/null
DESFAZ_A=$(curl -s -X POST $API/v1/imports/$LOTE_A/undo -H "$HD")
check "desfazer não apaga lead já trabalhado" "0" "$(echo "$DESFAZ_A" | jq '.removed')"
check "lead trabalhado fica no lugar" "1" "$(echo "$DESFAZ_A" | jq '.kept')"
check "desfazer deixa o motivo no lote" "true" \
  "$(curl -s $API/v1/imports -H "$HD" | jq '[.[0].reasons[] | select(. == "0 leads removidos por desfazer importação")] | length == 1')"
curl -s -X DELETE $API/v1/leads/$IMPORTADO -H "$HD" > /dev/null

# dup_action "criar": entra mesmo duplicado, marcado para conferência.
cat > /tmp/praca-smoke-import.json <<EOF
{"file_name":"duplicados-$SUF.csv","columns":$COLS,"rows":[{"Nome":"Duplicado $SUF","Telefone":"+55 $DUP_DIG","Cidade":"Belo Horizonte"}],"map":$MAPA,"origem":"importação","dup_action":"criar","praca_mode":"lote","lote_praca_id":"$PRACA_SEED","owner_mode":"rodizio","rodizio_ids":["$DIEGO_ID","$DANIEL_ID"]}
EOF
RUN_DUP=$(curl -s -X POST $API/v1/imports/run -H "$J" -H "$HD" -d @/tmp/praca-smoke-import.json)
LOTE_DUP=$(echo "$RUN_DUP" | jq -r .batch_id)
check "com 'criar', a duplicada entra" "1" "$(echo "$RUN_DUP" | jq '.imported')"
check "relatório diz que entrou como possível duplicado" "1 duplicadas (criadas como possível duplicado)" \
  "$(echo "$RUN_DUP" | jq -r '.reasons[0]')"
DUPLICADO=$(curl -s "$API/v1/leads?q=Duplicado%20$SUF" -H "$HD")
check "lead criado assim fica marcado como possível duplicado" "true" \
  "$(echo "$DUPLICADO" | jq '.[0].possible_dup')"
check "rodízio começa pelo primeiro da fila" "$DIEGO_ID" "$(echo "$DUPLICADO" | jq -r '.[0].owner_id')"
# Desfazer não é ferramenta de admin: é o botão de quem importou (§10).
DESFAZ_DUP=$(curl -s -X POST $API/v1/imports/$LOTE_DUP/undo -H "$HN")
check "vendedor (não admin) desfaz a importação" "1" "$(echo "$DESFAZ_DUP" | jq '.removed')"
check "desfazer não deixa nada para trás" "0" "$(echo "$DESFAZ_DUP" | jq '.kept')"
check "lead desfeito sumiu da lista" "0" "$(curl -s "$API/v1/leads?q=Duplicado%20$SUF" -H "$HD" | jq 'length')"

# dup_action "completar": não cria nada, só preenche o que estava vazio.
VAZIO=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Completar $SUF\",\"phone\":\"(31) 96000-0001\",\"classe\":\"alvo\",\"origem\":\"prospecção\",\"owner_id\":\"$DIEGO_ID\"}")
VAZIO_ID=$(echo "$VAZIO" | jq -r .id)
cat > /tmp/praca-smoke-import.json <<EOF
{"file_name":"completar-$SUF.csv","columns":["Nome","Telefone","Endereço","CNPJ","Decisor"],"rows":[{"Nome":"Completar $SUF","Telefone":"+55 31960000001","Endereço":"Rua Nova 10","CNPJ":"12.345.678/0001-90","Decisor":"Fulano Completo"}],"map":{"name":"Nome","phone":"Telefone","address":"Endereço","cnpj":"CNPJ","decisor":"Decisor"},"origem":"importação","dup_action":"completar","praca_mode":"lote","lote_praca_id":"$PRACA_SEED","owner_mode":"lote","lote_owner_id":"$DIEGO_ID"}
EOF
RUN_COMP=$(curl -s -X POST $API/v1/imports/run -H "$J" -H "$HD" -d @/tmp/praca-smoke-import.json)
LOTE_COMP=$(echo "$RUN_COMP" | jq -r .batch_id)
check "completar não cria lead novo" "0" "$(echo "$RUN_COMP" | jq '.imported')"
check "completar atualiza o lead que já existia" "1" "$(echo "$RUN_COMP" | jq '.updated')"
check "relatório diz que completou campos vazios" "1 duplicadas (campos vazios completados)" \
  "$(echo "$RUN_COMP" | jq -r '.reasons[0]')"
COMPLETADO=$(curl -s $API/v1/leads/$VAZIO_ID -H "$HD")
check "endereço vazio foi completado" "Rua Nova 10" "$(echo "$COMPLETADO" | jq -r '.address')"
check "CNPJ vazio foi completado" "12.345.678/0001-90" "$(echo "$COMPLETADO" | jq -r '.cnpj')"
check "decisor '—' foi completado" "Fulano Completo" "$(echo "$COMPLETADO" | jq -r '.decisor')"
check "completar deixa a nota na ficha" "Campos vazios completados pela importação completar-$SUF.csv." \
  "$(echo "$COMPLETADO" | jq -r '.events[-1].text')"
check "desfazer não apaga lead que só foi completado" "0" \
  "$(curl -s -X POST $API/v1/imports/$LOTE_COMP/undo -H "$HD" | jq '.removed')"
check "admin apaga o lead do teste de completar (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$VAZIO_ID -H "$HD" | jq -r .ok)"

# Praça pela cidade do arquivo, gravando de verdade: a linha de cidade
# conhecida cai na praça mais antiga que casa; a desconhecida entra órfã.
cat > /tmp/praca-smoke-import.json <<EOF
{"file_name":"por-cidade-$SUF.csv","columns":$COLS,"rows":[{"Nome":"Arquivo BH $SUF","Telefone":"(31) 97002-0001","Cidade":"Belo Horizonte"},{"Nome":"Arquivo sem praça $SUF","Telefone":"(41) 97002-0002","Cidade":"Curitiba"}],"map":$MAPA,"origem":"importação","dup_action":"ignorar","praca_mode":"arquivo","owner_mode":"lote","lote_owner_id":"$DIEGO_ID"}
EOF
RUN_ARQ=$(curl -s -X POST $API/v1/imports/run -H "$J" -H "$HD" -d @/tmp/praca-smoke-import.json)
LOTE_ARQ=$(echo "$RUN_ARQ" | jq -r .batch_id)
check "importa as duas pela cidade do arquivo" "2" "$(echo "$RUN_ARQ" | jq '.imported')"
check "relatório avisa a linha que ficou sem praça" "1 sem praça" "$(echo "$RUN_ARQ" | jq -r '.reasons[0]')"
check "cidade conhecida cai na praça do seed" "$PRACA_SEED" \
  "$(curl -s "$API/v1/leads?q=Arquivo%20BH%20$SUF" -H "$HD" | jq -r '.[0].praca_id')"
ORFAO=$(curl -s "$API/v1/leads?q=Arquivo%20sem%20pra%C3%A7a%20$SUF" -H "$HD" | jq -r '.[0].id')
check "cidade desconhecida entra sem praça" "null" \
  "$(curl -s $API/v1/leads/$ORFAO -H "$HD" | jq -r '.praca_id')"
check "lead sem praça aparece na lista de órfãos" "1" \
  "$(curl -s $API/v1/leads/orphans -H "$HD" | jq --arg i "$ORFAO" '[.[] | select(.id==$i)] | length')"
DESFAZ_ARQ=$(curl -s -X POST $API/v1/imports/$LOTE_ARQ/undo -H "$HD")
check "desfazer leva as duas (inclusive a órfã)" "2" "$(echo "$DESFAZ_ARQ" | jq '.removed')"
check "nenhum órfão sobra do smoke" "0" \
  "$(curl -s $API/v1/leads/orphans -H "$HD" | jq --arg i "$ORFAO" '[.[] | select(.id==$i)] | length')"

check "desfazer importação que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/imports/00000000-0000-4000-8000-00000000beef/undo -H "$HD" | jq -r .error.code)"
check "id malformado no desfazer = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/imports/abc/undo -H "$HD" | jq -r .error.code)"
check "funil segue com os 25 leads do seed (sem resíduo)" "25" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&archived=true" -H "$HD" | jq 'length')"

echo "── Formulário público ──"
# Tudo aqui SEM Authorization: é a rota que roda embutida num anúncio, sem login.
FORM_TEL="(31) 99777-8888"

check "GET /v1/public/pracas/:id sem token = dados básicos" "$PRACA_SEED" \
  "$(curl -s $API/v1/public/pracas/$PRACA_SEED | jq -r .id)"
PUB_PRACA=$(curl -s $API/v1/public/pracas/$PRACA_SEED)
ADMIN_PRACA=$(curl -s $API/v1/pracas/$PRACA_SEED -H "$HD")
check "nome público bate com o cadastro" "$(echo "$ADMIN_PRACA" | jq -r .name)" "$(echo "$PUB_PRACA" | jq -r .name)"
check "cidade pública bate com o cadastro" "$(echo "$ADMIN_PRACA" | jq -r .city)" "$(echo "$PUB_PRACA" | jq -r .city)"
check "público da praça não vaza outros campos (steps)" "false" "$(echo "$PUB_PRACA" | jq 'has("steps")')"
check "praça pública inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/public/pracas/00000000-0000-4000-8000-00000000fea1 | jq -r .error.code)"
check "id malformado na praça pública = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s $API/v1/public/pracas/nao-e-uuid | jq -r .error.code)"

check "POST /v1/public/leads com praça inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/public/leads -H "$J" \
    -d "{\"praca_id\":\"00000000-0000-4000-8000-00000000fea1\",\"name\":\"Bar Fantasma $SUF\",\"city\":\"Belo Horizonte\",\"phone\":\"$FORM_TEL\",\"origem\":\"organico\"}" \
    | jq -r .error.code)"
check "origem fora de pago/organico = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/public/leads -H "$J" \
    -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Inválido $SUF\",\"city\":\"BH\",\"phone\":\"31999990000\",\"origem\":\"direto\"}" \
    | jq -r .error.code)"

FORM1=$(curl -s -X POST $API/v1/public/leads -H "$J" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Formulário $SUF\",\"city\":\"Belo Horizonte\",\"phone\":\"$FORM_TEL\",\"freq\":\"5\",\"origem\":\"pago\",\"camp\":\"nao-e-uuid\"}")
check "POST /v1/public/leads sem token responde ok:true" "true" "$(echo "$FORM1" | jq -r .ok)"
check "primeiro envio não vem marcado como duplicado" "null" "$(echo "$FORM1" | jq -r '.duplicate')"

FORM_ID=$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&q=Formul%C3%A1rio%20$SUF" -H "$HD" | jq -r '.[0].id')
FORM_LEAD=$(curl -s $API/v1/leads/$FORM_ID -H "$HD")
check "lead do formulário aparece no funil da praça" "1" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&q=Formul%C3%A1rio%20$SUF" -H "$HD" | jq 'length')"
check "lead do formulário nasce na etapa 1" "1" "$(echo "$FORM_LEAD" | jq '.stage')"
check "classe do formulário é 'alvo'" "alvo" "$(echo "$FORM_LEAD" | jq -r '.classe')"
check "origem 'pago' vira 'tráfego pago'" "tráfego pago" "$(echo "$FORM_LEAD" | jq -r '.origem')"
check "form_answer grava a frequência escolhida" "Fica sem gente 5x por mês" "$(echo "$FORM_LEAD" | jq -r '.form_answer')"
check "decisor não preenchido vira travessão" "—" "$(echo "$FORM_LEAD" | jq -r '.decisor')"
check "campanha inválida (não uuid) é ignorada, sem quebrar" "null" "$(echo "$FORM_LEAD" | jq -r '.campanha_id')"
check "dono do lead é o primeiro ativo por sort (Diego)" "$DIEGO_ID" "$(echo "$FORM_LEAD" | jq -r '.owner_id')"
check "evento de entrada vem com o rótulo Formulário" "Formulário" "$(echo "$FORM_LEAD" | jq -r '.events[-1].author_label')"
check "evento de entrada não tem autor logado" "null" "$(echo "$FORM_LEAD" | jq -r '.events[-1].author_id')"
check "texto do evento de entrada" "Lead entrou pelo formulário de captura." "$(echo "$FORM_LEAD" | jq -r '.events[-1].text')"

FORM2=$(curl -s -X POST $API/v1/public/leads -H "$J" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Formulário $SUF\",\"city\":\"Belo Horizonte\",\"phone\":\"$FORM_TEL\",\"origem\":\"organico\"}")
check "segundo envio com o mesmo telefone volta duplicate:true" "true" "$(echo "$FORM2" | jq -r .duplicate)"
check "segundo envio ainda responde ok:true" "true" "$(echo "$FORM2" | jq -r .ok)"
check "telefone repetido não cria um segundo lead" "1" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&q=Formul%C3%A1rio%20$SUF" -H "$HD" | jq 'length')"
check "reenvio deixa a nota na ficha, sem trocar a origem" "Preencheu o formulário de novo." \
  "$(curl -s $API/v1/leads/$FORM_ID -H "$HD" | jq -r '.events[-1].text')"
check "reenvio não mexe na etapa" "1" "$(curl -s $API/v1/leads/$FORM_ID -H "$HD" | jq '.stage')"
check "reenvio não troca a origem do lead" "tráfego pago" "$(curl -s $API/v1/leads/$FORM_ID -H "$HD" | jq -r '.origem')"

# Corrida: dois envios do MESMO telefone quase ao mesmo tempo (duplo toque em
# "Enviar", retry de rede) não podem virar dois leads — advisory lock por
# (praca_id, phone_key) serializa a decisão dentro da transação.
RACE_TEL="(31) 99777-4321"
curl -s -X POST $API/v1/public/leads -H "$J" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Corrida $SUF A\",\"city\":\"Belo Horizonte\",\"phone\":\"$RACE_TEL\",\"origem\":\"organico\"}" \
  -o /tmp/praca-smoke-race-a.json &
curl -s -X POST $API/v1/public/leads -H "$J" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Corrida $SUF B\",\"city\":\"Belo Horizonte\",\"phone\":\"$RACE_TEL\",\"origem\":\"organico\"}" \
  -o /tmp/praca-smoke-race-b.json &
wait
check "as duas respostas da corrida voltam ok:true" "2" \
  "$(jq -r .ok /tmp/praca-smoke-race-a.json /tmp/praca-smoke-race-b.json | grep -c true)"
RACE_ACHADOS=$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&q=Corrida%20$SUF" -H "$HD")
check "dois envios simultâneos do mesmo telefone criam só 1 lead" "1" "$(echo "$RACE_ACHADOS" | jq 'length')"
RACE_ID=$(echo "$RACE_ACHADOS" | jq -r '.[0].id')
check "lead da corrida fica com 1 evento de entrada + 1 de reenvio" "2" \
  "$(curl -s $API/v1/leads/$RACE_ID -H "$HD" | jq '.events | length')"
check "admin apaga o lead da corrida (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$RACE_ID -H "$HD" | jq -r .ok)"

check "admin apaga o lead do formulário (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$FORM_ID -H "$HD" | jq -r .ok)"
check "lead do formulário sumiu" "NOT_FOUND" "$(curl -s $API/v1/leads/$FORM_ID -H "$HD" | jq -r .error.code)"

echo "── Mensagens ──"
# --- modelos do seed: só leitura, nada aqui deixa resíduo ---
TPL_F001="00000000-0000-4000-8000-00000000f001"
TPL_F007="00000000-0000-4000-8000-00000000f007"
TPLS=$(curl -s $API/v1/msg-templates -H "$HD")
check "seed traz os 8 modelos do protótipo" "8" "$(echo "$TPLS" | jq 'length')"
check "modelo 1 tem id fixo (as cadências referenciam por id)" "true" \
  "$(echo "$TPLS" | jq --arg i "$TPL_F001" 'any(.id==$i)')"
check "sem envio, a lista sai na ordem de criação" "$TPL_F001" "$(echo "$TPLS" | jq -r '.[0].id')"
check "toque 1 vem com o anexo de vídeo do protótipo" "caso-40s.mp4" \
  "$(echo "$TPLS" | jq -r --arg i "$TPL_F001" '[.[] | select(.id==$i)][0].attachment.name')"
check "modelo sem variante B manda string vazia, não null" "" \
  "$(echo "$TPLS" | jq -r --arg i "$TPL_F007" '[.[] | select(.id==$i)][0].text_b')"
check "modelo sem envio nasce com 0 enviada" "0" \
  "$(echo "$TPLS" | jq --arg i "$TPL_F001" '[.[] | select(.id==$i)][0].metrics.sent')"
check "sem amostra não há vencedor do A/B" "—" \
  "$(echo "$TPLS" | jq -r --arg i "$TPL_F001" '[.[] | select(.id==$i)][0].metrics.winner')"

# --- render ---
BAR_MERCADO=$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&q=bar%20do%20mercado" -H "$HD" | jq -r '.[0].id')
RENDER=$(curl -s -X POST $API/v1/msg-templates/render -H "$J" -H "$HD" \
  -d "{\"text\":\"Oi {{primeiro_nome_dono}}, aqui é {{meu_nome}} — {{estabelecimento}} em {{cidade}}. {{inventada}}\",\"lead_id\":\"$BAR_MERCADO\"}")
check "render troca as variáveis pelos dados do lead do seed" \
  "Oi Marcos, aqui é Diego — Bar do Mercado em Belo Horizonte. ⟨inventada⟩" "$(echo "$RENDER" | jq -r .text)"
check "variável desconhecida entra em missing" "inventada" "$(echo "$RENDER" | jq -r '.missing[0]')"
check "variável preenchida não entra em missing" "1" "$(echo "$RENDER" | jq '.missing | length')"
check "render pega a praça do lead" "Belo Horizonte + Contagem" \
  "$(curl -s -X POST $API/v1/msg-templates/render -H "$J" -H "$HD" \
    -d "{\"text\":\"{{praca}}\",\"lead_id\":\"$BAR_MERCADO\"}" | jq -r .text)"
check "render acha um vizinho da mesma cidade" "true" \
  "$(curl -s -X POST $API/v1/msg-templates/render -H "$J" -H "$HD" \
    -d "{\"text\":\"{{estabelecimento_vizinho}}\",\"lead_id\":\"$BAR_MERCADO\"}" | jq '.text != "⟨estabelecimento_vizinho⟩" and .text != "Bar do Mercado"')"
check "sem lead, {{praca}} cai na praça ativa de quem está logado" "Praça $SUF" \
  "$(curl -s -X POST $API/v1/msg-templates/render -H "$J" -H "$HD" -d '{"text":"{{praca}}"}' | jq -r .text)"
check "sem lead, o que vem do lead fica visível" "⟨estabelecimento⟩ · R$ 120" \
  "$(curl -s -X POST $API/v1/msg-templates/render -H "$J" -H "$HD" -d '{"text":"{{estabelecimento}} · {{valor}}"}' | jq -r .text)"
check "render com lead inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/msg-templates/render -H "$J" -H "$HD" \
    -d '{"text":"oi","lead_id":"00000000-0000-4000-8000-00000000beef"}' | jq -r .error.code)"
check "render com lead_id malformado = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/msg-templates/render -H "$J" -H "$HD" -d '{"text":"oi","lead_id":"nao-e-uuid"}' | jq -r .error.code)"

# --- modelo de teste: criado, editado e apagado aqui mesmo ---
NOVO_TPL=$(curl -s -X POST $API/v1/msg-templates -H "$J" -H "$HD" \
  -d "{\"name\":\"Modelo $SUF\",\"audience\":\"contratante\",\"stage\":1,\"channel\":\"whatsapp\",\"text_a\":\"Oi {{primeiro_nome_dono}}\",\"attachment\":{\"kind\":\"video\",\"name\":\"caso.mp4\",\"url\":\"https://exemplo/caso.mp4\"}}")
TPL_ID=$(echo "$NOVO_TPL" | jq -r .id)
check "modelo novo guarda o anexo" "video" "$(echo "$NOVO_TPL" | jq -r '.attachment.kind')"
check "modelo novo sem text_b vem vazio" "" "$(echo "$NOVO_TPL" | jq -r '.text_b')"
check "modelo novo nasce com métrica zerada" "0" "$(echo "$NOVO_TPL" | jq '.metrics.sent')"
check "métrica do POST bate com a que o GET mostra do mesmo modelo" "true" \
  "$(curl -s $API/v1/msg-templates -H "$HD" \
    | jq --argjson m "$(echo "$NOVO_TPL" | jq -c '.metrics')" --arg i "$TPL_ID" \
      '([.[] | select(.id==$i)][0].metrics) == $m')"
check "público fora do catálogo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/msg-templates -H "$J" -H "$HD" \
    -d '{"name":"X","audience":"dono","stage":1,"channel":"whatsapp","text_a":"oi"}' | jq -r .error.code)"
check "etapa fora do funil (9) barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/msg-templates -H "$J" -H "$HD" \
    -d '{"name":"X","audience":"contratante","stage":9,"channel":"whatsapp","text_a":"oi"}' | jq -r .error.code)"
check "canal fora do catálogo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/msg-templates -H "$J" -H "$HD" \
    -d '{"name":"X","audience":"contratante","stage":1,"channel":"sms","text_a":"oi"}' | jq -r .error.code)"
check "tipo de anexo fora do catálogo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/msg-templates -H "$J" -H "$HD" \
    -d '{"name":"X","audience":"contratante","stage":1,"channel":"whatsapp","text_a":"oi","attachment":{"kind":"planilha","name":"x.xlsx"}}' | jq -r .error.code)"
check "text_a vazio barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/msg-templates -H "$J" -H "$HD" \
    -d '{"name":"X","audience":"contratante","stage":1,"channel":"whatsapp","text_a":""}' | jq -r .error.code)"
check "9 modelos com o de teste" "9" "$(curl -s $API/v1/msg-templates -H "$HD" | jq 'length')"

EDITADO=$(curl -s -X PUT $API/v1/msg-templates/$TPL_ID -H "$J" -H "$HD" \
  -d "{\"name\":\"Modelo $SUF v2\",\"audience\":\"freelancer\",\"stage\":0,\"channel\":\"interno\",\"text_a\":\"Oi {{nome}}\",\"text_b\":\"Olá {{nome}}\"}")
check "PUT troca o modelo inteiro" "freelancer" "$(echo "$EDITADO" | jq -r '.audience')"
check "PUT sem anexo tira o anexo" "null" "$(echo "$EDITADO" | jq -r '.attachment')"
check "PUT guarda a variante B" "Olá {{nome}}" "$(echo "$EDITADO" | jq -r '.text_b')"
# A resposta de POST/PUT carrega a medição do banco, não um objeto zerado à
# mão: quando a Task 10 começar a gravar `msg_sends`, editar um modelo já
# disparado não pode responder `sent: 0` enquanto o GET mostra o número real.
check "métrica do PUT bate com a que o GET mostra do mesmo modelo" "true" \
  "$(curl -s $API/v1/msg-templates -H "$HD" \
    | jq --argjson m "$(echo "$EDITADO" | jq -c '.metrics')" --arg i "$TPL_ID" \
      '([.[] | select(.id==$i)][0].metrics) == $m')"
check "PUT sem campo obrigatório barrado" "VALIDATION_ERROR" \
  "$(curl -s -X PUT $API/v1/msg-templates/$TPL_ID -H "$J" -H "$HD" -d '{"name":"só o nome"}' | jq -r .error.code)"
check "PUT em modelo inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X PUT $API/v1/msg-templates/00000000-0000-4000-8000-00000000beef -H "$J" -H "$HD" \
    -d '{"name":"X","audience":"contratante","stage":1,"channel":"whatsapp","text_a":"oi"}' | jq -r .error.code)"
check "DELETE de modelo inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X DELETE $API/v1/msg-templates/00000000-0000-4000-8000-00000000beef -H "$HD" | jq -r .error.code)"
check "modelo com id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s -X DELETE $API/v1/msg-templates/nao-e-uuid -H "$HD" | jq -r .error.code)"
check "apaga o modelo de teste (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/msg-templates/$TPL_ID -H "$HD" | jq -r .ok)"
check "voltou aos 8 modelos do seed" "8" "$(curl -s $API/v1/msg-templates -H "$HD" | jq 'length')"

# --- configurações de envio (uma linha só; tudo é devolvido no fim) ---
SET0=$(curl -s $API/v1/settings -H "$HD")
check "janela padrão abre às 9h" "9" "$(echo "$SET0" | jq '.window_start')"
check "janela padrão fecha às 19h" "19" "$(echo "$SET0" | jq '.window_end')"
check "modo de envio padrão é a fila manual" "fila" "$(echo "$SET0" | jq -r '.mode')"
check "settings traz as 6 variáveis-padrão" "6" "$(echo "$SET0" | jq '.template_defaults | length')"
check "valor-padrão da variável {{valor}}" "R\$ 120" "$(echo "$SET0" | jq -r '.template_defaults.valor')"
check "hora abaixo do mínimo é presa em 8" "8" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"window_start":7}' | jq '.window_start')"
check "hora acima do máximo é presa em 20" "20" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"window_end":23}' | jq '.window_end')"
check "janela que fecha antes de abrir barrada" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"window_start":18,"window_end":10}' | jq -r .error.code)"
check "intervalo máximo menor que o mínimo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"gap_min":90,"gap_max":20}' | jq -r .error.code)"
check "intervalo mínimo abaixo de 5s barrado" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"gap_min":1}' | jq -r .error.code)"
check "limite diário 0 barrado" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"daily_limit":0}' | jq -r .error.code)"
check "modo fora do catálogo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"mode":"oficial"}' | jq -r .error.code)"
check "variável-padrão desconhecida barrada" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"template_defaults":{"inventada":"x"}}' | jq -r .error.code)"
check "campo desconhecido no corpo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"meta_token":"x"}' | jq -r .error.code)"
check "template_defaults parcial troca só a chave mandada" "R\$ 200" \
  "$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" -d '{"template_defaults":{"valor":"R$ 200"}}' | jq -r '.template_defaults.valor')"
check "as outras variáveis-padrão ficaram como estavam" "garçom" \
  "$(curl -s $API/v1/settings -H "$HD" | jq -r '.template_defaults.funcao')"
check "render usa o valor recém-configurado" "R\$ 200" \
  "$(curl -s -X POST $API/v1/msg-templates/render -H "$J" -H "$HD" -d '{"text":"{{valor}}"}' | jq -r .text)"
RESTAURA=$(curl -s -X PATCH $API/v1/settings -H "$J" -H "$HD" \
  -d "{\"window_start\":$(echo "$SET0" | jq '.window_start'),\"window_end\":$(echo "$SET0" | jq '.window_end'),\"template_defaults\":{\"valor\":\"$(echo "$SET0" | jq -r '.template_defaults.valor')\"}}")
check "janela restaurada (sem resíduo)" "9" "$(echo "$RESTAURA" | jq '.window_start')"
check "valor-padrão restaurado (sem resíduo)" "R\$ 120" "$(echo "$RESTAURA" | jq -r '.template_defaults.valor')"

# --- lista de bloqueio ---
BLOQ_TEL="(31) 9${SUF: -8}"
BLOQ=$(curl -s -X POST $API/v1/blocklist -H "$J" -H "$HD" -d "{\"phone\":\"$BLOQ_TEL\"}")
BLOQ_ID=$(echo "$BLOQ" | jq -r .id)
check "bloqueio nasce com o nome padrão" "adicionado na mão" "$(echo "$BLOQ" | jq -r .name)"
check "bloqueio nasce com o motivo padrão" "pedido manual" "$(echo "$BLOQ" | jq -r .reason)"
check "chave do bloqueio são os últimos 9 dígitos" "9" "$(echo "$BLOQ" | jq -r '.phone_key | length')"
check "mesmo número escrito de outro jeito já está bloqueado" "ALREADY_BLOCKED" \
  "$(curl -s -X POST $API/v1/blocklist -H "$J" -H "$HD" \
    -d "{\"phone\":\"$(echo "$BLOQ_TEL" | tr -cd '0-9')\"}" | jq -r .error.code)"
check "telefone sem dígito barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/blocklist -H "$J" -H "$HD" -d '{"phone":"sem numero"}' | jq -r .error.code)"
check "bloqueio aparece na lista" "true" \
  "$(curl -s $API/v1/blocklist -H "$HD" | jq --arg i "$BLOQ_ID" 'any(.id==$i)')"
check "apagar bloqueio inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X DELETE $API/v1/blocklist/00000000-0000-4000-8000-00000000beef -H "$HD" | jq -r .error.code)"
check "bloqueio com id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s -X DELETE $API/v1/blocklist/nao-e-uuid -H "$HD" | jq -r .error.code)"
check "apaga o bloqueio de teste (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/blocklist/$BLOQ_ID -H "$HD" | jq -r .ok)"
check "bloqueio apagado sumiu da lista" "false" \
  "$(curl -s $API/v1/blocklist -H "$HD" | jq --arg i "$BLOQ_ID" 'any(.id==$i)')"

echo "── Limpeza da praça de teste ──"
check "admin apaga a praça de teste" "true" "$(curl -s -X DELETE $API/v1/pracas/$NOVA_ID -H "$HD" | jq -r .ok)"
check "praça de teste sumiu" "NOT_FOUND" "$(curl -s $API/v1/pracas/$NOVA_ID -H "$HD" | jq -r .error.code)"
check "ações da praça foram junto (cascata)" "NOT_FOUND" \
  "$(curl -s $API/v1/actions/$S1A2 -H "$HD" | jq -r .error.code)"
check "praça ativa do Diego restaurada (sem resíduo)" "$PRACA_SEED" \
  "$(curl -s -X PATCH $API/v1/users/me -H "$J" -H "$HD" -d "{\"active_praca_id\":\"$PRACA_SEED\"}" | jq -r .active_praca_id)"

echo
printf 'Resultado: \033[32m%d ok\033[0m, \033[31m%d falha(s)\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
