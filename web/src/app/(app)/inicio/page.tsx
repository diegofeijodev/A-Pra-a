'use client';

import Link from 'next/link';
import { CartaoComercialHoje } from '@/components/crm/CartaoComercialHoje';
import { AtencaoAgora } from '@/components/praca/EquipeAtencao';
import { PainelGestor } from '@/components/praca/PainelGestor';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';

/**
 * Dashboard (Lovable `inicio.tsx`): a página inicial da equipe. Com `FIELD_DASHBOARD_ENABLED` é o `PainelGestor`; sem ele, o
 * cabeçalho da Lovable, o aviso e a "Atenção agora" (rota sempre ligada, §25.3), para a equipe ter onde cair (arquitetura §2.3).
 * O desenho fino dos cartões chega na E5.
 */
export default function PainelPage() {
  const { features, carregando } = useFeaturesMenu();
  const { user } = useAuth();
  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (features.dashboard) return <PainelGestor />;
  const primeiroNome = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-semibold">Olá{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
        <p className="mt-1 text-muted-foreground">O Dashboard ainda não está ligado neste servidor.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={ROTA.pracas} className="inline-flex min-h-11 items-center rounded-md bg-secondary px-4 text-sm font-semibold text-secondary-foreground md:min-h-9">
            Ver as praças
          </Link>
          {features.routes && (
            <Link href={ROTA.rotas} className="inline-flex min-h-11 items-center rounded-md bg-secondary px-4 text-sm font-semibold text-secondary-foreground md:min-h-9">
              Ver as rotas
            </Link>
          )}
        </div>
      </header>
      <AtencaoAgora />
      <CartaoComercialHoje pracaId={null} />
    </div>
  );
}
