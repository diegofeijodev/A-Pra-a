import { describe, expect, it } from 'vitest';
import { destinoDoRepresentante } from '@/modules/acesso/domain/enderecos';
import { ABAS_REPRESENTANTE, abaDaTela, telaDaUrl, urlDaTela, type Tela } from '../use-tela';

const p = (qs: string) => new URLSearchParams(qs);

describe('visões do /campo na URL', () => {
  it('sem parâmetro ou desconhecido = hoje', () => {
    expect(telaDaUrl(p(''))).toEqual({ v: 'hoje' });
    expect(telaDaUrl(p('v=banana'))).toEqual({ v: 'hoje' });
  });

  it('visita sem ref volta para hoje', () => {
    expect(telaDaUrl(p('v=visita'))).toEqual({ v: 'hoje' });
    expect(telaDaUrl(p('v=parada'))).toEqual({ v: 'hoje' });
  });

  it('cadastro assistido: ida e volta pela URL; sem ref volta para hoje', () => {
    expect(telaDaUrl(p('v=cadastro&ref=abc'))).toEqual({ v: 'cadastro', ref: 'abc' });
    expect(telaDaUrl(p('v=cadastro'))).toEqual({ v: 'hoje' });
    expect(urlDaTela({ v: 'cadastro', ref: 'a b' })).toBe('/campo?v=cadastro&ref=a%20b');
  });

  it('urlDaTela', () => {
    expect(urlDaTela({ v: 'hoje' })).toBe('/campo');
    expect(urlDaTela({ v: 'nova' })).toBe('/campo?v=nova');
    expect(urlDaTela({ v: 'qr' })).toBe('/campo?v=qr');
    expect(urlDaTela({ v: 'roteiro' })).toBe('/campo?v=roteiro');
    expect(urlDaTela({ v: 'nova', parada: 'abc' })).toBe('/campo?v=nova&parada=abc');
    expect(urlDaTela({ v: 'visita', ref: 'a b/c' })).toBe('/campo?v=visita&ref=a%20b%2Fc');
  });

  it.each<Tela>([
    { v: 'hoje' },
    { v: 'nova' },
    { v: 'nova', parada: 'p 1&x' },
    { v: 'qr' },
    { v: 'roteiro' },
    { v: 'parada', id: 'a b' },
    { v: 'visita', ref: 'a b/c&d' },
    { v: 'cadastro', ref: 'r/1' },
    { v: 'resumo' },
    { v: 'resumo', dia: '2026-10-26' },
    { v: 'pedir-cupom', ref: 'r 2' },
    { v: 'proximos' },
    { v: 'mapa' },
    { v: 'clientes' },
    { v: 'desempenho' },
    { v: 'carteira' },
  ])('ida e volta %j', (t) => {
    const qs = urlDaTela(t).split('?')[1] ?? '';
    expect(telaDaUrl(p(qs))).toEqual(t);
  });

  it('as URLs das visões de antes da casca nova ficam byte a byte iguais (o browser-check e a fila dependem delas)', () => {
    expect(urlDaTela({ v: 'proximos' })).toBe('/campo?v=proximos');
    expect(urlDaTela({ v: 'resumo' })).toBe('/campo?v=resumo');
    expect(urlDaTela({ v: 'resumo', dia: '2026-10-25' })).toBe('/campo?v=resumo&dia=2026-10-25');
    expect(urlDaTela({ v: 'parada', id: 'p/1' })).toBe('/campo?v=parada&id=p%2F1');
    expect(urlDaTela({ v: 'pedir-cupom', ref: 'a b' })).toBe('/campo?v=pedir-cupom&ref=a%20b');
    expect(urlDaTela({ v: 'nova', parada: 'x y' })).toBe('/campo?v=nova&parada=x%20y');
    // Resumo com dia malformado volta ao de hoje; visões que pedem `ref`/`id` sem ele voltam para Hoje.
    expect(telaDaUrl(p('v=resumo&dia=26/10'))).toEqual({ v: 'resumo' });
    expect(telaDaUrl(p('v=pedir-cupom'))).toEqual({ v: 'hoje' });
  });
});

describe('casca do representante (redesenho E4, arquitetura §3.6)', () => {
  it('as 4 abas novas são visões da rota única /campo', () => {
    expect(urlDaTela({ v: 'mapa' })).toBe('/campo?v=mapa');
    expect(urlDaTela({ v: 'clientes' })).toBe('/campo?v=clientes');
    expect(urlDaTela({ v: 'desempenho' })).toBe('/campo?v=desempenho');
    expect(urlDaTela({ v: 'carteira' })).toBe('/campo?v=carteira');
  });

  it('as 5 abas da Lovable, na ordem dela, e cada uma acende a si mesma', () => {
    expect(ABAS_REPRESENTANTE.map((a) => a.rotulo)).toEqual(['Hoje', 'Mapa', 'Clientes', 'Desempenho', 'Carteira']);
    for (const a of ABAS_REPRESENTANTE) expect(abaDaTela(a.tela)).toBe(a.aba);
  });

  it('o link compartilhado de cada aba (enderecos.ts) é a URL da visão', () => {
    for (const a of ABAS_REPRESENTANTE) expect(destinoDoRepresentante(a.aba)).toBe(urlDaTela(a.tela));
  });

  it('as telas de fluxo (botão fixo embaixo) escondem a barra; as que saem da Hoje acendem "Hoje"', () => {
    const fluxo: Tela[] = [{ v: 'nova' }, { v: 'nova', parada: 'x' }, { v: 'visita', ref: 'r' }, { v: 'cadastro', ref: 'r' }, { v: 'pedir-cupom', ref: 'r' }, { v: 'parada', id: 'p' }];
    for (const t of fluxo) expect(abaDaTela(t)).toBeNull();
    const daHoje: Tela[] = [{ v: 'hoje' }, { v: 'roteiro' }, { v: 'resumo' }, { v: 'resumo', dia: '2026-10-20' }, { v: 'proximos' }, { v: 'qr' }];
    for (const t of daHoje) expect(abaDaTela(t)).toBe('hoje');
  });
});
