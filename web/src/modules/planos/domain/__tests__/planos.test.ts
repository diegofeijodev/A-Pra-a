import { describe, expect, it } from 'vitest';
import {
  alternarPerfil,
  chavePrevia,
  diaCurto,
  featuresLoteDSchema,
  formatarDuracao,
  opcoesDePerfil,
  PERFIS_SEM_SEGMENTOS,
  planSummarySchema,
  planViewSchema,
  previaSchema,
  rotuloGeracao,
  semanasDoMes,
  textoCriterio,
  textoPerfil,
  textoPublicada,
  tiposParaEnviar,
} from '../planos';

const plano = {
  id: 'p1', praca_id: 'pr', area_id: null, area_name: null, kind: 'geral' as const, parent_lead_id: null, travel_mode: 'a_pe' as const,
  modelo_tempo: 'lovable' as const, item_count: 14, assigned_count: 3, lead_count: 412, truncated: false,
  created_at: '2026-10-22T17:10:00.000Z', created_by: 'u', archived_at: null,
};

describe('planos — wire (§39) e textos (UX §3.4)', () => {
  it('features ausentes (servidor antigo) = desligadas', () => {
    expect(featuresLoteDSchema.parse({})).toEqual({ route_plans: false, malls: false });
  });
  it('geração salva: data de Brasília · modo · rotas · publicadas', () => {
    expect(rotuloGeracao(plano)).toBe('22/10 14h10 · a pé · 14 rotas · 3 publicadas');
    expect(rotuloGeracao({ ...plano, item_count: 1, assigned_count: 0, travel_mode: 'carro' })).toBe('22/10 14h10 · carro/moto · 1 rota');
  });
  it('dia curto, duração e o toast da publicação', () => {
    expect(diaCurto('2026-10-23')).toBe('sex 23/10');
    expect(formatarDuracao(381)).toBe('6h21');
    expect(formatarDuracao(45)).toBe('45 min');
    expect(textoPublicada('Rota 01', 'Ana', '2026-10-23')).toBe('Rota 01 publicada para Ana em sex 23/10. Ela vê na tela Hoje nesse dia.');
  });
  it('o ⓘ descreve o critério que vale (padrão: área) e diz que a marcação à mão vale mais; sem "voucher"/"status"', () => {
    const t = textoCriterio({ criterio: 'area', area_min_m2: 20000, lojas_min: 50, raio_lojas_m: 300, fora_da_rota_geral: true });
    expect(t).toContain('pelo menos 20.000 m² de área');
    expect(t).toContain('a marcação vale mais que o critério');
    expect(t.toLowerCase()).not.toMatch(/voucher|status|check-in|checkout/);
  });
  it('calendário: semanas de domingo a sábado com o mês inteiro', () => {
    const s = semanasDoMes(2026, 10);
    expect(s[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(s.flat().filter(Boolean)).toHaveLength(31);
    expect(s.every((w) => w.length === 7)).toBe(true);
  });
  it('a visão do plano aceita item sem publicação e campo aditivo do servidor', () => {
    const v = planViewSchema.parse({
      ...plano, params: {}, extra: 1,
      items: [{ id: 'i1', seq: 1, name: 'Rota 01', color: '#2563eb', lead_ids: ['l1'], distance_m: 0, est_minutes: 80, stops: [], bairro_principal: null,
        do_centro_m: null, conta_lovable: { minutos: 80, texto: 'x' }, conta_roteiro: { minutos: 8, texto: 'y', coube: true, fora: 0 }, assigned: null }],
    });
    expect(v.items[0]!.assigned).toBeNull();
  });
});

describe('perfil dos clientes (redesenho E6, §39.4/§39.5)', () => {
  const previa = { lead_count: 38, truncated: false, por_rota: 20, rotas_min: 2, conta: 'x' };

  it('prévia e geração com e sem os campos novos (servidor antigo não manda)', () => {
    expect(previaSchema.parse(previa).lead_count_total).toBeUndefined();
    expect(previaSchema.parse({ ...previa, lead_count_total: 120 }).lead_count_total).toBe(120);
    expect(planSummarySchema.parse(plano).types).toBeUndefined();
    expect(planSummarySchema.parse({ ...plano, types: null }).types).toBeNull();
    expect(planSummarySchema.parse({ ...plano, types: [{ slug: 'bar', label: 'Bar' }] }).types).toEqual([{ slug: 'bar', label: 'Bar' }]);
  });

  it('texto da geração: "Perfil: Bar, Restaurante" ou "Todos os perfis"', () => {
    expect(textoPerfil([{ label: 'Bar' }, { label: 'Restaurante' }])).toBe('Perfil: Bar, Restaurante');
    expect(textoPerfil([{ label: 'Bar' }])).toBe('Perfil: Bar');
    expect(textoPerfil(null)).toBe('Todos os perfis');
    expect(textoPerfil(undefined)).toBe('Todos os perfis');
    expect(textoPerfil([])).toBe('Todos os perfis');
  });

  it('pílulas: segmentos ATIVOS pelo rótulo; sem a lista, os 5 de hoje no singular (iguais aos da foto da API)', () => {
    const segs = [
      { slug: 'restaurante', label: 'Restaurante', active: true },
      { slug: 'hotel', label: 'Hotel', active: false },
      { slug: 'bar', label: 'Bar', active: true },
      { slug: 'cafe', label: 'Café', active: true },
    ];
    expect(opcoesDePerfil(segs).map((p) => p.slug)).toEqual(['bar', 'cafe', 'restaurante']);
    expect(opcoesDePerfil(null)).toEqual([...PERFIS_SEM_SEGMENTOS]);
    expect(opcoesDePerfil(undefined).map((p) => p.label)).toEqual(['Bar', 'Café', 'Lanchonete', 'Padaria', 'Restaurante']);
  });

  it('marcar e desmarcar; o que vai para a API sai na ordem das opções, sem o que deixou de ser opção', () => {
    expect(alternarPerfil([], 'bar')).toEqual(['bar']);
    expect(alternarPerfil(['bar', 'padaria'], 'bar')).toEqual(['padaria']);
    const opcoes = opcoesDePerfil(null);
    expect(tiposParaEnviar(['restaurante', 'bar'], opcoes)).toEqual(['bar', 'restaurante']);
    expect(tiposParaEnviar(['bar', 'pizzaria'], opcoes)).toEqual(['bar']);
    expect(tiposParaEnviar([], opcoes)).toEqual([]);
  });

  it('chave da prévia: o mesmo conjunto em qualquer ordem de clique dá a mesma chave; sem perfil, a parte vazia', () => {
    const opcoes = opcoesDePerfil(null);
    const a = chavePrevia({ praca_id: 'pr', por_rota: 20, types: tiposParaEnviar(['restaurante', 'bar'], opcoes) });
    const b = chavePrevia({ praca_id: 'pr', por_rota: 20, types: tiposParaEnviar(['bar', 'restaurante'], opcoes) });
    expect(a).toEqual(b);
    expect(a).toEqual(['planos', 'previa', 'pr', '', 20, 'bar,restaurante']);
    expect(chavePrevia({ praca_id: 'pr', area_id: 'ar', por_rota: 20 })).toEqual(['planos', 'previa', 'pr', 'ar', 20, '']);
  });
});
