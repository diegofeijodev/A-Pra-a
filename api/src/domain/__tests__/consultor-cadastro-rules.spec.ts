/** Lote E, L9b (contrato §41.3): endereço e banco do consultor — validação, `null` limpa, máscaras. */
import { CAMPOS_BANCO, CAMPOS_CADASTRO, CAMPOS_ENDERECO, mascararConta, mascararPix, normalizarCadastro } from '../consultor-cadastro-rules';

describe('normalizarCadastro', () => {
  it('as 11 chaves do contrato, endereço e banco', () => {
    expect(CAMPOS_ENDERECO).toEqual(['address_cep', 'address_street', 'address_number', 'address_complement', 'address_district', 'address_city', 'address_state']);
    expect(CAMPOS_BANCO).toEqual(['bank_name', 'bank_branch', 'bank_account', 'bank_account_type']);
    expect(CAMPOS_CADASTRO).toHaveLength(11);
  });
  it('ausente não entra; null e "" limpam; texto aparado; CEP só dígitos; UF maiúscula', () => {
    expect(normalizarCadastro({})).toEqual({ ok: true, dados: {} });
    expect(
      normalizarCadastro({ address_cep: '30140-071', address_street: '  Rua da Bahia ', address_number: '', address_state: 'mg', bank_name: null }),
    ).toEqual({ ok: true, dados: { address_cep: '30140071', address_street: 'Rua da Bahia', address_number: null, address_state: 'MG', bank_name: null } });
  });
  it('agência e conta: dígitos, - e x; tipo da conta fechado', () => {
    expect(normalizarCadastro({ bank_branch: '1234-5', bank_account: '000123456-X', bank_account_type: 'corrente' })).toEqual({
      ok: true,
      dados: { bank_branch: '1234-5', bank_account: '000123456-x', bank_account_type: 'corrente' },
    });
  });
  it('inválido = erro com o nome do campo, sem repetir o valor', () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ address_cep: '3014007' }, 'address_cep'],
      [{ address_state: 'Minas' }, 'address_state'],
      [{ address_street: 'x'.repeat(121) }, 'address_street'],
      [{ bank_account: '12a45' }, 'bank_account'],
      [{ bank_branch: '1'.repeat(11) }, 'bank_branch'],
      [{ bank_account_type: 'investimento' }, 'bank_account_type'],
      [{ address_city: 12 }, 'address_city'],
    ];
    for (const [entrada, campo] of casos) {
      const r = normalizarCadastro(entrada);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.erro.startsWith(`${campo}:`)).toBe(true);
        expect(r.erro).not.toContain(String(Object.values(entrada)[0]));
      }
    }
  });
});

describe('máscaras', () => {
  it('conta: ••• + os 3 últimos', () => {
    expect(mascararConta('123456-7')).toBe('•••6-7');
    expect(mascararConta('12')).toBe('•••');
    expect(mascararConta(null)).toBeNull();
  });
  it('Pix: ••• + os 4 últimos', () => {
    expect(mascararPix('ana.souza@exemplo.com')).toBe('•••.com');
    expect(mascararPix('12345678909')).toBe('•••8909');
    expect(mascararPix('abc')).toBe('•••');
  });
});
