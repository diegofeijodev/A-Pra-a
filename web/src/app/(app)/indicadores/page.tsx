'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import { fmtBR, todaySp } from '@/lib/dates';
import { fmtVal } from '@/lib/format';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useAddEntry,
  useCanalRows,
  useEmpresa,
  useIndicators,
  usePessoaRows,
  usePracaRows,
  type IndReadingView,
  type PeriodParams,
} from '@/modules/indicators/application/use-indicators';
import {
  useActivePraca,
  useSetActivePraca,
} from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { Avatar } from '@/components/praca/bits';
import { Bars, Cell, HeroCard, Line, SEM_DOT, SEM_TEXT } from '@/components/praca/IndBits';

/**
 * Indicadores — porte de `.prototype/src/routes/indicadores.tsx`.
 *
 * Desvio §16: as 428 linhas de cálculo do protótipo
 * (`lib/praca/indicadores.ts`) são do SERVIDOR. Cada aba é uma rota
 * (`/v1/indicators`, `/empresa`, `/pracas`, `/pessoas`, `/canais`) que monta o
 * retrato do banco e devolve número cru; a tela só formata (`fmtVal`) e pinta o
 * semáforo. A janela do período também sai do servidor (`todaySp()` em
 * Brasília) — daqui sobe só o `period`, e `from`/`to` apenas em "período livre".
 */

type View = "empresa" | "praca" | "pessoa" | "canal";
const VIEWS: { id: View; label: string }[] = [
  { id: "empresa", label: "Empresa" },
  { id: "praca", label: "Praça" },
  { id: "pessoa", label: "Pessoa" },
  { id: "canal", label: "Canal" },
];

export default function IndicadoresPage() {
  const { praca, isPending: pracasPending } = useActivePraca();
  const { data: catalog } = useCatalog();
  const setActivePraca = useSetActivePraca();
  const router = useRouter();
  const [view, setView] = useState<View>("empresa");
  const [pid, setPid] = useState("mes");
  const [livre, setLivre] = useState(() => ({ from: todaySp().slice(0, 8) + "01", to: todaySp() }));

  // `from`/`to` só sobem em "livre": nos outros períodos o contrato os ignora e
  // quem manda é a janela calculada no servidor.
  const params: PeriodParams =
    pid === "livre" ? { period: pid, from: livre.from, to: livre.to } : { period: pid };
  // Empresa e Praça olham TODAS as praças; Pessoa e Canal, só a ativa — o
  // mesmo recorte do protótipo (`scope = view === "empresa" || "praca" ? null : praca.id`).
  const escopoDaPraca = view === "pessoa" || view === "canal";
  const { data: readings } = useIndicators({
    ...params,
    scope: escopoDaPraca ? "praca" : "empresa",
    ...(escopoDaPraca ? { praca_id: praca?.id } : {}),
  });
  const range = readings?.range;

  if (pracasPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!praca) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma praça ainda — abra a primeira em <Link href="/praca" className="text-primary hover:underline">Praça</Link>.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold">Indicadores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Praças, funil, mensagens e campanhas em um só painel. Verde bateu a meta · amarelo até 15% fora · vermelho abaixo disso.
          </p>
        </div>
        <button onClick={() => window.print()} className="no-print rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
          Exportar PDF
        </button>
      </div>

      <div className="no-print mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >{v.label}</button>
          ))}
        </div>
        <select
          value={pid}
          onChange={(e) => setPid(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
        >
          {(catalog?.periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {pid === "livre" && (
          <span className="flex items-center gap-1 text-xs">
            <input type="date" value={livre.from} onChange={(e) => setLivre({ ...livre, from: e.target.value })} className="rounded-md border border-input bg-background px-2 py-1 text-xs" />
            <span className="text-muted-foreground">até</span>
            <input type="date" value={livre.to} onChange={(e) => setLivre({ ...livre, to: e.target.value })} className="rounded-md border border-input bg-background px-2 py-1 text-xs" />
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">{fmtBR(range?.from)} → {fmtBR(range?.to)}</span>
      </div>

      {view === "empresa" && <Empresa params={params} />}
      {view === "praca" && (
        <PracaView
          params={params}
          onOpen={(id) => setActivePraca.mutate(id, { onSuccess: () => router.push("/praca") })}
        />
      )}
      {view === "pessoa" && <PessoaView params={params} />}
      {view === "canal" && <CanalView params={params} pracaId={praca.id} />}

      <ListaCompleta readings={readings?.readings ?? []} pracaId={praca.id} />
    </>
  );
}

// ── Empresa ───────────────────────────────────────────────────
function Empresa({ params }: { params: PeriodParams }) {
  const { data } = useEmpresa(params);
  const heroes = data?.heroes ?? [];
  const milestones = data?.milestones ?? [];
  const months = data?.months ?? [];
  const changed = data?.changed ?? { good: [], bad: [] };
  const maxY = Math.max(1, ...months.map((m) => Math.max(m.value, m.meta)));

  return (
    <div className="mt-5 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {heroes.map((r) => <HeroCard key={r.key} r={r} />)}
      </div>

      <section>
        <h2 className="font-display text-sm font-extrabold">Metas por horizonte</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {milestones.map((m) => (
            <div key={m.label} className="card-surface p-3">
              <p className="tag text-primary">{m.label}</p>
              <ul className="mt-2 space-y-2">
                {m.targets.map((t) => (
                  <li key={t.name}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">{t.name}</span>
                      <span className="font-bold tabular-nums">{fmtVal(t.value, t.unit)} / {t.dir === "lte" ? "≤ " : ""}{t.meta.toLocaleString("pt-BR")}{t.unit}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-secondary/60">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${t.pct}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{Math.round(t.pct)}% do caminho</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="card-surface p-3">
        <h2 className="font-display text-sm font-extrabold">Clientes ativos mês a mês</h2>
        <p className="text-[11px] text-muted-foreground">A linha clara atrás é a meta do mês.</p>
        <div className="mt-3 flex h-40 items-end gap-1.5">
          {months.map((m) => (
            <div key={m.month} className="relative flex flex-1 flex-col items-center justify-end gap-1">
              <div className="relative flex h-32 w-full items-end justify-center">
                <div className="absolute inset-x-0 rounded-sm bg-muted-foreground/25" style={{ height: `${(m.meta / maxY) * 100}%` }} />
                <div className="relative z-10 w-2/3 rounded-sm bg-primary" style={{ height: `${(m.value / maxY) * 100}%`, minHeight: 2 }} />
              </div>
              <span className="text-[9px] text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card-surface p-3">
        <h2 className="font-display text-sm font-extrabold">O que mudou desde a semana passada</h2>
        {changed.good.length === 0 && changed.bad.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">Nenhuma variação relevante nos últimos 7 dias.</p>
        )}
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="tag text-success">Para bom</p>
            <ul className="mt-1 space-y-1 text-xs">
              {changed.good.map((c) => (
                <li key={c.name}>{c.name} foi de {fmtVal(c.from, c.unit)} para {fmtVal(c.to, c.unit)} ({c.pct > 0 ? "+" : ""}{Math.round(c.pct)}%).</li>
              ))}
              {!changed.good.length && <li className="text-muted-foreground">nada melhorou de forma clara.</li>}
            </ul>
          </div>
          <div>
            <p className="tag text-danger">Para ruim</p>
            <ul className="mt-1 space-y-1 text-xs">
              {changed.bad.map((c) => (
                <li key={c.name}>{c.name} foi de {fmtVal(c.from, c.unit)} para {fmtVal(c.to, c.unit)} ({c.pct > 0 ? "+" : ""}{Math.round(c.pct)}%) — cobrar o dono.</li>
              ))}
              {!changed.bad.length && <li className="text-muted-foreground">nada piorou de forma clara.</li>}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Praça ─────────────────────────────────────────────────────
function PracaView({ params, onOpen }: { params: PeriodParams; onOpen: (id: string) => void }) {
  const { data } = usePracaRows(params);
  const rows = data ?? [];

  return (
    <div className="mt-5 space-y-5">
      <div className="card-surface overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Praça", "Etapa", "Ativos", "Recontratação", "Preenchimento", "Falta", "Freelancers", "Custo/cliente", "Atrasadas"].map((h) => (
                <th key={h} className="tag px-3 py-2.5 text-left text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.praca.id} onClick={() => onOpen(r.praca.id)} className="cursor-pointer border-b border-border/50 hover:bg-secondary/40">
                <td className="px-3 py-2.5 font-semibold">{r.praca.name}</td>
                <td className="px-3 py-2.5 text-muted-foreground">Etapa {r.step_atual}</td>
                <td className="px-3 py-2.5"><Cell value={r.ativos} meta={30} dir="gte" unit="" /></td>
                <td className="px-3 py-2.5"><Cell value={r.recontratacao} meta={50} dir="gte" unit="%" /></td>
                <td className="px-3 py-2.5"><Cell value={r.fill} meta={4} dir="lte" unit="h" /></td>
                <td className="px-3 py-2.5"><Cell value={r.falta} meta={3} dir="lte" unit="%" /></td>
                <td className="px-3 py-2.5"><Cell value={r.freelancers} meta={40} dir="gte" unit="" /></td>
                <td className="px-3 py-2.5"><Cell value={r.custo} meta={130} dir="lte" unit="R$" /></td>
                <td className="px-3 py-2.5"><Cell value={r.atrasadas} meta={0} dir="lte" unit="" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card-surface p-3">
        <h2 className="font-display text-sm font-extrabold">Praças ativas nos três números do portão final</h2>
        <p className="text-[11px] text-muted-foreground">Clientes ativos, recontratação em 30 dias e falta — o que decide se a praça está de pé.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Clientes ativos", meta: 30, dir: "gte" as const, unit: "", pick: (r: (typeof rows)[number]) => r.ativos as number | null },
            { label: "Recontratação", meta: 50, dir: "gte" as const, unit: "%", pick: (r: (typeof rows)[number]) => r.recontratacao },
            { label: "Falta", meta: 3, dir: "lte" as const, unit: "%", pick: (r: (typeof rows)[number]) => r.falta },
          ].map((col) => (
            <div key={col.label}>
              <p className="tag text-muted-foreground">{col.label}</p>
              <ul className="mt-1.5 space-y-1.5">
                {rows.map((r) => {
                  const v = col.pick(r);
                  const sem = semaphore(v, col.meta, col.dir);
                  return (
                    <li key={r.praca.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{r.praca.name}</span>
                      <span className={`font-bold tabular-nums ${SEM_TEXT[sem]}`}>{fmtVal(v, col.unit)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * A mesma regra do `semaphore` do servidor (§16), repetida aqui porque estas
 * três colunas são recorte de TELA sobre linhas que já vieram prontas — o
 * `IndPracaRowView` traz o número, não a cor.
 */
function semaphore(value: number | null, meta: number, dir: "gte" | "lte") {
  // `!Number.isFinite` junto com o `== null` porque a regra prometida é a do
  // servidor (e a do protótipo): número quebrado não pinta semáforo.
  if (value == null || !Number.isFinite(value)) return "none" as const;
  if (dir === "gte") return value >= meta ? "ok" : value >= meta * 0.85 ? "warn" : "bad";
  return value <= meta ? "ok" : value <= meta * 1.15 ? "warn" : "bad";
}

// ── Pessoa ────────────────────────────────────────────────────
function PessoaView({ params }: { params: PeriodParams }) {
  const { data } = usePessoaRows(params);
  const { data: users } = useUsers();
  const rows = data ?? [];

  return (
    <div className="mt-5 space-y-3">
      <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
        Esta visão é para a conversa individual com cada pessoa: entender onde apoiar e o que destravar. Não é ranking público nem placar entre o time.
      </p>
      <div className="card-surface overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Pessoa", "Concluídas no prazo", "Atrasadas", "Leads tocados", "Avançaram de etapa", "Clientes fechados", "Vagas rodadas"].map((h) => (
                <th key={h} className="tag px-3 py-2.5 text-left text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2 font-semibold"><Avatar person={users?.find((u) => u.id === r.id)} size={20} />{r.name}</span>
                </td>
                <td className="px-3 py-2.5 font-bold tabular-nums text-success">{r.no_prazo}</td>
                <td className={`px-3 py-2.5 font-bold tabular-nums ${r.atrasadas ? "text-danger" : "text-muted-foreground"}`}>{r.atrasadas}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.leads_tocados}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.leads_avancados}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.fechados}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.vagas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Canal ─────────────────────────────────────────────────────
function CanalView({ params, pracaId }: { params: PeriodParams; pracaId: string }) {
  const { data } = useCanalRows(pracaId, params);
  const { data: catalog } = useCatalog();
  const rows = data ?? [];
  const comBase = rows.filter((r) => r.leads > 0);

  return (
    <div className="mt-5 space-y-5">
      <div className="card-surface overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Canal", "Leads gerados", "Conversão até cliente ativo", "Custo por cliente ativo", "Tempo até a primeira vaga"].map((h) => (
                <th key={h} className="tag px-3 py-2.5 text-left text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="px-3 py-2.5 font-semibold">{r.label}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.leads}</td>
                <td className="px-3 py-2.5"><Cell value={r.conv} meta={10} dir="gte" unit="%" /></td>
                <td className="px-3 py-2.5"><Cell value={r.custo} meta={130} dir="lte" unit="R$" /></td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.tempo_primeira_vaga == null ? "—" : `${Math.round(r.tempo_primeira_vaga)} dias`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card-surface p-3">
        <h2 className="font-display text-sm font-extrabold">Custo por cliente ativo entre canais</h2>
        <p className="text-[11px] text-muted-foreground">É esta barra que diz onde colocar o próximo real. Canal sem mídia paga aparece em zero.</p>
        <div className="mt-3">
          <Bars rows={(comBase.length ? comBase : rows).map((r) => ({ label: r.label, value: r.custo }))} unit="R$" />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Canais mapeados: {(catalog?.canais ?? []).map((c) => c.label.toLowerCase()).join(" · ")}.</p>
      </section>
    </div>
  );
}

// ── lista completa ────────────────────────────────────────────
function ListaCompleta({ readings, pracaId }: { readings: IndReadingView[]; pracaId: string }) {
  const { data: users } = useUsers();
  const addEntry = useAddEntry();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  return (
    <section className="mt-6">
      <h2 className="font-display text-sm font-extrabold">Lista completa dos indicadores</h2>
      <p className="text-[11px] text-muted-foreground">Nome, o que mede, meta, valor atual, frequência, dono e de onde vem o número. Clique para ver o histórico.</p>
      <div className="mt-2 card-surface overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border">
              {["", "Indicador", "Meta", "Atual", "Frequência", "Dono", "Fonte", "Lançar"].map((h) => (
                <th key={h} className="tag px-3 py-2.5 text-left text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readings.map((r) => {
              const gray = r.source === "manual" && r.stale;
              return (
                <Fragment key={r.key}>
                  <tr onClick={() => setOpen(open === r.key ? null : r.key)} className={`cursor-pointer border-b border-border/50 hover:bg-secondary/30 ${gray ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2.5"><span className={`inline-block h-3 w-3 rounded-full ${SEM_DOT[gray ? "none" : r.sem]}`} /></td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.what}</p>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.meta_label}</td>
                    <td className="px-3 py-2.5">
                      <span className={`font-display text-lg font-extrabold tabular-nums ${gray ? "text-muted-foreground" : SEM_TEXT[r.sem]}`}>{fmtVal(r.value, r.unit)}</span>
                      {gray && <p className="text-[10px] font-bold text-warning">número velho</p>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.freq}</td>
                    <td className="px-3 py-2.5"><Avatar person={users?.find((u) => u.id === r.owner_id)} size={20} /></td>
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                      {r.origem}
                      <span className="ml-1 rounded-sm bg-secondary/70 px-1 py-0.5 text-[10px]">{r.source === "sistema" ? "calculado" : "à mão"}</span>
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={draft[r.key] ?? ""}
                          onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                          placeholder="valor"
                          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                        />
                        <button
                          onClick={() => {
                            const v = draft[r.key];
                            if (v != null && v !== "") {
                              addEntry.mutate(
                                { key: r.key, input: { praca_id: pracaId, date: todaySp(), value: Number(v) } },
                                { onSuccess: () => setDraft((d) => ({ ...d, [r.key]: "" })) },
                              );
                            }
                          }}
                          className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground"
                        >+</button>
                      </div>
                    </td>
                  </tr>
                  {open === r.key && (
                    <tr className="border-b border-border/50 bg-secondary/20">
                      <td />
                      <td colSpan={7} className="px-3 py-3">
                        <p className="tag text-muted-foreground">Histórico</p>
                        <div className="mt-1 max-w-md"><Line entries={r.history} /></div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {r.history.length ? `${r.history.length} lançamentos · último em ${fmtBR(r.last_at ?? undefined)}` : "Nenhum lançamento guardado ainda."}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
