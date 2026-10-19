'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { createArea, listAreas, updateArea, type CreateAreaInput, type UpdateAreaInput } from '../infrastructure/areas.api';

const chave = (pracaId: string) => ['areas', pracaId] as const;

export function useAreas(pracaId: string | undefined) {
  return useQuery({ queryKey: chave(pracaId ?? ''), queryFn: () => listAreas(pracaId!), enabled: !!pracaId });
}

export function useCreateArea(pracaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateAreaInput, 'praca_id'>) => createArea({ ...input, praca_id: pracaId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chave(pracaId) });
      toast.success('Área criada.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível criar a área.')),
  });
}

export function useUpdateArea(pracaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAreaInput }) => updateArea(id, pracaId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chave(pracaId) });
      toast.success('Área salva.');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Não foi possível salvar a área.')),
  });
}
