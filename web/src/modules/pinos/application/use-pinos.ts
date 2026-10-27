'use client';

import { useQuery } from '@tanstack/react-query';
import { juntarPaginas, MAX_PINOS_NA_TELA, type ModoMapa, type PinosPagina } from '../domain/pinos';
import { getDetalhePino, getListaCampo, getPinosCampoPagina, getPinosPagina } from '../infrastructure/pinos.api';

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

/**
 * Lista do representante (§34.7). Só com a trava do mapa ligada (`features.map_pins` do `/me`, nunca sondando a rota) e com sinal:
 * não fica no aparelho. A busca só vai ao servidor com 2+ letras (a mesma regra da API).
 */
export function useListaCampo(q: { codes: string[]; q: string; cursor?: string }, ligado: boolean) {
  const busca = q.q.trim().length >= 2 ? q.q.trim() : '';
  return useQuery({
    queryKey: ['campo', 'lista', q.codes.join(','), busca, q.cursor ?? ''],
    queryFn: () => getListaCampo({ codes: q.codes, q: busca, cursor: q.cursor, limit: 100 }),
    enabled: ligado,
    staleTime: 60_000,
    retry: 1,
  });
}
