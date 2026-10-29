import { diffDays } from '@/lib/dates';

/**
 * Regras PURAS da Entrada (UX §3.6, decisão U1 do desenho §12.2): o que o link do WhatsApp faz, o que cada "Feito" da fila grava, o
 * motivo de cada linha e os textos do "Desfazer importação". Os textos são os da UX, ao pé da letra.
 */

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * O que o clique no link do WhatsApp dispara. Só abre a conversa (achado 3): abrir não é ter mandado. Quem grava "Mensagem enviada"
 * é o "Feito ▾ → Mandei mensagem".
 */
export const acaoDoLinkWhatsApp = (): 'abrir' => 'abrir';

export type ContatoDaFila = 'call' | 'msg_out' | 'visit';

/** O evento que cada "Feito" da fila grava (`POST /v1/leads/:id/events`); `msg_out` é o texto que o link gravava antes. */
export function eventoDoFeito(kind: ContatoDaFila): { kind: ContatoDaFila; text: string; confirmacao: string } {
  switch (kind) {
    case 'call':
      return { kind, text: 'Ligação registrada pela fila do dia.', confirmacao: 'Ligação registrada' };
    case 'msg_out':
      return { kind, text: 'Mensagem enviada pela fila do dia.', confirmacao: 'Mensagem registrada' };
    case 'visit':
      return { kind, text: 'Visita registrada pela fila do dia.', confirmacao: 'Visita registrada' };
  }
}

/** O motivo da linha (UX §3.6): "Lead novo há 3 dias · Casa grande" ou a volta do reaquecer, com o motivo da perda. */
export function motivoDaFila(
  lead: { is_reheat: boolean; entered_at: string; lost_reason: string | null },
  classe: string,
  hoje: string,
): string {
  if (lead.is_reheat) {
    const base = 'Volta do “Perdido / reaquecer”';
    return lead.lost_reason?.trim() ? `${base} · motivo: ${lead.lost_reason.trim()}` : base;
  }
  const dias = Math.max(0, diffDays(hoje, lead.entered_at.slice(0, 10)));
  return `Lead novo ${dias === 0 ? 'hoje' : `há ${dias} ${plural(dias, 'dia', 'dias')}`} · ${classe}`;
}

/** A conta do número da fila, sempre visível (regra do dono 08/10): o que é, de onde vem e como ordena. */
export function contaDaFila(p: { total: number; grandes: number; mostrando: number }): string {
  return (
    `${p.total} na fila (${p.grandes} ${plural(p.grandes, 'casa grande', 'casas grandes')}); mostrando ${p.mostrando}, o limite por pessoa. ` +
    'Fonte: leads em “Lead novo” e os de reaquecer com data vencida, nesta praça. ' +
    'Ordem: casa grande, depois alvo, depois o resto; os mais antigos na frente.'
  );
}

/**
 * O diálogo do "Desfazer importação" (achado 20). `entraram` é o tamanho do lote: quantos já tiveram contato só o servidor sabe, por
 * isso o texto diz "até".
 */
export function textosDesfazerImportacao(arquivo: string, entraram: number) {
  return {
    titulo: `Desfazer a importação de “${arquivo}”?`,
    descricao:
      `Saem até ${entraram} ${plural(entraram, 'lead', 'leads')} deste lote que ainda não tiveram contato. ` +
      'Os que já tiveram contato ficam no funil. Para trazer de volta, só importando de novo.',
    botao: 'Desfazer importação',
  };
}

/** Depois do desfazer: o que saiu e o que ficou. */
export function textoImportacaoDesfeita(removidos: number, mantidos: number): string {
  const saiu = `${removidos} ${plural(removidos, 'lead saiu', 'leads saíram')}`;
  const ficou = mantidos > 0 ? `, ${mantidos} ${plural(mantidos, 'ficou por já ter contato', 'ficaram por já terem contato')}` : '';
  return `Importação desfeita: ${saiu}${ficou}.`;
}
