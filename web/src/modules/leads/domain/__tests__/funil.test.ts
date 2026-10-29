import { describe, expect, it } from 'vitest';
import {
  SEM_DADO,
  corDaBolinha,
  diasParado,
  estadoDoQuadro,
  nomeSeloFreela,
  textoConversao,
  textoDeSelos,
  textosDasMetricas,
  totalDaEtapa,
} from '../funil';
import { fmtBRL } from '@/lib/format';

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

describe('números do funil (UX §3.4)', () => {
  it('sem as métricas (carregando ou erro): "—" nos seis, sem alerta (nunca um 0 que pareça resultado)', () => {
    expect(SEM_DADO).toBe('—');
    expect(textosDasMetricas(undefined)).toEqual({
      total: '—',
      contatado: '—',
      ativo: '—',
      dias: '—',
      parados: '—',
      valor: '—',
      alertaParados: false,
    });
  });
  it('com as métricas: o número, a conta das taxas e o alerta dos parados', () => {
    const t = textosDasMetricas({
      total: 84,
      conv_contact: 30,
      conv_active: 20,
      conv_contact_n: 9,
      conv_contact_de: 30,
      conv_active_n: 2,
      conv_active_de: 10,
      avg_days: 12,
      stalled: 5,
      critical: 1,
      lost: 3,
      pipeline: 48000,
    });
    expect(t).toEqual({
      total: '84',
      contatado: '9 de 30 = 30%',
      ativo: '2 de 10 = 20%',
      dias: '12 dias',
      parados: '5',
      valor: 'R$ 48k',
      alertaParados: true,
    });
    expect(textosDasMetricas({ total: 0, conv_contact: 0, conv_active: 0, avg_days: 0, stalled: 0, critical: 0, lost: 0, pipeline: 0 }).alertaParados).toBe(
      false,
    );
  });
});

describe('estadoDoQuadro (UX §3.4, Estados)', () => {
  it('erro vence; sem leitura é carregando', () => {
    expect(estadoDoQuadro({ erro: true, lido: true, total: 3, filtrados: 3 })).toBe('erro');
    expect(estadoDoQuadro({ erro: false, lido: false, total: 0, filtrados: 0 })).toBe('carregando');
  });
  it('praça sem lead, filtro sem resultado e o quadro', () => {
    expect(estadoDoQuadro({ erro: false, lido: true, total: 0, filtrados: 0 })).toBe('sem-leads');
    expect(estadoDoQuadro({ erro: false, lido: true, total: 4, filtrados: 0 })).toBe('sem-resultado');
    expect(estadoDoQuadro({ erro: false, lido: true, total: 4, filtrados: 2 })).toBe('quadro');
  });
});

describe('totalDaEtapa (UX final, achado 17)', () => {
  it('"1 lead" no singular; 0 e 2 ou mais no plural', () => {
    expect(totalDaEtapa(1, 1500)).toBe(`1 lead · ${fmtBRL(1500)}`);
    expect(totalDaEtapa(0, 0)).toBe(`0 leads · ${fmtBRL(0)}`);
    expect(totalDaEtapa(12, 9000)).toBe(`12 leads · ${fmtBRL(9000)}`);
  });
});
