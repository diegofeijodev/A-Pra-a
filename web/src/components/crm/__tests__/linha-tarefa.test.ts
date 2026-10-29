import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LinhaTarefa, type LinhaTarefaProps } from '../LinhaTarefa';

const nada = () => undefined;
const base: LinhaTarefaProps = {
  chave: 'send:s1',
  nome: 'Bar do Zé',
  onAbrirLead: nada,
  motivo: 'Disparo Verão · para hoje',
  telefone: '31987654321',
};
const html = (p: Partial<LinhaTarefaProps>) => renderToStaticMarkup(createElement(LinhaTarefa, { ...base, ...p }));

describe('LinhaTarefa (UX §3.1.3)', () => {
  it('T1: Abrir WhatsApp com o texto, Feito de 1 toque e Adiar, com nomes acessíveis únicos', () => {
    const h = html({
      mensagem: 'Oi',
      onCopiarMensagem: nada,
      whatsapp: { texto: 'Oi', principal: true },
      feito: { onFeito: nada },
      adiar: { opcoes: [{ id: '2026-10-29', rotulo: 'Amanhã · qui 29/10' }], onEscolher: nada },
    });
    expect(h).toContain('data-chave="send:s1"');
    expect(h).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Bar do Zé<\/button>/);
    expect(h).toContain('href="https://wa.me/5531987654321?text=Oi"');
    expect(h).toContain('target="_blank"');
    expect(h).toContain('rel="noopener noreferrer"');
    expect(h).toContain('Abrir WhatsApp<span class="sr-only"> de Bar do Zé (abre em outra aba)</span>');
    expect(h).toContain('aria-label="Feito: Bar do Zé"');
    expect(h).toContain('aria-label="Adiar: Bar do Zé"');
    expect(h).toContain('Copiar mensagem');
    // "Abrir WhatsApp" não grava nada: é só um link (nenhum onClick vira pedido aqui).
    expect(h).not.toContain('tel:');
  });

  it('“Mandou? Toque em Feito.” e o Feito em destaque depois de abrir o WhatsApp', () => {
    const h = html({ whatsapp: { texto: 'Oi', principal: true, destaque: false }, aviso: 'Mandou? Toque em Feito.', feito: { onFeito: nada, destaque: true } });
    expect(h).toContain('Mandou? Toque em Feito.');
    expect(h).toMatch(/<button[^>]*bg-primary[^>]*aria-label="Feito: Bar do Zé"|<button[^>]*aria-label="Feito: Bar do Zé"[^>]*bg-primary/);
  });

  it('T2–T5: Ligar só no celular, WhatsApp sem texto pronto, Feito com menu', () => {
    const h = html({
      whatsapp: {},
      feito: { opcoes: [{ id: 'call', rotulo: 'Liguei' }], onEscolher: nada },
      adiar: { opcoes: [], onEscolher: nada },
    });
    expect(h).toMatch(/<a[^>]*class="[^"]*md:hidden[^"]*"[^>]*href="tel:\+5531987654321"|<a[^>]*href="tel:\+5531987654321"[^>]*class="[^"]*md:hidden/);
    expect(h).toContain('Ligar<span class="sr-only"> para Bar do Zé</span>');
    expect(h).toContain('href="https://wa.me/5531987654321"');
    expect(h).toContain('WhatsApp<span class="sr-only"> de Bar do Zé (abre em outra aba)</span>');
    expect(h).toContain('aria-label="Feito: Bar do Zé"');
    expect(h).toContain('aria-haspopup="menu"');
  });

  it('só leitura (mensagem da cadência): sem Feito e sem Adiar', () => {
    const h = html({ mensagem: 'Oi', whatsapp: { texto: 'Oi', principal: true } });
    expect(h).toContain('Abrir WhatsApp');
    expect(h).not.toContain('Feito');
    expect(h).not.toContain('Adiar');
  });

  it('sem telefone: sem Ligar e sem WhatsApp', () => {
    const h = html({ telefone: null, whatsapp: { texto: 'Oi', principal: true }, feito: { onFeito: nada } });
    expect(h).not.toContain('wa.me');
    expect(h).not.toContain('tel:');
    expect(h).toContain('aria-label="Feito: Bar do Zé"');
  });

  it('esperando o Desfazer: a confirmação no lugar das ações', () => {
    const h = html({
      feito: { onFeito: nada },
      confirmacao: {
        texto: '✓ Ligação registrada',
        nota: 'O próximo passo “Ligar para o decisor” foi limpo.',
        rotuloAbrir: 'Marcar o próximo passo',
        onDesfazer: nada,
        onAbrir: nada,
      },
    });
    expect(h).toContain('✓ Ligação registrada');
    expect(h).toContain('aria-label="Desfazer: Bar do Zé"');
    expect(h).toContain('>Desfazer<');
    expect(h).toContain('Marcar o próximo passo');
    expect(h).toContain('O próximo passo “Ligar para o decisor” foi limpo.');
    expect(h).not.toContain('aria-label="Feito: Bar do Zé"');
  });

  it('falhou: a linha volta com a mensagem do servidor e “Tentar de novo”', () => {
    const h = html({ feito: { onFeito: nada }, erro: { mensagem: 'Alguém já marcou esta mensagem como enviada.', onTentarDeNovo: nada } });
    expect(h).toMatch(/<p role="alert"[^>]*>Alguém já marcou esta mensagem como enviada\.<\/p>/);
    expect(h).toContain('Tentar de novo');
    expect(h).toContain('aria-label="Feito: Bar do Zé"');
  });
});
