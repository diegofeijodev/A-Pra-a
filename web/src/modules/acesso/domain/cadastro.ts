/** Lote E §41.3 (cadastro do consultor) e §41.4 (e-mail de quem atendeu): validações da tela, iguais às do servidor. */

/** `local@dominio.tld`, sem espaço, até 120 (o servidor confere de novo e grava em minúsculas). */
export function emailContatoValido(bruto: string): boolean {
  const e = bruto.trim().toLowerCase();
  if (e === '') return true;
  return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(e) && !/\.\./.test(e);
}

/** `m***@dominio.com` (como o servidor). */
export function mascararEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const i = e.indexOf('@');
  return i < 1 ? null : `${e[0]}***${e.slice(i)}`;
}

/**
 * "Enviar pelo WhatsApp" da senha provisória (Lovable `CredenciaisDialog`): o link é montado NO NAVEGADOR — a senha não volta
 * à API. Telefone sem DDI ganha o 55. Sem telefone válido = `null` (o botão não aparece). `trocaObrigatoria: false` é a equipe
 * (Usuários, D2): ela não é obrigada a trocar no 1º acesso, então a mensagem não promete isso.
 */
export function linkWhatsappAcesso(p: DadosAcesso & { telefone: string }): string | null {
  let d = p.telefone.replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 13) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(mensagemAcesso(p))}`;
}

export interface DadosAcesso {
  nome: string;
  email: string;
  senha: string;
  endereco: string;
  trocaObrigatoria?: boolean;
}

/** O texto do acesso (o mesmo no "Copiar" e no WhatsApp). */
export function mensagemAcesso(p: DadosAcesso): string {
  const primeiro = p.nome.trim().split(/\s+/)[0] ?? '';
  const fim = p.trocaObrigatoria === false ? 'Troque a senha quando entrar, em "Trocar senha".' : 'No primeiro acesso você vai criar uma nova senha.';
  return `Olá, ${primeiro}! Seu acesso ao Praça:\n\nEndereço: ${p.endereco}\nUsuário: ${p.email}\nSenha provisória: ${p.senha}\n\n${fim}`;
}

// ── senha provisória da equipe (redesenho E5.8, Usuários) ─────────────────────

const MAIUSCULAS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const MINUSCULAS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITOS = '23456789';
/** O mesmo alfabeto do servidor (`api/src/domain/senha-rules.ts`): sem os ambíguos (0/O/o, 1/I/l/i), para ditar ou copiar à mão. */
export const ALFABETO_PROVISORIA = `${MAIUSCULAS}${MINUSCULAS}${DIGITOS}`;
/** A regra mais forte que a configuração permite (§41.2): 12 caracteres, maiúscula e número. */
const TAMANHO_PROVISORIA = 12;

/**
 * Inteiro em `[0, max)` do `crypto` do navegador (nunca `Math.random`), por rejeição: descarta o resto que daria viés de módulo.
 */
export function inteiroAleatorio(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new Error('inteiroAleatorio: max inválido');
  const limite = Math.floor(2 ** 32 / max) * max;
  const caixa = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(caixa);
    const v = caixa[0]!;
    if (v < limite) return v % max;
  }
}

/**
 * Senha provisória que o admin gera para alguém da equipe (Usuários: "Novo usuário" e "Redefinir senha"), mostrada uma vez e
 * gravada pelo `POST /v1/users` / `PUT /v1/users/:id/password` de hoje. A MESMA regra do servidor: 12 caracteres, com pelo menos
 * 1 maiúscula, 1 minúscula e 1 número em posições sorteadas; o resto, do alfabeto inteiro. Cumpre a regra mais forte com ou sem a flag.
 */
export function gerarSenhaProvisoria(sorteio: (max: number) => number = inteiroAleatorio): string {
  const n = TAMANHO_PROVISORIA;
  const s: string[] = [];
  for (let i = 0; i < n; i += 1) s.push(ALFABETO_PROVISORIA[sorteio(ALFABETO_PROVISORIA.length)]!);
  const livres = Array.from({ length: n }, (_, i) => i);
  for (const classe of [MAIUSCULAS, MINUSCULAS, DIGITOS]) {
    const pos = livres.splice(sorteio(livres.length), 1)[0]!;
    s[pos] = classe[sorteio(classe.length)]!;
  }
  return s.join('');
}

export const TIPOS_CONTA: [string, string][] = [
  ['corrente', 'Conta corrente'],
  ['poupanca', 'Poupança'],
  ['pagamento', 'Conta de pagamento'],
];
