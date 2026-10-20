# Modo do chefe no Praça: arquitetura (desenho, sem implementação)

Data: 2026-10-20. Base: `docs/superpowers/specs/2026-10-20-comparacao-versao-lovable-chefe.md` (§3–§5), `api/src/domain/earnings-rules.ts`, `signup-sync-rules.ts`, `rotas-config.service.ts`, contrato §23, §26–§29. A branch `feat/p0-comparacao-lovable` ainda não tem commits: tudo que ela entrega (resultado "fechado", motivo de recusa, retorno com hora, contato opcional, a pé/carro) é tratado aqui como **dependência**, sem nomear colunas que ainda não existem. Migrações novas devem ter timestamp **depois** de `20261024100000` e depois da última migração do P0. Contrato novo = **§31** (o §30 fica reservado ao P0/vouchers).

## 0. Ideia central: três eixos independentes, não um interruptor "modo chefe"

Um único interruptor "chefe/completo" misturaria o que é UX (reversível, sem risco) com o que é dinheiro (precisa de vigência e razão). Separo em três eixos, cada um no lugar certo:

| Eixo | O que decide | Onde mora | Vigência |
|---|---|---|---|
| A. Fluxo da visita | quantas perguntas no checkout, resultado final | `app_settings.field_config` (chave `fluxo_visita`: `simples` \| `completo`) | imediata; cada visita guarda o fluxo com que foi preenchida |
| B. Regra de pagamento | de onde vem o "cadastro" que paga, diária, bônus | **regra versionada** `field_pay_rule_versions.config` (chaves novas, abaixo) | só dias a partir de `valid_from` |
| C. Módulos de apoio | checklist, nota do dia, pins, vouchers | chaves `ui_*` em `field_config` + flag de env quando há persistência | imediata |

"Perfil do chefe" e "Perfil completo" são **presets**: botões na tela de configuração que preenchem o formulário dos eixos A/B (o admin revisa e publica). O servidor não conhece "perfil", só as chaves. Assim nada fica escondido e nada é apagado: o "completo" é o conjunto de valores atuais.

Resolução em código: função pura `resolverModoCampo(fieldConfig)` em `domain/modo-campo-rules.ts` devolve `{ fluxo_visita, ui }`; quem precisa recebe o resultado (nada de ler `field_config` espalhado). A regra de pagamento continua vindo de `versaoVigente(versoes, dia)`.

### Como "o padrão é o jeito dele" sem quebrar produção

- **Padrão = o que o produto oferece e o que vale quando a chave não existe em instalação nova** (seed, ambiente novo). Não é reinterpretação de dado antigo.
- **Uma única trava de lançamento, sem migração de dado**: flag de env `FIELD_VISIT_FLOW_SELECT_ENABLED` (padrão `false`). Desligada, `fluxo_visita` é ignorado e vale `completo`: prod fica intocada no deploy. Ligada, chave ausente resolve para `simples` (o padrão do chefe) e um PUT com `fluxo_visita: "completo"` volta ao atual. Passos do dono: (1) deploy com a flag off (nada muda); (2) ligar a flag no `.env` e reiniciar: o fluxo `simples` passa a valer para visitas abertas dali em diante; (3) reverter = `PUT fluxo_visita: "completo"` (sem reiniciar) ou desligar a flag. Efeito só em visitas abertas depois (ver `field_visits.flow`, §4.1). Decisão do arquiteto (ver §6).
- **Regra de pagamento**: versões existentes são imutáveis e nunca reinterpretadas. "Padrão do chefe" significa apenas que o formulário de **nova versão** abre com o preset do chefe. Todas as flags de remuneração/pagamento hoje estão `false` em prod, então não há dinheiro movimentado que mude.
- `normalizarRegra(raw)` (novo, em `earnings-rules.ts`): preenche chave ausente com o comportamento atual. `snapshot.rule` do razão continua gravando a **config crua da versão** (não a normalizada), e `conta` não ganha linha alguma quando os valores novos estão nos defaults (sem "Diária R$ 0,00"). **Armadilha a evitar**: `CHAVES_REGRA = Object.keys(REGRA_PADRAO)` e `validarRegra` exige as 13 chaves e rejeita desconhecidas; se eu só acrescentasse chaves a `REGRA_PADRAO`, a v1 gravada e o PUT atual do web quebrariam. Portanto: `REGRA_PADRAO` fica como está (v1 imutável); `CHAVES_REGRA_NOVAS` é uma lista separada, **opcional no PUT**, e `normalizarRegra` devolve a regra completa (13 + novas com default = comportamento atual) antes de qualquer cálculo. `calcularDia`/`calcularSemana` passam a receber a regra normalizada.

## 1. Mapa "diferença → como preservar as duas"

Legenda de padrão: **C** = jeito do chefe é o padrão oferecido; **N** = nosso continua como está.

| # | Diferença | Chefe (padrão oferecido) | Nosso (preservado) | Mecanismo | O que muda em dado existente |
|---|---|---|---|---|---|
| 1 | Fluxo da visita no checkout | Escolher **resultado final** (cadastrado, não cadastrado, não contrata, fechado, retornar, ligar) + motivo/retorno/contato conforme o caso | 9 perguntas (`faltando()`): freela_status, interest, vagas, canais, follow-up... | Eixo A: `fluxo_visita`. `faltando()` vira estratégia por fluxo (`faltandoSimples`, `faltandoCompleto`; o atual intacto). No `simples` o servidor **deriva** campos do resultado (tabela em §1.1) | Nada. `field_visits.flow` é gravado **na abertura da visita** (check-in) e é ele que o checkout valida; visitas antigas = `completo` |
| 2 | Pós-visita / estágio do lead | Resultado final vira o "status" do cliente na hora | Estágio 1,2→3 na visita; cadastro só pelo sync | No `simples`, resultado `cadastrado` **não** muda o número do estágio; marca a visita como cadastro declarado (ver §3) e o lead sai das rotas como os de estágio alto (`estagio_maximo_rota`). Estágio "cadastrado" real segue vindo do sync | Nada |
| 3 | Quem declara o cadastro que paga | Representante declara; gera ganho | Só cadastro confirmado pelo Freela (F7) | Eixo B: `signup_source` = `declared` \| `freela_confirmed` (default da regra atual: `freela_confirmed`) | Nada: vale só para dias ≥ `valid_from` da nova versão |
| 4 | Diária | Valor por dia **com rota atribuída** (soma, independente de visita) | Sem diária; piso `max(núcleo, floor)` | Eixo B: `daily_base_cents` (**aditiva**, não é piso) + `daily_base_condition`: `none` \| `journey_open` \| `min_visits` \| `route_assigned`. `route_assigned` = existe `field_routes` com `source='equipe'` e `day ≤ hoje`. Rotas `auto`/`consultor` **não** contam (o consultor se geraria a própria diária). **Dependência: `FIELD_ROUTES_ENABLED`** (rotas da equipe só existem com ela; hoje `false` em prod): sem ela a diária por rota pagaria R$ 0 em silêncio. O `PUT` da regra com `route_assigned` responde `409 ROUTES_DISABLED` com a flag desligada, e a tela de ganhos avisa se a flag for desligada depois | Default 0: nada |
| 5 | Bônus | Soma **todas** as metas atingidas (cumulativo); ignora `periodo` | Maior faixa atingida, por dia ou semana | Eixo B: `tiers_mode` = `highest` (atual) \| `cumulative`. Período fica `day`\|`week` (o chefe, na prática, soma no período inteiro pago: use `week`); `month` é P2 (bônus mensal exige fechamento mensal) | Default `highest` |
| 6 | Dinheiro | `numeric` reais | Centavos + razão | **Sem escolha**: razão e centavos nos dois perfis (ver §2) | — |
| 7 | Pagamento | "Marcar como pago" sem unicidade | Fechamento semanal + fila Pix | Sem escolha (ver §2). O chefe vê a mesma tela de ganhos | — |
| 8 | Chegada fora do raio | Justificativa obrigatória (texto) | Só marca `far_from_place` | Chave `justificativa_distancia`: `nao` (atual) \| `opcional` \| `obrigatoria`; padrão do chefe `obrigatoria`. Texto em coluna nova `field_visits.distance_note` | Nada |
| 9 | Contato | Nome, telefone (≥10 dígitos), cargo obrigatórios (exceto fechado) | `interlocutor_*` | Dentro do `faltandoSimples`; telefone/e-mail seguem as regras de privacidade do P0 (opcional → obrigatório só no `simples`) | Nada |
| 10 | Checklist de abordagem | 7 etapas configuráveis | Não existe | C: `ui_checklist` + `checklist_items` (lista em `field_config`); respostas em `field_visits.checklist jsonb` | Nada |
| 11 | Nota do dia (0–10) | 70% cumprimento + 30% positivação | Não existe | C: `ui_resumo_dia`: `numeros` (padrão: só números com a conta) \| `nota`. Pesos/corte em `field_config` (`nota_peso_rota`=70, `nota_meta_conversao`=30 %) | Nada |
| 12 | Mapa | Pins por status | Calor/cobertura | Ambos coexistem; `ui_mapa_pins` liga a aba nova | Nada |
| 13 | Rota a pé/carro | Por modo | Só a pé | **Coberto pelo P0** | — |
| 14 | Diária/ganho: dia | Dia UTC | Brasília | Sem escolha: Brasília sempre | — |

### 1.1 Resultado final → campos derivados (fluxo `simples`)

Hoje `freela_status` = `ja_usa` \| `cadastrou_qr` \| `nao_cadastrou`; `interest` = alto/médio/baixo/nenhum. Declarar não é cadastrar pelo QR, então **não** reaproveito `cadastrou_qr` (poluiria os indicadores de QR). Valor novo em conjunto fechado no código (sem enum de banco): `freela_status = 'declarou'`.

| Resultado (chefe) | `freela_status` | `interest` | `needs_followup` / `followup_date` | Extra |
|---|---|---|---|---|
| cadastrado | `declarou` | alto | false / null | cria declaração (§3.2) quando aplicável |
| nao_cadastrado | `nao_cadastrou` | baixo | false | motivo (obrigatório; lista fixa do P0) |
| nao_contrata_freela | `nao_cadastrou` | nenhum | false | |
| estabelecimento_fechado | nulo | nulo | false | resultado "fechado" do P0 (lead sai da fila) |
| retornar_outro_dia / ligar_depois | nulo | médio | true / data do retorno (+ hora do P0) | `followup_what` = "Retornar" / "Ligar" |

Consumidores a revisar na S1 (leem `freela_status`): funil/estágio (`estagioDepoisDaVisita`), retornos (§25), alerta/atenção, `resumoCobertura` e indicadores de QR. Cada um recebe teste com `declarou` e com nulo (nulo não pode virar erro nem contar como visita sem resposta).

Regra de implementação comum: nenhum `if (modo === 'chefe')` espalhado. Cada eixo tem **um** ponto de decisão (estratégia de checkout; `normalizarRegra` + entradas do dia; `resolverModoCampo` na UI).

## 2. O que NÃO entra no "modo chefe" (para o dono ver)

Não é recusa do pedido: é o que protege o negócio, e o jeito do chefe continua entregue por outro caminho.

| Item do chefe | Por que não | Equivalente seguro |
|---|---|---|
| `bootstrapAdmin` público com senha fixa "Mudar@123" | Qualquer pessoa na internet vira admin enquanto a senha não for trocada | Seed/CLI de primeiro admin com senha gerada e `must_change_password`; nenhuma rota pública que crie conta |
| Google Places gravando telefone, horário, nota, site (e atualizar por `place_id`) | Termos do Google limitam guardar o conteúdo além de `place_id`/coordenadas por prazo curto | Overpass (OSM) + Apify atrás de flag, como hoje; se o Google entrar um dia, só `place_id` + coordenadas e consulta na hora |
| Dinheiro sem razão imutável (`pagamentos` apagável, sem unicidade, UTC) | Duplo pagamento e perda de histórico | Razão append-only e fechamento semanal que já existem; o "Marcar como pago" do chefe é a fila Pix (§29) |
| Login `usuário@praca.local` sem e-mail real | Sem recuperação de senha, sem notificação, conflita com e-mail+CPF únicos e o token `aud:"campo"` | Se o chefe quiser digitar só o usuário: **alias opcional** `username` único em `field_consultants`, aceito no login junto do e-mail; a conta continua exigindo e-mail e CPF reais |
| RLS decidindo status/GPS/foto no navegador | Cliente autoriza a si mesmo | Servidor valida (como hoje) |
| Diária paga só por existir rota (sem presença) | Pode pagar dia sem trabalho | Entra no mapa (§1, linha 4), mas restrita a rota **da equipe**; para exigir presença, `daily_base_condition = journey_open` (decisão §6.3) |

## 3. Ganho por status declarado: preservando razão e auditoria

### 3.1 Princípio
O representante declara "cadastrado" e isso gera ganho (jeito do chefe), mas a declaração é um **fato imutável, auditável e de pagamento único por empresa**. O razão não muda: o ganho continua sendo `accrual` calculado por `alvo − já lançado` (§28.4); só a **fonte da contagem** de cadastros do dia muda.

### 3.2 Modelo (migração aditiva)

`field_declared_signups` (fato, só INSERT; trigger barra UPDATE/DELETE, como o razão):
`id uuid PK`, `consultant_id` FK Restrict, `visit_id uuid UNIQUE` FK, `lead_id uuid` FK, `declared_at timestamptz` (hora do **servidor**, nunca do cliente), `declared_day text` (Brasília), `company_name` (foto do nome na hora), `rule_version int` (versão de pagamento vigente), `client_id uuid UNIQUE` (idempotência), `flow text`. Índice único (`lead_id`) (uma declaração por empresa em toda a base). Limite conhecido: o predicado de um índice não enxerga a tabela de anulações, então empresa com declaração anulada **não pode ser declarada de novo** pelo banco; a exceção (re-declaração após anulação `duplicate`/`admin_review`) fica no serviço, sob o advisory lock do consultor, e vira decisão futura. Se for índice parcial, é **SQL manual**, invisível ao Prisma (`--create-only`, apagar o `DROP INDEX` dos outros).

**Quando a linha nasce**: no `simples` com `FIELD_DECLARED_SIGNUPS_ENABLED` ligada, **sempre** que o resultado é `cadastrado`, sob qualquer regra (guarda o fato e alimenta o relatório mesmo se a regra do dia for `freela_confirmed`); o pagamento depende da `signup_source` da versão do dia. Com a flag desligada, nenhuma linha nova. Índices `(consultant_id, declared_day)`.

`field_declared_signup_voids` (anulação, só INSERT): `declared_id uuid UNIQUE` FK, `reason` CHECK (`not_confirmed` \| `duplicate` \| `admin_review` \| `fraud`), `note` (obrigatória, 3–500), `voided_at`, `voided_by uuid?` (nulo = job). Anulação errada se corrige com **ajuste manual positivo com motivo** (já existe), não editando.

Por que tabela separada em vez de ler o status da visita: a visita pode ser editada depois do checkout (`PATCH visits/:ref/answers`); a declaração não.

Conferência com o Freela **não é gravada**: é um join de leitura entre a declaração e `field_signups` (por `lead_id`/`signup_id` e o matcher da F7, `match_status`). Mantém o fato imutável e a divergência sempre atual.

### 3.3 Cálculo
- `ResultadoDia.signups` passa a ser escolhido **por dia, pela versão vigente do dia**: `DiaBruto` ganha `declared` (declarações do `declared_day` menos anuladas, limitado por `declared_daily_cap`) ao lado de `signups` (confirmados). `entradasDaSemana` escolhe conforme `regra.signup_source`. Como a escolha é por versão do dia, trocar de fonte em `valid_from` não reescreve o passado.
- **A flag não reescreve o passado**: `FIELD_DECLARED_SIGNUPS_ENABLED` governa só novas declarações, rotas e UI. O cálculo segue **sempre** a `signup_source` da versão do dia, com a flag ligada ou não; senão desligar a flag derrubaria o alvo e geraria estornos negativos em semanas abertas e tardias. Teste: flag off com versão `declared` vigente dá o mesmo total semanal.
- **Pagar uma vez por empresa**: um `field_signups` pareado a declaração que já foi paga sob regra `declared` é excluído da contagem de confirmados (evita pagar na declaração e de novo na confirmação ao cruzar a vigência).
- Anulação = a contagem do dia cai e o motor emite delta negativo como `accrual` com `source = 'declaration_void'` na primeira semana aberta (mecanismo da confirmação tardia). **`kind` do CHECK do razão não muda** (sem migração de CHECK).

### 3.4 Salvaguardas (na regra versionada; mínimo que não complica o fluxo)

| Chave da regra | Padrão no preset do chefe | Efeito |
|---|---|---|
| `declared_daily_cap` (int ou null) | `30` (= `meta_diaria`) | Excedente é registrado mas **não entra no alvo**; aparece no relatório como "acima do limite". Estruturalmente já vale: 1 declaração por visita com check-in+foto validados no servidor, 1 por empresa |
| `declared_confirm_days` (int ou null) | **`null` (desligado)** | Não confirmada pelo Freela em N dias → anulação automática (job opcional). Exige `N ≤ late_grace_days − 1`, senão a anulação cairia fora do prazo e nada seria lançado |

Camadas fora da regra (leitura, sem custo de fluxo):
1. **Relatório de divergência** `GET /v1/consultores/declared-signups`: por consultor/dia, declaradas × confirmadas × sem correspondência × anuladas × acima do limite, com a conta e a fonte (regra "todo número com conta").
2. **Alerta** em "Atenção agora" (§25): `declared_divergence` quando, na janela, sem-correspondência ≥ `divergencia_alerta_min` e ≥ `divergencia_alerta_pct` % (chaves em `field_config`; padrão 5 e 40%).
3. **Anulação manual** pelo admin, com motivo (um clique no relatório).

### 3.5 Por que o estorno automático nasce desligado (e por que isso é seguro)
- Em prod, F6 (`FIELD_COMPANY_SIGNUP_ENABLED`) está desligada e o endpoint do api-freela não está no ar. Sem cadastro assistido, o pareamento depende só de `lead_id`/matcher do sync e deve casar pouco; anular "tudo que não confirmou" estornaria quase tudo. Só faz sentido com F6+F7 ligadas e conferidas, e depois de uma semana de relatório em sombra.
- Semana com total ≤ 0 hoje **não gera Pix** (`payouts.service.ts:238`, `skipped_non_positive`) e o negativo **não é carregado** para a semana seguinte. Logo, anulação grande pode "sumir". Pré-requisito da fase de anulação automática: lançamento de **saldo devedor carregado** (`accrual` com `source='carry_negative'` na semana seguinte, limitado ao que cabe) ou, no mínimo, aviso na tela da semana. Até lá a anulação automática não liga (flag própria `FIELD_DECLARED_VOID_ENABLED`).
- Job de anulação: `@Cron` com trava de reentrância, `try/catch` completo, instância única (padrão do `earnings.scheduler`).

### 3.6 Segurança do endpoint de declaração
Criada **dentro do checkout** (mesma transação que fecha a visita, §20.3), nunca por rota própria do consultor; id do consultor vem do token; visita de outro consultor = 404; hora e dia vêm do servidor (sem retroagir); idempotente por `client_id`; `@CampoRoute()` só no checkout. Teste de isolamento obrigatório (consultor A não declara na visita de B; relatório da praça A não vê praça B).

## 4. Dados, contrato, fases, testes

### 4.1 Migrações aditivas (nenhuma edita migração aplicada; timestamps posteriores às do P0)
1. `field_visits`: `flow text NOT NULL DEFAULT 'completo'` (gravado no check-in a partir de `fluxo_visita` vigente; checkout e fila offline validam contra esta coluna, não contra a config atual), `distance_note text?`, `checklist jsonb?`; o resultado e seus complementos dependem das colunas do P0 (reusar, não duplicar).
2. `field_declared_signups` + `field_declared_signup_voids` + triggers anti UPDATE/DELETE + índice único por `lead_id`.
3. Sem migração de dado em `field_config` (a trava é a flag de env, §0).
4. `field_pay_rule_versions` **não muda de esquema** (config é jsonb): as chaves novas entram no JSON. `CHAVES_REGRA_NOVAS` = `signup_source`, `daily_base_cents`, `daily_base_condition`, `daily_base_min_visits`, `tiers_mode`, `declared_daily_cap`, `declared_confirm_days`; limites em `LIMITES_REGRA`.
5. Vouchers (fase própria): `field_vouchers` (ver §5).

### 4.2 Flags de env (padrão `false`; `env.validation.ts` + `docker-compose.yml` + `.env.example` + `env-places.spec.ts`)
`FIELD_VISIT_FLOW_SELECT_ENABLED` (sem ela `fluxo_visita` é ignorado e vale `completo`), `FIELD_DECLARED_SIGNUPS_ENABLED` (sem ela o PUT da regra com `signup_source=declared` responde `409 DECLARED_DISABLED` e nada é declarado), `FIELD_DECLARED_VOID_ENABLED`, `FIELD_CHECKLIST_ENABLED`, `FIELD_VOUCHERS_ENABLED`. Flag desligada: rota `404 *_DISABLED` e `features.*=false` em `GET /v1/campo/me`, como §23/§28.

### 4.3 Contrato a escrever **antes** do código (§31)
- §31.1 Config: `GET/PUT /v1/consultores/settings/config` ganha `fluxo_visita`, `justificativa_distancia`, `ui_*`, `checklist_items`, `nota_*`, `divergencia_alerta_*`. Chave desconhecida ou fora de faixa → `400 VALIDATION_ERROR`.
- §31.2 Regra: `PUT /v1/consultores/earnings/config` aceita as 7 chaves novas, **opcionais**; resposta sempre normalizada; `GET` devolve `presets: { completo, chefe }` (configs prontas para preencher o formulário) e `default_config` inalterado. Erros: `409 DECLARED_DISABLED`, `400` se `declared_confirm_days ≥ late_grace_days`.
- §31.3 Campo: `PATCH /v1/campo/visits/:ref/answers` e checkout aceitam o corpo do `fluxo_visita` vigente; o corpo é validado contra `field_visits.flow` (gravado na abertura da visita), **não** contra a config atual; corpo do outro fluxo → `422 FLOW_MODE_MISMATCH`. Virar a flag ou a chave no meio do dia, ou reenviar uma fila offline de 24 h, só afeta visitas abertas depois. `GET /v1/campo/me` ganha `features.visit_flow`, `features.declared_signups`, `features.checklist`.
- §31.4 Equipe: `GET /v1/consultores/declared-signups` (`?from&to&praca_id&consultant_id&status`; resposta `{ rows, totals, conta }`), `POST /v1/consultores/declared-signups/:id/void` (admin; `{ reason, note, client_id }`; `409 ALREADY_VOIDED`).
- Erro sempre `{ error: { code, message } }`; snake_case; datas só-dia em varchar; "hoje" = `todaySp()`.

### 4.4 Fases (cada uma entregável sozinha; por padrão sem mudar comportamento)

| Fase | Entrega | Flag | Muda comportamento por padrão? |
|---|---|---|---|
| **S0** (depois do merge do P0) | Contrato §31; `resolverModoCampo`; `normalizarRegra`; migração de dado (`fluxo_visita=completo`); testes de caracterização | — | Não |
| **S1** | Fluxo `simples` do checkout: `faltandoSimples`, derivação dos campos, `field_visits.flow`, UI do campo, `justificativa_distancia`, preset na tela de config | `FIELD_VISIT_FLOW_SELECT_ENABLED` | Não (só vale se o dono trocar a chave) |
| **S2** | Regra estendida: `daily_base`, `route_assigned` (exige `FIELD_ROUTES_ENABLED`, `409 ROUTES_DISABLED`), `tiers_mode`, presets, simulador cobrindo os vetores do chefe | (já atrás de `FIELD_EARNINGS_ENABLED`) | Não (defaults = atual) |
| **S3** | Ganho declarado: tabelas, declaração no checkout, insumos, relatório, alerta, cap, anulação manual | `FIELD_DECLARED_SIGNUPS_ENABLED` | Não |
| **S4** | Anulação automática + saldo devedor carregado | `FIELD_DECLARED_VOID_ENABLED` | Não |
| **S5+** | P1 (§5) | por módulo | Não |

Pode virar "padrão do chefe" em produção só depois de S1–S3 em sombra por uma semana (comparar a tela de ganhos com o cálculo à mão, como a nota de produção do §28.8).

### 4.5 Testes de regressão (o "completo" continua idêntico)
1. **Caracterização antes de mexer (S0)**: congelar em JSON a saída de `calcularDia`/`calcularSemana` para a `REGRA_PADRAO` v1 em uma tabela de entradas (0, 9, 10, 12, 20 cadastros; com/sem piso; faixa semanal; teto) e as chaves de idempotência do razão. Depois de S2, **valores em centavos, `conta` (nenhuma linha nova com defaults) e chaves de idempotência idênticos** com a v1 crua e com a v1 normalizada; `snapshot.rule` segue sendo a config crua da versão.
2. `validarRegra`: a config atual de 13 campos continua válida; chave nova ausente = default; chave desconhecida continua erro.
3. `faltando()` atual: tabela de casos existente intocada; `faltandoSimples` com tabela própria; um teste garante que `fluxo_visita` ausente/flag off = `completo`.
4. Vetores do chefe (ouro): diária R$150 × 2 dias com rota da equipe = R$300; 5 cadastros × R$10 = R$50; diária R$100 + 5×R$10 + bônus cumulativo meta 5 R$200 = R$350 (em centavos).
5. Declarado: uma declaração por visita e por empresa; idempotência por `client_id`; cap; confirmação posterior não paga de novo; anulação gera delta negativo com `source='declaration_void'`; trocar de fonte em `valid_from` não altera dias anteriores; **flag `FIELD_DECLARED_SIGNUPS_ENABLED` desligada com versão `declared` vigente mantém o mesmo total semanal**; checkout valida `field_visits.flow` da abertura mesmo após virar a chave; razão continua barrando UPDATE/DELETE.
6. Isolamento: consultor A × B (declaração, relatório, void); praça A × B no relatório; token de campo nas rotas de equipe = 401.
7. Estrutura: teste que a migração não contém `DROP INDEX` dos 5 índices parciais; `env-places.spec` com as 5 flags novas em `false`.

## 5. Itens P1: o que cabe, ordem, dependências

| Ordem | Item | Cabe na arquitetura? | Dependência |
|---|---|---|---|
| 1 | Nota/resumo do dia | Sim, só leitura (chave `ui_resumo_dia`); padrão **números com a conta**; `nota` opcional com pesos em config. Positivação usa cadastro conforme `signup_source` do dia | Dono: mostrar nota? |
| 2 | Checklist de abordagem | Sim: `checklist_items` + `field_visits.checklist`; nunca bloqueia checkout | Dono: texto das etapas |
| 3 | Mapa de pins por estágio | Sim: endpoint de leitura paginado/leve, Leaflet/OSM, aba nova do mapa; independente do resto | Coordenadas e `location_precision` dos leads |
| 4 | Vouchers | Cabe como `field_vouchers` (solicitar/aprovar com motivo, trilha, sem apagar), atrás de `FIELD_VOUCHERS_ENABLED`. **Sozinho é só registro**; virar cupom no Freela exige mudar o api-freela | **Decisão do dono/Freela** (existe cupom real? quem aprova? limite?) |
| 5 | Shoppings via OSM | Cabe (`shop=mall` no Overpass + `leads.parent_id`), esforço L; **não** usar o critério de avaliações do Google | Decisão do dono (escopo) |

## 6. Decisões que só o dono pode tomar (e o padrão assumido)

1. **Quando o fluxo `simples` vira o ativo em prod?** Assumo: o deploy sai com `FIELD_VISIT_FLOW_SELECT_ENABLED=false` (prod = `completo`); ligar a flag é o ato deliberado que adota o padrão do chefe, depois de S1 testada num consultor-piloto. *Decisão do arquiteto.*
2. **O ganho declarado paga na hora, sem esperar o Freela?** Assumo: sim (jeito do chefe), com um limite diário igual à meta e o relatório de divergência; sem anulação automática. *Decisão do arquiteto.*
3. **Quais valores da regra do chefe** (diária, comissão por cadastro, metas e valores do bônus) **e a diária conta só dia com rota da equipe, ou exige também jornada iniciada?** Assumo: rota da equipe (`route_assigned`), valores a definir por você; o preset sai com os números do chefe vazios para preencher.
4. **Ligar a anulação automática e com quantos dias?** Assumo: desligada; só discutir depois de F6/F7 ligadas e uma semana de relatório.
5. **Configuração por praça ou global?** Assumo: **global** (`app_settings` é uma linha só e a regra de pagamento é única). Por praça exigiria tabela de override e vigência por praça; só se houver praças com perfis diferentes.
6. **Escopo P1:** mostrar a nota do dia ou só os números? Voucher é cupom real no Freela? Shoppings entram? Assumo: só números, vouchers e shoppings fora até a resposta.
