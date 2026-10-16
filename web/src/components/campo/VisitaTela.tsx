'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { FaixaFila } from '@/components/campo/FaixaFila';
import { Questionario } from '@/components/campo/Questionario';
import { QuestionarioV2, type VagaNaTela } from '@/components/campo/QuestionarioV2';
import { Button } from '@/components/ui/button';
import { todaySp } from '@/lib/dates';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { useFotoUrl } from '@/modules/campo/application/use-foto-url';
import { irPara } from '@/modules/campo/application/use-tela';
import type { VisitAnswers, VisitAnswersV2 } from '@/modules/campo/domain/campo.types';
import { hora } from '@/modules/campo/domain/formatos';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { ehV2, faltando, faltandoV2, respostasV1De, respostasV2De } from '@/modules/campo/domain/questionario';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';

/** Espera depois da última mudança para guardar o rascunho na fila (que substitui o anterior). */
const ESPERA_RASCUNHO_MS = 800;

/**
 * Visão `visita` de `/campo`: questionário com rascunho automático, QR a um
 * toque, checkout. O rascunho pendente é guardado na fila também ao sair da
 * visão (QR, Voltar…) — nada digitado se perde.
 */
export function VisitaTela({ refVisita }: { refVisita: string }) {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { dia, hoje, carregando } = useDia();
  const me = useCampoMe();
  const itens = useFilaStore((s) => s.itens);
  const foto = useFotoUrl(refVisita);
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const local = dia.visitas.find((v) => v.ref === refVisita) ?? null;
  const doServidor = hoje?.visits.find((v) => v.client_id === refVisita) ?? null;
  const rascunhoNaFila = [...itens].reverse().find((i) => i.kind === 'answers' && i.visit_ref === refVisita);
  const doRascunho = rascunhoNaFila?.kind === 'answers' ? rascunhoNaFila.payload : null;
  // Visita só no aparelho (check-in na fila) já é do formulário v2 (§21.6): o servidor só cria v2 agora.
  const v2 = (doServidor?.form_version ?? 2) >= 2;
  const inicial: VisitAnswers | VisitAnswersV2 = v2
    ? doRascunho && ehV2(doRascunho)
      ? doRascunho
      : respostasV2De(doServidor?.answers)
    : doRascunho && !ehV2(doRascunho)
      ? doRascunho
      : respostasV1De(doServidor?.answers);
  // Vagas e voucher: o que o servidor já tem + o que ainda está na fila do aparelho.
  const vagas: VagaNaTela[] = [
    ...(doServidor?.vagas ?? []).map((v) => ({ key: v.id, date: v.date, funcao: v.funcao, pendente: false })),
    ...itens.flatMap((i) =>
      i.kind === 'vaga' && i.visit_ref === refVisita ? [{ key: i.payload.client_id, date: i.payload.date, funcao: i.payload.funcao, pendente: true }] : [],
    ),
  ];
  const voucher = doServidor?.voucher ?? (itens.some((i) => i.kind === 'voucher' && i.visit_ref === refVisita) ? ('pendente' as const) : null);
  const checkoutBloqueado = itens.find((i) => i.kind === 'checkout' && i.visit_ref === refVisita && i.bloqueio);

  /** `null` = ainda não mexeu: segue o que vier do servidor/fila. */
  const [respostas, setRespostas] = useState<VisitAnswers | VisitAnswersV2 | null>(null);
  const atual = respostas ?? inicial;

  // Rascunho ainda não guardado na fila (sujo) e o relógio da espera.
  const pendente = useRef<VisitAnswers | VisitAnswersV2 | null>(null);
  const relogio = useRef<number | null>(null);
  const consultor = useRef(consultantId);
  consultor.current = consultantId;

  /** Guarda o rascunho sujo na fila já (idempotente: sem nada sujo, não faz nada). */
  const guardar = useCallback(async () => {
    if (relogio.current !== null) {
      window.clearTimeout(relogio.current);
      relogio.current = null;
    }
    const r = pendente.current;
    if (!r) return;
    pendente.current = null;
    await enfileirar({ kind: 'answers', visit_ref: refVisita, payload: r }, consultor.current);
  }, [refVisita]);

  // Sair da visão (QR, Voltar, outra tela) ou esconder a página: nada digitado se perde.
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') void guardar();
    };
    document.addEventListener('visibilitychange', aoEsconder);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      void guardar();
    };
  }, [guardar]);

  function mudar(r: VisitAnswers | VisitAnswersV2) {
    pendente.current = r;
    setRespostas(r);
    if (relogio.current !== null) window.clearTimeout(relogio.current);
    relogio.current = window.setTimeout(() => void guardar(), ESPERA_RASCUNHO_MS);
  }

  const fechada = !!local?.checkout_at || !!local?.auto_closed;
  const falta = v2
    ? faltandoV2(atual as VisitAnswersV2, todaySp(), { voucherPedido: !!voucher, vagas: vagas.length })
    : faltando(atual as VisitAnswers, todaySp());

  async function abrirVaga(v: { date: string; funcao: string }) {
    try {
      await enfileirar({ kind: 'vaga', visit_ref: refVisita, payload: { client_id: crypto.randomUUID(), ...v } }, consultor.current);
    } catch {
      toast.error('Não foi possível guardar a vaga neste aparelho.');
    }
  }

  async function pedirVoucher() {
    try {
      // As respostas (contrata, quantos, aceitou) vão antes: é com elas que o servidor confere o direito ao voucher.
      await guardar();
      await enfileirar({ kind: 'voucher', visit_ref: refVisita }, consultor.current);
    } catch {
      toast.error('Não foi possível guardar o pedido neste aparelho.');
    }
  }

  async function checkout() {
    setGps(null);
    setOcupado(true);
    try {
      // O rascunho vai antes do checkout na fila (ordem de envio = ordem de entrada).
      await guardar();
      const p = await lerPosicao();
      await enfileirar({ kind: 'checkout', visit_ref: refVisita, payload: p }, consultantId);
      irPara({ v: 'hoje' }, 'replace');
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível guardar o checkout neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  /** Checkout já está na fila (recusado): salvar as respostas novas o reposiciona e destrava. */
  async function salvarCorrecoes() {
    setOcupado(true);
    try {
      // Sem rascunho sujo, manda as respostas atuais: é o que destrava (ou reconfere) o checkout.
      if (!pendente.current) pendente.current = atual;
      await guardar();
      toast.success('Correções salvas. O checkout será enviado de novo.');
    } catch {
      toast.error('Não foi possível guardar as correções neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!local) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Visita" />
        <p className="card-surface p-5 text-sm">Visita não encontrada neste aparelho.</p>
        <button
          type="button"
          onClick={() => irPara({ v: 'hoje' })}
          className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold"
        >
          Voltar
        </button>
      </main>
    );
  }

  return (
    <main className="space-y-5 pb-32">
      <CampoTopo titulo={local.nome} />
      <FaixaFila />
      {gps && <AvisoGps motivo={gps} onFechar={() => setGps(null)} />}
      <button type="button" onClick={() => irPara({ v: 'hoje' })} className="text-sm font-bold text-primary">
        ← Voltar
      </button>
      <p className="text-xs text-muted-foreground">
        Check-in às {hora(local.checkin_at)}
        {doServidor?.far_from_place ? ' · longe do local' : ''}
        {doServidor?.off_route ? ' · fora da rota' : ''}
        {local.auto_closed ? ' · fechada sem checkout' : ''}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, next/image não serve */}
      {foto && <img src={foto} alt="Foto da fachada" className="w-full rounded-md" />}

      {checkoutBloqueado?.kind === 'checkout' && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          O checkout desta visita foi recusado: {checkoutBloqueado.bloqueio}
        </p>
      )}

      {v2 ? (
        <QuestionarioV2
          valor={atual as VisitAnswersV2}
          canais={me.data?.channels ?? []}
          desabilitado={fechada || ocupado}
          onMudar={mudar}
          vagas={vagas}
          onAbrirVaga={(v) => void abrirVaga(v)}
          voucher={voucher}
          onPedirVoucher={() => void pedirVoucher()}
          signupUrl={me.data?.consultant.signup_url ?? null}
          onMostrarQr={() => irPara({ v: 'qr' })}
        />
      ) : (
        <Questionario valor={atual as VisitAnswers} canais={me.data?.channels ?? []} desabilitado={fechada || ocupado} onMudar={mudar} />
      )}

      {!fechada && falta.length > 0 && (
        <p className="text-sm text-muted-foreground">Falta responder: {falta.join(', ')}.</p>
      )}

      {!fechada && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-3">
            <button
              type="button"
              onClick={() => irPara({ v: 'qr' })}
              className="flex h-14 w-28 items-center justify-center rounded-md border border-border text-sm font-bold"
            >
              QR code
            </button>
            {checkoutBloqueado ? (
              <Button onClick={() => void salvarCorrecoes()} disabled={ocupado || falta.length > 0} className="h-14 flex-1 text-base">
                Salvar correções
              </Button>
            ) : (
              <Button onClick={() => void checkout()} disabled={ocupado || falta.length > 0} className="h-14 flex-1 text-base">
                {ocupado ? 'Pegando a localização…' : 'Fazer checkout'}
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
