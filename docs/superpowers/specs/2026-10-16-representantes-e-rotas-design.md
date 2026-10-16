# Representantes comerciais e rotas de visita — design (bloco B)

Data: 16/10/2026 · Status: **aprovado — respostas do dono em §14** · Base: bloco A
(`2026-10-08-consultores-de-campo-design.md`, contrato §20), que fica de pé e é estendido aqui.

## 1. Contexto e objetivo

O bloco A colocou o consultor de campo na rua: login próprio, jornada, check-in com foto, questionário, checkout,
trajeto, QR do Freela e fila sem sinal. Falta o que organiza o trabalho dele e mede o resultado:

1. **Onde ir:** mapear a cidade por CNAE, ver no mapa de calor onde estão os bares e restaurantes, e dividir isso em
   **rotas de ~20 visitas por dia**, abertas toda segunda para a semana inteira.
2. **O que fazer na porta:** um formulário de visita mais curto e orientado a fechamento (contato, função, se contrata
   freelancer, voucher para quem contrata muito, cadastro na hora, status final).
3. **Como foi:** rastro com o tempo em cada parada, painel do admin (rotas, visitas, cadastros, vouchers, vagas) e
   painel do representante (a rota e os números dele, quem cadastrou, quem ainda não abriu vaga).

Na interface, "consultor de campo" passa a ser **representante comercial** ("representante"). No banco, no código e
nas rotas da API os nomes `field_*`, `campo` e `consultores` **não mudam** (nada quebra: tokens `aud: "campo"`,
`@CampoRoute()`, URLs `/campo` e `/consultores`, atalho "Praça Campo" no celular).

## 2. Decisões tomadas (pedido do dono, 16/10)

1. Cadastro do representante com nome, idade, cidade, área de atuação, e-mail, telefone e chave Pix. A idade é
   mostrada a partir da **data de nascimento** (guardar a idade envelhece o dado). CPF e o resto do cadastro do bloco A
   continuam.
2. Abertura de praça começa pelo **mapeamento por CNAE** com mapa de calor.
3. Rota com meta de **20 visitas por dia**, configurável por praça.
4. **Toda segunda-feira** abrem as rotas da semana inteira de cada representante ativo.
5. Formulário de visita na ordem do dono (§7.3); substitui o questionário do bloco A.
6. Quem contrata **mais de 5 freelancers por semana** recebe a oferta de **voucher** (abrir uma vaga e contratar 1
   freelancer grátis), com cadastro e abertura de vaga na hora.
7. Status final obrigatório: **cadastrou · vai cadastrar depois · não quis · ligar depois**.
8. Rastro mostra **quanto tempo ficou em cada ponto**.
9. Acompanhamento dos PDVs já visitados na cidade para abrir novas rotas.
10. Painel do admin e painel do representante (§8).
11. **A base de estabelecimentos vem do dono em Excel** (endereço e o resto). O Praça lê o `.xlsx`, acha a localização
    pelo endereço (geocodificação, §7.0) e monta as rotas.
12. **Voucher vale para a semana** (até o sábado da semana em que foi pedido) e **o gestor libera**: o representante
    pede na visita, o gestor (admin) confere, coloca no Freela e marca "liberado" no Praça; depois marca "usado".
13. **Rotas de segunda a sábado, das 9h às 18h.**
14. **"Cadastrou" move o lead para Cadastrado** no funil na hora (declaração do representante).
15. **"Não quis" volta para rota depois de 30 dias.**
16. **Mapa de calor dentro da tela Praça.**
17. As duas listas de "não abriu vaga" (§8.2) estão aprovadas.
18. **As telas atuais continuam** no menu.
19. **Áreas sobrepostas: quem abre o cadastro ganha.** O mesmo PDV pode estar na rota de mais de um representante; o
    crédito do cliente é de quem fechar o primeiro "cadastrou", e a partir daí ele sai da rota de todos.

## 3. Fora de escopo (neste bloco)

- Busca automática de estabelecimentos (Receita, Apify, Google Maps): a base vem do dono, em Excel.
- Criar contratante, vaga ou voucher **de verdade no Freela** — hoje o Praça não tem endpoint para isso (§9). Aqui o
  cadastro é pelo link/QR do Freela e a vaga e o voucher ficam registrados no Praça.
- Confirmação dos cadastros pelo Freela (o "cadastrou" continua sendo declaração do representante).
- Remuneração, carteira e pagamento por Pix.
- Rastreio com a tela apagada (exige app nativo — limitação do bloco A, mantida).
- Otimização de rota por ruas reais (roteirização com OSRM/Google). A ordem é por distância em linha reta (§7.2).

## 4. Arquitetura

Sem módulo novo de autenticação: tudo cresce dentro do que o bloco A montou.

```
api/src/domain/route-rules.ts         NOVO — regras puras: área de atuação, candidatos, prioridade,
                                      divisão da semana em dias, ordem por vizinho mais próximo
api/src/domain/visit-rules.ts         NOVO — formulário novo: completude, regra do voucher,
                                      status final → etapa do funil, paradas e tempos do rastro
api/src/domain/campo-rules.ts         mantém o que serve às visitas antigas (resumo, rótulos)
api/src/domain/catalog/campo.ts       NOVO — CNAEs-padrão, status finais, rótulos
api/src/modules/campo/
  routes.service.ts                   NOVO — gerar/regerar/editar rotas, parada ↔ visita
  routes.scheduler.ts                 NOVO — @Cron da segunda-feira
  vouchers.service.ts                 NOVO — emitir, expirar, marcar usado
  painel.service.ts                   NOVO — números dos dois painéis
  mapa.service.ts                     NOVO — pontos da praça para o mapa de calor
  campo.controller.ts                 + rota do dia/semana, painel do representante, voucher
  consultores.controller.ts           + área, rotas, painel do admin, mapa
  visits.service.ts                   formulário novo + reflexo no CRM
  campo-autoclose.scheduler.ts        + expiração de vouchers (mesmo relógio das 00:05)
api/src/modules/imports/              + colunas cnae, bairro, lat, lng
web/src/app/campo/(sessao)/           + rota do dia, painel, formulário novo, voucher
web/src/app/(app)/consultores/        + área no mapa, rotas da semana, painel, rastro com tempos
web/src/app/(app)/praca/            + mapa de calor por CNAE (decisão 16)
```

Mapa no web: **Leaflet** (já é dependência do `web/`) + **`leaflet.heat`** (dependência nova, pequena) com tiles do
OpenStreetMap, sem chave paga. O mapa de calor é desenhado no navegador a partir dos pontos que a API manda.

## 5. Modelo de dados

Todas as mudanças são aditivas (colunas novas nulas ou com default; tabelas novas). As visitas do bloco A continuam
legíveis. **Migração com `--create-only`, apagando do SQL os `DROP INDEX` dos índices parciais
`field_journeys_one_open_per_consultant` e `field_visits_one_open_per_consultant`** (regra do `CLAUDE.md`).

**`field_consultants`** (existente) ganha:
- `birth_date String?` (`YYYY-MM-DD`). A idade é calculada na leitura com `todaySp()`.
- Área de atuação, os dois modos podendo coexistir:
  - `area_lat Float?` · `area_lng Float?` · `area_radius_km Float?` (círculo desenhado no mapa);
  - `area_bairros String[] @default([])` (bairros, comparados sem acento e sem caixa com `leads.bairro`).
  - Sem nenhum dos dois → área = a praça inteira.
- A cidade é a praça (`praca_id`, já existe).

**`pracas`** (existente) ganha `route_daily_goal Int @default(20)`, `route_start_hour Int @default(9)` e
`route_end_hour Int @default(18)`. A semana de rota é sempre **segunda a sábado** (decisão 13).

**`leads`** (existente) ganha:
- `cnae String?` (7 dígitos, sem máscara) e `bairro String?`;
- `geo_status String?` (`pendente|ok|falhou`; nulo = sem endereço ou lead antigo) e `geo_error String?`;
- `field_consultant_id String?` (FK `field_consultants`, `SetNull`) — o representante que fechou o primeiro
  "cadastrou" (decisão 19).

Novos índices `[praca_id, cnae]` e `[geo_status]`.

**`app_settings`** (existente) ganha `field_cnaes Json` com a lista editável `{code, label}[]`, nascendo com:
`5611201` Restaurantes e similares · `5611203` Lanchonetes, casas de chá, de sucos e similares · `5611204` Bares e
outros estabelecimentos especializados em servir bebidas, sem entretenimento · `5611205` Bares e outros
estabelecimentos especializados em servir bebidas, com entretenimento · `5620102` Serviços de alimentação para
eventos e recepções — bufê · `5510801` Hotéis.

**`field_routes`** (nova) — a rota de um representante num dia:
id · consultant_id · praca_id · day (`YYYY-MM-DD`) · goal Int (cópia da meta da praça no momento) · source
(`auto|admin`) · created_by (`users.id`, nulo quando é o relógio) · created_at · updated_at. Único
`(consultant_id, day)`. O estado é derivado, não guardado: **aberta** (nenhuma jornada do dia), **iniciada** (jornada
do dia aberta), **encerrada** (jornada encerrada).

**`field_route_stops`** (nova) — as paradas:
id · route_id · lead_id · position Int · reason (`novo|retorno|pendente|incluido`) · visit_id? (a visita que atendeu
a parada) · removed Boolean `@default(false)`. Único `(route_id, lead_id)`.

**`field_journeys`** (existente) ganha `route_id String?` — a rota do dia, ligada no "Iniciar rota".

**`field_visits`** (existente) ganha as respostas do formulário novo. Os campos do bloco A ficam (nulos nas visitas
novas):
- `interlocutor_name`, `interlocutor_role`, `channels`, `channel_other`, `freelas_per_week`: **reaproveitados**
  (contato, função, como contrata, quantos por semana). A função aceita só `dono|gerente` nas visitas novas; `outro`
  continua legível nas antigas.
- `hires_freelancer Boolean?` — contrata freelancer?
- `voucher_offered Boolean?` · `voucher_accepted Boolean?`
- `signup_mode String?` (`qr|assistido|nao_abriu`)
- `final_status String?` (`cadastrou|cadastra_depois|nao_quis|ligar_depois`)
- `final_date String?` (`YYYY-MM-DD`, para `cadastra_depois` e `ligar_depois`)
- `final_reason String?` (para `nao_quis`)
- `callback_phone String?` (para `ligar_depois`)
- `off_route Boolean @default(false)` — visita a estabelecimento que não estava na rota do dia.
- `off_hours Boolean @default(false)` — check-in fora das 9h–18h da praça (marca, não bloqueia).
- `form_version Int @default(1)` — `2` nas visitas novas; a tela escolhe o formulário e o resumo por ela.

**`field_vouchers`** (nova):
id · code (único, `PRC-` + 6 caracteres sem ambiguidade) · visit_id (único) · lead_id · consultant_id · praca_id ·
status (`solicitado|liberado|recusado|usado|expirado`) · valid_until (`YYYY-MM-DD`, o sábado da semana do pedido) ·
freela_ref? (o que o gestor lançou no Freela, texto livre) · decided_by? (`users.id`) · decided_at? · decision_note? ·
used_at? · vaga_id? (`lead_vagas.id`) · created_at · updated_at.

**`lead_vagas`** (existente) ganha `source String @default("manual")` (`manual|campo`), `visit_id String?`,
`created_at DateTime @default(now())`. "Vaga aberta" no painel = linha em `lead_vagas`; `filled` continua dizendo se
rodou. Assim as vagas do campo entram nos indicadores que já leem `lead_vagas`.

## 6. API (resumo — o contrato completo entra em `docs/api-contract.md` §21 antes do código)

### 6.1 Representante (`/v1/campo`, todas com `@CampoRoute()`)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/routes/today` | rota do dia com as paradas em ordem (nome, endereço, lat/lng, motivo, visitado?, status final) |
| GET | `/routes/week` | as rotas da semana corrente (seg → último dia útil) |
| GET | `/painel?periodo=dia\|semana\|30d` | números e listas do §8.2 |
| POST | `/visits/:id/voucher` | pede o voucher da visita ao gestor (só se a regra do §7.4 permitir) |
| POST | `/visits/:id/vagas` | registra a vaga aberta na hora (`{date, funcao}`) |

`journeys/start` passa a ligar `route_id` quando há rota no dia. `visits/checkin` marca a parada (`visit_id`) se o
lead estiver na rota, senão `off_route = true`. `PATCH visits/:id` e `checkout` aceitam o formulário novo
(`form_version 2`).

### 6.2 Equipe (`/v1/consultores`, leitura para a equipe, escrita só admin)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/painel?from&to&praca_id&consultant_id` | números do §8.1 + ranking por representante |
| GET | `/painel/trilhas?day&praca_id` | trajeto e paradas de todos no dia (mapa do admin) |
| GET | `/routes?week=YYYY-MM-DD&praca_id&consultant_id` | rotas da semana |
| POST | `/routes/generate` | `{week, consultant_ids?}` — gera ou regera (§7.2) |
| PATCH | `/routes/:id` | `{stops: [{lead_id, removed?}]}` na ordem nova — reordenar, tirar, incluir |
| GET | `/settings/cnaes` · PUT | lista de CNAEs da praça (`field_cnaes`) |
| GET | `/vouchers?status&praca_id` | fila de vouchers (pedidos primeiro) |
| POST | `/vouchers/:id/decide` | `{decision: "liberado"\|"recusado", freela_ref?, note?}` — o gestor libera ou recusa |
| POST | `/vouchers/:id/used` | marca usado |
| GET | `/:id/days/:day` | (existente) ganha `stops` com tempo parado e deslocamento (§7.5) |

`POST`/`PATCH /:id` (existente) aceitam `birth_date`, `area_lat`, `area_lng`, `area_radius_km`, `area_bairros`.
Rotas estáticas (`/painel`, `/routes`, `/settings/cnaes`) declaradas **antes** das `/:id`.

### 6.3 Praça e importação

- `GET /v1/pracas/:id/mapa?cnae=5611201,5611204` → `{points: [{id, lat, lng, cnae, classe, status}]}` com `status`
  ∈ `nao_visitado|visitado|cadastrado|com_vaga` (o mais avançado vence). Só leads com lat/lng.
- `/v1/imports` ganha os campos `cnae`, `bairro`, `lat`, `lng` no mapeamento (com dicas `cnae`, `cnae_fiscal`,
  `bairro`, `latitude`, `longitude`…) e filtro opcional `cnaes` no `run`: linhas com CNAE fora da lista são ignoradas
  com o motivo "CNAE fora da lista". CNAE aceito com ou sem máscara (`5611-2/01` → `5611201`). Novo
  `allow_no_phone` (ausente = `false`, o comportamento de hoje): a base de visita costuma vir sem telefone.
- O web passa a ler **`.xlsx`** (primeira planilha, primeira linha = cabeçalho), além de CSV e XML.
- Lead criado com endereço e sem lat/lng nasce `geo_status = "pendente"`.
- `GET /v1/pracas/:id/geo` → `{pendente, ok, falhou, sem_endereco}` e `POST /v1/pracas/:id/geo/retry` (volta os
  `falhou` para `pendente`).

## 7. Regras

### 7.0 Geocodificação (endereço → lat/lng)

- Relógio de 1 min (`GeocodeScheduler`, processo único, liga/desliga por `GEOCODER`): pega até 50 leads
  `geo_status = "pendente"` (mais antigos primeiro) e consulta o provedor um por vez.
- Provedor por `GEOCODER`: `nominatim` (OpenStreetMap, padrão, grátis, **no máximo 1 consulta por segundo** e
  `User-Agent` identificado por `GEOCODER_USER_AGENT` — a política deles proíbe mais que isso), `google` (exige
  `GOOGLE_MAPS_API_KEY`, pago por consulta) ou `off` (não consulta nada; os leads ficam pendentes).
- Consulta: `endereço, bairro, cidade, Brasil`. Achou → `lat/lng`, `geo_status = "ok"`. Não achou ou endereço vazio
  → `falhou` com o motivo em `geo_error`. Erro de rede/limite → continua `pendente` e o lote para (tenta no próximo
  minuto).
- Uma cidade de 2.000 estabelecimentos leva ~35 min no Nominatim. A tela da Praça mostra o andamento (§6.3).
- Lat/lng vindos na planilha valem mais que a geocodificação (o lead já nasce `ok`).

### 7.1 Área de atuação

Um lead está na área do representante se é da praça dele, tem lat/lng, e: (raio definido e distância haversine ao
centro ≤ raio) **ou** (bairro do lead está em `area_bairros`). Sem raio e sem bairros: a praça inteira. Leads sem
lat/lng não entram em rota (aparecem num aviso "N estabelecimentos sem localização" na tela de rotas).

### 7.2 Geração das rotas

Função pura `planejarSemana(candidatos, dias, meta, centro)` em `route-rules.ts`.

**Candidatos** = leads na área, não arquivados, com CNAE na lista (ou sem CNAE, se vieram por outra porta), e que:
- não estão em etapa ≥ 5 (Cadastrado em diante) — quem cadastrou sai da rota de todos;
- não têm visita com status final `nao_quis` nos últimos **30 dias**;
- áreas sobrepostas **não** são exclusivas: o PDV pode cair na rota de dois representantes (decisão 19).

**Prioridade:** (0) **retorno** — `cadastra_depois`/`ligar_depois` cuja `final_date` cai no dia: vai para aquele dia,
fora da cota de vizinhança; (1) **pendente** — parada de rota anterior que não foi visitada; (2) casa grande nunca
visitada; (3) alvo nunca visitado; (4) depois / já visitado sem status definitivo.

**Divisão em dias:** escolhem-se os `meta × dias` melhores pela prioridade; os pontos são ordenados pelo ângulo em
volta do centro da área (varredura em leque) e cortados em blocos de `meta`, um por dia, para que cada dia fique numa
região. Dentro do dia, a ordem é por **vizinho mais próximo**, partindo do ponto da parada mais próxima do centro. O
corte é determinístico (mesma entrada, mesma rota) e coberto por testes.

**Segunda-feira:** `@Cron('0 7 * * 1', { timeZone: 'America/Sao_Paulo' })` (antes das 9h) gera a semana — **segunda a
sábado** — de todo representante ativo
que ainda não tem rota nela. Idempotente pelo único `(consultant_id, day)`. Processo único (premissa já documentada).
Liga/desliga por `FIELD_ROUTES_ENABLED` (default `true`, declarada nos dois `docker-compose`).

**Regerar** (admin) só substitui dias **ainda não iniciados**; dia com jornada aberta ou encerrada fica como está.
Editar à mão marca `source = "admin"`.

### 7.3 Formulário de visita (versão 2) — ordem na tela

1. **Iniciar rota** = iniciar jornada (já existe), agora com a rota do dia na tela.
2. **Check-in** na chegada com foto da fachada — igual ao bloco A (foto obrigatória, marca "longe" a 200 m, dedup a
   100 m para estabelecimento novo).
3. **Nome do contato**.
4. **Função:** dono ou gerente.
5. **Contrata freelancer?** Se sim: **como** (canais, lista editável já existente) e **quantos por semana** (≥ 1).
6. **Voucher:** se `freelas_per_week > 5`, a tela mostra a oferta. Aceitou → pede o voucher ao gestor (§7.4) e segue
   para o cadastro e a vaga na hora.
7. **Abrir o cadastro:** QR na tela do representante ou **cadastro assistido** (abre o link do Freela com o código do
   representante no próprio celular e preenche junto com o dono). Com voucher aceito, registrar a vaga aberta (data e
   função) é obrigatório.
8. **Status final** (obrigatório para o checkout): `cadastrou` · `cadastra_depois` (+ data ≥ hoje) · `nao_quis`
   (+ motivo) · `ligar_depois` (+ data ≥ hoje e telefone).

Rascunho salvo a cada campo, como hoje; tudo funciona na fila sem sinal (o pedido de voucher feito sem sinal sobe
quando o sinal volta; o código vem do servidor).

### 7.4 Voucher

- Só para visita `form_version 2` com `hires_freelancer = true` e `freelas_per_week > 5` ("acima de 5" — 5 não ganha).
- **Fluxo:** o representante **pede** na visita (`solicitado`) → o gestor (admin) confere, lança no Freela e marca
  **liberado** (com `freela_ref`) ou **recusado** (com motivo) → depois marca **usado**. O representante vê o status
  na visita e no painel dele; um pedido novo acende o sino da equipe.
- Um por visita e **um em aberto por estabelecimento** (`solicitado` ou `liberado` no mesmo lead →
  `409 VOUCHER_ACTIVE`).
- **Validade: a semana** — `valid_until` = sábado da semana do pedido (segunda a sábado). O relógio das 00:05 marca
  `expirado` os `solicitado`/`liberado` vencidos.
- Liberar ou marcar usado depois do vencimento → `409 VOUCHER_EXPIRED`.

### 7.5 Rastro e tempo por parada

Função pura sobre as visitas do dia em ordem de check-in: **tempo parado** = checkout − check-in;
**deslocamento** = check-in desta − checkout da anterior (a primeira conta a partir do início da jornada). Visita sem
checkout mostra "sem checkout" e não tem tempo. A linha do trajeto continua sendo os `field_points`. Marcas: longe do
endereço, fora da rota, sem checkout, hora ajustada.

### 7.6 Reflexo no CRM (checkout, na mesma transação de hoje)

Evento `kind = "visita"` com o resumo novo e `decisor` ← contato (como hoje), e por status final:

| Status final | Funil | Próximo passo |
|---|---|---|
| `cadastrou` | vai para **5 — Cadastrado** se estava abaixo; `field_consultant_id` ← o representante, se vazio | — |
| `cadastra_depois` | 1/2 → 3, como hoje | "Confirmar cadastro" na data |
| `ligar_depois` | 1/2 → 3, como hoje | "Ligar" na data, com o telefone |
| `nao_quis` | vai para **8 — Perdido / reaquecer** com `lost_reason` = motivo | — |

Vaga aberta na visita vira `lead_vagas` (`source = "campo"`), e o lead em etapa < 6 com vaga **rodada** segue a regra
que o funil já tem.

## 8. Painéis

### 8.1 Admin (`/consultores`, aba "Painel")

Filtros: dia ou semana, praça, representante. Números: **rotas abertas / iniciadas**, **visitas** (e % da meta:
visitas ÷ soma das metas das rotas do período), **cadastros** (status final `cadastrou`), **vouchers liberados /
usados**, **vagas abertas** (`lead_vagas` com `source = "campo"` no período). Ranking por representante com as mesmas
colunas. Mapa do dia com o rastro e as paradas de todos (uma cor por representante).

### 8.2 Representante (`/campo`, aba "Meus números")

- Rota do dia e da semana: mapa com as paradas numeradas e a lista na ordem (feito / falta / retorno).
- Números do período: clientes na rota, visitados, cadastrados, vouchers, vagas abertas.
- Listas (cada item com atalho **Ligar** e **Abrir no mapa**):
  - **Cadastrou** — visitas dele com `cadastrou`;
  - **Abriu vaga** — e quantas;
  - **Cadastrou e nunca abriu vaga** — nenhuma linha em `lead_vagas`;
  - **Sem vaga nos últimos 30 dias** — já abriu antes, mas nenhuma vaga criada nos últimos 30 dias.

"Clientes do representante" = leads com `field_consultant_id` = ele (quem fechou o primeiro "cadastrou").

## 9. Integração com o Freela — o que existe e o que falta

O Praça hoje usa no api-freela: `POST /v1/admins/login`, `activation-campaigns`, `campaign-templates` e
`/v1/admins/consultants` (criar, listar, ativar/desativar). **Não há** endpoint usado (nem conhecido daqui — o
api-freela não está neste repositório) para:

1. listar os contratantes cadastrados com o código de um consultor (confirmar o "cadastrou");
2. criar ou consultar **vaga** de um contratante;
3. emitir/aplicar **voucher ou cupom** (vaga com 1 freelancer grátis).

Por isso, neste bloco: cadastro = link/QR do Freela com o código do representante (já funciona); vaga e voucher =
registro no Praça. Quando o Freela ganhar esses endpoints, entra um bloco C de sincronização.

## 10. Telas

- **Celular (`/campo`)**: "Iniciar rota" no lugar de "Iniciar jornada"; com a rota aberta, a lista das paradas em
  ordem com "Ir" (abre o mapa do aparelho) e "Check-in"; botão "Visita fora da rota"; formulário v2 em passos (um
  bloco por tela, CTA fixo no rodapé); aba **Meus números** (§8.2). Mapa Leaflet carregado só quando a aba abre (sem
  sinal, a lista funciona e o mapa mostra o aviso).
- **Equipe — `/consultores`**: abas **Painel** · **Rotas da semana** (grade representante × dia, com contagem, e
  editor de paradas no mapa) · **Representantes** (a lista de hoje). Ficha do representante: data de nascimento/idade
  e área no mapa (círculo arrastável + bairros). Dia do representante: rastro com tempo parado e deslocamento.
- **Praça → mapa**: mapa de calor com filtro de CNAE e camadas de status (§6.3).
- **Configurações → Apps e canais (campo)** ganha a lista de CNAEs.
- Textos "consultor" → "representante" em toda a interface.

## 11. Offline

A rota da semana é baixada ao abrir a sessão e fica em cache no aparelho; o formulário v2 entra na mesma fila do
IndexedDB do bloco A. Voucher pedido sem sinal fica "enviando" na tela até o envio subir (o código vem do servidor).

## 12. Testes e verificação

- Unidade (jest): `route-rules` (área por raio e por bairro, exclusões, prioridade, retorno no dia certo, corte por
  leque, vizinho mais próximo, determinismo), `visit-rules` (completude v2, regra do voucher no 5 e no 6, status
  final → etapa, tempos por parada), voucher (um ativo por lead, expiração), CNAE com e sem máscara.
- Serviço: gerar semana idempotente, regerar só dias não iniciados, checkin marca parada / `off_route`.
- `smoke.sh` e `browser-check.mjs` estendidos, deixando o banco igual ao seed.
- Modo de baixo consumo do `CLAUDE.md`: um processo pesado por vez, sem `nest build`/`next build`, `tsc --noEmit`
  sozinho no fim.

## 13. Fases (um commit por fase)

(a) cadastro do representante (nascimento, área) e troca de textos · (b) CNAE na importação + mapa de calor ·
(c) rotas + geração da segunda · (d) formulário v2 + voucher + reflexo no CRM · (e) rastro com tempos ·
(f) painel do admin · (g) painel do representante.

## 14. Respostas do dono (16/10)

| # | Pergunta | Resposta | Onde entrou |
|---|---|---|---|
| 1 | Fonte dos estabelecimentos | o dono manda a base em **Excel** com endereço; o Praça faz a rota | §2.11, §6.3, §7.0 |
| 2 | Voucher | **vale para a semana**; o **gestor** coloca (libera) | §2.12, §5, §7.4 |
| 3 | Semana de rotas | **segunda a sábado, 9h às 18h** | §2.13, §5, §7.2 |
| 4 | "Cadastrou" → Cadastrado | **sim** | §7.6 |
| 5 | Volta de quem "não quis" | **30 dias** | §7.2 |
| 6 | Onde fica o mapa de calor | **dentro da tela Praça** | §10 |
| 7 | As duas listas de "não abriu vaga" | **sim** | §8.2 |
| 8 | Telas atuais | **continuam** | §2.18 |
| 9 | Área sobreposta | **quem abre o cadastro ganha** | §2.19, §5, §7.2 |
