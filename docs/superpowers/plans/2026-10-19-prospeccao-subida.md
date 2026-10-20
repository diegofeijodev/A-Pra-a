# Prospecção, rotas e automação — roteiro de subida (F0–F9)

Branch: `feat/prospeccao` (Praça). Nada foi enviado nem implantado. F10 (Pix automático) NÃO foi feita.
Contrato: `docs/api-contract.md` §21–§29. Progresso por fase: `2026-10-19-prospeccao-progresso.md`.

## Ordem de subida
1. **Revisar e pushar o lado Freela** (worktree `api-freela-wt-cadastro-assistido`, branch `feat/cadastro-assistido-admin`) → PR → merge com `FIELD_ASSISTED_SIGNUP_ENABLED` desligada. O deploy automático cria só as 2 tabelas novas.
2. **Publicar `/primeiro-acesso` no freela-web-v2** (worktree `freela-web-v2-wt-primeiro-acesso`, branch `feat/primeiro-acesso`): merge LOCAL (nunca `gh pr merge` em web) + push. Antes de divulgar link: excluir `/primeiro-acesso` do GTM (GTM-5W9SWH9) ou remover o fragmento da URL na variável.
3. **Praça — banco:** `prisma migrate deploy` ANTES do código. 9 migrações aditivas (field_areas, place_search, place_runs_reserved, field_routes, field_visits_lead_idx, field_company_signups, field_signups, field_earnings, field_payouts).
4. **Praça — código:** push da `feat/prospeccao` (merge na master), deploy da API (EC2 /opt/praca) e do web (Vercel, cópia sem git).
5. **Ligar flags no `.env` do servidor, uma de cada vez, conferindo:**
   - já ligado por padrão: áreas, pesquisa (Overpass), mapa de calor, metas/alertas/retornos;
   - `FIELD_ROUTES_ENABLED` → roteiros;
   - `FIELD_SIGNUP_SYNC_ENABLED` → só com o Freela do passo 1 no ar e a conta de serviço com `CONSULTANTS`;
   - `FIELD_COMPANY_SIGNUP_ENABLED` → só depois dos passos 1 e 2 e da `FIELD_ASSISTED_SIGNUP_ENABLED` ligada no Freela;
   - `FIELD_EARNINGS_ENABLED` → 2 semanas "em sombra" comparando a conta com cálculo à mão; depois `FIELD_EARNINGS_AUTOCLOSE_ENABLED`;
   - `FIELD_PAYOUTS_ENABLED` (exige EARNINGS) → numa segunda real: fechar semana, gerar fila, pagar no banco, marcar como pago com comprovante, baixar CSV.
   - Apify (opcional): `APIFY_ENABLED=true` + `APIFY_TOKEN` digitado por você no servidor (nunca pelo chat).
6. **Primeiros passos no sistema:** Configurações → criar a praça Moema e a área; Pesquisa → buscar; montar o primeiro roteiro; configurar a remuneração (simulador).

## Decisões do dono que ainda valem
- Piso de R$100 por diária: padrão SEM piso (ambíguo); ligar na tela com condição.
- Faixas 10→R$100 e 20→R$250 por DIA (padrão), alteráveis.
- Leads da pesquisa entram em cadências ativas de "Lead novo".
- Overpass: só 6 de 33 lugares com telefone em Moema; o Apify decide se compensa.

## Pendências conhecidas
Telas não vistas em navegador/celular; tela de lista de cadastros e fila de ambíguos (F7); seletor da regra de confirmação na UI; aba Mapa do roteiro; notificar consultor de Pix pago; fila de pagamento automática ao fechar a semana; teste real contra o Freela e contra o Apify.
