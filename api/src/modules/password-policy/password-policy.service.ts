import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { LOVABLE_E_FLAGS, type FlagsLovableE } from '../../common/flags/lovable-e.flags';
import {
  LIMITES_POLITICA,
  aplicarPolitica,
  lerPolitica,
  mensagemSenhaFraca,
  regrasDaPolitica,
  validarSenhaNova,
  type PoliticaSenha,
} from '../../domain/senha-rules';

export type PoliticaView =
  | { enabled: false }
  | (PoliticaSenha & { enabled: true; max_length: number; is_default: boolean; rules: ReturnType<typeof regrasDaPolitica> });

const desligada = () =>
  new NotFoundException({ code: 'PASSWORD_POLICY_DISABLED', message: 'A regra de senha não está ligada neste servidor.' });

/**
 * Regra de senha NOVA (lote E, contrato §41.2). Desligada (`PASSWORD_POLICY_ENABLED`): `exigir` não faz nada (as senhas valem
 * como hoje, só com os limites dos DTOs) e a leitura diz `enabled: false` (200: o web nunca sonda rota desligada).
 */
@Injectable()
export class PasswordPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(LOVABLE_E_FLAGS) private readonly flags?: FlagsLovableE,
  ) {}

  get ligada(): boolean {
    return this.flags?.password_policy === true;
  }

  private async lida(): Promise<PoliticaSenha & { is_default: boolean }> {
    const s = await this.prisma.app_settings.findUnique({ where: { id: 1 }, select: { password_policy: true } });
    return lerPolitica(s?.password_policy ?? null);
  }

  async view(): Promise<PoliticaView> {
    if (!this.ligada) return { enabled: false };
    const p = await this.lida();
    return {
      enabled: true,
      min_length: p.min_length,
      max_length: LIMITES_POLITICA.max_length,
      require_upper: p.require_upper,
      require_digit: p.require_digit,
      is_default: p.is_default,
      rules: regrasDaPolitica(p),
    };
  }

  async salvar(parcial: { min_length?: unknown; require_upper?: unknown; require_digit?: unknown }): Promise<PoliticaView> {
    if (!this.ligada) throw desligada();
    const atual = await this.lida();
    const r = aplicarPolitica(atual, parcial);
    if (!r.ok) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: r.erro });
    const valor = r.politica as unknown as Prisma.InputJsonValue;
    await this.prisma.app_settings.upsert({ where: { id: 1 }, update: { password_policy: valor }, create: { id: 1, password_policy: valor } });
    return this.view();
  }

  /** Só senha NOVA (troca do consultor, senha definida para a equipe). A senha nunca entra no erro nem no log. */
  async exigir(senha: string): Promise<void> {
    if (!this.ligada) return;
    const p = await this.lida();
    const falhas = validarSenhaNova(senha, p);
    if (falhas.length > 0) throw new BadRequestException({ code: 'WEAK_PASSWORD', message: mensagemSenhaFraca(falhas, p) });
  }
}
