#!/usr/bin/env bash
# Grava no /opt/praca/.env as senhas que não podem passar por chat e cria a conta de admin (seed de produção).
# Rode do SEU terminal, fora do Claude Code — o `!` não abre terminal (as senhas são digitadas sem aparecer na tela):
#   ssh -t ubuntu@56.124.127.54 'bash /opt/praca/docs/deploy/definir-segredos.sh'
# Pode rodar de novo: Enter vazio mantém o que já está gravado; o seed não duplica nem sobrescreve nada.
set -euo pipefail
# Sem terminal (ex.: `!` do Claude Code, que não abre um) o primeiro `read` recebe EOF e o script morreria calado.
if [[ ! -t 0 ]]; then
  echo "✗ Este script precisa de um terminal para você digitar as senhas — nada foi alterado." >&2
  echo "  Abra um terminal seu (fora do Claude Code) e rode:" >&2
  echo "    ssh -t ubuntu@56.124.127.54 'bash /opt/praca/docs/deploy/definir-segredos.sh'" >&2
  exit 1
fi
cd /opt/praca
COMPOSE="docker compose -f docker-compose.prod.yml"

# KEY='valor' (aspas simples = literal para o compose; aspas simples dentro do valor não são aceitas)
set_env() {
  local k="$1" v="$2" tmp
  tmp=$(mktemp)
  grep -v "^${k}=" .env > "$tmp" || true
  printf "%s='%s'\n" "$k" "$v" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}
del_env() { local tmp; tmp=$(mktemp); grep -v "^${1}=" .env > "$tmp" || true; cat "$tmp" > .env; rm -f "$tmp"; }
tem() { grep -qE "^${1}=.+" .env; }
sem_aspas() { [[ "$1" != *"'"* ]] || { echo "  ✗ não use aspas simples (') — tente outra."; return 1; }; }

echo "== Conta de admin do Praça =="
read -rp "E-mail do admin (Enter = manter o atual): " ADMIN_EMAIL
if [[ -n "$ADMIN_EMAIL" ]]; then set_env SEED_ADMIN_EMAIL "$ADMIN_EMAIL"; fi
if tem SEED_ADMIN_EMAIL; then
  while true; do
    read -rsp "Senha do admin (mín. 8, não aparece): " P1; echo
    read -rsp "Repita a senha: " P2; echo
    [[ "$P1" == "$P2" ]] || { echo "  ✗ as senhas não batem."; continue; }
    [[ ${#P1} -ge 8 ]] || { echo "  ✗ mínimo 8 caracteres."; continue; }
    sem_aspas "$P1" || continue
    break
  done
  set_env SEED_ADMIN_PASSWORD "$P1"
  unset P1 P2
fi

echo
echo "== Conta do Freela usada pelo Praça (permissões REFERRALS e CONSULTANTS) =="
read -rp "E-mail da conta admin do Freela (Enter = pular / manter): " FREELA_EMAIL
MUDOU_FREELA=0
if [[ -n "$FREELA_EMAIL" ]]; then
  while true; do
    read -rsp "Senha dessa conta do Freela (não aparece): " FP; echo
    [[ -n "$FP" ]] || { echo "  ✗ senha vazia."; continue; }
    sem_aspas "$FP" || continue
    break
  done
  set_env FREELA_ADMIN_EMAIL "$FREELA_EMAIL"
  set_env FREELA_ADMIN_PASSWORD "$FP"
  unset FP
  MUDOU_FREELA=1
fi

chmod 600 .env

if tem SEED_ADMIN_PASSWORD; then
  echo
  echo "== Criando a praça e as contas (seed de produção) =="
  LOG=$(mktemp)
  if $COMPOSE run --rm -T api npm run seed < /dev/null > "$LOG" 2>&1; then
    grep -E "✔" "$LOG" || true
    del_env SEED_ADMIN_PASSWORD   # a senha já virou hash no banco; não fica guardada em texto
    echo "  (senha do admin apagada do .env — ela já está no banco)"
  else
    echo "  ✗ o seed falhou — nada foi apagado do .env. Últimas linhas:"
    tail -15 "$LOG"
  fi
  rm -f "$LOG"
fi

if [[ "$MUDOU_FREELA" == 1 ]]; then
  echo
  echo "== Reiniciando a API para ler a conta do Freela =="
  $COMPOSE up -d api >/dev/null
  for _ in $(seq 1 20); do curl -s -m 3 http://127.0.0.1:3014/health >/dev/null && break; sleep 2; done
fi

echo
echo "Pronto. API: $(curl -s -m 5 http://127.0.0.1:3014/health || echo 'sem resposta')"
