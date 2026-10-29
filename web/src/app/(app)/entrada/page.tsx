'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Link2, MapPin, MessageCircle, Phone, Plus, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { ROTA } from '@/modules/acesso/domain/enderecos';
import { CabecalhoPagina } from '@/components/praca/CabecalhoPagina';
import { focarSemPular, proximoFoco } from '@/components/crm/foco-da-lista';
import { LinhaTarefa } from '@/components/crm/LinhaTarefa';
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
import { fmtBR, fmtDateTime, todaySp } from '@/lib/dates';
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
  type ImportBatchView,
} from '@/modules/imports/application/use-imports';
import {
  useAddLeadEvent,
  useLeadQueue,
  useOrphanLeads,
  useUpdateLead,
  type QueueItemView,
} from '@/modules/leads/application/use-leads';
import { addLeadEvent } from '@/modules/leads/infrastructure/leads.api';
import {
  acaoDoLinkWhatsApp,
  contaDaFila,
  contagemDaFila,
  eventoDoFeito,
  motivoDaFila,
  rotuloDoImportar,
  textoImportacaoDesfeita,
  textosDesfazerImportacao,
  type ContatoDaFila,
} from '@/modules/leads/domain/entrada';
import { useAcoesAdiadas } from '@/modules/crm/application/use-acoes-adiadas';
import { useAnuncio } from '@/modules/crm/application/use-anuncio';
import { enviosAoFecharAba, useAdiarLead } from '@/modules/crm/application/use-crm';
import { OPCOES_FEITO, anuncioDaAcao, opcoesAdiar, textoAdiado } from '@/modules/crm/domain/tarefas';
import { useSettings, useUpdateSettings } from '@/modules/messages/application/use-settings';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import { useActivePraca, usePracas } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';
import { NovoLeadDialog } from '@/components/praca/NovoLeadDialog';

/**
 * Entrada de leads (UX §3.6): visual da Lovable, mesma lógica de antes.
 *
 * Desvio §10: o arquivo continua sendo lido no navegador (`lib/intake.ts`), mas
 * a AVALIAÇÃO é do servidor (`POST /v1/imports/evaluate`) — duplicidade contra
 * a base inteira, adivinhação do mapeamento e contagem vêm de lá, e o `run`
 * avalia de novo na mesma transação em que grava. A fila do dia
 * (`GET /v1/leads/queue`) já chega ordenada e cortada pela cota.
 *
 * Exceção (decisão U1, achado 3): o link do WhatsApp da fila só abre a conversa; "Mensagem enviada" só é gravada pelo "Feito".
 */
const CARTAO = 'rounded-2xl bg-card shadow-card';
// `select` nativo no tamanho do `Input`: 44 px no celular, 36 no computador.
const selectCls =
  'h-11 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-9';

export default function EntradaPage() {
  const [novo, setNovo] = useState(false);
  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Entrada de leads"
        subtitulo="Os leads novos para o 1º contato, a importação de planilha e o formulário de captura."
        comPraca
        acoes={
          <>
            <Button onClick={() => setNovo(true)}>
              <Plus aria-hidden /> Novo lead
            </Button>
            <Button variant="outline" asChild>
              <Link href="/funil">Ver o funil</Link>
            </Button>
          </>
        }
      />

      <FilaDoDia />
      <ImportSection />
      <FormularioSection />
      <HistoricoSection />

      {novo && <NovoLeadDialog onClose={() => setNovo(false)} />}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className={`${CARTAO} p-5`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ══════════════ Importar planilha ══════════════
function ImportSection() {
  const { praca } = useActivePraca();
  const { data: pracas } = usePracas();
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const { data: mappings } = useMappings();
  const saveMapping = useSaveMapping();
  const deleteMapping = useDeleteMapping();
  const {
    mutate: runEvaluate,
    data: evalRes,
    reset: resetEval,
    isPending: avaliando,
    isError: falhouAvaliar,
    error: erroAvaliar,
  } = useEvaluateImport();
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
  // Enquanto a prévia na tela não corresponde às opções atuais (espera dos
  // 300 ms, avaliação no ar ou avaliação que falhou), o Confirmar fica travado:
  // importar em lote sobre um retrato velho é o que vira "importei errado".
  const [previaVelha, setPreviaVelha] = useState(false);
  const evalSeq = useRef(0);

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
      evalSeq.current += 1;
      setPreviaVelha(true);
      setParsed(p);
      setFileName(file.name);
      // O mapeamento adivinhado vem do servidor (`guessed_map`) na primeira
      // avaliação, com as mesmas dicas do catálogo.
      setMap({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
    }
  };

  const cancel = () => {
    setParsed(null); setFileName(""); setMap({}); resetEval();
    evalSeq.current += 1;
    setPreviaVelha(false);
  };

  // Reavalia a cada mudança de mapeamento ou de opção do lote, com 300 ms de
  // espera para não mandar um POST por tecla.
  useEffect(() => {
    if (!parsed || !origemValue) return;
    if (pracaMode === "lote" && !lotePraca) return;
    setPreviaVelha(true);
    const t = setTimeout(() => {
      // Duas avaliações podem estar no ar (o corpo leva o arquivo inteiro):
      // só a resposta da ÚLTIMA vale.
      const seq = ++evalSeq.current;
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
            if (seq !== evalSeq.current) return;
            setPreviaVelha(false);
            if (!Object.keys(map).length && Object.keys(res.guessed_map).length) setMap(res.guessed_map);
          },
        },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [parsed, map, origemValue, dupAction, pracaMode, lotePraca, runEvaluate]);

  const importable = (r: EvalRowView) => !r.no_name && !r.no_phone && (!r.dup || dupAction === "criar");
  // Sem ninguém ativo o `lote_owner_id` iria vazio e o `run` levaria 400 no
  // `@IsUUID()`: melhor o botão dizer que não dá.
  const donoOk = ownerMode === "lote" ? !!loteOwnerId : rodizioIds.length > 0;
  const classLabel = (id: string) => catalog?.classes.find((c) => c.id === id)?.label ?? id;
  // Nunca "Importar 0 leads": em "completar" sem linha nova o botão diz o que faz; sem nada a fazer, fica travado.
  const botaoImportar = evalRes ? rotuloDoImportar({ vaoEntrar: evalRes.will_import, repetidos: evalRes.dups, modo: dupAction }) : null;

  const confirm = () => {
    if (!parsed || !evalRes || previaVelha || avaliando || !donoOk) return;
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
          setDone(`${res.imported} leads importados · ${res.updated} atualizados · ${res.ignored} ignorados.`);
          setParsed(null); setFileName(""); setMap({}); resetEval();
          evalSeq.current += 1;
          setPreviaVelha(false);
        },
      },
    );
  };


  return (
    <Card title="Importar planilha" sub="Aceita planilha .csv e XML. Arraste o arquivo ou escolha pelo botão.">
      {done && (
        <p role="status" className="mb-3 rounded-lg bg-muted p-3 text-sm">
          {done}
        </p>
      )}
      {!parsed && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void take(f); }}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center ${dragging ? "border-primary bg-primary/5" : "border-input"}`}
        >
          <Upload aria-hidden className="size-5 text-muted-foreground" />
          <p className="text-sm">Arraste o arquivo aqui</p>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            Escolher arquivo
          </Button>
          <input
            ref={fileRef} type="file" accept=".csv,.xml,text/csv,text/xml,application/xml" className="hidden" aria-label="Arquivo da planilha"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f); e.target.value = ""; }}
          />
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </div>
      )}

      {/* Entre escolher o arquivo e a 1ª resposta — e quando a avaliação falha
          (planilha larga demais, célula gigante, corpo acima de 8 MB, queda de
          rede) — a seção não pode ficar vazia: o "trocar arquivo" mora aqui. */}
      {parsed && !evalRes && (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input p-8 text-center">
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground">{fileName}</b> · {parsed.kind.toUpperCase()} · {parsed.rows.length} linhas · {parsed.columns.length} colunas
          </p>
          <p
            role={falhouAvaliar && !avaliando ? "alert" : undefined}
            className={falhouAvaliar && !avaliando ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          >
            {falhouAvaliar && !avaliando
              ? apiErrorMessage(erroAvaliar, "Não foi possível avaliar o arquivo.")
              : "Avaliando o arquivo…"}
          </p>
          <Button variant="outline" onClick={cancel}>
            Trocar arquivo
          </Button>
        </div>
      )}

      {parsed && evalRes && botaoImportar && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              <b className="text-foreground">{fileName}</b> · {parsed.kind.toUpperCase()} · {parsed.rows.length} linhas · {parsed.columns.length} colunas
            </p>
            <span className="ml-auto flex items-center gap-2">
              {previaVelha && (
                <span
                  role={falhouAvaliar && !avaliando ? "alert" : undefined}
                  className={falhouAvaliar && !avaliando ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                >
                  {falhouAvaliar && !avaliando
                    ? "Não consegui reavaliar — mude uma opção ou troque o arquivo."
                    : "Avaliando…"}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={cancel}>Trocar arquivo</Button>
            </span>
          </div>

          {/* mapeamento */}
          <div>
            <h3 className="text-sm font-semibold">Mapeamento de campos</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {leadFields.map((f) => (
                <div key={f.id} className="space-y-1">
                  <Label htmlFor={`map-${f.id}`}>{f.label}</Label>
                  <select
                    id={`map-${f.id}`}
                    value={map[f.id] ?? ""}
                    onChange={(e) => setMap((m) => ({ ...m, [f.id]: e.target.value }))}
                    className={selectCls}
                  >
                    <option value="">— não usar —</option>
                    {parsed.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={mapName}
                onChange={(e) => setMapName(e.target.value)}
                aria-label="Nome do mapeamento"
                placeholder='Salvar como "Importação Google Maps"'
                className="w-full sm:w-72"
              />
              <Button
                variant="outline"
                disabled={!mapName.trim()}
                onClick={() => saveMapping.mutate({ name: mapName.trim(), map }, { onSuccess: () => setMapName("") })}
              >
                Salvar mapeamento
              </Button>
              {(mappings ?? []).map((m) => (
                <span key={m.id} className="flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-1 text-sm">
                  <button type="button" onClick={() => setMap(m.map)} className="min-h-9 hover:underline">{m.name}</button>
                  <button
                    type="button"
                    onClick={() => deleteMapping.mutate(m.id)}
                    aria-label={`Excluir ${m.name}`}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* obrigatórios do lote */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="lote-origem">Origem do lote (obrigatório)</Label>
              <select id="lote-origem" value={origemValue} onChange={(e) => setOrigem(e.target.value)} className={selectCls}>
                {(catalog?.import_origens ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lote-praca-modo">Praça</Label>
              <select id="lote-praca-modo" value={pracaMode} onChange={(e) => setPracaMode(e.target.value as "arquivo" | "lote")} className={selectCls}>
                <option value="lote">escolher para o lote</option>
                <option value="arquivo">vem do arquivo (pela cidade)</option>
              </select>
              {pracaMode === "lote" && (
                <select aria-label="Praça do lote" value={lotePraca} onChange={(e) => setLotePracaId(e.target.value)} className={`${selectCls} mt-2`}>
                  {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="lote-dono-modo">Dono</Label>
              <select id="lote-dono-modo" value={ownerMode} onChange={(e) => setOwnerMode(e.target.value as "lote" | "rodizio")} className={selectCls}>
                <option value="lote">um dono para o lote</option>
                <option value="rodizio">rodízio entre pessoas</option>
              </select>
              {ownerMode === "lote" ? (
                <select aria-label="Dono do lote" value={loteOwnerId} onChange={(e) => setLoteOwner(e.target.value)} className={`${selectCls} mt-2`}>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {people.map((p) => (
                    <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                      <input
                        type="checkbox"
                        checked={rodizioIds.includes(p.id)}
                        onChange={(e) => setRodizio(e.target.checked ? [...rodizioIds, p.id] : rodizioIds.filter((x) => x !== p.id))}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* duplicidade */}
          <div>
            <h3 className="text-sm font-semibold">Duplicidade</h3>
            <p className="text-xs text-muted-foreground">Mesmo telefone, depois mesmo CNPJ, depois mesmo nome e endereço.</p>
            <div role="radiogroup" aria-label="Se a linha já existir" className="mt-2 flex flex-wrap gap-2">
              {([
                ["ignorar", "Ignorar a linha nova"],
                ["completar", "Completar os campos vazios do lead que já existe"],
                ["criar", "Criar mesmo assim (marca como possível duplicado)"],
              ] as [DupAction, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={dupAction === id}
                  onClick={() => setDupAction(id)}
                  className={`flex min-h-11 items-center gap-2 rounded-full border px-3 py-1 text-left text-sm md:min-h-9 ${dupAction === id ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                >
                  {dupAction === id && <Check aria-hidden className="size-4 shrink-0" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* resumo + prévia */}
          <p className="rounded-lg bg-muted p-3 text-sm">
            {evalRes.total} linhas lidas · {evalRes.dups} repetidas · {evalRes.no_phone} sem telefone
            {evalRes.sem_praca ? ` · ${evalRes.sem_praca} sem praça` : ""} · <b>{evalRes.will_import} vão entrar</b>
          </p>
          <p className="text-sm text-muted-foreground md:hidden">A prévia linha a linha aparece no computador.</p>
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {["Estabelecimento", "Cidade", "Telefone", "Decisor", "Classe", "Origem", "Praça", "Situação"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evalRes.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1.5">{r.draft.name || <i className="text-destructive">sem nome</i>}</td>
                    <td className="px-2 py-1.5">{r.draft.city}</td>
                    <td className="px-2 py-1.5">{r.draft.phone}</td>
                    <td className="px-2 py-1.5">{r.draft.decisor}</td>
                    <td className="px-2 py-1.5">{classLabel(r.draft.classe)}</td>
                    <td className="px-2 py-1.5">{r.draft.origem || origemValue}</td>
                    <td className="px-2 py-1.5">{pracas?.find((p) => p.id === r.praca_id)?.name ?? <span className="text-warning">sem praça</span>}</td>
                    <td className="px-2 py-1.5">
                      {r.dup ? <span className="text-warning">duplicado ({r.dup.by})</span>
                        : r.no_phone ? <span className="text-destructive">sem telefone</span>
                        : importable(r) ? <span className="text-success">entra no funil</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={cancel}>Cancelar</Button>
            <Button
              disabled={!botaoImportar.pode || !donoOk || previaVelha || avaliando || runImport.isPending}
              onClick={confirm}
            >
              {botaoImportar.rotulo}
            </Button>
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
    <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
      <h3 className="text-sm font-semibold">Sem praça ({orfaos.length})</h3>
      <ul className="mt-2 space-y-2">
        {orfaos.slice(0, 12).map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={() => openLead(l.id)} className="min-h-11 min-w-0 flex-1 truncate text-left hover:underline md:min-h-0">
              {l.name} · {l.city || "cidade não informada"}
            </button>
            <label className="sr-only" htmlFor={`sem-praca-${l.id}`}>Praça de {l.name}</label>
            <select
              id={`sem-praca-${l.id}`}
              value=""
              onChange={(e) => e.target.value && updateLead.mutate({ id: l.id, input: { praca_id: e.target.value } })}
              className={`${selectCls} w-full sm:w-52`}
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

// ══════════════ Formulário de captura ══════════════
const SUB_FORMULARIO = 'Endereço público por praça. Quem preencher entra direto em “Lead novo”. É o destino dos anúncios das campanhas.';

function FormularioSection() {
  const { praca, isPending: pracasPending } = useActivePraca();
  const { data: pracas } = usePracas();
  const [pracaId, setPracaId] = useState("");
  const [origem, setOrigem] = useState<"tráfego pago" | "orgânico">("tráfego pago");
  const [copied, setCopied] = useState(false);
  const id = pracaId || praca?.id || "";
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const caminho = `/formulario/${id}?origem=${origem === "tráfego pago" ? "pago" : "organico"}`;
  const url = `${base}${caminho}`;

  // Sem praça o endereço viraria `/formulario/?origem=pago` (404) e o "copiar"
  // copiaria um link quebrado — mesma guarda do funil e do Hoje.
  if (pracasPending) {
    return (
      <Card title="Formulário de captura" sub={SUB_FORMULARIO}>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </Card>
    );
  }
  if (!praca) {
    return (
      <Card title="Formulário de captura" sub={SUB_FORMULARIO}>
        <p className="text-sm text-muted-foreground">
          Nenhuma praça ainda — abra a primeira em <Link href={ROTA.pracas} className="text-primary underline">Praças</Link>.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Formulário de captura" sub={SUB_FORMULARIO}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="form-praca">Praça</Label>
          <select id="form-praca" value={id} onChange={(e) => setPracaId(e.target.value)} className={selectCls}>
            {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="form-origem">Origem do link</Label>
          <select id="form-origem" value={origem} onChange={(e) => setOrigem(e.target.value as "tráfego pago" | "orgânico")} className={selectCls}>
            <option value="tráfego pago">Tráfego pago</option>
            <option value="orgânico">Orgânico</option>
          </select>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted p-3">
        <Link2 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{url}</code>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          Copiar link
        </Button>
        <Button variant="outline" asChild>
          <Link href={caminho} target="_blank" rel="noopener noreferrer">Abrir o formulário</Link>
        </Button>
        <span role="status" className="self-center text-sm text-muted-foreground">{copied ? "Link copiado." : ""}</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Campos: nome do estabelecimento, cidade, telefone, nome do responsável e “quantas vezes por mês você fica sem gente?”.
      </p>
    </Card>
  );
}

// ══════════════ Primeiro contato de hoje (a fila do dia) ══════════════
const ICONE_FEITO: Record<ContatoDaFila, LucideIcon> = { call: Phone, msg_out: MessageCircle, visit: MapPin };

/** O que a linha mostra enquanto espera o prazo do Desfazer. */
interface Espera {
  texto: string;
}

function FilaDoDia() {
  const hojePerson = useUiStore((s) => s.hojePerson);
  const abrirLead = useUiStore((s) => s.openLead);
  const { data: users } = useUsers();
  const { data: catalog } = useCatalog();
  const { data: settings } = useSettings();
  const { mutate: saveSettings } = useUpdateSettings();
  const addEvent = useAddLeadEvent();
  const adiar = useAdiarLead();
  const [who, setWho] = useState(hojePerson);
  // O que está DIGITADO (pode estar vazio); `null` = mostrar o valor do servidor.
  const [quotaInput, setQuotaInput] = useState<string | null>(null);
  const [anuncio, anunciar] = useAnuncio();
  const [whatsAbertos, setWhatsAbertos] = useState<ReadonlySet<string>>(() => new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoje = todaySp();
  const [focoDepois, setFocoDepois] = useState<string | null>(null);
  const acoes = useAcoesAdiadas<Espera>({ antesDeSumir: (chave) => setFocoDepois(proximoFoco(chave, "#fila-vazia")) });
  const { data: queue, isError, error, refetch } = useLeadQueue(who);

  // A cota é do servidor (`app_settings.daily_quota`) e corta a fila lá; o
  // estado local é só para digitar sem mandar um PATCH por tecla. O DTO é
  // `@Min(1) @Max(10_000)`: o que sai daqui já vai preso nessa faixa, e o campo
  // volta a ler o servidor assim que o PATCH termina (dando certo ou não) —
  // senão um valor recusado ficaria na tela mentindo no aviso de limite.
  const quotaServidor = settings?.daily_quota ?? queue?.quota ?? 20;
  const digitada = quotaInput === null ? NaN : Number(quotaInput);
  const quota = quotaInput !== null && Number.isFinite(digitada) && digitada >= 1
    ? Math.trunc(digitada)
    : quotaServidor;
  const changeQuota = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);
    setQuotaInput(raw);
    const v = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(v)) return;
    const preso = Math.min(10000, Math.max(1, Math.trunc(v)));
    timer.current = setTimeout(
      () => saveSettings({ daily_quota: preso }, { onSettled: () => setQuotaInput(null) }),
      400,
    );
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const { esquecerAusentes } = acoes;
  useEffect(() => {
    if (queue) esquecerAusentes(new Set(queue.items.map((l) => `entrada:${l.id}`)));
  }, [queue, esquecerAusentes]);

  // A linha saiu: o foco vai ao nome da seguinte (ou da anterior) ou ao aviso da fila vazia, como em Tarefas (UX §3.1.8).
  useEffect(() => {
    if (!focoDepois) return;
    focarSemPular(focoDepois);
    setFocoDepois(null);
  }, [focoDepois, acoes.feitas]);

  const people = (users ?? []).filter((u) => u.active);
  const total = queue?.total ?? 0;
  const grandes = queue?.grandes ?? 0;
  const shown = (queue?.items ?? []).filter((l) => !acoes.feitas.has(`entrada:${l.id}`));
  const classLabel = (id: string) => catalog?.classes.find((c) => c.id === id)?.label ?? id;

  function agendarFeito(l: QueueItemView, kind: ContatoDaFila) {
    const ev = eventoDoFeito(kind);
    acoes.agendar(`entrada:${l.id}`, {
      meta: { texto: `✓ ${ev.confirmacao}` },
      enviar: (urgente) =>
        urgente ? addLeadEvent(l.id, ev.kind, ev.text, { keepalive: true }) : addEvent.mutateAsync({ id: l.id, kind: ev.kind, text: ev.text }),
    });
    anunciar(anuncioDaAcao(ev.confirmacao, l.name, shown.length - 1));
  }

  function agendarAdiar(l: QueueItemView, ate: string) {
    acoes.agendar(`entrada:${l.id}`, {
      meta: { texto: textoAdiado(ate) },
      enviar: (urgente) => (urgente ? enviosAoFecharAba.adiar(l.id, ate) : adiar.mutateAsync({ id: l.id, until: ate })),
    });
    anunciar(`${textoAdiado(ate)}.`);
  }

  function linha(l: QueueItemView) {
    const chave = `entrada:${l.id}`;
    const s = acoes.situacao(chave);
    const abriu = whatsAbertos.has(chave);
    const dono = l.owner_id ? users?.find((u) => u.id === l.owner_id)?.name : null;
    const apoio = [l.city, who === "all" ? (dono ? `de ${dono}` : "Sem dono") : null, l.phone ? null : "Sem telefone no cadastro: abra o lead para ver outro contato."]
      .filter(Boolean)
      .join(" · ");
    return (
      <LinhaTarefa
        key={chave}
        chave={chave}
        nome={l.name}
        onAbrirLead={() => abrirLead(l.id)}
        motivo={motivoDaFila(l, classLabel(l.classe), hoje)}
        apoio={apoio || null}
        telefone={l.phone}
        // O link só ABRE a conversa (decisão U1): quem grava "Mensagem enviada" é o Feito.
        whatsapp={{ onAbrir: () => { if (acaoDoLinkWhatsApp() === "abrir") setWhatsAbertos((prev) => new Set(prev).add(chave)); } }}
        aviso={abriu ? "Mandou? Toque em Feito e escolha “Mandei mensagem”." : null}
        feito={{
          opcoes: OPCOES_FEITO.map((o) => ({ id: o.kind, rotulo: o.rotulo, icone: ICONE_FEITO[o.kind] })),
          onEscolher: (kind) => agendarFeito(l, kind as ContatoDaFila),
        }}
        adiar={{ opcoes: opcoesAdiar(hoje).map((o) => ({ id: o.ate, rotulo: o.rotulo })), onEscolher: (ate) => agendarAdiar(l, ate) }}
        confirmacao={
          s && s.tipo !== "erro"
            ? {
                texto: s.meta.texto,
                onDesfazer: s.tipo === "pendente" ? () => { if (acoes.desfazer(chave)) anunciar("Desfeito."); } : undefined,
              }
            : null
        }
        erro={s?.tipo === "erro" ? { mensagem: s.mensagem, onTentarDeNovo: () => acoes.tentarDeNovo(chave) } : null}
      />
    );
  }

  return (
    <section className={`${CARTAO} overflow-hidden`} aria-labelledby="primeiro-contato">
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {/* O nome do cartão (desenho U6) no h2; a contagem é a linha de apoio. */}
            <h2 id="primeiro-contato" className="text-lg font-semibold">
              Primeiro contato de hoje
            </h2>
            <p className="text-sm">{contagemDaFila(shown.length)}</p>
            <p className="text-xs text-muted-foreground">{contaDaFila({ total, grandes, mostrando: shown.length, quota })}</p>
          </div>
          <div className="w-full sm:w-auto">
            <label htmlFor="fila-de-quem" className="sr-only">De quem</label>
            <select id="fila-de-quem" value={who} onChange={(e) => setWho(e.target.value)} className={`${selectCls} sm:w-56`}>
              <option value="all">Todos os donos</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        {total > quota && (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle aria-hidden className="size-4 shrink-0" /> {total - quota} leads ficaram para outro dia pelo limite de {quota} por pessoa.
          </p>
        )}
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground md:min-h-0 md:py-1">Ajustar o limite</summary>
          <div className="mt-2 max-w-md space-y-1">
            <Label htmlFor="limite-diario">Limite de leads novos por pessoa, por dia (vale para toda a equipe)</Label>
            <Input
              id="limite-diario" type="number" inputMode="numeric" min={1} max={10000}
              value={quotaInput ?? String(quotaServidor)}
              onChange={(e) => changeQuota(e.target.value)}
              className="w-32"
            />
          </div>
        </details>
      </div>

      {isError && !queue ? (
        <div className="space-y-2 border-t border-border p-5">
          <p role="alert" className="text-sm text-destructive">{apiErrorMessage(error, "Não deu para carregar a fila. Verifique a internet e tente de novo.")}</p>
          <Button variant="outline" onClick={() => void refetch()}>Tentar de novo</Button>
        </div>
      ) : !queue ? (
        <div aria-busy="true" className="mx-5 mb-5 h-32 animate-pulse rounded-2xl bg-muted" />
      ) : shown.length === 0 ? (
        <div className="border-t border-border p-5 text-sm">
          <p id="fila-vazia" tabIndex={-1}>Ninguém esperando o 1º contato hoje.</p>
          <p className="text-muted-foreground">Os leads novos chegam pela visita, pelo formulário, pela busca e por planilha.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">{shown.map(linha)}</ul>
      )}
      <p role="status" aria-live="polite" className="sr-only">{anuncio}</p>
    </section>
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
  const [alvo, setAlvo] = useState<ImportBatchView | null>(null);
  // O diálogo abre pelo estado, sem `AlertDialogTrigger`: o Radix não sabe a quem devolver o foco (caía no `body`). Guarda o botão.
  const voltarFoco = useRef<HTMLElement | null>(null);
  const avisoRef = useRef<HTMLParagraphElement>(null);
  const [focarAviso, setFocarAviso] = useState(false);
  // Desfeita, o lote perde o "Desfazer importação" na releitura: o foco que estava no botão vai ao aviso do resultado, não ao `body`.
  useEffect(() => {
    if (!focarAviso || !msg) return;
    setFocarAviso(false);
    const ativo = document.activeElement;
    if (!ativo || ativo === document.body || ativo === voltarFoco.current) avisoRef.current?.focus();
  }, [focarAviso, msg]);
  const lista = imports ?? [];
  const textos = alvo ? textosDesfazerImportacao(alvo.file_name, alvo.imported) : null;
  return (
    <Card title="Histórico de importações" sub="Dá para desfazer por 24 horas: saem só os leads do lote que ainda não tiveram contato.">
      {msg && <p ref={avisoRef} tabIndex={-1} role="status" className="mb-3 rounded-lg bg-muted p-3 text-sm">{msg}</p>}
      {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>}
      <ul className="space-y-3">
        {lista.map((b) => (
          <li key={b.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-medium">{b.file_name}</p>
              <span className="text-sm text-muted-foreground">{fmtDateTime(b.at)} · por {users?.find((u) => u.id === b.by)?.name ?? b.by} · origem {b.origem}</span>
              <span className="text-sm sm:ml-auto">{b.imported} entraram · {b.ignored} ignorados</span>
              {b.can_undo && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    voltarFoco.current = e.currentTarget;
                    setAlvo(b);
                  }}
                >
                  Desfazer importação
                </Button>
              )}
            </div>
            {b.reasons.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Motivos: {b.reasons.join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Mapeamentos salvos: {mappings?.length ? mappings.map((m) => m.name).join(" · ") : "nenhum ainda"}.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Classificações usadas: {(catalog?.classes ?? []).map((c) => c.label).join(" · ")} · {fmtBR(todaySp())}</p>

      <AlertDialog open={!!alvo} onOpenChange={(aberto) => { if (!aberto) setAlvo(null); }}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (voltarFoco.current?.isConnected) voltarFoco.current.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{textos?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{textos?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!alvo) return;
                undoImport.mutate(alvo.id, {
                  onSuccess: (r) => {
                    setMsg(textoImportacaoDesfeita(r.removed, r.kept));
                    setFocarAviso(true);
                  },
                });
              }}
            >
              {textos?.botao}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
