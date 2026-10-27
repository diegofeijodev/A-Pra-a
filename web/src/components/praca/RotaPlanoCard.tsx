'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { todaySp } from '@/lib/dates';
import { useAtribuirItem } from '@/modules/planos/application/use-planos';
import { diaCurto, formatarDuracao, km, textoPublicada, type PlanItem, type PlanSummary } from '@/modules/planos/domain/planos';
import { codigoDoErro } from '@/modules/planos/infrastructure/planos.api';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

interface Consultor {
  id: string;
  name: string;
}

interface Props {
  plano: PlanSummary;
  item: PlanItem;
  admin: boolean;
  consultores: Consultor[];
  /** Com a escolha (Lovable: tocar no cartão escolhe a rota e destaca no mapa), a lista dos clientes só aparece na escolhida. */
  escolhido?: boolean;
  onEscolher?: () => void;
}

/**
 * Cartão compacto de uma rota do plano (Lovable `rotas.tsx`, UX §4.6): bairro principal, do centro, paradas previstas, percurso,
 * modo e o tempo previsto pela conta da Lovable (`conta_lovable`, a nota de rodapé). Escolhido: os clientes a visitar e a nossa conta
 * ("No nosso relógio", que vale depois de publicada). Publicar = representante + dia + [Publicar] explícito: publicar monta o roteiro
 * do dia e pode trocar o de outra rota (`ROUTE_EXISTS`), por isso não grava ao mudar como a Lovable [desvio: prevenção de erro].
 */
export function RotaPlanoCard({ plano, item, admin, consultores, escolhido, onEscolher }: Props) {
  const atribuir = useAtribuirItem();
  const [consultor, setConsultor] = useState('');
  const [dia, setDia] = useState('');
  const [conflito, setConflito] = useState<string | null>(null);
  const hoje = todaySp();
  const nome = consultores.find((c) => c.id === consultor)?.name ?? '';
  const modo = plano.travel_mode === 'a_pe' ? 'A pé' : 'Carro/moto';
  const aberto = onEscolher ? !!escolhido : true;

  function publicar(trocar = false) {
    atribuir.mutate(
      { planId: plano.id, itemId: item.id, consultant_id: consultor, day: dia, confirm_replace: trocar },
      {
        onSuccess: (r) => {
          setConflito(null);
          toast.success(textoPublicada(item.name, nome, dia) + (r.dropped ? ` ${r.dropped} cliente(s) saíram (arquivados ou sem localização).` : ''));
        },
        onError: (e) => {
          if (codigoDoErro(e) === 'ROUTE_EXISTS') setConflito(apiErrorMessage(e, 'Este representante já tem rota nesse dia.'));
          else toast.error(apiErrorMessage(e, 'Não conseguimos publicar a rota. A escolha continua aqui.'));
        },
      },
    );
  }

  const titulo = (
    <>
      <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: item.color }} />
      {item.name}
    </>
  );

  return (
    <section className={`space-y-2 rounded-lg border border-border bg-card p-3 ${escolhido ? 'ring-2 ring-primary' : ''}`} aria-label={item.name}>
      <h3 className="font-medium">
        {onEscolher ? (
          <button type="button" aria-expanded={!!escolhido} onClick={onEscolher} className="flex min-h-11 w-full items-center gap-2 text-left md:min-h-0">
            {titulo}
          </button>
        ) : (
          <span className="flex items-center gap-2">{titulo}</span>
        )}
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <div>
          <dt className="inline">{plano.kind === 'shopping_interno' ? 'Shopping: ' : 'Bairro principal: '}</dt>
          <dd className="inline font-bold text-foreground">{item.bairro_principal ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline">Do centro: </dt>
          <dd className="inline font-bold text-foreground">{item.do_centro_m == null ? '—' : `${km(item.do_centro_m)} km`}</dd>
        </div>
        <div>
          <dt className="inline">Paradas previstas: </dt>
          <dd className="inline font-bold text-foreground">{item.lead_ids.length}</dd>
        </div>
        <div>
          <dt className="inline">Percurso: </dt>
          <dd className="inline font-bold text-foreground">{km(item.distance_m)} km</dd>
        </div>
        <div>
          <dt className="inline">Modo: </dt>
          <dd className="inline font-bold text-foreground">{modo}</dd>
        </div>
        <div>
          <dt className="inline">Tempo previsto: </dt>
          <dd className="inline font-bold text-foreground">{formatarDuracao(item.conta_lovable.minutos)}</dd>
        </div>
        <p className="col-span-2 text-[11px]">{item.conta_lovable.texto}</p>
      </dl>
      {aberto && item.stops.length > 0 && (
        <div className="rounded-md border border-border bg-background/50 p-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Clientes a visitar ({item.stops.length}):</p>
          <ol className="max-h-56 space-y-0.5 overflow-y-auto text-xs">
            {item.stops.map((s, i) => (
              <li key={s.lead_id} className="flex gap-2">
                <span className="font-semibold">{i + 1}.</span>
                <span>
                  {s.name} <span className="text-muted-foreground">— {s.address || 'sem endereço'}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {aberto && (
        <p className="text-xs">
          <span className="font-semibold">No nosso relógio (vale depois de publicada):</span> {item.conta_roteiro.texto}
        </p>
      )}
      {item.assigned ? (
        <p className="text-sm font-semibold" role="status">
          ✓ Publicada para {item.assigned.consultant_name ?? 'o representante'}
          {item.assigned.day ? ` em ${diaCurto(item.assigned.day)}` : ''}
        </p>
      ) : admin ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <select
              id={`cons-${item.id}`}
              aria-label={`Representante da ${item.name}`}
              value={consultor}
              onChange={(e) => {
                setConsultor(e.target.value);
                setConflito(null);
              }}
              className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm md:h-9"
            >
              <option value="">Representante</option>
              {consultores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Input
              id={`dia-${item.id}`}
              aria-label={`Dia da ${item.name}`}
              type="date"
              min={hoje}
              value={dia}
              onChange={(e) => {
                setDia(e.target.value);
                setConflito(null);
              }}
            />
          </div>
          <Button className="w-full" disabled={!consultor || !dia || atribuir.isPending} onClick={() => publicar(false)}>
            {atribuir.isPending ? 'Publicando…' : 'Publicar'}
          </Button>
          {conflito && (
            <div role="alert" className="space-y-2 rounded-md border border-warning p-3 text-sm">
              <p>{conflito}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" disabled={atribuir.isPending} onClick={() => publicar(true)}>
                  Trocar pela {item.name}
                </Button>
                <Button
                  variant="ghost"
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
        <p className="text-xs text-muted-foreground">Ainda não publicada.</p>
      )}
    </section>
  );
}
