# Restante da Lovable (L0–L13) — progresso

Pedido do dono (21/10): "Pode trazer tudo que falta aí" + "o voucher é o cupom de 1ª contratação que já existe no Freela; o resto do zip pode fazer, menos as de segurança ou regra".
Regra geral: padrão = comportamento da Lovable, tudo configurável, nossa versão preservada como opção; cada módulo atrás de flag PRÓPRIA desligada (produção tem ROUTES, VISIT_FLOW_SELECT, EARNINGS, DECLARED_SIGNUPS e PAYOUTS LIGADAS).
Desenho: `docs/superpowers/specs/2026-10-21-lovable-restante-arquitetura.md` (arquitetura, fases) e `2026-10-21-lovable-restante-ux.md` (telas).

## Decisões do orquestrador (divergências entre as specs)
- Shopping "grande": padrão = área do polígono ≥ 20.000 m² (arquitetura; OSM quase não tem lojas internas); "≥ N lojas" (UX: 50) fica como critério alternativo configurável; ajuste manual sempre possível.
- Gestor: vale a tabela de permissões da arquitetura (item 12): não aprova cupom, não vê/mexe em Pix, pagamentos nem configuração.
- Cupom: PERCENT 100, uso único, validade 30 dias, sem jornada mínima, só admin aprova, 1 por empresa (configuráveis). Vínculo do contratante sem F6/F7: manual pelo admin, registrado; nunca automático por nome.
- Nota do dia: visível ao consultor (padrão `nota`), sempre com a conta.
- Bônus mensal: pago na 1ª semana depois do mês.

## Lotes
- [ ] A: L0 (bug 01/01/1970 + raio do check-in), L1 (painel + resumo/nota), L2 (pins + telefone)
- [ ] B: L3 (checklist + cronômetro), L4 (intervalo)
- [ ] C: L5 (segmentos), L6a (vouchers), L6b (cupom no Freela)
- [ ] D: L7 (planos/N rotas + "Minhas rotas"), L8 (shoppings; dry-run Overpass em BH antes)
- [ ] E: L9 (senha + cadastro + e-mail do contato), L10 (gestor)
- [ ] F: L11 (bônus mensal), L12 (várias praças), L13 (regra por consultor)
- [ ] Verificação final (suíte completa, lint, typecheck, smoke, browser-check) e subida única
