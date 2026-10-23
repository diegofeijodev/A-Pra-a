'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RemuneracaoConfig } from '@/components/praca/RemuneracaoConfig';
import { addDays, todaySp } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import {
  useAjustarGanhos,
  useConfigRemuneracao,
  useEstornarAjuste,
  useExtrato,
  useFecharSemana,
} from '@/modules/remuneracao/application/use-remuneracao';
import { remuneracaoDesligada } from '@/modules/remuneracao/infrastructure/remuneracao.api';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';
import {
  brl,
  centavosDeTexto,
  rotuloDia,
  rotuloSemana,
  rotuloStatus,
  type Lancamento,
} from '@/modules/remuneracao/domain/remuneracao';

const ROTULO_TIPO: Record<Lancamento['kind'], string> = { accrual: 'Ganho calculado', adjustment: 'Ajuste manual', reversal: 'Estorno de ajuste' };

function AjusteDialog({ consultantId, onFechar }: { consultantId: string; onFechar: () => void }) {
  const ajustar = useAjustarGanhos();
  const [clientId] = useState(() => crypto.randomUUID());
  const [sinal, setSinal] = useState<'1' | '-1'>('1');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const cents = centavosDeTexto(valor);
  const valido = cents !== null && cents > 0 && motivo.trim().length >= 3;
  return (
    <Dialog open onOpenChange={(o) => !o && !ajustar.isPending && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançar ajuste na semana corrente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            O ajuste entra na semana corrente, mesmo que o motivo seja de uma semana já fechada: semana fechada não reabre. O motivo é obrigatório e fica registrado com o seu nome.
          </p>
          <label htmlFor="aj-sinal" className="text-sm font-medium text-muted-foreground">
            Tipo
          </label>
          <select id="aj-sinal" className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base" value={sinal} onChange={(e) => setSinal(e.target.value as '1' | '-1')}>
            <option value="1">Acréscimo (soma ao consultor)</option>
            <option value="-1">Desconto (tira do consultor)</option>
          </select>
          <label htmlFor="aj-valor" className="text-sm font-medium text-muted-foreground">
            Valor (R$)
          </label>
          <Input id="aj-valor" inputMode="decimal" className="h-11" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 25,00" />
          <label htmlFor="aj-motivo" className="text-sm font-medium text-muted-foreground">
            Motivo (obrigatório)
          </label>
          <Input id="aj-motivo" className="h-11" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Button
            className="h-12 w-full"
            disabled={!valido || ajustar.isPending}
            onClick={() =>
              cents !== null &&
              ajustar.mutate({ consultant_id: consultantId, amount_cents: cents * Number(sinal), reason: motivo.trim(), client_id: clientId }, { onSuccess: onFechar })
            }
          >
            {cents !== null && cents > 0 ? `Lançar ${sinal === '1' ? '+' : '−'} ${brl(cents)}` : 'Lançar ajuste'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Extrato semanal do consultor com a conta de cada dia, o razão e (admin) fechar/ajustar (contrato §28.5). */
export function GanhosConsultor({ consultantId, nome }: { consultantId: string; nome?: string }) {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  // L13 §45: a regra própria só existe para o admin e com a flag no servidor (descoberta pelo `features`, nunca por 404).
  const cfgRem = useConfigRemuneracao();
  const regraPropriaOn = admin && cfgRem.data?.features?.per_consultant_enabled === true;
  const hoje = todaySp();
  const [dia, setDia] = useState(hoje);
  const q = useExtrato({ week: dia, consultant_id: consultantId });
  const fechar = useFecharSemana();
  const estornar = useEstornarAjuste();
  const [ajuste, setAjuste] = useState(false);
  // A regra própria só monta quando o admin abre a seção (não busca a regra nem roda o simulador à toa).
  const [regraAberta, setRegraAberta] = useState(false);

  if (q.isError && remuneracaoDesligada(q.error)) return null;
  if (q.isPending) return <p className="mt-6 text-sm text-muted-foreground">Carregando os ganhos…</p>;
  if (q.isError || !q.data) {
    return (
      <section className="mt-6 space-y-2">
        <p className="text-sm text-destructive">{apiErrorMessage(q.error, 'Não conseguimos carregar os ganhos.')}</p>
        <Button variant="outline" className="h-11" onClick={() => void q.refetch()}>
          Tentar de novo
        </Button>
      </section>
    );
  }
  const { week, ledger } = q.data;
  const c = q.data.consultants[0];
  const encerrada = week.to < hoje;
  const ehAtual = week.from <= hoje && hoje <= week.to;

  return (
    <section className="mt-6 space-y-3" aria-label="Ganhos do consultor">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="tag text-muted-foreground">Ganhos</h2>
        <Button variant="outline" className="h-11" aria-label="Semana anterior" onClick={() => setDia(addDays(week.from, -7))}>
          ←
        </Button>
        <span className="text-sm font-bold">{rotuloSemana(week.from, week.to)}</span>
        <Button variant="outline" className="h-11" aria-label="Próxima semana" disabled={ehAtual} onClick={() => setDia(addDays(week.from, 7))}>
          →
        </Button>
      </div>

      {!c ? (
        <p className="text-sm text-muted-foreground">Este consultor ainda não existia nesta semana.</p>
      ) : (
        <div className="card-surface space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-2xl font-black">{brl(c.total_cents)}</p>
            <p className="text-sm text-muted-foreground">
              Semana {rotuloStatus(c.status).toLowerCase()}
              {c.closed_at ? ` em ${new Date(c.closed_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (${c.closed_mode === 'auto' ? 'automático' : 'manual'})` : ''}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Conta: {c.confirmed_signups} {q.data.signup_source === 'declared' ? 'cadastros declarados pelo consultor na visita' : 'cadastros confirmados pelo Freela'} na semana. Fonte: {q.data.source}.
          </p>
          {c.rule && (
            <p className="text-sm">
              Regra desta semana: <span className="font-bold">{c.rule.label}</span>
            </p>
          )}
          {c.month && (
            <div className="rounded-md border border-border p-3">
              <p className="text-sm font-bold">{c.month.text}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {c.month.conta.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {c.conta.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <details>
            <summary className="min-h-11 cursor-pointer text-sm font-bold leading-[2.75rem]">Conta de cada dia</summary>
            <div className="space-y-3">
              {c.days
                .filter((d) => !d.future)
                .map((d) => (
                  <div key={d.day}>
                    <p className="text-sm font-bold">
                      {rotuloDia(d.day)} · {brl(d.total_cents)} · {d.rule_scope === 'consultant' ? 'regra própria, ' : c.rule ? 'regra geral, ' : ''}versão {d.rule_version}
                    </p>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground">
                      {d.conta.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </details>
          {admin && (
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-12"
                disabled={c.status === 'closed' || !encerrada || fechar.isPending}
                onClick={() => {
                  if (window.confirm(`Fechar a semana ${rotuloSemana(week.from, week.to)} deste consultor em ${brl(c.total_cents)}? Semana fechada não reabre.`)) {
                    fechar.mutate({ week_start: week.from, consultant_id: consultantId });
                  }
                }}
              >
                Fechar esta semana
              </Button>
              <Button variant="outline" className="h-12" onClick={() => setAjuste(true)}>
                Lançar ajuste
              </Button>
              {!encerrada && <p className="basis-full text-sm text-muted-foreground">A semana só pode ser fechada depois que terminar.</p>}
            </div>
          )}
        </div>
      )}

      {ledger && ledger.length > 0 && (
        <div className="card-surface overflow-x-auto p-4">
          <p className="text-sm font-bold">Razão da semana (lançamentos que entram no pagamento)</p>
          <table className="mt-2 w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 font-medium">Origem</th>
                <th className="py-1 pr-2 text-right font-medium">Valor</th>
                <th className="py-1 pr-2 font-medium">Motivo / por</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="py-2 pr-2">{ROTULO_TIPO[l.kind]}</td>
                  <td className="py-2 pr-2">
                    {l.work_scope === 'month' && l.work_day
                      ? `Bônus do mês ${l.work_day.slice(5, 7)}/${l.work_day.slice(0, 4)}`
                      : l.work_day
                        ? rotuloDia(l.work_day)
                        : `Semana de ${rotuloSemana(l.work_week, addDays(l.work_week, 6))}`}
                  </td>
                  <td className="py-2 pr-2 text-right font-bold">{brl(l.amount_cents)}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{l.reason ?? (l.source === 'late_confirmation' ? 'Confirmação tardia' : 'Calculado pela regra')}{l.created_by ? ` · ${l.created_by}` : ''}</td>
                  <td className="py-2">
                    {admin && l.kind === 'adjustment' && !ledger.some((x) => x.reverses_id === l.id) && (
                      <Button
                        variant="outline"
                        className="h-11"
                        disabled={estornar.isPending}
                        onClick={() => {
                          const motivo = window.prompt('Motivo do estorno (obrigatório):');
                          if (motivo && motivo.trim().length >= 3) estornar.mutate({ id: l.id, reason: motivo.trim(), client_id: crypto.randomUUID() });
                        }}
                      >
                        Estornar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ajuste && <AjusteDialog consultantId={consultantId} onFechar={() => setAjuste(false)} />}
      {regraPropriaOn && (
        <details className="card-surface p-4" onToggle={(e) => setRegraAberta(e.currentTarget.open)}>
          <summary className="min-h-12 cursor-pointer text-sm font-bold leading-[3rem]">Regra de pagamento deste consultor</summary>
          {regraAberta && <RemuneracaoConfig consultor={{ id: consultantId, name: nome ?? c?.name ?? 'o consultor' }} />}
        </details>
      )}
    </section>
  );
}
