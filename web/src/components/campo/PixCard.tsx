'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { entregarArquivo, usePagamentosCampo } from '@/modules/pagamentos/application/use-pagamentos';
import { brl, rotuloSemana, type PagamentosCampo } from '@/modules/pagamentos/domain/pagamentos';
import { campoComprovante } from '@/modules/pagamentos/infrastructure/pagamentos.api';

type Item = PagamentosCampo['payouts'][number];

function Comprovante({ id }: { id: string }) {
  const abrir = useMutation({
    mutationFn: campoComprovante,
    onSuccess: (blob) => entregarArquivo(blob, null, true),
    onError: () => toast.error('Não foi possível abrir o comprovante agora.'),
  });
  return (
    <button type="button" disabled={abrir.isPending} onClick={() => abrir.mutate(id)} className="min-h-12 rounded-md border border-border px-4 text-sm font-bold">
      {abrir.isPending ? 'Abrindo…' : 'Ver comprovante'}
    </button>
  );
}

function Linha({ p }: { p: Item }) {
  return (
    <li className="space-y-1 rounded-md border border-border p-3">
      <p className="text-sm font-bold">
        Semana {rotuloSemana(p.week.from, p.week.to)} · {brl(p.paid_cents ?? p.due_cents)} · {p.label}
      </p>
      <p className="text-sm text-muted-foreground">{p.text}</p>
      {p.has_proof && <Comprovante id={p.id} />}
    </li>
  );
}

/**
 * Pix da semana (contrato §29.6): "a pagar em seg dd/mm" ou "pago em dd/mm/aaaa", sempre com data absoluta.
 * Sem a flag no servidor, não aparece. Nunca mostra chave Pix.
 */
export function PixCard() {
  const q = usePagamentosCampo();
  if (!q.ligado) return null;
  if (q.isPending) return <div className="card-surface h-20 animate-pulse p-4" aria-label="Carregando seus Pix" />;
  if (q.isError || !q.data) {
    return (
      <section className="card-surface space-y-2 p-4">
        <p className="text-base font-bold">Seus Pix</p>
        <p className="text-sm text-muted-foreground">Não conseguimos carregar seus pagamentos. Tente de novo.</p>
        <button type="button" onClick={() => void q.refetch()} className="min-h-12 rounded-md border border-border px-4 text-sm font-bold">
          Tentar de novo
        </button>
      </section>
    );
  }
  if (q.data.payouts.length === 0) {
    return (
      <section className="card-surface space-y-1 p-4" aria-label="Seus Pix">
        <p className="text-base font-bold">Seus Pix</p>
        <p className="text-sm text-muted-foreground">Ainda não há Pix gerado. Ele aparece aqui quando a equipe fechar a semana.</p>
      </section>
    );
  }
  return (
    <section className="card-surface space-y-3 p-4" aria-label="Seus Pix">
      <p className="text-base font-bold">Seus Pix</p>
      <ul className="space-y-2">
        {q.data.payouts.slice(0, 4).map((p) => (
          <Linha key={p.id} p={p} />
        ))}
      </ul>
    </section>
  );
}
