import { plural } from './formatos';

export type RegraConfirmacao = 'activated' | 'first_vacancy' | 'first_job_completed';

/** Contagem do servidor (contrato §27.8): cadastros que o FREELA confirmou, nunca o "cadastrou agora" declarado. */
export interface CadastrosConfirmados {
  today: number;
  week: number;
  rule: RegraConfirmacao;
  source: string;
}

const ROTULO: Record<RegraConfirmacao, string> = {
  activated: 'o dono definiu a senha (primeiro acesso)',
  first_vacancy: 'a empresa abriu a primeira vaga',
  first_job_completed: 'o primeiro serviço foi concluído',
};

export function textoCadastrosConfirmados(c: CadastrosConfirmados): { titulo: string; conta: string } {
  return {
    titulo: `${plural(c.today, 'confirmado', 'confirmados')} hoje · ${c.week} na semana`,
    conta: `Conta: cadastros em que ${ROTULO[c.rule]}, contados no dia (e de segunda a domingo na semana). Fonte: Freela, sincronizado.`,
  };
}
