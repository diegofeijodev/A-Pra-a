/**
 * Consultor em várias praças (L12, contrato §44) — regras puras.
 *
 * O isolamento continua sendo UMA praça por request: o guard escolhe qual (`pracaAtiva`) e as consultas de hoje, que filtram
 * por `c.praca_id`, passam a ver só ela. Nulo em `field_journeys.praca_id` quer dizer "a principal" (linhas antigas e flag
 * desligada); com a flag ligada o início grava sempre o id explícito.
 */

/** Teto do conjunto de um consultor (principal incluída). */
export const MAX_PRACAS_POR_CONSULTOR = 20;

/** Conjunto = a principal primeiro, depois as extras na ordem dada, sem repetir (a principal nunca se repete). */
export function conjuntoDe(principal: string, extras: readonly string[]): string[] {
  const vistos = new Set<string>([principal]);
  const out = [principal];
  for (const id of extras) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push(id);
  }
  return out;
}

/** A praça de uma jornada gravada: o nulo (antes da flag) é a principal. */
export function pracaDaJornada(pracaDaLinha: string | null | undefined, principal: string): string {
  return pracaDaLinha ?? principal;
}

/**
 * Praça ativa do request (§44.4): a da jornada aberta, se ela ainda estiver no conjunto; senão a principal. Tirar a praça do
 * conjunto corta o acesso no request seguinte, mesmo com a jornada ainda aberta nela.
 */
export function pracaAtiva(p: { principal: string; extras: readonly string[]; jornadaAberta: string | null | undefined }): string {
  if (p.jornadaAberta === undefined) return p.principal;
  const daJornada = pracaDaJornada(p.jornadaAberta, p.principal);
  return conjuntoDe(p.principal, p.extras).includes(daJornada) ? daJornada : p.principal;
}

export type EscolhaInicio = { ok: true; praca_id: string | null } | { ok: false; erro: 'MULTI_PRACA_DISABLED' | 'NOT_IN_SET' };

/**
 * Praça do início do dia (§44.5). Desligada: só a principal é aceita (ausente/`null`/igual = como hoje, `praca_id: null` = não
 * grava nada); outra = `MULTI_PRACA_DISABLED`. Ligada: a pedida tem de estar no conjunto (`NOT_IN_SET` = 404); sem pedido, a do
 * roteiro de hoje (se no conjunto), senão a principal — sempre explícita.
 */
export function pracaDoInicio(p: {
  ligado: boolean;
  principal: string;
  conjunto: readonly string[];
  pedida: string | null | undefined;
  doRoteiro: string | null | undefined;
}): EscolhaInicio {
  const pedida = p.pedida ?? null;
  if (!p.ligado) {
    if (pedida !== null && pedida !== p.principal) return { ok: false, erro: 'MULTI_PRACA_DISABLED' };
    return { ok: true, praca_id: null };
  }
  if (pedida !== null) return p.conjunto.includes(pedida) ? { ok: true, praca_id: pedida } : { ok: false, erro: 'NOT_IN_SET' };
  if (p.doRoteiro && p.conjunto.includes(p.doRoteiro)) return { ok: true, praca_id: p.doRoteiro };
  return { ok: true, praca_id: p.principal };
}

/**
 * Praça de um roteiro montado pela equipe (§44.7): todos os leads numa mesma praça do conjunto. `FORA` = algum fora do conjunto
 * (ou lista vazia: a frase de hoje); `MISTURADAS` = praças diferentes, todas do conjunto.
 */
export function pracaUnicaDosLeads(
  pracasDosLeads: readonly string[],
  conjunto: readonly string[],
): { ok: true; praca_id: string } | { ok: false; erro: 'FORA' | 'MISTURADAS' } {
  if (pracasDosLeads.length === 0 || pracasDosLeads.some((id) => !conjunto.includes(id))) return { ok: false, erro: 'FORA' };
  const unicas = new Set(pracasDosLeads);
  if (unicas.size > 1) return { ok: false, erro: 'MISTURADAS' };
  return { ok: true, praca_id: pracasDosLeads[0]! };
}

/**
 * Conjunto que o admin grava (§44.7): o conjunto INTEIRO, com a principal, 1 a 20 sem repetir. Devolve só as extras (a principal
 * nunca é gravada na junção). A mensagem diz o campo e nunca um dado pessoal.
 */
export function conjuntoNovo(
  principal: string,
  pedidas: readonly string[],
  nomePrincipal?: string,
): { ok: true; extras: string[] } | { ok: false; erro: string } {
  const unicas = [...new Set(pedidas)];
  if (unicas.length === 0) return { ok: false, erro: 'praca_ids: escolha pelo menos a praça principal.' };
  if (unicas.length > MAX_PRACAS_POR_CONSULTOR) return { ok: false, erro: `praca_ids: no máximo ${MAX_PRACAS_POR_CONSULTOR} praças por consultor.` };
  if (!unicas.includes(principal)) {
    return { ok: false, erro: `praca_ids: a praça principal${nomePrincipal ? ` (${nomePrincipal})` : ''} fica sempre no conjunto.` };
  }
  return { ok: true, extras: unicas.filter((id) => id !== principal) };
}
