'use client';

import { Archive, Route as RouteIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { RotaPlanoCard } from '@/components/praca/RotaPlanoCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAreas } from '@/modules/areas/application/use-areas';
import { podeOperar } from '@/modules/acesso/domain/acesso';
import { rotaDaPraca } from '@/modules/acesso/domain/enderecos';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useConsultores } from '@/modules/consultores/application/use-consultores';
import { atuaNaPraca } from '@/modules/consultores/domain/pracas';
import { useFeaturesLoteC } from '@/modules/cupons/application/use-cupons';
import { useSegmentos } from '@/modules/places/application/use-places';
import { useArquivarPlano, useConfigDivisao, useCriarPlano, usePlano, usePlanos, usePrevia } from '@/modules/planos/application/use-planos';
import { alternarPerfil, opcoesDePerfil, rotuloGeracao, textoPerfil, tiposParaEnviar } from '@/modules/planos/domain/planos';
import type { PracaView } from '@/modules/pracas/application/use-pracas';

const RotasMapa = dynamic(() => import('./RotasMapa'), { ssr: false });

/** A partir de `lg` o mapa fica sempre à vista (Lovable); abaixo, só quando a pessoa pede (economiza dados no celular). */
function useTelaLarga(): boolean {
  const [larga, setLarga] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const mudar = () => setLarga(mql.matches);
    mudar();
    mql.addEventListener('change', mudar);
    return () => mql.removeEventListener('change', mudar);
  }, []);
  return larga;
}

/**
 * Rotas > "Clientes" (Lovable `rotas.tsx`, aba geral; UX §4.6, contrato §39): a barra da Lovable (praça, área, "Perfil dos clientes",
 * clientes por rota, os dois botões de gerar e a nossa prévia com a conta ANTES de gerar), as gerações salvas (arquivar, nunca apagar) e os
 * cartões compactos à esquerda com o mapa à direita. Tocar num cartão escolhe a rota: destaca no mapa e mostra os clientes e a nossa conta.
 *
 * "Perfil dos clientes" (redesenho E6, arquitetura §4.7): pílulas de vários, "Nenhum selecionado = todos os clientes"; filtra a prévia e quem
 * entra nas rotas geradas (`types`, §39.4). Só para quem gera (`podeOperar`): a lista dos segmentos é do gestor/admin e só é lida com
 * `features.segments` (desligada, os 5 tipos de hoje; nunca sonda rota desligada).
 */
export function DividirRotas({ praca, seletorPraca }: { praca: PracaView; seletorPraca?: ReactNode }) {
  const { user } = useAuth();
  // Lote E §42.3: gerar, arquivar e publicar também para o gestor (com a flag); a configuração da divisão segue só do admin.
  const admin = podeOperar(user);
  const config = useConfigDivisao(true);
  const { data: areas } = useAreas(praca.id);
  const ativas = (areas ?? []).filter((a) => a.active);
  const [areaId, setAreaId] = useState('');
  const [porRota, setPorRota] = useState<number | null>(null);
  useEffect(() => {
    if (porRota === null && config.data) setPorRota(config.data.por_rota);
  }, [config.data, porRota]);
  const por = porRota ?? config.data?.por_rota ?? 20;
  const loteC = useFeaturesLoteC();
  const segmentos = useSegmentos(admin && !loteC.carregando && loteC.segments);
  // `null` = sem pílulas (quem só vê, flags ainda carregando, ou a lista dos segmentos indisponível): a prévia vai sem filtro.
  const perfis = !admin || loteC.carregando ? null : loteC.segments ? (segmentos.data ? opcoesDePerfil(segmentos.data.segments) : null) : opcoesDePerfil(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const tipos = tiposParaEnviar(marcados, perfis ?? []);
  const previa = usePrevia({ praca_id: praca.id, area_id: areaId || undefined, por_rota: por, types: tipos, ligado: por >= 1 && por <= 100 });
  const planos = usePlanos(praca.id, 'geral', true);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const atual = escolhido ?? planos.data?.[0]?.id ?? null;
  const plano = usePlano(atual);
  const criar = useCriarPlano();
  const arquivar = useArquivarPlano();
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [verMapa, setVerMapa] = useState(false);
  const [rotaEscolhida, setRotaEscolhida] = useState<string | null>(null);
  const larga = useTelaLarga();
  const { data: consultores } = useConsultores();
  const doPraca = (consultores ?? []).filter((c) => atuaNaPraca(c, praca.id) && c.active).map((c) => ({ id: c.id, name: c.name }));
  const resumo = planos.data?.find((p) => p.id === atual);
  const itens = plano.data?.items ?? [];

  function gerar(modo: 'carro' | 'a_pe') {
    criar.mutate(
      { praca_id: praca.id, ...(areaId ? { area_id: areaId } : {}), ...(tipos.length ? { types: tipos } : {}), por_rota: por, travel_mode: modo },
      {
        onSuccess: (v) => {
          setEscolhido(v.id);
          setRotaEscolhida(null);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4" aria-label="Dividir a área em rotas">
        {seletorPraca}
        {ativas.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="div-area">Área</Label>
            <select
              id="div-area"
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="h-11 w-full min-w-44 rounded-md border border-input bg-background px-2 text-sm md:h-9"
            >
              <option value="">Todas as áreas ativas</option>
              {ativas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {perfis && perfis.length > 0 && (
          <fieldset className="min-w-0 max-w-full">
            <legend className="mb-1 text-sm font-medium leading-none">Perfil dos clientes</legend>
            <div className="flex flex-wrap gap-1">
              {perfis.map((p) => {
                const on = tipos.includes(p.slug);
                return (
                  <Button key={p.slug} type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={() => setMarcados((m) => alternarPerfil(m, p.slug))}>
                    {p.label}
                  </Button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Nenhum selecionado = todos os clientes.</p>
          </fieldset>
        )}
        <div className="w-36 space-y-1">
          <Label htmlFor="div-por">Clientes por rota</Label>
          <Input id="div-por" type="number" min={1} max={100} value={por} onChange={(e) => setPorRota(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
        </div>
        {admin && (
          <>
            <Button disabled={criar.isPending || !previa.data?.lead_count} onClick={() => gerar('carro')}>
              <RouteIcon className="h-4 w-4" aria-hidden />
              {criar.isPending ? 'Gerando…' : 'Gerar rota de carro/moto'}
            </Button>
            <Button variant="outline" disabled={criar.isPending || !previa.data?.lead_count} onClick={() => gerar('a_pe')}>
              <RouteIcon className="h-4 w-4" aria-hidden />
              Gerar rota a pé
            </Button>
          </>
        )}
        <p className="w-full text-sm text-muted-foreground" aria-live="polite" data-testid="previa-divisao">
          {previa.isPending ? (
            'Contando os clientes…'
          ) : previa.isError ? (
            'Não conseguimos contar agora.'
          ) : areas && ativas.length === 0 ? (
            // As áreas moram no detalhe da praça desde o redesenho (a frase da API ainda cita as Configurações).
            <>
              Nenhuma área de atuação ativa nesta praça. Cadastre uma em{' '}
              <Link href={rotaDaPraca(praca.id)} className="font-medium text-primary underline underline-offset-2">
                Praças › {praca.name} › Áreas de atuação
              </Link>{' '}
              para dividir em rotas.
            </>
          ) : (
            previa.data?.conta
          )}
        </p>
        <details className="w-full text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1 text-sm">ⓘ Como contamos</summary>
          <p>
            Fonte: clientes da praça com localização exata, até o estágio do roteiro, sem cadastro declarado e fora de rota já publicada. Perfil: o
            segmento com que o cliente foi achado na busca de estabelecimentos (vale qualquer busca); cliente cadastrado à mão, importado ou aberto na
            visita não tem perfil e fica de fora quando há perfil marcado. Tempo previsto de cada rota:{' '}
            {config.data
              ? `${config.data.minutos_por_cliente} min por cliente + ${config.data.intervalo_min} min de intervalo + deslocamento, até ${Math.round(config.data.limite_min / 60)} h`
              : '…'}
            .
          </p>
        </details>
      </section>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-2 lg:max-h-[640px] lg:overflow-y-auto">
          {planos.data && planos.data.length > 0 && (
            <div className="space-y-1 rounded-lg border border-border bg-card p-3">
              <Label htmlFor="div-geracao">
                Rotas salvas ({planos.data.length} {planos.data.length === 1 ? 'geração' : 'gerações'})
              </Label>
              <div className="flex gap-2">
                <select
                  id="div-geracao"
                  value={atual ?? ''}
                  onChange={(e) => {
                    setEscolhido(e.target.value);
                    setRotaEscolhida(null);
                  }}
                  className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm md:h-9"
                >
                  {planos.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${rotuloGeracao(p)}${p.types?.length ? ` · ${textoPerfil(p.types)}` : ''}`}
                    </option>
                  ))}
                </select>
                {admin && atual && (
                  <Button size="icon" variant="ghost" aria-label="Arquivar esta geração" onClick={() => setConfirmarArquivo(true)}>
                    <Archive className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
              {resumo && <p className="text-xs text-muted-foreground">{textoPerfil(resumo.types)}</p>}
            </div>
          )}
          {planos.isSuccess && planos.data.length === 0 && (
            <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
              Nenhuma rota ainda. {admin ? 'Clique em Gerar rotas.' : 'Um administrador ou gestor gera as rotas.'}
            </p>
          )}
          {plano.data &&
            itens.map((it) => (
              <RotaPlanoCard
                key={it.id}
                plano={plano.data!}
                item={it}
                admin={admin}
                consultores={doPraca}
                escolhido={rotaEscolhida === it.id}
                onEscolher={() => setRotaEscolhida((r) => (r === it.id ? null : it.id))}
              />
            ))}
        </div>
        {itens.length > 0 && (
          <div className="space-y-2">
            {!larga && (
              <Button variant="outline" aria-expanded={verMapa} onClick={() => setVerMapa((v) => !v)} className="w-full sm:w-auto">
                {verMapa ? 'Esconder o mapa' : 'Ver no mapa'}
              </Button>
            )}
            {(larga || verMapa) && <RotasMapa itens={itens} destaque={rotaEscolhida} />}
          </div>
        )}
      </div>

      <AlertDialog open={confirmarArquivo && !!resumo} onOpenChange={(o) => !o && setConfirmarArquivo(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar a geração de {resumo ? rotuloGeracao(resumo).split(' · ')[0] : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              {resumo
                ? `As ${resumo.item_count - resumo.assigned_count} rotas ainda não publicadas saem da lista. As ${resumo.assigned_count} publicadas continuam com os representantes.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={arquivar.isPending}
              onClick={() =>
                resumo &&
                arquivar.mutate(resumo.id, {
                  onSuccess: () => {
                    setEscolhido(null);
                    setRotaEscolhida(null);
                    setConfirmarArquivo(false);
                  },
                })
              }
            >
              Arquivar a geração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
