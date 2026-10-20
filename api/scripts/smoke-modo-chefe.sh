#!/usr/bin/env bash
# Smoke do MODO DO CHEFE (contrato §31) com FIELD_VISIT_FLOW_SELECT_ENABLED=true. Conversa com a API viva (3014) e
# limpa o que cria (consultor de teste). NÃO roda junto do smoke.sh: lá o fluxo é o completo (flag desligada).
#   FIELD_VISIT_FLOW_SELECT_ENABLED=true npm run start:smoke   # em outro terminal
#   bash scripts/smoke-modo-chefe.sh
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

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
HOJE=$(TZ=America/Sao_Paulo date +%F); AMANHA=$(TZ=America/Sao_Paulo date -d '+1 day' +%F)
AGORA=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
LAT=-19.9245; LNG=-43.9352
POS="\"at\":\"$AGORA\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada.jpg

echo "── Modo do chefe: configuração e consultor ──"
CPF=$(cpf_valido "$SUF"); EMAIL="chefe$SUF@praca.local"
CRIA=$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"Chefe $SUF\",\"email\":\"$EMAIL\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$CPF\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$CPF\"}")
CONS=$(echo "$CRIA" | jq -r .consultant.id); SENHA=$(echo "$CRIA" | jq -r .temp_password)
LOG=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}")
TR=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "Authorization: Bearer $(echo "$LOG" | jq -r .access_token)" -d "{\"current_password\":\"$SENHA\",\"new_password\":\"campoSenha123\"}")
HC="Authorization: Bearer $(echo "$TR" | jq -r .access_token)"

ME=$(curl -s $API/v1/campo/me -H "$HC")
check "flag ligada e chave ausente: fluxo simples" "true|simples" "$(echo "$ME" | jq -r '"\(.features.visit_flow)|\(.visit_flow)"')"
check "/me traz visit_config com os padrões da spec" "opcional|8" "$(echo "$ME" | jq -r '"\(.visit_config.justificativa_distancia)|\(.visit_config.desfazer_segundos)"')"
check "config inválida = VALIDATION_ERROR" "VALIDATION_ERROR" "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"contato_obrigatorio_em":["fechado"]}' | jq -r .error.code)"
check "perfil do chefe salvo (contato em todo resultado)" "4" "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"fluxo_visita":"simples","contato_obrigatorio_em":["cadastrou","ja_usa","retorno","sem_interesse"]}' | jq '.contato_obrigatorio_em | length')"
check "e o contato volta ao padrão (retorno e cadastrou)" "2" "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"contato_obrigatorio_em":["cadastrou","retorno"]}' | jq '.contato_obrigatorio_em | length')"
check "exceção por consultor: completo" "completo" "$(curl -s -X PATCH $API/v1/consultores/$CONS -H "$J" -H "$HD" -d '{"visit_flow":"completo"}' | jq -r .visit_flow_effective)"
check "a exceção vale mais que o global" "completo" "$(curl -s $API/v1/campo/me -H "$HC" | jq -r .visit_flow)"
check "voltar a seguir o padrão" "simples" "$(curl -s -X PATCH $API/v1/consultores/$CONS -H "$J" -H "$HD" -d '{"visit_flow":null}' | jq -r .visit_flow_effective)"

echo "── Modo do chefe: visita simples ──"
J1=$(uuid); V1=$(uuid); V2=$(uuid)
curl -s -o /dev/null -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$J1\",$POS}"
ci(){ curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$1" -F "at=$AGORA" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" --form-string "new_place={\"name\":\"Chefe $SUF $2\",\"address\":\"Rua de Teste, 10\"}" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg"; }
VIS=$(ci "$V1" a)
check "check-in grava o fluxo simples" "simples" "$(echo "$VIS" | jq -r .flow)"
check "só falta o resultado" '["resultado da visita"]' "$(echo "$VIS" | jq -c .missing)"
check "checkout sem resultado = ANSWERS_INCOMPLETE" "422|Falta responder: resultado da visita." "$(curl -s -o /tmp/praca-smoke-cm.json -w '%{http_code}' -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS}")|$(jq -r .error.message /tmp/praca-smoke-cm.json)"
check "resultado inválido = VALIDATION_ERROR" "VALIDATION_ERROR" "$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d '{"result":"talvez"}' | jq -r .error.code)"
R=$(curl -s -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d '{"result":"sem_interesse","refusal_reason":"sem_demanda"}')
check "sem interesse + motivo: campos derivados" "nao_cadastrou|nenhum|false|sem_demanda|0" "$(echo "$R" | jq -r '"\(.answers.freela_status)|\(.answers.interest)|\(.answers.needs_followup)|\(.answers.refusal_reason)|\(.missing | length)"')"
check "as 8 perguntas antigas não foram exigidas: checkout feito" "true" "$(curl -s -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS}" | jq '.checkout_at != null')"
check "a visita concluída aparece no dia, com checkout" "true" "$(curl -s $API/v1/campo/today -H "$HC" | jq '.visits[0].checkout_at != null')"

VIS2=$(ci "$V2" b); LEAD2=$(echo "$VIS2" | jq -r .lead_id)
check "retorno sem data nem contato: falta tudo do padrão" "4" "$(curl -s -X PATCH $API/v1/campo/visits/$V2/answers -H "$J" -H "$HC" -d '{"result":"retorno"}' | jq '.missing | length')"
R2=$(curl -s -X PATCH $API/v1/campo/visits/$V2/answers -H "$J" -H "$HC" -d "{\"followup_date\":\"$AMANHA\",\"followup_time\":\"15:30\",\"interlocutor_name\":\"Marcos\",\"interlocutor_role\":\"dono\",\"contact_phone\":\"(11) 98765-4321\"}")
check "retorno completo: nada falta; derivados" "0|true|Retornar" "$(echo "$R2" | jq -r '"\(.missing | length)|\(.answers.needs_followup)|\(.answers.followup_what)"')"
curl -s -o /dev/null -X POST $API/v1/campo/visits/$V2/checkout -H "$J" -H "$HC" -d "{$POS}"
LEAD=$(curl -s $API/v1/leads/$LEAD2 -H "$HD")
check "CRM: próximo passo 'Retornar' e Conversa aberta" "Retornar|$AMANHA|3" "$(echo "$LEAD" | jq -r '"\(.next_step.what)|\(.next_step.date)|\(.stage)"')"

echo "── Modo do chefe: fechado, mismatch e cancelar ──"
V3=$(uuid); V4=$(uuid)
ci "$V3" c > /dev/null
check "fechado fotografado: conclui sem nada e conta na meta" "true" "$(curl -s -X PATCH $API/v1/campo/visits/$V3/answers -H "$J" -H "$HC" -d '{"result":"fechado"}' | jq '(.missing | length == 0) and (.answers.outcome == "fechado")')"
curl -s -o /dev/null -X POST $API/v1/campo/visits/$V3/checkout -H "$J" -H "$HC" -d "{$POS}"
TODAY=$(curl -s $API/v1/campo/today -H "$HC")
check "meta: o fechado simples entra em 'feitas' (3 de 3); closed continua separado" "3|1" "$(echo "$TODAY" | jq -r '"\(.goal.feitas)|\(.counters.closed)"')"
VIS4=$(ci "$V4" d)
check "cancelar visita aberta por engano" "true" "$(curl -s -X DELETE $API/v1/campo/visits/$V4 -H "$HC" | jq .cancelled)"
check "e ela some do dia" "3" "$(curl -s $API/v1/campo/today -H "$HC" | jq '.visits | length')"
check "cancelar de novo = NOT_FOUND" "NOT_FOUND" "$(curl -s -X DELETE $API/v1/campo/visits/$V4 -H "$HC" | jq -r .error.code)"
check "cancelar visita já concluída = VISIT_CLOSED" "VISIT_CLOSED" "$(curl -s -X DELETE $API/v1/campo/visits/$V3 -H "$HC" | jq -r .error.code)"
curl -s -o /dev/null -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"fluxo_visita":"completo"}'
V5=$(uuid); ci "$V5" e > /dev/null
check "virou completo no meio do dia: a visita nova é completa" "completo" "$(curl -s $API/v1/campo/today -H "$HC" | jq -r --arg v "$V5" '.visits[] | select(.client_id==$v) | .flow')"
check "result em visita completo = FLOW_MODE_MISMATCH" "FLOW_MODE_MISMATCH" "$(curl -s -X PATCH $API/v1/campo/visits/$V5/answers -H "$J" -H "$HC" -d '{"result":"fechado"}' | jq -r .error.code)"
check "a visita simples antiga continua simples depois de virar a chave" "simples" "$(ci "$(uuid)" f >/dev/null 2>&1; curl -s $API/v1/campo/today -H "$HC" | jq -r --arg v "$V1" '.visits[] | select(.client_id==$v) | .flow')"

echo "── limpeza ──"
curl -s -o /dev/null -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"fluxo_visita":null,"contato_obrigatorio_em":["cadastrou","retorno"]}'
docker exec praca-postgres psql -U praca -d praca -qc "delete from field_visits where consultant_id='$CONS'; delete from field_points where journey_id in (select id from field_journeys where consultant_id='$CONS'); delete from field_journeys where consultant_id='$CONS'; delete from lead_events where lead_id in (select id from leads where name like 'Chefe $SUF%'); delete from field_route_stops where lead_id in (select id from leads where name like 'Chefe $SUF%'); delete from leads where name like 'Chefe $SUF%';" > /dev/null 2>&1
curl -s -o /dev/null -X DELETE $API/v1/consultores/$CONS -H "$HD"
check "consultor de teste removido" "0" "$(curl -s $API/v1/consultores -H "$HD" | jq --arg i "$CONS" '[.[] | select(.id==$i)] | length')"
echo
printf 'Resultado: \033[32m%d ok\033[0m, \033[31m%d falha(s)\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
