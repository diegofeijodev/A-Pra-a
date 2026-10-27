import { z } from 'zod';
import { rotuloDia } from '@/modules/remuneracao/domain/remuneracao';

/** Wire do mapa de pinos — contrato §34. */
export const FORMAS = ['circulo', 'quadrado', 'losango', 'triangulo', 'hexagono', 'xis', 'traco'] as const;
export type Forma = (typeof FORMAS)[number];

export const pinosSchema = z.object({
  mode: z.enum(['resultado', 'estagio']),
  pracas: z.array(z.object({ id: z.string(), name: z.string() })),
  legend: z.array(z.object({ code: z.string(), label: z.string(), color: z.string(), shape: z.enum(FORMAS), n: z.number() })),
  pins: z.array(z.tuple([z.string(), z.number(), z.number(), z.string()])),
  next_cursor: z.string().nullable(),
  total: z.number(),
  without_location: z.number(),
  conta: z.string(),
});
export type PinosPagina = z.infer<typeof pinosSchema>;
export type ModoMapa = PinosPagina['mode'];

export const detalhePinoSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  praca_id: z.string().nullable(),
  stage: z.number(),
  stage_label: z.string(),
  category: z.object({ code: z.string(), label: z.string(), color: z.string() }),
  last_visit: z.object({ day: z.string(), label: z.string(), consultant_name: z.string() }).nullable(),
  phone: z.object({ masked: z.string(), kind: z.enum(['whatsapp', 'fixo']) }).nullable(),
});
export type DetalhePino = z.infer<typeof detalhePinoSchema>;

/** Cor nunca sozinha (UX §3.0): cada situação tem um símbolo na legenda — e o pino do mapa tem a MESMA forma (`contornoDaForma`). */
export const SIMBOLO: Record<Forma, string> = { circulo: '●', quadrado: '■', losango: '◆', triangulo: '▲', hexagono: '⬢', xis: '✕', traco: '▬' };

/**
 * Contorno do pino no mapa, com o mesmo desenho do `SIMBOLO` da legenda: pontos em volta do centro (x para a direita, y para BAIXO,
 * como no canvas), na escala do raio `r` do pino. `null` = círculo (o `arc` do próprio Leaflet). Nenhum ponto passa de 1,2 × `r`:
 * o Leaflet só limpa e redesenha a caixa de raio `r` + espessura + 1 px em volta de cada pino, e um pino maior deixaria rastro.
 */
export function contornoDaForma(forma: Forma, r: number): [number, number][] | null {
  const pontos = (lista: [number, number][]) => lista.map(([x, y]) => [x * r, y * r] as [number, number]);
  const emVolta = (n: number, raio: number, inicioGraus: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((inicioGraus + (360 / n) * i) * Math.PI) / 180;
      return [raio * Math.cos(a), raio * Math.sin(a)] as [number, number];
    });
  switch (forma) {
    case 'circulo':
      return null;
    case 'quadrado':
      return pontos([[-0.84, -0.84], [0.84, -0.84], [0.84, 0.84], [-0.84, 0.84]]);
    case 'losango':
      return pontos([[0, -1.15], [1.15, 0], [0, 1.15], [-1.15, 0]]);
    case 'triangulo':
      return pontos(emVolta(3, 1.15, -90));
    case 'hexagono':
      return pontos(emVolta(6, 1.05, -90));
    case 'traco':
      return pontos([[-1.1, -0.4], [1.1, -0.4], [1.1, 0.4], [-1.1, 0.4]]);
    case 'xis': {
      // Uma cruz "+" de braços 1 × 0,38 girada 45°.
      const [a, t] = [1, 0.38];
      const mais: [number, number][] = [[t, -a], [t, -t], [a, -t], [a, t], [t, t], [t, a], [-t, a], [-t, t], [-a, t], [-a, -t], [-t, -t], [-t, -a]];
      const c = Math.SQRT1_2;
      return pontos(mais.map(([x, y]) => [(x - y) * c, (x + y) * c] as [number, number]));
    }
  }
}

/** Teto do navegador (arquitetura item 4): acima disso, "Mostrando N de M". */
export const MAX_PINOS_NA_TELA = 10_000;

export interface MapaCompleto {
  mode: ModoMapa;
  pracas: PinosPagina['pracas'];
  legend: PinosPagina['legend'];
  pins: PinosPagina['pins'];
  total: number;
  without_location: number;
  conta: string;
  truncado: boolean;
}

/** Junta as páginas (a legenda e os totais vêm da primeira: são do filtro inteiro). */
export function juntarPaginas(paginas: PinosPagina[], teto = MAX_PINOS_NA_TELA): MapaCompleto {
  const primeira = paginas[0]!;
  const pins = paginas.flatMap((p) => p.pins).slice(0, teto);
  const ultima = paginas[paginas.length - 1]!;
  return {
    mode: primeira.mode,
    pracas: primeira.pracas,
    legend: primeira.legend,
    pins,
    total: primeira.total,
    without_location: primeira.without_location,
    conta: primeira.conta,
    truncado: ultima.next_cursor !== null || pins.length < paginas.reduce((a, p) => a + p.pins.length, 0),
  };
}

/** Pinos visíveis com as situações escondidas pela legenda (estado da tela, nunca do servidor). */
export function pinosVisiveis(pins: PinosPagina['pins'], escondidos: ReadonlySet<string>): PinosPagina['pins'] {
  return escondidos.size ? pins.filter((p) => !escondidos.has(p[3])) : pins;
}

export function alternarCodigo(escondidos: ReadonlySet<string>, code: string): Set<string> {
  const s = new Set(escondidos);
  if (s.has(code)) s.delete(code);
  else s.add(code);
  return s;
}

/** Texto do balão (vira `textContent`, nunca HTML). */
export function linhasDoBalao(d: DetalhePino): string[] {
  const dia = d.last_visit ? rotuloDia(d.last_visit.day) : null;
  return [
    d.name,
    `${d.category.label} · etapa ${d.stage_label}`,
    d.last_visit ? `Última visita ${dia} · ${d.last_visit.consultant_name} (${d.last_visit.label})` : 'Ainda sem visita concluída',
    ...(d.address ? [d.address] : []),
    ...(d.phone ? [`Telefone ${d.phone.masked} · ${d.phone.kind === 'whatsapp' ? 'celular (WhatsApp)' : 'fixo'}`] : []),
  ];
}

// ── Aba "Clientes" do representante > Visitados (contrato §34.7, redesenho E4) ──

/** Item da Lista (§34.6/§34.7): telefone só mascarado, sem e-mail. */
export const itemListaCampoSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  praca_id: z.string(),
  code: z.string(),
  label: z.string(),
  color: z.string(),
  has_location: z.boolean(),
  phone: z.object({ masked: z.string(), kind: z.enum(['whatsapp', 'fixo']) }).nullable(),
  last_visit: z.object({ day: z.string(), consultant_name: z.string() }).nullable(),
});
/** `GET /v1/campo/map/list`: a resposta do §34.6 sem `pracas` (a praça vem do token). */
export const listaCampoSchema = z.object({
  counts: z.record(z.string(), z.number()),
  total: z.number(),
  without_location: z.number(),
  items: z.array(itemListaCampoSchema),
  next_cursor: z.string().nullable(),
  conta: z.string(),
});
export type ListaCampo = z.infer<typeof listaCampoSchema>;

/**
 * As situações da legenda (contrato §34.3), na ordem da legenda do mapa, com o símbolo (cor nunca sozinha). Os rótulos são os da
 * API de hoje: a troca para os da Lovable ("Cadastrado", "Não cadastrado"…) é uma etapa própria, junto do contrato.
 */
export const SITUACOES_LISTA: readonly { code: string; label: string; color: string; shape: Forma }[] = [
  { code: 'a_visitar', label: 'A visitar', color: '#2563eb', shape: 'circulo' },
  { code: 'cadastrado', label: 'Cadastrou', color: '#16a34a', shape: 'quadrado' },
  { code: 'ja_usa', label: 'Já usa o Freela', color: '#f97316', shape: 'losango' },
  { code: 'retornar', label: 'Quer retorno', color: '#9333ea', shape: 'triangulo' },
  { code: 'nao_contrata', label: 'Não contrata freelas', color: '#ca8a04', shape: 'hexagono' },
  { code: 'nao_cadastrado', label: 'Sem interesse', color: '#9f1239', shape: 'xis' },
  { code: 'fechado', label: 'Estabelecimento fechado', color: '#9A9A92', shape: 'traco' },
];

/** Escolha ÚNICA das pílulas de "Visitados" (Lovable `clientes.tsx`): `'todos'` ou o código de uma situação. */
export type EscolhaVisitados = string;

/** "Todos" = todas as situações menos "A visitar" (a lista é de quem ele já visitou, como na Lovable). */
export const codigosDaEscolha = (e: EscolhaVisitados): string[] =>
  e === 'todos' ? SITUACOES_LISTA.map((s) => s.code).filter((c) => c !== 'a_visitar') : [e];

/** As pílulas com o número de cada uma (de `counts`, o filtro inteiro antes da escolha); "Todos" soma as que entram nele. */
export function pilulasVisitados(counts: Record<string, number> | undefined): { escolha: EscolhaVisitados; rotulo: string; n: number | null; color?: string; shape?: Forma }[] {
  const n = (c: string) => (counts ? (counts[c] ?? 0) : null);
  const todos = counts ? codigosDaEscolha('todos').reduce((a, c) => a + (counts[c] ?? 0), 0) : null;
  return [
    { escolha: 'todos', rotulo: 'Todos', n: todos },
    ...SITUACOES_LISTA.filter((s) => s.code !== 'a_visitar').map((s) => ({ escolha: s.code, rotulo: s.label, n: n(s.code), color: s.color, shape: s.shape })),
  ];
}

/**
 * Rodapé de Clientes: cada número diz o que é. `counts`/`total`/`without_location` são do filtro de praça e busca INTEIRO, antes da
 * pílula (contrato §34.6) — com "A visitar" —, e a tabela mostra só a pílula escolhida. Antes, "31 no filtro" embaixo de "Todos 9"
 * parecia contradizer a pílula.
 */
export function rodapeDaLista(r: { counts: Record<string, number>; total: number; without_location: number }, escolha: EscolhaVisitados): string {
  const n = (x: number) => x.toLocaleString('pt-BR');
  const naLista = codigosDaEscolha(escolha).reduce((a, c) => a + (r.counts[c] ?? 0), 0);
  const aVisitar = r.counts.a_visitar ?? 0;
  return (
    `${n(naLista)} nesta lista de ${n(r.total)} ${r.total === 1 ? 'cliente' : 'clientes'} no filtro de praça e busca (${n(aVisitar)} ainda a visitar)` +
    ` · ${n(r.without_location)} dos ${n(r.total)} sem localização exata (não aparecem no mapa)`
  );
}
