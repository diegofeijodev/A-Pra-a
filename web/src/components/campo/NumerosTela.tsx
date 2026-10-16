'use client';

import { useState } from 'react';
import { MapPin, Phone } from 'lucide-react';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { linkMapa } from '@/components/campo/RotaParadas';
import { fmtBR } from '@/lib/dates';
import { usePainelCampo } from '@/modules/campo/application/use-campo';
import { irPara } from '@/modules/campo/application/use-tela';
import type { ClienteItem, PainelCampo } from '@/modules/campo/domain/campo.types';

const PERIODOS: [PainelCampo['periodo'], string][] = [
  ['dia', 'Hoje'],
  ['semana', 'Semana'],
  ['30d', '30 dias'],
];

function Lista({ titulo, vazio, itens, comVagas }: { titulo: string; vazio: string; itens: ClienteItem[]; comVagas?: boolean }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline justify-between">
        <span className="tag text-muted-foreground">{titulo}</span>
        <span className="text-xs text-muted-foreground">{itens.length}</span>
      </h2>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((c) => (
            <li key={c.lead_id} className="card-surface flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {comVagas ? `${c.vagas} ${c.vagas === 1 ? 'vaga' : 'vagas'}` : c.address || 'sem endereço'}
                  {c.last_vaga_at ? ` · última vaga em ${fmtBR(c.last_vaga_at.slice(0, 10))}` : ''}
                </p>
              </div>
              {c.phone && (
                <a href={`tel:${c.phone}`} aria-label={`Ligar para ${c.name}`} className="flex h-10 w-10 items-center justify-center rounded-md border border-border">
                  <Phone size={15} />
                </a>
              )}
              <a
                href={linkMapa({ lat: c.lat, lng: c.lng, address: c.address, lead_name: c.name })}
                target="_blank"
                rel="noreferrer"
                aria-label={`Abrir ${c.name} no mapa`}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-border"
              >
                <MapPin size={15} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Visão `numeros` de `/campo` (§21.9): a rota e os números do representante, e quem ainda não abriu vaga. */
export function NumerosTela() {
  const [periodo, setPeriodo] = useState<PainelCampo['periodo']>('dia');
  const { data, isPending, isError } = usePainelCampo(periodo);
  return (
    <main className="space-y-5 pb-10">
      <CampoTopo titulo="Meus números" />
      <div role="tablist" className="grid grid-cols-3 gap-2">
        {PERIODOS.map(([p, r]) => (
          <button
            key={p}
            role="tab"
            aria-selected={periodo === p}
            onClick={() => setPeriodo(p)}
            className={`h-11 rounded-md border text-sm font-bold ${periodo === p ? 'border-primary bg-primary/15 text-primary' : 'border-border'}`}
          >
            {r}
          </button>
        ))}
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">Sem sinal: os números precisam de internet.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            {(
              [
                ['clientes na rota', data.numbers.clientes_na_rota],
                ['visitados', data.numbers.visitados],
                ['cadastrados', data.numbers.cadastrados],
                ['vagas abertas', data.numbers.vagas],
                ['vouchers', data.numbers.vouchers],
              ] as [string, number][]
            ).map(([r, n]) => (
              <div key={r} className="card-surface p-4">
                <p className="text-3xl font-black tabular-nums">{n}</p>
                <p className="text-xs text-muted-foreground">{r}</p>
              </div>
            ))}
          </section>
          <Lista titulo="Quem cadastrou" vazio="Ninguém neste período." itens={data.cadastrou} />
          <Lista titulo="Quem abriu vaga" vazio="Nenhuma vaga neste período." itens={data.abriu_vaga} comVagas />
          <Lista titulo="Cadastrou e ainda não abriu vaga" vazio="Todos os seus clientes já abriram vaga." itens={data.nunca_abriu} />
          <Lista titulo="Sem vaga nos últimos 30 dias" vazio="Nenhum cliente parado." itens={data.sem_vaga_30d} comVagas />
        </>
      )}
      <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
        Voltar
      </button>
    </main>
  );
}
