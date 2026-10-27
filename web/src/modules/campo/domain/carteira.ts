/**
 * Os três cartões de resumo da Carteira do representante (redesenho E5c, UX §4.14), no desenho dos cartões do Financeiro da
 * Lovable: "Hoje", "Esta semana" e "Próximo Pix". Os rótulos da Lovable ("Total a pagar", "Já pago", "Pendente") são de quem paga,
 * não de quem recebe [desvio: texto]. Só lê o que os cartões de baixo já leem (`/v1/campo/earnings` §28.6 e `/v1/campo/payouts`
 * §29.6); cada número vem com a linha de apoio que diz de onde saiu (regra do dono, 08/10).
 */
import type { PagamentosCampo } from '@/modules/pagamentos/domain/pagamentos';
import { brl, rotuloDia, rotuloSemana, type GanhosCampo } from '@/modules/remuneracao/domain/remuneracao';
import { plural } from './formatos';

export interface CartaoCarteira {
  rotulo: 'Hoje' | 'Esta semana' | 'Próximo Pix';
  valor: string;
  apoio: string;
}

/**
 * O próximo Pix: o primeiro (pela data) que ainda vai sair — a pagar ou que falhou e será tentado de novo — com o valor e o texto
 * do servidor; sem nenhum gerado, a data prevista dos ganhos (`pix`) com o total da semana a que ele se refere, quando conhecido.
 */
function proximoPix(g: GanhosCampo | undefined, p: PagamentosCampo | undefined, hoje: string): CartaoCarteira | null {
  const abertos = (p?.payouts ?? []).filter((x) => (x.status === 'pending' || x.status === 'failed') && x.pix_date >= hoje).sort((a, b) => a.pix_date.localeCompare(b.pix_date));
  const x = abertos[0];
  if (x) return { rotulo: 'Próximo Pix', valor: brl(x.due_cents), apoio: `${x.pix_label} · semana ${rotuloSemana(x.week.from, x.week.to)} · ${x.text}` };
  if (!g) return null;
  const semana = g.week.to === g.pix.week_to ? g.week : g.previous_weeks.find((w) => w.to === g.pix.week_to);
  return { rotulo: 'Próximo Pix', valor: semana ? brl(semana.total_cents) : rotuloDia(g.pix.date), apoio: g.pix.text };
}

export function cartoesCarteira(g: GanhosCampo | undefined, p: PagamentosCampo | undefined, hoje: string): CartaoCarteira[] {
  const cartoes: CartaoCarteira[] = [];
  if (g) {
    const tipo = g.signup_source === 'declared' ? ['cadastro declarado', 'cadastros declarados'] : ['cadastro confirmado pelo Freela', 'cadastros confirmados pelo Freela'];
    cartoes.push({ rotulo: 'Hoje', valor: brl(g.today.total_cents), apoio: `${rotuloDia(g.today.day)}: ${plural(g.today.confirmed_signups, tipo[0]!, tipo[1]!)}` });
    cartoes.push({ rotulo: 'Esta semana', valor: brl(g.week.total_cents), apoio: `${rotuloSemana(g.week.from, g.week.to)}, até agora` });
  }
  const pix = proximoPix(g, p, hoje);
  if (pix) cartoes.push(pix);
  return cartoes;
}
