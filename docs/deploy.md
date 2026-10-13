# Deploy do PRAÇA (Vercel + EC2)

Mesmo desenho do gestao-de-time e do Meu Funil: **web na Vercel** (pasta `web/`), **API + Postgres em contêineres no EC2
do Freela** (`56.124.127.54`, mesma máquina do api-freela). Código no GitHub em `diegofeijodev/A-Pra-a`, branch
**`stack-freela`**. Hosts: `api-praca.freelaservicosapp.com.br` (API) e a URL `*.vercel.app` do projeto (web).

## 1. DNS (Locaweb, zona `freelaservicosapp.com.br`)

| Registro | Tipo | Valor |
|---|---|---|
| `api-praca` | A | `56.124.127.54` |

Sem o `A` o certbot não emite o certificado e a web não fala com a API.

## 2. EC2 — API e banco

```bash
# na sua máquina: empacota a árvore (sem node_modules/dist/uploads/.git/web) e manda
cd /home/doutor/coding/freela/praca
tar czf /tmp/praca-src.tgz --anchored --exclude=api/uploads --exclude=api/coverage --exclude=api/.cache --exclude=api/.env \
  --exclude=api/dist --exclude=api/node_modules --no-anchored --exclude=node_modules --exclude=.git --exclude='*.log' \
  api docker-compose.prod.yml docs/deploy
tar tzf /tmp/praca-src.tgz | grep -E '(^|/)\.env|^api/uploads|node_modules'   # só os .env.example podem aparecer
scp /tmp/praca-src.tgz ubuntu@56.124.127.54:/tmp/
# no EC2
ssh ubuntu@56.124.127.54
sudo mkdir -p /opt/praca && sudo chown ubuntu: /opt/praca
cd /opt/praca && tar xzf /tmp/praca-src.tgz && rm /tmp/praca-src.tgz
cp docs/deploy/.env.prod.example .env && chmod 600 .env    # preencha (segredos com openssl rand -hex 32; senhas via read -s)
docker compose -f docker-compose.prod.yml up -d --build    # build no EC2; as migrations rodam no boot
curl -s http://127.0.0.1:3014/health
# seed da primeira subida: o script pede e-mail/senha do admin (e a conta do Freela), grava no .env,
# roda o seed e apaga SEED_ADMIN_PASSWORD do .env se o seed passar. Rode de um terminal SEU (o `!` do
# Claude Code não abre terminal e o script recusa):  ssh -t ubuntu@56.124.127.54 'bash /opt/praca/docs/deploy/definir-segredos.sh'
# (equivale a: pôr SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD no .env, `docker compose -f docker-compose.prod.yml run --rm -T api
#  npm run seed < /dev/null` e apagar SEED_ADMIN_PASSWORD; o seed não sobrescreve nada ao rodar de novo)
# nginx + TLS (depois do DNS)
sudo cp docs/deploy/nginx-api-praca.conf /etc/nginx/sites-available/praca-api
sudo ln -sf /etc/nginx/sites-available/praca-api /etc/nginx/sites-enabled/praca-api
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api-praca.freelaservicosapp.com.br --redirect -m tecnologia.3dfranquias@gmail.com --agree-tos -n
```

- `tar --exclude` **ancorado**: sem âncora ele leva junto pastas de código com o mesmo nome.
- Tetos de memória no compose (API 768 MB, Postgres 320 MB): a máquina é do Freela de produção.
- **Seed de produção** (`api/prisma/seed-plan.ts`): cria a praça real "Belo Horizonte + Contagem" (12/10/2026–18/01/2027)
  com o roteiro inteiro, sem leads, mídia nem progresso de exemplo; o admin entra com `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`;
  Rebeca e Mkt externo nascem com senha aleatória (o admin define em Configurações → Pessoas). Nunca rode o seed sem `NODE_ENV=production`
  num servidor de verdade (criaria as contas com a senha de demonstração) — o compose de produção já fixa `NODE_ENV`.
- `docker compose run` dentro de `ssh … <<heredoc` engole o stdin: use `run -T … < /dev/null`.

Atualizar depois: antes, `docker tag praca-api:latest praca-api:pre-AAAA-MM-DD`; repita o `tar`/`scp`/`tar xzf` e
`docker compose -f docker-compose.prod.yml up -d --build api`. Rollback:
`IMAGE_TAG=pre-AAAA-MM-DD docker compose -f docker-compose.prod.yml up -d --no-build api`.

## 3. Vercel — web

```bash
cd web
npx vercel link --yes --project praca                  # cria/associa o projeto (framework: Next.js)
npx vercel env add NEXT_PUBLIC_API_URL production      # https://api-praca.freelaservicosapp.com.br
npx vercel --prod                                      # build remoto (nada pesado nesta máquina)
```

Vercel Hobby **bloqueia** deploy quando o autor do último commit não é membro do time: faça o deploy de uma cópia sem git
(`tar` do `web/` sem `node_modules`/`.next`/`.env.local`, **com** `.vercel/`) e rode `npx vercel --prod --yes` nela.
Depois ponha a URL de produção da Vercel em `APP_URL` e `CORS_ORIGINS` no `.env` do EC2 e recrie a API
(`docker compose -f docker-compose.prod.yml up -d api`). Nunca defina `NEXT_PUBLIC_DEMO_LOGIN` em produção.

## 4. Chaves (depois do ar)

1. **Freela**: `FREELA_ADMIN_EMAIL`/`FREELA_ADMIN_PASSWORD` de uma conta admin do Freela com as permissões `REFERRALS` e
   `CONSULTANTS`. Sem elas, a tela Freela e o código do consultor ficam "não configurado".
2. **Fotos dos consultores**: bucket S3 privado + chave (README, "Consultores de campo"). Sem ele, o check-in do consultor não sai do celular.

## 5. Verificação

`curl https://api-praca.freelaservicosapp.com.br/health` → 200; `docker logs praca-api | grep "successfully started"`;
abrir a URL da Vercel, entrar com o admin, conferir a praça BH e as ações de hoje. Os smokes do repositório **não** rodam
contra produção (a limpeza apaga dados).
