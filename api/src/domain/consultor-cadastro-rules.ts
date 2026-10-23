/**
 * Lote E, L9b (contrato §41.3) — endereço e banco do consultor. Regras PURAS. Dado pessoal: o erro diz o CAMPO, nunca o valor,
 * e nada daqui vai para log. A conta bancária não entra no pagamento (o Pix do §29 continua fotografado no fechamento).
 */
export const CAMPOS_ENDERECO = [
  'address_cep',
  'address_street',
  'address_number',
  'address_complement',
  'address_district',
  'address_city',
  'address_state',
] as const;
export const CAMPOS_BANCO = ['bank_name', 'bank_branch', 'bank_account', 'bank_account_type'] as const;
export const CAMPOS_CADASTRO = [...CAMPOS_ENDERECO, ...CAMPOS_BANCO] as const;
export type CampoCadastro = (typeof CAMPOS_CADASTRO)[number];
export const TIPOS_CONTA = ['corrente', 'poupanca', 'pagamento'] as const;

const TETO: Record<Exclude<CampoCadastro, 'address_cep' | 'address_state' | 'bank_branch' | 'bank_account' | 'bank_account_type'>, number> = {
  address_street: 120,
  address_number: 20,
  address_complement: 60,
  address_district: 80,
  address_city: 80,
  bank_name: 80,
};

/** Só as chaves PRESENTES: ausente = mantém; `null`/`""` = limpa. */
export function normalizarCadastro(
  entrada: Partial<Record<CampoCadastro, unknown>>,
): { ok: true; dados: Partial<Record<CampoCadastro, string | null>> } | { ok: false; erro: string } {
  const dados: Partial<Record<CampoCadastro, string | null>> = {};
  for (const k of CAMPOS_CADASTRO) {
    if (!(k in entrada) || entrada[k] === undefined) continue;
    const bruto = entrada[k];
    if (bruto === null) {
      dados[k] = null;
      continue;
    }
    if (typeof bruto !== 'string') return { ok: false, erro: `${k}: texto ou vazio.` };
    const v = bruto.trim();
    if (v === '') {
      dados[k] = null;
      continue;
    }
    if (k === 'address_cep') {
      const d = v.replace(/\D/g, '');
      if (d.length !== 8 || !/^[\d\s.-]+$/.test(v)) return { ok: false, erro: 'address_cep: CEP com 8 dígitos.' };
      dados[k] = d;
    } else if (k === 'address_state') {
      if (!/^[a-zA-Z]{2}$/.test(v)) return { ok: false, erro: 'address_state: a sigla do estado, com 2 letras.' };
      dados[k] = v.toUpperCase();
    } else if (k === 'bank_branch' || k === 'bank_account') {
      const teto = k === 'bank_branch' ? 10 : 20;
      if (v.length > teto || !/^[0-9xX-]+$/.test(v)) return { ok: false, erro: `${k}: até ${teto} caracteres, só números, "-" e "x".` };
      dados[k] = v.toLowerCase();
    } else if (k === 'bank_account_type') {
      if (!(TIPOS_CONTA as readonly string[]).includes(v)) return { ok: false, erro: 'bank_account_type: corrente, poupanca ou pagamento.' };
      dados[k] = v;
    } else {
      if (v.length > TETO[k]) return { ok: false, erro: `${k}: até ${TETO[k]} caracteres.` };
      dados[k] = v;
    }
  }
  return { ok: true, dados };
}

/** Conta para quem não é admin: `•••` + os 3 últimos. */
export function mascararConta(conta: string | null | undefined): string | null {
  if (!conta) return null;
  return conta.length <= 3 ? '•••' : `•••${conta.slice(-3)}`;
}

/** Pix para o gestor (§42.3: não vê nem mexe em Pix): `•••` + os 4 últimos. */
export function mascararPix(chave: string): string {
  return chave.length <= 4 ? '•••' : `•••${chave.slice(-4)}`;
}
