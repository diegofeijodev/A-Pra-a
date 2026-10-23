'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { RotaPlanoCard } from '@/components/praca/RotaPlanoCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAreas } from '@/modules/areas/application/use-areas';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useConsultores } from '@/modules/consultores/application/use-consultores';
import { useArquivarPlano, useConfigDivisao, useCriarPlano, usePlano, usePlanos, usePrevia } from '@/modules/planos/application/use-planos';
import { rotuloGeracao } from '@/modules/planos/domain/planos';
import type { PracaView } from '@/modules/pracas/application/use-pracas';

const RotasMapa = dynamic(() => import('./RotasMapa'), { ssr: false });

/**
 * Rotas > "Dividir em rotas" (contrato §39, UX §3.4; Lovable `rotas.tsx`, aba "Clientes"): praça, área e paradas por rota, a
 * prévia com a conta ANTES de gerar, dois botões de gerar (1 toque), gerações salvas (arquivar, nunca apagar) e os cartões com
 * as duas contas e a publicação para consultor + dia. O "Montar roteiro" de hoje continua em "Dia de cada consultor".
 */
export function DividirRotas({ praca }: { praca: PracaView }) {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const config = useConfigDivisao(true);
  const { data: areas } = useAreas(praca.id);
  const [areaId, setAreaId] = useState('');
  const [porRota, setPorRota] = useState<number | null>(null);
  useEffect(() => {
    if (porRota === null && config.data) setPorRota(config.data.por_rota);
  }, [config.data, porRota]);
  const por = porRota ?? config.data?.por_rota ?? 20;
  const previa = usePrevia({ praca_id: praca.id, area_id: areaId || undefined, por_rota: por, ligado: por >= 1 && por <= 100 });
  const planos = usePlanos(praca.id, 'geral', true);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const atual = escolhido ?? planos.data?.[0]?.id ?? null;
  const plano = usePlano(atual);
  const criar = useCriarPlano();
  const arquivar = useArquivarPlano();
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [verMapa, setVerMapa] = useState(false);
  const [destaque, setDestaque] = useState<string | null>(null);
  const dark = user?.theme !== 'light';
  const { data: consultores } = useConsultores();
  const doPraca = (consultores ?? []).filter((c) => c.praca_id === praca.id && c.active).map((c) => ({ id: c.id, name: c.name }));
  const resumo = planos.data?.find((p) => p.id === atual);

  function gerar(modo: 'carro' | 'a_pe') {
    criar.mutate(
      { praca_id: praca.id, ...(areaId ? { area_id: areaId } : {}), por_rota: por, travel_mode: modo },
      { onSuccess: (v) => setEscolhido(v.id) },
    );
  }

  return (
    <div className="space-y-4">
      <section className="card-surface space-y-3 p-4" aria-label="Dividir a área em rotas">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-1">
            <Label htmlFor="div-area">Área</Label>
            <select id="div-area" value={areaId} onChange={(e) => setAreaId(e.target.value)} className="h-12 w-full rounded-md border border-border bg-background px-3 text-sm">
              <option value="">Todas as áreas ativas</option>
              {(areas ?? [])
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="div-por">Paradas por rota</Label>
            <Input
              id="div-por"
              type="number"
              min={1}
              max={100}
              value={por}
              onChange={(e) => setPorRota(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="h-12"
            />
          </div>
        </div>
        <p className="text-sm" aria-live="polite" data-testid="previa-divisao">
          {previa.isPending ? 'Contando os estabelecimentos…' : previa.isError ? 'Não conseguimos contar agora.' : previa.data?.conta}
        </p>
        <p className="text-sm text-muted-foreground">
          Fonte: estabelecimentos da praça com localização exata, até o estágio do roteiro, sem cadastro declarado e fora de roteiro já publicado.
          Padrão da Lovable: {config.data ? `${config.data.minutos_por_cliente} min por estabelecimento + ${config.data.intervalo_min} min de intervalo + deslocamento, até ${Math.round(config.data.limite_min / 60)} h` : '…'}.
        </p>
        {admin && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-12" disabled={criar.isPending || !previa.data?.lead_count} onClick={() => gerar('carro')}>
              {criar.isPending ? 'Gerando…' : 'Gerar rotas de carro/moto'}
            </Button>
            <Button variant="outline" className="h-12" disabled={criar.isPending || !previa.data?.lead_count} onClick={() => gerar('a_pe')}>
              Gerar rotas a pé
            </Button>
          </div>
        )}
      </section>

      {planos.data && planos.data.length > 0 ? (
        <section className="card-surface space-y-2 p-4" aria-label="Gerações salvas">
          <Label htmlFor="div-geracao">Gerações salvas ({planos.data.length})</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="div-geracao"
              value={atual ?? ''}
              onChange={(e) => {
                setEscolhido(e.target.value);
                setConfirmarArquivo(false);
              }}
              className="h-12 flex-1 rounded-md border border-border bg-background px-3 text-sm"
            >
              {planos.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {rotuloGeracao(p)}
                </option>
              ))}
            </select>
            {admin && atual && (
              <Button variant="outline" className="h-12" onClick={() => setConfirmarArquivo(true)}>
                Arquivar
              </Button>
            )}
          </div>
          {confirmarArquivo && resumo && (
            <div role="alert" className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p>
                Arquivar a geração de {rotuloGeracao(resumo).split(' · ')[0]}? As {resumo.item_count - resumo.assigned_count} rotas ainda não publicadas saem da lista. As{' '}
                {resumo.assigned_count} publicadas continuam com os consultores.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="h-12"
                  disabled={arquivar.isPending}
                  onClick={() =>
                    arquivar.mutate(resumo.id, {
                      onSuccess: () => {
                        setEscolhido(null);
                        setConfirmarArquivo(false);
                      },
                    })
                  }
                >
                  Arquivar a geração
                </Button>
                <Button variant="ghost" className="h-12" onClick={() => setConfirmarArquivo(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : (
        planos.isSuccess && (
          <p className="card-surface p-4 text-sm text-muted-foreground">
            Nenhuma geração ainda. {admin ? 'Escolha a área e toque em gerar: as rotas ficam salvas aqui para publicar para cada consultor.' : 'Um administrador gera as rotas.'}
          </p>
        )
      )}

      {plano.data && plano.data.items.length > 0 && (
        <>
          <div className="space-y-2">
            <button type="button" aria-expanded={verMapa} onClick={() => setVerMapa((v) => !v)} className="h-12 w-full rounded-md border border-border px-4 text-sm font-bold sm:w-auto">
              {verMapa ? 'Esconder o mapa' : 'Ver no mapa'}
            </button>
            {verMapa && (
              <>
                <label className="flex flex-col gap-1 text-sm sm:max-w-sm">
                  <span>Destacar a rota</span>
                  <select value={destaque ?? ''} onChange={(e) => setDestaque(e.target.value || null)} className="h-12 rounded-md border border-border bg-background px-3">
                    <option value="">Nenhuma</option>
                    {plano.data.items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </label>
                <RotasMapa itens={plano.data.items} destaque={destaque} dark={dark} />
              </>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {plano.data.items.map((it) => (
              <RotaPlanoCard key={it.id} plano={plano.data!} item={it} admin={admin} consultores={doPraca} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
