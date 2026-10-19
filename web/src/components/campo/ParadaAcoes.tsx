'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAcoesRoteiro } from '@/modules/rotas/application/use-roteiro';
import { linkMaps, linkTel, linkWaze, minutosSp } from '@/modules/rotas/domain/rota-local';
import { MOTIVOS_PULO, rotuloMotivo, type ConfigRota, type StopView } from '@/modules/rotas/domain/rota.schema';

const botao = 'flex h-12 flex-1 items-center justify-center rounded-md border border-border text-sm font-bold';

/** "Abrir no Maps" / "Waze" / "Ligar": links universais, funcionam sem nada do Praça. Alvos de 48 px. */
export function NavegarLinks({ parada }: { parada: StopView }) {
  const dados = { lat: parada.lat, lng: parada.lng, address: parada.address, name: parada.name };
  const tel = linkTel(parada.phone);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <a href={linkMaps(dados)} target="_blank" rel="noopener noreferrer" className={`${botao} bg-primary text-primary-foreground`}>
          Abrir no Maps
        </a>
        <a href={linkWaze(dados)} target="_blank" rel="noopener noreferrer" className={botao}>
          Waze
        </a>
      </div>
      {tel && (
        <a href={tel} className={`${botao} w-full`}>
          Ligar
        </a>
      )}
    </div>
  );
}

/**
 * Pular (com motivo) e "Deixar para depois". Um toque no motivo já pula; o "Desfazer" fica 8 s
 * (UX §4.4). Tudo entra na fila offline: sem sinal, a tela anda igual.
 */
export function ParadaAcoes({ parada, params, aoAgir }: { parada: StopView; params: ConfigRota; aoAgir?: () => void }) {
  const { pular, adiar, desfazer } = useAcoesRoteiro();
  const [escolhendo, setEscolhendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function comDesfazer(acao: () => Promise<void>, mensagem: string) {
    setOcupado(true);
    try {
      await acao();
      toast(mensagem, {
        duration: 8000,
        action: { label: 'Desfazer', onClick: () => void desfazer(parada.id).catch(() => toast.error('Não foi possível desfazer neste aparelho.')) },
      });
      setEscolhendo(false);
      aoAgir?.();
    } catch {
      toast.error('Não foi possível guardar a ação neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  if (parada.status === 'pulada' || parada.status === 'adiada') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {parada.status === 'pulada'
            ? `✕ Pulada: ${rotuloMotivo(parada.skip_reason)}`
            : `⏭ Deixada para ${parada.deferred_to === 'amanha' ? 'amanhã' : 'a tarde'}`}
        </p>
        <button type="button" disabled={ocupado} onClick={() => void desfazer(parada.id)} className={`${botao} w-full`}>
          Voltar para o roteiro
        </button>
      </div>
    );
  }
  if (parada.status !== 'pendente') return null;

  const paraQuando = minutosSp(Date.now()) < Number(params.almoco_fim.slice(0, 2)) * 60 + Number(params.almoco_fim.slice(3)) ? 'a tarde' : 'amanhã';
  return (
    <div className="space-y-2">
      {escolhendo ? (
        <div className="space-y-2">
          <p className="text-sm font-bold">Por que pular?</p>
          <div className="grid grid-cols-2 gap-2">
            {MOTIVOS_PULO.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={ocupado}
                onClick={() => void comDesfazer(() => pular(parada.id, m.id), `Pulada: ${m.rotulo}.`)}
                className="flex h-12 items-center justify-center rounded-md border border-border px-2 text-sm font-bold"
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setEscolhendo(false)} className="h-12 w-full text-sm text-muted-foreground">
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={ocupado} onClick={() => setEscolhendo(true)} className={botao}>
            Pular
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void comDesfazer(() => adiar(parada.id), `Deixada para ${paraQuando}.`)}
            className={botao}
          >
            Deixar p/ depois
          </button>
        </div>
      )}
    </div>
  );
}
