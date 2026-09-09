/**
 * Janela de envio e agendamento do lote — porta de
 * `.prototype/src/lib/praca/mensagens.ts:103-181`.
 *
 * Diferença que importa: no protótipo tudo rodava no navegador do operador,
 * então `getHours()`/`setHours()` já eram horário de Brasília por acidente. No
 * servidor não são — o processo pode subir em UTC. Aqui a janela
 * (`window_start`/`window_end`) e o "é domingo?" são lidos e escritos em
 * **horário de Brasília**, com o instante guardado sempre em UTC.
 */
import { addDays, hourSp, todaySp, weekdaySp } from '../common/time/dates';
import { HARD_MAX, HARD_MIN, type SendMode } from './catalog/messages';

const SP_TZ = 'America/Sao_Paulo';

export interface SendSettings {
  mode: SendMode;
  /** Hora de Brasília em que a janela abre (inclusiva). */
  window_start: number;
  /** Hora de Brasília em que a janela fecha (exclusiva). */
  window_end: number;
  sunday: boolean;
  daily_limit: number;
  /** Intervalo entre mensagens, em segundos. */
  gap_min: number;
  gap_max: number;
}

/** Hora prende na janela dura permitida (8h–20h). */
export const clampHour = (h: number): number => Math.min(HARD_MAX, Math.max(HARD_MIN, Math.round(h || 0)));

const SP_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: SP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Deslocamento de Brasília em minutos no instante `d` (hoje, −180). Sai do
 * próprio `Intl` em vez de constante: se o Brasil voltar com horário de verão,
 * o agendamento continua certo sem mexer aqui.
 */
function spOffsetMinutes(d: Date): number {
  const p: Record<string, string> = {};
  for (const part of SP_PARTS.formatToParts(d)) p[part.type] = part.value;
  const wall = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return (wall - Math.floor(d.getTime() / 1000) * 1000) / 60_000;
}

/** Instante UTC de uma hora cheia de Brasília num dia "YYYY-MM-DD". */
export function atSpHour(dateStr: string, hour: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wall = Date.UTC(y as number, (m as number) - 1, d as number, hour, 0, 0, 0);
  // Duas passadas: a primeira chuta o deslocamento pelo instante ingênuo, a
  // segunda confere no instante já corrigido (importa só se voltar o DST).
  const primeiro = wall - spOffsetMinutes(new Date(wall)) * 60_000;
  const segundo = wall - spOffsetMinutes(new Date(primeiro)) * 60_000;
  return new Date(segundo);
}

/** Empurra o instante para dentro da janela permitida (Brasília). */
export function nextSlot(d: Date, st: SendSettings): Date {
  let out = new Date(d.getTime());
  for (let guard = 0; guard < 30; guard++) {
    const dia = todaySp(out);
    if (weekdaySp(out) === 0 && !st.sunday) {
      out = atSpHour(addDays(dia, 1), st.window_start);
      continue;
    }
    const hora = hourSp(out);
    if (hora < st.window_start) {
      out = atSpHour(dia, st.window_start);
      continue;
    }
    if (hora >= st.window_end) {
      out = atSpHour(addDays(dia, 1), st.window_start);
      continue;
    }
    return out;
  }
  return out;
}

/**
 * Horário de cada mensagem do lote: intervalo sorteado entre `gap_min` e
 * `gap_max` segundos, respeitando a janela e o limite diário.
 *
 * `rng` entra por parâmetro (padrão `Math.random`) só para o teste conseguir
 * fixar o sorteio — em produção ninguém passa.
 */
export function scheduleTimes(
  count: number,
  start: Date,
  st: SendSettings,
  rng: () => number = Math.random,
): string[] {
  const out: string[] = [];
  let cursor = nextSlot(start, st);
  let dayKey = todaySp(cursor);
  let inDay = 0;
  for (let i = 0; i < count; i++) {
    if (inDay >= st.daily_limit) {
      cursor = nextSlot(atSpHour(addDays(todaySp(cursor), 1), st.window_start), st);
      dayKey = todaySp(cursor);
      inDay = 0;
    }
    out.push(cursor.toISOString());
    inDay++;
    const gap = st.gap_min + rng() * Math.max(1, st.gap_max - st.gap_min);
    cursor = nextSlot(new Date(cursor.getTime() + gap * 1000), st);
    // Virou o dia por causa da janela: o contador do limite diário zera.
    if (todaySp(cursor) !== dayKey) {
      dayKey = todaySp(cursor);
      inDay = 0;
    }
  }
  return out;
}

/** Tempo estimado do lote, em texto (`mensagens.ts:174-181`). */
export function etaText(times: string[]): string {
  if (times.length < 2) return 'imediato';
  const ms = new Date(times[times.length - 1]!).getTime() - new Date(times[0]!).getTime();
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 24) return `${h.toFixed(1).replace('.', ',')} h`;
  return `${Math.ceil(h / 10)} dias úteis`;
}
