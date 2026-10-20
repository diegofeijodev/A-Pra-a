'use client';

import type { ReactNode } from 'react';

/**
 * Chip grande do fluxo simples (alvo ≥ 56 px, UX §2.5): `role="radio"`; o escolhido tem ícone ✓, borda de 3 px e
 * fundo cheio — não só cor (WCAG 1.4.1). Use dentro de um `Grupo`.
 */
export function Chip({
  ativo,
  onEscolher,
  children,
  desabilitado,
  className = '',
}: {
  ativo: boolean;
  onEscolher: () => void;
  children: ReactNode;
  desabilitado?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      disabled={desabilitado}
      onClick={onEscolher}
      className={`simples-chip flex items-center justify-center gap-2 disabled:opacity-50 ${className}`}
    >
      {ativo && <span aria-hidden>✓</span>}
      <span>{children}</span>
    </button>
  );
}

/** Grupo de escolha única: 2 colunas, 8 px entre os chips. O `aria-live` anuncia a sub-escolha que abre. */
export function Grupo({ rotulo, children, colunas = 2 }: { rotulo: string; children: ReactNode; colunas?: 1 | 2 | 3 }) {
  const cols = colunas === 1 ? 'grid-cols-1' : colunas === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div role="radiogroup" aria-label={rotulo} className={`grid ${cols} gap-2`}>
      {children}
    </div>
  );
}
