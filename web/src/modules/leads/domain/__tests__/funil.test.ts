import { describe, expect, it } from 'vitest';
import {
  corDaBolinha,
  diasParado,
  nomeSeloFreela,
  textoConversao,
  textoDeSelos,
} from '../funil';

describe('textoConversao', () => {
  it('mostra a conta quando a API manda n e de', () => {
    expect(textoConversao(2, 4, 50)).toBe('2 de 4 = 50%');
    expect(textoConversao(9, 30, 30)).toBe('9 de 30 = 30%');
  });
  it('sem n/de (API antiga) cai no % de hoje', () => {
    expect(textoConversao(undefined, undefined, 50)).toBe('50%');
    expect(textoConversao(undefined, undefined, undefined)).toBe('0%');
  });
  it('base zero não inventa porcentagem', () => {
    expect(textoConversao(0, 0, 0)).toBe('0 de 0');
  });
});

describe('selos', () => {
  it('Freela no plural e no singular, só com 1 ou mais', () => {
    expect(nomeSeloFreela(2)).toBe('Freela: 2 contratações pagas');
    expect(nomeSeloFreela(1)).toBe('Freela: 1 contratação paga');
    expect(nomeSeloFreela(0)).toBeNull();
    expect(nomeSeloFreela(null)).toBeNull();
  });
  it('Automático só com last_stage_auto', () => {
    expect(textoDeSelos({ last_stage_auto: true, freela_hirings: 2 })).toEqual([
      'Automático',
      'Freela: 2 contratações pagas',
    ]);
    expect(textoDeSelos({ last_stage_auto: false, freela_hirings: null })).toEqual([]);
    expect(textoDeSelos(undefined)).toEqual([]);
  });
});

describe('diasParado', () => {
  it('escreve os dias parado', () => {
    expect(diasParado(12)).toBe('12 dias parado');
    expect(diasParado(1)).toBe('1 dia parado');
    expect(diasParado(0)).toBe('Hoje');
  });
});

describe('corDaBolinha', () => {
  it('devolve só a cor da etapa para a bolinha, nunca para texto', () => {
    expect(corDaBolinha({ n: 5, color: '#ECA826' })).toEqual({ backgroundColor: '#ECA826' });
    expect(corDaBolinha({ n: 5, color: '#ECA826' })).not.toHaveProperty('color');
  });
});
