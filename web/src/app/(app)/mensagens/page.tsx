'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Paperclip, Plus } from 'lucide-react';
import { CabecalhoPagina } from '@/components/praca/CabecalhoPagina';
import { Cadencias } from '@/components/praca/Cadencias';
import { Disparos } from '@/components/praca/Disparos';
import {
  TemplateEditor,
  emptyTemplate,
  toDraft,
  type TemplateDraft,
} from '@/components/praca/TemplateEditor';
import { abaDeMensagens } from '@/modules/mensagens/domain/aba';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import { pct, useTemplates } from '@/modules/messages/application/use-messages';

/**
 * Mensagens — porte de `.prototype/src/routes/mensagens.tsx`.
 *
 * Desvio §12: as métricas de cada modelo (enviadas, resposta, avanço 7d,
 * ganhando, quebra A/B) vêm PRONTAS do `GET /v1/msg-templates` e a lista já
 * chega ordenada por taxa de resposta — o protótipo recontava envio a envio a
 * cada render. O `<LeadPanel/>` que a rota do protótipo montava agora vive no
 * layout de `(app)`, então a página não o monta de novo.
 */
export default function MensagensPage() {
  // `useSearchParams` obriga uma fronteira de Suspense (Next 15).
  return (
    <Suspense fallback={null}>
      <Mensagens />
    </Suspense>
  );
}

function Mensagens() {
  // `?aba=cadencias|disparos` abre na aba certa (links de Automações); sem ele, "modelos".
  const aba = abaDeMensagens(useSearchParams().toString());
  const [tab, setTab] = useState<"modelos" | "disparos" | "cadências">(aba === "cadencias" ? "cadências" : aba);
  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Mensagens"
        subtitulo="Biblioteca de modelos com variação A/B, disparos em lote e cadências que rodam sozinhas ao longo de dias."
      />

      <div className="flex w-fit gap-1 rounded-2xl bg-card p-1 shadow-card">
        {(["modelos", "disparos", "cadências"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-bold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "modelos" ? <Modelos /> : tab === "disparos" ? <Disparos /> : <Cadencias />}
    </div>
  );
}

// ══════════════ Modelos ══════════════
function Modelos() {
  const { data: catalog } = useCatalog();
  const { data: templates } = useTemplates();
  const [editing, setEditing] = useState<TemplateDraft | null>(null);
  const lista = templates ?? [];

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {lista.length} modelos · ordenados por taxa de resposta
        </p>
        <button onClick={() => setEditing(emptyTemplate())} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={14} /> Novo modelo
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {lista.map((t) => {
          const m = t.metrics;
          const st = t.stage ? (catalog?.funnel_stages ?? []).find((s) => s.n === t.stage) : null;
          return (
            <div key={t.id} className="rounded-2xl bg-card p-3 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{t.name || "sem nome"}</span>
                    <span className="rounded bg-secondary/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{t.audience}</span>
                    <span className="rounded bg-secondary/70 px-1.5 py-0.5 text-[10px]">{(catalog?.channels ?? []).find((c) => c.id === t.channel)?.label ?? t.channel}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: st ? st.color : "#4A4A44" }}
                    >
                      {st ? `${st.n}. ${st.name}` : "qualquer etapa"}
                    </span>
                    {t.text_b.trim() && <span className="rounded border border-border px-1.5 py-0.5 text-[10px]">A/B</span>}
                    {t.attachment && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Paperclip size={10} /> {t.attachment.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-muted-foreground">{t.text_a}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Metric label="enviadas" value={String(m.sent)} />
                  <Metric label="resposta" value={pct(m.resp_rate)} />
                  <Metric label="avanço 7d" value={pct(m.adv_rate)} />
                  <Metric label="ganhando" value={m.winner} />
                  <button onClick={() => setEditing(toDraft(t))} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-bold">abrir</button>
                </div>
              </div>
              {t.text_b.trim() && m.sent > 0 && (
                <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                  variação A: {m.a.sent} envios · {pct(m.a.rate)} resposta &nbsp;·&nbsp; variação B: {m.b.sent} envios · {pct(m.b.rate)} resposta
                </p>
              )}
            </div>
          );
        })}
      </div>

      {editing && <TemplateEditor tpl={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-sm font-black">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
