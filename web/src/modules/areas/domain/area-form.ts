import { z } from 'zod';

// Espelho de `api/src/domain/area-rules.ts`: o servidor é quem decide (400
// VALIDATION_ERROR); aqui só evitamos a ida e volta para erro óbvio.
export const RAIO_MIN_M = 200;
export const RAIO_MAX_M = 5000;
export const RAIO_PADRAO_M = 1000;
export const BRASIL = { latMin: -33.75, latMax: 5.3, lngMin: -74, lngMax: -28.8 } as const;

export const dentroDoBrasil = (lat: number, lng: number): boolean =>
  lat >= BRASIL.latMin && lat <= BRASIL.latMax && lng >= BRASIL.lngMin && lng <= BRASIL.lngMax;

export const areaFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Dê um nome à área (ex.: Moema).')
      .max(80, 'O nome pode ter até 80 caracteres.'),
    lat: z.number({ required_error: 'Clique no mapa para marcar o centro da área.', invalid_type_error: 'Clique no mapa para marcar o centro da área.' }),
    lng: z.number({ required_error: 'Clique no mapa para marcar o centro da área.', invalid_type_error: 'Clique no mapa para marcar o centro da área.' }),
    radius_m: z
      .number({ invalid_type_error: `Use um raio entre ${RAIO_MIN_M} e ${RAIO_MAX_M} metros.` })
      .int(`Use um raio entre ${RAIO_MIN_M} e ${RAIO_MAX_M} metros.`)
      .min(RAIO_MIN_M, `O raio mínimo é ${RAIO_MIN_M} metros.`)
      .max(RAIO_MAX_M, `O raio máximo é ${RAIO_MAX_M} metros.`),
  })
  .refine((v) => dentroDoBrasil(v.lat, v.lng), {
    path: ['lat'],
    message: 'O centro da área precisa estar dentro do Brasil.',
  });

export type AreaFormValues = z.infer<typeof areaFormSchema>;

/** Primeira mensagem de erro do formulário, ou `null` se estiver válido. */
export function erroDoFormulario(v: { name: string; lat: number | null; lng: number | null; radius_m: number }): string | null {
  const r = areaFormSchema.safeParse(v);
  return r.success ? null : (r.error.issues[0]?.message ?? 'Confira os campos.');
}

export interface Visao {
  center: [number, number];
  zoom: number;
}

const BRASIL_VISAO: Visao = { center: [-14.2, -51.9], zoom: 4 };

/**
 * Onde o mapa abre: o centro da praça (cobertura do IBGE) se existir; senão a
 * média dos centros das áreas já cadastradas (praça "Moema" não tem
 * cobertura); senão o Brasil inteiro.
 */
export function visaoInicial(
  praca: { cobertura: { lat: number; lon: number } | null },
  areas: { lat: number; lng: number }[],
): Visao {
  if (areas.length > 0) {
    const lat = areas.reduce((s, a) => s + a.lat, 0) / areas.length;
    const lng = areas.reduce((s, a) => s + a.lng, 0) / areas.length;
    return { center: [lat, lng], zoom: 13 };
  }
  if (praca.cobertura) return { center: [praca.cobertura.lat, praca.cobertura.lon], zoom: 11 };
  return BRASIL_VISAO;
}

/** "1,5 km" / "800 m" para a lista. */
export function rotuloRaio(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${m} m`;
}
