'use client';

import { CadastrosConfirmadosCard } from '@/components/campo/CadastrosConfirmadosCard';
import { GanhosCard } from '@/components/campo/GanhosCard';
import { PixCard } from '@/components/campo/PixCard';
import { ResumoDiaAtalhos } from '@/components/campo/ResumoDiaTela';
import { todaySp } from '@/lib/dates';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { cartoesCarteira } from '@/modules/campo/domain/carteira';
import { usePagamentosCampo } from '@/modules/pagamentos/application/use-pagamentos';
import { useGanhosCampo } from '@/modules/remuneracao/application/use-remuneracao';

/** Os três cartões de resumo (UX §4.14) no desenho dos do Financeiro da Lovable; os mesmos dados dos cartões de baixo. */
function ResumoDaCarteira() {
  const g = useGanhosCampo();
  const p = usePagamentosCampo();
  const cartoes = cartoesCarteira(g.ligado ? g.data : undefined, p.ligado ? p.data : undefined, todaySp());
  if (cartoes.length === 0) return null;
  return (
    <section aria-label="Resumo da carteira" className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-2xl bg-card p-4 shadow-card">
            <p className="text-sm text-muted-foreground">{c.rotulo}</p>
            <p className="text-2xl font-semibold">{c.valor}</p>
            <p className="text-xs text-muted-foreground">{c.apoio}</p>
          </div>
        ))}
      </div>
      {g.ligado && g.data && <p className="text-xs text-muted-foreground">Fonte: {g.data.source}. A conta de cada valor está nos cartões abaixo.</p>}
    </section>
  );
}

/**
 * Aba "Carteira" do representante (`?v=carteira`, UX §4.14): o dinheiro num lugar só — os três cartões de resumo, os ganhos com a
 * conta, os Pix, os cadastros confirmados pelo Freela e o resultado de cada dia (saíram da Hoje). Cada cartão só aparece com a sua
 * flag do `/me`; sem ganhos nem Pix ligados, a tela diz isso em vez de ficar vazia.
 */
export function CarteiraTela() {
  const me = useCampoMe();
  const { carregando } = useDia();
  const f = me.data?.features;
  const dinheiroLigado = f?.earnings === true || f?.payouts === true;

  return (
    <main className="space-y-4">
      <h1 className="text-3xl font-semibold">Carteira</h1>
      {me.data && !dinheiroLigado && <p className="card-surface p-5 text-sm">Ganhos e Pix ainda não estão ligados neste servidor.</p>}
      <ResumoDaCarteira />
      {!carregando && <CadastrosConfirmadosCard />}
      <GanhosCard />
      <PixCard />
      <ResumoDiaAtalhos />
    </main>
  );
}
