import {
  aplicarConfigCadastro,
  casarCadastro,
  classificar,
  escolherDesde,
  leadDeveSubir,
  lerConfigCadastro,
  mesclarEventos,
  normalizarNome,
  sanitizarErroSync,
  semanaDe,
  variantesCnpj,
  type Eventos,
} from '../signup-sync-rules';

const D = (s: string) => new Date(s);
const vazio: Eventos = { activated_at: null, first_vacancy_at: null, first_job_completed_at: null };

describe('config da regra de confirmação', () => {
  it('padrão é activated; lixo no banco cai no padrão', () => {
    expect(lerConfigCadastro({}).confirmation_rule).toBe('activated');
    expect(lerConfigCadastro({ confirmation_rule: 'xpto' }).confirmation_rule).toBe('activated');
    expect(lerConfigCadastro(null).confirmation_rule).toBe('activated');
    expect(lerConfigCadastro({ confirmation_rule: 'first_job_completed' }).confirmation_rule).toBe('first_job_completed');
  });
  it('valida o PUT', () => {
    const a = lerConfigCadastro({});
    expect(aplicarConfigCadastro(a, { confirmation_rule: 'first_vacancy' })).toEqual({ ok: true, config: { confirmation_rule: 'first_vacancy' } });
    expect(aplicarConfigCadastro(a, { confirmation_rule: 'nunca' }).ok).toBe(false);
    expect(aplicarConfigCadastro(a, { outra: 1 }).ok).toBe(false);
  });
});

describe('classificar', () => {
  it('activatedAt nulo não é confirmado, mesmo com outros eventos nulos', () => {
    expect(classificar(vazio, 'activated')).toEqual({ confirmado: false, em: null, dia: null });
  });
  it('a data que vale é a do evento da regra, em dia de Brasília', () => {
    const e: Eventos = { activated_at: D('2026-10-20T02:30:00Z'), first_vacancy_at: D('2026-10-22T12:00:00Z'), first_job_completed_at: null };
    expect(classificar(e, 'activated').dia).toBe('2026-10-19'); // 23:30 BRT do dia anterior
    expect(classificar(e, 'first_vacancy').dia).toBe('2026-10-22');
    expect(classificar(e, 'first_job_completed').confirmado).toBe(false);
  });
  it('borda do dia: 02:59:59Z ainda é o dia anterior, 03:00:00Z já é o dia novo', () => {
    expect(classificar({ ...vazio, activated_at: D('2026-10-20T02:59:59Z') }, 'activated').dia).toBe('2026-10-19');
    expect(classificar({ ...vazio, activated_at: D('2026-10-20T03:00:00Z') }, 'activated').dia).toBe('2026-10-20');
  });
});

describe('semanaDe (segunda a domingo, Brasília)', () => {
  it.each([
    ['2026-10-19', '2026-10-19', '2026-10-25'], // segunda
    ['2026-10-25', '2026-10-19', '2026-10-25'], // domingo fecha a semana
    ['2026-10-26', '2026-10-26', '2026-11-01'],
    ['2026-10-21', '2026-10-19', '2026-10-25'],
  ])('%s', (dia, from, to) => expect(semanaDe(dia)).toEqual({ from, to }));
  it('domingo 23:30 BRT pertence à semana que termina nele', () => {
    const dia = classificar({ ...vazio, activated_at: D('2026-10-26T02:30:00Z') }, 'activated').dia!;
    expect(dia).toBe('2026-10-25');
    expect(semanaDe(dia).to).toBe('2026-10-25');
  });
});

describe('mesclarEventos (escrita única)', () => {
  it('preenche nulo', () => {
    const r = mesclarEventos(vazio, { ...vazio, activated_at: D('2026-10-20T10:00:00Z') });
    expect(r.valor.activated_at).toEqual(D('2026-10-20T10:00:00Z'));
    expect(r.divergencias).toBe(0);
  });
  it('nunca sobrescreve nem volta a nulo; divergência é contada', () => {
    const atual = { ...vazio, activated_at: D('2026-10-20T10:00:00Z') };
    const r = mesclarEventos(atual, { ...vazio, activated_at: D('2026-10-21T10:00:00Z') });
    expect(r.valor.activated_at).toEqual(D('2026-10-20T10:00:00Z'));
    expect(r.divergencias).toBe(1);
    expect(mesclarEventos(atual, vazio).valor.activated_at).toEqual(D('2026-10-20T10:00:00Z'));
  });
  it('mesmo valor = sem divergência (idempotente)', () => {
    const atual = { ...vazio, first_vacancy_at: D('2026-10-20T10:00:00Z') };
    expect(mesclarEventos(atual, atual).divergencias).toBe(0);
  });
});

describe('escolherDesde', () => {
  const agora = D('2026-10-20T12:00:00Z');
  it('sem watermark: início da janela', () => {
    expect(escolherDesde({ agora, janelaDias: 45, watermark: null, maisAntigoSemEvento: null })).toEqual(D('2026-09-05T12:00:00Z'));
  });
  it('com watermark: 1 dia antes', () => {
    expect(escolherDesde({ agora, janelaDias: 45, watermark: D('2026-10-19T12:00:00Z'), maisAntigoSemEvento: null })).toEqual(D('2026-10-18T12:00:00Z'));
  });
  it('volta até o cadastro ainda não confirmado, mas nunca além da janela', () => {
    expect(escolherDesde({ agora, janelaDias: 45, watermark: D('2026-10-19T12:00:00Z'), maisAntigoSemEvento: D('2026-10-01T00:00:00Z') })).toEqual(D('2026-10-01T00:00:00Z'));
    expect(escolherDesde({ agora, janelaDias: 45, watermark: D('2026-10-19T12:00:00Z'), maisAntigoSemEvento: D('2026-01-01T00:00:00Z') })).toEqual(D('2026-09-05T12:00:00Z'));
  });
});

describe('casarCadastro', () => {
  const cand = (id: string, uid: string | null, nome: string, tel = '(11) 9****-4321') => ({ id, freela_user_id: uid, company_name: nome, phone_masked: tel });
  const item = { userId: 'u1', companyName: 'Padaria Bom Pão', phone: '+5511987654321' };
  it('por freela_user_id', () => {
    expect(casarCadastro(item, [cand('a', 'u1', 'x'), cand('b', null, 'y')])).toEqual({ tipo: 'linked', id: 'a' });
  });
  it('por telefone mascarado + nome normalizado', () => {
    expect(casarCadastro(item, [cand('a', null, 'padaria bom pao')])).toEqual({ tipo: 'linked', id: 'a' });
  });
  it('mesmo telefone mas nome diferente não casa', () => {
    expect(casarCadastro(item, [cand('a', null, 'Açougue Central')])).toEqual({ tipo: 'none' });
  });
  it('mais de um candidato é ambíguo', () => {
    expect(casarCadastro(item, [cand('a', null, 'Padaria Bom Pão'), cand('b', null, 'padaria bom pão')])).toEqual({ tipo: 'ambiguous' });
  });
  it('cadastro já ligado a outro usuário não é candidato do passo 2', () => {
    expect(casarCadastro(item, [cand('a', 'u9', 'Padaria Bom Pão')])).toEqual({ tipo: 'none' });
  });
  it('sem telefone (QR) não casa por telefone', () => {
    expect(casarCadastro({ ...item, phone: null }, [cand('a', null, 'Padaria Bom Pão')])).toEqual({ tipo: 'none' });
  });
});

describe('utilitários', () => {
  it('normalizarNome', () => expect(normalizarNome('  Padaria  Bom-Pão! ')).toBe('padaria bom pao'));
  it('variantesCnpj', () => {
    expect(variantesCnpj('12.345.678/0001-95')).toEqual(['12345678000195', '12.345.678/0001-95']);
    expect(variantesCnpj('123')).toEqual([]);
    expect(variantesCnpj(null)).toEqual([]);
  });
});

describe('leadDeveSubir', () => {
  const l = (stage: number, o: Partial<{ archived: boolean; is_test: boolean }> = {}) => ({ stage, archived: false, is_test: false, ...o });
  it('sobe de 1–4 quando confirmado', () => {
    for (const s of [1, 2, 3, 4]) expect(leadDeveSubir(l(s), true)).toBe(true);
  });
  it('não retrocede etapas >= 5 nem toca em Perdido (8)', () => {
    for (const s of [5, 6, 7, 8]) expect(leadDeveSubir(l(s), true)).toBe(false);
  });
  it('não toca arquivado nem de teste, nem sem confirmação', () => {
    expect(leadDeveSubir(l(2, { archived: true }), true)).toBe(false);
    expect(leadDeveSubir(l(2, { is_test: true }), true)).toBe(false);
    expect(leadDeveSubir(l(2), false)).toBe(false);
  });
});

describe('sanitizarErroSync', () => {
  it('não vaza texto do erro', () => {
    const e = Object.assign(new Error('falhou +5511987654321 https://x/?t=ABCDEFGHIJKLMNOPQRSTUVWXYZ'), { freelaStatus: 404 });
    const r = sanitizarErroSync(e);
    expect(r.code).toBe('FREELA_404');
    expect(JSON.stringify(r)).not.toMatch(/5511|https|ABCDEF/);
    expect(sanitizarErroSync(new Error('segredo 11987654321')).message).toBe('A sincronização falhou.');
    expect(sanitizarErroSync({ freelaStatus: 429 }).code).toBe('FREELA_429');
  });
});
