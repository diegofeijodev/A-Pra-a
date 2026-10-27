'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CampoTopo } from '@/components/campo/CampoTopo';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useCampoMe, useDia } from '@/modules/campo/application/use-campo';
import { enfileirar, useFilaStore } from '@/modules/campo/application/use-fila';
import { irPara } from '@/modules/campo/application/use-tela';
import { useMeusCupons } from '@/modules/cupons/application/use-cupons';
import { FREELAS_RAPIDOS, pedidoDoLead, RAMOS, resumoDoCupom, situacaoParaConsultor } from '@/modules/cupons/domain/cupons';

/**
 * "Pedir cupom da 1ª contratação" (contrato §38.3; UX §3.2). Nada é digitado: nome e cidade vêm da visita; o ramo é um chip e os
 * freelas por semana, um toque. Vai pela fila do aparelho (`voucher`, idempotente por `client_id`): funciona sem sinal.
 */
export function PedirCupomTela({ refVisita }: { refVisita: string }) {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const { dia, hoje } = useDia();
  const me = useCampoMe();
  const { data: meus, config } = useMeusCupons();
  const itens = useFilaStore((s) => s.itens);
  const [ramo, setRamo] = useState<string | null>(null);
  const [freelas, setFreelas] = useState(1);
  const [ocupado, setOcupado] = useState(false);

  const local = dia.visitas.find((v) => v.ref === refVisita) ?? null;
  const doServidor = hoje?.visits.find((v) => v.client_id === refVisita) ?? null;
  const existente = useMemo(() => pedidoDoLead((meus ?? []).filter((c) => c.situacao !== 'reprovado'), doServidor?.lead_id), [meus, doServidor?.lead_id]);
  const naFila = itens.some((i) => i.kind === 'voucher' && i.visit_ref === refVisita);
  const voltar = () => irPara({ v: 'visita', ref: refVisita });

  if (me.data?.features?.vouchers !== true) {
    return (
      <main className="space-y-4">
        <CampoTopo titulo="Cupom" />
        <p className="card-surface p-5 text-sm">Este recurso ainda não está ligado neste servidor.</p>
        <button type="button" onClick={() => irPara({ v: 'hoje' })} className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold">
          Voltar
        </button>
      </main>
    );
  }

  async function enviar() {
    if (!ramo) return;
    setOcupado(true);
    try {
      await enfileirar(
        {
          kind: 'voucher',
          visit_ref: refVisita,
          place_name: local?.nome ?? 'visita',
          payload: { client_id: crypto.randomUUID(), visit_ref: refVisita, segment: ramo, freelas_per_week: freelas },
        },
        consultantId,
      );
      toast.success(navigator.onLine ? 'Pedido enviado. Avisamos aqui quando o cupom sair.' : 'Sem internet. O pedido está guardado e sai quando o sinal voltar.');
      voltar();
    } catch {
      toast.error('Não foi possível guardar o pedido neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  const titulo = local?.nome ?? 'estabelecimento';
  return (
    <main className="space-y-5 pb-36">
      <CampoTopo titulo="Pedir cupom da 1ª contratação" />
      <button type="button" onClick={voltar} className="min-h-12 text-sm font-bold text-primary">
        ← Voltar para a visita
      </button>
      <section className="space-y-1">
        <p className="text-lg font-black">{titulo}</p>
        <p className="text-sm text-muted-foreground">Nome e cidade vêm da visita. A equipe aprova e o cupom aparece aqui.</p>
        {config && (
          <p className="text-sm">
            <span aria-hidden>🎟 </span>
            {resumoDoCupom(config)} · na 1ª contratação
          </p>
        )}
      </section>

      {existente || naFila ? (
        <section role="status" className="card-surface space-y-2 p-4 text-sm">
          <p className="font-bold">Esta empresa já tem um cupom pedido.</p>
          <p>
            {existente ? (
              <>
                <span aria-hidden>{situacaoParaConsultor(existente).icone} </span>
                {situacaoParaConsultor(existente).texto}
              </>
            ) : (
              '⏳ Pedido guardado no celular: sai quando o sinal voltar.'
            )}
          </p>
          <button type="button" onClick={voltar} className="flex h-12 w-full items-center justify-center rounded-md border border-border font-bold">
            Voltar para a visita
          </button>
        </section>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="text-base font-bold">Ramo</legend>
            <div role="radiogroup" aria-label="Ramo" className="grid grid-cols-2 gap-2">
              {RAMOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={ramo === r}
                  onClick={() => setRamo(r)}
                  className={`simples-chip min-h-14 rounded-md border px-3 text-base ${ramo === r ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-base font-bold">Quantos freelas por semana ele costuma chamar?</legend>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Menos um" onClick={() => setFreelas(Math.max(0, freelas - 1))} className="h-14 w-14 rounded-md border border-border text-xl font-black">
                −
              </button>
              <output aria-live="polite" className="w-12 text-center text-2xl font-black">
                {freelas}
              </output>
              <button type="button" aria-label="Mais um" onClick={() => setFreelas(Math.min(999, freelas + 1))} className="h-14 w-14 rounded-md border border-border text-xl font-black">
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {FREELAS_RAPIDOS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={freelas === n}
                  onClick={() => setFreelas(n)}
                  className={`h-12 min-w-12 rounded-full border px-3 text-sm font-bold ${freelas === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                >
                  {n === 10 ? '10+' : n}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <div className="mx-auto max-w-md space-y-2">
              {!ramo && <p className="text-center text-sm text-muted-foreground">Falta escolher o ramo.</p>}
              <button
                type="button"
                disabled={!ramo || ocupado}
                onClick={() => void enviar()}
                className="flex h-14 w-full items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
              >
                Enviar pedido do cupom
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/**
 * A linha "🎟 Pedir cupom da 1ª contratação" da tela de resultado (UX §3.2, entrada (a)). Some com a flag desligada; com pedido
 * existente (ou na fila), mostra a situação no lugar do botão (aceite C6).
 */
export function LinhaPedirCupom({ refVisita, leadId, desabilitado }: { refVisita: string; leadId: string | null | undefined; desabilitado?: boolean }) {
  const { data: meus, ligado } = useMeusCupons();
  const itens = useFilaStore((s) => s.itens);
  const existente = useMemo(() => pedidoDoLead((meus ?? []).filter((c) => c.situacao !== 'reprovado'), leadId), [meus, leadId]);
  if (!ligado) return null;
  const naFila = itens.some((i) => i.kind === 'voucher' && i.visit_ref === refVisita);
  if (existente || naFila) {
    const st = existente ? situacaoParaConsultor(existente) : { icone: '⏳', texto: 'Cupom pedido · guardado no celular' };
    return (
      <p role="status" className="rounded-md border border-border p-3 text-sm">
        <span aria-hidden>{st.icone} </span>
        Cupom: {st.texto}
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={desabilitado}
      onClick={() => irPara({ v: 'pedir-cupom', ref: refVisita })}
      className="flex min-h-12 w-full items-center justify-center rounded-md border border-primary px-3 text-base font-bold disabled:opacity-50"
    >
      <span aria-hidden>🎟&nbsp;</span>Pedir cupom da 1ª contratação
    </button>
  );
}
