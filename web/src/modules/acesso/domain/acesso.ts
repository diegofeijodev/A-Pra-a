import { z } from 'zod';
import type { AuthUser } from '@/modules/auth/domain/auth.types';

/**
 * Lote E (contrato §41, §42) + navegação agrupada (UX §2.1). Regras puras do web: o que cada perfil pode fazer na tela, o menu
 * da equipe e a página inicial. O servidor decide de verdade (guard + serviço); aqui é só o que aparece.
 */

/** `features` do `GET /v1/consultores/settings/config` (todas as que mexem no menu). Servidor antigo não manda = desligado. */
export const featuresMenuSchema = z.object({
  dashboard: z.boolean().default(false),
  map_pins: z.boolean().default(false),
  vouchers: z.boolean().default(false),
  route_plans: z.boolean().default(false),
  malls: z.boolean().default(false),
  password_policy: z.boolean().default(false),
  consultant_profile: z.boolean().default(false),
  contact_email: z.boolean().default(false),
  team_gestor: z.boolean().default(false),
  /** Lote F2 (contrato §44.1): consultor em várias praças (não mexe no menu). */
  multi_praca: z.boolean().default(false),
});
export type FeaturesMenu = z.infer<typeof featuresMenuSchema>;
export const SEM_FEATURES_MENU: FeaturesMenu = featuresMenuSchema.parse({});

/** Gestor EFETIVO: o servidor só manda `is_gestor` com a flag ligada (§42.1). Admin nunca é "gestor". */
export const ehGestor = (u: Pick<AuthUser, 'is_admin'> & { is_gestor?: boolean } | null | undefined): boolean =>
  !!u && !u.is_admin && u.is_gestor === true;

/** Escrita operacional (§42.3): admin, ou gestor. Configuração, Pix e pagamentos continuam `is_admin`. */
export const podeOperar = (u: Pick<AuthUser, 'is_admin'> & { is_gestor?: boolean } | null | undefined): boolean =>
  !!u && (u.is_admin || ehGestor(u));

/** Perfil da tela Pessoas (§42.2). */
export type Perfil = 'admin' | 'gestor' | 'equipe';
export const perfilDe = (u: { is_admin: boolean; is_gestor?: boolean }): Perfil => (u.is_admin ? 'admin' : u.is_gestor ? 'gestor' : 'equipe');
export const corpoDoPerfil = (p: Perfil): { is_admin: boolean; is_gestor: boolean } => ({ is_admin: p === 'admin', is_gestor: p === 'gestor' });
export const ROTULO_PERFIL: Record<Perfil, string> = { admin: 'Admin', gestor: 'Gestor', equipe: 'Equipe' };

// ── menu da equipe (UX §2.1) ─────────────────────────────────

export type ChaveIcone =
  | 'inicio' | 'praca' | 'clientes' | 'mapa' | 'rotas' | 'consultores' | 'cupons' | 'funil' | 'entrada' | 'busca'
  | 'mensagens' | 'campanhas' | 'calendario' | 'indicadores' | 'hoje' | 'config' | 'freela';
export interface ItemMenu {
  to: string;
  label: string;
  icon: ChaveIcone;
}
export interface GrupoMenu {
  /** `null` = sem título (o menu de sempre, plano). */
  titulo: string | null;
  itens: ItemMenu[];
}

/** O menu de hoje, na ordem do protótipo — o que vale com todos os módulos novos desligados (produção hoje). */
export function menuDeHoje(admin: boolean, buscaLiberada = admin): ItemMenu[] {
  return [
    { to: '/praca', label: 'Praça', icon: 'praca' },
    { to: '/funil', label: 'Funil', icon: 'funil' },
    { to: '/consultores', label: 'Consultores', icon: 'consultores' },
    { to: '/entrada', label: 'Entrada', icon: 'entrada' },
    ...(buscaLiberada ? [{ to: '/prospeccao', label: 'Buscar estabelecimentos', icon: 'busca' as const }] : []),
    { to: '/mensagens', label: 'Mensagens', icon: 'mensagens' },
    { to: '/campanhas', label: 'Campanhas', icon: 'campanhas' },
    { to: '/calendario', label: 'Calendário', icon: 'calendario' },
    { to: '/indicadores', label: 'Indicadores', icon: 'indicadores' },
    { to: '/hoje', label: 'Ações', icon: 'hoje' },
    { to: '/configuracoes', label: 'Configurações', icon: 'config' },
    { to: '/freela', label: 'Freela', icon: 'freela' },
  ];
}

/** O menu agrupado só aparece quando algum módulo novo de navegação está ligado (desligados: o menu de hoje, sem mudança). */
export const menuAgrupadoLigado = (f: FeaturesMenu): boolean => f.dashboard || f.map_pins || f.vouchers || f.route_plans || f.team_gestor;

/**
 * Menu da equipe (UX §2.1): Operação de campo (nomes e ordem da Lovable), Comercial (nosso) e Administração (só admin). O
 * gestor vê Operação e Comercial (e "Buscar estabelecimentos", só no mapa aberto). Desligados os módulos = um grupo sem título
 * com o menu de hoje.
 */
export function montarMenu(f: FeaturesMenu, u: { is_admin: boolean; is_gestor?: boolean } | null | undefined): GrupoMenu[] {
  const admin = !!u?.is_admin;
  const operar = podeOperar(u);
  if (!menuAgrupadoLigado(f)) return [{ titulo: null, itens: menuDeHoje(admin, operar) }];
  const operacao: ItemMenu[] = [
    ...(f.dashboard ? [{ to: '/consultores/painel', label: 'Início', icon: 'inicio' as const }] : []),
    { to: '/praca', label: 'Praças', icon: 'praca' },
    ...(f.map_pins
      ? [
          { to: '/consultores/clientes', label: 'Clientes', icon: 'clientes' as const },
          { to: '/consultores/clientes?modo=mapa', label: 'Mapa', icon: 'mapa' as const },
        ]
      : []),
    { to: '/consultores/roteiros', label: 'Rotas', icon: 'rotas' },
    { to: '/consultores', label: 'Consultores', icon: 'consultores' },
    ...(f.vouchers ? [{ to: '/consultores/cupons', label: 'Cupons', icon: 'cupons' as const }] : []),
  ];
  const comercial: ItemMenu[] = [
    { to: '/funil', label: 'Funil', icon: 'funil' },
    { to: '/entrada', label: 'Entrada', icon: 'entrada' },
    ...(operar ? [{ to: '/prospeccao', label: 'Buscar estabelecimentos', icon: 'busca' as const }] : []),
    { to: '/mensagens', label: 'Mensagens', icon: 'mensagens' },
    { to: '/campanhas', label: 'Campanhas', icon: 'campanhas' },
    { to: '/calendario', label: 'Calendário', icon: 'calendario' },
    { to: '/indicadores', label: 'Indicadores', icon: 'indicadores' },
    { to: '/hoje', label: 'Ações', icon: 'hoje' },
    { to: '/freela', label: 'Freela', icon: 'freela' },
  ];
  // "Configurações" continua para toda a equipe, como hoje (os controles de admin ficam desligados para os outros). O gestor
  // também a vê: é lá que ficam as ÁREAS de atuação, que a tabela do §42.3 dá a ele (a UX P1 a escondia — divergência anotada).
  return [
    { titulo: 'Operação de campo', itens: operacao },
    { titulo: 'Comercial', itens: comercial },
    { titulo: 'Administração', itens: [{ to: '/configuracoes', label: 'Configurações', icon: 'config' }] },
  ];
}

/** Item ativo: o caminho exato (e, para Clientes/Mapa, o modo da URL). */
export function itemAtivo(item: ItemMenu, path: string, modo: string | null): boolean {
  const [rota, qs] = item.to.split('?');
  if (rota !== path) return false;
  const modoItem = qs ? new URLSearchParams(qs).get('modo') : null;
  if (rota === '/consultores/clientes') return (modoItem ?? 'lista') === (modo ?? 'lista');
  return true;
}

/** Página inicial da equipe (UX §3.1): "Início" (o painel) só com `FIELD_DASHBOARD_ENABLED`; desligado, a de hoje (`/hoje`). */
export const paginaInicial = (f: Pick<FeaturesMenu, 'dashboard'>): string => (f.dashboard ? '/consultores/painel' : '/hoje');
