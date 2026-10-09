'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { irPara } from '@/modules/campo/application/use-tela';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useDia } from '@/modules/campo/application/use-campo';
import { enfileirar } from '@/modules/campo/application/use-fila';
import { useOnline } from '@/modules/campo/application/use-online';
import type { PlaceView, Posicao } from '@/modules/campo/domain/campo.types';
import { seguirSemConferirParecidos } from '@/modules/campo/domain/fila-politica';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { campoBuscarLugares, campoLugaresParecidos, campoLugaresPerto } from '@/modules/campo/infrastructure/campo.api';
import { prepararFoto } from '@/modules/campo/infrastructure/foto-compressao';
import { liberarUrlDepois } from '@/modules/campo/infrastructure/object-url';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

type Modo = 'perto' | 'buscar' | 'novo';
interface Escolhido {
  nome: string;
  lead_id?: string;
  new_place?: { name: string; address?: string };
  confirm_new?: boolean;
}

const metros = (m: number | null) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

/** Visão `nova` de `/campo`: nova visita (spec §8.1): estabelecimento → foto da fachada → check-in (pela fila). */
export function NovaVisitaTela() {
  const online = useOnline();
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { dia, carregando } = useDia();
  const [modo, setModo] = useState<Modo>('perto');
  const [lugares, setLugares] = useState<PlaceView[] | null>(null);
  const [busca, setBusca] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoEndereco, setNovoEndereco] = useState('');
  const [parecidos, setParecidos] = useState<PlaceView[] | null>(null);
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Com visita aberta, não começa outra (uma por vez — spec §7).
  useEffect(() => {
    if (dia.visitaAberta) irPara({ v: 'visita', ref: dia.visitaAberta.ref }, 'replace');
  }, [dia.visitaAberta]);

  useEffect(() => {
    if (!foto) return;
    const u = URL.createObjectURL(foto);
    setPrevia(u);
    return () => liberarUrlDepois(u);
  }, [foto]);

  // Busca por nome com espera de 300 ms; precisa de sinal.
  useEffect(() => {
    if (modo !== 'buscar' || busca.trim().length < 2 || !online) return;
    const t = window.setTimeout(() => {
      campoBuscarLugares(busca.trim())
        .then(setLugares)
        .catch((e) => toast.error(apiErrorMessage(e, 'Não foi possível buscar.')));
    }, 300);
    return () => window.clearTimeout(t);
  }, [modo, busca, online]);

  async function posicao(): Promise<Posicao | null> {
    setGps(null);
    try {
      return await lerPosicao();
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível pegar a localização.');
      return null;
    }
  }

  async function procurarPerto() {
    setOcupado(true);
    try {
      const p = await posicao();
      if (p) setLugares(await campoLugaresPerto(p.lat, p.lng));
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Não foi possível procurar.'));
    } finally {
      setOcupado(false);
    }
  }

  async function continuarNovo() {
    const name = novoNome.trim();
    if (name.length < 2) return;
    const novo: Escolhido = { nome: name, new_place: { name, address: novoEndereco.trim() || undefined } };
    if (!online) {
      // Sem sinal não dá para perguntar; o servidor marca `possible_dup` se houver parecido (decisão 2).
      setEscolhido(novo);
      return;
    }
    setOcupado(true);
    try {
      const p = await posicao();
      if (!p) return;
      const achados = await campoLugaresParecidos(name, p.lat, p.lng);
      if (achados.length > 0) setParecidos(achados);
      else setEscolhido({ ...novo, confirm_new: true });
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      const code = axios.isAxiosError(e) ? (e.response?.data?.error?.code as string | undefined) : undefined;
      // Sem resposta/timeout ou jornada ainda na fila: segue como o caminho sem sinal.
      if (seguirSemConferirParecidos(status, code)) setEscolhido(novo);
      else toast.error(apiErrorMessage(e, 'Não foi possível conferir parecidos.'));
    } finally {
      setOcupado(false);
    }
  }

  async function aoEscolherFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      setFoto(await prepararFoto(arquivo));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível usar esta foto.');
    }
  }

  async function fazerCheckin() {
    if (!escolhido || !foto) return;
    setOcupado(true);
    try {
      const p = await posicao();
      if (!p) return;
      const client_id = crypto.randomUUID();
      await enfileirar(
        {
          kind: 'checkin',
          payload: {
            client_id,
            ...p,
            lead_id: escolhido.lead_id,
            new_place: escolhido.new_place,
            confirm_new: escolhido.confirm_new,
            place_name: escolhido.nome,
          },
          foto,
        },
        consultantId,
      );
      irPara({ v: 'visita', ref: client_id }, 'replace');
    } catch {
      toast.error('Não foi possível guardar o check-in neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!dia.jornada) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Nova visita" />
        <p className="card-surface p-5 text-sm">Inicie a jornada antes de visitar.</p>
        <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar
        </button>
      </main>
    );
  }

  return (
    <main className="space-y-5 pb-28">
      <CampoTopo titulo="Nova visita" />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}

      {!escolhido ? (
        <section className="space-y-4">
          <div role="tablist" className="grid grid-cols-3 gap-2">
            {([['perto', 'Perto de mim'], ['buscar', 'Buscar'], ['novo', 'Novo estabelecimento']] as [Modo, string][]).map(
              ([m, rotulo]) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={modo === m}
                  onClick={() => {
                    setModo(m);
                    setLugares(null);
                    setParecidos(null);
                  }}
                  className={`h-12 rounded-md border text-xs font-bold ${modo === m ? 'border-primary bg-primary/15 text-primary' : 'border-border'}`}
                >
                  {rotulo}
                </button>
              ),
            )}
          </div>

          {modo !== 'novo' && !online && (
            <p className="text-sm text-muted-foreground">Sem sinal: procurar e buscar precisam de internet. Use “Novo estabelecimento”.</p>
          )}

          {modo === 'perto' && online && (
            <Button onClick={() => void procurarPerto()} disabled={ocupado} className="h-12 w-full">
              {ocupado ? 'Procurando…' : 'Procurar perto de mim'}
            </Button>
          )}

          {modo === 'buscar' && (
            <Input id="busca-lugar" aria-label="Nome do estabelecimento" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do estabelecimento" />
          )}

          {modo !== 'novo' && lugares && (
            lugares.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada encontrado. Tente “Novo estabelecimento”.</p>
            ) : (
              <ul className="space-y-2">
                {lugares.map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => setEscolhido({ nome: l.name, lead_id: l.id })}
                      className="card-surface w-full p-3 text-left"
                    >
                      <p className="font-bold">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[l.address, metros(l.distance_m)].filter(Boolean).join(' · ')}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

          {modo === 'novo' && !parecidos && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="novo-nome">Nome</Label>
                <Input id="novo-nome" value={novoNome} maxLength={120} onChange={(e) => setNovoNome(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="novo-endereco">Endereço</Label>
                <Input id="novo-endereco" value={novoEndereco} maxLength={200} onChange={(e) => setNovoEndereco(e.target.value)} />
              </div>
              <Button onClick={() => void continuarNovo()} disabled={ocupado || novoNome.trim().length < 2} className="h-12 w-full">
                Continuar
              </Button>
            </div>
          )}

          {modo === 'novo' && parecidos && (
            <div className="space-y-3">
              {parecidos.map((p) => (
                <div key={p.id} className="card-surface space-y-3 p-4">
                  <p className="text-sm">
                    Já existe <strong>“{p.name}”</strong> a {metros(p.distance_m)} — é esse?
                  </p>
                  <Button onClick={() => setEscolhido({ nome: p.name, lead_id: p.id })} className="h-11 w-full">
                    É esse
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setEscolhido({
                    nome: novoNome.trim(),
                    new_place: { name: novoNome.trim(), address: novoEndereco.trim() || undefined },
                    confirm_new: true,
                  })
                }
                className="h-11 w-full"
              >
                É outro estabelecimento
              </Button>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="card-surface flex items-center justify-between gap-3 p-4">
            <p className="font-bold">{escolhido.nome}</p>
            <button onClick={() => { setEscolhido(null); setFoto(null); setPrevia(null); }} className="text-xs text-primary">
              trocar
            </button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="foto-fachada">Foto da fachada (obrigatória)</Label>
            <input
              id="foto-fachada"
              type="file"
              accept="image/*"
              capture="environment"
              className="block w-full text-sm"
              onChange={(e) => void aoEscolherFoto(e.target.files?.[0])}
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, next/image não serve */}
            {previa && <img src={previa} alt="Foto da fachada" className="w-full rounded-md" />}
          </div>
        </section>
      )}

      {!escolhido && (
        <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar
        </button>
      )}

      {escolhido && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            <Button onClick={() => void fazerCheckin()} disabled={!foto || ocupado} className="h-14 w-full text-base">
              {ocupado ? 'Pegando a localização…' : 'Fazer check-in'}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
