# Consultores de campo — bloco A (conta, jornada, visita, acompanhamento)

**Data:** 08/10/2026 · **Status:** aguardando revisão do dono · **Projeto:** `praca/`

## 1. Contexto e objetivo

O Diego decidiu concentrar o esforço na abertura de praças com **consultores de campo**: pessoas que andam a pé por um
bairro (ex.: Moema, São Paulo), visitam ~30 bares e restaurantes por dia e convencem o dono a se cadastrar no Freela. O
pedido da reunião tem quatro blocos independentes; este spec cobre só o **A**:

| Bloco | Conteúdo | Spec |
|---|---|---|
| **A** | Conta do consultor, jornada com GPS, visita (check-in com foto + questionário + checkout), acompanhamento pela equipe | **este** |
| B | Base de estabelecimentos via Apify + rota diária de 30 visitas (9h–18h, almoço 12h–13h) + mapa da expansão | depois |
| C | Remuneração 100% variável (regra diária + fechamento semanal) e confirmação dos cadastros pelo Freela | depois |
| D | Pagamento Pix automático toda segunda (carteira + Woovi/OpenPix) | depois |

O item "remover o Freela em Casa e focar a tela inicial em alimentação" **já foi feito no Freela** em 08/10 (api #573,
web #387/#391, app #166 / 1.0.40) e não faz parte deste trabalho. A versão mais recente do Lovable (`a-planner.zip`)
**não tem código novo** em relação ao zip de 09/09 que o Praça portou (só o README mudou) — nada a portar.

**Sucesso do bloco A:** um consultor criado pelo admin entra pelo celular, inicia a jornada, faz visitas com foto,
questionário e checkout (mesmo com sinal ruim), mostra o QR code do Freela ao dono do estabelecimento e encerra a
jornada; a equipe vê, por consultor e por dia, a linha do tempo, as fotos, as respostas e o mapa do trajeto; e cada
visita aparece no CRM do Praça.

## 2. Decisões tomadas com o dono (08/10)

1. **Consultores são pessoas novas** — não são os consultores que já existem no Freela. A conta nasce no Praça.
2. **Celular pelo navegador** (atalho na tela inicial / PWA), sem app nas lojas. Consequência aceita: o trajeto é
   gravado no início e no fim da jornada, em cada check-in/checkout e a cada 5 min **enquanto a página está aberta** —
   com a tela apagada não grava.
3. **Cadastro conta pelo QR code** do consultor: o Praça cria para cada consultor um código de indicação no Freela; o
   dono do estabelecimento se cadastra pelo link `…/cadastro?consultor=CÓDIGO` e o Freela vincula a conta ao consultor.
   No bloco C só contam para pagamento os cadastros que o Freela confirmar (o "cadastrou agora" do questionário é
   declaração, não conta para dinheiro).
4. **O admin cria a conta** e manda o acesso (senha provisória, troca obrigatória no primeiro acesso). Sem cadastro
   público.
5. **Abordagem 1:** consultor é um cadastro **separado** da equipe (tabela, login e telas próprios). As telas da equipe
   continuam fechadas para ele por construção.
6. **Fotos em bucket S3 privado** (não no disco do EC2, que é compartilhado com o Freela de produção e tem 11 GB livres).

## 3. Fora de escopo (neste bloco)

Rota do dia e meta de 30 visitas (B) · importação Apify (B) · mapa geral de todos os consultores (B) · confirmação dos
cadastros pelo Freela e avanço do lead para "Cadastrado" (C) · cálculo de remuneração (C) · carteira e Pix (D) ·
rastreio com a tela apagada (exigiria app nativo) · cadastro público de consultor.

## 4. Arquitetura

```
api/src/modules/campo/          ← NOVO módulo (consultor + jornada + visita)
  campo-auth.controller.ts      /v1/campo/auth/*         (público + CampoAuthGuard)
  campo.controller.ts           /v1/campo/*              (CampoAuthGuard — só o próprio consultor)
  consultores.controller.ts     /v1/consultores/*        (guard global da equipe; escrita @AdminOnly)
  campo-auth.service.ts · journeys.service.ts · visits.service.ts · consultores.service.ts
  campo-freela.service.ts       cria/atualiza o código no Freela (via FreelaClient existente)
  campo-autoclose.scheduler.ts  fechamento da meia-noite
  photo-storage.ts              interface + S3 + disco (dev)
api/src/domain/campo-rules.ts   regras puras (distância, flags, completude, carimbo de hora)
web/src/app/campo/…             telas do consultor (fora do grupo (app) — layout/guarda próprios)
web/src/app/(app)/consultores/… telas da equipe
web/src/modules/campo/…         api/hooks/fila offline do consultor
```

### 4.1 Isolamento de sessão (o ponto de segurança do bloco)

- O token do consultor é um JWT assinado com o mesmo `JWT_SECRET`, mas com **`aud: "campo"`** e `sub` = id em
  `field_consultants`.
- O `JwtAuthGuard` global (equipe) passa a **recusar explicitamente** tokens com `aud: "campo"` (hoje ele já falharia
  porque procura o `sub` em `users`, mas a recusa explícita não depende disso).
- As rotas `/v1/campo/*` são marcadas com um decorator `@CampoRoute()` que o guard global reconhece e delega ao
  `CampoAuthGuard`: exige `aud: "campo"`, carrega o consultor a cada request e recusa se `active = false` ou se o
  `token_version` do token for menor que o do banco (desativar e "nova senha" derrubam sessões abertas na hora).
- Token da equipe em `/v1/campo/*` → 401. Token de consultor em qualquer rota da equipe → 401.
- No web, a sessão do consultor vive numa chave própria (`campoSession`), separada da sessão da equipe.
- Validade do token do consultor: `CAMPO_JWT_EXPIRES_IN` (padrão `7d`) — ele não deve precisar logar todo dia na rua.

## 5. Modelo de dados (Prisma, nomes snake_case como o resto do projeto)

**`field_consultants`** — id uuid · name · email (único, minúsculo) · phone · cpf (único, só dígitos, validado) ·
praca_id (obrigatório, FK `pracas`) · pix_key · pix_key_type (`cpf|email|telefone|aleatoria`) · password_hash ·
must_change_password (default true) · token_version int (default 0) · active (default true) · freela_consultant_id? ·
freela_code? · freela_sync_error? · freela_synced_at? · created_by (FK `users`) · created_at · updated_at.

**`field_journeys`** — id · consultant_id · day (`YYYY-MM-DD`, Brasília) · client_id uuid (único — idempotência) ·
started_at · start_lat · start_lng · start_accuracy · ended_at? · end_lat? · end_lng? · end_accuracy? · auto_closed
(default false) · created_at. **Índice único parcial** `(consultant_id) WHERE ended_at IS NULL` (SQL cru na migração)
— no máximo uma jornada aberta.

**`field_points`** — id · journey_id · at (hora do aparelho) · received_at · lat · lng · accuracy ·
kind (`start|track|checkin|checkout|end`) · client_id uuid (único) · clock_adjusted bool (default false). Índice
`(journey_id, at)`.

**`field_visits`** — id · client_id uuid (único) · journey_id · consultant_id · lead_id (FK `leads`) ·
checkin_at · checkin_lat · checkin_lng · checkin_accuracy · distance_m? · far_from_place bool · photo_key ·
photo_bytes · checkout_at? · checkout_lat? · checkout_lng? · auto_closed bool (default false) · clock_adjusted bool
(default false) · respostas:
interlocutor_name · interlocutor_role (`dono|gerente|outro`) · freela_status (`ja_usa|cadastrou_qr|nao_cadastrou`) ·
interest (`alto|medio|baixo|nenhum`) · open_vagas int · vaga_roles text[] · freelas_per_week int · channels text[] ·
channel_other · needs_followup bool · followup_what? · followup_date? (`YYYY-MM-DD`) · notes · created_at ·
updated_at. Respostas ficam nulas até o rascunho ser salvo. **Índice único parcial** `(consultant_id) WHERE
checkout_at IS NULL AND auto_closed = false` — no máximo uma visita aberta.

**`leads`** (existente) — ganha `lat Float?` e `lng Float?` (nulos para os que já existem; o bloco B preenche em massa).

**`app_settings`** (existente) — ganha `field_channels Json` (lista editável de "apps e canais que usa hoje"; nasce
com `["Nenhum", "Grupos de WhatsApp", "Indicação de conhecidos", "Agência de mão de obra"]`).

## 6. API (resumo — o contrato completo entra em `docs/api-contract.md` antes do código)

### 6.1 Consultor (`/v1/campo`)

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/login` | e-mail + senha → `{ access_token, consultant, must_change_password }`; throttle por IP |
| POST | `/auth/change-password` | troca a senha (obrigatória se `must_change_password`); sobe `token_version` e devolve token novo |
| GET | `/me` | dados do consultor + `freela_code` + `signup_url` (nulos enquanto o código estiver pendente) |
| GET | `/today` | jornada aberta (se houver), visitas do dia, visita aberta, contadores |
| POST | `/journeys/start` | `{ client_id, at, lat, lng, accuracy }` → 409 `JOURNEY_ALREADY_OPEN` se já houver |
| POST | `/journeys/current/points` | lote `{ points: [{ client_id, at, lat, lng, accuracy }] }` (até 50) — idempotente |
| POST | `/journeys/current/end` | `{ at, lat, lng, accuracy }` → 409 `VISIT_OPEN` se houver visita aberta |
| GET | `/places?lat=&lng=` | estabelecimentos da praça do consultor com localização num raio de 500 m, por distância |
| GET | `/places?q=` | busca por nome na praça do consultor (não arquivados), até 20 |
| POST | `/visits` | multipart: `photo` + campos `{ client_id, at, lat, lng, accuracy, lead_id }` **ou** `{ …, new_place: { name, address } }` |
| PATCH | `/visits/:id/answers` | salva o rascunho do questionário (parcial) |
| POST | `/visits/:id/checkout` | `{ at, lat, lng, accuracy }` → 422 `ANSWERS_INCOMPLETE` com a lista do que falta |
| GET | `/visits/:id/photo` | a foto (só das visitas do próprio consultor) |

### 6.2 Equipe (`/v1/consultores`)

Leitura: qualquer pessoa da equipe. Escrita: `@AdminOnly()` (mesma regra do cadastro de pessoas).

| Método | Rota | O que faz |
|---|---|---|
| GET | `/` | lista com situação de hoje (`em_jornada|encerrou|nao_iniciou`), visitas e cadastros declarados hoje, último ponto |
| POST | `/` | cria o consultor → devolve a **senha provisória uma única vez**; dispara a criação do código no Freela |
| GET | `/:id` | detalhe |
| PATCH | `/:id` | edita; `active=false` sobe `token_version` e desativa o código no Freela |
| POST | `/:id/reset-password` | nova senha provisória (uma vez), `must_change_password=true`, sobe `token_version` |
| POST | `/:id/freela-sync` | tenta de novo criar/atualizar o código no Freela agora |
| GET | `/:id/days/:day` | jornada, pontos, visitas (com respostas e marcas) do dia |
| GET | `/visits/:visitId/photo` | a foto |
| GET/PUT | `/settings/channels` | a lista de apps e canais |

Erros no formato do projeto: `{ error: { code, message } }`; ids de URL passam por `isUuid()`.

## 7. Regras

- **Dia** = data de Brasília (`todaySp()`), inclusive para o fechamento automático.
- **Carimbo de hora:** o aparelho manda `at` (a fila offline pode enviar depois). O servidor aceita `at` entre o início
  da jornada e `agora + 2 min`, e no máximo 24 h no passado; fora disso, usa a hora de recebimento e marca
  `clock_adjusted` no ponto/visita (para não aceitar horário inventado nem perder o registro).
- **Pontos de trajeto:** o web grava um ponto a cada 5 min com a página aberta (`watchPosition` com descarte de
  pontos com `accuracy > 100 m`); check-in, checkout, início e fim sempre gravam.
- **Distância:** haversine. Se o estabelecimento tem `lat/lng` e o check-in está a mais de **200 m**,
  `far_from_place = true` (marca para a equipe, não bloqueia). Sem localização no estabelecimento, sem marca.
- **Estabelecimento novo:** antes de criar, o Praça procura na praça um lead com nome parecido num raio de 100 m e
  pergunta "Já existe 'X' a 40 m — é esse?". Se o consultor confirmar que é novo, cria o lead com
  `origem = "visita de campo"`, `classe = "alvo"`, `stage = 1`, `praca_id` do consultor, `lat/lng` do check-in e o
  endereço digitado.
- **Foto obrigatória** no check-in; o web reduz para no máximo 1600 px no lado maior, JPEG qualidade 0,75 (~300–500 KB).
  A API aceita JPEG/PNG/WEBP até 5 MB (o teto de multipart que o projeto já usa).
- **Questionário completo** (para o checkout): interlocutor (nome + cargo), situação no Freela, interesse, vagas abertas
  (número ≥ 0; se > 0, ao menos uma função), freelancers por semana (número ≥ 0), ao menos um canal (ou "Nenhum"),
  retorno (sim/não; se sim, o quê + data ≥ hoje). Observação é opcional.
- **Jornada:** uma aberta por vez; visitas só dentro de jornada aberta; encerrar exige não ter visita aberta.
- **Fechamento da meia-noite:** um `@Cron` às 00:05 (Brasília) fecha as jornadas de dias anteriores ainda abertas
  (`auto_closed = true`, `ended_at` = hora do último ponto) e as visitas sem checkout (`auto_closed = true`, ficam
  marcadas "sem checkout" e **não** atualizam o CRM). A API roda em uma instância (premissa já documentada).
- **No CRM (no checkout, numa transação):** cria `lead_events` `kind = "visita"` com o resumo das respostas e
  `author_label = "Consultor: <nome>"`; `decisor`/`decisor_role` ← interlocutor; `last_contact_at` ← checkout; se o lead
  estava em **"Lead novo" (1) ou "Contatado" (2)**, vai para **"Conversa aberta" (3)** com `stage_to` no evento (a
  visita é uma conversa presencial com o interlocutor); se pediu retorno, `next_step_what/next_step_date` recebem o
  pedido. "Cadastrado" (5) fica para o bloco C, quando o Freela confirmar.
- **Código no Freela:** ao criar o consultor, `POST /v1/admins/consultants` no api-freela com nome, e-mail, telefone,
  cidade/UF e `notes = "Consultor de campo — Praça"`; guarda `freela_consultant_id` e `freela_code`. Falha (Freela fora,
  sem permissão, e-mail já usado) → `freela_sync_error` com a mensagem; o scheduler que já roda a cada 2 min tenta de
  novo os pendentes (exceto e-mail duplicado, que exige ação do admin); a tela tem "tentar agora". Desativar no Praça →
  `PATCH` `isActive=false` no Freela (o código para de vincular cadastros).
- **Link do QR:** `${FREELA_WEB_URL}/cadastro?consultor=${freela_code}` (o cadastro do Freela web já lê
  `?consultor=`). O QR é gerado no navegador.

## 8. Telas

### 8.1 Consultor (celular, `/campo`)

- **`/campo/entrar`** — e-mail e senha. **`/campo/senha`** — troca obrigatória no primeiro acesso.
- **`/campo` (hoje)** — botão grande "Iniciar jornada" / "Encerrar jornada"; com jornada aberta: "Nova visita", a lista
  das visitas do dia (nome, hora, duração, marca "sem checkout"), contador de visitas e de "cadastrou agora", botão
  **QR code** (tela cheia, sempre a um toque) e a faixa da fila offline ("2 envios pendentes — enviando quando voltar
  o sinal").
- **Nova visita** — perto de mim · buscar por nome · novo estabelecimento → foto da fachada (câmera) → check-in.
- **Visita aberta** — questionário com salvamento automático do rascunho, botão QR, "Fazer checkout" (desabilitado com a
  lista do que falta).
- **Manifest** (`/campo` como `start_url`, ícone e nome "Praça Campo") para o atalho na tela inicial.
- Mobile-first: uma coluna, botões grandes, CTA fixo no rodapé, funciona com uma mão.

### 8.2 Equipe (`/consultores`, novo item no menu)

- **Lista** — nome, praça, situação de hoje, visitas e cadastros declarados hoje, último ponto (hora), código do Freela
  (ou "código pendente" + motivo). Botão "Novo consultor" (admin).
- **Detalhe** — seletor de dia; linha do tempo (início · visitas com foto, respostas, duração, "longe do local",
  "sem checkout" · fim, "não encerrada"); **mapa do dia** (Leaflet, já usado no projeto) com os pontos ligados na ordem
  e os check-ins destacados; ações de admin: editar, desativar, nova senha provisória, ver QR, tentar código no Freela.
- **Configurações** — nova seção "Apps e canais (campo)" para a lista editável.

## 9. Offline e erros

- O web do consultor guarda as ações pendentes numa **fila no IndexedDB** (início, pontos, check-in com o arquivo da
  foto, rascunho, checkout, fim), cada uma com `client_id` gerado no aparelho e `at` da hora real. A fila envia em ordem,
  tenta de novo com espera crescente e quando o navegador volta a ficar online. O servidor é **idempotente** por
  `client_id` (reenvio não duplica).
- Erros de regra (409/422) não são repetidos: aparecem na tela com a mensagem da API (lida com `apiErrorMessage()`).
- GPS negado → a ação não acontece e a tela mostra como liberar a localização no navegador.
- Sessão expirada no meio da fila → volta para `/campo/entrar` e **a fila continua guardada** até o login.

## 10. Fotos

- Interface `PhotoStorage { put(key, bytes, mime); get(key) }` com duas implementações: **S3** (bucket privado;
  `PHOTO_STORAGE=s3`, `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) e **disco**
  (`PHOTO_STORAGE=disk`, `PHOTOS_DIR`) para desenvolvimento.
- Em produção o padrão é `s3`; subir com `disk` exige `PHOTO_STORAGE=disk` explícito.
- Chave: `campo/<consultant_id>/<day>/<visit_id>.jpg`. A foto passa pela API (que confere quem pede) — sem link público.

## 11. Privacidade

CPF, chave Pix e localização são dados pessoais: só a equipe do Praça e o próprio consultor veem. A localização só é
coletada **com jornada aberta** (nada antes de "Iniciar" nem depois de "Encerrar"), e a tela de início diz isso.

## 12. Pré-requisitos externos (dono)

1. **Permissão `CONSULTANTS`** na conta de admin do Freela que o Praça usa (hoje ela tem só `REFERRALS`).
2. **Bucket S3 privado + chave de acesso** com permissão só nesse bucket — entram direto no `.env` do servidor.
3. **`FREELA_WEB_URL`** — o endereço público do cadastro do Freela web.
4. **E-mail de boas-vindas do Freela:** ao criar o código, o api-freela manda ao consultor um e-mail com uma senha do
   **portal de consultores do Freela**. Decisão pedida ao dono (ver §14).

## 13. Testes

- **Unidade** (`src/domain/__tests__/campo-rules.spec.ts` e serviços): distância e marca de 200 m, carimbo de hora,
  completude do questionário, transições (sem checkout sem check-in, sem encerrar com visita aberta, uma jornada
  aberta), seleção do fechamento da meia-noite, resumo do evento no CRM e regra de estágio (1/2 → 3, ≥ 3 mantém),
  idempotência por `client_id`, isolamento de tokens nos dois sentidos.
- **Smoke** (`api/scripts/smoke.sh`): fluxo completo do consultor com uma foto pequena de teste, telas da equipe, 401
  cruzados, reenvio idempotente, limpeza dos dados de teste no fim.
- **Navegador** (`web/scripts/browser-check.mjs`): viewport de celular, geolocalização simulada, `setInputFiles` para a
  foto, fila offline (simular offline → ações enfileiradas → online → enviadas), e a tela da equipe com o mapa.
- Tudo dentro das regras de baixo consumo do `CLAUDE.md` (um processo por vez; nada de `nest build`/`next build`).

## 14. Pontos em aberto para o dono

- **E-mail de boas-vindas do Freela (§12.4).** Recomendação: aceitar — o consultor ganha também o portal de consultores
  do Freela, onde vê os cadastros vinculados a ele; a equipe avisa que "o dia a dia é no Praça". Alternativa: mudar o
  api-freela para permitir criar o código sem e-mail de boas-vindas (mexe no Freela, que publica sozinho na `main`).
