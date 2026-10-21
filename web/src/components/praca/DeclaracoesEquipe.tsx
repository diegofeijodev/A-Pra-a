'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { addDays, todaySp } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import { useAnularDeclaracao, useDeclarados } from '@/modules/declarados/application/use-declarados';
import {
  FILTROS,
  MOTIVOS,
  ROTULO_MOTIVO,
  ROTULO_STATUS,
  textoDivergencia,
  textoPagamento,
  type LinhaDeclaracao,
  type MotivoAnulacao,
} from '@/modules/declarados/domain/declarados';
import { rotuloDia } from '@/modules/remuneracao/domain/remuneracao';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const campo = 'h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-base';
const rotulo = 'text-sm font-medium text-muted-foreground';
const COR_STATUS = {
  confirmed: 'bg-success/15 text-success',
  pending: 'bg-warning/15 text-warning',
  unmatched: 'bg-destructive/15 text-destructive',
  voided: 'bg-muted text-muted-foreground',
} as const;

function AnularDialog({ l, onFechar }: { l: LinhaDeclaracao; onFechar: () => void }) {
  const anular = useAnularDeclaracao();
  const [clientId] = useState(() => crypto.randomUUID());
  const [motivo, setMotivo] = useState<MotivoAnulacao>('not_confirmed');
  const [nota, setNota] = useState('');
  const valido = nota.trim().length >= 3;
  return (
    <Dialog open onOpenChange={(o) => !o && !anular.isPending && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anular a declaração de {l.company_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Declarado por {l.consultant_name} em {rotuloDia(l.declared_day)}. A declaração não é apagada: a anulação fica registrada com o seu nome e o motivo, e o valor sai da conta do consultor (um lançamento negativo aparece nos
            ganhos dele no próximo fechamento ou ao reconciliar). Se anular por engano, lance um ajuste positivo com motivo.
          </p>
          <label htmlFor="an-motivo" className={rotulo}>
            Motivo
          </label>
          <select id="an-motivo" className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAnulacao)}>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {ROTULO_MOTIVO[m]}
              </option>
            ))}
          </select>
          <label htmlFor="an-nota" className={rotulo}>
            Explique em uma frase (obrigatório)
          </label>
          <Input id="an-nota" className="h-11" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
          {anular.isError && <p className="text-sm text-destructive">{apiErrorMessage(anular.error, 'Não foi possível anular.')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button className="h-12" disabled={!valido || anular.isPending} onClick={() => anular.mutate({ id: l.id, reason: motivo, note: nota.trim(), client_id: clientId }, { onSuccess: onFechar })}>
              Anular declaração
            </Button>
            <Button variant="outline" className="h-12" onClick={onFechar} disabled={anular.isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cadastros declarados (S3, contrato §32.6): relatório de divergência declaração × Freela, com a conta e a fonte,
 * e anulação manual (só admin, com motivo). Sem a flag no servidor (404), a tela mostra um aviso e nada mais.
 */
export function DeclaracoesEquipe() {
  const { user } = useAuth();
  const admin = !!user?.is_admin;
  const hoje = todaySp();
  const [from, setFrom] = useState(addDays(hoje, -6));
  const [to, setTo] = useState(hoje);
  const [status, setStatus] = useState('');
  const [anulando, setAnulando] = useState<LinhaDeclaracao | null>(null);
  const q = useDeclarados({ from, to, status });

  if (q.desligada)
    return <p className="mt-4 text-sm text-muted-foreground">O ganho por cadastro declarado não está ligado neste sistema (FIELD_DECLARED_SIGNUPS_ENABLED).</p>;

  const d = q.data;
  return (
    <div className="mt-4 space-y-4">
      <div className="card-surface grid gap-3 p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="dc-from" className={rotulo}>
            De
          </label>
          <Input id="dc-from" type="date" className="h-11" max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="dc-to" className={rotulo}>
            Até
          </label>
          <Input id="dc-to" type="date" className="h-11" min={from} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="dc-status" className={rotulo}>
            Mostrar
          </label>
          <select id="dc-status" className={campo} value={status} onChange={(e) => setStatus(e.target.value)}>
            {FILTROS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {q.isPending && <p className="text-sm text-muted-foreground">Carregando as declarações…</p>}
      {q.isError && !q.desligada && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{apiErrorMessage(q.error, 'Não foi possível carregar o relatório. Confira as datas (até 92 dias).')}</p>
          <Button variant="outline" className="h-12" onClick={() => void q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {d && (
        <>
          <section className="card-surface space-y-2 p-4" aria-label="Resumo">
            <h2 className="font-display text-lg font-extrabold">Resumo do período</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {d.conta.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">Fonte: {d.source}.</p>
          </section>

          {d.by_consultant.length > 0 && (
            <section className="card-surface space-y-2 p-4" aria-label="Por consultor">
              <h2 className="font-display text-lg font-extrabold">Por consultor</h2>
              <ul className="space-y-2">
                {d.by_consultant.map((c) => (
                  <li key={c.consultant_id} className="rounded-md border border-border p-3 text-sm">
                    <p className="font-bold">{c.name}</p>
                    <p>
                      {c.declared} declaradas · {c.confirmed} confirmadas · {c.pending_confirmation} aguardando · {c.unmatched} sem correspondência · {c.voided} anuladas · {c.over_cap} acima do limite
                    </p>
                    <p className="text-muted-foreground">Divergência: {textoDivergencia(c)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Declarações" className="space-y-2">
            <h2 className="font-display text-lg font-extrabold">Declarações ({d.rows.length}{d.truncated ? ', mostrando as 500 mais recentes' : ''})</h2>
            {d.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma declaração neste filtro.</p>
            ) : (
              <ul className="space-y-2">
                {d.rows.map((l) => (
                  <li key={l.id} className="card-surface space-y-1 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-bold">{l.company_name}</p>
                      <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-bold ${COR_STATUS[l.status]}`}>{ROTULO_STATUS[l.status]}</span>
                    </div>
                    <p className="text-sm">
                      {l.consultant_name} · {rotuloDia(l.declared_day)}
                      {l.over_cap && l.status !== 'voided' ? ' · acima do limite diário' : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">{textoPagamento(l)}</p>
                    {l.confirmed_by_other_consultant && <p className="text-sm text-muted-foreground">O cadastro deste estabelecimento no Freela foi feito por outro consultor.</p>}
                    {l.void && (
                      <p className="text-sm text-muted-foreground">
                        Anulado por {l.void.voided_by ?? 'sistema'}: {ROTULO_MOTIVO[l.void.reason as MotivoAnulacao] ?? l.void.reason}. {l.void.note}
                      </p>
                    )}
                    {admin && !l.void && (
                      <Button variant="outline" className="h-12" onClick={() => setAnulando(l)}>
                        Anular
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {anulando && <AnularDialog l={anulando} onFechar={() => setAnulando(null)} />}
    </div>
  );
}
