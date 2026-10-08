'use client';

import { MENSAGEM_GPS, type MotivoGps } from '@/modules/campo/domain/gps-mensagens';

/** GPS negado/indisponível: a ação NÃO aconteceu, e a tela diz como liberar. */
export function AvisoGps({ motivo, onFechar }: { motivo: MotivoGps; onFechar: () => void }) {
  const m = MENSAGEM_GPS[motivo];
  return (
    <div className="rounded-md border border-danger/50 bg-danger/10 p-4 text-sm">
      <p className="font-bold">{m.titulo}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {m.passos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <button onClick={onFechar} className="mt-3 text-xs underline">
        Entendi
      </button>
    </div>
  );
}
