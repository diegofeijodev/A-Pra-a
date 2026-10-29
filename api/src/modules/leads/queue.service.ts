import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { isUuid } from '../../common/ids/uuid';
import { todaySp } from '../../common/time/dates';
import { CLASSE_ORDER } from '../../domain/catalog';
import { QueueQueryDto } from './dto/leads.dto';
import { LeadListView, LeadsService, PARA_LISTA } from './leads.service';

/** Fila do dia por pessoa enquanto ninguém salvou o número em `app_settings`. */
export const QUOTA_PADRAO = 20;

export interface QueueItemView extends LeadListView {
  /** Lead perdido que voltou pela data de reaquecimento (não é lead novo). */
  is_reheat: boolean;
}

export interface QueueView {
  total: number;
  grandes: number;
  quota: number;
  items: QueueItemView[];
}

const ordemClasse = (classe: string): number => CLASSE_ORDER[classe] ?? 99;

/**
 * "Para tocar hoje" — `routes/entrada.tsx:439-457`. Lead novo (etapa 1) e
 * perdido com reaquecimento vencido, sem arquivado e sem quem está de soneca.
 * Casa grande primeiro, depois alvo, depois o resto; dentro da classe, os
 * mais antigos na frente. Com `praca_id` (opcional), só a fila dessa praça e
 * sem os leads de teste, como o "Primeiro contato" de Tarefas; sem ele, a
 * fila de todas as praças, igual à de antes.
 */
@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
  ) {}

  async queue(query: QueueQueryDto): Promise<QueueView> {
    const person = query.person ?? 'all';
    if (person !== 'all' && !isUuid(person)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'person: use "all" ou o id de uma pessoa.',
      });
    }

    if (query.praca_id !== undefined) {
      if (!isUuid(query.praca_id)) throw this.pracaNaoEncontrada();
      const praca = await this.prisma.pracas.findUnique({ where: { id: query.praca_id }, select: { id: true } });
      if (!praca) throw this.pracaNaoEncontrada();
    }

    const hoje = todaySp();
    const [config, rows] = await Promise.all([
      // A linha de configuração pode ainda não existir (o time nunca abriu os
      // ajustes): a fila continua funcionando com o padrão.
      this.prisma.app_settings.findUnique({ where: { id: 1 } }),
      this.prisma.leads.findMany({
        where: {
          archived: false,
          // `reheat_at`/`snooze_until` são "YYYY-MM-DD" em texto: comparação
          // lexicográfica é cronológica, e NULL nunca satisfaz `lte`.
          OR: [{ stage: 1 }, { stage: 8, reheat_at: { lte: hoje } }],
          AND: [{ OR: [{ snooze_until: null }, { snooze_until: { lte: hoje } }] }],
          ...(person !== 'all' ? { owner_id: person } : {}),
          // Ausente = nenhuma chave a mais: a fila de todas as praças segue igual à de antes.
          ...(query.praca_id !== undefined ? { praca_id: query.praca_id, is_test: false } : {}),
        },
        include: PARA_LISTA,
      }),
    ]);

    const quota = config?.daily_quota ?? QUOTA_PADRAO;
    const fila = rows
      .map((r) => ({
        ...this.leads.toListView(r, r.events, r._count.events, r._count.vagas, hoje),
        is_reheat: r.stage === 8,
      }))
      .sort(
        (a, b) =>
          ordemClasse(a.classe) - ordemClasse(b.classe) ||
          a.entered_at.localeCompare(b.entered_at),
      );

    return {
      // `total` é a fila inteira: a tela avisa quantos ficaram de fora da cota.
      total: fila.length,
      grandes: fila.filter((l) => l.classe === 'grande').length,
      quota,
      items: fila.slice(0, quota),
    };
  }

  private pracaNaoEncontrada(): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Praça não encontrada.' });
  }
}
