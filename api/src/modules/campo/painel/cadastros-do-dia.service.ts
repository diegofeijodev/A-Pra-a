/**
 * `cadastrosDoDia` (contrato §33.3): a MESMA contagem para o painel e para o resumo do dia. A fonte de cada dia segue a
 * `signup_source` da versão da regra de remuneração vigente naquele dia; as contagens brutas vêm dos insumos do cálculo
 * da remuneração (F8), que já leem confirmados (F7) e declarações (S3). Só leitura.
 */
import { Inject, Injectable } from '@nestjs/common';
import { eachDay } from '../../../common/time/dates';
import { contarCadastros, fonteDoDia, fonteDoPeriodo, type FonteCadastroDia, type FontePeriodo } from '../../../domain/cadastros-dia-rules';
import { RotasConfigService } from '../../rotas/rotas-config.service';
import { EARNINGS_INPUTS, type EarningsInputs } from '../earnings/earnings-inputs';
import { EARNINGS_REPOSITORY, type EarningsRepository } from '../earnings/earnings.repository';

export interface CadastrosDoPeriodo {
  /** consultor → dia → quantidade (só dias com algo). */
  porConsultorDia: Map<string, Map<string, number>>;
  /** consultor → total do período. */
  totais: Map<string, number>;
  fontePorDia: Map<string, FonteCadastroDia>;
  fonte: FontePeriodo;
}

@Injectable()
export class CadastrosDoDiaService {
  constructor(
    @Inject(EARNINGS_REPOSITORY) private readonly repo: EarningsRepository,
    @Inject(EARNINGS_INPUTS) private readonly inputs: EarningsInputs,
    private readonly config: RotasConfigService,
  ) {}

  async periodo(ids: string[], from: string, to: string): Promise<CadastrosDoPeriodo> {
    const [versoes, cad] = await Promise.all([this.repo.versoes(), this.config.cadastro()]);
    const dias = eachDay(from, to);
    const fontePorDia = new Map(dias.map((d) => [d, fonteDoDia(versoes, d)]));
    const precisaDeclaradas = [...fontePorDia.values()].includes('declared');
    const bruto = ids.length
      ? await this.inputs.dias(ids, from, to, cad.confirmation_rule, { declared: precisaDeclaradas, routes: false })
      : new Map();
    const porConsultorDia = new Map<string, Map<string, number>>();
    const totais = new Map<string, number>();
    for (const id of ids) {
      const m = new Map<string, number>();
      let total = 0;
      for (const [dia, b] of bruto.get(id) ?? new Map()) {
        const fonte = fontePorDia.get(dia);
        if (!fonte) continue;
        const n = contarCadastros(b, fonte);
        if (n > 0) m.set(dia, n);
        total += n;
      }
      porConsultorDia.set(id, m);
      totais.set(id, total);
    }
    return { porConsultorDia, totais, fontePorDia, fonte: fonteDoPeriodo(fontePorDia.values()) };
  }
}
