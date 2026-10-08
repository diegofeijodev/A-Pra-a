import { describe, expect, it } from 'vitest';
import { duracaoMin, hora, plural } from '../formatos';

describe('formatos do campo', () => {
  it('hora de Brasília, não a do navegador', () => {
    expect(hora('2026-10-08T15:04:00.000Z')).toBe('12:04');
  });

  it('duração em minutos (sem checkout = null)', () => {
    expect(duracaoMin('2026-10-08T15:00:00.000Z', '2026-10-08T15:25:30.000Z')).toBe(26);
    expect(duracaoMin('2026-10-08T15:00:00.000Z', null)).toBeNull();
  });

  it('plural', () => {
    expect(plural(1, 'envio pendente', 'envios pendentes')).toBe('1 envio pendente');
    expect(plural(2, 'envio pendente', 'envios pendentes')).toBe('2 envios pendentes');
  });
});
