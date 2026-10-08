'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { AcaoFila, ItemFila } from '../domain/campo.types';
import { planejarRascunho } from '../domain/fila-politica';
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
export async function enfileirar(acao: AcaoFila, consultantId: string): Promise<void> {
  const info = { consultant_id: consultantId, tentativas: 0, proxima_em: 0, criado_em: Date.now() };
  if (acao.kind === 'answers') {
    // Atômico: troca do rascunho + checkout (e o que vinha atrás dele) numa transação só.
    await reposicionar(consultantId, (fila) => planejarRascunho(fila, acao, info));
  } else {
    await adicionarNaFila({ ...acao, ...info });
  }
  await recarregar();
  // Duas voltas: se uma drenagem já estava terminando, a segunda pega o item novo.
  void drenar().then(() => drenar());
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

/** Montado uma vez, no layout das telas do consultor. */
export function useFilaRunner(consultantId: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!consultantId) return;
    aoEnviar = () => queryClient.refetchQueries({ queryKey: ['campo', 'today'] });
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
