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
SUF=${SUF:-$(date +%s)}
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
check "admin não desativa a si mesmo" "CANNOT_DEACTIVATE_SELF" \
  "$(curl -s -X DELETE $API/v1/users/$DIEGO_ID -H "$HD" | jq -r .error.code)"

curl -s -X DELETE $API/v1/users/$TESTE_ID -H "$HD" > /dev/null
check "conta de teste desativada" "false" \
  "$(curl -s $API/v1/users -H "$HD" | jq --arg i "$TESTE_ID" '[.[] | select(.id==$i)][0].active')"
check "login da conta desativada = UNAUTHORIZED" "UNAUTHORIZED" \
  "$(curl -s -X POST $API/v1/auth/login -H "$J" -d "{\"email\":\"$EMAIL_TESTE\",\"password\":\"teste123\"}" | jq -r .error.code)"

echo
printf 'Resultado: \033[32m%d ok\033[0m, \033[31m%d falha(s)\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
