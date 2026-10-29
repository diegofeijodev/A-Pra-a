/**
 * Foco quando uma linha sai da lista (UX §3.1.8), o mesmo em Tarefas e na fila da Entrada: nunca cai no `body` (WCAG 2.4.3). Mexe no
 * DOM (por isso mora aqui, não em `domain/`); a tela chama `proximoFoco` no `antesDeSumir` de `useAcoesAdiadas`, com a linha ainda na
 * página, e foca o seletor depois que ela sai.
 */

/**
 * Para onde vai o foco quando a linha `chave` (`li[data-chave]`) sair: o nome da linha seguinte (ou da anterior); se a lista do grupo
 * acabou, o h2 de outro grupo (`section[data-grupo]`, o seguinte ou o anterior, com `id="grupo-{grupo}"`); senão `vazio`, o seletor do
 * aviso de lista vazia (com `tabIndex={-1}`). `null` = o foco não estava nesta linha: não mexe.
 */
export function proximoFoco(chave: string, vazio: string): string | null {
  const li = document.querySelector<HTMLElement>(`li[data-chave="${CSS.escape(chave)}"]`);
  const ativo = document.activeElement;
  if (!li || (ativo && ativo !== document.body && !li.contains(ativo))) return null;
  const vizinha = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null;
  if (vizinha?.dataset.chave) return `li[data-chave="${CSS.escape(vizinha.dataset.chave)}"] [data-foco-linha]`;
  // Outro grupo antes do aviso de vazio: em Tarefas, as mensagens da cadência (só leitura) seguram a tela sem o "Tudo em dia".
  const secao = li.closest<HTMLElement>('section[data-grupo]');
  if (!secao) return vazio;
  const irmas = [...document.querySelectorAll<HTMLElement>('section[data-grupo]')].filter((s) => s !== secao);
  const depois = irmas.find((s) => secao.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
  const alvo = depois ?? irmas[irmas.length - 1];
  return alvo ? `#grupo-${alvo.dataset.grupo}` : vazio;
}

/** Foca sem a página pular (a linha seguinte ocupa o lugar da que saiu); só rola se o alvo estiver fora da tela. */
export function focarSemPular(seletor: string): void {
  const alvo = document.querySelector<HTMLElement>(seletor);
  if (!alvo) return;
  alvo.focus({ preventScroll: true });
  const r = alvo.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) alvo.scrollIntoView({ block: 'nearest' });
}
