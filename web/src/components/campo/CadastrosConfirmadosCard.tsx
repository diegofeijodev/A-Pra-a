'use client';

import { useDia } from '@/modules/campo/application/use-campo';
import { textoCadastrosConfirmados } from '@/modules/campo/domain/cadastros-confirmados';

/**
 * Cadastros que o FREELA confirmou (contrato §27.8), com a conta e a fonte. O "cadastrou agora" do
 * questionário continua sendo só declaração e não entra aqui. Sem retrato do servidor (ou servidor
 * antigo), o bloco simplesmente não aparece.
 */
export function CadastrosConfirmadosCard() {
  const { hoje } = useDia();
  const c = hoje?.signups_confirmed ?? null;
  if (!c) return null;
  const t = textoCadastrosConfirmados(c);
  return (
    <section className="card-surface space-y-1 p-4" aria-label="Cadastros confirmados pelo Freela">
      <p className="text-base font-black">{t.titulo}</p>
      <p className="text-sm text-muted-foreground">{t.conta}</p>
    </section>
  );
}
