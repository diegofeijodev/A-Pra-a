'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useGeo, useMapa, useRetryGeo } from '@/modules/mapa/application/use-mapa';
import type { StatusNoMapa } from '@/modules/mapa/infrastructure/mapa.api';
import type { PracaView } from '@/modules/pracas/infrastructure/pracas.api';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { COR_STATUS } from './MapaCalor';

const MapaCalor = dynamic(() => import('./MapaCalor'), { ssr: false });

const ROTULO_STATUS: Record<StatusNoMapa, string> = {
  nao_visitado: 'não visitado',
  visitado: 'visitado',
  cadastrado: 'cadastrado',
  com_vaga: 'com vaga',
};

/**
 * Praça → mapa (§21.2, decisão 16 do dono): onde estão os bares e
 * restaurantes da base, por CNAE, e o andamento da geocodificação.
 */
export function MapaEstabelecimentos({ praca }: { praca: PracaView }) {
  const { user } = useAuth();
  const [cnaes, setCnaes] = useState<string[]>([]);
  const [calor, setCalor] = useState(true);
  const [marcadores, setMarcadores] = useState(true);
  const { data, isPending, isError, error } = useMapa(praca.id, cnaes);
  const { data: geo } = useGeo(praca.id);
  const retry = useRetryGeo(praca.id);
  const centro = useMemo(
    () => (praca.cobertura?.lat != null && praca.cobertura.lon != null ? { lat: praca.cobertura.lat, lng: praca.cobertura.lon } : null),
    [praca.cobertura],
  );
  const contagem = useMemo(() => {
    const c: Record<StatusNoMapa, number> = { nao_visitado: 0, visitado: 0, cadastrado: 0, com_vaga: 0 };
    for (const p of data?.points ?? []) c[p.status]++;
    return c;
  }, [data]);

  const alternar = (code: string) => setCnaes((l) => (l.includes(code) ? l.filter((c) => c !== code) : [...l, code]));

  return (
    <section className="card-surface mt-3 space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-sm font-bold">
          <Flame size={14} className="text-primary" /> Mapa dos estabelecimentos
        </h2>
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={calor} onChange={(e) => setCalor(e.target.checked)} /> calor
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={marcadores} onChange={(e) => setMarcadores(e.target.checked)} /> pontos
          </label>
        </div>
      </div>

      {data && data.cnaes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.cnaes
            .filter((c) => c.code)
            .map((c) => (
              <button
                key={c.code}
                onClick={() => alternar(c.code!)}
                title={c.label}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${cnaes.includes(c.code!) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
              >
                {c.label.split(/[,—]/)[0]} · {c.count}
              </button>
            ))}
          {cnaes.length > 0 && (
            <button onClick={() => setCnaes([])} className="px-1 text-[11px] text-muted-foreground underline">
              todos
            </button>
          )}
        </div>
      )}

      {isPending ? (
        <p className="text-xs text-muted-foreground">Carregando o mapa…</p>
      ) : isError ? (
        <p className="text-xs text-danger">{apiErrorMessage(error, 'Não foi possível carregar o mapa.')}</p>
      ) : (
        <>
          <MapaCalor pontos={data.points} centro={centro} calor={calor} marcadores={marcadores} dark={user?.theme !== 'light'} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {(Object.keys(ROTULO_STATUS) as StatusNoMapa[]).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_STATUS[s] }} />
                {ROTULO_STATUS[s]} · {contagem[s]}
              </span>
            ))}
            {data.sem_localizacao > 0 && <span>{data.sem_localizacao} sem localização</span>}
          </div>
        </>
      )}

      {geo && (geo.pendente > 0 || geo.falhou > 0) && (
        <p className="text-[11px] text-muted-foreground">
          {geo.pendente > 0 &&
            (geo.geocoder === 'off'
              ? `${geo.pendente} endereço(s) esperando localização — a geocodificação está desligada (GEOCODER=off). `
              : `Localizando ${geo.pendente} endereço(s) pelo mapa (cerca de 1 por segundo). `)}
          {geo.falhou > 0 && (
            <>
              {geo.falhou} endereço(s) não encontrado(s).{' '}
              {user?.is_admin && (
                <button onClick={() => retry.mutate()} disabled={retry.isPending} className="underline">
                  tentar de novo
                </button>
              )}
            </>
          )}
        </p>
      )}
    </section>
  );
}
