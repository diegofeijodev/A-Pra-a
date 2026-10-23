'use client';

import { Chip, Grupo } from '@/components/campo/simples/Chip';
import type { PracaDoConjunto } from '@/modules/campo/domain/praca-do-dia';

/**
 * "Em qual praça você está hoje?" (lote F2, contrato §44.5, UX §3.8). Só aparece com a flag, 2+ praças e sem roteiro hoje (quem
 * decide é `mostraEscolhaDePraca`); vem marcada a praça padrão do servidor. Escolher não grava nada: vai no corpo do início.
 */
export function PracaDoDia({ pracas, marcada, onEscolher }: { pracas: PracaDoConjunto[]; marcada: string | null; onEscolher: (id: string) => void }) {
  return (
    <section className="space-y-2" aria-label="Praça de hoje">
      <p className="text-sm font-bold">Em qual praça você está hoje?</p>
      <Grupo rotulo="Em qual praça você está hoje?">
        {pracas.map((p) => (
          <Chip key={p.id} ativo={marcada === p.id} onEscolher={() => onEscolher(p.id)} className="h-14 min-h-14 text-sm">
            {p.name}
          </Chip>
        ))}
      </Grupo>
      <p className="text-xs text-muted-foreground">
        Os lugares próximos, a busca e o que você cadastrar hoje ficam nessa praça. Para trocar no meio do dia, encerre o dia e inicie de novo na outra.
      </p>
    </section>
  );
}

/** Com roteiro hoje a praça vem dele (0 toques): só a frase, sem escolha. */
export function PracaDoRoteiro({ nome }: { nome: string }) {
  return <p className="text-sm text-muted-foreground">Hoje em {nome} (a praça do seu roteiro).</p>;
}
