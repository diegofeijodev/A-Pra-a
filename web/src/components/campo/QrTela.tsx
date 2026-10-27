'use client';

import { CampoTopo } from '@/components/campo/CampoTopo';
import { QrDoFreela } from '@/components/campo/QrDoFreela';
import { useCampoMe } from '@/modules/campo/application/use-campo';

/** Visão `qr` de `/campo`: QR em tela cheia, para o dono do estabelecimento escanear (spec §8.1). */
export function QrTela() {
  const me = useCampoMe();
  return (
    <main className="space-y-6">
      <CampoTopo titulo="QR code" grande />
      <QrDoFreela url={me.data?.consultant.signup_url ?? null} tamanho={300} />
      <button
        type="button"
        onClick={() => window.history.back()}
        className="flex h-12 w-full items-center justify-center rounded-md border border-border text-sm font-bold"
      >
        Voltar
      </button>
    </main>
  );
}
