const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Hora de Brasília ("12:04") — a mesma regra de dia do servidor. */
export const hora = (iso: string): string => HORA.format(new Date(iso));

/** Minutos entre check-in e checkout; sem checkout, `null`. */
export function duracaoMin(inicio: string, fim: string | null): number | null {
  if (!fim) return null;
  return Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000));
}

export const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
