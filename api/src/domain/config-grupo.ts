/**
 * Grupo de chaves de `app_settings.field_config` (contrato §23.1, §33.2): padrão, validação por chave e, se houver,
 * uma regra entre chaves. Puro. Mesma política das chaves existentes: ausente ou inválida no banco = padrão; PUT
 * parcial validado sobre o estado JÁ MESCLADO; chave desconhecida = erro.
 */
export interface GrupoConfig<T extends object> {
  padrao: T;
  chaves: (keyof T & string)[];
  tem(k: string): boolean;
  ler(raw: unknown): T;
  aplicar(atual: T, parcial: Record<string, unknown>): { ok: true; config: T } | { ok: false; erro: string };
}

export const inteiroEntre = (min: number, max: number) => (v: unknown) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
export const umDe = (valores: readonly string[]) => (v: unknown) => typeof v === 'string' && valores.includes(v);

export function grupoConfig<T extends object>(
  padrao: T,
  validadores: { [K in keyof T]: (v: unknown) => boolean },
  /** Regra entre chaves: `null` = coerente; senão a mensagem (`chave: …`). Na leitura, incoerente = `corrigir`. */
  coerencia?: { erro: (c: T) => string | null; corrigir: (c: T) => T },
): GrupoConfig<T> {
  const chaves = Object.keys(validadores) as (keyof T & string)[];
  const tem = (k: string) => (chaves as string[]).includes(k);
  return {
    padrao,
    chaves,
    tem,
    ler(raw) {
      const base = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
      const c = { ...padrao } as Record<string, unknown>;
      for (const k of chaves) if (k in base && validadores[k](base[k])) c[k] = base[k];
      const cfg = c as unknown as T;
      return coerencia && coerencia.erro(cfg) ? coerencia.corrigir(cfg) : cfg;
    },
    aplicar(atual, parcial) {
      const novo = { ...atual } as Record<string, unknown>;
      for (const [k, v] of Object.entries(parcial)) {
        if (!tem(k)) return { ok: false, erro: `${k}: campo desconhecido.` };
        if (!validadores[k as keyof T](v)) return { ok: false, erro: `${k}: valor fora do permitido.` };
        novo[k] = v;
      }
      const cfg = novo as unknown as T;
      const e = coerencia?.erro(cfg);
      return e ? { ok: false, erro: e } : { ok: true, config: cfg };
    },
  };
}
