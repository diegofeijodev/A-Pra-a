# Praça igual à Lovable (zip `idea-to-internet-garden (1).zip`, 26/10) — progresso

Pedido do Denner (26/10): "refaça o praça pra ser seguindo totalmente esse aqui, até o design, tudo."

**Retomada automática:** se a sessão cair, ler este arquivo, achar o primeiro item `[ ]` e continuar. Branch `feat/ui-lovable`
(sobre master `e095234`, tag de volta `pre-ui-lovable`). Nada vai para produção sem o Denner (push e compose up via `!`).

## O que o zip novo muda

- Diferença para o zip de 20/10 (`~/Downloads/idea-to-internet-garden`, já portado em L0–L13): **um arquivo só**,
  `src/routes/_authenticated/rotas.tsx` — na aba "geral" das rotas entra o seletor "Perfil dos clientes" (segmentos, vários;
  "Nenhum selecionado = todos os clientes"), que filtra a contagem e quais clientes entram na rota gerada. Na aba "shopping"
  o seletor de perfil sai da tela (fica fixo em Bar + Restaurante para as lojas de dentro).
- O resto do pedido é **apresentação**: telas, menu, nomes, endereços e o design da Lovable.

## Decisões (tomadas sem perguntar, reversíveis)

1. **Menu e telas da Lovable**; o grupo "Comercial" (Funil, Entrada, Buscar estabelecimentos, Mensagens, Campanhas,
   Calendário, Indicadores, Ações, Freela) **some do menu atrás de uma chave** (desligada por padrão), sem apagar código nem
   dados. Prod em 26/10: 1 lead (15/10), 0 ações concluídas, 0 campanhas, 0 disparos, 0 campanhas do Freela — ninguém usa.
2. **Design da Lovable**: claro, azul `oklch(0.52 0.19 258)`, menu lateral azul-marinho `oklch(0.3 0.12 262)`, raio `.75rem`,
   faixa em degradê (`bg-brand`), sombra de cartão, fontes Manrope (texto) + Sora (títulos). Sem botão de tema (a Lovable não
   tem); `users.theme` deixa de mandar.
3. **Uma tela de entrada só**, no layout da Lovable (metade azul + formulário). O campo continua **E-mail** (login por usuário
   com `@praca.local` segue fora, por segurança). Envia para a equipe; se 401, tenta o consultor (token `aud:campo`
   separado). Cada um cai na sua casca.
4. **Casca do representante** igual à Lovable: faixa azul no topo + 5 abas embaixo (Hoje, Mapa, Clientes, Desempenho,
   Carteira). A fila offline (IndexedDB) do campo continua por baixo — é requisito de campo, a Lovable não tem.
5. Continuam fora (já aceito pelo dono 23/10): senha fixa do `bootstrapAdmin`, Google Places gravando dados, pagamento sem
   ledger/"Desfazer" apagando, login `@praca.local`, chave do Google no bundle, dia em UTC, gestor redefinindo senha de admin.

## Mapa Lovable → nosso

| Lovable | Nosso hoje | Destino |
|---|---|---|
| `/` (login) | `/entrar` + `/campo/entrar` | `/entrar` única, layout Lovable |
| `/inicio` "Dashboard" (equipe) | `/consultores/painel` | idem, nome "Dashboard" |
| `/inicio` "Hoje" (representante) | `/campo` | casca nova do representante |
| `/pracas`, `/pracas/$id` | `/praca` | lista + detalhe |
| `/clientes` | `/consultores/clientes` | idem |
| `/mapa` | `/consultores/clientes?modo=mapa` | idem |
| `/rotas` (+ filtro de perfil novo) | `/consultores/roteiros` | idem + filtro |
| `/roteiro/$rotaId` | RoteiroTela (campo) | idem |
| `/representantes` | `/consultores`, `/consultores/[id]` | nome "Representantes" |
| `/vouchers` | `/consultores/cupons` | nome "Vouchers" |
| `/financeiro` (equipe) / "Carteira" (rep.) | `/consultores/pagamentos` / GanhosCard+PixCard | idem |
| `/desempenho` | — | "Em breve" (a Lovable também é só "Em breve") |
| `/usuarios` | dentro de `/configuracoes` | tela própria |
| `/configuracoes` | `/configuracoes` | só o que a Lovable mostra no topo; o resto abaixo |
| `/trocar-senha` | `/campo/senha` (+ equipe?) | tela no layout Lovable |

Endereços novos com redirecionamento dos antigos (vídeos, favoritos e o browser-check usam os antigos).

## Etapas

- [ ] 0. Arquiteto + designer (regra 11/10): `docs/superpowers/specs/2026-10-26-ui-lovable-arquitetura.md` e `-ux.md`
- [ ] 1. Tokens, fontes e fim do botão de tema (commit próprio)
- [ ] 2. Casca da equipe (menu lateral azul-marinho, nomes da Lovable, chave do Comercial)
- [ ] 3. Entrada única + trocar senha no layout Lovable
- [ ] 4. Casca do representante (5 abas) por cima do campo atual
- [ ] 5. Telas, uma a uma, no desenho da Lovable (Dashboard, Praças, Clientes, Mapa, Rotas, Roteiro, Representantes,
      Vouchers, Financeiro, Usuários, Configurações, Desempenho)
- [ ] 6. Filtro "Perfil dos clientes" na rota geral (API + contrato + tela)
- [ ] 7. Endereços da Lovable + redirecionamentos
- [ ] 8. Verificação: lint, typecheck, vitest, jest das partes tocadas, browser-check (um processo por vez, `nice`)
- [ ] 9. Prévia na Vercel → Denner aprova → subida
