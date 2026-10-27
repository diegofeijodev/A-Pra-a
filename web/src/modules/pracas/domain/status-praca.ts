/**
 * Situação da praça (redesenho E5.2, UX §4.2): a Lovable grava `status` e deixa trocar à mão; aqui ela SAI DAS DATAS, no dia de
 * Brasília (`todaySp()`), para não apagar a trilha [desvio: dado]. Para mudar a situação, muda-se a data no "Editar praça".
 */
export type SituacaoPraca = 'planejamento' | 'em_andamento' | 'concluida';

export const ROTULO_SITUACAO_PRACA: Record<SituacaoPraca, string> = {
  planejamento: 'Planejamento',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
};

interface Periodo {
  start_date: string;
  end_date: string;
}

/** Antes do início = Planejamento; do início ao fim (os dois dias inclusos) = Em andamento; depois do fim = Concluída. */
export function situacaoDaPraca(p: Periodo, hoje: string): SituacaoPraca {
  if (hoje < p.start_date) return 'planejamento';
  if (hoje > p.end_date) return 'concluida';
  return 'em_andamento';
}

/**
 * Praças "abertas" do Mapa (Lovable `mapa.tsx`: as que já saíram do planejamento; UX §4.5): Em andamento ou Concluída pelas datas —
 * o mesmo corte da API (`start_date ≤ hoje`, contrato §34.1). A ordem da lista é mantida.
 */
export function pracasAbertas<T extends Periodo>(pracas: readonly T[], hoje: string): T[] {
  return pracas.filter((p) => situacaoDaPraca(p, hoje) !== 'planejamento');
}

/** "Cidade/UF" da Lovable: a cidade-sede do IBGE quando há; senão a cidade digitada ("Belo Horizonte · MG" → "Belo Horizonte/MG"). */
export function cidadeUf(p: { city: string; cobertura: { cidade: string; uf: string } | null }): string {
  if (p.cobertura?.cidade) return `${p.cobertura.cidade}/${p.cobertura.uf}`;
  return p.city.replace(/\s*·\s*/g, '/');
}

const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "12/10 → 18/01" (o que o cartão mostra quando a API ainda não manda `leads_count`). */
export const periodoCurto = (p: Periodo): string => `${diaMes(p.start_date)} → ${diaMes(p.end_date)}`;

/** "1 cliente" / "3.406 clientes"; sem a contagem (API antiga), o período. */
export function linhaClientes(p: Periodo & { leads_count?: number }): string {
  if (p.leads_count == null) return periodoCurto(p);
  return `${p.leads_count.toLocaleString('pt-BR')} ${p.leads_count === 1 ? 'cliente' : 'clientes'}`;
}
