'use client';

import { BarChart3, CalendarCheck, Map as MapIcon, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { AbaRepresentante } from '@/modules/acesso/domain/enderecos';
import { ABAS_REPRESENTANTE, abaDaTela, irPara, urlDaTela, useTela } from '@/modules/campo/application/use-tela';

const ICONE: Record<AbaRepresentante, LucideIcon> = { hoje: CalendarCheck, mapa: MapIcon, clientes: Users, desempenho: BarChart3, carteira: Wallet };

/**
 * As 5 abas de baixo da casca do representante (Lovable `repNav`, UX §2.5). Cada uma é um `<button>` que troca a VISÃO de `/campo`
 * por `irPara` (`pushState`): nunca `Link`, porque sem sinal a navegação do Next falharia. Nas telas de fluxo (`abaDaTela` = `null`)
 * a barra some e o botão fixo da tela fica no lugar dela. Sem `role="tab"`: são seções da casca, não abas de um conteúdo (e as abas
 * "Perto de mim | Buscar | Novo cliente" da chegada usam esse papel).
 */
export function AbasRepresentante() {
  const tela = useTela();
  const ativa = abaDaTela(tela);
  if (ativa === null) return null;
  return (
    <nav aria-label="Seções" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      {ABAS_REPRESENTANTE.map((a) => {
        const Icone = ICONE[a.aba];
        const atual = a.aba === ativa;
        return (
          <button
            key={a.aba}
            type="button"
            aria-current={atual ? 'page' : undefined}
            onClick={() => {
              // Já na visão da aba: nada a empilhar no histórico.
              if (urlDaTela(tela) === urlDaTela(a.tela)) return;
              irPara(a.tela);
              window.scrollTo(0, 0);
            }}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs ${atual ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
          >
            <Icone className="h-5 w-5" aria-hidden />
            {a.rotulo}
          </button>
        );
      })}
    </nav>
  );
}
