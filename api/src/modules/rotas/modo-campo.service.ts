import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { ehFluxo, resolverFluxo, type ConfigModo, type FluxoVisita } from '../../domain/modo-campo-rules';
import { RotasConfigService } from './rotas-config.service';
import { FLUXO_SELECT_LIGADO } from './rotas.tokens';

/**
 * Modo do chefe (contrato §31): qual fluxo da visita vale para um consultor e com que parâmetros.
 * Mora junto da configuração do campo (folha: o CampoModule importa o RotasModule, nunca o contrário).
 * Quem usa injeta com `@Optional()` — sem ele, vale o comportamento de antes (flag desligada, padrões).
 */
@Injectable()
export class ModoCampoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: RotasConfigService,
    @Optional() @Inject(FLUXO_SELECT_LIGADO) private readonly flag: boolean = false,
  ) {}

  /** A flag `FIELD_VISIT_FLOW_SELECT_ENABLED`. */
  get ligado(): boolean {
    return this.flag === true;
  }

  config(): Promise<ConfigModo> {
    return this.configs.modo();
  }

  /** consultor → global → `simples` (flag ligada); desligada: `completo`. */
  async fluxoDoConsultor(consultantId: string): Promise<FluxoVisita> {
    if (!this.ligado) return 'completo';
    const [cfg, c] = await Promise.all([
      this.configs.modo(),
      this.prisma.field_consultants.findUnique({ where: { id: consultantId }, select: { visit_flow: true } }),
    ]);
    return resolverFluxo({ ligado: true, global: cfg.fluxo_visita, consultor: ehFluxo(c?.visit_flow) ? c?.visit_flow : null });
  }
}
