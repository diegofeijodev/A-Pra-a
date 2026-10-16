'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fmtBR } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import type { RouteView, StopView } from '@/modules/campo/domain/campo.types';
import { useEditarRota } from '@/modules/consultores/application/use-consultores';
import { useLeads } from '@/modules/leads/application/use-leads';

const RotaMapa = dynamic(() => import('./RotaMapa'), { ssr: false });

const MOTIVO: Record<string, string> = { novo: 'novo', retorno: 'retorno', pendente: 'pendente', incluido: 'incluído' };

/** Rota de um dia (§21.5): mapa + lista. Admin reordena, tira e inclui paradas. */
export function RotaEditor({ rota, onFechar }: { rota: RouteView; onFechar: () => void }) {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const salvar = useEditarRota();
  const [paradas, setParadas] = useState<StopView[]>(() => rota.stops.filter((s) => !s.removed));
  const [busca, setBusca] = useState('');
  const [mudou, setMudou] = useState(false);
  const { data: achados } = useLeads({ praca_id: rota.praca_id, q: busca.trim() }, { enabled: admin && busca.trim().length >= 2 });

  useEffect(() => {
    setParadas(rota.stops.filter((s) => !s.removed));
    setMudou(false);
  }, [rota]);

  const renumerar = (l: StopView[]) => l.map((s, i) => ({ ...s, position: i + 1 }));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= paradas.length) return;
    const l = [...paradas];
    [l[i], l[j]] = [l[j]!, l[i]!];
    setParadas(renumerar(l));
    setMudou(true);
  };
  const tirar = (i: number) => {
    setParadas(renumerar(paradas.filter((_, k) => k !== i)));
    setMudou(true);
  };
  const incluir = (l: { id: string; name: string; address: string; phone: string; classe: string; stage: number }) => {
    if (paradas.some((s) => s.lead_id === l.id)) return;
    setParadas(
      renumerar([
        ...paradas,
        { id: `novo-${l.id}`, position: 0, lead_id: l.id, lead_name: l.name, address: l.address, bairro: null, phone: l.phone, lat: null, lng: null, classe: l.classe, stage: l.stage, reason: 'incluido', removed: false, visit: null },
      ]),
    );
    setBusca('');
    setMudou(true);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rota.consultant_name} · {fmtBR(rota.day)}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {rota.counts.visitados} de {rota.counts.total} visitados · meta {rota.goal} · rota {rota.status}
          {rota.source === 'admin' ? ' · ajustada pela equipe' : ''}
        </p>
        <RotaMapa paradas={paradas} dark={user?.theme !== 'light'} />
        <ol className="space-y-1">
          {paradas.map((s, i) => (
            <li key={s.lead_id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
              <span className="w-6 text-center font-mono text-xs text-muted-foreground">{s.position}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.lead_name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[s.address, s.bairro].filter(Boolean).join(' · ')} · {MOTIVO[s.reason] ?? s.reason}
                  {s.visit ? ' · visitado' : ''}
                </p>
              </div>
              {admin && (
                <span className="flex shrink-0 gap-1">
                  <button aria-label="Subir" onClick={() => mover(i, -1)} className="rounded p-1 hover:bg-secondary"><ArrowUp size={14} /></button>
                  <button aria-label="Descer" onClick={() => mover(i, 1)} className="rounded p-1 hover:bg-secondary"><ArrowDown size={14} /></button>
                  <button aria-label={`Tirar ${s.lead_name}`} onClick={() => tirar(i)} disabled={!!s.visit} className="rounded p-1 hover:bg-secondary disabled:opacity-30"><X size={14} /></button>
                </span>
              )}
            </li>
          ))}
        </ol>
        {admin && (
          <div className="space-y-2">
            <Input aria-label="Incluir estabelecimento" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Incluir estabelecimento (nome)" />
            {busca.trim().length >= 2 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {(achados ?? []).slice(0, 10).map((l) => (
                  <li key={l.id}>
                    <button onClick={() => incluir(l)} className="w-full rounded-md border border-border px-2 py-1 text-left text-xs hover:border-primary">
                      {l.name} <span className="text-muted-foreground">· {l.address || 'sem endereço'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              className="w-full"
              disabled={!mudou || salvar.isPending}
              onClick={() => salvar.mutate({ id: rota.id, stops: paradas.map((s) => ({ lead_id: s.lead_id })) }, { onSuccess: onFechar })}
            >
              Salvar rota
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
