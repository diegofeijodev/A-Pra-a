'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todaySp } from '@/lib/dates';
import { useAtribuirItem } from '@/modules/planos/application/use-planos';
import { diaCurto, formatarDuracao, km, textoPublicada, type PlanItem, type PlanSummary } from '@/modules/planos/domain/planos';
import { codigoDoErro } from '@/modules/planos/infrastructure/planos.api';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

interface Consultor {
  id: string;
  name: string;
}

/**
 * Cartão de uma rota do plano (UX §3.4): bairro principal, distância do centro, paradas, percurso, modo e as DUAS contas
 * (a da Lovable e a do nosso relógio, que vale depois de publicada). Publicar = consultor + dia (2 escolhas) e 1 toque; o
 * conflito "um roteiro por dia" mostra as 2 saídas.
 */
export function RotaPlanoCard({ plano, item, admin, consultores }: { plano: PlanSummary; item: PlanItem; admin: boolean; consultores: Consultor[] }) {
  const atribuir = useAtribuirItem();
  const [consultor, setConsultor] = useState('');
  const [dia, setDia] = useState('');
  const [conflito, setConflito] = useState<string | null>(null);
  const hoje = todaySp();
  const nome = consultores.find((c) => c.id === consultor)?.name ?? '';
  const modo = plano.travel_mode === 'a_pe' ? 'A pé' : 'Carro/moto';

  function publicar(trocar = false) {
    atribuir.mutate(
      { planId: plano.id, itemId: item.id, consultant_id: consultor, day: dia, confirm_replace: trocar },
      {
        onSuccess: (r) => {
          setConflito(null);
          toast.success(textoPublicada(item.name, nome, dia) + (r.dropped ? ` ${r.dropped} estabelecimento(s) saíram (arquivados ou sem localização).` : ''));
        },
        onError: (e) => {
          if (codigoDoErro(e) === 'ROUTE_EXISTS') setConflito(apiErrorMessage(e, 'Este consultor já tem roteiro nesse dia.'));
          else toast.error(apiErrorMessage(e, 'Não conseguimos publicar a rota. A escolha continua aqui.'));
        },
      },
    );
  }

  return (
    <section className="card-surface space-y-3 p-4" aria-label={item.name}>
      <h3 className="flex items-center gap-2 text-base font-bold">
        <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: item.color }} />
        {item.name}
      </h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline text-muted-foreground">{plano.kind === 'shopping_interno' ? 'Shopping: ' : 'Bairro principal: '}</dt>
          <dd className="inline font-semibold">{item.bairro_principal ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Do centro da praça: </dt>
          <dd className="inline font-semibold">{item.do_centro_m == null ? '—' : `${km(item.do_centro_m)} km`}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Paradas: </dt>
          <dd className="inline font-semibold">{item.lead_ids.length}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Percurso em linha reta: </dt>
          <dd className="inline font-semibold">{km(item.distance_m)} km</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Modo: </dt>
          <dd className="inline font-semibold">{modo}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Tempo previsto (conta da Lovable): </dt>
          <dd className="inline font-semibold">{formatarDuracao(item.conta_lovable.minutos)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">= {item.conta_lovable.texto}</p>
      <p className="text-sm">
        <span className="font-semibold">No nosso relógio (vale depois de publicada):</span> {item.conta_roteiro.texto}
      </p>
      {item.stops.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-12 cursor-pointer py-3 font-semibold">Estabelecimentos a visitar ({item.stops.length})</summary>
          <ol className="list-decimal space-y-1 pl-6">
            {item.stops.map((s) => (
              <li key={s.lead_id}>
                {s.name} <span className="text-muted-foreground">— {s.address || 'sem endereço'}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {item.assigned ? (
        <p className="text-sm font-semibold" role="status">
          ✓ Publicada para {item.assigned.consultant_name ?? 'o consultor'}
          {item.assigned.day ? ` em ${diaCurto(item.assigned.day)}` : ''}
        </p>
      ) : admin ? (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor={`cons-${item.id}`}>Consultor</Label>
              <select
                id={`cons-${item.id}`}
                value={consultor}
                onChange={(e) => {
                  setConsultor(e.target.value);
                  setConflito(null);
                }}
                className="h-12 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Escolha o consultor</option>
                {consultores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`dia-${item.id}`}>Dia</Label>
              <Input
                id={`dia-${item.id}`}
                type="date"
                min={hoje}
                value={dia}
                onChange={(e) => {
                  setDia(e.target.value);
                  setConflito(null);
                }}
                className="h-12"
              />
            </div>
            <Button className="h-12" disabled={!consultor || !dia || atribuir.isPending} onClick={() => publicar(false)}>
              {atribuir.isPending ? 'Publicando…' : 'Publicar'}
            </Button>
          </div>
          {conflito && (
            <div role="alert" className="space-y-2 rounded-md border border-warning p-3 text-sm">
              <p>{conflito}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="h-12" disabled={atribuir.isPending} onClick={() => publicar(true)}>
                  Trocar pela {item.name}
                </Button>
                <Button
                  variant="ghost"
                  className="h-12"
                  onClick={() => {
                    setConflito(null);
                    setDia('');
                    document.getElementById(`dia-${item.id}`)?.focus();
                  }}
                >
                  Escolher outro dia
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ainda não publicada.</p>
      )}
    </section>
  );
}
