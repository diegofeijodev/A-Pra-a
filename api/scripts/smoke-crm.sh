#!/usr/bin/env bash
# Smoke do CRM automático (contrato §47): tarefas do dia, "Feito", resumo, automações, selos, features e a guarda do auto_key no banco.
# Conversa com a API viva (3014) e limpa o que cria (repetível sem resíduo). Roda SEPARADO do smoke.sh (que cobre as chaves desligadas).
# NUNCA fala com o Overpass público nem com um Freela real (as variáveis FREELA_* do api/.env ficam vazias no local). Suba a API, em outro
# terminal, com as chaves ligadas (a partir de api/):
#   OVERPASS_URL=http://127.0.0.1:9/api/interpreter TEAM_COMMERCIAL_ENABLED=true CRM_TASKS_ENABLED=true CRM_AUTO_LEADS_FROM_SEARCH_ENABLED=true \
#   CRM_AUTO_STAGES_ENABLED=true CRM_AUTO_LOST_ENABLED=true CRM_FREELA_PIPELINE_ENABLED=true nice -n 19 npm run start:smoke > /tmp/praca-api.log 2>&1
#   bash scripts/smoke-crm.sh
# A2, A3 e A4 (e A1) não têm rota para disparar: provam-se no jest. Aqui: rotas /v1/crm/*, formato do §47 e o índice único de auto_key.
# Faz 1 login da equipe (teto de 40/min).
API=${API:-http://localhost:3014}
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko(){ FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s — %s\n' "$1" "$2"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "esperado '$2', veio '$3'"; fi }
J='Content-Type: application/json'
SUF=${SUF:-$(date +%s%N)}
PSQL="docker exec praca-postgres psql -U praca -d praca -qtAc"
T=/tmp/praca-smoke-crm.json
code(){ curl -s -o $T -w '%{http_code}' "$@"; }
err(){ jq -r '.error.code // "-"' $T; }
PRACA_SEED="00000000-0000-4000-8000-0000000000aa"
HOJE=$(TZ=America/Sao_Paulo date +%F)
INICIO=$($PSQL "select now() at time zone 'utc'" | tr -d '\n')   # as rodadas do relógio criadas daqui em diante saem na limpeza

faxina(){
  $PSQL "delete from lead_events where auto_key like 'smoke-crm-%';
         delete from leads where name like 'CrmS %';
         delete from crm_automation_runs where started_at >= '$INICIO';" > /dev/null 2>&1
}
trap faxina EXIT
faxina

DIEGO=$(curl -s -X POST $API/v1/auth/login -H "$J" -d '{"email":"diego@praca.local","password":"praca123"}')
HD="Authorization: Bearer $(echo "$DIEGO" | jq -r .access_token)"
DIEGO_ID=$($PSQL "select id from users where email = 'diego@praca.local'" | tr -d '[:space:]')
REBECA_ID=$($PSQL "select id from users where email = 'rebeca@praca.local'" | tr -d '[:space:]')

mk(){ # nome, dono (vazio = a API exige dono na criação; o psql tira) -> id
  local dono=",\"owner_id\":\"${2:-$DIEGO_ID}\""
  local id
  id=$(curl -s -X POST $API/v1/leads -H "$J" -H "$HD" \
    -d "{\"praca_id\":\"$PRACA_SEED\",\"name\":\"CrmS $1 $SUF\",\"city\":\"Belo Horizonte\",\"phone\":\"(31) 98888-7777\",\"decisor\":\"Fulano\",\"classe\":\"alvo\",\"origem\":\"prospecção\"$dono}" | jq -r .id)
  [ -z "$2" ] && [ "$id" != "null" ] && $PSQL "update leads set owner_id = null where id = '$id'" > /dev/null
  echo "$id"
}

echo "── features (§47.1) ──"
check "GET settings/config: crm_tasks e crm_auto_leads ligadas" "true|true" \
  "$(curl -s $API/v1/consultores/settings/config -H "$HD" | jq -r '"\(.features.crm_tasks)|\(.features.crm_auto_leads)"')"

echo "── preparo: 3 leads próprios ──"
A=$(mk passo ""); B=$(mk parado ""); C=$(mk outro "$REBECA_ID")
check "3 leads criados" "3" "$(for i in $A $B $C; do [ "$i" != "null" ] && [ -n "$i" ] && echo x; done | wc -l | tr -d ' ')"
check "A: passo de hoje (PUT next-step) = 200" "200" "$(code -X PUT $API/v1/leads/$A/next-step -H "$J" -H "$HD" -d "{\"what\":\"Ligar para o dono\",\"date\":\"$HOJE\"}")"
check "C (dono = Rebeca): passo de hoje = 200" "200" "$(code -X PUT $API/v1/leads/$C/next-step -H "$J" -H "$HD" -d "{\"what\":\"Ligar de novo\",\"date\":\"$HOJE\"}")"
# B: etapa 3 com a conversa parada há 10 dias (sem rota para recuar datas).
$PSQL "update leads set stage = 3, stage_since = to_char(current_date - 10, 'YYYY-MM-DD'), last_contact_at = now() - interval '10 days' where id = '$B'" > /dev/null

echo "── GET /v1/crm/tasks (§47.3) ──"
check "200 e o formato (day, praca_id, person, counts, entrada, freela_configured, groups)" "200|$HOJE|all|true|true|true|false" \
  "$(code "$API/v1/crm/tasks?praca_id=$PRACA_SEED" -H "$HD")|$(jq -r '"\(.day)|\(.person)|\(.counts | has("me") and has("all"))|\(.entrada | has("novos"))|\(.groups | type == "array")|\(.freela_configured)"' $T)"
grupo(){ jq -r --arg t "$1" --arg id "$2" '[.groups[] | select(.task == $t) | .items[] | select(.lead_id == $id)] | length' $T; }
check "A (passo de hoje) está em next_step, com o passo e sem dono" "1|Ligar para o dono|$HOJE|null" \
  "$(grupo next_step $A)|$(jq -r --arg id $A '.groups[] | select(.task=="next_step") | .items[] | select(.lead_id==$id) | "\(.next_step.what)|\(.next_step.date)|\(.owner_id)"' $T)"
check "B (etapa 3, 10 dias parado) está em stalled com last_contact_day e stage_since" "1|true|true" \
  "$(grupo stalled $B)|$(jq -r --arg id $B '.groups[] | select(.task=="stalled") | .items[] | select(.lead_id==$id) | (.last_contact_day != null)' $T)|$(jq -r --arg id $B '.groups[] | select(.task=="stalled") | .items[] | select(.lead_id==$id) | (.stage_since != null)' $T)"
check "grupo traz task, total e items; cada lead aparece uma vez só" "true|1" \
  "$(jq '[.groups[] | has("task") and has("total") and has("items")] | all' $T)|$(jq --arg a $A '[.groups[].items[] | select(.lead_id == $a)] | length' $T)"
check "item do next_step tem lead_name, stage, phone e next_step.from_cadence" "true" \
  "$(jq -r --arg id $A '.groups[] | select(.task=="next_step") | .items[] | select(.lead_id==$id) | (.lead_name != null and .stage == 1 and .phone != null and (.next_step | has("from_cadence")))' $T)"
check "person=me: A e B (sem dono) entram; C (dono = Rebeca) não" "200|1|1|0" \
  "$(code "$API/v1/crm/tasks?praca_id=$PRACA_SEED&person=me" -H "$HD")|$(grupo next_step $A)|$(grupo stalled $B)|$(grupo next_step $C)"
check "person=all: C (dono = Rebeca) entra" "1" "$(curl -s "$API/v1/crm/tasks?praca_id=$PRACA_SEED&person=all" -H "$HD" | jq --arg id $C '[.groups[] | select(.task=="next_step") | .items[] | select(.lead_id==$id)] | length')"
check "praca_id desconhecida = 404 NOT_FOUND; sem praca_id = 400" "404|NOT_FOUND|400" \
  "$(code "$API/v1/crm/tasks?praca_id=00000000-0000-4000-8000-0000000000ff" -H "$HD")|$(err)|$(code "$API/v1/crm/tasks" -H "$HD")"
check "sem token = 401" "401" "$(code "$API/v1/crm/tasks?praca_id=$PRACA_SEED")"

echo "── POST /v1/crm/tasks/done (§47.3) ──"
check "kind note = 400" "400" "$(code -X POST $API/v1/crm/tasks/done -H "$J" -H "$HD" -d "{\"lead_id\":\"$A\",\"task\":\"next_step\",\"kind\":\"note\"}")"
check "lead inexistente = 404" "404" "$(code -X POST $API/v1/crm/tasks/done -H "$J" -H "$HD" -d '{"lead_id":"00000000-0000-4000-8000-0000000000ee","task":"next_step","kind":"call"}')"
check "lead_id malformado = 400" "400" "$(code -X POST $API/v1/crm/tasks/done -H "$J" -H "$HD" -d '{"lead_id":"x","task":"next_step","kind":"call"}')"
check "Feito (call) em A = 201 { ok, lead_id }" "201|true|$A" \
  "$(code -X POST $API/v1/crm/tasks/done -H "$J" -H "$HD" -d "{\"lead_id\":\"$A\",\"task\":\"next_step\",\"kind\":\"call\",\"text\":\"Falei com o dono\"}")|$(jq -r '"\(.ok)|\(.lead_id)"' $T)"
check "A ganhou dono (quem fez), last_contact_at e o passo foi limpo" "$DIEGO_ID|true|" \
  "$($PSQL "select owner_id || '|' || (last_contact_at is not null) || '|' || coalesce(next_step_what,'') from leads where id = '$A'" | tr -d '\n')"
check "o evento call de A ficou com o autor e o texto" "1|$DIEGO_ID" \
  "$($PSQL "select count(*) || '|' || max(author_id::text) from lead_events where lead_id = '$A' and kind = 'call' and text = 'Falei com o dono'" | tr -d '\n')"
curl -s "$API/v1/crm/tasks?praca_id=$PRACA_SEED" -H "$HD" > $T
check "a tarefa de A some do next_step" "0" "$(grupo next_step $A)"
check "Feito (visit) em B com próximo passo = 201; B sai de stalled e ganha o passo" "201|0|Visitar de novo" \
  "$(code -X POST $API/v1/crm/tasks/done -H "$J" -H "$HD" -d "{\"lead_id\":\"$B\",\"task\":\"stalled\",\"kind\":\"visit\",\"next_step\":{\"what\":\"Visitar de novo\",\"date\":\"$(TZ=America/Sao_Paulo date -d '+3 days' +%F)\"}}")|$(curl -s "$API/v1/crm/tasks?praca_id=$PRACA_SEED" -H "$HD" | jq --arg id $B '[.groups[] | select(.task=="stalled") | .items[] | select(.lead_id==$id)] | length')|$($PSQL "select next_step_what from leads where id = '$B'" | tr -d '\n')"
check "lead arquivado = 409 LEAD_ARCHIVED" "409|LEAD_ARCHIVED" \
  "$($PSQL "update leads set archived = true where id = '$C'" >/dev/null; code -X POST $API/v1/crm/tasks/done -H "$J" -H "$HD" -d "{\"lead_id\":\"$C\",\"task\":\"next_step\",\"kind\":\"call\"}")|$(err)"

echo "── GET /v1/crm/summary (§47.3) ──"
check "200, day de hoje, freela_configured false e as 6 chaves na ordem" "200|$HOJE|false|leads_novos,mudancas_etapa,mudancas_etapa_destino,freela,mensagens_enviadas,respostas" \
  "$(code "$API/v1/crm/summary?praca_id=$PRACA_SEED" -H "$HD")|$(jq -r '"\(.day)|\(.freela_configured)|\([.numbers[].key] | join(","))"' $T)"
check "leads_novos conta os 2 leads não arquivados (A e B) com conta e fonte" "true|true" \
  "$(jq '(.numbers[] | select(.key=="leads_novos") | .value >= 2)' $T)|$(jq '(.numbers[] | select(.key=="leads_novos") | (.formula != null and .source != null and (.parts | type == "array")))' $T)"
check "freela sem conta: value null e parts vazio" "null|0" "$(jq -r '.numbers[] | select(.key=="freela") | "\(.value)|\(.parts | length)"' $T)"
check "sem praca_id (todas) = 200; day passado = 200; day inválido = 400" "200|200|400" \
  "$(code "$API/v1/crm/summary" -H "$HD")|$(code "$API/v1/crm/summary?day=2026-01-01" -H "$HD")|$(code "$API/v1/crm/summary?day=ontem" -H "$HD")"
check "praca_id malformado = 400" "400" "$(code "$API/v1/crm/summary?praca_id=nao-e-uuid" -H "$HD")"

echo "── GET /v1/crm/automations e /badges (§47.3) ──"
check "200, freela_configured false, send_mode, cadences e warnings" "200|false|true|true|true" \
  "$(code "$API/v1/crm/automations" -H "$HD")|$(jq -r '.freela_configured' $T)|$(jq '.send_mode != null' $T)|$(jq '.cadences | type == "array"' $T)|$(jq '.warnings | type == "array"' $T)"
check "quadro_freela: needs_freela e blocked_by freela; os 4 trabalhos" "true|freela|auto_leads_busca,etapas_cadastro,quadro_freela,sem_resposta" \
  "$(jq -r '.jobs[] | select(.key=="quadro_freela") | "\(.needs_freela)|\(.blocked_by)"' $T)|$(jq -r '[.jobs[].key] | sort | join(",")' $T)"
check "automations nunca expõe e-mail de conta" "0" "$(grep -c '@' $T)"
check "GET badges?praca_id = 200 com items" "200|true" "$(code "$API/v1/crm/badges?praca_id=$PRACA_SEED" -H "$HD")|$(jq '.items | type == "array"' $T)"
check "badges sem praca_id = 400/404" "true" "$(c=$(code "$API/v1/crm/badges" -H "$HD"); [ "$c" = 400 ] || [ "$c" = 404 ] && echo true || echo "$c")"

echo "── lead_events.auto_key único no banco (§47.2) ──"
INS="insert into lead_events (id, lead_id, kind, text, auto_key) values (gen_random_uuid(), '$A', 'note', 't', 'smoke-crm-$SUF')"
check "1º INSERT com auto_key ok" "INSERT 0 1" "$(docker exec praca-postgres psql -U praca -d praca -c "$INS" 2>&1 | head -1)"
R=$(docker exec praca-postgres psql -U praca -d praca -v VERBOSITY=verbose -c "$INS" 2>&1)
check "2º INSERT com o mesmo auto_key falha com 23505" "1" "$(echo "$R" | grep -c '23505')"
check "só uma linha com esse auto_key" "1" "$($PSQL "select count(*) from lead_events where auto_key = 'smoke-crm-$SUF'" | tr -d '\n')"

faxina
echo "── limpeza ──"
check "nenhum lead nem evento do smoke sobrou" "0|0" "$($PSQL "select (select count(*) from leads where name like 'CrmS %') || '|' || (select count(*) from lead_events where auto_key like 'smoke-crm-%')" | tr -d '\n')"

echo
echo "Resultado: $PASS ✓ / $FAIL ✗"
[ "$FAIL" -eq 0 ]
