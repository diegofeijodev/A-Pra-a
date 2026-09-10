'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { fmtDateTime, WD_SHORT } from '@/lib/dates';
import { Switch } from '@/components/ui/switch';
import { FreelaCampaignDetail } from '@/components/praca/FreelaCampaignDetail';
import { FreelaCampaignDialog } from '@/components/praca/FreelaCampaignDialog';
import { FreelaTemplateDialog } from '@/components/praca/FreelaTemplateDialog';
import {
  FreelaCard,
  FreelaNaoConfigurado,
  StatusTag,
} from '@/components/praca/FreelaBits';
import {
  useFreelaCampaigns,
  useFreelaStatus,
  useFreelaTemplates,
  useSetFreelaCampaignState,
  useSetFreelaTemplateEnabled,
  AUDIENCE_LABELS,
  FREELA_CHANNELS,
  KIND_LABELS,
  STATUS_LABELS,
  type FreelaCampaignStats,
  type FreelaCampaignView,
  type FreelaStatusView,
  type FreelaTemplateView,
} from '@/modules/freela/application/use-freela';
import { usePracas, useActivePraca } from '@/modules/pracas/application/use-pracas';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const TABS = ['campanhas', 'automáticas', 'conexão'] as const;

const inputCls =
  "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

/**
 * Freela — a tela da ponte com o sistema de campanhas do api-freela (§18).
 *
 * Acréscimo do port: o protótipo Lovable não falava com o Freela. São três
 * abas: as campanhas normais (o espelho local, com estado e contagens vindos de
 * lá), as automáticas (que moram no Freela; aqui só o vínculo com a praça) e a
 * conexão.
 *
 * Sem as três variáveis de ambiente na API, **as três abas** mostram o cartão
 * de configuração e os botões de criar ficam desligados: toda rota
 * `/v1/freela/*` menos `status` responde 503, e uma lista vazia diria que não
 * há campanha em vez de dizer que não há conexão.
 */
export default function FreelaPage() {
  const { isPending: pracasPending } = useActivePraca();
  const { data: status, isPending: statusPending } = useFreelaStatus();
  const [tab, setTab] = useState<(typeof TABS)[number]>('campanhas');

  if (pracasPending || statusPending) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  const configured = status?.configured === true;

  return (
    <>
      <div>
        <p className="tag text-muted-foreground">Integração</p>
        <h1 className="font-display text-2xl font-black tracking-tight">Freela</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          As campanhas de WhatsApp saem pelo chip de campanha do Freela: ritmo baixo, janela
          comercial e opt-out (“responda SAIR”). Aqui ficam as campanhas normais, as automáticas e o
          estado da conexão.
        </p>
      </div>

      <div className="mt-4 flex w-fit gap-1 rounded-lg border border-border bg-card/60 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-bold capitalize ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'campanhas' && <Campanhas configured={configured} />}
      {tab === 'automáticas' && <Automaticas configured={configured} />}
      {tab === 'conexão' && <Conexao status={status} />}
    </>
  );
}

// ══════════════ campanhas normais ══════════════
function Campanhas({ configured }: { configured: boolean }) {
  const { data: pracas } = usePracas();
  const { praca: ativa } = useActivePraca();
  const [pracaId, setPracaId] = useState('');
  const { data: campanhas, error } = useFreelaCampaigns(pracaId || undefined);
  const [nova, setNova] = useState(false);
  const lista = campanhas ?? [];

  return (
    <>
      <FreelaCard
        title="Campanhas"
        sub="Uma campanha de ativação no Freela: público, texto, ritmo e opt-out."
        right={
          <button
            onClick={() => setNova(true)}
            disabled={!configured || !ativa}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            <Plus size={14} /> Nova campanha
          </button>
        }
      >
        <label className="text-xs text-muted-foreground">
          Praça
          <select
            value={pracaId}
            onChange={(e) => setPracaId(e.target.value)}
            className={`ml-2 ${inputCls}`}
          >
            <option value="">todas</option>
            {(pracas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {!configured ? (
          <FreelaNaoConfigurado />
        ) : error ? (
          <ErroDaLista error={error} />
        ) : lista.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Nenhuma campanha ainda. Disparos e cadências no modo “Via Freela” também aparecem aqui.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {lista.map((c) => (
              <CampanhaCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </FreelaCard>

      <FreelaCampaignDialog open={nova} onClose={() => setNova(false)} />
    </>
  );
}

/**
 * Consulta que falhou não pode virar lista vazia: "nenhuma campanha" e "não
 * deu para falar com o Freela" são coisas diferentes, e a segunda tem que
 * aparecer com a mensagem da API (503 sem conexão, 502 quando ele recusa ou
 * some do ar).
 */
function ErroDaLista({ error }: { error: unknown }) {
  return (
    <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
      {apiErrorMessage(error, 'Não foi possível ler o Freela.')}
    </p>
  );
}

/** Contagem do espelho: `counts` vem em minúsculo, o mapa por status em maiúsculo. */
const conta = (s: FreelaCampaignStats | null, chave: 'pending' | 'sent' | 'failed' | 'skipped') => {
  const maiuscula = chave.toUpperCase() as 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  return s?.[chave] ?? s?.[maiuscula] ?? 0;
};

function CampanhaCard({ c }: { c: FreelaCampaignView }) {
  const { data: pracas } = usePracas();
  const setState = useSetFreelaCampaignState();
  const [aberta, setAberta] = useState(false);
  const praca = (pracas ?? []).find((p) => p.id === c.praca_id);
  const terminal = c.status === 'COMPLETED' || c.status === 'CANCELLED';

  const acao = (action: 'start' | 'pause' | 'cancel') =>
    setState.mutate({ id: c.freela_id, action });

  return (
    <div className="rounded-md border border-border bg-background/40">
      <div className="flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-extrabold">{c.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {KIND_LABELS[c.kind] ?? c.kind} · {praca?.name ?? 'sem praça'} ·{' '}
            {AUDIENCE_LABELS[c.audience] ?? c.audience} · criada {fmtDateTime(c.created_at)}
            {c.last_synced_at && ` · lida do Freela ${fmtDateTime(c.last_synced_at)}`}
          </p>
        </div>
        <StatusTag status={c.status} labels={STATUS_LABELS} />
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 sm:grid-cols-4">
        <Stat label="pendentes" value={conta(c.stats, 'pending')} />
        <Stat label="enviadas" value={conta(c.stats, 'sent')} />
        <Stat label="falhas" value={conta(c.stats, 'failed')} />
        <Stat label="puladas" value={conta(c.stats, 'skipped')} />
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3">
        {c.status === 'DRAFT' && (
          <button
            onClick={() => acao('start')}
            disabled={setState.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
          >
            iniciar
          </button>
        )}
        {c.status === 'RUNNING' && (
          <button
            onClick={() => acao('pause')}
            disabled={setState.isPending}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            pausar
          </button>
        )}
        {c.status === 'PAUSED' && (
          <button
            onClick={() => acao('start')}
            disabled={setState.isPending}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            retomar
          </button>
        )}
        {!terminal && (
          <button
            onClick={() => acao('cancel')}
            disabled={setState.isPending}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-danger disabled:opacity-40"
          >
            cancelar
          </button>
        )}
        <button
          onClick={() => setAberta((v) => !v)}
          className="ml-auto text-[11px] text-muted-foreground hover:text-primary"
        >
          {aberta ? 'fechar' : 'ver destinatários'}
        </button>
      </div>

      {aberta && <FreelaCampaignDetail freelaId={c.freela_id} />}
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

// ══════════════ campanhas automáticas ══════════════
/** A agenda em português: "toda semana · ter · 9h" ou "01/12 (todo ano) · 9h". */
function agendaLabel(t: FreelaTemplateView): string {
  if (t.scheduleKind === 'WEEKLY') {
    const dias = (t.weekdays ?? []).map((d) => WD_SHORT[d]).filter(Boolean).join(', ');
    return `toda semana · ${dias || 'nenhum dia'} · ${t.sendHour}h`;
  }
  const dia = String(t.targetDay ?? 1).padStart(2, '0');
  const mes = String(t.targetMonth ?? 1).padStart(2, '0');
  const ano = t.targetYear ? `/${t.targetYear}` : ' (todo ano)';
  const antes = t.leadDays ? ` · ${t.leadDays} dias antes` : '';
  return `${dia}/${mes}${ano}${antes} · ${t.sendHour}h`;
}

function Automaticas({ configured }: { configured: boolean }) {
  const { data: pracas } = usePracas();
  const { praca: ativa } = useActivePraca();
  const [pracaId, setPracaId] = useState('');
  const { data: templates, error } = useFreelaTemplates(pracaId || undefined);
  const setEnabled = useSetFreelaTemplateEnabled();
  const [editando, setEditando] = useState<FreelaTemplateView | null>(null);
  const [nova, setNova] = useState(false);
  const lista = templates ?? [];

  return (
    <>
      <FreelaCard
        title="Campanhas automáticas"
        sub="Rodam sozinhas na agenda do Freela — cada ocorrência vira uma campanha de ativação."
        right={
          <button
            onClick={() => setNova(true)}
            disabled={!configured || !ativa}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            <Plus size={14} /> Nova automática
          </button>
        }
      >
        <label className="text-xs text-muted-foreground">
          Praça
          <select
            value={pracaId}
            onChange={(e) => setPracaId(e.target.value)}
            className={`ml-2 ${inputCls}`}
          >
            <option value="">todas</option>
            {(pracas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {!configured ? (
          <FreelaNaoConfigurado />
        ) : error ? (
          <ErroDaLista error={error} />
        ) : lista.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Nenhuma campanha automática ainda.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {lista.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 p-3"
              >
                <div className="min-w-0">
                  <p className="font-display text-sm font-extrabold">{t.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {agendaLabel(t)} · {AUDIENCE_LABELS[t.audience] ?? t.audience} ·{' '}
                    {(t.channels ?? [])
                      .map((c) => FREELA_CHANNELS.find((x) => x.id === c)?.label ?? c)
                      .join(' + ')}
                    {' · '}
                    última rodada {t.lastRunAt ? fmtDateTime(t.lastRunAt) : 'nunca'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={t.enabled}
                      onCheckedChange={(v) => setEnabled.mutate({ id: t.id, enabled: v })}
                      disabled={setEnabled.isPending}
                      aria-label={t.enabled ? 'Pausar campanha' : 'Ligar campanha'}
                    />
                    {t.enabled ? 'ligada' : 'pausada'}
                  </label>
                  <button
                    onClick={() => setEditando(t)}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-bold"
                  >
                    editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </FreelaCard>

      <FreelaTemplateDialog open={nova} onClose={() => setNova(false)} />
      <FreelaTemplateDialog
        open={!!editando}
        onClose={() => setEditando(null)}
        template={editando}
      />
    </>
  );
}

// ══════════════ conexão ══════════════
function Conexao({ status }: { status: FreelaStatusView | undefined }) {
  const configured = status?.configured === true;
  return (
    <>
      <FreelaCard title="Conexão" sub="O Praça entra no Freela como um admin dedicado, com a permissão REFERRALS.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Linha label="Configurada" value={configured ? 'sim' : 'não'} tone={configured ? 'ok' : 'bad'} />
          <Linha
            label="Alcançável agora"
            value={status?.reachable ? 'sim' : 'não'}
            tone={status?.reachable ? 'ok' : 'bad'}
          />
          <Linha label="Conta de serviço" value={status?.admin_email ?? '—'} />
          <Linha
            label="Despachante do Freela"
            value={
              status?.scheduler_enabled === null || status?.scheduler_enabled === undefined
                ? '—'
                : status.scheduler_enabled
                  ? 'ligado'
                  : 'desligado'
            }
            tone={status?.scheduler_enabled === false ? 'warn' : undefined}
          />
          <Linha
            label="Texto por contato"
            value={status?.per_contact_message ? 'ligado' : 'desligado'}
          />
          <Linha
            label="Última sincronização"
            value={status?.last_sync_at ? fmtDateTime(status.last_sync_at) : 'nunca'}
          />
        </div>

        {status?.error && (
          <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{status.error}</p>
        )}

        <p className="tag mt-4 text-muted-foreground">As flags que mandam do outro lado</p>
        <ul className="mt-1.5 space-y-1.5 text-xs text-muted-foreground">
          <li>
            <code className="font-mono text-primary">ACTIVATION_CAMPAIGNS_ENABLED</code> — flag do
            servidor do Freela para as campanhas normais. Com ela desligada a campanha é criada e
            fica parada: nada sai.
          </li>
          <li>
            <code className="font-mono text-primary">CAMPAIGN_TEMPLATES_ENABLED</code> — a mesma
            coisa para as automáticas: a agenda não roda, e nenhuma ocorrência vira campanha.
          </li>
          <li>
            “Despachante do Freela” acima é o que o Freela responde sobre essas flags
            (<code className="font-mono">meta.schedulerEnabled</code>) — o Praça não liga nem
            desliga flag de lá.
          </li>
          <li>
            <code className="font-mono text-primary">FREELA_PER_CONTACT_MESSAGE</code> — flag do{' '}
            <b>Praça</b>. Desligada (padrão), todo mundo recebe o mesmo texto convertido e as
            variáveis por lead (<code className="font-mono">{'{{estabelecimento}}'}</code>,{' '}
            <code className="font-mono">{'{{bairro}}'}</code>) saem como estão. Ligada, cada
            contato leva o texto já renderizado — e ela só pode ser ligada depois que o api-freela
            de produção aceitar texto por contato, senão o lote inteiro volta com 400.
          </li>
        </ul>
      </FreelaCard>

      {!configured && <FreelaNaoConfigurado />}
    </>
  );
}

function Linha({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  const cor = tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'bad' ? 'text-danger' : '';
  return (
    <div className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${cor}`}>{value}</span>
    </div>
  );
}
