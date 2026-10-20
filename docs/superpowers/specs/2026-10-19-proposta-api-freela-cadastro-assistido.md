# Proposta F0: cadastro assistido de empresas no api-freela (rotas de admin)

**Data:** 19/10/2026 · **Status:** proposta escrita, aguardando aprovação do dono (Denner) para implementar no api-freela
**Escopo desta entrega:** somente este documento. Nenhum código, branch ou PR foi criado no `api-freela`.
**Repositório público:** este texto não contém segredo, senha fixa, token nem dado real. Exemplos usam valores fictícios.

Referências: `2026-10-19-prospeccao-rotas-automacao-design.md` §2.2, §2.3 e fases F0, F6, F7, F8 (§10.5).

## 1. Estado atual no api-freela (verificado, somente leitura, commit `5feacbe7`)

Todos os caminhos abaixo são relativos a `api-freela/src/shared/consultants/` salvo indicação.

| Tema | Onde | O que existe |
|---|---|---|
| Admin cria consultor | `adapters/http/admins-consultants.controller.ts:13-24` | `POST /v1/admins/consultants`; controller inteiro sob `JwtAdminGuard + AdminPermissionGuard + @RequireAdminPermission('CONSULTANTS')` (linhas 14-15). Também `GET`, `GET/PATCH :id`, `POST :id/reset-access` (linhas 26-55). |
| Senha temporária do consultor | `application/consultants-admin.service.ts:59-61` | `generateTempPassword()`: 9 bytes aleatórios em base64, sem `+/=`, cortado em 12 caracteres (cerca de 70 bits, sem garantia de classes de caractere; função duplicada em `shared/auth/application/admin-panel-users.service.ts:54`). `resetAccess` (linhas 128-160) regrava hash, `mustChangePassword=true`, zera `refreshToken` e devolve a senha em claro ao admin. |
| Hash | `shared/auth/adapters/providers/bcrypt.provider.ts` | bcryptjs, 12 rodadas, via porta `HASH_PROVIDER`. bcrypt só considera os primeiros 72 bytes; senha de 12 caracteres está dentro do limite. |
| Cadastro de empresa pelo consultor | `adapters/http/consultant-registrations.controller.ts:67-87` + `application/register-on-behalf.service.ts:89-182` | `POST /v1/consultants/me/registrations` exige `JwtConsultantGuard` (token do consultor do Freela). Cria `User` (linha 117), `UserProfile` (130), perfil de contratante (140), `ConsultantReferral` (149) e convite por WhatsApp/e-mail (169-172). |
| Senha fixa | `register-on-behalf.service.ts:36` e `:116` | A conta nasce com uma senha **constante no código**, igual para todas as contas (valor não reproduzido aqui), `mustChangePassword: true`. |
| Dados da empresa | `shared/auth/adapters/persistence/register-profile-prisma.repository.ts:376-394` | `createBarsRestaurantsContractor` grava `cep/street/neighborhood/city/number = '-'` e `uf: 'SP'` fixo; `RegisterContractorProfileInput` (`ports/outbound/register-profile-repository.port.ts:39-46`) só tem `companyName, document, segment, cityId, avatarUrl, photos`. O model `BRContractor` (`prisma/schema.prisma:1191`) já tem `companyName, corporateReason, cnpj (unique), contactName/Email/Phone, cep, street, neighborhood, city, uf, number, complement, latitude, longitude, cityId`. |
| Duplicidade | `register-on-behalf.service.ts:105-111` | `409` por e-mail ou telefone já existente. Sem chave de idempotência: reenvio de fila offline cai em `409`. |
| Vínculo consultor | `prisma/schema.prisma:182-195` | `ConsultantReferral` com `userId @unique` (1 usuário = 1 consultor), `@@index([consultantId])`, `createdAt`. |
| Listagem do consultor | `register-on-behalf.service.ts:184-215` | `active = passwordHash && !mustChangePassword` (linha 212). Só pelo token do consultor; `GET /v1/admins/consultants` traz apenas `referralsCount`. |
| Ativação | `shared/auth/application/handlers/change-user-password.handler.ts:10,42` | `user.updatePassword` zera `mustChangePassword`. **Não existe coluna com a data da troca**; `User.updatedAt` muda por qualquer motivo e não serve como `activatedAt`. |
| Throttling | `common/guards/proxy-aware-throttler.guard.ts:27-35` | `ThrottlerGuard` global; tracker por `user:<sub>` do JWT, senão IP. `@Throttle` por rota é usado em outros controllers (ex.: `consultants.controller.ts:13`). |
| Auditoria | n.d. | Não há trilha de auditoria genérica de admin reaproveitável; há `Logger` e trilhas pontuais por domínio. A proposta cria uma tabela própria e pequena (§2.5). |
| Módulos/ADRs | `docs/architecture.md`, ADR-003 | `shared/consultants` já é do Shared Kernel (permitido). Rotas novas ficam nele, sem módulo novo e sem ADR novo; registrar só uma nota no `docs/changelog.md`. |

## 2. Rotas propostas (admin, permissão `CONSULTANTS`)

Todas em `AdminsConsultantsController` (ou controller irmão `AdminsConsultantRegistrationsController` no mesmo módulo), com os mesmos guards e `@RequireAdminPermission('CONSULTANTS')`. O controller só valida formato e delega a serviços; regra mora em serviço/domínio.

Autorização: o `:id` do consultor vem da URL, mas só é aceito se existir e `isActive` (senão `404`). O admin autenticado já tem a permissão; o isolamento "consultor A não vê cadastro de B" é por vínculo `ConsultantReferral.consultantId = :id` em toda query. Formato de erro: o do Freela (`HttpExceptionFilter`, `{ error: { code, message } }` plano; CLAUDE.md do workspace) e o Praça repassa a mensagem.

### 2.1 Criar cadastro de empresa

`POST /v1/admins/consultants/:id/registrations`

Request:

```json
{
  "idempotencyKey": "b3b9a6a0-5d57-4a3e-9d0e-000000000000",
  "persona": "contractor",
  "companyName": "Padaria Exemplo",
  "corporateReason": "Exemplo Alimentos LTDA",
  "contactName": "Fulano de Tal",
  "phone": "+5511999990000",
  "email": "contato@example.com",
  "cnpj": "00.000.000/0001-00",
  "address": { "cep": "00000-000", "street": "Rua Exemplo", "number": "100", "complement": "Loja 2",
               "neighborhood": "Moema", "city": "São Paulo", "uf": "SP" },
  "lat": -23.6, "lng": -46.66
}
```

Regras:

- Obrigatórios: `idempotencyKey` (UUID), `persona` (só `"contractor"`; freelancer fora de escopo), `companyName` (1-120), `contactName` (1-120), `phone` (regex E.164 do DTO atual `registration.dto.ts`), `address.city`, `address.uf` (2 letras, lista das 27 UFs).
- Opcionais: `corporateReason`, `email`, `cnpj` (validar dígitos verificadores; vazio vira `null`, nunca `''`, por causa do `unique`), `address.cep/street/number/complement/neighborhood`, `lat/lng` (faixa do Brasil), `cityId` (se ausente, resolver por `city`+`uf` na tabela de cidades; sem match, grava `null` e segue).
- `module` fixo `bars-restaurants` (não vem do cliente; `home-services` encerrado em 08/10).
- Senha: `generateTempPassword()` melhorada para esta rota: 14 caracteres de `crypto.randomInt` sobre alfabeto sem ambíguos (sem 0/O/1/l/I), garantindo ao menos uma letra maiúscula, uma minúscula e um dígito. Hash com `HASH_PROVIDER` (bcrypt, 12). **Uma senha distinta por chamada**; nunca derivada de telefone/CNPJ/nome.
- Expiração: nova coluna `User.tempPasswordExpiresAt` (default `now()+72h`, configurável por env `CONSULTANT_TEMP_PASSWORD_TTL_HOURS`). Login com senha temporária vencida falha com `TEMP_PASSWORD_EXPIRED` e orienta pedir reemissão (§2.2) ou usar o link de definir senha. `mustChangePassword=true` obriga a troca no 1º login (já existe).
- Transação única: `User` + `UserProfile` + `BRContractor` + `ConsultantReferral` + `ConsultantRegistrationKey` + evento de auditoria. Hoje o `register` faz cinco gravações sem transação (linhas 127-156); a rota nova usa `prisma.$transaction`. Convite por WhatsApp/e-mail só **depois** do commit e é best-effort (a tela do consultor é o canal confiável, por causa de 131042/Z-API).
- Idempotência: tabela `consultant_registration_keys (key uuid unique, consultant_id, user_id, request_hash, created_at)` (migração aditiva). Mesma chave e mesmo `request_hash` devolve `200` com o mesmo `userId` e `created:false`, **sem** senha. Mesma chave com corpo diferente: `422 IDEMPOTENCY_KEY_REUSED`. Retenção: 30 dias (limpeza por script manual no início; sem `@Cron` novo).
- Conflitos: telefone ou e-mail existentes `409 PHONE_ALREADY_REGISTERED` / `EMAIL_ALREADY_REGISTERED`; CNPJ existente `409 CNPJ_ALREADY_REGISTERED`. O `409` por telefone devolve em `error.details` apenas `{ alreadyLinkedToThisConsultant: boolean }` (sem expor dado do outro usuário), para o Praça tratar "já cadastrado por você" sem adivinhar.

Resposta `201`:

```json
{ "data": {
  "userId": "uuid", "contractorId": "uuid", "created": true,
  "firstAccessPassword": "<exibida uma única vez>",
  "tempPasswordExpiresAt": "2026-10-22T15:00:00.000Z",
  "mustChangePassword": true,
  "inviteSentByWhatsApp": false, "inviteSentByEmail": false
} }
```

Erros: `400` validação (por campo, formato atual do Freela), `401/403` sem token/permissão, `404 CONSULTANT_NOT_FOUND` (inexistente ou inativo), `409` acima, `422 IDEMPOTENCY_KEY_REUSED`, `429 THROTTLED`.

Resposta com senha em claro: header `Cache-Control: no-store`; nunca logar corpo; `Logger` registra só `userId`/`consultantId`.

### 2.2 Recuperar/reemitir senha

`POST /v1/admins/consultants/:id/registrations/:userId/reset-password`

- Só vale se existir `ConsultantReferral(consultantId=:id, userId)` **e** a conta ainda **não foi ativada** (`activatedAt` nulo; ver §2.3). Conta já ativada: `409 ALREADY_ACTIVATED` (o admin do Freela usa o fluxo normal de "esqueci a senha"; a reemissão jamais sobrescreve senha escolhida pelo dono).
- Gera nova senha como em §2.1, grava hash, `mustChangePassword=true`, `tempPasswordExpiresAt` novo, zera `refreshToken`, **invalida** a senha anterior e o token de convite pendente (`replacePasswordResetToken`).
- Limite: no máximo 3 reemissões por conta em 24 h (`429 RESET_LIMIT`), para impedir o consultor de ficar girando senha.
- Resposta: `{ "data": { "firstAccessPassword": "<uma vez>", "tempPasswordExpiresAt": "..." } }`.
- Erros: `404` vínculo inexistente (inclusive conta de outro consultor, sem vazar existência), `409 ALREADY_ACTIVATED`, `429`.

### 2.3 Listar cadastros por consultor

`GET /v1/admins/consultants/:id/registrations?since=&until=&source=&status=&cursor=&limit=`

- Filtros: `since`/`until` (ISO 8601 UTC, sobre `ConsultantReferral.createdAt`; `until` exclusivo), `source` (`qr|on_behalf`), `status` (`pending|activated`), `limit` 1-200 (padrão 50), `cursor` opaco (base64 de `createdAt,id`, ordenação `createdAt asc, id asc` para o sync por cursor do Praça).
- Resposta `200`:

```json
{ "data": [ {
  "userId": "uuid", "contractorId": "uuid", "companyName": "Padaria Exemplo", "cnpj": null,
  "phone": "+5511999990000", "email": null, "source": "on_behalf",
  "createdAt": "2026-10-19T14:00:00.000Z",
  "activatedAt": "2026-10-19T18:30:00.000Z",
  "firstVacancyAt": null, "firstJobCompletedAt": null,
  "status": "activated"
} ], "meta": { "nextCursor": null } }
```

- Definições (a base do pagamento do bloco C, por isso precisam ser exatas):
  - `source`: `on_behalf` se nasceu pela rota nova ou pelo portal do consultor; `qr` se veio de `?consultor=CÓDIGO` (`ConsultantAttributionService`).
  - `activatedAt`: instante em que o dono **trocou a senha temporária** (ou definiu pelo link) pela primeira vez. Exige nova coluna `User.activatedAt` (nullable), preenchida em `change-user-password.handler.ts` e no handler de `definir-senha` quando antes era nula. Backfill único: para contas já ativas por QR, `activatedAt = createdAt` (já nascem com senha própria); para on-behalf antigas ativas, `null`/desconhecido (não usar `updatedAt`). `status = activated` quando `activatedAt` não nulo.
  - `firstVacancyAt`: `MIN(BRVacancy.createdAt)` do contratante (excluindo canceladas pelo admin, a decidir com o dono; ver §6).
  - `firstJobCompletedAt`: menor `BRJob` concluído (uso opcional pelo Praça).
- Performance: uma consulta paginada em `consultant_referrals` por `(consultant_id, created_at)` (novo índice composto) com `LEFT JOIN`/subconsultas agregadas em lote por página (sem N+1). Datas em UTC.
- Erros: `400` filtro inválido, `404` consultor, `429`.
- Campos de PII: telefone/e-mail aparecem porque o admin já os vê em `admin/contractors`; o Praça não deve gravá-los além do necessário para casar com o lead (decisão F7).

### 2.4 Limites de taxa (`@Throttle` por rota; tracker é `user:<sub>` do admin)

| Rota | Limite |
|---|---|
| `POST .../registrations` | 30 por minuto por admin; **mais** teto de negócio de 60 cadastros/dia por consultor (`429 DAILY_REGISTRATION_LIMIT`, configurável por env, 0 = sem teto) |
| `POST .../reset-password` | 10 por minuto por admin + 3 por conta/24 h (acima) |
| `GET .../registrations` | 60 por minuto por admin |

O Praça usa **uma** credencial de admin para todos os consultores; por isso o teto por consultor é no Freela, não só no Praça.

### 2.5 Auditoria

Tabela `consultant_registration_events` (append-only, sem UPDATE/DELETE no código): `id, consultant_id, user_id, action (created|password_reissued|invite_failed), actor_admin_id, source_ip (extractClientIp, mesma regra do throttler), request_id, idempotency_key, created_at`. **Nunca** guarda senha ou hash. Reemissão exige `actor_admin_id` do JWT. O campo `reason` não se aplica à criação; na reemissão o Praça manda `reason` opcional de até 200 caracteres (por que foi reemitida), gravado no evento. Logs estruturados: `consultantId`, `userId`, `action`, `requestId`.

### 2.6 Testes necessários no api-freela (jest `--runInBand`, specs em `__tests__/`)

1. Permissão: admin sem `CONSULTANTS` recebe `403` nas três rotas; sem token `401`.
2. Consultor inexistente ou inativo `404`; `:userId` de outro consultor em `reset-password` `404`.
3. Senha: duas chamadas geram senhas diferentes; cumprem o formato (tamanho 14, classes); hash confere com `HASH_PROVIDER.compare`; hash nunca aparece em resposta/log; login com a senha emitida funciona e força troca; senha reemitida invalida a anterior.
4. Expiração: login com senha vencida falha com `TEMP_PASSWORD_EXPIRED`; reemissão restaura.
5. Dados da empresa: `BRContractor` grava nome, CNPJ, telefone, endereço, UF e cidade informados (não `'-'`/`SP`); sem endereço, comportamento antigo preservado.
6. Idempotência: mesma chave e corpo = mesmo `userId`, `created:false`, sem senha; corpo diferente `422`; duas requisições simultâneas com a mesma chave criam uma só conta (unique + transação).
7. `409` por telefone, e-mail e CNPJ; `error.details.alreadyLinkedToThisConsultant`.
8. Transação: falha no meio (ex.: perfil) não deixa `User` órfão.
9. `reset-password` em conta ativada = `409`; 4ª reemissão em 24 h = `429`.
10. Listagem: paginação por cursor estável com `createdAt` iguais; filtros `since/until/source/status`; `activatedAt` correto após troca de senha; `firstVacancyAt` correto; consultor A não enxerga cadastro de B; `limit>200` rejeitado.
11. Regressão: `POST /v1/consultants/me/registrations` (portal do consultor) **inalterado** (mesmo contrato). Ver §4 sobre a senha fixa dessa rota.
12. Migração: aditiva, `prisma migrate deploy` em banco limpo; colunas novas nullable.

## 3. Alternativa: link/QR de primeiro acesso (o dono escolhe a senha)

O consultor cria o cadastro com os dados reais e o Freela devolve um **link de uso único** (`https://<web>/definir-senha?code=<token opaco de 32 bytes>`, validade 72 h, só o hash do token no banco; infraestrutura de `replacePasswordResetToken` e da tela `definir-senha` já existe, `register-on-behalf.service.ts:159-168`). O consultor mostra o QR do link na tela; o dono lê com o celular, escolhe a própria senha e aceita termos. A conta nasce **sem senha** (`passwordHash=null`), então não existe senha que o consultor possa conhecer.

| | Senha temporária (§2) | Link/QR de primeiro acesso |
|---|---|---|
| Segurança | Consultor vê a senha; pode entrar antes do dono | Melhor: ninguém além do dono define credencial |
| Atrito na visita | Consultor dita/mostra senha, dono digita e troca depois | Dono escaneia e escolhe senha na hora (1 etapa) |
| Sem internet/celular do dono | Funciona (anota senha) | Precisa de celular com câmera e rede do dono |
| Recuperação | Reemissão de senha | Reemissão do link |
| Termos/contrato | Aceite no 1º login | Aceite na própria tela |
| Risco de vazamento do link | n.a. | Link em foto/print vale até uso; mitigado por uso único, 72 h e invalidação na reemissão |
| Esforço | Médio | Baixo-médio (reaproveita o fluxo existente) |
| Ativação confiável para pagar | Heurística + travas | Mais confiável (a troca é feita pelo próprio dono, no aparelho dele) |

**Recomendação:** implementar as duas na mesma rota, com campo `accessMode: "temp_password" | "setup_link"` (padrão `setup_link` se o dono aprovar; padrão `temp_password` é o pedido original). O link/QR é o caminho preferido quando o dono do estabelecimento está presente e tem celular; a senha temporária fica como contingência. O contrato do Praça (§5) é o mesmo nos dois modos; muda só `firstAccessPassword` vs `setupLink`.

## 4. Riscos, travas e rollout

### 4.1 Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `api-freela` faz deploy automático na `main`; CI com Test&Lint falho = deploy ignorado | Mudança vai direto para produção | PR separado, só rotas novas e migração aditiva; revisão do Denner; flag `FIELD_ASSISTED_SIGNUP_ENABLED` (padrão `false`, declarada no `docker-compose.prod.yml`, senão a flag não chega ao container) fazendo as 3 rotas devolverem `404`; mergear com a flag desligada, ligar depois de sondagem. Deploy manual via script existente só como fallback (Actions já falhou por cobrança). |
| CI verde não prova boot saudável (DI) | API cai ao subir | Specs de módulo/DI e sondagem pós-deploy (`/health`, `curl` autenticado em conta de teste) |
| Migração em produção | Lock/erro | Só `ADD COLUMN` nullable e tabelas novas; `migrate deploy` no entrypoint; sem backfill pesado (backfill de `activatedAt` em SQL único e curto, após o deploy) |
| **Consultor que sabe a senha ativa a própria conta** (assume o estabelecimento, abre vaga falsa, infla o pagamento) | Fraude de comissão e acesso indevido | Travas abaixo |
| Senha em claro na tela do consultor/print | Vazamento | Exibida uma vez, `no-store`, expira em 72 h, troca obrigatória; Praça não grava (F6) |
| Praça é cliente de uma credencial admin única | Abuso se o Praça for comprometido | Teto diário por consultor no Freela; auditoria com `request_id`; credencial de admin dedicada ao Praça com **só** `CONSULTANTS` |
| Rota legada `me/registrations` mantém senha fixa | Risco existente | Fora do escopo desta proposta, mas recomendada a migração para senha aleatória em PR à parte (pergunta 6) |

### 4.2 Travas contra auto-ativação pelo consultor

1. **O consultor nunca fica com credencial reutilizável**: senha expira em 72 h e é de uso até a primeira troca; reemissão limitada e auditada.
2. **Confirmação por posse do telefone (recomendada, se o provedor de WhatsApp estiver estável)**: a troca de senha da conta criada por consultor exige um código de 6 dígitos enviado ao telefone cadastrado. Se o consultor digitou o telefone do dono, ele não consegue completar. Sem esse código, o `activatedAt` não é gravado.
3. **Sinais de fraude gravados no evento de ativação** (`activation_ip`, `activation_user_agent`): se o IP/aparelho da ativação coincide com o do cadastro (mesmo `source_ip` do evento `created` ou mesmo `User-Agent` + janela de poucos minutos), o cadastro entra como `activationReview: "suspect"` na listagem e o Praça **não conta** para pagamento sem revisão (decisão no F8).
4. **Pagamento exige mais que a ativação**: o Praça pode exigir `firstVacancyAt` (ou login em outro dia) para a faixa mais alta; a data da primeira vaga só existe se uma pessoa real usa a conta.
5. **Admin pode inspecionar**: a listagem traz `firstLoginAt` e contagem de logins (`loginCount`, opcional na v1) para revisão por amostragem (já prevista na F8).
6. Reemissão bloqueada depois da ativação (acima).

Nenhuma trava é perfeita sem a confirmação do telefone (item 2) ou o link/QR (§3); por isso eles são a recomendação.

### 4.3 Plano de PR, rollout e rollback

1. **PR único e separado no api-freela** (branch `feat/consultant-assisted-signup`, aberta só depois da aprovação): migração aditiva; DTOs; `AssistedRegistrationService` (novo, em `shared/consultants/application/`); ajuste mínimo em `RegisterContractorProfileInput` e em `createBarsRestaurantsContractor` para aceitar endereço/CNPJ/coordenadas (campos opcionais; ausência = comportamento atual); `activatedAt` no handler de troca de senha; controller; specs (§2.6); nota em `docs/changelog.md`. `RegisterOnBehalfService.register` e o portal do consultor ficam intocados.
2. **Revisão** do Denner. Merge na `main` com a flag **desligada** (nenhum comportamento muda; o auto-deploy leva só as colunas e rotas fechadas).
3. **Sondagem em produção**: declarar a flag no compose de produção, ligar, `curl` com token admin criando uma empresa de teste (dados fictícios identificados), listar, reemitir, e depois remover a conta de teste pelo procedimento de hard delete já documentado.
4. **Só então** F6/F7 do Praça (atrás de `FIELD_SIGNUP_ENABLED`/`FIELD_SIGNUP_SYNC_ENABLED`).
5. **Rollback**: (a) desligar a flag (efeito imediato, rotas voltam a `404`; contas já criadas continuam válidas); (b) `git revert` do PR (colunas/tabelas novas são aditivas e podem ficar sem uso); (c) nunca editar a migração aplicada; remover colunas só por migração nova depois. Contas criadas ficam com `ConsultantReferral` e podem ser ativadas normalmente.

## 5. O que o Praça passa a chamar (`FreelaClient`, módulo `src/modules/freela/`)

O `FreelaClient` já autentica como admin e cria o consultor (`CampoFreelaService`). Métodos novos (todos atrás da flag, retornando `503 FREELA_NOT_CONFIGURED` quando não configurado):

| Método | Chama | Fase | Notas |
|---|---|---|---|
| `createCompanyRegistration(freelaConsultantId, input)` | `POST /v1/admins/consultants/:id/registrations` | F6 | `idempotencyKey` = `client_id` do `field_signups` (UUID gerado no aparelho). A senha/link volta ao consultor na resposta HTTP do Praça e **não é gravada** nem logada. Reenvio com `created:false` mostra "cadastro já criado; gerar nova senha" |
| `reissueRegistrationPassword(freelaConsultantId, userId, reason?)` | `POST .../:userId/reset-password` | F6 | botão "gerar nova senha" |
| `listRegistrations(freelaConsultantId, {since, until, cursor, limit, source, status})` | `GET .../registrations` | F7 | job a cada 10 min com cursor persistido; upsert em `field_signups` por `(freela_user_id)`; `activatedAt` e `firstVacancyAt` alimentam o `confirmation_rule` e o pagamento (F8) |

Mapeamento: `409 PHONE_ALREADY_REGISTERED` com `alreadyLinkedToThisConsultant:true` vira "já cadastrado" ligado à visita; `429` vira "tente novamente em instantes"; mensagens de erro do Freela são mostradas como vierem. Contrato do Praça em `docs/api-contract.md` será atualizado **antes** de qualquer endpoint novo da F6 (regra do projeto). Até a F0 estar no ar, a F7 roda em modo degradado só com `referralsCount` (conferência, não pagamento).

## 6. Perguntas ao dono

1. **Aprova implementar as 3 rotas no api-freela** (PR separado, flag desligada, auto-deploy na main)? Padrão: sim.
2. **Link/QR ou senha temporária como padrão** (§3)? Recomendação: link/QR quando o dono do estabelecimento está presente; senha temporária como contingência.
3. **Exigir confirmação do telefone por código** na ativação (trava 2)? Depende do WhatsApp oficial estar pago e estável; sem ele, a trava 3 e a exigência de primeira vaga ficam como defesa.
4. **O que conta como "cadastro confirmado" para pagar**: ativação (troca de senha) ou ativação + primeira vaga? Recomendação: ativação para a faixa base, primeira vaga para bônus.
5. **`firstVacancyAt`**: contar vaga cancelada pelo admin ou criada e logo cancelada? Recomendação: ignorar canceladas pelo admin.
6. **Migrar também o portal do consultor (`me/registrations`) para senha aleatória**? Hoje todas as contas criadas por ali compartilham a mesma senha inicial. Recomendação: sim, em PR à parte e depois desta.
7. **Validade da senha temporária**: 72 h está bom? E o teto de 60 cadastros/dia por consultor?
8. **Credencial de admin dedicada ao Praça** só com a permissão `CONSULTANTS`, em vez de reaproveitar a conta atual: aprova criar?
9. **Dados reais do estabelecimento (CNPJ, razão social)** são sensíveis: confirma que o consultor pode coletar e que o Praça pode guardar só o necessário (nome, telefone, referência do Freela), sem CNPJ?

## 7. Fora de escopo

Cadastro de freelancer pelo consultor; edição de dados da empresa depois de criada; envio de e-mail/WhatsApp novo; mudança no portal do consultor; evento de domínio no Event Bus (o Praça consulta por cursor, sem acoplamento); qualquer código no Praça nesta fase.
