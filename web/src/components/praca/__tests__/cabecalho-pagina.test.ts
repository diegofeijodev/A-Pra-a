import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CabecalhoPagina } from '../CabecalhoPagina';

describe('CabecalhoPagina', () => {
  it('renderiza o h1 text-3xl font-semibold e o subtítulo', () => {
    const html = renderToStaticMarkup(
      createElement(CabecalhoPagina, { titulo: 'Mensagens', subtitulo: 'Modelos e disparos.' }),
    );
    expect(html).toMatch(/<h1 class="[^"]*text-3xl font-semibold[^"]*">Mensagens<\/h1>/);
    expect(html).toMatch(/<p class="[^"]*text-muted-foreground[^"]*">Modelos e disparos\.<\/p>/);
    expect(html).not.toContain('tag');
  });

  it('põe as ações à direita', () => {
    const html = renderToStaticMarkup(
      createElement(CabecalhoPagina, { titulo: 'X', acoes: createElement('button', null, 'Novo') }),
    );
    expect(html).toContain('sm:w-auto');
    expect(html).toContain('<button>Novo</button>');
  });
});
