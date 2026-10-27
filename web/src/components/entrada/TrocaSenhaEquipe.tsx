'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePoliticaSenha } from '@/modules/acesso/application/use-acesso';
import { paginaInicial } from '@/modules/acesso/domain/acesso';
import { ROTA, ROTA_CAMPO } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { trocarSenha } from '@/modules/auth/infrastructure/auth.api';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { TrocarSenhaCartao } from './TrocarSenhaCartao';

/**
 * `/trocar-senha` (arquitetura §3.3, §3.5): fora dos dois grupos, decide pela sessão. Equipe → a troca da própria conta
 * (`POST /v1/auth/change-password`, pede a atual); só o consultor → `/campo/senha` (a troca dele mora dentro de `/campo`, escopo do
 * atalho); ninguém → a entrada. Sem troca obrigatória para a equipe nesta leva (D2).
 */
export function TrocaSenhaEquipe() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const sessaoCampo = useCampoSession((s) => s.session);
  const campoPronto = useCampoSession((s) => s.hydrated);
  const hidratarCampo = useCampoSession((s) => s.hydrate);
  const politica = usePoliticaSenha(!!user);

  useEffect(() => {
    if (!campoPronto) hidratarCampo();
  }, [campoPronto, hidratarCampo]);

  useEffect(() => {
    if (loading || !campoPronto || user) return;
    router.replace(sessaoCampo ? ROTA_CAMPO.senha : ROTA.entrar);
  }, [loading, campoPronto, user, sessaoCampo, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Carregando">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  return (
    <TrocarSenhaCartao
      obrigatoria={false}
      politica={politica.data}
      voltarPara={paginaInicial()}
      onSalvar={trocarSenha}
      onPronto={() => router.replace(paginaInicial())}
    />
  );
}
