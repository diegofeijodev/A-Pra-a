'use client';

import { QRCodeSVG } from 'qrcode.react';

/** QR do cadastro no Freela com o código do consultor (`…/cadastro?consultor=CÓDIGO`). */
export function QrDoFreela({ url, tamanho = 280 }: { url: string | null; tamanho?: number }) {
  if (!url) {
    return (
      <p className="card-surface p-5 text-center text-sm text-muted-foreground">
        Seu código no Freela ainda está pendente. Avise a equipe — o QR code aparece aqui assim que ele existir.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-fit rounded-xl bg-white p-4" style={{ maxWidth: tamanho + 32 }}>
        <QRCodeSVG className="h-auto w-full" style={{ maxWidth: tamanho }} value={url} size={tamanho} level="M" marginSize={0} title="QR code de cadastro no Freela" />
      </div>
      <p className="text-center text-sm text-muted-foreground">Aponte a câmera do celular para se cadastrar no Freela.</p>
    </div>
  );
}
