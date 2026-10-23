'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFeaturesLoteC } from '@/modules/cupons/application/use-cupons';
import { useSalvarSegmentos, useSegmentos } from '@/modules/places/application/use-places';
import { CATEGORIAS_MAPA, descreverSegmento, montarSegmentoNovo, mover, ordenarPorPrioridade } from '@/modules/places/domain/segmentos';
import type { Segmento } from '@/modules/places/infrastructure/places.api';

const chip = (ativo: boolean) =>
  `min-h-12 rounded-full border px-3 text-sm font-medium ${ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-secondary/60'}`;

/**
 * Segmentos da busca de estabelecimentos (contrato §36; UX §3.9). Só com `features.segments`; escrita só de admin. Os 8 da Lovable
 * traduzidos para o mapa aberto mais Lanchonete e Café (nossos). Nada é apagado: segmento que não serve é desativado.
 */
export function SegmentosBusca({ admin }: { admin: boolean }) {
  const loteC = useFeaturesLoteC();
  const { data, isPending, isError, refetch } = useSegmentos(loteC.segments);
  const salvar = useSalvarSegmentos();
  const [lista, setLista] = useState<Segmento[] | null>(null);
  const [novo, setNovo] = useState<{ nome: string; categorias: { key: string; value: string }[]; cozinha: string; palavras: string } | null>(null);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [avancado, setAvancado] = useState<string | null>(null);

  useEffect(() => {
    if (data) setLista(ordenarPorPrioridade(data.segments));
  }, [data]);

  if (!loteC.segments) return null;
  const mudou = !!data && !!lista && JSON.stringify(ordenarPorPrioridade(data.segments)) !== JSON.stringify(lista);

  const adicionar = () => {
    if (!novo || !lista) return;
    const s = montarSegmentoNovo(novo, lista);
    if ('erro' in s) return setErroNovo(s.erro);
    setLista(ordenarPorPrioridade([...lista, s]));
    setNovo(null);
    setErroNovo(null);
  };
  const alterar = (slug: string, p: Partial<Segmento>) => setLista((l) => (l ?? []).map((s) => (s.slug === slug ? { ...s, ...p } : s)));

  return (
    <details className="card-surface mt-6 p-4">
      <summary className="cursor-pointer text-sm font-bold">Segmentos da busca de estabelecimentos</summary>
      <div className="mt-3 space-y-4">
        <p className="text-sm text-muted-foreground">
          Aparecem como opção em &quot;Buscar estabelecimentos&quot;. A busca é no mapa aberto (OpenStreetMap). Na classificação, o primeiro da lista que casar
          ganha: deixe os específicos (Pizzaria, Buffet) antes dos gerais (Restaurante).
        </p>
        {isPending && <div aria-busy="true" className="h-24 animate-pulse rounded-lg bg-muted" />}
        {isError && (
          <p role="alert" className="text-sm">
            Não deu para carregar os segmentos.{' '}
            <button type="button" className="min-h-12 font-bold underline" onClick={() => void refetch()}>
              Tentar de novo
            </button>
          </p>
        )}
        {lista && (
          <ol className="divide-y divide-border rounded-md border border-border">
            {lista.map((s, i) => (
              <li key={s.slug} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
                  <Input
                    aria-label={`Nome do segmento ${s.slug}`}
                    value={s.label}
                    maxLength={40}
                    disabled={!admin}
                    onChange={(e) => alterar(s.slug, { label: e.target.value })}
                    className="h-12 w-48"
                  />
                  <label className="flex min-h-12 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-5 w-5" disabled={!admin} checked={s.active} onChange={(e) => alterar(s.slug, { active: e.target.checked })} />
                    Ativo
                  </label>
                  <div className="ml-auto flex gap-1">
                    <Button variant="outline" className="h-12 w-12" aria-label={`Subir ${s.label}`} disabled={!admin || i === 0} onClick={() => setLista(mover(lista, s.slug, -1))}>
                      ↑
                    </Button>
                    <Button variant="outline" className="h-12 w-12" aria-label={`Descer ${s.label}`} disabled={!admin || i === lista.length - 1} onClick={() => setLista(mover(lista, s.slug, 1))}>
                      ↓
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Busca no mapa: {descreverSegmento(s)}</p>
                {admin && (
                  <div>
                    <button type="button" className="min-h-12 text-sm underline underline-offset-4" aria-expanded={avancado === s.slug} onClick={() => setAvancado(avancado === s.slug ? null : s.slug)}>
                      ▸ Avançado: etiquetas do mapa
                    </button>
                    {avancado === s.slug && (
                      <div className="mt-2 space-y-1 font-mono text-xs">
                        {s.filters.map((g, gi) => (
                          <p key={gi}>
                            {gi > 0 ? 'ou ' : ''}
                            {g.map((f) => `${f.key}${f.op}${f.value}`).join(' e ')}
                          </p>
                        ))}
                        <p className="font-sans text-muted-foreground">Código: {s.slug} (não muda). Para outra etiqueta, crie um segmento novo.</p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {admin && lista && !novo && (
          <Button variant="outline" className="h-12" onClick={() => setNovo({ nome: '', categorias: [], cozinha: '', palavras: '' })}>
            + Novo segmento
          </Button>
        )}
        {admin && novo && (
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-bold">Novo segmento</legend>
            <label className="block text-sm">
              Nome
              <Input value={novo.nome} maxLength={40} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className="mt-1 h-12" />
            </label>
            <div>
              <p className="text-sm">Categorias do mapa (uma ou mais)</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {CATEGORIAS_MAPA.map((c) => {
                  const ativo = novo.categorias.some((x) => x.key === c.key && x.value === c.value);
                  return (
                    <button
                      key={`${c.key}=${c.value}`}
                      type="button"
                      aria-pressed={ativo}
                      className={chip(ativo)}
                      onClick={() =>
                        setNovo({
                          ...novo,
                          categorias: ativo ? novo.categorias.filter((x) => !(x.key === c.key && x.value === c.value)) : [...novo.categorias, { key: c.key, value: c.value }],
                        })
                      }
                    >
                      {c.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block text-sm">
              Tipo de cozinha (opcional, separado por vírgula; ex.: pizza)
              <Input value={novo.cozinha} maxLength={120} onChange={(e) => setNovo({ ...novo, cozinha: e.target.value })} className="mt-1 h-12" />
            </label>
            <label className="block text-sm">
              Palavras no nome (opcional, separadas por vírgula; ex.: buffet)
              <Input value={novo.palavras} maxLength={200} onChange={(e) => setNovo({ ...novo, palavras: e.target.value })} className="mt-1 h-12" />
            </label>
            {erroNovo && (
              <p role="alert" className="text-sm text-destructive">
                {erroNovo}
              </p>
            )}
            <div className="flex gap-2">
              <Button className="h-12" onClick={adicionar}>
                Pôr na lista
              </Button>
              <Button variant="outline" className="h-12" onClick={() => setNovo(null)}>
                Voltar
              </Button>
            </div>
          </fieldset>
        )}

        {admin && lista && (
          <div className="flex flex-wrap items-center gap-3">
            <Button className="h-12" disabled={!mudou || salvar.isPending} onClick={() => salvar.mutate(lista)}>
              {salvar.isPending ? 'Salvando…' : 'Salvar segmentos'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Vale para as próximas buscas. {data?.is_default ? 'Hoje: o padrão (os 8 da Lovable + Lanchonete e Café).' : 'Nada é apagado: o que não serve fica desativado.'}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}
