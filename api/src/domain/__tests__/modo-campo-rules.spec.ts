import { RESPOSTAS_VAZIAS, type RespostasVisita } from '../campo-rules';
import { rotuloMotivoRecusa } from '../catalog/refusal';
import {
  aplicarConfigModo,
  CONFIG_MODO_PADRAO,
  contaNaMeta,
  derivarDoResultado,
  estagioSimples,
  faltandoSimples,
  fluxoDoCheckin,
  lerConfigModo,
  PRESETS_MODO,
  resolverFluxo,
  resumoVisitaSimples,
  type ResultadoSimples,
} from '../modo-campo-rules';

const HOJE = '2026-10-20';
const base = (over: Partial<RespostasVisita> = {}): RespostasVisita => ({ ...RESPOSTAS_VAZIAS, ...over });
const LONGE = { far_from_place: true };
const PERTO = { far_from_place: false };

describe('resolverFluxo — qual fluxo vale (contrato §31.1)', () => {
  it('flag desligada: sempre completo, qualquer que seja a configuração', () => {
    expect(resolverFluxo({ ligado: false, global: 'simples', consultor: 'simples' })).toBe('completo');
    expect(resolverFluxo({ ligado: false, global: null, consultor: null })).toBe('completo');
  });
  it('flag ligada, chave ausente: simples (o padrão do chefe)', () => {
    expect(resolverFluxo({ ligado: true, global: null, consultor: null })).toBe('simples');
    expect(resolverFluxo({ ligado: true, global: undefined, consultor: undefined })).toBe('simples');
  });
  it('global vale; consultor vale mais que o global', () => {
    expect(resolverFluxo({ ligado: true, global: 'completo', consultor: null })).toBe('completo');
    expect(resolverFluxo({ ligado: true, global: 'completo', consultor: 'simples' })).toBe('simples');
    expect(resolverFluxo({ ligado: true, global: 'simples', consultor: 'completo' })).toBe('completo');
  });
  it('valor inválido no JSON é ignorado', () => {
    expect(resolverFluxo({ ligado: true, global: 'xx' as never, consultor: 'yy' as never })).toBe('simples');
  });
});

describe('fluxoDoCheckin — dica do aparelho', () => {
  it('flag desligada ignora a dica', () => {
    expect(fluxoDoCheckin({ ligado: false, resolvido: 'completo', dica: 'simples' })).toBe('completo');
  });
  it('flag ligada respeita a dica válida; sem dica ou inválida usa o resolvido', () => {
    expect(fluxoDoCheckin({ ligado: true, resolvido: 'completo', dica: 'simples' })).toBe('simples');
    expect(fluxoDoCheckin({ ligado: true, resolvido: 'simples', dica: 'completo' })).toBe('completo');
    expect(fluxoDoCheckin({ ligado: true, resolvido: 'simples', dica: undefined })).toBe('simples');
    expect(fluxoDoCheckin({ ligado: true, resolvido: 'simples', dica: 'lixo' })).toBe('simples');
  });
});

describe('configuração do modo', () => {
  it('vazia = padrão da spec (designer): contato só em retorno e cadastrou, justificativa opcional, fechado conta', () => {
    expect(lerConfigModo({})).toEqual(CONFIG_MODO_PADRAO);
    expect(CONFIG_MODO_PADRAO).toMatchObject({
      fluxo_visita: null,
      justificativa_distancia: 'opcional',
      contato_obrigatorio_em: ['cadastrou', 'retorno'],
      fechado_conta_na_meta: true,
      desfazer_segundos: 8,
    });
  });
  it('chave inválida cai no padrão; válida vale; ordem canônica', () => {
    const c = lerConfigModo({ fluxo_visita: 'simples', justificativa_distancia: 'xx', contato_obrigatorio_em: ['retorno', 'cadastrou'], desfazer_segundos: 99 });
    expect(c.fluxo_visita).toBe('simples');
    expect(c.justificativa_distancia).toBe('opcional');
    expect(c.contato_obrigatorio_em).toEqual(['cadastrou', 'retorno']);
    expect(c.desfazer_segundos).toBe(8);
  });
  it('PUT parcial: aceita null em fluxo_visita, rejeita desconhecida e fora da faixa', () => {
    const a = aplicarConfigModo(lerConfigModo({ fluxo_visita: 'simples' }), { fluxo_visita: null });
    expect(a.ok && a.config.fluxo_visita).toBeNull();
    expect(aplicarConfigModo(CONFIG_MODO_PADRAO, { foo: 1 })).toMatchObject({ ok: false });
    expect(aplicarConfigModo(CONFIG_MODO_PADRAO, { desfazer_segundos: 31 })).toMatchObject({ ok: false });
    expect(aplicarConfigModo(CONFIG_MODO_PADRAO, { contato_obrigatorio_em: ['fechado'] })).toMatchObject({ ok: false });
    expect(aplicarConfigModo(CONFIG_MODO_PADRAO, { contato_campos: ['nome', 'nome'] })).toMatchObject({ ok: false });
  });
  it('os presets são configurações válidas; "chefe" = Lovable (contato em todo status menos fechado, justificativa obrigatória)', () => {
    for (const p of Object.values(PRESETS_MODO)) {
      const r = aplicarConfigModo(CONFIG_MODO_PADRAO, { ...p });
      expect(r).toMatchObject({ ok: true });
    }
    expect(PRESETS_MODO.chefe).toMatchObject({
      fluxo_visita: 'simples',
      justificativa_distancia: 'obrigatoria',
      contato_obrigatorio_em: ['cadastrou', 'ja_usa', 'retorno', 'sem_interesse'],
      contato_campos: ['nome', 'cargo', 'telefone'],
    });
    expect(PRESETS_MODO.completo.fluxo_visita).toBe('completo');
  });
});

describe('derivarDoResultado — tabela do contrato §31.5', () => {
  const d = (r: ResultadoSimples, atual: { interest: string | null; followup_what: string | null } = { interest: null, followup_what: null }) =>
    derivarDoResultado(r, atual);
  it('cadastrou', () => {
    expect(d('cadastrou')).toMatchObject({ outcome: 'conversa', freela_status: 'declarou', needs_followup: false, interest: 'alto', followup_date: null });
  });
  it('ja_usa não inventa interesse', () => {
    const r = d('ja_usa');
    expect(r).toMatchObject({ outcome: 'conversa', freela_status: 'ja_usa', needs_followup: false });
    expect(r).not.toHaveProperty('interest');
  });
  it('retorno: precisa de retorno, "Retornar" só se vazio, interesse médio só se vazio', () => {
    expect(d('retorno')).toMatchObject({ needs_followup: true, freela_status: null, interest: 'medio', followup_what: 'Retornar' });
    const r = d('retorno', { interest: 'alto', followup_what: 'Levar proposta' });
    expect(r).not.toHaveProperty('interest');
    expect(r).not.toHaveProperty('followup_what');
  });
  it('sem_interesse: nao_cadastrou e interesse nenhum (só se vazio)', () => {
    expect(d('sem_interesse')).toMatchObject({ freela_status: 'nao_cadastrou', interest: 'nenhum', needs_followup: false });
    expect(d('sem_interesse', { interest: 'baixo', followup_what: null })).not.toHaveProperty('interest');
  });
  it('fechado: outcome fechado, sem retorno', () => {
    expect(d('fechado')).toMatchObject({ outcome: 'fechado', freela_status: null, needs_followup: false });
  });
});

describe('faltandoSimples — o que o checkout simples exige', () => {
  const cfg = CONFIG_MODO_PADRAO;
  const contato = { interlocutor_name: 'Marcos', interlocutor_role: 'dono', contact_phone: '11987654321' } as const;
  it('sem resultado: só "resultado da visita" — as 8 perguntas antigas NÃO são exigidas', () => {
    expect(faltandoSimples(base(), HOJE, cfg, PERTO)).toEqual(['resultado da visita']);
  });
  it('fechado e ja_usa e sem_interesse (com motivo) concluem sem digitar nada no padrão', () => {
    expect(faltandoSimples(base({ result: 'fechado' }), HOJE, cfg, PERTO)).toEqual([]);
    expect(faltandoSimples(base({ result: 'ja_usa' }), HOJE, cfg, PERTO)).toEqual([]);
    expect(faltandoSimples(base({ result: 'sem_interesse', refusal_reason: 'preco' }), HOJE, cfg, PERTO)).toEqual([]);
  });
  it('sem_interesse exige o motivo', () => {
    expect(faltandoSimples(base({ result: 'sem_interesse' }), HOJE, cfg, PERTO)).toEqual(['motivo']);
  });
  it('retorno exige quando voltar (hoje em diante) e o contato do padrão', () => {
    expect(faltandoSimples(base({ result: 'retorno' }), HOJE, cfg, PERTO)).toEqual([
      'quando voltar',
      'nome de quem atendeu',
      'cargo de quem atendeu',
      'telefone de quem atendeu',
    ]);
    expect(faltandoSimples(base({ result: 'retorno', followup_date: '2026-10-19', ...contato }), HOJE, cfg, PERTO)).toEqual(['quando voltar (não pode ser no passado)']);
    expect(faltandoSimples(base({ result: 'retorno', followup_date: HOJE, ...contato }), HOJE, cfg, PERTO)).toEqual([]);
  });
  it('cadastrou exige o contato do padrão; configurável por resultado e por campo', () => {
    expect(faltandoSimples(base({ result: 'cadastrou' }), HOJE, cfg, PERTO)).toHaveLength(3);
    const so = { ...cfg, contato_obrigatorio_em: ['cadastrou' as const], contato_campos: ['telefone' as const] };
    expect(faltandoSimples(base({ result: 'cadastrou' }), HOJE, so, PERTO)).toEqual(['telefone de quem atendeu']);
    expect(faltandoSimples(base({ result: 'retorno', followup_date: HOJE }), HOJE, so, PERTO)).toEqual([]);
    const vazio = { ...cfg, contato_obrigatorio_em: [] };
    expect(faltandoSimples(base({ result: 'cadastrou' }), HOJE, vazio, PERTO)).toEqual([]);
  });
  it('perfil do chefe: contato em todo resultado menos fechado (Lovable pendenciasFinalizar)', () => {
    const chefe = PRESETS_MODO.chefe;
    expect(faltandoSimples(base({ result: 'ja_usa' }), HOJE, chefe, PERTO)).toHaveLength(3);
    expect(faltandoSimples(base({ result: 'fechado' }), HOJE, chefe, PERTO)).toEqual([]);
  });
  it('justificativa de distância: só obrigatória quando configurada E longe', () => {
    const r = base({ result: 'fechado' });
    expect(faltandoSimples(r, HOJE, CONFIG_MODO_PADRAO, LONGE)).toEqual([]);
    const obrig = { ...CONFIG_MODO_PADRAO, justificativa_distancia: 'obrigatoria' as const };
    expect(faltandoSimples(r, HOJE, obrig, LONGE)).toEqual(['motivo de a visita ter sido longe do local']);
    expect(faltandoSimples(r, HOJE, obrig, PERTO)).toEqual([]);
    expect(faltandoSimples(base({ result: 'fechado', distance_note: 'Porta lateral' }), HOJE, obrig, LONGE)).toEqual([]);
  });
});

describe('meta, estágio e resumo', () => {
  it('contaNaMeta: completo nunca conta fechado; simples conta se configurado; conversa sempre conta', () => {
    expect(contaNaMeta({ outcome: 'conversa', flow: 'completo' }, { fechado_conta_na_meta: true })).toBe(true);
    expect(contaNaMeta({ outcome: 'fechado', flow: 'completo' }, { fechado_conta_na_meta: true })).toBe(false);
    expect(contaNaMeta({ outcome: 'fechado' }, { fechado_conta_na_meta: true })).toBe(false);
    expect(contaNaMeta({ outcome: 'fechado', flow: 'simples' }, { fechado_conta_na_meta: true })).toBe(true);
    expect(contaNaMeta({ outcome: 'fechado', flow: 'simples' }, { fechado_conta_na_meta: false })).toBe(false);
  });
  it('estagioSimples: fechado e cadastrou não mexem; o resto como no completo', () => {
    expect(estagioSimples('fechado', 1)).toBe(1);
    expect(estagioSimples('cadastrou', 2)).toBe(2);
    expect(estagioSimples('retorno', 1)).toBe(3);
    expect(estagioSimples('sem_interesse', 2)).toBe(3);
    expect(estagioSimples('ja_usa', 4)).toBe(4);
  });
  it('resumo: resultado, motivo, atendente e retorno; nunca o telefone', () => {
    const t = resumoVisitaSimples(
      base({ result: 'sem_interesse', refusal_reason: 'preco', interlocutor_name: 'Marcos', interlocutor_role: 'dono', contact_phone: '11987654321' }),
      rotuloMotivoRecusa,
    );
    expect(t).toBe('Visita de campo — resultado: Sem interesse (Preço). atendeu: Marcos (Dono).');
    expect(t).not.toContain('987654321');
    expect(resumoVisitaSimples(base({ result: 'retorno', followup_what: 'Retornar', followup_date: '2026-10-22', followup_time: '15:30' }), rotuloMotivoRecusa)).toBe(
      'Visita de campo — resultado: Quer retorno. Retorno: Retornar em 22/10/2026 às 15:30.',
    );
    expect(resumoVisitaSimples(base({ result: 'fechado' }), rotuloMotivoRecusa)).toBe('Visita de campo — estabelecimento fechado.');
  });
});
