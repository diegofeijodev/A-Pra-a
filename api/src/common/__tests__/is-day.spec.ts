import { isDayString } from '../validation/is-day.decorator';
import { isDateString } from '../time/dates';

describe('isDayString / isDateString', () => {
  it('aceita dia que existe no calendário', () => {
    expect(isDayString('2026-02-28')).toBe(true);
    expect(isDayString('2028-02-29')).toBe(true); // 2028 é bissexto
    expect(isDayString('2026-12-31')).toBe(true);
  });

  it('recusa dia que não existe (o buraco que a regex sozinha deixava passar)', () => {
    expect(isDayString('2026-02-31')).toBe(false);
    expect(isDayString('2026-13-45')).toBe(false);
    expect(isDayString('2026-09-31')).toBe(false);
    expect(isDayString('2026-02-29')).toBe(false); // 2026 não é bissexto
  });

  it('recusa formato errado e qualquer coisa que não seja string', () => {
    expect(isDayString('2026-9-1')).toBe(false);
    expect(isDayString('09/09/2026')).toBe(false);
    expect(isDayString('2026-09-09T12:00:00Z')).toBe(false);
    expect(isDayString('')).toBe(false);
    expect(isDayString(20260909)).toBe(false);
    expect(isDayString(null)).toBe(false);
    expect(isDayString(undefined)).toBe(false);
  });

  it('isDayString e isDateString são a mesma regra', () => {
    for (const v of ['2026-02-28', '2026-02-31', 'xx', '2026-13-45']) {
      expect(isDayString(v)).toBe(isDateString(v));
    }
  });
});
