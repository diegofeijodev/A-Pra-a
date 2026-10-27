'use client';

import { useState } from 'react';
import { CuponsCampo } from '@/components/campo/CuponsCampo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { RetornosCampo } from '@/components/campo/RetornosCampo';
import { Button } from '@/components/ui/button';
import { useCampoMe } from '@/modules/campo/application/use-campo';
import { useOnline } from '@/modules/campo/application/use-online';
import { diaCurto } from '@/modules/consultores/domain/atencao';
import { useListaCampo } from '@/modules/pinos/application/use-pinos';
import { codigosDaEscolha, pilulasVisitados, SIMBOLO, type EscolhaVisitados } from '@/modules/pinos/domain/pinos';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

type Segmento = 'retornos' | 'vouchers' | 'visitados';

/** Seletor de segmento (o mesmo desenho do período do Dashboard): escolha única, com `aria-pressed`. */
const segmento = (ativo: boolean) =>
  `min-h-11 flex-1 rounded-md px-3 text-sm ${ativo ? 'bg-card font-semibold text-foreground shadow-card' : 'text-muted-foreground'}`;
const pilula = (ativa: boolean) =>
  `flex min-h-11 items-center gap-2 rounded-full border px-3 py-1 text-sm ${ativa ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`;

/**
 * "Visitados" (Lovable `clientes.tsx`): os clientes dele que já têm resultado, com pílulas de escolha única ("Todos" = todas as
 * situações menos "A visitar") e busca. Lê `GET /v1/campo/map/list` (contrato §34.7: roteiro dele ou visitado por ele, na praça de
 * hoje). Só leitura: a situação vem da visita. Precisa de sinal.
 */
function VisitadosCampo() {
  const online = useOnline();
  const [escolha, setEscolha] = useState<EscolhaVisitados>('todos');
  const [busca, setBusca] = useState('');
  const [paginas, setPaginas] = useState<string[]>([]);
  const lista = useListaCampo({ codes: codigosDaEscolha(escolha), q: busca, cursor: paginas[paginas.length - 1] }, online);
  const r = lista.data;

  if (!online && !r) {
    return (
      <p role="status" className="card-surface p-4 text-sm">
        A lista precisa de internet. Suas visitas continuam funcionando; ela aparece quando o celular tiver sinal.
      </p>
    );
  }
  return (
    <section aria-label="Clientes visitados" className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {pilulasVisitados(r?.counts).map((p) => (
          <button
            key={p.escolha}
            type="button"
            aria-pressed={escolha === p.escolha}
            onClick={() => {
              setPaginas([]);
              setEscolha(p.escolha);
            }}
            className={pilula(escolha === p.escolha)}
          >
            {escolha === p.escolha && <span aria-hidden>✓</span>}
            {p.shape && (
              <span aria-hidden style={escolha === p.escolha ? undefined : { color: p.color }}>
                {SIMBOLO[p.shape]}
              </span>
            )}
            {p.rotulo} {p.n !== null && <b>{p.n.toLocaleString('pt-BR')}</b>}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="visitados-busca" className="sr-only">
          Buscar por nome, endereço ou cidade
        </label>
        <input
          id="visitados-busca"
          type="search"
          value={busca}
          onChange={(e) => {
            setPaginas([]);
            setBusca(e.target.value);
          }}
          placeholder="Buscar por nome"
          className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>

      {lista.isError ? (
        <div className="card-surface space-y-2 p-4">
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(lista.error, 'Não foi possível carregar a lista. Sem sinal, ela aparece quando o celular tiver sinal.')}
          </p>
          <Button variant="outline" className="h-12 w-full" onClick={() => void lista.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !r ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : r.items.length === 0 ? (
        <p className="card-surface p-4 text-sm text-muted-foreground">Nenhum cliente visitado com esses filtros ainda.</p>
      ) : (
        <>
          <ul className="space-y-2" data-testid="lista-campo">
            {r.items.map((i) => (
              <li key={i.id} className="card-surface space-y-1 p-3">
                <p className="break-words font-medium">{i.name}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {[i.address, i.city].filter(Boolean).join(' · ')}
                  {!i.has_location ? ' · sem localização exata' : ''}
                </p>
                <p className="text-sm">
                  {i.label}
                  {i.last_visit ? ` · última visita ${diaCurto(i.last_visit.day)}${i.last_visit.consultant_name ? ` · ${i.last_visit.consultant_name}` : ''}` : ''}
                </p>
                {i.phone && (
                  <p className="text-xs text-muted-foreground">
                    {i.phone.masked}
                    {i.phone.kind === 'whatsapp' ? ' (WhatsApp)' : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {paginas.length > 0 && (
              <Button variant="outline" className="h-12" onClick={() => setPaginas((p) => p.slice(0, -1))}>
                ← Anteriores
              </Button>
            )}
            {r.next_cursor && (
              <Button variant="outline" className="h-12" onClick={() => setPaginas((p) => [...p, r.next_cursor!])}>
                Próximos →
              </Button>
            )}
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-2 text-sm">ⓘ Como contamos</summary>
            <p>{r.conta}</p>
          </details>
        </>
      )}
    </section>
  );
}

/**
 * Aba "Clientes" do representante (`?v=clientes`, UX §4.14): Retornos (abre aqui: é o que tem ação hoje), Vouchers (com
 * `features.vouchers`) e Visitados (com `features.map_pins`: a rota da lista fica atrás da trava do mapa). Os segmentos sem módulo
 * ligado não aparecem — nada sonda rota desligada.
 */
export function ClientesRepresentanteTela() {
  const f = useCampoMe().data?.features;
  const [seg, setSeg] = useState<Segmento>('retornos');
  const segmentos: [Segmento, string][] = [
    ['retornos', 'Retornos'],
    ...(f?.vouchers ? ([['vouchers', 'Vouchers']] as [Segmento, string][]) : []),
    ...(f?.map_pins ? ([['visitados', 'Visitados']] as [Segmento, string][]) : []),
  ];
  const atual = segmentos.some(([s]) => s === seg) ? seg : 'retornos';

  return (
    <main className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Clientes</h1>
        <p className="text-muted-foreground">Quem você precisa procurar de novo e os vouchers que você pediu.</p>
      </div>
      <FaixaFila />
      {segmentos.length > 1 && (
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Ver">
          {segmentos.map(([s, rotulo]) => (
            <button key={s} type="button" aria-pressed={atual === s} onClick={() => setSeg(s)} className={segmento(atual === s)}>
              {rotulo}
            </button>
          ))}
        </div>
      )}
      {atual === 'retornos' && <RetornosCampo />}
      {atual === 'vouchers' && <CuponsCampo />}
      {atual === 'visitados' && <VisitadosCampo />}
    </main>
  );
}
