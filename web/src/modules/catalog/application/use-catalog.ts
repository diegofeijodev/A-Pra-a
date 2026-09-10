'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchCatalog } from '../infrastructure/catalog.api';

/**
 * O catálogo é conteúdo estático da API (rota pública): busca uma vez por aba e
 * nunca revalida — daí `staleTime: Infinity`.
 */
export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: fetchCatalog, staleTime: Infinity });
}
