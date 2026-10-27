/**
 * Textos e números das visões Hoje e Roteiro do representante no desenho da Lovable (redesenho E5c, UX §4.12 e §4.13;
 * Lovable `inicio.tsx` `CardRota` e `roteiro.$rotaId.tsx`). Só apresentação: tudo sai do dia local (servidor + fila) e do
 * roteiro de hoje, sem conta nova no servidor. Todo número leva a conta (regra do dono, 08/10).
 */
import { duracao, horaCurta } from '@/modules/painel/domain/painel';
import { SITUACOES_LISTA } from '@/modules/pinos/domain/pinos';
import { rotuloDia } from '@/modules/remuneracao/domain/remuneracao';
import type { RouteView, StopView } from '@/modules/rotas/domain/rota.schema';
import type { DiaLocal, VisitaLocal } from './dia-local';
import { duracaoMin, plural } from './formatos';
import { ehResultadoSimples, ROTULO_RESULTADO, type ResultadoSimples } from './fluxo';

/** "Ana Paula Souza" → "Ana". */
export const primeiroNome = (nome: string | null | undefined): string => (nome ?? '').trim().split(/\s+/)[0] ?? '';

/** Título da Hoje (Lovable): "Bom trabalho, Ana!". */
export function saudacao(nome: string | null | undefined): string {
  const p = primeiroNome(nome);
  return p ? `Bom trabalho, ${p}!` : 'Bom trabalho!';
}

/** Apoio do título (nosso, UX §4.12): "Hoje, seg 26/10 · BH + Contagem". */
export const subtituloHoje = (dia: string, praca: string | null | undefined): string => `Hoje, ${rotuloDia(dia)}${praca ? ` · ${praca}` : ''}`;

/** As paradas que são da rota (planejadas, sem as descartadas), na ordem. As reservas ficam fora: só entram no lugar de quem é pulado. */
export const paradasDaRota = (stops: readonly StopView[]): StopView[] =>
  [...stops].filter((s) => s.kind === 'planejada' && s.status !== 'descartada').sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));

const minutos = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const km = (x: number): string => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;

export interface CartaoDaRota {
  paradas: number;
  /** "7,8 km": soma dos trechos até as paradas que faltam (`plan.walk_km`). */
  percurso: string;
  modo: 'A pé' | 'Carro/moto';
  /** "8h40" da abertura da janela ao fim da última parada; `null` sem horário previsto. */
  tempoPrevisto: string | null;
  /** De onde vem cada número (vai no "ⓘ Como contamos" do cartão). */
  conta: string[];
}

/** O `CardRota` da Lovable com os nossos dados (UX §4.12): paradas, percurso, modo e tempo previsto. */
export function cartaoDaRota(route: Pick<RouteView, 'stops' | 'plan' | 'params' | 'travel_mode'>): CartaoDaRota {
  const paradas = paradasDaRota(route.stops);
  const etas = paradas.map((s) => s.eta).filter((e): e is string => !!e && /^\d{2}:\d{2}/.test(e));
  const conta = [
    `Paradas: ${paradas.length} da rota de hoje (as reservas não contam).`,
    `Percurso: soma dos trechos de rua até as paradas que faltam (linha reta × ${String(route.params.fator_desvio).replace('.', ',')}).`,
  ];
  let tempoPrevisto: string | null = null;
  if (etas.length) {
    const ultima = etas.reduce((a, b) => (minutos(b) > minutos(a) ? b : a));
    const total = minutos(ultima) + route.params.minutos_por_visita - minutos(route.params.janela_inicio);
    if (total > 0) {
      tempoPrevisto = duracao(total);
      conta.push(
        `Tempo previsto: da abertura da janela (${horaCurta(route.params.janela_inicio)}) até o fim da última parada (chegada ${horaCurta(ultima)} + ${route.params.minutos_por_visita} min de visita), pelo relógio do roteiro.`,
      );
    }
  }
  return { paradas: paradas.length, percurso: km(route.plan.walk_km), modo: route.travel_mode === 'carro' ? 'Carro/moto' : 'A pé', tempoPrevisto, conta };
}

/** Situação do dia no selo do cartão do Roteiro (Lovable `estadoRota`). */
export type EstadoDoDia = 'nao_iniciada' | 'em_rota' | 'intervalo' | 'encerrada';
export const ROTULO_ESTADO: Record<EstadoDoDia, string> = {
  nao_iniciada: 'Não iniciada',
  em_rota: 'Em rota',
  intervalo: 'Em intervalo',
  encerrada: 'Encerrada',
};

/** Com o intervalo desligado no servidor, um intervalo guardado não conta (a tela não tem como encerrá-lo). */
export function estadoDoDia(dia: Pick<DiaLocal, 'jornada' | 'intervaloAberto' | 'encerradaHoje'>, intervaloLigado: boolean): EstadoDoDia {
  if (dia.jornada) return intervaloLigado && dia.intervaloAberto ? 'intervalo' : 'em_rota';
  return dia.encerradaHoje ? 'encerrada' : 'nao_iniciada';
}

/** Média de chegada → conclusão das visitas concluídas hoje (as fechadas sozinhas à meia-noite não entram); `null` sem nenhuma. */
export function tempoMedioMin(visitas: readonly Pick<VisitaLocal, 'checkin_at' | 'checkout_at' | 'auto_closed'>[]): number | null {
  const mins = visitas.filter((v) => !v.auto_closed).map((v) => duracaoMin(v.checkin_at, v.checkout_at)).filter((m): m is number => m !== null);
  return mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
}

export interface ProgressoDoDia {
  feitos: number;
  /** Paradas da rota (ou a meta, sem rota); `null` sem nenhum dos dois. */
  total: number | null;
  /** 0–100, para a barra. */
  pct: number;
  /** "4 de 18 clientes visitados · 2 cadastros · tempo médio 14 min" (Lovable). */
  linha: string;
}

/**
 * A linha da Lovable embaixo da barra. Com rota: paradas visitadas ÷ paradas da rota; sem rota: visitas que contam na meta ÷ meta.
 * Cadastros = os "cadastrou agora" do dia (resultado no simples, QR no completo).
 */
export function progressoDoDia(p: { feitos: number; total: number | null; cadastros: number; tempoMedio: number | null; comRota: boolean }): ProgressoDoDia {
  const base =
    p.total === null
      ? plural(p.feitos, 'visita feita', 'visitas feitas')
      : p.comRota
        ? `${p.feitos} de ${p.total} clientes visitados`
        : `${p.feitos} de ${p.total} visitas da meta`;
  const partes = [base, plural(p.cadastros, 'cadastro', 'cadastros'), ...(p.tempoMedio === null ? [] : [`tempo médio ${p.tempoMedio} min`])];
  const pct = p.total ? Math.min(100, Math.round((p.feitos / p.total) * 100)) : 0;
  return { feitos: p.feitos, total: p.total, pct, linha: partes.join(' · ') };
}

/** Cadastros "agora" do dia: o resultado "Cadastrou agora" (simples) e o "Cadastrou agora pelo QR" (completo); um exclui o outro. */
export const cadastrosDoDia = (c: DiaLocal['contadores']): number => c.cadastrou_agora + c.cadastrou_qr;

/** Resultado de uma visita do servidor, o mínimo para o selo da parada visitada. */
export interface VisitaDaParada {
  flow?: 'simples' | 'completo';
  answers: { result?: string | null; freela_status?: string | null; outcome?: string | null };
}

const COR_DO_RESULTADO: Record<ResultadoSimples, string> = {
  cadastrou: 'cadastrado',
  ja_usa: 'ja_usa',
  retorno: 'retornar',
  sem_interesse: 'nao_cadastrado',
  fechado: 'fechado',
};

/**
 * Selo da parada visitada (Lovable: cor + ✓ + rótulo). Simples: o resultado escolhido; completo: "Cadastrou agora" pelo QR ou
 * "Estabelecimento fechado"; o resto (e a visita que ainda não chegou ao servidor) é só "Visitado", sem cor de situação.
 */
export function seloDaParada(v: VisitaDaParada | undefined): { rotulo: string; cor: string | null } {
  const comCor = (code: string | null, rotulo: string) => ({ rotulo, cor: code ? (SITUACOES_LISTA.find((s) => s.code === code)?.color ?? null) : null });
  if (!v) return comCor(null, 'Visitado');
  if (ehResultadoSimples(v.answers.result)) return comCor(COR_DO_RESULTADO[v.answers.result], ROTULO_RESULTADO[v.answers.result]);
  if (v.answers.freela_status === 'cadastrou_qr') return comCor('cadastrado', 'Cadastrou agora');
  if (v.answers.outcome === 'fechado') return comCor('fechado', 'Estabelecimento fechado');
  return comCor(null, 'Visitado');
}
