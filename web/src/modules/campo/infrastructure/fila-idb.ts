/**
 * Fila offline no IndexedDB (spec §9) — wrapper mínimo, sem biblioteca. A chave
 * `seq` é autoincremento: é ela que dá a ordem de envio. O arquivo da foto do
 * check-in vai junto, como Blob.
 */
import type { ItemFila } from '../domain/campo.types';

const BANCO = 'praca-campo';
const LOJA = 'fila';
const VERSAO = 1;

let aberto: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!aberto) {
    aberto = new Promise((resolve, reject) => {
      const req = indexedDB.open(BANCO, VERSAO);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(LOJA)) {
          req.result.createObjectStore(LOJA, { keyPath: 'seq', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        aberto = null;
        reject(req.error);
      };
    });
  }
  return aberto;
}

async function loja(modo: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await abrir()).transaction(LOJA, modo).objectStore(LOJA);
}

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function listarFila(): Promise<ItemFila[]> {
  return pedido((await loja('readonly')).getAll() as IDBRequest<ItemFila[]>);
}

export async function adicionarNaFila(item: ItemFila): Promise<number> {
  return Number(await pedido((await loja('readwrite')).add(item)));
}

export async function removerDaFila(seq: number): Promise<void> {
  await pedido((await loja('readwrite')).delete(seq));
}

/** `get` + `put` na MESMA transação, em callbacks (o Safari fecha a transação entre `await`s). */
export async function atualizarSeExistir(item: ItemFila): Promise<void> {
  const s = await loja('readwrite');
  await new Promise<void>((resolve, reject) => {
    const g = s.get(item.seq as number);
    g.onsuccess = () => {
      if (!g.result) return resolve();
      const p = s.put(item);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    };
    g.onerror = () => reject(g.error);
  });
}
