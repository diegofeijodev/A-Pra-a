import { addDays, daySp, diffDays } from '@/lib/dates';
import { diaCurto } from '@/modules/planos/domain/planos';
import type { ContatoFeito, ItemTarefaView, ResumoCrmView, TipoTarefa } from '../infrastructure/crm.api';

/**
 * Tela Tarefas do CRM automático (UX §3.1, contrato §47.3): regras PURAS — os textos de cada grupo e de cada linha (os da UX, ao pé da
 * letra), o link do WhatsApp, a fila adiada do "Desfazer" (A14: o web espera 5 s antes de mandar; sem rota de desfazer) e as linhas do
 * resumo do dia com a conta de cada número (regra do dono, 08/10). Dia sempre o de Brasília (`todaySp`/`daySp`), nunca o UTC.
 */

// ── grupos ──────────────────────────────────────────────────

/**
 * Título e explicação de cada grupo (UX §3.1.4). `cadence_send` não está na UX: é o grupo só de leitura do desenho §12.1 item 1 (no
 * modo "Fila manual" a cadência grava a mensagem já como enviada; quem manda de verdade é a pessoa, pelo WhatsApp).
 */
export const TEXTOS_GRUPO: Record<TipoTarefa, { titulo: string; explicacao: string }> = {
  send: {
    titulo: 'Mandar mensagem',
    explicacao: 'Mensagens das cadências e dos disparos marcadas para hoje. Você manda pelo WhatsApp e marca como feito.',
  },
  cadence_send: {
    titulo: 'Mensagens das cadências de hoje',
    explicacao: 'As cadências já marcaram estas mensagens como enviadas hoje. Se ainda não mandou, abra o WhatsApp e mande; aqui não há nada para marcar.',
  },
  hot_visit: {
    titulo: 'Lead quente da visita',
    explicacao: 'Gostaram na visita do representante e ninguém da equipe procurou depois.',
  },
  next_step: {
    titulo: 'Próximo passo vencido',
    explicacao: 'Combinados com data de hoje ou de antes, inclusive as ligações das cadências.',
  },
  stalled: {
    titulo: 'Conversa parada',
    explicacao: 'Conversa aberta ou reunião marcada, sem contato há 5 dias ou mais.',
  },
  first_vacancy: {
    titulo: 'Ajudar a publicar a 1ª vaga',
    explicacao: 'Cadastrados no Freela há 3 dias ou mais, sem vaga vista lá.',
  },
};

/** Aviso no topo da T5 sem a conexão com o Freela (UX §3.1.4, achado 5): o Praça não vê as vagas, então pode haver vaga já publicada. */
export const AVISO_T5_SEM_FREELA = 'O Freela não está conectado, então o Praça não vê as vagas. Confira no Freela antes de ligar.';

/** Linhas visíveis por grupo antes do "Ver mais" (UX §3.1.2 item 4). */
export const ITENS_VISIVEIS = 10;

/** Chave estável de uma linha (o envio, na T1 e na cadência; o lead nas outras): a fila adiada e o estado da tela usam esta. */
export const chaveDaTarefa = (task: TipoTarefa, item: Pick<ItemTarefaView, 'lead_id' | 'send_id'>): string =>
  `${task}:${item.send_id ?? item.lead_id}`;

// ── motivo da linha ─────────────────────────────────────────

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const haDias = (n: number) => (n <= 0 ? 'hoje' : `há ${n} ${plural(n, 'dia', 'dias')}`);
/** "seg 26/10, há 2 dias" (dia só-dia, sem fuso). */
const diaEHa = (dia: string, hoje: string) => `${diaCurto(dia)}, ${haDias(diffDays(hoje, dia))}`;
/** O motor de cadências grava este texto quando o passo não tem tarefa escrita (`cadence-engine.service.ts`). */
const PASSO_GENERICO_CADENCIA = 'Ligação da cadência';

/** O motivo de cada linha, numa frase (UX §3.1.4). `hoje` = `todaySp()`. */
export function motivoDaTarefa(task: TipoTarefa, item: ItemTarefaView, hoje: string): string {
  switch (task) {
    case 'send': {
      const origem = item.origin_label || 'Disparo';
      const dia = item.scheduled_at ? daySp(item.scheduled_at) : hoje;
      return `${origem} · ${dia >= hoje ? 'para hoje' : `atrasada desde ${diaCurto(dia)}`}`;
    }
    case 'cadence_send':
      return `${item.origin_label || 'Cadência'} · marcada como enviada hoje`;
    case 'hot_visit': {
      const v = item.visit;
      if (!v) return 'Gostou na visita · ninguém procurou depois';
      return `Visitado por ${v.consultant_name} em ${diaCurto(v.day)} · interesse ${v.interest === 'alto' ? 'alto' : 'médio'} · ninguém procurou depois`;
    }
    case 'next_step': {
      const p = item.next_step;
      if (!p) return 'Próximo passo vencido';
      const quando = p.date >= hoje ? 'hoje' : diaEHa(p.date, hoje);
      const what = p.what?.trim();
      if (p.from_cadence) {
        return what && what !== PASSO_GENERICO_CADENCIA
          ? `${PASSO_GENERICO_CADENCIA} “${what}” · era para ${quando}`
          : `${PASSO_GENERICO_CADENCIA} · era para ${quando}`;
      }
      return what ? `“${what}” era para ${quando}` : `Próximo passo era para ${quando}`;
    }
    case 'stalled': {
      const etapa = item.stage === 4 ? 'Reunião ou visita marcada' : 'Conversa aberta';
      // Sem contato de verdade a API manda só `stage_since` (a tela diz "na etapa desde").
      if (item.last_contact_day) return `${etapa} · último contato ${diaEHa(item.last_contact_day, hoje)}`;
      if (item.stage_since) return `${etapa} · nenhum contato registrado, na etapa desde ${diaEHa(item.stage_since.slice(0, 10), hoje)}`;
      return etapa;
    }
    case 'first_vacancy': {
      const desde = item.stage_since ? `Cadastrado desde ${diaEHa(item.stage_since.slice(0, 10), hoje)}` : 'Cadastrado';
      return `${desde} · nenhuma vaga vista no Freela`;
    }
  }
}

// ── contato ─────────────────────────────────────────────────

const soDigitos = (s: string) => s.replace(/\D/g, '');
/** DDI 55 só quando falta: 10 ou 11 dígitos é número brasileiro sem o código do país (a mesma regra de `consultores/domain/atencao`). */
const comDdi = (d: string) => (d.startsWith('55') && d.length >= 12 ? d : `55${d}`);

/**
 * `https://wa.me/55<dígitos>?text=<codificado>` (sem dobrar o 55). Só abre a conversa: nada é gravado (achado 3, decisão U1) — quem grava
 * é o "Feito". Sem número plausível (10+ dígitos), sem link.
 */
export function linkWhatsApp(phone: string | null | undefined, texto?: string): string | null {
  const d = soDigitos(phone ?? '');
  if (d.length < 10) return null;
  const base = `https://wa.me/${comDdi(d)}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

/** `tel:` só com número plausível; quem liga é a própria pessoa. */
export function linkLigar(phone: string | null | undefined): string | null {
  const d = soDigitos(phone ?? '');
  return d.length >= 10 ? `tel:+${comDdi(d)}` : null;
}

// ── contagem da lista ───────────────────────────────────────

/** Nome de cada grupo na conta da lista ("4 mensagens + 2 leads quentes…"); a cadência é só leitura e não entra. */
const NA_CONTA: Partial<Record<TipoTarefa, [string, string]>> = {
  send: ['mensagem', 'mensagens'],
  hot_visit: ['lead quente', 'leads quentes'],
  next_step: ['próximo passo', 'próximos passos'],
  stalled: ['conversa parada', 'conversas paradas'],
  first_vacancy: ['cadastrado sem vaga', 'cadastrados sem vaga'],
};

/** Total e "4 mensagens + 3 próximos passos": o que entra na conta (a cadência é só leitura e fica de fora). */
export function somaDasTarefas(grupos: { task: TipoTarefa; total: number }[]): { total: number; partes: string; grupos: number } {
  const partes = grupos.filter((g) => NA_CONTA[g.task] && g.total > 0);
  return {
    total: partes.reduce((a, g) => a + g.total, 0),
    partes: partes.map((g) => `${g.total} ${plural(g.total, ...NA_CONTA[g.task]!)}`).join(' + '),
    grupos: partes.length,
  };
}

/** Total e conta da lista (UX §3.1.2 item 3). É o mesmo número do `counts` da API: `cadence_send` fica de fora nos dois. */
export function contaDasTarefas(grupos: { task: TipoTarefa; total: number }[]): { total: number; texto: string } {
  const { total, partes, grupos: n } = somaDasTarefas(grupos);
  if (n === 0) return { total, texto: '' };
  return { total, texto: `${partes}${n > 1 ? ` = ${total}` : ''}. Cada lead aparece uma vez, na tarefa mais urgente.` };
}

export const tituloDaContagem = (n: number) => `${n} ${plural(n, 'tarefa', 'tarefas')} para hoje`;

export const textoPrimeiroContato = (n: number) =>
  `${n} ${plural(n, 'lead novo', 'leads novos')} esperando o 1º contato nesta praça.`;

export const textoNadaSeu = (deOutros: number) =>
  `Nada seu agora. Há ${deOutros} ${plural(deOutros, 'tarefa de outra pessoa', 'tarefas de outras pessoas')}.`;

export const rotuloAbrirEntrada = (n: number) => `Abrir a Entrada (${n} ${plural(n, 'lead novo', 'leads novos')})`;

// ── de quem ─────────────────────────────────────────────────

/**
 * O `hojePerson` da `/hoje` e da Entrada guarda `'all'` ou o id de uma pessoa. Tarefas só sabe "Minhas" (o id de quem está logado) e
 * "Todas": o id de OUTRA pessoa aparece como "Todas", sem regravar (UX §3.1.2 item 2).
 */
export function pessoaDaConsulta(hojePerson: string, userId: string | undefined): 'me' | 'all' {
  return userId && hojePerson === userId ? 'me' : 'all';
}

/** Apoio da linha (UX §3.1.3 item 3, sem a cidade, que a API não manda): "de Rebeca" · "Sem dono" · sem telefone. */
export function apoioDaLinha(a: {
  ownerId: string | null;
  nomeDoDono: string | null | undefined;
  person: 'me' | 'all';
  telefone: string | null;
}): string | null {
  const partes: string[] = [];
  if (!a.ownerId) partes.push('Sem dono');
  else if (a.person === 'all' && a.nomeDoDono) partes.push(`de ${a.nomeDoDono}`);
  if (!linkWhatsApp(a.telefone)) partes.push('Sem telefone no cadastro: abra o lead para ver outro contato.');
  return partes.length ? partes.join(' · ') : null;
}

// ── Feito, Adiar e Desfazer ─────────────────────────────────

/**
 * Menu "O que você fez?" da T2–T5 (UX §3.1.5). Sem "Só anotar…": o `POST /v1/crm/tasks/done` só aceita contato de verdade
 * (`call | msg_out | msg_in | visit`, desenho §12.1 item 13) — uma nota não é contato e não tiraria o lead da regra.
 */
export const OPCOES_FEITO: readonly { kind: Extract<ContatoFeito, 'call' | 'msg_out' | 'visit'>; rotulo: string; confirmacao: string }[] = [
  { kind: 'call', rotulo: 'Liguei', confirmacao: 'Ligação registrada' },
  { kind: 'msg_out', rotulo: 'Mandei mensagem', confirmacao: 'Mensagem registrada' },
  { kind: 'visit', rotulo: 'Visitei', confirmacao: 'Visita registrada' },
];

/** A confirmação da T1 ("Feito" de 1 toque = `POST /v1/sends/:id/mark`). */
export const CONFIRMACAO_ENVIADA = 'Marcada como enviada';

/**
 * Qual linha está com o menu "Feito ▾"/"Adiar ▾" aberto (a releitura espera enquanto houver uma, UX §3.1.5). Fechar só solta a mesma
 * linha: o aviso de fechamento de um menu pode chegar depois de abrir o de outra.
 */
export const menuDepois = (atual: string | null, chave: string, aberto: boolean): string | null =>
  aberto ? chave : atual === chave ? null : atual;

/** Depois de uma releitura: a linha que sumiu leva o menu junto (o Radix desmonta o menu sem avisar que fechou). */
export const menuQueFica = (atual: string | null, presentes: ReadonlySet<string>): string | null =>
  atual !== null && !presentes.has(atual) ? null : atual;

/** "Adiar até" (UX §3.1.5): amanhã, 3 dias e 1 semana, pelo dia de Brasília. */
export function opcoesAdiar(hoje: string): { dias: number; ate: string; rotulo: string }[] {
  return [
    [1, 'Amanhã'],
    [3, 'Em 3 dias'],
    [7, 'Em 1 semana'],
  ].map(([dias, nome]) => {
    const ate = addDays(hoje, dias as number);
    return { dias: dias as number, ate, rotulo: `${nome} · ${diaCurto(ate)}` };
  });
}

export const textoAdiado = (ate: string) => `Adiado para ${diaCurto(ate)}`;

/** A 2ª linha da confirmação da T3: o "Feito" sem passo novo limpa o próximo passo (contrato §47.3). */
export const notaDoPassoLimpo = (what: string | null | undefined) =>
  what?.trim() ? `O próximo passo “${what.trim()}” foi limpo.` : 'O próximo passo foi limpo.';

/** O que a região `aria-live` diz depois de um "Feito" (UX §3.1.8): "Ligação registrada para Bar do Zé. Faltam 8 tarefas." */
export function anuncioDaAcao(confirmacao: string, nome: string, faltam: number): string {
  const resto = faltam <= 0 ? 'Não falta nenhuma tarefa.' : faltam === 1 ? 'Falta 1 tarefa.' : `Faltam ${faltam} tarefas.`;
  return `${confirmacao} para ${nome}. ${resto}`;
}

/** Quanto o "Desfazer" espera antes de mandar (desenho A14). */
export const ESPERA_DESFAZER_MS = 5000;

/** Fila de envios adiados: cada linha espera `esperaMs` e só então manda. `urgente` = a aba está fechando (o envio vai com `keepalive`). */
export interface FilaAdiada {
  agendar(chave: string, enviar: (urgente: boolean) => void): void;
  /** Cancela antes de sair; `false` se já saiu (ou nunca entrou). */
  desfazer(chave: string): boolean;
  /** Manda já (saiu da tela, abriu o lead); `false` se não havia nada. */
  enviarAgora(chave: string): boolean;
  /** Manda todas já (desmontagem da tela, `pagehide`). */
  enviarTodas(urgente: boolean): void;
  pendente(chave: string): boolean;
  readonly tamanho: number;
}

/** Pura (só `setTimeout`/`clearTimeout`, que o vitest finge): a tela guarda uma por página. */
export function criarFilaAdiada(esperaMs = ESPERA_DESFAZER_MS): FilaAdiada {
  const fila = new Map<string, { timer: ReturnType<typeof setTimeout>; enviar: (urgente: boolean) => void }>();
  const tirar = (chave: string) => {
    const x = fila.get(chave);
    if (!x) return undefined;
    clearTimeout(x.timer);
    fila.delete(chave);
    return x;
  };
  const disparar = (chave: string, urgente: boolean): boolean => {
    const x = tirar(chave);
    if (!x) return false;
    x.enviar(urgente);
    return true;
  };
  return {
    agendar(chave, enviar) {
      tirar(chave);
      fila.set(chave, { enviar, timer: setTimeout(() => disparar(chave, false), esperaMs) });
    },
    desfazer: (chave) => tirar(chave) !== undefined,
    enviarAgora: (chave) => disparar(chave, false),
    enviarTodas(urgente) {
      for (const chave of [...fila.keys()]) disparar(chave, urgente);
    },
    pendente: (chave) => fila.has(chave),
    get tamanho() {
      return fila.size;
    },
  };
}

type Ouvinte = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Manda tudo o que espera o Desfazer, com `keepalive`, quando a página pode morrer: `pagehide` (fechou a aba) e a aba escondida
 * (`visibilitychange` → `hidden`). No celular, trocar para o WhatsApp quase nunca dispara `pagehide`, e o sistema pode matar a aba
 * escondida. Não manda duas vezes: a fila tira a linha antes de mandar. `janela`/`documento` entram por parâmetro (o teste usa
 * `EventTarget`); devolve o "desligar".
 */
export function enviarAoSairDaAba(
  fila: Pick<FilaAdiada, 'enviarTodas'>,
  janela: Ouvinte,
  documento: Ouvinte & { readonly visibilityState: string },
): () => void {
  const aoFechar = () => fila.enviarTodas(true);
  const aoEsconder = () => {
    if (documento.visibilityState === 'hidden') fila.enviarTodas(true);
  };
  janela.addEventListener('pagehide', aoFechar);
  documento.addEventListener('visibilitychange', aoEsconder);
  return () => {
    janela.removeEventListener('pagehide', aoFechar);
    documento.removeEventListener('visibilitychange', aoEsconder);
  };
}

// ── resumo do dia ───────────────────────────────────────────

type Quando = 'hoje' | 'ontem';
type Numero = ResumoCrmView['numbers'][number];

/** As 5 linhas do resumo (UX §3.1.6), nesta ordem; `mudancas_etapa_destino` vira a 2ª linha das etapas. */
const LINHAS_RESUMO: { chave: string; rotulo: string; zero?: (q: Quando) => string }[] = [
  { chave: 'leads_novos', rotulo: 'Leads novos', zero: (q) => `Nenhum lead criado ${q}.` },
  { chave: 'mudancas_etapa', rotulo: 'Mudanças de etapa', zero: (q) => `Nenhum lead mudou de etapa ${q}.` },
  { chave: 'freela', rotulo: 'No Freela' },
  { chave: 'mensagens_enviadas', rotulo: 'Mensagens enviadas', zero: (q) => `Nenhuma mensagem enviada ${q}.` },
  { chave: 'respostas', rotulo: 'Respostas registradas', zero: (q) => `Nenhuma resposta registrada ${q}.` },
];

export const SEM_FREELA = 'Precisa da conexão com o Freela.';

export interface LinhaResumo {
  chave: string;
  rotulo: string;
  /** O número escrito, ou "—" quando não dá para contar (Freela sem a conexão, achado 5). */
  numero: string;
  conta: string;
  extra?: string;
}

const semConexao = (n: Numero, freelaConfigurado: boolean) => n.value === null || (n.key === 'freela' && !freelaConfigurado);

/**
 * Número, conta e 2ª linha de cada número do resumo. A API manda a conta pronta (`formula`, "12 = 8 da busca + …"); a tela só troca o
 * zero pela frase do dia e o Freela sem conexão por "—" (nunca "0", que pareceria resultado ruim).
 */
export function linhasDoResumo(r: ResumoCrmView, quando: Quando): LinhaResumo[] {
  const porChave = new Map(r.numbers.map((n) => [n.key, n]));
  const linhas: LinhaResumo[] = [];
  for (const def of LINHAS_RESUMO) {
    const n = porChave.get(def.chave);
    if (!n) continue;
    if (semConexao(n, r.freela_configured)) {
      linhas.push({ chave: def.chave, rotulo: def.rotulo, numero: '—', conta: n.key === 'freela' ? SEM_FREELA : n.formula });
      continue;
    }
    const valor = n.value ?? 0;
    const numero = valor.toLocaleString('pt-BR');
    if (valor === 0 && def.zero) {
      linhas.push({ chave: def.chave, rotulo: def.rotulo, numero, conta: def.zero(quando) });
      continue;
    }
    let conta = n.formula;
    let extra: string | undefined;
    if (def.chave === 'mensagens_enviadas' && n.parts.some((p) => p.label.includes('Freela') && p.value > 0)) {
      conta = `${conta}. O Praça não sabe se chegaram no WhatsApp.`;
    }
    if (def.chave === 'respostas') conta = 'Só conta a resposta registrada no Praça: o WhatsApp não avisa.';
    if (def.chave === 'mudancas_etapa') {
      const destino = (porChave.get('mudancas_etapa_destino')?.parts ?? []).filter((p) => p.value > 0);
      if (destino.length) extra = `Para: ${destino.map((p) => `${p.label.replace(/^para /, '')} ${p.value}`).join(' · ')}`;
    }
    linhas.push({ chave: def.chave, rotulo: def.rotulo, numero, conta, ...(extra ? { extra } : {}) });
  }
  return linhas;
}

/** Todos os números zerados (ou sem conexão): o resumo de hoje vira "Ainda não aconteceu nada hoje." (achado 2). */
export const resumoZerado = (r: ResumoCrmView): boolean => r.numbers.every((n) => !n.value || semConexao(n, r.freela_configured));

/** "ⓘ De onde vem": a fonte de cada número, uma vez (as duas linhas das etapas têm a mesma). */
export function fontesDoResumo(r: ResumoCrmView): { rotulo: string; texto: string }[] {
  const porChave = new Map(r.numbers.map((n) => [n.key, n]));
  return LINHAS_RESUMO.flatMap((def) => {
    const n = porChave.get(def.chave);
    return n ? [{ rotulo: def.rotulo, texto: n.source }] : [];
  });
}
