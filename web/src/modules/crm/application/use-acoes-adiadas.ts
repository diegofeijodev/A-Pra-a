'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { criarFilaAdiada } from '../domain/tarefas';

/**
 * "Feito"/"Adiar" com Desfazer (UX §3.1.5, desenho A14): nada vai ao servidor por 5 s. A tela mostra a confirmação com "Desfazer";
 * passado o prazo o pedido sai — deu certo, a linha some (e a lista é relida pela mutação); falhou, a linha volta com a mensagem do
 * servidor e "Tentar de novo". Saiu da tela antes dos 5 s: manda na desmontagem; fechou a aba: manda no `pagehide` com `keepalive`.
 * Serve a Tarefas e à fila da Entrada (Task 23): `M` é o que a linha mostra enquanto espera.
 */
export type SituacaoAdiada<M> =
  | { tipo: 'pendente'; meta: M }
  | { tipo: 'enviando'; meta: M }
  | { tipo: 'erro'; mensagem: string; meta: M };

export interface AcaoAdiada<M> {
  meta: M;
  /** `urgente` = a aba está fechando: use a chamada com `keepalive`, não a mutação. */
  enviar: (urgente: boolean) => Promise<unknown>;
}

export function useAcoesAdiadas<M>({ antesDeSumir }: { antesDeSumir?: (chave: string) => void } = {}) {
  const [fila] = useState(() => criarFilaAdiada());
  const [situacoes, setSituacoes] = useState<ReadonlyMap<string, SituacaoAdiada<M>>>(() => new Map());
  // Linhas já gravadas: somem na hora, antes da releitura chegar (e voltam se a regra ainda casar num outro grupo: a chave é por grupo).
  const [feitas, setFeitas] = useState<ReadonlySet<string>>(() => new Set());
  const acoes = useRef(new Map<string, AcaoAdiada<M>>());
  const antesRef = useRef(antesDeSumir);
  antesRef.current = antesDeSumir;

  const mudar = useCallback((chave: string, s: SituacaoAdiada<M> | null) => {
    setSituacoes((prev) => {
      const m = new Map(prev);
      if (s) m.set(chave, s);
      else m.delete(chave);
      return m;
    });
  }, []);

  const enviar = useCallback(
    (chave: string, urgente: boolean) => {
      const acao = acoes.current.get(chave);
      if (!acao) return;
      mudar(chave, { tipo: 'enviando', meta: acao.meta });
      acao.enviar(urgente).then(
        () => {
          antesRef.current?.(chave);
          acoes.current.delete(chave);
          setFeitas((prev) => new Set(prev).add(chave));
          mudar(chave, null);
        },
        (e: unknown) => mudar(chave, { tipo: 'erro', mensagem: apiErrorMessage(e, 'Não deu para gravar. Tente de novo.'), meta: acao.meta }),
      );
    },
    [mudar],
  );

  const agendar = useCallback(
    (chave: string, acao: AcaoAdiada<M>) => {
      acoes.current.set(chave, acao);
      mudar(chave, { tipo: 'pendente', meta: acao.meta });
      fila.agendar(chave, (urgente) => enviar(chave, urgente));
    },
    [fila, enviar, mudar],
  );

  /** `true` se deu para desfazer (ainda não tinha saído). */
  const desfazer = useCallback(
    (chave: string) => {
      if (!fila.desfazer(chave)) return false;
      acoes.current.delete(chave);
      mudar(chave, null);
      return true;
    },
    [fila, mudar],
  );

  const enviarAgora = useCallback((chave: string) => fila.enviarAgora(chave), [fila]);
  const tentarDeNovo = useCallback((chave: string) => enviar(chave, false), [enviar]);

  /** Depois de uma releitura: esquece as linhas gravadas e os erros de linhas que não vieram mais (as que esperam ficam). */
  const esquecerAusentes = useCallback((presentes: ReadonlySet<string>) => {
    setFeitas((prev) => {
      const fica = [...prev].filter((c) => presentes.has(c));
      return fica.length === prev.size ? prev : new Set(fica);
    });
    setSituacoes((prev) => {
      const sai = [...prev].filter(([c, s]) => s.tipo === 'erro' && !presentes.has(c));
      if (sai.length === 0) return prev;
      const m = new Map(prev);
      for (const [c] of sai) m.delete(c);
      return m;
    });
  }, []);

  useEffect(() => {
    const aoFecharAba = () => fila.enviarTodas(true);
    window.addEventListener('pagehide', aoFecharAba);
    return () => {
      window.removeEventListener('pagehide', aoFecharAba);
      // Saiu da tela (navegação dentro do app): manda o que estava esperando, sem `keepalive` (a página continua viva).
      fila.enviarTodas(false);
    };
  }, [fila]);

  const esperando = [...situacoes.values()].filter((s) => s.tipo !== 'erro').length;
  return {
    situacao: (chave: string): SituacaoAdiada<M> | undefined => situacoes.get(chave),
    feitas,
    /** Linhas esperando o prazo ou gravando: a releitura automática espera (UX §3.1.5). */
    esperando,
    agendar,
    desfazer,
    enviarAgora,
    tentarDeNovo,
    esquecerAusentes,
  };
}
