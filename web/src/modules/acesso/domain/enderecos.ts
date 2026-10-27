/**
 * Endereços das telas da equipe num lugar só (redesenho da Lovable, arquitetura §5 E2). Até a E7 os valores são os endereços
 * de HOJE; a E7 troca os valores pelos da Lovable (`/inicio`, `/pracas`, `/clientes`…) e redireciona os antigos. Quem aponta
 * para uma tela usa `ROTA.x`, nunca o texto do endereço.
 */
export const ROTA = {
  entrar: '/entrar',
  inicio: '/consultores/painel',
  pracas: '/praca',
  clientes: '/consultores/clientes',
  mapa: '/consultores/clientes?modo=mapa',
  rotas: '/consultores/roteiros',
  representantes: '/consultores',
  vouchers: '/consultores/cupons',
  financeiro: '/consultores/pagamentos',
  configuracoes: '/configuracoes',
  // A tela própria "Usuários" chega na E5; até lá é o bloco "Pessoas" das Configurações.
  usuarios: '/configuracoes#pessoas',
  // Fora do menu: a troca da própria senha (E3), aberta pelo rodapé da casca.
  trocarSenha: '/trocar-senha',
} as const;

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
 * da fila offline e do atalho instalado, arquitetura §3.4): na E2 tudo leva a `/campo`; a E4 dá a cada aba a sua visão.
 */
const DESTINO_REPRESENTANTE: Record<AbaRepresentante, string> = {
  hoje: '/campo',
  mapa: '/campo',
  clientes: '/campo',
  desempenho: '/campo',
  carteira: '/campo',
};
export const destinoDoRepresentante = (aba: AbaRepresentante = 'hoje'): string => DESTINO_REPRESENTANTE[aba];

/** Endereços da Lovable que servem às duas pessoas (o mesmo link na equipe e no representante, arquitetura §3.3). */
const ABA_DO_ENDERECO: Record<string, AbaRepresentante> = {
  '/inicio': 'hoje',
  '/mapa': 'mapa',
  '/clientes': 'clientes',
  '/financeiro': 'carteira',
  '/desempenho': 'desempenho',
};

/**
 * O representante (só `campoSession`) que abre um endereço da equipe cai na casca DELE, na visão equivalente — nunca na entrada
 * (o `(app)/layout.tsx` usa isto). Qualquer outro endereço vai para o "Hoje".
 */
export const destinoDoRepresentantePorEndereco = (pathname: string): string =>
  destinoDoRepresentante(ABA_DO_ENDERECO[pathname.replace(/\/+$/, '') || '/'] ?? 'hoje');
