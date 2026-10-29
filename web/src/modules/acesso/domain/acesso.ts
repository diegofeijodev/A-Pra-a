import { z } from 'zod';
import type { AuthUser } from '@/modules/auth/domain/auth.types';
import { ROTA } from './enderecos';

/**
 * Lote E (contrato §41, §42) + casca da Lovable (contrato §46). Regras puras do web: o que cada perfil pode fazer na tela, o
 * menu da equipe e a página inicial. O servidor decide de verdade (guard + serviço); aqui é só o que aparece.
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
  /** Casca da Lovable (contrato §46): grupo "Comercial", sino e as seções do Comercial nas Configurações. */
  commercial: z.boolean().default(false),
  /** §46: item "Rotas" (`FIELD_ROUTES_ENABLED`). */
  routes: z.boolean().default(false),
  /** §46: remuneração (`FIELD_EARNINGS_ENABLED`). */
  earnings: z.boolean().default(false),
  /** §46: item "Financeiro" (Pix, só com a remuneração). */
  payouts: z.boolean().default(false),
  /** §46: link "Declarados" do Financeiro (só com a remuneração). */
  declared_signups: z.boolean().default(false),
  /** CRM automático (contrato §47.1): telas Tarefas e Automações, cartão do Dashboard, selos do Funil (`CRM_TASKS_ENABLED`). */
  crm_tasks: z.boolean().default(false),
  /** §47.1: achados da busca entram sozinhos no funil (`CRM_AUTO_LEADS_FROM_SEARCH_ENABLED`). */
  crm_auto_leads: z.boolean().default(false),
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

// ── menu da equipe (casca da Lovable: arquitetura §2.3, UX §2.3) ─────────────

export type ChaveIcone =
  | 'inicio' | 'praca' | 'clientes' | 'mapa' | 'rotas' | 'consultores' | 'cupons' | 'financeiro' | 'config' | 'usuarios'
  | 'funil' | 'entrada' | 'busca' | 'mensagens' | 'campanhas' | 'calendario' | 'indicadores' | 'hoje' | 'freela' | 'tarefas' | 'automacoes';
export interface ItemMenu {
  to: string;
  label: string;
  icon: ChaveIcone;
}
export interface GrupoMenu {
  /** `null` = sem título (o menu da Lovable, plano). */
  titulo: string | null;
  itens: ItemMenu[];
}

/**
 * Menu da equipe: os nomes e a ordem da Lovable (`staffNav` + `adminNav`), num grupo sem título; com a chave do Comercial
 * (`TEAM_COMMERCIAL_ENABLED`), um 2º grupo "Comercial" com os itens de antes, na ordem de antes. Os itens de módulo com flag só
 * aparecem com ela (lida do `features`, nunca sondando 404). Desvios da Lovable, decididos na arquitetura §2.3: "Dashboard"
 * sempre (é a página inicial; sem o painel ela mostra a Atenção agora) e "Configurações" para toda a equipe (as áreas de
 * atuação são do gestor, §42.3); "Usuários" só para o admin.
 */
export function montarMenu(f: FeaturesMenu, u: { is_admin: boolean; is_gestor?: boolean } | null | undefined): GrupoMenu[] {
  const admin = !!u?.is_admin;
  const principal: ItemMenu[] = [
    { to: ROTA.inicio, label: 'Dashboard', icon: 'inicio' },
    { to: ROTA.pracas, label: 'Praças', icon: 'praca' },
    ...(f.map_pins
      ? [
          { to: ROTA.clientes, label: 'Clientes', icon: 'clientes' as const },
          { to: ROTA.mapa, label: 'Mapa', icon: 'mapa' as const },
        ]
      : []),
    ...(f.routes ? [{ to: ROTA.rotas, label: 'Rotas', icon: 'rotas' as const }] : []),
    { to: ROTA.representantes, label: 'Representantes', icon: 'consultores' },
    ...(f.vouchers ? [{ to: ROTA.vouchers, label: 'Vouchers', icon: 'cupons' as const }] : []),
    ...(f.payouts ? [{ to: ROTA.financeiro, label: 'Financeiro', icon: 'financeiro' as const }] : []),
    { to: ROTA.configuracoes, label: 'Configurações', icon: 'config' },
    ...(admin ? [{ to: ROTA.usuarios, label: 'Usuários', icon: 'usuarios' as const }] : []),
  ];
  if (!f.commercial) return [{ titulo: null, itens: principal }];
  const crm = f.crm_tasks;
  const comercial: ItemMenu[] = [
    // Com as tarefas do CRM (§47): "Tarefas" abre o Comercial e "Automações" fecha; "Ações" vira "Ações da praça" nos dois casos.
    ...(crm ? [{ to: ROTA.tarefas, label: 'Tarefas', icon: 'tarefas' as const }] : []),
    { to: '/funil', label: 'Funil', icon: 'funil' },
    { to: '/entrada', label: 'Entrada', icon: 'entrada' },
    // Como sempre: a busca é de quem opera (admin e gestor; o gestor só no mapa aberto, no servidor).
    ...(podeOperar(u) ? [{ to: '/prospeccao', label: 'Buscar estabelecimentos', icon: 'busca' as const }] : []),
    { to: '/mensagens', label: 'Mensagens', icon: 'mensagens' },
    { to: '/campanhas', label: 'Campanhas', icon: 'campanhas' },
    { to: '/calendario', label: 'Calendário', icon: 'calendario' },
    { to: '/indicadores', label: 'Indicadores', icon: 'indicadores' },
    { to: '/hoje', label: 'Ações da praça', icon: 'hoje' },
    { to: '/freela', label: 'Freela', icon: 'freela' },
    ...(crm ? [{ to: ROTA.automacoes, label: 'Automações', icon: 'automacoes' as const }] : []),
  ];
  return [
    { titulo: null, itens: principal },
    { titulo: 'Comercial', itens: comercial },
  ];
}

/** O caminho é o da rota ou fica abaixo dela (prefixo por pedaço: `/praca` não acende em `/pracas`). */
const abaixoDe = (rota: string, path: string): boolean => path === rota || path.startsWith(`${rota}/`);

/**
 * O item ativo do menu (um só, ou nenhum): o de prefixo MAIS LONGO, como o `Link` do TanStack na Lovable — `/representantes/<id>`
 * acende "Representantes" e `/mapa/calor` acende "Mapa". Item com `?modo=` só casa com o mesmo `modo` na URL (o Mapa
 * dividia a rota com Clientes até a E5.3; hoje é página própria). Empate exato: vale o primeiro da lista.
 */
export function itemAtivo(itens: ItemMenu[], path: string, modo: string | null): ItemMenu | null {
  let melhor: ItemMenu | null = null;
  let pontos = -1;
  for (const item of itens) {
    const [rotaQs = ''] = item.to.split('#');
    const [rota = '', qs] = rotaQs.split('?');
    if (!abaixoDe(rota, path)) continue;
    const modoItem = qs ? new URLSearchParams(qs).get('modo') : null;
    // Item com `modo` só vale com o mesmo `modo` na URL; e ganha do irmão sem `modo` quando os dois casam.
    if (modoItem !== null && modoItem !== modo) continue;
    const p = rota.length + (modoItem !== null ? 0.5 : 0);
    if (p > pontos) {
      melhor = item;
      pontos = p;
    }
  }
  return melhor;
}

/**
 * Onde a faixa de pílulas do celular (rola de lado) para, para a pílula acesa ficar no MEIO e inteira à vista (UX §2.2). Medidas da
 * tela (`getBoundingClientRect` da faixa e da pílula + `scrollLeft`/`scrollWidth`/`clientWidth` da faixa); o resultado fica entre 0 e
 * o fim da faixa. Pura: o `AppShell` mede e aplica.
 */
export function rolagemParaCentrar(faixa: { left: number; width: number; scrollLeft: number; scrollWidth: number; clientWidth: number }, pilula: { left: number; width: number }): number {
  const alvo = faixa.scrollLeft + (pilula.left - faixa.left) - (faixa.width - pilula.width) / 2;
  return Math.round(Math.min(Math.max(alvo, 0), Math.max(faixa.scrollWidth - faixa.clientWidth, 0)));
}

/** Página inicial da equipe: sempre o Dashboard (sem o painel, ele mostra a Atenção agora), nunca mais `/hoje` (Comercial). */
export const paginaInicial = (): string => ROTA.inicio;
