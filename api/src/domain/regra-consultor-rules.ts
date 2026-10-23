/**
 * Regra de pagamento por consultor (L13, contrato §45) — regras PURAS. Por dia vale a versão DO CONSULTOR (maior
 * `valid_from ≤ dia`) e, se ele não tem nenhuma que já começou, a regra GERAL do dia. Nunca as duas somadas.
 * O calendário (semana, dia do Pix, fechamento automático, prazo tardio) é sempre o da regra geral.
 */
import { isDateString } from '../common/time/dates';
import {
  conferirAlinhamento,
  diaMes,
  versaoVigente,
  type ErroVigencia,
  type RegraBruta,
  type RegraRemuneracao,
  type VersaoRegra,
} from './earnings-rules';

/** Chaves que movem a máquina da semana para TODOS: na regra do consultor têm de ser as da geral. */
export const CHAVES_CALENDARIO = ['week_start_weekday', 'payout_weekday', 'autoclose_hour', 'late_grace_days'] as const satisfies readonly (keyof RegraRemuneracao)[];

/**
 * Lista "efetiva" de UM consultor para `versaoVigente`/`calcularSemana`: as versões gerais que começaram ANTES da 1ª
 * própria e todas as próprias (que, por começarem depois, vencem a partir delas). Sem própria = a MESMA lista geral.
 */
export function versoesDoConsultor<T extends { version: number; valid_from: string }>(geral: readonly T[], proprias: readonly T[]): readonly T[] {
  if (!proprias.length) return geral;
  const primeira = proprias.reduce((m, v) => (v.valid_from < m ? v.valid_from : m), proprias[0]!.valid_from);
  return [...geral.filter((v) => v.valid_from < primeira), ...proprias];
}

export type EscopoRegra = 'consultant' | 'global';

/** "Regra própria de Ana · versão 7" | "Regra geral · versão 3" */
export const rotuloRegraAplicada = (scope: EscopoRegra, version: number, nome: string): string =>
  scope === 'consultant' ? `Regra própria de ${nome} · versão ${version}` : `Regra geral · versão ${version}`;

export type ErroRegraConsultor = { code: 'VALIDATION_ERROR' | 'WEEK_CLOSED'; campo: string; message: string };

/**
 * Conferências de uma versão nova do consultor (além de `validarRegra` e das travas de flag, que são do serviço):
 *  - `valid_from` pode estar no passado, mas só em semana AINDA ABERTA dele: depois do fim da última semana fechada
 *    (`WEEK_CLOSED`) e não antes da semana em que ele foi criado. Semana aberta não tem lançamento no razão, então nada
 *    é recalculado nem estornado; o fechado só muda por ajuste manual (§28.4);
 *  - calendário igual ao da regra geral vigente no `valid_from`;
 *  - alinhamento semanal/mensal contra a regra RESOLVIDA do consultor naquele dia.
 */
export function validarRegraDoConsultor(p: {
  valid_from: string;
  nova: RegraBruta;
  geral: readonly VersaoRegra[];
  proprias: readonly VersaoRegra[];
  /** `week_end` da última semana fechada do consultor (null = nenhuma). */
  ultimaFechadaFim: string | null;
  /** Início da semana em que o consultor foi criado. */
  primeiraSemana: string;
}): ErroRegraConsultor | ErroVigencia | null {
  if (!isDateString(p.valid_from))
    return { code: 'VALIDATION_ERROR', campo: 'valid_from', message: 'valid_from: use uma data AAAA-MM-DD.' };
  if (p.ultimaFechadaFim && p.valid_from <= p.ultimaFechadaFim)
    return {
      code: 'WEEK_CLOSED',
      campo: 'valid_from',
      message: `valid_from: a semana até ${diaMes(p.ultimaFechadaFim)}/${p.ultimaFechadaFim.slice(0, 4)} deste consultor já foi fechada; a regra só pode começar depois dela. O que já foi fechado só muda por ajuste manual com motivo.`,
    };
  if (p.valid_from < p.primeiraSemana)
    return {
      code: 'VALIDATION_ERROR',
      campo: 'valid_from',
      message: `valid_from: o consultor começou na semana de ${diaMes(p.primeiraSemana)}/${p.primeiraSemana.slice(0, 4)}; a regra não pode começar antes.`,
    };
  const geral = versaoVigente(p.geral, p.valid_from);
  if (!geral) return { code: 'VALIDATION_ERROR', campo: 'valid_from', message: 'valid_from: nenhuma regra geral vale nesse dia.' };
  for (const k of CHAVES_CALENDARIO) {
    if (p.nova[k] !== geral.config[k])
      return {
        code: 'VALIDATION_ERROR',
        campo: k,
        message: `${k}: o calendário (início da semana, dia do Pix, hora do fechamento e prazo tardio) é o da regra geral; use ${geral.config[k]}.`,
      };
  }
  const antes = versaoVigente(versoesDoConsultor(p.geral, p.proprias), p.valid_from);
  return conferirAlinhamento(p.valid_from, p.nova, antes?.config ?? null);
}
