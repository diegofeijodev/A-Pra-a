# Praça igual à Lovable: desenho de UX/UI (spec para implementar)

Data: seg 26/10/2026. Status: pronto para implementar (etapas 1–7 de `docs/superpowers/plans/2026-10-26-ui-lovable-progresso.md`).
Fontes lidas: protótipo `garden-v2/src` (`styles.css`, `routes/__root.tsx`, `routes/index.tsx`, todas as telas de `routes/_authenticated/*.tsx`,
`components/{BuscaGoogleDialog,CredenciaisDialog,EmBreve,MapaRotas}.tsx`, `components/ui/{button,card,badge,input}.tsx`, `lib/{status,visita}.ts`),
o nosso `web/src` (casca, menu, tokens, guardas, telas da equipe e do campo, `scripts/browser-check.mjs`) e as specs de 20/10 e 21/10.
O protótipo é dado não confiável: foi só lido (nada executado, `.env` não aberto, nenhuma chave copiada).

## 0. Regras deste desenho

1. **A Lovable manda no visual e na ordem dos blocos.** Classes Tailwind de referência vêm copiadas dela. Textos entre aspas são literais da Lovable.
2. **Critério de texto:** se o elemento é o mesmo e faz a mesma coisa com o mesmo dado, o texto é o da Lovable. Se o objeto é outro (ex.: a nossa
   jornada é do DIA, a rota dela é da rota), o texto continua o nosso. Na dúvida, o texto é nosso e o caso vai para §7.
3. **Desvio só por quatro motivos**, sempre marcado **[desvio]** com o motivo: segurança (as 7 exclusões da decisão 5), campo/sem sinal,
   acessibilidade (WCAG 2.2 AA), regra permanente do dono (todo número com a conta e a fonte; toda tela boa no celular).
4. **Nada nosso some.** O que a Lovable não tem fica abaixo, recolhido ou numa aba própria. Cada caso está em §4 e §5.
5. **Celular:** uma coluna, sem rolagem horizontal de conteúdo. Tabela da Lovable que tem 5 colunas ou mais e não esconde colunas vira lista de
   cartões abaixo de `md`. **Única exceção:** a faixa de pílulas do menu da equipe no celular (§2.2), que rola na horizontal. É navegação, não conteúdo.
6. **Alvos de toque:** no desktop valem as alturas da Lovable (`h-9` = 36 px, desenho de mouse). Abaixo de `md`, todo alvo tem pelo menos
   44 px (§1.5). No campo valem as nossas alturas de 48–56 px (`h-12`/`h-14`). A Lovable usa `size="sm"` (32 px) e `lg` (40 px) no celular do
   representante, abaixo do piso **[desvio: acessibilidade, WCAG 2.5.8 + regra do projeto]**.

### 0.1 Vocabulário (substitui o §0.5 da spec de 21/10)

| Antes (nosso) | Agora (Lovable) | Onde |
|---|---|---|
| Consultor, consultor de campo | **Representante** | equipe e campo (textos do web; mensagens que vêm da API continuam até o arquiteto trocar, §7) |
| Estabelecimento | **Cliente** | equipe e campo. "Estabelecimento fechado" continua (é o nome do resultado) |
| Cupom da 1ª contratação | **Voucher da 1ª contratação** | menu, telas e botões. Na linha do voucher criado, o código continua "Código do cupom no Freela" (é o que o contratante digita lá) |
| Início, painel | **Dashboard** | menu e título da aba do navegador. O título da tela continua "Olá, {nome}" (Lovable) |
| Roteiros do dia, roteiro | **Rotas** (equipe), **rota** (campo) | menu, abas, cartões. A tela de execução do campo se chama "roteiro da rota" (Lovable) |
| Pagamentos | **Financeiro** (equipe), **Carteira** (representante) | menu, títulos |
| Pessoas | **Usuários** | tela própria (§4.10) |
| Praça (plano) | **Praças** | lista e detalhe (§4.2, §4.3) |

Três termos da Lovable fogem da nossa regra de não usar inglês ou jargão: "Dashboard", "Vouchers" e "Status final". Ficam porque o dono
escolheu esses nomes (decisão 1). Não criar outros.

## 1. Tokens, fontes, raio, sombras

### 1.1 Valores da Lovable (copiar exatamente de `styles.css`)

| Token | Valor | Uso |
|---|---|---|
| `--radius` | `0.75rem` | `rounded-sm` 8 px, `md` 10 px, `lg` 12 px, `xl` 16 px, `2xl` 20 px |
| `--background` | `oklch(0.985 0.004 250)` | fundo da página |
| `--foreground` | `oklch(0.2 0.04 260)` | texto |
| `--card` / `--popover` | `oklch(1 0 0)` | cartões, menus |
| `--card-foreground` / `--popover-foreground` | `oklch(0.2 0.04 260)` | |
| `--primary` | `oklch(0.52 0.19 258)` | azul (≈ `#0462D3`, conta à mão) |
| `--primary-foreground` | `oklch(0.99 0 0)` | |
| `--primary-deep` | `oklch(0.3 0.12 262)` | azul-marinho (≈ `#072869`, conta à mão; confirmar ao implementar) |
| `--secondary` | `oklch(0.95 0.025 252)` | |
| `--secondary-foreground` | `oklch(0.3 0.12 262)` | |
| `--muted` | `oklch(0.96 0.008 250)` | |
| `--muted-foreground` | `oklch(0.52 0.03 258)` | |
| `--accent` | `oklch(0.93 0.04 252)` | |
| `--accent-foreground` | `oklch(0.3 0.12 262)` | |
| `--destructive` | `oklch(0.6 0.22 25)` | ver §1.2 |
| `--destructive-foreground` | `oklch(0.99 0 0)` | |
| `--success` | `oklch(0.62 0.15 155)` | ver §1.2 |
| `--warning` | `oklch(0.8 0.15 85)` | ver §1.2 |
| `--border` | `oklch(0.91 0.012 252)` | bordas de cartão e divisórias |
| `--input` | `oklch(0.91 0.012 252)` | ver §1.2 |
| `--ring` | `oklch(0.52 0.19 258)` | foco |
| `--chart-1…5` | `oklch(0.52 0.19 258)`, `oklch(0.8 0.15 85)`, `oklch(0.6 0.22 25)`, `oklch(0.62 0.15 155)`, `oklch(0.55 0.2 300)` | gráficos |
| `--sidebar` | `oklch(0.3 0.12 262)` | menu lateral |
| `--sidebar-foreground` | `oklch(0.93 0.02 252)` | |
| `--sidebar-primary` | `oklch(0.99 0 0)` | marca e nome no menu |
| `--sidebar-primary-foreground` | `oklch(0.3 0.12 262)` | |
| `--sidebar-accent` | `oklch(0.38 0.13 262)` | item ativo e hover |
| `--sidebar-accent-foreground` | `oklch(0.99 0 0)` | |
| `--sidebar-border` | `oklch(0.38 0.1 262)` | |
| `--sidebar-ring` | `oklch(0.7 0.15 258)` | |
| `--gradient-brand` | `linear-gradient(135deg, var(--primary-deep), var(--primary))` | utility `bg-brand` |
| `--shadow-card` | `0 1px 2px oklch(0.3 0.12 262 / 6%), 0 8px 24px -12px oklch(0.3 0.12 262 / 18%)` | utility `shadow-card` |
| Fontes | `--font-sans: "Manrope"…`, `--font-display: "Sora"…` | Manrope 400/500/600/700; Sora 500/600/700 |
| Base | `h1, h2, h3 { font-family: var(--font-display); letter-spacing: -0.02em; }` | |

Contraste dos pares que ficam iguais (conta à mão pela conversão OKLCH → sRGB do CSS Color 4; o `browser-check` confere na implementação):
texto branco no `--primary` **5,5:1**; `--primary` como texto no fundo **5,4:1**; `--muted-foreground` no fundo **5,3:1**, no cartão **5,5:1**,
no `--muted` **4,9:1**; `--sidebar-foreground` no `--sidebar` **11,3:1**; branco no `--sidebar-accent` **10:1**. Todos passam no AA.

### 1.2 Ajustes de acessibilidade [desvio: WCAG 1.4.3 e 1.4.11]

A Lovable usa `success` e `warning` só como cor de ícone e gráfico. O nosso código usa `text-warning`, `text-success`, `text-danger` e
`bg-danger` como TEXTO em 138 lugares (49 arquivos). Escurecer os quatro tokens abaixo resolve todos de uma vez sem tocar nos componentes.
Nenhum elemento desenhado pela Lovable que nós mantemos muda de cara: a estrela do Google, único uso visível de `warning` lá, não vem (§4.3).

| Token | Lovable | Usar | Conta |
|---|---|---|---|
| `--destructive` | `oklch(0.6 0.22 25)` | `oklch(0.57 0.22 25)` | branco no botão 4,3:1 → **4,9:1**; vermelho no branco 4,4:1 → **5,0:1** |
| `--success` | `oklch(0.62 0.15 155)` | `oklch(0.5 0.13 155)` | verde no branco 3,4:1 → **5,6:1** (e branco sobre ele) |
| `--warning` | `oklch(0.8 0.15 85)` | `oklch(0.48 0.11 70)` | âmbar no branco ≈ 1,8:1 → **6,7:1**. O âmbar claro da Lovable continua em `--chart-2` |
| `--input` | `oklch(0.91 0.012 252)` | `oklch(0.66 0.02 255)` | borda do campo de formulário 1,3:1 → **3,1:1**. `--border` (cartões, tabelas) fica o da Lovable |

`--danger` não existe na Lovable: manter `--color-danger: var(--destructive)` no `@theme` como apelido, para não quebrar `text-danger`/`bg-danger`.

### 1.3 Como aplicar no nosso `web/src/app/globals.css` (sem quebrar shadcn)

Os componentes `components/ui/*` são os mesmos do shadcn da Lovable. `button.tsx` é idêntico byte a byte; `card`, `badge` e `input` têm as
mesmas classes. Por isso a troca é só de variáveis e de algumas utilities:

1. `@theme inline`: copiar o da Lovable (acrescenta `--color-primary-deep`, `--color-chart-1…5`, `--color-sidebar*`, as fontes) e manter as
   linhas nossas `--color-danger`.
2. `:root`: virar o bloco da Lovable inteiro, já com os 4 valores de §1.2. **Apagar o bloco `.light`.** Acrescentar `color-scheme: light;`
   no `:root` (os controles nativos de data e seleção ficam claros).
3. `@utility bg-brand` e `@utility shadow-card`: copiar da Lovable.
4. `@layer base`: o da Lovable (`h1, h2, h3` com Sora e `letter-spacing: -0.02em`) e manter `.font-display`.
5. Fontes por `next/font/google` em `app/layout.tsx` (sem `<link>` para o Google, como hoje): `Manrope({ weight: ['400','500','600','700'],
   variable: '--font-manrope' })` e `Sora({ weight: ['500','600','700'], variable: '--font-sora' })`. No `@theme`:
   `--font-sans: var(--font-manrope), "Manrope", ui-sans-serif, system-ui, sans-serif;` e
   `--font-display: var(--font-sora), "Sora", ui-sans-serif, system-ui, sans-serif;`. Sai Montserrat/Inter.
6. **`card-surface` vira o cartão da Lovable**, e é a alavanca que muda todas as telas nossas de uma vez:
   `background-color: var(--color-card); border-radius: var(--radius-2xl); box-shadow: var(--shadow-card);` sem borda.
7. **Títulos, regra única:** nas telas redesenhadas, `font-display text-xl font-extrabold` vira `text-3xl font-semibold` (h1) e o título de
   seção vira `text-lg font-semibold` (h2). Sora só tem 500/600/700: **nunca** `font-black`/`font-extrabold`. Números grandes:
   `text-3xl font-semibold` (Lovable), nunca menores que 24 px.
8. `@utility tag` (caixa alta 10 px): fica para as telas do grupo Comercial. As telas redesenhadas não usam.
9. `.simples-chip`: borda `1px solid var(--input)`. Escolhido = `bg-primary text-primary-foreground border-primary` + ícone ✓ antes do texto
   (cor nunca sozinha, WCAG 1.4.1). Sai a borda de 3 px em `--foreground`, que era do tema escuro.
10. Modo Sol (`[data-sol='true']`): continua, agora com `border: 2px solid var(--foreground)` (o cartão não tem mais borda para engrossar).
11. `.tiles-escuros` (inversão do mapa): fica sem uso. Todo `dark={user?.theme !== 'light'}` dos mapas (`MapaSituacao`, `DividirRotas`,
    `ConsultorMapa`, `MapaCampo` com `escuro={!sol}`…) vira `dark={false}`.
12. `@media print` fica igual.
13. Cor da barra do navegador e do atalho do campo: `campo/layout.tsx` `themeColor: '#1d1d1b'` e o ícone `/campo/icone/*` passam para o
    `--primary-deep` convertido em hex na implementação (com a mesma fórmula; não usar valor chutado).

### 1.4 Tema escuro e `users.theme`

Sem tema escuro e sem botão de tema (decisão 2). `ThemeSync` sai do `(app)/layout.tsx` (ou vira componente vazio). O botão "Tema claro/escuro"
sai do `AppShell`. A coluna `users.theme` fica no banco e no `PATCH /v1/users/me` sem efeito na tela: não mexer na API.
`prefers-color-scheme: dark` não muda nada (o produto da Lovable é só claro).

### 1.5 Alvo de toque no celular sem mudar o desktop

Em `components/ui/button.tsx`, acrescentar à classe base `min-h-11 md:min-h-0` e ao tamanho `icon` `min-w-11 md:min-w-0`. Em `input.tsx` e no
`SelectTrigger`, `min-h-11 md:min-h-0`. `min-h-*` é outro grupo do `tailwind-merge`, então um `h-12`/`h-14` explícito do campo continua valendo
em qualquer largura. No desktop a tela fica idêntica à da Lovable.

### 1.6 Cores de situação do cliente

A Lovable pinta o cliente com estas cores (`lib/status.ts`): A visitar `#2563eb`, Cadastrado `#16a34a`, Não cadastrado `#dc2626`,
Não contrata freela `#f97316`, Estabelecimento fechado `#334155`, Ligar depois `#f59e0b`, Retornar outro dia `#9333ea`.
As nossas vêm da API (§34.3 do contrato) e já são quase as mesmas. **Mudam só os rótulos** que são o mesmo estado (§4.4). As cores ficam as da API,
porque `#f97316` já é o nosso "Já usa o Freela", que a Lovable não tem. Pinos e legendas continuam com **cor + forma** (●■◆⬢▲✕—). A Lovable
usa só cor, o que reprova no WCAG 1.4.1 **[desvio: acessibilidade]**.

## 2. Cascas

### 2.1 Equipe no desktop (≥ 768 px), igual à Lovable

```text
┌──────────────┬──────────────────────────────────────────────────────┐
│ ⌖ Praça      │  (main: mx-auto max-w-7xl p-4 md:p-8)                │
│              │                                                      │
│ ▣ Dashboard  │                                                      │
│ ⌖ Praças     │                                                      │
│ 👥 Clientes  │                                                      │
│ 🗺 Mapa      │                                                      │
│ ↝ Rotas      │                                                      │
│ ✓ Represent. │                                                      │
│ 🎟 Vouchers  │                                                      │
│ ▤ Financeiro │                                                      │
│ ⚙ Configur.  │ ← só admin                                           │
│ 🛡 Usuários  │ ← só admin                                           │
│──────────────│                                                      │
│ Diego Feijó  │                                                      │
│ diego@… ·    │                                                      │
│ Admin        │                                                      │
│ Trocar senha │ ← nosso                                              │
│ [ ⏻ Sair   ] │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

- Raiz: `flex min-h-screen`.
- `aside`: `sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex`.
- Marca: `flex items-center gap-2 px-5 py-5 text-lg font-semibold text-sidebar-primary` + `MapPin h-5 w-5` + "Praça". Sai "PRAÇA." com
  o ponto amarelo (o `browser-check` procura outra coisa, §6).
- `nav`: `flex-1 space-y-1 overflow-y-auto px-3` (o `overflow-y-auto` é nosso, para quando o grupo Comercial estiver ligado).
- Item: `<Link>` `flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent`; ativo
  `bg-sidebar-accent text-sidebar-accent-foreground font-semibold` + `aria-current="page"`; ícone lucide `h-4 w-4`.
- **Item ativo por prefixo** (como o `Link` do TanStack): `/pracas/…` acende Praças e `/representantes/…` acende Representantes.
  `itemAtivo` deixa de comparar o caminho exato.
- Rodapé: `border-t border-sidebar-border p-4 text-sm`. Nome `font-medium text-sidebar-primary`. Linha `mb-3 text-xs opacity-70` com
  `{e-mail} · {Admin|Gestor|Equipe}`; a Lovable mostra `@usuario · perfil`, e o nosso login é por e-mail.
  Link "Trocar senha" (nosso: a Lovable só leva à troca quando ela é obrigatória) `mb-2 block text-xs underline opacity-80` → `/trocar-senha`.
  `<Button variant="secondary" size="sm" className="w-full">` com `LogOut` + "Sair".
- Conteúdo: `flex-1 min-w-0` e `main` `mx-auto max-w-7xl p-4 md:p-8`. Sai o `md:ml-60`, o `pb-24` e o `max-w-6xl`.

### 2.2 Equipe no celular (< 768 px)

```text
┌────────────────────────────────┐
│▓▓ ⌖ Praça                  ⏻ ▓▓│ ← bg-brand (degradê)
├────────────────────────────────┤
│ [Dashboard] Praças Clientes Ma→│ ← pílulas, rolam na horizontal
├────────────────────────────────┤
│ conteúdo (p-4)                 │
```

- Cabeçalho: `flex items-center justify-between bg-brand px-4 py-3 text-primary-foreground md:hidden`; marca `MapPin h-5` + "Praça";
  "Sair" = botão só com ícone `LogOut h-5` e `aria-label="Sair"`, em área de toque 44 × 44 (`grid h-11 w-11 place-items-center`).
- Faixa: `flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden`; pílula `inline-flex min-h-11 items-center whitespace-nowrap
  rounded-md px-3 text-sm text-muted-foreground`; ativa `bg-secondary text-secondary-foreground font-semibold`. **A Lovable usa `py-1.5`
  (≈ 32 px); aqui `min-h-11` [desvio: alvo]**. Ao abrir, a pílula ativa rola para ficar à vista (`scrollIntoView({ inline: 'center' })`).
- Sai a gaveta com o botão de três linhas.

### 2.3 Menu: itens, perfis e a chave do Comercial (`modules/acesso/domain/acesso.ts`)

| Item | Endereço | Ícone lucide | Quem vê | Some quando |
|---|---|---|---|---|
| Dashboard | `/inicio` | `LayoutDashboard` | equipe toda | `features.dashboard` desligada |
| Praças | `/pracas` | `MapPin` | equipe toda | nunca |
| Clientes | `/clientes` | `Users` | equipe toda | `features.map_pins` desligada |
| Mapa | `/mapa` | `Map` | equipe toda | `features.map_pins` desligada |
| Rotas | `/rotas` | `Route` | equipe toda | nunca |
| Representantes | `/representantes` | `UserCheck` | equipe toda | nunca |
| Vouchers | `/vouchers` | `Ticket` | equipe toda | `features.vouchers` desligada |
| Financeiro | `/financeiro` | `Wallet` | equipe toda | `FIELD_PAYOUTS_ENABLED` desligada (ver §7: falta `features.payouts`) |
| Configurações | `/configuracoes` | `Settings` | só admin | nunca |
| Usuários | `/usuarios` | `ShieldCheck` | só admin | nunca |

- Ordem fixa da Lovable (`staffNav` e depois `adminNav`). Gestor e equipe veem as 8 primeiras; admin vê as 10. Sai o menu agrupado
  (Operação de campo / Comercial / Administração) e sai o `menuDeHoje`.
- **Chave do Comercial** (desligada por padrão; quem decide onde ela mora é o arquiteto, §7). Ligada, depois de "Financeiro" entra uma divisória
  (`my-2 border-t border-sidebar-border`), o título `px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide opacity-60` "Comercial" e os
  itens Funil, Entrada, Buscar estabelecimentos, Mensagens, Campanhas, Calendário, Indicadores, Ações (`/hoje`), Freela. O sino de notificações
  (`Bell`, que fala de ações e leads) só aparece com a chave, no rodapé, acima do nome. Desligada: as páginas continuam respondendo pela URL
  (o código fica), só não aparecem no menu.
- A busca de clientes e a importação de planilha não ficam presas à chave. Elas reaparecem como botões no detalhe da praça (§4.3), que é onde a
  Lovable põe "Buscar clientes no Google Maps" e "Importar Excel". Sem isso, a equipe ficaria sem como pôr clientes na praça.
- Página inicial da equipe: sempre `/inicio`. Sai `paginaInicial`, que mandava para `/hoje` (Ações, que agora é do Comercial). Com o painel
  desligado, `/inicio` mostra o cabeçalho "Olá, {nome}" e o aviso "O Dashboard ainda não está ligado neste servidor." com atalhos para Praças e Rotas.

### 2.4 Estados globais

- Guarda do `(app)/layout.tsx` enquanto lê a sessão: `flex min-h-screen items-center justify-center` + `Loader2 h-6 w-6 animate-spin
  text-primary` (Lovable). É uma leitura local, que leva menos de 1 s.
- `app/not-found.tsx` (novo, igual ao da Lovable): "404" `text-7xl font-bold`, "Página não encontrada", "A página que você procura não existe.",
  botão "Voltar ao início" → `/entrar`, que leva cada um para a sua casca.
- `app/error.tsx`: "Algo deu errado" / "Tente novamente ou volte ao início." / [Tentar novamente] [Voltar ao início].
- Avisos: `Toaster position="top-center" richColors` (já é assim em `providers.tsx`).

### 2.5 Representante (celular, 360–430 px), igual à Lovable por cima do nosso campo

```text
┌────────────────────────────────┐
│▓▓ ⌖ Praça                 ☀  ⏻▓│ ← sticky, bg-brand
├────────────────────────────────┤
│ ⚠ 1 envio pendente · enviando  │ ← FaixaFila (nossa), sticky logo abaixo
│   quando voltar o sinal        │
├────────────────────────────────┤
│ conteúdo da visão (max-w-2xl   │
│ p-4)                           │
│                                │
├────────────────────────────────┤
│ [QR code] [ Cheguei: tirar…  ] │ ← barra de ação NOSSA, só na aba Hoje
├────────────────────────────────┤
│  📅     🗺     👥     📊     ▤ │ ← 5 abas da Lovable
│ Hoje   Mapa Clientes Desemp. Carteira
└────────────────────────────────┘
```

- Raiz: `min-h-dvh` + espaço embaixo igual à soma do que é fixo: `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` sem a barra de ação e
  `pb-[calc(9.5rem+env(safe-area-inset-bottom))]` com ela.
- Cabeçalho: `sticky top-0 z-20 flex items-center justify-between bg-brand px-4 py-3 text-primary-foreground`, com
  `pt-[max(0.75rem,env(safe-area-inset-top))]`. Marca `flex items-center gap-2 font-semibold` + `MapPin h-5` + "Praça". À direita, "Sair"
  (`LogOut h-5`, `aria-label="Sair"`, `opacity-80`, área 44 × 44). Ao lado dele, o interruptor Sol, que é nosso: ícone ☀ em 44 × 44,
  `role="switch"` e `aria-checked`, `aria-label="Contraste para sol forte"`. Só aparece nas visões Hoje e Roteiro **[desvio: campo]**.
  "Sair" continua limpando o cache da conta e mantendo a fila no aparelho (o `CampoTopo` de hoje).
- `FaixaFila` e `AvisoGps`: `sticky top-[3.25rem] z-10`, logo abaixo do cabeçalho, em todas as visões **[desvio: campo]**.
- `CampoTopo` vira **só o h1** (`text-3xl font-semibold`, ou `text-lg` nas visões de tarefa) em todas as visões (`nova`, `visita`, `parada`, `qr`,
  `cadastro`, `pedir-cupom`, `resumo`, `proximos`). O nome, a praça e o "Sair" já estão no cabeçalho e não se repetem.
- Todo botão fixo embaixo de uma visão (o "Concluir…" da visita, o "Enviar pedido do voucher", o "Fazer check-in" do completo) segue a regra da
  barra de ação: `bottom-[calc(3.5rem+env(safe-area-inset-bottom))]`, logo acima das abas. O conteúdo ganha o `pb` somando os dois.
- Conteúdo: `mx-auto max-w-2xl p-4`.
- Abas: `nav` `aria-label="Seções"` `fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)]`.
  Cada uma é `<button type="button">` (**nunca `Link`**: trocar de aba é `irPara({ v })`, que funciona sem sinal) com
  `flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs text-muted-foreground`; ativa `text-primary font-semibold`
  + `aria-current="page"`. Ícones lucide `h-5 w-5`: `CalendarCheck`, `Map`, `Users`, `BarChart3`, `Wallet`.

| Aba (Lovable) | Visão `?v=` | Conteúdo | Seção |
|---|---|---|---|
| Hoje | `hoje` (padrão) e as que saem dela (`roteiro`, `nova`, `visita`, `parada`, `qr`, `cadastro`, `pedir-cupom`, `resumo`, `proximos`) | a nossa (simples ou completa), no formato de §4.12 | §4.12, §4.13 |
| Mapa | `mapa` (visão nova) | `MapaCampo` com o cabeçalho da Lovable | §4.14 |
| Clientes | `clientes` (visão nova) | Retornos · Vouchers · Visitados | §4.14 |
| Desempenho | `desempenho` (visão nova) | `EmBreve` da Lovable | §4.14 |
| Carteira | `carteira` (visão nova) | Ganhos, Pix e cadastros confirmados | §4.14 |

- As 3 abas de baixo da `SimplesHojeTela` (Hoje · Retornos · Ganhos) saem: Retornos vai para Clientes e Ganhos para Carteira.
- **Barra de ação fixa** (nossa, só na visão `hoje`): a de hoje (`QR code` + o botão principal, que pode ser Iniciar o dia, Cheguei, Continuar
  visita, Voltar do intervalo ou Visita no caminho), agora em `fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t
  bg-card/95 backdrop-blur`, logo acima das abas. Ela existe porque a Lovable não tem jornada sem rota e porque leva a "Cheguei" com 1 toque
  na zona do polegar **[desvio: campo]**. Na visão `roteiro` ela some: os botões ficam no cartão do topo, como na Lovable.
- O motor (`CampoMotor`: fila, `/me`, trilha) e as guardas de `campo/(sessao)/layout.tsx` continuam iguais. Mudam só os redirecionamentos
  (§3.3). Sem sessão: `/entrar`. Senha provisória pendente: `/trocar-senha`.

## 3. Entrada única e troca de senha

### 3.1 `/entrar` (layout da Lovable, campo **E-mail**)

```text
desktop (lg+)                                   celular
┌───────────────────────┬──────────────────┐   ┌──────────────────────┐
│▓ ⌖ Praça              │                  │   │ ⌖ Praça  (azul)      │
│▓                      │  Entrar          │   │ Entrar               │
│▓ Abra praças com      │  Use o e-mail e  │   │ Use o e-mail e a     │
│▓ método.              │  a senha…        │   │ senha fornecidos.    │
│▓ Representantes,      │  E-mail          │   │ E-mail               │
│▓ clientes, rotas e …  │  [            ]  │   │ [                  ] │
│▓                      │  Senha           │   │ Senha                │
│▓ © 2026 Praça         │  [            ]  │   │ [                  ] │
│▓                      │  [   Entrar    ] │   │ [      Entrar      ] │
└───────────────────────┴──────────────────┘   └──────────────────────┘
```

- Raiz `grid min-h-screen lg:grid-cols-2`. Painel esquerdo `relative hidden flex-col justify-between bg-brand p-12 text-primary-foreground lg:flex`:
  marca `flex items-center gap-2 text-lg font-semibold` + `MapPin h-6`; bloco `space-y-4` com h1 `text-5xl font-semibold leading-tight`
  "Abra praças com método." e p `max-w-md text-lg opacity-80` "Representantes, clientes, rotas e visitas em campo — tudo num só lugar.";
  rodapé `text-sm opacity-60` "© {ano} Praça".
- Direita `flex items-center justify-center p-6`; `form` `w-full max-w-sm space-y-6`; marca no celular `flex items-center gap-2 text-primary lg:hidden`;
  h2 `text-2xl font-semibold` "Entrar"; p `text-sm text-muted-foreground` "Use o e-mail e a senha fornecidos." (Lovable: "Use o usuário e a senha
  fornecidos.").
- Campos com `react-hook-form` + Zod, como hoje. `Label` "E-mail" + `Input id="email" type="email" inputMode="email" autoComplete="username"
  autoCapitalize="none" className="h-12"`; `Label` "Senha" + `Input id="senha" type="password" autoComplete="current-password" className="h-12"`.
  Botão `type="submit" className="h-12 w-full text-base"` "Entrar", com `Loader2 animate-spin` enquanto envia. Os erros de validação ficam
  embaixo do campo (`text-xs text-destructive`): "Informe um e-mail válido." e "A senha tem ao menos 6 caracteres." A Lovable não valida
  na tela; aqui fica a validação.
- `<title>` "Entrar — Praça". O `?demo=1` atrás da flag continua.

**Envio (uma tela, duas contas):**

1. `POST /v1/auth/login` (equipe). Deu certo: grava `authUser`, apaga uma `campoSession` que houver no aparelho (a fila do IndexedDB fica) e vai
   para `/inicio`.
2. Só se a resposta for **401 de credencial** (e-mail ou senha não conferem): `POST /v1/campo/auth/login`. Um 401 ou 403 com código próprio
   (conta desativada, por exemplo) mostra a mensagem do servidor e não tenta o campo, para a mensagem útil não sumir atrás de "E-mail ou senha
   incorretos". O arquiteto confirma os códigos (§7, item 9). Deu certo: grava `campoSession` **sem gravar nada em `authUser`** (o
   `browser-check` confere isso), limpa o cache do React Query e vai para `/trocar-senha` com senha provisória ou para `/campo` sem ela.
3. Os dois responderam 401: aviso "E-mail ou senha incorretos. Confira e tente de novo." (Lovable: "Usuário ou senha incorretos."), com o
   que foi digitado mantido. Conta desativada ou qualquer outra recusa: a mensagem do servidor, por `apiErrorMessage()`.
4. A equipe respondeu outra coisa que não 401 (429, 5xx, sem rede): mostrar o erro e **não** tentar o campo. Sem rede: "Não conseguimos falar com o
   servidor. Verifique a internet e tente de novo."
5. Quem já tem sessão não vê a tela: com `authUser`, vai para `/inicio`; com `campoSession`, vai para `/trocar-senha` ou `/campo`.
6. E-mail que existe nas duas contas entra como equipe. `/entrar?como=representante` pula o passo 1 (link que a equipe manda para quem é das duas).

### 3.2 `/trocar-senha` (layout da Lovable, para os dois)

```text
┌──────────────────── bg-secondary ────────────────────┐
│        ┌──────────────────────────────────┐          │
│        │ 🔑                               │          │
│        │ Crie sua nova senha              │          │
│        │ Por segurança, troque a senha    │          │
│        │ provisória antes de continuar.   │          │
│        │ Senha provisória                 │          │
│        │ [                              ] │          │
│        │ Nova senha                       │          │
│        │ [                     ][Mostrar] │          │
│        │ ✓ 8 caracteres ✕ Uma letra maiúsc│          │
│        │ Confirmar senha                  │          │
│        │ [                              ] │          │
│        │ [          Salvar senha        ] │          │
│        └──────────────────────────────────┘          │
└──────────────────────────────────────────────────────┘
```

- Raiz `flex min-h-dvh items-center justify-center bg-secondary p-6`; `form` `w-full max-w-sm space-y-5 rounded-2xl bg-card p-8 shadow-card`;
  `KeyRound h-8 w-8 text-primary`; h1 `text-2xl font-semibold` "Crie sua nova senha"; p `text-sm text-muted-foreground`: com troca obrigatória,
  "Por segurança, troque a senha provisória antes de continuar."; sem ela, "Defina uma nova senha."
- Campos (`h-12`, ids de hoje): `#atual` com o rótulo "Senha provisória" na troca obrigatória e "Senha atual" fora dela. A Lovable não pede, mas a
  nossa API exige, e é mais seguro **[desvio: segurança]**. `#nova` "Nova senha", com [Mostrar] e a lista viva `RegraSenha` quando a regra estiver
  ligada. `#confirma` "Confirmar senha".
- Texto de ajuda: com a regra ligada, a lista `RegraSenha` ("Uma letra maiúscula"…); desligada, o texto da Lovable "Mínimo de 8 caracteres, com uma
  letra maiúscula e um número." só se a política exigir isso, senão "Mínimo de 8 caracteres."
- Erros embaixo do campo: "As senhas não coincidem." (Lovable), "A senha nova precisa ser diferente da atual." e o `WEAK_PASSWORD` do servidor.
- Botão `h-12 w-full` "Salvar senha". Deu certo: aviso "Senha alterada." e volta para `/campo` (representante) ou `/inicio` (equipe). Fora da
  troca obrigatória, um link "← Voltar" no topo do cartão.
- A tela decide pela sessão: `campoSession` usa a troca do campo de hoje; `authUser` usa a troca da própria conta da equipe (o arquiteto
  confirma se a API da equipe pede a senha atual, §7).

### 3.3 Endereços antigos

`/campo/entrar` → `/entrar`. `/campo/senha` → `/trocar-senha`. O atalho instalado (`manifest start_url: /campo`) continua funcionando: sem sessão,
a guarda manda para `/entrar`.

## 4. Telas, uma a uma

Formato de cada tela: **Lovable** (o que ela mostra, em ordem) → **Nosso dado** (de onde vem) → **Muda** (o que a implementação faz).
Estados comuns a todas: carregando = esqueleto no formato do conteúdo (`animate-pulse rounded-2xl bg-muted`), nunca spinner sozinho por mais de
1 s; erro = mensagem de `apiErrorMessage()` + [Tentar de novo], com o que foi digitado mantido; módulo desligado = o item some do menu e,
pela URL, "Este recurso ainda não está ligado neste servidor."; sem permissão pela URL = "Apenas administradores acessam esta página."
(Lovable) + [Voltar ao Dashboard].

### 4.1 Dashboard (`/inicio`)

**Lovable** (`inicio.tsx`, equipe):
1. Cabeçalho `flex flex-wrap items-end justify-between gap-3`: h1 `text-3xl font-semibold` "Olá, {primeiro nome}"; p `text-muted-foreground`
   "Painel ao vivo da operação · atualiza a cada minuto" + `Loader2 h-3 w-3 animate-spin` enquanto busca. À direita, seletor de período
   `flex gap-1 rounded-lg bg-muted p-1` com `Button size="sm"` (`default` no escolhido, `ghost` nos outros): "Hoje", "7 dias", "30 dias",
   "90 dias". Abre em **7 dias**.
2. Grade `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` com 8 cartões `rounded-2xl bg-card p-5 shadow-card`. Em cada um, uma linha
   `mb-2 flex items-center justify-between text-sm text-muted-foreground` com o rótulo e o ícone `h-4 w-4 text-primary`, o valor
   `text-3xl font-semibold` e a linha de apoio `text-xs text-muted-foreground`. Os cartões: "Visitas concluídas" (`CheckCircle2`),
   "Positivação" (`TrendingUp`), "Tempo médio de visita" (`Clock`), "Visitas realizadas" (`Users`), "Cadastros" (`UserCheck`), "Vouchers"
   (`Ticket`), "Praças abertas" (`MapPin`), "Clientes mapeados" (`Map`).
3. Grade `grid gap-4 lg:grid-cols-5`. Cartão `lg:col-span-3` com h2 `mb-3 flex items-center gap-2 text-lg font-semibold`, `Trophy` e
   "Ranking dos representantes": tabela `w-full text-sm` com "#", "Representante", "Visitas", "Cadastros" (`font-semibold`), "Positivação";
   🥇🥈🥉 nos 3 primeiros; vazio "Sem visitas registradas no período.". Cartão `lg:col-span-2` com h2 "Resultado das visitas": por resultado,
   linha `flex justify-between text-sm` (rótulo, número `font-medium`) e barra `h-2 rounded-full bg-muted` com preenchimento na cor.

**Nosso dado:** `PainelGestor` (`usePainel`, `cartoesDoPainel`, `ranking`, `by_result`, `csvRanking`), `useAtencao`.

**Muda:**
- Período abre em "7 dias" (hoje abre em "Hoje"). Ao lado do seletor fica o nosso "Praça: todas" (`select h-9`, `aria-label="Praça"`).
- Rótulos dos cartões passam a ser os da Lovable: "Cupons" vira "Vouchers", "Estabelecimentos mapeados" vira "Clientes mapeados", e "Tempo entre
  visitas"/"Tempo dentro do local" vira "Tempo médio de visita" (o que é medido vai para a linha de apoio). A linha de apoio é a nossa `conta`.
  Embaixo, dentro do cartão, fica o `<details>` "ⓘ De onde vem" com a `fonte`, por causa da regra do dono de 08/10 (o `browser-check` conta 8).
  Com os vouchers desligados, o valor é "—" e a linha diz "Não ligado neste servidor".
- **Faixa "Atenção agora"** (nossa) entre o cabeçalho e os cartões, só quando há alerta:
  `flex min-h-11 items-center justify-between rounded-xl border border-warning/40 bg-warning/10 px-4 text-sm font-semibold`
  "⚠ Atenção agora: 2 representantes precisam de você ›" → `/representantes#em-campo`.
- Ranking: tabela da Lovable a partir de `sm`. Abaixo de `sm`, lista de uma linha por pessoa ("🥇 Ana · 12 cadastros · 30 visitas · 40%"),
  porque 5 colunas não cabem em 328 px. O nome leva a `/representantes/{id}`. À direita do h2, `Button variant="outline" size="sm"` "Baixar CSV"
  (nosso). Embaixo, `text-xs` "Ordem: cadastros, depois positivação (cadastros ÷ visitas)."
- "Resultado das visitas" fica no desenho de barras da Lovable, com os rótulos novos de §4.4. Embaixo, `text-xs`: "Total {n} = visitas realizadas."
- Sai o cartão nosso "Ainda não há visitas nesse período…": o vazio é o da Lovable, dentro do ranking.

### 4.2 Praças (`/pracas`)

**Lovable** (`pracas.index.tsx`): cabeçalho `flex items-center justify-between`, com h1 "Praças" e `Button` "+ Nova praça". Grade
`grid gap-4 sm:grid-cols-2 lg:grid-cols-3` de cartões-link `rounded-2xl bg-card p-6 shadow-card transition hover:-translate-y-0.5`: `MapPin mb-3 h-5
text-primary`, nome `text-lg font-semibold`, "Cidade/UF" `text-sm text-muted-foreground` e a linha `mt-3 flex items-center justify-between text-sm`
com `Badge variant="secondary"` da situação e "{n} clientes". Vazio: "Nenhuma praça criada ainda." Diálogo "Nova praça" com Nome, Cidade + UF
(`grid-cols-[1fr_80px]`), Data de início e [Criar].

**Nosso dado:** `usePracas` (`name`, `city`, `start_date`, `end_date`, `cobertura{cidade, uf}`), `NewPracaForm`, `AberturaPraca`. Não temos
situação gravada nem número de clientes por praça.

**Muda:**
- **Situação calculada pelas datas** (`todaySp()`): antes do início, "Planejamento"; do início ao fim, "Em andamento"; depois do fim, "Concluída".
  A Lovable deixa trocar à mão; aqui, para mudar, edita-se a data no detalhe **[desvio: dado; pergunta em §7]**.
- "{n} clientes" precisa de `lead_count` em `GET /v1/pracas` (arquiteto, §7). Enquanto não vier, a linha mostra o período ("12/10 → 18/01").
- "Cidade/UF" = `cobertura.cidade ?? city` + "/" + `cobertura.uf`.
- Vazio com ação: "Nenhuma praça criada ainda." + [Nova praça].
- Diálogo "Nova praça" no desenho da Lovable, com os nossos campos: Nome; Cidade (busca do IBGE a partir de 3 letras, lista "Cidade · UF"; a UF
  vem junto e aparece só para leitura no lugar do campo UF); Data de início (padrão hoje); **Previsão de fim** (a API exige) **[desvio: dado]**.
  Rodapé [Criar]. Link `text-sm` "Abrir com o mapa da região" → `AberturaPraca` (nosso, com raio e cidades em volta).

### 4.3 Detalhe da praça (`/pracas/[id]`)

**Lovable** (`pracas.$id.tsx`): link "← Praças" (`inline-flex items-center gap-1 text-sm text-muted-foreground`); cabeçalho
`flex flex-wrap items-end justify-between gap-3` com h1 nome e p "Cidade/UF · {n} clientes". À direita: seletor de situação, [Importar Excel]
(desligado, "Em breve"), [Buscar clientes no Google Maps] e [Atualizar dados do Google]. Tabela `overflow-hidden rounded-2xl bg-card shadow-card`
com "Cliente" (nome + "segmento · endereço"), "Contato" (`hidden md:table-cell`), "Google" (`hidden lg:table-cell`: nota, site, horário) e
"Origem" (`Badge variant="outline"`). Vazio: "Nenhum cliente. Use a busca no Google Maps para começar." Rodapé `text-xs`: "Dados de estabelecimentos
fornecidos pelo Google Maps."

**Nosso dado:** a lista de `ListaClientes` (`GET /v1/consultores/map/list?praca_id=`), `BuscaEstabelecimentos` (mapa aberto/Apify, por área),
`/entrada` (importação), `AreasAtuacao`, `DadosDaPraca`, e o plano de 11 etapas (a tela `/praca` de hoje).

**Muda:**
- Subtítulo: "Belo Horizonte/MG · {n} clientes · raio de 50 km, 30 cidades em volta" (a cobertura nossa entra no fim).
- No lugar do seletor de situação: o `Badge` calculado + [Editar praça] (`outline`, `Pencil`), que abre um diálogo com Nome, Cidade, Data de início,
  Previsão de fim e "Recalcular datas" (o `DadosDaPraca` de hoje).
- [Importar planilha] (`outline`, `FileSpreadsheet`) **ligado**, abre `/entrada?praca={id}`. O rótulo é "planilha" e não "Excel" porque aceitamos
  CSV e XML **[desvio: texto honesto]**. Fica visível mesmo com a chave do Comercial desligada (§2.3).
- [Buscar clientes no mapa] (padrão, `Search`) abre um `Dialog` `max-h-[90vh] overflow-y-auto sm:max-w-4xl` com o título "Buscar clientes no mapa" e
  a descrição da Lovable "Encontre estabelecimentos da cidade por segmento e importe para a praça.". Dentro fica o nosso `BuscaEstabelecimentos`
  (1. Onde buscar · 2. O que buscar · 3. Escolha quais entram), já com a área desta praça. Onde o nosso passo é o mesmo da Lovable, os botões ganham
  o texto dela: "Ver estimativa", "Confirmar e buscar", "Parar", "Importar {n} clientes". Quem pode: admin e gestor (o gestor só no mapa aberto,
  como hoje). A tela `/prospeccao` continua existindo para o Comercial.
- [Atualizar dados do Google] **sai** (decisão 5: o Google Places grava telefone, horário e nota). Nada entra no lugar.
- Tabela: "Cliente" (o nome é um `button` que abre o `LeadPanel`; o apoio é "{segmento} · {endereço}", ou "{endereço} · {cidade}" até a lista trazer o
  segmento, §7); "Contato" `hidden md:table-cell` (telefone mascarado "(31) 9****-4321" + "WhatsApp", sem link: a lista da equipe mascara);
  "Situação" `hidden lg:table-cell` no lugar de "Google" (símbolo colorido + rótulo + "última visita seg 19/10 · Ana"); "Origem" (`Badge
  variant="outline"`: "Mapa aberto", "Planilha", "Visita de campo", "Formulário", "Manual"; a lista precisa trazer a origem, §7). Acima da tabela,
  à direita, `Input` `max-w-xs` "Buscar por nome" (nosso; com centenas de clientes, sem ele não se acha ninguém). Embaixo, "← Anteriores" e
  "Próximos →" (a lista é paginada).
- Vazio: "Nenhum cliente. Use a busca no mapa para começar." + [Buscar clientes no mapa].
- Com `features.map_pins` desligada, a lista responde `404 MAP_PINS_DISABLED` e não pode ser chamada (nada de sondar rota desligada). No lugar
  da tabela entra "A lista de clientes ainda não está ligada neste servidor." Cabeçalho, botões, Áreas e Plano continuam funcionando: o
  `browser-check` abre o plano com as flags desligadas.
- Rodapé: "Dados de estabelecimentos do mapa aberto (© colaboradores do OpenStreetMap)." A licença exige a atribuição.
- Abaixo da tabela, duas seções nossas recolhidas (`<details>` em cartão `rounded-2xl bg-card p-5 shadow-card`, `summary` `text-lg font-semibold`):
  "Áreas de atuação" (`AreasAtuacao`; admin e gestor editam, e é daqui que Rotas lê as áreas) e "Plano de abertura (11 etapas)" (faixa de etapas,
  etapas com ações e ações fixas, o conteúdo de `/praca` de hoje).

### 4.4 Clientes (`/clientes`)

**Lovable** (`clientes.tsx`): h1 "Clientes"; p "Clientes já visitados aparecem aqui com o resultado da visita."; pílulas
`flex items-center gap-2 rounded-full border px-3 py-1 text-sm` (escolhida `bg-primary text-primary-foreground`, as outras `bg-card`): "Todos"
e uma por resultado (sem "A visitar"), com bolinha de cor, rótulo e número em negrito. **Escolha única.** Filtros: "Todos os estados", "Todas as
cidades" e `Input` "Buscar por nome" `max-w-xs`. Tabela com "Cliente" (nome + "segmento · bairro"), "Cidade/UF" (`hidden md`), "Contato"
(`hidden lg`) e "Status" (bolinha + seletor que troca o status). Vazio: "Nenhum cliente visitado com esses filtros ainda."

**Nosso dado:** `ListaClientes` (`codes`, `counts`, `q`, cursor, `without_location`, `conta`).

**Muda:**
- Pílulas de **escolha única** como na Lovable. "Todos" = todos os códigos menos `a_visitar`; cada pílula = um código. O número vem de `counts`.
  `min-h-11` no celular, quebrando linha (sem rolagem lateral). No lugar da bolinha, o símbolo colorido (§1.6).
- **Rótulos** (renomear em `domain/pin-rules.ts`, contrato §34.3, e no `SITUACOES` do web): `cadastrado` "Cadastrou" → **"Cadastrado"**;
  `nao_cadastrado` "Sem interesse" → **"Não cadastrado"**; `nao_contrata` "Não contrata freelas" → **"Não contrata freela"**; `a_visitar` e
  `fechado` já são iguais. Ficam os nossos: `ja_usa` "Já usa o Freela" (a Lovable não tem) e `retornar` "Quer retorno" (junta os dois dela,
  "Ligar depois" e "Retornar outro dia"). O Dashboard (`by_result`) usa os mesmos rótulos.
- Filtros: "Todas as praças abertas" (nosso, no lugar de "Todos os estados") e "Buscar por nome" (busca nome, endereço e cidade). "Todas as cidades"
  não entra: a lista é por praça e paginada **[desvio: dado]**.
- Tabela: "Cliente" (nome em `button` → `LeadPanel`; apoio = endereço); "Cidade/UF" `hidden md`; "Contato" `hidden lg` (mascarado); "Status" =
  símbolo + rótulo + `text-xs` "última visita seg 19/10 · Ana", **só leitura**. A Lovable tem um seletor ali; aqui a situação alimenta a
  remuneração e se corrige pelo `LeadPanel`, que deixa rastro (decisão de 21/10) **[desvio: regra]**.
- Embaixo: `data-testid="lista-conta"` "{n} no filtro · {m} sem localização exata (não aparecem no mapa)", "← Anteriores / Próximos →" e
  "ⓘ Como contamos".

### 4.5 Mapa (`/mapa`)

**Lovable** (`mapa.tsx`): h1 "Mapa"; p "Somente praças abertas (em andamento ou concluídas). Cores indicam o status de cada cliente."; sem praça aberta,
o cartão "Nenhuma praça aberta ainda. Abra uma praça mudando o status para “Em andamento” em Praças."; pílulas de praça "Todas ({n})" + uma por
praça; pílulas de status (todas as 7, com número; escondida = `opacity-40`); mapa `relative h-[620px]` `rounded-lg border` com o selo
"carregando clientes…" no canto.

**Nosso dado:** `MapaSituacao` (`useMapaPinos`, `PinosMapa` Leaflet + OpenStreetMap, balão, `without_location`, `truncado`, `conta`) e `MapaDeCalor`.

**Muda:**
- p: "Somente praças abertas (em andamento ou concluídas). Cor e símbolo indicam a situação de cada cliente."
- O `select` de praça vira pílulas "Todas ({n})" + uma por praça aberta (situação calculada ≠ Planejamento).
- Vazio: "Nenhuma praça aberta ainda. Uma praça abre na data de início dela: veja em Praças." (link para `/pracas`).
- Legenda: pílulas `flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm` (`min-h-11` no celular) com símbolo colorido, rótulo e
  número em negrito; escondida = `opacity-40` + `aria-pressed="false"`; grupo `role="group" aria-label="Mostrar ou esconder por situação"`.
- Mapa: o nosso Leaflet com OpenStreetMap (a chave do Google no navegador fica fora, decisão 5), claro (`dark={false}`), com o crédito do OSM,
  `h-[620px]` no desktop e `h-[60vh]` no celular, e o selo "carregando clientes…".
- Balão + cartão embaixo: "Abrir no funil" vira **"Ver cliente"** (abre o `LeadPanel`; o funil não está mais no menu).
- Embaixo, `text-xs`: "{n} sem localização não aparecem no mapa." + o aviso de `truncado` + "ⓘ Como contamos".
- "Situação | Etapa do funil" só com a chave do Comercial. "Mapa de calor" vira link `text-sm text-primary` à direita do h1, para `/mapa/calor`.

### 4.6 Rotas (`/rotas`)

**Lovable** (`rotas.tsx`):
1. h1 "Rotas"; p "Rotas de visita em sequência lógica pela localização dos clientes."
2. Dois botões-aba: "Clientes" e "Shoppings" (com `Store`), em `default` no escolhido e `outline` no outro.
3. Barra `flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4`: "Praça" (`Select min-w-56`, "{nome} — {cidade}/{UF}"). Na aba
   Clientes: **"Perfil dos clientes"**, com pílulas `Button size="sm"` (`default`/`outline`) por segmento ativo e a dica `text-xs` "Nenhum
   selecionado = todos os clientes.", e "Clientes por rota" (`Input type=number w-36`, 1–100). Na aba Shoppings: [Mapear shoppings da cidade] e
   [Mapear clientes dentro dos shoppings]. Nas duas: [Gerar rota de carro/moto] (`default`), [Gerar rota a pé] (`outline`) e o texto
   "{n} clientes com localização" (ou "{n} shoppings grandes com localização").
4. Grade `grid gap-4 lg:grid-cols-[380px_1fr]`. À esquerda, `max-h-[640px] space-y-2 overflow-y-auto`: "Rotas salvas ({n} gerações)" (`Select`
   + lixeira "Excluir esta geração"), vazio "Nenhuma rota ainda. Clique em Gerar rotas." e cartões `cursor-pointer space-y-2 rounded-lg border bg-card
   p-3` (`ring-2 ring-primary` no escolhido). No cartão: bolinha + nome; grade `grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground`
   com "Bairro principal" (ou "Shopping"), "Do centro", "Paradas previstas", "Percurso", "Modo" e "Tempo previsto"; nota `text-[11px]`
   "20 min/cliente + 1h intervalo + deslocamento (…) · máx. 10h". O escolhido mostra "Clientes a visitar ({n}):". Para a equipe, seletor de
   representante e data na linha `grid-cols-[1fr_140px]` (grava ao mudar) e lixeira. À direita, o mapa `h-[520px]`.

**Nosso dado:** `DividirRotas`, `RotaPlanoCard`, `ShoppingsRotas`, `RotasMapa`, `RoteirosEquipe`, `useAreas`, `useActivePraca`.

**Muda:**
- Abas: "Clientes" (o `DividirRotas`) · "Shoppings" (com `features.malls`) · **"Dia de cada representante"** (nosso `RoteirosEquipe`, terceira).
  `role="tablist" aria-label="Rotas"`. **Abre em "Clientes"** (hoje abre em "Dia de cada consultor"; o `browser-check` muda, §6). Com
  `route_plans` desligada, só existe "Dia de cada representante" e a tela fica sem abas, como hoje.
- Barra da Lovable com os nossos dados:
  - "Praça": define a praça ativa (`useSetActivePraca`). Hoje vinha da tela Praça.
  - "Área" (nosso, "Todas as áreas ativas"), logo depois, só se a praça tiver áreas.
  - **"Perfil dos clientes" (novo, etapa 6: API + contrato):** filtra a prévia e quem entra nas rotas geradas. Nenhum marcado = todos.
  - "Paradas por rota" passa a se chamar "Clientes por rota".
  - [Gerar rota de carro/moto] e [Gerar rota a pé], no singular como na Lovable (hoje estão no plural).
  - O texto de contagem é a nossa prévia (`data-testid="previa-divisao"`, `aria-live="polite"`): "312 clientes com localização ÷ 20 por rota
    = 16 rotas". O parágrafo "Fonte: …" e o "Padrão da Lovable: …" vão para um "ⓘ Como contamos" recolhido.
  - Aba Shoppings: "Descobrir shoppings da cidade" vira "Mapear shoppings da cidade", e a busca das lojas internas se chama "Mapear clientes
    dentro dos shoppings". O "ⓘ" do critério (`data-testid="criterio-shopping"`) e a marcação à mão ficam.
- Coluna da esquerda no desenho da Lovable:
  - "Rotas salvas ({n} gerações)" com o nosso `rotuloGeracao`. A lixeira vira o ícone `Archive` com `aria-label="Arquivar esta geração"` (nunca
    apagamos), abrindo um `AlertDialog` com a consequência: "Arquivar a geração de 26/10 14h32? As 13 rotas ainda não publicadas saem da lista.
    As 3 publicadas continuam com os representantes." [Arquivar a geração] [Cancelar].
  - O cartão é o compacto da Lovable, com a nossa `conta_lovable`: "Tempo previsto" e a nota `text-[11px]` = `conta_lovable.texto`.
    Ao tocar, o cartão é escolhido: destaca a rota no mapa (no lugar do nosso "Destacar a rota") e mostra a lista dos clientes e a nossa linha
    `text-xs` "No nosso relógio (vale depois de publicada): …".
  - Publicação: seletor "Representante" (os ativos da praça) + data (`min` = hoje) + **[Publicar]** explícito, embaixo, largura inteira. A
    Lovable grava ao mudar; aqui publicar monta o roteiro do dia e pode trocar o de outra rota (`ROUTE_EXISTS`) **[desvio: prevenção de erro]**.
    No conflito, o alerta de hoje com [Trocar pela Rota 03] e [Escolher outro dia]. Rota publicada: "✓ Publicada para Ana em qua 28/10" no lugar
    dos seletores. A lixeira por rota não existe (arquiva-se a geração inteira).
- Mapa: sempre à vista a partir de `lg` (`h-[520px]`), como na Lovable. Abaixo de `lg`, [Ver no mapa] (nosso, economiza dados no celular) e
  `h-[360px]`.
- Aba "Dia de cada representante": `RoteirosEquipe` como está ("Montar roteiro", "Roteiros de dd/mm", planejado × realizado). As seções de
  configuração continuam lá, recolhidas: "Meta e horários do roteiro", "Modo da visita do representante", "Chegada ao local…", "Roteiro da visita
  (checklist)" (hoje "Roteiro da conversa (checklist da visita)") e "Intervalo e almoço do representante".
- Quem gera, arquiva e publica: admin e gestor (`podeOperar`). Os outros só veem.

### 4.7 Representantes (`/representantes`), cadastro e ficha

**Lovable** (`representantes.tsx`): cabeçalho com h1 "Representantes", p "{n} cadastrados" e [+ Novo representante]. Filtros `flex flex-wrap gap-3`:
busca com ícone "Buscar por nome, e-mail ou telefone" (`min-w-60 flex-1`), status "Todos/Ativos/Inativos" (`w-36`) e "Todas as praças" (`w-44`).
Tabela com "Nome" (+ e-mail), "Telefone" (`hidden md`), "Remuneração" (`hidden lg`), "Status" (`Badge` Ativo/Inativo + "sem acesso") e "Ações"
([Redefinir senha] ou [Gerar acesso], com o texto escondido no celular, mais `Pencil` e `Trash2`). Vazio: "Nenhum representante encontrado."
Para excluir, `AlertDialog` "Excluir {nome}?" / "Esta ação não pode ser desfeita. Considere apenas desativar o representante."

**Nosso dado:** `useConsultores` (com `today`, `signups_confirmed`, `freela_code`), `ConsultorDialog`, a ficha `/consultores/[id]`,
`AtencaoAgora`, `RetornosEquipe`, `AlertasConfig`.

**Muda:**
- Filtros da Lovable sobre a nossa lista (praça considera as várias praças com a flag F2).
- Colunas:
  - "Nome": link para `/representantes/{id}`, com o e-mail embaixo.
  - "Telefone": `hidden md`.
  - "Remuneração": `hidden lg`, com "Regra geral" ou "Regra própria" (F1) e um resumo curto (o arquiteto confirma o campo, §7). Não usamos
    `forma_remuneracao`, que não existe aqui.
  - "Status": `Badge` Ativo/Inativo. Embaixo, em `text-xs`, o dia de hoje (nosso): "em rota agora · 3 visitas · último ponto 14h32",
    "encerrou · 12 visitas" ou "não começou". No lugar do "sem acesso" da Lovable, "Código no Freela pendente" (todo representante nosso já
    nasce com acesso, então "Gerar acesso" nunca aparece).
  - "Ações":
    - [Redefinir senha] (`KeyRound`) faz o "Nova senha provisória" de hoje e mostra as credenciais.
    - `Pencil` abre a edição.
    - `Trash2` (só admin) abre o `AlertDialog` da Lovable com três botões: [Cancelar], [Desativar] (`secondary`) e [Excluir] (`destructive`).
      Se o servidor recusar (`409`, por exemplo quando há voucher), aparece: "{nome} tem visitas, pagamentos ou vouchers registrados e não pode
      ser excluído. Desative em vez disso."
  - Abaixo de `sm`, as ações ficam num menu "⋯" (`aria-label="Ações de {nome}"`): três ícones de 44 px não cabem ao lado do nome.
- Saem os links do topo de hoje (Painel, Mapa por situação, Mapa de calor, Cupons, Pagamentos, Declarados, Roteiros do dia): o menu já tem tudo.
- **Abaixo da tabela**, h2 `text-lg font-semibold` "Em campo hoje" (`id="em-campo"`) com `AtencaoAgora`, `RetornosEquipe` e `AlertasConfig`
  (este recolhido). É o destino da faixa do Dashboard.
- **Cadastro** (diálogo da Lovable `max-h-[90vh] overflow-y-auto sm:max-w-2xl`, título "Novo representante" ou "Editar representante",
  grade `grid gap-4 sm:grid-cols-2`, cada campo com `Label` em cima), na ordem:
  1. Nome completo (`sm:col-span-2`)
  2. E-mail
  3. Telefone / WhatsApp (máscara "(00) 00000-0000", `inputMode="tel"`)
  4. CPF (nosso, obrigatório)
  5. CEP, Rua, Número, Complemento, Bairro, Cidade + UF (`grid-cols-[1fr_80px]`). Ficam à vista com `FIELD_CONSULTANT_PROFILE_ENABLED`, como na
     Lovable; hoje estão recolhidos. Preencher pelo CEP só por uma rota nossa, nunca o navegador chamando o ViaCEP direto (§7).
  6. "Praças em que atua" (`sm:col-span-2`), pílulas `Button size="sm"`. Sem a flag F2, escolha única. Com ela, várias, e com duas ou mais aparece
     embaixo o `Select` "Praça principal" (onde ele começa o dia sem rota).
  7. "Remuneração" (`sm:col-span-2`), **só leitura**, num quadro `rounded-xl bg-secondary p-3 text-sm`: "Segue a regra geral: R$ 10 por cadastro,
     R$ 250 a partir de 20 na semana." ou "Regra própria desde 19/10: …", com o link "Mudar a regra" para a ficha (regra própria) ou para
     Configurações (geral). A Lovable edita forma, diária, comissão e bônus aqui; a nossa regra é versionada, com vigência e razão, e editar no
     cadastro pularia isso **[desvio: regra]**.
  8. "Tipo da chave Pix" + "Chave PIX" (depois de criada, só o admin muda, como hoje)
  9. "Banco / dados bancários" (banco, agência, conta, tipo; só o admin vê inteiro)
  10. Na edição, `Switch` "Ativo". Desligar abre: "Desativar {nome}? O acesso dele para na hora e o código no Freela deixa de vincular
      cadastros." [Desativar] [Cancelar].
  11. Na edição e fora do perfil gestor, "Modo da visita".

  Rodapé: [Cancelar] (`outline`) e [Salvar] na edição; [Salvar e gerar senha] no novo.
- **Credenciais** (o `CredenciaisDialog` da Lovable, para o novo e para "Redefinir senha"): título "Acesso gerado"; "Estas credenciais aparecem só
  agora. Copie ou envie antes de fechar."; quadro `space-y-2 rounded-xl bg-secondary p-4 font-mono text-sm` com "E-mail: …" (Lovable: "Usuário:")
  e "Senha: …" (`data-testid="senha-provisoria"`); [Copiar] (`Copy`) e [Enviar pelo WhatsApp] (`MessageCircle`, para o telefone dele).
  Mensagem: "Olá, {primeiro nome}! Seu acesso ao Praça:\n\nEndereço: {origem}/entrar\nE-mail: {e-mail}\nSenha provisória: {senha}\n\nNo primeiro
  acesso você vai criar uma nova senha." Não fecha com clique fora (regra de hoje) e tem [Fechar].
- **Ficha** `/representantes/[id]` (nossa; a Lovable não tem): "← Representantes", h1 `text-3xl font-semibold`, p "praça · e-mail · telefone ·
  ativo", botões [Ver QR code] [Editar] [Desativar/Reativar] [Redefinir senha] [Tentar código no Freela] e o conteúdo de hoje (linha do tempo,
  mapa, resultado do dia, praças, ganhos), só com os tokens novos. "Início da jornada" e "fim da jornada" continuam (a jornada é do dia).

### 4.8 Vouchers (`/vouchers`)

**Lovable** (`vouchers.tsx`):
1. h1 "Vouchers". p para o admin: "Aprove ou reprove os vouchers solicitados pelos representantes."; para os outros: "Solicite o voucher da 1ª
   contratação grátis para o cliente."
2. Cartão "Solicitar voucher" com Nome do cliente, Estado, Cidade, Ramo, Freelas por semana e [Solicitar voucher].
3. Linha com h2 "Solicitações" (ou "Minhas solicitações") e o seletor "Todos / Pendente ({n}) / Aprovado ({n}) / Reprovado ({n})", que abre
   em Pendente.
4. Tabela com "Data", "Cliente", "Cidade/UF", "Ramo", "Freelas/sem.", "Representante" e "Status" (`Badge` + motivo). Para o admin, [Aprovar] e
   [Reprovar] (`destructive`). Vazio: "Nenhuma solicitação."

**Nosso dado:** `CuponsEquipe` (situações finas, praça, busca, diálogos de aprovar com a conta do Freela, reprovar, vincular, tentar,
desativar e histórico; "Regras do cupom").

**Muda:**
- p do admin igual ao da Lovable. Para os outros: "Os vouchers pedidos pelos representantes. Só administradores aprovam ou reprovam." Os avisos
  do servidor (cupom desligado, Freela sem conexão) ficam numa 2ª linha.
- **O cartão "Solicitar voucher" não entra** **[desvio: regra]**. O pedido é um fato que nasce na visita, com representante, cliente e fotos
  (lote C), e a equipe não cria. No lugar dele, um cartão `rounded-xl bg-secondary p-4 text-sm`: "Os representantes pedem o voucher na visita,
  depois de marcar o resultado. O pedido chega aqui para aprovar."
- h2 "Solicitações" + o seletor da Lovable: "Todos"; "Pendente ({n})" = `pedido`; "Aprovado ({n})" = soma de aguardando empresa, aguardando
  Freela, criado, usado, vencido, desativado e erro; "Reprovado ({n})". Abre em Pendente. Na mesma linha, "Praça" e "Buscar por cliente" (nossos).
  Embaixo, `text-xs`: "Contagem: pedidos por situação agora (a praça e a busca valem para os números). Fonte: pedidos dos representantes."
- A partir de `md`, tabela com as colunas da Lovable. "Status" = `Badge` da Lovable (Pendente `secondary`, Aprovado `default`, Reprovado
  `destructive`) e, embaixo, em `text-xs`, a situação fina: "Aguardando a conta no Freela", "Na fila do Freela", "Cupom criado: ABC123" (mono),
  "Usado", "Vencido", "Desativado", "Erro ao criar o cupom", ou o motivo da reprovação. Ações do admin: nos pendentes, [Aprovar] (`size="sm"`) e
  [Reprovar] (`destructive`, `size="sm"`); nos outros, o menu "⋯" (`aria-label="Mais ações de {cliente}"`) com Ver histórico, Vincular à conta
  do Freela, Tentar agora e Desativar no Freela, conforme a situação. Quem não é admin vê só "Ver histórico".
- Abaixo de `md`: os cartões de hoje (8 colunas não cabem).
- [Aprovar] abre o nosso diálogo (vincular a conta; "Aprovar e criar cupom" ou "Aprovar pedido"). [Reprovar] abre o nosso diálogo com motivo
  obrigatório. A Lovable usa `window.prompt` **[desvio: anti-padrão]**.
- Vazio: "Nenhuma solicitação." + "Os representantes pedem o voucher na visita, depois de escolher como foi."
- "Regras do voucher" (nosso, admin, hoje "Regras do cupom"): recolhido no fim.

### 4.9 Financeiro (`/financeiro`)

**Lovable** (`financeiro.tsx`):
1. h1 "Financeiro"; p "Valores calculados automaticamente: diária por dia com rota atribuída, comissão por cliente marcado como Cadastrado e bônus
   por meta atingida."
2. Barra com "De", "Até", [Esta semana], [Últimos 15 dias] e [Este mês].
3. Três `Card`, "Total a pagar", "Já pago" e "Pendente", com o valor em `text-2xl font-semibold`.
4. Tabela com "Representante", "Remuneração", "Diárias", "Cadastros", "Bônus", "Total", "PIX" (clicar copia; "Sem PIX" em vermelho) e
   "Situação" ("Pago dd/mm" + [Desfazer], ou [Marcar como pago]).
5. Vazio: "Nada a pagar entre {de} e {até}."

**Nosso dado:** `PagamentosEquipe` (semana, `summary`, fila, CSV, ações), o extrato da semana (`confirmed_signups` por pessoa) e
`DeclaracoesEquipe`.

**Muda:**
- p: "Valores da semana fechada, pela regra de remuneração em vigor. O Praça não envia dinheiro: pague o Pix no banco e registre aqui." O texto da
  Lovable descreve a regra dela, não a nossa **[desvio: texto honesto]**.
- Abas no topo (nossas, só com `FIELD_DECLARED_SIGNUPS_ENABLED`): "Pagamentos" | "Cadastros declarados" (`DeclaracoesEquipe`).
- Barra: [‹] "Semana 19/10 a 25/10 · Pix seg 26/10" [›] + [Esta semana] [Semana passada] (`outline`), no lugar de De/Até/15 dias/mês. O pagamento é
  semanal, com Pix na segunda e razão (decisão 5) **[desvio: dado]**. À direita, para o admin: [Gerar fila desta semana], [Baixar CSV] e "Incluir a
  chave Pix completa no CSV" com o aviso de hoje.
- Cartões (`grid gap-4 md:grid-cols-3`, `Card` da Lovable). Cada um tem uma linha de apoio `text-xs` com a conta; embaixo, "Fonte: {summary.source}."
  - "Total a pagar" = devido de todos os pagamentos não cancelados da semana.
  - "Já pago" = `summary.paid_cents`.
  - "Pendente" = total − pago. O apoio diz: "inclui R$ 120,00 sem chave Pix e R$ 80,00 que falhou".
- A partir de `md`, tabela com "Representante", "Remuneração" (regra geral ou própria), "Cadastros" (confirmados, do extrato, à direita),
  "Total" (negrito; `paid_cents ?? due_cents`), "PIX" e "Situação". Os detalhes de PIX e Situação:
  - "PIX" para o admin: a chave mascarada é um botão que busca a chave inteira e copia ("Chave Pix copiada. Cole no app do banco."). Sem chave:
    `Badge destructive` "Sem chave Pix". Para os outros, só a máscara.
  - "Situação": selo da Lovable, "Pago dd/mm" (`default`), "Pendente" (`secondary`), "Falhou" ou "Bloqueado" (`destructive`), "Cancelado"
    (`outline`).
  - Ações do admin: [Marcar como pago] abre o nosso diálogo (valor, comprovante, motivo). O menu "⋯" tem Ver comprovante, O Pix falhou, Tentar de
    novo, Cancelar e **Estornar** (com motivo, fica no razão). O "Desfazer" da Lovable apaga o pagamento e fica fora (decisão 5).
- "Diárias" e "Bônus" não viram colunas. A nossa regra é por cadastro e por faixas, e as partes não cabem em colunas fixas **[desvio: dado]**. Cada
  linha abre com um chevron em "Total" e mostra "Como foi calculado": a nossa `conta`, linha a linha (regra do dono).
- Abaixo de `md`: os cartões de hoje.
- Vazio: "Nada a pagar na semana de 19/10 a 25/10." Para o admin, acrescenta: "Feche a semana na ficha do representante e use “Gerar fila desta
  semana”."

### 4.10 Usuários (`/usuarios`, só admin)

**Lovable** (`usuarios.tsx`): h1 "Usuários" + [+ Novo gestor/admin]; tabela "Nome", "Usuário" (@), "Perfil" (`Badge`), "Ativo" (`Switch`, desligado
na própria conta) e [Redefinir senha]; diálogo "Novo usuário" com Nome completo, Perfil (Gestor/Admin), a nota "Representantes recebem acesso pela
tela de Representantes." e [Criar e gerar senha], que abre as credenciais. Quem não é admin: "Apenas administradores acessam esta página."

**Nosso dado:** a seção "Pessoas" de `/configuracoes` (nome, cor, função, e-mail, telefone, perfil, definir senha, desativar/reativar, adicionar).

**Muda:**
- Sai de Configurações e vira esta tela. Embaixo do h1, "ⓘ O que cada perfil pode fazer" (nosso, com `TEAM_GESTOR_ENABLED`).
- Colunas:
  - "Nome": com a função embaixo em `text-xs`.
  - "E-mail": no lugar de "Usuário".
  - "Perfil": `Select` na linha, `aria-label="Perfil de {nome}"`, com Admin/Gestor/Equipe, desligado na própria conta. A Lovable só mostra o selo;
    a troca na linha poupa um diálogo **[desvio]**. Sem a flag do gestor, só o selo Admin ou Equipe.
  - "Ativo": `Switch`. Desligar pede "Desativar {nome}? Ele não entra mais no Praça." A API recusa desativar a própria conta.
  - "Ações": [Redefinir senha] abre "Redefinir senha de {nome}" com "Nova senha", a lista `RegraSenha` e [Salvar senha]. Aqui o admin
    **escolhe** a senha (hoje é assim); a Lovable gera (§7). `Pencil` abre Nome, Função, Telefone e Cor (nossos).
- [+ Novo gestor/admin] abre o diálogo "Novo usuário": Nome completo, **E-mail** (é o login), Perfil (Gestor, Admin e Equipe com a flag) e "Senha
  provisória" com `RegraSenha`; a nota da Lovable; o botão [Criar usuário]. Depois, as credenciais de §4.7.

### 4.11 Configurações (`/configuracoes`, admin no menu)

**Lovable** (`configuracoes.tsx`): h1 "Configurações"; seção h2 "Segmentos da busca no Google Maps" + p "Tipos do Google Places (ex.: restaurant, bar) e
palavras-chave para busca por texto, separados por vírgula."; tabela com "Nome", "Tipos Google" e "Palavras-chave" (editáveis), "Ativo" (`Switch`),
lixeira e a linha de adicionar ("Novo segmento", "cafe, coffee_shop", "cafeteria", [Adicionar]).

**Nosso dado:** `SegmentosAdmin` (lista branca do mapa aberto, com descrição "Busca no mapa: …"), `RemuneracaoConfig`, `CanaisCampo`,
`SegurancaSenha`, `VariaveisPadrao`, `RoteiroModelo`, `Impressao` (os outros blocos mudaram de tela).

**Muda:**
- No lugar da Lovable, h2 **"Segmentos da busca"** + p "O que cada segmento busca no mapa aberto (OpenStreetMap). A busca usa só tipos de lugar
  conhecidos, nunca texto livre." Tabela com "Nome", "O que busca" (a nossa descrição em português), "Ativo" e a ação do nosso segmento; a linha
  de adicionar tem Nome, a escolha entre os tipos conhecidos e [Adicionar]. Os tipos do Google e as palavras livres ficam fora
  **[desvio: segurança]**. Só com `FIELD_SEGMENTS_ENABLED`, como hoje.
- Abaixo, um cartão por bloco, com h2 `text-lg font-semibold` e conteúdo recolhido: "Remuneração dos representantes", "Canais de campo",
  "Segurança" (regra da senha nova). Com a chave do Comercial, também "Variáveis padrão das mensagens", "Roteiro-modelo (usado nas próximas
  praças)" e "Impressão do plano".
- Saíram: Pessoas (→ `/usuarios`), Áreas de atuação e Dados da praça (→ detalhe da praça). A configuração da visita e da rota fica em Rotas > Dia de
  cada representante.
- Pela URL, quem não é admin vê: com a chave do Comercial, só os blocos do Comercial; sem ela, "Apenas administradores acessam esta página."

### 4.12 Representante: Hoje (visão `hoje`; conteúdo nosso na casca nova)

A etapa 4 do plano põe a casca "por cima do campo atual". Por isso a aba Hoje fica com o **nosso** conteúdo (simples ou completo), arrumado no
formato da Lovable. A Lovable não tem jornada sem rota; nós temos, e é por isso que "Pronto para sair?" e a barra de ação continuam.

```text
┌────────────────────────────────┐
│▓▓ ⌖ Praça                 ☀  ⏻▓│
├────────────────────────────────┤
│ Bom trabalho, Ana!             │
│ Hoje, seg 26/10 · BH+Contagem  │
│ ┌────────────────────────────┐ │
│ │● Rota 03          [18 paradas]│
│ │Percurso: 6,2 km  Modo: A pé │ │
│ │Tempo previsto: 8h40         │ │
│ │Feitas: 4 de 18 · no ritmo   │ │
│ │[   Abrir roteiro da rota   ]│ │
│ └────────────────────────────┘ │
│ [ Próximos dias             › ]│
│ [Iniciar intervalo]            │
│ [Visita fora do ro…][Encerrar o dia]
├────────────────────────────────┤
│ [QR code] [Cheguei: tirar a foto]
├────────────────────────────────┤
│ Hoje  Mapa  Clientes Desemp. Carteira
└────────────────────────────────┘
```

- Título (mesmo elemento da Lovable): h1 `text-3xl font-semibold` "Bom trabalho, {primeiro nome}!". p `text-muted-foreground`:
  "Hoje, seg 26/10 · {praça ativa}" (nosso; a frase da Lovable, "Suas rotas por dia — clique em um dia do calendário.", fala do calendário, que
  aqui está em Próximos dias). Sai o `CampoTopo` (título, nome e "Sair" vão para o cabeçalho e o h1).
- Antes de iniciar: o cartão "Pronto para sair?" com o aviso de privacidade e a escolha de praça (`PracaDoDia`, várias praças), com os textos de hoje.
- Rota de hoje: o `RoteiroCard` dá lugar ao **`CardRota` da Lovable** (`space-y-2 rounded-2xl bg-card p-4 shadow-card`). Em cima, bolinha da cor,
  nome da rota e `Badge variant="secondary"` "{n} paradas". Grade `grid-cols-2 gap-x-3 text-xs text-muted-foreground`: "Percurso", "Modo"
  ("A pé" ou "Carro/moto") e "Tempo previsto". No lugar de "Clique para ver os clientes" entra a nossa linha "Feitas: 4 de 18 · {ritmo.titulo}".
  Embaixo, `Button className="h-12 w-full"` **"Abrir roteiro da rota"** → `irPara({ v: 'roteiro' })`. Os avisos "Mostrando o último roteiro
  guardado às 14h32" e "Rota refeita sem internet…" ficam logo acima do cartão. Logo abaixo, [Próximos dias ›] (`outline h-12`, com
  `route_plans`): é o calendário "Minhas rotas" da Lovable (`ProximosDiasTela`, que fica como está).
- Sem rota hoje: o vazio da Lovable vira o nosso, `rounded-2xl bg-card p-8 text-center shadow-card`: "Nenhuma rota hoje" / "Você pode visitar quem
  estiver no caminho. Quando a equipe montar sua rota, ela aparece aqui." + [Próximos dias] + [Montar meu dia] (quando ele pode) + `MetaCard`.
- Com o dia aberto: `IntervaloFaixa` no intervalo e as linhas de cadastros declarados e fechados fora da meta. No completo, os 2 números viram
  quadros `rounded-xl bg-muted p-3` ("visitas hoje", "cadastrou agora") e a lista "Visitas de hoje" segue. Botão "Intervalo" passa a se chamar
  **"Iniciar intervalo"** (mesmo elemento da Lovable). Continuam: [Visita fora do roteiro] e [Encerrar o dia] no simples, [Encerrar jornada]
  no completo.
- Barra de ação fixa: igual à de hoje (§2.5). "Voltar do intervalo" passa a se chamar **"Encerrar intervalo"**.
- Encerrar o dia: continua o `window.confirm` com a conta ("Você fez 12 de 30 visitas…"), como a Lovable (`confirm`), e o `browser-check` aceita o
  diálogo nativo.
- **Toques até a foto da próxima parada:** 1 ("Cheguei: tirar a foto" na barra). Visita simples inteira: Cheguei (1) → foto (2) → resultado (3)
  → motivo, quando há (4) → Concluir (5). Igual a hoje.

### 4.13 Representante: Roteiro (visão `roteiro`; desenho da Lovable)

A etapa 5 do plano põe o Roteiro na lista das telas que ganham o desenho da Lovable. Layout, ordem dos blocos e posição dos botões vêm de
`roteiro.$rotaId.tsx`. Atrás de cada botão ficam as nossas ações (fila, `irPara`, `enfileirar`). Vale para o simples (`SimplesListaTela`) e para o
completo (`RoteiroTela`), que viram um componente só, e a única diferença é o que "Cheguei no cliente" faz.

```text
┌────────────────────────────────┐
│ ← Minhas rotas                 │
│┌──────────────────────────────┐│ ← sticky, abaixo do cabeçalho
││● Rota 03            [Em rota]││
││▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ ││
││4 de 18 clientes visitados ·  ││
││2 cadastros · tempo médio 14 min
││No ritmo: 1 visita à frente   ││
││[Iniciar intervalo][Encerrar o dia]
│└──────────────────────────────┘│
│┌ Próximo sugerido: Bar do Zé ─┐│ ← bg-secondary
││[   📍 Cheguei no cliente    ] ││
│└──────────────────────────────┘│
│ ⑤ Bar do Zé                    │ ← ring-2 ring-primary
│   R. A, 10 · chega ~10h40      │
│   [Google Maps] [Waze] [Cheguei no cliente]
│ ① Padaria Sol      (opacity-70)│
│   ✓ Cadastrado                 │
│ [ Visita fora do roteiro     ] │
├────────────────────────────────┤
│ Hoje  Mapa  Clientes Desemp. Carteira
└────────────────────────────────┘
```

- "← Minhas rotas" (`inline-flex items-center gap-1 text-sm text-muted-foreground`, `button` → `irPara({ v: 'hoje' })`).
- **Cartão fixo** `sticky top-[3.25rem] z-10 space-y-2 rounded-2xl bg-card p-4 shadow-card` (desce se a `FaixaFila` estiver à vista):
  - Topo `flex items-center justify-between`: h1 `flex items-center gap-2 text-lg font-semibold` com a bolinha e o nome da rota (sem rota,
    "Dia sem rota"); `Badge` "Não iniciada" (sem jornada), "Em rota" (`default`, jornada aberta), "Em intervalo" ou "Encerrada" (jornada
    encerrada hoje).
  - `Progress` (shadcn) = paradas feitas ÷ paradas (`aria-label="Clientes visitados"`). Sem rota: visitas ÷ meta (`MetaCard`).
  - `text-sm text-muted-foreground`: "{v} de {n} clientes visitados · {c} cadastros · tempo médio {m} min" (Lovable; `m` = média de
    `duracaoMin` das concluídas). Embaixo, `text-xs`, o nosso ritmo ("No ritmo: …", com a conta em "ⓘ").
  - Botões `flex flex-wrap gap-2`, todos `h-12`:
    - Sem jornada: [Iniciar o dia] (`w-full text-base`, `Play`); no completo, [Iniciar jornada]. A Lovable diz "Iniciar rota"; mantemos o
      nosso porque a jornada é do dia, §7.
    - Em rota, sem visita aberta: [Iniciar intervalo] e [Encerrar o dia] (`outline flex-1`, `Coffee`/`Square`); no completo, [Encerrar jornada].
    - No intervalo: [Encerrar intervalo] (`w-full`).
    - Com visita aberta: nenhum (Lovable).
- Encerrada: **"Resultado do seu dia"** = o nosso `ResumoDiaConteudo` no cartão da Lovable `space-y-4 rounded-2xl border-2 border-primary bg-card p-5
  shadow-card`. Nota `text-3xl font-bold text-primary` + "nota de 0 a 10". Seis quadros `grid grid-cols-2 gap-2` (`rounded-xl bg-muted p-3`):
  "Clientes previstos", "Clientes visitados" ("12 (60%)"), "Cadastros" ("4 (33%)"), "Tempo da rota", "Tempo de intervalo", "Tempo médio por
  visita". "Avaliação" em `rounded-xl bg-secondary p-3 text-sm` com tópicos. Nota de rodapé com os NOSSOS pesos: "A nota considera {70}% o
  cumprimento da rota e {30}% a conversão em cadastros." Só com `day_summary`.
- **Onde cai o "Encerrar o dia":** de qualquer lugar (Hoje ou Roteiro), cai em `irPara({ v: 'roteiro' })`, com o cartão "Resultado do seu dia"
  no lugar dos botões, como na Lovable. Se o encerrar ainda estiver na fila, a conta é "até agora". Hoje cai em `?v=resumo`; essa visão fica só
  para os dias anteriores (`?v=resumo&dia=`), aberta pela Carteira.
- Com visita aberta: o cabeçalho da `VisitaAberta` da Lovable (`rounded-2xl border-2 border-primary bg-card p-4 shadow-card`): "Visita em andamento"
  `text-xs`, nome `font-semibold`, pílula do cronômetro `flex items-center gap-1 rounded-lg bg-primary px-3 py-1 font-mono text-lg
  text-primary-foreground` com `Timer` (o nosso `Cronometro`, `role="timer"`, `aria-live="off"`) e [Continuar visita] (`h-12 w-full`) →
  `irPara({ v: 'visita', ref })`.
- "Próximo sugerido" (Lovable `rounded-xl bg-secondary p-3 text-sm`): "Próximo sugerido: **{nome}**". Dentro dele entra o nosso [Cheguei no cliente]
  (`h-12 w-full`), para chegar à câmera com 1 toque sem rolar a lista **[desvio: zona do polegar]**. Só em rota e sem visita aberta.
- Sem jornada, centralizado `text-sm text-muted-foreground`: "Toque em “Iniciar o dia” para liberar as visitas." (Lovable: "Faça o check-in em "Iniciar
  rota" para liberar as visitas.").
- Lista `ol space-y-2`, cada item `rounded-2xl bg-card p-3 shadow-card`, com `ring-2 ring-primary` no sugerido e `opacity-70` nos visitados:
  - Círculo `mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground`.
  - Nome `font-medium` em `button`: abre a `ParadaTela` (nossa: ligar, pular, deixar para a tarde).
  - Endereço `text-xs text-muted-foreground` + "chega por volta das 10h40", "deixada para a tarde" ou "pulada" (nosso).
  - Visitado: `Badge` com a cor do resultado + `CheckCircle2` + rótulo (+ símbolo).
  - Botões `mt-2 flex flex-wrap gap-2`: [Google Maps] e [Waze] (`outline`, `Navigation`, `min-h-11`; o nosso `NavegarLinks`). Em rota, sem visita
    aberta e ainda não visitado, também [Cheguei no cliente] (`MapPin`).
- **"Cheguei no cliente"** usa o texto da Lovable. No simples, é o nosso `ChegueiBotao`: abre a câmera direto e o `aria-label` do campo de foto
  continua "Cheguei em {nome}: tirar a foto da fachada". No completo, leva a `irPara({ v: 'nova', parada })`, a nossa tela de check-in com foto.
- **O diálogo "Chegada" da Lovable não entra.** A foto já é a chegada, e a distância maior que o raio já é tratada na tela do resultado. Com isso
  são 2 toques a menos ("Tirar foto" e "Confirmar") **[desvio: campo]**. A frase da Lovable vai para essa tela: "Você está a 320 m do
  endereço — fora do raio de 200 m.", com os chips de hoje ("O endereço está errado", "Estou na porta mesmo").
- Embaixo da lista, [Visita fora do roteiro] (`outline h-12 w-full`) → `irPara({ v: 'nova' })`. Dia sem rota: no lugar da lista, [Visita no
  caminho] (`h-12 w-full`) e [Montar meu dia] quando ele pode.
- A barra de ação fixa some nesta visão (os botões estão no cartão). As 5 abas ficam.

#### 4.13.1 Tela da visita (`visita`: `ResultadoTela` no simples, `VisitaTela` no completo)

Conteúdo e textos são os nossos: "Como foi a visita?", os resultados como `radio`, "Por quê?", "Quando?", "Dar acesso ao Freela" (QR), "Quem
atendeu" e "Concluir: Sem interesse, Preço". Os 6 "status final" da Lovable não batem 1 a 1 com os nossos 5 resultados + motivos (§7). O visual
é o da Lovable:
- No topo, o cabeçalho da `VisitaAberta` (de §4.13).
- "Roteiro da visita · 1 de 7" (Lovable "Roteiro da visita"; hoje é "Roteiro da conversa"). Cada etapa em `rounded-lg border p-2`, com `Checkbox`
  + "1. {etapa}" riscado quando feito e o `Input` `min-h-11 text-xs` "Observação (opcional)" ou "Objeção principal" (o nosso `ChecklistVisita`).
- Resultados em `grid grid-cols-2 gap-2`, cada um um `Button` `outline`/`default` `h-auto min-h-14 whitespace-normal py-2`, com ✓ no escolhido.
  Motivos em `flex flex-wrap gap-2` com `min-h-11`.
- Contato em `grid gap-2 sm:grid-cols-2` ("Quem atendeu", "Telefone", "Cargo", "E-mail" com a flag). O asterisco segue a nossa regra
  `contato_obrigatorio_em`; a da Lovable obriga em todos menos "fechado".
- "Pedir cupom da 1ª contratação" passa a ser **"Pedir voucher da 1ª contratação"**. Na tela do pedido, "Enviar pedido do cupom" passa a ser
  "Enviar pedido do voucher".
- Completo: "Fazer check-in" vira **"Confirmar chegada e iniciar visita"** e "Fazer checkout" vira **"Finalizar visita"** (mesmos elementos da
  Lovable; "check-in" e "checkout" eram jargão). No simples, "Concluir: …" fica, porque diz o que vai ser gravado.
- O aviso "Visita finalizada", com [Desfazer] por alguns segundos, continua.

### 4.14 Representante: Mapa, Clientes, Desempenho, Carteira

- **Mapa** (`?v=mapa`): h1 "Mapa"; p "Seus clientes: os da sua rota e os que você visitou. Cor e símbolo indicam a situação."; legenda com pílulas da
  Lovable (§4.5) e o `MapaCampo` em `h-[60vh] rounded-lg border`. No balão, "Abrir a parada" (nosso). Sem sinal: "O mapa precisa de internet. Suas
  visitas continuam funcionando: a lista está em Hoje › Abrir roteiro da rota." + [Tentar de novo]. Sem `features.map_pins`: "O mapa ainda não
  está ligado neste servidor." "Nenhum estabelecimento seu com localização ainda" passa a ser "Nenhum cliente seu com localização ainda".
- **Clientes** (`?v=clientes`): h1 "Clientes"; p "Quem você precisa procurar de novo e os vouchers que você pediu."; seletor
  `flex gap-1 rounded-lg bg-muted p-1` (o mesmo do período do Dashboard) com "Retornos" (abre aqui: é o que tem ação hoje), "Vouchers" (com
  `features.vouchers`) e "Visitados". Retornos = `RetornosCampo` (Ligar e WhatsApp continuam). Vouchers = `CuponsCampo`. Visitados = a lista da
  Lovable (pílulas de escolha única + lista) e só aparece quando existir uma rota de lista do campo (§7). Precisa de sinal, com o aviso de hoje.
- **Desempenho** (`?v=desempenho`): o `EmBreve` da Lovable. h1 "Desempenho"; cartão `flex flex-col items-center gap-3 rounded-2xl border border-dashed
  bg-card p-12 text-center shadow-card` com `Construction h-10 w-10 text-primary`, "Em construção" e "Seus indicadores de visitas, cadastros e
  conversão.". Reversível: trocar o conteúdo pelos "Resultados dos dias" (`ResumoDiaAtalhos`, que já temos) se o dono quiser (§7).
- **Carteira** (`?v=carteira`): h1 **"Carteira"**. A Lovable abre a mesma tela da equipe, com o título "Financeiro"; aqui o título é o nome da aba.
  - Três cartões no desenho dos do Financeiro (`grid gap-3 sm:grid-cols-3`): "Hoje" (`today.total_cents`), "Esta semana" (`week.total_cents`) e
    "Próximo Pix" (data + valor). Os rótulos da Lovable ("Total a pagar", "Já pago", "Pendente") são de quem paga, não de quem recebe
    **[desvio: texto]**.
  - Embaixo, os nossos `GanhosCard` (com a conta), `PixCard` (situação de cada Pix), `CadastrosConfirmadosCard` e `ResumoDiaAtalhos`
    ("Resultado do dia"), com o cartão novo.

### 4.15 Endereços da equipe e redirecionamentos

| Novo | Antigo (redireciona, sem 404) |
|---|---|
| `/inicio` | `/consultores/painel` |
| `/pracas`, `/pracas/[id]` | `/praca` → `/pracas` |
| `/clientes` | `/consultores/clientes` |
| `/mapa`, `/mapa/calor` | `/consultores/clientes?modo=mapa`, `/consultores/mapa` → `/mapa`; `/consultores/calor` → `/mapa/calor` |
| `/rotas` (`?aba=clientes\|shoppings\|dia`) | `/consultores/roteiros` → `/rotas?aba=dia` |
| `/representantes`, `/representantes/[id]` | `/consultores`, `/consultores/[id]` |
| `/vouchers` | `/consultores/cupons` |
| `/financeiro` (`?aba=declarados`) | `/consultores/pagamentos`; `/consultores/declarados` → `/financeiro?aba=declarados` |
| `/usuarios` | — |
| `/trocar-senha` | `/campo/senha` |
| `/entrar` | `/campo/entrar`, `/` |

O grupo Comercial (`/funil`, `/entrada`, `/prospeccao`, `/mensagens`, `/campanhas`, `/calendario`, `/indicadores`, `/hoje`, `/freela`) continua
nos mesmos endereços. O representante continua todo dentro de `/campo` (`?v=`), porque a troca de visão funciona sem sinal.

## 5. Onde ficam as nossas funções que a Lovable não tem

| Função nossa | Onde fica | Por quê |
|---|---|---|
| Fila sem sinal (`FaixaFila`), aviso de GPS | faixa fixa abaixo do cabeçalho do representante, em todas as visões | campo: sem isso o envio some sem aviso |
| Jornada sem rota, "Pronto para sair?", privacidade | Hoje | a Lovable só tem jornada dentro da rota |
| Barra de ação (QR + Cheguei/Iniciar/Continuar) | fixa acima das 5 abas, só em Hoje | 1 toque na zona do polegar |
| QR code de cadastro | barra de ação; "Dar acesso ao Freela" na visita; [Ver QR code] na ficha | é o cadastro na hora |
| Modo Sol | interruptor ☀ no cabeçalho, em Hoje e Roteiro | contraste sob sol |
| Checklist da visita + cronômetro | cabeçalho e "Roteiro da visita" da tela da visita (os lugares da Lovable) | já são da Lovable (L3) |
| Intervalo | "Iniciar/Encerrar intervalo" no cartão do Roteiro e em Hoje | já é da Lovable (L4) |
| Ritmo e chegada prevista | uma linha no cartão do Roteiro; "chega por volta das…" em cada parada | relógio do roteiro |
| Pular / deixar para a tarde / ligar | tocar no nome da parada (`ParadaTela`) | não polui a lista |
| Visita fora do roteiro / no caminho / montar meu dia | Hoje e fim da lista do Roteiro | a Lovable não tem |
| Distância fora do raio | frase da Lovable + chips na tela do resultado | sem o diálogo "Chegada" |
| Pedir voucher | botão na tela do resultado; segmento Vouchers em Clientes | lote C |
| Retornos | Clientes › Retornos | ação do dia |
| Ganhos detalhados, Pix, cadastros confirmados, resultado do dia | Carteira | dinheiro num lugar só |
| Próximos dias (calendário) | botão em Hoje (`ProximosDiasTela` = "Minhas rotas" da Lovable) | a aba Hoje é a jornada |
| Várias praças | "Pronto para sair?" (escolha) e o subtítulo de Hoje | lote F2 |
| "De onde vem" e "Como contamos" | `<details>` `text-xs` dentro de cada cartão ou embaixo da lista | regra do dono (08/10) |
| Atenção agora, retornos da equipe, alertas | faixa no Dashboard + "Em campo hoje" abaixo da tabela de Representantes | monitoramento |
| Ficha do representante (linha do tempo, mapa, ganhos, regra própria, praças) | `/representantes/[id]`, pelo nome na tabela | a Lovable não tem |
| Prévia antes de gerar, duas contas, arquivar, publicar com conflito | Rotas (§4.6) | evita erro caro |
| Montar roteiro do dia, planejado × realizado, configuração da visita | Rotas › Dia de cada representante | |
| Mapa de calor | link em Mapa → `/mapa/calor` | |
| Situação por etapa do funil, sino de notificações | só com a chave do Comercial | |
| Áreas de atuação, editar datas, plano de 11 etapas | detalhe da praça (recolhidos) | gestor edita áreas sem ver Configurações |
| Busca no mapa aberto, importar planilha | botões do detalhe da praça | os botões da Lovable |
| Painel do cliente (`LeadPanel`) | "Ver cliente" / nome nas listas e no mapa | correção com rastro |
| Fila de Pix, comprovante, estorno, CSV | Financeiro | razão (decisão 5) |
| Cadastros declarados | Financeiro › Cadastros declarados | lote S3 |
| Regras do voucher, vínculo com a conta do Freela, histórico | Vouchers (diálogos e "⋯") | cupom real |
| Regra de senha, remuneração geral, canais | Configurações (recolhidos) | |

## 6. Ordem de implementação e `browser-check`

### 6.1 Ordem (maior mudança visual primeiro; cada passo um commit, com o `browser-check` do passo atualizado no mesmo commit)

1. **Tokens e fontes** (§1): `globals.css`, `layout.tsx` (Manrope/Sora), `card-surface`, os 4 ajustes, `min-h-11`, sair `ThemeSync` e botão de
   tema, `dark={false}` nos mapas. Sozinho, isso já muda todas as telas.
2. **Casca da equipe** (§2.1–§2.4): `AppShell`, `montarMenu` com os nomes da Lovable e a chave do Comercial, item ativo por prefixo, 404/erro.
3. **Entrada única e troca de senha** (§3), com os redirecionamentos de `/campo/entrar` e `/campo/senha`.
4. **Casca do representante** (§2.5) por cima das visões de hoje (sem mexer no conteúdo ainda) + visões novas `mapa`, `clientes`, `desempenho`,
   `carteira` com os componentes que já existem.
5. Telas, na ordem do menu: Dashboard → Praças e detalhe → Clientes → Mapa → Rotas → Representantes (+ cadastro, credenciais, ficha) →
   Vouchers → Financeiro → Usuários → Configurações. Depois, Hoje (§4.12) → Roteiro e visita (§4.13) → Desempenho/Carteira.
6. **Filtro "Perfil dos clientes"** (API + contrato + barra de Rotas).
7. **Endereços novos e redirecionamentos** (§4.15). Até aqui as telas novas podem morar nos endereços antigos.
8. Renomear os rótulos de situação na API (§4.4) junto com o contrato §34.3.

### 6.2 O que o `browser-check` (`web/scripts/browser-check.mjs`) troca

Os números de linha são os de hoje.

| Linha | Hoje procura | Passa a procurar |
|---|---|---|
| 296 | "checklist de abertura de praças" em `/entrar` | "abra praças com método" (1280 px, painel azul) |
| 303, 307, 1176 | `**/consultores/painel` ou `**/hoje` | `**/inicio` (sempre) |
| 308–369 | `/hoje` (Ações) | igual, mas é do Comercial: a página responde pela URL; nada a trocar enquanto o código ficar |
| 374–380 | `/praca` com o plano | `/pracas/{PRACA}`, abrir "Plano de abertura (11 etapas)" e os mesmos textos |
| 686 | "entrada do consultor de campo" em `/campo/entrar` | redireciona para `/entrar`: "use o e-mail e a senha fornecidos" (390 px) |
| 690, 691, 1253 | `**/campo/senha` | `**/trocar-senha` |
| 707 | nome completo do representante | "bom trabalho, {primeiro nome}" |
| 713–715 | representante em `/hoje` volta para `/entrar` | termina em `/campo` (o `/entrar` reconhece a sessão do campo) |
| 760, 843 | aba "Novo estabelecimento" | "Novo cliente" |
| 785, 852 | "Fazer check-in" | "Confirmar chegada e iniciar visita" |
| 792, 813, 823, 870 | "Fazer checkout" | "Finalizar visita" |
| 846 | "É outro estabelecimento" | "É outro cliente" |
| 899, 976, 1027, 1053, 1157, 1180 | `/consultores` | `/representantes` |
| 900 | link "Consultores" | link "Representantes" |
| 903, 1013, 1512 | `**/consultores/{id}` | `**/representantes/{id}` |
| 1028, 1029 | links "Painel" e "Mapa por situação" no topo | links "Dashboard" e "Mapa" no menu, cada um só com a sua flag |
| 1030, 1073 | `/consultores/painel` | `/inicio` (textos iguais: "Painel ao vivo da operação", "Visitas concluídas", 8 × "ⓘ De onde vem", "não ligado neste servidor") |
| 1039–1042, 1095–1096, 1183–1185 | `/consultores/roteiros` + "Chegada ao local" | `/rotas`, clicar a aba "Dia de cada representante" antes; "Roteiro da visita (checklist)"; "Intervalo e almoço do representante" |
| 1043–1045 | `/consultores/mapa` + "Situação (toque para esconder ou mostrar)" | `/mapa` + `role=group` "Mostrar ou esconder por situação" ("a visitar" e "estabelecimento fechado" seguem) |
| 1055 | link "Cupons" no `main` | link "Vouchers" no menu, só com a flag |
| 1056–1068 | `/consultores/cupons`, "Cupons da 1ª contratação", aba `/^Pedidos \d+$/`, "os consultores pedem o cupom na visita", "Regras do cupom" | `/vouchers`, h1 "Vouchers", opção "Pendente ({n})", "os representantes pedem o voucher na visita", "Regras do voucher" |
| 1079–1082 | "Segmentos da busca de estabelecimentos" | "Segmentos da busca" |
| 1097–1102, 1120–1122 | abas "Dividir em rotas" e "Dia de cada consultor" | "Clientes" (abre nela) e "Dia de cada representante" |
| 1106 | "Gerar rotas de carro/moto" / "Gerar rotas a pé" | "Gerar rota de carro/moto" / "Gerar rota a pé" |
| 1116 | "Descobrir shoppings da cidade" / "…área de atuação em Configurações" | "Mapear shoppings da cidade" / "…área de atuação no detalhe da praça" |
| 1128–1137 | `/funil`, link "Funil", grupos "Operação de campo"/"Comercial"/"Administração", "Praça", "Início" | qualquer tela; menu plano com "Praças" e "Dashboard"; grupo "Comercial" só com a chave |
| 1139–1149 | `/consultores/clientes` com abas "Lista"/"Mapa", pílula "A visitar" desmarcada, "Etapa do funil" | `/clientes` com a pílula "Todos" marcada (sem "A visitar"); o mapa em `/mapa` (esperar `.leaflet-container`) |
| 1152, 1155, 1156 | "Pessoas", "ⓘ O que cada perfil pode fazer", "Perfil de …" em `/configuracoes` | os mesmos em `/usuarios` (h1 "Usuários"); "Segurança" segue em `/configuracoes` |
| 1158–1160, 1181 | "Novo consultor", "Endereço (opcional)" | "Novo representante"; com o cadastro ligado, o campo "CEP" à vista |
| 1178–1179 | link "Buscar estabelecimentos" no menu do gestor | botão "Buscar clientes no mapa" em `/pracas/{PRACA}` |
| 1249, 1521, 736 | `/campo/entrar` | `/entrar` |
| 1274 | "Sem roteiro para hoje" | "Nenhuma rota hoje" |
| 1286–1288 | `?v=roteiro` + "Paradas que faltam" + aba "Mapa" das paradas | `?v=roteiro` + "← Minhas rotas"; o mapa é a aba "Mapa" de baixo (`?v=mapa`) |
| 1291 | "Nenhum estabelecimento seu com localização ainda" | "Nenhum cliente seu com localização ainda" |
| 1294 | "Voltar" | aba "Hoje" |
| 1339, 1342, 1345 | "Roteiro da conversa" | "Roteiro da visita" |
| 1351, 1354, 1358 | "Pedir cupom…", "Enviar pedido do cupom" | "Pedir voucher…", "Enviar pedido do voucher" |
| 1387 em diante | "Intervalo" / "Voltar do intervalo" | "Iniciar intervalo" / "Encerrar intervalo" |

**Não mudam** (de propósito): "Entrar", `#email`/`#senha`/`#atual`/`#nova`/`#confirma`, "Salvar senha", "Uma letra maiúscula", "Iniciar jornada"/
"Encerrar jornada" (completo), "Iniciar o dia"/"Encerrar o dia", "Pronto para sair?", "a localização só é registrada com a jornada aberta", "Nova
visita", "Visita fora do roteiro"/"Visita no caminho", "Não está na lista? Cadastrar o lugar", "É outro lugar", o `aria-label` "Cheguei em {nome}: tirar a
foto da fachada", "Como foi a visita?", "falta escolher como foi a visita", os `radio` de resultado e motivo, "Concluir: Sem interesse, Preço",
"Desfazer", "QR code", "Voltar" (na tela do QR), "1 envio pendente", "enviando quando voltar o sinal", "Próximos dias", "Ir para hoje", o calendário com
células ≥ 48 px, `data-testid` `previa-divisao`/`criterio-shopping`/`lista-conta`/`senha-provisoria`, as visões `?v=` e `localStorage`
(`authUser`, `campoSession`).

Novas checagens sugeridas:
1. Contraste dos 4 tokens de §1.2 e de `--muted-foreground` no fundo, medidos pelo `getComputedStyle` com a mesma fórmula.
2. Nenhuma rolagem horizontal em 360 px em `/inicio`, `/clientes`, `/vouchers`, `/financeiro` e `/campo`
   (`document.documentElement.scrollWidth <= 360`). A faixa de pílulas fica de fora.
3. As 5 abas do representante com altura ≥ 44 px.
4. O login de representante pela tela única não grava `authUser`.

## 7. Decisões em aberto

### Para o dono (texto ou regra; nada disso trava a implementação, o padrão está entre parênteses)

1. "Iniciar o dia" / "Encerrar o dia" ou "Iniciar rota" / "Encerrar rota", como na Lovable? (Padrão: "o dia". A jornada é do dia, com visita fora
   da rota e várias praças; "rota" daria dois nomes para a mesma coisa.)
2. Na visita, usar os 6 "Status final" da Lovable (Cadastrado, Não cadastrado, Não contrata freela, Estabelecimento fechado, Retornar outro dia,
   Ligar depois) no lugar dos nossos 5 resultados + motivos? Daria para fazer só no web, sem mudar o que vai para a API: "Não contrata freela" =
   sem interesse + motivo "Não contrata freelancers"; "Ligar depois" e "Retornar outro dia" = retorno. (Padrão: os nossos, "Como foi a visita?".
   Hoje o mapa diz "Não cadastrado" e o chip diz "Sem interesse".)
3. Situação da praça calculada pelas datas ou escolhida à mão, como na Lovable? (Padrão: pelas datas.)
4. Desempenho: "Em construção", como na Lovable, ou já com os "Resultados dos dias" que temos? (Padrão: "Em construção".)
5. A equipe deve poder pedir voucher sem visita, como na Lovable? (Padrão: não. Hoje o pedido é um fato da visita, com fotos.)

### Para o software-architect

1. Onde mora a **chave do Comercial**: variável `NEXT_PUBLIC_*` do web, ou `features.comercial` no `GET settings/config`, que já é a forma de
   descobrir flags sem sondar rota?
2. `features.payouts` no `GET settings/config`, para o item Financeiro aparecer sem sondar `/v1/consultores/payouts` (hoje a tela sonda e aceita
   o 404).
3. `lead_count` por praça em `GET /v1/pracas` (cartão da Lista de Praças).
4. `segment` e `origin` nos itens de `GET /v1/consultores/map/list` (§34.6), para as colunas Cliente e Origem do detalhe da praça.
5. Lista do campo, `GET /v1/campo/map/list` (o §34.6 com o recorte do §34.4), para o segmento "Visitados" da aba Clientes.
6. Rótulos de §4.4 em `domain/pin-rules.ts` + contrato §34.3 (os códigos não mudam).
7. Filtro "Perfil dos clientes" (segmentos, vários): parâmetro na prévia e na criação do plano (§39), com a mesma regra da Lovable: nenhum
   marcado = todos, e shoppings e lojas de shopping fora da aba Clientes.
8. Redirecionamentos de §4.15: `next.config` `redirects()` (não permanentes) ou páginas de redirecionamento.
9. Login com duas chamadas (equipe, e o campo só no 401): cada tentativa gasta 2 no limite por IP. Ver se o limite do `/auth/login` aguenta, ou se
   vale uma rota que responda os dois.
10. A troca da própria senha da equipe pede a senha atual? Se não pede, pedir (segurança).
11. Senha da equipe: gerar no servidor (com troca obrigatória no 1º acesso, como `deve_trocar_senha` da Lovable) em "Novo usuário" e "Redefinir
    senha"? Hoje o admin digita a senha e não há troca obrigatória para a equipe.
12. Resumo da regra de remuneração por representante na lista (`GET /v1/consultores`), para a coluna Remuneração (geral ou própria, com o texto
    curto).
13. CEP do cadastro do representante: preencher por uma rota nossa (o navegador não chama o ViaCEP direto), ou deixar os campos sem preencher
    sozinhos.
14. Mensagens de erro da API que dizem "consultor": trocar por "representante" (o web só mostra o que vem em `apiErrorMessage()`).

## 8. Acessibilidade (WCAG 2.2 AA; ✓ = coberto por este desenho, a conferir na implementação)

- ✓ Contraste de texto ≥ 4,5:1 e de borda de campo/ícone ≥ 3:1 (§1.1, §1.2; contas à mão, o `browser-check` mede).
- ✓ Cor nunca sozinha: situação com símbolo + rótulo; escolhido com ✓; selos com texto (§1.6, §1.3 item 9).
- ✓ Alvos ≥ 44 px abaixo de `md` (§1.5) e 48–56 px no campo; pílulas do menu `min-h-11`.
- ✓ Semântica: abas do representante são `<button>` em `<nav aria-label="Seções">` com `aria-current`; menu da equipe com `aria-current`;
  seletores de período e de situação com `aria-pressed`; `role="tablist"` em Rotas; cronômetro `role="timer"` `aria-live="off"`.
- ✓ Avisos e contagens com `aria-live="polite"` (prévia de Rotas, legenda, faixa da fila); erro com `role="alert"`.
- ✓ Ícone sozinho sempre com `aria-label` (Sair, Arquivar, "⋯", Sol).
- ✓ Diálogos devolvem o foco; ações de alto risco com a consequência escrita e o verbo no botão (arquivar geração, excluir/desativar
  representante, estornar, desativar usuário).
- ✓ Zoom de 200% sem rolagem lateral: as tabelas escondem colunas ou viram cartões; só a faixa de pílulas rola.
- ✓ `prefers-reduced-motion`: sem `hover:-translate-y-0.5` e sem `animate-pulse` quando o usuário pede menos movimento.
- ✗ A testar: leitor de tela no fluxo "Abrir roteiro da rota → Cheguei no cliente → resultado → Concluir" (TalkBack + VoiceOver), num celular
  Android intermediário, sob sol.


