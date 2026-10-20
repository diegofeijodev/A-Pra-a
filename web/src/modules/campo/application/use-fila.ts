'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { AcaoFila, ItemFila } from '../domain/campo.types';
import { todaySp } from '@/lib/dates';
import { planejarRascunho } from '../domain/fila-politica';
import { faltando } from '../domain/questionario';
import { getCampoSession } from '../infrastructure/campo-session.storage';
import { enviarItem } from '../infrastructure/fila';
import { adicionarNaFila, atualizarSeExistir, listarFila, removerDaFila, reposicionar } from '../infrastructure/fila-idb';
import { drenarCom } from './fila-motor';

interface FilaState {
  /** Itens do consultor logado ainda no aparelho (a faixa e o dia local leem daqui). */
  itens: ItemFila[];
  erros: { id: number; texto: string }[];
  pausada: boolean;
  setItens: (itens: ItemFila[]) => void;
  addErro: (texto: string) => void;
  removerErro: (id: number) => void;
  setPausada: (pausada: boolean) => void;
}

let proximoErro = 1;

export const useFilaStore = create<FilaState>((set) => ({
  itens: [],
  erros: [],
  pausada: false,
  setItens: (itens) => set({ itens }),
  addErro: (texto) => set((s) => ({ erros: [...s.erros, { id: proximoErro++, texto }] })),
  removerErro: (id) => set((s) => ({ erros: s.erros.filter((e) => e.id !== id) })),
  setPausada: (pausada) => set({ pausada }),
}));

async function recarregar(): Promise<void> {
  const consultor = getCampoSession()?.consultant.id;
  const itens = consultor ? (await listarFila()).filter((i) => i.consultant_id === consultor) : [];
  useFilaStore.getState().setItens(itens);
}

let aoEnviar: (() => Promise<void>) | null = null;
let drenando: Promise<void> | null = null;

/** Uma drenagem por vez; quem chamar no meio recebe a que já está andando. */
export function drenar(): Promise<void> {
  if (drenando) return drenando;
  const loja = useFilaStore.getState();
  drenando = drenarCom({
    listar: listarFila,
    remover: removerDaFila,
    atualizar: atualizarSeExistir,
    enviar: enviarItem,
    consultorAtual: () => getCampoSession()?.consultant.id ?? null,
    online: () => navigator.onLine,
    agora: () => Date.now(),
    // Primeiro o `/today` novo, DEPOIS o item sai da lista local: senão a tela
    // pisca "Pronto para sair?" e convida a um segundo toque (409).
    aoEnviar: async () => {
      try {
        await aoEnviar?.();
      } catch {
        // Sem retrato novo agora: o intervalo de 60 s repete.
      }
      await recarregar();
    },
    aoRecusar: (mensagem) => loja.addErro(mensagem),
    aoPausar: (pausada) => loja.setPausada(pausada),
  })
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      drenando = null;
      void recarregar();
    });
  return drenando;
}

/** Toda ação do consultor passa por aqui — com sinal, sai na hora; sem sinal, espera. */
export async function enfileirar(
  acao: AcaoFila,
  consultantId: string,
  /**
   * `completo`: o rascunho está completo? (o fluxo simples decide por `faltandoSimples`; sem isso vale o `faltando` do
   * completo). `segurarMs`: o item espera na cabeça da fila (desfazer do checkout simples, contrato §31.7).
   */
  opcoes: { completo?: boolean; segurarMs?: number } = {},
): Promise<void> {
  const info = { consultant_id: consultantId, tentativas: 0, proxima_em: 0, criado_em: Date.now() };
  if (acao.kind === 'answers') {
    const completo = opcoes.completo ?? faltando(acao.payload, todaySp()).length === 0;
    // Atômico: troca do rascunho + checkout (e o que vinha atrás dele) numa transação só.
    await reposicionar(consultantId, (fila) => planejarRascunho(fila, acao, info, completo));
  } else {
    await adicionarNaFila({ ...acao, ...info, ...(opcoes.segurarMs ? { segurar_ate: Date.now() + opcoes.segurarMs } : {}) });
  }
  await recarregar();
  // Duas voltas: se uma drenagem já estava terminando, a segunda pega o item novo.
  void drenar().then(() => drenar());
  // O item seguro sai logo depois de liberado (sem esperar o relógio de 15 s).
  if (opcoes.segurarMs) window.setTimeout(() => void drenar(), opcoes.segurarMs + 300);
}

/**
 * "Desfazer" (contrato §31.7): tira da fila o checkout desta visita que ainda está seguro. Devolve `false` se ele
 * já saiu (ou não existe) — aí não há o que desfazer.
 */
export async function desfazerCheckout(ref: string, consultantId: string): Promise<boolean> {
  const alvo = (await listarFila()).find(
    (i) => i.consultant_id === consultantId && i.kind === 'checkout' && i.visit_ref === ref && (i.segurar_ate ?? 0) > Date.now(),
  );
  if (!alvo) return false;
  await removerDaFila(alvo.seq as number);
  await recarregar();
  return true;
}

async function zerarEspera(consultantId: string): Promise<void> {
  try {
    for (const i of await listarFila()) {
      if (i.consultant_id === consultantId && i.proxima_em > 0) await atualizarSeExistir({ ...i, proxima_em: 0 });
    }
  } catch {
    // IndexedDB indisponível agora: a drenagem normal tenta de novo.
  }
}

/** "Descartar este checkout": a visita fica aberta até o fechamento da meia-noite. */
export async function descartar(seq: number): Promise<void> {
  await removerDaFila(seq);
  await recarregar();
  void drenar();
}

/** "Descartar este envio": remove o item parado e o que dependia dele (seqs vindos de `seqsParaDescartar`). */
export async function descartarEnvio(seqs: number[]): Promise<void> {
  for (const seq of seqs) await removerDaFila(seq);
  await recarregar();
  void drenar();
}

/** Montado uma vez, no layout das telas do consultor. */
export function useFilaRunner(consultantId: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!consultantId) return;
    aoEnviar = async () => {
      // O roteiro entra no mesmo respiro: a resposta do servidor substitui a ordem local.
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['campo', 'today'] }),
        queryClient.refetchQueries({ queryKey: ['campo', 'route'] }),
      ]);
    };
    void recarregar();
    void drenar();
    // Voltou o sinal: zera a espera crescente e tenta já (spec §9).
    const aoVoltarOSinal = () => void zerarEspera(consultantId).then(drenar);
    window.addEventListener('online', aoVoltarOSinal);
    const relogio = window.setInterval(() => void drenar(), 15_000);
    return () => {
      window.removeEventListener('online', aoVoltarOSinal);
      window.clearInterval(relogio);
      aoEnviar = null;
    };
  }, [consultantId, queryClient]);
}
