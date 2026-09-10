'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Copy, Link2, Phone, Plus, SkipForward, Trash2, Undo2, Upload, MessageCircle,
} from 'lucide-react';
import { addDays, diffDays, fmtBR, fmtDateTime, todaySp } from '@/lib/dates';
import { readFile, type ParsedFile } from '@/lib/intake';
import { useUiStore } from '@/lib/ui-store';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useDeleteMapping,
  useEvaluateImport,
  useImports,
  useMappings,
  useRunImport,
  useSaveMapping,
  useUndoImport,
  type DupAction,
  type EvalRowView,
} from '@/modules/imports/application/use-imports';
import {
  useAddLeadEvent,
  useLeadQueue,
  useOrphanLeads,
  useSnoozeLead,
  useUpdateLead,
  type QueueItemView,
} from '@/modules/leads/application/use-leads';
import { useSettings, useUpdateSettings } from '@/modules/messages/application/use-settings';
import { useActivePraca, usePracas } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { Avatar } from '@/components/praca/bits';
import { NovoLeadDialog } from '@/components/praca/NovoLeadDialog';

/**
 * Entrada de leads — porte de `.prototype/src/routes/entrada.tsx`.
 *
 * Desvio §10: o arquivo continua sendo lido no navegador (`lib/intake.ts`), mas
 * a AVALIAÇÃO é do servidor (`POST /v1/imports/evaluate`) — duplicidade contra
 * a base inteira, adivinhação do mapeamento e contagem vêm de lá, e o `run`
 * avalia de novo na mesma transação em que grava. A fila do dia
 * (`GET /v1/leads/queue`) já chega ordenada e cortada pela cota.
 */
const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

export default function EntradaPage() {
  const [novo, setNovo] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tag text-muted-foreground">Funil de contratantes</p>
          <h1 className="font-display text-2xl font-black tracking-tight">Entrada de leads</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Três formas de trazer lead: importar arquivo, formulário de captura e cadastro manual.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/funil" className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Ver quadro
          </Link>
          <button onClick={() => setNovo(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <Plus size={14} /> Novo lead
          </button>
        </div>
      </div>

      <FilaDoDia />
      <ImportSection />
      <FormularioSection />
      <HistoricoSection />

      {novo && <NovoLeadDialog onClose={() => setNovo(false)} />}
    </>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-lg border border-border bg-card/60 p-4">
      <h2 className="font-display text-base font-extrabold">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ══════════════ 1. Importar arquivo ══════════════
function ImportSection() {
  const { praca } = useActivePraca();
  const { data: pracas } = usePracas();
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const { data: mappings } = useMappings();
  const saveMapping = useSaveMapping();
  const deleteMapping = useDeleteMapping();
  const { mutate: runEvaluate, data: evalRes, reset: resetEval } = useEvaluateImport();
  const runImport = useRunImport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const [map, setMap] = useState<Record<string, string>>({});
  const [origem, setOrigem] = useState("");
  const [dupAction, setDupAction] = useState<DupAction>("ignorar");
  const [pracaMode, setPracaMode] = useState<"arquivo" | "lote">("lote");
  const [lotePracaId, setLotePracaId] = useState("");
  const [ownerMode, setOwnerMode] = useState<"lote" | "rodizio">("lote");
  const [loteOwner, setLoteOwner] = useState("");
  const [rodizio, setRodizio] = useState<string[] | null>(null);
  const [mapName, setMapName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState("");

  const people = useMemo(() => (users ?? []).filter((u) => u.active), [users]);
  // Os padrões dependem de dados que chegam depois (catálogo, praças, pessoas):
  // o estado guarda a ESCOLHA do usuário e cai no padrão enquanto ela não existe.
  const origemValue = origem || catalog?.import_origens[0] || "";
  const lotePraca = lotePracaId || praca?.id || "";
  const loteOwnerId = loteOwner || people[0]?.id || "";
  const rodizioIds = rodizio ?? people.map((p) => p.id);
  const leadFields = catalog?.lead_fields ?? [];

  const take = async (file: File) => {
    setErr(""); setDone("");
    try {
      const p = await readFile(file);
      if (!p.rows.length) { setErr("Não encontrei linhas no arquivo."); return; }
      resetEval();
      setParsed(p);
      setFileName(file.name);
      // O mapeamento adivinhado vem do servidor (`guessed_map`) na primeira
      // avaliação, com as mesmas dicas do catálogo.
      setMap({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
    }
  };

  const cancel = () => { setParsed(null); setMap({}); resetEval(); };

  // Reavalia a cada mudança de mapeamento ou de opção do lote, com 300 ms de
  // espera para não mandar um POST por tecla.
  useEffect(() => {
    if (!parsed || !origemValue) return;
    if (pracaMode === "lote" && !lotePraca) return;
    const t = setTimeout(() => {
      runEvaluate(
        {
          columns: parsed.columns,
          rows: parsed.rows,
          map,
          origem: origemValue,
          dup_action: dupAction,
          praca_mode: pracaMode,
          ...(pracaMode === "lote" ? { lote_praca_id: lotePraca } : {}),
        },
        {
          onSuccess: (res) => {
            if (!Object.keys(map).length && Object.keys(res.guessed_map).length) setMap(res.guessed_map);
          },
        },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [parsed, map, origemValue, dupAction, pracaMode, lotePraca, runEvaluate]);

  const importable = (r: EvalRowView) => !r.no_name && !r.no_phone && (!r.dup || dupAction === "criar");
  const classLabel = (id: string) => catalog?.classes.find((c) => c.id === id)?.label ?? id;

  const confirm = () => {
    if (!parsed || !evalRes) return;
    runImport.mutate(
      {
        columns: parsed.columns,
        rows: parsed.rows,
        map,
        origem: origemValue,
        dup_action: dupAction,
        praca_mode: pracaMode,
        ...(pracaMode === "lote" ? { lote_praca_id: lotePraca } : {}),
        file_name: fileName,
        owner_mode: ownerMode,
        ...(ownerMode === "lote" ? { lote_owner_id: loteOwnerId } : { rodizio_ids: rodizioIds }),
      },
      {
        onSuccess: (res) => {
          setDone(`${res.imported} leads importados · ${res.updated} atualizados · ${res.ignored} ignorados`);
          setParsed(null); setFileName(""); setMap({}); resetEval();
        },
      },
    );
  };

  return (
    <Card title="1. Importar arquivo" sub="Aceita XML e planilha separada por vírgulas (.csv). Arraste o arquivo ou escolha pelo botão.">
      {done && <p className="mb-3 rounded-md bg-success/12 px-3 py-2 text-xs text-success">{done}</p>}
      {!parsed && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void take(f); }}
          className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <Upload size={20} className="text-muted-foreground" />
          <p className="text-sm">Arraste o arquivo aqui</p>
          <button onClick={() => fileRef.current?.click()} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold">
            Escolher arquivo
          </button>
          <input
            ref={fileRef} type="file" accept=".csv,.xml,text/csv,text/xml,application/xml" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f); e.target.value = ""; }}
          />
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
      )}

      {parsed && evalRes && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <b className="text-foreground">{fileName}</b> · {parsed.kind.toUpperCase()} · {parsed.rows.length} linhas · {parsed.columns.length} colunas
            </p>
            <button onClick={cancel} className="text-xs text-muted-foreground hover:text-danger">trocar arquivo</button>
          </div>

          {/* mapeamento */}
          <div>
            <p className="tag text-muted-foreground">Mapeamento de campos</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {leadFields.map((f) => (
                <label key={f.id} className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5">
                  <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">{f.label}</span>
                  <select
                    value={map[f.id] ?? ""}
                    onChange={(e) => setMap((m) => ({ ...m, [f.id]: e.target.value }))}
                    className={`${inputCls} min-w-0 flex-1`}
                  >
                    <option value="">— não usar —</option>
                    {parsed.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={mapName} onChange={(e) => setMapName(e.target.value)} placeholder='Salvar como "Importação Google Maps"' className={`${inputCls} w-64`} />
              <button
                disabled={!mapName.trim()}
                onClick={() => saveMapping.mutate({ name: mapName.trim(), map }, { onSuccess: () => setMapName("") })}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                Salvar mapeamento
              </button>
              {(mappings ?? []).map((m) => (
                <span key={m.id} className="flex items-center gap-1 rounded-md bg-secondary/70 px-2 py-1 text-[11px]">
                  <button onClick={() => setMap(m.map)} className="hover:text-primary">{m.name}</button>
                  <button onClick={() => deleteMapping.mutate(m.id)} aria-label={`Excluir ${m.name}`} className="text-muted-foreground hover:text-danger"><Trash2 size={11} /></button>
                </span>
              ))}
            </div>
          </div>

          {/* obrigatórios do lote */}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Origem do lote (obrigatório)
              <select value={origemValue} onChange={(e) => setOrigem(e.target.value)} className={`${inputCls} mt-1 w-full`}>
                {(catalog?.import_origens ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Praça
              <select value={pracaMode} onChange={(e) => setPracaMode(e.target.value as "arquivo" | "lote")} className={`${inputCls} mt-1 w-full`}>
                <option value="lote">escolher para o lote</option>
                <option value="arquivo">vem do arquivo (pela cidade)</option>
              </select>
              {pracaMode === "lote" && (
                <select value={lotePraca} onChange={(e) => setLotePracaId(e.target.value)} className={`${inputCls} mt-1 w-full`}>
                  {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </label>
            <label className="text-xs text-muted-foreground">
              Dono
              <select value={ownerMode} onChange={(e) => setOwnerMode(e.target.value as "lote" | "rodizio")} className={`${inputCls} mt-1 w-full`}>
                <option value="lote">um dono para o lote</option>
                <option value="rodizio">rodízio entre pessoas</option>
              </select>
              {ownerMode === "lote" ? (
                <select value={loteOwnerId} onChange={(e) => setLoteOwner(e.target.value)} className={`${inputCls} mt-1 w-full`}>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <span className="mt-1 flex flex-wrap gap-2">
                  {people.map((p) => (
                    <label key={p.id} className="flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={rodizioIds.includes(p.id)}
                        onChange={(e) => setRodizio(e.target.checked ? [...rodizioIds, p.id] : rodizioIds.filter((x) => x !== p.id))}
                      />
                      {p.name}
                    </label>
                  ))}
                </span>
              )}
            </label>
          </div>

          {/* duplicidade */}
          <div>
            <p className="tag text-muted-foreground">Duplicidade — mesmo telefone → mesmo CNPJ → mesmo nome e endereço</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ["ignorar", "ignorar a linha nova"],
                ["completar", "atualizar campos vazios do lead existente"],
                ["criar", "criar mesmo assim, marcando possível duplicado"],
              ] as [DupAction, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setDupAction(id)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs ${dupAction === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* resumo + prévia */}
          <p className="rounded-md bg-secondary/60 px-3 py-2 text-xs">
            <b>{evalRes.total} linhas lidas</b> · {evalRes.dups} duplicadas · {evalRes.no_phone} sem telefone
            {evalRes.sem_praca ? ` · ${evalRes.sem_praca} sem praça` : ""} · <b className="text-primary">{evalRes.will_import} serão importadas</b>
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-secondary/60 text-muted-foreground">
                <tr>
                  {["Estabelecimento", "Cidade", "Telefone", "Decisor", "Classe", "Origem", "Praça", "Situação"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evalRes.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1.5">{r.draft.name || <i className="text-danger">sem nome</i>}</td>
                    <td className="px-2 py-1.5">{r.draft.city}</td>
                    <td className="px-2 py-1.5">{r.draft.phone}</td>
                    <td className="px-2 py-1.5">{r.draft.decisor}</td>
                    <td className="px-2 py-1.5">{classLabel(r.draft.classe)}</td>
                    <td className="px-2 py-1.5">{r.draft.origem || origemValue}</td>
                    <td className="px-2 py-1.5">{pracas?.find((p) => p.id === r.praca_id)?.name ?? <span className="text-warning">sem praça</span>}</td>
                    <td className="px-2 py-1.5">
                      {r.dup ? <span className="text-warning">duplicado ({r.dup.by})</span>
                        : r.no_phone ? <span className="text-danger">sem telefone</span>
                        : importable(r) ? <span className="text-success">entra no funil</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={cancel} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground">Cancelar</button>
            <button
              disabled={(!evalRes.will_import && dupAction !== "completar") || runImport.isPending}
              onClick={confirm}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              Confirmar importação
            </button>
          </div>
        </div>
      )}

      <SemPracaList />
    </Card>
  );
}

function SemPracaList() {
  const openLead = useUiStore((s) => s.openLead);
  const { data: pracas } = usePracas();
  const { data: orfaos } = useOrphanLeads();
  const updateLead = useUpdateLead();
  if (!orfaos?.length) return null;
  return (
    <div className="mt-4 rounded-md border border-warning/40 bg-warning/8 p-3">
      <p className="tag text-warning">Sem praça · {orfaos.length}</p>
      <ul className="mt-2 space-y-1">
        {orfaos.slice(0, 12).map((l) => (
          <li key={l.id} className="flex items-center gap-2 text-xs">
            <button onClick={() => openLead(l.id)} className="flex-1 truncate text-left hover:text-primary">
              {l.name} · {l.city || "cidade não informada"}
            </button>
            <select
              value=""
              onChange={(e) => e.target.value && updateLead.mutate({ id: l.id, input: { praca_id: e.target.value } })}
              className={`${inputCls} py-1 text-[11px]`}
            >
              <option value="">atribuir praça…</option>
              {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ══════════════ 2. Formulário de captura ══════════════
function FormularioSection() {
  const { praca } = useActivePraca();
  const { data: pracas } = usePracas();
  const [pracaId, setPracaId] = useState("");
  const [origem, setOrigem] = useState<"tráfego pago" | "orgânico">("tráfego pago");
  const [copied, setCopied] = useState(false);
  const id = pracaId || praca?.id || "";
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${base}/formulario/${id}?origem=${origem === "tráfego pago" ? "pago" : "organico"}`;

  return (
    <Card title="2. Formulário de captura" sub="Endereço público por praça. Quem preencher entra direto na etapa Lead novo. É o destino dos anúncios do módulo de campanhas.">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Praça
          <select value={id} onChange={(e) => setPracaId(e.target.value)} className={`${inputCls} mt-1 block`}>
            {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Origem do endereço
          <select value={origem} onChange={(e) => setOrigem(e.target.value as "tráfego pago" | "orgânico")} className={`${inputCls} mt-1 block`}>
            <option value="tráfego pago">tráfego pago</option>
            <option value="orgânico">orgânico</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/50 px-3 py-2">
        <Link2 size={14} className="text-muted-foreground" />
        <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
        <button
          onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-bold"
        >
          <Copy size={11} /> {copied ? "copiado" : "copiar"}
        </button>
        <Link href={`/formulario/${id}?origem=${origem === "tráfego pago" ? "pago" : "organico"}`} className="rounded-md border border-border px-2 py-1 text-[11px] font-bold">
          abrir
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Campos: nome do estabelecimento, cidade, telefone, nome do responsável e “quantas vezes por mês você fica sem gente?”.
      </p>
    </Card>
  );
}

// ══════════════ Fila do dia ══════════════
function FilaDoDia() {
  const hojePerson = useUiStore((s) => s.hojePerson);
  const { data: users } = useUsers();
  const { data: settings } = useSettings();
  const { mutate: saveSettings } = useUpdateSettings();
  const [who, setWho] = useState(hojePerson);
  const [quotaInput, setQuotaInput] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: queue } = useLeadQueue(who);

  // A cota é do servidor (`app_settings.daily_quota`) e corta a fila lá; o
  // estado local é só para digitar sem mandar um PATCH por tecla.
  const quota = quotaInput ?? settings?.daily_quota ?? queue?.quota ?? 20;
  const changeQuota = (v: number) => {
    setQuotaInput(v);
    if (timer.current) clearTimeout(timer.current);
    if (!Number.isFinite(v) || v < 1) return;
    timer.current = setTimeout(() => saveSettings({ daily_quota: Math.trunc(v) }), 400);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const people = (users ?? []).filter((u) => u.active);
  const total = queue?.total ?? 0;
  const grandes = queue?.grandes ?? 0;
  const shown = queue?.items ?? [];

  return (
    <Card title="Para tocar hoje" sub="Leads na etapa “Lead novo” e leads de reaquecimento com data vencida. Casa grande primeiro, depois alvo, depois o resto — e os mais antigos na frente.">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-sm font-extrabold">
          {total} leads para tocar hoje · {grandes} casas grandes
        </p>
        <select value={who} onChange={(e) => setWho(e.target.value)} className={`${inputCls} ml-auto`}>
          <option value="all">Todos os donos</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          leads por dia por pessoa
          <input
            type="number" min={1} value={quota}
            onChange={(e) => changeQuota(Number(e.target.value))}
            className={`${inputCls} w-16 py-1`}
          />
        </label>
      </div>
      {total > quota && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warning">
          <AlertTriangle size={12} /> {total - quota} leads ficaram fora da fila de hoje pelo limite de {quota} por pessoa.
        </p>
      )}
      <ul className="mt-3 divide-y divide-border rounded-md border border-border">
        {shown.length === 0 && <li className="px-3 py-4 text-xs text-muted-foreground">Fila zerada. Bom trabalho.</li>}
        {shown.map((l) => <FilaRow key={l.id} lead={l} />)}
      </ul>
    </Card>
  );
}

function FilaRow({ lead }: { lead: QueueItemView }) {
  const openLead = useUiStore((s) => s.openLead);
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const addEvent = useAddLeadEvent();
  const snooze = useSnoozeLead();
  const classLabel = catalog?.classes.find((c) => c.id === lead.classe)?.label ?? lead.classe;
  const reaquecer = lead.is_reheat;
  const wa = `https://wa.me/55${lead.phone.replace(/\D/g, "")}`;
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span
        className="tag rounded-sm px-1.5 py-0.5"
        style={{ backgroundColor: lead.classe === "grande" ? "#ECA82622" : "#8882", color: lead.classe === "grande" ? "#ECA826" : undefined }}
      >
        {classLabel}
      </span>
      <button onClick={() => openLead(lead.id)} className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary">
        {lead.name}
        <span className="ml-2 text-[11px] text-muted-foreground">
          {lead.city} · {lead.phone || "sem telefone"} · na base há {diffDays(todaySp(), lead.entered_at)}d
          {reaquecer ? " · reaquecer" : ""}
        </span>
      </button>
      <Avatar person={users?.find((u) => u.id === lead.owner_id)} size={18} />
      <span className="flex gap-1">
        <a
          href={wa} target="_blank" rel="noreferrer"
          onClick={() => addEvent.mutate({ id: lead.id, kind: "msg_out", text: "Mensagem enviada pela fila do dia." })}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary"
        >
          <MessageCircle size={11} /> mensagem
        </a>
        <button
          onClick={() => addEvent.mutate({ id: lead.id, kind: "call", text: "Ligação registrada pela fila do dia." })}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary"
        >
          <Phone size={11} /> ligação
        </button>
        <button
          onClick={() => snooze.mutate({ id: lead.id, until: addDays(todaySp(), 1) })}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary"
        >
          <SkipForward size={11} /> amanhã
        </button>
      </span>
    </li>
  );
}

// ══════════════ Histórico de importações ══════════════
function HistoricoSection() {
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const { data: imports } = useImports();
  const { data: mappings } = useMappings();
  const undoImport = useUndoImport();
  const [msg, setMsg] = useState("");
  const lista = imports ?? [];
  return (
    <Card title="Histórico de importações" sub="Desfazer disponível por 24 horas — remove apenas os leads do lote que ainda não tiveram nenhum contato.">
      {msg && <p className="mb-2 rounded-md bg-secondary/60 px-3 py-2 text-xs">{msg}</p>}
      {lista.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma importação ainda.</p>}
      <ul className="space-y-2">
        {lista.map((b) => (
          <li key={b.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{b.file_name}</p>
              <span className="text-[11px] text-muted-foreground">{fmtDateTime(b.at)} · por {users?.find((u) => u.id === b.by)?.name ?? b.by} · origem {b.origem}</span>
              <span className="ml-auto text-[11px]">
                <b className="text-success">{b.imported} entraram</b> · <b className="text-warning">{b.ignored} ignorados</b>
              </span>
              {b.can_undo && (
                <button
                  onClick={() =>
                    undoImport.mutate(b.id, {
                      onSuccess: (r) =>
                        setMsg(`Importação desfeita: ${r.removed} leads removidos${r.kept ? `, ${r.kept} mantidos por já terem contato` : ""}.`),
                    })
                  }
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:border-danger hover:text-danger"
                >
                  <Undo2 size={11} /> desfazer importação
                </button>
              )}
            </div>
            {b.reasons.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">Motivos: {b.reasons.join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Mapeamentos salvos: {mappings?.length ? mappings.map((m) => m.name).join(" · ") : "nenhum ainda"}.
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">Classificações usadas: {(catalog?.classes ?? []).map((c) => c.label).join(" · ")} · {fmtBR(todaySp())}</p>
    </Card>
  );
}
