#!/usr/bin/env bash
# Smoke do LOTE E do restante da Lovable (contrato §41 regra de senha, cadastro do consultor e e-mail do contato; §42 perfil gestor;
# §34.6 Clientes > Lista). Conversa com a API viva (3014) e limpa o que cria (repetível sem resíduo). Roda SEPARADO do smoke.sh (que
# cobre as flags desligadas). NUNCA fala com o Overpass público. Suba a API, em outro terminal, com as flags ligadas:
#   OVERPASS_URL=http://127.0.0.1:9/api/interpreter FIELD_ROUTES_ENABLED=true FIELD_ROUTE_PLANS_ENABLED=true FIELD_SEGMENTS_ENABLED=true \
#   FIELD_MALLS_ENABLED=true FIELD_MAP_PINS_ENABLED=true FIELD_VISIT_FLOW_SELECT_ENABLED=true PASSWORD_POLICY_ENABLED=true \
#   FIELD_CONSULTANT_PROFILE_ENABLED=true FIELD_CONTACT_EMAIL_ENABLED=true TEAM_GESTOR_ENABLED=true npm run start:smoke
#   bash scripts/smoke-lovable-e.sh
API=${API:-http://localhost:3014}
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko(){ FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s — %s\n' "$1" "$2"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "esperado '$2', veio '$3'"; fi }
J='Content-Type: application/json'
SUF=${SUF:-$(date +%s%N)}
uuid(){ cat /proc/sys/kernel/random/uuid; }
cpf_valido(){ node -e '
const b=process.argv[1].slice(-9).padStart(9,"1").split("").map(Number);
const dv=(a)=>{const s=a.reduce((t,d,i)=>t+d*(a.length+1-i),0);const r=(s*10)%11;return r===10?0:r;};
const d1=dv(b),d2=dv([...b,d1]);console.log([...b,d1,d2].join(""));' "$1"; }
PSQL="docker exec praca-postgres psql -U praca -d praca -qtAc"
T=/tmp/praca-smoke-e.json
code(){ curl -s -o $T -w '%{http_code}' "$@"; }
err(){ jq -r '.error.code // "-"' $T; }
agora(){ date -u +%Y-%m-%dT%H:%M:%S.000Z; }
LAT=-19.9245; LNG=-43.9352
pos(){ echo "\"at\":\"$(agora)\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"; }
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
HOJE=$(TZ=America/Sao_Paulo date +%F)

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
REBECA_ID=$($PSQL "select id from users where email = 'rebeca@praca.local'" | tr -d '[:space:]')
MKT_ID=$($PSQL "select id from users where email = 'mkt@praca.local'" | tr -d '[:space:]')

# Faxina de entrada: resíduo de rodada interrompida (consultores love*, leads "LovE …", pessoa love*, área, gestor e política).
faxina(){
  $PSQL "delete from field_visits where consultant_id in (select id from field_consultants where email like 'love%@praca.local');
         delete from field_points where journey_id in (select j.id from field_journeys j join field_consultants c on c.id = j.consultant_id where c.email like 'love%@praca.local');
         delete from field_journeys where consultant_id in (select id from field_consultants where email like 'love%@praca.local');
         delete from field_routes where consultant_id in (select id from field_consultants where email like 'love%@praca.local');
         delete from lead_events where lead_id in (select id from leads where name like 'LovE %');
         delete from leads where name like 'LovE %';
         delete from field_consultants where email like 'love%@praca.local';
         delete from field_areas where name like 'LovE %';
         delete from users where email like 'love%@praca.local';
         update users set is_gestor = false where email in ('rebeca@praca.local', 'mkt@praca.local');
         update app_settings set password_policy = null, field_config = field_config - 'contato_campos' where id = 1;" > /dev/null 2>&1
}
faxina

echo "── features (§41.1, §42.1) ──"
check "GET settings/config: as quatro do lote E ligadas" "true|true|true|true" \
  "$(curl -s $API/v1/consultores/settings/config -H "$HD" | jq -r '"\(.features.password_policy)|\(.features.consultant_profile)|\(.features.contact_email)|\(.features.team_gestor)"')"

echo "── regra de senha nova (§41.2) ──"
check "GET público: a da Lovable (8, maiúscula, número), 3 regras na ordem da tela" "true|8|true|true|true|min_length,upper,digit" \
  "$(curl -s $API/v1/password-policy | jq -r '"\(.enabled)|\(.min_length)|\(.require_upper)|\(.require_digit)|\(.is_default)|\([.rules[].key] | join(","))"')"
check "PUT só admin (Rebeca equipe = 403); fora da faixa = 400" "403|400|VALIDATION_ERROR" \
  "$(code -X PUT $API/v1/password-policy -H "$J" -H "Authorization: Bearer $(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"rebeca@praca.local","password":"praca123"}' | jq -r .access_token)" -d '{"min_length":10}')|$(code -X PUT $API/v1/password-policy -H "$J" -H "$HD" -d '{"min_length":13}')|$(err)"
check "PUT parcial (null = ausente): 10 caracteres" "10|true|false" \
  "$(curl -s -X PUT $API/v1/password-policy -H "$J" -H "$HD" -d '{"min_length":10,"require_upper":null}' | jq -r '"\(.min_length)|\(.require_upper)|\(.is_default)"')"
check "pessoa nova com senha fraca = 400 WEAK_PASSWORD com o que falta (sem a senha)" "400|WEAK_PASSWORD|A senha precisa de: 10 caracteres ou mais, 1 letra maiúscula, 1 número.|false" \
  "$(code -X POST $API/v1/users -H "$J" -H "$HD" -d "{\"email\":\"love$SUF@praca.local\",\"password\":\"fraquinha\",\"name\":\"LovE $SUF\"}")|$(err)|$(jq -r .error.message $T)|$(grep -c fraquinha $T | sed 's/^0$/false/;s/^[1-9].*/true/')"
check "pessoa nova com senha forte = 201" "201" \
  "$(code -X POST $API/v1/users -H "$J" -H "$HD" -d "{\"email\":\"love$SUF@praca.local\",\"password\":\"SenhaForte12\",\"name\":\"LovE $SUF\"}")"
PESSOA=$(jq -r .id $T)
check "login com a senha forte (o login nunca confere a regra)" "true" \
  "$(curl -s -X POST $API/v1/auth/login -H "$J" -d "{\"email\":\"love$SUF@praca.local\",\"password\":\"SenhaForte12\"}" | jq '.access_token != null')"
check "definir senha fraca = WEAK_PASSWORD; forte = 200" "WEAK_PASSWORD|200" \
  "$(curl -s -X PUT $API/v1/users/$PESSOA/password -H "$J" -H "$HD" -d '{"password":"abcdefghij"}' | jq -r .error.code)|$(code -X PUT $API/v1/users/$PESSOA/password -H "$J" -H "$HD" -d '{"password":"OutraForte34"}')"
check "a Rebeca (senha de 8 que não cumpre a regra) continua entrando: nenhuma senha atual é invalidada" "true" \
  "$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"rebeca@praca.local","password":"praca123"}' | jq '.access_token != null')"

echo "── consultor: senha provisória, cadastro e WhatsApp (§41.2, §41.3) ──"
CPF=$(cpf_valido "$SUF"); EMAIL_C="love$SUF.c@praca.local"
CRIA=$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"LovE $SUF\",\"email\":\"$EMAIL_C\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$CPF\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$CPF\",\"address_cep\":\"30140-071\",\"address_city\":\"Belo Horizonte\",\"address_state\":\"mg\",\"bank_name\":\"Banco X\",\"bank_account\":\"123456-7\",\"bank_account_type\":\"corrente\"}")
CONS=$(echo "$CRIA" | jq -r .consultant.id); SENHA=$(echo "$CRIA" | jq -r .temp_password)
check "senha provisória: 12, com maiúscula, minúscula e número (cumpre a regra de 10)" "12|true" \
  "${#SENHA}|$(echo "$SENHA" | grep -qE '[A-Z]' && echo "$SENHA" | grep -qE '[a-z]' && echo "$SENHA" | grep -qE '[0-9]' && echo true || echo false)"
check "cadastro gravado normalizado; o admin vê a conta inteira e a máscara" "30140071|MG|123456-7|•••6-7|corrente" \
  "$(echo "$CRIA" | jq -r '.consultant | "\(.address_cep)|\(.address_state)|\(.bank_account)|\(.bank_account_masked)|\(.bank_account_type)"')"
check "CEP inválido = 400 com o campo e sem o valor" "400|VALIDATION_ERROR|true|false" \
  "$(code -X PATCH $API/v1/consultores/$CONS -H "$J" -H "$HD" -d '{"address_cep":"9876"}')|$(err)|$(jq -r '.error.message | startswith("address_cep:")' $T)|$(grep -c 9876 $T | sed 's/^0$/false/;s/^[1-9].*/true/')"
# O log da API (LOG_API = a saída do `npm run start:smoke`): a conta, o e-mail do contato e as senhas nunca aparecem nele.
LOG_API=${LOG_API:-}
LOG=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL_C\",\"password\":\"$SENHA\"}")
HC0="Authorization: Bearer $(echo "$LOG" | jq -r .access_token)"
check "troca do consultor: nova fraca = WEAK_PASSWORD (a atual provisória é aceita)" "400|WEAK_PASSWORD" \
  "$(code -X POST $API/v1/campo/auth/change-password -H "$J" -H "$HC0" -d "{\"current_password\":\"$SENHA\",\"new_password\":\"campo12345\"}")|$(err)"
TR=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "$HC0" -d "{\"current_password\":\"$SENHA\",\"new_password\":\"CampoSenha12\"}")
HC="Authorization: Bearer $(echo "$TR" | jq -r .access_token)"
check "troca com a forte = token novo" "true" "$(echo "$TR" | jq '.access_token != null')"
check "/me: password_policy e contact_email ligados; a visão do consultor sem banco nem endereço" "true|true|false" \
  "$(curl -s $API/v1/campo/me -H "$HC" | jq -r '"\(.features.password_policy)|\(.features.contact_email)|\(.consultant | has("bank_account"))"')"

echo "── e-mail de quem atendeu (§41.4) ──"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada-e.jpg
curl -s -o /dev/null -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",$(pos)}"
V1=$(uuid)
VIS=$(curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$V1" -F "at=$(agora)" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" -F "flow=completo" -F "confirm_new=true" --form-string "new_place={\"name\":\"LovE $SUF bar\",\"address\":\"Rua de Teste, 10\"}" -F "photo=@/tmp/praca-smoke-fachada-e.jpg;type=image/jpeg")
check "check-in: answers traz contact_email explícito (null)" "true|null" "$(echo "$VIS" | jq -r '"\(.answers | has("contact_email"))|\(.answers.contact_email)"')"
ANS=$(echo "$VIS" | jq -c .answers)
check "rascunho com o eco do servidor (contact_email null) = 200" "200" "$(code -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d "$ANS")"
check "e-mail inválido = 400 sem repetir o valor" "400|VALIDATION_ERROR|false" \
  "$(code -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d '{"contact_email":"maria-sem-arroba.com"}')|$(err)|$(grep -c maria-sem-arroba $T | sed 's/^0$/false/;s/^[1-9].*/true/')"
check "válido: gravado aparado e minúsculo" "maria@padaria.com" \
  "$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d "$(echo "$ANS" | jq -c '. + {contact_email: "  Maria@Padaria.COM ", needs_followup: true, followup_what: "Voltar", followup_date: "'"$HOJE"'"}')" | jq -r .answers.contact_email)"
COMPLETA=$(echo "$ANS" | jq -c '. + {interlocutor_name:"Maria", interlocutor_role:"dono", freela_status:"nao_cadastrou", interest:"alto", open_vagas:1, vaga_roles:["Garçom"], freelas_per_week:2, channels:["Nenhum"], needs_followup:true, followup_what:"Voltar", followup_date:"'"$HOJE"'", contact_email:"maria@padaria.com"}')
curl -s -o /dev/null -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d "$COMPLETA"
check "checkout (fluxo completo) conclui" "true" "$(curl -s -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$(pos)}" | jq '.checkout_at != null')"
LEAD1=$(echo "$VIS" | jq -r .lead_id)
check "fila da equipe: só a máscara; a do consultor dono: o completo" "m***@padaria.com|false|maria@padaria.com" \
  "$(curl -s "$API/v1/consultores/followups?praca_id=$PRACA_SEED" -H "$HD" | jq -r --arg l "$LEAD1" '[.items[] | select(.lead_id==$l)][0] | "\(.contact_email_masked)|\(has("contact_email"))"')|$(curl -s $API/v1/campo/followups -H "$HC" | jq -r --arg l "$LEAD1" '[.items[] | select(.lead_id==$l)][0].contact_email')"
check "detalhe do dia da equipe: completo (como o telefone)" "maria@padaria.com" \
  "$(curl -s $API/v1/consultores/$CONS/days/$HOJE -H "$HD" | jq -r '.visits[0].answers.contact_email')"
check "CRM, lead e pinos nunca levam o e-mail" "0" \
  "$( (curl -s $API/v1/leads/$LEAD1 -H "$HD"; $PSQL "select text from lead_events where lead_id='$LEAD1'") | grep -c 'padaria.com')"
check "contato_campos aceita email (fim da ordem canônica)" "nome,email" \
  "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"contato_campos":["email","nome"]}' | jq -r '.contato_campos | join(",")')"
# Exigido: o checkout do simples cobra o e-mail que falta e aceita o GRAVADO (a conferência lê a coluna, não só o rascunho).
checkin_s(){ curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$1" -F "at=$(agora)" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" -F "flow=simples" -F "confirm_new=true" --form-string "new_place={\"name\":\"LovE $SUF $2\",\"address\":\"Rua de Teste, 20\"}" -F "photo=@/tmp/praca-smoke-fachada-e.jpg;type=image/jpeg"; }
V2=$(uuid); VS2=$(checkin_s "$V2" "simples")
if [ "$(echo "$VS2" | jq -r .flow)" = "simples" ]; then
  curl -s -o /dev/null -X PATCH $API/v1/campo/visits/$V2/answers -H "$J" -H "$HC" -d '{"result":"cadastrou","interlocutor_name":"Rui"}'
  check "e-mail exigido e vazio = 422 'e-mail de quem atendeu'" "ANSWERS_INCOMPLETE|true" \
    "$(curl -s -X POST $API/v1/campo/visits/$V2/checkout -H "$J" -H "$HC" -d "{$(pos)}" | jq -r '"\(.error.code)|\(.error.message | contains("e-mail de quem atendeu"))"')"
  curl -s -o /dev/null -X PATCH $API/v1/campo/visits/$V2/answers -H "$J" -H "$HC" -d '{"contact_email":"rui@simples.com"}'
  check "e-mail exigido e gravado: o checkout conclui" "true" "$(curl -s -X POST $API/v1/campo/visits/$V2/checkout -H "$J" -H "$HC" -d "{$(pos)}" | jq '.checkout_at != null')"
else
  printf '  \033[33m!\033[0m FIELD_VISIT_FLOW_SELECT_ENABLED desligada: o e-mail exigido (só no fluxo simples) ficou de fora\n'
fi
$PSQL "update app_settings set field_config = field_config - 'contato_campos' where id = 1" > /dev/null 2>&1

echo "── Clientes > Lista (§34.6) ──"
LISTA=$(curl -s "$API/v1/consultores/map/list?praca_id=$PRACA_SEED&q=LovE%20$SUF%20bar" -H "$HD")
check "a Lista acha o lugar da visita (com localização), com a situação e o telefone só mascarado" "1|true|retornar" \
  "$(echo "$LISTA" | jq -r '"\(.total)|\(.items[0].has_location)|\(.items[0].code)"')"
check "contagem antes do filtro de situação; código desconhecido = 400" "1|0|400" \
  "$(curl -s "$API/v1/consultores/map/list?praca_id=$PRACA_SEED&q=LovE%20$SUF%20bar&codes=fechado" -H "$HD" | jq -r '"\(.counts.retornar)|\(.items | length)"')|$(code "$API/v1/consultores/map/list?codes=xis" -H "$HD")"
check "token de consultor na Lista = 401" "401" "$(code $API/v1/consultores/map/list -H "$HC")"

echo "── perfil gestor (§42): pessoas ──"
check "o admin marca a Rebeca como gestor; UserView com is_gestor" "true" \
  "$(curl -s -X PATCH $API/v1/users/$REBECA_ID -H "$J" -H "$HD" -d '{"is_gestor":true,"is_admin":false}' | jq -r .is_gestor)"
REBECA=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"rebeca@praca.local","password":"praca123"}')
HG="Authorization: Bearer $(echo "$REBECA" | jq -r .access_token)"
HE="Authorization: Bearer $(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"mkt@praca.local","password":"praca123"}' | jq -r .access_token)"
check "login e /me da Rebeca: is_gestor true; o mkt (equipe) false" "true|true|false" \
  "$(echo "$REBECA" | jq -r .user.is_gestor)|$(curl -s $API/v1/auth/me -H "$HG" | jq -r .user.is_gestor)|$(curl -s $API/v1/auth/me -H "$HE" | jq -r .user.is_gestor)"

echo "── perfil gestor (§42.3): a matriz pela API (admin · gestor · equipe · consultor) ──"
# Cada linha: método, caminho, corpo, e o esperado para admin|gestor|equipe|consultor. Corpo inválido de propósito onde a rota grava:
# a guarda decide ANTES da validação (403/401), e quem passa recebe 400/404 sem gravar nada. "≠403" = passou da guarda.
passou(){ [ "$1" = "403" ] || [ "$1" = "401" ] && echo "$1" || echo "ok"; }
linha(){ # $1 nome, $2 método, $3 caminho, $4 corpo, $5 esperado admin|gestor|equipe|consultor
  # Sem corpo, sem Content-Type: o Fastify recusa JSON vazio (400) ANTES da guarda, e isso mascararia o 403.
  local a g e c ct=()
  [ -n "$4" ] && ct=(-H "$J" -d "$4")
  a=$(passou "$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "$API$3" -H "$HD" "${ct[@]}")")
  g=$(passou "$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "$API$3" -H "$HG" "${ct[@]}")")
  e=$(passou "$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "$API$3" -H "$HE" "${ct[@]}")")
  c=$(passou "$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "$API$3" -H "$HC" "${ct[@]}")")
  check "$1" "$5" "$a|$g|$e|$c"
}
NADA=$(uuid)
linha "POST /v1/consultores (corpo vazio)"            POST  /v1/consultores '{}' "ok|ok|403|401"
linha "PATCH /v1/consultores/:id (nome)"              PATCH /v1/consultores/$NADA '{"name":"X"}' "ok|ok|403|401"
linha "POST /v1/consultores/:id/reset-password"       POST  /v1/consultores/$NADA/reset-password '' "ok|ok|403|401"
linha "POST /v1/consultores/:id/freela-sync"          POST  /v1/consultores/$NADA/freela-sync '' "ok|ok|403|401"
linha "DELETE /v1/consultores/:id (só admin)"         DELETE /v1/consultores/$NADA '' "ok|403|403|401"
linha "POST /v1/areas (corpo vazio)"                  POST  /v1/areas '{}' "ok|ok|403|401"
linha "PATCH /v1/areas/:id"                           PATCH "/v1/areas/$NADA?praca_id=$PRACA_SEED" '{"name":"X"}' "ok|ok|403|401"
linha "POST /v1/routes (corpo vazio)"                 POST  /v1/routes '{}' "ok|ok|403|401"
linha "PUT /v1/routes/:id/order"                      PUT   /v1/routes/$NADA/order '{}' "ok|ok|403|401"
linha "POST /v1/routes/:id/reoptimize"                POST  /v1/routes/$NADA/reoptimize '{}' "ok|ok|403|401"
linha "POST /v1/route-plans (corpo vazio)"            POST  /v1/route-plans '{}' "ok|ok|403|401"
linha "POST /v1/route-plans/:id/items/:item/assign"   POST  /v1/route-plans/$NADA/items/$NADA/assign '{}' "ok|ok|403|401"
linha "POST /v1/route-plans/:id/archive"              POST  /v1/route-plans/$NADA/archive '' "ok|ok|403|401"
linha "PUT /v1/route-plans/config (só admin)"         PUT   /v1/route-plans/config '{"por_rota":0}' "ok|403|403|401"
linha "PATCH /v1/consultores/shoppings/:id"           PATCH /v1/consultores/shoppings/$NADA '{"large_override":null}' "ok|ok|403|401"
linha "PUT /v1/consultores/shoppings/config (admin)"  PUT   /v1/consultores/shoppings/config '{"area_min_m2":1}' "ok|403|403|401"
linha "GET /v1/place-searches (leitura)"              GET   "/v1/place-searches?praca_id=$PRACA_SEED" '' "ok|ok|403|401"
linha "POST /v1/place-searches (osm, área inexistente)" POST /v1/place-searches "{\"praca_id\":\"$PRACA_SEED\",\"area_id\":\"$NADA\",\"types\":[\"bar\"]}" "ok|ok|403|401"
linha "PUT /v1/place-searches/segments (só admin)"    PUT   /v1/place-searches/segments '{"segments":"x"}' "ok|403|403|401"
linha "PUT settings/config (só admin)"                PUT   /v1/consultores/settings/config '{"meta_diaria":0}' "ok|403|403|401"
linha "PUT settings/channels (só admin)"              PUT   /v1/consultores/settings/channels '{"channels":[]}' "ok|403|403|401"
linha "PUT /v1/password-policy (só admin)"            PUT   /v1/password-policy '{"min_length":0}' "ok|403|403|401"
linha "POST /v1/users (só admin)"                     POST  /v1/users '{}' "ok|403|403|401"
linha "DELETE /v1/pracas/:id (só admin)"              DELETE /v1/pracas/$NADA '' "ok|403|403|401"
linha "DELETE /v1/leads/:id (só admin)"               DELETE /v1/leads/$NADA '' "ok|403|403|401"
linha "POST /v1/leads (equipe: todos)"                POST  /v1/leads '{}' "ok|ok|ok|401"

echo "── perfil gestor: o que não muda nem vê (§42.3, §42.4) ──"
check "gestor vê o Pix mascarado e a conta mascarada (nunca a inteira)" "true|false|•••6-7" \
  "$(curl -s $API/v1/consultores/$CONS -H "$HG" | jq -r '"\(.pix_key | startswith("•••"))|\(has("bank_account"))|\(.bank_account_masked)"')"
check "PATCH do gestor com pix_key / visit_flow (null) / bank_name = 403 FORBIDDEN_FIELD" "FORBIDDEN_FIELD|FORBIDDEN_FIELD|FORBIDDEN_FIELD" \
  "$(curl -s -X PATCH $API/v1/consultores/$CONS -H "$J" -H "$HG" -d "{\"pix_key\":\"$CPF\"}" | jq -r .error.code)|$(curl -s -X PATCH $API/v1/consultores/$CONS -H "$J" -H "$HG" -d '{"visit_flow":null}' | jq -r .error.code)|$(curl -s -X PATCH $API/v1/consultores/$CONS -H "$J" -H "$HG" -d '{"bank_name":"Y"}' | jq -r .error.code)"
check "PATCH do gestor com nome e endereço = 200 (o Pix não mudou)" "200|Contagem|$CPF" \
  "$(code -X PATCH $API/v1/consultores/$CONS -H "$J" -H "$HG" -d '{"name":"LovE '"$SUF"' editado","address_city":"Contagem"}')|$(jq -r .address_city $T)|$($PSQL "select pix_key from field_consultants where id='$CONS'" | tr -d '[:space:]')"
check "gestor gera senha provisória de consultor (12 caracteres)" "12" "$(curl -s -X POST $API/v1/consultores/$CONS/reset-password -H "$HG" | jq -r '.temp_password | length')"
check "gestor nunca troca a senha de pessoa da equipe nem de admin" "FORBIDDEN|FORBIDDEN" \
  "$(curl -s -X PUT $API/v1/users/$MKT_ID/password -H "$J" -H "$HG" -d '{"password":"SenhaForte99"}' | jq -r .error.code)|$(curl -s -X PUT $API/v1/users/$(echo "$DIEGO" | jq -r .user.id)/password -H "$J" -H "$HG" -d '{"password":"SenhaForte99"}' | jq -r .error.code)"
check "gestor com source=apify = 403; lista sem as buscas pagas" "403|0" \
  "$(code -X POST $API/v1/place-searches -H "$J" -H "$HG" -d "{\"praca_id\":\"$PRACA_SEED\",\"area_id\":\"$NADA\",\"types\":[\"bar\"],\"source\":\"apify\"}")|$(curl -s "$API/v1/place-searches?praca_id=$PRACA_SEED" -H "$HG" | jq '[.[] | select(.source != "osm")] | length')"
AREA=$(curl -s -X POST $API/v1/areas -H "$J" -H "$HG" -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"LovE $SUF\",\"lat\":$LAT,\"lng\":$LNG,\"radius_m\":800}" | jq -r .id)
check "gestor cria área" "true" "$( [ -n "$AREA" ] && [ "$AREA" != "null" ] && echo true || echo false)"
check "gestor não aprova cupom nem vê a chave Pix do pagamento" "403|403" \
  "$(code -X POST $API/v1/consultores/vouchers/$NADA/approve -H "$J" -H "$HG" -d '{}')|$(code $API/v1/consultores/payouts/$NADA/pix-key -H "$HG")"
# Gestor desmarcado: volta a ser equipe na próxima request (o guard lê do banco a cada vez), com o mesmo token.
curl -s -o /dev/null -X PATCH $API/v1/users/$REBECA_ID -H "$J" -H "$HD" -d '{"is_gestor":false}'
check "desmarcado: o MESMO token vira equipe na hora (403)" "403" "$(code -X POST $API/v1/areas -H "$J" -H "$HG" -d '{}')"

if [ -n "$LOG_API" ] && [ -f "$LOG_API" ]; then
  check "log da API sem conta bancária, e-mail do contato nem senha" "0" \
    "$(grep -cE '123456-7|maria@padaria|Maria@Padaria|CampoSenha12|SenhaForte12|OutraForte34|fraquinha|'"$SENHA" "$LOG_API")"
else
  printf '  \033[33m!\033[0m LOG_API não informado: a conferência do log da API ficou de fora\n'
fi

echo "── limpeza ──"
$PSQL "delete from field_visits where consultant_id='$CONS'; delete from field_points where journey_id in (select id from field_journeys where consultant_id='$CONS'); delete from field_journeys where consultant_id='$CONS'; delete from lead_events where lead_id in (select id from leads where name like 'LovE $SUF%'); delete from leads where name like 'LovE $SUF%';" > /dev/null 2>&1
curl -s -o /dev/null -X DELETE $API/v1/consultores/$CONS -H "$HD"
faxina
check "consultor, pessoa, área e leads de teste removidos; gestor desmarcado; política nula" "0|0|0|0|0|t" \
  "$($PSQL "select count(*) from field_consultants where email like 'love%@praca.local'" | tr -d '[:space:]')|$($PSQL "select count(*) from users where email like 'love%@praca.local'" | tr -d '[:space:]')|$($PSQL "select count(*) from field_areas where name like 'LovE %'" | tr -d '[:space:]')|$($PSQL "select count(*) from leads where name like 'LovE %'" | tr -d '[:space:]')|$($PSQL "select count(*) from users where is_gestor" | tr -d '[:space:]')|$($PSQL "select password_policy is null from app_settings where id = 1" | tr -d '[:space:]')"

echo
echo "$PASS ok, $FAIL falha(s)"
[ "$FAIL" -eq 0 ]
