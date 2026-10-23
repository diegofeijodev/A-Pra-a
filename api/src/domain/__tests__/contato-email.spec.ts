/** Lote E, L9c (contrato §41.4): e-mail de quem atendeu — normalização, validação e máscara. */
import { mascararEmailContato, normalizarEmailContato } from '../campo-rules';
import { CONFIG_MODO_PADRAO, aplicarConfigModo, faltandoSimples, lerConfigModo } from '../modo-campo-rules';
import { RESPOSTAS_VAZIAS } from '../campo-rules';

describe('normalizarEmailContato', () => {
  it('nulo, ausente e vazio = sem e-mail', () => {
    expect(normalizarEmailContato(null)).toEqual({ ok: true, valor: null });
    expect(normalizarEmailContato(undefined)).toEqual({ ok: true, valor: null });
    expect(normalizarEmailContato('   ')).toEqual({ ok: true, valor: null });
  });
  it('apara e põe em minúsculas', () => {
    expect(normalizarEmailContato('  Maria.Silva@Padaria.COM.br ')).toEqual({ ok: true, valor: 'maria.silva@padaria.com.br' });
  });
  it('recusa sem @, sem domínio, com espaço ou com mais de 120', () => {
    for (const ruim of ['maria', 'maria@', '@padaria.com', 'maria@padaria', 'ma ria@padaria.com', 'a@b@c.com', `${'a'.repeat(115)}@b.com`]) {
      expect(normalizarEmailContato(ruim)).toEqual({ ok: false });
    }
  });
});

describe('mascararEmailContato', () => {
  it('primeira letra + *** + domínio inteiro', () => {
    expect(mascararEmailContato('maria@padaria.com')).toBe('m***@padaria.com');
    expect(mascararEmailContato('a@b.co')).toBe('a***@b.co');
    expect(mascararEmailContato(null)).toBeNull();
    expect(mascararEmailContato('sem-arroba')).toBeNull();
  });
});

describe('contato_campos com e-mail (§41.4)', () => {
  it('padrão sem e-mail (opcional, como na Lovable)', () => {
    expect(CONFIG_MODO_PADRAO.contato_campos).toEqual(['nome', 'cargo', 'telefone']);
  });
  it('aceita email no fim da ordem canônica', () => {
    const r = aplicarConfigModo(CONFIG_MODO_PADRAO, { contato_campos: ['email', 'nome'] });
    expect(r).toEqual({ ok: true, config: { ...CONFIG_MODO_PADRAO, contato_campos: ['nome', 'email'] } });
    expect(lerConfigModo({ contato_campos: ['telefone', 'email'] }).contato_campos).toEqual(['telefone', 'email']);
  });
  it('com email exigido e o resultado na lista, o checkout simples pede o e-mail', () => {
    const cfg = { ...CONFIG_MODO_PADRAO, contato_campos: ['email' as const] };
    const r = { ...RESPOSTAS_VAZIAS, result: 'cadastrou', followup_date: null };
    expect(faltandoSimples(r, '2026-10-22', cfg, { far_from_place: false })).toEqual(['e-mail de quem atendeu']);
    expect(faltandoSimples({ ...r, contact_email: 'm@p.com' }, '2026-10-22', cfg, { far_from_place: false })).toEqual([]);
    // sem_interesse não está em contato_obrigatorio_em por padrão
    expect(faltandoSimples({ ...r, result: 'ja_usa' }, '2026-10-22', cfg, { far_from_place: false })).toEqual([]);
  });
});
