'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useAreas, useCreateArea, useUpdateArea } from '@/modules/areas/application/use-areas';
import {
  erroDoFormulario,
  RAIO_MAX_M,
  RAIO_MIN_M,
  RAIO_PADRAO_M,
  rotuloRaio,
  visaoInicial,
} from '@/modules/areas/domain/area-form';
import type { AreaView } from '@/modules/areas/infrastructure/areas.api';
import type { PracaView } from '@/modules/pracas/application/use-pracas';

// O Leaflet só existe no navegador — o mapa entra por import dinâmico.
const AreaMapa = dynamic(() => import('./AreaMapa'), { ssr: false });

const VAZIO = { name: '', lat: null as number | null, lng: null as number | null, radius_m: RAIO_PADRAO_M };

/**
 * Configurações → "Áreas de atuação" (F1 da prospecção, §21 do contrato).
 *
 * Círculo (centro + raio) dentro da praça, usado pelo trabalho de campo. Uma
 * praça sem cobertura do IBGE (ex.: "São Paulo – Moema") funciona só com
 * áreas. Mapa nunca é o único jeito de ver: a lista traz o mesmo conteúdo.
 * Leitura para toda a equipe; criar e editar é só de admin.
 */
export function AreasAtuacao({ praca }: { praca: PracaView }) {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const dark = user?.theme !== 'light';
  const { data: areas, isPending, isError, refetch } = useAreas(praca.id);
  const criar = useCreateArea(praca.id);
  const atualizar = useUpdateArea(praca.id);
  const [editando, setEditando] = useState<string | null>(null); // id, ou 'nova'
  const [form, setForm] = useState(VAZIO);
  const [tentou, setTentou] = useState(false);

  // Trocar de praça fecha o formulário aberto.
  useEffect(() => {
    setEditando(null);
    setForm(VAZIO);
    setTentou(false);
  }, [praca.id]);

  const visao = useMemo(() => visaoInicial(praca, areas ?? []), [praca, areas]);
  const erro = erroDoFormulario(form);
  const ocupado = criar.isPending || atualizar.isPending;

  const abrirNova = () => {
    setForm(VAZIO);
    setTentou(false);
    setEditando('nova');
  };
  const abrirEdicao = (a: AreaView) => {
    setForm({ name: a.name, lat: a.lat, lng: a.lng, radius_m: a.radius_m });
    setTentou(false);
    setEditando(a.id);
  };
  const fechar = () => {
    setEditando(null);
    setForm(VAZIO);
    setTentou(false);
  };

  const salvar = () => {
    setTentou(true);
    if (erro || form.lat == null || form.lng == null) return;
    const dados = { name: form.name.trim(), lat: form.lat, lng: form.lng, radius_m: form.radius_m };
    if (editando === 'nova') criar.mutate(dados, { onSuccess: fechar });
    else if (editando) atualizar.mutate({ id: editando, input: dados }, { onSuccess: fechar });
  };

  return (
    <section className="mt-8">
      <h2 className="tag text-muted-foreground">Áreas de atuação</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Onde o consultor de campo trabalha nesta praça: um ponto no mapa e um raio. A praça pode ter várias áreas (ex.: Moema, Itaim).
      </p>

      {isPending && <p className="mt-3 text-sm text-muted-foreground">Carregando áreas…</p>}
      {isError && (
        <p className="mt-3 text-sm text-destructive">
          Não conseguimos carregar as áreas.{' '}
          <button className="underline" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </p>
      )}
      {areas && areas.length === 0 && editando !== 'nova' && (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma área ainda.{admin ? ' Marque o centro no mapa e escolha o raio.' : ''}
        </p>
      )}

      {areas && areas.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {areas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.name}
                  {!a.active && <span className="ml-2 text-xs font-normal text-muted-foreground">(desativada)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Raio de {rotuloRaio(a.radius_m)} · centro {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                </p>
              </div>
              {admin && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => abrirEdicao(a)}>
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => atualizar.mutate({ id: a.id, input: { active: !a.active } })}
                  >
                    {a.active ? 'Desativar' : 'Ativar'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {admin && !editando && (
        <Button className="mt-3" variant="outline" onClick={abrirNova}>
          Nova área
        </Button>
      )}

      {admin && editando && (
        <div className="mt-4 space-y-3 rounded-md border border-border p-3">
          <h3 className="text-sm font-semibold">{editando === 'nova' ? 'Nova área' : 'Editar área'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              Nome da área
              <Input
                className="mt-1"
                value={form.name}
                maxLength={80}
                placeholder="Ex.: Moema"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Raio em metros ({RAIO_MIN_M} a {RAIO_MAX_M})
              <Input
                className="mt-1"
                type="number"
                inputMode="numeric"
                min={RAIO_MIN_M}
                max={RAIO_MAX_M}
                step={50}
                value={Number.isFinite(form.radius_m) ? form.radius_m : ''}
                onChange={(e) => setForm({ ...form, radius_m: e.target.value === '' ? NaN : Number(e.target.value) })}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {form.lat == null
              ? 'Clique no mapa para marcar o centro da área.'
              : `Centro: ${form.lat.toFixed(5)}, ${form.lng?.toFixed(5)}. Clique de novo para mudar.`}
          </p>
          <AreaMapa
            visao={visao}
            dark={dark}
            existentes={(areas ?? []).filter((a) => a.id !== editando)}
            atual={{ lat: form.lat, lng: form.lng, radius_m: Number.isFinite(form.radius_m) ? form.radius_m : RAIO_PADRAO_M }}
            onPick={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
          />
          {tentou && erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={fechar} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Salvar área'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
