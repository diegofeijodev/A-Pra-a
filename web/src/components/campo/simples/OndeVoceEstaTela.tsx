'use client';

import axios from 'axios';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { ChegueiBotao, type AlvoChegada } from '@/components/campo/simples/ChegueiBotao';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDia } from '@/modules/campo/application/use-campo';
import { useOnline } from '@/modules/campo/application/use-online';
import { irPara, useTela } from '@/modules/campo/application/use-tela';
import type { PlaceView } from '@/modules/campo/domain/campo.types';
import { seguirSemConferirParecidos } from '@/modules/campo/domain/fila-politica';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { campoBuscarLugares, campoLugaresParecidos, campoLugaresPerto } from '@/modules/campo/infrastructure/campo.api';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { useRoteiro } from '@/modules/rotas/application/use-roteiro';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const metros = (m: number | null) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * "Onde você está?" (UX §2.2 S0): visita no caminho, sem roteiro, ou parada escolhida fora da lista. A lista perto de
 * você já abre carregada (sem botão "Procurar"). Escolhido o lugar, o botão fixo "Tirar a foto da fachada" abre a câmera
 * e a foto vira o check-in. Substitui `NovaVisitaTela` só no fluxo simples.
 */
export function OndeVoceEstaTela() {
  const online = useOnline();
  const tela = useTela();
  const rot = useRoteiro();
  const { dia, carregando } = useDia();
  const [lugares, setLugares] = useState<PlaceView[] | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoEndereco, setNovoEndereco] = useState('');
  const [parecidos, setParecidos] = useState<PlaceView[] | null>(null);
  const [escolhido, setEscolhido] = useState<AlvoChegada | null>(null);
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Parada do roteiro escolhida em outra tela: o lugar já vem escolhido.
  const paradaId = tela.v === 'nova' ? tela.parada : undefined;
  const parada = paradaId ? rot.route?.stops.find((s) => s.id === paradaId) : undefined;
  useEffect(() => {
    if (parada) setEscolhido((atual) => atual ?? { nome: parada.name, lead_id: parada.lead_id });
  }, [parada]);

  // Com visita aberta, não começa outra (uma por vez).
  useEffect(() => {
    if (dia.visitaAberta) irPara({ v: 'visita', ref: dia.visitaAberta.ref }, 'replace');
  }, [dia.visitaAberta]);

  // A lista perto de você carrega ao abrir.
  useEffect(() => {
    if (!online || escolhido || paradaId) return;
    let vivo = true;
    setCarregandoLista(true);
    lerPosicao()
      .then((p) => campoLugaresPerto(p.lat, p.lng))
      .then((l) => vivo && setLugares(l))
      .catch((e) => {
        if (!vivo) return;
        if (e instanceof ErroGps) setGps(e.motivo);
        else toast.error(apiErrorMessage(e, 'Não foi possível procurar perto de você.'));
        setLugares([]);
      })
      .finally(() => vivo && setCarregandoLista(false));
    return () => {
      vivo = false;
    };
  }, [online, escolhido, paradaId]);

  // Busca por nome (opcional), com espera de 300 ms.
  useEffect(() => {
    if (busca.trim().length < 2 || !online) return;
    const t = window.setTimeout(() => {
      campoBuscarLugares(busca.trim())
        .then(setLugares)
        .catch((e) => toast.error(apiErrorMessage(e, 'Não foi possível buscar.')));
    }, 300);
    return () => window.clearTimeout(t);
  }, [busca, online]);

  async function continuarNovo() {
    const name = novoNome.trim();
    if (name.length < 2) return;
    const alvo: AlvoChegada = { nome: name, new_place: { name, address: novoEndereco.trim() || undefined } };
    if (!online) {
      setEscolhido(alvo); // sem sinal não dá para perguntar; o servidor marca `possible_dup` se houver parecido
      return;
    }
    setOcupado(true);
    try {
      const p = await lerPosicao();
      const achados = await campoLugaresParecidos(name, p.lat, p.lng);
      if (achados.length > 0) setParecidos(achados);
      else setEscolhido({ ...alvo, confirm_new: true });
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else {
        const status = axios.isAxiosError(e) ? e.response?.status : undefined;
        const code = axios.isAxiosError(e) ? (e.response?.data?.error?.code as string | undefined) : undefined;
        if (seguirSemConferirParecidos(status, code)) setEscolhido(alvo);
        else toast.error(apiErrorMessage(e, 'Não foi possível conferir lugares parecidos.'));
      }
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!dia.jornada) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Onde você está?" />
        <p className="card-surface p-5 text-sm">Inicie o dia antes de visitar.</p>
        <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar
        </button>
      </main>
    );
  }

  if (escolhido) {
    return (
      <main className="space-y-4 pb-28">
        <CampoTopo titulo="Onde você está?" />
        {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}
        <section className="card-surface space-y-1 p-4">
          <p className="text-lg font-black">{escolhido.nome}</p>
          {escolhido.new_place?.address && <p className="text-sm text-muted-foreground">{escolhido.new_place.address}</p>}
          {!parada && (
            <button type="button" onClick={() => { setEscolhido(null); setParecidos(null); }} className="min-h-12 text-sm font-bold text-primary">
              Não é este lugar
            </button>
          )}
        </section>
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            <ChegueiBotao alvo={escolhido}>Tirar a foto da fachada</ChegueiBotao>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4 pb-8">
      <CampoTopo titulo="Onde você está?" />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}
      <button type="button" onClick={() => irPara({ v: 'hoje' })} className="min-h-12 text-sm font-bold text-primary">
        ← Voltar
      </button>

      {!novo && (
        <>
          {online ? (
            <Input aria-label="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome" className="h-12" />
          ) : (
            <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              Sem internet. A lista perto de você precisa de sinal. Cadastre o lugar (nome e endereço) e siga; conferimos depois.
            </p>
          )}
          {online && <p className="text-sm font-bold">Perto de você</p>}
          {online && (carregandoLista || lugares === null) ? (
            <div aria-busy="true" className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : online && lugares && lugares.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada cadastrado perto de você. Busque pelo nome ou cadastre o lugar.</p>
          ) : online && lugares ? (
            <ul className="space-y-2">
              {lugares.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setEscolhido({ nome: l.name, lead_id: l.id })} className="card-surface min-h-16 w-full p-3 text-left">
                    <span className="block text-base font-bold">{l.name}</span>
                    <span className="block text-sm text-muted-foreground">{[l.address, metros(l.distance_m)].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" onClick={() => setNovo(true)} className="flex h-14 w-full items-center justify-center rounded-md border border-border text-base font-bold">
            Não está na lista? Cadastrar o lugar
          </button>
        </>
      )}

      {novo && !parecidos && (
        <section className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="novo-nome">Nome do lugar</Label>
            <Input id="novo-nome" value={novoNome} maxLength={120} onChange={(e) => setNovoNome(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="novo-endereco">Endereço</Label>
            <Input id="novo-endereco" value={novoEndereco} maxLength={200} onChange={(e) => setNovoEndereco(e.target.value)} className="h-12" />
          </div>
          <button
            type="button"
            disabled={ocupado || novoNome.trim().length < 2}
            onClick={() => void continuarNovo()}
            className="flex h-14 w-full items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
          >
            {ocupado ? 'Conferindo…' : 'Continuar'}
          </button>
          <button type="button" onClick={() => setNovo(false)} className="flex h-12 w-full items-center justify-center text-sm text-muted-foreground">
            Voltar para a lista
          </button>
        </section>
      )}

      {novo && parecidos && (
        <section className="space-y-3">
          {parecidos.map((p) => (
            <div key={p.id} className="card-surface space-y-3 p-4">
              <p className="text-sm">
                Já existe <strong>“{p.name}”</strong> a {metros(p.distance_m)}: é esse?
              </p>
              <button type="button" onClick={() => setEscolhido({ nome: p.name, lead_id: p.id })} className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                É esse
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEscolhido({ nome: novoNome.trim(), new_place: { name: novoNome.trim(), address: novoEndereco.trim() || undefined }, confirm_new: true })}
            className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold"
          >
            É outro lugar
          </button>
        </section>
      )}
    </main>
  );
}
