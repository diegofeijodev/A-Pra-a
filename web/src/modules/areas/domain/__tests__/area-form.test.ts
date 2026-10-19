import { describe, expect, it } from 'vitest';
import { dentroDoBrasil, erroDoFormulario, rotuloRaio, visaoInicial } from '../area-form';

const ok = { name: 'Moema', lat: -23.6021, lng: -46.6658, radius_m: 1500 };

describe('erroDoFormulario', () => {
  it('formulário válido => null', () => {
    expect(erroDoFormulario(ok)).toBeNull();
  });
  it('sem centro => pede o clique no mapa', () => {
    expect(erroDoFormulario({ ...ok, lat: null, lng: null })).toBe('Clique no mapa para marcar o centro da área.');
  });
  it('nome vazio ou só espaços', () => {
    expect(erroDoFormulario({ ...ok, name: '   ' })).toBe('Dê um nome à área (ex.: Moema).');
  });
  it('raio nas bordas 200 e 5000 passa; fora não', () => {
    expect(erroDoFormulario({ ...ok, radius_m: 200 })).toBeNull();
    expect(erroDoFormulario({ ...ok, radius_m: 5000 })).toBeNull();
    expect(erroDoFormulario({ ...ok, radius_m: 199 })).toBe('O raio mínimo é 200 metros.');
    expect(erroDoFormulario({ ...ok, radius_m: 5001 })).toBe('O raio máximo é 5000 metros.');
  });
  it('raio quebrado ou NaN', () => {
    expect(erroDoFormulario({ ...ok, radius_m: 1500.5 })).toMatch(/entre 200 e 5000/);
    expect(erroDoFormulario({ ...ok, radius_m: NaN })).toMatch(/entre 200 e 5000/);
  });
  it('centro fora do Brasil', () => {
    expect(erroDoFormulario({ ...ok, lat: 38.7, lng: -9.1 })).toBe('O centro da área precisa estar dentro do Brasil.');
  });
});

describe('dentroDoBrasil', () => {
  it('São Paulo sim, Buenos Aires não', () => {
    expect(dentroDoBrasil(-23.6, -46.66)).toBe(true);
    expect(dentroDoBrasil(-34.6, -58.4)).toBe(false);
  });
});

describe('visaoInicial', () => {
  it('praça sem cobertura e sem áreas abre no Brasil inteiro', () => {
    expect(visaoInicial({ cobertura: null }, [])).toEqual({ center: [-14.2, -51.9], zoom: 4 });
  });
  it('praça com cobertura abre no centro dela', () => {
    expect(visaoInicial({ cobertura: { lat: -19.9, lon: -43.9 } }, []).center).toEqual([-19.9, -43.9]);
  });
  it('áreas existentes vencem a cobertura (praça Moema: sem IBGE)', () => {
    const v = visaoInicial({ cobertura: null }, [
      { lat: -23.6, lng: -46.6 },
      { lat: -23.4, lng: -46.8 },
    ]);
    expect(v.center[0]).toBeCloseTo(-23.5);
    expect(v.center[1]).toBeCloseTo(-46.7);
    expect(v.zoom).toBe(13);
  });
});

describe('rotuloRaio', () => {
  it('metros abaixo de 1 km, km acima', () => {
    expect(rotuloRaio(800)).toBe('800 m');
    expect(rotuloRaio(1500)).toBe('1,5 km');
    expect(rotuloRaio(5000)).toBe('5 km');
  });
});
