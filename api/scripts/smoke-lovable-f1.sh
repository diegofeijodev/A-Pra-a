#!/usr/bin/env bash
# Smoke do restante da Lovable, LOTE F1 (contrato §43 bônus mensal e §45 regra de pagamento por consultor). Conversa com a API
# viva (3014) e limpa o que cria (as versões da regra e o razão são imutáveis por trigger: o banco de TESTE é limpo com
# session_replication_role=replica). Roda SEPARADO do smoke.sh. Suba a API com as flags ligadas (as de produção + as do lote):
#   FIELD_EARNINGS_ENABLED=true FIELD_EARNINGS_MONTHLY_ENABLED=true FIELD_EARNINGS_PER_CONSULTANT_ENABLED=true \
#   FIELD_ROUTES_ENABLED=true FIELD_VISIT_FLOW_SELECT_ENABLED=true FIELD_DECLARED_SIGNUPS_ENABLED=true FIELD_PAYOUTS_ENABLED=true \
#   npm run start:smoke
#   bash scripts/smoke-lovable-f1.sh
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

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
REBECA=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"rebeca@praca.local","password":"praca123"}')
HN="Authorization: Bearer $(echo "$REBECA" | jq -r .access_token)"
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
HOJE=$(TZ=America/Sao_Paulo date +%F)
SEG=$(date -d "$HOJE -$(( $(date -d "$HOJE" +%u) - 1 )) days" +%F)       # 1º dia da semana (a regra v1: segunda)
DOM_PASSADO=$(date -d "$SEG -1 day" +%F); SEG_PASSADA=$(date -d "$SEG -7 days" +%F); QUA_PASSADA=$(date -d "$SEG -5 days" +%F)
DIA1=$(date -d "$HOJE" +%Y-%m-01); PROX_DIA1=$(date -d "$DIA1 +1 month" +%F)
AGORA=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
LAT=-19.9245; LNG=-43.9352
POS="\"at\":\"$AGORA\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada.jpg

# Faxina de uma rodada interrompida (só o que este smoke cria: reason 'smoke-f1' e consultores "F1 …").
faxina(){
  local ids; ids=$($PSQL "select string_agg(quote_literal(id::text), ',') from field_consultants where name like 'F1 %'" | tr -d '[:space:]')
  if [ -n "$ids" ]; then
    $PSQL "set session_replication_role = replica; delete from field_declared_signup_voids where declared_id in (select id from field_declared_signups where consultant_id in ($ids)); delete from field_declared_signups where consultant_id in ($ids); delete from field_earnings_ledger where consultant_id in ($ids); delete from field_payout_periods where consultant_id in ($ids); delete from field_pay_rule_versions where consultant_id in ($ids);" > /dev/null 2>&1
    $PSQL "delete from field_visits where consultant_id in ($ids); delete from field_points where journey_id in (select id from field_journeys where consultant_id in ($ids)); delete from field_journeys where consultant_id in ($ids); delete from lead_events where lead_id in (select id from leads where name like 'F1 %'); delete from field_route_stops where lead_id in (select id from leads where name like 'F1 %'); delete from leads where name like 'F1 %';" > /dev/null 2>&1
    for id in $(echo "$ids" | tr -d "'" | tr ',' ' '); do curl -s -o /dev/null -X DELETE $API/v1/consultores/$id -H "$HD"; done
  fi
  $PSQL "set session_replication_role = replica; delete from field_pay_rule_versions where reason = 'smoke-f1'; delete from field_earnings_ledger where source = 'smoke-f1';" > /dev/null 2>&1
}
faxina
VERSAO_ANTES=$(curl -s $API/v1/consultores/earnings/config -H "$HD" | jq '.current.version')

echo "── L11: bônus mensal na regra geral ──"
CFG=$(curl -s $API/v1/consultores/earnings/config -H "$HD")
check "config: features monthly_enabled e per_consultant_enabled ligadas" "true|true" "$(echo "$CFG" | jq -r '"\(.features.monthly_enabled)|\(.features.per_consultant_enabled)"')"
check "a regra geral começa a semana na segunda (o smoke assume)" "1" "$(echo "$CFG" | jq '.current.config_effective.week_start_weekday')"
BASE13=$(echo "$CFG" | jq -c '.current.config')
MENSAL=$(echo "$BASE13" | jq -c '. + {tiers_period:"month",combine:"sum",cap_cents:null,tiers:[{min_signups:20,amount_cents:15000},{min_signups:40,amount_cents:30000}]}')
put(){ curl -s -o /tmp/praca-smoke-f1.json -w '%{http_code}' -X PUT $API/v1/consultores/earnings/config -H "$J" -H "$HD" -d "{\"valid_from\":\"$1\",\"reason\":\"smoke-f1\",\"config\":$2}"; }
check "month com combine max = 400 (campo combine)" "400|combine" "$(put "$PROX_DIA1" "$(echo "$MENSAL" | jq -c '.combine="max"')")|$(jq -r '.error.message | split(":")[0]' /tmp/praca-smoke-f1.json)"
check "month com teto = 400 (campo cap_cents)" "400|cap_cents" "$(put "$PROX_DIA1" "$(echo "$MENSAL" | jq -c '.cap_cents=90000')")|$(jq -r '.error.message | split(":")[0]' /tmp/praca-smoke-f1.json)"
check "month fora do dia 1 = 400 (valid_from)" "400|valid_from" "$(put "$(date -d "$PROX_DIA1 +1 day" +%F)" "$MENSAL")|$(jq -r '.error.message | split(":")[0]' /tmp/praca-smoke-f1.json)"
SIM=$(curl -s -X POST $API/v1/consultores/earnings/simulate -H "$J" -H "$HD" -d "{\"signups_confirmed\":3,\"config\":$MENSAL,\"month_signups\":42}")
check "Simular o mês: 42 cadastros → faixa 40 = R$ 300,00 (e o dia: 3 × R$ 10,00)" "30000|3000|true" "$(echo "$SIM" | jq -r '"\(.month.total_cents)|\(.day.total_cents)|\(.month.conta | join(" ") | contains("Faixa do mês atingida: 40 cadastros"))"')"
check "PUT mensal no dia 1 do mês que vem = nova versão (upcoming)" "200|month|true" \
  "$(put "$PROX_DIA1" "$MENSAL")|$(jq -r .config.tiers_period /tmp/praca-smoke-f1.json)|$(curl -s $API/v1/consultores/earnings/config -H "$HD" | jq '[.upcoming[] | select(.config.tiers_period == "month")] | length == 1')"
check "a versão vigente hoje continua a mesma" "$VERSAO_ANTES" "$(curl -s $API/v1/consultores/earnings/config -H "$HD" | jq '.current.version')"

echo "── L13: consultores de teste ──"
cria(){ # $1 nome, $2 arquivo da resposta, $3 índice → id
  local cpf; cpf=$(cpf_valido "$SUF$3")
  curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"F1 $1 $SUF\",\"email\":\"f1$3$SUF@praca.local\",\"phone\":\"(31) 99999-000$3\",\"cpf\":\"$cpf\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$cpf\"}" > "$2"
  jq -r .consultant.id "$2"; }
entra(){ # $1 arquivo da criação, $2 índice → header de campo
  local email senha log tr; email="f1$2$SUF@praca.local"; senha=$(jq -r .temp_password "$1")
  log=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$email\",\"password\":\"$senha\"}")
  tr=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "Authorization: Bearer $(echo "$log" | jq -r .access_token)" -d "{\"current_password\":\"$senha\",\"new_password\":\"CampoSenha123\"}")
  echo "Authorization: Bearer $(echo "$tr" | jq -r .access_token)"; }
X=$(cria Ana /tmp/praca-smoke-f1x.json 1); Y=$(cria Beto /tmp/praca-smoke-f1y.json 2); W=$(cria Caio /tmp/praca-smoke-f1w.json 3)
HX=$(entra /tmp/praca-smoke-f1x.json 1); HY=$(entra /tmp/praca-smoke-f1y.json 2)
check "três consultores de teste criados e logados" "true" "$([ -n "$X" ] && [ "$X" != null ] && [ "$W" != null ] && curl -s $API/v1/campo/me -H "$HX" | jq '.features.earnings == true')"

echo "── L11: o razão aceita a parte do mês (CHECKs da migração; linhas apagadas na limpeza) ──"
# Semana e mês LONGE de hoje (100 semanas à frente): a linha aceita não pode cair na semana nem no mês correntes, senão entra no
# total de X logo abaixo (com a semana fixa '2026-10-26' o smoke passou a dar 4100 em vez de 4000 quando essa semana chegou).
LONGE=$(date -d "$SEG +700 days" +%F); MES_LONGE=$(date -d "$LONGE" +%Y-%m)
lin(){ $PSQL "insert into field_earnings_ledger (id, consultant_id, kind, amount_cents, work_scope, work_day, work_week, payout_week, source, reason, idempotency_key, snapshot) values (gen_random_uuid(), '$X', '$1', 100, 'month', '$2', '$LONGE', '$LONGE', 'smoke-f1', $3, 'smoke-f1-$(uuid)', '{}')" > /dev/null 2>&1 && echo aceito || echo barrado; }
check "parte do mês no dia 1 é aceita; fora do dia 1, barrada; ajuste com escopo month, barrado" "aceito|barrado|barrado" \
  "$(lin accrual $MES_LONGE-01 null)|$(lin accrual $MES_LONGE-15 null)|$(lin adjustment $MES_LONGE-01 "'teste'")"

echo "── L13: permissões e conferências da regra própria ──"
R0=$(curl -s "$API/v1/consultores/earnings/consultant-rules?consultant_id=$X" -H "$HD")
check "sem regra própria: hoje vale a geral; a 1ª data possível é o início da semana em que ele entrou" "global|$SEG|0" "$(echo "$R0" | jq -r '"\(.current.scope)|\(.min_valid_from)|\(.own | length)"')"
check "rótulo da regra geral" "Regra geral · versão $VERSAO_ANTES" "$(echo "$R0" | jq -r .current.label)"
check "id malformado = 404; equipe (não admin) = 403; token de campo = 401" "404|403|401|403" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/consultores/earnings/consultant-rules?consultant_id=nao-e-uuid" -H "$HD")|$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/consultores/earnings/consultant-rules?consultant_id=$X" -H "$HN")|$(curl -s -o /dev/null -w '%{http_code}' "$API/v1/consultores/earnings/consultant-rules?consultant_id=$X" -H "$HX")|$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/consultores/earnings/consultant-rules -H "$J" -H "$HN" -d '{}')"
PROPRIA=$(echo "$BASE13" | jq -c '. + {unit_cents:2000,tiers:[],signup_source:"declared"}')
regra(){ curl -s -o /tmp/praca-smoke-f1.json -w '%{http_code}' -X POST $API/v1/consultores/earnings/consultant-rules -H "$J" -H "$HD" -d "{\"consultant_id\":\"$1\",\"valid_from\":\"$2\",\"reason\":\"smoke-f1\",\"config\":$3}"; }
check "antes da semana em que ele entrou = 400 (valid_from)" "400|valid_from" "$(regra "$X" "$SEG_PASSADA" "$PROPRIA")|$(jq -r '.error.message | split(":")[0]' /tmp/praca-smoke-f1.json)"
check "calendário diferente da regra geral = 400 (payout_weekday)" "400|payout_weekday" "$(regra "$X" "$SEG" "$(echo "$PROPRIA" | jq -c '.payout_weekday=5')")|$(jq -r '.error.message | split(":")[0]' /tmp/praca-smoke-f1.json)"
check "regra própria no início desta semana (passado, semana aberta) = 201" "201|$X|$SEG" "$(regra "$X" "$SEG" "$PROPRIA")|$(jq -r '"\(.consultant_id)|\(.valid_from)"' /tmp/praca-smoke-f1.json)"
VX=$(jq -r .version /tmp/praca-smoke-f1.json)
R1=$(curl -s "$API/v1/consultores/earnings/consultant-rules?consultant_id=$X" -H "$HD")
check "agora vale a regra própria, com o rótulo" "consultant|Regra própria de F1 Ana $SUF · versão $VX|1" "$(echo "$R1" | jq -r '"\(.current.scope)|\(.current.label)|\(.own | length)"')"
check "a regra própria NÃO entra no histórico da regra geral" "0" "$(curl -s $API/v1/consultores/earnings/config -H "$HD" | jq --argjson v "$VX" '[.history[], .upcoming[], .current | select(.version == $v)] | length')"

echo "── L13: declarações de X (regra própria) e de Y (regra geral) ──"
ci(){ curl -s -X POST $API/v1/campo/visits -H "$1" -F "client_id=$2" -F "at=$AGORA" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" --form-string "new_place={\"name\":\"F1 $SUF $3\",\"address\":\"Rua de Teste, 10\"}" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg" > /dev/null; }
CONTATO='"interlocutor_name":"Marcos","interlocutor_role":"dono","contact_phone":"(11) 98765-4321"'
declarar(){ curl -s -o /dev/null -X PATCH $API/v1/campo/visits/$2/answers -H "$J" -H "$1" -d "{\"result\":\"cadastrou\",$CONTATO}"; curl -s -X POST $API/v1/campo/visits/$2/checkout -H "$J" -H "$1" -d "{$POS}" | jq -r '.checkout_at != null'; }
curl -s -o /dev/null -X POST $API/v1/campo/journeys/start -H "$J" -H "$HX" -d "{\"client_id\":\"$(uuid)\",$POS}"
curl -s -o /dev/null -X POST $API/v1/campo/journeys/start -H "$J" -H "$HY" -d "{\"client_id\":\"$(uuid)\",$POS}"
V1=$(uuid); V2=$(uuid); V3=$(uuid)
ci "$HX" "$V1" xa; D1=$(declarar "$HX" "$V1"); ci "$HX" "$V2" xb; D2=$(declarar "$HX" "$V2"); ci "$HY" "$V3" ya; D3=$(declarar "$HY" "$V3")
check "três checkouts 'Cadastrou agora' (2 de X, 1 de Y)" "true|true|true" "$D1|$D2|$D3"
EX=$(curl -s "$API/v1/consultores/earnings?consultant_id=$X" -H "$HD")
check "X: 2 declarações × R$ 20,00 (regra própria) = 4000" "4000" "$(echo "$EX" | jq '.consultants[0].total_cents')"
check "X: a linha diz qual regra valeu e o dia de hoje é da regra própria" "consultant|consultant|true" \
  "$(echo "$EX" | jq -r --arg h "$HOJE" '"\(.consultants[0].rule.scope)|\(.consultants[0].days[] | select(.day == $h) | .rule_scope)|\(.consultants[0].conta[0] | startswith("Regras desta semana:"))"')"
check "X: a conta do dia começa pela regra própria" "true" "$(echo "$EX" | jq --arg h "$HOJE" '.consultants[0].days[] | select(.day == $h) | .conta[0] | startswith("Regra própria de F1 Ana")')"
EY=$(curl -s "$API/v1/consultores/earnings?consultant_id=$Y" -H "$HD")
check "Y (isolado, regra geral confirmada pelo Freela): a declaração não paga e não há rótulo" "0|false" "$(echo "$EY" | jq -r '"\(.consultants[0].total_cents)|\(.consultants[0] | has("rule"))"')"
GX=$(curl -s $API/v1/campo/earnings -H "$HX")
check "o consultor X vê a regra dele (versão, fonte declarada e rótulo)" "$VX|declared|consultant|4000" "$(echo "$GX" | jq -r '"\(.rule_version)|\(.signup_source)|\(.rule.scope)|\(.today.total_cents)"')"
check "o consultor Y não vê rótulo nenhum (regra geral, como hoje)" "false|false" "$(curl -s $API/v1/campo/earnings -H "$HY" | jq -r '"\(has("rule"))|\(has("month"))"')"
check "simulador pela regra de X: 3 × R$ 20,00 = 6000" "6000|consultant" "$(curl -s -X POST $API/v1/consultores/earnings/simulate -H "$J" -H "$HD" -d "{\"signups_confirmed\":3,\"consultant_id\":\"$X\"}" | jq -r '"\(.day.total_cents)|\(.rule.scope)"')"
check "relatório de declarados: X paga pela declaração (regra dele), Y pela confirmação (geral)" "declared|freela_confirmed" \
  "$(curl -s "$API/v1/consultores/declared-signups?from=$HOJE&to=$HOJE&consultant_id=$X" -H "$HD" | jq -r '.rows[0].paid_by')|$(curl -s "$API/v1/consultores/declared-signups?from=$HOJE&to=$HOJE&consultant_id=$Y" -H "$HD" | jq -r '.rows[0].paid_by')"

echo "── L11 + L13: meta do mês para o consultor ──"
# Regra própria MENSAL de Y desde o dia 1 deste mês (gravada direto: a rota não aceita antes da semana em que ele entrou).
MES_Y=$(echo "$BASE13" | jq -c '. + {tiers_period:"month",combine:"sum",cap_cents:null,unit_cents:0,signup_source:"declared",tiers:[{min_signups:1,amount_cents:5000},{min_signups:40,amount_cents:30000}]}')
$PSQL "insert into field_pay_rule_versions (id, valid_from, config, reason, created_by_name, consultant_id) values (gen_random_uuid(), '$DIA1', '$MES_Y'::jsonb, 'smoke-f1', 'smoke', '$Y')" > /dev/null
GY=$(curl -s $API/v1/campo/earnings -H "$HY")
TXT=$(echo "$GY" | jq -r .month.text)
check "Y: meta do mês com 1 declaração → faixa 1 = R$ 50,00 até agora" "$(date -d "$HOJE" +%Y-%m)|1|5000|false" "$(echo "$GY" | jq -r '"\(.month.month)|\(.month.signups)|\(.month.amount_cents)|\(.month.ended)"')"
check "Y: a frase do mês tem a conta e o Pix ($TXT)" "sim" \
  "$(echo "$TXT" | grep -qE '^Meta do mês \(.+\): 1 cadastro declarado → faixa 1 = R\$ 50,00 até agora\. Faltam 39 para R\$ 300,00 \(Pix de (seg|ter|qua|qui|sex|sáb|dom) [0-9]{2}/[0-9]{2}\)\.$' && echo sim || echo nao)"
check "a conta do mês diz que é a regra própria" "true" "$(echo "$GY" | jq '.month.conta[0] | startswith("Regra própria de F1 Beto")')"
MEIO=$HOJE; [ "$(date -d "$HOJE" +%d)" = "01" ] && MEIO=$(date -d "$HOJE +1 day" +%F)
check "regra própria diária de Y no meio do mês mensal = 400 (dia 1)" "400|valid_from" "$(regra "$Y" "$MEIO" "$PROPRIA")|$(jq -r '.error.message | split(":")[0]' /tmp/praca-smoke-f1.json)"
check "regra própria mensal de X no dia 1 do mês que vem = 201" "201|month" "$(regra "$X" "$PROX_DIA1" "$(echo "$MES_Y")")|$(jq -r .config.tiers_period /tmp/praca-smoke-f1.json)"

echo "── L13: semana fechada não muda ──"
$PSQL "insert into field_payout_periods (id, consultant_id, week_start, week_end, status, total_cents, entries, rule_version, closed_at, closed_by_name, closed_mode) values (gen_random_uuid(), '$X', '$SEG_PASSADA', '$DOM_PASSADO', 'closed', 0, 0, $VERSAO_ANTES, now(), 'smoke-f1', 'manual')" > /dev/null
check "valid_from em semana fechada = 409 WEEK_CLOSED, com a semana na mensagem" "409|WEEK_CLOSED|true" \
  "$(regra "$X" "$QUA_PASSADA" "$PROPRIA")|$(jq -r .error.code /tmp/praca-smoke-f1.json)|$(jq --arg d "$(date -d "$DOM_PASSADO" +%d/%m/%Y)" '.error.message | contains($d)' /tmp/praca-smoke-f1.json)"
check "a 1ª data possível passa a ser o dia seguinte à semana fechada" "$SEG" "$(curl -s "$API/v1/consultores/earnings/consultant-rules?consultant_id=$X" -H "$HD" | jq -r .min_valid_from)"
check "consultor só com regra própria não é apagado (HAS_EARNINGS)" "201|HAS_EARNINGS" "$(regra "$W" "$SEG" "$PROPRIA")|$(curl -s -X DELETE $API/v1/consultores/$W -H "$HD" | jq -r .error.code)"

echo "── limpeza ──"
faxina
check "consultores de teste removidos" "0" "$(curl -s $API/v1/consultores -H "$HD" | jq --arg a "$X" --arg b "$Y" --arg c "$W" '[.[] | select(.id==$a or .id==$b or .id==$c)] | length')"
check "nenhuma versão de teste sobrou (geral nem de consultor)" "0|0" "$($PSQL "select count(*) from field_pay_rule_versions where reason='smoke-f1'" | tr -d '[:space:]')|$($PSQL "select count(*) from field_pay_rule_versions where consultant_id is not null" | tr -d '[:space:]')"
check "nenhuma linha de teste no razão" "0" "$($PSQL "select count(*) from field_earnings_ledger where source='smoke-f1'" | tr -d '[:space:]')"
check "a vigente é a de antes e não há mensal futura" "$VERSAO_ANTES|0" "$(curl -s $API/v1/consultores/earnings/config -H "$HD" | jq -r '"\(.current.version)|\([.upcoming[] | select(.config.tiers_period == "month")] | length)"')"
echo
printf 'Resultado: \033[32m%d ok\033[0m, \033[31m%d falha(s)\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
