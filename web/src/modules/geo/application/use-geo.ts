'use client';

import { useQuery } from '@tanstack/react-query';
import { RADIUS_KM } from '@/lib/geo';
import {
  fetchVizinhas,
  listEstados,
  listMunicipios,
  type Municipio,
  type Vizinha,
  type VizinhasView,
} from '../infrastructure/geo.api';

export type { Municipio, Vizinha, VizinhasView };

// Geografia é dado estático do IBGE: uma vez por aba basta.
const ESTATICO = { staleTime: Infinity } as const;

export function useEstados() {
  return useQuery({ queryKey: ['geo', 'estados'], queryFn: listEstados, ...ESTATICO });
}

export function useMunicipios(uf: string | null | undefined) {
  return useQuery({
    queryKey: ['geo', 'municipios', uf],
    queryFn: () => listMunicipios(uf as string),
    enabled: !!uf,
    ...ESTATICO,
  });
}

export function useVizinhas(ibge: string | null | undefined, km: number = RADIUS_KM) {
  return useQuery({
    queryKey: ['geo', 'vizinhas', ibge, km],
    queryFn: () => fetchVizinhas(ibge as string, km),
    enabled: !!ibge,
    ...ESTATICO,
  });
}
