/** `include` padrão do consultor: traz o nome e a janela de rota da praça para as views. */
export const COM_PRACA = {
  praca: { select: { name: true, route_start_hour: true, route_end_hour: true } },
} as const;
