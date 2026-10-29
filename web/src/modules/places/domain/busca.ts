import type { CandidateView, SearchRunView, SourceView, TipoLugar } from '../infrastructure/places.api';

/** Regras de apresentação da tela "Buscar estabelecimentos" (UX §5.1). Sem React nem rede. */

export const TIPOS: { id: TipoLugar; label: string }[] = [
  { id: 'bar', label: 'Bares' },
  { id: 'restaurante', label: 'Restaurantes' },
  { id: 'lanchonete', label: 'Lanchonetes' },
  { id: 'padaria', label: 'Padarias' },
  { id: 'cafe', label: 'Cafés' },
];

/** Máximo de segmentos por busca com os segmentos editáveis ligados (§36.6); desligada, os 5 de hoje. */
export const MAX_TIPOS_SEGMENTOS = 10;

/** Chips do "O que buscar": os segmentos ativos (com a flag) ou os 5 de hoje. */
export function opcoesDeTipo(segmentos: { slug: string; label: string; active: boolean; priority: number }[] | null | undefined): { id: string; label: string }[] {
  if (!segmentos) return TIPOS;
  return segmentos.filter((s) => s.active).map((s) => ({ id: s.slug, label: s.label }));
}

/** Máximo de ids por chamada de "adicionar" (igual ao servidor). */
export const MAX_ADICIONAR = 300;

/**
 * A1 ligada (UX final, achado 9): a busca do OSM já devolve no máximo 300 (`MAX_ADICIONAR`), então nada "fica aqui para escolher"; o aviso
 * diz só o teto.
 */
export const AVISO_AUTO_LEADS = 'Os achados entram no funil sozinhos quando a busca termina (até 300 por busca).';

/** A abertura do passo 3, antes de escolher uma busca. Com a A1 ligada, não há o que revisar antes de adicionar. */
export const aberturaDoResultado = (autoLeads: boolean): string =>
  autoLeads
    ? 'Os achados aparecem aqui; os que ainda não estão no funil entram sozinhos quando a busca termina.'
    : 'Escolha uma área e o que buscar. Os resultados aparecem aqui para você revisar antes de adicionar.';

export type ModoLista = 'todos' | 'novos' | 'na_praca';

export const emAndamento = (r: Pick<SearchRunView, 'status'> | undefined): boolean =>
  r?.status === 'queued' || r?.status === 'running';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function progressoTexto(r: SearchRunView): string {
  if (r.status === 'queued') return 'Na fila… a busca começa em instantes.';
  return r.found > 0 ? `Buscando… ${r.found} encontrados até agora` : 'Buscando…';
}

export function resumoTexto(r: SearchRunView): string {
  const jaNaPraca = r.duplicados;
  return `Achamos ${r.found} · ${jaNaPraca} já ${jaNaPraca === 1 ? 'está' : 'estão'} na praça`;
}

export function rotuloCache(r: SearchRunView): string {
  const d = new Date(r.finished_at ?? r.created_at);
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  return `Busca de ${dia} em ${r.area_name}, ${plural(r.found, 'resultado', 'resultados')}`;
}

export function rotuloSituacao(c: Pick<CandidateView, 'status' | 'reason'>): string {
  if (c.status === 'novo') return 'Novo';
  if (c.status === 'adicionado') return 'Adicionado';
  switch (c.reason) {
    case 'ja_na_praca':
      return 'Já está na praça';
    case 'repetido_na_busca':
      return 'Repetido na busca';
    case 'parece_fechado':
      return 'Parece fechado';
    case 'sem_nome':
      return 'Sem nome';
    default:
      return c.status === 'duplicado' ? 'Já está na praça' : 'Descartado';
  }
}

export const rotuloDistancia = (m: number): string =>
  m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${m} m`;

/** Padrão: marcar todos os novos (os que podem ser adicionados). */
export function selecaoPadrao(cands: CandidateView[]): Set<string> {
  return new Set(cands.filter((c) => c.selectable).slice(0, MAX_ADICIONAR).map((c) => c.id));
}

export function alternar(sel: Set<string>, c: CandidateView): Set<string> {
  if (!c.selectable) return sel;
  const novo = new Set(sel);
  if (novo.has(c.id)) novo.delete(c.id);
  else if (novo.size < MAX_ADICIONAR) novo.add(c.id);
  return novo;
}

/** "Selecionar todos os novos" que aparecem na lista filtrada. */
export function selecionarVisiveis(sel: Set<string>, visiveis: CandidateView[]): Set<string> {
  const novo = new Set(sel);
  for (const c of visiveis) if (c.selectable && novo.size < MAX_ADICIONAR) novo.add(c.id);
  return novo;
}

export function limparVisiveis(sel: Set<string>, visiveis: CandidateView[]): Set<string> {
  const novo = new Set(sel);
  for (const c of visiveis) novo.delete(c.id);
  return novo;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrar(cands: CandidateView[], f: { texto: string; modo: ModoLista }): CandidateView[] {
  const t = semAcento(f.texto.trim());
  return cands.filter((c) => {
    if (f.modo === 'novos' && c.status !== 'novo') return false;
    if (f.modo === 'na_praca' && !(c.status === 'duplicado' && c.reason === 'ja_na_praca')) return false;
    return !t || semAcento(`${c.name} ${c.address}`).includes(t);
  });
}

/** Só vale o que continua selecionável (a lista pode ter sido recalculada). */
export function idsParaAdicionar(sel: Set<string>, cands: CandidateView[]): string[] {
  return cands.filter((c) => sel.has(c.id) && c.selectable).map((c) => c.id);
}

/** Confirmação de alto efeito (UX §5.1): diz quantos, onde, a origem e que ninguém recebe mensagem. */
export function textoConfirmacao(n: number, pracaNome: string): { titulo: string; corpo: string; botao: string } {
  return {
    titulo: `Adicionar ${plural(n, 'estabelecimento', 'estabelecimentos')} à praça ${pracaNome}?`,
    corpo: `Entram como Lead novo, com a origem “pesquisa automática”. Esta ação não envia mensagem. Mas, se houver uma cadência automática ligada para Lead novo, ela passa a valer para eles, como em qualquer importação. Dá para desfazer em até 24 horas, em Entrada.`,
    botao: `Adicionar ${plural(n, 'lead', 'leads')}`,
  };
}

export function avisoPago(s: SourceView | undefined): string | null {
  if (!s?.paid) return null;
  const custo = s.est_cost_usd_per_run;
  const tetoLugares = s.max_places_per_run;
  const partes = ['Esta busca usa créditos pagos.'];
  if (tetoLugares) partes.push(`Até ${tetoLugares} lugares`);
  if (custo !== undefined) partes[partes.length - 1] += `, estimativa de até US$ ${custo.toFixed(2).replace('.', ',')}.`;
  if (s.monthly_cap !== undefined && s.used_this_month !== undefined) {
    partes.push(`Neste mês: ${s.used_this_month} de ${s.monthly_cap} lugares.`);
  }
  return partes.join(' ');
}

export function mensagemVazia(r: SearchRunView): string | null {
  if (r.status !== 'done') return null;
  if (r.found === 0) return 'Nenhum estabelecimento nessa área. Aumente o raio ou tire algum tipo.';
  return null;
}

/** Raios da busca de estabelecimentos (a API aceita até 15 km; o centro é sempre o da área). */
const RAIOS_BUSCA_M = [1000, 2000, 3000, 5000, 8000, 10000, 15000] as const;

const rotuloMetros = (m: number): string =>
  m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${m} m`;

/** As opções do seletor, com o raio da área marcado (e incluído, se não for um dos de sempre). */
export function opcoesDeRaio(raioDaArea: number): { valor: number; rotulo: string }[] {
  const valores = [...new Set<number>([...RAIOS_BUSCA_M, raioDaArea])].sort((a, b) => a - b);
  return valores.map((v) => ({ valor: v, rotulo: v === raioDaArea ? `${rotuloMetros(v)} (o da área)` : rotuloMetros(v) }));
}

/** `radius_m` só quando difere do da área: sem ele a busca (e a chave do cache) é a de antes. */
export const raioParaEnviar = (escolhido: number | null, raioDaArea: number): number | undefined =>
  escolhido == null || escolhido === raioDaArea ? undefined : escolhido;
