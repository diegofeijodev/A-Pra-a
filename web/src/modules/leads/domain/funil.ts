/**
 * Textos puros do Funil (UX §3.4): a conta de cada taxa, os selos do automático,
 * "12 dias parado" e a cor da bolinha da etapa. Sem React, para testar sem tela.
 */

/** "2 de 4 = 50%". Sem `n`/`de` (API antiga) volta o "%" de antes. */
export function textoConversao(n: number | undefined, de: number | undefined, pct: number | undefined): string {
  const taxa = pct ?? 0;
  if (n === undefined || de === undefined) return `${taxa}%`;
  if (de === 0) return `${n} de ${de}`;
  return `${n} de ${de} = ${taxa}%`;
}

/** O nome do selo do Freela; honesto: o campo conta vagas pagas e não canceladas (achado 13). */
export function nomeSeloFreela(contratacoes: number | null | undefined): string | null {
  if (!contratacoes || contratacoes < 1) return null;
  return contratacoes === 1 ? 'Freela: 1 contratação paga' : `Freela: ${contratacoes} contratações pagas`;
}

export interface SeloDoLead {
  last_stage_auto: boolean;
  freela_hirings: number | null;
}

/** Os nomes (também os acessíveis) dos selos de um cartão, na ordem em que aparecem. */
export function textoDeSelos(selo: SeloDoLead | undefined): string[] {
  if (!selo) return [];
  const nomes: string[] = [];
  if (selo.last_stage_auto) nomes.push('Automático');
  const freela = nomeSeloFreela(selo.freela_hirings);
  if (freela) nomes.push(freela);
  return nomes;
}

export function diasParado(dias: number): string {
  if (dias <= 0) return 'Hoje';
  return dias === 1 ? '1 dia parado' : `${dias} dias parado`;
}

/** A cor da etapa só vai para a bolinha (decoração); o texto fica `text-foreground` (achado 9). */
export function corDaBolinha(etapa: { n: number; color: string }): { backgroundColor: string } {
  return { backgroundColor: etapa.color };
}
