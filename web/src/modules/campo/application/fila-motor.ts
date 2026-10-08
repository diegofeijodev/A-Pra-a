import axios from 'axios';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import type { ItemFila } from '../domain/campo.types';
import { classificar, proximaTentativa } from '../domain/fila-politica';

/** Tudo o que o motor toca, injetado — é o que deixa a fila testável sem IndexedDB nem rede. */
export interface DepsMotor {
  listar: () => Promise<ItemFila[]>;
  remover: (seq: number) => Promise<void>;
  /** Regrava o item SÓ se ele ainda existir (um rascunho novo pode tê-lo substituído no meio do envio). */
  atualizar: (item: ItemFila) => Promise<void>;
  enviar: (item: ItemFila) => Promise<void>;
  consultorAtual: () => string | null;
  online: () => boolean;
  agora: () => number;
  aoEnviar: (item: ItemFila) => void;
  aoRecusar: (mensagem: string) => void;
  aoPausar: (pausada: boolean) => void;
}

export type ResultadoDrenagem = 'vazia' | 'esperando' | 'offline' | 'sessao' | 'sem_sessao';

function lerFalha(e: unknown): { status?: number; code?: string } {
  if (!axios.isAxiosError(e)) return {};
  const corpo = e.response?.data as { error?: { code?: string } } | undefined;
  return { status: e.response?.status, code: corpo?.error?.code };
}

/**
 * Envia a fila do consultor logado EM ORDEM (spec §9). Para no primeiro item
 * que não saiu: a ordem importa (o checkout não pode passar na frente do check-in).
 */
export async function drenarCom(d: DepsMotor): Promise<ResultadoDrenagem> {
  const consultor = d.consultorAtual();
  if (!consultor) return 'sem_sessao';
  for (;;) {
    if (!d.online()) return 'offline';
    const cabeca = (await d.listar()).find((i) => i.consultant_id === consultor);
    if (!cabeca) return 'vazia';
    if (cabeca.proxima_em > d.agora()) return 'esperando';

    let falha: unknown = null;
    try {
      await d.enviar(cabeca);
    } catch (e) {
      falha = e;
    }
    const { status, code } = falha ? lerFalha(falha) : { status: 200, code: undefined };
    const desfecho = classificar(status, code);

    if (desfecho === 'ok' || desfecho === 'regra') {
      await d.remover(cabeca.seq as number);
      if (desfecho === 'regra') d.aoRecusar(apiErrorMessage(falha, 'Um envio foi recusado pelo servidor.'));
      d.aoPausar(false);
      d.aoEnviar(cabeca);
      continue;
    }
    if (desfecho === 'sessao') {
      // Nada é apagado nem conta tentativa: o axios do campo já mandou para
      // /campo/entrar, e depois do login a fila sai com o token novo.
      d.aoPausar(true);
      return 'sessao';
    }
    await d.atualizar({
      ...cabeca,
      tentativas: cabeca.tentativas + 1,
      proxima_em: proximaTentativa(cabeca.tentativas, d.agora()),
    });
    return 'esperando';
  }
}
