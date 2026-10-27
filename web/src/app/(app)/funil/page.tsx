'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Search, Upload } from 'lucide-react';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { fmtBR } from '@/lib/dates';
import { fmtBRL } from '@/lib/format';
import { useUiStore } from '@/lib/ui-store';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  isCritical,
  isStalled,
  useLeadMetrics,
  useLeads,
  type LeadListView,
} from '@/modules/leads/application/use-leads';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { Avatar } from '@/components/praca/bits';
import { MoveLeadDialog } from '@/components/praca/MoveLeadDialog';
import { NovoLeadDialog } from '@/components/praca/NovoLeadDialog';

/**
 * Funil de contratantes — porte de `.prototype/src/routes/funil.tsx`.
 *
 * Desvio §9: as seis métricas do topo saem de `GET /v1/leads/metrics` (o
 * protótipo recontava tudo no navegador a cada render, e a média de dias até
 * cadastrar precisa da base inteira, não da página filtrada). O quadro lê
 * `GET /v1/leads` com `praca_id` e `archived`; busca, dono e classificação
 * continuam sendo filtro de tela, como no protótipo — são três `<select>` que
 * não valem uma ida ao servidor por tecla.
 */
export default function FunilPage() {
  const { praca, isPending: pracasPending } = useActivePraca();
  const openLead = useUiStore((s) => s.openLead);
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [classe, setClasse] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string; to: number } | null>(null);
  const [novo, setNovo] = useState(false);

  const { data: metrics } = useLeadMetrics(praca?.id);
  const { data: all } = useLeads(
    { praca_id: praca?.id, archived: showArchived ? 'true' : 'false' },
    { enabled: !!praca?.id },
  );

  const leads = useMemo(
    () =>
      (all ?? []).filter((l) => {
        if (!showArchived && l.archived) return false;
        if (owner !== "all" && l.owner_id !== owner) return false;
        if (classe !== "all" && l.classe !== classe) return false;
        const t = q.trim().toLowerCase();
        if (t && !`${l.name} ${l.city} ${l.decisor}`.toLowerCase().includes(t)) return false;
        return true;
      }),
    [all, q, owner, classe, showArchived],
  );

  if (pracasPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!praca) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma praça ainda — abra a primeira em <Link href={ROTA.pracas} className="text-primary hover:underline">Praças</Link>.
      </p>
    );
  }

  const people = (users ?? []).filter((u) => u.active);
  const move = (id: string, name: string, to: number, from: number) => {
    if (from === to) return;
    setPending({ id, name, to });
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tag text-muted-foreground">Funil de contratantes</p>
          <h1 className="font-display text-2xl font-black tracking-tight">{praca.name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Bares, restaurantes, hotéis, buffets e casas de evento mapeados na praça.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/entrada" className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            <Upload size={14} /> Entrada de leads
          </Link>
          <button
            onClick={() => setNovo(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
          >
            <Plus size={14} /> Novo lead
          </button>
        </div>

      </div>

      {/* métricas */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Leads no funil" v={String(metrics?.total ?? 0)} />
        <Metric label="Contatado → cadastrado" v={`${metrics?.conv_contact ?? 0}%`} />
        <Metric label="Cadastrado → ativo" v={`${metrics?.conv_active ?? 0}%`} />
        <Metric label="Dias até cadastrar" v={`${metrics?.avg_days ?? 0}d`} />
        <Metric label="Parados +7 dias" v={String(metrics?.stalled ?? 0)} tone={metrics?.stalled ? "warn" : undefined} />
        <Metric label="Valor estimado" v={fmtBRL(metrics?.pipeline ?? 0)} />
      </div>

      {/* filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
          <Search size={13} className="text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar estabelecimento" className="w-44 bg-transparent text-sm outline-none" />
        </label>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="all">Todos os donos</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={classe} onChange={(e) => setClasse(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="all">Todas as classificações</option>
          {(catalog?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> mostrar arquivados
        </label>
      </div>

      {/* kanban */}
      <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
        {(catalog?.funnel_stages ?? []).map((st) => {
          const col = leads.filter((l) => l.stage === st.n);
          const val = col.reduce((a, l) => a + l.est_value, 0);
          return (
            <div
              key={st.n}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const l = drag ? leads.find((x) => x.id === drag) : undefined;
                if (l) move(l.id, l.name, st.n, l.stage);
                setDrag(null);
              }}
              className="flex w-64 shrink-0 flex-col rounded-lg border border-border bg-card/60"
            >
              <div className="rounded-t-lg border-b border-border px-3 py-2" style={{ borderTop: `3px solid ${st.color}` }}>
                <p className="text-xs font-bold" style={{ color: st.color }}>{st.n}. {st.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{col.length} leads · {fmtBRL(val)}</p>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {col.length === 0 && <p className="px-1 py-3 text-[11px] text-muted-foreground">Nada aqui.</p>}
                {col.map((l) => (
                  <LeadCard key={l.id} lead={l} onDragStart={() => setDrag(l.id)} onOpen={() => openLead(l.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {pending && (
        <MoveLeadDialog leadId={pending.id} leadName={pending.name} to={pending.to} onClose={() => setPending(null)} />
      )}
      {novo && <NovoLeadDialog onClose={() => setNovo(false)} />}
    </>
  );
}

function Metric({ label, v, tone }: { label: string; v: string; tone?: "warn" | undefined }) {
  return (
    <div className={`rounded-lg border border-border p-3 ${tone === "warn" ? "bg-warning/10" : "bg-card/60"}`}>
      <p className="tag text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-extrabold">{v}</p>
    </div>
  );
}

function LeadCard({
  lead,
  onDragStart,
  onOpen,
}: {
  lead: LeadListView;
  onDragStart: () => void;
  onOpen: () => void;
}) {
  const { data: users } = useUsers();
  const days = lead.stalled_days;
  const crit = isCritical(lead);
  const warn = isStalled(lead);
  const last = lead.last_contact_date;
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className={`w-full rounded-md border bg-card p-2.5 text-left transition-colors hover:border-primary ${
        crit ? "border-danger" : warn ? "border-danger/70" : "border-border"
      } ${lead.archived ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{lead.name}</p>
        {crit && <AlertTriangle size={14} className="shrink-0 text-danger" />}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{lead.city} · {lead.decisor}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Avatar person={users?.find((u) => u.id === lead.owner_id)} size={16} />
          <span className="tag rounded-sm bg-secondary/70 px-1.5 py-0.5 text-muted-foreground">{fmtBRL(lead.est_value)}</span>
        </span>
        <span className={`text-[11px] ${crit ? "text-danger" : warn ? "text-warning" : "text-muted-foreground"}`}>{days}d</span>
      </div>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
        {lead.next_step ? `→ ${lead.next_step.what} · ${fmtBR(lead.next_step.date)}` : lead.lost_reason ? `perdido: ${lead.lost_reason}` : "sem próximo passo"}
      </p>
      {last && <p className="text-[10px] text-muted-foreground">último contato {fmtBR(last)}</p>}
    </button>
  );
}
