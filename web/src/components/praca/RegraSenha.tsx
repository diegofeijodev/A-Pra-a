'use client';

import { conferirRegras, type Politica } from '@/modules/acesso/domain/senha';

/**
 * Regra da senha NOVA marcada enquanto se digita (contrato §41.2, UX §3.9 K4): ícone + texto (cor nunca sozinha). Só aparece com a
 * regra ligada no servidor; desligada, nada (o formulário é o de hoje).
 */
export function RegraSenha({ id, senha, politica, compacta = false }: { id: string; senha: string; politica: Politica | undefined; compacta?: boolean }) {
  if (!politica?.enabled) return null;
  const regras = conferirRegras(senha, politica);
  return (
    <ul id={id} aria-live="polite" className={compacta ? 'flex flex-wrap gap-x-3 text-[11px]' : 'space-y-1 text-sm'}>
      {regras.map((r) => (
        <li key={r.key} className={r.ok ? 'text-success' : 'text-muted-foreground'}>
          <span aria-hidden>{r.ok ? '✓' : '✕'}</span> {r.label}
          <span className="sr-only">{r.ok ? ' (ok)' : ' (falta)'}</span>
        </li>
      ))}
    </ul>
  );
}
