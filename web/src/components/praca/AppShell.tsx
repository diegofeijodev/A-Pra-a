'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useState, type ReactNode } from 'react';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { itemAtivo, montarMenu, paginaInicial, type ChaveIcone } from '@/modules/acesso/domain/acesso';
import { useAuth } from '@/modules/auth/application/use-auth';
import {
  useDismissNotifications,
  useNotifications,
} from '@/modules/notifications/application/use-notifications';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

const I = {
  hoje: "M8 2v3M16 2v3M3.5 9h17M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  praca: "M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  funil: "M3 4h18l-7 8v6l-4 2v-8L3 4z",
  consultores: "M9 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 0112 0v1M18 8s-3 2.5-3 5a3 3 0 006 0c0-2.5-3-5-3-5z",
  entrada: "M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2",
  mensagens: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  campanhas: "M3 11l14-5v12L3 13v-2zM17 8a4 4 0 010 8M7 13v5a2 2 0 004 0v-3",
  calendario: "M8 2v3M16 2v3M3 9h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 14h3v3H8z",
  indicadores: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  config: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
  busca: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z",
  freela: "M6 7V3M10 7V3M4 7h8v3a4 4 0 01-8 0V7zM8 14v7",
  // Lote E (menu agrupado, UX §2.1).
  inicio: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  clientes: "M4 6h16M4 12h16M4 18h10",
  mapa: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  rotas: "M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h5a3 3 0 000-6h-2a3 3 0 010-6h5",
  cupons: "M3 9a3 3 0 010 6v3h18v-3a3 3 0 010-6V6H3v3zM13 6v12",
};
const ICONE: Record<ChaveIcone, string> = { ...I };

// O menu sai de `montarMenu` (modules/acesso): com os módulos novos desligados é o de hoje, na ordem do protótipo (`components/
// praca/Layout.tsx`) — "Ações" aponta para `/hoje` e "Freela" é o item da ponte com o api-freela; com eles ligados, os grupos
// da UX §2.1 (Operação de campo, Comercial, Administração).

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

function Bell({ pracaId }: { pracaId: string | undefined }) {
  // A lista já chega sem o que esta conta dispensou (§17) — o protótipo filtrava
  // `dismissedNotifs` na tela porque o estado inteiro morava no navegador.
  const { data } = useNotifications(pracaId);
  const dismiss = useDismissNotifications();
  const notifs = data ?? [];
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground" aria-label="Notificações">
        <Icon d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        <span>Notificações</span>
        {notifs.length > 0 && (
          <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-destructive-foreground">
            {notifs.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-0 left-full z-40 ml-2 w-80 rounded-lg border border-border bg-popover p-3 shadow-xl">
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

/** Os links do menu (a busca da URL decide o item ativo de Clientes/Mapa: fica num Suspense, como o Next pede). */
function ItensMenu({ onEscolher }: { onEscolher: () => void }) {
  const path = usePathname();
  const busca = useSearchParams();
  const { user } = useAuth();
  const { features } = useFeaturesMenu();
  const grupos = montarMenu(features, user);
  return (
    <>
      {grupos.map((g) => {
        const links = g.itens.map((n) => {
          const active = itemAtivo(n, path, busca.get('modo'));
          return (
            <Link
              key={n.to}
              href={n.to}
              onClick={onEscolher}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Icon d={ICONE[n.icon]} />
              {n.label}
            </Link>
          );
        });
        // Sem título (módulos desligados): os links direto na barra, como sempre (mesmo espaçamento).
        if (!g.titulo) return <Fragment key="menu">{links}</Fragment>;
        return (
          <div key={g.titulo} role="group" aria-label={g.titulo} className="space-y-0.5 pt-2">
            <p className="tag px-3 pb-1 pt-1 text-[10px] text-muted-foreground">{g.titulo}</p>
            {links}
          </div>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { signOut } = useAuth();
  // Página inicial (UX §3.1): "Início" (o painel) só com FIELD_DASHBOARD_ENABLED; desligado, `/hoje`, como sempre.
  const inicio = paginaInicial(useFeaturesMenu().features);
  const { praca } = useActivePraca();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-4">
        <Link href={inicio} className="font-display text-xl font-black tracking-tight" onClick={() => setMobileOpen(false)}>
          PRAÇA<span className="text-primary">.</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        <Suspense fallback={null}>
          <ItensMenu onEscolher={() => setMobileOpen(false)} />
        </Suspense>
      </nav>
      <div className="space-y-0.5 border-t border-border p-2">
        <Bell pracaId={praca?.id} />
        <button
          onClick={async () => {
            await signOut();
            router.replace('/entrar');
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          aria-label="Sair"
        >
          <Icon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"
          aria-label="Abrir menu"
        >
          <Icon d="M4 6h16M4 12h16M4 18h16" />
        </button>
        <Link href={inicio} className="font-display text-lg font-black tracking-tight">
          PRAÇA<span className="text-primary">.</span>
        </Link>
      </header>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-background">
            {sidebar}
          </aside>
        </div>
      )}

      {/* desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card md:block">
        {sidebar}
      </aside>

      <main className="px-4 py-5 pb-24 md:ml-60 md:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
