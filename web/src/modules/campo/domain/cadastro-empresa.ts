/**
 * Cadastro assistido da empresa no Freela — lógica PURA da tela (contrato §26).
 * Nada daqui toca rede, relógio global ou armazenamento. O link de primeiro acesso passa por estas
 * funções só como texto para compartilhar; ninguém o guarda (§26.0).
 */

export interface SignupView {
  id: string;
  client_id: string;
  visit_ref: string | null;
  lead_id: string | null;
  status: 'creating' | 'pending' | 'activated' | 'already_registered' | 'failed';
  company_name: string;
  phone_masked: string;
  email_masked: string | null;
  link_issued_at: string | null;
  link_expires_at: string | null;
  reissue_count: number;
  activated_at: string | null;
  last_error_code: string | null;
  last_error: string | null;
  created_at: string;
  created: boolean;
  /** Só nas respostas de criar/reemitir. */
  setup_link: string | null;
}

export interface Prefill {
  company_name: string;
  contact_name: string;
  phone: string;
  cnpj: string;
  street: string;
  city: string;
  uf: string;
}

export interface SignupDaVisita {
  signup: SignupView | null;
  prefill: Prefill;
}

/** Corpo de `POST …/company-signup` (também é o que a fila offline guarda — sem link, sem senha). */
export interface SignupPayload {
  client_id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email?: string;
  cnpj?: string;
  address?: { street?: string; city?: string; uf?: string };
}

export interface FormCadastro {
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  cnpj: string;
  street: string;
  city: string;
  uf: string;
}

export const FORM_VAZIO: FormCadastro = {
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  cnpj: '',
  street: '',
  city: '',
  uf: '',
};

const digitos = (s: string): string => s.replace(/\D/g, '');

/** Telefone nacional (10 ou 11 dígitos), aceitando +55 e máscara. */
export function telefoneNacional(s: string): string | null {
  let d = digitos(s);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** Formulário inicial: o que o servidor sabe do lead, com o nome do local como último recurso. */
export function formInicial(prefill: Prefill | null, nomeLocal: string): FormCadastro {
  return {
    ...FORM_VAZIO,
    ...(prefill ?? {}),
    company_name: prefill?.company_name?.trim() || nomeLocal,
    cnpj: prefill?.cnpj ?? '',
  };
}

export type ErrosForm = Partial<Record<'company_name' | 'contact_name' | 'phone' | 'email' | 'cnpj', string>>;

export function validarForm(f: FormCadastro): ErrosForm {
  const e: ErrosForm = {};
  if (!f.company_name.trim()) e.company_name = 'Informe o nome da empresa.';
  if (!f.contact_name.trim()) e.contact_name = 'Informe o nome do responsável.';
  if (!telefoneNacional(f.phone)) e.phone = 'Informe o WhatsApp com DDD.';
  const email = f.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'E-mail inválido.';
  const cnpj = digitos(f.cnpj);
  if (cnpj && cnpj.length !== 14) e.cnpj = 'O CNPJ tem 14 números.';
  return e;
}

export function montarPayload(f: FormCadastro, clientId: string): SignupPayload {
  const email = f.email.trim();
  const cnpj = digitos(f.cnpj);
  const street = f.street.trim();
  const city = f.city.trim();
  const uf = f.uf.trim().toUpperCase();
  const address = { ...(street ? { street } : {}), ...(city ? { city } : {}), ...(uf ? { uf } : {}) };
  return {
    client_id: clientId,
    company_name: f.company_name.trim(),
    contact_name: f.contact_name.trim(),
    phone: telefoneNacional(f.phone) ?? f.phone.trim(),
    ...(email ? { email } : {}),
    ...(cnpj ? { cnpj } : {}),
    ...(Object.keys(address).length ? { address } : {}),
  };
}

/** Texto que o consultor manda pelo WhatsApp. O link vai sozinho na última linha. */
export function textoParaCompartilhar(empresa: string, link: string): string {
  return `Olá! Aqui está o seu acesso ao Freela para ${empresa}. Abra o link no celular e escolha a sua senha:\n${link}`;
}

/** `https://wa.me/55…?text=` (com o número do dono quando é válido) ou `https://wa.me/?text=` (o consultor escolhe o contato). */
export function urlWhatsapp(texto: string, telefone?: string | null): string {
  const nacional = telefone ? telefoneNacional(telefone) : null;
  return `https://wa.me/${nacional ? `55${nacional}` : ''}?text=${encodeURIComponent(texto)}`;
}

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** "válido até 21/10 às 15:00" (Brasília) ou "vencido". Sem data: texto neutro. */
export function validadeDoLink(expiraEm: string | null, agora: number): string {
  if (!expiraEm) return 'Confira a validade ao abrir o link.';
  const t = Date.parse(expiraEm);
  if (!Number.isFinite(t)) return 'Confira a validade ao abrir o link.';
  if (t <= agora) return 'Este link venceu. Gere um novo.';
  const [data, hora] = DATA_HORA.format(new Date(t)).split(', ');
  return `Válido até ${data} às ${hora}.`;
}

export type SituacaoCadastro =
  | { tipo: 'na_fila' }
  | { tipo: 'aguardando_dono' }
  | { tipo: 'ativado' }
  | { tipo: 'ja_cadastrada'; vinculada: boolean; mensagem: string }
  | { tipo: 'tentar_de_novo'; mensagem: string | null }
  | { tipo: 'novo' };

/** O que a tela mostra, na ordem: fila local > estado do servidor. */
export function situacao(signup: SignupView | null, naFila: boolean): SituacaoCadastro {
  if (naFila) return { tipo: 'na_fila' };
  if (!signup) return { tipo: 'novo' };
  switch (signup.status) {
    case 'activated':
      return { tipo: 'ativado' };
    case 'pending':
      return { tipo: 'aguardando_dono' };
    case 'already_registered':
      return {
        tipo: 'ja_cadastrada',
        vinculada: signup.last_error_code?.endsWith('_BY_YOU') ?? false,
        mensagem: signup.last_error ?? 'Esta empresa já tem conta no Freela.',
      };
    default:
      return { tipo: 'tentar_de_novo', mensagem: signup.last_error };
  }
}

export const ROTULO_SITUACAO: Record<SituacaoCadastro['tipo'], string> = {
  na_fila: 'Guardado no celular',
  aguardando_dono: 'Aguardando o dono definir a senha',
  ativado: 'Ativado: o dono já definiu a senha',
  ja_cadastrada: 'Empresa já cadastrada',
  tentar_de_novo: 'Não foi concluído',
  novo: 'Ainda não cadastrada',
};

/** Erros de regra da API com texto próprio para quem está na calçada. */
export function mensagemDoErro(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'PHONE_ALREADY_REGISTERED_BY_YOU':
    case 'EMAIL_ALREADY_REGISTERED_BY_YOU':
    case 'CNPJ_ALREADY_REGISTERED_BY_YOU':
      return 'Esta empresa já foi cadastrada por você. Peça ao dono para entrar com o telefone dele.';
    case 'SIGNUP_UNAVAILABLE':
      return 'O cadastro assistido ainda não está disponível. Use o QR code do seu código.';
    case 'FREELA_CODE_PENDING':
      return 'Seu código no Freela ainda não está ativo. Avise a equipe.';
    case 'DAILY_REGISTRATION_LIMIT':
      return 'Você atingiu o limite de cadastros de hoje. Tente de novo amanhã.';
    case 'RESET_LIMIT':
      return 'Muitos links gerados para esta empresa hoje. Tente de novo amanhã.';
    default:
      return fallback;
  }
}
