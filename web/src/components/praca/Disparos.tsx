'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Ban, Check, Copy, ExternalLink, Send, Trash2 } from 'lucide-react';
import { fmtDateTime } from '@/lib/dates';
import { useUiStore } from '@/lib/ui-store';
import { useCatalog } from '@/modules/catalog/application/use-catalog';
import {
  useCreateDisparo,
  useDisparo,
  useDisparoPreview,
  useDisparos,
  useMarkSend,
  useReplySend,
  EMPTY_FILTERS,
  type DisparoFilters,
  type SendView,
} from '@/modules/disparos/application/use-disparos';
import {
  useAddBlock,
  useBlocklist,
  useRemoveBlock,
  useSettings,
  useTemplates,
  useUpdateSettings,
  type UpdateSettingsInput,
} from '@/modules/messages/application/use-messages';
import { usePracas } from '@/modules/pracas/application/use-pracas';
import { useUsers } from '@/modules/users/application/use-users';

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

const waLink = (phone: string, text: string) =>
  `https://wa.me/55${(phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

/** Hora solta do `datetime-local` → instante com fuso; data inválida → `undefined`. */
const isoInstant = (local: string): string | undefined => {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/**
 * Disparos — porte de `.prototype/src/components/praca/Disparos.tsx`.
 *
 * Desvio §19.4: o protótipo tinha TRÊS modos de envio (fila, Meta oficial e
 * provedor externo); os dois últimos eram só campos de configuração, sem envio
 * de verdade, e não entraram no port. Os modos vêm de `catalog.send_modes`
 * (`fila` e `freela`) e o bloco Meta/provedor saiu de `ConfigEnvio`.
 *
 * Desvio §13: público, lista de bloqueio, trava de 30 dias, agendamento e
 * render lead a lead são do SERVIDOR (`POST /v1/disparos/preview`) — o
 * protótipo recontava tudo na tela a cada tecla, e a prévia podia divergir do
 * que a fila montava.
 */
export function Disparos() {
  return (
    <>
      <NovoDisparo />
      <ConfigEnvio />
      <Blocklist />
      <ListaDisparos />
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

// ══════════════ montar disparo ══════════════
function NovoDisparo() {
  const { data: catalog } = useCatalog();
  const { data: pracas } = usePracas();
  const { data: users } = useUsers();
  const { data: templates } = useTemplates();
  const { data: settings } = useSettings();
  const create = useCreateDisparo();

  const [filters, setFilters] = useState<DisparoFilters>(EMPTY_FILTERS);
  const [templateId, setTemplateId] = useState("");
  const [split, setSplit] = useState(false);
  const [mode, setMode] = useState("");
  const [when, setWhen] = useState<"agora" | "data">("agora");
  const [dt, setDt] = useState("");
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState("");

  const lista = templates ?? [];
  const modos = catalog?.send_modes ?? [];
  // O primeiro modelo e o modo gravado em `app_settings` são o padrão da tela,
  // mas só depois que a API responde — daí o `??` em vez de estado inicial.
  const tplId = templateId || lista[0]?.id || "";
  const modoId = mode || settings?.mode || modos[0]?.id || "";
  const tpl = lista.find((t) => t.id === tplId);
  const hasB = !!tpl?.text_b.trim();
  const f = (p: Partial<DisparoFilters>) => setFilters((x) => ({ ...x, ...p }));

  // `datetime-local` devolve hora SOLTA ("2026-09-14T12:00"): quem converte para
  // instante com fuso é o web, que sabe o fuso de quem está olhando (§19.19).
  // Data pela metade (o campo pode devolver "2026-09" em navegador antigo) seria
  // um `Invalid Date` — e `toISOString()` num `Invalid Date` quebra o RENDER.
  // Aqui ela cai no padrão da tela ("agora"), igual ao campo vazio.
  const scheduledAt = when === "data" ? isoInstant(dt) : undefined;

  const { data: preview } = useDisparoPreview({
    filters,
    template_id: tplId,
    split: split && hasB,
    mode: modoId,
    scheduled_at: scheduledAt,
  });

  const confirm = () => {
    if (!tpl || !preview?.sendable) return;
    create.mutate(
      {
        filters,
        template_id: tplId,
        split: split && hasB,
        mode: modoId,
        scheduled_at: scheduledAt,
        name: name.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          setConfirming(false);
          setDone(`Disparo criado: ${r.created} mensagens · ${r.skipped_block} na lista de bloqueio · ${r.skipped_dup} bloqueadas pela trava de 30 dias.`);
        },
      },
    );
  };

  return (
    <Card title="Novo disparo" sub="Uma mensagem, um grupo de pessoas, uma vez.">
      {done && <p className="mb-3 rounded-md bg-success/12 px-3 py-2 text-xs text-success">{done}</p>}

      {/* 1. público */}
      <p className="tag text-muted-foreground">1. Público — filtro do funil</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          Praça
          <select value={filters.praca_id} onChange={(e) => f({ praca_id: e.target.value })} className={`mt-1 w-full ${inputCls}`}>
            <option value="all">todas</option>
            {(pracas ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Etapa
          <select value={filters.stage} onChange={(e) => f({ stage: Number(e.target.value) })} className={`mt-1 w-full ${inputCls}`}>
            <option value={0}>todas</option>
            {(catalog?.funnel_stages ?? []).map((st) => <option key={st.n} value={st.n}>{st.n}. {st.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Classificação
          <select value={filters.classe} onChange={(e) => f({ classe: e.target.value })} className={`mt-1 w-full ${inputCls}`}>
            <option value="all">todas</option>
            {(catalog?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Origem
          <select value={filters.origem} onChange={(e) => f({ origem: e.target.value })} className={`mt-1 w-full ${inputCls}`}>
            <option value="all">todas</option>
            {(catalog?.origens ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Dono
          <select value={filters.owner_id} onChange={(e) => f({ owner_id: e.target.value })} className={`mt-1 w-full ${inputCls}`}>
            <option value="all">todos</option>
            {(users ?? []).filter((u) => u.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Dias parado (mínimo)
          <input type="number" min={0} value={filters.min_stalled} onChange={(e) => f({ min_stalled: Math.min(3650, Math.max(0, Number(e.target.value) || 0)) })} className={`mt-1 w-full ${inputCls}`} />
        </label>
      </div>
      <p className="mt-2 rounded-md bg-secondary/60 px-3 py-2 text-xs">
        <b className="font-display text-sm">{preview?.audience ?? 0} leads selecionados</b> · {preview?.sendable ?? 0} podem receber ·{" "}
        {preview?.blocked ?? 0} na lista de bloqueio · {preview?.dupes ?? 0} já receberam este modelo nos últimos 30 dias
      </p>

      {/* 2. modelo */}
      <p className="tag mt-4 text-muted-foreground">2. Modelo</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <select value={tplId} onChange={(e) => setTemplateId(e.target.value)} className={`${inputCls} min-w-64`}>
          {lista.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">
          canal: {(catalog?.channels ?? []).find((c) => c.id === tpl?.channel)?.label ?? tpl?.channel ?? "—"}
        </span>
        {hasB && (
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
            dividir o público ao meio para testar A/B
          </label>
        )}
      </div>

      {/* 3. prévia */}
      {(preview?.previews.length ?? 0) > 0 && (
        <>
          <p className="tag mt-4 text-muted-foreground">3. Prévia de 5 mensagens reais</p>
          <div className="mt-2 space-y-2">
            {preview!.previews.map((p) => (
              <div key={p.lead_id} className="rounded-md border border-border bg-background/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">
                  {p.name} · {p.city} · variação {p.variant}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs">{p.text}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 4. agendar + modo */}
      <p className="tag mt-4 text-muted-foreground">4. Agendar e escolher o modo de envio</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs"><input type="radio" checked={when === "agora"} onChange={() => setWhen("agora")} /> agora</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="radio" checked={when === "data"} onChange={() => setWhen("data")} /> data e hora</label>
        {when === "data" && <input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} className={inputCls} />}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nome do disparo (opcional)" className={`${inputCls} min-w-56`} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {modos.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-md border p-2.5 text-left ${modoId === m.id ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <p className="text-xs font-bold">{m.label}</p>
            <p className={`mt-1 text-[11px] ${m.tone === "danger" ? "text-danger" : m.tone === "warn" ? "text-warning" : "text-muted-foreground"}`}>{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Como o modelo vira campanha do Freela (§18.3) — só no modo `freela`. O
          `modoId` entra na condição porque a prévia guarda o retrato anterior
          (`keepPreviousData`): sem ele o bloco fica na tela ao voltar para
          `fila`, até a prévia nova chegar. */}
      {modoId === "freela" && preview?.freela && (
        <div className="mt-3 rounded-md border border-border bg-background/50 p-3">
          <p className="tag text-muted-foreground">Como vai sair pelo Freela</p>
          <p className="mt-2 whitespace-pre-wrap text-xs">{preview.freela.template}</p>
          {preview.freela.unsupported_variables.length > 0 && (
            <p className="mt-2 rounded-md bg-warning/12 px-3 py-2 text-[11px] text-warning">
              O Freela não conhece {preview.freela.unsupported_variables.map((v) => `{{${v}}}`).join(" · ")} — essas
              variáveis vão sair no texto do jeito que estão.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          disabled={!preview?.sendable || !tpl}
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          <Send size={14} /> Revisar e confirmar
        </button>
        <span className="text-xs text-muted-foreground">termina em ~{preview?.eta ?? "—"}</span>
      </div>

      {confirming && tpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-extrabold">Confirmar disparo</h3>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li><b>{preview?.sendable ?? 0} mensagens</b> serão montadas</li>
              <li>Para: {describe(filters, pracas ?? [], users ?? [], catalog)}</li>
              <li>
                Canal: {(catalog?.channels ?? []).find((c) => c.id === tpl.channel)?.label ?? tpl.channel} · modelo “{tpl.name}”
                {split && hasB ? " · dividido A/B" : ""}
              </li>
              <li>Modo: {modos.find((m) => m.id === modoId)?.label}</li>
              <li>Início: {preview?.first_at ? fmtDateTime(preview.first_at) : "agora"} · termina em ~{preview?.eta ?? "—"}</li>
              {settings && (
                <li className="text-muted-foreground">
                  Janela {settings.window_start}h–{settings.window_end}h, limite {settings.daily_limit}/dia,
                  intervalo sorteado de {settings.gap_min}–{settings.gap_max}s
                </li>
              )}
            </ul>
            <div className="mt-4 flex gap-2">
              <button onClick={confirm} disabled={create.isPending} className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">
                {create.isPending ? "Confirmando…" : "Confirmar"}
              </button>
              <button onClick={() => setConfirming(false)} className="rounded-md border border-border px-3 py-2 text-sm">cancelar</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

type NamedRow = { id: string; name: string };

function describe(
  f: DisparoFilters,
  pracas: NamedRow[],
  users: NamedRow[],
  catalog: ReturnType<typeof useCatalog>["data"],
): string {
  const bits: string[] = [];
  bits.push(f.praca_id === "all" ? "todas as praças" : pracas.find((p) => p.id === f.praca_id)?.name ?? "");
  if (f.stage) {
    const st = (catalog?.funnel_stages ?? []).find((s) => s.n === f.stage);
    bits.push(`etapa ${f.stage} (${st?.name ?? ""})`);
  }
  if (f.classe !== "all") bits.push((catalog?.classes ?? []).find((c) => c.id === f.classe)?.label ?? f.classe);
  if (f.origem !== "all") bits.push(`origem ${f.origem}`);
  if (f.owner_id !== "all") bits.push(`dono ${users.find((p) => p.id === f.owner_id)?.name ?? ""}`);
  if (f.min_stalled) bits.push(`parados ${f.min_stalled}+ dias`);
  return bits.filter(Boolean).join(" · ");
}

// ══════════════ configuração e proteções ══════════════
/**
 * Desvio: o protótipo gravava a cada tecla (era estado local); aqui cada campo
 * é um `PATCH /v1/settings`, então o valor sobe no `blur`. As travas do
 * protótipo (janela presa em 8h–20h, fim depois do início, intervalo mínimo)
 * ficam na tela para evitar o 400 — o servidor prende de novo, é ele que manda.
 */
function ConfigEnvio() {
  const { data: catalog } = useCatalog();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  // Muda a `key` dos campos para remontá-los quando o valor digitado não vale
  // (foi preso pelas travas) e nenhum PATCH sobe: sem isso o input continuaria
  // mostrando o número recusado, mentindo sobre o que está gravado.
  const [rev, setRev] = useState(0);
  const hardMin = catalog?.hard_min ?? 8;
  const hardMax = catalog?.hard_max ?? 20;
  const clampHour = (h: number) => Math.min(hardMax, Math.max(hardMin, h));

  if (!settings) {
    return (
      <Card title="Proteções e configuração de envio" sub="Valem para qualquer modo — nunca é possível sair de 8h–20h.">
        <p className="text-xs text-muted-foreground">Carregando…</p>
      </Card>
    );
  }

  const st = settings;
  // `blur` não é mudança: entrar e sair de um campo gravava um `PATCH` à toa.
  // Só sobe o que mudou de verdade.
  const gravar = (atual: number, novo: number, body: UpdateSettingsInput) => {
    if (novo === atual) {
      setRev((r) => r + 1);
      return;
    }
    update.mutate(body);
  };
  return (
    <Card title="Proteções e configuração de envio" sub="Valem para qualquer modo — nunca é possível sair de 8h–20h.">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-muted-foreground">
          Janela — início
          <input
            key={`ws-${rev}-${st.window_start}`} type="number" min={hardMin} max={hardMax} defaultValue={st.window_start}
            onBlur={(e) => {
              const v = Math.min(clampHour(Number(e.target.value)), st.window_end - 1);
              gravar(st.window_start, v, { window_start: v });
            }}
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Janela — fim
          <input
            key={`we-${rev}-${st.window_end}`} type="number" min={hardMin} max={hardMax} defaultValue={st.window_end}
            onBlur={(e) => {
              const v = Math.max(clampHour(Number(e.target.value)), st.window_start + 1);
              gravar(st.window_end, v, { window_end: v });
            }}
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Limite diário por número
          <input
            key={`dl-${rev}-${st.daily_limit}`} type="number" min={1} defaultValue={st.daily_limit}
            onBlur={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              gravar(st.daily_limit, v, { daily_limit: v });
            }}
            className={`mt-1 w-full ${inputCls}`}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Intervalo entre mensagens (s)
          <span className="mt-1 flex items-center gap-1">
            <input
              key={`gmin-${rev}-${st.gap_min}`} type="number" min={5} defaultValue={st.gap_min}
              onBlur={(e) => {
                const v = Math.min(Math.max(5, Number(e.target.value) || 5), st.gap_max - 1);
                gravar(st.gap_min, v, { gap_min: v });
              }}
              className={`w-full ${inputCls}`}
            />
            <input
              key={`gmax-${rev}-${st.gap_max}`} type="number" min={st.gap_min} defaultValue={st.gap_max}
              onBlur={(e) => {
                const v = Math.max(st.gap_min + 1, Number(e.target.value) || st.gap_min + 1);
                gravar(st.gap_max, v, { gap_max: v });
              }}
              className={`w-full ${inputCls}`}
            />
          </span>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Envio de segunda a sábado (domingo bloqueado), janela travada entre {hardMin}h e {hardMax}h, intervalo sorteado a cada mensagem,
        e a mesma pessoa não recebe o mesmo modelo duas vezes em 30 dias.
      </p>
    </Card>
  );
}

// ══════════════ lista de bloqueio ══════════════
function Blocklist() {
  const { data: blocklist } = useBlocklist();
  const add = useAddBlock();
  const remove = useRemoveBlock();
  const [phone, setPhone] = useState("");
  const lista = blocklist ?? [];
  return (
    <Card title={`Lista de bloqueio · ${lista.length}`} sub="Quem pediu para não receber nunca entra em disparo nenhum. Respostas como “pare”, “sair” ou “não quero” entram automaticamente.">
      <div className="flex flex-wrap gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="telefone" className={inputCls} />
        <button
          onClick={() => {
            if (!phone.trim()) return;
            add.mutate({ phone: phone.trim() }, { onSuccess: () => setPhone("") });
          }}
          disabled={add.isPending}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
        >
          <Ban size={12} /> bloquear
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        {lista.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-xs">
            <span>{b.name} · {b.phone} <span className="text-muted-foreground">— {b.reason}</span></span>
            <button onClick={() => remove.mutate(b.id)} className="text-muted-foreground hover:text-danger"><Trash2 size={12} /></button>
          </div>
        ))}
        {!lista.length && <p className="text-xs text-muted-foreground">Ninguém na lista de bloqueio.</p>}
      </div>
    </Card>
  );
}

// ══════════════ disparos criados + painel ══════════════
function ListaDisparos() {
  const { data: catalog } = useCatalog();
  const { data: disparos } = useDisparos();
  const [open, setOpen] = useState<string | null>(null);
  const lista = disparos ?? [];
  if (!lista.length) return <Card title="Disparos"><p className="text-xs text-muted-foreground">Nenhum disparo ainda.</p></Card>;
  return (
    <Card title={`Disparos · ${lista.length}`}>
      <div className="space-y-2">
        {lista.map((c) => (
          <div key={c.id} className="rounded-md border border-border bg-background/40">
            <button onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left">
              <span>
                <span className="font-display text-sm font-extrabold">{c.name}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {fmtDateTime(c.at)} · {(catalog?.channels ?? []).find((ch) => ch.id === c.channel)?.label ?? c.channel} ·{" "}
                  {(catalog?.send_modes ?? []).find((m) => m.id === c.mode)?.label ?? c.mode}
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground">{open === c.id ? "fechar" : "abrir painel"}</span>
            </button>
            {open === c.id && <PainelDisparo id={c.id} />}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PainelDisparo({ id }: { id: string }) {
  const { data } = useDisparo(id);
  if (!data) return <div className="border-t border-border p-3 text-xs text-muted-foreground">Carregando…</div>;

  const { disparo: c, stats, by_hour: byHour, sends } = data;
  const maxH = Math.max(1, ...byHour);

  return (
    <div className="border-t border-border p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Stat label="na fila" value={stats.queued} />
        <Stat label="enviadas" value={stats.sent} />
        <Stat label="entregues" value={stats.delivered} />
        <Stat label="respondidas" value={stats.replied} />
        <Stat label="avançaram etapa" value={stats.advanced} />
        <Stat label="entraram no bloqueio" value={stats.blocked_after} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {c.skipped_block} pulados pela lista de bloqueio · {c.skipped_dup} pulados pela trava de 30 dias
      </p>

      {/* Modo `freela`: quem entrega é a campanha lá (§18.5). */}
      {c.freela_campaign_id && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Este lote virou campanha no Freela —{" "}
          <Link href="/freela" className="text-primary hover:underline">acompanhar em Freela</Link>.
        </p>
      )}

      <p className="tag mt-4 text-muted-foreground">Respostas por hora</p>
      <div className="mt-1 flex h-20 items-end gap-0.5">
        {byHour.map((v, h) => (
          <div key={h} className="flex-1" title={`${h}h · ${v} respostas`}>
            <div className="rounded-t bg-primary/70" style={{ height: `${(v / maxH) * 68}px` }} />
            {h % 3 === 0 && <p className="mt-0.5 text-center text-[9px] text-muted-foreground">{h}h</p>}
          </div>
        ))}
      </div>

      <p className="tag mt-4 text-muted-foreground">
        {c.mode === "fila" ? "Fila manual — copie, abra a conversa, envie e marque como enviada" : "Fila de acompanhamento"}
      </p>
      <div className="mt-2 space-y-1.5">
        {sends.slice(0, 60).map((x) => <FilaItem key={x.id} x={x} mode={c.mode} />)}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2 text-center">
      <p className="font-display text-base font-black">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Uma linha da fila do lote. `mode` é o modo do DISPARO: no modo `freela` quem
 * entrega é o outbox do servidor (§18.5), que garimpa exatamente os envios em
 * `fila` — marcar "enviada" aqui tiraria a mensagem da fila para sempre (ela
 * nunca sairia no WhatsApp) e ainda gravaria evento e `last_contact_at` na
 * ficha de gente real. Por isso a marcação manual de estado só existe em
 * `fila`; registrar a RESPOSTA continua nos dois modos — o Freela não devolve
 * resposta, ela é sempre registrada à mão aqui (§18.6).
 */
function FilaItem({ x, mode }: { x: SendView; mode: string }) {
  const openLead = useUiStore((s) => s.openLead);
  const mark = useMarkSend();
  const reply = useReplySend();
  const [texto, setTexto] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card/50 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => openLead(x.lead.id)} className="text-left text-xs font-bold hover:text-primary">
          {x.lead.name} <span className="font-normal text-muted-foreground">· {x.lead.city} · {x.lead.phone} · variação {x.variant}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${x.status === "fila" ? "bg-secondary/70" : x.status === "respondida" ? "bg-success/15 text-success" : x.status === "falhou" ? "bg-danger/15 text-danger" : "bg-primary/15 text-primary"}`}>
            {x.status} · {fmtDateTime(x.scheduled_at)}
          </span>
          <button onClick={() => navigator.clipboard?.writeText(x.text)} className="rounded border border-border p-1 hover:text-primary" title="copiar"><Copy size={12} /></button>
          <a href={waLink(x.lead.phone, x.text)} target="_blank" rel="noreferrer" className="rounded border border-border p-1 hover:text-primary" title="copiar e abrir conversa"><ExternalLink size={12} /></a>
          {mode === "fila" && x.status === "fila" && (
            <button onClick={() => mark.mutate({ id: x.id, status: "enviada" })} disabled={mark.isPending} className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-40">
              <Check size={11} /> marcar enviada
            </button>
          )}
          {mode === "fila" && x.status === "enviada" && (
            <button onClick={() => mark.mutate({ id: x.id, status: "entregue" })} disabled={mark.isPending} className="rounded-md border border-border px-2 py-1 text-[11px] disabled:opacity-40">entregue</button>
          )}
          {x.status !== "fila" && x.status !== "respondida" && (
            <button onClick={() => setShow((v) => !v)} className="rounded-md border border-border px-2 py-1 text-[11px]">respondeu</button>
          )}
        </div>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-muted-foreground">{x.text}</p>
      {/* Modo `freela`: telefone quebrado ou repetido no lote não sobe (§18.5). */}
      {x.failure_reason && (
        <p className="mt-1.5 rounded-md bg-danger/12 px-2 py-1 text-[11px] text-danger">{x.failure_reason}</p>
      )}
      {show && (
        <div className="mt-2 flex gap-2">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="o que ele respondeu" className={`flex-1 ${inputCls}`} />
          <button
            onClick={() => {
              if (!texto.trim()) return;
              reply.mutate(
                { id: x.id, text: texto.trim() },
                { onSuccess: () => { setShow(false); setTexto(""); } },
              );
            }}
            disabled={reply.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
          >
            registrar
          </button>
        </div>
      )}
    </div>
  );
}
