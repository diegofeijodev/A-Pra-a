'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { useLeads } from '@/modules/leads/application/use-leads';
import {
  useDeleteTemplate,
  useRenderTemplate,
  useSaveTemplate,
  usedVariables,
  type AttachmentView,
  type TemplateView,
} from '@/modules/messages/application/use-messages';
import { useActivePraca } from '@/modules/pracas/application/use-pracas';

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

/** O modelo em edição: sem `id` é um modelo novo (`POST`), com `id` é `PUT`. */
export interface TemplateDraft {
  id?: string;
  name: string;
  audience: string;
  stage: number;
  channel: string;
  text_a: string;
  text_b: string;
  attachment: AttachmentView | null;
}

/** Modelo em branco do botão "Novo modelo" (`mensagens.tsx:71-80`). */
export const emptyTemplate = (): TemplateDraft => ({
  name: "",
  audience: "contratante",
  stage: 0,
  channel: "whatsapp",
  text_a: "",
  text_b: "",
  attachment: null,
});

export const toDraft = (t: TemplateView): TemplateDraft => ({
  id: t.id,
  name: t.name,
  audience: t.audience,
  stage: t.stage,
  channel: t.channel,
  text_a: t.text_a,
  text_b: t.text_b,
  attachment: t.attachment,
});

/**
 * Editor de modelo — porte de `TemplateEditor` de
 * `.prototype/src/routes/mensagens.tsx:154-317` (extraído para cá porque a
 * rota do App Router não comporta o componente inteiro).
 *
 * Desvio §12: a PRÉVIA é do servidor (`POST /v1/msg-templates/render`, com
 * debounce de 300 ms) e não de um `renderTemplate` local. É o mesmo render que
 * monta o texto do disparo e o da cadência — se a prévia fosse do navegador, o
 * que se revê aqui poderia não ser o que sai.
 */
export function TemplateEditor({ tpl, onClose }: { tpl: TemplateDraft; onClose: () => void }) {
  const { data: catalog } = useCatalog();
  const { praca } = useActivePraca();
  const { data: leads } = useLeads(
    { praca_id: praca?.id, archived: 'false' },
    { enabled: !!praca?.id },
  );
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const render = useRenderTemplate();

  const [t, setT] = useState<TemplateDraft>(tpl);
  const [leadId, setLeadId] = useState("");
  const [previews, setPreviews] = useState<{ a: string; b: string }>({ a: "", b: "" });

  const lista = leads ?? [];
  // O primeiro lead da praça ativa é o exemplo padrão da prévia (é o que o
  // protótipo fazia com `leads[0]`), mas ele só chega depois do primeiro render.
  const primeiroLead = leads?.[0]?.id;
  useEffect(() => {
    if (!leadId && primeiroLead) setLeadId(primeiroLead);
  }, [leadId, primeiroLead]);

  // A mutation muda de identidade a cada render; guardar em ref evita que o
  // efeito de prévia se redispare por isso (e não pelo texto).
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    let cancelado = false;
    const timer = setTimeout(async () => {
      const um = async (text: string) => {
        // `text` acima de 4000 é 400 na API — não vale um pedido por tecla.
        if (!text.trim() || text.length > 4000) return "";
        try {
          const r = await renderRef.current.mutateAsync({
            text,
            ...(leadId ? { lead_id: leadId } : {}),
          });
          return r.text;
        } catch {
          return "";
        }
      };
      const a = await um(t.text_a);
      const b = await um(t.text_b);
      if (!cancelado) setPreviews({ a, b });
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [t.text_a, t.text_b, leadId]);

  const patch = (p: Partial<TemplateDraft>) => setT((x) => ({ ...x, ...p }));

  // O anexo é acréscimo do port (o protótipo não tinha). Escolher o tipo no
  // `<select>` cria `{kind, name: ""}`, e o campo do nome só aparece depois:
  // sem esta guarda, clicar em "Salvar modelo" sem digitar o nome derrubava o
  // `POST`/`PUT` inteiro com `400 VALIDATION_ERROR` (`name` é
  // `@MinLength(1)` no DTO). Avisar é melhor que sumir com o anexo em silêncio.
  const anexoSemNome = !!t.attachment && !t.attachment.name.trim();

  const save_ = () => {
    if (!t.name.trim() || !t.text_a.trim() || anexoSemNome) return;
    save.mutate(
      {
        id: t.id,
        body: {
          name: t.name.trim(),
          audience: t.audience,
          stage: t.stage,
          channel: t.channel,
          text_a: t.text_a,
          text_b: t.text_b,
          attachment: t.attachment?.name.trim()
            ? {
                kind: t.attachment.kind,
                name: t.attachment.name.trim(),
                ...(t.attachment.url ? { url: t.attachment.url } : {}),
              }
            : null,
        },
      },
      { onSuccess: () => onClose() },
    );
  };

  const insertVar = (v: string, field: "text_a" | "text_b") =>
    patch({ [field]: `${t[field] ?? ""}{{${v}}}` } as Partial<TemplateDraft>);

  const usadas = usedVariables(`${t.text_a} ${t.text_b}`);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold">Modelo de mensagem</h2>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">fechar</button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* edição */}
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              Nome interno
              <input value={t.name} onChange={(e) => patch({ name: e.target.value })} className={`mt-1 w-full ${inputCls}`} placeholder="Contratante · toque 1" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs text-muted-foreground">
                Público
                <select value={t.audience} onChange={(e) => patch({ audience: e.target.value })} className={`mt-1 w-full ${inputCls}`}>
                  {(catalog?.audiences ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Etapa
                <select value={t.stage} onChange={(e) => patch({ stage: Number(e.target.value) })} className={`mt-1 w-full ${inputCls}`}>
                  <option value={0}>qualquer</option>
                  {(catalog?.funnel_stages ?? []).map((st) => <option key={st.n} value={st.n}>{st.n}. {st.name}</option>)}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Canal
                <select value={t.channel} onChange={(e) => patch({ channel: e.target.value })} className={`mt-1 w-full ${inputCls}`}>
                  {(catalog?.channels ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>

            <div>
              <p className="tag text-muted-foreground">Variáveis — clique para inserir</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(catalog?.variables ?? []).map((v) => (
                  <button key={v} onClick={() => insertVar(v, "text_a")} className="rounded bg-secondary/70 px-1.5 py-0.5 text-[10px] hover:bg-secondary">
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-xs text-muted-foreground">
              Variação A
              <textarea value={t.text_a} onChange={(e) => patch({ text_a: e.target.value })} rows={6} className={`mt-1 w-full ${inputCls}`} />
            </label>
            <label className="block text-xs text-muted-foreground">
              Variação B (opcional — para testar qual responde mais)
              <textarea value={t.text_b} onChange={(e) => patch({ text_b: e.target.value })} rows={5} className={`mt-1 w-full ${inputCls}`} />
            </label>

            <div className="rounded-md border border-border p-2">
              <p className="tag text-muted-foreground">Anexo opcional</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <select
                  value={t.attachment?.kind ?? ""}
                  onChange={(e) =>
                    setT((x) => ({
                      ...x,
                      attachment: e.target.value
                        ? { kind: e.target.value, name: x.attachment?.name ?? "", url: x.attachment?.url ?? null }
                        : null,
                    }))
                  }
                  className={inputCls}
                >
                  <option value="">sem anexo</option>
                  <option value="video">vídeo</option>
                  <option value="imagem">imagem</option>
                  <option value="documento">documento</option>
                </select>
                {t.attachment && (
                  <input
                    value={t.attachment.name}
                    onChange={(e) => patch({ attachment: { ...t.attachment!, name: e.target.value } })}
                    placeholder="nome do arquivo ou link"
                    className={`flex-1 ${inputCls}`}
                  />
                )}
              </div>
              {anexoSemNome && (
                <p className="mt-1 text-xs text-destructive">
                  Escreva o nome do arquivo (ou o link) do anexo — ou volte para “sem anexo”.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={save_} disabled={save.isPending || anexoSemNome} className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">
                {save.isPending ? "Salvando…" : "Salvar modelo"}
              </button>
              {t.id && (
                <button
                  onClick={() => remove.mutate(t.id as string, { onSuccess: () => onClose() })}
                  disabled={remove.isPending}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-danger disabled:opacity-40"
                >
                  <Trash2 size={12} /> excluir
                </button>
              )}
            </div>
          </div>

          {/* prévia */}
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              Prévia com lead real
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={`mt-1 w-full ${inputCls}`}>
                {lista.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.city}</option>)}
              </select>
            </label>
            {([["a", t.text_a] as const, ["b", t.text_b] as const]).map(([f, raw]) =>
              raw.trim() ? (
                <div key={f} className="rounded-md border border-border bg-background/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="tag text-muted-foreground">Variação {f === "a" ? "A" : "B"}</p>
                    <button
                      onClick={() => navigator.clipboard?.writeText(previews[f])}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    >
                      <Copy size={11} /> copiar
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{previews[f]}</p>
                </div>
              ) : null,
            )}
            {usadas.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                variáveis usadas: {usadas.join(" · ")}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              O que aparecer como ⟨variavel⟩ está sem dado no lead escolhido — preencha antes de disparar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
