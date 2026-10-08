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
      req.onsuccess = () => {
        const db = req.result;
        // iOS derruba a conexão ao ir para segundo plano; sem isso a fila ficaria presa numa conexão morta.
        const esquecer = () => {
          aberto = null;
        };
        db.onclose = esquecer;
        db.onversionchange = () => {
          esquecer();
          db.close();
        };
        resolve(db);
      };
      req.onerror = () => {
        aberto = null;
        reject(req.error);
      };
    });
  }
  return aberto;
}

async function loja(modo: IDBTransactionMode): Promise<{ s: IDBObjectStore; fim: Promise<void> }> {
  let tx: IDBTransaction;
  try {
    tx = (await abrir()).transaction(LOJA, modo);
  } catch {
    // Conexão morta (iOS ao voltar do segundo plano): reabre uma vez.
    aberto = null;
    tx = (await abrir()).transaction(LOJA, modo);
  }
  const fim = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  fim.catch(() => undefined);
  return { s: tx.objectStore(LOJA), fim };
}

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Escrita só vale quando a TRANSAÇÃO fecha (`oncomplete`), não quando o pedido responde. */
async function escrever<T>(acao: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const { s, fim } = await loja('readwrite');
  const r = await pedido(acao(s));
  await fim;
  return r;
}

export async function listarFila(): Promise<ItemFila[]> {
  const { s } = await loja('readonly');
  return pedido(s.getAll() as IDBRequest<ItemFila[]>);
}

export async function adicionarNaFila(item: ItemFila): Promise<number> {
  return Number(await escrever((s) => s.add(item)));
}

export async function removerDaFila(seq: number): Promise<void> {
  await escrever((s) => s.delete(seq));
}

/** `get` + `put` na MESMA transação, em callbacks (o Safari fecha a transação entre `await`s). */
export async function atualizarSeExistir(item: ItemFila): Promise<void> {
  const { s, fim } = await loja('readwrite');
  await new Promise<void>((resolve, reject) => {
    const g = s.get(item.seq as number);
    g.onsuccess = () => {
      if (g.result) s.put(item).onerror = () => reject(s.transaction.error);
      resolve();
    };
    g.onerror = () => reject(g.error);
  });
  await fim;
}
