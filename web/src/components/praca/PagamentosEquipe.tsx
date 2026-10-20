'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { addDays } from '@/lib/dates';
import { useAuth } from '@/modules/auth/application/use-auth';
import {
  useAbrirComprovante,
  useBaixarCsv,
  useChavePix,
  useGerarFila,
  useMarcarPago,
  useMudarPagamento,
  usePagamentos,
} from '@/modules/pagamentos/application/use-pagamentos';
import {
  acoesDisponiveis,
  brl,
  erroDoComprovante,
  LIMITE_COMPROVANTE_MB,
  ordenarFila,
  pagoEmCentavos,
  rotuloSemana,
  rotuloStatus,
  TEXTO_CANCELAR,
  TEXTO_ESTORNAR,
  TEXTO_FALHOU,
  textoConfirmarPagamento,
  tomDoStatus,
  type Pagamento,
  type Tom,
} from '@/modules/pagamentos/domain/pagamentos';
import { centavosDeTexto, textoDeCentavos } from '@/modules/remuneracao/domain/remuneracao';
import { apiErrorMessage } from '@/modules/shared/infrastructure/http';

const COR: Record<Tom, string> = {
  ok: 'bg-success/15 text-success',
  atencao: 'bg-warning/15 text-warning',
  erro: 'bg-destructive/15 text-destructive',
  neutro: 'bg-muted text-muted-foreground',
};

function Selo({ p }: { p: Pagamento }) {
  return <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-bold ${COR[tomDoStatus(p)]}`}>{rotuloStatus(p)}</span>;
}

// ── "Marcar como pago" ────────────────────────────────────────────────────

function PagarDialog({ p, provaObrigatoria, onFechar }: { p: Pagamento; provaObrigatoria: boolean; onFechar: () => void }) {
  const pagar = useMarcarPago();
  const [valor, setValor] = useState(textoDeCentavos(p.due_cents));
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [passo, setPasso] = useState<'form' | 'confirmar'>('form');

  const pago = pagoEmCentavos(valor, p.due_cents, centavosDeTexto);
  const diferente = pago.ok && pago.cents !== p.due_cents;

  function avancar() {
    setErro(null);
    if (!pago.ok) return setErro(pago.erro);
    if (diferente && motivo.trim().length < 3) return setErro('Valor diferente do devido: explique o motivo (ao menos 3 caracteres).');
    if (!arquivo && provaObrigatoria) return setErro('Anexe o comprovante do Pix (foto ou PDF).');
    if (arquivo) {
      const e = erroDoComprovante(arquivo);
      if (e) return setErro(e);
    }
    setPasso('confirmar');
  }

  function confirmar() {
    if (!pago.ok) return;
    pagar.mutate(
      { id: p.id, paid_cents: pago.cents, ...(diferente ? { reason: motivo.trim() } : {}), ...(obs.trim() ? { note: obs.trim() } : {}), proof: arquivo },
      { onSuccess: onFechar, onError: (e) => setErro(apiErrorMessage(e, 'Não foi possível registrar o pagamento.')) },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pagar.isPending && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marcar como pago: {p.consultant_name}</DialogTitle>
        </DialogHeader>
        {passo === 'form' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Devido: <span className="font-bold text-foreground">{brl(p.due_cents)}</span> · semana {rotuloSemana(p.week.from, p.week.to)}. Faça o Pix no app do seu banco e registre aqui.
            </p>
            <label htmlFor="pg-valor" className="text-sm font-medium text-muted-foreground">
              Valor pago (R$)
            </label>
            <Input id="pg-valor" inputMode="decimal" className="h-12" value={valor} onChange={(e) => setValor(e.target.value)} />
            {diferente && (
              <>
                <label htmlFor="pg-motivo" className="text-sm font-medium text-muted-foreground">
                  Motivo da diferença (obrigatório)
                </label>
                <Input id="pg-motivo" className="h-12" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </>
            )}
            <label htmlFor="pg-arquivo" className="text-sm font-medium text-muted-foreground">
              Comprovante {provaObrigatoria ? '(obrigatório)' : '(opcional)'} · foto ou PDF, até {LIMITE_COMPROVANTE_MB} MB
            </label>
            <input
              id="pg-arquivo"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              className="block min-h-12 w-full text-sm"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
            <label htmlFor="pg-obs" className="text-sm font-medium text-muted-foreground">
              Observação (opcional)
            </label>
            <Input id="pg-obs" className="h-12" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-12" onClick={onFechar}>
                Voltar
              </Button>
              <Button className="h-12" onClick={avancar}>
                Continuar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {pago.ok && textoConfirmarPagamento(p, pago.cents).map((l) => (
              <p key={l} className="text-sm">
                {l}
              </p>
            ))}
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-12" disabled={pagar.isPending} onClick={() => setPasso('form')}>
                Voltar
              </Button>
              <Button className="h-12" disabled={pagar.isPending} onClick={confirmar}>
                {pagar.isPending ? 'Registrando…' : 'Sim, já paguei'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── ações com motivo (falhou, cancelar, estornar) ─────────────────────────

type AcaoMotivo = 'fail' | 'cancel' | 'reverse';
const TEXTOS: Record<AcaoMotivo, { titulo: string; botao: string; consequencia: string }> = {
  fail: { titulo: 'O Pix falhou', botao: 'Registrar falha', consequencia: TEXTO_FALHOU },
  cancel: { titulo: 'Cancelar pagamento', botao: 'Cancelar pagamento', consequencia: TEXTO_CANCELAR },
  reverse: { titulo: 'Estornar pagamento', botao: 'Estornar', consequencia: TEXTO_ESTORNAR },
};

function MotivoDialog({ p, acao, onFechar }: { p: Pagamento; acao: AcaoMotivo; onFechar: () => void }) {
  const mudar = useMudarPagamento();
  const [motivo, setMotivo] = useState('');
  const t = TEXTOS[acao];
  const valido = motivo.trim().length >= 3;
  return (
    <Dialog open onOpenChange={(o) => !o && !mudar.isPending && onFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t.titulo}: {p.consultant_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">{t.consequencia}</p>
          <label htmlFor="mt-motivo" className="text-sm font-medium text-muted-foreground">
            Motivo (obrigatório)
          </label>
          <Input id="mt-motivo" className="h-12" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-12" disabled={mudar.isPending} onClick={onFechar}>
              Voltar
            </Button>
            <Button className="h-12" disabled={!valido || mudar.isPending} onClick={() => mudar.mutate({ id: p.id, acao, reason: motivo.trim() }, { onSuccess: onFechar })}>
              {mudar.isPending ? 'Salvando…' : t.botao}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── linha ─────────────────────────────────────────────────────────────────

function Linha({ p, admin, provaObrigatoria }: { p: Pagamento; admin: boolean; provaObrigatoria: boolean }) {
  const [dlg, setDlg] = useState<'pagar' | AcaoMotivo | null>(null);
  const mudar = useMudarPagamento();
  const chave = useChavePix();
  const comprovante = useAbrirComprovante();
  const a = acoesDisponiveis(p);

  async function copiar() {
    const r = await chave.mutateAsync(p.id).catch(() => null);
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r.pix_key);
      toast.success('Chave Pix copiada. Cole no app do banco.');
    } catch {
      toast.error('Não foi possível copiar. Libere a área de transferência no navegador.');
    }
  }

  const btn = 'h-12 min-w-12';
  return (
    <li className={`card-surface space-y-2 p-4 ${p.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-bold">{p.consultant_name ?? 'Consultor'}</p>
        <Selo p={p} />
      </div>
      <p className="text-2xl font-black">{brl(p.paid_cents ?? p.due_cents)}</p>
      <p className="text-sm text-muted-foreground">
        {p.blocked
          ? 'Sem chave Pix cadastrada: peça ao consultor e gere a fila de novo.'
          : `Chave ${p.pix_key_type ?? ''}: ${p.pix_key_masked ?? '—'} · Pix previsto ${p.pix_label}`}
      </p>
      {p.last_reason && (p.status === 'failed' || p.status === 'cancelled') && <p className="text-sm">Motivo: {p.last_reason}</p>}
      {p.status === 'paid' && (
        <p className="text-sm text-muted-foreground">
          Pago por {p.paid_by} em {p.paid_at ? new Date(p.paid_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
          {p.diff_cents ? ` · diferença de ${brl(p.diff_cents)} (${p.diff_reason})` : ''}
        </p>
      )}
      <details>
        <summary className="inline-flex h-12 cursor-pointer items-center text-sm font-bold text-primary">Ver a conta</summary>
        <ul className="list-disc space-y-1 pb-2 pl-5 text-sm">
          {p.conta.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
      <div className="flex flex-wrap gap-2">
        {p.has_proof && (
          <Button variant="outline" className={btn} disabled={comprovante.isPending} onClick={() => comprovante.mutate(p.id)}>
            Ver comprovante
          </Button>
        )}
        {admin && a.verChave && (
          <Button variant="outline" className={btn} disabled={chave.isPending} onClick={() => void copiar()}>
            Copiar chave Pix
          </Button>
        )}
        {admin && a.pagar && (
          <Button className={btn} onClick={() => setDlg('pagar')}>
            Marcar como pago
          </Button>
        )}
        {admin && a.tentarDeNovo && (
          <Button variant="outline" className={btn} disabled={mudar.isPending} onClick={() => mudar.mutate({ id: p.id, acao: 'retry' })}>
            Tentar de novo
          </Button>
        )}
        {admin && a.falhou && (
          <Button variant="outline" className={btn} onClick={() => setDlg('fail')}>
            O Pix falhou
          </Button>
        )}
        {admin && a.cancelar && (
          <Button variant="outline" className={btn} onClick={() => setDlg('cancel')}>
            Cancelar
          </Button>
        )}
        {admin && a.estornar && (
          <Button variant="outline" className={btn} onClick={() => setDlg('reverse')}>
            Estornar
          </Button>
        )}
      </div>
      {dlg === 'pagar' && <PagarDialog p={p} provaObrigatoria={provaObrigatoria} onFechar={() => setDlg(null)} />}
      {dlg && dlg !== 'pagar' && <MotivoDialog p={p} acao={dlg} onFechar={() => setDlg(null)} />}
    </li>
  );
}

// ── tela ──────────────────────────────────────────────────────────────────

export function PagamentosEquipe() {
  const { user } = useAuth();
  const admin = user?.is_admin === true;
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [chaveCompleta, setChaveCompleta] = useState(false);
  const q = usePagamentos(week);
  const gerar = useGerarFila();
  const csv = useBaixarCsv();

  if (q.desligada) return <p className="mt-4 text-sm text-muted-foreground">O pagamento dos consultores não está habilitado neste ambiente.</p>;
  if (q.isPending) return <p className="mt-4 text-sm text-muted-foreground">Carregando a fila…</p>;
  if (q.isError || !q.data) {
    return (
      <div className="mt-4 space-y-2" role="alert">
        <p className="text-sm text-destructive">{apiErrorMessage(q.error, 'Não foi possível carregar os pagamentos.')}</p>
        <Button variant="outline" className="h-12" onClick={() => void q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  const d = q.data;
  const fila = ordenarFila(d.payouts);
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className="h-12" aria-label="Semana anterior" onClick={() => setWeek(addDays(d.week.from, -7))}>
          ‹
        </Button>
        <p className="text-base font-bold">Semana {rotuloSemana(d.week.from, d.week.to)}</p>
        <Button variant="outline" className="h-12" aria-label="Próxima semana" onClick={() => setWeek(addDays(d.week.from, 7))}>
          ›
        </Button>
      </div>

      <section className="card-surface space-y-2 p-4" aria-label="Total a pagar">
        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Total a pagar</p>
        <p className="text-3xl font-black">{brl(d.summary.to_pay_cents)}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {d.summary.conta.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Fonte: {d.summary.source}. Pix previsto: {d.pix_date.slice(8, 10)}/{d.pix_date.slice(5, 7)}/{d.pix_date.slice(0, 4)}.</p>
        <p className="text-sm text-muted-foreground">O Praça não envia dinheiro: você paga no banco e registra aqui.</p>
      </section>

      {admin && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-12"
            disabled={gerar.isPending}
            onClick={() => gerar.mutate(d.week.from)}
          >
            {gerar.isPending ? 'Gerando…' : 'Gerar fila desta semana'}
          </Button>
          <Button variant="outline" className="h-12" disabled={csv.isPending} onClick={() => csv.mutate({ week: d.week.from, include_pix_key: chaveCompleta })}>
            {csv.isPending ? 'Baixando…' : 'Baixar CSV'}
          </Button>
          <label className="inline-flex min-h-12 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={chaveCompleta} onChange={(e) => setChaveCompleta(e.target.checked)} />
            Incluir a chave Pix completa no CSV
          </label>
          {chaveCompleta && <p className="w-full text-sm text-warning">A chave completa fica no arquivo. Guarde-o com cuidado: a exportação fica registrada no seu nome.</p>}
        </div>
      )}

      {fila.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum pagamento nesta semana. {admin ? 'Feche a semana na tela de ganhos do consultor e use "Gerar fila desta semana".' : 'Peça a um administrador para gerar a fila.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {fila.map((p) => (
            <Linha key={p.id} p={p} admin={admin} provaObrigatoria={d.proof_required} />
          ))}
        </ul>
      )}
    </div>
  );
}
