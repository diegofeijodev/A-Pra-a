import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caminho, destinoDoRepresentantePorEndereco, ROTA, ROTA_CAMPO, rotaDoRepresentante } from '../enderecos';
import { REDIRECIONAMENTOS } from '../redirecionamentos';

/** Endereços das páginas do App Router (`src/app`), sem os grupos `(app)`/`(sessao)` e com `[id]` → `:id`. */
const APP = fileURLToPath(new URL('../../../../app/', import.meta.url));
function paginas(dir = APP, base: string[] = []): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const seg = /^\(.*\)$/.test(e.name) ? null : e.name.replace(/^\[(.+)\]$/, ':$1');
      out.push(...paginas(join(dir, e.name), seg ? [...base, seg] : base));
    } else if (e.name === 'page.tsx') {
      out.push(`/${base.join('/')}`);
    }
  }
  return out;
}
/** `/representantes/:id` e `/representantes/:x` são o mesmo endereço. */
const forma = (p: string): string => caminho(p).replace(/:\w+/g, ':');
const PAGINAS = new Set(paginas().map(forma));

/** Parâmetros de `source` (`/consultores/:id`) num caminho, ou `null` se não casa (`:x` = um pedaço não vazio, como no Next). */
function casa(source: string, pathname: string): Record<string, string> | null {
  const a = source.split('/');
  const b = caminho(pathname).split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.startsWith(':')) {
      if (!b[i]) return null;
      params[a[i]!.slice(1)] = b[i]!;
    } else if (a[i] !== b[i]) return null;
  }
  return params;
}

/**
 * O que o `redirects()` do Next faz com esta tabela: a 1ª linha que casa (caminho + `has` de query) vence, os parâmetros vão para o
 * destino e a query que chegou vai junto (a do destino ganha). `null` = não redireciona.
 */
function seguir(url: string): string | null {
  const u = new URL(url, 'http://praca.local');
  for (const red of REDIRECIONAMENTOS) {
    const params = casa(red.source, u.pathname);
    if (!params) continue;
    if (red.has && !red.has.every((h) => u.searchParams.get(h.key) === h.value)) continue;
    const d = new URL(red.destination.replace(/:(\w+)/g, (_, k: string) => params[k]!), 'http://praca.local');
    for (const [k, v] of u.searchParams) if (!d.searchParams.has(k)) d.searchParams.append(k, v);
    return d.pathname + d.search;
  }
  return null;
}

const UUID = '3f2b8c1e-6a7d-4e0f-9b1a-2c3d4e5f6a7b';
const indice = (source: string, comHas = false) => REDIRECIONAMENTOS.findIndex((x) => x.source === source && !!x.has === comHas);

describe('redirecionamentos dos endereços de antes da E7 (arquitetura §3.4)', () => {
  it('cada endereço de antes leva ao da Lovable, com a query junto', () => {
    const tabela: [string, string][] = [
      ['/consultores/painel', '/inicio'],
      ['/consultores/clientes?modo=mapa', '/mapa?modo=mapa'],
      ['/consultores/clientes', '/clientes'],
      ['/consultores/clientes?modo=lista', '/clientes?modo=lista'],
      ['/consultores/mapa', '/mapa'],
      ['/consultores/calor?praca=abc&dias=7', '/mapa/calor?praca=abc&dias=7'],
      ['/consultores/roteiros', '/rotas'],
      ['/consultores/cupons', '/vouchers'],
      ['/consultores/pagamentos', '/financeiro'],
      ['/consultores/declarados', '/financeiro/declarados'],
      [`/consultores/${UUID}`, `/representantes/${UUID}`],
      ['/consultores', '/representantes'],
      ['/praca', '/pracas'],
      ['/roteiro/r-1', '/campo?v=roteiro'],
    ];
    for (const [antigo, novo] of tabela) expect([antigo, seguir(antigo)]).toEqual([antigo, novo]);
    expect(seguir(`/consultores/${UUID}`)).toBe(rotaDoRepresentante(UUID));
  });

  it('não mexe no Comercial, no campo (escopo do atalho, E3), na entrada nem nos endereços novos', () => {
    for (const p of ['/', '/entrar', '/hoje', '/funil', '/entrada', '/prospeccao', '/freela', '/campo', '/campo/entrar', '/campo/senha', '/configuracoes', '/formulario/x', ...Object.values(ROTA)]) {
      expect([p, seguir(p)]).toEqual([p, null]);
    }
  });

  it('307 sempre (nunca 308, que fica no cache do navegador para sempre)', () => {
    expect(REDIRECIONAMENTOS.every((x) => x.permanent === false)).toBe(true);
  });

  it('sem cadeia: nenhum destino é origem de outra linha', () => {
    for (const red of REDIRECIONAMENTOS) expect([red.destination, seguir(red.destination.replace(/:\w+/g, 'x'))]).toEqual([red.destination, null]);
  });

  it('ordem: "?modo=mapa" antes de /consultores/clientes; as estáticas antes de /consultores/:id', () => {
    expect(indice('/consultores/clientes', true)).toBeGreaterThanOrEqual(0);
    expect(indice('/consultores/clientes', true)).toBeLessThan(indice('/consultores/clientes'));
    const id = indice('/consultores/:id');
    const estaticas = REDIRECIONAMENTOS.filter((x) => /^\/consultores\/[^:/]+$/.test(x.source)).map((x) => REDIRECIONAMENTOS.indexOf(x));
    expect(estaticas.length).toBeGreaterThan(5);
    expect(estaticas.every((i) => i < id)).toBe(true);
  });

  it('destino sem "?" (o Next repassa a query que chegou), menos o roteiro da Lovable, que é uma visão do campo', () => {
    const comQuery = REDIRECIONAMENTOS.filter((x) => x.destination.includes('?')).map((x) => x.source);
    expect(comQuery).toEqual(['/roteiro/:id']);
  });

  it('todo destino é um endereço conhecido (ROTA / ROTA_CAMPO) e uma página do app', () => {
    const conhecidos = new Set([...Object.values(ROTA), ...Object.values(ROTA_CAMPO), rotaDoRepresentante(':')].map(forma));
    for (const red of REDIRECIONAMENTOS) {
      expect([red.destination, conhecidos.has(forma(red.destination))]).toEqual([red.destination, true]);
      expect([red.destination, PAGINAS.has(forma(red.destination))]).toEqual([red.destination, true]);
    }
  });

  it('nenhuma origem é página do app (a página velha saiu com o git mv) e todo ROTA é uma página', () => {
    for (const red of REDIRECIONAMENTOS) expect([red.source, PAGINAS.has(forma(red.source))]).toEqual([red.source, false]);
    for (const r of [...Object.values(ROTA), ...Object.values(ROTA_CAMPO)]) expect([r, PAGINAS.has(forma(r))]).toEqual([r, true]);
    expect(PAGINAS.has(forma(rotaDoRepresentante(':id')))).toBe(true);
  });

  it('representante (só campoSession) que abre um endereço de antes: o 307 e depois a visão equivalente do campo', () => {
    const tabela: [string, string][] = [
      ['/consultores/painel', '/campo'],
      ['/consultores/clientes', '/campo?v=clientes'],
      ['/consultores/clientes?modo=mapa', '/campo?v=mapa'],
      ['/consultores/mapa', '/campo?v=mapa'],
      ['/consultores/pagamentos', '/campo?v=carteira'],
      ['/consultores', '/campo'],
      ['/praca', '/campo'],
    ];
    for (const [antigo, destino] of tabela) expect([antigo, destinoDoRepresentantePorEndereco(seguir(antigo)!)]).toEqual([antigo, destino]);
  });
});
