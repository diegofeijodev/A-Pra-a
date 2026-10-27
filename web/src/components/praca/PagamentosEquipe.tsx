'use client';

import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { addDays, todaySp } from '@/lib/dates';
import { useFeaturesMenu } from '@/modules/acesso/application/use-acesso';
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
  cartoesFinanceiro,
  erroDoComprovante,
  LIMITE_COMPROVANTE_MB,
  ordenarFila,
  pagoEmCentavos,
  rotuloSemana,
  rotuloStatus,
  seloFinanceiro,
  TEXTO_CANCELAR,
  TEXTO_ESTORNAR,
  TEXTO_FALHOU,
  textoConfirmarPagamento,
  tomDoStatus,
  type Pagamento,
  type Tom,
} from '@/modules/pagamentos/domain/pagamentos';
import { useExtrato } from '@/modules/remuneracao/application/use-remuneracao';
import { centavosDeTexto, rotuloDia, textoDeCentavos } from '@/modules/remuneracao/domain/remuneracao';
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
        <p className="text-base font-bold">{p.consultant_name ?? 'Representante'}</p>
        <Selo p={p} />
      </div>
      <p className="text-2xl font-black">{brl(p.paid_cents ?? p.due_cents)}</p>
      <p className="text-sm text-muted-foreground">
        {p.blocked
          ? 'Sem chave Pix cadastrada: peça ao representante e gere a fila de novo.'
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

// ── linha da tabela (a partir de md; abaixo, o cartão `Linha`) ─────────────

function LinhaTabela({ p, admin, provaObrigatoria, cadastros }: { p: Pagamento; admin: boolean; provaObrigatoria: boolean; cadastros: number | null | undefined }) {
  const [dlg, setDlg] = useState<'pagar' | AcaoMotivo | null>(null);
  const [aberta, setAberta] = useState(false);
  const mudar = useMudarPagamento();
  const chave = useChavePix();
  const comprovante = useAbrirComprovante();
  const a = acoesDisponiveis(p);
  const selo = seloFinanceiro(p);

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

  const menu = [
    ...(p.has_proof ? [{ id: 'comprovante', rotulo: 'Ver comprovante', fazer: () => comprovante.mutate(p.id) }] : []),
    ...(admin && a.falhou ? [{ id: 'fail', rotulo: 'O Pix falhou', fazer: () => setDlg('fail') }] : []),
    ...(admin && a.tentarDeNovo ? [{ id: 'retry', rotulo: 'Tentar de novo', fazer: () => mudar.mutate({ id: p.id, acao: 'retry' }) }] : []),
    ...(admin && a.cancelar ? [{ id: 'cancel', rotulo: 'Cancelar', fazer: () => setDlg('cancel') }] : []),
    ...(admin && a.estornar ? [{ id: 'reverse', rotulo: 'Estornar', fazer: () => setDlg('reverse') }] : []),
  ];
  const nome = p.consultant_name ?? 'Representante';
  return (
    <Fragment>
      <tr className={`border-b align-top ${p.status === 'cancelled' ? 'opacity-60' : ''}`}>
        <td className="px-4 py-3 font-medium">{nome}</td>
        {cadastros !== undefined && <td className="px-4 py-3 text-right">{cadastros === null ? '—' : cadastros.toLocaleString('pt-BR')}</td>}
        <td className="px-4 py-3">
          <button type="button" aria-expanded={aberta} onClick={() => setAberta((v) => !v)} className="inline-flex items-center gap-1 font-semibold" aria-label={`${brl(p.paid_cents ?? p.due_cents)}: como foi calculado`}>
            {brl(p.paid_cents ?? p.due_cents)}
            <ChevronDown className={`h-4 w-4 transition-transform ${aberta ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </td>
        <td className="px-4 py-3">
          {p.blocked && p.status !== 'cancelled' ? (
            <Badge variant="destructive">Sem chave Pix</Badge>
          ) : admin && a.verChave ? (
            <button type="button" className="text-left text-sm text-primary hover:underline disabled:opacity-60" disabled={chave.isPending} onClick={() => void copiar()} title="Copiar a chave Pix inteira">
              {p.pix_key_masked ?? '—'}
            </button>
          ) : (
            <span className="text-sm">{p.pix_key_masked ?? '—'}</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge variant={selo.variante} className="mr-auto">
              {selo.rotulo}
            </Badge>
            {admin && a.pagar && (
              <Button size="sm" onClick={() => setDlg('pagar')}>
                Marcar como pago
              </Button>
            )}
            {menu.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label={`Mais ações do pagamento de ${nome}`}>
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {menu.map((m) => (
                    <DropdownMenuItem key={m.id} className="min-h-11" onSelect={m.fazer}>
                      {m.rotulo}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {p.last_reason && (p.status === 'failed' || p.status === 'cancelled') && <p className="mt-1 text-xs text-muted-foreground">Motivo: {p.last_reason}</p>}
        </td>
      </tr>
      {aberta && (
        <tr className="border-b bg-secondary/40">
          <td colSpan={cadastros !== undefined ? 5 : 4} className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Como foi calculado</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {p.conta.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {p.status === 'paid' && (
              <p className="mt-1 text-xs text-muted-foreground">
                Pago por {p.paid_by} em {p.paid_at ? new Date(p.paid_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                {p.diff_cents ? ` · diferença de ${brl(p.diff_cents)} (${p.diff_reason})` : ''}
              </p>
            )}
          </td>
        </tr>
      )}
      {dlg === 'pagar' && <PagarDialog p={p} provaObrigatoria={provaObrigatoria} onFechar={() => setDlg(null)} />}
      {dlg && dlg !== 'pagar' && <MotivoDialog p={p} acao={dlg} onFechar={() => setDlg(null)} />}
    </Fragment>
  );
}

// ── tela ──────────────────────────────────────────────────────────────────

const CARTAO = 'rounded-2xl bg-card shadow-card';

/**
 * Financeiro > Pagamentos (Lovable `financeiro.tsx`, UX §4.9, contrato §29.4): a semana fechada no lugar de De/Até/15 dias/mês (Pix
 * semanal com razão) [desvio: dado], os três cartões da Lovable com a conta e a fonte, e a tabela Representante / Cadastros / Total /
 * PIX / Situação (abaixo de md, os cartões). "Desfazer" da Lovable apaga o pagamento: aqui é "Estornar", com motivo, no razão.
 * "Diárias" e "Bônus" não viram colunas (a nossa regra é por cadastro e faixas): cada Total abre "Como foi calculado".
 */
export function PagamentosEquipe() {
  const { user } = useAuth();
  const admin = user?.is_admin === true;
  const { features } = useFeaturesMenu();
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [chaveCompleta, setChaveCompleta] = useState(false);
  const q = usePagamentos(week);
  const gerar = useGerarFila();
  const csv = useBaixarCsv();
  // "Cadastros" (confirmados) vem do extrato da mesma semana (§28.5), só com a remuneração ligada (o Pix já exige ela).
  const extrato = useExtrato({ week: q.data?.week.from }, features.earnings && !!q.data);

  if (q.desligada) return <p className={`${CARTAO} p-5 text-sm`}>Este recurso ainda não está ligado neste servidor.</p>;
  if (q.isPending) return <div aria-busy="true" className="h-48 animate-pulse rounded-2xl bg-muted" />;
  if (q.isError || !q.data) {
    return (
      <div className={`${CARTAO} space-y-2 p-5`} role="alert">
        <p className="text-sm text-destructive">{apiErrorMessage(q.error, 'Não foi possível carregar os pagamentos.')}</p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  const d = q.data;
  const fila = ordenarFila(d.payouts);
  const cartoes = cartoesFinanceiro(d.summary);
  const cadastrosDe = new Map((extrato.data?.consultants ?? []).map((c) => [c.consultant_id, c.confirmed_signups]));
  // Coluna só com a remuneração ligada; `null` = o extrato não respondeu (a coluna mostra "—").
  const cadastros = (id: string): number | null | undefined => (!features.earnings ? undefined : extrato.data ? (cadastrosDe.get(id) ?? 0) : null);
  const semana = rotuloSemana(d.week.from, d.week.to);
  const hoje = todaySp();
  const estaSemana = hoje >= d.week.from && hoje <= d.week.to;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setWeek(addDays(d.week.from, -7))}>
            ‹
          </Button>
          <p className="text-sm font-semibold">
            Semana {semana} · Pix {rotuloDia(d.pix_date)}
          </p>
          <Button variant="outline" size="icon" aria-label="Próxima semana" onClick={() => setWeek(addDays(d.week.from, 7))}>
            ›
          </Button>
          <Button variant="outline" aria-pressed={estaSemana} onClick={() => setWeek(hoje)}>
            Esta semana
          </Button>
          <Button variant="outline" aria-pressed={week === undefined} onClick={() => setWeek(undefined)}>
            Semana passada
          </Button>
        </div>
        {admin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={gerar.isPending} onClick={() => gerar.mutate(d.week.from)}>
              {gerar.isPending ? 'Gerando…' : 'Gerar fila desta semana'}
            </Button>
            <Button variant="outline" disabled={csv.isPending} onClick={() => csv.mutate({ week: d.week.from, include_pix_key: chaveCompleta })}>
              {csv.isPending ? 'Baixando…' : 'Baixar CSV'}
            </Button>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm md:min-h-9">
              <input type="checkbox" className="size-5" checked={chaveCompleta} onChange={(e) => setChaveCompleta(e.target.checked)} />
              Incluir a chave Pix completa no CSV
            </label>
          </div>
        )}
      </div>
      {admin && chaveCompleta && <p className="text-sm text-warning">A chave completa fica no arquivo. Guarde-o com cuidado: a exportação fica registrada no seu nome.</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {cartoes.map((c) => (
          <section key={c.titulo} className={`${CARTAO} space-y-1 p-5`} aria-label={c.titulo}>
            <p className="text-sm text-muted-foreground">{c.titulo}</p>
            <p className="text-2xl font-semibold">{brl(c.cents)}</p>
            <p className="text-xs text-muted-foreground">{c.apoio}</p>
          </section>
        ))}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-1 text-sm">ⓘ A conta da semana</summary>
        <ul className="list-disc space-y-1 pl-5">
          {d.summary.conta.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-muted-foreground">Fonte: {d.summary.source}.</p>

      {fila.length === 0 ? (
        <div className={`${CARTAO} space-y-1 p-6 text-center text-sm text-muted-foreground`}>
          <p>Nada a pagar na semana de {semana}.</p>
          <p>{admin ? 'Feche a semana na ficha do representante e use “Gerar fila desta semana”.' : 'Peça a um administrador para gerar a fila.'}</p>
        </div>
      ) : (
        <>
          <div className={`${CARTAO} hidden overflow-hidden md:block`}>
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Representante</th>
                  {features.earnings && <th className="px-4 py-3 text-right font-medium">Cadastros</th>}
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">PIX</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {fila.map((p) => (
                  <LinhaTabela key={p.id} p={p} admin={admin} provaObrigatoria={d.proof_required} cadastros={cadastros(p.consultant_id)} />
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {fila.map((p) => (
              <Linha key={p.id} p={p} admin={admin} provaObrigatoria={d.proof_required} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
