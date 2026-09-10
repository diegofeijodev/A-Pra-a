'use client';

import { useState } from 'react';
import { fmtDateTime } from '@/lib/dates';
import { maskPhone, RecipientTag } from './FreelaBits';
import { useFreelaCampaign } from '@/modules/freela/application/use-freela';

/** Linhas por página na tabela — a rota traz os 50 primeiros destinatários. */
const POR_PAGINA = 10;

/**
 * Os destinatários de uma campanha, lidos AO VIVO do Freela (§18.2): quem
 * recebeu, quem falhou e por quê. O espelho local não guarda destinatário —
 * guardar seria manter uma segunda lista de gente real sincronizada à toa.
 *
 * A rota devolve a **primeira página** (50) mais `recipients_meta.total`; a
 * paginação daqui anda dentro dessas 50 linhas e a tela diz em voz alta quando
 * a campanha tem mais gente do que isso.
 */
export function FreelaCampaignDetail({ freelaId }: { freelaId: string }) {
  const { data, isPending, isError, error } = useFreelaCampaign(freelaId);
  const [page, setPage] = useState(1);

  if (isPending) {
    return <div className="border-t border-border p-3 text-xs text-muted-foreground">Carregando…</div>;
  }
  if (isError || !data) {
    return (
      <div className="border-t border-border p-3 text-xs text-danger">
        {error instanceof Error ? error.message : 'Não foi possível ler os destinatários.'}
      </div>
    );
  }

  const lidos = data.recipients;
  const total = data.recipients_meta?.total ?? lidos.length;
  const paginas = Math.max(1, Math.ceil(lidos.length / POR_PAGINA));
  const atual = Math.min(page, paginas);
  const linhas = lidos.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);

  return (
    <div className="border-t border-border p-3">
      {/* Campanha em rascunho é campanha que NÃO está saindo — a tela precisa
          dizer isso, senão o operador espera um envio que nunca começou. */}
      {data.campaign.status === 'DRAFT' && (
        <p className="mb-2 rounded-md bg-warning/12 px-3 py-2 text-[11px] text-warning">
          Esta campanha está em rascunho no Freela: nada sai até alguém iniciar.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        {total} destinatário(s) no Freela
        {lidos.length < total && ` · mostrando os ${lidos.length} primeiros`}
      </p>

      {lidos.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nenhum destinatário ainda — a campanha pode ter acabado de nascer.
        </p>
      ) : (
        <>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1">Nome</th>
                <th className="py-1">Telefone</th>
                <th className="py-1">Situação</th>
                <th className="py-1">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-2">{r.name || '—'}</td>
                  <td className="py-1.5 pr-2 font-mono text-[11px]">{maskPhone(r.phone)}</td>
                  <td className="py-1.5 pr-2">
                    <RecipientTag status={r.status} />
                    {r.sentAt && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {fmtDateTime(r.sentAt)}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{r.failureReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {paginas > 1 && (
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <button
                onClick={() => setPage(Math.max(1, atual - 1))}
                disabled={atual === 1}
                className="rounded border border-border px-2 py-1 disabled:opacity-40"
              >
                anterior
              </button>
              <span className="text-muted-foreground">
                página {atual} de {paginas}
              </span>
              <button
                onClick={() => setPage(Math.min(paginas, atual + 1))}
                disabled={atual === paginas}
                className="rounded border border-border px-2 py-1 disabled:opacity-40"
              >
                próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
