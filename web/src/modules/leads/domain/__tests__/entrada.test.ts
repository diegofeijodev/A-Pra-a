import { describe, expect, it } from 'vitest';
import {
  acaoDoLinkWhatsApp,
  contaDaFila,
  contagemDaFila,
  eventoDoFeito,
  motivoDaFila,
  rotuloDoImportar,
  textosDesfazerImportacao,
  textoImportacaoDesfeita,
} from '../entrada';

describe('acaoDoLinkWhatsApp (decisão U1, achado 3)', () => {
  it('o clique no link só abre a conversa: nunca grava', () => {
    expect(acaoDoLinkWhatsApp()).toBe('abrir');
  });
});

describe('eventoDoFeito', () => {
  it('"Mandei mensagem" grava o mesmo evento que o link gravava', () => {
    expect(eventoDoFeito('msg_out')).toEqual({
      kind: 'msg_out',
      text: 'Mensagem enviada pela fila do dia.',
      confirmacao: 'Mensagem registrada',
    });
  });
  it('ligação e visita', () => {
    expect(eventoDoFeito('call')).toMatchObject({ kind: 'call', text: 'Ligação registrada pela fila do dia.', confirmacao: 'Ligação registrada' });
    expect(eventoDoFeito('visit')).toMatchObject({ kind: 'visit', text: 'Visita registrada pela fila do dia.', confirmacao: 'Visita registrada' });
  });
});

describe('textosDesfazerImportacao', () => {
  it('diz o arquivo, a consequência e o verbo do botão', () => {
    const t = textosDesfazerImportacao('lista.csv', 103);
    expect(t.titulo).toBe('Desfazer a importação de “lista.csv”?');
    expect(t.descricao).toBe(
      'Saem até 103 leads deste lote que ainda não tiveram contato. Os que já tiveram contato ficam no funil. Para trazer de volta, só importando de novo.',
    );
    expect(t.botao).toBe('Desfazer importação');
  });
  it('singular', () => {
    expect(textosDesfazerImportacao('a.csv', 1).descricao).toMatch(/^Saem até 1 lead deste lote/);
  });
});

describe('textoImportacaoDesfeita', () => {
  it('com e sem os que ficaram', () => {
    expect(textoImportacaoDesfeita(10, 3)).toBe('Importação desfeita: 10 leads saíram, 3 ficaram por já terem contato.');
    expect(textoImportacaoDesfeita(10, 0)).toBe('Importação desfeita: 10 leads saíram.');
    expect(textoImportacaoDesfeita(1, 1)).toBe('Importação desfeita: 1 lead saiu, 1 ficou por já ter contato.');
  });
});

describe('motivoDaFila', () => {
  it('lead novo: há quantos dias e a classe', () => {
    expect(motivoDaFila({ is_reheat: false, entered_at: '2026-10-26', lost_reason: null }, 'Casa grande', '2026-10-29')).toBe(
      'Lead novo há 3 dias · Casa grande',
    );
    expect(motivoDaFila({ is_reheat: false, entered_at: '2026-10-29', lost_reason: null }, 'Alvo', '2026-10-29')).toBe('Lead novo hoje · Alvo');
  });
  it('reaquecer: o motivo da perda', () => {
    expect(motivoDaFila({ is_reheat: true, entered_at: '2026-01-01', lost_reason: 'não respondeu' }, 'Alvo', '2026-10-29')).toBe(
      'Volta do “Perdido / reaquecer” · motivo: não respondeu',
    );
    expect(motivoDaFila({ is_reheat: true, entered_at: '2026-01-01', lost_reason: null }, 'Alvo', '2026-10-29')).toBe(
      'Volta do “Perdido / reaquecer”',
    );
  });
});

describe('contaDaFila', () => {
  it('a conta do número, com a fonte; "o limite por pessoa" só quando a fila passa do limite', () => {
    expect(contaDaFila({ total: 34, grandes: 6, mostrando: 20, quota: 20 })).toBe(
      '34 na fila (6 casas grandes); mostrando 20, o limite por pessoa. Fonte: leads em “Lead novo” e os de reaquecer com data vencida, nesta praça. Ordem: casa grande, depois alvo, depois o resto; os mais antigos na frente.',
    );
    // Cabe tudo: mostrando é a fila inteira, não o limite.
    expect(contaDaFila({ total: 12, grandes: 2, mostrando: 12, quota: 20 })).toMatch(/^12 na fila \(2 casas grandes\); mostrando 12\. Fonte:/);
    expect(contaDaFila({ total: 20, grandes: 0, mostrando: 20, quota: 20 })).not.toContain('o limite por pessoa');
    expect(contaDaFila({ total: 1, grandes: 1, mostrando: 1, quota: 20 })).toMatch(/^1 na fila \(1 casa grande\); mostrando 1\./);
  });
  it('a linha de apoio do cartão "Primeiro contato de hoje" (desenho U6)', () => {
    expect(contagemDaFila(20)).toBe('20 leads para o 1º contato hoje');
    expect(contagemDaFila(1)).toBe('1 lead para o 1º contato hoje');
    expect(contagemDaFila(0)).toBe('0 leads para o 1º contato hoje');
  });
});

describe('rotuloDoImportar (nunca "Importar 0 leads")', () => {
  it('o verbo com o número do que vai entrar', () => {
    expect(rotuloDoImportar({ vaoEntrar: 103, repetidos: 10, modo: 'ignorar' })).toEqual({ rotulo: 'Importar 103 leads', pode: true });
    expect(rotuloDoImportar({ vaoEntrar: 1, repetidos: 0, modo: 'criar' })).toEqual({ rotulo: 'Importar 1 lead', pode: true });
    // Com linhas novas, completar os repetidos vem junto: o número do botão continua o dos que entram.
    expect(rotuloDoImportar({ vaoEntrar: 5, repetidos: 3, modo: 'completar' })).toEqual({ rotulo: 'Importar 5 leads', pode: true });
  });
  it('"completar" sem linha nova: o botão diz o que faz', () => {
    expect(rotuloDoImportar({ vaoEntrar: 0, repetidos: 7, modo: 'completar' })).toEqual({ rotulo: 'Completar até 7 leads', pode: true });
    expect(rotuloDoImportar({ vaoEntrar: 0, repetidos: 1, modo: 'completar' })).toEqual({ rotulo: 'Completar até 1 lead', pode: true });
  });
  it('nada muda: travado, sem zero no botão', () => {
    expect(rotuloDoImportar({ vaoEntrar: 0, repetidos: 0, modo: 'completar' })).toEqual({ rotulo: 'Nada para importar', pode: false });
    expect(rotuloDoImportar({ vaoEntrar: 0, repetidos: 4, modo: 'ignorar' })).toEqual({ rotulo: 'Nada para importar', pode: false });
  });
});
