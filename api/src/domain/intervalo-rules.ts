/**
 * Intervalo e almoço como evento da jornada (restante da Lovable, fase L4; contrato §37) — regras PURAS.
 *
 * Lovable: eventos `inicio_intervalo`/`fim_intervalo` (`0009:5`), `estadoRota` (`src/lib/visita.ts:7-13`), intervalo no resumo
 * (`:54-58`) e alerta acima de 75 min (`:69`). Aqui o intervalo REAL substitui o almoço configurado na conta do ritmo (nunca os dois).
 */
import { minutesSp } from '../common/time/dates';
import { grupoConfig, inteiroEntre } from './config-grupo';

export interface ConfigIntervalo {
  /** Mostra "Intervalo"/"Voltar do intervalo" no campo (Lovable). `false` = nossa versão (só o almoço configurado). */
  intervalo_ativo: boolean;
  /** Depois disso o aparelho lembra "Intervalo há 1h. Voltar agora?" (UX §3.6); nunca encerra sozinho. */
  intervalo_lembrete_min: number;
  /** Intervalo aberto há mais que isso = alerta `intervalo_longo` na "Atenção agora" (Lovable: 75). */
  alerta_intervalo_min: number;
}

export const CONFIG_INTERVALO = grupoConfig<ConfigIntervalo>(
  { intervalo_ativo: true, intervalo_lembrete_min: 60, alerta_intervalo_min: 75 },
  {
    intervalo_ativo: (v) => typeof v === 'boolean',
    intervalo_lembrete_min: inteiroEntre(15, 480),
    alerta_intervalo_min: inteiroEntre(15, 480),
  },
);

export interface Pausa {
  started_at: Date;
  ended_at: Date | null;
}

/** Intervalo em minutos do dia de Brasília (a conta do ritmo é em minutos do dia). */
export interface PausaMin {
  ini: number;
  fim: number;
}

const minutosEntre = (a: Date, b: Date): number => Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60_000));

/** Minutos de UM intervalo (o aberto conta até agora). */
export const minutosDaPausa = (p: Pausa, agora: Date): number => minutosEntre(p.started_at, p.ended_at ?? agora);

/** Soma dos intervalos (Lovable `resumoRota`: soma dos pares início/fim). */
export const minutosDePausas = (ps: readonly Pausa[], agora: Date): number => ps.reduce((a, p) => a + minutosDaPausa(p, agora), 0);

/** Os intervalos em minutos do dia (o aberto até agora); o fim nunca fica antes do início. */
export function pausasEmMinutos(ps: readonly Pausa[], agora: Date): PausaMin[] {
  return ps.map((p) => {
    const ini = minutesSp(p.started_at);
    return { ini, fim: Math.max(ini, minutesSp(p.ended_at ?? agora)) };
  });
}

/**
 * Minutos de trabalho decorridos às `agoraMin`: a janela até agora MENOS a sobreposição dos intervalos reais com ela — no lugar do
 * almoço configurado (contrato §37.6: nunca os dois).
 */
export function minutosUteisComPausas(agoraMin: number, p: { janelaIni: number; janelaFim: number }, pausas: readonly PausaMin[]): number {
  const t = Math.min(Math.max(agoraMin, p.janelaIni), p.janelaFim);
  const descontado = pausas.reduce((a, x) => a + Math.max(0, Math.min(x.fim, t) - Math.max(x.ini, p.janelaIni)), 0);
  return Math.max(0, t - p.janelaIni - descontado);
}

/** Encerramento automático (check-in, fim da jornada, meia-noite): o fim nunca fica antes do início. */
export const fimDaPausa = (inicio: Date, fim: Date): Date => (fim.getTime() < inicio.getTime() ? inicio : fim);

export const MOTIVOS_FIM_INTERVALO = ['manual', 'checkin', 'journey_end', 'auto'] as const;
export type MotivoFimIntervalo = (typeof MOTIVOS_FIM_INTERVALO)[number];
