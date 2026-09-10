import { DEFAULT_TEMPLATE_DEFAULTS } from '../../../domain/catalog/messages';
import type { SendSettings } from '../../../domain/send-schedule';
import { pracaCidade, toFreelaPacing, toFreelaTemplate, type FreelaTemplateCtx } from '../freela-template';
import { SEED_TEMPLATES } from '../../../../prisma/seed-data/msg-templates';

// Modelo `…f001` do seed ("Contratante · toque 1"): é o texto real que o time
// usa, com as duas variantes e as variáveis dos dois tipos (contexto fixo e
// por lead).
const F001 = SEED_TEMPLATES[0]!;

const CTX: FreelaTemplateCtx = {
  praca: { name: 'BH · Setembro', start_date: '2026-09-14' },
  me: { name: 'Diego Souza' },
  defaults: DEFAULT_TEMPLATE_DEFAULTS,
  cidade: 'Belo Horizonte',
};

/** O mesmo contexto sem a cidade da praça (lote de cadência, praça `all`). */
const CTX_SEM_CIDADE: FreelaTemplateCtx = { ...CTX, cidade: undefined };

const SETTINGS: SendSettings = {
  mode: 'freela',
  window_start: 9,
  window_end: 19,
  sunday: false,
  daily_limit: 200,
  gap_min: 20,
  gap_max: 90,
};

describe('toFreelaTemplate', () => {
  it('converte o modelo f001: primeiro_nome_dono vira primeiro_nome', () => {
    const out = toFreelaTemplate(F001.text_a, F001.text_b, CTX);

    expect(out.template).toContain('{{primeiro_nome}}');
    expect(out.template).not.toContain('{{primeiro_nome_dono}}');
  });

  it('com a cidade da praça, {{cidade}} vira texto (o Freela deixa vazio em lista externa)', () => {
    const out = toFreelaTemplate('Aqui em {{cidade}} a gente resolve.', null, CTX);

    expect(out.template).toBe('Aqui em Belo Horizonte a gente resolve.');
    expect(out.unsupported_variables).toEqual([]);
  });

  it('sem cidade no contexto, {{cidade}} fica intacta e entra na lista de avisos', () => {
    const out = toFreelaTemplate('Aqui em {{cidade}} a gente resolve.', null, CTX_SEM_CIDADE);

    expect(out.template).toBe('Aqui em {{cidade}} a gente resolve.');
    expect(out.unsupported_variables).toEqual(['cidade']);
  });

  it('cidade só de espaços conta como ausente', () => {
    const out = toFreelaTemplate('Em {{cidade}}!', null, { ...CTX, cidade: '   ' });

    expect(out.unsupported_variables).toEqual(['cidade']);
  });

  it('resolve as variáveis de contexto fixo antes de mandar (meu_nome, link_video_caso)', () => {
    const out = toFreelaTemplate(F001.text_a, F001.text_b, CTX);

    // `{{meu_nome}}` é o primeiro nome de quem dispara.
    expect(out.template).toContain('Sou Diego, do Freela.');
    expect(out.template).not.toContain('{{meu_nome}}');
    expect(out.template).toContain(DEFAULT_TEMPLATE_DEFAULTS.link_video_caso);
    expect(out.template).not.toContain('{{link_video_caso}}');
  });

  it('deixa intactas as variáveis por lead que o Freela não tem e as lista', () => {
    const out = toFreelaTemplate(F001.text_a, F001.text_b, CTX);

    expect(out.template).toContain('{{estabelecimento}}');
    expect(out.template).toContain('{{estabelecimento_vizinho}}');
    expect(out.unsupported_variables).toContain('estabelecimento');
    expect(out.unsupported_variables).toContain('estabelecimento_vizinho');
    // Ordem de aparição, sem repetir.
    expect(out.unsupported_variables).toEqual(['estabelecimento_vizinho', 'estabelecimento']);
    // Com a cidade da praça, `{{cidade}}` não é aviso: virou texto.
    expect(out.template).toContain('aí em Belo Horizonte');
  });

  it('junta as duas variantes com a linha --- (o teste A/B do Freela)', () => {
    const out = toFreelaTemplate(F001.text_a, F001.text_b, CTX);

    const partes = out.template.split('\n---\n');
    expect(partes).toHaveLength(2);
    expect(partes[0]).toContain('tudo bem?');
    expect(partes[1]).toContain('boa tarde!');
  });

  it('sem variante B manda uma variante só', () => {
    const out = toFreelaTemplate(F001.text_a, null, CTX);

    expect(out.template).not.toContain('---');
  });

  it('variante B só de espaços não vira variante', () => {
    const out = toFreelaTemplate(F001.text_a, '   ', CTX);

    expect(out.template).not.toContain('---');
  });

  it('{{nome}} atravessa igual (o Freela tem essa)', () => {
    const out = toFreelaTemplate('Oi {{nome}}, tudo bem?', null, CTX);

    expect(out.template).toBe('Oi {{nome}}, tudo bem?');
    expect(out.unsupported_variables).toEqual([]);
  });

  it('variável desconhecida fica intacta e entra na lista (não vira buraco no texto)', () => {
    const out = toFreelaTemplate('Oi {{inventada}}!', null, CTX);

    expect(out.template).toBe('Oi {{inventada}}!');
    expect(out.unsupported_variables).toEqual(['inventada']);
  });

  it('sem praça no contexto a variável fica visível como ⟨praca⟩, igual ao render do Praça', () => {
    const out = toFreelaTemplate('Estamos abrindo em {{praca}}.', null, {
      defaults: DEFAULT_TEMPLATE_DEFAULTS,
    });

    expect(out.template).toBe('Estamos abrindo em ⟨praca⟩.');
  });

  it('texto vazio vira texto vazio, sem variável nenhuma', () => {
    expect(toFreelaTemplate('', null, CTX)).toEqual({ template: '', unsupported_variables: [] });
  });
});

describe('pracaCidade', () => {
  it('prefere a cobertura escolhida da praça', () => {
    expect(pracaCidade({ city: 'BH · Setembro', cobertura_cidade: 'Belo Horizonte' })).toBe('Belo Horizonte');
  });

  it('sem cobertura, corta o rótulo da praça no separador', () => {
    expect(pracaCidade({ city: 'Belo Horizonte · Setembro', cobertura_cidade: null })).toBe('Belo Horizonte');
  });

  it('praça sem cidade nenhuma não inventa cidade', () => {
    expect(pracaCidade({ city: '', cobertura_cidade: null })).toBeUndefined();
    expect(pracaCidade(null)).toBeUndefined();
  });
});

describe('toFreelaPacing', () => {
  it('mapeia janela, limite e intervalo do Praça para o ritmo do Freela', () => {
    expect(toFreelaPacing(SETTINGS)).toEqual({
      // 3600 / ((20+90)/2) = 65,4 → 65, preso no teto de 60 do Freela.
      messagesPerHour: 60,
      dailyCap: 200,
      windowStartHour: 9,
      windowEndHour: 19,
      // O Freela não distingue sábado: domingo desligado no Praça vira dias úteis.
      weekdaysOnly: true,
    });
  });

  it('domingo ligado no Praça solta o fim de semana no Freela', () => {
    expect(toFreelaPacing({ ...SETTINGS, sunday: true }).weekdaysOnly).toBe(false);
  });

  it('intervalo longo derruba as mensagens por hora (piso de 1)', () => {
    expect(toFreelaPacing({ ...SETTINGS, gap_min: 3600, gap_max: 7200 }).messagesPerHour).toBe(1);
  });

  it('intervalo zero não vira Infinity — prende no teto de 60', () => {
    expect(toFreelaPacing({ ...SETTINGS, gap_min: 0, gap_max: 0 }).messagesPerHour).toBe(60);
  });

  it('limite diário acima do teto do Freela prende em 1000', () => {
    expect(toFreelaPacing({ ...SETTINGS, daily_limit: 5000 }).dailyCap).toBe(1000);
  });

  it('limite diário zerado prende no piso de 1', () => {
    expect(toFreelaPacing({ ...SETTINGS, daily_limit: 0 }).dailyCap).toBe(1);
  });
});
