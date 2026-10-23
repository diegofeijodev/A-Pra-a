#!/usr/bin/env bash
# Smoke do LOTE D do restante da Lovable (contrato §39 divisão em N rotas e "Minhas rotas", §40 shoppings). Conversa com a API viva
# (3014) e limpa o que cria. Roda SEPARADO do smoke.sh (que cobre as flags desligadas). NUNCA fala com o Overpass público: suba a
# API, em outro terminal, com o Overpass num endereço morto (as buscas de shoppings/lojas terminam em erro legível, sem rede):
#   OVERPASS_URL=http://127.0.0.1:9/api/interpreter FIELD_ROUTES_ENABLED=true FIELD_ROUTE_PLANS_ENABLED=true \
#   FIELD_SEGMENTS_ENABLED=true FIELD_MALLS_ENABLED=true npm run start:smoke
#   bash scripts/smoke-lovable-d.sh
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
T=/tmp/praca-smoke-d.json
q(){ $PSQL "$1" | tr -d '[:space:]'; }

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
HOJE=$(TZ=America/Sao_Paulo date +%F)
AMANHA=$(TZ=America/Sao_Paulo date -d tomorrow +%F)
LAT=-19.9245; LNG=-43.9352

# Faxina de entrada: resíduo de rodada interrompida (consultores lovd*, leads "LovD …", configuração e buscas do lote D).
faxina(){
  $PSQL "delete from field_route_plans where id in (select distinct p.id from field_route_plans p join field_route_plan_items i on i.plan_id = p.id where exists (select 1 from leads l where l.id = any(i.lead_ids) and l.name like 'LovD %'));
         delete from field_route_plans where parent_lead_id in (select id from leads where name like 'LovD %');
         delete from field_routes where consultant_id in (select id from field_consultants where email like 'lovd%@praca.local');
         delete from place_candidates where run_id in (select id from place_import_runs where kind <> 'lugares' and (parent_lead_id in (select id from leads where name like 'LovD %') or area_name like 'LovD %' or (kind = 'shoppings' and praca_id = '$PRACA_SEED')));
         delete from place_import_runs where kind <> 'lugares' and (parent_lead_id in (select id from leads where name like 'LovD %') or area_name like 'LovD %' or (kind = 'shoppings' and praca_id = '$PRACA_SEED'));
         update leads set parent_lead_id = null where name like 'LovD %';
         delete from lead_events where lead_id in (select id from leads where name like 'LovD %');
         delete from leads where name like 'LovD %';
         delete from field_consultants where email like 'lovd%@praca.local';
         delete from field_areas where name like 'LovD %';
         update app_settings set field_config = field_config - 'divisao' - 'shopping' where id = 1;" > /dev/null 2>&1
}
faxina

echo "── features (§39.1, §40.1) ──"
check "GET settings/config: route_plans e malls ligados" "true|true" \
  "$(curl -s $API/v1/consultores/settings/config -H "$HD" | jq -r '"\(.features.route_plans)|\(.features.malls)"')"

echo "── configuração da divisão (§39.2) ──"
check "padrões: 20 por rota, lovable, 20/60/600, carro, 25/5 km/h" "20|lovable|20|60|600|carro|25|5" \
  "$(curl -s $API/v1/route-plans/config -H "$HD" | jq -r '"\(.por_rota)|\(.modelo_tempo)|\(.minutos_por_cliente)|\(.intervalo_min)|\(.limite_min)|\(.travel_mode)|\(.kmh_carro)|\(.kmh_pe)"')"
check "PUT parcial (null = ausente) e fora da faixa = 400" "3|lovable|400" \
  "$(curl -s -X PUT $API/v1/route-plans/config -H "$J" -H "$HD" -d '{"por_rota":3,"modelo_tempo":null}' | jq -r '"\(.por_rota)|\(.modelo_tempo)"')|$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/v1/route-plans/config -H "$J" -H "$HD" -d '{"por_rota":101}')"
check "o PUT da divisão não mexe no settings/config do roteiro" "30" "$(curl -s $API/v1/consultores/settings/config -H "$HD" | jq .meta_diaria)"

echo "── área, estabelecimentos e consultores de teste ──"
AREA=$(curl -s -X POST $API/v1/areas -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"LovD $SUF\",\"lat\":$LAT,\"lng\":$LNG,\"radius_m\":800}" | jq -r .id)
for n in 1 2 3 4 5 6 7; do
  $PSQL "insert into leads (id, praca_id, name, entered_at, stage_since, lat, lng, location_precision, source, source_ref) values (gen_random_uuid(), '$PRACA_SEED', 'LovD $SUF $n', '$HOJE', '$HOJE', $LAT + $n * 0.0006, $LNG + ($n % 3) * 0.0007, 'point', 'osm', 'node/lovd$SUF$n')" > /dev/null
done
IDS=$($PSQL "select json_agg(id order by name) from leads where name like 'LovD $SUF %'" | tr -d '[:space:]')
IDS_REV=$(echo "$IDS" | jq -c 'reverse')
FORA=$($PSQL "insert into leads (id, praca_id, name, entered_at, stage_since, lat, lng) values (gen_random_uuid(), null, 'LovD $SUF sem praça', '$HOJE', '$HOJE', $LAT, $LNG) returning id" | head -1 | tr -d '[:space:]')
mkcons(){
  local cpf; cpf=$(cpf_valido "$SUF$1")
  curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"LovD $SUF $1\",\"email\":\"lovd$SUF$1@praca.local\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$cpf\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$cpf\"}"
}
CA=$(mkcons 1); CONS_A=$(echo "$CA" | jq -r .consultant.id); SENHA_A=$(echo "$CA" | jq -r .temp_password)
CONS_B=$(mkcons 2 | jq -r .consultant.id)
LOG=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"lovd${SUF}1@praca.local\",\"password\":\"$SENHA_A\"}")
TR=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "Authorization: Bearer $(echo "$LOG" | jq -r .access_token)" -d "{\"current_password\":\"$SENHA_A\",\"new_password\":\"campoSenha123\"}")
HC="Authorization: Bearer $(echo "$TR" | jq -r .access_token)"
check "/me: features.route_plans ligado" "true" "$(curl -s $API/v1/campo/me -H "$HC" | jq -r .features.route_plans)"

echo "── prévia e geração (§39.3–§39.5) ──"
check "prévia da área: os 7 de teste entram, com a conta (÷ 3, arredonda para cima)" "true|true" \
  "$(curl -s "$API/v1/route-plans/preview?praca_id=$PRACA_SEED&area_id=$AREA&por_rota=3" -H "$HD" | jq -r '"\(.lead_count >= 7)|\(.conta | test("÷ 3 = .*arredonda para cima"))"')"
P1=$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"area_id\":\"$AREA\",\"lead_ids\":$IDS,\"por_rota\":3}")
PLANO1=$(jq -r .id $T)
check "gerar: 201, 3 rotas de até 3 (7 ÷ 3), Rota 01, carro, as duas contas" "201|3|true|Rota 01|carro|true|true" \
  "$P1|$(jq -r '"\(.item_count)|\([.items[].lead_ids | length <= 3] | all)|\(.items[0].name)|\(.travel_mode)|\(.items[0].conta_lovable.texto | test("× 20 min \\+ 1 h de intervalo"))|\(.items[0].conta_roteiro.texto | test("linha reta × 1,3"))"' $T)"
ITEM1=$(jq -r '.items[0].id' $T); ITEM2=$(jq -r '.items[1].id' $T)
LEADS_ITEM2=$(jq -c '.items[1].lead_ids | sort' $T)
P1_ITENS=$(jq -c '[.items[].lead_ids]' $T)
PLANO2=$(curl -s -X POST $API/v1/route-plans -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"area_id\":\"$AREA\",\"lead_ids\":$IDS_REV,\"por_rota\":3}" | tee $T | jq -r .id)
check "determinístico: a mesma lista ao contrário gera as mesmas rotas" "$P1_ITENS" "$(jq -c '[.items[].lead_ids]' $T)"
P2_ITEM2=$(jq -r '.items[1].id' $T)
check "praça A × B: estabelecimento de outra praça = 400 VALIDATION_ERROR" "400|VALIDATION_ERROR" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"lead_ids\":[\"$FORA\"]}")|$(jq -r .error.code $T)"
check "lista: as duas gerações, mais nova primeiro" "$PLANO2|$PLANO1" \
  "$(curl -s "$API/v1/route-plans?praca_id=$PRACA_SEED" -H "$HD" | jq -r --arg a "$PLANO1" --arg b "$PLANO2" '[.[] | select(.id==$a or .id==$b) | .id] | join("|")')"

echo "── publicar pelo mesmo serviço do POST /v1/routes (§39.6) ──"
A1=$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans/$PLANO1/items/$ITEM1/assign -H "$J" -H "$HD" -d "{\"consultant_id\":\"$CONS_A\",\"day\":\"$AMANHA\"}")
ROTA_A=$(jq -r .route.id $T)
check "publicar: 200, roteiro de amanhã 'equipe' de carro, item marcado" "200|equipe|carro|$AMANHA|LovD $SUF 1" \
  "$A1|$(jq -r '"\(.route.source)|\(.route.travel_mode)|\(.route.day)|\(.item.assigned.consultant_name)"' $T)"
check "idempotente: o mesmo pedido devolve o mesmo roteiro" "200|$ROTA_A" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans/$PLANO1/items/$ITEM1/assign -H "$J" -H "$HD" -d "{\"consultant_id\":\"$CONS_A\",\"day\":\"$AMANHA\"}")|$(jq -r .route.id $T)"
check "outra rota para o mesmo consultor e dia sem confirmar = 409 ROUTE_EXISTS" "409|ROUTE_EXISTS" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans/$PLANO1/items/$ITEM2/assign -H "$J" -H "$HD" -d "{\"consultant_id\":\"$CONS_A\",\"day\":\"$AMANHA\"}")|$(jq -r .error.code $T)"
check "com confirm_replace: o MESMO roteiro passa a ter as paradas da Rota 02" "200|$ROTA_A|$LEADS_ITEM2" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans/$PLANO1/items/$ITEM2/assign -H "$J" -H "$HD" -d "{\"consultant_id\":\"$CONS_A\",\"day\":\"$AMANHA\",\"confirm_replace\":true}")|$(jq -r .route.id $T)|$(jq -c '[.route.stops[] | select(.status=="pendente") | .lead_id] | sort' $T)"
check "índice parcial: um roteiro ativo por consultor e dia (o banco tem só um)" "1|t" \
  "$(q "select count(*) from field_routes where consultant_id='$CONS_A' and day='$AMANHA' and status='ativa'")|$(q "select indexdef like '%WHERE (status = ''ativa''%' from pg_indexes where indexname='field_routes_one_active_per_day'")"
check "a mesma loja no roteiro de outro consultor no dia = 409 LEAD_IN_OTHER_ROUTE (item livre)" "409|LEAD_IN_OTHER_ROUTE|null" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans/$PLANO2/items/$P2_ITEM2/assign -H "$J" -H "$HD" -d "{\"consultant_id\":\"$CONS_B\",\"day\":\"$AMANHA\"}")|$(jq -r .error.code $T)|$(curl -s $API/v1/route-plans/$PLANO2 -H "$HD" | jq -r --arg i "$P2_ITEM2" '.items[] | select(.id==$i) | .assigned')"
check "rota já publicada para outro consultor = 409 ITEM_ALREADY_ASSIGNED" "409|ITEM_ALREADY_ASSIGNED" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans/$PLANO1/items/$ITEM2/assign -H "$J" -H "$HD" -d "{\"consultant_id\":\"$CONS_B\",\"day\":\"$AMANHA\"}")|$(jq -r .error.code $T)"
check "dia no passado = 400 (regra do POST /v1/routes)" "400" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/route-plans/$PLANO2/items/$P2_ITEM2/assign -H "$J" -H "$HD" -d "{\"consultant_id\":\"$CONS_B\",\"day\":\"2020-01-01\"}")"
check "token de consultor nas rotas da equipe = 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/route-plans?praca_id=$PRACA_SEED" -H "$HC")"

echo "── Minhas rotas do consultor (§39.7) ──"
check "consultor vê a rota de amanhã com o nome da rota do plano; o roteiro de hoje não muda" "1|Rota 02|false" \
  "$(curl -s "$API/v1/campo/routes" -H "$HC" | jq -r --arg d "$AMANHA" '[.routes[] | select(.day==$d)] | "\(length)|\(.[0].route_plan.name)"')|$(curl -s $API/v1/campo/route/today -H "$HC" | jq -r '.route != null')"
check "mais de 62 dias = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/campo/routes?from=$HOJE&to=$(TZ=America/Sao_Paulo date -d '+70 days' +%F)" -H "$HC")"

echo "── arquivar (§39.6) ──"
check "arquivar: some da lista; o roteiro publicado continua ativo" "true|0|ativa" \
  "$(curl -s -X POST $API/v1/route-plans/$PLANO1/archive -H "$HD" | jq -r '.archived_at != null')|$(curl -s "$API/v1/route-plans?praca_id=$PRACA_SEED" -H "$HD" | jq --arg a "$PLANO1" '[.[] | select(.id==$a)] | length')|$(q "select status from field_routes where id='$ROTA_A'")"
check "publicar de geração arquivada = 409 PLAN_ARCHIVED" "409|PLAN_ARCHIVED" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans/$PLANO1/items/$ITEM1/assign -H "$J" -H "$HD" -d "{\"consultant_id\":\"$CONS_B\",\"day\":\"$AMANHA\"}")|$(jq -r .error.code $T)"

echo "── shoppings (§40) ──"
check "config dos shoppings: área 20.000, lojas 50, raio 300, fora da rota geral" "area|20000|50|300|true" \
  "$(curl -s $API/v1/consultores/shoppings/config -H "$HD" | jq -r '"\(.criterio)|\(.area_min_m2)|\(.lojas_min)|\(.raio_lojas_m)|\(.fora_da_rota_geral)"')"
SR=$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/place-searches -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"kind\":\"shoppings\"}")
RUN_S=$(jq -r .id $T)
check "buscar shoppings (centro da praça, sem área, sem tipos) = 202 kind shoppings, 15 km" "202|shoppings|null|15000" \
  "$SR|$(jq -r '"\(.kind)|\(.area_id)|\(.radius_m)"' $T)"
for i in $(seq 1 40); do ST=$(curl -s "$API/v1/place-searches/$RUN_S?praca_id=$PRACA_SEED" -H "$HD" | jq -r .status); [ "$ST" = "error" ] || [ "$ST" = "done" ] && break; sleep 1; done
check "Overpass morto: a busca termina em erro legível (sem rede, nada gravado)" "error|true" \
  "$ST|$(curl -s "$API/v1/place-searches/$RUN_S?praca_id=$PRACA_SEED" -H "$HD" | jq -r '.error | length > 5')"
check "a lista da busca de hoje não mostra a de shoppings" "0" \
  "$(curl -s "$API/v1/place-searches?praca_id=$PRACA_SEED" -H "$HD" | jq --arg r "$RUN_S" '[.[] | select(.id==$r)] | length')"
MALL1=$($PSQL "insert into leads (id, praca_id, name, entered_at, stage_since, lat, lng, location_precision, source, source_ref, place_kind) values (gen_random_uuid(), '$PRACA_SEED', 'LovD $SUF Shopping Grande', '$HOJE', '$HOJE', $LAT + 0.004, $LNG, 'point', 'osm', 'way/9$SUF', 'shopping') returning id" | head -1 | tr -d '[:space:]')
MALL2=$($PSQL "insert into leads (id, praca_id, name, entered_at, stage_since, lat, lng, location_precision, source, source_ref, place_kind) values (gen_random_uuid(), '$PRACA_SEED', 'LovD $SUF Shopping Vertical', '$HOJE', '$HOJE', $LAT - 0.004, $LNG, 'point', 'osm', 'way/8$SUF', 'shopping') returning id" | head -1 | tr -d '[:space:]')
$PSQL "insert into lead_mall_metrics (lead_id, source_ref, geometry_kind, area_m2, measured_at, updated_at) values ('$MALL1', 'way/9$SUF', 'poligono', 49331, now(), now()), ('$MALL2', 'way/8$SUF', 'poligono', 8497, now(), now())" > /dev/null
LS=$(curl -s "$API/v1/consultores/shoppings?praca_id=$PRACA_SEED" -H "$HD")
check "lista: o de 49.331 m² é grande e o de 8.497 m² não, com a conta" "true|false|Área no mapa aberto: 49.331 m² (mínimo 20.000 m²) → grande." \
  "$(echo "$LS" | jq -r --arg a "$MALL1" --arg b "$MALL2" '"\([.shoppings[] | select(.lead_id==$a)][0].is_large)|\([.shoppings[] | select(.lead_id==$b)][0].is_large)|\([.shoppings[] | select(.lead_id==$a)][0].conta)"')"
check "marcar à mão vale mais que o critério; null volta ao critério" "true|manual|false|criterio" \
  "$(curl -s -X PATCH $API/v1/consultores/shoppings/$MALL2 -H "$J" -H "$HD" -d '{"large_override":true}' | jq -r '"\(.is_large)|\(.por)"')|$(curl -s -X PATCH $API/v1/consultores/shoppings/$MALL2 -H "$J" -H "$HD" -d '{"large_override":null}' | jq -r '"\(.is_large)|\(.por)"')"
curl -s -o /dev/null -X PATCH $API/v1/consultores/shoppings/$MALL2 -H "$J" -H "$HD" -d '{"large_override":true}'
RL=$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/place-searches -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"kind\":\"lojas\",\"parent_lead_id\":\"$MALL1\",\"types\":[\"bar\",\"restaurante\"]}")
check "buscar lojas dentro do shopping = 202 kind lojas, sem área, raio que alcança o polígono" "202|lojas|$MALL1|null|334" \
  "$RL|$(jq -r '"\(.kind)|\(.parent_lead_id)|\(.area_id)|\(.radius_m)"' $T)"
for n in 1 2; do
  $PSQL "insert into leads (id, praca_id, name, entered_at, stage_since, lat, lng, location_precision, parent_lead_id) values (gen_random_uuid(), '$PRACA_SEED', 'LovD $SUF loja $n', '$HOJE', '$HOJE', $LAT + 0.004, $LNG + $n * 0.0002, 'point', '$MALL1')" > /dev/null
done
check "rota dos shoppings: os 2 grandes (um pela área, outro à mão) numa rota" "201|1|2|Rota dos shoppings" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"kind\":\"shoppings\"}")|$(jq -r '"\(.item_count)|\(.items[0].lead_ids | length)|\(.items[0].name)"' $T)"
check "rota interna: as 2 lojas de dentro em \"Dentro do …\"" "201|2|Dentro do LovD $SUF Shopping Grande" \
  "$(curl -s -o $T -w '%{http_code}' -X POST $API/v1/route-plans -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"kind\":\"shopping_interno\",\"parent_lead_id\":\"$MALL1\"}")|$(jq -r '"\(.items[0].lead_ids | length)|\(.items[0].name)"' $T)"
CAND(){ curl -s "$API/v1/routes/candidates?praca_id=$PRACA_SEED&area_id=$AREA&limit=200$1" -H "$HD" | jq -r --arg a "$MALL1" '[.[] | select(.id==$a or (.name | test("loja")))] | length'; }
check "candidatos: sem scope = hoje (shopping e lojas entram); geral tira; shopping:<id> só as lojas" "3|0|2" "$(CAND '')|$(CAND '&scope=geral')|$(CAND "&scope=shopping:$MALL1")"
check "plano geral (fora_da_rota_geral) não leva shopping nem loja de dentro" "0" \
  "$(curl -s "$API/v1/route-plans/preview?praca_id=$PRACA_SEED&area_id=$AREA" -H "$HD" > /dev/null; curl -s -X POST $API/v1/route-plans -H "$J" -H "$HD" -d "{\"praca_id\":\"$PRACA_SEED\",\"area_id\":\"$AREA\",\"por_rota\":50}" | jq --arg a "$MALL1" '[.items[].lead_ids[] | select(. == $a)] | length')"
$PSQL "insert into leads (id, praca_id, name, entered_at, stage_since, place_kind) values (gen_random_uuid(), '$PRACA_SEED', 'LovD $SUF ruim', '$HOJE', '$HOJE', 'mercado')" > /dev/null 2>&1; RC_K=$?
$PSQL "insert into place_import_runs (id, praca_id, area_name, source, types, lat, lng, radius_m, cache_key, requested_by, kind) values (gen_random_uuid(), '$PRACA_SEED', 'LovD $SUF', 'osm', '{}', 0, 0, 1, 'x', (select id from users limit 1), 'lugares')" > /dev/null 2>&1; RC_A=$?
check "banco: place_kind só 'shopping'; busca de lugares sem área é recusada (CHECK)" "1|1" "$RC_K|$RC_A"

echo "── limpeza ──"
curl -s -o /dev/null -X PUT $API/v1/route-plans/config -H "$J" -H "$HD" -d '{"por_rota":20}'
faxina
rm -f $T
check "planos, roteiros, consultores, estabelecimentos, área, buscas e configuração de teste removidos" "0|0|0|0|0|false|false" \
  "$(q "select count(*) from field_route_plans where id in ('$PLANO1','$PLANO2')")|$(q "select count(*) from field_consultants where email like 'lovd%@praca.local'")|$(q "select count(*) from leads where name like 'LovD %'")|$(q "select count(*) from field_areas where name like 'LovD %'")|$(q "select count(*) from place_import_runs where id='$RUN_S'")|$(q "select field_config ? 'divisao' from app_settings where id=1" | sed 's/^f$/false/;s/^t$/true/')|$(q "select field_config ? 'shopping' from app_settings where id=1" | sed 's/^f$/false/;s/^t$/true/')"

echo
echo "$PASS ok, $FAIL falha(s)"
[ "$FAIL" -eq 0 ]
