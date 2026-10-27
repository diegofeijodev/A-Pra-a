/**
 * Endereços das telas da equipe num lugar só (redesenho da Lovable, arquitetura §3.4 e §5 E7): os da Lovable. Os de antes
 * (`/consultores/*`, `/praca`) redirecionam (307) pela tabela de `redirecionamentos.ts`, lida no `next.config.ts`. Quem aponta
 * para uma tela usa `ROTA.x`, nunca o texto do endereço.
 *
 * Este arquivo NÃO importa nada: o `next.config.ts` o carrega (por `redirecionamentos.ts`), e lá não há o atalho `@/`.
 */
export const ROTA = {
  entrar: '/entrar',
  inicio: '/inicio',
  pracas: '/pracas',
  clientes: '/clientes',
  // Página própria desde a E5.3; o Mapa de calor é um link dentro dele.
  mapa: '/mapa',
  mapaCalor: '/mapa/calor',
  rotas: '/rotas',
  representantes: '/representantes',
  vouchers: '/vouchers',
  financeiro: '/financeiro',
  // Também é a 2ª aba do Financeiro (E5.7); a página própria fica para os links da "Atenção agora".
  declarados: '/financeiro/declarados',
  // Fora do menu: "Em construção" (a Lovable também é só "Em breve").
  desempenho: '/desempenho',
  configuracoes: '/configuracoes',
  // Usuários saiu de Configurações > Pessoas (E5.8).
  usuarios: '/usuarios',
  // Fora do menu: a troca da própria senha (E3), aberta pelo rodapé da casca.
  trocarSenha: '/trocar-senha',
} as const;

/** Detalhe de uma praça (E5.2): clientes, busca no mapa, áreas e o plano de abertura. */
export const rotaDaPraca = (id: string): string => `${ROTA.pracas}/${id}`;

/** Ficha de um representante (linha do tempo, praças em que atua, regra própria). */
export const rotaDoRepresentante = (id: string): string => `${ROTA.representantes}/${id}`;

/**
 * Endereços do consultor (arquitetura §3.4): ficam dentro de `/campo` porque o atalho instalado tem `scope: '/campo'` — a entrada e a
 * troca obrigatória de senha são os únicos momentos em que ele sairia do escopo (no iOS, isso abre um navegador dentro do app).
 */
export const ROTA_CAMPO = {
  inicio: '/campo',
  entrar: '/campo/entrar',
  senha: '/campo/senha',
} as const;

/** As 5 abas do representante (Lovable `repNav`). */
export type AbaRepresentante = 'hoje' | 'mapa' | 'clientes' | 'desempenho' | 'carteira';

/**
 * Para onde vai um link da Lovable que é do representante. O consultor mora em `/campo` (as telas são visões `?v=`, por causa
 * da fila offline e do atalho instalado, arquitetura §3.4): cada aba é uma visão da rota única. Os valores são os de
 * `urlDaTela` (`modules/campo/application/use-tela.ts`; o teste confere que batem).
 */
const DESTINO_REPRESENTANTE: Record<AbaRepresentante, string> = {
  hoje: '/campo',
  mapa: '/campo?v=mapa',
  clientes: '/campo?v=clientes',
  desempenho: '/campo?v=desempenho',
  carteira: '/campo?v=carteira',
};
export const destinoDoRepresentante = (aba: AbaRepresentante = 'hoje'): string => DESTINO_REPRESENTANTE[aba];

/** Só o caminho de um endereço (`/clientes?x=1` → `/clientes`), sem a barra do fim. */
export const caminho = (endereco: string): string => endereco.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';

/**
 * Endereços que servem às duas pessoas (o mesmo link na equipe e no representante, como na Lovable, arquitetura §3.3). Os de antes
 * da E7 (`/consultores/painel`…) não precisam estar aqui: o 307 do `next.config.ts` chega antes do `(app)/layout.tsx`.
 */
const ABA_DO_ENDERECO: Record<string, AbaRepresentante> = {
  [ROTA.inicio]: 'hoje',
  [ROTA.mapa]: 'mapa',
  [ROTA.clientes]: 'clientes',
  [ROTA.financeiro]: 'carteira',
  [ROTA.desempenho]: 'desempenho',
};

/**
 * O representante (só `campoSession`) que abre um endereço da equipe cai na casca DELE, na visão equivalente — nunca na entrada
 * (o `(app)/layout.tsx` usa isto). Qualquer outro endereço vai para o "Hoje".
 */
export const destinoDoRepresentantePorEndereco = (pathname: string): string => destinoDoRepresentante(ABA_DO_ENDERECO[caminho(pathname)] ?? 'hoje');
