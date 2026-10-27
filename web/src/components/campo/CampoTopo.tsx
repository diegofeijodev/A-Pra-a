'use client';

import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { nomeDaPracaAtiva } from '@/modules/campo/domain/praca-do-dia';

/**
 * Cabeçalho das telas do consultor: título e quem está logado (com a praça). O "Sair" mora na faixa azul da casca
 * (`FaixaRepresentante`, redesenho E4).
 */
export function CampoTopo({ titulo }: { titulo: string }) {
  const session = useCampoSession((s) => s.session);
  // Lote F2 (§44.6): com a flag, a praça ATIVA (a da jornada aberta, do servidor ou da fila); desligada, a principal de sempre.
  const me = useCampoMe();
  const { dia } = useDia();
  const praca = me.data?.features?.multi_praca ? nomeDaPracaAtiva(me.data, dia.jornada?.praca_id) : session?.consultant.praca_name;

  return (
    <header>
      <p className="font-display text-2xl font-black tracking-tight">{titulo}</p>
      <p className="text-xs text-muted-foreground">
        {session?.consultant.name} · {praca}
      </p>
    </header>
  );
}
