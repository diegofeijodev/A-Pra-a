'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ConsultorDialog } from '@/components/praca/ConsultorDialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/modules/auth/application/use-auth';
import { hora } from '@/modules/campo/domain/formatos';
import { useConsultores } from '@/modules/consultores/application/use-consultores';

const SITUACAO = { em_jornada: 'em jornada agora', encerrou: 'encerrou', nao_iniciou: 'não começou' } as const;
export default function ConsultoresPage() {
  const { user } = useAuth();
  const { data: consultores, isPending } = useConsultores();
  const [novo, setNovo] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">Consultores de campo</h1>
        {user?.is_admin && <Button onClick={() => setNovo(true)}>Novo consultor</Button>}
      </div>
      {isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : !consultores?.length ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum consultor ainda.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {consultores.map((c) => (
            <li key={c.id} className={`card-surface p-4 ${c.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/consultores/${c.id}`} className="font-bold hover:underline">
                  {c.name}
                </Link>
                <span className="text-xs text-muted-foreground">{c.active ? SITUACAO[c.today.status] : 'desativado'}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.praca_name} · {c.today.visits} visitas hoje · {c.today.cadastros} cadastrou agora · último ponto {c.today.last_point_at ? hora(c.today.last_point_at) : '—'}
              </p>
              <p className="mt-1 text-xs">
                {c.freela_code ? `Código Freela: ${c.freela_code}` : `Código pendente${c.freela_sync_error ? ` — ${c.freela_sync_error}` : ''}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {novo && <ConsultorDialog aberto onFechar={() => setNovo(false)} />}
    </>
  );
}
