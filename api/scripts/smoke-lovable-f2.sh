#!/usr/bin/env bash
# Smoke do restante da Lovable, LOTE F2 (contrato §44 consultor em várias praças). Conversa com a API viva (3014) e limpa o que
# cria (o pedido de cupom é imutável por trigger: o banco de TESTE é limpo com session_replication_role=replica). Roda SEPARADO
# do smoke.sh (que cobre a flag desligada). Suba a API com as flags ligadas (as de produção + as do lote + as que ele exercita):
#   FIELD_MULTI_PRACA_ENABLED=true FIELD_CHECKLIST_ENABLED=true FIELD_BREAKS_ENABLED=true FIELD_VOUCHERS_ENABLED=true \
#   FIELD_DASHBOARD_ENABLED=true FIELD_ROUTES_ENABLED=true FIELD_VISIT_FLOW_SELECT_ENABLED=true FIELD_EARNINGS_ENABLED=true \
#   FIELD_DECLARED_SIGNUPS_ENABLED=true FIELD_PAYOUTS_ENABLED=true npm run start:smoke
#   bash scripts/smoke-lovable-f2.sh
# Os cupons ficam no registro (FIELD_VOUCHER_COUPONS_ENABLED desligada: nenhuma chamada ao Freela).
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
T=/tmp/praca-smoke-f2.json

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
REBECA=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"rebeca@praca.local","password":"praca123"}')
HN="Authorization: Bearer $(echo "$REBECA" | jq -r .access_token)"
A="00000000-0000-4000-8000-0000000000aa"   # a praça do seed (principal dos dois consultores de teste)
HOJE=$(TZ=America/Sao_Paulo date +%F)
AMANHA=$(date -d "$HOJE +1 day" +%F)
agora(){ date -u +%Y-%m-%dT%H:%M:%S.000Z; }
LAT=-19.9245; LNG=-43.9352
pos(){ echo "\"at\":\"$(agora)\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"; }
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada.jpg

# Faxina de uma rodada interrompida (só o que este smoke cria: consultores, leads e praças "F2 …").
faxina(){
  local ids; ids=$($PSQL "select string_agg(quote_literal(id::text), ',') from field_consultants where name like 'F2 %'" | tr -d '[:space:]')
  if [ -n "$ids" ]; then
    $PSQL "set session_replication_role = replica; delete from field_voucher_events where voucher_id in (select id from field_vouchers where consultant_id in ($ids)); delete from field_vouchers where consultant_id in ($ids);" > /dev/null 2>&1
    $PSQL "delete from field_route_stops where route_id in (select id from field_routes where consultant_id in ($ids)); delete from field_route_events where route_id in (select id from field_routes where consultant_id in ($ids)); delete from field_routes where consultant_id in ($ids); delete from field_journey_breaks where consultant_id in ($ids); delete from field_visits where consultant_id in ($ids); delete from field_points where journey_id in (select id from field_journeys where consultant_id in ($ids)); delete from field_journeys where consultant_id in ($ids); delete from field_consultant_pracas where consultant_id in ($ids);" > /dev/null 2>&1
    for id in $(echo "$ids" | tr -d "'" | tr ',' ' '); do curl -s -o /dev/null -X DELETE $API/v1/consultores/$id -H "$HD"; done
  fi
  $PSQL "delete from lead_events where lead_id in (select id from leads where name like 'F2 %'); delete from leads where name like 'F2 %';" > /dev/null 2>&1
  for p in $($PSQL "select id from pracas where name like 'F2 %'"); do curl -s -o /dev/null -X DELETE $API/v1/pracas/$p -H "$HD"; done
}
faxina

echo "── preparação: a praça B e dois consultores (principal A) ──"
B=$(curl -s -X POST $API/v1/pracas -H "$J" -H "$HD" -d "{\"name\":\"F2 Praça B $SUF\",\"city\":\"Contagem · MG\",\"start_date\":\"2026-09-01\",\"end_date\":\"2026-12-31\"}" | jq -r .id)
cria(){ # $1 nome, $2 arquivo, $3 índice → id
  local cpf; cpf=$(cpf_valido "$SUF$3")
  curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"F2 $1 $SUF\",\"email\":\"f2$3$SUF@praca.local\",\"phone\":\"(31) 99999-000$3\",\"cpf\":\"$cpf\",\"praca_id\":\"$A\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$cpf\"}" > "$2"
  jq -r .consultant.id "$2"; }
entra(){ # $1 arquivo da criação, $2 índice → header de campo
  local email senha log tr; email="f2$2$SUF@praca.local"; senha=$(jq -r .temp_password "$1")
  log=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$email\",\"password\":\"$senha\"}")
  tr=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "Authorization: Bearer $(echo "$log" | jq -r .access_token)" -d "{\"current_password\":\"$senha\",\"new_password\":\"CampoSenha123\"}")
  echo "Authorization: Bearer $(echo "$tr" | jq -r .access_token)"; }
X=$(cria Ana /tmp/praca-smoke-f2x.json 1); Y=$(cria Beto /tmp/praca-smoke-f2y.json 2)
HX=$(entra /tmp/praca-smoke-f2x.json 1); HY=$(entra /tmp/praca-smoke-f2y.json 2)
check "praça B e dois consultores de teste criados; config e /me com multi_praca ligado" "true|true|true" \
  "$([ -n "$B" ] && [ "$B" != null ] && [ "$X" != null ] && [ "$Y" != null ] && echo true)|$(curl -s $API/v1/consultores/settings/config -H "$HD" | jq .features.multi_praca)|$(curl -s $API/v1/campo/me -H "$HX" | jq .features.multi_praca)"
check "/me antes do vínculo: só a principal, padrão e ativa = A" "1|true|$A|$A" \
  "$(curl -s $API/v1/campo/me -H "$HX" | jq -r '"\(.pracas | length)|\(.pracas[0].principal)|\(.default_praca_id)|\(.active_praca_id)"')"

echo "── praças do consultor (só admin) ──"
put_pracas(){ curl -s -o $T -w '%{http_code}' -X PUT $API/v1/consultores/$1/pracas -H "$J" -H "$2" -d "{\"praca_ids\":$3}"; }
check "equipe = 403; token de campo = 401" "403|401" "$(put_pracas "$X" "$HN" "[\"$A\",\"$B\"]")|$(put_pracas "$X" "$HX" "[\"$A\",\"$B\"]")"
check "sem a principal = 400 com o campo; praça inexistente = 404" "400|true|404" \
  "$(put_pracas "$X" "$HD" "[\"$B\"]")|$(jq '.error.message | startswith("praca_ids: a praça principal")' $T)|$(put_pracas "$X" "$HD" "[\"$A\",\"$(uuid)\"]")"
check "admin grava A + B: o conjunto volta com a principal primeiro (detalhe e lista)" "200|$A,$B|true|$A,$B" \
  "$(put_pracas "$X" "$HD" "[\"$B\",\"$A\"]")|$(jq -r '.praca_ids | join(",")' $T)|$(jq '.pracas[0].principal' $T)|$(curl -s $API/v1/consultores -H "$HD" | jq -r --arg x "$X" '.[] | select(.id==$x) | .praca_ids | join(",")')"
check "a junção guarda só a extra (a principal nunca é gravada)" "1|$B" \
  "$($PSQL "select count(*) from field_consultant_pracas where consultant_id='$X'" | tr -d '[:space:]')|$($PSQL "select praca_id from field_consultant_pracas where consultant_id='$X'" | tr -d '[:space:]')"
check "/me depois do vínculo: duas praças, padrão A (sem roteiro), ativa A" "2|$A|$A" \
  "$(curl -s $API/v1/campo/me -H "$HX" | jq -r '"\(.pracas | length)|\(.default_praca_id)|\(.active_praca_id)"')"

echo "── consultor ligado só a A não inicia em B ──"
check "início de Y em B = 404 NOT_FOUND e nenhuma jornada" "404|NOT_FOUND|0" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/campo/journeys/start -H "$J" -H "$HY" -d "{\"client_id\":\"$(uuid)\",\"praca_id\":\"$B\",$(pos)}")|$(jq -r .error.code $T)|$($PSQL "select count(*) from field_journeys where consultant_id='$Y'" | tr -d '[:space:]')"

echo "── jornada em B: tudo nasce e é visto em B ──"
JB=$(uuid)
check "início em B: JourneyView, Hoje e /me dizem B" "$B|$B|$B" \
  "$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HX" -d "{\"client_id\":\"$JB\",\"praca_id\":\"$B\",$(pos)}" | jq -r .praca_id)|$(curl -s $API/v1/campo/today -H "$HX" | jq -r .journey.praca_id)|$(curl -s $API/v1/campo/me -H "$HX" | jq -r .active_praca_id)"
checkin(){ # $1 header, $2 client_id, $3 campo do lugar
  curl -s -X POST $API/v1/campo/visits -H "$1" -F "client_id=$2" -F "at=$(agora)" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" -F "flow=simples" -F "confirm_new=true" \
    --form-string "$3" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg"; }
# Corpo REAL do rascunho do fluxo simples (rascunhoSimples: o formulário inteiro sem outcome/freela_status/needs_followup) + o checklist.
RASCUNHO='{"interlocutor_name":null,"interlocutor_role":null,"interest":null,"open_vagas":null,"vaga_roles":[],"freelas_per_week":null,"channels":[],"channel_other":null,"followup_what":null,"followup_date":null,"notes":null,"refusal_reason":null,"refusal_note":null,"followup_time":null,"contact_phone":null,"result":"ja_usa","checklist":[{"id":"apresentacao","done":true}]}'
VB=$(uuid)
VISB=$(checkin "$HX" "$VB" "new_place={\"name\":\"F2 LugarB $SUF\",\"address\":\"Rua de B, 10\"}")
LEAD_B=$(echo "$VISB" | jq -r .lead_id)
check "lugar novo nasce na praça da jornada (B)" "$B" "$(curl -s $API/v1/leads/$LEAD_B -H "$HD" | jq -r .praca_id)"
check "rascunho com o corpo real do web (checklist) e checkout = 200" "200|true" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $API/v1/campo/visits/$VB/answers -H "$J" -H "$HX" -d "$RASCUNHO")|$(curl -s -X POST $API/v1/campo/visits/$VB/checkout -H "$J" -H "$HX" -d "{$(pos)}" | jq '.checkout_at != null')"
CK_VB=$(curl -s $API/v1/campo/today -H "$HX" | jq -r --arg v "$VB" '.visits[] | select(.client_id==$v) | .checkout_at')
check "em B a busca acha o lugar de B" "1" "$(curl -s "$API/v1/campo/places?q=F2%20LugarB%20$SUF" -H "$HX" | jq length)"
curl -s -o /dev/null -X POST $API/v1/campo/journeys/current/breaks/start -H "$J" -H "$HX" -d "{\"client_id\":\"$(uuid)\",\"at\":\"$(agora)\"}"
check "fim da jornada em B (com o intervalo aberto, que fecha junto)" "true|journey_end" \
  "$(curl -s -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HX" -d "{$(pos)}" | jq '.ended_at != null')|$($PSQL "select end_reason from field_journey_breaks where consultant_id='$X' order by started_at desc, created_at desc limit 1" | tr -d '[:space:]')"

echo "── jornada em A: não vê nem faz check-in em lead de B ──"
JA=$(uuid)
check "início sem escolha e sem roteiro = a principal A, gravada explícita" "$A|$A" \
  "$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HX" -d "{\"client_id\":\"$JA\",$(pos)}" | jq -r .praca_id)|$($PSQL "select praca_id from field_journeys where client_id='$JA'" | tr -d '[:space:]')"
check "busca, perto e parecidos em A: nada de B (no mesmo lugar físico)" "0|0|0" \
  "$(curl -s "$API/v1/campo/places?q=F2%20LugarB%20$SUF" -H "$HX" | jq length)|$(curl -s "$API/v1/campo/places?lat=$LAT&lng=$LNG" -H "$HX" | jq --arg l "$LEAD_B" '[.[] | select(.id==$l)] | length')|$(curl -s "$API/v1/campo/places/similar?name=F2%20LugarB%20$SUF&lat=$LAT&lng=$LNG" -H "$HX" | jq --arg l "$LEAD_B" '[.[] | select(.id==$l)] | length')"
check "check-in no lead de B com a jornada em A = 404 (nada gravado)" "NOT_FOUND|Estabelecimento não encontrado na sua praça.|0" \
  "$(checkin "$HX" "$(uuid)" "lead_id=$LEAD_B" | jq -r '"\(.error.code)|\(.error.message)"')|$($PSQL "select count(*) from field_visits v join field_journeys j on j.id=v.journey_id where j.client_id='$JA'" | tr -d '[:space:]')"
VA=$(uuid)
LEAD_A=$(checkin "$HX" "$VA" "new_place={\"name\":\"F2 LugarA $SUF\",\"address\":\"Rua de A, 20\"}" | jq -r .lead_id)
curl -s -o /dev/null -X PATCH $API/v1/campo/visits/$VA/answers -H "$J" -H "$HX" -d "$RASCUNHO"
curl -s -o /dev/null -X POST $API/v1/campo/visits/$VA/checkout -H "$J" -H "$HX" -d "{$(pos)}"
check "lugar novo em A nasce em A" "$A" "$(curl -s $API/v1/leads/$LEAD_A -H "$HD" | jq -r .praca_id)"

echo "── a fila reenviada depois do end da jornada em B (a jornada em A aberta) ──"
check "checkout da visita de B = 200, o mesmo (não é 404)" "200|$CK_VB" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/campo/visits/$VB/checkout -H "$J" -H "$HX" -d "{$(pos)}")|$(jq -r .checkout_at $T)"
check "rascunho (checklist) da visita de B = 409 VISIT_CLOSED, a visita é achada (não 404)" "409|VISIT_CLOSED" \
  "$(curl -s -o $T -w '%{http_code}' -X PATCH $API/v1/campo/visits/$VB/answers -H "$J" -H "$HX" -d "$RASCUNHO")|$(jq -r .error.code $T)"
check "foto da visita de B = 200" "image/jpeg" "$(curl -s -o /dev/null -w '%{content_type}' $API/v1/campo/visits/$VB/photo -H "$HX")"
CUPOM=$(uuid)
check "cupom pela visita de B (visit_ref) = 201 e grava a praça B" "201|$B|F2 LugarB $SUF" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/campo/vouchers -H "$J" -H "$HX" -d "{\"client_id\":\"$CUPOM\",\"lead_id\":null,\"visit_ref\":\"$VB\",\"segment\":\"Padaria\",\"freelas_per_week\":3,\"uf\":null,\"city\":null}")|$($PSQL "select praca_id from field_vouchers where client_id='$CUPOM'" | tr -d '[:space:]')|$(jq -r .company_name $T)"
check "cupom só com o lead de B (sem visit_ref), praça ativa A = 404" "404" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/campo/vouchers -H "$J" -H "$HX" -d "{\"client_id\":\"$(uuid)\",\"lead_id\":\"$LEAD_B\",\"segment\":\"Padaria\",\"freelas_per_week\":1}")"
check "fim do intervalo de B na fila = 200 (o fim da jornada já o encerrou)" "200|journey_end" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/campo/journeys/current/breaks/end -H "$J" -H "$HX" -d "{\"client_id\":\"$(uuid)\",\"at\":\"$(agora)\"}")|$(jq -r .end_reason $T)"
curl -s -o /dev/null -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HX" -d "{$(pos)}"

echo "── relatórios: a praça A sem dados da B ──"
painel(){ curl -s "$API/v1/consultores/dashboard?praca_id=$1" -H "$HD" | jq -r --arg x "$X" '[.ranking[] | select(.consultant_id==$x)][0].visits // "fora"'; }
check "painel: visitas do consultor em A = 1, em B = 1, todas = 2" "1|1|2" \
  "$(painel "$A")|$(painel "$B")|$(curl -s "$API/v1/consultores/dashboard" -H "$HD" | jq -r --arg x "$X" '[.ranking[] | select(.consultant_id==$x)][0].visits')"
check "painel de B: o cartão de visitas conta só a visita de B; Y (só A) fora do ranking de B" "1|fora" \
  "$(curl -s "$API/v1/consultores/dashboard?praca_id=$B" -H "$HD" | jq -r .kpis.visits)|$(curl -s "$API/v1/consultores/dashboard?praca_id=$B" -H "$HD" | jq -r --arg y "$Y" '[.ranking[] | select(.consultant_id==$y)][0].visits // "fora"')"
check "Atenção de B: X (no conjunto) está, Y não" "1|0" \
  "$(curl -s "$API/v1/consultores/attention?praca_id=$B" -H "$HD" | jq --arg x "$X" '[.consultants[] | select(.consultant_id==$x)] | length')|$(curl -s "$API/v1/consultores/attention?praca_id=$B" -H "$HD" | jq --arg y "$Y" '[.consultants[] | select(.consultant_id==$y)] | length')"
PONTOS_B=$($PSQL "select count(*) from field_points p join field_journeys j on j.id=p.journey_id where j.client_id='$JB'" | tr -d '[:space:]')
PONTOS_A=$($PSQL "select count(*) from field_points p join field_journeys j on j.id=p.journey_id where j.client_id='$JA'" | tr -d '[:space:]')
calor(){ curl -s "$API/v1/consultores/heatmap?praca_id=$1&layer=passagem&from=$HOJE&to=$HOJE&consultant_id=$X" -H "$HD" | jq -r .summary.points; }
check "passagem pela praça da JORNADA: B = os pontos da jornada em B, A = os da jornada em A" "$PONTOS_B|$PONTOS_A" "$(calor "$B")|$(calor "$A")"
check "mapa de calor de B filtrado por Y (só A) = 404" "404" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/consultores/heatmap?praca_id=$B&layer=passagem&from=$HOJE&to=$HOJE&consultant_id=$Y" -H "$HD")"

echo "── roteiros montados pela equipe ──"
rota(){ curl -s -o $T -w '%{http_code}' -X POST $API/v1/routes -H "$J" -H "$HD" -d "{\"consultant_id\":\"$1\",\"day\":\"$2\",\"lead_ids\":$3}"; }
check "leads de B para X = roteiro em B" "201|$B" "$(rota "$X" "$AMANHA" "[\"$LEAD_B\"]")|$(jq -r .praca_id $T)"
check "leads de A e B juntos = 400 'uma praça só'" "400|lead_ids: os estabelecimentos precisam ser de uma praça só." "$(rota "$X" "$AMANHA" "[\"$LEAD_A\",\"$LEAD_B\"]")|$(jq -r .error.message $T)"
check "lead de B para Y (só A) = 400 com a frase de hoje" "400|true" "$(rota "$Y" "$AMANHA" "[\"$LEAD_B\"]")|$(jq '.error.message | contains("não pertencem à praça do consultor")' $T)"
check "o roteiro de amanhã (sem visita) passa para A" "201|$A" "$(rota "$X" "$AMANHA" "[\"$LEAD_A\"]")|$($PSQL "select praca_id from field_routes where consultant_id='$X' and day='$AMANHA' and status='ativa'" | tr -d '[:space:]')"
check "roteiro de hoje em B: o padrão do início (e do /me) passa a ser B" "201|$B" "$(rota "$X" "$HOJE" "[\"$LEAD_B\"]")|$(curl -s $API/v1/campo/me -H "$HX" | jq -r .default_praca_id)"
JR=$(uuid)
check "início sem escolha com roteiro de hoje em B = B" "$B" \
  "$(curl -s -X POST $API/v1/campo/journeys/start -H "$J" -H "$HX" -d "{\"client_id\":\"$JR\",$(pos)}" | jq -r .praca_id)"

echo "── tirar a praça do conjunto corta o acesso na hora ──"
put_pracas "$X" "$HD" "[\"$A\"]" > /dev/null
check "com a jornada em B ainda aberta: o request seguinte já vê A" "$A|0" \
  "$(curl -s $API/v1/campo/me -H "$HX" | jq -r .active_praca_id)|$(curl -s "$API/v1/campo/places?q=F2%20LugarB%20$SUF" -H "$HX" | jq length)"
curl -s -o /dev/null -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HX" -d "{$(pos)}"

echo "── DELETE da praça considera o conjunto e as jornadas ──"
check "com jornadas gravadas em B = 409 PRACA_HAS_JOURNEYS" "409|PRACA_HAS_JOURNEYS" "$(curl -s -o $T -w '%{http_code}' -X DELETE $API/v1/pracas/$B -H "$HD")|$(jq -r .error.code $T)"
put_pracas "$X" "$HD" "[\"$A\",\"$B\"]" > /dev/null
check "com B no conjunto de alguém = 409 PRACA_HAS_CONSULTANTS" "409|PRACA_HAS_CONSULTANTS" "$(curl -s -o $T -w '%{http_code}' -X DELETE $API/v1/pracas/$B -H "$HD")|$(jq -r .error.code $T)"

echo "── limpeza ──"
faxina
check "nada sobrou (consultores, leads, praça, junção, jornadas com praça de teste)" "0|0|0|0" \
  "$($PSQL "select count(*) from field_consultants where name like 'F2 %'" | tr -d '[:space:]')|$($PSQL "select count(*) from leads where name like 'F2 %'" | tr -d '[:space:]')|$($PSQL "select count(*) from pracas where name like 'F2 %'" | tr -d '[:space:]')|$($PSQL "select count(*) from field_consultant_pracas" | tr -d '[:space:]')"
rm -f /tmp/praca-smoke-f2x.json /tmp/praca-smoke-f2y.json $T /tmp/praca-smoke-fachada.jpg

echo
echo "$PASS ok, $FAIL falha(s)"
[ "$FAIL" -eq 0 ]
