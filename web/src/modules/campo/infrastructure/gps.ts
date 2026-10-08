import type { Posicao } from '../domain/campo.types';
import { motivoDoErro, type MotivoGps } from '../domain/gps-mensagens';

export class ErroGps extends Error {
  constructor(readonly motivo: MotivoGps) {
    super(motivo);
  }
}

/** Posição agora, com a hora REAL da ação (não a do último fix do GPS). */
export function lerPosicao(timeoutMs = 20_000): Promise<Posicao> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) return reject(new ErroGps('inseguro'));
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return reject(new ErroGps('sem_suporte'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          at: new Date().toISOString(),
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Math.round(p.coords.accuracy),
        }),
      (e) => reject(new ErroGps(motivoDoErro(e.code))),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
