'use client';

import Link from 'next/link';
import { DeclaracoesEquipe } from '@/components/praca/DeclaracoesEquipe';

export default function DeclaradosPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-extrabold">Cadastros declarados</h1>
        <Link href="/consultores" className="text-sm text-primary hover:underline">
          ← Consultores
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        O que os consultores declararam como “Cadastrou agora” na visita, conferido com o que o Freela confirmou. Anule o que não existir; o motivo fica registrado.
      </p>
      <DeclaracoesEquipe />
    </>
  );
}
