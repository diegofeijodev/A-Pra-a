/**
 * Consulta dos retornos pendentes (contrato §25.4). Função simples sobre o Prisma — usada pela
 * fila (equipe e consultor) e pelo roteiro automático (`RotasCampoService`), sem acoplar módulos.
 * A decisão de "ainda pendente" é do domínio (`followup-rules.ts`).
 */
import type { PrismaService } from '../../common/database/prisma.service';
import {
  classificarRetorno,
  compararRetornos,
  ESTAGIO_CADASTRADO,
  retornosPendentes,
  type ClasseRetorno,
} from '../../domain/followup-rules';

/** Teto de visitas com retorno vencido lidas por consulta (as mais antigas primeiro). */
export const LIMITE_LEITURA = 1000;
export const LIMITE_FILA = 200;

export interface RetornoLinha extends ClasseRetorno {
  visit_id: string;
  lead_id: string;
  lead_name: string;
  phone: string;
  phone_key: string;
  address: string;
  praca_id: string | null;
  consultant_id: string;
  consultant_name: string;
  followup_what: string;
  followup_date: string;
  visited_at: Date;
  interlocutor_name: string | null;
  interest: string | null;
  lat: number | null;
  lng: number | null;
  location_precision: string | null;
  far_from_place: boolean;
}

export interface RetornosLidos {
  /** Todos os pendentes lidos, já na ordem da fila. */
  itens: RetornoLinha[];
  today: number;
  overdue: number;
}

export async function lerRetornosPendentes(
  prisma: PrismaService,
  filtro: { hoje: string; consultantId?: string; pracaId?: string },
): Promise<RetornosLidos> {
  const candidatas = await prisma.field_visits.findMany({
    where: {
      needs_followup: true,
      checkout_at: { not: null },
      followup_date: { not: null, lte: filtro.hoje },
      ...(filtro.consultantId ? { consultant_id: filtro.consultantId } : {}),
      lead: {
        archived: false,
        is_test: false,
        stage: { lt: ESTAGIO_CADASTRADO },
        ...(filtro.pracaId ? { praca_id: filtro.pracaId } : {}),
      },
    },
    select: {
      id: true,
      lead_id: true,
      checkin_at: true,
      checkout_at: true,
      needs_followup: true,
      followup_date: true,
      followup_what: true,
      interlocutor_name: true,
      interest: true,
      far_from_place: true,
      consultant_id: true,
      consultant: { select: { name: true } },
      lead: { select: { name: true, phone: true, phone_key: true, address: true, praca_id: true, lat: true, lng: true, location_precision: true } },
    },
    orderBy: [{ followup_date: 'asc' }, { id: 'asc' }],
    take: LIMITE_LEITURA,
  });
  if (candidatas.length === 0) return { itens: [], today: 0, overdue: 0 };

  const leadIds = [...new Set(candidatas.map((v) => v.lead_id))];
  const recentes = await prisma.field_visits.groupBy({ by: ['lead_id'], where: { lead_id: { in: leadIds } }, _max: { checkin_at: true } });
  const maisRecente = new Map<string, Date>();
  for (const r of recentes) if (r._max.checkin_at) maisRecente.set(r.lead_id, r._max.checkin_at);

  const itens = retornosPendentes(candidatas, maisRecente, filtro.hoje)
    .map((v): RetornoLinha => {
      const data = v.followup_date!;
      return {
        ...classificarRetorno(data, filtro.hoje),
        visit_id: v.id,
        lead_id: v.lead_id,
        lead_name: v.lead.name,
        phone: v.lead.phone,
        phone_key: v.lead.phone_key,
        address: v.lead.address,
        praca_id: v.lead.praca_id,
        consultant_id: v.consultant_id,
        consultant_name: v.consultant.name,
        followup_what: v.followup_what ?? '',
        followup_date: data,
        visited_at: v.checkin_at,
        interlocutor_name: v.interlocutor_name,
        interest: v.interest,
        lat: v.lead.lat,
        lng: v.lead.lng,
        location_precision: v.lead.location_precision,
        far_from_place: v.far_from_place,
      };
    })
    .sort(compararRetornos);
  return {
    itens,
    today: itens.filter((i) => i.due === 'hoje').length,
    overdue: itens.filter((i) => i.due === 'atrasado').length,
  };
}
