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
 * à API. Telefone sem DDI ganha o 55. Sem telefone válido = `null` (o botão não aparece).
 */
export function linkWhatsappAcesso(p: { telefone: string; nome: string; email: string; senha: string; endereco: string }): string | null {
  let d = p.telefone.replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 13) return null;
  const primeiro = p.nome.trim().split(/\s+/)[0] ?? '';
  const msg = `Olá, ${primeiro}! Seu acesso ao Praça:\n\nEndereço: ${p.endereco}\nUsuário: ${p.email}\nSenha provisória: ${p.senha}\n\nNo primeiro acesso você vai criar uma nova senha.`;
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
}

export const TIPOS_CONTA: [string, string][] = [
  ['corrente', 'Conta corrente'],
  ['poupanca', 'Poupança'],
  ['pagamento', 'Conta de pagamento'],
];
