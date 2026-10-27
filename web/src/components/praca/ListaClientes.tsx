'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUiStore } from '@/lib/ui-store';
import { useListaClientes } from '@/modules/acesso/application/use-acesso';
import { diaCurto } from '@/modules/planos/domain/planos';
import { codigosDaEscolha, pilulasVisitados, SIMBOLO, SITUACOES_LISTA, type EscolhaVisitados } from '@/modules/pinos/domain/pinos';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const CARTAO = 'rounded-2xl bg-card shadow-card';
const FORMA = new Map(SITUACOES_LISTA.map((s) => [s.code, s.shape]));

/** Pílula da Lovable (`clientes.tsx`): escolhida em `bg-primary`, as outras em `bg-card`; 44 px no celular. */
const pilula = (ativa: boolean) =>
  `flex min-h-11 items-center gap-2 rounded-full border px-3 py-1 text-sm md:min-h-9 ${ativa ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`;

/**
 * Clientes (Lovable `clientes.tsx`, UX §4.4, contrato §34.6): pílulas de escolha ÚNICA ("Todos" = todas as situações menos "A
 * visitar"; o número vem de `counts`), praça + "Buscar por nome" e a tabela da Lovable. Só leitura: a situação vem da visita e se
 * corrige pelo painel do cliente, que deixa rastro (a Lovable tem um seletor de status ali) [desvio: regra]. Telefone mascarado.
 */
export function ListaClientes() {
  const { data: pracas } = usePracas();
  const [pracaId, setPracaId] = useState('');
  const [busca, setBusca] = useState('');
  const [escolha, setEscolha] = useState<EscolhaVisitados>('todos');
  const [paginas, setPaginas] = useState<string[]>([]);
  const cursor = paginas[paginas.length - 1];
  const lista = useListaClientes({ praca_id: pracaId || undefined, codes: codigosDaEscolha(escolha), q: busca, cursor }, true);
  const abrirLead = useUiStore((s) => s.openLead);
  const r = lista.data;
  const recomeca = () => setPaginas([]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {pilulasVisitados(r?.counts).map((p) => (
          <button
            key={p.escolha}
            type="button"
            aria-pressed={escolha === p.escolha}
            onClick={() => {
              recomeca();
              setEscolha(p.escolha);
            }}
            className={pilula(escolha === p.escolha)}
          >
            {p.shape && (
              <span aria-hidden style={escolha === p.escolha ? undefined : { color: p.color }}>
                {SIMBOLO[p.shape]}
              </span>
            )}
            {p.rotulo} {p.n !== null && <b>{p.n.toLocaleString('pt-BR')}</b>}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <label htmlFor="lista-praca" className="sr-only">
          Praça
        </label>
        <select
          id="lista-praca"
          value={pracaId}
          onChange={(e) => {
            recomeca();
            setPracaId(e.target.value);
          }}
          className="h-11 min-w-0 rounded-md border border-input bg-background px-2 text-sm md:h-9"
        >
          <option value="">Todas as praças abertas</option>
          {(pracas ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label htmlFor="lista-busca" className="sr-only">
          Buscar por nome, endereço ou cidade
        </label>
        <Input
          id="lista-busca"
          type="search"
          value={busca}
          onChange={(e) => {
            recomeca();
            setBusca(e.target.value);
          }}
          placeholder="Buscar por nome"
          className="w-full sm:max-w-xs"
        />
      </div>

      {lista.isError ? (
        <div className={`${CARTAO} space-y-2 p-5`}>
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(lista.error, 'Não foi possível carregar a lista.')}
          </p>
          <Button variant="outline" onClick={() => void lista.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !r ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <>
          <div className={`${CARTAO} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Cidade/UF</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Contato</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {r.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum cliente visitado com esses filtros ainda.
                    </td>
                  </tr>
                ) : (
                  r.items.map((i) => {
                    const forma = FORMA.get(i.code);
                    return (
                      <tr key={i.id} className="border-b align-top last:border-0">
                        <td className="px-4 py-3">
                          <button type="button" className="min-h-11 break-words text-left font-medium hover:underline md:min-h-0" onClick={() => abrirLead(i.id)}>
                            {i.name}
                          </button>
                          <p className="break-words text-xs text-muted-foreground">
                            {i.address || '—'}
                            {!i.has_location ? ' · sem localização exata' : ''}
                          </p>
                          {/* No celular a coluna "Cidade/UF" some (Lovable): a cidade vai embaixo do nome. */}
                          {i.city && <p className="break-words text-xs text-muted-foreground md:hidden">{i.city}</p>}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">{i.city || '—'}</td>
                        <td className="hidden px-4 py-3 text-sm lg:table-cell">
                          {i.phone ? `${i.phone.masked}${i.phone.kind === 'whatsapp' ? ' (WhatsApp)' : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            {forma && (
                              <span aria-hidden style={{ color: i.color }}>
                                {SIMBOLO[forma]}
                              </span>
                            )}
                            {i.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {i.last_visit ? `última visita ${diaCurto(i.last_visit.day)}${i.last_visit.consultant_name ? ` · ${i.last_visit.consultant_name}` : ''}` : 'sem visita'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="lista-conta">
            {r.total.toLocaleString('pt-BR')} no filtro · {r.without_location.toLocaleString('pt-BR')} sem localização exata (não aparecem no mapa)
          </p>
          <div className="flex flex-wrap gap-2">
            {paginas.length > 0 && (
              <Button variant="outline" onClick={() => setPaginas((p) => p.slice(0, -1))}>
                ← Anteriores
              </Button>
            )}
            {r.next_cursor && (
              <Button variant="outline" onClick={() => setPaginas((p) => [...p, r.next_cursor!])}>
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
    </div>
  );
}
