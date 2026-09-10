import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// O protótipo puxava as fontes por <link> do Google; aqui vêm por
// `next/font/google` (mesmas famílias e pesos), servidas do próprio domínio.
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-montserrat',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'PRAÇA — Checklist de abertura de praças',
  description:
    'Transforme o manual de 11 etapas da Freela Serviços em ações do dia a dia, com dono, prazo e acompanhamento.',
  authors: [{ name: 'Freela Serviços' }],
  openGraph: {
    title: 'PRAÇA — Checklist de abertura de praças',
    description: 'Transforme o manual de 11 etapas em ações do dia a dia.',
    type: 'website',
  },
  twitter: { card: 'summary' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // O tema escuro é o padrão (`:root` no globals.css); a classe `light` é
  // ligada em runtime pelo `ThemeSync` do `(app)/layout.tsx`.
  return (
    <html lang="pt-BR">
      <body className={`${montserrat.variable} ${inter.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
