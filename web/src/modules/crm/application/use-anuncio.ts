'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * O texto da região `aria-live` da tela (UX §3.1.8), em Tarefas e na fila da Entrada. Limpa antes de escrever: o leitor de tela só lê de
 * novo quando o texto muda, e a mesma frase duas vezes seguidas ("Desfeito.") ficaria muda. O texto novo entra 100 ms depois de a região
 * ficar vazia (no mesmo quadro o React juntaria as duas mudanças numa só).
 */
export function useAnuncio(): [string, (texto: string) => void] {
  const [texto, setTexto] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anunciar = useCallback((novo: string) => {
    if (timer.current) clearTimeout(timer.current);
    setTexto('');
    timer.current = setTimeout(() => setTexto(novo), 100);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [texto, anunciar];
}
