'use client';

import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AvisoGps } from '@/components/campo/AvisoGps';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { useDia } from '@/modules/campo/application/use-campo';
import { enfileirar } from '@/modules/campo/application/use-fila';
import { useIntervalo } from '@/modules/campo/application/use-intervalo';
import { duracaoMin, hora } from '@/modules/campo/domain/formatos';
import { irPara } from '@/modules/campo/application/use-tela';
import type { Posicao } from '@/modules/campo/domain/campo.types';
import type { MotivoGps } from '@/modules/campo/domain/gps-mensagens';
import { prepararFoto } from '@/modules/campo/infrastructure/foto-compressao';
import { ErroGps, lerPosicao } from '@/modules/campo/infrastructure/gps';

/** Onde o consultor chegou: uma parada/estabelecimento já cadastrado, ou um lugar novo. */
export interface AlvoChegada {
  nome: string;
  lead_id?: string;
  new_place?: { name: string; address?: string };
  confirm_new?: boolean;
}

/**
 * "Cheguei" do fluxo simples (UX §2.2): o botão É o `<label>` do `<input type="file" capture>`, então um toque abre a
 * câmera direto (o clique tem de ser síncrono). A posição é pedida em paralelo no mesmo toque. A foto vira o
 * check-in sem tela de confirmação. Cancelar a câmera não cria nada. GPS negado: a foto fica guardada e a tela
 * diz como liberar — "Tentar de novo" usa a mesma foto.
 */
export function ChegueiBotao({
  alvo,
  children,
  className = '',
  pequeno = false,
}: {
  alvo: AlvoChegada;
  children: ReactNode;
  className?: string;
  pequeno?: boolean;
}) {
  const consultantId = useCampoSession((s) => s.session?.consultant.id ?? '');
  const posicao = useRef<Promise<Posicao> | null>(null);
  const [gps, setGps] = useState<MotivoGps | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const guardada = useRef<Blob | null>(null);
  // Lote B §37.5: chegar durante o intervalo o encerra (o servidor faz o mesmo no check-in).
  const { dia } = useDia();
  const intervalo = useIntervalo();
  const emIntervalo = intervalo.ligado ? dia.intervaloAberto : null;

  function pedirPosicao() {
    const p = lerPosicao();
    p.catch(() => undefined); // o erro é tratado quando a foto voltar
    posicao.current = p;
  }

  async function registrar(foto: Blob) {
    setGps(null);
    setOcupado(true);
    try {
      let p: Posicao;
      try {
        p = await (posicao.current ?? lerPosicao());
      } catch (e) {
        // A posição pedida no toque pode ter falhado antes da foto: uma segunda tentativa, já com a foto na mão.
        if (!(e instanceof ErroGps)) throw e;
        posicao.current = null;
        p = await lerPosicao();
      }
      const client_id = crypto.randomUUID();
      await enfileirar(
        {
          kind: 'checkin',
          payload: {
            client_id,
            ...p,
            lead_id: alvo.lead_id,
            new_place: alvo.new_place,
            confirm_new: alvo.confirm_new,
            // O servidor respeita a dica enquanto a flag estiver ligada (contrato §31.2).
            flow: 'simples',
            place_name: alvo.nome,
          },
          foto,
        },
        consultantId,
      );
      guardada.current = null;
      if (emIntervalo) toast.success(`Intervalo encerrado às ${hora(p.at)} (${duracaoMin(emIntervalo.started_at, p.at) ?? 0} min).`);
      irPara({ v: 'visita', ref: client_id }, 'replace');
    } catch (e) {
      if (e instanceof ErroGps) setGps(e.motivo);
      else toast.error('Não foi possível guardar a chegada neste aparelho.');
    } finally {
      posicao.current = null;
      setOcupado(false);
    }
  }

  async function aoEscolherFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const foto = await prepararFoto(arquivo);
      guardada.current = foto;
      await registrar(foto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível usar esta foto.');
    }
  }

  return (
    <div className="space-y-2">
      {gps && (
        <div className="space-y-2">
          <AvisoGps motivo={gps} onFechar={() => setGps(null)} />
          {guardada.current && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => guardada.current && void registrar(guardada.current)}
              className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold"
            >
              Tentar de novo (a foto está guardada)
            </button>
          )}
        </div>
      )}
      <label
        className={`flex cursor-pointer items-center justify-center rounded-md bg-primary text-center font-bold text-primary-foreground focus-within:ring-2 focus-within:ring-ring ${
          pequeno ? 'h-12 px-3 text-sm' : 'h-14 px-4 text-base'
        } ${ocupado ? 'opacity-60' : ''} ${className}`}
      >
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={ocupado}
          className="sr-only"
          aria-label={`Cheguei em ${alvo.nome}: tirar a foto da fachada`}
          onClick={pedirPosicao}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = ''; // permite tirar a mesma foto de novo
            void aoEscolherFoto(arquivo);
          }}
        />
        {ocupado ? 'Registrando a chegada…' : children}
      </label>
    </div>
  );
}
