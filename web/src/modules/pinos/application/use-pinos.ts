'use client';

import { useQuery } from '@tanstack/react-query';
import { juntarPaginas, MAX_PINOS_NA_TELA, type ModoMapa, type PinosPagina } from '../domain/pinos';
import { getDetalhePino, getPinosCampoPagina, getPinosPagina } from '../infrastructure/pinos.api';

/** Todas as páginas do filtro (até 10.000 pinos), em sequência pelo cursor (contrato §34.1). */
export function useMapaPinos(q: { praca_id?: string; mode: ModoMapa }, ligado: boolean) {
  return useQuery({
    queryKey: ['pinos', q.mode, q.praca_id ?? ''],
    enabled: ligado,
    queryFn: async () => {
      const paginas: PinosPagina[] = [];
      let cursor: string | undefined;
      let carregados = 0;
      do {
        const p = await getPinosPagina({ ...q, cursor });
        paginas.push(p);
        carregados += p.pins.length;
        cursor = p.next_cursor ?? undefined;
      } while (cursor && carregados < MAX_PINOS_NA_TELA);
      return juntarPaginas(paginas);
    },
    staleTime: 60_000,
  });
}

export function useDetalhePino(leadId: string | null) {
  return useQuery({ queryKey: ['pinos', 'detalhe', leadId], queryFn: () => getDetalhePino(leadId!), enabled: !!leadId });
}

/** Pinos do consultor (§34.4): mesma paginação; precisa de sinal (não fica no aparelho). */
export function useMapaPinosCampo(ligado: boolean) {
  return useQuery({
    queryKey: ['campo', 'pinos'],
    enabled: ligado,
    queryFn: async () => {
      const paginas: PinosPagina[] = [];
      let cursor: string | undefined;
      let carregados = 0;
      do {
        const p = await getPinosCampoPagina(cursor);
        paginas.push(p);
        carregados += p.pins.length;
        cursor = p.next_cursor ?? undefined;
      } while (cursor && carregados < MAX_PINOS_NA_TELA);
      return juntarPaginas(paginas);
    },
    staleTime: 60_000,
    retry: 1,
  });
}
