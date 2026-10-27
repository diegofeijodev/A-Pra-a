'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useCanaisCampo, useSalvarCanaisCampo } from '@/modules/consultores/application/use-consultores';

/**
 * Configurações → "Canais de campo" (UX §4.11): a lista do questionário (1–30 itens, 1–80 caracteres, sem repetir). `embutido` = dentro
 * do cartão recolhido das Configurações, que já tem o título (sem o h2 nem a margem própria).
 */
export function CanaisCampo({ embutido = false }: { embutido?: boolean } = {}) {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const { data } = useCanaisCampo();
  const salvar = useSalvarCanaisCampo();
  const [lista, setLista] = useState<string[]>([]);
  const [novo, setNovo] = useState('');
  useEffect(() => {
    if (data) setLista(data);
  }, [data]);

  const adicionar = () => {
    const v = novo.trim().slice(0, 80);
    if (!v || lista.some((x) => x.toLowerCase() === v.toLowerCase()) || lista.length >= 30) return;
    setLista([...lista, v]);
    setNovo('');
  };

  return (
    <section className={embutido ? '' : 'mt-8'}>
      {!embutido && <h2 className="tag text-muted-foreground">Apps e canais (campo)</h2>}
      <p className="mt-1 text-xs text-muted-foreground">Opções da pergunta “Apps e canais que usa hoje” no questionário da visita.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {lista.map((c) => (
          <li key={c} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
            {c}
            {admin && (
              <button aria-label={`Remover ${c}`} onClick={() => setLista(lista.filter((x) => x !== c))} className="text-muted-foreground">
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <div className="mt-3 flex gap-2">
          <Input aria-label="Novo app ou canal" value={novo} maxLength={80} onChange={(e) => setNovo(e.target.value)} placeholder="Novo app ou canal" />
          <Button variant="outline" onClick={adicionar}>
            Adicionar
          </Button>
          <Button onClick={() => salvar.mutate(lista)} disabled={salvar.isPending || lista.length === 0}>
            Salvar
          </Button>
        </div>
      )}
    </section>
  );
}
