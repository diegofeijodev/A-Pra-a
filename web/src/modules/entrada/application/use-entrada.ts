'use client';

import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useCallback } from 'react';
import { useAuthStore } from '@/modules/auth/application/auth.store';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import type { CampoSession } from '@/modules/campo/domain/campo.types';
import { paginaInicial } from '@/modules/acesso/domain/acesso';
import { decidirEntrada, destinoDoCampo, type Tentativa } from '../domain/entrada';

/** O erro do axios como a regra lê: status (ou `null` sem resposta), código e mensagem do `{ error: { code, message } }`. */
export function tentativaDoErro(e: unknown): Tentativa {
  if (axios.isAxiosError(e)) {
    if (!e.response) return { ok: false, status: null, code: null, message: null };
    const corpo = (e.response.data as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
    return {
      ok: false,
      status: e.response.status,
      code: typeof corpo?.code === 'string' ? corpo.code : null,
      message: typeof corpo?.message === 'string' ? corpo.message : null,
    };
  }
  return { ok: false, status: 0, code: null, message: e instanceof Error ? e.message : null };
}

export type ResultadoEntrada = { destino: string } | { erro: string };

/**
 * A entrada única (arquitetura §3.2): equipe primeiro; só no 401 o consultor. Cada sessão no seu storage (`authUser` x
 * `campoSession`): entrar numa conta APAGA a outra deste aparelho — a fila offline do consultor fica no IndexedDB (o `signOut` do
 * campo só leva a sessão e os retratos) — e o cache do React Query nunca passa de uma conta para a outra.
 */
export function useEntrada() {
  const queryClient = useQueryClient();
  const entrarNaEquipe = useAuthStore((s) => s.signIn);
  const entrarNoCampo = useCampoSession((s) => s.signIn);

  return useCallback(
    async (email: string, senha: string): Promise<ResultadoEntrada> => {
      let equipe: Tentativa;
      try {
        await entrarNaEquipe(email, senha);
        equipe = { ok: true };
      } catch (e) {
        equipe = tentativaDoErro(e);
      }
      let decisao = decidirEntrada(equipe);
      let doCampo: CampoSession | null = null;
      if ('tentarCampo' in decisao) {
        let campo: Tentativa;
        try {
          doCampo = await entrarNoCampo(email, senha);
          campo = { ok: true };
        } catch (e) {
          campo = tentativaDoErro(e);
        }
        decisao = decidirEntrada(equipe, campo);
      }
      if ('erro' in decisao) return { erro: decisao.erro };
      if ('tentarCampo' in decisao) return { erro: 'Não foi possível entrar.' }; // inalcançável: a 2ª chamada sempre decide

      await queryClient.cancelQueries();
      queryClient.clear();
      if (decisao.entra === 'equipe') {
        useCampoSession.getState().signOut();
        return { destino: paginaInicial() };
      }
      useAuthStore.getState().signOut();
      return { destino: destinoDoCampo(doCampo?.consultant.must_change_password ?? false) };
    },
    [entrarNaEquipe, entrarNoCampo, queryClient],
  );
}
