'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { TrocarSenhaCartao } from '@/components/entrada/TrocarSenhaCartao';
import { ROTA_CAMPO } from '@/modules/acesso/domain/enderecos';
import { politicaSchema } from '@/modules/acesso/domain/senha';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { campoApi } from '@/modules/campo/infrastructure/campo-http';

/**
 * Troca de senha do consultor — a obrigatória do 1º acesso (spec §2.4) e a voluntária — no cartão da Lovable (UX §3.2). Fica fora da
 * guarda de `(sessao)` e DENTRO de `/campo` (escopo do atalho instalado, arquitetura §3.4). `POST /v1/campo/auth/change-password`
 * devolve um token novo (o anterior, da senha provisória, morre).
 */
export default function SenhaCampoPage() {
  const router = useRouter();
  const session = useCampoSession((s) => s.session);
  const hydrated = useCampoSession((s) => s.hydrated);
  const hydrate = useCampoSession((s) => s.hydrate);
  const trocarSenha = useCampoSession((s) => s.trocarSenha);
  // Lote E §41.2: a regra da senha NOVA, marcada enquanto digita. `GET /v1/password-policy` é público e responde 200 sempre
  // (desligada = `{ enabled: false }`).
  const politica = useQuery({
    queryKey: ['senha', 'politica', 'campo'],
    queryFn: async () => politicaSchema.parse((await campoApi.get('/v1/password-policy')).data),
    staleTime: 5 * 60_000,
    enabled: !!session,
    retry: 1,
  });

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (hydrated && !session) router.replace(ROTA_CAMPO.entrar);
  }, [hydrated, session, router]);

  if (!hydrated || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Carregando">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  return (
    <TrocarSenhaCartao
      obrigatoria={session.consultant.must_change_password}
      politica={politica.data}
      voltarPara={ROTA_CAMPO.inicio}
      onSalvar={trocarSenha}
      onPronto={() => router.replace(ROTA_CAMPO.inicio)}
    />
  );
}
