import { describe, expect, it } from 'vitest';
import { filtrarRepresentantes, linhaDoDia } from '../representantes';

const ANA = { name: 'Ana Júlia', email: 'ana@praca.local', phone: '(31) 98888-1234', active: true, praca_id: 'p1' };
const BIA = { name: 'Bia Souza', email: 'bia@praca.local', phone: '(11) 97777-0000', active: false, praca_id: 'p2', praca_ids: ['p2', 'p1'] };
const CAU = { name: 'Cauã', email: 'caua@praca.local', phone: '(21) 96666-5555', active: true, praca_id: 'p2' };
const TODOS = [ANA, BIA, CAU];
const sem = { q: '', situacao: 'todos' as const, pracaId: '' };
const nomes = (l: { name: string }[]) => l.map((c) => c.name);

describe('filtros da lista de representantes (E5.5, Lovable)', () => {
  it('sem filtro, todos, na mesma ordem', () => {
    expect(nomes(filtrarRepresentantes(TODOS, sem))).toEqual(['Ana Júlia', 'Bia Souza', 'Cauã']);
  });
  it('busca por nome sem acento nem caixa, por e-mail e pelos dígitos do telefone (3 ou mais)', () => {
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, q: 'JULIA' }))).toEqual(['Ana Júlia']);
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, q: 'caua' }))).toEqual(['Cauã']);
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, q: 'bia@' }))).toEqual(['Bia Souza']);
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, q: '7777' }))).toEqual(['Bia Souza']);
    // Dois dígitos não bastam (casariam o DDD de todo mundo).
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, q: '31' }))).toEqual([]);
  });
  it('situação: ativos e inativos', () => {
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, situacao: 'ativos' }))).toEqual(['Ana Júlia', 'Cauã']);
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, situacao: 'inativos' }))).toEqual(['Bia Souza']);
  });
  it('praça: a principal, ou o conjunto quando o servidor manda (várias praças, F2)', () => {
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, pracaId: 'p1' }))).toEqual(['Ana Júlia', 'Bia Souza']);
    expect(nomes(filtrarRepresentantes(TODOS, { ...sem, pracaId: 'p2' }))).toEqual(['Bia Souza', 'Cauã']);
  });
});

describe('linha do dia na coluna Status (UX §4.7)', () => {
  const h = () => '14:32';
  it('não começou / encerrou / em rota agora, com o último ponto', () => {
    expect(linhaDoDia({ status: 'nao_iniciou', visits: 0, last_point_at: null }, h)).toBe('não começou');
    expect(linhaDoDia({ status: 'encerrou', visits: 12, last_point_at: 'x' }, h)).toBe('encerrou · 12 visitas');
    expect(linhaDoDia({ status: 'em_jornada', visits: 1, last_point_at: '2026-10-27T17:32:00Z' }, h)).toBe('em rota agora · 1 visita · último ponto 14:32');
    expect(linhaDoDia({ status: 'em_jornada', visits: 3, last_point_at: null }, h)).toBe('em rota agora · 3 visitas · último ponto —');
  });
  it('estabelecimento fechado conta à parte (fora da meta)', () => {
    expect(linhaDoDia({ status: 'encerrou', visits: 5, closed: 2, last_point_at: null }, h)).toBe('encerrou · 3 visitas (+ 2 fechados)');
    expect(linhaDoDia({ status: 'encerrou', visits: 2, closed: 1, last_point_at: null }, h)).toBe('encerrou · 1 visita (+ 1 fechado)');
  });
});
