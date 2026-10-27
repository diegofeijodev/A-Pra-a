import { Construction } from 'lucide-react';

/**
 * "Em construção" da Lovable (`components/EmBreve.tsx`): título da tela + cartão tracejado. `children` entra embaixo do cartão
 * (o atalho que a tela tiver, decisão D5).
 */
export function EmBreve({ titulo, descricao, children }: { titulo: string; descricao: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">{titulo}</h1>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-card">
        <Construction className="h-10 w-10 text-primary" aria-hidden />
        <p className="font-medium">Em construção</p>
        <p className="max-w-md text-sm text-muted-foreground">{descricao}</p>
      </div>
      {children}
    </div>
  );
}
