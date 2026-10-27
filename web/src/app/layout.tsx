import type { Metadata } from 'next';
import { Manrope, Sora } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// As fontes da Lovable (Manrope no texto, Sora nos títulos) vêm por `next/font/google`, servidas do próprio domínio (sem <link>
// para o Google). Sora só nos pesos que o desenho usa (500/600/700): `font-extrabold`/`font-black` caem no 700.
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
});

const sora = Sora({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-sora',
});

export const metadata: Metadata = {
  title: 'Praça',
  description:
    'Transforme o manual de 11 etapas da Freela Serviços em ações do dia a dia, com dono, prazo e acompanhamento.',
  authors: [{ name: 'Freela Serviços' }],
  openGraph: {
    title: 'Praça',
    description: 'Transforme o manual de 11 etapas em ações do dia a dia.',
    type: 'website',
  },
  twitter: { card: 'summary' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema único, claro (o da Lovable). As variáveis das fontes ficam no `<html>` (= `:root`): é lá que o `@theme` define
  // `--font-sans`/`--font-display` com `var(--font-manrope)`/`var(--font-sora)`, e a variável tem de existir no mesmo elemento.
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${sora.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
