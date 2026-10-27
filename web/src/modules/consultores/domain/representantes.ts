import { hora, plural } from '@/modules/campo/domain/formatos';
import { atuaNaPraca } from './pracas';

/**
 * Representantes (Lovable `representantes.tsx`, UX §4.7): os filtros da Lovable sobre a nossa lista (busca, situação e praça) e a
 * linha do dia de hoje na coluna "Status". Puro: a tela só mostra.
 */

export type FiltroSituacao = 'todos' | 'ativos' | 'inativos';

export interface FiltroRepresentantes {
  q: string;
  situacao: FiltroSituacao;
  /** Vazio = todas as praças. Com a flag F2, vale o conjunto de praças dele (`atuaNaPraca`). */
  pracaId: string;
}

interface Representante {
  name: string;
  email: string;
  phone: string;
  active: boolean;
  praca_id: string;
  praca_ids?: string[];
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Buscar por nome, e-mail ou telefone": nome e e-mail sem acento nem caixa; telefone pelos dígitos (3 ou mais). */
export function filtrarRepresentantes<T extends Representante>(lista: readonly T[], f: FiltroRepresentantes): T[] {
  const q = semAcento(f.q.trim());
  const digitos = f.q.replace(/\D/g, '');
  return lista.filter((c) => {
    if (f.situacao === 'ativos' && !c.active) return false;
    if (f.situacao === 'inativos' && c.active) return false;
    if (f.pracaId && !atuaNaPraca(c, f.pracaId)) return false;
    if (!q) return true;
    if (semAcento(c.name).includes(q) || semAcento(c.email).includes(q)) return true;
    return digitos.length >= 3 && c.phone.replace(/\D/g, '').includes(digitos);
  });
}

interface Hoje {
  status: 'em_jornada' | 'encerrou' | 'nao_iniciou';
  visits: number;
  closed?: number;
  last_point_at: string | null;
}

/**
 * A linha do dia embaixo do selo (UX §4.7): "em rota agora · 3 visitas · último ponto 14:32", "encerrou · 12 visitas" ou "não começou".
 * "Estabelecimento fechado" conta à parte (fora da meta, contrato §30.1), como no Dashboard.
 */
export function linhaDoDia(t: Hoje, formatarHora: (iso: string) => string = hora): string {
  if (t.status === 'nao_iniciou') return 'não começou';
  const fechados = t.closed ?? 0;
  const visitas = `${plural(t.visits - fechados, 'visita', 'visitas')}${fechados ? ` (+ ${plural(fechados, 'fechado', 'fechados')})` : ''}`;
  if (t.status === 'encerrou') return `encerrou · ${visitas}`;
  return `em rota agora · ${visitas} · último ponto ${t.last_point_at ? formatarHora(t.last_point_at) : '—'}`;
}
