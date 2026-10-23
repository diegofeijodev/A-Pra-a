'use client';

import { ContatoLinks } from '@/components/praca/ContatoLinks';
import { useRetornosCampo } from '@/modules/campo/application/use-campo';
import { diaCurto, rotuloVencimentoComHora, type FollowupView } from '@/modules/consultores/domain/atencao';

/** Quantos retornos aparecem direto; o resto fica atrás de um toque para não empurrar o botão de check-in. */
const VISIVEIS = 3;

function Retorno({ f }: { f: FollowupView }) {
  return (
    <>
      <p className="text-base font-bold">{f.lead_name}</p>
      <p className={`text-sm font-bold ${f.due === 'atrasado' ? 'text-warning' : 'text-success'}`}>
        {f.due === 'atrasado' ? '⚠ ' : '✓ '}
        {rotuloVencimentoComHora(f)} ({diaCurto(f.followup_date)})
      </p>
      <p className="text-sm">{f.followup_what || 'Sem descrição do retorno.'}</p>
      {f.address && <p className="text-sm text-muted-foreground">{f.address}</p>}
      <ContatoLinks phone={f.phone} nome={f.lead_name} />
      {f.contact_phone && (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-sm text-muted-foreground">
            Quem atendeu{f.interlocutor_name ? `: ${f.interlocutor_name}` : ''} · {f.contact_phone_masked}
            {f.contact_email ? ` · ${f.contact_email}` : ''}
          </p>
          <ContatoLinks phone={f.contact_phone} nome={f.interlocutor_name ?? f.lead_name} />
        </div>
      )}
    </>
  );
}

/** "Retornos de hoje" do consultor: só os das próprias visitas; ligar e WhatsApp são links que ele mesmo abre. */
export function RetornosCampo() {
  const { data, isPending, isError, refetch } = useRetornosCampo();

  if (isPending) return <p className="text-sm text-muted-foreground">Carregando os retornos…</p>;
  if (isError) {
    return (
      <section className="card-surface space-y-2 p-4" role="alert">
        <p className="text-sm">Não carregamos os retornos agora (sem sinal?). Suas visitas continuam funcionando.</p>
        <button type="button" onClick={() => void refetch()} className="h-12 w-full rounded-md border border-border text-sm font-bold">
          Tentar de novo
        </button>
      </section>
    );
  }
  if (data.items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum retorno para hoje nem atrasado.</p>;
  }
  return (
    <section aria-labelledby="retornos-campo-titulo" className="space-y-2">
      <h2 id="retornos-campo-titulo" className="tag text-muted-foreground">
        Retornos de hoje e atrasados ({data.total})
      </h2>
      <ul className="space-y-2">
        {data.items.slice(0, VISIVEIS).map((f) => (
          <li key={f.visit_id} className="card-surface space-y-1 p-3">
            <Retorno f={f} />
          </li>
        ))}
      </ul>
      {data.items.length > VISIVEIS && (
        <details>
          <summary className="flex h-12 cursor-pointer items-center justify-center rounded-md border border-border text-sm font-bold">
            Ver os outros {data.items.length - VISIVEIS}
          </summary>
          <ul className="mt-2 space-y-2">
            {data.items.slice(VISIVEIS).map((f) => (
              <li key={f.visit_id} className="card-surface space-y-1 p-3">
                <Retorno f={f} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
