'use client';

import {
  BarChart3,
  Bell as BellIcon,
  Calendar,
  Filter,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  LogOut,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  Plug,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  UserCheck,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { itemAtivo, montarMenu, perfilDe, rolagemParaCentrar, ROTULO_PERFIL, type ChaveIcone } from '@/modules/acesso/domain/acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import {
  useDismissNotifications,
  useNotifications,
} from '@/modules/notifications/application/use-notifications';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

/**
 * Casca da equipe igual à Lovable (`garden-v2/src/routes/_authenticated/route.tsx:89-120`; UX §2.1–§2.2): menu lateral
 * azul-marinho (w-60) com o bloco do usuário e "Sair" no desktop; no celular, faixa `bg-brand` e o menu em pílulas que rolam
 * na horizontal. Os itens saem de `montarMenu` (nomes e ordem da Lovable; grupo "Comercial" só com a chave, contrato §46).
 */
const ICONE: Record<ChaveIcone, LucideIcon> = {
  inicio: LayoutDashboard,
  praca: MapPin,
  clientes: Users,
  mapa: MapIcon,
  rotas: Route,
  consultores: UserCheck,
  cupons: Ticket,
  financeiro: Wallet,
  config: Settings,
  usuarios: ShieldCheck,
  funil: Filter,
  entrada: Inbox,
  busca: Search,
  mensagens: MessageSquare,
  campanhas: Megaphone,
  calendario: Calendar,
  indicadores: BarChart3,
  hoje: ListChecks,
  tarefas: ListTodo,
  automacoes: Zap,
  freela: Plug,
};

/** Avisos de ações e leads (§17): são do Comercial, então o sino só existe com a chave ligada. */
function Sino({ pracaId, lado }: { pracaId: string | undefined; lado: 'lateral' | 'topo' }) {
  // A lista já chega sem o que esta conta dispensou (§17) — o protótipo filtrava
  // `dismissedNotifs` na tela porque o estado inteiro morava no navegador.
  const { data } = useNotifications(pracaId);
  const dismiss = useDismissNotifications();
  const notifs = data ?? [];
  const [open, setOpen] = useState(false);
  const contador = notifs.length > 0 && (
    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-destructive-foreground">
      {notifs.length}
    </span>
  );
  return (
    <div className="relative">
      {lado === 'lateral' ? (
        <button
          onClick={() => setOpen(!open)}
          className="mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent"
          aria-label="Notificações"
          aria-expanded={open}
        >
          <BellIcon className="h-4 w-4" aria-hidden />
          <span>Notificações</span>
          <span className="ml-auto">{contador}</span>
        </button>
      ) : (
        <button onClick={() => setOpen(!open)} className="relative grid h-11 w-11 place-items-center" aria-label="Notificações" aria-expanded={open}>
          <BellIcon className="h-5 w-5" aria-hidden />
          {contador && <span className="absolute right-1 top-1">{contador}</span>}
        </button>
      )}
      {open && (
        <div
          className={`absolute z-40 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl ${
            lado === 'lateral' ? 'bottom-0 left-full ml-2' : 'right-0 top-full mt-1'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="tag text-muted-foreground">Notificações</p>
            {notifs.length > 0 && (
              <button
                onClick={() => dismiss.mutate(notifs.map((n) => n.id))}
                disabled={dismiss.isPending}
                className="text-[11px] text-muted-foreground hover:text-primary"
              >Limpar</button>
            )}
          </div>
          <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
            {notifs.length === 0 && <li className="text-xs text-muted-foreground">Tudo em dia.</li>}
            {notifs.map((n) => (
              <li key={n.id} className={`rounded-md p-2 text-xs ${n.tone === "warn" ? "bg-warning/12" : "bg-secondary/60"}`}>{n.text}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">E-mail diário (7h) e semanal ficam preparados aqui — hoje os avisos aparecem no aplicativo.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Os links do menu nas duas formas (lateral e pílulas). A busca da URL decide entre Clientes e Mapa: fica num Suspense, como o
 * Next pede. Um item aceso só, o de prefixo mais longo (`itemAtivo`).
 */
function ItensMenu({ variante }: { variante: 'lateral' | 'pilulas' }) {
  const path = usePathname();
  const busca = useSearchParams();
  const { user } = useAuth();
  const { features } = useFeaturesMenu();
  const grupos = montarMenu(features, user);
  const ativo = itemAtivo(grupos.flatMap((g) => g.itens), path, busca.get('modo'));
  const ativoRef = useRef<HTMLAnchorElement | null>(null);
  const centradoEm = useRef<string | null>(null);
  // Os itens chegam aos poucos (Rotas, Vouchers e Financeiro só depois do `features`): pílulas entram ANTES da acesa sem trocar a
  // acesa, então a faixa recentra quando a lista muda, não só quando a acesa muda.
  const chaveItens = grupos.flatMap((g) => g.itens.map((i) => i.to)).join('|');

  // No celular, a pílula acesa fica no meio da faixa e inteira à vista (UX §2.2). Ao abrir a tela e quando a lista ou as fontes
  // mudam, sem animação; trocando de item, rola suave — e nunca com `prefers-reduced-motion`. Só a faixa rola (sem `scrollIntoView`,
  // que também mexeria na rolagem da página).
  useEffect(() => {
    if (variante !== 'pilulas') return;
    let viva = true;
    const centrar = (suave: boolean) => {
      const el = ativoRef.current;
      const faixa = el?.closest('nav');
      if (!viva || !el || !faixa) return;
      const f = faixa.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      const left = rolagemParaCentrar(
        { left: f.left, width: f.width, scrollLeft: faixa.scrollLeft, scrollWidth: faixa.scrollWidth, clientWidth: faixa.clientWidth },
        { left: p.left, width: p.width },
      );
      const calmo = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (typeof faixa.scrollTo === 'function') faixa.scrollTo({ left, behavior: suave && !calmo ? 'smooth' : 'auto' });
      else faixa.scrollLeft = left;
    };
    const trocouDeItem = centradoEm.current !== null && centradoEm.current !== (ativo?.to ?? null);
    centrar(trocouDeItem);
    centradoEm.current = ativo?.to ?? null;
    // `next/font` troca a largura das pílulas quando a fonte termina de chegar (só espera se ainda não chegou: com a fonte pronta,
    // o `ready` resolveria na hora e cortaria a rolagem suave).
    if (document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => centrar(false));
    return () => {
      viva = false;
    };
  }, [variante, ativo?.to, chaveItens]);

  return (
    <>
      {grupos.map((g) => {
        const links = g.itens.map((n) => {
          const aceso = n === ativo;
          const Icone = ICONE[n.icon];
          return variante === 'lateral' ? (
            <Link
              key={n.to}
              href={n.to}
              aria-current={aceso ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent ${
                aceso ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground' : ''
              }`}
            >
              <Icone className="h-4 w-4 shrink-0" aria-hidden />
              {n.label}
            </Link>
          ) : (
            // A Lovable usa `py-1.5` (≈ 32 px); aqui `min-h-11` [desvio: alvo de toque, UX §2.2].
            <Link
              key={n.to}
              href={n.to}
              ref={aceso ? ativoRef : undefined}
              aria-current={aceso ? 'page' : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm ${
                aceso ? 'bg-secondary font-semibold text-secondary-foreground' : 'text-muted-foreground'
              }`}
            >
              {n.label}
            </Link>
          );
        });
        if (!g.titulo) return <div key="principal" className={variante === 'lateral' ? 'space-y-1' : 'contents'}>{links}</div>;
        return variante === 'lateral' ? (
          <div key={g.titulo} role="group" aria-label={g.titulo} className="my-2 space-y-1 border-t border-sidebar-border">
            <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide opacity-60">{g.titulo}</p>
            {links}
          </div>
        ) : (
          <div key={g.titulo} role="group" aria-label={g.titulo} className="flex shrink-0 gap-1 border-l border-border pl-1">
            {links}
          </div>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { features } = useFeaturesMenu();
  const { praca } = useActivePraca();
  const sair = async () => {
    await signOut();
    router.replace(ROTA.entrar);
  };

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-5 py-5 text-lg font-semibold text-sidebar-primary">
          <MapPin className="h-5 w-5" aria-hidden /> Praça
        </div>
        {/* `overflow-y-auto` é nosso: com o grupo Comercial ligado a lista passa da altura da tela. */}
        <nav aria-label="Menu" className="flex-1 overflow-y-auto px-3">
          <Suspense fallback={null}>
            <ItensMenu variante="lateral" />
          </Suspense>
        </nav>
        <div className="border-t border-sidebar-border p-4 text-sm">
          {features.commercial && <Sino pracaId={praca?.id} lado="lateral" />}
          <div className="font-medium text-sidebar-primary">{user?.name}</div>
          {/* A Lovable mostra `@usuario · perfil`; o nosso login é por e-mail. */}
          <div className="mb-3 break-all text-xs opacity-70">
            {user?.email} · {user ? ROTULO_PERFIL[perfilDe(user)] : ''}
          </div>
          {/* Nosso (UX §2.1): a Lovable só leva à troca quando ela é obrigatória. A troca pede a senha atual (contrato §2). */}
          <Link href={ROTA.trocarSenha} className="mb-2 block text-xs underline opacity-80 hover:opacity-100">
            Trocar senha
          </Link>
          <Button variant="secondary" size="sm" className="w-full" onClick={() => void sair()}>
            <LogOut className="h-4 w-4" aria-hidden /> Sair
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Lovable: `py-3` com o ícone solto; aqui os botões têm 44 × 44 (UX §2.2), então `py-1.5` mantém a faixa baixa. */}
        <header className="no-print flex items-center justify-between bg-brand px-4 py-1.5 text-primary-foreground md:hidden">
          <div className="flex items-center gap-2 font-semibold">
            <MapPin className="h-5 w-5" aria-hidden /> Praça
          </div>
          <div className="flex items-center">
            {features.commercial && <Sino pracaId={praca?.id} lado="topo" />}
            {/* No celular não há rodapé: o mesmo "Trocar senha" vira ícone ao lado de "Sair" (alvo de 44 × 44). */}
            <Link href={ROTA.trocarSenha} aria-label="Trocar senha" className="grid h-11 w-11 place-items-center">
              <KeyRound className="h-5 w-5" aria-hidden />
            </Link>
            <button onClick={() => void sair()} aria-label="Sair" className="grid h-11 w-11 place-items-center">
              <LogOut className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </header>
        <nav aria-label="Menu" className="no-print flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          <Suspense fallback={null}>
            <ItensMenu variante="pilulas" />
          </Suspense>
        </nav>
        <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
