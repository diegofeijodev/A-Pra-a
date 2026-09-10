'use client';

import { AlertTriangle } from 'lucide-react';
import type { FreelaPacingInput } from '@/modules/freela/application/use-freela';
import type { SettingsView } from '@/modules/messages/application/use-messages';
import type { PracaView } from '@/modules/pracas/application/use-pracas';

/**
 * Peças repetidas das telas do Freela (§18) — o equivalente de `bits.tsx` e
 * `IndBits.tsx` para esta área.
 *
 * Este arquivo não existe no protótipo: a tela **Freela** é o acréscimo do port
 * (o protótipo não falava com o api-freela). O que mora aqui é o que aparece em
 * mais de um lugar: o cartão de "não configurada" (as três abas E os dois
 * diálogos), o aviso de disparo frio, a máscara de telefone, as etiquetas de
 * estado e a conversão do ritmo do Praça para o do Freela (§18.3).
 */

export const inputCls =
  "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";

export function FreelaCard({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 rounded-lg border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-extrabold">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * O cartão que ocupa as três abas sem conexão. Ele é a tela inteira nesse
 * estado: sem as três variáveis, TODA rota `/v1/freela/*` menos `status`
 * responde `503 FREELA_NOT_CONFIGURED` (§18.1) — mostrar uma lista vazia seria
 * mentir que não há campanha.
 */
export function FreelaNaoConfigurado() {
  return (
    <section className="mt-5 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <h2 className="font-display text-base font-extrabold">
            Conexão com o Freela não configurada
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            As campanhas daqui saem pelo chip de campanha do Freela. Enquanto as três variáveis
            abaixo não estiverem no <code className="font-mono">.env</code> da API do Praça, esta
            tela e o modo de envio “Via Freela” respondem 503 — o resto do Praça funciona normal.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {[
          { k: 'FREELA_API_URL', v: 'base da API do Freela (ex.: http://localhost:3000)' },
          { k: 'FREELA_ADMIN_EMAIL', v: 'e-mail da conta de serviço (admin do Freela)' },
          { k: 'FREELA_ADMIN_PASSWORD', v: 'senha dessa conta' },
        ].map((x) => (
          <p key={x.k} className="rounded-md bg-background/60 px-2.5 py-1.5 text-xs">
            <code className="font-mono text-primary">{x.k}</code>{' '}
            <span className="text-muted-foreground">— {x.v}</span>
          </p>
        ))}
      </div>

      <p className="tag mt-4 text-muted-foreground">Passo a passo</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          No painel do Freela, crie um usuário de painel dedicado ao Praça (papel{' '}
          <code className="font-mono">ADMIN</code>) com a permissão{' '}
          <code className="font-mono">REFERRALS</code> — o Freela não tem chave de API nem conta de
          serviço, a única porta é o login de admin.
        </li>
        <li>
          Preencha as três variáveis no <code className="font-mono">.env</code> da API do Praça com
          o endereço do Freela e o e-mail e a senha dessa conta.
        </li>
        <li>Reinicie a API do Praça — esta tela passa a mostrar a conexão em pé.</li>
      </ol>
    </section>
  );
}

/** Aviso fixo de todo disparo frio — vale para campanha normal e automática. */
export function AvisoFrio() {
  return (
    <p className="flex gap-1.5 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      Disparo frio queima número. O Freela usa o chip de campanha, ritmo baixo e opt-out — mesmo
      assim, mande só para quem faz sentido.
    </p>
  );
}

/**
 * Telefone de destinatário aparece MASCARADO: a lista é a base de gente real do
 * Freela, e a tela do Praça só precisa dizer "é este número mesmo" — os quatro
 * últimos dígitos bastam para conferir.
 */
export function maskPhone(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return '—';
  if (d.length <= 8) return '•'.repeat(d.length);
  return `${d.slice(0, 4)}${'•'.repeat(d.length - 8)}${d.slice(-4)}`;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-secondary/70 text-muted-foreground',
  RUNNING: 'bg-primary/15 text-primary',
  PAUSED: 'bg-warning/15 text-warning',
  COMPLETED: 'bg-success/15 text-success',
  CANCELLED: 'bg-danger/15 text-danger',
};

const RECIPIENT_TONE: Record<string, string> = {
  PENDING: 'bg-secondary/70 text-muted-foreground',
  SENT: 'bg-success/15 text-success',
  FAILED: 'bg-danger/15 text-danger',
  SKIPPED: 'bg-warning/15 text-warning',
};

export function StatusTag({ status, labels }: { status: string; labels: Record<string, string> }) {
  return (
    <span className={`tag rounded-full px-2 py-0.5 ${STATUS_TONE[status] ?? 'bg-secondary/70'}`}>
      {labels[status] ?? status}
    </span>
  );
}

export function RecipientTag({ status }: { status: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] ${RECIPIENT_TONE[status] ?? 'bg-secondary/70'}`}>
      {status}
    </span>
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * O ritmo do Praça (`GET /v1/settings`) na conta do Freela — a MESMA de
 * `toFreelaPacing` no servidor (§18.3), repetida aqui só para o campo já abrir
 * preenchido. Quem manda continua sendo a API: `pacing` ausente no corpo faz
 * ela converter de novo.
 *
 * ⚠️ O Freela não distingue sábado: `sunday: false` no Praça vira
 * `weekdaysOnly: true` lá, que corta o sábado junto.
 */
export function pacingFromSettings(s: SettingsView | undefined): Required<FreelaPacingInput> {
  const medio = ((s?.gap_min ?? 45) + (s?.gap_max ?? 90)) / 2;
  return {
    messages_per_hour: clamp(medio > 0 ? Math.round(3600 / medio) : 60, 1, 60),
    daily_cap: clamp(Math.round(s?.daily_limit ?? 200), 1, 1000),
    window_start_hour: clamp(Math.round(s?.window_start ?? 9), 0, 23),
    // Fim de janela é exclusivo dos dois lados (1..24).
    window_end_hour: clamp(Math.round(s?.window_end ?? 19), 1, 24),
    weekdays_only: !(s?.sunday ?? false),
  };
}

/** Cidade-sede da praça: a da cobertura ou o pedaço antes do `·` em `city`. */
export function pracaCity(praca: PracaView | undefined): string {
  return praca?.cobertura?.cidade || (praca?.city ?? '').split(' · ')[0]?.trim() || '';
}

/** UF da praça, pela cobertura ou pelo pedaço depois do `·` em `city`. */
export function pracaUf(praca: PracaView | undefined): string {
  return praca?.cobertura?.uf || (praca?.city ?? '').split(' · ')[1]?.trim() || '';
}

/** Cobertura da praça como lista de cidades: sede + vizinhas (teto de 200 do DTO). */
export function pracaCities(praca: PracaView | undefined): string[] {
  const sede = pracaCity(praca);
  const todas = [sede, ...(praca?.cobertura?.vizinhas ?? [])].filter(Boolean);
  return [...new Set(todas)].slice(0, 200);
}
