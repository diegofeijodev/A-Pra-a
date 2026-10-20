/**
 * Cadastro assistido da empresa no Freela (F6, contrato §26) — regras PURAS.
 * Nada aqui toca banco, rede ou log; o serviço usa estas funções para montar o
 * corpo enviado ao Freela, mascarar o que fica guardado e traduzir recusas.
 */
import { toE164BR } from '../common/phone/phone';

export const somenteDigitos = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');

/** `(11) 9****-4321` — DDD + últimos 4. O telefone inteiro NUNCA fica no banco do Praça. */
export function mascararTelefone(tel: string | null | undefined): string {
  let d = somenteDigitos(tel);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return '****';
  const ddd = d.slice(0, 2);
  const fim = d.slice(-4);
  return d.length === 11 ? `(${ddd}) ${d[2]}****-${fim}` : `(${ddd}) ****-${fim}`;
}

/** `m***@dominio.com`; sem e-mail ou sem `@` = null. */
export function mascararEmail(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase();
  const i = e.indexOf('@');
  if (i < 1 || i === e.length - 1) return null;
  return `${e[0]}***${e.slice(i)}`;
}

/** Tira URL, token Bearer e blocos longos de caracteres de token; corta em 300. Vai para `last_error` e para a resposta. */
export function sanitizarErroDoFreela(msg: string): string {
  return msg
    .replace(/https?:\/\/\S+/gi, '[link removido]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [removido]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[removido]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export interface EntradaCadastro {
  client_id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email?: string | undefined;
  cnpj?: string | undefined;
  corporate_reason?: string | undefined;
  address?:
    | {
        cep?: string | undefined;
        street?: string | undefined;
        number?: string | undefined;
        complement?: string | undefined;
        neighborhood?: string | undefined;
        city?: string | undefined;
        uf?: string | undefined;
      }
    | undefined;
}

export interface CorpoFreela {
  clientId: string;
  persona: 'contractor';
  accessMode: 'setup_link';
  companyName: string;
  corporateReason?: string;
  contactName: string;
  phone: string;
  email?: string;
  cnpj?: string;
  address: Record<string, string>;
  lat?: number;
  lng?: number;
}

const vazioComoAusente = (s: string | undefined): string | undefined => s?.trim() || undefined;

/**
 * Corpo de `POST …/registrations`. Só DTO + cobertura da praça + check-in da visita:
 * o Freela responde 422 a um reenvio com corpo diferente do original, então nada é
 * relido do lead. `null` = faltou telefone válido ou cidade/UF.
 */
export function corpoDoFreela(
  dto: EntradaCadastro,
  praca: { cidade: string | null; uf: string | null },
  checkin: { lat: number; lng: number } | null,
): CorpoFreela | null {
  const phone = toE164BR(dto.phone);
  const a = dto.address ?? {};
  const city = vazioComoAusente(a.city) ?? vazioComoAusente(praca.cidade ?? undefined);
  const uf = (vazioComoAusente(a.uf) ?? vazioComoAusente(praca.uf ?? undefined))?.toUpperCase();
  if (!phone || !city || !uf) return null;

  const address: Record<string, string> = { city, uf };
  for (const k of ['cep', 'street', 'number', 'complement', 'neighborhood'] as const) {
    const v = vazioComoAusente(a[k]);
    if (v) address[k] = v;
  }
  const email = vazioComoAusente(dto.email);
  const cnpj = somenteDigitos(dto.cnpj);
  const razao = vazioComoAusente(dto.corporate_reason);
  return {
    clientId: dto.client_id,
    persona: 'contractor',
    accessMode: 'setup_link',
    companyName: dto.company_name.trim(),
    ...(razao ? { corporateReason: razao } : {}),
    contactName: dto.contact_name.trim(),
    phone,
    ...(email ? { email } : {}),
    ...(cnpj ? { cnpj } : {}),
    address,
    ...(checkin ? { lat: checkin.lat, lng: checkin.lng } : {}),
  };
}

export type StatusLocal = 'failed' | 'already_registered';

export interface TraducaoErro {
  status: number;
  code: string;
  message: string;
  /** Estado da linha local depois da recusa. */
  local: StatusLocal;
}

const DUPLICIDADE: Record<string, string> = {
  PHONE_ALREADY_REGISTERED: 'Este telefone já tem conta no Freela.',
  EMAIL_ALREADY_REGISTERED: 'Este e-mail já tem conta no Freela.',
  CNPJ_ALREADY_REGISTERED: 'Este CNPJ já tem conta no Freela.',
};

/**
 * Recusa do Freela → resposta do Praça (contrato §26.6). O filtro global só leva
 * `{code,message}`, então "já vinculado a você" vira um código próprio (`…_BY_YOU`).
 * `null` = não é um caso conhecido (o serviço relança como `FREELA_ERROR`).
 */
export function erroDoFreela(
  e: { freelaStatus: number; code?: string | undefined; alreadyLinkedToThisConsultant?: boolean | undefined },
  operacao: 'criar' | 'reemitir',
): TraducaoErro | null {
  const { freelaStatus: s, code } = e;
  const f = (status: number, c: string, message: string, local: StatusLocal = 'failed'): TraducaoErro => ({
    status,
    code: c,
    message,
    local,
  });
  const indisponivel = f(
    503,
    'SIGNUP_UNAVAILABLE',
    'O cadastro assistido ainda não está disponível no Freela. Use o QR de cadastro do seu código.',
  );

  if (s === 404 && !code) return indisponivel;
  if (code === 'ACCESS_MODE_NOT_AVAILABLE') return indisponivel;
  if (code === 'CONSULTANT_NOT_FOUND')
    return f(409, 'FREELA_CODE_PENDING', 'Seu código no Freela ainda não está ativo. Avise a equipe.');
  if (operacao === 'reemitir') {
    if (code === 'ALREADY_ACTIVATED')
      return f(409, 'ALREADY_ACTIVATED', 'O dono já definiu a senha. Não é preciso gerar outro link.');
    if (code === 'REGISTRATION_NOT_FOUND')
      return f(409, 'SIGNUP_NOT_FOUND_IN_FREELA', 'Este cadastro não foi encontrado no Freela. Avise a equipe.');
    if (code === 'RESET_LIMIT')
      return f(429, 'RESET_LIMIT', 'Muitos links gerados para esta empresa hoje. Tente de novo amanhã.');
  }
  if (s === 409 && code && DUPLICIDADE[code]) {
    const meu = e.alreadyLinkedToThisConsultant === true;
    return f(
      409,
      meu ? `${code}_BY_YOU` : code,
      meu ? `${DUPLICIDADE[code]} Ela já foi cadastrada por você.` : DUPLICIDADE[code],
      'already_registered',
    );
  }
  if (code === 'DAILY_REGISTRATION_LIMIT')
    return f(429, code, 'Limite de cadastros do dia atingido. Tente de novo amanhã.');
  if (code === 'IDEMPOTENCY_KEY_REUSED')
    return f(422, code, 'Este cadastro já foi enviado com outros dados. Comece um novo.');
  if (s === 400 && code) return f(400, code, code === 'INVALID_CNPJ' ? 'CNPJ inválido.' : 'Dados recusados pelo Freela.');
  return null;
}
