import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MULTI_PRACA_LIGADO } from '../flags/multi-praca.flags';
import { conjuntoDe } from '../../domain/multi-praca-rules';

export interface PracaDoConjunto {
  id: string;
  name: string;
  principal: boolean;
}

/**
 * Consultor em várias praças (contrato §44). Tudo aqui respeita a flag: desligada, o conjunto é só a principal, nenhum filtro muda
 * e NENHUMA consulta nova é feita (os `where` devolvidos são os de hoje).
 */
@Injectable()
export class PracasDoConsultorService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(MULTI_PRACA_LIGADO) private readonly flag: boolean = false,
  ) {}

  get ligado(): boolean {
    return this.flag === true;
  }

  /** As praças além da principal (só com a flag; desligada, nenhuma consulta). */
  async extras(consultantId: string): Promise<string[]> {
    if (!this.ligado) return [];
    const rows = await this.prisma.field_consultant_pracas.findMany({ where: { consultant_id: consultantId }, select: { praca_id: true } });
    return rows.map((r) => r.praca_id);
  }

  /** O conjunto (principal primeiro). Desligada = `[principal]`. */
  async conjunto(consultantId: string, principal: string): Promise<string[]> {
    return conjuntoDe(principal, await this.extras(consultantId));
  }

  /** O conjunto com os nomes: a principal primeiro, depois por nome. */
  async conjuntoComNomes(consultantId: string, principal: string): Promise<PracaDoConjunto[]> {
    const ids = await this.conjunto(consultantId, principal);
    const rows = await this.prisma.pracas.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return paraConjunto(principal, rows);
  }

  /** Os conjuntos de vários consultores de uma vez (lista da equipe), sem N+1. Desligada = `{}` (nada lido). */
  async conjuntos(consultores: { id: string; praca_id: string }[]): Promise<Map<string, PracaDoConjunto[]>> {
    const out = new Map<string, PracaDoConjunto[]>();
    if (!this.ligado || consultores.length === 0) return out;
    const links = await this.prisma.field_consultant_pracas.findMany({
      where: { consultant_id: { in: consultores.map((c) => c.id) } },
      select: { consultant_id: true, praca_id: true },
    });
    const todos = [...new Set([...consultores.map((c) => c.praca_id), ...links.map((l) => l.praca_id)])];
    const nomes = await this.prisma.pracas.findMany({ where: { id: { in: todos } }, select: { id: true, name: true } });
    for (const c of consultores) {
      const ids = conjuntoDe(c.praca_id, links.filter((l) => l.consultant_id === c.id).map((l) => l.praca_id));
      out.set(c.id, paraConjunto(c.praca_id, nomes.filter((n) => ids.includes(n.id))));
    }
    return out;
  }

  /**
   * Consultores que atuam na praça (§44.7): desligada = `{ praca_id }` (o filtro de hoje); ligada = a principal OU uma linha da
   * junção.
   */
  ondeAtua(pracaId: string): Prisma.field_consultantsWhereInput {
    if (!this.ligado) return { praca_id: pracaId };
    return { OR: [{ praca_id: pracaId }, { extra_pracas: { some: { praca_id: pracaId } } }] };
  }

  /**
   * Visitas FEITAS na praça (§44.7, relatórios): `journey.praca_id ?? principal do consultor`. Desligada = `{}` (os relatórios de
   * hoje já filtram os consultores pela principal).
   */
  visitasNaPraca(pracaId: string): Prisma.field_visitsWhereInput {
    if (!this.ligado) return {};
    return { OR: [{ journey: { praca_id: pracaId } }, { journey: { praca_id: null }, consultant: { praca_id: pracaId } }] };
  }
}

function paraConjunto(principal: string, rows: { id: string; name: string }[]): PracaDoConjunto[] {
  return rows
    .map((r) => ({ id: r.id, name: r.name, principal: r.id === principal }))
    .sort((a, b) => (a.principal !== b.principal ? (a.principal ? -1 : 1) : a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id)));
}
