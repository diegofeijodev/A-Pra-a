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
          // Faixa da Lovable: `--primary-deep` (#072869) com a letra em `--primary-foreground`.
          background: '#072869',
          color: '#FCFCFC',
          fontSize: Math.round(n * 0.5),
          fontWeight: 700,
        }}
      >
        P.
      </div>
    ),
    { width: n, height: n },
  );
}
