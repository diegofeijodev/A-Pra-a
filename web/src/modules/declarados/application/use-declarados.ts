'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { anularDeclaracao, declaradosDesligados, getDeclarados } from '../infrastructure/declarados.api';

const CHAVE = ['declarados'] as const;

/** Relatório. `desligada` = flag fechada no servidor (404): a tela some. */
export function useDeclarados(q: { from?: string; to?: string; status?: string; consultant_id?: string }) {
  const r = useQuery({
    queryKey: [...CHAVE, q.from ?? '', q.to ?? '', q.status ?? '', q.consultant_id ?? ''],
    queryFn: () => getDeclarados(q),
    retry: (n, e) => !declaradosDesligados(e) && n < 1,
  });
  return { ...r, desligada: r.isError && declaradosDesligados(r.error) };
}

export function useAnularDeclaracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id: string; reason: string; note: string; client_id: string }) => anularDeclaracao(id, b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE });
      void qc.invalidateQueries({ queryKey: ['remuneracao'] });
      void qc.invalidateQueries({ queryKey: ['consultores', 'atencao'] });
      toast.success('Declaração anulada. O ajuste aparece nos ganhos do consultor no próximo fechamento ou ao reconciliar.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível anular a declaração.')),
  });
}
