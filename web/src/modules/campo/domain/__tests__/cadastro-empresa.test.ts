import { describe, expect, it } from 'vitest';
import {
  FORM_VAZIO,
  formInicial,
  manterClientId,
  mensagemDoErro,
  montarPayload,
  situacao,
  telefoneNacional,
  textoParaCompartilhar,
  urlWhatsapp,
  validadeDoLink,
  validarForm,
  type SignupView,
} from '../cadastro-empresa';

const CID = '11111111-1111-4111-8111-111111111111';
const form = { ...FORM_VAZIO, company_name: 'Padaria Bom Pão', contact_name: 'Marcos', phone: '(11) 98765-4321' };
const sv = (over: Partial<SignupView>): SignupView => ({
  id: 'i', client_id: CID, visit_ref: null, lead_id: null, status: 'pending', company_name: 'P', phone_masked: '', email_masked: null,
  link_issued_at: null, link_expires_at: null, reissue_count: 0, activated_at: null, last_error_code: null, last_error: null,
  created_at: '2026-10-20T10:00:00.000Z', created: false, setup_link: null, ...over,
});

describe('telefoneNacional', () => {
  it('aceita máscara e +55; recusa curto', () => {
    expect(telefoneNacional('(11) 98765-4321')).toBe('11987654321');
    expect(telefoneNacional('+55 11 3333-4444')).toBe('1133334444');
    expect(telefoneNacional('1234')).toBeNull();
  });
});

describe('formInicial', () => {
  it('usa o pré-preenchimento do lead e cai no nome do local', () => {
    const f = formInicial({ company_name: ' ', contact_name: 'Zé', phone: '1133334444', cnpj: '', street: 'Rua A', city: 'SP', uf: 'SP' }, 'Padaria X');
    expect(f).toMatchObject({ company_name: 'Padaria X', contact_name: 'Zé', phone: '1133334444', city: 'SP' });
    expect(formInicial(null, 'Bar Y')).toEqual({ ...FORM_VAZIO, company_name: 'Bar Y' });
  });
});

describe('validarForm', () => {
  it('formulário completo não tem erro', () => expect(validarForm(form)).toEqual({}));
  it('aponta o que falta, com texto para pessoa', () => {
    const e = validarForm({ ...FORM_VAZIO, phone: '123', email: 'x', cnpj: '123' });
    expect(Object.keys(e).sort()).toEqual(['cnpj', 'company_name', 'contact_name', 'email', 'phone']);
    expect(e.phone).toMatch(/DDD/);
  });
  it('CNPJ vazio e e-mail vazio são opcionais', () => expect(validarForm({ ...form, cnpj: '', email: '  ' })).toEqual({}));
});

describe('montarPayload', () => {
  it('limpa, tira máscara e omite o vazio', () => {
    expect(montarPayload({ ...form, company_name: ' Padaria ', cnpj: '12.345.678/0001-90', uf: 'sp', city: 'São Paulo' }, CID)).toEqual({
      client_id: CID,
      company_name: 'Padaria',
      contact_name: 'Marcos',
      phone: '11987654321',
      cnpj: '12345678000190',
      address: { city: 'São Paulo', uf: 'SP' },
    });
    const minimo = montarPayload(form, CID);
    expect(minimo).not.toHaveProperty('email');
    expect(minimo).not.toHaveProperty('address');
  });
  it('nunca leva link nem senha', () => {
    expect(JSON.stringify(montarPayload(form, CID))).not.toMatch(/link|senha|password|token/i);
  });
});

describe('compartilhar', () => {
  const link = 'https://freela.example/primeiro-acesso?t=abc';
  it('texto com o link na última linha', () => {
    const t = textoParaCompartilhar('Padaria', link);
    expect(t.split('\n').at(-1)).toBe(link);
    expect(t).toContain('Padaria');
  });
  it('wa.me com o número do dono quando válido', () => {
    const u = urlWhatsapp('oi', '(11) 98765-4321');
    expect(u).toBe('https://wa.me/5511987654321?text=oi');
  });
  it('sem número válido o consultor escolhe o contato', () => {
    expect(urlWhatsapp('a b&c', null)).toBe('https://wa.me/?text=a%20b%26c');
    expect(urlWhatsapp('x', '12')).toBe('https://wa.me/?text=x');
  });
  it('o link vai codificado inteiro na URL', () => {
    const u = urlWhatsapp(textoParaCompartilhar('P', link));
    expect(decodeURIComponent(u.split('text=')[1]!)).toContain(link);
  });
});

describe('validadeDoLink', () => {
  const agora = Date.parse('2026-10-20T12:00:00.000Z');
  it('mostra data e hora de Brasília', () => {
    expect(validadeDoLink('2026-10-21T18:00:00.000Z', agora)).toBe('Válido até 21/10 às 15:00.');
  });
  it('vencido e sem data', () => {
    expect(validadeDoLink('2026-10-20T11:00:00.000Z', agora)).toMatch(/venceu/);
    expect(validadeDoLink(null, agora)).toMatch(/validade/);
    expect(validadeDoLink('lixo', agora)).toMatch(/validade/);
  });
});

describe('situacao', () => {
  it('a fila local vem antes do servidor', () => {
    expect(situacao(null, true).tipo).toBe('na_fila');
    expect(situacao(sv({ status: 'activated' }), true).tipo).toBe('na_fila');
  });
  it('estados do servidor', () => {
    expect(situacao(null, false).tipo).toBe('novo');
    expect(situacao(sv({ status: 'pending' }), false).tipo).toBe('aguardando_dono');
    expect(situacao(sv({ status: 'activated' }), false).tipo).toBe('ativado');
    expect(situacao(sv({ status: 'failed', last_error: 'CNPJ inválido.' }), false)).toEqual({ tipo: 'tentar_de_novo', mensagem: 'CNPJ inválido.' });
    expect(situacao(sv({ status: 'creating' }), false).tipo).toBe('tentar_de_novo');
  });
  it('já cadastrada: distingue vínculo com o consultor', () => {
    const r = situacao(sv({ status: 'already_registered', last_error_code: 'PHONE_ALREADY_REGISTERED_BY_YOU' }), false);
    expect(r).toMatchObject({ tipo: 'ja_cadastrada', vinculada: true });
    expect(situacao(sv({ status: 'already_registered', last_error_code: 'PHONE_ALREADY_REGISTERED' }), false)).toMatchObject({ vinculada: false });
  });
});

describe('manterClientId', () => {
  it('mantém quando o Freela pode ter criado a conta', () => {
    for (const s of [undefined, 0, 408, 429, 500, 502, 503]) expect(manterClientId(s)).toBe(true);
  });
  it('troca só em recusa definitiva', () => {
    for (const s of [400, 403, 404, 409, 422]) expect(manterClientId(s)).toBe(false);
  });
});

describe('mensagemDoErro', () => {
  it('textos próprios e fallback', () => {
    expect(mensagemDoErro('PHONE_ALREADY_REGISTERED_BY_YOU', 'x')).toMatch(/por você/);
    expect(mensagemDoErro('DAILY_REGISTRATION_LIMIT', 'x')).toMatch(/amanhã/);
    expect(mensagemDoErro('OUTRO', 'a mensagem da API')).toBe('a mensagem da API');
  });
});
