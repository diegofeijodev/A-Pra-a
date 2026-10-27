/**
 * Painel do gestor (contrato §33.4) — PURO. Origem: Lovable `src/lib/indicadores.ts` (`calcularIndicadores`): % concluídas,
 * positivação, tempo médio (intervalo entre registros seguidos, até 120 min) e ranking (cadastros, depois positivação).
 * Diferenças (UX §3.1): dia de Brasília (a Lovable usava o dia UTC), "tempo entre visitas" com o nome certo, cada número
 * com a conta e a fonte, resultado das visitas pelas nossas situações.
 */
import { textoFonteCadastros, type FontePeriodo } from './cadastros-dia-rules';
import { grupoConfig, inteiroEntre, umDe } from './config-grupo';
import { CATEGORIAS_VISITA, categoriaDaVisita, META_CATEGORIA, type VisitaParaCategoria } from './pin-rules';

export const PAINEL_TEMPOS = ['intervalo', 'duracao'] as const;
export type PainelTempo = (typeof PAINEL_TEMPOS)[number];

export interface ConfigPainel {
  painel_tempo_medio: PainelTempo;
  painel_gap_max_min: number;
}
export const CONFIG_PAINEL = grupoConfig<ConfigPainel>(
  { painel_tempo_medio: 'intervalo', painel_gap_max_min: 120 },
  { painel_tempo_medio: umDe(PAINEL_TEMPOS), painel_gap_max_min: inteiroEntre(10, 480) },
);

export interface VisitaPainel extends VisitaParaCategoria {
  id: string;
  consultant_id: string;
  /** `field_journeys.day` (Brasília). */
  day: string;
  checkin_at: Date;
  checkout_at: Date;
  /** Ligada a alguma parada de roteiro. */
  na_rota: boolean;
}

/** Intervalos (min) entre chegadas seguidas do MESMO consultor no MESMO dia; 0 e acima de `gapMax` ficam de fora. */
export function intervalosEntreChegadas(
  visitas: readonly Pick<VisitaPainel, 'consultant_id' | 'day' | 'checkin_at'>[],
  gapMax: number,
): number[] {
  const grupos = new Map<string, number[]>();
  for (const v of visitas) {
    const k = `${v.consultant_id}|${v.day}`;
    const l = grupos.get(k) ?? [];
    l.push(v.checkin_at.getTime());
    grupos.set(k, l);
  }
  const gaps: number[] = [];
  for (const ts of grupos.values()) {
    ts.sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i += 1) {
      const g = (ts[i]! - ts[i - 1]!) / 60_000;
      if (g > 0 && g <= gapMax) gaps.push(g);
    }
  }
  return gaps;
}

const media = (xs: number[]): number | null =>
  xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length) : null;
const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((100 * num) / den) : null);
const plural = (n: number, um: string, varios: string): string =>
  `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

export interface EntradaPainel {
  consultores: { id: string; name: string; praca_id: string; active: boolean }[];
  visitas: VisitaPainel[];
  paradas: { planejadas: number; visitadas: number };
  /** `cadastrosDoDia` somado no período, por consultor. */
  cadastros: Map<string, number>;
  fonteCadastros: FontePeriodo;
  syncLigado: boolean;
  pracasAbertas: number;
  leadsMapeados: number;
  leadsSemLocalizacao: number;
  cfg: ConfigPainel;
  /** Cupons da 1ª contratação (§38.8): AUSENTE/`null` = módulo desligado (cartão "Não ligado", como hoje). */
  cupons?: ResumoCupons | null;
  /** O cupom real no Freela está ligado (a conta cita os criados). */
  cuponsNoFreela?: boolean;
}

/** Pedidos de cupom feitos no período e a situação de cada um agora. */
export interface ResumoCupons {
  requested: number;
  pending: number;
  approved: number;
  rejected: number;
  coupons_created: number;
}

export interface PainelCalculado {
  kpis: {
    planned_stops: number;
    done_stops: number;
    pct_done: number | null;
    visits: number;
    visits_off_route: number;
    signups: number;
    signups_source: FontePeriodo;
    declared_now: number;
    positivation_pct: number | null;
    avg_gap_min: number | null;
    avg_duration_min: number | null;
    time_headline: PainelTempo;
    vouchers: ResumoCupons | null;
    pracas_open: number;
    consultants_active: number;
    leads_mapped: number;
    leads_without_exact_location: number;
  };
  ranking: {
    consultant_id: string;
    name: string;
    praca_id: string;
    visits: number;
    signups: number;
    positivation_pct: number | null;
  }[];
  by_result: { code: string; label: string; color: string; n: number }[];
  conta: Record<
    'pct_done' | 'visits' | 'positivation' | 'time' | 'signups' | 'vouchers' | 'pracas_open' | 'leads_mapped',
    string
  >;
  fonte: Record<
    'pct_done' | 'visits' | 'positivation' | 'time' | 'signups' | 'vouchers' | 'pracas_open' | 'leads_mapped',
    string
  >;
}

export function montarPainel(e: EntradaPainel): PainelCalculado {
  const V = e.visitas.length;
  const foraDaRota = e.visitas.filter((v) => !v.na_rota).length;
  const S = [...e.consultores].reduce((a, c) => a + (e.cadastros.get(c.id) ?? 0), 0);
  const declaradasAgora = e.visitas.filter(
    (v) => v.result === 'cadastrou' || v.freela_status === 'cadastrou_qr',
  ).length;
  const gaps = intervalosEntreChegadas(e.visitas, e.cfg.painel_gap_max_min);
  const duracoes = e.visitas
    .map((v) => (v.checkout_at.getTime() - v.checkin_at.getTime()) / 60_000)
    .filter((m) => m >= 0);
  const gap = media(gaps);
  const duracao = media(duracoes);
  const pctDone = pct(e.paradas.visitadas, e.paradas.planejadas);
  const positivacao = pct(S, V);

  const porConsultor = new Map<string, number>();
  for (const v of e.visitas) porConsultor.set(v.consultant_id, (porConsultor.get(v.consultant_id) ?? 0) + 1);
  const ranking = e.consultores
    .map((c) => {
      const visits = porConsultor.get(c.id) ?? 0;
      const signups = e.cadastros.get(c.id) ?? 0;
      return {
        consultant_id: c.id,
        name: c.name,
        praca_id: c.praca_id,
        visits,
        signups,
        positivation_pct: pct(signups, visits),
        razao: visits > 0 ? signups / visits : 0,
      };
    })
    .filter((r) => r.visits > 0 || r.signups > 0)
    .sort((a, b) => b.signups - a.signups || b.razao - a.razao || a.name.localeCompare(b.name, 'pt-BR'))
    .map(({ razao: _razao, ...r }) => r);

  const porResultado = new Map<string, number>();
  for (const v of e.visitas) {
    const c = categoriaDaVisita(v);
    porResultado.set(c, (porResultado.get(c) ?? 0) + 1);
  }
  const by_result = CATEGORIAS_VISITA.map((c) => ({
    code: c,
    label: META_CATEGORIA[c].label,
    color: META_CATEGORIA[c].color,
    n: porResultado.get(c) ?? 0,
  }));
  const ativos = e.consultores.filter((c) => c.active).length;
  const tempoGrande = e.cfg.painel_tempo_medio;

  return {
    kpis: {
      planned_stops: e.paradas.planejadas,
      done_stops: e.paradas.visitadas,
      pct_done: pctDone,
      visits: V,
      visits_off_route: foraDaRota,
      signups: S,
      signups_source: e.fonteCadastros,
      declared_now: declaradasAgora,
      positivation_pct: positivacao,
      avg_gap_min: gap,
      avg_duration_min: duracao,
      time_headline: tempoGrande,
      vouchers: e.cupons ?? null,
      pracas_open: e.pracasAbertas,
      consultants_active: ativos,
      leads_mapped: e.leadsMapeados,
      leads_without_exact_location: e.leadsSemLocalizacao,
    },
    ranking,
    by_result,
    conta: {
      pct_done:
        pctDone == null
          ? 'Sem rota planejada no período.'
          : `${e.paradas.visitadas} de ${plural(e.paradas.planejadas, 'parada planejada', 'paradas planejadas')} nas rotas com a visita concluída = ${pctDone}%.`,
      visits: `${plural(V, 'visita concluída', 'visitas concluídas')} no período, com ou sem roteiro; ${foraDaRota} fora do roteiro.`,
      positivation:
        positivacao == null
          ? 'Sem visita concluída no período.'
          : `${S} ${S === 1 ? 'cadastro' : 'cadastros'} ÷ ${plural(V, 'visita', 'visitas')} = ${positivacao}%. "Cadastrou agora" marcado nas visitas: ${declaradasAgora}.`,
      time:
        tempoGrande === 'intervalo'
          ? `Média de ${plural(gaps.length, 'intervalo', 'intervalos')} entre chegadas seguidas do mesmo consultor no mesmo dia (acima de ${e.cfg.painel_gap_max_min} min fica de fora)${gap == null ? '' : ` = ${gap} min`}. Dentro do local (chegada → conclusão): ${duracao == null ? '—' : `${duracao} min`}.`
          : `Média de chegada → conclusão de ${plural(duracoes.length, 'visita', 'visitas')}${duracao == null ? '' : ` = ${duracao} min`}. Entre chegadas seguidas: ${gap == null ? '—' : `${gap} min`}.`,
      signups: `Soma dos cadastros de cada consultor em cada dia do período = ${S}. "Cadastrou agora" nas visitas: ${declaradasAgora}${e.syncLigado ? '' : '; confirmação pelo Freela ainda não ligada neste servidor'}.`,
      vouchers: e.cupons ? contaCupons(e.cupons, e.cuponsNoFreela === true) : 'Não ligado neste servidor.',
      pracas_open: `${plural(e.pracasAbertas, 'praça com início', 'praças com início')} até hoje · ${plural(ativos, 'consultor ativo', 'consultores ativos')}.`,
      leads_mapped: `${plural(e.leadsMapeados, 'estabelecimento', 'estabelecimentos')} com localização exata (ponto ou endereço) · ${e.leadsSemLocalizacao.toLocaleString('pt-BR')} sem localização exata.`,
    },
    fonte: {
      pct_done: 'Roteiros do dia (paradas planejadas não descartadas; concluída = a visita da parada terminou; visita ainda aberta não conta).',
      visits: 'Visitas de campo concluídas, pelo dia da jornada (Brasília).',
      positivation: textoFonteCadastros(e.fonteCadastros, e.syncLigado),
      time: 'Horários de chegada e de conclusão das visitas (Brasília).',
      signups: textoFonteCadastros(e.fonteCadastros, e.syncLigado),
      vouchers: e.cupons
        ? 'Pedidos de cupom da 1ª contratação feitos no período (dia de Brasília); a situação de cada um é a de agora.'
        : 'Cupons da 1ª contratação (módulo ainda não ligado).',
      pracas_open: 'Datas de início das praças; cadastro dos consultores.',
      leads_mapped: 'Estabelecimentos não arquivados, fora os de teste.',
    },
  };
}

/** "3 pedidos no período: 1 aprovado, 1 esperando aprovação, 1 reprovado; 1 cupom criado no Freela." (as parcelas somam os pedidos). */
function contaCupons(c: ResumoCupons, noFreela: boolean): string {
  const base = `${plural(c.requested, 'pedido', 'pedidos')} no período: ${plural(c.approved, 'aprovado', 'aprovados')}, ${c.pending.toLocaleString('pt-BR')} esperando aprovação, ${plural(c.rejected, 'reprovado', 'reprovados')}`;
  return noFreela ? `${base}; ${plural(c.coupons_created, 'cupom criado', 'cupons criados')} no Freela.` : `${base}.`;
}
