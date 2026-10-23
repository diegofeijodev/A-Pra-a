#!/usr/bin/env bash
# Smoke do LOTE A do restante da Lovable (contrato §23.1, §28.5, §33, §34). Conversa com a API viva (3014) e limpa o que cria.
# Roda SEPARADO do smoke.sh (que cobre as flags desligadas). Suba a API com as flags ligadas, em outro terminal:
#   FIELD_DASHBOARD_ENABLED=true FIELD_DAY_SUMMARY_ENABLED=true FIELD_MAP_PINS_ENABLED=true \
#   FIELD_ROUTES_ENABLED=true FIELD_EARNINGS_ENABLED=true npm run start:smoke
#   bash scripts/smoke-lovable-a.sh
# Também roda com as flags dos lotes B, C e D ligadas juntas (o cartão de cupons é conferido pelo `features.vouchers` da própria API),
# mas SEM FIELD_VISIT_FLOW_SELECT_ENABLED: com ela o fluxo padrão é o simples e este smoke manda o corpo do fluxo completo.
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
CHAVES="'raio_checkin_m','ui_resumo_dia','nota_peso_rota','nota_peso_conversao','nota_meta_conversao_pct','nota_intervalo_alerta_min','painel_tempo_medio','painel_gap_max_min'"

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
HOJE=$(TZ=America/Sao_Paulo date +%F)
AMANHA=$(TZ=America/Sao_Paulo date -d tomorrow +%F)
AGORA=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
LAT=-19.9245; LNG=-43.9352
# 230 m ao norte (1° de latitude = 6.371.000 × π/180 m, a régua do distanciaM).
LAT_230=$(node -e "console.log(($LAT + 230 / (6371000 * Math.PI / 180)).toFixed(7))")
POS="\"at\":\"$AGORA\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada.jpg
# Começa limpo (rodada interrompida não deixa chave gravada).
$PSQL "update app_settings set field_config = field_config - array[$CHAVES] where id = 1" > /dev/null 2>&1

echo "── configuração e features (§23.1, §33.1, §33.2) ──"
CFG=$(curl -s $API/v1/consultores/settings/config -H "$HD")
check "GET settings/config traz as três features ligadas" "true|true|true" "$(echo "$CFG" | jq -r '"\(.features.dashboard)|\(.features.day_summary)|\(.features.map_pins)"')"
check "padrões: raio 200, nota 7/3/30%, painel 'intervalo' 120 min" "200|nota|7|3|30|75|intervalo|120" \
  "$(echo "$CFG" | jq -r '"\(.raio_checkin_m)|\(.ui_resumo_dia)|\(.nota_peso_rota)|\(.nota_peso_conversao)|\(.nota_meta_conversao_pct)|\(.nota_intervalo_alerta_min)|\(.painel_tempo_medio)|\(.painel_gap_max_min)"')"
check "pesos que não somam 10 = VALIDATION_ERROR com a conta" "VALIDATION_ERROR|true" \
  "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"nota_peso_rota":6}' | jq -r '"\(.error.code)|\(.error.message | contains("6 + 3 = 9"))"')"
check "raio fora da faixa = VALIDATION_ERROR" "VALIDATION_ERROR" "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"raio_checkin_m":20}' | jq -r .error.code)"
check "PUT raio 250 com as outras chaves novas nulas" "250|7" \
  "$(curl -s -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"raio_checkin_m":250,"nota_peso_rota":null,"ui_resumo_dia":null}' | jq -r '"\(.raio_checkin_m)|\(.nota_peso_rota)"')"

echo "── consultor ──"
CPF=$(cpf_valido "$SUF"); EMAIL="lova$SUF@praca.local"
CRIA=$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"LovA $SUF\",\"email\":\"$EMAIL\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$CPF\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$CPF\"}")
CONS=$(echo "$CRIA" | jq -r .consultant.id); SENHA=$(echo "$CRIA" | jq -r .temp_password)
LOG=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}")
TR=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "Authorization: Bearer $(echo "$LOG" | jq -r .access_token)" -d "{\"current_password\":\"$SENHA\",\"new_password\":\"campoSenha123\"}")
HC="Authorization: Bearer $(echo "$TR" | jq -r .access_token)"
check "/me: day_summary e map_pins ligados" "true|true" "$(curl -s $API/v1/campo/me -H "$HC" | jq -r '"\(.features.day_summary)|\(.features.map_pins)"')"
check "token de consultor no painel da equipe = 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' $API/v1/consultores/dashboard -H "$HC")"
check "token de consultor nos pinos da equipe = 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' $API/v1/consultores/map/pins -H "$HC")"
check "token de consultor no resumo da equipe = 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' $API/v1/consultores/$CONS/days/$HOJE/summary -H "$HC")"

curl -s -o /dev/null -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",$POS}"
RESPOSTAS='{"interlocutor_name":"Maria","interlocutor_role":"gerente","freela_status":"ja_usa","interest":"medio","open_vagas":0,"freelas_per_week":0,"channels":["Nenhum"],"needs_followup":false}'
concluir(){ curl -s -o /dev/null -X PATCH $API/v1/campo/visits/$1/answers -H "$J" -H "$HC" -d "$RESPOSTAS"; curl -s -X POST $API/v1/campo/visits/$1/checkout -H "$J" -H "$HC" -d "{$POS}"; }
V1=$(uuid)
VIS1=$(curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$V1" -F "at=$AGORA" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" --form-string "new_place={\"name\":\"LovA $SUF bar\",\"address\":\"Rua de Teste, 10\"}" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg")
LEAD1=$(echo "$VIS1" | jq -r .lead_id)
check "visita 1 concluída" "true" "$(concluir "$V1" | jq '.checkout_at != null')"

echo "── raio do check-in (§23.1, L0) ──"
V2=$(uuid)
VIS2=$(curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$V2" -F "at=$AGORA" -F "lat=$LAT_230" -F "lng=$LNG" -F "accuracy=12" -F "lead_id=$LEAD1" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg")
check "230 m com raio 250: não é longe" "false|230" "$(echo "$VIS2" | jq -r '"\(.far_from_place)|\(.distance_m)"')"
concluir "$V2" > /dev/null
curl -s -o /dev/null -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"raio_checkin_m":200}'
V3=$(uuid)
VIS3=$(curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$V3" -F "at=$AGORA" -F "lat=$LAT_230" -F "lng=$LNG" -F "accuracy=12" -F "lead_id=$LEAD1" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg")
check "230 m com o padrão (200): longe, como hoje" "true|230" "$(echo "$VIS3" | jq -r '"\(.far_from_place)|\(.distance_m)"')"
concluir "$V3" > /dev/null
check "a visita 2 continua como nasceu (a marca é do check-in)" "false" "$(curl -s $API/v1/campo/today -H "$HC" | jq -r --arg v "$V2" '.visits[] | select(.client_id==$v) | .far_from_place')"

echo "── resumo do dia (§33.5) ──"
RD=$(curl -s $API/v1/campo/day-summary -H "$HC")
check "resumo de hoje: nota, sem roteiro = meta 30, 3 visitas concluídas, dia aberto" "$HOJE|nota|meta|30|3|true" \
  "$(echo "$RD" | jq -r '"\(.day)|\(.display)|\(.planned_source)|\(.planned)|\(.visits_done)|\(.day_open)"')"
check "confirmados com o sync desligado: 0 cadastros e a conta avisa a nota máxima 7" "0|freela_confirmed|true" \
  "$(echo "$RD" | jq -r '"\(.signups)|\(.signups_source)|\([.conta[]] | any(contains("a nota máxima é 7")))"')"
check "nota = parcelas (3 de 30 × 7 = 0,70 → 0,7)" "0.7|0.7|0" "$(echo "$RD" | jq -r '"\(.nota)|\(.partes.rota)|\(.partes.conversao)"')"
check "a conta diz a hora do cálculo" "true" "$(echo "$RD" | jq '[.conta[]] | any(startswith("Calculado às "))')"
check "dia no futuro = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/campo/day-summary?day=$AMANHA" -H "$HC")"
check "equipe lê o resumo do consultor" "LovA $SUF|3" "$(curl -s $API/v1/consultores/$CONS/days/$HOJE/summary -H "$HD" | jq -r '"\(.consultant_name)|\(.visits_done)"')"
check "equipe: consultor inexistente = 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' $API/v1/consultores/$(uuid)/days/$HOJE/summary -H "$HD")"
curl -s -o /dev/null -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"ui_resumo_dia":"numeros"}'
check "'numeros' (nossa versão): sem nota, números continuam" "null|null|3" "$(curl -s $API/v1/campo/day-summary -H "$HC" | jq -r '"\(.nota)|\(.partes)|\(.visits_done)"')"
curl -s -o /dev/null -X PUT $API/v1/consultores/settings/config -H "$J" -H "$HD" -d '{"ui_resumo_dia":"nota"}'

echo "── painel (§33.4) ──"
PN=$(curl -s "$API/v1/consultores/dashboard?praca_id=$PRACA_SEED" -H "$HD")
check "painel de hoje: 3+ visitas, barras somam as visitas, 8 contas e 8 fontes" "true|true|8|8" \
  "$(echo "$PN" | jq -r '"\(.kpis.visits >= 3)|\(([.by_result[].n] | add) == .kpis.visits)|\(.conta | keys | length)|\(.fonte | keys | length)"')"
check "o consultor de teste aparece no ranking com 3 visitas" "3" "$(echo "$PN" | jq --arg c "$CONS" '.ranking[] | select(.consultant_id==$c) | .visits')"
if [ "$(echo "$CFG" | jq -r '.features.vouchers')" = "true" ]; then
  # Cupons (lote C) ligados nesta API: o cartão traz o resumo dos pedidos, com a conta que soma as parcelas (detalhe no smoke-lovable-c).
  check "cupom (cupons ligados): objeto, as parcelas somam os pedidos e a conta diz isso" "true|true|true" \
    "$(echo "$PN" | jq -r '"\(.kpis.vouchers | type == "object")|\(.kpis.vouchers.requested == (.kpis.vouchers.approved + .kpis.vouchers.pending + .kpis.vouchers.rejected))|\(.conta.vouchers | test("pedidos? no período"))"')"
else
  check "cupom: não ligado (nunca 0)" "null|Não ligado neste servidor." "$(echo "$PN" | jq -r '"\(.kpis.vouchers)|\(.conta.vouchers)"')"
fi
check "período acima de 92 dias = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/consultores/dashboard?from=2026-01-01&to=$HOJE" -H "$HD")"
check "praça inexistente = 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/consultores/dashboard?praca_id=$(uuid)" -H "$HD")"

echo "── pinos (§34) ──"
# Mais um estabelecimento visitado por ele e um que ele NUNCA visitou (só no banco de teste), para o isolamento e o cursor.
V4=$(uuid)
curl -s -o /dev/null -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$V4" -F "at=$AGORA" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" -F "confirm_new=true" --form-string "new_place={\"name\":\"LovA $SUF café\",\"address\":\"Rua de Teste, 20\"}" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg"
concluir "$V4" > /dev/null
$PSQL "insert into leads (id, praca_id, name, entered_at, stage_since, lat, lng) values (gen_random_uuid(), '$PRACA_SEED', 'LovA $SUF outro', '$HOJE', '$HOJE', -19.93, -43.94)" > /dev/null
OUTRO=$($PSQL "select id from leads where name = 'LovA $SUF outro'" | tr -d '[:space:]')
P1=$(curl -s "$API/v1/consultores/map/pins?praca_id=$PRACA_SEED" -H "$HD")
TOTAL=$(echo "$P1" | jq .total)
check "legenda: 7 situações, soma = total" "7|true" "$(echo "$P1" | jq -r '"\(.legend | length)|\(([.legend[].n] | add) == .total)"')"
check "o estabelecimento visitado aparece como 'Já usa o Freela'" "ja_usa" "$(echo "$P1" | jq -r --arg l "$LEAD1" '.pins[] | select(.[0]==$l) | .[3]')"
check "o que ninguém visitou aparece como 'A visitar'" "a_visitar" "$(echo "$P1" | jq -r --arg l "$OUTRO" '.pins[] | select(.[0]==$l) | .[3]')"
POR=$(( TOTAL > 8 ? TOTAL / 4 + 1 : 1 )); SOMA=0; CUR=""; VOLTAS=0
while :; do
  PG=$(curl -s "$API/v1/consultores/map/pins?praca_id=$PRACA_SEED&limit=$POR${CUR:+&cursor=$CUR}" -H "$HD")
  SOMA=$(( SOMA + $(echo "$PG" | jq '.pins | length') )); CUR=$(echo "$PG" | jq -r '.next_cursor // empty'); VOLTAS=$((VOLTAS+1))
  [ -z "$CUR" ] || [ "$VOLTAS" -gt 20 ] && break
done
check "soma das páginas (cursor) = total, em mais de uma página" "$TOTAL|true" "$SOMA|$([ "$VOLTAS" -gt 1 ] && echo true || echo false)"
check "modo etapa: 8 etapas do funil" "8|true" "$(curl -s "$API/v1/consultores/map/pins?praca_id=$PRACA_SEED&mode=estagio" -H "$HD" | jq -r '"\(.legend | length)|\(([.legend[].n] | add) == .total)"')"
DET=$(curl -s $API/v1/consultores/map/pins/$LEAD1 -H "$HD")
check "balão: situação, última visita e sem telefone inteiro" "ja_usa|LovA $SUF|0" "$(echo "$DET" | jq -r '"\(.category.code)|\(.last_visit.consultant_name)"')|$(echo "$DET" | grep -c '99999-0000')"
check "detalhe de id malformado = 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' $API/v1/consultores/map/pins/nao-e-uuid -H "$HD")"
check "bbox inválido = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/consultores/map/pins?bbox=1,2" -H "$HD")"
PC=$(curl -s $API/v1/campo/map/pins -H "$HC")
check "consultor vê só o que passou por ele (2 estabelecimentos, sem o 'outro')" "2|0" "$(echo "$PC" | jq -r --arg o "$OUTRO" '"\(.total)|\([.pins[] | select(.[0]==$o)] | length)"')"

echo "── versão inicial da regra (§28.5, L0) ──"
EC=$(curl -s $API/v1/consultores/earnings/config -H "$HD")
check "versão 1: is_initial, valid_from intocado e installed_at" "true|1970-01-01|true" \
  "$(echo "$EC" | jq -r '"\(.current.is_initial)|\(.current.valid_from)|\(.current.installed_at == .current.created_at)"')"

echo "── limpeza ──"
$PSQL "update app_settings set field_config = field_config - array[$CHAVES] where id = 1" > /dev/null 2>&1
$PSQL "delete from field_visits where consultant_id='$CONS'; delete from field_points where journey_id in (select id from field_journeys where consultant_id='$CONS'); delete from field_journeys where consultant_id='$CONS'; delete from lead_events where lead_id in (select id from leads where name like 'LovA $SUF%'); delete from leads where name like 'LovA $SUF%';" > /dev/null 2>&1
curl -s -o /dev/null -X DELETE $API/v1/consultores/$CONS -H "$HD"
check "consultor de teste removido" "0" "$(curl -s $API/v1/consultores -H "$HD" | jq --arg i "$CONS" '[.[] | select(.id==$i)] | length')"
check "nenhuma chave do lote A sobrou na configuração" "0" "$($PSQL "select count(*) from app_settings, jsonb_object_keys(field_config) k where k in ($CHAVES)" | tr -d '[:space:]')"
echo
printf 'Resultado: \033[32m%d ok\033[0m, \033[31m%d falha(s)\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
