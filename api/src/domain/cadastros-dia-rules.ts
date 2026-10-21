/**
 * `cadastrosDoDia` (contrato §33.3) — a contagem comum do painel e do resumo do dia. PURO: o serviço lê as versões da
 * regra e as contagens brutas por dia; aqui só se decide QUAL contagem vale em cada dia.
 *
 * Segue a `signup_source` da versão da regra de remuneração vigente no dia (mesma vigência do §28.2): `declared` =
 * declarações não anuladas do dia; `freela_confirmed` (padrão) = confirmados pelo Freela no dia da `confirmation_rule`.
 */
import { normalizarRegra, versaoVigente, type RegraBruta } from './earnings-rules';

export type FonteCadastroDia = 'declared' | 'freela_confirmed';
export type FontePeriodo = FonteCadastroDia | 'misto';

export function fonteDoDia(versoes: readonly { version: number; valid_from: string; config: RegraBruta }[], dia: string): FonteCadastroDia {
  const v = versaoVigente(versoes, dia);
  return v && normalizarRegra(v.config).signup_source === 'declared' ? 'declared' : 'freela_confirmed';
}

/** Contagem do dia pela fonte: todas as declarações não anuladas (sem o limite diário, que é do dinheiro). */
export function contarCadastros(bruto: { signups: number; declared?: number } | undefined, fonte: FonteCadastroDia): number {
  if (!bruto) return 0;
  return fonte === 'declared' ? (bruto.declared ?? 0) : bruto.signups;
}

export function fonteDoPeriodo(fontes: Iterable<FonteCadastroDia>): FontePeriodo {
  const s = new Set(fontes);
  if (s.size > 1) return 'misto';
  return s.has('declared') ? 'declared' : 'freela_confirmed';
}

/** A frase da fonte, para a conta (todo número diz de onde veio). */
export function textoFonteCadastros(fonte: FontePeriodo, syncLigado: boolean): string {
  const sync = syncLigado ? '' : ' A sincronização com o Freela está desligada neste servidor: os confirmados ficam em 0.';
  if (fonte === 'declared') return 'Cadastros = os declarados no fim das visitas (a regra de remuneração vigente paga o cadastro declarado).';
  if (fonte === 'misto')
    return `Cadastros = em cada dia, a fonte da regra de remuneração daquele dia: declarados nos dias de regra "declarado", confirmados pelo Freela nos demais.${sync}`;
  return `Cadastros = os confirmados pelo Freela com data no período (regra vigente: cadastro confirmado); um confirmado pode ser de visita de outro dia.${sync}`;
}
