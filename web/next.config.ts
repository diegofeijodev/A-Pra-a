import type { NextConfig } from 'next';
// Caminho RELATIVO: o `next.config` não resolve o atalho `@/` (arquitetura §3.4). O módulo só importa `./enderecos`, que não importa nada.
import { REDIRECIONAMENTOS } from './src/modules/acesso/domain/redirecionamentos';

const nextConfig: NextConfig = {
  // Só no `next dev`: a bolinha das ferramentas do Next fica no canto de baixo à esquerda, por cima da aba "Hoje" da barra fixa do
  // representante (redesenho E4) — o toque cai nela, não na aba (o `browser-check` travava ali). Em produção ela não existe; o
  // painel de erro do `next dev` continua aparecendo quando há erro.
  devIndicators: false,
  // Endereços de antes da E7 → os da Lovable, 307 (tabela conferida no vitest). Na Vercel valem na borda, sem JS.
  async redirects() {
    return REDIRECIONAMENTOS.map((x) => ({ ...x }));
  },
};

export default nextConfig;
