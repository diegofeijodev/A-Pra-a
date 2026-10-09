'use client';

import { descartar, useFilaStore } from '@/modules/campo/application/use-fila';
import { useOnline } from '@/modules/campo/application/use-online';
import type { TodayView } from '@/modules/campo/domain/campo.types';
import { irPara } from '@/modules/campo/application/use-tela';
import { plural } from '@/modules/campo/domain/formatos';
import { nomeDaVisita, temEnvioDepoisDoCheckout } from '@/modules/campo/domain/fila-politica';
import { getSnapshot } from '@/modules/campo/infrastructure/campo-session.storage';

/** "2 envios pendentes — enviando quando voltar o sinal" + os envios recusados (spec §8.1 e §9). */
export function FaixaFila() {
  const itens = useFilaStore((s) => s.itens);
  const erros = useFilaStore((s) => s.erros);
  const pausada = useFilaStore((s) => s.pausada);
  const removerErro = useFilaStore((s) => s.removerErro);
  const online = useOnline();

  if (itens.length === 0 && erros.length === 0) return null;
  const bloqueados = itens.filter((i) => i.kind === 'checkout' && i.bloqueio);
  const visitasDoServidor = bloqueados.length ? (getSnapshot<TodayView>('today')?.visits ?? []) : [];
  const parado = itens.some((i) => i.kind === 'checkout' && i.bloqueio);
  const situacao = parado ? 'parado: falta corrigir um checkout' : !online ? 'enviando quando voltar o sinal' : pausada ? 'entre de novo para enviar' : 'enviando…';

  return (
    <div className="space-y-2">
      {itens.length > 0 && (
        <div role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          {plural(itens.length, 'envio pendente', 'envios pendentes')} — {situacao}
        </div>
      )}
      {bloqueados.map((i) =>
        i.kind === 'checkout' ? (
          <div key={i.seq} role="alert" className="space-y-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
            <p>
              Checkout de {nomeDaVisita(i.visit_ref, itens, visitasDoServidor)} precisa de você: {i.bloqueio}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => irPara({ v: 'visita', ref: i.visit_ref })} className="rounded-md border border-border px-3 py-2 text-xs font-bold">
                Abrir visita
              </button>
              <button
                type="button"
                onClick={() => {
                  const aviso = temEnvioDepoisDoCheckout(itens, i.seq as number)
                    ? ' As visitas seguintes podem ser recusadas pelo servidor.'
                    : '';
                  if (window.confirm(`Descartar o checkout desta visita? Ela fica aberta até o fechamento da meia-noite.${aviso}`)) void descartar(i.seq as number);
                }}
                className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
              >
                Descartar este checkout
              </button>
            </div>
          </div>
        ) : null,
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
