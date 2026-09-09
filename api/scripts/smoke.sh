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
