'use client';

import { useEffect } from 'react';
import { pontoDeTrilhaUtil } from '../domain/fila-politica';
import { lerPosicao } from '../infrastructure/gps';
import { enfileirar } from './use-fila';

const CINCO_MIN = 5 * 60_000;

/**
 * Trilha a cada 5 min ENQUANTO a página está aberta e a jornada está aberta
 * (spec §2.2 e §11): com a tela apagada o navegador para, e antes de "Iniciar"
 * ou depois de "Encerrar" nada é coletado. Precisão pior que 100 m é descartada.
 */
export function useRastreio(ativo: boolean, consultantId: string | null): void {
  useEffect(() => {
    if (!ativo || !consultantId) return;
    // Leitura de GPS em voo quando a jornada acaba não pode enfileirar o ponto.
    let cancelado = false;
    const relogio = window.setInterval(async () => {
      try {
        const p = await lerPosicao(15_000);
        if (cancelado || !pontoDeTrilhaUtil(p.accuracy)) return;
        await enfileirar({ kind: 'points', payload: { points: [{ client_id: crypto.randomUUID(), ...p }] } }, consultantId);
      } catch {
        // GPS falhou nesta volta: a próxima tenta de novo.
      }
    }, CINCO_MIN);
    return () => {
      cancelado = true;
      window.clearInterval(relogio);
    };
  }, [ativo, consultantId]);
}
