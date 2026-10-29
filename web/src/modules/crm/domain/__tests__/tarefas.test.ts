import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemTarefaView, ResumoCrmView } from '../../infrastructure/crm.api';
import {
  ESPERA_DESFAZER_MS,
  OPCOES_FEITO,
  TEXTOS_GRUPO,
  anuncioDaAcao,
  apoioDaLinha,
  contaDasTarefas,
  criarFilaAdiada,
  fontesDoResumo,
  linhasDoResumo,
  linkLigar,
  linkWhatsApp,
  motivoDaTarefa,
  notaDoPassoLimpo,
  opcoesAdiar,
  pessoaDaConsulta,
  resumoZerado,
  textoAdiado,
  textoNadaSeu,
  textoPrimeiroContato,
  tituloDaContagem,
} from '../tarefas';

const HOJE = '2026-10-28'; // quarta

const item = (extra: Partial<ItemTarefaView> = {}): ItemTarefaView => ({
  lead_id: 'l1',
  lead_name: 'Bar do Zé',
  owner_id: null,
  stage: 2,
  phone: '31987654321',
  ...extra,
});

describe('textos dos grupos (UX §3.1.4)', () => {
  it('títulos e explicações exatos', () => {
    expect(TEXTOS_GRUPO.send).toEqual({
      titulo: 'Mandar mensagem',
      explicacao: 'Mensagens das cadências e dos disparos marcadas para hoje. Você manda pelo WhatsApp e marca como feito.',
    });
    expect(TEXTOS_GRUPO.hot_visit).toEqual({
      titulo: 'Lead quente da visita',
      explicacao: 'Gostaram na visita do representante e ninguém da equipe procurou depois.',
    });
    expect(TEXTOS_GRUPO.next_step).toEqual({
      titulo: 'Próximo passo vencido',
      explicacao: 'Combinados com data de hoje ou de antes, inclusive as ligações das cadências.',
    });
    expect(TEXTOS_GRUPO.stalled).toEqual({
      titulo: 'Conversa parada',
      explicacao: 'Conversa aberta ou reunião marcada, sem contato há 5 dias ou mais.',
    });
    expect(TEXTOS_GRUPO.first_vacancy).toEqual({
      titulo: 'Ajudar a publicar a 1ª vaga',
      explicacao: 'Cadastrados no Freela há 3 dias ou mais, sem vaga vista lá.',
    });
    // Grupo só de leitura (desenho §12.1 item 1): a UX não tem texto; o título é o do desenho.
    expect(TEXTOS_GRUPO.cadence_send.titulo).toBe('Mensagens das cadências de hoje');
  });
});

describe('motivo de cada linha (UX §3.1.4)', () => {
  it('T1: origem · para hoje | atrasada desde', () => {
    // 28/10 09h00 em Brasília = 12h00Z.
    const hoje = item({ send_id: 's1', origin_label: 'Disparo Verão', scheduled_at: '2026-10-28T12:00:00.000Z' });
    expect(motivoDaTarefa('send', hoje, HOJE)).toBe('Disparo Verão · para hoje');
    // 26/10 23h30 em Brasília = 27/10 02h30Z: conta pelo dia de Brasília (seg 26/10), nunca pelo UTC.
    const atrasada = item({ send_id: 's2', origin_label: 'Disparo Verão', scheduled_at: '2026-10-27T02:30:00.000Z' });
    expect(motivoDaTarefa('send', atrasada, HOJE)).toBe('Disparo Verão · atrasada desde seg 26/10');
  });

  it('cadência do dia (só leitura)', () => {
    const c = item({ send_id: 's3', origin_label: 'Cadência Boas-vindas', readonly: true, scheduled_at: '2026-10-28T12:00:00.000Z' });
    expect(motivoDaTarefa('cadence_send', c, HOJE)).toBe('Cadência Boas-vindas · marcada como enviada hoje');
  });

  it('T2: visitado por · interesse alto | médio · ninguém procurou depois', () => {
    const alto = item({ visit: { consultant_name: 'Ana', day: '2026-10-26', interest: 'alto' } });
    expect(motivoDaTarefa('hot_visit', alto, HOJE)).toBe('Visitado por Ana em seg 26/10 · interesse alto · ninguém procurou depois');
    const medio = item({ visit: { consultant_name: 'Ana', day: '2026-10-26', interest: 'medio' } });
    expect(motivoDaTarefa('hot_visit', medio, HOJE)).toBe('Visitado por Ana em seg 26/10 · interesse médio · ninguém procurou depois');
  });

  it('T3: “passo” era para hoje | dia, há N dias; da cadência', () => {
    const deHoje = item({ next_step: { what: 'Ligar para o decisor', date: HOJE, from_cadence: false } });
    expect(motivoDaTarefa('next_step', deHoje, HOJE)).toBe('“Ligar para o decisor” era para hoje');
    const atrasado = item({ next_step: { what: 'Ligar para o decisor', date: '2026-10-26', from_cadence: false } });
    expect(motivoDaTarefa('next_step', atrasado, HOJE)).toBe('“Ligar para o decisor” era para seg 26/10, há 2 dias');
    const ontem = item({ next_step: { what: 'Mandar proposta', date: '2026-10-27', from_cadence: false } });
    expect(motivoDaTarefa('next_step', ontem, HOJE)).toBe('“Mandar proposta” era para ter 27/10, há 1 dia');
    const semTexto = item({ next_step: { what: null, date: HOJE, from_cadence: false } });
    expect(motivoDaTarefa('next_step', semTexto, HOJE)).toBe('Próximo passo era para hoje');
    const cadencia = item({ next_step: { what: 'Ligar para o decisor', date: HOJE, from_cadence: true } });
    expect(motivoDaTarefa('next_step', cadencia, HOJE)).toBe('Ligação da cadência “Ligar para o decisor” · era para hoje');
    // O motor grava "Ligação da cadência" quando o passo não tem tarefa: sem repetir o texto.
    const generica = item({ next_step: { what: 'Ligação da cadência', date: HOJE, from_cadence: true } });
    expect(motivoDaTarefa('next_step', generica, HOJE)).toBe('Ligação da cadência · era para hoje');
  });

  it('T4: etapa · último contato dia, há N dias (ou na etapa desde, sem contato)', () => {
    const conversa = item({ stage: 3, last_contact_day: '2026-10-22', stage_since: '2026-10-10' });
    expect(motivoDaTarefa('stalled', conversa, HOJE)).toBe('Conversa aberta · último contato qui 22/10, há 6 dias');
    const reuniao = item({ stage: 4, last_contact_day: '2026-10-22', stage_since: '2026-10-10' });
    expect(motivoDaTarefa('stalled', reuniao, HOJE)).toBe('Reunião ou visita marcada · último contato qui 22/10, há 6 dias');
    const semContato = item({ stage: 3, stage_since: '2026-10-20' });
    expect(motivoDaTarefa('stalled', semContato, HOJE)).toBe('Conversa aberta · nenhum contato registrado, na etapa desde ter 20/10, há 8 dias');
  });

  it('T5: cadastrado desde, há N dias · nenhuma vaga vista no Freela', () => {
    const t5 = item({ stage: 5, stage_since: '2026-10-23' });
    expect(motivoDaTarefa('first_vacancy', t5, HOJE)).toBe('Cadastrado desde sex 23/10, há 5 dias · nenhuma vaga vista no Freela');
  });
});

describe('linkWhatsApp', () => {
  it('põe o 55 e codifica o texto', () => {
    expect(linkWhatsApp('31987654321', 'Oi')).toBe('https://wa.me/5531987654321?text=Oi');
    expect(linkWhatsApp('(31) 98765-4321', 'Oi, Zé! Tudo bem?')).toBe(
      'https://wa.me/5531987654321?text=Oi%2C%20Z%C3%A9!%20Tudo%20bem%3F',
    );
  });

  it('não dobra o 55 de quem já tem', () => {
    expect(linkWhatsApp('5531987654321', 'Oi')).toBe('https://wa.me/5531987654321?text=Oi');
    expect(linkWhatsApp('+55 31 98765-4321')).toBe('https://wa.me/5531987654321');
  });

  it('Ligar: tel: com o 55', () => {
    expect(linkLigar('(31) 98765-4321')).toBe('tel:+5531987654321');
    expect(linkLigar(null)).toBeNull();
  });

  it('sem número plausível, sem link', () => {
    expect(linkWhatsApp(null, 'Oi')).toBeNull();
    expect(linkWhatsApp('9876', 'Oi')).toBeNull();
  });
});

describe('Desfazer em 5 s (fila adiada, UX §3.1.5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('espera 5000 ms antes de mandar', () => {
    expect(ESPERA_DESFAZER_MS).toBe(5000);
    const fila = criarFilaAdiada();
    const enviar = vi.fn();
    fila.agendar('a', enviar);
    expect(fila.pendente('a')).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(enviar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(false);
    expect(fila.pendente('a')).toBe(false);
  });

  it('desfazer antes dos 5 s cancela: nada sai', () => {
    const fila = criarFilaAdiada();
    const enviar = vi.fn();
    fila.agendar('a', enviar);
    vi.advanceTimersByTime(3000);
    expect(fila.desfazer('a')).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(enviar).not.toHaveBeenCalled();
    expect(fila.desfazer('a')).toBe(false);
  });

  it('mandar agora (saiu da tela) sai uma vez só', () => {
    const fila = criarFilaAdiada();
    const enviar = vi.fn();
    fila.agendar('a', enviar);
    expect(fila.enviarAgora('a')).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('fechar a aba manda todas, avisando que é urgente (keepalive)', () => {
    const fila = criarFilaAdiada();
    const a = vi.fn();
    const b = vi.fn();
    fila.agendar('a', a);
    fila.agendar('b', b);
    expect(fila.tamanho).toBe(2);
    fila.enviarTodas(true);
    expect(a).toHaveBeenCalledWith(true);
    expect(b).toHaveBeenCalledWith(true);
    expect(fila.tamanho).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('agendar de novo a mesma linha troca o envio e recomeça a conta', () => {
    const fila = criarFilaAdiada();
    const primeiro = vi.fn();
    const segundo = vi.fn();
    fila.agendar('a', primeiro);
    vi.advanceTimersByTime(4000);
    fila.agendar('a', segundo);
    vi.advanceTimersByTime(4000);
    expect(segundo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledTimes(1);
  });
});

const resumo = (extra: Partial<ResumoCrmView> = {}): ResumoCrmView => ({
  day: HOJE,
  praca_id: 'p1',
  freela_configured: true,
  freela_read_at: null,
  numbers: [
    {
      key: 'leads_novos',
      value: 12,
      parts: [
        { label: 'da busca', value: 8 },
        { label: 'de visitas', value: 3 },
        { label: 'do formulário', value: 1 },
        { label: 'de outras origens', value: 0 },
      ],
      formula: '12 = 8 da busca + 3 de visitas + 1 do formulário',
      source: 'Leads criados em 28/10 (dia de Brasília), sem os de teste e os arquivados.',
    },
    {
      key: 'mudancas_etapa',
      value: 7,
      parts: [
        { label: 'automáticas', value: 5 },
        { label: 'da equipe', value: 2 },
      ],
      formula: '7 = 5 automáticas + 2 da equipe',
      source: 'Eventos de etapa na ficha dos leads em 28/10.',
    },
    {
      key: 'mudancas_etapa_destino',
      value: 7,
      parts: [
        { label: 'para Conversa aberta', value: 2 },
        { label: 'para Cadastrado', value: 3 },
        { label: 'para Perdido / reaquecer', value: 2 },
      ],
      formula: '7 = 2 para Conversa aberta + 3 para Cadastrado + 2 para Perdido / reaquecer',
      source: 'Eventos de etapa na ficha dos leads em 28/10.',
    },
    {
      key: 'freela',
      value: 3,
      parts: [
        { label: 'cadastros', value: 2 },
        { label: 'primeira contratação', value: 1 },
        { label: 'clientes ativos', value: 0 },
      ],
      formula: '3 = 2 cadastros + 1 primeira contratação + 0 clientes ativos',
      source: 'Mudanças de etapa pelo Freela.',
    },
    {
      key: 'mensagens_enviadas',
      value: 4,
      parts: [
        { label: 'entregues ao Freela', value: 3 },
        { label: 'marcada à mão', value: 1 },
      ],
      formula: '4 = 3 entregues ao Freela + 1 marcada à mão',
      source: 'Fila de mensagens com envio registrado em 28/10.',
    },
    {
      key: 'respostas',
      value: 1,
      parts: [{ label: 'resposta registrada', value: 1 }],
      formula: '1 = 1 resposta registrada',
      source: 'Mensagens com resposta registrada em 28/10.',
    },
  ],
  ...extra,
});

describe('resumo do dia (UX §3.1.6)', () => {
  it('cinco linhas com o número e a conta; destino na 2ª linha das etapas', () => {
    const linhas = linhasDoResumo(resumo(), 'hoje');
    expect(linhas.map((l) => [l.rotulo, l.numero])).toEqual([
      ['Leads novos', '12'],
      ['Mudanças de etapa', '7'],
      ['No Freela', '3'],
      ['Mensagens enviadas', '4'],
      ['Respostas registradas', '1'],
    ]);
    expect(linhas[0]!.conta).toBe('12 = 8 da busca + 3 de visitas + 1 do formulário');
    expect(linhas[1]!.extra).toBe('Para: Conversa aberta 2 · Cadastrado 3 · Perdido / reaquecer 2');
    expect(linhas[3]!.conta).toBe('4 = 3 entregues ao Freela + 1 marcada à mão. O Praça não sabe se chegaram no WhatsApp.');
    expect(linhas[4]!.conta).toBe('Só conta a resposta registrada no Praça: o WhatsApp não avisa.');
  });

  it('sem o Freela, o número do Freela vira — com a linha da conexão', () => {
    const semFreela = resumo({ freela_configured: false });
    semFreela.numbers[3] = { ...semFreela.numbers[3]!, value: null, parts: [], formula: 'Precisa da conexão com o Freela.' };
    const freela = linhasDoResumo(semFreela, 'hoje').find((l) => l.chave === 'freela')!;
    expect(freela.numero).toBe('—');
    expect(freela.conta).toBe('Precisa da conexão com o Freela.');
    // Mesmo se o servidor mandasse um número, sem a conexão ele não vale.
    const comNumero = linhasDoResumo(resumo({ freela_configured: false }), 'hoje').find((l) => l.chave === 'freela')!;
    expect(comNumero.numero).toBe('—');
  });

  it('zero tem a frase do dia escolhido', () => {
    const zerado = resumo();
    zerado.numbers = zerado.numbers.map((n) => (n.key === 'freela' ? n : { ...n, value: 0, parts: [], formula: '0 = …' }));
    const hoje = linhasDoResumo(zerado, 'hoje');
    expect(hoje.find((l) => l.chave === 'leads_novos')!.conta).toBe('Nenhum lead criado hoje.');
    expect(hoje.find((l) => l.chave === 'mudancas_etapa')!.conta).toBe('Nenhum lead mudou de etapa hoje.');
    expect(hoje.find((l) => l.chave === 'mudancas_etapa')!.extra).toBeUndefined();
    expect(hoje.find((l) => l.chave === 'mensagens_enviadas')!.conta).toBe('Nenhuma mensagem enviada hoje.');
    expect(hoje.find((l) => l.chave === 'respostas')!.conta).toBe('Nenhuma resposta registrada hoje.');
    const ontem = linhasDoResumo(zerado, 'ontem');
    expect(ontem.find((l) => l.chave === 'leads_novos')!.conta).toBe('Nenhum lead criado ontem.');
  });

  it('“Ainda não aconteceu nada” só com tudo zerado (o — do Freela conta como nada)', () => {
    expect(resumoZerado(resumo())).toBe(false);
    const zerado = resumo({ freela_configured: false });
    zerado.numbers = zerado.numbers.map((n) => ({ ...n, value: n.key === 'freela' ? null : 0 }));
    expect(resumoZerado(zerado)).toBe(true);
  });

  it('de onde vem: uma fonte por número, sem repetir a das etapas', () => {
    const fontes = fontesDoResumo(resumo());
    expect(fontes.map((f) => f.rotulo)).toEqual(['Leads novos', 'Mudanças de etapa', 'No Freela', 'Mensagens enviadas', 'Respostas registradas']);
    expect(fontes[0]!.texto).toBe('Leads criados em 28/10 (dia de Brasília), sem os de teste e os arquivados.');
  });
});

describe('contagem da lista (UX §3.1.2 item 3)', () => {
  it('soma os grupos, sem as mensagens só de leitura', () => {
    const grupos = [
      { task: 'send' as const, total: 4 },
      { task: 'cadence_send' as const, total: 6 },
      { task: 'hot_visit' as const, total: 2 },
      { task: 'next_step' as const, total: 2 },
      { task: 'stalled' as const, total: 1 },
      { task: 'first_vacancy' as const, total: 0 },
    ];
    const c = contaDasTarefas(grupos);
    expect(c.total).toBe(9);
    expect(tituloDaContagem(c.total)).toBe('9 tarefas para hoje');
    expect(c.texto).toBe(
      '4 mensagens + 2 leads quentes + 2 próximos passos + 1 conversa parada = 9. Cada lead aparece uma vez, na tarefa mais urgente.',
    );
  });

  it('singular e o rótulo da T5', () => {
    const c = contaDasTarefas([
      { task: 'send', total: 1 },
      { task: 'first_vacancy', total: 2 },
    ]);
    expect(c.texto).toBe('1 mensagem + 2 cadastrados sem vaga = 3. Cada lead aparece uma vez, na tarefa mais urgente.');
    expect(tituloDaContagem(1)).toBe('1 tarefa para hoje');
    expect(contaDasTarefas([{ task: 'first_vacancy', total: 1 }]).texto).toBe('1 cadastrado sem vaga. Cada lead aparece uma vez, na tarefa mais urgente.');
  });
});

describe('Feito, Adiar e os anúncios (UX §3.1.5, §3.1.8)', () => {
  it('menu “O que você fez?” sem “Só anotar” (o servidor só aceita contato de verdade)', () => {
    expect(OPCOES_FEITO.map((o) => [o.rotulo, o.kind, o.confirmacao])).toEqual([
      ['Liguei', 'call', 'Ligação registrada'],
      ['Mandei mensagem', 'msg_out', 'Mensagem registrada'],
      ['Visitei', 'visit', 'Visita registrada'],
    ]);
  });

  it('adiar 1, 3 e 7 dias pelo dia de Brasília', () => {
    expect(opcoesAdiar(HOJE)).toEqual([
      { dias: 1, ate: '2026-10-29', rotulo: 'Amanhã · qui 29/10' },
      { dias: 3, ate: '2026-10-31', rotulo: 'Em 3 dias · sáb 31/10' },
      { dias: 7, ate: '2026-11-04', rotulo: 'Em 1 semana · qua 04/11' },
    ]);
  });

  it('confirmações: adiado e o passo limpo da T3', () => {
    expect(textoAdiado('2026-10-29')).toBe('Adiado para qui 29/10');
    expect(notaDoPassoLimpo('Ligar para o decisor')).toBe('O próximo passo “Ligar para o decisor” foi limpo.');
    expect(notaDoPassoLimpo(null)).toBe('O próximo passo foi limpo.');
  });

  it('anúncio com o que falta', () => {
    expect(anuncioDaAcao('Ligação registrada', 'Bar do Zé', 8)).toBe('Ligação registrada para Bar do Zé. Faltam 8 tarefas.');
    expect(anuncioDaAcao('Visita registrada', 'Bar do Zé', 1)).toBe('Visita registrada para Bar do Zé. Falta 1 tarefa.');
    expect(anuncioDaAcao('Mensagem registrada', 'Bar do Zé', 0)).toBe('Mensagem registrada para Bar do Zé. Não falta nenhuma tarefa.');
  });
});

describe('de quem e o apoio da linha (UX §3.1.2 item 2, §3.1.3)', () => {
  it('“Minhas” só quando o guardado é quem está logado; id de outra pessoa mostra “Todas”', () => {
    expect(pessoaDaConsulta('u1', 'u1')).toBe('me');
    expect(pessoaDaConsulta('all', 'u1')).toBe('all');
    expect(pessoaDaConsulta('u2', 'u1')).toBe('all');
    expect(pessoaDaConsulta('u1', undefined)).toBe('all');
  });

  it('dono, sem dono e sem telefone', () => {
    expect(apoioDaLinha({ ownerId: 'u2', nomeDoDono: 'Rebeca', person: 'all', telefone: '31987654321' })).toBe('de Rebeca');
    // Em "Minhas" o dono é quem olha: some.
    expect(apoioDaLinha({ ownerId: 'u1', nomeDoDono: 'Diego', person: 'me', telefone: '31987654321' })).toBeNull();
    expect(apoioDaLinha({ ownerId: null, nomeDoDono: null, person: 'me', telefone: '31987654321' })).toBe('Sem dono');
    expect(apoioDaLinha({ ownerId: null, nomeDoDono: null, person: 'all', telefone: null })).toBe(
      'Sem dono · Sem telefone no cadastro: abra o lead para ver outro contato.',
    );
  });

  it('textos do 1º contato e do “Nada seu”', () => {
    expect(textoPrimeiroContato(12)).toBe('12 leads novos esperando o 1º contato nesta praça.');
    expect(textoPrimeiroContato(1)).toBe('1 lead novo esperando o 1º contato nesta praça.');
    expect(textoNadaSeu(5)).toBe('Nada seu agora. Há 5 tarefas de outras pessoas.');
    expect(textoNadaSeu(1)).toBe('Nada seu agora. Há 1 tarefa de outra pessoa.');
  });
});
