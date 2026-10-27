'use client';

import { todaySp } from '@/lib/dates';
import { useCampoSession } from '@/modules/campo/application/campo-session.store';
import { saudacao, subtituloHoje } from '@/modules/campo/domain/hoje-tela';

/**
 * Título da visão Hoje (Lovable `inicio.tsx`, UX §4.12): "Bom trabalho, {primeiro nome}!" e, embaixo, o dia e a praça ativa
 * (com várias praças, a da jornada — lote F2). Fica num `header` dentro do `main`: é onde a praça do dia é procurada.
 */
export function CabecalhoHoje({ praca }: { praca: string }) {
  const nome = useCampoSession((s) => s.session?.consultant.name);
  return (
    <header>
      <h1 className="text-3xl font-semibold">{saudacao(nome)}</h1>
      <p className="text-muted-foreground">{subtituloHoje(todaySp(), praca)}</p>
    </header>
  );
}
