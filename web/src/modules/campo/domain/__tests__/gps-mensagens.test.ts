import { describe, expect, it } from 'vitest';
import { MENSAGEM_GPS, motivoDoErro } from '../gps-mensagens';

describe('GPS negado / indisponível', () => {
  it('códigos do GeolocationPositionError', () => {
    expect(motivoDoErro(1)).toBe('negado');
    expect(motivoDoErro(2)).toBe('indisponivel');
    expect(motivoDoErro(3)).toBe('tempo');
    expect(motivoDoErro(undefined)).toBe('indisponivel');
  });

  it('negado ensina a liberar no iPhone (Safari) e no Android (Chrome)', () => {
    const passos = MENSAGEM_GPS.negado.passos.join(' ');
    expect(MENSAGEM_GPS.negado.titulo).toBe('A localização está bloqueada para este site');
    expect(passos).toContain('Safari');
    expect(passos).toContain('Chrome');
  });

  it('página fora de https explica o motivo', () => {
    expect(MENSAGEM_GPS.inseguro.titulo).toContain('https');
  });
});
