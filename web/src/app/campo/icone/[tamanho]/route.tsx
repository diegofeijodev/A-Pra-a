import { ImageResponse } from 'next/og';

/** Ícone PNG do atalho, desenhado na hora (sem binário no repo). Só os três tamanhos do manifest. */
const TAMANHOS = new Set(['180', '192', '512']);

export async function GET(_req: Request, { params }: { params: Promise<{ tamanho: string }> }) {
  const { tamanho } = await params;
  if (!TAMANHOS.has(tamanho)) return new Response('Not found', { status: 404 });
  const n = Number(tamanho);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1d1d1b',
          color: '#ECA826',
          fontSize: Math.round(n * 0.5),
          fontWeight: 900,
        }}
      >
        P.
      </div>
    ),
    { width: n, height: n },
  );
}
