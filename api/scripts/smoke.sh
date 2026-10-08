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
# `users.active_praca_id` não tem FK: sem esta guarda, um uuid inexistente
# entrava com 200 e estourava depois em `POST /v1/cadences/:id/test` (que grava
# a praça em `leads.praca_id`, esse SIM com FK) como 500 INTERNAL_ERROR.
check "praça ativa inexistente = NOT_FOUND (não 200 agora e 500 depois)" "NOT_FOUND" \
  "$(curl -s -X PATCH $API/v1/users/me -H "$J" -H "$HD" \
    -d '{"active_praca_id":"00000000-0000-4000-8000-00000000beef"}' | jq -r .error.code)"
check "praça ativa com id malformado = VALIDATION_ERROR (não 500)" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/users/me -H "$J" -H "$HD" \
    -d '{"active_praca_id":"nao-e-uuid"}' | jq -r .error.code)"

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
check "motivo vazio = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d '{"stage":8,"lost_reason":""}' | jq -r .error.code)"
PERDIDO=$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d '{"stage":8,"lost_reason":"não respondeu"}')
check "'não respondeu' agenda o reaquecimento para daqui a 30 dias" "$HOJE30" \
  "$(echo "$PERDIDO" | jq -r '.reheat_at')"
check "motivo entra no texto do evento" "true" \
  "$(echo "$PERDIDO" | jq '.events[-1].text | endswith(" · motivo: não respondeu")')"
check "sair da etapa 8 limpa motivo e reaquecimento" "null" \
  "$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" -d "{\"stage\":3,\"next_step\":{\"what\":\"Retomar\",\"date\":\"$HOJE3\"}}" | jq -r '.reheat_at')"

# Motivo de perda é texto livre: a opção "outro" da tela grava o que o usuário digitou.
LIVRE=$(curl -s -X POST $API/v1/leads/$LEAD_ID/move -H "$J" -H "$HD" \
  -d '{"stage":8,"lost_reason":"vai reformar e some até janeiro"}')
check "motivo de perda aceita texto livre" "vai reformar e some até janeiro" \
  "$(echo "$LIVRE" | jq -r '.lost_reason')"
check "texto livre não agenda reaquecimento" "null" "$(echo "$LIVRE" | jq -r '.reheat_at')"

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
# `cadence_nodes.template_id` não tem FK (o nó guarda o id solto): sem a guarda,
# apagar um modelo citado por um passo deixava o nó apontando para o nada e o
# motor gravava `msg_sends` com texto VAZIO — mensagem em branco no modo `fila`,
# `whatsappTemplate: ""` no modo `freela`.
TPL_EM_USO=$(curl -s $API/v1/cadences -H "$HD" | jq -r '[.[].nodes[] | select(.template_id != null)][0].template_id')
check "modelo usado por cadência não é apagado" "TEMPLATE_IN_USE" \
  "$(curl -s -X DELETE $API/v1/msg-templates/$TPL_EM_USO -H "$HD" | jq -r .error.code)"
check "o modelo em uso continua lá" "8" "$(curl -s $API/v1/msg-templates -H "$HD" | jq 'length')"

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

echo "── Disparos ──"
# Público controlado: 5 casas de teste na praça de teste, todas na etapa 1. Sem
# elas o disparo cairia nos leads do seed e deixaria evento, `last_contact_at` e
# `msg_send` de resíduo — aqui o DELETE do lead leva envios e eventos por
# cascata, e a segunda rodada do smoke encontra a base como estava.
DISP_LEADS=()
for i in 1 2 3 4 5; do
  DISP_LEADS+=("$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
    -d "{\"praca_id\":\"$NOVA_ID\",\"name\":\"Casa Disparo $i · $SUF\",\"city\":\"Cidade $SUF\",\"phone\":\"(31) 9${SUF: -7}$i\",\"decisor\":\"Chefe$i Teste\",\"classe\":\"alvo\",\"origem\":\"prospecção\",\"owner_id\":\"$DIEGO_ID\",\"stage\":1}" | jq -r .id)")
done
check "5 casas de teste na praça do smoke" "5" \
  "$(curl -s "$API/v1/leads?praca_id=$NOVA_ID" -H "$HD" | jq 'length')"

FILTRO="{\"praca_id\":\"$NOVA_ID\",\"stage\":1}"
PRV=$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
  -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"split\":true,\"mode\":\"fila\"}")
check "prévia acha as 5 casas da etapa 1" "5" "$(echo "$PRV" | jq '.audience')"
check "todas podem receber" "5" "$(echo "$PRV" | jq '.sendable')"
check "ninguém na lista de bloqueio" "0" "$(echo "$PRV" | jq '.blocked')"
check "ninguém na trava de 30 dias" "0" "$(echo "$PRV" | jq '.dupes')"
check "a prévia mostra 5 mensagens reais" "5" "$(echo "$PRV" | jq '.previews | length')"
check "divisão A/B alterna por índice" "A B A B A" "$(echo "$PRV" | jq -r '[.previews[].variant] | join(" ")')"
check "a variante B usa o outro texto do modelo" "true" \
  "$(echo "$PRV" | jq '.previews[0].text != .previews[1].text')"
check "prévia usa o primeiro nome do decisor e de quem está logado" "true" \
  "$(echo "$PRV" | jq '.previews[0].text | startswith("Oi Chefe1, tudo bem? Sou Diego, do Freela.")')"
check "o vizinho do texto é outra casa da mesma cidade" "true" \
  "$(echo "$PRV" | jq --arg n "Casa Disparo 2 · $SUF" '.previews[0].text | contains($n)')"
check "nenhuma variável ficou em ⟨⟩ na prévia" "false" \
  "$(echo "$PRV" | jq '[.previews[].text] | join(" ") | contains("⟨")')"
check "a prévia diz quando a primeira mensagem sai" "true" "$(echo "$PRV" | jq '.first_at != null')"
check "a prévia estima quando o lote termina" "true" "$(echo "$PRV" | jq '.eta != ""')"
check "no modo fila a integração com o Freela não entra" "null" "$(echo "$PRV" | jq -r '.freela')"

check "modelo sem variante B não divide nada" "A A A A A" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F007\",\"split\":true,\"mode\":\"fila\"}" \
    | jq -r '[.previews[].variant] | join(" ")')"
check "filtro de dias parado tira quem não está parado" "0" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":{\"praca_id\":\"$NOVA_ID\",\"stage\":1,\"min_stalled\":1},\"template_id\":\"$TPL_F001\",\"mode\":\"fila\"}" | jq '.audience')"
check "filtro de dono tira quem é de outra pessoa" "0" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":{\"praca_id\":\"$NOVA_ID\",\"owner_id\":\"$DANIEL_ID\"},\"template_id\":\"$TPL_F001\",\"mode\":\"fila\"}" | jq '.audience')"
check "filtro de origem tira quem veio por outro caminho" "0" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":{\"praca_id\":\"$NOVA_ID\",\"origem\":\"importação\"},\"template_id\":\"$TPL_F001\",\"mode\":\"fila\"}" | jq '.audience')"

# Modo `freela`: a prévia funciona (é a tela mostrando o público), mas criar
# ainda não — quem envia é a campanha do Freela, que a Task 15 liga.
PRV_FREELA=$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
  -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"mode\":\"freela\"}")
check "prévia no modo freela descreve o modelo convertido" "true" \
  "$(echo "$PRV_FREELA" | jq '.freela.template | contains("{{primeiro_nome}}")')"
check "a conversão avisa as variáveis que o Freela não tem" "true" \
  "$(echo "$PRV_FREELA" | jq '[.freela.unsupported_variables[]] | index("estabelecimento") != null')"
check "a conversão resolve o nome de quem dispara" "true" \
  "$(echo "$PRV_FREELA" | jq '.freela.template | contains("Sou Diego, do Freela.")')"
check "no modo freela sem hora marcada o lote sai imediato" "imediato" "$(echo "$PRV_FREELA" | jq -r '.eta')"
# Hora marcada é INSTANTE (ISO com fuso). O `datetime-local` cru do navegador
# ("2026-09-14T12:00") é barrado: a API roda em UTC e o lote sairia 3h antes.
MARCADA="$(TZ=America/Sao_Paulo date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%S)Z"
check "prévia aceita hora marcada em ISO com fuso" "$MARCADA" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"mode\":\"freela\",\"scheduled_at\":\"$MARCADA\"}" \
    | jq -r '.first_at' | sed 's/\.000Z$/Z/')"
check "com hora marcada o modo freela mostra a espera, não 'imediato'" "false" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"mode\":\"freela\",\"scheduled_at\":\"$MARCADA\"}" \
    | jq '.eta == "imediato"')"
check "hora marcada sem fuso (datetime-local cru) barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"mode\":\"fila\",\"scheduled_at\":\"2026-09-14T12:00\"}" | jq -r .error.code)"
check "hora marcada que não é data barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"mode\":\"fila\",\"scheduled_at\":\"amanha\"}" | jq -r .error.code)"
FREELA_HTTP=$(curl -s -o /tmp/praca-smoke-freela.json -w '%{http_code}' -X POST $API/v1/disparos -H "$J" -H "$HD" \
  -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"mode\":\"freela\"}")
check "criar no modo freela sem conexão = 503" "503" "$FREELA_HTTP"
check "criar no modo freela sem conexão = FREELA_NOT_CONFIGURED" "FREELA_NOT_CONFIGURED" \
  "$(jq -r .error.code /tmp/praca-smoke-freela.json)"

# Corrida: dois cliques em "Confirmar" ao mesmo tempo. O lock consultivo por
# modelo dentro da transação faz o segundo ver a fila do primeiro e não montar
# nada — sem ele, os dois liam a trava de 30 dias antes de qualquer um gravar e
# o lead recebia a mesma mensagem duas vezes.
CORRIDA_BODY="{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"split\":true,\"mode\":\"fila\"}"
curl -s -X POST $API/v1/disparos -H "$J" -H "$HD" -d "$CORRIDA_BODY" > /tmp/praca-smoke-disp-a.json &
curl -s -X POST $API/v1/disparos -H "$J" -H "$HD" -d "$CORRIDA_BODY" > /tmp/praca-smoke-disp-b.json &
wait
check "dois 'Confirmar' ao mesmo tempo montam a fila UMA vez" "5" \
  "$(( $(jq -r '.created // 0' /tmp/praca-smoke-disp-a.json) + $(jq -r '.created // 0' /tmp/praca-smoke-disp-b.json) ))"
check "o clique perdedor não tem para quem mandar" "NO_RECIPIENTS" \
  "$(jq -r '.error.code // empty' /tmp/praca-smoke-disp-a.json /tmp/praca-smoke-disp-b.json | head -1)"
NOVO_DISP=$(jq -c 'select(.id != null)' /tmp/praca-smoke-disp-a.json /tmp/praca-smoke-disp-b.json | head -1)
rm -f /tmp/praca-smoke-disp-a.json /tmp/praca-smoke-disp-b.json
DISP_ID=$(echo "$NOVO_DISP" | jq -r .id)
check "só um disparo foi criado na corrida" "1" \
  "$(curl -s $API/v1/disparos -H "$HD" | jq --arg n "Contratante · toque 1 (lead novo) · $(TZ=America/Sao_Paulo date +%d/%m/%Y)" '[.[] | select(.name==$n)] | length')"
check "criou uma mensagem por lead que podia receber" "5" "$(echo "$NOVO_DISP" | jq '.created')"
check "nada pulado pela lista de bloqueio" "0" "$(echo "$NOVO_DISP" | jq '.skipped_block')"
check "nada pulado pela trava de 30 dias" "0" "$(echo "$NOVO_DISP" | jq '.skipped_dup')"

PAINEL=$(curl -s $API/v1/disparos/$DISP_ID -H "$HD")
HOJE_BR=$(TZ=America/Sao_Paulo date +%d/%m/%Y)
check "nome padrão é modelo · data de Brasília" "Contratante · toque 1 (lead novo) · $HOJE_BR" \
  "$(echo "$PAINEL" | jq -r '.disparo.name')"
check "o painel traz o nome do modelo" "Contratante · toque 1 (lead novo)" \
  "$(echo "$PAINEL" | jq -r '.disparo.template_name')"
check "canal e divisão vêm do modelo" "whatsapp true" \
  "$(echo "$PAINEL" | jq -r '"\(.disparo.channel) \(.disparo.split)"')"
check "o disparo nasce agendado" "agendado" "$(echo "$PAINEL" | jq -r '.disparo.status')"
check "o disparo guarda o filtro do público" "$NOVA_ID" "$(echo "$PAINEL" | jq -r '.disparo.filters.praca_id')"
check "o filtro guarda as 6 chaves, mesmo as não mandadas" "6" "$(echo "$PAINEL" | jq '.disparo.filters | length')"
check "todas as mensagens nascem na fila" "5" "$(echo "$PAINEL" | jq '.stats.queued')"
check "nada enviado ainda" "0" "$(echo "$PAINEL" | jq '.stats.sent')"
check "contagem do lote bate com a fila" "5 5 0" \
  "$(echo "$PAINEL" | jq -r '"\(.disparo.counts.total) \(.disparo.counts.queued) \(.disparo.counts.sent)"')"
check "respostas por hora tem 24 posições" "24" "$(echo "$PAINEL" | jq '.by_hour | length')"
check "sem resposta, o gráfico está zerado" "0" "$(echo "$PAINEL" | jq '.by_hour | add')"
check "a fila sai na ordem do agendamento" "true" \
  "$(echo "$PAINEL" | jq '[.sends[].scheduled_at] == ([.sends[].scheduled_at] | sort)')"
check "cada envio guarda o texto já renderizado" "0" \
  "$(echo "$PAINEL" | jq '[.sends[] | select(.text == "")] | length')"
check "o envio guarda a etapa do lead na hora do envio" "1" "$(echo "$PAINEL" | jq '.sends[0].stage_at_send')"
check "o envio traz o lead com telefone (é o link do WhatsApp)" "true" \
  "$(echo "$PAINEL" | jq '.sends[0].lead.phone != ""')"
check "o disparo novo aparece no topo da lista" "$DISP_ID" \
  "$(curl -s $API/v1/disparos -H "$HD" | jq -r '.[0].id')"
check "a lista conta a fila de cada lote" "5" \
  "$(curl -s $API/v1/disparos -H "$HD" | jq --arg i "$DISP_ID" '[.[] | select(.id==$i)][0].counts.queued')"

SEND1=$(echo "$PAINEL" | jq -r '.sends[0].id'); LEAD1=$(echo "$PAINEL" | jq -r '.sends[0].lead.id')
SEND2=$(echo "$PAINEL" | jq -r '.sends[1].id'); LEAD2=$(echo "$PAINEL" | jq -r '.sends[1].lead.id')
SEND3=$(echo "$PAINEL" | jq -r '.sends[2].id'); LEAD3=$(echo "$PAINEL" | jq -r '.sends[2].lead.id')
SEND4=$(echo "$PAINEL" | jq -r '.sends[3].id')
SEND5=$(echo "$PAINEL" | jq -r '.sends[4].id')

MARCA=$(curl -s -X POST $API/v1/sends/$SEND1/mark -H "$J" -H "$HD" -d '{"status":"enviada"}')
check "marcar enviada grava a hora em que a mensagem saiu" "true" "$(echo "$MARCA" | jq '.sent_at != null')"
check "o envio virou enviada" "enviada" "$(echo "$MARCA" | jq -r '.status')"
check "o painel conta 1 enviada" "1" "$(curl -s $API/v1/disparos/$DISP_ID -H "$HD" | jq '.stats.sent')"
LEAD1_VIEW=$(curl -s $API/v1/leads/$LEAD1 -H "$HD")
check "o lead ganhou o evento de mensagem enviada" "Contratante · toque 1 (lead novo) (variação A) enviada por WhatsApp." \
  "$(echo "$LEAD1_VIEW" | jq -r '[.events[] | select(.kind=="msg_out")][-1].text')"
check "o toque virou último contato do lead" "$HOJE" "$(echo "$LEAD1_VIEW" | jq -r '.last_contact_date')"
check "marcar entregue depois mantém a hora em que saiu" "$(echo "$MARCA" | jq -r '.sent_at')" \
  "$(curl -s -X POST $API/v1/sends/$SEND1/mark -H "$J" -H "$HD" -d '{"status":"entregue"}' | jq -r '.sent_at')"
ENT3=$(curl -s -X POST $API/v1/sends/$SEND3/mark -H "$J" -H "$HD" -d '{"status":"entregue"}')
check "marcar entregue direto na fila também grava a hora de saída" "true" "$(echo "$ENT3" | jq '.sent_at != null')"
check "entregue não inventa evento de mensagem enviada no lead" "0" \
  "$(curl -s $API/v1/leads/$LEAD3 -H "$HD" | jq '[.events[] | select(.kind=="msg_out")] | length')"

RESP=$(curl -s -X POST $API/v1/sends/$SEND2/reply -H "$J" -H "$HD" -d '{"text":"pare"}')
HORA_BR=$(TZ=America/Sao_Paulo date +%-H)
check "resposta que pede para parar bloqueia o número" "true" "$(echo "$RESP" | jq '.blocked')"
LEAD2_VIEW=$(curl -s $API/v1/leads/$LEAD2 -H "$HD")
check "o lead ganhou o evento da resposta com o texto dela" "pare" \
  "$(echo "$LEAD2_VIEW" | jq -r '[.events[] | select(.kind=="msg_in")][-1].text')"
BLOQ_OPTOUT=$(curl -s $API/v1/blocklist -H "$HD" | jq --arg l "$LEAD2" '[.[] | select(.lead_id==$l)][0]')
check "o bloqueio automático guarda o motivo do protótipo" "pediu para não receber: “pare”" \
  "$(echo "$BLOQ_OPTOUT" | jq -r '.reason')"
check "o bloqueio automático guarda o nome do lead" "Casa Disparo 2 · $SUF" \
  "$(echo "$BLOQ_OPTOUT" | jq -r '.name')"
PAINEL2=$(curl -s $API/v1/disparos/$DISP_ID -H "$HD")
# Entregues = as duas marcadas na mão + a que respondeu (respondida conta como
# entregue: se o lead respondeu, a mensagem chegou).
check "respondida também conta como entregue" "3 1" \
  "$(echo "$PAINEL2" | jq -r '"\(.stats.delivered) \(.stats.replied)"')"
check "o painel mostra quem entrou no bloqueio depois do lote" "1" "$(echo "$PAINEL2" | jq '.stats.blocked_after')"
check "a resposta entrou na hora de Brasília" "1" "$(echo "$PAINEL2" | jq --argjson h "$HORA_BR" '.by_hour[$h]')"
check "o disparo continua agendado enquanto há fila" "agendado" "$(echo "$PAINEL2" | jq -r '.disparo.status')"

curl -s -X POST $API/v1/sends/$SEND4/mark -H "$J" -H "$HD" -d '{"status":"enviada"}' > /dev/null
curl -s -X POST $API/v1/sends/$SEND5/mark -H "$J" -H "$HD" -d '{"status":"enviada"}' > /dev/null
check "o disparo fecha quando a fila zera" "concluido" \
  "$(curl -s $API/v1/disparos/$DISP_ID -H "$HD" | jq -r '.disparo.status')"

PRV2=$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
  -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"split\":true,\"mode\":\"fila\"}")
check "quem já recebeu este modelo cai na trava de 30 dias" "5" "$(echo "$PRV2" | jq '.dupes')"
check "quem pediu para não receber cai no bloqueio" "1" "$(echo "$PRV2" | jq '.blocked')"
check "com todos travados, ninguém pode receber" "0" "$(echo "$PRV2" | jq '.sendable')"
check "sem ninguém para receber, criar disparo é NO_RECIPIENTS" "NO_RECIPIENTS" \
  "$(curl -s -X POST $API/v1/disparos -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"mode\":\"fila\"}" | jq -r .error.code)"
check "a trava é por modelo: outro modelo não foi travado" "0" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F007\",\"mode\":\"fila\"}" | jq '.dupes')"

# Texto escrito na mão no lugar do modelo (§13): é a contagem de público da
# caixa de campanha do Freela em "escrever aqui". A trava de 30 dias é por
# MODELO — aqui os mesmos 5 leads que acabaram de travar no `$TPL_F001` voltam a
# poder receber.
PRV_TXT=$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
  -d "{\"filters\":$FILTRO,\"text\":\"Oi {{primeiro_nome_dono}}, e o {{estabelecimento}}?\",\"mode\":\"fila\"}")
check "prévia aceita texto no lugar do modelo" "5" "$(echo "$PRV_TXT" | jq '.audience')"
check "texto avulso não tem trava de 30 dias (a trava é por modelo)" "0" "$(echo "$PRV_TXT" | jq '.dupes')"
check "quem pediu para não receber continua fora do texto avulso" "1" "$(echo "$PRV_TXT" | jq '.blocked')"
check "o texto avulso é renderizado lead a lead" "true" \
  "$(echo "$PRV_TXT" | jq --arg n "Casa Disparo 1 · $SUF" '.previews[0].text == ("Oi Chefe1, e o " + $n + "?")')"
check "as variantes do texto avulso saem separadas por ---" "A B A B" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"text\":\"Bom dia {{primeiro_nome_dono}}\n---\nBoa tarde {{primeiro_nome_dono}}\",\"split\":true,\"mode\":\"fila\"}" \
    | jq -r '[.previews[].variant] | join(" ")')"
check "no modo freela o texto avulso é convertido igual ao modelo" "Oi {{primeiro_nome}}, sou Diego. E o {{estabelecimento}}?" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"text\":\"Oi {{primeiro_nome}}, sou {{meu_nome}}. E o {{estabelecimento}}?\",\"mode\":\"freela\"}" \
    | jq -r '.freela.template')"
check "a conversão do texto avulso avisa o que o Freela não tem" "estabelecimento" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"text\":\"Oi {{primeiro_nome}}, e o {{estabelecimento}}?\",\"mode\":\"freela\"}" \
    | jq -r '.freela.unsupported_variables | join(",")')"
check "modelo e texto juntos barrados" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"text\":\"Oi\",\"mode\":\"fila\"}" | jq -r .error.code)"
check "prévia sem modelo e sem texto barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"mode\":\"fila\"}" | jq -r .error.code)"
check "criar disparo só com texto (sem modelo) barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"text\":\"Oi {{primeiro_nome_dono}}\",\"mode\":\"fila\"}" | jq -r .error.code)"

check "prévia com modelo inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"00000000-0000-4000-8000-00000000beef\",\"mode\":\"fila\"}" | jq -r .error.code)"
check "praça no filtro que não é uuid nem 'all' barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":{\"praca_id\":\"a-praca-de-bh\"},\"template_id\":\"$TPL_F001\",\"mode\":\"fila\"}" | jq -r .error.code)"
check "etapa fora do funil no filtro barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":{\"stage\":9},\"template_id\":\"$TPL_F001\",\"mode\":\"fila\"}" | jq -r .error.code)"
check "campo desconhecido no filtro barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":{\"cidade\":\"Belo Horizonte\"},\"template_id\":\"$TPL_F001\",\"mode\":\"fila\"}" | jq -r .error.code)"
check "modo de envio fora do catálogo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/disparos/preview -H "$J" -H "$HD" \
    -d "{\"filters\":$FILTRO,\"template_id\":\"$TPL_F001\",\"mode\":\"provedor\"}" | jq -r .error.code)"
check "status de marcação fora de enviada/entregue barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/sends/$SEND1/mark -H "$J" -H "$HD" -d '{"status":"falhou"}' | jq -r .error.code)"
# Envio já respondido não volta atrás (apagaria a resposta do painel).
check "marcar envio já respondido = ALREADY_REPLIED" "ALREADY_REPLIED" \
  "$(curl -s -X POST $API/v1/sends/$SEND2/mark -H "$J" -H "$HD" -d '{"status":"enviada"}' | jq -r .error.code)"
# A guarda do modo `freela` em `mark` (409 FREELA_SEND, §18.5) não cabe aqui:
# criar um disparo em modo `freela` exige a conexão configurada (503 acima), e
# sem ela não existe `msg_send` em modo `freela` para tentar marcar. A guarda é
# coberta pelo jest — `src/modules/disparos/__tests__/disparos.service.spec.ts`.
check "o envio respondido continua respondida" "respondida" \
  "$(curl -s $API/v1/disparos/$DISP_ID -H "$HD" | jq -r --arg i "$SEND2" '[.sends[] | select(.id==$i)][0].status')"
check "resposta sem texto barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/sends/$SEND1/reply -H "$J" -H "$HD" -d '{"text":""}' | jq -r .error.code)"
check "resposta só com espaço barrada (o texto é aparado antes de validar)" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/sends/$SEND1/reply -H "$J" -H "$HD" -d '{"text":"   "}' | jq -r .error.code)"
check "disparo inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/disparos/00000000-0000-4000-8000-00000000beef -H "$HD" | jq -r .error.code)"
check "disparo com id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s $API/v1/disparos/nao-e-uuid -H "$HD" | jq -r .error.code)"
check "envio inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/sends/00000000-0000-4000-8000-00000000beef/mark -H "$J" -H "$HD" \
    -d '{"status":"enviada"}' | jq -r .error.code)"
check "envio com id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/sends/nao-e-uuid/reply -H "$J" -H "$HD" -d '{"text":"oi"}' | jq -r .error.code)"

# --- limpeza: disparo (cascata na fila), bloqueio automático e casas de teste ---
check "daniel (não admin) não apaga disparo" "FORBIDDEN" \
  "$(curl -s -X DELETE $API/v1/disparos/$DISP_ID -H "$HN" | jq -r .error.code)"
check "admin apaga o disparo de teste (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/disparos/$DISP_ID -H "$HD" | jq -r .ok)"
check "disparo apagado sumiu da lista" "false" \
  "$(curl -s $API/v1/disparos -H "$HD" | jq --arg i "$DISP_ID" 'any(.id==$i)')"
check "a fila do disparo foi junto (cascata)" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/sends/$SEND1/mark -H "$J" -H "$HD" -d '{"status":"enviada"}' | jq -r .error.code)"
check "remove o bloqueio do opt-out (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/blocklist/$(echo "$BLOQ_OPTOUT" | jq -r .id) -H "$HD" | jq -r .ok)"
DISP_APAGADOS=0
for id in "${DISP_LEADS[@]}"; do
  [ "$(curl -s -X DELETE $API/v1/leads/$id -H "$HD" | jq -r .ok)" = "true" ] && DISP_APAGADOS=$((DISP_APAGADOS+1))
done
check "apaga as 5 casas de teste do disparo (sem resíduo)" "5" "$DISP_APAGADOS"
check "praça do smoke ficou sem lead nenhum" "0" \
  "$(curl -s "$API/v1/leads?praca_id=$NOVA_ID&archived=true" -H "$HD" | jq 'length')"

echo "── Cadências ──"
# --- as 5 cadências-modelo do seed: só leitura ---
CADS=$(curl -s $API/v1/cadences -H "$HD")
check "seed traz as 5 cadências prontas" "5" "$(echo "$CADS" | jq 'length')"
# Nascem PAUSADAS de propósito: despausar é ato de gente. Ligadas, o relógio
# matricularia toda a base na primeira rodada (ver §14 do contrato).
check "as cadências-modelo nascem pausadas" "5" "$(echo "$CADS" | jq '[.[] | select(.paused)] | length')"
CAD_PROSP=$(echo "$CADS" | jq -r '[.[] | select(.name == "Prospecção de contratante — 3 toques")][0].id')
PROSP=$(echo "$CADS" | jq --arg i "$CAD_PROSP" '[.[] | select(.id==$i)][0]')
check "a prospecção entra por lead novo" "stage_novo" "$(echo "$PROSP" | jq -r '.entry')"
check "a prospecção é de contratante" "contratante" "$(echo "$PROSP" | jq -r '.audience')"
check "a trilha da prospecção tem os 7 nós do protótipo" "7" "$(echo "$PROSP" | jq '.nodes | length')"
check "os nós vêm na ordem da trilha (sort 0..6)" "true" \
  "$(echo "$PROSP" | jq '[.nodes[].sort] == [0,1,2,3,4,5,6]')"
check "o toque 1 é o modelo de mensagem do seed" "$TPL_F001" "$(echo "$PROSP" | jq -r '.nodes[0].template_id')"
check "o toque 3 é tarefa de ligação, não mensagem" "task" "$(echo "$PROSP" | jq -r '.nodes[4].kind')"
check "a tarefa do toque 3 tem o texto do protótipo" "Ligar para o dono do lead — toque 3 é ligação, não mensagem" \
  "$(echo "$PROSP" | jq -r '.nodes[4].task')"
check "quem responde sai para a Conversa aberta" "respondeu sai_conversa" \
  "$(echo "$PROSP" | jq -r '"\(.nodes[1].rule) \(.nodes[1].action)"')"
check "quem chega ao fim vai para reaquecimento em 30 dias" "reaquecer_30" "$(echo "$PROSP" | jq -r '.exit.action')"
check "a saída da prospecção guarda a explicação do protótipo" "true" \
  "$(echo "$PROSP" | jq '.exit.note | startswith("Quem chegou ao fim sem responder sai com despedida educada")')"
check "restore-seed não recria o que já existe" "0" \
  "$(curl -s -X POST $API/v1/cadences/restore-seed -H "$HD" | jq '.created')"
check "restore-seed não duplica cadência" "5" "$(curl -s $API/v1/cadences -H "$HD" | jq 'length')"
check "cadência inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/cadences/00000000-0000-4000-8000-00000000beef -H "$HD" | jq -r .error.code)"
check "cadência com id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s $API/v1/cadences/nao-e-uuid -H "$HD" | jq -r .error.code)"

# --- cadência de teste: criada, editada e apagada aqui mesmo (fica pausada) ---
EDIT_BODY=$(cat <<JSON
{"name":"Cadência editável $SUF","audience":"freelancer","entry":"praca_mapeamento","paused":true,
 "exit":{"action":"fila_confirmacao","note":"Fim do teste do smoke."},
 "nodes":[{"kind":"msg","day":0,"channel":"interno","text":"  Oi {{nome}}, teste $SUF.  "},
          {"kind":"cond","day":9,"rule":"sem_resposta","action":"continua","note":"segue"},
          {"kind":"task","day":4,"task":"Ligar para confirmar"},
          {"kind":"msg","day":7,"template_id":"$TPL_F007","text":"texto que o modelo vence"}]}
JSON
)
CAD_EDIT=$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" -d "$EDIT_BODY")
CAD_EDIT_ID=$(echo "$CAD_EDIT" | jq -r .id)
check "cadência nova nasce com os 4 nós na ordem recebida" "true" \
  "$(echo "$CAD_EDIT" | jq '[.nodes[].kind] == ["msg","cond","task","msg"] and ([.nodes[].sort] == [0,1,2,3])')"
check "o texto próprio entra aparado" "Oi {{nome}}, teste $SUF." "$(echo "$CAD_EDIT" | jq -r '.nodes[0].text')"
check "o nó de mensagem guarda o canal escolhido" "interno" "$(echo "$CAD_EDIT" | jq -r '.nodes[0].channel')"
check "condição não tem dia próprio (roda junto do passo)" "0" "$(echo "$CAD_EDIT" | jq '.nodes[1].day')"
check "modelo vence texto próprio no mesmo nó" "null" "$(echo "$CAD_EDIT" | jq -r '.nodes[3].text')"
check "nó de tarefa não guarda canal nem modelo" "null null" \
  "$(echo "$CAD_EDIT" | jq -r '"\(.nodes[2].channel) \(.nodes[2].template_id)"')"
check "6 cadências com a de teste" "6" "$(curl -s $API/v1/cadences -H "$HD" | jq 'length')"

# PUT preserva o id dos nós que voltam com id — é o que mantém o log das
# inscrições válido (quem está no passo 3 não volta para o passo 1).
NO0=$(echo "$CAD_EDIT" | jq -r '.nodes[0].id'); NO3=$(echo "$CAD_EDIT" | jq -r '.nodes[3].id')
PUT_BODY=$(echo "$CAD_EDIT" | jq -c '{name, audience, entry, paused, exit,
  nodes: [(.nodes[0] | {id, kind, day, channel, text}),
          (.nodes[1] | {id, kind, rule, action}),
          {kind:"task", day:3, task:"Tarefa nova do smoke"}]}')
EDITADA=$(curl -s -X PUT $API/v1/cadences/$CAD_EDIT_ID -H "$J" -H "$HD" -d "$PUT_BODY")
check "PUT deixa a trilha com os 3 nós mandados" "3" "$(echo "$EDITADA" | jq '.nodes | length')"
check "PUT preserva o id do nó que voltou com id" "$NO0" "$(echo "$EDITADA" | jq -r '.nodes[0].id')"
check "PUT apaga o nó que não voltou no corpo" "true" \
  "$(echo "$EDITADA" | jq --arg i "$NO3" '[.nodes[].id] | index($i) == null')"
check "PUT cria o nó novo com id próprio" "true" \
  "$(echo "$EDITADA" | jq --arg i "$NO0" '.nodes[2].kind == "task" and .nodes[2].id != $i')"
check "PUT reordena o sort pela ordem recebida" "true" "$(echo "$EDITADA" | jq '[.nodes[].sort] == [0,1,2]')"

check "mensagem sem modelo e sem texto barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"contratante\",\"entry\":\"manual\",\"exit\":{\"action\":\"sai\"},\"nodes\":[{\"kind\":\"msg\",\"day\":0}]}" | jq -r .error.code)"
check "condição sem regra barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"contratante\",\"entry\":\"manual\",\"exit\":{\"action\":\"sai\"},\"nodes\":[{\"kind\":\"cond\",\"action\":\"sai\"}]}" | jq -r .error.code)"
check "tarefa sem descrição barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"contratante\",\"entry\":\"manual\",\"exit\":{\"action\":\"sai\"},\"nodes\":[{\"kind\":\"task\",\"day\":1}]}" | jq -r .error.code)"
check "tipo de nó fora do catálogo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"contratante\",\"entry\":\"manual\",\"exit\":{\"action\":\"sai\"},\"nodes\":[{\"kind\":\"ligacao\"}]}" | jq -r .error.code)"
check "regra de entrada fora do catálogo barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"contratante\",\"entry\":\"lua_cheia\",\"exit\":{\"action\":\"sai\"},\"nodes\":[]}" | jq -r .error.code)"
check "público fora do catálogo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"dono\",\"entry\":\"manual\",\"exit\":{\"action\":\"sai\"},\"nodes\":[]}" | jq -r .error.code)"
check "'segue na cadência' não serve de saída da trilha" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"contratante\",\"entry\":\"manual\",\"exit\":{\"action\":\"continua\"},\"nodes\":[]}" | jq -r .error.code)"
check "campo desconhecido no corpo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"contratante\",\"entry\":\"manual\",\"exit\":{\"action\":\"sai\"},\"nodes\":[],\"cor\":\"azul\"}" | jq -r .error.code)"
check "nó que cita modelo inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" \
    -d "{\"name\":\"X\",\"audience\":\"contratante\",\"entry\":\"manual\",\"exit\":{\"action\":\"sai\"},\"nodes\":[{\"kind\":\"msg\",\"day\":0,\"template_id\":\"00000000-0000-4000-8000-00000000beef\"}]}" | jq -r .error.code)"
check "PUT em cadência inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X PUT $API/v1/cadences/00000000-0000-4000-8000-00000000beef -H "$J" -H "$HD" -d "$PUT_BODY" | jq -r .error.code)"

check "toggle-pause despausa a cadência de teste" "false" \
  "$(curl -s -X POST $API/v1/cadences/$CAD_EDIT_ID/toggle-pause -H "$HD" | jq '.paused')"
check "toggle-pause pausa de volta" "true" \
  "$(curl -s -X POST $API/v1/cadences/$CAD_EDIT_ID/toggle-pause -H "$HD" | jq '.paused')"
check "apaga a cadência editável (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/cadences/$CAD_EDIT_ID -H "$HD" | jq -r .ok)"
check "cadência apagada sumiu da lista" "5" "$(curl -s $API/v1/cadences -H "$HD" | jq 'length')"
check "DELETE de cadência inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X DELETE $API/v1/cadences/00000000-0000-4000-8000-00000000beef -H "$HD" | jq -r .error.code)"

# --- inscrição na mão, na cadência-modelo (pausada: o relógio não mexe) ---
CAD_LEAD=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Bar $SUF\",\"city\":\"Cidade Cad $SUF\",\"phone\":\"(31) 98777-${SUF: -4}\",\"decisor\":\"Fulano de Teste\",\"classe\":\"alvo\",\"origem\":\"prospecção\",\"owner_id\":\"$DIEGO_ID\",\"stage\":2}")
CAD_LEAD_ID=$(echo "$CAD_LEAD" | jq -r .id)
check "o lead do teste de cadência nasce na etapa 2 (fora da entrada automática)" "2" \
  "$(echo "$CAD_LEAD" | jq '.stage')"
INSC=$(curl -s -X POST $API/v1/cadences/$CAD_PROSP/enroll -H "$J" -H "$HD" -d "{\"lead_id\":\"$CAD_LEAD_ID\"}")
check "entrada manual coloca o lead na cadência" "true false" \
  "$(echo "$INSC" | jq -r '"\(.ok) \(.waiting)"')"
check "entrar duas vezes na mesma cadência não duplica" "false false" \
  "$(curl -s -X POST $API/v1/cadences/$CAD_PROSP/enroll -H "$J" -H "$HD" \
    -d "{\"lead_id\":\"$CAD_LEAD_ID\"}" | jq -r '"\(.ok) \(.waiting)"')"

# Corrida: dois cliques em "colocar na cadência" ao mesmo tempo. Sem o lock por
# pessoa os dois leriam "não está dentro" antes de qualquer um gravar e a trilha
# entraria duas vezes para o mesmo lead.
CAD_LEAD2=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Casa Cadência $SUF\",\"city\":\"Cidade Cad $SUF\",\"phone\":\"(31) 98666-${SUF: -4}\",\"decisor\":\"Beltrano de Teste\",\"classe\":\"alvo\",\"origem\":\"prospecção\",\"owner_id\":\"$DIEGO_ID\",\"stage\":2}")
CAD_LEAD2_ID=$(echo "$CAD_LEAD2" | jq -r .id)
curl -s -X POST $API/v1/cadences/$CAD_PROSP/enroll -H "$J" -H "$HD" -d "{\"lead_id\":\"$CAD_LEAD2_ID\"}" > /tmp/praca-smoke-enr-a.json &
curl -s -X POST $API/v1/cadences/$CAD_PROSP/enroll -H "$J" -H "$HD" -d "{\"lead_id\":\"$CAD_LEAD2_ID\"}" > /tmp/praca-smoke-enr-b.json &
wait
check "dois cliques ao mesmo tempo colocam a pessoa UMA vez" "1" \
  "$(jq -s '[.[] | select(.ok == true)] | length' /tmp/praca-smoke-enr-a.json /tmp/praca-smoke-enr-b.json)"
rm -f /tmp/praca-smoke-enr-a.json /tmp/praca-smoke-enr-b.json
check "só uma inscrição da corrida ficou no banco" "1" \
  "$(curl -s "$API/v1/enrollments?cadence_id=$CAD_PROSP" -H "$HD" | jq --arg l "$CAD_LEAD2_ID" '[.[] | select(.lead_id==$l)] | length')"
INSCS=$(curl -s "$API/v1/enrollments?cadence_id=$CAD_PROSP" -H "$HD")
INSC_ID=$(echo "$INSCS" | jq -r --arg l "$CAD_LEAD_ID" '[.[] | select(.lead_id==$l)][0].id')
INSC_VIEW=$(echo "$INSCS" | jq --arg i "$INSC_ID" '[.[] | select(.id==$i)][0]')
check "a inscrição nasce ativa" "ativo" "$(echo "$INSC_VIEW" | jq -r '.status')"
check "a inscrição guarda a etapa de quando entrou" "2" "$(echo "$INSC_VIEW" | jq '.stage_at_start')"
check "a inscrição da mão não é de teste" "false" "$(echo "$INSC_VIEW" | jq '.is_test')"
check "cadência pausada não avança ninguém" "0" "$(echo "$INSC_VIEW" | jq '.logs | length')"
check "o primeiro passo da prospecção vence no dia da entrada (dia 0)" "true" \
  "$(echo "$INSC_VIEW" | jq '.next_at == .started_at')"
check "entrar com lead inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/cadences/$CAD_PROSP/enroll -H "$J" -H "$HD" \
    -d '{"lead_id":"00000000-0000-4000-8000-00000000beef"}' | jq -r .error.code)"
check "entrar em cadência inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/cadences/00000000-0000-4000-8000-00000000beef/enroll -H "$J" -H "$HD" \
    -d "{\"lead_id\":\"$CAD_LEAD_ID\"}" | jq -r .error.code)"
check "inscrição com cadence_id malformado = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/enrollments?cadence_id=nao-e-uuid" -H "$HD" | jq -r .error.code)"
check "inscrição de cadência inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s "$API/v1/enrollments?cadence_id=00000000-0000-4000-8000-00000000beef" -H "$HD" | jq -r .error.code)"

# --- cadência do motor: ligada, entrada manual (nenhum lead do seed entra sozinho) ---
ENG_BODY=$(cat <<JSON
{"name":"Cadência do relógio $SUF","audience":"contratante","entry":"manual","paused":false,
 "exit":{"action":"sai","note":"Fim do teste do motor."},
 "nodes":[{"kind":"msg","day":0,"text":"Oi {{primeiro_nome_dono}}, relógio $SUF em {{cidade}}."},
          {"kind":"cond","rule":"respondeu","action":"sai_conversa"},
          {"kind":"task","day":0,"task":"Ligar para o lead — teste do relógio"},
          {"kind":"msg","day":5,"template_id":"$TPL_F007"}]}
JSON
)
CAD_ENG=$(curl -s -X POST $API/v1/cadences -H "$J" -H "$HD" -d "$ENG_BODY")
CAD_ENG_ID=$(echo "$CAD_ENG" | jq -r .id)
check "a cadência do relógio nasce ligada" "false" "$(echo "$CAD_ENG" | jq '.paused')"

# O lead já roda a prospecção: uma cadência por pessoa, então esta fica esperando.
ESPERA=$(curl -s -X POST $API/v1/cadences/$CAD_ENG_ID/enroll -H "$J" -H "$HD" -d "{\"lead_id\":\"$CAD_LEAD_ID\"}")
check "quem já roda outra cadência entra na fila de espera" "true true" \
  "$(echo "$ESPERA" | jq -r '"\(.ok) \(.waiting)"')"
check "a inscrição em espera nasce aguardando" "aguardando" \
  "$(curl -s "$API/v1/enrollments?cadence_id=$CAD_ENG_ID" -H "$HD" | jq -r '.[0].status')"

# Tira o lead da prospecção na mão: agora a fila de espera pode liberar a outra.
SAIDA=$(curl -s -X POST $API/v1/enrollments/$INSC_ID/exit -H "$J" -H "$HD" -d '{}')
check "sair na mão marca saiu com motivo manual" "saiu manual" \
  "$(echo "$SAIDA" | jq -r '"\(.status) \(.exit_reason)"')"
check "sair de inscrição que já saiu = ALREADY_EXITED" "ALREADY_EXITED" \
  "$(curl -s -X POST $API/v1/enrollments/$INSC_ID/exit -H "$J" -H "$HD" -d '{}' | jq -r .error.code)"
check "a inscrição encerrada mantém o motivo original" "manual" \
  "$(curl -s "$API/v1/enrollments?cadence_id=$CAD_PROSP" -H "$HD" \
    | jq -r --arg i "$INSC_ID" '[.[] | select(.id==$i)][0].exit_reason')"
check "motivo de saída fora do catálogo barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/enrollments/$INSC_ID/exit -H "$J" -H "$HD" -d '{"reason":"cansei"}' | jq -r .error.code)"
check "sair de inscrição inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/enrollments/00000000-0000-4000-8000-00000000beef/exit -H "$J" -H "$HD" -d '{}' | jq -r .error.code)"
check "inscrição com id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/enrollments/nao-e-uuid/exit -H "$J" -H "$HD" -d '{}' | jq -r .error.code)"

# "Testar comigo": o próprio número entra com o tempo comprimido (1 dia = 5 s).
TESTE_CAD=$(curl -s -X POST $API/v1/cadences/$CAD_ENG_ID/test -H "$J" -H "$HD" \
  -d "{\"phone\":\"(31) 90000-${SUF: -4}\"}")
TESTE_LEAD_ID=$(echo "$TESTE_CAD" | jq -r .lead_id)
TESTE_INSC_ID=$(echo "$TESTE_CAD" | jq -r .enrollment_id)
check "o teste devolve a inscrição e o lead de teste" "true" \
  "$(echo "$TESTE_CAD" | jq '(.enrollment_id != null) and (.lead_id != null)')"
TESTE_LEAD=$(curl -s $API/v1/leads/$TESTE_LEAD_ID -H "$HD")
check "o lead do teste tem o nome do protótipo" "Teste — Cadência" "$(echo "$TESTE_LEAD" | jq -r '.name')"
check "o lead do teste guarda o telefone informado" "(31) 90000-${SUF: -4}" "$(echo "$TESTE_LEAD" | jq -r '.phone')"
check "a inscrição do teste é marcada como de teste" "true" \
  "$(curl -s "$API/v1/enrollments?cadence_id=$CAD_ENG_ID" -H "$HD" \
    | jq --arg i "$TESTE_INSC_ID" '[.[] | select(.id==$i)][0].is_test')"
check "o teste vence agora (não espera a janela)" "true" \
  "$(curl -s "$API/v1/enrollments?cadence_id=$CAD_ENG_ID" -H "$HD" \
    | jq --arg i "$TESTE_INSC_ID" '[.[] | select(.id==$i)][0] | .next_at == .started_at')"
check "telefone curto no teste barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/cadences/$CAD_ENG_ID/test -H "$J" -H "$HD" -d '{"phone":"31"}' | jq -r .error.code)"

# Quem já passou da Conversa aberta e responde: sai da cadência, mas a etapa
# NÃO desce (a resposta é registrada antes da primeira rodada do relógio).
LEAD6=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Cliente Cadência $SUF\",\"city\":\"Cidade Cad $SUF\",\"phone\":\"(31) 98555-${SUF: -4}\",\"decisor\":\"Cliente de Teste\",\"classe\":\"grande\",\"origem\":\"prospecção\",\"owner_id\":\"$DIEGO_ID\",\"stage\":6}")
LEAD6_ID=$(echo "$LEAD6" | jq -r .id)
check "o lead da regra de etapa nasce na etapa 6" "6" "$(echo "$LEAD6" | jq '.stage')"
curl -s -X POST $API/v1/cadences/$CAD_ENG_ID/enroll -H "$J" -H "$HD" -d "{\"lead_id\":\"$LEAD6_ID\"}" > /dev/null
curl -s -X POST $API/v1/leads/$LEAD6_ID/events -H "$J" -H "$HD" \
  -d '{"kind":"msg_in","text":"quero sim, me liga hoje"}' > /dev/null

# Lead arquivado: a trilha para nele (não é do protótipo — lá continuava indo).
LEAD_ARQ=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Arquivado Cadência $SUF\",\"city\":\"Cidade Cad $SUF\",\"phone\":\"(31) 98444-${SUF: -4}\",\"decisor\":\"Sumido de Teste\",\"classe\":\"alvo\",\"origem\":\"prospecção\",\"owner_id\":\"$DIEGO_ID\",\"stage\":2}")
LEAD_ARQ_ID=$(echo "$LEAD_ARQ" | jq -r .id)
curl -s -X POST $API/v1/cadences/$CAD_ENG_ID/enroll -H "$J" -H "$HD" -d "{\"lead_id\":\"$LEAD_ARQ_ID\"}" > /dev/null
curl -s -X POST $API/v1/leads/$LEAD_ARQ_ID/archive -H "$HD" > /dev/null

# O relógio roda a cada 15 s: uma espera para ver a trilha andar de verdade.
sleep 20

ENG_INSCS=$(curl -s "$API/v1/enrollments?cadence_id=$CAD_ENG_ID" -H "$HD")
TESTE_VIEW=$(echo "$ENG_INSCS" | jq --arg i "$TESTE_INSC_ID" '[.[] | select(.id==$i)][0]')
check "o relógio andou na inscrição de teste" "true" "$(echo "$TESTE_VIEW" | jq '(.logs | length) >= 1')"
check "o log guarda a mensagem que saiu (com o id do envio)" "true" \
  "$(echo "$TESTE_VIEW" | jq '[.logs[] | select(.kind=="msg" and .send_id != null)] | length >= 1')"
check "a condição também vai para o log (não é reavaliada para sempre)" "true" \
  "$(echo "$TESTE_VIEW" | jq '[.logs[] | select(.kind=="cond")] | length >= 1')"
check "a tarefa da trilha também vai para o log" "true" \
  "$(echo "$TESTE_VIEW" | jq '[.logs[] | select(.kind=="task")] | length >= 1')"
check "a tarefa da cadência virou próximo passo do lead" "Ligar para o lead — teste do relógio" \
  "$(curl -s $API/v1/leads/$TESTE_LEAD_ID -H "$HD" | jq -r '.next_step.what')"
# Prova da compressão: o passo do dia 5 é esperado para HOJE (5 × 5 s), não para
# a semana que vem — sem compressão `next_at` cairia cinco dias à frente.
check "no teste cada dia da cadência virou segundos" "true" \
  "$(echo "$TESTE_VIEW" | jq '.next_at[0:10] == .started_at[0:10]')"
TESTE_LEAD2=$(curl -s $API/v1/leads/$TESTE_LEAD_ID -H "$HD")
check "a mensagem da cadência virou evento na timeline do lead" "true" \
  "$(echo "$TESTE_LEAD2" | jq --arg n "Cadência “Cadência do relógio $SUF” · dia 0: " \
    '[.events[] | select(.kind=="msg_out" and (.text | startswith($n)))] | length == 1')"
check "o texto do envio foi renderizado (sem variável crua)" "false" \
  "$(echo "$TESTE_LEAD2" | jq '[.events[] | select(.kind=="msg_out")] | any(.text | contains("{{"))')"
check "quem grava é a cadência, não uma pessoa" "Cadência" \
  "$(echo "$TESTE_LEAD2" | jq -r '[.events[] | select(.kind=="msg_out")][0].author_label')"
check "o toque da cadência conta como último contato" "$HOJE" "$(echo "$TESTE_LEAD2" | jq -r '.last_contact_date')"
E6=$(echo "$ENG_INSCS" | jq --arg l "$LEAD6_ID" '[.[] | select(.lead_id==$l)][0]')
check "quem responde sai da cadência na hora" "saiu respondeu" \
  "$(echo "$E6" | jq -r '"\(.status) \(.exit_reason)"')"
LEAD6_VIEW=$(curl -s $API/v1/leads/$LEAD6_ID -H "$HD")
check "quem já passou da Conversa aberta não é rebaixado ao responder" "6" "$(echo "$LEAD6_VIEW" | jq '.stage')"
check "a saída por resposta deixa o evento sem mudança de etapa" "1" \
  "$(echo "$LEAD6_VIEW" | jq --arg t "Saiu da cadência “Cadência do relógio $SUF” (respondeu) → etapa Conversa aberta." \
    '[.events[] | select(.text == $t and .stage_to == null)] | length')"
E_ARQ=$(echo "$ENG_INSCS" | jq --arg l "$LEAD_ARQ_ID" '[.[] | select(.lead_id==$l)][0]')
check "lead arquivado para a trilha" "saiu arquivado" "$(echo "$E_ARQ" | jq -r '"\(.status) \(.exit_reason)"')"
LEAD_ARQ_VIEW=$(curl -s $API/v1/leads/$LEAD_ARQ_ID -H "$HD")
check "a saída do arquivado deixa a nota no histórico" "true" \
  "$(echo "$LEAD_ARQ_VIEW" | jq --arg t "Saiu da cadência “Cadência do relógio $SUF” (lead arquivado)." 'any(.events[]; .text == $t)')"
check "lead arquivado não recebeu mensagem nenhuma" "0" \
  "$(echo "$LEAD_ARQ_VIEW" | jq '[.events[] | select(.kind=="msg_out")] | length')"
ESPERA_VIEW=$(echo "$ENG_INSCS" | jq --arg l "$CAD_LEAD_ID" '[.[] | select(.lead_id==$l)][0]')
check "quem estava esperando entrou quando a pessoa ficou livre" "ativo" "$(echo "$ESPERA_VIEW" | jq -r '.status')"
# Cadência pausada continua parada: a inscrição da prospecção passou a rodada
# inteira sem um único passo (e saiu na mão, não pelo relógio).
check "cadência pausada não mandou nada nem avançou" "saiu 0" \
  "$(curl -s "$API/v1/enrollments?cadence_id=$CAD_PROSP" -H "$HD" \
    | jq -r --arg i "$INSC_ID" '[.[] | select(.id==$i)][0] | "\(.status) \(.logs | length)"')"

STATS=$(curl -s $API/v1/cadences/$CAD_ENG_ID/stats -H "$HD")
check "o painel conta as duas inscrições" "true" "$(echo "$STATS" | jq '.entered >= 2')"
check "o painel conta quem está rodando agora" "true" "$(echo "$STATS" | jq '.active >= 1')"
check "o painel mede só os passos (condição não é passo)" "3" "$(echo "$STATS" | jq '.per_step | length')"
check "o primeiro passo já alcançou quem entrou" "true" "$(echo "$STATS" | jq '.per_step[0].reached >= 1')"
check "sem resposta, a taxa do passo é zero" "0" "$(echo "$STATS" | jq '.per_step[0].replied')"
check "quem está dentro aparece com o passo e a hora do próximo" "true" \
  "$(echo "$STATS" | jq '[.inside[] | select(.step_index >= 1 and .next_at != null)] | length >= 1')"
check "quem está dentro vem com o nome do lead" "true" \
  "$(echo "$STATS" | jq '(.inside | map(select(.lead_name != "")) | length) == (.inside | length)')"
check "o painel conta os motivos de quem saiu" "true" \
  "$(echo "$STATS" | jq '[.exits[].reason] | (index("respondeu") != null) and (index("arquivado") != null)')"
PROSP_STATS=$(curl -s $API/v1/cadences/$CAD_PROSP/stats -H "$HD")
check "a saída manual entra na conta dos motivos" "manual 1" \
  "$(echo "$PROSP_STATS" | jq -r '.exits[0] | "\(.reason) \(.count)"')"
check "a prospecção conta as duas inscrições que passaram por ela" "true" \
  "$(echo "$PROSP_STATS" | jq '.entered >= 2')"
check "stats de cadência inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/cadences/00000000-0000-4000-8000-00000000beef/stats -H "$HD" | jq -r .error.code)"

# --- limpeza: leads (levam inscrições, envios e eventos por cascata) e a cadência ---
check "apaga o lead de teste da cadência (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$TESTE_LEAD_ID -H "$HD" | jq -r .ok)"
check "apaga o lead Bar $SUF (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$CAD_LEAD_ID -H "$HD" | jq -r .ok)"
check "apaga o lead da corrida de inscrição (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$CAD_LEAD2_ID -H "$HD" | jq -r .ok)"
check "apaga o lead da regra de etapa (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$LEAD6_ID -H "$HD" | jq -r .ok)"
check "apaga o lead arquivado do teste (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/leads/$LEAD_ARQ_ID -H "$HD" | jq -r .ok)"
check "as inscrições foram junto com os leads (cascata)" "0" \
  "$(curl -s "$API/v1/enrollments?cadence_id=$CAD_ENG_ID" -H "$HD" | jq 'length')"
check "apaga a cadência do relógio (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/cadences/$CAD_ENG_ID -H "$HD" | jq -r .ok)"
check "voltou às 5 cadências do seed" "5" "$(curl -s $API/v1/cadences -H "$HD" | jq 'length')"
check "não sobrou inscrição nenhuma no banco" "0" "$(curl -s $API/v1/enrollments -H "$HD" | jq 'length')"
check "funil da praça seed voltou aos 25 leads" "25" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&archived=true" -H "$HD" | jq 'length')"

echo "── Mídia ──"
# Sigla + mês/ano do nome de campanha (`campanhaName`): a praça do seed é
# "Belo Horizonte · MG" (sigla BH) e o mês é o de HOJE em Brasília — o mesmo
# `todaySp()` que o seed usou para abrir as campanhas.
MESES_ABR=(Jan Fev Mar Abr Mai Jun Jul Ago Set Out Nov Dez)
MESANO="${MESES_ABR[$(($(TZ=America/Sao_Paulo date +%-m) - 1))]}$(TZ=America/Sao_Paulo date +%y)"
HOJE30_BR=$(TZ=America/Sao_Paulo date -d '+30 days' +%d/%m/%Y)
BEEF="00000000-0000-4000-8000-00000000beef"

# Corpo da campanha: praca_id, publico, objetivo, dor, provas (JSON), extra.
# `name` NUNCA entra — quem monta é o servidor.
corpo_camp() {
  printf '{"praca_id":"%s","publico":"%s","objetivo":"%s","start":"%s","end":"%s","verba":1000,"gasto":0,"dor":"%s","oferta":"","mensagem_chave":"Vaga aberta hoje na sua cidade.","provas":%s,"destino":"whatsapp","kpi_name":"Freelas confirmados","kpi_meta":10,"kpi_custo":50,"cac_teto":130%s}' \
    "$1" "$2" "$3" "$HOJE" "$HOJE30" "$4" "$5" "$6"
}

PROVAS=$(curl -s "$API/v1/proofs?praca_id=$PRACA_SEED" -H "$HD")
check "praça do seed tem as 13 provas do protótipo" "13" "$(echo "$PROVAS" | jq 'length')"
check "as provas vêm nos 3 tipos" "3" "$(echo "$PROVAS" | jq '[.[].kind] | unique | length')"
check "/v1/proofs sem praca_id é barrado" "VALIDATION_ERROR" "$(curl -s "$API/v1/proofs" -H "$HD" | jq -r .error.code)"
check "prova de praça que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/proofs -H "$J" -H "$HD" -d "{\"praca_id\":\"$BEEF\",\"kind\":\"caso\",\"title\":\"X\"}" | jq -r .error.code)"
# Lista de praça inexistente é 404 como em todo o resto da API (o `fill-brake`,
# que recebe o MESMO DTO, já era): lista vazia esconderia o id errado.
check "GET /v1/proofs de praça que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s "$API/v1/proofs?praca_id=$BEEF" -H "$HD" | jq -r .error.code)"
check "GET /v1/campanhas de praça que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s "$API/v1/campanhas?praca_id=$BEEF" -H "$HD" | jq -r .error.code)"
check "tipo de prova fora do catálogo é barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/proofs -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"kind\":\"podcast\",\"title\":\"X\"}" | jq -r .error.code)"
PROVA_SEED=$(echo "$PROVAS" | jq -r '.[0].id')

CAMPS=$(curl -s "$API/v1/campanhas?praca_id=$PRACA_SEED" -H "$HD")
check "praça do seed tem as 2 campanhas do protótipo" "2" "$(echo "$CAMPS" | jq 'length')"
CS1=$(echo "$CAMPS" | jq '[.[] | select(.publico=="contratante")][0]')
CS2=$(echo "$CAMPS" | jq '[.[] | select(.publico=="freelancer")][0]')
check "o nome da campanha é o mesmo do gerenciador" "BH-Contratante-Cadastro-$MESANO" "$(echo "$CS1" | jq -r .name)"
check "os 6 dias de tráfego somam 720 investidos" "720" "$(echo "$CS1" | jq '.metrics.investido')"
check "os 6 dias somam 5 conversões" "5" "$(echo "$CS1" | jq '.metrics.conversoes')"
check "custo por conversão = 720 / 5" "144" "$(echo "$CS1" | jq '.metrics.cpc')"
check "alcance e cliques somam os 6 dias" "64800 1188" \
  "$(echo "$CS1" | jq -r '"\(.metrics.alcance) \(.metrics.cliques)"')"
check "a campanha de contratante carrega 3 provas" "3" "$(echo "$CS1" | jq '.provas | length')"
check "campanha sem dia lançado fica no gasto declarado" "0" "$(echo "$CS2" | jq '.metrics.investido')"
check "a campanha de freelancer carrega 2 provas" "2" "$(echo "$CS2" | jq '.provas | length')"
check "sem lead de campanha, não há cadastro nem ativo" "0 0 false" \
  "$(echo "$CS1" | jq -r '"\(.metrics.cadastros) \(.metrics.ativos) \(.metrics.acima_teto)"')"
check "o portão da praça do seed está fechado" "false" "$(echo "$CS1" | jq '.gate.ok')"
check "o portão diz que falta a etapa 2 (22 de 40)" "Etapa 2 — 40 garçons confirmados (hoje: 22)" \
  "$(echo "$CS1" | jq -r '.gate.falta[0]')"
check "o portão também cobra a etapa 6" "Etapa 6 — 5 clientes com segunda vaga (hoje: 0)" \
  "$(echo "$CS1" | jq -r '.gate.falta[1]')"
check "GET /v1/campanhas sem praca_id lista todas" "true" "$(curl -s $API/v1/campanhas -H "$HD" | jq 'length >= 2')"
CS1_UMA=$(curl -s $API/v1/campanhas/$(echo "$CS1" | jq -r .id) -H "$HD")
check "GET /v1/campanhas/:id devolve a mesma view da lista" "true" \
  "$(jq -n --argjson a "$CS1" --argjson b "$CS1_UMA" '$a == $b')"
check "GET de campanha inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/campanhas/$BEEF -H "$HD" | jq -r .error.code)"
check "GET de campanha com id malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s $API/v1/campanhas/nao-e-uuid -H "$HD" | jq -r .error.code)"
CS1_ID=$(echo "$CS1" | jq -r .id)
CS2_ID=$(echo "$CS2" | jq -r .id)
check "os 5 criativos do seed estão nas 2 campanhas" "3 2" \
  "$(curl -s "$API/v1/creatives?campanha_id=$CS1_ID" -H "$HD" | jq 'length') $(curl -s "$API/v1/creatives?campanha_id=$CS2_ID" -H "$HD" | jq 'length')"
TR_SEED=$(curl -s "$API/v1/traffic?campanha_id=$CS1_ID" -H "$HD")
check "a entrada do seed é do Meta com 6 dias" "meta 6" "$(echo "$TR_SEED" | jq -r '"\(.[0].plataforma) \(.[0].days | length)"')"
check "a entrada do seed leva os 3 criativos da campanha" "3" "$(echo "$TR_SEED" | jq '.[0].criativos | length')"
# Os 3 criativos do seed estão em `aprovado`, `producao` e `a_fazer`: devolver a
# própria entrada num PUT tem de passar. Filtrar por status aqui derrubaria o
# salvamento da tela assim que alguém pedisse ajuste numa peça que já está no ar.
TR_SEED_ID=$(echo "$TR_SEED" | jq -r '.[0].id')
check "PUT devolvendo a própria entrada do seed passa (criativo não aprovado inclusive)" "3" \
  "$(curl -s -X PUT $API/v1/traffic/$TR_SEED_ID -H "$J" -H "$HD" \
    -d "$(echo "$TR_SEED" | jq -c '.[0] | {campanha_id, plataforma, nome_la, publico, geo, verba_diaria, criativos, manager_url, api_connected}')" \
    | jq '.criativos | length')"
CR_SEED=$(curl -s "$API/v1/creatives?campanha_id=$CS1_ID" -H "$HD" | jq -r '.[0].id')

FILL=$(curl -s "$API/v1/campanhas/fill-hours?praca_id=$PRACA_SEED" -H "$HD")
check "o freio de mídia usa o teto de 4 horas" "4" "$(echo "$FILL" | jq '.limit_h')"
check "o preenchimento do seed fica entre 2 h e 3 h" "true" \
  "$(echo "$FILL" | jq '.fill_hours > 2 and .fill_hours <= 3')"
check "abaixo do teto, o freio não acende" "false" "$(echo "$FILL" | jq '.above')"

check "sugerir nome não precisa de campanha nenhuma" "BH-Freelancer-PrimeiraVaga-$MESANO" \
  "$(curl -s -X POST $API/v1/campanhas/suggest-name -H "$J" -H "$HD" \
    -d "{\"praca_id\":\"$PRACA_SEED\",\"publico\":\"freelancer\",\"objetivo\":\"primeira_vaga\",\"start\":\"$HOJE\"}" | jq -r .name)"

# --- campanha de teste na praça do seed (sai inteira no fim da seção) ---
CAMP=$(curl -s -X POST $API/v1/campanhas -H "$J" -H "$HD" \
  -d "$(corpo_camp "$PRACA_SEED" freelancer primeira_vaga "Vaga do sábado sem ninguém para pegar." "[\"$PROVA_SEED\"]" "")")
CAMP_ID=$(echo "$CAMP" | jq -r .id)
check "campanha nova nasce rascunho" "rascunho" "$(echo "$CAMP" | jq -r .status)"
check "o nome é montado pelo servidor" "BH-Freelancer-PrimeiraVaga-$MESANO" "$(echo "$CAMP" | jq -r .name)"
check "campanha nova nasce sem número nenhum" "0 0 0" \
  "$(echo "$CAMP" | jq -r '"\(.metrics.investido) \(.metrics.conversoes) \(.metrics.leads)"')"
check "campanha nova nasce sem justificativa de portão" "null" "$(echo "$CAMP" | jq -r '.gate_justification')"
check "mandar 'name' no corpo é barrado (o nome é do servidor)" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/campanhas -H "$J" -H "$HD" \
    -d "$(corpo_camp "$PRACA_SEED" freelancer primeira_vaga "Dor." "[]" ",\"name\":\"na mão\"")" | jq -r .error.code)"
check "briefing sem a dor não salva" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/campanhas -H "$J" -H "$HD" \
    -d "$(corpo_camp "$PRACA_SEED" freelancer primeira_vaga "" "[]" "")" | jq -r .error.code)"
check "prova de outra praça não entra na campanha" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/campanhas -H "$J" -H "$HD" \
    -d "$(corpo_camp "$NOVA_ID" freelancer primeira_vaga "Dor." "[\"$PROVA_SEED\"]" "")" | jq -r .error.code)"
check "campanha que já nasce ativa com portão fechado exige justificativa" "GATE_JUSTIFICATION_REQUIRED" \
  "$(curl -s -X POST $API/v1/campanhas -H "$J" -H "$HD" \
    -d "$(corpo_camp "$PRACA_SEED" freelancer primeira_vaga "Dor." "[]" ",\"status\":\"ativa\"")" | jq -r .error.code)"

check "sair do rascunho com o portão fechado exige justificativa" "GATE_JUSTIFICATION_REQUIRED" \
  "$(curl -s -X POST $API/v1/campanhas/$CAMP_ID/status -H "$J" -H "$HD" -d '{"status":"ativa"}' | jq -r .error.code)"
check "a mensagem do portão explica o mínimo de 10 caracteres" "Esta praça ainda não bateu o portão. Escreva a justificativa (mínimo 10 caracteres)." \
  "$(curl -s -X POST $API/v1/campanhas/$CAMP_ID/status -H "$J" -H "$HD" -d '{"status":"ativa"}' | jq -r .error.message)"
check "justificativa de menos de 10 caracteres é barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/campanhas/$CAMP_ID/status -H "$J" -H "$HD" -d '{"status":"ativa","justification":"curta"}' | jq -r .error.code)"
ATIVA=$(curl -s -X POST $API/v1/campanhas/$CAMP_ID/status -H "$J" -H "$HD" \
  -d '{"status":"ativa","justification":"Diego assumiu o risco: a casa grande pediu o anúncio."}')
check "com justificativa a campanha sai do rascunho" "ativa" "$(echo "$ATIVA" | jq -r .status)"
check "a justificativa grava quem escreveu" "Diego" "$(echo "$ATIVA" | jq -r .gate_justification.by)"
check "a justificativa grava o texto" "Diego assumiu o risco: a casa grande pediu o anúncio." \
  "$(echo "$ATIVA" | jq -r .gate_justification.text)"
check "a segunda mudança de status não cobra justificativa de novo" "pausada" \
  "$(curl -s -X POST $API/v1/campanhas/$CAMP_ID/status -H "$J" -H "$HD" -d '{"status":"pausada"}' | jq -r .status)"
check "status fora do catálogo é barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/campanhas/$CAMP_ID/status -H "$J" -H "$HD" -d '{"status":"morta"}' | jq -r .error.code)"
check "status de campanha inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/campanhas/$BEEF/status -H "$J" -H "$HD" -d '{"status":"pausada"}' | jq -r .error.code)"
check "id de campanha malformado = NOT_FOUND (não 500)" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/campanhas/nao-e-uuid/status -H "$J" -H "$HD" -d '{"status":"pausada"}' | jq -r .error.code)"

# O PUT também passa pelo portão quando MUDA o status: campanha em rascunho sem
# justificativa nenhuma não vira "ativa" pelo briefing.
CAMP2=$(curl -s -X POST $API/v1/campanhas -H "$J" -H "$HD" \
  -d "$(corpo_camp "$PRACA_SEED" contratante marca "Marca desconhecida na praça." "[]" "")")
CAMP2_ID=$(echo "$CAMP2" | jq -r .id)
check "o PUT que sai do rascunho sem justificativa é barrado" "GATE_JUSTIFICATION_REQUIRED" \
  "$(curl -s -X PUT $API/v1/campanhas/$CAMP2_ID -H "$J" -H "$HD" \
    -d "$(corpo_camp "$PRACA_SEED" contratante marca "Marca desconhecida na praça." "[]" ",\"status\":\"ativa\"")" | jq -r .error.code)"
check "o PUT que fica no rascunho passa sem justificativa" "rascunho" \
  "$(curl -s -X PUT $API/v1/campanhas/$CAMP2_ID -H "$J" -H "$HD" \
    -d "$(corpo_camp "$PRACA_SEED" contratante marca "Outra dor." "[]" "")" | jq -r .status)"
# Campanha sem prova nenhuma copiada para praça sem prova nenhuma: a cópia nasce
# vazia em vez de estourar. (A cópia vive na praça de teste e sai com ela no fim.)
check "duplicar campanha sem prova não quebra" "rascunho 0" \
  "$(curl -s -X POST $API/v1/campanhas/$CAMP2_ID/duplicate -H "$J" -H "$HD" -d "{\"praca_id\":\"$NOVA_ID\"}" \
    | jq -r '"\(.status) \(.provas | length)"')"
check "apaga a segunda campanha de teste (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/campanhas/$CAMP2_ID -H "$HD" | jq -r .ok)"

PUTC=$(curl -s -X PUT $API/v1/campanhas/$CAMP_ID -H "$J" -H "$HD" \
  -d "$(corpo_camp "$PRACA_SEED" contratante cadastro_contratante "Dono perde o sábado." "[\"$PROVA_SEED\"]" ",\"status\":\"pausada\"")")
check "o PUT recalcula o nome pelo público e pelo objetivo" "BH-Contratante-Cadastro-$MESANO" "$(echo "$PUTC" | jq -r .name)"
check "o PUT mantém a justificativa já gravada" "Diego" "$(echo "$PUTC" | jq -r .gate_justification.by)"
check "reeditar o briefing sem mexer no status passa" "pausada" "$(echo "$PUTC" | jq -r .status)"
# `corpo_camp` não manda `status` quando o extra é vazio: a campanha está
# "pausada" e tem de continuar pausada depois do PUT.
check "PUT sem status mantém o status atual (não rebaixa a rascunho)" "pausada" \
  "$(curl -s -X PUT $API/v1/campanhas/$CAMP_ID -H "$J" -H "$HD" \
    -d "$(corpo_camp "$PRACA_SEED" contratante cadastro_contratante "Dono perde o sábado." "[\"$PROVA_SEED\"]" "")" | jq -r .status)"
check "status nulo no corpo é barrado (não vira 500)" "VALIDATION_ERROR" \
  "$(curl -s -X PUT $API/v1/campanhas/$CAMP_ID -H "$J" -H "$HD" \
    -d "$(corpo_camp "$PRACA_SEED" contratante cadastro_contratante "Dono perde o sábado." "[]" ",\"status\":null")" | jq -r .error.code)"
check "prova repetida no corpo entra uma vez (não estoura a chave)" "1" \
  "$(curl -s -X PUT $API/v1/campanhas/$CAMP_ID -H "$J" -H "$HD" \
    -d "$(corpo_camp "$PRACA_SEED" contratante cadastro_contratante "Dono perde o sábado." "[\"$PROVA_SEED\",\"$PROVA_SEED\"]" ",\"status\":\"pausada\"")" | jq '.provas | length')"

# --- criativos ---
CR_CORPO="\"campanha_id\":\"$CAMP_ID\",\"formato\":\"reels\",\"titulo\":\"Reels do sábado\",\"gancho\":\"Sábado, 19h, faltou garçom.\",\"roteiro\":{\"gancho\":\"g\",\"desenvolvimento\":\"d\",\"prova\":\"p\",\"cta\":\"c\"},\"legenda\":\"Legenda do reels.\",\"cta_botao\":\"Abrir vaga\",\"owner_id\":\"$DIEGO_ID\",\"due\":\"$HOJE3\""
CR=$(curl -s -X POST $API/v1/creatives -H "$J" -H "$HD" -d "{$CR_CORPO,\"status\":\"producao\"}")
CR_ID=$(echo "$CR" | jq -r .id)
check "criativo nasce sem aprovação e sem comentário" "null 0" \
  "$(echo "$CR" | jq -r '"\(.approved_at) \(.comments | length)"')"
check "o roteiro volta nas 4 partes" "g d p c" \
  "$(echo "$CR" | jq -r '"\(.roteiro.gancho) \(.roteiro.desenvolvimento) \(.roteiro.prova) \(.roteiro.cta)"')"
check "criativo sem IA volta com ia nulo" "null" "$(echo "$CR" | jq -r '.ia')"
check "formato fora do catálogo é barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/creatives -H "$J" -H "$HD" -d "{$CR_CORPO,\"status\":\"producao\",\"formato\":\"outdoor\"}" | jq -r .error.code)"
check "ferramenta de IA fora do catálogo é barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/creatives -H "$J" -H "$HD" -d "{$CR_CORPO,\"status\":\"producao\",\"ia\":{\"tool\":\"Photoshop\",\"prompt\":\"x\"}}" | jq -r .error.code)"
check "criativo de campanha que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/creatives -H "$J" -H "$HD" -d "{$CR_CORPO,\"status\":\"producao\",\"campanha_id\":\"$BEEF\"}" | jq -r .error.code)"

APROV=$(curl -s -X POST $API/v1/creatives/$CR_ID/review -H "$J" -H "$HD" -d '{"kind":"aprovacao"}')
check "aprovar joga o criativo para aprovado" "aprovado" "$(echo "$APROV" | jq -r .status)"
check "aprovar marca a hora da aprovação" "true" "$(echo "$APROV" | jq '.approved_at != null')"
check "aprovação sem texto grava 'Aprovado.'" "Aprovado." "$(echo "$APROV" | jq -r '.comments[-1].text')"
check "o comentário fica no nome de quem aprovou" "Diego aprovacao" \
  "$(echo "$APROV" | jq -r '.comments[-1] | "\(.author) \(.kind)"')"
AJUSTE=$(curl -s -X POST $API/v1/creatives/$CR_ID/review -H "$J" -H "$HD" -d '{"kind":"ajuste","text":"Trocar a capa: o preço está ilegível."}')
check "pedir ajuste volta o criativo para produção" "producao" "$(echo "$AJUSTE" | jq -r .status)"
check "pedir ajuste apaga a aprovação anterior" "null" "$(echo "$AJUSTE" | jq -r '.approved_at')"
check "pedir ajuste sem texto é barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/creatives/$CR_ID/review -H "$J" -H "$HD" -d '{"kind":"ajuste"}' | jq -r .error.code)"
check "texto nulo na revisão é barrado (não vira 500)" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/creatives/$CR_ID/review -H "$J" -H "$HD" -d '{"kind":"aprovacao","text":null}' | jq -r .error.code)"
PUB=$(curl -s -X POST $API/v1/creatives/$CR_ID/publish-date -H "$J" -H "$HD" -d "{\"date\":\"$HOJE30\"}")
check "mover a publicação muda a data" "$HOJE30" "$(echo "$PUB" | jq -r .publish_at)"
check "mover a publicação deixa nota no criativo" "Data de publicação movida para $HOJE30_BR." \
  "$(echo "$PUB" | jq -r '.comments[-1].text')"
check "a nota da publicação entra como 'nota'" "nota" "$(echo "$PUB" | jq -r '.comments[-1].kind')"
check "trocar só o status não deixa comentário" "producao 3" \
  "$(curl -s -X POST $API/v1/creatives/$CR_ID/status -H "$J" -H "$HD" -d '{"status":"producao"}' | jq -r '"\(.status) \(.comments | length)"')"
# Volta para aprovado — é o estado normal de uma peça que já foi revisada.
curl -s -X POST $API/v1/creatives/$CR_ID/review -H "$J" -H "$HD" -d '{"kind":"aprovacao","text":"Capa refeita."}' > /dev/null
CR2=$(curl -s -X POST $API/v1/creatives -H "$J" -H "$HD" -d "{$CR_CORPO,\"status\":\"a_fazer\",\"titulo\":\"Story da vaga\"}")
CR2_ID=$(echo "$CR2" | jq -r .id)
check "o PUT do criativo não muda de campanha" "campanha_id não pode ser alterado" \
  "$(curl -s -X PUT $API/v1/creatives/$CR_ID -H "$J" -H "$HD" \
    -d "{$CR_CORPO,\"status\":\"aprovado\",\"campanha_id\":\"$CS1_ID\"}" | jq -r .error.message)"
check "o PUT do criativo na própria campanha passa" "Reels do sábado (revisado)" \
  "$(curl -s -X PUT $API/v1/creatives/$CR_ID -H "$J" -H "$HD" \
    -d "{$CR_CORPO,\"status\":\"aprovado\",\"titulo\":\"Reels do sábado (revisado)\"}" | jq -r .titulo)"
check "os 2 criativos aparecem na campanha" "2" \
  "$(curl -s "$API/v1/creatives?campanha_id=$CAMP_ID" -H "$HD" | jq 'length')"

# --- tráfego ---
TR_CORPO="\"campanha_id\":\"$CAMP_ID\",\"plataforma\":\"meta\",\"nome_la\":\"BH-Contratante-Teste\",\"publico\":\"Donos de bar, 25–55\",\"geo\":\"Belo Horizonte + 50 km\",\"verba_diaria\":120"
check "criativo de outra campanha não entra no gerenciador" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/traffic -H "$J" -H "$HD" -d "{$TR_CORPO,\"criativos\":[\"$CR_SEED\"]}" | jq -r .error.code)"
check "endereço de gerenciador inválido é barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/traffic -H "$J" -H "$HD" -d "{$TR_CORPO,\"criativos\":[],\"manager_url\":\"nao-e-url\"}" | jq -r .error.code)"
TR=$(curl -s -X POST $API/v1/traffic -H "$J" -H "$HD" -d "{$TR_CORPO,\"criativos\":[\"$CR_ID\"]}")
TR_ID=$(echo "$TR" | jq -r .id)
check "entrada de tráfego nasce sem dia lançado e no manual" "0 false" \
  "$(echo "$TR" | jq -r '"\(.days | length) \(.api_connected)"')"
# O segundo criativo está em "a fazer": o gerenciador aceita mesmo assim (quem
# oferece só os aprovados é a tela, não a API).
check "o gerenciador aceita criativo da campanha ainda não aprovado" "2" \
  "$(curl -s -X PUT $API/v1/traffic/$TR_ID -H "$J" -H "$HD" \
    -d "{$TR_CORPO,\"criativos\":[\"$CR_ID\",\"$CR2_ID\"]}" | jq '.criativos | length')"
curl -s -X PUT $API/v1/traffic/$TR_ID/days -H "$J" -H "$HD" \
  -d "{\"date\":\"$HOJE\",\"investido\":100,\"alcance\":9000,\"cliques\":150,\"conversoes\":2}" > /dev/null
D2=$(curl -s -X PUT $API/v1/traffic/$TR_ID/days -H "$J" -H "$HD" \
  -d "{\"date\":\"$HOJE\",\"investido\":150,\"alcance\":9500,\"cliques\":160,\"conversoes\":3}")
check "lançar o mesmo dia duas vezes corrige a linha" "1" \
  "$(curl -s "$API/v1/traffic?campanha_id=$CAMP_ID" -H "$HD" | jq '.[0].days | length')"
check "o segundo lançamento é o que vale" "150 3" "$(echo "$D2" | jq -r '"\(.investido) \(.conversoes)"')"
check "lançamento na mão não vem marcado como automático" "false" "$(echo "$D2" | jq '.auto')"
check "puxar pela API sem a API ligada é barrado" "API_NOT_CONNECTED" \
  "$(curl -s -X POST $API/v1/traffic/$TR_ID/pull-api -H "$HD" | jq -r .error.code)"
check "ligar a API na entrada" "true" \
  "$(curl -s -X PUT $API/v1/traffic/$TR_ID -H "$J" -H "$HD" \
    -d "{$TR_CORPO,\"criativos\":[\"$CR_ID\",\"$CR2_ID\"],\"api_connected\":true}" | jq -r .api_connected)"
PULL=$(curl -s -X POST $API/v1/traffic/$TR_ID/pull-api -H "$HD")
check "puxar pela API usa a verba diária do dia" "120 10800 192 1" \
  "$(echo "$PULL" | jq -r '"\(.investido) \(.alcance) \(.cliques) \(.conversoes)"')"
check "a linha puxada da API vem marcada como automática" "true" "$(echo "$PULL" | jq '.auto')"
check "puxar pela API não cria segunda linha para o mesmo dia" "1" \
  "$(curl -s "$API/v1/traffic?campanha_id=$CAMP_ID" -H "$HD" | jq '.[0].days | length')"
check "entrada de tráfego que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/traffic/$BEEF/pull-api -H "$HD" | jq -r .error.code)"

# --- não mova o filho de praça (§15) ---
# `PUT /v1/campanhas/:id` gravava `praca_id` sem comparar com o atual: salvar o
# briefing com outra praça movia a campanha e levava criativos e tráfego (verba,
# gerenciador, dias investidos) junto — o portão e o `fill-hours` passavam a ser
# avaliados contra a praça de destino com o gasto da origem. É o vazamento que o
# `/duplicate` evita de propósito ("Tráfego NÃO vai").
check "PUT não muda a praça de campanha com criativo e tráfego" "CAMPANHA_HAS_CHILDREN" \
  "$(curl -s -X PUT $API/v1/campanhas/$CAMP_ID -H "$J" -H "$HD" \
    -d "$(corpo_camp "$NOVA_ID" contratante cadastro_contratante "Dono perde o sábado." "[]" ",\"status\":\"pausada\"")" | jq -r .error.code)"
check "a campanha continua na praça de origem" "$PRACA_SEED" \
  "$(curl -s $API/v1/campanhas/$CAMP_ID -H "$HD" | jq -r .praca_id)"
# Campanha ainda sem filho PODE trocar: não há gasto nem peça para vazar.
CAMP3=$(curl -s -X POST $API/v1/campanhas -H "$J" -H "$HD" \
  -d "$(corpo_camp "$PRACA_SEED" contratante marca "Marca desconhecida." "[]" "")")
CAMP3_ID=$(echo "$CAMP3" | jq -r .id)
check "campanha sem criativo e sem tráfego pode trocar de praça" "$NOVA_ID" \
  "$(curl -s -X PUT $API/v1/campanhas/$CAMP3_ID -H "$J" -H "$HD" \
    -d "$(corpo_camp "$NOVA_ID" contratante marca "Marca desconhecida." "[]" "")" | jq -r .praca_id)"
check "apaga a campanha sem filho (sem resíduo)" "true" \
  "$(curl -s -X DELETE $API/v1/campanhas/$CAMP3_ID -H "$HD" | jq -r .ok)"
# Mesma porta, um andar abaixo: mudar `campanha_id` levaria os dias já
# investidos para outra campanha (e, por ela, para outra praça).
check "PUT não muda a campanha da entrada de tráfego" "CAMPANHA_HAS_CHILDREN" \
  "$(curl -s -X PUT $API/v1/traffic/$TR_ID -H "$J" -H "$HD" \
    -d "{\"campanha_id\":\"$CS1_ID\",\"plataforma\":\"meta\",\"nome_la\":\"BH-Contratante-Teste\",\"publico\":\"Donos de bar, 25–55\",\"geo\":\"Belo Horizonte + 50 km\",\"verba_diaria\":120,\"criativos\":[]}" | jq -r .error.code)"
check "a entrada continua na campanha de origem" "$CAMP_ID" \
  "$(curl -s "$API/v1/traffic?campanha_id=$CAMP_ID" -H "$HD" | jq -r '.[0].campanha_id')"

# Lead vindo do anúncio: é ele que vira "cadastro" e "ativo" nos números.
LEAD_MID=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Bar da Mídia $SUF\",\"city\":\"Belo Horizonte\",\"phone\":\"(31) 97777-1111\",\"decisor\":\"Fulano de Teste\",\"classe\":\"alvo\",\"origem\":\"anúncio\",\"owner_id\":\"$DIEGO_ID\",\"campanha_id\":\"$CAMP_ID\"}")
LEAD_MID_ID=$(echo "$LEAD_MID" | jq -r .id)
CAMP_NUM=$(curl -s "$API/v1/campanhas?praca_id=$PRACA_SEED" -H "$HD" | jq --arg i "$CAMP_ID" '[.[] | select(.id==$i)][0]')
check "o dia puxado da API entra nos números da campanha" "120" "$(echo "$CAMP_NUM" | jq '.metrics.investido')"
check "o lead do anúncio conta na campanha, ainda sem cadastro" "1 0 0" \
  "$(echo "$CAMP_NUM" | jq -r '"\(.metrics.leads) \(.metrics.cadastros) \(.metrics.ativos)"')"

# --- duplicar para outra praça ---
UBE=$(curl -s -X POST $API/v1/pracas -H "$J" -H "$HD" \
  -d "{\"name\":\"Uberlândia $SUF\",\"city\":\"Uberlândia · MG\",\"start_date\":\"2026-09-01\",\"end_date\":\"2026-12-08\"}")
UBE_ID=$(echo "$UBE" | jq -r .id)
PROVA_UBE=$(curl -s -X POST $API/v1/proofs -H "$J" -H "$HD" \
  -d "{\"praca_id\":\"$UBE_ID\",\"kind\":\"caso\",\"title\":\"Caso escrito: 3 PDVs em Uberlândia\"}" | jq -r .id)
DUP=$(curl -s -X POST $API/v1/campanhas/$CAMP_ID/duplicate -H "$J" -H "$HD" -d "{\"praca_id\":\"$UBE_ID\"}")
DUP_ID=$(echo "$DUP" | jq -r .id)
check "a cópia ganha o nome da praça de destino" "UBE-Contratante-Cadastro-$MESANO" "$(echo "$DUP" | jq -r .name)"
check "a cópia volta para o rascunho e zera o gasto" "rascunho 0" "$(echo "$DUP" | jq -r '"\(.status) \(.gasto)"')"
check "a cópia não leva a justificativa de portão da origem" "null" "$(echo "$DUP" | jq -r '.gate_justification')"
check "a cópia troca a prova pela da praça de destino" "$PROVA_UBE" "$(echo "$DUP" | jq -r '.provas[0]')"
check "a cópia é outra campanha" "true" "$(echo "$DUP" | jq --arg i "$CAMP_ID" '.id != $i')"
check "a cópia não leva o tráfego (verba é da praça de origem)" "0" \
  "$(curl -s "$API/v1/traffic?campanha_id=$DUP_ID" -H "$HD" | jq 'length')"
DUP_CR=$(curl -s "$API/v1/creatives?campanha_id=$DUP_ID" -H "$HD")
check "a cópia leva os 2 criativos como 'a fazer'" "2 0" \
  "$(echo "$DUP_CR" | jq -r '"\(length) \([.[] | select(.status != "a_fazer")] | length)"')"
check "a cópia dos criativos vem sem arquivo, comentário nem aprovação" "true" \
  "$(echo "$DUP_CR" | jq 'all(.file_url == "" and (.comments | length) == 0 and .approved_at == null)')"
check "duplicar para praça que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/campanhas/$CAMP_ID/duplicate -H "$J" -H "$HD" -d "{\"praca_id\":\"$BEEF\"}" | jq -r .error.code)"

# --- limpeza da mídia de teste ---
check "apaga o segundo criativo" "true" "$(curl -s -X DELETE $API/v1/creatives/$CR2_ID -H "$HD" | jq -r .ok)"
check "apagar o criativo o tira da entrada de tráfego (sem id órfão)" "1" \
  "$(curl -s "$API/v1/traffic?campanha_id=$CAMP_ID" -H "$HD" | jq '.[0].criativos | length')"
check "apaga a entrada de tráfego" "true" "$(curl -s -X DELETE $API/v1/traffic/$TR_ID -H "$HD" | jq -r .ok)"
check "apaga a campanha de teste" "true" "$(curl -s -X DELETE $API/v1/campanhas/$CAMP_ID -H "$HD" | jq -r .ok)"
check "os criativos foram junto com a campanha (cascata)" "NOT_FOUND" \
  "$(curl -s "$API/v1/creatives?campanha_id=$CAMP_ID" -H "$HD" | jq -r .error.code)"
check "apagar a campanha solta o lead em vez de apagá-lo" "null" \
  "$(curl -s $API/v1/leads/$LEAD_MID_ID -H "$HD" | jq -r '.campanha_id')"
check "apaga o lead do anúncio (sem resíduo)" "true" "$(curl -s -X DELETE $API/v1/leads/$LEAD_MID_ID -H "$HD" | jq -r .ok)"
check "apaga a praça de Uberlândia (leva a cópia)" "true" "$(curl -s -X DELETE $API/v1/pracas/$UBE_ID -H "$HD" | jq -r .ok)"
check "a cópia foi com a praça (cascata)" "NOT_FOUND" \
  "$(curl -s "$API/v1/traffic?campanha_id=$DUP_ID" -H "$HD" | jq -r .error.code)"
check "praça do seed voltou às 2 campanhas (sem resíduo)" "2" \
  "$(curl -s "$API/v1/campanhas?praca_id=$PRACA_SEED" -H "$HD" | jq 'length')"
check "as 13 provas do seed continuam lá" "13" \
  "$(curl -s "$API/v1/proofs?praca_id=$PRACA_SEED" -H "$HD" | jq 'length')"
check "funil da praça seed voltou aos 25 leads (mídia sem resíduo)" "25" \
  "$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&archived=true" -H "$HD" | jq 'length')"

echo "── Limpeza da praça de teste ──"
check "admin apaga a praça de teste" "true" "$(curl -s -X DELETE $API/v1/pracas/$NOVA_ID -H "$HD" | jq -r .ok)"
check "praça de teste sumiu" "NOT_FOUND" "$(curl -s $API/v1/pracas/$NOVA_ID -H "$HD" | jq -r .error.code)"
check "ações da praça foram junto (cascata)" "NOT_FOUND" \
  "$(curl -s $API/v1/actions/$S1A2 -H "$HD" | jq -r .error.code)"
check "praça ativa do Diego restaurada (sem resíduo)" "$PRACA_SEED" \
  "$(curl -s -X PATCH $API/v1/users/me -H "$J" -H "$HD" -d "{\"active_praca_id\":\"$PRACA_SEED\"}" | jq -r .active_praca_id)"

echo "── Indicadores ──"
# Roda DEPOIS da limpeza da praça de teste: as visões Praça e Pessoa contam
# praças e contas ativas, e a praça do smoke sujaria as duas.
# Janelas esperadas: 1º do mês, segunda desta semana e 90 dias contando hoje.
MES1=$(TZ=America/Sao_Paulo date +%Y-%m-01)
SEG=$(TZ=America/Sao_Paulo date -d "$HOJE -$(($(TZ=America/Sao_Paulo date -d "$HOJE" +%u) - 1)) days" +%F)
D90=$(TZ=America/Sao_Paulo date -d "$HOJE -89 days" +%F)
# O valor de vários indicadores depende do período, e no dia 1º de cada mês a
# janela "este mês" tem UM dia — os dias de mídia e os toques do seed cairiam
# fora. Por isso os números vão em `d90`, que abraça o seed inteiro em qualquer
# dia do mês; `mes` fica para o que não depende de data (etapa do funil).
IND=$(curl -s "$API/v1/indicators?scope=empresa&period=d90" -H "$HD")
check "as 12 leituras do catálogo vêm na visão Empresa" "12" "$(echo "$IND" | jq '.readings | length')"
check "o período padrão é o mês corrente" "$MES1 $HOJE este mês" \
  "$(curl -s "$API/v1/indicators" -H "$HD" | jq -r '.range | "\(.from) \(.to) \(.label)"')"
check "clientes ativos = os 3 leads do seed na etapa 7" "3" \
  "$(echo "$IND" | jq '[.readings[] | select(.key=="clientes_ativos")][0].value')"
# 8 leads na etapa ≥ 6 (3 na 6, 3 na 7, 2 perdidos), 5 deles na etapa ≥ 7.
check "recontratação = 5 de 8 leads que rodaram a primeira vaga" "62.5" \
  "$(echo "$IND" | jq '[.readings[] | select(.key=="recontratacao")][0].value')"
check "preenchimento médio do seed abaixo do teto de 4 h" "2.73 ok" \
  "$(echo "$IND" | jq -r '[.readings[] | select(.key=="tempo_preencher")][0] | "\((.value * 100 | round) / 100) \(.sem)"')"
check "custo por cliente ativado = 720 de mídia / 3 ativos" "240 bad" \
  "$(echo "$IND" | jq -r '[.readings[] | select(.key=="custo_cliente")][0] | "\(.value) \(.sem)"')"
check "os 25 leads do seed entraram nos últimos 90 dias" "25" \
  "$(echo "$IND" | jq '[.readings[] | select(.key=="leads_novos")][0].value')"
check "perda mensal = 2 perdidos sobre a base de 13" "15.38" \
  "$(echo "$IND" | jq '[.readings[] | select(.key=="perda_mensal")][0].value | (. * 100 | round) / 100')"
check "passagem por etapa = 9 cadastrados de 21 tocados" "42.86" \
  "$(echo "$IND" | jq '[.readings[] | select(.key=="passagem_etapa")][0].value | (. * 100 | round) / 100')"
check "nenhuma ação do roteiro do seed está concluída" "0 bad" \
  "$(echo "$IND" | jq -r '[.readings[] | select(.key=="playbook")][0] | "\(.value) \(.sem)"')"
check "freelancers sem lançamento cai no resultado 22 da etapa 2" "22" \
  "$(echo "$IND" | jq '[.readings[] | select(.key=="freelancers")][0].value')"
check "indicador à mão sem lançamento é número velho" "null true none" \
  "$(echo "$IND" | jq -r '[.readings[] | select(.key=="falta")][0] | "\(.value) \(.stale) \(.sem)"')"
check "indicador calculado nunca é número velho" "false" \
  "$(echo "$IND" | jq '[.readings[] | select(.key=="clientes_ativos")][0].stale')"
check "o dono do indicador vira id de conta" "$DIEGO_ID" \
  "$(echo "$IND" | jq -r '[.readings[] | select(.key=="playbook")][0].owner_id')"
check "6 indicadores são número grande da Empresa" "6" "$(echo "$IND" | jq '[.readings[] | select(.hero)] | length')"
check "a leitura traz meta, unidade, direção, frequência e fonte" "3 % lte semanal manual aplicativo Freela" \
  "$(echo "$IND" | jq -r '[.readings[] | select(.key=="falta")][0] | "\(.meta) \(.unit) \(.dir) \(.freq) \(.source) \(.origem)"')"

check "período hoje é o mesmo dia nas duas pontas" "$HOJE $HOJE" \
  "$(curl -s "$API/v1/indicators?period=hoje" -H "$HD" | jq -r '.range | "\(.from) \(.to)"')"
check "período semana começa na segunda" "$SEG esta semana" \
  "$(curl -s "$API/v1/indicators?period=semana" -H "$HD" | jq -r '.range | "\(.from) \(.label)"')"
check "período 90 dias conta hoje" "$D90 últimos 90 dias" \
  "$(curl -s "$API/v1/indicators?period=d90" -H "$HD" | jq -r '.range | "\(.from) \(.label)"')"
check "período livre usa as datas dadas" "2026-08-01 2026-08-31 período livre" \
  "$(curl -s "$API/v1/indicators?period=livre&from=2026-08-01&to=2026-08-31" -H "$HD" | jq -r '.range | "\(.from) \(.to) \(.label)"')"
check "período livre sem datas é barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/indicators?period=livre" -H "$HD" | jq -r .error.code)"
check "período livre de trás para frente é barrado" "O início do período não pode ser depois do fim." \
  "$(curl -s "$API/v1/indicators?period=livre&from=$HOJE&to=$MES1" -H "$HD" | jq -r .error.message)"
check "período fora da lista é barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/indicators?period=decada" -H "$HD" | jq -r .error.code)"
check "escopo praça sem praca_id é barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/indicators?scope=praca" -H "$HD" | jq -r .error.code)"
check "escopo fora da lista é barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/indicators?scope=galaxia" -H "$HD" | jq -r .error.code)"
check "praça que não existe no escopo praça = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s "$API/v1/indicators?scope=praca&praca_id=$BEEF" -H "$HD" | jq -r .error.code)"
check "sem token não há indicador" "UNAUTHORIZED" "$(curl -s $API/v1/indicators | jq -r .error.code)"

echo "── Indicadores: visão Empresa ──"
EMP=$(curl -s "$API/v1/indicators/empresa?period=d90" -H "$HD")
check "a visão Empresa traz 6 números grandes, 3 marcos e 12 meses" "6 3 12" \
  "$(echo "$EMP" | jq -r '"\(.heroes | length) \(.milestones | length) \(.months | length)"')"
check "os marcos são dez/26, fev/27 e ago/27" "dez/26 fev/27 ago/27" \
  "$(echo "$EMP" | jq -r '[.milestones[].label] | join(" ")')"
check "o marco traz o valor de hoje e quanto do caminho já foi" "clientes ativos 3 0" \
  "$(echo "$EMP" | jq -r '.milestones[0].targets[0] | "\(.name) \(.value) \(.pct | floor)"')"
check "profissionais responsivos sai do indicador à mão (22 da etapa 2)" "22" \
  "$(echo "$EMP" | jq '[.milestones[].targets[] | select(.key=="freelancers")][0].value')"
check "o último mês do gráfico é o mês de hoje, com os 3 ativos" "3" "$(echo "$EMP" | jq '.months[-1].value')"
check "a meta do mês cresce mês a mês e não passa de 500" "true" \
  "$(echo "$EMP" | jq '([.months[].meta] == ([.months[].meta] | sort)) and .months[-1].meta <= 500 and .months[-1].meta > 0')"
check "o que mudou vem em dois lados, no máximo 3 de cada" "true" \
  "$(echo "$EMP" | jq '(.changed.good | length) <= 3 and (.changed.bad | length) <= 3')"

echo "── Indicadores: praça, pessoa e canal ──"
PR_ROWS=$(curl -s "$API/v1/indicators/pracas?period=d90" -H "$HD")
check "uma linha por praça (só a do seed sobrou)" "1" "$(echo "$PR_ROWS" | jq 'length')"
check "a linha da praça traz etapa, ativos, freelancers e atrasadas" "Belo Horizonte + Contagem 1 3 22 true" \
  "$(echo "$PR_ROWS" | jq -r '.[0] | "\(.praca.name) \(.step_atual) \(.ativos) \(.freelancers) \(.atrasadas > 0)"')"
check "a praça sem lançamento de falta mostra nulo, não zero" "null" "$(echo "$PR_ROWS" | jq '.[0].falta')"
PES_ROWS=$(curl -s "$API/v1/indicators/pessoas?period=d90" -H "$HD")
check "uma linha por pessoa ativa (Diego, Daniel e Mkt)" "3 Diego Daniel Mkt externo" \
  "$(echo "$PES_ROWS" | jq -r '"\(length) \([.[].name] | join(" "))"')"
# Daniel: 10 leads tocados (só msg_out e visita contam — resposta do lead não),
# 5 na etapa ≥ 6 e 10 vagas rodadas. O seed não tem evento de mudança de etapa,
# então "avançaram" é 0 de propósito.
check "a linha da pessoa conta toque, fechamento e vaga do período" "10 0 5 10" \
  "$(echo "$PES_ROWS" | jq -r --arg i "$DANIEL_ID" '[.[] | select(.id==$i)][0] | "\(.leads_tocados) \(.leads_avancados) \(.fechados) \(.vagas)"')"
check "a agência não toca lead nenhum" "0 0 0" \
  "$(echo "$PES_ROWS" | jq -r '.[2] | "\(.leads_tocados) \(.fechados) \(.vagas)"')"
CAN=$(curl -s "$API/v1/indicators/canais?praca_id=$PRACA_SEED&period=d90" -H "$HD")
check "os 6 canais aparecem sempre, mesmo sem lead" "6 prospeccao trafego indicacao organico evento rede" \
  "$(echo "$CAN" | jq -r '"\(length) \([.[].id] | join(" "))"')"
check "importação e prospecção caem no mesmo canal" "13 1" \
  "$(echo "$CAN" | jq -r '[.[] | select(.id=="prospeccao")][0] | "\(.leads) \(.ativos)"')"
check "só o tráfego pago tem custo por cliente (720 / 1 ativo)" "720 null null" \
  "$(echo "$CAN" | jq -r '"\([.[] | select(.id=="trafego")][0].custo) \([.[] | select(.id=="indicacao")][0].custo) \([.[] | select(.id=="organico")][0].custo)"')"
check "canal sem lead nenhum não inventa conversão" "0 null null" \
  "$(echo "$CAN" | jq -r '[.[] | select(.id=="evento")][0] | "\(.leads) \(.conv) \(.tempo_primeira_vaga)"')"
check "a visão canal exige praca_id" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/indicators/canais" -H "$HD" | jq -r .error.code)"
check "praca_id malformado na visão canal é barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/indicators/canais?praca_id=nao-e-uuid" -H "$HD" | jq -r .error.code)"
check "praça que não existe na visão canal = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s "$API/v1/indicators/canais?praca_id=$BEEF" -H "$HD" | jq -r .error.code)"

echo "── Indicadores: lançamento à mão ──"
LANC="\"praca_id\":\"$PRACA_SEED\",\"date\":\"$HOJE\""
LE_FALTA='[.readings[] | select(.key=="falta")][0]'
check "lançar falta 2,5 hoje" "$PRACA_SEED falta $HOJE 2.5" \
  "$(curl -s -X POST $API/v1/indicators/falta/entries -H "$J" -H "$HD" -d "{$LANC,\"value\":2.5}" | jq -r '"\(.praca_id) \(.key) \(.date) \(.value)"')"
LIDO=$(curl -s "$API/v1/indicators?scope=praca&praca_id=$PRACA_SEED&period=mes" -H "$HD" | jq "$LE_FALTA")
check "a leitura da praça passa a mostrar 2,5, verde e fresco" "2.5 ok false $HOJE" \
  "$(echo "$LIDO" | jq -r '"\(.value) \(.sem) \(.stale) \(.last_at)"')"
check "o lançamento entra no histórico do indicador" "1 $HOJE 2.5" \
  "$(echo "$LIDO" | jq -r '"\(.history | length) \(.history[0].date) \(.history[0].value)"')"
check "na Empresa o lançamento da única praça é o valor da empresa" "2.5 false" \
  "$(curl -s "$API/v1/indicators?scope=empresa&period=mes" -H "$HD" | jq -r "$LE_FALTA"' | "\(.value) \(.stale)"')"
check "a visão Praça mostra a falta lançada" "2.5" \
  "$(curl -s "$API/v1/indicators/pracas?period=mes" -H "$HD" | jq '.[0].falta')"
curl -s -X POST $API/v1/indicators/falta/entries -H "$J" -H "$HD" -d "{$LANC,\"value\":9}" > /dev/null
check "lançar o mesmo dia duas vezes corrige a linha, sem criar outra" "9 1 bad" \
  "$(curl -s "$API/v1/indicators?scope=praca&praca_id=$PRACA_SEED&period=mes" -H "$HD" \
    | jq -r "$LE_FALTA"' | "\(.value) \(.history | length) \(.sem)"')"
check "indicador fora do catálogo = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/indicators/inventado/entries -H "$J" -H "$HD" -d "{$LANC,\"value\":1}" | jq -r .error.code)"
check "lançar em praça que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/indicators/falta/entries -H "$J" -H "$HD" -d "{\"praca_id\":\"$BEEF\",\"date\":\"$HOJE\",\"value\":1}" | jq -r .error.code)"
check "data que não existe no calendário é barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/indicators/falta/entries -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"date\":\"2026-02-31\",\"value\":1}" | jq -r .error.code)"
check "valor nulo é barrado (não vira 500)" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/indicators/falta/entries -H "$J" -H "$HD" -d "{$LANC,\"value\":null}" | jq -r .error.code)"
check "valor negativo é barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/indicators/falta/entries -H "$J" -H "$HD" -d "{$LANC,\"value\":-1}" | jq -r .error.code)"
check "campo fora do DTO é barrado (whitelist)" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/indicators/falta/entries -H "$J" -H "$HD" -d "{$LANC,\"value\":1,\"nome\":\"x\"}" | jq -r .error.code)"
check "apagar indicador fora do catálogo = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X DELETE "$API/v1/indicators/inventado/entries?praca_id=$PRACA_SEED&date=$HOJE" -H "$HD" | jq -r .error.code)"
# Sem resíduo: apaga o lançamento do smoke e confere que o indicador voltou a nulo.
check "apaga o lançamento do smoke" "true" \
  "$(curl -s -X DELETE "$API/v1/indicators/falta/entries?praca_id=$PRACA_SEED&date=$HOJE" -H "$HD" | jq -r .ok)"
check "apagar dia sem lançamento também responde ok" "true" \
  "$(curl -s -X DELETE "$API/v1/indicators/falta/entries?praca_id=$PRACA_SEED&date=$HOJE" -H "$HD" | jq -r .ok)"
check "a falta voltou a não ter número (sem resíduo)" "null true 0" \
  "$(curl -s "$API/v1/indicators?scope=praca&praca_id=$PRACA_SEED&period=mes" -H "$HD" \
    | jq -r "$LE_FALTA"' | "\(.value) \(.stale) \(.history | length)"')"

echo "── Notificações ──"
check "praca_id é obrigatório" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/notifications" -H "$HD" | jq -r .error.code)"
check "praca_id malformado é barrado" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/notifications?praca_id=nao-e-uuid" -H "$HD" | jq -r .error.code)"
check "praça que não existe = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s "$API/v1/notifications?praca_id=$BEEF" -H "$HD" | jq -r .error.code)"
check "sem token = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s "$API/v1/notifications?praca_id=$PRACA_SEED" | jq -r .error.code)"

NOTIFS=$(curl -s "$API/v1/notifications?praca_id=$PRACA_SEED" -H "$HD")
check "cada aviso tem id, text e tone (warn ou info)" "true" \
  "$(echo "$NOTIFS" | jq '(length > 0) and ([.[] | has("id","text","tone")] | all) and ([.[].tone] | all(. == "warn" or . == "info"))')"
LOCK3="$PRACA_SEED:lock-3"
check "praça seed tem a etapa 3 travada (step 2 = 22 < 40)" "true" \
  "$(echo "$NOTIFS" | jq --arg id "$LOCK3" '[.[] | select(.id == $id)] | length == 1')"
check "o aviso de etapa travada é tone warn, com o motivo do portão" "warn true" \
  "$(echo "$NOTIFS" | jq -r --arg id "$LOCK3" '[.[] | select(.id == $id)][0] | "\(.tone) \(.text | startswith("Etapa 3 travada — Falta bater o Portão"))"')"

check "ids vazios são barrados" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/notifications/dismiss -H "$J" -H "$HD" -d '{"ids":[]}' | jq -r .error.code)"
IDS_101=$(jq -n -c '[range(1;102)] | map("x\(.)")')
check "mais de 100 ids são barrados" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/notifications/dismiss -H "$J" -H "$HD" -d "{\"ids\":$IDS_101}" | jq -r .error.code)"

check "dispensa lock-3 pro Diego" "true" \
  "$(curl -s -X POST $API/v1/notifications/dismiss -H "$J" -H "$HD" -d "{\"ids\":[\"$LOCK3\"]}" | jq -r .ok)"
check "dispensar de novo é idempotente" "true" \
  "$(curl -s -X POST $API/v1/notifications/dismiss -H "$J" -H "$HD" -d "{\"ids\":[\"$LOCK3\"]}" | jq -r .ok)"
check "lock-3 dispensado some da lista do Diego" "0" \
  "$(curl -s "$API/v1/notifications?praca_id=$PRACA_SEED" -H "$HD" | jq --arg id "$LOCK3" '[.[] | select(.id == $id)] | length')"
check "dispensa é POR USUÁRIO — Daniel ainda vê lock-3" "1" \
  "$(curl -s "$API/v1/notifications?praca_id=$PRACA_SEED" -H "$HN" | jq --arg id "$LOCK3" '[.[] | select(.id == $id)] | length')"

# Sem resíduo: desfaz a dispensa e confere que a tabela voltou ao estado de antes.
check "undismiss devolve lock-3 pro Diego" "true" \
  "$(curl -s -X POST $API/v1/notifications/undismiss -H "$J" -H "$HD" -d "{\"ids\":[\"$LOCK3\"]}" | jq -r .ok)"
check "lock-3 volta a aparecer pro Diego (sem resíduo)" "1" \
  "$(curl -s "$API/v1/notifications?praca_id=$PRACA_SEED" -H "$HD" | jq --arg id "$LOCK3" '[.[] | select(.id == $id)] | length')"
check "undismiss de id nunca dispensado também responde ok" "true" \
  "$(curl -s -X POST $API/v1/notifications/undismiss -H "$J" -H "$HD" -d '{"ids":["nunca-dispensado"]}' | jq -r .ok)"

echo "── Campo: cadastro pela equipe ──"
# CPF válido e novo a cada rodada (é único): 9 dígitos do carimbo + os 2 verificadores.
cpf_valido(){ node -e '
const b=process.argv[1].slice(-9).padStart(9,"1").split("").map(Number);
const dv=(a)=>{const s=a.reduce((t,d,i)=>t+d*(a.length+1-i),0);const r=(s*10)%11;return r===10?0:r;};
const d1=dv(b),d2=dv([...b,d1]);console.log([...b,d1,d2].join(""));' "$1"; }
uuid(){ cat /proc/sys/kernel/random/uuid; }

EMAIL_CAMPO="campo$SUF@praca.local"
CPF_CAMPO=$(cpf_valido "$SUF")
CPF_ERRADO="${CPF_CAMPO:0:10}$(( (${CPF_CAMPO:10:1} + 1) % 10 ))"
CORPO_CAMPO="{\"name\":\"Consultor $SUF\",\"email\":\"$EMAIL_CAMPO\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$CPF_CAMPO\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$CPF_CAMPO\"}"

check "daniel (não admin) não cria consultor" "FORBIDDEN" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HN" -d "$CORPO_CAMPO" | jq -r .error.code)"
check "CPF com dígito errado = INVALID_CPF" "INVALID_CPF" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$(echo "$CORPO_CAMPO" | jq -c --arg c "$CPF_ERRADO" '.cpf=$c')" | jq -r .error.code)"
check "praça inexistente = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$(echo "$CORPO_CAMPO" | jq -c '.praca_id="00000000-0000-4000-8000-00000000beef"')" | jq -r .error.code)"

CRIA_CAMPO=$(curl -s -o /tmp/praca-smoke-campo.json -w '%{http_code}' -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$CORPO_CAMPO")
check "diego cria consultor = 201" "201" "$CRIA_CAMPO"
CONS_ID=$(jq -r .consultant.id /tmp/praca-smoke-campo.json)
SENHA_TEMP=$(jq -r .temp_password /tmp/praca-smoke-campo.json)
check "senha provisória de 10 caracteres" "10" "${#SENHA_TEMP}"
check "consultor não vaza password_hash" "false" "$(jq '.consultant | has("password_hash")' /tmp/praca-smoke-campo.json)"
check "sem Freela configurado: código pendente com o motivo" "true" \
  "$(jq '.consultant.freela_code == null and (.consultant.freela_sync_error | startswith("Conexão com o Freela não configurada"))' /tmp/praca-smoke-campo.json)"
check "e-mail repetido = EMAIL_IN_USE" "EMAIL_IN_USE" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$CORPO_CAMPO" | jq -r .error.code)"
check "CPF repetido = CPF_IN_USE" "CPF_IN_USE" \
  "$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "$(echo "$CORPO_CAMPO" | jq -c --arg e "outro$SUF@praca.local" '.email=$e')" | jq -r .error.code)"
check "consultor com id malformado = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/consultores/nao-e-uuid -H "$HD" | jq -r .error.code)"
check "lista (qualquer pessoa da equipe): ainda não iniciou" "nao_iniciou" \
  "$(curl -s $API/v1/consultores -H "$HN" | jq -r --arg i "$CONS_ID" '.[] | select(.id==$i) | .today.status')"

echo "── Campo: sessão do consultor ──"
check "senha errada = INVALID_CREDENTIALS" "INVALID_CREDENTIALS" \
  "$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL_CAMPO\",\"password\":\"errada123\"}" | jq -r .error.code)"
LOGIN_CAMPO=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL_CAMPO\",\"password\":\"$SENHA_TEMP\"}")
HC0="Authorization: Bearer $(echo "$LOGIN_CAMPO" | jq -r .access_token)"
check "login com a senha provisória pede a troca" "true" "$(echo "$LOGIN_CAMPO" | jq .must_change_password)"
check "antes da troca, /today = PASSWORD_CHANGE_REQUIRED" "PASSWORD_CHANGE_REQUIRED" \
  "$(curl -s $API/v1/campo/today -H "$HC0" | jq -r .error.code)"
check "/me liberado antes da troca" "$CONS_ID" "$(curl -s $API/v1/campo/me -H "$HC0" | jq -r .consultant.id)"
check "token da equipe em /v1/campo/me = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s $API/v1/campo/me -H "$HD" | jq -r .error.code)"
check "token do consultor em /v1/users = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s $API/v1/users -H "$HC0" | jq -r .error.code)"
check "token do consultor em /v1/consultores = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s $API/v1/consultores -H "$HC0" | jq -r .error.code)"
check "senha atual errada = WRONG_PASSWORD (400, não derruba a sessão)" "WRONG_PASSWORD" \
  "$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "$HC0" -d '{"current_password":"errada123","new_password":"campoSenha123"}' | jq -r .error.code)"
TROCA=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "$HC0" \
  -d "{\"current_password\":\"$SENHA_TEMP\",\"new_password\":\"campoSenha123\"}")
HC="Authorization: Bearer $(echo "$TROCA" | jq -r .access_token)"
check "troca de senha libera o acesso" "false" "$(echo "$TROCA" | jq .must_change_password)"
check "token de antes da troca = UNAUTHORIZED" "UNAUTHORIZED" "$(curl -s $API/v1/campo/me -H "$HC0" | jq -r .error.code)"
ME_CAMPO=$(curl -s $API/v1/campo/me -H "$HC")
check "/me: praça do consultor" "Belo Horizonte + Contagem" "$(echo "$ME_CAMPO" | jq -r .consultant.praca_name)"
check "/me: sem código ainda, link do QR nulo" "null" "$(echo "$ME_CAMPO" | jq -r .consultant.signup_url)"
check "/me: os 4 canais iniciais" "4" "$(echo "$ME_CAMPO" | jq '.channels | length')"

echo "── Campo: jornada ──"
AGORA=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
FUTURO=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%S.000Z)
LAT=-19.9245; LNG=-43.9352; LONGE_LAT=-19.9220
J1=$(uuid); P1=$(uuid); P2=$(uuid); V1=$(uuid); V2=$(uuid)
POS_CAMPO="\"at\":\"$AGORA\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"
# JPEG mínimo: a API confere os bytes mágicos (FF D8 FF), não o nome do arquivo.
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada.jpg
echo "nao e imagem" > /tmp/praca-smoke-campo.txt
checkin(){ # $1 client_id, $2 lat, $3 campo do lugar (lead_id=… ou new_place=…), $4 arquivo
  curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$1" -F "at=$AGORA" -F "lat=$2" -F "lng=$LNG" \
    -F "accuracy=12" --form-string "$3" ${4:+-F "photo=@$4;type=image/jpeg"}
}
NOVO_LUGAR="new_place={\"name\":\"Campo $SUF\",\"address\":\"Rua de Teste, 10\"}"

check "check-in sem jornada = NO_OPEN_JOURNEY" "NO_OPEN_JOURNEY" \
  "$(checkin "$V1" "$LAT" "$NOVO_LUGAR" /tmp/praca-smoke-fachada.jpg | jq -r .error.code)"
check "places?lat&lng sem jornada aberta = NO_OPEN_JOURNEY" "NO_OPEN_JOURNEY" \
  "$(curl -s "$API/v1/campo/places?lat=$LAT&lng=$LNG" -H "$HC" | jq -r .error.code)"
check "places/similar sem jornada aberta = NO_OPEN_JOURNEY" "NO_OPEN_JOURNEY" \
  "$(curl -s "$API/v1/campo/places/similar?name=xx&lat=$LAT&lng=$LNG" -H "$HC" | jq -r .error.code)"
check "places?q sem jornada aberta = 200 (não exige posição)" "true" \
  "$(curl -s "$API/v1/campo/places?q=mercado" -H "$HC" | jq 'type == "array"')"
INICIO=$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$J1\",$POS_CAMPO}")
JORNADA_ID=$(echo "$INICIO" | jq -r .id)
check "jornada aberta com o dia de Brasília" "$HOJE" "$(echo "$INICIO" | jq -r .day)"
check "reenvio do início devolve a mesma jornada" "$JORNADA_ID" \
  "$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$J1\",$POS_CAMPO}" | jq -r .id)"
check "outra jornada com uma aberta = JOURNEY_ALREADY_OPEN" "JOURNEY_ALREADY_OPEN" \
  "$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",$POS_CAMPO}" | jq -r .error.code)"
PONTOS="{\"points\":[{\"client_id\":\"$P1\",$POS_CAMPO},{\"client_id\":\"$P2\",\"at\":\"$FUTURO\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":20}]}"
check "lote de pontos aceito" "2" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/points -H "$J" -H "$HC" -d "$PONTOS" | jq .accepted)"
check "reenvio do lote não duplica" "2" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/points -H "$J" -H "$HC" -d "$PONTOS" | jq .duplicates)"
check "lote acima de 50 pontos = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/points -H "$J" -H "$HC" \
    -d "$(jq -nc --arg at "$AGORA" '{points:[range(51)|{client_id:"00000000-0000-4000-8000-000000000001",at:$at,lat:-19.9,lng:-43.9,accuracy:10}]}')" | jq -r .error.code)"

echo "── Campo: visitas ──"
check "busca por nome acha o lead do seed" "Bar do Mercado" \
  "$(curl -s "$API/v1/campo/places?q=mercado" -H "$HC" | jq -r '.[0].name')"
check "places sem q nem posição = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/campo/places" -H "$HC" | jq -r .error.code)"
check "places?lat&lng com jornada aberta (sem foto ainda) = 200 lista" "true" \
  "$(curl -s "$API/v1/campo/places?lat=$LAT&lng=$LNG" -H "$HC" | jq 'type == "array"')"
check "arquivo que não é imagem (mesmo dizendo image/jpeg) = INVALID_FILE_TYPE" "INVALID_FILE_TYPE" \
  "$(checkin "$V1" "$LAT" "$NOVO_LUGAR" /tmp/praca-smoke-campo.txt | jq -r .error.code)"
check "check-in sem foto = FILE_REQUIRED" "FILE_REQUIRED" \
  "$(checkin "$V1" "$LAT" "$NOVO_LUGAR" | jq -r .error.code)"
VISITA_C=$(checkin "$V1" "$LAT" "$NOVO_LUGAR" /tmp/praca-smoke-fachada.jpg)
VISITA_ID=$(echo "$VISITA_C" | jq -r .id)
LEAD_CAMPO=$(echo "$VISITA_C" | jq -r .lead_id)
check "check-in abre a visita" "null" "$(echo "$VISITA_C" | jq -r .checkout_at)"
check "lead novo do campo: origem e etapa" "visita de campo|1" \
  "$(curl -s $API/v1/leads/$LEAD_CAMPO -H "$HD" | jq -r '"\(.origem)|\(.stage)"')"
check "reenvio do check-in devolve a mesma visita" "$VISITA_ID" \
  "$(checkin "$V1" "$LAT" "$NOVO_LUGAR" /tmp/praca-smoke-fachada.jpg | jq -r .id)"
check "segunda visita com uma aberta = VISIT_ALREADY_OPEN" "VISIT_ALREADY_OPEN" \
  "$(checkin "$V2" "$LAT" "lead_id=$LEAD_CAMPO" /tmp/praca-smoke-fachada.jpg | jq -r .error.code)"
check "parecido a até 100 m acha o lead recém-criado" "$LEAD_CAMPO" \
  "$(curl -s "$API/v1/campo/places/similar?name=Campo%20$SUF&lat=$LAT&lng=$LNG" -H "$HC" | jq -r '.[0].id')"
check "perto de mim acha o lead a 0 m" "0" \
  "$(curl -s "$API/v1/campo/places?lat=$LAT&lng=$LNG" -H "$HC" | jq --arg i "$LEAD_CAMPO" '.[] | select(.id==$i) | .distance_m')"
check "encerrar a jornada com visita aberta = VISIT_OPEN" "VISIT_OPEN" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HC" -d "{$POS_CAMPO}" | jq -r .error.code)"
check "checkout com questionário vazio = ANSWERS_INCOMPLETE (422)" "422|ANSWERS_INCOMPLETE" \
  "$(curl -s -o /tmp/praca-smoke-campo.json -w '%{http_code}' -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS_CAMPO}")|$(jq -r .error.code /tmp/praca-smoke-campo.json)"
check "rascunho parcial salvo pelo client_id: faltam 6 itens" "6" \
  "$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d '{"interlocutor_name":"João","interlocutor_role":"dono"}' | jq '.missing | length')"
check "cargo fora da lista = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d '{"interlocutor_role":"chefe"}' | jq -r .error.code)"
RESPOSTAS_C="{\"freela_status\":\"cadastrou_qr\",\"interest\":\"alto\",\"open_vagas\":2,\"vaga_roles\":[\"Garçom\"],\"freelas_per_week\":4,\"channels\":[\"Grupos de WhatsApp\"],\"needs_followup\":true,\"followup_what\":\"Ligar na sexta\",\"followup_date\":\"$HOJE3\"}"
check "questionário completo: nada falta" "0" \
  "$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d "$RESPOSTAS_C" | jq '.missing | length')"
SAIDA=$(curl -s -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS_CAMPO}")
check "checkout feito" "true" "$(echo "$SAIDA" | jq '.checkout_at != null')"
check "reenvio do checkout devolve a mesma hora (nada gravado de novo)" "$(echo "$SAIDA" | jq -r .checkout_at)" \
  "$(curl -s -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS_CAMPO}" | jq -r .checkout_at)"
LEAD_DEPOIS=$(curl -s $API/v1/leads/$LEAD_CAMPO -H "$HD")
check "CRM: lead foi para Conversa aberta" "3" "$(echo "$LEAD_DEPOIS" | jq .stage)"
check "CRM: decisor é quem atendeu" "João|Dono" "$(echo "$LEAD_DEPOIS" | jq -r '"\(.decisor)|\(.decisor_role)"')"
check "CRM: próximo passo é o retorno pedido" "Ligar na sexta|$HOJE3" \
  "$(echo "$LEAD_DEPOIS" | jq -r '"\(.next_step.what)|\(.next_step.date)"')"
check "CRM: UM evento de visita do consultor, com a etapa nova" "1|3" \
  "$(echo "$LEAD_DEPOIS" | jq -r --arg a "Consultor: Consultor $SUF" '[.events[] | select(.kind=="visit" and .author_label==$a)] | "\(length)|\(.[0].stage_to)"')"
check "foto da visita para o consultor" "image/jpeg" \
  "$(curl -s -o /dev/null -w '%{content_type}' $API/v1/campo/visits/$V1/photo -H "$HC")"
check "foto do consultor: Cache-Control privado só no 200" "private, max-age=86400" \
  "$(curl -s -D - -o /dev/null $API/v1/campo/visits/$V1/photo -H "$HC" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
check "foto inexistente (consultor) = 404 sem Cache-Control" "404|" \
  "$(curl -s -D /tmp/praca-smoke-h.txt -o /dev/null -w '%{http_code}' $API/v1/campo/visits/$(uuid)/photo -H "$HC")|$(tr -d '\r' < /tmp/praca-smoke-h.txt | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
check "foto da visita para a equipe" "image/jpeg" \
  "$(curl -s -o /dev/null -w '%{content_type}' $API/v1/consultores/visits/$VISITA_ID/photo -H "$HN")"
check "foto da equipe: Cache-Control privado só no 200" "private, max-age=86400" \
  "$(curl -s -D - -o /dev/null $API/v1/consultores/visits/$VISITA_ID/photo -H "$HN" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
check "foto inexistente (equipe) = 404 sem Cache-Control" "404|" \
  "$(curl -s -D /tmp/praca-smoke-h.txt -o /dev/null -w '%{http_code}' $API/v1/consultores/visits/$(uuid)/photo -H "$HN")|$(tr -d '\r' < /tmp/praca-smoke-h.txt | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"

VISITA_2=$(checkin "$V2" "$LONGE_LAT" "lead_id=$LEAD_CAMPO" /tmp/praca-smoke-fachada.jpg)
check "check-in a mais de 200 m marca 'longe do local'" "true|278" \
  "$(echo "$VISITA_2" | jq -r '"\(.far_from_place)|\(.distance_m)"')"
curl -s -X PATCH $API/v1/campo/visits/$V2/answers -H "$J" -H "$HC" \
  -d '{"interlocutor_name":"Maria","interlocutor_role":"gerente","freela_status":"ja_usa","interest":"medio","open_vagas":0,"freelas_per_week":0,"channels":["Nenhum"],"needs_followup":false}' > /dev/null
curl -s -X POST $API/v1/campo/visits/$V2/checkout -H "$J" -H "$HC" -d "{$POS_CAMPO}" > /dev/null
check "segunda visita: etapa ≥ 3 se mantém" "3" "$(curl -s $API/v1/leads/$LEAD_CAMPO -H "$HD" | jq .stage)"
FIM=$(curl -s -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HC" -d "{$POS_CAMPO}")
check "jornada encerrada" "true" "$(echo "$FIM" | jq '.ended_at != null')"
check "reenvio do encerrar devolve a mesma jornada (200)" "$JORNADA_ID" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HC" -d "{$POS_CAMPO}" | jq -r .id)"
check "hoje: 2 visitas, 1 'cadastrou agora', jornada fechada" "2|1|null" \
  "$(curl -s $API/v1/campo/today -H "$HC" | jq -r '"\(.counters.visits)|\(.counters.cadastrou_qr)|\(.journey)"')"

echo "── Campo: telas da equipe ──"
DIA_CAMPO=$(curl -s $API/v1/consultores/$CONS_ID/days/$HOJE -H "$HN")
check "dia: pontos de início, trilha, check-ins, checkouts e fim" "checkin:2,checkout:2,end:1,start:1,track:2" \
  "$(echo "$DIA_CAMPO" | jq -r '[.journeys[0].points[].kind] | group_by(.) | map("\(.[0]):\(length)") | join(",")')"
check "dia: o ponto do futuro ficou com a hora ajustada" "1" \
  "$(echo "$DIA_CAMPO" | jq '[.journeys[0].points[] | select(.clock_adjusted)] | length')"
# As duas visitas têm o mesmo `checkin_at` ($AGORA): ordena antes de comparar.
check "dia: 2 visitas, uma longe do local" "2|false,true" \
  "$(echo "$DIA_CAMPO" | jq -r '"\(.visits | length)|\([.visits[].far_from_place] | sort | map(tostring) | join(","))"')"
check "dia inexistente no calendário = VALIDATION_ERROR" "VALIDATION_ERROR" \
  "$(curl -s $API/v1/consultores/$CONS_ID/days/2026-02-31 -H "$HN" | jq -r .error.code)"
check "lista: encerrou, 2 visitas, 1 cadastro declarado" "encerrou|2|1" \
  "$(curl -s $API/v1/consultores -H "$HN" | jq -r --arg i "$CONS_ID" '.[] | select(.id==$i) | "\(.today.status)|\(.today.visits)|\(.today.cadastros)"')"
CANAIS_ORIGINAIS='{"channels":["Nenhum","Grupos de WhatsApp","Indicação de conhecidos","Agência de mão de obra"]}'
check "canais: a lista inicial" "4" "$(curl -s $API/v1/consultores/settings/channels -H "$HN" | jq '.channels | length')"
check "canais: daniel não muda = FORBIDDEN" "FORBIDDEN" \
  "$(curl -s -X PUT $API/v1/consultores/settings/channels -H "$J" -H "$HN" -d '{"channels":["X"]}' | jq -r .error.code)"
check "canais: admin troca aparando e sem repetir" "iFood|Indeed" \
  "$(curl -s -X PUT $API/v1/consultores/settings/channels -H "$J" -H "$HD" -d '{"channels":[" iFood ","ifood","Indeed"]}' | jq -r '.channels | join("|")')"
check "canais: volta à lista inicial (sem resíduo)" "4" \
  "$(curl -s -X PUT $API/v1/consultores/settings/channels -H "$J" -H "$HD" -d "$CANAIS_ORIGINAIS" | jq '.channels | length')"
NOVA_TEMP=$(curl -s -X POST $API/v1/consultores/$CONS_ID/reset-password -H "$HD" | jq -r .temp_password)
check "nova senha provisória" "10" "${#NOVA_TEMP}"
check "nova senha derruba a sessão aberta" "UNAUTHORIZED" "$(curl -s $API/v1/campo/me -H "$HC" | jq -r .error.code)"
check "tentar o código no Freela agora (sem conexão) mantém o motivo" "true" \
  "$(curl -s -X POST $API/v1/consultores/$CONS_ID/freela-sync -H "$HD" | jq '.freela_sync_error | startswith("Conexão com o Freela")')"
check "desativar o consultor" "false" \
  "$(curl -s -X PATCH $API/v1/consultores/$CONS_ID -H "$J" -H "$HD" -d '{"active":false}' | jq .active)"
check "login de consultor desativado = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL_CAMPO\",\"password\":\"$NOVA_TEMP\"}" | jq -r .error.code)"

echo "── Campo: limpeza ──"
check "daniel não apaga consultor = FORBIDDEN" "FORBIDDEN" \
  "$(curl -s -X DELETE $API/v1/consultores/$CONS_ID -H "$HN" | jq -r .error.code)"
check "admin apaga o consultor de teste (jornadas, visitas e fotos juntos)" "true" \
  "$(curl -s -X DELETE $API/v1/consultores/$CONS_ID -H "$HD" | jq .ok)"
check "consultor apagado = NOT_FOUND" "NOT_FOUND" "$(curl -s $API/v1/consultores/$CONS_ID -H "$HD" | jq -r .error.code)"
check "lead criado pela visita apagado" "true" "$(curl -s -X DELETE $API/v1/leads/$LEAD_CAMPO -H "$HD" | jq .ok)"
# Fotos em disco (PHOTO_STORAGE=disk, PHOTOS_DIR=./uploads, relativo a api/).
check "nenhuma foto de teste sobrou no disco" "nao" "$([ -e "uploads/campo/$CONS_ID" ] && echo sim || echo nao)"
rm -f /tmp/praca-smoke-h.txt /tmp/praca-smoke-fachada.jpg /tmp/praca-smoke-campo.txt /tmp/praca-smoke-campo.json

echo "── Freela: conexão desligada ──"
# O `.env` do smoke não tem FREELA_API_URL/EMAIL/PASSWORD: é exatamente o estado
# de quem ainda não ligou a integração. `GET /status` é a ÚNICA rota /v1/freela
# que responde 200 assim — é ela que explica por que as outras não respondem.
ST=$(curl -s $API/v1/freela/status -H "$HD")
check "status responde sem a conexão configurada" "false false" \
  "$(echo "$ST" | jq -r '"\(.configured) \(.reachable)"')"
check "status não inventa conta nem flag do servidor" "null null null" \
  "$(echo "$ST" | jq -r '"\(.admin_email) \(.scheduler_enabled) \(.last_sync_at)"')"
check "status mostra a flag de mensagem por contato" "false" \
  "$(echo "$ST" | jq -r '.per_contact_message')"
check "status sem token = UNAUTHORIZED" "UNAUTHORIZED" "$(curl -s $API/v1/freela/status | jq -r .error.code)"

FR_HTTP=$(curl -s -o /tmp/praca-smoke-fr.json -w '%{http_code}' -X POST $API/v1/freela/campaigns -H "$J" -H "$HD" \
  -d "{\"name\":\"Campanha do smoke\",\"praca_id\":\"$PRACA_SEED\",\"audience\":\"CONTRACTORS_DORMANT_90D\",\"whatsapp_template\":\"Oi {{nome}}!\",\"start_now\":false}")
check "criar campanha sem conexão = 503" "503" "$FR_HTTP"
check "criar campanha sem conexão = FREELA_NOT_CONFIGURED" "FREELA_NOT_CONFIGURED" \
  "$(jq -r .error.code /tmp/praca-smoke-fr.json)"
check "a mensagem diz quais variáveis faltam" "true" \
  "$(jq -r '.error.message | contains("FREELA_API_URL")' /tmp/praca-smoke-fr.json)"
rm -f /tmp/praca-smoke-fr.json
check "lista de campanhas sem conexão = 503" "FREELA_NOT_CONFIGURED" \
  "$(curl -s "$API/v1/freela/campaigns?praca_id=$PRACA_SEED" -H "$HD" | jq -r .error.code)"
check "campanhas automáticas sem conexão = 503" "FREELA_NOT_CONFIGURED" \
  "$(curl -s $API/v1/freela/templates -H "$HD" | jq -r .error.code)"
check "opções de público sem conexão = 503" "FREELA_NOT_CONFIGURED" \
  "$(curl -s "$API/v1/freela/audience-options?audience=CONTRACTORS_ALL" -H "$HD" | jq -r .error.code)"
# EXTERNAL_LIST não é consulta na base do Freela: a lista vem do funil do Praça,
# e prever ali é a prévia do disparo (§13). Barrado ANTES de chamar o Freela.
check "EXTERNAL_LIST não tem prévia de público (opções)" "VALIDATION_ERROR" \
  "$(curl -s "$API/v1/freela/audience-options?audience=EXTERNAL_LIST" -H "$HD" | jq -r .error.code)"
check "EXTERNAL_LIST não tem prévia de público (contagem)" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/freela/audience-preview -H "$J" -H "$HD" \
    -d '{"audience":"EXTERNAL_LIST"}' | jq -r .error.code)"
check "público 'todos' vale para prever, mas não para criar campanha" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/freela/campaigns -H "$J" -H "$HD" \
    -d "{\"name\":\"Campanha\",\"praca_id\":\"$PRACA_SEED\",\"audience\":\"CONTRACTORS_ALL\",\"whatsapp_template\":\"Oi!\",\"start_now\":false}" | jq -r .error.code)"
check "prévia de público sem conexão = 503" "FREELA_NOT_CONFIGURED" \
  "$(curl -s -X POST $API/v1/freela/audience-preview -H "$J" -H "$HD" \
    -d '{"audience":"PROVIDERS_DORMANT_90D"}' | jq -r .error.code)"
check "painel de campanha sem conexão = 503" "FREELA_NOT_CONFIGURED" \
  "$(curl -s $API/v1/freela/campaigns/nao-existe -H "$HD" | jq -r .error.code)"
check "pausar campanha sem conexão = 503" "FREELA_NOT_CONFIGURED" \
  "$(curl -s -X PATCH $API/v1/freela/campaigns/nao-existe/pause -H "$HD" | jq -r .error.code)"

# Validação ANTES da porteira: corpo errado é 400, não 503.
check "público fora da lista do Freela é barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/freela/audience-preview -H "$J" -H "$HD" \
    -d '{"audience":"TODO MUNDO"}' | jq -r .error.code)"
check "nome curto demais é barrado" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/freela/campaigns -H "$J" -H "$HD" \
    -d "{\"name\":\"ab\",\"praca_id\":\"$PRACA_SEED\",\"audience\":\"EXTERNAL_LIST\",\"start_now\":false}" | jq -r .error.code)"
check "campo fora do DTO é barrado (whitelist)" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/freela/campaigns -H "$J" -H "$HD" \
    -d "{\"name\":\"Campanha\",\"praca_id\":\"$PRACA_SEED\",\"audience\":\"EXTERNAL_LIST\",\"start_now\":false,\"contacts\":[]}" | jq -r .error.code)"
check "agenda fora de WEEKLY|DATED é barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/freela/templates -H "$J" -H "$HD" \
    -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Automática\",\"schedule_kind\":\"MENSAL\",\"audience\":\"CONTRACTORS_ALL\",\"channels\":[\"PUSH\"]}" | jq -r .error.code)"
check "campanha automática sem canal é barrada" "VALIDATION_ERROR" \
  "$(curl -s -X POST $API/v1/freela/templates -H "$J" -H "$HD" \
    -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"Automática\",\"schedule_kind\":\"WEEKLY\",\"audience\":\"CONTRACTORS_ALL\",\"channels\":[]}" | jq -r .error.code)"

# `:id` de campanha automática é UUID no Freela: lixo da URL morre aqui como
# 404, sem virar chamada (e 500) do outro lado.
check "campanha automática com id malformado = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s $API/v1/freela/templates/nao-e-uuid -H "$HD" | jq -r .error.code)"
check "ligar campanha automática com id malformado = NOT_FOUND" "NOT_FOUND" \
  "$(curl -s -X PATCH $API/v1/freela/templates/nao-e-uuid/enabled -H "$J" -H "$HD" \
    -d '{"enabled":true}' | jq -r .error.code)"
check "campanha automática com id válido e sem conexão = 503" "FREELA_NOT_CONFIGURED" \
  "$(curl -s $API/v1/freela/templates/$BEEF -H "$HD" | jq -r .error.code)"

# Upload da imagem do push: o arquivo passa PELO Praça (a credencial de admin do
# Freela é da API, não da tela).
check "upload sem arquivo = FILE_REQUIRED" "FILE_REQUIRED" \
  "$(curl -s -X POST $API/v1/freela/templates/upload -H "$HD" | jq -r .error.code)"
echo "nao e imagem" > /tmp/praca-smoke-freela.txt
check "upload de arquivo que não é imagem = INVALID_FILE_TYPE" "INVALID_FILE_TYPE" \
  "$(curl -s -X POST $API/v1/freela/templates/upload -H "$HD" \
    -F "file=@/tmp/praca-smoke-freela.txt;type=text/plain" | jq -r .error.code)"
check "upload de PNG sem conexão para no 503, não no 500" "FREELA_NOT_CONFIGURED" \
  "$(curl -s -X POST $API/v1/freela/templates/upload -H "$HD" \
    -F "file=@/tmp/praca-smoke-freela.txt;type=image/png" | jq -r .error.code)"
rm -f /tmp/praca-smoke-freela.txt

echo "── Resíduo ──"
# Fecha a conta depois de todas as seções (funil, entrada, mensagens,
# disparos, cadências, mídia, indicadores, notificações, Freela): o banco
# precisa voltar EXATAMENTE ao que o seed deixou — nada de lead, praça,
# disparo, envio ou inscrição de teste esquecido para trás. Rodar o smoke duas
# vezes seguidas tem que dar as mesmas contagens aqui, sempre.
USERS_FINAL=$(curl -s $API/v1/users -H "$HD")
# Duas checagens, não uma: contar DEPOIS de filtrar pelos 3 e-mails do seed não
# provaria nada — um 4º usuário ativo residual, com outro e-mail, passaria
# batido. A contagem tem que vir de TODOS os ativos, sem pré-filtro por e-mail.
check "só 3 usuários ativos no total (sem resíduo de um 4º)" "3" \
  "$(echo "$USERS_FINAL" | jq '[.[] | select(.active)] | length')"
check "os 3 e-mails do seed estão entre os ativos" "true" \
  "$(echo "$USERS_FINAL" | jq '[.[] | select(.active) | .email] as $ativos | ["diego@praca.local","daniel@praca.local","mkt@praca.local"] | all(. as $e | $ativos | index($e) != null)')"
check "praça do seed continua lá" "$PRACA_SEED" "$(curl -s $API/v1/pracas/$PRACA_SEED -H "$HD" | jq -r .id)"

LEADS_FINAL=$(curl -s "$API/v1/leads?praca_id=$PRACA_SEED&archived=true" -H "$HD")
check "25 leads do seed, nenhum deles de teste" "25" \
  "$(echo "$LEADS_FINAL" | jq '[.[] | select(.is_test != true)] | length')"
check "nenhum lead de teste (is_test) sobrou na praça do seed" "0" \
  "$(echo "$LEADS_FINAL" | jq '[.[] | select(.is_test == true)] | length')"

check "8 modelos de mensagem do seed (sem resíduo)" "8" "$(curl -s $API/v1/msg-templates -H "$HD" | jq 'length')"
check "5 cadências-modelo do seed (sem resíduo)" "5" "$(curl -s $API/v1/cadences -H "$HD" | jq 'length')"
check "2 campanhas de mídia do seed (sem resíduo)" "2" \
  "$(curl -s "$API/v1/campanhas?praca_id=$PRACA_SEED" -H "$HD" | jq 'length')"
check "13 provas do seed (sem resíduo)" "13" \
  "$(curl -s "$API/v1/proofs?praca_id=$PRACA_SEED" -H "$HD" | jq 'length')"
check "blocklist vazia (sem resíduo)" "0" "$(curl -s $API/v1/blocklist -H "$HD" | jq 'length')"
check "nenhum envio (msg_sends) sobrou" "0" "$(curl -s $API/v1/sends/count -H "$HD" | jq '.total')"
check "nenhum disparo sobrou" "0" "$(curl -s $API/v1/disparos -H "$HD" | jq 'length')"
check "nenhuma inscrição em cadência sobrou" "0" "$(curl -s $API/v1/enrollments -H "$HD" | jq 'length')"
check "nenhum consultor de campo sobrou" "0" "$(curl -s $API/v1/consultores -H "$HD" | jq 'length')"

# O único resíduo que a API não sabe limpar: `DELETE /v1/users/:id` é lógico por
# contrato (§3, o histórico de quem escreveu o quê depende da linha), então cada
# rodada deixa um `teste<carimbo>@praca.local` INATIVO no banco. Sem isto, 68
# rodadas = 68 linhas mortas. Quem apaga é o psql do container do compose — e
# só quando ele está de pé (numa máquina sem docker o smoke segue com um aviso,
# em vez de falhar por algo que não é da API).
PSQL="docker exec praca-postgres psql -U praca -d praca -tAc"
SQL_TESTE="from users where email like 'teste%@praca.local' and active = false"
if command -v docker > /dev/null 2>&1 && [ -n "$(docker ps -q -f name=^praca-postgres$ 2>/dev/null)" ]; then
  $PSQL "delete $SQL_TESTE" > /dev/null
  check "nenhuma pessoa de teste inativa sobrou no banco" "0" \
    "$($PSQL "select count(*) $SQL_TESTE" | tr -d '[:space:]')"
  # Mesmo caso dos lotes de importação: `undo` devolve os leads mas o lote fica
  # no histórico da Entrada por contrato (§10), e cada rodada cria quatro
  # (`leads-`, `duplicados-`, `completar-`, `por-cidade-` + carimbo). Sem isto,
  # 51 rodadas = 204 lotes no histórico da tela.
  SQL_LOTE="from import_batches where file_name ~ '^(leads|duplicados|completar|por-cidade)-[0-9]{10,}\\.csv$'"
  $PSQL "delete $SQL_LOTE" > /dev/null
  check "nenhum lote de importação do smoke sobrou no histórico" "0" \
    "$($PSQL "select count(*) $SQL_LOTE" | tr -d '[:space:]')"
else
  printf '  \033[33m!\033[0m docker/praca-postgres fora do ar: pessoas de teste inativas e lotes do smoke não foram limpos\n'
fi

echo
printf 'Resultado: \033[32m%d ok\033[0m, \033[31m%d falha(s)\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
