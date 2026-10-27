import { describe, expect, it } from 'vitest';
import { corpoDoPerfil, ehGestor, featuresMenuSchema, itemAtivo, montarMenu, paginaInicial, perfilDe, podeOperar, SEM_FEATURES_MENU, type FeaturesMenu } from '../acesso';
import { destinoDoRepresentante, destinoDoRepresentantePorEndereco, ROTA, ROTA_CAMPO } from '../enderecos';
import { conferirRegras, senhaCumpre, type PoliticaLigada } from '../senha';
import { emailContatoValido, linkWhatsappAcesso, mascararEmail } from '../cadastro';

const ADMIN = { is_admin: true };
const GESTOR = { is_admin: false, is_gestor: true };
const EQUIPE = { is_admin: false };
// As flags que acendem itens do menu (Comercial desligado, como em produção).
const tudo: FeaturesMenu = { ...SEM_FEATURES_MENU, dashboard: true, map_pins: true, routes: true, vouchers: true, earnings: true, payouts: true, route_plans: true, team_gestor: true };

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

describe('menu da equipe (casca da Lovable)', () => {
  const rotulos = (m: ReturnType<typeof montarMenu>, i = 0) => m[i]!.itens.map((x) => x.label);
  const LOVABLE = ['Dashboard', 'Praças', 'Clientes', 'Mapa', 'Rotas', 'Representantes', 'Vouchers', 'Financeiro', 'Configurações', 'Usuários'];
  const COMERCIAL = ['Funil', 'Entrada', 'Buscar estabelecimentos', 'Mensagens', 'Campanhas', 'Calendário', 'Indicadores', 'Ações', 'Freela'];

  it('admin com os módulos ligados e o Comercial desligado: um grupo sem título, nomes e ordem da Lovable', () => {
    const m = montarMenu(tudo, ADMIN);
    expect(m).toHaveLength(1);
    expect(m[0]!.titulo).toBeNull();
    expect(rotulos(m)).toEqual(LOVABLE);
  });
  it('gestor e equipe: a mesma lista sem "Usuários" (Configurações fica: as áreas de atuação são do gestor, §42.3)', () => {
    const semUsuarios = LOVABLE.filter((l) => l !== 'Usuários');
    expect(rotulos(montarMenu(tudo, GESTOR))).toEqual(semUsuarios);
    expect(rotulos(montarMenu(tudo, EQUIPE))).toEqual(semUsuarios);
  });
  it('tudo desligado (admin): só os itens sem flag', () => {
    expect(montarMenu(SEM_FEATURES_MENU, ADMIN).map((g) => g.titulo)).toEqual([null]);
    expect(rotulos(montarMenu(SEM_FEATURES_MENU, ADMIN))).toEqual(['Dashboard', 'Praças', 'Representantes', 'Configurações', 'Usuários']);
    // Regra de senha, cadastro, e-mail, planos e várias praças não mexem no menu.
    const naoMexem = { ...SEM_FEATURES_MENU, password_policy: true, consultant_profile: true, contact_email: true, route_plans: true, multi_praca: true, team_gestor: true };
    expect(rotulos(montarMenu(naoMexem, ADMIN))).toEqual(['Dashboard', 'Praças', 'Representantes', 'Configurações', 'Usuários']);
  });
  it('cada item com flag só com a sua: Clientes e Mapa (mapa), Rotas (rotas), Vouchers (cupons), Financeiro (Pix)', () => {
    expect(rotulos(montarMenu({ ...SEM_FEATURES_MENU, map_pins: true }, EQUIPE))).toEqual(['Dashboard', 'Praças', 'Clientes', 'Mapa', 'Representantes', 'Configurações']);
    expect(rotulos(montarMenu({ ...SEM_FEATURES_MENU, routes: true }, EQUIPE))).toContain('Rotas');
    expect(rotulos(montarMenu({ ...SEM_FEATURES_MENU, vouchers: true }, EQUIPE))).toContain('Vouchers');
    expect(rotulos(montarMenu({ ...SEM_FEATURES_MENU, earnings: true }, EQUIPE))).not.toContain('Financeiro');
    expect(rotulos(montarMenu({ ...SEM_FEATURES_MENU, earnings: true, payouts: true }, EQUIPE))).toContain('Financeiro');
  });
  it('Comercial ligado: 2º grupo "Comercial" com os itens de antes; "Buscar estabelecimentos" só para quem opera', () => {
    const comCom = { ...tudo, commercial: true };
    for (const u of [ADMIN, GESTOR]) {
      const m = montarMenu(comCom, u);
      expect(m.map((g) => g.titulo)).toEqual([null, 'Comercial']);
      expect(rotulos(m, 1)).toEqual(COMERCIAL);
    }
    expect(rotulos(montarMenu(comCom, ADMIN))).toEqual(LOVABLE);
    expect(rotulos(montarMenu(comCom, EQUIPE), 1)).toEqual(COMERCIAL.filter((l) => l !== 'Buscar estabelecimentos'));
    expect(montarMenu(comCom, ADMIN)[1]!.itens.find((i) => i.label === 'Ações')!.to).toBe('/hoje');
  });
  it('item ativo: um só, o de prefixo mais longo; Clientes e Mapa pelo modo', () => {
    const itens = montarMenu({ ...tudo, commercial: true }, ADMIN).flatMap((g) => g.itens);
    const ativo = (path: string, modo: string | null = null) => itemAtivo(itens, path, modo)?.label ?? null;
    expect(ativo('/consultores/3f2b8c1e-6a7d-4e0f-9b1a-2c3d4e5f6a7b')).toBe('Representantes');
    expect(ativo('/consultores')).toBe('Representantes');
    expect(ativo('/consultores/painel')).toBe('Dashboard');
    expect(ativo('/consultores/roteiros')).toBe('Rotas');
    expect(ativo('/consultores/cupons')).toBe('Vouchers');
    expect(ativo('/consultores/pagamentos')).toBe('Financeiro');
    expect(ativo('/consultores/clientes')).toBe('Clientes');
    expect(ativo('/consultores/clientes', 'lista')).toBe('Clientes');
    expect(ativo('/consultores/clientes', 'mapa')).toBe('Mapa');
    expect(ativo('/praca')).toBe('Praças');
    expect(ativo('/pracas')).toBeNull();
    // "Usuários" divide a tela com "Configurações" até a E5: acende uma só.
    expect(ativo('/configuracoes')).toBe('Configurações');
    expect(ativo('/funil')).toBe('Funil');
    expect(ativo('/formulario/x')).toBeNull();
    // Endereço do Comercial com a chave desligada abre normalmente, sem item aceso (§2.2).
    expect(itemAtivo(montarMenu(tudo, ADMIN)[0]!.itens, '/funil', null)).toBeNull();
  });
  it('página inicial: sempre o Dashboard (nunca mais /hoje)', () => {
    expect(paginaInicial()).toBe(ROTA.inicio);
    expect(ROTA.inicio).toBe('/consultores/painel');
  });
  it('features: servidor antigo (sem as chaves novas) = desligado; o representante mora em /campo', () => {
    const f = featuresMenuSchema.parse({ dashboard: true });
    expect([f.commercial, f.routes, f.earnings, f.payouts, f.declared_signups]).toEqual([false, false, false, false, false]);
    expect(destinoDoRepresentante()).toBe('/campo');
    expect(destinoDoRepresentante('carteira')).toBe('/campo');
  });
  it('representante que abre endereço da equipe cai na casca dele (E3: tudo → /campo), nunca na entrada', () => {
    for (const p of ['/inicio', '/mapa', '/clientes', '/financeiro', '/desempenho', '/hoje', '/consultores/painel', '/praca', '/', '/mapa/']) {
      expect(destinoDoRepresentantePorEndereco(p)).toBe('/campo');
    }
    // A entrada e a troca obrigatória do consultor ficam DENTRO de `/campo` (escopo do atalho instalado, arquitetura §3.4).
    expect(Object.values(ROTA_CAMPO).every((r) => r.startsWith('/campo'))).toBe(true);
    expect(ROTA.trocarSenha).toBe('/trocar-senha');
  });
  it('as chaves dos links são únicas (o React reclamaria no console)', () => {
    const itens = montarMenu({ ...tudo, commercial: true }, ADMIN).flatMap((g) => g.itens);
    expect(new Set(itens.map((i) => i.to)).size).toBe(itens.length);
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
