#!/usr/bin/env bash
# Smoke do MODO DO CHEFE S2/S3 (contrato §32). Conversa com a API viva (3014) e limpa o que cria. Roda SEPARADO do
# smoke.sh (que cobre as flags desligadas). Suba a API com as flags ligadas, em outro terminal:
#   FIELD_EARNINGS_ENABLED=true FIELD_ROUTES_ENABLED=true FIELD_VISIT_FLOW_SELECT_ENABLED=true \
#   FIELD_DECLARED_SIGNUPS_ENABLED=true npm run start:smoke
#   bash scripts/smoke-modo-chefe-s3.sh
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
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
HOJE=$(TZ=America/Sao_Paulo date +%F)
AGORA=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
LAT=-19.9245; LNG=-43.9352
POS="\"at\":\"$AGORA\",\"lat\":$LAT,\"lng\":$LNG,\"accuracy\":12"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/praca-smoke-fachada.jpg

echo "── S2: regra estendida ──"
CFG=$(curl -s $API/v1/consultores/earnings/config -H "$HD")
check "config traz presets, features e padrões das chaves novas" "declared|true|true|true|freela_confirmed" \
  "$(echo "$CFG" | jq -r '"\(.presets.chefe.signup_source)|\(.features.routes_enabled)|\(.features.declared_signups_enabled)|\(.extended.defaults.daily_base_requires_journey)|\(.current.config_effective.signup_source)"')"
check "a versão atual continua com as 13 chaves (config crua)" "13" "$(echo "$CFG" | jq '.current.config | keys | length')"
check "default_config e limits seguem como antes" "13|true" "$(echo "$CFG" | jq -r '"\(.default_config | keys | length)|\(.limits.unit_cents != null)"')"
BASE13=$(echo "$CFG" | jq -c '.current.config')
check "chave nova inválida = VALIDATION_ERROR com o campo" "VALIDATION_ERROR|tiers_mode" \
  "$(curl -s -X PUT $API/v1/consultores/earnings/config -H "$J" -H "$HD" -d "{\"valid_from\":\"$HOJE\",\"config\":$(echo "$BASE13" | jq -c '. + {tiers_mode:"todas"}')}" | jq -r '"\(.error.code)|\(.error.message | split(":")[0])"')"
check "SIMULA a semana do chefe: diária 100,00 + 5 × 10,00 + meta 5 de 200,00 = 350,00" "35000" \
  "$(curl -s -X POST $API/v1/consultores/earnings/simulate -H "$J" -H "$HD" -d "{\"signups_confirmed\":0,\"config\":$(echo "$BASE13" | jq -c '. + {signup_source:"declared",tiers_period:"week",tiers:[{min_signups:5,amount_cents:20000}],combine:"sum",unit_cents:1000,daily_base_cents:10000,daily_base_condition:"route_assigned",daily_base_requires_journey:false,tiers_mode:"cumulative"}'),\"days\":[{\"signups\":5,\"route_assigned\":true}]}" | jq '.week.total_cents')"
check "SIMULA diária 150,00 × 2 dias com rota da equipe = 300,00" "30000" \
  "$(curl -s -X POST $API/v1/consultores/earnings/simulate -H "$J" -H "$HD" -d "{\"signups_confirmed\":0,\"config\":$(echo "$BASE13" | jq -c '. + {daily_base_cents:15000,daily_base_condition:"route_assigned",daily_base_requires_journey:false}'),\"days\":[{\"signups\":0,\"route_assigned\":true},{\"signups\":0,\"route_assigned\":true}]}" | jq '.week.total_cents')"
check "SIMULA 5 cadastros × 10,00 = 50,00 (modo antigo, dia único)" "5000" \
  "$(curl -s -X POST $API/v1/consultores/earnings/simulate -H "$J" -H "$HD" -d '{"signups_confirmed":5}' | jq '.day.total_cents')"
check "simulador antigo: sem week no corpo da resposta" "false" \
  "$(curl -s -X POST $API/v1/consultores/earnings/simulate -H "$J" -H "$HD" -d '{"signups_confirmed":5}' | jq 'has("week")')"

# Versão do chefe VÁLIDA HOJE (faixa por dia, limite de 2 declarações/dia) — apagada no fim, só no banco de teste.
REGRA_CHEFE=$(echo "$BASE13" | jq -c '. + {signup_source:"declared",unit_cents:1000,combine:"sum",tiers_period:"day",tiers:[],tiers_mode:"cumulative",declared_daily_cap:2,daily_base_cents:5000,daily_base_condition:"route_assigned",daily_base_requires_journey:false}')
PUT=$(curl -s -X PUT $API/v1/consultores/earnings/config -H "$J" -H "$HD" -d "{\"valid_from\":\"$HOJE\",\"reason\":\"smoke-s3\",\"config\":$REGRA_CHEFE}")
check "PUT da regra do chefe (rotas e declaração ligadas) = nova versão" "declared|route_assigned" "$(echo "$PUT" | jq -r '"\(.config_effective.signup_source)|\(.config_effective.daily_base_condition)"')"
check "PUT com as 13 chaves antigas e as novas nulas continua válido" "true" \
  "$(curl -s -X PUT $API/v1/consultores/earnings/config -H "$J" -H "$HD" -d "{\"valid_from\":\"$HOJE\",\"reason\":\"smoke-s3\",\"config\":$(echo "$BASE13" | jq -c '. + {signup_source:null,daily_base_cents:null,tiers_mode:null,declared_daily_cap:null}')}" | jq '.version != null')"
# volta ao chefe (a última versão do dia vence o empate de valid_from)
curl -s -o /dev/null -X PUT $API/v1/consultores/earnings/config -H "$J" -H "$HD" -d "{\"valid_from\":\"$HOJE\",\"reason\":\"smoke-s3\",\"config\":$REGRA_CHEFE}"

echo "── S3: consultor e declarações ──"
CPF=$(cpf_valido "$SUF"); EMAIL="decl$SUF@praca.local"
CRIA=$(curl -s -X POST $API/v1/consultores -H "$J" -H "$HD" -d "{\"name\":\"Decl $SUF\",\"email\":\"$EMAIL\",\"phone\":\"(31) 99999-0000\",\"cpf\":\"$CPF\",\"praca_id\":\"$PRACA_SEED\",\"pix_key_type\":\"cpf\",\"pix_key\":\"$CPF\"}")
CONS=$(echo "$CRIA" | jq -r .consultant.id); SENHA=$(echo "$CRIA" | jq -r .temp_password)
LOG=$(curl -s -X POST $API/v1/campo/auth/login -H "$J" -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}")
TR=$(curl -s -X POST $API/v1/campo/auth/change-password -H "$J" -H "Authorization: Bearer $(echo "$LOG" | jq -r .access_token)" -d "{\"current_password\":\"$SENHA\",\"new_password\":\"campoSenha123\"}")
HC="Authorization: Bearer $(echo "$TR" | jq -r .access_token)"
check "/me: declared_signups ligado" "true" "$(curl -s $API/v1/campo/me -H "$HC" | jq '.features.declared_signups')"
check "token de consultor na rota de equipe = 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' $API/v1/consultores/declared-signups -H "$HC")"

J1=$(uuid)
curl -s -o /dev/null -X POST $API/v1/campo/journeys/start -H "$J" -H "$HC" -d "{\"client_id\":\"$J1\",$POS}"
ci(){ curl -s -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$1" -F "at=$AGORA" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" --form-string "new_place={\"name\":\"Decl $SUF $2\",\"address\":\"Rua de Teste, 10\"}" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg"; }
CONTATO='"interlocutor_name":"Marcos","interlocutor_role":"dono","contact_phone":"(11) 98765-4321"'
declarar(){ # $1 client_id da visita
  curl -s -o /dev/null -X PATCH $API/v1/campo/visits/$1/answers -H "$J" -H "$HC" -d "{\"result\":\"cadastrou\",$CONTATO}"
  curl -s -X POST $API/v1/campo/visits/$1/checkout -H "$J" -H "$HC" -d "{$POS}"; }
V1=$(uuid); V2=$(uuid); V3=$(uuid)
VIS1=$(ci "$V1" a); LEAD1=$(echo "$VIS1" | jq -r .lead_id)
# Uma visita aberta por vez (índice parcial): check-in e checkout em sequência.
check "checkout 'Cadastrou agora' conclui" "true" "$(declarar "$V1" | jq '.checkout_at != null')"
check "a visita grava freela_status declarou (não cadastrou_qr)" "declarou" "$(curl -s $API/v1/campo/today -H "$HC" | jq -r --arg v "$V1" '.visits[] | select(.client_id==$v) | .answers.freela_status')"
ci "$V2" b >/dev/null; declarar "$V2" >/dev/null
ci "$V3" c >/dev/null; declarar "$V3" >/dev/null
check "reenviar o checkout (fila offline) devolve a visita e não cria outra declaração" "true" "$(curl -s -X POST $API/v1/campo/visits/$V1/checkout -H "$J" -H "$HC" -d "{$POS}" | jq '.checkout_at != null')"

REL=$(curl -s "$API/v1/consultores/declared-signups?from=$HOJE&to=$HOJE&consultant_id=$CONS" -H "$HD")
check "relatório: 3 declaradas, 3 sem correspondência, 1 acima do limite (2/dia), 100% divergência" "3|3|1|100" \
  "$(echo "$REL" | jq -r '"\(.totals.declared)|\(.totals.unmatched)|\(.totals.over_cap)|\(.totals.divergence_pct)"')"
check "relatório traz a conta escrita e a fonte" "true" "$(echo "$REL" | jq '(.conta | length) >= 3 and (.source | length) > 10')"
check "relatório não traz telefone nem e-mail" "0" "$(echo "$REL" | grep -ciE '98765|marcos@|"phone"|cnpj' )"
check "paga pela declaração (regra do dia)" "declared" "$(echo "$REL" | jq -r '.rows[0].paid_by')"
check "filtro 'acima do limite'" "1" "$(curl -s "$API/v1/consultores/declared-signups?from=$HOJE&to=$HOJE&consultant_id=$CONS&status=over_cap" -H "$HD" | jq '.rows | length')"
ALVO=$(echo "$REL" | jq -r '[.rows[] | select(.over_cap==false)][0].id')

EX=$(curl -s "$API/v1/consultores/earnings?consultant_id=$CONS" -H "$HD")
check "ganhos: 2 declarações entram (limite) × R$ 10,00 = 2000 (sem diária: não havia rota da equipe)" "2000" "$(echo "$EX" | jq '.consultants[0].total_cents')"
check "a fonte dos ganhos diz declarados" "declared" "$(echo "$EX" | jq -r '.signup_source')"
check "a conta do dia diz declarados, limite e diária que não vale" "true" "$(echo "$EX" | jq '[.consultants[0].days[] | select(.conta | join(" ") | contains("acima do limite"))] | length >= 1')"
check "a conta explica a diária sem rota da equipe" "true" "$(echo "$EX" | jq '[.consultants[0].days[].conta[]] | any(contains("não havia rota da equipe atribuída no dia"))')"
check "o consultor vê a própria conta como declarada" "declared" "$(curl -s $API/v1/campo/earnings -H "$HC" | jq -r '.signup_source')"
ATE=$(curl -s $API/v1/consultores/attention -H "$HD")
check "Atenção agora traz declared_alerts (lista)" "array" "$(echo "$ATE" | jq -r '.declared_alerts | type')"

echo "── S3: o mesmo estabelecimento não declara duas vezes ──"
V4=$(uuid)
curl -s -o /dev/null -X POST $API/v1/campo/visits -H "$HC" -F "client_id=$V4" -F "at=$AGORA" -F "lat=$LAT" -F "lng=$LNG" -F "accuracy=12" -F "lead_id=$LEAD1" -F "photo=@/tmp/praca-smoke-fachada.jpg;type=image/jpeg"
declarar "$V4" >/dev/null
check "segunda visita ao mesmo lead: continua 3 declarações" "3" "$(curl -s "$API/v1/consultores/declared-signups?from=$HOJE&to=$HOJE&consultant_id=$CONS" -H "$HD" | jq '.totals.declared')"

echo "── S3: anulação manual ──"
ANU=$(uuid)
check "anular sem nota = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/consultores/declared-signups/$ALVO/void -H "$J" -H "$HD" -d "{\"reason\":\"duplicate\",\"note\":\"x\",\"client_id\":\"$ANU\"}")"
check "motivo fora da lista = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/consultores/declared-signups/$ALVO/void -H "$J" -H "$HD" -d "{\"reason\":\"qualquer\",\"note\":\"abc\",\"client_id\":\"$ANU\"}")"
check "anula com motivo e nota" "voided|duplicate" "$(curl -s -X POST $API/v1/consultores/declared-signups/$ALVO/void -H "$J" -H "$HD" -d "{\"reason\":\"duplicate\",\"note\":\"Mesmo bar duas vezes\",\"client_id\":\"$ANU\"}" | jq -r '"\(.status)|\(.void.reason)"')"
check "repetir o mesmo client_id devolve a mesma" "voided" "$(curl -s -X POST $API/v1/consultores/declared-signups/$ALVO/void -H "$J" -H "$HD" -d "{\"reason\":\"duplicate\",\"note\":\"Mesmo bar duas vezes\",\"client_id\":\"$ANU\"}" | jq -r .status)"
check "anular de novo com outro client_id = ALREADY_VOIDED" "409|ALREADY_VOIDED" "$(curl -s -o /tmp/praca-smoke-v.json -w '%{http_code}' -X POST $API/v1/consultores/declared-signups/$ALVO/void -H "$J" -H "$HD" -d "{\"reason\":\"fraud\",\"note\":\"outra vez\",\"client_id\":\"$(uuid)\"}")|$(jq -r .error.code /tmp/praca-smoke-v.json)"
check "id malformado = 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/consultores/declared-signups/nao-e-uuid/void -H "$J" -H "$HD" -d "{\"reason\":\"fraud\",\"note\":\"abc\",\"client_id\":\"$(uuid)\"}")"
check "consultor não anula (token de campo = 401)" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/v1/consultores/declared-signups/$ALVO/void -H "$J" -H "$HC" -d "{\"reason\":\"fraud\",\"note\":\"abc\",\"client_id\":\"$(uuid)\"}")"
REL2=$(curl -s "$API/v1/consultores/declared-signups?from=$HOJE&to=$HOJE&consultant_id=$CONS" -H "$HD")
check "relatório: 1 anulada e nenhuma acima do limite (a anulada libera a vaga)" "1|0" "$(echo "$REL2" | jq -r '"\(.totals.voided)|\(.totals.over_cap)"')"
EX2=$(curl -s "$API/v1/consultores/earnings?consultant_id=$CONS" -H "$HD")
check "ganhos: continuam 2 declarações válidas (o limite deixa a de baixo entrar)" "2000" "$(echo "$EX2" | jq '.consultants[0].total_cents')"
ALVO2=$(echo "$REL2" | jq -r '[.rows[] | select(.status != "voided")][0].id')
curl -s -o /dev/null -X POST $API/v1/consultores/declared-signups/$ALVO2/void -H "$J" -H "$HD" -d "{\"reason\":\"not_confirmed\",\"note\":\"Não existe no Freela\",\"client_id\":\"$(uuid)\"}"
EX3=$(curl -s "$API/v1/consultores/earnings?consultant_id=$CONS" -H "$HD")
check "ganhos: com 2 anuladas sobra 1 declaração = 1000, e a conta diz as anuladas" "1000|true" "$(echo "$EX3" | jq -r '"\(.consultants[0].total_cents)|\([.consultants[0].days[].conta[]] | any(contains("anulada")))"')"
check "o ganho não zera o histórico: a declaração anulada continua listada com o motivo" "2" "$(curl -s "$API/v1/consultores/declared-signups?from=$HOJE&to=$HOJE&consultant_id=$CONS&status=voided" -H "$HD" | jq '.rows | map(select(.void.note != null)) | length')"
check "apagar consultor com declaração = HAS_EARNINGS" "HAS_EARNINGS" "$(curl -s -X DELETE $API/v1/consultores/$CONS -H "$HD" | jq -r .error.code)"
check "apagar lead com declaração = HAS_DECLARED_SIGNUP" "HAS_DECLARED_SIGNUP" "$(curl -s -X DELETE $API/v1/leads/$LEAD1 -H "$HD" | jq -r .error.code)"

echo "── limpeza ──"
# O razão de declarações é imutável por trigger; o banco de TESTE é limpo com session_replication_role=replica.
$PSQL "set session_replication_role = replica; delete from field_declared_signup_voids where declared_id in (select id from field_declared_signups where consultant_id='$CONS'); delete from field_declared_signups where consultant_id='$CONS'; delete from field_pay_rule_versions where reason='smoke-s3';" > /dev/null 2>&1
$PSQL "delete from field_visits where consultant_id='$CONS'; delete from field_points where journey_id in (select id from field_journeys where consultant_id='$CONS'); delete from field_journeys where consultant_id='$CONS'; delete from lead_events where lead_id in (select id from leads where name like 'Decl $SUF%'); delete from field_route_stops where lead_id in (select id from leads where name like 'Decl $SUF%'); delete from leads where name like 'Decl $SUF%';" > /dev/null 2>&1
curl -s -o /dev/null -X DELETE $API/v1/consultores/$CONS -H "$HD"
check "consultor de teste removido" "0" "$(curl -s $API/v1/consultores -H "$HD" | jq --arg i "$CONS" '[.[] | select(.id==$i)] | length')"
check "nenhuma versão de teste sobrou" "0" "$($PSQL "select count(*) from field_pay_rule_versions where reason='smoke-s3'" | tr -d '[:space:]')"
check "a versão 1 continua a vigente" "1" "$(curl -s $API/v1/consultores/earnings/config -H "$HD" | jq '.current.version')"
echo
printf 'Resultado: \033[32m%d ok\033[0m, \033[31m%d falha(s)\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
