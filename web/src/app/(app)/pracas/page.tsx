'use client';

import { MapPin, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AberturaPraca } from '@/components/praca/AberturaPraca';
import { NovaPracaDialog } from '@/components/praca/NovaPracaDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { rotaDaPraca } from '@/modules/acesso/domain/enderecos';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { cidadeUf, linhaClientes, ROTULO_SITUACAO_PRACA, situacaoDaPraca } from '@/modules/pracas/domain/status-praca';

/**
 * Praças (Lovable `pracas.index.tsx`, UX §4.2, arquitetura §5 E5.2): cartões com nome, Cidade/UF, a situação (pelas datas, no dia de
 * Brasília) e "N clientes" (`leads_count`, G2). Cada cartão abre o detalhe. "Nova praça" no diálogo da Lovable; o caminho com o mapa
 * da região (`AberturaPraca`) fica no link do diálogo.
 */
export default function PracasPage() {
  const router = useRouter();
  const { data, isPending, isError, refetch } = usePracas();
  const [novo, setNovo] = useState(false);
  const [comMapa, setComMapa] = useState(false);
  const hoje = todaySp();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Praças</h1>
        <Button onClick={() => setNovo(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Nova praça
        </Button>
      </div>

      {isError ? (
        <div className="space-y-2 rounded-2xl bg-card p-5 shadow-card">
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as praças.
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : isPending ? (
        <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="space-y-3">
          <p className="text-muted-foreground">Nenhuma praça criada ainda.</p>
          <Button onClick={() => setNovo(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Nova praça
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Link
              key={p.id}
              href={rotaDaPraca(p.id)}
              className="rounded-2xl bg-card p-6 shadow-card transition hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <MapPin className="mb-3 h-5 w-5 text-primary" aria-hidden />
              <div className="break-words text-lg font-semibold">{p.name}</div>
              <div className="text-sm text-muted-foreground">{cidadeUf(p)}</div>
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <Badge variant="secondary">{ROTULO_SITUACAO_PRACA[situacaoDaPraca(p, hoje)]}</Badge>
                <span>{linhaClientes(p)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {novo && (
        <NovaPracaDialog
          aberto
          onFechar={() => setNovo(false)}
          onCriada={(p) => router.push(rotaDaPraca(p.id))}
          onComMapa={() => setComMapa(true)}
        />
      )}
      {comMapa && <AberturaPraca onClose={() => setComMapa(false)} />}
    </div>
  );
}
