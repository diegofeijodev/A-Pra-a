// Ajudantes de apresentação da mídia — o que sobrou de
// `.prototype/src/lib/praca/campanhas.ts` depois que catálogo (§4) e API (§15)
// levaram o conteúdo e a conta: os conjuntos fechados vêm de `GET /v1/catalog`,
// o nome padronizado, o portão, o freio e as métricas vêm do servidor.

/** Rótulo de um item de catálogo pelo id ("reels" → "Reels"). */
export const labelOf = (list: { id: string; label: string }[] | undefined, id: string) =>
  list?.find((x) => x.id === id)?.label ?? id;

/** Formato feito com IA — abre o bloco de ferramenta e prompt no editor. */
export const isIAFormat = (f: string) => f === "video_ia" || f === "imagem";
