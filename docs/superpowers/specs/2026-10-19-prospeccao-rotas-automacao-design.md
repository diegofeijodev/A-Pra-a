# Prospecção automática, rotas, mapa de calor e remuneração dos consultores de campo (blocos B, C e D)

**Data:** 19/10/2026 · **Status:** aguardando revisão do dono (Denner) · **Projeto:** `praca/` (+ proposta de mudança no `api-freela`)
**Parte de:** `2026-10-08-consultores-de-campo-design.md` (bloco A, no ar). Este documento detalha os blocos **B** (base de
estabelecimentos + rota + mapa), **C** (remuneração + confirmação dos cadastros) e **D** (Pix), mais a automação extra.

> Nada aqui foi implementado. A análise do `api-freela` é só leitura. Restrição da máquina do dono: nenhuma fase pode ser
> validada aqui com build/jest/tsc/servidor; os critérios de pronto abaixo são para quem executar cada fase (CI ou máquina com folga,
> sempre `jest --runInBand` + `nice`).

## 1. Pedido e leitura do pedido

| Pedido do dono | Fase que entrega |
|---|---|
| Pesquisa automática por estabelecimentos | F2 (OSM/Overpass; Apify atrás de flag) |
| Cálculo automático de rota | F3 (heurística local, sem serviço pago) |
| Roteiro para o consultor | F3 (roteiro do dia gerado ao iniciar a jornada, reotimizável) |
| Mapa de calor de onde o consultor passou | F4 (visitas + cobertura; passagem com ressalva, ver §6) |
| Cadastro inicial com senha temporária no Freela | F0 (proposta api-freela) + F6 |
| "Automatizar o máximo" | F5 (metas, alertas, follow-up, leads quentes), F7–F10 |
| Meta 30/dia, 9h–18h, almoço 12h–13h | parâmetros em `app_settings.field_config` (§4.3) |
| Remuneração 100% variável, Pix toda segunda | F8 (cálculo), F9–F10 (Pix) |

Invariantes do projeto que continuam valendo: autorização vem do token (consultor só enxerga o que é dele; equipe só
com login), dinheiro em **centavos inteiros**, razão (ledger) append-only para tudo que vira pagamento, snapshot do que
foi usado na decisão (regra, nome, endereço), erro `{ error: { code, message } }`, datas UTC no banco e dia de
Brasília via `todaySp()`, toda mutação de rede ruim idempotente por `client_id`.

## 2. O que existe hoje (verificado no código)

### 2.1 Praça (`praca/`)

- Bloco A completo: `field_consultants/journeys/points/visits`, `PlacesService` (busca só em `leads` da praça, raio 500 m,
  caixa envolvente + haversine), `nomeParecido` (100 m), `distanciaM`/`caixaEnvolvente` em `domain/campo-rules.ts`,
  `CampoAutocloseScheduler` (00:05), `CampoFreelaService` (cria o código do consultor no Freela, relógio de 2 min).
- `leads` já tem `lat/lng` + índice `(praca_id, lat, lng)`. **Não** tem precisão da coordenada nem referência de origem.
- `imports` (planilha → leads): `dedup.ts` (`findDuplicate`, `matchPraca`), `import_batches` com desfazer em 24 h, tudo numa
  transação. **Reaproveitar o dedup**, não criar importador paralelo.
- `GeoService`: `EXCLUIR = {Rio de Janeiro, São Paulo}` aplicado na carga; valida só a tela de abertura de praça (IBGE).
- `pracas`: `cobertura` é **opcional** na criação (`pracas.dto.ts`), então uma praça "Moema" já pode existir sem IBGE; mas
  `pracas.lat/lon` só são preenchidos a partir da cobertura IBGE, ou seja, **uma praça sem cobertura não tem centro**.
- Web: `ConsultorMapa.tsx` e `AberturaMapa.tsx` com Leaflet puro (sem react-leaflet), tiles em `lib/map-tiles`.
- Env validado por zod em `common/config/env.validation.ts`; produção usa `env_file: .env` (compose prod) e o compose de
  dev declara variáveis uma a uma (`${VAR:-}`); modelo em `docs/deploy/.env.prod.example`.
- Migração do bloco A criou índices **únicos parciais** só em SQL cru; o `prisma migrate dev` os tentaria dropar (ver §10.3).

### 2.2 api-freela (somente leitura; `/home/doutor/coding/freela/api-freela/src/shared/consultants/`)

| Pergunta | Resposta |
|---|---|
| Admin cria consultor + código? | **Sim.** `POST /v1/admins/consultants` (`JwtAdminGuard` + permissão `CONSULTANTS`). Gera código único (ou aceita), senha temporária de 12 chars (`generateTempPassword`), `mustChangePassword=true`, e-mail de boas-vindas. Também `GET` lista (só `referralsCount`), `GET/PATCH :id`, `POST :id/reset-access`. Já usado pelo `CampoFreelaService`. |
| Existe criar **empresa** com senha temporária? | **Existe só pelo consultor logado**: `POST /v1/consultants/me/registrations` → `RegisterOnBehalfService.register` cria `User` + `UserProfile` + perfil de contratante + `ConsultantReferral` e manda convite (WhatsApp/e-mail) com link `definir-senha`. Exige **JWT do consultor do Freela** (`JwtConsultantGuard`). |
| O Praça consegue chamar? | **Não.** O Praça só tem JWT de **admin**; o consultor de campo nunca vê a senha do portal dele no Freela (vai por e-mail). Não há rota de admin equivalente. |
| Fluxo por QR? | Existe: `?consultor=CÓDIGO` no cadastro → evento `ConsultantReferralRequested` → `ConsultantAttributionService.attribute` cria `ConsultantReferral` (best-effort, `userId` único: 1 usuário = 1 consultor; código inativo é ignorado). |
| Listar cadastros de um consultor por admin? | **Não.** `me/registrations` precisa do token do consultor; `GET /admins/consultants` só traz a contagem; `bares-restaurantes/admin/contractors` (permissão `COMPANIES`) lista todos e traz `referredByConsultant`, sem filtro por consultor e sem período. |
| O que significa "ativo" hoje? | `listRegistrations`: `active` = `passwordHash && !mustChangePassword`. Cadastro por QR já nasce com senha própria (ativo); on-behalf fica `pending` até o dono trocar a senha. |

**Problemas do `RegisterOnBehalfService` que a proposta precisa corrigir (todos vistos no código):**

1. **Senha fixa** (constante `FIRST_ACCESS_PASSWORD` no api-freela) para toda conta criada. Em escala (30 cadastros/dia/consultor) qualquer
   pessoa que saiba o telefone do estabelecimento assume a conta. **Não ampliar o uso.** A proposta usa senha aleatória por conta,
   a mesma `generateTempPassword()`. (Este repositório é público: o valor da constante não é reproduzido aqui.)
2. **Dados placeholder da empresa**: `createBarsRestaurantsContractor` grava `companyName: null`, endereço `'-'` e **`uf: 'SP'`**
   fixo; o serviço só repassa `cityId`. Empresa de Moema nasceria sem nome fantasia, sem endereço, sem CNPJ.
3. **Sem idempotência**: reenvio da fila offline cai em `409` por telefone já existente.
4. `module` aceita `home-services`/`freela-em-casa`, produto encerrado em 08/10.
5. **Termos e contrato**: conta criada por terceiro não passa pelo aceite de termos/contrato obrigatório; o dono da empresa
   aceita no primeiro acesso (deve ser dito no roteiro do consultor).
6. O convite depende do provedor de WhatsApp, hoje instável (131042/Meta e Z-API desconectada nas memórias). O canal
   confiável é **mostrar a senha temporária na tela do consultor**, uma vez.

### 2.3 Menor ajuste proposto no api-freela (PR separado, revisado pelo Denner; a main auto-deploya)

Novos endpoints, todos `JwtAdminGuard + AdminPermissionGuard + @RequireAdminPermission('CONSULTANTS')`, delegando aos
serviços existentes (nenhuma regra nova no controller):

| Método | Rota | Corpo / query | Resposta |
|---|---|---|---|
| POST | `/v1/admins/consultants/:id/registrations` | `{ idempotencyKey (uuid), persona: "contractor", companyName, contactName, phone, email?, cnpj?, address?: {cep, street, number, neighborhood, city, uf}, lat?, lng?, cityId? }` | `201 { data: { userId, contractorId, firstAccessPassword, inviteSentByWhatsApp, inviteSentByEmail, created: true } }` |
| POST | `/v1/admins/consultants/:id/registrations/:userId/reset-password` | — | `{ data: { firstAccessPassword } }` (recupera quando a resposta se perdeu; só para vínculo deste consultor) |
| GET | `/v1/admins/consultants/:id/registrations` | `since`, `until` (ISO), `persona`, `cursor`, `limit<=200` | `{ data: [ { userId, contractorId, companyName, cnpj, phone, email, source: "qr"|"on_behalf", persona, createdAt, activatedAt, firstVacancyAt, firstJobCompletedAt, status } ], meta: { nextCursor } }` |

Mudanças de implementação mínimas:

- `RegisterOnBehalfService.register` ganha parâmetro opcional `passwordMode: "fixed" | "random"` (default mantém `fixed`
  para o portal do consultor existente; as rotas novas usam `random`) e aceita `companyName/cnpj/address/lat/lng`, repassados a
  `createContractorByModule`, que deixa de gravar `'-'`/`SP` quando houver dado. `module` fixo `bars-restaurants` nas rotas novas.
- Idempotência: coluna/tabela de chave (`ConsultantRegistrationKey { key unique, userId }`); mesma chave devolve o mesmo
  `userId` e `created:false` (sem senha; a senha se recupera pela rota `reset-password`). Alternativa mais barata no Freela:
  sem chave, "adotar no 409" por telefone, como o `CampoFreelaService` já faz com o e-mail; escolher na revisão.
- `activatedAt`/`firstVacancyAt`/`firstJobCompletedAt`: leitura (`User.mustChangePassword` + `updatedAt` da troca, primeira
  vaga/job do contratante). É o que permite definir "cadastro confirmado" sem o Praça adivinhar.
- Reuso: `ConsultantReferralLookupService` já faz o `consultantId → userIds`; a rota GET só compõe com filtros.
- Testes no Freela: um spec por rota (permissão negada sem `CONSULTANTS`; consultor inativo `404`; telefone duplicado
  `409`; senha aleatória diferente a cada chamada; `passwordMode` antigo intocado).

**Como listar cadastros confirmados por código do consultor (base do bloco C):** `GET /v1/admins/consultants/:freela_consultant_id/registrations?since=<cursor>`
(o `freela_consultant_id` já é guardado em `field_consultants`). O Praça sincroniza por cursor e grava em `field_signups` (§5).
Antes da F0 do Freela ir ao ar, a F7 pode rodar em modo degradado só com `referralsCount` (contagem, sem datas): serve para
conferência, **não** para pagar.

## 3. Decisão 1 — fonte de estabelecimentos

Critério decisivo é **o direito de guardar o dado num CRM**, depois custo e qualidade.

| Fonte | Custo | Chave | Licença / termos | Qualidade p/ bar-restaurante BR | Veredito |
|---|---|---|---|---|---|
| **Overpass / OSM** (`amenity=bar|pub|restaurant|cafe|fast_food`) | 0 | nenhuma | ODbL: guardar e usar internamente é permitido; atribuição se publicar mapa derivado | Coordenada pontual boa; cobertura **irregular** (capitais melhor), telefone/horário/endereço com buracos, fechados desatualizados. Não medi percentuais: fazer comparação na praça-piloto (critério da F2) | **Padrão (primeira fonte)** |
| **Apify** (actor `compass/crawler-google-places`) | listagem diz "a partir de US$ 1,50 por 1.000 lugares"; add-ons (contatos, reviews) encarecem; conferir a aba Pricing no dia | token Apify (dono digita no servidor) | Raspa o Google Maps: risco de termos do Google (do Apify, não nosso código); dado de empresa é público, sem dado pessoal | Melhor cobertura, telefone, site, horário, nota, `fechado`/`temporariamente fechado` | **Atrás de flag + teto mensal** |
| Google Places API | pago por SKU | chave | Termos proíbem guardar o conteúdo além do `place_id` (e coordenadas por prazo curto) | Ótima | **Descartado como base do CRM** |
| Foursquare/HERE | não avaliado | | | | fora de escopo |

Fontes: [listagem do actor no Apify](https://apify.com/compass/crawler-google-places) (preço "from $1.50/1k"; terceiros divulgam
US$ 2–7/1k, tratar como estimativa). Limites de uso da instância pública do Overpass: **não verificei**; consultar a wiki do OSM
antes de produção e dimensionar para poucas consultas por dia (cada busca de praça = 1 consulta, resultado guardado).

**Caminho recomendado:** `PLACES_SOURCES=osm` no piloto (Moema). Rodar Apify uma vez na mesma área, **comparar** (qtde, telefone,
duplicidade) e só então decidir se o Apify vira rotina. Cadeia com fallback: para cada busca tenta as fontes na ordem
de `PLACES_SOURCES`; falha de uma fonte (timeout, 429, teto de orçamento) não derruba a outra; resultado de todas passa
pelo mesmo normalizador e pelo mesmo dedup.

**Regras de qualidade da coordenada** (lição do bug "0 km" do Freela 16/10, em que o CEP/sede do município virou ponto):

- Nunca geocodificar por CEP nem por município. Coordenada só entra se vier **pontual** da fonte (`point`) ou de endereço
  completo com número (`address`). Qualquer coisa menos que isso fica `street`/`city` e **não vira parada de rota**.
- `place_candidates.location_precision` e `leads.location_precision` guardam isso; o gerador de rota só usa `point|address`.
- Estabelecimento fechado (`permanentlyClosed`, ou OSM com `disused:*`/`abandoned:*`) entra como `descartado` com motivo.

**Fluxo "pesquisa automática":** a equipe escolhe **área** (§4.1) + categorias e clica "Buscar"; roda em segundo plano
(`place_import_runs`: `queued → running → done|error`; no boot, runs `running` viram `error: interrompido`). Resultado: tela
de pré-visualização (achados, novos, duplicados de leads existentes, sem telefone, descartados) e botão "Trazer N para a
base" (grava `place_candidates` como `novo`; **não vira lead ainda**, ver §5).

## 4. Decisão 2 — cobertura (São Paulo / Rio) e parâmetros

### 4.1 Áreas de atuação (resolve o conflito com Moema)

`EXCLUIR` do `GeoService` **não muda**: é regra da tela de abertura de praça por município e continua verdadeira. O trabalho
de campo passa a ter sua própria geometria:

- Nova tabela `field_areas` (praça pode ter várias): `name` ("Moema"), `lat`, `lng`, `radius_m` (200–5.000), `active`.
  Admin desenha no mapa (clique + raio), com o mesmo Leaflet do projeto. Polígono (GeoJSON) fica para depois: círculo cobre bairro.
- A praça "São Paulo – Moema" é criada **sem** `cobertura` (já permitido) e ganha áreas. Nenhuma alteração em
  `GeoService`, `/v1/geo/*` nem em `NewPracaForm`.
- Validação: centro dentro de um retângulo do Brasil, raio máximo, área pertence à praça (sempre filtrar por `praca_id`).
- Pertinência = haversine do ponto ao centro ≤ raio. Usada na busca (consulta Overpass `around:raio,lat,lng`), no filtro do
  roteiro e na camada de cobertura do mapa.
- `matchPraca(city)` do importador de planilhas continua por nome de cidade (e não casa "São Paulo"); para candidatos a praça
  é sempre explícita (vem da área). Documentar para quem importar planilha de SP.

### 4.2 Roteirização — decisão

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| OSRM público (`router.project-osrm.org`) | zero infra | uso razoável e **não comercial**, ~1 req/s por política do demo (fonte secundária), sem SLA, bloqueio sem aviso | **Fora** por política |
| OSRM próprio (perfil `foot`) | tempos reais de caminhada | Exige extrato do OSM (SP/Sudeste) e RAM; o EC2 é dividido com o Freela de produção e a API roda com `mem_limit 768m` | **Fora agora**; reavaliar só com máquina própria |
| Heurística local: haversine × fator de caminhada, vizinho mais próximo + 2-opt | sem dependência, determinística, testável em memória, n ≤ ~200 | distância em linha reta (rua real é ~20–40% maior) | **Escolhida**; fator de desvio configurável (padrão 1,3) |

Navegação em si (voz, trânsito) fica com o app do celular: cada parada traz link `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=walking` (gratuito, sem chave).

### 4.3 Parâmetros (editáveis, não são env)

Segredos e chaves de liga/desliga ficam em env; **regra de negócio ajustável sem deploy** fica em `app_settings.field_config`
(JSON validado por zod, `GET/PUT /v1/consultores/settings/config`, escrita `@AdminOnly`, cada alteração grava quem/quando):

| Chave | Padrão | Observação |
|---|---|---|
| `meta_diaria` | 30 | visitas |
| `janela` | `09:00–18:00` | horário de Brasília |
| `almoco` | `12:00–13:00` | pausa do consultor |
| `minutos_por_visita` | 8 | substituído pela mediana real do consultor nos últimos 14 dias quando houver ≥ 20 visitas |
| `velocidade_kmh` | 4,5 | caminhada |
| `fator_desvio` | 1,3 | linha reta → rua |
| `pool_fator` | 1,5 | candidatas = meta × 1,5 (reserva p/ pulos/fechados) |
| `dias_sem_revisitar` | 14 | exclui quem foi visitado há menos |
| `estagio_maximo_rota` | 4 | stage ≥ 5 (cadastrado) fora da rota |
| `janelas_evitar` | `[]` | ex.: bar só depois das 15h, almoço de restaurante; só aplica com `opening_hours` conhecido |
| `inatividade_min` | 25 | alerta "parado" (F5) |
| `fora_rota_m` / `fora_rota_min` | 400 / 20 | alerta "fora de rota" |
| `fim_automatico` | `20:00` | encerra jornada esquecida (F5) |
| `retencao_pontos_dias` | 180 | job de limpeza de `field_points` |
| `pay` | ver §7 | regra de remuneração (versionada em tabela própria, não aqui) |

**Conta do orçamento de tempo:** 09:00–18:00 = 540 min − 60 almoço = **480 min ÷ 30 = 16 min por visita**, já com
deslocamento. Com 8 min de visita sobram 8 min andando: 4,5 km/h = 75 m/min → 600 m de rua ÷ 1,3 ≈ **460 m em linha
reta entre paradas**. Ou seja, a meta de 30 só fecha onde há **~1 estabelecimento a cada 460 m ao longo da rota** (Moema
tem; subúrbio, não). O gerador simula o relógio e **corta** a lista quando estoura; a meta exibida é "30 planejadas / N
cabem". Isso vira a mensagem do admin: "área X comporta ~N visitas/dia".

## 5. Modelo de dados (Prisma + SQL; todas as migrações aditivas)

Convenção do repo: snake_case, `uuid`, dia como `YYYY-MM-DD` string de Brasília, instantes em `DateTime` UTC.

| Tabela | Campos principais | Constraints / índices |
|---|---|---|
| `field_areas` | `id, praca_id FK, name, lat, lng, radius_m, active, created_by, created_at` | `CHECK radius_m BETWEEN 200 AND 5000`; índice `(praca_id, active)` |
| `leads` (+colunas) | `location_precision text?`, `source_ref text?`, `source text?` | índice parcial único `(source, source_ref) WHERE source_ref IS NOT NULL` (SQL cru) |
| `place_import_runs` | `id, praca_id, area_id, source, params json, status, requested_by, started_at, finished_at, found, inserted, duplicates, discarded, error, est_cost_usd` | índice `(praca_id, started_at desc)` |
| `place_candidates` | `id, praca_id, area_id, run_id, source, source_ref, name, category, address, lat, lng, location_precision, phone, phone_key, website, opening_hours json?, rating?, reviews?, closed_state, status (novo\|promovido\|duplicado\|descartado), discard_reason, lead_id?, created_at` | `UNIQUE(source, source_ref)`; índices `(praca_id, status)`, `(praca_id, lat, lng)` |
| `field_routes` | `id, consultant_id, day, journey_id?, area_id?, status (ativa\|encerrada), version int, params_snapshot json, generated_at, generated_from_lat/lng` | índice único parcial `(consultant_id, day) WHERE status='ativa'` (SQL cru) |
| `field_route_stops` | `id, route_id, lead_id, day, seq, eta, planned_minutes, kind (obrigatoria\|planejada\|reserva), status (pendente\|visitada\|pulada\|descartada), skip_reason, visit_id?, name_snap, address_snap, lat_snap, lng_snap` | índice único parcial `(lead_id, day) WHERE status IN ('pendente','visitada')` (SQL cru, **dois consultores nunca recebem o mesmo lugar no dia**); índice `(route_id, seq)` |
| `field_signups` | `id, client_id uuid UNIQUE, consultant_id, visit_id?, lead_id?, freela_user_id? UNIQUE, freela_contractor_id?, source (assistido\|qr), company_name, cnpj?, phone_key, registered_at, activated_at?, first_vacancy_at?, first_job_at?, confirmed_at?, confirmation_rule, status (pendente\|confirmado\|rejeitado), reject_reason, last_error` | índices `(consultant_id, registered_at)`, `(phone_key)`, `(cnpj)` |
| `field_pay_rules` | `id, valid_from date, params json, created_by, created_at` | versionada: regra nova vale a partir de `valid_from`; nunca editar linha antiga |
| `field_payout_entries` (**ledger append-only**) | `id, consultant_id, day, week_start, kind (ganho\|ajuste\|pagamento\|estorno), amount_cents int, rule_id, rule_snapshot json, signups int, visits int, reverses_id?, reason, created_by?, created_at` | sem UPDATE/DELETE no código; `CHECK (kind<>'ajuste' OR reason IS NOT NULL)`; índice `(consultant_id, week_start)` |
| `field_payout_closings` | `id, consultant_id, week_start, status (aberta\|fechada\|paga\|erro), total_cents, closed_at` | `UNIQUE(consultant_id, week_start)` |
| `field_payout_payments` | `id, closing_id, amount_cents, pix_key_type, pix_key_snapshot, method (manual\|woovi), correlation_id UNIQUE, provider_ref, status, paid_at, error, created_by` | idempotência por `correlation_id` (= id do fechamento) |
| `field_alerts` | `id, consultant_id, day, kind, at, detail json, resolved_at` | `UNIQUE(consultant_id, day, kind, bucket)` p/ não repetir o mesmo alerta |

Regras de dados:

- **Candidato ≠ lead.** Milhares de pontos do OSM/Apify não entram no funil (cadências e disparos veem `leads`). O candidato
  vira lead **ao entrar na rota** (transação: cria `lead` com `origem='prospecção de campo'`, `classe='alvo'`, `stage=1`,
  `source/source_ref`, `location_precision`, `praca_id`, e marca o candidato `promovido`). Antes de promover, dedup pelo mesmo
  `findDuplicate` do importador (telefone/nome+endereço) **e** `nomeParecido` ≤ 100 m contra leads existentes → `duplicado`
  apontando `lead_id` (e o lead existente, se tiver coordenada boa, entra na rota no lugar).
- **Snapshot na parada** (nome/endereço/coordenada): corrigir o lead depois não reescreve o roteiro do dia.
- **`leads.lat/lng`** passam a receber a coordenada do candidato promovido (era nulo nos antigos).
- Exclusão de lead com parada: FK `field_route_stops.lead_id` em `ON DELETE RESTRICT`; `DELETE /v1/leads/:id` passa a responder `409 LEAD_IN_ROUTE`
  (FK não depende de data). O histórico do roteiro mora nas colunas de snapshot da parada. `field_signups.lead_id` e `place_candidates.lead_id` em `SET NULL`.

## 6. Roteiro do dia (F3), mapa de calor (F4)

### 6.1 Algoritmo (funções puras em `api/src/domain/rota-rules.ts`, testáveis sem banco)

Entrada: posição inicial `{lat,lng}`, hora de partida, config (§4.3), candidatos já filtrados. Saída: paradas ordenadas com ETA + reserva.

1. **Filtro** (no serviço, SQL com caixa envolvente + área): lead da praça, na área, `archived=false`, não bloqueado
   (`blocklist`), `stage < estagio_maximo_rota`, `location_precision IN (point, address)`, sem visita nos últimos
   `dias_sem_revisitar`, não alocado hoje a outro consultor.
2. **Obrigatórias primeiro**: retornos pedidos para hoje (`next_step_date <= hoje` com evento `visit`/`needs_followup`) e
   leads quentes (interesse alto/médio sem cadastro) da vez; entram independente do raio (limite de 1/3 da meta).
3. **Seleção**: a partir da posição, pega vizinho mais próximo encadeado até `meta × pool_fator` candidatas (cluster
   contíguo, não "as N mais próximas de um ponto", que espalha para os lados).
4. **Ordem**: vizinho mais próximo + **2-opt** em caminho aberto (O(n²), n ≤ 60, ms). Teste de propriedade: custo(2-opt) ≤ custo(NN).
5. **Relógio**: simula `t += deslocamento(haversine×fator/velocidade) + minutos_por_visita`; se a chegada cairia dentro do
   almoço, a parada seguinte começa às 13:00; com `opening_hours` conhecido e `janelas_evitar`, parada fora do horário é
   empurrada ou vira reserva. Para ao atingir `meta` ou `janela.fim`. O que sobra vira `reserva` (até 10).
6. **Idempotência / concorrência**: gerar = transação que cria rota `ativa` + paradas; índice único parcial `(lead_id, day)`
   garante que dois consultores não levam o mesmo lugar (perdedor refaz a seleção sem os já alocados, 1 retry). Gerar de novo
   no mesmo dia devolve a ativa (idempotente por `(consultant, day)`). **Uma rota por consultor por dia**: reotimizar atualiza a mesma
   rota em transação (`seq`, `eta`, `kind`, `status` das paradas; paradas que saem viram `descartada`, as que entram são inseridas),
   incrementa `field_routes.version` e guarda o histórico de versões em `params_snapshot.versoes[]`. Assim o índice único parcial
   `(lead_id, day)` nunca colide com a própria rota.
7. **Quando gera**: **no início da jornada** (`POST /v1/campo/route/generate`, chamado pelo web logo após `journeys/start`
   com a posição real) ou sob demanda; sem cron (posição real é o dado que importa). Jornada sem rota continua funcionando.
8. **Reotimização** (`POST /route/reoptimize {lat,lng}`): mantém visitadas, recalcula pendentes a partir da posição e da hora
   atuais, pode trazer reservas e derrubar o que não cabe; sobe `version` da mesma rota (sem rota nova). Dispara: botão
   "recalcular", pulo de parada com motivo, checkout com atraso > 20 min. Offline: o web guarda a última rota (IndexedDB, como
   a fila) e continua mostrando a ordem; pular/visitar entra na fila e o servidor reotimiza ao voltar.
9. **Check-in numa parada** liga `visit_id` e marca `visitada` (sem exigir que o check-in seja a próxima); check-in fora da
   rota continua permitido (visita avulsa não quebra a rota).

Endpoints (todos `/v1/campo`, **com `@CampoRoute()`** — sem o decorator a rota fica fechada ao consultor; só o próprio consultor; contrato a ser escrito em `api-contract.md` §22 **antes** do código):
`GET /route/today`, `POST /route/generate`, `POST /route/reoptimize`, `POST /route/stops/:id/skip {reason}`,
`POST /route/stops/:id/swap-reserve`. Equipe: `GET /v1/consultores/:id/days/:day` passa a trazer a rota planejada × realizada.

### 6.2 Mapa de calor — decisão

Os `field_points` são gravados no início/fim, em check-in/checkout e **a cada 5 min só com a página aberta** (§2 do bloco A):
um "mapa de calor de por onde andou" feito disso **engana** (parece que só passou nos pontos). Por isso:

| Camada | Fonte | Mostra | Confiável? |
|---|---|---|---|
| **Visitas** (padrão) | `field_visits.checkin_lat/lng` | onde houve visita, por célula | Sim |
| **Cobertura** | `leads`/candidatos da área × visitas no período | % visitado por célula, "branco" = não visitado (guia a expansão) | Sim |
| **Passagem** (opcional) | `field_points` | tempo aproximado por célula | **Aproximada**; legenda obrigatória "trajeto amostrado a cada ~5 min com o app aberto" |

- **Agregação no servidor, em grade**: `GET /v1/consultores/heatmap?praca_id&area_id&consultant_id&from&to&layer=visitas|cobertura|passagem&cell_m=100|250|500`.
  SQL `GROUP BY floor(lat/Δlat), floor(lng/Δlng)` com Δ derivado de `cell_m`; resposta: `[{lat,lng,n,visited,total}]` (centro da
  célula), teto de 5.000 células (senão pede célula maior). Sem plugin `leaflet.heat` (pontos individuais iriam ao cliente,
  mais volume e privacidade pior): desenha-se **retângulos coloridos** por célula no Leaflet que já existe, zero dependência nova.
- Filtros: período (≤ 92 dias), consultor, praça, área. Escrita nenhuma; leitura para toda a equipe. No `consultores.controller`, `heatmap` e `settings/config` ficam **antes** das rotas `:id`.
- Privacidade (LGPD): localização individual só da equipe; coletada apenas com jornada aberta (já avisado ao consultor). Camada
  por consultor mostra dado individual; a visão padrão é agregada. Retenção dos pontos brutos em `retencao_pontos_dias`
  (job diário 03:30 apaga pontos `track` mais antigos; check-ins/visitas ficam).
- Melhoria barata opcional da camada "Passagem": **Wake Lock API** mantém a tela acesa durante a jornada e intervalo adaptativo
  (2 min se deslocou > 100 m). Troca bateria por qualidade; vira decisão do dono, fora do mínimo.

## 7. Remuneração (F8) — ambiguidade resolvida em parâmetros

Texto da reunião: piso R$ 100/diária **ou** R$ 10/cadastro; "10 de 30 = mínimo da diária"; "20–25 cadastros = R$ 250".
Leitura adotada, que reproduz as três frases: `valor_dia = max(cadastros × unit, maior faixa_fixa atingida)`.

```json
{ "unit_cents": 1000,
  "faixas_fixas": [ { "min_cadastros": 10, "valor_cents": 10000 }, { "min_cadastros": 20, "valor_cents": 25000 } ],
  "min_cadastros_para_diaria": 10,
  "teto_dia_cents": null,
  "confirmation_rule": "activated",
  "grace_days": 7,
  "min_pagamento_semana_cents": 0 }
```

| Cadastros confirmados no dia | Pago (padrão) |
|---|---|
| 0–9 | `n × R$ 10` (**sem piso**: remuneração é 100% variável; a frase "10 de 30" é o ponto de partida do piso) |
| 10 | R$ 100 (piso e unitário coincidem) |
| 20–25 | R$ 250 (20 → faixa fixa; 25 → 25 × 10) |
| 30 | R$ 300 |

Pontos em aberto para o dono: se existe piso mesmo abaixo de 10 (`min_cadastros_para_diaria` vs `piso_sempre`), e se há teto.

**Quando um cadastro "conta"** (`confirmation_rule`): `referral` (vínculo criado) < `activated` (dono trocou a senha / definiu a
própria) < `first_vacancy` < `first_job_completed`. Padrão `activated`, mais as travas abaixo; subir de nível se houver abuso.

- **Fraude no fluxo assistido**: o consultor *sabe* a senha temporária e poderia "ativar" a conta sozinho. Mitigações: (a) só
  contam **empresas** (freelancers se cadastram pelo mesmo link); (b) **assistido**: atrelado a uma visita **com foto no mesmo dia** do mesmo consultor; **QR**: o consultor teve visita a lead
  correspondente ou jornada aberta na praça dentro de `grace_days` antes do `registered_at` (o dono costuma se cadastrar depois e o telefone dele raramente
  bate com o do OSM, então não exigir casamento por telefone); (c) telefone/CNPJ únicos e diferentes dos do próprio consultor; (d) limite diário de cadastros assistidos por consultor
  (padrão 40) e fila de **auditoria por amostragem** na tela da equipe (10% semanais com foto + dados); (e) o link de definir
  senha (WhatsApp/e-mail) é o canal oficial e a senha temporária o plano B, dito no roteiro do consultor.
- **Dia do cadastro** = dia de Brasília do `registered_at`. Confirmação tardia dentro de `grace_days` recalcula aquele dia.
- **Ledger, sem editar o passado**: job diário 00:20 (dia anterior + últimos 7 dias) calcula o ganho do dia com a regra vigente
  (`valid_from`), compara com a soma das entradas daquele dia e grava **só a diferença** como `ganho`/`ajuste` com `rule_snapshot`. Semana
  já `fechada` **não é reaberta**: a diferença cai na semana corrente com `reason = "confirmação tardia de <dia>"`.
- **Fechamento semanal**: segunda 06:00 (Brasília) fecha seg–dom anterior em `field_payout_closings` (total = soma do ledger), vira o
  que será pago na segunda. Ajuste manual (admin) exige `reason`; estorno referencia a entrada original (`reverses_id`).
- Dinheiro sempre em **centavos inteiros**; exibição formata em R$.
- Recalcular com regra nova só vale daqui para frente; dias passados mantêm o `rule_snapshot` que usaram.

## 8. Pix (D) — F9 manual, F10 automático

- **F9 (manual, sem integração)**: tela "Pagamentos da semana" lista fechamentos com valor, nome, tipo/chave Pix (já validada no cadastro),
  botão copiar e exportar CSV; "Marcar como pago" exige data e identificador do comprovante e grava `field_payout_payments(method='manual')` + entrada `pagamento` no ledger. Entrega o fluxo de segunda-feira sem risco financeiro.
- **F10 (automático, `FIELD_PIX_PAYOUT_ENABLED=false` por padrão)**: pagamento por Pix via **API da Woovi/OpenPix** (confirmar endpoints,
  limites e exigência de aprovação na documentação vigente no dia; não verificado neste documento). Regras duras:
  - **Conta Woovi própria do Praça**, nunca a do Freela: lição de bloqueio por excesso de tentativas com chaves Pix inexistentes; misturar
    contas arriscaria o mesmo bloqueio nos dois sistemas.
  - `correlationID` = `closing_id` (idempotência: re-executar não paga duas vezes); status final por webhook assinado (corpo cru + HMAC),
    com reconciliação por consulta; `FAILED` **gera alerta e fica visível na tela** (lição do Freela: pagamento `FAILED` sem alerta nem nova tentativa).
  - **Validar a chave antes** (tipo × formato × dígitos de CPF/CNPJ) e não tentar chave inválida; teto de valor por pagamento e por execução;
    modo `dry-run`; aprovação por um admin (botão "Pagar semana") em vez de cron cego nas primeiras semanas; um pagamento por vez.
  - Segredos `WOOVI_APP_ID`, `WOOVI_WEBHOOK_SECRET`: o **dono digita no servidor**, nunca via chat/repositório.
- Pré-requisito do dono: conta/saldo Woovi disponível e decidir o limite semanal.

## 9. Automação extra — impacto × esforço

| # | Automação | Impacto | Esforço | Fase |
|---|---|---|---|---|
| 1 | Meta do dia com progresso na tela (12/30, "cabem N") + resumo diário da equipe | Alto | Baixo | F3/F5 |
| 2 | **Follow-up agendado entra sozinho na rota** do dia (`followup_date`) e vira lembrete | Alto | Baixo | F3/F5 |
| 3 | Fila de **leads quentes** (interesse alto/médio, sem cadastro): lista de retorno + obrigatórias na rota seguinte | Alto | Baixo | F5 |
| 4 | Alerta **consultor parado** (jornada aberta sem ponto/visita há `inatividade_min`) | Médio-alto | Baixo | F5 |
| 5 | Alerta **fora de rota** (distância da última posição à próxima parada > `fora_rota_m` por `fora_rota_min`) | Médio | Médio | F5 |
| 6 | **Fim automático da jornada** às `fim_automatico` (hoje só às 00:05): protege a privacidade e fecha o dia certo | Médio | Baixo | F5 |
| 7 | Cadastro assistido na própria visita (senha temporária na tela) | Muito alto | Médio (depende do Freela) | F6 |
| 8 | Sync de cadastros confirmados + lead sobe para "Cadastrado" (5) com evento | Muito alto | Médio | F7 |
| 9 | Pagamento semanal calculado sozinho (ledger + fechamento segunda) | Alto | Médio | F8 |
| 10 | Pix automático | Médio (valor) / Alto (risco) | Alto | F10 |
| 11 | Wake Lock + rastreio adaptativo | Médio | Baixo | opcional |
| 12 | Reaproveitar candidato "descartado" por fechado → monitorar reabertura | Baixo | Médio | não fazer agora |

Alertas saem pelo sistema de notificações do Praça (`/v1/notifications`, tela da equipe); **sem** WhatsApp/push no consultor nesta
versão (canal instável). `field_alerts` evita repetir o mesmo alerta; todos os crons com `try/catch` interno e trava `rodando`.

## 10. Plano — fases, contratos, env, jobs, testes

### 10.1 Regras gerais de execução

- **Contrato antes do código**: cada fase começa atualizando `docs/api-contract.md` (§21 Áreas e base, §22 Roteiro, §23 Mapa de calor,
  §24 Cadastro assistido e sync, §25 Remuneração, §26 Pix; atualizar §18/§20.6 onde mexer na integração com o Freela) e termina
  registrando "desvios propositais" (§19/§20.9).
- Cada fase é um PR independente, aditivo, mergeável com a flag desligada. Fases que tocam produção (F2 Apify, F3, F6–F10) nascem
  **atrás de flag env**; leitura pura (F1, F4) não precisa.
- Migrações: todas aditivas (tabela/coluna nova nullable); podem ir à produção **antes** do código.

### 10.2 Variáveis de ambiente (zod em `env.validation.ts`, `docker-compose.yml` dev com `${VAR:-}`, `docs/deploy/.env.prod.example`)

| Variável | Padrão | Fase | Observação |
|---|---|---|---|
| `PLACES_SOURCES` | `osm` | F2 | ordem de fontes: `osm`, `apify` |
| `OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | F2 | trocar de instância sem deploy de código |
| `PLACES_USER_AGENT` | `praca-freela/1.0 (contato)` | F2 | identificação exigida pelas instâncias públicas |
| `APIFY_ENABLED` | `false` | F2 | |
| `APIFY_TOKEN` | vazio | F2 | **segredo; o dono digita no servidor** |
| `APIFY_ACTOR_ID` | `compass~crawler-google-places` | F2 | |
| `APIFY_MAX_PLACES_PER_RUN` / `APIFY_MONTHLY_PLACES_CAP` | `500` / `3000` | F2 | teto duro contado em `place_import_runs` |
| `FIELD_ROUTES_ENABLED` | `false` | F3 | |
| `FIELD_ALERTS_ENABLED` | `false` | F5 | |
| `FIELD_SIGNUP_ENABLED` | `false` | F6 | |
| `FIELD_SIGNUP_SYNC_ENABLED` | `false` | F7 | |
| `FIELD_PAYROLL_ENABLED` | `false` | F8 | cálculo e fechamento |
| `FIELD_PIX_PAYOUT_ENABLED` | `false` | F10 | |
| `WOOVI_APP_ID`, `WOOVI_API_URL`, `WOOVI_WEBHOOK_SECRET` | vazio | F10 | **segredos; dono digita no servidor** |

Parâmetros de negócio (§4.3) **não** são env. A API roda em **instância única**: todo `@Cron` tem `rodando` + `try/catch` (exceção não tratada derruba o processo).

### 10.3 Migrações — cuidado com os índices parciais

Os índices únicos parciais do bloco A (`field_journeys_one_open_per_consultant`, `field_visits_one_open_per_consultant`) vivem só no SQL.
Para **cada** fase com schema novo: `prisma migrate dev --create-only --name <fase>`, abrir o `.sql` gerado e **remover qualquer `DROP INDEX` desses dois
índices**, acrescentar à mão os novos parciais (`field_routes`, `field_route_stops`, `leads(source, source_ref)`) e só então aplicar. Conferir com
`prisma migrate diff` que um novo `migrate dev` não propõe dropar nada. Nunca editar migração já aplicada. **Cada índice parcial novo entra no mesmo grupo de risco**: a fase que o cria deve acrescentar o nome dele
ao aviso do `CLAUDE.md` e ao comentário da migração (mesma redação do repo: gerar com `--create-only`, apagar as linhas `DROP`, aplicar com `migrate deploy`).
Lista prevista: `field_routes_one_active_per_day`, `field_route_stops_lead_day_unique`, `leads_source_ref_unique`.

### 10.4 Jobs (instância única)

| Job | Quando | Fase |
|---|---|---|
| Execução de busca de estabelecimentos | sob demanda (em segundo plano), reconciliação `running→error` no boot | F2 |
| Alertas (parado / fora de rota) | a cada 5 min, 09:00–19:00 seg–sáb | F5 |
| Fim automático da jornada | `fim_automatico` (padrão 20:00) | F5 |
| Retenção de `field_points` | diário 03:30 | F4 |
| Sync de cadastros do Freela | a cada 10 min (06–23h), cursor persistido | F7 |
| Cálculo diário da remuneração | 00:20 (dia anterior + 7 dias) | F8 |
| Fechamento semanal | segunda 06:00 (Brasília) | F8 |
| Reconciliação Pix | a cada 10 min enquanto houver pagamento `processando` | F10 |

### 10.5 Fases

Dependências: F0 independente e deve começar já (o Freela demora para revisar); F1 → F2 → F3; F4: camada de visitas depende só de F1; camada de cobertura depende de F2 (candidatos);
F5 depende de F3; F6 depende de F0 deployado; F7 depende de F0; F8 depende de F7; F9 de F8; F10 de F9.

| # | Fase | Entrega | Critérios de pronto |
|---|---|---|---|
| **F0** | Proposta api-freela + contrato (sem código no Praça) | PR no api-freela com as 3 rotas de §2.3 (senha aleatória, dados da empresa, idempotência, `activatedAt`/`firstVacancyAt`); texto em `api-contract.md` §24 | Specs do Freela cobrindo permissão, `409`, senha distinta por chamada e `passwordMode` antigo intocado; revisão do Denner; deploy do Freela com sondagem manual (`curl` com token admin em conta de teste) antes de F6 |
| **F1** | Áreas de atuação | `field_areas`, CRUD admin `/v1/areas`, desenho no mapa (Leaflet), praça sem cobertura funciona | Contrato escrito; migração `--create-only` sem `DROP` dos parciais; testes: raio/pertinência, validação Brasil, área de outra praça `404`; criar praça Moema sem IBGE e área; `GeoService`/`EXCLUIR` intocados |
| **F2** | Pesquisa automática | `place_import_runs`, `place_candidates`, adaptadores Overpass (e Apify atrás de flag), normalizador, dedup com leads, pré-visualização + "trazer", `leads.location_precision/source` | Fixtures de resposta Overpass e Apify no repo; testes do normalizador (endereço, categoria, fechados, precisão), dedup (telefone, nome+100 m, `source_ref`), teto Apify; falha de fonte não derruba a outra; **piloto Moema**: relatório comparando OSM × Apify (qtde, % com telefone, duplicados) para o dono decidir; token nunca em log |
| **F3** | Roteiro do dia | `rota-rules.ts`, `field_routes/stops`, endpoints §6.1, tela do consultor (lista ordenada, ETA, abrir no mapa, pular com motivo, "recalcular", meta N/30), plano × realizado na equipe | `rota-rules.spec` (orçamento 480 min, almoço pulado, 2-opt ≤ NN, corte por janela, reotimização a partir de posição, determinismo, obrigatórias primeiro, filtros); duas rotas simultâneas sem lugar repetido (teste de concorrência com índice parcial); consultor A não lê rota de B (`404`); `smoke.sh` estendido; `FIELD_ROUTES_ENABLED=false` mantém o fluxo do bloco A idêntico |
| **F4** | Mapa de calor e cobertura | `GET /v1/consultores/heatmap` (3 camadas), tela da equipe com filtros (período, consultor, praça, área), legenda de precisão, job de retenção | `heat-grid.spec` (célula, agregação, teto de células, fronteiras de período); resposta sem pontos individuais na camada visitas/cobertura; legenda "amostrado ~5 min" na camada passagem; retenção apaga só `track`; vitest só da escala de cor e do cálculo de bounds |
| **F5** | Metas, alertas e follow-up | `field_config` + tela, alertas parado/fora de rota, fim automático, fila de leads quentes, follow-up entra na rota (F3) | Regras puras testadas (`inatividade`, `fora_de_rota`, seleção de quentes, `followup_date <= hoje`); alerta não repete (`UNIQUE`); crons com guarda; configuração só `@AdminOnly` e auditada |
| **F6** | Cadastro assistido com senha temporária | `POST /v1/campo/visits/:ref/signup` (chama a rota nova do Freela), tela na visita (dados da empresa → senha temporária **uma vez**, nunca gravada), `field_signups` com `client_id`, "gerar nova senha" via rota de reset | Online-only declarado na tela; idempotência por `client_id` (reenvio não cria 2ª conta); `409` por telefone existente vira "já cadastrado" com vínculo à visita; erro do Freela mostrado com a mensagem dele; `freela_status` da visita preenchido; teste: senha ausente em log/resposta de listagem; atrás de `FIELD_SIGNUP_ENABLED` |
| **F7** | Sync dos cadastros confirmados | job com cursor, upsert em `field_signups` (inclui os de **QR**), casamento com lead (telefone/CNPJ), lead → "Cadastrado" (5) com `lead_events`, tela "Cadastros por consultor" | Idempotente (mesmo item 2× = 1 linha); consultor inativo no Freela não some; casamento ambíguo vai para fila de revisão; teste de regra `confirmation_rule`; atrás de flag |
| **F8** | Remuneração (bloco C) | `field_pay_rules`, ledger, cálculo diário, fechamento semanal, tela de remuneração (por dia/semana, ajuste com motivo, auditoria por amostragem) | `pay-rules.spec` (0, 9, 10, 19, 20, 25, 30 cadastros; teto; regra por `valid_from`; confirmação tardia gera delta e **não** reabre semana fechada; centavos inteiros); ledger sem UPDATE/DELETE no código; ajuste sem `reason` rejeitado; fechamento duplicado impossível (`UNIQUE`); atrás de flag, rodar 2 semanas **em sombra** conferindo à mão |
| **F9** | Pix manual (D0) | tela "Pagamentos da semana", exportar CSV, marcar como pago com comprovante | Chave Pix validada; pago 2× bloqueado; ledger com `pagamento`; dono confirma uma segunda real |
| **F10** | Pix automático (D1) | integração Woovi própria atrás de flag, webhook, reconciliação, dry-run, aprovação de admin | Segredos só no servidor; `correlation_id` único; webhook assina e usa corpo cru; `FAILED` alerta e é reexecutável manualmente; teto e dry-run; só liga após ≥ 2 semanas de F8/F9 conferidas e conta Woovi separada aprovada pelo dono |

### 10.6 Estratégia de testes

- **API**: `jest --runInBand` (maxWorkers 1), regra pura em `src/domain/__tests__/` (`rota-rules`, `pay-rules`, `heat-grid`, `places-normalize`, `alert-rules`),
  serviços com Prisma real no padrão do repo; **isolamento** em cada módulo novo ("consultor A não lê/altera de B", "equipe sem login → 401", token de consultor
  em rota da equipe → 401).
- **Web**: vitest só lógica pura (ordem/ETA formatados, link de navegação, escala de cor do mapa, cache offline da rota); telas validadas no
  `browser-check.mjs` com geolocalização simulada, rodado pelo dono ou CI.
- **Smoke** (`api/scripts/smoke.sh`): acrescentar por fase um bloco curto (gera rota, pula parada, check-in na parada), limpando os dados de teste no fim.
- Nada de `nest build`/`next build`/`tsc`/servidor nesta máquina; a verificação é em CI ou máquina com folga.

## 11. Riscos

| Risco | Prob. | Impacto | Resposta |
|---|---|---|---|
| Cobertura do OSM insuficiente para a meta de 30 | Alta | Alto | Piloto comparado ao Apify (F2); "área comporta N" visível ao admin; Apify atrás de flag |
| Apify: custo estourar / termos do Google | Média | Médio | Teto por run e mensal em env, contagem em tabela, só admin dispara; decisão do dono |
| Coordenada ruim vira parada errada ("0 km") | Média | Alto | `location_precision`; só `point/address` entram na rota; check-in já marca `far_from_place` |
| Fraude em R$ 10/cadastro (consultor ativa a conta) | Média | Alto | Regra `activated` + travas do §7, amostragem, subir para `first_vacancy` se preciso |
| Senha fixa do Freela replicada em massa | Alta se não corrigir | Alto | F0 exige senha aleatória; Praça nunca grava a senha |
| Mudança no Freela (deploy automático na main) quebra o app deles | Baixa | Alto | Só rotas **novas**; `passwordMode` default preservado; specs; deploy fora de horário de pico |
| Convite via WhatsApp não chega | Alta hoje | Baixo | Senha na tela do consultor é o canal confiável |
| Heatmap de "passagem" interpretado como trajeto completo | Alta | Médio | Camada separada, legenda obrigatória, padrão é visitas/cobertura |
| Dois consultores recebem o mesmo lugar | Média | Médio | Índice único parcial `(lead_id, day)` + transação + retry |
| Pix para chave inexistente bloqueia a conta (Woovi) | Média | Alto | Conta separada, validação, dry-run, aprovação humana, F9 antes de F10 |
| Execução de busca interrompida por restart | Média | Baixo | Reconciliação no boot (`running→error`), rerodar é idempotente por `UNIQUE(source, source_ref)` |
| Máquina do dono trava | Alta | Médio | Sem build/test local; PRs pequenos; CI/outra máquina |
| LGPD: localização contínua do consultor | Baixa | Médio | Só com jornada aberta, aviso na tela, retenção de 180 dias, visão agregada por padrão |

## 12. Fora de escopo

Polígonos livres de bairro; OSRM/roteamento por ruas reais; app nativo (rastreio com tela apagada); push/WhatsApp para o consultor;
mapa geral de expansão por município (o IBGE/vizinhas continua na tela de abertura de praça); geocodificação por CEP/endereço; qualquer
mudança no `GeoService.EXCLUIR`; folha/impostos (MEI/RPA) do consultor; edição de dados da empresa no Freela depois do cadastro.

## 13. Perguntas que só o dono responde (com recomendação padrão)

1. **O que conta como "cadastro" pago e existe piso?** Padrão: R$ 10 por **empresa** com primeiro acesso feito pelo dono (`activated`), faixas fixas
   10 → R$ 100 e 20 → R$ 250, **sem piso abaixo de 10**; tudo configurável.
2. **Consultores podem trabalhar em São Paulo/Rio?** Padrão: sim, por **áreas** (centro + raio); `EXCLUIR` do Geo permanece.
3. **Aprova o Apify (token + teto mensal)?** Padrão: começar só com OSM no piloto de Moema; Apify atrás de flag com teto de 3.000 lugares/mês,
   token digitado por você no servidor.
4. **Aprova mudar o api-freela (auto-deploy na main) com senha temporária aleatória?** Padrão: sim, em PR separado, só rotas novas; a senha fixa atual do Freela não é reutilizada.
5. **Pix: manual ou automático primeiro?** Padrão: **manual** (exportar/marcar pago) até fechar 2 semanas conferidas; automático só com conta Woovi separada.
