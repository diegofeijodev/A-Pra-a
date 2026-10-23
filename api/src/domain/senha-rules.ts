/**
 * Lote E, L9a (contrato §41.2) — regra de senha NOVA e a senha provisória. Regras PURAS (sem Prisma nem HTTP).
 *
 * Origem: Lovable `users.functions.ts` (`changeOwnPassword`: 8–72, `/[A-Z]/`, `/[0-9]/`). Aqui a regra é configurável
 * (`app_settings.password_policy`, nulo = a da Lovable) e vale SÓ para senha nova: nunca no login nem na senha atual.
 */
import { randomInt } from 'crypto';

export interface PoliticaSenha {
  min_length: number;
  require_upper: boolean;
  require_digit: boolean;
}

/** Faixa do `min_length` configurável; o máximo é sempre 72 (o limite do bcrypt). */
export const LIMITES_POLITICA = Object.freeze({ min: 8, max: 12, max_length: 72 });

/** A da Lovable — o padrão com a flag ligada e nada gravado. */
export const POLITICA_LOVABLE: PoliticaSenha = Object.freeze({ min_length: 8, require_upper: true, require_digit: true });

/** A mais forte que a configuração permite: a senha provisória sempre a cumpre. */
export const POLITICA_MAIS_FORTE: PoliticaSenha = Object.freeze({ min_length: LIMITES_POLITICA.max, require_upper: true, require_digit: true });

export type FalhaSenha = 'min_length' | 'max_length' | 'upper' | 'digit';

const minValido = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= LIMITES_POLITICA.min && (v as number) <= LIMITES_POLITICA.max;
const bool = (v: unknown): v is boolean => typeof v === 'boolean';

/** O que está gravado (JSON pode ter sido editado à mão): chave inválida cai no padrão da chave. */
export function lerPolitica(raw: unknown): PoliticaSenha & { is_default: boolean } {
  if (raw == null || typeof raw !== 'object') return { ...POLITICA_LOVABLE, is_default: true };
  const o = raw as Record<string, unknown>;
  return {
    min_length: minValido(o.min_length) ? o.min_length : POLITICA_LOVABLE.min_length,
    require_upper: bool(o.require_upper) ? o.require_upper : POLITICA_LOVABLE.require_upper,
    require_digit: bool(o.require_digit) ? o.require_digit : POLITICA_LOVABLE.require_digit,
    is_default: false,
  };
}

/** PUT parcial (`null` = ausente). */
export function aplicarPolitica(
  atual: PoliticaSenha,
  parcial: { min_length?: unknown; require_upper?: unknown; require_digit?: unknown },
): { ok: true; politica: PoliticaSenha } | { ok: false; erro: string } {
  const novo: PoliticaSenha = { min_length: atual.min_length, require_upper: atual.require_upper, require_digit: atual.require_digit };
  if (parcial.min_length != null) {
    if (!minValido(parcial.min_length)) return { ok: false, erro: `min_length: inteiro de ${LIMITES_POLITICA.min} a ${LIMITES_POLITICA.max}.` };
    novo.min_length = parcial.min_length;
  }
  for (const k of ['require_upper', 'require_digit'] as const) {
    if (parcial[k] == null) continue;
    if (!bool(parcial[k])) return { ok: false, erro: `${k}: verdadeiro ou falso.` };
    novo[k] = parcial[k] as boolean;
  }
  return { ok: true, politica: novo };
}

/** As regras na ordem da tela (marcadas ao vivo no formulário). */
export function regrasDaPolitica(p: PoliticaSenha): { key: 'min_length' | 'upper' | 'digit'; label: string }[] {
  const r: { key: 'min_length' | 'upper' | 'digit'; label: string }[] = [{ key: 'min_length', label: `${p.min_length} caracteres ou mais` }];
  if (p.require_upper) r.push({ key: 'upper', label: 'Uma letra maiúscula' });
  if (p.require_digit) r.push({ key: 'digit', label: 'Um número' });
  return r;
}

/** O que falta na senha nova, na ordem da mensagem (lista vazia = cumpre). */
export function validarSenhaNova(senha: string, p: PoliticaSenha): FalhaSenha[] {
  const f: FalhaSenha[] = [];
  const n = [...senha].length;
  if (n > LIMITES_POLITICA.max_length) return ['max_length'];
  if (n < p.min_length) f.push('min_length');
  // Maiúscula de qualquer alfabeto (É conta): letra que muda ao baixar a caixa.
  if (p.require_upper && ![...senha].some((ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase())) f.push('upper');
  if (p.require_digit && !/[0-9]/.test(senha)) f.push('digit');
  return f;
}

/** Texto do `400 WEAK_PASSWORD` — nunca repete a senha. */
export function mensagemSenhaFraca(falhas: FalhaSenha[], p: PoliticaSenha): string {
  const partes = falhas.map((x) =>
    x === 'min_length' ? `${p.min_length} caracteres ou mais` : x === 'max_length' ? `no máximo ${LIMITES_POLITICA.max_length} caracteres` : x === 'upper' ? '1 letra maiúscula' : '1 número',
  );
  return `A senha precisa de: ${partes.join(', ')}.`;
}

// ── senha provisória ─────────────────────────────────────────

const MAIUSCULAS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const MINUSCULAS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITOS = '23456789';
/** Sem os ambíguos (0/O/o, 1/I/l/i), para ditar ou copiar à mão. */
export const ALFABETO_PROVISORIA = `${MAIUSCULAS}${MINUSCULAS}${DIGITOS}`;

/**
 * 12 caracteres com pelo menos 1 maiúscula, 1 minúscula e 1 número — cumpre a política mais forte permitida (§41.2), com ou
 * sem a flag. As três classes obrigatórias vão em posições sorteadas; o resto, do alfabeto inteiro.
 */
export function gerarSenhaProvisoria(sorteio: (max: number) => number = randomInt): string {
  const n = POLITICA_MAIS_FORTE.min_length;
  const s: string[] = [];
  for (let i = 0; i < n; i += 1) s.push(ALFABETO_PROVISORIA[sorteio(ALFABETO_PROVISORIA.length)]!);
  const livres = Array.from({ length: n }, (_, i) => i);
  for (const classe of [MAIUSCULAS, MINUSCULAS, DIGITOS]) {
    const k = sorteio(livres.length);
    const pos = livres.splice(k, 1)[0]!;
    s[pos] = classe[sorteio(classe.length)]!;
  }
  return s.join('');
}
