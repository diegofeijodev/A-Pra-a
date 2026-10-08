'use client';

import { useFilaStore } from '@/modules/campo/application/use-fila';
import { useOnline } from '@/modules/campo/application/use-online';
import { plural } from '@/modules/campo/domain/formatos';

/** "2 envios pendentes — enviando quando voltar o sinal" + os envios recusados (spec §8.1 e §9). */
export function FaixaFila() {
  const itens = useFilaStore((s) => s.itens);
  const erros = useFilaStore((s) => s.erros);
  const pausada = useFilaStore((s) => s.pausada);
  const removerErro = useFilaStore((s) => s.removerErro);
  const online = useOnline();

  if (itens.length === 0 && erros.length === 0) return null;
  const situacao = !online ? 'enviando quando voltar o sinal' : pausada ? 'entre de novo para enviar' : 'enviando…';

  return (
    <div className="space-y-2">
      {itens.length > 0 && (
        <div role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          {plural(itens.length, 'envio pendente', 'envios pendentes')} — {situacao}
        </div>
      )}
      {erros.map((e) => (
        <div key={e.id} role="alert" className="flex items-start justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <span>{e.texto}</span>
          <button onClick={() => removerErro(e.id)} aria-label="Dispensar aviso" className="text-lg leading-none">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
