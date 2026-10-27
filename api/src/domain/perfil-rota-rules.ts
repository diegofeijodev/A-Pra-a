/**
 * Filtro "Perfil dos clientes" da rota geral (redesenho E6, arquitetura §4.4; contrato §39.4). Puro: sem Prisma nem relógio.
 *
 * O perfil de um estabelecimento é a `category` dos achados da busca ligados a ele (o `slug` do segmento com os segmentos editáveis
 * ligados, senão um dos 5 tipos de hoje). A cláusula do banco fica em `modules/rotas/rotas-plano.ts` (`filtroPerfis`).
 */
import { TIPOS_LUGAR } from './places-rules';
import { LIMITES_SEGMENTOS, lerSegmentos, SEGMENTOS_PADRAO } from './segmentos-rules';

export interface PerfilCliente {
  slug: string;
  label: string;
}

/** Mesmo formato do `slug` dos segmentos (§36.4). */
const RE_PERFIL = /^[a-z0-9_]{2,30}$/;
export const MAX_PERFIS = LIMITES_SEGMENTOS.lista;

const porRotulo = (a: PerfilCliente, b: PerfilCliente) => a.label.localeCompare(b.label, 'pt-BR') || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/**
 * Lista branca, na ordem canônica (pelo rótulo, pt-BR). Segmentos ligados: TODOS os de `app_settings.place_segments` (ativos ou não:
 * quem foi achado por um segmento hoje desativado continua filtrável); desligados: os 5 tipos de hoje com o rótulo no singular.
 */
export function perfisConhecidos(segmentosLigados: boolean, placeSegmentsRaw: unknown): PerfilCliente[] {
  const tipos = TIPOS_LUGAR as readonly string[];
  const base = segmentosLigados ? lerSegmentos(placeSegmentsRaw).segmentos : SEGMENTOS_PADRAO.filter((s) => tipos.includes(s.slug));
  return base.map((s) => ({ slug: s.slug, label: s.label })).sort(porRotulo);
}

/** `?types=bar, restaurante,,` → `['bar', 'restaurante']`; vazio ou ausente → `undefined` (todos). */
export function lerTiposDaQuery(raw?: string | null): string[] | undefined {
  if (raw == null) return undefined;
  const l = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return l.length ? l : undefined;
}

export type ResultadoPerfis = { ok: true; perfis: PerfilCliente[] | null } | { ok: false; erro: string };

/** Ausente, `null` ou `[]` = todos (`null`). Senão: cada um na lista branca, sem repetição, na ordem de `conhecidos`. */
export function normalizarPerfis(entrada: readonly string[] | null | undefined, conhecidos: readonly PerfilCliente[]): ResultadoPerfis {
  if (!entrada || entrada.length === 0) return { ok: true, perfis: null };
  if (entrada.length > MAX_PERFIS) return { ok: false, erro: `types: no máximo ${MAX_PERFIS} perfis.` };
  for (const t of entrada) {
    if (typeof t !== 'string' || !RE_PERFIL.test(t) || !conhecidos.some((c) => c.slug === t)) {
      return { ok: false, erro: `types: '${String(t).slice(0, 30)}' não é um perfil de cliente.` };
    }
  }
  return { ok: true, perfis: conhecidos.filter((c) => entrada.includes(c.slug)).map((c) => ({ slug: c.slug, label: c.label })) };
}

/** "Bar", "Bar ou Restaurante", "Bar, Padaria ou Restaurante". */
export function rotuloPerfis(perfis: readonly PerfilCliente[]): string {
  const l = perfis.map((p) => p.label);
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} ou ${l[l.length - 1]}`;
}

/** `PLAN_NO_LEADS` (e a prévia sem nenhum) com o perfil pedido. */
export const semLeadsComPerfil = (perfis: readonly PerfilCliente[]): string =>
  `Nenhum estabelecimento com o perfil ${rotuloPerfis(perfis)}, com localização exata e fora de roteiro publicado nesta área.`;

const SEM_PERFIL_VARIOS = 'são de outro perfil ou não têm perfil (cadastrados à mão, importados ou abertos na visita)';
const SEM_PERFIL_UM = 'é de outro perfil ou não tem perfil (cadastrado à mão, importado ou aberto na visita)';

/**
 * A parte da conta que explica o filtro (regra do dono: todo número com a conta e a fonte): `n` = elegíveis com o perfil, `total` = os
 * elegíveis sem o filtro (mesmas regras do §39.4).
 */
export function contaPerfil({ n, total, perfis }: { n: number; total: number; perfis: readonly PerfilCliente[] }): string {
  const fmt = (x: number) => x.toLocaleString('pt-BR');
  const nomes = rotuloPerfis(perfis);
  if (total <= 0) return 'Nenhum estabelecimento elegível nesta área, com ou sem perfil.';
  if (n >= total) return total === 1 ? `O único estabelecimento elegível tem o perfil ${nomes}.` : `Todos os ${fmt(total)} estabelecimentos elegíveis têm o perfil ${nomes}.`;
  if (n <= 0) return total === 1 ? `O único estabelecimento elegível ${SEM_PERFIL_UM}.` : `Os ${fmt(total)} estabelecimentos elegíveis ${SEM_PERFIL_VARIOS}.`;
  const fora = total - n;
  const outros = fora === 1 ? `O outro ${SEM_PERFIL_UM}.` : `Os outros ${fmt(fora)} ${SEM_PERFIL_VARIOS}.`;
  return `${fmt(n)} dos ${fmt(total)} estabelecimentos elegíveis ${n === 1 ? 'tem' : 'têm'} o perfil ${nomes}. ${outros}`;
}

/** `params_snapshot.types` do plano → a lista gravada; qualquer outra forma (planos de antes, gerado sem perfil) = `null`. */
export function perfisDaFoto(snapshot: unknown): PerfilCliente[] | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const t = (snapshot as Record<string, unknown>).types;
  if (!Array.isArray(t) || t.length === 0) return null;
  const ok = t.every(
    (x) => !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).slug === 'string' && typeof (x as Record<string, unknown>).label === 'string',
  );
  return ok ? t.map((x) => ({ slug: (x as PerfilCliente).slug, label: (x as PerfilCliente).label })) : null;
}
