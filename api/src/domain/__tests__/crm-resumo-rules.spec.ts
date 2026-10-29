import { autoriaDoEvento, janelaDoDia, montarResumo, noDia, type EntradaResumo } from '../crm-resumo-rules';

const base = (o: Partial<EntradaResumo> = {}): EntradaResumo => ({
  leadsPorOrigem: {},
  eventosEtapa: [],
  freelaConfigurado: true,
  freelaLidoEm: null,
  enviadas: [],
  enviadasCadencia: 0,
  enviadasDisparo: 0,
  respostas: 0,
  ...o,
});
const num = (e: EntradaResumo, key: string) => montarResumo(e, '2026-10-27').numbers.find((x) => x.key === key)!;
const ev = (stage_to: number, author_label: string | null, author_id: string | null = null) => ({ stage_to, author_label, author_id });

describe('autoriaDoEvento', () => {
  it.each([
    [null, 'Consultor: Ana', 'representante'],
    [null, 'Freela (sincronização)', 'automatico'],
    [null, 'Automático · Freela', 'automatico'],
    [null, 'Automático', 'automatico'],
    ['u1', 'Qualquer', 'equipe'],
    ['u1', null, 'equipe'],
    [null, 'Formulário de captura', 'formulario'],
    [null, 'Cadência', 'cadencia'],
    [null, null, 'outro'],
    [null, 'Alguém', 'outro'],
  ])('%s / %s = %s', (id, label, esperado) => {
    expect(autoriaDoEvento(id, label)).toBe(esperado);
  });
});

describe('janela do dia de Brasília', () => {
  it('23:30 de 27/10 em Brasília (02:30Z de 28/10) conta em 27/10 e não em 28/10', () => {
    const at = new Date('2026-10-28T02:30:00.000Z');
    expect(noDia(at, '2026-10-27')).toBe(true);
    expect(noDia(at, '2026-10-28')).toBe(false);
  });
  it('é semiaberta: meia-noite de Brasília já é o dia seguinte', () => {
    const { to } = janelaDoDia('2026-10-27');
    expect(noDia(to, '2026-10-27')).toBe(false);
    expect(noDia(to, '2026-10-28')).toBe(true);
    expect(noDia(new Date(to.getTime() - 1), '2026-10-27')).toBe(true);
  });
});

describe('montarResumo', () => {
  it('leads novos: a conta é a soma das partes, com a fórmula do contrato', () => {
    const n = num(base({ leadsPorOrigem: { 'pesquisa automática': 8, 'visita de campo': 3, orgânico: 1 } }), 'leads_novos');
    expect(n.value).toBe(12);
    expect(n.formula).toBe('12 = 8 da busca + 3 de visitas + 1 do formulário');
    expect(n.source).toContain('27/10');
  });
  it('origens fora das três entram em "outras" só quando existem; tráfego pago soma no formulário', () => {
    const n = num(base({ leadsPorOrigem: { 'tráfego pago': 1, orgânico: 1, importação: 2 } }), 'leads_novos');
    expect(n.value).toBe(4);
    expect(n.parts.map((p) => p.value)).toEqual([0, 0, 2, 2]);
    expect(n.formula).toBe('4 = 0 da busca + 0 de visitas + 2 do formulário + 2 de outras origens');
  });
  it('mudança de etapa: qualquer evento com stage_to, separada por autoria e por destino', () => {
    const e = base({
      eventosEtapa: [ev(5, 'Automático · Freela'), ev(5, 'Freela (sincronização)'), ev(8, 'Automático'), ev(3, null, 'u1'), ev(4, 'Consultor: Ana')],
    });
    const m = num(e, 'mudancas_etapa');
    expect(m.value).toBe(5);
    expect(m.formula).toBe('5 = 3 automáticas + 1 da equipe + 1 de visita');
    const d = num(e, 'mudancas_etapa_destino');
    expect(d.parts).toEqual([
      { label: 'para Conversa aberta', value: 1 },
      { label: 'para Reunião ou visita marcada', value: 1 },
      { label: 'para Cadastrado', value: 2 },
      { label: 'para Perdido / reaquecer', value: 1 },
    ]);
  });
  it('sem o Freela configurado, os números do Freela vêm null (a tela escreve "—")', () => {
    const n = num(base({ freelaConfigurado: false, eventosEtapa: [ev(5, 'Automático · Freela')] }), 'freela');
    expect(n.value).toBeNull();
    expect(n.parts).toEqual([]);
    expect(n.formula).toBe('Precisa da conexão com o Freela.');
  });
  it('Freela: conta só 5, 6 e 7 vindos do Freela e diz a hora da leitura', () => {
    const e = base({
      freelaLidoEm: '14h00',
      eventosEtapa: [ev(5, 'Automático · Freela'), ev(5, 'Freela (sincronização)'), ev(6, 'Automático · Freela'), ev(5, 'Automático'), ev(5, null, 'u1')],
    });
    const n = num(e, 'freela');
    expect(n.value).toBe(3);
    expect(n.formula).toBe('3 = 2 cadastros + 1 primeira contratação + 0 clientes ativos');
    expect(n.source).toContain('lido às 14h00');
    expect(n.source).toContain('já tinha 2 ou mais vagas pagas quando o Praça leu o quadro pela primeira vez');
    expect(n.source).toContain('voltou a contratar num dia depois da primeira vaga paga');
    expect(n.source).not.toContain('2 contratações');
    expect(n.source).toContain('conta mudanças, não leads diferentes');
  });
  it('mensagens por modo e respostas', () => {
    const e = base({ enviadas: [{ mode: 'freela', n: 3 }, { mode: 'fila', n: 1 }], enviadasDisparo: 1, respostas: 2 });
    expect(num(e, 'mensagens_enviadas').formula).toBe('4 = 3 entregues ao Freela + 0 marcadas pela cadência + 1 marcada à mão (disparo)');
    expect(num(e, 'respostas').value).toBe(2);
  });
  it('UX final, achado 3: a cadência no modo Fila manual não é "marcada à mão"; as partes somam o total', () => {
    const e = base({ enviadas: [{ mode: 'freela', n: 2 }, { mode: 'fila', n: 7 }], enviadasCadencia: 4, enviadasDisparo: 3 });
    const n = num(e, 'mensagens_enviadas');
    expect(n.value).toBe(9);
    expect(n.parts).toEqual([
      { label: 'entregues ao Freela', value: 2 },
      { label: 'marcadas pela cadência', value: 4 },
      { label: 'marcadas à mão (disparos)', value: 3 },
      { label: 'de outras origens', value: 0 },
    ]);
    expect(n.parts.reduce((a, p) => a + p.value, 0)).toBe(n.value);
    expect(n.formula).toBe('9 = 2 entregues ao Freela + 4 marcadas pela cadência + 3 marcadas à mão (disparos)');
    expect(n.source).toContain('No modo Fila manual, a cadência marca a mensagem como enviada no horário dela, mesmo que ninguém tenha mandado.');
  });
  it('mensagem fora do Freela sem cadência nem disparo entra em "de outra origem" (a soma fecha sempre)', () => {
    const e = base({ enviadas: [{ mode: 'fila', n: 5 }], enviadasCadencia: 3, enviadasDisparo: 1 });
    const n = num(e, 'mensagens_enviadas');
    expect(n.formula).toBe('5 = 0 entregues ao Freela + 3 marcadas pela cadência + 1 marcada à mão (disparo) + 1 de outra origem');
    expect(n.parts.reduce((a, p) => a + p.value, 0)).toBe(5);
  });
  it('concordância: 1 no singular, 0 e 2 ou mais no plural', () => {
    const e = base({ eventosEtapa: [ev(5, 'Automático')], enviadas: [{ mode: 'freela', n: 1 }], respostas: 1 });
    expect(num(e, 'mudancas_etapa').formula).toBe('1 = 1 automática + 0 da equipe');
    expect(num(e, 'mensagens_enviadas').formula).toBe('1 = 1 entregue ao Freela + 0 marcadas pela cadência + 0 marcadas à mão (disparos)');
    expect(num(e, 'respostas').formula).toBe('1 = 1 resposta registrada');
    expect(num(base({ eventosEtapa: [ev(5, 'Automático · Freela'), ev(6, 'Automático · Freela')] }), 'freela').formula).toBe(
      '2 = 1 cadastro + 1 primeira contratação + 0 clientes ativos',
    );
    expect(num(base({ eventosEtapa: [ev(7, 'Automático · Freela')] }), 'freela').formula).toBe(
      '1 = 0 cadastros + 0 primeiras contratações + 1 cliente ativo',
    );
  });
  it('dia vazio: tudo zero, sem quebrar', () => {
    const r = montarResumo(base(), '2026-10-27').numbers;
    expect(r.map((x) => x.value)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
