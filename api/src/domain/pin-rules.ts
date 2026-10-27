/**
 * Situação do estabelecimento no mapa de pinos e no "Resultado das visitas" do painel (contrato §34.3, §33.4) — PURO.
 *
 * Lovable: `src/lib/status.ts` (`STATUS_CLIENTE`: cores) e `mapa.tsx` (legenda). Aqui as situações são as do nosso
 * resultado da visita (5 chips do fluxo simples + "não contrata"), mais "A visitar"; visitas do fluxo COMPLETO são
 * traduzidas pelos campos antigos (`freela_status`, `needs_followup`, `refusal_reason`).
 */
import { FUNNEL_STAGES } from './catalog/funnel';

export const CATEGORIAS_PINO = [
  'a_visitar',
  'cadastrado',
  'ja_usa',
  'retornar',
  'nao_contrata',
  'nao_cadastrado',
  'fechado',
] as const;
export type CategoriaPino = (typeof CATEGORIAS_PINO)[number];
/** As de uma VISITA (o painel soma visitas; "A visitar" é só de estabelecimento). */
export const CATEGORIAS_VISITA = CATEGORIAS_PINO.filter((c) => c !== 'a_visitar') as Exclude<
  CategoriaPino,
  'a_visitar'
>[];

export interface MetaCategoria {
  label: string;
  color: string;
  /** Forma desenhada na legenda (cor nunca sozinha, UX §3.0). */
  shape: 'circulo' | 'quadrado' | 'losango' | 'triangulo' | 'hexagono' | 'xis' | 'traco';
}

export const META_CATEGORIA: Record<CategoriaPino, MetaCategoria> = {
  a_visitar: { label: 'A visitar', color: '#2563eb', shape: 'circulo' },
  cadastrado: { label: 'Cadastrou', color: '#16a34a', shape: 'quadrado' },
  ja_usa: { label: 'Já usa o Freela', color: '#f97316', shape: 'losango' },
  retornar: { label: 'Quer retorno', color: '#9333ea', shape: 'triangulo' },
  nao_contrata: { label: 'Não contrata freelas', color: '#ca8a04', shape: 'hexagono' },
  // Vinho, não o vermelho #dc2626 de antes: no mapa aberto o vermelho é o das farmácias e hospitais (27/10). ≈ 7:1 no fundo claro do mapa (#f2efe9).
  nao_cadastrado: { label: 'Sem interesse', color: '#9f1239', shape: 'xis' },
  // A Lovable usa #334155, que some no mapa escuro invertido (UX §3.3).
  fechado: { label: 'Estabelecimento fechado', color: '#9A9A92', shape: 'traco' },
};

export const MOTIVO_NAO_CONTRATA = 'nao_contrata_freelancers';

export interface VisitaParaCategoria {
  outcome?: string | null;
  result?: string | null;
  freela_status?: string | null;
  needs_followup?: boolean | null;
  refusal_reason?: string | null;
}

/** Uma visita CONCLUÍDA → situação. A ordem é a do contrato §34.3 (a primeira regra que vale ganha). */
export function categoriaDaVisita(v: VisitaParaCategoria): Exclude<CategoriaPino, 'a_visitar'> {
  if (v.outcome === 'fechado' || v.result === 'fechado') return 'fechado';
  if (v.result === 'cadastrou' || v.freela_status === 'cadastrou_qr' || v.freela_status === 'declarou')
    return 'cadastrado';
  if (v.result === 'ja_usa' || v.freela_status === 'ja_usa') return 'ja_usa';
  if (v.refusal_reason === MOTIVO_NAO_CONTRATA) return 'nao_contrata';
  if (v.result === 'retorno' || v.needs_followup === true) return 'retornar';
  return 'nao_cadastrado';
}

/** Etapas do funil que já são "cadastrado" (5 Cadastrado, 6 Primeira vaga, 7 Cliente ativo). A 8 (Perdido) não. */
export const ehEtapaCadastrada = (stage: number): boolean => stage >= 5 && stage <= 7;

/**
 * Estabelecimento → situação: declaração não anulada ou etapa 5–7 = cadastrado; sem visita concluída = a visitar;
 * senão a da ÚLTIMA visita concluída.
 */
export function categoriaDoLead(
  lead: { stage: number },
  ultimaVisita: VisitaParaCategoria | null,
  temDeclaracao: boolean,
): CategoriaPino {
  if (temDeclaracao || ehEtapaCadastrada(lead.stage)) return 'cadastrado';
  if (!ultimaVisita) return 'a_visitar';
  return categoriaDaVisita(ultimaVisita);
}

export interface ItemLegenda {
  code: string;
  label: string;
  color: string;
  shape: MetaCategoria['shape'];
  n: number;
}

export type ModoPinos = 'resultado' | 'estagio';

/** Legenda em ordem fixa, com as categorias de contagem 0 (a soma dá o total do filtro). */
export function legenda(contagem: Map<string, number>, modo: ModoPinos): ItemLegenda[] {
  if (modo === 'estagio') {
    return FUNNEL_STAGES.map((s) => ({
      code: String(s.n),
      label: `${s.n}. ${s.name}`,
      color: s.color,
      shape: 'circulo' as const,
      n: contagem.get(String(s.n)) ?? 0,
    }));
  }
  return CATEGORIAS_PINO.map((c) => ({ code: c, ...META_CATEGORIA[c], n: contagem.get(c) ?? 0 }));
}

/** Rótulo de uma etapa do funil ("5. Cadastrado"); etapa fora do catálogo = só o número. */
export const rotuloEtapa = (stage: number): string => {
  const s = FUNNEL_STAGES.find((x) => x.n === stage);
  return s ? `${s.n}. ${s.name}` : String(stage);
};

/**
 * Telefone do estabelecimento (Lovable `classifyPhone`, `format.ts:49-56`): celular BR (11 dígitos com 9 depois do DDD) =
 * provável WhatsApp; senão fixo. Devolve SÓ a máscara (dado de terceiro: nunca o número inteiro para a equipe no mapa).
 */
export function classificarTelefone(
  bruto: string | null | undefined,
): { masked: string; kind: 'whatsapp' | 'fixo' } | null {
  if (!bruto) return null;
  let d = bruto.replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  const kind = d.length === 11 && d[2] === '9' ? 'whatsapp' : 'fixo';
  const masked =
    d.length === 11
      ? `(${d.slice(0, 2)}) ${d[2]}****-${d.slice(7)}`
      : `(${d.slice(0, 2)}) ****-${d.slice(6)}`;
  return { masked, kind };
}
