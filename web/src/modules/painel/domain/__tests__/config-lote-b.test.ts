import { describe, expect, it } from 'vitest';
import { configLoteBSchema, corpoChecklist, errosChecklist, ETAPAS_LOVABLE, FORM_CHECKLIST_LOVABLE, formChecklist, moverEtapa, toquesObrigatorios } from '../config-lote-b';

describe('configuração do lote B (checklist)', () => {
  it('servidor sem as chaves novas = padrão da Lovable e sem features', () => {
    const c = configLoteBSchema.parse({ meta_diaria: 30 });
    expect(c.checklist_items).toEqual(ETAPAS_LOVABLE);
    expect(c.features).toBeUndefined();
    expect(formChecklist(c)).toEqual(FORM_CHECKLIST_LOVABLE);
  });
  it('as 7 etapas sem "voucher"', () => {
    expect(ETAPAS_LOVABLE).toHaveLength(7);
    expect(JSON.stringify(ETAPAS_LOVABLE).toLowerCase()).not.toContain('voucher');
  });
  it('corpo do PUT: etapa nova sem id, texto aparado, fluxos na ordem', () => {
    const f = { ...FORM_CHECKLIST_LOVABLE, itens: [{ id: 'apresentacao', text: ' Oi ' }, { text: 'Nova' }], completo: false };
    expect(corpoChecklist(f)).toEqual({
      checklist_items: [{ id: 'apresentacao', text: 'Oi' }, { text: 'Nova' }],
      checklist_obrigatorio: 'nao',
      checklist_fluxos: ['simples'],
      checklist_aberto: true,
    });
  });
  it('erros, mover e a conta dos toques', () => {
    expect(errosChecklist({ ...FORM_CHECKLIST_LOVABLE, itens: [] })).toEqual(['Deixe ao menos uma etapa.']);
    expect(errosChecklist({ ...FORM_CHECKLIST_LOVABLE, itens: [{ text: '  ' }] })).toEqual(['Etapa 1: escreva o texto.']);
    expect(moverEtapa([{ text: 'a' }, { text: 'b' }], 0, 1)).toEqual([{ text: 'b' }, { text: 'a' }]);
    expect(moverEtapa([{ text: 'a' }], 0, -1)).toEqual([{ text: 'a' }]);
    expect(toquesObrigatorios(7, 30)).toBe('Obrigatório soma 1 toque por etapa: 7 × 30 visitas = 210 toques por dia.');
  });
});
