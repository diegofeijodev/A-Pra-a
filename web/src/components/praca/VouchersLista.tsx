'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtBR, fmtDateTime } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useDecidirVoucher, useVoucherUsado, useVouchers } from '@/modules/consultores/application/use-consultores';
import type { StatusVoucher, VoucherView } from '@/modules/consultores/infrastructure/consultores.api';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const ROTULO: Record<StatusVoucher, string> = {
  solicitado: 'pedido — aguardando',
  liberado: 'liberado',
  recusado: 'recusado',
  usado: 'usado',
  expirado: 'expirado',
};
const COR: Record<StatusVoucher, string> = {
  solicitado: 'bg-primary/15 text-primary',
  liberado: 'bg-success/15 text-success',
  recusado: 'bg-danger/15 text-danger',
  usado: 'bg-secondary text-foreground',
  expirado: 'bg-secondary text-muted-foreground',
};

function Pedido({ v, admin }: { v: VoucherView; admin: boolean }) {
  const decidir = useDecidirVoucher();
  const [ref, setRef] = useState('');
  const [motivo, setMotivo] = useState('');
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-muted-foreground">
        Lance no Freela o voucher (1 freelancer grátis numa vaga) para este estabelecimento e libere aqui. Vale até {fmtBR(v.valid_until)}.
      </p>
      {admin && (
        <div className="flex flex-wrap gap-2">
          <Input aria-label={`Referência no Freela — ${v.code}`} value={ref} maxLength={120} onChange={(e) => setRef(e.target.value)} placeholder="Referência no Freela (opcional)" className="h-9 min-w-0 flex-1" />
          <Button size="sm" onClick={() => decidir.mutate({ id: v.id, decision: 'liberado', ...(ref.trim() ? { freela_ref: ref.trim() } : {}) })} disabled={decidir.isPending}>
            Liberar
          </Button>
          <Input aria-label={`Motivo da recusa — ${v.code}`} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo para recusar" className="h-9 min-w-0 flex-1" />
          <Button size="sm" variant="outline" onClick={() => decidir.mutate({ id: v.id, decision: 'recusado', note: motivo.trim() })} disabled={decidir.isPending || !motivo.trim()}>
            Recusar
          </Button>
        </div>
      )}
    </div>
  );
}

/** Equipe → Vouchers (§21.7): o representante pede na visita, o gestor libera no Freela e marca usado. */
export function VouchersLista() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const [filtro, setFiltro] = useState<StatusVoucher | ''>('');
  const { data = [], isPending, isError, error } = useVouchers(filtro || undefined);
  const usado = useVoucherUsado();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(['', 'solicitado', 'liberado', 'usado', 'recusado', 'expirado'] as const).map((s) => (
          <button
            key={s || 'todos'}
            onClick={() => setFiltro(s)}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
          >
            {s ? ROTULO[s] : 'todos'}
          </button>
        ))}
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">{apiErrorMessage(error, 'Não foi possível carregar os vouchers.')}</p>
      ) : !data.length ? (
        <p className="text-sm text-muted-foreground">Nenhum voucher {filtro ? ROTULO[filtro] : 'ainda'}.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((v) => (
            <li key={v.id} className="card-surface p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">
                  <span className="font-mono font-bold">{v.code}</span> · {v.lead_name}
                </p>
                <span className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${COR[v.status]}`}>{ROTULO[v.status]}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Pedido por {v.consultant_name} em {fmtDateTime(v.created_at)} · vale até {fmtBR(v.valid_until)}
                {v.decided_by_name ? ` · ${v.status === 'recusado' ? 'recusado' : 'liberado'} por ${v.decided_by_name}` : ''}
                {v.freela_ref ? ` · Freela: ${v.freela_ref}` : ''}
                {v.decision_note ? ` · ${v.decision_note}` : ''}
              </p>
              {v.status === 'solicitado' && <Pedido v={v} admin={admin} />}
              {v.status === 'liberado' && admin && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => usado.mutate(v.id)} disabled={usado.isPending}>
                  Marcar como usado
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
