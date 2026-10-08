import { describe, expect, it } from 'vitest';
import { telaDaUrl, urlDaTela, type Tela } from '../use-tela';

const p = (qs: string) => new URLSearchParams(qs);

describe('visões do /campo na URL', () => {
  it('sem parâmetro ou desconhecido = hoje', () => {
    expect(telaDaUrl(p(''))).toEqual({ v: 'hoje' });
    expect(telaDaUrl(p('v=banana'))).toEqual({ v: 'hoje' });
  });

  it('visita sem ref volta para hoje', () => {
    expect(telaDaUrl(p('v=visita'))).toEqual({ v: 'hoje' });
  });

  it('urlDaTela', () => {
    expect(urlDaTela({ v: 'hoje' })).toBe('/campo');
    expect(urlDaTela({ v: 'nova' })).toBe('/campo?v=nova');
    expect(urlDaTela({ v: 'qr' })).toBe('/campo?v=qr');
    expect(urlDaTela({ v: 'visita', ref: 'a b/c' })).toBe('/campo?v=visita&ref=a%20b%2Fc');
  });

  it.each<Tela>([{ v: 'hoje' }, { v: 'nova' }, { v: 'qr' }, { v: 'visita', ref: 'a b/c&d' }])('ida e volta %j', (t) => {
    const qs = urlDaTela(t).split('?')[1] ?? '';
    expect(telaDaUrl(p(qs))).toEqual(t);
  });
});
