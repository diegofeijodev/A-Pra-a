/** Manifest do atalho "Praça Campo" (spec §8.1): abre direto em /campo, em tela cheia. */
export function GET() {
  const manifest = {
    name: 'Praça Campo',
    short_name: 'Praça Campo',
    start_url: '/campo',
    scope: '/campo',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1d1d1b',
    theme_color: '#1d1d1b',
    icons: [
      { src: '/campo/icone/192', sizes: '192x192', type: 'image/png' },
      { src: '/campo/icone/512', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
