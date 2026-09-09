// Regras puras da entrada de leads por arquivo — porta literal de
// `.prototype/src/lib/praca/intake.ts:121-207` (adivinhação do mapeamento,
// leitura da linha, duplicidade e casamento de praça).
//
// Aqui não entra Prisma nem HTTP: o serviço carrega os candidatos do banco e
// passa como lista. É o que deixa a regra testável sem subir a API.
import { digits } from '../common/phone/phone';
import { CLASSES, LEAD_FIELDS } from './catalog/funnel';

export type Classe = (typeof CLASSES)[number]['id'];

/** Texto comparável: sem acento, sem caixa, sem pontuação nem espaço. */
export const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Mesmo telefone: últimos 9 dígitos iguais (a mesma chave de `phone_key`).
 * Ignora máscara, DDI e o nono dígito faltando. Menos de 8 dígitos não é
 * telefone — nunca casa, nem consigo mesmo.
 */
export const samePhone = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = digits(a).slice(-9);
  const y = digits(b).slice(-9);
  return x.length >= 8 && x === y;
};

/**
 * Classificação a partir do texto da planilha. O protótipo tem um `if`
 * redundante ("grande | alta | a" por fora, "grande | alta" por dentro) que
 * não muda o resultado — aqui fica só o efeito: grande, depois, ou alvo.
 */
export function guessClasse(v: string | null | undefined): Classe {
  const n = norm(v);
  if (!n) return 'alvo';
  if (n.includes('grande') || n.includes('alta')) return 'grande';
  if (n.includes('depois') || n.includes('baixa') || n.includes('frio')) return 'depois';
  return 'alvo';
}

/**
 * Adivinha `campo do lead → coluna do arquivo` pelas dicas do catálogo.
 * Uma coluna só serve a um campo (`used`): sem isso "Nome" viraria nome e
 * decisor ao mesmo tempo.
 */
export function guessMapping(columns: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of LEAD_FIELDS) {
    const hit = columns.find((c) => {
      if (used.has(c)) return false;
      const n = norm(c);
      // Diverge do protótipo: lá, coluna de cabeçalho vazio (ou só
      // pontuação) normalizava para "" e casava com QUALQUER dica por
      // `h.includes("")`, prendendo a primeira coluna sem nome no `name`.
      if (!n) return false;
      return f.hints.some((h) => n === h || n.includes(h) || h.includes(n));
    });
    if (hit) {
      map[f.id] = hit;
      used.add(hit);
    }
  }
  return map;
}

/** Lead lido de uma linha do arquivo, antes de virar registro no banco. */
export interface DraftLead {
  name: string;
  address: string;
  city: string;
  phone: string;
  instagram: string;
  decisor: string;
  classe: Classe;
  origem: string;
  cnpj: string;
}

/** Uma linha + o mapeamento viram rascunho de lead. `origemLote` é o padrão da tela. */
export function rowToDraft(
  row: Record<string, string>,
  map: Record<string, string>,
  origemLote: string,
): DraftLead {
  const g = (field: string): string => {
    const col = map[field];
    return col ? (row[col] ?? '').trim() : '';
  };
  return {
    name: g('name'),
    address: g('address'),
    city: g('city'),
    phone: g('phone'),
    instagram: g('instagram'),
    decisor: g('decisor'),
    classe: guessClasse(g('classe')),
    origem: g('origem') || origemLote,
    cnpj: g('cnpj'),
  };
}

export type DupKind = 'telefone' | 'cnpj' | 'nome+endereço';

/** Forma comparável de um candidato — o que os três degraus olham de fato. */
export interface DupKeys {
  /** Últimos 9 dígitos do telefone (a mesma chave de `phoneKey`). */
  phone: string;
  /** Só os dígitos do CNPJ. */
  cnpj: string;
  name: string;
  address: string;
}

/**
 * O recorte do lead que a duplicidade enxerga. `id` é `null` quando o
 * candidato é uma linha anterior do próprio arquivo (ainda não existe no
 * banco). `keys` é opcional: preenchido uma vez por candidato na carga (é o
 * que o serviço faz), a varredura de cada linha do arquivo deixa de
 * renormalizar a base inteira de novo.
 */
export interface DupCandidate {
  id: string | null;
  name: string;
  address: string;
  phone: string;
  cnpj: string | null;
  keys?: DupKeys;
}

/** Chaves normalizadas de um candidato — ou de um rascunho de linha. */
export const dupKeys = (c: {
  name: string;
  address: string;
  phone: string;
  cnpj: string | null;
}): DupKeys => ({
  phone: digits(c.phone).slice(-9),
  cnpj: digits(c.cnpj),
  name: norm(c.name),
  address: norm(c.address),
});

const keysOf = (c: DupCandidate): DupKeys => c.keys ?? dupKeys(c);

export interface DupHit {
  lead: DupCandidate;
  by: DupKind;
}

/**
 * Duplicidade em três degraus, nesta ordem: telefone → CNPJ → nome+endereço.
 * O primeiro degrau que casar decide — telefone é o mais confiável, e
 * nome+endereço só entra quando os dois vieram preenchidos.
 */
export function findDuplicate(d: DraftLead, existing: DupCandidate[]): DupHit | null {
  // As chaves do rascunho saem UMA vez, não uma por candidato.
  const k = dupKeys(d);
  if (k.phone.length >= 8) {
    // Com o telefone do rascunho em 8+ dígitos, igualdade de chave é
    // exatamente o que `samePhone` diz: mesmos últimos 9 dígitos.
    const hit = existing.find((l) => keysOf(l).phone === k.phone);
    if (hit) return { lead: hit, by: 'telefone' };
  }
  if (k.cnpj.length === 14) {
    const hit = existing.find((l) => keysOf(l).cnpj === k.cnpj);
    if (hit) return { lead: hit, by: 'cnpj' };
  }
  if (d.name && d.address) {
    const hit = existing.find((l) => {
      const lk = keysOf(l);
      return lk.name === k.name && lk.address === k.address;
    });
    if (hit) return { lead: hit, by: 'nome+endereço' };
  }
  return null;
}

export interface PracaMatch {
  id: string;
  name: string;
  city: string;
}

/**
 * Praça da linha quando o modo é "pela cidade do arquivo": a primeira praça
 * cuja cidade OU nome contém a cidade da linha. `null` = lead órfão (entra sem
 * praça e aparece em `GET /v1/leads/orphans`).
 */
export function matchPraca(city: string | null | undefined, pracas: PracaMatch[]): string | null {
  const n = norm(city);
  if (!n) return null;
  const hit = pracas.find((p) => norm(p.city).includes(n) || norm(p.name).includes(n));
  return hit?.id ?? null;
}
