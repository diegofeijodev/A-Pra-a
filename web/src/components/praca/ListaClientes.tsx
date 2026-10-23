'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/ui-store';
import { useListaClientes } from '@/modules/acesso/application/use-acesso';
import { diaCurto } from '@/modules/planos/domain/planos';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

/** Situações na ordem da legenda do mapa (§34.3); "A visitar" começa escondido na Lista, como na Lovable (UX §3.3). */
const SITUACOES: [string, string][] = [
  ['a_visitar', 'A visitar'],
  ['cadastrado', 'Cadastrou'],
  ['ja_usa', 'Já usa o Freela'],
  ['retornar', 'Quer retorno'],
  ['nao_cadastrado', 'Sem interesse'],
  ['nao_contrata', 'Não contrata freelas'],
  ['fechado', 'Estabelecimento fechado'],
];
const PADRAO = SITUACOES.map(([c]) => c).filter((c) => c !== 'a_visitar');

const chip = (ativo: boolean) =>
  `flex h-12 items-center gap-2 rounded-md border px-3 text-sm font-bold ${ativo ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground line-through opacity-70'}`;

/**
 * Clientes > Lista (contrato §34.6, UX §3.3): a forma equivalente do mapa — mesma situação, mesmos filtros de praça, e os "sem
 * localização exata" (que o mapa não mostra). Só leitura (a situação vem da visita; corrigir é pelo Funil). Telefone mascarado.
 */
export function ListaClientes() {
  const { data: pracas } = usePracas();
  const [pracaId, setPracaId] = useState('');
  const [busca, setBusca] = useState('');
  const [codes, setCodes] = useState<string[]>(PADRAO);
  const [paginas, setPaginas] = useState<string[]>([]);
  const cursor = paginas[paginas.length - 1];
  const lista = useListaClientes({ praca_id: pracaId || undefined, codes, q: busca, cursor }, true);
  const abrirLead = useUiStore((s) => s.openLead);
  const r = lista.data;
  const recomeca = () => setPaginas([]);
  const alternar = (c: string) => {
    recomeca();
    setCodes((atual) => (atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]));
  };
  const nomePraca = useMemo(() => new Map((pracas ?? []).map((p) => [p.id, p.name])), [pracas]);

  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-muted-foreground">
        {pracaId ? 'Estabelecimentos da praça escolhida.' : 'Praças abertas (início até hoje).'} A situação vem da última visita; para corrigir, use o Funil.
      </p>
      <div className="flex flex-wrap items-center gap-2">
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
          className="h-12 min-w-40 rounded-md border border-border bg-background px-3 text-sm"
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
        <input
          id="lista-busca"
          type="search"
          value={busca}
          onChange={(e) => {
            recomeca();
            setBusca(e.target.value);
          }}
          placeholder="Buscar por nome, endereço ou cidade"
          className="h-12 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
        />
      </div>
      <div>
        <p className="mb-1 text-sm font-bold">Situação (toque para esconder ou mostrar):</p>
        <div className="flex flex-wrap gap-2" aria-live="polite">
          {SITUACOES.map(([c, rotulo]) => (
            <button key={c} type="button" aria-pressed={codes.includes(c)} onClick={() => alternar(c)} className={chip(codes.includes(c))}>
              {rotulo} {r ? (r.counts[c] ?? 0).toLocaleString('pt-BR') : ''}
            </button>
          ))}
        </div>
      </div>

      {lista.isError ? (
        <div className="card-surface space-y-2 p-4">
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(lista.error, 'Não foi possível carregar a lista.')}
          </p>
          <Button variant="outline" className="h-12" onClick={() => void lista.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !r ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : codes.length === 0 ? (
        <p className="card-surface p-4 text-sm">Nenhuma situação escolhida: toque numa situação acima para ver os estabelecimentos.</p>
      ) : r.items.length === 0 ? (
        <p className="card-surface p-4 text-sm">Nenhum estabelecimento com esses filtros. Mude a busca ou mostre outra situação.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="lista-conta">
            {r.total.toLocaleString('pt-BR')} no filtro · {r.without_location.toLocaleString('pt-BR')} sem localização exata (não aparecem no mapa)
          </p>
          <ul className="space-y-2">
            {r.items.map((i) => (
              <li key={i.id} className="card-surface flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="break-words font-bold">{i.name}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {[i.address, i.city, nomePraca.get(i.praca_id)].filter(Boolean).join(' · ')}
                    {!i.has_location ? ' · sem localização exata' : ''}
                  </p>
                  <p className="text-xs">
                    <span className="font-bold" style={{ color: i.color }} aria-hidden>
                      ●
                    </span>{' '}
                    {i.label}
                    {i.last_visit ? ` · última visita ${diaCurto(i.last_visit.day)}${i.last_visit.consultant_name ? ` · ${i.last_visit.consultant_name}` : ''}` : ' · sem visita'}
                    {i.phone ? ` · ${i.phone.masked}${i.phone.kind === 'whatsapp' ? ' (WhatsApp)' : ''}` : ''}
                  </p>
                </div>
                <Button variant="outline" className="h-12" onClick={() => abrirLead(i.id)}>
                  Abrir no funil
                </Button>
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
    </div>
  );
}
