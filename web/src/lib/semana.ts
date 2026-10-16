// Semana de rota: segunda a sábado (bloco B, contrato §21.5). Mesma regra da API.
import { addDays, wdOf } from './dates';

/** Segunda da semana de `dia`; domingo pertence à semana que terminou no sábado. */
export function segundaDaSemana(dia: string): string {
  const wd = wdOf(dia);
  return addDays(dia, wd === 0 ? -6 : 1 - wd);
}

export function diasDaSemana(dia: string): string[] {
  const seg = segundaDaSemana(dia);
  return Array.from({ length: 6 }, (_, i) => addDays(seg, i));
}
