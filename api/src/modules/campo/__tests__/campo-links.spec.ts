import { signupUrl } from '../campo-links';

describe('signupUrl', () => {
  const antes = process.env.FREELA_WEB_URL;
  afterEach(() => {
    if (antes === undefined) delete process.env.FREELA_WEB_URL;
    else process.env.FREELA_WEB_URL = antes;
  });

  it.each([
    ['https://www.freelaservicos.com.br'],
    ['https://www.freelaservicos.com.br/'],
    ['https://www.freelaservicos.com.br//'],
    ['https://www.freelaservicos.com.br/cadastro'],
    ['https://www.freelaservicos.com.br/cadastro/'],
    ['  https://www.freelaservicos.com.br/cadastro  '],
  ])('base %j monta um único /cadastro', (base) => {
    process.env.FREELA_WEB_URL = base;
    expect(signupUrl('ABC123')).toBe('https://www.freelaservicos.com.br/cadastro?consultor=ABC123');
  });

  it('sem base ou sem código = null', () => {
    delete process.env.FREELA_WEB_URL;
    expect(signupUrl('ABC')).toBeNull();
    process.env.FREELA_WEB_URL = 'https://x.com';
    expect(signupUrl(null)).toBeNull();
  });

  it('codifica o código', () => {
    process.env.FREELA_WEB_URL = 'https://x.com';
    expect(signupUrl('a b&c')).toBe('https://x.com/cadastro?consultor=a%20b%26c');
  });
});
