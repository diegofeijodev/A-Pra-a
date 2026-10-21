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

/** Cor nunca sozinha (UX §3.0): cada situação tem um símbolo na legenda. */
export const SIMBOLO: Record<Forma, string> = { circulo: '●', quadrado: '■', losango: '◆', triangulo: '▲', hexagono: '⬢', xis: '✕', traco: '▬' };

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
