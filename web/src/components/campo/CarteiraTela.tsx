'use client';

import { CadastrosConfirmadosCard } from '@/components/campo/CadastrosConfirmadosCard';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { GanhosCard } from '@/components/campo/GanhosCard';
import { PixCard } from '@/components/campo/PixCard';
import { ResumoDiaAtalhos } from '@/components/campo/ResumoDiaTela';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';

/**
 * Aba "Carteira" do representante (`?v=carteira`, UX §4.14): o dinheiro num lugar só — ganhos com a conta, os Pix, os cadastros
 * confirmados pelo Freela e o resultado de cada dia (saíram da Hoje). Cada cartão só aparece com a sua flag do `/me`; sem ganhos
 * nem Pix ligados, a tela diz isso em vez de ficar vazia.
 */
export function CarteiraTela() {
  const me = useCampoMe();
  const { carregando } = useDia();
  const f = me.data?.features;
  const dinheiroLigado = f?.earnings === true || f?.payouts === true;

  return (
    <main className="space-y-4">
      <h1 className="text-3xl font-semibold">Carteira</h1>
      <FaixaFila />
      {me.data && !dinheiroLigado && <p className="card-surface p-5 text-sm">Ganhos e Pix ainda não estão ligados neste servidor.</p>}
      {!carregando && <CadastrosConfirmadosCard />}
      <GanhosCard />
      <PixCard />
      <ResumoDiaAtalhos />
    </main>
  );
}
