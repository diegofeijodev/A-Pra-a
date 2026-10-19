import type { StopView } from './rota.schema';

export interface ItemOrdem {
  id: string;
  fixa: boolean;
}

/** Pendentes na ordem do `seq` — é o que a equipe reordena (`PUT /v1/routes/:id/order`). */
export function pendentesParaOrdenar(stops: StopView[]): ItemOrdem[] {
  return [...stops]
    .filter((s) => s.status === 'pendente')
    .sort((a, b) => a.seq - b.seq)
    .map((s) => ({ id: s.id, fixa: s.fixa }));
}

/** Troca a posição de `indice` com a vizinha (`-1` sobe, `+1` desce). Fora dos limites não muda nada. */
export function mover(lista: ItemOrdem[], indice: number, delta: -1 | 1): ItemOrdem[] {
  const alvo = indice + delta;
  if (indice < 0 || alvo < 0 || indice >= lista.length || alvo >= lista.length) return lista;
  const nova = [...lista];
  [nova[indice], nova[alvo]] = [nova[alvo]!, nova[indice]!];
  return nova;
}

export function alternarFixa(lista: ItemOrdem[], id: string): ItemOrdem[] {
  return lista.map((i) => (i.id === id ? { ...i, fixa: !i.fixa } : i));
}

export const mudou = (a: ItemOrdem[], b: ItemOrdem[]): boolean =>
  a.length !== b.length || a.some((x, i) => x.id !== b[i]!.id || x.fixa !== b[i]!.fixa);

/** "Bruno ficou com 28 paradas (faltam 2)": a conta fica à mostra. */
export function resumoDaMeta(p: { planned: number; reserve: number; fits_meta: boolean; not_fit: number }, meta: number, feitas: number): string {
  const total = p.planned + feitas;
  if (p.fits_meta) return `${total} paradas planejadas (meta ${meta}); ${p.reserve} de reserva.`;
  return `${total} paradas planejadas, faltam ${meta - total} para a meta de ${meta}. Rode uma busca na área ou aceite ${total}.`;
}
