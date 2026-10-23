'use client';

import { useGanhosCampo } from '@/modules/remuneracao/application/use-remuneracao';
import { brl, rotuloDia, rotuloSemana } from '@/modules/remuneracao/domain/remuneracao';

/**
 * Ganhos do consultor (contrato §28.6): "Confirmado pelo Freela" (paga) separado de "Ainda não confirmado"
 * (não entra na conta), toda conta escrita e a data absoluta do Pix. Sem a flag no servidor, não aparece.
 */
export function GanhosCard() {
  const g = useGanhosCampo();
  if (!g.ligado) return null;
  if (g.isPending) return <div className="card-surface h-28 animate-pulse p-4" aria-label="Carregando seus ganhos" />;
  if (g.isError || !g.data) {
    return (
      <section className="card-surface space-y-2 p-4">
        <p className="text-base font-bold">Ganhos</p>
        <p className="text-sm text-muted-foreground">Não conseguimos carregar seus ganhos. Tente de novo.</p>
        <button type="button" onClick={() => void g.refetch()} className="min-h-12 rounded-md border border-border px-4 text-sm font-bold">
          Tentar de novo
        </button>
      </section>
    );
  }
  const { today, week, unconfirmed, pix, previous_weeks: anteriores } = g.data;
  const declarado = g.data.signup_source === 'declared';
  return (
    <section className="card-surface space-y-3 p-4" aria-label="Seus ganhos">
      <div>
        <p className="tag text-muted-foreground">{declarado ? 'Cadastro declarado' : 'Confirmado pelo Freela'} · hoje, {rotuloDia(today.day)}</p>
        <p className="text-3xl font-black">{brl(today.total_cents)}</p>
        <p className="text-sm text-muted-foreground">
          {declarado
            ? today.confirmed_signups === 0
              ? 'Nenhum cadastro declarado hoje ainda.'
              : `${today.confirmed_signups} ${today.confirmed_signups === 1 ? 'cadastro declarado' : 'cadastros declarados'} hoje.`
            : today.confirmed_signups === 0
              ? 'Nenhum cadastro confirmado hoje ainda.'
              : `${today.confirmed_signups} ${today.confirmed_signups === 1 ? 'cadastro confirmado' : 'cadastros confirmados'} hoje.`}
        </p>
      </div>

      <details>
        <summary className="min-h-12 cursor-pointer text-sm font-bold leading-[3rem]">Ver a conta de hoje</summary>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {today.conta.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">Fonte: {g.data.source}.</p>
        {g.data.rule && <p className="mt-1 text-sm text-muted-foreground">Vale para você: {g.data.rule.label}.</p>}
      </details>

      <div className="rounded-md border border-border p-3">
        <p className="tag text-muted-foreground">{declarado ? 'Conferência com o Freela' : 'Ainda não confirmado'}</p>
        <p className="text-sm">
          {declarado
            ? 'Os cadastros que você declara entram na conta na hora. A equipe confere com o Freela e anula o que não existir, com o motivo registrado.'
            : unconfirmed.text}
        </p>
      </div>

      {g.data.month && (
        <div className="rounded-md border border-border p-3" aria-label="Meta do mês">
          <p className="tag text-muted-foreground">Meta do mês · {g.data.month.label}</p>
          <p className="text-base font-bold">{g.data.month.text}</p>
          <details>
            <summary className="min-h-12 cursor-pointer text-sm font-bold leading-[3rem]">Ver a conta do mês</summary>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {g.data.month.conta.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      <div>
        <p className="tag text-muted-foreground">Semana · {rotuloSemana(week.from, week.to)}</p>
        <p className="text-2xl font-black">{brl(week.total_cents)} até agora</p>
        <p className="text-sm text-muted-foreground">{pix.text}</p>
      </div>

      <details>
        <summary className="min-h-12 cursor-pointer text-sm font-bold leading-[3rem]">Ver a conta da semana e semanas anteriores</summary>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {week.conta.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {anteriores.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {anteriores.map((w) => (
              <li key={w.from}>
                {rotuloSemana(w.from, w.to)}: <span className="font-bold">{brl(w.total_cents)}</span> ({w.status === 'closed' ? 'fechada' : 'em aberto'})
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
