/**
 * Frases da avaliação do "Resultado do seu dia" (contrato §33.5). Origem: Lovable `src/lib/visita.ts` (`resumoRota`), palavra
 * por palavra, trocando "voucher" por "cupom" e "cliente" por "estabelecimento" (vocabulário do campo, UX §0.5).
 */
export const FRASES_RESUMO_DIA = {
  rotaExcelente: 'Excelente cumprimento da rota. Parabéns pela disciplina no roteiro!',
  rotaBoa: (pct: number) =>
    `Você visitou ${pct}% da rota. Planejar o tempo em cada estabelecimento pode ajudar a fechar o roteiro completo.`,
  rotaBaixa: 'A rota ficou abaixo do planejado. Se houve algum imprevisto, conte ao seu gestor — juntos vocês podem ajustar o roteiro.',
  conversaoOtima: 'Ótima conversão em cadastros. Continue nesse ritmo!',
  /** Só com o módulo de cupons ligado (fase L6). */
  conversaoComCupom: 'Para aumentar os cadastros, reforce os benefícios e a oferta do cupom da 1ª contratação grátis.',
  conversaoSemCupom: 'Para aumentar os cadastros, reforce os benefícios do Freela.',
  intervaloLongo: (min: number) =>
    min === 75
      ? 'O intervalo passou de 1 hora; vale cuidar desse tempo para render mais nas visitas.'
      : `O intervalo passou de ${min} min; vale cuidar desse tempo para render mais nas visitas.`,
  diaProdutivo: 'Dia muito produtivo. Obrigado pelo empenho!',
  obrigado: 'Obrigado pelo trabalho de hoje. Amanhã é uma nova oportunidade!',
} as const;
