import { describe, expect, it } from 'vitest';
import { checklistDaTela, cronometro, fraseChecklist, marcarEtapa, pendenciasChecklist, type ChecklistConfigCampo } from '../checklist';
import { frasePendencia } from '../fluxo';

const CFG: ChecklistConfigCampo = {
  items: [
    { id: 'apresentacao', text: 'Apresentação pessoal e da empresa' },
    { id: 'entender_negocio', text: 'Entender o negócio do cliente' },
    { id: 'fechamento', text: 'Fechamento: cadastro ou próximo passo' },
  ],
  obrigatorio: 'nao',
  fluxos: ['simples', 'completo'],
  aberto: true,
};
const FOTO = { required: 'todas' as const, items: CFG.items.map((e) => ({ ...e, done: false, note: null })), done: 0, total: 3 };

describe('checklistDaTela', () => {
  it('flag desligada: nada (a tela é a de hoje)', () => {
    expect(checklistDaTela({ ligado: false, flow: 'simples', naServidor: true, foto: FOTO, config: CFG })).toBeNull();
  });
  it('visita no servidor: vale a FOTO; sem foto = sem checklist (mesmo com a configuração)', () => {
    expect(checklistDaTela({ ligado: true, flow: 'simples', naServidor: true, foto: FOTO, config: CFG })?.required).toBe('todas');
    expect(checklistDaTela({ ligado: true, flow: 'simples', naServidor: true, foto: null, config: CFG })).toBeNull();
  });
  it('check-in ainda na fila: a configuração guardada, só nos fluxos dela', () => {
    expect(checklistDaTela({ ligado: true, flow: 'completo', naServidor: false, config: CFG })?.items).toHaveLength(3);
    expect(checklistDaTela({ ligado: true, flow: 'completo', naServidor: false, config: { ...CFG, fluxos: ['simples'] } })).toBeNull();
  });
  it('marcas do rascunho por cima; id desconhecido some', () => {
    const c = checklistDaTela({ ligado: true, flow: 'simples', naServidor: true, foto: FOTO, marcas: [{ id: 'entender_negocio', done: true, note: 'quer preço' }, { id: 'velha', done: true }] })!;
    expect(c.items.map((e) => [e.id, e.done, e.note])).toEqual([
      ['apresentacao', false, null],
      ['entender_negocio', true, 'quer preço'],
      ['fechamento', false, null],
    ]);
  });
});

describe('marcar e o que falta (espelho do servidor)', () => {
  const c = checklistDaTela({ ligado: true, flow: 'simples', naServidor: true, foto: FOTO })!;
  it('marcar = 1 toque; o rascunho leva a lista inteira', () => {
    expect(marcarEtapa(c, 'fechamento', { done: true })).toEqual([
      { id: 'apresentacao', done: false, note: null },
      { id: 'entender_negocio', done: false, note: null },
      { id: 'fechamento', done: true, note: null },
    ]);
  });
  it('pendências e frases', () => {
    expect(pendenciasChecklist(c)).toEqual(['roteiro da visita (etapas 1, 2, 3)']);
    const quase = checklistDaTela({ ligado: true, flow: 'simples', naServidor: true, foto: FOTO, marcas: marcarEtapa(c, 'apresentacao', { done: true }).map((m) => ({ ...m, done: true })).slice(0, 2) })!;
    expect(pendenciasChecklist(quase)).toEqual(['roteiro da visita (etapa 3)']);
    expect(pendenciasChecklist({ ...c, required: 'nao' })).toEqual([]);
    expect(fraseChecklist('roteiro da visita (etapas 1, 2, 3)')).toBe('Falta marcar 3 etapas do roteiro da conversa.');
    expect(fraseChecklist('roteiro da visita (etapa 3)')).toBe('Falta marcar 1 etapa do roteiro da conversa.');
    expect(frasePendencia(['roteiro da visita (etapas 2, 3)'])).toBe('Falta marcar 2 etapas do roteiro da conversa.');
    expect(frasePendencia(['motivo', 'roteiro da visita (etapa 3)'])).toBe('Falta escolher o motivo.');
  });
  it('cronômetro mm:ss e h:mm:ss', () => {
    expect(cronometro(0, 252_000)).toBe('04:12');
    expect(cronometro(0, 3_725_000)).toBe('1:02:05');
    expect(cronometro(10_000, 0)).toBe('00:00');
  });
});
