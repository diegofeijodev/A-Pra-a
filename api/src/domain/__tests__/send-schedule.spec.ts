import { clampHour, etaText, nextSlot, scheduleTimes, type SendSettings } from '../send-schedule';

// Janela padrão do protótipo: 9h–19h de Brasília, sem domingo.
const ST: SendSettings = {
  mode: 'fila',
  window_start: 9,
  window_end: 19,
  sunday: false,
  daily_limit: 200,
  gap_min: 20,
  gap_max: 90,
};

// Sábado 12/09/2026 às 21:00 em Brasília — já é 13/09 em UTC. O agendamento
// tem que raciocinar em horário de Brasília, não no fuso do processo.
const SABADO_21H_BRT = new Date('2026-09-13T00:00:00Z');

describe('clampHour', () => {
  it('prende abaixo do mínimo em 8', () => expect(clampHour(7)).toBe(8));
  it('prende acima do máximo em 20', () => expect(clampHour(23)).toBe(20));
  it('deixa hora dentro da janela', () => expect(clampHour(14)).toBe(14));
});

describe('nextSlot', () => {
  it('sábado 21h BRT com domingo desligado cai na segunda 9h BRT', () => {
    expect(nextSlot(SABADO_21H_BRT, ST).toISOString()).toBe('2026-09-14T12:00:00.000Z');
  });

  it('com domingo ligado cai no domingo 9h BRT', () => {
    expect(nextSlot(SABADO_21H_BRT, { ...ST, sunday: true }).toISOString()).toBe('2026-09-13T12:00:00.000Z');
  });

  it('antes da janela sobe para a abertura do mesmo dia', () => {
    // Segunda 14/09 às 06:00 BRT = 09:00Z.
    expect(nextSlot(new Date('2026-09-14T09:00:00Z'), ST).toISOString()).toBe('2026-09-14T12:00:00.000Z');
  });

  it('dentro da janela não mexe no instante', () => {
    // Segunda 14/09 às 14:30 BRT = 17:30Z.
    const dentro = new Date('2026-09-14T17:30:00Z');
    expect(nextSlot(dentro, ST).toISOString()).toBe(dentro.toISOString());
  });

  it('19h em ponto já está fora (window_end é exclusivo)', () => {
    // Segunda 14/09 às 19:00 BRT = 22:00Z → terça 9h BRT.
    expect(nextSlot(new Date('2026-09-14T22:00:00Z'), ST).toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });

  it('não depende do fuso do processo', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      expect(nextSlot(SABADO_21H_BRT, ST).toISOString()).toBe('2026-09-14T12:00:00.000Z');
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe('scheduleTimes', () => {
  // `rng` injetado: sem ele o intervalo entre mensagens é sorteado e o teste
  // viraria loteria. `() => 0` = sempre o menor intervalo (gap_min).
  const semSorte = () => 0;

  it('o primeiro horário do lote é segunda 9:00 BRT', () => {
    const t = scheduleTimes(3, SABADO_21H_BRT, ST, semSorte);
    expect(t[0]).toBe('2026-09-14T12:00:00.000Z');
  });

  it('respeita o intervalo mínimo entre mensagens', () => {
    const t = scheduleTimes(3, SABADO_21H_BRT, ST, semSorte);
    expect(t).toEqual([
      '2026-09-14T12:00:00.000Z',
      '2026-09-14T12:00:20.000Z',
      '2026-09-14T12:00:40.000Z',
    ]);
  });

  it('limite diário 2 com 3 mensagens joga a terceira para o dia seguinte', () => {
    const t = scheduleTimes(3, SABADO_21H_BRT, { ...ST, daily_limit: 2 }, semSorte);
    expect(t.map((x) => x.slice(0, 10))).toEqual(['2026-09-14', '2026-09-14', '2026-09-15']);
    expect(t[2]).toBe('2026-09-15T12:00:00.000Z');
  });

  it('o sorteio fica entre gap_min e gap_max', () => {
    const t = scheduleTimes(2, SABADO_21H_BRT, ST, () => 1);
    const seg = (new Date(t[1]!).getTime() - new Date(t[0]!).getTime()) / 1000;
    expect(seg).toBeGreaterThanOrEqual(ST.gap_min);
    expect(seg).toBeLessThanOrEqual(ST.gap_max);
  });

  it('lote vazio devolve lista vazia', () => {
    expect(scheduleTimes(0, SABADO_21H_BRT, ST, semSorte)).toEqual([]);
  });
});

describe('etaText', () => {
  it('lote de uma mensagem é imediato', () => expect(etaText(['2026-09-14T12:00:00.000Z'])).toBe('imediato'));
  it('lote vazio é imediato', () => expect(etaText([])).toBe('imediato'));
  it('menos de 1 hora sai em minutos', () => {
    expect(etaText(['2026-09-14T12:00:00.000Z', '2026-09-14T12:30:00.000Z'])).toBe('30 min');
  });
  it('menos de 1 dia sai em horas com vírgula', () => {
    expect(etaText(['2026-09-14T12:00:00.000Z', '2026-09-14T14:30:00.000Z'])).toBe('2,5 h');
  });
  it('mais de 1 dia sai em dias úteis', () => {
    expect(etaText(['2026-09-14T12:00:00.000Z', '2026-09-16T12:00:00.000Z'])).toBe('5 dias úteis');
  });
});
