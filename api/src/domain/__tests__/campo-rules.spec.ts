import {
  caixaEnvolvente,
  carimbo,
  cpfValido,
  distanciaM,
  estagioDepoisDaVisita,
  faltando,
  gerarSenhaProvisoria,
  marcaLonge,
  mascararTelefoneContato,
  nomeParecido,
  normalizarRecusa,
  normalizarRetorno,
  normalizarTelefoneContato,
  normalizarPix,
  pixValido,
  RESPOSTAS_VAZIAS,
  resumoVisita,
  situacaoHoje,
  type RespostasVisita,
} from '../campo-rules';

const CENTRO = { lat: -19.9245, lng: -43.9352 };

const COMPLETAS: RespostasVisita = {
  interlocutor_name: 'João',
  interlocutor_role: 'dono',
  freela_status: 'cadastrou_qr',
  interest: 'alto',
  open_vagas: 2,
  vaga_roles: ['Garçom', 'Cozinheiro'],
  freelas_per_week: 5,
  channels: ['Grupos de WhatsApp'],
  channel_other: 'Indeed',
  needs_followup: true,
  followup_what: 'Ligar para fechar.',
  followup_date: '2026-10-10',
  notes: 'Casa cheia na sexta.',
};

describe('distância e marca de 200 m', () => {
  it('0,001° de latitude ≈ 111 m (haversine)', () => {
    expect(distanciaM(CENTRO, { lat: -19.9235, lng: -43.9352 })).toBe(111);
    expect(distanciaM(CENTRO, CENTRO)).toBe(0);
  });

  it('marca "longe" só acima de 200 m e só com localização no estabelecimento', () => {
    expect(marcaLonge(CENTRO, { lat: -19.9225, lng: -43.9352 })).toEqual({ distance_m: 222, far_from_place: true });
    expect(marcaLonge(CENTRO, { lat: -19.923, lng: -43.9352 })).toEqual({ distance_m: 167, far_from_place: false });
    expect(marcaLonge(CENTRO, { lat: null, lng: null })).toEqual({ distance_m: null, far_from_place: false });
  });

  it('caixa de busca: 1113,2 m no equador ≈ 0,01° para cada lado', () => {
    const c = caixaEnvolvente({ lat: 0, lng: 0 }, 1113.2);
    expect(c.latMin).toBeCloseTo(-0.01, 5);
    expect(c.latMax).toBeCloseTo(0.01, 5);
    expect(c.lngMin).toBeCloseTo(-0.01, 5);
    expect(c.lngMax).toBeCloseTo(0.01, 5);
  });
});

describe('carimbo de hora (§7)', () => {
  const agora = new Date('2026-10-08T15:00:00.000Z');
  const inicio = new Date('2026-10-08T12:00:00.000Z');

  it('aceita a hora do aparelho entre o início da jornada e agora + 2 min', () => {
    expect(carimbo('2026-10-08T14:59:00.000Z', agora, inicio)).toEqual({
      at: new Date('2026-10-08T14:59:00.000Z'),
      ajustado: false,
    });
    expect(carimbo('2026-10-08T15:01:30.000Z', agora, inicio).ajustado).toBe(false);
  });

  it('fora da janela usa a hora de recebimento e marca ajustado', () => {
    expect(carimbo('2026-10-08T15:03:00.000Z', agora, inicio)).toEqual({ at: agora, ajustado: true });
    expect(carimbo('2026-10-08T11:00:00.000Z', agora, inicio)).toEqual({ at: agora, ajustado: true });
  });

  it('sem jornada (início): no máximo 24 h no passado', () => {
    expect(carimbo('2026-10-07T14:00:00.000Z', agora, null).ajustado).toBe(true);
    expect(carimbo('2026-10-07T16:00:00.000Z', agora, null).ajustado).toBe(false);
  });

  it('sem hora ou hora ilegível = hora de recebimento', () => {
    expect(carimbo(undefined, agora, inicio)).toEqual({ at: agora, ajustado: true });
    expect(carimbo('lixo', agora, inicio)).toEqual({ at: agora, ajustado: true });
  });
});

describe('completude do questionário', () => {
  it('vazio: lista tudo o que é obrigatório, em ordem', () => {
    expect(faltando(RESPOSTAS_VAZIAS, '2026-10-08')).toEqual([
      'nome de quem atendeu',
      'cargo de quem atendeu',
      'situação no Freela',
      'interesse',
      'vagas abertas',
      'freelancers por semana',
      'apps e canais que usa',
      'se pediu retorno',
    ]);
  });

  it('completo: nada falta (observação é opcional)', () => {
    expect(faltando({ ...COMPLETAS, notes: null }, '2026-10-08')).toEqual([]);
  });

  it('vagas > 0 exige ao menos uma função; vagas = 0 não', () => {
    expect(faltando({ ...COMPLETAS, vaga_roles: [] }, '2026-10-08')).toEqual(['funções das vagas']);
    expect(faltando({ ...COMPLETAS, open_vagas: 0, vaga_roles: [] }, '2026-10-08')).toEqual([]);
  });

  it('"outro" preenchido vale como canal', () => {
    expect(faltando({ ...COMPLETAS, channels: [], channel_other: 'Indeed' }, '2026-10-08')).toEqual([]);
    expect(faltando({ ...COMPLETAS, channels: [], channel_other: '  ' }, '2026-10-08')).toEqual(['apps e canais que usa']);
  });

  it('retorno pedido exige o quê e data de hoje em diante', () => {
    expect(faltando({ ...COMPLETAS, followup_what: ' ', followup_date: null }, '2026-10-08')).toEqual([
      'o que fazer no retorno',
      'data do retorno',
    ]);
    expect(faltando({ ...COMPLETAS, followup_date: '2026-10-07' }, '2026-10-08')).toEqual([
      'data do retorno (não pode ser no passado)',
    ]);
    expect(faltando({ ...COMPLETAS, followup_date: '2026-10-08' }, '2026-10-08')).toEqual([]);
    expect(faltando({ ...COMPLETAS, needs_followup: false, followup_what: null, followup_date: null }, '2026-10-08')).toEqual([]);
  });
});

describe('resumo do evento no CRM e regra de estágio', () => {
  it('resume as respostas numa frase só', () => {
    expect(resumoVisita(COMPLETAS)).toBe(
      'Visita de campo — atendeu: João (Dono). Freela: cadastrou agora pelo QR. Interesse: alto. ' +
        'Vagas abertas: 2 (Garçom, Cozinheiro). Freelancers por semana: 5. ' +
        'Canais: Grupos de WhatsApp, outro: Indeed. Retorno: Ligar para fechar em 10/10/2026. ' +
        'Obs.: Casa cheia na sexta.',
    );
  });

  it('sem retorno e sem observação', () => {
    expect(
      resumoVisita({ ...COMPLETAS, open_vagas: 0, vaga_roles: [], needs_followup: false, notes: null, channel_other: null }),
    ).toBe(
      'Visita de campo — atendeu: João (Dono). Freela: cadastrou agora pelo QR. Interesse: alto. ' +
        'Vagas abertas: 0. Freelancers por semana: 5. Canais: Grupos de WhatsApp. Retorno: não pediu.',
    );
  });

  it('"Lead novo" e "Contatado" viram "Conversa aberta"; de 3 em diante mantém', () => {
    expect([1, 2, 3, 4, 5, 8].map(estagioDepoisDaVisita)).toEqual([3, 3, 3, 4, 5, 8]);
  });
});

describe('nome parecido (sugestão de duplicado)', () => {
  it.each([
    ['Bar do Zé', 'bar do ze', true],
    ['Bar do Zé', 'Bar do Zé Moema', true],
    ['Restaurante Dona Lúcia', 'Dona Lucia Cozinha', true],
    ['Bar do Zé', 'Bar da Maria', false],
    ['Pizzaria Napoli', 'Cantina Roma', false],
    ['', 'Bar', false],
  ])('%s × %s → %s', (a, b, esperado) => {
    expect(nomeParecido(a, b)).toBe(esperado);
  });
});

describe('CPF e Pix', () => {
  it('CPF confere os dois dígitos e recusa sequência repetida', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('123')).toBe(false);
  });

  it('chave Pix confere com o tipo', () => {
    expect(pixValido('cpf', '529.982.247-25')).toBe(true);
    expect(pixValido('email', 'ana@exemplo.com')).toBe(true);
    expect(pixValido('email', 'ana@')).toBe(false);
    expect(pixValido('telefone', '(31) 99999-0000')).toBe(true);
    expect(pixValido('telefone', '+55 31 99999-0000')).toBe(true);
    expect(pixValido('aleatoria', '123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(pixValido('outro', 'x')).toBe(false);
  });

  it('normaliza a chave para guardar', () => {
    expect(normalizarPix('cpf', '529.982.247-25')).toBe('52998224725');
    expect(normalizarPix('telefone', '(31) 99999-0000')).toBe('31999990000');
    expect(normalizarPix('email', ' Ana@Exemplo.com ')).toBe('ana@exemplo.com');
  });
});

describe('situação de hoje e senha provisória', () => {
  it('em jornada / encerrou / não iniciou', () => {
    expect(situacaoHoje([])).toBe('nao_iniciou');
    expect(situacaoHoje([{ ended_at: null }])).toBe('em_jornada');
    expect(situacaoHoje([{ ended_at: new Date() }])).toBe('encerrou');
    expect(situacaoHoje([{ ended_at: new Date() }, { ended_at: null }])).toBe('em_jornada');
  });

  // Lote E §41.2: passou de 10 minúsculas/números para 12 com maiúscula, minúscula e número (a política mais forte permitida).
  it('senha provisória: 12 caracteres sem ambíguos, com maiúscula, minúscula e número', () => {
    const senha = gerarSenhaProvisoria();
    expect(senha).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]{12}$/);
    expect(senha).toMatch(/[A-Z]/);
    expect(senha).toMatch(/[a-z]/);
    expect(senha).toMatch(/[0-9]/);
  });
});

describe('P0 §30 — resultado "fechado"', () => {
  it('fechado não exige questionário', () => {
    expect(faltando({ ...RESPOSTAS_VAZIAS, outcome: 'fechado' }, '2026-10-08')).toEqual([]);
  });
  it('fechado com retorno marcado ("Sim") ainda exige o quê e uma data válida', () => {
    const r = { ...RESPOSTAS_VAZIAS, outcome: 'fechado', needs_followup: true };
    expect(faltando(r, '2026-10-08')).toEqual(['o que fazer no retorno', 'data do retorno']);
    expect(faltando({ ...r, followup_what: 'Voltar', followup_date: '2026-10-07' }, '2026-10-08')).toEqual(['data do retorno (não pode ser no passado)']);
    expect(faltando({ ...r, followup_what: 'Voltar', followup_date: '2026-10-09' }, '2026-10-08')).toEqual([]);
    expect(faltando({ ...r, needs_followup: false }, '2026-10-08')).toEqual([]);
  });
  it('conversa (ou ausente) continua exigindo tudo como antes', () => {
    expect(faltando({ ...RESPOSTAS_VAZIAS, outcome: 'conversa' }, '2026-10-08')).toHaveLength(8);
    expect(faltando(RESPOSTAS_VAZIAS, '2026-10-08')).toHaveLength(8);
  });
  it('resumo do fechado não cita atendente nem telefone', () => {
    const t = resumoVisita({ ...RESPOSTAS_VAZIAS, outcome: 'fechado', notes: 'Portão baixo.' });
    expect(t).toBe('Visita de campo — estabelecimento fechado. Obs.: Portão baixo.');
  });
  it('resumo da conversa traz o motivo da recusa e nunca o telefone', () => {
    const t = resumoVisita({
      ...COMPLETAS,
      interest: 'nenhum',
      refusal_reason: 'preco',
      contact_phone: '11987654321',
      followup_time: '15:30',
    });
    expect(t).toContain('Motivo da recusa: Preço');
    expect(t).toContain('às 15:30');
    expect(t).not.toContain('98765');
  });
  it('resumo "Outro" leva a nota', () => {
    const t = resumoVisita({ ...COMPLETAS, interest: 'nenhum', refusal_reason: 'outro', refusal_note: 'Vai vender o bar' });
    expect(t).toContain('Motivo da recusa: Outro (Vai vender o bar)');
  });
});

describe('P0 §30 — motivo de recusa (normalização sobre o estado mesclado)', () => {
  it('só vale com interesse "nenhum" e conversa', () => {
    expect(normalizarRecusa({ interest: 'nenhum', outcome: 'conversa', refusal_reason: 'preco', refusal_note: 'x' })).toEqual({ refusal_reason: 'preco', refusal_note: null });
    expect(normalizarRecusa({ interest: 'alto', outcome: 'conversa', refusal_reason: 'preco', refusal_note: null })).toEqual({ refusal_reason: null, refusal_note: null });
    expect(normalizarRecusa({ interest: 'nenhum', outcome: 'fechado', refusal_reason: 'preco', refusal_note: null })).toEqual({ refusal_reason: null, refusal_note: null });
    expect(normalizarRecusa({ interest: null, outcome: 'conversa', refusal_reason: 'preco', refusal_note: null })).toEqual({ refusal_reason: null, refusal_note: null });
  });
  it('nota só com "outro", aparada; vazia vira null', () => {
    expect(normalizarRecusa({ interest: 'nenhum', outcome: 'conversa', refusal_reason: 'outro', refusal_note: '  Vai fechar  ' })).toEqual({ refusal_reason: 'outro', refusal_note: 'Vai fechar' });
    expect(normalizarRecusa({ interest: 'nenhum', outcome: 'conversa', refusal_reason: 'outro', refusal_note: '   ' })).toEqual({ refusal_reason: 'outro', refusal_note: null });
  });
});

describe('P0 §30 — hora do retorno', () => {
  it('hora só vale com retorno pedido', () => {
    expect(normalizarRetorno({ needs_followup: true, followup_time: '15:30' })).toEqual({ followup_time: '15:30' });
    expect(normalizarRetorno({ needs_followup: false, followup_time: '15:30' })).toEqual({ followup_time: null });
    expect(normalizarRetorno({ needs_followup: null, followup_time: '15:30' })).toEqual({ followup_time: null });
    expect(normalizarRetorno({ needs_followup: true, followup_time: null })).toEqual({ followup_time: null });
  });
});

describe('P0 §30 — telefone do contato', () => {
  it('normaliza para só dígitos (10–11) e tira o 55', () => {
    expect(normalizarTelefoneContato('(11) 98765-4321')).toEqual({ ok: true, valor: '11987654321' });
    expect(normalizarTelefoneContato('11 3456-7890')).toEqual({ ok: true, valor: '1134567890' });
    expect(normalizarTelefoneContato('+55 11 98765-4321')).toEqual({ ok: true, valor: '11987654321' });
    expect(normalizarTelefoneContato('5511987654321')).toEqual({ ok: true, valor: '11987654321' });
  });
  it('vazio ou nulo limpa', () => {
    expect(normalizarTelefoneContato(null)).toEqual({ ok: true, valor: null });
    expect(normalizarTelefoneContato('  ')).toEqual({ ok: true, valor: null });
  });
  it('inválido: curto, longo, DDD 0x, repetido', () => {
    for (const x of ['1234', '119876543210000', '0198765432', '99999999999', 'abc']) {
      expect(normalizarTelefoneContato(x).ok).toBe(false);
    }
  });
  it('máscara: 11 e 10 dígitos', () => {
    expect(mascararTelefoneContato('11987654321')).toBe('(11) 9****-4321');
    expect(mascararTelefoneContato('1134567890')).toBe('(11) ****-7890');
    expect(mascararTelefoneContato(null)).toBeNull();
  });
});
