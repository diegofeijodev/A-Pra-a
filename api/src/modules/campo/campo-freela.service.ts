/**
 * Código de indicação do consultor no Freela — spec §7 ("Código no Freela").
 *
 * O Praça cria o consultor no api-freela (`POST /v1/admins/consultants`) e
 * guarda id + código; o QR leva ao cadastro com `?consultor=CÓDIGO`. Tudo aqui
 * é "melhor esforço que se repete": falha vira `freela_sync_error`, a tela
 * mostra, e o relógio de 2 min do Freela (`FreelaSyncScheduler`) tenta de novo.
 */
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { toE164BR } from '../../common/phone/phone';
import { FreelaClient, FreelaHttpError } from '../freela/freela-client';

export const FREELA_NOTES = 'Consultor de campo — Praça';

/** Erro fixo: o relógio NÃO repete (exige o admin trocar o e-mail). */
export const EMAIL_DUPLICADO_NO_FREELA =
  'O e-mail deste consultor já é usado por outro consultor no Freela — troque o e-mail aqui e tente de novo.';

/** Recorte do `ConsultantView` do api-freela que o Praça usa. */
interface FreelaConsultor {
  id: string;
  code: string;
  email: string | null;
  notes: string | null;
}

class EmailDuplicado extends Error {}

interface LinhaSync {
  name: string;
  email: string;
  phone: string;
  praca: { cobertura_cidade: string | null; cobertura_uf: string | null };
}

@Injectable()
export class CampoFreelaService {
  private readonly log = new Logger(CampoFreelaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FreelaClient,
  ) {}

  /** Põe o Freela em dia com o consultor. NUNCA lança: o erro vira `freela_sync_error`. */
  async sync(id: string): Promise<void> {
    const c = await this.prisma.field_consultants.findUnique({
      where: { id },
      include: { praca: { select: { cobertura_cidade: true, cobertura_uf: true } } },
    });
    if (!c) return;
    try {
      if (!c.freela_consultant_id) {
        if (!c.active) return;
        const criado = await this.criarOuAdotar(c);
        await this.prisma.field_consultants.update({
          where: { id },
          data: {
            freela_consultant_id: criado.id,
            freela_code: criado.code,
            freela_sync_error: null,
            freela_synced_at: new Date(),
          },
        });
        return;
      }
      await this.client.request('PATCH', `/v1/admins/consultants/${encodeURIComponent(c.freela_consultant_id)}`, {
        isActive: c.active,
      });
      await this.prisma.field_consultants.update({
        where: { id },
        data: { freela_sync_error: null, freela_synced_at: new Date() },
      });
    } catch (e) {
      const msg = this.mensagem(e);
      this.log.warn(`código do Freela de ${c.email}: ${msg}`);
      await this.prisma.field_consultants.update({ where: { id }, data: { freela_sync_error: msg } });
    }
  }

  /** Antes de apagar o consultor: desliga o código lá (melhor esforço, sem repetir). */
  async desativarAntesDeApagar(c: { freela_consultant_id: string | null; active: boolean }): Promise<void> {
    if (!c.freela_consultant_id || !c.active || !this.client.isConfigured()) return;
    try {
      await this.client.request('PATCH', `/v1/admins/consultants/${encodeURIComponent(c.freela_consultant_id)}`, {
        isActive: false,
      });
    } catch (e) {
      this.log.warn(`não deu para desativar o código no Freela antes de apagar: ${this.mensagem(e)}`);
    }
  }

  /** Relógio de 2 min: criação pendente e ativar/desativar que falhou — menos o e-mail duplicado. */
  async retryPending(): Promise<number> {
    const pendentes = await this.prisma.field_consultants.findMany({
      where: {
        AND: [
          {
            OR: [
              { freela_consultant_id: null, active: true },
              { freela_consultant_id: { not: null }, freela_sync_error: { not: null } },
            ],
          },
          // `not` do Prisma descarta NULL: o OR explícito mantém quem não tem erro.
          { OR: [{ freela_sync_error: null }, { freela_sync_error: { not: EMAIL_DUPLICADO_NO_FREELA } }] },
        ],
      },
      select: { id: true },
      orderBy: { created_at: 'asc' },
      take: 20,
    });
    for (const p of pendentes) await this.sync(p.id);
    return pendentes.length;
  }

  private async criarOuAdotar(c: LinhaSync): Promise<{ id: string; code: string }> {
    try {
      const r = await this.client.request<FreelaConsultor>('POST', '/v1/admins/consultants', this.corpo(c));
      return { id: r.data.id, code: r.data.code };
    } catch (e) {
      if (!(e instanceof FreelaHttpError) || e.freelaStatus !== 409) throw e;
      // 409 = e-mail já usado lá. Consultor NOSSO (mesmo e-mail + a nota do
      // Praça) = o Freela criou e a resposta se perdeu (timeout): adota.
      const lista = await this.client.request<FreelaConsultor[]>('GET', '/v1/admins/consultants');
      const nosso = (lista.data ?? []).find((x) => x.email?.toLowerCase() === c.email && x.notes === FREELA_NOTES);
      if (nosso) return { id: nosso.id, code: nosso.code };
      throw new EmailDuplicado();
    }
  }

  /** O DTO do Freela valida `uf` como UF de verdade e `phone` com até 20 caracteres: só manda o que é válido. */
  private corpo(c: LinhaSync) {
    const phone = toE164BR(c.phone);
    return {
      name: c.name,
      email: c.email,
      notes: FREELA_NOTES,
      ...(phone ? { phone } : {}),
      ...(c.praca.cobertura_cidade ? { city: c.praca.cobertura_cidade } : {}),
      ...(c.praca.cobertura_uf ? { uf: c.praca.cobertura_uf } : {}),
    };
  }

  private mensagem(e: unknown): string {
    if (e instanceof EmailDuplicado) return EMAIL_DUPLICADO_NO_FREELA;
    if (e instanceof HttpException) {
      const r = e.getResponse() as { message?: unknown };
      if (typeof r?.message === 'string' && r.message) return r.message;
    }
    return 'Erro inesperado ao falar com o Freela.';
  }
}
