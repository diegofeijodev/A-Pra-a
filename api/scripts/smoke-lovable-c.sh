#!/usr/bin/env bash
# Smoke do LOTE C do restante da Lovable (contrato §36 segmentos, §38 cupons da 1ª contratação). Conversa com a API viva (3014)
# e limpa o que cria. Roda SEPARADO do smoke.sh (que cobre as flags desligadas). NUNCA fala com um Freela de verdade nem com o
# Overpass público: suba a API, em outro terminal, com a conexão do Freela VAZIA e o Overpass num endereço morto:
#   FREELA_API_URL= FREELA_ADMIN_EMAIL= FREELA_ADMIN_PASSWORD= OVERPASS_URL=http://127.0.0.1:9/api/interpreter \
#   FIELD_SEGMENTS_ENABLED=true FIELD_VOUCHERS_ENABLED=true FIELD_VOUCHER_COUPONS_ENABLED=true FIELD_DASHBOARD_ENABLED=true \
#   FIELD_DAY_SUMMARY_ENABLED=true FIELD_VISIT_FLOW_SELECT_ENABLED=true FIELD_ROUTES_ENABLED=true FIELD_EARNINGS_ENABLED=true \
#   npm run start:smoke
#   bash scripts/smoke-lovable-c.sh
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
T=/tmp/praca-smoke-c.json

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
agora(){ date -u +%Y-%m-%dT%H:%M:%S.000Z; }
LAT=-19.9245; LNG=-43.9352
pos(){ echo "\"at\":\"$(agora)\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"; }

echo "── trava: nunca um Freela de verdade ──"
FST=$(curl -s $API/v1/freela/status -H "$HD" | jq -r .configured)
if [ "$FST" != "false" ]; then
  echo "  ✗ a API está com a conexão do Freela CONFIGURADA (configured=$FST). Suba com FREELA_API_URL= FREELA_ADMIN_EMAIL= FREELA_ADMIN_PASSWORD= (veja o cabeçalho)."
  exit 1
fi
ok "conexão do Freela vazia (nenhum cupom sai daqui)"

# Faxina de entrada: resíduo de rodada interrompida (consultores lovc*, configuração do cupom, segmentos).
$PSQL "set session_replication_role = replica; delete from field_voucher_events where voucher_id in (select v.id from field_vouchers v join field_consultants c on c.id = v.consultant_id where c.email like 'lovc%@praca.local'); delete from field_vouchers where consultant_id in (select id from field_consultants where email like 'lovc%@praca.local'); update app_settings set field_config = field_config - 'voucher', place_segments = null where id = 1;" > /dev/null 2>&1

echo "── features (§36.1, §38.1) ──"
check "GET settings/config: segments, vouchers e voucher_coupons ligados" "true|true|true" \
  "$(curl -s $API/v1/consultores/settings/config -H "$HD" | jq -r '"\(.features.segments)|\(.features.vouchers)|\(.features.voucher_coupons)"')"

echo "── segmentos (§36) ──"
SG=$(curl -s $API/v1/place-searches/segments -H "$HD")
check "GET: os 10 padrão, todos ativos, is_default" "10|10|true|true" \
  "$(echo "$SG" | jq -r '"\(.segments | length)|\([.segments[] | select(.active)] | length)|\(.is_default)|\([.segments[].slug] | index("pizzaria") != null)"')"
SEM_BAR=$(echo "$SG" | jq -c '{segments: [.segments[] | select(.slug != "bar")]}')
check "PUT sem 'bar' = 400 (só desativar)" "400|segments: o segmento 'bar' não pode ser apagado; desative-o." \
  "$(curl -s -o $T -w '%{http_code}' -X PUT $API/v1/place-searches/segments -H "$J" -H "$HD" -d "$SEM_BAR")|$(jq -r .error.message $T)"
INJ=$(echo "$SG" | jq -c '{segments: (.segments + [{slug:"inj",label:"Inj",filters:[[{key:"amenity",op:"=",value:"bar\"];out;"}]],keywords:[],priority:5,active:true}])}')
check "PUT com QL injetado = 400 VALIDATION_ERROR com o campo" "VALIDATION_ERROR|true" \
  "$(curl -s -X PUT $API/v1/place-searches/segments -H "$J" -H "$HD" -d "$INJ" | jq -r '"\(.error.code)|\(.error.message | startswith("segments[10].filters[0][0].value:"))"')"
NOVO=$(echo "$SG" | jq -c '{segments: (.segments + [{slug:"sorveteria",label:"Sorveteria",filters:[[{key:"amenity",op:"=",value:"ice_cream"}]],keywords:[],priority:15,active:true}])}')
check "PUT com segmento novo: is_default false, 11 segmentos" "false|11" \
  "$(curl -s -X PUT $API/v1/place-searches/segments -H "$J" -H "$HD" -d "$NOVO" | jq -r '"\(.is_default)|\(.segments | length)"')"
AREA=$(curl -s -X POST $API/v1/areas -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"LovC $SUF\",\"lat\":$LAT,\"lng\":$LNG,\"radius_m\":600}" | jq -r .id)
RUN=$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/place-searches -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"area_id\":\"$AREA\",\"types\":[\"pizzaria\",\"hotel\"]}")
RUN_ID=$(jq -r .id $T)
check "busca com segmentos novos = 202, tipos ordenados" "202|hotel,pizzaria" "$RUN|$(jq -r '.types | join(",")' $T)"
curl -s -o /dev/null -X POST "$API/v1/place-searches/$RUN_ID/cancel?praca_id=$PRACA_SEED" -H "$HD"
check "a busca fotografou os segmentos pedidos (segments_snapshot)" "hotel,pizzaria" \
  "$($PSQL "select string_agg(s->>'slug', ',' order by s->>'slug') from place_import_runs, jsonb_array_elements(segments_snapshot) s where id='$RUN_ID'" | tr -d '[:space:]')"
CHAVE_HOJE=$(node -e 'const c=require("crypto");console.log(c.createHash("sha256").update(JSON.stringify(["osm",Number(process.argv[1]),Number(process.argv[2]),600,["hotel","pizzaria"]])).digest("hex").slice(0,40))' -- "$LAT" "$LNG")
[ ${#CHAVE_HOJE} -eq 40 ] || ko "fórmula de hoje da chave do cache" "não calculou (veio '$CHAVE_HOJE')"
check "a chave do cache leva o hash da foto (≠ da fórmula de hoje)" "true" \
  "$([ "$($PSQL "select cache_key from place_import_runs where id='$RUN_ID'" | tr -d '[:space:]')" != "$CHAVE_HOJE" ] && echo true || echo false)"
check "tipo que não é segmento ativo = 400 com a frase" "400|types: 'nao_existe' não é um segmento ativo da busca." \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/place-searches -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"area_id\":\"$AREA\",\"types\":[\"nao_existe\"]}")|$(jq -r .error.message $T)"

echo "── consultor e visitas ──"
CPF=$(cpf_valido "$SUF"); EMAIL="lovc$SUF@praca.local"
CRIA=$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"LovC $SUF\",\"email\":\"$EMAIL\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$CPF\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$CPF\"}")
CONS=$(echo "$CRIA" | jq -r .consultant.id); SENHA=$(echo "$CRIA" | jq -r .temp_password)
LOG=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}")
TR=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "Authorization: Bearer $(echo "$LOG" | jq -r .access_token)" -d "{\"current_password\":\"$SENHA\",\"new_password\":\"campoSenha123\"}")
HC="Authorization: Bearer $(echo "$TR" | jq -r .access_token)"
check "/me: features.vouchers e o desconto/validade para a tela sem sinal" "true|PERCENT|100|30|true" \
  "$(curl -s $API/v1/campo/me -H "$HC" | jq -r '"\(.features.vouchers)|\(.voucher_config.discount_type)|\(.voucher_config.percent_off)|\(.voucher_config.validade_dias)|\(.voucher_config.coupons)"')"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-c.jpg
curl -s -o /dev/null -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",$(pos)}"
checkin(){ curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$1" -F "at=$(agora)" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" -F "flow=simples" -F "confirm_new=true" --form-string "new_place={\"name\":\"LovC $SUF $2\",\"address\":\"Rua de Teste, 10\"}" -F "photo=@/tmp/praca-smoke-c.jpg;type=image/jpeg"; }
saida(){ curl -s -o /dev/null -X PATCH $API/v1/campo/visits/$1/answers -H "$J" -H "$HC" -d '{"result":"ja_usa"}'; curl -s -o /dev/null -X POST $API/v1/campo/visits/$1/checkout -H "$J" -H "$HC" -d "{$(pos)}"; }
V1=$(uuid); LEAD1=$(checkin "$V1" "padaria" | jq -r .lead_id); saida "$V1"
V2=$(uuid); LEAD2=$(checkin "$V2" "bar" | jq -r .lead_id); saida "$V2"

echo "── pedido do consultor (§38.3) ──"
P1=$(uuid)
PED=$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/campo/vouchers -H "$J" -H "$HC" -d "{\"client_id\":\"$P1\",\"lead_id\":null,\"visit_ref\":\"$V1\",\"segment\":\"Padaria\",\"freelas_per_week\":3,\"uf\":null,\"city\":null}")
VC1=$(jq -r .id $T)
check "pedido pela visita (client_id), nulos = ausentes: 201, nome do lugar, cidade/UF da praça, sem código" "201|LovC $SUF padaria|$LEAD1|pedido|null" \
  "$PED|$(jq -r '"\(.company_name)|\(.lead_id)|\(.situacao)|\(.coupon_code)"' $T)"
check "reenvio do mesmo client_id (fila) = 200 e o mesmo pedido" "200|$VC1" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/campo/vouchers -H "$J" -H "$HC" -d "{\"client_id\":\"$P1\",\"visit_ref\":\"$V1\",\"segment\":\"Padaria\",\"freelas_per_week\":3}")|$(jq -r .id $T)"
check "segundo pedido do mesmo estabelecimento = 409 VOUCHER_LIMIT_REACHED (quem pediu e quando)" "409|VOUCHER_LIMIT_REACHED|true" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/campo/vouchers -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"lead_id\":\"$LEAD1\",\"segment\":\"Padaria\",\"freelas_per_week\":1}")|$(jq -r '"\(.error.code)|\(.error.message | startswith("Esta empresa já tem um cupom pedido, por LovC"))"' $T)"
check "lead malformado = 404; campo a mais = 400" "404|400" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/campo/vouchers -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"lead_id\":\"x\",\"segment\":\"Bar\",\"freelas_per_week\":1}")|$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/campo/vouchers -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"lead_id\":\"$LEAD2\",\"segment\":\"Bar\",\"freelas_per_week\":1,\"phone\":\"31999990000\"}")"
# Concorrência: dois pedidos do MESMO estabelecimento ao mesmo tempo (advisory lock por lead).
curl -s -o /tmp/praca-smoke-c-a.json -w '%{http_code}\n' -X POST $API/v1/campo/vouchers -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"lead_id\":\"$LEAD2\",\"segment\":\"Bar\",\"freelas_per_week\":5}" > /tmp/praca-smoke-c-a.code &
curl -s -o /tmp/praca-smoke-c-b.json -w '%{http_code}\n' -X POST $API/v1/campo/vouchers -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"lead_id\":\"$LEAD2\",\"segment\":\"Bar\",\"freelas_per_week\":5}" > /tmp/praca-smoke-c-b.code &
wait
check "limite sob concorrência: um 201 e um 409" "201,409" "$(cat /tmp/praca-smoke-c-a.code /tmp/praca-smoke-c-b.code | sort | paste -sd,)"
VC2=$(jq -r 'select(.id != null) | .id' /tmp/praca-smoke-c-a.json /tmp/praca-smoke-c-b.json | head -1)
check "no banco, um pedido ativo só para o estabelecimento" "1" "$($PSQL "select count(*) from field_vouchers where lead_id='$LEAD2'" | tr -d '[:space:]')"
check "GET /v1/campo/vouchers: os dois dele" "2" "$(curl -s $API/v1/campo/vouchers -H "$HC" | jq '.items | length')"

echo "── equipe (§38.4) ──"
L=$(curl -s "$API/v1/consultores/vouchers?consultant_id=$CONS" -H "$HD")
check "lista: 2 pedidos, contagem por situação, cupom ligado e Freela sem conexão" "2|2|2|true|false" \
  "$(echo "$L" | jq -r '"\(.items | length)|\(.counts.pedido)|\(.counts.todos)|\(.coupons_enabled)|\(.freela_configured)"')"
check "detalhe com o evento do pedido (sem telefone nem e-mail)" "requested|consultor|false" \
  "$(curl -s $API/v1/consultores/vouchers/$VC1 -H "$HD" | jq -r '"\(.events[0].type)|\(.events[0].actor_kind)|\(tostring | test("99999|@praca"))"')"
check "token de consultor na rota da equipe = 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' $API/v1/consultores/vouchers -H "$HC")"
AP=$(uuid)
APR=$(curl -s -X POST $API/v1/consultores/vouchers/$VC1/approve -H "$J" -H "$HD" -d "{\"client_id\":\"$AP\",\"note\":null,\"contractor_user_id\":\"smoke-u1-$SUF\",\"contractor_name\":\"Padaria Smoke\"}")
check "aprovar com o contratante: aguardando conexão com o Freela, código PRACA- para a equipe" "aguardando_freela|FREELA_NOT_CONFIGURED|Aprovado — aguardando conexão com o Freela.|true|manual" \
  "$(echo "$APR" | jq -r '"\(.situacao)|\(.coupon_error_code)|\(.coupon_error)|\(.coupon_code | test("^PRACA-[A-Z2-7]{10}$"))|\(.contractor_source)"')"
check "o consultor vê 'aguardando o Freela' e ainda sem código" "aguardando_freela|null|100" \
  "$(curl -s $API/v1/campo/vouchers -H "$HC" | jq -r --arg i "$VC1" '.items[] | select(.id==$i) | "\(.situacao)|\(.coupon_code)|\(.coupon.percent_off)"')"
check "reenvio da aprovação (mesmo client_id) = 200; outro client_id = 409 INVALID_TRANSITION" "200|409|INVALID_TRANSITION" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/consultores/vouchers/$VC1/approve -H "$J" -H "$HD" -d "{\"client_id\":\"$AP\"}")|$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/consultores/vouchers/$VC1/approve -H "$J" -H "$HD" -d "{\"client_id\":\"$(uuid)\"}")|$(jq -r .error.code $T)"
check "reprovar sem motivo = 400" "400|VALIDATION_ERROR" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/consultores/vouchers/$VC2/reject -H "$J" -H "$HD" -d "{\"client_id\":\"$(uuid)\",\"reason\":null}")|$(jq -r .error.code $T)"
check "reprovar com motivo: o consultor vê o motivo" "reprovado|Fora do perfil" \
  "$(curl -s -X POST $API/v1/consultores/vouchers/$VC2/reject -H "$J" -H "$HD" -d "{\"client_id\":\"$(uuid)\",\"reason\":\"Fora do perfil\"}" > /dev/null; curl -s $API/v1/campo/vouchers -H "$HC" | jq -r --arg i "$VC2" '.items[] | select(.id==$i) | "\(.situacao)|\(.decision_reason)"')"
VC3=$(curl -s -X POST $API/v1/campo/vouchers -H "$J" -H "$HC" -d "{\"client_id\":\"$(uuid)\",\"lead_id\":\"$LEAD2\",\"segment\":\"Bar\",\"freelas_per_week\":2}" | jq -r .id)
check "reprovado libera pedir de novo; aprovar sem contratante = aguardando a empresa" "aguardando_empresa" \
  "$(curl -s -X POST $API/v1/consultores/vouchers/$VC3/approve -H "$J" -H "$HD" -d "{\"client_id\":\"$(uuid)\"}" | jq -r .situacao)"
check "vincular à conta que já tem cupom do Praça = 409 CONTRACTOR_ALREADY_HAS_COUPON" "409|CONTRACTOR_ALREADY_HAS_COUPON" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/consultores/vouchers/$VC3/link-contractor -H "$J" -H "$HD" -d "{\"client_id\":\"$(uuid)\",\"contractor_user_id\":\"smoke-u1-$SUF\"}")|$(jq -r .error.code $T)"
check "vincular a outra conta: aguardando o Freela" "aguardando_freela|manual" \
  "$(curl -s -X POST $API/v1/consultores/vouchers/$VC3/link-contractor -H "$J" -H "$HD" -d "{\"client_id\":\"$(uuid)\",\"contractor_user_id\":\"smoke-u2-$SUF\",\"contractor_name\":null}" | jq -r '"\(.situacao)|\(.contractor_source)"')"
check "candidatos do CRM sem conexão = 503 FREELA_NOT_CONFIGURED (a tela não chama sem freela_configured)" "503|FREELA_NOT_CONFIGURED" \
  "$(curl -s -o $T -w '%{http_code}' $API/v1/consultores/vouchers/$VC3/contractor-candidates -H "$HD")|$(jq -r .error.code $T)"
check "Tentar agora sem conexão: continua aguardando, sem quebrar" "200|aguardando_freela" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/consultores/vouchers/$VC1/coupon/retry -H "$J" -H "$HD" -d '{}')|$(jq -r .coupon_status $T)"
check "desativar cupom que não foi criado = 409" "409|INVALID_TRANSITION" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/consultores/vouchers/$VC1/coupon/deactivate -H "$J" -H "$HD" -d "{\"client_id\":\"$(uuid)\",\"reason\":\"Teste\"}")|$(jq -r .error.code $T)"
check "eventos do pedido aprovado: requested, approved, contractor_linked, coupon_retried" "requested,approved,contractor_linked,coupon_retried" \
  "$(curl -s $API/v1/consultores/vouchers/$VC1 -H "$HD" | jq -r '[.events[].type] | join(",")')"

echo "── configuração do cupom (§38.2) ──"
check "padrão: 100%, uso único, 30 dias, 1 por empresa, motivo obrigatório" "PERCENT|100|true|30|1|obrigatorio|30" \
  "$(curl -s $API/v1/consultores/vouchers/config -H "$HD" | jq -r '"\(.discount_type)|\(.percent_off)|\(.single_use)|\(.validade_dias)|\(.max_por_empresa)|\(.motivo_reprovacao)|\(.voucher_sync_min)"')"
check "PUT parcial; nulo em chave não anulável = ausente; FIXED sem valor = 400" "50|null|1|400" \
  "$(curl -s -X PUT $API/v1/consultores/vouchers/config -H "$J" -H "$HD" -d '{"percent_off":50,"validade_dias":null,"max_por_empresa":null}' | jq -r '"\(.percent_off)|\(.validade_dias)|\(.max_por_empresa)"')|$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/v1/consultores/vouchers/config -H "$J" -H "$HD" -d '{"discount_type":"FIXED"}')"
check "a configuração mora em field_config.voucher" "50" "$($PSQL "select field_config->'voucher'->>'percent_off' from app_settings where id=1" | tr -d '[:space:]')"
$PSQL "update app_settings set field_config = field_config - 'voucher' where id = 1" > /dev/null 2>&1

echo "── painel (§38.8) ──"
D=$(curl -s "$API/v1/consultores/dashboard?praca_id=$PRACA_SEED" -H "$HD")
check "kpis.vouchers: objeto, as parcelas somam os pedidos e a conta diz isso" "true|true|true" \
  "$(echo "$D" | jq -r '"\(.kpis.vouchers | type == "object")|\(.kpis.vouchers.requested == (.kpis.vouchers.approved + .kpis.vouchers.pending + .kpis.vouchers.rejected))|\(.conta.vouchers | test("pedidos? no período: .* aprovad.*esperando aprovação.*reprovad"))"')"

echo "── banco (§38.9) ──"
$PSQL "delete from field_vouchers where id='$VC1'" > /dev/null 2>&1; RC_DEL=$?
$PSQL "update field_vouchers set company_name='x' where id='$VC1'" > /dev/null 2>&1; RC_UPD=$?
$PSQL "update field_voucher_events set reason='x' where voucher_id='$VC1'" > /dev/null 2>&1; RC_EV=$?
check "trigger: DELETE, foto do pedido e eventos são barrados pelo banco" "1|1|1" "$RC_DEL|$RC_UPD|$RC_EV"
$PSQL "insert into field_vouchers (id, client_id, consultant_id, praca_id, lead_id, company_name, uf, city, segment, freelas_per_week, status, decided_at, contractor_user_id, contractor_source, coupon_status) values (gen_random_uuid(), gen_random_uuid(), '$CONS', '$PRACA_SEED', '$LEAD2', 'x', 'MG', 'BH', 'Bar', 0, 'aprovado', now(), 'smoke-u1-$SUF', 'manual', 'criado')" > /dev/null 2>&1
RC_IDX=$?
check "índice parcial: 2º cupom ativo do mesmo contratante é recusado (WHERE coupon_status IN …)" "1|t" \
  "$RC_IDX|$($PSQL "select indexdef like '%WHERE (coupon_status = ANY%' from pg_indexes where indexname='field_vouchers_one_coupon_per_contractor'" | tr -d '[:space:]')"
check "apagar o consultor ou o estabelecimento com pedido = 409 HAS_VOUCHER" "409|HAS_VOUCHER|409|HAS_VOUCHER" \
  "$(curl -s -o $T -w '%{http_code}' -X DELETE $API/v1/consultores/$CONS -H "$HD")|$(jq -r .error.code $T)|$(curl -s -o $T -w '%{http_code}' -X DELETE $API/v1/leads/$LEAD1 -H "$HD")|$(jq -r .error.code $T)"

echo "── limpeza ──"
# Pedido de cupom é um fato (trigger + FK Restrict): o banco de TESTE é limpo com session_replication_role=replica, como o S3.
$PSQL "set session_replication_role = replica; delete from field_voucher_events where voucher_id in (select id from field_vouchers where consultant_id='$CONS'); delete from field_vouchers where consultant_id='$CONS';" > /dev/null 2>&1
$PSQL "update app_settings set field_config = field_config - 'voucher', place_segments = null where id = 1; delete from place_candidates where run_id in (select id from place_import_runs where area_id='$AREA'); delete from place_import_runs where area_id='$AREA'; delete from field_areas where id='$AREA';" > /dev/null 2>&1
$PSQL "delete from field_visits where consultant_id='$CONS'; delete from field_points where journey_id in (select id from field_journeys where consultant_id='$CONS'); delete from field_journeys where consultant_id='$CONS'; delete from lead_events where lead_id in (select id from leads where name like 'LovC $SUF%'); delete from leads where name like 'LovC $SUF%';" > /dev/null 2>&1
curl -s -o /dev/null -X DELETE $API/v1/consultores/$CONS -H "$HD"
rm -f /tmp/praca-smoke-c.jpg /tmp/praca-smoke-c-a.json /tmp/praca-smoke-c-b.json /tmp/praca-smoke-c-a.code /tmp/praca-smoke-c-b.code $T
check "consultor, pedidos, eventos, área e buscas de teste removidos" "0|0|0|0" \
  "$(curl -s $API/v1/consultores -H "$HD" | jq --arg i "$CONS" '[.[] | select(.id==$i)] | length')|$($PSQL "select count(*) from field_vouchers where consultant_id='$CONS'" | tr -d '[:space:]')|$($PSQL "select count(*) from field_areas where name like 'LovC %'" | tr -d '[:space:]')|$($PSQL "select count(*) from place_import_runs where area_id='$AREA'" | tr -d '[:space:]')"
check "nem configuração do cupom nem segmentos gravados sobraram" "false|t" \
  "$($PSQL "select field_config ? 'voucher' from app_settings where id=1" | tr -d '[:space:]' | sed 's/^f$/false/;s/^t$/true/')|$($PSQL "select place_segments is null from app_settings where id=1" | tr -d '[:space:]')"

echo
echo "$PASS ok, $FAIL falha(s)"
[ "$FAIL" -eq 0 ]
