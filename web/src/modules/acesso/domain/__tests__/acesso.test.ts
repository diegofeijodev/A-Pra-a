import { describe, expect, it } from 'vitest';
import { corpoDoPerfil, ehGestor, itemAtivo, menuDeHoje, montarMenu, paginaInicial, perfilDe, podeOperar, SEM_FEATURES_MENU, type FeaturesMenu } from '../acesso';
import { conferirRegras, senhaCumpre, type PoliticaLigada } from '../senha';
import { emailContatoValido, linkWhatsappAcesso, mascararEmail } from '../cadastro';

const ADMIN = { is_admin: true };
const GESTOR = { is_admin: false, is_gestor: true };
const EQUIPE = { is_admin: false };
const tudo: FeaturesMenu = { ...SEM_FEATURES_MENU, dashboard: true, map_pins: true, vouchers: true, route_plans: true, team_gestor: true };

describe('perfis', () => {
  it('gestor efetivo e quem opera', () => {
    expect(ehGestor(GESTOR)).toBe(true);
    expect(ehGestor({ is_admin: true, is_gestor: true })).toBe(false);
    expect(podeOperar(ADMIN)).toBe(true);
    expect(podeOperar(GESTOR)).toBe(true);
    expect(podeOperar(EQUIPE)).toBe(false);
    expect(podeOperar(null)).toBe(false);
  });
  it('Admin / Gestor / Equipe ↔ {is_admin, is_gestor}', () => {
    expect(perfilDe({ is_admin: true, is_gestor: true })).toBe('admin');
    expect(perfilDe(GESTOR)).toBe('gestor');
    expect(perfilDe(EQUIPE)).toBe('equipe');
    expect(corpoDoPerfil('gestor')).toEqual({ is_admin: false, is_gestor: true });
    expect(corpoDoPerfil('equipe')).toEqual({ is_admin: false, is_gestor: false });
  });
});

describe('menu da equipe', () => {
  it('módulos desligados (produção hoje): o menu de hoje, plano e na mesma ordem', () => {
    expect(montarMenu(SEM_FEATURES_MENU, ADMIN)).toEqual([{ titulo: null, itens: menuDeHoje(true) }]);
    expect(montarMenu(SEM_FEATURES_MENU, ADMIN)[0]!.itens.map((i) => i.label)).toEqual([
      'Praça', 'Funil', 'Consultores', 'Entrada', 'Buscar estabelecimentos', 'Mensagens', 'Campanhas', 'Calendário', 'Indicadores', 'Ações', 'Configurações', 'Freela',
    ]);
    expect(montarMenu(SEM_FEATURES_MENU, EQUIPE)[0]!.itens.map((i) => i.label)).not.toContain('Buscar estabelecimentos');
    // Só regra de senha/cadastro/e-mail ligados também não mexem no menu.
    expect(montarMenu({ ...SEM_FEATURES_MENU, password_policy: true, consultant_profile: true, contact_email: true }, ADMIN)[0]!.titulo).toBeNull();
  });
  it('ligados: três grupos com os nomes e a ordem da Lovable', () => {
    const m = montarMenu(tudo, ADMIN);
    expect(m.map((g) => g.titulo)).toEqual(['Operação de campo', 'Comercial', 'Administração']);
    expect(m[0]!.itens.map((i) => i.label)).toEqual(['Início', 'Praças', 'Clientes', 'Mapa', 'Rotas', 'Consultores', 'Cupons']);
    expect(m[1]!.itens.map((i) => i.label)).toContain('Buscar estabelecimentos');
  });
  it('o gestor vê Configurações (as áreas de atuação são dele, §42.3) e a busca (só mapa aberto, no servidor)', () => {
    const m = montarMenu(tudo, GESTOR);
    expect(m.map((g) => g.titulo)).toEqual(['Operação de campo', 'Comercial', 'Administração']);
    expect(m[1]!.itens.map((i) => i.label)).toContain('Buscar estabelecimentos');
    expect(montarMenu(tudo, EQUIPE)[1]!.itens.map((i) => i.label)).not.toContain('Buscar estabelecimentos');
  });
  it('item ativo considera o modo de Clientes', () => {
    const [lista, mapa] = [{ to: '/consultores/clientes', label: 'Clientes', icon: 'clientes' as const }, { to: '/consultores/clientes?modo=mapa', label: 'Mapa', icon: 'mapa' as const }];
    expect(itemAtivo(lista, '/consultores/clientes', null)).toBe(true);
    expect(itemAtivo(mapa, '/consultores/clientes', null)).toBe(false);
    expect(itemAtivo(mapa, '/consultores/clientes', 'mapa')).toBe(true);
    expect(itemAtivo({ to: '/funil', label: 'Funil', icon: 'funil' }, '/funil', null)).toBe(true);
  });
  it('página inicial: Início só com o painel ligado', () => {
    expect(paginaInicial(SEM_FEATURES_MENU)).toBe('/hoje');
    expect(paginaInicial({ dashboard: true })).toBe('/consultores/painel');
  });
});

describe('regra de senha (ao vivo, a mesma conta do servidor)', () => {
  const p: PoliticaLigada = {
    enabled: true, min_length: 8, max_length: 72, require_upper: true, require_digit: true, is_default: true,
    rules: [{ key: 'min_length', label: '8 caracteres ou mais' }, { key: 'upper', label: 'Uma letra maiúscula' }, { key: 'digit', label: 'Um número' }],
  };
  it('marca cada regra', () => {
    expect(conferirRegras('abc', p).map((r) => r.ok)).toEqual([false, false, false]);
    expect(conferirRegras('Abcdefg1', p).map((r) => r.ok)).toEqual([true, true, true]);
    expect(senhaCumpre('abcdefgh', p)).toBe(false);
    expect(senhaCumpre('qualquer', { enabled: false })).toBe(true);
    expect(senhaCumpre('qualquer', undefined)).toBe(true);
  });
});

describe('cadastro e e-mail do contato', () => {
  it('e-mail: vazio vale (opcional); falta @ ou domínio não vale', () => {
    expect(emailContatoValido('')).toBe(true);
    expect(emailContatoValido(' Maria@Padaria.com ')).toBe(true);
    expect(emailContatoValido('maria@padaria')).toBe(false);
    expect(emailContatoValido('maria')).toBe(false);
    expect(mascararEmail('maria@padaria.com')).toBe('m***@padaria.com');
  });
  it('WhatsApp da senha provisória: 55 + DDD, mensagem com o primeiro nome; sem telefone = sem botão', () => {
    const l = linkWhatsappAcesso({ telefone: '(31) 99999-0000', nome: 'Ana Souza', email: 'ana@x.com', senha: 'Ab3kq9Zt2mPw', endereco: 'https://praca/campo/entrar' });
    expect(l).toMatch(/^https:\/\/wa\.me\/5531999990000\?text=/);
    expect(decodeURIComponent(l!.split('text=')[1]!)).toContain('Olá, Ana! Seu acesso ao Praça:');
    expect(decodeURIComponent(l!.split('text=')[1]!)).toContain('Senha provisória: Ab3kq9Zt2mPw');
    expect(linkWhatsappAcesso({ telefone: '123', nome: 'A', email: 'a', senha: 's', endereco: 'e' })).toBeNull();
  });
});
