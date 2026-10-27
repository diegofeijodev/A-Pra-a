import type { Metadata, Viewport } from 'next';

/**
 * Raiz das telas do consultor de campo — FORA do grupo `(app)`: outra sessão,
 * outra guarda. Componente de servidor de propósito: é ele que exporta o
 * `metadata` (manifest do atalho "Praça Campo" na tela inicial, spec §8.1).
 */
export const metadata: Metadata = {
  title: 'Praça Campo',
  description: 'Jornada, visitas e QR code do consultor de campo da Freela.',
  manifest: '/campo/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Praça Campo', statusBarStyle: 'black-translucent' },
  icons: { icon: '/campo/icone/192', apple: '/campo/icone/180' },
};

export const viewport: Viewport = {
  // `--primary-deep` da Lovable, oklch(0.3 0.12 262), convertido pelo CSS Color 4 (OKLCH → sRGB).
  themeColor: '#072869',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
