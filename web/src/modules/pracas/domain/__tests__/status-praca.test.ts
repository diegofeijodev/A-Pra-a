import { describe, expect, it } from 'vitest';
import { cidadeUf, linhaClientes, periodoCurto, ROTULO_SITUACAO_PRACA, situacaoDaPraca } from '../status-praca';

const P = { start_date: '2026-10-27', end_date: '2027-02-01' };

describe('situação da praça pelas datas (E5.2, UX §4.2; dia de Brasília)', () => {
  it('borda: início HOJE já é "Em andamento"; início amanhã ainda é "Planejamento"', () => {
    expect(situacaoDaPraca(P, '2026-10-27')).toBe('em_andamento');
    expect(situacaoDaPraca(P, '2026-10-26')).toBe('planejamento');
  });
  it('borda: fim HOJE ainda é "Em andamento"; fim ONTEM é "Concluída"', () => {
    expect(situacaoDaPraca(P, '2027-02-01')).toBe('em_andamento');
    expect(situacaoDaPraca(P, '2027-02-02')).toBe('concluida');
  });
  it('praça de um dia só e virada de ano', () => {
    const umDia = { start_date: '2026-12-31', end_date: '2026-12-31' };
    expect(situacaoDaPraca(umDia, '2026-12-30')).toBe('planejamento');
    expect(situacaoDaPraca(umDia, '2026-12-31')).toBe('em_andamento');
    expect(situacaoDaPraca(umDia, '2027-01-01')).toBe('concluida');
  });
  it('rótulos da Lovable', () => {
    expect(Object.values(ROTULO_SITUACAO_PRACA)).toEqual(['Planejamento', 'Em andamento', 'Concluída']);
  });
});

describe('textos do cartão da praça', () => {
  it('Cidade/UF: a cidade-sede do IBGE quando há; senão a cidade digitada', () => {
    expect(cidadeUf({ city: 'Belo Horizonte · MG', cobertura: { cidade: 'Belo Horizonte', uf: 'MG' } })).toBe('Belo Horizonte/MG');
    expect(cidadeUf({ city: 'São Paulo · SP', cobertura: null })).toBe('São Paulo/SP');
    expect(cidadeUf({ city: 'Moema', cobertura: null })).toBe('Moema');
  });
  it('"N clientes" com leads_count; sem ele (API antiga), o período', () => {
    expect(linhaClientes({ ...P, leads_count: 0 })).toBe('0 clientes');
    expect(linhaClientes({ ...P, leads_count: 1 })).toBe('1 cliente');
    expect(linhaClientes({ ...P, leads_count: 3406 })).toBe('3.406 clientes');
    expect(linhaClientes(P)).toBe('27/10 → 01/02');
    expect(periodoCurto(P)).toBe('27/10 → 01/02');
  });
});
