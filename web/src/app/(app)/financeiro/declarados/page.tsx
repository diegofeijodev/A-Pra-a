'use client';

import Link from 'next/link';
import { DeclaracoesEquipe } from '@/components/praca/DeclaracoesEquipe';
import { ROTA } from '@/modules/acesso/domain/enderecos';

/** Cadastros declarados (lote S3): também é a 2ª aba do Financeiro (E5.7); `/consultores/declarados` redireciona para cá (E7). */
export default function DeclaradosPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Cadastros declarados</h1>
          <p className="text-muted-foreground">
            O que os representantes declararam como “Cadastrou agora” na visita, conferido com o que o Freela confirmou. Anule o que não existir; o motivo fica registrado.
          </p>
        </div>
        <Link href={ROTA.financeiro} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline md:min-h-0">
          ← Financeiro
        </Link>
      </div>
      <DeclaracoesEquipe />
    </div>
  );
}
