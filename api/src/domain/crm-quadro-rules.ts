/**
 * CRM automático — regras PURAS da A3 (quadro de contratantes do Freela; arquitetura §2.5, achados 3, 6, 13 e 19; desenho §12.2 D2).
 * Sem banco, relógio ou log: os índices, as praças e "hoje" ("YYYY-MM-DD", comparação lexicográfica = cronológica) chegam por
 * parâmetro. Casamento errado é para sempre (o automático nunca volta a etapa), então na dúvida é ambíguo, nunca um palpite.
 */
import { phoneKey, toE164BR } from '../common/phone/phone';
import { todaySp } from '../common/time/dates';
import type { CartaoFreela } from './freela-cartao';

/** DDD + número (10 ou 11 dígitos) sem o +55; qualquer outra coisa (sem DDD, curto, estrangeiro) = null. */
export function telefoneNacional(raw: string | null): string | null {
  return toE164BR(raw)?.slice(3) ?? null;
}

/**
 * Mapas montados em lote pela rodada (Task 10), só com leads não arquivados e não teste. `porFreelaUserId` = `leads.freela_user_id`;
 * `porCadastro` = leads de `field_signups` vinculados, pelo `freela_user_id` do cadastro; `porChave` = pelo `phone_key` (últimos 9
 * dígitos); `assistidos` = `userId` que o Praça conhece como cadastro assistido (achado 3).
 */
export interface IndicesQuadro {
  porFreelaUserId: Map<string, string[]>;
  porCadastro: Map<string, string[]>;
  porChave: Map<string, { lead_id: string; phone: string; praca_id: string | null; freela_user_id: string | null }[]>;
  assistidos: Set<string>;
}

export type Casamento = { lead_id: string; por: 'id' | 'cadastro' | 'telefone' } | { ambiguo: true } | null;

const AMBIGUO = { ambiguo: true } as const;

/** Um lead só (repetido conta uma vez) = casou; 2+ = ambíguo; nenhum = segue para o próximo passo (undefined). */
function umLead(ids: string[] | undefined, por: 'id' | 'cadastro'): Casamento | undefined {
  const unicos = [...new Set(ids ?? [])];
  if (unicos.length === 0) return undefined;
  if (unicos.length > 1) return AMBIGUO;
  return { lead_id: unicos[0], por };
}

/**
 * Ordem do achado 6: (1) lead que já tem o `freela_user_id`; (2) cadastro do representante vinculado; (3) telefone, só com DDD
 * (10–11 dígitos) e, entre os leads da mesma chave de 9, só quem tem o número inteiro igual OU está numa praça cuja cobertura casa
 * com a cidade/UF do cartão (`pracasDaCidade`). Ambíguo também quando o único candidato já é de outro `userId`. Dois cartões no
 * mesmo lead é conta da rodada (`leadsDisputados`).
 */
export function casarCartao(c: CartaoFreela, idx: IndicesQuadro, pracasDaCidade: Set<string>): Casamento {
  const porId = umLead(idx.porFreelaUserId.get(c.userId), 'id');
  if (porId !== undefined) return porId;
  const porCadastro = umLead(idx.porCadastro.get(c.userId), 'cadastro');
  if (porCadastro !== undefined) return porCadastro;

  const tel = telefoneNacional(c.whatsappPhone);
  if (!tel) return null;
  const candidatos = new Map<string, string | null>();
  for (const l of idx.porChave.get(phoneKey(tel)) ?? []) {
    const mesmoNumero = telefoneNacional(l.phone) === tel;
    const naCidade = l.praca_id !== null && pracasDaCidade.has(l.praca_id);
    if (mesmoNumero || naCidade) candidatos.set(l.lead_id, l.freela_user_id);
  }
  if (candidatos.size === 0) return null;
  if (candidatos.size > 1) return AMBIGUO;
  const [[leadId, dono]] = [...candidatos];
  if (dono !== null && dono !== c.userId) return AMBIGUO;
  return { lead_id: leadId, por: 'telefone' };
}

/** Leads casados por dois cartões ou mais na mesma rodada: a rodada trata os dois como ambíguos (achado 6). */
export function leadsDisputados(casamentos: Casamento[]): Set<string> {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const m of casamentos) {
    if (!m || 'ambiguo' in m) continue;
    if (vistos.has(m.lead_id)) repetidos.add(m.lead_id);
    vistos.add(m.lead_id);
  }
  return repetidos;
}

/** Sem acento, minúscula, espaços únicos (hífen e apóstrofo ficam: "Embu-Guaçu", "Olho d'Água"). */
export function normalizarCidade(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Praça com o conjunto (cidade, UF) da cobertura: `cobertura_cidade/uf` + vizinhas já resolvidas com UF pelo chamador (achado 13). */
export interface PracaCobertura {
  id: string;
  start_date: string;
  end_date: string;
  cidades: { cidade: string; uf: string }[];
}

/**
 * Praça de uma empresa nova do quadro: aberta hoje (`start_date <= hoje <= end_date`), cobrindo a cidade/UF do cartão e com o
 * cadastro feito no início dela ou depois (dia de Brasília do instante, nunca a string ISO cortada). Várias: a de início mais
 * recente; empate, o menor id. `registeredAt` que não é data = null (um cartão ruim não derruba a rodada).
 */
export function pracaDoCartao(c: CartaoFreela, pracas: PracaCobertura[], hoje: string): string | null {
  if (!c.city || !c.state) return null;
  const registrado = new Date(c.registeredAt);
  if (Number.isNaN(registrado.getTime())) return null;
  const diaCadastro = todaySp(registrado);
  const cidade = normalizarCidade(c.city);
  const uf = c.state.trim().toUpperCase();

  const casam = pracas.filter(
    (p) =>
      p.start_date <= hoje &&
      hoje <= p.end_date &&
      diaCadastro >= p.start_date &&
      p.cidades.some((x) => normalizarCidade(x.cidade) === cidade && x.uf.trim().toUpperCase() === uf),
  );
  casam.sort((a, b) => b.start_date.localeCompare(a.start_date) || a.id.localeCompare(b.id));
  return casam[0]?.id ?? null;
}

/**
 * Alvo pelas vagas pagas (achados 3 e 19, D2). 0 → 5, menos no cadastro assistido (o 5 dele vem do sync, pela regra de confirmação);
 * 1 → 6; 2+ → 7 na 1ª observação ou quando já tinha 2+; vindo de 0/1, só se o Praça viu a 1ª vaga num dia ANTERIOR a hoje (duas
 * funções no mesmo evento não viram "Cliente ativo"). `dia_viu_primeira` = dia em que o Praça viu `hirings >= 1` pela 1ª vez.
 */
export function alvoDasContratacoes(x: {
  hirings: number;
  antes: number | null;
  hoje: string;
  dia_viu_primeira: string | null;
  assistido: boolean;
}): 5 | 6 | 7 | null {
  if (x.hirings <= 0) return x.assistido ? null : 5;
  if (x.hirings === 1) return 6;
  if (x.antes === null || x.antes >= 2) return 7;
  return x.dia_viu_primeira !== null && x.dia_viu_primeira < x.hoje ? 7 : 6;
}
