'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useMeusCupons } from '@/modules/cupons/application/use-cupons';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useFilaStore } from '@/modules/campo/application/use-fila';
import { linkWhatsApp, mensagemWhatsApp, resumoDoCupom, situacaoParaConsultor, type CampoCupom } from '@/modules/cupons/domain/cupons';

const TOM: Record<'espera' | 'ok' | 'fim', string> = {
  espera: 'border-warning/50 bg-warning/10',
  ok: 'border-success/50 bg-success/10',
  fim: 'border-border bg-muted/40',
};

/** Um cupom do consultor: situação com ícone + texto; código grande com copiar e WhatsApp (UX §3.2, aceites C3 e C5). */
export function CupomCartao({ c }: { c: CampoCupom }) {
  const nome = useCampoSession((s) => s.session?.consultant.name ?? '');
  const st = situacaoParaConsultor(c);
  const comCodigo = c.situacao === 'criado' && !!c.coupon_code;
  async function copiar() {
    try {
      await navigator.clipboard.writeText(c.coupon_code ?? '');
      toast.success('Código copiado.');
    } catch {
      toast.error('Não deu para copiar. Toque e segure no código.');
    }
  }
  return (
    <li className={`space-y-2 rounded-lg border p-3 ${TOM[st.tom]}`}>
      <p className="text-base font-bold">{c.company_name}</p>
      <p className="text-sm">
        <span aria-hidden>{st.icone} </span>
        {st.texto}
      </p>
      {comCodigo && (
        <>
          <p className="select-all font-mono text-[28px] font-black tracking-wider">{c.coupon_code}</p>
          {c.coupon && <p className="text-sm text-muted-foreground">{resumoDoCupom(c.coupon)} · na 1ª contratação</p>}
          {c.coupon_expires_at && (
            <p className="text-sm text-muted-foreground">
              Válido até {new Date(c.coupon_expires_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2">
            <button type="button" onClick={() => void copiar()} className="flex h-14 items-center justify-center rounded-md bg-primary text-base font-bold text-primary-foreground">
              Copiar código
            </button>
            <a
              href={linkWhatsApp(mensagemWhatsApp(c, nome || 'seu consultor'))}
              target="_blank"
              rel="noreferrer"
              className="flex h-14 items-center justify-center rounded-md border border-primary text-base font-bold"
            >
              Enviar pelo WhatsApp
            </a>
          </div>
          <p className="text-xs text-muted-foreground">Como usar: o dono digita o código no Freela ao pagar a 1ª contratação.</p>
        </>
      )}
    </li>
  );
}

/** "Cupons da 1ª contratação" do consultor (Retornos > Cupons). Só com a flag (`features.vouchers` do `/me`). */
export function CuponsCampo() {
  const { data, ligado, isPending, isError, refetch } = useMeusCupons();
  const itens = useFilaStore((s) => s.itens);
  const naFila = useMemo(() => itens.filter((i) => i.kind === 'voucher'), [itens]);
  const [todos, setTodos] = useState(false);
  if (!ligado) return null;
  const lista = data ?? [];
  const visiveis = todos ? lista : lista.slice(0, 5);
  return (
    <section aria-label="Cupons da 1ª contratação" className="space-y-2">
      <h2 className="text-base font-bold">Cupons da 1ª contratação</h2>
      {naFila.length > 0 && (
        <p role="status" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          <span aria-hidden>⏳ </span>
          {naFila.length === 1 ? 'Um pedido está guardado no celular' : `${naFila.length} pedidos estão guardados no celular`} e sai quando o sinal voltar.
        </p>
      )}
      {isPending && <div aria-busy="true" className="h-16 animate-pulse rounded-lg bg-muted" />}
      {isError && (
        <p role="alert" className="card-surface p-3 text-sm">
          O código aparece quando o celular tiver sinal.{' '}
          <button type="button" className="min-h-12 font-bold underline" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </p>
      )}
      {!isPending && !isError && lista.length === 0 && naFila.length === 0 && (
        <p className="card-surface p-3 text-sm text-muted-foreground">
          Nenhum voucher pedido ainda. Na visita, depois de escolher como foi, toque em &quot;Pedir voucher da 1ª contratação&quot;.
        </p>
      )}
      {visiveis.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {visiveis.map((c) => (
            <CupomCartao key={c.id} c={c} />
          ))}
        </ul>
      )}
      {lista.length > 5 && !todos && (
        <button type="button" className="min-h-12 text-sm font-bold underline" onClick={() => setTodos(true)}>
          Ver todos os {lista.length}
        </button>
      )}
    </section>
  );
}
