'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useCnaes, useSalvarCnaes } from '@/modules/consultores/application/use-consultores';
import type { CnaeItem } from '@/modules/consultores/infrastructure/consultores.api';

/** "5611-2/01" → "5611201"; outra coisa → "". */
const soDigitos = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length === 7 ? d : '';
};
const mascara = (c: string) => `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}`;

/** Configurações → "CNAEs da base (rotas)": filtro da importação e do mapa de calor (§21.4). */
export function CnaesCampo() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const { data } = useCnaes();
  const salvar = useSalvarCnaes();
  const [lista, setLista] = useState<CnaeItem[]>([]);
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  useEffect(() => {
    if (data) setLista(data);
  }, [data]);

  const code = soDigitos(codigo);
  const adicionar = () => {
    if (!code || !nome.trim() || lista.some((c) => c.code === code) || lista.length >= 40) return;
    setLista([...lista, { code, label: nome.trim().slice(0, 120) }]);
    setCodigo('');
    setNome('');
  };

  return (
    <section className="mt-8">
      <h2 className="tag text-muted-foreground">CNAEs da base (rotas)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Atividades que entram na base de estabelecimentos: filtro da importação e do mapa de calor da praça.
      </p>
      <ul className="mt-3 space-y-1">
        {lista.map((c) => (
          <li key={c.code} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">{mascara(c.code)}</span>
            <span className="flex-1">{c.label}</span>
            {admin && (
              <button aria-label={`Remover ${c.label}`} onClick={() => setLista(lista.filter((x) => x.code !== c.code))} className="text-muted-foreground">
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input aria-label="Código CNAE" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="5611-2/01" className="w-32" />
          <Input aria-label="Nome da atividade" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} placeholder="Restaurantes e similares" className="min-w-0 flex-1" />
          <Button variant="outline" onClick={adicionar} disabled={!code || !nome.trim()}>
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
