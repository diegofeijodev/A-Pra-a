import { z } from 'zod';

/** Configuração do fluxo da visita (contrato §31.3). Espelho de `api/src/domain/modo-campo-rules.ts`. */
export const RESULTADOS_COM_CONTATO = [
  ['cadastrou', 'Cadastrou agora'],
  ['ja_usa', 'Já usa o Freela'],
  ['retorno', 'Quer retorno'],
  ['sem_interesse', 'Sem interesse'],
] as const;
export const CAMPOS_CONTATO = [
  ['nome', 'Nome'],
  ['cargo', 'Cargo'],
  ['telefone', 'Telefone'],
] as const;

export const configModoSchema = z.object({
  fluxo_visita: z.enum(['simples', 'completo']).nullable(),
  justificativa_distancia: z.enum(['nao', 'opcional', 'obrigatoria']),
  contato_obrigatorio_em: z.array(z.string()),
  contato_campos: z.array(z.string()),
  fechado_conta_na_meta: z.boolean(),
  desfazer_segundos: z.number(),
  /** S3 (contrato §32.7): alerta de divergência do ganho declarado. Opcional: servidor antigo não manda. */
  divergencia_alerta_min: z.number().optional(),
  divergencia_alerta_pct: z.number().optional(),
});
export type ConfigModo = z.infer<typeof configModoSchema>;

export const configModoViewSchema = configModoSchema.extend({
  presets: z.object({ completo: configModoSchema, chefe: configModoSchema }),
  atualizado_em: z.string().nullable().optional(),
  /** Raio do check-in (contrato §23.1, L0): só leitura aqui (o rótulo "mais de N m"); servidor antigo não manda = 200. */
  raio_checkin_m: z.number().optional(),
});
export type ConfigModoView = z.infer<typeof configModoViewSchema>;

/** Alterna um item de um subconjunto sem mudar a ordem canônica. */
export function alternar(lista: string[], item: string, ordem: readonly (readonly [string, string])[]): string[] {
  const novo = lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];
  return ordem.map(([k]) => k).filter((k) => novo.includes(k));
}
