import {
  corpoDoFreela,
  erroDoFreela,
  mascararEmail,
  mascararTelefone,
  sanitizarErroDoFreela,
  somenteDigitos,
} from '../company-signup-rules';

describe('mascararTelefone', () => {
  it('mostra o DDD e os 4 últimos dígitos, em qualquer formato de entrada', () => {
    expect(mascararTelefone('+5511987654321')).toBe('(11) 9****-4321');
    expect(mascararTelefone('(11) 98765-4321')).toBe('(11) 9****-4321');
    expect(mascararTelefone('1133334444')).toBe('(11) ****-4444');
  });
  it('lixo vira máscara total', () => {
    expect(mascararTelefone('')).toBe('****');
    expect(mascararTelefone('123')).toBe('****');
  });
});

describe('mascararEmail', () => {
  it('guarda a 1ª letra e o domínio', () => {
    expect(mascararEmail('Marcos@Padaria.com.br')).toBe('m***@padaria.com.br');
  });
  it('sem e-mail ou inválido = null', () => {
    expect(mascararEmail(undefined)).toBeNull();
    expect(mascararEmail('  ')).toBeNull();
    expect(mascararEmail('sem-arroba')).toBeNull();
  });
});

describe('sanitizarErroDoFreela', () => {
  it('remove URL, token e espaços excedentes', () => {
    const r = sanitizarErroDoFreela('Falhou em https://app.freela.com/primeiro-acesso?t=abc123XYZ e depois Bearer abc.def.ghi fim');
    expect(r).not.toContain('https');
    expect(r).not.toContain('abc123XYZ');
    expect(r).not.toContain('abc.def.ghi');
  });
  it('limita o tamanho', () => {
    expect(sanitizarErroDoFreela('x'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});

describe('somenteDigitos', () => {
  it('tira a máscara', () => expect(somenteDigitos('12.345.678/0001-90')).toBe('12345678000190'));
});

describe('corpoDoFreela', () => {
  const base = {
    client_id: '11111111-1111-4111-8111-111111111111',
    company_name: ' Padaria Bom Pão ',
    contact_name: 'Marcos',
    phone: '(11) 98765-4321',
  };
  const praca = { cidade: 'São Paulo', uf: 'SP' };

  it('monta o corpo só com DTO + praça + check-in', () => {
    const c = corpoDoFreela(base, praca, { lat: -23.6, lng: -46.6 });
    expect(c).toEqual({
      clientId: base.client_id,
      persona: 'contractor',
      accessMode: 'setup_link',
      companyName: 'Padaria Bom Pão',
      contactName: 'Marcos',
      phone: '+5511987654321',
      address: { city: 'São Paulo', uf: 'SP' },
      lat: -23.6,
      lng: -46.6,
    });
  });
  it('endereço do DTO vence a praça; opcionais vazios somem; cnpj só dígitos', () => {
    const c = corpoDoFreela(
      { ...base, email: ' ', cnpj: '12.345.678/0001-90', address: { street: 'Rua A', city: 'Campinas', uf: 'sp' } },
      praca,
      null,
    );
    expect(c).not.toBeNull();
    expect(c!.cnpj).toBe('12345678000190');
    expect(c!.email).toBeUndefined();
    expect(c!.address).toEqual({ street: 'Rua A', city: 'Campinas', uf: 'SP' });
    expect(c!.lat).toBeUndefined();
  });
  it('sem cidade/UF em lugar nenhum = null; telefone inválido = null', () => {
    expect(corpoDoFreela(base, { cidade: null, uf: null }, null)).toBeNull();
    expect(corpoDoFreela({ ...base, phone: '123' }, praca, null)).toBeNull();
  });
  it('é determinístico (mesma entrada, mesmo corpo)', () => {
    expect(JSON.stringify(corpoDoFreela(base, praca, null))).toBe(JSON.stringify(corpoDoFreela(base, praca, null)));
  });
});

describe('erroDoFreela', () => {
  const um = (status: number, code?: string, vinculado?: boolean, op: 'criar' | 'reemitir' = 'criar') =>
    erroDoFreela({ freelaStatus: status, code, alreadyLinkedToThisConsultant: vinculado }, op);

  it('404 sem código (flag do Freela desligada) = indisponível', () => {
    expect(um(404)).toMatchObject({ status: 503, code: 'SIGNUP_UNAVAILABLE' });
  });
  it('consultor inexistente no Freela = código pendente', () => {
    expect(um(404, 'CONSULTANT_NOT_FOUND')).toMatchObject({ status: 409, code: 'FREELA_CODE_PENDING' });
  });
  it('409 de duplicidade: com e sem vínculo ao consultor', () => {
    expect(um(409, 'PHONE_ALREADY_REGISTERED', false)).toMatchObject({
      status: 409,
      code: 'PHONE_ALREADY_REGISTERED',
      local: 'already_registered',
    });
    expect(um(409, 'PHONE_ALREADY_REGISTERED', true)).toMatchObject({ code: 'PHONE_ALREADY_REGISTERED_BY_YOU' });
    expect(um(409, 'CNPJ_ALREADY_REGISTERED', true)).toMatchObject({ code: 'CNPJ_ALREADY_REGISTERED_BY_YOU' });
    expect(um(409, 'EMAIL_ALREADY_REGISTERED')).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });
  it('400, 422 e 429 repassam o código do Freela', () => {
    expect(um(400, 'INVALID_CNPJ')).toMatchObject({ status: 400, code: 'INVALID_CNPJ', local: 'failed', message: 'CNPJ inválido.' });
    expect(
      erroDoFreela({ freelaStatus: 400, code: 'CITY_NOT_FOUND', message: 'Cidade "Xanxerê" não encontrada.' }, 'criar'),
    ).toMatchObject({ code: 'CITY_NOT_FOUND', message: 'Cidade "Xanxerê" não encontrada.' });
    expect(um(422, 'IDEMPOTENCY_KEY_REUSED')).toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(um(422, 'ACCESS_MODE_NOT_AVAILABLE')).toMatchObject({ status: 503, code: 'SIGNUP_UNAVAILABLE' });
    expect(um(429, 'DAILY_REGISTRATION_LIMIT')).toMatchObject({ status: 429, code: 'DAILY_REGISTRATION_LIMIT' });
  });
  it('reemissão: já ativado e cadastro inexistente', () => {
    expect(um(409, 'ALREADY_ACTIVATED', undefined, 'reemitir')).toMatchObject({ status: 409, code: 'ALREADY_ACTIVATED' });
    expect(um(404, 'REGISTRATION_NOT_FOUND', undefined, 'reemitir')).toMatchObject({
      status: 409,
      code: 'SIGNUP_NOT_FOUND_IN_FREELA',
    });
    expect(um(429, 'RESET_LIMIT', undefined, 'reemitir')).toMatchObject({ status: 429, code: 'RESET_LIMIT' });
  });
  it('o que não é caso conhecido devolve null (o serviço relança FREELA_ERROR)', () => {
    expect(um(500)).toBeNull();
    expect(um(403, 'FORBIDDEN')).toBeNull();
  });
});
