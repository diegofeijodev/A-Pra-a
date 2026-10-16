'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { fmtBR, todaySp } from '@/lib/dates';
import { dueDateOf } from '@/lib/recurrence';
import { useUiStore } from '@/lib/ui-store';
import {
  useActions,
  useSetStepResult,
  useSteps,
  useUnlockStep,
} from '@/modules/actions/application/use-actions';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useActivePraca,
  usePracas,
  useSetActivePraca,
} from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { AberturaPraca } from '@/components/praca/AberturaPraca';
import { MapaEstabelecimentos } from '@/components/praca/MapaEstabelecimentos';
import { NewPracaForm } from '@/components/praca/NewPracaForm';
import { ActionRow, Avatar } from '@/components/praca/bits';

const STATUS_STYLE: Record<string, string> = {
  todo: "border-border text-muted-foreground",
  active: "border-warning bg-warning text-primary-foreground",
  done: "border-success bg-success text-primary-foreground",
  locked: "border-danger bg-danger/20 text-danger",
};

/**
 * Plano da praça — porte de `.prototype/src/routes/praca.tsx`.
 *
 * Desvio §9.2: o `stepInfo` que o protótipo calculava no navegador (status,
 * progresso, janela, motivo da tranca) vem pronto de
 * `GET /v1/pracas/:id/steps`. Desvio §9.3: o destrave não pede mais "por
 * quem" — autor é quem está logado.
 */
export default function PracaPage() {
  const { praca, isPending: pracasPending } = useActivePraca();
  const { data: pracas } = usePracas();
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const { data: steps } = useSteps(praca?.id);
  const { data: actions } = useActions(praca?.id);
  const setActivePraca = useSetActivePraca();
  const setStepResult = useSetStepResult();
  const unlockStep = useUnlockStep();
  const openAction = useUiStore((s) => s.openAction);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showAbertura, setShowAbertura] = useState(false);
  const [unlockFor, setUnlockFor] = useState<number | null>(null);
  const [unlockReason, setUnlockReason] = useState("");
  const [resultDraft, setResultDraft] = useState<Record<number, string>>({});

  const acts = actions ?? [];
  const person = (id: string) => users?.find((u) => u.id === id);

  return (
    <>
      {/* seletor de praça */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={praca?.id ?? ""}
          onChange={(e) => setActivePraca.mutate(e.target.value)}
          className="rounded-md border border-input bg-card px-3 py-2 font-display text-sm font-bold"
        >
          {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          onClick={() => setShowAbertura(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-display text-xs font-bold uppercase tracking-wide text-primary-foreground"
        >
          <MapPin size={13} /> Abertura de praça
        </button>
        <button onClick={() => setShowNew(!showNew)} className="tag rounded-md border border-primary px-3 py-2 text-primary">+ Nova praça</button>
      </div>
      {showNew && <div className="mt-3"><NewPracaForm onDone={() => setShowNew(false)} /></div>}
      {showAbertura && <AberturaPraca onClose={() => setShowAbertura(false)} />}

      {pracasPending && <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>}
      {/* Mesma redação das outras 7 telas ("Nenhuma praça ainda — abra a primeira
          em …"); aqui o destino é o botão desta tela, não um link para ela. */}
      {!pracasPending && !praca && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nenhuma praça ainda — abra a primeira em <strong className="font-semibold">Abertura de praça</strong>.
        </p>
      )}

      {praca && (
        <>
          {/* cobertura da praça ativa */}
          {praca.cobertura && (
            <div className="card-surface mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-semibold text-foreground"><MapPin size={12} className="text-primary" /> {praca.cobertura.cidade} · {praca.cobertura.uf}</span>
              <span>raio de 50 km · {praca.cobertura.vizinhas.length} cidades em volta</span>
              <span className="truncate">{praca.cobertura.vizinhas.slice(0, 8).join(", ")}{praca.cobertura.vizinhas.length > 8 ? "…" : ""}</span>
            </div>
          )}

          {/* mapa de calor dos estabelecimentos (bloco B, §21.2) */}
          <MapaEstabelecimentos praca={praca} />

          {/* faixa de progresso */}
          <div className="mt-6 flex items-center gap-0 overflow-x-auto pb-2">
            {(steps ?? []).map((info, i) => (
              <div key={info.n} className="flex items-center">
                <button
                  onClick={() => setExpanded(expanded === info.n ? null : info.n)}
                  title={`${info.n}. ${info.name}`}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-extrabold transition-transform hover:scale-110 ${STATUS_STYLE[info.status]}`}
                >
                  {info.status === "locked" ? "🔒" : info.n}
                </button>
                {i < (steps ?? []).length - 1 && <span className={`h-0.5 w-4 sm:w-6 ${info.status === "done" ? "bg-success" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          {/* etapas */}
          <div className="mt-4 space-y-2">
            {(steps ?? []).map((info) => {
              const isOpen = expanded === info.n;
              const stActs = acts.filter((a) => a.step === info.n);
              const gatedBy = catalog?.gated_by[String(info.n)];
              return (
                <div key={info.n} className="card-surface overflow-hidden">
                  <button onClick={() => setExpanded(isOpen ? null : info.n)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-display text-xs font-extrabold ${STATUS_STYLE[info.status]}`}>{info.n}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-sm font-bold">{info.name}</h3>
                        <span className="tag text-muted-foreground">{info.block}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div className={`h-full rounded-full ${info.status === "done" ? "bg-success" : "bg-warning"}`} style={{ width: `${info.total ? (info.done / info.total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{info.done} de {info.total}</span>
                      </div>
                    </div>
                    <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                      {info.window ? `${fmtBR(info.window[0])} → ${fmtBR(info.window[1])}` : ""}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border px-4 py-3">
                      {info.status === "locked" && (
                        <div className="mb-3 rounded-md border border-danger/40 bg-danger/12 p-3">
                          <p className="text-sm font-semibold text-danger">🔒 {info.lock_reason}</p>
                          {unlockFor === info.n ? (
                            <div className="mt-2 space-y-2">
                              <input value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="Justificativa do destrave" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    if (!unlockReason.trim()) return;
                                    unlockStep.mutate(
                                      { pracaId: praca.id, n: info.n, reason: unlockReason.trim() },
                                      { onSuccess: () => { setUnlockFor(null); setUnlockReason(""); } },
                                    );
                                  }}
                                  className="rounded-md bg-danger px-3 py-1.5 text-xs font-bold text-destructive-foreground"
                                >Destravar</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setUnlockFor(info.n)} className="tag mt-2 rounded-sm border border-danger px-2 py-1 text-danger">Destravar manualmente</button>
                          )}
                        </div>
                      )}
                      {info.unlock && (
                        <p className="mb-3 rounded-md bg-warning/10 p-2 text-[11px] text-warning">
                          Destravada por {person(info.unlock.by)?.name} em {fmtBR(info.unlock.at.slice(0, 10))} — {info.unlock.reason}
                        </p>
                      )}
                      <div className="mb-3 rounded-md bg-secondary/60 p-3">
                        <p className="tag text-muted-foreground">Resultado esperado</p>
                        <p className="mt-1 text-sm">{info.expected}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="number"
                            value={resultDraft[info.n] ?? (info.actual?.toString() ?? "")}
                            onChange={(e) => setResultDraft({ ...resultDraft, [info.n]: e.target.value })}
                            placeholder={info.gate ? `Meta: ${info.gate.label}` : "Número alcançado"}
                            className="w-44 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                          <button
                            onClick={() => { const v = resultDraft[info.n]; if (v != null && v !== "") setStepResult.mutate({ pracaId: praca.id, n: info.n, value: Number(v) }); }}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                          >Lançar</button>
                          {info.actual != null && <span className="text-xs text-muted-foreground">Hoje: <strong className="font-display text-base">{info.actual}</strong></span>}
                        </div>
                      </div>
                      <div className="divide-y divide-border/50">
                        {stActs.map((a) =>
                          a.rec.kind === "once" ? (
                            <ActionRow key={a.id} action={a} praca={praca} showDate={fmtBR(dueDateOf(a, praca))} />
                          ) : (
                            <ActionRow key={a.id} action={a} praca={praca} date={todaySp()} />
                          ),
                        )}
                      </div>
                      {gatedBy != null && (
                        <p className="mt-2 text-[11px] text-muted-foreground">Etapa com portão: libera após a etapa {gatedBy} atingir o resultado.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ações fixas */}
          <h2 className="tag mt-8 text-muted-foreground">Ações fixas (todo dia na tela Hoje)</h2>
          <div className="card-surface mt-2 divide-y divide-border/50 px-1">
            {acts.filter((a) => a.step === 0).map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex -space-x-1">{a.owners.map((id) => <Avatar key={id} person={person(id)} size={20} />)}</div>
                <span className="flex-1 text-sm">{a.title}</span>
                <button onClick={() => openAction(a.id)} className="tag rounded-sm border border-border px-2 py-1 text-muted-foreground hover:text-primary">Abrir</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
