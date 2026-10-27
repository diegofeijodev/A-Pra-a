import * as bcrypt from 'bcryptjs';

/**
 * Hash bcrypt de uma senha aleatória jogada fora (ninguém a conhece), com o MESMO custo (10) dos hashes de verdade
 * (`bcrypt.hash(senha, 10)` em pessoas, consultores e seed). Contrato §2.
 *
 * Sem ele, o login de um e-mail que não existe voltava antes do `bcrypt.compare` — mais rápido que o de senha errada, um oráculo de
 * tempo para descobrir quem tem conta. A entrada única do web (redesenho E3) ainda dobra as tentativas (equipe e, no 401, consultor).
 */
export const HASH_FALSO = '$2b$10$K2cvnpDqsyfFS.Po1uo2EuZpD5bOYf7UF/8N/FLhyhmi1Ky2thX5m';

/** Confere a senha com o hash da conta, ou com o hash fixo quando a conta não existe: o tempo é o mesmo nos dois casos. */
export async function senhaConfere(senha: string, hash: string | null | undefined): Promise<boolean> {
  const confere = await bcrypt.compare(senha, hash ?? HASH_FALSO);
  return hash != null && confere;
}
