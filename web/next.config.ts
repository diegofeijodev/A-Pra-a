import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Só no `next dev`: a bolinha das ferramentas do Next fica no canto de baixo à esquerda, por cima da aba "Hoje" da barra fixa do
  // representante (redesenho E4) — o toque cai nela, não na aba (o `browser-check` travava ali). Em produção ela não existe; o
  // painel de erro do `next dev` continua aparecendo quando há erro.
  devIndicators: false,
};

export default nextConfig;
