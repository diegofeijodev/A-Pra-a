import { describe, expect, it } from 'vitest';
import type { AutomacoesView } from '../../infrastructure/crm.api';
import {
  AVISO_NADA_LIGADO,
  CATALOGO_JOBS,
  CLASSE_DO_SELO,
  JOBS_ORDEM,
  avisoDoFreela,
  comoLigar,
  contaDaCadencia,
  detalheTecnico,
  fonteDoCartaoJob,
  modoDeEnvio,
  quandoDito,
  situacaoDoJob,
  textoUltimaRodada,
  textoUltimos7Dias,
} from '../automacoes';

type Job = AutomacoesView['jobs'][number];
// quarta 28/10/2026, 15h30 em Brasília (UTC-3)
const AGORA = new Date('2026-10-28T18:30:00Z');

const job = (extra: Partial<Job> = {}): Job => ({
  key: 'auto_leads_busca',
  enabled: true,
  needs_freela: false,
  blocked_by: null,
  last_run: null,
  last_7d: {},
  ...extra,
});

describe('quandoDito', () => {
  it('hoje e ontem como a pessoa fala, no horário de Brasília', () => {
    expect(quandoDito('2026-10-28T17:02:00Z', AGORA)).toBe('hoje 14h02');
    expect(quandoDito('2026-10-28T01:00:00Z', AGORA)).toBe('ontem 22h00');
  });
  it('mais antigo: dia da semana e data', () => {
    expect(quandoDito('2026-10-26T20:05:00Z', AGORA)).toBe('seg 26/10 17h05');
  });
  it('texto que não é data não quebra', () => {
    expect(quandoDito('lixo', AGORA)).toBe('');
  });
});

describe('situacaoDoJob', () => {
  it('desligada vence tudo', () => {
    const s = situacaoDoJob(job({ enabled: false, blocked_by: 'freela', last_run: { at: '2026-10-28T17:00:00Z', ok: false, summary: {} } }), AGORA);
    expect(s).toMatchObject({ tipo: 'desligada', rotulo: 'Desligada', apoio: 'Não faz nada até ser ligada no servidor.' });
  });
  it('ligada mas sem o Freela', () => {
    const s = situacaoDoJob(job({ key: 'quadro_freela', blocked_by: 'freela' }), AGORA);
    expect(s).toMatchObject({ tipo: 'parada', rotulo: 'Parada: falta o Freela' });
    expect(s.apoio).toBe('Ligada no servidor, mas sem a conexão com o Freela ela não faz nada.');
  });
  it('A2 sem a sincronização dos cadastros', () => {
    const s = situacaoDoJob(job({ key: 'etapas_cadastro', blocked_by: 'signup_sync' }), AGORA);
    expect(s).toMatchObject({ tipo: 'parada', rotulo: 'Parada: falta a sincronização dos cadastros' });
    expect(s.apoio).toBe('Ligada no servidor, mas sem a sincronização dos cadastros ela não faz nada.');
  });
  it('falhou na última rodada: frase comum com a hora e a próxima tentativa', () => {
    const s = situacaoDoJob(job({ key: 'sem_resposta', last_run: { at: '2026-10-28T17:00:00Z', ok: false, summary: {}, error: 'CRM_ERROR: x' } }), AGORA);
    expect(s).toMatchObject({ tipo: 'falhou', rotulo: 'Falhou na última rodada' });
    expect(s.apoio).toBe('A última rodada não terminou (hoje 14h00). O Praça tenta de novo em cerca de 1 hora.');
    expect(s.apoio).not.toContain('CRM_ERROR');
  });
  it('próxima tentativa muda por trabalho', () => {
    const f = (key: Job['key']) => situacaoDoJob(job({ key, last_run: { at: '2026-10-28T17:00:00Z', ok: false, summary: {} } }), AGORA).apoio;
    expect(f('auto_leads_busca')).toContain('na próxima busca');
    expect(f('etapas_cadastro')).toContain('na próxima hora cheia');
    expect(f('quadro_freela')).toContain('de 2 em 2 horas, das 8h às 20h');
  });
  it('ligada e nunca rodou', () => {
    const s = situacaoDoJob(job({ key: 'sem_resposta' }), AGORA);
    expect(s).toMatchObject({ tipo: 'nunca', rotulo: 'Ligada · ainda não rodou' });
    expect(s.apoio).toBe(CATALOGO_JOBS.sem_resposta.quando);
  });
  it('ligada e a última rodada deu certo', () => {
    const s = situacaoDoJob(job({ last_run: { at: '2026-10-28T17:02:00Z', ok: true, summary: { adicionados: 1 } } }), AGORA);
    expect(s).toMatchObject({ tipo: 'ligada', rotulo: 'Ligada' });
    expect(s.apoio).toBeUndefined();
  });
});

describe('textoUltimaRodada', () => {
  it('A1 com leads criados e os que já estavam', () => {
    const j = job({ last_run: { at: '2026-10-28T17:02:00Z', ok: true, summary: { adicionados: 34, ja_na_praca: 2, acima_do_teto: 0 } } });
    expect(textoUltimaRodada(j, AGORA)).toBe('hoje 14h02 · 34 leads entraram (2 já estavam no funil)');
  });
  it('A1 sem nada novo', () => {
    const j = job({ last_run: { at: '2026-10-28T17:02:00Z', ok: true, summary: { adicionados: 0, ja_na_praca: 0, acima_do_teto: 0 } } });
    expect(textoUltimaRodada(j, AGORA)).toBe('hoje 14h02 · nenhum lead entrou');
  });
  it('nunca rodou', () => {
    expect(textoUltimaRodada(job(), AGORA)).toBe('ainda não rodou');
  });
  it('não terminou', () => {
    const j = job({ last_run: { at: '2026-10-28T17:00:00Z', ok: false, summary: {} } });
    expect(textoUltimaRodada(j, AGORA)).toBe('hoje 14h00 · não terminou');
  });
  it('Freela sem conexão: não rodou, conferido às', () => {
    const j = job({ key: 'quadro_freela', last_run: { at: '2026-10-28T17:01:00Z', ok: true, summary: { nao_configurado: true } } });
    expect(textoUltimaRodada(j, AGORA)).toBe('não rodou: falta a conexão com o Freela (conferido às 14h01)');
  });
  it('Freela sem conexão conferido em outro dia: o dia junto da hora', () => {
    const sem = (at: string) => job({ key: 'quadro_freela', last_run: { at, ok: true, summary: { nao_configurado: true } } });
    expect(textoUltimaRodada(sem('2026-10-28T01:00:00Z'), AGORA)).toBe('não rodou: falta a conexão com o Freela (conferido ontem às 22h00)');
    expect(textoUltimaRodada(sem('2026-10-26T20:05:00Z'), AGORA)).toBe('não rodou: falta a conexão com o Freela (conferido seg 26/10 às 17h05)');
  });
  it('A4 conta os que foram para Perdido', () => {
    const j = job({ key: 'sem_resposta', last_run: { at: '2026-10-28T09:10:00Z', ok: true, summary: { candidatos: 3, perdidos: 1 } } });
    expect(textoUltimaRodada(j, AGORA)).toBe('hoje 06h10 · 1 lead foi para Perdido / reaquecer');
  });
  it('A3 conta empresas lidas e mudanças de etapa', () => {
    const j = job({ key: 'quadro_freela', last_run: { at: '2026-10-28T17:00:00Z', ok: true, summary: { cartoes: 80, criados: 2, etapas: { '5': 1, '6': 0, '7': 0 } } } });
    expect(textoUltimaRodada(j, AGORA)).toBe('hoje 14h00 · 80 empresas lidas · 1 lead mudou de etapa · 2 leads novos');
  });
  it('A2 conta cadastros conferidos e subidas', () => {
    const j = job({ key: 'etapas_cadastro', last_run: { at: '2026-10-28T17:00:00Z', ok: true, summary: { vistos: 10, subiram: { '5': 0, '6': 2 }, vagas: 1 } } });
    expect(textoUltimaRodada(j, AGORA)).toBe('hoje 14h00 · 10 cadastros conferidos · 2 leads foram para Primeira vaga rodada');
  });
});

describe('textoUltimos7Dias', () => {
  it('nada', () => {
    expect(textoUltimos7Dias(job())).toBe('nada');
    expect(textoUltimos7Dias(job({ last_7d: { adicionados: 0 } }))).toBe('nada');
  });
  it('A1: criados, para escolher e os que já estavam (ou entraram à mão)', () => {
    expect(textoUltimos7Dias(job({ last_7d: { adicionados: 120, acima_do_teto: 12, ja_na_praca: 4 } }))).toBe(
      '120 leads criados · 12 ficaram para escolher à mão · 4 já estavam na praça ou foram adicionados à mão',
    );
  });
  it('A2', () => {
    expect(textoUltimos7Dias(job({ key: 'etapas_cadastro', last_7d: { 'subiram.6': 3, vagas: 5 } }))).toBe(
      '3 leads foram para Primeira vaga rodada · 5 primeiras vagas anotadas',
    );
  });
  it('A3 com as etapas por nome', () => {
    expect(
      textoUltimos7Dias(
        job({ key: 'quadro_freela', last_7d: { 'etapas.5': 6, 'etapas.6': 2, 'etapas.7': 1, criados: 4, ambiguos: 2 } }),
      ),
    ).toBe(
      '9 leads mudaram de etapa (Cadastrado 6 · Primeira vaga rodada 2 · Cliente ativo 1) · 4 leads novos do Freela · 2 empresas sem lead certo (o telefone está em mais de um lead)',
    );
  });
  it('A4', () => {
    expect(textoUltimos7Dias(job({ key: 'sem_resposta', last_7d: { perdidos: 7, candidatos: 7 } }))).toBe('7 leads foram para Perdido / reaquecer');
  });
});

describe('Como ligar e Detalhe técnico: só o admin', () => {
  it('Como ligar traz o nome da chave só para o admin e só com a automação desligada', () => {
    const off = job({ enabled: false });
    const t = comoLigar(off, true);
    expect(t).toContain('CRM_AUTO_LEADS_FROM_SEARCH_ENABLED=true');
    expect(t).toContain('reinicia a API');
    expect(comoLigar(off, false)).toBeNull();
    expect(comoLigar(job({ enabled: true }), true)).toBeNull();
  });
  it('as chaves de cada automação, com as extras', () => {
    expect(comoLigar(job({ key: 'etapas_cadastro', enabled: false }), true)).toContain('CRM_AUTO_STAGES_ENABLED=true');
    expect(comoLigar(job({ key: 'etapas_cadastro', enabled: false }), true)).toContain('FIELD_SIGNUP_SYNC_ENABLED');
    expect(comoLigar(job({ key: 'sem_resposta', enabled: false }), true)).toContain('CRM_AUTO_LOST_ENABLED=true');
    expect(comoLigar(job({ key: 'quadro_freela', enabled: false }), true)).toContain('CRM_FREELA_PIPELINE_ENABLED=true');
    expect(comoLigar(job({ key: 'quadro_freela', enabled: false }), true)).toContain('FREELA_ADMIN_EMAIL');
  });
  it('o administrador do servidor recebe a pista, os demais "fale com o administrador"', () => {
    expect(CATALOGO_JOBS.sem_resposta.paraLigar).toBe('Para ligar, fale com o administrador.');
  });
  it('Detalhe técnico: texto cru só do admin e só com a rodada falhando', () => {
    const falha = job({ last_run: { at: '2026-10-28T17:00:00Z', ok: false, summary: {}, error: 'CRM_ERROR: A rodada falhou (P2002).' } });
    expect(detalheTecnico(falha, true)).toBe('CRM_ERROR: A rodada falhou (P2002).');
    expect(detalheTecnico(falha, false)).toBeNull();
    expect(detalheTecnico(job({ last_run: { at: '2026-10-28T17:00:00Z', ok: true, summary: {} } }), true)).toBeNull();
    expect(detalheTecnico(job(), true)).toBeNull();
  });
});

describe('textos do catálogo', () => {
  it('A1 diz que alimenta os roteiros do campo e que busca com a chave desligada fica à mão', () => {
    expect(CATALOGO_JOBS.auto_leads_busca.faz).toContain('roteiros do campo');
    expect(CATALOGO_JOBS.auto_leads_busca.faz).toContain('Shoppings continuam à mão');
    expect(CATALOGO_JOBS.auto_leads_busca.faz).toContain('até 300 por busca');
    expect(CATALOGO_JOBS.auto_leads_busca.faz).toContain('chave desligada');
  });
  it('A2 e A4 dividem a mesma chave? não: A4 tem a sua e a ordem é a da tela', () => {
    expect(JOBS_ORDEM).toEqual(['auto_leads_busca', 'etapas_cadastro', 'quadro_freela', 'sem_resposta']);
  });
});

const view = (extra: Partial<AutomacoesView> = {}): AutomacoesView => ({
  freela_configured: true,
  send_mode: 'fila',
  jobs: JOBS_ORDEM.map((key) => job({ key, enabled: false })),
  cadences: [],
  warnings: [],
  ...extra,
});

describe('avisoDoFreela', () => {
  it('lista pelo nome as automações ligadas e paradas por falta do Freela', () => {
    const v = view({ freela_configured: false, jobs: [job({ key: 'etapas_cadastro', blocked_by: 'freela' }), job({ key: 'quadro_freela', blocked_by: 'freela' }), job({ key: 'sem_resposta' })] });
    expect(avisoDoFreela(v)).toBe(
      'O Freela não está conectado. Duas automações e o envio “Via Freela” dependem dele e estão paradas: Etapa pelo cadastro do representante e Etapa e leads pelo Freela.',
    );
  });
  it('uma só automação parada, no singular', () => {
    const v = view({ freela_configured: false, jobs: [job({ key: 'quadro_freela', blocked_by: 'freela' })] });
    expect(avisoDoFreela(v)).toBe('O Freela não está conectado. Uma automação e o envio “Via Freela” dependem dele e está parada: Etapa e leads pelo Freela.');
  });
  it('sem aviso quando o Freela está conectado ou nada ligado depende dele', () => {
    expect(avisoDoFreela(view())).toBeNull();
    expect(avisoDoFreela(view({ freela_configured: false, jobs: [job({ key: 'quadro_freela', enabled: false })] }))).toBeNull();
  });
});

describe('aviso de nada ligado', () => {
  it('texto', () => {
    expect(AVISO_NADA_LIGADO).toBe('Nenhuma automação está ligada ainda. O funil só muda pela equipe e pelas visitas.');
  });
});

describe('modoDeEnvio', () => {
  it('fila manual', () => {
    const m = modoDeEnvio('fila', true);
    expect(m.titulo).toBe('Modo de envio: Fila manual');
    // Desenho §12.1 item 1: a cadência grava a mensagem já como enviada (grupo só de leitura); só o disparo vira "Mandar mensagem".
    expect(m.texto).toBe(
      'As mensagens não saem sozinhas: quem manda é a equipe, pelo WhatsApp. As das cadências aparecem em Tarefas, em “Mensagens das ' +
        'cadências de hoje”, já marcadas como enviadas. As dos disparos viram a tarefa “Mandar mensagem”, com o texto pronto.',
    );
    expect(m.acao).toEqual({ rotulo: 'Ver as tarefas', href: '/tarefas' });
  });
  it('via Freela', () => {
    const m = modoDeEnvio('freela', true);
    expect(m.titulo).toBe('Modo de envio: Via Freela');
    expect(m.texto).toContain('o Praça não fica sabendo');
    expect(m.acao).toEqual({ rotulo: 'Abrir os disparos', href: '/mensagens?aba=disparos' });
    expect(m.selo).toBeUndefined();
  });
  it('via Freela sem a conexão', () => {
    const m = modoDeEnvio('freela', false);
    expect(m.selo).toBe('Parada: falta o Freela');
    // `freela-outbox.service.ts`: sem a conexão a fila do modo `freela` fica esperando (não vira tarefa: a T1 só lê o modo `fila`).
    expect(m.texto).toBe(
      'Sem a conexão com o Freela, nenhuma mensagem sai: as das cadências e dos disparos ficam esperando na fila e saem quando a ' +
        'conexão voltar. Elas não viram tarefa.',
    );
  });
});

describe('contaDaCadencia', () => {
  it('singular e plural', () => {
    expect(contaDaCadencia(0)).toBe('0 leads dentro agora');
    expect(contaDaCadencia(1)).toBe('1 lead dentro agora');
    expect(contaDaCadencia(12)).toBe('12 leads dentro agora');
  });
});

describe('UX final, achado 5: a fonte dos "Últimos 7 dias" é o registro das rodadas, nas últimas 168 horas', () => {
  it('a soma do que cada rodada registrou desde agora menos 7 dias (Brasília), e quanto o registro guarda', () => {
    // quinta 29/10/2026, 14h32 em Brasília → desde quinta 22/10 14h32
    expect(fonteDoCartaoJob(new Date('2026-10-29T17:32:00Z'))).toBe(
      'Última rodada: o registro das rodadas do trabalho. Últimos 7 dias: a soma do que cada rodada registrou desde qui 22/10 14h32. ' +
        'O registro das rodadas guarda 30 dias.',
    );
    expect(fonteDoCartaoJob(AGORA)).not.toContain('eventos com o autor');
  });
});

describe('UX final, achado 7: contraste dos selos', () => {
  it('"Falhou na última rodada" sem o fundo vermelho translúcido (≈ 4,3:1): fundo do cartão e borda', () => {
    expect(CLASSE_DO_SELO.falhou).toBe('bg-card border border-destructive text-destructive');
    expect(CLASSE_DO_SELO.falhou).not.toContain('bg-destructive/');
  });
  it('os outros ficam como estavam', () => {
    expect(CLASSE_DO_SELO).toMatchObject({
      desligada: 'bg-muted text-muted-foreground',
      parada: 'bg-warning/10 text-warning',
      nunca: 'bg-secondary text-secondary-foreground',
      ligada: 'bg-success/10 text-success',
    });
  });
});
