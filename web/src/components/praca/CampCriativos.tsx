'use client';

import { useState } from 'react';
import { AlertTriangle, Check, MessageSquareWarning, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { addDays, fmtBR, fmtDateTime, todaySp } from '@/lib/dates';
import { isIAFormat, labelOf } from '@/lib/midia';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useCampanhas,
  useCreatives,
  useDeleteCreative,
  useReviewCreative,
  useSaveCreative,
  useSetCreativeStatus,
  type CampanhaView,
  type CreativeBody,
  type CreativeView,
  type ScriptModelView,
} from '@/modules/midia/application/use-midia';
import { useUsers } from '@/modules/users/application/use-users';

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";
const MAX = 1000;

/** A peça em edição: o corpo do `POST`/`PUT` mais o id (vazio = peça nova). */
type CreativeDraft = CreativeBody & { id: string };

const novoDraft = (campanhaId: string, m?: ScriptModelView): CreativeDraft => ({
  id: "",
  campanha_id: campanhaId,
  formato: m?.formato ?? "carrossel",
  titulo: m?.titulo ?? "",
  gancho: m?.gancho ?? "",
  roteiro: m ? { ...m.roteiro } : { gancho: "", desenvolvimento: "", prova: "", cta: "" },
  legenda: m?.legenda ?? "",
  cta_botao: m?.cta_botao ?? "Saiba mais",
  owner_id: null,
  due: addDays(todaySp(), 3),
  publish_at: addDays(todaySp(), 5),
  status: "a_fazer",
  file_url: "",
  ia: null,
});

const toDraft = (c: CreativeView): CreativeDraft => ({
  id: c.id,
  campanha_id: c.campanha_id,
  formato: c.formato,
  titulo: c.titulo,
  gancho: c.gancho,
  roteiro: { ...c.roteiro },
  legenda: c.legenda,
  cta_botao: c.cta_botao,
  owner_id: c.owner_id,
  due: c.due,
  publish_at: c.publish_at,
  status: c.status,
  file_url: c.file_url,
  ia: c.ia ? { ...c.ia } : null,
});

/**
 * Criativos — porte de `.prototype/src/components/praca/CampCriativos.tsx`.
 *
 * Desvio §15: o autor do comentário de aprovação é quem está logado (o
 * servidor grava, §19.3) e "Aprovar"/"Pedir ajuste" são o
 * `POST /v1/creatives/:id/review` — o protótipo montava o comentário na tela.
 * Os roteiros-modelo vêm do catálogo (§4), não de uma constante no navegador.
 */
export function CampCriativos({ campanhaId, setCampanhaId }: { campanhaId: string; setCampanhaId: (id: string) => void }) {
  const { data: catalog } = useCatalog();
  const { data: campanhas } = useCampanhas();
  const { data: users } = useUsers();
  const setCreativeStatus = useSetCreativeStatus();
  const [editing, setEditing] = useState<CreativeDraft | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const lista = campanhas ?? [];
  const camp: CampanhaView | undefined = lista.find((c) => c.id === campanhaId) ?? lista[0];
  const { data: creatives } = useCreatives(camp?.id);
  const list = creatives ?? [];
  // A borda do catálogo confere só `id`/`name` de cada roteiro-modelo (o resto
  // passa por `.passthrough()`), então a forma completa é reafirmada aqui.
  const models = (catalog?.script_models ?? []) as unknown as ScriptModelView[];

  if (!camp) return <p className="mt-6 text-sm text-muted-foreground">Crie uma campanha na aba Estratégia primeiro.</p>;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select value={camp.id} onChange={(e) => setCampanhaId(e.target.value)} className={inputCls}>
          {lista.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">
          {list.length} peças · mensagem-chave obrigatória: “{camp.mensagem_chave}”
        </span>
        <button onClick={() => setEditing(novoDraft(camp.id))} className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={14} /> Nova peça
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border p-2">
        <span className="flex items-center gap-1 tag text-muted-foreground"><Wand2 size={12} /> modelos de roteiro:</span>
        {models.map((m) => (
          <button key={m.id} onClick={() => setEditing(novoDraft(camp.id, m))} className="rounded border border-border px-2 py-1 text-[11px]">
            {m.name}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {(catalog?.creative_status ?? []).map((col) => {
          const items = list.filter((c) => c.status === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag) { setCreativeStatus.mutate({ id: drag, status: col.id }); setDrag(null); } }}
              className="w-[190px] shrink-0 rounded-lg border border-border bg-card/60 p-2"
            >
              <p className="tag flex items-center justify-between text-muted-foreground">
                {col.label} <span className="font-bold">{items.length}</span>
              </p>
              <div className="mt-2 space-y-2">
                {items.map((c) => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={() => setDrag(c.id)}
                    onClick={() => setEditing(toDraft(c))}
                    className="cursor-grab rounded-md border border-border bg-background p-2 text-xs"
                  >
                    <p className="tag text-primary">{labelOf(catalog?.formatos, c.formato)}</p>
                    <p className="mt-0.5 font-bold leading-tight">{c.titulo || "sem título"}</p>
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{c.gancho}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {(users ?? []).find((u) => u.id === c.owner_id)?.name ?? "sem dono"} · prazo {fmtBR(c.due)}
                      {c.publish_at ? ` · publica ${fmtBR(c.publish_at)}` : ""}
                    </p>
                    {c.ia && <p className="mt-1 flex items-center gap-1 text-[10px] text-warning"><Sparkles size={10} /> {c.ia.tool}</p>}
                  </article>
                ))}
                {!items.length && <p className="text-[11px] text-muted-foreground">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && <CreativeEditor creative={editing} campanha={camp} onClose={() => setEditing(null)} />}
    </>
  );
}

function CreativeEditor({ creative, campanha, onClose }: { creative: CreativeDraft; campanha: CampanhaView; onClose: () => void }) {
  const { data: catalog } = useCatalog();
  const { data: users } = useUsers();
  const { data: creatives } = useCreatives(creative.campanha_id);
  const save = useSaveCreative();
  const review = useReviewCreative();
  const deleteCreative = useDeleteCreative();
  const [c, setC] = useState<CreativeDraft>(creative);
  const [reviewText, setReviewText] = useState("");
  const camp = campanha;
  const set = (patch: Partial<CreativeDraft>) => setC({ ...c, ...patch });
  const comments = (creatives ?? []).find((x) => x.id === c.id)?.comments ?? [];
  const freelaAviso = camp.publico === "freelancer";
  const keyMissing = !!camp.mensagem_chave && !(`${c.legenda} ${c.roteiro.desenvolvimento} ${c.roteiro.cta}`.toLowerCase().includes(camp.mensagem_chave.toLowerCase().slice(0, 20)));
  const salvando = save.isPending || review.isPending;

  /** Salva e devolve o id — a peça nova precisa existir antes da revisão. */
  const salvar = async (): Promise<string> => {
    const { id, ...body } = c;
    // Ferramenta de IA em branco = sem registro de IA: o servidor só aceita
    // ferramenta do catálogo, e `{tool: ""}` seria 400.
    const saved = await save.mutateAsync({
      id: id || undefined,
      body: { ...body, ia: c.ia?.tool ? c.ia : null },
    });
    return saved.id;
  };

  const comSalvamento = async (depois?: (id: string) => Promise<unknown>) => {
    try {
      const id = await salvar();
      if (depois) await depois(id);
      onClose();
    } catch {
      // O `onError` da mutação já mostrou a mensagem da API; o editor fica
      // aberto com o que foi digitado.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-4 h-fit w-full max-w-2xl rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="tag text-muted-foreground">Peça de criativo · {camp.name}</p>
            <h2 className="font-display text-lg font-black">{c.titulo || "Nova peça"}</h2>
          </div>
          <span className="tag rounded-full bg-muted px-2 py-0.5">{labelOf(catalog?.creative_status, c.status)}</span>
        </div>

        {freelaAviso && (
          <p className="mt-3 flex gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
            <AlertTriangle size={13} /> Peça para freelancer: fale de vagas disponíveis e pagamento garantido do turno. Nunca prometa renda mensal.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">Formato
            <select value={c.formato} onChange={(e) => set({ formato: e.target.value })} className={inputCls}>
              {(catalog?.formatos ?? []).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs">Status
            <select value={c.status} onChange={(e) => set({ status: e.target.value })} className={inputCls}>
              {(catalog?.creative_status ?? []).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">Título
            <input value={c.titulo} maxLength={120} onChange={(e) => set({ titulo: e.target.value })} className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">Gancho — os 3 primeiros segundos ou a primeira linha
            <input value={c.gancho} maxLength={240} onChange={(e) => set({ gancho: e.target.value })} className={inputCls} />
          </label>
        </div>

        <p className="mt-4 tag text-muted-foreground">Roteiro</p>
        <div className="mt-1.5 grid gap-2">
          {(["gancho", "desenvolvimento", "prova", "cta"] as const).map((k) => (
            <label key={k} className="grid gap-1 text-xs capitalize">
              {k === "cta" ? "Chamada para ação" : k}
              <textarea value={c.roteiro[k]} maxLength={MAX} rows={2} onChange={(e) => set({ roteiro: { ...c.roteiro, [k]: e.target.value } })} className={inputCls} />
            </label>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs sm:col-span-2">Texto do anúncio (legenda)
            <textarea value={c.legenda} maxLength={MAX} rows={3} onChange={(e) => set({ legenda: e.target.value })} className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs">Chamada do botão
            <input value={c.cta_botao} maxLength={40} onChange={(e) => set({ cta_botao: e.target.value })} className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs">Dono
            <select value={c.owner_id ?? ""} onChange={(e) => set({ owner_id: e.target.value || null })} className={inputCls}>
              <option value="">— escolher —</option>
              {(users ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs">Prazo
            <input type="date" value={c.due} onChange={(e) => set({ due: e.target.value })} className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs">Data de publicação
            <input type="date" value={c.publish_at ?? ""} onChange={(e) => set({ publish_at: e.target.value || null })} className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">Arquivo ou link do material pronto
            <input value={c.file_url} maxLength={500} onChange={(e) => set({ file_url: e.target.value })} placeholder="https://…" className={inputCls} />
          </label>
        </div>

        {isIAFormat(c.formato) && (
          <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
            <p className="flex items-center gap-1.5 tag text-warning"><Sparkles size={12} /> Feito com IA — guarde para repetir o que deu certo</p>
            <div className="mt-2 grid gap-2">
              <select value={c.ia?.tool ?? ""} onChange={(e) => set({ ia: { tool: e.target.value, prompt: c.ia?.prompt ?? "" } })} className={inputCls}>
                <option value="">— ferramenta usada —</option>
                {(catalog?.ia_tools ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea
                value={c.ia?.prompt ?? ""}
                maxLength={2000}
                rows={3}
                onChange={(e) => set({ ia: { tool: c.ia?.tool ?? "", prompt: e.target.value } })}
                placeholder="Prompt exato usado"
                className={`${inputCls} font-mono text-xs`}
              />
            </div>
          </div>
        )}

        {keyMissing && (
          <p className="mt-3 text-[11px] text-warning">
            A mensagem-chave da campanha não aparece no roteiro nem na legenda — confira antes de aprovar.
          </p>
        )}

        {/* aprovação */}
        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="tag text-muted-foreground">Aprovação — só peça aprovada pode ir para o tráfego</p>
          <textarea value={reviewText} maxLength={MAX} rows={2} onChange={(e) => setReviewText(e.target.value)} placeholder="Comentário da aprovação ou do ajuste" className={`${inputCls} mt-2 w-full`} />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void comSalvamento((id) => review.mutateAsync({ id, kind: "aprovacao", text: reviewText.trim() || undefined }))}
              disabled={salvando}
              className="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-bold text-background disabled:opacity-40"
            >
              <Check size={13} /> Aprovar
            </button>
            <button
              onClick={() => { if (!reviewText.trim()) return; void comSalvamento((id) => review.mutateAsync({ id, kind: "ajuste", text: reviewText.trim() })); }}
              disabled={!reviewText.trim() || salvando}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              <MessageSquareWarning size={13} /> Pedir ajuste
            </button>
          </div>
          {!!comments.length && (
            <ul className="mt-3 space-y-1 text-[11px]">
              {comments.slice().reverse().map((cm) => (
                <li key={cm.id} className="border-b border-border/60 pb-1">
                  <span className={cm.kind === "aprovacao" ? "text-success" : cm.kind === "ajuste" ? "text-warning" : "text-muted-foreground"}>
                    {cm.kind === "aprovacao" ? "aprovou" : cm.kind === "ajuste" ? "pediu ajuste" : "nota"}
                  </span>{" "}
                  · {cm.author} · {fmtDateTime(cm.at)} — {cm.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-between gap-2">
          <button onClick={() => { if (c.id) deleteCreative.mutate(c.id); onClose(); }} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            <Trash2 size={13} /> Apagar
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-bold">Cancelar</button>
            <button onClick={() => void comSalvamento()} disabled={salvando} className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">Salvar peça</button>
          </div>
        </div>
      </div>
    </div>
  );
}
