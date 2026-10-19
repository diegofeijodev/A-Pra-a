'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getHeatmap, type HeatmapParams } from '../infrastructure/calor.api';

/** Mapa de calor; mantém o desenho anterior enquanto o recorte novo carrega (sem piscar ao arrastar). */
export function useCalor(p: HeatmapParams | null) {
  return useQuery({
    queryKey: ['calor', p],
    queryFn: () => getHeatmap(p!),
    enabled: !!p,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
