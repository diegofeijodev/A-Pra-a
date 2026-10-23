#!/usr/bin/env bash
# Smoke do LOTE B do restante da Lovable (contrato §35 checklist, §37 intervalo). Conversa com a API viva (3014) e limpa o que cria.
# Roda SEPARADO do smoke.sh (que cobre as flags desligadas). Suba a API com as flags ligadas, em outro terminal:
#   FIELD_CHECKLIST_ENABLED=true FIELD_BREAKS_ENABLED=true FIELD_DAY_SUMMARY_ENABLED=true FIELD_VISIT_FLOW_SELECT_ENABLED=true \
#   FIELD_ROUTES_ENABLED=true FIELD_EARNINGS_ENABLED=true npm run start:smoke
#   bash scripts/smoke-lovable-b.sh
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
CHAVES="'checklist_items','checklist_obrigatorio','checklist_fluxos','checklist_aberto','intervalo_ativo','intervalo_lembrete_min','alerta_intervalo_min'"

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
HOJE=$(TZ=America/Sao_Paulo date +%F)
# Resolução de segundo (como o aparelho manda em rajada): toda consulta que ordena por horário desempata pelo criado por último.
agora(){ date -u +%Y-%m-%dT%H:%M:%S.000Z; }
LAT=-19.9245; LNG=-43.9352
pos(){ echo "\"at\":\"$(agora)\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"; }
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada.jpg
$PSQL "update app_settings set field_config = field_config - array[$CHAVES] where id = 1" > /dev/null 2>&1

echo "── configuração e features (§35.2, §37.2) ──"
CFG=$(curl -s $API/v1/consultores/settings/config -H "$HD")
check "GET settings/config: checklist e breaks ligados" "true|true" "$(echo "$CFG" | jq -r '"\(.features.checklist)|\(.features.breaks)"')"
check "padrões: 7 etapas da Lovable (cupom), não obrigatório, dois fluxos, aberto; intervalo ativo 60/75" "7|oferecer_cupom|nao|simples,completo|true|true|60|75" \
  "$(echo "$CFG" | jq -r '"\(.checklist_items | length)|\(.checklist_items[4].id)|\(.checklist_obrigatorio)|\(.checklist_fluxos | join(","))|\(.checklist_aberto)|\(.intervalo_ativo)|\(.intervalo_lembrete_min)|\(.alerta_intervalo_min)"')"
check "nenhuma etapa diz voucher" "0" "$(echo "$CFG" | jq '[.checklist_items[].text | ascii_downcase | select(contains("voucher"))] | length')"
NOVA=$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"checklist_items":[{"id":"apresentacao","text":"Apresentação"},{"text":"Etapa nova"}],"checklist_aberto":null}')
check "PUT: etapa nova ganha id do servidor; a enviada mantém" "apresentacao|true|2" "$(echo "$NOVA" | jq -r '"\(.checklist_items[0].id)|\(.checklist_items[1].id | test("^etapa_[0-9a-f]{8}$"))|\(.checklist_items | length)"')"
check "PUT inválido (lista vazia) = VALIDATION_ERROR com o campo" "VALIDATION_ERROR|true" \
  "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"checklist_items":[]}' | jq -r '"\(.error.code)|\(.error.message | startswith("checklist_items:"))"')"
check "PUT inválido (alerta 5 min) = VALIDATION_ERROR" "VALIDATION_ERROR" "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"alerta_intervalo_min":5}' | jq -r .error.code)"
$PSQL "update app_settings set field_config = field_config - array[$CHAVES] where id = 1" > /dev/null 2>&1

echo "── consultor ──"
CPF=$(cpf_valido "$SUF"); EMAIL="lovb$SUF@praca.local"
CRIA=$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"LovB $SUF\",\"email\":\"$EMAIL\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$CPF\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$CPF\"}")
CONS=$(echo "$CRIA" | jq -r .consultant.id); SENHA=$(echo "$CRIA" | jq -r .temp_password)
LOG=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}")
TR=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "Authorization: Bearer $(echo "$LOG" | jq -r .access_token)" -d "{\"current_password\":\"$SENHA\",\"new_password\":\"campoSenha123\"}")
HC="Authorization: Bearer $(echo "$TR" | jq -r .access_token)"
ME=$(curl -s $API/v1/campo/me -H "$HC")
check "/me: features, a lista para sem sinal e o intervalo" "true|true|7|nao|true|60" \
  "$(echo "$ME" | jq -r '"\(.features.checklist)|\(.features.breaks)|\(.checklist_config.items | length)|\(.checklist_config.obrigatorio)|\(.breaks_config.intervalo_ativo)|\(.breaks_config.intervalo_lembrete_min)"')"
curl -s -o /dev/null -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",$(pos)}"
checkin(){ curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$1" -F "at=$(agora)" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" -F "flow=simples" -F "confirm_new=true" --form-string "new_place={\"name\":\"LovB $SUF $2\",\"address\":\"Rua de Teste, 10\"}" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg"; }
rascunho(){ curl -s -X PATCH $API/v1/campo/visits/$1/answers -H "$J" -H "$HC" -d "$2"; }
saida(){ curl -s -X POST $API/v1/campo/visits/$1/checkout -H "$J" -H "$HC" -d "{$(pos)}"; }

echo "── checklist (§35) ──"
V1=$(uuid); VIS1=$(checkin "$V1" "bar")
check "check-in: foto do checklist (7, não obrigatório, nada marcado), fora de answers" "7|nao|0|false" \
  "$(echo "$VIS1" | jq -r '"\(.checklist.total)|\(.checklist.required)|\(.checklist.done)|\(.answers | has("checklist"))"')"
R1=$(rascunho "$V1" '{"result":"ja_usa","checklist":[{"id":"apresentacao","done":true,"note":" ok "},{"id":"nao_existe","done":true}]}')
check "rascunho: marca mesclada, nota aparada, id desconhecido ignorado" "1|ok|7" "$(echo "$R1" | jq -r '"\(.checklist.done)|\(.checklist.items[0].note)|\(.checklist.total)"')"
check "rascunho com checklist: null (o web do completo reenvia) = 200" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $API/v1/campo/visits/$V1/answers -H "$J" -H "$HC" -d '{"result":"ja_usa","checklist":null}')"
check "não obrigatório: 1 toque conclui" "true" "$(saida "$V1" | jq '.checkout_at != null')"
LEAD1=$(echo "$VIS1" | jq -r .lead_id)
check "CRM: só a contagem do roteiro, sem a observação" "true|false" \
  "$(curl -s $API/v1/leads/$LEAD1 -H "$HD" | jq -r '[.events[] | select(.kind=="visit")][0].text | "\(contains("Roteiro da conversa: 1 de 7 etapas."))|\(contains(" ok"))"')"
curl -s -o /dev/null -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"checklist_obrigatorio":"todas"}'
V2=$(uuid); VIS2=$(checkin "$V2" "café")
check "obrigatório: a foto diz 'todas'" "todas" "$(echo "$VIS2" | jq -r .checklist.required)"
rascunho "$V2" '{"result":"ja_usa","checklist":[{"id":"apresentacao","done":true}]}' > /dev/null
check "checkout com etapas faltando = 422 com as posições" "ANSWERS_INCOMPLETE|Falta responder: roteiro da visita (etapas 2, 3, 4, 5, 6, 7)." \
  "$(saida "$V2" | jq -r '"\(.error.code)|\(.error.message)"')"
TODAS=$(echo "$CFG" | jq -c '[.checklist_items[] | {id, done: true}]')
rascunho "$V2" "{\"checklist\":$TODAS}" > /dev/null
check "tudo marcado: conclui" "true" "$(saida "$V2" | jq '.checkout_at != null')"
curl -s -o /dev/null -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"checklist_obrigatorio":"nao"}'

echo "── intervalo (§37) ──"
B1=$(uuid)
S1=$(curl -s -X POST $API/v1/campo/journeys/current/breaks/start -H "$J" -H "$HC" -d "{\"client_id\":\"$B1\",\"at\":\"$(agora)\"}")
check "início: intervalo aberto" "null|0" "$(echo "$S1" | jq -r '"\(.ended_at)|\(.minutes)"')"
check "reenvio do mesmo início = o mesmo intervalo" "$(echo "$S1" | jq -r .id)" "$(curl -s -X POST $API/v1/campo/journeys/current/breaks/start -H "$J" -H "$HC" -d "{\"client_id\":\"$B1\",\"at\":\"$(agora)\"}" | jq -r .id)"
check "outro início com um aberto = BREAK_ALREADY_OPEN" "409|BREAK_ALREADY_OPEN" \
  "$(curl -s -o /tmp/praca-smoke-b.json -w '%{http_code}' -X POST $API/v1/campo/journeys/current/breaks/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"at\":\"$(agora)\"}")|$(jq -r .error.code /tmp/praca-smoke-b.json)"
check "Hoje: breaks e breaks_open; a meta conta o intervalo real" "1|true|true" \
  "$(curl -s $API/v1/campo/today -H "$HC" | jq -r '"\(.breaks | length)|\(.breaks_open != null)|\(.goal.conta | contains("descontado o intervalo registrado"))"')"
check "Atenção agora: on_break_since do consultor" "true" "$(curl -s $API/v1/consultores/attention -H "$HD" | jq --arg c "$CONS" '[.consultants[] | select(.consultant_id==$c)][0].on_break_since != null')"
JID=$($PSQL "select journey_id from field_journey_breaks where client_id='$B1'" | tr -d '[:space:]')
$PSQL "insert into field_journey_breaks (id, journey_id, consultant_id, client_id, started_at) values (gen_random_uuid(), '$JID', '$CONS', gen_random_uuid(), now())" > /dev/null 2>&1
RC_INDICE=$?
check "índice parcial: um 2º intervalo aberto na mesma jornada é recusado pelo banco (WHERE ended_at IS NULL)" "1|t" \
  "$RC_INDICE|$($PSQL "select indexdef like '%WHERE (ended_at IS NULL)%' from pg_indexes where indexname='field_journey_breaks_one_open_per_journey'" | tr -d '[:space:]')"
V3=$(uuid); checkin "$V3" "padaria" > /dev/null
check "check-in durante o intervalo o encerra (checkin)" "checkin|false" \
  "$(curl -s $API/v1/campo/today -H "$HC" | jq -r '"\(.breaks[0].end_reason)|\(.breaks_open != null)"')"
check "fim que estava na fila depois do check-in = 200 (sem erro na fila)" "200|checkin" \
  "$(curl -s -o /tmp/praca-smoke-b.json -w '%{http_code}' -X POST $API/v1/campo/journeys/current/breaks/end -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"at\":\"$(agora)\"}")|$(jq -r .end_reason /tmp/praca-smoke-b.json)"
check "início com visita aberta = VISIT_OPEN" "VISIT_OPEN" "$(curl -s -X POST $API/v1/campo/journeys/current/breaks/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"at\":\"$(agora)\"}" | jq -r .error.code)"
rascunho "$V3" '{"result":"ja_usa"}' > /dev/null; saida "$V3" > /dev/null
B2=$(uuid); curl -s -o /dev/null -X POST $API/v1/campo/journeys/current/breaks/start -H "$J" -H "$HC" -d "{\"client_id\":\"$B2\",\"at\":\"$(agora)\"}"
E2=$(uuid)
check "fim manual" "manual" "$(curl -s -X POST $API/v1/campo/journeys/current/breaks/end -H "$J" -H "$HC" -d "{\"client_id\":\"$E2\",\"at\":\"$(agora)\"}" | jq -r .end_reason)"
check "reenvio do mesmo fim = o mesmo" "manual" "$(curl -s -X POST $API/v1/campo/journeys/current/breaks/end -H "$J" -H "$HC" -d "{\"client_id\":\"$E2\",\"at\":\"$(agora)\"}" | jq -r .end_reason)"
check "fim sem intervalo aberto (último manual) = NO_OPEN_BREAK" "409|NO_OPEN_BREAK" \
  "$(curl -s -o /tmp/praca-smoke-b.json -w '%{http_code}' -X POST $API/v1/campo/journeys/current/breaks/end -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"at\":\"$(agora)\"}")|$(jq -r .error.code /tmp/praca-smoke-b.json)"
RD=$(curl -s $API/v1/campo/day-summary -H "$HC")
check "resumo do dia: intervalo registrado e tempo trabalhado = dia − intervalo" "true|true" \
  "$(echo "$RD" | jq -r '"\(.intervalo_min != null)|\(.trabalhado_min == (.total_min - .intervalo_min))"')"
curl -s -o /dev/null -X POST $API/v1/campo/journeys/current/breaks/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"at\":\"$(agora)\"}"
curl -s -o /dev/null -X POST $API/v1/campo/journeys/current/end -H "$J" -H "$HC" -d "{$(pos)}"
check "fim da jornada encerra o intervalo aberto (journey_end)" "journey_end|3" \
  "$($PSQL "select end_reason from field_journey_breaks where consultant_id='$CONS' order by started_at desc, created_at desc limit 1" | tr -d '[:space:]')|$($PSQL "select count(*) from field_journey_breaks where consultant_id='$CONS'" | tr -d '[:space:]')"

echo "── diária com tempo trabalhado mínimo (§37.6) ──"
EC=$(curl -s $API/v1/consultores/earnings/config -H "$HD")
check "GET earnings/config: features.breaks_enabled" "true" "$(echo "$EC" | jq -r .features.breaks_enabled)"
REGRA=$(echo "$EC" | jq -c '.current.config + {daily_base_cents: 15000, daily_base_condition: "journey_open", daily_base_min_worked_minutes: 360}')
check "simulador: 5h trabalhadas com mínimo de 6h = sem diária, com a conta" "0|true" \
  "$(curl -s -X POST $API/v1/consultores/earnings/simulate -H "$J" -H "$HD" -d "{\"config\":$REGRA,\"signups_confirmed\":0,\"journey_open\":true,\"worked_minutes\":300}" | jq -r '"\(.day.total_cents)|\(.day.conta | join(" ") | contains("o mínimo é 6h00"))"')"
check "simulador: 6h01 = diária" "15000" \
  "$(curl -s -X POST $API/v1/consultores/earnings/simulate -H "$J" -H "$HD" -d "{\"config\":$REGRA,\"signups_confirmed\":0,\"journey_open\":true,\"worked_minutes\":361}" | jq -r .day.total_cents)"

echo "── limpeza ──"
$PSQL "update app_settings set field_config = field_config - array[$CHAVES] where id = 1" > /dev/null 2>&1
$PSQL "delete from field_visits where consultant_id='$CONS'; delete from field_points where journey_id in (select id from field_journeys where consultant_id='$CONS'); delete from field_journeys where consultant_id='$CONS'; delete from lead_events where lead_id in (select id from leads where name like 'LovB $SUF%'); delete from leads where name like 'LovB $SUF%';" > /dev/null 2>&1
curl -s -o /dev/null -X DELETE $API/v1/consultores/$CONS -H "$HD"
check "consultor de teste removido (e os intervalos, em cascata)" "0|0" \
  "$(curl -s $API/v1/consultores -H "$HD" | jq --arg i "$CONS" '[.[] | select(.id==$i)] | length')|$($PSQL "select count(*) from field_journey_breaks where consultant_id='$CONS'" | tr -d '[:space:]')"
check "nenhuma chave do lote B sobrou na configuração" "0" "$($PSQL "select count(*) from app_settings, jsonb_object_keys(field_config) k where k in ($CHAVES)" | tr -d '[:space:]')"

echo
echo "$PASS ok, $FAIL falha(s)"
[ "$FAIL" -eq 0 ]
