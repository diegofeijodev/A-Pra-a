import { z } from 'zod';

/** Regra de senha nova (contrato §41.2). `GET /v1/password-policy` responde 200 sempre: desligada = `{ enabled: false }`. */
export const politicaSchema = z.union([
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    min_length: z.number(),
    max_length: z.number(),
    require_upper: z.boolean(),
    require_digit: z.boolean(),
    is_default: z.boolean(),
    rules: z.array(z.object({ key: z.enum(['min_length', 'upper', 'digit']), label: z.string() })),
  }),
]);
export type Politica = z.infer<typeof politicaSchema>;
export type PoliticaLigada = Extract<Politica, { enabled: true }>;

/** A mesma conta do servidor (`validarSenhaNova`): marcação ao vivo, ícone + texto (UX §3.9 K4). */
export function conferirRegras(senha: string, p: PoliticaLigada): { key: string; label: string; ok: boolean }[] {
  const temMaiuscula = [...senha].some((ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase());
  return p.rules.map((r) => ({
    key: r.key,
    label: r.label,
    ok: r.key === 'min_length' ? [...senha].length >= p.min_length && [...senha].length <= p.max_length : r.key === 'upper' ? temMaiuscula : /[0-9]/.test(senha),
  }));
}

export const senhaCumpre = (senha: string, p: Politica | undefined): boolean =>
  !p || !p.enabled || conferirRegras(senha, p).every((r) => r.ok);
