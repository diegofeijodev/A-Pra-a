/**
 * Título das visões de tarefa do representante (redesenho E5c, UX §2.5): só o `h1`. Quem está logado, a praça e o "Sair" moram
 * na faixa azul da casca (`FaixaRepresentante`) e na saudação da Hoje — não se repetem em cada tela.
 */
export function CampoTopo({ titulo, grande = false }: { titulo: string; grande?: boolean }) {
  return (
    <header>
      <h1 className={grande ? 'text-3xl font-semibold' : 'text-lg font-semibold'}>{titulo}</h1>
    </header>
  );
}
