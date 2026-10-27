'use client';

import { useState } from 'react';
import { DeclaracoesEquipe } from '@/components/praca/DeclaracoesEquipe';
import { PagamentosEquipe } from '@/components/praca/PagamentosEquipe';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';

type Aba = 'pagamentos' | 'declarados';

/**
 * Financeiro (Lovable `financeiro.tsx`, UX §4.9, arquitetura §5 E5.7). Só com o Pix ligado (`features.payouts`); a aba "Cadastros
 * declarados" (nossa, lote S3) só com `features.declared_signups` — os dois lidos do `GET settings/config`, nunca sondando rota.
 * O endereço de antes dos declarados (`/consultores/declarados`) continua abrindo.
 */
export default function FinanceiroPage() {
  const { features, carregando } = useFeaturesMenu();
  const [aba, setAba] = useState<Aba>('pagamentos');
  const atual: Aba = features.declared_signups ? aba : 'pagamentos';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Financeiro</h1>
        <p className="text-muted-foreground">Valores da semana fechada, pela regra de remuneração em vigor. O Praça não envia dinheiro: pague o Pix no banco e registre aqui.</p>
      </div>
      {carregando ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : !features.payouts ? (
        <p className="rounded-2xl bg-card p-5 text-sm shadow-card">Este recurso ainda não está ligado neste servidor.</p>
      ) : (
        <>
          {features.declared_signups && (
            <div role="tablist" aria-label="Financeiro" className="flex flex-wrap gap-2">
              {(
                [
                  ['pagamentos', 'Pagamentos'],
                  ['declarados', 'Cadastros declarados'],
                ] as [Aba, string][]
              ).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={atual === id}
                  onClick={() => setAba(id)}
                  className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium md:min-h-9 ${atual === id ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-secondary'}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}
          {atual === 'pagamentos' ? (
            <PagamentosEquipe />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                O que os representantes declararam como “Cadastrou agora” na visita, conferido com o que o Freela confirmou. Anule o que não existir; o motivo fica registrado.
              </p>
              <DeclaracoesEquipe />
            </>
          )}
        </>
      )}
    </div>
  );
}
